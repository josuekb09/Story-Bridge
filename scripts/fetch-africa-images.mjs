#!/usr/bin/env node
// Fetches freely licensed photos for the landing page from Wikimedia Commons.
// Owner: Claude (see docs/COLLAB.md).
//
//   node scripts/fetch-africa-images.mjs            fetch every missing image
//   node scripts/fetch-africa-images.mjs --refresh  re-fetch everything
//   node scripts/fetch-africa-images.mjs --only=ke-nairobi
//
// Rules enforced here (the build of the landing page relies on them):
//  - only Public domain, CC0, CC BY and CC BY-SA licences are accepted;
//  - files with personality-rights restrictions are skipped (no identifiable people);
//  - titles/descriptions that mention people are skipped;
//  - author, licence and source URL are recorded for every image;
//  - images are re-encoded to WebP with all metadata (EXIF/GPS) stripped.
// After running, review docs/image-manifest.json and pin good choices in
// src/data/showcase.js with `pin: 'File:...'` so the result is stable.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import dns from 'node:dns';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Some Windows networks advertise IPv6 but cannot route it; Node then fails with a bare
// "fetch failed". Prefer IPv4 and fall back to the system curl if Node still fails.
dns.setDefaultResultOrder?.('ipv4first');
const execFileAsync = promisify(execFile);
import { SHOWCASE } from '../src/data/showcase.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'assets', 'photos', 'africa', 'web');
const dataFile = path.join(root, 'src', 'data', 'africa-images.json');
const manifestFile = path.join(root, 'docs', 'image-manifest.json');
const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'StoryBridgeImageCredits/1.0 (https://github.com/josuekb09/Story-Bridge)';
const WIDTHS = [640, 1280, 1920];
const ALLOWED = /^(public domain|pd|cc0|cc[- ]by(?:-sa)?[- ]\d(?:\.\d)?)/i;
const PEOPLE_IN_DESCRIPTION = /\b(portrait|selfie|crowd|wedding|bride)\b/i;
const PEOPLE = /\b(people|person|portrait|woman|women|man|men|girl|boy|child|children|kid|dancer|dancers|tourist|tourists|crowd|selfie|face|wedding|bride|vendor|family)\b/i;

const args = new Set(process.argv.slice(2));
const refresh = args.has('--refresh');
const only = [...args].find(arg => arg.startsWith('--only='))?.split('=')[1];

const stripHtml = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function cleanAuthor(value) {
  const text = String(value || '').trim();
  if (!text) return 'Unknown author';
  const named = text.match(/(?:taken|photographed|photo) by ([^.,;]+)/i);
  const short = (named ? named[1] : text).trim();
  return short.length > 70 ? `${short.slice(0, 67)}…` : short;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Wikimedia throttles bursts and some networks drop long connections, so every request
// is retried with a growing pause. The error message keeps the low-level cause.
async function request(url, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT }, signal: AbortSignal.timeout(45_000) });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        throw Object.assign(new Error(`HTTP ${response.status}`), { retryAfter });
      }
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { fatal: true });
      return response;
    } catch (error) {
      lastError = error;
      if (error.fatal || attempt === attempts) break;
      const pause = Math.max((error.retryAfter || 0) * 1000, 2000 * 2 ** (attempt - 1));
      await wait(pause);
    }
  }
  if (!lastError?.fatal) {
    try { return await curlResponse(url); } catch (curlError) { lastError = new Error(`${describe(lastError)}; curl: ${curlError.code === 'ENOENT' ? 'not installed' : (String(curlError.stderr || '').trim().split('\n').pop() || `exit ${curlError.code}`)}`); }
  }
  throw new Error(describe(lastError));
}

function describe(error) {
  if (!error) return 'request failed';
  const cause = error.cause;
  const nested = cause?.errors?.map(item => item.code || item.message).join('/') || cause?.code || cause?.message || '';
  return `${error.message}${nested ? ` (${nested})` : ''}`;
}

