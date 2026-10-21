import unittest,importlib.util,tempfile,json,os
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('storage','deploy/storage-agent.py');storage=importlib.util.module_from_spec(spec);spec.loader.exec_module(storage)
class StorageTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.base=Path(self.temp.name);self.internal=self.base/'internal';self.internal.mkdir();self.usb=self.base/'usb';self.usb.mkdir();self.root=self.usb/'th-mes-storage';self.root.mkdir();(self.root/'.th-mes-volume').write_text('usb-test')
  self.config=self.base/'config.json';self.config.write_text(json.dumps({'primary':'usb-test','overflow':None,'volumes':[{'id':'usb-test'}]}))
  self.patches=[patch.object(storage,'RUNTIME',self.base),patch.object(storage,'CONFIG',self.config),patch.object(storage,'INTERNAL',self.internal),patch.object(storage,'disks',return_value=[{'id':'usb-test','mount':str(self.usb)}])]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in self.patches:p.stop()
  self.temp.cleanup()
 def test_existing_paths_and_new_usb_slots(self):
  old=self.internal/'issues'/'ticket'/'slot';old.parent.mkdir(parents=True);old.write_text('existing original')
  self.assertEqual(storage.resolve({'path':'issues/ticket/slot','write':True})['path'],str(old))
  self.assertEqual(storage.resolve({'path':'issues/new/slot','write':True})['root'],str(self.root))
  for path in ['../runtime.env','/etc/shadow','issues/../../secrets']:
   with self.assertRaises(ValueError):storage.resolve({'path':path,'write':True})
 def test_unplugged_primary_never_falls_back_to_mount_directory(self):
  with patch.object(storage,'disks',return_value=[]):
   with self.assertRaises(ValueError):storage.resolve({'path':'issues/new/slot','write':True})
  self.assertFalse((self.usb/'issues').exists())
 def test_backup_preserves_relative_paths_originals_and_hashes(self):
  original=self.internal/'issues'/'a'/'slot';original.parent.mkdir(parents=True);original.write_bytes(b'old original')
  video=self.root/'media'/'video-id';video.parent.mkdir();video.write_bytes(b'video bytes')
  dest=self.base/'backup'
  def dump(path):path.write_bytes(b'test database dump')
  with patch.object(storage,'run',return_value='issues/a/slot\nmedia/video-id\n'),patch.object(storage,'dump_database',side_effect=dump),patch('os.chown'),patch('os.sync'),patch('pwd.getpwnam') as pwd:
   pwd.return_value.pw_uid=1000;pwd.return_value.pw_gid=1000
   result=storage.snapshot(dest,storage.config(),storage.disks())
  self.assertTrue(result['complete']);self.assertEqual(result['files'],2);self.assertEqual((dest/'files/issues/a/slot').read_bytes(),original.read_bytes());self.assertEqual((dest/'files/media/video-id').read_bytes(),video.read_bytes());self.assertIn('database.dump',(dest/'files.sha256').read_text());self.assertTrue(original.exists())
 def test_rollback_snapshot_keeps_external_original_references_without_copying_usb_onto_card(self):
  original=self.root/'media'/'external-id';original.parent.mkdir();original.write_bytes(b'USB original stays in place')
  dest=self.base/'rollback'
  def dump(path):path.write_bytes(b'test database')
  with patch.object(storage,'run',return_value='media/external-id\n'),patch.object(storage,'dump_database',side_effect=dump),patch('os.link',side_effect=OSError('cross-device')),patch('os.sync'):
   result=storage.snapshot(dest,storage.config(),storage.disks(),hardlinks=True)
  self.assertEqual(result['mode'],'deployment-rollback');self.assertEqual(result['externalMediaReferences']['media/external-id']['path'],str(original));self.assertFalse((dest/'files/media/external-id').exists());self.assertTrue(original.exists())
 def test_database_dump_writes_through_root_opened_stream(self):
  target=self.base/'database.dump'
  def execute(args,**kwargs):
   self.assertNotIn('--file',args)
   self.assertEqual(args[-1],'th_app')
   kwargs['stdout'].write(b'PGDMP simulated archive')
  with patch('subprocess.run',side_effect=execute):storage.dump_database(target)
  self.assertEqual(target.read_bytes(),b'PGDMP simulated archive')
 def test_missing_reference_fails_before_backup_is_claimed_complete(self):
  with patch.object(storage,'run',return_value='issues/missing/slot\n'):
   with self.assertRaises(ValueError):storage.snapshot(self.base/'bad',storage.config(),storage.disks())
  self.assertFalse((self.base/'bad/manifest.json').exists())
 def test_copy_and_move_keep_urls_and_compare_checksums(self):
  original=self.internal/'issues'/'ticket'/'slot';original.parent.mkdir(parents=True);original.write_bytes(b'ticket attachment')
  data={'source':'internal','target':'usb-test','mode':'copy','activate':True}
  with patch('os.chown'),patch('os.sync'),patch('pwd.getpwnam') as pwd:
   pwd.return_value.pw_uid=1000;pwd.return_value.pw_gid=1000
   result=storage.transfer_files(storage.config(),data,storage.disks())
   self.assertEqual(result['state'],'complete');self.assertTrue(original.exists());self.assertEqual(storage.resolve({'path':'issues/ticket/slot'})['root'],str(self.root))
   data['mode']='move';storage.transfer_files(storage.config(),data,storage.disks())
  self.assertFalse(original.exists());self.assertEqual((self.root/'issues/ticket/slot').read_bytes(),b'ticket attachment')
 def test_transfer_collision_keeps_original_and_existing_destination(self):
  source=self.internal/'media'/'item';source.parent.mkdir();source.write_bytes(b'original')
  dest=self.root/'media'/'item';dest.parent.mkdir();dest.write_bytes(b'different')
  with self.assertRaises(ValueError):storage.transfer_files(storage.config(),{'source':'internal','target':'usb-test','mode':'move'},storage.disks())
  self.assertEqual(source.read_bytes(),b'original');self.assertEqual(dest.read_bytes(),b'different')
 def test_relative_folder_rejects_traversal_and_hidden_paths(self):
  for value in ['/etc/postgresql','../data','folder/../../data','.ssh','data/.hidden']:
   with self.assertRaises(ValueError):storage.folder_value(value)
 def test_verified_duplicate_copies_are_backed_up_once(self):
  for root in [self.internal,self.root]:
   path=root/'media'/'same';path.parent.mkdir();path.write_bytes(b'identical bytes')
  with patch.object(storage,'run',return_value='media/same\n'),patch.object(storage,'dump_database',side_effect=lambda path:path.write_bytes(b'PGDMP')),patch('os.sync'):
   result=storage.snapshot(self.base/'backup-duplicates',storage.config(),storage.disks())
  self.assertEqual(result['files'],1)
 def test_database_move_verification_failure_restores_original_cluster(self):
  source=self.base/'pg-main';source.mkdir();(source/'PG_VERSION').write_text('17');(source/'relation').write_bytes(b'existing tickets and history')
  dest=self.base/'pg-usb';dest.mkdir();systemd=self.base/'systemd';systemd.mkdir()
  plan={'source':str(source),'directory':str(source),'destination':str(dest),'device':'usb-test','folder':'database','version':'17','name':'main','unit':'postgresql@17-main.service','native':True,'sizeGiB':2}
  with patch.object(storage,'database_plan',return_value=plan),patch.object(storage,'prepare_database_target',return_value=dest),patch.object(storage,'dump_database',side_effect=lambda p:p.write_bytes(b'PGDMP')),patch.object(storage,'database_fingerprint',side_effect=['same-history','different-history']),patch.object(storage,'run',return_value='') as commands,patch.object(storage,'SYSTEMD_ROOT',systemd),patch('os.chown'),patch('os.sync'),patch('pwd.getpwnam') as pwd:
   pwd.return_value.pw_uid=1000;pwd.return_value.pw_gid=1000
   with self.assertRaisesRegex(ValueError,'Ticket/history'):storage.move_database(storage.config(),{},storage.disks())
  self.assertEqual((source/'relation').read_bytes(),b'existing tickets and history');self.assertNotIn('database',storage.config());self.assertFalse((self.base/'backup-active').exists())
  self.assertIn(['umount',str(source)],[c.args[0] for c in commands.call_args_list]);self.assertTrue((dest/'relation').exists())
 def test_database_move_retains_old_cluster_and_boot_refuses_wrong_usb_identity(self):
  source=self.base/'pg-main';source.mkdir();(source/'PG_VERSION').write_text('17');(source/'relation').write_bytes(b'unchanged database')
  dest=self.base/'pg-usb';dest.mkdir();systemd=self.base/'systemd';systemd.mkdir()
  plan={'source':str(source),'directory':str(source),'destination':str(dest),'device':'usb-test','folder':'database','version':'17','name':'main','unit':'postgresql@17-main.service','native':True,'sizeGiB':2}
  with patch.object(storage,'database_plan',return_value=plan),patch.object(storage,'prepare_database_target',return_value=dest),patch.object(storage,'dump_database',side_effect=lambda p:p.write_bytes(b'PGDMP')),patch.object(storage,'database_fingerprint',return_value='unchanged-history'),patch.object(storage,'run',return_value=''),patch.object(storage,'SYSTEMD_ROOT',systemd),patch('os.chown'),patch('os.sync'),patch('pwd.getpwnam') as pwd:
   pwd.return_value.pw_uid=1000;pwd.return_value.pw_gid=1000
   result=storage.move_database(storage.config(),{},storage.disks())
  self.assertEqual(result['state'],'complete');previous=Path(storage.config()['database']['previousCopy']);self.assertEqual((previous/'relation').read_bytes(),b'unchanged database');self.assertEqual((dest/'relation').read_bytes(),b'unchanged database')
  wrong=self.usb/'database';wrong.mkdir();(wrong/'.th-mes-database').write_text('wrong-drive')
  with patch.object(storage,'run') as commands:
   with self.assertRaisesRegex(ValueError,'identity'):storage.restore_database_mounts()
   commands.assert_not_called()
if __name__=='__main__':unittest.main()
