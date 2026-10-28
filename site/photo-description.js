import {isTouchInterface} from './input-mode.js';
import {previewLifetime} from './preview-lifetime.js';
import {storyCarousel} from './story-carousel.js';
import {styledTitle,photoTitleKey} from './title-style.js';
import {mediaURL} from './portfolio-model.js';
let descriptions={},types={},tip,lifetime;
export function setPhotoDescriptions(value,mediaTypes){descriptions=value||{};types=mediaTypes||{};hidePhotoDescription();}
export function hidePhotoDescription(){lifetime?.dispose();lifetime=undefined;if(!tip)return;tip.querySelectorAll('video').forEach(v=>v.pause());tip.remove();tip=undefined;}
export function describePhoto(image,id){
 image.dataset.mediaId=id;const show=event=>{if(isTouchInterface()||event.pointerType==='touch')return;
 if(tip?.dataset.owner===id){if(event.type==='pointerenter')lifetime?.enter(image);return;}
 const info=descriptions[id];if(!info||(!info.title&&!info.description&&!info.media?.length))return;hidePhotoDescription();tip=document.createElement('aside');tip.className='photo-description-popup';tip.dataset.owner=id;tip.setAttribute('role','tooltip');
 if(info.title){const title=document.createElement('h3');title.textContent=info.title;tip.append(styledTitle(title,photoTitleKey(id)));}if(info.description){const text=document.createElement('p');text.textContent=info.description;tip.append(text);}
 if(info.media?.length){tip.classList.add('has-media');tip.append(storyCarousel(info.media,info.title||'Image description',{rotate:true}));}else if(!info.description)tip.classList.add('title-only');lifetime=previewLifetime(image,tip,hidePhotoDescription);if(event.type==='pointerenter')lifetime.enter(image);(image.closest('dialog[open]')||document.body).append(tip);
 const anchor=image.getBoundingClientRect(),width=Math.min(tip.getBoundingClientRect().width||tip.offsetWidth||180,innerWidth-24),height=Math.min(tip.offsetHeight,innerHeight-24);tip.style.left=Math.max(12,Math.min(innerWidth-width-12,anchor.left+anchor.width/2-width/2))+'px';tip.style.top=(anchor.top>height+16?anchor.top-height-10:Math.max(12,Math.min(innerHeight-height-12,anchor.bottom+10)))+'px';
 };image.addEventListener('pointerenter',show);image.addEventListener('focus',show);image.tabIndex=isTouchInterface()?-1:0;
}
document.addEventListener('scroll',event=>{if(tip&&!tip.contains(event.target)&&!lifetime?.isBusy())hidePhotoDescription();},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePhotoDescription();});

document.addEventListener('close',hidePhotoDescription,true);
