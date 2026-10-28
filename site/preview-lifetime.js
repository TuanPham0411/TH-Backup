// Anchor and popup form one interactive area. A carousel turn holds it open.
export function previewLifetime(anchor,popup,onClose,{delay=240}={}){
 const inside=new Set(),listeners=[];let timer,turns=0,disposed=false;
 const cancel=()=>clearTimeout(timer),hasFocus=()=>[anchor,popup].some(node=>node.contains(document.activeElement));
 const schedule=()=>{cancel();if(disposed||turns)return;timer=setTimeout(()=>{if(!disposed&&!turns&&!inside.size&&!hasFocus())onClose();},delay);};
 const listen=(node,name,fn)=>{node.addEventListener(name,fn);listeners.push(()=>node.removeEventListener(name,fn));};
 for(const node of [anchor,popup]){
 listen(node,'pointerenter',()=>{inside.add(node);cancel();});listen(node,'pointerleave',()=>{inside.delete(node);schedule();});
 listen(node,'focusin',cancel);listen(node,'focusout',schedule);
 }
 listen(popup,'media-transition-start',()=>{turns++;cancel();});listen(popup,'media-transition-end',()=>{turns=Math.max(0,turns-1);schedule();});
 return{enter:node=>{inside.add(node);cancel();},schedule,cancel,isBusy:()=>turns>0,dispose:()=>{disposed=true;cancel();listeners.forEach(remove=>remove());}};
}
