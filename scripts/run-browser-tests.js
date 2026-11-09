import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { signTestToken } from '../server/auth.js';

const root = process.cwd();
const inside = value => path.resolve(value).startsWith(`${root}${path.sep}`);
const recorderPreviewOnly = process.env.RECORDER_PREVIEW_ONLY === '1';
const focusedScenario = process.env.STORY_TEST_SCENARIOS || '';
const recorderCaptureSeconds = Math.max(3, Math.min(10, Number.parseInt(process.env.RECORDER_CAPTURE_SECONDS || '3', 10) || 3));
class FocusedPreviewComplete extends Error {}
const requiredEnv = {
  TEMP: path.join(root, '_tmp'),
  TMP: path.join(root, '_tmp'),
  npm_config_cache: path.join(root, '_npm-cache'),
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, '.test-data', 'playwright-browsers'),
};
for (const [key, value] of Object.entries(requiredEnv)) {
  if (path.resolve(process.env[key] || '') !== path.resolve(value)) throw new Error(`${key} must point inside this project to ${value}`);
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
const isolated = path.join(root, '.test-data', 'runs', runId);
const dataDir = path.join(isolated, 'data');
const uploadsDir = path.join(isolated, 'uploads');
const fixtureDir = path.join(isolated, 'fixtures');
const evidenceDir = path.join(root, 'test-evidence', runId);
for (const dir of [isolated, dataDir, uploadsDir, fixtureDir, evidenceDir]) {
  if (!inside(dir)) throw new Error('Refusing a path outside the project.');
  fs.mkdirSync(dir, { recursive: true });
}
const apiPort = Number(process.env.TEST_API_PORT || await freePort());
const webPort = Number(process.env.TEST_WEB_PORT || await freePort());
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const buildDir = path.resolve(process.env.STORY_BRIDGE_BUILD_DIR || path.join(root, 'dist'));
if (!inside(buildDir)) throw new Error('The browser suite build directory must stay inside this project.');
const results = [];
const responseBodies = [];
const urls = [];
const consoleMessages = [];
const consoleErrors = [];
const resourceErrors = [];
const pageErrors = [];
const serverLogs = [];
let apiServer;
let webServer;
let accountServer;
let jwksServer;
let browser;
let contextA;
let contextB;
let contextCapture;
let contextUnsupported;
let pageA;
let pageB;
let pageCapture;
let pageUnsupported;
let accountFlowPage;
let ownerA = '';
let ownerB = '';
let ownerCapture = '';
let ownerUnsupported = '';
let storyId = '';
let fixturePath = '';
const draftActionText = 'Saved directly by the draft action.';
const draftActionTranslation = 'Draft-action translation stays on the story.';
const approvedActionText = 'Published directly by the approval action.';
const approvedActionTranslation = 'Approval-action translation is public.';

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const pass = name => { results.push({ name, status: 'PASS' }); process.stdout.write(`PASS ${name}\n`); };
const record = async (name, fn, prerequisite = true) => {
  if (focusedScenario === 'account' && !['Isolated test server and storage under .test-data', 'Production server security headers and enforced CSP', 'Launch bundled Chromium with isolated A and B contexts', 'Account screens have 375px and 1280px visual evidence'].includes(name)) {
    results.push({ name, status: 'NOT EXECUTED', detail: 'Excluded by STORY_TEST_SCENARIOS=account.' }); process.stdout.write(`NOT EXECUTED ${name}\n`); return false;
  }
  if (!prerequisite) { results.push({ name, status: 'NOT TESTED', detail: 'Prerequisite did not pass.' }); process.stdout.write(`NOT TESTED ${name}\n`); return false; }
  try { const detail = await fn(); const status=detail?.status || 'PASS'; results.push({ name, status, detail: detail?.detail || '' }); process.stdout.write(`${status} ${name}${detail?.detail ? ` — ${detail.detail}` : ''}\n`); return status === 'PASS'; }
  catch (error) {
    const detail = String(error?.message || error).replace(/[0-9a-f]{64,}/gi, '[redacted token-like value]');
    results.push({ name, status: 'FAIL', detail }); process.stderr.write(`FAIL ${name} — ${detail}\n`);
    const page = accountFlowPage && !accountFlowPage.isClosed() ? accountFlowPage : pageCapture && !pageCapture.isClosed() ? pageCapture : pageA || pageB;
    if (page && !page.isClosed()) { try { const p = path.join(evidenceDir, `failure-${results.length}.png`); await page.screenshot({ path: p, fullPage: true }); results.at(-1).evidence = path.relative(root, p); } catch {} }
    return false;
  }
};
async function captureEvidence(name, capture) {
  try {
    const result = await capture();
    results.push({ name, status: 'PASS', evidence: Array.isArray(result) ? result.map(item => path.relative(root, item.file)) : path.relative(root, result.file), detail: Array.isArray(result) ? JSON.stringify(result.map(item => item.metrics)) : JSON.stringify(result.metrics) });
  } catch (error) {
    const detail = String(error?.message || error).replace(/[0-9a-f]{64,}/gi, '[redacted token-like value]');
    results.push({ name, status: 'FAIL', detail }); process.stderr.write(`FAIL ${name} — ${detail}\n`);
  }
}
function observePage(page) {
  page.on('request', req => urls.push(req.url()));
  page.on('console', msg => {
    consoleMessages.push(msg.text());
    if (msg.type() === 'error') {
      if (msg.text().startsWith('Failed to load resource:')) resourceErrors.push(msg.text());
      else consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  page.on('response', response => {
    if (response.url().includes('/api/') && response.headers()['content-type']?.includes('application/json')) {
      response.text().then(text => responseBodies.push(text)).catch(() => {});
    }
  });
}
async function direct(token, urlPath, method = 'GET', data) {
  urls.push(`${apiOrigin}${urlPath}`);
  const headers = {};
  if (token) headers['x-owner-token'] = token;
  let body;
  if (data instanceof FormData) body = data;
  else if (data !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(data); }
  const response = await fetch(`${apiOrigin}${urlPath}`, { method, headers, body });
  const text = await response.text(); responseBodies.push(text);
  let json; try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, body: json, text, contentType: response.headers.get('content-type') || '' };
}
async function waitFor(url) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(250);
  }
  throw new Error(`Test service did not become ready at ${url}`);
}
function child(command, args, env) {
  const p = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  p.stdout.on('data', b => serverLogs.push(b.toString()));
  p.stderr.on('data', b => { serverLogs.push(b.toString()); process.stderr.write(b); });
  return p;
}
async function stop(p) {
  if (!p || p.exitCode !== null) return;
  await new Promise(resolve => { p.once('exit', resolve); p.kill(); setTimeout(resolve, 3000).unref(); });
}
async function startApi() {
  apiServer = child(process.execPath, ['server/index.js'], {
    NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(apiPort), STORY_BACKEND:'file', STORY_AUTH_MODE:'legacy',
    STORY_DATA_DIR: dataDir, STORY_UPLOAD_DIR: uploadsDir, STORY_NO_LISTEN: '0',
  });
  await waitFor(`${apiOrigin}/api/stories`);
}
async function startWeb() {
  webServer = child(process.execPath, ['server/static-test-server.js'], {
    NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(webPort), STORY_BACKEND:'file', STORY_AUTH_MODE:'legacy', STORY_SERVE_STATIC:'1',
    STORY_DATA_DIR: dataDir, STORY_UPLOAD_DIR: uploadsDir, STORY_BRIDGE_BUILD_DIR: buildDir, STORY_NO_LISTEN: '0',
  });
  await waitFor(`${webOrigin}/api/stories`);
}
function waveFixture(file) {
  const sampleRate = 16000, seconds = 3, samples = sampleRate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 5000), i * 2);
  const wav = Buffer.alloc(44 + data.length); wav.write('RIFF', 0); wav.writeUInt32LE(36 + data.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(data.length, 40); data.copy(wav, 44); fs.writeFileSync(file, wav);
}
async function captureScreen(page, name, width, captureLower = true) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(100);
  const metrics = await page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const controls = [...document.querySelectorAll('button,input:not([type=checkbox]):not([type=radio]),textarea,audio')].filter(visible);
    const clipped = controls.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.width < 24 || r.height < 20; }).map(el => `${el.tagName.toLowerCase()}${el.type?`[type=${el.type}]`:''}${el.getAttribute('aria-label')?`[aria-label=${el.getAttribute('aria-label')}]`:''}(${Math.round(el.getBoundingClientRect().left)},${Math.round(el.getBoundingClientRect().right)},${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)})`);
    const tiny = [...document.querySelectorAll('body *')].filter(visible).map(el => ({ size:parseFloat(getComputedStyle(el).fontSize), selector:`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().replace(/\s+/g,'.')}` : ''}`, text:(el.innerText||'').trim().slice(0,50) })).filter(item => item.size > 0 && item.size < 12);
    const main = document.querySelector('main')?.getBoundingClientRect(); const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, clippedControls: clipped, tinyText: tiny, mainX: main?.x, mainRight: main?.right, mainBottom: main?.bottom, navTop: nav?.top, navWidth: nav?.width };
  });
  ensure(metrics.document <= width + 1, `Horizontal overflow at ${width}px (document ${metrics.document}px; viewport ${width}px).`);
  ensure(metrics.clippedControls.length === 0, `Clipped or undersized controls at ${width}px: ${metrics.clippedControls.join(', ')}.`);
  ensure(metrics.tinyText.length === 0, `Text below 12px found at ${width}px: ${metrics.tinyText.slice(0,8).map(item=>`${item.selector} (${item.size}px) “${item.text}”`).join('; ')}.`);
  ensure(metrics.mainX >= -1 && metrics.mainRight <= width + 1, `Main content clipped at ${width}px.`);
  ensure(metrics.navWidth <= width + 1 && metrics.mainBottom <= metrics.navTop + 1, `Main content overlaps the bottom navigation at ${width}px.`);
  const file = path.join(evidenceDir, `${name}-${width}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  if (!captureLower) return { file, metrics };
  const main=page.locator('main');
  await main.evaluate(el => { el.scrollTop=Math.max(0,el.scrollHeight-el.clientHeight-90); }); await page.waitForTimeout(50);
  const bottomFile=path.join(evidenceDir, `${name}-${width}-bottom.png`);
  await page.screenshot({ path: bottomFile, animations: 'disabled' });
  await main.evaluate(el => { el.scrollTop=0; });
  return { file, bottomFile, metrics };
}

async function confirmAction(page, button, accept) {
  let timer;
  let handler;
  const dialogResult = new Promise((resolve, reject) => {
    handler = async dialog => {
      try {
        const message = dialog.message();
        if (accept) await dialog.accept(); else await dialog.dismiss();
        resolve({ message, accepted: accept });
      } catch (error) { reject(error); }
    };
    page.on('dialog', handler);
    timer = setTimeout(() => reject(new Error('Expected confirmation dialog did not appear.')), 5000);
  });
  try {
    await button.click();
    const result = await dialogResult;
    ensure(result.accepted === accept, 'Confirmation dialog action did not match the requested choice.');
    return result.message;
  } finally {
    clearTimeout(timer);
    page.off('dialog', handler);
  }
}
async function observeNoDialog(page, action) {
  let observed = false;
  const handler = async dialog => { observed = true; await dialog.dismiss(); };
  page.on('dialog', handler);
  try { await action(); return observed; }
  finally { page.off('dialog', handler); }
}
async function captureWidths(page, name) {
  for (const width of [1280, 375, 320]) {
    const shot = await captureScreen(page, name, width, true);
    results.push({ name: `${name} screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
  }
}
async function captureLandingScreens(page) {
  const shots=[];
  for(const width of [375,768,1280]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
    const metrics=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    ensure(metrics.document<=width+1,`Landing has horizontal overflow at ${width}px.`);
    const file=path.join(evidenceDir,`landing-${width}.png`);await page.screenshot({path:file,fullPage:true,animations:'disabled'});
    shots.push({file,metrics});
  }
  results.push({name:'Public landing screenshots at 375px, 768px and 1280px',status:'PASS',evidence:shots.map(item=>path.relative(root,item.file)),detail:JSON.stringify(shots.map(item=>item.metrics))});
}

let ok = true;
try {
  await record('Isolated test server and storage under .test-data', async () => {
    ensure(inside(dataDir) && inside(uploadsDir), 'Isolated storage escaped the project.');
    ensure(fs.existsSync(path.join(buildDir, 'index.html')), 'Production build is missing; run npm run build first.');
    await startApi(); await startWeb();
    ensure(fs.existsSync(dataDir) && fs.existsSync(uploadsDir), 'Test server did not initialize isolated data directories.');
  });
  if (!apiServer || !webServer) throw new Error('Isolated test services could not start; stopping before application actions.');

  await record('Production server security headers and enforced CSP', async () => {
    const response = await fetch(`${webOrigin}/`);
    const csp = response.headers.get('content-security-policy') || '';
    ensure(response.ok && csp.includes("script-src 'self'") && csp.includes("style-src 'self'") && csp.includes("connect-src 'self'") && csp.includes("media-src 'self' blob:"), 'Production response CSP omitted required app or blob-media sources.');
    ensure(response.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options missing.');
    ensure(response.headers.get('x-frame-options') === 'DENY', 'Frame protection header missing.');
    ensure(response.headers.get('referrer-policy') === 'no-referrer', 'Referrer-Policy missing.');
    ensure(!response.headers.has('strict-transport-security'), 'HSTS was enabled without the HTTPS flag.');
  });

  await record('Synthetic audio fixture generation', async () => {
    fixturePath = path.join(fixtureDir, 'synthetic-tone.wav'); waveFixture(fixturePath);
    ensure(fs.statSync(fixturePath).size > 1000, 'Generated WAV fixture is unexpectedly small.');
  });
  await record('Launch bundled Chromium with isolated A and B contexts', async () => {
    fs.mkdirSync(path.join(isolated, 'local-appdata'), { recursive: true }); fs.mkdirSync(path.join(isolated, 'appdata'), { recursive: true });
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, TEMP: requiredEnv.TEMP, TMP: requiredEnv.TMP, LOCALAPPDATA: path.join(isolated, 'local-appdata'), APPDATA: path.join(isolated, 'appdata'), PLAYWRIGHT_BROWSERS_PATH: requiredEnv.PLAYWRIGHT_BROWSERS_PATH } });
    contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contextCapture = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contextUnsupported = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    for (const context of [contextA, contextB, contextCapture, contextUnsupported]) await context.route('https://fonts.googleapis.com/**', route => route.abort());
    for (const context of [contextA, contextB, contextCapture, contextUnsupported]) await context.addInitScript(() => {
      window.__storyBridgeCspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.__storyBridgeCspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI }));
    });
    pageA = await contextA.newPage(); pageB = await contextB.newPage(); pageA.setDefaultTimeout(8000); pageB.setDefaultTimeout(8000); observePage(pageA); observePage(pageB);
    pageCapture = await contextCapture.newPage(); pageUnsupported = await contextUnsupported.newPage(); pageCapture.setDefaultTimeout(8000); pageUnsupported.setDefaultTimeout(8000); observePage(pageCapture); observePage(pageUnsupported);
    await pageCapture.addInitScript(() => {
      window.__revokedObjectUrls = [];
      const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = url => { window.__revokedObjectUrls.push(url); nativeRevokeObjectURL(url); };
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (window.__denyNextMic) { window.__denyNextMic = false; throw new DOMException('Synthetic permission denial', 'NotAllowedError'); }
        if (window.__missingNextMic) { window.__missingNextMic = false; throw new DOMException('Synthetic missing microphone', 'NotFoundError'); }
        const stream = await original(constraints);
        window.__lastMicStream = stream;
        return stream;
      };
      const NativeMediaRecorder = window.MediaRecorder;
      if (NativeMediaRecorder) window.MediaRecorder = new Proxy(NativeMediaRecorder, {
        construct(target, args) {
          const mode = window.__emptyNextRecording ? 'empty' : window.__failedNextRecording ? 'failed' : window.__incompatibleNextRecording ? 'incompatible' : '';
          if (!mode) {
            const recorder = Reflect.construct(target, args);
            window.__lastMediaRecorder = recorder;
            return recorder;
          }
          window.__emptyNextRecording = false;
          window.__failedNextRecording = false;
          window.__incompatibleNextRecording = false;
          return {
            mimeType: mode === 'incompatible' ? 'video/webm' : 'audio/webm', state: 'inactive', ondataavailable: null, onerror: null, onstop: null,
            start() {
              this.state = 'recording';
              if (mode === 'failed') setTimeout(() => {
                this.state = 'inactive';
                this.onerror?.({ error: new DOMException('Synthetic microphone read failure', 'NotReadableError') });
              }, 250);
            },
            stop() { this.state = 'inactive'; setTimeout(() => this.onstop?.(), 1400); },
          };
        },
      });
    });
    await pageUnsupported.addInitScript(() => { Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: undefined }); });
    await pageA.goto(webOrigin,{waitUntil:'domcontentloaded'}); await pageA.getByRole('heading', { name: 'Share your culture. Learn from every other.' }).waitFor(); await pageA.locator('.home-actions').getByRole('button',{name:'Explore stories'}).click(); await pageA.getByRole('heading',{name:'Listen'}).waitFor();
    await pageB.goto(webOrigin,{waitUntil:'domcontentloaded'}); await pageB.getByRole('heading', { name: 'Share your culture. Learn from every other.' }).waitFor(); await pageB.locator('.home-actions').getByRole('button',{name:'Explore stories'}).click(); await pageB.getByRole('heading',{name:'Listen'}).waitFor();
    await pageCapture.goto(webOrigin,{waitUntil:'domcontentloaded'}); await pageCapture.getByRole('heading', { name: 'Share your culture. Learn from every other.' }).waitFor(); await pageCapture.locator('.home-actions').getByRole('button',{name:'Explore stories'}).click(); await pageCapture.getByRole('heading',{name:'Listen'}).waitFor();
    await pageUnsupported.goto(webOrigin,{waitUntil:'domcontentloaded'}); await pageUnsupported.getByRole('heading', { name: 'Share your culture. Learn from every other.' }).waitFor(); await pageUnsupported.locator('.home-actions').getByRole('button',{name:'Explore stories'}).click(); await pageUnsupported.getByRole('heading',{name:'Listen'}).waitFor();
    ownerA = await pageA.evaluate(() => localStorage.getItem('story-bridge-owner') || '');
    ownerB = await pageB.evaluate(() => localStorage.getItem('story-bridge-owner') || '');
    ownerCapture = await pageCapture.evaluate(() => localStorage.getItem('story-bridge-owner') || '');
    ownerUnsupported = await pageUnsupported.evaluate(() => localStorage.getItem('story-bridge-owner') || '');
    ensure([ownerA, ownerB, ownerCapture, ownerUnsupported].every(value => value.length >= 32) && new Set([ownerA, ownerB, ownerCapture, ownerUnsupported]).size === 4, 'Browser contexts did not receive separate owner tokens.');
  });
  const browserReady = !!(pageA && pageB && ownerA && ownerB);
  const captureReady = !!(pageCapture && ownerCapture && pageUnsupported && ownerUnsupported);

  let capturePreviewReady = false;
  let captureLifecycleReady = false;
  let captureSavedStoryId = '';

  await record('Recording statuses, elapsed timer, captured audio preview, size, MIME, and playback', async () => {
    await pageCapture.locator('nav.bottom-nav').getByRole('button', { name: 'Share a story', exact: true }).click();
    await pageCapture.getByRole('heading', { name: 'Share a story' }).waitFor();
    await pageCapture.getByLabel('Language told in').fill('Synthetic recording language'); await pageCapture.getByRole('button',{name:'Continue to your story'}).click();
    await pageCapture.getByRole('status').getByText('Ready to record.').waitFor();
    await captureWidths(pageCapture, 'record-ready');

    await pageCapture.evaluate(() => {
      window.__captureStatuses = [];
      const status = document.querySelector('[role="status"]');
      new MutationObserver(() => window.__captureStatuses.push(status.textContent.trim())).observe(status, { childList: true, subtree: true, characterData: true });
    });
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('status').getByText('Waiting for microphone permission.').waitFor();
    ensure(await pageCapture.locator('button[type="submit"]').count()===0,'A publish/save control appeared before the mandatory review step.');
    ensure(await pageCapture.getByRole('button', { name: 'Record voice' }).count() === 0, 'A second recording control remained available while waiting for permission.');
    ensure(await pageCapture.getByRole('button',{name:'Continue to translation'}).isDisabled(), 'The story advanced while its recording capture was still pending.');
    ensure(await pageCapture.getByLabel(/Or choose an audio file/).isDisabled(), 'Upload remained enabled while waiting for microphone permission.');
    await captureWidths(pageCapture, 'record-waiting-permission');

    await pageCapture.getByRole('status').getByText('Recording.').waitFor();
    const timer = pageCapture.getByRole('timer');
    ensure(await timer.isVisible(), 'Elapsed timer is missing while recording.');
    await pageCapture.waitForFunction(seconds => {
      const label = document.querySelector('[role="timer"]')?.getAttribute('aria-label') || '';
      const match = label.match(/(\d+):(\d{2})/);
      return match && Number(match[1]) * 60 + Number(match[2]) >= seconds;
    }, recorderCaptureSeconds);
    const timing = await pageCapture.evaluate(() => ({
      timerRole: document.querySelector('[role="timer"]')?.getAttribute('role'),
      timerLiveAncestor: document.querySelector('[role="timer"]')?.closest('[aria-live]')?.getAttribute('aria-live') || '',
      status: document.querySelector('.recording-status')?.textContent.trim(),
      live: document.querySelector('.recording-status')?.getAttribute('aria-live'),
    }));
    ensure(timing.timerRole === 'timer' && !timing.timerLiveAncestor && timing.status === 'Recording.' && timing.live === 'polite', 'Timer updates are not isolated from the polite status announcement.');
    await captureWidths(pageCapture, 'record-active');

    await pageCapture.getByRole('button', { name: 'Stop recording' }).click();
    await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').waitFor();
    const audio = pageCapture.locator('audio[aria-label="Preview of unsaved audio"]');
    await audio.waitFor({ state: 'visible' });
    await pageCapture.getByText(/^Duration: 0:/).waitFor();
    await pageCapture.getByText(/File size: [1-9].*Format: audio\//).waitFor();
    const preview = await audio.evaluate(async element => {
      await new Promise(resolve => {
        if (element.readyState >= 1 || element.error) return resolve();
        element.addEventListener('loadedmetadata', resolve, { once: true });
        element.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 4000);
      });
      const mediaError = () => element.error ? { code: element.error.code } : null;
      const canPlayType = element.canPlayType(element.getAttribute('type') || element.currentSrc.match(/audio\/[a-z0-9.+-]+/i)?.[0] || 'audio/webm');
      const before = {
        currentTime: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : null,
        readyState: element.readyState,
        paused: element.paused,
        ended: element.ended,
        error: mediaError(),
      };
      let playResolved = null;
      let playRejected = '';
      let playbackWaitMs = 0;
      if (canPlayType) {
        try {
          element.muted = true;
          const playbackStartedAt = performance.now();
          await element.play();
          playResolved = true;
          const progressDeadline = performance.now() + 2000;
          while (element.currentTime <= before.currentTime && !element.ended && !element.error && performance.now() < progressDeadline) {
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          playbackWaitMs = Math.round(performance.now() - playbackStartedAt);
        } catch (error) {
          playResolved = false;
          playRejected = error?.name || 'playback failed';
        }
      }
      const afterPlay = {
        currentTime: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : null,
        readyState: element.readyState,
        paused: element.paused,
        ended: element.ended,
        error: mediaError(),
      };
      const progressed = afterPlay.currentTime > before.currentTime;
      if (!element.paused) element.pause();
      return {
        blobUrl: element.src.startsWith('blob:'),
        canPlayType,
        canPlay: !!canPlayType,
        playResolved,
        playRejected,
        currentTimeBefore: before.currentTime,
        currentTimeAfter: afterPlay.currentTime,
        duration: afterPlay.duration,
        readyStateBefore: before.readyState,
        readyStateAfter: afterPlay.readyState,
        pausedBefore: before.paused,
        pausedAfterPlay: afterPlay.paused,
        pausedAfterCleanup: element.paused,
        endedBefore: before.ended,
        endedAfterPlay: afterPlay.ended,
        mediaErrorBefore: before.error,
        mediaErrorAfter: afterPlay.error,
        playbackWaitMs,
        progressed,
      };
    });
    ensure(preview.blobUrl && preview.readyStateAfter >= 1 && preview.duration > 0 && preview.playResolved && preview.progressed, `Captured preview is not playable media metadata: ${JSON.stringify(preview)}.`);
    const displayMetadata = await pageCapture.locator('.recording-preview').innerText();
    const displayedType = displayMetadata.match(/Format:\s*(audio\/[a-z0-9.+-]+)/i)?.[1] || '';
    const displayedSize = displayMetadata.match(/File size:\s*([1-9][^\n·]*)/)?.[1] || '';
    ensure(/^audio\/[a-z0-9.+-]+$/i.test(displayedType) && displayedSize, `Captured file size or MIME was not shown honestly: ${displayMetadata.replace(/\n/g, ' | ')}.`);
    if (preview.canPlay) ensure(preview.progressed, `Chromium advertised support for the captured recording but playback did not advance. Diagnostics: ${JSON.stringify(preview)}.`);
    const actualRecorderMime = await pageCapture.evaluate(() => window.__lastMediaRecorder?.mimeType || '');
    const [actualContainer, ...actualParameters] = actualRecorderMime.split(';').map(part => part.trim());
    ensure(actualContainer?.toLowerCase() === displayedType.toLowerCase() && actualParameters.every(parameter => /^codecs\s*=\s*[a-z0-9._,-]+$/i.test(parameter)), `Actual MediaRecorder MIME was not safely normalized to the server-accepted type: ${actualRecorderMime || 'empty'} -> ${displayedType}.`);
    ensure(await pageCapture.getByRole('button', { name: 'Remove recording' }).isVisible(), 'Unsaved recording cannot be removed.');
    ensure(await pageCapture.getByRole('button', { name: 'Retake recording' }).isVisible(), 'Unsaved recording cannot be retaken.');
    const stoppedTracks = await pageCapture.evaluate(() => window.__lastMicStream?.getTracks().every(track => track.readyState === 'ended'));
    ensure(stoppedTracks, 'Microphone track remained live after stopping.');
    const cspViolations = await pageCapture.evaluate(() => window.__storyBridgeCspViolations);
    ensure(cspViolations.length === 0, `Recording preview violated the enforced CSP: ${JSON.stringify(cspViolations)}.`);
    const transitions = await pageCapture.evaluate(() => window.__captureStatuses);
    ensure(transitions.includes('Stopping recording.') && transitions.includes('Recording captured. Not saved yet.'), `Status transitions were incomplete: ${JSON.stringify(transitions)}.`);
    await captureWidths(pageCapture, 'record-captured-unsaved');
    capturePreviewReady = true;
    return { status: preview.canPlay ? 'PASS' : 'NOT TESTED', detail: `MediaRecorder reported ${actualRecorderMime}; captured UI MIME was ${displayedType}; displayed size was ${displayedSize}; playback diagnostics: ${JSON.stringify(preview)}.` };
  }, captureReady);

  if (recorderPreviewOnly) throw new FocusedPreviewComplete();

  await record('Retake cancellation, denied permission, missing device, successful replacement, and remove confirmation', async () => {
    const preview = pageCapture.locator('audio[aria-label="Preview of unsaved audio"]');
    const firstUrl = await preview.getAttribute('src');
    const canceled = await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Retake recording' }), false);
    ensure(canceled.includes('current unsaved audio will stay') && await preview.getAttribute('src') === firstUrl, 'Canceling retake did not preserve existing captured audio.');

    await pageCapture.evaluate(() => { window.__denyNextMic = true; });
    await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Retake recording' }), true);
    await pageCapture.getByRole('alert').getByText(/Microphone permission was denied/).waitFor();
    ensure(await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').isVisible(), 'Denied retake removed the previous capture.');
    ensure(await preview.getAttribute('src') === firstUrl, 'Denied retake replaced the previous preview.');
    await captureWidths(pageCapture, 'record-permission-denied');

    await pageCapture.evaluate(() => { window.__missingNextMic = true; });
    await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Retake recording' }), true);
    await pageCapture.getByRole('alert').getByText(/No microphone device was found/).waitFor();
    ensure(await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').isVisible(), 'Unavailable-device retake removed the previous capture.');
    ensure(await preview.getAttribute('src') === firstUrl, 'Unavailable-device retake replaced the previous preview.');
    await captureWidths(pageCapture, 'record-device-unavailable');

    await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Retake recording' }), true);
    await pageCapture.getByRole('status').getByText('Recording.').waitFor();
    ensure(await preview.getAttribute('src') === firstUrl, 'Existing preview was removed before replacement succeeded.');
    await pageCapture.waitForTimeout(1100);
    await pageCapture.getByRole('button', { name: 'Stop recording' }).click();
    await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').waitFor();
    const replacementUrl = await preview.getAttribute('src');
    ensure(replacementUrl && replacementUrl !== firstUrl, 'Successful retake did not replace the captured audio.');
    await pageCapture.waitForFunction(url => window.__revokedObjectUrls.includes(url), firstUrl);
    ensure(await pageCapture.evaluate(url => window.__revokedObjectUrls.includes(url), firstUrl), 'Previous recording object URL was not revoked after replacement.');
    await captureWidths(pageCapture, 'record-retaken-unsaved');

    const removeCanceled = await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Remove recording' }), false);
    ensure(removeCanceled.includes('Remove this unsaved audio') && await preview.getAttribute('src') === replacementUrl, 'Canceling removal did not preserve the preview.');
    await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Remove recording' }), true);
    await pageCapture.getByRole('status').getByText('Ready to record.').waitFor();
    ensure(await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').count() === 0, 'Removed audio preview remained visible.');
    await pageCapture.waitForFunction(url => window.__revokedObjectUrls.includes(url), replacementUrl);
    ensure(await pageCapture.evaluate(url => window.__revokedObjectUrls.includes(url), replacementUrl), 'Removed recording object URL was not revoked.');

    await pageCapture.evaluate(() => { window.__incompatibleNextRecording = true; });
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('status').getByText('Recording.').waitFor();
    await pageCapture.getByRole('button', { name: 'Stop recording' }).click();
    await pageCapture.getByRole('alert').getByText(/recorded video\/webm, which the server cannot accept/).waitFor();
    await pageCapture.getByRole('status').getByText('Ready to record.').waitFor();
    ensure(await pageCapture.evaluate(() => window.__lastMicStream?.getTracks().every(track => track.readyState === 'ended')), 'Microphone tracks remained live after incompatible-format rejection.');
    await captureWidths(pageCapture, 'record-unsupported-format');

    await pageCapture.evaluate(() => { window.__emptyNextRecording = true; });
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('status').getByText('Recording.').waitFor();
    await pageCapture.getByRole('button', { name: 'Stop recording' }).click();
    await pageCapture.getByRole('status').getByText('Stopping recording.').waitFor();
    ensure(await pageCapture.getByRole('button', { name: 'Record voice' }).count() === 0, 'A second recording control remained available while stopping.');
    ensure(await pageCapture.getByRole('button',{name:'Continue to translation'}).isDisabled(), 'The story advanced while its recording was still stopping.');
    ensure(await pageCapture.getByLabel(/Or choose an audio file/).isDisabled(), 'Upload remained enabled while stopping.');
    await captureWidths(pageCapture, 'record-stopping');
    await pageCapture.getByRole('alert').getByText('No audio was captured').waitFor();
    await pageCapture.getByRole('status').getByText('Ready to record.').waitFor();
    ensure(await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').count() === 0, 'An empty recording was shown as captured audio.');
    await captureWidths(pageCapture, 'record-empty-audio');

    await pageCapture.evaluate(() => { window.__failedNextRecording = true; });
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('alert').getByText(/microphone could not be started/).waitFor();
    await pageCapture.getByRole('status').getByText('Ready to record.').waitFor();
    ensure(await pageCapture.evaluate(() => window.__lastMicStream?.getTracks().every(track => track.readyState === 'ended')), 'Microphone tracks remained live after recording failure.');
    await captureWidths(pageCapture, 'record-failed-microphone');
    captureLifecycleReady = true;
  }, capturePreviewReady);

  await record('Unsupported recording capability has a specific usable error', async () => {
    await pageUnsupported.locator('nav.bottom-nav').getByRole('button', { name: 'Share a story', exact: true }).click();
    await pageUnsupported.getByRole('heading', { name: 'Share a story' }).waitFor();
    await pageUnsupported.getByLabel('Language told in').fill('Synthetic recording language'); await pageUnsupported.getByRole('button',{name:'Continue to your story'}).click();
    await pageUnsupported.getByRole('button', { name: 'Record voice' }).click();
    await pageUnsupported.getByRole('alert').getByText(/Voice recording is not supported in this browser/).waitFor();
    ensure(await pageUnsupported.getByLabel(/Or choose an audio file/).isEnabled(), 'Fallback file upload is unavailable when recording is unsupported.');
    await captureWidths(pageUnsupported, 'record-unsupported');
  }, captureReady);

  await record('Client rejects invalid and oversized audio selections without replacing a capture', async () => {
    const invalidPath = path.join(fixtureDir, 'not-audio.txt');
    fs.writeFileSync(invalidPath, 'not an audio file');
    const input = pageUnsupported.getByLabel(/Or choose an audio file/);
    await input.setInputFiles(fixturePath);
    const originalPreview = pageUnsupported.locator('audio[aria-label="Preview of unsaved audio"]');
    await originalPreview.waitFor({ state: 'visible' });
    const originalUrl = await originalPreview.getAttribute('src');
    await pageUnsupported.getByText('Duration: 0:03', { exact: true }).waitFor();
    await input.setInputFiles(invalidPath);
    await pageUnsupported.getByRole('alert').getByText(/Choose a file with an audio media type/).waitFor();
    ensure(await originalPreview.getAttribute('src') === originalUrl, 'Invalid file selection replaced the existing unsaved audio.');
    await captureWidths(pageUnsupported, 'record-invalid-file');

    await input.setInputFiles([{ name: 'oversized.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }]);
    await pageUnsupported.getByRole('alert').getByText(/Audio files must be 10 MB or smaller/).waitFor();
    ensure(await originalPreview.getAttribute('src') === originalUrl, 'Oversized file selection replaced the existing unsaved audio.');
    await captureWidths(pageUnsupported, 'record-oversized-file');
  }, captureReady);

  await record('Navigation warning, active-recording cleanup, save failure retention, and save retry', async () => {
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('status').getByText('Recording.').waitFor();
    const dismissed = await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Listen', exact: true }), false);
    ensure(dismissed.includes('in progress') && dismissed.includes('stop and discard'), 'Navigation warning did not explain active recording discard.');
    ensure(await pageCapture.getByRole('heading', { name: 'Share a story' }).isVisible(), 'Canceling navigation left the story form.');
    const accepted = await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Listen', exact: true }), true);
    ensure(accepted.includes('stop and discard'), 'Active-recording navigation warning was not shown.');
    await pageCapture.getByRole('heading', { name: 'Listen' }).waitFor();
    ensure(await pageCapture.evaluate(() => window.__lastMicStream?.getTracks().every(track => track.readyState === 'ended')), 'Microphone tracks remained live after navigation cleanup.');

    await pageCapture.locator('nav.bottom-nav').getByRole('button', { name: 'Share a story', exact: true }).click();
    await pageCapture.getByLabel('Language told in').fill('Synthetic recording language');
    await pageCapture.getByRole('button',{name:'Continue to your story'}).click();
    await pageCapture.getByLabel('Post title').fill('Synthetic audio post');
    await pageCapture.getByLabel('Your story').fill('Synthetic fake-microphone capture for save retry coverage.');
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('status').getByText('Recording.').waitFor();
    await pageCapture.waitForTimeout(1100);
    await pageCapture.getByRole('button', { name: 'Stop recording' }).click();
    await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').waitFor();
    await captureWidths(pageCapture, 'record-before-save');

    await pageCapture.route('**/api/stories', async route => {
      if (route.request().method() === 'POST') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic save failure' }) });
      else await route.continue();
    });
    await pageCapture.getByRole('button', { name: 'Continue to translation' }).click(); await pageCapture.getByRole('button', { name: 'Continue to review' }).click();
    await pageCapture.getByLabel('This is mine, or I have permission from the person telling it.').check();
    const retainedUrl = await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').getAttribute('src');
    await pageCapture.getByRole('button', { name: 'Save draft and open review' }).click();
    await pageCapture.getByRole('alert').getByText('Synthetic save failure').waitFor();
    ensure(await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').isVisible(), 'Save failure changed the capture status to saved or removed it.');
    ensure(await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').getAttribute('src') === retainedUrl, 'Save failure removed the captured audio.');
    ensure(await pageCapture.getByRole('button', { name: 'Save draft and open review' }).isEnabled(), 'Retry save action is disabled after a failed response.');
    ensure(await pageCapture.getByText('Saved with your story.', { exact: true }).count() === 0, 'App reported success before the server confirmed save.');
    const unsavedNavigation = await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Listen', exact: true }), false);
    ensure(unsavedNavigation.includes('unsaved audio') && unsavedNavigation.includes('discard it'), 'Navigation away from a captured unsaved recording did not warn about discard.');
    ensure(await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').getAttribute('src') === retainedUrl, 'Canceling unsaved-audio navigation did not keep the preview.');
    const unloadWarning = await pageCapture.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      const permitted = window.dispatchEvent(event);
      return { canceled: !permitted || event.defaultPrevented, returnValue: event.returnValue };
    });
    ensure(unloadWarning.canceled, 'The beforeunload handler did not request a browser warning for unsaved audio.');
    await captureWidths(pageCapture, 'record-save-failed');
    await pageCapture.unroute('**/api/stories');

    await pageCapture.getByRole('button', { name: 'Save draft and open review' }).click();
    await pageCapture.getByRole('heading', { name: 'Review your story' }).waitFor();
    await pageCapture.getByRole('status').getByText('Saved with your story.').waitFor();
    const mine = await direct(ownerCapture, '/api/mine');
    const saved = mine.body.find(story => story.originalLanguage === 'Synthetic recording language');
    ensure(saved?.audio === true && saved.status === 'draft', 'Successful retry did not save the recording with its draft.');
    captureSavedStoryId = saved.id;
    const privateAudio = await direct(ownerCapture, `/api/stories/${saved.id}/audio`);
    ensure(privateAudio.status === 200 && /^audio\/[a-z0-9.+-]+$/i.test(privateAudio.contentType), `Saved recording audio response had an unsupported type (${privateAudio.contentType}).`);
    ensure(!(await direct(ownerB, '/api/stories')).body.some(story => story.id === saved.id), 'Unrelated visitor listed the private recording draft.');
    ensure((await direct(ownerB, `/api/stories/${saved.id}/audio`)).status === 404, 'Unrelated visitor fetched private recording audio.');
    ensure(await pageCapture.getByRole('button', { name: /Record voice|Retake recording|Remove recording/ }).count() === 0, 'Saved audio unexpectedly exposes recording replacement or removal controls.');
    await captureWidths(pageCapture, 'record-saved-with-story');
  }, captureLifecycleReady);

  await record('Listen, Share, and My stories render at 1280px and 375px', async () => {
    await pageA.locator('nav.bottom-nav').getByRole('button', { name: 'Share a story', exact: true }).click(); await pageA.getByRole('heading', { name: 'Share a story' }).waitFor();
    await pageA.getByLabel('Language told in').fill('Synthetic display language'); await pageA.getByRole('button',{name:'Continue to your story'}).click();
    ensure(await pageA.getByRole('button', { name: 'Record voice' }).isVisible(), 'Record voice control is missing.');
    ensure((await pageA.getByLabel(/Or choose an audio file/).getAttribute('accept'))?.includes('audio/'), 'Audio file upload control is missing.');
    for (const width of [1280, 375]) {
      const shot = await captureScreen(pageA, 'share', width); results.push({ name: `Share screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
    }
    await confirmAction(pageA,pageA.getByRole('button', { name: 'My stories', exact: true }),true); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    for (const width of [1280, 375]) {
      const shot = await captureScreen(pageA, 'my-stories-empty', width); results.push({ name: `My stories screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
    }
    await pageA.getByRole('button', { name: 'Listen', exact: true }).click(); await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
  }, browserReady);

  await record('AI translation draft requires approval and editing clears it before save', async () => {
    await pageA.locator('nav.bottom-nav').getByRole('button', { name: 'Share a story', exact: true }).click();
    await pageA.getByLabel('Language told in').fill('Synthetic original language');
    await pageA.getByRole('button', { name: 'Continue to your story' }).click();
    await pageA.getByLabel('Post title').fill('Synthetic AI translation post');
    await pageA.getByLabel('Your story').fill('Synthetic original story for the translation draft.');
    await pageA.getByRole('button', { name: 'Continue to translation' }).click();
    await pageA.getByLabel('Translation language (optional)').fill('Synthetic target language');
    const before = (await direct(ownerA, '/api/mine')).body.length;
    let mockedCalls = 0;
    await pageA.route('**/api/translation-draft', async route => {
      const body = route.request().postDataJSON();
      ensure(body.text === 'Synthetic original story for the translation draft.' && body.targetLanguage === 'Synthetic target language', 'AI draft request omitted or changed storyteller input.');
      ensure(!JSON.stringify(body).includes('OPENAI_API_KEY'), 'Browser request included a server credential name.');
      mockedCalls++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ translation: 'Synthetic mocked AI translation.', origin: 'ai_draft_unapproved' }) });
    });
    await pageA.getByRole('button', { name: 'Draft with AI' }).click();
    await pageA.getByText('AI draft: not yet approved by you').waitFor();
    ensure(await pageA.getByRole('button', { name: 'Continue to review' }).isDisabled(), 'Unapproved AI translation could continue to review.');
    await pageA.getByRole('button', { name: 'Approve translation' }).click();
    await pageA.getByText('AI draft: approved by you').waitFor();
    ensure(await pageA.getByRole('button', { name: 'Continue to review' }).isEnabled(), 'Explicit approval did not enable the review step.');
    await pageA.getByLabel('Your translation or AI draft').fill('Storyteller edited mock translation.');
    await pageA.getByText('AI draft: not yet approved by you').waitFor();
    ensure(await pageA.getByRole('button', { name: 'Continue to review' }).isDisabled(), 'Editing the AI draft retained approval.');
    await pageA.getByRole('button', { name: 'Approve translation' }).click();
    await confirmAction(pageA, pageA.getByRole('button', { name: 'Listen', exact: true }), true);
    await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageA.unroute('**/api/translation-draft');
    ensure(mockedCalls === 1, `Expected one mocked AI request, observed ${mockedCalls}.`);
    ensure((await direct(ownerA, '/api/mine')).body.length === before, 'Requesting and approving an AI draft saved the story before the explicit save action.');
  }, browserReady);

  await record('Empty required language input is blocked in UI and rejected by API', async () => {
    await pageA.locator('nav.bottom-nav').getByRole('button', { name: 'Share a story', exact: true }).click();
    const input = pageA.getByLabel('Language told in');
    ensure(await input.evaluate(el => el.required && el.validity.valueMissing), 'Empty language is not marked required.');
    const fd = new FormData(); fd.append('originalLanguage', ''); fd.append('text', '');
    const r = await direct(ownerA, '/api/stories', 'POST', fd); ensure(r.status === 400, 'API accepted empty language.');
  }, browserReady);

  await record('Create a draft as A with hidden name, manual translation, script-like text, and synthetic audio', async () => {
    const text = "Synthetic test story.\n<script>window.__storyBridgeInjected=true</script>\nLiteral text remains text.";
    await pageA.getByLabel('Language told in').fill('Test language');
    await pageA.getByRole('button',{name:'Continue to your story'}).click();
    await pageA.getByLabel('Post title').fill('Synthetic browser story');
    await pageA.getByLabel('Your story').fill(text);
    await pageA.getByLabel(/Or choose an audio file/).setInputFiles(fixturePath);
    await pageA.getByRole('button',{name:'Continue to translation'}).click();
    await pageA.getByLabel('Translation language (optional)').fill('Second test language');
    await pageA.getByLabel('Your translation or AI draft').fill('Manual test translation.');
    await pageA.getByRole('button',{name:'Continue to review'}).click();
    await pageA.getByLabel('This is mine, or I have permission from the person telling it.').check();
    await pageA.getByLabel('Your name (optional)').fill('Synthetic Hidden Author');
    ensure(!(await pageA.getByLabel('Show my name on this story').isChecked()), 'Show-name default should be off.');
    const createResponsePromise = pageA.waitForResponse(response => response.url() === `${webOrigin}/api/stories` && response.request().method() === 'POST');
    await pageA.getByRole('button', { name: 'Save draft and open review' }).click();
    const createResponse = await createResponsePromise;
    ensure(createResponse.status() === 201, `Draft creation returned HTTP ${createResponse.status()}.`);
    await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
    const mine = await direct(ownerA, '/api/mine'); storyId = mine.body?.[0]?.id || '';
    ensure(storyId && mine.status === 200, 'Draft was not saved for A.');
    const own = await direct(ownerA, `/api/stories/${storyId}`);
    ensure(own.status === 200 && own.body.status === 'draft', 'A could not read the new draft.');
    ensure(own.body.text.replace(/\r\n/g, '\n') === text && own.body.translation === 'Manual test translation.', 'Original text or translation did not persist.');
    ensure(own.body.audio === true && own.body.translationChecked === false, 'Draft audio or unchecked state missing.');
    ensure(await pageA.evaluate(() => window.__storyBridgeInjected === undefined), 'Script-like story content executed.');
    ensure((await pageA.getByLabel('Original text').inputValue()).includes('<script>'), 'Original text is not shown as literal text.');
    await pageA.waitForFunction(() => { const a=document.querySelector('audio'); return !!a && a.src.startsWith('blob:'); });
    const audioSrc = await pageA.locator('audio').getAttribute('src');
    ensure(audioSrc?.startsWith('blob:') && !audioSrc.includes(ownerA), 'Private audio did not use a token-free object URL.');
  }, browserReady);

  const haveStory = !!storyId;
  await record('B cannot list or directly read A draft; A can reopen and edit it', async () => {
    const list = await direct(ownerB, '/api/stories'); ensure(list.status === 200 && !list.body.some(s => s.id === storyId), 'Draft appeared in public list.');
    ensure((await direct(ownerB, `/api/stories/${storyId}`)).status === 404, 'B read a draft.');
    ensure((await direct(ownerB, `/api/stories/${storyId}/audio`)).status === 404, 'B read draft audio.');
    let audioAttempts=0;
    await pageA.route(`**/api/stories/${storyId}/audio`,route=>{audioAttempts++;return audioAttempts===1?route.fulfill({status:503,contentType:'application/json',body:'{}'}):route.continue();});
    await pageA.getByRole('button', { name: 'Save as draft' }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    await pageA.getByRole('button', { name: 'Review', exact: true }).click(); await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
    await pageA.getByRole('alert').getByText('Recording could not be loaded.').waitFor();
    await pageA.getByRole('alert').getByRole('button',{name:'Retry recording'}).click();
    await pageA.waitForFunction(()=>{const audio=document.querySelector('.audio-player audio');return audio?.readyState>=3;});
    ensure(audioAttempts===2,'Private audio retry did not issue a second authenticated request.');
    pass('Audio: private fetch failure is visible and retry succeeds through owner route');
    await pageA.unroute(`**/api/stories/${storyId}/audio`);
    await pageA.getByRole('button', { name: 'My stories', exact: true }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    for (const width of [1280, 375]) { const shot = await captureScreen(pageA, 'my-stories-draft', width); results.push({ name: `My stories with draft screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) }); }
    await pageA.getByRole('button', { name: 'Review', exact: true }).click(); await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
    const original = 'Synthetic test story edited by owner A.';
    await pageA.getByLabel('Original text').fill(original);
    const savedOriginal = pageA.waitForResponse(r => r.url() === `${webOrigin}/api/stories/${storyId}` && r.request().method() === 'PUT' && r.status() === 200);
    await pageA.getByRole('button', { name: 'Save original edit' }).click(); await savedOriginal;
    ensure((await direct(ownerA, `/api/stories/${storyId}`)).body.text === original, 'A original edit did not persist.');
  }, haveStory);

  await record('A review labels are honest and checked translation edits invalidate old status', async () => {
    await pageA.getByText('Not yet checked by a speaker of this language').waitFor({ state: 'visible' });
    await pageA.getByLabel('Speaker name').fill('Synthetic Reviewer'); await pageA.getByRole('button', { name: 'Mark as checked' }).click();
    await pageA.getByText('Checked by Synthetic Reviewer (self-reported)').waitFor({ state: 'visible' });
    await captureWidths(pageA, 'review-checked-self-reported');
    await pageA.getByLabel('Translation entered by you').fill('Edited manual test translation.');
    const savedTranslation = pageA.waitForResponse(r => r.url() === `${webOrigin}/api/stories/${storyId}` && r.request().method() === 'PUT' && r.status() === 200);
    await pageA.getByRole('button', { name: 'Save translation edit' }).click(); await savedTranslation;
    const own = await direct(ownerA, `/api/stories/${storyId}`);
    ensure(own.body.translation === 'Edited manual test translation.' && own.body.translationChecked === false && !own.body.checkedBy, 'Editing translation did not clear its prior checked label.');
    await pageA.getByText('Not yet checked by a speaker of this language').waitFor({ state: 'visible' });
    await pageA.getByLabel('Speaker name').fill('Synthetic Reviewer');
    const markedChecked = pageA.waitForResponse(r => r.url() === `${webOrigin}/api/stories/${storyId}` && r.request().method() === 'PUT' && r.status() === 200);
    await pageA.getByRole('button', { name: 'Mark as checked' }).click(); await markedChecked;
    ensure((await direct(ownerA, `/api/stories/${storyId}`)).body.translationChecked === true, 'Owner could not mark translation checked.');
  }, haveStory);

  await record('Save as draft persists unsaved original and translation edits', async () => {
    await pageA.getByLabel('Original text').fill(draftActionText);
    await pageA.getByLabel('Translation entered by you').fill(draftActionTranslation);
    await pageA.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    const saved = await direct(ownerA, `/api/stories/${storyId}`);
    ensure(saved.status === 200 && saved.body.status === 'draft' && saved.body.text === draftActionText && saved.body.translation === draftActionTranslation, 'Save as draft did not persist both pending review edits.');
    ensure(saved.body.translationChecked === false, 'Editing the translation did not clear its checked label.');
    await pageA.locator('.mine-card').filter({ hasText: 'Draft' }).getByRole('button', { name: 'Review', exact: true }).click();
    await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
    ensure(await pageA.getByLabel('Original text').inputValue() === draftActionText && await pageA.getByLabel('Translation entered by you').inputValue() === draftActionTranslation, 'Reopened draft did not show the saved edits.');
  }, haveStory);

  await record('Approve saves unsaved edits; failed save stays private and retry publishes the shown version', async () => {
    const before = await direct(ownerA, `/api/stories/${storyId}`);
    ensure(before.body.status === 'draft' && before.body.text === draftActionText && before.body.translation === draftActionTranslation, 'Draft baseline was not available for the approval check.');
    await pageA.getByLabel('Original text').fill(approvedActionText);
    await pageA.getByLabel('Translation entered by you').fill(approvedActionTranslation);
    await pageA.getByRole('radio', { name: 'Anyone who opens this app' }).check();
    const routePattern = `**/api/stories/${storyId}`;
    let failOnce = true;
    await pageA.route(routePattern, async route => {
      if (failOnce && route.request().method() === 'PUT') {
        failOnce = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic review-save failure.' }) });
      } else await route.continue();
    });
    try {
      await pageA.getByRole('button', { name: 'Approve and share', exact: true }).click();
      await pageA.getByRole('alert').getByText('Synthetic review-save failure.').waitFor({ state: 'visible' });
      await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
      const unchanged = await direct(ownerA, `/api/stories/${storyId}`);
      ensure(unchanged.body.status === 'draft' && unchanged.body.visibility === 'private' && unchanged.body.text === draftActionText && unchanged.body.translation === draftActionTranslation, 'A failed save approved or partially changed the draft.');
    } finally {
      await pageA.unroute(routePattern);
    }
    const approvalResponse = pageA.waitForResponse(response => response.url() === `${webOrigin}/api/stories/${storyId}` && response.request().method() === 'PUT' && response.status() === 200);
    await pageA.getByRole('button', { name: 'Approve and share', exact: true }).click();
    await approvalResponse;
    await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    const ownerView = await direct(ownerA, `/api/stories/${storyId}`);
    ensure(ownerView.body.status === 'shared' && ownerView.body.visibility === 'public' && ownerView.body.text === approvedActionText && ownerView.body.translation === approvedActionTranslation && ownerView.body.translationChecked === false, 'Approval did not persist exactly the edited public version.');
    const visitorView = await direct(ownerB, `/api/stories/${storyId}`);
    ensure(visitorView.status === 200 && visitorView.body.text === approvedActionText && visitorView.body.translation === approvedActionTranslation, 'B API response did not contain the exact approved edits.');
    await pageB.reload();
    await pageB.getByRole('heading', { name: 'Listen' }).waitFor();
    const publicCard = pageB.locator('.post').filter({ hasText: approvedActionText });
    await publicCard.waitFor({ state: 'visible' });
    await pageB.getByText(approvedActionText, { exact: true }).waitFor({ state: 'visible' });
    await publicCard.getByRole('button', { name: /Translation/ }).click();
    await publicCard.locator('.post-translation').getByText(approvedActionTranslation, { exact: true }).waitFor({ state: 'visible' });
    await publicCard.getByRole('button', { name: /Original/ }).waitFor({ state: 'visible' });
  }, haveStory);

  await record('Only me approval remains private and B direct mutations are forbidden', async () => {
    await pageA.locator('.mine-card').filter({ hasText: 'Public' }).getByRole('button', { name: 'Review', exact: true }).click();
    await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
    await pageA.getByLabel('Only me').check();
    ensure(await pageA.getByRole('button', { name: 'Approve for only me', exact: true }).isVisible(), 'Private approval is not labeled as private.');
    await pageA.getByRole('button', { name: 'Approve for only me', exact: true }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    const ownerStory = await direct(ownerA, `/api/stories/${storyId}`); ensure(ownerStory.status === 200 && ownerStory.body.visibility === 'private', 'Only me approval was not private.');
    for (const [method, body, label] of [['GET', undefined, 'story read'], ['PUT', { text: 'unauthorized' }, 'edit'], ['PUT', { checkTranslation: true, checkedBy: 'B' }, 'translation check'], ['PUT', { visibility: 'public', approve: true }, 'publish'], ['PUT', { withdraw: true }, 'withdraw']]) {
      const r = method === 'GET' ? await direct(ownerB, `/api/stories/${storyId}`) : await direct(ownerB, `/api/stories/${storyId}`, 'PUT', body);
      const expected = method === 'GET' ? 404 : 403; ensure(r.status === expected, `B could ${label} (HTTP ${r.status}).`);
    }
    ensure((await direct(ownerB, `/api/stories/${storyId}/audio`)).status === 404, 'B read private audio.');
  }, haveStory);

  await record('Valid WAV upload, owner/private/public audio authorization, and playback attempt', async () => {
    await pageA.getByRole('button', { name: 'Review', exact: true }).click(); await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
    const ownerAudio = await direct(ownerA, `/api/stories/${storyId}/audio`); ensure(ownerAudio.status === 200, `Owner audio endpoint failed (HTTP ${ownerAudio.status}; ${ownerAudio.body?.error || 'no error detail'}).`);
    ensure((await direct(ownerB, `/api/stories/${storyId}/audio`)).status === 404, 'B accessed private audio.');
    await pageA.waitForFunction(() => document.querySelector('audio')?.src.startsWith('blob:'));
    const encodedFixture = fs.readFileSync(fixturePath).toString('base64');
    const playback = await pageA.locator('audio').evaluate(async (audio, encoded) => {
      if (!audio.canPlayType('audio/wav')) return { supported: false, reason: 'Browser reports WAV unsupported.' };
      let decoded=false, decodeError='';
      try { const context=new AudioContext();const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));await context.decodeAudioData(bytes.buffer);decoded=true;await context.close(); } catch(e) { decodeError=e?.name||'decode failed'; }
      try { audio.load(); await new Promise(resolve => { if (audio.readyState >= 1 || audio.error) return resolve(); audio.addEventListener('loadedmetadata', resolve, { once:true }); audio.addEventListener('error', resolve, { once:true }); setTimeout(resolve, 3000); }); const metadata={duration:Number.isFinite(audio.duration)?audio.duration:null,error:audio.error?.code||null,readyState:audio.readyState}; audio.muted=true; await audio.play(); const progressDeadline=performance.now()+2000; while(audio.currentTime<=0&&!audio.ended&&!audio.error&&performance.now()<progressDeadline) await new Promise(resolve=>setTimeout(resolve,25)); const progressed = audio.currentTime > 0; audio.pause(); return { supported: true, progressed, metadata, decoded, decodeError }; }
      catch (e) { return { supported: true, reason: e?.name || 'play failed', metadata:{duration:Number.isFinite(audio.duration)?audio.duration:null,error:audio.error?.code||null,readyState:audio.readyState}, decoded, decodeError }; }
    }, encodedFixture);
    const playbackResult = !playback.supported || !playback.progressed
      ? { name:'Synthetic audio playback', status:'NOT TESTED', detail:`Browser playback did not advance (${playback.reason || 'no progress'}); media=${JSON.stringify(playback.metadata||{})}, decode=${playback.decoded?'PASS':playback.decodeError||'not available'}.` }
      : { name:'Synthetic audio playback', status:'PASS', detail:'Chromium decoded the synthetic WAV fixture and advanced the blob-backed media timeline; audible output was not independently assessed.' };
    results.push(playbackResult); process.stdout.write(`${playbackResult.status} ${playbackResult.name} — ${playbackResult.detail}\n`);
  }, haveStory);

  await record('Excessive text and invalid or oversized audio are rejected', async () => {
    let fd = new FormData(); for(const [key,value] of Object.entries({title:'Oversize synthetic post',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true'}))fd.append(key,value); fd.append('originalLanguage', 'Test language'); fd.append('text', 'x'.repeat(12001));
    ensure((await direct(ownerA, '/api/stories', 'POST', fd)).status === 413, 'API accepted excessive story text.');
    fd = new FormData(); for(const [key,value] of Object.entries({title:'Bad media post',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true'}))fd.append(key,value); fd.append('originalLanguage', 'Test language'); fd.append('audio', new Blob(['not audio'], { type: 'text/plain' }), 'bad.txt');
    ensure((await direct(ownerA, '/api/stories', 'POST', fd)).status === 400, 'API accepted non-audio MIME type.');
    fd = new FormData(); for(const [key,value] of Object.entries({title:'Oversize audio post',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true'}))fd.append(key,value); fd.append('originalLanguage', 'Test language'); fd.append('audio', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/wav' }), 'oversize.wav');
    ensure((await direct(ownerA, '/api/stories', 'POST', fd)).status === 413, 'API accepted audio over 10 MB.');
  }, haveStory);

  await record('Public approval is visible to B and hidden author is absent from API and UI', async () => {
    await pageA.getByRole('radio', { name: 'Anyone who opens this app' }).check();
    await pageA.getByRole('button', { name: 'Approve and share' }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    const publicOwner = await direct(ownerA, `/api/stories/${storyId}`); ensure(publicOwner.body.status === 'shared' && publicOwner.body.visibility === 'public', 'Public approval did not apply.');
    ensure((await direct(ownerA, `/api/stories/${storyId}/audio`)).status === 200, 'Owner could not read public audio.');
    const bList = await direct(ownerB, '/api/stories'); ensure(bList.body.some(s => s.id === storyId), 'Public story absent from B list.');
    await pageB.reload(); await pageB.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageB.locator('.post').filter({hasText:approvedActionText}).getByRole('button',{name:/Read/}).click(); await pageB.getByRole('heading', { name: 'Synthetic browser story' }).waitFor();
    ensure(!(await pageB.getByText('Synthetic Hidden Author', { exact: false }).count()), 'Hidden author name appeared in public UI.');
    ensure(await pageB.getByText(approvedActionText, { exact: true }).isVisible(), 'Original text is not visible.');
    ensure(await pageB.getByText('Written by the storyteller').isVisible(), 'Storyteller translation attribution missing.');
    await pageB.getByText('Not yet checked by a speaker of this language').waitFor({state:'visible'});
    const publicResponse = await direct(ownerB, `/api/stories/${storyId}`);
    ensure(publicResponse.body.text === approvedActionText && publicResponse.body.translation === approvedActionTranslation && publicResponse.body.translationChecked === false, 'Public response did not contain the edited and honestly labeled version.');
    ensure(!Object.hasOwn(publicResponse.body, 'storytellerName') && !publicResponse.text.includes('Synthetic Hidden Author'), 'Hidden author included in non-owner API response.');
    const publicAudio = await direct(ownerB, `/api/stories/${storyId}/audio`); ensure(publicAudio.status === 200, 'B public audio access failed.');
    await pageA.getByRole('button', { name: 'Listen', exact: true }).click(); await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageA.getByText(approvedActionText, { exact: true }).waitFor({state:'visible'});
    for (const width of [1280, 375]) { const shot = await captureScreen(pageA, 'listen-public', width); results.push({ name: `Listen screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) }); }
  }, haveStory && results.find(x => x.name === 'Valid WAV upload, owner/private/public audio authorization, and playback attempt')?.status === 'PASS');

  await record('Withdrawal confirmation, withdrawn label, private/public re-approval wording, and public restoration', async () => {
    await pageA.getByRole('button', { name: 'My stories', exact: true }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    const publicStoryCard = pageA.locator('.mine-card').filter({ hasText: 'Public' });
    await publicStoryCard.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await pageA.getByRole('group', { name: 'Confirm withdrawal' }).waitFor({ state: 'visible' });
    const confirmationText = await pageA.getByRole('group', { name: 'Confirm withdrawal' }).innerText();
    ensure(confirmationText.includes('remain in My stories') && confirmationText.includes('downloaded copies are not deleted'), 'Withdrawal confirmation omitted its consequences.');
    for (const width of [1280, 375]) {
      const shot = await captureScreen(pageA, 'withdraw-confirm', width);
      results.push({ name: `Withdraw confirmation screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
    }
    await pageA.getByRole('button', { name: 'Keep story', exact: true }).click();
    const afterCancel = await direct(ownerA, `/api/stories/${storyId}`);
    ensure(afterCancel.body.status === 'shared' && afterCancel.body.visibility === 'public', 'Canceling withdrawal changed the story unexpectedly.');
    ensure((await direct(ownerB, `/api/stories/${storyId}`)).status === 200, 'Canceling withdrawal removed public access.');
    await pageA.locator('.mine-card').filter({ hasText: 'Public' }).getByRole('button', { name: 'Withdraw', exact: true }).click();
    await pageA.getByRole('button', { name: 'Withdraw story', exact: true }).click();
    await pageA.locator('.mine-card').filter({ hasText: 'Withdrawn' }).waitFor({ state: 'visible' });
    const withdrawnCard = pageA.locator('.mine-card').filter({ hasText: 'Withdrawn' });
    await withdrawnCard.waitFor({ state: 'visible' });
    ensure(!(await withdrawnCard.getByRole('button', { name: 'Withdraw', exact: true }).count()), 'Withdrawn story still offers another withdrawal action.');
    const list = await direct(ownerB, '/api/stories'); ensure(!list.body.some(s => s.id === storyId), 'Withdrawn story remains in B list.');
    ensure((await direct(ownerB, `/api/stories/${storyId}`)).status === 404, 'B read withdrawn story.');
    ensure((await direct(ownerB, `/api/stories/${storyId}/audio`)).status === 404, 'B read withdrawn audio.');
    await withdrawnCard.getByRole('button', { name: 'Review', exact: true }).click();
    await pageA.getByRole('heading', { name: 'Review your story' }).waitFor();
    ensure(await pageA.getByText('This approval will keep the story private to you.').isVisible(), 'Private re-approval wording was incorrect.');
    ensure(await pageA.getByRole('button', { name: 'Approve for only me', exact: true }).isVisible(), 'Private re-approval label implied public sharing.');
    await pageA.getByRole('radio', { name: 'Anyone who opens this app' }).check();
    ensure(await pageA.getByText('This story will become public again.').isVisible(), 'Public re-approval wording was missing.');
    ensure(await pageA.getByRole('button', { name: 'Publish again', exact: true }).isVisible(), 'Public re-approval did not use the Publish again label.');
    for (const width of [1280, 375]) {
      const shot = await captureScreen(pageA, 'republish-review', width);
      results.push({ name: `Publish again review screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
      const main = pageA.locator('main');
      await main.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await pageA.waitForTimeout(50);
      const actionMetrics = await pageA.getByRole('button', { name: 'Publish again', exact: true }).evaluate(element => {
        const button = element.getBoundingClientRect();
        const header = document.querySelector('header').getBoundingClientRect();
        const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
        return { top: button.top, bottom: button.bottom, headerBottom: header.bottom, navTop: nav.top, text: element.innerText };
      });
      ensure(actionMetrics.top >= actionMetrics.headerBottom - 1 && actionMetrics.bottom <= actionMetrics.navTop + 1, `Publish again button is clipped at ${width}px: ${JSON.stringify(actionMetrics)}.`);
      const actionEvidence = path.join(evidenceDir, `republish-action-${width}.png`);
      await pageA.screenshot({ path: actionEvidence, animations: 'disabled' });
      results.push({ name: `Publish again action screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, actionEvidence), detail: JSON.stringify(actionMetrics) });
      await main.evaluate(element => { element.scrollTop = 0; });
    }
    await pageA.getByRole('button', { name: 'Publish again', exact: true }).click();
    await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    const restored = await direct(ownerB, `/api/stories/${storyId}`);
    ensure(restored.status === 200 && restored.body.visibility === 'public' && restored.body.text === approvedActionText, 'Public re-approval did not restore the edited story for B.');
    await pageA.locator('.mine-card').filter({ hasText: 'Public' }).getByRole('button', { name: 'Withdraw', exact: true }).click();
    const secondWithdrawal = pageA.waitForResponse(response => response.url() === `${webOrigin}/api/stories/${storyId}` && response.request().method() === 'PUT' && response.status() === 200);
    await pageA.getByRole('button', { name: 'Withdraw story', exact: true }).click();
    const withdrawalResponse = await secondWithdrawal;
    const withdrawalBody = await withdrawalResponse.json();
    ensure(withdrawalBody.status === 'withdrawn' && withdrawalBody.visibility === 'private', `Second withdrawal response state was ${withdrawalBody.status}/${withdrawalBody.visibility}.`);
    await pageA.locator('.mine-card').filter({ hasText: 'Withdrawn' }).waitFor({ state: 'visible' });
    const ownerAfterSecondWithdrawal = await direct(ownerA, `/api/stories/${storyId}`);
    const visitorStoryAfterSecondWithdrawal = await direct(ownerB, `/api/stories/${storyId}`);
    const visitorAudioAfterSecondWithdrawal = await direct(ownerB, `/api/stories/${storyId}/audio`);
    ensure(ownerAfterSecondWithdrawal.body?.status === 'withdrawn' && ownerAfterSecondWithdrawal.body?.visibility === 'private', `Persisted owner state after second withdrawal was ${ownerAfterSecondWithdrawal.body?.status}/${ownerAfterSecondWithdrawal.body?.visibility} (HTTP ${ownerAfterSecondWithdrawal.status}).`);
    ensure(visitorStoryAfterSecondWithdrawal.status === 404 && visitorAudioAfterSecondWithdrawal.status === 404, `Second withdrawal access statuses were story=${visitorStoryAfterSecondWithdrawal.status}, audio=${visitorAudioAfterSecondWithdrawal.status}.`);
  }, haveStory && results.find(x => x.name === 'Public approval is visible to B and hidden author is absent from API and UI')?.status === 'PASS');

  await record('Reload and isolated API restart preserve test data', async () => {
    await stop(apiServer); await stop(webServer); await startApi(); await startWeb();
    await pageA.reload(); await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
    ensure((await pageA.evaluate(() => localStorage.getItem('story-bridge-owner'))) === ownerA, 'A owner token did not survive page reload.');
    const mine = await direct(ownerA, '/api/mine'); const persisted = mine.body.find(s => s.id === storyId);
    ensure(persisted && persisted.status === 'withdrawn' && persisted.translation === approvedActionTranslation && persisted.text === approvedActionText, 'Test record did not persist across isolated server restart.');
    ensure(!(await direct(ownerB, '/api/stories')).body.some(s => s.id === storyId), 'Restart exposed withdrawn story.');
  }, haveStory && results.find(x => x.name === 'Withdrawal confirmation, withdrawn label, private/public re-approval wording, and public restoration')?.status === 'PASS');

  await record('Raw owner tokens are absent from responses, URLs, logs, and screenshots', async () => {
    await delay(200);
    const screenshotFiles = fs.readdirSync(evidenceDir).filter(n => n.endsWith('.png')).map(n => fs.readFileSync(path.join(evidenceDir, n)));
    const textSurfaces = [...urls, ...responseBodies, ...consoleMessages, ...serverLogs];
    for (const token of [ownerA, ownerB, ownerCapture, ownerUnsupported]) {
      ensure(!textSurfaces.some(s => s.includes(token)), 'Owner token found in captured URL, response, console, or server log.');
      ensure(!screenshotFiles.some(b => b.includes(Buffer.from(token))), 'Owner token found in screenshot evidence.');
      ensure(!await pageA.locator('body').innerText().then(t => t.includes(token)), 'Owner token appeared in A visible UI.');
      ensure(!await pageB.locator('body').innerText().then(t => t.includes(token)), 'Owner token appeared in B visible UI.');
      ensure(!await pageCapture.locator('body').innerText().then(t => t.includes(token)), 'Owner token appeared in capture UI.');
      ensure(!await pageUnsupported.locator('body').innerText().then(t => t.includes(token)), 'Owner token appeared in unsupported-browser UI.');
    }
  }, browserReady);

  await record('Account screens have 375px and 1280px visual evidence', async () => {
    // A real server in account mode produces the page, its real config and its real Content-Security-Policy.
    // Only the Supabase origin and the signed-in API calls (which need a real key set) are mocked.
    const accountPort = Number(process.env.TEST_ACCOUNT_PORT || await freePort());
    const webOrigin = `http://127.0.0.1:${accountPort}`;
    const testSigningKey = crypto.generateKeyPairSync('rsa', { modulusLength:2048 });
    const testJwk = { ...testSigningKey.publicKey.export({ format:'jwk' }), kid:'browser-local-key', alg:'RS256', use:'sig' };
    jwksServer = http.createServer((_req,res) => { res.writeHead(200, { 'content-type':'application/json' }); res.end(JSON.stringify({ keys:[testJwk] })); });
    await new Promise(resolve => jwksServer.listen(0, '127.0.0.1', resolve));
    const jwksUrl = `http://127.0.0.1:${jwksServer.address().port}/jwks.json`;
    accountServer = child(process.execPath, ['server/static-test-server.js'], { HOST:'127.0.0.1', PORT:String(accountPort), STORY_BACKEND:'file', STORY_AUTH_MODE:'account', STORY_SERVE_STATIC:'1', STORY_NO_LISTEN:'0', STORY_ACCOUNT_DATA_DIR:path.join(isolated,'account-data'), STORY_DATA_DIR:path.join(isolated,'account-stories'), STORY_UPLOAD_DIR:path.join(isolated,'account-uploads'), STORY_BRIDGE_BUILD_DIR:buildDir, STORY_SKIP_DOTENV:'1', STORY_JWKS_URL:jwksUrl, STORY_BRIDGE_OBJECT_ADMIN_ID:'browser-test-user', SUPABASE_URL:'https://story-bridge-test.supabase.co', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake_local_test_key_123456', SUPABASE_SECRET_KEY:'sb_secret_fake_local_test_key_123456', SUPABASE_BUCKET:'story-bridge-audio', STORY_EMAIL_CODE_SIGN_IN:'true', STORY_GOOGLE_SIGN_IN:'true' });
    await waitFor(`${webOrigin}/api/account/config`);
    const supabaseMock = async route => {
      const cors = { 'access-control-allow-origin':webOrigin, 'access-control-allow-headers':'*', 'access-control-allow-methods':'GET,POST,PUT,OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status:204, headers:cors });
      return route.fulfill({ status:200, contentType:'application/json', headers:cors, body:'{}' });
    };
    const accountContext = await browser.newContext({ viewport:{width:375,height:900} });
    await accountContext.route('https://fonts.googleapis.com/**', route => route.fulfill({status:200,contentType:'text/css',body:''}));
    await accountContext.route('https://fonts.gstatic.com/**', route => route.fulfill({status:204,body:''}));
    const accountPage = await accountContext.newPage();
    observePage(accountPage);
    await accountPage.route('**/api/account/profile', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({display_name:''})}));
    await accountPage.route('**/api/account/claim', route => route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'No unclaimed stories matched this browser token.'})}));
    await accountPage.route('**/api/stories', route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await accountPage.route('**/api/mine', route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await accountPage.route('https://story-bridge-test.supabase.co/**', supabaseMock);
    const cspViolations = [];
    accountPage.on('console', message => { if (/Content[- ]Security[- ]Policy/i.test(message.text())) cspViolations.push(message.text().slice(0,120)); });
    const accountResponse = await accountPage.goto(webOrigin, { waitUntil:'domcontentloaded' });
    ensure((await accountResponse.headerValue('content-security-policy')).includes("connect-src 'self' https://story-bridge-test.supabase.co"), 'The server CSP did not allow the configured Supabase origin.');
    await accountPage.getByRole('heading',{name:'Share your culture. Learn from every other.'}).waitFor();
    if(await accountPage.getByRole('button',{name:'Sign in'}).count()===0)await accountPage.getByRole('button',{name:'Menu'}).click();await accountPage.getByRole('button',{name:'Sign in'}).click();
    await accountPage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();
    ensure(await accountPage.getByRole('button',{name:'Continue with Google'}).isVisible(),'Google button was missing when enabled in the account config.');
    await captureEvidence('Account sign-in captures at 375px, 768px, and 1280px', async()=>{ const shots=[]; for(const width of [375,768,1280]) { await accountPage.setViewportSize({width,height:900}); const file=path.join(evidenceDir,`account-sign-in-${width}.png`); await accountPage.screenshot({path:file,fullPage:true}); shots.push({file,metrics:{width}}); } return shots; });
    await accountPage.getByLabel('Email address').fill('reader@example.test');
    await accountPage.getByRole('button',{name:'Email me a code'}).click();
    await accountPage.getByRole('heading',{name:'Check your email'}).waitFor({timeout:5000});
    ensure(await accountPage.getByRole('group',{name:'6-digit sign-in code'}).locator('input').count()===6,'The email code screen did not show the configured number of separate digit fields.');
    ensure(await accountPage.getByRole('button',{name:/Resend code in 30s/}).isDisabled(),'Resend cooldown was not shown immediately after requesting a code.');
    ensure(cspViolations.length === 0, `CSP blocked a request: ${cspViolations.join('; ')}`);
    await captureEvidence('Email code captures at 375px, 768px, and 1280px', async()=>{ const shots=[]; for(const width of [375,768,1280]) { await accountPage.setViewportSize({width,height:900}); const file=path.join(evidenceDir,`account-email-code-${width}.png`); await accountPage.screenshot({path:file,fullPage:true}); shots.push({file,metrics:{width}}); } return shots; });
    await accountPage.close(); await accountContext.close();
    const googleDisabledContext=await browser.newContext({viewport:{width:1280,height:900}});await googleDisabledContext.route('**/api/account/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({account:true,url:'https://story-bridge-test.supabase.co',publishableKey:'sb_publishable_fake_local_test_key_123456',email:true,google:false})}));await googleDisabledContext.route('**/api/stories',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));await googleDisabledContext.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));await googleDisabledContext.route('https://fonts.gstatic.com/**',route=>route.fulfill({status:204,body:''}));const googleDisabledPage=await googleDisabledContext.newPage();observePage(googleDisabledPage);await googleDisabledPage.goto(webOrigin,{waitUntil:'domcontentloaded'});await googleDisabledPage.getByRole('heading',{name:'Share your culture. Learn from every other.'}).waitFor();await googleDisabledPage.getByRole('button',{name:'Sign in'}).click();await googleDisabledPage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();ensure(await googleDisabledPage.getByRole('button',{name:'Continue with Google'}).count()===0,'Google sign-in was visible while disabled in the server config.');pass('Google button stays hidden when disabled by server config');await googleDisabledContext.close();

    const welcomeContext=await browser.newContext({viewport:{width:375,height:900}});
    await welcomeContext.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));await welcomeContext.route('https://fonts.gstatic.com/**',route=>route.fulfill({status:204,body:''}));
    const welcomeToken=signTestToken({sub:'welcome-user',iss:'https://story-bridge-test.supabase.co/auth/v1',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,email:'welcome@example.test'},testSigningKey.privateKey,'browser-local-key');
    await welcomeContext.addInitScript(tokenValue=>localStorage.setItem('sb-story-bridge-test-auth-token',JSON.stringify({access_token:tokenValue,refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:4102444800,user:{id:'welcome-user',aud:'authenticated',email:'welcome@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}})),welcomeToken);
    const welcomePage=await welcomeContext.newPage();observePage(welcomePage);
    await welcomePage.route('**/api/account/claim',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'No unclaimed stories matched this browser token.'})}));
    await welcomePage.route('**/api/stories',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));await welcomePage.route('**/api/mine',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await welcomePage.route('https://story-bridge-test.supabase.co/**',supabaseMock);
    await welcomePage.route('https://story-bridge-test.supabase.co/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'welcome-user',aud:'authenticated',role:'authenticated',email:'welcome@example.test',app_metadata:{provider:'email'},user_metadata:{story_bridge_welcome_completed:true},created_at:'2026-01-01T00:00:00Z',updated_at:new Date().toISOString()})}));
    await welcomePage.goto(webOrigin,{waitUntil:'domcontentloaded'});await welcomePage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();
    await welcomePage.getByLabel('Display name').fill('A New Storyteller');await welcomePage.getByLabel('Country').fill('Kenya');await welcomePage.getByLabel('Languages you speak').fill('Swahili, English');
    await welcomePage.getByLabel(/I accept the/).check();
    await captureEvidence('Welcome profile captures at 375px, 768px, and 1280px',async()=>{const shots=[];for(const width of [375,768,1280]){await welcomePage.setViewportSize({width,height:900});const file=path.join(evidenceDir,`welcome-profile-${width}.png`);await welcomePage.screenshot({path:file,fullPage:true});shots.push({file,metrics:{width}})}return shots});
    await welcomePage.getByRole('button',{name:'Continue'}).click();await welcomePage.getByRole('heading',{name:'Welcome, A New Storyteller'}).waitFor();
    pass('Welcome flow: new account saves name, country, languages, and required consent');
    await welcomeContext.close();

    const profileContext = await browser.newContext({viewport:{width:375,height:900}});
    await profileContext.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
    await profileContext.route('https://fonts.gstatic.com/**',route=>route.fulfill({status:204,body:''}));
    await profileContext.addInitScript(() => localStorage.setItem('sb-story-bridge-test-auth-token',JSON.stringify({access_token:'synthetic-local-session',refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:4102444800,user:{id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',email:'reader@example.test',app_metadata:{provider:'email'},user_metadata:{story_bridge_welcome_completed:true},created_at:'2026-01-01T00:00:00Z'}})));
    const profilePage=await profileContext.newPage();
    observePage(profilePage);
    let profileLoadAttempts=0, profileSaveAttempts=0;
    await profilePage.route('**/api/account/profile', async route => {
      if(route.request().method()==='PUT') {
        profileSaveAttempts++;
        if(profileSaveAttempts===1) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic profile save failure.'})});
        await delay(300);
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({display_name:'Canonical server name'})});
      }
      profileLoadAttempts++;
      return profileLoadAttempts===1
        ? route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic profile load failure.'})})
      : route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({display_name:profileSaveAttempts > 1 ? 'Canonical server name' : ''}),delay:40});
    });
    await profilePage.route('**/api/account/claim', route => route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'No unclaimed stories matched this browser token.'})}));
    let profileStoriesAttempts=0, profileMineAttempts=0, storyRetryStage=0;
    const collectionFixture=[
      {id:'fixture-draft',status:'draft',visibility:'public',originalLanguage:'Akan',text:'Draft fixture',audio:false,createdAt:'2026-11-01T00:00:00Z'},
      {id:'fixture-public',status:'shared',visibility:'public',originalLanguage:'Yoruba',text:'Public fixture',audio:true,createdAt:'2026-11-02T00:00:00Z'},
      {id:'fixture-private',status:'shared',visibility:'private',originalLanguage:'Swahili',text:'Private fixture',audio:false,createdAt:'2026-11-03T00:00:00Z'},
      {id:'fixture-withdrawn',status:'withdrawn',visibility:'public',originalLanguage:'Zulu',text:'Withdrawn fixture',audio:true,createdAt:'2026-11-04T00:00:00Z'},
    ];
    await profilePage.route('**/api/stories', route => { profileStoriesAttempts++; if(storyRetryStage===0)return route.fulfill({status:503,contentType:'application/json',body:'{}'}); if(storyRetryStage===1)return route.fulfill({status:200,contentType:'application/json',body:'{}'}); return route.fulfill({status:200,contentType:'application/json',body:'[]'}); });
    await profilePage.route('**/api/mine', route => { profileMineAttempts++; return profileMineAttempts===1 ? route.fulfill({status:503,contentType:'application/json',body:'{}'}) : route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(collectionFixture)}); });
    await profilePage.route('https://story-bridge-test.supabase.co/**', supabaseMock);
    await profilePage.goto(webOrigin,{waitUntil:'domcontentloaded'}); await profilePage.getByRole('heading',{name:'Your storytelling space'}).waitFor();
    await profilePage.getByRole('alert').getByText('This list could not be loaded.').waitFor();
    ensure(await profilePage.getByRole('button',{name:'Create a story'}).isVisible(),'Workspace hid the create action during a list error.');
    await profilePage.getByRole('alert').getByRole('button',{name:'Try again'}).click();
    await profilePage.getByText('Your collection').waitFor();
    ensure(await profilePage.getByRole('button',{name:'Drafts 1'}).isVisible(),'Draft count did not use the status and visibility rules.');
    ensure(await profilePage.getByRole('button',{name:'Public 1'}).isVisible()&&await profilePage.getByRole('button',{name:'Private 1'}).isVisible()&&await profilePage.getByRole('button',{name:'Withdrawn 1'}).isVisible(),'Workspace category totals were inaccurate.');
    await captureEvidence('Workspace captures at 375px, 768px, 1280px, and 320px overflow check', async()=>{ const shots=[]; for(const width of [375,768,1280,320]) shots.push(await captureScreen(profilePage,'account-workspace',width,false)); return shots; });
    await profilePage.getByRole('button',{name:'Discover'}).click();
    storyRetryStage=1;
    await profilePage.getByRole('alert').getByRole('button',{name:'Try again'}).click();
    await profilePage.getByRole('alert').getByText('This list could not be loaded.').waitFor();
    ensure(await profilePage.getByText('No shared stories yet.').count()===0,'Malformed list response was rendered as a successful empty list.');
    pass('Workspace lists: malformed API response remains a retryable error');
    storyRetryStage=2;
    await profilePage.getByRole('alert').getByRole('button',{name:'Try again'}).click();
    await profilePage.getByText('The first stories are waiting to be told.').waitFor();
    await profilePage.getByRole('button',{name:'My stories'}).click();
    await profilePage.getByRole('heading',{name:'My stories'}).waitFor();
    await profilePage.getByRole('button',{name:/Drafts \(1\)/}).click();
    ensure(await profilePage.locator('.mine-card').count()===1,'Draft filter did not isolate the synthetic draft.');
    ensure(await profilePage.getByText('Audio recording attached').count()===0,'Draft card showed incorrect audio presence.');
    await captureEvidence('Collection captures at 375px, 768px, 1280px, and 320px overflow check', async()=>{ const shots=[]; for(const width of [375,768,1280,320]) shots.push(await captureScreen(profilePage,'account-collection',width,false)); return shots; });
    await profilePage.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Profile'}).click();
    await profilePage.getByRole('alert').getByRole('button',{name:'Try again'}).waitFor();
    await profilePage.getByRole('alert').getByRole('button',{name:'Try again'}).click();
    await profilePage.getByLabel('Display name').waitFor();
    await profilePage.getByLabel('Display name').fill('Unsaved local name');
    const canceledProfile=await confirmAction(profilePage,profilePage.getByRole('button',{name:'My workspace',exact:true}),false);
    ensure(canceledProfile.includes('unsaved changes')&&await profilePage.getByLabel('Display name').inputValue()==='Unsaved local name','Canceling profile navigation discarded its local input.');
    await profilePage.getByRole('button',{name:'Save profile'}).click();
    await profilePage.getByRole('alert').getByText('Your profile could not be saved. Try again.').waitFor();
    ensure(await profilePage.getByLabel('Display name').inputValue()==='Unsaved local name','Failed profile save discarded the local input.');
    await profilePage.getByRole('button',{name:'Save profile'}).click();
    await profilePage.getByRole('button',{name:'Saving…'}).waitFor();
    ensure(await profilePage.getByLabel('Display name').isVisible()&&await profilePage.getByRole('button',{name:'Saving…'}).isDisabled(),'Profile form disappeared or remained active while saving.');
    await profilePage.getByRole('status').getByText('Profile saved.').waitFor();
    await profilePage.getByRole('heading',{name:'Canonical server name'}).waitFor();
    await profilePage.getByRole('button',{name:'My workspace',exact:true}).click();
    await profilePage.getByRole('heading',{name:'Welcome, Canonical server name'}).waitFor();
    pass('Profile F: retry, navigation cancel, save failure retention, busy state, and canonical success');
    await captureEvidence('Profile captures at 375px, 768px, and 1280px', async()=>{ await profilePage.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Profile'}).click(); await profilePage.getByRole('heading',{name:'Canonical server name'}).waitFor(); const shots=[]; for(const width of [375,768,1280]) shots.push(await captureScreen(profilePage,'account-profile',width,false)); return shots; });
    await profileContext.close();
    const configRetryContext=await browser.newContext({viewport:{width:375,height:900}});
    await configRetryContext.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
    await configRetryContext.route('https://fonts.gstatic.com/**',route=>route.fulfill({status:204,body:''}));
    const configRetryPage=await configRetryContext.newPage(); let failConfigOnce=true;
    observePage(configRetryPage);
    await configRetryPage.route('**/api/account/config',route=>{if(failConfigOnce){failConfigOnce=false;return route.fulfill({status:503,contentType:'application/json',body:'{}'});}return route.continue();});
    await configRetryPage.goto(webOrigin,{waitUntil:'domcontentloaded'}); await configRetryPage.getByRole('heading',{name:'Story Bridge is unavailable'}).waitFor();
    ensure(await configRetryPage.getByText('Story Bridge could not load its configuration. Try again.').isVisible(),'Configuration failure did not show a recoverable error.');
    ensure(await configRetryPage.getByRole('button',{name:'Listen',exact:true}).count()===0,'Configuration failure silently selected legacy mode.');
    await configRetryPage.getByRole('button',{name:'Try again'}).click(); await configRetryPage.getByRole('heading',{name:'Share your culture. Learn from every other.'}).waitFor(); if(await configRetryPage.getByRole('button',{name:'Sign in'}).count()===0)await configRetryPage.getByRole('button',{name:'Menu'}).click();await configRetryPage.getByRole('button',{name:'Sign in'}).click(); await configRetryPage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();
    await configRetryContext.close();
    const liveContext = await browser.newContext({ viewport:{width:1280,height:900} });
    await liveContext.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
    await liveContext.route('https://fonts.gstatic.com/**',route=>route.fulfill({status:204,body:''}));
    await liveContext.addInitScript(() => {
      window.__storyBridgeCspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.__storyBridgeCspViolations.push({ directive:event.violatedDirective, blocked:event.blockedURI }));
    });
    const livePage = await liveContext.newPage(); livePage.setDefaultTimeout(8000); accountFlowPage = livePage;
    observePage(livePage);
    const signedInToken = signTestToken({ sub:'browser-test-user', iss:'https://story-bridge-test.supabase.co/auth/v1', aud:'authenticated', exp:Math.floor(Date.now()/1000)+3600, email:'reader@example.test' }, testSigningKey.privateKey, 'browser-local-key');
    const secondUserToken = signTestToken({ sub:'browser-test-user-b', iss:'https://story-bridge-test.supabase.co/auth/v1', aud:'authenticated', exp:Math.floor(Date.now()/1000)+3600, email:'second@example.test' }, testSigningKey.privateKey, 'browser-local-key');
    await livePage.route('https://story-bridge-test.supabase.co/**', async route => {
      const cors = { 'access-control-allow-origin':webOrigin, 'access-control-allow-headers':'*', 'access-control-allow-methods':'GET,POST,PUT,OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status:204, headers:cors });
      const providerPath = new URL(route.request().url()).pathname;
      if (providerPath === '/auth/v1/otp') return route.fulfill({ status:200, contentType:'application/json', headers:cors, body:'{}' });
      if (providerPath === '/auth/v1/verify') {
        const payload=route.request().postDataJSON(); const isSecond=payload?.email==='second@example.test';
        return route.fulfill({ status:200, contentType:'application/json', headers:cors, body:JSON.stringify({ access_token:isSecond?secondUserToken:signedInToken, refresh_token:'synthetic-refresh', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, user:{ id:isSecond?'browser-test-user-b':'browser-test-user', aud:'authenticated', email:isSecond?'second@example.test':'reader@example.test', app_metadata:{ provider:'email' }, user_metadata:{story_bridge_welcome_completed:true}, created_at:'2026-01-01T00:00:00Z' } }) });
      }
      return route.fulfill({ status:404, contentType:'application/json', headers:cors, body:JSON.stringify({ message:'Unexpected provider request in local test.' }) });
    });
    await livePage.goto(webOrigin,{waitUntil:'domcontentloaded'});
    await livePage.getByRole('heading',{name:'Share your culture. Learn from every other.'}).waitFor();
    await livePage.getByRole('button',{name:'Sign in'}).click();
    await livePage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();
    await livePage.getByLabel('Email address').fill('reader@example.test');
    await livePage.getByRole('button',{name:'Email me a code'}).click();
    for(const [index,digit] of [...'123456'].entries()) await livePage.getByRole('textbox',{name:`Code digit ${index+1}`}).fill(digit);
    await livePage.getByRole('button',{name:'Sign out'}).waitFor();
    ensure(await livePage.getByText('reader@example.test',{exact:true}).isVisible(), 'Signed-in email did not appear in the real account header.');
    await livePage.getByRole('heading',{name:'Your storytelling space'}).waitFor();
    await livePage.getByText('No drafts to continue yet.').waitFor();
    ensure(await livePage.getByRole('button',{name:'Set your display name'}).isVisible(),'An account without a display name did not get the optional profile action.');
    ensure(await livePage.getByRole('button',{name:'Drafts 0'}).isVisible()&&await livePage.getByRole('button',{name:'Public 0'}).isVisible()&&await livePage.getByRole('button',{name:'Private 0'}).isVisible()&&await livePage.getByRole('button',{name:'Withdrawn 0'}).isVisible(),'Empty workspace totals were not zero after loading an empty account.');
    await livePage.getByRole('button',{name:'Create a story',exact:true}).click();
    await livePage.getByLabel('Language told in').fill('Synthetic identity language');
    await livePage.getByRole('button',{name:'Continue to your story'}).click();
    await livePage.getByLabel('Your story').fill('Synthetic unsaved text for navigation guard.');
    const renewedSameUserToken=signTestToken({ sub:'browser-test-user', iss:'https://story-bridge-test.supabase.co/auth/v1', aud:'authenticated', exp:Math.floor(Date.now()/1000)+7200, email:'reader@example.test', jti:'same-user-renewal' }, testSigningKey.privateKey, 'browser-local-key');
    const renewedStorage=await livePage.evaluate(token=>{
      const entry=Object.entries(localStorage).map(([key,value])=>{try{return [key,JSON.parse(value)]}catch{return [key,null]}}).find(([,value])=>value?.access_token&&value?.user?.id==='browser-test-user');
      if(!entry)return false;
      const [key,session]=entry; const oldValue=localStorage.getItem(key); session.access_token=token; session.expires_at=Math.floor(Date.now()/1000)+7200;
      const newValue=JSON.stringify(session); localStorage.setItem(key,newValue); window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue})); return true;
    },renewedSameUserToken);
    ensure(renewedStorage,'Could not prepare the synthetic same-user token renewal.');
    await livePage.waitForTimeout(100);
    ensure(await livePage.getByLabel('Your story').inputValue()==='Synthetic unsaved text for navigation guard.','Same-user token renewal cleared unsaved story text.');
    pass('Identity race E: same-user token renewal preserves unsaved creation text');
    const canceledNavigation=await confirmAction(livePage,livePage.getByRole('button',{name:'My workspace',exact:true}),false);
    ensure(canceledNavigation.includes('unsaved changes')&&await livePage.getByLabel('Your story').inputValue()==='Synthetic unsaved text for navigation guard.','Canceling navigation did not preserve create-form text.');
    await confirmAction(livePage,livePage.getByRole('button',{name:'My workspace',exact:true}),true);
    await livePage.getByRole('heading',{name:'Your storytelling space'}).waitFor();
    await livePage.getByRole('button',{name:'Create a story',exact:true}).click();
    const falseDirtyDialog=await observeNoDialog(livePage,()=>livePage.getByRole('button',{name:'My workspace',exact:true}).click());
    await livePage.getByRole('heading',{name:'Your storytelling space'}).waitFor();
    ensure(!falseDirtyDialog,'Returning to the original create value still triggered a dirty-state confirmation.');
    await livePage.getByRole('button',{name:'Create a story',exact:true}).click();
    await livePage.getByLabel('Language told in').fill('Synthetic language');
    await livePage.getByRole('button',{name:'Continue to your story'}).click();
    await livePage.getByLabel('Post title').fill('Synthetic signed-in post');
    await livePage.getByLabel('Your story').fill('A synthetic signed-in draft before editing.');
    await livePage.getByLabel(/Or choose an audio file/).setInputFiles({name:'synthetic-account-audio.webm',mimeType:'audio/webm',buffer:Buffer.from('synthetic account audio')});
    await livePage.getByRole('button',{name:'Continue to translation'}).click();
    await livePage.getByRole('button',{name:'Continue to review'}).click();
    await livePage.getByLabel('This is mine, or I have permission from the person telling it.').check();
    let releaseDraftRefresh;
    let signalDraftRefreshStarted;
    const draftRefreshStarted = new Promise(resolve => { signalDraftRefreshStarted = resolve; });
    const heldDraftRefresh = new Promise(resolve => { releaseDraftRefresh = resolve; });
    await livePage.route('**/api/mine', async route => {
      if (route.request().method() === 'GET') {
        signalDraftRefreshStarted();
        await heldDraftRefresh;
      }
      await route.continue();
    });
    const accountCreatePromise=livePage.waitForResponse(response=>response.url()===`${webOrigin}/api/stories`&&response.request().method()==='POST');
    await livePage.getByRole('button',{name:'Save draft and open review'}).click();
    const accountCreateResponse=await accountCreatePromise;
    ensure(accountCreateResponse.status()===201,'Signed-in browser draft creation failed.');
    const accountStoryId=(await accountCreateResponse.json()).id;
    await draftRefreshStarted;
    const reviewOpenedBeforeRefresh = await livePage.getByRole('heading',{name:'Review your story'}).waitFor({timeout:5000}).then(()=>true).catch(()=>false);
    releaseDraftRefresh();
    await livePage.unroute('**/api/mine');
    ensure(reviewOpenedBeforeRefresh,'Saving a draft waited for the workspace refresh before opening review.');
    pass('Story A: saved draft opens review before the workspace refresh completes');
    await livePage.getByRole('button',{name:'My workspace',exact:true}).click();
    await livePage.getByRole('heading',{name:'Your storytelling space'}).waitFor();
    await livePage.getByRole('button',{name:'Create a story',exact:true}).click();
    ensure(await livePage.getByLabel('Language told in').inputValue()==='','Successful creation left the language in the next create form.');
    ensure(await livePage.locator('.recording-preview').count()===0,'Successful creation left the prior audio file in the next create form.');
    pass('Story A: successful save leaves a fresh next creation form');
    await livePage.getByLabel('Language told in').fill('Retry language');
    await livePage.getByRole('button',{name:'Continue to your story'}).click();
    await livePage.getByLabel('Post title').fill('Synthetic retry post');
    await livePage.getByLabel('Your story').fill('Keep this synthetic text after a failed creation.');
    await livePage.getByRole('button',{name:'Continue to translation'}).click();await livePage.getByRole('button',{name:'Continue to review'}).click();await livePage.getByLabel('This is mine, or I have permission from the person telling it.').check();
    await livePage.route('**/api/stories',route=>route.request().method()==='POST' ? route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic create failure.'})}) : route.continue());
    await livePage.getByRole('button',{name:'Save draft and open review'}).click();
    await livePage.getByRole('alert').getByText('Synthetic create failure.').waitFor();
    ensure(await livePage.getByText('Keep this synthetic text after a failed creation.',{exact:true}).isVisible(),'Failed creation cleared its text from the review step.');
    pass('Story A: failed creation retains entered text for retry');
    await livePage.unroute('**/api/stories');
    await confirmAction(livePage,livePage.getByRole('button',{name:'My stories',exact:true}),true);
    await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    await livePage.locator('.mine-card').filter({hasText:'Synthetic language'}).getByRole('button',{name:'Review',exact:true}).click();
    await livePage.getByRole('heading',{name:'Review your story'}).waitFor();
    const savedOriginalText=await livePage.getByLabel('Original text').inputValue();
    await livePage.getByLabel('Original text').fill('Temporary synthetic review edit.');
    const canceledReviewNavigation=await confirmAction(livePage,livePage.getByRole('button',{name:'My stories',exact:true}),false);
    ensure(canceledReviewNavigation.includes('unsaved changes')&&await livePage.getByLabel('Original text').inputValue()==='Temporary synthetic review edit.','Canceling review navigation did not preserve the edit.');
    await livePage.getByLabel('Original text').fill(savedOriginalText);
    const falseReviewDirtyDialog=await observeNoDialog(livePage,()=>livePage.getByRole('button',{name:'My stories',exact:true}).click());
    await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    ensure(!falseReviewDirtyDialog,'Reverting a review to its saved value still triggered a confirmation.');
    await livePage.locator('.mine-card').filter({hasText:'Synthetic language'}).getByRole('button',{name:'Review',exact:true}).click();
    await livePage.getByRole('heading',{name:'Review your story'}).waitFor();
    await livePage.getByLabel('Original text').fill('Edited by the signed-in browser flow.');
    const originalEditResponse=livePage.waitForResponse(response=>response.url()===`${webOrigin}/api/stories/${accountStoryId}`&&response.request().method()==='PUT');
    await livePage.getByRole('button',{name:'Save original edit'}).click();
    ensure((await originalEditResponse).status()===200,'Signed-in original text edit did not save successfully.');
    await livePage.getByRole('button',{name:'My stories',exact:true}).click();
    await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    const ownCard = livePage.locator('.mine-card').filter({ hasText:'Synthetic language' });
    await ownCard.waitFor({state:'visible'});
    await ownCard.getByRole('button',{name:'Open'}).click();
    await livePage.getByRole('heading',{name:'Synthetic signed-in post'}).waitFor();
    ensure(await livePage.getByText('Edited by the signed-in browser flow.',{exact:true}).isVisible(), 'Saved signed-in edit was not returned by the real story API.');
    await livePage.getByRole('button',{name:'← Back'}).click();
    const accountCard=livePage.locator('.mine-card').filter({hasText:'Synthetic language'});
    await accountCard.getByRole('button',{name:'Review',exact:true}).click();
    await livePage.getByRole('heading',{name:'Review your story'}).waitFor();
    const review375=await captureScreen(livePage,'account-review-status',375,true);
    const review768=await captureScreen(livePage,'account-review-status',768,true);
    const review1280=await captureScreen(livePage,'account-review-status',1280,true);
    await livePage.setViewportSize({width:320,height:900});
    const narrowMetrics=await livePage.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    ensure(narrowMetrics.document<=321,`Review screen overflows horizontally at 320px: ${JSON.stringify(narrowMetrics)}.`);
    const narrowFile=path.join(evidenceDir,'account-review-status-320.png');await livePage.screenshot({path:narrowFile,animations:'disabled'});
    results.push({name:'Account review screen screenshots 375px, 768px, 1280px, and 320px overflow check',status:'PASS',evidence:[review375.file,review768.file,review1280.file,narrowFile].map(file=>path.relative(root,file)),detail:JSON.stringify(narrowMetrics)});

    const storyPattern=`**/api/stories/${accountStoryId}`;
    const doubleClick=async name=>livePage.getByRole('button',{name,exact:true}).evaluate(button=>{button.click();button.click();});
    let publishRequests=0;
    await livePage.route(storyPattern,async route=>{
      if(route.request().method()==='PUT'&&route.request().postDataJSON()?.approve===true){publishRequests++;await delay(300);}
      await route.continue();
    });
    await livePage.getByRole('radio',{name:'Anyone who opens this app'}).check();
    await doubleClick('Approve and share');
    const publishing=livePage.getByRole('button',{name:'Publishing…',exact:true});
    await publishing.waitFor({state:'visible'});
    ensure(await publishing.isDisabled(),'Publish remained enabled during its pending request.');
    await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    await livePage.unroute(storyPattern);
    ensure(publishRequests===1,`Double click submitted ${publishRequests} publish requests.`);
    pass('Mutation G: delayed publish double click submits once');
    const adminApprovalResponse=livePage.waitForResponse(response=>response.url()===`${webOrigin}/api/admin/posts/${accountStoryId}/approve`&&response.request().method()==='POST');await livePage.getByRole('button',{name:'Approve first post',exact:true}).click();const adminApprovalResult=await adminApprovalResponse;ensure(adminApprovalResult.status()===200,`Admin approval returned HTTP ${adminApprovalResult.status()}.`);
    await livePage.waitForFunction(async id=>{const r=await fetch('/api/stories');const rows=await r.json();return rows.some(story=>story.id===id)},accountStoryId);
    const publicList=await livePage.evaluate(async()=>{const r=await fetch('/api/stories');return r.json();});
    if(!publicList.some(story=>story.id===accountStoryId)){const privateStatus=await livePage.evaluate(async id=>{const session=Object.entries(localStorage).map(([,value])=>{try{return JSON.parse(value)}catch{return null}}).find(value=>value?.access_token&&value?.user?.id==='browser-test-user');const auth=session?{authorization:`Bearer ${session.access_token}`}:{},detail=await fetch(`/api/stories/${id}`,{headers:auth}),mine=await fetch('/api/mine',{headers:auth}),pending=await fetch('/api/admin/posts/pending',{headers:auth}),d=detail.ok?await detail.json():null,m=mine.ok?await mine.json():[],p=pending.ok?await pending.json():[];return{detailStatus:detail.status,mineStatus:mine.status,pendingStatus:pending.status,detailState:d?{id:d.id,status:d.status,visibility:d.visibility,moderationStatus:d.moderationStatus}:null,mineIds:m.map(item=>item.id),pendingIds:p.map(item=>item.id)}},accountStoryId);throw new Error(`Explicit publish missing from public feed after successful admin response: ${JSON.stringify({publicIds:publicList.map(story=>story.id),privateStatus})}`)}

    const publicCard=livePage.locator('.mine-card').filter({hasText:'Synthetic language'});
    await publicCard.getByRole('button',{name:'Review',exact:true}).click();
    await livePage.getByRole('heading',{name:'Review your story'}).waitFor();
    await livePage.getByLabel('Original text').fill('Synthetic edit retained after failed draft save.');
    let failDraftOnce=true;let draftRequests=0;
    await livePage.route(storyPattern,async route=>{
      if(route.request().method()==='PUT'&&route.request().postDataJSON()?.approve===false){
        if(failDraftOnce){failDraftOnce=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic draft-save failure.'})});return;}
        draftRequests++;await delay(300);
      }
      await route.continue();
    });
    await livePage.getByRole('button',{name:'Save as draft',exact:true}).click();
    await livePage.getByRole('alert').getByText('Synthetic draft-save failure.').waitFor({state:'visible'});
    ensure(await livePage.getByLabel('Original text').inputValue()==='Synthetic edit retained after failed draft save.','Failed draft save discarded the local edit.');
    ensure(await livePage.getByRole('button',{name:'Save as draft',exact:true}).isEnabled(),'Draft action remained disabled after failure.');
    await doubleClick('Save as draft');
    const savingDraft=livePage.getByRole('button',{name:'Saving draft…',exact:true});
    await savingDraft.waitFor({state:'visible'});
    ensure(await savingDraft.isDisabled(),'Draft action remained enabled during its pending request.');
    await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    await livePage.unroute(storyPattern);
    ensure(draftRequests===1,`Double click submitted ${draftRequests} successful draft requests.`);
    pass('Mutation G: failed draft retry and delayed double click submit one successful save');
    const unauthDraft=await livePage.evaluate(async id=>{
      const story=await fetch(`/api/stories/${id}`);const audio=await fetch(`/api/stories/${id}/audio`);
      return {story:story.status,audio:audio.status};
    },accountStoryId);
    ensure(unauthDraft.story===404&&unauthDraft.audio===404,'Non-owner could access a draft with public visibility.');
    const draftCard=livePage.locator('.mine-card').filter({hasText:'Synthetic language'});
    const ownerAudioResponse=livePage.waitForResponse(response=>response.url()===`${webOrigin}/api/stories/${accountStoryId}/audio`);
    await draftCard.getByRole('button',{name:'Open'}).click();
    const ownerAudio=await ownerAudioResponse;
    ensure(ownerAudio.status()===200&&!!ownerAudio.request().headers().authorization,'Owner could not load public-choice draft audio through the authenticated path.');
    ensure(await livePage.getByText('Synthetic edit retained after failed draft save.',{exact:true}).isVisible(),'Owner could not read the draft text.');
    await livePage.getByRole('button',{name:'← Back'}).click();

    const savedDraftCard=livePage.locator('.mine-card').filter({hasText:'Synthetic language'});
    await savedDraftCard.getByRole('button',{name:'Review',exact:true}).click();
    await livePage.getByRole('heading',{name:'Review your story'}).waitFor();
    await livePage.getByLabel('Anyone who opens this app').check();
    await livePage.getByRole('button',{name:'Approve and share',exact:true}).click();
    await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    await livePage.unroute(storyPattern);
    const republished=await livePage.evaluate(async()=>fetch('/api/stories').then(response=>response.json()));
    ensure(republished.some(story=>story.id===accountStoryId),'Republishing a draft did not require and honor an explicit action.');
    const republishedMine=await livePage.evaluate(async()=>{
      const session=Object.values(localStorage).map(value=>{try{return JSON.parse(value)}catch{return null}}).find(value=>value?.access_token);
      if(!session)throw Error('Synthetic signed-in session was not available for the own-story list check.');
      const response=await fetch('/api/mine',{headers:{authorization:`Bearer ${session.access_token}`}});
      return response.json();
    });
    ensure(republishedMine.some(story=>story.id===accountStoryId&&story.status==='shared'),'Account story did not return to shared status after explicit republishing.');
    let withdrawalRequests=0;
    await livePage.route(storyPattern,async route=>{
      if(route.request().method()==='PUT'&&route.request().postDataJSON()?.withdraw===true){withdrawalRequests++;await delay(300);}
      await route.continue();
    });
    const republishedCard=livePage.locator('.mine-card').filter({hasText:'Synthetic language'});
    await republishedCard.getByRole('button',{name:'Withdraw',exact:true}).click();
    const confirmation=livePage.getByRole('group',{name:'Confirm withdrawal'});
    await confirmation.waitFor({state:'visible'});
    const withdrawButton=confirmation.getByRole('button',{name:'Withdraw story',exact:true});
    ensure(await withdrawButton.isEnabled(),'Withdraw action was disabled before its request began.');
    await withdrawButton.evaluate(button=>{button.click();button.click();});
    const withdrawing=confirmation.getByRole('button',{name:'Withdrawing…',exact:true});
    await withdrawing.waitFor({state:'visible'});
    ensure(await withdrawing.isDisabled(),'Withdraw remained enabled during its pending request.');
    await confirmation.waitFor({state:'detached'});
    await livePage.unroute(storyPattern);
    ensure(withdrawalRequests===1,`Double click submitted ${withdrawalRequests} withdrawal requests.`);
    pass('Mutation G: delayed withdrawal double click submits once');
    const withdrawn=await livePage.evaluate(async id=>fetch(`/api/stories/${id}`).then(response=>response.status),accountStoryId);
    ensure(withdrawn===404,'Withdrawn story remained available without an owner session.');

    const loginAs=async email=>{
      if(await livePage.getByLabel('Email address').count()===0) { await livePage.getByRole('button',{name:'Sign in'}).click(); await livePage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor(); }
      await livePage.getByLabel('Email address').fill(email); await livePage.getByRole('button',{name:'Email me a code'}).click();
      for(const [index,digit] of [...'123456'].entries()) await livePage.getByRole('textbox',{name:`Code digit ${index+1}`}).fill(digit);
      await livePage.getByRole('button',{name:'Sign out'}).waitFor(); await livePage.getByRole('heading',{name:'Your storytelling space'}).waitFor();
    };
    // Hold an A-owned private detail response across sign-out and B sign-in.
    await livePage.getByRole('button',{name:'My stories',exact:true}).click(); await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    const withdrawnCard=livePage.locator('.mine-card').filter({hasText:'Synthetic language'});
    let releaseDetail; const detailHeld=new Promise(resolve=>{releaseDetail=resolve;}); let detailReached;
    const detailRequested=new Promise(resolve=>{detailReached=resolve;});
    await livePage.route(storyPattern,async route=>{if(route.request().method()==='GET'){detailReached();await detailHeld;return route.continue();}return route.continue();});
    await withdrawnCard.getByRole('button',{name:'Open'}).click(); await detailRequested;
    await livePage.getByRole('button',{name:'Sign out'}).click(); await livePage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();
    await loginAs('second@example.test'); releaseDetail(); await delay(350);
    ensure(!(await livePage.locator('body').innerText()).includes('Edited by the signed-in browser flow.'),'A delayed A detail response appeared after B signed in.');
    pass('Identity race C: delayed private A detail cannot render for B');
    await livePage.unroute(storyPattern);
    // Hold B's profile load, switch back to A, and ensure the stale profile cannot win.
    let releaseProfile; const profileHeld=new Promise(resolve=>{releaseProfile=resolve;}); let profileReached;
    const profileRequested=new Promise(resolve=>{profileReached=resolve;});
    let holdNextProfile=true;
    await livePage.route('**/api/account/profile',async route=>{
      if(route.request().method()==='GET'&&holdNextProfile){holdNextProfile=false;profileReached();await profileHeld;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({display_name:'Stale second user'})});}
      return route.continue();
    });
    await livePage.reload(); await livePage.getByRole('button',{name:'Sign out'}).waitFor(); await profileRequested;
    await livePage.getByRole('button',{name:'Sign out'}).click(); await livePage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();
    await loginAs('reader@example.test'); releaseProfile(); await delay(350);
    ensure((await livePage.locator('body').innerText()).includes('Welcome, Canonical server name')===false,'A stale profile response restored the other user’s saved profile name.');
    ensure(!(await livePage.locator('body').innerText()).includes('Stale second user'),'A delayed profile response from the previous identity was rendered.');
    pass('Identity race D1: delayed profile response cannot restore prior identity data');
    await livePage.unroute('**/api/account/profile');
    await livePage.getByRole('button',{name:'My stories',exact:true}).click(); await livePage.getByRole('heading',{name:'My stories'}).waitFor();
    const mutationCard=livePage.locator('.mine-card').filter({hasText:'Synthetic language'});
    await mutationCard.getByRole('button',{name:'Review',exact:true}).click(); await livePage.getByRole('heading',{name:'Review your story'}).waitFor();
    await livePage.getByLabel('Original text').fill('Late mutation from the previous identity.');
    let releaseMutation; const mutationHeld=new Promise(resolve=>{releaseMutation=resolve;}); let mutationReached;
    const mutationRequested=new Promise(resolve=>{mutationReached=resolve;});
    await livePage.route(storyPattern,async route=>{if(route.request().method()==='PUT'){mutationReached();await mutationHeld;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic delayed mutation failure.'})});}return route.continue();});
    await livePage.getByRole('button',{name:'Save original edit'}).click(); await mutationRequested;
    await confirmAction(livePage,livePage.getByRole('button',{name:'Sign out'}),true); await livePage.getByRole('heading',{name:'Welcome to Story Bridge'}).waitFor();
    await loginAs('second@example.test'); releaseMutation(); await delay(350);
    ensure(!(await livePage.locator('body').innerText()).includes('Late mutation from the previous identity.'),'A delayed mutation response changed the next identity’s screen.');
    ensure(!(await livePage.locator('body').innerText()).includes('Synthetic delayed mutation failure.')&&await livePage.getByRole('heading',{name:'Your storytelling space'}).isVisible(),'A delayed mutation error appeared in the next identity’s session or navigated it away.');
    pass('Identity race D2: delayed mutation error cannot alter B or its navigation');
    await livePage.unroute(storyPattern);
    const violations = await livePage.evaluate(() => window.__storyBridgeCspViolations);
    ensure(violations.length === 0, `Real account-mode CSP violations occurred: ${JSON.stringify(violations)}`);
    await liveContext.close();
    jwksServer.close(); jwksServer = undefined;
    return {detail:'Existing sign-in/profile views use mocked API responses; the added browser session mocks only Supabase auth. Real account-mode server, real same-origin routes, real isolated file account storage, local JWKS signature verification, and enforced CSP cover public-to-draft-to-public transitions, authenticated owner draft audio, non-owner denial, delayed double-click guards, failure recovery, and withdrawal.'};
  }, browserReady);
  await record('No app console or uncaught JavaScript errors', async () => {
    ensure(consoleErrors.length === 0, `Browser console errors: ${consoleErrors.join(' | ')}`);
    ensure(pageErrors.length === 0, `Uncaught JavaScript errors: ${pageErrors.join(' | ')}`);
    return `Checked ${consoleMessages.length} console messages across ${urls.length} browser requests; ${resourceErrors.length} resource-load errors came from the suite’s expected network-failure, missing-media, or blocked-font scenarios.`;
  }, browserReady);
} catch (error) {
  if (!(error instanceof FocusedPreviewComplete)) {
    ok = false;
    const detail = String(error?.message || error).replace(/[0-9a-f]{64,}/gi, '[redacted token-like value]');
    process.stderr.write(`SUITE BLOCKER — ${detail}\n`);
  }
} finally {
  await stop(apiServer); await stop(webServer); await stop(accountServer);
  if (jwksServer?.listening) await new Promise(resolve => jwksServer.close(resolve));
  if (browser) await browser.close();
  const report = { runId, apiPort, webPort, isolatedData: path.relative(root, dataDir), isolatedUploads: path.relative(root, uploadsDir), evidence: path.relative(root, evidenceDir), results };
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`Evidence directory: ${path.relative(root, evidenceDir)}\n`);
  for (const result of results) if (result.status === 'FAIL') ok = false;
}
if (!storyId && !recorderPreviewOnly && focusedScenario !== 'account') ok = false;
if (!ok) process.exitCode = 1;
