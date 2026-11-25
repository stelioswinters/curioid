/* CURIOID v1.307 lazy Health Check module. Runs only when requested. */
(function (root) {
  'use strict';
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
  const diagnosticEvents = [];
  const observedLongTasks = [];
  const observedEventTimings = [];
  let longTaskObserver = null;
  let eventTimingObserver = null;
  try {
    if (typeof PerformanceObserver === 'function' && (PerformanceObserver.supportedEntryTypes || []).includes('longtask')) {
      longTaskObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          observedLongTasks.push({ startTimeMs:Math.round(entry.startTime), durationMs:Math.round(entry.duration) });
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
            presentationDelayMs:Number.isFinite(processingEnd) ? Math.max(0,Math.round(start+duration-processingEnd)) : null
          };
          observedEventTimings.push(sample);
          if (observedEventTimings.length > 200) observedEventTimings.shift();
        }
      });
      eventTimingObserver.observe({ type:'event', buffered:true, durationThreshold:16 });
    }
  } catch (_) { eventTimingObserver = null; }
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
      return { ok:true, detail:'Temporary OPFS create/write/read probe passed; the probe file is removed after verification.' };
    } catch (error) {
      return { ok:false, warning:true, detail:String(error?.message || error).slice(0,220) };
    } finally {
      try { await root?.removeEntry(name); } catch (_) {}
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
      const response = await healthTimeout(fetch(url.href, { method:'GET', cache:'no-store', credentials:'same-origin' }), 10000, `${file} request`);
      const contentType = response.headers.get('content-type') || 'not supplied';
      if (!response.ok) return { ok:false, detail:`HTTP ${response.status} ${response.statusText || ''}; ${contentType}; URL ${response.url || url.href}`.trim() };
      const bytes = await healthTimeout(response.arrayBuffer(), 12000, `${file} download`);
      const size = bytes.byteLength;
      if (!window.crypto?.subtle?.digest) return { ok:false, warning:true, detail:`HTTP ${response.status}; ${contentType}; ${size.toLocaleString()} bytes; Web Crypto SHA-256 unavailable.` };
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      const matches = actual === expectedHash;
      const looksLikeHtml = /text\/html/i.test(contentType) || new TextDecoder().decode(bytes.slice(0,120)).trimStart().toLowerCase().startsWith('<!doctype html');
      const kindLooksRight = expectedKind === 'js' ? /javascript|ecmascript/i.test(contentType) : expectedKind === 'css' ? /text\/css/i.test(contentType) : expectedKind === 'html' ? looksLikeHtml : true;
      const contentLooksRight = expectedKind === 'html' ? looksLikeHtml : !looksLikeHtml;
      const headers = { cacheControl:response.headers.get('cache-control'), etag:response.headers.get('etag'), age:response.headers.get('age'), cfCacheStatus:response.headers.get('cf-cache-status'), server:response.headers.get('server'), xCache:response.headers.get('x-cache') };
      const details = `HTTP ${response.status}; ${contentType}; ${size.toLocaleString()} bytes; SHA-256 ${matches ? 'MATCH' : 'MISMATCH'}${!contentLooksRight ? `; response content does not match expected ${expectedKind} asset type` : ''}; CF cache ${headers.cfCacheStatus || 'not reported'}; age ${headers.age || 'not reported'}; ${response.redirected ? `redirected to ${response.url}` : 'no redirect'}; ${url.href}`;
      return { ok:matches && contentLooksRight, warning:matches && !kindLooksRight, detail:details, meta:{file,url:url.href,status:response.status,contentType,bytes:size,expectedHash,actualHash:actual,hashMatches:matches,redirected:response.redirected,finalUrl:response.url || url.href,headers} };
    } catch (error) {
      return { ok:false, detail:`${String(error?.message || error).slice(0,220)}; URL ${url.href}` };
    }
  }
  async function probePublishedShell() {
    try {
      const swUrl=new URL('service-worker.js',deploymentBase);
      const swResponse=await healthTimeout(fetch(swUrl.href,{cache:'no-store',credentials:'same-origin'}),8000,'release manifest request');
      if(!swResponse.ok)throw new Error(`Service worker manifest returned HTTP ${swResponse.status}`);
      const swText=await swResponse.text();
      const match=swText.match(/['\"]index\.html['\"]\s*:\s*['\"]([a-f0-9]{64})['\"]/i);
      if(!match)throw new Error('The active service-worker file does not expose an index.html release hash');
      const expected=match[1].toLowerCase();
      const pageUrl=new URL('index.html',deploymentBase);
      pageUrl.searchParams.set('health-check',expected);
      const response=await healthTimeout(fetch(pageUrl.href,{cache:'no-store',credentials:'same-origin'}),10000,'published shell request');
      if(!response.ok)throw new Error(`Published index.html returned HTTP ${response.status}`);
      const bytes=await healthTimeout(response.arrayBuffer(),10000,'published shell download');
      if(!crypto?.subtle?.digest)return {ok:false,warning:true,detail:`index.html HTTP ${response.status}; ${bytes.byteLength.toLocaleString()} bytes; Web Crypto unavailable.`};
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
      const matched=actual===expected;
      const type=response.headers.get('content-type')||'not supplied';
      return {ok:matched,detail:`index.html HTTP ${response.status}; ${type}; ${bytes.byteLength.toLocaleString()} bytes; SHA-256 ${matched?'MATCH':'MISMATCH'}; expected ${expected}; received ${actual}; ${response.redirected?`redirected to ${response.url}`:'no redirect'}.` ,meta:{file:'index.html',url:pageUrl.href,status:response.status,contentType:type,bytes:bytes.byteLength,expectedHash:expected,actualHash:actual,hashMatches:matched,redirected:response.redirected,finalUrl:response.url||pageUrl.href}};
    } catch(error) { return {ok:false,detail:String(error?.message||error).slice(0,240)}; }
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
    const lcpEntries = entries('largest-contentful-paint');
    const shiftEntries = entries('layout-shift');
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
    const cls = shiftEntries.filter(entry=>!entry.hadRecentInput).reduce((sum,entry)=>sum+(Number(entry.value)||0),0);
    const supported = typeof PerformanceObserver==='function' ? (PerformanceObserver.supportedEntryTypes||[]) : [];
    const elementCount = document.getElementsByTagName('*').length;
    return {
      navigation:nav?{
        type:nav.type||null, redirectCount:nav.redirectCount||0,
        responseStartMs:rounded(nav.responseStart), serverResponseWaitMs:rounded(nav.responseStart-nav.requestStart),
        domInteractiveMs:rounded(nav.domInteractive), domContentLoadedMs:rounded(nav.domContentLoadedEventEnd),
        loadEventMs:rounded(nav.loadEventEnd), transferBytes:Number.isFinite(nav.transferSize)&&nav.transferSize>0?Math.round(nav.transferSize):null
      }:null,
      paint:{firstPaintMs:rounded(paint.find(entry=>entry.name==='first-paint')?.startTime),firstContentfulPaintMs:rounded(paint.find(entry=>entry.name==='first-contentful-paint')?.startTime)},
      webVitalsSnapshot:{
        largestContentfulPaintMs:lcp?rounded(lcp.renderTime||lcp.loadTime||lcp.startTime):null,
        cumulativeLayoutShift:shiftEntries.length?rounded(cls,4):null,
        interpretation:'Single-browser, current-navigation snapshot only. Not a field 75th-percentile Core Web Vitals assessment. INP is not inferred from a short local check.',
        guidance:{lcpGoodMs:2500,lcpPoorMs:4000,clsGood:0.1,clsPoor:0.25,inpGoodMs:200,inpPoorMs:500}
      },
      resources:{sameOriginCount:resources.length,knownTransferCount:knownTransfer.length,knownTransferBytes:knownTransfer.reduce((sum,item)=>sum+item.transferBytes,0),cacheOrTimingUnavailableCount:resources.length-knownTransfer.length,slowest:sortedSlow,largest:sortedLarge},
      longTasks:{supported:supported.includes('longtask'),count:uniqueTasks.length,totalDurationMs:uniqueTasks.reduce((sum,item)=>sum+item.durationMs,0),longestDurationMs:uniqueTasks.reduce((max,item)=>Math.max(max,item.durationMs),0),samples:uniqueTasks.slice(-20)},
      observedEventTiming:{supported:supported.includes('event'),sampleCount:uniqueEventSamples.length,p75DurationMs:eventP75,p75InputDelayMs:eventP75Of('inputDelayMs'),p75ProcessingMs:eventP75Of('processingMs'),p75PresentationDelayMs:eventP75Of('presentationDelayMs'),slowest:slowEvents,interpretation:'Local Event Timing samples from the current page session. This is not a field 75th-percentile INP metric; no event targets, form values or entered text are collected.'},
      appLaunchMeasures:measures.filter(item=>/project-launch|shared-assets|project-css|project-js|project-category-/.test(item.name)),
      categoryRuntime:{loaded:projects?.getLoadedCategories?.()||[],known:['operating-systems','strange-archives','web-experiments','tiny-games','digital-art','sound-motion','creative-tools']},
      footprint:{elementCount,scriptCount:document.scripts.length,stylesheetCount:document.styleSheets.length,iframeCount:document.querySelectorAll('iframe').length,imageCount:document.images.length,canvasCount:document.querySelectorAll('canvas').length},
      observerSupport:{longtask:supported.includes('longtask'),largestContentfulPaint:supported.includes('largest-contentful-paint'),layoutShift:supported.includes('layout-shift'),event:supported.includes('event')}
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
  function makeHealthReport(rows, assetMeta, registration, cacheNames, estimate, persisted, performanceSnapshot, cacheInventory) {
    const runtime = window.CurioidRuntimeSupervisor?.getStatus?.() || null;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const screenInfo = { width:screen.width||null, height:screen.height||null, pixelRatio:window.devicePixelRatio||1, viewportWidth:innerWidth, viewportHeight:innerHeight };
    const projects = window.CurioidProjects || null;
    const report = {
      title:'CURIOID LOCAL HEALTH & DELIVERY REPORT',
      generatedAt:new Date().toISOString(),
      release:document.querySelector('.site-version')?.textContent?.trim() || 'unknown',
      page:{ url:location.origin+location.pathname, origin:location.origin, pathname:location.pathname, canonical:(()=>{try{const u=new URL(document.querySelector('link[rel="canonical"]')?.href||location.href);return u.origin+u.pathname;}catch(_){return null;}})(), secureContext:isSecureContext, online:navigator.onLine },
      browser:{ userAgent:navigator.userAgent, platform:navigator.platform || 'not supplied', vendor:navigator.vendor || 'not supplied', language:navigator.language || 'not supplied', languages:navigator.languages || [], screen:screenInfo, hardwareConcurrency:navigator.hardwareConcurrency || null, deviceMemory:navigator.deviceMemory || null, connection:connection ? { effectiveType:connection.effectiveType||null, downlink:connection.downlink||null, rtt:connection.rtt||null, saveData:!!connection.saveData } : null },
      capabilities:{ fetch:typeof fetch==='function', webCrypto:!!crypto?.subtle, serviceWorker:!!navigator.serviceWorker, cacheStorage:!!window.caches, indexedDB:!!window.indexedDB, opfs:typeof navigator.storage?.getDirectory==='function', localStorage:(()=>{try{return !!window.localStorage;}catch(_){return false;}})(), sessionStorage:(()=>{try{return !!window.sessionStorage;}catch(_){return false;}})(), workers:typeof Worker==='function', canvas:!!document.createElement('canvas').getContext('2d'), webgl:(()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch(_){return false;}})(), webAudio:!!(window.AudioContext||window.webkitAudioContext), wasm:typeof WebAssembly==='object' },
      runtime:{ projectCodeLoaded:!!projects, projectCount:projects?.ids?.length || document.querySelectorAll('.room-window[data-room]').length || 0, osIds:projects?.ids?.filter(id=>['dead-interface','food-alchemy','echonoise-os','umbra-os','aether-os','aura-synthesis'].includes(id)) || [], supervisor:runtime, lastAssetFailure:window.__CURIOID_LAST_ASSET_LOAD_FAILURE || null },
      serviceWorker:{ supported:!!navigator.serviceWorker, controller:navigator.serviceWorker?.controller?.scriptURL || null, registration:registration ? { scope:registration.scope, active:registration.active?.scriptURL || null, waiting:registration.waiting?.scriptURL || null, installing:registration.installing?.scriptURL || null, updateViaCache:registration.updateViaCache || null } : null },
      delivery:{ csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null, baseUri:deploymentBase.href, referrerPolicy:document.querySelector('meta[name="referrer"]')?.content || null, lastAssetFailure:window.__CURIOID_LAST_ASSET_LOAD_FAILURE || null },
      cacheStorage:{ names:cacheNames, totalCaches:cacheNames.length, inventory:cacheInventory || null },
      storage:{ estimate:estimate ? { usageBytes:estimate.usage ?? null, quotaBytes:estimate.quota ?? null, usageDetails:estimate.usageDetails || null, usageRatio:Number.isFinite(estimate.usage)&&Number.isFinite(estimate.quota)&&estimate.quota>0?rounded(estimate.usage/estimate.quota,4):null } : null, persistent:persisted ?? null },
      performance:performanceSnapshot || collectPerformanceSnapshot(),
      releaseAssets:assetMeta,
      checks:rows.map(row=>({label:String(row.label||''),ok:!!row.ok,warning:!!row.warning,detail:String(row.detail||'')})),
      loadedScriptTags:[...document.scripts].map(node=>({src:(()=>{try{const u=new URL(node.src);return u.origin+u.pathname;}catch(_){return null;}})(),integrity:node.integrity||null,async:!!node.async,defer:!!node.defer})).filter(node=>node.src),
      resourceTimings:(performanceSnapshot?.resources?.slowest||[]).map(item=>({...item})),
      recentErrors:diagnosticEvents.slice(-24),
      privacy:'Generated locally on request. Contains technical environment, same-origin asset paths without query strings, timing summaries, storage estimates and error messages. It does not include cookies, passwords, form values, localStorage contents, database records, files or project content. Nothing is uploaded automatically.'
    };
    return report;
  }
  function downloadHealthReport() {
    if (!lastHealthReport) return;
    const lines = [
      'CURIOID HEALTH CHECK REPORT',
      '===========================',
      `Generated: ${lastHealthReport.generatedAt}`,
      `Release: ${lastHealthReport.release}`,
      `Page: ${lastHealthReport.page.url}`,
      '',
      'SUMMARY',
      '-------',
      lastHealthReport.checks.map(row => `${row.ok ? 'PASS' : row.warning ? 'WARN' : 'FAIL'}  ${row.label}\n      ${row.detail}`).join('\n'),
      '',
      'FULL TECHNICAL DETAILS',
      '----------------------',
      safeJson(lastHealthReport),
      '',
      'PRIVACY',
      lastHealthReport.privacy
    ].join('\n');
    const blob = new Blob([lines], { type:'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `CURIOID-Health-Report-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
  async function runCurioidHealthCheck() {
    if (healthRunButton) { healthRunButton.disabled = true; healthRunButton.textContent = 'Checking…'; }
    if (healthRepairButton) healthRepairButton.disabled = true;
    if (healthDownloadButton) healthDownloadButton.disabled = true;
    paintHealthResults([], 'Running local checks. Temporary probes are removed after use.', 'CHECKING');
    const rows = [], assetMeta = [];
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
    const projects = window.CurioidProjects;
    const roomCount = document.querySelectorAll('.room-window[data-room]').length;
    const osIds = ['dead-interface','food-alchemy','echonoise-os','umbra-os','aether-os','aura-synthesis'];
    const osBootReady = osIds.every(id => projects?.ids?.includes(id));
    add('Secure context', isSecureContext ? {ok:true,detail:'The page is running in a secure context.'} : {ok:false,detail:'HTTPS is required for service workers and several storage APIs.'});
    add('Page and catalogue', roomCount ? {ok:true,detail:`${roomCount} project room(s) are present in the page.`} : {ok:false,detail:'No project rooms were found in the page.'});
    add('Project runtime state', projects ? {ok:true,detail:`Project code initialized with ${projects.ids?.length||0} catalogue ID(s).`} : {ok:false,warning:true,detail:`Project code is not initialized in this tab. ${window.__CURIOID_LAST_ASSET_LOAD_FAILURE ? 'A previous runtime asset load failure is recorded below.' : 'This is normal until a project is opened; asset delivery is tested independently below.'}`});
    const shellSource=[...document.scripts].map(node=>node.textContent||'').join('\n');
    const runtimeAssetDeclaration=shellSource.match(/file:\s*["']projects-core\.v1\.307\.js["'][^}]*integrity:\s*["'](sha384-[^"']+)["']/);
    const expectedRuntimeSri='sha384-mORhBq6grWLqf8DhWbgXNqrpEY70QVCV9WbWuGZxoii3zKSE7+N7pWStXspU5uqO';
    const sriConfigured=shellSource.includes('element.integrity = integrity') && shellSource.includes('element.crossOrigin = "anonymous"') && runtimeAssetDeclaration?.[1]===expectedRuntimeSri;
    add('Project runtime SRI policy',sriConfigured?{ok:true,detail:'The shared core loader sets the release SHA-384 integrity value and anonymous CORS mode before requesting the script.'}:{ok:false,detail:'The expected SRI/CORS loader contract was not found in the page script.'});
    add('OS boot contracts', projects ? (osBootReady ? {ok:true,detail:'All six OS project IDs are catalogued; their category modules load on demand.'} : {ok:false,detail:`One or more expected OS modules are missing. Found: ${(projects.ids||[]).filter(id=>osIds.includes(id)).join(', ')||'none'}.`}) : {ok:false,warning:true,detail:'Not evaluated because the shared project core has not initialized in this tab.'});
    const runtime = window.CurioidRuntimeSupervisor?.getStatus?.();
    add('Application lifecycle', runtime ? (runtime.cleanupFailures ? {ok:false,detail:`${runtime.activeScopes} active scope(s); ${runtime.cleanupFailures} cleanup issue(s) recorded this session.`} : {ok:true,detail:`${runtime.activeScopes} active scope(s), ${runtime.activeResources} tracked resource(s), no cleanup errors recorded.`}) : {ok:false,warning:true,detail:'Runtime Supervisor is not available yet.'});
    const registration = await (navigator.serviceWorker?.getRegistration?.().catch(()=>null) || Promise.resolve(null));
    const cacheNames = await (window.caches?.keys?.().catch(()=>[]) || Promise.resolve([]));
    const cacheInventory = await collectCacheInventory(cacheNames);
    const hasCache = cacheNames.some(name=>name.includes('curioid-shell'));
    add('Service-worker registration', !navigator.serviceWorker ? {ok:false,warning:true,detail:'Service workers are unavailable in this browser.'} : registration?.active ? {ok:true,detail:`Active: ${registration.active.scriptURL}; scope: ${registration.scope}; waiting update: ${Boolean(registration.waiting)}; controller: ${Boolean(navigator.serviceWorker.controller)}.`} : {ok:false,warning:true,detail:'No active CURIOID service worker is registered for this scope.'});
    add('Offline cache presence', hasCache ? {ok:true,detail:`${cacheNames.filter(name=>name.includes('curioid-shell')).length} CURIOID shell cache(s) found: ${cacheNames.filter(name=>name.includes('curioid-shell')).join(', ')}.`} : {ok:false,warning:true,detail:'No CURIOID shell cache found yet. It is created after the service worker installs successfully.'});
    add('Offline cache inventory',cacheInventory.available?{ok:true,detail:`${cacheInventory.totalCaches} browser cache(s), ${cacheInventory.totalEntries} cached request(s) inventoried. Names and counts only; no cached content was opened or changed.`}:{ok:false,warning:true,detail:'Cache Storage inventory is unavailable.'});
    const releaseAssets = [
      ['Shared project core','projects-core.v1.307.js','501791dae05b39dcdf83163f036a12e71ba05b2059f0236e1be71553bfaad286','js'],
      ['Project stylesheet','projects-v1.304.css','9f6232f165a914d57d5412ea25bdd9813b87f19641bd716ee860386ae771f03d','css'],
      ['Operating Systems category bundle','projects-category-operating-systems.v1.307.js','cb2383349bec43378236ad59dcc4f948e8dd45f03349a3045f7a2c627c608736','js'],
      ['Strange Archives category bundle','projects-category-strange-archives.v1.307.js','a6a6b661bc8ef2a8647e1f4e469d55631632dc1c29ce8d9377bcb455c0ea0d8d','js'],
      ['Web Experiments category bundle','projects-category-web-experiments.v1.307.js','ae88c87efe9f1feb00e7d2755a9f75fe63841a65666a6831a482ca90d93abec1','js'],
      ['Tiny Games category bundle','projects-category-tiny-games.v1.307.js','b045fdee6f01ac155c7575b032d4dec9811a3dd0e0f6774811e3555b7d448e4e','js'],
      ['Digital Art category bundle','projects-category-digital-art.v1.307.js','4d77665ecbc20f4b4edd667e071c75bc479c8ac087de1d3ee2e733fc84abba0d','js'],
      ['Sound Motion category bundle','projects-category-sound-motion.v1.307.js','ae9499c544e79c1855a754bd98b5f83c8b94c363b98e4402ca2d95ca0129bcaf','js'],
      ['Creative Tools category bundle','projects-category-creative-tools.v1.307.js','2edd951334864b255c6106815d93cc569d6121af5a4d0283b414b3da0ac3fb26','js'],
      ['Music & Audio apps page','music-audio-apps.html','8c0285587a561c0db1116af930f221a261d66ad46d51044f1e978d72dc82055b','html'],
      ['Applications & Tools apps page','applications-tools-apps.html','8d2573eb366470d1b69bbfd88a7d8e890030ab5b6080fde2fc362d118be48e39','html'],
      ['Vocal Lexicon asset','vocal-lexicon.js','1b5387a69ce496bc42b30b1fececb1678e2a259a029df3242535d4f41308b32a','js'],
      ['Health Check module','health-check-v1.307.js','b1a36b1aec310d0e06d031e2cea519859955840d35790fce183bdad03840a381','js'],
      ['Curioids page','curioids.html','d7428edefd11708b748891a93757894793e3fa0d091ebb6a89faab4d97554a9e','html'],
    ];
        const releaseResults = await Promise.all(releaseAssets.map(([label,file,hash,kind]) =>
      probeReleaseAsset(file, hash, kind).then(result => ({label,file,result}))
    ));
    for (const {label,file,result} of releaseResults) {
      assetMeta.push(result.meta || {file,url:new URL(file,deploymentBase).href,error:result.detail});
      add(label, result);
    }
    try {
      const swUrl = new URL('service-worker.js', deploymentBase);
      const swResponse = await healthTimeout(fetch(swUrl.href, {cache:'no-store',credentials:'same-origin'}), 8000, 'Service-worker file request');
      const swText = swResponse.ok ? await swResponse.text() : '';
      const swValid = swResponse.ok && swText.includes('CURIOID v1.307 offline shell') && swText.includes('CACHE_NAME');
      add('Service-worker file delivery', swValid ? {ok:true,detail:`HTTP ${swResponse.status}; release marker v1.307 found; ${swText.length.toLocaleString()} characters.`} : {ok:false,detail:`HTTP ${swResponse.status}; release marker missing or response was not a valid v1.307 service worker; ${swResponse.headers.get('content-type')||'content type not supplied'}.`});
    } catch(error) { add('Service-worker file delivery',{ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}); }
    const shellIntegrity=await probePublishedShell();
    if(shellIntegrity.meta)assetMeta.push(shellIntegrity.meta);
    add('Published page integrity',shellIntegrity);
    const canonical=document.querySelector('link[rel=\"canonical\"]')?.href;
    let canonicalAligned=false;
    try{const canonicalUrl=new URL(canonical||location.href);canonicalAligned=canonicalUrl.origin===location.origin&&canonicalUrl.pathname.replace(/\/$/,'')===location.pathname.replace(/\/$/,'');}catch(_){}
    add('Canonical deployment alignment',canonicalAligned?{ok:true,detail:'Canonical URL and current page use the same origin and deployment path.'}:{ok:false,warning:true,detail:`Canonical URL may point to a different origin or path: ${canonical||'not set'}. This can affect asset fallback and indexing.`});
    const estimate = await (navigator.storage?.estimate?.().catch(()=>null) || Promise.resolve(null));
    const usage = Number.isFinite(estimate?.usage) ? formatStorageSize(estimate.usage) : 'unavailable';
    const quota = Number.isFinite(estimate?.quota) ? formatStorageSize(estimate.quota) : 'unavailable';
    const usageRatio=Number.isFinite(estimate?.usage)&&Number.isFinite(estimate?.quota)&&estimate.quota>0?estimate.usage/estimate.quota:null;
    add('Storage quota estimate', estimate ? usageRatio!==null&&usageRatio>=0.9?{ok:false,warning:true,detail:`Origin-wide usage is about ${Math.round(usageRatio*100)}% (${usage} of ${quota}). This is a high-pressure warning, not an exact browser eviction threshold.`}:usageRatio!==null&&usageRatio>=0.8?{ok:false,warning:true,detail:`Origin-wide usage is about ${Math.round(usageRatio*100)}% (${usage} of ${quota}). Review backups and unused temporary data before adding large files.`}:{ok:true,detail:`Origin-wide estimate: ${usage} used of ${quota}${usageRatio!==null?` (${Math.round(usageRatio*100)}%)`:''}. This is not per-app accounting.`} : {ok:false,warning:true,detail:'Browser storage estimate is unavailable.'});
    const persisted = await navigator.storage?.persisted?.().catch(()=>null);
    add('Persistent storage protection', persisted === true ? {ok:true,detail:'The browser reports persistent storage protection is enabled for this origin.'} : persisted === false ? {ok:false,warning:true,detail:'Persistent storage protection is not enabled. Browser cleanup policies may remove local data.'} : {ok:false,warning:true,detail:'This browser does not expose the persistent-storage status.'});
    const localStorageResult = await (async()=>{try{return await probeWebStorage(window.localStorage,'localStorage');}catch(error){return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)};}})();
    const sessionStorageResult = await (async()=>{try{return await probeWebStorage(window.sessionStorage,'sessionStorage');}catch(error){return {ok:false,warning:true,detail:String(error?.message||error).slice(0,220)};}})();
    add('Local storage', localStorageResult);
    add('Session storage', sessionStorageResult);
    const [idb,opfs,cacheProbe,workerProbe] = await Promise.all([probeTemporaryIndexedDB(),probeOpfs(),probeCacheStorage(),probeWorker()]);
    add('IndexedDB read/write',idb); add('OPFS read/write',opfs); add('Cache Storage read/write',cacheProbe); add('Web Worker execution',workerProbe);
    const canvas = document.createElement('canvas');
    add('Canvas 2D rendering', canvas.getContext('2d') ? {ok:true,detail:'Canvas 2D context is available.'} : {ok:false,warning:true,detail:'Canvas 2D is unavailable.'});
    let webgl = false;
    try { const glCanvas=document.createElement('canvas'); const gl=glCanvas.getContext('webgl2')||glCanvas.getContext('webgl'); webgl=!!gl; gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
    add('WebGL graphics',webgl ? {ok:true,detail:'WebGL context creation succeeded.'} : {ok:false,warning:true,detail:'WebGL is unavailable or disabled. Some visual projects may use 2D fallbacks.'});
    add('Web Audio', (window.AudioContext||window.webkitAudioContext) ? {ok:true,detail:'Web Audio API is available; no audio context was started by this probe.'} : {ok:false,warning:true,detail:'Web Audio API is unavailable.'});
    add('WebAssembly', typeof WebAssembly==='object' ? {ok:true,detail:'WebAssembly is available.'} : {ok:false,warning:true,detail:'WebAssembly is unavailable.'});
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
    add('Content Security Policy', csp && csp.includes("object-src 'none'") && csp.includes("base-uri 'none'") && csp.includes("script-src 'self'") && !csp.includes("'unsafe-eval'") ? {ok:true,detail:'A restrictive meta CSP is present; object-src, base-uri and script execution are constrained.'} : {ok:false,warning:true,detail:'The expected restrictive Content-Security-Policy was not found or has been weakened.'});
    const manifestResponse = await (async()=>{try{return await healthTimeout(fetch(new URL('manifest.webmanifest',deploymentBase).href,{cache:'no-store',credentials:'same-origin'}),6000,'PWA manifest');}catch(error){return {ok:false,error};}})();
    if (manifestResponse?.ok === false) add('PWA manifest',{ok:false,warning:true,detail:String(manifestResponse.error?.message||manifestResponse.error||'Manifest request failed').slice(0,220)});
    else {
      try { const manifest=await manifestResponse.json(); add('PWA manifest',manifest?.name&&manifest?.start_url?{ok:true,detail:`Manifest loaded; name “${String(manifest.name).slice(0,80)}”; start URL ${String(manifest.start_url).slice(0,120)}.`}:{ok:false,warning:true,detail:'Manifest loaded but required name or start_url fields are missing.'}); }
      catch(error) { add('PWA manifest',{ok:false,detail:`Manifest response could not be parsed: ${String(error?.message||error).slice(0,180)}`}); }
    }
    const browserApis = { ResizeObserver:typeof ResizeObserver==='function', IntersectionObserver:typeof IntersectionObserver==='function', BroadcastChannel:typeof BroadcastChannel==='function', AbortController:typeof AbortController==='function', CompressionStream:typeof CompressionStream==='function', FileSystemAccess:typeof showOpenFilePicker==='function', WebShare:typeof navigator.share==='function', Clipboard:!!navigator.clipboard?.writeText, Notifications:typeof Notification==='function' };
    const optionalMissing=Object.entries(browserApis).filter(([,available])=>!available).map(([name])=>name);
    add('Optional browser APIs',{ok:optionalMissing.length===0,warning:optionalMissing.length>0,detail:`Available: ${Object.entries(browserApis).filter(([,available])=>available).map(([name])=>name).join(', ')||'none'}. Not available: ${optionalMissing.join(', ')||'none'}. Some are optional or permission-gated.`});
    const buttons=[...document.querySelectorAll('button')];
    const unlabeledButtons=buttons.filter(button=>!(button.getAttribute('aria-label')||button.getAttribute('title')||button.innerText||button.textContent||'').trim());
    const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);
    const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
    const a11yIssues=[];
    if(!document.documentElement.lang) a11yIssues.push('document language missing');
    if(!document.title.trim()) a11yIssues.push('document title missing');
    if(unlabeledButtons.length) a11yIssues.push(`${unlabeledButtons.length} button(s) have no accessible name`);
    if(duplicateIds.length) a11yIssues.push(`${duplicateIds.length} duplicate ID value(s)`);
    add('Accessibility foundations',a11yIssues.length?{ok:false,warning:true,detail:a11yIssues.join('; ')}:{ok:true,detail:`Document language/title present; ${buttons.length} buttons checked for accessible names; no duplicate IDs detected.`});
    const performanceSnapshot = collectPerformanceSnapshot();
    const navPerf = performanceSnapshot.navigation;
    add('Navigation performance',navPerf?{ok:true,detail:`Response wait ${navPerf.serverResponseWaitMs??'n/a'} ms; DOM interactive ${navPerf.domInteractiveMs??'n/a'} ms; DOMContentLoaded ${navPerf.domContentLoadedMs??'n/a'} ms; load event ${navPerf.loadEventMs??'n/a'} ms. These are this page's navigation timings.`}:{ok:false,warning:true,detail:'Navigation Timing is unavailable in this browser.'});
    const fcp = performanceSnapshot.paint.firstContentfulPaintMs;
    const lcp = performanceSnapshot.webVitalsSnapshot.largestContentfulPaintMs;
    const cls = performanceSnapshot.webVitalsSnapshot.cumulativeLayoutShift;
    const vitalsParts = [`FCP ${fcp===null?'not exposed':`${fcp} ms`}`,`LCP ${lcp===null?'not exposed':`${lcp} ms`}`,`CLS ${cls===null?'not exposed':cls}`];
    const lcpPoor = lcp!==null && lcp>4000;
    const clsPoor = cls!==null && cls>0.25;
    const lcpWatch = lcp!==null && lcp>2500;
    const clsWatch = cls!==null && cls>0.1;
    const vitalsMissing = lcp===null || cls===null;
    add('Core Web Vitals snapshot',lcpPoor||clsPoor?{ok:false,detail:`${vitalsParts.join(' · ')}. Snapshot indicates a slow LCP or elevated layout shift.`}:lcpWatch||clsWatch?{ok:false,warning:true,detail:`${vitalsParts.join(' · ')}. One or more local snapshots are above the recommended good range.`}:vitalsMissing?{ok:false,warning:true,detail:`${vitalsParts.join(' · ')}. Some browsers do not expose every metric or may not have emitted an LCP/layout-shift entry yet.`}:{ok:true,detail:`${vitalsParts.join(' · ')}. Local navigation snapshot only, not field percentile data.`});
    const longTask = performanceSnapshot.longTasks;
    add('Main-thread long tasks',longTask.supported?(longTask.count?{ok:false,warning:true,detail:`${longTask.count} long task(s) of 50 ms or more observed; longest ${longTask.longestDurationMs} ms; sampled total ${longTask.totalDurationMs} ms.`}:{ok:true,detail:'Long-task observation is supported; no long tasks of 50 ms or more were observed in the available timeline.'}):{ok:false,warning:true,detail:'This browser does not expose Long Task Timing. Absence of this API is not a failure.'});
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
      const backups=await healthTimeout(projects?.inspectBackupArtifacts?.()||Promise.resolve({}),12000,'backup inventory');
      add('Backup recoverability',backups?.verified>0&&!backups.warning?{ok:true,detail:backups.detail}:{ok:false,warning:true,detail:backups?.detail||'No verified backup was found in this browser.'});
    } catch(error) { add('Backup recoverability',{ok:false,warning:true,detail:String(error?.message||error).slice(0,220)}); }
    add('Browser connectivity',navigator.onLine?{ok:true,detail:'The browser currently reports an online connection.'}:{ok:false,warning:true,detail:'The browser currently reports offline status.'});
    const failed=rows.filter(row=>!row.ok&&!row.warning).length;
    const warnings=rows.filter(row=>row.warning).length;
    const passed=rows.filter(row=>row.ok).length;
    const statusText=`${passed}/${rows.length} checks passed · ${warnings} warning(s) · ${failed} issue(s). Results stay in this browser.`;
    paintHealthResults(rows,statusText,failed?'ISSUES FOUND':warnings?'CHECKED WITH WARNINGS':'HEALTHY');
    if(healthDetailsSummary) healthDetailsSummary.textContent=`View detailed results (${rows.length} checks)`;
    if(healthRunButton){healthRunButton.disabled=false;healthRunButton.textContent='Run again';}
    if(healthRepairButton) healthRepairButton.disabled=!registration;
    lastHealthReport=makeHealthReport(rows,assetMeta,registration,cacheNames,estimate,persisted,performanceSnapshot,cacheInventory);
    if(healthDownloadButton) healthDownloadButton.disabled=false;
    return rows;
  }
      async function runSafe() {
        try { return await runCurioidHealthCheck(); }
        catch(error) {
          const message=String(error?.message||error).slice(0,260);
          paintHealthResults([{label:'Diagnostics execution',ok:false,detail:message}],'Diagnostics could not finish. Download the partial report and send it for investigation.','INCOMPLETE');
          lastHealthReport={title:'CURIOID PARTIAL HEALTH REPORT',generatedAt:new Date().toISOString(),release:document.querySelector('.site-version')?.textContent?.trim()||'unknown',page:{url:location.origin+location.pathname},checks:[{label:'Diagnostics execution',ok:false,detail:message}],lastAssetFailure:window.__CURIOID_LAST_ASSET_LOAD_FAILURE||null,recentErrors:diagnosticEvents.slice(-24),privacy:'No cookies, passwords, localStorage contents, database records, files or project content included.'};
          if(healthDownloadButton) healthDownloadButton.disabled=false;
          if(healthDetailsSummary) healthDetailsSummary.textContent='View partial diagnostic results (1 check)';
          return [];
        } finally {
          if(healthRunButton){healthRunButton.disabled=false;if(healthRunButton.textContent==='Checking…')healthRunButton.textContent='Run again';}
        }
      }
      async function refreshServiceWorkerRegistration() {
        const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
        if (!registration) { paintHealthResults([], 'No service-worker registration exists to refresh. Open CURIOID over HTTPS, then run diagnostics again.', 'UNAVAILABLE'); return; }
        healthRepairButton.disabled = true; healthRepairButton.textContent = 'Refreshing…';
        try {
          await healthTimeout(registration.update(), 10000, 'Service-worker update check');
          paintHealthResults([{ label:'Service-worker registration', ok:true, detail:`Update check completed. Active: ${Boolean(registration.active)}; waiting: ${Boolean(registration.waiting)}. No saved data or caches were deleted.` }], 'Only the service-worker registration was refreshed. Any new version still follows the normal update-ready prompt.', 'CHECKED');
        } catch (error) {
          paintHealthResults([{ label:'Service-worker registration', ok:false, warning:true, detail:String(error?.message||error).slice(0,180) }], 'The browser could not refresh the service-worker registration. Your saved data was not changed.', 'UNAVAILABLE');
        } finally { healthRepairButton.disabled = false; healthRepairButton.textContent = 'Refresh service-worker registration'; }
      }
      return Object.freeze({ run:runSafe, download:downloadHealthReport, refresh:refreshServiceWorkerRegistration });
    }
  root.CurioidHealthCheck = Object.freeze({ create });
})(window);
