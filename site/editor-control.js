// Textarea.type is a read-only DOM property. Only inputs accept a type value.
export function createEditorControl(document,{area=false,type='text'}={}) {
 const control=document.createElement(area?'textarea':'input');
 if(!area)control.type=type;
 return control;
}
