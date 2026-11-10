import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = JSON.parse(fs.readFileSync(path.join(root, 'src/data/africa-images.json'), 'utf8'));

function localPath(url) {
  assert.ok(url.startsWith('/assets/photos/'), `unexpected image path: ${url}`);
  return path.join(root, 'public', url.slice(1));
}

test('every showcase image and srcset candidate exists locally with credit data', () => {
  for (const [id, image] of Object.entries(images)) {
    for (const field of ['src', 'author', 'licence', 'licenceUrl', 'sourceUrl']) {
      assert.ok(image[field], `${id}.${field} is required`);
    }
    assert.ok(fs.existsSync(localPath(image.src)), `${id} source is missing`);
    for (const candidate of image.srcset.split(',').map(entry => entry.trim()).filter(Boolean)) {
      const [url, width] = candidate.split(/\s+/);
      assert.match(width, /^\d+w$/u, `${id} has invalid srcset descriptor`);
      assert.ok(fs.existsSync(localPath(url)), `${id} srcset candidate is missing: ${url}`);
    }
  }
});

test('Zulu showcase photo is the credited object-only CC0 replacement', () => {
  const image = images['za-zulu-beadwork'];
  assert.equal(image.licence, 'CC0');
  assert.equal(image.author, 'Daderot');
  assert.match(image.title, /Beaded necklace, Zulu/u);
  assert.equal(fs.existsSync(localPath(image.src)), true);
});
