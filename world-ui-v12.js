// VEXORA World UI v12 — interaction polish, compact controls, no cursor trapping.
(() => {
  const $ = id => document.getElementById(id);
  const canvas = () => $('gameCanvas')?.querySelector('canvas');
  const overlayOpen = () => $('startOverlay')?.classList.contains('hidden') === false || $('pausePanel')?.hidden === false || $('inventoryPanel')?.hidden === false || $('chatPanel')?.classList.contains('open');

  const help = document.createElement('div');
  help.className = 'v12-help';
  help.innerHTML = '<b>WASD</b> move <b>MOUSE</b> look <b>SPACE</b> jump <b>LMB</b> mine <b>RMB</b> place <b>E</b> bag <b>ESC</b> menu';
  $('game')?.appendChild(help);

  const modeHint = document.createElement('div');
  modeHint.className = 'v12-mode';
  $('game')?.appendChild(modeHint);

  function updateModeHint() {
    const creative = (($('modeButton')?.textContent || '').toLowerCase().includes('creative'));
    modeHint.textContent = creative ? 'CREATIVE • SPACE ↑   SHIFT ↓   CTRL SPRINT' : 'SURVIVAL • SPACE JUMP   SHIFT SPRINT';
  }

  function showHelp() {
    updateModeHint();
    help.classList.add('show');
    modeHint.classList.add('show');
    clearTimeout(window.__v12HelpTimer);
    window.__v12HelpTimer = setTimeout(() => {
      help.classList.remove('show');
      modeHint.classList.remove('show');
    }, 5200);
  }

  function showCursor() {
    const c = canvas();
    if (c && document.pointerLockElement !== c) c.style.cursor = 'default';
    document.documentElement.style.cursor = 'default';
    document.body.style.cursor = 'default';
  }

  function hideCursor() {
    const c = canvas();
    if (c && document.pointerLockElement === c) c.style.cursor = 'none';
  }

  $('playNow')?.addEventListener('click', () => {
    // world-v11 owns the actual start/camera logic; this only makes the first-use UX explicit.
    setTimeout(showHelp, 80);
  }, true);

  $('modeButton')?.addEventListener('click', () => setTimeout(updateModeHint, 0), true);

  document.addEventListener('pointerlockchange', () => {
    const c = canvas();
    if (!c) return;
    if (document.pointerLockElement === c) {
      hideCursor();
    } else if (!overlayOpen()) {
      showCursor();
      const status = $('status');
      if (status) status.textContent = 'CLICK WORLD TO CONTINUE';
    } else {
      showCursor();
    }
  });

  // UI clicks must never send the mouse back into the game.
  document.addEventListener('pointerdown', e => {
    const c = canvas();
    if (!c) return;
    if (e.target.closest('button,input,.panel,.chat,.topbar,.start-card')) {
      if (document.pointerLockElement === c) document.exitPointerLock();
      showCursor();
    }
  }, true);

  window.addEventListener('blur', () => {
    const c = canvas();
    if (c && document.pointerLockElement === c) document.exitPointerLock();
    showCursor();
  });

  // If the player clicks back into the 3D scene after ESC, let the existing engine capture again.
  $('gameCanvas')?.addEventListener('click', () => {
    if (!overlayOpen()) setTimeout(() => canvas()?.requestPointerLock?.(), 0);
  });
})();
