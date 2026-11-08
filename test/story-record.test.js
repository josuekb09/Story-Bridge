import test from 'node:test';
import assert from 'node:assert/strict';
import { storyFingerprint, makeStoryVersion, appendStoryVersion, storyRecord } from '../server/story-record.js';

const story={originalLanguage:'Kiswahili',text:'Synthetic story',translationLanguage:'English',translation:'A synthetic translation'};

test('story fingerprints are deterministic SHA-256 hashes over original and translated content',()=>{
  const first=storyFingerprint(story);
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.equal(first,storyFingerprint({...story}));
  assert.notEqual(first,storyFingerprint({...story,text:'Edited synthetic story'}));
  assert.notEqual(first,storyFingerprint({...story,translation:'Edited synthetic translation'}));
  assert.notEqual(first,storyFingerprint({...story,translationOrigin:'ai_approved'}));
  assert.notEqual(first,storyFingerprint({...story,audio_sha256:'a'.repeat(64)}));
});

test('story version log appends timestamped language and change records without storing story text',()=>{
  const created=makeStoryVersion(story,'Story created','2026-11-08T10:00:00.000Z');
  const updated=appendStoryVersion({...story,versionLog:[created]},'Original story edited');
  assert.equal(updated.length,2);
  assert.equal(updated[1].language,'Kiswahili');
  assert.equal(updated[1].change,'Original story edited');
  assert.equal(updated[1].timestamp.length>0,true);
  assert.equal(Object.hasOwn(updated[1],'text'),false);
  assert.equal(storyRecord({...story,versionLog:updated}).length,2);
});
