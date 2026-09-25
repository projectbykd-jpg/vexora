(() => {
  const $ = (id) => document.getElementById(id);
  const pause = $('pausePanel');
  const start = $('startOverlay');
  const inventory = $('inventoryPanel');
  const shell = $('gameShell');
  const gameCanvas = $('gameCanvas');

  const isVisible = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';

  function releasePointerLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (_) {}
    document.documentElement.style.cursor = 'default';
    document.body.style.cursor = 'default';
    if (shell) shell.style.cursor = 'default';
  }

  function requestGamePointerLock() {
    const canvas = gameCanvas?.querySelector('canvas');
    try {
      if (canvas && typeof canvas.requestPointerLock === 'function') {
        canvas.requestPointerLock();
        return;
      }
      if (gameCanvas && typeof gameCanvas.requestPointerLock === 'function') gameCanvas.requestPointerLock();
    } catch (_) {}
  }

  function pauseSafely() {
    releasePointerLock();
    if (start) start.style.display = 'none';
    if (pause && !isVisible(inventory)) {
      pause.hidden = false;
      pause.style.display = 'grid';
    }
  }

  function resumeSafely() {
    if (pause) {
      pause.hidden = true;
      pause.style.display = 'none';
    }
    if (inventory) {
      inventory.hidden = true;
      inventory.style.display = 'none';
    }

    // Prefer the real PointerLockControls bridge when available.
    const controls = window.__vexoraPointerControls;
    if (controls && typeof controls.lock === 'function') controls.lock();
    else requestGamePointerLock();
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      document.documentElement.style.cursor = 'none';
      document.body.style.cursor = 'none';
      if (shell) shell.style.cursor = 'none';
    } else {
      releasePointerLock();
      if (!isVisible(start) && !isVisible(inventory)) {
        if (pause) {
          pause.hidden = false;
          pause.style.display = 'grid';
        }
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setTimeout(pauseSafely, 0);
  }, true);

  setInterval(() => {
    if (isVisible(pause) || isVisible(inventory) || isVisible(start)) {
      if (document.pointerLockElement) releasePointerLock();
    }
  }, 100);

  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (t && t.closest && (t.closest('#pausePanel') || t.closest('#inventoryPanel') || t.closest('.game-actions'))) {
      releasePointerLock();
    }
  }, true);

  $('resumeButton')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resumeSafely();
  }, true);

  $('pauseInventory')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    releasePointerLock();
    if (pause) {
      pause.hidden = true;
      pause.style.display = 'none';
    }
    if (inventory) {
      inventory.hidden = false;
      inventory.style.display = 'grid';
    }
  }, true);

  $('pauseExit')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    releasePointerLock();
    location.href = './dashboard.html';
  }, true);

  $('closeInventory')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    releasePointerLock();
    if (inventory) {
      inventory.hidden = true;
      inventory.style.display = 'none';
    }
    if (pause) {
      pause.hidden = false;
      pause.style.display = 'grid';
    }
  }, true);

  const canvas = $('gameCanvas');
  if (canvas) {
    const observer = new MutationObserver(() => {
      if (isVisible(pause) || isVisible(inventory) || isVisible(start)) releasePointerLock();
    });
    if (pause) observer.observe(pause, { attributes: true, attributeFilter: ['hidden', 'style'] });
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    if (inventory) observer.observe(inventory, { attributes: true, attributeFilter: ['hidden', 'style'] });
    if (start) observer.observe(start, { attributes: true, attributeFilter: ['hidden', 'style'] });
  }
})();
