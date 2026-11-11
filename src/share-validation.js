import { LANGUAGES } from './lib/languages.js';

export function createImageDetails(count, profileName = '') {
  const name = String(profileName || '').trim();
  return Array.from({ length: count }, () => ({ altText: '', credit: name ? `Photo: ${name}` : '' }));
}

function normalizedLanguage(value) {
  return String(value || '').trim().normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function languageCode(value) {
  const normalized = normalizedLanguage(value);
  if (!normalized) return '';
  const match = LANGUAGES.find(language => [language.code, language.name, language.nativeName].some(label => normalizedLanguage(label) === normalized));
  return match?.code || normalized;
}

export function languagesMatch(left, right) {
  const a = languageCode(left);
  const b = languageCode(right);
  return !!a && !!b && a === b;
}

function normalizedText(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function levenshteinSimilarity(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length, 1);
}

function trigramSimilarity(left, right) {
  const counts = value => {
    const result = new Map();
    for (let index = 0; index <= value.length - 3; index += 1) {
      const gram = value.slice(index, index + 3);
      result.set(gram, (result.get(gram) || 0) + 1);
    }
    return result;
  };
  const a = counts(left);
  const b = counts(right);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const count of a.values()) totalA += count;
  for (const count of b.values()) totalB += count;
  for (const [gram, count] of a) overlap += Math.min(count, b.get(gram) || 0);
  return totalA + totalB ? (2 * overlap) / (totalA + totalB) : 0;
}

export function translationLooksLikeOriginal(originalText, translationText) {
  const original = normalizedText(originalText);
  const translation = normalizedText(translationText);
  if (!original || !translation) return false;
  if (original === translation) return true;
  if (Math.max(original.length, translation.length) <= 512) return levenshteinSimilarity(original, translation) > 0.9;
  return trigramSimilarity(original, translation) > 0.9;
}

export function validateTranslationEntry({ originalText = '', originalLanguage = '', translation = '', translationLanguage = '' } = {}) {
  const text = String(translation || '').trim();
  const language = String(translationLanguage || '').trim();
  if (!text && !language) return '';
  if (text && !language) return 'Choose a language for the translation.';
  if (language && !text) return 'Enter the translation or clear its language.';
  if (languagesMatch(originalLanguage, language)) return 'Translation language must differ from the original language.';
  if (translationLooksLikeOriginal(originalText, text)) return 'This looks like the original text. Paste the translation, or leave it empty.';
  return '';
}

export function shouldShowMachineTranslation(story, uiLanguage, text = story?.text) {
  if (!String(text || '').trim()) return false;
  const hasAuthorTranslation = String(story?.translation || '').trim() && languagesMatch(story?.translationLanguage, uiLanguage);
  return !hasAuthorTranslation;
}

export function prepareImageMetadata(details = [], title = '') {
  const fallbackAlt = `Photo for: ${String(title || '').trim()}`;
  return details.map(item => ({
    altText: String(item?.altText || '').trim() || fallbackAlt,
    credit: String(item?.credit || '').trim(),
  }));
}

function sourcesAreValid(value) {
  const sources = String(value || '').split('\n').map(line => line.trim()).filter(Boolean);
  return sources.length <= 20 && sources.every(source => {
    const separator = source.indexOf('|');
    const label = separator < 0 ? source : source.slice(0, separator).trim();
    const url = separator < 0 ? source : source.slice(separator + 1).trim();
    return label.length <= 160 && url.length <= 1000 && /^https:\/\//i.test(url);
  });
}

