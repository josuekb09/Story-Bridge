import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const promptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prompts/translation.md');
const prompt = fs.readFileSync(promptPath, 'utf8').trim();

export class TranslationDraftError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'TranslationDraftError';
    this.code = code;
    this.status = status;
    this.publicMessage = message;
  }
}

export const isTranslationApproved = value => value === true || value === 'true';

const safeErrorCode = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : 'unknown';
const modelAccessErrors = new Set(['model_not_found', 'access_denied', 'model_access_denied', 'permission_denied', 'insufficient_permissions']);

async function providerErrorCode(response) {
  try { const body = await response.json(); return String(body?.error?.code || body?.error?.type || '').slice(0, 80); }
  catch { return ''; }
}

function canFallbackModel(response, code) {
  return response.status === 403 || modelAccessErrors.has(String(code || '').toLowerCase());
}

export function createTranslationDraftService({ getApiKey = () => process.env.OPENAI_API_KEY, fetchImpl = globalThis.fetch, model = () => process.env.OPENAI_TRANSLATION_MODEL || 'gpt-6-luna', fallbackModel = () => process.env.OPENAI_TRANSLATION_FALLBACK_MODEL || '' } = {}) {
  return async function draftTranslation({ text, originalLanguage, targetLanguage }) {
    const apiKey = getApiKey();
    if (!apiKey) throw new TranslationDraftError('AI_NOT_CONFIGURED', 503, 'AI translation is not configured. You can write the translation yourself.');
    if (typeof text !== 'string' || !text.trim() || text.length > 12_000 || typeof originalLanguage !== 'string' || !originalLanguage.trim() || originalLanguage.length > 80 || typeof targetLanguage !== 'string' || !targetLanguage.trim() || targetLanguage.length > 80) {
      throw new TranslationDraftError('INVALID_INPUT', 400, 'Enter the original story, its language, and a target language.');
    }
    let selectedModel = String(model() || 'gpt-6-luna');
    const alternateModel = String(fallbackModel() || '').trim();
    const useFallback = alternateModel && alternateModel !== selectedModel;
    const request = modelName => fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: prompt }] },
          { role: 'user', content: [{ type: 'input_text', text: `Original language: ${originalLanguage}\nTarget language: ${targetLanguage}\n\nOriginal story:\n${text}` }] },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    try {
      let response = await request(selectedModel);
      if (!response.ok) {
        let code = await providerErrorCode(response);
        console.error(JSON.stringify({ status: response.status, code: safeErrorCode(code), model: selectedModel }));
        if (!useFallback || !canFallbackModel(response, code)) throw new Error('provider-error');
        selectedModel = alternateModel;
        response = await request(selectedModel);
        if (!response.ok) {
          code = await providerErrorCode(response);
          console.error(JSON.stringify({ status: response.status, code: safeErrorCode(code), model: selectedModel }));
          throw new Error('provider-error');
        }
      }
      const data = await response.json();
      const output = typeof data.output_text === 'string' ? data.output_text : (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
      if (typeof output !== 'string' || !output.trim() || output.length > 12_000) {
        console.error(JSON.stringify({ status: response.status, code: 'invalid_response', model: model() }));
        throw new Error('provider-error');
      }
      return output.trim();
    } catch (error) {
      if (error?.message !== 'provider-error') console.error(JSON.stringify({ status: null, code: safeErrorCode(error?.cause?.code || error?.name), model: selectedModel }));
      throw new TranslationDraftError('AI_PROVIDER_UNAVAILABLE', 502, 'AI translation is temporarily unavailable. Your story has not been saved. You can write the translation yourself or retry.');
    }
  };
}

export function translationDraftHandler(draftTranslation) {
  return async (req, res) => {
    try {
      const translation = await draftTranslation(req.body || {});
      res.json({ translation, origin: 'ai_draft_unapproved' });
    } catch (error) {
      const status = error instanceof TranslationDraftError ? error.status : 502;
      const message = error instanceof TranslationDraftError ? error.publicMessage : 'AI translation is temporarily unavailable. Your story has not been saved. You can write the translation yourself or retry.';
      res.status(status).json({ error: message });
    }
  };
}
