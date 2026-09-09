// Template for extension/config.js, which is generated at build time by
// scripts/build-extension.js from .env.local.
//
// Do not edit extension/config.js directly - it is gitignored and overwritten
// on every `npm run build:extension`. Edit this template instead.
const CONFIG = {
  SUPABASE_URL: '{{SUPABASE_URL}}',
  SUPABASE_ANON_KEY: '{{SUPABASE_ANON_KEY}}',
  API_BASE_URL: '{{API_BASE_URL}}'
};

// Make it available globally
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
