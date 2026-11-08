import { useEffect, useState } from 'react';

export default function UnsavedAudioPreview({ file, fileKind }) {
  const [src, setSrc] = useState('');
  useEffect(()=>{
    if(!file){setSrc('');return undefined;}
    const url=URL.createObjectURL(file);setSrc(url);
    return()=>URL.revokeObjectURL(url);
  },[file]);
  if(!file)return null;
  return <div className="unsaved-audio-review"><p role="status">{fileKind==='recording'?'Recording captured. Not saved yet.':'Audio file selected. Not saved yet.'}</p><audio aria-label="Preview of unsaved audio" controls src={src||undefined} preload="metadata">Audio playback is unavailable.</audio></div>;
}
