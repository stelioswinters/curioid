const CACHE='knightmare-os-dreamforger-0.19.0-curioid-v1.395';
const ASSETS=[
  './','./index.html','./styles.css','./app.js','./os-shell.mjs','./window-manager.mjs','./shell-preferences.mjs','./storage-health.mjs','./project-context.mjs','./os-integration.mjs','./career-suite.js',
  './career-engine.mjs','./career-merge.mjs','./career-data.mjs',
  './career-project-store.mjs','./engine.mjs','./project-map.mjs','./project-workflow.mjs','./project-history.mjs','./project-intelligence.mjs',
  './storage-reconcile.mjs','./storage-lock.mjs','./storage-epoch.mjs','./storage-budget.mjs','./indexeddb-store.mjs','./manifest.webmanifest','./favicon.svg'
];
const ASSET_SET=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).pathname));

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS))
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>
      (key.startsWith('dreamforge-os-')||key.startsWith('dreamforger-os-')||key.startsWith('knightmare-os-dreamforger-'))&&key!==CACHE
    ).map(key=>caches.delete(key))))
));

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.headers?.has?.('range'))return;
  let url;
  try{url=new URL(request.url);}catch{return;}
  if(url.origin!==self.location.origin)return;
  const scopePath=new URL(self.registration.scope).pathname;
  if(!url.pathname.startsWith(scopePath))return;

  // Do not turn arbitrary same-origin URLs or query-driven endpoints into
  // persistent offline data. The app shell is an explicit immutable allowlist.
  const isAsset=ASSET_SET.has(url.pathname)&&url.search==='';
  const indexPath=new URL('./index.html',self.registration.scope).pathname;
  const isNavigation=request.mode==='navigate'&&url.search===''&&(url.pathname===scopePath||url.pathname===indexPath);
  if(!isAsset&&!isNavigation)return;

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(isNavigation){
      try{
        const response=await fetch(request);
        if(response.ok&&response.type==='basic'){
          try{await cache.put(indexPath,response.clone());}catch{}
        }
        return response;
      }catch{
        return (await cache.match(indexPath))||Response.error();
      }
    }

    // Revalidate shell assets. This avoids returning a stale module when an
    // install is incomplete or a deployment changes the bytes at the same URL.
    try{
      const response=await fetch(request,{cache:'no-cache'});
      if(response.ok&&response.type==='basic'){
        try{await cache.put(request,response.clone());}catch{}
      }
      return response;
    }catch{
      return (await cache.match(request))||Response.error();
    }
  })());
});
