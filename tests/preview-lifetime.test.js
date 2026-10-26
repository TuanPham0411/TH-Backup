import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewLifetime} from '../site/preview-lifetime.js';
const wait=()=>new Promise(resolve=>setTimeout(resolve,15));
class Element extends EventTarget{contains(node){return node===this;}}
function setup(){const anchor=new Element(),popup=new Element();let closed=0;const lifetime=previewLifetime(anchor,popup,()=>closed++,{delay:5});return{anchor,popup,lifetime,closed:()=>closed};}
test('moving from checkpoint to popup keeps the interactive preview open',async()=>{
 globalThis.document={activeElement:null};const {anchor,popup,lifetime,closed}=setup();anchor.dispatchEvent(new Event('pointerenter'));anchor.dispatchEvent(new Event('pointerleave'));popup.dispatchEvent(new Event('pointerenter'));await wait();assert.equal(closed(),0);popup.dispatchEvent(new Event('pointerleave'));await wait();assert.equal(closed(),1);lifetime.dispose();
});
test('a carousel turn defers closure after focus or pointer loss until the turn finishes',async()=>{
 globalThis.document={activeElement:null};const {anchor,popup,lifetime,closed}=setup();popup.dispatchEvent(new Event('media-transition-start'));anchor.dispatchEvent(new Event('pointerleave'));popup.dispatchEvent(new Event('focusout'));await wait();assert.equal(closed(),0);popup.dispatchEvent(new Event('media-transition-end'));await wait();assert.equal(closed(),1);lifetime.dispose();
});
test('keyboard focus inside the popup prevents closure and disposal cancels timers',async()=>{
 const {popup,lifetime,closed}=setup();globalThis.document={activeElement:popup};popup.dispatchEvent(new Event('pointerleave'));await wait();assert.equal(closed(),0);document.activeElement=null;popup.dispatchEvent(new Event('focusout'));lifetime.dispose();await wait();assert.equal(closed(),0);
});
