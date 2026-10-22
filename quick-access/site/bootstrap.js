async function script(path){await new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=path;node.onload=resolve;node.onerror=()=>reject(new Error('Unable to load Quick Access.'));document.body.appendChild(node);});}
try{
 const response=await fetch('/quick-access/api/config',{credentials:'same-origin',cache:'no-store'});
 if(response.status===401){location.replace('/?returnTo=%2Fquick-access');}
 else{
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load Quick Access from Drive.');
  window.MES_CONFIG=data.config;
  await script('./app.js');await script('./manage.js');
 }
}catch(error){const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;document.querySelector('main')?.prepend(message);if(!message.isConnected)document.body.prepend(message);}
