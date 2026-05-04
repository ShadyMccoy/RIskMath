// Reductions: a presentation-friendly tab that shows one matchup's roll
// matrix at large scale and animates it collapsing into a stacked outcome
// bar. Designed for screen-recording — minimal chrome, big cells, big
// percentage labels — without cluttering the production cards.

import { el } from '../util.js';
import { buildMatrix, reduceMatrix, restoreMatrix } from './roll-matrix.js';

const MATCHUPS = [
  ['1v1', '1 attacker · 1 defender'],
  ['1v2', '1 attacker · 2 defenders'],
  ['2v1', '2 attackers · 1 defender'],
  ['2v2', '2 attackers · 2 defenders'],
  ['3v1', '3 attackers · 1 defender'],
  ['3v2', '3 attackers · 2 defenders'],
];

const BIG_OPTS = {
  pxPerCount: 1.7,
  minTrack: 12,
  legibleTrack: 18,
  mcSize: 28,
  fontSize: 14,
  labelFontSize: 11,
  pctFontSize: 24,
  nameFontSize: 12,
};

export function mount(root) {
  root.innerHTML = '';

  let currentKey = '3v2';
  let currentMatrix = null;
  let currentOverlay = null;
  let reduced = false;

  const pills = el('div', { class: 'red-pills', role: 'tablist' });
  const subtitle = el('p', { class: 'red-subtitle' });
  const stageHost = el('div', { class: 'red-stage' });
  const toggle = el('button', { class: 'red-toggle', type: 'button' });

  function renderToggleLabel() {
    toggle.textContent = reduced ? '← Restore matrix' : 'Collapse to outcomes →';
  }

  function load(key) {
    currentKey = key;
    reduced = false;
    renderToggleLabel();
    pills.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.key === key);
    });
    subtitle.textContent = MATCHUPS.find(([k]) => k === key)[1];
    stageHost.innerHTML = '';
    const [a, d] = key.split('v').map(Number);
    const matrix = buildMatrix(a, d, BIG_OPTS);
    const overlay = el('div', { class: 'odds-reduce-overlay' });
    const wrap = el('div', { class: 'red-matrix-wrap' }, [matrix, overlay]);
    stageHost.appendChild(wrap);
    currentMatrix = matrix;
    currentOverlay = overlay;
  }

  toggle.addEventListener('click', () => {
    if (!currentMatrix) return;
    if (!reduced) {
      reduceMatrix(currentMatrix, currentOverlay);
      reduced = true;
    } else {
      restoreMatrix(currentMatrix, currentOverlay);
      reduced = false;
    }
    renderToggleLabel();
  });

  for (const [key] of MATCHUPS) {
    const btn = el('button', { 'data-key': key, type: 'button' }, key);
    btn.addEventListener('click', () => load(key));
    pills.appendChild(btn);
  }

  root.append(
    el('div', { class: 'panel red-panel' }, [
      el('h2', {}, 'Reductions'),
      el('p', { class: 'desc' },
        'A scratch space for the dice-math video. Each cell\'s area is its joint ' +
        'probability; collapse the matrix and same-color rectangles pack into ' +
        'slabs whose widths are exactly the three outcome probabilities. ' +
        'Each rectangle keeps its area — only its aspect ratio is normalized.'),
      pills,
      subtitle,
      stageHost,
      el('div', { class: 'red-controls' }, [toggle]),
    ])
  );

  load(currentKey);
}
