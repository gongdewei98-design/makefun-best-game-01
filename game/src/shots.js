// The screenshot scenes behind ?shot=title|combat|boss|victory. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (hunt the boss first, orbit its target while swinging, sidestep fireballs and
// charges), so the frame is what a real game looks like and the same seed always gives the
// same frame. The combat and boss scenes start the player mid-run, with the relics and
// score a delver would have earned by then; the victory scene plays the boss fight to its
// real end. A staging death revives the player rather than ending the shot on a corpse.

import { BOSS, STEP } from './config.js';
import { createEnemy } from './enemies.js';
import { relicById } from './relics.js';
import { fireBossBurst, resolveSwing } from './combat.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';

const TITLE_SECONDS = 4;
const COMBAT_SECONDS = 14;
const BOSS_SECONDS = 14;
const VICTORY_LIMIT_SECONDS = 150;
const SAMPLE = STEP;

/**
 * The autopilot: one set of controls per step, from the world alone. It hunts the boss
 * first and other monsters after, orbits its target while swinging (so it rarely takes
 * contact damage), sidesteps fireballs and the King's telegraphed charge, and only flees
 * when badly hurt and cornered.
 */
function createAutopilot() {
  let boltTimer = 0;
  let strafeDir = 1;
  let strafeTimer = 0;
  return function pilot(world, dt) {
    const player = world.player;
    const controls = {
      move: { x: 0, y: 0 },
      aim: { x: player.x, y: player.y - 100 },
      attackHeld: false,
      dash: false,
      bolt: false,
    };
    if (player.dead) return controls;

    // The boss first; otherwise the nearest monster.
    let target = null;
    if (world.boss && !world.boss.dead && world.boss.state !== 'dormant') {
      target = world.boss;
    } else {
      let best = Infinity;
      for (const enemy of world.enemies) {
        if (enemy.dead) continue;
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance < best) {
          best = distance;
          target = enemy;
        }
      }
    }

    // Sidestep a fireball that is about to arrive, perpendicular to its flight.
    for (const shot of world.projectiles) {
      if (shot.from !== 'boss') continue;
      const distance = Math.hypot(shot.x - player.x, shot.y - player.y);
      if (distance > 62) continue;
      const length = Math.hypot(shot.vx, shot.vy) || 1;
      controls.move = { x: (-shot.vy / length) * strafeDir, y: (shot.vx / length) * strafeDir };
      if (distance < 42) controls.dash = true;
      if (target) controls.aim = { x: target.x, y: target.y };
      return controls;
    }

    // Sidestep the King's telegraphed charge.
    if (world.boss && world.boss.state === 'chargeWindup') {
      controls.move = { x: -world.boss.chargeY, y: world.boss.chargeX };
      controls.dash = true;
      controls.aim = { x: world.boss.x, y: world.boss.y };
      return controls;
    }

    if (!target) return controls;
    controls.aim = { x: target.x, y: target.y };
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;

    // Flee only when badly hurt and the target is close.
    if (player.hp < player.maxHp * 0.22 && distance < 110) {
      controls.move = { x: -nx, y: -ny };
      controls.dash = player.dashCooldown <= 0;
      return controls;
    }

    strafeTimer -= dt;
    if (strafeTimer <= 0) {
      strafeTimer = 0.7 + world.random() * 0.6;
      strafeDir = world.random() < 0.5 ? -1 : 1;
    }
    if (distance > 70) {
      // Approach with a slight weave, and bolt from afar.
      controls.move = { x: nx - ny * 0.3 * strafeDir, y: ny + nx * 0.3 * strafeDir };
      boltTimer -= dt;
      if (distance > 170 && boltTimer <= 0) {
        controls.bolt = true;
        boltTimer = 1.1;
      }
    } else {
      // In range: swing while orbiting the target, out of contact reach.
      controls.attackHeld = true;
      controls.move = { x: -ny * strafeDir, y: nx * strafeDir };
    }
    return controls;
  };
}

/** Bring the player back after a staging death, so a shot never ends on a corpse. */
function revive(world) {
  world.player.dead = false;
  world.player.hp = world.player.maxHp;
  world.lost = false;
  world.runStats = null;
}

function idleControls(player) {
  return { move: { x: 0, y: 0 }, aim: { x: player.x, y: player.y - 100 }, attackHeld: false, dash: false, bolt: false };
}

function grantRelics(player, ids) {
  for (const id of ids) {
    const relic = relicById(id);
    if (!relic || player.relics.includes(id)) continue;
    player.relics.push(id);
    relic.apply(player);
  }
}

