// Nusantara Skies — keyboard and mouse input. One clear job: turn raw
// browser events into a small, stable input state the game logic reads.
// No game logic lives here.
export function createInput(canvas) {
  const keys = new Set();
  const state = {
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false,
    pausePressed: false,
    mutePressed: false,
    restartPressed: false,
    startPressed: false,
    // mouse / touch drag steering, -1..1 across the canvas
    pointerX: null,
    pointerDown: false,
    // buttons the player clicked (checked and cleared by the game)
    clicked: null,
  };

  const KEYMAP = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    Space: 'boost',
    ShiftLeft: 'boost',
    ShiftRight: 'boost',
    Enter: 'startPressed',
    KeyP: 'pausePressed',
    KeyM: 'mutePressed',
    KeyR: 'restartPressed',
  };

  function refreshHeld() {
    state.left = keys.has('left');
    state.right = keys.has('right');
    state.up = keys.has('up');
    state.down = keys.has('down');
    state.boost = keys.has('boost');
  }

  window.addEventListener('keydown', (event) => {
    const action = KEYMAP[event.code];
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    if (action === 'startPressed') state.startPressed = true;
    else if (action === 'pausePressed') state.pausePressed = true;
    else if (action === 'mutePressed') state.mutePressed = true;
    else if (action === 'restartPressed') state.restartPressed = true;
    else keys.add(action);
    refreshHeld();
  });

  window.addEventListener('keyup', (event) => {
    const action = KEYMAP[event.code];
    if (!action) return;
    keys.delete(action);
    refreshHeld();
  });

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width;
  }

  canvas.addEventListener('pointerdown', (event) => {
    state.pointerDown = true;
    state.pointerX = pointerPosition(event);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (state.pointerDown) state.pointerX = pointerPosition(event);
  });
  window.addEventListener('pointerup', () => {
    state.pointerDown = false;
    state.pointerX = null;
  });

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    state.clicked = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  });

  // One-shot flags the game consumes each tick.
  state.consumePresses = function consumePresses() {
    const out = {
      start: state.startPressed,
      pause: state.pausePressed,
      mute: state.mutePressed,
      restart: state.restartPressed,
      click: state.clicked,
    };
    state.startPressed = false;
    state.pausePressed = false;
    state.mutePressed = false;
    state.restartPressed = false;
    state.clicked = null;
    return out;
  };

  return state;
}
