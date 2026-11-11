const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ADMIN_URL = 'https://story-bridge.onrender.com/admin';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function isAdminNotifyConfigured(env = process.env) {
  return ['RESEND_API_KEY', 'NOTIFY_FROM', 'ADMIN_NOTIFY_EMAIL']
    .every(key => typeof env?.[key] === 'string' && env[key].trim());
}

export function createAdminEmail({ subject, lines = [], actionLabel = 'Review now' }) {
  const safeSubject = String(subject || 'Story Bridge notification');
  const safeLines = Array.isArray(lines) ? lines.map(value => String(value ?? '')) : [];
  const text = `${safeSubject}\n\n${safeLines.join('\n')}${safeLines.length ? '\n\n' : ''}${actionLabel}: ${ADMIN_URL}`;
  const paragraphs = safeLines.map(line => `<p style="margin:0 0 12px;color:#263b32;line-height:1.6">${escapeHtml(line)}</p>`).join('');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f4ec;font-family:Arial,sans-serif;color:#263b32"><div style="max-width:600px;margin:0 auto"><div style="padding:18px 22px;background:#1F4D3A;color:#fff;font-size:20px;font-weight:700">Story Bridge</div><div style="padding:24px;background:#fff"><h1 style="margin:0 0 18px;color:#1F4D3A;font-size:22px">${escapeHtml(safeSubject)}</h1>${paragraphs}<p style="margin:22px 0 0"><a href="${ADMIN_URL}" style="display:inline-block;padding:12px 18px;background:#1F4D3A;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(actionLabel)}</a></p></div></div></body></html>`;
  return { subject: safeSubject, text, html };
}

function logStatus(logger, status) {
  try { logger(JSON.stringify({ adminNotify: status })); } catch { /* logging must not affect requests */ }
}

export async function notifyAdmin({ subject, text, html } = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  timeoutMs = 10_000,
} = {}) {
  if (!isAdminNotifyConfigured(env)) return 'skipped';
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
      timer.unref?.();
    });
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.NOTIFY_FROM, to: env.ADMIN_NOTIFY_EMAIL, subject: String(subject || ''), text: String(text || ''), html: String(html || '') }),
        signal: controller.signal,
      })),
      timeout,
    ]);
    const status = response === null ? 'timeout' : response.ok ? 'sent' : 'failed';
    logStatus(logger, status);
    return status;
  } catch {
    logStatus(logger, 'failed');
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

const queuedEvents = new Set();

export function scheduleAdminNotification(eventKey, createMessage, options = {}) {
  try {
    if (!isAdminNotifyConfigured(options.env || process.env) || queuedEvents.has(eventKey)) return;
    queuedEvents.add(eventKey);
    void Promise.resolve()
      .then(() => typeof createMessage === 'function' ? createMessage() : createMessage)
      .then(message => notifyAdmin(message, options))
      .catch(() => logStatus(options.logger || console.log, 'failed'));
  } catch {
    logStatus(options.logger || console.log, 'failed');
  }
}
