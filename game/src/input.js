// Keyboard and pointer input. Held keys give a movement vector; the sword swings while its
// key or button is held; one-shot presses (start or restart, pause, dash, bolt, mute) are
// queued as bit flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. The mouse position is kept in canvas CSS pixels; the loop
// turns it into world coordinates with the renderer's view and the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_BOLT = 8;
export const ACTION_MUTE = 16;
export const ACTION_RESTART = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const ATTACK = new Set(['Space', 'KeyJ']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'KeyK']);
const BOLT = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, attack: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function press(code, repeat) {
    if (UP.has(code)) held.up = true;
    else if (DOWN.has(code)) held.down = true;
    else if (LEFT.has(code)) held.left = true;
    else if (RIGHT.has(code)) held.right = true;
    else if (ATTACK.has(code)) {
      held.attack = true;
      if (!repeat) actions |= ACTION_CONFIRM;
    } else if (CONFIRM.has(code)) {
      if (!repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(code)) {
      if (!repeat) actions |= ACTION_PAUSE;
    } else if (DASH.has(code)) {
      if (!repeat) actions |= ACTION_DASH;
    } else if (BOLT.has(code)) {
      if (!repeat) actions |= ACTION_BOLT;
    } else if (MUTE.has(code)) {
      if (!repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(code)) {
      if (!repeat) actions |= ACTION_RESTART;
    } else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (press(event.code, event.repeat)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (ATTACK.has(event.code)) held.attack = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.attack = false;
    mouseDown = false;
  });

  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_CONFIRM;
    } else if (event.button === 2) {
      actions |= ACTION_BOLT;
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** The movement vector from held keys, each component -1, 0 or 1. */
    move() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** True while the sword button or key is held. */
    attacking() {
      return held.attack || mouseDown;
    },
    /** The mouse position in canvas CSS pixels. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
