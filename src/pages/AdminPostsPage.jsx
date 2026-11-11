import { useEffect, useState } from 'react';
import { api, authorizedObjectUrl } from '../lib/api.js';
import '../styles/components/admin.css';

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function excerpt(text) {
  const value = String(text || '').trim();
  return value.length > 280 ? `${value.slice(0, 280).trimEnd()}…` : value || 'No written excerpt.';
}

function ProtectedImage({ image }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    let objectUrl = '';
    authorizedObjectUrl(image.url).then(url => { objectUrl = url; if (live) setSrc(url); else URL.revokeObjectURL(url); }).catch(() => {});
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.url]);
  return src ? <img src={src} alt={image.altText || ''} width={image.width || 160} height={image.height || 120} loading="lazy" decoding="async"/> : <span className="admin-photo-loading" role="status">Loading photo…</span>;
}

export default function AdminPostsPage({ posts = [], error = '', busyId = '', onAction = () => {}, onRetry = () => {} }) {
  const [confirmation, setConfirmation] = useState(null);
  const [tab,setTab]=useState('posts');
  const [stats,setStats]=useState(null);
  const [statsError,setStatsError]=useState('');
  const [reports,setReports]=useState([]);
  const [reportsError,setReportsError]=useState('');
  const [reportsBusy,setReportsBusy]=useState(false);
  const [reportBusyId,setReportBusyId]=useState('');
  const [hideTarget,setHideTarget]=useState('');
  const [hideNote,setHideNote]=useState('');
  async function loadStats(){try{setStatsError('');setStats(await api('/api/admin/stats'));}catch(cause){setStats(null);setStatsError(cause.message||'Admin statistics are unavailable.');}}
  async function loadReports(){setReportsBusy(true);setReportsError('');try{const rows=await api('/api/admin/reports');if(!Array.isArray(rows))throw Error('Invalid reports response');setReports(rows);}catch(cause){setReportsError(cause.message||'The reports queue is unavailable.');}finally{setReportsBusy(false);}}
  useEffect(()=>{loadStats();},[]);
  useEffect(()=>{if(tab==='reports')loadReports();},[tab]);
  async function dismissReport(id){setReportBusyId(id);setReportsError('');try{await api(`/api/admin/reports/${encodeURIComponent(id)}/dismiss`,{method:'POST'});setReports(rows=>rows.filter(row=>row.id!==id));await loadStats();}catch(cause){setReportsError(cause.message||'The report could not be dismissed.');}finally{setReportBusyId('');}}
  async function hidePost(postId){if(!hideNote.trim())return;setReportBusyId(postId);setReportsError('');try{await api(`/api/admin/posts/${encodeURIComponent(postId)}/hide`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({note:hideNote})});setReports(rows=>rows.filter(row=>row.postId!==postId));setHideTarget('');setHideNote('');await loadStats();}catch(cause){setReportsError(cause.message||'The post could not be hidden.');}finally{setReportBusyId('');}}
  return <main className="admin-main">
    <header className="admin-head">
      <p className="eyebrow">Moderation</p>
      <h1>Admin review</h1>
      <p className="muted">Review first posts before they become public.</p>
    </header>
    <section className="admin-stats" aria-label="Platform numbers">
      {stats ? [['Accounts',stats.accounts],['Completed profiles',stats.profilesCompleted],['Public posts',stats.publicPosts],['Pending first posts',stats.pendingFirstPosts],['Open reports',stats.openReports]].map(([label,value])=><article className="admin-stat" key={label}><b>{value}</b><span>{label}</span></article>) : <p className="muted" role={statsError?'alert':'status'}>{statsError||'Loading platform numbers…'}</p>}
    </section>
    <div className="admin-tabs" role="tablist" aria-label="Moderation queues">
      <button type="button" role="tab" aria-selected={tab==='posts'} onClick={()=>setTab('posts')}>First posts</button>
      <button type="button" role="tab" aria-selected={tab==='reports'} onClick={()=>setTab('reports')}>Reports</button>
    </div>
    {tab==='reports' && <section className="admin-report-queue" aria-label="Open reports">
      {reportsError && <section className="panel" role="alert"><p>{reportsError}</p><button type="button" className="secondary" onClick={loadReports}>Try again</button></section>}
      {reportsBusy && <p role="status">Loading reports…</p>}
      {!reportsBusy&&!reportsError&&!reports.length&&<p className="admin-empty">No open reports.</p>}
      {!reportsBusy&&!reportsError&&reports.length>0&&<ul className="admin-post-list">{reports.map(report=>{
        const busy=reportBusyId===report.id||reportBusyId===report.postId;
        return <li key={report.id}><article className="admin-post admin-report">
          <div className="admin-post-heading"><div><h2><a href={`/stories/${encodeURIComponent(report.postId)}`}>{report.postTitle}</a></h2><p>{report.reportCount} open report{report.reportCount===1?'':'s'} for this post</p></div><time dateTime={report.created_at}>{dateLabel(report.created_at)}</time></div>
          <p><b>Reason:</b> {({wrong_or_harmful_information:'Wrong or harmful information',disrespectful:'Disrespectful',sacred_or_restricted:'Sacred or restricted knowledge',privacy:'Private information',spam:'Spam',other:'Other'})[report.reason]||report.reason}</p>
          {report.details&&<p className="admin-report-details"><b>Details:</b> {report.details}</p>}
          <div className="admin-actions"><button type="button" className="danger" disabled={!!reportBusyId} onClick={()=>{setHideTarget(report.postId);setHideNote('');}}>Hide post</button><button type="button" className="secondary" disabled={!!reportBusyId} onClick={()=>dismissReport(report.id)}>{busy?'Working…':'Dismiss'}</button></div>
          {hideTarget===report.postId&&<div className="admin-confirm" role="alertdialog" aria-label="Hide reported post"><label>Short moderator note<input value={hideNote} maxLength={240} onChange={event=>setHideNote(event.target.value)}/></label><div className="admin-actions"><button type="button" className="secondary" disabled={!!reportBusyId} onClick={()=>setHideTarget('')}>Cancel</button><button type="button" className="danger" disabled={!hideNote.trim()||!!reportBusyId} onClick={()=>hidePost(report.postId)}>{busy?'Hiding…':'Confirm hide'}</button></div></div>}
        </article></li>;
      })}</ul>}
    </section>}
    {tab==='posts'&&<>
    {error && <section className="panel" role="alert"><p>{error}</p><button type="button" className="secondary" onClick={onRetry}>Try again</button></section>}
    {!error && posts.length === 0 && <p className="admin-empty">No posts are waiting for review.</p>}
    {posts.length > 0 && <ul className="admin-post-list">{posts.map(post => {
      const busy = busyId === post.id;
      return <li key={post.id}><article className="admin-post">
        <div className="admin-post-heading">
          <div><h2>{post.title || 'Untitled post'}</h2><p>{post.originalLanguage || 'Language not set'}{post.region ? ` · ${post.region}` : ''}</p></div>
          <time dateTime={post.createdAt || undefined}>{dateLabel(post.createdAt)}</time>
        </div>
        <p className="admin-excerpt">{excerpt(post.text)}</p>
        {post.images?.length > 0 && <ul className="admin-photos" aria-label="Post photos">{post.images.map(image => <li key={image.id}>
          <ProtectedImage image={image}/>
          <small>{image.credit || 'Photo credit unavailable'}</small>
        </li>)}</ul>}
        <div className="admin-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => setConfirmation({ id: post.id, action: 'approve' })}>Approve and publish</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmation({ id: post.id, action: 'keep-private' })}>Keep private</button>
        </div>
        {confirmation?.id === post.id && <div className="admin-confirm" role="alertdialog" aria-label="Confirm moderation action">
          <p>{confirmation.action === 'approve' ? 'Publish this post now?' : 'Keep this post private and remove it from the review queue?'}</p>
          <div className="admin-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
            <button type="button" className="primary" disabled={busy} onClick={async () => { await onAction(post.id, confirmation.action); setConfirmation(null); }}>{confirmation.action === 'approve' ? 'Confirm publish' : 'Confirm keep private'}</button>
          </div>
        </div>}
      </article></li>;
    })}</ul>}
    </>}
  </main>;
}
