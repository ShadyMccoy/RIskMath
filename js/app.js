// App shell: tab routing + lazy-mount components.

import * as grid from './components/grid.js';
import * as calculator from './components/calculator.js';
import * as campaign from './components/campaign.js';
import * as simulator from './components/simulator.js';
import * as odds from './components/odds.js';

const MOUNTS = {
  grid: grid.mount,
  calc: calculator.mount,
  campaign: campaign.mount,
  simulator: simulator.mount,
  odds: odds.mount,
};

const mounted = new Set();

function activate(tab) {
  document.querySelectorAll('nav#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === tab);
  });
  if (!mounted.has(tab)) {
    const node = document.getElementById(tab);
    MOUNTS[tab](node);
    mounted.add(tab);
  }
  history.replaceState(null, '', `#${tab}`);
}

document.querySelectorAll('nav#tabs button').forEach((btn) => {
  btn.addEventListener('click', () => activate(btn.dataset.tab));
});

const initial = (location.hash || '#grid').slice(1);
activate(MOUNTS[initial] ? initial : 'grid');
