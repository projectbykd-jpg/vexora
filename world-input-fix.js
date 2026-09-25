(() => {
  const $ = (id) => document.getElementById(id);
  const pause = $('pausePanel');
  const start = $('startOverlay');
  const inventory = $('inventoryPanel');
  const canvasHost = $('gameCanvas');
  let resumeRequested = false;
  let pauseRequested = false;

  const controls = () => window.__vexoraPointerControls;
  const canvas = () => canvasHost?.querySelector('canvas');

  function hidePause() {
    if (!pause) return;
    pause.hidden = true;
    pause.style.display = 'none';
  }

  function showPause() {
    if (!pause || (inventory && !inventory.hidden) || (start && getComputedStyle(start).display !== 'none')) return;
    pause.hidden = false;
    pause.style.display = 'grid';
  }

  function showCursor() {
    document.documentElement.style.cursor = 'default';
    document.body.style.cursor = 'default';
    if (canvasHost) canvasHost.style.cursor = 'default';
  }

  function hideCursor() {
    document.documentElement.style.cursor = 'none';
    document.body.style.cursor = 'none';
    if (canvasHost) canvasHost.style.cursor = 'none';
  }

  function unlock() {
    try { controls()?.unlock?.(); } catch (_) {}
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (_) {}
  }

  function lock() {
    const c = controls();
    try {
      if (c?.lock) {
        c.lock();
        return;
      }
      canvas()?.requestPointerLock?.();
    } catch (_) {
      try { canvas()?.requestPointerLock?.(); } catch (_) {}
    }
  }

  // The old implementation could show the pause panel while pointer lock was
  // still active. That makes the browser keep the cursor hidden and the panel
  // becomes effectively unclickable. Always release the lock before pausing.
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if (locked) {
      hideCursor();
      if (resumeRequested) {
        resumeRequested = false;
        pauseRequested = false;
        hidePause();
        if (start) start.style.display = 'none';
        if (inventory) inventory.hidden = true;
      }
    } else {
      showCursor();
      if (pauseRequested) {
        pauseRequested = false;
        showPause();
      } else if (!resumeRequested && start && getComputedStyle(start).display === 'none' && inventory?.hidden) {
        showPause();
      }
    }
  }, true);

  // ESC = pause. Release pointer lock first, then show the menu after the
  // browser has processed pointerlockchange.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (start && getComputedStyle(start).display !== 'none') return;
    if (inventory && !inventory.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pauseRequested = true;
    resumeRequested = false;
    unlock();
    setTimeout(showPause, 0);
  }, true);

  // Resume must be handled at capture level so the older click listener cannot
  // race it and immediately reopen the pause screen.
  $('resumeButton')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    resumeRequested = true;
    pauseRequested = false;
    hidePause();
    if (inventory) inventory.hidden = true;
    if (start) start.style.display = 'none';
    lock();
    setTimeout(() => {
      // Some browsers reject a second pointer-lock request. If it was rejected,
      // leave the game unpaused so WASD/build interactions are not trapped by UI.
      if (!document.pointerLockElement && resumeRequested) {
        resumeRequested = false;
        showCursor();
      }
    }, 350);
  }, true);

  $('pauseInventory')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    resumeRequested = false;
    pauseRequested = false;
    unlock();
    hidePause();
    if (inventory) {
      inventory.hidden = false;
      inventory.style.display = 'grid';
    }
  }, true);

  $('pauseExit')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    unlock();
    location.href = './dashboard.html';
  }, true);

  $('closeInventory')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (inventory) inventory.hidden = true;
    showPause();
  }, true);

  // Clicking the actual game canvas should capture the mouse again only when
  // the game is running. This also fixes the "cursor disappeared / nothing
  // responds" state after returning from an overlay.
  canvasHost?.addEventListener('mousedown', (e) => {
    if (e.target?.closest?.('#pausePanel, #inventoryPanel, .game-actions')) return;
    if (start && getComputedStyle(start).display !== 'none' && !pause?.hidden) return;
    if (pause && !pause.hidden) return;
    if (!document.pointerLockElement) lock();
  }, true);

  // Safety net: a visible pause/inventory overlay must never coexist with
  // pointer lock.
  setInterval(() => {
    if ((pause && !pause.hidden) || (inventory && !inventory.hidden) || (start && getComputedStyle(start).display !== 'none')) {
      if (document.pointerLockElement) unlock();
      showCursor();
    }
  }, 200);
})();
