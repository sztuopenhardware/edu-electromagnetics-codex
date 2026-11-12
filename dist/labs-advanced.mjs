const C = 299792458;
const EPS0 = 8.8541878128e-12;
const MU0 = 4 * Math.PI * 1e-7;
const ETA0 = Math.sqrt(MU0 / EPS0);
const TAU = 2 * Math.PI;
const cyan = '#4ee9f5';
const gold = '#ffca79';
const purple = '#b698fb';
const blue = '#688cbd';
const green = '#68e9b1';
const red = '#ff8995';
const dim = '#a5b8d6';
const radians = (angle) => angle * Math.PI / 180;
const format = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '∞';
const range = (key, label, min, max, step, value, unit) => ({key, label, min, max, step, value, unit});
const choice = (key, label, value, entries) => ({key, label, value, options: entries.map(([value, label]) => ({value, label}))});
const legend = (key, label, color) => ({key, label, color});
const metric = (label, value, unit) => ({label, value, unit});
const sample = (start, end, count, fn) => Array.from({length: count}, (_, i) => {
  const x = start + (end - start) * i / (count - 1);
  return [x, fn(x)];
});
const series = (label, color, points) => ({label, color, points});
const plot = (title, xLabel, yLabel, curves, yMin, yMax) => ({title, xLabel, yLabel, series: curves, yMin, yMax});

function circle(x, y, z, radius, count = 65) {
  return sample(0, TAU, count, (a) => [x, y + radius * Math.cos(a), z + radius * Math.sin(a)]).map(([, point]) => point);
}

function curve(start, end, count, fn) {
  return sample(start, end, count, fn).map(([, point]) => point);
}

function beam(ctx, parent, a, b, radius, color, opacity = 1) {
  return ctx.tube(parent, [a, b], color, radius, opacity);
}

function movingArrow(ctx, parent, origin, color) {
  const arrow = ctx.arrow(parent, origin, [0, 1, 0], 0.5, color);
  const direction = new ctx.THREE.Vector3();
  return (vector, scale = 1) => {
    direction.set(...vector);
    const length = direction.length() * scale;
    arrow.visible = length > 0.018;
    if (arrow.visible) {
      arrow.setDirection(direction.normalize());
      arrow.setLength(length, Math.min(0.15, length * 0.4), Math.min(0.09, length * 0.25));
    }
  };
}

function wireBox(ctx, layer, [x, y, z], [length, height, depth], color) {
  const geometry = new ctx.THREE.BoxGeometry(length, height, depth);
  const outline = new ctx.THREE.EdgesGeometry(geometry);
  geometry.dispose();
  const edges = new ctx.THREE.LineSegments(outline, new ctx.THREE.LineBasicMaterial({color, transparent: true, opacity: 0.64}));
  edges.position.set(x, y, z);
  layer.add(edges);
}

function xCylinder(ctx, layer, x, y, z, length, radius, color) {
  const cylinder = new ctx.THREE.Mesh(
    new ctx.THREE.CylinderGeometry(radius, radius, length, 32),
    new ctx.THREE.MeshStandardMaterial({color, metalness: 0.42, roughness: 0.35})
  );
  cylinder.rotation.z = -Math.PI / 2;
  cylinder.position.set(x, y, z);
  layer.add(cylinder);
}

function lineParameters(p) {
  const ratio = p.ratio;
  const er = p.er;
  let effectiveEr = er;
  let impedance;
  if (p.structure === 'coax') {
    impedance = ETA0 / TAU * Math.log(ratio) / Math.sqrt(er);
  } else if (p.structure === 'twin') {
    impedance = ETA0 / Math.PI * Math.acosh(ratio / 2) / Math.sqrt(er);
  } else {
    const phi = (14 + 8 / er) / 11 * 4 / ratio;
    impedance = 42.4 / Math.sqrt(er + 1) * Math.log(1 + 4 / ratio * (phi + Math.sqrt(phi ** 2 + (1 + 1 / er) * Math.PI ** 2 / 2)));
    effectiveEr = (er + 1) / 2 + (er - 1) / (2 * Math.sqrt(1 + 12 / ratio));
  }
  const speed = C / Math.sqrt(effectiveEr);
  return {impedance, speed, effectiveEr, capacitance: 1 / (impedance * speed), inductance: impedance / speed};
}

const transmissionStructures = {
  id: 'tem-lines',
  chapter: 8,
  title: '同轴线、双导线与微带线',
  description: '切换三种传输结构，比较横向电场、横向磁场、特性阻抗和相速度。',
  topics: ['TEM 与准 TEM', '同轴波导', '平行双导线', '微带线', '单位长度电容与电感'],
  params: [
    choice('structure', '传输结构', 'coax', [['coax','同轴线'], ['twin','平行双导线'], ['microstrip','微带线']]),
    range('ratio', '几何比 b/a、D/a 或 w/h', 2.2, 8, 0.1, 3.5),
    range('er', '相对介电常数 εᵣ', 1, 9.5, 0.1, 2.1),
    range('frequency', '频率 f', 0.5, 5, 0.1, 1.5, 'GHz'),
  ],
  legend: [legend('e', '横向电场 E', cyan), legend('h', '横向磁场 H', gold), legend('body', '传输结构', blue)],
  equation: 'Z₀ = √(L′/C′) = 1/(vₚC′)  ·  vₚ = 1/√(L′C′)  ·  Z₀,同轴 = (η/2π) ln(b/a)',
  explanation: '理想同轴线和均匀双导线中的 TEM 模没有纵向场。同轴线的电场沿径向，磁场沿环向。微带跨越空气和介质，采用准静态有效介电常数估算相速度，并以示意箭头表示边缘场。b/a 为同轴外内半径比，D/a 为双线中心距与半径比，w/h 为微带宽高比。',
  task: '固定介电常数，增大几何比，比较同轴线和微带线的 Z₀ 变化方向。然后提高介电常数，观察波长。',
  metrics(p) {
    const v = lineParameters(p);
    return [metric('特性阻抗', format(v.impedance), 'Ω'), metric('导波波长', format(v.speed / (p.frequency * 1e9) * 100), 'cm'), metric('相速度', format(v.speed / C, 3), 'c'), metric('单位长度电容', format(v.capacitance * 1e12, 1), 'pF/m'), metric('单位长度电感', format(v.inductance * 1e9, 1), 'nH/m')];
  },
  chart(p, t) {
    const lambda = lineParameters(p).speed / (p.frequency * 1e9);
    return plot('导行波瞬时相位', '传播距离 x（cm）', '归一化幅值', [
      series('E / E₀ 与 H / H₀', cyan, sample(0, 40, 101, (x) => Math.cos(TAU * x / 100 / lambda - 2.5 * t))),
    ], -1.05, 1.05);
  },
  build(ctx, p) {
    const body = ctx.layer('body');
    const electric = ctx.layer('e');
    const magnetic = ctx.layer('h');
    const slices = [];
    if (p.structure === 'coax') {
      const outer = 1.56;
      const inner = outer / p.ratio;
      const fieldRadius = inner + 0.52 * (outer - inner);
      xCylinder(ctx, body, 0, 0, 0, 9.2, inner, '#b87942');
      for (const x of [-4.55, -3, -1.5, 0, 1.5, 3, 4.55]) {
        ctx.line(body, circle(x, 0, 0, outer), blue, 0.6);
      }
      for (let i = 0; i < 10; i++) {
        const a = TAU * i / 10;
        ctx.line(body, [[-4.55, outer * Math.cos(a), outer * Math.sin(a)], [4.55, outer * Math.cos(a), outer * Math.sin(a)]], blue, 0.38);
      }
      for (let i = 0; i < 9; i++) {
        const x = -4 + i;
        for (let j = 0; j < 7; j++) {
          const a = TAU * j / 7;
          const y = Math.cos(a), z = Math.sin(a);
          slices.push({x, field: [0, y, z], e: movingArrow(ctx, electric, [x, fieldRadius * y, fieldRadius * z], cyan), h: movingArrow(ctx, magnetic, [x, 1.10 * y, 1.10 * z], gold), scale: 0.46 * (outer - inner)});
        }
      }
    } else if (p.structure === 'twin') {
      const center = 1.15;
      const radius = 2 * center / p.ratio;
      const chargeZ = Math.sqrt(center ** 2 - radius ** 2);
      xCylinder(ctx, body, 0, 0, -center, 9.2, radius, '#b87942');
      xCylinder(ctx, body, 0, 0, center, 9.2, radius, blue);
      for (let i = 0; i < 9; i++) {
        const x = -4 + i;
        for (const y of [-1.4, -0.7, 0, 0.7, 1.4]) {
          const plus = y * y + chargeZ * chargeZ;
          const field = [0, 0, 2 * chargeZ / plus];
          slices.push({x, field, e: movingArrow(ctx, electric, [x, y, 0], cyan), h: movingArrow(ctx, magnetic, [x + 0.13, y, 0], gold), scale: 0.46 * (center - radius) * chargeZ});
        }
      }
    } else {
      const width = Math.min(2.7, 0.38 * p.ratio);
      ctx.box(body, [0, -0.52, 0], [9.2, 0.1, 4], blue, 0.85);
      ctx.box(body, [0, -0.11, 0], [9.2, 0.75, 4], '#575987', 0.22);
      ctx.box(body, [0, 0.3, 0], [9.2, 0.1, width], '#b87942', 0.9);
      for (let i = 0; i < 9; i++) {
        const x = -4 + i;
        for (const z of [-1.3, -0.62, 0, 0.62, 1.3]) {
          const fringe = Math.max(0, Math.abs(z) - width / 2);
          const field = [0, -Math.exp(-fringe), 0.5 * Math.sign(z) * fringe];
          slices.push({x, field, e: movingArrow(ctx, electric, [x, -0.11, z], cyan), h: movingArrow(ctx, magnetic, [x + 0.18, -0.11, z], gold), scale: 0.32});
        }
      }
    }
    const lambda = lineParameters(p).speed / (p.frequency * 1e9);
    ctx.label(body, '+x', [5.3, 0, 0], dim);
    return (t) => {
      for (const {x, field, e, h, scale} of slices) {
        const phase = Math.cos(TAU * (x + 4.6) * 0.4 / 9.2 / lambda - 2.5 * t);
        e([0, field[1] * phase, field[2] * phase], scale);
        h([0, -field[2] * phase, field[1] * phase], scale * 0.74);
      }
    };
  },
};

