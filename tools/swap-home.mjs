// After "vite build": the Project 49 app moves to /project-49/ and the ANXA Infra home becomes the site root.
import { mkdirSync, renameSync, copyFileSync, rmSync, existsSync } from 'node:fs';
const d = 'dist';
mkdirSync(`${d}/project-49`, { recursive: true });
renameSync(`${d}/index.html`, `${d}/project-49/index.html`);
copyFileSync(`${d}/anxa-home.html`, `${d}/index.html`);
rmSync(`${d}/anxa-home.html`);
if (!existsSync(`${d}/index.html`) || !existsSync(`${d}/project-49/index.html`)) { console.error('swap-home failed'); process.exit(1); }
console.log('swap-home: ANXA at /, Project 49 at /project-49/');
