import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = process.cwd();
const inside = value => path.resolve(value).startsWith(`${root}${path.sep}`);
const recorderPreviewOnly = process.env.RECORDER_PREVIEW_ONLY === '1';
const recorderCaptureSeconds = Math.max(1, Math.min(10, Number.parseInt(process.env.RECORDER_CAPTURE_SECONDS || '1', 10) || 1));
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
const isolated = path.join(root, '.test-data', 'runs', runId);
const dataDir = path.join(isolated, 'data');
const uploadsDir = path.join(isolated, 'uploads');
const fixtureDir = path.join(isolated, 'fixtures');
const evidenceDir = path.join(root, 'test-evidence', runId);
for (const dir of [isolated, dataDir, uploadsDir, fixtureDir, evidenceDir]) {
  if (!inside(dir)) throw new Error('Refusing a path outside the project.');
  fs.mkdirSync(dir, { recursive: true });
}
const apiPort = Number(process.env.TEST_API_PORT || 4318);
const webPort = Number(process.env.TEST_WEB_PORT || 4317);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const results = [];
const responseBodies = [];
const urls = [];
const consoleMessages = [];
const serverLogs = [];
let apiServer;
let viteServer;
let browser;
let contextA;
let contextB;
let contextCapture;
let contextUnsupported;
let pageA;
let pageB;
let pageCapture;
let pageUnsupported;
let ownerA = '';
let ownerB = '';
let ownerCapture = '';
let ownerUnsupported = '';
let storyId = '';
let fixturePath = '';

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const pass = name => { results.push({ name, status: 'PASS' }); process.stdout.write(`PASS ${name}\n`); };
const record = async (name, fn, prerequisite = true) => {
  if (!prerequisite) { results.push({ name, status: 'NOT TESTED', detail: 'Prerequisite did not pass.' }); process.stdout.write(`NOT TESTED ${name}\n`); return false; }
  try { const detail = await fn(); const status=detail?.status || 'PASS'; results.push({ name, status, detail: detail?.detail || '' }); process.stdout.write(`${status} ${name}${detail?.detail ? ` — ${detail.detail}` : ''}\n`); return status === 'PASS'; }
  catch (error) {
    const detail = String(error?.message || error).replace(/[0-9a-f]{64,}/gi, '[redacted token-like value]');
    results.push({ name, status: 'FAIL', detail }); process.stderr.write(`FAIL ${name} — ${detail}\n`);
    const page = pageCapture && !pageCapture.isClosed() ? pageCapture : pageA || pageB;
    if (page && !page.isClosed()) { try { const p = path.join(evidenceDir, `failure-${results.length}.png`); await page.screenshot({ path: p, fullPage: true }); results.at(-1).evidence = path.relative(root, p); } catch {} }
    return false;
  }
};
function observePage(page) {
  page.on('request', req => urls.push(req.url()));
  page.on('console', msg => consoleMessages.push(msg.text()));
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
  p.stderr.on('data', b => serverLogs.push(b.toString()));
  return p;
}
async function stop(p) {
  if (!p || p.exitCode !== null) return;
  await new Promise(resolve => { p.once('exit', resolve); p.kill(); setTimeout(resolve, 3000).unref(); });
}
async function startApi() {
  apiServer = child(process.execPath, ['server/index.js'], {
    NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(apiPort),
    STORY_DATA_DIR: dataDir, STORY_UPLOAD_DIR: uploadsDir, STORY_NO_LISTEN: '0',
  });
  await waitFor(`${apiOrigin}/api/stories`);
}
async function startVite() {
  viteServer = child(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    HOST: '127.0.0.1', VITE_API_PROXY_TARGET: apiOrigin,
  });
  await waitFor(`${webOrigin}/`);
}
function waveFixture(file) {
  const sampleRate = 16000, seconds = 0.5, samples = sampleRate * seconds;
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
    const clipped = controls.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.width < 24 || r.height < 20; }).map(el => el.tagName);
    const tiny = [...document.querySelectorAll('body *')].filter(visible).map(el => parseFloat(getComputedStyle(el).fontSize)).filter(n => n > 0 && n < 12);
    const main = document.querySelector('main')?.getBoundingClientRect(); const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, clippedControls: clipped, tinyTextCount: tiny.length, mainX: main?.x, mainRight: main?.right, mainBottom: main?.bottom, navTop: nav?.top, navWidth: nav?.width };
  });
  ensure(metrics.document <= width + 1, `Horizontal overflow at ${width}px.`);
  ensure(metrics.clippedControls.length === 0, `Clipped or undersized controls at ${width}px.`);
  ensure(metrics.tinyTextCount === 0, `Text below 12px found at ${width}px.`);
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
  const dialogResult = new Promise(resolve => page.once('dialog', async dialog => {
    const message = dialog.message();
    if (accept) await dialog.accept(); else await dialog.dismiss();
    resolve(message);
  }));
  await button.click();
  return dialogResult;
}
async function captureWidths(page, name) {
  for (const width of [1280, 390]) {
    const shot = await captureScreen(page, name, width, true);
    results.push({ name: `${name} screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
  }
}

let ok = true;
try {
  await record('Isolated test server and storage under .test-data', async () => {
    ensure(inside(dataDir) && inside(uploadsDir), 'Isolated storage escaped the project.');
    await startApi(); await startVite();
    ensure(fs.existsSync(dataDir) && fs.existsSync(uploadsDir), 'Test server did not initialize isolated data directories.');
  });
  if (!apiServer || !viteServer) throw new Error('Isolated test services could not start; stopping before application actions.');

  await record('Synthetic audio fixture generation', async () => {
    fixturePath = path.join(fixtureDir, 'synthetic-tone.wav'); waveFixture(fixturePath);
    ensure(fs.statSync(fixturePath).size > 1000, 'Generated WAV fixture is unexpectedly small.');
  });
  await record('Launch bundled Chromium with isolated A and B contexts', async () => {
    fs.mkdirSync(path.join(isolated, 'local-appdata'), { recursive: true }); fs.mkdirSync(path.join(isolated, 'appdata'), { recursive: true });
    browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, TEMP: requiredEnv.TEMP, TMP: requiredEnv.TMP, LOCALAPPDATA: path.join(isolated, 'local-appdata'), APPDATA: path.join(isolated, 'appdata'), PLAYWRIGHT_BROWSERS_PATH: requiredEnv.PLAYWRIGHT_BROWSERS_PATH } });
    contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contextCapture = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contextUnsupported = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    pageA = await contextA.newPage(); pageB = await contextB.newPage(); pageA.setDefaultTimeout(8000); pageB.setDefaultTimeout(8000); observePage(pageA); observePage(pageB);
    pageCapture = await contextCapture.newPage(); pageUnsupported = await contextUnsupported.newPage(); pageCapture.setDefaultTimeout(8000); pageUnsupported.setDefaultTimeout(8000); observePage(pageCapture); observePage(pageUnsupported);
    await pageCapture.addInitScript(() => {
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
    await pageA.goto(webOrigin); await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageB.goto(webOrigin); await pageB.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageCapture.goto(webOrigin); await pageCapture.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageUnsupported.goto(webOrigin); await pageUnsupported.getByRole('heading', { name: 'Listen' }).waitFor();
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
    await pageCapture.getByRole('button', { name: 'Share a story', exact: true }).click();
    await pageCapture.getByRole('heading', { name: 'Share a story' }).waitFor();
    await pageCapture.getByRole('status').getByText('Ready to record.').waitFor();
    await captureWidths(pageCapture, 'record-ready');

    await pageCapture.evaluate(() => {
      window.__captureStatuses = [];
      const status = document.querySelector('[role="status"]');
      new MutationObserver(() => window.__captureStatuses.push(status.textContent.trim())).observe(status, { childList: true, subtree: true, characterData: true });
    });
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('status').getByText('Waiting for microphone permission.').waitFor();
    await pageCapture.locator('button[type="submit"]').waitFor();
    ensure(await pageCapture.getByRole('button', { name: 'Record voice' }).count() === 0, 'A second recording control remained available while waiting for permission.');
    ensure(await pageCapture.locator('button[type="submit"]').isDisabled(), 'Save remained enabled while waiting for microphone permission.');
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
      status: document.querySelector('[role="status"]')?.textContent.trim(),
      live: document.querySelector('[role="status"]')?.getAttribute('aria-live'),
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
      const source = element.src;
      const fetched = await fetch(source).then(async response => ({ ok: response.ok, blob: await response.blob() })).catch(() => ({ ok: false, blob: null }));
      const blob = fetched.blob;
      if (!element.paused) element.pause();
      return {
        blobUrl: source.startsWith('blob:'),
        fetchOk: fetched.ok,
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
        type: blob?.type || '',
        size: blob?.size || 0,
      };
    });
    ensure(preview.blobUrl && preview.fetchOk && preview.size > 0 && preview.readyStateAfter >= 1 && preview.duration > 0, `Captured preview is not playable media metadata: ${JSON.stringify(preview)}.`);
    ensure(/^audio\/[a-z0-9.+-]+$/i.test(preview.type), `Captured audio MIME does not match server acceptance: ${preview.type || 'empty'}.`);
    if (preview.canPlay) ensure(preview.progressed, `Chromium advertised support for the captured recording but playback did not advance. Diagnostics: ${JSON.stringify(preview)}.`);
    const actualRecorderMime = await pageCapture.evaluate(() => window.__lastMediaRecorder?.mimeType || '');
    const [actualContainer, ...actualParameters] = actualRecorderMime.split(';').map(part => part.trim());
    ensure(actualContainer?.toLowerCase() === preview.type.toLowerCase() && actualParameters.every(parameter => /^codecs\s*=\s*[a-z0-9._,-]+$/i.test(parameter)), `Actual MediaRecorder MIME was not safely normalized to the server-accepted type: ${actualRecorderMime || 'empty'} -> ${preview.type}.`);
    ensure(await pageCapture.getByRole('button', { name: 'Remove recording' }).isVisible(), 'Unsaved recording cannot be removed.');
    ensure(await pageCapture.getByRole('button', { name: 'Retake recording' }).isVisible(), 'Unsaved recording cannot be retaken.');
    const stoppedTracks = await pageCapture.evaluate(() => window.__lastMicStream?.getTracks().every(track => track.readyState === 'ended'));
    ensure(stoppedTracks, 'Microphone track remained live after stopping.');
    const transitions = await pageCapture.evaluate(() => window.__captureStatuses);
    ensure(transitions.includes('Stopping recording.') && transitions.includes('Recording captured. Not saved yet.'), `Status transitions were incomplete: ${JSON.stringify(transitions)}.`);
    await captureWidths(pageCapture, 'record-captured-unsaved');
    capturePreviewReady = true;
    return { status: preview.canPlay ? 'PASS' : 'NOT TESTED', detail: `MediaRecorder reported ${actualRecorderMime}; captured upload MIME was ${preview.type}; preview diagnostics: ${JSON.stringify(preview)}.` };
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
    const previousStillWorks = await pageCapture.evaluate(async url => { try { return (await fetch(url)).ok; } catch { return false; } }, firstUrl);
    ensure(!previousStillWorks, 'Previous recording object URL was not revoked after replacement.');
    await captureWidths(pageCapture, 'record-retaken-unsaved');

    const removeCanceled = await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Remove recording' }), false);
    ensure(removeCanceled.includes('Remove this unsaved audio') && await preview.getAttribute('src') === replacementUrl, 'Canceling removal did not preserve the preview.');
    await confirmAction(pageCapture, pageCapture.getByRole('button', { name: 'Remove recording' }), true);
    await pageCapture.getByRole('status').getByText('Ready to record.').waitFor();
    ensure(await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').count() === 0, 'Removed audio preview remained visible.');
    const replacementStillWorks = await pageCapture.evaluate(async url => { try { return (await fetch(url)).ok; } catch { return false; } }, replacementUrl);
    ensure(!replacementStillWorks, 'Removed recording object URL was not revoked.');

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
    ensure(await pageCapture.locator('button[type="submit"]').isDisabled(), 'Save remained enabled while stopping.');
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
    await pageUnsupported.getByRole('button', { name: 'Share a story', exact: true }).click();
    await pageUnsupported.getByRole('heading', { name: 'Share a story' }).waitFor();
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
    await pageUnsupported.getByText('Duration: 0:00.5', { exact: true }).waitFor();
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

    await pageCapture.getByRole('button', { name: 'Share a story', exact: true }).click();
    await pageCapture.getByLabel('Language told in').fill('Synthetic recording language');
    await pageCapture.getByLabel('Your story').fill('Synthetic fake-microphone capture for save retry coverage.');
    await pageCapture.getByRole('button', { name: 'Record voice' }).click();
    await pageCapture.getByRole('status').getByText('Recording.').waitFor();
    await pageCapture.waitForTimeout(1100);
    await pageCapture.getByRole('button', { name: 'Stop recording' }).click();
    await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').waitFor();
    const retainedUrl = await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').getAttribute('src');
    await captureWidths(pageCapture, 'record-before-save');

    await pageCapture.route('**/api/stories', async route => {
      if (route.request().method() === 'POST') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic save failure' }) });
      else await route.continue();
    });
    await pageCapture.getByRole('button', { name: 'Save draft and review' }).click();
    await pageCapture.getByRole('alert').getByText('Synthetic save failure').waitFor();
    ensure(await pageCapture.getByRole('status').getByText('Recording captured. Not saved yet.').isVisible(), 'Save failure changed the capture status to saved or removed it.');
    ensure(await pageCapture.locator('audio[aria-label="Preview of unsaved audio"]').getAttribute('src') === retainedUrl, 'Save failure removed the captured audio.');
    ensure(await pageCapture.getByRole('button', { name: 'Save draft and review' }).isEnabled(), 'Retry save action is disabled after a failed response.');
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

    await pageCapture.getByRole('button', { name: 'Save draft and review' }).click();
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

  await record('Listen, Share, and My stories render at 1280px and 390px', async () => {
    await pageA.getByRole('button', { name: 'Share a story', exact: true }).click(); await pageA.getByRole('heading', { name: 'Share a story' }).waitFor();
    ensure(await pageA.getByRole('button', { name: 'Record voice' }).isVisible(), 'Record voice control is missing.');
    ensure((await pageA.getByLabel(/Or choose an audio file/).getAttribute('accept'))?.includes('audio/'), 'Audio file upload control is missing.');
    for (const width of [1280, 390]) {
      const shot = await captureScreen(pageA, 'share', width); results.push({ name: `Share screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
    }
    await pageA.getByRole('button', { name: 'My stories', exact: true }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    for (const width of [1280, 390]) {
      const shot = await captureScreen(pageA, 'my-stories-empty', width); results.push({ name: `My stories screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) });
    }
    await pageA.getByRole('button', { name: 'Listen', exact: true }).click(); await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
  }, browserReady);

  await record('Empty required language input is blocked in UI and rejected by API', async () => {
    await pageA.getByRole('button', { name: 'Share a story', exact: true }).click();
    const input = pageA.getByLabel('Language told in');
    ensure(await input.evaluate(el => el.required && el.validity.valueMissing), 'Empty language is not marked required.');
    const fd = new FormData(); fd.append('originalLanguage', ''); fd.append('text', '');
    const r = await direct(ownerA, '/api/stories', 'POST', fd); ensure(r.status === 400, 'API accepted empty language.');
  }, browserReady);

  await record('Create a draft as A with hidden name, manual translation, script-like text, and synthetic audio', async () => {
    const text = "Synthetic test story.\n<script>window.__storyBridgeInjected=true</script>\nLiteral text remains text.";
    await pageA.getByLabel('Language told in').fill('Test language');
    await pageA.getByLabel('Your story').fill(text);
    await pageA.getByLabel('Translation language (optional)').fill('Second test language');
    await pageA.getByLabel('Translation entered by you').fill('Manual test translation.');
    await pageA.getByLabel('Your name (optional)').fill('Synthetic Hidden Author');
    ensure(!(await pageA.getByLabel('Show my name on this story').isChecked()), 'Show-name default should be off.');
    await pageA.getByLabel(/Or choose an audio file/).setInputFiles(fixturePath);
    await pageA.getByRole('button', { name: 'Save draft and review' }).click();
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
    await pageA.getByRole('button', { name: 'Save as draft' }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    for (const width of [1280, 390]) { const shot = await captureScreen(pageA, 'my-stories-draft', width); results.push({ name: `My stories with draft screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) }); }
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
    await pageA.getByText('Checked by Synthetic Reviewer, as stated by the author').waitFor({ state: 'visible' });
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

  await record('Only me approval remains private and B direct mutations are forbidden', async () => {
    ensure(await pageA.getByLabel('Only me').isChecked(), 'Only me is not the default visibility.');
    await pageA.getByRole('button', { name: 'Approve and share' }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
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
    const playback = await pageA.locator('audio').evaluate(async audio => {
      if (!audio.canPlayType('audio/wav')) return { supported: false, reason: 'Browser reports WAV unsupported.' };
      let decoded=false, decodeError='';
      try { const context=new AudioContext();const buffer=await fetch(audio.src).then(r=>r.arrayBuffer());await context.decodeAudioData(buffer);decoded=true;await context.close(); } catch(e) { decodeError=e?.name||'decode failed'; }
      try { audio.load(); await new Promise(resolve => { if (audio.readyState >= 1 || audio.error) return resolve(); audio.addEventListener('loadedmetadata', resolve, { once:true }); audio.addEventListener('error', resolve, { once:true }); setTimeout(resolve, 3000); }); const metadata={duration:Number.isFinite(audio.duration)?audio.duration:null,error:audio.error?.code||null,readyState:audio.readyState}; await audio.play(); await new Promise(resolve => setTimeout(resolve, 220)); const progressed = audio.currentTime > 0; audio.pause(); return { supported: true, progressed, metadata, decoded, decodeError }; }
      catch (e) { return { supported: true, reason: e?.name || 'play failed', metadata:{duration:Number.isFinite(audio.duration)?audio.duration:null,error:audio.error?.code||null,readyState:audio.readyState}, decoded, decodeError }; }
    });
    const playbackResult = !playback.supported || !playback.progressed
      ? { name:'Synthetic audio playback', status:'NOT TESTED', detail:`Browser playback did not advance (${playback.reason || 'no progress'}); media=${JSON.stringify(playback.metadata||{})}, decode=${playback.decoded?'PASS':playback.decodeError||'not available'}.` }
      : { name:'Synthetic audio playback', status:'PASS', detail:'Chromium decoded the synthetic WAV and the media timeline advanced; audible output was not independently assessed.' };
    results.push(playbackResult); process.stdout.write(`${playbackResult.status} ${playbackResult.name} — ${playbackResult.detail}\n`);
  }, haveStory);

  await record('Excessive text and invalid or oversized audio are rejected', async () => {
    let fd = new FormData(); fd.append('originalLanguage', 'Test language'); fd.append('text', 'x'.repeat(12001));
    ensure((await direct(ownerA, '/api/stories', 'POST', fd)).status === 413, 'API accepted excessive story text.');
    fd = new FormData(); fd.append('originalLanguage', 'Test language'); fd.append('audio', new Blob(['not audio'], { type: 'text/plain' }), 'bad.txt');
    ensure((await direct(ownerA, '/api/stories', 'POST', fd)).status === 400, 'API accepted non-audio MIME type.');
    fd = new FormData(); fd.append('originalLanguage', 'Test language'); fd.append('audio', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/wav' }), 'oversize.wav');
    ensure((await direct(ownerA, '/api/stories', 'POST', fd)).status === 413, 'API accepted audio over 10 MB.');
  }, haveStory);

  await record('Public approval is visible to B and hidden author is absent from API and UI', async () => {
    await pageA.getByRole('radio', { name: 'Anyone who opens this app' }).check();
    await pageA.getByRole('button', { name: 'Approve and share' }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    const publicOwner = await direct(ownerA, `/api/stories/${storyId}`); ensure(publicOwner.body.status === 'shared' && publicOwner.body.visibility === 'public', 'Public approval did not apply.');
    ensure((await direct(ownerA, `/api/stories/${storyId}/audio`)).status === 200, 'Owner could not read public audio.');
    const bList = await direct(ownerB, '/api/stories'); ensure(bList.body.some(s => s.id === storyId), 'Public story absent from B list.');
    await pageB.reload(); await pageB.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageB.getByRole('button', { name: /Anonymous/ }).first().click(); await pageB.getByRole('heading', { name: 'Anonymous' }).waitFor();
    ensure(!(await pageB.getByText('Synthetic Hidden Author', { exact: false }).count()), 'Hidden author name appeared in public UI.');
    ensure(await pageB.getByText('Synthetic test story edited by owner A.').isVisible(), 'Original text is not visible.');
    ensure(await pageB.getByRole('button', { name: 'View translation' }).isVisible(), 'Translation view control missing.');
    await pageB.getByRole('button', { name: 'View translation' }).click();
    await pageB.getByText('Translation entered by the author').waitFor({state:'visible'});
    await pageB.getByText('Checked by Synthetic Reviewer, as stated by the author').waitFor({state:'visible'});
    const publicResponse = await direct(ownerB, `/api/stories/${storyId}`);
    ensure(!Object.hasOwn(publicResponse.body, 'storytellerName') && !publicResponse.text.includes('Synthetic Hidden Author'), 'Hidden author included in non-owner API response.');
    const publicAudio = await direct(ownerB, `/api/stories/${storyId}/audio`); ensure(publicAudio.status === 200, 'B public audio access failed.');
    await pageA.getByRole('button', { name: 'Listen', exact: true }).click(); await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
    await pageA.getByText('Synthetic test story edited by owner A.').waitFor({state:'visible'});
    for (const width of [1280, 390]) { const shot = await captureScreen(pageA, 'listen-public', width); results.push({ name: `Listen screenshot ${width}px`, status: 'PASS', evidence: path.relative(root, shot.file), bottomEvidence: path.relative(root, shot.bottomFile), detail: JSON.stringify(shot.metrics) }); }
  }, haveStory && results.find(x => x.name === 'Valid WAV upload, owner/private/public audio authorization, and playback attempt')?.status === 'PASS');

  await record('Withdrawal removes story and audio from B immediately; downloaded copies are outside this test', async () => {
    await pageA.getByRole('button', { name: 'My stories', exact: true }).click(); await pageA.getByRole('heading', { name: 'My stories' }).waitFor();
    await pageA.getByRole('button', { name: 'Withdraw', exact: true }).click();
    const list = await direct(ownerB, '/api/stories'); ensure(!list.body.some(s => s.id === storyId), 'Withdrawn story remains in B list.');
    ensure((await direct(ownerB, `/api/stories/${storyId}`)).status === 404, 'B read withdrawn story.');
    ensure((await direct(ownerB, `/api/stories/${storyId}/audio`)).status === 404, 'B read withdrawn audio.');
  }, haveStory && results.find(x => x.name === 'Public approval is visible to B and hidden author is absent from API and UI')?.status === 'PASS');

  await record('Reload and isolated API restart preserve test data', async () => {
    await stop(apiServer); await startApi();
    await pageA.reload(); await pageA.getByRole('heading', { name: 'Listen' }).waitFor();
    ensure((await pageA.evaluate(() => localStorage.getItem('story-bridge-owner'))) === ownerA, 'A owner token did not survive page reload.');
    const mine = await direct(ownerA, '/api/mine'); const persisted = mine.body.find(s => s.id === storyId);
    ensure(persisted && persisted.status === 'withdrawn' && persisted.translation === 'Edited manual test translation.' && persisted.text === 'Synthetic test story edited by owner A.', 'Test record did not persist across isolated server restart.');
    ensure(!(await direct(ownerB, '/api/stories')).body.some(s => s.id === storyId), 'Restart exposed withdrawn story.');
  }, haveStory && results.find(x => x.name === 'Withdrawal removes story and audio from B immediately; downloaded copies are outside this test')?.status === 'PASS');

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
} catch (error) {
  if (!(error instanceof FocusedPreviewComplete)) {
    ok = false;
    const detail = String(error?.message || error).replace(/[0-9a-f]{64,}/gi, '[redacted token-like value]');
    process.stderr.write(`SUITE BLOCKER — ${detail}\n`);
  }
} finally {
  await stop(apiServer); await stop(viteServer);
  if (browser) await browser.close();
  const report = { runId, apiPort, webPort, isolatedData: path.relative(root, dataDir), isolatedUploads: path.relative(root, uploadsDir), evidence: path.relative(root, evidenceDir), results };
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`Evidence directory: ${path.relative(root, evidenceDir)}\n`);
  for (const result of results) if (result.status === 'FAIL') ok = false;
}
if (!storyId && !recorderPreviewOnly) ok = false;
if (!ok) process.exitCode = 1;