const lineState = (p) => {
  const beta = TAU * p.frequency * 1e9 * Math.sqrt(p.er) / C;
  const gamma = (p.load - p.z0) / (p.load + p.z0);
  const angle = beta * p.length / 100;
  const denominator = p.z0 ** 2 * Math.cos(angle) ** 2 + p.load ** 2 * Math.sin(angle) ** 2;
  const re = p.z0 ** 2 * p.load / denominator;
  const im = p.z0 * (p.z0 ** 2 - p.load ** 2) * Math.sin(angle) * Math.cos(angle) / denominator;
  return {beta, gamma, re, im};
};

const impedanceMatch = {
  id: 'line-matching',
  chapter: 8,
  liveChart: false,
  title: '传输线驻波与阻抗匹配',
  description: '改变负载与电长度，从前行波、反射波和输入阻抗判断匹配。',
  topics: ['无损传输线方程', '传播常数', '输入阻抗', '反射系数', '阻抗匹配'],
  params: [
    range('z0', '特性阻抗 Z₀', 20, 150, 1, 50, 'Ω'),
    range('load', '负载电阻 Rₗ', 2, 220, 1, 110, 'Ω'),
    range('length', '传输线长度 ℓ', 4, 45, 0.5, 25, 'cm'),
    range('frequency', '频率 f', 0.25, 2.5, 0.01, 1, 'GHz'),
    range('er', '相对介电常数 εᵣ', 1, 6, 0.05, 2.25),
  ],
  legend: [legend('sum', '总电压', cyan), legend('forward', '入射电压', green), legend('reverse', '反射电压', gold), legend('line', '传输线与负载', blue)],
  equation: 'Γₗ = (Rₗ − Z₀)/(Rₗ + Z₀)  ·  Zᵢₙ = Z₀(Rₗ + jZ₀ tan βℓ)/(Z₀ + jRₗ tan βℓ)',
  explanation: '设 d 为从负载向源端的距离，电压相量为 V⁺[eʲᵝᵈ + Γₗ e⁻ʲᵝᵈ]。线路无损且负载为实阻，阻抗变换仅由电长度和负载决定。曲线中的入射与反射分量沿相反方向传播。',
  task: '把 Rₗ 调到与 Z₀ 相等，再扫频。比较匹配前后的反射分量、驻波比和输入电抗。',
  metrics(p) {
    const {gamma, re, im, beta} = lineState(p);
    return [metric('负载反射系数', format(gamma, 3)), metric('驻波比', format((1 + Math.abs(gamma)) / (1 - Math.abs(gamma)))), metric('输入阻抗', `${format(re, 1)} ${im < 0 ? '−' : '+'} j${format(Math.abs(im), 1)}`, 'Ω'), metric('相位常数 β', format(beta), 'rad/m')];
  },
  chart(p) {
    const {beta, gamma} = lineState(p);
    return plot('电压驻波包络', '距负载 d（cm）', '|V / V⁺|', [
      series('总电压', cyan, sample(0, p.length, 101, (x) => Math.sqrt(1 + gamma ** 2 + 2 * gamma * Math.cos(2 * beta * x / 100)))),
      series('入射电压', green, [[0, 1], [p.length, 1]]),
      series('反射电压', gold, [[0, Math.abs(gamma)], [p.length, Math.abs(gamma)]]),
    ], 0, 2);
  },
  build(ctx, p) {
    const structure = ctx.layer('line');
    for (const z of [-0.52, 0.52]) {
      beam(ctx, structure, [-4.8, -0.75, z], [4.8, -0.75, z], 0.057, blue);
    }
    ctx.box(structure, [4.8, -0.75, 0], [0.48, 0.38, 1.15], '#bd854e');
    ctx.label(structure, 'Rₗ', [4.85, -0.15, 0], gold);
    ctx.label(structure, '输入端', [-4.8, -1.25, 0], dim);
    const {beta, gamma} = lineState(p);
    const lines = [
      [ctx.layer('sum'), cyan, 0, (a, b) => a + b],
      [ctx.layer('forward'), green, -0.85, (a) => a],
      [ctx.layer('reverse'), gold, 0.85, (_, b) => b],
    ].map(([layer, color, z, f]) => {
      const points = (t) => curve(-4.8, 4.8, 145, (x) => {
        const phase = beta * (4.8 - x) / 9.6 * p.length / 100;
        return [x, 1 + 0.94 * f(Math.cos(2.5 * t + phase), gamma * Math.cos(2.5 * t - phase)), z];
      });
      return {object: ctx.line(layer, points(0), color), points};
    });
    return (t) => lines.forEach(({object, points}) => ctx.updateLine(object, points(t)));
  },
};

function guideState(p) {
  const a = p.a / 100;
  const b = p.b / 100;
  const mode = p.mode;
  const m = Number(mode[2]), n = Number(mode[3]);
  const ku = m * Math.PI / a, kv = n * Math.PI / b;
  const kc = Math.hypot(ku, kv);
  const cutoff = C * kc / TAU;
  const k = TAU * p.frequency * 1e9 / C;
  const alpha = Math.sqrt(Math.max(0, kc ** 2 - k ** 2));
  const beta = Math.sqrt(Math.max(0, k ** 2 - kc ** 2));
  const cutoffs = [1 / a, 1 / b, 2 / a, 2 / b].sort((a, b) => a - b);
  const singleMode = [C / 2 * cutoffs[0], C / 2 * cutoffs[1]];
  return {a, b, mode, ku, kv, kc, k, cutoff, alpha, beta, singleMode};
}

function guideEnvelope(p, state, x) {
  return Math.exp(-state.alpha * x) * 10 ** (-p.loss * x / 20);
}

const rectangularGuide = {
  id: 'rectangular-waveguide',
  chapter: 8,
  liveChart: false,
  title: '矩形波导 TE / TM 模与截止',
  description: '改变模式、波导宽高和激励频率，观察传播、截止与沿程损耗。',
  topics: ['TE₁₀、TE₂₀、TE₀₁、TM₁₁', '矩形波导截止', '单模传输', '波导损耗'],
  view: [10.5, 5.2, 12.5],
  params: [
    choice('mode', '矩形波导模式', 'TE10', [['TE10','TE₁₀'], ['TE20','TE₂₀'], ['TE01','TE₀₁'], ['TE11','TE₁₁'], ['TM11','TM₁₁'], ['TM21','TM₂₁']]),
    range('a', '截面宽度 a', 1.5, 5.2, 0.01, 2.29, 'cm'),
    range('b', '截面高度 b', 0.5, 3.1, 0.01, 1.02, 'cm'),
    range('frequency', '频率 f', 2, 29, 0.1, 10, 'GHz'),
    range('loss', '附加幅度衰减', 0, 35, 0.5, 0, 'dB/m'),
  ],
  legend: [legend('guide', '矩形金属波导', blue), legend('transverse', '横向 E', cyan), legend('axial', '纵向 E', gold)],
  equation: 'f_c = (c/2)√[(m/a)² + (n/b)²]  ·  β² = (ω/c)² − (2πf_c/c)²',
  explanation: '沿 x 传播，宽边 a 沿 −z，高度 b 沿 y。TE 模的纵向电场为零，TM 模的纵向电场满足导体壁上的零切向场条件。低于截止时用倏逝场 e⁻ᵅˣ 表示。附加衰减为独立设定的经验量，零衰减对应理想无耗壁。',
  task: '选择 TE₁₀，把频率调到截止以下，再切换到 TM₁₁。检查纵向电场是否出现，以及不同模式的截止变化。',
  metrics(p) {
    const s = guideState(p);
    const band = s.singleMode.map((f) => format(f / 1e9));
    const single = s.singleMode[1] > s.singleMode[0] * (1 + 1e-9);
    return [metric('所选模截止频率', format(s.cutoff / 1e9), 'GHz'), metric('模式状态', s.beta > 0 ? '传播' : s.alpha > 0 ? '倏逝' : '临界'), metric(s.beta > 0 ? '导波波长' : '倏逝常数', s.beta > 0 ? format(TAU / s.beta * 100) : format(s.alpha), s.beta > 0 ? 'cm' : 'Np/m'), metric('单模频段', single ? `${band[0]}–${band[1]}` : '无单模区间', single ? 'GHz' : '')];
  },
  chart(p) {
    const s = guideState(p);
    return plot('沿程模场包络', '传播距离 x（cm）', '|E / E(0)|', [
      series('含附加衰减', cyan, sample(0, 18, 100, (x) => guideEnvelope(p, s, x / 100))),
      series('理想壁', gold, sample(0, 18, 100, (x) => Math.exp(-s.alpha * x / 100))),
    ], 0, 1.05);
  },
  build(ctx, p) {
    const body = ctx.layer('guide');
    const transverse = ctx.layer('transverse');
    const axial = ctx.layer('axial');
    const s = guideState(p);
    const width = 2.5 * p.a / 2.29;
    const height = 1.34 * p.b / 1.02;
    const length = 9.4;
    wireBox(ctx, body, [0, 0, 0], [length, height, width], blue);
    ctx.box(body, [0, -height / 2, 0], [length, 0.035, width], '#2c4165', 0.28);
    ctx.label(body, 'x →', [5.3, 0, 0], dim);
    ctx.label(body, p.mode, [-4.9, height / 2 + 0.35, 0], cyan);
    const points = [];
    for (let i = 0; i < 12; i++) {
      const x = -4.55 + 9.1 * i / 11;
      const distance = (x + 4.7) / length * 0.18;
      for (const u of [0.13, 0.31, 0.50, 0.69, 0.87]) {
        for (const v of [0.25, 0.5, 0.75]) {
          const y = (v - 0.5) * height;
          const z = (0.5 - u) * width;
          const w = s.ku * u * s.a;
          const h = s.kv * v * s.b;
          const point = {distance, update: movingArrow(ctx, transverse, [x, y, z], cyan)};
          if (p.mode.startsWith('TE')) {
            point.field = [0, -s.ku * Math.sin(w) * Math.cos(h) / s.kc, -s.kv * Math.cos(w) * Math.sin(h) / s.kc];
          } else {
            point.field = [0, s.kv * Math.sin(w) * Math.cos(h) / s.kc, -s.ku * Math.cos(w) * Math.sin(h) / s.kc];
            point.longitudinal = Math.sin(w) * Math.sin(h);
            point.updateAxial = movingArrow(ctx, axial, [x, y, z], gold);
          }
          points.push(point);
        }
      }
    }
    const transverseScale = Math.min(0.65, height * 0.24);
    return (t) => {
      for (const point of points) {
        const phase = 2.6 * t - s.beta * point.distance;
        const envelope = guideEnvelope(p, s, point.distance);
        const cos = Math.cos(phase) * envelope;
        const profile = point.updateAxial
          ? (s.beta * Math.sin(phase) - s.alpha * Math.cos(phase)) * envelope / Math.max(s.kc, s.beta)
          : cos;
        point.update(point.field.map((value) => value * profile), transverseScale);
        if (point.updateAxial) {
          point.updateAxial([point.longitudinal * cos * s.kc / Math.max(s.kc, s.beta), 0, 0], 0.64);
        }
      }
    };
  },
};

