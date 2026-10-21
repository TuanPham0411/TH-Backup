#!/usr/bin/env python3
"""Root storage broker: verified copies and private filesystem images; never format USB devices."""
import json, os, socketserver, subprocess, shutil, threading, hashlib, time, uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler
CONFIG=Path('/etc/th-app/storage.json')
INTERNAL=Path('/var/lib/th-app/files')
SOCKET='/run/th-storage/control.sock'
RUNTIME=Path('/run/th-storage')
SYSTEMD_ROOT=Path('/etc/systemd/system')
PG_VOLUME_ROOT=Path('/var/lib/postgresql/th-volumes')
LOCK=threading.Lock()

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs).stdout

def config():
    return json.loads(CONFIG.read_text()) if CONFIG.exists() else {'volumes':[], 'primary':'internal', 'overflow':None}

def save(value):
    tmp=CONFIG.with_suffix('.tmp'); tmp.write_text(json.dumps(value)); tmp.chmod(0o600)
    with tmp.open('rb') as file:os.fsync(file.fileno())
    tmp.replace(CONFIG)

def devices():
    data=json.loads(run(['lsblk','--json','--output','NAME,PATH,TYPE,TRAN,RM,UUID,MOUNTPOINTS,FSTYPE']))
    result=[]
    def visit(item, usb=False):
        usb=usb or item.get('tran')=='usb' or item.get('rm') is True
        mountpoints=[v for v in item.get('mountpoints') or [] if v]
        if usb and item.get('uuid') and not mountpoints:
            result.append({'id':item['uuid'],'device':item['path'],'filesystem':item.get('fstype'),'mount':None})
        for mount in mountpoints:
            if not mount or not usb or not item.get('uuid'): continue
            path=Path(mount).resolve()
            if not (str(path).startswith('/mnt/') or str(path).startswith('/media/')): continue
            info=os.statvfs(path)
            result.append({'id':item['uuid'],'mount':str(path),'device':item['path'],'filesystem':item.get('fstype'), 'free':info.f_bavail*info.f_frsize,'total':info.f_blocks*info.f_frsize})
        for child in item.get('children',[]):visit(child,usb)
    for item in data['blockdevices']:visit(item)
    return result

def disks():
    return [d for d in devices() if d.get('mount')]

def root_for(volume, mounted):
    disk=next((d for d in mounted if d['id']==volume['id']),None)
    if not disk: raise ValueError('USB is disconnected or not mounted')
    root=Path(disk['mount'])/'th-mes-storage'
    if root.is_symlink() or not root.is_dir() or (root/'.th-mes-volume').is_symlink() or (root/'.th-mes-volume').read_text().strip()!=volume['id']:
        raise ValueError('USB storage identity differs')
    return root

def roots(c, mounted):
    entries=location_entries(c,mounted)
    entries.sort(key=lambda e:e['key']!=c['primary'])
    return [Path(e['path']) for e in entries if e['online']]

def relative(value):
    path=Path(value)
    if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] not in ('issues','media','.uploads','.cache'):
        raise ValueError('Invalid storage path')
    return path

def resolve(data):
    c=config(); mounted=disks(); rel=relative(data['path']); available=roots(c,mounted)
    # Existing slots and resumed uploads always remain on their original device.
    for root in available:
        file=root/rel
        if file.exists():
            if data.get('write') and os.statvfs(root).f_bavail*os.statvfs(root).f_frsize<64*1024*1024:raise ValueError('Selected storage is nearly full; retry on the configured USB drive')
            if file.is_symlink() or not file.resolve().is_relative_to(root.resolve()): raise ValueError('Invalid storage file')
            return {'path':str(file),'root':str(root)}
    if not data.get('write'):
        if len(available)!=1+len(c['volumes'])+len(c.get('locations',[])):raise ValueError('A registered USB drive is disconnected; reconnect it to access this file')
        raise FileNotFoundError('File unavailable')
    id=c['primary']
    selected=next((e for e in location_entries(c,mounted) if e['key']==id and e['online']),None)
    if selected and selected['device']=='internal':
        info=os.statvfs(selected['path'])
        if info.f_bavail*info.f_frsize<512*1024*1024 and c.get('overflow'):id=c['overflow']
    entry=next((e for e in location_entries(c,mounted) if e['key']==id and e['online']),None)
    if not entry:raise ValueError('Selected storage folder is disconnected')
    root=Path(entry['path'])
    if os.statvfs(root).f_bavail*os.statvfs(root).f_frsize<64*1024*1024:raise ValueError('Selected storage has insufficient free space')
    dest=root/rel
    if not dest.resolve().is_relative_to(root.resolve()):raise ValueError('Invalid storage path')
    return {'path':str(dest),'root':str(root)}

def dump_database(path):
    # Peer authentication; no application password in argv, logs or backup metadata.
    with path.open('xb') as output:
        subprocess.run(['runuser','-u','postgres','--','pg_dump','--format=custom','--no-owner','th_app'],stdout=output,stderr=subprocess.PIPE,check=True)