// Fallback through curl (bundled with Windows 10+, macOS and most Linux).
async function curlResponse(url) {
  const file = path.join(os.tmpdir(), `story-bridge-${process.pid}-${Date.now()}`);
  try {
    await execFileAsync('curl', ['-sSL', '--fail', '--retry', '3', '--retry-delay', '3', '--max-time', '90', '-4', '-A', USER_AGENT, '-o', file, url], { windowsHide: true });
    const buffer = await fs.readFile(file);
    return new Response(buffer, { status: 200 });
  } finally {
    await fs.rm(file, { force: true });
  }
}

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`;
  return (await request(url)).json();
}

function candidateFrom(page) {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  const licence = stripHtml(meta.LicenseShortName?.value);
  const description = stripHtml(meta.ImageDescription?.value);
  return {
    title: page.title,
    licence,
    licenceUrl: stripHtml(meta.LicenseUrl?.value),
    author: cleanAuthor(stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value)),
    restrictions: stripHtml(meta.Restrictions?.value),
    description,
    sourceUrl: info.descriptionurl,
    thumbUrl: info.thumburl || info.url,
    width: info.width,
    height: info.height,
    mime: info.mime,
  };
}

function rejection(candidate, minWidth = 1400) {
  if (!candidate) return 'no image info';
  if (!/^image\/(jpeg|png)$/.test(candidate.mime)) return `mime ${candidate.mime}`;
  if (candidate.width < minWidth) return `too small (${candidate.width}px)`;
  if (!ALLOWED.test(candidate.licence)) return `licence "${candidate.licence}"`;
  if (/\bnc\b|noncommercial|non-commercial/i.test(candidate.licence)) return 'non-commercial licence';
  if (candidate.restrictions) return `restrictions: ${candidate.restrictions}`;
  if (PEOPLE.test(candidate.title) || PEOPLE_IN_DESCRIPTION.test(candidate.description)) return 'mentions people';
  return '';
}

async function findImage(item) {
  const common = { prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1920' };
  const queries = item.pin ? [null] : [].concat(item.commons);
  const reasons = [];
  for (const query of queries) {
    const data = item.pin
      ? await api({ action: 'query', titles: item.pin, ...common })
      : await api({ action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: `${query} filetype:bitmap`, gsrlimit: '25', ...common });
    const pages = (data.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const page of pages) {
      const candidate = candidateFrom(page);
      const reason = rejection(candidate, item.minWidth || 1400);
      if (!reason) return { candidate, reasons };
      reasons.push(`${page.title}: ${reason}`);
    }
    await wait(1500);
  }
  return { candidate: null, reasons };
}

async function download(url) {
  return Buffer.from(await (await request(url)).arrayBuffer());
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  let existing = {};
  try { existing = JSON.parse(await fs.readFile(dataFile, 'utf8')); } catch { existing = {}; }
  const images = { ...existing };
  const report = [];

  for (const item of SHOWCASE) {
    if (only && item.id !== only) continue;
    if (item.local) {
      images[item.id] = { id: item.id, src: item.local.src, srcset: '', width: item.local.width, height: item.local.height, title: item.local.title, author: item.local.author, licence: item.local.licence, licenceUrl: item.local.licenceUrl, sourceUrl: item.local.sourceUrl };
      report.push([item.id, 'local', item.local.licence, item.local.author]);
      continue;
    }
    if (images[item.id] && !refresh) { report.push([item.id, 'kept', images[item.id].licence, images[item.id].author]); continue; }
    try {
      const { candidate, reasons } = await findImage(item);
      if (!candidate) {
        delete images[item.id];
        report.push([item.id, 'NOT FOUND', '', reasons.slice(0, 3).join(' | ')]);
        continue;
      }
      const buffer = await download(candidate.thumbUrl);
      const srcset = [];
      let outWidth = 0, outHeight = 0;
      for (const width of WIDTHS) {
        const file = path.join(outDir, `${item.id}-${width}.webp`);
        const info = await sharp(buffer).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toFile(file);
        srcset.push(`/assets/photos/africa/web/${item.id}-${width}.webp ${info.width}w`);
        if (width === 1280) { outWidth = info.width; outHeight = info.height; }
      }
      images[item.id] = {
        id: item.id,
        src: `/assets/photos/africa/web/${item.id}-1280.webp`,
        srcset: srcset.join(', '),
        width: outWidth,
        height: outHeight,
        title: candidate.title.replace(/^File:/, ''),
        author: candidate.author,
        licence: candidate.licence,
        licenceUrl: candidate.licenceUrl,
        sourceUrl: candidate.sourceUrl,
      };
      report.push([item.id, 'fetched', candidate.licence, `${candidate.author} — ${candidate.title}`]);
    } catch (error) {
      report.push([item.id, 'ERROR', '', error.message]);
    }
    await wait(2500);
  }

  await fs.writeFile(dataFile, `${JSON.stringify(images, null, 2)}\n`);
  const manifest = SHOWCASE.map(item => ({ ...item, image: images[item.id] || null }));
  await fs.writeFile(manifestFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Review every entry. Remove or pin any image that shows identifiable people or is not what the caption says.', items: manifest }, null, 2)}\n`);
  console.table(report.map(([id, status, licence, detail]) => ({ id, status, licence, detail: String(detail).slice(0, 140) })));
  console.log(`\nWrote ${path.relative(root, dataFile)} and ${path.relative(root, manifestFile)}. Review the manifest before publishing.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
