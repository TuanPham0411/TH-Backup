import {createEditorControl} from './editor-control.js';
import {el,getPortfolioView} from './journey.js';
import {groups,mediaURL,normalizePortfolio,validatePortfolio,publicPortfolio} from './portfolio-model.js';
import {pageCopy,copyForElement} from './page-copy.js';
import {mediaElement,setMediaTypes,mediaType,stopMedia} from './portfolio-media.js';
export async function contentRequest(path='',options={}){
 const response=await fetch('/api/portfolio/content/'+path,{credentials:'same-origin',...options});
 let value;try{value=await response.json();}catch{throw Error('Máy chủ chưa phản hồi. Vui lòng thử lại.');}
 if(!response.ok)throw Error(value.error||'Không thể thực hiện yêu cầu');return value;
}
const labels={profile:'Hồ sơ & giới thiệu',skills:'Bộ kỹ năng',journey:'Các mốc timeline',activities:'Hoạt động cá nhân',hobbies:'Sở thích',family:'Gia đình',projects:'Dự án',education:'Học vấn',notes:'Nội dung bổ sung',intro:'Video giới thiệu 16:9',music:'Nhạc nền',copy:'Toàn bộ chữ trên trang'};
const mount=document.getElementById('portfolio-content-admin');
const dialog=el('dialog',undefined,'portfolio-admin-dialog');dialog.id='portfolio-admin-dialog';dialog.setAttribute('aria-label','Quản trị nội dung portfolio');
const header=el('div',undefined,'cms-header'),intro=el('div');intro.append(el('h2','Quản trị nội dung'),el('p','Thêm, sửa, xóa và chọn công khai. Bố cục được tự động giữ ổn định.'));
const quit=el('button','×');quit.type='button';quit.setAttribute('aria-label','Đóng quản trị');quit.onclick=()=>dialog.close();header.append(intro,quit);
const body=el('div',undefined,'cms-body'),navigation=el('nav',undefined,'cms-nav');navigation.setAttribute('aria-label','Nhóm nội dung');mount.className='cms-content';body.append(navigation,mount);dialog.append(header,body);document.body.append(dialog);
let identity=null,generation=0,draft,dirty=false,currentUser,openSection,previewGuest=false,applyView;
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
dialog.addEventListener('close',()=>stopMedia(dialog));
function affordances(){
 document.querySelectorAll('.admin-empty').forEach(n=>{n.parentElement.hidden=true;n.remove();});document.querySelectorAll('.section-edit,.admin-mode-bar,.portfolio-admin-launch').forEach(n=>n.remove());
 const admin=!!currentUser?.emailVerified&&currentUser?.isAdmin===true;document.body.classList.toggle('portfolio-admin-mode',admin);if(!admin)return;
 const launch=el('button','✎ Quản trị nội dung','button small-button portfolio-admin-launch');launch.type='button';launch.onclick=()=>openSection?.('profile');document.querySelector('.header-actions').prepend(launch);
 const bar=el('div',undefined,'admin-mode-bar');bar.append(el('strong',previewGuest?'ADMIN · Đang xem như khách':'TRANG CỦA TÔI · Gồm cả nội dung riêng tư'));const actions=el('div',undefined,'button-row');
 for(const [key,label]of [['skills','Bộ kỹ năng'],['hobbies','Sở thích'],['activities','Hoạt động'],['intro','Video giới thiệu'],['music','Nhạc nền'],['copy','Sửa toàn bộ chữ']]){const button=el('button',label,'text-button');button.type='button';button.onclick=()=>openSection?.(key);actions.append(button);}const preview=el('button',previewGuest?'← Trang của tôi':'◉ Xem như khách','button ghost');preview.type='button';preview.onclick=async()=>{try{const next=await contentRequest(previewGuest?'':'?view=public');previewGuest=!previewGuest;applyView?.(next);}catch(error){alert(error.message);}};actions.append(preview);bar.append(actions);document.querySelector('.site-header').after(bar);
 for(const [selector,key]of [['#home','profile'],['#about','profile'],['#expertise','skills'],['#experience','journey'],['#projects','projects'],['#personal-activities','activities'],['#personal-hobbies','hobbies'],['#personal-family','family'],['#personal-notes','notes'],['#personal-intro','intro'],['#contact','copy'],['.image-rights','copy']]){
 const section=document.querySelector(selector);if(!section)continue;const edit=el('button',`${getPortfolioView().sections[key]===false?'🔒 Nhóm đang ẩn · ':''}✎ Sửa ${labels[key]}`,'section-edit');edit.type='button';edit.onclick=()=>openSection?.(key);(section.querySelector('.container')||section).prepend(edit);
 if(section.hidden&&!previewGuest){section.hidden=false;const empty=el('div',undefined,'admin-empty');empty.append(el('h3',labels[key]),el('p','Chưa có nội dung công khai. Chỉ admin thấy khung hướng dẫn này.'));const add=el('button','+ Thêm nội dung','button ghost');add.type='button';add.onclick=()=>openSection?.(key);empty.append(add);section.append(empty);}
 }
}
document.addEventListener('portfolio:content',affordances);
export function portfolioAdminUser(user,onSave){
 if(identity===user?.uid&&mount.childNodes.length&&currentUser?.isAdmin===user?.isAdmin&&currentUser?.emailVerified===user?.emailVerified){currentUser=user;affordances();return;}
 currentUser=user;applyView=onSave;previewGuest=false;identity=user?.uid||null;generation++;draft=null;dirty=false;document.querySelectorAll('.portfolio-library').forEach(d=>d.remove());mount.replaceChildren();navigation.replaceChildren();dialog.close();openSection=null;
 if(!user?.emailVerified||!user?.isAdmin){onSave(publicPortfolio(getPortfolioView()));affordances();return;}
 const epoch=generation;let chooseSection;contentRequest('').then(value=>{if(epoch===generation)onSave(value);}).catch(()=>{});
 openSection=async key=>{
  if(!draft){mount.replaceChildren(el('p','Đang tải nội dung…'));if(!dialog.open)dialog.showModal();try{const value=await contentRequest('admin');if(epoch!==generation)return;draft=normalizePortfolio(value);setMediaTypes(draft.mediaTypes);build();}catch(error){mount.replaceChildren(el('p',error.message));return;}}
  if(!dialog.open)dialog.showModal();chooseSection?.(key||'profile');
 };
 affordances();
 function build(){
  mount.replaceChildren();navigation.replaceChildren();
  const editor=el('section',undefined,'portfolio-editor'),heading=el('h3'),help=el('p','','muted');editor.append(heading,help);
  const toolbar=el('div',undefined,'editor-toolbar'),section=el('select'),entry=el('select');section.hidden=true;section.setAttribute('aria-label','Content section');entry.setAttribute('aria-label','Content entry');
  const add=el('button','+ Thêm','button ghost'),remove=el('button','Xóa mục','button ghost'),save=el('button','Lưu thay đổi','button primary'),reload=el('button','Tải lại bản đã lưu','button ghost');
  for(const control of [add,remove,save,reload])control.type='button';
  for(const key of Object.keys(labels)){const option=el('option',labels[key]);option.value=key;section.append(option);const tab=el('button',labels[key]);tab.type='button';tab.dataset.section=key;tab.onclick=()=>chooseSection(key);navigation.append(tab);}
  toolbar.append(section,entry,add,remove,save,reload);const fields=el('div',undefined,'editor-fields'),status=el('p','','editor-status');status.setAttribute('role','status');editor.append(toolbar,fields,status);mount.append(editor);
  function changed(){dirty=true;status.textContent='Có thay đổi chưa lưu.';status.classList.add('unsaved');}
  function selected(){return groups.includes(section.value)?draft[section.value].find(x=>x.id===entry.value):draft.profile;}
  function updateEntries(id){
   entry.replaceChildren();const list=groups.includes(section.value);entry.hidden=add.hidden=remove.hidden=!list;
   if(!list)return;for(const item of draft[section.value]){const option=el('option',`${item.public?'● Công khai':'○ Riêng tư'} · ${item.title}`);option.value=item.id;entry.append(option);}if(id)entry.value=id;remove.disabled=!entry.value;
  }
  function field(target,key,label,{type='text',area=false,wide=false,max=8000,value,onChange}={}){
   const wrap=el('label',label,wide?'wide':''),control=createEditorControl(document,{area,type});
   if(type==='checkbox'){wrap.classList.add('editor-checkbox');control.checked=target[key]===true;}else control.value=value??target[key]??'';
   if(type!=='checkbox'&&type!=='date')control.maxLength=max;
   control.oninput=()=>{target[key]=type==='checkbox'?control.checked:control.value;onChange?.(target,control);changed();};wrap.append(control);fields.append(wrap);return control;
  }
  const accepts={image:'image/jpeg,image/png,image/webp,image/gif',video:'video/mp4,video/webm',audio:'audio/mpeg,audio/mp4,audio/ogg,audio/wav',gallery:'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'};
  async function library(target,key,kind,multiple=false){
   const sheet=el('dialog',undefined,'story-dialog portfolio-library'),close=el('button','×','dialog-close');close.type='button';close.setAttribute('aria-label','Đóng thư viện');close.onclick=()=>sheet.close();
   sheet.append(close,el('h2',kind==='audio'?'Nhạc nền':kind==='video'?'Video giới thiệu':'Thư viện ảnh · GIF · video'),el('p','Ảnh/GIF tối đa 12 MB · video MP4/WebM 96 MB · nhạc 40 MB. Tải lên, chọn vào nội dung, rồi lưu để áp dụng.','muted'));
   const upload=el('input');upload.type='file';upload.accept=accepts[kind];upload.multiple=multiple;upload.setAttribute('aria-label','Upload media');
   const progress=el('progress');progress.max=100;progress.value=0;progress.hidden=true;const note=el('p','','editor-status');note.setAttribute('role','status');const list=el('div',undefined,'cms-library-grid');sheet.append(upload,progress,note,list);document.body.append(sheet);sheet.showModal();sheet.addEventListener('close',()=>{stopMedia(sheet);sheet.remove();},{once:true});
   const matches=m=>kind==='audio'?m.type.startsWith('audio/'):kind==='video'?m.type.startsWith('video/'):kind==='image'?m.type.startsWith('image/'):/^(image|video)\//.test(m.type);
   const select=id=>{if(epoch!==generation)return false;if(multiple){if(target[key].includes(id))return true;if(target[key].length>=8){note.textContent='Mỗi mục tối đa 8 ảnh/GIF/video.';return false;}target[key].push(id);}else target[key]=id;changed();renderFields();return true;};
   async function refresh(){
    const value=await contentRequest('library');if(epoch!==generation){sheet.close();return;}
    for(const m of value.rows)draft.mediaTypes[m.id]=m.type;setMediaTypes(draft.mediaTypes);list.replaceChildren();
    for(const m of value.rows.filter(matches)){
     const card=el('article',undefined,'library-card');if(m.type.startsWith('audio/')){const audio=el('audio');audio.src=mediaURL(m.id);audio.controls=true;audio.preload='none';card.append(audio);}else card.append(mediaElement(m.id,m.name));
     card.append(el('p',`${m.name} · ${(Number(m.size)/1048576).toFixed(1)} MB`));
     const choose=el('button','Chọn vào nội dung','button ghost');choose.type='button';choose.onclick=()=>{if(select(m.id)){note.textContent='Đã chọn. Nhấn Lưu thay đổi để áp dụng.';if(!multiple)sheet.close();}};
     const del=el('button','Xóa khỏi thư viện','text-button');del.type='button';del.onclick=async()=>{if(!confirm(`Xóa vĩnh viễn ${m.name}?`))return;try{await contentRequest('media/'+m.id,{method:'DELETE'});await refresh();}catch(error){note.textContent=error.message;}};card.append(choose,del);list.append(card);
    }
    if(!list.childNodes.length)list.append(el('p','Chưa có file. Chọn Tải lên ở phía trên.','muted'));
   }
   function uploadFile(file){return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();request.open('POST','/api/portfolio/content/upload');request.withCredentials=true;request.setRequestHeader('Content-Type',file.type);request.setRequestHeader('X-File-Name',encodeURIComponent(file.name));request.timeout=180000;
    request.upload.onprogress=e=>{if(e.lengthComputable){progress.value=e.loaded/e.total*100;note.textContent=`${file.name} · ${Math.round(progress.value)}%`;}};
    request.onload=()=>{try{const data=JSON.parse(request.responseText);if(request.status<200||request.status>=300)throw Error(data.error||'Tải file thất bại');resolve(data);}catch(error){reject(error);}};
    request.onerror=()=>reject(Error('Mất kết nối khi tải file. Vui lòng thử lại.'));request.ontimeout=()=>reject(Error('Tải file quá lâu. Thử video ngắn hoặc dung lượng nhỏ hơn.'));request.send(file);
   });}
   upload.onchange=async()=>{
    upload.disabled=true;save.disabled=true;progress.hidden=false;let failed=false;
    try{for(const file of upload.files){if(epoch!==generation)break;note.textContent=`Đang tải ${file.name}…`;const m=await uploadFile(file);if(epoch!==generation)break;draft.mediaTypes[m.id]=m.type;setMediaTypes(draft.mediaTypes);select(m.id);}if(epoch===generation){await refresh();note.textContent='Đã tải và chọn file. Nhấn Lưu thay đổi để xuất bản.';}}
    catch(error){failed=true;note.textContent=error.message;}finally{upload.value='';upload.disabled=false;save.disabled=false;progress.hidden=true;}
    if(!multiple&&!failed&&epoch===generation)sheet.close();
   };
   try{await refresh();}catch(error){note.textContent=error.message;}
  }
  function mediaField(target,key,label,kind,multiple=false){
   const wrap=el('div',undefined,'wide');wrap.append(el('label',label));const media=el('div',undefined,'editor-media'),ids=multiple?target[key]:target[key]?[target[key]]:[];
   for(const [index,id]of ids.entries()){
    const thumb=el('div',undefined,'editor-thumb');if(mediaType(id).startsWith('audio/'))thumb.append(el('p','♫ '+draft.profile.musicTitle));else thumb.append(mediaElement(id,label));
    const drop=el('button','Bỏ khỏi mục');drop.type='button';drop.onclick=()=>{if(multiple)target[key]=target[key].filter(x=>x!==id);else target[key]='';changed();renderFields();};thumb.append(drop);
    if(multiple&&index>0){const first=el('button','↑ Đưa lên trước');first.type='button';first.onclick=()=>{[target[key][index-1],target[key][index]]=[target[key][index],target[key][index-1]];changed();renderFields();};thumb.append(first);}media.append(thumb);
   }
   if(!ids.length)media.append(el('p','Chưa chọn media.','muted'));
   const choose=el('button','+ Tải lên / Chọn từ thư viện','button ghost');choose.type='button';choose.onclick=()=>library(target,key,kind,multiple);wrap.append(media,choose);fields.append(wrap);
  }
  function renderCopy(){
   const search=el('input');search.type='search';search.placeholder='Tìm chữ hoặc khu vực cần sửa…';search.className='cms-copy-search';search.setAttribute('aria-label','Tìm nội dung chữ');const list=el('div',undefined,'copy-fields wide');fields.append(search,list);
   function draw(){list.replaceChildren();const term=search.value.toLowerCase();for(const item of pageCopy.filter(x=>x.node.isConnected&&`${x.label} ${x.section}`.toLowerCase().includes(term))){const wrap=el('label'),meta=el('small',item.section+' · '+item.key),title=el('span',item.label),control=el('textarea');control.value=Object.hasOwn(draft.copy,item.key)?draft.copy[item.key]:item.original;control.maxLength=8000;control.dataset.copyKey=item.key;control.oninput=()=>{draft.copy[item.key]=control.value;changed();};const reset=el('button','Khôi phục chữ gốc','text-button');reset.type='button';reset.onclick=()=>{delete draft.copy[item.key];control.value=item.original;changed();};wrap.append(meta,title,control,reset);list.append(wrap);}}
   search.oninput=draw;draw();
  }
  function renderFields(){
   stopMedia(fields);fields.replaceChildren();const key=section.value,target=selected();heading.textContent=labels[key];help.textContent=key==='copy'?'Sửa hoặc xóa chữ của tiêu đề, menu, nút, chú thích, phần liên hệ và bản quyền. Để trống để xóa chữ; bố cục và chức năng vẫn được giữ.':groups.includes(key)?'Mỗi mục có nội dung, ảnh/GIF/video và trạng thái công khai riêng. File đầu tiên là media xem nhanh.':'Chọn file từ thiết bị của bạn, lưu thay đổi và bật công khai khi đã sẵn sàng.';
   if(key==='copy'){renderCopy();return;}
   if(key==='music'){field(draft.profile,'musicTitle','Tên bản nhạc',{max:160,wide:true});mediaField(draft.profile,'music','File nhạc nền','audio');field(draft.profile,'musicPublic','Cho phép khách bật nhạc nền',{type:'checkbox',wide:true});return;}
   if(key==='intro'){mediaField(draft.profile,'introVideo','Video giới thiệu cá nhân · khung 16:9','video');mediaField(draft.profile,'introPoster','Ảnh thumbnail đại diện','image');field(draft.profile,'introPublic','Công khai video giới thiệu',{type:'checkbox',wide:true});return;}
   if(key==='profile'){
    for(const [name,label,area,max]of [['name','Tên hiển thị',false,100],['headline','Dòng tiêu đề chính',false,160],['identityLine','Dòng định danh (Home / CV / Portfolio)',false,160],['summary','Giới thiệu ngắn',true,1000],['about','Nội dung giới thiệu bản thân',true,8000],['email','Email liên hệ',false,254],['phone','Số điện thoại',false,40]])field(target,name,label,{area,wide:area,max});
    mediaField(target,'portrait','Ảnh đại diện','image');mediaField(target,'heroImage','Ảnh nền đầu trang','image');return;
   }
   const sectionSetting=el('label','Hiển thị nhóm này khi có nội dung công khai','editor-checkbox wide'),toggle=el('input');toggle.type='checkbox';toggle.checked=draft.sections[key]!==false;toggle.onchange=()=>{draft.sections[key]=toggle.checked;changed();};sectionSetting.append(toggle);fields.append(sectionSetting);
   if(!target){const empty=el('div',undefined,'cms-empty wide');empty.append(el('h3','Chưa có mục nào'),el('p','Nhấn + Thêm để viết nội dung, chọn ảnh/GIF/video và quyết định công khai.'));fields.append(empty);return;}
   field(target,'public','Công khai mục này',{type:'checkbox',wide:true});field(target,'title','Tiêu đề',{max:160});field(target,'subtitle','Chú thích / tổ chức',{max:200});
   if(key==='journey'){field(target,'date','Ngày bắt đầu',{type:'date'});field(target,'end','Ngày kết thúc (để trống nếu đang tiếp tục)',{type:'date'});}
   field(target,'description','Nội dung đầy đủ',{area:true,wide:true});field(target,'tags','Kỹ năng / từ khóa (phân cách bằng dấu phẩy)',{wide:true,value:target.tags.join(', '),onChange:(t,c)=>t.tags=c.value.split(',').map(x=>x.trim()).filter(Boolean)});
   if(key==='projects')for(const [name,label]of [['url','Link dự án (https://)'],['source','Link mã nguồn'],['category','Nhóm dự án (Web / Embedded)'],['status','Trạng thái'],['year','Năm']])field(target,name,label,{max:1000});
   mediaField(target,'media','Ảnh, ảnh GIF và video ngắn','gallery',true);
  }
  chooseSection=key=>{section.value=Object.hasOwn(labels,key)?key:'profile';for(const tab of navigation.querySelectorAll('button'))tab.setAttribute('aria-current',String(tab.dataset.section===section.value));updateEntries();renderFields();mount.scrollTop=0;};
  section.onchange=()=>chooseSection(section.value);entry.onchange=renderFields;
  add.onclick=()=>{const key=section.value,item={id:crypto.randomUUID(),title:'Nội dung mới',subtitle:'',description:'',tags:[],media:[],public:false};if(key==='journey'){item.date=new Date().toISOString().slice(0,10);item.end='';}if(key==='projects')Object.assign(item,{name:item.title,category:'Web',status:'In development',year:String(new Date().getFullYear()),icon:'↗',url:'',source:''});draft[key].push(item);changed();updateEntries(item.id);renderFields();};
  remove.onclick=()=>{const item=selected();if(!item||!confirm(`Xóa mục “${item.title}”? Nhấn Lưu thay đổi để áp dụng.`))return;draft[section.value]=draft[section.value].filter(x=>x!==item);changed();updateEntries();renderFields();};
  save.onclick=async()=>{
   try{validatePortfolio(draft);}catch(error){status.textContent=error.message;return;}
   const controls=[...dialog.querySelectorAll('input,select,textarea,button')],states=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);status.textContent='Đang lưu…';
   try{const result=await contentRequest('',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});if(epoch!==generation)return;draft.version=result.version;dirty=false;previewGuest=false;onSave({...normalizePortfolio(draft),adminView:true});setMediaTypes(draft.mediaTypes);status.classList.remove('unsaved');status.textContent='Đã lưu. Mục công khai đã lên trang; nội dung riêng tư chỉ admin được xem.';updateEntries(entry.value);}
   catch(error){status.textContent=error.message;}finally{controls.forEach((c,i)=>c.disabled=states[i]);}
  };
  reload.onclick=async()=>{if(dirty&&!confirm('Bỏ thay đổi chưa lưu và tải lại?'))return;try{const value=await contentRequest('admin');if(epoch!==generation)return;draft=normalizePortfolio(value);setMediaTypes(draft.mediaTypes);dirty=false;updateEntries();renderFields();status.textContent='Đã tải bản đã lưu.';}catch(error){status.textContent=error.message;}};
  chooseSection('profile');
 }
}
