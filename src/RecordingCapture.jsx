import React, { useCallback, useEffect, useRef, useState } from 'react';

const MAX_BYTES = 10 * 1024 * 1024;
const MICROPHONE_UNAVAILABLE = 'Microphone not available. You can upload an audio file or write your story instead.';

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (milliseconds > 0 && totalSeconds === 0) return `0:00.${Math.max(1, Math.floor(milliseconds / 100))}`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function supportedServerMime(actualMime) {
  // MediaRecorder may add a codec parameter. The server accepts the audio container MIME;
  // preserve only that verified audio type when constructing the upload File.
  const match = String(actualMime || '').trim().match(/^(audio\/[a-z0-9.+-]+)(?:\s*;\s*codecs\s*=\s*[a-z0-9._,-]+)?$/i);
  if (!match) return '';
  const containerMime = match[1].toLowerCase();
  return /^audio\/[a-z0-9.+-]+$/i.test(containerMime) ? containerMime : '';
}

function recordingError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone permission was denied. Allow microphone access in your browser, then try again or choose an audio file.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'AbortError':
      return 'No microphone device was found. Connect a microphone or choose an audio file.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone could not be started. Check that it is connected and not in use.';
    case 'SecurityError':
      return 'Microphone access requires localhost or HTTPS. Choose an audio file if recording is unavailable here.';
    case 'NotSupportedError':
      return 'This browser cannot record an audio format the server accepts. Choose an audio file or try another browser.';
    default:
      return 'Recording could not start. Check microphone access and try again, or choose an audio file.';
  }
}

