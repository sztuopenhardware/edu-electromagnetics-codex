import { createScene } from './scene.mjs';
import { drawChart } from './chart.mjs';

const chapters = [
  ['一', '矢量分析'],
  ['二', '静电场与恒定电场'],
  ['三', '恒定磁场'],
  ['四', '静态场的边值问题'],
  ['五', '时变电磁场'],
  ['六', '均匀平面电磁波'],
  ['七', '电磁波的反射与折射'],
  ['八', '导行电磁波'],
  ['九', '电磁波辐射'],
  ['十', '电磁波传播'],
];
const chapterName = (chapter) => `第${chapters[chapter - 1][0]}章 · ${chapters[chapter - 1][1]}`;
const modulePaths = ['./labs-static.mjs', './labs-waves.mjs', './labs-advanced.mjs'];
const $ = (id) => document.getElementById(id);
const element = (tag, className = '', value = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
};
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
};
const swatch = (color) => {
  const node = element('span', 'swatch');
  node.style.setProperty('--swatch', color);
  return node;
};

const chapterSelect = $('chapter-select');
const labSelect = $('lab-select');
const parameterForm = $('parameters');
const stageCard = $('stage-card');
const chartCanvas = $('chart');
const timeSlider = $('timeline');
const timeWindow = Number(timeSlider.max);
const catalog = $('catalog');
const visibility = new Map();
const numeric = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 5, useGrouping: false });
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const chapterLabs = new Map();
const labs = [];
let current;
let parameters = {};
let activeParameters = {};
let scene;
let sceneError = '';
let time = 0;
let playing = !motion.matches;
let speed = 1;
let dirty = true;
let pendingBuild = false;
let lastFrame = 0;
let lastChart = -Infinity;
let lastMetrics = '';
let lastChartLegend = '';

function showSceneMessage(message) {
  $('renderer-message').textContent = message;
  $('renderer-message').hidden = !message;
}

function status() {
  const staticLab = current?.animated === false;
  const action = playing ? '暂停' : '播放';
  $('status-text').textContent = sceneError ? '三维不可用' : staticLab ? '静态场景' : playing ? '运行中' : '已暂停';
  $('scene-status').dataset.paused = String(staticLab || !playing || Boolean(sceneError));
  $('play-toggle').replaceChildren(icon(playing && !staticLab ? 'pause' : 'play'));
  $('play-toggle').setAttribute('aria-label', action);
  $('play-toggle').title = action;
  for (const id of ['play-toggle', 'restart', 'step', 'timeline', 'speed']) $(id).disabled = staticLab;
}

function defaultParameters(lab) {
  return Object.fromEntries(lab.params.map(({ key, value }) => [key, value]));
}

