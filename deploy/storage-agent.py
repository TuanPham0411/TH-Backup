#!/usr/bin/env python3
"""Narrow root broker: existing USB mounts only; never format, unmount or restore."""
import json, os, socketserver, subprocess, shutil, threading, hashlib, time, uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler
CONFIG=Path('/etc/th-app/storage.json')
INTERNAL=Path('/var/lib/th-app/files')
SOCKET='/run/th-storage/control.sock'
LOCK=threading.Lock()

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs).stdout

def config():
    return json.loads(CONFIG.read_text()) if CONFIG.exists() else {'volumes':[], 'primary':'internal', 'overflow':None}

def save(value):
    tmp=CONFIG.with_suffix('.tmp'); tmp.write_text(json.dumps(value)); tmp.chmod(0o600); tmp.replace(CONFIG)

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
    result=[INTERNAL]
    for v in c['volumes']:
        try: result.append(root_for(v,mounted))
        except (ValueError,OSError):pass
    return result

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
        if len(available)!=1+len(c['volumes']):raise ValueError('A registered USB drive is disconnected; reconnect it to access this file')
        raise FileNotFoundError('File unavailable')
    id=c['primary']
    if id=='internal':
        info=os.statvfs(INTERNAL)
        if info.f_bavail*info.f_frsize<512*1024*1024 and c.get('overflow'):id=c['overflow']
    root=INTERNAL if id=='internal' else root_for(next(v for v in c['volumes'] if v['id']==id),mounted)
    if os.statvfs(root).f_bavail*os.statvfs(root).f_frsize<64*1024*1024:raise ValueError('Selected storage has insufficient free space')
    dest=root/rel
    if not dest.resolve().is_relative_to(root.resolve()):raise ValueError('Invalid storage path')
    return {'path':str(dest),'root':str(root)}

def dump_database(path):
    # Peer authentication; no application password in argv, logs or backup metadata.
    with path.open('xb') as output:
        subprocess.run(['runuser','-u','postgres','--','pg_dump','--format=custom','--no-owner','th_app'],stdout=output,stderr=subprocess.PIPE,check=True)

def snapshot(destination, c, mounted, hardlinks=False):
    active=roots(c,mounted)
    if len(active)!=1+len(c['volumes']):raise ValueError('Connect all registered storage drives before backing up')
    # Verify all referenced completed files before declaring a complete backup.
    expected=run(['runuser','-u','postgres','--','psql','-d','th_app','-At','-c',"select path from public.files union all select 'media/'||id from public.mes_media where ready"] ).splitlines()
    for name in expected:
        rel=relative(name)
        if not any((root/rel).is_file() for root in active):raise ValueError('A referenced media file is missing; backup was not started')
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
                    if dest.exists():raise ValueError('Conflicting storage paths; no data was overwritten')
                    if hardlinks:
                        try:os.link(source,dest)
                        except OSError:
                            external[str(rel)]={'path':str(source),'bytes':source.stat().st_size,'modifiedNs':source.stat().st_mtime_ns}
                            count+=1;total+=source.stat().st_size
                            continue
                    else:shutil.copyfile(source,dest)
                    with dest.open('rb') as copied:digest=hashlib.file_digest(copied,'sha256').hexdigest()
                    checksums.write(digest+'  files/'+str(rel)+'\n');count+=1;total+=dest.stat().st_size
        with (destination/'database.dump').open('rb') as dump:checksums.write(hashlib.file_digest(dump,'sha256').hexdigest()+'  database.dump\n')
    manifest={'version':1,'mode':'deployment-rollback' if hardlinks else 'full-usb-backup','externalMediaReferences':external,'createdAt':int(time.time()*1000),'files':count,'bytes':total,'complete':True,'database':'database.dump','media':'files','urls':'Unchanged: restore the same database IDs and relative file paths.','excluded':'Runtime secrets and active upload fragments.','volumes':[v['id'] for v in c['volumes']]}
    (destination/'manifest.json').write_text(json.dumps(manifest));os.sync()
    return manifest

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
        return {**c,'unmounted':[d for d in devices() if not d.get('mount')],'disks':mounted,'internal':{'free':info.f_bavail*info.f_frsize,'total':info.f_blocks*info.f_frsize},'backups':backups}
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
        if len(available)!=1+len(c['volumes']):raise ValueError('Reconnect all storage drives before deleting files')
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
        if id not in ('internal',None):
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
        marker=Path('/run/th-storage/backup-active');marker.write_text(str(time.time()))
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
            if action in ('status','resolve','locations'):value=dispatch(action,payload.get('data',{}))
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
    if '--status' in sys.argv:print(json.dumps(dispatch('status',{})))
    elif '--pre-deploy' in sys.argv:
        # Called only by the deployment installer while th-app is stopped.
        base=Path('/var/lib/th-app/backups');base.mkdir(mode=0o700,exist_ok=True)
        dest=base/('pre-deploy-'+time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])
        snapshot(dest,config(),disks(),hardlinks=True);print('Verified pre-deployment snapshot:',dest)
    else:
        Path(SOCKET).parent.mkdir(exist_ok=True)
        Path('/run/th-storage/backup-active').unlink(missing_ok=True)
        if os.path.exists(SOCKET):os.unlink(SOCKET)
        with Server(SOCKET,Handler) as server:
            import grp
            os.chown(SOCKET,0,grp.getgrnam('thapp').gr_gid);os.chmod(SOCKET,0o660);server.serve_forever()
