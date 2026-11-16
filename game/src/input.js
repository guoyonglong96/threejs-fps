// Keyboard + pointer-lock mouse input. The game asks for the lock on the
// canvas; Esc releases it, and play pauses while it is gone (except in shot
// captures, which never need the lock).
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  let locked = false;
  let dx = 0;
  let dy = 0;
  let firing = false;
  let scoping = false;

  function onKeyDown(e) {
    if (e.code === 'Tab') e.preventDefault();
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!locked) return;
    dx += e.movementX || 0;
    dy += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!locked) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) scoping = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) firing = false;
    if (e.button === 2) scoping = false;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      firing = false;
      scoping = false;
    }
    if (onLockChange) onLockChange(locked);
  }
  function onContext(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContext);

  return {
    keys,
    get firing() { return firing; },
    get scoping() { return scoping; },
    get locked() { return locked; },
    consumeLook() {
      const out = { dx, dy };
      dx = 0;
      dy = 0;
      return out;
    },
    requestLock() {
      if (document.pointerLockElement !== canvas) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch { /* pointer lock unavailable; keyboard still works */ }
      }
    },
    releaseLock() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    pressed(code) {
      if (keys.has(code)) {
        keys.delete(code);
        return true;
      }
      return false;
    },
  };
}
