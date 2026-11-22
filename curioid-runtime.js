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
    const owners = [];
    for (const scope of activeScopes.values()) {
      const status = scope.getStatus();
      activeResources += status.activeResources;
      owners.push({ id: status.id, owner: status.owner, activeResources: status.activeResources, cleanupFailures: status.cleanupFailures });
    }
    return Object.freeze({
      version: VERSION,
      activeScopes: activeScopes.size,
      activeResources,
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

  function renderStatus(status) {
    const update = () => {
      const node = doc.querySelector('[data-control-runtime]');
      if (!node) return;
      node.textContent = `${status.activeScopes} active · ${status.activeResources} tracked`;
      node.title = `${status.cleanupFailures} cleanup issue(s) recorded since this page loaded. Runtime scopes: ${status.activeScopes}.`;
      node.setAttribute('aria-label', `${status.activeScopes} active application runtime scopes and ${status.activeResources} tracked resources`);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', update, { once: true });
    else update();
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

    function addCleanup(cleanup, kind) {
      if (typeof cleanup !== 'function') throw new TypeError('A runtime cleanup must be a function.');
      const previous = cleanupEntries.get(cleanup);
      if (state === 'active' && previous && previous.active) return () => runEntry(previous);
      const entry = { cleanup, kind: safeLabel(kind, 'custom'), active: true };
      if (state !== 'active') {
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
      let release = () => false;
      let attached = true;
      const listener = function runtimeScopedListener(event) {
        if (state !== 'active' || !attached) return;
        if (opts.once) release();
        return callback.call(this, event);
      };
      target.addEventListener(type, listener, { capture, passive: Boolean(opts.passive) });
      release = addCleanup(() => {
        if (!attached) return;
        attached = false;
        target.removeEventListener(type, listener, capture);
      }, 'listener');
      return release;
    }

    function timeout(callback, delay) {
      if (typeof callback !== 'function') throw new TypeError('Runtime timeout() requires a function callback.');
      const numeric = Number(delay);
      const safeDelay = Math.max(0, Math.min(MAX_TIMER_DELAY, Number.isFinite(numeric) ? numeric : 0));
      let release = () => false;
      const timer = win.setTimeout(() => {
        release();
        if (state === 'active') {
          try { callback(); } catch (error) { report(error, `${owner}/timeout callback`); }
        }
      }, safeDelay);
      release = addCleanup(() => win.clearTimeout(timer), 'timeout');
      return release;
    }

    function interval(callback, delay) {
      if (typeof callback !== 'function') throw new TypeError('Runtime interval() requires a function callback.');
      const numeric = Number(delay);
      const safeDelay = Math.max(1, Math.min(MAX_TIMER_DELAY, Number.isFinite(numeric) ? numeric : 1));
      let active = true;
      const timer = win.setInterval(() => {
        if (state !== 'active' || !active) return;
        try { callback(); } catch (error) { report(error, `${owner}/interval callback`); }
      }, safeDelay);
      return addCleanup(() => { if (active) { active = false; win.clearInterval(timer); } }, 'interval');
    }

    function animationFrame(callback) {
      if (typeof callback !== 'function') throw new TypeError('Runtime animationFrame() requires a function callback.');
      if (typeof win.requestAnimationFrame !== 'function') {
        return timeout(() => callback(Date.now()), 16);
      }
      let frame = 0;
      let active = true;
      let release = () => false;
      const tick = timestamp => {
        frame = 0;
        if (!active || state !== 'active') return;
        try {
          if (callback(timestamp) !== false && active && state === 'active') frame = win.requestAnimationFrame(tick);
          else release();
        } catch (error) {
          report(error, `${owner}/animation frame callback`);
          release();
        }
      };
      release = addCleanup(() => {
        active = false;
        if (frame) win.cancelAnimationFrame(frame);
        frame = 0;
      }, 'animation-frame');
      if (active && state === 'active') frame = win.requestAnimationFrame(tick);
      return release;
    }

    function trackObserver(observer) {
      if (!observer || typeof observer.disconnect !== 'function') throw new TypeError('trackObserver() requires an observer with disconnect().');
      addCleanup(() => observer.disconnect(), 'observer');
      return observer;
    }

    function trackObjectURL(url) {
      const value = String(url || '');
      if (!value.startsWith('blob:')) throw new TypeError('Only blob: object URLs can be tracked by a runtime scope.');
      addCleanup(() => { try { win.URL.revokeObjectURL(value); } catch (_) {} }, 'object-url');
      return value;
    }

    function createObjectURL(blob) {
      if (!win.URL || typeof win.URL.createObjectURL !== 'function') throw new Error('Object URLs are unavailable in this browser.');
      return trackObjectURL(win.URL.createObjectURL(blob));
    }

    function trackWorker(worker) {
      if (!worker || typeof worker.terminate !== 'function') throw new TypeError('trackWorker() requires a Worker-like object with terminate().');
      addCleanup(() => worker.terminate(), 'worker');
      return worker;
    }

    function trackAudioContext(context) {
      if (!context || typeof context.close !== 'function') throw new TypeError('trackAudioContext() requires an AudioContext-like object.');
      addCleanup(() => {
        if (context.state !== 'closed') {
          const result = context.close();
          if (result && typeof result.catch === 'function') result.catch(error => report(error, `${owner}/audio-context close`));
        }
      }, 'audio-context');
      return context;
    }

    function trackAbortController(childController) {
      const value = childController || new win.AbortController();
      if (!value || typeof value.abort !== 'function') throw new TypeError('trackAbortController() requires an AbortController-like object.');
      addCleanup(() => { if (!value.signal || !value.signal.aborted) value.abort(); }, 'abort-controller');
      return value;
    }

    function dispose(reason) {
      if (state !== 'active') return false;
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
      if (scope && scope.getStatus().state === 'active' && scope.dispose(reason || 'dispose-all')) disposed += 1;
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
