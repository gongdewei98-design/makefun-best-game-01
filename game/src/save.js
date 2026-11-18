// The best run, kept in localStorage between visits: the highest score, the deepest floor
// reached and whether the Ember King ever fell. Storage can be off (private windows), so
// every access is guarded and the game plays on without it.

import { BEST_KEY } from './config.js';

export function readBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return { score: 0, floor: 0, wins: 0 };
    const parsed = JSON.parse(raw);
    return {
      score: Number(parsed.score) || 0,
      floor: Number(parsed.floor) || 0,
      wins: Number(parsed.wins) || 0,
    };
  } catch {
    return { score: 0, floor: 0, wins: 0 };
  }
}

export function saveBest(best) {
  try {
    window.localStorage.setItem(
      BEST_KEY,
      JSON.stringify({ score: best.score, floor: best.floor, wins: best.wins }),
    );
  } catch {
    // The best score then lasts this visit only.
  }
}

/** Fold one finished run into the stored best and return the new best. */
export function recordRun(best, run) {
  const next = {
    score: Math.max(best.score, run.score),
    floor: Math.max(best.floor, run.floor),
    wins: best.wins + (run.won ? 1 : 0),
  };
  saveBest(next);
  return next;
}
