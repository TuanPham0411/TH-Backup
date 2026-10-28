import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEditorControl} from '../site/editor-control.js';

// Match the browser's getter-only textarea.type contract; assigning it in an
// ES module must throw. Sloppy-mode DOM harnesses silently hide this error.
function nativeDocument() {
 return {createElement(tag){
  if(tag==='textarea')return Object.defineProperty({tagName:'TEXTAREA'},'type',{get:()=> 'textarea'});
  return {tagName:'INPUT',type:'text'};
 }};
}
test('editor creates textarea without assigning its read-only type',()=>{
 const document=nativeDocument();
 assert.throws(()=>{document.createElement('textarea').type='text';},TypeError);
 const control=createEditorControl(document,{area:true});
 assert.equal(control.type,'textarea');
 control.value='Editable biography\nSecond paragraph';
 assert.match(control.value,/Second paragraph/);
});
test('editor retains editable input types for text, dates and visibility',()=>{
 const document=nativeDocument();
 for(const type of ['text','date','checkbox']) {
  const control=createEditorControl(document,{type});
  assert.equal(control.tagName,'INPUT');assert.equal(control.type,type);
 }
});
