import {mediaURL} from './portfolio-model.js';
let types={};
export const setMediaTypes=value=>types=value||{};
export const mediaType=id=>types[id]||(id?.startsWith('asset:')?'image/webp':'image/unknown');
export function mediaElement(id,title,{preview=false}={}){
 const video=mediaType(id).startsWith('video/'),node=document.createElement(video?'video':'img');
 node.src=mediaURL(id);node.className=video?'story-video':'story-image';
 if(video){node.controls=true;node.preload='none';node.playsInline=true;node.setAttribute('aria-label',title);if(preview){node.muted=true;node.loop=true;}}
 else{node.alt=title;node.loading='lazy';node.decoding='async';}
 return node;
}
export function stopMedia(host){host.querySelectorAll('video,audio').forEach(video=>video.pause());}
