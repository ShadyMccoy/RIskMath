// Evolution tab: animate dp[a][d] as a heatmap that updates each round —
// the absorbing Markov chain's transition operator acting on a point mass at
// (A, D). Probability mass leaks toward the two absorbing axes (a = 0 or
// d = 0) like a discrete heat equation on a rectangle with sticky walls.

import { initialDistribution, stepDistribution } from '../probability.js';
import { el, pct } from '../util.js';

const COLORS = {
  bg: '#0d1117',
  panel: '#161b22',
  grid: '#2a323d',
  axisLabel: '#d4a72c',
  att: '#f06560',
  def: '#5b9dff',
  text: '#e6edf3',
  muted: '#6e7681',
};

// Inferno-ish ramp for log-scale interior probability.
function ramp(t) {
  t = Math.max(0, Math.min(1, t));
  const stops = [
    [0.00,   0,   0,   0],
    [0.20,  40,  11,  84],
    [0.40, 101,  21, 110],
    [0.60, 165,  44,  96],
    [0.75, 221,  81,  58],
    [0.90, 250, 159,  56],
    [1.00, 252, 255, 164],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return [
        Math.round(a[1] + (b[1] - a[1]) * u),
        Math.round(a[2] + (b[2] - a[2]) * u),
        Math.round(a[3] + (b[3] - a[3]) * u),
      ];
    }
  }
  return [255, 255, 255];
}

