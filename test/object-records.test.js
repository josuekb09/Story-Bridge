import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_RECORDS, objectRecordView, attachStoryToObject } from '../src/object-records.js';
import { storyFingerprint, makeStoryVersion } from '../server/story-record.js';

test('restricted cultural record exposes only title and region to non-owners', () => {
  const restricted = { ...OBJECT_RECORDS[0], access: 'Restricted to a community', image: '/private.jpg' };
  assert.deepEqual(objectRecordView(restricted), {
    id: restricted.id, title: restricted.title, region: restricted.region,
    access: 'Restricted to a community', communityNote: 'This object is shared with its community.'
  });
  assert.equal(objectRecordView(restricted).image, undefined);
  assert.deepEqual(objectRecordView(restricted, { owner: true }), restricted);
});

test('Luluwa seed is a project draft and clearly not community-authored', () => {
  const record = OBJECT_RECORDS[0];
  assert.equal(record.projectDraft, true);
  assert.match(record.attribution, /not written by a community member/i);
  assert.equal(record.image, null);
  assert.equal(record.summary.fr, '');
  assert.equal(record.summary.tshiluba, '');
  assert.equal(record.sources.length, 3);
});

test('an attached speaker story retains its own author and fingerprint', () => {
  const story = { id: 'separate-story-1', storytellerName: 'Speaker', showName: true, originalLanguage: 'Tshiluba', text: 'Speaker-authored words.' };
  story.versionLog = [makeStoryVersion(story)];
  const linked = attachStoryToObject(OBJECT_RECORDS[0].id, story);
  assert.equal(linked.objectId, OBJECT_RECORDS[0].id);
  assert.equal(linked.story, story);
  assert.equal(linked.story.storytellerName, 'Speaker');
  assert.equal(linked.story.versionLog[0].fingerprint, storyFingerprint(story));
});
