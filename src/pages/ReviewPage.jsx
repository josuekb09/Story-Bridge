import { useEffect, useState } from 'react';
import AudioPlayer from '../components/AudioPlayer.jsx';
import { authorizedObjectUrl } from '../lib/api.js';
import { translationOriginLabel, useUiLanguage } from '../lib/i18n.js';
import { AUDIENCE_CHOICES, audienceLabelKey } from '../audience.js';
import { validateTranslationEntry } from '../share-validation.js';

function ReviewPhoto({ image }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true; let objectUrl = '';
    authorizedObjectUrl(image.url).then(url => { objectUrl = url; if (live) setSrc(url); else URL.revokeObjectURL(url); }).catch(() => {});
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.url]);
  return src ? <img src={src} alt={image.altText || ''} width={image.width || 640} height={image.height || 480} loading="lazy" decoding="async"/> : <p className="muted" role="status">Loading photo…</p>;
}

export default function ReviewPage({ review, setReview, saving, saveReviewEdits, checkedBy, setCheckedBy, reviewAudience, setReviewAudience, saveReview, objectContext, transitionTo, navigate }) {
  const { t } = useUiLanguage();
  const translationError = validateTranslationEntry({ originalText: review.text, originalLanguage: review.originalLanguage, translation: review.translation, translationLanguage: review.translationLanguage });
  return <main aria-busy={saving}>
    <button className="back" onClick={() => navigate('mine')}>← My stories</button><h1>Review your story</h1><section className="panel post-review-record"><h2>{review.title || 'Untitled post'}</h2><p className="trust-label">{review.trustLabel || 'Told by a community member'}</p><p>{review.kind} · {review.section} · {review.licence}</p>{review.moderationStatus === 'pending_review' && <p className="notice" role="status">Pending review by an administrator. This post remains private until approved.</p>}{review.images?.map(image => <figure key={image.id}><ReviewPhoto image={image}/><figcaption>{image.altText} · {image.credit}</figcaption></figure>)}{review.sources?.length > 0 && <><h3>Sources</h3><ul>{review.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul></>}</section>
    <section className="panel"><h2>Original story</h2><p>The original recording and text stay the main version.</p><AudioPlayer story={review} privateAudio/>{review.audio && <p className="recording-saved" role="status" aria-live="polite">Saved with your story.</p>}<label>Original text<textarea aria-label="Original text" rows="6" maxLength="12000" value={review.text} onChange={event => setReview(previous => ({ ...previous, text:event.target.value }))}/></label><button className="secondary" disabled={saving || !!translationError} onClick={() => saveReviewEdits()}>{saving ? 'Saving…' : 'Save original edit'}</button></section>
    <section className="panel"><h2>Translation</h2>
      <label>Translation language<input aria-label="Translation language" maxLength="80" value={review.translationLanguage || ''} onChange={event => setReview(previous => ({ ...previous, translationLanguage:event.target.value }))}/></label>
      <label>Translation entered by you<textarea aria-label="Translation entered by you" rows="5" maxLength="12000" value={review.translation || ''} onChange={event => setReview(previous => ({ ...previous, translation:event.target.value, translationOrigin:'storyteller' }))}/></label>
      {translationError && <p className="field-error" role="alert">{translationError}</p>}
      {review.translation && <><p>{translationOriginLabel(review.translationOrigin)} · {review.translationLanguage}</p><p className="muted">A checked label is self-declared by the author.</p><label>Speaker name<input value={checkedBy} onChange={event => setCheckedBy(event.target.value)}/></label><button className="secondary" disabled={saving || !!translationError} onClick={() => saveReviewEdits({ checkTranslation:true, checkedBy })}>{saving ? 'Saving…' : 'Mark as checked'}</button>{review.translationChecked && <div className="notice">Checked by {review.checkedBy} (self-reported)</div>}{!review.translationChecked && <div className="notice">Not yet checked by a speaker of this language</div>}</>}
      <button className="secondary" disabled={saving || !!translationError} onClick={() => saveReviewEdits()}>{saving ? 'Saving…' : 'Save translation edit'}</button>
    </section>
    <p className="muted">Illustrated video is not part of this version.</p><p className="consent-copy">Your profile name and photo appear on a public post by default. Choosing Community member hides them on this post. You can withdraw this story at any time; only explicit approval publishes it.</p><fieldset className="audience-choice"><legend>{t('audience.heading')}</legend>{AUDIENCE_CHOICES.map(choice => <label className="check audience-option" key={choice}><input type="radio" name="audience" value={choice} checked={reviewAudience === choice} onChange={() => setReviewAudience(choice)}/><span><b>{t(audienceLabelKey(choice))}</b><small>{t(`audience.${choice}Description`)}</small></span></label>)}{review.status === 'withdrawn' && <p className="muted" role="status">{reviewAudience === 'private' ? 'This approval will keep the story private to you.' : reviewAudience === 'public' ? 'This story will become public again.' : 'This story will be shared with signed-in members again.'}</p>}</fieldset>
    <div className="actions"><button className="primary" disabled={saving || !!translationError} onClick={() => saveReview(true)}>{saving ? reviewAudience === 'private' ? 'Saving…' : 'Publishing…' : review.status === 'withdrawn' && reviewAudience !== 'private' ? 'Publish again' : reviewAudience !== 'private' ? 'Approve and share' : 'Approve for only me'}</button><button className="secondary" disabled={saving || !!translationError} onClick={() => saveReview(false)}>{saving ? 'Saving draft…' : 'Save as draft'}</button></div>
    {objectContext && <button className="text-button" onClick={() => transitionTo(`object:${objectContext.id}`)}>Return to object record</button>}
  </main>;
}
