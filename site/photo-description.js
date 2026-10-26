import {styledTitle,photoTitleKey} from './title-style.js';
import {mediaURL} from './portfolio-model.js';
let descriptions={},types={},tip;
export function setPhotoDescriptions(value,mediaTypes){descriptions=value||{};types=mediaTypes||{};hidePhotoDescription();}
export function hidePhotoDescription(){if(!tip)return;tip.querySelectorAll('video').forEach(v=>v.pause());tip.remove();tip=undefined;}
export function describePhoto(image,id){
 image.dataset.mediaId=id;const show=()=>{
 const info=descriptions[id];if(!info||(!info.title&&!info.description&&!info.media?.length))return;hidePhotoDescription();tip=document.createElement('aside');tip.className='photo-description-popup';tip.setAttribute('role','tooltip');
 if(info.title){const title=document.createElement('h3');title.textContent=info.title;tip.append(styledTitle(title,photoTitleKey(id)));}if(info.description){const text=document.createElement('p');text.textContent=info.description;tip.append(text);}
 const gallery=document.createElement('div');gallery.className='photo-description-gallery';for(const child of info.media||[]){const video=types[child]?.startsWith('video/'),node=document.createElement(video?'video':'img');node.src=mediaURL(child);if(video){node.muted=true;node.loop=true;node.playsInline=true;node.preload='none';}else{node.alt=info.title||'Image description';node.loading='lazy';}gallery.append(node);}tip.append(gallery);(image.closest('dialog[open]')||document.body).append(tip);
 const anchor=image.getBoundingClientRect(),width=Math.min(360,innerWidth-24),height=Math.min(tip.offsetHeight,innerHeight-24);tip.style.width=width+'px';tip.style.left=Math.max(12,Math.min(innerWidth-width-12,anchor.left+anchor.width/2-width/2))+'px';tip.style.top=(anchor.top>height+16?anchor.top-height-10:Math.max(12,Math.min(innerHeight-height-12,anchor.bottom+10)))+'px';const first=gallery.querySelector('video');if(first&&!matchMedia('(prefers-reduced-motion: reduce)').matches)first.play().catch(()=>{});
 };image.addEventListener('pointerenter',show);image.addEventListener('pointerleave',hidePhotoDescription);image.addEventListener('focus',show);image.addEventListener('blur',hidePhotoDescription);image.tabIndex=0;
}
document.addEventListener('scroll',hidePhotoDescription,true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePhotoDescription();});

document.addEventListener('close',hidePhotoDescription,true);
