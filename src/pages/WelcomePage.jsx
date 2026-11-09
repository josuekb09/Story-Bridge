import { useState } from 'react';

export default function WelcomePage({ saving, error, onComplete }) {
  const [name,setName]=useState('');
  const [country,setCountry]=useState('');
  const [languages,setLanguages]=useState('');
  const [photo,setPhoto]=useState(null);
  const [terms,setTerms]=useState(false);
  const submit=event=>{event.preventDefault();if(terms)onComplete({displayName:name,country,languages:languages.split(',').map(item=>item.trim()).filter(Boolean),photo,skip:false});};
  return <div className="app account-app"><header aria-label="Story Bridge"><h1>Welcome to Story Bridge</h1><p>A few details help you make this space yours.</p></header><main className="account-card welcome-card"><form className="form" onSubmit={submit}>
    <h1 className="welcome-title">Welcome to Story Bridge</h1><p className="muted">A few details help you make this space yours.</p>
    <label>Display name<input maxLength="80" autoComplete="name" value={name} onChange={event=>setName(event.target.value)} placeholder="How you would like to be known"/></label>
    <label>Country<input maxLength="100" autoComplete="country-name" value={country} onChange={event=>setCountry(event.target.value)}/></label>
    <label>Languages you speak<input maxLength="500" value={languages} onChange={event=>setLanguages(event.target.value)} placeholder="For example: English, Swahili"/><small>Separate languages with commas.</small></label>
    <label>Photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setPhoto(event.target.files?.[0]||null)}/></label>
    <label className="check"><input type="checkbox" checked={terms} onChange={event=>setTerms(event.target.checked)}/> I accept the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy notice</a>.</label>
    {error&&<p role="alert" className="field-error">{error}</p>}
    <button className="primary" disabled={!terms||saving}>{saving?'Saving…':'Continue'}</button>
    <button type="button" className="secondary" disabled={!terms||saving} onClick={()=>onComplete({displayName:'',country:'',languages:[],photo:null,skip:true})}>Skip for now</button>
  </form></main></div>;
}
