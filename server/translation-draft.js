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

export function createTranslationDraftService({ getApiKey = () => process.env.OPENAI_API_KEY, fetchImpl = globalThis.fetch, model = () => process.env.OPENAI_TRANSLATION_MODEL || 'gpt-6-luna' } = {}) {
  return async function draftTranslation({ text, originalLanguage, targetLanguage }) {
    const apiKey = getApiKey();
    if (!apiKey) throw new TranslationDraftError('AI_NOT_CONFIGURED', 503, 'AI translation is not configured. You can write the translation yourself.');
    if (typeof text !== 'string' || !text.trim() || text.length > 12_000 || typeof originalLanguage !== 'string' || !originalLanguage.trim() || originalLanguage.length > 80 || typeof targetLanguage !== 'string' || !targetLanguage.trim() || targetLanguage.length > 80) {
      throw new TranslationDraftError('INVALID_INPUT', 400, 'Enter the original story, its language, and a target language.');
    }
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: model(),
          input: [
            { role: 'system', content: [{ type: 'input_text', text: prompt }] },
            { role: 'user', content: [{ type: 'input_text', text: `Original language: ${originalLanguage}\nTarget language: ${targetLanguage}\n\nOriginal story:\n${text}` }] },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('provider-error');
      const data = await response.json();
      const output = typeof data.output_text === 'string' ? data.output_text : (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
      if (typeof output !== 'string' || !output.trim() || output.length > 12_000) throw new Error('provider-error');
      return output.trim();
    } catch {
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
