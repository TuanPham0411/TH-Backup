let observer;
export function initAboutMatrix(){
 const host=document.getElementById('about');if(host.querySelector('.about-matrix'))return;
 const layer=document.createElement('div');layer.className='about-matrix';layer.setAttribute('aria-hidden','true');
 for(let i=0;i<20;i++){const column=document.createElement('span');column.style.setProperty('--column',String(i));column.style.setProperty('--drift',`${17+i%7*2}s`);column.style.setProperty('--delay',`${-i*1.7}s`);column.textContent=Array.from({length:36},(_,j)=>(i*13+j*7+j*j)%11<5?'0':'1').join('\n');layer.append(column);}host.prepend(layer);
 if('IntersectionObserver'in window){observer=new IntersectionObserver(([entry])=>host.classList.toggle('matrix-visible',entry.isIntersecting));observer.observe(host);}else host.classList.add('matrix-visible');
}
document.addEventListener('visibilitychange',()=>document.getElementById('about')?.classList.toggle('matrix-paused',document.hidden));
