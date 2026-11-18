// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game over and victory.
//
// ?seed=N fixes the dungeon and the monster placement. ?shot=title|combat|boss|victory
// (with &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_FLOOR, EVENT_OVER, EVENT_RELIC, EVENT_WIN } from './world.js';
import { ACTION_BOLT, ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createEffects, updateEffects } from './effects.js';
import { createAudio } from './audio.js';
import { readBest, recordRun } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const fx = createEffects();
const audio = createAudio();

// Audio needs a user gesture before the browser lets it sound: unlock it on the first one.
const unlockAudio = () => audio.ensure();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

function runShot(name) {
  const scene = stageShot(name, world, fx, audio);
  let painted = 0;
  function paint() {
    updateEffects(fx, STEP, world.camera);
    renderer.draw(world, fx, scene.screen, { score: 0, floor: 0, wins: 0 }, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  world.attract = true;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.attract = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.startAmbient();
    audio.ui();
    announce('Playing. Descend five floors and slay the Ember King.');
  }

  function endRun(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    best = recordRun(best, world.runStats);
    announce(
      won
        ? `Victory! The Ember King falls. Score ${world.runStats.score}.`
        : `The ember claims you on floor ${world.runStats.floor}. Score ${world.runStats.score}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_WIN || screen === SCREEN_PLAY)) {
      startGame();
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function controlsFromInput(actions) {
    const mouse = input.mouse();
    const logical = renderer.toLogical(mouse.x, mouse.y);
    return {
      move: input.move(),
      aim: { x: logical.x + world.camera.x, y: logical.y + world.camera.y },
      attackHeld: input.attacking(),
      dash: Boolean(actions & ACTION_DASH),
      bolt: Boolean(actions & ACTION_BOLT),
    };
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, controlsFromInput(0), fx, audio);
      return;
    }
    const events = world.step(STEP, controlsFromInput(actions), fx, audio);
    if (events & EVENT_WIN) endRun(true);
    else if (events & EVENT_OVER) endRun(false);
    else if (events & EVENT_FLOOR) announce(`Floor ${world.floor}.`);
    else if (events & EVENT_RELIC) announce('Relic claimed.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dt;
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    updateEffects(fx, dt, world.camera);
    renderer.draw(world, fx, screen, best, audio.isMuted());
  }

  // Leaving the tab pauses a running game rather than letting monsters hunt unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberdeep. Press Space or click to descend.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
