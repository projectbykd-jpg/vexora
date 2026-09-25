// VEXORA v9 stability layer. Runs after world-v7/v8 without replacing the game engine.
(() => {
  const canvas = document.querySelector('#gameCanvas canvas');
  if (!canvas) return;

  // Prevent two polling calls from reading the same chat window simultaneously.
  const nativeFetch = window.fetch.bind(window);
  let chatRead = null;
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' && url.includes('/api/chat?worldId=')) {
      if (chatRead) return chatRead.then(response => response.clone());
      const request = nativeFetch(input, init);
      chatRead = request.finally(() => { chatRead = null; });
      return chatRead.then(response => response.clone());
    }
    return nativeFetch(input, init);
  };

  // Remove accidental duplicate DOM rows created by an already-running old tab/poll.
  const chatBox = document.getElementById('worldChatMessages');
  if (chatBox) {
    const recent = new Map();
    const clean = () => {
      const rows = [...chatBox.querySelectorAll('.chat-line')];
      for (const row of rows) {
        const key = row.textContent.replace(/\s+/g, ' ').trim();
        const now = Date.now();
        const previous = recent.get(key);
        if (previous && now - previous < 1200) row.remove();
        else recent.set(key, now);
      }
      for (const [key, time] of recent) if (Date.now() - time > 5000) recent.delete(key);
    };
    new MutationObserver(clean).observe(chatBox, { childList:true });
  }

  // Make the HUD describe the actual Minecraft-style controls.
  const setControlText = () => {
    const action = document.getElementById('actionStatus');
    if (action) action.textContent = 'WORLD LIVE · WASD MOVE · MOUSE LOOK';
    const hint = document.getElementById('targetHint');
    if (hint) hint.textContent = 'WASD move · Mouse look · LMB mine · RMB build · E inventory · T chat';
  };
  setControlText();
  document.getElementById('playNow')?.addEventListener('click', () => setTimeout(setControlText, 80));
  document.getElementById('resumeButton')?.addEventListener('click', () => setTimeout(setControlText, 80));

  // Server-backed playtime: count only active world time, not menus/paused screens.
  let activeSeconds = 0;
  let lastTick = performance.now();
  let lastSend = performance.now();
  const isPlaying = () => {
    const start = document.getElementById('startOverlay');
    const pause = document.getElementById('pausePanel');
    const inventory = document.getElementById('inventoryPanel');
    const chat = document.getElementById('chatPanel');
    return start?.style.display === 'none' && pause?.hidden !== false && inventory?.hidden !== false && !chat?.classList.contains('open');
  };
  const sendPlaytime = (seconds, keepalive=false) => {
    const amount = Math.min(120, Math.max(0, Math.floor(seconds)));
    if (!amount) return Promise.resolve();
    return nativeFetch('/api/activity', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({seconds:amount}), keepalive }).catch(()=>{});
  };
  setInterval(() => {
    const now = performance.now();
    const elapsed = Math.min(10, Math.max(0, (now-lastTick)/1000));
    lastTick = now;
    if (isPlaying()) activeSeconds += elapsed;
    if (now-lastSend >= 30000 && activeSeconds >= 1) {
      const chunk = Math.floor(activeSeconds);
      activeSeconds -= chunk;
      lastSend = now;
      sendPlaytime(chunk);
    }
  }, 5000);
  const flush = () => { if (activeSeconds > 0) sendPlaytime(Math.floor(activeSeconds), true); activeSeconds = 0; };
  addEventListener('pagehide', flush);
  addEventListener('beforeunload', flush);
})();
