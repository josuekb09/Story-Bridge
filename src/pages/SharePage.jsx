import RecordingCapture from '../RecordingCapture.jsx';
import { useEffect, useState } from 'react';
import AuthorAvatar from '../components/AuthorAvatar.jsx';
import { LANGUAGES } from '../lib/languages.js';
import UnsavedAudioPreview from '../components/UnsavedAudioPreview.jsx';
import { createImageDetails, mapShareSubmissionError, shareFieldId, validateShareStep } from '../share-validation.js';

export default function SharePage({ objectContext, form, setForm, change, postMeta, setPostMeta, file, fileKind, audioSaved, saving, captureBusy, onAudioChange, onCaptureBusyChange, shareStep, setShareStep, postImages, setPostImages, imageDetails, setImageDetails, translationBusy, translationError, requestTranslationDraft, translationApprovalCanContinue, createDraft, profileName = '', profileAvatar = '', onEditProfile = () => {}, submissionError = '', clearSubmissionError = () => {} }) {
  const [otherLanguageMode, setOtherLanguageMode] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const languageSuggestions = [...new Set(LANGUAGES.flatMap(({ name, nativeName }) => [name, nativeName]))];

  function focusField(field) {
    const element = document.getElementById(shareFieldId(field, otherLanguageMode));
    if (!element) return;
    element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    element.focus?.({ preventScroll: true });
  }

  function focusAfterRender(field) {
    const focus = () => requestAnimationFrame(() => focusField(field));
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus);
    else setTimeout(() => focusField(field), 0);
  }

  useEffect(() => {
    if (!submissionError) return;
    const mapped = mapShareSubmissionError(submissionError);
    if (mapped) {
      const imageMetadataError = /add alt text and credit|every image needs/i.test(submissionError);
      const field = mapped.field === 'images' && imageMetadataError && postImages.length ? 'image-credit-0' : mapped.field;
      setFormError('');
      setFieldErrors({ [field]: mapped.message });
      setShareStep(mapped.step);
      focusAfterRender(field);
    } else {
      setFormError(submissionError);
    }
    clearSubmissionError();
  }, [submissionError]);

  function clearFieldError(field) {
    setFieldErrors(previous => {
      if (!(field in previous)) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
    setFormError('');
  }

  function setStepError(errors, step) {
    const firstField = Object.keys(errors)[0];
    setFormError('');
    setFieldErrors(errors);
    setShareStep(step);
    if (firstField) focusAfterRender(firstField);
  }

  function valuesForValidation() {
    return {
      originalLanguage: form.originalLanguage,
      title: postMeta.title,
      text: form.text,
      hasAudio: !!file,
      consentConfirmed: postMeta.consentConfirmed,
      postImages,
      imageDetails,
      region: postMeta.region,
      people: postMeta.people,
      tags: postMeta.tags,
      sources: postMeta.sources,
    };
  }

  function continueFromLanguage() {
    const errors = validateShareStep(1, valuesForValidation());
    if (Object.keys(errors).length) return setStepError(errors, 1);
    clearSubmissionError();
    setFieldErrors({});
    setShareStep(2);
  }

  function continueFromStory() {
    const errors = validateShareStep(2, valuesForValidation());
    if (Object.keys(errors).length) return setStepError(errors, 2);
    clearSubmissionError();
    setFieldErrors({});
    setShareStep(3);
  }

  function continueToReview() {
    if (!translationApprovalCanContinue(form)) {
      setStepError({ translationApproval: 'Approve the AI translation before continuing.' }, 3);
      return;
    }
    clearSubmissionError();
    setFieldErrors({});
    setShareStep(4);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const checks = [
      [1, validateShareStep(1, valuesForValidation())],
      [2, validateShareStep(2, valuesForValidation())],
      [4, validateShareStep(4, valuesForValidation())],
    ];
    const invalid = checks.find(([, errors]) => Object.keys(errors).length);
    if (invalid) return setStepError(invalid[1], invalid[0]);
    if (!translationApprovalCanContinue(form)) {
      setStepError({ translationApproval: 'Approve the AI translation before saving.' }, 3);
      return;
    }
    clearSubmissionError();
    setFieldErrors({});
    setFormError('');
    createDraft(event);
  }

  function fieldError(field) {
    const message = fieldErrors[field];
    if (!message) return null;
    return <p className="field-error" id={`share-error-${field}`} role="alert">{message}</p>;
  }

  function updateMeta(key, value) {
    clearFieldError(key);
    setPostMeta(previous => ({ ...previous, [key]: value }));
  }

  return <main>
    <p className="eyebrow">Create a story</p><h1>Share a story</h1><p className="intro">Your story remains private until you review and explicitly approve it.</p>
    {objectContext && <section className="object-context"><b>Adding a speaker’s voice to</b><p>{objectContext.title}</p><p>{objectContext.region}</p>{objectContext.question && <p><b>Question:</b> {objectContext.question}</p>}<p>Write your own words. They will be saved as a separate story with your name choice and story record.</p></section>}
    <ol className="share-progress" aria-label="Story creation progress">{['Language','Tell','Translate','Review'].map((label,index) => <li key={label} aria-current={shareStep === index + 1 ? 'step' : undefined} className={shareStep >= index + 1 ? 'step-done' : ''}><span>{index + 1}</span>{label}</li>)}</ol>
    <form onSubmit={handleSubmit} className="form" aria-busy={saving} noValidate>
      {shareStep === 1 && <>
        <label>Language told in<input id={otherLanguageMode ? 'share-language-choice' : 'share-language'} list="story-language-options" autoComplete="off" value={otherLanguageMode ? 'Other' : form.originalLanguage} onChange={event => { clearFieldError('language'); if (event.target.value === 'Other') { setOtherLanguageMode(true); change('originalLanguage', ''); } else { setOtherLanguageMode(false); change('originalLanguage', event.target.value); } }} maxLength="80" placeholder="Start typing: Tshiluba, isiZulu, Kiswahili…" aria-invalid={!!fieldErrors.language} aria-describedby={fieldErrors.language ? 'share-error-language' : undefined}/></label>{!otherLanguageMode && fieldError('language')}
        <datalist id="story-language-options">{languageSuggestions.map(language => <option key={language} value={language}/>)}<option value="Other"/></datalist>
        {otherLanguageMode && <><label>Enter your language<input id="share-language-other" autoComplete="off" value={form.originalLanguage} onChange={event => { clearFieldError('language'); change('originalLanguage', event.target.value); }} maxLength="80" placeholder="Your language name" aria-invalid={!!fieldErrors.language} aria-describedby={fieldErrors.language ? 'share-error-language' : undefined}/></label>{fieldError('language')}</>}
        <p className="muted">Not in the list? Choose Other or type your language’s name.</p><p className="muted">Your original language stays attached to the first version.</p>
        <button type="button" className="primary" onClick={continueFromLanguage}>Continue to your story</button>
      </>}
      {shareStep === 2 && <>
        <label>Post title<input id="share-title" maxLength="160" value={postMeta.title} onChange={event => updateMeta('title', event.target.value)} aria-invalid={!!fieldErrors.title} aria-describedby={fieldErrors.title ? 'share-error-title' : undefined}/></label>{fieldError('title')}
        <label>Post type<select id="share-kind" value={postMeta.kind} onChange={event => updateMeta('kind', event.target.value)}>{[['story','Story'],['object','Object'],['language','Language'],['music','Music'],['tradition','Tradition'],['place','Place']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>{fieldError('kind')}
        <label>Section<select id="share-section" value={postMeta.section} onChange={event => updateMeta('section', event.target.value)}>{[['stories','Stories'],['objects-art','Objects and art'],['languages-proverbs','Languages and proverbs'],['music-dance','Music and dance'],['traditions-daily-life','Traditions and daily life'],['places-history','Places and history']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>{fieldError('section')}
        <div className="prompt-chips"><span>Try a prompt</span>{['Tell us about a meal you remember','A sound from home','A time a neighbour helped'].map(prompt => <button type="button" key={prompt} className="secondary" onClick={() => change('text',`${form.text}${form.text?'\n\n':''}${prompt}: `)}>{prompt}</button>)}</div>
        <label>Your story<textarea id="share-text" value={form.text} onChange={event => { clearFieldError('text'); change('text', event.target.value); }} maxLength="12000" rows="7" placeholder="Write in your own words" aria-invalid={!!fieldErrors.text} aria-describedby={fieldErrors.text ? 'share-error-text' : undefined}/></label>{fieldError('text')}
        <RecordingCapture file={file} fileKind={fileKind} saved={audioSaved} disabled={saving} language={form.originalLanguage} onTranscript={value => { clearFieldError('text'); change('text', value); }} onChange={onAudioChange} onBusyChange={onCaptureBusyChange}/>
        <label>Images (up to 6, JPEG/PNG/WebP; 8 MB each)<input id="share-images" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-invalid={!!fieldErrors.images} aria-describedby={fieldErrors.images ? 'share-error-images' : undefined} onChange={event => { const selected = [...event.target.files].slice(0,6); setPostImages(selected); setImageDetails(createImageDetails(selected.length, profileName)); clearFieldError('images'); setFieldErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'images' && !key.startsWith('image-')))); }}/></label>{fieldError('images')}
        {postImages.map((image,index) => <fieldset className="image-details" key={index}><legend>Image {index + 1}</legend>
          <label>Alt text <span className="muted">Describe the photo for people who can't see it (recommended)</span><input id={`share-image-alt-${index}`} maxLength="500" value={imageDetails[index]?.altText || ''} onChange={event => { clearFieldError(`image-alt-${index}`); setImageDetails(items => items.map((item,i) => i === index ? {...item,altText:event.target.value} : item)); }} aria-invalid={!!fieldErrors[`image-alt-${index}`]} aria-describedby={fieldErrors[`image-alt-${index}`] ? `share-error-image-alt-${index}` : undefined}/></label>{fieldError(`image-alt-${index}`)}
          <label>Credit<input id={`share-image-credit-${index}`} maxLength="240" value={imageDetails[index]?.credit || ''} onChange={event => { clearFieldError(`image-credit-${index}`); setImageDetails(items => items.map((item,i) => i === index ? {...item,credit:event.target.value} : item)); }} aria-invalid={!!fieldErrors[`image-credit-${index}`]} aria-describedby={fieldErrors[`image-credit-${index}`] ? `share-error-image-credit-${index}` : undefined}/></label>{fieldError(`image-credit-${index}`)}
        </fieldset>)}
        <label>Region (optional)<input id="share-region" maxLength="120" value={postMeta.region} onChange={event => updateMeta('region', event.target.value)} aria-invalid={!!fieldErrors.region} aria-describedby={fieldErrors.region ? 'share-error-region' : undefined}/></label>{fieldError('region')}
        <label>People (optional)<input id="share-people" maxLength="180" value={postMeta.people} onChange={event => updateMeta('people', event.target.value)} aria-invalid={!!fieldErrors.people} aria-describedby={fieldErrors.people ? 'share-error-people' : undefined}/></label>{fieldError('people')}
        <label>Tags (comma separated)<input id="share-tags" value={postMeta.tags} onChange={event => updateMeta('tags', event.target.value)} aria-invalid={!!fieldErrors.tags} aria-describedby={fieldErrors.tags ? 'share-error-tags' : undefined}/></label>{fieldError('tags')}
        <label>Sources (one per line: label | https://…)<textarea id="share-sources" value={postMeta.sources} onChange={event => updateMeta('sources', event.target.value)} rows="3" aria-invalid={!!fieldErrors.sources} aria-describedby={fieldErrors.sources ? 'share-error-sources' : undefined}/></label>{fieldError('sources')}
        <label>Trust label<select id="share-trustLabel" value={postMeta.trustLabel} onChange={event => updateMeta('trustLabel', event.target.value)}>{['Told by a community member','Research note','Museum record'].map(value => <option key={value}>{value}</option>)}</select></label>{fieldError('trustLabel')}
        <label>Licence<select id="share-licence" value={postMeta.licence} onChange={event => updateMeta('licence', event.target.value)}>{['All rights reserved','CC BY 4.0','CC BY-SA 4.0'].map(value => <option key={value}>{value}</option>)}</select></label>{fieldError('licence')}
        <button type="button" className="primary" disabled={captureBusy} onClick={continueFromStory}>Continue to translation</button>
      </>}
      {shareStep === 3 && <>
        <p className="muted">A translation is optional. The original remains unchanged and is always shown first.</p>
        <label>Translation language (optional)<input value={form.translationLanguage} onChange={event => change('translationLanguage', event.target.value)} maxLength="80" placeholder="Optional"/></label>
        <label>Your translation or AI draft<textarea aria-label="Your translation or AI draft" value={form.translation} onChange={event => { clearFieldError('translationApproval'); change('translation', event.target.value); }} maxLength="12000" rows="6"/></label>
        {form.translationOrigin === 'ai_draft' && <><p className="notice" role="status">AI draft: {form.translationApproved ? 'approved by you' : 'not yet approved by you'}</p><div className="actions"><button id="share-translation-approve" type="button" className="primary" disabled={!form.translation.trim()} onClick={() => { clearFieldError('translationApproval'); setForm(previous => ({ ...previous, translationApproved:true })); }}>Approve translation</button><button type="button" className="secondary" onClick={() => { clearFieldError('translationApproval'); setForm(previous => ({ ...previous, translationOrigin:'storyteller', translationApproved:false })); }}>Write this translation yourself</button></div>{fieldError('translationApproval')}</>}
        {form.translation && form.translationOrigin === 'storyteller' && <p className="notice">Written by the storyteller.</p>}
        <p className="muted ai-consent">If enabled, this sends the original text to OpenAI to draft a translation. It is not saved by Story Bridge until you approve it and save your story.</p>
        <button type="button" className="secondary" disabled={translationBusy || !form.text.trim() || !form.originalLanguage.trim() || !form.translationLanguage.trim()} onClick={requestTranslationDraft}>{translationBusy ? 'Drafting translation…' : 'Draft with AI'}</button>
        {translationError && <div className="field-error" role="alert">{translationError}</div>}
        <button type="button" className="primary" disabled={translationBusy} onClick={continueToReview}>Continue to review</button>
      </>}
      {shareStep === 4 && <>
        <section className="review-summary"><h2>{postMeta.title}</h2><p className="notice">{postMeta.trustLabel}</p><h3>Original · {form.originalLanguage}</h3><p className="story-text">{form.text || 'Audio recording only'}</p>{file && <UnsavedAudioPreview file={file} fileKind={fileKind}/>} {form.translation && <div><h3>{form.translationOrigin === 'ai_draft' ? (form.translationApproved ? 'AI draft approved by you' : 'AI draft: not yet approved by you') : 'Written by the storyteller'} · {form.translationLanguage}</h3><p className="story-text">{form.translation}</p></div>}</section>
        <fieldset className="share-author-choice"><legend>Author</legend><div className="share-author"><AuthorAvatar story={{author:{name:profileName||'Community member',anonymous:!profileName}}} avatarUrl={profileAvatar||undefined} size="small"/>{profileName ? <b>Posting as {profileName}</b> : <a href="/profile" onClick={event => { event.preventDefault(); onEditProfile(); }}>Add your name in your profile</a>}</div><label className="check"><input type="checkbox" checked={!!form.postAsCommunityMember} onChange={event => change('postAsCommunityMember',event.target.checked)}/> Post as Community member instead (hide my name and photo on this post)</label></fieldset>
        <label>Access<select id="share-access" value={postMeta.access} onChange={event => updateMeta('access', event.target.value)}><option>Public</option><option>Community only</option></select></label>{fieldError('access')}
        <label className="check"><input id="share-consent" type="checkbox" checked={postMeta.consentConfirmed} onChange={event => updateMeta('consentConfirmed', event.target.checked)} aria-invalid={!!fieldErrors.consent} aria-describedby={fieldErrors.consent ? 'share-error-consent' : undefined}/> This is mine, or I have permission from the person telling it. I follow the <a href="/guidelines">community guidelines</a>.</label>{fieldError('consent')}
        <p className="consent-copy">Nothing becomes public until you review and explicitly approve it. You can withdraw this post at any time. Its fingerprint and version record remain attached.</p>
        <div className="actions"><button type="button" className="secondary" onClick={() => setShareStep(3)}>Back to translation</button><button type="submit" className="primary" disabled={captureBusy || saving}>{saving ? 'Saving draft…' : 'Save draft and open review'}</button></div>
        {formError && <p className="field-error" role="alert">{formError}</p>}
      </>}
    </form>
  </main>;
}
