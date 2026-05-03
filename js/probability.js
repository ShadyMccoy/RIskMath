// Core Risk dice probability math.
//
// State (a, d): a = attacking armies committed to battle, d = defending armies.
// The garrison left behind on the source territory is NOT counted in `a`.
// Attacker rolls min(3, a) dice; defender rolls min(2, d) dice.

export const DICE_OUTCOMES = {
  // key 'AvD' -> [[attLost, defLost, prob], ...]
  '3v2': [[0, 2, 2890 / 7776], [1, 1, 2611 / 7776], [2, 0, 2275 / 7776]],
  '3v1': [[0, 1, 855 / 1296],  [1, 0, 441 / 1296]],
  '2v2': [[0, 2, 295 / 1296],  [1, 1, 420 / 1296],  [2, 0, 581 / 1296]],
  '2v1': [[0, 1, 125 / 216],   [1, 0, 91 / 216]],
  '1v2': [[0, 1, 55 / 216],    [1, 0, 161 / 216]],
  '1v1': [[0, 1, 15 / 36],     [1, 0, 21 / 36]],
};

export function diceKey(a, d) {
  return `${Math.min(3, a)}v${Math.min(2, d)}`;
}

export function getOutcomes(a, d) {
  return DICE_OUTCOMES[diceKey(a, d)];
}

// Exact terminal-state distribution.
// Returns dp[a][d] = probability the battle ends in (a, d).
// Terminal means a === 0 (defender wins) or d === 0 (attacker wins).
export function distribution(A, D) {
  const dp = Array.from({ length: A + 1 }, () => new Float64Array(D + 1));
  dp[A][D] = 1;
  for (let total = A + D; total >= 2; total--) {
    for (let a = Math.min(A, total - 1); a >= 1; a--) {
      const d = total - a;
      if (d < 1 || d > D) continue;
      const p = dp[a][d];
      if (p === 0) continue;
      for (const [aLost, dLost, prob] of getOutcomes(a, d)) {
        dp[a - aLost][d - dLost] += p * prob;
      }
      dp[a][d] = 0;
    }
  }
  return dp;
}

export function analyze(A, D) {
  if (A < 1 || D < 1) {
    return {
      attackerWin: A >= 1 && D < 1 ? 1 : 0,
      defenderWin: D >= 1 && A < 1 ? 1 : 0,
      expectedAttRemaining: A,
      expectedDefRemaining: D,
      attRemainingDist: { [A]: 1 },
      defRemainingDist: { [D]: 1 },
      distribution: null,
    };
  }
  const dp = distribution(A, D);
  let attWin = 0, defWin = 0, eAtt = 0, eDef = 0;
  const attRemainingDist = {};
  const defRemainingDist = {};
  for (let a = 0; a <= A; a++) {
    for (let d = 0; d <= D; d++) {
      const p = dp[a][d];
      if (p === 0) continue;
      if (d === 0) {
        attWin += p;
        eAtt += p * a;
        attRemainingDist[a] = (attRemainingDist[a] || 0) + p;
      }
      if (a === 0) {
        defWin += p;
        eDef += p * d;
        defRemainingDist[d] = (defRemainingDist[d] || 0) + p;
      }
    }
  }
  return {
    attackerWin: attWin,
    defenderWin: defWin,
    expectedAttRemaining: attWin > 0 ? eAtt / attWin : 0,
    expectedDefRemaining: defWin > 0 ? eDef / defWin : 0,
    attRemainingDist,
    defRemainingDist,
    distribution: dp,
  };
}

// Single round simulation (one dice exchange). Returns [attLost, defLost].
export function simulateRound(a, d, rng = Math.random) {
  const attDice = Array.from({ length: Math.min(3, a) }, () => Math.ceil(rng() * 6))
    .sort((x, y) => y - x);
  const defDice = Array.from({ length: Math.min(2, d) }, () => Math.ceil(rng() * 6))
    .sort((x, y) => y - x);
  let attLost = 0, defLost = 0;
  const compares = Math.min(attDice.length, defDice.length);
  for (let i = 0; i < compares; i++) {
    if (attDice[i] > defDice[i]) defLost++;
    else attLost++;
  }
  return { attLost, defLost, attDice, defDice };
}

// Simulate a battle to completion. Returns final (a, d) plus optional log.
export function simulateBattle(A, D, { rng = Math.random, recordLog = false } = {}) {
  let a = A, d = D;
  const log = [];
  while (a > 0 && d > 0) {
    const r = simulateRound(a, d, rng);
    a -= r.attLost;
    d -= r.defLost;
    if (recordLog) log.push({ ...r, aAfter: a, dAfter: d });
  }
  return { a, d, attackerWon: d === 0, log };
}

// Campaign: a single attacking pool sweeps through a list of defenders,
// keeping garrisons of `garrisonPerTerritory` behind on each captured territory.
// Returns prob of conquering all + expected remaining force.
export function campaign(forceCommitted, defenders, { garrisonPerTerritory = 1 } = {}) {
  // dist[a] = probability of having `a` attackers remaining at this stage,
  // having captured everything up to this point. Index a from 0 to forceCommitted.
  let dist = new Float64Array(forceCommitted + 1);
  dist[forceCommitted] = 1;
  let conquerProb = 1;

  for (const d of defenders) {
    const next = new Float64Array(forceCommitted + 1);
    for (let a = 1; a <= forceCommitted; a++) {
      const p = dist[a];
      if (p === 0) continue;
      const dp = distribution(a, d);
      for (let aa = 0; aa <= a; aa++) {
        const winProb = dp[aa][0];
        if (winProb === 0) continue;
        // After capture, leave `garrisonPerTerritory` behind (if possible).
        const remaining = Math.max(0, aa - garrisonPerTerritory);
        next[remaining] += p * winProb;
      }
    }
    dist = next;
  }

  let total = 0, expected = 0, distMap = {};
  for (let a = 0; a <= forceCommitted; a++) {
    if (dist[a] === 0) continue;
    total += dist[a];
    expected += a * dist[a];
    distMap[a] = dist[a];
  }
  return {
    conquerProb: total,
    expectedRemaining: total > 0 ? expected / total : 0,
    remainingDist: distMap,
  };
}
