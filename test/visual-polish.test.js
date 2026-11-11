import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorAvatarFallback, authorAvatarSource } from '../src/lib/author-avatar.js';
import { preloadImage } from '../src/lib/preload-image.js';

const socialCss = readFileSync(new URL('../src/styles/components/social.css', import.meta.url), 'utf8');
const avatarCss = readFileSync(new URL('../src/styles/components/author-identity.css', import.meta.url), 'utf8');
const avatarComponent = readFileSync(new URL('../src/components/AuthorAvatar.jsx', import.meta.url), 'utf8');
const landingPage = readFileSync(new URL('../src/pages/LandingPage.jsx', import.meta.url), 'utf8');

test('mobile feed cards render fully opaque without the entry fade', () => {
  assert.match(socialCss, /@media\s*\(max-width:\s*520px\)\s*\{[^}]*\.feed-list>\.post\{animation:none;opacity:1;transform:none\}/);
});

test('named authors keep initials visible until their photo loads, while anonymous posts stay generic', () => {
  assert.deepEqual(authorAvatarFallback({ author: { name: 'Josué Kabuya' } }), { type: 'initials', text: 'JK' });
  assert.deepEqual(authorAvatarFallback({ author: { name: 'Community member', anonymous: true } }), { type: 'placeholder' });
  assert.equal(authorAvatarSource({ title: 'My story' }, 'blob:profile-photo'), 'blob:profile-photo');
  assert.equal(authorAvatarSource({ author: { name: 'Community member', anonymous: true } }, 'blob:profile-photo'), undefined);
  assert.match(avatarComponent, /author-avatar-frame/);
  assert.match(avatarComponent, /onLoad=\{\(\) => setImageState\(\{ source, loaded: true/);
  assert.match(avatarCss, /\.author-avatar-frame>\.author-avatar-image\{[^}]*opacity:0/);
  assert.match(avatarCss, /\.author-avatar-frame>\.author-avatar-image\.is-loaded\{opacity:1\}/);
});

test('hero image selection waits for a responsive image to load and decode', async () => {
  class FakeImage {
    static instances = [];
    constructor() { FakeImage.instances.push(this); this.complete = false; this.naturalWidth = 0; }
    decode() { this.decoded = true; return Promise.resolve(); }
  }
  const pending = preloadImage({ src: '/hero.webp', srcset: '/hero-640.webp 640w, /hero-1280.webp 1280w', sizes: '100vw' }, FakeImage);
  const image = FakeImage.instances[0];
  let resolved = false;
  pending.then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(image.src, '/hero.webp');
  assert.equal(image.srcset, '/hero-640.webp 640w, /hero-1280.webp 1280w');
  assert.equal(image.sizes, '100vw');
  image.complete = true;
  image.naturalWidth = 1280;
  image.onload();
  await pending;
  assert.equal(image.decoded, true);
  assert.match(landingPage, /preloadImage\(\{ src: slide\.image\.src, srcset: slide\.image\.srcset, sizes: '100vw' \}\)/);
  assert.match(landingPage, /const current = loadedSlides\.has\(index\) \? slides\[index\] : null/);
});

test('a failed hero image does not resolve as a selectable slide', async () => {
  class FakeImage {
    static instance;
    constructor() { FakeImage.instance = this; this.complete = false; this.naturalWidth = 0; }
  }
  const pending = preloadImage({ src: '/missing.webp' }, FakeImage);
  FakeImage.instance.onerror();
  await assert.rejects(pending, /failed to load/i);
});
