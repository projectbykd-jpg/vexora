(() => {
  const $ = (id) => document.getElementById(id);
  const pause = $('pausePanel');
  const start = $('startOverlay');
  const inventory = $('inventoryPanel');
  const canvasHost = $('gameCanvas');

  const getControls = () => window.__vexoraPointerControls;
  const canvas = () => canvasHost?.querySelector('canvas');
  const overlayOpen = () => {
    const visible = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
    return visible(pause) || visible(inventory) || visible(start);
  };

  function showCursor() {
    document.documentElement.style.cursor = 'default';
    document.body.style.cursor = 'default';
    if (canvasHost) canvasHost.style.cursor = 'default';
    const c = canvas();
    if (c) c.style.cursor = 'default';
  }

  function hideCursor() {
    document.documentElement.style.cursor = 'none';
    document.body.style.cursor = 'none';
    if (canvasHost) canvasHost.style.cursor = 'none';
    const c = canvas();
    if (c) c.style.cursor = 'none';
  }

  function hardUnlock() {
    const c = getControls();
    try { c?.unlock?.(); } catch (_) {}
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (_) {}
    showCursor();
  }

  // Patch PointerLockControls once. Any later lock request while an overlay is
  // visible is rejected, so Inventory/Pause can never trap the cursor again.
  const controls = getControls();
  if (controls && !controls.__vexoraInputPatched) {
    const originalLock = controls.lock.bind(controls);
    const originalUnlock = controls.unlock.bind(controls);

    controls.lock = (...args) => {
      if (overlayOpen()) {
        showCursor();
        return;
      }
      return originalLock(...args);
    };

    controls.unlock = (...args) => {
      try { originalUnlock(...args); } catch (_) {}
      try {
        if (document.pointerLockElement) document.exitPointerLock();
      } catch (_) {}
      showCursor();
    };

    controls.__vexoraInputPatched = true;
  }

  function hidePause() {
    if (!pause) return;
    pause.hidden = true;
    pause.style.display = 'none';
  }

  function showPause() {
    if (!pause || (inventory && !inventory.hidden)) return;
    if (start && getComputedStyle(start).display !== 'none') return;
    pause.hidden = false;
    pause.style.display = 'grid';
    hardUnlock();
  }

  function showInventory() {
    hardUnlock();
    hidePause();
    if (inventory) {
      inventory.hidden = false;
      inventory.style.display = 'grid';
    }
    showCursor();
  }

  function hideInventory() {
    hardUnlock();
    if (inventory) {
      inventory.hidden = true;
      inventory.style.display = 'none';
    }
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      if (overlayOpen()) {
        hardUnlock();
        return;
      }
      hideCursor();
      return;
    }

    showCursor();
    // Never create a pause screen while Inventory is open.
    if (inventory && !inventory.hidden) return;
    if (start && getComputedStyle(start).display !== 'none') return;
    if (pause && pause.hidden) showPause();
  }, true);

  // ESC always releases pointer lock first. If Inventory is open, close it and
  // immediately return to the running game instead of trapping the UI.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (inventory && !inventory.hidden) {
        hideInventory();
        const c = getControls();
        if (c && !overlayOpen()) {
          try { c.lock(); } catch (_) {}
        }
        return;
      }
      if (start && getComputedStyle(start).display !== 'none') return;
      hardUnlock();
      showPause();
      return;
    }

    // Release the mouse before the game's own E handler opens Inventory.
    // The game's listener still runs normally and calls renderInventory().
    if (e.key.toLowerCase() === 'e' && !e.repeat) {
      hardUnlock();
    }
  }, true);

  // Same protection for the top-right Inventory button.
  $('inventoryButton')?.addEventListener('pointerdown', () => hardUnlock(), true);
  $('inventoryButton')?.addEventListener('click', () => {
    setTimeout(() => {
      if (inventory && !inventory.hidden) {
        hardUnlock();
        showCursor();
      }
    }, 0);
  }, true);

  // Let the original world script handle these buttons. We only release the
  // mouse before it runs, preventing pointer-lock races without suppressing
  // renderInventory(), resumeGame(), or navigation handlers.
  $('resumeButton')?.addEventListener('pointerdown', () => hardUnlock(), true);
  $('pauseInventory')?.addEventListener('pointerdown', () => hardUnlock(), true);
  $('pauseExit')?.addEventListener('pointerdown', () => hardUnlock(), true);
  $('closeInventory')?.addEventListener('pointerdown', () => hardUnlock(), true);

  // If an overlay is visible, keep the native cursor and force pointer lock
  // off. This repairs the state after browser tab switches as well.
  setInterval(() => {
    if (overlayOpen()) {
      if (document.pointerLockElement) hardUnlock();
      showCursor();
    }
  }, 100);

  window.addEventListener('blur', () => hardUnlock(), true);
})();
