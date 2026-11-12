const blue = '#54b8ff';
const cyan = '#54e6cf';
const gold = '#ffbd71';
const rose = '#ff7fab';
const violet = '#ab9aff';
const gray = '#7396bd';
const TAU = Math.PI * 2;
const MU0 = 4e-7 * Math.PI;
const EPS0 = 8.8541878128e-12;
const colors = [blue, cyan, gold];
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, n) => a.map(x => x * n);
const dot = (a, b) => a.reduce((total, x, i) => total + x * b[i], 0);
const cross = ([a,b,c], [d,e,f]) => [b*f-c*e,c*d-a*f,a*e-b*d];
const length = a => Math.hypot(...a);
const vec = a => '(' + a.map(x => num(x, 2)).join(', ') + ')';
const num = (x, digits = 3) => Number.isFinite(x) ? Number(x.toFixed(digits)) : '—';
const slider = (key, label, min, max, step, value, unit) => ({key,label,min,max,step,value,unit});
const choice = (key, label, entries, value) => ({key,label,options:entries.map(([value,label]) => ({value,label})),value});
const input = (key, label, value) => ({key,label,type:'text',value});
const item = (key, label, color) => ({key,label,color});
const metric = (label, value, unit) => ({label,value,unit});
const series = (label, color, points) => ({label,color,points});
const plot = (title, xLabel, yLabel, ...series) => ({title,xLabel,yLabel,series});
const sample = (a, b, n, fn) => Array.from({length:n+1}, (_, i) => fn(a+(b-a)*i/n));
const curve = (a, b, n, fn) => sample(a,b,n,x => [x,fn(x)]);
const circle = (center, radius, u = [1,0,0], v = [0,0,1]) => sample(0,TAU,64,t =>
  add(center,add(scale(u,radius*Math.cos(t)),scale(v,radius*Math.sin(t)))));
const axis = (ctx, parent, base, vector, label, color, size = 1) => {
  ctx.arrow(parent,base,vector,size,color);
  ctx.label(parent,label,add(base,scale(vector,size+.2)),color);
};
const drawArrow = (ctx, parent, r, v, color, gain = 1, max = 0.9) => {
  const m = length(v);
  if (Number.isFinite(m) && m > 1e-7) ctx.arrow(parent,r,v,Math.min(m*gain,max),color);
};
const wireSphere = (ctx, parent, center, radius, color, opacity = .45) => {
  ctx.line(parent,circle(center,radius),color,opacity);
  ctx.line(parent,circle(center,radius,[1,0,0],[0,1,0]),color,opacity);
  ctx.line(parent,circle(center,radius,[0,1,0],[0,0,1]),color,opacity);
};
const gridField = (ctx, parent, xs, ys, zs, fn, color, gain, max) => {
  for (const x of xs) for (const y of ys) for (const z of zs) {
    const r = [x,y,z];
    drawArrow(ctx,parent,r,fn(r),color,gain,max);
  }
};
const xyGrid = (ctx, parent, field, color, gain, max = .8) =>
  gridField(ctx,parent,[-3.6,-2.4,-1.2,0,1.2,2.4,3.6],[-2.4,-1.2,0,1.2,2.4],[0],field,color,gain,max);
const surfaceLines = (ctx, parent, fn, color, options = {}) => {
  const {x0=-4,x1=4,z0=-2.5,z1=2.5,n=10} = options;
  const xRows = sample(z0,z1,n,z => {
    const points = fn => sample(x0,x1,36,x => [x,fn(x,z),z]);
    return [ctx.line(parent,points(fn),color,.7),points];
  });
  const zRows = sample(x0,x1,n,x => {
    const points = fn => sample(z0,z1,28,z => [x,fn(x,z),z]);
    return [ctx.line(parent,points(fn),color,.7),points];
  });
  return next => [...xRows,...zRows].forEach(([line,points]) => ctx.updateLine(line,points(next)));
};

const mathFunctions = {sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,exp:Math.exp,
  abs:Math.abs,log:Math.log,atan:Math.atan,asin:Math.asin,acos:Math.acos,floor:Math.floor,
  ceil:Math.ceil,sinh:Math.sinh,cosh:Math.cosh};
const expressionCache = new Map();

function compileExpression(source) {
  if (expressionCache.has(source)) return expressionCache.get(source);
  if (typeof source !== 'string' || source.length > 140 || !source.trim()) throw Error('请输入 1–140 个字符的数学表达式');
  const tokens = source.normalize('NFKC').replaceAll('−','-').toLowerCase().match(/(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[+-]?[0-9]+)?|[a-z]+|[^\s]/g);
  let index = 0;
  function primary() {
    const token = tokens[index++];
    if (token === '(') {
      const child = sum();
      if (tokens[index++] !== ')') throw Error('缺少右括号');
      return child;
    }
    if (/^[.0-9]/.test(token ?? '')) {
      const value = Number(token);
      if (!Number.isFinite(value)) throw Error('数值超出范围');
      return () => value;
    }
    const position = ['x','y','z','t'].indexOf(token);
    if (position !== -1) return values => values[position];
    if (token === 'pi') return () => Math.PI;
    if (token === 'e') return () => Math.E;
    if (Object.hasOwn(mathFunctions,token) && tokens[index] === '(') {
      const child = primary();
      return values => mathFunctions[token](child(values));
    }
    throw Error('检查变量、函数与运算符');
  }
  function unary() {
    const token = tokens[index];
    if (token === '-' || token === '+') {
      index++;
      const child = unary();
      return token === '-' ? values => -child(values) : child;
    }
    const base = primary();
    if (tokens[index] !== '^') return base;
    index++;
    const exponent = unary();
    return values => base(values) ** exponent(values);
  }
  function product() {
    let left = unary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const op = tokens[index++];
      const a = left, b = unary();
      left = op === '*' ? values => a(values)*b(values) : values => a(values)/b(values);
    }
    return left;
  }
  function sum() {
    let left = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = tokens[index++];
      const a = left, b = product();
      left = op === '+' ? values => a(values)+b(values) : values => a(values)-b(values);
    }
    return left;
  }
  const fn = sum();
  if (index !== tokens.length) throw Error('使用显式乘号 *，并检查括号');
  if (expressionCache.size >= 60) expressionCache.clear();
  expressionCache.set(source,fn);
  return fn;
}
const safeFormula = source => {
  try { return {fn:compileExpression(source)}; }
  catch (error) { return {fn:() => 0,error:error.message}; }
};
const finite = x => Number.isFinite(x) ? x : null;
const surfaceValue = x => Number.isFinite(x) ? Math.max(-2.6,Math.min(2.6,x)) : 0;
const gradient = (fn, r, t, h=.015) => colors.map((_,i) => {
  const d = [0,0,0]; d[i] = h;
  return (fn([...add(r,d),t])-fn([...sub(r,d),t]))/(2*h);
});

const coordinates = {
  id:'coordinate-bases',chapter:1,title:'正交坐标系与单位矢量',
  description:'移动同一个空间点，对比直角、圆柱与球坐标系的局部基底。',
  topics:['标量与矢量','直角坐标','圆柱坐标','球坐标','坐标变换','正交曲线坐标'],
  params:[choice('mode','坐标系',[['cart','直角'],['cyl','圆柱'],['sph','球坐标']],'sph'),
    slider('r','空间距离 r',1,3,.1,2.6),slider('theta','极角 θ',10,170,1,52,'°'),slider('phi','方位角 φ',0,360,1,32,'°')],
  legend:[item('basis','局部单位矢量',cyan),item('projection','位置与投影',gold)],
  equation:'x = r sinθ cosφ，y = r cosθ，z = −r sinθ sinφ',
  explanation:'极角从 +y 轴量起，方位角按右手定则绕 +y 轴从 +x 轴转向 −z 轴。圆柱与球坐标的单位矢量随位置改变，同一点在不同坐标中表示的是同一个几何位置。尺度因子把坐标增量转换为物理长度。',
  task:'固定 r 与 θ，改变 φ；切换三个坐标系，观察位置相同而单位矢量方向不同。',
  metrics(p){
    const {r,e}=coordinateData(p);
    const rho=Math.hypot(r[0],r[2]);
    const coordinates=p.mode==='cart'?vec(r):p.mode==='cyl'? '('+num(rho)+', '+p.phi+'°, '+num(r[1])+')':'('+p.r+', '+p.theta+'°, '+p.phi+'°)';
    return [metric('选定坐标',coordinates),metric('e₁ · e₂',num(dot(e[0],e[1]))),metric('尺度因子',p.mode==='cart'?'(1, 1, 1)':p.mode==='cyl'?('(1, '+num(rho)+', 1)'):vec([1,p.r,rho]))];
  },
  chart(p){
    const {r}=coordinateData(p);
    return plot('固定 r、θ 的坐标投影','方位角 φ (°)','坐标分量',
      series('x',blue,curve(0,360,90,a=>Math.hypot(r[0],r[2])*Math.cos(a*TAU/360))),
      series('y',cyan,curve(0,360,90,()=>r[1])),
      series('z',gold,curve(0,360,90,a=>-Math.hypot(r[0],r[2])*Math.sin(a*TAU/360))));
  },
  build(ctx,p){
    const {r,e,labels}=coordinateData(p);
    const basis=ctx.layer('basis'), projection=ctx.layer('projection');
    const floor=[r[0],0,r[2]];
    ctx.sphere(projection,r,.11,gold);
    ctx.line(projection,[[0,0,0],floor,r],gold,.8);
    ctx.line(projection,circle([0,0,0],length(floor)),gray,.5);
    ctx.tube(projection,[[0,0,0],r],gold,.025,.85);
    ctx.label(projection,'P',add(r,[0,.22,.1]),gold);
    e.forEach((v,i)=>axis(ctx,basis,r,v,labels[i],colors[i],1));
  }
};
function coordinateData(p) {
  const θ=p.theta*TAU/360, φ=p.phi*TAU/360;
  const er=[Math.sin(θ)*Math.cos(φ),Math.cos(θ),-Math.sin(θ)*Math.sin(φ)];
  const eφ=[-Math.sin(φ),0,-Math.cos(φ)];
  const eθ=[Math.cos(θ)*Math.cos(φ),-Math.sin(θ),-Math.cos(θ)*Math.sin(φ)];
  const r=scale(er,p.r);
  if(p.mode==='cart') return {r,e:[[1,0,0],[0,1,0],[0,0,1]],labels:['eₓ','eᵧ','e_z']};
  if(p.mode==='cyl') return {r,e:[[Math.cos(φ),0,-Math.sin(φ)],eφ,[0,1,0]],labels:['eρ','eφ','eᵧ']};
  return {r,e:[er,eθ,eφ],labels:['eᵣ','eθ','eφ']};
}

