const pi = Math.PI;
const tau = 2 * pi;
const c0 = 299792458;
const e0 = 8.8541878128e-12;
const m0 = 1.25663706212e-6;
const z0 = Math.sqrt(m0 / e0);
const electric = "#ff896a";
const magnetic = "#51e7ce";
const direction = "#77a9ff";
const violet = "#b99cff";
const gold = "#f4cd7b";
const guide = "#3e648b";
const fixed = (n, digits = 2) => Number(n).toFixed(digits);
const range = (key, label, min, max, step, value, unit) => ({ key, label, min, max, step, value, unit });
const choice = (key, label, values, value) => ({ key, label, options: values.map(([value, label]) => ({ value, label })), value });
const legend = (key, label, color) => ({ key, label, color });
const readout = (label, value, unit) => ({ label, value, unit });
const series = (label, color, a, b, sample, count = 120) => ({
  label, color,
  points: Array.from({ length: count + 1 }, (_, i) => {
    const x = a + (b - a) * i / count;
    return [x, sample(x)];
  }),
});
const curve = (a, b, sample, count = 120) => Array.from({ length: count + 1 }, (_, i) => sample(a + (b - a) * i / count));
const ring = (x, radius) => curve(0, tau, u => [x, radius * Math.cos(u), radius * Math.sin(u)], 48);
const plot = (title, xLabel, yLabel, series, yMin, yMax) => ({ title, xLabel, yLabel, series, yMin, yMax });
const DEG = pi / 180;

function moveArrow(THREE, object, origin, vector, max = Infinity) {
  const norm = Math.hypot(...vector);
  object.visible = norm > 0.015;
  object.position.set(...origin);
  if (!object.visible) return;
  object.setDirection(new THREE.Vector3(...vector).multiplyScalar(1 / norm));
  const length = Math.min(max, norm);
  object.setLength(length, Math.min(0.19, length * 0.39), Math.min(0.115, length * 0.32));
}

