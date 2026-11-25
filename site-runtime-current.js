
    // Bundled Runtime Supervisor (kept first so all app modules share its lifecycle service).
/* CURIOID Runtime Supervisor 1.0.0
 * Explicit, bounded lifecycle scopes for mounted projects and operating-system apps.
 * This manager does not monkey-patch browser APIs or claim to sandbox same-origin code.
 */
(function installCurioidRuntimeSupervisor(root) {
  'use strict';
  const win = root && root.window ? root.window : root;
  const doc = win && win.document;
  if (!win || !doc) return;
  if (win.CurioidRuntimeSupervisor && win.CurioidRuntimeSupervisor.version === '1.0.0') return;

  const VERSION = '1.0.0';
  const MAX_ACTIVE_SCOPES = 256;
  const MAX_CLEANUPS_PER_SCOPE = 1024;
  const MAX_HISTORY = 64;
  const MAX_TIMER_DELAY = 2147483647;
  const activeScopes = new Map();
  const history = [];
  let scopeSequence = 0;
  let cleanupFailureCount = 0;
  let totalScopesCreated = 0;
  let totalScopesDisposed = 0;

  const safeLabel = (value, fallback) => {
    let raw = '';
    try { raw = String(value == null ? '' : value); } catch (_) { raw = ''; }
    const text = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 96);
    return text || fallback;
  };
  const report = (error, context) => {
    try { win.console && win.console.error && win.console.error('CURIOID runtime cleanup issue:', context, error); } catch (_) {}
  };

  function makeStatus() {
    let activeResources = 0;
    let suspendedScopes = 0;
    const owners = [];
    for (const scope of activeScopes.values()) {
      const status = scope.getStatus();
      activeResources += status.activeResources;
      if (status.state === 'suspended') suspendedScopes += 1;
      owners.push({ id: status.id, owner: status.owner, state: status.state, activeResources: status.activeResources, cleanupFailures: status.cleanupFailures });
    }
    return Object.freeze({
      version: VERSION,
      activeScopes: activeScopes.size,
      activeResources,
      suspendedScopes,
      totalScopesCreated,
      totalScopesDisposed,
      cleanupFailures: cleanupFailureCount,
      scopes: owners.slice(0, 64)
    });
  }

  function publishStatus() {
    const status = makeStatus();
    try {
      if (typeof win.CustomEvent === 'function') {
        win.dispatchEvent(new win.CustomEvent('curioid:runtime-change', { detail: status }));
      }
    } catch (_) {}
    renderStatus(status);
  }

  let latestStatus = null;
  let statusRefreshQueued = false;
  function renderStatus(status) {
    latestStatus = status;
    const update = () => {
      statusRefreshQueued = false;
      const current = latestStatus;
      if (!current) return;
      const node = doc.querySelector('[data-control-runtime]');
      if (!node) return;
      node.textContent = `${current.activeScopes} active · ${current.activeResources} tracked`;
      node.title = `${current.cleanupFailures} cleanup issue(s) recorded since this page loaded. Runtime scopes: ${current.activeScopes}.`;
      node.setAttribute('aria-label', `${current.activeScopes} active application runtime scopes and ${current.activeResources} tracked resources`);
    };
    if (doc.readyState === 'loading') {
      // Many resources can register during startup. Keep one pending DOM-ready
      // callback and render the newest status instead of retaining stale closures.
      if (!statusRefreshQueued) {
        statusRefreshQueued = true;
        doc.addEventListener('DOMContentLoaded', update, { once: true });
      }
      return;
    }
    update();
  }

  function createScope(options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (activeScopes.size >= MAX_ACTIVE_SCOPES) {
      throw new RangeError(`CURIOID has reached its ${MAX_ACTIVE_SCOPES}-scope runtime limit. Close an unused project and try again.`);
    }
    const owner = safeLabel(settings.owner || settings.name, 'unnamed-project');
    const requestedId = safeLabel(settings.id, '');
    const id = requestedId || `runtime-${Date.now().toString(36)}-${(++scopeSequence).toString(36)}`;
    if (activeScopes.has(id)) throw new Error(`A runtime scope named “${id}” is already active.`);

    const controller = new win.AbortController();
    const entries = [];
    const cleanupEntries = new WeakMap();
    const createdAt = Date.now();
    let state = 'active';
    let disposedAt = null;
    let cleanupFailures = 0;

    function runEntry(entry) {
      if (!entry || !entry.active) return false;
      entry.active = false;
      try {
        entry.cleanup();
      } catch (error) {
        cleanupFailures += 1;
        cleanupFailureCount += 1;
        report(error, `${owner}/${entry.kind}`);
      }
      if (state === 'active') publishStatus();
      return true;
    }

    function addCleanup(cleanup, kind, lifecycle = null) {
      if (typeof cleanup !== 'function') throw new TypeError('A runtime cleanup must be a function.');
      const previous = cleanupEntries.get(cleanup);
      if (state === 'active' && previous && previous.active) return () => runEntry(previous);
      const entry = { cleanup, kind: safeLabel(kind, 'custom'), active: true, suspend: typeof lifecycle?.suspend === 'function' ? lifecycle.suspend : null, resume: typeof lifecycle?.resume === 'function' ? lifecycle.resume : null };
      if (state === 'disposed' || state === 'disposing') {
        runEntry(entry);
        return () => false;
      }
      // Fired timers and manually released resources must not consume the
      // long-lived scope quota forever. Compact only when the bounded stack
      // reaches its limit, keeping normal registration inexpensive.
      if (entries.length >= MAX_CLEANUPS_PER_SCOPE) {
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          if (!entries[index].active) entries.splice(index, 1);
        }
      }
      if (entries.length >= MAX_CLEANUPS_PER_SCOPE) {
        throw new RangeError(`Runtime scope “${owner}” reached its ${MAX_CLEANUPS_PER_SCOPE}-resource limit.`);
      }
      entries.push(entry);
      cleanupEntries.set(cleanup, entry);
      publishStatus();
      return () => runEntry(entry);
    }

    function listen(target, type, callback, options) {
      if (!target || typeof target.addEventListener !== 'function' || typeof callback !== 'function') {
        throw new TypeError('Runtime listen() requires an EventTarget and a callback.');
      }
      const opts = typeof options === 'boolean' ? { capture: options } : (options || {});
      const capture = Boolean(opts.capture);
      let attached = false;
      const listener = function runtimeScopedListener(event) {
        if (state !== 'active' || !attached) return;
        if (opts.once) release();
        return callback.call(this, event);
      };
      // Reserve ownership before touching the external resource. A scope-limit
      // error must never leave an untracked EventTarget listener behind.
      const release = addCleanup(() => {
        if (!attached) return;
        attached = false;
        target.removeEventListener(type, listener, capture);
      }, 'listener');
      try {
        attached = true;
        target.addEventListener(type, listener, { capture, passive: Boolean(opts.passive) });
      } catch (error) {
        release();
        throw error;
      }
      return release;
    }

    function timeout(callback, delay) {
      if (typeof callback !== 'function') throw new TypeError('Runtime timeout() requires a function callback.');
      const numeric = Number(delay);
      const safeDelay = Math.max(0, Math.min(MAX_TIMER_DELAY, Number.isFinite(numeric) ? numeric : 0));
      let timer = null, remaining = safeDelay, startedAt = 0, active = true;
      const clear = () => {
        if (timer !== null) { win.clearTimeout(timer); timer = null; remaining = Math.max(0, remaining - Math.max(0, Date.now() - startedAt)); }
      };
      let release = () => false;
      const start = () => {
        if (!active || timer !== null || state !== 'active') return;
        startedAt = Date.now();
        try {
          timer = win.setTimeout(() => {
            timer = null; remaining = 0;
            if (state === 'suspended') return;
            active = false; release();
            if (state === 'active') { try { callback(); } catch (error) { report(error, `${owner}/timeout callback`); } }
          }, remaining);
        } catch (error) { release(); throw error; }
      };
      release = addCleanup(() => { active = false; clear(); }, 'timeout', { suspend: clear, resume: start });
      start();
      return release;
    }

    function interval(callback, delay) {
      if (typeof callback !== 'function') throw new TypeError('Runtime interval() requires a function callback.');
      const numeric = Number(delay);
      const safeDelay = Math.max(1, Math.min(MAX_TIMER_DELAY, Number.isFinite(numeric) ? numeric : 1));
      let active = true, timer = null;
      const stop = () => { if (timer !== null) { win.clearInterval(timer); timer = null; } };
      const start = () => {
        if (!active || timer !== null || state !== 'active') return;
        try { timer = win.setInterval(() => {
          if (state !== 'active' || !active) return;
          try { callback(); } catch (error) { report(error, `${owner}/interval callback`); }
        }, safeDelay); } catch (error) { release(); throw error; }
      };
      const release = addCleanup(() => { if (!active) return; active = false; stop(); }, 'interval', { suspend: stop, resume: start });
      start();
      return release;
    }

    function animationFrame(callback) {
      if (typeof callback !== 'function') throw new TypeError('Runtime animationFrame() requires a function callback.');
      if (typeof win.requestAnimationFrame !== 'function') return timeout(() => callback(Date.now()), 16);
      let frame = null, active = true;
      const stop = () => { if (frame !== null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frame); frame = null; };
      const schedule = () => { if (active && state === 'active' && frame === null) frame = win.requestAnimationFrame(tick); };
      const tick = timestamp => {
        frame = null;
        if (!active || state !== 'active') return;
        try { if (callback(timestamp) !== false && active && state === 'active') schedule(); else release(); }
        catch (error) { report(error, `${owner}/animation frame callback`); release(); }
      };
      const release = addCleanup(() => { active = false; stop(); }, 'animation-frame', { suspend: stop, resume: schedule });
      schedule();
      return release;
    }

    function trackObserver(observer) {
      if (!observer || typeof observer.disconnect !== 'function') throw new TypeError('trackObserver() requires an observer with disconnect().');
      try { addCleanup(() => observer.disconnect(), 'observer'); }
      catch (error) { try { observer.disconnect(); } catch (cleanupError) { report(cleanupError, `${owner}/untracked observer disconnect`); } throw error; }
      return observer;
    }

    function trackObjectURL(url) {
      const value = String(url || '');
      if (!value.startsWith('blob:')) throw new TypeError('Only blob: object URLs can be tracked by a runtime scope.');
      try { addCleanup(() => { try { win.URL.revokeObjectURL(value); } catch (_) {} }, 'object-url'); }
      catch (error) { try { win.URL.revokeObjectURL(value); } catch (cleanupError) { report(cleanupError, `${owner}/untracked object URL revoke`); } throw error; }
      return value;
    }

    function createObjectURL(blob) {
      if (!win.URL || typeof win.URL.createObjectURL !== 'function') throw new Error('Object URLs are unavailable in this browser.');
      return trackObjectURL(win.URL.createObjectURL(blob));
    }

    function trackWorker(worker) {
      if (!worker || typeof worker.terminate !== 'function') throw new TypeError('trackWorker() requires a Worker-like object with terminate().');
      try { addCleanup(() => worker.terminate(), 'worker'); }
      catch (error) { try { worker.terminate(); } catch (cleanupError) { report(cleanupError, `${owner}/untracked worker terminate`); } throw error; }
      return worker;
    }

    function trackAudioContext(context) {
      if (!context || typeof context.close !== 'function') throw new TypeError('trackAudioContext() requires an AudioContext-like object.');
      const close = () => {
        try {
          if (context.state !== 'closed') {
            const result = context.close();
            if (result && typeof result.catch === 'function') result.catch(error => report(error, `${owner}/audio-context close`));
          }
        } catch (error) { report(error, `${owner}/audio-context close`); }
      };
      let resumeAfterSuspend = false;
      const suspend = () => {
        if (context.state !== 'running' || typeof context.suspend !== 'function') return;
        resumeAfterSuspend = true;
        try { const result = context.suspend(); if (result?.catch) result.catch(error => report(error, `${owner}/audio-context suspend`)); }
        catch (error) { report(error, `${owner}/audio-context suspend`); }
      };
      const resume = () => {
        if (!resumeAfterSuspend || context.state !== 'suspended' || typeof context.resume !== 'function') return;
        resumeAfterSuspend = false;
        try { const result = context.resume(); if (result?.catch) result.catch(error => report(error, `${owner}/audio-context resume`)); }
        catch (error) { report(error, `${owner}/audio-context resume`); }
      };
      try { addCleanup(close, 'audio-context', { suspend, resume }); }
      catch (error) { close(); throw error; }
      return context;
    }

    function trackAbortController(childController) {
      const value = childController || new win.AbortController();
      if (!value || typeof value.abort !== 'function') throw new TypeError('trackAbortController() requires an AbortController-like object.');
      const abort = () => { if (!value.signal || !value.signal.aborted) value.abort(); };
      try { addCleanup(abort, 'abort-controller'); }
      catch (error) { try { abort(); } catch (cleanupError) { report(cleanupError, `${owner}/untracked abort-controller abort`); } throw error; }
      return value;
    }

    function suspend(reason = 'inactive') {
      if (state !== 'active') return false;
      state = 'suspended';
      for (const entry of entries) {
        if (!entry.active || typeof entry.suspend !== 'function') continue;
        try { entry.suspend(reason); } catch (error) { report(error, `${owner}/${entry.kind} suspend`); }
      }
      publishStatus();
      return true;
    }

    function resume(reason = 'active') {
      if (state !== 'suspended') return false;
      state = 'active';
      for (const entry of entries) {
        if (!entry.active || typeof entry.resume !== 'function') continue;
        try { entry.resume(reason); } catch (error) { report(error, `${owner}/${entry.kind} resume`); }
      }
      publishStatus();
      return true;
    }

    function bindHost(host) {
      if (!host || typeof host.addEventListener !== 'function') return () => false;
      const room = typeof host.closest === 'function' ? host.closest('.room-window') : null;
      let priorMedia = new Set(), disposed = false;
      const sync = () => {
        if (disposed) return;
        const hiddenRoom = room && room.classList && !room.classList.contains('open');
        const hidden = doc.visibilityState === 'hidden' || host.isConnected === false || Boolean(host.hidden) || Boolean(hiddenRoom);
        host.classList?.toggle('curioid-runtime-suspended', hidden);
        if (hidden) {
          if (host.querySelectorAll) host.querySelectorAll('audio,video').forEach(media => {
            if (!media.paused) { priorMedia.add(media); try { media.pause(); } catch (_) {} }
          });
          suspend('host-inactive');
        } else {
          resume('host-active');
          for (const media of priorMedia) if (media.isConnected && !media.hidden) { try { const result = media.play(); if (result?.catch) result.catch(() => {}); } catch (_) {} }
          priorMedia.clear();
        }
      };
      doc.addEventListener('visibilitychange', sync);
      const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(sync) : null;
      try { observer?.observe(host, { attributes:true, attributeFilter:['hidden','class','style'], subtree:true }); if (room) observer?.observe(room, { attributes:true, attributeFilter:['class','hidden'] }); } catch (_) {}
      const release = addCleanup(() => {
        disposed = true; doc.removeEventListener('visibilitychange', sync); observer?.disconnect();
        host.classList?.remove('curioid-runtime-suspended'); priorMedia.clear();
      }, 'host-visibility-observer');
      sync();
      return release;
    }

    function dispose(reason) {
      if (state === 'disposed' || state === 'disposing') return false;
      state = 'disposing';
      try { if (!controller.signal.aborted) controller.abort(reason || 'runtime-disposed'); }
      catch (error) { cleanupFailures += 1; cleanupFailureCount += 1; report(error, `${owner}/abort`); }
      for (let index = entries.length - 1; index >= 0; index -= 1) runEntry(entries[index]);
      entries.length = 0;
      state = 'disposed';
      disposedAt = Date.now();
      activeScopes.delete(id);
      totalScopesDisposed += 1;
      history.push(Object.freeze({ id, owner, reason: safeLabel(reason, 'manual'), createdAt, disposedAt, durationMs: Math.max(0, disposedAt - createdAt), cleanupFailures }));
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      publishStatus();
      return true;
    }

    function getStatus() {
      const kinds = Object.create(null);
      let activeResources = 0;
      for (const entry of entries) {
        if (!entry.active) continue;
        activeResources += 1;
        kinds[entry.kind] = (kinds[entry.kind] || 0) + 1;
      }
      return Object.freeze({ id, owner, state, createdAt, disposedAt, activeResources, resources: Object.freeze(kinds), cleanupFailures });
    }

    const scope = Object.freeze({
      id,
      owner,
      signal: controller.signal,
      addCleanup,
      listen,
      timeout,
      interval,
      animationFrame,
      trackObserver,
      trackObjectURL,
      createObjectURL,
      trackWorker,
      trackAudioContext,
      trackAbortController,
      suspend,
      resume,
      bindHost,
      dispose,
      getStatus
    });
    activeScopes.set(id, { getStatus });
    totalScopesCreated += 1;
    publishStatus();
    return scope;
  }

  function disposeAll(reason) {
    let disposed = 0;
    // Resolve the active scope objects by the public handle retained below.
    for (const scope of [...scopeHandles.values()]) {
      if (scope && ['active', 'suspended'].includes(scope.getStatus().state) && scope.dispose(reason || 'dispose-all')) disposed += 1;
    }
    return disposed;
  }

  const scopeHandles = new Set();
  const originalCreateScope = createScope;
  function managedCreateScope(options) {
    const scope = originalCreateScope(options);
    scopeHandles.add(scope);
    // Prune old disposed handles; the history list contains the lightweight record.
    if (scopeHandles.size > MAX_ACTIVE_SCOPES + MAX_HISTORY) {
      for (const old of [...scopeHandles]) {
        if (old.getStatus().state === 'disposed') scopeHandles.delete(old);
        if (scopeHandles.size <= MAX_ACTIVE_SCOPES + MAX_HISTORY) break;
      }
    }
    return scope;
  }

  const api = Object.freeze({
    version: VERSION,
    limits: Object.freeze({ maxActiveScopes: MAX_ACTIVE_SCOPES, maxCleanupsPerScope: MAX_CLEANUPS_PER_SCOPE, historyEntries: MAX_HISTORY }),
    createScope: managedCreateScope,
    getStatus: makeStatus,
    listScopes: () => Object.freeze([...activeScopes.values()].map(scope => scope.getStatus())),
    getHistory: () => Object.freeze(history.slice()),
    disposeAll
  });
  Object.defineProperty(win, 'CurioidRuntimeSupervisor', { value: api, configurable: false, enumerable: true, writable: false });

  const refresh = () => renderStatus(makeStatus());
  win.addEventListener('curioid:runtime-change', refresh);
  win.addEventListener('pageshow', refresh);
  win.addEventListener('pagehide', event => { if (!event || event.persisted !== true) disposeAll('page-unload'); });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
  publishStatus();
})(typeof window !== 'undefined' ? window : null);

    // GitHub Pages cannot set frame-ancestors response headers. Refuse to run
    // interactive CURIOID UI when embedded by another site as a clickjacking fallback.
    if (window.top !== window.self) {
      document.addEventListener("DOMContentLoaded", () => {
        const notice = document.createElement("main");
        notice.setAttribute("role", "alert");
        notice.style.cssText = "max-width:42rem;margin:12vh auto;padding:2rem;border:1px solid #596b3c;border-radius:12px;background:#191920;color:#f1f0ed;font:16px/1.6 system-ui,sans-serif";
        const heading = document.createElement("h1");
        heading.textContent = "Open CURIOID in its own tab";
        const detail = document.createElement("p");
        detail.textContent = "CURIOID disables interactive features when embedded by another website. Use its direct address in a new tab.";
        notice.append(heading, detail);
        document.body.replaceChildren(notice);
      }, { once: true });
    } else {
    document.addEventListener("DOMContentLoaded", () => {
    (() => {
      "use strict";

      const scrollBehavior = () => document.documentElement.classList.contains("motion-reduced") ? "auto" : "smooth";
      // Open projects are portalled outside content-visibility sections into one
      // viewport layer. This prevents fixed-position containment bugs and gives
      // every app the same responsive fullscreen workspace.
      const curioidAppLayer = document.createElement('div');
      curioidAppLayer.id = 'curioid-app-layer';
      curioidAppLayer.hidden = true;
      curioidAppLayer.setAttribute('aria-label','Fullscreen project workspace');
      const curioidAppSwitcher = document.createElement('nav');
      curioidAppSwitcher.className = 'curioid-app-switcher';
      curioidAppSwitcher.setAttribute('aria-label','Open project windows');
      curioidAppSwitcher.setAttribute('role','tablist');
      curioidAppLayer.appendChild(curioidAppSwitcher);
      document.body.appendChild(curioidAppLayer);
      let curioidActiveRoomId = '';
      let curioidSavedPageScroll = 0;
      let curioidRoomStackSequence = 0;
      function curioidOpenRooms() { return [...document.querySelectorAll('.room-window.open.curioid-fullscreen-window')]; }
      function curioidActivateRoom(room) {
        if (!room || !room.classList.contains('open')) return;
        curioidActiveRoomId = room.dataset.room || '';
        for (const item of curioidOpenRooms()) {
          const active = item === room;
          item.classList.toggle('curioid-app-active',active);
          item.setAttribute('aria-hidden',String(!active));
          if (active) item.style.zIndex = String(++curioidRoomStackSequence);
        }
        curioidRenderAppSwitcher();
        const heading = room.querySelector('.room-heading');
        if (heading && document.activeElement?.closest?.('#curioid-app-layer')) heading.focus({preventScroll:true});
      }
      function curioidRenderAppSwitcher() {
        const rooms = curioidOpenRooms();
        curioidAppLayer.hidden = rooms.length === 0;
        document.documentElement.classList.toggle('curioid-app-open',rooms.length>0);
        document.body.classList.toggle('curioid-app-open',rooms.length>0);
        if (!rooms.length) {
          curioidActiveRoomId = '';
          curioidAppSwitcher.replaceChildren();
          window.scrollTo({top:curioidSavedPageScroll,behavior:'auto'});
          return;
        }
        if (!curioidActiveRoomId || !rooms.some(room=>room.dataset.room===curioidActiveRoomId)) curioidActiveRoomId = rooms[rooms.length-1].dataset.room;
        const fragment = document.createDocumentFragment();
        const label = document.createElement('span');
        label.className = 'curioid-app-switcher-label';
        label.textContent = rooms.length > 1 ? 'OPEN APPS' : 'CURIOID / APP';
        fragment.appendChild(label);
        for (const room of rooms) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.curioidAppSelect = room.dataset.room;
          button.id = `curioid-app-tab-${String(room.dataset.room||'app').replace(/[^a-z0-9_-]/gi,'-')}`;
          button.setAttribute('role','tab');
          const active = room.dataset.room === curioidActiveRoomId;
          button.setAttribute('aria-selected',String(active));
          button.setAttribute('aria-pressed',String(active));
          room.setAttribute('role','tabpanel');
          room.setAttribute('aria-labelledby',button.id);
          button.setAttribute('aria-controls',room.id);
          button.textContent = room.querySelector('.room-name')?.textContent?.trim() || room.dataset.room;
          button.title = `Show ${button.textContent}`;
          fragment.appendChild(button);
        }
        curioidAppSwitcher.replaceChildren(fragment);
      }
      curioidAppSwitcher.addEventListener('click',event=>{
        const button=event.target.closest('[data-curioid-app-select]');
        if(!button)return;
        const room=document.getElementById(`room-${button.dataset.curioidAppSelect}`);
        if(room)curioidActivateRoom(room);
      });
      function curioidPortalRoom(room) {
        if (!room || room.parentElement === curioidAppLayer) return;
        if (!room._curioidPortalOrigin) room._curioidPortalOrigin={parent:room.parentNode,next:room.nextSibling};
        if (!document.body.classList.contains('curioid-app-open')) curioidSavedPageScroll=window.scrollY||window.pageYOffset||0;
        curioidAppLayer.appendChild(room);
        room.classList.add('curioid-fullscreen-window');
        room.dataset.curioidPortalled='true';
      }
      function curioidRestoreRoom(room) {
        room.classList.remove('curioid-fullscreen-window','curioid-app-active');
        room.removeAttribute('aria-hidden');
        room.removeAttribute('role');
        room.removeAttribute('aria-labelledby');
        room.style.removeProperty('z-index');
        if(room.dataset.curioidPortalled==='true'){
          const origin=room._curioidPortalOrigin;
          if(origin?.parent?.isConnected){
            const before=origin.next?.parentNode===origin.parent?origin.next:null;
            origin.parent.insertBefore(room,before);
          }
          delete room._curioidPortalOrigin;
          delete room.dataset.curioidPortalled;
        }
      }
      const CATEGORIES = [
        { id: "operating-systems", title: "Operating Systems", kicker: "00 / INDEPENDENT WORLDS", description: "Six independent environments plus Sandbox OS, a workshop for building your own Basic, Advanced or Hybrid world. Keep each OS local and independent.", rooms: ["dead-interface", "food-alchemy", "echonoise-os", "umbra-os", "aura-synthesis", "aether-os", "sandbox-os"] },
        { id: "strange-archives", title: "Strange Archives", kicker: "01 / COLLECTIONS", description: "Invented histories, impossible objects and fragments from other timelines.", rooms: ["museum-almost", "unbuilt-tomorrow", "missing-minutes", "unreturned-doors", "atlas-unclaimed"] },
        { id: "web-experiments", title: "Web Experiments", kicker: "02 / INTERACTIVE", description: "Curious machines, interactive systems and things to explore.", rooms: ["kineta-hyperion", "oddity-lab", "gravity-garden", "pattern-engine", "impossible-objects", "pixel-weather", "dream-index", "pendulum-choir"] },
        { id: "tiny-games", title: "Tiny Games", kicker: "03 / PLAY", description: "Small playable ideas, unusual rules and miniature challenges.", rooms: ["curioids", "pocket-universe", "one-button-ritual", "last-corridor", "borrowed-gravity", "room-remembers", "unreliable-lift", "moth-census"] },
        { id: "digital-art", title: "Digital Art", kicker: "04 / VISUAL", description: "Generative images, strange compositions, motion drawings and visual worlds.", rooms: ["chromatic-fossils", "organic-errors", "afterimage-studio", "faultline-portrait", "velvet-weather", "strata-loom", "motion-residue", "negative-space"] },
        { id: "sound-motion", title: "Music & Audio", kicker: "05 / MUSIC", description: "Instruments, rhythm makers, audio experiments and sound-responsive worlds.", rooms: ["dark-looper", "frequency-garden", "listening-room", "orbit-choir", "tide-signal"] },
        { id: "creative-tools", title: "Applications & Tools", kicker: "06 / STUDIO", description: "Standalone creative tools, generators and useful experiments that work without a separate operating system.", rooms: ["vanta-deck", "devtoys", "color-alchemist", "type-foundry", "idea-tumbler", "texture-press", "sprite-sheet-studio", "vector-mark-studio", "layout-composer", "palette-extractor", "gradient-atlas", "contact-sheet", "pixel-sort-lab", "shape-composer", "icon-set-studio", "print-room", "poster-press"] }
      ];

      const ROOM_INFO = {
        "sandbox-os": { title: "Sandbox OS", mark: "07", icon: "✳", description: "Build your own operating system in Basic, Advanced or Hybrid mode", copy: "Start with a blank OS or a starter recipe. Add modules one by one, create your own private tools, or switch to Advanced and Hybrid when you want more control. Your OS packages and data stay in this browser. Open the workshop to build, test, save, export and manage your personal operating systems.", category: "operating-systems" },
        "aether-os": { title: "Aether / Cognitive Field", mark: "06", icon: "✧", description: "A local cognitive environment for semantic constellations, evidence synthesis and temporal knowledge mapping", copy: "Aether is a local-first cognitive field for notes, links, code, files and connected ideas. Its Dream Engine proposes explainable semantic relationships; Synthesis creates traceable extractive briefs from your own source cards; Chronoscope arranges knowledge by time. It does not claim sentience or invent facts. Processing stays on-device, with a local worker, IndexedDB and OPFS when supported. WebGPU is optional and not required. No cloud model or remote service is used.", category: "operating-systems" },
        "kineta-hyperion": { title: "KINETA // HYPERION", mark: "01", icon: "⚙", description: "Evolve creatures, play with ragdoll physics and master a wobbly walking challenge", copy: "A six-mode artificial-life laboratory: evolve creatures, manipulate ragdoll physics, master Stride Trial, design cellular automata, tune inter-species particle forces and intervene in a living micro-biosphere. Start with one creature, edit genetic and simulation rules, save champion DNA and experiment locally without an account or external engine.", category: "web-experiments" },
        "oddity-lab": { title: "Face Machine", mark: "02", icon: "◉", description: "Generate almost-human faces that feel quietly alive", category: "web-experiments" },
        "aura-synthesis": { title: "Administrative Creative Environment", mark: "01", icon: "◈", description: "A governed creative office for routine tasking, personal standing and approved production records", copy: "AURA//SYNTHESIS is the standard administrative workspace for creative production. It maintains a personal standing account, issues small continuity directives and records routine acknowledgements. Its color, language, spatial and audio departments operate under fixed office procedures. Local records remain in this browser. AURA does not inspect activity outside its own workspace or control access to other CURIOID worlds.", category: "operating-systems" },
        "gravity-garden": { title: "Gravity Garden", mark: "03", icon: "◌", description: "A rotating flower-planet system with a rare singularity", copy: "Build a miniature solar system, drag planets into place, change the speed and watch gravity pull their paths into unexpected orbits." },
        "pattern-engine": { title: "Pattern Engine", mark: "04", icon: "▦", description: "Repeating shapes, broken symmetry and visual noise", copy: "Create repeating geometry, broken symmetry and intricate visual systems. Change the rules, randomize the composition and export a clean image." },
        "impossible-objects": { title: "Impossible Objects", mark: "05", icon: "◇", description: "Objects that should not exist, but somehow do", copy: "Rotate and inspect impossible structures, change their perspective and discover where a convincing object stops making physical sense." },
        "pixel-weather": { title: "Pixel Weather", mark: "06", icon: "☼", description: "Tiny digital climates from places off the map", copy: "Generate miniature climates from imaginary places. Change the atmosphere, shift the weather and export a snapshot of the forecast." },
        "dream-index": { title: "Dream Index", mark: "07", icon: "✳", description: "A visual index of places that never existed", copy: "Explore invented locations, collect fragments and tune the scene with haze, drift and memory-grain controls." },

        "faultline-portrait": { title: "Faultline Portrait", mark: "05", icon: "◍", description: "Portraits assembled from misaligned pieces of memory", copy: "Build a fractured portrait from contour bands, displaced features and geological color layers. Push the face toward abstraction without losing its uneasy likeness, then export a high-resolution image." },
        "velvet-weather": { title: "Velvet Weather", mark: "06", icon: "☁", description: "A forecast for skies that do not occur naturally", copy: "Generate slow-moving atmospheric landscapes with impossible cloud formations, unfamiliar horizons and weather systems that behave almost correctly." },

        "umbra-os": { title: "UMBRA Studio", mark: "01", icon: "◐", description: "A darkroom OS for layers, light, texture and impossible images", copy: "Enter UMBRA Studio, a self-contained creative desktop with a lightweight layered image editor. Paint, erase, mask, blend, add type, generate textures, tune color and export polished artwork. Your images stay in your browser." },
        "chromatic-fossils": { title: "Chromatic Fossils", mark: "02", icon: "◈", description: "Color studies that look excavated from another world", copy: "Layered color fields, strange material studies and abstract compositions with the feeling of found objects. Build layered geological color compositions, adjust the strata and export an original digital artwork." },
        "organic-errors": { title: "Organic Errors", mark: "03", icon: "✣", description: "Beautiful accidents, warped forms and digital growths", copy: "Grow branching forms and cellular structures, mutate their patterns and export the moments when the system almost becomes something familiar." },
        "afterimage-studio": { title: "Afterimage Studio", mark: "04", icon: "▤", description: "Layered images, visual echoes and color ghosts", copy: "Load an image locally and create echoes, offsets, grain and color ghosts. Your source image stays in your browser." },

        "borrowed-gravity": { title: "Borrowed Gravity", mark: "04", icon: "↕", description: "A courier game where the floor keeps changing sides", copy: "Navigate a sealed test chamber by shifting gravity between the floor and ceiling. Collect every light fragment and reach the exit without touching the moving hazards." },
        "room-remembers": { title: "The Room Remembers", mark: "05", icon: "▦", description: "A memory game where the pattern changes its mind", copy: "Watch a sequence of rooms light up, then repeat it. The room grows longer each round, and a familiar tile may not mean the same thing twice." },

        "curioids": { title: "Curioids: The Oddity League", mark: "00", icon: "✹", description: "A full-body creature battler, collection hunt and website-wide expedition", copy: "Recruit a team of strange full-body lifeforms, build synergies, level duplicates, buy food, and battle through escalating rounds. 100 secret activities are distributed across CURIOID: find the shaking eggs before they disappear to add permanent creatures to your collection. The arena shop only recruits for the current restartable run. All creature art, game logic and progress run locally in your browser.", category: "tiny-games" },
        "pocket-universe": { title: "Pocket Universe", mark: "01", icon: "◎", description: "A tiny playable world with its own rules", copy: "Pilot a tiny courier through a miniature gravitational field, collect nine light shards and reach the gate before your hull runs out." },
        "one-button-ritual": { title: "One-Button Ritual", mark: "02", icon: "◉", description: "A game controlled by one button and bad decisions", copy: "A precision timing game with moving targets. Later rounds require one press to align two opposite marks at the same time." },
        "last-corridor": { title: "The Last Corridor", mark: "03", icon: "⌁", description: "A strange little journey through one changing space", copy: "Navigate a corridor with three choices while a watcher slowly becomes clearer and closer. Repeating a decision changes how it follows you." },

        "listening-room": { title: "The Listening Room", mark: "04", icon: "◖", description: "A room that turns synthetic signals into moving architecture", copy: "Explore generated waveforms as an evolving visual instrument. The signal is created entirely inside CURIOID and never uses a microphone or external device." },
        "orbit-choir": { title: "Orbit Choir", mark: "05", icon: "◎", description: "Three voices circling the same note without agreeing", copy: "Build an evolving ambient chord from three orbiting oscillators. Change their paths, tuning and speed, then listen to the harmony almost settle." },

        "echonoise-os": { title: "Chambers of Echoes", mark: "01", icon: "♫", description: "A sound-making world with five synthetic voices, lyric-born melodies and a phonetic songwriting lab", copy: "Build a sound world in Echonoise OS 2126. Program five choir voices across a 16-step sequencer, write lyrics and map them to a generated melody, explore 125,093 US-English headwords and 134,119 pronunciation variants in Lexicon Lab, scan stress and meter, reverse-search phonemes, discover rhyme and sound palettes, shape reflections with EchoWeave effects, and save sessions in your local Songbook." },
        "dark-looper": { title: "D4RK L00P3R", mark: "01", icon: "♫", description: "A dark, browser-native 16-step groove box with live synthesis and recording", copy: "Build a beat with twelve playable pads, shape a sixteen-step pattern, swap between more than thirty synthesized sounds, set the tempo from 40 to 200 BPM, overdub patterns and record a live performance for download. Sounds are generated on this device with the Web Audio API; no samples or music are uploaded." , category: "sound-motion" },
        "frequency-garden": { title: "Frequency Garden", mark: "02", icon: "〰", description: "Living shapes that respond to sound", copy: "Plant tone-generating blooms in a responsive sound garden. Their positions decide pitch, while the controls shape the sound." },
        "motion-residue": { title: "Motion Residue", mark: "03", icon: "⌁", description: "Movement that leaves strange traces behind", copy: "Draw with a mouse, finger or pen. Build mirrored trails and motion echoes, then export the resulting composition." },

        "missing-minutes": { title: "The Office of Missing Minutes", mark: "04", icon: "◷", description: "A public records office for time that went missing", copy: "Search reports from people who lost small portions of their day. Claim a record, inspect the circumstances and see what the office has decided to call it." },
        "unreturned-doors": { title: "The Registry of Unreturned Doors", mark: "05", icon: "▯", description: "A building directory where some rooms are not on the plan", copy: "Inspect a directory of unusual doors, open their entries and discover the rooms behind them. The registry remembers which doors you have visited." },

        "museum-almost": { title: "Museum of Almost Real Things", mark: "02", icon: "▣", description: "A collection of objects with invented histories", copy: "Browse eight fictional artifacts with detailed acquisition records, object descriptions and notes from the collection staff." },
        "dead-interface": { title: "The Uncatalogued Desktop", mark: "01", icon: "▤", description: "A working computer from a neighbouring timeline", copy: "Explore a complete late-1990s personal computer with practical programs, miniature games, scientific instruments, saved keys, room-based storage and utilities that do not appear in the manual.", category: "operating-systems" },
        "unbuilt-tomorrow": { title: "Unbuilt Tomorrow", mark: "03", icon: "⌂", description: "Futures imagined, designed, then forgotten", copy: "Browse shelved proposals for transit, housing, civic design and domestic technology from futures that almost arrived." },

        "vanta-deck": { title: "VANTA DECK", mark: "01", icon: "⬡", description: "A private personal and system workbench for diagnostics, focus resets and everyday utilities", copy: "A compact control deck for browser and device diagnostics, display and keyboard checks, a private one-minute reset, breathing and countdown timers, text cleanup, links, encoding, JSON, hashes and password generation. Processing stays in this browser; it does not ask for accounts or send your input to a server.", category: "creative-tools" },
        "devtoys": { title: "GLITCHYARD", mark: "02", icon: "⌘", description: "A vivid local developer lab with 37 tools for formatting, conversion, inspection, testing and generation", copy: "A browser-native developer workbench for JSON, XML, SQL, YAML, URLs, HTTP headers, MIME types, HTTP status codes, encoding, hashing, regular expressions, text analysis, Unicode, mock data and more. GLITCHYARD processes your input locally in this tab and does not upload it.", category: "creative-tools" },
        "color-alchemist": { title: "Color Alchemist", mark: "02", icon: "◍", description: "Mix, bend and discover unusual color relationships", copy: "Generate color harmonies, lock the swatches you like, check text contrast and export CSS variables or a palette file." },
        "type-foundry": { title: "Type Foundry", mark: "03", icon: "Aa", description: "A playground for letters, forms and tiny type tools", copy: "Create a typographic poster with editable phrases, type styles, layout, scale and distortion. Export the composition as PNG." },
        "idea-tumbler": { title: "Idea Tumbler", mark: "04", icon: "✳", description: "Shake unrelated ideas together and see what sticks", copy: "Combine subjects, formats and constraints into original project seeds. Save ideas locally or copy a concept to develop further." },
        "texture-press": { title: "Texture Press", mark: "05", icon: "▧", description: "Make repeatable surfaces, patterns and material studies", copy: "Generate seamless tiles for backgrounds, game surfaces and print work. Adjust scale, texture and irregularity, then export large PNG tiles." },
        "sprite-sheet-studio": { title: "Sprite Sheet Studio", mark: "06", icon: "▦", description: "Build small animated game characters and sprite sheets", copy: "Choose a character, motion and palette. Preview its loop, export a sprite sheet and copy a CSS animation snippet." },
        "vector-mark-studio": { title: "Vector Mark Studio", mark: "07", icon: "◇", description: "Create compact symbols, emblems and identity marks", copy: "Combine simple geometry into a distinctive vector mark. Edit its initials, silhouette and colors, then export SVG or PNG." },
        "layout-composer": { title: "Layout Composer", mark: "08", icon: "▤", description: "Compose posters, covers and social graphics", copy: "Set a canvas size, choose a layout rhythm and build a finished typographic composition. Export clean artwork for further editing." },
        "palette-extractor": { title: "Palette Extractor", mark: "09", icon: "◍", description: "Pull useful color systems from your own images", copy: "Choose an image stored on your device and extract a balanced palette locally. Copy CSS variables or export a palette file; the image is never uploaded." },
        "gradient-atlas": { title: "Gradient Atlas", mark: "10", icon: "◒", description: "Build expressive gradient systems and save CSS", copy: "Mix color stops, choose linear, radial or conic geometry, add grain and export the result as CSS or PNG." },
        "contact-sheet": { title: "Contact Sheet", mark: "11", icon: "▦", description: "Turn a folder of images into a clean visual index", copy: "Select a batch of local images, arrange them into a labelled contact sheet, adjust spacing and export a print-ready PNG." },
        "pixel-sort-lab": { title: "Pixel Sort Lab", mark: "12", icon: "▥", description: "Reorder image pixels into controlled visual distortions", copy: "Sort selected pixel runs by luminance, hue or saturation. Compare vertical and horizontal passes, tune thresholds and export the altered image." },
        "shape-composer": { title: "Shape Composer", mark: "13", icon: "◇", description: "Compose bold abstract graphics from modular geometry", copy: "Build a layered graphic from repeatable shapes, symmetry, palette and controlled chaos. Export crisp large-format artwork." },
        "icon-set-studio": { title: "Icon Set Studio", mark: "14", icon: "⌘", description: "Design a coherent family of tiny interface symbols", copy: "Set a shared stroke, grid and visual language, generate a 12-icon family and export a reusable SVG sprite sheet." },
        "pendulum-choir": { title: "Pendulum Choir", mark: "08", icon: "〰", description: "A field of pendulums that gradually lose agreement", copy: "Tune gravity, coupling and the number of pendulums. Watch their paths braid together, then export a trace of the movement." },
        "strata-loom": { title: "Strata Loom", mark: "07", icon: "▧", description: "Weave a surface from bands, threads and imperfect tension", copy: "Generate woven surfaces with variable warp, weft, knots, slippage and material palettes. Save a seamless-looking visual study as an image." },
        "negative-space": { title: "Negative Space Department", mark: "08", icon: "◩", description: "Make a composition from the parts that are missing", copy: "Cut holes, windows and shifting silhouettes from a layered poster field. Adjust the balance of positive and negative space, then export." },
        "unreliable-lift": { title: "Unreliable Lift", mark: "06", icon: "↕", description: "Deliver passengers through a building with uncertain floors", copy: "Read the destination requests, choose the lift route and try to complete the run before the floor indicators begin to disagree." },
        "moth-census": { title: "Moth Census", mark: "07", icon: "✦", description: "Count the visitors that gather around a very strange lamp", copy: "A short observation game. Identify moths among decoys, build a streak and keep the census alive until the lamp changes its mind." },
        "tide-signal": { title: "Tide Signal", mark: "06", icon: "≈", description: "A small radio that listens to a tide that is not on a map", copy: "Shape a local ambient signal using slow oscillators, filters and modulated noise. It only makes sound after you start it." },
        "atlas-unclaimed": { title: "Atlas of Unclaimed Names", mark: "06", icon: "⌖", description: "A registry of places that have names but no confirmed locations", copy: "Search an archive of invented place names, inspect their notes and claim entries for a local collection." },
        "print-room": { title: "Print Room", mark: "15", icon: "▤", description: "Turn ordinary images into strange print processes", copy: "Apply risograph, overprint, halftone, photocopy and threshold treatments to a sample or local image. Everything happens in your browser." },
        "poster-press": { title: "Poster Press", mark: "16", icon: "▣", description: "Build a finished poster from type, color and a few strong shapes", copy: "Compose a poster with editable copy, layout systems, typography, graphic marks and print texture. Export a high-resolution PNG." },
        "food-alchemy": { title: "The Recipe Foundry", mark: "08", icon: "♨", description: "Explore a futuristic kitchen desktop. Combine ingredients into new creations and chain them into dishes.", copy: "Welcome to NOURISH OS 2126. Select one ingredient, then another, or drag one onto another to discover new creations. Every discovery appears on your desktop and can become part of another chain. Launch Pantry, Recipe Library, Kitchen Timer, Shopping List or Food Journal from the desktop or Start menu. Your experiments save locally on this device." },
      };

      function projectDisplayTitle(id, title = ROOM_INFO[id]?.title || id) {
        return String(title || id).replace(/^(?:DOORS98(?:\s+OS)?|NOURISH(?:\s+OS)?|ECHONOISE(?:\s+OS)?|UMBRA(?:\s+OS)?|AETHER(?:\s+OS)?|AURA(?:\/\/SYNTHESIS)?(?:\s+OS)?)\s*-\s*/i, '').trim();
      }

      // Semantic project marks. These are deliberately chosen by project subject, not by list position.
      const ROOM_ICON_BY_ID = {
        "aether-os":"✧", "sandbox-os":"✳", "kineta-hyperion":"⚙", "oddity-lab":"◉", "gravity-garden":"⊙", "pattern-engine":"▦", "impossible-objects":"◇", "pixel-weather":"☼", "dream-index":"☾", "pendulum-choir":"⚖",
        "umbra-os":"◐", "chromatic-fossils":"◈", "organic-errors":"✿", "afterimage-studio":"▤", "faultline-portrait":"◍", "velvet-weather":"☁", "strata-loom":"▧", "negative-space":"◩",
        "curioids":"✹", "pocket-universe":"◎", "one-button-ritual":"⦿", "last-corridor":"▭", "borrowed-gravity":"↕", "room-remembers":"▧", "unreliable-lift":"⇅", "moth-census":"✦", "food-alchemy":"♨",
        "echonoise-os":"♫", "dark-looper":"♫", "vanta-deck":"⬡", "frequency-garden":"〰", "motion-residue":"⇢", "listening-room":"◖", "orbit-choir":"◉", "tide-signal":"≈",
        "museum-almost":"▣", "dead-interface":"▤", "unbuilt-tomorrow":"⌂", "missing-minutes":"◷", "unreturned-doors":"▯", "atlas-unclaimed":"⌖",
        "aura-synthesis":"◈", "vanta-deck":"⬡", "devtoys":"⌘", "color-alchemist":"◍", "type-foundry":"Aa", "idea-tumbler":"✳", "texture-press":"▨", "sprite-sheet-studio":"▦", "vector-mark-studio":"◇", "layout-composer":"▤", "palette-extractor":"◒", "gradient-atlas":"◓", "contact-sheet":"▩", "pixel-sort-lab":"▥", "shape-composer":"△", "icon-set-studio":"⌘", "print-room":"▱", "poster-press":"▣"
      };

      // Stage 5–7: structured links plus validated, approval-driven workflow support.
      // These profiles describe the connections that really exist today; they do
      // not claim that domain-specific adapters have already been built.
      const CURIOID_WORKSHOP_SERVICES = Object.freeze([
        Object.freeze({ id: 'workshop.inspect-artifact', name: 'Artifact Inspector', description: 'Inspect artifact metadata, provenance and supported previews.', area: 'inspection' }),
        Object.freeze({ id: 'workshop.convert-format', name: 'Format Bench', description: 'Convert JSON, CSV and TSV locally.', area: 'conversion' }),
        Object.freeze({ id: 'workshop.image-thumbnail', name: 'Thumbnail Forge', description: 'Create smaller local WebP or PNG image artifacts.', area: 'image' })
      ]);
      const CURIOID_WORKFLOW_SERVICE = Object.freeze({ id: 'curioid-workflows', name: 'Workflow Engine', description: 'Compose validated .curioidflow sequences with manual approval at every step, including active user-created local OS adapters.', area: 'automation' });
      const CURIOID_UNIVERSE_WORKSHOP_SERVICE = Object.freeze({ id: 'curioid-universe-workshop', name: 'Sandbox OS', description: 'Build a personal OS in Basic, Advanced or Hybrid mode. Keep packages and data local to this browser.', area: 'creation' });
      const CURIOID_LOCAL_DATA_SERVICES = Object.freeze([
        Object.freeze({ id:'personal-items', name:'Personal Items', description:'Private notes, captures, drafts and small records owned by one OS.', area:'data' }),
        Object.freeze({ id:'schedule', name:'Schedule', description:'Private events, plans and reminders owned by one OS.', area:'data' }),
        Object.freeze({ id:'collections', name:'Collections', description:'Private bookmarks, reading lists and user-defined collections.', area:'data' }),
        Object.freeze({ id:'asset-library', name:'Asset Library', description:'Private references and metadata for reusable assets. Binary project files remain in native exports.', area:'data' }),
        Object.freeze({ id:'notifications', name:'Notifications', description:'Private in-world notices and activity records.', area:'data' }),
        Object.freeze({ id:'search-index', name:'Search Index', description:'Private searchable summaries for an OS own records.', area:'data' })
      ]);
      const CURIOID_SHARED_SERVICES = Object.freeze([...CURIOID_LOCAL_DATA_SERVICES, ...CURIOID_WORKSHOP_SERVICES, CURIOID_WORKFLOW_SERVICE, CURIOID_UNIVERSE_WORKSHOP_SERVICE]);
      const CURIOID_WORLD_DEFINITIONS = Object.freeze([
        Object.freeze({ id: 'dead-interface', name: 'Doors98', summary: 'A retro desktop with its own rooms, keys and local C: memory.', mark: '▤' }),
        Object.freeze({ id: 'food-alchemy', name: 'NOURISH OS', summary: 'A kitchen desktop for ingredients, recipes, planning and food experiments.', mark: '♨' }),
        Object.freeze({ id: 'echonoise-os', name: 'Echonoise', summary: 'A music-making environment for songs, sessions and voice experiments.', mark: '♫' }),
        Object.freeze({ id: 'umbra-os', name: 'UMBRA', summary: 'A darkroom-style image workspace for layers, light and texture.', mark: '◐' }),
        Object.freeze({ id: 'aether-os', name: 'Aether.OS', summary: 'A contextual mesh for notes, links, files and connected ideas.', mark: '✧' }),
        Object.freeze({ id: 'aura-synthesis', name: 'AURA//SYNTHESIS', summary: 'A managed creative administration environment with structured tasking and local standing records.', mark: '◈' })
      ]);
      const CURIOID_WORLD_BY_ID = new Map(CURIOID_WORLD_DEFINITIONS.map(world => [world.id, world]));
      const CURIOID_RELATED_PROJECTS = Object.freeze({
        'dead-interface': ['aether-os', 'food-alchemy', 'umbra-os'],
        'food-alchemy': ['aether-os', 'echonoise-os', 'idea-tumbler'],
        'echonoise-os': ['frequency-garden', 'listening-room', 'tide-signal', 'aether-os'],
        'umbra-os': ['palette-extractor', 'afterimage-studio', 'contact-sheet', 'chromatic-fossils'],
        'aether-os': ['food-alchemy', 'echonoise-os', 'umbra-os', 'aura-synthesis'],
        'aura-synthesis': ['idea-tumbler', 'color-alchemist', 'type-foundry', 'aether-os'],
        'frequency-garden': ['echonoise-os', 'listening-room', 'orbit-choir'],
        'listening-room': ['echonoise-os', 'frequency-garden', 'tide-signal'],
        'tide-signal': ['echonoise-os', 'listening-room', 'orbit-choir'],
        'palette-extractor': ['umbra-os', 'chromatic-fossils', 'gradient-atlas'],
        'afterimage-studio': ['umbra-os', 'pixel-sort-lab', 'print-room'],
        'contact-sheet': ['umbra-os', 'palette-extractor', 'print-room'],
        'chromatic-fossils': ['umbra-os', 'palette-extractor', 'strata-loom'],
        'idea-tumbler': ['aura-synthesis', 'aether-os', 'type-foundry'],
        'color-alchemist': ['aura-synthesis', 'palette-extractor', 'gradient-atlas'],
        'type-foundry': ['aura-synthesis', 'layout-composer', 'poster-press']
      });
      const CURIOID_NATIVE_ADAPTER_PROFILES = Object.freeze({
        'dead-interface': Object.freeze({ id:'doors98-native', name:'Doors98 Native Adapter', artifactTypes:Object.freeze(['doors98/keys','echonoise/lyric-study','echonoise/sound-palette','echonoise/songbook','echonoise/session','nourish/collection','umbra/palette','aether/knowledge-collection','aura/creative-output']), exportArtifactTypes:Object.freeze(['doors98/keys']) }),
        'food-alchemy': Object.freeze({ id:'nourish-native', name:'NOURISH Native Adapter', artifactTypes:Object.freeze(['nourish/collection','echonoise/lyric-study','echonoise/sound-palette','echonoise/songbook','echonoise/session','umbra/palette','aether/knowledge-collection','doors98/keys','aura/creative-output']), exportArtifactTypes:Object.freeze(['nourish/collection']) }),
        'echonoise-os': Object.freeze({ id:'echonoise-native', name:'Echonoise Native Adapter', artifactTypes:Object.freeze(['echonoise/songbook','echonoise/session','echonoise/lyric-study','echonoise/sound-palette','aether/knowledge-collection','nourish/collection','umbra/palette','doors98/keys','aura/creative-output']), exportArtifactTypes:Object.freeze(['echonoise/session', 'echonoise/songbook', 'echonoise/lyric-study', 'echonoise/sound-palette']) }),
        'umbra-os': Object.freeze({ id:'umbra-native', name:'UMBRA Native Adapter', artifactTypes:Object.freeze(['umbra/project','umbra/palette','echonoise/lyric-study','echonoise/sound-palette','aether/knowledge-collection','nourish/collection','doors98/keys','aura/creative-output']), exportArtifactTypes:Object.freeze(['umbra/project', 'umbra/palette']) }),
        'aether-os': Object.freeze({ id:'aether-native', name:'Aether Native Adapter', artifactTypes:Object.freeze(['aether/knowledge-collection','echonoise/lyric-study','echonoise/sound-palette','echonoise/songbook','echonoise/session','nourish/collection','umbra/project','umbra/palette','doors98/keys','aura/creative-output']), exportArtifactTypes:Object.freeze(['aether/knowledge-collection']) }),
        'aura-synthesis': Object.freeze({ id:'aura-native', name:'AURA Native Adapter', artifactTypes:Object.freeze(['aura/creative-output','echonoise/lyric-study','echonoise/sound-palette','echonoise/songbook','echonoise/session','nourish/collection','umbra/project','umbra/palette','aether/knowledge-collection','doors98/keys']), exportArtifactTypes:Object.freeze(['aura/creative-output', 'aura/release-dossier']) })
      });
      const CURIOID_PROJECT_PROFILES = new Map();
      for (const category of CATEGORIES) {
        for (const [order, id] of category.rooms.entries()) {
          const isWorld = CURIOID_WORLD_BY_ID.has(id);
          const adapter = CURIOID_NATIVE_ADAPTER_PROFILES[id] || null;
          const related = CURIOID_RELATED_PROJECTS[id] || category.rooms
            .map((candidate, candidateOrder) => ({ candidate, distance: Math.abs(candidateOrder - order) }))
            .filter(item => item.candidate !== id)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 2).map(item => item.candidate);
          CURIOID_PROJECT_PROFILES.set(id, Object.freeze({
            role: isWorld ? 'independent-operating-system' : 'independent-project',
            kernel: Object.freeze({
              registeredExperience: true,
              eventBus: true,
              artifactStore: true,
              nativeCapabilities: Object.freeze(adapter ? ['native-artifact-adapter', ...(adapter.exportArtifactTypes || adapter.artifactTypes)] : [])
            }),
            exchange: Object.freeze({
              status: isWorld ? 'taskbar-integrated' : 'not-mounted',
              inboxId: isWorld ? `os:${id}` : null,
              artifactBridge: isWorld ? 'explicit-kernel-grant' : 'not-connected',
              nativeAdapters: Object.freeze(adapter ? [adapter.id] : []),
              nativeAdapterState: adapter ? 'available-on-world-mount' : 'none',
              nativeArtifactTypes: Object.freeze(adapter ? [...(adapter.exportArtifactTypes || adapter.artifactTypes)] : []),
              acceptedArtifactTypes: Object.freeze(adapter ? [...adapter.artifactTypes] : [])
            }),
            nativeAdapter: adapter ? Object.freeze({ id:adapter.id, name:adapter.name, artifactTypes:adapter.artifactTypes, exportArtifactTypes:adapter.exportArtifactTypes || adapter.artifactTypes, artifactTypeVersion:'1.0.0', activation:'registers-when-world-is-open' }) : null,
            workflow: Object.freeze({ available: true, engineId: 'curioid-workflows', approval: 'required-for-every-step', adapterActivation: isWorld ? 'registers-when-world-is-open' : 'not-a-native-os-adapter' }),
            sharedServices: Object.freeze({
              availableThroughKernel: true,
              access: 'public-capability',
              entryPoint: isWorld ? 'System Center' : 'Kernel API',
              serviceIds: Object.freeze(CURIOID_SHARED_SERVICES.map(service => service.id))
            }),
            relatedProjectIds: Object.freeze(related.filter(candidate => category.rooms.includes(candidate) || CATEGORIES.some(group => group.rooms.includes(candidate))).slice(0, 4))
          }));
        }
      }

      // Stable catalogue contract, now versioned with integration metadata.
      // Existing room IDs, ordering and launch behavior remain unchanged.
      const CURIOID_CATALOGUE = Object.freeze({
        schemaVersion: 9,
        applicationLibrary: Object.freeze({ version:'2.1.0', scope:'bundled-local-projects-and-installed-local-packages', personalCollectionStorage:'curioid-universal-app-library-v1', externalPackagePolicy:'declarative-data-only', packageFormat:'curioid-app-package', packageSchemaVersion:1, execution:'bundled-modules-and-safe-built-in-package-runtime' }),
        projectCount: CATEGORIES.reduce((sum, category) => sum + category.rooms.length, 0),
        worlds: CURIOID_WORLD_DEFINITIONS,
        sharedServices: CURIOID_SHARED_SERVICES,
        extensionSDK: Object.freeze({ version:'2.0.0', connectProtocol:'curioid-connect', connectVersion:'1.0.0', manifestFormat:'curioid-connect-manifest', manifestSchemaVersion:1, packageFormat:'curioid-os-package', backupFormat:'curioid-os-backup', localWorldsPrivate:true, localServices:CURIOID_LOCAL_DATA_SERVICES, supports:{ html:true, css:true, javascript:true, bundledAssets:true, localStorage:true, kernelCapabilities:true, capabilityContracts:true, typedEvents:true, typedMessages:true, nativeExchangeAdapters:true, workflowParticipation:true, localBackups:true, reviewSubmissions:true }, publication:'manual-human-review' }),
        categories: Object.freeze(CATEGORIES.map(category => Object.freeze({
          id: category.id, title: category.title, description: category.description,
          projectIds: Object.freeze([...category.rooms])
        }))),
        projects: Object.freeze(CATEGORIES.flatMap(category => category.rooms.map((id, order) => {
          const info = ROOM_INFO[id];
          const profile = CURIOID_PROJECT_PROFILES.get(id);
          return Object.freeze({
            id, title: projectDisplayTitle(id, info.title), originalTitle: info.title, description: info.description || '',
            details: info.copy || '', category: category.id, categoryTitle: category.title,
            categoryOrder: CATEGORIES.indexOf(category), order,
            module: id, launchType: 'lazy-room-module',
            icon: ROOM_ICON_BY_ID[id] || info.icon || '◈',
            profile
          });
        })))
      });
      window.CurioidCatalogue = CURIOID_CATALOGUE;
      // Either load order is valid: the local Connect adapter may arrive before
      // or after the catalogue. Synchronize only declarative metadata, never grants.
      if (window.CurioidConnect) {
        try { window.CurioidConnect.syncCatalogue(CURIOID_CATALOGUE); }
        catch (error) { console.warn('CURIOID Connect catalogue metadata is pending:', error); }
      }
      window.CURIOID_PUBLISHER_EMAIL = 'ninewinters@hotmail.com'; // Public address for manual human review submissions.
      window.CurioidUniverse = Object.freeze({
        version: '1.6.0',
        connectProtocol: 'curioid-connect',
        connectVersion: '1.0.0',
        catalogue: CURIOID_CATALOGUE,
        getProject(id) { return CURIOID_CATALOGUE.projects.find(project => project.id === String(id)) || null; },
        getWorlds() { return CURIOID_WORLD_DEFINITIONS; },
        getSharedServices() { return CURIOID_SHARED_SERVICES; },
        getActivity() { return window.CurioidExchange?.getOverview?.() || Promise.resolve(null); }
      });

      const $ = (selector, root = document) => root.querySelector(selector);
      const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
      const motionToggle = $("#motionToggle");
      const initialMotionPreference = (() => {
        try { const saved = localStorage.getItem("curioid-motion-enabled"); if (saved === "1") return true; if (saved === "0") return false; } catch (_) {}
        return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      })();
      window.CurioidMotionInitial = initialMotionPreference;
      function syncMotionToggle() {
        const enabled = window.CurioidMotion ? window.CurioidMotion.enabled : Boolean(window.CurioidMotionInitial);
        const text = enabled ? "Motion ON" : "Motion OFF";
        for (const control of [motionToggle, ...$$('[data-motion-toggle-mirror]')].filter(Boolean)) {
          control.textContent = text;
          control.setAttribute("aria-pressed", String(enabled));
          control.setAttribute("aria-label", enabled ? "Pause animated projects" : "Resume animated projects");
          control.title = enabled ? "Pause all decorative and canvas motion" : "Resume all animated projects";
        }
      }
      motionToggle.addEventListener("click", () => {
        const next = window.CurioidMotion ? window.CurioidMotion.toggle() : !Boolean(window.CurioidMotionInitial);
        window.CurioidMotionInitial = next;
        try { localStorage.setItem("curioid-motion-enabled", next ? "1" : "0"); } catch (_) {}
        syncMotionToggle();
        showToast(next ? "Motion is on." : "Motion is paused.");
      });
      $$('[data-motion-toggle-mirror]').forEach(control => control.addEventListener('click', () => motionToggle.click()));
      document.addEventListener("curioid:motionchange", syncMotionToggle);
      syncMotionToggle();

      const toast = $("#toast");
      let toastTimer = 0, lastToastMessage = '', lastToastAt = 0;
      function showToast(message, options = {}) {
        const text = String(message || '').trim().slice(0, 260);
        if (!text || !toast) return false;
        const now = Date.now(), quietMs = Math.max(0, Number(options.quietMs ?? 18000));
        // Repeated read-only / unavailable / permission notices are useful once,
        // not every time a visitor presses the same control.
        if (!options.force && text === lastToastMessage && now - lastToastAt < quietMs) return false;
        lastToastMessage = text; lastToastAt = now;
        toast.textContent = text;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
        return true;
      }
      async function copyProjectLink(roomId) {
        const info = ROOM_INFO[roomId];
        if (!info) { showToast("That project link is unavailable."); return; }
        const url = new URL(window.location.href);
        url.hash = `curioid=${encodeURIComponent(roomId)}`;
        let copied = false;
        try {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(url.href);
            copied = true;
          }
        } catch (_) {}
        if (!copied) {
          const previousFocus = document.activeElement;
          const field = document.createElement("textarea");
          field.value = url.href;
          field.setAttribute("readonly", "");
          field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
          document.body.appendChild(field);
          field.select();
          try { copied = document.execCommand("copy"); } catch (_) { copied = false; }
          field.remove();
          if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
        }
        showToast(copied ? `Direct link copied for ${info.title}.` : "Could not copy the link. Check your browser permissions.");
      }

      // Site-level notifications stay in memory for this page session. Only
      // meaningful warnings/recovery events are promoted from ordinary toasts.
      const siteNotifications = [];
      let siteNotificationUnread = 0;
      const notificationBell = $("#notificationBell");
      const notificationPanel = $("#notificationPanel");
      const notificationList = $("[data-notification-list]");
      const notificationCount = $("#notificationCount");
      function renderSiteNotifications() {
        if (!notificationList) return;
        notificationList.replaceChildren();
        if (!siteNotifications.length) {
          const empty = document.createElement('p'); empty.className = 'site-notification-empty';
          empty.textContent = "You are all caught up."; notificationList.appendChild(empty);
        } else {
          siteNotifications.forEach(item => {
            const button = document.createElement('button'); button.type = 'button';
            button.className = `site-notification-item${item.read ? '' : ' is-unread'}`;
            button.dataset.notificationId = item.id;
            const head = document.createElement('span'); head.className = 'site-notification-item-head';
            const source = document.createElement('b'); source.textContent = item.sourceName;
            const time = document.createElement('time'); time.dateTime = new Date(item.createdAt).toISOString();
            time.textContent = new Date(item.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
            head.append(source,time);
            const message = document.createElement('p'); message.textContent = item.message;
            button.append(head,message); notificationList.appendChild(button);
          });
        }
        const count = siteNotificationUnread;
        if (notificationCount) { notificationCount.hidden = count < 1; notificationCount.textContent = count > 99 ? '99+' : String(count); }
        notificationBell?.setAttribute('aria-label', count ? `Notifications, ${count} unread` : 'Notifications');
      }
      function addSiteNotification(message, sourceId = '', options = {}) {
        const text = String(message ?? '').trim().slice(0, 420);
        const important = options.force === true || /failed|failure|could not|cannot|blocked|corrupt|damaged|recovery|denied|quota|unavailable|needs attention|warning|error|restore/i.test(text);
        if (!text || !important) return;
        const source = ROOM_INFO[sourceId];
        const id = (window.crypto?.randomUUID?.() || `notice-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
        siteNotifications.unshift({ id, message:text, sourceId:ROOM_INFO[sourceId] ? sourceId : '', sourceName: source ? projectDisplayTitle(sourceId, source.title) : 'CURIOID', createdAt:Date.now(), read:false });
        const removed = siteNotifications.splice(40);
        siteNotificationUnread = Math.max(0, siteNotificationUnread - removed.filter(item => !item.read).length);
        siteNotificationUnread = Math.min(99, siteNotificationUnread + 1);
        renderSiteNotifications();
      }
      window.CurioidNotifications = Object.freeze({
        notify(message, options = {}) { addSiteNotification(message, options.sourceId || '', {force:true}); },
        getUnreadCount() { return siteNotificationUnread; }
      });
      function setNotificationPanel(open) {
        if (!notificationPanel || !notificationBell) return;
        notificationPanel.hidden = !open;
        notificationBell.setAttribute('aria-expanded', String(Boolean(open)));
        if (open) renderSiteNotifications();
      }
      notificationBell?.addEventListener('click', () => setNotificationPanel(notificationPanel.hidden));
      notificationPanel?.addEventListener('click', event => {
        const action = event.target.closest('[data-notification-read-all],[data-notification-clear],[data-notification-id]');
        if (!action) return;
        if (action.matches('[data-notification-read-all]')) {
          siteNotifications.forEach(item => { item.read = true; }); siteNotificationUnread = 0; renderSiteNotifications(); return;
        }
        if (action.matches('[data-notification-clear]')) { siteNotifications.length = 0; siteNotificationUnread = 0; renderSiteNotifications(); return; }
        const item = siteNotifications.find(entry => entry.id === action.dataset.notificationId);
        if (item) {
          if (!item.read) { item.read = true; siteNotificationUnread = Math.max(0, siteNotificationUnread - 1); }
          renderSiteNotifications(); setNotificationPanel(false);
          if (item.sourceId && typeof openUniverseProject === 'function') openUniverseProject(item.sourceId);
        }
      });
      document.addEventListener('pointerdown', event => {
        if (notificationPanel && !notificationPanel.hidden && !event.target?.closest?.('.topbar-notification-wrap')) setNotificationPanel(false);
      }, true);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && notificationPanel && !notificationPanel.hidden) { setNotificationPanel(false); notificationBell?.focus({preventScroll:true}); }
      });
      window.addEventListener('curioid:notification', event => {
        const detail = event.detail || {};
        addSiteNotification(detail.message, detail.sourceId || '', {force:true});
      });
      window.addEventListener('curioid:vault-notice', event => {
        const message = event.detail?.message;
        if (message) addSiteNotification(message, '', {});
      });
      const controlCenter = $('#siteControlCenter');
      const controlStorage = $('[data-control-storage]', controlCenter);
      const controlShortcuts = $('[data-control-shortcuts]', controlCenter);
      const storageMeter = $('[data-storage-meter]', controlCenter);
      const storageMeterFill = $('[data-storage-meter-fill]', controlCenter);
      const storageBreakdown = $('[data-storage-breakdown]', controlCenter);
      const storageProtectionStatus = $('[data-storage-protection-status]', controlCenter);
      const storageProtectionBadge = $('[data-storage-protection-badge]', controlCenter);
      const storagePersistButton = $('[data-storage-persist-request]', controlCenter);
      const formatStorageSize = bytes => {
        if (!Number.isFinite(bytes) || bytes < 0) return '—';
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / 1048576).toFixed(bytes >= 10 * 1048576 ? 0 : 1)} MB`;
      };
      async function refreshControlCenter() {
        if (controlShortcuts) controlShortcuts.textContent = `${siteFavorites.length} favorites · ${siteRecents.length} recent`;
        const storage = navigator.storage;
        let estimate = null, persisted = false;
        try {
          const values = await Promise.all([
            storage?.estimate ? storage.estimate().catch(() => null) : Promise.resolve(null),
            storage?.persisted ? storage.persisted().catch(() => false) : Promise.resolve(false)
          ]);
          estimate = values[0]; persisted = values[1] === true;
        } catch (_) {}
        const usage = Number.isFinite(estimate?.usage) ? estimate.usage : null;
        const quota = Number.isFinite(estimate?.quota) && estimate.quota > 0 ? estimate.quota : null;
        if (controlStorage) {
          controlStorage.textContent = usage === null ? 'Browser estimate unavailable' : `${formatStorageSize(usage)} used${quota ? ` of ${formatStorageSize(quota)}` : ''}${persisted ? ' · persistent' : ''}`;
        }
        if (storageMeter && storageMeterFill) {
          const percentage = usage !== null && quota ? Math.max(0, Math.min(100, usage / quota * 100)) : 0;
          storageMeter.setAttribute('aria-valuenow', String(Math.round(percentage)));
          storageMeterFill.style.width = `${percentage.toFixed(1)}%`;
          storageMeterFill.style.opacity = usage !== null && quota ? '1' : '.25';
        }
        if (storageBreakdown) {
          const details = estimate?.usageDetails && typeof estimate.usageDetails === 'object'
            ? Object.entries(estimate.usageDetails).filter(([, value]) => Number.isFinite(value) && value > 0).slice(0, 4).map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}: ${formatStorageSize(value)}`)
            : [];
          storageBreakdown.textContent = usage === null ? 'Storage estimate unavailable in this browser.' : details.length ? details.join(' · ') : 'Estimated usage across this site’s browser-managed storage.';
        }
        if (storageProtectionBadge) {
          storageProtectionBadge.textContent = persisted ? 'PROTECTED' : storage?.persist ? 'NOT PROTECTED' : 'UNAVAILABLE';
          storageProtectionBadge.dataset.state = persisted ? 'granted' : 'unprotected';
        }
        if (storageProtectionStatus) {
          storageProtectionStatus.textContent = persisted
            ? 'The browser has granted persistent storage for this domain. Keep regular backups anyway.'
            : storage?.persist
              ? 'Persistent storage has not been granted. The browser may clear inactive domain data under storage pressure.'
              : 'This browser does not support a persistent-storage request. Export backups regularly.';
        }
        if (storagePersistButton) {
          storagePersistButton.disabled = persisted || typeof storage?.persist !== 'function';
          storagePersistButton.textContent = persisted ? 'Protection already granted' : typeof storage?.persist === 'function' ? 'Request storage protection' : 'Request unavailable';
        }
      }
      storagePersistButton?.addEventListener('click', async () => {
        const storage = navigator.storage;
        if (typeof storage?.persist !== 'function' || storagePersistButton.disabled) return;
        storagePersistButton.disabled = true;
        storagePersistButton.textContent = 'Requesting…';
        if (storageProtectionStatus) storageProtectionStatus.textContent = 'Asking the browser to protect this domain’s storage…';
        try {
          const granted = await storage.persist();
          await refreshControlCenter();
          if (storageProtectionStatus && !granted) storageProtectionStatus.textContent = 'The browser did not grant persistent storage. Your local data remains available, but automatic domain cleanup may still occur. Export important work regularly.';
        } catch (_) {
          await refreshControlCenter();
          if (storageProtectionStatus) storageProtectionStatus.textContent = 'The request could not be completed. Export important work regularly and check your browser storage settings.';
        }
      });
      const healthRunButton = $('[data-health-run]', controlCenter);
      const healthRepairButton = $('[data-health-repair]', controlCenter);
      const healthStatus = $('[data-health-status]', controlCenter);
      const healthState = $('[data-health-state]', controlCenter);
      const healthResults = $('[data-health-results]', controlCenter);
      const healthDownloadButton = $('[data-health-download]', controlCenter);
      const healthDownloadFallback = $('[data-health-download-fallback]', controlCenter);
      const healthDetails = $('[data-health-details]', controlCenter);
      const healthDetailsSummary = $('[data-health-details-summary]', controlCenter);
      const HEALTH_MODULE_HASH = '856ca30abfb3518557bde3dadea4f345cd31e7758bac70fad2b3105f75c9b159';
      const HEALTH_MODULE_SRI = 'sha384-aGvjU+0s0i2Eums8ghUlSgIK39VbZNHKvNUnn9Gl60qRhYnAf7ns2dQzC2hKD+JE';
      let healthApi = null, healthModulePromise = null, healthFailureReportUrl = null;
      window.addEventListener('pagehide',()=>{if(healthFailureReportUrl){try{URL.revokeObjectURL(healthFailureReportUrl);}catch(_){}healthFailureReportUrl=null;}},{once:true});
      const createHealthApi = () => window.CurioidHealthCheck.create({runButton:healthRunButton,repairButton:healthRepairButton,status:healthStatus,state:healthState,results:healthResults,downloadButton:healthDownloadButton,downloadFallback:healthDownloadFallback,details:healthDetails,detailsSummary:healthDetailsSummary,formatStorageSize,expectedHealthHash:HEALTH_MODULE_HASH});
      let curioidWorkerRepairPromise = null;
      async function refreshCurioidWorker({activateWaiting=true, timeoutMs=12000}={}) {
        const sw = navigator.serviceWorker;
        if (!sw) throw new Error('This browser does not support service workers.');
        const canonical = document.querySelector('link[rel="canonical"]')?.href || document.baseURI;
        const siteRoot = new URL('.', canonical);
        // Re-register the same scope with the new script URL. Merely calling
        // getRegistration()/update() would keep the old service-worker.js (and
        // its stale cache) in control indefinitely.
        const registration = await sw.register(new URL('service-worker-current.js?release=v1.323', siteRoot).href, {scope:siteRoot.pathname, updateViaCache:'none'});
        await Promise.race([registration.update(), new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service-worker update check timed out.')),timeoutMs))]);
        if (!registration.waiting && registration.installing) {
          await new Promise(resolve => {
            const worker = registration.installing;
            if (!worker || ['installed','activated','redundant'].includes(worker.state)) return resolve();
            const finish = () => { worker.removeEventListener('statechange',onState); resolve(); };
            const onState = () => { if (['installed','activated','redundant'].includes(worker.state)) finish(); };
            worker.addEventListener('statechange',onState);
            setTimeout(finish, timeoutMs);
          });
        }
        if (!activateWaiting || !registration.waiting) {
          return {registration, activated:false, waiting:Boolean(registration.waiting), controller:Boolean(sw.controller)};
        }
        const waiting = registration.waiting;
        const previousController = sw.controller;
        return await new Promise(resolve => {
          let settled = false;
          const finish = result => { if(settled)return; settled=true; clearTimeout(timer); sw.removeEventListener('controllerchange',onController); sw.removeEventListener('message',onMessage); waiting.removeEventListener('statechange',onWorkerState); resolve(result); };
          const timer = setTimeout(() => finish({registration,activated:false,waiting:true,controller:Boolean(sw.controller),timeout:true}), timeoutMs);
          const onController = () => { if(sw.controller && sw.controller !== previousController) finish({registration,activated:true,waiting:false,controller:true}); };
          const onMessage = event => { if(event.data?.type==='CURIOID_UPDATE_BLOCKED') finish({registration,activated:false,waiting:true,controller:Boolean(sw.controller),blocked:true,openTabs:event.data.openTabs}); };
          const onWorkerState = () => { if(waiting.state==='activated') finish({registration,activated:true,waiting:false,controller:Boolean(sw.controller)}); };
          sw.addEventListener('controllerchange',onController);
          sw.addEventListener('message',onMessage);
          waiting.addEventListener('statechange',onWorkerState);
          try { waiting.postMessage({type:'CURIOID_ACTIVATE_UPDATE'}); }
          catch(error) { finish({registration,activated:false,waiting:true,controller:Boolean(sw.controller),error:String(error?.message||error)}); }
        });
      }
      function scheduleWorkerRecoveryReload() {
        try { sessionStorage.setItem('curioid-worker-recovery-v1.323','1'); } catch (_) {}
        const error = new Error('A newer CURIOID offline shell was activated. Reloading this page to reopen project assets from the matching release.');
        error.code = 'CURIOID_SW_RECOVERY_RELOAD';
        setTimeout(() => window.location.reload(), 80);
        return error;
      }
      async function recoverStaleWorkerAfterAssetFailure() {
        if (curioidWorkerRepairPromise) return curioidWorkerRepairPromise;
        if (!navigator.serviceWorker?.controller) return false;
        curioidWorkerRepairPromise = (async () => {
          try {
            let attempted = false;
            try { attempted = sessionStorage.getItem('curioid-worker-recovery-v1.323') === '1'; } catch (_) {}
            if (attempted) return false;
            const result = await refreshCurioidWorker({activateWaiting:true,timeoutMs:12000});
            if (result.activated) throw scheduleWorkerRecoveryReload();
            if (result.blocked) window.__CURIOID_SW_UPDATE_BLOCKED = result.openTabs;
            return false;
          } catch (error) {
            if (error?.code === 'CURIOID_SW_RECOVERY_RELOAD') throw error;
            return false;
          }
        })();
        return curioidWorkerRepairPromise;
      }
      const ensureHealthApi = () => {
        if (healthApi) return Promise.resolve(healthApi);
        if (window.CurioidHealthCheck?.create) { healthApi=createHealthApi(); return Promise.resolve(healthApi); }
        if (!healthModulePromise) {
          healthModulePromise = new Promise((resolve,reject) => {
            const script=document.createElement('script');
            const canonicalBase=document.querySelector('link[rel="canonical"]')?.href||document.baseURI;
            const url=new URL('health-check.js',new URL('.',canonicalBase));
            url.searchParams.set('v',`sha256-${HEALTH_MODULE_HASH}`);
            script.async=true; script.crossOrigin='anonymous'; script.integrity=HEALTH_MODULE_SRI;
            script.referrerPolicy='strict-origin-when-cross-origin'; script.setAttribute('data-cfasync','false');
            const timer=window.setTimeout(()=>{script.remove();reject(new Error('Health Check module request timed out'));},12000);
            script.addEventListener('load',()=>{window.clearTimeout(timer);try{if(!window.CurioidHealthCheck?.create)throw new Error('Health Check module did not initialize');healthApi=createHealthApi();resolve(healthApi);}catch(error){reject(error);}},{once:true});
            script.addEventListener('error',()=>{window.clearTimeout(timer);reject(new Error('Health Check module failed to load. Check health-check.js beside index.html and its HTTP/CSP/SRI response.'));},{once:true});
            script.src=url.href; document.head.appendChild(script);
          }).catch(error=>{healthModulePromise=null;throw error;});
        }
        return healthModulePromise;
      };
      const showHealthModuleError = error => {
        let message=String(error?.message||error).slice(0,220);
        if(window.__CURIOID_SW_UPDATE_BLOCKED!==undefined)message+=' A newer offline shell is waiting, but other CURIOID tabs must be closed before it can activate.';
        if(healthStatus)healthStatus.textContent=`Health Check could not load: ${message}`;
        if(healthState){healthState.textContent='UNAVAILABLE';healthState.dataset.state='issues-found';}
        if(healthResults){const item=document.createElement('li');item.dataset.state='error';const label=document.createElement('b');label.textContent='Health Check module';const detail=document.createElement('span');detail.textContent=message;item.replaceChildren(label,detail);healthResults.replaceChildren(item);}
        if(healthDetailsSummary)healthDetailsSummary.textContent='View diagnostic load details (1 issue)';
        // Minimal fallback report generated by the always-loaded site runtime.
        // This remains downloadable even when health-check.js itself is blocked.
        try {
          const report={title:'CURIOID HEALTH CHECK MODULE FAILURE',generatedAt:new Date().toISOString(),release:document.querySelector('meta[name="curioid-release"]')?.content||'unknown',page:location.href,error:message,secureContext:isSecureContext,online:navigator.onLine,serviceWorker:{controller:navigator.serviceWorker?.controller?.scriptURL||null,registration:navigator.serviceWorker?.getRegistration? 'available':'unavailable'},lastAssetFailure:window.__CURIOID_LAST_ASSET_LOAD_FAILURE||null,resourceErrors:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/curioid/')).slice(-20).map(entry=>({name:new URL(entry.name).pathname,durationMs:Math.round(entry.duration),transferSize:entry.transferSize||null})),privacy:'Fallback report generated locally. No cookies, passwords, form values, storage contents or project data are included.'};
          if(healthFailureReportUrl){try{URL.revokeObjectURL(healthFailureReportUrl);}catch(_){}}
          healthFailureReportUrl=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));
          if(healthDownloadFallback){healthDownloadFallback.href=healthFailureReportUrl;healthDownloadFallback.download=`CURIOID-Health-Module-Failure-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;healthDownloadFallback.textContent='Download module-failure diagnostic (.json)';healthDownloadFallback.hidden=false;}
          if(healthDownloadButton)healthDownloadButton.disabled=false;
        } catch(_) {}
      };
      healthRunButton?.addEventListener('click',async()=>{
        healthRunButton.disabled=true;healthRunButton.textContent='Loading checks…';
        // Request persistent storage synchronously inside the diagnostic button's
        // user gesture, before awaiting the lazy Health Check module import.
        let persistencePromise=null;
        try { persistencePromise=typeof navigator.storage?.persist==='function' ? navigator.storage.persist().catch(()=>null) : Promise.resolve(null); }
        catch(_) { persistencePromise=Promise.resolve(null); }
        try{const api=await ensureHealthApi();await api.run({persistencePromise});}
        catch(error){try{await recoverStaleWorkerAfterAssetFailure();}catch(recoveryError){if(recoveryError?.code==='CURIOID_SW_RECOVERY_RELOAD')return;}showHealthModuleError(error);}
        finally{healthRunButton.disabled=false;if(healthRunButton.textContent==='Loading checks…')healthRunButton.textContent='Run diagnostics';}
      });
      healthDownloadButton?.addEventListener('click',()=>{
        try {
          // The module is already loaded when this button becomes enabled.
          // Keep the download invocation synchronous inside the user's click.
          if (healthApi?.download) { const started=healthApi.download(); if(!started&&healthStatus)healthStatus.textContent='The report could not be started automatically. Use the “Download report file” link that appears below this button.'; return; }
          if (healthDownloadFallback?.href && !healthDownloadFallback.hidden) { healthDownloadFallback.click(); return; }
          if (healthStatus) healthStatus.textContent='Run diagnostics first. Once a report is ready, this button starts the download immediately; a manual download link will also appear.';
        } catch(error) {
          if(healthStatus)healthStatus.textContent=`Report download failed: ${String(error?.message||error).slice(0,180)}. The report link remains available when prepared.`;
        }
      });
      healthRepairButton?.addEventListener('click',async()=>{
        if(!healthRepairButton)return;
        healthRepairButton.disabled=true;healthRepairButton.textContent='Refreshing…';
        if(healthStatus)healthStatus.textContent='Checking the current offline shell and any waiting update. Saved projects and browser storage will not be cleared.';
        try{
          const result=await refreshCurioidWorker({activateWaiting:true,timeoutMs:12000});
          if(result.activated){if(healthStatus)healthStatus.textContent='The current CURIOID update is active. Reloading into the matching assets…';setTimeout(()=>window.location.reload(),180);return;}
          if(result.blocked){const count=Number(result.openTabs);if(healthStatus)healthStatus.textContent=count?`Update is ready, but ${Math.max(1,count-1)} other CURIOID tab(s) are still open. Close them and press Refresh again.`:'Update is ready but could not activate safely. Close other CURIOID tabs and try again.';if(healthState){healthState.textContent='UPDATE BLOCKED';healthState.dataset.state='issues-found';}return;}
          if(healthStatus)healthStatus.textContent=result.waiting?'A newer CURIOID update is waiting, but this page is not currently controlled by an older service worker. Reload the page to finish the update.':'Service-worker update check completed. The active release is current; no saved data or caches were deleted.';
          if(healthState){healthState.textContent=result.waiting?'UPDATE READY':'CHECKED';healthState.dataset.state='healthy';}
        }catch(error){
          const message=String(error?.message||error).slice(0,220);
          if(healthStatus)healthStatus.textContent=`Refresh could not complete: ${message}`;
          if(healthState){healthState.textContent='UNAVAILABLE';healthState.dataset.state='issues-found';}
        }finally{if(healthRepairButton.isConnected){healthRepairButton.disabled=false;healthRepairButton.textContent='Refresh service-worker registration';}}
      });
      function openSiteControlCenter() {
        if (!controlCenter) return;
        refreshControlCenter();
        if (typeof controlCenter.showModal === 'function') { if (!controlCenter.open) controlCenter.showModal(); }
        else controlCenter.setAttribute('open','');
      }
      $('#openControlCenter')?.addEventListener('click', openSiteControlCenter);
      $('#openControlCenterFooter')?.addEventListener('click', openSiteControlCenter);
      const shortcutsDialog = $('#siteShortcutsDialog');
      let shortcutsReturnFocus = null;
      function openKeyboardShortcuts() {
        if (!shortcutsDialog || shortcutsDialog.open) return;
        shortcutsReturnFocus = document.activeElement;
        if (shortcutsReturnFocus?.closest?.('#siteControlCenter')) {
          shortcutsReturnFocus = $('#openControlCenter');
          controlCenter?.close?.();
          controlCenter?.removeAttribute('open');
        }
        if (typeof shortcutsDialog.showModal === 'function') shortcutsDialog.showModal();
        else shortcutsDialog.setAttribute('open', '');
        shortcutsDialog.querySelector('[data-shortcuts-close]')?.focus?.({ preventScroll: true });
      }
      $('#openShortcutsHelp')?.addEventListener('click', openKeyboardShortcuts);
      shortcutsDialog?.querySelector('[data-shortcuts-close]')?.addEventListener('click', () => {
        shortcutsDialog.close?.();
        shortcutsDialog.removeAttribute('open');
      });
      shortcutsDialog?.addEventListener('click', event => {
        if (event.target === shortcutsDialog) { shortcutsDialog.close?.(); shortcutsDialog.removeAttribute('open'); }
      });
      shortcutsDialog?.addEventListener('close', () => {
        const target = shortcutsReturnFocus;
        shortcutsReturnFocus = null;
        if (target?.isConnected) target.focus?.({ preventScroll: true });
      });
      controlCenter?.addEventListener('click', async event => {
        const close = event.target.closest('[data-control-close]');
        if (close || event.target === controlCenter) { controlCenter.close?.(); controlCenter.removeAttribute('open'); return; }
        const launcher = event.target.closest('[data-control-launch]');
        if (launcher) { controlCenter.close?.(); controlCenter.removeAttribute('open'); return; }
        const action = event.target.closest('[data-control-action]')?.dataset.controlAction;
        if (!action) return;
        controlCenter.close?.(); controlCenter.removeAttribute('open');
        if (action === 'connect') $('#openConnectConsole')?.click();
        else if (action === 'sandbox') $('#openUniverseWorkshop')?.click();
        else if (action === 'worlds') $('#openMySandboxWorlds')?.click();
        else if (action === 'vault') $('#openBrowserVault')?.click();
        else if (action === 'library') {
          try {
            await ensureProjectAssets();
            await window.CurioidConnectConsole?.open?.();
            document.querySelector('[data-ccc-tab="library"]')?.click();
          } catch (error) { showToast(error?.message || 'The app library is not ready yet.'); }
        }
        else if (action === 'backup') {
          const openBackupCenter = () => {
            const world = $('[data-room="dead-interface"]');
            const trigger = world?.querySelector('.os-system-center-trigger');
            if (trigger) { trigger.click(); return true; }
            return false;
          };
          if (!openBackupCenter()) {
            const onMounted = event => {
              if (event.detail?.id !== 'dead-interface') return;
              window.removeEventListener('curioid:room-mounted', onMounted);
              setTimeout(openBackupCenter, 0);
            };
            window.addEventListener('curioid:room-mounted', onMounted);
            if (typeof window.CurioidNavigateToProject === 'function') window.CurioidNavigateToProject('dead-interface');
            else { window.removeEventListener('curioid:room-mounted', onMounted); showToast('The OS launcher is not ready yet.'); }
            setTimeout(() => window.removeEventListener('curioid:room-mounted', onMounted), 12000);
          }
        }
      });
      document.addEventListener("curioid:toast", event => {
        const message = event.detail && event.detail.message;
        if (message) { showToast(String(message)); addSiteNotification(String(message), event.detail?.sourceId || ''); }
      });

      function createProjectLoadingStatus(message) {
        const status = document.createElement("div");
        status.className = "project-loading";
        status.setAttribute("role", "status");
        const mark = document.createElement("span");
        mark.className = "loading-mark";
        mark.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = message;
        status.append(mark, label);
        return status;
      }

      const ROOM_CARD_BY_ID = new Map();
      const CATEGORY_SECTION_BY_ID = new Map();
      const CATEGORY_NAV_BY_ID = new Map();
      const ROOM_SEARCH_TEXT_BY_ID = new Map();
      const SITE_FAVORITES_KEY = 'curioid-site-favorites-v1';
      const SITE_RECENTS_KEY = 'curioid-site-recents-v1';
      function normalizeSiteSessionData(value,knownIds,limit=8){
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['version','rooms','activeRoomId'].includes(key))||value.version!==1||!Array.isArray(value.rooms)||value.rooms.length>limit||typeof value.activeRoomId!=='string')return null;
        if(value.rooms.some(id=>typeof id!=='string'||!Object.prototype.hasOwnProperty.call(knownIds,id))||new Set(value.rooms).size!==value.rooms.length||value.activeRoomId!==''&&!value.rooms.includes(value.activeRoomId))return null;
        return {version:1,rooms:[...value.rooms],activeRoomId:value.activeRoomId};
      }
      function buildSiteSessionData(openRooms,activeRoomId,knownIds,limit=8){
        const unique=[...new Set(openRooms.filter(id=>typeof id==='string'&&Object.prototype.hasOwnProperty.call(knownIds,id)))];
        let rooms=unique.slice(-limit);
        if(activeRoomId&&unique.includes(activeRoomId)&&!rooms.includes(activeRoomId))rooms=[...rooms.slice(1),activeRoomId];
        const active=activeRoomId&&rooms.includes(activeRoomId)?activeRoomId:(rooms.at(-1)||'');
        return {version:1,rooms,activeRoomId:active};
      }
      const SITE_SESSION_KEY = 'curioid-site-window-session-v1';
      const SITE_SESSION_LIMIT = 8;
      const SITE_SESSION_STATE = { raw:null, hasStored:false, readOnly:false, reason:'', rooms:[], activeRoomId:'' };
      const SITE_ID_STORAGE = new Map();
      function readSiteSession(){
        try{
          const raw=localStorage.getItem(SITE_SESSION_KEY);
          SITE_SESSION_STATE.raw=raw;SITE_SESSION_STATE.hasStored=raw!==null;
          if(raw===null)return SITE_SESSION_STATE;
          if(typeof raw!=='string'||raw.length>4096)throw new Error('The saved window session exceeds its safe size limit.');
          const value=normalizeSiteSessionData(JSON.parse(raw),ROOM_INFO,SITE_SESSION_LIMIT);
          if(!value)throw new Error('The saved window session has invalid project IDs or structure.');
          SITE_SESSION_STATE.rooms=value.rooms;SITE_SESSION_STATE.activeRoomId=value.activeRoomId;
        }catch(error){SITE_SESSION_STATE.readOnly=true;SITE_SESSION_STATE.reason=String(error?.message||error).slice(0,180);}
        return SITE_SESSION_STATE;
      }
      readSiteSession();
      function updateSiteSessionButton(){
        const button=$('[data-restore-site-session]');if(!button)return;
        const count=SITE_SESSION_STATE.rooms.length;
        button.disabled=SITE_SESSION_STATE.readOnly||!SITE_SESSION_STATE.hasStored||count===0;
        button.textContent=count?`Restore last session (${count})`:'Restore last session';
        button.title=SITE_SESSION_STATE.readOnly?`Session restore is read-only: ${SITE_SESSION_STATE.reason}`:count?`Reopen ${count} project window${count===1?'':'s'} from your last saved session`:'No previous project session is saved.';
      }
      function saveSiteSession(activeRoomId=''){
        if(SITE_SESSION_STATE.readOnly)return false;
        const openRooms=$$('.room-window.open').map(room=>room.dataset.room);
        const session=buildSiteSessionData(openRooms,activeRoomId,ROOM_INFO,SITE_SESSION_LIMIT);
        const {rooms,activeRoomId:active}=session;
        const serialized=JSON.stringify(session);
        let previous;
        try{
          previous=localStorage.getItem(SITE_SESSION_KEY);
          if(previous!==SITE_SESSION_STATE.raw){SITE_SESSION_STATE.readOnly=true;SITE_SESSION_STATE.reason='Another tab changed the saved window session. Reload before changing it.';updateSiteSessionButton();return false;}
          localStorage.setItem(SITE_SESSION_KEY,serialized);
          if(localStorage.getItem(SITE_SESSION_KEY)!==serialized)throw new Error('The window session failed read-back verification.');
          SITE_SESSION_STATE.raw=serialized;SITE_SESSION_STATE.hasStored=true;SITE_SESSION_STATE.rooms=rooms;SITE_SESSION_STATE.activeRoomId=active;updateSiteSessionButton();return true;
        }catch(error){
          SITE_SESSION_STATE.readOnly=true;SITE_SESSION_STATE.reason=String(error?.message||error).slice(0,180);updateSiteSessionButton();return false;
        }
      }
      function restoreSiteSession(){
        if(SITE_SESSION_STATE.readOnly){showToast(`Saved window session is read-only. ${SITE_SESSION_STATE.reason}`);return;}
        const ids=[...SITE_SESSION_STATE.rooms].filter(id=>Object.prototype.hasOwnProperty.call(ROOM_INFO,id));
        if(!ids.length){showToast('There are no saved project windows to restore.');updateSiteSessionButton();return;}
        const activeId=SITE_SESSION_STATE.activeRoomId||ids[ids.length-1];
        let restored=0;
        for(const id of ids){const room=$(`#room-${CSS.escape(id)}`);if(room&&!room.classList.contains('open')){setRoomOpen(room,true,false);restored++;}}
        const activeRoom=$(`#room-${CSS.escape(activeId)}`);
        if(activeRoom){const section=activeRoom.closest('[data-category-section]');if(section)setActiveCategory(section.dataset.categorySection);requestAnimationFrame(()=>activeRoom.scrollIntoView({behavior:scrollBehavior(),block:'start'}));}
        saveSiteSession(activeId);showToast(restored?`${restored} project window${restored===1?'':'s'} restored from your last session.`:'Your last session is already open.');
      }
      function readSiteIds(key, limit=24) {
        let raw=null;
        try {
          raw=localStorage.getItem(key);
          if(raw===null){SITE_ID_STORAGE.set(key,{raw:null,readOnly:false,reason:''});return [];}
          if(typeof raw!=='string'||raw.length>16384)throw new Error('The saved shortcut list exceeds its safe size limit.');
          const value=JSON.parse(raw);
          if(!Array.isArray(value)||value.length>Math.max(500,limit))throw new Error('The saved shortcut list has an invalid structure or too many entries.');
          if(value.some(id=>typeof id!=='string'||!Object.prototype.hasOwnProperty.call(ROOM_INFO,id)))throw new Error('The saved shortcut list contains an unknown project ID.');
          SITE_ID_STORAGE.set(key,{raw,readOnly:false,reason:''});
          return [...new Set(value)].slice(0,limit);
        } catch(error) {
          SITE_ID_STORAGE.set(key,{raw,readOnly:true,reason:String(error?.message||error).slice(0,180)});
          return [];
        }
      }
      let siteFavorites = readSiteIds(SITE_FAVORITES_KEY, 100);
      let siteRecents = readSiteIds(SITE_RECENTS_KEY, 12);
      function storeSiteIds(key, values) {
        const state=SITE_ID_STORAGE.get(key);
        if(!state||state.readOnly){if(state&&!state.noticeShown){showToast(`This shortcut list is read-only because its original data could not be verified. ${state.reason||'Reload when browser storage is available.'} No data was overwritten.`,{quietMs:300000});state.noticeShown=true;}return false;}
        if(!Array.isArray(values)||values.length>(key===SITE_FAVORITES_KEY?100:12)||values.some(id=>typeof id!=='string'||!Object.prototype.hasOwnProperty.call(ROOM_INFO,id))){showToast('CURIOID refused an invalid shortcut update. Existing data was left unchanged.');return false;}
        const serialized=JSON.stringify([...new Set(values)]);
        let previous;
        try {
          previous=localStorage.getItem(key);
          if(previous!==state.raw){state.readOnly=true;state.reason='The saved shortcut list changed in another tab. Reload before editing.';showToast(`${state.reason} No newer data was overwritten.`);return false;}
          localStorage.setItem(key,serialized);
          if(localStorage.getItem(key)!==serialized)throw new Error('The shortcut list failed read-back verification.');
          state.raw=serialized;
          return true;
        } catch(error) {
          try {
            if(localStorage.getItem(key)!==previous){if(previous===null)localStorage.removeItem(key);else localStorage.setItem(key,previous);}
            if(localStorage.getItem(key)!==previous)throw new Error('The previous shortcut list could not be verified after rollback.');
          } catch(rollbackError) {
            state.readOnly=true;state.reason=`Save failed (${String(error?.message||error).slice(0,90)}); rollback could not be verified (${String(rollbackError?.message||rollbackError).slice(0,90)}).`;
            showToast(`Shortcut storage needs recovery. ${state.reason} No further changes will be made.`);return false;
          }
          showToast(`CURIOID could not save this shortcut. The previous list was verified intact: ${String(error?.message||error).slice(0,140)}`);return false;
        }
      }
      function syncRoomFavoriteButtons(roomId) {
        const active = siteFavorites.includes(roomId);
        $$(`[data-room-favorite="${CSS.escape(roomId)}"]`).forEach(button => {
          button.classList.toggle('is-favorite', active);
          button.setAttribute('aria-pressed', String(active));
          button.setAttribute('aria-label', active ? `Remove ${ROOM_INFO[roomId].title} from favorites` : `Add ${ROOM_INFO[roomId].title} to favorites`);
          button.title = active ? 'Remove from favorites' : 'Add to favorites';
          button.textContent = active ? '★' : '☆';
        });
      }
      function toggleSiteFavorite(roomId) {
        const next=siteFavorites.includes(roomId)?siteFavorites.filter(id=>id!==roomId):[roomId,...siteFavorites].slice(0,100);
        if(!storeSiteIds(SITE_FAVORITES_KEY,next))return;
        siteFavorites=next;syncRoomFavoriteButtons(roomId);renderPersonalShortcuts();
      }
      function recordSiteRecent(roomId) {
        const next=[roomId,...siteRecents.filter(id=>id!==roomId)].slice(0,12);
        if(!storeSiteIds(SITE_RECENTS_KEY,next))return;
        siteRecents=next;renderPersonalShortcuts();
      }
      function renderShortcutList(host, ids, emptyNode) {
        if (!host) return;
        host.replaceChildren();
        ids.forEach(id => {
          const info = ROOM_INFO[id]; if (!info) return;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'personal-shortcut'; button.dataset.shortcutProject = id;
          button.setAttribute('aria-label', `${projectDisplayTitle(id, info.title)}. ${info.description || 'Open this project'}`);
          const icon = document.createElement('span'); icon.textContent = ROOM_ICON_BY_ID[id] || info.icon || '◈';
          const copy = document.createElement('span'); copy.className = 'personal-shortcut-copy';
          const name = document.createElement('b'); name.textContent = projectDisplayTitle(id, info.title);
          const description = document.createElement('small'); description.textContent = info.description || 'Open this project';
          copy.append(name, description); const arrow = document.createElement('span'); arrow.className = 'personal-shortcut-arrow'; arrow.textContent = '↗';
          button.append(icon, copy, arrow); host.appendChild(button);
        });
        if (emptyNode) emptyNode.hidden = ids.length > 0;
      }
      function renderPersonalShortcuts() {
        renderShortcutList($('[data-site-favorites]'), siteFavorites, $('[data-site-favorites-empty]'));
        renderShortcutList($('[data-site-recents]'), siteRecents, $('[data-site-recents-empty]'));
        const clearFavorites = $('[data-clear-site-favorites]');
        const clearRecent = $('[data-clear-site-recents]');
        if (clearFavorites) clearFavorites.disabled = siteFavorites.length === 0;
        if (clearRecent) clearRecent.disabled = siteRecents.length === 0;
        updateSiteSessionButton();
      }

      function createRoomCard(roomId, index) {
        const info = ROOM_INFO[roomId];
        const projectProfile = CURIOID_PROJECT_PROFILES.get(roomId);
        const isOpen = false; // Project rooms stay closed until the visitor explicitly opens one.
        const article = document.createElement("article");
        article.className = `room-window${isOpen ? " open" : ""}`;
        article.id = `room-${roomId}`;
        article.dataset.room = roomId;
        // Each dynamically created room is an opt-in expedition surface.
        // Generic Curioids missions count coarse actions here, never user content.
        article.dataset.curioidExperience = "";
        const heading = document.createElement("button");
        heading.className = "room-heading";
        heading.type = "button";
        heading.setAttribute("aria-expanded", String(isOpen));
        heading.setAttribute("aria-controls", `body-${roomId}`);
        heading.setAttribute("aria-label", `${info.title}. ${info.description}. ${isOpen ? "Open" : "Closed"}.`);
        const roomIcon = document.createElement("span");
        roomIcon.className = "room-icon";
        roomIcon.setAttribute("aria-hidden", "true");
        roomIcon.textContent = String(ROOM_ICON_BY_ID[roomId] || info.icon || "");
        const roomNumber = document.createElement("span");
        roomNumber.className = "room-number";
        roomNumber.textContent = String(info.mark || "");
        const nameWrap = document.createElement("span");
        nameWrap.className = "room-name-wrap";
        const roomName = document.createElement("span");
        roomName.className = "room-name";
        roomName.textContent = projectDisplayTitle(roomId, info.title);
        const roomDescription = document.createElement("span");
        roomDescription.className = "room-description";
        roomDescription.textContent = info.description;
        nameWrap.append(roomName, roomDescription);
        const roomState = document.createElement("span");
        roomState.className = `room-state ${isOpen ? "open" : "closed"}`;
        roomState.setAttribute("aria-label", isOpen ? "Project open" : "Project closed");
        roomState.textContent = isOpen ? "OPEN" : "CLOSED";
        const roomChevron = document.createElement("span");
        roomChevron.className = "room-chevron";
        roomChevron.setAttribute("aria-hidden", "true");
        roomChevron.textContent = "⌄";
        heading.append(roomIcon, roomNumber, nameWrap, roomState, roomChevron);
        const cardHead = document.createElement('div'); cardHead.className = 'room-card-head';
        const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'room-favorite'; favorite.dataset.roomFavorite = roomId; favorite.textContent = '☆'; favorite.setAttribute('aria-pressed', 'false'); favorite.title = 'Add to favorites'; favorite.setAttribute('aria-label', `Add ${info.title} to favorites`);
        const share = document.createElement('button'); share.type = 'button'; share.className = 'room-share'; share.dataset.roomShare = roomId; share.textContent = '↗'; share.title = `Copy a direct link to ${info.title}`; share.setAttribute('aria-label', `Copy a direct link to ${info.title}`);
        const close = document.createElement('button'); close.type = 'button'; close.className = 'room-fullscreen-close'; close.textContent = '×'; close.title = `Close ${info.title}`; close.setAttribute('aria-label', `Close ${info.title}`);
        heading.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleRoom(article);});
        favorite.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleSiteFavorite(roomId);});
        share.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();copyProjectLink(roomId);});
        close.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setRoomOpen(article,false);});
        cardHead.append(heading, favorite, share, close);
        const body = document.createElement("div");
        body.className = "room-body";
        body.id = `body-${roomId}`;
        body.hidden = !isOpen;
        const mount = document.createElement("div");
        mount.className = "room-mount";
        mount.dataset.mount = roomId;
        if (isOpen) {
          article.setAttribute("aria-busy", "true");
          mount.appendChild(createProjectLoadingStatus("Preparing the desktop…"));
        }
        body.appendChild(mount);
        const relatedIds = projectProfile?.relatedProjectIds || [];
        if (relatedIds.length) {
          const related = document.createElement('section');
          related.className = 'room-ecosystem';
          related.setAttribute('aria-label', 'Related CURIOID projects');
          const label = document.createElement('span');
          label.className = 'room-ecosystem-label';
          label.textContent = 'Related paths';
          const links = document.createElement('div');
          links.className = 'room-related-links';
          relatedIds.forEach(relatedId => {
            const relatedInfo = ROOM_INFO[relatedId];
            if (!relatedInfo) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'room-related-link';
            button.dataset.relatedProject = relatedId;
            button.textContent = projectDisplayTitle(relatedId, relatedInfo.title);
            button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openUniverseProject(relatedId);});
            links.appendChild(button);
          });
          if (links.childElementCount) { related.append(label, links); body.appendChild(related); }
        }
        article.append(cardHead, body);
        syncRoomFavoriteButtons(roomId);
        return article;
      }

      function updateProjectCount() {
        // Count includes all catalogue rooms, including Curioids and the native Sandbox OS workshop.
        const total = CATEGORIES.reduce((sum, category) => sum + category.rooms.length, 0);
        const count = $("#projectCount");
        if (count) count.textContent = `${total} Projects`;
        document.documentElement.dataset.projectCount = String(total);
        return total;
      }

      const STUDIO_TOOL_FILTERS = Object.freeze([
        { id: "all", label: "All", rooms: ["vanta-deck", "devtoys", "color-alchemist", "type-foundry", "idea-tumbler", "texture-press", "sprite-sheet-studio", "vector-mark-studio", "layout-composer", "palette-extractor", "gradient-atlas", "contact-sheet", "pixel-sort-lab", "shape-composer", "icon-set-studio", "print-room", "poster-press"] },
        { id: "workbench", label: "Workbench", rooms: ["vanta-deck", "devtoys"] },
        { id: "color", label: "Color", rooms: ["color-alchemist", "palette-extractor", "gradient-atlas"] },
        { id: "image", label: "Image", rooms: ["texture-press", "sprite-sheet-studio", "contact-sheet", "pixel-sort-lab"] },
        { id: "vector", label: "Vector", rooms: ["vector-mark-studio", "shape-composer", "icon-set-studio"] },
        { id: "layout", label: "Layout", rooms: ["type-foundry", "layout-composer", "print-room", "poster-press"] },
        { id: "ideas", label: "Ideas", rooms: ["idea-tumbler"] }
      ]);
      let activeStudioToolFilter = "all";
      const STANDALONE_PROJECT_FILES = Object.freeze({
        "dark-looper": { file: "music-audio-apps.html", app: "dark-looper", title: "D4RK L00P3R" },
        "vanta-deck": { file: "applications-tools-apps.html", app: "vanta-deck", title: "VANTA DECK" },
        "devtoys": { file: "applications-tools-apps.html", app: "devtoys", title: "GLITCHYARD" }
      });
      const STANDALONE_PROJECT_IDS = new Set(["dark-looper", "vanta-deck", "devtoys"]);
      function renderStudioToolFilters() {
        const wrapper = document.createElement("div");
        wrapper.className = "studio-filter-row";
        wrapper.setAttribute("role", "group");
        wrapper.setAttribute("aria-label", "Filter Applications & Tools by workflow");
        STUDIO_TOOL_FILTERS.forEach(filter => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "studio-filter-button";
          button.dataset.studioFilter = filter.id;
          button.setAttribute("aria-pressed", String(filter.id === activeStudioToolFilter));
          button.textContent = `${filter.label} ${filter.rooms.length}`;
          wrapper.appendChild(button);
        });
        return wrapper;
      }
      function syncStudioToolFilters() {
        document.querySelectorAll("[data-studio-filter]").forEach(button => {
          const selected = button.dataset.studioFilter === activeStudioToolFilter;
          button.classList.toggle("is-active", selected);
          button.setAttribute("aria-pressed", String(selected));
        });
      }

      function renderCategories() {
        updateProjectCount();
        const host = $("#categorySections");
        host.replaceChildren();
        ROOM_CARD_BY_ID.clear();
        CATEGORY_SECTION_BY_ID.clear();
        ROOM_SEARCH_TEXT_BY_ID.clear();
        CATEGORY_NAV_BY_ID.clear();
        $$(".nav-item[data-category]", $("#categoryNav")).forEach(button => CATEGORY_NAV_BY_ID.set(button.dataset.category, button));
        CATEGORIES.forEach(category => {
          const section = document.createElement("section");
          section.className = "category-section";
          section.id = `category-${category.id}`;
          section.dataset.categorySection = category.id;
          const heading = document.createElement("header");
          heading.className = "category-heading";
          const copy = document.createElement("div");
          copy.className = "category-heading-copy";
          const kicker = document.createElement("p");
          kicker.className = "category-kicker";
          kicker.textContent = category.kicker;
          const title = document.createElement("h2");
          title.className = "category-title";
          title.textContent = category.title;
          const description = document.createElement("p");
          description.className = "category-description";
          description.textContent = category.description;
          copy.append(kicker, title, description);
          const count = document.createElement("span");
          count.className = "category-count";
          count.textContent = `${String(category.rooms.length).padStart(2,"0")} PROJECTS`;
          heading.append(copy, count);
          const list = document.createElement("div");
          list.className = "room-list";
          list.id = `list-${category.id}`;
          list.setAttribute("aria-label", `${category.title} projects`);
          category.rooms.forEach((roomId,index) => {
            const card = createRoomCard(roomId,index);
            ROOM_CARD_BY_ID.set(roomId, card);
            const info = ROOM_INFO[roomId];
            const profile = CURIOID_PROJECT_PROFILES.get(roomId);
            const relatedNames = (profile?.relatedProjectIds || []).map(relatedId => projectDisplayTitle(relatedId, ROOM_INFO[relatedId]?.title || relatedId)).join(' ');
            ROOM_SEARCH_TEXT_BY_ID.set(roomId, `${projectDisplayTitle(roomId, info.title)} ${info.title} ${info.description} ${info.copy || ""} ${category.title} ${profile?.role || ''} ${relatedNames}`.toLocaleLowerCase());
            list.appendChild(card);
          });
          if (category.id === "creative-tools") section.append(heading, renderStudioToolFilters(), list);
          else section.append(heading,list);
          CATEGORY_SECTION_BY_ID.set(category.id, section);
          host.appendChild(section);
        });
        renderPersonalShortcuts();
      }

      const markCurioidPerformance = name => { try { performance.mark(name); } catch (_) {} };
      const measureCurioidPerformance = (name, start, end) => { try { performance.measure(name, start, end); } catch (_) {} };
      let curioidAssetTimingSequence = 0;
      const startCurioidAssetTiming = kind => {
        const token = `curioid:${kind}:${++curioidAssetTimingSequence}`;
        markCurioidPerformance(`${token}:start`);
        return token;
      };
      const finishCurioidAssetTiming = token => {
        if (!token) return;
        markCurioidPerformance(`${token}:ready`);
        measureCurioidPerformance(`${token}:load`, `${token}:start`, `${token}:ready`);
      };
      const finishCurioidProjectLaunch = room => {
        const mark = room?._curioidPerfMark;
        if (!mark) return;
        markCurioidPerformance(`${mark}:ready`);
        measureCurioidPerformance(`curioid:project-launch:${room.dataset.room || 'unknown'}`, `${mark}:start`, `${mark}:ready`);
        room._curioidPerfMark = null;
      };
      let projectAssetsPromise = null;
      let projectCssPromise = null;
      let projectCssError = null;
      let retryProjectCss = null;
      // Each category bundle contains only its own project modules. The shared
      // core owns storage, Kernel, navigation and lifecycle APIs; modules are
      // evaluated only after a visitor opens a project in that category.
      const PROJECT_CATEGORY_ASSETS = Object.freeze({
        "operating-systems": { file: "projects-category-operating-systems.js", hash: "fd1ff507be4e21803aed39c7b5c76b9753e7477385e8c5a3a5f055e10261f25f", integrity: "sha384-3Az+IxvAshe4QOpRklBanFxEp/Pio75cx81GLCOgFomNgiRCSY8IdJjAzxCccSaz" },
        "strange-archives": { file: "projects-category-strange-archives.js", hash: "3651db00b5b2ea3aa8ccd5903abbe585553f80d89ad6bef2656d4fa45fdc732f", integrity: "sha384-/ZclGiKVY4BowmcmakT4vnS9Ons3SPWDSKni0EsvvLy80Ro2J4AR6ey8zN5Om0+b" },
        "web-experiments": { file: "projects-category-web-experiments.js", hash: "86d0d00776c8404a8659ec63aabda6ed1b38cbc426a73a7e79ff50fcdae463a2", integrity: "sha384-5SSpZm1AjCJKMi9ldk9jCjRaCWn+H/GIGo7cbCEh1lUP50s5jyIJ2GFKUzrPvHJP" },
        "tiny-games": { file: "projects-category-tiny-games.js", hash: "bebe9ab361e4830d53d0e23da411049e92a6316fced463ed365ed0cc3d224369", integrity: "sha384-i/JIYZ2Z/K6DjCXohAKlGuR9evR/U0+Nmd5nwv5OvftDJIJa98OpPyJXJ9O4ebBk" },
        "digital-art": { file: "projects-category-digital-art.js", hash: "f28f7b7b3b1c560819c9441d8cd6bef40cb039eaca41b0c55ca68695203f7359", integrity: "sha384-VwYR5dqo11wcc2DRNmH2XqR/eGdBXnkim2/9KL3PyiOv5n2gEb89SUE9OnLy7s+e" },
        "sound-motion": { file: "projects-category-sound-motion.js", hash: "fd42798a4518cd5f72ac93393e8103b1d370a70af605791c583eb69a5878a0eb", integrity: "sha384-PdhfxOZf1nqVqMHD6+ZQZLev6oATk/6JL0VCp7E/ZKvbV88tiP6+l3l0ZxoOrf0/" },
        "creative-tools": { file: "projects-category-creative-tools.js", hash: "7a7aac242ec21861c4f7538ab3516035d9bf36b10b495e039b40ad78a4e81c7e", integrity: "sha384-i1B2H+FvI8W0aag8l4nD7cOMq6RKdUioShOdhc4jEsqjHzOr0R0jy8oqFu9VKvSY" }
      });
      function ensureProjectAssets() {
        // A file:// page has an opaque origin in modern browsers. Do not try to
        // mix local files with a remote copy of another release: SRI must reject
        // that mismatch. Serve this folder over localhost or deploy it over HTTPS.
        if (window.location.protocol === "file:") {
          const error = new Error("CURIOID cannot run by double-clicking index.html (file://). Keep all core CURIOID website files together and either run Start-CURIOID-Local.bat in this folder (Python 3 required), or publish the files to your GitHub Pages site and open its HTTPS address.");
          error.code = "CURIOID_FILE_PROTOCOL_UNSUPPORTED";
          error.attemptedUrls = [];
          return Promise.reject(error);
        }
        if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
          const error = new Error(`CURIOID requires an HTTP or HTTPS origin; the current protocol is ${window.location.protocol || "unknown"}.`);
          error.code = "CURIOID_UNSUPPORTED_PROTOCOL";
          return Promise.reject(error);
        }
        const cssLoaded = Boolean(document.querySelector('[data-curioid-project-css][data-loaded="true"]'));
        const jsLoaded = Boolean(window.CurioidProjects);
        if (cssLoaded) projectCssError = null;
        if (cssLoaded && jsLoaded) return Promise.resolve(window.CurioidProjects);
        if (projectAssetsPromise) return projectAssetsPromise;
        markCurioidPerformance('curioid:shared-assets:start');

        const getProjectAssetUrls = (file, hash) => {
          const current = new URL(window.location.href);
          const directoryOf = value => {
            const url = new URL(value, current.href);
            return url.pathname.endsWith("/")
              ? url.pathname
              : url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1) || "/";
          };
          const candidates = [];
          const addCandidate = (origin, directory) => {
            if (!origin || !directory) return;
            const candidate = new URL(file, `${origin}${directory}`);
            candidate.searchParams.set("v", `sha256-${hash}`);
            if (!candidates.includes(candidate.href)) candidates.push(candidate.href);
          };
          addCandidate(current.origin, directoryOf(current.href));
          try {
            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) {
              const canonicalUrl = new URL(canonical.href, current.href);
              const canonicalDirectory = directoryOf(canonicalUrl.href);
              // Only use the current release's origin. A cross-origin canonical
              // fallback can redirect to a different deployment/release; SRI would
              // correctly reject it, while the user would only see a misleading load
              // error. Deployment aliases should serve assets on the page's own origin.
              if (canonicalUrl.origin === current.origin) {
                addCandidate(canonicalUrl.origin, canonicalDirectory);
              }
            }
          } catch (_) {}
          return candidates;
        };

        const loadAssetWithFallback = ({ type, file, hash, integrity, expected, isReady, markReady }) => {
          const urls = getProjectAssetUrls(file, hash);
          const failures = [];
          const attempt = index => {
            if (index >= urls.length) {
              const details = failures.map(item => `${item.url}: ${item.reason}`).join("; ");
              const error = new Error(`${expected} could not be loaded. Tried ${details || urls.join(", ")}. Check that ${file} is beside index.html with the exact lowercase filename and belongs to the same release. If an older CURIOID tab or cached service worker is active, close other CURIOID tabs and use Control Panel → Health Check → Refresh service-worker registration.`);
              error.code = "CURIOID_PROJECT_ASSET_LOAD_FAILED";
              error.attemptedUrls = urls.slice();
              error.failures = failures.slice();
              window.__CURIOID_LAST_ASSET_LOAD_FAILURE = {
                file, urls: urls.slice(), failures: failures.slice(),
                page: window.location.href, time: new Date().toISOString()
              };
              console.error("CURIOID project asset loading failed", { file, urls, failures, page: window.location.href, canonical: document.querySelector('link[rel="canonical"]')?.href || null });
              return recoverStaleWorkerAfterAssetFailure().then(recovered => {
                if (recovered) throw scheduleWorkerRecoveryReload();
                if (window.__CURIOID_SW_UPDATE_BLOCKED) error.message += ` A newer service worker could not activate because ${window.__CURIOID_SW_UPDATE_BLOCKED === null ? 'the tab count could not be verified' : Math.max(1,Number(window.__CURIOID_SW_UPDATE_BLOCKED)-1)+' other CURIOID tab(s) are open'}.`;
                throw error;
              });
            }
            return new Promise((resolve, reject) => {
              const element = document.createElement(type);
              if (type === "link") {
                element.rel = "stylesheet";
                element.dataset.curioidProjectCss = "true";
              } else {
                element.async = true;
              }
              const assetUrl = new URL(urls[index]);
              // SRI must use a CORS-enabled request if an edge redirect changes host.
              element.crossOrigin = "anonymous";
              // Prevent Cloudflare Rocket Loader from rewriting execution order.
              element.setAttribute("data-cfasync", "false");
              element.integrity = integrity;
              element.referrerPolicy = "strict-origin-when-cross-origin";
              if (type === "link") element.href = urls[index];
              else element.src = urls[index];
              let settled = false;
              const timeout = setTimeout(() => finish(new Error("request timed out")), 12000);
              const cleanup = () => {
                clearTimeout(timeout);
                element.removeEventListener("load", onLoad);
                element.removeEventListener("error", onError);
              };
              const finish = error => {
                if (settled) return;
                settled = true;
                cleanup();
                if (error) {
                  failures.push({ url: urls[index], reason: error.message || "network, CSP, or integrity failure" });
                  element.remove();
                  attempt(index + 1).then(resolve, reject);
                  return;
                }
                if (isReady && !isReady()) {
                  failures.push({ url: urls[index], reason: "resource loaded but did not initialize" });
                  element.remove();
                  attempt(index + 1).then(resolve, reject);
                  return;
                }
                if (markReady) markReady(element);
                resolve(element);
              };
              const onLoad = () => finish();
              const onError = () => finish(new Error("HTTP, Content Security Policy, or Subresource Integrity failure"));
              element.addEventListener("load", onLoad, { once: true });
              element.addEventListener("error", onError, { once: true });
              try { document.head.appendChild(element); }
              catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
            });
          };
          return attempt(0);
        };

        const PROJECT_STYLES_FILE = "projects-styles.txt";
        const PROJECT_STYLES_SHA256 = "a847d1b34f8cbe820f4ae5479c8d17001d837e5648cb7a2e7dd8959a61835257";
        const loadProjectCss = ({ retry = false } = {}) => {
          if (document.querySelector('[data-curioid-project-css][data-loaded="true"]')) {
            projectCssError = null;
            return Promise.resolve(true);
          }
          if (projectCssPromise && !retry) return projectCssPromise;
          if (retry) projectCssPromise = null;
          const previous = document.querySelector('[data-curioid-project-css]');
          if (previous) previous.remove();
          const cssTiming = startCurioidAssetTiming('project-css');
          const urls = getProjectAssetUrls(PROJECT_STYLES_FILE, PROJECT_STYLES_SHA256);
          const failures = [];
          const loadFrom = async index => {
            if (index >= urls.length) {
              const details = failures.map(item => `${item.url}: ${item.reason}`).join('; ');
              const error = new Error(`Project styles could not be verified. Tried ${details || urls.join(', ')}. Check ${PROJECT_STYLES_FILE} beside index.html and deploy the matching release.`);
              error.code = 'CURIOID_PROJECT_STYLES_UNAVAILABLE';
              error.attemptedUrls = urls.slice();
              error.failures = failures.slice();
              window.__CURIOID_LAST_ASSET_LOAD_FAILURE = {file:PROJECT_STYLES_FILE,urls:urls.slice(),failures:failures.slice(),page:location.href,time:new Date().toISOString()};
              throw error;
            }
            const url = urls[index];
            try {
              const response = await fetch(url, {method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'follow'});
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const bytes = await response.arrayBuffer();
              if (!crypto?.subtle?.digest) throw new Error('Web Crypto SHA-256 is unavailable');
              const digest = await crypto.subtle.digest('SHA-256', bytes);
              const actual = [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
              if (actual !== PROJECT_STYLES_SHA256) throw new Error(`SHA-256 mismatch (expected ${PROJECT_STYLES_SHA256}, received ${actual}; ${bytes.byteLength.toLocaleString()} bytes)`);
              const source = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
              const style = document.createElement('style');
              style.dataset.curioidProjectCss = 'true';
              style.dataset.loaded = 'true';
              style.dataset.source = PROJECT_STYLES_FILE;
              style.textContent = source;
              document.head.appendChild(style);
              if (!style.sheet) { style.remove(); throw new Error('The browser did not create a usable stylesheet under the current Content Security Policy'); }
              return style;
            } catch (error) {
              failures.push({url,reason:String(error?.message||error).slice(0,240)});
              return loadFrom(index+1);
            }
          };
          projectCssPromise = loadFrom(0).then(() => {
            finishCurioidAssetTiming(cssTiming);
            projectCssError = null;
            projectCssPromise = Promise.resolve(true);
            document.querySelectorAll('[data-project-style-warning]').forEach(node => node.remove());
            return true;
          }).catch(error => {
            finishCurioidAssetTiming(cssTiming);
            projectCssError = error;
            projectCssPromise = Promise.resolve(false);
            document.querySelectorAll('.room-window.open .room-mount').forEach(mount => {
              const room = mount.closest('.room-window');
              if (room && (room.dataset.loaded === 'true' || room.dataset.loading === 'true')) attachProjectStyleWarning(mount);
            });
            return false;
          });
          return projectCssPromise;
        };
        retryProjectCss = () => loadProjectCss({ retry: true });
        const loadProjectJs = () => {
          if (window.CurioidProjects) return Promise.resolve();
          const jsTiming = startCurioidAssetTiming('project-js');
          return loadAssetWithFallback({
            type: "script",
            file: "projects-core.js", hash: "28565ac06f927183b39363a2cf09473dbccf6aab80486c5fd905b087061857bc", integrity: "sha384-BadUw0WbUSn+VPJ+GF8ru5zgnkNtJ4HdG2wmw8bY5GPDQhp1OK4IJmuv9PTgFw40",
            expected: "Project code",
            isReady: () => Boolean(window.CurioidProjects),
            markReady: element => {
              // Secondary lazy assets follow the exact verified host/path
              // that supplied this runtime (including canonical-host fallback).
              try {
                const loadedUrl = new URL(element.src, window.location.href);
                loadedUrl.search = "";
                loadedUrl.hash = "";
                window.CURIOID_PROJECT_ASSET_BASE_URL = new URL(".", loadedUrl).href;
              } catch (_) {}
            }
          }).then(value => { finishCurioidAssetTiming(jsTiming); return value; }, error => { finishCurioidAssetTiming(jsTiming); throw error; });
        };

        // Start the stylesheet request before the project script and wait until
        // the stylesheet either loads or reaches its explicit failure/retry state.
        // Project mounts can measure layout during initialization, so mounting
        // against an unstyled DOM is unsafe even when the JavaScript is ready.
        // A stylesheet failure remains non-fatal: loadProjectCss converts it to
        // false, then the runtime starts and each mount receives a retry warning.
        let cssReady;
        try { cssReady = loadProjectCss({retry:Boolean(projectCssError)}); }
        catch (error) { cssReady = Promise.reject(error); }
        cssReady = Promise.resolve(cssReady).catch(error => {
          projectCssError = error;
          projectCssPromise = Promise.resolve(false);
          return false;
        });
        const jsReady = loadProjectJs();
        projectAssetsPromise = Promise.all([cssReady, jsReady])
          .then(([stylesReady]) => {
            if (!stylesReady) {
              const error = projectCssError || new Error('Project styles could not be verified. The app was kept closed to prevent a broken, unstyled interface. Check the deployment assets and use the Refresh control in Health Check if an older service worker is active.');
              error.code = error.code || 'CURIOID_PROJECT_STYLES_UNAVAILABLE';
              throw error;
            }
            const projects = window.CurioidProjects;
            if (!projects) throw new Error("Project core did not initialize.");
            projects.setCategoryLoader(async categoryId => {
              const asset = PROJECT_CATEGORY_ASSETS[categoryId];
              if (!asset) throw new Error(`No category bundle is configured for ${categoryId}.`);
              const started = startCurioidAssetTiming(`project-category-${categoryId}`);
              try {
                await loadAssetWithFallback({
                  type: "script", file: asset.file, hash: asset.hash, integrity: asset.integrity,
                  expected: `${categoryId} project modules`,
                  isReady: () => projects.isCategoryLoaded(categoryId)
                });
                finishCurioidAssetTiming(started);
              } catch (error) {
                finishCurioidAssetTiming(started);
                throw error;
              }
            });
            markCurioidPerformance('curioid:shared-assets:ready');
            measureCurioidPerformance('curioid:shared-assets:load', 'curioid:shared-assets:start', 'curioid:shared-assets:ready');
            return projects;
          })
          .catch(error => { projectAssetsPromise = null; throw error; });
        return projectAssetsPromise;
      }

      // Ask the current release's waiting/active service worker to claim this
      // client when safe, then precache every critical project asset by exact hash.
      // This also works on a first page load before a worker controls the document.
      async function sendCurrentWorkerCommand(type, timeoutMs = 60000) {
        const serviceWorker = navigator.serviceWorker;
        if (!serviceWorker || typeof MessageChannel !== "function") return { available:false, reason:"Service Worker messaging or MessageChannel is unavailable." };
        const serviceRoot = new URL(".", location.href);
        let registration = null;
        try {
          // Refresh the registration metadata without activating a waiting worker.
          // This ensures the current release can receive the diagnostic pre-cache
          // command even when the site was opened before its update finished.
          registration = await serviceWorker.register(new URL("service-worker-current.js?release=v1.323", serviceRoot).href, {scope:serviceRoot.pathname, updateViaCache:"none"});
          await Promise.race([registration.update(), new Promise((_,reject)=>setTimeout(()=>reject(new Error("Service-worker update check timed out")), Math.min(timeoutMs,15000)))]);
        } catch (error) {
          try { registration = await serviceWorker.getRegistration(serviceRoot.href); } catch (_) {}
          if (!registration) return { available:false, reason:String(error?.message || error).slice(0,220) };
        }
        const isCurrent = worker => {
          try {
            const url = new URL(worker?.scriptURL || "");
            return url.pathname.endsWith("/service-worker-current.js") && url.searchParams.get("release") === "v1.323";
          } catch (_) { return false; }
        };
        if (!isCurrent(registration?.waiting) && isCurrent(registration?.installing)) {
          const installing = registration.installing;
          try {
            await new Promise(resolve => {
              if (!installing || ["installed","activated","redundant"].includes(installing.state)) return resolve();
              const finish = () => { installing.removeEventListener("statechange", onState); resolve(); };
              const onState = () => { if (["installed","activated","redundant"].includes(installing.state)) finish(); };
              installing.addEventListener("statechange", onState);
              setTimeout(finish, Math.min(timeoutMs,15000));
            });
          } catch (_) {}
          try { registration = await serviceWorker.getRegistration(serviceRoot.href) || registration; } catch (_) {}
        }
        const worker = isCurrent(registration?.waiting) ? registration.waiting : isCurrent(registration?.active) ? registration.active : null;
        if (!worker) return { available:false, reason:"No current v1.323 worker finished installing. The service-worker update may still be downloading.", active:registration?.active?.scriptURL || null, waiting:registration?.waiting?.scriptURL || null, installing:registration?.installing?.scriptURL || null };
        const send = (command, limit) => new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          let settled = false;
          const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            channel.port1.onmessage = null;
            try { channel.port1.close(); channel.port2.close(); } catch (_) {}
            error ? reject(error) : resolve(value);
          };
          const timer = setTimeout(() => finish(new Error(`${command} timed out`)), limit);
          channel.port1.onmessage = event => finish(null, event.data || { ok:false, reason:"Worker returned an empty response." });
          channel.port1.onmessageerror = () => finish(new Error(`${command} response could not be decoded`));
          try { worker.postMessage({ type:command, release:"v1.323" }, [channel.port2]); }
          catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
        });
        if (worker === registration?.active && !serviceWorker.controller) {
          try {
            const claim = await send("CURIOID_CLAIM_CONTROL", Math.min(9000, timeoutMs));
            if (!claim?.ok) return { available:true, controlled:false, claim, precache:null };
          } catch (error) { return { available:true, controlled:false, reason:String(error?.message || error), precache:null }; }
        }
        if (type === "CURIOID_CLAIM_CONTROL") return send(type, timeoutMs);
        const result = await send(type, timeoutMs);
        return { ...result, available:true, controlled:Boolean(serviceWorker.controller), workerScript:worker.scriptURL };
      }

      // Explicit, on-demand deep diagnostics. Categories are loaded through the
      // public projects.loadCategoryForId() entry point, which is exactly what an
      // app launch uses. The private SRI loader remains private by design.
      // No project is mounted and no project data is written.
      window.CurioidSiteDiagnostics = Object.freeze({
        async loadAllProjectCategories() {
          const projects = await ensureProjectAssets();
          const manifest = projects.getCategoryManifest?.();
          if (!Array.isArray(manifest) || manifest.length !== Object.keys(PROJECT_CATEGORY_ASSETS).length) {
            throw new Error(`Project category manifest is unavailable or incomplete (${Array.isArray(manifest) ? manifest.length : 0} categories).`);
          }
          const results = [];
          for (const entry of manifest) {
            const category = String(entry.category || "");
            const asset = PROJECT_CATEGORY_ASSETS[category];
            const ids = Array.isArray(entry.ids) ? entry.ids : [];
            const startedAt = performance.now();
            try {
              if (!asset) throw new Error(`No verified asset descriptor exists for ${category || "unknown category"}.`);
              if (!ids.length) throw new Error(`The ${category} category has no project IDs to use for its smoke test.`);
              if (!projects.isCategoryLoaded(category)) await projects.loadCategoryForId(ids[0]);
              const loaded = projects.isCategoryLoaded(category);
              results.push({ category, file:asset.file, ok:loaded,
                moduleCount:ids.length, durationMs:Math.round(performance.now() - startedAt) });
            } catch (error) {
              results.push({ category, file:asset?.file || null, ok:false, error:String(error?.message || error).slice(0,320),
                durationMs:Math.round(performance.now() - startedAt) });
            }
          }
          let precache = null;
          try { precache = await sendCurrentWorkerCommand("CURIOID_PRECACHE_CURRENT_RELEASE", 60000); }
          catch (error) { precache = { available:false, ok:false, reason:String(error?.message || error).slice(0,240) }; }
          return { results, registry:projects.inspectRegistry?.() || null,
            projectCount:projects.ids?.length || 0, loadedCategories:projects.getLoadedCategories?.() || [],
            stylesLoaded:Boolean(document.querySelector('[data-curioid-project-css][data-loaded="true"]')), precache };
        },
        async precacheCurrentReleaseAssets() { return sendCurrentWorkerCommand("CURIOID_PRECACHE_CURRENT_RELEASE", 60000); },
        retryProjectStyles() { return retryProjectCss ? retryProjectCss() : Promise.resolve(false); },
        getProjectStyleStatus() {
          return { loaded: Boolean(document.querySelector('[data-curioid-project-css][data-loaded="true"]')),
            failed: Boolean(projectCssError), error: projectCssError ? String(projectCssError.message || projectCssError).slice(0, 320) : null };
        },
        prepareServiceWorkerUpdate() {
          return typeof refreshCurioidWorker === "function"
            ? refreshCurioidWorker({ activateWaiting: false, timeoutMs: 15000 })
            : Promise.resolve({ available: false });
        }
      });

      // Hint the browser to fetch the shared runtime at low priority after
      // genuine browsing intent. Unlike the old warm-up, this never injects or
      // executes the 1.29 MB bundle while the visitor is only browsing cards.
      // The real app-open path still performs SHA-256/SRI verification before use.
      const SHARED_PREFETCH_ASSETS = Object.freeze([
        { file: "projects-core.js", hash: "28565ac06f927183b39363a2cf09473dbccf6aab80486c5fd905b087061857bc", as: "script" },
        { file: "projects-styles.txt", hash: "a847d1b34f8cbe820f4ae5479c8d17001d837e5648cb7a2e7dd8959a61835257", as: "fetch" }
      ]);
      let projectPrefetchScheduled = false;
      const projectPrefetchHints = new Set();
      const projectPrefetchRequestedCategories = new Set();
      function scheduleSharedRuntimePrefetch(categoryId = null) {
        // Category navigation is a stronger signal than general pointer movement:
        // warm only the selected category, never every bundle in the catalogue.
        if (categoryId && PROJECT_CATEGORY_ASSETS[categoryId] &&
            !window.CurioidProjects?.isCategoryLoaded?.(categoryId)) {
          projectPrefetchRequestedCategories.add(categoryId);
        }
        const needsSharedRuntime = !window.CurioidProjects && !projectAssetsPromise &&
          SHARED_PREFETCH_ASSETS.some(asset => !projectPrefetchHints.has(asset.file));
        const needsCategoryBundle = [...projectPrefetchRequestedCategories].some(id => {
          const asset = PROJECT_CATEGORY_ASSETS[id];
          return asset && !projectPrefetchHints.has(asset.file) &&
            !window.CurioidProjects?.isCategoryLoaded?.(id);
        });
        if (projectPrefetchScheduled || document.hidden || (!needsSharedRuntime && !needsCategoryBundle)) return;
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const effectiveType = String(connection?.effectiveType || "").toLowerCase();
        if (connection?.saveData || ["slow-2g", "2g", "3g"].includes(effectiveType) ||
            (Number.isFinite(connection?.downlink) && connection.downlink > 0 && connection.downlink < 2.5) ||
            (Number.isFinite(connection?.rtt) && connection.rtt > 500)) return;
        projectPrefetchScheduled = true;
        const begin = () => {
          projectPrefetchScheduled = false;
          if (document.hidden) return;
          let base;
          try {
            const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
            base = new URL(".", canonical);
            if (base.origin !== location.origin) base = new URL(".", location.href);
          } catch (_) { base = new URL(".", location.href); }
          const assets = [
            ...(window.CurioidProjects || projectAssetsPromise ? [] : SHARED_PREFETCH_ASSETS),
            ...[...projectPrefetchRequestedCategories]
              .filter(id => !window.CurioidProjects?.isCategoryLoaded?.(id))
              .map(id => PROJECT_CATEGORY_ASSETS[id] ? { ...PROJECT_CATEGORY_ASSETS[id], as: "script" } : null)
              .filter(Boolean)
          ];
          for (const asset of assets) {
            if (projectPrefetchHints.has(asset.file)) continue;
            const url = new URL(asset.file, base);
            if (url.origin !== location.origin) continue;
            url.searchParams.set("v", `sha256-${asset.hash}`);
            const hint = document.createElement("link");
            hint.rel = "prefetch";
            hint.as = asset.as;
            hint.href = url.href;
            hint.crossOrigin = "anonymous";
            hint.referrerPolicy = "strict-origin-when-cross-origin";
            try { hint.fetchPriority = "low"; } catch (_) {}
            hint.dataset.curioidRuntimePrefetch = asset.file;
            hint.addEventListener("error", () => { projectPrefetchHints.delete(asset.file); hint.remove(); }, { once: true });
            document.head.appendChild(hint);
            projectPrefetchHints.add(asset.file);
          }
        };
        if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(begin, { timeout: 2500 });
        else window.setTimeout(begin, 1600);
      }

      function attachProjectStyleWarning(mount) {
        if (!projectCssError || !mount || mount.querySelector('[data-project-style-warning]')) return;
        const warning = document.createElement("aside");
        warning.className = "project-style-warning";
        warning.dataset.projectStyleWarning = "true";
        warning.setAttribute("role", "status");
        const message = document.createElement("p");
        const failedUrls = projectCssError.attemptedUrls?.join("; ") || "the configured projects-styles.txt URL";
        message.textContent = `The app runtime loaded, but its visual stylesheet did not. Tried: ${failedUrls}. Check that projects-styles.txt is in the same deployment folder as index.html, then retry.`;
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Retry styles";
        retry.addEventListener("click", async () => {
          retry.disabled = true;
          retry.textContent = "Retrying…";
          const loaded = await (retryProjectCss ? retryProjectCss() : Promise.resolve(false));
          if (!loaded && warning.isConnected) {
            message.textContent = `Styles still unavailable: ${projectCssError?.message || "unknown loading error"}`;
            retry.disabled = false;
            retry.textContent = "Try again";
          }
        });
        warning.append(message, retry);
        mount.prepend(warning);
      }

      function installAdaptiveProjectFit(room) {
        const body=room.querySelector('.room-body');
        const mount=room.querySelector('.room-mount');
        const root=mount?.querySelector(':scope > .project-tool') || [...(mount?.children||[])].find(node=>node.nodeType===1&&!node.classList.contains('project-style-warning')&&node.tagName!=='IFRAME');
        if(!body||!mount||!root)return;
        const disclosure=root.querySelector?.('.tool-controls-disclosure');
        if(disclosure&&!disclosure.dataset.curioidAutoPrepared){
          const groups=disclosure.querySelectorAll('.tool-panel').length;
          const controls=disclosure.querySelectorAll('input,select,textarea,button').length;
          const density=Math.max(groups,Math.ceil(controls/8));
          const viewportHeight=window.visualViewport?.height||window.innerHeight;
          const compact=window.matchMedia('(max-width: 920px)').matches||viewportHeight<760||density>=5;
          disclosure.open=!compact;
          disclosure.dataset.curioidAutoPrepared='true';
          const summary=disclosure.querySelector('summary');
          const updateLabel=()=>{if(summary)summary.textContent=`CONTROLS & OPTIONS · ${groups||density} GROUP${(groups||density)===1?'':'S'} · ${disclosure.open?'OPEN':'COLLAPSED'}`;};
          disclosure.addEventListener('toggle',updateLabel);
          updateLabel();
        }
        if(!window.CSS?.supports?.('zoom','1'))return;
        const originalZoom=root.style.zoom;
        let frame=0,disposed=false,lastZoom=1;
        const update=()=>{
          cancelAnimationFrame(frame);
          frame=requestAnimationFrame(()=>{
            if(disposed||!root.isConnected||!room.classList.contains('open'))return;
            const width=Math.max(260,body.clientWidth-28);
            const height=Math.max(240,body.clientHeight-28);
            const currentZoom=Math.max(.01,Number.parseFloat(root.style.zoom)||1);
            const rect=root.getBoundingClientRect();
            // scrollWidth/scrollHeight can be reported in the element's layout
            // coordinate space while getBoundingClientRect is visually zoomed.
            // Normalize both to the unzoomed coordinate space without toggling
            // zoom back to 1 (which would create a ResizeObserver feedback loop).
            const naturalWidth=Math.max(rect.width/currentZoom,root.scrollWidth);
            const naturalHeight=Math.max(rect.height/currentZoom,root.scrollHeight);
            let next=Math.min(1,width/Math.max(1,naturalWidth),height/Math.max(1,naturalHeight));
            // Shrink dense clusters modestly; preserve readable text and let very
            // long apps scroll instead of becoming microscopic.
            next=Math.max(.68,Math.min(1,next));
            next=Math.round(next*1000)/1000;
            if(Math.abs(next-currentZoom)>.012)root.style.zoom=String(next);
            lastZoom=next;
            if(next<.995){room.dataset.curioidFit=`${Math.round(next*100)}%`;room.setAttribute('data-curioid-auto-fit','true');}
            else{delete room.dataset.curioidFit;room.removeAttribute('data-curioid-auto-fit');}
          });
        };
        const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null;
        observer?.observe(body);observer?.observe(mount);observer?.observe(root);
        window.addEventListener('resize',update,{passive:true});
        window.visualViewport?.addEventListener('resize',update,{passive:true});
        disclosure?.addEventListener('toggle',update);
        room._curioidFitCleanup=()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);disclosure?.removeEventListener('toggle',update);root.style.zoom=originalZoom;delete room.dataset.curioidFit;room.removeAttribute('data-curioid-auto-fit');};
        update();
      }

      function mountStandaloneProject(roomId, room, mount) {
        const project = STANDALONE_PROJECT_FILES[roomId];
        if (!project) return false;
        const frame = document.createElement("iframe");
        frame.className = "standalone-project-frame";
        frame.title = project.title;
        frame.loading = "eager";
        frame.referrerPolicy = "no-referrer";
        frame.allow = "autoplay; clipboard-read; clipboard-write";
        frame.setAttribute("allowfullscreen", "");
        let disposed = false;
        let observer = null;
        let resizeQueued = false;
        const resize = () => {
          if (disposed || resizeQueued) return;
          resizeQueued = true;
          requestAnimationFrame(() => {
            resizeQueued = false;
            if (disposed) return;
            try {
              const doc = frame.contentDocument;
              const body = doc?.body;
              const root = doc?.documentElement;
              if (!body || !root) return;
              const contentHeight = Math.max(body.scrollHeight, root.scrollHeight, body.offsetHeight, root.offsetHeight) + 16;
              const fullscreenHeight = room.classList.contains('curioid-fullscreen-window') ? room.querySelector('.room-body')?.clientHeight : 0;
              frame.style.height = fullscreenHeight > 0 ? `${fullscreenHeight}px` : `${Math.max(760, Math.min(1900, contentHeight))}px`;
              if (!observer && typeof ResizeObserver === "function") {
                observer = new ResizeObserver(resize);
                observer.observe(root);
                observer.observe(body);
              }
            } catch (_) { /* Cross-origin/early document access is intentionally ignored. */ }
          });
        };
        frame.addEventListener("load", () => { resize(); finishCurioidProjectLaunch(room); }, { once: true });
        const base = window.CURIOID_PROJECT_ASSET_BASE_URL || new URL(".", window.location.href).href;
        const appUrl = new URL(project.file, base);
        appUrl.hash = project.app;
        frame.src = appUrl.href;
        mount.replaceChildren(frame);
        room._curioidCleanup = () => {
          if (disposed) return;
          disposed = true;
          observer?.disconnect();
          frame.removeEventListener("load", resize);
          try { frame.contentWindow?.postMessage({ type: "CURIOID_APP_DISPOSE" }, window.location.origin); } catch (_) {}
          frame.src = "about:blank";
        };
        return true;
      }

      function loadRoom(room) {
        const roomId = room.dataset.room;
        const mount = $(".room-mount", room);
        const launchToken = `${String(roomId).replace(/[^a-z0-9_-]/gi,'-')}:${Math.round(performance.now()*1000)}`;
        room._curioidPerfMark = `curioid:project:${launchToken}`;
        markCurioidPerformance(`${room._curioidPerfMark}:start`);
        if (room.dataset.loaded === "true" || room.dataset.loading === "true") return;
        mount.replaceChildren();
        // Regular projects use the shared module loader; Sandbox OS is a first-class
        // catalogue application mounted locally through the same room lifecycle.
        const loadToken = (room._loadToken || 0) + 1;
        room._loadToken = loadToken;
        room.dataset.loading = "true";
        room.setAttribute("aria-busy", "true");
        const status = createProjectLoadingStatus("Opening project…");
        mount.appendChild(status);
        if (STANDALONE_PROJECT_IDS.has(roomId)) {
          try {
            if (!room.isConnected || room._loadToken !== loadToken || !room.classList.contains("open")) {
              room.dataset.loading = "false";
              room.setAttribute("aria-busy", "false");
              return;
            }
            mount.replaceChildren();
            if (!mountStandaloneProject(roomId, room, mount)) throw new Error(`No standalone mount is registered for ${roomId}.`);
            room.dataset.loading = "false";
            room.dataset.loaded = "true";
            room.setAttribute("aria-busy", "false");
            window.dispatchEvent(new CustomEvent("curioid:room-mounted", { detail: { id: roomId } }));
          } catch (error) {
            room.dataset.loading = "false";
            room.dataset.loaded = "false";
            room.setAttribute("aria-busy", "false");
            mount.replaceChildren();
            const failure = document.createElement("div");
            failure.className = "project-load-error";
            failure.setAttribute("role", "alert");
            const message = document.createElement("p");
            message.textContent = error?.message || "This standalone project could not be opened.";
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "project-utility-button";
            retry.textContent = "Try again";
            retry.addEventListener("click", () => loadRoom(room), { once: true });
            failure.append(message, retry);
            mount.appendChild(failure);
            console.error("CURIOID standalone project load failed:", roomId, error);
          }
          return;
        }
        ensureProjectAssets().then(async projects => {
          if (!room.isConnected || room._loadToken !== loadToken) return;
          if (!room.classList.contains("open")) {
            room.dataset.loading = "false";
            room.setAttribute("aria-busy", "false");
            return;
          }
          // Load only the selected category's code. The complete catalogue and
          // stable project IDs are already registered in the shared core.
          if (roomId !== "sandbox-os") await projects.loadCategoryForId(roomId);
          if (!room.isConnected || room._loadToken !== loadToken || !room.classList.contains("open")) {
            room.dataset.loading = "false";
            room.setAttribute("aria-busy", "false");
            return;
          }
          mount.replaceChildren();
          if (roomId === "sandbox-os") {
            const feature = document.createElement("section");
            feature.className = "sandbox-os-catalog-feature";
            const copy = document.createElement("div");
            copy.className = "sandbox-os-catalog-copy";
            const kicker = document.createElement("p"); kicker.className = "sandbox-os-catalog-kicker"; kicker.textContent = "YOUR OS / YOUR RULES";
            const title = document.createElement("h3"); title.textContent = "Build a world of your own.";
            const description = document.createElement("p"); description.textContent = "Start simple, go fully custom, or combine both. Build and manage your personal operating systems in one local workshop.";
            const modes = document.createElement("div"); modes.className = "sandbox-os-mode-list";
            for (const [name, detail] of [["Basic","Ready-made modules. No code."],["Advanced","Your own interface and Worker logic."],["Hybrid","Basic tools plus your own additions."]]) {
              const item = document.createElement("span"); item.className = "sandbox-os-mode-pill";
              const strong = document.createElement("b"); strong.textContent = name;
              const small = document.createElement("small"); small.textContent = detail;
              item.append(strong, small); modes.appendChild(item);
            }
            const action = document.createElement("button"); action.type = "button"; action.className = "project-utility-button sandbox-os-open"; action.textContent = "Open Sandbox OS";
            action.addEventListener("click", async () => {
              action.disabled = true; action.setAttribute("aria-busy", "true");
              try {
                if (!window.CurioidUniverseStudio?.open) throw new Error("Sandbox OS is still initializing. Try again.");
                await window.CurioidUniverseStudio.open();
              } catch (error) { if (typeof showToast === "function") showToast(error.message || "Sandbox OS could not open."); }
              finally { if (action.isConnected) { action.disabled = false; action.removeAttribute("aria-busy"); } }
            });
            copy.append(kicker, title, description, modes, action);
            feature.appendChild(copy);
            mount.appendChild(feature);
            room._curioidCleanup = () => { action.disabled = true; };
          } else {
            if (!projects || !projects.ids.includes(roomId)) throw new Error(`No project module is registered for ${roomId}.`);
            room._curioidCleanup = projects.mount(roomId, mount, {
              toast(message, options) {
                if (typeof showToast === "function") showToast(message);
                addSiteNotification(message, roomId, options || {});
              }
            });
          }
          attachProjectStyleWarning(mount);
          installAdaptiveProjectFit(room);
          room.dataset.loading = "false";
          room.dataset.loaded = "true";
          room.setAttribute("aria-busy", "false");
          finishCurioidProjectLaunch(room);
          window.dispatchEvent(new CustomEvent('curioid:room-mounted', { detail: { id: roomId } }));
        }).catch(error => {
          if (error?.code === 'CURIOID_SW_RECOVERY_RELOAD') return;
          if (!room.isConnected || room._loadToken !== loadToken) return;
          room.dataset.loading = "false";
          room.setAttribute("aria-busy", "false");
          mount.replaceChildren();
          const failure = document.createElement("div");
          failure.className = "project-load-error";
          failure.setAttribute("role", "alert");
          const message = document.createElement("p");
          message.textContent = error && error.message ? error.message : "This project could not be opened.";
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "project-utility-button";
          retry.textContent = "Try again";
          retry.addEventListener("click", async () => {
            retry.disabled = true; retry.textContent = 'Retrying…';
            if (projectCssError && typeof retryProjectCss === 'function') await retryProjectCss();
            loadRoom(room);
          }, { once: true });
          failure.append(message, retry);
          mount.appendChild(failure);
          console.error("CURIOID project load failed:", roomId, error);
        });
      }

      function unloadRoom(room) {
        room._loadToken = (room._loadToken || 0) + 1;
        try { room._curioidFitCleanup?.(); } catch (_) {}
        room._curioidFitCleanup = null;
        room.dataset.loading = "false";
        room.setAttribute("aria-busy", "false");
        if (typeof room._curioidCleanup === "function") {
          try { room._curioidCleanup(); } catch (error) { console.warn("CURIOID cleanup issue:", error); }
          room._curioidCleanup = null;
        }
        const mount = $(".room-mount", room);
        if (mount) mount.replaceChildren();
        room.dataset.loaded = "false";
      }

      function setRoomOpen(room, open, shouldScroll = false) {
        const roomId = room.dataset.room;
        const heading = $(".room-heading", room);
        const body = $(".room-body", room);
        const state = $(".room-state", room);
        room.classList.toggle("open", open);
        heading.setAttribute("aria-expanded", String(open));
        heading.setAttribute("aria-label", `${ROOM_INFO[roomId]?.title || roomId}. ${ROOM_INFO[roomId]?.description || "Project"}. ${open ? "Open" : "Closed"}.`);
        body.hidden = !open;
        if (open) {
          curioidPortalRoom(room);
          curioidActivateRoom(room);
          recordSiteRecent(roomId);
          loadRoom(room);
          if (state) {
            state.textContent = "OPEN";
            state.classList.remove("closed");
            state.classList.add("open");
            state.setAttribute("aria-label", "Project open");
          }
        } else {
          unloadRoom(room);
          curioidRestoreRoom(room);
          const remainingApps=curioidOpenRooms();
          const stillActive=remainingApps.find(item=>item.dataset.room===curioidActiveRoomId);
          const nextApp=stillActive||remainingApps.reduce((best,item)=>!best||Number(item.style.zIndex||0)>Number(best.style.zIndex||0)?item:best,null);
          if(nextApp)curioidActivateRoom(nextApp);else curioidRenderAppSwitcher();
          if (state) {
            state.textContent = "CLOSED";
            state.classList.remove("open");
            state.classList.add("closed");
            state.setAttribute("aria-label", "Project closed");
          }
        }
        updateOpenStatus();
        saveSiteSession(open?roomId:'');
        if (shouldScroll && room.parentElement !== curioidAppLayer) {
          room.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
          if (window.matchMedia("(max-width: 900px)").matches) closeMenu();
        }
      }

      function toggleRoom(room, shouldScroll = false) {
        setRoomOpen(room, !room.classList.contains("open"), shouldScroll);
      }

      function updateOpenStatus() {
        const openCount = $$(".room-window.open").length;
        $("#topStatus").textContent = `${openCount} window${openCount === 1 ? "" : "s"} open`;
        const statusMirror = $('[data-open-status-mirror]');
        if (statusMirror) statusMirror.textContent = `${openCount} window${openCount === 1 ? "" : "s"} open`;
        const closeAll = $("#closeAllRooms");
        const closeAllMirror = $('[data-close-all-mirror]');
        if (closeAll) closeAll.hidden = openCount < 1;
        if (closeAllMirror) closeAllMirror.hidden = openCount < 1;
      }

      let activeCategoryId = null;
      function setActiveCategory(categoryId) {
        if (!CATEGORY_NAV_BY_ID.has(categoryId) || activeCategoryId === categoryId) return;
        activeCategoryId = categoryId;
        let activeButton = null;
        for (const [id, button] of CATEGORY_NAV_BY_ID) {
          const active = id === categoryId;
          button.classList.toggle("active", active);
          if (active) { button.setAttribute("aria-current", "location"); activeButton = button; }
          else button.removeAttribute("aria-current");
        }
        // Keep the active category visible inside the scrollable sidebar without moving the page.
        if (activeButton) {
          const sidebar = $("#sidebar");
          const sideRect = sidebar.getBoundingClientRect();
          const itemRect = activeButton.getBoundingClientRect();
          if (itemRect.top < sideRect.top + 8) sidebar.scrollTop -= (sideRect.top + 8 - itemRect.top);
          else if (itemRect.bottom > sideRect.bottom - 8) sidebar.scrollTop += (itemRect.bottom - (sideRect.bottom - 8));
        }
      }

      function closeMenu(restoreFocus = false) {
        const wasOpen = document.body.classList.contains("menu-open");
        document.body.classList.remove("menu-open");
        $("#menuToggle").setAttribute("aria-expanded", "false");
        $("#menuToggle").setAttribute("aria-label", "Open project menu");
        if (restoreFocus && wasOpen) $("#menuToggle").focus({ preventScroll: true });
      }

      $("#categoryNav").addEventListener("click", event => {
        const nav = event.target.closest(".nav-item[data-category]");
        if (!nav) return;
        const categoryId = nav.dataset.category;
        const category = CATEGORY_SECTION_BY_ID.get(categoryId) || $(`[data-category-section="${categoryId}"]`);
        if (category) {
          // Selection is deliberate browsing intent. Warm the shared runtime and
          // only this category's verified module, in the background, on good links.
          // Standalone-led categories keep their lighter iframe fast path.
          if (!['sound-motion', 'creative-tools'].includes(categoryId)) scheduleSharedRuntimePrefetch(categoryId);
          setActiveCategory(categoryId);
          category.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
        }
        if (window.matchMedia("(max-width: 900px)").matches) closeMenu();
      });
      $("#brandHome").addEventListener("click", event => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
        if (window.matchMedia("(max-width: 900px)").matches) closeMenu();
      });
      $("#menuToggle").addEventListener("click", () => {
        const open = !document.body.classList.contains("menu-open");
        document.body.classList.toggle("menu-open", open);
        $("#menuToggle").setAttribute("aria-expanded", String(open));
        $("#menuToggle").setAttribute("aria-label", open ? "Close project menu" : "Open project menu");
      });
      $("#scrim").addEventListener("click", closeMenu);
      $("#closeAllRooms").addEventListener("click", () => {
        $$(".room-window.open").forEach(room => setRoomOpen(room, false));
        updateOpenStatus();
        showToast("All project windows are closed.");
      });
      $('[data-close-all-mirror]')?.addEventListener('click', () => $('#closeAllRooms')?.click());
      document.addEventListener("keydown", event => {
        const target = event.target;
        const editing = target && (target.matches?.("input, textarea, select") || target.isContentEditable);
        if (event.key === "Escape") {
          closeMenu(true);
          return;
        }
        if (!editing && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === "?") {
          event.preventDefault();
          openKeyboardShortcuts();
          return;
        }
        if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openCommandPalette();
        }
      });

      function openUniverseProject(projectId) {
        const target = document.getElementById(`room-${projectId}`);
        if (!target) return;
        if (projectSearch && projectSearch.value) { projectSearch.value = ''; applyProjectSearch(); }
        const section = target.closest('[data-category-section]');
        if (section) setActiveCategory(section.dataset.categorySection);
        setRoomOpen(target, true, false);
        requestAnimationFrame(() => target.querySelector('.room-heading')?.focus({preventScroll:true}));
      }
      window.CurioidNavigateToProject = openUniverseProject;
      function openProjectFromShareHash() {
        if (!location.hash.startsWith('#curioid=')) return false;
        let projectId = '';
        try { projectId = decodeURIComponent(location.hash.slice('#curioid='.length)); }
        catch (_) { return false; }
        if (!Object.prototype.hasOwnProperty.call(ROOM_INFO, projectId)) return false;
        openUniverseProject(projectId);
        return true;
      }
      window.addEventListener('hashchange', openProjectFromShareHash);
      if (location.hash.startsWith('#curioid=')) requestAnimationFrame(openProjectFromShareHash);
      $('#personalShortcuts')?.addEventListener('click', event => {
        const restoreSession = event.target.closest('[data-restore-site-session]');
        if (restoreSession) { restoreSiteSession(); return; }
        const clearFavorites = event.target.closest('[data-clear-site-favorites]');
        if (clearFavorites) {
          if (!siteFavorites.length) return;
          siteFavorites = [];
          if (!storeSiteIds(SITE_FAVORITES_KEY, siteFavorites)) siteFavorites = readSiteIds(SITE_FAVORITES_KEY, 100);
          $$('[data-room-favorite]').forEach(button => {
            const roomId = button.dataset.roomFavorite;
            const info = ROOM_INFO[roomId];
            if (!info) return;
            button.classList.remove('is-favorite');
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', `Add ${info.title} to favorites`);
            button.title = 'Add to favorites';
            button.textContent = '☆';
          });
          renderPersonalShortcuts();
          if (!siteFavorites.length) showToast('Favorites cleared.');
          return;
        }
        const clearRecent = event.target.closest('[data-clear-site-recents]');
        if (clearRecent) {
          if (!siteRecents.length) return;
          siteRecents = [];
          if (!storeSiteIds(SITE_RECENTS_KEY, siteRecents)) siteRecents = readSiteIds(SITE_RECENTS_KEY, 12);
          renderPersonalShortcuts();
          if (!siteRecents.length) showToast('Recent projects cleared.');
          return;
        }
        const button = event.target.closest('[data-shortcut-project]');
        if (button) openUniverseProject(button.dataset.shortcutProject);
      });
      $('#openConnectConsole')?.addEventListener('click', async () => {
        const button = $('#openConnectConsole');
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
          await ensureProjectAssets();
          if (!window.CurioidConnect || !window.CurioidConnectConsole) throw new Error('CURIOID Connect did not initialize.');
          window.CurioidConnect.syncCatalogue(window.CurioidCatalogue);
          window.CurioidConnectConsole.open();
        } catch (error) { showToast(`Connect Console could not open: ${error.message}`); }
        finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
      });
      $('#openBrowserVault')?.addEventListener('click', async () => {
        const button = $('#openBrowserVault');
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
          await ensureProjectAssets();
          window.dispatchEvent(new CustomEvent('curioid:open-vault'));
        } catch (error) { showToast(`Browser Vault could not open: ${error.message}`); }
        finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
      });
      $('#openCreatorWorkshop')?.addEventListener('click', async () => {
        const button = $('#openCreatorWorkshop');
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        let roomListener = null, timeoutId = 0;
        try {
          await ensureProjectAssets();
          if (typeof window.CurioidNavigateToProject !== 'function') throw new Error('The project launcher is not ready.');
          let opened = false;
          const openWorkbench = () => {
            if (opened) return true;
            if (typeof window.CurioidAuraOpenApp !== 'function') return false;
            opened = window.CurioidAuraOpenApp('creator-workbench') === true;
            if (opened) {
              if (roomListener) window.removeEventListener('curioid:room-mounted', roomListener);
              clearTimeout(timeoutId);
            }
            return opened;
          };
          roomListener = event => { if (event.detail?.id === 'aura-synthesis') openWorkbench(); };
          window.addEventListener('curioid:room-mounted', roomListener);
          window.CurioidNavigateToProject('aura-synthesis');
          if (!openWorkbench()) timeoutId = setTimeout(() => {
            if (roomListener) window.removeEventListener('curioid:room-mounted', roomListener);
            if (!opened) showToast('AURA is still initializing. Open its Start menu and choose Creator Workbench.');
          }, 15000);
        } catch (error) { showToast(`Creator Workshop could not open: ${error.message}`); }
        finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
      });
      $('#openWorkflowStudio')?.addEventListener('click', async () => {
        const button = $('#openWorkflowStudio');
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
          await ensureProjectAssets();
          if (window.CurioidWorkflowStudio?.open) window.CurioidWorkflowStudio.open();
          else throw new Error('Workflow Studio did not initialize.');
        } catch (error) { showToast(`Workflow Studio could not open: ${error.message}`); }
        finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
      });
      $('#openUniverseWorkshop')?.addEventListener('click', async () => {
        const button = $('#openUniverseWorkshop');
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
          await ensureProjectAssets();
          if (window.CurioidUniverseStudio?.open) window.CurioidUniverseStudio.open();
          else throw new Error('Sandbox OS did not initialize.');
        } catch (error) { showToast(`Sandbox OS could not open: ${error.message}`); }
        finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
      });
      $('#openMySandboxWorlds')?.addEventListener('click', async () => {
        const button = $('#openMySandboxWorlds');
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
          await ensureProjectAssets();
          if (window.CurioidUniverseStudio?.open) window.CurioidUniverseStudio.open({ tab: 'worlds' });
          else throw new Error('Sandbox OS did not initialize.');
        } catch (error) { showToast(`My Sandbox OS could not open: ${error.message}`); }
        finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
      });
      const maybeWarmForProjectIntent = event => {
        const heading = event.target.closest?.('.room-heading');
        const room = heading?.closest('.room-window');
        const id = room?.dataset.room;
        if (id && !STANDALONE_PROJECT_IDS.has(id)) scheduleSharedRuntimePrefetch();
      };
      $('#categorySections').addEventListener('pointerover', maybeWarmForProjectIntent, { passive: true });
      $('#categorySections').addEventListener('pointerdown', maybeWarmForProjectIntent, { passive: true });
      $('#categorySections').addEventListener('focusin', maybeWarmForProjectIntent);
      $('#categorySections').addEventListener('click', event => {
        const studioFilter = event.target.closest('[data-studio-filter]');
        if (studioFilter) {
          activeStudioToolFilter = STUDIO_TOOL_FILTERS.some(item => item.id === studioFilter.dataset.studioFilter) ? studioFilter.dataset.studioFilter : "all";
          syncStudioToolFilters();
          applyProjectSearch();
          return;
        }
        // Room-card actions have direct listeners so they continue working after
        // an open card is moved into the fullscreen app layer.
      });

      // Render lightweight category/project headings before observing their scroll positions.
      renderCategories();
      // Category sections are static after this point; keep a stable list for the
      // scroll tracker rather than allocating a fresh query result on every frame.
      const CATEGORY_SCROLL_SECTIONS = CATEGORIES
        .map(category => CATEGORY_SECTION_BY_ID.get(category.id))
        .filter(Boolean);
      // Aether share URLs open the Web Experiments project directly, then the app
      // consumes its compact #aether= state and restores the shared workspace.
      if (location.hash.startsWith("#aether=")) {
        const sharedRoom = $("#room-aether-os");
        if (sharedRoom) {
          setActiveCategory("operating-systems");
          setRoomOpen(sharedRoom, true, false);
          requestAnimationFrame(() => sharedRoom.scrollIntoView({ behavior: "auto", block: "start" }));
        }
      }

      // Fast local project finder: filters the already-rendered card list without
      // mounting any project code or changing saved state.
      const projectSearch = $("#projectSearch");
      document.addEventListener("keydown", event => {
        const target = event.target;
        const editing = target && (target.matches?.("input, textarea, select") || target.isContentEditable);
        if (editing || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "/") {
          const search = $("#projectSearch");
          if (search) { event.preventDefault(); search.focus(); search.select(); }
        }
      });
      const clearProjectSearch = $("#clearProjectSearch");
      const searchResultsStatus = $("#searchResultsStatus");
      const searchEmpty = $("#searchEmpty");
      function applyProjectSearch() {
        const query = (projectSearch.value || "").trim().toLocaleLowerCase();
        if (query && activeStudioToolFilter !== "all") {
          activeStudioToolFilter = "all";
          syncStudioToolFilters();
        }
        const studioFilter = STUDIO_TOOL_FILTERS.find(item => item.id === activeStudioToolFilter) || STUDIO_TOOL_FILTERS[0];
        const studioIds = new Set(studioFilter.rooms);
        let matches = 0;
        CATEGORIES.forEach(category => {
          const section = CATEGORY_SECTION_BY_ID.get(category.id);
          let categoryMatches = 0;
          category.rooms.forEach(roomId => {
            const room = ROOM_CARD_BY_ID.get(roomId);
            if (!room) return;
            const queryMatch = !query || ROOM_SEARCH_TEXT_BY_ID.get(roomId).includes(query);
            const groupMatch = category.id !== "creative-tools" || activeStudioToolFilter === "all" || studioIds.has(roomId);
            const match = queryMatch && groupMatch;
            if (!match && room.classList.contains("open")) setRoomOpen(room, false);
            room.hidden = !match;
            if (match) { matches++; categoryMatches++; }
          });
          if (section) section.hidden = categoryMatches === 0;
          const navButton = CATEGORY_NAV_BY_ID.get(category.id);
          if (navButton) navButton.hidden = categoryMatches === 0;
        });
        clearProjectSearch.hidden = !query;
        searchEmpty.hidden = !query || matches > 0;
        searchResultsStatus.hidden = !query || matches === 0;
        searchResultsStatus.textContent = `${matches} of ${CATEGORIES.reduce((total, category) => total + category.rooms.length, 0)} projects found`;
        if (query && matches) {
          const first = CATEGORIES.find(category => category.rooms.some(id => !ROOM_CARD_BY_ID.get(id)?.hidden));
          if (first) setActiveCategory(first.id);
        } else if (!query) {
          scheduleScrollUIUpdate();
        }
      }
      projectSearch.addEventListener("input", applyProjectSearch);
      clearProjectSearch.addEventListener("click", () => { projectSearch.value = ""; applyProjectSearch(); projectSearch.focus(); });
      projectSearch.addEventListener("keydown", event => { if (event.key === "Escape") { projectSearch.value = ""; applyProjectSearch(); projectSearch.blur(); } });

      // One fast launcher for projects, worlds, saved shortcuts and common site actions.
      // Public catalogue metadata is always searchable. Private app records require both
      // an explicit toggle and a provider-owned Connect grant for this session.
      const commandDialog = document.createElement('dialog');
      commandDialog.className = 'curioid-command-dialog';
      commandDialog.setAttribute('aria-labelledby', 'commandPaletteTitle');
      const commandShell = document.createElement('section');
      commandShell.className = 'command-palette-shell';
      const commandHead = document.createElement('header');
      commandHead.className = 'command-palette-head';
      const commandHeadCopy = document.createElement('div');
      commandHeadCopy.className = 'command-palette-head-copy';
      const commandKicker = document.createElement('small');
      commandKicker.textContent = 'CURIOID / QUICK LAUNCH';
      const commandTitle = document.createElement('strong');
      commandTitle.id = 'commandPaletteTitle';
      commandTitle.textContent = 'Find a project or action';
      commandHeadCopy.append(commandKicker, commandTitle);
      const commandClose = document.createElement('button');
      commandClose.type = 'button';
      commandClose.className = 'command-palette-close';
      commandClose.setAttribute('aria-label', 'Close quick launch');
      commandClose.textContent = '×';
      commandHead.append(commandHeadCopy, commandClose);
      const commandSearchWrap = document.createElement('div');
      commandSearchWrap.className = 'command-palette-search-wrap';
      const commandInput = document.createElement('input');
      commandInput.type = 'search';
      commandInput.className = 'command-palette-search';
      commandInput.placeholder = 'Search projects, worlds and actions…';
      commandInput.autocomplete = 'off';
      commandInput.spellcheck = false;
      commandInput.setAttribute('aria-label', 'Search projects, worlds and actions');
      commandInput.setAttribute('aria-controls', 'commandPaletteResults');
      commandInput.setAttribute('aria-autocomplete', 'list');
      commandSearchWrap.appendChild(commandInput);
      const commandPrivateSearchLabel = document.createElement('label');
      commandPrivateSearchLabel.className = 'command-palette-private-toggle';
      const commandPrivateSearchToggle = document.createElement('input');
      commandPrivateSearchToggle.type = 'checkbox';
      commandPrivateSearchToggle.id = 'commandPaletteSharedRecords';
      commandPrivateSearchToggle.setAttribute('aria-describedby', 'commandPaletteSharedRecordsHelp');
      const commandPrivateSearchCopy = document.createElement('span');
      const commandPrivateSearchTitle = document.createElement('strong');
      commandPrivateSearchTitle.textContent = 'Also search owner-approved app records';
      const commandPrivateSearchHelp = document.createElement('small');
      commandPrivateSearchHelp.id = 'commandPaletteSharedRecordsHelp';
      commandPrivateSearchHelp.textContent = 'Off by default. Only app fields explicitly approved by their owner and granted to CURIOID Global Search are searched. Approvals are tied to this browser session and must be renewed after a reload.';
      commandPrivateSearchCopy.append(commandPrivateSearchTitle, commandPrivateSearchHelp);
      commandPrivateSearchLabel.append(commandPrivateSearchToggle, commandPrivateSearchCopy);
      const commandPrivateSearchStatus = document.createElement('small');
      commandPrivateSearchStatus.className = 'command-palette-private-status';
      commandPrivateSearchStatus.setAttribute('role', 'status');
      commandPrivateSearchStatus.setAttribute('aria-live', 'polite');
      commandSearchWrap.append(commandPrivateSearchLabel, commandPrivateSearchStatus);
      const commandResults = document.createElement('div');
      commandResults.className = 'command-palette-results';
      commandResults.id = 'commandPaletteResults';
      commandResults.setAttribute('role', 'listbox');
      commandResults.setAttribute('aria-label', 'Quick launch results');
      const commandFoot = document.createElement('footer');
      commandFoot.className = 'command-palette-foot';
      const commandHint = document.createElement('span');
      commandHint.textContent = '↑ ↓ Navigate · Enter Open';
      const commandEsc = document.createElement('span');
      commandEsc.append('Close ', Object.assign(document.createElement('kbd'), { textContent: 'Esc' }));
      commandFoot.append(commandHint, commandEsc);
      commandShell.append(commandHead, commandSearchWrap, commandResults, commandFoot);
      commandDialog.appendChild(commandShell);
      document.body.appendChild(commandDialog);

      const commandActions = [
        {id:'workflow',title:'Workflow Studio',description:'Build local workflows with explicit approvals.',icon:'⇄',keywords:'automation connections flow graph',target:'openWorkflowStudio'},
        {id:'creator',title:'Creator Workshop',description:'Open the AURA project planning and creation workspace.',icon:'＋',keywords:'create plan project workbench',target:'openCreatorWorkshop'},
        {id:'sandbox',title:'Sandbox OS Builder',description:'Design and manage your own browser desktop.',icon:'▣',keywords:'custom operating system build os',target:'openUniverseWorkshop'},
        {id:'my-sandbox',title:'My Sandbox OS',description:'Open your saved custom worlds.',icon:'▦',keywords:'saved worlds custom desktop',target:'openMySandboxWorlds'},
        {id:'connect',title:'Connect Console',description:'Review local components, permissions and connections.',icon:'⌘',keywords:'kernel capabilities grants events components',target:'openConnectConsole'},
        {id:'app-library',title:'Universal App Library',description:'Find, install and manage safe local app packages.',icon:'▦',keywords:'installed custom apps packages templates data',run:()=>{window.CurioidConnectConsole?.open?.();document.querySelector('[data-ccc-tab="library"]')?.click();}},
        {id:'control',title:'Control Panel',description:'Website tools, saved items, settings and recovery.',icon:'⚙',keywords:'settings backup restore health diagnostics',target:'openControlCenter'},
        {id:'keyboard-help',title:'Keyboard shortcuts',description:'Show the quick keyboard guide for navigating CURIOID.',icon:'⌨',keywords:'help hotkeys keys slash question mark',run:openKeyboardShortcuts},
        {id:'vault',title:'Browser Vault',description:'Open locally saved outputs and recovery copies.',icon:'▤',keywords:'files exports backups packages local storage',target:'openBrowserVault'},
        {id:'shortcuts',title:'Favorites and recent projects',description:'Show your saved shortcuts and recently opened worlds.',icon:'★',keywords:'favorite recent history saved projects',run:()=>{const panel=$('#personalShortcuts');if(panel){panel.open=true;panel.scrollIntoView({behavior:scrollBehavior(),block:'nearest'});}}},
        {id:'restore-session',title:'Restore last session',description:'Reopen the project windows saved from your previous visit.',icon:'↶',keywords:'resume reopen restore windows',run:()=> $('[data-restore-site-session]')?.click(),enabled:()=>!!$('[data-restore-site-session]')&&!$('[data-restore-site-session]').disabled},
        {id:'close-all',title:'Close all project windows',description:'Close every currently open project window.',icon:'×',keywords:'close quit dismiss windows',run:()=>$('#closeAllRooms')?.click(),enabled:()=>$$('.room-window.open').length>0},
        {id:'motion',title:'Toggle project motion',description:'Pause or resume animated project backgrounds.',icon:'◌',keywords:'animation movement reduce motion',run:()=>$('#motionToggle')?.click()},
        {id:'home',title:'Back to CURIOID home',description:'Return to the top of the project catalogue.',icon:'⌂',keywords:'home top start',run:()=>{window.scrollTo({top:0,behavior:scrollBehavior()});closeMenu();}}
      ];
      let commandItems = [];
      let commandActiveIndex = -1;
      let commandRenderedItems = [];
      const commandNormalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
      function buildCommandItems(){
        const items=[];
        for(const category of CATEGORIES){
          items.push({id:`category:${category.id}`,kind:'category',title:category.title,description:category.description||category.kicker||'Browse this project category',icon:'◈',keywords:`${category.kicker||''} ${category.id}`,categoryId:category.id,search:`${category.title} ${category.description||''} ${category.kicker||''} ${category.id}`,run:()=>{const section=CATEGORY_SECTION_BY_ID.get(category.id);if(section){if(projectSearch?.value){projectSearch.value='';applyProjectSearch();}setActiveCategory(category.id);section.scrollIntoView({behavior:scrollBehavior(),block:'start'});if(window.matchMedia('(max-width: 900px)').matches)closeMenu();}}});
          for(const id of category.rooms){
            const info=ROOM_INFO[id];if(!info)continue;
            const profile=CURIOID_PROJECT_PROFILES.get(id);
            items.push({id:`project:${id}`,kind:'project',projectId:id,title:projectDisplayTitle(id,info.title),description:info.description||category.title,icon:ROOM_ICON_BY_ID[id]||info.icon||'◈',categoryTitle:category.title,search:ROOM_SEARCH_TEXT_BY_ID.get(id)||`${info.title} ${info.description||''} ${category.title}`,role:profile?.role||'',run:()=>openUniverseProject(id)});
          }
        }
        // Installed app packages are searchable by their public manifest metadata only.
        // Private package records are never read by the global launcher.
        try {
          const installedPackages=window.CurioidAppPackages?.list?.({includeCounts:false})||[];
          for(const app of installedPackages){
            const id=String(app?.id||'').trim();
            const manifest=app?.manifest||{};
            const title=String(manifest.name||'Installed local app').trim().slice(0,64);
            if(!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)||!title)continue;
            const category=String(manifest.category||'Installed app').trim().slice(0,48);
            const description=String(manifest.description||'Open an installed local app.').trim().slice(0,180);
            const tags=Array.isArray(manifest.tags)?manifest.tags.filter(tag=>typeof tag==='string').slice(0,24).join(' '):'';
            items.push({id:`package:${id}`,kind:'package',packageId:id,title,description,icon:String(manifest.icon||'▦').slice(0,8),categoryTitle:category,search:`${title} ${description} ${category} ${id} ${tags}`,run:()=>window.CurioidAppPackages?.launch?.(id)});
          }
        } catch(error) {
          console.warn('CURIOID could not add installed packages to quick launch:',error);
        }
        for(const action of commandActions){
          items.push({...action,kind:'action',search:`${action.title} ${action.description} ${action.keywords||''}`,run:action.run||(()=>document.getElementById(action.target)?.click())});
        }
        return items;
      }
      const COMMAND_SEARCH_EXPERIENCE_ID = 'curioid-global-search';
      let commandSharedRecordItems = [];
      let commandSharedSearchSequence = 0;
      let commandSharedSearchTimer = 0;
      function ensureCommandSearchExperience(){
        const kernel=window.CurioidKernel;
        if(!kernel?.getExperience||!kernel?.registerExperience)return false;
        if(!kernel.getExperience(COMMAND_SEARCH_EXPERIENCE_ID)){
          kernel.registerExperience({id:COMMAND_SEARCH_EXPERIENCE_ID,name:'CURIOID Global Search',version:'1.0.0',category:'Core service',description:'Permission-aware search over only the app record fields that their owners explicitly approved through Connect.',profile:{localOnly:true,readOnly:true,privateRecordSearch:true}});
        }
        return Boolean(kernel.getExperience(COMMAND_SEARCH_EXPERIENCE_ID));
      }
      async function searchApprovedAppRecords(rawQuery){
        const sequence=++commandSharedSearchSequence;
        commandSharedRecordItems=[];
        const query=String(rawQuery||'').trim().slice(0,160);
        if(!commandPrivateSearchToggle.checked||query.length<2){
          commandPrivateSearchStatus.textContent=commandPrivateSearchToggle.checked?'Type at least two characters to search approved records.':'';
          renderCommandResults();
          return;
        }
        const kernel=window.CurioidKernel,packages=window.CurioidAppPackages;
        if(!ensureCommandSearchExperience()||!kernel?.getCapabilitiesGrantedTo||!kernel?.requestCapability||!packages?.list){
          commandPrivateSearchStatus.textContent='The local permission-aware search service is not available in this session.';
          renderCommandResults();
          return;
        }
        commandPrivateSearchStatus.textContent='Checking Connect approvals…';
        try{
          const [granted,installed]=await Promise.all([
            kernel.getCapabilitiesGrantedTo(COMMAND_SEARCH_EXPERIENCE_ID),
            Promise.resolve(packages.list({includeCounts:false}))
          ]);
          if(sequence!==commandSharedSearchSequence||!commandPrivateSearchToggle.checked)return;
          const grants=new Map(granted.map(capability=>[capability.id,capability]));
          const eligibleAll=installed.filter(app=>{
            const id=String(app?.id||'');
            const capabilityId=`app-package.${id}.records.read`;
            return app?.connectEnabled===true&&Array.isArray(app.sharedFields)&&app.sharedFields.length>0&&grants.has(capabilityId);
          }).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
          const eligible=eligibleAll.slice(0,16);
          if(!eligibleAll.length){
            commandPrivateSearchStatus.textContent='No app has granted Global Search access. In Connect Console, open Permissions, choose an installed-app records capability and grant it to CURIOID Global Search.';
            renderCommandResults();
            return;
          }
          commandPrivateSearchStatus.textContent=eligibleAll.length>eligible.length?`Searching the ${eligible.length} most recently updated of ${eligibleAll.length} approved apps to keep local search bounded…`:`Searching ${eligible.length} app${eligible.length===1?'':'s'} with explicit grants…`;
          const batches=await Promise.allSettled(eligible.map(async app=>{
            const id=String(app.id),capabilityId=`app-package.${id}.records.read`,fields=app.sharedFields.slice(0,12);
            const capability=grants.get(capabilityId);
            if(!capability||capability.access!=='granted')return[];
            const output=await kernel.requestCapability(capabilityId,{fields,query,limit:6},{fromExperienceId:COMMAND_SEARCH_EXPERIENCE_ID});
            const definitions=new Map((output.fields||[]).map(field=>[field.id,field]));
            const manifest=app.manifest||{};
            return (output.records||[]).map(record=>{
              const selected=fields.filter(fieldId=>definitions.has(fieldId)&&Object.hasOwn(record.fields||{},fieldId));
              if(!selected.length)return null;
              const primary=selected.find(fieldId=>String(record.fields[fieldId]??'').trim())||selected[0];
              const titleValue=String(record.fields[primary]??'').trim().slice(0,110)||'Untitled record';
              const details=selected.filter(fieldId=>fieldId!==primary).slice(0,2).map(fieldId=>`${definitions.get(fieldId).label}: ${String(record.fields[fieldId]??'').slice(0,90)}`).join(' · ');
              return {id:`shared-record:${id}:${String(record.id).slice(0,96)}`,kind:'record',packageId:id,recordId:String(record.id).slice(0,96),title:`${String(manifest.name||'App').slice(0,48)}: ${titleValue}`,description:details||`Approved field: ${definitions.get(primary).label}`,icon:String(manifest.icon||'▦').slice(0,8),categoryTitle:'Shared app record',search:`${manifest.name||''} ${titleValue} ${details}`,run:()=>window.CurioidAppPackages?.launch?.(id,{focusRecordId:String(record.id).slice(0,96)})};
            }).filter(Boolean);
          }));
          if(sequence!==commandSharedSearchSequence||!commandPrivateSearchToggle.checked)return;
          commandSharedRecordItems=batches.flatMap(result=>result.status==='fulfilled'?result.value:[]).slice(0,36);
          const errors=batches.filter(result=>result.status==='rejected').length;
          commandPrivateSearchStatus.textContent=`${commandSharedRecordItems.length} matching record${commandSharedRecordItems.length===1?'':'s'} from approved fields across ${eligible.length} of ${eligibleAll.length} granted apps${errors?` · ${errors} app${errors===1?'':'s'} unavailable`:''}.`;
          renderCommandResults();
        }catch(error){
          if(sequence!==commandSharedSearchSequence)return;
          commandSharedRecordItems=[];
          commandPrivateSearchStatus.textContent=`Private record search stopped safely: ${String(error?.message||error).slice(0,180)}`;
          renderCommandResults();
        }
      }
      function scheduleApprovedAppRecordSearch(){
        commandSharedSearchSequence++;
        if(commandSharedSearchTimer)window.clearTimeout(commandSharedSearchTimer);
        commandSharedSearchTimer=0;
        commandSharedRecordItems=[];
        const query=String(commandInput.value||'').trim();
        if(!commandPrivateSearchToggle.checked){commandPrivateSearchStatus.textContent='';renderCommandResults();return;}
        if(query.length<2){commandPrivateSearchStatus.textContent='Type at least two characters to search approved records.';renderCommandResults();return;}
        commandPrivateSearchStatus.textContent='Waiting for typing to pause…';
        renderCommandResults();
        commandSharedSearchTimer=window.setTimeout(()=>{commandSharedSearchTimer=0;searchApprovedAppRecords(query);},240);
      }
      function scoreCommandItem(item,tokens){
        if(!tokens.length){
          if(item.kind==='project'&&siteRecents.includes(item.projectId))return 1300-siteRecents.indexOf(item.projectId)*8;
          if(item.kind==='project'&&siteFavorites.includes(item.projectId))return 1200-siteFavorites.indexOf(item.projectId)*3;
          if(item.kind==='action')return 500;
          if(item.kind==='package')return 460;
          if(item.kind==='record')return 440;
          if(item.kind==='category')return 300;
          return 0;
        }
        const title=commandNormalize(item.title),search=commandNormalize(`${item.search||''} ${item.description||''} ${item.keywords||''}`);
        let score=0;
        for(const token of tokens){
          if(!search.includes(token))return 0;
          if(title===token)score+=140;
          else if(title.startsWith(token))score+=90;
          else if(title.split(/\s+/).some(word=>word.startsWith(token)))score+=60;
          else if(title.includes(token))score+=35;
          else score+=10;
        }
        if(item.kind==='project'&&siteRecents.includes(item.projectId))score+=20-siteRecents.indexOf(item.projectId);
        if(item.kind==='project'&&siteFavorites.includes(item.projectId))score+=12;
        if(item.kind==='action')score+=3;
        if(item.kind==='record')score+=8;
        return score;
      }
      function setCommandActive(index){
        const buttons=[...commandResults.querySelectorAll('[role="option"]')];
        if(!buttons.length){commandActiveIndex=-1;commandInput.removeAttribute('aria-activedescendant');return;}
        commandActiveIndex=Math.max(0,Math.min(index,buttons.length-1));
        buttons.forEach((button,i)=>button.setAttribute('aria-selected',String(i===commandActiveIndex)));
        const active=buttons[commandActiveIndex];
        commandInput.setAttribute('aria-activedescendant',active.id);
        active.scrollIntoView({block:'nearest'});
      }
      function renderCommandResults(){
        const tokens=commandNormalize(commandInput.value.trim()).split(/\s+/).filter(Boolean);
        const ranked=[...commandItems,...commandSharedRecordItems].map(item=>({item,score:scoreCommandItem(item,tokens)})).filter(entry=>entry.score>0&&(!entry.item.enabled||entry.item.enabled())).sort((a,b)=>b.score-a.score||a.item.title.localeCompare(b.item.title)).slice(0,tokens.length?22:14);
        commandResults.replaceChildren();commandRenderedItems=ranked.map(entry=>entry.item);
        if(!ranked.length){const empty=document.createElement('p');empty.className='command-palette-empty';empty.textContent='No matching projects, actions or installed apps. Try a shorter search.';commandResults.appendChild(empty);commandInput.removeAttribute('aria-activedescendant');commandActiveIndex=-1;return;}
        ranked.forEach(({item},index)=>{
          const button=document.createElement('button');button.type='button';button.className='command-palette-result';button.id=`commandPaletteOption${index}`;button.setAttribute('role','option');button.setAttribute('aria-selected','false');
          const icon=document.createElement('span');icon.className='command-palette-result-icon';icon.textContent=item.icon||'◈';
          const copy=document.createElement('span');copy.className='command-palette-result-copy';const title=document.createElement('strong');title.textContent=item.title;const description=document.createElement('small');description.textContent=item.description||item.categoryTitle||'';copy.append(title,description);
          const type=document.createElement('span');type.className='command-palette-result-type';type.textContent=item.kind==='project'?item.categoryTitle:item.kind==='category'?'Category':item.kind==='package'?'Installed app':item.kind==='record'?'Shared record':'Action';
          button.append(icon,copy,type);button.addEventListener('mouseenter',()=>setCommandActive(index));button.addEventListener('click',()=>runCommandItem(index));commandResults.appendChild(button);
        });
        setCommandActive(0);
      }
      function runCommandItem(index){
        const item=commandRenderedItems[index];if(!item)return;
        commandDialog.close();
        try{item.run?.();}catch(error){showToast(`Could not open ${item.title}: ${String(error?.message||error).slice(0,160)}`);}
      }
      function openCommandPalette(){
        if(!commandDialog.isConnected)return;
        ensureCommandSearchExperience();
        commandPrivateSearchToggle.checked=false;commandPrivateSearchStatus.textContent='';commandSharedSearchSequence++;commandSharedRecordItems=[];if(commandSharedSearchTimer)window.clearTimeout(commandSharedSearchTimer);commandSharedSearchTimer=0;
        commandItems=buildCommandItems();
        if(!commandDialog.open){
          if(typeof commandDialog.showModal==='function')commandDialog.showModal();
          else commandDialog.setAttribute('open','');
        }
        commandInput.value='';renderCommandResults();requestAnimationFrame(()=>{commandInput.focus({preventScroll:true});});
      }
      $('#commandPaletteOpen')?.addEventListener('click',openCommandPalette);
      commandClose.addEventListener('click',()=>commandDialog.close());
      commandDialog.addEventListener('click',event=>{if(event.target===commandDialog)commandDialog.close();});
      commandDialog.addEventListener('close',()=>{commandSharedSearchSequence++;commandSharedRecordItems=[];commandPrivateSearchToggle.checked=false;commandPrivateSearchStatus.textContent='';if(commandSharedSearchTimer)window.clearTimeout(commandSharedSearchTimer);commandSharedSearchTimer=0;commandInput.value='';commandInput.removeAttribute('aria-activedescendant');commandActiveIndex=-1;});
      commandInput.addEventListener('input',()=>{renderCommandResults();scheduleApprovedAppRecordSearch();});
      commandPrivateSearchToggle.addEventListener('change',scheduleApprovedAppRecordSearch);
      commandInput.addEventListener('keydown',event=>{
        if(event.key==='ArrowDown'){event.preventDefault();setCommandActive(commandActiveIndex+1);}
        else if(event.key==='ArrowUp'){event.preventDefault();setCommandActive(commandActiveIndex-1);}
        else if(event.key==='Home'&&commandRenderedItems.length){event.preventDefault();setCommandActive(0);}
        else if(event.key==='End'&&commandRenderedItems.length){event.preventDefault();setCommandActive(commandRenderedItems.length-1);}
        else if(event.key==='Escape'){event.preventDefault();commandDialog.close();}
        else if(event.key==='Enter'&&commandActiveIndex>=0){event.preventDefault();runCommandItem(commandActiveIndex);}
      });

      // Build the index only after renderCategories() has populated the richer search text.

      // Give the word a small, per-visit print-registration variation without reducing legibility.
      const strange = document.querySelector('.strange-word');
      if (strange) {
        const letters = [...strange.querySelectorAll('span')];
        letters.forEach((letter, index) => {
          const seed = Math.random();
          const cut = seed > .72;
          letter.style.setProperty('--letter-tilt', `${(Math.random() - .5) * 9}deg`);
          letter.style.setProperty('--letter-shift', `${(Math.random() - .5) * 3}px`);
          letter.style.setProperty('--letter-cut', cut ? `${Math.round(18 + Math.random() * 28)}%` : '0%');
          letter.style.setProperty('--letter-index', String(index));
          letter.dataset.letter = letter.textContent || '';
          letter.style.transform = `translateY(${(Math.random() - .5) * 4}px) rotate(${(Math.random() - .5) * 12}deg) scaleX(${.88 + Math.random() * .24})`;
          letter.classList.toggle('print-worn', cut);
          letter.classList.toggle('letter-split', Math.random() > .58);
        });
      }

      // One frame-coalesced scroll pass updates both the active category and
      // back-to-top control. This avoids two independent RAF callbacks per scroll.
      const backToTop = $("#backToTop");
      let scrollUiFrame = 0;
      function updateScrollUI() {
        scrollUiFrame = 0;
        const readingLine = Math.max(105, Math.min(250, window.innerHeight * .34));
        let firstVisible = null;
        let active = null;
        for (const section of CATEGORY_SCROLL_SECTIONS) {
          if (section.hidden) continue;
          if (!firstVisible) firstVisible = section;
          if (section.getBoundingClientRect().top <= readingLine) active = section;
          else break;
        }
        if (firstVisible) {
          active ||= firstVisible;
          const atPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
          if (atPageBottom) {
            for (let index = CATEGORY_SCROLL_SECTIONS.length - 1; index >= 0; index--) {
              if (!CATEGORY_SCROLL_SECTIONS[index].hidden) { active = CATEGORY_SCROLL_SECTIONS[index]; break; }
            }
          }
          setActiveCategory(active.dataset.categorySection);
        }
        const visible = window.scrollY > 560;
        backToTop.hidden = false;
        backToTop.classList.toggle("is-visible", visible);
        backToTop.setAttribute("aria-hidden", String(!visible));
        backToTop.tabIndex = visible ? 0 : -1;
      }
      function scheduleScrollUIUpdate() {
        if (!scrollUiFrame) scrollUiFrame = requestAnimationFrame(updateScrollUI);
      }
      window.addEventListener("scroll", scheduleScrollUIUpdate, { passive: true });
      window.addEventListener("resize", scheduleScrollUIUpdate, { passive: true });
      backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
      scheduleScrollUIUpdate();

      // Project content is mounted only when its own window is opened.

      // One site-wide master volume, shared by every sound project.
      const globalVolumes = [$("#globalMasterVolume"), ...$$('[data-global-volume-mirror]')].filter(Boolean);
      const globalVolumeOutputs = [$("#globalMasterVolumeValue"), ...$$('[data-global-volume-mirror-value]')].filter(Boolean);
      if (globalVolumes.length) {
        let initialVolume = "70";
        try { initialVolume = localStorage.getItem("curioid-master-volume") ?? "70"; } catch (_) {}
        const paintVolume = source => {
          const value = Math.max(0, Math.min(100, Number(source?.value ?? initialVolume) || 0));
          for (const control of globalVolumes) control.value = String(value);
          for (const output of globalVolumeOutputs) output.textContent = `${value}%`;
          try { localStorage.setItem("curioid-master-volume", String(value)); } catch (_) {}
          if (window.CurioidSetMasterVolume) window.CurioidSetMasterVolume(value / 100);
        };
        globalVolumes.forEach(control => control.addEventListener("input", () => paintVolume(control)));
        paintVolume({value:initialVolume});
      }

      // No OS or app auto-launches on first visit. Visitors choose what to open;
      // this keeps the catalogue calm, fast and predictable on desktop and mobile.
      // Offline-first app shell. Service workers require HTTPS or a secure localhost origin.
      if ("serviceWorker" in navigator) {
        const isSecureSite = location.protocol === "https:" ||
          (location.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
        if (isSecureSite) {
          const registerCurioidOfflineShell = () => {
            const siteRoot = new URL("./", document.baseURI);
            navigator.serviceWorker.register(new URL("service-worker-current.js?release=v1.323", siteRoot).href, {
              scope: siteRoot.pathname,
              updateViaCache: "none"
            }).then(registration => {
              let updateAccepted = false;
              let updateBanner = null;
              const messageHandler = event => {
                if (event.data?.type !== "CURIOID_UPDATE_BLOCKED" || !updateBanner) return;
                const button = updateBanner.querySelector("[data-curioid-update-apply]");
                const detail = updateBanner.querySelector("small");
                if (button) { button.disabled = false; button.textContent = "Try again"; }
                if (detail) detail.textContent = event.data.openTabs === null ? "The update could not be activated safely. Close other CURIOID tabs and retry." : `Close your other ${Math.max(1,event.data.openTabs-1)} CURIOID tab(s), then try again.`;
              };
              const showUpdate = () => {
                if (!registration.waiting || !navigator.serviceWorker.controller || updateBanner) return;
                const banner = document.createElement("aside");
                banner.dataset.curioidUpdatePrompt = "true";
                banner.setAttribute("role", "status");
                const copy = document.createElement("span");
                const heading = document.createElement("b"); heading.textContent = "CURIOID update ready";
                const detail = document.createElement("small"); detail.textContent = "Save your work before refreshing. Other open CURIOID tabs must be closed.";
                copy.append(heading, detail);
                const applyButton = document.createElement("button"); applyButton.type = "button"; applyButton.dataset.curioidUpdateApply = "true"; applyButton.textContent = "Update";
                const dismissButton = document.createElement("button"); dismissButton.type = "button"; dismissButton.dataset.curioidUpdateDismiss = "true"; dismissButton.setAttribute("aria-label", "Dismiss update notice"); dismissButton.textContent = "×";
                banner.append(copy, applyButton, dismissButton);
                const style = document.createElement("style");
                style.textContent = '[data-curioid-update-prompt]{position:fixed;z-index:2147483000;right:16px;bottom:16px;display:flex;align-items:center;gap:12px;max-width:min(430px,calc(100vw - 32px));padding:12px 14px;border:1px solid #596b6d;border-radius:12px;background:#121a20;color:#eef4f4;box-shadow:0 12px 40px #0008;font:13px/1.4 system-ui,sans-serif}[data-curioid-update-prompt] span{display:grid;gap:3px;min-width:0}[data-curioid-update-prompt] small{color:#aebcbd}[data-curioid-update-prompt] button{border:1px solid #78918d;border-radius:7px;background:#243a37;color:#fff;padding:7px 10px;cursor:pointer}[data-curioid-update-prompt] [data-curioid-update-dismiss]{padding:4px 8px;background:transparent}';
                document.head.append(style); document.body.append(banner); updateBanner = banner;
                navigator.serviceWorker.addEventListener("message", messageHandler);
                banner.querySelector("[data-curioid-update-dismiss]").addEventListener("click", () => { navigator.serviceWorker.removeEventListener("message", messageHandler); banner.remove(); style.remove(); updateBanner = null; });
                banner.querySelector("[data-curioid-update-apply]").addEventListener("click", () => {
                  const waiting = registration.waiting; if (!waiting) { banner.remove(); style.remove(); updateBanner = null; return; }
                  const button = banner.querySelector("[data-curioid-update-apply]"); button.disabled = true; button.textContent = "Checking tabs…"; updateAccepted = true;
                  waiting.postMessage({ type: "CURIOID_ACTIVATE_UPDATE" });
                });
              };
              navigator.serviceWorker.addEventListener("controllerchange", () => { if (updateAccepted) window.location.reload(); });
              showUpdate();
              registration.addEventListener("updatefound", () => {
                const installing = registration.installing;
                installing?.addEventListener("statechange", () => { if (installing.state === "installed") showUpdate(); });
              });
            }).catch(error => console.info("CURIOID offline shell is unavailable in this browser context.", error));
          };
          if (document.readyState === "complete") registerCurioidOfflineShell();
          else window.addEventListener("load", registerCurioidOfflineShell, { once: true });
        }
      }
      updateOpenStatus();
    })();
    }, { once: true });
    }
  