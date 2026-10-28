const narrow=matchMedia('(max-width: 760px)'),coarse=matchMedia('(hover: none) and (pointer: coarse)');
export const isTouchInterface=()=>narrow.matches||coarse.matches;
let last=isTouchInterface();
for(const query of [narrow,coarse])query.addEventListener?.('change',()=>{const next=isTouchInterface();if(next!==last){last=next;document.dispatchEvent(new CustomEvent('portfolio:input-mode'));}});
