import React, { useCallback, useEffect, useRef, useState } from 'react';
import RecordingCapture from './RecordingCapture.jsx';

const tokenKey = 'story-bridge-owner';

function ownerToken() {
  let token = localStorage.getItem(tokenKey);
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(tokenKey, token);
  }
  return token;
}

const headers = () => ({ 'x-owner-token': ownerToken() });

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Error(data.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function AudioPlayer({ story, privateAudio = false }) {
  const audio = useRef(null);
  const [src, setSrc] = useState('');
  useEffect(() => {
    let objectUrl = '';
    let alive = true;
    if (!story?.audio) {
      setSrc('');
      return () => {};
    }
    if (privateAudio) {
      fetch(`/api/stories/${story.id}/audio`, { headers: headers() })
        .then(response => {
          if (!response.ok) throw Error('Audio unavailable');
          return response.blob();
        })
        .then(blob => {
          objectUrl = URL.createObjectURL(blob);
          if (alive) setSrc(objectUrl);
        })
        .catch(() => setSrc(''));
    } else {
      setSrc(`/api/stories/${story.id}/audio`);
    }
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [story?.id, story?.audio, privateAudio]);
  return story?.audio
    ? <audio ref={audio} controls src={src} preload="metadata">Audio playback is unavailable.</audio>
    : <p className="muted">No recording attached.</p>;
}

export default function App() {
  const [page, setPage] = useState('listen');
  const [stories, setStories] = useState([]);
  const [mine, setMine] = useState([]);
  const [current, setCurrent] = useState(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ originalLanguage: '', text: '', translationLanguage: '', translation: '', storytellerName: '', showName: false });
  const [file, setFile] = useState(null);
  const [fileKind, setFileKind] = useState('');
  const [audioSaved, setAudioSaved] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(null);
  const [reviewVisibility, setReviewVisibility] = useState('private');
  const [withdrawConfirmationId, setWithdrawConfirmationId] = useState('');
  const [checkedBy, setCheckedBy] = useState('');
  const captureBusyRef = useRef(false);

  useEffect(() => { ownerToken(); refresh(); }, []);
  useEffect(() => { captureBusyRef.current = captureBusy; }, [captureBusy]);
  useEffect(() => {
    const beforeUnload = event => {
      if (page === 'share' && (captureBusy || (file && !audioSaved))) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [page, captureBusy, file, audioSaved]);

  async function refresh() {
    try {
      setStories(await api('/api/stories'));
      setMine(await api('/api/mine'));
    } catch (cause) { setError(cause.message); }
  }

  const onCaptureBusyChange = useCallback(busy => setCaptureBusy(busy), []);
  const onAudioChange = useCallback((nextFile, kind) => {
    setFile(nextFile);
    setFileKind(kind || '');
    setAudioSaved(false);
  }, []);

  function navigate(nextPage) {
    const unsavedAudio = page === 'share' && (captureBusyRef.current || (file && !audioSaved));
    if (unsavedAudio) {
      const message = captureBusyRef.current
        ? 'A recording is in progress. Leaving will stop and discard this unsaved audio. Continue?'
        : 'You have unsaved audio. Leaving this screen will discard it. Continue?';
      if (!window.confirm(message)) return;
      setFile(null);
      setFileKind('');
      setAudioSaved(false);
    }
    setPage(nextPage);
    setError('');
    if (nextPage === 'listen' || nextPage === 'mine') refresh();
  }

  function change(key, value) { setForm(previous => ({ ...previous, [key]: value })); }

  async function createDraft(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.append(key, String(value)));
    if (file) formData.append('audio', file);
    try {
      const story = await api('/api/stories', { method: 'POST', body: formData });
      const savedAudio = !!file && !!story.audio;
      setAudioSaved(savedAudio);
      setReview({ ...story, audioSaved: savedAudio });
      setReviewVisibility(story.visibility || 'private');
      setPage('review');
      await refresh();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function update(id, body) {
    const story = await api(`/api/stories/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setReview(story);
    setCurrent(story);
    await refresh();
    return story;
  }

  function pendingReviewEdits() {
    if (!review) return {};
    const saved = current?.id === review.id ? current : null;
    const edits = {};
    if (!saved || review.text !== saved.text) edits.text = review.text;
    if (!saved || review.translation !== saved.translation) edits.translation = review.translation;
    return edits;
  }

  async function saveReviewChanges(extra = {}) {
    return update(review.id, { ...pendingReviewEdits(), ...extra });
  }

  async function saveReview(approve) {
    try {
      setError('');
      await saveReviewChanges({ visibility: reviewVisibility, approve });
      setPage('mine');
    } catch (cause) { setError(cause.message); }
  }

  function startReview(story) {
    setReview(story);
    setCurrent(story);
    setReviewVisibility(story.visibility || 'private');
    setWithdrawConfirmationId('');
    setCheckedBy(story.checkedBy || '');
    setPage('review');
  }

  async function showStory(story, own = false) {
    try {
      const fullStory = await api(`/api/stories/${story.id}`);
      setCurrent({ ...fullStory, _own: own });
      setShowTranslation(false);
      setPage('detail');
    } catch (cause) { setError(cause.message); }
  }

  return <div className="app">
    <header aria-label="Story Bridge">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('listen'); }}>
        <picture>
          <source media="(max-width: 479px)" srcSet="/assets/logo/story-bridge-mark-reverse.svg" type="image/svg+xml"/>
          <img src="/assets/logo/story-bridge-lockup-horizontal-reverse.svg" alt="Story Bridge"/>
        </picture>
      </a>
      <p>Stories in the storyteller’s own voice.</p>
    </header>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">Dismiss</button></div>}

    {page === 'listen' && <main>
      <h1>Listen</h1><p className="intro">Read stories as they were told, in the original language first.</p>
      {stories.length === 0 ? <p className="empty">No shared stories yet.</p> : <div className="cards">{stories.map(story =>
        <button className="story-card" key={story.id} onClick={() => showStory(story)}>
          <b>{story.storytellerName || 'Anonymous'}</b><span>{story.originalLanguage}</span><span>{story.text?.slice(0, 110) || 'Open story'}</span>
        </button>)}
      </div>}
    </main>}

    {page === 'detail' && current && <main>
      <button className="back" onClick={() => navigate(current._own ? 'mine' : 'listen')}>← Back</button>
      <h1>{current.storytellerName || 'Anonymous'}</h1><p className="muted">Told in {current.originalLanguage}</p>
      <section className="panel"><h2>Original story</h2><AudioPlayer story={current} privateAudio={!!current._own && current.visibility !== 'public'}/><p className="story-text">{current.text || 'No written text provided.'}</p></section>
      {current.translation && <section className="panel">
        <button className="secondary" onClick={() => setShowTranslation(value => !value)}>{showTranslation ? 'View original' : 'View translation'}</button>
        {showTranslation && <><h2>Translation entered by the author</h2><p>{current.translationLanguage}</p>
          <div className="notice">{current.translationChecked ? `Checked by ${current.checkedBy} (self-reported)` : 'Not yet checked by a speaker of this language'}</div>
          <p className="story-text">{current.translation}</p></>}
      </section>}
    </main>}

    {page === 'share' && <main>
      <h1>Share a story</h1><p className="intro">Your story remains a draft until you approve it on the review screen.</p>
      <form onSubmit={createDraft} className="form" aria-busy={saving}>
        <label>Language told in<input required value={form.originalLanguage} onChange={event => change('originalLanguage', event.target.value)} maxLength="80"/></label>
        <label>Your story<textarea value={form.text} onChange={event => change('text', event.target.value)} maxLength="12000" rows="6" placeholder="Write in your own words"/></label>
        <RecordingCapture file={file} fileKind={fileKind} saved={audioSaved} disabled={saving} onChange={onAudioChange} onBusyChange={onCaptureBusyChange}/>
        <label>Translation language (optional)<input value={form.translationLanguage} onChange={event => change('translationLanguage', event.target.value)} maxLength="80"/></label>
        <label>Translation entered by you<textarea value={form.translation} onChange={event => change('translation', event.target.value)} maxLength="12000" rows="4"/></label>
        <label>Your name (optional)<input value={form.storytellerName} onChange={event => change('storytellerName', event.target.value)} maxLength="120"/></label>
        <label className="check"><input type="checkbox" checked={form.showName} onChange={event => change('showName', event.target.checked)}/> Show my name on this story</label>
        <button type="submit" className="primary" disabled={captureBusy || saving}>{saving ? 'Saving draft…' : 'Save draft and review'}</button>
      </form>
    </main>}

    {page === 'review' && review && <main>
      <button className="back" onClick={() => navigate('mine')}>← My stories</button><h1>Review your story</h1>
      <section className="panel"><h2>Original story</h2><p>The original recording and text stay the main version.</p>
        <AudioPlayer story={review} privateAudio/>
        {review.audio && <p className="recording-saved" role="status" aria-live="polite">Saved with your story.</p>}
        <label>Original text<textarea aria-label="Original text" rows="6" maxLength="12000" value={review.text} onChange={event => setReview(previous => ({ ...previous, text: event.target.value }))}/></label>
        <button className="secondary" onClick={async () => { try { await saveReviewChanges(); } catch (cause) { setError(cause.message); } }}>Save original edit</button>
      </section>
      <section className="panel"><h2>Translation</h2>{review.translation ? <>
        <p>Translation entered by the author · {review.translationLanguage}</p>
        <textarea aria-label="Translation entered by you" rows="5" value={review.translation} onChange={event => setReview(previous => ({ ...previous, translation: event.target.value }))}/>
        <button className="secondary" onClick={async () => { try { await saveReviewChanges(); } catch (cause) { setError(cause.message); } }}>Save translation edit</button>
        <p className="muted">A checked label is self-declared by the author.</p>
        <label>Speaker name<input value={checkedBy} onChange={event => setCheckedBy(event.target.value)}/></label>
        <button className="secondary" onClick={async () => { try { await saveReviewChanges({ checkTranslation: true, checkedBy }); } catch (cause) { setError(cause.message); } }}>Mark as checked</button>
        {review.translationChecked && <div className="notice">Checked by {review.checkedBy} (self-reported)</div>}
        {!review.translationChecked && <div className="notice">Not yet checked by a speaker of this language</div>}
      </> : <p>No translation added.</p>}</section>
      <p className="muted">Illustrated video is not part of this version.</p>
      <fieldset><legend>Who can see this story?</legend>
        <label className="check"><input type="radio" name="visibility" value="private" checked={reviewVisibility === 'private'} onChange={() => setReviewVisibility('private')}/> Only me</label>
        <label className="check"><input type="radio" name="visibility" value="public" checked={reviewVisibility === 'public'} onChange={() => setReviewVisibility('public')}/> Anyone who opens this app</label>
        {review.status === 'withdrawn' && <p className="muted" role="status">{reviewVisibility === 'public' ? 'This story will become public again.' : 'This approval will keep the story private to you.'}</p>}
      </fieldset>
      <div className="actions"><button className="primary" onClick={() => saveReview(true)}>{review.status === 'withdrawn' && reviewVisibility === 'public' ? 'Publish again' : reviewVisibility === 'public' ? 'Approve and share' : 'Approve for only me'}</button><button className="secondary" onClick={() => saveReview(false)}>Save as draft</button></div>
    </main>}

    {page === 'mine' && <main>
      <h1>My stories</h1><p className="intro">Only this browser can access your drafts and private stories. Losing its owner token means losing access.</p>
      {mine.length === 0 ? <p className="empty">No stories saved here yet.</p> : <div className="cards">{mine.map(story =>
        <article className="story-card mine-card" key={story.id}>
          <b>{story.storytellerName || 'Anonymous'}</b>
          <span>{story.originalLanguage} · {story.status === 'withdrawn' ? 'Withdrawn' : story.status === 'shared' && story.visibility === 'public' ? 'Shared publicly' : story.status === 'shared' ? 'Private' : 'Draft'}</span>
          <div className="actions">
            <button className="secondary" onClick={() => showStory(story, true)}>Open</button>
            <button className="secondary" onClick={() => startReview(story)}>Review</button>
            {story.status !== 'withdrawn' && <button className="danger" onClick={() => setWithdrawConfirmationId(story.id)}>Withdraw</button>}
          </div>
          {withdrawConfirmationId === story.id && <div className="notice" role="group" aria-label="Confirm withdrawal">
            <p>Withdraw this story from sharing? Other people will no longer be able to open it. It will remain in My stories; downloaded copies are not deleted.</p>
            <div className="actions">
              <button className="secondary" onClick={() => setWithdrawConfirmationId('')}>Keep story</button>
              <button className="danger" onClick={async () => { try { await update(story.id, { withdraw: true }); setWithdrawConfirmationId(''); } catch (cause) { setError(cause.message); } }}>Withdraw story</button>
            </div>
          </div>}
        </article>)}
      </div>}
    </main>}

    <nav className="bottom-nav" aria-label="Main navigation">
      <button className={page === 'listen' || page === 'detail' ? 'active' : ''} onClick={() => navigate('listen')}>Listen</button>
      <button className={page === 'share' ? 'active' : ''} onClick={() => navigate('share')}>Share a story</button>
      <button className={page === 'mine' || page === 'review' ? 'active' : ''} onClick={() => navigate('mine')}>My stories</button>
    </nav>
    <footer>Stories stay under the storyteller’s control.</footer>
  </div>;
}