export default function RecordingCapture({ file, fileKind, saved, disabled = false, onChange, onBusyChange, language='', onTranscript=()=>{} }) {
  const [phase, setPhase] = useState('ready');
  const [error, setError] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [mediaDurationMs, setMediaDurationMs] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const permissionTimerRef = useRef(null);
  const permissionRequestRef = useRef(0);
  const startTimeRef = useRef(0);
  const mountedRef = useRef(true);
  const recognitionRef=useRef(null);
  const [transcriptStatus,setTranscriptStatus]=useState('');

  const busy = phase === 'requesting' || phase === 'recording' || phase === 'stopping';
  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);
  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => {
    mountedRef.current = false;
    permissionRequestRef.current += 1;
    if (permissionTimerRef.current) window.clearTimeout(permissionTimerRef.current);
    permissionTimerRef.current = null;
    clearTimer();
    onBusyChange(false);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* Track cleanup below still runs. */ }
    }
    stopTracks();
    try{recognitionRef.current?.stop()}catch{} recognitionRef.current=null;
  }, [clearTimer, onBusyChange, stopTracks]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      setMediaDurationMs(0);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setMediaDurationMs(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const failCapture = useCallback(message => {
    clearTimer();
    stopTracks();
    recorderRef.current = null;
    if (!mountedRef.current) return;
    setPhase(file ? 'captured' : 'ready');
    setError(message);
  }, [clearTimer, file, stopTracks]);

  const startRecording = useCallback(async () => {
    if (busy || disabled || saved) return;
    setError('');
    if (!window.isSecureContext) {
      setError('Microphone access requires localhost or HTTPS. Choose an audio file if recording is unavailable here.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setError('Voice recording is not supported in this browser. Choose an audio file instead.');
      return;
    }

    const requestId = ++permissionRequestRef.current;
    setPhase('requesting');
    const timeoutId = window.setTimeout(() => {
      if (!mountedRef.current || permissionRequestRef.current !== requestId) return;
      permissionRequestRef.current += 1;
      if (permissionTimerRef.current === timeoutId) permissionTimerRef.current = null;
      setPhase(file ? 'captured' : 'ready');
      setError(MICROPHONE_UNAVAILABLE);
    }, 15000);
    permissionTimerRef.current = timeoutId;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (permissionTimerRef.current === timeoutId) {
        window.clearTimeout(timeoutId);
        permissionTimerRef.current = null;
      }
      if (!mountedRef.current || permissionRequestRef.current !== requestId) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;

      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
      setTranscriptStatus(SpeechRecognition?'Listening for words…':'Speech transcription is unavailable in this browser. You can type the story or use an audio file.');
      if(SpeechRecognition){
        const recognition=new SpeechRecognition();recognitionRef.current=recognition;recognition.lang=/kiswahili|swahili/i.test(language)?'sw-KE':/français|french/i.test(language)?'fr-FR':'en-US';recognition.continuous=true;recognition.interimResults=true;
        recognition.onresult=event=>{let finalText='';for(let i=0;i<event.results.length;i++)if(event.results[i].isFinal)finalText+=event.results[i][0].transcript+' ';if(finalText.trim())onTranscript(finalText.trim())};
        recognition.onerror=()=>setTranscriptStatus('Transcription stopped. Your recording is still available; you can type or edit the text.');
        recognition.onend=()=>{if(recognitionRef.current===recognition){recognitionRef.current=null;setTranscriptStatus('Transcription ended. Please review and edit the transcript before saving.')}};
        try{recognition.start()}catch{setTranscriptStatus('Transcription could not start. You can type the story while keeping the recording.')}
      }

      const recorder = new window.MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = event => {
        failCapture(recordingError(event.error));
      };
      recorder.onstop = () => {
        if (recorderRef.current !== recorder) return;
        clearTimer();
        stopTracks();
        try{recognitionRef.current?.stop()}catch{} recognitionRef.current=null;
        const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
        if (mountedRef.current) setElapsedMs(duration);
        const chunks = chunksRef.current;
        const actualMime = recorder.mimeType || chunks.find(chunk => chunk.type)?.type || '';
        const serverMime = supportedServerMime(actualMime);
        const blob = new Blob(chunks, { type: serverMime || actualMime });
        recorderRef.current = null;

        if (!mountedRef.current) return;
        if (!serverMime) {
          failCapture(`This browser recorded ${actualMime || 'an unknown format'}, which the server cannot accept. Choose an audio file or try another browser.`);
          return;
        }
        if (!blob.size) {
          failCapture('No audio was captured. Check the microphone and try again.');
          return;
        }
        if (blob.size > MAX_BYTES) {
          failCapture('This recording is over 10 MB. Retake a shorter recording or choose a smaller audio file.');
          return;
        }

        const extension = serverMime.split('/')[1].split('+')[0].replace(/[^a-z0-9.-]/g, '') || 'audio';
        const replacement = new File([blob], `story-recording.${extension}`, { type: serverMime, lastModified: Date.now() });
        onChange(replacement, 'recording');
        setElapsedMs(duration);
        setPhase('captured');
      };

      recorder.start();
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setPhase('recording');
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) setElapsedMs(Date.now() - startTimeRef.current);
      }, 250);
    } catch (cause) {
      if (permissionTimerRef.current === timeoutId) {
        window.clearTimeout(timeoutId);
        permissionTimerRef.current = null;
      }
      if (!mountedRef.current || permissionRequestRef.current !== requestId) {
        stream?.getTracks().forEach(track => track.stop());
        return;
      }
      stream?.getTracks().forEach(track => track.stop());
      if (stream) failCapture(recordingError(cause));
      else { setPhase(file ? 'captured' : 'ready'); setError(MICROPHONE_UNAVAILABLE); }
    }
  }, [busy, clearTimer, disabled, failCapture, file, onChange, saved, stopTracks]);

  const cancelPermissionRequest = () => {
    if (phase !== 'requesting') return;
    permissionRequestRef.current += 1;
    if (permissionTimerRef.current) window.clearTimeout(permissionTimerRef.current);
    permissionTimerRef.current = null;
    setPhase(file ? 'captured' : 'ready');
    setError(MICROPHONE_UNAVAILABLE);
  };

  const stopRecording = useCallback(() => {
    if (phase !== 'recording') return;
    clearTimer();
    setPhase('stopping');
    try {
      recorderRef.current?.stop();
    } catch (cause) {
      failCapture(recordingError(cause));
    }
  }, [clearTimer, failCapture, phase]);

  const startRetake = () => {
    if (file && !window.confirm('Start a new recording? The current unsaved audio will stay unless the new recording succeeds.')) return;
    startRecording();
  };

  const removeFile = () => {
    if (!file || !window.confirm('Remove this unsaved audio from the story draft?')) return;
    onChange(null, '');
    setElapsedMs(0);
    setPhase('ready');
    setError('');
  };

  const chooseFile = event => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!/^audio\/[a-z0-9.+-]+$/i.test(selected.type || '')) {
      setError('Choose a file with an audio media type. Your current recording was kept.');
      event.target.value = '';
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError('Audio files must be 10 MB or smaller. Your current recording was kept.');
      event.target.value = '';
      return;
    }
    if (file && !window.confirm('Replace this unsaved audio with the selected file?')) {
      event.target.value = '';
      return;
    }
    setError('');
    setElapsedMs(0);
    setPhase('captured');
    onChange(selected, 'upload');
  };

  const status = saved
    ? 'Saved with your story.'
    : phase === 'requesting' ? 'Waiting for microphone permission.'
      : phase === 'recording' ? 'Recording.'
        : phase === 'stopping' ? 'Stopping recording.'
          : fileKind === 'recording' && file ? 'Recording captured. Not saved yet.'
            : file ? 'Audio file selected. Not saved yet.' : 'Ready to record.';
  const duration = fileKind === 'recording' ? elapsedMs : mediaDurationMs;

  return <div className="record">
    <p className="muted">Recording can produce a browser speech transcript. Review and edit it before saving. Availability and speech handling depend on your browser settings; Story Bridge does not send transcript audio to its own server.</p>
    {transcriptStatus&&<p role="status" className="transcript-status">{transcriptStatus}</p>}
    <div className="recording-status" role="status" aria-live="polite" aria-atomic="true">{status}</div>
    {phase === 'recording' && <span className="muted" role="timer" aria-label={`Recording elapsed ${formatDuration(elapsedMs)}`}>Elapsed: {formatDuration(elapsedMs)}</span>}
    {error && <p className="recording-error" role="alert">{error}</p>}
    {phase === 'requesting' && <button type="button" className="secondary" onClick={cancelPermissionRequest}>Cancel</button>}
    {phase === 'recording' && <button type="button" className="secondary" onClick={stopRecording}>Stop recording</button>}
    {!busy && !file && <button type="button" className="secondary" onClick={startRetake} disabled={disabled || saved}>Record voice</button>}
    <label className="upload">Or choose an audio file<input type="file" accept="audio/*" disabled={busy || disabled || saved} onChange={chooseFile}/></label>
    {file && <div className="recording-preview">
      <audio aria-label="Preview of unsaved audio" controls src={previewUrl} preload="metadata" onLoadedMetadata={event => {
        if (fileKind !== 'recording' && Number.isFinite(event.currentTarget.duration)) setMediaDurationMs(event.currentTarget.duration * 1000);
      }}>Audio preview is not supported in this browser.</audio>
      <p className="muted">{fileKind === 'recording' ? `Duration: ${formatDuration(duration)}` : duration ? `Duration: ${formatDuration(duration)}` : 'Duration: loading audio metadata'}</p>
      <p className="muted">File size: {formatSize(file.size)} · Format: {file.type || 'unknown'}</p>
      {!saved && <>
        <p className="muted">This audio is held in this page until the story is saved. Leaving or reloading may discard it.</p>
        <div className="actions">
          {fileKind === 'recording' && <button type="button" className="secondary" onClick={startRetake} disabled={busy || disabled}>Retake recording</button>}
          <button type="button" className="danger" onClick={removeFile} disabled={busy || disabled}>Remove recording</button>
        </div>
      </>}
    </div>}
  </div>;
}
