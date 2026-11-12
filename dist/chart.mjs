const number = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 4 });

function tick(value) {
  if (Math.abs(value) < 1e-12) return '0';
  return Math.abs(value) >= 1e5 || Math.abs(value) < .001 ? value.toExponential(1) : number.format(value);
}

export function drawChart(canvas, data) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const scale = Math.min(window.devicePixelRatio, 2);
  const pixelsWide = Math.round(width * scale);
  const pixelsHigh = Math.round(height * scale);
  if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
    canvas.width = pixelsWide;
    canvas.height = pixelsHigh;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const points = data.series.flatMap(({ points }) => points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  if (!points.length) return;
  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);
  const xMin = data.xMin ?? Math.min(...xValues);
  const xMax = Math.max(xMin + 1e-9, data.xMax ?? Math.max(...xValues));
  const low = Math.min(...yValues);
  const high = Math.max(...yValues);
  const padding = (high - low || Math.max(Math.abs(low), 1)) * .085;
  const yMin = data.yMin ?? low - padding;
  const yMax = Math.max(yMin + 1e-9, data.yMax ?? high + padding);
  const left = width < 380 ? 58 : 70;
  const top = 10;
  const right = width - 14;
  const bottom = height - 36;
  const xPos = (x) => left + (x - xMin) / (xMax - xMin) * (right - left);
  const yPos = (y) => bottom - (y - yMin) / (yMax - yMin) * (bottom - top);

  ctx.font = '10px "Cascadia Code", Consolas, monospace';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#9dafc3';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i += 1) {
    const value = yMin + i * (yMax - yMin) / 4;
    const y = yPos(value);
    ctx.strokeStyle = '#293a4c';
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(tick(value), left - 7, y);
  }
  const segments = width < 440 ? 4 : 6;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= segments; i += 1) {
    const value = xMin + i * (xMax - xMin) / segments;
    const x = xPos(value);
    ctx.strokeStyle = '#263547';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillText(tick(value), x, bottom + 6);
  }
  ctx.fillStyle = '#b0bfd0';
  ctx.font = '11px "Microsoft YaHei UI", "PingFang SC", sans-serif';
  ctx.fillText(data.xLabel ?? '', (left + right) / 2, bottom + 22);
  ctx.save();
  ctx.translate(7, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(data.yLabel ?? '', 0, 0, bottom - top);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top - 1, right - left, bottom - top + 2);
  ctx.clip();
  for (const series of data.series) {
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.setLineDash(series.dashed ? [5, 4] : []);
    ctx.beginPath();
    let drawing = false;
    for (const [x, y] of series.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(xPos(x), yPos(y));
      else ctx.moveTo(xPos(x), yPos(y));
      drawing = true;
    }
    ctx.stroke();
  }
  ctx.restore();
}
