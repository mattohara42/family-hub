/**
 * netlify-build.js — runs during Netlify deploy (before files are published)
 * Stamps a unique CACHE_VERSION into sw.js so every deploy invalidates the
 * old service worker cache and users always get fresh app shell files.
 */
const fs = require('fs');

const version = `fh-${Date.now()}`;

// Patch sw.js
const sw = fs.readFileSync('sw.js', 'utf8');
const patched = sw.replace(/const CACHE_VERSION = 'fh-[^']*'/, `const CACHE_VERSION = '${version}'`);
fs.writeFileSync('sw.js', patched);

console.log(`[netlify-build] SW cache version set to: ${version}`);
