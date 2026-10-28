/* Begin content and the current portrait before the main application bundle. */
(()=>{
 const request=()=>fetch('/api/portfolio/content/',{credentials:'same-origin',cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Content unavailable');return response.json();}).catch(()=>null);
 const pending=window.__portfolioContent||(window.__portfolioContent=request());
 pending.then(content=>{
  const id=content?.profile?.portrait;
  const url=/^[a-f0-9-]{36}$/.test(id||'')?'/api/portfolio/content/media/'+id:['asset:/images/profile.webp','asset:/images/ot-hero.webp'].includes(id)?id.slice(6):'';
  if(!url)return;
  const preload=document.createElement('link');preload.rel='preload';preload.as='image';preload.href=url;preload.fetchPriority='high';document.head.append(preload);
 });
})();
