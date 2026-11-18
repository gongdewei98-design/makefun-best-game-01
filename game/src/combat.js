// Combat resolution: sword swings, ember bolts, boss fireballs, contact damage and ground
// slams. Nothing here owns the game state; it takes the world in and reports what happened
// through the returned events, so the world can score kills, play sounds and end the run.

import { BOSS, PALETTE, PLAYER } from './config.js';
import { isWallAtPixel } from './dungeon.js';
import { addScore, healPlayer, hurtPlayer } from './player.js';
import { hurtBoss } from './boss.js';
import { hurtEnemy } from './enemies.js';
import { addShake, addText, spawnBurst } from './effects.js';

export const COMBAT_NONE = 0;
export const COMBAT_HIT = 1;
export const COMBAT_KILL = 2;
export const COMBAT_PLAYER_HURT = 4;
export const COMBAT_PLAYER_DEAD = 8;
export const COMBAT_BOSS_DEAD = 16;

export function createProjectile(x, y, angle, speed, damage, from, range) {
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage, from, range, travelled: 0, dead: false };
}

function angleDifference(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** Resolve one sword swing against every monster in the arc. Returns COMBAT_* flags. */
export function resolveSwing(world, fx) {
  const { player, enemies, boss } = world;
  let events = COMBAT_NONE;
  const hitOne = (target, isBoss) => {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > PLAYER.swordRange + target.radius) return;
    if (Math.abs(angleDifference(Math.atan2(dy, dx), player.swingAngle)) > PLAYER.swordArc) return;
    const damage = player.swordDamage;
    const killed = isBoss
      ? hurtBoss(target, damage, player.x, player.y)
      : hurtEnemy(target, damage, player.x, player.y, PLAYER.knockback);
    addText(fx, target.x, target.y - target.radius - 8, String(damage), '#ffd166', 20);
    spawnBurst(fx, target.x, target.y, PALETTE.flame, 6, 140);
    events |= COMBAT_HIT;
    if (killed) {
      events |= COMBAT_KILL;
      if (isBoss) {
        events |= COMBAT_BOSS_DEAD;
      } else {
        const gained = addScore(player, target.score * world.floor);
        player.kills += 1;
        if (player.healOnKill > 0) healPlayer(player, player.healOnKill);
        addText(fx, target.x, target.y - target.radius - 28, `+${gained}`, PALETTE.gold, 16);
        spawnBurst(fx, target.x, target.y, PALETTE.ember, 14, 200);
        world.gold.push({ x: target.x, y: target.y, amount: target.gold, taken: false });
      }
    }
  };
  for (const enemy of enemies) if (!enemy.dead) hitOne(enemy, false);
  if (boss && !boss.dead && boss.state !== 'dormant') hitOne(boss, true);
  return events;
}

/** Fire one ember bolt toward the aim point, if the player has ember and the cooldown is up. */
export function tryFireBolt(world) {
  const { player } = world;
  if (player.dead || player.ember <= 0 || player.boltCooldown > 0) return false;
  player.ember -= 1;
  player.boltCooldown = PLAYER.boltCooldown;
  world.projectiles.push(
    createProjectile(player.x, player.y, player.facing, PLAYER.boltSpeed, PLAYER.boltDamage, 'player', PLAYER.boltRange),
  );
  return true;
}

/** A ring of fireballs from the boss, evenly spaced, with a seeded offset. */
export function fireBossBurst(world, count) {
  const { boss } = world;
  const offset = world.random() * Math.PI * 2;
  for (let i = 0; i < count; i += 1) {
    const angle = offset + (i / count) * Math.PI * 2;
    world.projectiles.push(
      createProjectile(boss.x, boss.y, angle, BOSS.burstSpeed, BOSS.fireballDamage, 'boss', 700),
    );
  }
}

