// Turn the single-file Vite build into an Artifact page fragment:
// the host wraps the page in its own <!doctype><html><head><body>, so we keep only
// <title>, our metas/links, inlined <style> and <script>, and the body content.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../dist-artifact/index.html', import.meta.url), 'utf8');
const head = (src.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, ''])[1];
const body = (src.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ''])[1];

const title = (head.match(/<title>[\s\S]*?<\/title>/i) || ['<title>Jurassic Ludus</title>'])[0];
const rest = head
  .replace(/<title>[\s\S]*?<\/title>/i, '')
  .replace(/<meta\s+charset[^>]*>/gi, '')
  .replace(/<meta\s+name="viewport"[^>]*>/gi, '');

const out = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${rest.trim()}\n${body.trim()}\n`;
writeFileSync(new URL('../dist-artifact/jurassic-ludus.html', import.meta.url), out);
console.log(`artifact page: ${(out.length / 1024).toFixed(0)} KB`);
