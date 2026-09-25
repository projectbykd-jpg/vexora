/* VEXORA WORLD POLISH / INPUT PATCH
   Keeps the existing world engine intact and fixes player-facing controls.
   Creative flight follows Minecraft-style vertical controls:
   SPACE = ascend, SHIFT = descend.
*/
(() => {
  const modeEl = () => document.getElementById('modeButton');
  const isCreative = () => (modeEl()?.textContent || '').trim().toLowerCase() === 'creative';
  let syntheticControl = false;

  function syncControls() {
    const card = document.querySelector('.hud-card.controls');
    if (!card) return;
    card.innerHTML = `
      <span>CONTROLS</span>
      <small><b>WASD</b> move · <b>MOUSE</b> look</small>
      <small><b>SPACE</b> ${isCreative() ? 'fly up' : 'jump'} · <b>SHIFT</b> ${isCreative() ? 'fly down' : 'sprint'}</small>
      <small><b>LMB</b> mine · <b>RMB</b> place</small>
      <small><b>E</b> inventory · <b>T</b> chat · <b>ESC</b> pause</small>`;
  }

  // The existing engine already understands `control` as the downward-flight key.
  // Translate SHIFT into CONTROL only while Creative is active, so the player gets
  // the familiar Minecraft-style SPACE-up / SHIFT-down behavior.
  addEventListener('keydown', e => {
    if (!isCreative() || e.repeat || e.key !== 'Shift' || syntheticControl) return;
    syntheticControl = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', bubbles: true }));
  }, true);

  addEventListener('keyup', e => {
    if (e.key !== 'Shift' || !syntheticControl) return;
    syntheticControl = false;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft', bubbles: true }));
  }, true);

  // Keep the game usable after pointer lock is lost: clicking the canvas again
  // returns control to the game instead of leaving the cursor in an odd state.
  const canvas = () => document.querySelector('#gameCanvas canvas');
  document.addEventListener('click', e => {
    const c = canvas();
    if (!c || e.target !== c) return;
    const start = document.getElementById('startOverlay');
    const modalOpen = document.querySelector('.modal:not([hidden])') || document.querySelector('#chatPanel.open');
    if (start?.style.display === 'none' && !modalOpen && document.pointerLockElement !== c) {
      try { c.requestPointerLock(); } catch (_) {}
      c.style.cursor = 'none';
    }
  });

  const modeButton = document.getElementById('modeButton');
  modeButton?.addEventListener('click', () => setTimeout(syncControls, 0));
  syncControls();
  setInterval(syncControls, 1200);
})();
