import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import FeedPage from '../pages/FeedPage.jsx';
import { AppHeader, AppMobileNav } from '../components/AppHeader.jsx';
import { api, ownerToken, setAccountSessionToken, authorizedObjectUrl } from '../lib/api.js';
import { editAiTranslationDraft, translationApprovalCanContinue } from '../translation-draft.js';
import { OBJECT_RECORDS, CULTURAL_GROUP_RECORD, OBJECT_IDS, objectRecordView } from '../object-records.js';

const Landing = lazy(() => import('../pages/LandingPage.jsx'));
const SignInPage = lazy(() => import('../pages/SignInPage.jsx'));
const WelcomePage = lazy(() => import('../pages/WelcomePage.jsx'));
const LegalPage = lazy(() => import('../pages/LegalPage.jsx'));
const ProfilePage = lazy(() => import('../pages/ProfilePage.jsx'));
const StoryDetailPage = lazy(() => import('../pages/StoryDetailPage.jsx'));
const ObjectsPage = lazy(() => import('../pages/ObjectsPage.jsx'));
const CulturalGroupPage = lazy(() => import('../pages/CulturalGroupPage.jsx'));
const ObjectRecordPage = lazy(() => import('../pages/ObjectRecordPage.jsx'));
const SharePage = lazy(() => import('../pages/SharePage.jsx'));
const ReviewPage = lazy(() => import('../pages/ReviewPage.jsx'));
const WorkspacePage = lazy(() => import('../pages/WorkspacePage.jsx'));
const MyStoriesPage = lazy(() => import('../pages/MyStoriesPage.jsx'));
const CulturesPage = lazy(() => import('../pages/CulturesPage.jsx'));
const SearchPage = lazy(() => import('../pages/SearchPage.jsx'));
const AdminPostsPage = lazy(() => import('../pages/AdminPostsPage.jsx'));
const pageLoading = <main className="page-loading" aria-busy="true"><p role="status">Loading page…</p></main>;

const EMPTY_POST_META = {title:'',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'',access:'Public',consentConfirmed:false};