function animatedTrace(ctx, parent, color, radius = 0.034, segments = 120) {
  const { THREE } = ctx;
  const sides = 8;
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array((segments + 1) * sides * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const indices = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides;
      const c = a + sides, d = b + sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  geometry.setAttribute("position", positions);
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  parent.add(mesh);
  const center = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const refY = new THREE.Vector3(0, 1, 0);
  const refZ = new THREE.Vector3(0, 0, 1);
  const offsets = Array.from({ length: sides }, (_, index) => {
    const theta = tau * index / sides;
    return [radius * Math.cos(theta), radius * Math.sin(theta)];
  });
  return (sample) => {
    const points = curve(0, 1, sample, segments);
    for (let i = 0; i <= segments; i++) {
      center.set(...points[i]);
      previous.set(...points[Math.max(i - 1, 0)]);
      tangent.set(...points[Math.min(i + 1, segments)]).sub(previous).normalize();
      normal.crossVectors(tangent, Math.abs(tangent.y) > 0.92 ? refZ : refY).normalize();
      binormal.crossVectors(tangent, normal);
      for (let j = 0; j < sides; j++) {
        const [a, b] = offsets[j];
        positions.setXYZ(i * sides + j, center.x + a * normal.x + b * binormal.x,
          center.y + a * normal.y + b * binormal.y, center.z + a * normal.z + b * binormal.z);
      }
    }
    positions.needsUpdate = true;
  };
}

function planeSection(ctx, parent, x, half, color = guide) {
  const corner = [[x, -half, -half], [x, half, -half], [x, half, half], [x, -half, half], [x, -half, -half]];
  ctx.box(parent, [x, 0, 0], [0.016, half * 2, half * 2], color, 0.045);
  ctx.line(parent, corner, color, 0.58);
  for (const u of [-0.5, 0, 0.5]) {
    ctx.line(parent, [[x, -half, u * half], [x, half, u * half]], color, 0.22);
    ctx.line(parent, [[x, u * half, -half], [x, u * half, half]], color, 0.22);
  }
}

function disk(ctx, parent, x, radius, depth, color, opacity) {
  const { THREE } = ctx;
  const geometry = new THREE.CylinderGeometry(radius, radius, depth, 64);
  const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.z = pi / 2;
  mesh.position.x = x;
  parent.add(mesh);
  return mesh;
}

const maxwell = {
  id: "maxwell-capacitor", chapter: 5, title: "麦克斯韦方程与位移电流",
  description: "观察交变电容器的板间电场、导线电流及环绕磁场如何连续衔接。",
  topics: ["法拉第定律", "全电流定律", "位移电流", "麦克斯韦方程"],
  params: [range("amp", "板间峰值电场", 1, 20, 1, 8, "kV/m"), range("f", "激励频率", 1, 100, 1, 20, "kHz"),
    range("r", "极板半径", 2, 12, 0.5, 6, "cm")],
  legend: [legend("e", "板间 E", electric), legend("h", "环向 H", magnetic), legend("j", "导线传导电流", direction)],
  equation: "∇·D = ρf；∇·B = 0；∇×E = −∂B/∂t；∇×H = Jf + ∂D/∂t",
  explanation: "圆形平板电容器内近似为均匀场。对围住导线的同一闭合路径，取穿过导线的曲面得到传导电流，取穿过极板间隙的曲面则得到位移电流，两者的总电流相同。积分式的磁场环量 ∮H·dl 等于曲面全电流；无源区域可由麦克斯韦方程得到波动方程，且电磁场具有对偶性。采用 eʲωᵗ 约定时，∂/∂t 对应 jω。",
  task: "逐步增大频率，比较位移电流的峰值与环向磁场。寻找 E 过零而 H 达峰值的时刻。",
  metrics(p) {
    const area = pi * (p.r / 100) ** 2;
    const j = e0 * p.amp * 1e3 * tau * p.f * 1e3;
    return [readout("位移电流峰值", fixed(area * j * 1e3, 3), "mA"),
      readout("边缘磁场峰值", fixed(p.r / 100 * j * 500, 3), "mA/m"),
      readout("位移电流密度峰值", fixed(j * 1e3, 2), "mA/m²")];
  },
  chart(p, t) {
    return plot("板间场与位移电流的相位差", "相位 / °", "归一化幅度", [
      series("E / E₀", electric, 0, 360, x => Math.sin(x * DEG)),
      series("Iᴅ / I₀", magnetic, 0, 360, x => Math.cos(x * DEG)),
      { label: "当前相位", color: direction, points: [[(t * 72) % 360, -1.12], [(t * 72) % 360, 1.12]] },
    ], -1.2, 1.2);
  },
  build(ctx, p) {
    const { THREE, group } = ctx;
    const e = ctx.layer("e"), h = ctx.layer("h"), j = ctx.layer("j");
    const radius = 1.2 + p.r * 0.105;
    for (const sign of [-1, 1]) {
      disk(ctx, group, sign * 1.12, radius, 0.13, guide, 0.78);
      ctx.tube(group, ring(sign * 1.12, radius), direction, 0.024);
      ctx.tube(group, [[sign * 1.18, 0, 0], [sign * 5.5, 0, 0]], guide, 0.07);
    }
    const rays = [];
    for (const y of [-0.62, 0, 0.62]) for (const z of [-0.62, 0, 0.62]) rays.push([y * radius, z * radius, ctx.arrow(e, [0, 0, 0], [1, 0, 0], 1, electric)]);
    const rings = [];
    for (const r of [0.54 * radius, 0.93 * radius, 1.28 * radius]) {
      ctx.line(h, ring(0, r), magnetic, 0.5);
      for (const angle of [0.32, 1.9, 3.45, 5.05]) {
        rings.push([r, angle, ctx.arrow(h, [0, 0, 0], [0, 1, 0], 0.5, magnetic)]);
      }
    }
    const current = [-3.4, 3.4].map(x => ctx.arrow(j, [x, 0, 0], [1, 0, 0], 1, direction));
    ctx.label(e, "电场 E", [0, radius + 0.32, 0], electric);
    ctx.label(h, "环向 H", [0, -radius * 1.36 - 0.18, 0], magnetic);
    ctx.label(j, "I", [3.8, 0.35, 0], direction);
    return t => {
      const phase = t * tau / 5;
      const field = 1.72 * Math.sin(phase) * (0.5 + 0.5 * p.amp / 20);
      const flow = Math.cos(phase) * (0.42 + 0.58 * p.f / 100) * (0.7 + 0.3 * p.amp / 20);
      for (const [y, z, arrow] of rays) moveArrow(THREE, arrow, [-field / 2, y, z], [field, 0, 0]);
      for (const [r, angle, arrow] of rings) {
        moveArrow(THREE, arrow, [0, r * Math.cos(angle), r * Math.sin(angle)], [0, -0.73 * Math.sin(angle) * flow, 0.73 * Math.cos(angle) * flow]);
      }
      current.forEach((arrow, i) => moveArrow(THREE, arrow, [i ? 3.4 : -3.4, 0, 0], [1.55 * flow, 0, 0]));
    };
  },
};

function eddyData(p) {
  const r = p.r / 100;
  const emf = pi * r ** 2 * tau * p.f * p.b * 1e-3;
  const resistance = tau * r / (p.sigma * p.area);
  return { emf, resistance, current: emf / resistance, power: emf ** 2 / (2 * resistance),
    skin: Math.sqrt(2 / (tau * p.f * m0 * p.sigma * 1e6)) };
}

const faraday = {
  id: "faraday-eddy", chapter: 5, title: "法拉第感应与涡流",
  description: "用交变磁通驱动导电环，对照感应电动势、环向电流与焦耳热。",
  topics: ["法拉第定律", "楞次定律", "涡流与加热", "电涡流位移传感"],
  params: [range("b", "磁场幅值", 0.5, 10, 0.5, 2, "mT"), range("f", "频率", 20, 1000, 10, 100, "Hz"),
    range("r", "导电环半径", 2, 8, 0.5, 5, "cm"), range("area", "导体截面积", 0.1, 0.8, 0.1, 0.2, "mm²"),
    range("sigma", "电导率", 1, 58, 1, 36, "MS/m")],
  legend: [legend("b", "外加磁场 B", magnetic), legend("j", "感应电流", electric), legend("heat", "瞬时热耗散", gold)],
  equation: "ℰ = ∮E·dl = −dΦᴮ/dt；I ≈ ℰ/R；P̄ ≈ ℰ₀²/(2R)",
  explanation: "导电环近似为均匀轴向磁场中的纯电阻闭合回路，忽略自感与磁场反作用。块体导体可把这些闭合路径视作涡流的定性模型。涡流加热与 J²/σ 有关。实际位移传感器由被测导体改变线圈复阻抗来感知距离，几何复杂或趋肤显著时需用数值场模型。",
  task: "改变频率或电导率，比较感应电流和平均热功率。在磁通达到最大时，验证感应电流瞬时过零。",
  metrics(p) {
    const { emf, current, power, skin } = eddyData(p);
    return [readout("峰值电动势", fixed(emf * 1e3, 2), "mV"), readout("峰值环电流", fixed(current, 3), "A"),
      readout("平均热功率", fixed(power * 1e3, 2), "mW"), readout("参考趋肤深度", fixed(skin * 1e3), "mm")];
  },
  chart(p, t) {
    return plot("磁通变化与感应电流", "相位 / °", "归一化幅度", [
      series("Φᴮ / Φ₀", magnetic, 0, 360, x => Math.sin(x * DEG)),
      series("I / I₀", electric, 0, 360, x => -Math.cos(x * DEG)),
      series("P / P₀", gold, 0, 360, x => Math.cos(x * DEG) ** 2),
      { label: "当前相位", color: direction, points: [[(t * 72) % 360, -1.12], [(t * 72) % 360, 1.12]] },
    ], -1.2, 1.2);
  },
  build(ctx, p) {
    const { THREE, group } = ctx;
    const b = ctx.layer("b"), j = ctx.layer("j"), heat = ctx.layer("heat");
    const radius = 1.22 + p.r * 0.16;
    const loop = ring(0, radius);
    ctx.tube(group, loop, guide, 0.095);
    ctx.tube(j, loop, electric, 0.037, 0.78);
    const glow = ctx.tube(heat, loop, gold, 0.137, 0.26);
    const rays = [];
    for (const y of [-0.53, 0, 0.53]) for (const z of [-0.53, 0, 0.53]) rays.push([y * radius, z * radius, ctx.arrow(b, [0, 0, 0], [1, 0, 0], 1, magnetic)]);
    const tangents = Array.from({ length: 12 }, (_, i) => ctx.arrow(j, loop[4 * i], [0, 1, 0], 0.45, electric));
    ctx.label(b, "B(t)", [2.65, 0.35, 0], magnetic);
    ctx.label(j, "感应电流", [0, radius + 0.35, 0], electric);
    const strength = 0.4 + 0.6 * Math.tanh(eddyData(p).current / 4);
    return t => {
      const angle = t * tau / 5;
      const field = (1.7 + 1.6 * p.b / 10) * Math.sin(angle);
      for (const [y, z, arrow] of rays) moveArrow(THREE, arrow, [-field / 2, y, z], [field, 0, 0]);
      const current = -Math.cos(angle) * strength;
      tangents.forEach((arrow, i) => {
        const phase = tau * i / tangents.length;
        moveArrow(THREE, arrow, loop[4 * i], [0, -0.77 * Math.sin(phase) * current, 0.77 * Math.cos(phase) * current]);
      });
      if (glow?.material) glow.material.opacity = Math.cos(angle) ** 2 * 0.58 * strength;
    };
  },
};

function boundaryData(p) {
  const e2n = (60 + p.rho * 1e-12 / e0) / p.er;
  return { e2n, h2n: 0.035 / p.mr, h2t: 0.08 + p.js / 1000 };
}

const boundary = {
  id: "dynamic-boundary", chapter: 5, title: "时变场的分界面条件",
  animated: false,
  liveChart: false,
  description: "调节表面电荷、面电流和材料参数，逐项检查 E、D、H、B 的跳变。",
  topics: ["切向电场", "法向电位移", "切向磁场", "法向磁感应强度"],
  params: [range("er", "右侧相对介电常数", 1, 8, 0.1, 3), range("mr", "右侧相对磁导率", 1, 6, 0.1, 2),
    range("rho", "自由面电荷密度", -400, 400, 10, 160, "pC/m²"), range("js", "自由面电流密度", -160, 160, 10, 60, "mA/m")],
  legend: [legend("e", "电场 E", electric), legend("h", "磁场 H", magnetic), legend("interface", "分界面与法向", direction)],
  equation: "n×ΔE = 0；n·ΔD = ρs；n×ΔH = Js；n·ΔB = 0",
  explanation: "法向 n 从媒质 1 指向媒质 2，Δ 表示右侧减左侧。图中给定某一时刻的左侧场与表面源；右侧场由小环路和小柱面所给出的局部边界条件确定。切向 E 与法向 B 连续，法向 D 和切向 H 的跳变由自由面源决定。",
  task: "将两类自由面源都设为零，再提高右侧介电常数与磁导率，检查哪些分量连续。",
  metrics(p) {
    const { e2n, h2n } = boundaryData(p);
    return [readout("E₂ 法向分量", fixed(e2n), "V/m"), readout("H₂ 法向分量", fixed(h2n * 1000, 1), "mA/m"),
      readout("D 法向跳变", p.rho, "pC/m²"), readout("H 切向跳变", p.js, "mA/m")];
  },
  chart(p) {
    const { e2n, h2n, h2t } = boundaryData(p);
    const step = (label, color, a, b) => ({ label, color, points: [[-1, a], [0, a], [0, b], [1, b]] });
    return plot("分界面两侧的归一化场分量", "法向位置 x", "相对左侧同分量", [
      step("Eₙ", electric, 1, e2n / 60), step("Eₜ", gold, 1, 1),
      step("Hₙ", magnetic, 1, h2n / 0.035), step("Hₜ", violet, 1, h2t / 0.08),
    ]);
  },
  build(ctx, p) {
    const { e2n, h2n, h2t } = boundaryData(p);
    const e = ctx.layer("e"), h = ctx.layer("h"), layer = ctx.layer("interface");
    planeSection(ctx, layer, 0, 2.58, direction);
    ctx.arrow(layer, [0, -1.8, 2.6], [1, 0, 0], 1.2, direction);
    ctx.label(layer, "媒质 1", [-3.6, 2.2, 0], direction);
    ctx.label(layer, "媒质 2", [3.6, 2.2, 0], direction);
    ctx.label(layer, "n", [1.5, -1.8, 2.6], direction);
    const left = [-3.35, 0, 0], right = [1.3, 0, 0];
    function vectors(parent, start, n, y, color, name) {
      const [x, , z] = start;
      ctx.sphere(parent, start, 0.07, color);
      const direction = [n, y, 0];
      if (Math.hypot(...direction) > 1e-4) ctx.arrow(parent, start, direction, Math.hypot(...direction), color);
      ctx.line(parent, [start, [x + n, start[1], z], [x + n, start[1] + y, z]], color, 0.62);
      ctx.label(parent, name, [x + n, start[1] + y + 0.28, z], color);
    }
    vectors(e, [left[0], 0.6, 1.05], 1.3, 0.9, electric, "E₁");
    vectors(e, [right[0], 0.6, 1.05], e2n / 60 * 1.3, 0.9, electric, "E₂");
    vectors(h, [left[0], -1.15, -0.7], 0.7, 0.83, magnetic, "H₁");
    vectors(h, [right[0], -1.15, -0.7], h2n / 0.035 * 0.7, h2t / 0.08 * 0.83, magnetic, "H₂");
    if (p.rho !== 0) {
      for (const y of [-1.7, -0.9, 0.9, 1.7]) for (const z of [-1.3, 0, 1.3]) {
        ctx.label(layer, p.rho > 0 ? "+" : "−", [0.04, y, z], gold);
      }
    }
    if (p.js !== 0) {
      ctx.arrow(layer, [0.04, 2.58, -0.6 * Math.sign(p.js)], [0, 0, Math.sign(p.js)], 0.75 + Math.abs(p.js) / 160 * 0.6, violet);
      ctx.label(layer, "Jₛ", [0, 2.86, 0], violet);
    }
    return () => {};
  },
};

function fieldsForReflection(x, phase, r, offset, k = 1.55) {
  const a = Math.cos(k * x - phase);
  const b = r * Math.cos(-k * x - phase + offset);
  return { e: a + b, h: a - b, s: a ** 2 - b ** 2 };
}

const poynting = {
  id: "poynting-vector", chapter: 5, title: "相量与坡印廷矢量",
  description: "比较入射波和反射波叠加后的 E、H 及能流，辨认平均功率与往返交换。",
  topics: ["时谐场", "复矢量", "坡印廷定理", "平均功率"],
  params: [range("r", "反射系数幅值", 0, 1, 0.01, 0.55), range("phase", "反射相位", -180, 180, 5, 0, "°"),
    range("probe", "探针位置", -5, 5, 0.1, 0.8, "λ/4")],
  legend: [legend("e", "电场 E", electric), legend("h", "磁场 H", magnetic), legend("s", "功率流 S", gold)],
  equation: "S(t) = E×H；S̃ = ½Ẽ×H̃*；∂u/∂t + ∇·S = −J·E",
  explanation: "正向和反向传播的平面波具有不同的 H 方向。两者叠加后，瞬时能流可以短暂反向。按 eʲωᵗ 约定计算的复坡印廷矢量，实部是平均功率密度，虚部反映局部无功交换。这里取真空、入射峰值 1 V/m，并用归一化长度与慢放时间展示相量关系。",
  task: "将反射幅度设为 1。平均功率应归零，尝试找出瞬时坡印廷矢量仍随时间变号的位置。",
  metrics(p, t) {
    const arg = pi * p.probe - p.phase * DEG;
    const field = fieldsForReflection(p.probe * pi / 3.1, t * 1.8, p.r, p.phase * DEG);
    return [readout("平均功率流", fixed((1 - p.r ** 2) * 500 / z0, 3), "mW/m²"),
      readout("探针瞬时功率流", fixed(field.s * 1e3 / z0, 3), "mW/m²"),
      readout("复功率流虚部", fixed(p.r * Math.sin(arg) * 1e3 / z0, 3), "mvar/m²")];
  },
  chart(p, t) {
    const x = p.probe * pi / 3.1;
    const value = phase => fieldsForReflection(x, phase * DEG, p.r, p.phase * DEG);
    const current = (t * 1.8 / DEG) % 360;
    return plot("探针处的瞬时能流", "相位 / °", "归一化场与功率", [
      series("E", electric, 0, 360, phase => value(phase).e),
      series("η₀H", magnetic, 0, 360, phase => value(phase).h),
      series("η₀S", gold, 0, 360, phase => value(phase).s),
      { label: "当前相位", color: direction, points: [[current, -2], [current, 2]] },
    ], -2.1, 2.1);
  },
  build(ctx, p) {
    const { THREE, group } = ctx;
    const e = ctx.layer("e"), h = ctx.layer("h"), s = ctx.layer("s");
    ctx.line(group, [[-5.9, 0, 0], [5.9, 0, 0]], direction, 0.52);
    const xProbe = p.probe * pi / 3.1;
    planeSection(ctx, group, xProbe, 1.95);
    ctx.label(group, "探针", [xProbe, 2.18, 0], direction);
    const traceE = animatedTrace(ctx, e, electric);
    const traceH = animatedTrace(ctx, h, magnetic);
    const arrows = curve(-5, 5, x => [x, ctx.arrow(s, [x, -1.95, 0], [1, 0, 0], 0.8, gold)], 12);
    const currentArrow = ctx.arrow(s, [xProbe, 0, 0], [1, 0, 0], 0.8, gold);
    return t => {
      const value = x => fieldsForReflection(x, t * 1.8, p.r, p.phase * DEG);
      traceE(u => { const x = 11.2 * (u - 0.5); return [x, 1.02 * value(x).e, 0]; });
      traceH(u => { const x = 11.2 * (u - 0.5); return [x, 0, 1.02 * value(x).h]; });
      for (const [x, arrow] of arrows) moveArrow(THREE, arrow, [x, -1.95, 0], [0.62 * value(x).s, 0, 0]);
      moveArrow(THREE, currentArrow, [xProbe, 0, 0], [1.24 * value(xProbe).s, 0, 0]);
    };
  },
};

function vacuumData(p) {
  const v = c0 / Math.sqrt(p.er * p.mr);
  const lambda = v / (p.f * 1e9);
  return { v, lambda, k: tau / lambda, eta: z0 * Math.sqrt(p.mr / p.er) };
}

const waveSpan = 0.68;
const waveLength = 11.35;
const wavePhase = t => t * 1.66;

const planeWave = {
  id: "plane-wave", chapter: 6, title: "自由空间中的均匀平面波",
  description: "在三维空间中观察电场、磁场与传播方向的正交关系，探索频率和媒质对波长的影响。",
  topics: ["无源波动方程", "电磁场横波", "波长与波数", "自由空间平面波"],
  params: [range("f", "频率 f", 0.25, 1.8, 0.05, 1, "GHz"), range("amp", "峰值电场 E₀", 0.25, 2, 0.05, 1, "V/m"),
    range("er", "相对介电常数 εᵣ", 1, 4, 0.1, 1), range("mr", "相对磁导率 μᵣ", 1, 3, 0.1, 1),
    choice("polar", "线极化方向", [["v", "垂直极化"], ["h", "水平极化"]], "v")],
  legend: [legend("e", "电场 E", electric), legend("h", "磁场 H", magnetic), legend("k", "传播方向 k", direction),
    legend("guides", "等相位截面", "#82a2d3")],
  equation: "E = êE₀ cos(kx−ωt)；H = (k̂×E)/η；λ = v/f",
  explanation: "无源、无耗且均匀的各向同性媒质满足 ∇²E − με∂²E/∂t² = 0。E、H、传播方向两两正交；E 和 H 同相，波阻抗 η = √(μ/ε)。视图将 H 放大 η 倍以对照方向，各频率均按同一演示周期慢放。等相位截面垂直于传播方向，坡印廷矢量 S = E×H 沿正向传播。",
  task: "将频率提高一倍，比较视窗内的波峰数量。切换水平极化，再从传播方向观察 E 与 H。",
  view: [4.95, 4.4, 12.6],
  metrics(p) {
    const { v, lambda, k, eta } = vacuumData(p);
    return [readout("波长 λ", fixed(lambda, 3), "m"), readout("波数 k", fixed(k, 2), "rad/m"),
      readout("相速度 v / c₀", fixed(v / c0, 3)), readout("波阻抗 η", fixed(eta, 1), "Ω")];
  },
  chart(p, t) {
    const { k } = vacuumData(p);
    const field = x => p.amp * Math.cos(k * x - wavePhase(t));
    return plot("沿传播轴的瞬时场截面", "传播距离 x / m", "等效场强 / V·m⁻¹", [
      series("E", electric, 0, waveSpan, field, 240),
      { ...series("ηH", magnetic, 0, waveSpan, field, 240), dashed: true },
      series("能流换算 √(ηS)", direction, 0, waveSpan, x => Math.abs(field(x)), 240),
    ], -p.amp * 1.12, p.amp * 1.12);
  },
  build(ctx, p) {
    const { THREE } = ctx;
    const e = ctx.layer("e"), h = ctx.layer("h"), axis = ctx.layer("k"), guides = ctx.layer("guides");
    const transverse = p.polar === "h";
    const { k } = vacuumData(p);
    const length = waveLength;
    const ePoint = (x, u) => transverse ? [x, 0, u] : [x, u, 0];
    const hPoint = (x, u) => transverse ? [x, -u, 0] : [x, 0, u];
    const half = 2.28;
    for (const x of [-4.9, 0, 4.9]) planeSection(ctx, guides, x, half, "#456999");
    ctx.line(guides, [[-5.8, -half, 0], [5.8, -half, 0]], guide, 0.38);
    ctx.line(guides, [[-5.8, 0, -half], [5.8, 0, -half]], guide, 0.38);
    ctx.line(axis, [[-6.1, 0, 0], [5.45, 0, 0]], direction, 0.76);
    ctx.arrow(axis, [5.4, 0, 0], [1, 0, 0], 0.85, direction);
    ctx.label(axis, "k", [6.26, 0.34, 0.09], direction);
    ctx.label(e, "E", ePoint(-4.65, 2.65), electric);
    ctx.label(h, "H", hPoint(-3.1, 2.65), magnetic);
    const traceE = animatedTrace(ctx, e, electric, 0.039, 150);
    const traceH = animatedTrace(ctx, h, magnetic, 0.039, 150);
    const arrows = curve(-length / 2, length / 2, x => [
      x,
      ctx.arrow(e, [x, 0, 0], [0, 1, 0], 1, electric),
      ctx.arrow(h, [x, 0, 0], [0, 0, 1], 1, magnetic),
    ], 27);
    const amplitude = 1.63 * p.amp;
    return t => {
      const value = x => amplitude * Math.cos(k * waveSpan * (x / length + 0.5) - wavePhase(t));
      const trace = mapper => u => {
        const x = length * (u - 0.5);
        return mapper(x, value(x));
      };
      traceE(trace(ePoint));
      traceH(trace(hPoint));
      for (const [x, arrowE, arrowH] of arrows) {
        moveArrow(THREE, arrowE, [x, 0, 0], ePoint(0, value(x)));
        moveArrow(THREE, arrowH, [x, 0, 0], hPoint(0, value(x)));
      }
    };
  },
};

function polarizationData(p, theta) {
  return [Math.cos(theta), p.ratio * Math.cos(theta + p.delta * DEG)];
}

const polarization = {
  id: "polarization", chapter: 6, title: "电磁波的极化椭圆",
  description: "改变横向分量的幅比与相差，观察电场端点在探针截面上画出的轨迹。",
  topics: ["线极化", "圆极化", "椭圆极化", "旋转方向"],
  params: [range("ratio", "分量幅比 E𝓏₀ / Eᵧ₀", 0, 2, 0.05, 0.7),
    range("delta", "相位差 δ", -180, 180, 5, 65, "°"), range("probe", "探针位置", -5, 5, 0.1, 1.2)],
  legend: [legend("e", "电场轨迹 E", electric), legend("h", "磁场 H", magnetic), legend("orbit", "极化椭圆", violet)],
  equation: "Eᵧ = Eᵧ₀ cosθ；E𝓏 = E𝓏₀ cos(θ + δ)；θ = kx − ωt",
  explanation: "在固定位置追踪电场矢量端点可得到极化椭圆。相差为 0 或 π、或者某一分量为零时得到线极化；等幅且相差 ±π/2 时得到圆极化。相位差改变符号时，端点绕传播轴的转向反转。H 由 k̂×E/η 得到。",
  task: "把幅比设为 1，相位差设为 90°。再把相位差改为 −90°，观察圆的旋转方向变化。",
  metrics(p) {
    const a = 1, b = p.ratio;
    const discriminant = Math.hypot(a * a - b * b, 2 * a * b * Math.cos(p.delta * DEG));
    const major = Math.sqrt((a * a + b * b + discriminant) / 2);
    const minor = Math.sqrt(Math.max(0, (a * a + b * b - discriminant) / 2));
    const isLine = minor < 1e-6;
    return [readout("极化类型", isLine ? "线极化" : Math.abs(major - minor) < 1e-6 ? "圆极化" : "椭圆极化"),
      readout("长短轴比", isLine ? "∞" : fixed(major / minor, 2)),
      readout("转向（分量顺序）", isLine ? "往复" : p.delta > 0 ? "+y → +z" : "+y → −z")];
  },
  chart(p, t) {
    const phase = 1.55 * p.probe - t * 1.7;
    return plot("探针截面的电场端点", "Eᵧ / Eᵧ₀", "E𝓏 / Eᵧ₀", [
      { label: "极化椭圆", color: violet, points: curve(0, tau, theta => polarizationData(p, theta)) },
      { label: "瞬时电场", color: electric, points: [[0, 0], polarizationData(p, phase)] },
    ], -Math.max(1.1, p.ratio * 1.12), Math.max(1.1, p.ratio * 1.12));
  },
  build(ctx, p) {
    const { THREE, group } = ctx;
    const e = ctx.layer("e"), h = ctx.layer("h"), orbit = ctx.layer("orbit");
    ctx.line(group, [[-6, 0, 0], [6, 0, 0]], direction, 0.5);
    ctx.arrow(group, [5.55, 0, 0], [1, 0, 0], 0.72, direction);
    planeSection(ctx, orbit, p.probe, 2.1, guide);
    const scale = 1.14;
    ctx.tube(orbit, curve(0, tau, theta => {
      const [y, z] = polarizationData(p, theta);
      return [p.probe, y * scale, z * scale];
    }), violet, 0.028, 0.85);
    ctx.label(orbit, "探针截面", [p.probe, 2.34, 0], violet);
    const traceE = animatedTrace(ctx, e, electric, 0.042);
    const traceH = animatedTrace(ctx, h, magnetic, 0.033);
    const positions = [...curve(-5.6, 5.6, x => x, 22), p.probe];
    const arrows = positions.map(x => [x, ctx.arrow(e, [x, 0, 0], [0, 1, 0], 1, electric)]);
    const probeH = ctx.arrow(h, [p.probe, 0, 0], [0, 0, 1], 1, magnetic);
    const tip = ctx.sphere(orbit, [0, 0, 0], 0.086, electric);
    return t => {
      const value = x => polarizationData(p, 1.55 * x - t * 1.7).map(u => scale * u);
      traceE(u => { const x = 11.2 * (u - 0.5), [y, z] = value(x); return [x, y, z]; });
      traceH(u => { const x = 11.2 * (u - 0.5), [y, z] = value(x); return [x, -z, y]; });
      for (const [x, arrow] of arrows) moveArrow(THREE, arrow, [x, 0, 0], [0, ...value(x)]);
      const [y, z] = value(p.probe);
      moveArrow(THREE, probeH, [p.probe, 0, 0], [0, -z, y]);
      tip.position.set(p.probe, y, z);
    };
  },
};

function conductorData(p) {
  const omega = tau * p.f * 1e6, sigma = p.sigma * 1e6;
  const magnitude = Math.hypot(sigma, omega * e0);
  const alpha = Math.sqrt(omega * m0 * (magnitude - omega * e0) / 2);
  const beta = Math.sqrt(omega * m0 * (magnitude + omega * e0) / 2);
  return { alpha, beta, skin: 1 / alpha, eta: Math.sqrt(omega * m0 / magnitude),
    lag: Math.atan2(sigma, omega * e0) / 2 };
}

function lossSample(p, t, mm) {
  const { alpha, beta, lag } = conductorData(p);
  const x = mm / 1000;
  const phase = beta * x - t * 1.8;
  const envelope = Math.exp(-alpha * x);
  return { envelope, e: envelope * Math.cos(phase), h: envelope * Math.cos(phase + lag) };
}

const skinDepth = {
  id: "skin-depth", chapter: 6, title: "导电媒质中的衰减与趋肤效应",
  description: "沿导体深度追踪指数衰减、相位变化与趋肤深度 δ。",
  topics: ["复传播常数", "损耗与趋肤", "波阻抗", "导电媒质"],
  params: [range("f", "频率", 0.1, 24, 0.1, 1, "MHz"), range("sigma", "电导率", 1, 58, 1, 36, "MS/m"),
    range("span", "观察深度", 0.04, 0.5, 0.01, 0.34, "mm")],
  legend: [legend("e", "电场 E", electric), legend("h", "归一化磁场 H", magnetic), legend("decay", "衰减包络与 δ", gold)],
  equation: "γ = √[jωμ(σ+jωε)] = α+jβ；|E(x)| = |E(0)|e⁻ᵅˣ；δ = 1/α",
  explanation: "导体内的场同时发生相位延迟和幅度衰减，E 降到表面幅值的 1/e 处定义为趋肤深度。良导体近似 δ ≈ √[2/(ωμσ)]。这里以表面透射场为归一化起点，固定 μ=μ₀、ε=ε₀，并用复传播常数计算衰减和磁场相位差。",
  task: "提高频率或电导率，比较 δ 和场渗透深度。在 δ 处验证幅值降为约 36.8%。",
  metrics(p) {
    const { alpha, beta, skin, eta, lag } = conductorData(p);
    return [readout("趋肤深度 δ", fixed(skin * 1e6, 1), "μm"),
      readout("衰减常数 α", fixed(alpha / 1000, 1), "Np/mm"),
      readout("相位常数 β", fixed(beta / 1000, 1), "rad/mm"),
      readout("|η| / 磁场相位滞后", fixed(eta * 1000, 2) + " mΩ / " + fixed(lag / DEG, 1) + "°")];
  },
  chart(p, t) {
    const { skin } = conductorData(p);
    const traces = [
      series("E / E(0)幅值", electric, 0, p.span, x => lossSample(p, t, x).e),
      series("|η|H / E(0)幅值", magnetic, 0, p.span, x => lossSample(p, t, x).h),
      series("幅度包络", gold, 0, p.span, x => lossSample(p, t, x).envelope),
    ];
    if (skin * 1000 <= p.span) traces.push({ label: "趋肤深度", color: violet, points: [[skin * 1000, -1], [skin * 1000, 1]] });
    return plot("导体内部沿深度的瞬时场", "表面下深度 / mm", "归一化幅度", traces, -1.1, 1.1);
  },
  build(ctx, p) {
    const { group } = ctx;
    const e = ctx.layer("e"), h = ctx.layer("h"), decay = ctx.layer("decay");
    planeSection(ctx, group, -5.5, 2.2, direction);
    ctx.box(group, [0, 0, 0], [11, 4.4, 4.4], guide, 0.055);
    ctx.line(group, [[-5.5, 0, 0], [6.05, 0, 0]], direction, 0.57);
    ctx.arrow(group, [5.35, 0, 0], [1, 0, 0], 0.73, direction);
    ctx.label(group, "导体表面", [-5.5, 2.5, 0], direction);
    const display = (u, y, z) => [11 * (u - 0.5), y * 1.85, z * 1.85];
    for (const sign of [-1, 1]) {
      ctx.line(decay, curve(0, 1, u => display(u, sign * lossSample(p, 0, u * p.span).envelope, 0)), gold, 0.75);
    }
    const { skin } = conductorData(p);
    const normalizedSkin = skin * 1000 / p.span;
    if (normalizedSkin <= 1) {
      const x = 11 * (normalizedSkin - 0.5);
      planeSection(ctx, decay, x, 1.9, gold);
      ctx.label(decay, "δ", [x, 2.1, 0], gold);
    }
    const traceE = animatedTrace(ctx, e, electric), traceH = animatedTrace(ctx, h, magnetic);
    return t => {
      traceE(u => display(u, lossSample(p, t, u * p.span).e, 0));
      traceH(u => display(u, 0, lossSample(p, t, u * p.span).h));
    };
  },
};

function plasmaData(f, fp) {
  const factor = Math.sqrt(1 - (fp / f) ** 2);
  return { vp: c0 / factor, vg: c0 * factor, k: tau * 1e9 * f * factor / c0 };
}

function dispersionSample(p, t, x) {
  const fA = p.f - p.df / 2, fB = p.f + p.df / 2;
  const a = plasmaData(fA, p.fp).k * x - fA * t * 2.1;
  const b = plasmaData(fB, p.fp).k * x - fB * t * 2.1;
  return { amplitude: (Math.cos(a) + Math.cos(b)) / 2, envelope: Math.abs(Math.cos((b - a) / 2)) };
}

const dispersion = {
  id: "dispersion", chapter: 6, title: "色散、相速度与群速度",
  description: "在理想冷等离子体中叠加邻近频率，比较载波相位与拍频包络的移动。",
  topics: ["相速度", "群速度", "色散", "冷等离子体"],
  params: [range("f", "载波中心频率", 0.9, 1.8, 0.01, 1.02, "GHz"),
    range("fp", "等离子体频率", 0, 0.7, 0.01, 0.61, "GHz"), range("df", "两分量频差", 0.05, 0.3, 0.01, 0.21, "GHz")],
  legend: [legend("wave", "叠加载波", electric), legend("envelope", "拍频包络", violet), legend("k", "传播轴", direction)],
  equation: "ω² = ωₚ²+c₀²k²；vₚ = ω/k；vɡ = dω/dk",
  explanation: "无磁化、无碰撞的冷等离子体给出这个色散关系。两个相邻频率的波叠加，产生由差频决定的缓变包络；频差足够小时，包络速度接近群速度。中心频率越接近等离子体频率，载波相速度和群速度的差异越明显。此例的相速度可以大于 c₀，能量和信息传播速度受群速度约束。",
  task: "先把等离子体频率置零，再调高。观察同一载波波峰相对于包络最大值如何移动。",
  metrics(p) {
    const { vp, vg } = plasmaData(p.f, p.fp);
    const beat = tau / (plasmaData(p.f + p.df / 2, p.fp).k - plasmaData(p.f - p.df / 2, p.fp).k);
    return [readout("相速度 / c₀", fixed(vp / c0, 3)), readout("群速度 / c₀", fixed(vg / c0, 3)),
      readout("拍频空间周期", fixed(beat, 2), "m")];
  },
  chart(p, t) {
    return plot("波形与包络", "传播距离 / m", "相对电场幅度", [
      series("叠加载波", electric, -0.9, 0.9, x => dispersionSample(p, t, x).amplitude),
      series("+包络", violet, -0.9, 0.9, x => dispersionSample(p, t, x).envelope),
      series("−包络", violet, -0.9, 0.9, x => -dispersionSample(p, t, x).envelope),
    ], -1.1, 1.1);
  },
  build(ctx, p) {
    const wave = ctx.layer("wave"), envelope = ctx.layer("envelope"), k = ctx.layer("k");
    ctx.line(k, [[-6, 0, 0], [5.5, 0, 0]], direction, 0.55);
    ctx.arrow(k, [5.5, 0, 0], [1, 0, 0], 0.8, direction);
    ctx.label(k, "k", [6.3, 0.22, 0], direction);
    const trace = animatedTrace(ctx, wave, electric, 0.039, 160);
    const outlines = [1, -1].map(() => animatedTrace(ctx, envelope, violet, 0.024, 120));
    return t => {
      const point = (u, key, sign) => {
        const x = 1.8 * (u - 0.5);
        return [x * 6.3, 2.04 * dispersionSample(p, t, x)[key] * sign, 0];
      };
      trace(u => point(u, "amplitude", 1));
      outlines.forEach((render, i) => render(u => point(u, "envelope", i ? -1 : 1)));
    };
  },
};

function cAdd([ar, ai], [br, bi]) { return [ar + br, ai + bi]; }
function cMul([ar, ai], [br, bi]) { return [ar * br - ai * bi, ar * bi + ai * br]; }
function cDiv([ar, ai], [br, bi]) {
  const norm = br * br + bi * bi;
  return [(ar * br + ai * bi) / norm, (ai * br - ar * bi) / norm];
}
const cis = theta => [Math.cos(theta), Math.sin(theta)];
const magnitude2 = ([a, b]) => a * a + b * b;
const phaseOf = ([a, b]) => Math.atan2(b, a);

function fresnelData(n1, n2, theta, polar) {
  const cosI = Math.cos(theta), sinT = n1 * Math.sin(theta) / n2;
  const tir = sinT >= 1;
  const cosT = tir ? [0, Math.sqrt(Math.max(0, sinT ** 2 - 1))] : [Math.sqrt(1 - sinT ** 2), 0];
  const p = polar === "p";
  const a = (p ? n2 : n1) * cosI, b = (p ? n1 : n2);
  const denominator = cAdd([a, 0], cMul([b, 0], cosT));
  const numerator = cAdd([a, 0], cMul([-b, 0], cosT));
  const r = cDiv(numerator, denominator);
  const t = cDiv([2 * n1 * cosI, 0], denominator);
  const R = Math.min(1, magnitude2(r));
  return { r, t, R, T: tir ? 0 : n2 * cosT[0] / (n1 * cosI) * magnitude2(t),
    tir, thetaT: tir ? null : Math.asin(sinT), decay: cosT[1], sinT };
}

const fresnel = {
  id: "fresnel", chapter: 7, title: "菲涅尔反射、折射与全反射",
  liveChart: false,
  description: "在两个无耗介质的界面调节入射角和极化，观测布儒斯特角与全反射。",
  topics: ["斯涅尔定律", "菲涅尔系数", "临界角", "布儒斯特角"],
  params: [range("n1", "入射媒质折射率", 1, 2.5, 0.01, 1), range("n2", "透射媒质折射率", 1, 2.5, 0.01, 1.5),
    range("theta", "入射角 θᵢ", 0, 89, 0.1, 42), choice("polar", "入射极化", [["s", "s · 垂直入射面（TE）"], ["p", "p · 平行入射面（TM）"]], "p")],
  legend: [legend("in", "入射", direction), legend("r", "反射", electric), legend("t", "透射 / 倏逝", magnetic)],
  equation: "n₁ sinθᵢ = n₂ sinθₜ；R = |r|²；T = (n₂ cosθₜ)/(n₁ cosθᵢ)·|t|²",
  explanation: "两个媒质均无耗、非磁性。麦克斯韦边界条件给出 s、p 极化的菲涅尔系数。由高折射率射向低折射率时，超过临界角后，界面另一侧仍有倏逝场，但法向平均透射功率为零。布儒斯特角仅使 p 极化反射系数为零。法向入射时，两种极化的功率反射率相同。",
  task: "选择 p 极化，调角度找 R≈0 的点。交换高低折射率，再寻找透射光束消失且 R=1 的角度。",
  metrics(p) {
    const d = fresnelData(p.n1, p.n2, p.theta * DEG, p.polar);
    return [readout("反射功率 R", fixed(d.R * 100, 2), "%"), readout("透射功率 T", fixed(d.T * 100, 2), "%"),
      readout("折射角 θₜ", d.tir ? "倏逝" : fixed(d.thetaT / DEG, 1) + "°"),
      readout("临界角 / 布儒斯特角", (p.n1 > p.n2 ? fixed(Math.asin(p.n2 / p.n1) / DEG, 1) + "°" : "—")
        + " / " + (p.n1 === p.n2 ? "—" : fixed(Math.atan(p.n2 / p.n1) / DEG, 1) + "°"))];
  },
  chart(p) {
    return plot("s 与 p 极化的功率反射率", "入射角 / °", "功率比例", [
      series("Rₛ", direction, 0, 89.9, x => fresnelData(p.n1, p.n2, x * DEG, "s").R, 250),
      series("Rₚ", electric, 0, 89.9, x => fresnelData(p.n1, p.n2, x * DEG, "p").R, 250),
      series("当前极化的 T", magnetic, 0, 89.9, x => fresnelData(p.n1, p.n2, x * DEG, p.polar).T, 250),
      { label: "当前入射角", color: gold, points: [[p.theta, 0], [p.theta, 1]] },
    ], 0, 1.06);
  },
  build(ctx, p) {
    const { group } = ctx;
    const incoming = ctx.layer("in"), reflected = ctx.layer("r"), transmitted = ctx.layer("t");
    const angle = p.theta * DEG;
    const d = fresnelData(p.n1, p.n2, angle, p.polar);
    planeSection(ctx, group, 0, 2.36, guide);
    ctx.label(group, "n₁ = " + fixed(p.n1, 2), [-3.3, 2.25, 0], direction);
    ctx.label(group, "n₂ = " + fixed(p.n2, 2), [3.3, 2.25, 0], magnetic);
    ctx.line(group, [[-5.6, 0, 0], [5.6, 0, 0]], direction, 0.32);
    const labelRay = (parent, theta, xSign, incomingRay, name, color, power, offset, index) => {
      const cs = Math.cos(theta), sn = Math.sin(theta);
      const size = Math.min(5.15 / Math.max(cs, 0.02), 3.9 / Math.max(sn, 0.02));
      const axis = [xSign * cs, 0, incomingRay ? -sn : sn];
      const k = axis.map(u => u * (incomingRay ? -1 : 1));
      const base = s => axis.map(u => u * s * size);
      const pol = p.polar === "p" ? [k[2], 0, -k[0]] : [0, 1, 0];
      const visiblePower = Math.sqrt(power);
      ctx.line(parent, [[0, 0, 0], base(1)], color, Math.min(0.78, 0.14 + visiblePower));
      const arrowAnchor = base(incomingRay ? 0.57 : 0.7);
      if (visiblePower > 0.008) ctx.arrow(parent, arrowAnchor, k, 0.8, color);
      const mark = base(0.72);
      ctx.label(parent, name, [mark[0], mark[1] + (incomingRay ? 0.57 : 0.98), mark[2]], color);
      if (visiblePower <= 0.008) return () => {};
      const draw = animatedTrace(ctx, parent, color, 0.032, 96);
      return t => draw(u => {
        const signed = u * size * (incomingRay ? -1 : 1);
        const amp = 0.62 * Math.min(visiblePower, 2.6) * Math.cos(2.7 * index * signed - t * 2 + offset);
        return base(u).map((v, i) => v + amp * pol[i]);
      });
    };
    const incidentWave = labelRay(incoming, angle, -1, true, "入射", direction, 1, 0, p.n1);
    const reflectedWave = labelRay(reflected, angle, -1, false, "反射", electric, d.R, phaseOf(d.r), p.n1);
    let transmittedWave;
    if (!d.tir) {
      transmittedWave = labelRay(transmitted, d.thetaT, 1, false, "折射", magnetic, magnitude2(d.t), phaseOf(d.t), p.n2);
    } else {
      ctx.label(transmitted, "倏逝场", [1.3, 2.16, 0.65], magnetic);
      const strips = Array.from({ length: 7 }, (_, i) => [
        i * 0.37 + 0.09,
        animatedTrace(ctx, transmitted, magnetic, 0.029 - i * 0.0024, 75),
      ]);
      transmittedWave = t => {
        for (const [x, draw] of strips) draw(u => {
          const z = 5.8 * (u - 0.5);
          const amp = 0.62 * Math.min(2.6, Math.sqrt(magnitude2(d.t))) * Math.exp(-x * p.n2 * d.decay * 2.7);
          return [x, amp * Math.cos(2.7 * p.n2 * d.sinT * z - t * 2 + phaseOf(d.t)), z];
        });
      };
    }
    return t => { incidentWave(t); reflectedWave(t); transmittedWave(t); };
  },
};

function pecSample(p, t, x, z) {
  const angle = p.theta * DEG;
  const along = 2.05 * Math.sin(angle) * z - t * 1.9;
  const into = 2.05 * Math.cos(angle) * x;
  const eIn = Math.cos(into + along);
  const eOut = -Math.cos(-into + along);
  return { e: eIn + eOut, h: Math.cos(angle) * (eIn - eOut) };
}

const conductorReflection = {
  id: "pec-reflection", chapter: 7, title: "理想导体表面的反射",
  description: "改变入射角，比较理想导体壁前的入射波、反射波与场节点。",
  topics: ["理想导体", "垂直入射", "斜入射", "切向电场条件"],
  params: [range("theta", "入射角", 0, 75, 1, 30, "°"), range("probe", "沿壁观察位置", -2.4, 2.4, 0.1, 0, "λ/3")],
  legend: [legend("e", "合成切向 E", electric), legend("h", "合成切向 H", magnetic), legend("rays", "入射与反射方向", direction)],
  equation: "Eₜ|壁 = 0；Γₛ = −1；法向节点间距 = λ/(2 cosθᵢ)",
  explanation: "s 极化入射时，理想导体表面的切向电场必须抵消。斜入射保留沿壁的波数分量，于是总场在法向形成驻波、沿壁方向传播。切向 H 可以在壁处达到最大，其跳变由表面电流支持。导体内部场设为零。",
  task: "把入射角调至 0°，再逐渐调大。比较法向节点间距，检查贴近壁面的 E 是否始终为零。",
  metrics(p) {
    const angle = p.theta * DEG;
    return [readout("反射系数 Γₛ", "−1"), readout("法向节点间距 / λ", fixed(0.5 / Math.cos(angle), 3)),
      readout("切向波数 / k", fixed(Math.sin(angle), 3)), readout("表面切向 E", "0", "V/m")];
  },
  chart(p, t) {
    return plot("垂直导体表面的截线", "离导体壁的距离 / λ", "归一化幅度", [
      series("Eₜ", electric, 0, 1.78, x => pecSample(p, t, -x * tau / 2.05, p.probe).e),
      series("ηHₜ", magnetic, 0, 1.78, x => pecSample(p, t, -x * tau / 2.05, p.probe).h),
    ], -2.12, 2.12);
  },
  build(ctx, p) {
    const { group } = ctx;
    const e = ctx.layer("e"), h = ctx.layer("h"), rays = ctx.layer("rays");
    const wallX = 5.05;
    planeSection(ctx, group, wallX, 2.64, "#587fb2");
    ctx.box(group, [5.48, 0, 0], [0.82, 5.28, 5.28], guide, 0.3);
    ctx.label(group, "PEC", [wallX + 0.15, 2.87, 0.35], direction);
    const a = p.theta * DEG, s = Math.sin(a), c = Math.cos(a);
    const length = 2.8;
    ctx.arrow(rays, [wallX - c * length, 1.95, -s * length], [c, 0, s], length - 0.05, direction);
    ctx.arrow(rays, [wallX - 0.04, 1.95, 0], [-c, 0, s], length, gold);
    ctx.label(rays, "入射", [wallX - c * 2.45, 2.3, -s * 2.45], direction);
    ctx.label(rays, "反射", [wallX - c * 2.45, 2.3, s * 2.45 + 0.28], gold);
    const traceE = animatedTrace(ctx, e, electric);
    const traceH = animatedTrace(ctx, h, magnetic);
    const stacks = [-2, -1, 0, 1, 2].map(z => [z, animatedTrace(ctx, e, electric, 0.015)]);
    ctx.line(group, [[wallX - 10.9, 0, p.probe], [wallX, 0, p.probe]], direction, 0.65);
    return t => {
      const model = (u, z) => {
        const x = 10.9 * (u - 1);
        return { x: wallX + x, ...pecSample(p, t, x, z) };
      };
      traceE(u => { const d = model(u, p.probe); return [d.x, d.e * 0.86, p.probe]; });
      traceH(u => { const d = model(u, p.probe); return [d.x, 0, p.probe + d.h * 0.69]; });
      for (const [z, draw] of stacks) draw(u => { const d = model(u, z); return [d.x, d.e * 0.6, z]; });
    };
  },
};

const standing = {
  id: "standing-wave", chapter: 7, title: "驻波、行驻波与驻波比",
  description: "调节负载反射系数，观察反射幅度改变时驻波节点、波腹和传输功率。",
  topics: ["入射与反射的叠加", "驻波", "行驻波", "驻波比"],
  params: [range("r", "反射系数幅值", 0, 1, 0.01, 0.72), range("phase", "反射系数相位", -180, 180, 5, 180, "°")],
  legend: [legend("wave", "合成电场", electric), legend("envelope", "驻波包络", violet), legend("components", "入射、反射分量", magnetic)],
  equation: "|Ẽ(x)|/Eᵢ = √[1+|Γ|²+2|Γ|cos(2kx−argΓ)]；VSWR = (1+|Γ|)/(1−|Γ|)",
  explanation: "两列同频反向波叠加。全反射形成纯驻波；部分反射形成行驻波，空间包络不为零且具有正的平均净功率；无反射形成纯行波。反射相位改变节点与波腹的位置，反射幅度决定驻波比。",
  task: "依次把反射幅度设为 0、0.5、1，记录驻波比与最小包络值。再改变相位，比较波腹位置。",
  metrics(p) {
    return [readout("驻波比", p.r === 1 ? "∞" : fixed((1 + p.r) / (1 - p.r), 2)),
      readout("包络最小 / 入射峰值", fixed(1 - p.r, 2)), readout("包络最大 / 入射峰值", fixed(1 + p.r, 2)),
      readout("净功率 / 入射功率", fixed((1 - p.r ** 2) * 100, 1), "%")];
  },
  chart(p, t) {
    const envelope = x => Math.sqrt(Math.max(0, 1 + p.r ** 2 + 2 * p.r * Math.cos(2 * tau * x - p.phase * DEG)));
    const phase = t * 1.8;
    return plot("反射端前方的场包络", "相对反射端位置 / λ", "归一化电场", [
      series("瞬时 E", electric, -1.6, 0, x => fieldsForReflection(x, phase, p.r, p.phase * DEG, tau).e),
      series("+包络", violet, -1.6, 0, envelope), series("−包络", violet, -1.6, 0, x => -envelope(x)),
    ], -2.1, 2.1);
  },
  build(ctx, p) {
    const { group } = ctx;
    const wave = ctx.layer("wave"), envelope = ctx.layer("envelope"), components = ctx.layer("components");
    const end = 5.35, length = 11.1;
    const displayX = x => end + x / 1.6 * length;
    planeSection(ctx, group, end, 2.2, direction);
    ctx.label(group, "反射端", [end, 2.5, 0], direction);
    ctx.line(group, [[displayX(-1.6), 0, 0], [end, 0, 0]], direction, 0.58);
    const phase = p.phase * DEG;
    const envelopeAt = x => Math.sqrt(Math.max(0, 1 + p.r ** 2 + 2 * p.r * Math.cos(2 * tau * x - phase)));
    for (const sign of [-1, 1]) {
      ctx.tube(envelope, curve(-1.6, 0, x => [displayX(x), sign * envelopeAt(x), 0]), violet, 0.018, 0.7);
    }
    const trace = animatedTrace(ctx, wave, electric);
    const incoming = animatedTrace(ctx, components, direction, 0.022);
    const reflected = animatedTrace(ctx, components, magnetic, 0.023);
    ctx.label(components, "入射", [displayX(-0.95), 0.8, -1.52], direction);
    ctx.label(components, "反射", [displayX(-1.2), 0.8, 1.53], magnetic);
    return t => {
      const at = (sample, z) => u => {
        const x = 1.6 * (u - 1);
        return [displayX(x), sample(x), z];
      };
      const time = t * 1.8;
      trace(at(x => fieldsForReflection(x, time, p.r, phase, tau).e, 0));
      incoming(at(x => 0.68 * Math.cos(tau * x - time), -1.55));
      reflected(at(x => 0.68 * p.r * Math.cos(-tau * x - time + phase), 1.55));
    };
  },
};

function filmData(p, d = p.d) {
  const n1 = p.n1, n2 = p.n2, n3 = p.n3;
  const r12 = (n1 - n2) / (n1 + n2), r23 = (n2 - n3) / (n2 + n3);
  const delta = tau * n2 * d;
  const e = cis(2 * delta);
  const denom = cAdd([1, 0], cMul([r12 * r23, 0], e));
  const r = cDiv(cAdd([r12, 0], cMul([r23, 0], e)), denom);
  const A = cDiv([2 * n1 / (n1 + n2), 0], denom);
  const B = cMul(cMul(A, [r23, 0]), e);
  const C = cMul(cMul(A, [2 * n2 / (n2 + n3), 0]), cis(delta));
  const R = magnitude2(r);
  return { r, A, B, C, R, T: n3 / n1 * magnitude2(C) };
}

const film = {
  id: "thin-film", chapter: 7, title: "多层媒质与四分之一波长匹配",
  liveChart: false,
  description: "改变匹配层厚度及折射率，观察多次反射的干涉如何减小反射。",
  topics: ["多层媒质", "介质匹配", "反射干涉", "频率选择"],
  params: [range("n1", "入射层折射率 n₁", 1, 3, 0.01, 1), range("n2", "匹配层折射率 n₂", 1, 3, 0.01, 1.5),
    range("n3", "基底折射率 n₃", 1, 3, 0.01, 2.25), range("d", "匹配层厚度", 0.02, 0.85, 0.001, 0.167, "λ₀")],
  legend: [legend("incoming", "入射波", direction), legend("back", "反向波", electric), legend("forward", "正向波", magnetic)],
  equation: "Γ = (r₁₂+r₂₃e²ʲᵟ)/(1+r₁₂r₂₃e²ʲᵟ)；δ = 2πn₂d/λ₀",
  explanation: "正入射无耗系统中，多次反射可由两界面的电场连续条件求和。中间层取 n₂ = √(n₁n₃)，光程取 λ₀/4 时，返回入射侧的波可相消。固定实际厚度时，改变频率等效于改变 d/λ₀，从而形成频率选择。",
  task: "让 n₂ 接近 √(n₁n₃)，扫描厚度，验证第一个反射谷出现在 n₂d≈λ₀/4。",
  metrics(p) {
    const d = filmData(p);
    return [readout("反射功率", fixed(d.R * 100, 3), "%"), readout("透射功率", fixed(d.T * 100, 3), "%"),
      readout("光程 n₂d / λ₀", fixed(p.n2 * p.d, 3)), readout("匹配折射率 √(n₁n₃)", fixed(Math.sqrt(p.n1 * p.n3), 3))];
  },
  chart(p) {
    return plot("厚度扫描与反射谷", "匹配层厚度 / λ₀", "功率比例", [
      series("R", electric, 0, 0.85, d => filmData(p, d).R, 180),
      series("T", magnetic, 0, 0.85, d => filmData(p, d).T, 180),
      { label: "当前厚度", color: direction, points: [[p.d, 0], [p.d, 1]] },
    ], 0, 1.05);
  },
  build(ctx, p) {
    const { group } = ctx;
    const incoming = ctx.layer("incoming"), back = ctx.layer("back"), forward = ctx.layer("forward");
    const wave = filmData(p);
    const left = -1.35;
    const width = 0.42 + p.d * 4.1;
    const right = left + width;
    planeSection(ctx, group, left, 2.18, guide);
    planeSection(ctx, group, right, 2.18, guide);
    ctx.box(group, [(left + right) / 2, 0, 0], [width, 4.36, 4.36], guide, 0.10);
    ctx.label(group, "n₁", [-4.05, 2.1, 0], direction);
    ctx.label(group, "n₂", [(left + right) / 2, 2.43, 0], gold);
    ctx.label(group, "n₃", [(right + 5.55) / 2, 2.1, 0], magnetic);
    ctx.line(group, [[-5.75, 0, 0], [5.75, 0, 0]], direction, 0.35);
    const components = [
      [animatedTrace(ctx, incoming, direction, 0.029), -5.65, left, [1, 0], 0.93, -1.2, x => tau * p.n1 * (x - left) / 4.3],
      [animatedTrace(ctx, back, electric, 0.034), -5.65, left, wave.r, 0.93, 1.2, x => -tau * p.n1 * (x - left) / 4.3],
      [animatedTrace(ctx, forward, magnetic, 0.033), left, right, wave.A, 0.93, -1.2, x => tau * p.n2 * p.d * (x - left) / width],
      [animatedTrace(ctx, back, electric, 0.032), left, right, wave.B, 0.93, 1.2, x => -tau * p.n2 * p.d * (x - left) / width],
      [animatedTrace(ctx, forward, magnetic, 0.036), right, 5.65, wave.C, 0.93, -1.2, x => tau * p.n3 * (x - right) / 4.3],
    ];
    ctx.label(incoming, "入射", [-4.8, 0.89, -1.2], direction);
    ctx.label(back, "反射", [-4.8, 0.89, 1.2], electric);
    ctx.label(forward, "透射", [5, 0.89, -1.2], magnetic);
    return t => {
      for (const [draw, a, b, amplitude, scale, z, spatialPhase] of components) {
        draw(u => {
          const x = a + (b - a) * u;
          const y = scale * cMul(amplitude, cis(spatialPhase(x) - t * 1.9))[0];
          return [x, y, z];
        });
      }
    };
  },
};

const bands = {
  radio: { f: 1e6, lambdaUnit: "m", scale: 1, use: "广播与远程传播" },
  microwave: { f: 10e9, lambdaUnit: "mm", scale: 1e3, use: "微波通信与雷达" },
  infrared: { f: 30e12, lambdaUnit: "μm", scale: 1e6, use: "热像与遥感" },
  visible: { f: 550e12, lambdaUnit: "nm", scale: 1e9, use: "视觉与光学成像" },
  ultraviolet: { f: 1e15, lambdaUnit: "nm", scale: 1e9, use: "材料分析与荧光" },
  xray: { f: 3e18, lambdaUnit: "nm", scale: 1e9, use: "衍射与成像" },
  gamma: { f: 3e20, lambdaUnit: "pm", scale: 1e12, use: "核辐射探测" },
};
function anisotropicData(p) {
  const base = bands[p.band];
  return { ...base, lambda: c0 / base.f, delta: tau * (p.nz - p.ny) * p.depth };
}
function anisotropicSample(p, t, distance) {
  const a = tau * p.ny * distance - t * 1.55;
  const b = tau * p.nz * distance - t * 1.55;
  return [Math.cos(a) / Math.sqrt(2), Math.cos(b) / Math.sqrt(2)];
}

const birefringence = {
  id: "anisotropy", chapter: 6, title: "双折射与电磁波频谱",
  description: "比较双折射媒质中两个本征极化的累积相位，并换算不同频段的真空波长。",
  topics: ["各向异性媒质", "双折射", "电磁频谱", "应用频段"],
  params: [choice("band", "频段代表频率", [["radio", "无线电 · 1 MHz"], ["microwave", "微波 · 10 GHz"],
    ["infrared", "红外 · 30 THz"], ["visible", "可见光 · 550 THz"], ["ultraviolet", "紫外 · 1 PHz"],
    ["xray", "X 射线 · 3 EHz"], ["gamma", "γ 射线 · 300 EHz"]], "visible"),
    range("ny", "y 极化折射率 nᵧ", 1, 2, 0.01, 1.43), range("nz", "z 极化折射率 n𝓏", 1, 2, 0.01, 1.56),
    range("depth", "晶片厚度 / λ₀", 0.25, 4, 0.05, 2)],
  legend: [legend("e", "合成电场", electric), legend("y", "y 本征分量", direction), legend("z", "z 本征分量", magnetic)],
  equation: "Δφ = (k𝓏−kᵧ)d = 2π(n𝓏−nᵧ)d/λ₀；λ₀ = c₀/f",
  explanation: "理想各向异性无耗介质中，沿特定主轴传播的两个正交本征极化可能具有不同的相速度，线极化叠加后会随距离积累相位差。这里忽略界面反射，且把折射率当作独立教学参数。频段选择用于比较真空波长，实际材料的参数与可透过频率范围需由其本构关系确定。磁化铁氧体和磁化等离子体也可出现与偏置方向有关的各向异性。",
  task: "令 nᵧ=n𝓏，观察极化保持为直线。再调节折射率差和厚度使 |Δφ|≈90°，并比较各频段的真空波长。",
  metrics(p) {
    const d = anisotropicData(p);
    return [readout("真空波长 λ₀", fixed(d.lambda * d.scale, 2), d.lambdaUnit),
      readout("传播累积相位差", fixed(d.delta / DEG, 1), "°"), readout("频段典型应用", d.use)];
  },
  chart(p, t) {
    return plot("晶片内的本征极化分量", "距入射面 / λ₀", "归一化场强", [
      series("Eᵧ", direction, 0, p.depth, x => anisotropicSample(p, t, x)[0]),
      series("E𝓏", magnetic, 0, p.depth, x => anisotropicSample(p, t, x)[1]),
    ], -0.82, 0.82);
  },
  build(ctx, p) {
    const { THREE, group } = ctx;
    const e = ctx.layer("e"), y = ctx.layer("y"), z = ctx.layer("z");
    planeSection(ctx, group, -5.3, 2.15, guide);
    planeSection(ctx, group, 5.3, 2.15, guide);
    ctx.label(group, "入射面", [-5.3, 2.38, 0], direction);
    ctx.label(group, "出射面", [5.3, 2.38, 0], magnetic);
    ctx.line(group, [[-5.45, 0, 0], [6, 0, 0]], direction, 0.35);
    const sum = animatedTrace(ctx, e, electric, 0.039);
    const traceY = animatedTrace(ctx, y, direction, 0.023);
    const traceZ = animatedTrace(ctx, z, magnetic, 0.023);
    const out = ctx.arrow(e, [5.3, 0, 0], [0, 1, 0], 1, electric);
    const outEllipse = curve(0, tau, phase => [
      5.3, 1.34 * Math.cos(phase),
      1.34 * Math.cos(phase + anisotropicData(p).delta),
    ]);
    ctx.line(e, outEllipse, electric, 0.58);
    return t => {
      const asTrace = (fy, fz) => u => {
        const [a, b] = anisotropicSample(p, t, u * p.depth).map(n => 1.9 * n);
        return [10.6 * (u - 0.5), fy(a), fz(b)];
      };
      sum(asTrace(a => a, b => b));
      traceY(asTrace(a => a, () => 0));
      traceZ(asTrace(() => 0, b => b));
      moveArrow(THREE, out, [5.3, 0, 0], [0, ...anisotropicSample(p, t, p.depth).map(n => 1.9 * n)]);
    };
  },
};

export const labs = [maxwell, faraday, boundary, poynting, planeWave, polarization, skinDepth, dispersion,
  birefringence, fresnel, conductorReflection, standing, film];
