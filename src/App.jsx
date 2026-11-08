import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import RecordingCapture from './RecordingCapture.jsx';
import Landing from './Landing.jsx';
import { Wordmark, Waveform } from './Brand.jsx';
import { editAiTranslationDraft, translationApprovalCanContinue } from './translation-draft.js';
import { OBJECT_RECORDS, objectRecordView, attachStoryToObject } from './object-records.js';

const tokenKey = 'story-bridge-owner';
let accountSessionToken = '';

function ownerToken() {
  let token = localStorage.getItem(tokenKey);
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(tokenKey, token);
  }
  return token;
}

const headers = () => ({ 'x-owner-token': ownerToken(), ...(accountSessionToken ? { Authorization: `Bearer ${accountSessionToken}` } : {}) });

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Error(data.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function AudioPlayer({ story, privateAudio = false }) {
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState(story?.audio ? 'loading' : 'absent');
  const [attempt, setAttempt] = useState(0);
  const player=useRef(null);const [duration,setDuration]=useState(0);const [position,setPosition]=useState(0);const [rate,setRate]=useState(1);
  useEffect(() => {
    let objectUrl = '';
    let alive = true;
    const controller = new AbortController();
    if (!story?.audio) {
      setSrc('');
      setStatus('absent');
      return () => controller.abort();
    }
    setStatus('loading');
    setSrc('');
    if (privateAudio) {
      fetch(`/api/stories/${story.id}/audio`, { headers: headers(), signal: controller.signal })
        .then(response => {
          if (!response.ok) throw Error('Audio unavailable');
          return response.blob();
        })
        .then(blob => {
          if (!alive) return;
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        })
        .catch(() => { if (alive) { setSrc(''); setStatus('error'); } });
    } else {
      setSrc(`/api/stories/${story.id}/audio`);
    }
    return () => {
      alive = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [story?.id, story?.audio, privateAudio, attempt]);
  useEffect(()=>{if(player.current)player.current.playbackRate=rate},[rate,src]);
  if (!story?.audio) return <p className="muted" role="status">No recording attached.</p>;
  return <div className="audio-player">
    {status === 'loading' && <p className="muted" role="status">Loading recording…</p>}
    {status === 'error' && <div role="alert"><p>Recording could not be loaded.</p><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry recording</button></div>}
    <audio ref={player} key={attempt} controls src={src || undefined} preload="metadata" onCanPlay={event => {setStatus('ready');setDuration(event.currentTarget.duration||0)}} onTimeUpdate={event=>setPosition(event.currentTarget.currentTime)} onRateChange={event=>setRate(event.currentTarget.playbackRate)} onError={() => setStatus('error')}>Audio playback is unavailable.</audio>
    {status==='ready'&&<div className="audio-tools"><label>Playback position<input aria-label="Seek in recording" type="range" min="0" max={duration||0} step="0.1" value={Math.min(position,duration)} onChange={event=>{const value=Number(event.target.value);setPosition(value);if(player.current)player.current.currentTime=value}}/></label><label>Speed<select value={rate} onChange={event=>{const value=Number(event.target.value);setRate(value);if(player.current)player.current.playbackRate=value}}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label></div>}
  </div>;
}

function UnsavedAudioPreview({ file, fileKind }) {
  const [src,setSrc]=useState('');
  useEffect(()=>{
    if(!file){setSrc('');return undefined;}
    const url=URL.createObjectURL(file);setSrc(url);
    return()=>URL.revokeObjectURL(url);
  },[file]);
  if(!file)return null;
  return <div className="unsaved-audio-review"><p role="status">{fileKind==='recording'?'Recording captured. Not saved yet.':'Audio file selected. Not saved yet.'}</p><audio aria-label="Preview of unsaved audio" controls src={src||undefined} preload="metadata">Audio playback is unavailable.</audio></div>;
}

export default function App() {
  const [page, setPage] = useState('landing');
  const [stories, setStories] = useState([]);
  const [mine, setMine] = useState([]);
  const [current, setCurrent] = useState(null);
  const [translationStoryId, setTranslationStoryId] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ originalLanguage: '', text: '', translationLanguage: '', translation: '', translationOrigin: 'storyteller', translationApproved: false, storytellerName: '', showName: false });
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [file, setFile] = useState(null);
  const [fileKind, setFileKind] = useState('');
  const [audioSaved, setAudioSaved] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const mutationBusyRef = useRef(false);
  const [review, setReview] = useState(null);
  const [reviewVisibility, setReviewVisibility] = useState('private');
  const [withdrawConfirmationId, setWithdrawConfirmationId] = useState('');
  const [checkedBy, setCheckedBy] = useState('');
  const [accountConfig, setAccountConfig] = useState(null);
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authStep, setAuthStep] = useState('email');
  const [profileName, setProfileName] = useState('');
  const [savedProfileName, setSavedProfileName] = useState('');
  const [profileState, setProfileState] = useState('idle');
  const [profileError, setProfileError] = useState('');
  const [listState, setListState] = useState({ stories: 'loading', mine: 'loading' });
  const [listErrors, setListErrors] = useState({ stories: '', mine: '' });
  const [listOwner, setListOwner] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  const [showSignIn, setShowSignIn] = useState(false);
  const [languageFilter, setLanguageFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [audioOnly, setAudioOnly] = useState(false);
  const [shareStep,setShareStep]=useState(1);
  const [objectContext,setObjectContext]=useState(null);
  const [objectStory,setObjectStory]=useState(null);
  const [reviewBaseline, setReviewBaseline] = useState(null);
  const generation = useRef(0);
  const listRequest = useRef({ stories: 0, mine: 0 });
  const currentSession = useRef('');
  const identityEpoch = useRef(0);
  const pageRef = useRef('landing');
  const viewEpoch = useRef(0);
  const detailRequest = useRef(0);
  const profileRequest = useRef(0);
  const mutationRequest = useRef(0);
  const translationRequest = useRef(0);
  const translationBusyRef = useRef(false);
  const emptyForm = { originalLanguage: '', text: '', translationLanguage: '', translation: '', translationOrigin: 'storyteller', translationApproved: false, storytellerName: '', showName: false };
  const [authBusy, setAuthBusy] = useState(false);
  const captureBusyRef = useRef(false);
  const activeIdentity = session?.user?.id || (accountConfig?.account ? '' : 'legacy');

  function transitionTo(nextPage) {
    if (pageRef.current !== nextPage) { pageRef.current = nextPage; viewEpoch.current += 1; }
    setPage(nextPage);
  }

  function scopeIsCurrent(scope, requireView = true) {
    return activeIdentity === scope.identity && currentSession.current === scope.identity && identityEpoch.current === scope.epoch &&
      (!requireView || (pageRef.current === scope.page && viewEpoch.current === scope.view));
  }

  function captureScope() {
    return { identity: currentSession.current, epoch: identityEpoch.current, page: pageRef.current, view: viewEpoch.current };
  }

  function clearPrivateState(nextPage) {
    mutationRequest.current += 1; profileRequest.current += 1; detailRequest.current += 1;
    setObjectStory(null); setObjectContext(null);
    mutationBusyRef.current = false; captureBusyRef.current = false;
    translationRequest.current += 1; translationBusyRef.current = false; setTranslationBusy(false); setTranslationError('');
    setCurrent(null); setTranslationStoryId(''); setReview(null); setReviewBaseline(null);
    setForm(emptyForm); setFile(null); setFileKind(''); setAudioSaved(false); setCaptureBusy(false);
    setReviewVisibility('private'); setCheckedBy(''); setWithdrawConfirmationId('');
    setProfileName(''); setSavedProfileName(''); setProfileState('idle'); setProfileError(''); setProfileNotice('');
    setError(''); setSaving(false);
    transitionTo(nextPage);
  }

  async function loadProfile(identity = currentSession.current, epoch = identityEpoch.current, viewScoped = false) {
    const requestId = ++profileRequest.current;
    const scope = captureScope();
    setProfileState('loading'); setProfileError(''); setProfileNotice('');
    try {
      const profile = await api('/api/account/profile');
      if (currentSession.current !== identity || identityEpoch.current !== epoch || profileRequest.current !== requestId || (viewScoped && !scopeIsCurrent(scope))) return;
      const name = typeof profile?.display_name === 'string' ? profile.display_name : '';
      setSavedProfileName(name); setProfileName(name); setProfileState('ready');
    } catch {
      if (currentSession.current !== identity || identityEpoch.current !== epoch || profileRequest.current !== requestId || (viewScoped && !scopeIsCurrent(scope))) return;
      setProfileState('error'); setProfileError('Your profile could not be loaded. Try again.');
    }
  }

  useEffect(() => {
    ownerToken();
    let unsubscribe = () => {};
    setConfigError('');
    fetch('/api/account/config').then(response => { if (!response.ok) throw Error('Configuration unavailable'); return response.json(); }).then(config => {
      if (!config || typeof config.account !== 'boolean') throw Error('Invalid configuration');
      setAccountConfig(config);
      if (config.account) {
        refresh('','stories');
        const client = createClient(config.url, config.publishableKey, { auth: { flowType: 'pkce' } });
        setSupabase(client);
        client.auth.getSession().then(({ data }) => setSession(data.session));
        const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
        unsubscribe = () => data.subscription.unsubscribe();
      } else refresh();
    }).catch(() => { setAccountConfig(null); setConfigError('Story Bridge could not load its configuration. Try again.'); });
    return () => unsubscribe();
  }, [configAttempt]);
  useEffect(() => {
    const sessionKey = session?.user?.id || (accountConfig?.account ? '' : 'legacy');
    const identityChanged = currentSession.current !== sessionKey;
    accountSessionToken = session?.access_token || '';
    if (identityChanged) {
      currentSession.current = sessionKey;
      identityEpoch.current += 1;
      clearPrivateState(accountConfig?.account && session ? 'workspace' : (pageRef.current === 'landing' ? 'landing' : 'listen'));
      setStories([]); setMine([]); setListOwner('');
      setListState({ stories: 'loading', mine: 'loading' });
      setListErrors({ stories: '', mine: '' });
    }
    generation.current += 1;
    if (session) {
      api('/api/account/claim', { method:'POST' }).catch(() => {});
      refresh(sessionKey);
      if (identityChanged) loadProfile(sessionKey, identityEpoch.current);
    }
    else if (accountConfig && !accountConfig.account) refresh(sessionKey);
    else if (accountConfig?.account) { setListState({ stories: 'loading', mine: 'idle' }); refresh('', 'stories'); }
  }, [session, accountConfig]);
  useEffect(() => { captureBusyRef.current = captureBusy; }, [captureBusy]);
  useEffect(() => {
    const beforeUnload = event => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [page, captureBusy, file, audioSaved, form, review, reviewBaseline, reviewVisibility]);

  async function refresh(sessionKey = currentSession.current, onlyKind = '') {
    const load = async (kind, url, setter) => {
      const requestGeneration = generation.current;
      const requestId = ++listRequest.current[kind];
      setListState(previous => ({ ...previous, [kind]: 'loading' }));
      setListErrors(previous => ({ ...previous, [kind]: '' }));
      try {
        const data = await api(url);
        if (!Array.isArray(data)) throw Error('Invalid list response');
        if (generation.current !== requestGeneration || listRequest.current[kind] !== requestId || currentSession.current !== sessionKey) return;
        setter(data); setListOwner(sessionKey); setListState(previous => ({ ...previous, [kind]: 'ready' }));
      } catch {
        if (generation.current !== requestGeneration || listRequest.current[kind] !== requestId || currentSession.current !== sessionKey) return;
        setListErrors(previous => ({ ...previous, [kind]: 'This list could not be loaded.' })); setListState(previous => ({ ...previous, [kind]: 'error' }));
      }
    };
    const jobs = [];
    if (!onlyKind || onlyKind === 'stories') jobs.push(load('stories', '/api/stories', setStories));
    if (!onlyKind || onlyKind === 'mine') jobs.push(load('mine', '/api/mine', setMine));
    await Promise.all(jobs);
  }

  const onCaptureBusyChange = useCallback(busy => setCaptureBusy(busy), []);
  const onAudioChange = useCallback((nextFile, kind) => {
    setFile(nextFile);
    setFileKind(kind || '');
    setAudioSaved(false);
  }, []);

  async function sendEmailCode(event) {
    event.preventDefault(); setError(''); setAuthBusy(true);
    const { error: cause } = await supabase.auth.signInWithOtp({ email: authEmail.trim(), options: { shouldCreateUser: true } });
    setAuthBusy(false);
    if (cause) setError(/rate|too many/i.test(cause.message) ? 'Too many code requests. Wait before trying again.' : 'The sign-in code could not be sent. Check the address and try again.');
    else setAuthStep('code');
  }
  async function verifyEmailCode(event) {
    event.preventDefault(); setError(''); setAuthBusy(true);
    const { error: cause } = await supabase.auth.verifyOtp({ email: authEmail.trim(), token: authCode.trim(), type: 'email' });
    setAuthBusy(false);
    if (cause) setError(/rate|too many/i.test(cause.message) ? 'Too many attempts. Wait before trying again.' : 'That code is incorrect or expired. Request a new code and try again.');
  }
  async function signOut() {
    if (hasUnsavedChanges() && !window.confirm('You have unsaved changes. Sign out and discard them?')) return;
    if (!supabase) return;
    const oldIdentity = currentSession.current;
    currentSession.current = ''; identityEpoch.current += 1; accountSessionToken = '';
    setAuthStep('email'); setAuthEmail(''); setAuthCode('');
    setStories([]); setMine([]); setListOwner('');
    clearPrivateState('landing');
    try {
      const { error: cause } = await supabase.auth.signOut();
      if (cause) {
        currentSession.current = oldIdentity; identityEpoch.current += 1; accountSessionToken = session?.access_token || '';
        clearPrivateState('workspace'); setListState({ stories:'loading', mine:'loading' }); setListOwner('');
        setError('Sign out could not be completed. Try again.'); refresh(oldIdentity); loadProfile(oldIdentity, identityEpoch.current);
        return;
      }
      setSession(null); setShowSignIn(true); transitionTo('landing');
    } catch {
      currentSession.current = oldIdentity; identityEpoch.current += 1; accountSessionToken = session?.access_token || '';
      clearPrivateState('workspace'); setListState({ stories:'loading', mine:'loading' }); setListOwner('');
      setError('Sign out could not be completed. Try again.'); refresh(oldIdentity); loadProfile(oldIdentity, identityEpoch.current);
    }
  }
  async function saveProfile(event) {
    event.preventDefault();
    if (profileState !== 'ready') return;
    const scope = captureScope(); const requestId = ++profileRequest.current; const submittedName = profileName;
    setProfileState('saving'); setProfileError(''); setProfileNotice('');
    try {
      const profile = await api('/api/account/profile', { method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({displayName:submittedName}) });
      if (!scopeIsCurrent(scope) || profileRequest.current !== requestId) return;
      const savedName = typeof profile?.display_name === 'string' ? profile.display_name : '';
      setSavedProfileName(savedName); setProfileName(savedName); setProfileState('ready'); setProfileNotice('Profile saved.');
    } catch {
      if (!scopeIsCurrent(scope) || profileRequest.current !== requestId) return;
      setProfileState('ready'); setProfileError('Your profile could not be saved. Try again.');
    }
  }
  if (!accountConfig) return <div className="app"><header aria-label="Story Bridge"><h1>Story Bridge</h1></header><main>{configError ? <section className="panel" role="alert"><h1>Story Bridge is unavailable</h1><p>{configError}</p><button className="secondary" onClick={() => setConfigAttempt(value => value + 1)}>Try again</button></section> : <p>Loading Story Bridge…</p>}</main></div>;
  if (accountConfig.account && !session && showSignIn) return <div className="app account-app">
    <header aria-label="Story Bridge"><button className="brand-button" onClick={()=>setShowSignIn(false)} aria-label="Back to Story Bridge"><Wordmark light/></button><p>Your story, in your own voice, carried across languages.</p></header>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">Dismiss</button></div>}

    <main className="account-card"><h1>{authStep === 'email' ? 'Sign in to Story Bridge' : 'Enter your code'}</h1>
      {accountConfig.google && <button className="secondary account-action" disabled={authBusy} onClick={async () => { setAuthBusy(true); const { error: cause } = await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:window.location.origin, scopes:'openid email profile' } }); if (cause) { setError('Google sign-in could not be started. Try again later.'); setAuthBusy(false); } }}>Continue with Google</button>}
      {accountConfig.email && (authStep === 'email' ? <form className="form auth-form" onSubmit={sendEmailCode}><p>A one-time code will be sent to your email address.</p><label>Email address<input required type="email" autoComplete="email" value={authEmail} onChange={event => setAuthEmail(event.target.value)}/></label><button className="primary" disabled={authBusy}>{authBusy ? 'Sending…' : 'Email me a sign-in code'}</button></form> : <form className="form auth-form" onSubmit={verifyEmailCode}><p>Enter the one-time code sent to your email.</p><label>One-time code<input required inputMode="numeric" autoComplete="one-time-code" value={authCode} onChange={event => setAuthCode(event.target.value)}/></label><button className="primary" disabled={authBusy}>{authBusy ? 'Checking…' : 'Verify code'}</button><button type="button" className="secondary" onClick={() => { setAuthStep('email'); setAuthCode(''); }}>Use a different email</button></form>)}
      {!accountConfig.email && !accountConfig.google && <p>Sign-in is not configured. Contact the Story Bridge administrator.</p>}
    </main><footer>Story Bridge</footer>
  </div>;
  if (accountConfig.account && !session && page==='landing') return <Landing stories={stories} showSignIn repoUrl="https://github.com/josuekb09/Story-Bridge" onListen={()=>transitionTo('listen')} onShare={()=>setShowSignIn(true)} onSignIn={()=>setShowSignIn(true)} onOpen={showStory} onBrowse={language=>{setLanguageFilter(language);transitionTo('listen')}}/>;
  if (currentSession.current !== activeIdentity) return <div className="app"><header aria-label="Story Bridge"><h1>Story Bridge</h1></header><main><p role="status">Loading your account…</p></main></div>;

  function navigate(nextPage) {
    if (nextPage === page) return;
    if (saving || profileState === 'saving') return;
    if (hasUnsavedChanges()) {
      const message = page === 'share' && (captureBusy || captureBusyRef.current)
        ? 'A recording is in progress. Leaving will stop and discard this unsaved audio and other changes. Continue?'
        : page === 'share' && file && !audioSaved
          ? 'You have unsaved audio and story changes. Leaving this screen will discard it and those changes. Continue?'
          : 'You have unsaved changes. Leaving this screen will discard them. Continue?';
      if (!window.confirm(message)) return;
      if (page === 'share') { setForm(emptyForm); setFile(null); setFileKind(''); setAudioSaved(false); setShareStep(1); }
      if (page === 'review') setReviewBaseline({ text: review?.text || '', translation: review?.translation || '', visibility: reviewVisibility });
      if (page === 'profile') setProfileName(savedProfileName);
    }
    if (page === 'profile' && nextPage !== 'profile' && profileState === 'loading') { profileRequest.current += 1; setProfileState('idle'); }
    transitionTo(nextPage);
    setError('');
    if (nextPage === 'listen' || nextPage === 'discover' || nextPage === 'mine' || nextPage === 'workspace') refresh();
    if (nextPage === 'profile' && profileState === 'idle') loadProfile(currentSession.current, identityEpoch.current, true);
  }

  function hasUnsavedChanges() {
    if (page === 'share') return captureBusy || captureBusyRef.current || JSON.stringify(form) !== JSON.stringify(emptyForm) || !!(file && !audioSaved);
    if (page === 'review' && review && reviewBaseline) return review.text !== reviewBaseline.text || review.translation !== reviewBaseline.translation || reviewVisibility !== reviewBaseline.visibility;
    if (page === 'profile' && ['ready','saving'].includes(profileState)) return profileName !== savedProfileName;
    return false;
  }

  function change(key, value) {
    setForm(previous => {
      if (key === 'translation' && previous.translationOrigin === 'ai_draft') return editAiTranslationDraft(previous, value);
      if (key === 'translation') return { ...previous, translation: value, translationOrigin: 'storyteller', translationApproved: false };
      if (key === 'translationLanguage') return { ...previous, translationLanguage: value, translationApproved: false };
      return { ...previous, [key]: value };
    });
  }

  async function requestTranslationDraft() {
    if (translationBusyRef.current) return;
    translationBusyRef.current = true;
    const scope = captureScope(); const requestId = ++translationRequest.current;
    setTranslationBusy(true); setTranslationError('');
    try {
      const draft = await api('/api/translation-draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: form.text, originalLanguage: form.originalLanguage, targetLanguage: form.translationLanguage }) });
      if (!scopeIsCurrent(scope) || requestId !== translationRequest.current || shareStep !== 3) return;
      setForm(previous => ({ ...previous, translation: draft.translation, translationOrigin: 'ai_draft', translationApproved: false }));
    } catch (cause) { if (scopeIsCurrent(scope) && requestId === translationRequest.current) setTranslationError(cause.message); }
    finally { if (requestId === translationRequest.current) { translationBusyRef.current = false; setTranslationBusy(false); } }
  }

  async function withdrawStory(story) {
    const scope = captureScope();
    try { const updated = await update(story.id, { withdraw: true }); if (updated && scopeIsCurrent(scope)) setWithdrawConfirmationId(''); }
    catch (cause) { if (scopeIsCurrent(scope)) setError(cause.message); }
  }

  async function createDraft(event) {
    event.preventDefault();
    if (mutationBusyRef.current) return;
    const scope = captureScope(); const requestId = ++mutationRequest.current;
    mutationBusyRef.current = true;
    setError('');
    setSaving(true);
    if (form.translationOrigin === 'ai_draft' && !form.translationApproved) { setError('Approve the AI draft before saving it.'); mutationBusyRef.current = false; setSaving(false); return; }
    const formData = new FormData();
    Object.entries(form).filter(([key]) => !['translationOrigin','translationApproved'].includes(key)).forEach(([key, value]) => formData.append(key, String(value)));
    formData.append('translationOrigin', form.translationOrigin === 'ai_draft' ? 'ai_approved' : 'storyteller');
    formData.append('translationApproved', String(form.translationApproved));
    if (file) formData.append('audio', file);
    try {
      const story = await api('/api/stories', { method: 'POST', body: formData });
      if (!scopeIsCurrent(scope) || mutationRequest.current !== requestId) return;
      const savedAudio = !!file && !!story.audio;
      if (objectContext) setObjectStory(attachStoryToObject(objectContext.id, story));
      setForm(emptyForm); setFile(null); setFileKind(''); setShareStep(1);
      setAudioSaved(savedAudio);
      setReview({ ...story, audioSaved: savedAudio });
      setReviewBaseline({ text: story.text || '', translation: story.translation || '', visibility: story.visibility || 'private' });
      setReviewVisibility(story.visibility || 'private');
      await refresh();
      if (scopeIsCurrent(scope) && mutationRequest.current === requestId) transitionTo('review');
    } catch (cause) {
      if (scopeIsCurrent(scope) && mutationRequest.current === requestId) setError(cause.message);
    } finally {
      if (identityEpoch.current === scope.epoch && currentSession.current === scope.identity && mutationRequest.current === requestId) {
        mutationBusyRef.current = false; setSaving(false);
      }
    }
  }

  async function update(id, body) {
    if (mutationBusyRef.current) return null;
    const scope = captureScope(); const requestId = ++mutationRequest.current;
    mutationBusyRef.current = true;
    setSaving(true);
    try {
      const story = await api(`/api/stories/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!scopeIsCurrent(scope) || mutationRequest.current !== requestId) return null;
      if (scope.page === 'review' && review?.id === id) {
        setReview(story); setReviewBaseline({ text: story.text || '', translation: story.translation || '', visibility: story.visibility || 'private' });
      }
      if (current?.id === id) setCurrent(story);
      await refresh(scope.identity);
      return story;
    } finally {
      if (identityEpoch.current === scope.epoch && currentSession.current === scope.identity && mutationRequest.current === requestId) {
        mutationBusyRef.current = false; setSaving(false);
      }
    }
  }

  function pendingReviewEdits() {
    if (!review) return {};
    const saved = reviewBaseline;
    const edits = {};
    if (!saved || review.text !== saved.text) edits.text = review.text;
    if (!saved || review.translation !== saved.translation) { edits.translation = review.translation; edits.translationOrigin = 'storyteller'; }
    return edits;
  }

  async function saveReviewChanges(extra = {}) {
    return update(review.id, { ...pendingReviewEdits(), ...extra });
  }

  async function saveReviewEdits(extra = {}) {
    const scope = captureScope();
    try { return await saveReviewChanges(extra); }
    catch (cause) { if (scopeIsCurrent(scope)) setError(cause.message); return null; }
  }

  async function saveReview(approve) {
    if (mutationBusyRef.current) return;
    const scope = captureScope();
    try {
      setError('');
      const saved = await saveReviewChanges({ visibility: reviewVisibility, approve });
      if (saved && scopeIsCurrent(scope)) transitionTo('mine');
    } catch (cause) { if (scopeIsCurrent(scope)) setError(cause.message); }
  }

  function startReview(story) {
    setReview(story);
    setCurrent(story);
    setReviewVisibility(story.visibility || 'private');
    setReviewBaseline({ text: story.text || '', translation: story.translation || '', visibility: story.visibility || 'private' });
    setWithdrawConfirmationId('');
    setCheckedBy(story.checkedBy || '');
    transitionTo('review');
  }

  async function showStory(story, own = false) {
    const scope = captureScope(); const requestId = ++detailRequest.current;
    try {
      const fullStory = await api(`/api/stories/${story.id}`);
      if (!scopeIsCurrent(scope) || detailRequest.current !== requestId) return;
      setCurrent({ ...fullStory, _own: own });
      setTranslationStoryId('');
      transitionTo('detail');
    } catch (cause) { if (scopeIsCurrent(scope) && detailRequest.current === requestId) setError(cause.message); }
  }

  const activeSessionKey = session?.user?.id || (accountConfig.account ? '' : 'legacy');
  const visibleMine = listOwner === activeSessionKey ? mine : [];
  const visibleStories = listOwner === activeSessionKey ? stories : [];
  const category = story => story.status === 'withdrawn' ? 'withdrawn' : story.status === 'shared' && story.visibility === 'public' ? 'public' : story.status === 'shared' ? 'private' : 'draft';
  const sortedMine = [...visibleMine].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const counts = { drafts: visibleMine.filter(item => category(item) === 'draft').length, public: visibleMine.filter(item => category(item) === 'public').length, private: visibleMine.filter(item => category(item) === 'private').length, withdrawn: visibleMine.filter(item => category(item) === 'withdrawn').length };
  const draftStories = sortedMine.filter(item => category(item) === 'draft');
  const retryList = kind => refresh(currentSession.current, kind);
  const filteredStories=visibleStories.filter(story=>(languageFilter==='all'||story.originalLanguage===languageFilter)&&(regionFilter==='all'||story.region===regionFilter)&&(audioOnly?story.audio:true));
  const publicObjects=OBJECT_RECORDS.map(record=>objectRecordView(record));
  function addVoiceToObject(record) {
    setObjectContext(record);
    setObjectStory(null);
    setForm({ ...emptyForm, originalLanguage: '' });
    setShareStep(1);
    setError('');
    transitionTo('share');
  }

  return page==='landing' ? <Landing stories={visibleStories} showSignIn={!!accountConfig.account} repoUrl="https://github.com/josuekb09/Story-Bridge" onListen={()=>navigate('listen')} onShare={()=>navigate('share')} onSignIn={()=>setShowSignIn(true)} onOpen={showStory} onBrowse={language=>{setLanguageFilter(language);navigate('listen')}}/> : <div className="app">
    <header aria-label="Story Bridge">
      <button className="brand-button" onClick={()=>transitionTo('landing')} aria-label="Story Bridge home"><Wordmark light/></button>
      <p>Your story, in your own voice, carried across languages.</p>
      {accountConfig.account && <div className="account-tools"><span>{session.user?.email || 'Signed in'}</span><button className="header-link" onClick={() => navigate('profile')}>Profile</button><button className="header-link" onClick={signOut}>Sign out</button></div>}
    </header>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">Dismiss</button></div>}

    {page === 'workspace' && accountConfig.account && <main className="workspace">
      <p className="eyebrow">My workspace</p><h1>{savedProfileName ? `Welcome, ${savedProfileName}` : 'Your storytelling space'}</h1><p className="intro">Write and keep stories in your own languages and voice. Drafts stay private until you approve them.</p>
      {profileState === 'loading' && <p className="muted" role="status">Loading your profile…</p>}
      <div className="actions workspace-actions"><button className="primary" onClick={() => navigate('share')}>Create a story</button>{!savedProfileName && profileState !== 'loading' && <button className="secondary" onClick={() => navigate('profile')}>Set your display name</button>}<button className="secondary" onClick={() => navigate('mine')}>View all my stories</button></div>
      {listState.mine === 'loading' && <p className="muted" role="status">Loading your workspace…</p>}{listState.mine === 'error' && <section className="panel" role="alert"><p>{listErrors.mine}</p><button className="secondary" onClick={() => retryList('mine')}>Try again</button></section>}
      {listState.mine === 'ready' && <><section className="workspace-summary"><h2>Your collection</h2><div className="summary-grid"><button onClick={() => { setCollectionFilter('draft'); navigate('mine'); }}>Drafts <b>{counts.drafts}</b></button><button onClick={() => { setCollectionFilter('public'); navigate('mine'); }}>Public <b>{counts.public}</b></button><button onClick={() => { setCollectionFilter('private'); navigate('mine'); }}>Private <b>{counts.private}</b></button><button onClick={() => { setCollectionFilter('withdrawn'); navigate('mine'); }}>Withdrawn <b>{counts.withdrawn}</b></button></div></section><section><div className="section-heading"><h2>Drafts to continue</h2><button className="text-button" onClick={() => { setCollectionFilter('draft'); navigate('mine'); }}>View drafts</button></div>{draftStories.length === 0 ? <p className="empty">No drafts to continue yet.</p> : <div className="cards">{draftStories.slice(0, 3).map(story => <article className="story-card mine-card" key={story.id}><b>{story.originalLanguage || 'Story draft'}</b><span>{story.text?.slice(0, 120) || 'No written text yet.'}</span><button className="secondary" onClick={() => startReview(story)}>Continue draft</button></article>)}</div>}</section></>}
    </main>}

    {(page === 'listen' || page === 'discover') && <main>
      <h1>{accountConfig.account ? 'Discover' : 'Listen'}</h1><p className="intro">Read stories as they were told, in the original language first. A translation is always a second layer.</p>
      <div className="feed-filters"><label>Language<select value={languageFilter} onChange={event=>setLanguageFilter(event.target.value)}><option value="all">All languages</option>{[...new Set(visibleStories.map(story=>story.originalLanguage).filter(Boolean))].map(language=><option key={language}>{language}</option>)}</select></label><label>Region<select value={regionFilter} onChange={event=>setRegionFilter(event.target.value)}><option value="all">All regions</option>{[...new Set(visibleStories.map(story=>story.region).filter(Boolean))].map(region=><option key={region}>{region}</option>)}</select></label><label className="check"><input type="checkbox" checked={audioOnly} onChange={event=>setAudioOnly(event.target.checked)}/> Has audio</label></div>
      {listState.stories === 'loading' && <p className="muted" role="status">Loading stories…</p>}{listState.stories === 'error' && <section className="panel" role="alert"><p>{listErrors.stories}</p><button className="secondary" onClick={() => retryList('stories')}>Try again</button></section>}
      {listState.stories === 'ready' && filteredStories.length === 0 && <section className="empty"><h2>No stories match those filters yet.</h2><p>Try another language, or be the first to add a voice to the collection.</p><button className="primary" onClick={()=>navigate('share')}>Share a story</button></section>}
      {listState.stories === 'ready' && (filteredStories.length === 0 ? null : <div className="cards">{filteredStories.map(story =>
        <article className="story-card" key={story.id}>
          <div className="story-card-top"><span className="language-badge">{story.originalLanguage}</span><span className="wave-wrap">{story.audio&&<Waveform/>}</span></div><b>{story.storytellerName || 'Anonymous'}</b><p className="story-text">{story.text?.slice(0, 180) || 'An audio story, told in its original voice.'}</p>{story.translation&&<button className="text-button" aria-label={translationStoryId===story.id?'Show original first':'View translation'} aria-pressed={translationStoryId===story.id} onClick={()=>setTranslationStoryId(current=>current===story.id?'':story.id)}>{translationStoryId===story.id?'Original first':'Translation'}</button>}{translationStoryId===story.id&&story.translation&&<p className="translation-preview">{story.translation}<small>{story.translationOrigin==='ai_approved'?'AI draft approved by the storyteller':'Written by the storyteller'}</small></p>}{story.audio&&<AudioPlayer story={story}/>}<button className="secondary" onClick={()=>showStory(story)}>Open story</button>
        </article>)}
      </div>)}
      {listState.stories === 'ready' && <section className="object-record-feed" aria-labelledby="object-records-title"><h2 id="object-records-title">Cultural records</h2><div className="cards">{publicObjects.map(record=><article className="story-card object-card" key={record.id}><span className="language-badge">Object record</span><h3>{record.title}</h3><p>{record.region}</p><p className="notice">Access: {record.access}</p>{record.projectDraft&&<p className="muted">Project draft · not written by a community member</p>}<button className="secondary" onClick={()=>transitionTo(`object:${record.id}`)}>Open record</button></article>)}</div></section>}
    </main>}

    {page === 'profile' && accountConfig.account && <main><button className="back" onClick={() => navigate('workspace')}>← Back</button><h1>Your profile</h1><p className="intro">Your display name is used only when you choose to show your name on a story.</p>{profileState === 'loading' && <p role="status">Loading your profile…</p>}{profileState === 'error' && <section className="panel" role="alert"><p>{profileError}</p><button className="secondary" onClick={() => loadProfile(currentSession.current, identityEpoch.current, true)}>Try again</button></section>}{['ready','saving'].includes(profileState) && <form className="form" aria-busy={profileState === 'saving'} onSubmit={saveProfile}><label>Display name<input maxLength="80" disabled={profileState === 'saving'} value={profileName} onChange={event => setProfileName(event.target.value)}/></label>{profileNotice && <p className="success" role="status">{profileNotice}</p>}{profileError && <p className="field-error" role="alert">{profileError}</p>}<button className="primary" disabled={profileState === 'saving'}>{profileState === 'saving' ? 'Saving…' : 'Save profile'}</button><button type="button" className="secondary" disabled={profileState === 'saving'} onClick={signOut}>Sign out</button></form>}</main>}

    {page === 'detail' && current && <main>
      <button className="back" onClick={() => navigate(current._own ? 'mine' : 'listen')}>← Back</button>
      <p className="eyebrow">A story, in its own voice</p><h1>{(current.text||'A voice carried across languages').split(/[.!?\n]/)[0].slice(0,90)}</h1><p className="muted">{current.storytellerName || 'Anonymous'} · Original told in {current.originalLanguage}</p>
      <section className="panel"><h2>Original story</h2><AudioPlayer story={current} privateAudio={!!current._own && !(current.status === 'shared' && current.visibility === 'public')}/><p className="story-text">{current.text || 'No written text provided.'}</p></section>
      {current.translation && <section className="panel translation-panel">
        <><h2>Translation · {current.translationLanguage}</h2>
          <div className="notice">{current.translationChecked ? `Checked by ${current.checkedBy} (self-reported)` : 'Not yet checked by a speaker of this language'}</div>
          <p className="translation-credit">{current.translationOrigin === 'ai_approved' ? 'AI draft approved by the storyteller' : 'Written by the storyteller'}</p><p className="story-text">{current.translation}</p></>
      </section>}
      <section className="panel story-record"><h2>Story record</h2><p>SHA-256 fingerprints let you compare the versions available in this proof of concept.</p>{(current.versionLog||[]).map((version,index)=><article key={`${version.timestamp}-${index}`}><div><b>{version.change}</b><span>{version.language}</span><time dateTime={version.timestamp}>{new Date(version.timestamp).toLocaleString()}</time></div><code>{version.fingerprint}</code></article>)}</section>
    </main>}

    {page.startsWith('object:') && (()=>{const record=OBJECT_RECORDS.find(item=>item.id===page.slice(7));if(!record)return <main><h1>Record unavailable</h1><button className="back" onClick={()=>navigate('listen')}>← Listen</button></main>;const view=objectRecordView(record);return <main className="object-detail">
      <button className="back" onClick={()=>navigate('listen')}>← Listen</button><p className="eyebrow">Cultural record · {view.access}</p><h1>{view.title}</h1><p className="object-region">{view.region}</p>
      {view.communityNote?<p className="notice">{view.communityNote}</p>:<><p className="notice">{record.attribution}</p><p className="muted">This project draft uses secondary sources and needs review by a Luluwa speaker or community contributor.</p><section className="panel"><h2>What it is</h2><p>{record.whatItIs}</p><h2>People and region</h2><p>{record.people}</p><p>{record.region}</p><h2>Who holds it today</h2><p>{record.holderToday}</p>{record.maker&&<p><b>Maker:</b> {record.maker}</p>}{record.date&&<p><b>Date:</b> {record.date}</p>}{record.material&&<p><b>Material:</b> {record.material}</p>}{record.technique&&<p><b>Technique:</b> {record.technique}</p>}</section><section className="panel"><h2>Summary · English</h2><p className="story-text">{record.summary.en}</p><h2>Français</h2><p>{record.summary.fr||'Empty placeholder for a speaker to fill.'}</p><h2>Tshiluba</h2><p>{record.summary.tshiluba||'Empty placeholder for a speaker to fill.'}</p></section><section className="panel"><h2>Sources</h2><ul>{record.sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul><p>Image: none yet. No image is shown until its licence is checked and recorded.</p></section></>}
      {objectStory&&<section className="panel"><h2>Speaker story</h2><p>Shared as a separate story by {objectStory.story.storytellerName||'Anonymous'}.</p><code>{objectStory.story.versionLog?.[0]?.fingerprint||'Fingerprint available in the story record'}</code></section>}
      <button className="primary" onClick={()=>addVoiceToObject(record)}>Add a speaker’s voice</button>
    </main>})()}

    {page === 'share' && <main>
      <p className="eyebrow">Create a story</p><h1>Share a story</h1><p className="intro">Your story remains private until you review and explicitly approve it.</p>
      {objectContext&&<section className="object-context"><b>Adding a speaker’s voice to</b><p>{objectContext.title}</p><p>{objectContext.region}</p><p>Write your own words. They will be saved as a separate story with your name choice and story record.</p></section>}
      <ol className="share-progress" aria-label="Story creation progress">{['Language','Tell','Translate','Review'].map((label,index)=><li key={label} aria-current={shareStep===index+1?'step':undefined} className={shareStep>=index+1?'step-done':''}><span>{index+1}</span>{label}</li>)}</ol>
      <form onSubmit={createDraft} className="form" aria-busy={saving}>
        {shareStep===1&&<><label>Language told in<input required autoFocus value={form.originalLanguage} onChange={event => change('originalLanguage', event.target.value)} maxLength="80" placeholder="For example, Kiswahili"/></label><p className="muted">Your original language stays attached to the first version.</p><button type="button" className="primary" disabled={!form.originalLanguage.trim()} onClick={()=>setShareStep(2)}>Continue to your story</button></>}
        {shareStep===2&&<><div className="prompt-chips"><span>Try a prompt</span>{['Tell us about a meal you remember','A sound from home','A time a neighbour helped'].map(prompt=><button type="button" key={prompt} className="secondary" onClick={()=>change('text',`${form.text}${form.text?'\n\n':''}${prompt}: `)}>{prompt}</button>)}</div><label>Your story<textarea value={form.text} onChange={event => change('text', event.target.value)} maxLength="12000" rows="7" placeholder="Write in your own words"/></label><RecordingCapture file={file} fileKind={fileKind} saved={audioSaved} disabled={saving} language={form.originalLanguage} onTranscript={value=>change('text',value)} onChange={onAudioChange} onBusyChange={onCaptureBusyChange}/><button type="button" className="primary" disabled={captureBusy||!form.text.trim()&&!file} onClick={()=>setShareStep(3)}>Continue to translation</button></>}
        {shareStep===3&&<><p className="muted">A translation is optional. The original remains unchanged and is always shown first.</p><label>Translation language (optional)<input value={form.translationLanguage} onChange={event => change('translationLanguage', event.target.value)} maxLength="80" placeholder="Optional"/></label><label>Your translation or AI draft<textarea aria-label="Your translation or AI draft" value={form.translation} onChange={event => change('translation', event.target.value)} maxLength="12000" rows="6"/></label>{form.translationOrigin==='ai_draft'&&<><p className="notice" role="status">AI draft: {form.translationApproved?'approved by you':'not yet approved by you'}</p><div className="actions"><button type="button" className="primary" disabled={!form.translation.trim()} onClick={()=>setForm(previous=>({...previous,translationApproved:true}))}>Approve translation</button><button type="button" className="secondary" onClick={()=>setForm(previous=>({...previous,translationOrigin:'storyteller',translationApproved:false}))}>Write this translation yourself</button></div></>}{form.translation&&form.translationOrigin==='storyteller'&&<p className="notice">Written by the storyteller.</p>}<p className="muted ai-consent">If enabled, this sends the original text to OpenAI to draft a translation. It is not saved by Story Bridge until you approve it and save your story.</p><button type="button" className="secondary" disabled={translationBusy||!form.text.trim()||!form.originalLanguage.trim()||!form.translationLanguage.trim()} onClick={requestTranslationDraft}>{translationBusy?'Drafting translation…':'Draft with AI'}</button>{translationError&&<div className="field-error" role="alert">{translationError}</div>}<button type="button" className="primary" disabled={!translationApprovalCanContinue(form)||translationBusy} onClick={()=>setShareStep(4)}>Continue to review</button></>}
        {shareStep===4&&<><section className="review-summary"><h2>Original · {form.originalLanguage}</h2><p className="story-text">{form.text||'Audio recording only'}</p>{file&&<UnsavedAudioPreview file={file} fileKind={fileKind}/>}{form.translation&&<div><h3>{form.translationOrigin==='ai_draft'?(form.translationApproved?'AI draft approved by you':'AI draft: not yet approved by you'):'Written by the storyteller'} · {form.translationLanguage}</h3><p className="story-text">{form.translation}</p></div>}</section><label>Your name (optional)<input value={form.storytellerName} onChange={event => change('storytellerName', event.target.value)} maxLength="120"/></label><label className="check"><input type="checkbox" checked={form.showName} onChange={event => change('showName', event.target.checked)}/> Show my name on this story</label><p className="consent-copy">Nothing becomes public until you approve it. You choose public or private on the next review screen. You can withdraw this story at any time.</p><div className="actions"><button type="button" className="secondary" onClick={()=>setShareStep(3)}>Back to translation</button><button type="submit" className="primary" disabled={captureBusy || saving || (form.translationOrigin==='ai_draft'&&!form.translationApproved)}>{saving ? 'Saving draft…' : 'Save draft and open review'}</button></div></>}
      </form>
    </main>}

    {page === 'review' && review && <main aria-busy={saving}>
      <button className="back" onClick={() => navigate('mine')}>← My stories</button><h1>Review your story</h1>
      <section className="panel"><h2>Original story</h2><p>The original recording and text stay the main version.</p>
        <AudioPlayer story={review} privateAudio/>
        {review.audio && <p className="recording-saved" role="status" aria-live="polite">Saved with your story.</p>}
        <label>Original text<textarea aria-label="Original text" rows="6" maxLength="12000" value={review.text} onChange={event => setReview(previous => ({ ...previous, text: event.target.value }))}/></label>
        <button className="secondary" disabled={saving} onClick={() => saveReviewEdits()}>{saving ? 'Saving…' : 'Save original edit'}</button>
      </section>
      <section className="panel"><h2>Translation</h2>{review.translation ? <>
        <p>{review.translationOrigin==='ai_approved'?'AI draft approved by the storyteller':'Written by the storyteller'} · {review.translationLanguage}</p>
        <textarea aria-label="Translation entered by you" rows="5" value={review.translation} onChange={event => setReview(previous => ({ ...previous, translation: event.target.value, translationOrigin: 'storyteller' }))}/>
        <button className="secondary" disabled={saving} onClick={() => saveReviewEdits()}>{saving ? 'Saving…' : 'Save translation edit'}</button>
        <p className="muted">A checked label is self-declared by the author.</p>
        <label>Speaker name<input value={checkedBy} onChange={event => setCheckedBy(event.target.value)}/></label>
        <button className="secondary" disabled={saving} onClick={() => saveReviewEdits({ checkTranslation: true, checkedBy})}>{saving ? 'Saving…' : 'Mark as checked'}</button>
        {review.translationChecked && <div className="notice">Checked by {review.checkedBy} (self-reported)</div>}
        {!review.translationChecked && <div className="notice">Not yet checked by a speaker of this language</div>}
      </> : <p>No translation added.</p>}</section>
      <p className="muted">Illustrated video is not part of this version.</p>
      <p className="consent-copy">You decide who sees this story. Your name is optional, and you can withdraw this story at any time. Only an explicit approval publishes it.</p><fieldset><legend>Who can see this story?</legend>
        <label className="check"><input type="radio" name="visibility" value="private" checked={reviewVisibility === 'private'} onChange={() => setReviewVisibility('private')}/> Only me</label>
        <label className="check"><input type="radio" name="visibility" value="public" checked={reviewVisibility === 'public'} onChange={() => setReviewVisibility('public')}/> Anyone who opens this app</label>
        {review.status === 'withdrawn' && <p className="muted" role="status">{reviewVisibility === 'public' ? 'This story will become public again.' : 'This approval will keep the story private to you.'}</p>}
      </fieldset>
      <div className="actions"><button className="primary" disabled={saving} onClick={() => saveReview(true)}>{saving ? reviewVisibility === 'public' ? 'Publishing…' : 'Saving…' : review.status === 'withdrawn' && reviewVisibility === 'public' ? 'Publish again' : reviewVisibility === 'public' ? 'Approve and share' : 'Approve for only me'}</button><button className="secondary" disabled={saving} onClick={() => saveReview(false)}>{saving ? 'Saving draft…' : 'Save as draft'}</button></div>
      {objectContext&&<button className="text-button" onClick={()=>transitionTo(`object:${objectContext.id}`)}>Return to object record</button>}
    </main>}

    {page === 'mine' && <main>
      <h1>My stories</h1><p className="intro">{accountConfig.account ? 'Only your account can access your drafts and private stories.' : 'Only this browser can access your drafts and private stories. Losing its owner token means losing access.'}</p>
      {listState.mine === 'loading' && <p className="muted" role="status">Loading your stories…</p>}{listState.mine === 'error' && <section className="panel" role="alert"><p>{listErrors.mine}</p><button className="secondary" onClick={() => retryList('mine')}>Try again</button></section>}
      {listState.mine === 'ready' && <><div className="filter-row" aria-label="Filter stories">{[['all','All'],['draft','Drafts'],['public','Public'],['private','Private'],['withdrawn','Withdrawn']].map(([value,label])=><button key={value} className={collectionFilter===value?'filter-active':''} aria-pressed={collectionFilter===value} onClick={()=>setCollectionFilter(value)}>{label}{value!=='all' ? ` (${counts[value === 'draft' ? 'drafts' : value]})` : ''}</button>)}</div>{visibleMine.length === 0 ? <p className="empty">No stories saved here yet.</p> : (collectionFilter !== 'all' && !sortedMine.some(item => category(item) === collectionFilter)) ? <p className="empty">No {collectionFilter} stories.</p> : <><div className="cards">{(collectionFilter === 'all' ? sortedMine : sortedMine.filter(item => category(item) === collectionFilter)).map(story =>
        <article className="story-card mine-card" key={story.id}>
          <b>{story.storytellerName || 'Anonymous'}</b>
          <span>{story.originalLanguage || 'Language not set'} · <b className={`status-chip status-${category(story)}`}>{category(story) === 'public' ? 'Public' : category(story) === 'private' ? 'Private' : category(story) === 'withdrawn' ? 'Withdrawn' : 'Draft'}</b></span><span>{story.text?.slice(0, 120) || 'No written text provided.'}</span><span>{story.audio ? 'Audio recording attached' : 'No audio recording'}</span><span>Last changed {story.versionLog?.at(-1)?.timestamp ? new Date(story.versionLog.at(-1).timestamp).toLocaleDateString() : story.createdAt ? new Date(story.createdAt).toLocaleDateString() : 'date unavailable'}</span>
          <div className="actions">
            <button className="secondary" onClick={() => showStory(story, true)}>Open</button>
            <button className="secondary" onClick={() => startReview(story)}>Review</button>
            {story.status !== 'withdrawn' && <button className="danger" onClick={() => setWithdrawConfirmationId(story.id)}>Withdraw</button>}
          </div>
          {withdrawConfirmationId === story.id && <div className="notice" role="group" aria-label="Confirm withdrawal">
            <p>Withdraw this story from sharing? Other people will no longer be able to open it. It will remain in My stories; downloaded copies are not deleted.</p>
            <div className="actions">
              <button className="secondary" disabled={saving} onClick={() => setWithdrawConfirmationId('')}>Keep story</button>
              <button className="danger" disabled={saving} onClick={() => withdrawStory(story)}>{saving ? 'Withdrawing…' : 'Withdraw story'}</button>
            </div>
          </div>}
        </article>)}
      </div></>}</>}
    </main>}

    <nav className="bottom-nav" aria-label="Main navigation">
      {accountConfig.account ? <><button className={page === 'workspace' ? 'active' : ''} onClick={() => navigate('workspace')}>My workspace</button><button className={page === 'discover' || page === 'detail' ? 'active' : ''} onClick={() => navigate('discover')}>Discover</button><button className={page === 'mine' || page === 'review' ? 'active' : ''} onClick={() => navigate('mine')}>My stories</button><button className={page === 'profile' ? 'active' : ''} onClick={() => navigate('profile')}>Profile</button></> : <><button className={page === 'listen' || page === 'detail' ? 'active' : ''} onClick={() => navigate('listen')}>Listen</button><button className={page === 'share' ? 'active' : ''} onClick={() => navigate('share')}>Share a story</button><button className={page === 'mine' || page === 'review' ? 'active' : ''} onClick={() => navigate('mine')}>My stories</button></>}
    </nav>
    <footer>Stories stay under the storyteller’s control.</footer>
  </div>;
}
