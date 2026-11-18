// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred. The dungeon's static tiles are painted
// once per floor onto an offscreen layer; each frame draws the layer, the living things,
// torch glow, a darkness mask with holes of light around the player and the torches, and
// finally the HUD and the screen's panel. Nothing here changes the game state.

import { FIELD, FLOOR_COUNT, FLOOR_NAMES, FONT, PALETTE, TILE } from './config.js';
import { TILE_FLOOR, tileAt } from './dungeon.js';
import { relicById } from './relics.js';
import { bossPhase } from './boss.js';
import { drawFloatingTexts, drawHud, drawToasts, formatNumber, formatTime } from './hud.js';
import { shakeOffset } from './effects.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Deterministic per-tile variation, from the tile's coordinates alone. */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  let staticLayer = null;
  let staticDungeon = null;
  const mask = document.createElement('canvas');
  mask.width = FIELD.width;
  mask.height = FIELD.height;
  const maskCtx = mask.getContext('2d');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight = 'normal') {
    const key = `${weight}-${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight === 'bold' ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRectPath(x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  /** Paint the dungeon's unchanging tiles once, onto an offscreen layer. */
  function buildStaticLayer(dungeon) {
    const layer = document.createElement('canvas');
    layer.width = dungeon.width * TILE;
    layer.height = dungeon.height * TILE;
    const c = layer.getContext('2d');
    for (let ty = 0; ty < dungeon.height; ty += 1) {
      for (let tx = 0; tx < dungeon.width; tx += 1) {
        const x = tx * TILE;
        const y = ty * TILE;
        const h = hash2(tx, ty);
        if (tileAt(dungeon, tx, ty) === TILE_FLOOR) {
          c.fillStyle = h < 0.5 ? PALETTE.floorA : PALETTE.floorB;
          c.fillRect(x, y, TILE, TILE);
          if (h > 0.82) {
            c.strokeStyle = PALETTE.floorCrack;
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(x + 6 + h * 8, y + 4);
            c.lineTo(x + 14 + h * 10, y + 18);
            c.lineTo(x + 10 + h * 12, y + 28);
            c.stroke();
          } else if (h > 0.6) {
            c.fillStyle = 'rgba(255, 200, 120, 0.05)';
            c.fillRect(x + 4 + h * 10, y + 6 + h * 8, 10, 8);
          }
          c.strokeStyle = 'rgba(0, 0, 0, 0.25)';
          c.lineWidth = 1;
          c.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else {
          const belowFloor = tileAt(dungeon, tx, ty + 1) === TILE_FLOOR;
          const nearFloor =
            belowFloor ||
            tileAt(dungeon, tx, ty - 1) === TILE_FLOOR ||
            tileAt(dungeon, tx - 1, ty) === TILE_FLOOR ||
            tileAt(dungeon, tx + 1, ty) === TILE_FLOOR;
          c.fillStyle = nearFloor ? PALETTE.wallFace : '#150d07';
          c.fillRect(x, y, TILE, TILE);
          if (belowFloor) {
            c.fillStyle = PALETTE.wallTop;
            c.fillRect(x, y, TILE, 9);
            c.fillStyle = 'rgba(255, 190, 110, 0.12)';
            c.fillRect(x, y, TILE, 2);
            c.fillStyle = 'rgba(0, 0, 0, 0.45)';
            c.fillRect(x, y + TILE, TILE, 6);
          }
          if (h > 0.7 && nearFloor) {
            c.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(x + 4, y + 14 + h * 8);
            c.lineTo(x + TILE - 4, y + 14 + h * 8);
            c.stroke();
          }
        }
      }
    }
    return layer;
  }

  function inView(world, x, y, margin) {
    const cam = world.camera;
    return x > cam.x - margin && x < cam.x + FIELD.width + margin && y > cam.y - margin && y < cam.y + FIELD.height + margin;
  }

  function drawTorch(x, y, time, seed) {
    const flicker = 1 + Math.sin(time * 11 + seed * 7) * 0.12 + Math.sin(time * 23 + seed * 13) * 0.06;
    context.fillStyle = '#3a2a16';
    context.fillRect(x - 2, y - 2, 4, 14);
    const flameHeight = 13 * flicker;
    context.fillStyle = PALETTE.ember;
    context.beginPath();
    context.ellipse(x, y - 8, 5, flameHeight / 2 + 3, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.flame;
    context.beginPath();
    context.ellipse(x, y - 7, 2.6, flameHeight / 2, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawStairs(world) {
    const stairs = world.dungeon.stairs;
    if (!stairs) return;
    const pulse = 0.75 + Math.sin(world.time * 3) * 0.25;
    context.fillStyle = '#0d0906';
    context.fillRect(stairs.x - 18, stairs.y - 18, 36, 36);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(stairs.x - 18, stairs.y - 18, 36, 36);
    context.globalAlpha = pulse;
    for (let i = 0; i < 3; i += 1) {
      context.fillStyle = PALETTE.gold;
      context.fillRect(stairs.x - 12 + i * 2, stairs.y - 10 + i * 8, 24 - i * 4, 5);
    }
    context.globalAlpha = 1;
    text('▼', stairs.x, stairs.y + 30, 14, PALETTE.gold, 'center', 'bold');
  }

  function drawPedestal(world) {
    const { dungeon, pedestalRelic, pedestalTaken } = world;
    if (!dungeon.pedestal || !pedestalRelic) return;
    const { x, y } = dungeon.pedestal;
    context.fillStyle = '#3a2a18';
    context.fillRect(x - 12, y - 4, 24, 18);
    context.fillStyle = '#57402a';
    context.fillRect(x - 15, y - 8, 30, 6);
    if (!pedestalTaken) {
      const bob = Math.sin(world.time * 2.4) * 4;
      const glow = 0.7 + Math.sin(world.time * 3) * 0.3;
      context.globalAlpha = glow;
      context.fillStyle = pedestalRelic.color;
      context.beginPath();
      context.arc(x, y - 22 + bob, 10, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = '#1a120a';
      text(pedestalRelic.glyph, x, y - 16 + bob, 13, '#1a120a', 'center', 'bold');
    }
  }

  function drawGold(world) {
    for (const pile of world.gold) {
      if (pile.taken || !inView(world, pile.x, pile.y, 40)) continue;
      const sparkle = 0.6 + Math.sin(world.time * 5 + pile.x) * 0.4;
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(pile.x - 5, pile.y + 2, 4, 0, Math.PI * 2);
      context.arc(pile.x + 5, pile.y + 3, 4, 0, Math.PI * 2);
      context.arc(pile.x, pile.y - 4, 4.5, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = sparkle;
      context.fillStyle = '#fff3d6';
      context.fillRect(pile.x - 1, pile.y - 8, 2, 2);
      context.globalAlpha = 1;
    }
  }

  function drawHealthBar(target, width) {
    if (target.hp >= target.maxHp) return;
    const x = target.x - width / 2;
    const y = target.y - target.radius - 16;
    context.fillStyle = 'rgba(10, 7, 5, 0.8)';
    context.fillRect(x, y, width, 5);
    context.fillStyle = PALETTE.hp;
    context.fillRect(x, y, width * Math.max(0, target.hp / target.maxHp), 5);
  }

  function drawEnemy(enemy, time) {
    if (enemy.dead) return;
    const flash = enemy.flash > 0;
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.beginPath();
    context.ellipse(enemy.x, enemy.y + enemy.radius * 0.8, enemy.radius, enemy.radius * 0.35, 0, 0, Math.PI * 2);
    context.fill();
    if (enemy.kind === 'bat') {
      const flap = Math.sin(time * 18 + enemy.wobble) * 0.7;
      context.fillStyle = flash ? '#ffffff' : PALETTE.bat;
      for (const side of [-1, 1]) {
        context.save();
        context.translate(enemy.x, enemy.y);
        context.rotate(side * (0.5 + flap * 0.4));
        context.beginPath();
        context.ellipse(side * 11, -2, 11, 5, side * 0.4, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      context.beginPath();
      context.arc(enemy.x, enemy.y, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ff3b2f';
      context.fillRect(enemy.x - 4, enemy.y - 2, 3, 3);
      context.fillRect(enemy.x + 2, enemy.y - 2, 3, 3);
    } else if (enemy.kind === 'hound') {
      const stretch = enemy.state === 'lunge' ? 1.25 : 1;
      context.fillStyle = flash ? '#ffffff' : PALETTE.hound;
      context.beginPath();
      context.ellipse(enemy.x, enemy.y, 14 * stretch, 9, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(enemy.x + 11 * stretch, enemy.y - 4, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = flash ? '#ffffff' : '#e5532a';
      context.beginPath();
      context.arc(enemy.x - 12 * stretch, enemy.y - 2, 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd166';
      context.fillRect(enemy.x + 9 * stretch, enemy.y - 6, 3, 3);
    } else {
      // Golem: a blocky rock body that rears up while winding its slam.
      const rear = enemy.state === 'windup' ? -6 : 0;
      context.fillStyle = flash ? '#ffffff' : PALETTE.golem;
      roundRectPath(enemy.x - 17, enemy.y - 18 + rear, 34, 34, 6);
      context.fill();
      context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(enemy.x - 8, enemy.y - 10 + rear);
      context.lineTo(enemy.x - 2, enemy.y + 2 + rear);
      context.lineTo(enemy.x - 8, enemy.y + 12 + rear);
      context.stroke();
      context.fillStyle = flash ? '#ffffff' : PALETTE.ember;
      context.beginPath();
      context.arc(enemy.x, enemy.y - 2 + rear, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ff3b2f';
      context.fillRect(enemy.x - 9, enemy.y - 13 + rear, 4, 4);
      context.fillRect(enemy.x + 5, enemy.y - 13 + rear, 4, 4);
      if (enemy.state === 'windup') {
        context.strokeStyle = 'rgba(255, 90, 42, 0.6)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(enemy.x, enemy.y + 8, 84 * (enemy.stateTime / 0.6), 0, Math.PI * 2);
        context.stroke();
      }
    }
    drawHealthBar(enemy, 30);
  }

  function drawBoss(boss, world) {
    if (!boss || boss.dead) return;
    const { x, y } = boss;
    const phase = bossPhase(boss);
    const flash = boss.flash > 0;
    context.fillStyle = 'rgba(0, 0, 0, 0.4)';
    context.beginPath();
    context.ellipse(x, y + boss.radius * 0.85, boss.radius * 1.1, boss.radius * 0.35, 0, 0, Math.PI * 2);
    context.fill();
    // Charge telegraph: a dashed line along the charge path.
    if (boss.state === 'chargeWindup') {
      context.strokeStyle = 'rgba(255, 90, 42, 0.7)';
      context.lineWidth = 4;
      context.setLineDash([14, 10]);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + boss.chargeX * 340, y + boss.chargeY * 340);
      context.stroke();
      context.setLineDash([]);
    }
    // Slam telegraph: a ring growing to the slam's reach.
    if (boss.state === 'slamming') {
      context.strokeStyle = 'rgba(255, 90, 42, 0.6)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(x, y, 120 * Math.min(1, boss.stateTime / 0.6), 0, Math.PI * 2);
      context.stroke();
    }
    const body = flash ? '#ffffff' : phase === 2 ? '#ff3b2f' : PALETTE.boss;
    // Robe.
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(x - 26, y + 28);
    context.lineTo(x - 18, y - 18);
    context.lineTo(x + 18, y - 18);
    context.lineTo(x + 26, y + 28);
    context.closePath();
    context.fill();
    // Head and crown.
    context.fillStyle = flash ? '#ffffff' : '#ffb347';
    context.beginPath();
    context.arc(x, y - 26, 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.moveTo(x - 13, y - 36);
    context.lineTo(x - 9, y - 48);
    context.lineTo(x - 4, y - 38);
    context.lineTo(x, y - 50);
    context.lineTo(x + 4, y - 38);
    context.lineTo(x + 9, y - 48);
    context.lineTo(x + 13, y - 36);
    context.closePath();
    context.fill();
    // Eyes and ember core.
    context.fillStyle = '#1a0500';
    context.fillRect(x - 8, y - 29, 5, 5);
    context.fillRect(x + 3, y - 29, 5, 5);
    const corePulse = 8 + Math.sin(world.time * 6) * 2;
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.arc(x, y + 4, corePulse, 0, Math.PI * 2);
    context.fill();
    // Horns.
    context.strokeStyle = flash ? '#ffffff' : '#f2b23e';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x - 14, y - 32);
    context.quadraticCurveTo(x - 26, y - 44, x - 24, y - 54);
    context.moveTo(x + 14, y - 32);
    context.quadraticCurveTo(x + 26, y - 44, x + 24, y - 54);
    context.stroke();
  }

  function drawPlayer(player, world) {
    if (player.dead) return;
    const blink = player.invulnerable > 0 && player.dash <= 0 && Math.floor(world.time * 12) % 2 === 0;
    if (blink) return;
    const { x, y } = player;
    const bob = player.moving ? Math.sin(player.walkPhase) * 2 : Math.sin(world.time * 2) * 1;
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.beginPath();
    context.ellipse(x, y + 12, 13, 5, 0, 0, Math.PI * 2);
    context.fill();
    // Dash afterimages.
    if (player.dash > 0) {
      context.globalAlpha = 0.35;
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(x - player.dashX * 22, y - player.dashY * 22, 11, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    // The sword's sweep: a bright arc while the swing lasts.
    if (player.swing > 0) {
      const progress = 1 - player.swing / 0.18;
      const start = player.swingAngle - 0.9 + progress * 1.2;
      context.strokeStyle = 'rgba(255, 243, 214, 0.9)';
      context.lineWidth = 7;
      context.beginPath();
      context.arc(x, y, 58, start, start + 0.9);
      context.stroke();
      context.strokeStyle = 'rgba(255, 179, 71, 0.5)';
      context.lineWidth = 14;
      context.beginPath();
      context.arc(x, y, 58, start, start + 0.9);
      context.stroke();
    }
    // Cloak and hood.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(x - 12, y + 12 + bob);
    context.quadraticCurveTo(x - 13, y - 8 + bob, x, y - 13 + bob);
    context.quadraticCurveTo(x + 13, y - 8 + bob, x + 12, y + 12 + bob);
    context.closePath();
    context.fill();
    context.fillStyle = '#8a6a2f';
    context.beginPath();
    context.arc(x, y - 8 + bob, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1a120a';
    context.beginPath();
    context.arc(x + Math.cos(player.facing) * 2, y - 8 + bob + Math.sin(player.facing) * 2, 5, 0, Math.PI * 2);
    context.fill();
    // The sword at rest, pointing at the aim.
    if (player.swing <= 0) {
      const sx = x + Math.cos(player.facing) * 14;
      const sy = y + Math.sin(player.facing) * 14;
      context.strokeStyle = '#e8e0cc';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(sx, sy);
      context.lineTo(sx + Math.cos(player.facing) * 18, sy + Math.sin(player.facing) * 18);
      context.stroke();
    }
    // Descending progress, above the player.
    if (world.stairsTimer > 0) {
      const fraction = Math.min(1, world.stairsTimer / 0.7);
      context.fillStyle = 'rgba(10, 7, 5, 0.8)';
      context.fillRect(x - 30, y - 42, 60, 8);
      context.fillStyle = PALETTE.gold;
      context.fillRect(x - 30, y - 42, 60 * fraction, 8);
      text('Descending…', x, y - 48, 13, PALETTE.gold, 'center', 'bold');
    }
  }

  function drawProjectiles(world) {
    for (const shot of world.projectiles) {
      const isBolt = shot.from === 'player';
      context.strokeStyle = isBolt ? 'rgba(255, 211, 102, 0.5)' : 'rgba(255, 122, 47, 0.5)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(shot.x - shot.vx * 0.03, shot.y - shot.vy * 0.03);
      context.lineTo(shot.x, shot.y);
      context.stroke();
      context.fillStyle = isBolt ? '#ffd166' : '#ff7a2f';
      context.beginPath();
      context.arc(shot.x, shot.y, isBolt ? 6 : 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff3d6';
      context.beginPath();
      context.arc(shot.x, shot.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(fx) {
    for (const p of fx.particles) {
      const fade = 1 - p.age / p.life;
      context.globalAlpha = Math.max(0, fade);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawGlow(world) {
    context.globalCompositeOperation = 'lighter';
    const glow = (x, y, radius, color, alpha) => {
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.globalAlpha = alpha;
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    };
    for (const torch of world.dungeon.torches) {
      if (!inView(world, torch.x, torch.y, 160)) continue;
      glow(torch.x, torch.y - 6, 130, 'rgba(255, 150, 50, 0.28)', 1);
    }
    glow(world.player.x, world.player.y, 170, 'rgba(255, 190, 90, 0.20)', 1);
    if (world.boss && !world.boss.dead && world.boss.state !== 'dormant') {
      glow(world.boss.x, world.boss.y, 220, 'rgba(255, 80, 30, 0.25)', 1);
    }
    if (world.dungeon.stairs) glow(world.dungeon.stairs.x, world.dungeon.stairs.y, 90, 'rgba(242, 178, 62, 0.20)', 1);
    if (world.dungeon.pedestal && world.pedestalRelic && !world.pedestalTaken) {
      glow(world.dungeon.pedestal.x, world.dungeon.pedestal.y - 20, 90, 'rgba(255, 200, 100, 0.22)', 1);
    }
    context.globalCompositeOperation = 'source-over';
  }

  function buildDarkness(world, alpha, lightScale) {
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.clearRect(0, 0, FIELD.width, FIELD.height);
    maskCtx.fillStyle = `rgba(3, 2, 6, ${alpha})`;
    maskCtx.fillRect(0, 0, FIELD.width, FIELD.height);
    maskCtx.globalCompositeOperation = 'destination-out';
    const hole = (worldX, worldY, radius) => {
      const x = worldX - world.camera.x;
      const y = worldY - world.camera.y;
      if (x < -radius || x > FIELD.width + radius || y < -radius || y > FIELD.height + radius) return;
      const gradient = maskCtx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.85)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      maskCtx.fillStyle = gradient;
      maskCtx.beginPath();
      maskCtx.arc(x, y, radius, 0, Math.PI * 2);
      maskCtx.fill();
    };
    const flicker = 1 + Math.sin(world.time * 9) * 0.03;
    hole(world.player.x, world.player.y, world.player.lightRadius * flicker * lightScale);
    for (const torch of world.dungeon.torches) {
      if (!inView(world, torch.x, torch.y, 140)) continue;
      hole(torch.x, torch.y - 6, 118 * (1 + Math.sin(world.time * 12 + torch.x) * 0.06) * lightScale);
    }
    if (world.boss && !world.boss.dead && world.boss.state !== 'dormant') {
      hole(world.boss.x, world.boss.y, 210);
    }
    if (world.dungeon.stairs) hole(world.dungeon.stairs.x, world.dungeon.stairs.y, 95);
    if (world.dungeon.pedestal && world.pedestalRelic && !world.pedestalTaken) {
      hole(world.dungeon.pedestal.x, world.dungeon.pedestal.y - 20, 95);
    }
    for (const shot of world.projectiles) hole(shot.x, shot.y, 55);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 680;
    const lineHeight = 30;
    const height = 150 + lines.length * lineHeight + 92;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 7, 5, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    roundRectPath(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRectPath(x, y, width, height, 14);
    context.stroke();
    text(title, FIELD.width / 2, y + 72, 46, accent, 'center', 'bold');
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(FIELD.width / 2 - 90, y + 92, 180, 2);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 132 + i * lineHeight, 20, PALETTE.text, 'center');
    }
    const buttonWidth = 420;
    const buttonX = (FIELD.width - buttonWidth) / 2;
    const buttonY = y + height - 68;
    context.fillStyle = '#2b1d10';
    roundRectPath(buttonX, buttonY, buttonWidth, 46, 8);
    context.fill();
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    roundRectPath(buttonX, buttonY, buttonWidth, 46, 8);
    context.stroke();
    text(prompt, FIELD.width / 2, buttonY + 30, 20, PALETTE.gold, 'center', 'bold');
  }

  function drawTitle(world, best) {
    const lines = [
      '',
      'Descend five torch-lit floors. Slay the Ember King.',
      'WASD or arrows to move · Click or Space to swing your sword',
      'Right-click fires an ember bolt · Shift dashes through danger',
      'Claim a relic on every floor — each one changes the run.',
      '',
    ];
    lines[5] = best.score > 0
      ? `Best run: ${formatNumber(best.score)} points · deepest floor ${best.floor}${best.wins > 0 ? ` · ${best.wins} ${best.wins === 1 ? 'victory' : 'victories'}` : ''}`
      : 'No runs yet — the deep is waiting.';
    drawPanel('EMBERDEEP', lines, 'DESCEND — Press Space or Click', PALETTE.gold);
    const panelHeight = 150 + lines.length * 30 + 92;
    const panelY = (FIELD.height - panelHeight) / 2;
    text('A ROGUELIKE DESCENT', FIELD.width / 2, panelY + 118, 16, PALETTE.muted, 'center');
  }

  function drawEndScreen(world, best, won) {
    const stats = world.runStats || {
      score: world.player.score,
      floor: world.floor,
      kills: world.player.kills,
      gold: world.player.gold,
      relics: world.player.relics.length,
      time: world.runTime,
      won,
    };
    const lines = [
      won ? 'The Ember King falls. The deep grows quiet.' : `The deep claims another delver on floor ${stats.floor}.`,
      '',
      `Score  ${formatNumber(stats.score)}${stats.score >= best.score && stats.score > 0 ? '  ★  New best!' : ''}`,
      `Floors cleared  ${won ? FLOOR_COUNT : stats.floor - 1} of ${FLOOR_COUNT}   ·   Monsters slain  ${stats.kills}`,
      `Gold gathered  ${formatNumber(stats.gold)}   ·   Relics claimed  ${stats.relics}   ·   Time  ${formatTime(stats.time)}`,
      `Best score  ${formatNumber(Math.max(best.score, stats.score))}`,
    ];
    drawPanel(
      won ? 'THE EMBER KING FALLS' : 'THE EMBER CLAIMS YOU',
      lines,
      won ? 'PLAY AGAIN — Press Space or Click' : 'TRY AGAIN — Press Space or Click',
      won ? PALETTE.gold : PALETTE.danger,
    );
  }

  /** Paint one frame: the dungeon, the living things, the dark, then the HUD and the screen. */
  function draw(world, fx, screen, best, muted) {
    if (world.dungeon !== staticDungeon) {
      staticLayer = buildStaticLayer(world.dungeon);
      staticDungeon = world.dungeon;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    const shake = shakeOffset(fx);
    context.save();
    context.translate(-world.camera.x + shake.x, -world.camera.y + shake.y);
    context.drawImage(staticLayer, 0, 0);
    drawStairs(world);
    drawPedestal(world);
    drawGold(world);
    for (const torch of world.dungeon.torches) {
      if (inView(world, torch.x, torch.y, 60)) drawTorch(torch.x, torch.y, world.time, torch.x * 0.01 + torch.y);
    }
    for (const enemy of world.enemies) drawEnemy(enemy, world.time);
    drawBoss(world.boss, world);
    drawPlayer(world.player, world);
    drawProjectiles(world);
    drawParticles(fx);
    drawGlow(world);
    context.restore();

    buildDarkness(world, screen === SCREEN_TITLE ? 0.68 : 0.86, screen === SCREEN_TITLE ? 1.5 : 1);
    context.drawImage(mask, 0, 0, FIELD.width, FIELD.height);

    context.save();
    context.translate(-world.camera.x + shake.x, -world.camera.y + shake.y);
    drawFloatingTexts(context, fx, text);
    context.restore();

    if (screen === SCREEN_TITLE) {
      drawTitle(world, best);
      return;
    }
    drawHud(context, world, text, muted);
    drawToasts(context, fx, text);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The deep waits for you.'], 'RESUME — Press P or Click', PALETTE.gold);
    } else if (screen === SCREEN_OVER) {
      drawEndScreen(world, best, false);
    } else if (screen === SCREEN_WIN) {
      drawEndScreen(world, best, true);
    }

    // Floor transitions fade through black.
    if (world.transitioning > 0) {
      const progress = world.transitioning / 0.9;
      context.fillStyle = `rgba(5, 3, 2, ${progress > 0.5 ? (1 - progress) * 2 : progress * 2})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      if (progress < 0.5) {
        text(`Floor ${world.transitionTo} — ${FLOOR_NAMES[world.transitionTo - 1]}`, FIELD.width / 2, FIELD.height / 2, 34, PALETTE.gold, 'center', 'bold');
      }
    }
  }

  /** Canvas CSS pixels (relative to the canvas) to logical playfield coordinates. */
  function toLogical(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (x * (canvas.width / rect.width) - view.x) / view.scale,
      y: (y * (canvas.height / rect.height) - view.y) / view.scale,
    };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical };
}
