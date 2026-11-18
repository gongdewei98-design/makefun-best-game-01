// The player: a hooded delver with a sword, a dash and an ember bolt. Movement collides
// against the dungeon's wall tiles as a circle; the dash is a short burst with invulnerability
// frames; the sword swings toward the aim point and the bolt flies at it. Relics mutate
// these numbers through relics.js, never here.

import { PLAYER, TILE } from './config.js';
import { isWallAtPixel } from './dungeon.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    radius: PLAYER.radius,
    speed: PLAYER.speed,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    swordDamage: PLAYER.swordDamage,
    facing: -Math.PI / 2,
    aimX: x,
    aimY: y - 100,
    swing: 0,
    swingAngle: 0,
    swingCooldown: 0,
    dash: 0,
    dashCooldown: 0,
    dashX: 0,
    dashY: 0,
    ember: PLAYER.maxEmber,
    emberTimer: 0,
    boltCooldown: 0,
    invulnerable: 0,
    lightRadius: 270,
    scoreBonus: 0,
    healOnKill: 0,
    relics: [],
    gold: 0,
    score: 0,
    kills: 0,
    dead: false,
    moving: false,
    walkPhase: 0,
  };
}

/** Push a circle out of any wall tile it overlaps. */
function collideCircle(dungeon, body) {
  const left = Math.floor((body.x - body.radius) / TILE);
  const right = Math.floor((body.x + body.radius) / TILE);
  const top = Math.floor((body.y - body.radius) / TILE);
  const bottom = Math.floor((body.y + body.radius) / TILE);
  for (let ty = top; ty <= bottom; ty += 1) {
    for (let tx = left; tx <= right; tx += 1) {
      if (!isWallAtPixel(dungeon, tx * TILE + TILE / 2, ty * TILE + TILE / 2)) continue;
      const nearestX = Math.max(tx * TILE, Math.min(body.x, tx * TILE + TILE));
      const nearestY = Math.max(ty * TILE, Math.min(body.y, ty * TILE + TILE));
      const dx = body.x - nearestX;
      const dy = body.y - nearestY;
      const distance = Math.hypot(dx, dy);
      if (distance >= body.radius || distance === 0) continue;
      const push = body.radius - distance;
      body.x += (dx / distance) * push;
      body.y += (dy / distance) * push;
    }
  }
}

export function moveBody(dungeon, body, dx, dy) {
  body.x += dx;
  collideCircle(dungeon, body);
  body.y += dy;
  collideCircle(dungeon, body);
}

/**
 * Advance the player one step. `move` is the held-keys vector, `aim` the mouse in world
 * coordinates, `attackHeld` whether the sword button is down, `wantDash` a dash press this
 * step. Returns 'swing' when a swing starts, 'dash' when a dash starts, else ''.
 */
export function updatePlayer(player, move, aim, attackHeld, wantDash, dt, dungeon) {
  if (player.dead) return '';
  player.aimX = aim.x;
  player.aimY = aim.y;
  player.facing = Math.atan2(aim.y - player.y, aim.x - player.x);

  player.swingCooldown = Math.max(0, player.swingCooldown - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.boltCooldown = Math.max(0, player.boltCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.swing = Math.max(0, player.swing - dt);

  if (player.ember < PLAYER.maxEmber) {
    player.emberTimer += dt;
    if (player.emberTimer >= PLAYER.emberRecharge) {
      player.emberTimer = 0;
      player.ember += 1;
    }
  }

  let started = '';
  if (wantDash && player.dashCooldown <= 0 && player.dash <= 0) {
    const length = Math.hypot(move.x, move.y);
    const dx = length > 0 ? move.x / length : Math.cos(player.facing);
    const dy = length > 0 ? move.y / length : Math.sin(player.facing);
    player.dash = PLAYER.dashTime;
    player.dashCooldown = PLAYER.dashCooldown;
    player.dashX = dx;
    player.dashY = dy;
    player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.05);
    started = 'dash';
  }

  if (player.dash > 0) {
    player.dash -= dt;
    moveBody(dungeon, player, player.dashX * PLAYER.dashSpeed * dt, player.dashY * PLAYER.dashSpeed * dt);
    player.moving = true;
  } else {
    const length = Math.hypot(move.x, move.y);
    if (length > 0) {
      const nx = move.x / length;
      const ny = move.y / length;
      moveBody(dungeon, player, nx * player.speed * dt, ny * player.speed * dt);
      player.moving = true;
      player.walkPhase += dt * 10;
    } else {
      player.moving = false;
    }
  }

  if (attackHeld && player.swingCooldown <= 0 && player.dash <= 0) {
    player.swing = PLAYER.swordTime;
    player.swingAngle = player.facing;
    player.swingCooldown = PLAYER.swordCooldown;
    started = 'swing';
  }
  return started;
}

/** Damage the player, honouring invulnerability. Returns true when the hit killed them. */
export function hurtPlayer(player, damage) {
  if (player.dead || player.invulnerable > 0 || player.dash > 0) return false;
  player.hp -= damage;
  player.invulnerable = PLAYER.invulnerable;
  if (player.hp <= 0) {
    player.hp = 0;
    player.dead = true;
    return true;
  }
  return false;
}

export function healPlayer(player, amount) {
  if (player.dead) return;
  player.hp = Math.min(player.maxHp, player.hp + amount);
}

/** Add score, with the Greed Charm's bonus folded in. */
export function addScore(player, base) {
  const gained = Math.round(base * (1 + player.scoreBonus));
  player.score += gained;
  return gained;
}
