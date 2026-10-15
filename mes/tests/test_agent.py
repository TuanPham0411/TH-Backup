import base64
import hashlib
import hmac
import importlib.util
import unittest
import threading
import http.client
import json
from http.server import ThreadingHTTPServer
from pathlib import Path
spec = importlib.util.spec_from_file_location('agent', Path(__file__).parents[1] / 'windows-agent' / 'agent.py')
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)
class AgentTests(unittest.TestCase):
 def test_matches_only_registered_profile_folder_name(self):
  self.assertTrue(agent.matches_profile('phtuan',['Public','PHTuan']))
  for name in ['other','../phtuan','phtuan/child','C:\\Users\\phtuan','phtuan..x','']:
   self.assertFalse(agent.matches_profile(name,['PHTuan']))
 def test_proof_canonicalization_matches_cloud_contract(self):
  config={'deviceId':'device123','secret':base64.b64encode(bytes([7])*32).decode()}
  data={'challengeId':'abc123','nonce':'a'*64,'username':'phtuan'}
  proof=agent.sign_proof(data,config,['PHTuan'])
  expected=hmac.new(bytes([7])*32,('abc123\n'+'a'*64+'\nphtuan\ndevice123').encode(),hashlib.sha256).hexdigest()
  self.assertEqual(proof['signature'],expected)
  self.assertNotIn('secret',proof)
 def test_missing_profile_and_malformed_challenge_fail_closed(self):
  config={'deviceId':'device123','secret':base64.b64encode(bytes([7])*32).decode()}
  with self.assertRaises(ValueError):agent.sign_proof({'username':'other','challengeId':'a','nonce':'a'*64},config,['phtuan'])
  with self.assertRaises(ValueError):agent.sign_proof({'username':'phtuan','challengeId':'../x','nonce':'bad'},config,['phtuan'])
 def test_loopback_origin_and_host_checks(self):
  config={'deviceId':'device123','secret':base64.b64encode(bytes([7])*32).decode(),'allowedOrigins':['https://mes.th.io.vn']}
  server=ThreadingHTTPServer(('127.0.0.1',0),agent.make_handler(config))
  worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
  def request(method,path,origin,host):
   connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=2)
   connection.request(method,path,headers={'Origin':origin,'Host':host})
   response=connection.getresponse();result=(response.status,dict(response.getheaders()),response.read());connection.close();return result
  try:
   self.assertEqual(request('GET','/health','https://attacker.test','127.0.0.1:8765')[0],403)
   self.assertEqual(request('GET','/health','https://mes.th.io.vn','attacker.test:8765')[0],403)
   self.assertEqual(request('GET','/health','https://mes.th.io.vn','127.0.0.1:8765')[0],200)
   status,headers,_=request('OPTIONS','/attest','https://mes.th.io.vn','127.0.0.1:8765')
   self.assertEqual(status,204);self.assertEqual(headers['Access-Control-Allow-Private-Network'],'true')
  finally:server.shutdown();server.server_close();worker.join(timeout=2)
if __name__ == '__main__':unittest.main()
