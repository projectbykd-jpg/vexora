/* VEXORA WORLD INPUT + HUD PATCH
   Compact game UI, clear controls, reliable pointer lock and hotbar shortcuts.
*/
(() => {
  const $ = id => document.getElementById(id);
  const modeEl = () => $('modeButton');
  const isCreative = () => (modeEl()?.textContent || '').trim().toLowerCase() === 'creative';

  function syncControls() {
    const card = document.querySelector('.hud-card.controls');
    if (card) card.innerHTML = `
      <span>CONTROLS</span>
      <small><b>WASD</b> move · <b>MOUSE</b> look</small>
      <small><b>SPACE</b> ${isCreative() ? 'fly up' : 'jump'} · <b>SHIFT</b> ${isCreative() ? 'fly down' : 'sprint'}</small>
      <small><b>LMB</b> mine · <b>RMB</b> place</small>
      <small><b>1–9</b> select · <b>E</b> bag · <b>T</b> chat</small>`;

    const hints = document.querySelector('.control-hints');
    if (hints) hints.innerHTML = isCreative()
      ? '<span><kbd>W A S D</kbd> MOVE</span><span><kbd>MOUSE</kbd> LOOK</span><span><kbd>SPACE</kbd> UP</span><span><kbd>SHIFT</kbd> DOWN</span><span><kbd>LMB</kbd> MINE</span><span><kbd>RMB</kbd> PLACE</span><span><kbd>E</kbd> BAG</span><span><kbd>T</kbd> CHAT</span><span><kbd>ESC</kbd> MENU</span>'
      : '<span><kbd>W A S D</kbd> MOVE</span><span><kbd>MOUSE</kbd> LOOK</span><span><kbd>SPACE</kbd> JUMP</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>LMB</kbd> MINE</span><span><kbd>RMB</kbd> PLACE</span><span><kbd>1–9</kbd> SELECT</span><span><kbd>E</kbd> BAG</span><span><kbd>T</kbd> CHAT</span><span><kbd>ESC</kbd> MENU</span>';
  }

  // The engine listens to Control for Creative downward flight. Keep the visible
  // Minecraft-style SHIFT control without changing the existing engine internals.
  let syntheticControl = false;
  addEventListener('keydown', e => {
    if (!isCreative() || e.repeat || e.key !== 'Shift' || syntheticControl) return;
    syntheticControl = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key:'Control', code:'ControlLeft', bubbles:true }));
  }, true);
  addEventListener('keyup', e => {
    if (e.key !== 'Shift' || !syntheticControl) return;
    syntheticControl = false;
    window.dispatchEvent(new KeyboardEvent('keyup', { key:'Control', code:'ControlLeft', bubbles:true }));
  }, true);

  function canvas(){ return document.querySelector('#gameCanvas canvas'); }
  function lock(){ const c=canvas(); if(!c)return; try{c.requestPointerLock()}catch(_){} }
  function unlock(){ if(document.pointerLockElement) document.exitPointerLock(); const c=canvas(); if(c)c.style.cursor='default'; }

  document.addEventListener('click', e => {
    const c=canvas();
    if(!c || e.target!==c) return;
    const start=$('startOverlay');
    const modalOpen=document.querySelector('.modal:not([hidden])') || document.querySelector('#chatPanel.open');
    if(start?.style.display==='none' && !modalOpen) lock();
  });

  document.addEventListener('pointerlockchange', () => {
    const c=canvas();
    const status=$('actionStatus');
    const locked=document.pointerLockElement===c;
    if(c) c.style.cursor=locked?'none':'default';
    if(status) status.textContent=locked ? (isCreative()?'CREATIVE • SPACE UP • SHIFT DOWN • ESC UNLOCK':'WASD MOVE • MOUSE LOOK • ESC UNLOCK') : 'CLICK WORLD TO PLAY • ESC RELEASES MOUSE';
  });

  // Number keys select the matching hotbar slot. This is how the player should
  // switch blocks without having to click tiny UI buttons.
  addEventListener('keydown', e => {
    if(e.ctrlKey || e.altKey || e.metaKey) return;
    const n=Number(e.key);
    if(n<1 || n>9) return;
    const slots=document.querySelectorAll('.hot-slot');
    if(slots[n-1]) slots[n-1].click();
  }, true);

  // Mouse wheel cycles the hotbar just like a block-building game.
  addEventListener('wheel', e => {
    if(document.pointerLockElement!==canvas()) return;
    const slots=[...document.querySelectorAll('.hot-slot')];
    if(!slots.length)return;
    const current=Math.max(0,slots.findIndex(s=>s.classList.contains('selected')));
    const next=(current+(e.deltaY>0?1:-1)+slots.length)%slots.length;
    slots[next].click();
    e.preventDefault();
  }, {passive:false});

  const modeButton=$('modeButton');
  modeButton?.addEventListener('click',()=>setTimeout(syncControls,0));
  syncControls();
  setInterval(syncControls,1500);
})();
