import crypto from 'node:crypto';

export function storyFingerprint(story) {
  const canonical=[story.originalLanguage||story.original_language||'',story.text||'',story.translationLanguage||story.translation_language||'',story.translation||'',story.translationOrigin||story.translation_origin||'storyteller',story.audioFingerprint||story.audio_sha256||''].join('\u0000');
  return crypto.createHash('sha256').update(canonical,'utf8').digest('hex');
}

export function makeStoryVersion(story,change='Story created',timestamp=new Date().toISOString()) {
  return {timestamp,language:story.originalLanguage||story.original_language||'',change,fingerprint:storyFingerprint(story)};
}

export function appendStoryVersion(story,change) {
  const stored=Array.isArray(story.versionLog)?story.versionLog:Array.isArray(story.version_log)?story.version_log:[];
  const versions=stored.length?stored:[makeStoryVersion(story,'Story record begins at the available version',story.createdAt||story.created_at||new Date().toISOString())];
  return [...versions,makeStoryVersion(story,change)].slice(-100);
}

export function storyRecord(story) {
  if(Array.isArray(story.versionLog)&&story.versionLog.length)return story.versionLog;
  if(Array.isArray(story.version_log)&&story.version_log.length)return story.version_log;
  return [makeStoryVersion(story,'Story record begins at the available version',story.createdAt||story.created_at||new Date().toISOString())];
}
