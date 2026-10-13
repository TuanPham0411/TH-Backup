import { defineConfig } from 'vite';
export default defineConfig({
 root:'site',
 build:{outDir:'../dist/web',emptyOutDir:true,rolldownOptions:{output:{codeSplitting:{groups:[
  {name:'firebase-auth',test:/node_modules\/@firebase\/auth/,priority:30},
  {name:'firebase-data',test:/node_modules\/@firebase\/firestore/,priority:30},
  {name:'firebase-core',test:/node_modules\//,priority:10}
 ]}}}}
});
