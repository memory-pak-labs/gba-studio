export function createPointerInput() {
  const contacts = new Map(), taps = new Map();
  return {
    press(pointerId, key) { contacts.set(pointerId, key); taps.set(key, 2); },
    release(pointerId) { contacts.delete(pointerId); },
    clear() { contacts.clear(); taps.clear(); },
    sample(frames) {
      const keys = [...contacts.values(), ...taps.keys()].reduce((mask, key) => mask | key, 0);
      if (frames > 0) for (const [key, remaining] of taps) {
        if (remaining <= frames) taps.delete(key); else taps.set(key, remaining - frames);
      }
      return keys;
    }
  };
}

export function bindTouchControls({ controls, input, onInteraction = () => {}, windowObject = window }) {
  const cleanup = [], buttons = [...controls.querySelectorAll('[data-gba-key]')];
  const listen = (target, type, callback) => { target.addEventListener(type, callback); cleanup.push(() => target.removeEventListener(type, callback)); };
  const clear = () => { input.clear(); for (const button of buttons) button.dataset.pressed = 'false'; };
  for (const button of buttons) {
    const key = Number(button.dataset.gbaKey);
    if (!Number.isInteger(key) || key <= 0 || key > 512) continue;
    listen(button, 'pointerdown', event => {
      event.preventDefault();
      input.press(event.pointerId, key);
      button.dataset.pressed = 'true';
      try { button.setPointerCapture(event.pointerId); } catch { /* A cancelled pointer can lose capture before this call. */ }
      onInteraction();
    });
    const release = event => { input.release(event.pointerId); button.dataset.pressed = 'false'; };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, name, release);
    listen(button, 'keydown', event => {
      if (!['Enter', 'Space'].includes(event.code)) return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) { input.press('keyboard', key); input.release('keyboard'); onInteraction(); }
    });
  }
  listen(windowObject, 'blur', clear);
  return () => { clear(); for (const remove of cleanup) remove(); };
}