const vectorAlgebra = {
  id:'vector-operations',chapter:1,title:'矢量运算与几何投影',
  description:'用平行四边形、投影和法向量观察矢量的基本代数运算。',
  topics:['矢量加减','数乘','标量积','矢量积','投影'],
  params:[slider('a','A 的模',.5,2.5,.1,2),slider('b','B 的模',.5,2.5,.1,1.7),
    slider('angle','夹角 θ',0,180,1,62,'°'),slider('k','数乘系数 k',-1.5,1.5,.1,1)],
  legend:[item('ab','矢量 A 与 B',blue),item('result','和、差与叉积方向',gold),item('projection','B 在 A 上的投影',cyan)],
  equation:'A·B = |A||B| cosθ；|A×B| = |A||B| sinθ',
  explanation:'点积等于一个矢量的模与另一矢量在其方向上投影的有符号长度之积。叉积方向由右手定则确定，模等于平行四边形面积。',
  task:'将夹角调到 90°，观察点积消失和叉积达到最大值；再将 k 调为负值。',
  metrics(p){
    const {a,b}=vectors(p);
    return [metric('kA + B',vec(add(a,b))),metric('kA − B',vec(sub(a,b))),
      metric('kA · B',num(dot(a,b))),metric('|kA × B|',num(length(cross(a,b))))];
  },
  chart(p){
    return plot('内积与叉积随夹角变化','夹角 θ (°)','有符号量',
      series('kA · B',blue,curve(0,180,80,a=>p.k*p.a*p.b*Math.cos(a*TAU/360))),
      series('(kA × B)z',gold,curve(0,180,80,a=>p.k*p.a*p.b*Math.sin(a*TAU/360))));
  },
  build(ctx,p){
    const {a,b}=vectors(p), base=[0,0,0], origin=ctx.layer('ab'), result=ctx.layer('result');
    const projection=ctx.layer('projection');
    drawArrow(ctx,origin,base,a,blue,1,4);
    drawArrow(ctx,origin,base,b,violet,1,4);
    ctx.label(origin,'kA',add(a,[0,.2,0]),blue);
    ctx.label(origin,'B',add(b,[0,.22,0]),violet);
    ctx.line(result,[a,add(a,b),b],gold,.65);
    drawArrow(ctx,result,base,add(a,b),gold,1,5);
    drawArrow(ctx,result,base,sub(a,b),rose,1,5);
    drawArrow(ctx,result,base,cross(a,b),cyan,.48,3);
    ctx.line(projection,[b,[b[0],0,0],[0,0,0]],cyan,.8);
  }
};
function vectors(p){
  const theta=p.angle*TAU/360;
  return {a:[p.k*p.a,0,0],b:[p.b*Math.cos(theta),p.b*Math.sin(theta),0]};
}

const differential = {
  id:'vector-calculus',chapter:1,title:'梯度、散度、旋度与积分定理',
  description:'叠加源场和旋转场，在闭曲面与环路上核对通量和环量。',
  topics:['梯度','散度','旋度','通量','环量','高斯散度定理','斯托克斯定理','亥姆霍兹定理','拉普拉斯算子'],
  params:[slider('a','源场系数 a',-1,1,.05,.45),slider('b','旋转系数 b',-1,1,.05,.55),
    slider('r','积分半径 R',.6,2.7,.1,1.8),choice('view','观察层',[['sum','合成场'],['grad','仅源场'],['rot','仅旋转场']],'sum')],
  legend:[item('field','采样矢量 F',cyan),item('surface','高斯球面',blue),item('loop','斯托克斯环路',gold)],
  equation:'F = a(x,y,z) + b(z,0,−x)；∇·F = 3a；∇×F = 2b eᵧ',
  explanation:'源场是 φ = a r²/2 的梯度，∇²φ = 3a；旋转部分无散。闭球面通量等于体内散度积分，圆周环量等于圆盘的旋度通量。正交曲线坐标中，散度的第 i 项为 ∂ᵢ(hⱼhₖFᵢ)/(hᵢhⱼhₖ)，旋度的第 i 分量为 [∂ⱼ(hₖFₖ)−∂ₖ(hⱼFⱼ)]/(hⱼhₖ)，指标循环取值。亥姆霍兹分解还需要边界或无穷远条件。',
  task:'先设 b = 0，观察纯梯度场；再设 a = 0，核对通量为零但环量非零。',
  metrics(p){
    const [a,b]=calcCoefficients(p);
    return [metric('散度 ∇·F',num(3*a)),metric('旋度 y 分量',num(2*b)),
      metric('通量 Φ = ∭∇·F dV',num(4*Math.PI*a*p.r**3)),metric('环量 Γ = ∬∇×F·dS',num(TAU*b*p.r**2))];
  },
  chart(p){
    const [a,b]=calcCoefficients(p);
    return plot('通量与环量随半径变化','积分半径 R','积分值',
      series('球面通量',blue,curve(0,3,60,r=>4*Math.PI*a*r**3)),
      series('圆周环量',gold,curve(0,3,60,r=>TAU*b*r**2)));
  },
  build(ctx,p){
    const [a,b]=calcCoefficients(p);
    const arrows=ctx.layer('field');
    gridField(ctx,arrows,[-3,-1.5,0,1.5,3],[-2,-1,0,1,2],[-2,0,2],
      ([x,y,z])=>[a*x+b*z,a*y,a*z-b*x],cyan,.27);
    const surface=ctx.layer('surface'), loop=ctx.layer('loop');
    ctx.sphere(surface,[0,0,0],p.r,blue,.08);
    wireSphere(ctx,surface,[0,0,0],p.r,blue);
    ctx.tube(loop,circle([0,0,0],p.r,[1,0,0],[0,0,-1]),gold,.022,.92);
    ctx.arrow(loop,[p.r,0,0],[0,0,-1],.55,gold);
    axis(ctx,loop,[0,0,0],[0,1,0],'n',gold,.72);
  }
};
const calcCoefficients=p=>[p.view==='rot'?0:p.a,p.view==='grad'?0:p.b];

