// Keep editable copy as plain text. Text nodes preserve links, spans and layout.
export const pageCopy=[];
const roots=['.site-header .logo','.site-header nav','.home-hub','.focus-strip','.hero .button-row','.hero-bottom','#about .portrait-caption','#about>div:last-child','#personal-intro .section-heading','#expertise .section-heading','#experience .section-heading','.journey-intro','.journey-key','#projects .section-heading','.project-toolbar [data-filter]','#personal-activities .section-heading','#personal-hobbies .section-heading','#personal-family .section-heading','#personal-notes .section-heading','#contact','.site-footer','.image-rights'];
for(const option of document.querySelectorAll('#contact-topic option'))option.value=option.textContent;
let index=0;const seen=new Set();
for(const selector of roots)for(const root of document.querySelectorAll(selector)){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){
 const parent=node.parentElement;if(!node.textContent.trim()||seen.has(node)||parent.closest('script,style,input,textarea,[role=status],.contact-links'))continue;
 // Profile fields and dynamic dates are edited in their dedicated form.
 if(parent.closest('.portrait-caption .mono')||parent.id==='year'||parent.closest('#about')&&parent.matches('p:not(.eyebrow)'))continue;
 const path=[];let cursor=parent;while(cursor&&cursor!==root){path.unshift([...cursor.parentElement.children].indexOf(cursor));cursor=cursor.parentElement;}const token=selector+'|'+[...document.querySelectorAll(selector)].indexOf(root)+'|'+path.join('.')+'|'+[...parent.childNodes].indexOf(node);let hash=2166136261;for(const c of token)hash=Math.imul(hash^c.charCodeAt(0),16777619);const key='copy-'+(hash>>>0).toString(36);seen.add(node);pageCopy.push({key,node,original:node.textContent,label:node.textContent.trim().slice(0,100),section:root.closest('section')?.id||root.className||'Page'});
 }
}
for(const [i,node]of [...document.querySelectorAll('#project-search[placeholder],#contact-message[placeholder]')].entries())pageCopy.push({key:'placeholder-'+i,node,attribute:'placeholder',original:node.getAttribute('placeholder'),label:node.getAttribute('placeholder'),section:node.closest('section')?.id||'Page'});
export function applyCopy(copy={}){for(const item of pageCopy)if(item.node.isConnected){const value=Object.hasOwn(copy,item.key)?copy[item.key]:item.original;if(item.attribute)item.node.setAttribute(item.attribute,value);else item.node.textContent=value;}}
export function copyForElement(target){return pageCopy.find(x=>x.node.isConnected&&(x.node.parentElement===target||target.contains(x.node.parentElement)));}
