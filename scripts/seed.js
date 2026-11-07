import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(process.env.STORY_DATA_DIR || path.join(root, 'data'));
const file = path.join(dir, 'stories.json');
const force = process.argv.includes('--force');

console.log(`Seed target: ${file}`);
fs.mkdirSync(dir, { recursive: true });

if (fs.existsSync(file) && !force) {
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    console.error('Refusing to overwrite an unreadable or invalid stories.json. Pass --force to replace it intentionally.');
    process.exitCode = 1;
  }

  if (process.exitCode !== 1 && (!Array.isArray(existing) || existing.length > 0)) {
    console.error('Refusing to overwrite existing stories. Pass --force to replace them intentionally.');
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  const entries = [
    ['Language A', 'Placeholder story, not real. This is an empty demonstration placeholder, not a historical account.'],
    ['Language B', 'Placeholder story, not real. This is an empty demonstration placeholder, not a historical account.'],
  ].map(([language, text]) => ({
    id: crypto.randomUUID(),
    ownerHash: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),
    originalLanguage: language,
    text,
    translationLanguage: '',
    translation: '',
    translationChecked: false,
    checkedBy: '',
    visibility: 'public',
    status: 'shared',
    createdAt: new Date().toISOString(),
    audio: '',
    mime: '',
    storytellerName: 'Placeholder story, not real',
    showName: true,
  }));

  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
  console.log('Created two placeholder stories.');
}
