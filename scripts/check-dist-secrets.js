import '../server/env.js';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.env.STORY_BRIDGE_BUILD_DIR || 'dist');
const knownSecretNames = ['VITE_SUPABASE_SECRET_KEY','VITE_SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_SERVICE_KEY'];
const configuredSecretNames = Object.keys(process.env).filter(name => name.startsWith('VITE_') && ['SECRET','SERVICE_ROLE','SERVICE_KEY','PRIVATE_KEY'].some(marker => name.includes(marker)));
const builtFiles = [];
function visit(directory, files) {
  if (!fs.existsSync(directory)) throw new Error('Build output is missing. Run npm run build first.');
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target, files);
    else if (entry.isFile()) files.push(target);
  }
}
visit(dist,builtFiles);
const sourceFiles = [];
for (const directory of ['src','server','scripts','supabase','test']) if (fs.existsSync(directory)) visit(path.resolve(directory),sourceFiles);
const checkerPath=path.resolve('scripts/check-dist-secrets.js');
for(let index=sourceFiles.length-1;index>=0;index--)if(sourceFiles[index]===checkerPath)sourceFiles.splice(index,1);
for (const file of ['README.md','PLAN.md','.gitignore','package.json','.env.example','index.html']) if (fs.existsSync(file)) sourceFiles.push(path.resolve(file));
for (const file of [...builtFiles,...sourceFiles]) {
  const body = fs.readFileSync(file);
  if (process.env.SUPABASE_SECRET_KEY && body.includes(Buffer.from(process.env.SUPABASE_SECRET_KEY))) throw new Error('The configured server-only Supabase key appears in project source or dist.');
  if (knownSecretNames.some(name => body.includes(Buffer.from(name)))) throw new Error('A VITE_ server-secret variable name appears in project source or dist.');
}
if (configuredSecretNames.length) throw new Error('A VITE_-prefixed server-secret variable is configured.');
console.log('Configured Supabase secret and VITE_ server-secret checks passed for project source and dist.');
