import AudioPlayer from '../components/AudioPlayer.jsx';
import { translationOriginLabel } from '../lib/i18n.js';

export default function StoryDetailPage({ story, navigate, backPage = 'discover' }) {
  const privateAudio = !!story._own && !(story.status === 'shared' && story.visibility === 'public');
  return <main>
    <button className="back" onClick={() => navigate(backPage)}>← Back</button>
    <p className="eyebrow">{story.trustLabel || 'Told by a community member'}</p><h1>{story.title || (story.text || 'A voice carried across languages').split(/[.!?\n]/)[0].slice(0, 90)}</h1><p className="muted">{story.storytellerName || 'Anonymous'} · Original told in {story.originalLanguage}{story.region ? ` · ${story.region}` : ''}</p>
    {story.images?.length > 0 && <section className="post-gallery" aria-label="Post images">{story.images.map(image => <figure key={image.id}><img src={image.url} alt={image.altText}/><figcaption>{image.altText}<br/>{image.credit} · {image.licence}</figcaption></figure>)}</section>}
    <section className="panel"><h2>Original story</h2><AudioPlayer story={story} privateAudio={privateAudio}/><p className="story-text">{story.text || 'No written text provided.'}</p></section>
    {(story.people || story.region || story.sources?.length > 0) && <section className="panel"><h2>Documentation</h2>{story.people && <p><b>People:</b> {story.people}</p>}{story.region && <p><b>Region:</b> {story.region}</p>}{story.tags?.length > 0 && <p><b>Tags:</b> {story.tags.join(', ')}</p>}{story.sources?.length > 0 && <ul>{story.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul>}<p><b>Licence:</b> {story.licence}</p><p><b>Access:</b> {story.access}</p></section>}
    {story.translation && <section className="panel translation-panel"><h2>Translation · {story.translationLanguage}</h2><div className="notice">{story.translationChecked ? `Checked by ${story.checkedBy} (self-reported)` : 'Not yet checked by a speaker of this language'}</div><p className="translation-credit">{translationOriginLabel(story.translationOrigin)}</p><p className="story-text">{story.translation}</p></section>}
    <section className="panel story-record"><h2>Story record</h2><p>SHA-256 fingerprints let you compare the versions available in this proof of concept.</p>{(story.versionLog || []).map((version, index) => <article key={`${version.timestamp}-${index}`}><div><b>{version.change}</b><span>{version.language}</span><time dateTime={version.timestamp}>{new Date(version.timestamp).toLocaleString()}</time></div><code>{version.fingerprint}</code></article>)}</section>
  </main>;
}
