// The dungeon's monsters. Three kinds, each with its own way of hunting: bats wobble toward
// the player and bite on contact, hounds stalk and then lunge, golems lumber in and slam the
// ground. Health, damage and speed scale with the floor. An enemy is a small state machine
// driven by distance to the player and its own timers.

import { ENEMIES, FLOOR_SCALING } from './config.js';
import { moveBody } from './player.js';
import { pickEnemyKind } from './dungeon.js';

export function createEnemy(kind, x, y, floor) {
  const base = ENEMIES[kind];
  const growth = floor - 1;
  const hp = Math.round(base.hp * (1 + FLOOR_SCALING.hp * growth));
  return {
    kind,
    x,
    y,
    hp,
    maxHp: hp,
    speed: base.speed * (1 + FLOOR_SCALING.speed * growth),
    damage: Math.round(base.damage * (1 + FLOOR_SCALING.damage * growth)),
    radius: base.radius,
    score: base.score,
    gold: base.gold,
    state: 'chase',
    stateTime: 0,
    lungeX: 0,
    lungeY: 0,
    wobble: Math.random() * Math.PI * 2,
    flash: 0,
    knockX: 0,
    knockY: 0,
    dead: false,
  };
}

/** One monster per dungeon spawn point, kinds weighted by floor. */
export function spawnFloorEnemies(random, dungeon, floor) {
  return dungeon.spawns.map((spawn) => createEnemy(pickEnemyKind(random, floor), spawn.x, spawn.y, floor));
}

function seek(enemy, player, speed, dt, dungeon) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  moveBody(dungeon, enemy, (dx / distance) * speed * dt, (dy / distance) * speed * dt);
}

function applyKnockback(enemy, dt, dungeon) {
  if (enemy.knockX === 0 && enemy.knockY === 0) return;
  moveBody(dungeon, enemy, enemy.knockX * dt, enemy.knockY * dt);
  const decay = Math.max(0, 1 - dt * 8);
  enemy.knockX *= decay;
  enemy.knockY *= decay;
  if (Math.abs(enemy.knockX) < 4 && Math.abs(enemy.knockY) < 4) {
    enemy.knockX = 0;
    enemy.knockY = 0;
  }
}

/**
 * Advance one enemy. Returns 'slam' when a golem's slam lands this step (the world resolves
 * its area damage), else ''.
 */
export function updateEnemy(enemy, player, dt, dungeon) {
  if (enemy.dead) return '';
  enemy.flash = Math.max(0, enemy.flash - dt);
  enemy.stateTime += dt;
  applyKnockback(enemy, dt, dungeon);
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;

  if (enemy.kind === 'bat') {
    enemy.wobble += dt * 6;
    const wobbleX = Math.cos(enemy.wobble) * 0.5;
    const wobbleY = Math.sin(enemy.wobble * 1.3) * 0.5;
    const nx = dx / distance + wobbleX * 0.4;
    const ny = dy / distance + wobbleY * 0.4;
    const length = Math.hypot(nx, ny) || 1;
    moveBody(dungeon, enemy, (nx / length) * enemy.speed * dt, (ny / length) * enemy.speed * dt);
    return '';
  }

  if (enemy.kind === 'hound') {
    if (enemy.state === 'lunge') {
      moveBody(dungeon, enemy, enemy.lungeX * enemy.speed * 2.6 * dt, enemy.lungeY * enemy.speed * 2.6 * dt);
      if (enemy.stateTime > 0.35) {
        enemy.state = 'chase';
        enemy.stateTime = 0;
      }
      return '';
    }
    if (distance < 190 && distance > 60 && enemy.stateTime > 1.1) {
      enemy.state = 'lunge';
      enemy.stateTime = 0;
      enemy.lungeX = dx / distance;
      enemy.lungeY = dy / distance;
      return '';
    }
    seek(enemy, player, enemy.speed, dt, dungeon);
    return '';
  }

  // Golem: wind up within reach, then slam.
  if (enemy.state === 'windup') {
    if (enemy.stateTime > 0.6) {
      enemy.state = 'recover';
      enemy.stateTime = 0;
      return 'slam';
    }
    return '';
  }
  if (enemy.state === 'recover') {
    if (enemy.stateTime > 0.9) {
      enemy.state = 'chase';
      enemy.stateTime = 0;
    }
    return '';
  }
  if (distance < 96) {
    enemy.state = 'windup';
    enemy.stateTime = 0;
    return '';
  }
  seek(enemy, player, enemy.speed, dt, dungeon);
  return '';
}

/** Damage an enemy. Returns true when the hit killed it. */
export function hurtEnemy(enemy, damage, fromX, fromY, knockback) {
  if (enemy.dead) return false;
  enemy.hp -= damage;
  enemy.flash = 0.12;
  const dx = enemy.x - fromX;
  const dy = enemy.y - fromY;
  const distance = Math.hypot(dx, dy) || 1;
  const weight = enemy.kind === 'golem' ? 0.35 : 1;
  enemy.knockX += (dx / distance) * knockback * weight;
  enemy.knockY += (dy / distance) * knockback * weight;
  if (enemy.hp <= 0) {
    enemy.dead = true;
    return true;
  }
  return false;
}
