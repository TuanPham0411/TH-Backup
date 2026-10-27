import {mediaURL} from './portfolio-model.js';
export function updatePortrait(image,id,name){
 image.alt=name;const frame=image.closest('.portrait-frame');
 if(image.dataset.portraitKey===id)return;
 image.dataset.portraitKey=id||'';image.hidden=true;image.onload=image.onerror=null;
 if(!id){image.removeAttribute('src');image.dataset.portraitState='empty';if(frame)frame.dataset.portraitState='empty';return;}
 image.dataset.portraitState='loading';if(frame)frame.dataset.portraitState='loading';
 image.onload=()=>{if(image.dataset.portraitKey!==id)return;image.dataset.portraitState='ready';if(frame)frame.dataset.portraitState='ready';image.hidden=image.closest('.portrait-video-stage')?.classList.contains('playing')||false;};
 image.onerror=()=>{if(image.dataset.portraitKey!==id)return;image.hidden=true;image.dataset.portraitState='error';if(frame)frame.dataset.portraitState='error';};
 image.loading='eager';image.decoding='async';image.fetchPriority='high';image.src=mediaURL(id);
}
