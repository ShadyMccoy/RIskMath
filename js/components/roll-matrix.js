// Shared dice-roll matrix: builds a Marimekko-sized grid of (sorted attacker
// tops × sorted defender tops) cells colored by attacker-loss outcome, and
// can animate the cells into a single stacked outcome bar where same-color
// rectangles pack contiguously while preserving each cell's area.

import { el, pct } from '../util.js';

const DEFAULT_OPTS = {
  pxPerCount: 0.95,
  minTrack: 7,
  legibleTrack: 11,
  digitTrack: 8,
  mcSize: 18,
  fontSize: 10,
  labelFontSize: 9,
  pctFontSize: 18,
  nameFontSize: 10,
};

// Enumerate the sorted-descending top-K of all 6^N dice rolls, with the
// number of underlying ordered rolls that produce each top-K tuple. Sorted
// by tuple sum descending (strongest first), tiebreak by top die descending.
function topsOfN(N, K) {
  const map = new Map();
  const dice = new Array(N).fill(1);
  while (true) {
    const sorted = [...dice].sort((a, b) => b - a);
    const key = sorted.slice(0, K).join(',');
    map.set(key, (map.get(key) || 0) + 1);
    let i = N - 1;
    while (i >= 0 && dice[i] === 6) { dice[i] = 1; i--; }
    if (i < 0) break;
    dice[i]++;
  }
  return [...map.entries()]
    .map(([key, count]) => {
      const tops = key.split(',').map(Number);
      const sum = tops.reduce((s, x) => s + x, 0);
      return { tops, count, sum };
    })
    .sort((a, b) => {
      if (a.sum !== b.sum) return b.sum - a.sum;
      for (let i = 0; i < a.tops.length; i++) {
        if (a.tops[i] !== b.tops[i]) return b.tops[i] - a.tops[i];
      }
      return 0;
    });
}

function attLossesFor(attTops, defTops) {
  let lost = 0;
  for (let i = 0; i < attTops.length; i++) {
    if (attTops[i] <= defTops[i]) lost++;
  }
  return lost;
}

export function buildMatrix(a, d, userOpts = {}) {
  const opts = { ...DEFAULT_OPTS, ...userOpts };
  const K = Math.min(a, d);
  const rows = topsOfN(a, K);
  const cols = topsOfN(d, K);
  const trackPx = (count) => Math.max(opts.minTrack, Math.round(count * opts.pxPerCount));
  const rowPx = rows.map(r => trackPx(r.count));
  const colPx = cols.map(c => trackPx(c.count));

  const matrix = el('div', { class: 'odds-matrix' });
  matrix.style.setProperty('--mc-size', opts.mcSize + 'px');
  matrix.style.fontSize = opts.fontSize + 'px';
  matrix.style.gridTemplateColumns =
    `repeat(${K}, ${opts.mcSize}px) auto ${colPx.map(p => p + 'px').join(' ')}`;
  matrix.style.gridTemplateRows =
    `repeat(${K + 1}, ${opts.mcSize}px) ${rowPx.map(p => p + 'px').join(' ')}`;

  const labelStyle = { fontSize: opts.labelFontSize + 'px' };

  for (let j = 0; j < K; j++) {
    for (let k = 0; k < K; k++) matrix.appendChild(el('div', { class: 'mc-corner' }));
    matrix.appendChild(el('div', { class: 'mc-corner mc-label', style: labelStyle }, `D${j + 1}`));
    for (let ci = 0; ci < cols.length; ci++) {
      const text = colPx[ci] >= opts.digitTrack ? String(cols[ci].tops[j]) : '';
      matrix.appendChild(el('div', { class: 'mc-head' }, text));
    }
  }
  for (let k = 0; k < K; k++) {
    matrix.appendChild(el('div', { class: 'mc-corner mc-label', style: labelStyle }, `A${k + 1}`));
  }
  matrix.appendChild(el('div', { class: 'mc-corner mc-label', style: labelStyle }, 'count'));
  for (let ci = 0; ci < cols.length; ci++) {
    const text = colPx[ci] >= opts.legibleTrack ? String(cols[ci].count) : '';
    matrix.appendChild(el('div', { class: 'mc-head mc-count', style: labelStyle }, text));
  }

  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const rh = rowPx[ri];
    for (let k = 0; k < K; k++) {
      const text = rh >= opts.digitTrack ? String(r.tops[k]) : '';
      matrix.appendChild(el('div', { class: 'mc-rh' }, text));
    }
    const countText = rh >= opts.legibleTrack ? String(r.count) : '';
    matrix.appendChild(el('div', { class: 'mc-rh mc-count', style: labelStyle }, countText));
    for (let ci = 0; ci < cols.length; ci++) {
      const c = cols[ci];
      const lost = attLossesFor(r.tops, c.tops);
      const cls = lost === 0 ? 'def' : lost === K ? 'att' : 'both';
      const showDigit = rh >= opts.legibleTrack && colPx[ci] >= opts.legibleTrack;
      matrix.appendChild(el('div', { class: `mc-cell ${cls}` }, showDigit ? String(lost) : ''));
    }
  }

  matrix._reduceOpts = opts;
  return matrix;
}

