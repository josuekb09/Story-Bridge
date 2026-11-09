import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Landing from '../pages/LandingPage.jsx';
import FeedPage from '../pages/FeedPage.jsx';
import SignInPage from '../pages/SignInPage.jsx';
import WelcomePage from '../pages/WelcomePage.jsx';
import LegalPage from '../pages/LegalPage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import StoryDetailPage from '../pages/StoryDetailPage.jsx';
import ObjectsPage from '../pages/ObjectsPage.jsx';
import CulturalGroupPage from '../pages/CulturalGroupPage.jsx';
import ObjectRecordPage from '../pages/ObjectRecordPage.jsx';
import SharePage from '../pages/SharePage.jsx';
import ReviewPage from '../pages/ReviewPage.jsx';
import WorkspacePage from '../pages/WorkspacePage.jsx';
import MyStoriesPage from '../pages/MyStoriesPage.jsx';
import { AppHeader, AppMobileNav } from '../components/AppHeader.jsx';
import { api, ownerToken, setAccountSessionToken, authorizedObjectUrl } from '../lib/api.js';
import { editAiTranslationDraft, translationApprovalCanContinue } from '../translation-draft.js';
import { OBJECT_RECORDS, CULTURAL_GROUP_RECORD, OBJECT_IDS, objectRecordView } from '../object-records.js';

const EMPTY_POST_META = {title:'',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'',access:'Public',consentConfirmed:false};

