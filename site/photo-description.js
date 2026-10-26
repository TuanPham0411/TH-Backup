import {storyCarousel} from './story-carousel.js';
import {styledTitle,photoTitleKey} from './title-style.js';
import {mediaURL} from './portfolio-model.js';
let descriptions={},types={},tip,hideTimer;
const scheduleHide=()=>{clearTimeout(hideTimer);hideTimer=setTimeout(hidePhotoDescription,180);};
export function setPhotoDescriptions(value,mediaTypes){descriptions=value||{};types=mediaTypes||{};hidePhotoDescription();}
export function hidePhotoDescription(){clearTimeout(hideTimer);if(!tip)return;tip.querySelectorAll('video').forEach(v=>v.pause());tip.remove();tip=undefined;}
export function describePhoto(image,id){
 image.dataset.mediaId=id;const show=()=>{
 const info=descriptions[id];if(!info||(!info.title&&!info.description&&!info.media?.length))return;hidePhotoDescription();tip=document.createElement('aside');tip.className='photo-description-popup';tip.setAttribute('role','tooltip');
 if(info.title){const title=document.createElement('h3');title.textContent=info.title;tip.append(styledTitle(title,photoTitleKey(id)));}if(info.description){const text=document.createElement('p');text.textContent=info.description;tip.append(text);}
 const gallery=storyCarousel(info.media||[],info.title||'Image description',{rotate:true});tip.append(gallery);tip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));tip.addEventListener('pointerleave',scheduleHide);(image.closest('dialog[open]')||document.body).append(tip);
 const anchor=image.getBoundingClientRect(),width=Math.min(360,innerWidth-24),height=Math.min(tip.offsetHeight,innerHeight-24);tip.style.width=width+'px';tip.style.left=Math.max(12,Math.min(innerWidth-width-12,anchor.left+anchor.width/2-width/2))+'px';tip.style.top=(anchor.top>height+16?anchor.top-height-10:Math.max(12,Math.min(innerHeight-height-12,anchor.bottom+10)))+'px';
 };image.addEventListener('pointerenter',show);image.addEventListener('pointerleave',scheduleHide);image.addEventListener('focus',show);image.addEventListener('blur',hidePhotoDescription);image.tabIndex=0;
}
document.addEventListener('scroll',hidePhotoDescription,true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePhotoDescription();});

document.addEventListener('close',hidePhotoDescription,true);
