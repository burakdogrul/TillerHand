#!/usr/bin/env node
// Document guard (PreToolUse, Read, Grep, Glob): a whole PDF fills the context, so it goes through the document-to-markdown skill.
// A path or search naming vibe-panel- is the model panel's temporary page with its one-time token: it is never read or searched.
// A read with `pages` passes: a scanned page or a chart can only be read that way. The name decides; the file is not opened.
import fs from 'node:fs';
import { findRoot, isMain, decide, PANEL_TOKEN } from './shared.mjs';
import { t } from './lang.mjs';

// Windows opens "a.pdf." and "a.pdf " as a.pdf
const PDF = /\.pdf[\s.]*$/i;

if (isMain(import.meta.url)) {
  let g = null;
  try { g = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* unreadable input: do not block the work */ }
  const input = g?.tool_input;
  const file = g?.tool_name === 'Read' && typeof input?.file_path === 'string' ? input.file_path : null;
  const named = [input?.file_path, input?.path, input?.glob, g?.tool_name === 'Glob' ? input?.pattern : null].filter((v) => typeof v === 'string');
  if (named.some((v) => PANEL_TOKEN.test(v))) decide('claude', 'deny', t(findRoot(), 'guard.doc.panelToken'));
  else if (file && PDF.test(file) && !String(input.pages ?? '').trim()) decide('claude', 'deny', t(findRoot(), 'guard.doc.wholePdf'));
  process.exit(0);
}
