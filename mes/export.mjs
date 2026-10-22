// Export a self-contained source tree. Never copies runtime data, secrets or .git.
import {cp,mkdir,readFile,writeFile,chmod,readdir} from 'node:fs/promises';
import {existsSync,statSync} from 'node:fs';
import {resolve,relative,dirname,basename,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2];
if(!destination)throw new Error('Usage: node mes/export.mjs <new-output-directory>');
const output=resolve(destination);if(output===root||!relative(output,root).startsWith('..')||existsSync(output))throw new Error('Choose a new output directory outside repository parents; existing directories are never overwritten.');
await mkdir(output,{recursive:true});
for(const [source,target]of [['mes/site','mes/site'],['mes/supabase/functions/_shared/rich-document.js','mes/supabase/functions/_shared/rich-document.js'],['mes/vite.config.js','mes/vite.config.js'],['vite.mes.config.js','vite.mes.config.js'],['server','server'],['quick-access','quick-access']])await cp(resolve(root,source),resolve(output,target),{recursive:true,filter:path=>!path.includes('/tests/')&&!path.endsWith('/tests')&&!basename(path).startsWith('.')&&(statSync(path).isDirectory()||['.txt','.md','.json','.js','.sql','.html','.css','.svg','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ico','.webmanifest'].includes(extname(path)))});
for(const name of ['Dockerfile','compose.yaml','database-init.sh','.env.example','.dockerignore','start.mjs','nginx.conf.example'])await cp(resolve(root,'mes/standalone',name),resolve(output,name));
await cp(resolve(root,'mes/STANDALONE.md'),resolve(output,'README.md'));
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));pkg.name='th-mes-ticket';pkg.scripts={build:'npm run build:mes && npm run build:server','build:mes':'vite build --config vite.mes.config.js','build:server':'node server/build.js',start:'node start.mjs',migrate:'node dist/server/migrate.cjs','bootstrap:owner':'node dist/server/bootstrap-owner.cjs'};pkg.engines={node:'>=22'};
const lock=JSON.parse(await readFile(resolve(root,'package-lock.json'),'utf8'));lock.name=pkg.name;lock.packages[''].name=pkg.name;lock.packages[''].engines=pkg.engines;
await writeFile(resolve(output,'package.json'),JSON.stringify(pkg,null,2)+'\n');await writeFile(resolve(output,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
await writeFile(resolve(output,'.gitignore'),'node_modules/\ndist/\nmes/dist/\n.env\n.env.*\n!.env.example\n*.dump\n*.tar.gz\n');
let commit='working-tree';try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
await writeFile(resolve(output,'SOURCE.json'),JSON.stringify({repository:'https://github.com/TuanPham0411/Thien-Ha',sourceDirectory:'mes',commit},null,2)+'\n');
await mkdir(resolve(output,'ci'),{recursive:true});await cp(resolve(root,'mes/standalone/smoke.mjs'),resolve(output,'ci/smoke.mjs'));await cp(resolve(root,'mes/standalone/ci.yml'),resolve(output,'ci/standalone.yml'));
async function sourcePermissions(path){await chmod(path,0o755);for(const entry of await readdir(path,{withFileTypes:true})){const file=resolve(path,entry.name);if(entry.isDirectory())await sourcePermissions(file);else await chmod(file,0o644);}}
await sourcePermissions(output);
console.log('Exported standalone MES source to '+output);
