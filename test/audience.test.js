import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audienceFields, audienceFromStory, audienceLine, requestedAudienceFromStory } from '../src/audience.js';

const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const fr = JSON.parse(readFileSync(new URL('../src/locales/fr.json', import.meta.url), 'utf8'));
const translate = locale => key => locale[key] ?? en[key] ?? key;
const socialCss = readFileSync(new URL('../src/styles/components/social.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../src/styles/components/app.css', import.meta.url), 'utf8');
const landingCss = readFileSync(new URL('../src/styles/components/landing.css', import.meta.url), 'utf8');
const homeCss = readFileSync(new URL('../src/styles/components/home.css', import.meta.url), 'utf8');
const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function contrastRatio(foreground, background) {
  const luminance = color => {
    const channels = color.match(/[0-9a-f]{2}/gi).map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  };
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('audience choices map to the existing visibility and access fields', () => {
  assert.deepEqual(audienceFields('public'), { visibility:'public', access:'Public', requestedVisibility:'public' });
  assert.deepEqual(audienceFields('members'), { visibility:'public', access:'Community only', requestedVisibility:'public' });
  assert.deepEqual(audienceFields('private'), { visibility:'private', access:'Public', requestedVisibility:'private' });
  assert.throws(() => audienceFields('followers'), /valid audience/i);
});

test('audience summaries distinguish actual visibility from a first post awaiting approval', () => {
  assert.equal(audienceFromStory({ visibility:'public', access:'Community only' }), 'members');
  assert.equal(requestedAudienceFromStory({ visibility:'private', requestedVisibility:'public', access:'Community only' }), 'members');
  const pending = { visibility:'private', requestedVisibility:'public', access:'Community only', moderationStatus:'pending_review' };
  assert.equal(audienceLine(pending, translate(en)), 'Who can see this: Only me (until a moderator approves it as Members only)');
  assert.equal(audienceLine({ visibility:'private' }, translate(en)), 'Who can see this: Only me');
  assert.equal(audienceLine({ visibility:'public', access:'Public' }, translate(fr)), 'Qui peut voir cette histoire : Public');
});

test('mobile feed widths are constrained and main clears the fixed navigation', () => {
  assert.ok(socialCss.includes('.feed-layout,.feed-column,.feed-list,.post,.post-images,.post-images figure{box-sizing:border-box;min-width:0;max-width:100%}'));
  assert.ok(socialCss.includes('.feed-region{display:block;width:100%;min-width:0;max-width:100%}'));
  assert.ok(socialCss.includes('.feed-region select{display:block;width:100%;min-width:0;max-width:100%}'));
  assert.ok(appCss.includes('.app>main{padding-bottom:calc(74px + env(safe-area-inset-bottom))}'));
  assert.ok(appCss.includes('padding:4px 5px calc(4px + env(safe-area-inset-bottom))'));
});

test('mobile region selector has an inset visible caret and footers meet AA contrast', () => {
  assert.match(socialCss,/\.feed-region select\{[^}]*appearance:none/);
  assert.match(socialCss,/\.feed-region select\{[^}]*padding:7px 42px/);
  assert.match(socialCss,/\.feed-region select\{[^}]*background-image:linear-gradient/);
  const token = name => tokensCss.match(new RegExp(`${name}:([^;]+)`))?.[1];
  const paper=token('--paper'),deep=token('--forest-deep'),ink=token('--ink');
  assert.ok(contrastRatio(paper,deep)>=4.5,'Landing footer text and links must meet WCAG AA.');
  assert.match(homeCss,/\.home-footer\{[^}]*color:var\(--paper\)/);
  assert.match(homeCss,/\.home-footer a\{color:var\(--paper\)\}/);
  assert.match(landingCss,/\.app>footer\{color:var\(--ink\)/);
  assert.ok(contrastRatio(ink,paper)>=4.5,'Application footer text must meet WCAG AA.');
});