/** Advance all projectiles; resolve wall hits and hits on their targets. */
export function updateProjectiles(world, fx, dt) {
  const { dungeon, player, enemies, boss } = world;
  let events = COMBAT_NONE;
  for (const shot of world.projectiles) {
    if (shot.dead) continue;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.travelled += Math.hypot(shot.vx * dt, shot.vy * dt);
    if (shot.travelled >= shot.range || isWallAtPixel(dungeon, shot.x, shot.y)) {
      shot.dead = true;
      spawnBurst(fx, shot.x, shot.y, shot.from === 'player' ? PALETTE.flame : PALETTE.deepEmber, 5, 120);
      continue;
    }
    if (shot.from === 'player') {
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        if (Math.hypot(enemy.x - shot.x, enemy.y - shot.y) > enemy.radius + 7) continue;
        shot.dead = true;
        const killed = hurtEnemy(enemy, shot.damage, player.x, player.y, 120);
        addText(fx, enemy.x, enemy.y - enemy.radius - 8, String(shot.damage), '#ffd166', 18);
        spawnBurst(fx, enemy.x, enemy.y, PALETTE.flame, 6, 140);
        events |= COMBAT_HIT;
        if (killed) {
          events |= COMBAT_KILL;
          const gained = addScore(player, enemy.score * world.floor);
          player.kills += 1;
          if (player.healOnKill > 0) healPlayer(player, player.healOnKill);
          spawnBurst(fx, enemy.x, enemy.y, PALETTE.ember, 14, 200);
          world.gold.push({ x: enemy.x, y: enemy.y, amount: enemy.gold, taken: false });
        }
        break;
      }
      if (!shot.dead && boss && !boss.dead && boss.state !== 'dormant') {
        if (Math.hypot(boss.x - shot.x, boss.y - shot.y) <= boss.radius + 7) {
          shot.dead = true;
          const killed = hurtBoss(boss, shot.damage, player.x, player.y);
          addText(fx, boss.x, boss.y - boss.radius - 10, String(shot.damage), '#ffd166', 18);
          events |= COMBAT_HIT;
          if (killed) events |= COMBAT_BOSS_DEAD | COMBAT_KILL;
        }
      }
    } else if (!player.dead && Math.hypot(player.x - shot.x, player.y - shot.y) <= player.radius + 7) {
      shot.dead = true;
      const died = hurtPlayer(player, shot.damage);
      spawnBurst(fx, player.x, player.y, PALETTE.danger, 10, 180);
      addShake(fx, 7);
      events |= died ? COMBAT_PLAYER_DEAD : COMBAT_PLAYER_HURT;
    }
  }
  world.projectiles = world.projectiles.filter((shot) => !shot.dead);
  return events;
}

/** Contact damage: any monster touching the player hurts them. */
export function resolveContact(world, fx) {
  const { player, enemies, boss } = world;
  if (player.dead || player.invulnerable > 0) return COMBAT_NONE;
  const touching = (target) =>
    !target.dead && Math.hypot(target.x - player.x, target.y - player.y) < target.radius + player.radius - 2;
  for (const enemy of enemies) {
    if (!touching(enemy)) continue;
    const died = hurtPlayer(player, enemy.damage);
    spawnBurst(fx, player.x, player.y, PALETTE.danger, 10, 180);
    addShake(fx, 6);
    return died ? COMBAT_PLAYER_DEAD : COMBAT_PLAYER_HURT;
  }
  if (boss && !boss.dead && boss.state !== 'dormant' && touching(boss)) {
    const died = hurtPlayer(player, BOSS.damage);
    spawnBurst(fx, player.x, player.y, PALETTE.danger, 10, 180);
    addShake(fx, 8);
    return died ? COMBAT_PLAYER_DEAD : COMBAT_PLAYER_HURT;
  }
  return COMBAT_NONE;
}

/** A ground slam: everything within `radius` of (x, y) takes `damage`. */
export function resolveSlam(world, fx, x, y, radius, damage) {
  const { player } = world;
  spawnBurst(fx, x, y, PALETTE.ember, 22, 260);
  addShake(fx, 10);
  if (player.dead || player.invulnerable > 0) return COMBAT_NONE;
  if (Math.hypot(player.x - x, player.y - y) > radius + player.radius) return COMBAT_NONE;
  const died = hurtPlayer(player, damage);
  return died ? COMBAT_PLAYER_DEAD : COMBAT_PLAYER_HURT;
}
