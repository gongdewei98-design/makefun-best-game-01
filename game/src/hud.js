// The HUD: everything the player needs at a glance, drawn in screen space over the
// dungeon — health, floor, score, gold, carried relics, dash and ember charges, the boss
// bar, toast messages and the controls hint. Floating damage numbers live in world space
// and are drawn by the renderer after the darkness mask, so they stay readable.

import { FIELD, FLOOR_COUNT, FLOOR_NAMES, PALETTE, PLAYER } from './config.js';
import { relicById } from './relics.js';
import { bossPhase } from './boss.js';

const BAR_HEIGHT = 58;
const HP_SEGMENTS = 10;

function formatNumber(value) {
  return value.toLocaleString('en-US');
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function drawHud(ctx, world, text, muted) {
  const { player, floor, boss } = world;

  // The top bar: a translucent strip so the HUD reads over any dungeon.
  ctx.fillStyle = 'rgba(10, 7, 5, 0.72)';
  ctx.fillRect(0, 0, FIELD.width, BAR_HEIGHT);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, BAR_HEIGHT - 2, FIELD.width, 2);

  // Health: a segmented bar with the numbers beside it.
  const hpX = 20;
  const hpY = 18;
  const hpWidth = 240;
  const hpHeight = 22;
  ctx.fillStyle = PALETTE.hpBack;
  ctx.fillRect(hpX, hpY, hpWidth, hpHeight);
  const hpFraction = Math.max(0, player.hp / player.maxHp);
  const gradient = ctx.createLinearGradient(hpX, 0, hpX + hpWidth, 0);
  gradient.addColorStop(0, '#ff5a4d');
  gradient.addColorStop(1, '#ffb347');
  ctx.fillStyle = gradient;
  ctx.fillRect(hpX, hpY, hpWidth * hpFraction, hpHeight);
  ctx.fillStyle = 'rgba(10, 7, 5, 0.85)';
  for (let i = 1; i < HP_SEGMENTS; i += 1) {
    ctx.fillRect(hpX + (hpWidth / HP_SEGMENTS) * i, hpY, 2, hpHeight);
  }
  text(`HP ${Math.ceil(player.hp)} / ${player.maxHp}`, hpX + hpWidth + 12, hpY + 17, 18, PALETTE.text, 'left');

  // Floor, centred.
  text(`FLOOR ${floor} / ${FLOOR_COUNT}`, FIELD.width / 2, 24, 22, PALETTE.gold, 'center', 'bold');
  text(FLOOR_NAMES[floor - 1], FIELD.width / 2, 48, 16, PALETTE.muted, 'center');

  // Score and gold, right.
  text(`SCORE ${formatNumber(player.score)}`, FIELD.width - 20, 26, 22, PALETTE.text, 'right', 'bold');
  text(`GOLD ${formatNumber(player.gold)}`, FIELD.width - 20, 50, 16, PALETTE.gold, 'right');

  // Relics carried, as coloured chips under the health bar.
  for (let i = 0; i < player.relics.length; i += 1) {
    const relic = relicById(player.relics[i]);
    if (!relic) continue;
    const x = 20 + i * 36;
    const y = BAR_HEIGHT + 10;
    ctx.fillStyle = 'rgba(10, 7, 5, 0.72)';
    ctx.fillRect(x, y, 30, 30);
    ctx.strokeStyle = relic.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 28, 28);
    text(relic.glyph, x + 15, y + 21, 17, relic.color, 'center', 'bold');
  }
  if (player.relics.length > 0) {
    text('RELICS', 20, BAR_HEIGHT + 58, 12, PALETTE.muted, 'left');
  }

  // Dash and ember charges, bottom left.
  const dashReady = player.dashCooldown <= 0;
  ctx.fillStyle = 'rgba(10, 7, 5, 0.72)';
  ctx.fillRect(20, FIELD.height - 52, 150, 34);
  ctx.fillStyle = dashReady ? PALETTE.player : PALETTE.dim;
  ctx.fillRect(20, FIELD.height - 52, 150 * (dashReady ? 1 : 1 - player.dashCooldown / 1.1), 34);
  text('DASH [Shift]', 95, FIELD.height - 29, 15, dashReady ? '#1a120a' : PALETTE.text, 'center', 'bold');
  for (let i = 0; i < PLAYER.maxEmber; i += 1) {
    ctx.fillStyle = i < player.ember ? PALETTE.flame : PALETTE.hpBack;
    ctx.beginPath();
    ctx.arc(196 + i * 26, FIELD.height - 35, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  text('EMBER', 282, FIELD.height - 29, 14, PALETTE.muted, 'left');

  // The boss bar, when the King is awake.
  if (boss && !boss.dead && boss.state !== 'dormant') {
    const barWidth = 520;
    const barX = (FIELD.width - barWidth) / 2;
    const barY = BAR_HEIGHT + 14;
    text('THE EMBER KING', FIELD.width / 2, barY - 4, 18, PALETTE.boss, 'center', 'bold');
    ctx.fillStyle = PALETTE.hpBack;
    ctx.fillRect(barX, barY + 10, barWidth, 16);
    ctx.fillStyle = bossPhase(boss) === 2 ? '#ff3b2f' : PALETTE.deepEmber;
    ctx.fillRect(barX, barY + 10, barWidth * Math.max(0, boss.hp / boss.maxHp), 16);
    if (bossPhase(boss) === 2) {
      text('BURNING RAGE', FIELD.width / 2, barY + 44, 13, PALETTE.danger, 'center', 'bold');
    }
  }

  // Controls hint, bottom centre; the mute state shows at the right.
  text('WASD move  ·  Click / Space sword  ·  Right-click ember bolt  ·  Shift dash  ·  P pause', FIELD.width / 2, FIELD.height - 14, 14, PALETTE.muted, 'center');
  if (muted) text('MUTED [M]', FIELD.width - 20, FIELD.height - 14, 14, PALETTE.muted, 'right');
}

/** Toast messages: a title and a smaller line, fading out from the top centre. */
export function drawToasts(ctx, fx, text) {
  for (let i = 0; i < fx.toasts.length; i += 1) {
    const toast = fx.toasts[i];
    const fade = toast.age > toast.life - 0.6 ? (toast.life - toast.age) / 0.6 : 1;
    const y = 152 + i * 52;
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = 'rgba(10, 7, 5, 0.78)';
    const width = Math.max(280, toast.title.length * 13 + 40);
    ctx.fillRect((FIELD.width - width) / 2, y, width, toast.sub ? 46 : 34);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect((FIELD.width - width) / 2, y, width, toast.sub ? 46 : 34);
    text(toast.title, FIELD.width / 2, y + 23, 19, PALETTE.gold, 'center', 'bold');
    if (toast.sub) text(toast.sub, FIELD.width / 2, y + 42, 14, PALETTE.text, 'center');
    ctx.globalAlpha = 1;
  }
}

/** Floating damage numbers and pickup text, in world coordinates. */
export function drawFloatingTexts(ctx, fx, text) {
  for (const item of fx.texts) {
    const fade = item.age > item.life - 0.3 ? (item.life - item.age) / 0.3 : 1;
    ctx.globalAlpha = Math.max(0, fade);
    text(item.text, item.x, item.y, item.size, item.color, 'center', 'bold');
    ctx.globalAlpha = 1;
  }
}

export { formatNumber, formatTime };