export default function App() {
  const pathPage = () => {
    const path = window.location.pathname;
    if (path === '/') return window.history.state?.storyBridgePage || 'landing';
    if (path === '/discover') return 'discover';
    if (path.startsWith('/cultures')) return 'cultures';
    if (path === '/search') return 'search';
    if (path === '/admin') return 'admin';
    if (path === '/listen') return 'listen';
    if (path === '/mine') return 'mine';
    if (path === '/workspace') return 'workspace';
    if (path === '/profile') return 'profile';
    if (path === '/share') return 'share';
    if (path === '/objects') return 'objects';
    if (path.startsWith('/objects/')) return `object:${decodeURIComponent(path.slice('/objects/'.length))}`;
    if (path === '/terms') return 'terms';
    if (path === '/privacy') return 'privacy';
    if (path === '/guidelines') return 'guidelines';
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
  const [form, setForm] = useState({ originalLanguage: '', text: '', translationLanguage: '', translation: '', translationOrigin: 'storyteller', translationApproved: false, postAsCommunityMember: false });
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
  const [adminAccess,setAdminAccess]=useState('unavailable');
  const [adminBusyId,setAdminBusyId]=useState('');
  const [adminRetry,setAdminRetry]=useState(0);
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
  const emptyForm = { originalLanguage: '', text: '', translationLanguage: '', translation: '', translationOrigin: 'storyteller', translationApproved: false, postAsCommunityMember: false };
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

  useEffect(()=>{
    let live=true;
    if(!accountConfig?.account||!session?.access_token){setAdminAccess('unavailable');setPendingPosts([]);setPendingPostsError('');return()=>{live=false};}
    setAdminAccess('checking');setPendingPostsError('');setAccountSessionToken(session.access_token);
    api('/api/admin/posts/pending').then(rows=>{if(!Array.isArray(rows))throw new Error('Invalid admin response');if(live){setPendingPosts(rows);setAdminAccess('available');}}).catch(()=>{if(live){setPendingPosts([]);setAdminAccess('unavailable');}});
    return()=>{live=false};
  },[accountConfig?.account,session?.user?.id,session?.access_token,adminRetry,page==='admin']);

  async function moderatePendingPost(postId,action){
    setPendingPostsError('');setAdminBusyId(postId);
    try{await api(`/api/admin/posts/${encodeURIComponent(postId)}/${action}`,{method:'POST'});setPendingPosts(items=>items.filter(item=>item.id!==postId));setToast(action==='approve'?'Published':'Kept private');}
    catch(error){setPendingPostsError(error.message||'The post could not be updated.');}
    finally{setAdminBusyId('');}
  }

  function transitionTo(nextPage, targetStoryId = '') {
    if (pageRef.current !== nextPage) { pageRef.current = nextPage; viewEpoch.current += 1; }
    const currentPath = window.location.pathname;
    const routes = { landing:'/', discover:'/discover', listen:'/listen', mine:'/mine', workspace:'/workspace', profile:'/profile', share:'/share', objects:'/objects', cultures:'/cultures', search:'/search', admin:'/admin', terms:'/terms', privacy:'/privacy', guidelines:'/guidelines' };
    const storyId = targetStoryId || current?.id || storyIdFromPath();
    const route = nextPage === 'cultures' && currentPath.startsWith('/cultures/')
      ? currentPath
      : nextPage === 'detail' && storyId ? `/stories/${encodeURIComponent(storyId)}` : routes[nextPage] || (nextPage.startsWith('object:') ? `/objects/${encodeURIComponent(nextPage.slice(7))}` : '/');
    // Keep the OAuth callback (?code=… / ?error=…) until Supabase has read it; it is removed after getSession().
    const oauthCallback = /[?&](code|error|error_description)=/.test(window.location.search) ? window.location.search : '';
    const keepSearchQuery = nextPage === 'search' && currentPath === '/search';
    const routeSearch = keepSearchQuery || currentPath === route ? window.location.search : '';
    if (currentPath !== route || window.history.state?.storyBridgePage !== nextPage) window.history[oauthCallback ? 'replaceState' : 'pushState']({ storyBridgePage: nextPage }, '', route + (oauthCallback || routeSearch));
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
    if (pageRef.current === 'cultures' || pageRef.current === 'search') refresh('', 'stories');
    let unsubscribe = () => {};
    setConfigError('');
    fetch('/api/account/config').then(response => { if (!response.ok) throw Error('Configuration unavailable'); return response.json(); }).then(async config => {
      if (!config || typeof config.account !== 'boolean') throw Error('Invalid configuration');
      setAccountConfig(config);
      if (config.account) {
        refresh('','stories');
        const { createClient } = await import('@supabase/supabase-js');
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
      const initialPublicPage = ['landing','discover','listen','detail','objects','group-record','cultures','search','terms','privacy','guidelines'].includes(pageRef.current) || pageRef.current.startsWith('object:') ? pageRef.current : ['profile','mine','workspace','share','admin'].includes(pageRef.current) ? pageRef.current : 'discover';
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
        setCurrent({ ...story, _own: !!story.isOwner || listOwner === activeSessionKey && mine.some(item => item.id === id) });
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
  async function deleteAccount() {
    try { await api('/api/account',{method:'DELETE'}); }
    catch(cause) { setProfileError(cause.message||'Your account could not be deleted. Try again.');return false; }
    try { await supabase?.auth.signOut({scope:'local'}); } catch { /* The server already deleted this account. */ }
    currentSession.current='';identityEpoch.current+=1;setAccountSessionToken('');setSession(null);setShowSignIn(true);
    setStories([]);setMine([]);setListOwner('');setListState({stories:'loading',mine:'idle'});
    clearPrivateState('landing');setToast('Account deleted');return true;
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
      if (scopeIsCurrent(scope)) { await refresh(scope.identity); setProfileNotice('Profile saved.'); setToast('Profile saved'); }
      return true;
    } catch {
      if (profileRequest.current !== requestId) return false;
      setProfileState('ready'); setProfileError('Your profile could not be saved. Try again.');
      return false;
    }
  }
  function openSettings() { setProfileAccountOpen(true); navigate('profile'); }
  const objectTitle = page.startsWith('object:') ? OBJECT_RECORDS.find(record => record.id === page.slice(7))?.title : '';
  const documentTitle = showSignIn && !session ? 'Sign in — Story Bridge' : page === 'detail' && current?.status === 'shared' && current?.visibility === 'public'
    ? `${current.title || 'Story'} — Story Bridge`
    : page.startsWith('object:') ? `${objectTitle || 'Objects'} — Story Bridge`
      : ({ landing: 'Story Bridge — Your story, in your own voice', discover: 'Discover — Story Bridge', listen: 'Discover — Story Bridge', cultures: 'Cultures — Story Bridge', search: 'Search — Story Bridge', admin: 'Admin — Story Bridge', share: 'Share a story — Story Bridge', mine: 'My stories — Story Bridge', workspace: 'My workspace — Story Bridge', profile: 'Profile — Story Bridge', review: 'Review — Story Bridge', detail: 'Story — Story Bridge', objects: 'Objects — Story Bridge', 'group-record': 'Luluwa — Story Bridge', terms: 'Terms — Story Bridge', privacy: 'Privacy — Story Bridge', guidelines: 'Community guidelines — Story Bridge', welcome: 'Welcome — Story Bridge' }[page] || 'Story Bridge');
  useEffect(() => { document.title = documentTitle; }, [documentTitle]);
  const policyFooter = <footer className="site-policy-footer"><span>Stories stay under the storyteller’s control.</span><nav aria-label="Policies"><a href="/guidelines">Community guidelines</a><span aria-hidden="true"> · </span><a href="/terms">Terms</a><span aria-hidden="true"> · </span><a href="/privacy">Privacy</a></nav></footer>;
  const appHeader = <AppHeader page={page} signedIn={!!session} accountEnabled={!!accountConfig?.account} adminEnabled={adminAccess==='available'} profileName={profileName || savedProfileName} profileAvatar={profileAvatar} onNavigate={navigate} onSignIn={() => setShowSignIn(true)} onSignOut={signOut} onSettings={openSettings}/>;
  const mobileNav = <AppMobileNav page={page} onNavigate={navigate}/>;
  if (!accountConfig) return <div className="app">{appHeader}{!isOnline && <p className="offline-banner" role="status">You’re offline. Some app files may still be available on this device.</p>}<main>{configError ? <section className="panel" role="alert"><h1>Story Bridge is unavailable</h1><p>{configError}</p><button className="secondary" onClick={() => setConfigAttempt(value => value + 1)}>Try again</button></section> : <p>Loading Story Bridge…</p>}</main>{policyFooter}{mobileNav}</div>;
  if(page==='terms'||page==='privacy'||page==='guidelines')return <div className="app">{appHeader}<Suspense fallback={pageLoading}><LegalPage type={page} onBack={()=>transitionTo('landing')}/></Suspense>{policyFooter}{mobileNav}</div>;
  // Private pages need a session: show the sign-in screen instead of an empty "could not be loaded" list.
  const privatePage = ['workspace', 'mine', 'review', 'profile', 'share','admin'].includes(page);
  if (accountConfig.account && !session && (showSignIn || privatePage)) return <div className="app">{appHeader}<Suspense fallback={pageLoading}><SignInPage accountConfig={accountConfig} authStep={authStep} authBusy={authBusy} authEmail={authEmail} setAuthEmail={setAuthEmail} setAuthCode={setAuthCode} authCode={authCode} sendEmailCode={sendEmailCode} resendEmailCode={resendEmailCode} verifyEmailCode={verifyEmailCode} supabase={supabase} setError={setError} setAuthBusy={setAuthBusy} setAuthStep={setAuthStep} setShowSignIn={value => { setShowSignIn(value); if (!value && privatePage) transitionTo('landing'); }} error={error} dismissError={() => setError('')}/></Suspense>{policyFooter}{mobileNav}</div>;
  if (accountConfig.account&&session&&page==='welcome')return <div className="app">{appHeader}<Suspense fallback={pageLoading}><WelcomePage saving={welcomeBusy} error={welcomeError} onComplete={completeWelcome}/></Suspense>{policyFooter}{mobileNav}</div>;
   if (accountConfig.account && !session && page==='landing') return <div className="app">{appHeader}<Suspense fallback={pageLoading}><Landing showSignIn repoUrl="https://github.com/josuekb09/Story-Bridge" onListen={()=>transitionTo('listen')} onObjects={()=>transitionTo('objects')} onShare={()=>setShowSignIn(true)} onCulture={openCulture} onSignIn={()=>setShowSignIn(true)}/></Suspense>{policyFooter}{mobileNav}</div>;
  if (currentSession.current !== activeIdentity) return <div className="app">{appHeader}<main><p role="status">Loading your account…</p></main>{policyFooter}{mobileNav}</div>;

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
    if (nextPage === 'listen' || nextPage === 'discover' || nextPage === 'mine' || nextPage === 'workspace' || nextPage === 'cultures' || nextPage === 'search') refresh();
    if (nextPage === 'profile' && profileState === 'idle') loadProfile(currentSession.current, identityEpoch.current, true);
  }

  function openCulture(id) {
    const route = `/cultures/${encodeURIComponent(id)}`;
    if (pageRef.current !== 'cultures') { pageRef.current = 'cultures'; viewEpoch.current += 1; }
    window.history.pushState({ storyBridgePage: 'cultures' }, '', route);
    setPage('cultures');
    window.scrollTo?.(0, 0);
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
    } catch (cause) { if (scopeIsCurrent(scope) && requestId === translationRequest.current) setTranslationError(cause.status === 502 ? `${cause.message}\nTip: readers can still read your story in their language with the 'Read in…' button.` : cause.message); }
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
      await refresh(currentSession.current);
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
      if (current?.id === id) setCurrent({ ...story, _own: current._own });
      await refresh(scope.identity);
      return story;
    } finally {
      if (identityEpoch.current === scope.epoch && currentSession.current === scope.identity && mutationRequest.current === requestId) {
        mutationBusyRef.current = false; setSaving(false);
      }
    }
  }

  async function changeAuthorVisibility(story, showName) {
    try {
      const saved = await update(story.id, { showName });
      if (saved) setToast(showName ? 'Your name and photo now appear on this post' : 'This post will appear as Community member');
    } catch (cause) { setError(cause.message || 'The author choice could not be saved.'); }
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
      const activeKey = session?.user?.id || (accountConfig?.account ? '' : 'legacy');
      const ownsPost = own || !!fullStory.isOwner || (listOwner === activeKey && mine.some(item => item.id === fullStory.id));
      setCurrent({ ...fullStory, _own: ownsPost });
      setTranslationStoryId('');
      transitionTo('detail', story.id);
    } catch (cause) { if (scopeIsCurrent(scope) && detailRequest.current === requestId) setError(cause.message); }
  }

  const activeSessionKey = session?.user?.id || (accountConfig.account ? '' : 'legacy');
  const visibleMine = listOwner === activeSessionKey ? mine : [];
  const visibleStories = listOwner === activeSessionKey ? stories : [];
  const publicStories = visibleStories;
  const ownedStoryIds = new Set(visibleMine.map(story=>story.id));
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
  const objectStories = objectId => [...new Map([...visibleMine,...visibleStories].filter(story=>story.objectId===objectId).map(story=>[story.id,story])).values()];
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
    ? <div className="app">{appHeader}{!isOnline && <p className="offline-banner" role="status">You’re offline. Some app files may still be available on this device.</p>}<Suspense fallback={pageLoading}><Landing showSignIn={!!accountConfig.account} repoUrl="https://github.com/josuekb09/Story-Bridge" onListen={()=>navigate('listen')} onObjects={()=>navigate('objects')} onShare={()=>navigate('share')} onCulture={openCulture} onSignIn={()=>setShowSignIn(true)}/></Suspense>{policyFooter}{mobileNav}</div>
    : <div className="app">
      {appHeader}
      {!isOnline && <p className="offline-banner" role="status">You’re offline. Some app files may still be available on this device.</p>}
      {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">Dismiss</button></div>}

      <Suspense fallback={pageLoading}>
      {page === 'workspace' && accountConfig.account && <WorkspacePage savedProfileName={savedProfileName} profileState={profileState} navigate={navigate} listState={listState} listErrors={listErrors} retryList={retryList} counts={counts} setCollectionFilter={setCollectionFilter} draftStories={draftStories} startReview={startReview}/>}
      {(page === 'listen' || page === 'discover') && <FeedPage accountConfig={accountConfig} visibleStories={visibleStories} ownedStoryIds={ownedStoryIds} languageFilter={languageFilter} setLanguageFilter={setLanguageFilter} regionFilter={regionFilter} setRegionFilter={setRegionFilter} audioOnly={audioOnly} setAudioOnly={setAudioOnly} listState={listState} listErrors={listErrors} retryList={retryList} filteredStories={filteredStories} navigate={navigate} translationStoryId={translationStoryId} setTranslationStoryId={setTranslationStoryId} showStory={showStory} transitionTo={transitionTo} signedIn={!!session} onReportSignIn={()=>setShowSignIn(true)} onReported={()=>setToast('Thanks. A moderator will review this.')} onCulture={openCulture}/>}
      {page === 'profile' && accountConfig.account && <ProfilePage navigate={navigate} profileState={profileState} profileError={profileError} loadProfile={loadProfile} identity={currentSession.current} epoch={identityEpoch.current} profileName={profileName} setProfileName={setProfileName} profileCountry={profileCountry} setProfileCountry={setProfileCountry} profileLanguages={profileLanguages} setProfileLanguages={setProfileLanguages} profileAvatar={profileAvatar} profileNotice={profileNotice} saveProfile={saveProfile} signOut={signOut} deleteAccount={deleteAccount} changeAvatar={changeAvatar} avatarBusy={avatarBusy} storyCount={visibleMine.length} publicCount={counts.public} email={session?.user?.email || ''} accountOpen={profileAccountOpen} onAccountToggle={setProfileAccountOpen}/>}
      {page === 'detail' && current && <StoryDetailPage story={current} navigate={navigate} backPage={detailReturnPage} signedIn={!!session} isAuthor={!!current._own||!!session&&listState.mine==='loading'} profileAvatar={profileAvatar} onChangeAuthorVisibility={showName=>changeAuthorVisibility(current,showName)} saving={saving} onReportSignIn={()=>setShowSignIn(true)} onReported={()=>setToast('Thanks. A moderator will review this.')}/>}
      {page === 'detail' && !current && <main>{error ? <section className="panel" role="alert"><p>{error}</p><button className="secondary" onClick={() => navigate(accountConfig.account ? 'discover' : 'listen')}>Back to stories</button></section> : <p role="status">Loading story…</p>}</main>}
      {page === 'objects' && <ObjectsPage objectSettings={objectSettings} visibleObjects={visibleObjects} museumFilter={museumFilter} setMuseumFilter={setMuseumFilter} museumChoices={museumChoices} objectTypeFilter={objectTypeFilter} setObjectTypeFilter={setObjectTypeFilter} typeChoices={typeChoices} transitionTo={transitionTo} retry={() => setObjectSettings(null)}/>}
      {page === 'group-record' && <CulturalGroupPage record={CULTURAL_GROUP_RECORD} navigate={navigate} onAddVoice={addVoiceToObject}/>}
      {page.startsWith('object:') && <ObjectRecordPage source={OBJECT_RECORDS.find(item => item.id === page.slice(7))} objectSettings={objectSettings} session={session} objectAccessSaving={objectAccessSaving} objectAccessError={objectAccessError} saveObjectAccess={saveObjectAccess} linkedStories={objectStories(page.slice(7))} showStory={showStory} addVoiceToObject={addVoiceToObject} navigate={navigate}/>}
      {page === 'share' && <SharePage objectContext={objectContext} form={form} setForm={setForm} change={change} postMeta={postMeta} setPostMeta={setPostMeta} file={file} fileKind={fileKind} audioSaved={audioSaved} saving={saving} captureBusy={captureBusy} onAudioChange={onAudioChange} onCaptureBusyChange={onCaptureBusyChange} shareStep={shareStep} setShareStep={setShareStep} postImages={postImages} setPostImages={setPostImages} imageDetails={imageDetails} setImageDetails={setImageDetails} translationBusy={translationBusy} translationError={translationError} requestTranslationDraft={requestTranslationDraft} translationApprovalCanContinue={translationApprovalCanContinue} createDraft={createDraft} profileName={profileName || savedProfileName} profileAvatar={profileAvatar} onEditProfile={()=>navigate('profile')}/>}
      {page === 'review' && review && <ReviewPage review={review} setReview={setReview} saving={saving} saveReviewEdits={saveReviewEdits} checkedBy={checkedBy} setCheckedBy={setCheckedBy} reviewVisibility={reviewVisibility} setReviewVisibility={setReviewVisibility} saveReview={saveReview} objectContext={objectContext} transitionTo={transitionTo} navigate={navigate}/>}
      {page === 'mine' && <MyStoriesPage accountConfig={accountConfig} listState={listState} listErrors={listErrors} retryList={retryList} collectionFilter={collectionFilter} setCollectionFilter={setCollectionFilter} visibleMine={visibleMine} sortedMine={sortedMine} counts={counts} category={category} showStory={showStory} startReview={startReview} withdrawConfirmationId={withdrawConfirmationId} setWithdrawConfirmationId={setWithdrawConfirmationId} saving={saving} withdrawStory={withdrawStory} onChangeAuthorVisibility={changeAuthorVisibility} deleteConfirmationId={deleteConfirmationId} setDeleteConfirmationId={setDeleteConfirmationId} deleteStory={deleteStory} deletingId={deletingId} profileAvatar={profileAvatar}/>}
      {page === 'cultures' && <CulturesPage stories={publicStories} showStory={showStory} navigate={navigate}/>}
      {page === 'search' && <SearchPage stories={publicStories} showStory={showStory}/>}
      {page === 'admin' && adminAccess==='available' && <AdminPostsPage posts={pendingPosts} error={pendingPostsError} busyId={adminBusyId} onAction={moderatePendingPost} onRetry={()=>setAdminRetry(value=>value+1)}/>}
      {page === 'admin' && adminAccess==='checking' && <main><p className="panel" role="status">Checking admin access…</p></main>}
      {page === 'admin' && adminAccess==='unavailable' && <main><section className="panel"><h1>Admin review is unavailable</h1><p>This account does not have access to pending posts.</p><button className="secondary" onClick={()=>navigate('discover')}>Back to Discover</button></section></main>}
      </Suspense>
      {toast && <div className="app-toast" role="status" aria-live="polite">✓ {toast}</div>}
      <AppMobileNav page={page} onNavigate={navigate}/>
      {policyFooter}
    </div>;
}
