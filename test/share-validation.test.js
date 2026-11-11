import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageDetails, languagesMatch, mapShareSubmissionError, prepareImageMetadata, shouldShowMachineTranslation, translationLooksLikeOriginal, validateShareStep, validateTranslationEntry } from '../src/share-validation.js';

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

test('translations require a language, a different language, and genuinely different text', () => {
  assert.equal(validateTranslationEntry({ originalText:'A short original.', originalLanguage:'English', translation:'Un texte traduit.' }), 'Choose a language for the translation.');
  assert.equal(validateTranslationEntry({ originalText:'A short original.', originalLanguage:'English', translationLanguage:'French' }), 'Enter the translation or clear its language.');
  assert.equal(validateTranslationEntry({ originalText:'A short original.', originalLanguage:'English', translationLanguage:'en', translation:'Un texte traduit.' }), 'Translation language must differ from the original language.');
  assert.equal(validateTranslationEntry({ originalText:'This is the original story.', originalLanguage:'English', translationLanguage:'French', translation:'This is the original story!' }), 'This looks like the original text. Paste the translation, or leave it empty.');
  const original = 'This is a longer paragraph that describes a story in its original language and should not be copied as a translation for readers.';
  assert.equal(translationLooksLikeOriginal(original, `${original.slice(0, -2)}!`), true);
  const longOriginal = 'This repeated sentence is a synthetic original used to exercise long translation checks. '.repeat(24);
  assert.equal(translationLooksLikeOriginal(longOriginal, `${longOriginal.slice(0, -3)}!!!`), true);
  assert.equal(validateTranslationEntry({ originalText:'This is the original story.', originalLanguage:'English', translationLanguage:'French', translation:'Ceci est l’histoire originale.' }), '');
  assert.equal(languagesMatch('Français', 'French'), true);
});

test('an author translation in the reader’s UI language suppresses the machine translation action', () => {
  const story = { text:'Original words.', translation:'Auteur translation.', translationLanguage:'English' };
  assert.equal(shouldShowMachineTranslation(story, 'en'), false);
  assert.equal(shouldShowMachineTranslation(story, 'French'), true);
  assert.equal(shouldShowMachineTranslation({ ...story, translation:'' }, 'en'), true);
});

test('Share step 3 surfaces translation data-entry errors on the relevant field', () => {
  assert.deepEqual(validateShareStep(3, { text:'Original story.', originalLanguage:'English', translation:'Translation text.' }), {
    translationLanguage:'Choose a language for the translation.',
  });
  assert.deepEqual(validateShareStep(3, { text:'Original story.', originalLanguage:'English', translationLanguage:'French', translation:'Original story!' }), {
    translation:'This looks like the original text. Paste the translation, or leave it empty.',
  });
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
  assert.deepEqual(mapShareSubmissionError('This looks like the original text. Paste the translation, or leave it empty.'), {
    step: 3, field: 'translation', message: 'This looks like the original text. Paste the translation, or leave it empty.',
  });
  assert.equal(mapShareSubmissionError('The service is temporarily unavailable.'), null);
});
