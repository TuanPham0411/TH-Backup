import os, pathlib, subprocess, tempfile, unittest

class TransportChecks(unittest.TestCase):
    def run_case(self, fail=False, registered=True, previous=None):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder); commands=root/'bin'; commands.mkdir(); config=root/'service'/'50-th-transport.conf'
            if previous is not None: config.parent.mkdir(); config.write_text(previous)
            stubs={'id':'echo 0', 'systemctl':'echo "$*" >> "$TEST_CALLS"', 'sleep':':',
                   'journalctl':"printf '%s\\n' 'Registered tunnel connection protocol=http2' 'Registered tunnel connection protocol=http2'" if registered else ':',
                   'curl':'case "$*" in *https:*) '+('exit 22' if fail else 'echo public-health-ok')+';; esac'}
            for name,body in stubs.items():
                path=commands/name; path.write_text('#!/bin/bash\n'+body+'\n'); path.chmod(0o755)
            source=pathlib.Path(__file__).with_name('tunnel-transport.sh').read_text().replace('/etc/systemd/system/cloudflared.service.d',str(root/'service')).replace('/run/th-tunnel-transport.',str(root/'temporary.'))
            script=root/'script';script.write_text(source);calls=root/'calls'
            env={**os.environ,'PATH':str(commands)+':'+os.environ['PATH'],'TEST_CALLS':str(calls)}
            result=subprocess.run(['bash',str(script)],env=env,capture_output=True,text=True)
            if fail or not registered:
                self.assertNotEqual(result.returncode,0);self.assertIn('restored',result.stderr)
                self.assertEqual(config.read_text() if config.exists() else None,previous)
            else:
                self.assertEqual(result.returncode,0,result.stderr);self.assertIn('PROTOCOL=http2',config.read_text())
                before=calls.read_text();again=subprocess.run(['bash',str(script)],env=env,capture_output=True,text=True)
                self.assertEqual(again.returncode,0);self.assertEqual(calls.read_text(),before,'Unchanged settings must not restart the tunnel')
            self.assertFalse(list(root.glob('temporary.*')))
    def test_success_and_idempotent_deployment(self): self.run_case()
    def test_public_failure_restores_existing_settings(self): self.run_case(fail=True,previous='existing transport settings\n')
    def test_wrong_protocol_removes_new_dropin(self): self.run_case(registered=False)

if __name__=='__main__': unittest.main()