const explicit = {
  id:'explicit-field-functions',chapter:1,title:'自定义标量场、矢量场与张量',
  description:'输入数学表达式，在标量曲面、梯度、矢量分量与二阶张量之间切换。',
  topics:['自定义变量','标量场曲面','梯度计算','矢量场绘制','二阶张量','主方向'],
  params:[choice('mode','场类型',[['scalar','标量场与梯度'],['vector','矢量场'],['tensor','平面二阶张量场']],'scalar'),
    input('f','f 或 Fₓ','exp(-(x^2+z^2)/4)*cos(t)'),input('g','Fᵧ','0.4*x'),
    input('h','F_z','-0.6*x'),slider('shear','张量剪切分量 Tₓz',-.65,.65,.05,.35),
    slider('variation','剪切分量空间变化率',-.24,.24,.02,.18),
    slider('time','函数时间 t',0,6.3,.1,0,'s')],
  legend:[item('surface','标量曲面 / 张量椭圆',blue),item('field','采样矢量 / 主方向',gold)],
  equation:'∂ᵢf ≈ [f(r+Δeᵢ)−f(r−Δeᵢ)]/(2Δ)；T = [[1.2, s(x)],[s(x), 0.7]]',
  explanation:'使用 x、y、z、t、pi、e；支持 + − * / ^ 与 sin、cos、tan、exp、log、sqrt、abs 等函数。用 * 显式相乘。不同位置的张量把当地单位圆变换为椭圆，长短轴给出两个主方向。中心椭圆放大显示。',
  task:'把 f 改成 sin(x)*cos(z)，再切换矢量场。进入张量模式后改变剪切分量和空间变化率，比较各处主方向。',
  validate(p){
    if(p.mode==='tensor') return {};
    const keys=p.mode==='scalar'?['f']:['f','g','h'];
    return Object.fromEntries(keys.map(key=>[key,safeFormula(p[key]).error]).filter(([,error])=>error));
  },
  metrics(p){
    if(p.mode==='tensor'){
      const {major,minor}=tensorData(p);
      return [metric('主值 λ₁',num(major)),metric('主值 λ₂',num(minor)),metric('迹 tr(T)',1.9)];
    }
    const data=explicitData(p);
    if(data.error) return [metric('表达式',data.error)];
    const r=[1,0,0];
    return [metric('采样点 (x, y, z)','(1, 0, 0)'),
      metric(p.mode==='scalar'?'f(1, 0, 0)':'F(1, 0, 0)',p.mode==='scalar'?num(data.fn([...r,p.time])):vec(data.vector(r))),
      ...(p.mode==='scalar'?[metric('∇f(1, 0, 0)',vec(gradient(data.fn,r,p.time))),
        metric('∇²f(1, 0, 0)',num(laplacian(data.fn,r,p.time)))]:[])];
  },
  chart(p){
    if(p.mode==='tensor') return plot('单位方向在张量作用后的模','方向角 φ (°)','|T eφ|',
      series('|T eφ|',blue,curve(0,360,100,a=>{const t=a*TAU/360;return Math.hypot(1.2*Math.cos(t)+p.shear*Math.sin(t),p.shear*Math.cos(t)+.7*Math.sin(t));})));
    const data=explicitData(p);
    const fs=p.mode==='scalar'?[['f',blue,data.fn]]:[['Fₓ',blue,data.fn],['Fᵧ',cyan,data.g],['F_z',gold,data.h]];
    return plot('过原点的 x 轴剖面','位置 x','场分量',
      ...fs.map(([label,color,fn])=>series(label,color,curve(-4,4,100,x=>finite(fn([x,0,0,p.time]))))));
  },
  build(ctx,p){
    const surface=ctx.layer('surface'), arrows=ctx.layer('field');
    if(p.mode==='tensor'){
      const {major,minor,angle}=tensorData(p);
      const e=[Math.cos(angle),0,Math.sin(angle)], f=[-e[2],0,e[0]];
      ctx.line(surface,circle([0,0,0],1.5),gray,.5);
      ctx.tube(surface,tensorEllipse(0,0,1.5,p.shear),blue,.035);
      axis(ctx,arrows,[0,0,0],e,'λ₁',gold,major*1.5);
      axis(ctx,arrows,[0,0,0],f,'λ₂',cyan,minor*1.5);
      for(const x of [-3.3,-1.65,0,1.65,3.3]) for(const z of [-2.35,2.35]){
        const shear=p.shear+p.variation*x/3.3;
        ctx.line(surface,tensorEllipse(x,z,.48,shear),blue,.78);
        const angle=.5*Math.atan2(2*shear,.5);
        drawArrow(ctx,arrows,[x,0,z],[Math.cos(angle),0,Math.sin(angle)],gold,.54,.54);
      }
      return;
    }
    const data=explicitData(p);
    if(data.error) return;
    if(p.mode==='scalar'){
      surfaceLines(ctx,surface,(x,z)=>surfaceValue(data.fn([x,0,z,p.time])),blue);
      for(const x of [-3,-1.5,0,1.5,3]) for(const z of [-2,-1,0,1,2]){
        const r=[x,0,z];
        drawArrow(ctx,arrows,[x,surfaceValue(data.fn([...r,p.time]))+.07,z],gradient(data.fn,r,p.time),gold,.7,1);
      }
    } else {
      gridField(ctx,arrows,[-3,-1.5,0,1.5,3],[-2,0,2],[-2,0,2],data.vector,gold,.55,.95);
    }
  }
};
function explicitData(p){
  const f=safeFormula(p.f),g=safeFormula(p.g),h=safeFormula(p.h);
  return {fn:f.fn,g:g.fn,h:h.fn,error:f.error||(p.mode==='vector'&&(g.error||h.error)),
    vector:r=>[f,g,h].map(({fn})=>fn([...r,p.time]))};
}
function tensorData(p){
  const delta=Math.hypot(.25,p.shear);
  return {major:.95+delta,minor:.95-delta,angle:.5*Math.atan2(2*p.shear,.5)};
}
const tensorEllipse=(x,z,r,s)=>sample(0,TAU,64,t=>[
  x+r*(1.2*Math.cos(t)+s*Math.sin(t)),0,z+r*(s*Math.cos(t)+.7*Math.sin(t))
]);
const laplacian=(fn,r,t,h=.015)=>colors.reduce((sum,_,i)=>{
  const d=[0,0,0]; d[i]=h;
  return sum+(fn([...add(r,d),t])+fn([...sub(r,d),t])-2*fn([...r,t]))/h**2;
},0);

const laser = {
  id:'moving-gaussian-field',chapter:1,title:'行进激光脉冲的能量密度',
  description:'观察一个高斯光束脉冲在传播过程中随时间变化的标量场。',
  topics:['时变标量场','高斯分布','能量密度','时间与空间剖面'],
  params:[slider('speed','显示速度 v',.3,2,.1,1.1),slider('waist','光束半径 w',.45,1.8,.05,1),
    slider('width','轴向脉冲长度 L',.55,2.2,.05,1.45),slider('amp','峰值能量密度 u₀',.5,2.5,.1,1.8)],
  legend:[item('energy','能量密度曲面',cyan),item('direction','传播轴 +x',gold)],
  equation:'u(x,z,t) = u₀ exp(−2z²/w²) exp(−(x−x₀−vt)²/L²)',
  explanation:'选取过光束轴的横向切面，用曲面高度编码能量密度。固定束腰的包络模型可比较横向宽度与轴向脉冲长度。动画在显示范围边缘循环。',
  task:'先增大 w，再增大 L；比较横向宽度与传播方向上的脉冲宽度。',
  metrics(p,t){return [metric('峰位 x',num(laserCenter(p,t),2)),metric('峰值 u₀',p.amp),metric('轴向半高全宽',num(2*p.width*Math.sqrt(Math.log(2))))];},
  chart(p,t){return plot('光束轴上瞬时能量密度','轴向位置 x','u(x, 0, t)',
    series('轴向包络',cyan,curve(-5,5,110,x=>laserValue(p,t,x,0))));},
  build(ctx,p){
    const beam=ctx.layer('energy'), direction=ctx.layer('direction');
    const update=surfaceLines(ctx,beam,(x,z)=>laserValue(p,0,x,z),cyan,{x0:-5,x1:5,z0:-2.6,z1:2.6,n:15});
    ctx.line(direction,[[-5,-.15,0],[5,-.15,0]],gold,.55);
    axis(ctx,direction,[4.5,-.15,0],[1,0,0],'+x',gold,.65);
    return t=>update((x,z)=>laserValue(p,t,x,z));
  }
};
const laserCenter=(p,t)=>((p.speed*t+4)%11)-5.5;
const laserValue=(p,t,x,z)=>p.amp*Math.exp(-2*(z/p.waist)**2-((x-laserCenter(p,t))/p.width)**2);

const charges = {
  id:'coulomb-gauss',chapter:2,title:'点电荷叠加与高斯定理',
  description:'调节点电荷和高斯球半径，比较电场矢量、电位和闭曲面净通量。',
  topics:['库仑定律','电场叠加','高斯定理','静电位','静电场保守性'],
  params:[slider('q1','左侧电荷 q₁',-8,8,.5,5,'nC'),slider('q2','右侧电荷 q₂',-8,8,.5,-4,'nC'),
    slider('d','电荷间距 d',1.3,4.5,.1,2.8,'m'),slider('r','高斯球半径 R',.6,3.4,.1,1.8,'m')],
  legend:[item('field','电场矢量 E',cyan),item('charges','点电荷',rose),item('gauss','闭合高斯球',blue)],
  equation:'E = Σ qᵢ(r−rᵢ)/(4πε₀|r−rᵢ|³)；∯ E·dS = Q内/ε₀',
  explanation:'每个点电荷的场按矢量相加，电位按标量相加，并满足 E = −∇φ。外部电荷可以改变高斯球面上的局部电场，但其对净通量的贡献为零。',
  task:'保持电荷量不变，让高斯球越过右侧电荷，观察净通量的突变。',
  metrics(p){
    const onBoundary=p.q2!==0 && Math.abs(p.r-p.d)<1e-6;
    const enclosed=p.q1+(p.r>p.d?p.q2:0);
    const {potential,field}=chargeData(p);
    return [metric('球内净电荷',onBoundary?'电荷位于球面':enclosed,onBoundary?undefined:'nC'),
      metric('净通量 Φ',onBoundary?'—':num(enclosed*1e-9/EPS0,1),onBoundary?undefined:'V·m'),
      metric('P 点电位',num(potential([0,.7,0]),2),'V'),
      metric('P 点 |E|',num(length(field([0,.7,0])),2),'V/m')];
  },
  chart(p){
    const {potential}=chargeData(p);
    return plot('y = 0.7 m 处的电位剖面','位置 x (m)','电位 φ (V)',
      series('电位 φ',gold,curve(-4.8,4.8,100,x=>potential([x,.7,0]))));
  },
  build(ctx,p){
    const {points,field}=chargeData(p);
    const charges=ctx.layer('charges'), arrows=ctx.layer('field'), gauss=ctx.layer('gauss');
    for(const [r,q] of points){
      const color=q>0?rose:q<0?blue:gray;
      ctx.sphere(charges,r,q===0?.09:.2+Math.abs(q)*.022,color);
      ctx.label(charges,q>0?'+'+q+' nC':q+' nC',add(r,[0,.46,0]),color);
    }
    xyGrid(ctx,arrows,r=>points.some(([point])=>length(sub(point,r))<.42)?[0,0,0]:field(r),cyan,.037);
    gridField(ctx,arrows,[-3,0,3],[-1.5,0,1.5],[-1.2,1.2],field,cyan,.032);
    ctx.sphere(gauss,points[0][0],p.r,blue,.075);
    wireSphere(ctx,gauss,points[0][0],p.r,blue,.6);
    ctx.sphere(charges,[0,.7,0],.065,gold);
    ctx.label(charges,'P',[0,.93,0],gold);
  }
};
function chargeData(p){
  const points=[[[-1.4,0,0],p.q1],[[-1.4+p.d,0,0],p.q2]];
  const k=1e-9/(4*Math.PI*EPS0);
  return {points,potential:r=>points.reduce((sum,[a,q])=>sum+k*q/Math.max(.01,length(sub(r,a))),0),
    field:r=>points.reduce((sum,[a,q])=>{const d=sub(r,a);return add(sum,scale(d,k*q/Math.max(.01,length(d))**3));},[0,0,0])};
}