def cloud_index():
    exists=run(['runuser','-u','postgres','--','psql','-d','th_app','-At','-c',"select to_regclass('public.mes_cloud_files') is not null"]).strip()
    if exists!='t':return {}
    raw=run(['runuser','-u','postgres','--','psql','-d','th_app','-At','-c',"select coalesce(json_agg(c),'[]'::json) from public.mes_cloud_files c"])
    return {row['path']:row for row in json.loads(raw)}

def download_cloud_file(record,destination):
    import urllib.request,urllib.parse
    credentials=json.loads(Path(os.environ.get('DRIVE_TOKEN_FILE',str(INTERNAL.parent/'drive-credentials.json'))).read_text())
    client=os.environ.get('GOOGLE_DRIVE_CLIENT_ID') or os.environ.get('GOOGLE_CLIENT_ID')
    secret=os.environ.get('GOOGLE_DRIVE_CLIENT_SECRET') or os.environ.get('GOOGLE_CLIENT_SECRET')
    if not client or not secret:raise ValueError('Google OAuth configuration is missing from the storage service')
    body=urllib.parse.urlencode({'client_id':client,'client_secret':secret,'refresh_token':credentials['refreshToken'],'grant_type':'refresh_token'}).encode()
    with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token',data=body),timeout=30) as response:token=json.load(response)['access_token']
    request=urllib.request.Request('https://www.googleapis.com/drive/v3/files/'+urllib.parse.quote(record['drive_id'],safe='')+'?alt=media',headers={'Authorization':'Bearer '+token,'Accept-Encoding':'identity'})
    checksum=hashlib.md5();size=0
    with urllib.request.urlopen(request,timeout=180) as response,destination.open('xb') as output:
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            checksum.update(chunk);size+=len(chunk);output.write(chunk)
    if checksum.hexdigest()!=record['checksum'] or size!=int(record['size']):raise ValueError('Cloud backup checksum differs; backup was not marked complete')

def snapshot(destination, c, mounted, hardlinks=False):
    active=roots(c,mounted)
    remote=cloud_index()
    # Verify all referenced completed files before declaring a complete backup.
    expected=run(['runuser','-u','postgres','--','psql','-d','th_app','-At','-c',"select path from public.files union all select 'media/'||id from public.mes_media where ready"] ).splitlines()
    for name in expected:
        rel=relative(name)
        if name not in remote and not any((root/rel).is_file() for root in active):raise ValueError('A referenced media file is missing; backup was not started')
    destination.mkdir(mode=0o700)
    dump_database(destination/'database.dump')
    target=destination/'files';target.mkdir(mode=0o700)
    count=0;total=0;external={}
    with (destination/'files.sha256').open('w') as checksums:
        for root in active:
            for folder in ('issues','media'):
                origin=root/folder
                if not origin.exists():continue
                for source in origin.rglob('*'):
                    if source.is_symlink():raise ValueError('Symlink is not a backup source')
                    if not source.is_file() or source.name.endswith('.tmp'):continue
                    rel=source.relative_to(root);dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                    if str(rel) in remote:
                        with source.open('rb') as original:
                            if hashlib.file_digest(original,'md5').hexdigest()!=remote[str(rel)]['checksum']:raise ValueError('Local and cloud originals differ; resolve the conflict before backup')
                    if dest.exists():
                        if digest_file(dest)!=digest_file(source):raise ValueError('Conflicting storage paths; no data was overwritten')
                        continue
                    if hardlinks:
                        try:os.link(source,dest)
                        except OSError:
                            external[str(rel)]={'path':str(source),'bytes':source.stat().st_size,'modifiedNs':source.stat().st_mtime_ns}
                            count+=1;total+=source.stat().st_size
                            continue
                    else:shutil.copyfile(source,dest)
                    with dest.open('rb') as copied:digest=hashlib.file_digest(copied,'sha256').hexdigest()
                    checksums.write(digest+'  files/'+str(rel)+'\n');count+=1;total+=dest.stat().st_size
        for relative_name,record in remote.items():
            dest=target/relative(relative_name)
            if dest.exists():continue
            if hardlinks:
                external[relative_name]={'provider':'drive','driveId':record['drive_id'],'bytes':int(record['size']),'checksum':record['checksum']}
            else:
                dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700);download_cloud_file(record,dest);checksums.write(digest_file(dest)+'  files/'+relative_name+'\n')
            count+=1;total+=int(record['size'])
        with (destination/'database.dump').open('rb') as dump:checksums.write(hashlib.file_digest(dump,'sha256').hexdigest()+'  database.dump\n')
    manifest={'version':1,'mode':'deployment-rollback' if hardlinks else 'full-usb-backup','externalMediaReferences':external,'createdAt':int(time.time()*1000),'files':count,'bytes':total,'complete':True,'database':'database.dump','media':'files','urls':'Unchanged: restore the same database IDs and relative file paths.','excluded':'Runtime secrets and active upload fragments.','volumes':[v['id'] for v in c['volumes']]}
    (destination/'manifest.json').write_text(json.dumps(manifest));os.sync()
    return manifest

