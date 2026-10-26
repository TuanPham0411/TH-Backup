// The static CV is a separate document and intentionally does not load the app.
(() => {
 const path=location.pathname==='/resume.html'?'/resume.html':'/';
 fetch('/api/portfolio/content/visits',{
  method:'POST',credentials:'same-origin',keepalive:true,
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({path,referrer:document.referrer||''})
 }).catch(()=>{});
})();
