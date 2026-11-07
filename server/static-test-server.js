// Isolated browser tests need the static-file route with explicit test-only configuration.
process.env.NODE_ENV = 'development';
process.env.STORY_SERVE_STATIC = '1';
await import('./index.js');
