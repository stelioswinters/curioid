/* CURIOID v1.335 lazy Health Check module. Runs only when requested. */
(function (root) {
  'use strict';
  const EXPECTED_RELEASE = 'v1.335';
  const HEALTH_PROBE_PREFIX = '__curioid_health_probe_';
  function create(options) {
    const {
      runButton: healthRunButton,
      repairButton: healthRepairButton,
      status: healthStatus,
      state: healthState,
      results: healthResults,
      downloadButton: healthDownloadButton,
      details: healthDetails,
      detailsSummary: healthDetailsSummary,
      formatStorageSize,
      expectedHealthHash
    } = options || {};
    const deploymentBase = (() => { try { const canonical=document.querySelector('link[rel="canonical"]')?.href; return new URL('.',canonical||location.href); } catch (_) { return new URL('.',location.href); } })();
  let lastHealthReport = null;
  let activeDiagnosticRows = [];
  const diagnosticEvents = [];
  const observedLongTasks = [];
  const observedEventTimings = [];
  const observedLcpEntries = [];
  const observedLayoutShifts = [];
  const observedLongAnimationFrames = [];
  let longTaskObserver = null;
  let eventTimingObserver = null;
  let lcpObserver = null;
  let layoutShiftObserver = null;
  let longAnimationFrameObserver = null;
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('longtask')) {
      longTaskObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          observedLongTasks.push({ startTimeMs:Math.round(entry.startTime), durationMs:Math.round(entry.duration), attribution:(entry.attribution||[]).slice(0,5).map(item=>({name:String(item.name||'').slice(0,40),containerType:String(item.containerType||'').slice(0,24),containerPath:safePathMaybe(item.containerSrc||'')})) });
          if (observedLongTasks.length > 120) observedLongTasks.shift();
        }
      });
      longTaskObserver.observe({ type:'longtask', buffered:true });
    }
  } catch (_) { longTaskObserver = null; }
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('event')) {
      eventTimingObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const start = Number(entry.startTime), duration = Number(entry.duration);
          if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) continue;
          const processingStart = Number(entry.processingStart), processingEnd = Number(entry.processingEnd);
          const sample = {
            name:String(entry.name || 'event').slice(0,24),
            startTimeMs:Math.round(start), durationMs:Math.round(duration),
            inputDelayMs:Number.isFinite(processingStart) ? Math.max(0,Math.round(processingStart-start)) : null,
            processingMs:Number.isFinite(processingStart) && Number.isFinite(processingEnd) ? Math.max(0,Math.round(processingEnd-processingStart)) : null,
            presentationDelayMs:Number.isFinite(processingEnd) ? Math.max(0,Math.round(start+duration-processingEnd)) : null,
            targetTag:String(entry.target?.tagName||entry.target?.parentElement?.tagName||'unknown').slice(0,24).toLowerCase(),
            targetRole:String(entry.target?.getAttribute?.('role')||'').slice(0,32)
          };
          observedEventTimings.push(sample);
          if (observedEventTimings.length > 200) observedEventTimings.shift();
        }
      });
      eventTimingObserver.observe({ type:'event', buffered:true, durationThreshold:16 });
    }
  } catch (_) { eventTimingObserver = null; }
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('largest-contentful-paint')) {
      lcpObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          observedLcpEntries.push({ startTimeMs:roundedSafe(entry.startTime), renderTimeMs:roundedSafe(entry.renderTime), loadTimeMs:roundedSafe(entry.loadTime), size:Number.isFinite(entry.size)?Math.round(entry.size):null, elementTag:String(entry.element?.tagName||'').slice(0,24), elementRole:String(entry.element?.getAttribute?.('role')||'').slice(0,32), url:safePathMaybe(entry.url||'') });
          if (observedLcpEntries.length > 60) observedLcpEntries.shift();
        }
      });
      lcpObserver.observe({ type:'largest-contentful-paint', buffered:true });
    }
  } catch (_) { lcpObserver = null; }
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('layout-shift')) {
      layoutShiftObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          observedLayoutShifts.push({ startTimeMs:roundedSafe(entry.startTime), value:roundedSafe(entry.value,4), hadRecentInput:!!entry.hadRecentInput, sourceTags:(entry.sources||[]).slice(0,3).map(source=>({tag:String(source.node?.nodeName||'unknown').slice(0,24),role:String(source.node?.getAttribute?.('role')||'').slice(0,32)})) });
          if (observedLayoutShifts.length > 150) observedLayoutShifts.shift();
        }
      });
      layoutShiftObserver.observe({ type:'layout-shift', buffered:true });
    }
  } catch (_) { layoutShiftObserver = null; }
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame')) {
      longAnimationFrameObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const scripts = Array.isArray(entry.scripts) ? entry.scripts : [];
          observedLongAnimationFrames.push({ startTimeMs:roundedSafe(entry.startTime), durationMs:roundedSafe(entry.duration), blockingDurationMs:roundedSafe(entry.blockingDuration), scriptCount:scripts.length, longestScriptMs:scripts.reduce((max,item)=>Math.max(max,Number(item.duration)||0),0), scripts:scripts.slice(0,6).map(item=>({durationMs:roundedSafe(item.duration),sourcePath:safePathMaybe(item.sourceURL||''),invokerType:String(item.invokerType||'').slice(0,32),functionName:String(item.sourceFunctionName||'').slice(0,64)})) });
          if (observedLongAnimationFrames.length > 80) observedLongAnimationFrames.shift();
        }
      });
      longAnimationFrameObserver.observe({ type:'long-animation-frame', buffered:true });
    }
  } catch (_) { longAnimationFrameObserver = null; }
  function roundedSafe(value, digits=0) { return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null; }
  function safePathMaybe(raw) { try { const url=new URL(raw,location.href); return url.origin===location.origin?url.pathname.slice(0,260):null; } catch (_) { return null; } }
  const recordDiagnosticEvent = event => {
    diagnosticEvents.push({ at:new Date().toISOString(), ...event });
    if (diagnosticEvents.length > 24) diagnosticEvents.splice(0, diagnosticEvents.length - 24);
  };
  window.addEventListener('error', event => recordDiagnosticEvent({
    type:'error', message:String(event.message || 'Script error').slice(0,240),
    source:(()=>{try{const u=new URL(event.filename||'',location.href);return u.origin===location.origin?u.pathname.slice(0,240):'external source omitted';}catch(_){return '';}})(), line:Number(event.lineno)||0, column:Number(event.colno)||0
  }));
  window.addEventListener('unhandledrejection', event => recordDiagnosticEvent({
    type:'unhandledrejection', message:String(event.reason?.message || event.reason || 'Unhandled promise rejection').slice(0,300)
  }));
  window.addEventListener('error', event => {
    const target = event.target;
    if (!target || target === window) return;
    const raw = target.src || target.href || '';
    recordDiagnosticEvent({ type:'resource-error', tag:String(target.tagName || 'resource').slice(0,24), path:safePathMaybe(raw), message:'A resource emitted a load error.' });
  }, true);
  window.addEventListener('securitypolicyviolation', event => recordDiagnosticEvent({
    type:'csp-violation', directive:String(event.effectiveDirective || event.violatedDirective || '').slice(0,100),
    blockedPath:safePathMaybe(event.blockedURI || ''), disposition:String(event.disposition || '').slice(0,24),
    message:'Content Security Policy blocked a resource or operation.'
  }));
  window.addEventListener('pageshow', event => recordDiagnosticEvent({type:'pageshow', persisted:!!event.persisted, message:event.persisted?'Page restored from the back/forward cache.':'Page shown.'}));
  window.addEventListener('pagehide', event => recordDiagnosticEvent({type:'pagehide', persisted:!!event.persisted, message:event.persisted?'Page entering the back/forward cache.':'Page leaving.'}));
  const healthTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    Promise.resolve(promise).then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error); });
  });
  function paintHealthResults(rows, statusText, stateText) {
    if (healthResults) {
      healthResults.replaceChildren();
      for (const row of rows) {
        const item = document.createElement('li');
        item.dataset.state = row.ok ? 'ok' : row.warning ? 'warning' : 'error';
        const label = document.createElement('b'); label.textContent = row.label;
        const detail = document.createElement('span'); detail.textContent = row.detail;
        item.append(label, detail); healthResults.appendChild(item);
      }
    }
    if (healthStatus) healthStatus.textContent = statusText;
    if (healthState) { healthState.textContent = stateText; healthState.dataset.state = stateText.toLowerCase().replace(/[^a-z]+/g, '-'); }
  }
  async function fetchReleaseManifest() {
    const url = new URL(`service-worker-current.js?release=${EXPECTED_RELEASE}`, deploymentBase);
    const response = await healthTimeout(fetch(url.href, { cache:'no-store', credentials:'same-origin' }), 10000, 'deployment manifest request');
    if (!response.ok) throw new Error(`Service worker returned HTTP ${response.status}`);
    const source = await response.text();
    const marker = source.match(/const RELEASE_ID\s*=\s*['"](v[0-9.]+)['"]/);
    const match = source.match(/const EXPECTED_SHA256\s*=\s*Object\.freeze\((\{[\s\S]*?\})\);/);
    if (!marker || marker[1] !== EXPECTED_RELEASE) throw new Error(`Worker release ${marker?.[1] || 'unknown'} does not match ${EXPECTED_RELEASE}`);
    if (!match) throw new Error('The worker does not expose its release asset manifest.');
    const manifest = JSON.parse(match[1].replace(/,\s*}/g, '}'));
    const entries = Object.entries(manifest);
    if (entries.length < 15 || entries.some(([file, hash]) => !/^[a-z0-9._-]+$/i.test(file) || !/^[a-f0-9]{64}$/i.test(hash))) {
      throw new Error('The release manifest is incomplete or contains an invalid SHA-256 entry.');
    }
    return { url:url.href, response, source, release:marker[1], manifest, count:entries.length,
      headers:{cacheControl:response.headers.get('cache-control'),age:response.headers.get('age'),etag:response.headers.get('etag'),cfCacheStatus:response.headers.get('cf-cache-status')} };
  }
  function expectedKindForAsset(file) {
    if (/\.js$/i.test(file)) return 'js';
    if (file === 'projects-styles.css') return 'styles';
    if (file === 'vocal-lexicon-data.json') return 'json';
    if (/\.html?$/i.test(file)) return 'html';
    if (/\.png$/i.test(file)) return 'png';
    if (/\.svg$/i.test(file)) return 'svg';
    if (/\.webmanifest$/i.test(file)) return 'manifest';
    return 'text';
  }
  function labelForAsset(file) {
    const known = {
      'health-check.js':'Health Check module', 'vanta-deck-app.js':'VANTA DECK app script', 'glitchyard-app.js':'GLITCHYARD app script', 'dark-looper-app.js':'D4RK L00PER app script', 'chroma-loom.html':'Chroma Loom standalone app', 'projects-core.js':'Shared project core',
      'projects-styles.css':'Project stylesheet source', 'projects-category-operating-systems.js':'Operating Systems category bundle',
      'projects-category-strange-archives.js':'Stories category bundle', 'projects-category-web-experiments.js':'Web Experiments category bundle',
      'projects-category-tiny-games.js':'Tiny Games category bundle', 'projects-category-digital-art.js':'Digital Art category bundle',
      'projects-category-sound-motion.js':'Sound Motion category bundle', 'projects-category-creative-tools.js':'Creative Tools category bundle',
      'music-audio-apps.html':'Music & Audio apps page', 'applications-tools-apps.html':'Applications & Tools apps page',
      'vocal-lexicon.js':'Vocal Lexicon loader', 'vocal-lexicon-data.json':'Vocal Lexicon data tables', 'curioids.html':'Curioids page', 'manifest.webmanifest':'PWA manifest',
      'curioid-icon.svg':'Brand SVG icon', 'curioid-icon-192.png':'192px app icon', 'curioid-icon-512.png':'512px app icon',
      'social-preview.png':'Social preview image', 'robots.txt':'Robots policy', 'sitemap.xml':'XML sitemap', 'index.html':'Homepage document'
    };
    return known[file] || file;
  }
  async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length); let cursor = 0;
    const workers = Array.from({length:Math.max(1,Math.min(limit,items.length))}, async () => {
      while (true) { const index = cursor++; if (index >= items.length) return; results[index] = await mapper(items[index], index); }
    });
    await Promise.all(workers); return results;
  }
  async function cleanupOwnedHealthProbes() {
    const removed = { caches:0, databases:0, opfsFiles:0 };
    try {
      for (const name of await caches.keys()) if (name.startsWith(HEALTH_PROBE_PREFIX)) {
        if (await caches.delete(name)) removed.caches++;
      }
    } catch (_) {}
    try {
      if (typeof indexedDB.databases === 'function') {
        for (const item of await indexedDB.databases()) {
          if (String(item?.name || '').startsWith(HEALTH_PROBE_PREFIX)) {
            await new Promise(resolve => { const req=indexedDB.deleteDatabase(item.name); req.onsuccess=req.onerror=req.onblocked=()=>resolve(); });
            removed.databases++;
          }
        }
      }
    } catch (_) {}
    try {
      if (typeof navigator.storage?.getDirectory === 'function') {
        const root = await navigator.storage.getDirectory();
        for await (const [name, handle] of root.entries()) {
          if (handle.kind === 'file' && name.startsWith('.' + HEALTH_PROBE_PREFIX)) {
            await root.removeEntry(name); removed.opfsFiles++;
          }
        }
      }
    } catch (_) {}
    return removed;
  }
  async function probeWebLocks() {
    if (!navigator.locks?.request) return {ok:false,warning:true,detail:'Web Locks API is unavailable; production backup operations will advise closing other CURIOID tabs.'};
    const name = `${HEALTH_PROBE_PREFIX}lock-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    let releaseFirst, acquiredResolve;
    const acquired = new Promise(resolve => { acquiredResolve = resolve; });
    const first = navigator.locks.request(name, {mode:'exclusive'}, async lock => {
      if (!lock) throw new Error('First exclusive lock was not granted.');
      acquiredResolve(true);
      await new Promise(resolve => { releaseFirst = resolve; });
    });
    try {
      await healthTimeout(acquired, 2500, 'Web Locks first acquisition');
      const second = await healthTimeout(navigator.locks.request(name, {mode:'exclusive',ifAvailable:true}, lock => Boolean(lock)), 2500, 'Web Locks contention check');
      if (second !== false) throw new Error('A second exclusive lock was granted while the first was held.');
      releaseFirst?.(); await healthTimeout(first, 2500, 'Web Locks release');
      return {ok:true,detail:'Disposable Web Lock contention test passed: second writer was denied while the first held the exclusive lock; no production lock or data was touched.'};
    } catch (error) {
      releaseFirst?.(); try { await first; } catch (_) {}
      return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)};
    }
  }
  function probeRuntimeSupervisor() {
    const supervisor = window.CurioidRuntimeSupervisor;
    if (!supervisor?.createScope) return {ok:false,warning:true,detail:'Runtime Supervisor is not initialized; a resource cleanup canary could not run.'};
    let cleanupCount = 0, url = '';
    try {
      const scope = supervisor.createScope({owner:'Health Check disposable lifecycle canary'});
      scope.addCleanup(() => { cleanupCount++; });
      if (scope.createObjectURL) url = scope.createObjectURL(new Blob(['CURIOID_LIFECYCLE_PROBE'], {type:'text/plain'}));
      scope.timeout(() => {}, 60000);
      scope.interval(() => {}, 60000);
      const globalBefore = supervisor.getStatus();
      const before = scope.getStatus();
      scope.dispose('health-check-canary');
      const after = scope.getStatus();
      const active = supervisor.getStatus();
      const ok = cleanupCount === 1 && after.state === 'disposed' && after.activeResources === 0 && active.activeScopes === globalBefore.activeScopes;
      return {ok,warning:!ok,detail:`Disposable scope ${before.state} → ${after.state}; cleanup callbacks ${cleanupCount}; remaining scope resources ${after.activeResources}; global scopes ${globalBefore.activeScopes} → ${active.activeScopes}. Existing application scopes are preserved.${url?' Object URL lifecycle included.':''}`};
    } catch (error) { return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}; }
  }
  async function probeDownloadCanary() {
    let url = '';
    try {
      const text = `CURIOID download canary ${Date.now()}`;
      const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
      url = URL.createObjectURL(blob);
      const response = await healthTimeout(fetch(url), 2500, 'Blob download canary read-back');
      const readBack = await response.text();
      const anchor = document.createElement('a');
      anchor.download = 'curioid-health-download-test.txt';
      const supported = 'download' in anchor;
      if (readBack !== text || !supported) throw new Error('The Blob read-back or anchor download capability check failed.');
      return {ok:true,detail:'Temporary Blob URL was created, fetched and read back correctly; anchor download attribute is supported. This verifies browser-side preparation, not the operating-system save prompt.'};
    } catch (error) { return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}; }
    finally { if (url) URL.revokeObjectURL(url); }
  }
  async function probeIndexedDBRollback() {
    if (!window.indexedDB?.open) return {ok:false,warning:true,detail:'IndexedDB is unavailable; atomic rollback cannot be tested.'};
    const name = `${HEALTH_PROBE_PREFIX}rollback-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    let db = null;
    try {
      db = await healthTimeout(new Promise((resolve,reject)=>{
        const request=indexedDB.open(name,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('probe');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error||new Error('Temporary rollback database failed to open'));
        request.onblocked=()=>reject(new Error('Temporary rollback database open was blocked'));
      }),3500,'IndexedDB rollback database open');
      const aborted = await healthTimeout(new Promise((resolve,reject)=>{
        const tx=db.transaction('probe','readwrite');
        tx.objectStore('probe').put('must-not-commit','rollback-key');
        tx.onabort=()=>resolve(true);
        tx.onerror=()=>{};
        tx.oncomplete=()=>reject(new Error('The intentionally aborted transaction unexpectedly committed'));
        try { tx.abort(); } catch(error) { reject(error); }
      }),2500,'IndexedDB transaction abort');
      const persisted = await healthTimeout(new Promise((resolve,reject)=>{
        const tx=db.transaction('probe','readonly');
        const request=tx.objectStore('probe').get('rollback-key');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error||new Error('Rollback read-back failed'));
      }),2500,'IndexedDB rollback verification');
      if (!aborted || persisted !== undefined) throw new Error('Aborted IndexedDB write was visible after transaction rollback');
      db.close(); db=null;
      await healthTimeout(new Promise(resolve=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=request.onerror=request.onblocked=()=>resolve();}),2500,'IndexedDB rollback probe cleanup');
      return {ok:true,detail:'Disposable IndexedDB transaction was deliberately aborted and its write was not committed; temporary database deleted. This validates browser transaction atomicity, not the full production restore journal.'};
    } catch(error) {
      try { db?.close(); indexedDB.deleteDatabase(name); } catch(_) {}
      return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)};
    }
  }
  async function probeCryptoCanary() {
    try {
      if (!crypto?.subtle?.digest) throw new Error('Web Crypto digest is unavailable');
      const bytes=new TextEncoder().encode('abc');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
      const expected='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      if(actual!==expected)throw new Error('SHA-256 known-answer test returned an unexpected digest');
      return {ok:true,detail:'Web Crypto SHA-256 known-answer test passed against the published test vector; no user data was hashed.'};
    } catch(error) { return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}; }
  }
  async function probeCompressionCanary() {
    if (typeof CompressionStream!=='function'||typeof DecompressionStream!=='function') return {ok:false,warning:true,detail:'CompressionStream or DecompressionStream is unavailable; compression remains an optional capability.'};
    try {
      const input='CURIOID compression round-trip probe · '.repeat(48);
      const compressed=await new Response(new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      const output=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      if(output!==input)throw new Error('Gzip decompression did not reproduce the original test string');
      return {ok:true,detail:`Gzip compression/decompression round-trip passed (${input.length} input characters → ${compressed.byteLength} compressed bytes). Temporary in-memory data only.`};
    } catch(error) { return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}; }
  }
  async function probeBroadcastChannel() {
    if (typeof BroadcastChannel!=='function') return {ok:false,warning:true,detail:'BroadcastChannel is unavailable; cross-tab messaging must use supported fallbacks.'};
    const name=`${HEALTH_PROBE_PREFIX}broadcast-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    let sender=null,receiver=null;
    try {
      sender=new BroadcastChannel(name); receiver=new BroadcastChannel(name);
      const token=`probe-${Date.now()}`;
      const received=await healthTimeout(new Promise((resolve,reject)=>{receiver.onmessage=event=>resolve(event.data);receiver.onmessageerror=()=>reject(new Error('BroadcastChannel message could not be deserialized'));sender.postMessage({token});}),2500,'BroadcastChannel message round-trip');
      if(received?.token!==token)throw new Error('BroadcastChannel returned an unexpected payload');
      return {ok:true,detail:'Two temporary same-origin channels exchanged a unique test message successfully; both channels are closed after the probe.'};
    } catch(error) { return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}; }
    finally { try{sender?.close();receiver?.close();}catch(_){} }
  }
  async function probeWasmExecution() {
    if(typeof WebAssembly!=='object')return {ok:false,warning:true,detail:'WebAssembly is unavailable.'};
    try {
      const module=await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));
      const instance=await WebAssembly.instantiate(module);
      if(!(instance instanceof WebAssembly.Instance))throw new Error('Minimal WebAssembly module did not instantiate');
      return {ok:true,detail:'A minimal in-memory WebAssembly module compiled and instantiated successfully.'};
    } catch(error) { return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}; }
  }
  async function discoverStorageInventory() {
    const result={indexedDB:{supported:typeof indexedDB?.databases==='function',databaseCount:null,databases:[]},opfs:{supported:typeof navigator.storage?.getDirectory==='function',fileCount:0,directoryCount:0,totalBytes:0,entries:[]},webStorage:{localStorageKeys:null,sessionStorageKeys:null}};
    try {
      if(typeof indexedDB?.databases==='function') {
        const dbs=await healthTimeout(indexedDB.databases(),3500,'IndexedDB database inventory');
        result.indexedDB.databaseCount=dbs.length;
        result.indexedDB.databases=dbs.map(item=>({name:String(item.name||'').slice(0,120),version:Number(item.version)||null})).sort((a,b)=>a.name.localeCompare(b.name));
      }
    } catch(error) { result.indexedDB.error=String(error?.message||error).slice(0,180); }
    try {
      if(result.opfs.supported) {
        const root=await healthTimeout(navigator.storage.getDirectory(),3500,'OPFS inventory');
        for await (const [name,handle] of root.entries()) {
          if(handle.kind==='directory') result.opfs.directoryCount++;
          else if(handle.kind==='file') {
            result.opfs.fileCount++;
            try { const file=await handle.getFile(); result.opfs.totalBytes+=Number(file.size)||0; if(result.opfs.entries.length<30)result.opfs.entries.push({kind:'file',sizeBytes:Number(file.size)||0}); } catch(_) { result.opfs.entries.push({kind:'file',sizeBytes:null}); }
          }
        }
      }
    } catch(error) { result.opfs.error=String(error?.message||error).slice(0,180); }
    try { result.webStorage.localStorageKeys=window.localStorage.length; } catch(_) {}
    try { result.webStorage.sessionStorageKeys=window.sessionStorage.length; } catch(_) {}
    return result;
  }
  async function auditCurrentShellCache(cacheName, manifest) {
    const required=[
      {file:'index.html',strict:false},{file:'manifest.webmanifest',strict:false},
      {file:'curioid-icon.svg',strict:false},{file:'curioid-icon-192.png',strict:false},{file:'curioid-icon-512.png',strict:false}
    ];
    const criticalOfflineAssets=['site-runtime-current.js','projects-core.js','projects-styles.css','health-check.js',
      'projects-category-operating-systems.js','projects-category-strange-archives.js','projects-category-web-experiments.js',
      'projects-category-tiny-games.js','projects-category-digital-art.js','projects-category-sound-motion.js','projects-category-creative-tools.js'];
    for(const file of criticalOfflineAssets) if(manifest?.[file]) required.push({file,hash:manifest[file],strict:true});
    try {
      const cache=await caches.open(cacheName);
      const missing=[],verified=[];
      for(const asset of required) {
        const url=new URL(asset.file,deploymentBase);
        if(asset.hash) url.searchParams.set('v',`sha256-${asset.hash}`);
        const response=await cache.match(new Request(url.href));
        if(!response?.ok){missing.push(asset.file);continue;}
        if(asset.strict) {
          const bytes=await response.clone().arrayBuffer();
          const digest=await crypto.subtle.digest('SHA-256',bytes);
          const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
          if(actual!==asset.hash){missing.push(`${asset.file} (cached SHA-256 mismatch)`);continue;}
        }
        verified.push(asset.file);
      }
      const deepCount=verified.filter(file=>criticalOfflineAssets.includes(file)).length;
      return {ok:missing.length===0,missing,verified,criticalOfflineAssets:deepCount,criticalOfflineExpected:criticalOfflineAssets.filter(file=>manifest?.[file]).length,
        detail:missing.length?`Current shell cache is missing or has invalid: ${missing.join(', ')}. ${deepCount}/${criticalOfflineAssets.length} core/category/Health Check assets are cached and hash-verified.`:`All ${required.length} required offline entries exist. ${deepCount} shared-core, stylesheet, Health Check and category assets are cached with matching release SHA-256 hashes.`};
    } catch(error) { return {ok:false,missing:required.map(item=>item.file),detail:String(error?.message||error).slice(0,220)}; }
  }
  function scanStaticSecuritySinks(source) {
    const patterns={innerHTML:/\.innerHTML\s*=/g,outerHTML:/\.outerHTML\s*=/g,insertAdjacentHTML:/\.insertAdjacentHTML\s*\(/g,documentWrite:/document\.write(?:ln)?\s*\(/g,dynamicEval:/(?:\beval\s*\(|\bnew\s+Function\s*\()/g,srcdoc:/\.srcdoc\s*=/g};
    const counts={};
    for(const [name,pattern] of Object.entries(patterns))counts[name]=(source.match(pattern)||[]).length;
    return counts;
  }

  async function probeTemporaryIndexedDB() {
    if (!window.indexedDB?.open) return { ok:false, warning:true, detail:'IndexedDB is unavailable in this browser.' };
    const name = `__curioid_health_probe_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    let database = null;
    try {
      database = await healthTimeout(new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => { try { request.result.createObjectStore('probe'); } catch (_) {} };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        request.onblocked = () => reject(new Error('IndexedDB probe was blocked by another tab'));
      }), 3500, 'IndexedDB open');
      const token = `probe-${Date.now()}`;
      const readBack = await healthTimeout(new Promise((resolve, reject) => {
        const transaction = database.transaction('probe', 'readwrite');
        const store = transaction.objectStore('probe');
        store.put(token, 'health-key');
        const read = store.get('health-key');
        let value;
        read.onsuccess = () => { value = read.result; };
        read.onerror = () => reject(read.error || new Error('IndexedDB read failed'));
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
      }), 3500, 'IndexedDB read/write');
      if (readBack !== token) throw new Error('IndexedDB read-back did not match the written test value');
      database.close(); database = null;
      await healthTimeout(new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error || new Error('temporary probe cleanup failed'));
        request.onblocked = () => resolve();
      }), 2500, 'IndexedDB cleanup');
      return { ok:true, detail:'Temporary IndexedDB write/read/delete probe passed; database removed.' };
    } catch (error) {
      try { database?.close(); indexedDB.deleteDatabase(name); } catch (_) {}
      return { ok:false, warning:true, detail:String(error?.message || error).slice(0,220) };
    }
  }
  async function probeWebStorage(storage, label) {
    const key = `__curioid_health_probe_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const value = `ok-${Date.now()}`;
    try {
      storage.setItem(key, value);
      const readBack = storage.getItem(key);
      storage.removeItem(key);
      if (readBack !== value) throw new Error('Read-back did not match the written test value');
      return { ok:true, detail:`Temporary ${label} write/read/remove probe passed; test key removed.` };
    } catch (error) {
      try { storage.removeItem(key); } catch (_) {}
      return { ok:false, warning:true, detail:String(error?.message || error).slice(0,220) };
    }
  }
  async function probeOpfs() {
    const storage = navigator.storage;
    if (typeof storage?.getDirectory !== 'function') return { ok:false, warning:true, detail:'Origin Private File System is unavailable in this browser.' };
    const name = `.__curioid_health_probe_${Date.now()}_${Math.random().toString(36).slice(2,8)}.tmp`;
    const stageName = name + '.stage';
    let root = null;
    try {
      root = await healthTimeout(storage.getDirectory(), 3500, 'OPFS root access');
      const handle = await healthTimeout(root.getFileHandle(name, { create:true }), 3500, 'OPFS temporary file creation');
      const writable = await healthTimeout(handle.createWritable(), 3500, 'OPFS temporary file open');
      await healthTimeout(writable.write('CURIOID_OPFS_PROBE'), 3500, 'OPFS temporary file write');
      await healthTimeout(writable.close(), 3500, 'OPFS temporary file close');
      const file = await healthTimeout(handle.getFile(), 3500, 'OPFS temporary file read');
      const value = await healthTimeout(file.text(), 3500, 'OPFS temporary file decode');
      if (value !== 'CURIOID_OPFS_PROBE') throw new Error('OPFS read-back did not match the temporary probe value');
      const stageHandle=await healthTimeout(root.getFileHandle(stageName,{create:true}),3500,'OPFS staged file creation');
      const staged=await healthTimeout(stageHandle.createWritable(),3500,'OPFS staged writable stream');
      await healthTimeout(staged.write('CURIOID_OPFS_STAGE'),3500,'OPFS staged write');
      await healthTimeout(staged.close(),3500,'OPFS staged commit');
      const stagedValue=await (await stageHandle.getFile()).text();
      if(stagedValue!=='CURIOID_OPFS_STAGE')throw new Error('OPFS staged commit read-back failed');
      await root.removeEntry(stageName);
      return { ok:true, detail:'Temporary OPFS create/write/read and staged commit/read/remove probes passed; both temporary files are removed after verification. User files are not touched.' };
    } catch (error) {
      return { ok:false, warning:true, detail:String(error?.message || error).slice(0,220) };
    } finally {
      try { await root?.removeEntry(name); } catch (_) {}
      try { await root?.removeEntry(stageName); } catch (_) {}
    }
  }
  async function probeCacheStorage() {
    if (!window.caches?.open) return { ok:false, warning:true, detail:'Cache Storage is unavailable in this browser.' };
    const name = `__curioid_health_probe_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const request = new Request(`${location.origin}/__curioid_health_probe__`);
    try {
      const cache = await healthTimeout(caches.open(name), 3000, 'Cache Storage open');
      await healthTimeout(cache.put(request, new Response('CURIOID cache probe', { headers:{'Content-Type':'text/plain'} })), 3000, 'Cache Storage write');
      const match = await healthTimeout(cache.match(request), 3000, 'Cache Storage read');
      const value = await match?.text();
      await caches.delete(name);
      if (value !== 'CURIOID cache probe') throw new Error('Cache Storage read-back did not match the written test value');
      return { ok:true, detail:'Temporary Cache Storage write/read/delete probe passed; temporary cache removed.' };
    } catch (error) {
      try { await caches.delete(name); } catch (_) {}
      return { ok:false, warning:true, detail:String(error?.message || error).slice(0,220) };
    }
  }
  async function probeWorker() {
    if (typeof Worker !== 'function' || typeof URL.createObjectURL !== 'function') return { ok:false, warning:true, detail:'Web Workers are unavailable.' };
    let worker = null, url = '';
    try {
      const blob = new Blob(['self.postMessage("CURIOID_WORKER_OK")'], { type:'text/javascript' });
      url = URL.createObjectURL(blob);
      worker = new Worker(url);
      const response = await healthTimeout(new Promise((resolve, reject) => {
        worker.onmessage = event => resolve(event.data);
        worker.onerror = () => reject(new Error('Worker execution failed or was blocked by policy'));
        worker.postMessage('start');
      }), 2500, 'Web Worker probe');
      if (response !== 'CURIOID_WORKER_OK') throw new Error('Worker returned an unexpected response');
      return { ok:true, detail:'Temporary Blob Worker started and responded successfully.' };
    } catch (error) {
      return { ok:false, warning:true, detail:String(error?.message || error).slice(0,220) };
    } finally {
      try { worker?.terminate(); } catch (_) {}
      if (url) URL.revokeObjectURL(url);
    }
  }
  async function probeReleaseAsset(file, expectedHash, expectedKind) {
    const url = new URL(file, deploymentBase);
    url.searchParams.set('v', `sha256-${expectedHash}`);
    try {
      const response = await healthTimeout(fetch(url.href, { method:'GET', cache:'no-store', credentials:'same-origin' }), 12000, `${file} request`);
      const contentType = response.headers.get('content-type') || 'not supplied';
      if (!response.ok) return { ok:false, detail:`HTTP ${response.status} ${response.statusText || ''}; ${contentType}; URL ${response.url || url.href}`.trim() };
      const bytes = await healthTimeout(response.arrayBuffer(), 15000, `${file} download`);
      const size = bytes.byteLength;
      if (!window.crypto?.subtle?.digest) return { ok:false, warning:true, detail:`HTTP ${response.status}; ${contentType}; ${size.toLocaleString()} bytes; Web Crypto SHA-256 unavailable.` };
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      const matches = actual === expectedHash;
      const strictIntegrity = expectedKind === 'js' || expectedKind === 'styles' || expectedKind === 'json';
      let actualSha384 = null;
      if (expectedKind === 'js' || expectedKind === 'styles') {
        const sha384 = await crypto.subtle.digest('SHA-384', bytes);
        actualSha384 = 'sha384-' + btoa(String.fromCharCode(...new Uint8Array(sha384)));
      }
      const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(1024, size))).trimStart();
      const looksLikeHtml = /text\/html/i.test(contentType) || /^<!doctype html|^<html/i.test(prefix);
      const looksLikeSvg = /<svg[\s>]/i.test(prefix);
      const pngSignature = size >= 8 && new Uint8Array(bytes.slice(0,8)).join(',') === '137,80,78,71,13,10,26,10';
      let pngDimensions = null;
      if (pngSignature && size >= 24) { const view = new DataView(bytes); pngDimensions = {width:view.getUint32(16),height:view.getUint32(20)}; }
      let parsedManifest = null, cssRuleCount = null, decodedText = '', securityScan = null;
      if (expectedKind === 'manifest') { try { parsedManifest = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) {} }
      if (expectedKind === 'js') { try { securityScan = scanStaticSecuritySinks(new TextDecoder().decode(bytes)); } catch (_) { securityScan = null; } }
      if (expectedKind === 'html') {
        try {
          const htmlText = new TextDecoder().decode(bytes);
          const parsedHtml = new DOMParser().parseFromString(htmlText, 'text/html');
          const executableInlineScripts = [...parsedHtml.querySelectorAll('script:not([src])')].filter(node=>!/^application\/ld\+json$/i.test(node.type||''));
          const inlineScripts = executableInlineScripts.map(node => node.textContent || '').join('\n');
          const inlineScan = scanStaticSecuritySinks(inlineScripts);
          const eventHandlers = [...parsedHtml.querySelectorAll('*')].reduce((count,node)=>count+[...node.attributes].filter(attribute=>/^on/i.test(attribute.name)).length,0);
          const javascriptUrls = [...parsedHtml.querySelectorAll('[href],[src],[action]')].filter(node=>['href','src','action'].some(name=>/^\s*javascript:/i.test(node.getAttribute(name)||''))).length;
          securityScan = {...inlineScan,inlineScriptBlocks:executableInlineScripts.length,inlineEventHandlers:eventHandlers,javascriptUrls};
        } catch (_) { securityScan = null; }
      }
      if (expectedKind === 'styles') {
        try {
          decodedText = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
          if (typeof CSSStyleSheet === 'function') {
            const sheet = new CSSStyleSheet(); sheet.replaceSync(decodedText); cssRuleCount = sheet.cssRules?.length ?? null;
          } else {
            const opens = (decodedText.match(/{/g)||[]).length, closes = (decodedText.match(/}/g)||[]).length;
            cssRuleCount = opens === closes ? opens : -1;
          }
        } catch (_) { cssRuleCount = -1; }
      }
      const kindLooksRight = expectedKind === 'js' ? /javascript|ecmascript/i.test(contentType)
        : expectedKind === 'styles' ? /text\/plain|text\/css|application\/octet-stream/i.test(contentType)
        : expectedKind === 'html' ? looksLikeHtml
        : expectedKind === 'svg' ? /image\/svg\+xml|text\/xml/i.test(contentType)
        : expectedKind === 'png' ? /image\/png/i.test(contentType)
        : expectedKind === 'manifest' ? /manifest\+json|application\/json/i.test(contentType)
        : expectedKind === 'json' ? /application\/json|application\/[^;]+\+json/i.test(contentType)
        : expectedKind === 'text' ? /text\/|application\/xml/i.test(contentType)
        : true;
      const expectedPngDimensions = file === 'social-preview.png' ? {width:1200,height:630} : file === 'curioid-icon-192.png' ? {width:192,height:192} : file === 'curioid-icon-512.png' ? {width:512,height:512} : null;
      const pngDimensionsMatch = !!pngDimensions && (!expectedPngDimensions || (pngDimensions.width === expectedPngDimensions.width && pngDimensions.height === expectedPngDimensions.height));
      const contentLooksRight = expectedKind === 'html' ? looksLikeHtml
        : expectedKind === 'svg' ? looksLikeSvg
        : expectedKind === 'png' ? pngSignature && pngDimensionsMatch
        : expectedKind === 'manifest' ? !!parsedManifest?.name && !!parsedManifest?.start_url
        : expectedKind === 'styles' ? !looksLikeHtml && size > 10000 && Number(cssRuleCount) > 100
        : expectedKind === 'json' ? !looksLikeHtml && size > 10000 && size <= 4 * 1024 * 1024
        : !looksLikeHtml;
      const headers = {cacheControl:response.headers.get('cache-control'),etag:response.headers.get('etag'),age:response.headers.get('age'),cfCacheStatus:response.headers.get('cf-cache-status'),server:response.headers.get('server'),xCache:response.headers.get('x-cache'),contentLength:response.headers.get('content-length')};
      const dimensions = pngDimensions ? `; ${pngDimensions.width}×${pngDimensions.height}px` : '';
      const cssDetail = expectedKind === 'styles' ? `; CSS rules ${cssRuleCount ?? 'not measured'}` : '';
      const integrityLabel = matches ? 'MATCH' : strictIntegrity ? 'MISMATCH' : 'EDGE-TRANSFORMED / NOT SRI-BOUND';
      const details = `HTTP ${response.status}; ${contentType}; ${size.toLocaleString()} bytes${dimensions}${cssDetail}; SHA-256 ${integrityLabel}${!contentLooksRight ? `; response content does not match expected ${expectedKind} asset type/structure` : ''}; CF cache ${headers.cfCacheStatus || 'not reported'}; age ${headers.age || 'not reported'}; ${response.redirected ? `redirected to ${response.url}` : 'no redirect'}; ${url.href}`;
      return { ok:(matches || !strictIntegrity) && contentLooksRight && kindLooksRight, warning:(!matches && !strictIntegrity) || !kindLooksRight, detail:details,
        meta:{file,url:url.href,status:response.status,contentType,bytes:size,pngDimensions,cssRuleCount,manifest:parsedManifest?{name:parsedManifest.name,short_name:parsedManifest.short_name,icons:parsedManifest.icons}:null,securityScan,expectedHash,actualHash:actual,actualSha384,hashMatches:matches,redirected:response.redirected,finalUrl:response.url || url.href,headers} };
    } catch (error) { return {ok:false,detail:`${String(error?.message || error).slice(0,220)}; URL ${url.href}`}; }
  }
  async function probePublishedShell() {
    try {
      const swUrl=new URL('service-worker-current.js?release=v1.335',deploymentBase);
      const swResponse=await healthTimeout(fetch(swUrl.href,{cache:'no-store',credentials:'same-origin'}),8000,'release manifest request');
      if(!swResponse.ok)throw new Error(`Service worker returned HTTP ${swResponse.status}`);
      const swText=await swResponse.text();
      if(!new RegExp('const\\s+RELEASE_ID\\s*=\\s*[\"\\\']'+EXPECTED_RELEASE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[\"\\\']').test(swText))throw new Error(`The deployed service-worker script is not ${EXPECTED_RELEASE}.`);
      const pageUrl=new URL('./',deploymentBase);
      pageUrl.searchParams.set('health-check-release',EXPECTED_RELEASE);
      const response=await healthTimeout(fetch(pageUrl.href,{cache:'no-store',credentials:'same-origin'}),10000,'published shell request');
      if(!response.ok)throw new Error(`Published homepage returned HTTP ${response.status}`);
      const bytes=await healthTimeout(response.arrayBuffer(),10000,'published shell download');
      const shellDoc=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'text/html');
      const meta=name=>shellDoc.querySelector(`meta[name="${name}"]`)?.content||'';
      const prop=name=>shellDoc.querySelector(`meta[property="${name}"]`)?.content||'';
      const publishedRelease=meta('curioid-release')||shellDoc.querySelector('.site-version')?.textContent?.trim()||'unknown';
      const expectedRelease=document.querySelector('meta[name="curioid-release"]')?.content||document.querySelector('.site-version')?.textContent?.trim()||'unknown';
      const count=Number(meta('curioid-project-count'))||Number((shellDoc.querySelector('#projectCount')?.textContent||'').match(/\d+/)?.[0])||null;
      const categoryCount=Number(meta('curioid-category-count'))||shellDoc.querySelectorAll('.category-nav [data-category]').length||null;
      const ogImage=prop('og:image'), twitterImage=meta('twitter:image');
      const ogDescription=prop('og:description'), twitterDescription=meta('twitter:description');
      const ogTitle=prop('og:title'), twitterTitle=meta('twitter:title');
      const sameSocialImage=!!ogImage&&!!twitterImage&&new URL(ogImage,pageUrl).pathname===new URL(twitterImage,pageUrl).pathname;
      const iconSvg=shellDoc.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute('href')||'';
      const iconPng=shellDoc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')||'';
      const iconDeclarationsAligned=!!iconSvg&&!!iconPng&&sameSocialImage;
      const socialCountAligned=!!count&&ogDescription.includes(String(count))&&twitterDescription.includes(String(count));
      const socialTextAligned=!!ogTitle&&ogTitle===twitterTitle&&!!ogDescription&&ogDescription===twitterDescription;
      const expectedCount=Number(document.querySelector('meta[name="curioid-project-count"]')?.content)||null;
      const expectedCategories=Number(document.querySelector('meta[name="curioid-category-count"]')?.content)||null;
      const canonicalUrl=(()=>{try{const u=new URL(shellDoc.querySelector('link[rel="canonical"]')?.href||'');const path=u.pathname.replace(/index\.html$/,'');return u.origin+(path.endsWith('/')?path:path+'/');}catch(_){return null;}})();
      const expectedCanonical=deploymentBase.origin+deploymentBase.pathname;
      const canonicalAligned=!!canonicalUrl&&canonicalUrl===expectedCanonical;
      const projectCountAligned=!!count&&count===expectedCount;
      const categoryCountAligned=!!categoryCount&&categoryCount===expectedCategories;
      const runtimeTag=shellDoc.querySelector('script[src*="site-runtime-current.js"]');
      const runtimePreloadTag=shellDoc.querySelector('link[rel="preload"][as="script"][href*="site-runtime-current.js"]');
      const runtimeSRIValid=!!runtimeTag&&/^sha384-[A-Za-z0-9+/]+=*$/.test(runtimeTag.integrity||'')&&new URL(runtimeTag.src,pageUrl).searchParams.get('v')?.startsWith('sha256-');
      const runtimePreloadSRIValid=!!runtimePreloadTag&&runtimePreloadTag.integrity===runtimeTag?.integrity&&new URL(runtimePreloadTag.href,pageUrl).searchParams.get('v')===new URL(runtimeTag?.src||pageUrl,pageUrl).searchParams.get('v');
      const brandMarkMatches=await (async()=>{
        try{
          const iconResponse=await healthTimeout(fetch(new URL(iconSvg,pageUrl).href,{cache:'no-store',credentials:'same-origin'}),7000,'brand SVG request');
          if(!iconResponse.ok)return false;
          const iconDoc=new DOMParser().parseFromString(await iconResponse.text(),'image/svg+xml');
          const headerSvg=shellDoc.querySelector('.brand-mark svg'),iconRoot=iconDoc.querySelector('svg');
          if(!headerSvg||!iconRoot||iconDoc.querySelector('parsererror'))return false;
          const headerPaths=[...headerSvg.querySelectorAll('.brand-eye-aperture path,.brand-eye-crease')].map(node=>node.getAttribute('d'));
          const iconPaths=[...iconRoot.querySelectorAll('path')].map(node=>node.getAttribute('d'));
          const headerCircles=[...headerSvg.querySelectorAll('.brand-eye-aperture circle')].map(node=>['cx','cy','r'].map(key=>node.getAttribute(key)).join(':'));
          const iconCircles=[...iconRoot.querySelectorAll('circle')].map(node=>['cx','cy','r'].map(key=>node.getAttribute(key)).join(':'));
          return headerPaths.length===3&&headerCircles.length===2&&JSON.stringify(headerPaths)===JSON.stringify(iconPaths)&&JSON.stringify(headerCircles)===JSON.stringify(iconCircles);
        }catch(_){return false;}
      })();
      const metadataAligned=iconDeclarationsAligned&&socialCountAligned&&socialTextAligned&&canonicalAligned&&projectCountAligned&&categoryCountAligned&&brandMarkMatches&&runtimeSRIValid&&runtimePreloadSRIValid;
      const siteSnapshot={url:deploymentBase.origin+deploymentBase.pathname,release:publishedRelease,expectedRelease,releaseMatches:publishedRelease===expectedRelease&&publishedRelease===EXPECTED_RELEASE,title:shellDoc.title||null,description:meta('description')||null,canonical:canonicalUrl,canonicalAligned,projectCount:count,expectedProjectCount:expectedCount,projectCountAligned,categoryCount,expectedCategoryCount:expectedCategories,categoryCountAligned,operatingSystemCount:Number(meta('curioid-os-count'))||6,ogTitle:ogTitle||null,ogDescription:ogDescription||null,twitterTitle:twitterTitle||null,twitterDescription:twitterDescription||null,ogImage:ogImage?new URL(ogImage,pageUrl).pathname:null,twitterImage:twitterImage?new URL(twitterImage,pageUrl).pathname:null,sameSocialImage,socialCountAligned,socialTextAligned,brandMarkMatches,runtimeSRIValid,runtimePreloadSRIValid,iconSvg,iconPng,iconDeclarationsAligned,headers:{cacheControl:response.headers.get('cache-control'),age:response.headers.get('age'),etag:response.headers.get('etag'),cfCacheStatus:response.headers.get('cf-cache-status'),lastModified:response.headers.get('last-modified')}};
      const releaseAligned=publishedRelease===expectedRelease&&publishedRelease===EXPECTED_RELEASE;
      return {ok:releaseAligned&&runtimeSRIValid&&runtimePreloadSRIValid,warning:releaseAligned&&!metadataAligned,detail:`Homepage HTTP ${response.status}; ${bytes.byteLength.toLocaleString()} bytes; release ${publishedRelease} vs expected ${EXPECTED_RELEASE}; runtime SRI ${runtimeSRIValid?'configured':'missing or invalid'}; preload/script SRI ${runtimePreloadSRIValid?'aligned':'mismatched or missing'}; ${count??'unknown'} project windows; ${categoryCount??'unknown'} categories; canonical ${canonicalAligned?'aligned':'needs review'}; social metadata ${socialTextAligned?'aligned':'needs review'}; header/favicon geometry ${brandMarkMatches?'MATCH':'needs review'}. HTML byte hashes are not enforced because the edge may rewrite non-SRI-bound documents.`,meta:{file:'index.html',url:pageUrl.href,status:response.status,contentType:response.headers.get('content-type')||'not supplied',bytes:bytes.byteLength,releaseMarkerMatches:releaseAligned,hashMatches:null,siteSnapshot}};
    }catch(error){return {ok:false,detail:String(error?.message||error).slice(0,240)}}
  }
  function safeJson(value) {
    try { return JSON.stringify(value, (key, item) => typeof item === 'bigint' ? item.toString() : item, 2); }
    catch (_) { return String(value); }
  }
  function safeLocalPath(raw) {
    try { const url = new URL(raw, location.href); return url.origin === location.origin ? url.pathname.slice(0,260) : null; }
    catch (_) { return null; }
  }
  function rounded(value, digits=0) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  }
  function collectPerformanceSnapshot() {
    const projects = window.CurioidProjects || null;
    const entries = type => { try { return performance.getEntriesByType(type) || []; } catch (_) { return []; } };
    const nav = entries('navigation')[0] || null;
    const paint = entries('paint');
    const lcpEntries = [...entries('largest-contentful-paint'), ...observedLcpEntries].sort((a,b)=>(Number(a.startTimeMs??a.startTime)||0)-(Number(b.startTimeMs??b.startTime)||0));
    const shiftEntries = [...entries('layout-shift'), ...observedLayoutShifts].sort((a,b)=>(Number(a.startTimeMs??a.startTime)||0)-(Number(b.startTimeMs??b.startTime)||0));
    const resources = entries('resource').map(entry => ({
      path:safeLocalPath(entry.name), initiatorType:String(entry.initiatorType||'other'),
      durationMs:rounded(entry.duration), transferBytes:Number.isFinite(entry.transferSize)&&entry.transferSize>0?Math.round(entry.transferSize):null,
      encodedBytes:Number.isFinite(entry.encodedBodySize)&&entry.encodedBodySize>0?Math.round(entry.encodedBodySize):null,
      decodedBytes:Number.isFinite(entry.decodedBodySize)&&entry.decodedBodySize>0?Math.round(entry.decodedBodySize):null
    })).filter(entry => entry.path);
    const knownTransfer = resources.filter(item=>item.transferBytes!==null);
    const sortedSlow = [...resources].sort((a,b)=>(b.durationMs||0)-(a.durationMs||0)).slice(0,8);
    const sortedLarge = [...resources].filter(item=>item.transferBytes!==null).sort((a,b)=>b.transferBytes-a.transferBytes).slice(0,8);
    const tasks = [...observedLongTasks, ...entries('longtask').map(entry=>({startTimeMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration)}))];
    const uniqueTasks = [...new Map(tasks.map(item=>[`${item.startTimeMs}:${item.durationMs}`,item])).values()].sort((a,b)=>a.startTimeMs-b.startTimeMs).slice(-120);
    const rawEventSamples = [
      ...observedEventTimings,
      ...entries('event').filter(entry=>Number.isFinite(entry.duration)&&entry.duration>0).map(entry=>({
        name:String(entry.name||'event').slice(0,24),startTimeMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration),
        targetTag:String(entry.target?.tagName||entry.target?.parentElement?.tagName||'unknown').slice(0,24).toLowerCase(),targetRole:String(entry.target?.getAttribute?.('role')||'').slice(0,32),
        inputDelayMs:Number.isFinite(entry.processingStart)?Math.max(0,Math.round(entry.processingStart-entry.startTime)):null,
        processingMs:Number.isFinite(entry.processingStart)&&Number.isFinite(entry.processingEnd)?Math.max(0,Math.round(entry.processingEnd-entry.processingStart)):null,
        presentationDelayMs:Number.isFinite(entry.processingEnd)?Math.max(0,Math.round(entry.startTime+entry.duration-entry.processingEnd)):null
      }))
    ];
    const uniqueEventSamples = [...new Map(rawEventSamples.map(item=>[`${item.name}:${item.startTimeMs}:${item.durationMs}`,item])).values()].sort((a,b)=>a.startTimeMs-b.startTimeMs).slice(-200);
    const eventDurations = uniqueEventSamples.map(item=>item.durationMs).sort((a,b)=>a-b);
    const eventP75 = eventDurations.length ? eventDurations[Math.min(eventDurations.length-1,Math.ceil(eventDurations.length*.75)-1)] : null;
    const eventP75Of = key => { const values=uniqueEventSamples.map(item=>item[key]).filter(Number.isFinite).sort((a,b)=>a-b); return values.length?values[Math.min(values.length-1,Math.ceil(values.length*.75)-1)]:null; };
    const slowEvents = [...uniqueEventSamples].sort((a,b)=>b.durationMs-a.durationMs).slice(0,8);
    const measures = entries('measure').filter(entry=>String(entry.name||'').startsWith('curioid:')).slice(-40).map(entry=>({name:String(entry.name).slice(0,120),durationMs:rounded(entry.duration),startTimeMs:rounded(entry.startTime)}));
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length-1] : null;
    // CLS is the maximum session-window sum (<=1s gap, <=5s window), not a lifetime sum.
    let cls = 0, sessionValue = 0, sessionStart = null, previousShift = null;
    for (const entry of shiftEntries) {
      if (entry.hadRecentInput) continue;
      const at=Number(entry.startTimeMs??entry.startTime)||0, value=Number(entry.value)||0;
      if (sessionStart===null || at-previousShift>=1000 || at-sessionStart>5000) { sessionStart=at; sessionValue=value; }
      else sessionValue+=value;
      if (sessionValue>cls) cls=sessionValue;
      previousShift=at;
    }
    const supported = typeof PerformanceObserver==='function' ? (PerformanceObserver.supportedEntryTypes||[]) : [];
    const elementCount = document.getElementsByTagName('*').length;
    return {
      navigation:nav?{
        type:nav.type||null, redirectCount:nav.redirectCount||0, protocol:nav.nextHopProtocol||null,
        dnsMs:rounded(nav.domainLookupEnd-nav.domainLookupStart), connectionMs:rounded(nav.connectEnd-nav.connectStart), tlsMs:nav.secureConnectionStart>0?rounded(nav.connectEnd-nav.secureConnectionStart):null,
        serverResponseWaitMs:rounded(nav.responseStart-nav.requestStart), responseDownloadMs:rounded(nav.responseEnd-nav.responseStart),
        domInteractiveMs:rounded(nav.domInteractive), domContentLoadedMs:rounded(nav.domContentLoadedEventEnd),
        loadEventMs:rounded(nav.loadEventEnd), transferBytes:Number.isFinite(nav.transferSize)&&nav.transferSize>0?Math.round(nav.transferSize):null,
        notRestoredReasons:nav.notRestoredReasons?String(nav.notRestoredReasons).slice(0,800):null
      }:null,
      paint:{firstPaintMs:rounded(paint.find(entry=>entry.name==='first-paint')?.startTime),firstContentfulPaintMs:rounded(paint.find(entry=>entry.name==='first-contentful-paint')?.startTime)},
      webVitalsSnapshot:{
        largestContentfulPaintMs:lcp?rounded(lcp.renderTimeMs??lcp.renderTime??lcp.loadTimeMs??lcp.loadTime??lcp.startTimeMs??lcp.startTime):null,
        largestContentfulPaintElement:lcp?{tag:String(lcp.elementTag||lcp.element?.tagName||'').slice(0,24)||null,role:String(lcp.elementRole||'').slice(0,32)||null,size:Number.isFinite(lcp.size)?Math.round(lcp.size):null,url:lcp.url||safePathMaybe(lcp.url||'')}:null,
        cumulativeLayoutShift:shiftEntries.length?rounded(cls,4):null,
        layoutShiftSamples:shiftEntries.slice(-16).map(entry=>({startTimeMs:rounded(entry.startTimeMs??entry.startTime),value:rounded(entry.value,4),hadRecentInput:!!entry.hadRecentInput,sourceTags:entry.sourceTags||((entry.sources||[]).slice(0,3).map(source=>String(source.node?.nodeName||'unknown').slice(0,24)))})),
        interpretation:'Single-browser, current-navigation snapshot only. Not a field 75th-percentile Core Web Vitals assessment. INP is not inferred from a short local check.',
        guidance:{lcpGoodMs:2500,lcpPoorMs:4000,clsGood:0.1,clsPoor:0.25,inpGoodMs:200,inpPoorMs:500}
      },
      resources:{sameOriginCount:resources.length,knownTransferCount:knownTransfer.length,knownTransferBytes:knownTransfer.reduce((sum,item)=>sum+item.transferBytes,0),cacheOrTimingUnavailableCount:resources.length-knownTransfer.length,slowest:sortedSlow,largest:sortedLarge},
      longTasks:{supported:supported.includes('longtask'),count:uniqueTasks.length,totalDurationMs:uniqueTasks.reduce((sum,item)=>sum+item.durationMs,0),totalBlockingTimeProxyMs:uniqueTasks.reduce((sum,item)=>sum+Math.max(0,item.durationMs-50),0),longestDurationMs:uniqueTasks.reduce((max,item)=>Math.max(max,item.durationMs),0),samples:uniqueTasks.slice(-20)},
      observedEventTiming:{supported:supported.includes('event'),sampleCount:uniqueEventSamples.length,p75DurationMs:eventP75,p75InputDelayMs:eventP75Of('inputDelayMs'),p75ProcessingMs:eventP75Of('processingMs'),p75PresentationDelayMs:eventP75Of('presentationDelayMs'),slowest:slowEvents,interpretation:'Local Event Timing sample distribution only, not official field INP. Includes only interacted element tag/ARIA role; no element IDs, selectors, text, form values or entered content.'},
      longAnimationFrames:{supported:supported.includes('long-animation-frame'),count:observedLongAnimationFrames.length,totalBlockingMs:observedLongAnimationFrames.reduce((sum,item)=>sum+(item.blockingDurationMs||0),0),longest:observedLongAnimationFrames.slice().sort((a,b)=>b.durationMs-a.durationMs).slice(0,8)},
      appLaunchMeasures:measures.filter(item=>/project-launch|shared-assets|project-css|project-js|project-category-/.test(item.name)),
      categoryRuntime:{loaded:projects?.getLoadedCategories?.()||[],known:['operating-systems','strange-archives','web-experiments','tiny-games','digital-art','sound-motion','creative-tools']},
      memory:(()=>{const value=performance.memory;if(!value)return null;return{jsHeapSizeLimit:Number(value.jsHeapSizeLimit)||null,totalJSHeapSize:Number(value.totalJSHeapSize)||null,usedJSHeapSize:Number(value.usedJSHeapSize)||null,usedRatio:Number(value.jsHeapSizeLimit)>0?rounded(value.usedJSHeapSize/value.jsHeapSizeLimit,4):null};})(),
      footprint:{elementCount,scriptCount:document.scripts.length,stylesheetCount:document.styleSheets.length,iframeCount:document.querySelectorAll('iframe').length,imageCount:document.images.length,canvasCount:document.querySelectorAll('canvas').length},
      observerSupport:{longtask:supported.includes('longtask'),longAnimationFrame:supported.includes('long-animation-frame'),largestContentfulPaint:supported.includes('largest-contentful-paint'),layoutShift:supported.includes('layout-shift'),event:supported.includes('event'),resource:supported.includes('resource')}
    };
  }
  async function collectCacheInventory(cacheNames) {
    const list=[];
    if(!window.caches?.open)return {available:false,totalCaches:0,totalEntries:null,caches:[]};
    for(const name of (cacheNames||[]).slice(0,20)){
      try{const cache=await caches.open(name);const keys=await healthTimeout(cache.keys(),3000,`cache inventory ${name}`);list.push({name:String(name).slice(0,160),entries:keys.length,sampled:keys.length>500});}
      catch(error){list.push({name:String(name).slice(0,160),error:String(error?.message||error).slice(0,120)});}
    }
    return {available:true,totalCaches:(cacheNames||[]).length,totalEntries:list.reduce((sum,item)=>sum+(item.entries||0),0),caches:list};
  }
  function makeHealthReport(rows, assetMeta, registration, cacheNames, estimate, persisted, performanceSnapshot, cacheInventory, publishedSiteSnapshot, runDurationMs) {
    const runtime = window.CurioidRuntimeSupervisor?.getStatus?.() || null;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const screenInfo = { width:screen.width||null, height:screen.height||null, availableWidth:screen.availWidth||null, availableHeight:screen.availHeight||null, pixelRatio:window.devicePixelRatio||1, viewportWidth:innerWidth, viewportHeight:innerHeight, orientation:screen.orientation?.type||null };
    const activeWindows = [...document.querySelectorAll('.room-window.open[data-room]')].map(node=>({id:String(node.dataset.room||'').slice(0,100),title:String(node.querySelector('.room-title,.room-heading h3,.room-heading h2')?.textContent||node.dataset.room||'').trim().slice(0,100)}));
    const localRelease=document.querySelector('meta[name="curioid-release"]')?.content||document.querySelector('.site-version')?.textContent?.trim()||'unknown';
    const projects = window.CurioidProjects || null;
    const projectCount=Number(document.querySelector('meta[name="curioid-project-count"]')?.content)||projects?.ids?.length||document.querySelectorAll('.room-window[data-room]').length||null;
    const categoryCount=Number(document.querySelector('meta[name="curioid-category-count"]')?.content)||document.querySelectorAll('.category-nav [data-category]').length||null;
    const report = {
      title:'CURIOID LOCAL HEALTH & DELIVERY REPORT',
      storageInventory:window.__CURIOID_HEALTH_STORAGE_INVENTORY||null,
      automaticMaintenance:window.__CURIOID_HEALTH_MAINTENANCE||null,
      ownerActionsRemaining:[
        'Publish the deployment ZIP to the existing GitHub Pages repository; this browser page has no repository write authorization.',
        'Confirm rendering on physical Android and iOS devices and in a private-browsing profile.',
        'Confirm the operating-system download/save prompt and destination-folder permissions.',
        'Test abrupt browser-process termination and multi-hour restore/tab stability in a persistent real browser profile.',
        'Decide whether cloud sync, sign-in, analytics or remote services are wanted.'
      ],
      generatedAt:new Date().toISOString(),
      release:localRelease,
      runDurationMs:Number.isFinite(runDurationMs)?Math.round(runDurationMs):null,
      page:{ url:location.origin+location.pathname, origin:location.origin, pathname:location.pathname, title:document.title, description:document.querySelector('meta[name="description"]')?.content||null, canonical:(()=>{try{const u=new URL(document.querySelector('link[rel="canonical"]')?.href||location.href);return u.origin+u.pathname;}catch(_){return null;}})(), secureContext:isSecureContext, online:navigator.onLine, visibility:document.visibilityState, language:document.documentElement.lang||null, colorScheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':matchMedia('(prefers-color-scheme: light)').matches?'light':'no-preference', reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches, highContrast:matchMedia('(prefers-contrast: more)').matches },
      browser:{ userAgent:navigator.userAgent, userAgentData:navigator.userAgentData?{brands:navigator.userAgentData.brands||[],mobile:!!navigator.userAgentData.mobile,platform:navigator.userAgentData.platform||null}:null, platform:navigator.platform || 'not supplied', vendor:navigator.vendor || 'not supplied', language:navigator.language || 'not supplied', languages:navigator.languages || [], screen:screenInfo, hardwareConcurrency:navigator.hardwareConcurrency || null, deviceMemory:navigator.deviceMemory || null, maxTouchPoints:navigator.maxTouchPoints||0, connection:connection ? { effectiveType:connection.effectiveType||null, downlink:connection.downlink||null, rtt:connection.rtt||null, saveData:!!connection.saveData, type:connection.type||null } : null },
      publishedSite:publishedSiteSnapshot||null,
      siteInventory:{projectCount,categoryCount,operatingSystemCount:Number(document.querySelector('meta[name="curioid-os-count"]')?.content)||6,activeWindowCount:activeWindows.length,activeWindows,categoryButtons:[...document.querySelectorAll('.category-nav [data-category]')].map(node=>String(node.dataset.category||'').slice(0,80)),loadedCategories:projects?.getLoadedCategories?.()||[]},
      capabilities:{ fetch:typeof fetch==='function', webCrypto:!!crypto?.subtle, serviceWorker:!!navigator.serviceWorker, cacheStorage:!!window.caches, indexedDB:!!window.indexedDB, opfs:typeof navigator.storage?.getDirectory==='function', localStorage:(()=>{try{return !!window.localStorage;}catch(_){return false;}})(), sessionStorage:(()=>{try{return !!window.sessionStorage;}catch(_){return false;}})(), workers:typeof Worker==='function', sharedWorkers:typeof SharedWorker==='function', broadcastChannel:typeof BroadcastChannel==='function', webLocks:!!navigator.locks?.request, resizeObserver:typeof ResizeObserver==='function', intersectionObserver:typeof IntersectionObserver==='function', mutationObserver:typeof MutationObserver==='function', offscreenCanvas:typeof OffscreenCanvas==='function', compressionStream:typeof CompressionStream==='function', decompressionStream:typeof DecompressionStream==='function', fileSystemAccess:typeof showOpenFilePicker==='function', fileSavePicker:typeof showSaveFilePicker==='function', webShare:typeof navigator.share==='function', clipboard:!!navigator.clipboard?.writeText, webgpu:!!navigator.gpu, canvas:!!document.createElement('canvas').getContext('2d'), webgl:(()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch(_){return false;}})(), webAudio:!!(window.AudioContext||window.webkitAudioContext), wasm:typeof WebAssembly==='object', webCodecs:typeof VideoDecoder==='function'||typeof AudioDecoder==='function' },
      runtime:{ projectCodeLoaded:!!projects, projectCount:projects?.ids?.length || projectCount || 0, osIds:projects?.ids?.filter(id=>['dead-interface','food-alchemy','echonoise-os','umbra-os','aether-os','aura-synthesis'].includes(id)) || [], loadedCategories:projects?.getLoadedCategories?.()||[], activeWindows, supervisor:runtime, lastAssetFailure:window.__CURIOID_LAST_ASSET_LOAD_FAILURE || null },
      serviceWorker:{ supported:!!navigator.serviceWorker, controller:navigator.serviceWorker?.controller?.scriptURL || null, registration:registration ? { scope:registration.scope, active:registration.active?.scriptURL || null, waiting:registration.waiting?.scriptURL || null, installing:registration.installing?.scriptURL || null, updateViaCache:registration.updateViaCache || null } : null },
      delivery:{ csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null, baseUri:deploymentBase.href, referrerPolicy:document.querySelector('meta[name="referrer"]')?.content || null, lastAssetFailure:window.__CURIOID_LAST_ASSET_LOAD_FAILURE || null, htmlInlineHandlerCount:Array.from(document.querySelectorAll('*')).reduce((count,node)=>count+[...node.attributes].filter(attribute=>/^on/i.test(attribute.name)).length,0), externalScriptOrigins:[...document.scripts].map(node=>{try{return new URL(node.src,location.href).origin;}catch(_){return null;}}).filter(origin=>origin&&origin!==location.origin) },
      cacheStorage:{ names:cacheNames, totalCaches:cacheNames.length, inventory:cacheInventory || null },
      storage:{ estimate:estimate ? { usageBytes:estimate.usage ?? null, quotaBytes:estimate.quota ?? null, usageDetails:estimate.usageDetails || null, usageRatio:Number.isFinite(estimate.usage)&&Number.isFinite(estimate.quota)&&estimate.quota>0?rounded(estimate.usage/estimate.quota,4):null } : null, persistent:persisted ?? null },
      performance:performanceSnapshot || collectPerformanceSnapshot(),
      releaseAssets:assetMeta,
      checks:rows.map(row=>({label:String(row.label||''),ok:!!row.ok,warning:!!row.warning,detail:String(row.detail||'')})),
      loadedScriptTags:[...document.scripts].map(node=>({src:(()=>{try{const u=new URL(node.src);return u.origin+u.pathname;}catch(_){return null;}})(),integrity:node.integrity||null,async:!!node.async,defer:!!node.defer})).filter(node=>node.src),
      resourceTimings:(performanceSnapshot?.resources?.slowest||[]).map(item=>({...item})),
      projectSmoke:window.__CURIOID_LAST_HEALTH_PROJECT_SMOKE||null,
      recentErrors:diagnosticEvents.slice(-40),
      diagnosticSupport:{longTask:!!longTaskObserver,eventTiming:!!eventTimingObserver,lcp:!!lcpObserver,layoutShift:!!layoutShiftObserver,longAnimationFrame:!!longAnimationFrameObserver},
      privacy:'Generated locally on request. Contains technical environment, same-origin asset paths without query strings, timing summaries, interacted element tag/ARIA role only, storage metadata/estimates and error messages. It does not include cookies, passwords, element IDs/selectors, text, form values, localStorage contents, database records, file names/content or project content. Nothing is uploaded automatically.'
    };
    return report;
  }
  let lastReportObjectUrl = null;
  // Blob URLs are released when the document is destroyed. Keep the current
  // report URL alive for the whole page session so slow download managers can
  // resolve it after the user clicks the ready report link.
  function clearPreparedReportDownload() {
    if (lastReportObjectUrl) { try { URL.revokeObjectURL(lastReportObjectUrl); } catch (_) {} lastReportObjectUrl = null; }
    if (healthDownloadButton instanceof HTMLAnchorElement) {
      healthDownloadButton.removeAttribute('href');
      healthDownloadButton.removeAttribute('download');
      healthDownloadButton.setAttribute('aria-disabled','true');
      healthDownloadButton.setAttribute('tabindex','-1');
      healthDownloadButton.setAttribute('aria-label','Run diagnostics before downloading the health report');
    }
  }
  function reportText(report) {
    const lines = [
      'CURIOID HEALTH CHECK REPORT', '===========================',
      `Generated: ${report.generatedAt}`, `Release: ${report.release}`,
      `Page: ${report.page.url}`, '', 'SUMMARY', '-------',
      report.checks.map(row => `${row.ok ? 'PASS' : row.warning ? 'WARN' : 'FAIL'}  ${row.label}\n      ${row.detail}`).join('\n'),
      '', 'FULL TECHNICAL DETAILS', '----------------------', safeJson(report),
      '', 'PRIVACY', report.privacy
    ].join('\n');
    return lines;
  }
  function prepareReportDownload() {
    if (!lastHealthReport || !(healthDownloadButton instanceof HTMLAnchorElement)) return false;
    try {
      const filename = `CURIOID-Health-Report-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
      const blob = new Blob(['\ufeff',reportText(lastHealthReport)], {type:'text/plain;charset=utf-8'});
      const objectUrl = URL.createObjectURL(blob);
      if (lastReportObjectUrl) { try { URL.revokeObjectURL(lastReportObjectUrl); } catch (_) {} }
      lastReportObjectUrl = objectUrl;
      healthDownloadButton.href = objectUrl;
      healthDownloadButton.download = filename;
      healthDownloadButton.setAttribute('aria-disabled','false');
      healthDownloadButton.removeAttribute('tabindex');
      healthDownloadButton.setAttribute('aria-label',`Download ${filename}`);
      return true;
    } catch (error) {
      if (healthStatus) healthStatus.textContent = `Could not prepare the report download: ${String(error?.message||error).slice(0,160)}.`;
      clearPreparedReportDownload();
      return false;
    }
  }
  async function runCurioidHealthCheck(runOptions = {}) {
    const diagnosticsStartedAt=performance.now();
    if (healthRunButton) { healthRunButton.disabled = true; healthRunButton.textContent = 'Checking…'; }
    if (healthRepairButton) healthRepairButton.disabled = true;
    clearPreparedReportDownload();
    paintHealthResults([], 'Running local checks. Temporary probes are removed after use.', 'CHECKING');
    const rows = activeDiagnosticRows = [], assetMeta = [];
    const add = (label, result) => {
      const row = { label, ...result };
      rows.push(row);
      if (healthResults) {
        const item = document.createElement('li'); item.dataset.state = row.ok ? 'ok' : row.warning ? 'warning' : 'error';
        const title = document.createElement('b'); title.textContent = row.label;
        const detail = document.createElement('span'); detail.textContent = row.detail;
        item.append(title, detail); healthResults.appendChild(item);
      }
      if (healthStatus) healthStatus.textContent = `Running local checks · ${rows.length} completed.`;
    };
    let projectSmoke = null;
    const maintenance = window.__CURIOID_HEALTH_MAINTENANCE = { startedAt:new Date().toISOString(), persistentStorageRequested:Boolean(runOptions.persistencePromise), projectStylesRetryAttempted:false, projectStylesRetrySucceeded:null, serviceWorkerUpdatePreflight:null, temporaryProbeCleanup:null, destructiveActions:0 };
    const connectionForSmoke = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    if (window.CurioidSiteDiagnostics?.loadAllProjectCategories && navigator.onLine && !connectionForSmoke?.saveData && !['slow-2g','2g'].includes(String(connectionForSmoke?.effectiveType||'').toLowerCase())) {
      try {
        projectSmoke = await healthTimeout(window.CurioidSiteDiagnostics.loadAllProjectCategories(), 90000, 'all-category runtime smoke test');
      } catch (firstError) {
        const styleStatus = window.CurioidSiteDiagnostics.getProjectStyleStatus?.();
        if (styleStatus?.failed && window.CurioidSiteDiagnostics.retryProjectStyles) {
          try {
            const retried = await healthTimeout(window.CurioidSiteDiagnostics.retryProjectStyles(), 15000, 'stylesheet safe retry');
            maintenance.projectStylesRetryAttempted = true; maintenance.projectStylesRetrySucceeded = Boolean(retried);
            if (retried) projectSmoke = await healthTimeout(window.CurioidSiteDiagnostics.loadAllProjectCategories(), 90000, 'category runtime retry');
            else projectSmoke = {error:String(firstError?.message||firstError).slice(0,260),retryFailed:true};
          } catch (retryError) { projectSmoke = {error:String(retryError?.message||retryError).slice(0,260),retryFailed:true}; }
        } else projectSmoke = {error:String(firstError?.message||firstError).slice(0,260)};
      }
    } else if (window.CurioidSiteDiagnostics?.loadAllProjectCategories) {
      projectSmoke = {skipped:true,reason:!navigator.onLine?'offline':connectionForSmoke?.saveData?'Save-Data is enabled':'connection is reported as slow-2g/2g'};
    }
    if (projectSmoke?.results) {
      let failedCategories = projectSmoke.results.filter(item=>!item.ok);
      if (failedCategories.length && window.CurioidSiteDiagnostics?.loadAllProjectCategories) {
        // One controlled retry for transient CDN/cache/network failures. Already-loaded
        // categories are skipped by the production loader; no project windows or data
        // are touched. This also helps the report separate transient from persistent faults.
        maintenance.categoryRetryAttempted = true;
        maintenance.categoryRetryFailuresFirstPass = failedCategories.map(item=>({category:item.category,error:String(item.error||'not registered').slice(0,220)}));
        try {
          const retry = await healthTimeout(window.CurioidSiteDiagnostics.loadAllProjectCategories(), 90000, 'failed category retry');
          const retryByCategory = new Map((retry.results||[]).map(item=>[item.category,item]));
          projectSmoke = {...retry, results:projectSmoke.results.map(first=>{
            const second=retryByCategory.get(first.category);
            if(first.ok || !second) return first;
            return second.ok ? {...second,recoveredOnRetry:true,firstAttemptError:String(first.error||'first attempt failed').slice(0,220)}
              : {...second,recoveredOnRetry:false,firstAttemptError:String(first.error||'first attempt failed').slice(0,220),retryError:String(second.error||'retry failed').slice(0,220)};
          })};
        } catch(retryError) { maintenance.categoryRetryError=String(retryError?.message||retryError).slice(0,220); }
        failedCategories = projectSmoke.results.filter(item=>!item.ok);
        maintenance.categoryRetryRecovered = projectSmoke.results.filter(item=>item.recoveredOnRetry).map(item=>item.category);
        maintenance.categoryRetryFailures = failedCategories.map(item=>({category:item.category,error:String(item.error||'not registered').slice(0,220)}));
      } else {
        maintenance.categoryRetryAttempted = false;
        maintenance.categoryRetryRecovered = [];
        maintenance.categoryRetryFailures = [];
      }
      const registryOk = projectSmoke.registry?.ok !== false;
      add('All seven project category runtime smoke tests',failedCategories.length===0&&registryOk
        ? {ok:true,detail:`All ${projectSmoke.results.length} category bundles were loaded and executed through the production SRI loader; ${projectSmoke.projectCount} project IDs registered; registry audit ${registryOk?'passed':'failed'}. No project window was mounted and no user data was written.`}
        : {ok:false,detail:`${failedCategories.length}/${projectSmoke.results.length} category bundle(s) failed: ${failedCategories.map(item=>`${item.category}: ${item.error||'registration missing'}`).join('; ')||'registry audit failed'}.`});
    } else add('All seven project category runtime smoke tests',projectSmoke?.skipped
      ? {ok:false,warning:true,detail:`Skipped to respect the browser's ${projectSmoke.reason}; use a normal connection and rerun for full category execution tests.`}
      : {ok:false,warning:true,detail:projectSmoke?.error||'The shared project runtime diagnostics API is unavailable in this release.'});
    window.__CURIOID_LAST_HEALTH_PROJECT_SMOKE = projectSmoke;
    maintenance.categorySmokeResults = projectSmoke?.results?.map(item => ({category:item.category,ok:Boolean(item.ok),durationMs:item.durationMs||null,error:item.error||null})) || null;
    maintenance.offlineAssetPrecache = projectSmoke?.precache || null;
    const projects = window.CurioidProjects;
    // Inspect every registered application template without mounting or activating it.
    // This includes every generated button, option, input, link and binder contract.
    try {
      const uiCensus = projects?.inspectProjectInterfaces?.();
      window.__CURIOID_HEALTH_UI_CENSUS = uiCensus || null;
      if (!uiCensus) throw new Error('The project runtime does not expose the read-only interface inspector.');
      const issues = uiCensus.issues || {};
      const hardIssues = Number(issues.renderFailures||0)+Number(issues.inlineHandlers||0)+Number(issues.javascriptUrls||0)+Number(issues.unsafeBlankLinks||0)+Number(issues.unsandboxedFrames||0)+Number(issues.sameOriginRelaxationFrames||0);
      const softIssues = Number(issues.unlabeled||0)+Number(uiCensus.totals?.duplicateIds||0)+Number(uiCensus.totals?.duplicateOptionValues||0)+Number(uiCensus.totals?.emptyOptionLabels||0)+Number(uiCensus.totals?.formButtonsWithoutType||0)+Number(issues.brokenAriaReferences||0)+Number(issues.crossProjectDuplicateIds||0);
      const interactionHistory=window.CurioidInteractionDiagnostics?.snapshot?.()||[];
      const interactionProjects=interactionHistory.filter(item=>item.totalEvents>0);
      const interactionEvents=interactionHistory.reduce((sum,item)=>sum+item.totalEvents,0);
      const interactionSummary=interactionProjects.length
        ?` Privacy-safe real-interaction observer has seen ${interactionEvents} trusted event(s) across ${interactionProjects.length} project(s): ${interactionProjects.map(item=>`${item.projectId} (${item.totalEvents})`).slice(0,12).join(', ')}. It records event types and element IDs only - never text, keys or field values.`
        :' No real project-control interaction has been observed in this tab yet; opening and using projects will populate privacy-safe counters.';
      add('All project buttons, options & interaction wiring - read-only audit',hardIssues===0&&uiCensus.checked===uiCensus.projectCount
        ?{ok:true,warning:softIssues>0,detail:`${uiCensus.detail} ${softIssues?`${softIssues} accessibility/consistency item(s) are candidates for review.`:'No structural UI/security issues were detected.'} Event handlers are inspected as source contracts; destructive controls are intentionally never clicked. Dynamically generated controls are separately reported as source hints and should be verified when their project is opened.${interactionSummary}`}
        :{ok:false,detail:`${uiCensus.detail} ${hardIssues} unsafe/render issue(s) detected; inspect the per-project census stored in window.__CURIOID_HEALTH_UI_CENSUS.${interactionSummary}`});
    } catch(error) {
      window.__CURIOID_HEALTH_UI_CENSUS = null;
      add('All project buttons, options & interaction wiring - read-only audit',{ok:false,warning:true,detail:String(error?.message||error).slice(0,240)});
    }
    const roomCount = document.querySelectorAll('.room-window[data-room]').length;
    const osIds = ['dead-interface','food-alchemy','echonoise-os','umbra-os','aether-os','aura-synthesis'];
    const osBootReady = osIds.every(id => projects?.ids?.includes(id));
    add('Secure context', isSecureContext ? {ok:true,detail:'The page is running in a secure context.'} : {ok:false,detail:'HTTPS is required for service workers and several storage APIs.'});
    add('Page and catalogue', roomCount ? {ok:true,detail:`${roomCount} project room(s) are present in the page.`} : {ok:false,detail:'No project rooms were found in the page.'});
    add('Browser tab title',document.title==='CURIOID'?{ok:true,detail:'The active browser tab title is exactly CURIOID.'}:{ok:false,detail:`Expected the exact tab title CURIOID; received ${JSON.stringify(document.title)}.`});
    const fullscreenStyle=document.getElementById('curioid-fullscreen-app-layout');
    const fullscreenLayer=document.getElementById('curioid-app-layer');
    const fullscreenRulesReady=Boolean(fullscreenStyle&&fullscreenStyle.textContent.includes('#curioid-app-layer:not([hidden])')&&fullscreenStyle.textContent.includes('position:fixed')&&fullscreenStyle.textContent.includes('grid-template-rows'));
    add('Fullscreen app workspace',fullscreenRulesReady&&fullscreenLayer?.isConnected?{ok:true,detail:'The viewport-level app layer and fixed fullscreen CSS are present. Open project windows can be moved out of catalogue containment and centered in the viewport.'}:{ok:false,detail:`Fullscreen workspace incomplete: style ${fullscreenRulesReady?'present':'missing or incomplete'}, app layer ${fullscreenLayer?.isConnected?'present':'not initialized'}. Reload the current release if runtime initialization did not complete.`});
    const zoomFitSupported=Boolean(window.CSS?.supports?.('zoom','1'));
    add('Adaptive app fitting capability',zoomFitSupported?{ok:true,detail:'CSS zoom is supported. The shared runtime can fit dense app roots to the available workspace and preserve scrolling for content that remains taller than the viewport.'}:{ok:false,warning:true,detail:'This browser does not expose CSS zoom. Fullscreen layout remains available, but automatic whole-app scaling is limited to the app’s responsive layout and internal scrolling.'});
    add('Project runtime state', projects ? {ok:true,detail:`Project code initialized with ${projects.ids?.length||0} catalogue ID(s).`} : {ok:false,warning:true,detail:`Project code is not initialized in this tab. ${window.__CURIOID_LAST_ASSET_LOAD_FAILURE ? 'A previous runtime asset load failure is recorded below.' : 'This is normal until a project is opened; asset delivery is tested independently below.'}`});
    const siteRuntimeTag=[...document.scripts].find(node=>{try{return new URL(node.src).pathname.endsWith('/site-runtime-current.js');}catch(_){return false;}});
    const siteRuntimePreload=[...document.querySelectorAll('link[rel="preload"][as="script"]')].find(node=>{try{return new URL(node.href).pathname.endsWith('/site-runtime-current.js');}catch(_){return false;}});
    let siteRuntimeSource='',siteRuntimeBytes=null,siteRuntimeDigest='',siteRuntimeHash='';
    try {
      const runtimeUrl=siteRuntimeTag?.src||new URL('site-runtime-current.js',deploymentBase).href;
      const response=await healthTimeout(fetch(runtimeUrl,{cache:'no-store',credentials:'same-origin'}),8000,'Site runtime source check');
      if(response.ok){siteRuntimeBytes=await response.arrayBuffer();siteRuntimeSource=new TextDecoder().decode(siteRuntimeBytes);
        if(window.crypto?.subtle?.digest){
          const sha384=await crypto.subtle.digest('SHA-384',siteRuntimeBytes);
          siteRuntimeDigest='sha384-'+btoa(String.fromCharCode(...new Uint8Array(sha384)));
          const sha256=await crypto.subtle.digest('SHA-256',siteRuntimeBytes);
          siteRuntimeHash=[...new Uint8Array(sha256)].map(value=>value.toString(16).padStart(2,'0')).join('');
        }
      }
    }catch(_){}
    const siteRuntimeUrl=(()=>{try{return new URL(siteRuntimeTag?.src||'site-runtime-current.js',deploymentBase);}catch(_){return null;}})();
    const declaredRuntimeHash=siteRuntimeUrl?.searchParams.get('v')?.replace(/^sha256-/,'')||'';
    const sriValue=siteRuntimeTag?.integrity||'';
    const siteRuntimeSriConfigured=Boolean(siteRuntimeTag&&/^sha384-[A-Za-z0-9+/]+=*$/.test(sriValue)&&sriValue===siteRuntimeDigest&&siteRuntimeTag.crossOrigin==='anonymous'&&siteRuntimePreload&&siteRuntimePreload.integrity===sriValue&&siteRuntimePreload.crossOrigin==='anonymous'&&declaredRuntimeHash===siteRuntimeHash);
    const runtimeAssetDeclaration=siteRuntimeSource.match(/file:\s*["']projects-core\.js["'][^}]*integrity:\s*["'](sha384-[^"']+)["']/);
    const runtimeCoreHashDeclaration = siteRuntimeSource.match(/file:\s*["']projects-core\.js["'][^}]*hash:\s*["']([a-f0-9]{64})["']/i)?.[1] || '';
    const sriConfigured=siteRuntimeSriConfigured&&siteRuntimeSource.includes('element.integrity = integrity')&&siteRuntimeSource.includes('element.crossOrigin = "anonymous"')&&Boolean(runtimeCoreHashDeclaration&&/^[a-f0-9]{64}$/i.test(runtimeCoreHashDeclaration)&&runtimeAssetDeclaration?.[1]);
    add('Site and project runtime SRI policy',sriConfigured?{ok:true,detail:'The published runtime bytes match both their SHA-384 script integrity and SHA-256 cache-busting URL; the project loader also applies release SRI and anonymous CORS.'}:{ok:false,detail:`The site runtime integrity contract is missing or mismatched. Tag SHA-384: ${sriValue||'missing'}; downloaded SHA-384: ${siteRuntimeDigest||'unavailable'}; URL SHA-256: ${declaredRuntimeHash||'missing'}; actual SHA-256: ${siteRuntimeHash||'unavailable'}.`});
    add('OS boot contracts', projects ? (osBootReady ? {ok:true,detail:'All six OS project IDs are catalogued; their category modules load on demand.'} : {ok:false,detail:`One or more expected OS modules are missing. Found: ${(projects.ids||[]).filter(id=>osIds.includes(id)).join(', ')||'none'}.`}) : {ok:false,warning:true,detail:'Not evaluated because the shared project core has not initialized in this tab.'});
    let registryAudit = null;
    try { registryAudit = projects?.inspectRegistry?.() || null; } catch (error) { registryAudit = { ok:false, detail:String(error?.message||error).slice(0,220) }; }
    add('Catalogue and module registry integrity', registryAudit ? (registryAudit.ok ? {ok:true,detail:`${registryAudit.moduleIds} unique module IDs across ${registryAudit.categories} categories; ${registryAudit.roomCount} catalogue rooms match the module map and native Sandbox OS; ${registryAudit.loadedCategories.length} category bundle(s) registered this session.`} : {ok:false,detail:`Registry mismatch. Duplicate module IDs: ${registryAudit.duplicateIds?.join(', ')||'none'}; unmapped IDs: ${registryAudit.unmappedIds?.join(', ')||'none'}; missing rooms: ${registryAudit.missingRooms?.join(', ')||'none'}; unexpected rooms: ${registryAudit.unexpectedRooms?.join(', ')||'none'}; invalid loaded modules: ${registryAudit.loadedMissingModules?.join(', ')||'none'}.`}) : {ok:false,warning:true,detail:'The current runtime does not expose its read-only registry audit.'});
    const restoreJournalKey = 'curioid-system-restore-journal-v1';
    let restoreJournalStatus = {ok:true,detail:'No interrupted system-restore recovery marker is present.'};
    try {
      const raw = window.localStorage.getItem(restoreJournalKey);
      if (raw) {
        const journal = JSON.parse(raw);
        const valid = journal?.format === 'curioid-system-restore-journal' && journal.version === 1 && ['commit-in-progress','commit-verified','rollback-verified','rollback-failed'].includes(journal.phase) && typeof journal.safetyBackupId === 'string' && Boolean(journal.safetyBackupId);
        restoreJournalStatus = valid ? {ok:false,warning:true,detail:`A system-restore marker is present (${journal.phase}). Open System Center → Backup & recovery to verify the pre-restore safety copy. Health Check never restores or clears it automatically.`} : {ok:false,warning:true,detail:'A system-restore marker exists but is unreadable or has an unsupported structure. Preserve Browser Vault and do not clear site data.'};
      }
    } catch (_) { restoreJournalStatus = {ok:false,warning:true,detail:'Restore recovery status could not be read. Preserve Browser Vault and do not clear site data.'}; }
    add('System restore recovery status', restoreJournalStatus);
    add('Cross-tab backup coordination', navigator.locks?.request ? {ok:true,detail:'The Web Locks API is available. Current-version CURIOID tabs serialize full-system backup and restore operations.'} : {ok:false,warning:true,detail:'This browser does not expose Web Locks. Close other CURIOID tabs before exporting or restoring a full-system backup.'});
    const runtime = window.CurioidRuntimeSupervisor?.getStatus?.();
    add('Application lifecycle', runtime ? (runtime.cleanupFailures ? {ok:false,detail:`${runtime.activeScopes} active scope(s); ${runtime.cleanupFailures} cleanup issue(s) recorded this session.`} : {ok:true,detail:`${runtime.activeScopes} active scope(s), ${runtime.activeResources} tracked resource(s), no cleanup errors recorded.`}) : {ok:false,warning:true,detail:'Runtime Supervisor is not available yet.'});
    let workerUpdatePreflight = null;
    try {
      if (window.CurioidSiteDiagnostics?.prepareServiceWorkerUpdate) {
        workerUpdatePreflight = await healthTimeout(window.CurioidSiteDiagnostics.prepareServiceWorkerUpdate(), 20000, 'safe service-worker update preflight');
      }
    } catch (error) { workerUpdatePreflight = {error:String(error?.message||error).slice(0,220)}; }
    maintenance.serviceWorkerUpdatePreflight = workerUpdatePreflight ? {error:workerUpdatePreflight.error||null,waiting:Boolean(workerUpdatePreflight.waiting),activated:Boolean(workerUpdatePreflight.activated),controller:Boolean(workerUpdatePreflight.controller)} : null;
    const registration = await (navigator.serviceWorker?.getRegistration?.(deploymentBase.pathname).catch(()=>null) || Promise.resolve(null));
    const cacheNames = await (window.caches?.keys?.().catch(()=>[]) || Promise.resolve([]));
    const cacheInventory = await collectCacheInventory(cacheNames);
    const hasCache = cacheNames.some(name=>name.includes('curioid-shell'));
    const expectedCacheName = `curioid-shell:${encodeURIComponent(deploymentBase.pathname)}:${EXPECTED_RELEASE}`;
    const hasCurrentCache = cacheNames.includes(expectedCacheName);
    const isCurrentWorkerUrl = raw => { try { const url=raw?new URL(raw):null;return Boolean(url&&url.pathname.endsWith('/service-worker-current.js')&&url.searchParams.get('release')===EXPECTED_RELEASE); } catch(_) { return false; } };
    const currentWorkerActive = isCurrentWorkerUrl(registration?.active?.scriptURL);
    const currentWorkerControlsPage = isCurrentWorkerUrl(navigator.serviceWorker?.controller?.scriptURL);
    const workerScopeMatches = (()=>{try{return Boolean(registration&&new URL(registration.scope).origin===deploymentBase.origin&&new URL(registration.scope).pathname===deploymentBase.pathname);}catch(_){return false;}})();
    maintenance.currentWorkerActive = currentWorkerActive;
    maintenance.currentWorkerControlsPage = currentWorkerControlsPage;
    maintenance.workerScopeMatches = workerScopeMatches;
    add('Service-worker registration', !navigator.serviceWorker ? {ok:false,warning:true,detail:'Service workers are unavailable in this browser.'}
      : currentWorkerActive && currentWorkerControlsPage && workerScopeMatches
        ? {ok:true,detail:`Current ${EXPECTED_RELEASE} worker is active and controls this page: ${registration.active.scriptURL}; exact scope ${registration.scope}; waiting update: ${Boolean(registration.waiting)}.`}
        : currentWorkerActive && !currentWorkerControlsPage
          ? {ok:false,warning:true,detail:`The ${EXPECTED_RELEASE} worker is active, but this page is still controlled by ${navigator.serviceWorker.controller?.scriptURL||'no service worker'}. Reload this tab after any open work is saved so the page and worker use the same release.`}
          : registration?.active
            ? {ok:false,warning:true,detail:`An older or incorrectly scoped worker is active: ${registration.active.scriptURL}; controller: ${navigator.serviceWorker.controller?.scriptURL||'none'}; scope matches: ${workerScopeMatches}. Use Refresh service-worker registration to replace it with ${EXPECTED_RELEASE}. Saved data will not be cleared.`}
            : {ok:false,warning:true,detail:'No active CURIOID service worker is registered for this exact deployment scope.'});
    add('Automatic service-worker update preflight', workerUpdatePreflight?.error
      ? {ok:false,warning:true,detail:`Could not preinstall the current worker safely: ${workerUpdatePreflight.error}`}
      : workerUpdatePreflight
        ? {ok:true,detail:`Update check completed; waiting=${Boolean(workerUpdatePreflight.waiting)}; activated=${Boolean(workerUpdatePreflight.activated)}; no update was force-activated during diagnostics. ${workerUpdatePreflight.waiting?'Use the separate Refresh control after reviewing the report to activate it safely.':'No new worker is waiting.'}`}
        : {ok:false,warning:true,detail:'Automatic service-worker update preflight is not exposed in this runtime.'});
    add('Offline cache presence', hasCurrentCache ? {ok:true,detail:`Current ${EXPECTED_RELEASE} shell cache is present: ${expectedCacheName}.`} : {ok:false,detail:`The current ${EXPECTED_RELEASE} shell cache is missing. Found: ${cacheNames.filter(name=>name.includes('curioid-shell')).join(', ')||'no CURIOID shell cache'}. The current worker may have failed installation or an older controller is still active.`});
    add('Offline cache inventory',cacheInventory.available?{ok:true,detail:`${cacheInventory.totalCaches} browser cache(s), ${cacheInventory.totalEntries} cached request(s) inventoried. Names and counts only; no cached content was opened or changed.`}:{ok:false,warning:true,detail:'Cache Storage inventory is unavailable.'});
    let releaseManifest = null;
    try {
      releaseManifest = await fetchReleaseManifest();
      maintenance.releaseManifest = {valid:true,release:releaseManifest.release,assetCount:releaseManifest.count,manifestUrl:deploymentBase.origin+deploymentBase.pathname+'service-worker-current.js'};
      const healthHashFromManifest = releaseManifest.manifest['health-check.js'];
      add('Published deployment manifest', healthHashFromManifest === expectedHealthHash
        ? {ok:true,detail:`${releaseManifest.release} worker manifest is valid; ${releaseManifest.count} assets have 64-character SHA-256 declarations; Health Check module hash matches its loader.`}
        : {ok:false,detail:`The worker manifest has ${releaseManifest.count} asset(s), but its Health Check hash ${healthHashFromManifest||'is missing'} does not match the page loader ${expectedHealthHash||'declaration missing'}.`});
    } catch (error) {
      maintenance.releaseManifest = {valid:false,error:String(error?.message||error).slice(0,260)};
      add('Published deployment manifest',{ok:false,detail:String(error?.message||error).slice(0,260)});
    }
    const shellCacheAudit = hasCurrentCache && releaseManifest ? await auditCurrentShellCache(expectedCacheName,releaseManifest.manifest) : null;
    maintenance.offlineShellCacheAudit = shellCacheAudit ? {ok:shellCacheAudit.ok,verified:shellCacheAudit.verified||[],missing:shellCacheAudit.missing||[],criticalOfflineAssets:shellCacheAudit.criticalOfflineAssets??null,criticalOfflineExpected:shellCacheAudit.criticalOfflineExpected??null} : {available:false};
    add('Offline shell cache completeness',shellCacheAudit ? (shellCacheAudit.ok?{ok:true,detail:shellCacheAudit.detail}:{ok:false,detail:shellCacheAudit.detail}) : {ok:false,warning:true,detail:'Shell cache verification is unavailable until the current cache and release manifest are present.'});
    const precacheResult = projectSmoke?.precache || null;
    add('Critical project asset pre-cache',precacheResult?.ok
      ? {ok:true,detail:`The current service worker verified and cached ${precacheResult.cachedCount ?? (precacheResult.results||[]).filter(item=>item.ok).length} critical project assets. ${precacheResult.controlled ? 'This page is now controlled by the current worker.' : 'The worker cache was populated without taking control of this page.'}`}
      : precacheResult?.available
        ? {ok:false,warning:true,detail:`The current worker could not fully pre-cache the project assets: ${(precacheResult.results||[]).filter(item=>!item.ok).map(item=>`${item.file}: ${item.error}`).join('; ') || precacheResult.reason || 'no successful response was returned'}.`}
        : {ok:false,warning:true,detail:[
            precacheResult?.reason || 'No matching current-release worker accepted the pre-cache command. The browser can still load apps online, but offline readiness requires refreshing the service worker.',
            `Active worker: ${precacheResult?.active||'none'}; waiting worker: ${precacheResult?.waiting||'none'}; installing worker: ${precacheResult?.installing||'none'}.`
          ].join(' ')});
    const releaseAssets = releaseManifest ? Object.entries(releaseManifest.manifest)
      .filter(([file]) => file !== 'index.html')
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([file,hash]) => ({label:labelForAsset(file),file,hash,kind:expectedKindForAsset(file)})) : [];
    const auditConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const auditConnectionType = String(auditConnection?.effectiveType || '').toLowerCase();
    const auditMemoryGb = Number(navigator.deviceMemory) || 0;
    const auditCpuCount = Number(navigator.hardwareConcurrency) || 0;
    const releaseAuditConcurrency = auditMemoryGb > 0 && auditMemoryGb <= 2 ? 1
      : auditConnection?.saveData || ['slow-2g','2g'].includes(auditConnectionType) ? 1
      : (auditMemoryGb > 0 && auditMemoryGb <= 4) || (auditCpuCount > 0 && auditCpuCount <= 4) ? 2 : 3;
    const releaseResults = await mapWithConcurrency(releaseAssets, releaseAuditConcurrency, async asset => ({
      ...asset, result:await probeReleaseAsset(asset.file, asset.hash, asset.kind)
    }));
    for (const {label,file,result} of releaseResults) {
      assetMeta.push(result.meta || {file,url:new URL(file,deploymentBase).href,error:result.detail});
      add(label, result);
    }
    maintenance.releaseAssetAudit = {checked:releaseResults.length,failed:releaseResults.filter(item=>!item.result.ok).map(item=>({file:item.file,detail:String(item.result.detail||'').slice(0,220)})),edgeTransformed:releaseResults.filter(item=>item.result.warning&&item.result.meta&&!item.result.meta.hashMatches&&item.result.ok).map(item=>item.file)};
    const sinkTotals={innerHTML:0,outerHTML:0,insertAdjacentHTML:0,documentWrite:0,dynamicEval:0,srcdoc:0,inlineScriptBlocks:0,inlineEventHandlers:0,javascriptUrls:0};
    for(const item of assetMeta) if(item.securityScan) for(const key of Object.keys(sinkTotals)) sinkTotals[key]+=Number(item.securityScan[key])||0;
    const sinkTotal=Object.values(sinkTotals).reduce((sum,value)=>sum+value,0);
    maintenance.staticSecuritySinkInventory = sinkTotals;
    add('Static HTML/JavaScript security-sink inventory',sinkTotal===0
      ? {ok:true,detail:'No common dynamic HTML/script sink patterns, inline event handlers, or javascript: URLs were found in the HTML and JavaScript assets scanned.'}
      : {ok:false,warning:true,detail:`Static inventory across external JS and inline HTML scripts/attributes (not a vulnerability verdict): ${JSON.stringify(sinkTotals)}. Constant/template-controlled and sanitized uses may be safe; source review is needed before changing any sink.`});
    // Verify standalone studio bootstrap CSP hashes and each external app script's SRI.
    try {
      async function auditStandalone(path, bootstrapId, appFiles) {
        const response=await healthTimeout(fetch(new URL(path,deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),10000,`${path} CSP audit`);
        if(!response.ok)throw new Error(`${path} returned HTTP ${response.status}`);
        const source=await response.text(),doc=new DOMParser().parseFromString(source,'text/html');
        const policy=doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'';
        const scriptSrc=policy.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1]||'';
        const missing=[],checked=[];
        if(!scriptSrc.includes("'strict-dynamic'"))missing.push('script-src lacks strict-dynamic');
        const executableTypes=new Set(['','text/javascript','application/javascript','application/ecmascript','text/ecmascript']);
        for(const node of [...doc.querySelectorAll('script:not([src])')]){
          const type=(node.getAttribute('type')||'').trim().toLowerCase();
          if(!executableTypes.has(type)||!(node.textContent||'').trim())continue;
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(node.textContent||''));
          const hash=`'sha256-${btoa(Array.from(new Uint8Array(digest),byte=>String.fromCharCode(byte)).join(''))}'`;
          if(!scriptSrc.includes(hash))missing.push(`${node.id||'inline script'}: CSP hash missing`);
          else checked.push(node.id||'inline script');
        }
        const bootstrap=doc.getElementById(bootstrapId);
        if(!bootstrap)missing.push(`${bootstrapId}: bootstrap missing`);
        else if(!/script\.integrity\s*=\s*integrity/.test(bootstrap.textContent||''))missing.push(`${bootstrapId}: external script SRI is not assigned`);
        const appResults=[];
        for(const file of appFiles){
          const appResponse=await healthTimeout(fetch(new URL(file,deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),10000,`${file} SRI audit`);
          if(!appResponse.ok){missing.push(`${file}: HTTP ${appResponse.status}`);continue;}
          const bytes=await appResponse.arrayBuffer(),digest=await crypto.subtle.digest('SHA-384',bytes);
          const sri=`sha384-${btoa(Array.from(new Uint8Array(digest),byte=>String.fromCharCode(byte)).join(''))}`;
          if(!(bootstrap?.textContent||'').includes(sri))missing.push(`${file}: page bootstrap SRI does not match downloaded bytes`);
          else appResults.push(`${file} SRI matched`);
        }
        return {path,missing,checked,appResults};
      }
      const standalone=await Promise.all([
        auditStandalone('music-audio-apps.html','curioid-music-audio-bootstrap',['dark-looper-app.js']),
        auditStandalone('applications-tools-apps.html','curioid-applications-tools-bootstrap',['vanta-deck-app.js','glitchyard-app.js'])
      ]);
      const missing=standalone.flatMap(item=>item.missing.map(issue=>`${item.path} / ${issue}`));
      const verified=standalone.flatMap(item=>[...item.checked,...item.appResults]);
      add('Standalone studio CSP and external SRI boot contracts',missing.length
        ?{ok:false,detail:missing.join('; ')}
        :{ok:true,detail:`Both standalone pages authorize their exact inline launchers with CSP hashes and strict-dynamic. All ${verified.filter(item=>item.endsWith('SRI matched')).length} external studio payloads match their declared SHA-384 integrity; no inert script-text injection remains.`});
    } catch(error) { add('Standalone studio CSP and external SRI boot contracts',{ok:false,detail:String(error?.message||error).slice(0,240)}); }
    // Audit inline executable script hashes on the other separately published HTML
    // documents too. JSON-LD is data, not executable JavaScript, and is excluded.
    try {
      const inlinePolicyResults=await Promise.all(['curioids.html','chroma-loom.html'].map(async file=>{
        const response=await healthTimeout(fetch(new URL(file,deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),10000,`${file} inline CSP audit`);
        if(!response.ok)throw new Error(`${file} returned HTTP ${response.status}`);
        const html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html'),policy=doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'';
        const scriptSrc=policy.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1]||'',bad=[];let checked=0;
        if(!scriptSrc||scriptSrc.includes("'unsafe-inline'")||scriptSrc.includes("'unsafe-eval'"))bad.push('strict script-src policy missing or weakened');
        for(const script of [...doc.querySelectorAll('script:not([src])')]){
          const type=(script.getAttribute('type')||'').trim().toLowerCase();
          if(['application/ld+json','application/json','text/plain'].includes(type)||!(script.textContent||'').trim())continue;
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(script.textContent||''));
          const hash=`'sha256-${btoa(Array.from(new Uint8Array(digest),byte=>String.fromCharCode(byte)).join(''))}'`;
          checked++;if(!scriptSrc.includes(hash))bad.push(`${script.id||'inline script'} CSP hash mismatch`);
        }
        return {file,bad,checked};
      }));
      const failures=inlinePolicyResults.flatMap(result=>result.bad.map(issue=>`${result.file}: ${issue}`));
      add('Published HTML inline-script CSP hashes',failures.length?{ok:false,detail:failures.join('; ')}:{ok:true,detail:inlinePolicyResults.map(result=>`${result.file}: ${result.checked} executable inline script(s) matched exact CSP hashes`).join('; ')+'. No unsafe-inline or unsafe-eval script exception is used.'});
    } catch(error) { add('Published HTML inline-script CSP hashes',{ok:false,detail:String(error?.message||error).slice(0,240)}); }
    // A meta CSP cannot set frame-ancestors, so each published page has a small
    // same-origin-aware guard. This verifies its presence and exact script hash.
    try {
      const guardedPages=['index.html','curioids.html','chroma-loom.html','music-audio-apps.html','applications-tools-apps.html'];
      const guardResults=await Promise.all(guardedPages.map(async file=>{
        const response=await healthTimeout(fetch(new URL(file,deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),10000,`${file} frame guard audit`);
        if(!response.ok)throw new Error(`${file} returned HTTP ${response.status}`);
        const doc=new DOMParser().parseFromString(await response.text(),'text/html');
        const guard=doc.getElementById('curioid-frame-guard');
        const policy=doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'';
        const scriptSrc=policy.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1]||'';
        if(!guard) return {file,ok:false,reason:'frame guard missing'};
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(guard.textContent||''));
        const encoded=btoa(Array.from(new Uint8Array(digest),byte=>String.fromCharCode(byte)).join(''));
        const hash=`'sha256-${encoded}'`;
        const source=guard.textContent||'';
        const sourceSafe=source.includes('window.top.location.origin')&&source.includes('stopImmediatePropagation')&&source.includes('document.body.inert = true')&&source.includes('Open CURIOID directly');
        return {file,ok:scriptSrc.includes(hash)&&sourceSafe,reason:!scriptSrc.includes(hash)?'CSP hash mismatch':!sourceSafe?'guard behaviour contract incomplete':'guard + CSP hash verified'};
      }));
      const failures=guardResults.filter(result=>!result.ok);
      add('Cross-origin framing and clickjacking guard',failures.length
        ?{ok:false,detail:failures.map(result=>`${result.file}: ${result.reason}`).join('; ')}
        :{ok:true,detail:`All ${guardResults.length} published HTML pages contain the same-origin-aware anti-framing guard, block framed-page interaction, and authorize its exact inline bytes with CSP SHA-256 hashes. CURIOID's own same-origin frames remain supported.`});
    } catch(error) { add('Cross-origin framing and clickjacking guard',{ok:false,detail:String(error?.message||error).slice(0,240)}); }
    // Exercise the published Language Studio security contract from source.
    try {
      const response=await healthTimeout(fetch(new URL('projects-category-operating-systems.js',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'Language Studio Worker security audit');
      if(!response.ok)throw new Error(`Operating Systems bundle returned HTTP ${response.status}`);
      const source=await response.text();
      const languageStart=source.indexOf("if(app==='language-studio')"),languageEnd=source.indexOf("if(app==='snippet-vault')",languageStart);
      const runner=languageStart>=0&&languageEnd>languageStart?source.slice(languageStart,languageEnd):'';
      const checks={sourceCap:runner.includes('code.length>250000'),opaqueFrame:runner.includes("preview.setAttribute('sandbox','allow-scripts')"),opaqueOriginCsp:runner.includes("connect-src 'none'"),nestedWorkersBlocked:runner.includes("'Worker','SharedWorker'"),binaryMemoryApisBlocked:runner.includes("'WebAssembly','SharedArrayBuffer','Atomics'"),networkApisBlocked:runner.includes("'WebSocket','EventSource','XMLHttpRequest'"),messageSourceBound:runner.includes("e.origin!=='null'")&&runner.includes('e.source!==preview.contentWindow'),tokenBound:runner.includes('e.data?.token!==token'),workerWatchdog:runner.includes('14000')&&runner.includes('15000'),timerCountCap:runner.includes('timerRecords.size>=128'),timerCallbackCap:runner.includes('timerCallbacks>20000'),nativeWatchdogTimer:runner.includes('NativeSetTimeout(()=>{if(!finished)done();},14000)')};
      add('Language Studio Worker isolation and resource budgets',Object.values(checks).every(Boolean)
        ?{ok:true,detail:'The editor caps source at 250 KB, runs JavaScript inside an opaque-origin frame and short-lived Worker, blocks network and nested-worker APIs, validates opaque origin + exact frame source + token, terminates at 14/15 seconds, caps output and timers at 128 active / 20,000 callbacks; WebAssembly, SharedArrayBuffer and Atomics are disabled. Browsers do not expose a portable hard Worker heap quota.'}
        :{ok:false,detail:`Language Studio source contract missing: ${Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
    } catch(error) { add('Language Studio Worker isolation and resource budgets',{ok:false,detail:String(error?.message||error).slice(0,240)}); }
    // Count static controls in the three separate app documents in addition to the
    // 58 registered project templates. The catalogue has 59 rooms because Sandbox
    // OS is a native workshop room rather than a registered project template.
    // DOMParser never executes the page scripts it parses.
    try {
      const standalonePages=['applications-tools-apps.html','music-audio-apps.html','chroma-loom.html'];
      const standaloneAudit=await Promise.all(standalonePages.map(async file=>{
        const response=await healthTimeout(fetch(new URL(file,deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),10000,`${file} interface inventory`);
        if(!response.ok)throw new Error(`${file} returned HTTP ${response.status}`);
        const doc=new DOMParser().parseFromString(await response.text(),'text/html');
        const controls=[...doc.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],[role="button"],[role="tab"],[role="switch"]')];
        const counts={buttons:0,inputs:0,selects:0,textareas:0,links:0,options:0,unlabeled:0,duplicateIds:0,inlineHandlers:0,javascriptUrls:0,unsafeBlankLinks:0};
        const ids=[...doc.querySelectorAll('[id]')].map(node=>node.id).filter(Boolean);
        counts.duplicateIds=ids.length-new Set(ids).size;
        for(const node of doc.querySelectorAll('*'))for(const attr of [...node.attributes]){
          if(/^on[a-z]+$/i.test(attr.name))counts.inlineHandlers++;
          if(['href','src','action','formaction','xlink:href'].includes(attr.name)&&/^\s*javascript:/i.test(attr.value||''))counts.javascriptUrls++;
        }
        for(const node of controls){
          const tag=node.tagName.toLowerCase();
          if(tag==='button')counts.buttons++;else if(tag==='input')counts.inputs++;else if(tag==='select'){counts.selects++;counts.options+=node.querySelectorAll('option').length;}else if(tag==='textarea')counts.textareas++;else if(tag==='a'){counts.links++;if(node.target==='_blank'&&!/(^|\s)(noopener|noreferrer)(\s|$)/i.test(node.rel||''))counts.unsafeBlankLinks++;}
          const named=Boolean((node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||node.getAttribute('title')||'').trim()||node.textContent?.trim()||node.labels?.length||node.closest('label'));
          if(!named)counts.unlabeled++;
        }
        return {file,counts,frames:doc.querySelectorAll('iframe').length};
      }));
      const total=standaloneAudit.reduce((acc,item)=>{for(const [key,value] of Object.entries(item.counts))acc[key]=(acc[key]||0)+value;acc.frames+=item.frames;return acc;},{frames:0});
      const hard=total.duplicateIds+total.inlineHandlers+total.javascriptUrls+total.unsafeBlankLinks;
      add('Standalone studios and Chroma Loom - control inventory',hard?{ok:false,detail:`Static standalone documents: ${JSON.stringify(total)}. Review inline handlers, javascript URLs, duplicate IDs and unsafe external links.`}:{ok:true,detail:`Read-only DOMParser inventory across ${standaloneAudit.length} standalone documents: ${total.buttons} buttons, ${total.inputs} inputs, ${total.selects} selects, ${total.textareas} textareas, ${total.links} links and ${total.options} select options; ${total.unlabeled} naming candidates; ${total.frames} iframe(s). ${standaloneAudit.map(item=>item.file+': '+item.counts.buttons+' buttons / '+item.counts.options+' options').join('; ')}. Scripts are not executed and dynamically generated controls are covered separately by the project runtime census and SRI checks.`});
    } catch(error) { add('Standalone studios and Chroma Loom - control inventory',{ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}); }
    // Review security-sensitive DOM construction and the custom-OS sanitizer.
    // These checks verify the intended safe-output contracts without injecting
    // payloads into the live page or opening an app window.
    try {
      async function readSecuritySource(file) {
        const response=await healthTimeout(fetch(new URL(file,deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),10000,`${file} security review`);
        if(!response.ok)throw new Error(`${file} returned HTTP ${response.status}`);
        return response.text();
      }
      const [vantaSecurity,darkSecurity,glitchSecurity,coreSecurity,appsPageSecurity,musicPageSecurity]=await Promise.all([
        readSecuritySource('vanta-deck-app.js'),readSecuritySource('dark-looper-app.js'),readSecuritySource('glitchyard-app.js'),
        readSecuritySource('projects-core.js'),readSecuritySource('applications-tools-apps.html'),readSecuritySource('music-audio-apps.html')
      ]);
      const securityContracts={
        vantaDynamicTextEscaped:vantaSecurity.includes('const escapeHTML = value =>')&&vantaSecurity.includes('escapeHTML(m.label)')&&vantaSecurity.includes('escapeHTML(m.value)')&&vantaSecurity.includes('escapeHTML(r.body)')&&vantaSecurity.includes('safeRecommendationLevel(r.level)'),
        darkLooperDynamicRowsUseTextNodes:darkSecurity.includes('row.replaceChildren(nameLabel, categoryLabel)')&&!/row\.innerHTML\s*=\s*[^;]+(?:name|category)/i.test(darkSecurity),
        glitchyardMarkdownEscapesRawHTML:glitchSecurity.includes('function markdownToHtml(text){let escaped=html(text);')&&glitchSecurity.includes('rel="noopener noreferrer"')&&glitchSecurity.includes('const dtEsc = value =>'),
        customOsSanitizerRemovesActiveContent:coreSecurity.includes("script,iframe,frame,object,embed,applet")&&coreSecurity.includes("if(name.startsWith('on')")&&coreSecurity.includes('curioidOsSafeResourceUrl(value,context)')&&coreSecurity.includes('CURIOID_OS_SOURCE_LIMITS.html'),
        sandboxMessagesBindSourceAndToken:coreSecurity.includes("if(event.origin!=='null')return;const frame=[...frameRegistry.values()].find(item=>item.iframe.contentWindow===event.source)")&&coreSecurity.includes('event.data.token!==frame.token'),
        sandboxChildMessagesUseExactHostOrigin:coreSecurity.includes('safeHostOrigin=inlineSafeJson(String(hostOrigin||window.location.origin))')&&coreSecurity.includes('event.origin!==hostOrigin')&&coreSecurity.includes('type:\'request\',id,method,payload},hostOrigin)'),
        customOsWorkerDisablesWasmAndSharedMemory:coreSecurity.includes("'WebAssembly','SharedArrayBuffer','Atomics'")&&coreSecurity.includes('webAssembly:false,sharedMemory:false'),
        legacyOsSourceNeverRuns:coreSecurity.includes('legacy JavaScript that is preserved for migration but is never executed')&&coreSecurity.includes('data-cos-js readonly')&&!coreSecurity.includes("${pkg.source.workerJs?'':userJs}"),
        applicationsPageUsesStrictCsp:applicationsPageSecurity.includes("'strict-dynamic'")&&!/script-src[^;]*'unsafe-(?:inline|eval)'/.test(applicationsPageSecurity),
        musicPageUsesStrictCsp:musicPageSecurity.includes("'strict-dynamic'")&&!/script-src[^;]*'unsafe-(?:inline|eval)'/.test(musicPageSecurity),
        noDynamicCodeExecution:/\beval\s*\(|new\s+Function\s*\(/.test(vantaSecurity+darkSecurity+glitchSecurity+coreSecurity)===false,
        privacySafeInteractionObserver:coreSecurity.includes('event.isTrusted !== true')&&coreSecurity.includes('privacy-safe-interaction-observer')&&coreSecurity.includes('curioidInteractionHistory')&&!/event\.target\.value|event\.key|innerText.*interaction/i.test(coreSecurity.slice(coreSecurity.indexOf('Privacy-safe interaction observations'),coreSecurity.indexOf('window.CurioidProjects')))
      };
      add('DOM injection, custom-OS and messaging security review',Object.values(securityContracts).every(Boolean)
        ?{ok:true,detail:'VANTA DECK escapes dynamic text and whitelists CSS classes; Dark Looper uses text nodes for dynamic library labels; GLITCHYARD escapes raw Markdown HTML and constrains external links; custom OS previews remove active content/event attributes and restrict resource URLs; child-to-parent sandbox messages use the exact host origin and the host validates opaque origin, exact frame source and per-frame token; custom OS Workers disable WebAssembly and shared-memory APIs; legacy custom-OS source is preserved for migration but never executed; standalone pages retain strict CSP; trusted interaction telemetry records only event types and element identifiers in memory, not entered values or text; no eval/new Function execution path was found in the reviewed application/runtime sources.'}
        :{ok:false,detail:`Security source contract needs attention: ${Object.entries(securityContracts).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
    } catch(error) { add('DOM injection, custom-OS and messaging security review',{ok:false,warning:true,detail:String(error?.message||error).slice(0,240)}); }
    // Verify the newly uploaded Chroma Loom app is first in Digital Art and
    // isolated in its own same-origin deployment document.
    try {
      const digitalDescriptor=siteRuntimeSource.match(/id:\s*"digital-art"[\s\S]*?rooms:\s*\[([^\]]+)\]/);
      const digitalFirst=Boolean(digitalDescriptor&&/^\s*"chroma-loom"/.test(digitalDescriptor[1]));
      const [coreResponse,digitalResponse]=await Promise.all([
        healthTimeout(fetch(new URL('projects-core.js',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'Chroma Loom registry audit'),
        healthTimeout(fetch(new URL('projects-category-digital-art.js',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'Chroma Loom category audit')
      ]);
      if(!coreResponse.ok||!digitalResponse.ok)throw new Error(`Chroma source fetch failed: core ${coreResponse.status}, digital art ${digitalResponse.status}`);
      const [projectsCoreSource,projectsDigitalArtSource]=await Promise.all([coreResponse.text(),digitalResponse.text()]);
      const roomRegistered=projectsCoreSource.includes('"chroma-loom":')&&projectsCoreSource.includes('"chroma-loom":"digital-art"');
      const frameIsolation=projectsDigitalArtSource.includes('sandbox="allow-scripts allow-downloads"')&&projectsDigitalArtSource.includes('src="./chroma-loom.html"');
      const filePresent=await fetch(new URL('chroma-loom.html',deploymentBase).href,{method:'HEAD',cache:'no-store',credentials:'same-origin'}).then(response=>response.ok).catch(()=>false);
      add('Chroma Loom first Digital Art app',digitalFirst&&roomRegistered&&frameIsolation&&filePresent
        ?{ok:true,detail:'Chroma Loom is the first Digital Art room, registered in the category module, and runs from its own sandboxed local HTML file with script and download permissions only.'}
        :{ok:false,detail:`Digital Art first=${digitalFirst}; room registry=${roomRegistered}; sandboxed local frame=${frameIsolation}; file available=${filePresent}.`});
    } catch(error) { add('Chroma Loom first Digital Art app',{ok:false,detail:String(error?.message||error).slice(0,200)}); }
    // Verify the distinct built-in Phoneme Singer synthesis path and the
    // desktop group-drag implementation from the published source files.
    try {
      const [osResponse,coreResponse]=await Promise.all([
        healthTimeout(fetch(new URL('projects-category-operating-systems.js',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'OS source contract audit'),
        healthTimeout(fetch(new URL('projects-core.js',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'desktop interaction source audit')
      ]);
      if(!osResponse.ok||!coreResponse.ok)throw new Error(`Source fetch failed: OS ${osResponse.status}, core ${coreResponse.status}`);
      const [osSource,coreSource]=await Promise.all([osResponse.text(),coreResponse.text()]);
      const singerChecks={dedicatedVowel:osSource.includes('function synthSingerVowel('),harmonicSource:osSource.includes('function getSingerPeriodicWave('),modeRouting:osSource.includes("state.vocalMode==='singer')synthSingerVowel"),consonantProjection:osSource.includes("singerProjection=state.vocalMode==='singer'?.42:1"),vowelTiming:osSource.includes('function allocatePhonemeDurations(')&&osSource.includes('return /1$/.test(String(phone))?2.55:2.15')};
      const singerOk=Object.values(singerChecks).every(Boolean);
      add('Echonoise Phoneme Singer synthesis contract',singerOk
        ?{ok:true,detail:'The built-in Singer has a separate harmonic source, singer-formant resonators, ARPABET vowel routing, longer stressed-vowel allocation and restrained consonant projection. This source check cannot judge subjective audio quality; a realistic recorded singer timbre still requires an imported compatible voicebank.'}
        :{ok:false,detail:`Dedicated singer path is incomplete: ${Object.entries(singerChecks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
      const nourishGroupStart=osSource.indexOf("root.addEventListener('curioid:desktop-group-move'");
      const nourishGroupEnd=nourishGroupStart>=0?osSource.indexOf("root.addEventListener('contextmenu'",nourishGroupStart):-1;
      const nourishGroupBody=nourishGroupStart>=0?osSource.slice(nourishGroupStart,nourishGroupEnd>nourishGroupStart?nourishGroupEnd:nourishGroupStart+5000):'';
      const groupChecks={pointerEngine:coreSource.includes('curioidGroupDragState')&&coreSource.includes("new CustomEvent('curioid:desktop-group-move'"),doors98Persistence:osSource.includes("iconArea?.addEventListener('curioid:desktop-group-move'")&&osSource.includes('if(saveIconLayout()){detail.handled=true'),nourishPersistence:nourishGroupBody.includes('if(saveFoodIconLayout())'),nourishReadOnlySessionMove:nourishGroupBody.includes('if(saveFoodIconLayout())')&&!/iconLayoutReadOnly/.test((nourishGroupBody.match(/const detail=event\.detail;([\s\S]*?)\n\s*const items=/)||[])[1]||''),freeMoveSurfaces:coreSource.includes("{surface:'.food-os-free-item-canvas',items:'.food-os-free-item'}")&&coreSource.includes("{surface:'[data-food-free-icons]',items:'.food-os-free-icon'}")};
      const groupOk=Object.values(groupChecks).every(Boolean);
      add('Desktop multi-selection group movement',groupOk
        ?{ok:true,detail:'Marquee-selected items can be moved together. Doors98 persists through its guarded save path; Nourish persists when writable and keeps protected-storage moves in session memory; other surfaces retain offsets for the mounted session.'}
        :{ok:false,detail:`Group-move contract is incomplete: ${Object.entries(groupChecks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
      const nourishSessionOnly=osSource.includes("if(!target||iconLayout.mode!=='free'||e.button!==0)return;")&&osSource.includes("if(iconLayoutReadOnly){setFeedback('Session-only layout mode:");
      add('Nourish protected Free Move',nourishSessionOnly
        ?{ok:true,detail:'Free Move remains interactive even when saved layout storage is read-only. Changes are session-only and the protected saved layout is not overwritten.'}
        :{ok:false,detail:'The source contract for session-only movement in read-only storage mode is missing.'});
      const umbraSet=osSource.match(/UMBRA_PIXEL_EFFECTS=new Set\(\[([^\]]+)\]\)/);
      const umbraNames=umbraSet?[...umbraSet[1].matchAll(/'([a-z-]+)'/g)].map(match=>match[1]):[];
      const umbraBody=osSource.slice(osSource.indexOf('function umbraApplyPixelEffect'),osSource.indexOf('function handleCanvasDown',osSource.indexOf('function umbraApplyPixelEffect')));
      const umbraToolsOk=umbraNames.length>=23&&umbraNames.every(name=>umbraBody.includes(`mode==='${name}'`))&&umbraNames.every(name=>osSource.includes(`data-u-tool-option=\"${name}\"`));
      add('UMBRA advanced left-rail tool coverage',umbraToolsOk
        ?{ok:true,detail:`${umbraNames.length} implemented, selectable local pixel effects are present in the UMBRA tool rail, including tonal, print, colour-treatment and display-style effects. Each listed mode has a corresponding pixel-processing branch.`}
        :{ok:false,detail:`UMBRA effect registry contains ${umbraNames.length} modes; every mode must have a real processing branch and a matching left-rail button.`});
      const kinetaResponse=await healthTimeout(fetch(new URL('projects-category-web-experiments.js',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'Kineta performance contract audit');
      if(!kinetaResponse.ok)throw new Error(`Web Experiments bundle returned HTTP ${kinetaResponse.status}`);
      const kinetaSource=await kinetaResponse.text();
      const kinetaChecks={adaptiveDpr:kinetaSource.includes('adaptiveQualityScale')&&(/const nextDpr\s*=\s*Math\.max\(\.72,\s*baseDpr\s*\*\s*adaptiveQualityScale\)/.test(kinetaSource)),lowResourceBudget:kinetaSource.includes('deviceMemoryGb')&&kinetaSource.includes('const particleCap = lowResourceDevice'),hiddenPause:kinetaSource.includes('new IntersectionObserver')&&kinetaSource.includes('document.hidden||!kinetaInView'),fixedStep:kinetaSource.includes('while (accumulator >= FIXED_DT && steps < 8)'),particleCompaction:kinetaSource.includes('function updateParticles(dt)')&&kinetaSource.includes('particles.length = write;')&&!/particles\.splice\(i,1\)/.test(kinetaSource)};
      add('Kineta adaptive performance safeguards',Object.values(kinetaChecks).every(Boolean)
        ?{ok:true,detail:'Kineta uses adaptive canvas pixel ratio, hardware-aware population/particle/ecosystem budgets, visibility-based loop suspension, bounded fixed-step catch-up and in-place particle compaction.'}
        :{ok:false,detail:`Kineta performance contract missing: ${Object.entries(kinetaChecks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
      const taskbarChecks={observer:osSource.includes("new ResizeObserver(scheduleRetroTray)"),deferredControls:osSource.includes('retroOverflowItems.prepend(entry.node)'),restoreOrder:osSource.includes('entry.marker.parentNode?.insertBefore(entry.node,entry.marker.nextSibling)'),cleanup:osSource.includes('retroTrayCleanup=()=>')};
      add('Doors98 responsive taskbar overflow',Object.values(taskbarChecks).every(Boolean)
        ?{ok:true,detail:'Doors98 measures the live taskbar, moves low-priority controls into a scrollable More menu, restores them in their original order when space returns, and disconnects observers on cleanup.'}
        :{ok:false,detail:`Doors98 taskbar overflow contract missing: ${Object.entries(taskbarChecks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
      const sandboxChecks={minimize:coreSource.includes("button.matches('[data-cos-window-minimize],[data-cos-window-close],[data-cos-window-hide]')"),maximize:coreSource.includes("button.matches('[data-cos-window-maximize]')"),close:coreSource.includes("button.matches('[data-cos-window-minimize],[data-cos-window-close],[data-cos-window-hide]')"),themeApply:coreSource.includes("shellStage?.setAttribute('data-wallpaper',theme)"),themeChange:coreSource.includes("shellRoot.addEventListener('change'")};
      add('Sandbox Notes window controls and theme wiring',Object.values(sandboxChecks).every(Boolean)
        ?{ok:true,detail:'The primary Sandbox Notes window exposes independent minimize, maximize and close controls; the theme picker applies wallpaper state immediately and saves through the guarded desktop store.'}
        :{ok:false,detail:`Sandbox desktop control contract missing: ${Object.entries(sandboxChecks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
      const echonoiseChecks={fullscreenListener:osSource.includes("document.addEventListener('fullscreenchange',onEchonoiseFullscreenChange)"),mainRestore:osSource.includes("main.style.display='flex'"),mainVisibility:osSource.includes("main.hidden=false"),taskbarRestore:osSource.includes('function restoreMainStudio(){focusMainStudio();}')};
      add('Echonoise fullscreen Sound Studio visibility',Object.values(echonoiseChecks).every(Boolean)
        ?{ok:true,detail:'Echonoise tracks fullscreen transitions, keeps the desktop/taskbar rows available, and restores the Sound Studio by clearing hidden/minimized/closed state.'}
        :{ok:false,detail:`Echonoise fullscreen contract missing: ${Object.entries(echonoiseChecks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}.`});
      const downloadExemption=coreSource.includes("if (anchor.matches('[data-health-download]')) return;");
      const nativeReady=siteRuntimeSource.includes('if(healthReportReady)')&&!/healthRunButton\.click\s*\(/.test(siteRuntimeSource);
      add('Health Check native download routing',downloadExemption&&nativeReady
        ?{ok:true,detail:'The global Browser Vault download interceptor explicitly leaves the Health Check link native. The ready-state click does not synthesize or recurse; the browser receives the Blob URL and download filename directly.'}
        :{ok:false,detail:'The Health Check report is still intercepted by artifact routing or a synthetic click path remains.'});
      const styleResponse=await healthTimeout(fetch(new URL('projects-styles.css',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'OS window presentation contract audit');
      if(!styleResponse.ok)throw new Error(`Project stylesheet returned HTTP ${styleResponse.status}`);
      const styleSource=await styleResponse.text();
      const wallpaperNames=[...new Set([...styleSource.matchAll(/\.cos-desktop-stage\[data-wallpaper=\"([^\"]+)\"\]/g)].map(match=>match[1]))];
      const projectLayoutGuard=styleSource.includes('CURIOID v1.333 universal project content guard')&&styleSource.includes('.room-window .room-mount :is(button,input,select,textarea)')&&styleSource.includes('overflow-wrap:anywhere');
      const pageLayoutGuard=Boolean(document.getElementById('curioid-v1-329-responsive-overflow-guard'));
      add('Sitewide responsive layout and overflow safeguards',projectLayoutGuard&&pageLayoutGuard
        ?{ok:true,detail:'Additive responsive guards are present in both the homepage and shared project stylesheet. They allow text/buttons to wrap and preserve scrollable code/table content without hiding interface elements.'}
        :{ok:false,warning:true,detail:`Responsive layout guards are incomplete: project stylesheet ${projectLayoutGuard?'present':'missing'}, homepage style ${pageLayoutGuard?'present':'missing'}.`});
      const popupChecks={doors98:styleSource.includes('.room-window.open:is([data-room=\"dead-interface\"'),aura:styleSource.includes('[data-room=\"aura-synthesis\"]'),aether:styleSource.includes('[data-room=\"aether-os\"]'),sandbox:styleSource.includes('.curioid-os-runtime{inset:3vh 3vw!important'),themeCount:wallpaperNames.length>=25};
      add('Large OS popup windows and Sandbox theme coverage',Object.values(popupChecks).every(Boolean)
        ?{ok:true,detail:`Doors98, AURA and Aether have room-sized popup presentation; Sandbox has a centered, dismissible window shell and ${wallpaperNames.length} CSS-backed desktop themes.`}
        :{ok:false,detail:`OS presentation source contract missing: ${Object.entries(popupChecks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')}; detected ${wallpaperNames.length} wallpaper styles.`});
    } catch(error) {
      add('Echonoise and desktop interaction source contracts',{ok:false,warning:true,detail:String(error?.message||error).slice(0,220)});
    }
    // A native OS can hide the general app layer. Open catalogue rooms must be
    // restored to the catalogue DOM while the OS is active, never left inside
    // that hidden layer.
    try {
      const osIds=new Set(['dead-interface','food-alchemy','echonoise-os','umbra-os','aura-synthesis','aether-os','sandbox-os']);
      const nativeOsOpen=[...document.querySelectorAll('.room-window.open[data-room]')].some(room=>osIds.has(room.dataset.room));
      const layer=document.getElementById('curioid-app-layer');
      const openApps=[...document.querySelectorAll('.room-window.open[data-room]')].filter(room=>!osIds.has(room.dataset.room));
      const stranded=openApps.filter(room=>room.parentElement===layer&&nativeOsOpen);
      const layerMismatch=openApps.filter(room=>!nativeOsOpen&&room.parentElement!==layer);
      const ok=!stranded.length&&!layerMismatch.length&&(!nativeOsOpen||layer?.hidden===true);
      add('Catalogue app portal and OS coexistence',ok?{ok:true,detail:`${openApps.length} open non-OS app(s); native OS open: ${nativeOsOpen}; no app is stranded in a hidden portal layer.`}:{ok:false,detail:`${stranded.length} app(s) remain in the hidden portal while a native OS is open; ${layerMismatch.length} open app(s) are outside the visible portal when no native OS is open.`});
    } catch(error) { add('Catalogue app portal and OS coexistence',{ok:false,detail:String(error?.message||error).slice(0,180)}); }
    // Confirm that the Sandbox frame bootstrap source hash is aligned with the
    // parent CSP and that the source contract still reports precise boot stages.
    try {
      const response=await healthTimeout(fetch(new URL('projects-core.js',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),12000,'Sandbox bootstrap source audit');
      if(!response.ok)throw new Error(`projects-core.js returned HTTP ${response.status}`);
      const source=await response.text(),match=source.match(/frameScript=`([\s\S]*?)`;if\(!globalThis\.crypto/);
      if(!match)throw new Error('The isolated Sandbox frame bootstrap source could not be located.');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(match[1]));
      const hash=`'sha256-${btoa(Array.from(new Uint8Array(digest),byte=>String.fromCharCode(byte)).join(''))}'`;
      const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'';
      const authorised=(csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1]||'').includes(hash);
      const contracts=['curioid-frame-token','securitypolicyviolation','boot-stage','worker-src blob:','payload-script-appended'].every(token=>source.includes(token));
      add('Sandbox isolated-frame bootstrap contract',authorised&&contracts&&/frame-src[^;]*blob:/i.test(csp)?{ok:true,detail:'The isolated Sandbox launcher SHA-256 is authorized by the parent CSP; Blob script execution is explicitly scoped; frame token, CSP error and startup-stage reporting are present.'}:{ok:false,detail:`Parent CSP hash ${authorised?'matches':'does not match'}; frame diagnostics contract ${contracts?'present':'incomplete'}; Blob frame source ${/frame-src[^;]*blob:/i.test(csp)?'allowed':'not allowed'}.`});
    } catch(error) { add('Sandbox isolated-frame bootstrap contract',{ok:false,detail:String(error?.message||error).slice(0,220)}); }
    const coreAssetMeta = assetMeta.find(item=>item.file==='projects-core.js');
    const runtimeCoreHash = siteRuntimeSource.match(/file:\s*["']projects-core\.js["'][^}]*hash:\s*["']([a-f0-9]{64})["']/i)?.[1] || '';
    const runtimeCoreSri = siteRuntimeSource.match(/file:\s*["']projects-core\.js["'][^}]*integrity:\s*["'](sha384-[^"']+)["']/)?.[1] || '';
    const coreMapMatches = Boolean(coreAssetMeta && runtimeCoreHash && runtimeCoreSri && runtimeCoreHash===releaseManifest?.manifest?.['projects-core.js'] && coreAssetMeta.hashMatches && coreAssetMeta.actualSha384===runtimeCoreSri);
    const categoryBlock = siteRuntimeSource.match(/const PROJECT_CATEGORY_ASSETS = Object\.freeze\((\{[\s\S]*?\})\);/);
    let categoryAssetMap = null, categoryMapIssues = [];
    try {
      const descriptorPattern=/["']([^"']+)["']\s*:\s*\{\s*file:\s*["']([^"']+)["']\s*,\s*hash:\s*["']([a-f0-9]{64})["']\s*,\s*integrity:\s*["'](sha384-[^"']+)["']\s*\}/gi;
      categoryAssetMap={}; let descriptorMatch;
      while((descriptorMatch=descriptorPattern.exec(categoryBlock?.[1]||''))) categoryAssetMap[descriptorMatch[1]]={file:descriptorMatch[2],hash:descriptorMatch[3],integrity:descriptorMatch[4]};
      if(Object.keys(categoryAssetMap).length!==7) throw new Error(`expected seven category descriptors, found ${Object.keys(categoryAssetMap).length}`);
    } catch(error) { categoryAssetMap=null; categoryMapIssues.push(`category descriptor parse: ${String(error?.message||error).slice(0,100)}`); }
    if (categoryAssetMap && releaseManifest) {
      for (const [category,descriptor] of Object.entries(categoryAssetMap)) {
        const meta=assetMeta.find(item=>item.file===descriptor.file);
        if (!meta || descriptor.hash!==releaseManifest.manifest[descriptor.file] || !meta.hashMatches || descriptor.integrity!==meta.actualSha384) categoryMapIssues.push(category);
      }
    } else categoryMapIssues.push('category descriptor map missing or unparseable');
    add('Runtime-to-release asset map',coreMapMatches&&categoryMapIssues.length===0
      ? {ok:true,detail:`projects-core.js SHA-256/SHA-384 matches the loader; ${Object.keys(categoryAssetMap||{}).length} category descriptors match the worker manifest and downloaded bytes.`}
      : {ok:false,detail:`Shared core SRI/hash ${coreMapMatches?'match':'MISMATCH'}; category descriptor problems: ${categoryMapIssues.join(', ')||'none'}.`});
    const styleRuntimeHash=siteRuntimeSource.match(/const PROJECT_STYLES_SHA256\s*=\s*["']([a-f0-9]{64})["']/i)?.[1]||'';
    const sharedPrefetchBlock=siteRuntimeSource.match(/const SHARED_PREFETCH_ASSETS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1]||'';
    const prefetchCoreHash=sharedPrefetchBlock.match(/file:\s*["']projects-core\.js["'][^}]*hash:\s*["']([a-f0-9]{64})["']/i)?.[1]||'';
    const prefetchStyleHash=sharedPrefetchBlock.match(/file:\s*["']projects-styles\.css["'][^}]*hash:\s*["']([a-f0-9]{64})["']/i)?.[1]||'';
    const styleAssetMeta=assetMeta.find(item=>item.file==='projects-styles.css');
    const sharedHashProblems=[];
    const styleRuntimeSri=siteRuntimeSource.match(/const PROJECT_STYLES_SRI\s*=\s*["'](sha384-[A-Za-z0-9+/=]+)["']/i)?.[1]||'';
    if(!styleRuntimeHash||styleRuntimeHash!==releaseManifest?.manifest?.['projects-styles.css']||!styleAssetMeta?.hashMatches||styleRuntimeSri!==styleAssetMeta?.actualSha384)sharedHashProblems.push('project stylesheet loader SHA-256/SHA-384 integrity');
    if(!prefetchStyleHash||prefetchStyleHash!==releaseManifest?.manifest?.['projects-styles.css'])sharedHashProblems.push('project stylesheet prefetch hash');
    if(!prefetchCoreHash||prefetchCoreHash!==releaseManifest?.manifest?.['projects-core.js']||!coreAssetMeta?.hashMatches)sharedHashProblems.push('shared core prefetch hash');
    add('Runtime shared-core and stylesheet hash alignment',sharedHashProblems.length
      ?{ok:false,detail:`Runtime-to-manifest shared-asset hash mismatch: ${sharedHashProblems.join(', ')}. Project launch or offline pre-cache can fail even when the files themselves are valid.`}
      :{ok:true,detail:'The runtime stylesheet loader, stylesheet prefetch, shared-core prefetch and worker manifest all declare the exact SHA-256 hashes of the deployed files.'});
    try {
      const lexiconMeta = assetMeta.find(item => item.file === 'vocal-lexicon-data.json');
      const lexiconLoaderUrl = new URL('vocal-lexicon.js', deploymentBase);
      lexiconLoaderUrl.searchParams.set('v', `sha256-${releaseManifest?.manifest?.['vocal-lexicon.js'] || ''}`);
      const lexiconLoaderResponse = await healthTimeout(fetch(lexiconLoaderUrl.href, {cache:'no-store', credentials:'same-origin'}), 8000, 'Vocal Lexicon loader integrity descriptor');
      if (!lexiconLoaderResponse.ok) throw new Error(`Vocal Lexicon loader returned HTTP ${lexiconLoaderResponse.status}`);
      const lexiconLoaderSource = await lexiconLoaderResponse.text();
      const dataHash = lexiconLoaderSource.match(/const DATA_SHA256\s*=\s*['"]([a-f0-9]{64})['"]/i)?.[1] || '';
      const dataSri = lexiconLoaderSource.match(/const DATA_SRI\s*=\s*['"](sha256-[A-Za-z0-9+/=]+)['"]/i)?.[1] || '';
      const actualSri = lexiconMeta?.actualHash && /^[a-f0-9]{64}$/i.test(lexiconMeta.actualHash)
        ? 'sha256-' + btoa(String.fromCharCode(...new Uint8Array(lexiconMeta.actualHash.match(/../g).map(pair => parseInt(pair, 16))))) : '';
      const aligned = Boolean(dataHash && dataHash === releaseManifest?.manifest?.['vocal-lexicon-data.json'] && lexiconMeta?.hashMatches && dataSri && dataSri === actualSri);
      add('Vocal Lexicon loader-to-data integrity', aligned
        ? {ok:true, detail:'The lazy JSON loader SHA-256 URL, native Fetch SRI descriptor and downloaded dictionary bytes agree with the service-worker release manifest.'}
        : {ok:false, detail:'The Vocal Lexicon loader, native Fetch SRI descriptor, dictionary download and service-worker manifest do not all declare the same bytes.'});
      const packedIndexReady = lexiconLoaderSource.includes('new Uint32Array(expectedCount + 1)') &&
        lexiconLoaderSource.includes('comparePackedWordAt') &&
        lexiconLoaderSource.includes('cache.size >= 2048') &&
        lexiconLoaderSource.includes('const data = await response.json()');
      add('Vocal Lexicon packed-index memory safeguards', packedIndexReady
        ? {ok:true, detail:'Pronunciation tables stay packed in source strings, typed offsets replace large per-word arrays, lookup compares without temporary midpoint strings, decoded entries use a bounded 2,048-item cache, and the lazy JSON response uses the native parser.'}
        : {ok:false, detail:'The expected packed lexicon index, direct comparator, bounded pronunciation cache or JSON parser path is missing from the deployed loader.'});
    } catch (error) {
      add('Vocal Lexicon loader-to-data integrity', {ok:false, detail:String(error?.message || error).slice(0,220)});
    }
    try {
      const swUrl = new URL(`service-worker-current.js?release=${EXPECTED_RELEASE}`, deploymentBase);
      const swResponse = await healthTimeout(fetch(swUrl.href, {cache:'no-store',credentials:'same-origin'}), 8000, 'Service-worker file request');
      const swText = swResponse.ok ? await swResponse.text() : '';
      const swValid = swResponse.ok && new RegExp('const\\s+RELEASE_ID\\s*=\\s*[\"\\\']'+EXPECTED_RELEASE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[\"\\\']').test(swText) && swText.includes('CACHE_NAME');
      const memoryAwarePrecache = swText.includes('const concurrency = limitedDevice ? 1 : 2') && swText.includes('navigator?.deviceMemory') && swText.includes('connection?.saveData');
      add('Low-memory offline cache scheduling', memoryAwarePrecache
        ? {ok:true,detail:'The explicit offline pre-cache uses one in-flight asset on low-memory, Data Saver and slow-2G/2G devices, and never exceeds two concurrent downloads.'}
        : {ok:false,detail:'The service worker does not contain the expected memory- and connection-aware pre-cache concurrency limit.'});
      add('Service-worker file delivery', swValid ? {ok:true,detail:`HTTP ${swResponse.status}; release marker ${EXPECTED_RELEASE} found; ${swText.length.toLocaleString()} characters.`} : {ok:false,detail:`HTTP ${swResponse.status}; release marker missing or response was not a valid ${EXPECTED_RELEASE} service worker; ${swResponse.headers.get('content-type')||'content type not supplied'}.`});
    } catch(error) { add('Service-worker file delivery',{ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}); }
    const shellIntegrity=await probePublishedShell();
    if(shellIntegrity.meta)assetMeta.push(shellIntegrity.meta);
    add('Published page integrity',shellIntegrity);
    const publishedSiteSnapshot=shellIntegrity.meta?.siteSnapshot||null;
    if(publishedSiteSnapshot) {
      const issues=[];
      if(!publishedSiteSnapshot.releaseMatches)issues.push(`live release ${publishedSiteSnapshot.release} differs from this page's expected ${publishedSiteSnapshot.expectedRelease}`);
      if(!publishedSiteSnapshot.sameSocialImage||!publishedSiteSnapshot.socialTextAligned)issues.push('Open Graph and Twitter preview text/image paths are inconsistent');
      if(!publishedSiteSnapshot.socialCountAligned||!publishedSiteSnapshot.projectCountAligned||!publishedSiteSnapshot.categoryCountAligned)issues.push('published project/category counts do not match this release');
      if(!publishedSiteSnapshot.iconSvg||!publishedSiteSnapshot.iconPng||!publishedSiteSnapshot.brandMarkMatches)issues.push('favicon geometry does not exactly match the header logo or icon declarations are missing');
      if(!publishedSiteSnapshot.canonicalAligned)issues.push('canonical URL does not match the published page');
      add('Live website identity and metadata',issues.length?{ok:false,warning:!publishedSiteSnapshot.releaseMatches,detail:issues.join('; ')+`. Published title: ${publishedSiteSnapshot.title||'missing'}; description: ${publishedSiteSnapshot.description||'missing'}.`}:{ok:true,detail:`Live release ${publishedSiteSnapshot.release}; ${publishedSiteSnapshot.projectCount} project windows across ${publishedSiteSnapshot.categoryCount} categories; six independent operating systems plus Sandbox OS. Page title, SEO descriptions, Open Graph/Twitter preview, and brand icon declarations are aligned.`});
      add('Published brand mark and social preview',publishedSiteSnapshot.brandMarkMatches&&publishedSiteSnapshot.sameSocialImage?{ok:true,detail:'The live favicon eye paths and circle geometry exactly match the top-left header logo; Open Graph and Twitter use the same social image.'}:{ok:false,warning:true,detail:`Header/favicon geometry ${publishedSiteSnapshot.brandMarkMatches?'matches':'does not match or could not be fetched'}; Open Graph/Twitter image paths ${publishedSiteSnapshot.sameSocialImage?'match':'are inconsistent'}.`});
    } else {
      add('Live website identity and metadata',{ok:false,warning:true,detail:'The published shell could not be parsed in this browser. Send the report with the page-integrity and asset results so the deployment can be inspected.'});
      add('Published brand mark and social preview',{ok:false,warning:true,detail:'Not measured because the published HTML could not be fetched or parsed.'});
    }
    const canonical=document.querySelector('link[rel=\"canonical\"]')?.href;
    let canonicalAligned=false;
    try{const canonicalUrl=new URL(canonical||location.href);canonicalAligned=canonicalUrl.origin===location.origin&&canonicalUrl.pathname.replace(/\/$/,'')===location.pathname.replace(/\/$/,'');}catch(_){}
    add('Canonical deployment alignment',canonicalAligned?{ok:true,detail:'Canonical URL and current page use the same origin and deployment path.'}:{ok:false,warning:true,detail:`Canonical URL may point to a different origin or path: ${canonical||'not set'}. This can affect asset fallback and indexing.`});
    const estimate = await (navigator.storage?.estimate?.().catch(()=>null) || Promise.resolve(null));
    const usage = Number.isFinite(estimate?.usage) ? formatStorageSize(estimate.usage) : 'unavailable';
    const quota = Number.isFinite(estimate?.quota) ? formatStorageSize(estimate.quota) : 'unavailable';
    const usageRatio=Number.isFinite(estimate?.usage)&&Number.isFinite(estimate?.quota)&&estimate.quota>0?estimate.usage/estimate.quota:null;
    add('Storage quota estimate', estimate ? usageRatio!==null&&usageRatio>=0.9?{ok:false,warning:true,detail:`Origin-wide usage is about ${Math.round(usageRatio*100)}% (${usage} of ${quota}). This is a high-pressure warning, not an exact browser eviction threshold.`}:usageRatio!==null&&usageRatio>=0.8?{ok:false,warning:true,detail:`Origin-wide usage is about ${Math.round(usageRatio*100)}% (${usage} of ${quota}). Review backups and unused temporary data before adding large files.`}:{ok:true,detail:`Origin-wide estimate: ${usage} used of ${quota}${usageRatio!==null?` (${Math.round(usageRatio*100)}%)`:''}. This is not per-app accounting.`} : {ok:false,warning:true,detail:'Browser storage estimate is unavailable.'});
    const persistRequestResult = runOptions.persistencePromise ? await healthTimeout(runOptions.persistencePromise, 6000, 'persistent storage protection request').catch(()=>null) : null;
    maintenance.persistentStorageRequestResult = persistRequestResult;
    const persisted = await navigator.storage?.persisted?.().catch(()=>null);
    add('Persistent storage protection', persisted === true ? {ok:true,detail:persistRequestResult===true?'Persistent storage protection is enabled; the one-click maintenance request was granted or protection was already active.':'The browser reports persistent storage protection is enabled for this origin.'} : persisted === false ? {ok:false,warning:true,detail:persistRequestResult===false?'The browser declined the non-destructive persistent-storage request. Existing data was not changed; consider regular exports.':'Persistent storage is not enabled. The one-click request was unavailable, deferred or declined; browser cleanup policies may still remove local data.'} : {ok:false,warning:true,detail:'This browser does not expose persistent-storage status. Existing data was not changed.'});
    const localStorageResult = await (async()=>{try{return await probeWebStorage(window.localStorage,'localStorage');}catch(error){return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)};}})();
    const sessionStorageResult = await (async()=>{try{return await probeWebStorage(window.sessionStorage,'sessionStorage');}catch(error){return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)};}})();
    add('Local storage', localStorageResult);
    add('Session storage', sessionStorageResult);
    const [idb,opfs,cacheProbe,workerProbe,idbRollback,cryptoProbe,compressionProbe,broadcastProbe,wasmProbe] = await Promise.all([
      probeTemporaryIndexedDB(),probeOpfs(),probeCacheStorage(),probeWorker(),probeIndexedDBRollback(),probeCryptoCanary(),probeCompressionCanary(),probeBroadcastChannel(),probeWasmExecution()
    ]);
    add('IndexedDB read/write',idb); add('OPFS staged write/read/remove',opfs); add('Cache Storage read/write',cacheProbe); add('Web Worker execution',workerProbe);
    add('IndexedDB transaction rollback canary',idbRollback); add('Web Crypto known-answer test',cryptoProbe); add('Compression round-trip',compressionProbe); add('BroadcastChannel message round-trip',broadcastProbe); add('WebAssembly compile/instantiate',wasmProbe);
    const storageInventory=await discoverStorageInventory();
    window.__CURIOID_HEALTH_STORAGE_INVENTORY=storageInventory;
    add('Origin storage inventory coverage',storageInventory.indexedDB.supported||storageInventory.opfs.supported
      ? {ok:true,detail:`Read-only metadata inventory: ${storageInventory.indexedDB.databaseCount??'unknown'} IndexedDB database(s); ${storageInventory.opfs.fileCount} top-level OPFS file(s), ${storageInventory.opfs.directoryCount} directory(ies), ${formatStorageSize(storageInventory.opfs.totalBytes)}; localStorage ${storageInventory.webStorage.localStorageKeys??'unavailable'} key(s), sessionStorage ${storageInventory.webStorage.sessionStorageKeys??'unavailable'} key(s). User values and file contents were not read.`}
      : {ok:false,warning:true,detail:'Browser does not expose read-only database or OPFS inventory APIs.'});
    const canvas = document.createElement('canvas');
    add('Canvas 2D rendering', canvas.getContext('2d') ? {ok:true,detail:'Canvas 2D context is available.'} : {ok:false,warning:true,detail:'Canvas 2D is unavailable.'});
    let webgl = false;
    try { const glCanvas=document.createElement('canvas'); const gl=glCanvas.getContext('webgl2')||glCanvas.getContext('webgl'); webgl=!!gl; gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
    add('WebGL graphics',webgl ? {ok:true,detail:'WebGL context creation succeeded.'} : {ok:false,warning:true,detail:'WebGL is unavailable or disabled. Some visual projects may use 2D fallbacks.'});
    add('Web Audio', (window.AudioContext||window.webkitAudioContext) ? {ok:true,detail:'Web Audio API is available; no audio context was started by this probe.'} : {ok:false,warning:true,detail:'Web Audio API is unavailable.'});
    add('WebAssembly capability', typeof WebAssembly==='object' ? {ok:true,detail:'WebAssembly API is available; execution is validated separately by the minimal compile/instantiate canary.'} : {ok:false,warning:true,detail:'WebAssembly is unavailable.'});
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
    const cspDirectives=Object.fromEntries(csp.split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const [name,...values]=part.split(/\s+/);return[name.toLowerCase(),values.join(' ')];}));
    const scriptPolicy=cspDirectives['script-src']||cspDirectives['default-src']||'';
    const cspWeaknesses=[];
    if(!cspDirectives['object-src']?.includes("'none'"))cspWeaknesses.push('object-src is not none');
    if(!cspDirectives['base-uri']?.includes("'none'"))cspWeaknesses.push('base-uri is not none');
    if(!cspDirectives['form-action'])cspWeaknesses.push('form-action is missing');
    if(!scriptPolicy.includes("'self'"))cspWeaknesses.push('script-src does not allow same-origin release scripts');
    if(scriptPolicy.includes("'unsafe-inline'")||scriptPolicy.includes("'unsafe-eval'"))cspWeaknesses.push('script-src contains an unsafe execution exception');
    const liveJsUrls=[...document.querySelectorAll('a[href],form[action],[src]')].filter(node=>['href','action','src'].some(attr=>/^\s*javascript:/i.test(node.getAttribute(attr)||'')));
    const liveInlineHandlers=[...document.querySelectorAll('*')].reduce((count,node)=>count+[...node.attributes].filter(attribute=>/^on[a-z]+$/i.test(attribute.name)).length,0);
    const unsafeNewTabs=[...document.querySelectorAll('a[target="_blank"]')].filter(node=>!/(^|\s)(noopener|noreferrer)(\s|$)/i.test(node.rel||''));
    const unsandboxedFrames=[...document.querySelectorAll('iframe:not([sandbox]):not([data-curioid-embedded-frame])')];
    const trustedFirstPartyFrames=[...document.querySelectorAll('iframe[data-curioid-embedded-frame]')];
    const scriptsMissingIntegrity=[...document.querySelectorAll('script[src]')].filter(script=>!script.integrity);
    const externalScriptsMissingIntegrity=scriptsMissingIntegrity.filter(script=>{try{return new URL(script.src,location.href).origin!==location.origin;}catch(_){return true;}});
    const missingReferrerPolicy=!document.querySelector('meta[name="referrer"][content]');
    if(liveJsUrls.length)cspWeaknesses.push(`${liveJsUrls.length} javascript: URL(s) in the live DOM`);
    if(liveInlineHandlers)cspWeaknesses.push(`${liveInlineHandlers} inline event handler(s) in the live DOM`);
    if(unsafeNewTabs.length)cspWeaknesses.push(`${unsafeNewTabs.length} target=_blank link(s) lack noopener/noreferrer`);
    if(unsandboxedFrames.length)cspWeaknesses.push(`${unsandboxedFrames.length} iframe(s) have no sandbox attribute`);
    if(externalScriptsMissingIntegrity.length)cspWeaknesses.push(`${externalScriptsMissingIntegrity.length} cross-origin script(s) lack SRI`);
    if(missingReferrerPolicy)cspWeaknesses.push('a document referrer policy meta tag is missing');
    add('Content Security Policy & live DOM hardening',csp&&!cspWeaknesses.length
      ?{ok:true,detail:`script-src contains no unsafe-inline/unsafe-eval exception; object-src and base-uri are restricted; form-action is defined; live DOM has no javascript: URLs, inline event handlers, unsafe new-tab links or untrusted unsandboxed iframes; ${trustedFirstPartyFrames.length} fixed same-origin CURIOID studio frame(s) are separately checked for restrictive CSP and script SRI; cross-origin scripts are SRI-bound and a strict referrer policy is present.`}
      :{ok:false,warning:true,detail:`CSP/live-DOM hardening needs review: ${cspWeaknesses.join('; ')||'the expected CSP meta policy is missing'}.`});
    const manifestResponse = await (async()=>{try{return await healthTimeout(fetch(new URL('manifest.webmanifest',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),6000,'PWA manifest');}catch(error){return {ok:false,error};}})();
    if (manifestResponse?.ok === false) add('PWA manifest',{ok:false,warning:true,detail:String(manifestResponse.error?.message||manifestResponse.error||'Manifest request failed').slice(0,220)});
    else {
      try { const manifest=await manifestResponse.json(); add('PWA manifest',manifest?.name&&manifest?.start_url?{ok:true,detail:`Manifest loaded; name “${String(manifest.name).slice(0,80)}”; start URL ${String(manifest.start_url).slice(0,120)}.`}:{ok:false,warning:true,detail:'Manifest loaded but required name or start_url fields are missing.'}); }
      catch(error) { add('PWA manifest',{ok:false,detail:`Manifest response could not be parsed: ${String(error?.message||error).slice(0,180)}`}); }
    }
    const browserApis = { ResizeObserver:typeof ResizeObserver==='function', IntersectionObserver:typeof IntersectionObserver==='function', MutationObserver:typeof MutationObserver==='function', BroadcastChannel:typeof BroadcastChannel==='function', WebLocks:!!navigator.locks?.request, AbortController:typeof AbortController==='function', CompressionStream:typeof CompressionStream==='function', OffscreenCanvas:typeof OffscreenCanvas==='function', FileSystemAccess:typeof showOpenFilePicker==='function', WebGPU:!!navigator.gpu, WebCodecs:typeof VideoDecoder==='function'||typeof AudioDecoder==='function', WebShare:typeof navigator.share==='function', Clipboard:!!navigator.clipboard?.writeText, Notifications:typeof Notification==='function' };
    const optionalMissing=Object.entries(browserApis).filter(([,available])=>!available).map(([name])=>name);
    add('Browser capability matrix',{ok:true,detail:`Available: ${Object.entries(browserApis).filter(([,available])=>available).map(([name])=>name).join(', ')||'none'}. Not exposed: ${optionalMissing.join(', ')||'none'}. Optional/experimental APIs are recorded as capabilities, not failures; Health Check never requests permissions.`});
    const buttons=[...document.querySelectorAll('button')];
    const unlabeledButtons=buttons.filter(button=>!(button.getAttribute('aria-label')||button.getAttribute('title')||button.innerText||button.textContent||'').trim());
    const links=[...document.querySelectorAll('a[href]')];
    const unlabeledLinks=links.filter(node=>!(node.getAttribute('aria-label')||node.getAttribute('title')||node.innerText||node.textContent||'').trim());
    const images=[...document.images];
    const missingImageAlt=images.filter(node=>!node.hasAttribute('alt')&&!node.closest('[aria-hidden="true"]')&&!node.getAttribute('role')?.includes('presentation'));
    const controls=[...document.querySelectorAll('input:not([type=hidden]),select,textarea')];
    const unlabeledControls=controls.filter(node=>!(node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||node.labels?.length));
    const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);
    const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(node=>Number(node.tagName.slice(1)));
    const skippedHeadingLevels=headings.slice(1).filter((level,index)=>level>headings[index]+1);
    const a11yIssues=[];
    if(!document.documentElement.lang) a11yIssues.push('document language missing');
    if(!document.title.trim()) a11yIssues.push('document title missing');
    if(unlabeledButtons.length) a11yIssues.push(`${unlabeledButtons.length} button(s) have no accessible name`);
    if(unlabeledLinks.length) a11yIssues.push(`${unlabeledLinks.length} link(s) have no accessible name`);
    if(missingImageAlt.length) a11yIssues.push(`${missingImageAlt.length} image(s) have no alt attribute`);
    if(unlabeledControls.length) a11yIssues.push(`${unlabeledControls.length} form control(s) have no programmatic label`);
    if(duplicateIds.length) a11yIssues.push(`${duplicateIds.length} duplicate ID value(s)`);
    if(skippedHeadingLevels.length) a11yIssues.push(`${skippedHeadingLevels.length} heading level jump(s)`);
    const a11yLandmarks={main:document.querySelectorAll('main,[role=main]').length,nav:document.querySelectorAll('nav,[role=navigation]').length,header:document.querySelectorAll('header,[role=banner]').length,footer:document.querySelectorAll('footer,[role=contentinfo]').length};
    add('Accessibility and document structure',a11yIssues.length?{ok:false,warning:true,detail:a11yIssues.join('; ')+`; ${headings.length} headings and landmarks ${JSON.stringify(a11yLandmarks)}.`}:{ok:true,detail:`Language/title present; ${buttons.length} buttons, ${links.length} links, ${images.length} images and ${controls.length} form controls checked; ${headings.length} headings; landmarks ${JSON.stringify(a11yLandmarks)}; no duplicate IDs or basic naming gaps found. Automated structural check only, not a full WCAG audit.`});
    // Check same-page navigation targets without making network requests.
    const localAnchorLinks=links.filter(node=>{try{const target=new URL(node.href,location.href);return target.origin===location.origin&&target.pathname===location.pathname&&!!target.hash&&target.hash!=='#';}catch(_){return false;}});
    const missingAnchorTargets=localAnchorLinks.filter(node=>{try{return !document.getElementById(decodeURIComponent(new URL(node.href,location.href).hash.slice(1)));}catch(_){return true;}});
    add('In-page navigation targets',missingAnchorTargets.length?{ok:false,warning:true,detail:`${missingAnchorTargets.length} same-page link target(s) could not be found: ${missingAnchorTargets.slice(0,8).map(node=>node.getAttribute('href')).join(', ')}.`}:{ok:true,detail:`${localAnchorLinks.length} same-page navigation link(s) checked; all referenced element IDs exist.`});
    // Flag only measurable horizontal clipping, not normal multi-line wrapping.
    const clippedButtons=buttons.filter(button=>{
      if(!button.getClientRects().length||button.disabled)return false;
      const style=getComputedStyle(button);
      const constrained=style.overflowX==='hidden'||style.textOverflow==='ellipsis'||style.whiteSpace==='nowrap';
      return constrained&&button.clientWidth>0&&button.scrollWidth>button.clientWidth+4;
    });
    add('Visible button label clipping',clippedButtons.length?{ok:false,warning:true,detail:`${clippedButtons.length} visible button(s) may clip horizontally: ${clippedButtons.slice(0,10).map(node=>(node.getAttribute('aria-label')||node.title||node.textContent||'unnamed').trim().replace(/\s+/g,' ').slice(0,48)).join(' · ')}. Resize the window or inspect the listed controls.`}:{ok:true,detail:`${buttons.length} buttons checked; no obvious horizontal label clipping detected in the current viewport. This does not replace manual visual review.`});
    const visibleInteractive=[...document.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href],[role="button"],[role="tab"],[role="switch"]')].filter(node=>node.getClientRects().length);
    const visibleText=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,small,strong,b,li,dt,dd,label,legend,summary,figcaption')].filter(node=>node.getClientRects().length);
    const liveOverflow=[];
    const inspectOverflow=(node,kind)=>{
      try{
        const style=getComputedStyle(node),rect=node.getBoundingClientRect();
        const horizontalClip=node.clientWidth>0&&node.scrollWidth>node.clientWidth+4&&(style.overflowX==='hidden'||style.textOverflow==='ellipsis'||style.whiteSpace==='nowrap');
        const verticalClip=node.clientHeight>0&&node.scrollHeight>node.clientHeight+4&&style.overflowY==='hidden';
        const outside=rect.width>0&&(rect.right< -3||rect.left>innerWidth+3);
        if(horizontalClip||verticalClip||outside)liveOverflow.push({kind,label:(node.getAttribute('aria-label')||node.title||node.textContent||node.getAttribute('placeholder')||node.tagName).trim().replace(/\s+/g,' ').slice(0,48),horizontalClip,verticalClip,outside});
      }catch(_){}
    };
    for(const node of visibleInteractive)inspectOverflow(node,'control');
    for(const node of visibleText)inspectOverflow(node,'text');
    const pageHorizontalOverflow=document.documentElement.scrollWidth>document.documentElement.clientWidth+4;
    add('Live control labels, text layout & responsive overflow',liveOverflow.length||pageHorizontalOverflow
      ?{ok:false,warning:true,detail:`${visibleInteractive.length} visible interactive controls and ${visibleText.length} text elements inspected. ${liveOverflow.length} element(s) show measurable clipping/offscreen placement${pageHorizontalOverflow?' and the page itself exceeds the viewport width':''}: ${liveOverflow.slice(0,12).map(item=>`${item.kind}: ${item.label}`).join(' · ')}. No elements were removed.`}
      :{ok:true,detail:`${visibleInteractive.length} visible interactive controls and ${visibleText.length} text elements checked at the current viewport; no measurable label clipping, hidden vertical text or page-level horizontal overflow detected. Repeat after resizing to check other viewport widths.`});
    // Font readiness is useful when a layout looks broken because a web font is still pending.
    if(document.fonts?.ready){
      try{await healthTimeout(document.fonts.ready,5000,'document font readiness');add('Font loading readiness',document.fonts.status==='loaded'?{ok:true,detail:'The document font set reports loaded. This does not prove every requested font family exists or matches the intended design.'}:{ok:false,warning:true,detail:`Document font loading state is ${document.fonts.status}. Some text may still be using fallback fonts.`});}
      catch(error){add('Font loading readiness',{ok:false,warning:true,detail:`Font readiness did not settle within the diagnostic window: ${String(error?.message||error).slice(0,150)}.`});}
    }else add('Font loading readiness',{ok:false,warning:true,detail:'The CSS Font Loading API is not exposed by this browser.'});
    // Chromium exposes an optional heap snapshot; many browsers intentionally hide it.
    const heap=performance.memory&&Number.isFinite(performance.memory.usedJSHeapSize)?performance.memory:null;
    add('JavaScript heap snapshot',heap?{ok:true,detail:`Used ${formatStorageSize(heap.usedJSHeapSize)} of ${formatStorageSize(heap.jsHeapSizeLimit)} reported JavaScript heap; allocated ${formatStorageSize(heap.totalJSHeapSize)}. Browser-specific snapshot, not a leak verdict.`}:{ok:false,warning:true,detail:'This browser does not expose a JavaScript heap-size estimate. No memory usage is inferred.'});
    const performanceSnapshot = collectPerformanceSnapshot();
    const navPerf = performanceSnapshot.navigation;
    add('Navigation performance',navPerf?{ok:true,detail:`Response wait ${navPerf.serverResponseWaitMs??'n/a'} ms; DOM interactive ${navPerf.domInteractiveMs??'n/a'} ms; DOMContentLoaded ${navPerf.domContentLoadedMs??'n/a'} ms; load event ${navPerf.loadEventMs??'n/a'} ms. These are this page's navigation timings.`}:{ok:false,warning:true,detail:'Navigation Timing is unavailable in this browser.'});
    const fcp = performanceSnapshot.paint.firstContentfulPaintMs;
    const lcp = performanceSnapshot.webVitalsSnapshot.largestContentfulPaintMs;
    const cls = performanceSnapshot.webVitalsSnapshot.cumulativeLayoutShift;
    const lcpElement=performanceSnapshot.webVitalsSnapshot.largestContentfulPaintElement;
    const vitalsParts = [`FCP ${fcp===null?'not exposed':`${fcp} ms`}`,`LCP ${lcp===null?'not exposed':`${lcp} ms`}`,`CLS ${cls===null?'not exposed':cls}`,...(lcpElement?.tag?[`LCP candidate ${lcpElement.tag}${lcpElement.size?` ${lcpElement.size.toLocaleString()} px²`:''}${lcpElement.url?` ${lcpElement.url}`:''}`]:[])];
    const lcpPoor = lcp!==null && lcp>4000;
    const clsPoor = cls!==null && cls>0.25;
    const lcpWatch = lcp!==null && lcp>2500;
    const clsWatch = cls!==null && cls>0.1;
    const vitalsMissing = lcp===null || cls===null;
    add('Core Web Vitals snapshot',lcpPoor||clsPoor?{ok:false,detail:`${vitalsParts.join(' · ')}. Snapshot indicates a slow LCP or elevated layout shift.`}:lcpWatch||clsWatch?{ok:false,warning:true,detail:`${vitalsParts.join(' · ')}. One or more local snapshots are above the recommended good range.`}:vitalsMissing?{ok:false,warning:true,detail:`${vitalsParts.join(' · ')}. Some browsers do not expose every metric or may not have emitted an LCP/layout-shift entry yet.`}:{ok:true,detail:`${vitalsParts.join(' · ')}. Local navigation snapshot only, not field percentile data.`});
    const longTask = performanceSnapshot.longTasks;
    add('Main-thread long tasks',longTask.supported?(longTask.count?{ok:false,warning:true,detail:`${longTask.count} long task(s) of 50 ms or more observed; longest ${longTask.longestDurationMs} ms; sampled total ${longTask.totalDurationMs} ms; blocking-time proxy ${longTask.totalBlockingTimeProxyMs} ms (sum of max(duration−50 ms, 0), not Lighthouse TBT).`}:{ok:true,detail:'Long-task observation is supported; no long tasks of 50 ms or more were observed in the available timeline.'}):{ok:false,warning:true,detail:'This browser does not expose Long Task Timing. Absence of this API is not a failure.'});
    const animationFrames=performanceSnapshot.longAnimationFrames;
    add('Long animation frame diagnostics',animationFrames.supported?(animationFrames.count?{ok:false,warning:true,detail:`${animationFrames.count} long animation frame(s); total blocking ${animationFrames.totalBlockingMs} ms; longest frames: ${animationFrames.longest.map(item=>`${item.durationMs} ms (${item.blockingDurationMs} ms blocking, ${item.scriptCount} script(s))`).join('; ')}.`}:{ok:true,detail:'Long Animation Frame Timing is supported; no long animation frames were recorded in the observation window.'}):{ok:false,warning:true,detail:'Long Animation Frame Timing is not exposed in this browser. The standard Long Task and Event Timing samples remain available where supported.'});
    const interactionTiming=performanceSnapshot.observedEventTiming;
    add('Main-thread interaction timing',interactionTiming.supported?(interactionTiming.sampleCount?{ok:interactionTiming.p75DurationMs<=200,warning:interactionTiming.p75DurationMs>200,detail:`${interactionTiming.sampleCount} local event sample(s); p75 duration ${interactionTiming.p75DurationMs} ms; input delay ${interactionTiming.p75InputDelayMs??'n/a'} ms; processing ${interactionTiming.p75ProcessingMs??'n/a'} ms; presentation ${interactionTiming.p75PresentationDelayMs??'n/a'} ms. This is not field INP.`}:{ok:true,detail:'Event Timing is supported. No qualifying event samples have been recorded in this page session yet.'}):{ok:false,warning:true,detail:'Event Timing is unavailable in this browser; interaction latency is not inferred.'});
    const resourceProfile=performanceSnapshot.resources;
    add('Resource delivery profile',resourceProfile.sameOriginCount?{ok:true,detail:`${resourceProfile.sameOriginCount} same-origin resource(s); known transfer size ${formatStorageSize(resourceProfile.knownTransferBytes)} across ${resourceProfile.knownTransferCount}; ${resourceProfile.cacheOrTimingUnavailableCount} resource(s) had unavailable/zero transfer sizes. Slowest: ${(resourceProfile.slowest[0]?.path||'not available')}${resourceProfile.slowest[0]?` (${resourceProfile.slowest[0].durationMs} ms)`:''}.`}:{ok:false,warning:true,detail:'No same-origin resource timing entries are available yet.'});
    const launchMeasures=performanceSnapshot.appLaunchMeasures;
    add('Application launch timings',launchMeasures.length?{ok:true,detail:`${launchMeasures.length} app/runtime launch measure(s) found: ${launchMeasures.slice(-6).map(item=>`${item.name.replace(/^curioid:/,'')} ${item.durationMs} ms`).join('; ')}.`}:{ok:false,warning:true,detail:'No measured app launch in this page session yet. Open an app, then rerun diagnostics to include shared-runtime and project launch timings.'});
    add('Page footprint', {ok:true,detail:`${performanceSnapshot.footprint.elementCount.toLocaleString()} DOM element(s), ${performanceSnapshot.footprint.scriptCount} script(s), ${performanceSnapshot.footprint.stylesheetCount} stylesheet(s), ${performanceSnapshot.footprint.iframeCount} iframe(s), ${performanceSnapshot.footprint.imageCount} image(s), ${performanceSnapshot.footprint.canvasCount} canvas(es).`});
    if (typeof projects?.inspectLocalStorage === 'function') {
      try {
        const inventory = await healthTimeout(projects.inspectLocalStorage({maxRecords:8000,budgetMs:4500}),7000,'per-tool storage inventory');
        if (!inventory?.available) add('Per-tool storage inventory',{ok:false,warning:true,detail:inventory?.reason||'Per-tool storage inventory is unavailable in this browser.'});
        else {
          const databases=Array.isArray(inventory.databases)?inventory.databases:[];
          add('Per-tool storage inventory',{ok:true,detail:`${databases.length} known CURIOID database(s), ${inventory.scannedRecords||0} sampled record(s), approximately ${formatStorageSize(inventory.approxBytes||0)}. ${inventory.truncated?'Partial scan.':'Scan complete.'} Backup coverage ${inventory.coverageComplete?'complete':'needs review'}.`});
          for(const database of databases) add(`Storage · ${database.label}`,database.error?{ok:false,warning:true,detail:database.error}:{ok:true,detail:`${database.records} record(s) across ${database.stores} store(s), approximately ${formatStorageSize(database.approxBytes||0)}${database.partial?' (partial scan)':''}.`});
          if(inventory.opfs) add(inventory.opfs.label,inventory.opfs.error?{ok:false,warning:true,detail:inventory.opfs.error}:{ok:true,detail:`${inventory.opfs.files} file(s), ${formatStorageSize(inventory.opfs.bytes)}${inventory.opfs.partial?' (partial scan)':''}.`});
          add('Storage inventory note',{ok:true,detail:inventory.note||'Per-database byte estimates are approximate and do not replace the browser origin-wide quota report.'});
        }
      } catch(error) { add('Per-tool storage inventory',{ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}); }
    } else add('Per-tool storage inventory',{ok:false,warning:true,detail:'Open a CURIOID project once to load the project runtime, then run diagnostics again.'});
    try {
      const backups=await healthTimeout(projects?.inspectBackupArtifacts?.()||Promise.resolve({}),20000,'backup inventory');
      add('Backup recoverability',backups?.verified>0&&!backups.warning?{ok:true,detail:backups.detail}:{ok:false,warning:true,detail:backups?.detail||'No verified backup was found in this browser.'});
    } catch(error) { add('Backup recoverability',{ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}); }
    const supervisorCanary = probeRuntimeSupervisor();
    add('Runtime Supervisor disposal canary',supervisorCanary);
    const lockCanary = await probeWebLocks();
    add('Web Locks serialization canary',lockCanary);
    const downloadCanary = await probeDownloadCanary();
    add('Report/download preparation canary',downloadCanary);
    const reportRunControl=document.querySelector('[data-health-run]'),reportLink=document.querySelector('[data-health-download]');
    const singleReportControl=Boolean(reportRunControl&&reportRunControl===reportLink&&reportLink instanceof HTMLAnchorElement&&getComputedStyle(reportLink).display!=='none'&&reportLink.getAttribute('role')==='button'&&!/health(?:Run|Download)Button\.click\s*\(/.test(siteRuntimeSource));
    add('Single-control TXT report download',singleReportControl
      ?{ok:true,detail:'The same visible anchor runs diagnostics and becomes the TXT download link. The completed Blob URL and download filename are assigned to that element; the next direct user click uses the browser native download action. No synthetic or recursive click is used. The operating-system save result is not observable by page JavaScript.'}
      :{ok:false,detail:'The single visible control is not the same anchor used for the native Blob download, or a synthetic recursive click remains in the runtime.'});
    const brokenImages = [...document.images].filter(image=>image.complete&&image.naturalWidth===0&&image.currentSrc);
    const brokenStylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link=>link.href&&!link.sheet);
    add('Live document resource health',brokenImages.length||brokenStylesheets.length
      ? {ok:false,warning:true,detail:`${brokenImages.length} broken image(s), ${brokenStylesheets.length} unloaded linked stylesheet(s). A stylesheet inserted as a verified <style> node is checked separately.`}
      : {ok:true,detail:`${document.images.length} image element(s) and ${document.querySelectorAll('link[rel="stylesheet"]').length} linked stylesheet(s) checked; no completed broken images or missing linked stylesheets.`});
    const styleStatus = window.CurioidSiteDiagnostics?.getProjectStyleStatus?.() || null;
    const activeProjectStyle = document.querySelector('[data-curioid-project-css][data-loaded="true"]');
    add('Project stylesheet applied in the live document',activeProjectStyle?.sheet
      ? {ok:true,detail:`Verified project style node is present${activeProjectStyle.sheet.cssRules?`; ${activeProjectStyle.sheet.cssRules.length.toLocaleString()} CSS rule(s) are active`:''}.`}
      : {ok:false,warning:true,detail:styleStatus?.error||'The verified project stylesheet is not currently applied. Open a project or rerun the diagnostic after its style loader completes.'});
    const cspEvents = diagnosticEvents.filter(item=>item.type==='csp-violation');
    const resourceErrors = diagnosticEvents.filter(item=>item.type==='resource-error');
    add('Observed CSP and resource-load failures',cspEvents.length||resourceErrors.length
      ? {ok:false,warning:true,detail:`${cspEvents.length} CSP violation(s), ${resourceErrors.length} resource load error(s) observed since Health Check initialized. Recent events are included in the report.`}
      : {ok:true,detail:'No CSP violations or captured resource-load errors have been observed since Health Check initialized. This is a session-local observation window.'});
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    const notRestored = navigationEntry?.notRestoredReasons || null;
    add('Back/forward cache and page lifecycle',notRestored
      ? {ok:false,warning:true,detail:`The browser exposes notRestoredReasons for this navigation: ${safeJson(notRestored).slice(0,360)}.`}
      : {ok:true,detail:'No browser-provided BFCache exclusion reasons are exposed for this navigation. Actual browser shutdown/restart and long-running tab behavior still require a real browser session.'});
    const manualOnly = 'Now automated by this button: all seven category bundles through the production SRI loader; current worker update preflight; shell-cache completeness; release/SRI/CSP checks; disposable IndexedDB transaction rollback; OPFS staged commit/cleanup; storage/API canaries; runtime-scope cleanup; static HTML sink inventory; and temporary probe cleanup. Still owner-dependent: publish this ZIP to GitHub Pages; confirm physical iOS/Android and private-browser rendering; verify the OS save prompt/destination permissions; test true process termination and multi-hour restore/tab stability; verify actual operating-system download handling; decide about cloud sync/sign-in/analytics.';
    add('Remaining owner-dependent verification',{ok:true,detail:manualOnly});
    const cleanup = await cleanupOwnedHealthProbes();
    maintenance.temporaryProbeCleanup = cleanup; maintenance.completedAt = new Date().toISOString();
    add('Automatic safe probe cleanup',{ok:true,detail:`Removed ${cleanup.caches} abandoned diagnostic Cache Storage probe(s), ${cleanup.databases} abandoned diagnostic IndexedDB probe(s), and ${cleanup.opfsFiles} abandoned diagnostic OPFS probe file(s). Only reserved Health Check temporary names were eligible; user data was not touched.`});
    add('Browser connectivity',navigator.onLine?{ok:true,detail:'The browser currently reports online status; this is not an end-to-end Internet reachability test.'}:{ok:false,warning:true,detail:'The browser currently reports offline status.'});
    const failed=rows.filter(row=>!row.ok&&!row.warning).length;
    const warnings=rows.filter(row=>row.warning).length;
    const passed=rows.filter(row=>row.ok).length;
    const statusText=`${passed}/${rows.length} checks passed · ${warnings} warning(s) · ${failed} issue(s). Results stay in this browser.`;
    paintHealthResults(rows,statusText,failed?'ISSUES FOUND':warnings?'CHECKED WITH WARNINGS':'HEALTHY');
    if(healthDetailsSummary) healthDetailsSummary.textContent=`View detailed results (${rows.length} checks)`;
    if(healthRunButton){healthRunButton.disabled=false;healthRunButton.textContent='Run again';}
    if(healthRepairButton) healthRepairButton.disabled=!navigator.serviceWorker;
    lastHealthReport=makeHealthReport(rows,assetMeta,registration,cacheNames,estimate,persisted,performanceSnapshot,cacheInventory,publishedSiteSnapshot,performance.now()-diagnosticsStartedAt);
    prepareReportDownload();
    return rows;
  }
      async function runSafe(runOptions = {}) {
        const safeOptions = runOptions && typeof runOptions === 'object' ? runOptions : {};
        try { return await runCurioidHealthCheck(safeOptions); }
        catch(error) {
          const message=String(error?.message||error).slice(0,260);
          const completed = activeDiagnosticRows.slice();
          completed.push({label:'Diagnostics execution',ok:false,detail:message});
          paintHealthResults(completed,'Diagnostics could not finish. Download the partial report and send it for investigation.','INCOMPLETE');
          lastHealthReport={title:'CURIOID PARTIAL HEALTH REPORT',generatedAt:new Date().toISOString(),release:document.querySelector('meta[name="curioid-release"]')?.content||document.querySelector('.site-version')?.textContent?.trim()||'unknown',page:{url:location.origin+location.pathname,title:document.title},diagnosticSupport:{longTask:!!longTaskObserver,eventTiming:!!eventTimingObserver,lcp:!!lcpObserver,layoutShift:!!layoutShiftObserver,longAnimationFrame:!!longAnimationFrameObserver},checks:completed,lastAssetFailure:window.__CURIOID_LAST_ASSET_LOAD_FAILURE||null,recentErrors:diagnosticEvents.slice(-40),maintenance:window.__CURIOID_HEALTH_MAINTENANCE||null,privacy:'No cookies, passwords, localStorage contents, database records, files or project content included.'};
          prepareReportDownload();
          if(healthRepairButton) healthRepairButton.disabled=!navigator.serviceWorker;
          if(healthDetailsSummary) healthDetailsSummary.textContent=`View partial diagnostic results (${completed.length} checks)`;
          return [];
        } finally {
          if(healthRunButton){healthRunButton.disabled=false;if(healthRunButton.textContent==='Checking…')healthRunButton.textContent='Run again';}
        }
      }
      async function refreshServiceWorkerRegistration() {
        if(!navigator.serviceWorker){paintHealthResults([{label:'Service-worker registration',ok:false,warning:true,detail:'Service workers are not available in this browser context.'}],'The browser cannot refresh the offline shell here. Saved data was not changed.','UNAVAILABLE');return;}
        if(healthRepairButton){healthRepairButton.disabled=true;healthRepairButton.textContent='Refreshing…';}
        try {
          const registration=await navigator.serviceWorker.register(new URL(`service-worker-current.js?release=${EXPECTED_RELEASE}`,deploymentBase).href,{scope:deploymentBase.pathname,updateViaCache:'none'});
          await healthTimeout(registration.update(),12000,'service-worker update check');
          if(registration.installing){const worker=registration.installing;await healthTimeout(new Promise(resolve=>{if(['installed','activated','redundant'].includes(worker.state))return resolve();const done=()=>{worker.removeEventListener('statechange',onState);resolve();};const onState=()=>{if(['installed','activated','redundant'].includes(worker.state))done();};worker.addEventListener('statechange',onState);}),12000,'new service-worker installation');}
          if(registration.waiting){
            const previous=navigator.serviceWorker.controller,waiting=registration.waiting;
            const activated=await healthTimeout(new Promise(resolve=>{let finished=false;const finish=value=>{if(finished)return;finished=true;navigator.serviceWorker.removeEventListener('controllerchange',onChange);navigator.serviceWorker.removeEventListener('message',onMessage);waiting.removeEventListener('statechange',onState);resolve(value);};const onChange=()=>{if(navigator.serviceWorker.controller&&navigator.serviceWorker.controller!==previous)finish(true);};const onMessage=event=>{if(event.data?.type==='CURIOID_UPDATE_BLOCKED')finish({blocked:true,openTabs:event.data.openTabs});};const onState=()=>{if(waiting.state==='activated')finish(true);};navigator.serviceWorker.addEventListener('controllerchange',onChange);navigator.serviceWorker.addEventListener('message',onMessage);waiting.addEventListener('statechange',onState);waiting.postMessage({type:'CURIOID_ACTIVATE_UPDATE'});}),12000,'service-worker activation');
            if(activated===true){paintHealthResults([{label:'Service-worker registration',ok:true,detail:'The updated offline shell is active. Your local storage and saved project data were not cleared.'}],'The new offline shell is active. Reloading CURIOID so every stylesheet and project bundle comes from the same release.','UPDATED');setTimeout(()=>location.reload(),220);return;}
            if(activated?.blocked)throw new Error(`The update is ready but could not activate safely. Close ${activated.openTabs?Math.max(1,activated.openTabs-1):'other'} other CURIOID tab(s), then retry.`);
          }
          paintHealthResults([{label:'Service-worker registration',ok:true,detail:`Update check completed. Active: ${Boolean(registration.active)}; waiting: ${Boolean(registration.waiting)}; controller: ${Boolean(navigator.serviceWorker.controller)}. No saved data or caches were deleted.`}],'The service-worker registration was refreshed. No update was waiting, or the page is not currently controlled by an older worker.','CHECKED');
        } catch (error) {
          paintHealthResults([{label:'Service-worker registration',ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}],'The browser could not complete the update/refresh. Saved projects and browser storage were not changed.','UNAVAILABLE');
        } finally { if(healthRepairButton&&healthRepairButton.isConnected){healthRepairButton.disabled=false;healthRepairButton.textContent='Refresh service-worker registration';} }
      }
      return Object.freeze({ run:runSafe, refresh:refreshServiceWorkerRegistration });
    }
  root.CurioidHealthCheck = Object.freeze({ create });
})(window);
