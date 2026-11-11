import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, findLanguage } from '../lib/languages.js';
import '../styles/components/social.css';

function profileLanguageName(value) {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  const match = LANGUAGES.find(language => [language.code, language.name, language.nativeName].some(label => label.toLowerCase() === normalized));
  return findLanguage(match?.code || raw)?.nativeName || raw;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

// Profile: a readable card first (like a social profile), an edit form on demand.
export default function ProfilePage({ navigate, profileState, profileError, loadProfile, identity, epoch, profileName, setProfileName, profileCountry, setProfileCountry, profileLanguages, setProfileLanguages, profileAvatar, profileNotice, saveProfile, signOut, deleteAccount = async()=>false, changeAvatar, avatarBusy = false, storyCount = 0, publicCount = 0, email = '', accountOpen = false, onAccountToggle }) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen,setDeleteOpen]=useState(false);
  const [deleteText,setDeleteText]=useState('');
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const fileInput = useRef(null);
  const saving = profileState === 'saving';
  const languages = String(profileLanguages || '').split(',').map(item => item.trim()).filter(Boolean);

  // New accounts without a name open straight into the form unless Settings was requested.
  useEffect(() => { if (profileState === 'ready' && !profileName && !editing && !accountOpen) setEditing(true); }, [profileState, accountOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event) {
    const saved = await saveProfile(event);
    if (saved) setEditing(false);
  }
  async function confirmDelete(event){event.preventDefault();if(deleteText!=='DELETE'||deleting)return;setDeleting(true);setDeleteError('');try{const removed=await deleteAccount();if(removed){setDeleteOpen(false);setDeleteText('');}else setDeleteError('Your account could not be deleted. Try again.');}catch{setDeleteError('Your account could not be deleted. Try again.');}finally{setDeleting(false);}}

  return <main className="social-main">
    <button className="back" onClick={() => navigate('workspace')}>← Back</button>
    {profileState === 'loading' && <div className="profile-card skeleton" aria-busy="true"><div className="profile-cover"/><div className="profile-body"><div className="skeleton-line wide"/><div className="skeleton-line"/></div><p className="home-visually-hidden" role="status">Loading your profile…</p></div>}
    {profileState === 'error' && <section className="panel" role="alert"><p>{profileError}</p><button className="secondary" onClick={() => loadProfile(identity, epoch, true)}>Try again</button></section>}

    {['ready', 'saving'].includes(profileState) && <section className="profile-card" aria-labelledby="profile-name">
      <div className="profile-cover" aria-hidden="true"/>
      <div className="profile-body">
        <div className="profile-avatar-wrap">
          {profileAvatar ? <img className="profile-avatar-lg" src={profileAvatar} alt="" width="128" height="128"/> : <span className="profile-avatar-lg profile-initials" aria-hidden="true">{initials(profileName)}</span>}
          <button type="button" className="avatar-edit" disabled={avatarBusy} onClick={() => fileInput.current?.click()} aria-label="Change profile photo">{avatarBusy ? '…' : '📷'}</button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { changeAvatar?.(event.target.files?.[0]); event.target.value = ''; }}/>
        </div>

        {!editing && <>
          <h1 id="profile-name" className="profile-name">{profileName || 'Your name'}</h1>
          {profileNotice && <p className="success" role="status">{profileNotice}</p>}
          <p className="profile-meta">{profileCountry || 'Add where you are from'}</p>
          {languages.length > 0 && <ul className="profile-langs" aria-label="Languages">{languages.map(language => <li key={language}>{profileLanguageName(language)}</li>)}</ul>}
          <dl className="profile-stats">
            <div><dt>Stories</dt><dd>{storyCount}</dd></div>
            <div><dt>Public</dt><dd>{publicCount}</dd></div>
            <div><dt>Languages</dt><dd>{languages.length}</dd></div>
          </dl>
          {profileError && <p className="field-error" role="alert">{profileError}</p>}
          <div className="profile-actions">
            <button className="primary" onClick={() => setEditing(true)}>Edit profile</button>
            <button className="secondary" onClick={() => navigate('share')}>Share a story</button>
            <button className="secondary" onClick={() => navigate('mine')}>My stories</button>
          </div>
          <p className="muted profile-privacy">Your profile name and photo appear on public posts by default. You can choose Community member for an individual post.</p>
          <details id="account-settings" className="profile-account" open={accountOpen} onToggle={event => onAccountToggle?.(event.currentTarget.open)}><summary>Account</summary>{email && <p><strong>Email address:</strong> <span>{email}</span></p>}<div className="actions"><button type="button" className="secondary" onClick={() => signOut()}>Sign out</button><button type="button" className="secondary" onClick={() => signOut(true)}>Sign out of all devices</button></div></details>
        </>}

        {editing && <form className="form profile-form" aria-busy={saving} onSubmit={submit}>
          <h1 id="profile-name" className="profile-name">Edit profile</h1>
          <label>Display name<input maxLength="80" required disabled={saving} value={profileName} onChange={event => setProfileName(event.target.value)} autoComplete="name"/></label>
          <label>Country<input maxLength="100" disabled={saving} value={profileCountry} onChange={event => setProfileCountry(event.target.value)} placeholder="e.g. DR Congo" autoComplete="country-name"/></label>
          <label>Languages you speak<input maxLength="500" disabled={saving} value={profileLanguages} onChange={event => setProfileLanguages(event.target.value)} placeholder="e.g. Tshiluba, French, English"/><small className="muted">Separate languages with commas.</small></label>
          {profileError && <p className="field-error" role="alert">{profileError}</p>}
          {profileNotice && !saving && <p className="success" role="status">{profileNotice}</p>}
          <div className="profile-actions">
            <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            {profileName && <button type="button" className="secondary" disabled={saving} onClick={() => { setEditing(false); loadProfile(identity, epoch, true); }}>Cancel</button>}
          </div>
        </form>}
      </div>
    </section>}
    {['ready','saving'].includes(profileState)&&<section className="danger-zone" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">Delete my account</h2>
      <p>This removes your profile, all your posts and files. It cannot be undone.</p>
      {!deleteOpen&&<button type="button" className="danger" onClick={()=>{setDeleteOpen(true);setDeleteText('');setDeleteError('');}}>Delete my account</button>}
      {deleteOpen&&<form className="delete-account-confirm" role="alertdialog" aria-labelledby="delete-account-confirm-title" onSubmit={confirmDelete}>
        <h3 id="delete-account-confirm-title">Confirm account deletion</h3><p>This removes your profile, all your posts and files. It cannot be undone.</p>
        <label>Type DELETE to confirm<input autoComplete="off" value={deleteText} disabled={deleting} onChange={event=>setDeleteText(event.target.value)}/></label>
        {deleteError&&<p className="field-error" role="alert">{deleteError}</p>}
        <div className="actions"><button type="button" className="secondary" disabled={deleting} onClick={()=>{setDeleteOpen(false);setDeleteText('');}}>Cancel</button><button type="submit" className="danger" disabled={deleteText!=='DELETE'||deleting}>{deleting?'Deleting…':'Delete account permanently'}</button></div>
      </form>}
    </section>}
  </main>;
}
