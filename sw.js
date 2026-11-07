/* v3.57.34 Offline shell only: NEVER cache Supabase, login, user data or API responses. */
const CACHE='duschl-waste-shell-v3.57.34';
const ASSETS=['./offline-waste.html','./offline-waste-app.js','./offline-waste-core.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('duschl-waste-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const withinScope=url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if(!withinScope)return;
  if(request.mode==='navigate'){
    if(/(?:\/|\/index\.html|\/offline-waste\.html)$/.test(url.pathname)){
      event.respondWith(fetch(request).catch(async()=>{
        const cache=await caches.open(CACHE);
        return await cache.match('./offline-waste.html')||Response.error();
      }));
    }
    return;
  }
  if(ASSETS.some(asset=>url.pathname.endsWith('/'+asset.slice(2)))){
    event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>cached||fetch(request)));
  }
});
