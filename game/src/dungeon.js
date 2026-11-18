// Dungeon generation: rooms carved into a tile grid and joined by corridors, one layout per
// floor, all from the run's seeded random. Floor 5 is different: a single torch-ringed
// arena where the Ember King waits. Tiles are 0 for wall and 1 for floor; everything the
// game places (stairs, relic pedestal, torches, monster spawns, gold) is picked from the
// rooms, never from a wall.

import { GRID, SPAWN, TILE } from './config.js';
import { chance, int, pick, shuffled } from './random.js';

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;

const ROOM_TRIES = 90;
const ROOM_MIN = 6;
const ROOM_MAX_W = 12;
const ROOM_MAX_H = 9;
const CORRIDOR_WIDTH = 2;

function tileIndex(dungeon, tx, ty) {
  return ty * dungeon.width + tx;
}

export function tileAt(dungeon, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= dungeon.width || ty >= dungeon.height) return TILE_WALL;
  return dungeon.tiles[tileIndex(dungeon, tx, ty)];
}

export function isWallAtPixel(dungeon, x, y) {
  return tileAt(dungeon, Math.floor(x / TILE), Math.floor(y / TILE)) === TILE_WALL;
}

export function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function carveRoom(dungeon, room) {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      dungeon.tiles[tileIndex(dungeon, x, y)] = TILE_FLOOR;
    }
  }
}

function carveCorridor(dungeon, from, to) {
  let x = from.x;
  let y = from.y;
  const carve = (cx, cy) => {
    for (let dy = 0; dy < CORRIDOR_WIDTH; dy += 1) {
      for (let dx = 0; dx < CORRIDOR_WIDTH; dx += 1) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx > 0 && ty > 0 && tx < dungeon.width - 1 && ty < dungeon.height - 1) {
          dungeon.tiles[tileIndex(dungeon, tx, ty)] = TILE_FLOOR;
        }
      }
    }
  };
  while (x !== to.x) {
    carve(x, y);
    x += Math.sign(to.x - x);
  }
  while (y !== to.y) {
    carve(x, y);
    y += Math.sign(to.y - y);
  }
  carve(x, y);
}

function roomsOverlap(a, b) {
  return a.x < b.x + b.width + 1 && a.x + a.width + 1 > b.x && a.y < b.y + b.height + 1 && a.y + a.height + 1 > b.y;
}

function randomPointInRoom(random, room, margin = 1) {
  return {
    x: int(random, room.x + margin, room.x + room.width - 1 - margin),
    y: int(random, room.y + margin, room.y + room.height - 1 - margin),
  };
}

/** Wall tiles that face a floor tile, for torch placement. */
function torchSpots(dungeon, random) {
  const spots = [];
  for (let y = 1; y < dungeon.height - 1; y += 1) {
    for (let x = 1; x < dungeon.width - 1; x += 1) {
      if (tileAt(dungeon, x, y) !== TILE_WALL) continue;
      if (tileAt(dungeon, x, y + 1) !== TILE_FLOOR) continue;
      if (chance(random, 0.16)) spots.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
    }
  }
  return spots;
}

function goldPiles(random, rooms, count) {
  const piles = [];
  for (let i = 0; i < count; i += 1) {
    const room = pick(random, rooms);
    const spot = randomPointInRoom(random, room);
    piles.push({ ...tileCenter(spot.x, spot.y), amount: int(random, 10, 26), taken: false });
  }
  return piles;
}

