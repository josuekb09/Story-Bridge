import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.STORY_SKIP_DOTENV = '1';
const { parseEnvValue, loadLocalEnv } = await import('../server/env.js');

test('env values tolerate trailing spaces, inline comments and quotes', () => {
  assert.equal(parseEnvValue('true '), 'true');
  assert.equal(parseEnvValue(' true\t'), 'true');
  assert.equal(parseEnvValue('true # enable Google'), 'true');
  assert.equal(parseEnvValue('"a # kept "'), 'a # kept ');
  assert.equal(parseEnvValue("'x'"), 'x');
  assert.equal(parseEnvValue(''), '');
  assert.equal(parseEnvValue('sb_key#notacomment'), 'sb_key#notacomment');
});

test('env loader strips a UTF-8 BOM and CRLF endings', () => {
  fs.mkdirSync('_tmp', { recursive: true });
  const folder = fs.mkdtempSync(path.join('_tmp', 'env-bom-'));
  const file = path.join(folder, 'bom.env');
  fs.writeFileSync(file, '﻿STORY_TEST_BOM_A=true \r\nexport STORY_TEST_BOM_B = yes # note\r\n');
  delete process.env.STORY_TEST_BOM_A; delete process.env.STORY_TEST_BOM_B;
  try {
    loadLocalEnv(file);
    assert.equal(process.env.STORY_TEST_BOM_A, 'true');
    assert.equal(process.env.STORY_TEST_BOM_B, 'yes');
  } finally {
    delete process.env.STORY_TEST_BOM_A; delete process.env.STORY_TEST_BOM_B;
  }
});
