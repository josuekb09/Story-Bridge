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
    ['English', 'The Market Bench', 'At the market, two neighbours who had stopped speaking shared a bench during the rain. By the time the clouds cleared, they had agreed to keep the water pump working together. Fictional composite for the Story Bridge demo.'],
    ['Français', 'Le banc du marché', 'Au marché, deux voisines qui ne se parlaient plus se sont abritées sur le même banc. Quand la pluie a cessé, elles avaient décidé de réparer ensemble la pompe du quartier. Composite fictif pour la démonstration Story Bridge.'],
    ['Kiswahili', 'Kikombe cha chai', 'Baada ya mvua kubwa, majirani walikutana kwenye kituo cha basi na kugundua kuwa wote walikuwa wakisaidia kituo cha afya. Walianza kupanga siku ya kusafisha njia pamoja. Hadithi ya kubuni kwa onyesho la Story Bridge.'],
    ['English', 'A Place at the Table', 'Our community meal used to have separate tables. One Saturday, a child carried a bowl across the room and asked everyone to make space. Now we cook in mixed teams. Fictional composite for the Story Bridge demo.'],
    ['Français', 'Le jardin partagé', 'Des jeunes ont invité des anciens à choisir les graines d’un jardin commun. Chacun a apporté un savoir différent, et les récoltes sont partagées entre plusieurs rues. Composite fictif pour la démonstration Story Bridge.'],
    ['Kiswahili', 'Daraja la mazungumzo', 'Watu wa mitaa miwili walijenga daraja dogo la mbao baada ya kujadiliana kuhusu njia salama ya kwenda shuleni. Sasa wazazi hukagua daraja na watoto huvuka pamoja. Hadithi ya kubuni kwa onyesho la Story Bridge.'],
  ].map(([language,title,text],index)=>({
    id:`story-bridge-demo-${index+1}`,ownerHash:crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),originalLanguage:language,text,translationLanguage:'',translation:'',translationChecked:false,checkedBy:'',visibility:'public',status:'shared',createdAt:new Date(Date.now()-index*86_400_000).toISOString(),audio:'',mime:'',storytellerName:'',showName:false,demoTitle:title,
  }));
  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
  console.log('Created six fictional public demo stories in English, French and Swahili.');
}
