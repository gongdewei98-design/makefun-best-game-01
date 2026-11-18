// The Ember King, who waits on floor 5. A big state machine: he stalks the player, then
// picks an attack — a radial burst of fireballs, a summoning of ember bats, a telegraphed
// charge across the arena, or a ground slam that ripples outward. Below half health he
// enters his burning phase: faster, angrier, double bursts. The world turns his attack
// signals into fireballs, minions and slam damage.

import { BOSS } from './config.js';
import { moveBody } from './player.js';

export const BOSS_ATTACK_BURST = 'burst';
export const BOSS_ATTACK_SUMMON = 'summon';
export const BOSS_ATTACK_CHARGE = 'charge';
export const BOSS_ATTACK_SLAM = 'slam';

export function createBoss(x, y) {
  return {
    x,
    y,
    hp: BOSS.hp,
    maxHp: BOSS.hp,
    radius: BOSS.radius,
    state: 'dormant',
    stateTime: 0,
    attackCooldown: 2.2,
    chargeX: 0,
    chargeY: 0,
    flash: 0,
    knockX: 0,
    knockY: 0,
    roared: false,
    dead: false,
  };
}

export function bossPhase(boss) {
  return boss.hp <= boss.maxHp / 2 ? 2 : 1;
}

function pickAttack(boss, player, minions, random) {
  const distance = Math.hypot(player.x - boss.x, player.y - boss.y);
  if (minions < 2 && random() < 0.3) return BOSS_ATTACK_SUMMON;
  if (distance > 320) return random() < 0.6 ? BOSS_ATTACK_CHARGE : BOSS_ATTACK_BURST;
  if (distance < 130) return random() < 0.5 ? BOSS_ATTACK_SLAM : BOSS_ATTACK_BURST;
  return BOSS_ATTACK_BURST;
}

/**
 * Advance the boss one step. Returns an attack signal when one fires this step
 * ('burst', 'summon', 'charge' or 'slam'), 'roar' when he wakes, else ''. `random` is
 * the run's seeded generator, so the same seed always picks the same attacks.
 */
export function updateBoss(boss, player, dt, dungeon, minions, random = Math.random) {
  if (boss.dead) return '';
  boss.flash = Math.max(0, boss.flash - dt);
  boss.stateTime += dt;
  const phase = bossPhase(boss);
  const speed = BOSS.speed * (phase === 2 ? 1.25 : 1);

  if (boss.state === 'dormant') {
    const distance = Math.hypot(player.x - boss.x, player.y - boss.y);
    if (distance < 420) {
      boss.state = 'chase';
      boss.stateTime = 0;
      boss.roared = true;
      return 'roar';
    }
    return '';
  }

  if (boss.state === 'chargeWindup') {
    if (boss.stateTime > 0.7) {
      boss.state = 'charging';
      boss.stateTime = 0;
    }
    return '';
  }

  if (boss.state === 'charging') {
    moveBody(dungeon, boss, boss.chargeX * speed * 4.2 * dt, boss.chargeY * speed * 4.2 * dt);
    if (boss.stateTime > 0.55) {
      boss.state = 'recover';
      boss.stateTime = 0;
    }
    return '';
  }

  if (boss.state === 'recover') {
    if (boss.stateTime > (phase === 2 ? 0.5 : 0.9)) {
      boss.state = 'chase';
      boss.stateTime = 0;
    }
    return '';
  }

  if (boss.state === 'summoning') {
    if (boss.stateTime > 0.8) {
      boss.state = 'chase';
      boss.stateTime = 0;
      boss.attackCooldown = phase === 2 ? 1.4 : 2;
      return BOSS_ATTACK_SUMMON;
    }
    return '';
  }

  if (boss.state === 'bursting') {
    if (boss.stateTime > 0.5) {
      boss.state = 'chase';
      boss.stateTime = 0;
      boss.attackCooldown = phase === 2 ? 1.1 : 1.7;
      return BOSS_ATTACK_BURST;
    }
    return '';
  }

  if (boss.state === 'slamming') {
    if (boss.stateTime > 0.6) {
      boss.state = 'recover';
      boss.stateTime = 0;
      boss.attackCooldown = phase === 2 ? 1.2 : 1.8;
      return BOSS_ATTACK_SLAM;
    }
    return '';
  }

  // Chase: stalk the player, and choose an attack when the cooldown is up.
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = Math.hypot(dx, dy) || 1;
  moveBody(dungeon, boss, (dx / distance) * speed * dt, (dy / distance) * speed * dt);
  boss.attackCooldown -= dt;
  if (boss.attackCooldown <= 0) {
    const attack = pickAttack(boss, player, minions, random);
    if (attack === BOSS_ATTACK_CHARGE) {
      boss.state = 'chargeWindup';
      boss.stateTime = 0;
      boss.chargeX = dx / distance;
      boss.chargeY = dy / distance;
      return 'chargeWindup';
    }
    if (attack === BOSS_ATTACK_SUMMON) {
      boss.state = 'summoning';
      boss.stateTime = 0;
      return '';
    }
    if (attack === BOSS_ATTACK_SLAM) {
      boss.state = 'slamming';
      boss.stateTime = 0;
      return '';
    }
    boss.state = 'bursting';
    boss.stateTime = 0;
    return '';
  }
  return '';
}

/** Damage the boss. Returns true when the hit killed him. */
export function hurtBoss(boss, damage, fromX, fromY) {
  if (boss.dead) return false;
  boss.hp -= damage;
  boss.flash = 0.12;
  const dx = boss.x - fromX;
  const dy = boss.y - fromY;
  const distance = Math.hypot(dx, dy) || 1;
  boss.knockX += (dx / distance) * 26;
  boss.knockY += (dy / distance) * 26;
  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.dead = true;
    return true;
  }
  return false;
}
