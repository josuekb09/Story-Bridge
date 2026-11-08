import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostMetadata, validateAndReencodeImage, validateImageMetadata, validatePostMetadata, IMAGE_MAX_BYTES } from '../server/post-content.js';

const valid={title:'A remembered meal',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'CC BY 4.0',region:'Kasai',people:'Luluwa',tags:'food, memory',sources:'[{"label":"Source","url":"https://example.org/record"}]',access:'Public',consentConfirmed:'true'};

test('post metadata requires consent, valid source URLs, and normalized documentation fields',()=>{
  assert.equal(validatePostMetadata(valid),'');
  assert.match(validatePostMetadata({...valid,consentConfirmed:'false'}),/permission/);
  assert.match(validatePostMetadata({...valid,sources:'[{"label":"x","url":"javascript:alert(1)"}]'}),/HTTPS/);
  const post=normalizePostMetadata(valid);assert.equal(post.title,valid.title);assert.equal(post.trust_label,valid.trustLabel);assert.deepEqual(post.tags,['food','memory']);assert.equal(post.consent_confirmed,true);
});

test('image upload rejects false signatures, oversized files and re-encodes valid JPEG as metadata-free WebP',async()=>{
  assert.equal(IMAGE_MAX_BYTES,8*1024*1024);
  await assert.rejects(()=>validateAndReencodeImage(Buffer.from('not an image')),/invalid-image/);
  await assert.rejects(()=>validateAndReencodeImage(Buffer.alloc(IMAGE_MAX_BYTES+1,0)),/image-too-large/);
  const sharp=(await import('sharp')).default;
  const jpeg=await sharp({create:{width:8,height:5,channels:3,background:'#c4663f'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'Synthetic fixture'}}}).toBuffer();
  const result=await validateAndReencodeImage(jpeg);assert.equal(result.mime,'image/webp');assert.equal(result.width,8);assert.equal(result.height,5);assert.match(result.sha256,/^[a-f0-9]{64}$/);
  const metadata=await sharp(result.buffer).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);
});

test('image alt text is required for every uploaded image',()=>{
  assert.match(validateImageMetadata([{}],[{}]),/alt text and credit/);
  assert.equal(validateImageMetadata([{}],[{altText:'A carved figure',credit:'Museum, licence CC BY 4.0'}]),'');
});