const dielectric = {
  id:'dielectric-boundary',chapter:2,title:'介质极化与电位移边界',
  description:'将两种介质置于平行板之间，观察极化、束缚电荷与界面法向连续条件。',
  topics:['介质极化','束缚电荷','电位移 D','静电边界条件','电容','储能','静电力'],
  params:[slider('eps','相对介电常数 εᵣ',1,10,.1,4),slider('fill','右侧介质厚度占比',.2,.8,.05,.5),
    slider('voltage','电压 U',10,200,5,100,'V')],
  legend:[item('materials','电极和介质',blue),item('field','电场 E',cyan),item('polar','极化方向与束缚电荷',gold)],
  equation:'Dₙ₁ = Dₙ₂ = ε₀U/(d₁+d₂/εᵣ)，P₂ = ε₀(εᵣ−1)E₂',
  explanation:'忽略板边缘效应，板间距 10 mm。界面无自由面电荷，因此法向 D 连续；法向 E 随介电常数改变。极化层两面的束缚面电荷密度为 σᵦ = P·n。',
  task:'增大 εᵣ，同时观察两侧 E 与 D；再比较电压加倍前后的单位面积储能。',
  metrics(p){
    const {E1,E2,D,P}=dielectricData(p);
    return [metric('E₁ / E₂',num(E1/1000,2)+' / '+num(E2/1000,2),'kV/m'),
      metric('两侧 Dₙ',num(D*1e9,2),'nC/m²'),metric('|σᵦ|',num(P*1e9,2),'nC/m²'),
      metric('单位面积储能',num(.5*D*p.voltage*1e6,2),'μJ/m²')];
  },
  chart(p){
    const {E1,E2,d1}=dielectricData(p);
    return plot('从正极板到负极板的电位','板间位置 x (mm)','电位 φ (V)',
      series('电位 φ',blue,[[0,p.voltage],[d1*1000,p.voltage-E1*d1],[10,p.voltage-E1*d1-E2*(.01-d1)]]));
  },
  build(ctx,p){
    const {E1,E2}=dielectricData(p), split=3.4-6.8*p.fill;
    const mat=ctx.layer('materials'), field=ctx.layer('field'), polar=ctx.layer('polar');
    ctx.box(mat,[-3.42,0,0],[.14,4.1,3.9],rose,.86);
    ctx.box(mat,[3.42,0,0],[.14,4.1,3.9],blue,.86);
    ctx.box(mat,[(split+3.4)/2,0,0],[3.4-split,3.9,3.7],blue,.14);
    ctx.label(mat,'+U',[-3.52,2.31,0],rose);
    ctx.label(mat,'0 V',[3.47,2.31,0],blue);
    ctx.label(mat,'εᵣ = '+p.eps,[(split+3.4)/2,2.25,0],blue);
    for(const y of [-1.25,0,1.25]) for(const z of [-1.15,0,1.15]){
      const left=-3.4+(split+3.4)*.22, right=split+(3.4-split)*.22;
      drawArrow(ctx,field,[left,y,z],[E1,0,0],cyan,.000069,1.35);
      drawArrow(ctx,field,[right,y,z],[E2,0,0],cyan,.000069,1.35);
      if(p.eps>1){
        ctx.sphere(polar,[split+.07,y,z],.068,blue);
        ctx.sphere(polar,[3.30,y,z],.068,rose);
        drawArrow(ctx,polar,[right,y+.23,z],[E2*(p.eps-1),0,0],gold,.00003,.85);
      }
    }
  }
};
function dielectricData(p){
  const d2=.01*p.fill,d1=.01-d2;
  const D=EPS0*p.voltage/(d1+d2/p.eps), E1=D/EPS0,E2=E1/p.eps;
  return {D,E1,E2,d1,P:EPS0*(p.eps-1)*E2};
}

const electroSphere = {
  id:'conducting-dielectric-sphere',chapter:2,title:'导体屏蔽与绝缘体局部场增强',
  description:'比较均匀外电场中导体球、空心导体球壳与介质球的场分布。',
  topics:['导体屏蔽','介质极化','电极建模','局部场增强','电势与边值唯一性'],
  params:[choice('mode','球体材料',[['metal','实心理想导体'],['shell','空心理想导体'],['dielectric','线性电介质']],'shell'),
    slider('eps','相对介电常数 εᵣ',1,15,.5,4.5),slider('radius','球体半径 a',.8,2.2,.05,1.65,'m'),
    slider('field','外电场 E₀',.5,5,.1,2,'V/m')],
  legend:[item('material','球体与边界',blue),item('field','电场矢量',cyan),item('surface','极点与感应电荷',gold)],
  equation:'φ外 = −E₀ x + K E₀ a³x/r³；K = (εᵣ−1)/(εᵣ+2)，理想导体时 K = 1',
  explanation:'介质球内场均匀且较弱。闭合空心导体的内壁等势，若空腔内无电荷，由唯一性定理可知腔内 E = 0。导体外表面两极的法向场为 3E₀，表面感应电荷在两极异号。外部是真空且无穷远外场均匀。',
  task:'将材料由导体切换为介质，比较内部场以及紧靠极点外侧的场增强倍数。',
  metrics(p){
    const {K,inside}=electricSphereData(p);
    return [metric('球内 |E|',num(inside),'V/m'),metric('极点外场 / E₀',num(1+2*K)),
      metric('极点面电荷绝对值',num((p.mode==='dielectric'?EPS0*(p.eps-1)*inside:EPS0*p.field*3)*1e12,2),'pC/m²')];
  },
  chart(p){
    const {field}=electricSphereData(p);
    const a=p.radius;
    const points=[...curve(-4.2,-a-.001,38,x=>field([x,0,0])[0]),
      [-a+.001,field([-a+.001,0,0])[0]],[a-.001,field([a-.001,0,0])[0]],
      ...curve(a+.001,4.2,38,x=>field([x,0,0])[0])];
    return plot('沿外场方向的电场剖面','位置 x (m)','Eₓ (V/m)',series('Eₓ',cyan,points));
  },
  build(ctx,p){
    const {field,K}=electricSphereData(p);
    const material=ctx.layer('material'), arrows=ctx.layer('field'), charge=ctx.layer('surface');
    ctx.sphere(material,[0,0,0],p.radius,blue,p.mode==='metal'?.24:.14);
    wireSphere(ctx,material,[0,0,0],p.radius,blue,.68);
    if(p.mode==='shell'){
      wireSphere(ctx,material,[0,0,0],p.radius*.7,blue,.44);
      ctx.label(material,'屏蔽空腔',[0,p.radius*.27,0],blue);
    }
    xyGrid(ctx,arrows,field,cyan,.3,1);
    if(K>0){
      ctx.label(charge,'+', [p.radius+.25,.22,0],rose);
      ctx.label(charge,'−', [-p.radius-.25,.22,0],blue);
      ctx.sphere(charge,[p.radius,0,0],.11,rose);
      ctx.sphere(charge,[-p.radius,0,0],.11,blue);
    }
  }
};
function electricSphereData(p){
  const K=p.mode==='dielectric'?(p.eps-1)/(p.eps+2):1;
  const inside=p.field*(1-K), ax=[1,0,0];
  const field=r=>{
    const radius=length(r);
    if(radius<p.radius) return [inside,0,0];
    return add(scale(ax,p.field),scale(sub(scale(r,3*r[0]/radius**5),scale(ax,1/radius**3)),K*p.field*p.radius**3));
  };
  return {K,inside,field};
}

const conduction = {
  id:'steady-current',chapter:2,title:'恒定电场与双层介质导电',
  description:'在两段不同电导率的材料中追踪电压降和稳恒电流。',
  topics:['欧姆定律微分形式','电流连续性','稳恒电场','电流密度','电热功率','静电与恒定电场比拟'],
  params:[slider('s1','电导率 σ₁',.25,5,.05,1.5,'S/m'),slider('s2','电导率 σ₂',.25,5,.05,.65,'S/m'),
    slider('u','端电压 U',1,24,.5,9,'V'),slider('fill','材料 1 长度比例',.2,.8,.05,.55)],
  legend:[item('material','两段导电介质',blue),item('field','电场 E',cyan),item('current','电流密度 J',gold)],
  equation:'J = σE；∇·J = 0；Jₙ₁ = Jₙ₂ = U/(ℓ₁/σ₁ + ℓ₂/σ₂)',
  explanation:'两段材料的总长度为 1 m，等截面且串联。无稳态电荷积累，界面法向 J 连续。区域内 φ 满足 ∇·(σ∇φ)=0，与无源静电介质中的 ∇·(ε∇φ)=0 形式相同。',
  task:'将 σ₁ 和 σ₂ 调成相等，观察电位斜率的变化；再使其中一段电导率下降。',
  metrics(p){
    const {J,E1,E2}=conductionData(p);
    return [metric('两侧法向 J',num(J),'A/m²'),metric('E₁ / E₂',num(E1,2)+' / '+num(E2,2),'V/m'),
      metric('功率密度 p₁ / p₂',num(J*E1,2)+' / '+num(J*E2,2),'W/m³')];
  },
  chart(p){
    const {E1}=conductionData(p);
    return plot('材料内电位和界面斜率','位置 x (m)','电位 φ (V)',
      series('电位 φ',blue,[[0,p.u],[p.fill,p.u-E1*p.fill],[1,0]]));
  },
  build(ctx,p){
    const {J,E1,E2}=conductionData(p);
    const left=-4,right=4,split=left+8*p.fill;
    const material=ctx.layer('material'), field=ctx.layer('field'), current=ctx.layer('current');
    ctx.box(material,[(left+split)/2,0,0],[split-left,1.85,2.55],blue,.23);
    ctx.box(material,[(split+right)/2,0,0],[right-split,1.85,2.55],violet,.25);
    ctx.box(material,[left-.07,0,0],[.15,2.05,2.72],rose,.88);
    ctx.box(material,[right+.07,0,0],[.15,2.05,2.72],blue,.88);
    ctx.label(material,'σ₁',[(left+split)/2,1.2,0],blue);
    ctx.label(material,'σ₂',[(split+right)/2,1.2,0],violet);
    for(const z of [-.76,0,.76]){
      drawArrow(ctx,field,[left+.2,.43,z],[E1,0,0],cyan,.12,1.22);
      drawArrow(ctx,field,[split+.18,.43,z],[E2,0,0],cyan,.12,1.22);
      for(const x of [-3,-1,1,3]) drawArrow(ctx,current,[x,-.43,z],[J,0,0],gold,.115,1);
    }
  }
};
function conductionData(p){
  const J=p.u/(p.fill/p.s1+(1-p.fill)/p.s2);
  return {J,E1:J/p.s1,E2:J/p.s2};
}

