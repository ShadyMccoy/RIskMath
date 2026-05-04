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
    el('span', {}, 'Side bars: P(survivors | win) — they sum to each side’s total win %'),
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

  let state = {
    maxAtt: 8,
    maxDef: 8,
    hover: { x: -1, y: -1 },
    mode: 'flow',
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
          render();
        },
      }),
    ]);
  }

  function bindExtraHandlers() {
    root.querySelector('#view-mode').addEventListener('change', (e) => {
      state.mode = e.target.value;
      render();
    });
  }

  function resize() {
    const { maxAtt, maxDef } = state;
    const cell = Math.min(72, Math.floor(720 / Math.max(maxAtt + 1, maxDef + 1)));
    state.cell = cell;
    state.histSize = Math.max(48, Math.round(cell * 1.4));
    canvas.width = state.histSize + (maxAtt + 1) * cell;
    canvas.height = (maxDef + 1) * cell + state.histSize;
  }

  function gridLeft() { return state.histSize; }
  function gridBottom() { return canvas.height - state.histSize; }

  function cellCenter(ax, dy) {
    // ax = attackers (column), dy = defenders (row, drawn from bottom up).
    const cx = gridLeft() + ax * state.cell + state.cell / 2;
    const cy = gridBottom() - (dy * state.cell + state.cell / 2);
    return { cx, cy };
  }

  function drawGridBg() {
    const { cell, maxAtt, maxDef } = state;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
          ctx.fillStyle = `rgba(${rgb.join(',')}, 0.55)`;
          const { cx, cy } = cellCenter(a, d);
          ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
        }
      }
    }

    const gL = gridLeft(), gB = gridBottom();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= maxAtt + 1; i++) {
      const x = gL + i * cell;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, gB);
      ctx.stroke();
    }
    for (let j = 0; j <= maxDef + 1; j++) {
      const y = gB - j * cell;
      ctx.beginPath();
      ctx.moveTo(gL, y + 0.5);
      ctx.lineTo(canvas.width, y + 0.5);
      ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = COLORS.axisLabel;
    ctx.font = '600 11px var(--mono, monospace)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let a = 1; a <= maxAtt; a++) {
      ctx.fillText(`${a}`, gL + a * cell + cell / 2, gB - 6);
    }
    for (let d = 1; d <= maxDef; d++) {
      ctx.fillText(`${d}`, gL + 8, gB - (d * cell + cell / 2));
    }

    // Heatmap text overlay
    if (state.mode === 'heatmap') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${Math.max(10, Math.floor(cell * 0.22))}px var(--mono)`;
      for (let a = 1; a <= maxAtt; a++) {
        for (let d = 1; d <= maxDef; d++) {
          const { attackerWin } = analyze(a, d);
          const { cx, cy } = cellCenter(a, d);
          ctx.fillText(`${Math.round(attackerWin * 100)}`, cx, cy);
        }
      }
    }
  }

  function drawArrow(fromX, fromY, toX, toY, thickness) {
    if (thickness < 0.4) return;
    const headLen = Math.max(6, thickness * 1.4);
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = COLORS.arrowLine;
    ctx.fillStyle = COLORS.arrowHead;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function drawFlow(startA, startD) {
    if (startA < 1 || startD < 1) return null;
    const { cell, maxAtt, maxDef } = state;
    let attWin = 0, defWin = 0;
    const queue = [{ a: startA, d: startD, p: 1 }];
    const seen = new Map();

    // BFS-ish: process cells in order of decreasing total armies.
    while (queue.length > 0) {
      queue.sort((u, v) => (v.a + v.d) - (u.a + u.d));
      const { a, d, p } = queue.shift();
      if (a < 1 || d < 1) continue;

      const { cx, cy } = cellCenter(a, d);
      const aDice = Math.min(3, a);
      const dDice = Math.min(2, d);

      // Outcomes for this matchup.
      const matchups = {
        '3v2': [{ aLost: 0, dLost: 2, prob: 2890 / 7776 },
                { aLost: 1, dLost: 1, prob: 2611 / 7776 },
                { aLost: 2, dLost: 0, prob: 2275 / 7776 }],
        '3v1': [{ aLost: 0, dLost: 1, prob: 855 / 1296 }, { aLost: 1, dLost: 0, prob: 441 / 1296 }],
        '2v2': [{ aLost: 0, dLost: 2, prob: 295 / 1296 }, { aLost: 1, dLost: 1, prob: 420 / 1296 }, { aLost: 2, dLost: 0, prob: 581 / 1296 }],
        '2v1': [{ aLost: 0, dLost: 1, prob: 125 / 216 }, { aLost: 1, dLost: 0, prob: 91 / 216 }],
        '1v2': [{ aLost: 0, dLost: 1, prob: 55 / 216 }, { aLost: 1, dLost: 0, prob: 161 / 216 }],
        '1v1': [{ aLost: 0, dLost: 1, prob: 15 / 36 }, { aLost: 1, dLost: 0, prob: 21 / 36 }],
      }[`${aDice}v${dDice}`];

      for (const { aLost, dLost, prob } of matchups) {
        const newA = a - aLost;
        const newD = d - dLost;
        const flowProb = p * prob;
        const { cx: tx, cy: ty } = cellCenter(newA, newD);
        const thickness = Math.max(0.2, flowProb * cell * 1.4);
        drawArrow(cx, cy, tx, ty, thickness);

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

    return { attWin, defWin };
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

  function drawHistograms(a, d) {
    if (a < 1 || d < 1 || a > state.maxAtt || d > state.maxDef) return;
    const {
      attRemainingDist, defRemainingDist,
      attackerWin, defenderWin,
      expectedAttRemaining, expectedDefRemaining,
    } = analyze(a, d);
    const { cell, maxAtt, maxDef, histSize } = state;
    const gL = gridLeft(), gB = gridBottom();

    // Common scale so attacker/defender bars are visually comparable.
    let maxP = 0;
    for (let aa = 1; aa <= maxAtt; aa++) {
      maxP = Math.max(maxP, attRemainingDist[aa] || 0);
    }
    for (let dd = 1; dd <= maxDef; dd++) {
      maxP = Math.max(maxP, defRemainingDist[dd] || 0);
    }
    if (maxP <= 0) return;

    const padding = 6;
    const barArea = histSize - padding * 2;

    // Bottom histogram: attacker survivors when attacker wins.
    const att = COLORS.attHeat;
    ctx.fillStyle = `rgba(${att.join(',')}, 0.7)`;
    ctx.strokeStyle = `rgba(${att.join(',')}, 1)`;
    ctx.lineWidth = 1;
    for (let aa = 1; aa <= maxAtt; aa++) {
      const p = attRemainingDist[aa] || 0;
      if (p <= 0) continue;
      const h = (p / maxP) * barArea;
      const x = gL + aa * cell + 2;
      const w = cell - 4;
      const y = gB + padding;
      ctx.fillRect(x, y, w, h);
      // Highlight the bar for the hovered attacker count line.
      if (aa === a) {
        ctx.strokeStyle = `rgba(${att.join(',')}, 1)`;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }

    // Left histogram: defender survivors when defender wins.
    const def = COLORS.defHeat;
    ctx.fillStyle = `rgba(${def.join(',')}, 0.7)`;
    ctx.strokeStyle = `rgba(${def.join(',')}, 1)`;
    for (let dd = 1; dd <= maxDef; dd++) {
      const p = defRemainingDist[dd] || 0;
      if (p <= 0) continue;
      const w = (p / maxP) * barArea;
      const y = gB - (dd + 1) * cell + 2;
      const h = cell - 4;
      const x = gL - padding - w;
      ctx.fillRect(x, y, w, h);
      if (dd === d) {
        ctx.strokeStyle = `rgba(${def.join(',')}, 1)`;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }

    // Inline percentage labels on each visible bar (when there's room).
    ctx.font = `600 ${Math.max(9, Math.floor(cell * 0.18))}px var(--mono, monospace)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgba(${att.join(',')}, 1)`;
    for (let aa = 1; aa <= maxAtt; aa++) {
      const p = attRemainingDist[aa] || 0;
      if (p < 0.01) continue;
      const h = (p / maxP) * barArea;
      const cx = gL + aa * cell + cell / 2;
      ctx.fillText(`${Math.round(p * 100)}`, cx, gB + padding + h - 2);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${def.join(',')}, 1)`;
    for (let dd = 1; dd <= maxDef; dd++) {
      const p = defRemainingDist[dd] || 0;
      if (p < 0.01) continue;
      const w = (p / maxP) * barArea;
      const cy = gB - dd * cell - cell / 2;
      ctx.fillText(`${Math.round(p * 100)}`, gL - padding - 2, cy);
    }

    // Expected-survivors markers (visualize "strength of victory" beyond win/loss).
    if (attackerWin > 0 && expectedAttRemaining >= 1) {
      const mx = gL + cell + (expectedAttRemaining - 0.5) * cell;
      ctx.strokeStyle = `rgba(${att.join(',')}, 0.95)`;
      ctx.fillStyle = `rgba(${att.join(',')}, 0.95)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, gB + padding);
      ctx.lineTo(mx, gB + padding + barArea);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(mx - 4, gB + padding + barArea);
      ctx.lineTo(mx + 4, gB + padding + barArea);
      ctx.lineTo(mx, gB + padding + barArea - 5);
      ctx.closePath();
      ctx.fill();
    }
    if (defenderWin > 0 && expectedDefRemaining >= 1) {
      const my = gB - cell - (expectedDefRemaining - 0.5) * cell;
      ctx.strokeStyle = `rgba(${def.join(',')}, 0.95)`;
      ctx.fillStyle = `rgba(${def.join(',')}, 0.95)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(gL - padding - barArea, my);
      ctx.lineTo(gL - padding, my);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(gL - padding - barArea, my - 4);
      ctx.lineTo(gL - padding - barArea, my + 4);
      ctx.lineTo(gL - padding - barArea + 5, my);
      ctx.closePath();
      ctx.fill();
    }

    // Side-bar axis titles.
    ctx.fillStyle = 'rgba(230,237,243,0.55)';
    ctx.font = '500 10px var(--mono, monospace)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('P(attacker survivors | att wins) %', gL + cell + maxAtt * cell / 2, gB + histSize - 12);

    ctx.save();
    ctx.translate(10, gB - cell - maxDef * cell / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('P(defender survivors | def wins) %', 0, 0);
    ctx.restore();
  }

  function render() {
    drawGridBg();
    const { x: a, y: d } = state.hover;
    let result = null;
    if (a >= 1 && d >= 1 && a <= state.maxAtt && d <= state.maxDef) {
      highlightCell(a, d);
      result = drawFlow(a, d);
      drawHistograms(a, d);
    }
    updateStats(a, d, result);
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
    const a = Math.floor((px - gridLeft()) / state.cell);
    const d = Math.floor((gridBottom() - py) / state.cell);
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
