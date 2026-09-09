// scripts/build-extension.js
//
// Generates extension/config.js from .env.local so the extension never has
// hardcoded Supabase credentials committed to the repo.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const TEMPLATE_PATH = path.join('extension', 'config.template.js');
const OUTPUT_PATH = path.join('extension', 'config.js');

// Placeholder in the template -> the .env.local variable that fills it.
const VALUES = {
  SUPABASE_URL: {
    envVar: 'NEXT_PUBLIC_SUPABASE_URL',
    value: process.env.NEXT_PUBLIC_SUPABASE_URL
  },
  SUPABASE_ANON_KEY: {
    envVar: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  },
  API_BASE_URL: {
    envVar: 'NEXT_PUBLIC_APP_URL',
    value: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  }
};

const missing = Object.values(VALUES)
  .filter((entry) => !entry.value)
  .map((entry) => entry.envVar);

if (missing.length > 0) {
  console.error('❌ Cannot build the extension config. Missing in .env.local:');
  missing.forEach((envVar) => console.error(`   - ${envVar}`));
  console.error('\nSee SUPABASE_SETUP.md for where to find these values.');
  process.exit(1);
}

let config = fs.readFileSync(TEMPLATE_PATH, 'utf8');
for (const [placeholder, { value }] of Object.entries(VALUES)) {
  // Trailing slashes would produce double-slashed request URLs downstream.
  config = config.replace(`{{${placeholder}}}`, value.replace(/\/+$/, ''));
}

fs.writeFileSync(OUTPUT_PATH, config);

console.log('✅ Extension config generated successfully');
console.log(`   API base URL: ${VALUES.API_BASE_URL.value}`);
console.log(`   Supabase:     ${VALUES.SUPABASE_URL.value}`);