const wire = {
  id:'ampere-wire',chapter:3,title:'载流圆柱与安培环路定理',
  description:'拖动环路半径，比较导线内部与外部的磁感应强度和包围电流。',
  topics:['安培环路定理','磁感应强度','磁通连续','电流密度','磁矢势','磁能与内部电感','无源有旋'],
  params:[slider('i','电流 I',-12,12,.5,6,'A'),slider('a','导线半径 a',4,14,.5,8,'mm'),
    slider('r','安培环路半径 r',2,32,.5,15,'mm')],
  legend:[item('wire','导线与电流方向',gold),item('field','磁感应强度 B',cyan),item('loop','安培环路',blue)],
  equation:'Bφ(r<a) = μ₀Ir/(2πa²)；Bφ(r≥a) = μ₀I/(2πr)',
  explanation:'均匀直流沿 +y 轴，磁感应强度绕导线闭合，散度为零。导线内部 B 与 r 成正比，外部按 1/r 下降。Bφ = −∂Aᵧ/∂r，导线外局部可用磁标势描述 H。将 B²/(2μ₀) 对导体截面积分，可由磁能得到单位长度内部电感。',
  task:'从导线轴向外移动安培环路，比较内外磁场曲线斜率，并将 I 反向。',
  metrics(p){
    const r=p.r/1000,a=p.a/1000;
    const current=p.i*Math.min(1,(r/a)**2);
    const ay=(r<=a?MU0*p.i*(1-(r/a)**2)/(4*Math.PI):MU0*p.i*Math.log(a/r)/(2*Math.PI));
    return [metric('环路包围电流',num(current,2),'A'),metric('环路 Bφ',num(wireB(p,p.r),2),'μT'),
      metric('相对导线表面的 Aᵧ',num(ay*1e6,3),'μWb/m'),metric('单位长度内部电感',num(MU0*1e9/(8*Math.PI),2),'nH/m')];
  },
  chart(p){
    return plot('圆柱内外的磁感应强度','距导线轴 r (mm)','Bφ (μT)',
      series('Bφ',cyan,[...curve(0,p.a,30,r=>wireB(p,r)),...curve(p.a,40,70,r=>wireB(p,r)).slice(1)]));
  },
  build(ctx,p){
    const wire=ctx.layer('wire'), field=ctx.layer('field'), loop=ctx.layer('loop');
    const radius=p.a/10;
    const metal=new ctx.THREE.Mesh(new ctx.THREE.CylinderGeometry(radius,radius,5.8,32),
      new ctx.THREE.MeshBasicMaterial({color:gold,transparent:true,opacity:.36}));
    wire.add(metal);
    if(p.i!==0) axis(ctx,wire,[0,-Math.sign(p.i)*1.1,0],[0,Math.sign(p.i),0],'I',gold,2.25);
    for(const r of [.52,1.04,1.75,2.6,3.55]){
      for(const y of [-1.9,0,1.9]){
        ctx.line(field,circle([0,y,0],r),cyan,p.i===0?0:.26);
        for(const θ of [0,TAU/3,2*TAU/3]){
          const x=r*Math.cos(θ),z=-r*Math.sin(θ);
          drawArrow(ctx,field,[x,y,z],scale([z/r,0,-x/r],wireB(p,r*10)),cyan,.014,.72);
        }
      }
    }
    ctx.tube(loop,circle([0,0,0],p.r/10,[1,0,0],[0,0,-1]),blue,.027,.9);
    ctx.label(loop,'安培环路',[p.r/10,.28,0],blue);
  }
};
const wireB=(p,r)=>r<p.a?MU0*p.i*(r/1000)/(2*Math.PI*(p.a/1000)**2)*1e6:MU0*p.i/(2*Math.PI*(r/1000))*1e6;

const ampereForce = {
  id:'ampere-force',chapter:3,title:'两根平行导线的安培力',
  description:'反向其中一根导线的电流，观察相吸与相斥的切换。',
  topics:['安培力定律','平行导线作用力','磁场叠加','右手定则'],
  params:[slider('i1','左侧电流 I₁',1,14,.5,8,'A'),slider('i2','右侧电流 I₂',-14,14,.5,6,'A'),
    slider('distance','导线间距 d',12,50,1,30,'mm')],
  legend:[item('wires','导线与电流',blue),item('field','合成磁场 B',cyan),item('force','安培力 F',gold)],
  equation:'dF = I dℓ×B；|F|/ℓ = μ₀|I₁I₂|/(2πd)',
  explanation:'右侧导线受左侧导线磁场作用，反之亦然。电流同向时吸引，反向时排斥。以 +x 为正，右侧导线单位长度受力为 −μ₀I₁I₂/(2πd)。',
  task:'将 I₂ 从正值改成负值，比较力箭头，再增大间距验证力按 1/d 下降。',
  metrics(p){
    const d=p.distance/1000;
    return [metric('左线在右线处的 B',num(MU0*p.i1/(2*Math.PI*d)*1e6,2),'μT'),
      metric('右导线的 Fₓ/ℓ',num(-MU0*p.i1*p.i2/(2*Math.PI*d)*1e6,2),'μN/m'),
      metric('相互作用',p.i2>0?'相吸':p.i2<0?'相斥':'无')];
  },
  chart(p){
    return plot('导线间距对安培力的影响','间距 d (mm)','Fₓ/ℓ (μN/m)',
      series('右导线',gold,curve(12,55,80,d=>-MU0*p.i1*p.i2/(2*Math.PI*d/1000)*1e6)));
  },
  build(ctx,p){
    const x=p.distance/20,wires=ctx.layer('wires'), field=ctx.layer('field'), force=ctx.layer('force');
    for(const [pos,i,color] of [[-x,p.i1,blue],[x,p.i2,rose]]){
      ctx.tube(wires,[[pos,-2.85,0],[pos,2.85,0]],color,.095);
      if(i!==0) axis(ctx,wires,[pos,-Math.sign(i),0],[0,Math.sign(i),0],pos<0?'I₁':'I₂',color,2);
    }
    gridField(ctx,field,[-3.7,-2.4,-1.2,0,1.2,2.4,3.7],[-1.5,0,1.5],[-1.65,1.65],
      ([xx,,z])=>[[-x,p.i1],[x,p.i2]].reduce((sum,[a,i])=>{
        const dx=xx-a;return add(sum,scale([z,0,-dx],i/(dx*dx+z*z)));
      },[0,0,0]),cyan,.1,.72);
    const f=-p.i1*p.i2/p.distance;
    if(f!==0){
      drawArrow(ctx,force,[x,0,0],[f,0,0],gold,.45,1.3);
      drawArrow(ctx,force,[-x,0,0],[-f,0,0],gold,.45,1.3);
    }
  }
};

