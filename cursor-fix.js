(() => {
  const $ = (id) => document.getElementById(id);
  const pause = $('pausePanel');
  const start = $('startOverlay');
  const inventory = $('inventoryPanel');
  const shell = $('gameShell');

  const isVisible = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';

  function releasePointerLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (_) {}
    document.documentElement.style.cursor = 'default';
    document.body.style.cursor = 'default';
    if (shell) shell.style.cursor = 'default';
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
    if (pause) pause.hidden = true;
    if (inventory) inventory.hidden = true;
    const controls = window.__vexoraPointerControls;
    if (controls && typeof controls.lock === 'function') controls.lock();
    else document.getElementById('gameCanvas')?.requestPointerLock?.();
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

  // Escape is the primary Minecraft-style pause action. Do not rely on the
  // browser's Pointer Lock timing alone; explicitly release the lock.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setTimeout(pauseSafely, 0);
    }
  }, true);

  // If the pause UI is visible while the browser still owns pointer lock,
  // force-release it. This fixes the stuck "press Esc" state.
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
    if (pause) pause.hidden = true;
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

  $('closeInventory')?.addEventListener('click', () => {
    releasePointerLock();
    if (inventory) inventory.hidden = true;
    if (pause) {
      pause.hidden = false;
      pause.style.display = 'grid';
    }
  }, true);

  // Expose a tiny bridge for the existing game code without replacing it.
  const canvas = $('gameCanvas');
  if (canvas) {
    const observer = new MutationObserver(() => {
      if (isVisible(pause) || isVisible(inventory) || isVisible(start)) releasePointerLock();
    });
    observer.observe(pause || canvas, { attributes: true, attributeFilter: ['hidden', 'style'] });
    if (inventory) observer.observe(inventory, { attributes: true, attributeFilter: ['hidden', 'style'] });
    if (start) observer.observe(start, { attributes: true, attributeFilter: ['hidden', 'style'] });
  }
})();