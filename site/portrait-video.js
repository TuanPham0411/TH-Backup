import {mediaURL} from './portfolio-model.js';
let source='',position=0,frame,video,hasPortrait=false;
export function portraitVideo(profile){
 hasPortrait=!!profile.portrait;const portrait=document.querySelector('.portrait-frame');video?.pause();
 if(!frame){frame=document.createElement('div');frame.className='portrait-video-stage';const image=portrait.querySelector('img');image.before(frame);frame.append(image);}
 if(source!==profile.introVideo){video?.pause();video?.remove();video=undefined;position=0;source=profile.introVideo;}
 frame.querySelectorAll('.portrait-play,.portrait-stop').forEach(n=>n.remove());frame.classList.remove('playing');if(video)video.hidden=true;
 const image=frame.querySelector('img');image.hidden=!profile.portrait;
 if(!source)return;
 if(!video){video=document.createElement('video');video.src=mediaURL(source);video.preload='none';video.controls=true;video.playsInline=true;video.hidden=true;if(profile.introPoster)video.poster=mediaURL(profile.introPoster);frame.append(video);
 const collapse=()=>{position=video.currentTime||0;video.hidden=true;image.hidden=!hasPortrait;frame.classList.remove('playing');};video.addEventListener('pause',collapse);video.addEventListener('ended',()=>{video.currentTime=0;collapse();position=0;});}
 const play=document.createElement('button');play.type='button';play.className='portrait-play';play.setAttribute('aria-label','Play or resume personal introduction');play.textContent='▶';
 const activeVideo=video;play.onclick=async()=>{if(video!==activeVideo)return;image.hidden=true;activeVideo.hidden=false;frame.classList.add('playing');if(position&&Number.isFinite(position))activeVideo.currentTime=position;try{await activeVideo.play();}catch{if(video!==activeVideo)return;activeVideo.hidden=true;image.hidden=!hasPortrait;frame.classList.remove('playing');}};
 const stop=document.createElement('button');stop.type='button';stop.className='portrait-stop';stop.textContent='Ⅱ Trở về ảnh';stop.onclick=()=>video.pause();frame.append(play,stop);
}
