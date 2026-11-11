import { useState } from 'react';

export default function WelcomePage({ saving, error, onComplete, initialDisplayName = '' }) {
  const [name,setName]=useState(initialDisplayName);
  const [country,setCountry]=useState('');
  const [languages,setLanguages]=useState('');
  const [photo,setPhoto]=useState(null);
  const [terms,setTerms]=useState(false);
  const [nameError,setNameError]=useState('');
  const submit=event=>{event.preventDefault();if(!name.trim()){setNameError('Enter the name you want to appear on your posts.');document.getElementById('welcome-display-name')?.focus();return;}if(terms)onComplete({displayName:name.trim(),country,languages:languages.split(',').map(item=>item.trim()).filter(Boolean),photo});};
  return <div className="app account-app"><header aria-label="Story Bridge"><h1>Welcome to Story Bridge</h1><p>A few details help you make this space yours.</p></header><main className="account-card welcome-card"><form className="form" onSubmit={submit}>
    <h1 className="welcome-title">Welcome to Story Bridge</h1><p className="muted">A few details help you make this space yours.</p>
    <label>Display name<input id="welcome-display-name" required maxLength="80" autoComplete="name" value={name} onChange={event=>{setName(event.target.value);setNameError('');}} placeholder="How you would like to be known" aria-invalid={!!nameError} aria-describedby={nameError?'welcome-name-error':undefined}/></label>{nameError&&<p id="welcome-name-error" role="alert" className="field-error">{nameError}</p>}
    <label>Country<input maxLength="100" autoComplete="country-name" value={country} onChange={event=>setCountry(event.target.value)}/></label>
    <label>Languages you speak<input maxLength="500" value={languages} onChange={event=>setLanguages(event.target.value)} placeholder="For example: English, Swahili"/><small>Separate languages with commas.</small></label>
    <label>Photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setPhoto(event.target.files?.[0]||null)}/></label>
    <label className="check"><input type="checkbox" checked={terms} onChange={event=>setTerms(event.target.checked)}/> I accept the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy notice</a>.</label>
    {error&&<p role="alert" className="field-error">{error}</p>}
    <button className="primary" disabled={!terms||saving}>{saving?'Saving…':'Continue'}</button>
  </form></main></div>;
}
