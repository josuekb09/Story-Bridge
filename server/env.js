import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Parses one value from a .env line. Unquoted values are trimmed and lose a trailing
// " # comment"; quoted values keep their inner text exactly. Windows editors often add
// trailing spaces or a BOM, which used to turn STORY_GOOGLE_SIGN_IN=true into "true ".
export function parseEnvValue(raw) {
  const value = raw.trim();
  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted) return quoted[2];
  return value.replace(/\s+#.*$/, '').trim();
}

// Small dotenv reader for the ignored project-root .env file. Process values win.
export function loadLocalEnv(file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = parseEnvValue(match[2]);
  }
}

if (process.env.STORY_SKIP_DOTENV !== '1') loadLocalEnv();
