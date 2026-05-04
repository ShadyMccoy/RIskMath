// Single-roll dice odds reference card.

import { DICE_OUTCOMES } from '../probability.js';
import { el, pct } from '../util.js';

const LABELS = {
  '3v2': '3 attackers vs 2 defenders',
  '3v1': '3 attackers vs 1 defender',
  '2v2': '2 attackers vs 2 defenders',
  '2v1': '2 attackers vs 1 defender',
  '1v2': '1 attacker vs 2 defenders',
  '1v1': '1 attacker vs 1 defender',
};

// Enumerate the sorted-descending top-K of all 6^N dice rolls, with the
// number of underlying ordered rolls that produce each top-K tuple.
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
    .map(([key, count]) => ({ tops: key.split(',').map(Number), count }))
    .sort((a, b) => {
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

function buildMatrix(a, d) {
  const K = Math.min(a, d);
  const rows = topsOfN(a, K);
  const cols = topsOfN(d, K);

  const matrix = el('div', { class: 'odds-matrix' });
  matrix.style.gridTemplateColumns =
    `repeat(${K}, var(--mc-size)) auto repeat(${cols.length}, var(--mc-size))`;

  // Top header rows: defender D1..DK values, with the "Dj" label sitting in
  // the row-count column so it lines up over the body's count column.
  for (let j = 0; j < K; j++) {
    for (let k = 0; k < K; k++) matrix.appendChild(el('div', { class: 'mc-corner' }));
    matrix.appendChild(el('div', { class: 'mc-corner mc-label' }, `D${j + 1}`));
    for (const c of cols) {
      matrix.appendChild(el('div', { class: 'mc-head' }, String(c.tops[j])));
    }
  }
  // Header row: A1..AK and "count" labels, then per-column counts.
  for (let k = 0; k < K; k++) {
    matrix.appendChild(el('div', { class: 'mc-corner mc-label' }, `A${k + 1}`));
  }
  matrix.appendChild(el('div', { class: 'mc-corner mc-label' }, 'count'));
  for (const c of cols) {
    matrix.appendChild(el('div', { class: 'mc-head mc-count' }, String(c.count)));
  }

  // Body rows.
  for (const r of rows) {
    for (let k = 0; k < K; k++) {
      matrix.appendChild(el('div', { class: 'mc-rh' }, String(r.tops[k])));
    }
    matrix.appendChild(el('div', { class: 'mc-rh mc-count' }, String(r.count)));
    for (const c of cols) {
      const lost = attLossesFor(r.tops, c.tops);
      const cls = lost === 0 ? 'def' : lost === K ? 'att' : 'both';
      matrix.appendChild(el('div', { class: `mc-cell ${cls}` }, String(lost)));
    }
  }
  return matrix;
}

function buildMatrixDetails(a, d) {
  return el('details', { class: 'odds-matrix-wrap' }, [
    el('summary', {}, 'Show roll matrix'),
    el('p', { class: 'odds-matrix-cap' },
      'Sorted attacker dice (rows) × sorted defender dice (cols). ' +
      'Each cell shows attacker losses; row & column counts are the number of ' +
      'underlying ordered rolls. Green = defender loses all, red = attacker loses all, gray = split.'),
    el('div', { class: 'odds-matrix-scroll' }, [buildMatrix(a, d)]),
  ]);
}

export function mount(root) {
  root.innerHTML = '';
  const grid = el('div', { class: 'odds-grid' });

  for (const [key, outcomes] of Object.entries(DICE_OUTCOMES)) {
    const [a, d] = key.split('v').map(Number);
    const card = el('div', { class: 'odds-card' }, [
      el('h3', {}, key),
      el('p', { class: 'sub' }, LABELS[key]),
    ]);
    let attLossExp = 0, defLossExp = 0;
    outcomes.forEach(([aLost, dLost, p]) => {
      attLossExp += aLost * p;
      defLossExp += dLost * p;
      const labelStr = aLost === 0
        ? `Defender loses ${dLost}`
        : dLost === 0
          ? `Attacker loses ${aLost}`
          : `Both lose ${aLost}`;
      const fillClass = aLost === 0 ? 'def' : dLost === 0 ? 'att' : 'both';
      card.appendChild(el('div', { class: 'odds-row' }, [
        el('span', {}, labelStr),
        el('span', { class: 'pct' }, pct(p)),
      ]));
      card.appendChild(el('div', { class: 'odds-bar' }, [
        el('div', { class: `fill ${fillClass}`, style: { width: `${p * 100}%` } }),
      ]));
    });
    card.appendChild(el('div', {
      style: { marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)',
               display: 'flex', justifyContent: 'space-between' }
    }, [
      el('span', {}, `Avg att loss: ${attLossExp.toFixed(3)}`),
      el('span', {}, `Avg def loss: ${defLossExp.toFixed(3)}`),
    ]));
    card.appendChild(buildMatrixDetails(a, d));
    grid.appendChild(card);
  }

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Single-Roll Dice Odds'),
      el('p', { class: 'desc' },
        'Probabilities for one round of dice. The defender wins ties. ' +
        'These six matchups are the building blocks of every Risk battle. ' +
        'Expand a card to see the full roll matrix that produces its odds.'),
      grid,
    ])
  );
}
