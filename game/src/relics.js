// Relics: one waits on a pedestal on each of the first four floors, and each one changes
// how the run plays. A run finds four of the six, so no two descents build the same
// character. Effects apply at once when the relic is claimed; the HUD shows every relic
// the player carries.

export const RELICS = [
  {
    id: 'heart',
    name: 'Ember Heart',
    glyph: 'H',
    color: '#ff5a4d',
    blurb: '+25 max health, and heal 25',
    apply(player) {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    },
  },
  {
    id: 'boots',
    name: 'Swift Boots',
    glyph: 'B',
    color: '#7ddb6a',
    blurb: '+20% move speed',
    apply(player) {
      player.speed *= 1.2;
    },
  },
  {
    id: 'blade',
    name: 'Sharpened Blade',
    glyph: 'S',
    color: '#f2b23e',
    blurb: '+50% sword damage',
    apply(player) {
      player.swordDamage = Math.round(player.swordDamage * 1.5);
    },
  },
  {
    id: 'greed',
    name: 'Greed Charm',
    glyph: 'G',
    color: '#ffd166',
    blurb: '+50% score from kills and gold',
    apply(player) {
      player.scoreBonus += 0.5;
    },
  },
  {
    id: 'torch',
    name: 'Torch of Sight',
    glyph: 'T',
    color: '#ffb347',
    blurb: '+40% light radius',
    apply(player) {
      player.lightRadius *= 1.4;
    },
  },
  {
    id: 'fang',
    name: 'Vampire Fang',
    glyph: 'V',
    color: '#c46a8a',
    blurb: 'Heal 2 health on every kill',
    apply(player) {
      player.healOnKill += 2;
    },
  },
];

export function relicById(id) {
  return RELICS.find((relic) => relic.id === id) || null;
}

/** The relics a run has not claimed yet, in a random order. */
export function unclaimedRelics(random, claimedIds) {
  const remaining = RELICS.filter((relic) => !claimedIds.includes(relic.id));
  for (let i = remaining.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = remaining[i];
    remaining[i] = remaining[j];
    remaining[j] = tmp;
  }
  return remaining;
}
