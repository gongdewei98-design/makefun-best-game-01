// The world: everything that is true about a run, and the one step that advances it. It
// owns the dungeon, the player, the monsters, the boss, the projectiles and the camera, and
// turns the loop's input into movement, combat, pickups, floor changes and the run's end.
// Screens (title, play, paused, over, win) live in main.js; the world only reports what
// happened through its returned events.

import { FIELD, FLOOR_COUNT, FLOOR_NAMES, GOLD, TILE } from './config.js';
import { generateDungeon, randomFloorPoint } from './dungeon.js';
import { createPlayer, updatePlayer } from './player.js';
import { createEnemy, spawnFloorEnemies, updateEnemy } from './enemies.js';
import { BOSS_ATTACK_BURST, BOSS_ATTACK_SLAM, BOSS_ATTACK_SUMMON, bossPhase, createBoss, updateBoss } from './boss.js';
import { unclaimedRelics } from './relics.js';
import {
  COMBAT_BOSS_DEAD, COMBAT_HIT, COMBAT_KILL, COMBAT_PLAYER_DEAD, COMBAT_PLAYER_HURT,
  fireBossBurst, resolveContact, resolveSlam, resolveSwing, tryFireBolt, updateProjectiles,
} from './combat.js';
import { addShake, addText, addToast, spawnBurst } from './effects.js';

export const EVENT_NONE = 0;
export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_PLAYER_HURT = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_FLOOR = 32;
export const EVENT_RELIC = 64;
export const EVENT_PICKUP = 128;