const REDUCE_ORDER = ['def', 'both', 'att'];
const REDUCE_LABELS = { def: 'Defender loses all', both: 'Split', att: 'Attacker loses all' };

function classifyCell(cell) {
  if (cell.classList.contains('def')) return 'def';
  if (cell.classList.contains('att')) return 'att';
  return 'both';
}

export function reduceMatrix(matrix, overlay) {
  const opts = matrix._reduceOpts || DEFAULT_OPTS;
  const cells = [...matrix.querySelectorAll('.mc-cell')];
  const headers = [...matrix.querySelectorAll('.mc-corner, .mc-head, .mc-rh')];
  const matrixRect = matrix.getBoundingClientRect();

  const cellRects = new Map();
  let bodyMinX = Infinity, bodyMinY = Infinity, bodyMaxX = -Infinity, bodyMaxY = -Infinity;
  let totalArea = 0;
  for (const cell of cells) {
    const r = cell.getBoundingClientRect();
    const x = r.left - matrixRect.left;
    const y = r.top - matrixRect.top;
    const w = r.width, h = r.height;
    cellRects.set(cell, { x, y, w, h });
    if (w === 0 || h === 0) continue;
    bodyMinX = Math.min(bodyMinX, x);
    bodyMinY = Math.min(bodyMinY, y);
    bodyMaxX = Math.max(bodyMaxX, x + w);
    bodyMaxY = Math.max(bodyMaxY, y + h);
    totalArea += w * h;
  }
  const bodyW = bodyMaxX - bodyMinX;
  const bodyH = bodyMaxY - bodyMinY;

  // For narrow matrices (e.g. 3v1's 6 thin defender columns, or 1v1's small
  // 6x6 grid) the natural body is too thin for a readable stacked bar. Widen
  // to a comfortable minimum, area-preserving, and clamp to a minimum height
  // so very small matchups don't pancake into a thin strip.
  const MIN_BAR_W = 220;
  const MIN_BAR_H = 280;
  let barW = bodyW;
  let barH = bodyH;
  if (totalArea > 0 && bodyW < MIN_BAR_W) {
    barW = MIN_BAR_W;
    barH = Math.max(MIN_BAR_H, totalArea / barW);
  }

  const byColor = { def: [], both: [], att: [] };
  for (const cell of cells) byColor[classifyCell(cell)].push(cell);

  const colorAreas = {};
  for (const cls of REDUCE_ORDER) {
    colorAreas[cls] = byColor[cls].reduce((s, c) => {
      const r = cellRects.get(c);
      return s + r.w * r.h;
    }, 0);
  }

  const TWEEN_MS = 3000;
  const IDEAL_STAGGER_MS = 120;
  const MAX_BAND_STAGGER_MS = 2500;

  let maxBandStaggerTotal = 0;
  let segY = bodyMinY;
  const segments = [];
  for (const cls of REDUCE_ORDER) {
    const segH = totalArea > 0 ? (colorAreas[cls] / totalArea) * barH : 0;
    segments.push({ cls, y: segY, h: segH, p: totalArea > 0 ? colorAreas[cls] / totalArea : 0 });

    byColor[cls].sort((a, b) => {
      const ar = cellRects.get(a), br = cellRects.get(b);
      return br.w * br.h - ar.w * ar.h;
    });

    const N = byColor[cls].length;
    const perCellMs = N <= 1 ? 0 : Math.min(IDEAL_STAGGER_MS, MAX_BAND_STAGGER_MS / (N - 1));
    maxBandStaggerTotal = Math.max(maxBandStaggerTotal, (N - 1) * perCellMs);

    let cellY = segY;
    let i = 0;
    for (const cell of byColor[cls]) {
      const src = cellRects.get(cell);
      const cellArea = src.w * src.h;
      const tgtW = barW;
      const tgtH = colorAreas[cls] > 0 ? (cellArea / colorAreas[cls]) * segH : 0;
      const tx = bodyMinX - src.x;
      const ty = cellY - src.y;
      const sx = src.w > 0 ? tgtW / src.w : 0;
      const sy = src.h > 0 ? tgtH / src.h : 0;
      const delay = i * perCellMs;
      cell.style.transformOrigin = '0 0';
      cell.style.transition =
        `transform ${TWEEN_MS}ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms, ` +
        `border-color 1200ms ease ${delay}ms, ` +
        `color 800ms ease ${delay}ms`;
      cell.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
      cell.style.borderColor = 'transparent';
      cell.style.color = 'transparent';
      cellY += tgtH;
      i++;
    }
    segY += segH;
  }

  for (const h of headers) {
    h.style.transition = 'opacity 1200ms ease';
    h.style.opacity = '0';
  }

  const totalAnimMs = TWEEN_MS + maxBandStaggerTotal;
  const overlayDelay = Math.max(0, totalAnimMs - 700);
  overlay.style.transition = `opacity 600ms ease ${overlayDelay}ms`;

  overlay.innerHTML = '';
  overlay.style.left = bodyMinX + 'px';
  overlay.style.top = bodyMinY + 'px';
  overlay.style.width = barW + 'px';
  overlay.style.height = barH + 'px';
  for (const seg of segments) {
    if (seg.h < 8) continue;
    const label = el('div', {
      class: `odds-reduce-seg ${seg.cls}`,
      style: { top: (seg.y - bodyMinY) + 'px', height: seg.h + 'px' },
    }, [
      el('div', { class: 'odds-reduce-pct', style: { fontSize: opts.pctFontSize + 'px' } }, pct(seg.p)),
      el('div', { class: 'odds-reduce-name', style: { fontSize: opts.nameFontSize + 'px' } }, REDUCE_LABELS[seg.cls]),
    ]);
    overlay.appendChild(label);
  }
  requestAnimationFrame(() => { overlay.classList.add('shown'); });
}

export function restoreMatrix(matrix, overlay) {
  overlay.style.transition = 'opacity 250ms ease';
  overlay.classList.remove('shown');
  for (const cell of matrix.querySelectorAll('.mc-cell')) {
    cell.style.transition =
      'transform 1200ms cubic-bezier(0.4, 0, 0.2, 1), ' +
      'border-color 600ms ease, color 600ms ease';
    cell.style.transform = '';
    cell.style.borderColor = '';
    cell.style.color = '';
  }
  for (const h of matrix.querySelectorAll('.mc-corner, .mc-head, .mc-rh')) {
    h.style.transition = 'opacity 600ms ease';
    h.style.opacity = '';
  }
}
