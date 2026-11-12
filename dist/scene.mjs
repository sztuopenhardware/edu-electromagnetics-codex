import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const vector = (point) => new THREE.Vector3(...point);
const up = new THREE.Vector3(0, 1, 0);
const colorOf = (color) => new THREE.Color(color);

function line(parent, points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(vector));
  geometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const object = new THREE.Line(geometry, material);
  parent.add(object);
  return object;
}

function updateLine(object, points) {
  const attribute = object.geometry.getAttribute('position');
  if (attribute.count !== points.length) {
    object.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3).setUsage(THREE.DynamicDrawUsage));
  } else {
    points.forEach((point, index) => attribute.setXYZ(index, ...point));
    attribute.needsUpdate = true;
  }
  object.geometry.computeBoundingSphere();
}

function tube(parent, points, color, radius = .025, opacity = 1) {
  const path = new THREE.CatmullRomCurve3(points.map(vector));
  const geometry = new THREE.TubeGeometry(path, Math.max(8, points.length - 1), radius, 6, false);
  return mesh(parent, geometry, [0, 0, 0], color, opacity);
}

function arrow(parent, origin, direction, length, color) {
  const axis = vector(direction);
  if (!axis.lengthSq()) axis.copy(up);
  const size = Math.max(.0001, Math.abs(length));
  const tip = Math.min(.18, size * .27);
  const object = new THREE.ArrowHelper(axis.normalize(), vector(origin), size, color, tip, tip * .64);
  parent.add(object);
  return object;
}

function mesh(parent, geometry, position, color, opacity) {
  const material = new THREE.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity >= 1 });
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  parent.add(object);
  return object;
}

function sphere(parent, position, radius, color, opacity = 1) {
  return mesh(parent, new THREE.SphereGeometry(radius, 18, 12), position, color, opacity);
}

function box(parent, position, size, color, opacity = 1) {
  return mesh(parent, new THREE.BoxGeometry(...size), position, color, opacity);
}

function label(parent, text, position, color) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = '600 42px "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif';
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width + 30);
  canvas.height = 72;
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeStyle = '#0b1320';
  context.lineWidth = 7;
  context.strokeText(text, canvas.width / 2, 37);
  context.fillStyle = colorOf(color).getStyle();
  context.fillText(text, canvas.width / 2, 37);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const object = new THREE.Sprite(material);
  object.position.set(...position);
  object.scale.set(.47 * canvas.width / canvas.height, .47, 1);
  parent.add(object);
  return object;
}

function dispose(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material?.map?.dispose();
      material?.dispose();
    }
  });
  group.clear();
}

function createGrid() {
  const grid = new THREE.Group();
  const floor = new THREE.GridHelper(22, 44, '#385570', '#2b4159');
  floor.position.y = -2.95;
  floor.material.transparent = true;
  floor.material.opacity = .43;
  floor.material.depthWrite = false;
  grid.add(floor);
  const frameColor = '#3f5b74';
  line(grid, [[-7, -2.94, -4], [7, -2.94, -4], [7, -2.94, 4], [-7, -2.94, 4], [-7, -2.94, -4]], frameColor, .7);
  for (const x of [-7, 7]) {
    for (const z of [-4, 4]) line(grid, [[x, -2.94, z], [x, -2.42, z]], frameColor, .65);
  }
  return grid;
}

function createAxes() {
  const axes = new THREE.Group();
  const origin = [-6.5, -2.94, 3.45];
  const axisSpecs = [
    [[1, 0, 0], [1.46, 0, 0], 'x', '#86a7c6'],
    [[0, 1, 0], [0, 1.42, 0], 'y', '#9bbac9'],
    [[0, 0, 1], [0, 0, 1.34], 'z', '#8098bc'],
  ];
  for (const [direction, offset, text, color] of axisSpecs) {
    arrow(axes, origin, direction, 1.15, color);
    label(axes, text, origin.map((value, i) => value + offset[i]), color);
  }
  return axes;
}

export function createScene(host) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-label', '交互三维场景，方向键平移视图');
  renderer.domElement.tabIndex = 0;
  host.append(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(37, 1, .1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.minDistance = 5.4;
  controls.maxDistance = 60;
  controls.listenToKeyEvents(renderer.domElement);

  scene.add(new THREE.HemisphereLight('#d1e5ff', '#1c293c', 2.1));
  const key = new THREE.DirectionalLight('#e5f2ff', 2);
  key.position.set(4, 7, 6);
  scene.add(key);
  const grid = createGrid();
  const axes = createAxes();
  const group = new THREE.Group();
  scene.add(grid, axes, group);

  const layers = new Map();
  const ctx = {
    THREE, group, line, updateLine, tube, arrow, sphere, box, label,
    layer(key) {
      if (!layers.has(key)) {
        const layer = new THREE.Group();
        group.add(layer);
        layers.set(key, layer);
      }
      return layers.get(key);
    },
  };

  let update = null;
  let aspect = 1;
  let cameraMode = 'iso';
  let currentLab;
  let fitScale = 1;

  function framingScale() {
    return Math.max(1, 1.52 / aspect);
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    aspect = width / height;
    const nextScale = framingScale();
    camera.position.sub(controls.target).multiplyScalar(nextScale / fitScale).add(controls.target);
    fitScale = nextScale;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  new ResizeObserver(resize).observe(host);

  function setView(mode, lab = currentLab) {
    cameraMode = mode;
    currentLab = lab;
    fitScale = framingScale();
    const target = lab?.target || [0, 0, 0];
    const iso = lab?.view || [7.2, 4.6, 14.7];
    const distance = vector(iso).distanceTo(vector(target));
    const position = mode === 'top' ? [target[0], target[1] + distance, target[2] + .002]
      : mode === 'front' ? [target[0], target[1], target[2] + distance] : iso;
    controls.target.set(...target);
    camera.position.copy(vector(position).sub(controls.target).multiplyScalar(fitScale).add(controls.target));
    controls.update();
  }
  resize();
  setView('iso');

  return {
    canvas: renderer.domElement,
    build(lab, params, visibility, reset) {
      dispose(group);
      layers.clear();
      update = null;
      update = lab.build(ctx, params);
      for (const [key, visible] of visibility) {
        const layer = layers.get(key);
        if (layer) layer.visible = visible;
      }
      if (reset) setView('iso', lab);
    },
    draw(time, advance) {
      if (advance && typeof update === 'function') update(time);
      controls.update();
      renderer.render(scene, camera);
    },
    setLayer(key, visible) {
      if (layers.has(key)) layers.get(key).visible = visible;
    },
    setGrid(visible) { grid.visible = visible; },
    setAxes(visible) { axes.visible = visible; },
    setView,
    resetView() { setView(cameraMode); },
  };
}
