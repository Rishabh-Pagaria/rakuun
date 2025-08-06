// This file is a template for configuration settings.
const CONFIG = {
  SUPABASE_URL: '{{SUPABASE_URL}}',
  SUPABASE_ANON_KEY: '{{SUPABASE_ANON_KEY}}'
};

// Make it available globally
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}