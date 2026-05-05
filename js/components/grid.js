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

  const controls = el('div', { class: 'controls-row grid-controls' }, [
    field('Max attackers', 'maxAtt', 15, 1, 30),
    field('Max defenders', 'maxDef', 15, 1, 30),
    el('div', { class: 'field', style: { flex: '0 0 auto' } }, [
      el('label', {}, 'View'),
      (() => {
        const sel = el('select', { id: 'view-mode', style: {
          background: '#1f2630', border: '1px solid #30363d', color: '#e6edf3',
          padding: '10px 12px', borderRadius: '6px', fontFamily: 'var(--mono)',
          fontSize: '14px', outline: 'none', width: '100%',
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

  const attHistCanvas = el('canvas', { id: 'grid-att-hist', width: 360, height: 140 });
  const defHistCanvas = el('canvas', { id: 'grid-def-hist', width: 360, height: 140 });
  const sideHists = el('div', { class: 'grid-side-hists' }, [
    el('div', { class: 'side-hist' }, [
      el('div', { class: 'side-hist-label att' }, 'P(attacker survivors | att wins)'),
      attHistCanvas,
    ]),
    el('div', { class: 'side-hist' }, [
      el('div', { class: 'side-hist-label def' }, 'P(defender survivors | def wins)'),
      defHistCanvas,
    ]),
  ]);
  const sidebar = el('div', { class: 'grid-sidebar' }, [controls, sideHists]);

  const stats = el('div', { class: 'stat-grid', id: 'grid-stats' });

  const legend = el('div', { class: 'legend' }, [
    el('span', {}, [el('span', { class: 'swatch', style: { background: '#f06560' }}), 'Attacker wins']),
    el('span', {}, [el('span', { class: 'swatch', style: { background: '#5b9dff' }}), 'Defender wins']),
    el('span', {}, [el('span', { class: 'swatch', style: { background: '#d4a72c' }}), 'Probability flow / downstream visit']),
    el('span', {}, 'Side histograms: P(end with N survivors) given the hovered matchup'),
    el('span', { style: { marginLeft: 'auto', color: 'var(--text-muted)' }},
      'X = attacking force · Y = defenders · garrison not counted'),
  ]);

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Battle Grid'),
      el('p', { class: 'desc' },
        'Hover any cell to see the probability flow when an attacker with X armies engages a defender with Y. ' +
        'The side histograms show the probability of ending with each survivor count (the “0 army left” terminal squares).'),
      el('div', { class: 'grid-layout' }, [sidebar, wrap]),
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
    maxAtt: 15,
    maxDef: 15,
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
    canvas.width = (maxAtt + 1) * cell;
    canvas.height = (maxDef + 1) * cell;
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    state.bgDirty = true;
  }

  function gridLeft() { return 0; }
  function gridBottom() { return canvas.height; }

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

  function arrowGeom(arrow) {
    const { fromX, fromY, toX, toY, prob } = arrow;
    const { cell } = state;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    // Pull each tip back to the entry side of the destination cell so the
    // 2-3 arrows converging on a cell don't pile their heads at one point.
    const tipBack = cell * 0.4;
    const tipX = toX - tipBack * Math.cos(angle);
    const tipY = toY - tipBack * Math.sin(angle);
    // Probability-encoded thickness; sqrt keeps weak flows visible while
    // letting dominant flows clearly dominate.
    const t = Math.sqrt(Math.min(1, prob));
    const lineWidth = Math.max(0.7, Math.min(cell * 0.18, 0.7 + t * cell * 0.16));
    const headLen = Math.max(cell * 0.14, Math.min(cell * 0.32, lineWidth * 3.0));
    return { angle, tipX, tipY, lineWidth, headLen };
  }

  function drawArrow(arrow) {
    const { fromX, fromY, prob } = arrow;
    if (prob < 0.0005) return;
    const { angle, tipX, tipY, lineWidth, headLen } = arrowGeom(arrow);
    const alpha = 0.4 + Math.min(0.5, Math.sqrt(prob) * 0.7);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(241,194,50,0.35)';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = `rgba(241,194,50,${alpha})`;
    ctx.fillStyle = `rgba(255,215,90,${Math.min(0.95, alpha + 0.15)})`;

    // Stop the line a bit before the tip so the head sits cleanly on top.
    const stopX = tipX - headLen * 0.55 * Math.cos(angle);
    const stopY = tipY - headLen * 0.55 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(stopX, stopY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawPulse(arrow, t) {
    const { fromX, fromY, prob, seed } = arrow;
    if (prob < 0.0005) return;
    const { tipX, tipY } = arrowGeom(arrow);
    const period = 2800; // ms per traversal
    const phase = (((t + seed) % period) + period) % period / period;
    // ease so the dot accelerates slightly into the target
    const eased = phase * phase * (3 - 2 * phase);
    const px = fromX + (tipX - fromX) * eased;
    const py = fromY + (tipY - fromY) * eased;
    // Sin envelope so each pulse fades in, peaks mid-flight, fades out.
    const env = Math.sin(phase * Math.PI);
    const r = Math.max(1.1, Math.min(state.cell * 0.09, prob * state.cell * 0.45 + 1.0));
    const a = (0.3 + Math.min(0.25, prob * 1.0)) * env;
    ctx.shadowColor = 'rgba(255,228,140,0.6)';
    ctx.shadowBlur = 8 * env;
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
          seed: Math.random() * 2800,
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

  function drawSurvivorHist(target, dist, max, startCount, expected, color) {
    const c = target.getContext('2d');
    const W = target.width, H = target.height;
    c.clearRect(0, 0, W, H);

    const padL = 32, padR = 10, padT = 10, padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxP = 0;
    for (let i = 1; i <= max; i++) maxP = Math.max(maxP, dist[i] || 0);

    // Axis frame
    c.strokeStyle = 'rgba(230,237,243,0.35)';
    c.lineWidth = 1;
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(padL + 0.5, padT);
    c.lineTo(padL + 0.5, padT + plotH + 0.5);
    c.lineTo(padL + plotW, padT + plotH + 0.5);
    c.stroke();

    c.font = '500 10px var(--mono, monospace)';
    c.fillStyle = 'rgba(230,237,243,0.7)';
    c.textAlign = 'right';
    c.textBaseline = 'top';
    c.fillText(maxP > 0 ? `${Math.round(maxP * 100)}%` : '0%', padL - 4, padT);
    c.textBaseline = 'bottom';
    c.fillText('0%', padL - 4, padT + plotH);

    if (maxP <= 0) {
      c.fillStyle = 'rgba(230,237,243,0.45)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '500 11px var(--mono, monospace)';
      c.fillText('—', padL + plotW / 2, padT + plotH / 2);
      return;
    }

    const barW = plotW / max;
    const bars = [];
    for (let i = 1; i <= max; i++) {
      const p = dist[i] || 0;
      const h = (p / maxP) * plotH;
      const x = padL + (i - 1) * barW;
      bars.push({ x, w: barW, h, p, i });
    }

    for (const b of bars) {
      if (b.h <= 0) continue;
      c.fillStyle = `rgba(${color.join(',')}, ${b.i === startCount ? 0.92 : 0.72})`;
      c.fillRect(b.x, padT + plotH - b.h, b.w, b.h);
    }

    // Outline trace across bar tops
    c.strokeStyle = `rgba(${color.join(',')}, 1)`;
    c.lineWidth = 1.25;
    c.beginPath();
    c.moveTo(padL, padT + plotH);
    for (const b of bars) {
      c.lineTo(b.x, padT + plotH - b.h);
      c.lineTo(b.x + b.w, padT + plotH - b.h);
    }
    c.lineTo(padL + plotW, padT + plotH);
    c.stroke();

    // X-axis tick labels
    const tickStep = max <= 10 ? 1 : (max <= 20 ? 2 : 5);
    c.fillStyle = 'rgba(230,237,243,0.55)';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let i = 1; i <= max; i++) {
      if (i !== 1 && i !== max && i % tickStep !== 0) continue;
      c.fillText(`${i}`, padL + (i - 0.5) * barW, padT + plotH + 4);
    }

    // Bar percentage labels (only where there's room and meaningful weight)
    if (barW >= 14) {
      c.font = '600 9px var(--mono, monospace)';
      c.fillStyle = `rgba(${color.join(',')}, 1)`;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      for (const b of bars) {
        if (b.p < 0.01) continue;
        c.fillText(`${Math.round(b.p * 100)}`, b.x + b.w / 2, padT + plotH - b.h - 1);
      }
    }

    // Expected-survivors marker
    if (expected != null && expected >= 1) {
      const mx = padL + (expected - 0.5) * barW;
      c.strokeStyle = `rgba(${color.join(',')}, 0.95)`;
      c.fillStyle = `rgba(${color.join(',')}, 0.95)`;
      c.lineWidth = 1.5;
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(mx, padT);
      c.lineTo(mx, padT + plotH);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(mx - 4, padT);
      c.lineTo(mx + 4, padT);
      c.lineTo(mx, padT + 5);
      c.closePath();
      c.fill();
    }
  }

  function drawHistograms(a, d) {
    const valid = a >= 1 && d >= 1 && a <= state.maxAtt && d <= state.maxDef;
    if (!valid) {
      drawSurvivorHist(attHistCanvas, {}, state.maxAtt, -1, null, COLORS.attHeat);
      drawSurvivorHist(defHistCanvas, {}, state.maxDef, -1, null, COLORS.defHeat);
      return;
    }
    const {
      attRemainingDist, defRemainingDist,
      attackerWin, defenderWin,
      expectedAttRemaining, expectedDefRemaining,
    } = analyze(a, d);
    drawSurvivorHist(
      attHistCanvas, attRemainingDist, state.maxAtt, a,
      attackerWin > 0 ? expectedAttRemaining : null, COLORS.attHeat,
    );
    drawSurvivorHist(
      defHistCanvas, defRemainingDist, state.maxDef, d,
      defenderWin > 0 ? expectedDefRemaining : null, COLORS.defHeat,
    );
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
    drawHistograms(a, d);
    ensureAnimating();
  }

  function updateStats(a, d, flow) {
    stats.innerHTML = '';
    const valid = a >= 1 && d >= 1 && a <= state.maxAtt && d <= state.maxDef;
    const exact = valid ? analyze(a, d) : null;
    stats.append(
      stat('Attackers and Defenders', valid ? `${a} vs ${d}` : '—', 'gold'),
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

    // Position relative to wrap (the tooltip's positioned ancestor), accounting
    // for the canvas's offset within it. Place to the right/below the cursor,
    // flipping to the opposite side near the wrap edges.
    const wrap = tooltip.offsetParent || tooltip.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - wrapRect.left;
    const canvasOffsetY = canvasRect.top - wrapRect.top;

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;

    const cursorX = canvasOffsetX + x;
    const cursorY = canvasOffsetY + y;
    const gap = 14;
    const margin = 4;

    let left = cursorX + gap;
    if (left + tw + margin > wrapRect.width) {
      left = cursorX - gap - tw;
    }
    left = Math.max(margin, Math.min(left, wrapRect.width - tw - margin));

    let top = cursorY + gap;
    if (top + th + margin > wrapRect.height) {
      top = cursorY - gap - th;
    }
    top = Math.max(margin, Math.min(top, wrapRect.height - th - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
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