# Managed folders are keyed independently of the device UUID, so changing folders
# never changes the relative issue/media URLs kept in PostgreSQL.
def location_entries(c,mounted):
    entries=[{'key':'internal','device':'internal','path':str(INTERNAL),'online':True,'name':'SD card / original files'}]
    for volume in c['volumes']:
        try:path=str(root_for(volume,mounted));online=True
        except (ValueError,OSError):path=None;online=False
        entries.append({'key':volume['id'],'device':volume['id'],'path':path,'online':online,'name':'USB / legacy folder'})
    for item in c.get('locations',[]):
        try:
            base=location_base(item['device'],mounted);path=base/item['folder']
            if path.is_symlink() or not path.resolve().is_relative_to(base.resolve()) or (path/'.th-mes-location').read_text().strip()!=item['key']:raise ValueError('Folder identity differs')
            online=True
        except (OSError,ValueError):path=None;online=False
        entries.append({**item,'path':str(path) if path else None,'online':online})
    for entry in entries:
        entry['primary']=entry['key']==c['primary']
        if entry['online']:
            info=os.statvfs(entry['path']);entry.update(free=info.f_bavail*info.f_frsize,total=info.f_blocks*info.f_frsize)
    return entries

def location_base(device,mounted,database=False):
    if device=='internal':return Path('/var/lib/postgresql/th-storage') if database else INTERNAL.parent/'storage'
    disk=next((d for d in mounted if d['id']==device),None)
    if not disk:raise ValueError('Selected USB is disconnected or not mounted')
    return Path(disk['mount'])

def folder_value(value):
    if not isinstance(value,str) or not value.strip() or len(value)>240:raise ValueError('Enter a relative folder name')
    value=value.strip();path=Path(value)
    if path.is_absolute() or any(p in ('.','..') or p.startswith('.') for p in path.parts) or any(ord(ch)<32 or ch in ':\\' for ch in value):raise ValueError('Use a relative folder without .. or hidden components')
    return str(path)

def safe_folder(base,folder):
    root=base/folder_value(folder)
    for parent in [root,*root.parents]:
        if parent==base.parent:break
        if parent.is_symlink():raise ValueError('Symlinks cannot be storage folders')
    if not root.resolve().is_relative_to(base.resolve()):raise ValueError('Folder must be inside the selected device')
    return root

def create_parents(root,base,owner='thapp'):
    import pwd
    user=pwd.getpwnam(owner)
    for folder in reversed([root,*root.parents]):
        if folder==base or folder.is_relative_to(base):
            if not folder.exists():
                folder.mkdir(mode=0o700)
                try:os.chown(folder,user.pw_uid,user.pw_gid)
                except PermissionError:pass
    return user

def register_location(c,data,mounted):
    device=data.get('device');base=location_base(device,mounted);folder=folder_value(data.get('folder'));root=safe_folder(base,folder)
    if c.get('database'):
        database=c['database'];dbroot=location_base(database['device'],mounted,database=True)/database['folder']
        if root.resolve().is_relative_to(dbroot.resolve()) or dbroot.resolve().is_relative_to(root.resolve()):raise ValueError('Keep media outside the PostgreSQL folder')
    existing=location_entries(c,mounted)
    for entry in existing:
        if entry['online']:
            old=Path(entry['path'])
            if root.resolve()==old.resolve():return entry['key']
            if root.resolve().is_relative_to(old.resolve()) or old.resolve().is_relative_to(root.resolve()):raise ValueError('Choose a separate folder, outside existing managed storage folders')
    if root.exists() and any(root.iterdir()):raise ValueError('The destination is not empty. Choose an empty/new folder; no existing content was changed')
    create_parents(root,base)
    key='folder-'+uuid.uuid4().hex
    (root/'.th-mes-location').write_text(key)
    run(['runuser','-u','thapp','--','test','-w',str(root)])
    c.setdefault('locations',[]).append({'key':key,'device':device,'folder':folder,'name':folder})
    return key

def browse_folders(data,mounted):
    base=location_base(data.get('device'),mounted);folder=data.get('folder','')
    root=safe_folder(base,folder) if folder else base
    if not root.exists():return {'base':str(base),'path':str(root),'folders':[]}
    return {'base':str(base),'path':str(root),'folders':[p.name for p in sorted(root.iterdir()) if p.is_dir() and not p.is_symlink() and not p.name.startswith('.')][:150]}

