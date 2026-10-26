let last='';
export function recordVisit(){
 if(document.visibilityState==='hidden')return;const hash=/^#[a-zA-Z0-9_-]{1,80}$/.test(location.hash)?location.hash:'';const path=(location.pathname==='/resume.html'?'/resume.html':'/')+hash;
 const key=path+'|'+Math.floor(Date.now()/30000);if(key===last)return;last=key;
 fetch('/api/portfolio/content/visits',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({path,referrer:document.referrer||''})}).catch(()=>{});
}
window.addEventListener('hashchange',recordVisit);
