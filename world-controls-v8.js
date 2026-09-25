// VEXORA v8 FPS controls: Minecraft-style mouse look with safe pointer lock.
(() => {
  const canvasHost = document.getElementById('gameCanvas');
  const canvas = canvasHost?.querySelector('canvas');
  if (!canvas) return;

  const getState = () => ({ started: window.vexoraStarted !== false, paused: window.vexoraPaused === true });

  // The existing engine exposes its state through these small bridges below.
  const setCursor = (locked) => {
    document.body.classList.toggle('vexora-pointer-locked', locked);
    canvas.style.cursor = locked ? 'none' : 'default';
  };

  const requestLock = () => {
    if (!document.pointerLockElement && document.activeElement?.tagName !== 'INPUT') {
      try { canvas.requestPointerLock({ unadjustedMovement: false }); } catch { try { canvas.requestPointerLock(); } catch {} }
    }
  };

  canvas.addEventListener('click', () => {
    if (document.getElementById('startOverlay')?.style.display === 'none' &&
        document.getElementById('inventoryPanel')?.hidden !== false &&
        document.getElementById('pausePanel')?.hidden !== false) requestLock();
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    setCursor(locked);
    if (!locked) {
      // Browser ESC releases pointer lock. The base engine handles pause.
      window.dispatchEvent(new CustomEvent('vexora:pointer-unlocked'));
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== canvas) return;
    if (document.getElementById('pausePanel')?.hidden === false || document.getElementById('inventoryPanel')?.hidden === false) return;
    // world-v7.js keeps yaw/pitch private, so use its public camera rotation as the bridge.
    const camera = window.vexoraCamera;
    if (!camera) return;
    const sensitivity = 0.0024;
    camera.rotation.order = 'YXZ';
    camera.rotation.y -= event.movementX * sensitivity;
    camera.rotation.x = Math.max(-1.45, Math.min(1.45, camera.rotation.x - event.movementY * sensitivity));
    window.vexoraSetLook?.(camera.rotation.y, camera.rotation.x);
  });

  window.addEventListener('vexora:game-start', requestLock);
  window.addEventListener('vexora:resume', requestLock);
  window.addEventListener('vexora:menu', () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    setCursor(false);
  });

  // Keep browser cursor available over every UI surface.
  document.addEventListener('mouseenter', () => {
    if (!document.pointerLockElement) setCursor(false);
  });
})();
