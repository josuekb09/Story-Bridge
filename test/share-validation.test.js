import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageDetails, mapShareSubmissionError, prepareImageMetadata, validateShareStep } from '../src/share-validation.js';

test('new images receive an editable credit from the storyteller profile', () => {
  const details = createImageDetails(2, 'Josué Kabuya');
  assert.deepEqual(details, [
    { altText: '', credit: 'Photo: Josué Kabuya' },
    { altText: '', credit: 'Photo: Josué Kabuya' },
  ]);
  details[0].credit = 'Photo: a community archive';
  assert.equal(details[0].credit, 'Photo: a community archive');
});

test('empty image alt text is saved with a title-based fallback', () => {
  assert.deepEqual(prepareImageMetadata([
    { altText: '', credit: ' Photo: Josué Kabuya ' },
    { altText: 'Painted geometric wall', credit: 'Community archive' },
  ], 'Ndebele home'), [
    { altText: 'Photo for: Ndebele home', credit: 'Photo: Josué Kabuya' },
    { altText: 'Painted geometric wall', credit: 'Community archive' },
  ]);
});

test('Share flow validates each required step and does not require image alt text', () => {
  assert.equal(validateShareStep(1, { originalLanguage: '' }).language, 'Choose or enter a language.');
  assert.deepEqual(validateShareStep(2, { title: '', text: '', postImages: [], imageDetails: [] }), {
    title: 'Enter a title before continuing.',
    text: 'Write your story or add an audio recording.',
  });
  assert.deepEqual(validateShareStep(2, {
    title: 'A story', text: 'Some words', postImages: [{}], imageDetails: [{ altText: '', credit: 'Photo: Josué' }],
  }), {});
  assert.equal(validateShareStep(2, {
    title: 'A story', text: 'Some words', postImages: [{}], imageDetails: [{ altText: '', credit: '' }],
  })['image-credit-0'], 'Add a credit for this photo.');
  assert.equal(validateShareStep(4, { consentConfirmed: false }).consent, 'Confirm that this story is yours or that you have permission.');
  assert.deepEqual(validateShareStep(4, { requireAuthorName:true, authorDisplayName:'  ', consentConfirmed:false }), {
    authorName:'Enter the name you want to appear on your posts.',
    consent:'Confirm that this story is yours or that you have permission.',
  });
  assert.deepEqual(validateShareStep(4, { requireAuthorName:true, authorDisplayName:' A Storyteller ', consentConfirmed:true }), {});
});

test('server validation messages are mapped to the corresponding Share field', () => {
  assert.deepEqual(mapShareSubmissionError('Enter a title of 160 characters or fewer.'), {
    step: 2, field: 'title', message: 'Enter a title of 160 characters or fewer.',
  });
  assert.deepEqual(mapShareSubmissionError('Confirm that this content is yours or you have permission.'), {
    step: 4, field: 'consent', message: 'Confirm that this content is yours or you have permission.',
  });
  assert.deepEqual(mapShareSubmissionError('Every image needs alt text and credit.'), {
    step: 2, field: 'images', message: 'Every image needs alt text and credit.',
  });
  assert.equal(mapShareSubmissionError('The service is temporarily unavailable.'), null);
});
