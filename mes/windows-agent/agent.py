"""TH MES loopback attestation agent. Standard library only; Windows only in production."""
import base64
import hashlib
import hmac
import json
import os
import platform
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

def matches_profile(username, profile_names):
    return bool(USERNAME.fullmatch(username)) and '..' not in username and username.casefold() in {name.casefold() for name in profile_names}

def sign_proof(data, config, profile_names):
    username = data.get('username', '')
    if not matches_profile(username, profile_names):
        raise ValueError('No matching profile folder was found in C:\\Users.')
    if not IDENTIFIER.fullmatch(data.get('challengeId', '')) or not re.fullmatch(r'[a-f0-9]{64}', data.get('nonce', '')):
        raise ValueError('Invalid challenge.')
    result = {key: data[key] for key in ('challengeId', 'nonce', 'username')}
    result['deviceId'] = config['deviceId']
    canonical = '\n'.join(result[key] for key in ('challengeId', 'nonce', 'username', 'deviceId'))
    result['signature'] = hmac.new(base64.b64decode(config['secret'], validate=True), canonical.encode('utf-8'), hashlib.sha256).hexdigest()
    return result

def make_handler(config):
    origins = set(config.get('allowedOrigins', ['https://mes.th.io.vn']))
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log challenges or device credentials.
        def allowed(self):
            return self.headers.get('Origin') in origins and self.headers.get('Host') in ('127.0.0.1:8765', 'localhost:8765')
        def send_json(self, status, value):
            payload = json.dumps(value).encode()
            self.send_response(status)
            if self.headers.get('Origin') in origins:
                self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
                self.send_header('Vary', 'Origin')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Type', 'application/json')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        def do_OPTIONS(self):
            if not self.allowed():
                self.send_json(403, {'error': 'Origin not permitted.'})
                return
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Vary', 'Origin')
            self.end_headers()
        def do_GET(self):
            if not self.allowed() or self.path != '/health':
                self.send_json(403, {'error': 'Not permitted.'})
                return
            self.send_json(200, {'ready': True, 'agent': 'TH MES', 'version': 1})
        def do_POST(self):
            if not self.allowed() or self.path != '/attest' or self.headers.get_content_type() != 'application/json':
                self.send_json(403, {'error': 'Not permitted.'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096:
                    raise ValueError('Invalid request size.')
                data = json.loads(self.rfile.read(length))
                profile_names = [path.name for path in Path(r'C:\Users').iterdir() if path.is_dir() and not path.is_symlink()]
                proof = sign_proof(data, config, profile_names)
                self.send_json(200, proof)
            except (ValueError, OSError, KeyError, TypeError):
                self.send_json(403, {'error': 'Windows verification failed. Confirm the selected user has a profile folder under C:\\Users and the agent is configured.'})
    return Handler

def main():
    if platform.system() != 'Windows':
        raise SystemExit('This agent must run on the Windows computer being verified.')
    config_path = Path(os.environ.get('PROGRAMDATA', r'C:\ProgramData')) / 'THMES' / 'device.json'
    config = json.loads(config_path.read_text(encoding='utf-8-sig'))
    if not IDENTIFIER.fullmatch(config.get('deviceId', '')) or len(base64.b64decode(config.get('secret',''), validate=True)) != 32:
        raise SystemExit('Invalid device configuration.')
    server = ThreadingHTTPServer(('127.0.0.1', 8765), make_handler(config))
    server.daemon_threads = True
    server.serve_forever()

if __name__ == '__main__':
    main()
