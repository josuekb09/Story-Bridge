import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslationDraftService, TranslationDraftError, translationDraftHandler } from '../server/translation-draft.js';
import { editAiTranslationDraft, translationApprovalCanContinue } from '../src/translation-draft.js';
import express from 'express';

const input = { text: 'Synthetic community story.', originalLanguage: 'Kiswahili', targetLanguage: 'English' };
const fakeCredential = ['not', 'a', 'real', 'credential'].join('-');

test('translation service sends the story to a mocked provider and returns only its draft', async () => {
  let request;
  const service = createTranslationDraftService({ getApiKey: () => fakeCredential, fetchImpl: async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return Response.json({ output_text: 'A mock translation.' });
  } });
  const translation = await service(input);
  assert.equal(translation, 'A mock translation.');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.authorization, `Bearer ${fakeCredential}`);
  assert.match(request.body.input[1].content[0].text, /Synthetic community story/);
  assert.doesNotMatch(JSON.stringify({ translation }), new RegExp(fakeCredential));
});

test('missing API key gives a clear optional-feature error without calling provider', async () => {
  let calls = 0;
  const service = createTranslationDraftService({ getApiKey: () => '', fetchImpl: async () => { calls++; } });
  await assert.rejects(service(input), error => error instanceof TranslationDraftError && error.status === 503 && /write the translation yourself/.test(error.publicMessage));
  assert.equal(calls, 0);
});

test('provider errors fail closed with a generic recoverable message', async () => {
  const service = createTranslationDraftService({ getApiKey: () => fakeCredential, fetchImpl: async () => new Response('provider detail with credential', { status: 429 }) });
  await assert.rejects(service(input), error => error instanceof TranslationDraftError && error.status === 502 && !error.publicMessage.includes(fakeCredential) && !error.publicMessage.includes('provider detail'));
});

test('editing an approved AI draft clears approval and blocks continuing', () => {
  const approved = { translation: 'Approved text', translationOrigin: 'ai_draft', translationApproved: true };
  const edited = editAiTranslationDraft(approved, 'Edited by the storyteller');
  assert.equal(edited.translationApproved, false);
  assert.equal(translationApprovalCanContinue(edited), false);
  assert.equal(translationApprovalCanContinue({ ...edited, translationApproved: true }), true);
});

test('translation endpoint returns only a translation and never a server credential', async () => {
  const app = express(); app.use(express.json());
  app.post('/api/translation-draft', translationDraftHandler(async () => 'Mock-only translation.'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/translation-draft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { translation: 'Mock-only translation.', origin: 'ai_draft_unapproved' });
    assert.doesNotMatch(JSON.stringify(body), new RegExp(fakeCredential));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