function stepWorld(world, fx, audio, controls, seconds) {
  let events = 0;
  for (let i = 0; i < seconds / SAMPLE; i += 1) {
    events |= world.step(SAMPLE, controls, fx, audio);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  return events;
}

/** Play the autopilot for `seconds`, reviving the player if staging kills them. */
function playWithPilot(world, fx, audio, pilot, seconds) {
  for (let i = 0; i < seconds / SAMPLE; i += 1) {
    world.step(SAMPLE, pilot(world, SAMPLE), fx, audio);
    if (world.won) return;
    if (world.player.dead) revive(world);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score
 * to show. Any name other than combat, boss or victory is the title scene.
 */
export function stageShot(name, world, fx, audio) {
  const pilot = createAutopilot();
  if (name !== 'combat' && name !== 'boss' && name !== 'victory') {
    world.reset();
    world.attract = true;
    stepWorld(world, fx, audio, idleControls(world.player), TITLE_SECONDS);
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'combat') {
    world.reset();
    grantRelics(world.player, ['heart', 'boots', 'blade']);
    world.player.score = 1250;
    world.player.gold = 180;
    world.player.hp = world.player.maxHp;
    world.startFloor(3, false);
    // A fresh pack closes in around the player for a busy frame.
    const player = world.player;
    const pack = [
      createEnemy('hound', player.x + 120, player.y - 60, 3),
      createEnemy('hound', player.x - 110, player.y + 70, 3),
      createEnemy('bat', player.x + 60, player.y + 110, 3),
      createEnemy('golem', player.x - 170, player.y - 90, 3),
    ];
    world.enemies.push(...pack);
    playWithPilot(world, fx, audio, pilot, COMBAT_SECONDS);
    // Freeze mid-swing: clear the old numbers, pull two survivors into range and
    // land the arc with fresh damage numbers.
    fx.texts.length = 0;
    fx.toasts.length = 0;
    const near = world.enemies.filter((e) => !e.dead).slice(0, 2);
    if (near.length > 0) {
      near[0].x = player.x + 55;
      near[0].y = player.y - 30;
      if (near[1]) {
        near[1].x = player.x - 50;
        near[1].y = player.y + 45;
      }
      player.swing = 0.12;
      player.swingAngle = Math.atan2(near[0].y - player.y, near[0].x - player.x);
      player.facing = player.swingAngle;
      resolveSwing(world, fx);
    }
    stepWorld(world, fx, audio, idleControls(player), 0.05);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'boss') {
    world.reset();
    grantRelics(world.player, ['heart', 'boots', 'blade', 'fang']);
    world.player.score = 3850;
    world.player.gold = 620;
    world.player.hp = world.player.maxHp;
    world.startFloor(5, false);
    // Meet the King halfway across the arena. He is unkillable during the staging
    // fight, so the frame catches the battle mid-swing instead of after it.
    world.player.x = world.dungeon.bossSpawn.x;
    world.player.y = world.dungeon.bossSpawn.y + 300;
    world.boss.maxHp = 5000;
    world.boss.hp = 5000;
    world.snapCamera();
    playWithPilot(world, fx, audio, pilot, BOSS_SECONDS);
    // Freeze mid-fight: the King worn to half health, the player healthy and closing
    // in with a swing, a fresh burst spreading out, and no toasts over the action.
    world.boss.maxHp = BOSS.hp;
    world.boss.hp = Math.round(BOSS.hp * 0.55);
    world.boss.state = 'recover';
    world.boss.stateTime = 0;
    world.player.hp = 85;
    world.player.x = world.boss.x + 85;
    world.player.y = world.boss.y + 40;
    world.player.swing = 0.12;
    world.player.swingAngle = Math.atan2(world.boss.y - world.player.y, world.boss.x - world.player.x);
    world.player.facing = world.player.swingAngle;
    fx.texts.length = 0;
    fx.toasts.length = 0;
    resolveSwing(world, fx);
    fireBossBurst(world, 12);
    stepWorld(world, fx, audio, idleControls(world.player), 0.45);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  // Victory: the autopilot fights the King to the death, with the score of a full run.
  world.reset();
  grantRelics(world.player, ['heart', 'boots', 'blade', 'fang']);
  world.player.score = 3850;
  world.player.gold = 620;
  world.player.kills = 41;
  world.runTime = 504;
  world.startFloor(5, false);
  world.player.x = world.dungeon.bossSpawn.x;
  world.player.y = world.dungeon.bossSpawn.y + 300;
  world.snapCamera();
  playWithPilot(world, fx, audio, pilot, VICTORY_LIMIT_SECONDS);
  if (!world.won) {
    // A last mercy: one hit left, and the pilot lands it.
    world.boss.hp = 1;
    playWithPilot(world, fx, audio, pilot, 15);
  }
  stepWorld(world, fx, audio, idleControls(world.player), 0.4);
  fx.texts.length = 0;
  fx.toasts.length = 0;
  return { screen: SCREEN_WIN, best: 0 };
}
