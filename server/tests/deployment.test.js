import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('redeployment accepts its own Nginx site and rejects other sites with the same hosts',()=>{
 const check=input=>spawnSync('python3',['deploy/check-nginx.py'],{input,encoding:'utf8'});
 assert.equal(check('# configuration file /etc/nginx/sites-enabled/th-app:\n server_name th.io.vn;\n server_name mes.th.io.vn;\n').status,0);
 assert.equal(check('# configuration file /etc/nginx/sites-enabled/default:\n server_name _;\n').status,0);
 assert.equal(check('# configuration file /etc/nginx/sites-enabled/other:\n server_name th.io.vn;\n').status,1);
 assert.equal(check('# configuration file /etc/nginx/sites-enabled/other:\n server_name *.th.io.vn;\n').status,1);
 assert.equal(check('# configuration file /etc/nginx/sites-enabled/other:\n # server_name th.io.vn;\n').status,0);
});