export function validateShareStep(step, {
  originalLanguage = '', title = '', text = '', translation = '', translationLanguage = '', hasAudio = false, consentConfirmed = false,
  postImages = [], imageDetails = [], region = '', people = '', tags = '', sources = '', authorDisplayName = '', requireAuthorName = false,
} = {}) {
  const errors = {};
  if (step === 1 && !String(originalLanguage).trim()) errors.language = 'Choose or enter a language.';
  if (step === 1 && String(originalLanguage).length > 80) errors.language = 'Language names can be up to 80 characters.';
  if (step === 2) {
    if (!String(title).trim()) errors.title = 'Enter a title before continuing.';
    else if (String(title).length > 160) errors.title = 'Titles can be up to 160 characters.';
    if (!String(text).trim() && !hasAudio) errors.text = 'Write your story or add an audio recording.';
    else if (String(text).length > 12000) errors.text = 'Story text can be up to 12,000 characters.';
    postImages.forEach((_, index) => {
      const detail = imageDetails[index] || {};
      if (String(detail.altText || '').length > 500) errors[`image-alt-${index}`] = 'Alt text can be up to 500 characters.';
      if (!String(detail.credit || '').trim()) errors[`image-credit-${index}`] = 'Add a credit for this photo.';
      else if (String(detail.credit).length > 240) errors[`image-credit-${index}`] = 'Credits can be up to 240 characters.';
    });
    if (String(region).length > 120) errors.region = 'Region can be up to 120 characters.';
    if (String(people).length > 180) errors.people = 'People can be up to 180 characters.';
    const tagList = String(tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
    if (tagList.length > 20 || tagList.some(tag => tag.length > 40)) errors.tags = 'Use up to 20 tags, each 40 characters or fewer.';
    if (!sourcesAreValid(sources)) errors.sources = 'Sources must be labels and HTTPS links, with up to 20 entries.';
  }
  if (step === 3) {
    const translationError = validateTranslationEntry({ originalText: text, originalLanguage, translation, translationLanguage });
    if (translationError) {
      errors[translationError.includes('language') ? 'translationLanguage' : 'translation'] = translationError;
    }
  }
  if (step === 4) {
    if (requireAuthorName && !String(authorDisplayName).trim()) errors.authorName = 'Enter the name you want to appear on your posts.';
    if (!consentConfirmed) errors.consent = 'Confirm that this story is yours or that you have permission.';
  }
  return errors;
}

export function mapShareSubmissionError(message) {
  const text = String(message || '');
  const rules = [
    [/title.*160 characters|enter a title/i, 2, 'title'],
    [/valid post type/i, 2, 'kind'],
    [/valid section/i, 2, 'section'],
    [/valid trust label/i, 2, 'trustLabel'],
    [/valid licence/i, 2, 'licence'],
    [/public or community only access/i, 4, 'access'],
    [/confirm that this content is yours|permission/i, 4, 'consent'],
    [/region and people fields/i, 2, 'region'],
    [/tags?/i, 2, 'tags'],
    [/sources must be/i, 2, 'sources'],
    [/image details could not be read|add alt text and credit|every image needs/i, 2, 'images'],
    [/uploaded image|image files are limited|each image is limited|a post may contain up to six|choose jpeg, png, webp/i, 2, 'images'],
    [/story text is limited/i, 2, 'text'],
    [/enter the language of the story|language or translation is too long/i, 1, 'language'],
    [/post media upload is too large|upload storage limit reached/i, 2, 'images'],
    [/approve the ai draft/i, 3, 'translationApproval'],
    [/choose a language for the translation|translation language must differ/i, 3, 'translationLanguage'],
    [/enter the translation or clear its language/i, 3, 'translationLanguage'],
    [/looks like the original text/i, 3, 'translation'],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? { step: match[1], field: match[2], message: text } : null;
}

export function shareFieldId(field, otherLanguageMode = false) {
  if (field === 'language') return otherLanguageMode ? 'share-language-other' : 'share-language';
  if (field === 'authorName') return 'share-author-name';
  if (field.startsWith('image-')) return `share-${field}`;
  if (field === 'translationApproval') return 'share-translation-approve';
  if (field === 'translationLanguage') return 'share-translation-language';
  if (field === 'translation') return 'share-translation';
  return `share-${field}`;
}
