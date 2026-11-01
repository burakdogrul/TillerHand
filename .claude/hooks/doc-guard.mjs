#!/usr/bin/env node
// Document guard (PreToolUse, Read): a whole PDF fills the context, so it goes through the document-to-markdown skill.
// A read with `pages` passes: a scanned page or a chart can only be read that way. The name decides; the file is not opened.
import fs from 'node:fs';
import { findRoot, isMain, decide } from './shared.mjs';
import { t } from './lang.mjs';

// Windows opens "a.pdf." and "a.pdf " as a.pdf
const PDF = /\.pdf[\s.]*$/i;

if (isMain(import.meta.url)) {
  let g = null;
  try { g = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* unreadable input: do not block the work */ }
  const input = g?.tool_input;
  if (g?.tool_name === 'Read' && typeof input?.file_path === 'string' && PDF.test(input.file_path) && !String(input.pages ?? '').trim()) {
    decide('claude', 'deny', t(findRoot(), 'guard.doc.wholePdf'));
  }
  process.exit(0);
}