export function mount(root) {
  root.innerHTML = '';

  const state = {
    A: 20,
    D: 20,
    round: 0,
    dp: null,
    history: [],   // [{round, attAbs, defAbs, interior, entropy}]
    playing: false,
    speed: 4,
    lastTick: 0,
    rafId: null,
    logScale: true,
    showAbsorbed: true,
  };

  const inputs = {};

  function field(label, key, val, min, max) {
    const input = el('input', {
      type: 'number', value: val, min, max, step: 1,
      oninput: (e) => {
        const v = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min));
        state[key] = v;
        reset();
      },
    });
    inputs[key] = input;
    return el('div', { class: 'field' }, [el('label', {}, label), input]);
  }

  const playBtn = el('button', { class: 'primary',
    onclick: () => state.playing ? pause() : play() }, 'Play');
  const stepBtn = el('button', { class: 'secondary',
    onclick: () => { pause(); step(); } }, 'Step');
  const resetBtn = el('button', { class: 'secondary',
    onclick: () => { pause(); reset(); } }, 'Reset');

  const speedSel = (() => {
    const s = el('select', { id: 'evo-speed', style: {
      background: '#1f2630', border: '1px solid #30363d', color: '#e6edf3',
      padding: '10px 12px', borderRadius: '6px', fontFamily: 'var(--mono)',
      fontSize: '14px', outline: 'none',
    }});
    for (const v of [1, 2, 4, 8, 16, 32]) {
      s.appendChild(el('option', { value: v }, `${v}× / sec`));
    }
    s.value = '4';
    s.addEventListener('change', (e) => { state.speed = parseInt(e.target.value, 10); });
    return s;
  })();

  const logChk = el('input', { type: 'checkbox', checked: 'checked',
    onchange: (e) => { state.logScale = e.target.checked; render(); }});
  const absChk = el('input', { type: 'checkbox', checked: 'checked',
    onchange: (e) => { state.showAbsorbed = e.target.checked; render(); }});

  const slider = el('input', { type: 'range', min: 0, max: 200, value: 0,
    style: { width: '100%' },
    oninput: (e) => {
      pause();
      const target = parseInt(e.target.value, 10);
      seekTo(target);
    }});

  const canvas = el('canvas', { id: 'evo-canvas', width: 720, height: 540 });
  const tsCanvas = el('canvas', { id: 'evo-ts-canvas', width: 720, height: 160 });

  const stats = el('div', { class: 'stat-grid', id: 'evo-stats',
    style: { marginTop: '12px' }});

  const controls = el('div', { class: 'controls-row' }, [
    field('Attackers (A)', 'A', state.A, 1, 60),
    field('Defenders (D)', 'D', state.D, 1, 60),
    el('div', { class: 'field', style: { flex: '0 0 auto' } },
      [el('label', {}, 'Speed'), speedSel]),
    el('div', { class: 'field', style: { flex: '0 0 auto', flexDirection: 'row',
      alignItems: 'center', gap: '6px' }},
      [logChk, el('label', { style: { margin: 0 }}, 'log color')]),
    el('div', { class: 'field', style: { flex: '0 0 auto', flexDirection: 'row',
      alignItems: 'center', gap: '6px' }},
      [absChk, el('label', { style: { margin: 0 }}, 'show absorbed bands')]),
    el('div', { class: 'field', style: { flex: '0 0 auto', flexDirection: 'row',
      alignItems: 'end', gap: '8px' }}, [playBtn, stepBtn, resetBtn]),
  ]);

  root.append(el('div', { class: 'panel' }, [
    el('h2', {}, 'Distribution Evolution'),
    el('p', { class: 'desc' },
      'The probability mass at every state (a, d) — not just the terminal one — animated round by round. ' +
      'This is the absorbing Markov chain’s transition operator applied to a point mass at (A, D). ' +
      'Watch mass diffuse toward the two absorbing axes; the bottom row (d = 0) is attacker-won territory, ' +
      'the left column (a = 0) is defender-won. It’s a discrete heat equation on a rectangle with sticky walls.'),
    controls,
    el('div', { class: 'evo-canvas-wrap' }, [canvas]),
    el('div', { class: 'evo-slider-row' }, [
      el('span', { class: 'evo-slider-label', id: 'evo-round-label' }, 'Round 0'),
      slider,
    ]),
    el('div', { class: 'chart-section' }, [
      el('h3', {}, 'Probability mass over time'),
      tsCanvas,
      el('div', { class: 'legend' }, [
        el('span', {}, [el('span', { class: 'swatch', style: { background: '#f06560' }}), 'P(attacker has won by round k)']),
        el('span', {}, [el('span', { class: 'swatch', style: { background: '#5b9dff' }}), 'P(defender has won by round k)']),
        el('span', {}, [el('span', { class: 'swatch', style: { background: '#d4a72c' }}), 'P(battle still in progress)']),
      ]),
    ]),
    stats,
  ]));

  const ctx = canvas.getContext('2d');
  const tsCtx = tsCanvas.getContext('2d');
  const roundLabel = root.querySelector('#evo-round-label');

  // ---- simulation control ----

  function reset() {
    pause();
    state.round = 0;
    state.dp = initialDistribution(state.A, state.D);
    state.history = [snapshot(state.dp, 0)];
    slider.value = '0';
    slider.max = String(estimateMaxRounds(state.A, state.D));
    render();
  }

  function snapshot(dp, round) {
    let attAbs = 0, defAbs = 0, interior = 0, entropy = 0;
    for (let a = 0; a <= state.A; a++) {
      for (let d = 0; d <= state.D; d++) {
        const p = dp[a][d];
        if (p === 0) continue;
        if (d === 0 && a >= 1) attAbs += p;
        else if (a === 0 && d >= 1) defAbs += p;
        else if (a >= 1 && d >= 1) {
          interior += p;
          entropy -= p * Math.log2(p);
        }
      }
    }
    return { round, attAbs, defAbs, interior, entropy };
  }

  function step() {
    if (state.history[state.history.length - 1].interior < 1e-12) return false;
    state.dp = stepDistribution(state.dp, state.A, state.D);
    state.round += 1;
    state.history.push(snapshot(state.dp, state.round));
    if (state.round > parseInt(slider.max, 10)) slider.max = String(state.round);
    slider.value = String(state.round);
    render();
    return true;
  }

  function seekTo(target) {
    if (target === state.round) return;
    if (target < state.round) {
      // Cheaper to reset and walk forward than to invert the operator.
      state.dp = initialDistribution(state.A, state.D);
      state.round = 0;
      state.history = [snapshot(state.dp, 0)];
    }
    while (state.round < target) {
      if (!step()) break;
    }
    render();
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    playBtn.textContent = 'Pause';
    state.lastTick = performance.now();
    const tick = (now) => {
      if (!state.playing) return;
      const elapsed = (now - state.lastTick) / 1000;
      const want = elapsed * state.speed;
      if (want >= 1) {
        const stepsThisFrame = Math.min(8, Math.floor(want));
        for (let i = 0; i < stepsThisFrame; i++) {
          if (!step()) { pause(); return; }
        }
        state.lastTick = now;
      }
      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);
  }

  function pause() {
    state.playing = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
    playBtn.textContent = 'Play';
  }

  // ---- rendering ----

  function estimateMaxRounds(A, D) {
    return Math.max(40, Math.ceil((A + D) * 1.5));
  }

  function render() {
    drawHeatmap();
    drawTimeSeries();
    updateStats();
    roundLabel.textContent = `Round ${state.round}`;
  }

  function drawHeatmap() {
    const { A, D, dp, showAbsorbed, logScale } = state;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const padL = 56, padR = 16, padT = 16, padB = 40;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const cellW = innerW / (A + 1);
    const cellH = innerH / (D + 1);

    // Find max interior probability for normalization.
    let maxInterior = 0;
    for (let a = 1; a <= A; a++) {
      for (let d = 1; d <= D; d++) {
        if (dp[a][d] > maxInterior) maxInterior = dp[a][d];
      }
    }
    const norm = (p) => {
      if (p <= 0 || maxInterior <= 0) return 0;
      if (logScale) {
        const minLog = -8;
        const v = Math.log10(p / maxInterior);
        return Math.max(0, 1 + v / -minLog);
      }
      return Math.min(1, p / maxInterior);
    };

    // (a, d) cell rect. a along x (0..A) left to right; d along y (0..D)
    // top to bottom from D down to 0, so d=0 sits on the bottom row.
    function rect(a, d) {
      const x = padL + a * cellW;
      const y = padT + (D - d) * cellH;
      return { x, y, w: cellW, h: cellH };
    }

    // Interior heatmap.
    for (let a = 1; a <= A; a++) {
      for (let d = 1; d <= D; d++) {
        const t = norm(dp[a][d]);
        const [r, g, b] = ramp(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const { x, y, w, h } = rect(a, d);
        ctx.fillRect(x, y, w, h);
      }
    }

    // Absorbing bands: bottom row (d = 0, attacker wins), left column (a = 0,
    // defender wins). Color by mass with the side's accent color.
    if (showAbsorbed) {
      for (let a = 1; a <= A; a++) {
        const p = dp[a][0];
        const t = Math.min(1, Math.sqrt(p));
        const { x, y, w, h } = rect(a, 0);
        ctx.fillStyle = `rgba(240,101,96,${0.15 + 0.85 * t})`;
        ctx.fillRect(x, y, w, h);
      }
      for (let d = 1; d <= D; d++) {
        const p = dp[0][d];
        const t = Math.min(1, Math.sqrt(p));
        const { x, y, w, h } = rect(0, d);
        ctx.fillStyle = `rgba(91,157,255,${0.15 + 0.85 * t})`;
        ctx.fillRect(x, y, w, h);
      }
    }

    // Origin cell — unreachable, just darken.
    {
      const { x, y, w, h } = rect(0, 0);
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(x, y, w, h);
    }

    // Grid lines (only when cells are large enough to be useful).
    if (cellW >= 12 && cellH >= 12) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let a = 0; a <= A + 1; a++) {
        ctx.beginPath();
        ctx.moveTo(padL + a * cellW + 0.5, padT);
        ctx.lineTo(padL + a * cellW + 0.5, padT + innerH);
        ctx.stroke();
      }
      for (let d = 0; d <= D + 1; d++) {
        ctx.beginPath();
        ctx.moveTo(padL, padT + d * cellH + 0.5);
        ctx.lineTo(padL + innerW, padT + d * cellH + 0.5);
        ctx.stroke();
      }
    }

    // Axis labels.
    ctx.fillStyle = COLORS.axisLabel;
    ctx.font = '600 11px var(--mono, monospace)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = Math.max(1, Math.ceil(A / 12));
    for (let a = 0; a <= A; a += xStep) {
      ctx.fillText(`${a}`, padL + a * cellW + cellW / 2, padT + innerH + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = Math.max(1, Math.ceil(D / 12));
    for (let d = 0; d <= D; d += yStep) {
      ctx.fillText(`${d}`, padL - 8, padT + (D - d) * cellH + cellH / 2);
    }

    // Axis titles.
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 11px var(--sans, sans-serif)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('attackers remaining (a)', padL + innerW / 2, H - 8);
    ctx.save();
    ctx.translate(14, padT + innerH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('defenders remaining (d)', 0, 0);
    ctx.restore();

    // Edge labels for absorbing bands.
    if (showAbsorbed) {
      ctx.fillStyle = COLORS.att;
      ctx.font = '600 10px var(--mono, monospace)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const bottomY = padT + D * cellH + cellH / 2;
      ctx.fillText('d=0 → attacker wins', padL + 1 * cellW + 4, bottomY);
      ctx.fillStyle = COLORS.def;
      ctx.save();
      ctx.translate(padL + cellW / 2, padT + (D - 1) * cellH + cellH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left';
      ctx.fillText('a=0 → defender wins', 4, 0);
      ctx.restore();
    }
  }

  function drawTimeSeries() {
    const W = tsCanvas.width, H = tsCanvas.height;
    tsCtx.fillStyle = COLORS.bg;
    tsCtx.fillRect(0, 0, W, H);

    const padL = 36, padR = 12, padT = 8, padB = 22;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const hist = state.history;
    const maxRound = Math.max(parseInt(slider.max, 10), state.round, 1);
    const xFor = (r) => padL + (r / maxRound) * innerW;
    const yFor = (p) => padT + (1 - p) * innerH;

    // Grid.
    tsCtx.strokeStyle = 'rgba(255,255,255,0.07)';
    tsCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * innerH + 0.5;
      tsCtx.beginPath();
      tsCtx.moveTo(padL, y);
      tsCtx.lineTo(padL + innerW, y);
      tsCtx.stroke();
    }

    // Labels.
    tsCtx.fillStyle = COLORS.muted;
    tsCtx.font = '500 10px var(--mono, monospace)';
    tsCtx.textAlign = 'right';
    tsCtx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const p = 1 - i / 4;
      tsCtx.fillText(`${Math.round(p * 100)}%`, padL - 6, padT + (i / 4) * innerH);
    }
    tsCtx.textAlign = 'center';
    tsCtx.textBaseline = 'top';
    tsCtx.fillText('round', padL + innerW / 2, H - 12);
    const xLabelStep = Math.max(1, Math.ceil(maxRound / 8));
    for (let r = 0; r <= maxRound; r += xLabelStep) {
      tsCtx.fillText(`${r}`, xFor(r), H - 14);
    }

    if (hist.length < 2) return;

    // Stack-fill three regions: defender-won (bottom), in-progress, attacker-won (top).
    function fillBetween(getLow, getHigh, color) {
      tsCtx.fillStyle = color;
      tsCtx.beginPath();
      tsCtx.moveTo(xFor(hist[0].round), yFor(getLow(hist[0])));
      for (const h of hist) tsCtx.lineTo(xFor(h.round), yFor(getLow(h)));
      for (let i = hist.length - 1; i >= 0; i--) {
        tsCtx.lineTo(xFor(hist[i].round), yFor(getHigh(hist[i])));
      }
      tsCtx.closePath();
      tsCtx.fill();
    }

    // Layers (bottom to top in cumulative): defender wins, in-progress, attacker wins.
    fillBetween((h) => 0, (h) => h.defAbs, 'rgba(91,157,255,0.55)');
    fillBetween((h) => h.defAbs, (h) => h.defAbs + h.interior, 'rgba(212,167,44,0.45)');
    fillBetween((h) => h.defAbs + h.interior, (h) => 1, 'rgba(240,101,96,0.55)');

    // Outline cumulative attacker-win curve and defender-win curve.
    function strokeCurve(getY, color) {
      tsCtx.strokeStyle = color;
      tsCtx.lineWidth = 2;
      tsCtx.beginPath();
      hist.forEach((h, i) => {
        const x = xFor(h.round), y = yFor(getY(h));
        if (i === 0) tsCtx.moveTo(x, y); else tsCtx.lineTo(x, y);
      });
      tsCtx.stroke();
    }
    strokeCurve((h) => h.defAbs, COLORS.def);
    strokeCurve((h) => h.defAbs + h.interior, COLORS.att);

    // Current-round marker.
    if (state.round >= 0) {
      tsCtx.strokeStyle = COLORS.axisLabel;
      tsCtx.lineWidth = 1;
      tsCtx.setLineDash([4, 4]);
      tsCtx.beginPath();
      tsCtx.moveTo(xFor(state.round) + 0.5, padT);
      tsCtx.lineTo(xFor(state.round) + 0.5, padT + innerH);
      tsCtx.stroke();
      tsCtx.setLineDash([]);
    }
  }

  function updateStats() {
    const cur = state.history[state.history.length - 1];
    const final = lastNonChanging();
    stats.innerHTML = '';
    stats.append(
      stat('Round', `${state.round}`, 'gold'),
      stat('In progress', pct(cur.interior), 'gold'),
      stat('Attacker won (so far)', pct(cur.attAbs), 'attacker'),
      stat('Defender won (so far)', pct(cur.defAbs), 'defender'),
      stat('Final P(attacker wins)', pct(final.attAbs), 'attacker'),
      stat('Final P(defender wins)', pct(final.defAbs), 'defender'),
    );
  }

  function lastNonChanging() {
    // The history's final entry once interior ≈ 0 is the limiting distribution.
    const last = state.history[state.history.length - 1];
    if (last.interior < 1e-9) return last;
    // Otherwise, project forward analytically by walking until convergence,
    // but capped — purely for the "final" stat readout.
    let dp = state.dp.map((row) => row.slice());
    for (let i = 0; i < 200; i++) {
      const snap = snapshot(dp, 0);
      if (snap.interior < 1e-9) return snap;
      dp = stepDistribution(dp, state.A, state.D);
    }
    return snapshot(dp, 0);
  }

  function stat(label, value, kind) {
    return el('div', { class: `stat ${kind || ''}` }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value),
    ]);
  }

  reset();
}
