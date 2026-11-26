// Merapi Sky Run — keyboard and mouse.
// Stick: arrows or WASD (pitch / roll), Shift / Ctrl throttle, G gear, F flaps,
// Space brake, P pause, R restart, Enter confirm. The mouse steers too: move it and the
// stick follows the pointer away from the centre of the screen.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const keys = new Set();

/** Current stick state, read once per frame by main.js. */
export function createInput(canvas) {
  const input = {
    pitch: 0,
    roll: 0,
    throttle: 0,
    brake: false,
    toggleGear: false,
    toggleFlaps: false,
    mouseX: 0,
    mouseY: 0,
    mouseActive: false,
    actions: 0,
  };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') input.actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') input.actions |= ACTION_PAUSE;
    if (event.code === 'KeyR') input.actions |= ACTION_RESTART;
    if (event.code === 'KeyG') input.toggleGear = true;
    if (event.code === 'KeyF') input.toggleFlaps = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    input.mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    input.mouseActive = true;
  }

  function onMouseDown(event) {
    input.actions |= ACTION_CONFIRM;
    onMouseMove(event);
  }

  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  /** Read the stick for this frame; edge-triggered switches are consumed here. */
  input.poll = function poll() {
    const up = keys.has('KeyW') || keys.has('ArrowUp');
    const down = keys.has('KeyS') || keys.has('ArrowDown');
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    let pitch = (up ? 1 : 0) - (down ? 1 : 0);
    let roll = (right ? 1 : 0) - (left ? 1 : 0);
    if (pitch === 0 && roll === 0 && input.mouseActive) {
      // Mouse stick: up is climb, right is bank right. Dead zone in the middle.
      const dead = 0.08;
      const mx = Math.abs(input.mouseX) < dead ? 0 : input.mouseX;
      const my = Math.abs(input.mouseY) < dead ? 0 : input.mouseY;
      pitch = -my;
      roll = mx;
    }
    const out = {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttle: (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)
        - (keys.has('ControlLeft') || keys.has('ControlRight') ? 1 : 0),
      brake: keys.has('Space'),
      toggleGear: input.toggleGear,
      toggleFlaps: input.toggleFlaps,
    };
    input.toggleGear = false;
    input.toggleFlaps = false;
    return out;
  };

  /** Take and clear the queued one-shot actions. */
  input.takeActions = function takeActions() {
    const taken = input.actions;
    input.actions = 0;
    return taken;
  };

  return input;
}
