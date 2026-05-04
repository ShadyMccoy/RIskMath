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

export function mount(root) {
  root.innerHTML = '';
  const grid = el('div', { class: 'odds-grid' });

  for (const [key, outcomes] of Object.entries(DICE_OUTCOMES)) {
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
    grid.appendChild(card);
  }

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Single-Roll Dice Odds'),
      el('p', { class: 'desc' },
        'Probabilities for one round of dice. The defender wins ties. ' +
        'These six matchups are the building blocks of every Risk battle.'),
      grid,
    ])
  );
}
