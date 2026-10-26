export const photoTitleKey=id=>'photo-'+id.replace(/[^a-zA-Z0-9_-]/g,'-');
export const titleFonts={inherit:'Theo giao diện','DM Sans':'DM Sans','Space Grotesk':'Space Grotesk',Carlito:'Carlito',Georgia:'Georgia',Arial:'Arial',monospace:'Monospace'};
let styles={};
export const setTitleStyles=value=>{styles=value||{};};
export function styledTitle(node,key){
 node.dataset.titleKey=key;const value=styles[key]||{};
 node.style.fontFamily=value.font&&value.font!=='inherit'?value.font:'';
 node.style.fontSize=value.size?`clamp(${Math.min(value.size,22)}px, ${value.size/14}vw, ${value.size}px)`:'';
 node.style.color=value.color||'';
 if(value.color){node.style.backgroundImage='none';node.style.webkitTextFillColor=value.color;}else{node.style.removeProperty('background-image');node.style.removeProperty('-webkit-text-fill-color');}
 for(const child of node.querySelectorAll('.gradient')){if(value.color){child.style.backgroundImage='none';child.style.webkitTextFillColor=value.color;child.style.color=value.color;}else{child.style.removeProperty('background-image');child.style.removeProperty('-webkit-text-fill-color');child.style.removeProperty('color');}}
 return node;
}
const headingSelectors={about:'#about h2',skills:'#expertise h2',journey:'#experience h2',activities:'#personal-activities h2',hobbies:'#personal-hobbies h2',family:'#personal-family h2',notes:'#personal-notes h2',projects:'#projects h2',contact:'#contact h2'};
export function applyPageTitles(){for(const [key,selector]of Object.entries(headingSelectors)){const node=document.querySelector(selector);if(node)styledTitle(node,'section-'+key);}}
export function titleChoices(value){return [{key:'profile-name',label:'Tên chính · '+value.profile.name},{key:'profile-headline',label:'Dòng tiêu đề · '+value.profile.headline},...Object.keys(headingSelectors).map(key=>({key:'section-'+key,label:'Tiêu đề khu vực · '+key})),...Object.entries(value.mediaDescriptions||{}).map(([id,desc])=>({key:photoTitleKey(id),label:'Mô tả ảnh · '+(desc.title||id)})),...['skills','toolkit','journey','education','activities','hobbies','family','projects','notes'].flatMap(group=>(value[group]||[]).map(item=>({key:`item-${group}-${item.id}`,label:`${group} · ${item.title}`})))];}
