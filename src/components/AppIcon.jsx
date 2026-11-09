const shapes = {
  discover: <><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></>,
  cultures: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9M12 3c-2.6 2.6-3.8 5.6-3.8 9s1.2 6.4 3.8 9"/></>,
  bookmark: <path d="M7 3.5h10v17l-5-3.6-5 3.6z"/>,
  share: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></>,
  profile: <><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4"/></>,
};

export default function AppIcon({ name, className = '' }) {
  return <svg className={`app-icon ${className}`.trim()} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>;
}