export default function App() {
  const pathPage = () => {
    const path = window.location.pathname;
    if (path === '/') return window.history.state?.storyBridgePage || 'landing';
    if (path === '/discover') return 'discover';
    if (path === '/cultures') return 'cultures';
    if (path === '/search') return 'search';
    if (path === '/notifications') return 'notifications';
    if (path === '/listen') return 'listen';
    if (path === '/mine') return 'mine';
    if (path === '/workspace') return 'workspace';
    if (path === '/profile') return 'profile';
    if (path === '/share') return 'share';
    if (path === '/objects') return 'objects';
    if (path.startsWith('/objects/')) return `object:${decodeURIComponent(path.slice('/objects/'.length))}`;
    if (path === '/terms') return 'terms';
    if (path === '/privacy') return 'privacy';
    if (/^\/stories\/[^/]+$/.test(path)) return 'detail';
    return 'landing';
  };
  const storyIdFromPath = () => {
    const match = window.location.pathname.match(/^\/stories\/([^/]+)$/);
    if (!match) return '';
    try { return decodeURIComponent(match[1]); } catch { return ''; }
  };
  const [page, setPage] = useState(pathPage);
  const [stories, setStories] = useState([]);
  const [mine, setMine] = useState([]);
  const [current, setCurrent] = useState(null);
  const [detailReturnPage, setDetailReturnPage] = useState('discover');
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
  const [deleteConfirmationId, setDeleteConfirmationId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [toast, setToast] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [checkedBy, setCheckedBy] = useState('');
  const [accountConfig, setAccountConfig] = useState(null);
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authStep, setAuthStep] = useState('email');
  const [profileName, setProfileName] = useState('');
  const [profileCountry,setProfileCountry]=useState('');
  const [profileLanguages,setProfileLanguages]=useState('');
  const [profileAvatar,setProfileAvatar]=useState('');
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
  const [profileAccountOpen, setProfileAccountOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [languageFilter, setLanguageFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [audioOnly, setAudioOnly] = useState(false);
  const [shareStep,setShareStep]=useState(1);
  const [postMeta,setPostMeta]=useState(EMPTY_POST_META);
  const [postImages,setPostImages]=useState([]);
  const [imageDetails,setImageDetails]=useState([]);
  const [objectContext,setObjectContext]=useState(null);
  const [objectSettings,setObjectSettings]=useState(null);
  const [objectAccessSaving,setObjectAccessSaving]=useState('');
  const [objectAccessError,setObjectAccessError]=useState('');
  const [museumFilter,setMuseumFilter]=useState('all');
  const [objectTypeFilter,setObjectTypeFilter]=useState('all');
  const [pendingPosts,setPendingPosts]=useState([]);
  const [pendingPostsError,setPendingPostsError]=useState('');
  const [reviewBaseline, setReviewBaseline] = useState(null);
  const generation = useRef(0);
  const listRequest = useRef({ stories: 0, mine: 0 });
  const currentSession = useRef('');
  const identityEpoch = useRef(0);
  const pageRef = useRef(page);
  const viewEpoch = useRef(0);
  const detailRequest = useRef(0);
  const profileRequest = useRef(0);
  const mutationRequest = useRef(0);
  const translationRequest = useRef(0);
  const translationBusyRef = useRef(false);
  const emptyForm = { originalLanguage: '', text: '', translationLanguage: '', translation: '', translationOrigin: 'storyteller', translationApproved: false, storytellerName: '', showName: false };
  const [authBusy, setAuthBusy] = useState(false);
  const [welcomeBusy,setWelcomeBusy]=useState(false);
  const [welcomeError,setWelcomeError]=useState('');
  const captureBusyRef = useRef(false);
  const activeIdentity = session?.user?.id || (accountConfig?.account ? '' : 'legacy');

  useEffect(() => {
    if (!accountConfig) return;
    let live=true;
    queueMicrotask(()=>api('/api/objects').then(value=>{if(live)setObjectSettings(value)}).catch(()=>{if(live)setObjectSettings({objects:[],canManage:false,error:true})}));
    return()=>{live=false};
  }, [accountConfig, session?.user?.id, session?.access_token, page]);

  useEffect(()=>{if(!objectSettings?.canManage||page!=='mine')return;let live=true;api('/api/admin/posts/pending').then(rows=>{if(live)setPendingPosts(rows)}).catch(error=>{if(live)setPendingPostsError(error.message)});return()=>{live=false}},[objectSettings?.canManage,page]);

  async function approvePendingPost(postId){try{await api(`/api/admin/posts/${postId}/approve`,{method:'POST'});setPendingPosts(items=>items.filter(item=>item.id!==postId));}catch(error){setPendingPostsError(error.message)}}

  function transitionTo(nextPage, targetStoryId = '') {
    if (pageRef.current !== nextPage) { pageRef.current = nextPage; viewEpoch.current += 1; }
    const routes = { landing:'/', discover:'/discover', listen:'/listen', mine:'/mine', workspace:'/workspace', profile:'/profile', share:'/share', objects:'/objects', cultures:'/cultures', search:'/search', notifications:'/notifications', terms:'/terms', privacy:'/privacy' };
    const storyId = targetStoryId || current?.id || storyIdFromPath();
    const route = nextPage === 'detail' && storyId ? `/stories/${encodeURIComponent(storyId)}` : routes[nextPage] || (nextPage.startsWith('object:') ? `/objects/${encodeURIComponent(nextPage.slice(7))}` : '/');
    // Keep the OAuth callback (?code=… / ?error=…) until Supabase has read it; it is removed after getSession().
    const oauthCallback = /[?&](code|error|error_description)=/.test(window.location.search) ? window.location.search : '';
    if (window.location.pathname !== route || window.history.state?.storyBridgePage !== nextPage) window.history[oauthCallback ? 'replaceState' : 'pushState']({ storyBridgePage: nextPage }, '', route + oauthCallback);
    setPage(nextPage);
    if(nextPage==='mine'&&session?.access_token)api('/api/objects').then(setObjectSettings).catch(()=>setObjectSettings({objects:[],canManage:false,error:true}));
  }

  useEffect(() => {
    const onPopState = () => { const next = pathPage(); pageRef.current = next; viewEpoch.current += 1; setPage(next); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);

  function scopeIsCurrent(scope, requireView = true) {
    return activeIdentity === scope.identity && currentSession.current === scope.identity && identityEpoch.current === scope.epoch &&
      (!requireView || (pageRef.current === scope.page && viewEpoch.current === scope.view));
  }

  function captureScope() {
    return { identity: currentSession.current, epoch: identityEpoch.current, page: pageRef.current, view: viewEpoch.current };
  }

  function clearPrivateState(nextPage) {
    mutationRequest.current += 1; profileRequest.current += 1; detailRequest.current += 1;
    setObjectContext(null);
    mutationBusyRef.current = false; captureBusyRef.current = false;
    translationRequest.current += 1; translationBusyRef.current = false; setTranslationBusy(false); setTranslationError('');
    setCurrent(null); setTranslationStoryId(''); setReview(null); setReviewBaseline(null);
    setForm(emptyForm); setFile(null); setFileKind(''); setAudioSaved(false); setCaptureBusy(false);
    setReviewVisibility('private'); setCheckedBy(''); setWithdrawConfirmationId('');
    setProfileName(''); setSavedProfileName(''); setProfileState('idle'); setProfileError(''); setProfileNotice('');
    setError(''); setSaving(false);
    transitionTo(nextPage);
  }

  // The avatar endpoint needs the session token, which an <img src> cannot send.
  // Fetch it with the token and show it from a short-lived blob URL instead.
  async function showAvatar(url) {
    if (!url) { setProfileAvatar(previous => { if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous); return ''; }); return; }
    try {
      const objectUrl = await authorizedObjectUrl(`${url}?v=${Date.now()}`);
      setProfileAvatar(previous => { if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous); return objectUrl; });
    } catch { setProfileAvatar(''); }
  }

  async function loadProfile(identity = currentSession.current, epoch = identityEpoch.current, viewScoped = false) {
    const requestId = ++profileRequest.current;
    const scope = captureScope();
    setProfileState('loading'); setProfileError(''); setProfileNotice('');
    try {
      const profile = await api('/api/account/profile');
      if (currentSession.current !== identity || identityEpoch.current !== epoch || profileRequest.current !== requestId || (viewScoped && !scopeIsCurrent(scope))) return;
      const name = typeof profile?.display_name === 'string' ? profile.display_name : '';
      setSavedProfileName(name); setProfileName(name);setProfileCountry(profile.country||'');setProfileLanguages(Array.isArray(profile.languages)?profile.languages.join(', '):'');showAvatar(profile.avatar_url||''); setProfileState('ready');
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
        client.auth.getSession().then(({ data,error }) => { const params=new URLSearchParams(window.location.search);const callbackError=params.get('error_description')||params.get('error');if(callbackError)setError('Google sign-in could not be completed. Try again.');if(params.has('code')||params.has('access_token')||params.has('refresh_token')||params.has('error')){history.replaceState(history.state,'',window.location.pathname+window.location.hash)}if(error)setError('Sign-in could not be completed. Try again.');setSession(data.session);setSessionResolved(true); }).catch(() => setSessionResolved(true));
        const { data } = client.auth.onAuthStateChange((_event, next) => { setSession(next); setSessionResolved(true); });
        unsubscribe = () => data.subscription.unsubscribe();
      } else refresh();
    }).catch(() => { setAccountConfig(null); setConfigError('Story Bridge could not load its configuration. Try again.'); });
    return () => unsubscribe();
  }, [configAttempt]);
  useEffect(() => {
    const sessionKey = session?.user?.id || (accountConfig?.account ? '' : 'legacy');
    const identityChanged = currentSession.current !== sessionKey;
    setAccountSessionToken(session?.access_token || '');
    if (identityChanged) {
      currentSession.current = sessionKey;
      identityEpoch.current += 1;
      const initialPublicPage = ['landing','discover','listen','detail','objects','group-record'].includes(pageRef.current) || pageRef.current.startsWith('object:') ? pageRef.current : ['profile','mine','workspace','share'].includes(pageRef.current) ? pageRef.current : 'discover';
      const keepPublicObjectRoute = initialPublicPage === 'objects' || initialPublicPage === 'group-record' || initialPublicPage.startsWith('object:');
      const needsWelcome=!!session&&!session.user?.user_metadata?.story_bridge_welcome_completed;
      clearPrivateState(accountConfig?.account && session && !keepPublicObjectRoute ? (needsWelcome?'welcome':initialPublicPage==='landing'?'discover':initialPublicPage) : initialPublicPage);
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
  useEffect(() => {
    if (!accountConfig || page !== 'detail') return undefined;
    if (accountConfig.account && !sessionResolved) return undefined;
    const id = storyIdFromPath();
    if (!id) { setError('This story link is invalid.'); return undefined; }
    if (current?.id === id) return undefined;
    let live = true;
    const requestId = ++detailRequest.current;
    const identity = currentSession.current;
    const epoch = identityEpoch.current;
    setCurrent(null);
    api(`/api/stories/${encodeURIComponent(id)}`).then(story => {
      if (live && currentSession.current === identity && identityEpoch.current === epoch && detailRequest.current === requestId) {
        const activeSessionKey = session?.user?.id || (accountConfig.account ? '' : 'legacy');
        setCurrent({ ...story, _own: listOwner === activeSessionKey && mine.some(item => item.id === id) });
      }
    }).catch(() => {
      if (live && currentSession.current === identity && identityEpoch.current === epoch && detailRequest.current === requestId) setError('This story could not be loaded. It may be private or no longer available.');
    });
    return () => { live = false; };
  }, [page, window.location.pathname, accountConfig, session?.access_token, sessionResolved]);
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
    try{const {error:cause}=await supabase.auth.signInWithOtp({email:authEmail.trim(),options:{shouldCreateUser:true,emailRedirectTo:window.location.origin}});if(cause)throw cause;setAuthStep('code')}catch(cause){setError(/rate|too many/i.test(cause.message)?'Too many code requests. Wait before trying again.':'If this address can receive a sign-in code, it will arrive shortly. Check the address and try again.')}finally{setAuthBusy(false)}
  }
  async function verifyEmailCode(event) {
    event.preventDefault(); setError(''); setAuthBusy(true);
    try{const {error:cause}=await supabase.auth.verifyOtp({email:authEmail.trim(),token:authCode.trim(),type:'email'});if(cause)throw cause;}catch(cause){setError(/rate|too many/i.test(cause.message)?'Too many attempts. Wait before trying again.':'That code is incorrect or expired. Request a new code and try again.')}finally{setAuthBusy(false)}
  }
  async function resendEmailCode(){await sendEmailCode({preventDefault(){}})}
  async function completeWelcome(values){setWelcomeBusy(true);setWelcomeError('');try{const profile=await api('/api/account/profile',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:values.displayName,country:values.country,languages:values.languages})});if(values.photo){const body=new FormData();body.append('avatar',values.photo);await api('/api/account/profile/avatar',{method:'POST',body});}const {error:cause}=await supabase.auth.updateUser({data:{story_bridge_welcome_completed:true,terms_accepted_at:new Date().toISOString(),privacy_accepted_at:new Date().toISOString()}});if(cause)throw cause;setSavedProfileName(profile.display_name||'');setProfileName(profile.display_name||'');setProfileCountry(profile.country||'');setProfileLanguages((profile.languages||[]).join(', '));(values.photo&&showAvatar('/api/account/profile/avatar'));setShowSignIn(false);transitionTo('discover')}catch{setWelcomeError('Your welcome details could not be saved. Try again.');}finally{setWelcomeBusy(false)}}
  async function signOut(global=false) {
    if (hasUnsavedChanges() && !window.confirm('You have unsaved changes. Sign out and discard them?')) return;
    if (!supabase) return;
    const oldIdentity = currentSession.current;
    currentSession.current = ''; identityEpoch.current += 1; setAccountSessionToken('');
    setAuthStep('email'); setAuthEmail(''); setAuthCode('');
    setStories([]); setMine([]); setListOwner('');
    clearPrivateState('landing');
    try {
      const { error: cause } = await supabase.auth.signOut(global?{scope:'global'}:undefined);
      if (cause) {
        currentSession.current = oldIdentity; identityEpoch.current += 1; setAccountSessionToken(session?.access_token || '');
        clearPrivateState('workspace'); setListState({ stories:'loading', mine:'loading' }); setListOwner('');
        setError('Sign out could not be completed. Try again.'); refresh(oldIdentity); loadProfile(oldIdentity, identityEpoch.current);
        return;
      }
      setSession(null); setShowSignIn(true); transitionTo('landing');
    } catch {
      currentSession.current = oldIdentity; identityEpoch.current += 1; setAccountSessionToken(session?.access_token || '');
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
      const profile = await api('/api/account/profile', { method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({displayName:submittedName,country:profileCountry,languages:profileLanguages.split(',').map(item=>item.trim()).filter(Boolean)}) });
      // Always leave the saving state for the latest request, even if the view changed meanwhile.
      if (profileRequest.current !== requestId) return false;
      const savedName = typeof profile?.display_name === 'string' ? profile.display_name : '';
      setSavedProfileName(savedName); setProfileName(savedName);
      if (typeof profile?.country === 'string') setProfileCountry(profile.country);
      if (Array.isArray(profile?.languages)) setProfileLanguages(profile.languages.join(', '));
      setProfileState('ready');
      if (scopeIsCurrent(scope)) { setProfileNotice('Profile saved.'); setToast('Profile saved'); }
      return true;
    } catch {
      if (profileRequest.current !== requestId) return false;
      setProfileState('ready'); setProfileError('Your profile could not be saved. Try again.');
      return false;
    }
  }
  function openSettings() { setProfileAccountOpen(true); navigate('profile'); }
  const appHeader = <AppHeader page={page} signedIn={!!session} accountEnabled={!!accountConfig?.account} profileName={profileName || savedProfileName} profileAvatar={profileAvatar} onNavigate={navigate} onSignIn={() => setShowSignIn(true)} onSignOut={signOut} onSettings={openSettings}/>;
  const mobileNav = <AppMobileNav page={page} onNavigate={navigate}/>;
  if (!accountConfig) return <div className="app">{appHeader}{!isOnline && <p className="offline-banner" role="status">You’re offline. Some app files may still be available on this device.</p>}<main>{configError ? <section className="panel" role="alert"><h1>Story Bridge is unavailable</h1><p>{configError}</p><button className="secondary" onClick={() => setConfigAttempt(value => value + 1)}>Try again</button></section> : <p>Loading Story Bridge…</p>}</main>{mobileNav}</div>;
  if(page==='terms'||page==='privacy')return <div className="app">{appHeader}<LegalPage type={page} onBack={()=>transitionTo('landing')}/>{mobileNav}</div>;
  // Private pages need a session: show the sign-in screen instead of an empty "could not be loaded" list.
  const privatePage = ['workspace', 'mine', 'review', 'profile', 'share'].includes(page);
  if (accountConfig.account && !session && (showSignIn || privatePage)) return <div className="app">{appHeader}<SignInPage accountConfig={accountConfig} authStep={authStep} authBusy={authBusy} authEmail={authEmail} setAuthEmail={setAuthEmail} authCode={authCode} setAuthCode={setAuthCode} sendEmailCode={sendEmailCode} resendEmailCode={resendEmailCode} verifyEmailCode={verifyEmailCode} supabase={supabase} setError={setError} setAuthBusy={setAuthBusy} setAuthStep={setAuthStep} setShowSignIn={value => { setShowSignIn(value); if (!value && privatePage) transitionTo('landing'); }} error={error} dismissError={() => setError('')}/>{mobileNav}</div>;
  if (accountConfig.account&&session&&page==='welcome')return <div className="app">{appHeader}<WelcomePage saving={welcomeBusy} error={welcomeError} onComplete={completeWelcome}/>{mobileNav}</div>;
  if (accountConfig.account && !session && page==='landing') return <div className="app">{appHeader}<Landing showSignIn repoUrl="https://github.com/josuekb09/Story-Bridge" onListen={()=>transitionTo('listen')} onObjects={()=>transitionTo('objects')} onShare={()=>setShowSignIn(true)} onSignIn={()=>setShowSignIn(true)}/>{mobileNav}</div>;
  if (currentSession.current !== activeIdentity) return <div className="app">{appHeader}<main><p role="status">Loading your account…</p></main>{mobileNav}</div>;

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
      if (page === 'share') { setForm(emptyForm); setFile(null); setFileKind(''); setAudioSaved(false); setShareStep(1);setPostMeta(EMPTY_POST_META);setPostImages([]);setImageDetails([]); }
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
    if (page === 'share') return captureBusy || captureBusyRef.current || JSON.stringify(form) !== JSON.stringify(emptyForm) || JSON.stringify(postMeta)!==JSON.stringify(EMPTY_POST_META) || postImages.length>0 || !!(file && !audioSaved);
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

  async function deleteStory(story) {
    setDeletingId(story.id); setError('');
    try {
      await api(`/api/stories/${story.id}`, { method: 'DELETE' });
      setMine(list => list.filter(item => item.id !== story.id));
      setStories(list => list.filter(item => item.id !== story.id));
      setDeleteConfirmationId(''); setWithdrawConfirmationId('');
      if (current?.id === story.id) { setCurrent(null); transitionTo('mine'); }
      setToast('Story deleted');
    } catch (cause) { setError(cause.message || 'The story could not be deleted. Try again.'); }
    finally { setDeletingId(''); }
  }

  async function changeAvatar(file) {
    if (!file) return;
    setAvatarBusy(true); setProfileError('');
    try {
      const body = new FormData(); body.append('avatar', file);
      await api('/api/account/profile/avatar', { method: 'POST', body });
      await showAvatar('/api/account/profile/avatar');
      setToast('Photo updated');
    } catch { setProfileError('Your photo could not be saved. Use a JPEG, PNG or WebP under 2 MB.'); }
    finally { setAvatarBusy(false); }
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
    Object.entries(postMeta).filter(([key])=>key!=='sources').forEach(([key,value])=>formData.append(key,String(value)));
    const sources=postMeta.sources.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const split=line.indexOf('|');return split<0?{label:line,url:line}:{label:line.slice(0,split).trim(),url:line.slice(split+1).trim()};});
    formData.append('sources',JSON.stringify(sources));
    formData.append('imageMetadata',JSON.stringify(imageDetails));
    postImages.forEach(image=>formData.append('images',image));
    if (objectContext && OBJECT_IDS.includes(objectContext.id)) formData.append('objectId', objectContext.id);
    if (file) formData.append('audio', file);
    try {
      const story = await api('/api/stories', { method: 'POST', body: formData });
      if (!scopeIsCurrent(scope) || mutationRequest.current !== requestId) return;
      const savedAudio = !!file && !!story.audio;
      setForm(emptyForm); setFile(null); setFileKind(''); setPostImages([]); setImageDetails([]);setPostMeta(EMPTY_POST_META);setShareStep(1);
      setAudioSaved(savedAudio);
      setReview({ ...story, audioSaved: savedAudio });
      setReviewBaseline({ text: story.text || '', translation: story.translation || '', visibility: story.visibility || 'private' });
      setReviewVisibility(story.visibility || 'private');
      // Open the review straight away: the draft is saved. Waiting for refresh() first let the
      // view scope change, so the user was sent back to step 1 and thought nothing was saved.
      transitionTo('review');
      setToast('Draft saved');
      refresh().catch(() => {});
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

  async function startReview(story) {
    const scope=captureScope(); const requestId=++detailRequest.current;
    try {
      const fullStory=await api(`/api/stories/${story.id}`);
      if(!scopeIsCurrent(scope)||detailRequest.current!==requestId)return;
      setReview(fullStory);setCurrent(fullStory);setReviewVisibility(fullStory.visibility||'private');
      setReviewBaseline({text:fullStory.text||'',translation:fullStory.translation||'',visibility:fullStory.visibility||'private'});
      setWithdrawConfirmationId('');setCheckedBy(fullStory.checkedBy||'');transitionTo('review');
    } catch(cause) { if(scopeIsCurrent(scope)&&detailRequest.current===requestId)setError(cause.message); }
  }

  async function showStory(story, own = false) {
    setDetailReturnPage(pageRef.current === 'detail' ? detailReturnPage : pageRef.current);
    const scope = captureScope(); const requestId = ++detailRequest.current;
    try {
      const fullStory = await api(`/api/stories/${story.id}`);
      if (!scopeIsCurrent(scope) || detailRequest.current !== requestId) return;
      setCurrent({ ...fullStory, _own: own });
      setTranslationStoryId('');
      transitionTo('detail', story.id);
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
  const objectAccess = id => objectSettings?.objects?.find(item=>item.id===id)?.access || OBJECT_RECORDS.find(item=>item.id===id)?.access || 'Public';
  const publicObjects=OBJECT_RECORDS.map(record=>objectRecordView({...record,access:objectAccess(record.id)}, { owner: !!session?.user?.id }));
  const visibleObjects=publicObjects.filter(record=>(museumFilter==='all'||record.holderToday===museumFilter)&&(objectTypeFilter==='all'||record.whatItIs===objectTypeFilter));
  const museumChoices=[...new Set(OBJECT_RECORDS.map(record=>record.holderToday))];
  const typeChoices=[...new Set(OBJECT_RECORDS.map(record=>record.whatItIs))];
  const objectStories = objectId => [...new Map([...visibleStories,...visibleMine].filter(story=>story.objectId===objectId).map(story=>[story.id,story])).values()];
  async function saveObjectAccess(id, access) {
    setObjectAccessSaving(id); setObjectAccessError('');
    try { await api(`/api/objects/${id}/access`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({access})}); setObjectSettings(value=>({...value,objects:value.objects.map(item=>item.id===id?{...item,access}:item)})); }
    catch(cause){setObjectAccessError(cause.message)} finally{setObjectAccessSaving('')}
  }
  function addVoiceToObject(record) {
    setObjectContext(record);
    setForm({ ...emptyForm, originalLanguage: '' });
    setShareStep(1);
    setError('');
    transitionTo('share');
  }

  return page === 'landing'
    ? <div className="app">{appHeader}{!isOnline && <p className="offline-banner" role="status">You’re offline. Some app files may still be available on this device.</p>}<Landing showSignIn={!!accountConfig.account} repoUrl="https://github.com/josuekb09/Story-Bridge" onListen={()=>navigate('listen')} onObjects={()=>navigate('objects')} onShare={()=>navigate('share')} onSignIn={()=>setShowSignIn(true)}/>{mobileNav}</div>
    : <div className="app">
      {appHeader}
      {!isOnline && <p className="offline-banner" role="status">You’re offline. Some app files may still be available on this device.</p>}
      {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">Dismiss</button></div>}

      {page === 'workspace' && accountConfig.account && <WorkspacePage savedProfileName={savedProfileName} profileState={profileState} navigate={navigate} listState={listState} listErrors={listErrors} retryList={retryList} counts={counts} setCollectionFilter={setCollectionFilter} draftStories={draftStories} startReview={startReview}/>}
      {(page === 'listen' || page === 'discover') && <FeedPage accountConfig={accountConfig} visibleStories={visibleStories} languageFilter={languageFilter} setLanguageFilter={setLanguageFilter} regionFilter={regionFilter} setRegionFilter={setRegionFilter} audioOnly={audioOnly} setAudioOnly={setAudioOnly} listState={listState} listErrors={listErrors} retryList={retryList} filteredStories={filteredStories} navigate={navigate} translationStoryId={translationStoryId} setTranslationStoryId={setTranslationStoryId} showStory={showStory} transitionTo={transitionTo} signedIn={!!session}/>}
      {page === 'profile' && accountConfig.account && <ProfilePage navigate={navigate} profileState={profileState} profileError={profileError} loadProfile={loadProfile} identity={currentSession.current} epoch={identityEpoch.current} profileName={profileName} setProfileName={setProfileName} profileCountry={profileCountry} setProfileCountry={setProfileCountry} profileLanguages={profileLanguages} setProfileLanguages={setProfileLanguages} profileAvatar={profileAvatar} profileNotice={profileNotice} saveProfile={saveProfile} signOut={signOut} changeAvatar={changeAvatar} avatarBusy={avatarBusy} storyCount={visibleMine.length} publicCount={counts.public} email={session?.user?.email || ''} accountOpen={profileAccountOpen} onAccountToggle={setProfileAccountOpen}/>}
      {page === 'detail' && current && <StoryDetailPage story={current} navigate={navigate} backPage={detailReturnPage}/>}
      {page === 'detail' && !current && <main>{error ? <section className="panel" role="alert"><p>{error}</p><button className="secondary" onClick={() => navigate(accountConfig.account ? 'discover' : 'listen')}>Back to stories</button></section> : <p role="status">Loading story…</p>}</main>}
      {page === 'objects' && <ObjectsPage objectSettings={objectSettings} visibleObjects={visibleObjects} museumFilter={museumFilter} setMuseumFilter={setMuseumFilter} museumChoices={museumChoices} objectTypeFilter={objectTypeFilter} setObjectTypeFilter={setObjectTypeFilter} typeChoices={typeChoices} transitionTo={transitionTo} retry={() => setObjectSettings(null)}/>}
      {page === 'group-record' && <CulturalGroupPage record={CULTURAL_GROUP_RECORD} navigate={navigate} onAddVoice={addVoiceToObject}/>}
      {page.startsWith('object:') && <ObjectRecordPage source={OBJECT_RECORDS.find(item => item.id === page.slice(7))} objectSettings={objectSettings} session={session} objectAccessSaving={objectAccessSaving} objectAccessError={objectAccessError} saveObjectAccess={saveObjectAccess} linkedStories={objectStories(page.slice(7))} showStory={showStory} addVoiceToObject={addVoiceToObject} navigate={navigate}/>}
      {page === 'share' && <SharePage objectContext={objectContext} form={form} setForm={setForm} change={change} postMeta={postMeta} setPostMeta={setPostMeta} file={file} fileKind={fileKind} audioSaved={audioSaved} saving={saving} captureBusy={captureBusy} onAudioChange={onAudioChange} onCaptureBusyChange={onCaptureBusyChange} shareStep={shareStep} setShareStep={setShareStep} postImages={postImages} setPostImages={setPostImages} imageDetails={imageDetails} setImageDetails={setImageDetails} translationBusy={translationBusy} translationError={translationError} requestTranslationDraft={requestTranslationDraft} translationApprovalCanContinue={translationApprovalCanContinue} createDraft={createDraft}/>}
      {page === 'review' && review && <ReviewPage review={review} setReview={setReview} saving={saving} saveReviewEdits={saveReviewEdits} checkedBy={checkedBy} setCheckedBy={setCheckedBy} reviewVisibility={reviewVisibility} setReviewVisibility={setReviewVisibility} saveReview={saveReview} objectContext={objectContext} transitionTo={transitionTo} navigate={navigate}/>}
      {page === 'mine' && <MyStoriesPage accountConfig={accountConfig} listState={listState} listErrors={listErrors} retryList={retryList} objectSettings={objectSettings} pendingPosts={pendingPosts} pendingPostsError={pendingPostsError} approvePendingPost={approvePendingPost} collectionFilter={collectionFilter} setCollectionFilter={setCollectionFilter} visibleMine={visibleMine} sortedMine={sortedMine} counts={counts} category={category} showStory={showStory} startReview={startReview} withdrawConfirmationId={withdrawConfirmationId} setWithdrawConfirmationId={setWithdrawConfirmationId} saving={saving} withdrawStory={withdrawStory} deleteConfirmationId={deleteConfirmationId} setDeleteConfirmationId={setDeleteConfirmationId} deleteStory={deleteStory} deletingId={deletingId}/>}
      {['cultures','search','notifications'].includes(page) && <main className="phase-placeholder"><section className="panel"><h1>{page === 'cultures' ? 'Cultures' : page === 'search' ? 'Search' : 'Notifications'}</h1><p>This page is being prepared.</p></section></main>}
      {toast && <div className="app-toast" role="status" aria-live="polite">✓ {toast}</div>}
      <AppMobileNav page={page} onNavigate={navigate}/>
      <footer>Stories stay under the storyteller’s control.</footer>
    </div>;
}
