import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Small dotenv reader for the ignored project-root .env file. Process values win.
export function loadLocalEnv(file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

if (process.env.STORY_SKIP_DOTENV !== '1') loadLocalEnv();
