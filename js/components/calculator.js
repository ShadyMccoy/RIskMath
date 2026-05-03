// N-vs-M battle calculator with full outcome distribution chart.

import { analyze } from '../probability.js';
import { el, pct } from '../util.js';

export function mount(root) {
  root.innerHTML = '';

  const stateNode = el('div', { class: 'stat-grid' });
  const attChart = el('div', { class: 'dist-chart' });
  const defChart = el('div', { class: 'dist-chart' });

  const inputs = el('div', { class: 'controls-row' }, [
    el('div', { class: 'field' }, [
      el('label', {}, 'Attacking force'),
      el('input', { type: 'number', id: 'A', value: 10, min: 1, max: 200, step: 1 }),
    ]),
    el('div', { class: 'field' }, [
      el('label', {}, 'Defending armies'),
      el('input', { type: 'number', id: 'D', value: 6, min: 1, max: 200, step: 1 }),
    ]),
    el('button', { class: 'primary', id: 'recalc' }, 'Calculate'),
  ]);

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Battle Calculator'),
      el('p', { class: 'desc' },
        'Exact probability distribution for any single battle. Attacking force is the number of armies committed to the attack (one is always left behind to garrison the source territory).'),
      inputs,
      stateNode,
      el('div', { class: 'chart-section' }, [
        el('h3', {}, 'If attacker wins — surviving attackers'),
        attChart,
      ]),
      el('div', { class: 'chart-section' }, [
        el('h3', {}, 'If defender wins — surviving defenders'),
        defChart,
      ]),
      el('p', { class: 'hint' },
        'Tip: a rule of thumb says you want roughly 1.5× the defender. The exact crossover is around ',
        el('code', {}, 'A ≥ D + ⌈D/3⌉'), '.'),
    ])
  );

  function statTile(label, value, kind) {
    return el('div', { class: `stat ${kind || ''}` }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value),
    ]);
  }

  function renderChart(node, dist, max, kind) {
    node.innerHTML = '';
    const peak = Math.max(...Object.values(dist), 0.0001);
    const keys = [];
    for (let i = 0; i <= max; i++) keys.push(i);
    for (const k of keys) {
      const p = dist[k] || 0;
      const h = (p / peak) * 100;
      const bar = el('div', { class: `dist-bar ${kind}` }, [
        el('div', { class: 'bar', style: { height: `${h}%` } },
          p > 0.005 ? el('div', { class: 'pct' }, pct(p, 1)) : null),
        el('div', { class: 'lbl' }, `${k}`),
      ]);
      node.appendChild(bar);
    }
  }

  function calc() {
    const A = parseInt(root.querySelector('#A').value, 10) || 1;
    const D = parseInt(root.querySelector('#D').value, 10) || 1;
    const r = analyze(A, D);

    stateNode.innerHTML = '';
    stateNode.append(
      statTile('Attacker win', pct(r.attackerWin), 'attacker'),
      statTile('Defender win', pct(r.defenderWin), 'defender'),
      statTile('Avg surviving attackers (on win)',
        r.attackerWin > 0 ? r.expectedAttRemaining.toFixed(2) : '—', 'attacker'),
      statTile('Avg surviving defenders (on win)',
        r.defenderWin > 0 ? r.expectedDefRemaining.toFixed(2) : '—', 'defender'),
      statTile('Expected attacker losses',
        (A - (r.expectedAttRemaining * r.attackerWin + 0 * r.defenderWin)).toFixed(2), 'attacker'),
      statTile('Expected defender losses',
        (D - (r.expectedDefRemaining * r.defenderWin + 0 * r.attackerWin)).toFixed(2), 'defender'),
    );

    renderChart(attChart, r.attRemainingDist, A, 'attacker');
    renderChart(defChart, r.defRemainingDist, D, 'defender');
  }

  root.querySelector('#recalc').addEventListener('click', calc);
  root.querySelector('#A').addEventListener('input', calc);
  root.querySelector('#D').addEventListener('input', calc);

  calc();
}
