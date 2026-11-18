// Juice: particles, floating damage numbers, screen shake and toast messages. Particles
// live in world coordinates and are drawn under the darkness mask; texts and toasts live
// in screen space and are drawn over it. Everything here is cosmetic: no particle ever
// changes the game state.

import { FIELD } from './config.js';

const MAX_PARTICLES = 320;

export function createEffects() {
  return {
    particles: [],
    texts: [],
    toasts: [],
    shake: 0,
    emberTimer: 0,
  };
}

export function spawnBurst(fx, x, y, color, count, speed = 160) {
  for (let i = 0; i < count; i += 1) {
    if (fx.particles.length >= MAX_PARTICLES) return;
    const angle = Math.random() * Math.PI * 2;
    const power = speed * (0.3 + Math.random() * 0.9);
    fx.particles.push({
      x,
      y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power - 40,
      life: 0.35 + Math.random() * 0.4,
      age: 0,
      size: 2 + Math.random() * 3.5,
      color,
      gravity: 320,
    });
  }
}

/** A slow ember mote drifting upward, for the torch-lit atmosphere. */
export function spawnEmber(fx, x, y) {
  if (fx.particles.length >= MAX_PARTICLES) return;
  fx.particles.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 14,
    vy: -18 - Math.random() * 26,
    life: 1.6 + Math.random() * 1.6,
    age: 0,
    size: 1 + Math.random() * 2,
    color: Math.random() < 0.5 ? '#ffb347' : '#ff7a2f',
    gravity: -8,
  });
}

export function addText(fx, x, y, text, color = '#f5e8d0', size = 18) {
  fx.texts.push({ x, y, text, color, size, age: 0, life: 0.9 });
}

export function addToast(fx, title, sub = '') {
  fx.toasts.push({ title, sub, age: 0, life: 2.6 });
  if (fx.toasts.length > 3) fx.toasts.shift();
}

export function addShake(fx, amount) {
  fx.shake = Math.min(16, fx.shake + amount);
}

export function updateEffects(fx, dt, camera) {
  fx.shake = Math.max(0, fx.shake - dt * 34);
  for (let i = fx.particles.length - 1; i >= 0; i -= 1) {
    const p = fx.particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      fx.particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = fx.texts.length - 1; i >= 0; i -= 1) {
    const t = fx.texts[i];
    t.age += dt;
    t.y -= dt * 34;
    if (t.age >= t.life) fx.texts.splice(i, 1);
  }
  for (let i = fx.toasts.length - 1; i >= 0; i -= 1) {
    const t = fx.toasts[i];
    t.age += dt;
    if (t.age >= t.life) fx.toasts.splice(i, 1);
  }
  // Ambient embers drift up through the visible dungeon.
  fx.emberTimer -= dt;
  if (fx.emberTimer <= 0 && camera) {
    fx.emberTimer = 0.12;
    spawnEmber(
      fx,
      camera.x + Math.random() * FIELD.width,
      camera.y + FIELD.height * (0.4 + Math.random() * 0.6),
    );
  }
}

/** The current shake offset, in pixels: random each frame, decaying with the shake. */
export function shakeOffset(fx) {
  if (fx.shake <= 0) return { x: 0, y: 0 };
  return {
    x: (Math.random() - 0.5) * fx.shake,
    y: (Math.random() - 0.5) * fx.shake,
  };
}
