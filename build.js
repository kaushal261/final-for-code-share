/**
 * build.js
 * ---------------------------------------------------------------------------
 * This is a tiny, dependency-free "build step" used by Netlify.
 *
 * The app is plain HTML/CSS/JS with no bundler, so it cannot read
 * process.env directly in the browser. Instead, Netlify runs this script
 * (see netlify.toml -> build.command) BEFORE deploying. The script reads
 * the Supabase URL/anon key from Netlify's environment variables and writes
 * them into assets/js/config.js, which is then served as a static file.
 *
 * The anon key is safe to expose to the browser by design (Supabase's
 * Row Level Security policies, defined in sql/schema.sql, are what actually
 * protect the data) — but it must never be hard-coded into source control.
 * This script keeps it out of the repository entirely.
 * ---------------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[build.js] WARNING: SUPABASE_URL and/or SUPABASE_ANON_KEY are not set.\n' +
    '           Set them in Netlify > Site configuration > Environment variables,\n' +
    '           or in a local .env file when testing the build script.\n' +
    '           The app will not be able to reach Supabase until these are set.'
  );
}

const output = `/**
 * AUTO-GENERATED FILE — do not edit by hand.
 * Produced by build.js from environment variables at deploy time.
 */
window.SUPABASE_CONFIG = {
  url: ${JSON.stringify(SUPABASE_URL)},
  anonKey: ${JSON.stringify(SUPABASE_ANON_KEY)}
};
`;

const outDir = path.join(__dirname, 'assets', 'js');
const outPath = path.join(outDir, 'config.js');

// Defensive: create assets/js if it's missing for any reason (e.g. an empty
// folder that wasn't committed to git) so the build never crashes on this.
if (!fs.existsSync(outDir)) {
  console.warn(`[build.js] ${outDir} did not exist — creating it. ` +
    'If this is unexpected, check that assets/js was actually pushed to your git repo.');
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outPath, output, 'utf8');
console.log(`[build.js] Wrote ${outPath}`);