const magnet = {
  id:'permanent-magnet',chapter:3,title:'永磁体形状与充磁方向',
  description:'旋转充磁方向并切换球体或长方体，比较磁体周围的场结构。',
  topics:['磁化强度','束缚面电流','磁标势','永磁体本构','磁介质边界条件'],
  params:[choice('shape','磁体形状',[['sphere','球体（解析）'],['block','长方体（表面积分）']],'sphere'),
    slider('m','磁化强度 M',20,150,5,85,'kA/m'),slider('theta','极角 θ',0,180,1,30,'°'),
    slider('phi','方位角 φ',0,360,1,45,'°'),slider('width','长方体 x 向半宽',.7,2,.05,1.65)],
  legend:[item('magnet','磁体和充磁方向 M',blue),item('field','磁感应强度 B',cyan),item('pole','磁极示意',rose)],
  equation:'B = μ₀(H + M)；Kᵦ = M×n；H = −∇φₘ（无自由电流）',
  explanation:'均匀充磁球体内部 H = −M/3，外部等效为磁偶极子。长方体用等效面磁荷 σₘ = M·n 的数值积分求 H，再由本构关系得到 B。两种表示均保持 B 的法向分量跨界面连续。',
  task:'先沿 +y 充磁，再改变极角与方位角；切换形状，比较中心场和对称性。',
  metrics(p){
    const {field,m}=magnetData(p);
    return [metric('中心 |B|',num(length(field([0,0,0])),2),'mT'),
      metric('P 点 |B|',num(length(field([0,2.7,0])),2),'mT'),
      metric('充磁单位方向',vec(scale(m,1/p.m)))];
  },
  chart(p){
    const {field}=magnetData(p);
    const limit=p.shape==='sphere'?1.42:1.15;
    const points=[...curve(-3.3,-limit-.055,34,y=>field([0,y,0])[1]),
      ...curve(-limit+.055,limit-.055,35,y=>field([0,y,0])[1]),
      ...curve(limit+.055,3.3,34,y=>field([0,y,0])[1])];
    return plot('磁体中心轴上的 Bᵧ','轴向位置 y','Bᵧ (mT)',series('Bᵧ',cyan,points));
  },
  build(ctx,p){
    const {field,m}=magnetData(p);
    const shape=ctx.layer('magnet'), fieldLayer=ctx.layer('field'), poles=ctx.layer('pole');
    if(p.shape==='sphere'){
      ctx.sphere(shape,[0,0,0],1.42,blue,.18);
      wireSphere(ctx,shape,[0,0,0],1.42,blue,.59);
    }else ctx.box(shape,[0,0,0],[2*p.width,2.3,1.95],blue,.29);
    const e=scale(m,1/p.m);
    axis(ctx,shape,[0,0,0],e,'M',gold,2.1);
    const dimensions=[p.width,1.15,.975];
    const distance=p.shape==='sphere'?1.42:Math.min(...e.map((v,i)=>dimensions[i]/Math.max(.0001,Math.abs(v))));
    const north=scale(e,distance),south=scale(north,-1);
    ctx.sphere(poles,north,.14,rose);
    ctx.sphere(poles,south,.14,blue);
    ctx.label(poles,'N',add(north,[0,.23,0]),rose);
    ctx.label(poles,'S',add(south,[0,.23,0]),blue);
    xyGrid(ctx,fieldLayer,field,cyan,.018,.88);
    gridField(ctx,fieldLayer,[-2.8,0,2.8],[-1.7,0,1.7],[-1.6,1.6],field,cyan,.04,.8);
    ctx.sphere(fieldLayer,[0,2.7,0],.07,gold);
  }
};
function magnetData(p){
  const θ=p.theta*TAU/360,φ=p.phi*TAU/360;
  const m=scale([Math.sin(θ)*Math.cos(φ),Math.cos(θ),Math.sin(θ)*Math.sin(φ)],p.m);
  if(p.shape==='sphere') return {m,field:r=>{
    const radius=length(r);
    if(radius<1.42) return scale(m,2*MU0*1e6/3);
    return scale(sub(scale(r,3*dot(m,r)/radius**5),scale(m,1/radius**3)),MU0*1e6*1.42**3/3);
  }};
  const dims=[p.width,1.15,.975], panels=[], count=12;
  for(let i=0;i<3;i++){
    const j=(i+1)%3,k=(i+2)%3;
    const area=4*dims[j]*dims[k]/count**2;
    for(const sign of [-1,1]){
      for(let a=0;a<count;a++) for(let b=0;b<count;b++){
        const r=[0,0,0];
        r[i]=sign*dims[i];r[j]=dims[j]*(2*(a+.5)/count-1);r[k]=dims[k]*(2*(b+.5)/count-1);
        panels.push({r,weight:sign*m[i]*area/(4*Math.PI)});
      }
    }
  }
  return {m,field:r=>{
    const h=[0,0,0];
    for(const {r:point,weight} of panels){
      const x=r[0]-point[0],y=r[1]-point[1],z=r[2]-point[2];
      const factor=weight/Math.max(.065,Math.hypot(x,y,z))**3;
      h[0]+=x*factor;h[1]+=y*factor;h[2]+=z*factor;
    }
    return scale(r.every((x,i)=>Math.abs(x)<dims[i])?add(h,m):h,MU0*1e6);
  }};
}

const magneticShield = {
  id:'magnetic-shielding',chapter:3,title:'高磁导球壳与静磁屏蔽',
  description:'改变球壳磁导率和厚度，测量空腔内的剩余磁场。',
  topics:['静磁屏蔽','磁介质分类','磁场边界条件','磁标势','屏蔽效能'],
  params:[slider('mu','壳体相对磁导率 μᵣ',1,201,1,60),slider('thick','壳体厚度 d',.08,.85,.01,.35),
    slider('H','均匀外磁场 H₀',10,120,5,50,'A/m')],
  legend:[item('shell','屏蔽壳体',blue),item('field','磁感应强度 B',cyan),item('inner','空腔磁场 B',gold)],
  equation:'φₘ = (−Ar+B/r²)cosθ；Bₙ 连续，Hₜ 连续（无自由面电流）',
  explanation:'外磁场沿 +y 轴。通过在内外球面匹配磁标势和法向 B 得到空腔解。高磁导壳为磁通提供通路，使空腔内场降低。模型假定材料线性、各向同性，无磁饱和。',
  task:'先设置 μᵣ = 1，再逐步增大 μᵣ，比较同厚度下的剩余场与屏蔽因子。',
  metrics(p){
    const {inside}=shieldData(p);
    return [metric('空腔 H',num(inside,2),'A/m'),metric('屏蔽因子 H₀/H空腔',num(p.H/inside,2)),
      metric('屏蔽效能',num(20*Math.log10(p.H/inside),2),'dB')];
  },
  chart(p){
    const {a,b,field}=shieldData(p);
    const points=[...curve(-3.6,-b-.0001,38,y=>field([0,y,0])[1]),...curve(-b+.0001,-a-.0001,16,y=>field([0,y,0])[1]),
      ...curve(-a+.0001,a-.0001,28,y=>field([0,y,0])[1]),
      ...curve(a+.0001,b-.0001,16,y=>field([0,y,0])[1]),...curve(b+.0001,3.6,38,y=>field([0,y,0])[1])];
    return plot('沿屏蔽体轴线的磁感应强度','位置 y','Bᵧ (μT)',series('Bᵧ',cyan,points));
  },
  build(ctx,p){
    const {a,b,field}=shieldData(p);
    const shell=ctx.layer('shell'),outer=ctx.layer('field'),inner=ctx.layer('inner');
    ctx.sphere(shell,[0,0,0],b,blue,.12);
    wireSphere(ctx,shell,[0,0,0],b,blue,.62);
    wireSphere(ctx,shell,[0,0,0],a,blue,.33);
    xyGrid(ctx,outer,r=>length(r)>=a?field(r):[0,0,0],cyan,.008,.77);
    gridField(ctx,inner,[-.8,0,.8],[-.8,0,.8],[0],r=>length(r)<a?field(r):[0,0,0],gold,.011,.68);
    ctx.label(shell,'μᵣ = '+p.mu,[b-.6,b+.4,0],blue);
  }
};
function shieldData(p){
  const a=1.36,b=a+p.thick,mu=p.mu;
  const factor=(mu-1)/(2*mu+1);
  const A=3*p.H/(mu+2-2*(mu-1)*factor*(a/b)**3);
  const B=-factor*A*a**3,C=(p.H-A)*b**3+B,inside=A*(1+factor);
  const up=[0,1,0];
  return {a,b,inside,field:r=>{
    const radius=length(r);
    if(radius<a) return scale(up,MU0*inside*1e6);
    const shell=radius<b;
    const dipole=sub(scale(r,3*r[1]/radius**5),scale(up,1/radius**3));
    return scale(add(scale(up,shell?A:p.H),scale(dipole,shell?B:C)),MU0*1e6*(shell?mu:1));
  }};
}

const spiralCoil = {
  id:'pcb-spiral-field',chapter:3,title:'PCB 螺旋线圈的低频磁场',
  description:'改变线圈匝数和电流，用毕奥–萨伐尔积分观察板外漏磁。',
  topics:['磁场叠加','毕奥–萨伐尔定律','PCB 线圈','低频 EMC','探头扫描','磁场能量与电感'],
  params:[slider('turns','线圈匝数',1,7,1,4),slider('i','线圈电流 I',-4,4,.1,1.5,'A'),
    slider('outer','线圈外半径',16,32,1,29,'mm'),slider('height','磁探头离板高度',5,32,1,15,'mm')],
  legend:[item('coil','螺旋走线与理想回流',gold),item('field','线圈磁场 B',cyan),item('probe','磁探头',rose)],
  equation:'dB = μ₀ I dℓ×(r−r′)/(4π|r−r′|³)；wₘ = B·H/2',
  explanation:'将 PCB 上的导线离散成短电流元并叠加。用板下直线闭合回路作为简化回流路径，忽略导线宽度和邻近导体。磁探头剖面可用于比较布局或间距对低频漏磁的影响。',
  task:'固定电流并提高匝数，再提高探头，比较探头处磁场和沿轴的衰减。',
  metrics(p){
    const {field,coil}=coilData(p);
    return [metric('探头 Bᵧ',num(field([0,p.height/10,0])[1],2),'μT'),
      metric('板中心 Bᵧ',num(field([0,0,0])[1],2),'μT'),
      metric('走线长度',num(coil.reduce((sum,r,i)=>i?sum+length(sub(r,coil[i-1])):sum,0)*10,1),'mm')];
  },
  chart(p){
    const {field}=coilData(p);
    return plot('线圈轴向磁感应强度','离板高度 (mm)','Bᵧ (μT)',
      series('Bᵧ',cyan,curve(0,38,100,y=>field([0,y/10,0])[1])));
  },
  build(ctx,p){
    const {coil,returnPath,field}=coilData(p);
    const trace=ctx.layer('coil'), arrows=ctx.layer('field'), probe=ctx.layer('probe');
    ctx.box(trace,[0,-.085,0],[7.3,.13,6.5],blue,.12);
    ctx.tube(trace,coil,gold,.043,.95);
    ctx.line(trace,returnPath,violet,.78);
    const index=Math.round(coil.length*.72);
    const dir=scale(sub(coil[index+1],coil[index]),Math.sign(p.i));
    drawArrow(ctx,trace,add(coil[index],[0,.08,0]),dir,rose,35,.65);
    gridField(ctx,arrows,[-3,-2,-1,0,1,2,3],[.45,1.25,2.05,2.9],[0],field,cyan,.023,.87);
    gridField(ctx,arrows,[-2,0,2],[.55,1.5,2.45],[-1.65,1.65],field,cyan,.032,.68);
    const position=[0,p.height/10,0];
    ctx.sphere(probe,position,.115,rose);
    ctx.line(probe,[[0,0,0],position],rose,.45);
    ctx.label(probe,'P',add(position,[0,.23,0]),rose);
  }
};
function coilData(p){
  const outer=p.outer/10,inner=.38;
  const coil=sample(0,TAU*p.turns,64*p.turns,t=>{
    const r=inner+(outer-inner)*t/(TAU*p.turns);
    return [r*Math.cos(t),0,-r*Math.sin(t)];
  });
  const start=coil[0],end=coil.at(-1);
  const returnPath=[end,[end[0],-.44,end[2]],[start[0],-.44,start[2]],start];
  const path=[...coil,...sample(0,1,24,t=>add(returnPath[1],scale(sub(returnPath[2],returnPath[1]),t))),start];
  const cells=path.slice(1).map((end,i)=>({d:sub(end,path[i]),r:scale(add(end,path[i]),.5)}));
  return {coil,returnPath,field:r=>{
    const result=[0,0,0];
    for(const cell of cells){
      const x=r[0]-cell.r[0],y=r[1]-cell.r[1],z=r[2]-cell.r[2];
      const [a,b,c]=cell.d,f=10*p.i/Math.max(.105,Math.hypot(x,y,z))**3;
      result[0]+=(b*z-c*y)*f;result[1]+=(c*x-a*z)*f;result[2]+=(a*y-b*x)*f;
    }
    return result;
  }};
}