export function createWorld(random) {
  const world = {
    random,
    floor: 1,
    dungeon: null,
    player: null,
    enemies: [],
    boss: null,
    projectiles: [],
    gold: [],
    pedestalRelic: null,
    pedestalTaken: false,
    camera: { x: 0, y: 0 },
    time: 0,
    runTime: 0,
    stairsTimer: 0,
    transitioning: 0,
    transitionTo: 0,
    won: false,
    lost: false,
    attract: false,
    runStats: null,
  };

  function snapCamera() {
    const { player, dungeon } = world;
    const maxX = Math.max(0, dungeon.width * TILE - FIELD.width);
    const maxY = Math.max(0, dungeon.height * TILE - FIELD.height);
    world.camera.x = Math.max(0, Math.min(maxX, player.x - FIELD.width / 2));
    world.camera.y = Math.max(0, Math.min(maxY, player.y - FIELD.height / 2));
  }

  function startFloor(floor, freshPlayer) {
    world.floor = floor;
    world.dungeon = generateDungeon(random, floor);
    if (freshPlayer || !world.player) {
      world.player = createPlayer(world.dungeon.playerSpawn.x, world.dungeon.playerSpawn.y);
    } else {
      world.player.x = world.dungeon.playerSpawn.x;
      world.player.y = world.dungeon.playerSpawn.y;
      world.player.invulnerable = 1;
    }
    world.enemies = floor === FLOOR_COUNT ? [] : spawnFloorEnemies(random, world.dungeon, floor);
    world.boss = floor === FLOOR_COUNT ? createBoss(world.dungeon.bossSpawn.x, world.dungeon.bossSpawn.y) : null;
    world.projectiles = [];
    world.gold = world.dungeon.gold.map((pile) => ({ ...pile }));
    world.pedestalTaken = false;
    world.pedestalRelic = null;
    if (floor < FLOOR_COUNT && world.dungeon.pedestal) {
      const remaining = unclaimedRelics(random, world.player.relics);
      if (remaining.length > 0) world.pedestalRelic = remaining[0];
    }
    world.stairsTimer = 0;
    world.transitioning = 0;
    snapCamera();
  }

  function reset() {
    world.floor = 1;
    world.runTime = 0;
    world.won = false;
    world.lost = false;
    world.attract = false;
    world.runStats = null;
    startFloor(1, true);
  }

  function finishRun(won) {
    const { player } = world;
    world.runStats = {
      score: player.score,
      floor: world.floor,
      kills: player.kills,
      gold: player.gold,
      relics: player.relics.length,
      time: world.runTime,
      won,
    };
  }

  function wander(enemy, dt) {
    if (!enemy.wanderX || Math.hypot(enemy.wanderX - enemy.x, enemy.wanderY - enemy.y) < 24) {
      const spot = randomFloorPoint(random, world.dungeon);
      enemy.wanderX = spot.x;
      enemy.wanderY = spot.y;
    }
    const dx = enemy.wanderX - enemy.x;
    const dy = enemy.wanderY - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / distance) * enemy.speed * 0.35 * dt;
    enemy.y += (dy / distance) * enemy.speed * 0.35 * dt;
  }

  function combatToEvents(combat) {
    let events = EVENT_NONE;
    if (combat & COMBAT_HIT) events |= EVENT_HIT;
    if (combat & COMBAT_KILL) events |= EVENT_KILL;
    if (combat & COMBAT_PLAYER_HURT) events |= EVENT_PLAYER_HURT;
    if (combat & COMBAT_PLAYER_DEAD) events |= EVENT_OVER;
    return events;
  }

  function winRun(fx, audio) {
    if (world.won) return EVENT_NONE;
    const { player } = world;
    world.won = true;
    const timeBonus = Math.max(0, Math.round((900 - world.runTime) * 2));
    player.score += 1000 + timeBonus;
    addToast(fx, 'The Ember King falls!', `Victory bonus +${1000 + timeBonus}`);
    spawnBurst(fx, world.boss.x, world.boss.y, '#ffb347', 60, 380);
    spawnBurst(fx, world.boss.x, world.boss.y, '#ff7a2f', 40, 280);
    addShake(fx, 14);
    audio.victory();
    finishRun(true);
    return EVENT_WIN;
  }

  /**
   * Advance the run one fixed step. `controls` carries the move vector, the aim point in
   * world coordinates, whether the sword is held, and this step's dash and bolt presses.
   * Sounds play here; the returned events tell the loop what changed.
   */
  function step(dt, controls, fx, audio) {
    let events = EVENT_NONE;
    world.time += dt;
    const { player, dungeon } = world;

    if (world.transitioning > 0) {
      world.transitioning -= dt;
      if (world.transitioning <= 0) {
        startFloor(world.transitionTo, false);
        addToast(fx, `Floor ${world.floor} of ${FLOOR_COUNT}`, FLOOR_NAMES[world.floor - 1]);
        events |= EVENT_FLOOR;
      }
      return events;
    }

    if (world.won || world.lost) return events;
    if (!world.attract) world.runTime += dt;

    if (world.attract) {
      for (const enemy of world.enemies) wander(enemy, dt);
      return events;
    }

    const started = updatePlayer(player, controls.move, controls.aim, controls.attackHeld, controls.dash, dt, dungeon);
    if (started === 'swing') {
      audio.swing();
      const combat = resolveSwing(world, fx);
      if (combat & COMBAT_HIT) audio.hit();
      if (combat & COMBAT_KILL) audio.kill();
      if (combat & COMBAT_BOSS_DEAD) events |= winRun(fx, audio);
      events |= combatToEvents(combat);
    } else if (started === 'dash') {
      audio.dash();
      spawnBurst(fx, player.x, player.y, '#ffd166', 6, 120);
    }
    if (controls.bolt && tryFireBolt(world)) audio.bolt();

    for (const enemy of world.enemies) {
      const signal = updateEnemy(enemy, player, dt, dungeon);
      if (signal === 'slam') {
        audio.slam();
        const combat = resolveSlam(world, fx, enemy.x, enemy.y, 84, enemy.damage);
        events |= combatToEvents(combat);
      }
    }

    if (world.boss) {
      const minions = world.enemies.filter((e) => !e.dead).length;
      const signal = updateBoss(world.boss, player, dt, dungeon, minions, random);
      if (signal === 'roar') {
        audio.roar();
        addToast(fx, 'The Ember King wakes!', 'Slay him to win the run');
        addShake(fx, 8);
      } else if (signal === BOSS_ATTACK_BURST) {
        audio.fireball();
        fireBossBurst(world, bossPhase(world.boss) === 2 ? 14 : 10);
      } else if (signal === BOSS_ATTACK_SUMMON) {
        for (let i = 0; i < 3; i += 1) {
          const spot = randomFloorPoint(random, dungeon);
          world.enemies.push(createEnemy('bat', spot.x, spot.y, FLOOR_COUNT));
        }
        addToast(fx, 'The King calls his bats!', '');
      } else if (signal === BOSS_ATTACK_SLAM) {
        audio.slam();
        const combat = resolveSlam(world, fx, world.boss.x, world.boss.y, 120, 18);
        events |= combatToEvents(combat);
      }
    }

    const shotEvents = updateProjectiles(world, fx, dt);
    if (shotEvents & COMBAT_HIT) audio.hit();
    if (shotEvents & COMBAT_KILL) audio.kill();
    if (shotEvents & COMBAT_BOSS_DEAD) events |= winRun(fx, audio);
    events |= combatToEvents(shotEvents);

    const contact = resolveContact(world, fx);
    if (contact & COMBAT_PLAYER_HURT) audio.hurt();
    events |= combatToEvents(contact);

    world.enemies = world.enemies.filter((enemy) => !enemy.dead);

    // Gold and relics are claimed by walking over them.
    for (const pile of world.gold) {
      if (pile.taken) continue;
      if (Math.hypot(pile.x - player.x, pile.y - player.y) > player.radius + 16) continue;
      pile.taken = true;
      player.gold += pile.amount;
      const gained = Math.round(pile.amount * GOLD.scoreEach * (1 + player.scoreBonus));
      player.score += gained;
      addText(fx, pile.x, pile.y - 14, `+${pile.amount} gold`, '#f2b23e', 15);
      audio.pickup();
      events |= EVENT_PICKUP;
    }
    if (world.pedestalRelic && !world.pedestalTaken && dungeon.pedestal) {
      if (Math.hypot(dungeon.pedestal.x - player.x, dungeon.pedestal.y - player.y) < player.radius + 26) {
        world.pedestalTaken = true;
        const relic = world.pedestalRelic;
        player.relics.push(relic.id);
        relic.apply(player);
        player.score += 200;
        addToast(fx, `Relic: ${relic.name}`, relic.blurb);
        spawnBurst(fx, player.x, player.y, relic.color, 18, 220);
        audio.relic();
        events |= EVENT_RELIC;
      }
    }

    // Standing on the stairs descends to the next floor.
    if (world.floor < FLOOR_COUNT && dungeon.stairs) {
      if (Math.hypot(dungeon.stairs.x - player.x, dungeon.stairs.y - player.y) < player.radius + 20) {
        world.stairsTimer += dt;
        if (world.stairsTimer > 0.7) {
          world.transitioning = 0.9;
          world.transitionTo = world.floor + 1;
          audio.stairs();
        }
      } else {
        world.stairsTimer = 0;
      }
    }

    // The camera trails the player and never leaves the dungeon.
    const maxX = Math.max(0, dungeon.width * TILE - FIELD.width);
    const maxY = Math.max(0, dungeon.height * TILE - FIELD.height);
    const targetX = Math.max(0, Math.min(maxX, player.x - FIELD.width / 2));
    const targetY = Math.max(0, Math.min(maxY, player.y - FIELD.height / 2));
    const follow = Math.min(1, dt * 6);
    world.camera.x += (targetX - world.camera.x) * follow;
    world.camera.y += (targetY - world.camera.y) * follow;

    if (player.dead && !world.lost) {
      world.lost = true;
      finishRun(false);
      audio.death();
      spawnBurst(fx, player.x, player.y, '#ff5a4d', 30, 260);
      events |= EVENT_OVER;
    }
    return events;
  }

  world.reset = reset;
  world.startFloor = startFloor;
  world.step = step;
  world.snapCamera = snapCamera;
  reset();
  return world;
}
