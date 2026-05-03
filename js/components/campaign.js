// Campaign planner: chain attacks across multiple territories from one army pool.

import { campaign } from '../probability.js';
import { el, pct } from '../util.js';

export function mount(root) {
  root.innerHTML = '';

  let territories = [
    { name: 'Ural', def: 3 },
    { name: 'Siberia', def: 2 },
    { name: 'Yakutsk', def: 4 },
  ];

  const listNode = el('div', { class: 'territory-list' });
  const resultNode = el('div', { class: 'stat-grid' });
  const stageNode = el('div', { class: 'chart-section' });

  const inputs = el('div', { class: 'controls-row' }, [
    el('div', { class: 'field' }, [
      el('label', {}, 'Attacking force'),
      el('input', { type: 'number', id: 'A', value: 18, min: 1, max: 200, step: 1 }),
    ]),
    el('div', { class: 'field' }, [
      el('label', {}, 'Garrison left per capture'),
      el('input', { type: 'number', id: 'G', value: 1, min: 0, max: 5, step: 1 }),
    ]),
    el('button', { class: 'secondary', id: 'addT' }, '+ Territory'),
  ]);

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Campaign Planner'),
      el('p', { class: 'desc' },
        'Sweep through a chain of defenders with one attacking pool. After each capture, leave a garrison and continue with what remains. ' +
        'Useful for "can I cross the continent in one turn?" decisions.'),
      inputs,
      el('h3', { style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
                          color: 'var(--text-dim)', margin: '8px 0' } }, 'Territories (in order)'),
      listNode,
      resultNode,
      stageNode,
    ])
  );

  function renderList() {
    listNode.innerHTML = '';
    territories.forEach((t, i) => {
      const numBox = el('div', { class: 'num' }, `${i + 1}`);
      const nameInput = el('input', { class: 'name', value: t.name, placeholder: 'Territory' });
      nameInput.addEventListener('input', (e) => { t.name = e.target.value; });
      const defInput = el('input', { type: 'number', min: 1, max: 99, value: t.def });
      defInput.addEventListener('input', (e) => {
        t.def = Math.max(1, parseInt(e.target.value, 10) || 1);
        recalc();
      });
      const remove = el('button', { class: 'danger' }, '×');
      remove.addEventListener('click', () => {
        territories.splice(i, 1);
        renderList();
        recalc();
      });
      listNode.appendChild(
        el('div', { class: 'territory' }, [
          numBox,
          nameInput,
          el('div', { class: 'defenders' }, ['Def:', defInput]),
          remove,
        ])
      );
    });
  }

  function statTile(label, value, kind) {
    return el('div', { class: `stat ${kind || ''}` }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value),
    ]);
  }

  function recalc() {
    const A = Math.max(1, parseInt(root.querySelector('#A').value, 10) || 1);
    const G = Math.max(0, parseInt(root.querySelector('#G').value, 10) || 0);
    const defs = territories.map((t) => t.def).filter((d) => d > 0);

    resultNode.innerHTML = '';
    stageNode.innerHTML = '';

    if (defs.length === 0) {
      resultNode.append(statTile('Status', 'Add a territory', 'gold'));
      return;
    }

    // Per-stage cumulative success.
    const stages = [];
    let cumProb = 1;
    let force = A;
    for (let i = 0; i < defs.length; i++) {
      const upTo = campaign(A, defs.slice(0, i + 1), { garrisonPerTerritory: G });
      stages.push({ name: territories[i].name, def: defs[i], cumProb: upTo.conquerProb,
                    expRemaining: upTo.expectedRemaining });
    }

    const final = stages[stages.length - 1];
    resultNode.append(
      statTile('Conquer all', pct(final.cumProb), 'gold'),
      statTile('Avg force at end', final.cumProb > 0 ? final.expRemaining.toFixed(2) : '—', 'attacker'),
      statTile('Territories', `${defs.length}`, ''),
      statTile('Total defenders', `${defs.reduce((s, d) => s + d, 0)}`, 'defender'),
    );

    stageNode.appendChild(el('h3', {}, 'Per-territory cumulative success'));
    const chart = el('div', { class: 'dist-chart', style: { minHeight: '160px' } });
    const peak = 1;
    stages.forEach((s, i) => {
      const h = (s.cumProb / peak) * 100;
      chart.appendChild(
        el('div', { class: 'dist-bar' }, [
          el('div', { class: 'bar', style: { height: `${h}%`, background:
            `linear-gradient(to top, var(--gold), var(--gold-bright))` } }, [
            el('div', { class: 'pct' }, pct(s.cumProb, 1)),
          ]),
          el('div', { class: 'lbl' }, `${i + 1}. ${s.name || '?'}`),
        ])
      );
    });
    stageNode.appendChild(chart);
  }

  root.querySelector('#addT').addEventListener('click', () => {
    territories.push({ name: `Territory ${territories.length + 1}`, def: 2 });
    renderList();
    recalc();
  });
  root.querySelector('#A').addEventListener('input', recalc);
  root.querySelector('#G').addEventListener('input', recalc);

  renderList();
  recalc();
}