def transfer_plan(c,data,mounted):
    entries=location_entries(c,mounted);target=next((v for v in entries if v['key']==data.get('target') and v['online']),None)
    if not target:raise ValueError('Choose an available destination folder')
    sources=[v for v in entries if v['key']!=target['key'] and (data.get('source')=='all' or v['key']==data.get('source'))]
    if not sources or any(not v['online'] for v in sources):raise ValueError('Connect all selected source drives first')
    files=[];dest=Path(target['path']);required=0
    for source in sources:
        root=Path(source['path'])
        for category in ('issues','media'):
            for path in (root/category).rglob('*') if (root/category).exists() else []:
                if path.is_symlink():raise ValueError('Symlink found in the source')
                if not path.is_file() or path.name.endswith('.tmp'):continue
                relative=path.relative_to(root);to=dest/relative
                if not to.resolve().is_relative_to(dest.resolve()) or to.is_symlink():raise ValueError('Invalid destination path')
                size=path.stat().st_size
                if to.exists() and to.stat().st_size!=size:raise ValueError('A destination file differs; no file will be overwritten')
                if not to.exists():required+=size
                files.append({'source':str(path),'destination':str(to),'relative':str(relative),'bytes':size,'sourceKey':source['key']})
    if target['free']<required+64*1024*1024:raise ValueError('Destination has insufficient free space')
    return {'source':data.get('source'),'target':target['key'],'destination':str(dest),'count':len(files),'bytes':sum(f['bytes'] for f in files),'requiredBytes':required,'free':target['free'],'files':files}

def digest_file(path):
    with Path(path).open('rb') as file:return hashlib.file_digest(file,'sha256').hexdigest()

def atomic_publish(temporary,destination):
    try:os.link(temporary,destination);Path(temporary).unlink();return
    except OSError as error:
        import errno
        if error.errno not in (errno.EXDEV,errno.EPERM,errno.EOPNOTSUPP,errno.ENOSYS):raise
    # Linux renameat2 is atomic and supports NOREPLACE on exFAT as well as ext4.
    import ctypes
    libc=ctypes.CDLL(None,use_errno=True)
    if not hasattr(libc,'renameat2'):raise ValueError('Kernel does not support safe publishing on this filesystem')
    if libc.renameat2(-100,os.fsencode(temporary),-100,os.fsencode(destination),1)!=0:
        code=ctypes.get_errno();raise OSError(code,os.strerror(code))

def write_journal(directory,value):
    temporary=directory/'manifest.tmp';temporary.write_text(json.dumps(value));temporary.replace(directory/'manifest.json')

def transfer_files(c,data,mounted):
    if data.get('mode') not in ('copy','move'):raise ValueError('Choose Copy or Move')
    plan=transfer_plan(c,data,mounted)
    journal=INTERNAL.parent/'storage-operations'/uuid.uuid4().hex;journal.mkdir(parents=True,mode=0o700)
    state={k:v for k,v in plan.items() if k!='files'};state.update(kind='files',mode=data['mode'],state='running',phase='copy',createdAt=int(time.time()*1000),copied=0,removed=0)
    marker=(RUNTIME/'backup-active');marker.write_text('file-transfer')
    verified=[]
    try:
        write_journal(journal,state)
        for record in plan['files']:
            source=Path(record['source']);dest=Path(record['destination']);expected=digest_file(source)
            if dest.exists():
                if digest_file(dest)!=expected:raise ValueError('Conflicting destination file; source was kept unchanged')
            else:
                dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                # New native filesystem directories must remain usable by thapp.
                import pwd
                user=pwd.getpwnam('thapp')
                for folder in [dest.parent,*dest.parent.parents]:
                    if str(folder)==plan['destination']:break
                    try:os.chown(folder,user.pw_uid,user.pw_gid)
                    except PermissionError:pass
                temp=dest.with_name(dest.name+'.'+uuid.uuid4().hex+'.tmp')
                try:
                    shutil.copyfile(source,temp)
                    if digest_file(temp)!=expected:raise ValueError('Copied data checksum differs; originals were retained')
                    try:os.chown(temp,user.pw_uid,user.pw_gid)
                    except PermissionError:pass
                    atomic_publish(temp,dest)
                finally:temp.unlink(missing_ok=True)
            verified.append({**record,'sha256':expected});state['copied']+=1;write_journal(journal,state)
        os.sync()
        state['phase']='verify';write_journal(journal,state)
        for record in verified:
            if digest_file(record['destination'])!=record['sha256']:raise ValueError('Destination verification failed; originals were retained')
        # Activate first. Even an interrupted removal still resolves every original URL.
        if data.get('activate',True) or data['mode']=='move':c['primary']=plan['target'];save(c)
        state['phase']='remove-source' if data['mode']=='move' else 'complete';write_journal(journal,state)
        if data['mode']=='move':
            for record in verified:
                fresh=location_entries(config(),disks())
                if not any(e['key']==plan['target'] and e['online'] for e in fresh):raise ValueError('Destination drive disconnected; remaining originals were kept')
                if digest_file(record['destination'])!=record['sha256'] or digest_file(record['source'])!=record['sha256']:raise ValueError('A file changed; remaining originals were kept')
                Path(record['source']).unlink();state['removed']+=1;write_journal(journal,state)
        state.update(state='complete',phase='complete',finishedAt=int(time.time()*1000));write_journal(journal,state)
        return state
    except Exception as error:
        state.update(state='failed',error=str(error)[:250]);write_journal(journal,state);raise
    finally:marker.unlink(missing_ok=True)