function cavityState(p) {
  const a = p.a / 100;
  const d = p.d / 100;
  const frequency = C / 2 * Math.hypot(1 / a, 1 / d);
  const detune = p.detune / 100;
  const power = (fraction) => 1 / (1 + (2 * p.q * fraction) ** 2);
  return {frequency, detune, power, drive: frequency * (1 + detune)};
}

const cavity = {
  id: 'cavity-resonance',
  chapter: 8,
  liveChart: false,
  title: '矩形谐振腔与选频',
  description: '调整封闭矩形腔的尺寸、驱动失谐和 Q 值，观察 TE₁₀₁ 本征场与谐振峰。',
  topics: ['PEC 腔本征模', '驻波边界', '谐振频率', '品质因数 Q'],
  params: [
    range('a', '截面宽度 a', 1.5, 5, 0.01, 2.29, 'cm'),
    range('d', '腔长 d', 1.5, 8, 0.01, 4, 'cm'),
    range('q', '品质因数 Q', 10, 150, 1, 45),
    range('detune', '相对失谐 (f−f₀)/f₀', -12, 12, 0.1, 0, '%'),
  ],
  legend: [legend('body', '金属腔壁', blue), legend('field', '驻波电场 Eᵧ', cyan), legend('profile', '场幅度轮廓', purple)],
  equation: 'f₁₀₁ = (c/2)√(a⁻² + d⁻²)  ·  Eᵧ ∝ sin(πu/a) sin(πx/d)  ·  Δf ≈ f₀/Q',
  explanation: '封闭 PEC 腔只允许满足全部壁面条件的离散本征模。TE₁₀₁ 电场沿 y，两端盖处切向电场为零。实验用单模近谐振洛伦兹曲线展示功率响应，Q 由滑块指定。',
  task: '增大腔长，记录本征频率。把驱动频率设在谐振附近，比较不同 Q 对峰宽与场强的影响。',
  metrics(p) {
    const s = cavityState(p);
    return [metric('本征频率', format(s.frequency / 1e9, 3), 'GHz'), metric('驱动频率', format(s.drive / 1e9, 3), 'GHz'), metric('半功率带宽', format(s.frequency / p.q / 1e6, 1), 'MHz'), metric('归一化功率', format(s.power(s.detune) * 100, 1), '%')];
  },
  chart(p) {
    const s = cavityState(p);
    return plot('单模选频响应', '驱动频率（GHz）', '归一化功率', [
      series('谐振响应', cyan, sample(s.frequency * 0.88 / 1e9, s.frequency * 1.12 / 1e9, 161, (x) => s.power(x * 1e9 / s.frequency - 1))),
      series('驱动点', gold, [[s.drive / 1e9, 0], [s.drive / 1e9, s.power(s.detune)]]),
    ], 0, 1.03);
  },
  build(ctx, p) {
    const body = ctx.layer('body'), field = ctx.layer('field'), profile = ctx.layer('profile');
    const length = 2 + p.d * 0.85;
    const width = 1.1 + p.a * 0.6;
    const height = 2.35;
    wireBox(ctx, body, [0, 0, 0], [length, height, width], blue);
    for (const side of [-1, 1]) {
      ctx.box(body, [side * length / 2, 0, 0], [0.05, height, width], blue, 0.21);
    }
    ctx.label(body, 'TE₁₀₁', [0, height / 2 + 0.4, 0], cyan);
    const amplitude = Math.sqrt(cavityState(p).power(p.detune));
    ctx.line(profile, curve(0, 1, 81, (x) => [(x - 0.5) * length, amplitude * Math.sin(Math.PI * x), 0]), purple, 0.9);
    const arrows = [];
    for (let i = 1; i < 14; i++) {
      for (let j = 1; j < 8; j++) {
        const x = i / 14, u = j / 8;
        arrows.push([movingArrow(ctx, field, [(x - 0.5) * length, 0, (0.5 - u) * width], cyan), amplitude * Math.sin(Math.PI * x) * Math.sin(Math.PI * u)]);
      }
    }
    return (t) => arrows.forEach(([update, amp]) => update([0, amp * Math.cos(2.65 * t), 0], 1.1));
  },
};

function spherical(theta, phi) {
  return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi)];
}

