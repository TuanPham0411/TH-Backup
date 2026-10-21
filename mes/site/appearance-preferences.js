import {api} from './backend.js';
import {t} from './i18n.js';
const fonts={calibri:'Calibri, Carlito, Arial, sans-serif',arial:'Arial, sans-serif',segoe:'"Segoe UI", Arial, sans-serif',tahoma:'Tahoma, Arial, sans-serif',verdana:'Verdana, Arial, sans-serif',georgia:'Georgia, serif',times:'"Times New Roman", serif',courier:'"Courier New", monospace'};
const defaults={font:'calibri',size:14},sizes=[12,14,16,18,20];
const $=id=>document.getElementById(id);
let generation=0,key=null,loading=false;
function valid(value){return value&&Object.hasOwn(fonts,value.font)&&sizes.includes(value.size)?{font:value.font,size:value.size}:{...defaults};}
function apply(value){document.documentElement.style.setProperty('--ui-font',fonts[value.font]);document.documentElement.style.fontSize=`${16*value.size/14}px`;}
function controls(value){$('appearance-font').value=value.font;$('appearance-size').value=value.size;}
function cache(value){try{localStorage.setItem('th-mes-appearance:'+key,JSON.stringify(value));}catch{}}
export async function loadAppearancePreferences(user,preview=false){
 const epoch=++generation;key=user?.uid||null;loading=!!user&&!preview;$('appearance-save').disabled=loading||!user;$('appearance-status').textContent='';
 let value={...defaults};try{if(key)value=valid(JSON.parse(localStorage.getItem('th-mes-appearance:'+key)));}catch{}
 apply(value);controls(value);
 if(loading)try{const stored=valid(await api('getAppearancePreferences'));if(epoch!==generation)return;apply(stored);controls(stored);cache(stored);}catch{if(epoch===generation)$('appearance-status').textContent=t('Could not load appearance settings. Press Refresh to try again.');}
 finally{if(epoch===generation){loading=false;$('appearance-save').disabled=false;}}
}
export function initAppearancePreferences(getContext){
 $('appearance-form').onsubmit=async event=>{event.preventDefault();const context=getContext();if(!context.user||loading)return;const epoch=generation,value=valid({font:$('appearance-font').value,size:Number($('appearance-size').value)});$('appearance-save').disabled=true;$('appearance-status').textContent='';
 try{if(!context.preview)await api('saveAppearancePreferences',value);if(epoch!==generation)return;cache(value);apply(value);controls(value);$('appearance-status').textContent=t('Appearance saved. This applies only to your account.');}
 catch{if(epoch===generation)$('appearance-status').textContent=t('Could not save appearance settings. Please try again.');}
 finally{if(epoch===generation)$('appearance-save').disabled=false;}
 };
 $('appearance-reset').onclick=()=>controls(defaults);
 document.addEventListener('mes:refresh',()=>{const context=getContext();if(context.user)loadAppearancePreferences(context.user,context.preview);});
}
