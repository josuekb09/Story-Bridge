export const EMAIL_CODE_LENGTH = 6;
export const MAX_EMAIL_CODE_LENGTH = 10;

export function normalizeEmailCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, MAX_EMAIL_CODE_LENGTH);
}

export function isEmailCodeComplete(value, expectedLength = EMAIL_CODE_LENGTH) {
  return normalizeEmailCode(value).length === expectedLength;
}