function radiationPattern(ctx, layer, field, radius = 3.0, base = cyan) {
  const positions = [], colors = [], faces = [];
  const rings = 45, segments = 64;
  const low = new ctx.THREE.Color('#3564a8'), high = new ctx.THREE.Color(base);
  for (let i = 0; i <= rings; i++) {
    for (let j = 0; j <= segments; j++) {
      const theta = Math.PI * i / rings;
      const phi = TAU * j / segments;
      const value = field(theta, phi);
      positions.push(...spherical(theta, phi).map((coord) => coord * radius * value));
      colors.push(...low.clone().lerp(high, 0.14 + 0.78 * value).toArray());
      if (i < rings && j < segments) {
        const a = i * (segments + 1) + j;
        const b = a + segments + 1;
        faces.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new ctx.THREE.BufferGeometry();
  geometry.setAttribute('position', new ctx.THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new ctx.THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  const material = new ctx.THREE.MeshStandardMaterial({vertexColors: true, side: ctx.THREE.DoubleSide, transparent: true, opacity: 0.55, roughness: 0.7, metalness: 0.16, depthWrite: false});
  layer.add(new ctx.THREE.Mesh(geometry, material));
  for (let j = 0; j < 8; j++) {
    const phi = j * TAU / 8;
    ctx.line(layer, curve(0, Math.PI, 61, (theta) => spherical(theta, phi).map((x) => x * radius * field(theta, phi))), base, 0.43);
  }
  for (let i = 1; i < 10; i++) {
    const theta = i * Math.PI / 10;
    ctx.line(layer, curve(0, TAU, 97, (phi) => spherical(theta, phi).map((x) => x * radius * field(theta, phi))), base, 0.29);
  }
}

function hertzState(p) {
  const lambda = C / (p.frequency * 1e6);
  const kr = TAU * p.distance;
  const theta = radians(p.angle);
  const u = 1 / kr;
  const farScale = ETA0 * p.current * p.length / 100 / (2 * p.distance * lambda);
  const radial = farScale * 2 * Math.abs(Math.cos(theta)) * Math.hypot(u, u * u);
  const polar = farScale * Math.sin(theta) * Math.hypot(1 - u * u, u);
  const resistance = 2 * Math.PI * ETA0 / 3 * (p.length / 100) ** 2;
  return {lambda, kr, radial, polar, resistance};
}

const hertzDipole = {
  id: 'hertzian-dipole',
  chapter: 9,
  liveChart: false,
  title: '电基本振子：近场、远场与滞后',
  description: '沿径向移动探针，观察随距离衰减的电场分量、辐射传播延迟和方向性。',
  topics: ['赫兹振子', '滞后矢量位', '反应近场', '远区辐射', '线极化'],
  params: [
    range('frequency', '频率 f', 100, 2000, 5, 300, 'MHz'),
    range('length', '电流元长度 ℓ / λ', 0.3, 6, 0.1, 3, '%'),
    range('current', '峰值电流 I₀', 0.1, 3, 0.1, 1, 'A'),
    range('distance', '探针距离 r / λ', 0.06, 2, 0.01, 0.46),
    range('angle', '探针极角 θ', 0, 180, 1, 60, '°'),
  ],
  legend: [legend('source', '电流元', gold), legend('probe', '探针与传播路径', green), legend('e', '瞬时电场 E', cyan), legend('h', '瞬时磁场 H', purple)],
  equation: 'Aᵧ(r,t) = μ₀ℓ I(t−r/c)/(4πr)  ·  Eθ,远 ∝ sin θ/r  ·  U远 ∝ sin² θ',
  explanation: '理想电流元采用均匀电流。径向电场包含 1/r² 和 1/r³ 项，横向电场还含 1/r 辐射项。远区电场与磁场互相垂直且同相，沿轴向辐射为零。三维箭头示意瞬时方向，长度经压缩显示，读数保留物理量。',
  task: '把探针从 0.1λ 移到 1.5λ，比较 Eᵣ 与 Eθ。再将 θ 调到 0°，观察横向电场。',
  metrics(p) {
    const state = hertzState(p);
    return [metric('无量纲距离 kr', format(state.kr, 2)), metric('传播延迟 r/c', format(p.distance / p.frequency * 1000, 3), 'ns'), metric('径向场 |Eᵣ|', format(state.radial, 2), 'V/m'), metric('横向场 |Eθ|', format(state.polar, 2), 'V/m'), metric('总辐射功率', format(p.current ** 2 * state.resistance / 2 * 1000, 2), 'mW')];
  },
  chart(p) {
    const terms = [['辐射项 1/r', cyan, 1], ['感应项 1/r²', gold, 2], ['静电型项 1/r³', purple, 3]];
    return plot('赤道面 Eθ 各项量级', '归一化距离 r / λ', '相对场强（dB）', [
      ...terms.map(([label, color, exponent]) => series(label, color, sample(0.05, 2.05, 151, (r) => 20 * Math.log10(TAU * (TAU * r) ** (-exponent))))),
      series('探针位置', green, [[p.distance, -50], [p.distance, 45]]),
    ], -50, 45);
  },
  build(ctx, p) {
    const source = ctx.layer('source'), probe = ctx.layer('probe'), eLayer = ctx.layer('e'), hLayer = ctx.layer('h');
    const theta = radians(p.angle);
    const probeRadius = 0.62 + 2.92 * Math.sqrt(p.distance / 2);
    const position = spherical(theta, Math.PI / 12).map((x) => x * probeRadius);
    const axis = [0, 0.55 + 2.2 * p.length / 100, 0];
    beam(ctx, source, axis.map((x) => -x), axis, 0.078, gold);
    ctx.sphere(source, axis, 0.107, gold);
    ctx.sphere(source, axis.map((x) => -x), 0.107, gold);
    ctx.label(source, 'I(t)ℓ', [0.26, 0.69, 0], gold);
    ctx.line(probe, [[0, 0, 0], position], green, 0.7);
    ctx.sphere(probe, position, 0.11, green);
    ctx.label(probe, '观测点', [position[0], position[1] + 0.34, position[2]], green);
    const propagation = ctx.sphere(probe, [0, 0, 0], 0.068, green);
    const arrows = [];
    const makeProbe = (distance, radius, theta, phi, emphasized = false) => {
      const direction = spherical(theta, phi);
      const pos = direction.map((x) => x * radius);
      const s = 1 / (TAU * distance);
      const polar = [Math.cos(theta) * Math.cos(phi), -Math.sin(theta), -Math.cos(theta) * Math.sin(phi)];
      const azimuth = [-Math.sin(phi), 0, -Math.cos(phi)];
      arrows.push({
        distance, theta, direction, polar, azimuth, s,
        e: movingArrow(ctx, eLayer, pos, cyan),
        h: movingArrow(ctx, hLayer, pos, purple),
        scale: emphasized ? 1.0 : 0.54,
      });
    };
    for (const [r, radius] of [[0.18, 1.22], [0.42, 2.01], [0.95, 2.8], [1.75, 3.5]]) {
      for (let i = 0; i < 8; i++) {
        makeProbe(r, radius, Math.PI / 2, i * TAU / 8);
      }
      for (const theta of [Math.PI / 5, 4 * Math.PI / 5]) {
        makeProbe(r, radius, theta, Math.PI * 0.55);
        makeProbe(r, radius, theta, Math.PI * 1.55);
      }
    }
    makeProbe(p.distance, probeRadius, theta, Math.PI / 12, true);
    const fieldScale = p.current * p.length / 3 * p.frequency / 300;
    const compress = (v) => v.map((x) => x * fieldScale / (0.7 + fieldScale * Math.hypot(...v)));
    return (t) => {
      propagation.position.set(...position.map((x) => x * ((t * 0.53) % 1)));
      for (const point of arrows) {
        const phase = 2.4 * t - TAU * point.distance;
        const cos = Math.cos(phase), sin = Math.sin(phase), u = point.s;
        const r = 2 * Math.cos(point.theta) * (u * cos + u * u * sin) / point.distance;
        const th = Math.sin(point.theta) * (u * cos - (1 - u * u) * sin) / point.distance;
        const ph = Math.sin(point.theta) * (u * cos - sin) / point.distance;
        point.e(compress(point.direction.map((x, i) => x * r + point.polar[i] * th)), point.scale);
        point.h(compress(point.azimuth.map((x) => x * ph)), point.scale);
      }
    };
  },
};

const smallLoop = {
  id: 'magnetic-loop',
  chapter: 9,
  liveChart: false,
  title: '磁基本振子与接收极化',
  description: '用电小环观察磁偶极辐射，并旋转接收探针检验极化匹配。',
  topics: ['小环天线', '磁基本振子', '方向图', '接收天线', '极化失配'],
  params: [
    range('radius', '小环半径 a / λ', 0.5, 7, 0.1, 3, '%'),
    range('current', '峰值电流 I₀', 0.1, 3, 0.1, 1, 'A'),
    range('polarization', '接收探针转角 ψ', 0, 90, 1, 20, '°'),
  ],
  legend: [legend('loop', '馈电小环', gold), legend('pattern', '远场功率方向图', cyan), legend('rx', '接收探针与极化', green)],
  equation: 'm = I₀πa²  ·  U(θ) ∝ sin² θ  ·  Pᵣ / P匹配 = cos² ψ',
  explanation: '电小环近似为磁偶极子，辐射功率图与同轴电偶极子同形，但电场沿方位方向。位于环平面内的线性接收探针若垂直于入射电场，理想接收功率降为零。模型忽略环导体欧姆损耗。',
  task: '旋转探针到 90°，读出极化耦合。再增大小环半径，比较远场归一化图与辐射电阻的变化。',
  metrics(p) {
    const resistance = ETA0 / (6 * Math.PI) * TAU ** 4 * (Math.PI * (p.radius / 100) ** 2) ** 2;
    return [metric('辐射电阻', format(resistance, 4), 'Ω'), metric('总辐射功率', format(p.current ** 2 * resistance / 2 * 1000, 2), 'mW'), metric('最大方向性', format(10 * Math.log10(1.5)), 'dBi'), metric('相对接收功率', format(Math.cos(radians(p.polarization)) ** 2 * 100, 1), '%')];
  },
  chart(p) {
    const coupling = Math.cos(radians(p.polarization)) ** 2;
    return plot('子午面方向图与极化耦合', '极角 θ（°）', '归一化功率', [
      series('辐射方向图', cyan, sample(0, 180, 121, (a) => Math.sin(radians(a)) ** 2)),
      series('接收投影', green, sample(0, 180, 121, (a) => coupling * Math.sin(radians(a)) ** 2)),
    ], 0, 1.05);
  },
  build(ctx, p) {
    const loop = ctx.layer('loop'), pattern = ctx.layer('pattern'), rx = ctx.layer('rx');
    const loopRadius = 0.35 + p.radius * 0.11;
    ctx.tube(loop, curve(0.13, TAU - 0.13, 100, (a) => [loopRadius * Math.cos(a), 0, loopRadius * Math.sin(a)]), gold, 0.055);
    ctx.label(loop, '馈点', [loopRadius + 0.26, 0.24, 0], gold);
    radiationPattern(ctx, pattern, (theta) => Math.sin(theta) ** 2, 2.82);
    const rxPos = [3.6, 0, 0];
    const a = radians(p.polarization);
    const d = [0, Math.sin(a) * 0.64, Math.cos(a) * 0.64];
    beam(ctx, rx, rxPos.map((x, i) => x - d[i]), rxPos.map((x, i) => x + d[i]), 0.062, green);
    ctx.label(rx, '接收探针', [3.61, 0.95, 0], green);
    const e = movingArrow(ctx, rx, [3.6, -0.32, 0], cyan);
    const charge = ctx.sphere(loop, [loopRadius, 0, 0], 0.087, '#ffeac1');
    return (t) => {
      e([0, 0, Math.cos(2.6 * t - 1.3)], 0.87);
      const theta = 1.4 * Math.sin(2.6 * t);
      charge.position.set(loopRadius * Math.cos(theta), 0.02, loopRadius * Math.sin(theta));
    };
  },
};

function thinDipoleState(p) {
  const length = p.length / 100;
  const k = Math.PI * length;
  const field = (theta) => Math.abs(Math.sin(theta)) < 1e-6 ? 0 : Math.abs((Math.cos(k * Math.cos(theta)) - Math.cos(k)) / Math.sin(theta));
  const n = 240;
  let integral = 0, max = 0;
  for (let i = 0; i < n; i++) {
    const theta = Math.PI * (i + 0.5) / n;
    const power = field(theta) ** 2;
    integral += power * Math.sin(theta) * Math.PI / n;
    max = Math.max(max, power);
  }
  const directivity = 2 * max / integral;
  const resistance = ETA0 / (2 * Math.PI) * integral / Math.sin(k) ** 2;
  const efficiency = resistance / (resistance + p.loss);
  return {length, k, field, max, directivity, resistance, efficiency};
}

const centerFedDipole = {
  id: 'center-fed-dipole',
  chapter: 9,
  liveChart: false,
  title: '中心馈电对称振子与方向图',
  description: '用振子电长度和损耗，比较电流分布、远场瓣形、方向性、效率和增益。',
  topics: ['半波偶极子', '中心馈电', '天线方向图', '辐射电阻', '效率和增益'],
  params: [
    range('length', '总长度 ℓ / λ', 12, 170, 1, 50, '%'),
    range('loss', '等效损耗电阻', 0, 150, 1, 10, 'Ω'),
    choice('trace', '二维图表', 'pattern', [['pattern', '远场方向图'], ['current', '振子电流']]),
  ],
  legend: [legend('feed', '对称振子与馈点', gold), legend('current', '振子瞬时电流', green), legend('pattern', '远场功率方向图', cyan)],
  equation: 'F(θ) ∝ [cos(πℓ cos θ/λ) − cos(πℓ/λ)] / sin θ  ·  G = ηD',
  explanation: '细线振子采用正弦电流近似。辐射效率由馈点辐射电阻与等效损耗电阻计算，增益取方向性乘以效率。图中不含馈线失配。总长接近 λ 时馈点电流趋于节点，馈点辐射电阻对实际结构很敏感。',
  task: '将总长从 0.5λ 增至 1.5λ，观察副瓣与峰值方向。保持长度，增大损耗电阻，比较方向性和增益。',
  metrics(p) {
    const state = thinDipoleState(p);
    return [metric('方向性', format(10 * Math.log10(state.directivity)), 'dBi'), metric('增益', format(10 * Math.log10(state.directivity * state.efficiency)), 'dBi'), metric('辐射效率', format(state.efficiency * 100, 1), '%'), metric('馈点辐射电阻', Math.abs(Math.sin(state.k)) < 0.002 ? '节点极限' : format(state.resistance, 1), 'Ω')];
  },
  chart(p) {
    const state = thinDipoleState(p);
    if (p.trace === 'current') {
      return plot('细线正弦电流分布', '沿振子位置 y / λ', 'I / I₀', [
        series('电流', green, sample(-state.length / 2, state.length / 2, 151, (y) => Math.sin(TAU * (state.length / 2 - Math.abs(y))))),
      ], -1.05, 1.05);
    }
    return plot('子午面功率方向图', '极角 θ（°）', '归一化功率', [
      series('对称振子', cyan, sample(0, 180, 181, (a) => state.field(radians(a)) ** 2 / state.max)),
      series('电基本振子', purple, sample(0, 180, 181, (a) => Math.sin(radians(a)) ** 2)),
    ], 0, 1.06);
  },
  build(ctx, p) {
    const feed = ctx.layer('feed'), current = ctx.layer('current'), pattern = ctx.layer('pattern');
    const state = thinDipoleState(p);
    const half = 0.45 + 1.33 * state.length;
    for (const sign of [-1, 1]) {
      beam(ctx, feed, [0, sign * 0.13, 0], [0, sign * half, 0], 0.053, gold);
      ctx.sphere(feed, [0, sign * 0.13, 0], 0.083, gold);
    }
    ctx.label(feed, '中心馈电', [0.23, 0.02, 0], gold);
    radiationPattern(ctx, pattern, (theta) => state.field(theta) ** 2 / state.max, 3.18);
    const points = (t) => curve(-half, half, 121, (y) => {
      const distance = (1 - Math.abs(y / half)) * state.length / 2;
      return [0.54 * Math.sin(TAU * distance) * Math.cos(2.6 * t), y, 0.14];
    });
    const trace = ctx.line(current, points(0), green);
    return (t) => ctx.updateLine(trace, points(t));
  },
};

function arrayState(p) {
  const step = TAU * p.spacing;
  const delta = radians(p.phase);
  const power = (theta, phi) => {
    const q = step * Math.sin(theta) * Math.cos(phi) + delta;
    const denominator = Math.sin(q / 2);
    const arrayFactor = Math.abs(denominator) < 1e-8 ? 1 : Math.sin(p.count * q / 2) / (p.count * denominator);
    return (arrayFactor * Math.sin(theta)) ** 2;
  };
  let sum = 0;
  const nTheta = 60, nPhi = 112;
  for (let i = 0; i < nTheta; i++) {
    const theta = Math.PI * (i + 0.5) / nTheta;
    for (let j = 0; j < nPhi; j++) {
      sum += power(theta, TAU * j / nPhi) * Math.sin(theta);
    }
  }
  const kMax = Math.floor((delta + step) / TAU);
  const kMin = Math.ceil((delta - step) / TAU);
  const principal = kMax >= kMin ? Math.max(kMin, Math.min(kMax, 0)) : null;
  const peak = principal === null ? Math.max(...sample(0, Math.PI, 301, (angle) => power(Math.PI / 2, angle)).map(([, y]) => y)) : 1;
  const angle = principal === null
    ? sample(0, 180, 361, (a) => power(Math.PI / 2, radians(a))).reduce((best, point) => point[1] > best[1] ? point : best)[0]
    : Math.acos(Math.max(-1, Math.min(1, (TAU * principal - delta) / step))) * 180 / Math.PI;
  return {power, peak, angle, coherentOrders: Math.max(0, kMax - kMin + 1), directivity: 2 * nTheta * nPhi * peak / (Math.PI * sum)};
}

const dipoleArray = {
  id: 'dipole-array',
  chapter: 9,
  liveChart: false,
  title: '线阵天线与波束扫描',
  description: '改变阵元数、间距与相位差，观察主瓣转向、旁瓣与栅瓣。',
  topics: ['阵列因子', '方向图相乘', '相位扫描', '栅瓣', '方向性'],
  params: [
    range('count', '阵元数 N', 2, 10, 1, 5),
    range('spacing', '间距 d / λ', 0.18, 1.35, 0.01, 0.5),
    range('phase', '相邻激励相位差 Δφ', -180, 180, 1, -35, '°'),
  ],
  legend: [legend('array', '阵列与馈电相位', gold), legend('pattern', '总功率方向图', cyan), legend('scan', '代表性峰值方向', green)],
  equation: 'P(θ,φ) ∝ sin² θ · |Σₙ exp[jn(kd sin θ cos φ + Δφ)]/N|²',
  explanation: '沿 x 排列的阵元为理想 y 向电基本振子，幅度相同，相位等差。总方向图等于阵元图与阵列因子相乘，忽略互耦。对称平面可能存在多个等高峰，读数标记 0°–180° 内的代表方向。',
  task: '在 d = 0.5λ 下扫描相位。将间距增至 d > λ，比较相位同相叠加的方向和功率图。',
  metrics(p) {
    const a = arrayState(p);
    return [metric('代表性峰值方位', format(a.angle, 1), '°'), metric('同相叠加阶数', a.coherentOrders), metric('阵列方向性', format(10 * Math.log10(a.directivity)), 'dBi')];
  },
  chart(p) {
    const a = arrayState(p);
    return plot('水平面阵列方向图', '方位角 φ（°）', '相对功率（dB）', [
      series('阵列', cyan, sample(0, 360, 361, (angle) => Math.max(-40, 10 * Math.log10(a.power(Math.PI / 2, radians(angle)) / a.peak)))),
      series('代表性峰值', green, [[a.angle, -40], [a.angle, 0]]),
    ], -40, 2);
  },
  build(ctx, p) {
    const array = ctx.layer('array'), pattern = ctx.layer('pattern'), scan = ctx.layer('scan');
    const a = arrayState(p);
    radiationPattern(ctx, pattern, (theta, phi) => a.power(theta, phi) / a.peak, 3.78);
    const pitch = Math.min(8.2 / (p.count - 1), p.spacing * 2.4);
    const half = pitch * (p.count - 1) / 2;
    ctx.line(array, [[-half - 0.35, 0, 0], [half + 0.35, 0, 0]], blue, 0.75);
    const feeders = [];
    for (let i = 0; i < p.count; i++) {
      const x = pitch * i - half;
      beam(ctx, array, [x, -0.49, 0], [x, 0.49, 0], 0.035, gold);
      feeders.push(ctx.sphere(array, [x, 0, 0], 0.092, gold));
    }
    const scanDirection = spherical(Math.PI / 2, radians(a.angle));
    ctx.arrow(scan, [0, 0.04, 0], scanDirection, 4.32, green);
    ctx.label(scan, `${format(a.angle, 0)}°`, scanDirection.map((x, i) => x * 4.43 + (i === 1 ? 0.25 : 0)), green);
    return (t) => feeders.forEach((point, i) => point.scale.setScalar(0.8 + 0.29 * Math.cos(2.8 * t + i * radians(p.phase))));
  },
};

const EARTH_KM = 6371;
const REFRACTED_EARTH_KM = 4 / 3 * EARTH_KM;
const earthBulge = (distance, fraction) => (distance * 1000) ** 2 * fraction * (1 - fraction) / (2 * REFRACTED_EARTH_KM * 1000);

function travelMarker(ctx, parent, points, color, speed = 0.32) {
  const distances = points.slice(1).map((point, i) => Math.hypot(...point.map((value, axis) => value - points[i][axis])));
  const length = distances.reduce((sum, value) => sum + value, 0);
  const dot = ctx.sphere(parent, points[0], 0.092, color);
  return (t) => {
    let distance = (t * speed % 1) * length;
    let i = 0;
    while (i < distances.length - 1 && distance > distances[i]) {
      distance -= distances[i++];
    }
    const fraction = distances[i] > 0 ? distance / distances[i] : 0;
    dot.position.set(...points[i].map((value, axis) => value + (points[i + 1][axis] - value) * fraction));
  };
}

function radioModesState(p) {
  const horizon = 2 * Math.sqrt(2 * REFRACTED_EARTH_KM * p.tower / 1000);
  const incidence = Math.atan(p.distance / (2 * p.layer));
  const muf = p.critical / Math.cos(incidence);
  return {horizon, incidence, muf};
}

const radioModes = {
  id: 'propagation-paths',
  chapter: 10,
  liveChart: false,
  title: '地波、天波与视距传播',
  description: '比较贴地传播、电离层单跳和空间直达路径，调整频率与传播环境。',
  topics: ['地波', '电离层天波', '视距与无线电视距', '不同频段的传播方式'],
  params: [
    choice('mode', '观测路径', 'sky', [['ground','地波'], ['sky','天波'], ['los','视距']]),
    range('distance', '两端地表距离 d', 20, 2200, 5, 660, 'km'),
    range('frequency', '工作频率 f', 0.1, 100, 0.1, 10, 'MHz'),
    range('layer', '电离层虚高 h', 150, 450, 5, 260, 'km'),
    range('critical', '垂直临界频率 f₀', 2, 15, 0.1, 8, 'MHz'),
    range('tower', '两端天线高度', 10, 800, 5, 95, 'm'),
  ],
  legend: [legend('ground', '地波', green), legend('sky', '天波', purple), legend('los', '直达波', cyan), legend('earth', '地表和电离层', blue)],
  equation: 'MUF ≈ f₀ sec i  ·  tan i ≈ d/(2h)  ·  d视距 ≈ √(2kRₑhₜ) + √(2kRₑhᵣ)',
  explanation: '地波沿地表传播，常见于低频和中频。高频天波可经电离层折返，单跳平层近似给出最高可用频率 MUF。VHF 与更高频段常用视距传播。视距估计采用 4/3 等效地球半径，示意图的竖向尺度经过夸张。',
  task: '在天波模式下把频率调过 MUF，观察路径变化。切到视距模式，缩短距离并提高天线，比较两端覆盖。',
  metrics(p) {
    const s = radioModesState(p);
    const status = p.mode === 'sky' ? (p.frequency <= s.muf ? '低于 MUF' : '超过 MUF')
      : p.mode === 'los' ? (p.distance <= s.horizon ? '理论视距内' : '超出视距')
      : p.frequency <= 2 ? '常用低／中频' : '损耗通常增大';
    return [metric('当前路径判据', status), metric('单跳最高可用频率', format(s.muf), 'MHz'), metric('等高天线视距', format(s.horizon, 1), 'km'), metric('电离层入射角', format(s.incidence * 180 / Math.PI, 1), '°')];
  },
  chart(p) {
    const s = radioModesState(p);
    if (p.mode === 'sky') {
      return plot('单跳最高可用频率', '地表距离 d（km）', '频率（MHz）', [
        series('MUF', purple, sample(0, 2200, 100, (d) => p.critical * Math.hypot(1, d / (2 * p.layer)))),
        series('工作频率', gold, [[0, p.frequency], [2200, p.frequency]]),
        series('当前距离', green, [[p.distance, 0], [p.distance, s.muf]]),
      ], 0);
    }
    if (p.mode === 'los') {
      return plot('等高天线无线电视距', '单端天线高度（m）', '视距（km）', [
        series('视距上限', cyan, sample(10, 800, 101, (h) => 2 * Math.sqrt(2 * REFRACTED_EARTH_KM * h / 1000))),
        series('当前距离', gold, [[10, p.distance], [800, p.distance]]),
        series('当前高度', green, [[p.tower, 0], [p.tower, s.horizon]]),
      ], 0);
    }
    return plot('地波沿等效地表传播示意', '水平距离（km）', '相对两端连线高度（m）', [
      series('曲率剖面', green, sample(0, p.distance, 121, (d) => earthBulge(p.distance, d / p.distance))),
    ], 0);
  },
  build(ctx, p) {
    const earth = ctx.layer('earth'), ground = ctx.layer('ground'), sky = ctx.layer('sky'), los = ctx.layer('los');
    const s = radioModesState(p);
    const sag = 0.16 + 1.16 * Math.sqrt(p.distance / 2200);
    const surface = (x) => -1.46 - sag * (x / 5) ** 2;
    const height = 0.12 + 0.74 * Math.sqrt(p.tower / 800);
    const h = 0.8 + p.layer / 260;
    for (const z of [-2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4]) {
      ctx.line(earth, curve(-5.55, 5.55, 51, (x) => [x, surface(x), z]), blue, z === 0 ? 0.64 : 0.34);
    }
    for (let x = -5.5; x <= 5.5; x += 0.5) {
      ctx.line(earth, [[x, surface(x), -2.4], [x, surface(x), 2.4]], blue, 0.24);
    }
    ctx.box(earth, [0, h, 0], [9.9, 0.025, 4.3], '#716ac5', 0.12);
    ctx.label(earth, '电离层虚高', [0, h + 0.32, 0], purple);
    const y = surface(5) + height;
    for (const sign of [-1, 1]) {
      beam(ctx, earth, [sign * 5, surface(5), 0], [sign * 5, y, 0], 0.043, dim);
      ctx.sphere(earth, [sign * 5, y, 0], 0.116, gold);
      ctx.label(earth, sign === -1 ? 'TX' : 'RX', [sign * 5, y + 0.28, 0], gold);
    }
    const skyViable = p.frequency <= s.muf;
    const routes = [
      {name: 'ground', layer: ground, color: green, points: curve(-5, 5, 57, (x) => [x, surface(x) + height * 0.6, 0.23])},
      {name: 'sky', layer: sky, color: purple, points: skyViable ? [[-5, y, 0], [0, h, 0], [5, y, 0]] : [[-5, y, 0], [0, h, 0], [1.2, Math.min(3.45, h + 0.85), 0]]},
      {name: 'los', layer: los, color: s.horizon >= p.distance ? cyan : red, points: [[-5, y, 0], [5, y, 0]]},
    ];
    let animate;
    for (const route of routes) {
      const active = route.name === p.mode;
      const radius = active ? 0.043 : 0.021;
      const opacity = active ? 0.94 : 0.43;
      if (route.name === 'ground') ctx.tube(route.layer, route.points, route.color, radius, opacity);
      else route.points.slice(1).forEach((point, i) => beam(ctx, route.layer, route.points[i], point, radius, route.color, opacity));
      if (active) {
        animate = travelMarker(ctx, route.layer, route.points, route.color);
      }
    }
    return animate;
  },
};

function fresnelState(p) {
  const lambda = C / (p.frequency * 1e9);
  const fraction = p.location / 100;
  const radius = (f) => Math.sqrt(lambda * p.distance * 1000 * f * (1 - f));
  const ray = (f) => p.tx + (p.rx - p.tx) * f;
  const obstacle = earthBulge(p.distance, fraction) + p.obstacle;
  const clearance = ray(fraction) - obstacle;
  return {fraction, radius, ray, obstacle, clearance};
}

const fresnelClearance = {
  id: 'fresnel-clearance',
  chapter: 10,
  liveChart: false,
  title: '视距链路与第一菲涅耳区',
  description: '调节塔高、障碍物与频率，比较几何视距和第一菲涅耳区余隙。',
  topics: ['第一菲涅耳区', '传播余隙', '地球曲率', '障碍物绕射'],
  params: [
    range('frequency', '工作频率 f', 0.45, 10, 0.05, 2.4, 'GHz'),
    range('distance', '链路距离 d', 2, 65, 0.5, 24, 'km'),
    range('tx', '发射塔高', 8, 160, 1, 55, 'm'),
    range('rx', '接收塔高', 8, 160, 1, 46, 'm'),
    range('obstacle', '障碍物高度', 0, 120, 1, 27, 'm'),
    range('location', '障碍位置 d₁ / d', 10, 90, 1, 53, '%'),
  ],
  legend: [legend('terrain', '地形与通信塔', blue), legend('zone', '第一菲涅耳区', purple), legend('ray', '直达路径', cyan), legend('obstacle', '障碍物', gold)],
  equation: 'r₁ = √[λd₁d₂/(d₁+d₂)]  ·  余隙 = h直达线 − h障碍顶',
  explanation: '地球曲率按 4/3 等效半径折算进剖面。障碍物即使未遮挡直达线，也可能侵入第一菲涅耳区。实验以障碍处保留 0.6r₁ 作为常用余隙检查，完整链路还需检查沿途地形与绕射。',
  task: '提高障碍物，找到仍有几何视距但 60% 余隙不足的位置。再比较改变频率或提高塔高的影响。',
  metrics(p) {
    const s = fresnelState(p);
    const r = s.radius(s.fraction);
    return [metric('第一菲涅耳半径', format(r, 1), 'm'), metric('几何余隙', format(s.clearance, 1), 'm'), metric('60% 余隙裕量', format(s.clearance - 0.6 * r, 1), 'm'), metric('障碍处状态', s.clearance < 0 ? '直达线遮挡' : s.clearance < 0.6 * r ? '60% 余隙不足' : '满足 60% 余隙')];
  },
  chart(p) {
    const s = fresnelState(p);
    return plot('链路高度剖面', '距发射端（km）', '等效高度（m）', [
      series('地表', blue, sample(0, p.distance, 121, (d) => earthBulge(p.distance, d / p.distance))),
      series('直达线', cyan, [[0, p.tx], [p.distance, p.rx]]),
      series('第一菲涅耳区下缘', purple, sample(0, p.distance, 121, (d) => s.ray(d / p.distance) - s.radius(d / p.distance))),
      series('障碍物', gold, [[p.distance * s.fraction, earthBulge(p.distance, s.fraction)], [p.distance * s.fraction, s.obstacle]]),
    ]);
  },
  build(ctx, p) {
    const terrain = ctx.layer('terrain'), zone = ctx.layer('zone'), ray = ctx.layer('ray'), obstacle = ctx.layer('obstacle');
    const s = fresnelState(p);
    const scale = 4.2 / Math.max(p.tx, p.rx, s.obstacle, s.ray(0.5) + s.radius(0.5), 32);
    const x = (fraction) => 9.7 * (fraction - 0.5);
    const y = (height) => -1.8 + scale * height;
    const ground = (f) => earthBulge(p.distance, f);
    for (let i = -4; i <= 4; i++) {
      const z = i * 0.57;
      ctx.line(terrain, curve(0, 1, 51, (f) => [x(f), y(ground(f)), z]), blue, i === 0 ? 0.7 : 0.34);
    }
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      ctx.line(terrain, [[x(f), y(ground(f)), -2.28], [x(f), y(ground(f)), 2.28]], blue, 0.27);
    }
    for (const [f, label] of [[0, 'TX'], [1, 'RX']]) {
      beam(ctx, terrain, [x(f), y(0), 0], [x(f), y(s.ray(f)), 0], 0.05, dim);
      ctx.sphere(terrain, [x(f), y(s.ray(f)), 0], 0.105, gold);
      ctx.label(terrain, label, [x(f), y(s.ray(f)) + 0.29, 0], gold);
    }
    for (let i = 1; i < 12; i++) {
      const f = i / 12;
      ctx.line(zone, circle(x(f), y(s.ray(f)), 0, scale * s.radius(f)), purple, 0.53);
    }
    for (let j = 0; j < 8; j++) {
      const angle = TAU * j / 8;
      ctx.line(zone, curve(0, 1, 61, (f) => [x(f), y(s.ray(f) + s.radius(f) * Math.cos(angle)), scale * s.radius(f) * Math.sin(angle)]), purple, 0.51);
    }
    const groundAt = ground(s.fraction);
    const f = s.fraction;
    ctx.box(obstacle, [x(f), y(groundAt + p.obstacle / 2), 0], [0.38, Math.max(0.015, scale * p.obstacle), 0.62], '#dc9e5d', 0.86);
    ctx.label(obstacle, '障碍物', [x(f), y(s.obstacle) + 0.27, 0.4], gold);
    const points = [[x(0), y(p.tx), 0], [x(1), y(p.rx), 0]];
    const pathColor = s.clearance < 0 ? red : cyan;
    beam(ctx, ray, points[0], points[1], 0.037, pathColor, 0.86);
    return travelMarker(ctx, ray, points, pathColor);
  },
};

function twoRay(p, distance) {
  const direct = Math.hypot(distance, p.tx - p.rx);
  const reflected = Math.hypot(distance, p.tx + p.rx);
  const delta = 4 * p.tx * p.rx / (reflected + direct);
  const coefficient = p.coefficient * direct / reflected;
  const phase = radians(p.phase) - TAU * p.frequency * 1e9 * delta / C;
  const normalized = (1 + coefficient * Math.cos(phase)) ** 2 + (coefficient * Math.sin(phase)) ** 2;
  return {direct, reflected, delta, powerDb: 10 * Math.log10(Math.max(1e-12, normalized)), phase};
}

const multipath = {
  id: 'two-ray-multipath',
  chapter: 10,
  liveChart: false,
  title: '地面反射与移动多径衰落',
  description: '移动接收端并改变反射系数，观察直达波与反射波相干叠加。',
  topics: ['两径模型', '相干叠加', '路径差', '移动信道', '多径衰落'],
  params: [
    range('frequency', '载波频率 f', 0.4, 6, 0.01, 2.4, 'GHz'),
    range('distance', '接收端距离 d', 20, 650, 1, 137, 'm'),
    range('tx', '发射天线高度', 1, 17, 0.1, 6, 'm'),
    range('rx', '接收天线高度', 1, 9, 0.1, 1.6, 'm'),
    range('coefficient', '地面反射系数幅值', 0, 1, 0.01, 0.87),
    range('phase', '反射附加相位', 0, 360, 1, 180, '°'),
  ],
  legend: [legend('body', '地面与天线', blue), legend('direct', '直达路径', cyan), legend('reflected', '反射路径', purple)],
  equation: 'E / E直达 = 1 + |Γ|(r₀/r₁)exp[j(argΓ − k(r₁−r₀))]',
  explanation: '平坦地面采用镜面反射，几何路径分别按两端高度差与高度和计算。反射系数由参数独立指定，功率相对同距离直达波归一化，用于观察小尺度衰落。',
  task: '改变接收端距离找到深衰落点。将反射系数幅值调为 0，观察图中的干涉起伏。',
  metrics(p) {
    const s = twoRay(p, p.distance);
    return [metric('路径差 Δr', format(s.delta * 100, 2), 'cm'), metric('时延差 Δτ', format(s.delta / C * 1e9, 3), 'ns'), metric('相位差', format(((s.phase * 180 / Math.PI) % 360 + 360) % 360, 1), '°'), metric('相对接收功率', format(s.powerDb, 1), 'dB')];
  },
  chart(p) {
    return plot('相干叠加导致的空间衰落', '接收端距离（m）', '相对直达功率（dB）', [
      series('直达 + 反射', purple, sample(20, 650, 1001, (d) => Math.max(-45, twoRay(p, d).powerDb))),
      series('仅直达', cyan, [[20, 0], [650, 0]]),
      series('当前接收端', gold, [[p.distance, -45], [p.distance, Math.max(-45, twoRay(p, p.distance).powerDb)]]),
    ], -45, 7);
  },
  build(ctx, p) {
    const body = ctx.layer('body'), direct = ctx.layer('direct'), reflected = ctx.layer('reflected');
    const base = -1.45, scale = 2.7 / Math.max(7, p.tx, p.rx);
    const xSpan = 4 + 5.6 * Math.sqrt(p.distance / 650);
    const tx = [-xSpan / 2, base + p.tx * scale, 0], rx = [xSpan / 2, base + p.rx * scale, 0];
    const bounce = [xSpan * (p.tx / (p.tx + p.rx) - 0.5), base, 0];
    ctx.box(body, [0, base - 0.035, 0], [10.5, 0.07, 4.5], '#344d6a', 0.29);
    for (let i = -4; i <= 4; i++) {
      const z = i * 0.55;
      ctx.line(body, [[-5.2, base, z], [5.2, base, z]], blue, 0.38);
    }
    for (const [endpoint, label] of [[tx, 'TX'], [rx, '移动 RX']]) {
      beam(ctx, body, [endpoint[0], base, 0], endpoint, 0.055, dim);
      ctx.sphere(body, endpoint, 0.12, gold);
      ctx.label(body, label, [endpoint[0], endpoint[1] + 0.3, 0], gold);
    }
    beam(ctx, direct, tx, rx, 0.039, cyan);
    const animateDirect = travelMarker(ctx, direct, [tx, rx], cyan, 0.37);
    if (p.coefficient === 0) return animateDirect;
    const opacity = 0.2 + 0.75 * p.coefficient;
    beam(ctx, reflected, tx, bounce, 0.035, purple, opacity);
    beam(ctx, reflected, bounce, rx, 0.035, purple, opacity);
    ctx.sphere(reflected, bounce, 0.11, purple, opacity);
    ctx.label(reflected, '反射点', [bounce[0], bounce[1] - 0.32, 0.1], purple);
    const animateReflected = travelMarker(ctx, reflected, [tx, bounce, rx], purple, 0.29);
    return (t) => {
      animateDirect(t);
      animateReflected(t);
    };
  },
};

const slantRange = (altitude, elevation) => {
  const e = radians(elevation);
  return Math.sqrt((EARTH_KM + altitude) ** 2 - (EARTH_KM * Math.cos(e)) ** 2) - EARTH_KM * Math.sin(e);
};

const freeSpaceLoss = (distanceKm, frequencyGHz) => 20 * Math.log10(4 * Math.PI * distanceKm * 1e3 * frequencyGHz * 1e9 / C);

function linkState(p) {
  const altitude = p.mode === 'geo' ? 35786 : 550;
  const distance = p.mode === 'mobile' ? p.distance : slantRange(altitude, p.elevation);
  const loss = freeSpaceLoss(distance, p.frequency);
  const power = p.eirp + p.gain - loss - p.loss;
  return {altitude, distance, loss, power};
}

const satelliteLink = {
  id: 'mobile-satellite-link',
  chapter: 10,
  liveChart: false,
  title: '移动与卫星通信链路预算',
  description: '比较地面移动、低轨和地球同步轨道的自由空间路径损耗与链路余量。',
  topics: ['地面移动链路', '低轨卫星与 GEO', '传播仰角与斜距', '自由空间路径损耗', '接收功率'],
  params: [
    choice('mode', '链路模式', 'leo', [['mobile','地面移动'], ['leo','低轨 550 km'], ['geo','地球同步轨道']]),
    range('frequency', '载波频率', 0.7, 36, 0.1, 12, 'GHz'),
    range('distance', '地面距离（移动链路）', 0.1, 15, 0.1, 2, 'km'),
    range('elevation', '地面站仰角（卫星链路）', 5, 90, 1, 30, '°'),
    range('eirp', '等效全向辐射功率', 20, 95, 1, 66, 'dBm'),
    range('gain', '接收天线增益', 0, 50, 1, 28, 'dBi'),
    range('loss', '大气、雨衰等附加损耗', 0, 25, 0.5, 3, 'dB'),
    range('threshold', '接收灵敏度门限', -130, -55, 1, -110, 'dBm'),
  ],
  legend: [legend('earth', '地表与接收站', blue), legend('source', '发射端', gold), legend('link', '空间直达链路', cyan)],
  equation: 'L_FS = 20 log₁₀(4πr/λ)  ·  Pᵣ(dBm) = EIRP + Gᵣ − L_FS − L附加',
  explanation: '卫星斜距由球形地球与仰角求得，地面模式使用参数给出的链路距离。模型把大气吸收、雨衰和工程余量简化为附加损耗，移动链路的遮挡和多径可在对应案例中单独观察。',
  task: '固定收发参数，从低轨切换到 GEO，再增大仰角。比较路径损耗、接收功率与灵敏度门限。',
  metrics(p) {
    const s = linkState(p);
    return [metric('传播距离', format(s.distance, 1), 'km'), metric('自由空间损耗', format(s.loss, 1), 'dB'), metric('接收功率', format(s.power, 1), 'dBm'), metric('链路余量', format(s.power - p.threshold, 1), 'dB')];
  },
  chart(p) {
    const s = linkState(p);
    const mobile = p.mode === 'mobile';
    const start = mobile ? 0.1 : 5;
    const end = mobile ? 15 : 90;
    const position = mobile ? p.distance : p.elevation;
    return plot('接收功率与门限', mobile ? '地面距离（km）' : '地面站仰角（°）', '接收功率（dBm）', [
      series('接收功率', cyan, sample(start, end, 101, (x) => p.eirp + p.gain - freeSpaceLoss(mobile ? x : slantRange(s.altitude, x), p.frequency) - p.loss)),
      series('灵敏度门限', gold, [[start, p.threshold], [end, p.threshold]]),
      series('当前设置', green, [[position, Math.min(s.power, p.threshold)], [position, Math.max(s.power, p.threshold)]]),
    ]);
  },
  build(ctx, p) {
    const earth = ctx.layer('earth'), source = ctx.layer('source'), link = ctx.layer('link');
    const s = linkState(p);
    const isMobile = p.mode === 'mobile';
    const earthHeight = (x) => -1.75 - 0.034 * x * x;
    for (let i = -4; i <= 4; i++) {
      const z = 0.64 * i;
      ctx.line(earth, curve(-5.5, 5.5, 51, (x) => [x, earthHeight(x) - 0.035 * z * z, z]), blue, 0.44);
    }
    for (let i = -5; i <= 5; i++) {
      ctx.line(earth, curve(-2.56, 2.56, 25, (z) => [i, earthHeight(i) - 0.035 * z * z, z]), blue, 0.34);
    }
    const rx = [-3.7, earthHeight(-3.7) + 0.66, 0];
    beam(ctx, earth, [rx[0], earthHeight(rx[0]), 0], rx, 0.06, dim);
    ctx.sphere(earth, rx, 0.15, gold);
    ctx.label(earth, 'RX', [rx[0], rx[1] - 0.38, 0.34], dim);
    const a = radians(p.elevation);
    const tx = isMobile ? [0.7 + 4 * Math.sqrt(p.distance / 15), -0.66, 0] : [rx[0] + 7.25 * Math.cos(a), rx[1] + 0.7 + 3.6 * Math.sin(a), -0.27];
    if (isMobile) {
      beam(ctx, source, [tx[0], earthHeight(tx[0]), 0], tx, 0.055, dim);
      ctx.sphere(source, tx, 0.13, gold);
    } else {
      ctx.box(source, tx, [0.49, 0.33, 0.39], '#c3945e');
      for (const sign of [-1, 1]) {
        ctx.box(source, [tx[0] + sign * 0.62, tx[1], tx[2]], [0.61, 0.047, 0.61], '#5b88c8');
      }
      ctx.line(source, curve(-1, 1, 65, (x) => [tx[0] + 2.45 * x, tx[1] + 0.36 * x * x, tx[2] - 0.48 * x]), purple, 0.33);
    }
    ctx.label(source, isMobile ? '基站' : p.mode === 'leo' ? 'LEO' : 'GEO', [tx[0], tx[1] + 0.33, tx[2]], gold);
    const color = s.power >= p.threshold ? cyan : red;
    beam(ctx, link, tx, rx, 0.042, color, 0.91);
    return travelMarker(ctx, link, [tx, rx], color, 0.35);
  },
};

const materialPresets = {
  ground: {er: 7, conductivity: 0.008},
  fresh: {er: 79, conductivity: 0.015},
  sea: {er: 78, conductivity: 4},
  aluminum: {er: 1, conductivity: 3.5e7},
};

function materialState(p) {
  const {er, conductivity} = materialPresets[p.material];
  const omega = TAU * p.frequency * 1e6;
  const epsilon = EPS0 * er;
  const ratio = conductivity / (omega * epsilon);
  const root = Math.hypot(1, ratio);
  const k = omega * Math.sqrt(MU0 * epsilon);
  const alpha = k * ratio / Math.sqrt(2 * (root + 1));
  const beta = k * Math.sqrt((root + 1) / 2);
  const depth = 10 ** p.depth;
  return {alpha, beta, depth, conductivity, attenuation: alpha * depth * 20 / Math.LN10};
}

function lengthLabel(m) {
  if (m < 0.001) return [format(m * 1e6, 2), 'μm'];
  if (m < 1) return [format(m * 1000, 2), 'mm'];
  return [format(m, 2), 'm'];
}

const mediaLoss = {
  id: 'material-attenuation',
  chapter: 10,
  liveChart: false,
  title: '地下、水下传播与导体屏蔽',
  description: '切换土壤、水和金属，比较同一频率下的场衰减深度与吸收损耗。',
  topics: ['地下与水下传播', '地面电特性', '电导率与吸收', '电磁兼容', '屏蔽材料趋肤深度'],
  params: [
    choice('material', '传播介质', 'sea', [['ground','潮湿土壤'], ['fresh','淡水'], ['sea','海水'], ['aluminum','铝屏蔽层']]),
    range('frequency', '工作频率 f', 0.01, 80, 0.01, 0.35, 'MHz'),
    range('depth', '深度指数 log₁₀(d / m)', -5, 2, 0.05, -0.15),
  ],
  legend: [legend('medium', '有耗介质', blue), legend('field', '介质内波形', cyan), legend('envelope', '振幅包络', gold)],
  equation: 'α = ω√(με) · √[(√(1 + (σ/ωε)²) − 1)/2]  ·  δ = 1/α  ·  |E|/|E(0⁺)| = e⁻ᵅᵈ',
  explanation: '均匀导电介质的传播常数同时含衰减和相位。材料参数取示例值。铝层计算体吸收，实际屏蔽还取决于界面反射、缝隙、接地和入射场型。3D 波形在相位周期过密时压缩显示，幅度包络始终按实际传播常数计算。',
  task: '将海水换为淡水，比较相同频率和深度下的损耗。换到铝屏蔽层后，将深度降到毫米或微米量级观察。',
  metrics(p) {
    const s = materialState(p);
    return [metric('电导率', s.conductivity.toLocaleString('zh-CN', {maximumSignificantDigits: 3}), 'S/m'), metric('选定传播深度', ...lengthLabel(s.depth)), metric('幅度降为 1/e 深度', ...lengthLabel(1 / s.alpha)), metric('体吸收损耗', s.attenuation > 1e4 ? s.attenuation.toExponential(2) : format(s.attenuation, 2), 'dB')];
  },
  chart(p) {
    const s = materialState(p);
    const shownDepth = Math.min(s.depth, 140 * Math.LN10 / (20 * s.alpha));
    const [, unit] = lengthLabel(shownDepth);
    const factor = unit === 'm' ? 1 : unit === 'mm' ? 1000 : 1e6;
    const title = shownDepth < s.depth ? '介质内幅度衰减（前 140 dB）' : '介质内幅度衰减';
    return plot(title, `传播深度（${unit}）`, '相对入界场强（dB）', [
      series('体吸收', cyan, sample(0, shownDepth * factor, 101, (x) => -s.alpha * x / factor * 20 / Math.LN10)),
      series('无耗参考', gold, [[0, 0], [shownDepth * factor, 0]]),
    ], -Math.max(0.02, Math.min(140, s.attenuation) * 1.03), 0);
  },
  build(ctx, p) {
    const medium = ctx.layer('medium'), field = ctx.layer('field'), envelope = ctx.layer('envelope');
    const s = materialState(p);
    const width = 6.45;
    const start = -3.5;
    const center = -0.12;
    ctx.box(medium, [start + width / 2, center, 0], [width, 3, 3.32], p.material === 'aluminum' ? '#60748e' : '#28446f', 0.17);
    wireBox(ctx, medium, [start + width / 2, center, 0], [width, 3, 3.32], blue);
    const xPos = (fraction) => start + width * fraction;
    const amp = (fraction) => 1.3 * Math.exp(-s.alpha * s.depth * fraction);
    const wave = Math.min(26 * Math.PI, s.beta * s.depth);
    for (const sign of [-1, 1]) {
      ctx.line(envelope, curve(0, 1, 161, (f) => [xPos(f), center + sign * amp(f), 0.02]), gold, 0.72);
    }
    const points = (t) => curve(0, 1, 251, (f) => [xPos(f), center + amp(f) * Math.cos(3.2 * t - wave * f), 0.04]);
    const trace = ctx.line(field, points(0), cyan);
    ctx.label(medium, '入界处', [start, 1.75, 0], dim);
    ctx.label(medium, '选定深度', [start + width, 1.75, 0], dim);
    return (t) => ctx.updateLine(trace, points(t));
  },
};

export const labs = [
  transmissionStructures, impedanceMatch, rectangularGuide, cavity,
  hertzDipole, smallLoop, centerFedDipole, dipoleArray,
  radioModes, fresnelClearance, multipath, satelliteLink, mediaLoss,
];
