// scripts/build-extension.js
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Read the template
const template = fs.readFileSync('extension/config.template.js', 'utf8');

// Replace placeholders with actual environment variables
const config = template
  .replace('{{SUPABASE_URL}}', process.env.NEXT_PUBLIC_SUPABASE_URL)
  .replace('{{SUPABASE_ANON_KEY}}', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Write the actual config file
fs.writeFileSync('extension/config.js', config);

console.log('✅ Extension config generated successfully');