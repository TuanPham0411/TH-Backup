/* hpham content editor. Changes are drafts until Save all succeeds. */
(() => {
  const trigger = document.getElementById('manageContentBtn');
  let draft, version, dirty = false, active = 'lines', busy = false, selectedLine = '';
  const overlay = document.createElement('div');
  overlay.className = 'content-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<section class="content-manager" role="dialog" aria-modal="true" aria-labelledby="contentTitle">
    <header><div><h2 id="contentTitle">Quản lý nội dung</h2><p>Dây chuyền, trạm MES, tài liệu và chức năng · MES owner</p></div><button type="button" data-action="close">Đóng</button></header>
    <nav aria-label="Quản lý nội dung"><button data-section="lines">Dây chuyền & trạm</button><button data-section="documents">Tài liệu</button><button data-section="functions">Chức năng MES</button></nav>
    <div class="manager-body"></div><footer><span class="manager-status" role="status"></span><button data-action="save" class="manager-primary">Lưu tất cả thay đổi</button></footer>
  </section>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector('.manager-body');
  const status = overlay.querySelector('.manager-status');
  const say = message => { status.textContent = message; };
  const mark = () => { dirty = true; say('Có thay đổi chưa lưu.'); };
  const element = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const action = (label, handler, danger = false) => {
    const button = element('button', label, danger ? 'manager-danger' : '');
    button.type = 'button'; button.addEventListener('click', handler); return button;
  };
  const field = (parent, label, value, update, options) => {
    const wrapper = element('label', label, 'manager-field');
    const input = element(options ? 'select' : 'input');
    if (options) options.forEach(option => {
      const node = element('option', option.label || option); node.value = option.value || option; input.appendChild(node);
    });
    else input.type = 'text';
    input.value = value || '';
    input.addEventListener(options || label === 'Mã dây chuyền' ? 'change' : 'input', () => { update(input.value.trim()); mark(); });
    wrapper.appendChild(input); parent.appendChild(wrapper); return input;
  };
  const card = title => { const node = element('section', '', 'manager-card'); node.appendChild(element('h3', title)); body.appendChild(node); return node; };
  const row = parent => { const node = element('div','','manager-fields'); parent.appendChild(node); return node; };
  const upload = (parent, onDone, imageOnly = false) => {
    const label = element('label', imageOnly ? 'Tải ảnh sơ đồ lên' : 'Tải tài liệu lên (tối đa 30 MB)', 'manager-field');
    const input = element('input'); input.type = 'file';
    input.accept = imageOnly ? '.png,.jpg,.jpeg,.webp' : '.pdf,.png,.jpg,.jpeg,.webp,.txt,.ps1,.bat,.cmd,.zip,.ttf,.exe,.lnk';
    label.appendChild(input); parent.appendChild(label);
    input.addEventListener('change', async () => {
      const file = input.files[0]; if (!file) return;
      if (file.size > 30 * 1024 * 1024) { say('Tệp vượt quá 30 MB.'); input.value=''; return; }
      busy = true; input.disabled = true; say('Đang tải tệp…');
      try {
        const response = await fetch(`/quick-access/api/content/upload?name=${encodeURIComponent(file.name)}`, {
          method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:file, credentials:'same-origin'
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        onDone(result.path, file); mark(); render(); say('Tệp đã tải lên. Bấm Lưu tất cả để đưa vào danh mục.');
      } catch(error) { say(error.message || 'Tải tệp thất bại.'); }
      finally { busy = false; input.disabled = false; }
    });
  };
  function renderLines() {
    const tools = card('Dây chuyền sản xuất');
    if (!draft.lines.some(line => line.id === selectedLine)) selectedLine = draft.defaultLine;
    const pickerLabel = element('label','Chọn dây chuyền cần quản lý','manager-field');
    const picker = element('select');
    draft.lines.forEach(line => { const option=element('option',line.name); option.value=line.id; picker.appendChild(option); });
    picker.value=selectedLine;
    picker.addEventListener('change',()=>{selectedLine=picker.value;render();});
    pickerLabel.appendChild(picker); tools.appendChild(pickerLabel);
    tools.appendChild(action('+ Thêm dây chuyền', () => {
      const id = `line_${Date.now()}`;
      draft.lines.push({ id, name:'NEW LINE', stations:[] }); selectedLine=id; mark(); render();
    }));
    field(tools, 'Dây chuyền mặc định', draft.defaultLine, value => draft.defaultLine=value,
      draft.lines.map(line => ({ value:line.id, label:line.name })));
    draft.lines.filter(line => line.id === selectedLine).forEach(line => {
      const section = card(line.name);
      const fields = row(section);
      field(fields, 'Mã dây chuyền', line.id, value => {
        const old = line.id;
        if (draft.lines.some(other => other !== line && other.id === value) || !/^[a-zA-Z0-9_-]+$/.test(value)) { say('Mã phải duy nhất, chỉ gồm chữ, số, - hoặc _.'); render(); return; }
        if (draft.layouts?.[old]) { draft.layouts[value]=draft.layouts[old]; delete draft.layouts[old]; }
        if (draft.defaultLine === old) draft.defaultLine=value;
        line.id=value;
        selectedLine=value;
      });
      field(fields, 'Tên hiển thị', line.name, value => { line.name=value; if(draft.layouts?.[line.id]) draft.layouts[line.id].name=value; });
      field(fields, 'Đường dẫn ảnh sơ đồ', draft.layouts?.[line.id]?.image || '', value => {
        draft.layouts ||= {};
        if (value) draft.layouts[line.id]={name:line.name,image:value}; else delete draft.layouts[line.id];
      });
      upload(fields, path => { draft.layouts ||= {}; draft.layouts[line.id]={name:line.name,image:path}; }, true);
      section.appendChild(action('Xóa dây chuyền', () => {
        if (draft.lines.length === 1) { say('Cần giữ ít nhất một dây chuyền.'); return; }
        if (!confirm(`Xóa ${line.name} và ${line.stations.length} trạm khỏi danh mục?`)) return;
        draft.lines = draft.lines.filter(other => other !== line);
        delete draft.layouts?.[line.id];
        if (draft.defaultLine===line.id) draft.defaultLine=draft.lines[0].id;
        mark(); render();
      }, true));
      section.appendChild(action('+ Thêm trạm / chức năng', () => {
        line.stations.push({operation:'NEW STATION',workCenter:'',displayWorkCenter:'',pcs:[]}); mark(); render();
      }));
      line.stations.forEach((station, index) => {
        const box = element('div','','manager-station'); section.appendChild(box);
        box.appendChild(element('h4',`${index+1}. ${station.operation}`));
        const inputs = row(box);
        field(inputs,'Tên trạm / chức năng',station.operation,value=>station.operation=value);
        field(inputs,'Work center',station.workCenter,value=>station.workCenter=value);
        field(inputs,'Work center hiển thị',station.displayWorkCenter,value=>station.displayWorkCenter=value);
        field(inputs,'Loại chức năng',station.type || 'station',value=>station.type=value,['station','management']);
        field(inputs,'Địa chỉ riêng (tùy chọn; hỗ trợ {domain}, {env})',station.url,value=>{if(value)station.url=value;else delete station.url;});
        field(inputs,'PC (phân cách bằng dấu phẩy)',(station.pcs || []).join(', '),value=>station.pcs=[...new Set(value.split(',').map(pc=>pc.trim()).filter(Boolean))]);
        box.appendChild(action('↑ Lên',()=>{if(index){[line.stations[index-1],line.stations[index]]=[station,line.stations[index-1]];mark();render();}}));
        box.appendChild(action('↓ Xuống',()=>{if(index<line.stations.length-1){[line.stations[index+1],line.stations[index]]=[station,line.stations[index+1]];mark();render();}}));
        box.appendChild(action('Xóa trạm',()=>{if(confirm(`Xóa trạm ${station.operation}?`)){line.stations.splice(index,1);mark();render();}},true));
      });
    });
  }
  function renderDocuments() {
    const tools = card('Danh mục tài liệu');
    tools.appendChild(element('p','Xóa khỏi danh mục sẽ giữ tệp gốc trên máy chủ. Các danh mục mới sẽ tự xuất hiện trong Guideline.'));
    tools.appendChild(action('+ Thêm tài liệu',()=>{draft.guidelines.push({title:'New document',description:'',category:'General',type:'PDF',path:''});mark();render();}));
    draft.guidelines.forEach((item,index)=>{
      const section = card(item.title);
      const fields = row(section);
      field(fields,'Tên tài liệu',item.title,value=>item.title=value);
      field(fields,'Mô tả',item.description,value=>item.description=value);
      field(fields,'Danh mục',item.category,value=>item.category=value);
      field(fields,'Loại tài liệu',item.type,value=>item.type=value,['PDF','Image','Text','PowerShell','BAT','Application','Font','ZIP','Shortcut']);
      field(fields,'Đường dẫn tệp (./resources/...)',item.path,value=>item.path=value);
      upload(fields,(path,file)=>{
        item.path=path;
        const ext=file.name.split('.').pop().toLowerCase();
        item.type=({pdf:'PDF',png:'Image',jpg:'Image',jpeg:'Image',webp:'Image',txt:'Text',ps1:'PowerShell',bat:'BAT',cmd:'BAT',zip:'ZIP',ttf:'Font',exe:'Application',lnk:'Shortcut'})[ext] || 'Text';
      });
      section.appendChild(action('Xóa tài liệu',()=>{if(confirm(`Xóa ${item.title} khỏi danh mục?`)){draft.guidelines.splice(index,1);mark();render();}},true));
    });
  }
  function renderFunctions() {
    const section = card('Địa chỉ và chức năng MES');
    section.appendChild(element('p','Các trạm dùng cấu hình này để tạo liên kết LIVE/TEST. Chức năng riêng có thể thêm bằng một trạm có địa chỉ riêng.'));
    const fields=row(section);
    for(const env of ['LIVE','TEST']) field(fields,`${env} domain (không có https://)`,draft.environments[env],value=>draft.environments[env]=value);
    field(fields,'Đường dẫn Management',draft.urls.managementPath,value=>draft.urls.managementPath=value);
    field(fields,'Đường dẫn Task (trước WorkCenter)',draft.urls.taskPath,value=>draft.urls.taskPath=value);
  }
  function render() {
    body.replaceChildren();
    overlay.querySelectorAll('[data-section]').forEach(button=>button.classList.toggle('active',button.dataset.section===active));
    if(active==='lines') renderLines(); else if(active==='documents') renderDocuments(); else renderFunctions();
  }
  function close() {
    if(busy) { say('Vui lòng đợi thao tác hiện tại hoàn tất.'); return; }
    if(dirty && !confirm('Đóng và bỏ các thay đổi chưa lưu?')) return;
    overlay.hidden=true; trigger.focus();
  }
  trigger.addEventListener('click',async()=>{
    try {
      const result = await api('/quick-access/api/content');
      draft=result.config; version=result.version; dirty=false;
      draft.layouts ||= {}; draft.guidelines ||= [];
      overlay.hidden=false; render(); say('Chỉnh sửa rồi bấm Lưu tất cả.'); overlay.querySelector('[data-action="close"]').focus();
    } catch(error) { alert(error.message); }
  });
  overlay.querySelector('[data-action="close"]').addEventListener('click',close);
  overlay.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>{if(!busy){active=button.dataset.section;render();}}));
  overlay.querySelector('[data-action="save"]').addEventListener('click',async()=>{
    if(busy) return;
    busy=true; say('Đang lưu…');
    try {
      const result=await api('/quick-access/api/content','PUT',{config:draft,version});
      version=result.version; dirty=false; location.reload();
    } catch(error) { say(error.message); }
    finally { busy=false; }
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && !overlay.hidden){event.stopImmediatePropagation();close();}},true);
  overlay.addEventListener('keydown',event=>{
    if(event.key!=='Tab') return;
    const focusable=[...overlay.querySelectorAll('button,input,select')].filter(node=>!node.disabled && node.getClientRects().length);
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  });
})();