def cluster_info():
    directory=run(['runuser','-u','postgres','--','psql','-d','th_app','-At','-c','show data_directory'],timeout=10).strip()
    import re
    if not re.fullmatch(r'/var/lib/postgresql/[0-9]+/[A-Za-z0-9_-]+',directory):raise ValueError('This PostgreSQL layout needs an operator migration')
    version,name=Path(directory).parts[-2:]
    return {'directory':directory,'version':version,'name':name,'unit':'postgresql@'+version+'-'+name+'.service'}

def database_status(c,mounted):
    configured=c.get('database')
    if configured:
        online=configured['device']=='internal' or any(d['id']==configured['device'] for d in mounted)
        return {**configured,'online':online,'oldCopyRetained':True}
    try:return {**cluster_info(),'device':'internal','online':True,'oldCopyRetained':False}
    except (OSError,ValueError,subprocess.SubprocessError):return {'device':'internal','online':False}

def database_plan(c,data,mounted):
    cluster=cluster_info();base=location_base(data.get('device'),mounted,database=True);root=safe_folder(base,data.get('folder'))
    for entry in location_entries(c,mounted):
        if entry['online'] and (root.resolve().is_relative_to(Path(entry['path']).resolve()) or Path(entry['path']).resolve().is_relative_to(root.resolve())):raise ValueError('Use a database folder separate from media storage')
    source=Path(cluster['directory']);size=0;files=0
    for path in source.rglob('*'):
        if path.is_symlink():raise ValueError('External PostgreSQL tablespaces/symlinks need an operator migration')
        if path.is_file():size+=path.stat().st_size;files+=1
    if root.exists() and any(root.iterdir()):raise ValueError('Choose a new/empty PostgreSQL destination folder')
    native=data.get('device')=='internal' or next(d for d in mounted if d['id']==data['device'])['filesystem'] in ('ext4','ext3','xfs','btrfs')
    gib=data.get('sizeGiB',max(2,(size*2+536870912+1073741823)//1073741824))
    if not isinstance(gib,int) or not 1<=gib<=128:raise ValueError('Image size must be 1–128 GiB')
    required=size*1.25+128*1024*1024 if native else gib*1073741824
    if not native and required<size*1.5+256*1024*1024:raise ValueError('The ext4 image is too small for the database')
    if not native and next(d for d in mounted if d['id']==data['device'])['filesystem']=='vfat' and gib>=4:raise ValueError('FAT32 cannot hold a 4 GiB image; use exFAT or ext4')
    probe=base
    while not probe.exists():probe=probe.parent
    info=os.statvfs(probe);free=info.f_bavail*info.f_frsize
    if free<required+128*1024*1024:raise ValueError('Not enough destination space for the PostgreSQL move')
    return {**cluster,'source':str(source),'destination':str(root),'device':data['device'],'folder':folder_value(data['folder']),'native':native,'sizeGiB':gib,'bytes':size,'files':files,'requiredBytes':int(required),'free':free,'oldCopyRetained':True}

def database_fingerprint():
    return run(['runuser','-u','postgres','--','psql','-d','th_app','-At','-c',"select count(*)::text||':'||md5(coalesce(string_agg(collection||':'||id||':'||data::text,E'\\n' order by collection,id),'')) from mes_private.records where collection='issues' or collection like 'issues/%/timeline'"],timeout=30).strip()

def verify_tree(source,destination):
    count=0
    for path in Path(source).rglob('*'):
        if path.is_symlink():raise ValueError('Unexpected PostgreSQL symlink')
        if path.is_file():
            target=Path(destination)/path.relative_to(source)
            if not target.is_file() or digest_file(path)!=digest_file(target):raise ValueError('PostgreSQL copy checksum failed; original database was kept')
            count+=1
    return count

def prepare_database_target(plan,key):
    root=Path(plan['destination']);base=location_base(plan['device'],disks(),database=True)
    create_parents(root,base,owner='postgres')
    (root/'.th-mes-database').write_text(key)
    if plan['native']:
        target=root/'data';target.mkdir(mode=0o700)
    else:
        if not shutil.which('mkfs.ext4'):raise ValueError('mkfs.ext4 is required to create a private database image; the USB is never formatted')
        image=root/'pgdata.ext4'
        fd=os.open(image,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        try:os.ftruncate(fd,plan['sizeGiB']*1073741824)
        finally:os.close(fd)
        run(['mkfs.ext4','-F','-q',str(image)],timeout=600)
        parent=PG_VOLUME_ROOT;parent.mkdir(exist_ok=True,mode=0o755);parent.chmod(0o755)
        loop=parent/key;loop.mkdir(mode=0o755);loop.chmod(0o755)
        run(['mount','-o','loop,nodev,nosuid,noexec',str(image),str(loop)],timeout=60)
        target=loop/'data';target.mkdir(mode=0o700)
    import pwd
    user=pwd.getpwnam('postgres');os.chown(target,user.pw_uid,user.pw_gid)
    return target

def move_database(c,data,mounted):
    plan=database_plan(c,data,mounted);key='pg-'+uuid.uuid4().hex
    journal=INTERNAL.parent/'storage-operations'/key;journal.mkdir(parents=True,mode=0o700)
    state={**plan,'kind':'database','state':'running','phase':'prepare','createdAt':int(time.time()*1000)}
    marker=(RUNTIME/'backup-active');marker.write_text('database-transfer')
    stopped=False;bound=False;renamed=None;committed=False;target=None
    try:
        write_journal(journal,state);target=prepare_database_target(plan,key)
        dump_database(journal/'database.dump')
        expected=database_fingerprint()
        state['phase']='stop-database';write_journal(journal,state)
        stopped=True;run(['systemctl','stop',plan['unit']],timeout=120)
        source=Path(plan['source'])
        state['phase']='copy-database';write_journal(journal,state)
        # PostgreSQL is fully stopped. No WAL or relation files can change now.
        shutil.copytree(source,target,dirs_exist_ok=True,copy_function=shutil.copy2)
        import pwd
        user=pwd.getpwnam('postgres')
        for path in [target,*target.rglob('*')]:os.chown(path,user.pw_uid,user.pw_gid)
        state['verifiedFiles']=verify_tree(source,target);os.sync()
        state['phase']='start-new-database';write_journal(journal,state)
        if not os.path.ismount(source):
            renamed=source.with_name(source.name+'.before-'+key)
            source.rename(renamed);source.mkdir(mode=0o700);os.chown(source,user.pw_uid,user.pw_gid)
        run(['mount','--bind',str(target),str(source)],timeout=30);bound=True
        run(['systemctl','start',plan['unit']],timeout=120);stopped=False
        actual=database_fingerprint()
        if actual!=expected:raise ValueError('Ticket/history check failed on the new database')
        value={k:plan[k] for k in ('device','folder','directory','version','name','unit','native','sizeGiB')}
        value.update(key=key,dataPath=str(target),previousCopy=str(renamed) if renamed else c.get('database',{}).get('dataPath'),movedAt=int(time.time()*1000),fingerprint=actual)
        # Boot dependency prevents PostgreSQL from falling back to an empty SD directory.
        c['database']=value;save(c);committed=True
        dropin=SYSTEMD_ROOT/(plan['unit']+'.d');dropin.mkdir(exist_ok=True)
        dependency=dropin/'th-storage.conf';dependency.write_text('[Unit]\nRequires=th-storage-mounts.service\nAfter=th-storage-mounts.service\n')
        run(['systemctl','daemon-reload'],timeout=30)
        state.update(state='complete',phase='complete',oldCopyRetained=True,finishedAt=int(time.time()*1000));write_journal(journal,state)
        return state
    except Exception as error:
        if not committed:
            if bound:
                try:stopped=True;run(['systemctl','stop',plan['unit']],timeout=120)
                except subprocess.SubprocessError:pass
                run(['umount',plan['source']],timeout=30)
            if renamed:
                Path(plan['source']).rmdir();renamed.rename(plan['source'])
            if stopped:run(['systemctl','start',plan['unit']],timeout=120)
        state.update(state='failed',error=str(error)[:250],originalRetained=True);write_journal(journal,state);raise
    finally:marker.unlink(missing_ok=True)

def restore_database_mounts():
    c=config();value=c.get('database')
    if not value:return
    mounted=disks()
    if value['device']!='internal' and not any(d['id']==value['device'] for d in mounted):
        dispatch('mount',{'id':value['device']});mounted=disks()
    base=location_base(value['device'],mounted,database=True);root=safe_folder(base,value['folder'])
    if (root/'.th-mes-database').read_text().strip()!=value['key']:raise ValueError('PostgreSQL storage identity differs; refusing to start')
    if value['native']:target=root/'data'
    else:
        image=root/'pgdata.ext4';parent=PG_VOLUME_ROOT;parent.mkdir(exist_ok=True,mode=0o755);parent.chmod(0o755);loop=parent/value['key'];loop.mkdir(exist_ok=True,mode=0o755);loop.chmod(0o755)
        if not os.path.ismount(loop):run(['mount','-o','loop,nodev,nosuid,noexec',str(image),str(loop)],timeout=60)
        target=loop/'data'
    if not (target/'PG_VERSION').is_file() or (target/'PG_VERSION').read_text().strip()!=value['version']:raise ValueError('Database storage is missing or has an unexpected PostgreSQL version')
    original=Path(value['directory'])
    if original.exists() and os.path.samefile(original,target):return
    if original.exists() and (original/'PG_VERSION').exists():raise ValueError('A different database is already mounted; operator review required')
    original.mkdir(mode=0o700,exist_ok=True)
    run(['mount','--bind',str(target),str(original)],timeout=30)

def dispatch(action,data):
    c=config(); mounted=disks()
    if action=='status':
        info=os.statvfs(INTERNAL)
        backups=[]
        for disk in mounted:
            parent=Path(disk['mount'])/'th-mes-backups'
            if parent.is_symlink():continue
            for m in sorted(parent.glob('*/manifest.json'),reverse=True)[:10]:
                try:backups.append({'folder':str(m.parent),**json.loads(m.read_text())})
                except (OSError,ValueError):pass
        operations=[]
        for manifest in sorted((INTERNAL.parent/'storage-operations').glob('*/manifest.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:10]:
            try:operations.append(json.loads(manifest.read_text()))
            except (OSError,ValueError):pass
        return {**c,'locationsAvailable':location_entries(c,mounted),'operations':operations,'cloudOperation':json.loads((RUNTIME/'cloud-operation.json').read_text()) if (RUNTIME/'cloud-operation.json').exists() else None,'database':database_status(c,mounted),'unmounted':[d for d in devices() if not d.get('mount')],'disks':mounted,'internal':{'free':info.f_bavail*info.f_frsize,'total':info.f_blocks*info.f_frsize},'backups':backups}
    if action=='destination':
        entry=next((e for e in location_entries(c,mounted) if e['key']==data.get('key') and e['online']),None)
        if not entry:raise ValueError('Destination storage is unavailable')
        root=Path(entry['path']);path=root/relative(data['path'])
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):raise ValueError('Invalid destination path')
        return {'path':str(path)}
    if action=='cloudBegin':
        marker=RUNTIME/'backup-active'
        if marker.exists() or (RUNTIME/'cloud-operation.json').exists():raise ValueError('Another storage operation is running or needs recovery')
        id=uuid.uuid4().hex;(RUNTIME/'cloud-operation.json').write_text(json.dumps({'id':id,'startedAt':int(time.time()*1000)}));marker.write_text('cloud-operation');return {'id':id}
    if action=='cloudDatabaseDump':
        operation=json.loads((RUNTIME/'cloud-operation.json').read_text())
        if operation['id']!=data.get('id'):raise ValueError('Invalid operation')
        directory=INTERNAL.parent/'cloud-staging';directory.mkdir(mode=0o700,exist_ok=True)
        import pwd
        user=pwd.getpwnam('thapp');os.chown(directory,user.pw_uid,user.pw_gid)
        path=directory/(operation['id']+'.dump');dump_database(path);os.chown(path,user.pw_uid,user.pw_gid);return {'path':str(path),'size':path.stat().st_size}
    if action=='cloudEnd':
        operation=json.loads((RUNTIME/'cloud-operation.json').read_text())
        if operation['id']!=data.get('id'):raise ValueError('Invalid operation')
        (INTERNAL.parent/'cloud-staging'/(operation['id']+'.dump')).unlink(missing_ok=True);(RUNTIME/'cloud-operation.json').unlink();(RUNTIME/'backup-active').unlink(missing_ok=True);return {'ok':True}
    if action=='browse':return browse_folders(data,mounted)
    if action=='register':
        key=register_location(c,data,mounted)
        if data.get('activate'):c['primary']=key
        save(c);return {'key':key}
    if action=='transferPlan':
        plan=transfer_plan(c,data,mounted);return {k:v for k,v in plan.items() if k!='files'}
    if action=='transfer':return transfer_files(c,data,mounted)
    if action=='databasePlan':return database_plan(c,data,mounted)
    if action=='databaseMove':return move_database(c,data,mounted)
    if action=='mount':
        id=data.get('id','')
        if not isinstance(id,str) or not id or any(ch not in '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-' for ch in id):raise ValueError('Invalid drive identity')
        disk=next((d for d in devices() if d['id']==id and not d.get('mount')),None)
        if not disk:raise ValueError('Select an unmounted USB partition')
        fs=disk.get('filesystem')
        if fs not in ('ext4','ext3','xfs','btrfs','exfat','vfat','ntfs','ntfs3'):raise ValueError('Unknown filesystem. Ask the Pi administrator to prepare the drive; existing data was not changed')
        mount=Path('/mnt')/('th-usb-'+id)
        if mount.is_symlink():raise ValueError('Invalid mount directory')
        mount.mkdir(mode=0o700,exist_ok=True)
        if any(mount.iterdir()):raise ValueError('Mount directory must be empty')
        options='nodev,nosuid,noexec,noatime'
        if fs in ('exfat','vfat','ntfs','ntfs3'):
            import pwd
            user=pwd.getpwnam('thapp');options+=',uid='+str(user.pw_uid)+',gid='+str(user.pw_gid)+',umask=0077'
        run(['mount','-o',options,'UUID='+id,str(mount)])
        # Keep an existing fstab entry intact. Otherwise persist this UUID for reboot.
        fstab=Path('/etc/fstab');text=fstab.read_text()
        if not any(line.split('#')[0].split() and line.split('#')[0].split()[0] in ('UUID='+id,disk['device'],'/dev/disk/by-uuid/'+id) for line in text.splitlines()):
            with fstab.open('a') as f:f.write('\n# TH MES USB (existing partition, never formatted)\nUUID='+id+' '+str(mount)+' '+fs+' '+options+',nofail,x-systemd.device-timeout=10 0 0\n')
        return {'ok':True,'mount':str(mount)}
    if action=='locations':
        available=roots(c,mounted)
        if len(available)!=1+len(c['volumes'])+len(c.get('locations',[])):raise ValueError('Reconnect all storage drives before deleting files')
        rel=relative(data['path']);paths=[]
        for root in available:
            path=root/rel
            if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):raise ValueError('Invalid storage path')
            if path.exists():paths.append(str(path))
        return {'paths':paths}
    if action=='resolve':return resolve(data)
    if action=='select':
        id=data.get('id');mode=data.get('mode','primary')
        if mode not in ('primary','overflow'):raise ValueError('Invalid storage mode')
        known=next((l for l in location_entries(c,mounted) if l['key']==id and l['online']),None)
        if id not in ('internal',None) and known is None:
            disk=next((d for d in mounted if d['id']==id),None)
            if not disk:raise ValueError('Select a mounted USB drive')
            # Portable filesystems use the mount-level private uid/gid and umask.
            if disk['filesystem'] not in ('ext4','ext3','xfs','btrfs','exfat','vfat','ntfs','ntfs3'):raise ValueError('Unsupported filesystem; no drive is formatted by this application')
            root=Path(disk['mount'])/'th-mes-storage'
            if root.is_symlink():raise ValueError('Invalid storage directory')
            if root.exists() and not (root/'.th-mes-volume').exists() and any(root.iterdir()):raise ValueError('Directory already contains unrelated files')
            root.mkdir(mode=0o700,exist_ok=True)
            import pwd
            user=pwd.getpwnam('thapp')
            portable=disk['filesystem'] in ('exfat','vfat','ntfs','ntfs3')
            if not portable:os.chown(root,user.pw_uid,user.pw_gid);root.chmod(0o700)
            marker=root/'.th-mes-volume'
            if marker.is_symlink() or (marker.exists() and marker.read_text().strip()!=id):raise ValueError('Volume marker differs')
            marker.write_text(id)
            if not portable:marker.chmod(0o444)
            run(['runuser','-u','thapp','--','test','-w',str(root)])
            if not any(v['id']==id for v in c['volumes']):c['volumes'].append({'id':id})
        if mode=='primary' and id is None:raise ValueError('Choose a primary drive')
        c[mode]=None if mode=='overflow' and id=='internal' else id
        save(c);return {'ok':True}
    if action=='backup':
        disk=next((d for d in mounted if d['id']==data.get('id')),None)
        if not disk:raise ValueError('Choose a mounted backup USB drive')
        # Check referenced bytes + database headroom, without deleting any existing backups.
        size=sum(int(line) for line in run(['runuser','-u','postgres','--','psql','-d','th_app','-At','-c',"select coalesce(sum(size),0) from public.files union all select coalesce(sum(size),0) from public.mes_media union all select pg_database_size('th_app')"]).splitlines())
        if disk['free']<size*1.15+128*1024*1024:raise ValueError('Backup drive has insufficient free space')
        parent=Path(disk['mount'])/'th-mes-backups'
        if parent.is_symlink():raise ValueError('Invalid backup directory')
        parent.mkdir(mode=0o700,exist_ok=True);parent.chmod(0o700)
        destination=parent/(time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])
        marker=(RUNTIME/'backup-active');marker.write_text(str(time.time()))
        try:return {'folder':str(destination),**snapshot(destination,c,mounted)}
        finally:marker.unlink(missing_ok=True)
    raise ValueError('Unsupported operation')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<8192:raise ValueError('Invalid request')
            payload=json.loads(self.rfile.read(size));action=payload.get('action')
            if action in ('status','resolve','locations','browse','transferPlan','databasePlan','destination'):value=dispatch(action,payload.get('data',{}))
            else:
                if not LOCK.acquire(blocking=False):raise ValueError('Storage operation is busy')
                try:value=dispatch(action,payload.get('data',{}))
                finally:LOCK.release()
            body=json.dumps(value).encode();self.send_response(200)
        except Exception as error:
            body=json.dumps({'error':str(error)[:250],'code':'ENOENT' if isinstance(error,FileNotFoundError) else 'storage-unavailable'}).encode();self.send_response(400)
        self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

class Server(socketserver.ThreadingMixIn,socketserver.UnixStreamServer):daemon_threads=True
if __name__=='__main__':
    import sys
    if '--restore-mounts' in sys.argv:restore_database_mounts()
    elif '--status' in sys.argv:print(json.dumps(dispatch('status',{})))
    elif '--pre-deploy' in sys.argv:
        # Called only by the deployment installer while th-app is stopped.
        base=Path('/var/lib/th-app/backups');base.mkdir(mode=0o700,exist_ok=True)
        dest=base/('pre-deploy-'+time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])
        snapshot(dest,config(),disks(),hardlinks=True);print('Verified pre-deployment snapshot:',dest)
    else:
        Path(SOCKET).parent.mkdir(exist_ok=True)
        (RUNTIME/'backup-active').unlink(missing_ok=True)
        if os.path.exists(SOCKET):os.unlink(SOCKET)
        with Server(SOCKET,Handler) as server:
            import grp
            os.chown(SOCKET,0,grp.getgrnam('thapp').gr_gid);os.chmod(SOCKET,0o660);server.serve_forever()
