// Modernized Battle Grid: hover any (attackers, defenders) cell to see the
// BFS probability flow — same idea as the original, but cleaner, with tooltips,
// configurable size, and the X/Y label bug fixed.

import { analyze } from '../probability.js';
import { el, pct } from '../util.js';

const COLORS = {
  bg: '#161b22',
  grid: '#2a323d',
  axis: '#6e7681',
  axisLabel: '#d4a72c',
  arrowLine: '#d4a72c',
  arrowHead: '#f1c232',
  cellHover: 'rgba(212,167,44,0.18)',
  attHeat: [240, 101, 96],   // red
  defHeat: [91, 157, 255],   // blue
  tile: '#1f2630',
};

export function mount(root) {
  root.innerHTML = '';

  const controls = el('div', { class: 'controls-row' }, [
    field('Max attackers', 'maxAtt', 8, 1, 30),
    field('Max defenders', 'maxDef', 8, 1, 30),
    el('div', { class: 'field', style: { flex: '0 0 auto' } }, [
      el('label', {}, 'View'),
      (() => {
        const sel = el('select', { id: 'view-mode', style: {
          background: '#1f2630', border: '1px solid #30363d', color: '#e6edf3',
          padding: '10px 12px', borderRadius: '6px', fontFamily: 'var(--mono)',
          fontSize: '14px', outline: 'none',
        }}, []);
        for (const [v, l] of [['flow', 'Flow arrows'], ['heatmap', 'Win-prob heatmap']]) {
          sel.appendChild(el('option', { value: v }, l));
        }
        return sel;
      })(),
    ]),
  ]);

  const wrap = el('div', { id: 'grid-canvas-wrap' }, [
    el('canvas', { id: 'grid-canvas', width: 720, height: 720 }),
    el('div', { id: 'grid-tooltip' }),
  ]);

  const stats = el('div', { class: 'stat-grid', id: 'grid-stats' });

  const legend = el('div', { class: 'legend' }, [
    el('span', {}, [el('span', { class: 'swatch', style: { background: '#f06560' }}), 'Attacker wins']),
    el('span', {}, [el('span', { class: 'swatch', style: { background: '#5b9dff' }}), 'Defender wins']),
    el('span', {}, [el('span', { class: 'swatch', style: { background: '#d4a72c' }}), 'Probability flow']),
    el('span', { style: { marginLeft: 'auto', color: 'var(--text-muted)' }},
      'X = attacking force · Y = defenders · garrison not counted'),
  ]);

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Battle Grid'),
      el('p', { class: 'desc' },
        'Hover any cell to see the probability flow when an attacker with X armies engages a defender with Y. ' +
        'Arrow thickness = probability mass moving along that path.'),
      controls,
      wrap,
      stats,
      legend,
    ])
  );

  const canvas = root.querySelector('#grid-canvas');
  const tooltip = root.querySelector('#grid-tooltip');
  const ctx = canvas.getContext('2d');
  const bgCanvas = document.createElement('canvas');
  const bgCtx = bgCanvas.getContext('2d');

  let state = {
    maxAtt: 8,
    maxDef: 8,
    hover: { x: -1, y: -1 },
    mode: 'flow',
    bgDirty: true,
    flow: null,         // { arrows, attWin, defWin } cached per hover
    animId: null,
  };

  function field(label, id, val, min, max) {
    return el('div', { class: 'field' }, [
      el('label', {}, label),
      el('input', {
        type: 'number', id, value: val, min, max, step: 1,
        oninput: (e) => {
          const v = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min));
          state[id] = v;
          resize();
          state.bgDirty = true;
          render();
        },
      }),
    ]);
  }

  function bindExtraHandlers() {
    root.querySelector('#view-mode').addEventListener('change', (e) => {
      state.mode = e.target.value;
      state.bgDirty = true;
      render();
    });
  }

  function resize() {
    const { maxAtt, maxDef } = state;
    const cell = Math.min(72, Math.floor(720 / Math.max(maxAtt + 1, maxDef + 1)));
    canvas.width = (maxAtt + 1) * cell;
    canvas.height = (maxDef + 1) * cell;
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    state.cell = cell;
    state.bgDirty = true;
  }

  function cellCenter(ax, dy) {
    // ax = attackers (column), dy = defenders (row, drawn from bottom up).
    const cx = ax * state.cell + state.cell / 2;
    const cy = canvas.height - (dy * state.cell + state.cell / 2);
    return { cx, cy };
  }

  function drawGridBg() {
    const { cell, maxAtt, maxDef } = state;
    const c = bgCtx;
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    if (state.mode === 'heatmap') {
      for (let a = 1; a <= maxAtt; a++) {
        for (let d = 1; d <= maxDef; d++) {
          const { attackerWin } = analyze(a, d);
          const r = COLORS.attHeat, b = COLORS.defHeat;
          const mix = attackerWin;
          const rgb = [
            r[0] * mix + b[0] * (1 - mix),
            r[1] * mix + b[1] * (1 - mix),
            r[2] * mix + b[2] * (1 - mix),
          ].map((v) => Math.round(v));
          c.fillStyle = `rgba(${rgb.join(',')}, 0.55)`;
          const { cx, cy } = cellCenter(a, d);
          c.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
        }
      }
    }

    c.strokeStyle = COLORS.grid;
    c.lineWidth = 1;
    for (let x = 0; x <= bgCanvas.width; x += cell) {
      c.beginPath();
      c.moveTo(x + 0.5, 0);
      c.lineTo(x + 0.5, bgCanvas.height);
      c.stroke();
    }
    for (let y = 0; y <= bgCanvas.height; y += cell) {
      c.beginPath();
      c.moveTo(0, y + 0.5);
      c.lineTo(bgCanvas.width, y + 0.5);
      c.stroke();
    }

    // Axis labels
    c.fillStyle = COLORS.axisLabel;
    c.font = '600 11px var(--mono, monospace)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let a = 1; a <= maxAtt; a++) {
      c.fillText(`${a}`, a * cell + cell / 2, bgCanvas.height - 6);
    }
    for (let d = 1; d <= maxDef; d++) {
      c.fillText(`${d}`, 8, bgCanvas.height - (d * cell + cell / 2));
    }

    // Heatmap text overlay
    if (state.mode === 'heatmap') {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = `600 ${Math.max(10, Math.floor(cell * 0.22))}px var(--mono)`;
      for (let a = 1; a <= maxAtt; a++) {
        for (let d = 1; d <= maxDef; d++) {
          const { attackerWin } = analyze(a, d);
          const { cx, cy } = cellCenter(a, d);
          c.fillText(`${Math.round(attackerWin * 100)}`, cx, cy);
        }
      }
    }
  }

  function drawArrow(arrow) {
    const { fromX, fromY, toX, toY, thickness, prob } = arrow;
    if (thickness < 0.4) return;
    const { cell } = state;
    const headLen = Math.max(7, Math.min(cell * 0.35, thickness * 1.6));
    const angle = Math.atan2(toY - fromY, toX - fromX);
    // Probability-weighted opacity so weak flows recede and strong flows pop.
    const alpha = 0.32 + Math.min(0.55, prob * 1.4);
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(241,194,50,0.55)';
    ctx.shadowBlur = Math.min(14, thickness * 1.8);
    ctx.strokeStyle = `rgba(241,194,50,${alpha})`;
    ctx.fillStyle = `rgba(255,215,90,${Math.min(0.95, alpha + 0.12)})`;

    // Stop the line a bit before the tip so the head sits cleanly on top.
    const stopX = toX - headLen * 0.55 * Math.cos(angle);
    const stopY = toY - headLen * 0.55 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(stopX, stopY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawPulse(arrow, t) {
    const { fromX, fromY, toX, toY, thickness, prob, seed } = arrow;
    if (thickness < 0.4) return;
    const period = 1600; // ms per traversal
    const phase = (((t + seed) % period) + period) % period / period;
    // ease so the dot accelerates slightly into the target
    const eased = phase * phase * (3 - 2 * phase);
    const px = fromX + (toX - fromX) * eased;
    const py = fromY + (toY - fromY) * eased;
    // Sin envelope so each pulse fades in, peaks mid-flight, fades out.
    const env = Math.sin(phase * Math.PI);
    const r = Math.max(1.6, Math.min(state.cell * 0.13, thickness * 0.55 + 1.2));
    const a = (0.55 + Math.min(0.4, prob * 1.5)) * env;
    ctx.shadowColor = 'rgba(255,228,140,0.95)';
    ctx.shadowBlur = 16 * env;
    ctx.fillStyle = `rgba(255,243,200,${a})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function computeFlow(startA, startD) {
    if (startA < 1 || startD < 1) return null;
    const { cell } = state;
    const arrows = [];
    let attWin = 0, defWin = 0;
    const queue = [{ a: startA, d: startD, p: 1 }];
    const seen = new Map();

    while (queue.length > 0) {
      queue.sort((u, v) => (v.a + v.d) - (u.a + u.d));
      const { a, d, p } = queue.shift();
      if (a < 1 || d < 1) continue;

      const { cx, cy } = cellCenter(a, d);
      const matchups = {
        '3v2': [{ aLost: 0, dLost: 2, prob: 2890 / 7776 },
                { aLost: 1, dLost: 1, prob: 2611 / 7776 },
                { aLost: 2, dLost: 0, prob: 2275 / 7776 }],
        '3v1': [{ aLost: 0, dLost: 1, prob: 855 / 1296 }, { aLost: 1, dLost: 0, prob: 441 / 1296 }],
        '2v2': [{ aLost: 0, dLost: 2, prob: 295 / 1296 }, { aLost: 1, dLost: 1, prob: 420 / 1296 }, { aLost: 2, dLost: 0, prob: 581 / 1296 }],
        '2v1': [{ aLost: 0, dLost: 1, prob: 125 / 216 }, { aLost: 1, dLost: 0, prob: 91 / 216 }],
        '1v2': [{ aLost: 0, dLost: 1, prob: 55 / 216 }, { aLost: 1, dLost: 0, prob: 161 / 216 }],
        '1v1': [{ aLost: 0, dLost: 1, prob: 15 / 36 }, { aLost: 1, dLost: 0, prob: 21 / 36 }],
      }[`${Math.min(3, a)}v${Math.min(2, d)}`];

      for (const { aLost, dLost, prob } of matchups) {
        const newA = a - aLost;
        const newD = d - dLost;
        const flowProb = p * prob;
        const { cx: tx, cy: ty } = cellCenter(newA, newD);
        const thickness = Math.max(0.2, flowProb * cell * 1.4);
        arrows.push({
          fromX: cx, fromY: cy, toX: tx, toY: ty,
          thickness, prob: flowProb,
          seed: Math.random() * 1600,
        });

        if (newD === 0) attWin += flowProb;
        if (newA === 0) defWin += flowProb;
        if (newA >= 1 && newD >= 1) {
          const key = `${newA},${newD}`;
          if (seen.has(key)) {
            const existing = queue.find((q) => q.a === newA && q.d === newD);
            if (existing) existing.p += flowProb;
            else queue.push({ a: newA, d: newD, p: flowProb });
          } else {
            queue.push({ a: newA, d: newD, p: flowProb });
            seen.set(key, true);
          }
        }
      }
    }

    // Draw thinner arrows first so dominant flows sit on top.
    arrows.sort((u, v) => u.thickness - v.thickness);
    return { arrows, attWin, defWin };
  }

  function highlightCell(a, d) {
    if (a < 1 || d < 1) return;
    const { cx, cy } = cellCenter(a, d);
    const { cell } = state;
    ctx.fillStyle = COLORS.cellHover;
    ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
    ctx.strokeStyle = COLORS.arrowLine;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - cell / 2 + 1, cy - cell / 2 + 1, cell - 2, cell - 2);
  }

  function drawFrame(t) {
    if (state.bgDirty) {
      drawGridBg();
      state.bgDirty = false;
    }
    ctx.drawImage(bgCanvas, 0, 0);
    const { x: a, y: d } = state.hover;
    const valid = a >= 1 && d >= 1 && a <= state.maxAtt && d <= state.maxDef;
    if (valid) {
      highlightCell(a, d);
      if (state.flow) {
        for (const arrow of state.flow.arrows) drawArrow(arrow);
        for (const arrow of state.flow.arrows) drawPulse(arrow, t);
      }
    }
  }

  function ensureAnimating() {
    if (state.animId != null) return;
    const loop = (t) => {
      drawFrame(t);
      state.animId = requestAnimationFrame(loop);
    };
    state.animId = requestAnimationFrame(loop);
  }

  function render() {
    const { x: a, y: d } = state.hover;
    const valid = a >= 1 && d >= 1 && a <= state.maxAtt && d <= state.maxDef;
    state.flow = valid ? computeFlow(a, d) : null;
    updateStats(a, d, state.flow);
    ensureAnimating();
  }

  function updateStats(a, d, flow) {
    stats.innerHTML = '';
    const valid = a >= 1 && d >= 1 && a <= state.maxAtt && d <= state.maxDef;
    const exact = valid ? analyze(a, d) : null;
    stats.append(
      stat('Cell', valid ? `${a} vs ${d}` : '—', 'gold'),
      stat('Attacker win', valid ? pct(exact.attackerWin) : '—', 'attacker'),
      stat('Defender win', valid ? pct(exact.defenderWin) : '—', 'defender'),
      stat('Avg attacker survivors',
        valid && exact.attackerWin > 0 ? exact.expectedAttRemaining.toFixed(2) : '—', 'attacker'),
      stat('Avg defender survivors',
        valid && exact.defenderWin > 0 ? exact.expectedDefRemaining.toFixed(2) : '—', 'defender'),
    );
  }

  function stat(label, value, kind) {
    return el('div', { class: `stat ${kind || ''}` }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value),
    ]);
  }

  function fromMouse(ev) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;
    const a = Math.floor(px / state.cell);
    const d = state.maxDef + 1 - Math.ceil(py / state.cell);
    return { a, d, px: ev.clientX - rect.left, py: ev.clientY - rect.top };
  }

  function showTooltip(a, d, x, y) {
    if (a < 1 || d < 1 || a > state.maxAtt || d > state.maxDef) {
      tooltip.style.opacity = '0';
      return;
    }
    const { attackerWin, defenderWin } = analyze(a, d);
    tooltip.innerHTML = `
      <div style="color:var(--gold-bright);font-weight:600;margin-bottom:2px">${a} vs ${d}</div>
      <div style="color:var(--att)">ATT: ${pct(attackerWin)}</div>
      <div style="color:var(--def)">DEF: ${pct(defenderWin)}</div>`;
    tooltip.style.left = `${x + 18}px`;
    tooltip.style.top = `${y + 8}px`;
    tooltip.style.opacity = '1';
  }

  canvas.addEventListener('mousemove', (e) => {
    const { a, d, px, py } = fromMouse(e);
    if (a !== state.hover.x || d !== state.hover.y) {
      state.hover = { x: a, y: d };
      render();
    }
    showTooltip(a, d, px, py);
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
  });

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    const { a, d, px, py } = fromMouse(t);
    state.hover = { x: a, y: d };
    render();
    showTooltip(a, d, px, py);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    const { a, d, px, py } = fromMouse(t);
    if (a !== state.hover.x || d !== state.hover.y) {
      state.hover = { x: a, y: d };
      render();
    }
    showTooltip(a, d, px, py);
    e.preventDefault();
  }, { passive: false });

  bindExtraHandlers();
  resize();
  state.hover = { x: 5, y: 4 };
  render();
}
