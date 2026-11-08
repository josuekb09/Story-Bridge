import test from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_CODE_LENGTH, MAX_EMAIL_CODE_LENGTH, isEmailCodeComplete, normalizeEmailCode } from '../src/lib/email-code.js';

test('email OTP defaults to six digits, accepts pasted lengths through ten, and submits only at expected length', () => {
  assert.equal(EMAIL_CODE_LENGTH, 6);
  assert.equal(MAX_EMAIL_CODE_LENGTH, 10);
  for (let length = 6; length <= 10; length++) {
    const code = normalizeEmailCode(` ${'1'.repeat(length)} `);
    assert.equal(code.length, length);
    assert.equal(isEmailCodeComplete(code, length), true);
    assert.equal(isEmailCodeComplete(code, length + 1), false);
  }
  assert.equal(normalizeEmailCode('12a34 5678901'), '1234567890');
  assert.equal(isEmailCodeComplete('12345', EMAIL_CODE_LENGTH), false);
});
