import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { OBJECT_RECORDS, COMMUNITY_QUESTIONS_BY_OBJECT, objectRecordView } from '../src/object-records.js';

test('four public object records have licensed images and matching credits', () => {
  assert.equal(OBJECT_RECORDS.length, 4);
  const credits = readFileSync(new URL('../docs/credits.md', import.meta.url), 'utf8');
  for (const record of OBJECT_RECORDS) {
    assert.ok(existsSync(new URL(`../public${record.image}`, import.meta.url)));
    assert.ok(existsSync(new URL(`../public/assets/photos/lulua/${record.fileName}`, import.meta.url)));
    assert.ok(credits.includes(record.fileName));
    assert.ok(credits.includes(record.commonsUrl));
    assert.ok(credits.includes(record.author));
  }
});
test('community-only object exposes only title and region to visitors', () => {
  const restricted = { ...OBJECT_RECORDS[0], access: 'Community only', image: '/private.jpg', facts: ['Private fact'] };
  assert.deepEqual(objectRecordView(restricted), {
    id: restricted.id, title: restricted.title, region: restricted.region,
    access: 'Community only', communityNote: 'This object is shared with its community.'
  });
  assert.equal(objectRecordView(restricted).image, undefined);
  assert.deepEqual(objectRecordView(restricted, { owner: true }), restricted);
});

test('Berlin record reports both conflicting acquisition dates', () => {
  const berlin = OBJECT_RECORDS.find(record => record.id === 'berlin-statue');
  assert.deepEqual(berlin.acquisitionDates, ['1885 (French source)', '1886 (English source)']);
  assert.ok(berlin.facts.some(fact => fact.includes('dates differ')));
});

test('mask record states that date and collector are not recorded', () => {
  const mask = OBJECT_RECORDS.find(record => record.id === 'luluwa-mask');
  assert.equal(mask.date, 'Not recorded');
  assert.equal(mask.collector, 'Not recorded');
  assert.ok(mask.facts.some(fact => fact.includes('Date: Not recorded')));
});

test('each object page receives only its questions and one voice action',()=>{
  assert.deepEqual(Object.keys(COMMUNITY_QUESTIONS_BY_OBJECT).sort(),['berlin-statue','brooklyn-figure','ile-aix-statuette','luluwa-mask'].sort());
  assert.deepEqual(Object.values(COMMUNITY_QUESTIONS_BY_OBJECT).map(items=>items.length),[2,1,1,1]);
  const page=readFileSync(new URL('../src/pages/ObjectRecordPage.jsx',import.meta.url),'utf8');
  assert.match(page,/COMMUNITY_QUESTIONS_BY_OBJECT\[record\.id\]/);
  assert.equal((page.match(/Speak about this object/g)||[]).length,1);
});