const separation = {
  id:'separation-of-variables',chapter:4,title:'矩形边界的分离变量解',
  description:'从矩形的指定边界电位构造拉普拉斯方程的正弦级数解。',
  topics:['拉普拉斯方程','分离变量法','狄利克雷边值','傅里叶级数','唯一性定理'],
  params:[choice('edge','上边界电位',[['step','恒定电位'],['sine','正弦电位']],'step'),
    slider('terms','保留的奇次项数',1,19,1,7),slider('height','区域高度 H',2.5,6,.1,4.5,'m'),
    slider('voltage','上边界幅值 U',10,100,5,50,'V')],
  legend:[item('boundary','四边边界',gold),item('surface','电位曲面',blue),item('field','电场 E = −∇φ',cyan)],
  equation:'φ(x,z) = Σ Aₙ sin(nπx/L) sinh(nπz/L)/sinh(nπH/L)',
  explanation:'左右和下边界接地，上边界给定电位。分离得到正弦本征函数与双曲正弦系数。恒定上边界用奇次正弦级数展开，边角附近可见截断误差。满足给定边值的拉普拉斯解唯一。',
  task:'比较保留 1 项和 15 项时靠近上边界的剖面，并切换到单一正弦边界。',
  metrics(p){
    return [metric('矩形中心电位',num(rectPotential(p,4,p.height/2),2),'V'),
      metric('保留项数',p.edge==='sine'?1:p.terms),metric('方程', '∇²φ = 0')];
  },
  chart(p){
    return plot('不同高度的横向电位剖面','横向位置 x (m)','电位 φ (V)',
      series('z = H/2',blue,curve(0,8,100,x=>rectPotential(p,x,p.height/2))),
      series('z = 0.95H',gold,curve(0,8,100,x=>rectPotential(p,x,.95*p.height))));
  },
  build(ctx,p){
    const boundary=ctx.layer('boundary'), surface=ctx.layer('surface'), field=ctx.layer('field');
    const half=p.height/2;
    const y=(x,z)=>2.35*rectPotential(p,x+4,z+half)/p.voltage;
    surfaceLines(ctx,surface,y,blue,{z0:-half,z1:half,n:16});
    ctx.line(boundary,[[-4,0,half],[-4,0,-half],[4,0,-half],[4,0,half]],gray,.7);
    ctx.tube(boundary,sample(-4,4,90,x=>[x,y(x,half),half]),gold,.018);
    ctx.label(boundary,'φ = 0',[-4,.25,-half],gray);
    ctx.label(boundary,'给定上边界',[.8,2.95,half],gold);
    for(const x of [-3,-1.5,0,1.5,3]) for(const z of [-half*.6,0,half*.52]){
      const h=.01;
      const e=[-(y(x+h,z)-y(x-h,z))/(2*h),0,-(y(x,z+h)-y(x,z-h))/(2*h)];
      drawArrow(ctx,field,[x,.08,z],e,cyan,.86,.68);
    }
  }
};
function rectPotential(p,x,z){
  if(Math.abs(x)<1e-7 || Math.abs(x-8)<1e-7 || z===0) return 0;
  if(p.edge==='sine') return p.voltage*Math.sin(Math.PI*x/8)*Math.sinh(Math.PI*z/8)/Math.sinh(Math.PI*p.height/8);
  let sum=0;
  for(let k=0;k<p.terms;k++){
    const n=2*k+1,a=n*Math.PI/8;
    sum+=4*p.voltage/(n*Math.PI)*Math.sin(a*x)*Math.sinh(a*z)/Math.sinh(a*p.height);
  }
  return sum;
}

const imageCharge = {
  id:'image-charges',chapter:4,title:'平面、球面与圆柱镜像法',
  description:'改变接地导体的形状和源的位置，核对等效电荷与零电位边界。',
  topics:['镜像法','接地平面','接地球面','接地圆柱','边值唯一性','静电边界'],
  params:[choice('shape','导体形状',[['plane','接地平面'],['sphere','接地球面'],['cylinder','接地圆柱']],'plane'),
    slider('a','曲面半径 a',.7,2,.05,1.35,'m'),slider('gap','源至导体表面距离',.6,2.5,.05,1.55,'m'),
    slider('q','源强度 q 或 λ',-8,8,.5,4)],
  legend:[item('boundary','接地导体',blue),item('sources','实际源与等效镜像',gold),item('field','外域电场 E',cyan)],
  equation:'平面 q′=−q；球面 q′=−qa/d；圆柱线电荷 λ′=−λ；曲面镜像坐标 x′=a²/d',
  explanation:'等效镜像源位于求解域之外。平面和球面案例用点电荷（nC）；无限长圆柱案例用平行线电荷（nC/m）。圆柱的对数势选取加性常数使导体表面电位为零。外域边值解因此满足唯一性条件。',
  task:'切换三种边界，改变源位置，检查表面电位始终为零以及镜像位置的变化。',
  metrics(p){
    const {source,image,qi,potential}=imageData(p);
    return [metric('实际源 x',num(source,2),'m'),metric('镜像源 x′',num(image,2),'m'),
      metric('镜像源强度',num(qi,2),p.shape==='cylinder'?'nC/m':'nC'),
      metric('表面取样 φ',num(potential([p.shape==='plane'?0:p.a,0,0]),8),'V')];
  },
  chart(p){
    const {potential}=imageData(p);
    const start=p.shape==='plane'?0:Math.sqrt(p.a**2-.45**2);
    return plot('导体表面至外域的电位剖面','位置 x (m)，z = 0.45 m','电位 φ (V)',
      series('外域电位 φ',gold,curve(start,5.4,110,x=>potential([x,0,.45]))));
  },
  build(ctx,p){
    const {source,image,field,inside}=imageData(p);
    const boundary=ctx.layer('boundary'), sources=ctx.layer('sources'), arrows=ctx.layer('field');
    if(p.shape==='plane'){
      ctx.box(boundary,[0,0,0],[.045,5.1,5.2],blue,.22);
      ctx.line(boundary,[[0,-2.55,-2.6],[0,2.55,-2.6],[0,2.55,2.6],[0,-2.55,2.6],[0,-2.55,-2.6]],blue,.65);
    }else if(p.shape==='sphere'){
      ctx.sphere(boundary,[0,0,0],p.a,blue,.14);
      wireSphere(ctx,boundary,[0,0,0],p.a,blue,.6);
    }else{
      const cylinder=new ctx.THREE.Mesh(new ctx.THREE.CylinderGeometry(p.a,p.a,5.25,32),
        new ctx.THREE.MeshBasicMaterial({color:blue,transparent:true,opacity:.16}));
      boundary.add(cylinder);
      for(const y of [-2.62,0,2.62]) ctx.line(boundary,circle([0,y,0],p.a),blue,.5);
    }
    for(const [x,color,label] of [[source,gold,'实际源'],[image,rose,'镜像源']]){
      if(p.shape==='cylinder') ctx.tube(sources,[[x,-2.55,0],[x,2.55,0]],color,.049);
      else ctx.sphere(sources,[x,0,0],.16,color,.9);
      ctx.label(sources,label,[x,p.shape==='cylinder'?2.85:.37,0],color);
    }
    const xs=p.shape==='plane'?[.4,1.25,2.1,3.05,4,4.85]:[-4.8,-3.2,-1.6,0,1.6,3.2,4.8];
    gridField(ctx,arrows,xs,[-1.9,0,1.9],[-1.8,0,1.8],
      r=>inside(r)||Math.hypot(r[0]-source,r[1],r[2])<.38?[0,0,0]:field(r),cyan,.034,.78);
  }
};
function imageData(p){
  const plane=p.shape==='plane',line=p.shape==='cylinder';
  const source=plane?p.gap:p.a+p.gap,image=plane?-source:p.a**2/source;
  const qi=plane||line?-p.q:-p.q*p.a/source,k=1e-9/(4*Math.PI*EPS0);
  const radial=(r,x)=>[r[0]-x,line?0:r[1],r[2]];
  const inside=r=>plane?r[0]<0:Math.hypot(r[0],line?0:r[1],r[2])<p.a;
  return {source,image,qi,inside,
    potential:r=>{
      const d=Math.max(.012,length(radial(r,source))),di=Math.max(.012,length(radial(r,image)));
      return line?2*k*p.q*Math.log(di*source/(d*p.a)):k*(p.q/d+qi/di);
    },
    field:r=>{
      const a=radial(r,source),b=radial(r,image),power=line?2:3;
      return scale(add(scale(a,p.q/Math.max(.012,length(a))**power),scale(b,qi/Math.max(.012,length(b))**power)),line?2*k:k);
    }};
}

