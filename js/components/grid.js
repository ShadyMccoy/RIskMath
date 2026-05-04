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
        for (const [v, l] of [
          ['flow', 'Flow arrows'],
          ['downstream', 'Downstream heatmap'],
          ['flow+downstream', 'Arrows + heatmap'],
          ['heatmap', 'Win-prob heatmap'],
        ]) {
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
    el('span', {}, [el('span', { class: 'swatch', style: { background: '#d4a72c' }}), 'Probability flow / downstream visit']),
    el('span', {}, 'Edge bars: P(end with N survivors) — bar size = win probability at each survivor count'),
    el('span', { style: { marginLeft: 'auto', color: 'var(--text-muted)' }},
      'X = attacking force · Y = defenders · garrison not counted'),
  ]);

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Battle Grid'),
      el('p', { class: 'desc' },
        'Hover any cell to see the probability flow when an attacker with X armies engages a defender with Y. ' +
        'Bars on the bottom and left edges show the probability of ending with each survivor count (the “0 army left” terminal squares).'),
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
    state.cell = cell;
    state.histSize = Math.max(80, Math.round(cell * 2.2));
    state.labelMargin = 18; // dedicated space for 0%/max% tick labels
    canvas.width = state.histSize + (maxAtt + 1) * cell + state.labelMargin;
    canvas.height = (maxDef + 1) * cell + state.histSize + state.labelMargin;
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    state.bgDirty = true;
  }

  function gridLeft() { return state.histSize; }
  function gridBottom() { return canvas.height - state.histSize - state.labelMargin; }

  function cellCenter(ax, dy) {
    // ax = attackers (column), dy = defenders (row, drawn from bottom up).
    const cx = gridLeft() + ax * state.cell + state.cell / 2;
    const cy = gridBottom() - (dy * state.cell + state.cell / 2);
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

    const gL = gridLeft(), gB = gridBottom();
    c.strokeStyle = COLORS.grid;
    c.lineWidth = 1;
    for (let i = 0; i <= maxAtt + 1; i++) {
      const x = gL + i * cell;
      c.beginPath();
      c.moveTo(x + 0.5, 0);
      c.lineTo(x + 0.5, gB);
      c.stroke();
    }
    for (let j = 0; j <= maxDef + 1; j++) {
      const y = gB - j * cell;
      c.beginPath();
      c.moveTo(gL, y + 0.5);
      c.lineTo(bgCanvas.width, y + 0.5);
      c.stroke();
    }

    // Axis labels
    c.fillStyle = COLORS.axisLabel;
    c.font = '600 11px var(--mono, monospace)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let a = 1; a <= maxAtt; a++) {
      c.fillText(`${a}`, gL + a * cell + cell / 2, gB - 6);
    }
    for (let d = 1; d <= maxDef; d++) {
      c.fillText(`${d}`, gL + 8, gB - (d * cell + cell / 2));
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
    const { fromX, fromY, toX, toY, prob } = arrow;
    if (prob < 0.0005) return;
    const { cell } = state;
    // Uniform arrow geometry — probability is encoded by the terminal bars,
    // not by line weight.
    const lineWidth = Math.max(1, Math.min(2, cell * 0.045));
    const headLen = Math.max(6, cell * 0.22);
    const angle = Math.atan2(toY - fromY, toX - fromX);
    // Weak flows still fade so the eye can follow dominant paths.
    const alpha = 0.35 + Math.min(0.5, prob * 1.2);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(241,194,50,0.45)';
    ctx.shadowBlur = 6;
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
    const { fromX, fromY, toX, toY, prob, seed } = arrow;
    if (prob < 0.0005) return;
    const period = 1600; // ms per traversal
    const phase = (((t + seed) % period) + period) % period / period;
    // ease so the dot accelerates slightly into the target
    const eased = phase * phase * (3 - 2 * phase);
    const px = fromX + (toX - fromX) * eased;
    const py = fromY + (toY - fromY) * eased;
    // Sin envelope so each pulse fades in, peaks mid-flight, fades out.
    const env = Math.sin(phase * Math.PI);
    const r = Math.max(1.6, Math.min(state.cell * 0.13, prob * state.cell * 0.7 + 1.4));
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
    const cellProb = new Map();

    while (queue.length > 0) {
      queue.sort((u, v) => (v.a + v.d) - (u.a + u.d));
      const { a, d, p } = queue.shift();
      if (a < 1 || d < 1) continue;
      cellProb.set(`${a},${d}`, p);

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
        arrows.push({
          fromX: cx, fromY: cy, toX: tx, toY: ty,
          prob: flowProb,
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

    // Draw lower-probability arrows first so dominant flows sit on top.
    arrows.sort((u, v) => u.prob - v.prob);
    return { arrows, attWin, defWin, cellProb };
  }

  function drawDownstreamHeatmap(flow) {
    if (!flow || !flow.cellProb) return;
    const { cell, maxAtt, maxDef } = state;
    let maxP = 0;
    for (const [key, p] of flow.cellProb) {
      if (p >= 1) continue; // start cell
      if (p > maxP) maxP = p;
    }
    if (maxP <= 0) return;

    for (const [key, p] of flow.cellProb) {
      if (p >= 1) continue;
      const [a, d] = key.split(',').map(Number);
      if (a < 1 || d < 1 || a > maxAtt || d > maxDef) continue;
      // sqrt so weak-but-nonzero flows still register visually
      const intensity = Math.sqrt(p / maxP);
      const alpha = Math.min(0.82, intensity * 0.82);
      const { cx, cy } = cellCenter(a, d);
      ctx.fillStyle = `rgba(241,194,50,${alpha})`;
      ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
    }

    // Inline percentage labels where there is room and meaningful weight.
    if (cell >= 26) {
      ctx.font = `600 ${Math.max(9, Math.floor(cell * 0.2))}px var(--mono, monospace)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [key, p] of flow.cellProb) {
        if (p >= 1 || p < 0.005) continue;
        const [a, d] = key.split(',').map(Number);
        if (a < 1 || d < 1 || a > maxAtt || d > maxDef) continue;
        const { cx, cy } = cellCenter(a, d);
        const intensity = Math.sqrt(p / maxP);
        // Dark text on bright cells, light text on dim cells, so labels stay readable.
        ctx.fillStyle = intensity > 0.45 ? 'rgba(20,18,8,0.92)' : 'rgba(255,235,160,0.85)';
        const label = p >= 0.1 ? `${Math.round(p * 100)}` : `${(p * 100).toFixed(1)}`;
        ctx.fillText(label, cx, cy);
      }
    }
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

    const padding = 4;
    const barArea = histSize - padding * 2;
    const maxPct = Math.round(maxP * 100);

    // ----- Axis baselines + 0% / max% gridlines -----
    ctx.strokeStyle = 'rgba(230,237,243,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    // Bottom: 0% line (touching grid) and max% line at the deepest point.
    ctx.beginPath();
    ctx.moveTo(gL + cell, gB + padding + 0.5);
    ctx.lineTo(gL + (maxAtt + 1) * cell, gB + padding + 0.5);
    ctx.moveTo(gL + cell, gB + padding + barArea + 0.5);
    ctx.lineTo(gL + (maxAtt + 1) * cell, gB + padding + barArea + 0.5);
    // Left: 0% line (touching grid) and max% line at the leftmost extent.
    ctx.moveTo(gL - padding + 0.5, gB - cell);
    ctx.lineTo(gL - padding + 0.5, gB - (maxDef + 1) * cell);
    ctx.moveTo(gL - padding - barArea + 0.5, gB - cell);
    ctx.lineTo(gL - padding - barArea + 0.5, gB - (maxDef + 1) * cell);
    ctx.stroke();

    ctx.font = '500 10px var(--mono, monospace)';
    ctx.fillStyle = 'rgba(230,237,243,0.7)';
    // Tick labels live in the dedicated label margins so they never overlap
    // the grid cells.
    // Bottom-axis ticks (0% near grid, max% deepest): right margin.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('0%', gL + (maxAtt + 1) * cell + 4, gB + padding);
    ctx.fillText(`${maxPct}%`, gL + (maxAtt + 1) * cell + 4, gB + padding + barArea);
    // Left-axis ticks (0% near grid, max% leftmost): bottom margin.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('0%', gL - padding, gB + histSize + 2);
    ctx.fillText(`${maxPct}%`, gL - padding - barArea, gB + histSize + 2);

    // ----- Bottom bar chart: P(attacker survives with `aa` armies) -----
    // Each bar sits in the column directly below its (aa, 0) terminal cell;
    // height encodes absolute probability of ending in that state.
    const att = COLORS.attHeat;
    const attBars = [];
    for (let aa = 1; aa <= maxAtt; aa++) {
      const p = attRemainingDist[aa] || 0;
      const h = (p / maxP) * barArea;
      const x = gL + aa * cell;
      attBars.push({ x, w: cell, h, p, aa });
    }

    // Filled bars (full cell width, no gaps — reads as a true bar chart).
    for (const b of attBars) {
      if (b.h <= 0) continue;
      ctx.fillStyle = `rgba(${att.join(',')}, ${b.aa === a ? 0.92 : 0.72})`;
      ctx.fillRect(b.x, gB + padding, b.w, b.h);
    }
    // Area outline connecting bar tops to read as a continuous distribution.
    ctx.strokeStyle = `rgba(${att.join(',')}, 1)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gL + cell, gB + padding);
    for (const b of attBars) {
      ctx.lineTo(b.x, gB + padding + b.h);
      ctx.lineTo(b.x + b.w, gB + padding + b.h);
    }
    ctx.lineTo(gL + (maxAtt + 1) * cell, gB + padding);
    ctx.stroke();

    // ----- Left bar chart: P(defender survives with `dd` armies) -----
    const def = COLORS.defHeat;
    const defBars = [];
    for (let dd = 1; dd <= maxDef; dd++) {
      const p = defRemainingDist[dd] || 0;
      const w = (p / maxP) * barArea;
      const y = gB - (dd + 1) * cell;
      defBars.push({ y, h: cell, w, p, dd });
    }

    for (const b of defBars) {
      if (b.w <= 0) continue;
      ctx.fillStyle = `rgba(${def.join(',')}, ${b.dd === d ? 0.92 : 0.72})`;
      ctx.fillRect(gL - padding - b.w, b.y, b.w, b.h);
    }
    ctx.strokeStyle = `rgba(${def.join(',')}, 1)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gL - padding, gB - cell);
    for (const b of defBars) {
      ctx.lineTo(gL - padding - b.w, b.y + b.h);
      ctx.lineTo(gL - padding - b.w, b.y);
    }
    ctx.lineTo(gL - padding, gB - (maxDef + 1) * cell);
    ctx.stroke();

    // Inline percentage labels on each visible bar.
    ctx.font = `600 ${Math.max(9, Math.floor(cell * 0.2))}px var(--mono, monospace)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgba(${att.join(',')}, 1)`;
    for (const b of attBars) {
      if (b.p < 0.01) continue;
      ctx.fillText(`${Math.round(b.p * 100)}`, b.x + b.w / 2, gB + padding + b.h - 2);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${def.join(',')}, 1)`;
    for (const b of defBars) {
      if (b.p < 0.01) continue;
      ctx.fillText(`${Math.round(b.p * 100)}`, gL - padding - 2, b.y + b.h / 2);
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
      const showHeat = state.mode === 'downstream' || state.mode === 'flow+downstream';
      const showFlow = state.mode === 'flow' || state.mode === 'flow+downstream';
      if (state.flow && showHeat) {
        drawDownstreamHeatmap(state.flow);
      }
      if (state.flow && showFlow) {
        for (const arrow of state.flow.arrows) drawArrow(arrow);
        for (const arrow of state.flow.arrows) drawPulse(arrow, t);
      }
      drawHistograms(a, d);
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
