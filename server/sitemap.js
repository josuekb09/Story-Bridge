import { OBJECT_RECORDS } from '../src/object-records.js';

const SITE_ORIGIN = 'https://story-bridge.onrender.com';
const xmlEscape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function createSitemapXml(storyIds = []) {
  const paths = [
    '/',
    '/discover',
    '/cultures',
    '/search',
    '/objects',
    ...OBJECT_RECORDS.map(record => `/objects/${encodeURIComponent(record.id)}`),
    ...storyIds.map(id => `/stories/${encodeURIComponent(id)}`),
  ];
  const urls = [...new Set(paths)].map(route => `  <url><loc>${xmlEscape(`${SITE_ORIGIN}${route}`)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function sendSitemap(res, storyIds = []) {
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.type('application/xml').send(createSitemapXml(storyIds));
}
