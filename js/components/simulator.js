// Monte Carlo simulator with animated single-battle replay.

import { simulateRound, simulateBattle, analyze } from '../probability.js';
import { el, pct, makeRng } from '../util.js';

const PIPS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function mount(root) {
  root.innerHTML = '';

  const inputs = el('div', { class: 'controls-row' }, [
    el('div', { class: 'field' }, [
      el('label', {}, 'Attackers'),
      el('input', { type: 'number', id: 'A', value: 8, min: 1, max: 100 }),
    ]),
    el('div', { class: 'field' }, [
      el('label', {}, 'Defenders'),
      el('input', { type: 'number', id: 'D', value: 5, min: 1, max: 100 }),
    ]),
    el('button', { class: 'primary', id: 'rollOnce' }, 'Roll One Battle'),
    el('button', { class: 'secondary', id: 'roll1k' }, 'Simulate 1,000'),
    el('button', { class: 'secondary', id: 'roll10k' }, 'Simulate 10,000'),
  ]);

  const battleState = el('div', { class: 'battle-state' });
  const dice = el('div', { class: 'dice-row' }, [
    el('div', { class: 'dice-side attacker' }, [
      el('h3', {}, 'Attacker'),
      el('div', { class: 'dice-set', id: 'attDice' }),
    ]),
    el('div', { class: 'dice-side defender' }, [
      el('h3', {}, 'Defender'),
      el('div', { class: 'dice-set', id: 'defDice' }),
    ]),
  ]);

  const log = el('div', { class: 'log', id: 'log' });

  const mcStats = el('div', { class: 'stat-grid', id: 'mcStats' });

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, 'Battle Simulator'),
      el('p', { class: 'desc' },
        'Roll an animated dice battle, or run thousands of trials and compare against the exact math.'),
      inputs,
      battleState,
      dice,
      el('h3', { style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
                          color: 'var(--text-dim)', margin: '12px 0 6px' } }, 'Round-by-round log'),
      log,
      el('h3', { style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
                          color: 'var(--text-dim)', margin: '20px 0 6px' } }, 'Monte Carlo summary'),
      mcStats,
    ])
  );

  function setBattleState(a, d) {
    battleState.innerHTML = '';
    battleState.append(
      el('span', { class: 'att-count' }, `${a} ⚔`),
      el('span', { class: 'vs' }, 'vs'),
      el('span', { class: 'def-count' }, `🛡 ${d}`),
    );
  }

  function renderDice(setNode, values, kind, winners) {
    setNode.innerHTML = '';
    values.forEach((v, i) => {
      const w = winners ? winners[i] : null;
      const cls = `die ${kind}${w === true ? ' win' : ''}${w === false ? ' lose' : ''}`;
      setNode.appendChild(el('div', { class: cls }, PIPS[v] || `${v}`));
    });
  }

  async function animateBattle() {
    const A = Math.max(1, parseInt(root.querySelector('#A').value, 10) || 1);
    const D = Math.max(1, parseInt(root.querySelector('#D').value, 10) || 1);
    let a = A, d = D;
    log.innerHTML = '';
    setBattleState(a, d);
    const attDice = root.querySelector('#attDice');
    const defDice = root.querySelector('#defDice');
    attDice.innerHTML = '';
    defDice.innerHTML = '';

    let round = 0;
    while (a > 0 && d > 0) {
      round++;
      const r = simulateRound(a, d);
      // Determine winner annotations.
      const compares = Math.min(r.attDice.length, r.defDice.length);
      const attWinners = r.attDice.map((_, i) => i < compares ? r.attDice[i] > r.defDice[i] : null);
      const defWinners = r.defDice.map((_, i) => i < compares ? r.defDice[i] >= r.attDice[i] : null);

      renderDice(attDice, r.attDice, 'att', attWinners);
      renderDice(defDice, r.defDice, 'def', defWinners);

      // Apply shake animation
      [...attDice.children, ...defDice.children].forEach((d) => {
        d.classList.add('rolling');
        setTimeout(() => d.classList.remove('rolling'), 400);
      });

      a -= r.attLost;
      d -= r.defLost;
      setBattleState(a, d);

      const entry = el('div', { class: 'entry' });
      entry.innerHTML =
        `R${round}: ATT [${r.attDice.join(', ')}] vs DEF [${r.defDice.join(', ')}] → ` +
        `<span class="att-loss">−${r.attLost} att</span>, ` +
        `<span class="def-loss">−${r.defLost} def</span> · now ${a} vs ${d}`;
      log.insertBefore(entry, log.firstChild);

      await new Promise((res) => setTimeout(res, 480));
    }

    const verdict = el('div', { class: 'entry', style: { color: d === 0 ? 'var(--ok)' : 'var(--att)',
      fontWeight: '700', borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '4px' } });
    verdict.textContent = d === 0 ? `Attacker wins with ${a} remaining.` : `Defender holds with ${d} remaining.`;
    log.insertBefore(verdict, log.firstChild);
  }

  function statTile(label, value, kind) {
    return el('div', { class: `stat ${kind || ''}` }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value),
    ]);
  }

  function runMonteCarlo(n) {
    const A = Math.max(1, parseInt(root.querySelector('#A').value, 10) || 1);
    const D = Math.max(1, parseInt(root.querySelector('#D').value, 10) || 1);
    const rng = makeRng(Date.now() & 0xffffffff);
    let wins = 0, sumAtt = 0, sumDef = 0;
    for (let i = 0; i < n; i++) {
      const r = simulateBattle(A, D, { rng });
      if (r.attackerWon) { wins++; sumAtt += r.a; }
      else { sumDef += r.d; }
    }
    const exact = analyze(A, D);
    mcStats.innerHTML = '';
    mcStats.append(
      statTile(`Trials`, `${n.toLocaleString()}`, 'gold'),
      statTile(`Att win (sim)`, pct(wins / n), 'attacker'),
      statTile(`Att win (exact)`, pct(exact.attackerWin), 'attacker'),
      statTile(`Avg surv att (sim)`, wins > 0 ? (sumAtt / wins).toFixed(2) : '—', 'attacker'),
      statTile(`Avg surv def (sim)`, n - wins > 0 ? (sumDef / (n - wins)).toFixed(2) : '—', 'defender'),
      statTile(`Δ vs exact`, `${((wins / n - exact.attackerWin) * 100).toFixed(2)} pp`, ''),
    );
  }

  root.querySelector('#rollOnce').addEventListener('click', () => animateBattle());
  root.querySelector('#roll1k').addEventListener('click', () => runMonteCarlo(1000));
  root.querySelector('#roll10k').addEventListener('click', () => runMonteCarlo(10000));

  setBattleState(8, 5);
}
