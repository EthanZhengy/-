// Copies the web app into www/ for Capacitor (the native apps load it from there).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const files = ['index.html', 'privacy.html', 'plans.html', 'styles.css', 'manifest.json', 'sw.js', 'icons', 'js', 'assets'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of files) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
console.log(`web assets copied to ${path.relative(root, out)}/`);
