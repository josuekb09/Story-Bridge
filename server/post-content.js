import crypto from 'node:crypto';
import sharp from 'sharp';

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const licences = new Set(['All rights reserved', 'CC BY 4.0', 'CC BY-SA 4.0']);
const kinds = new Set(['story', 'object', 'language', 'music', 'tradition', 'place']);
const sections = new Set(['stories', 'objects-art', 'languages-proverbs', 'music-dance', 'traditions-daily-life', 'places-history']);
const trustLabels = new Set(['Told by a community member', 'Research note', 'Museum record']);

export function validatePostMetadata(input = {}) {
  const sources = typeof input.sources === 'string' ? safeJson(input.sources, []) : input.sources;
  const tags = typeof input.tags === 'string' ? input.tags.split(',').map(value => value.trim()).filter(Boolean) : input.tags;
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) return 'Enter a title of 160 characters or fewer.';
  if (!kinds.has(input.kind)) return 'Choose a valid post type.';
  if (!sections.has(input.section)) return 'Choose a valid section.';
  if (!trustLabels.has(input.trustLabel)) return 'Choose a valid trust label.';
  if (!licences.has(input.licence)) return 'Choose a valid licence.';
  if (!['Public', 'Community only'].includes(input.access)) return 'Choose Public or Community only access.';
  if (input.consentConfirmed !== true && input.consentConfirmed !== 'true') return 'Confirm that this content is yours or you have permission.';
  if (input.region?.length > 120 || input.people?.length > 180) return 'Region and people fields are too long.';
  if (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || tag.length > 40)) return 'Use up to 20 tags, each 40 characters or fewer.';
  if (!Array.isArray(sources) || sources.length > 20 || sources.some(item => !item || typeof item.label !== 'string' || item.label.length > 160 || typeof item.url !== 'string' || !/^https:\/\//i.test(item.url) || item.url.length > 1000)) return 'Sources must be a list of labels and HTTPS links.';
  return '';
}

function safeJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }

export function normalizePostMetadata(input) {
  const sources = typeof input.sources === 'string' ? safeJson(input.sources, []) : input.sources;
  const tags = typeof input.tags === 'string' ? input.tags.split(',').map(value => value.trim()).filter(Boolean) : input.tags;
  return {
    title: input.title.trim(), kind: input.kind, section: input.section, trust_label: input.trustLabel,
    licence: input.licence, region: String(input.region || '').trim(), people: String(input.people || '').trim(),
    tags: tags || [], sources: sources || [], consent_confirmed: true, access: input.access,
  };
}

export function validateImageMetadata(images, metadata) {
  if (!Array.isArray(images) || images.length > 6 || !Array.isArray(metadata) || metadata.length !== images.length) return 'Add alt text and credit for every image.';
  if (images.some((_,index)=>!metadata[index]||typeof metadata[index].altText!=='string'||!metadata[index].altText.trim()||metadata[index].altText.length>500||typeof metadata[index].credit!=='string'||!metadata[index].credit.trim()||metadata[index].credit.length>240)) return 'Every image needs alt text and credit.';
  return '';
}

export async function validateAndReencodeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('invalid-image');
  if (buffer.length > IMAGE_MAX_BYTES) throw new Error('image-too-large');
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('invalid-image');
  try {
    const meta = await sharp(buffer, { limitInputPixels: 64_000_000 }).metadata();
    if (!['jpeg','png','webp'].includes(meta.format)) throw new Error('invalid-image');
    const output = await sharp(buffer, { limitInputPixels: 64_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { buffer: output.data, width: output.info.width, height: output.info.height, sha256: crypto.createHash('sha256').update(output.data).digest('hex'), mime: 'image/webp' };
  } catch { throw new Error('invalid-image'); }
}

export async function createImageVariant(buffer, width, quality = 78) {
  const output = await sharp(buffer, { limitInputPixels: 64_000_000 })
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return { buffer: output.data, width: output.info.width, height: output.info.height, sha256: crypto.createHash('sha256').update(output.data).digest('hex'), mime: 'image/webp' };
}

export const createFeedThumbnail = buffer => createImageVariant(buffer, 640, 78);
