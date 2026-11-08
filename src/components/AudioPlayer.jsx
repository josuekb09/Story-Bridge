import { useEffect, useRef, useState } from 'react';
import { headers } from '../lib/api.js';

export default function AudioPlayer({ story, privateAudio = false }) {
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState(story?.audio ? 'loading' : 'absent');
  const [attempt, setAttempt] = useState(0);
  const player = useRef(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
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
  useEffect(() => { if (player.current) player.current.playbackRate = rate; }, [rate, src]);
  if (!story?.audio) return <p className="muted" role="status">No recording attached.</p>;
  return <div className="audio-player">
    {status === 'loading' && <p className="muted" role="status">Loading recording…</p>}
    {status === 'error' && <div role="alert"><p>Recording could not be loaded.</p><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry recording</button></div>}
    <audio ref={player} key={attempt} controls src={src || undefined} preload="metadata" onCanPlay={event => { setStatus('ready'); setDuration(event.currentTarget.duration || 0); }} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onRateChange={event => setRate(event.currentTarget.playbackRate)} onError={() => setStatus('error')}>Audio playback is unavailable.</audio>
    {status === 'ready' && <div className="audio-tools"><label>Playback position<input aria-label="Seek in recording" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(position, duration)} onChange={event => { const value = Number(event.target.value); setPosition(value); if (player.current) player.current.currentTime = value; }}/></label><label>Speed<select value={rate} onChange={event => { const value = Number(event.target.value); setRate(value); if (player.current) player.current.playbackRate = value; }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label></div>}
  </div>;
}