function loadLab(lab, updateAddress = true) {
  if (!lab || lab === current) return;
  current = lab;
  time = 0;
  lastChart = -Infinity;
  parameters = defaultParameters(lab);
  activeParameters = { ...parameters };
  visibility.clear();
  chapterSelect.value = String(lab.chapter);
  labSelect.replaceChildren(...chapterLabs.get(lab.chapter).map((item) => new Option(item.title, item.id)));
  labSelect.value = lab.id;
  $('chapter-crumb').textContent = chapterName(lab.chapter);
  $('lab-title').textContent = lab.title;
  $('lab-description').textContent = lab.description;
  $('equation').textContent = lab.equation;
  $('explanation').textContent = lab.explanation;
  $('lab-task').textContent = lab.task;
  $('topics').replaceChildren(...lab.topics.map((topic) => element('span', 'topic', topic)));
  document.title = `${lab.title} · 电磁场与电磁波`;
  const index = labs.indexOf(lab);
  $('lab-index').textContent = `${String(index + 1).padStart(2, '0')} / ${labs.length}`;
  $('previous-lab').disabled = index <= 0;
  $('next-lab').disabled = index >= labs.length - 1;
  $('legend').replaceChildren(...lab.legend.map(({ key, label, color }) => {
    visibility.set(key, true);
    const button = element('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'true');
    button.append(swatch(color), label);
    button.addEventListener('click', () => {
      const visible = !visibility.get(key);
      visibility.set(key, visible);
      button.setAttribute('aria-pressed', String(visible));
      scene?.setLayer(key, visible);
    });
    return button;
  }));
  for (const button of $('catalog-chapters').querySelectorAll('.case-link')) {
    if (button.dataset.lab === lab.id) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
  renderParameters();
  markCameraView('iso');
  if (scene) scene.setView('iso', lab);
  pendingBuild = true;
  dirty = true;
  status();
  updateClock();
  if (updateAddress && location.hash !== `#${lab.id}`) history.pushState(null, '', `#${lab.id}`);
}

function rangeFill(input) {
  const fill = 100 * (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  input.style.setProperty('--range-fill', `${fill}%`);
}

function handleParameters() {
  const errors = current.validate?.(parameters) ?? {};
  for (const input of parameterForm.querySelectorAll('.parameter-text')) {
    const error = $(`${input.id}-error`);
    const message = errors[input.name] ?? '';
    input.setAttribute('aria-invalid', String(Boolean(message)));
    error.textContent = message;
    error.hidden = !message;
  }
  if (Object.values(errors).some(Boolean)) return;
  activeParameters = { ...parameters };
  pendingBuild = true;
  dirty = true;
}

function renderParameters() {
  parameterForm.replaceChildren(...current.params.map((param) => {
    const row = element('div', 'parameter');
    const inputId = `param-${param.key}`;
    const label = element('label', 'parameter-label', param.label);
    label.htmlFor = inputId;
    row.append(label);
    if (param.options) {
      const select = element('select', 'parameter-select');
      select.id = inputId;
      for (const [index, { label, value }] of param.options.entries()) {
        select.add(new Option(label, String(index), false, Object.is(parameters[param.key], value)));
      }
      select.addEventListener('change', () => {
        parameters[param.key] = param.options[Number(select.value)].value;
        handleParameters();
      });
      const wrapper = element('span', 'select-box');
      wrapper.append(select, icon('chevron'));
      row.append(wrapper);
    } else if (param.type === 'text') {
      const input = element('input', 'parameter-text');
      const error = element('small', 'parameter-error');
      input.id = inputId;
      input.name = param.key;
      input.maxLength = 180;
      input.spellcheck = false;
      input.value = parameters[param.key];
      error.id = `${inputId}-error`;
      error.hidden = true;
      error.setAttribute('role', 'status');
      input.setAttribute('aria-describedby', error.id);
      input.addEventListener('input', () => {
        parameters[param.key] = input.value;
        handleParameters();
      });
      row.append(input, error);
    } else {
      const input = element('input', 'range');
      input.id = inputId;
      input.type = 'range';
      input.min = param.min;
      input.max = param.max;
      input.step = param.step ?? 'any';
      input.value = parameters[param.key];
      const value = element('output', 'parameter-value');
      value.htmlFor = inputId;
      function writeValue() {
        value.textContent = `${numeric.format(Number(input.value))}${param.unit ? ` ${param.unit}` : ''}`;
        input.setAttribute('aria-valuetext', value.textContent);
        rangeFill(input);
      }
      writeValue();
      input.addEventListener('input', () => {
        parameters[param.key] = Number(input.value);
        writeValue();
        handleParameters();
      });
      const ends = element('div', 'range-ends');
      ends.setAttribute('aria-hidden', 'true');
      ends.append(element('span', '', String(param.min)), element('span', '', String(param.max)));
      label.append(value);
      row.append(input, ends);
    }
    return row;
  }));
}

function markCameraView(view) {
  for (const button of $('camera-views').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
}

function updateClock() {
  timeSlider.value = String(time);
  rangeFill(timeSlider);
  $('clock').textContent = `${time.toFixed(2)} s`;
}

function updateChart() {
  const chart = current.chart(activeParameters, time);
  $('plot-title').textContent = chart.title;
  chartCanvas.setAttribute('aria-label', [chart.title, chart.xLabel, chart.yLabel].filter(Boolean).join('，'));
  drawChart(chartCanvas, chart);
  const legendData = JSON.stringify(chart.series.map(({ label, color }) => [label, color]));
  if (legendData !== lastChartLegend) {
    $('chart-legend').replaceChildren(...chart.series.map(({ label, color }) => {
      const item = element('span');
      item.append(swatch(color), label);
      return item;
    }));
    lastChartLegend = legendData;
  }
  const metrics = current.metrics(activeParameters, time);
  const nextMetrics = JSON.stringify(metrics);
  if (lastMetrics !== nextMetrics) {
    $('metrics').replaceChildren(...metrics.map(({ label, value, unit }) => {
      const item = element('div', 'metric');
      const readout = element('span', 'metric-value', typeof value === 'number' ? numeric.format(value) : value);
      if (unit) readout.append(element('small', '', unit));
      item.append(element('span', 'metric-label', label), readout);
      return item;
    }));
    lastMetrics = nextMetrics;
  }
}

function stepFrame(now) {
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 0;
  lastFrame = now;
  if (!current) return;
  const moving = playing && current.animated !== false;
  if (moving) time = (time + dt * speed) % timeWindow;
  if (pendingBuild) {
    try {
      scene?.build(current, activeParameters, visibility, false);
      if (!sceneError) showSceneMessage('');
    } catch (error) {
      console.error(error);
      showSceneMessage('场景计算失败。可重置实验参数后重新计算。');
    }
    pendingBuild = false;
  }
  if (scene && !sceneError) {
    try {
      scene.draw(time, dirty || moving);
    } catch (error) {
      console.error(error);
      sceneError = '三维渲染中断，请刷新页面后重试。';
      showSceneMessage(sceneError);
      status();
    }
  }
  if (dirty || (moving && now - lastChart >= 60)) {
    updateClock();
    try {
      if (dirty || current.liveChart !== false) updateChart();
    } catch (error) {
      console.error(error);
    }
    lastChart = now;
    dirty = false;
  }
  requestAnimationFrame(stepFrame);
}

function setTime(value) {
  time = value;
  dirty = true;
  updateClock();
}

function bindControls() {
  const addressLab = () => labs.find(({ id }) => location.hash === `#${id}`);
  const firstLab = labs.find(({ id }) => id === 'plane-wave') ?? labs[0];
  window.addEventListener('hashchange', () => loadLab(addressLab() ?? firstLab, false));
  chapterSelect.addEventListener('change', () => loadLab(chapterLabs.get(Number(chapterSelect.value))?.[0]));
  labSelect.addEventListener('change', () => loadLab(labs.find(({ id }) => id === labSelect.value)));
  $('previous-lab').addEventListener('click', () => loadLab(labs[labs.indexOf(current) - 1]));
  $('next-lab').addEventListener('click', () => loadLab(labs[labs.indexOf(current) + 1]));
  $('open-catalog').addEventListener('click', () => {
    const chapter = $('catalog-chapters').querySelector(`[data-chapter="${current.chapter}"]`);
    if (chapter) chapter.open = true;
    catalog.showModal();
  });
  $('close-catalog').addEventListener('click', () => catalog.close());
  catalog.addEventListener('click', (event) => {
    if (event.target === catalog) catalog.close();
  });
  $('play-toggle').addEventListener('click', () => {
    playing = !playing;
    status();
    dirty = true;
  });
  $('restart').addEventListener('click', () => setTime(0));
  $('step').addEventListener('click', () => {
    playing = false;
    status();
    setTime((time + .05) % timeWindow);
  });
  timeSlider.addEventListener('input', () => {
    playing = false;
    status();
    setTime(Number(timeSlider.value));
  });
  $('speed').addEventListener('change', (event) => { speed = Number(event.target.value); });
  $('reset-parameters').addEventListener('click', () => {
    parameters = defaultParameters(current);
    renderParameters();
    handleParameters();
  });
  parameterForm.addEventListener('submit', (event) => event.preventDefault());
  for (const [id, toggle] of [['grid-toggle', 'setGrid'], ['axes-toggle', 'setAxes']]) {
    $(id).addEventListener('click', (event) => {
      const button = event.currentTarget;
      const show = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(show));
      scene?.[toggle](show);
    });
  }
  $('reset-view').addEventListener('click', () => scene?.resetView());
  $('camera-views').addEventListener('click', (event) => {
    const view = event.target.closest('[data-view]')?.dataset.view;
    if (!view) return;
    scene?.setView(view);
    markCameraView(view);
  });
  $('fullscreen').disabled = !document.fullscreenEnabled;
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageCard.requestFullscreen();
    } catch (error) {
      console.warn('浏览器无法进入全屏', error);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? '退出全屏' : '全屏场景';
    $('fullscreen').title = label;
    $('fullscreen').setAttribute('aria-label', label);
  });
  new ResizeObserver(() => { dirty = true; }).observe(chartCanvas);
  loadLab(addressLab() ?? firstLab, false);
}

function caseButton(lab, text = lab.title) {
  const button = element('button', 'case-link', text);
  button.type = 'button';
  button.dataset.lab = lab.id;
  button.addEventListener('click', () => {
    loadLab(lab);
    catalog.close();
    labSelect.focus();
  });
  return button;
}

function buildCatalog() {
  $('catalog-count').textContent = `${chapterLabs.size} 个教学章节 · ${labs.length} 个交互案例`;
  for (const [number, items] of chapterLabs) {
    chapterSelect.add(new Option(chapterName(number), String(number)));
    const details = element('details', 'chapter-details');
    details.dataset.chapter = number;
    const summary = element('summary', '', chapterName(number));
    summary.append(element('span', '', `${items.length} 个案例`));
    const group = element('div', 'chapter-items');
    group.append(...items.map((lab) => caseButton(lab)));
    details.append(summary, group);
    $('catalog-chapters').append(details);
  }
  const practical = [
    ['实验一 · 矢量分析', ['vector-calculus', 'explicit-field-functions', 'moving-gaussian-field']],
    ['实验二 · 静态电磁场分析', ['conducting-dielectric-sphere', 'permanent-magnet', 'magnetic-shielding']],
    ['实验三 · 安培定理与法拉第电磁感应定律', ['pcb-spiral-field', 'faraday-eddy']],
    ['实验四 · 时谐电磁场', ['plane-wave']],
    ['实验五（实践项目表）· 波导分析', ['rectangular-waveguide', 'tem-lines']],
    ['实验五（项目详述）· 偶极子天线', ['hertzian-dipole', 'center-fed-dipole']],
  ];
  for (const [title, ids] of practical) {
    const items = ids.map((id) => labs.find((lab) => lab.id === id)).filter(Boolean);
    if (!items.length) continue;
    const row = element('div', 'practical-row');
    row.append(element('h4', '', title), ...items.map((lab) => caseButton(lab)));
    $('practical-links').append(row);
  }
}

async function init() {
  const results = await Promise.allSettled(modulePaths.map((path) => import(path)));
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled' && Array.isArray(result.value.labs)) labs.push(...result.value.labs);
    else console.error('实验模块不可用', modulePaths[index], result.reason);
  }
  if (!labs.length) {
    showSceneMessage('实验案例加载失败，请刷新页面后重试。');
    $('status-text').textContent = '加载失败';
    return;
  }
  for (const lab of labs) {
    if (!chapterLabs.has(lab.chapter)) chapterLabs.set(lab.chapter, []);
    chapterLabs.get(lab.chapter).push(lab);
  }
  try {
    scene = createScene($('renderer-host'));
    scene.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      sceneError = '三维图形上下文暂时中断。仍可调节参数并查看曲线。';
      showSceneMessage(sceneError);
      status();
    });
    scene.canvas.addEventListener('webglcontextrestored', () => {
      sceneError = '';
      pendingBuild = true;
      dirty = true;
      status();
    });
  } catch (error) {
    console.warn('WebGL 2 初始化失败', error);
    sceneError = '浏览器当前无法使用 WebGL 2。参数、实时曲线与实验导读仍可使用。';
    showSceneMessage(sceneError);
  }
  buildCatalog();
  bindControls();
  requestAnimationFrame(stepFrame);
}

init();