/** Build one floor's dungeon. `floor` is 1-based; floor 5 is the boss arena. */
export function generateDungeon(random, floor) {
  const dungeon = {
    width: GRID.width,
    height: GRID.height,
    tiles: new Uint8Array(GRID.width * GRID.height),
    rooms: [],
    stairs: null,
    pedestal: null,
    torches: [],
    spawns: [],
    gold: [],
    arena: floor === 5,
    bossSpawn: null,
  };

  if (floor === 5) {
    const arena = { x: 8, y: 5, width: 40, height: 26 };
    carveRoom(dungeon, arena);
    dungeon.rooms.push(arena);
    // Pillars break the arena into cover and lanes.
    const pillars = [
      { x: 16, y: 11 }, { x: 38, y: 11 }, { x: 16, y: 23 }, { x: 38, y: 23 },
      { x: 27, y: 9 }, { x: 27, y: 25 },
    ];
    for (const p of pillars) {
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          dungeon.tiles[tileIndex(dungeon, p.x + dx, p.y + dy)] = TILE_WALL;
        }
      }
    }
    const bossTile = tileCenter(27, 12);
    dungeon.bossSpawn = bossTile;
    dungeon.playerSpawn = tileCenter(27, 27);
    // A ring of torches around the arena's edge.
    for (let x = 9; x < 48; x += 6) {
      dungeon.torches.push({ x: x * TILE + TILE / 2, y: 6 * TILE });
      dungeon.torches.push({ x: x * TILE + TILE / 2, y: 30 * TILE });
    }
    for (let y = 7; y < 30; y += 6) {
      dungeon.torches.push({ x: 9 * TILE, y: y * TILE + TILE / 2 });
      dungeon.torches.push({ x: 47 * TILE, y: y * TILE + TILE / 2 });
    }
    return dungeon;
  }

  for (let attempt = 0; attempt < ROOM_TRIES && dungeon.rooms.length < 9; attempt += 1) {
    const width = int(random, ROOM_MIN, ROOM_MAX_W);
    const height = int(random, ROOM_MIN, ROOM_MAX_H);
    const room = {
      x: int(random, 2, GRID.width - width - 2),
      y: int(random, 2, GRID.height - height - 2),
      width,
      height,
    };
    if (dungeon.rooms.some((other) => roomsOverlap(room, other))) continue;
    dungeon.rooms.push(room);
    carveRoom(dungeon, room);
  }
  // Join the rooms in a chain, then add two shortcut corridors for loops.
  const centres = dungeon.rooms.map((r) => ({
    x: r.x + Math.floor(r.width / 2),
    y: r.y + Math.floor(r.height / 2),
  }));
  for (let i = 1; i < centres.length; i += 1) carveCorridor(dungeon, centres[i - 1], centres[i]);
  if (centres.length > 3) {
    carveCorridor(dungeon, centres[0], centres[centres.length - 1]);
    carveCorridor(dungeon, centres[1], centres[centres.length - 2]);
  }

  const spawnRoom = dungeon.rooms[0];
  dungeon.playerSpawn = tileCenter(
    spawnRoom.x + Math.floor(spawnRoom.width / 2),
    spawnRoom.y + Math.floor(spawnRoom.height / 2),
  );

  // The stairs sit in the room farthest from the spawn, so every floor is a real descent.
  let farthest = dungeon.rooms[1] || spawnRoom;
  let farthestDistance = -1;
  for (const room of dungeon.rooms) {
    const dx = room.x - spawnRoom.x;
    const dy = room.y - spawnRoom.y;
    const distance = dx * dx + dy * dy;
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthest = room;
    }
  }
  const stairTile = randomPointInRoom(random, farthest);
  dungeon.stairs = tileCenter(stairTile.x, stairTile.y);

  // The relic pedestal stands in a room that is neither the spawn nor the stairs room.
  const middleRooms = dungeon.rooms.filter((r) => r !== spawnRoom && r !== farthest);
  if (middleRooms.length > 0) {
    const pedestalTile = randomPointInRoom(random, pick(random, middleRooms));
    dungeon.pedestal = tileCenter(pedestalTile.x, pedestalTile.y);
  }

  dungeon.torches = torchSpots(dungeon, random);

  const spawnCount = SPAWN.base + SPAWN.perFloor * (floor - 1);
  const spawnRooms = shuffled(random, dungeon.rooms.filter((r) => r !== spawnRoom));
  for (let i = 0; i < spawnCount; i += 1) {
    const room = spawnRooms[i % spawnRooms.length];
    const spot = randomPointInRoom(random, room);
    dungeon.spawns.push(tileCenter(spot.x, spot.y));
  }

  dungeon.gold = goldPiles(random, dungeon.rooms, 7 + floor);
  return dungeon;
}

/** Pick a monster kind for one spawn, weighted by floor: golems only appear from floor 2. */
export function pickEnemyKind(random, floor) {
  const roll = random();
  if (floor >= 2 && roll < 0.22) return 'golem';
  if (roll < 0.62) return 'hound';
  return 'bat';
}

/** A random floor tile's centre, for wandering or respawns. */
export function randomFloorPoint(random, dungeon) {
  const room = pick(random, dungeon.rooms);
  const spot = randomPointInRoom(random, room);
  return tileCenter(spot.x, spot.y);
}
