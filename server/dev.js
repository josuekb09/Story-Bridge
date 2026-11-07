// Selecting the original local file backend is explicit in this local-dev entry point.
// The ignored .env file is read first so a deliberate account-mode setting there is not overridden.
import './env.js';
process.env.STORY_BACKEND ||= 'file';
process.env.STORY_AUTH_MODE ||= 'legacy';
await import('./index.js');
