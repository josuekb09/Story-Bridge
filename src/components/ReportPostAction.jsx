import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/components/report.css';

const REASONS = [
  ['wrong_or_harmful_information','Wrong or harmful information'],
  ['disrespectful','Disrespectful'],
  ['sacred_or_restricted','Sacred or restricted knowledge'],
  ['privacy','Private information'],
  ['spam','Spam'],
  ['other','Other'],
];

export default function ReportPostAction({ postId, signedIn = false, isAuthor = false, onSignIn = () => {}, onReported = () => {} }) {
  const menu = useRef(null);
  const [dialogOpen,setDialogOpen] = useState(false);
  const [reason,setReason] = useState('');
  const [details,setDetails] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  if (isAuthor) return null;

  function startReport() {
    if (menu.current) menu.current.open = false;
    if (!signedIn) { onSignIn(); return; }
    setReason('');setDetails('');setError('');setDialogOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (!reason || busy) return;
    setBusy(true);setError('');
    try {
      await api(`/api/posts/${encodeURIComponent(postId)}/report`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason,details})});
      setDialogOpen(false);onReported();
    } catch(cause) { setError(cause.message||'Your report could not be sent. Try again.'); }
    finally { setBusy(false); }
  }

  return <>
    <details className="post-menu" ref={menu}>
      <summary aria-label="More post actions">•••</summary>
      <button type="button" className="report-menu-action" onClick={startReport}><img src="/assets/icons/flag.svg" alt="" width="18" height="18"/>Report</button>
    </details>
    {dialogOpen && <div className="report-overlay">
      <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby={`report-title-${postId}`}>
        <form onSubmit={submit}>
          <h2 id={`report-title-${postId}`}>Report this post</h2>
          <fieldset><legend>Why are you reporting it?</legend>{REASONS.map(([value,label])=><label className="report-reason" key={value}><input type="radio" name={`report-reason-${postId}`} value={value} checked={reason===value} onChange={()=>setReason(value)}/>{label}</label>)}</fieldset>
          <label className="report-details">Details (optional)<textarea value={details} maxLength={1000} rows={4} onChange={event=>setDetails(event.target.value)}/><small>{details.length}/1000</small></label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setDialogOpen(false)}>Cancel</button><button type="submit" className="primary" disabled={!reason||busy}>{busy?'Sending…':'Send'}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
