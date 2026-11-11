import React from 'react';

export function BridgeMark({className=''}) {
  return <svg className={className} viewBox="0 0 96 64" role="img" aria-label="Story Bridge mark">
    <path d="M6 42 A18 18 0 0 1 42 42" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
    <path d="M42 42 A18 18 0 0 1 78 42" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
    <line x1="4" y1="42" x2="92" y2="42" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
    {[28,34,40,46,52,58,64].map((x,index)=><rect key={x} x={x} y={[52,49,46,50,47,51,48][index]} width="3" height={[8,14,20,12,18,10,16][index]} rx="1.5" fill="var(--clay)"/>)}
  </svg>;
}

export function Waveform({className=''}) {
  const heights=[8,14,22,13,27,16,22,10,18,25,13,21,9];
  return <svg className={`waveform ${className}`} viewBox="0 0 100 30" aria-hidden="true" focusable="false">
    {heights.map((height,index)=><rect key={index} x={index*7.5+2} y={(30-height)/2} width="3.5" height={height} rx="1.75"/>)}
  </svg>;
}

export function Wordmark({stacked=false,light=false}) {
  return <span translate="no" className={`wordmark notranslate ${stacked?'wordmark-stacked':''} ${light?'wordmark-light':''}`}>
    <BridgeMark className="bridge-mark"/><span>Story Bridge</span>
  </span>;
}
