// VEXORA v8: Minecraft-style FPS mouse look layered safely over world-v7.
(() => {
  const host = document.getElementById('gameCanvas');
  const canvas = host?.querySelector('canvas');
  if (!canvas) return;

  let virtualX = innerWidth / 2;
  let virtualY = innerHeight / 2;

  const uiOpen = () => document.getElementById('inventoryPanel')?.hidden === false || document.getElementById('pausePanel')?.hidden === false || document.getElementById('chatPanel')?.classList.contains('open');
  const gameReady = () => document.getElementById('startOverlay')?.style.display === 'none' && !uiOpen();
  const setCursor = locked => {
    document.body.classList.toggle('vexora-pointer-locked', locked);
    canvas.style.cursor = locked ? 'none' : 'default';
  };
  const lock = () => {
    if (!gameReady() || document.pointerLockElement === canvas) return;
    try { canvas.requestPointerLock({ unadjustedMovement: false }); } catch { try { canvas.requestPointerLock(); } catch {} }
  };

  // Minecraft-style: clicking Play enters the world and captures the mouse.
  document.getElementById('playNow')?.addEventListener('click', () => setTimeout(lock, 60), { capture: true });
  document.getElementById('resumeButton')?.addEventListener('click', () => setTimeout(lock, 60), { capture: true });
  canvas.addEventListener('click', () => setTimeout(lock, 0));

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    setCursor(locked);
    if (locked) {
      virtualX = innerWidth / 2;
      virtualY = innerHeight / 2;
      // Make world-v7's existing MMB-look handler active while pointer lock is held.
      canvas.dispatchEvent(new MouseEvent('mousedown', { button: 1, buttons: 4, clientX: virtualX, clientY: virtualY, bubbles: true }));
    } else {
      canvas.dispatchEvent(new MouseEvent('mouseup', { button: 1, buttons: 0, clientX: virtualX, clientY: virtualY, bubbles: true }));
      setCursor(false);
    }
  });

  // Feed pointer-lock movement into world-v7's existing camera handler.
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas || !gameReady()) return;
    virtualX += event.movementX;
    virtualY += event.movementY;
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      clientX: virtualX,
      clientY: virtualY,
      movementX: event.movementX,
      movementY: event.movementY,
      bubbles: true
    }));
  }, true);

  // ESC is the browser's native pointer-lock exit. The base engine also opens pause.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.pointerLockElement === canvas) {
      document.exitPointerLock();
      setCursor(false);
    }
  }, true);

  // Never capture the pointer over menus, chat or inventory.
  ['inventoryButton','closeInventory','chatToggle','chatClose','saveWorld','backHome','modeButton','resumeButton','pauseInventory','pauseExit'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      setCursor(false);
    }, { capture: true });
  });

  addEventListener('blur', () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    setCursor(false);
  });
})();