const imageCurrent = {
  id:'image-current',chapter:4,title:'磁介质界面的镜像电流',
  description:'用镜像电流和透射等效电流处理长直导线与平面磁介质边界。',
  topics:['镜像电流','磁场边值问题','磁介质界面','磁通法向连续','磁场切向连续'],
  params:[slider('i','实际电流 I',-12,12,.5,6,'A'),slider('mu','介质 2 相对磁导率 μᵣ',.1,20,.1,6),
    slider('d','导线离界面距离 d',.65,2.8,.05,1.65,'m')],
  legend:[item('interface','磁介质界面',blue),item('wire','真实电流与镜像',gold),item('field','两侧磁感应强度 B',cyan)],
  equation:'I′ = I(μ₂−μ₁)/(μ₂+μ₁)；I透 = 2μ₁I/(μ₂+μ₁)',
  explanation:'导线沿 +y 且位于 x>0 的真空中。真空侧的场来自实际电流与镜像，介质侧用透射等效电流计算。在 x=0，法向 B 与切向 H 连续。镜像电流方向可随磁导率比改变。',
  task:'将 μᵣ 调到 1，再调到小于 1，观察镜像电流消失和反向；核对两侧界面读数。',
  metrics(p){
    const {image,field}=currentImageData(p);
    const left=field([0,0,1],false),right=field([0,0,1],true);
    return [metric('镜像电流 I′',num(image,3),'A'),
      metric('界面 Bₙ（两侧）',num(left[0],3)+' / '+num(right[0],3),'μT'),
      metric('界面 Hₜ（两侧）',num(left[2]*1e-6/(MU0*p.mu),3)+' / '+num(right[2]*1e-6/MU0,3),'A/m')];
  },
  chart(p){
    const {field}=currentImageData(p);
    const points=[...curve(-4.5,0,49,x=>field([x,0,.8],false)[2]),...curve(0,4.5,49,x=>field([x,0,.8],true)[2])];
    return plot('跨磁介质边界的切向磁感应强度','位置 x (m)，z = 0.8 m','B_z (μT)',
      series('B_z',cyan,points));
  },
  build(ctx,p){
    const {image,field}=currentImageData(p);
    const surface=ctx.layer('interface'), wire=ctx.layer('wire'), arrows=ctx.layer('field');
    ctx.box(surface,[0,0,0],[.045,5.35,5.6],blue,.2);
    ctx.label(surface,'μ₂ / μ₁ = '+p.mu,[-1.6,2.65,0],blue);
    for(const [x,i,color,label] of [[p.d,p.i,gold,'I'],[-p.d,image,rose,'I′']]){
      ctx.line(wire,[[x,-2.6,0],[x,2.6,0]],color,x>0?.9:.52);
      if(Math.abs(i)>.01) axis(ctx,wire,[x,-Math.sign(i),0],[0,Math.sign(i),0],label,color,1.95);
    }
    gridField(ctx,arrows,[-4,-2.65,-1.3,-.45,.45,1.3,2.65,4],[-1.8,0,1.8],[-1.4,1.4],
      r=>field(r,r[0]>=0),cyan,.67,.78);
  }
};
function currentImageData(p){
  const image=p.i*(p.mu-1)/(p.mu+1), transmitted=2*p.i/(p.mu+1);
  const contribution=([x,,z],source,current)=>{
    const d=x-source;
    return scale([z,0,-d],.2*current/Math.max(.0005,d*d+z*z));
  };
  return {image,field:(r,right)=>right?add(contribution(r,p.d,p.i),contribution(r,-p.d,image)):
    contribution(r,p.d,p.mu*transmitted)};
}

const finiteDifference = {
  id:'finite-difference',chapter:4,title:'有限差分求解拉普拉斯方程',
  description:'改变初始值、迭代算法和步数，观察电位收敛及残差。',
  topics:['有限差分法','五点模板','迭代收敛','边值唯一性','数值误差','场分布可视化'],
  params:[choice('scheme','迭代方法',[['sor','逐点超松弛 SOR'],['jacobi','同步 Jacobi']],'sor'),
    choice('initial','内部初始值',[['zero','0 V'],['biased','初始等于上边界峰值']],'zero'),
    slider('steps','迭代步数',0,480,4,100),slider('voltage','正弦上边界幅值 U',10,100,5,50,'V')],
  legend:[item('surface','数值电位曲面',blue),item('boundary','固定边界与中心剖面',gold)],
  equation:'φᵢⱼ ← (φᵢ₊₁,ⱼ + φᵢ₋₁,ⱼ + φᵢ,ⱼ₊₁ + φᵢ,ⱼ₋₁)/4',
  explanation:'均匀网格间距 0.2 m，四邻点差分近似拉普拉斯算子。Jacobi 同步使用上一步值，SOR 以松弛因子 1.74 逐点更新。对比解析分离变量解与差分方程残差可评价数值收敛。',
  task:'用两个不同初值求解同一边界，对比少量和大量迭代后的中心电位及残差。',
  metrics(p){
    const {value,residual}=laplaceGrid(p);
    const numerical=value(4,2.4), exact=rectPotential({...p,height:4.8,edge:'sine'},4,2.4);
    return [metric('数值中心电位',num(numerical,3),'V'),metric('解析中心电位',num(exact,3),'V'),
      metric('中心绝对误差',num(Math.abs(numerical-exact),4),'V'),
      metric('最大离散残差',residual>0?residual.toExponential(2):0,'V/m²')];
  },
  chart(p){
    const {value}=laplaceGrid(p);
    return plot('矩形中线的数值解与解析解','横向位置 x (m)','电位 φ (V)',
      series('差分数值解',blue,curve(0,8,80,x=>value(x,2.4))),
      series('分离变量解析解',gold,curve(0,8,80,x=>rectPotential({...p,height:4.8,edge:'sine'},x,2.4))));
  },
  build(ctx,p){
    const {value}=laplaceGrid(p);
    const surface=ctx.layer('surface'), boundary=ctx.layer('boundary');
    const fn=(x,z)=>2.6*value(x+4,z+2.4)/p.voltage;
    surfaceLines(ctx,surface,fn,blue,{z0:-2.4,z1:2.4,n:20});
    ctx.line(boundary,[[-4,0,2.4],[-4,0,-2.4],[4,0,-2.4],[4,0,2.4]],gray,.7);
    ctx.tube(boundary,sample(-4,4,65,x=>[x,fn(x,2.4),2.4]),gold,.023);
    ctx.tube(boundary,sample(-4,4,65,x=>[x,fn(x,0),0]),gold,.022,.76);
    ctx.sphere(boundary,[0,fn(0,0),0],.075,gold);
  }
};
let laplaceCache;
function laplaceGrid(p){
  const key=[p.voltage,p.scheme,p.initial,p.steps].join('|');
  if(laplaceCache?.key===key) return laplaceCache;
  const cols=41,rows=25,step=.2;
  let grid=new Float64Array(cols*rows), next=new Float64Array(grid.length);
  const setBoundary=g=>{
    for(let i=1;i<cols-1;i++) g[(rows-1)*cols+i]=p.voltage*Math.sin(Math.PI*i/(cols-1));
  };
  setBoundary(grid);setBoundary(next);
  if(p.initial==='biased') for(let j=1;j<rows-1;j++) grid.fill(p.voltage,j*cols+1,(j+1)*cols-1);
  for(let iteration=0;iteration<p.steps;iteration++){
    for(let j=1;j<rows-1;j++) for(let i=1;i<cols-1;i++){
      const k=j*cols+i,mean=(grid[k-1]+grid[k+1]+grid[k-cols]+grid[k+cols])/4;
      if(p.scheme==='sor') grid[k]+=1.74*(mean-grid[k]);
      else next[k]=mean;
    }
    if(p.scheme==='jacobi') [grid,next]=[next,grid];
  }
  let residual=0;
  for(let j=1;j<rows-1;j++) for(let i=1;i<cols-1;i++){
    const k=j*cols+i;
    residual=Math.max(residual,Math.abs(grid[k-1]+grid[k+1]+grid[k-cols]+grid[k+cols]-4*grid[k])/step**2);
  }
  const value=(x,z)=>{
    const fx=Math.max(0,Math.min(cols-1,x/step)),fz=Math.max(0,Math.min(rows-1,z/step));
    const i=Math.min(cols-2,Math.floor(fx)),j=Math.min(rows-2,Math.floor(fz));
    const a=fx-i,b=fz-j,k=j*cols+i;
    return (1-b)*(grid[k]*(1-a)+grid[k+1]*a)+b*(grid[k+cols]*(1-a)+grid[k+cols+1]*a);
  };
  return laplaceCache={key,value,residual};
}

export const labs = [
  coordinates,vectorAlgebra,differential,explicit,laser,
  charges,dielectric,electroSphere,conduction,
  wire,ampereForce,magnet,magneticShield,spiralCoil,
  separation,imageCharge,imageCurrent,finiteDifference
].map(lab=>({...lab,animated:lab===laser}));
