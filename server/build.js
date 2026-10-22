import {build} from 'esbuild';
import {cp,mkdir} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['server/index.js'],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:'dist/server/app.cjs',external:['pg-native']});
await cp('server/migrations','dist/server/migrations',{recursive:true});
// Migration runner executes from its own directory alongside SQL files.
await build({entryPoints:['server/migrate.js'],bundle:true,platform:'node',target:'node22',format:'cjs',external:['pg-native'],outfile:'dist/server/migrate.cjs'});
await build({entryPoints:['server/bootstrap-owner.js'],bundle:true,platform:'node',target:'node22',format:'cjs',external:['pg-native'],outfile:'dist/server/bootstrap-owner.cjs'});

await cp('quick-access/site','dist/server/quick-access/site',{recursive:true});
await cp('quick-access/default-config.json','dist/server/quick-access/default-config.json');
await cp('quick-access/source-files.json','dist/server/quick-access/source-files.json');
