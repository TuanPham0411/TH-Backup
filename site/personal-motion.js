const ns='http://www.w3.org/2000/svg';let observer;
export function initPersonalMotion(){
 observer?.disconnect();const cards=document.querySelectorAll('#personal-hobbies .personal-story,#personal-activities .personal-story,#personal-family .personal-story');
 if('IntersectionObserver'in window)observer=new IntersectionObserver(entries=>{for(const entry of entries)entry.target.classList.toggle('personal-motion-visible',entry.isIntersecting);});
 for(const card of cards){const art=document.createElementNS(ns,'svg');art.setAttribute('viewBox','0 0 1000 240');art.setAttribute('preserveAspectRatio','none');art.setAttribute('aria-hidden','true');art.classList.add('personal-motion');
 for(let i=0;i<5;i++){const path=document.createElementNS(ns,'path'),y=32+i*43;path.setAttribute('d',`M 500 120 H 535 L 585 ${y} H 685 l 25 ${i%2?-13:13} h 70 l 25 ${i%2?13:-13} H 1020`);path.style.setProperty('--motion-delay',`${-i*2.4}s`);path.style.setProperty('--motion-duration',`${11+i*1.6}s`);art.append(path);}card.prepend(art);if(observer)observer.observe(card);else card.classList.add('personal-motion-visible');
 }
 document.body.classList.toggle('personal-motion-paused',document.hidden);
}
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('personal-motion-paused',document.hidden));
