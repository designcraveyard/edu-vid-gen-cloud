# Cloud-Native Edu-Vid-Gen Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `edu-vid-gen-cloud`, a separate plugin repo where Google Drive is the source of truth for all artifacts, with Google Sheets for observability and Google Docs for collaborative editing.

**Architecture:** Fork the existing `edu-vid-gen-plugin` into a new repo. Add 6 new Google Workspace scripts (auth, drive, sheets, docs, sync, read-review). Modify SKILL.md to orchestrate Drive I/O after each generation step and stop at review gates. No changes to existing generation/compositing scripts.

**Tech Stack:** Node.js (googleapis npm package), existing Python scripts unchanged, Google OAuth2 (Desktop App flow)

**Spec:** `docs/superpowers/specs/2026-04-11-cloud-native-plugin-design.md`

---

## Task 1: Fork Repo & Bootstrap Plugin

**Files:**
- Create: new repo `edu-vid-gen-cloud/` (copy of `edu-vid-gen-plugin-1/`)
- Modify: `.claude-plugin/plugin.json`
- Modify: `.env.example`
- Create: `scripts/package.json`

- [ ] **Step 1: Create the new repo directory**

```bash
cd ~/Documents/GitHub
cp -r edu-vid-gen-plugin-1 edu-vid-gen-cloud
cd edu-vid-gen-cloud
rm -rf .git
git init
```

- [ ] **Step 2: Update plugin.json**

Change the plugin identity in `.claude-plugin/plugin.json`:

```json
{
  "name": "edu-vid-gen-cloud",
  "version": "1.0.0",
  "description": "Cloud-native educational video generator — Google Drive-first pipeline with collaborative review gates, budget tiers, and full observability via Google Sheets. Audio-first architecture with VO-driven clip planning, Gemini-powered validation, MoviePy compositor, and multi-model video backends.",
  "author": {
    "name": "Abhishek Verma",
    "email": "abhishek.verma@proton.me"
  }
}
```

- [ ] **Step 3: Add googleapis dependency**

Create `scripts/package.json`:

```json
{
  "name": "edu-vid-gen-cloud-scripts",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "googleapis": "^144.0.0"
  }
}
```

Run:
```bash
cd scripts && npm install && cd ..
```

Expected: `node_modules/` created inside `scripts/`, `package-lock.json` generated.

- [ ] **Step 4: Update .env.example**

Add Google OAuth fields to `.env.example` after the existing entries:

```bash
# --- Google Workspace (Drive, Docs, Sheets) ---
# Required for: cloud-native artifact storage, review workflow
# Set up via: /setup -> Google Workspace section
# credentials.json and token.json are stored in the plugin root directory
# No API key needed — uses OAuth2 Desktop App flow
GOOGLE_CREDENTIALS_PATH=__PLUGIN_DIR__/credentials.json
GOOGLE_TOKEN_PATH=__PLUGIN_DIR__/token.json

# --- Exchange Rate ---
# USD to INR conversion rate for cost tracking
USD_TO_INR=84.5
```

- [ ] **Step 5: Add scripts/ to .gitignore**

Append to `.gitignore`:

```
scripts/node_modules/
credentials.json
token.json
```

- [ ] **Step 6: Initial commit**

```bash
git add -A
git commit -m "feat: bootstrap edu-vid-gen-cloud from edu-vid-gen-plugin fork"
```

---

## Task 2: Google OAuth2 Auth Script

**Files:**
- Create: `scripts/google-auth.mjs`

- [ ] **Step 1: Write google-auth.mjs**

```javascript
#!/usr/bin/env node
/**
 * google-auth.mjs — One-time OAuth2 setup for Google Drive/Docs/Sheets.
 *
 * Usage:
 *   node google-auth.mjs [--credentials path/to/credentials.json] [--token path/to/token.json]
 *
 * First run: opens browser for Google sign-in, saves token.json.
 * Subsequent runs: verifies token is valid, refreshes if needed.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { google } from 'googleapis';
import { createServer } from 'http';
import { execFile } from 'child_process';

const args = process.argv.slice(2);
const get = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
];

const credPath  = resolve(get('--credentials', process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'));
const tokenPath = resolve(get('--token', process.env.GOOGLE_TOKEN_PATH || './token.json'));

if (!existsSync(credPath)) {
  console.error(`Error: credentials.json not found at ${credPath}`);
  console.error('Download it from Google Cloud Console -> APIs & Credentials -> OAuth Client ID (Desktop App)');
  process.exit(1);
}

const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
const { client_id, client_secret } = creds.installed || creds.web || {};
if (!client_id || !client_secret) {
  console.error('Error: credentials.json is malformed — missing client_id or client_secret');
  process.exit(1);
}

// Check for existing valid token
if (existsSync(tokenPath)) {
  const token = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  const oauth2 = new google.auth.OAuth2(client_id, client_secret);
  oauth2.setCredentials(token);

  try {
    const drive = google.drive({ version: 'v3', auth: oauth2 });
    const aboutRes = await drive.about.get({ fields: 'user' });
    const email = aboutRes.data.user.emailAddress;
    console.log(`Already authenticated as ${email}`);
    console.log(`  Token: ${tokenPath}`);

    // Refresh if needed and save
    const freshCreds = oauth2.credentials;
    if (freshCreds.access_token !== token.access_token) {
      writeFileSync(tokenPath, JSON.stringify(freshCreds, null, 2));
      console.log('  Token refreshed and saved.');
    }
    process.exit(0);
  } catch (err) {
    console.log('Existing token expired or invalid. Re-authenticating...');
  }
}

// New auth flow — start local server to receive callback
const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3847/callback');
const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

console.log('\n--- Google Workspace Authentication ---');
console.log('Opening browser for sign-in...\n');

// Open browser safely using execFile (no shell injection risk)
const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
const openArgs = process.platform === 'win32' ? ['/c', 'start', authUrl] : [authUrl];
execFile(openCmd, openArgs, (err) => {
  if (err) console.log(`Could not open browser automatically. Visit:\n${authUrl}\n`);
});

console.log(`If browser didn't open, visit:\n${authUrl}\n`);

// Wait for callback
const server = createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) { res.end('Waiting...'); return; }

  const url = new URL(req.url, 'http://localhost:3847');
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('Error: no code received');
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);
    writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

    const drive = google.drive({ version: 'v3', auth: oauth2 });
    const aboutRes = await drive.about.get({ fields: 'user' });
    const email = aboutRes.data.user.emailAddress;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body><h2>Authenticated as ${email}</h2><p>You can close this tab.</p></body></html>`);

    console.log(`Authenticated as ${email}`);
    console.log(`  Token saved to: ${tokenPath}`);
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end(`Error: ${err.message}`);
    console.error('Auth failed:', err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(3847, () => {
  console.log('Waiting for Google sign-in callback on http://localhost:3847/callback ...');
});

// Timeout after 2 minutes
setTimeout(() => {
  console.error('Timeout — no callback received after 2 minutes.');
  server.close();
  process.exit(1);
}, 120_000);
```

- [ ] **Step 2: Test that the script loads without errors**

Run:
```bash
cd ~/Documents/GitHub/edu-vid-gen-cloud
node scripts/google-auth.mjs 2>&1 | head -3
```

Expected: Error about `credentials.json not found` (no credentials yet — this confirms the script loads and parses correctly).

- [ ] **Step 3: Commit**

```bash
git add scripts/google-auth.mjs
git commit -m "feat: add Google OAuth2 auth script"
```

---

## Task 3: Google Drive Library (`gdrive.mjs`)

**Files:**
- Create: `scripts/gdrive.mjs`

- [ ] **Step 1: Write gdrive.mjs**

```javascript
#!/usr/bin/env node
/**
 * gdrive.mjs — Google Drive operations library.
 *
 * Library mode (import):
 *   import { createFolder, uploadFile, getShareableLink, listFolder, deleteFile, getAuth } from './gdrive.mjs';
 *
 * CLI mode:
 *   node gdrive.mjs create-folder --name "MyFolder" [--parent FOLDER_ID]
 *   node gdrive.mjs upload --file ./path/to/file.mp4 --folder FOLDER_ID [--name "custom-name.mp4"]
 *   node gdrive.mjs list --folder FOLDER_ID
 *   node gdrive.mjs link --file-id FILE_ID
 *   node gdrive.mjs delete --file-id FILE_ID
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import { google } from 'googleapis';
import { Readable } from 'stream';

// ── Auth helper ──

export function getAuth() {
  const credPath  = resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json');
  const tokenPath = resolve(process.env.GOOGLE_TOKEN_PATH || './token.json');

  if (!existsSync(credPath)) throw new Error(`credentials.json not found at ${credPath}. Run /setup first.`);
  if (!existsSync(tokenPath)) throw new Error(`token.json not found at ${tokenPath}. Run: node scripts/google-auth.mjs`);

  const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
  const { client_id, client_secret } = creds.installed || creds.web || {};
  const oauth2 = new google.auth.OAuth2(client_id, client_secret);
  oauth2.setCredentials(JSON.parse(readFileSync(tokenPath, 'utf-8')));
  return oauth2;
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// ── Retry helper ──

async function withRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      console.error(`  Retry ${attempt}/${maxAttempts} after ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Core operations ──

export async function createFolder(name, parentId = null) {
  const drive = getDrive();
  const metadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  const res = await withRetry(() => drive.files.create({
    requestBody: metadata,
    fields: 'id, name, webViewLink',
  }));

  console.log(`  Created folder: ${res.data.name} (${res.data.id})`);
  return res.data;
}

export async function uploadFile(localPath, folderId, customName = null) {
  const drive = getDrive();
  const fileName = customName || basename(localPath);
  const fileStat = statSync(localPath);
  const fileContent = readFileSync(localPath);

  // Detect MIME type
  const ext = fileName.split('.').pop().toLowerCase();
  const mimeMap = {
    mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    json: 'application/json', txt: 'text/plain', pdf: 'application/pdf',
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';

  const res = await withRetry(() => drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(fileContent),
    },
    fields: 'id, name, webViewLink, size',
  }));

  const sizeMB = (fileStat.size / (1024 * 1024)).toFixed(2);
  console.log(`  Uploaded: ${res.data.name} (${sizeMB}MB) -> ${res.data.webViewLink}`);
  return res.data;
}

export async function getShareableLink(fileId) {
  const drive = getDrive();
  await withRetry(() => drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  }));
  const res = await drive.files.get({ fileId, fields: 'webViewLink, webContentLink' });
  return res.data;
}

export async function listFolder(folderId) {
  const drive = getDrive();
  const res = await withRetry(() => drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, webViewLink, createdTime)',
    orderBy: 'name',
  }));
  return res.data.files;
}

export async function deleteFile(fileId) {
  const drive = getDrive();
  await withRetry(() => drive.files.delete({ fileId }));
  console.log(`  Deleted: ${fileId}`);
}

export async function searchFiles(query, parentId = null) {
  const drive = getDrive();
  let q = `name contains '${query}' and trashed = false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await withRetry(() => drive.files.list({
    q,
    fields: 'files(id, name, mimeType, webViewLink)',
  }));
  return res.data.files;
}

export async function findOrCreateFolder(name, parentId = null) {
  const drive = getDrive();
  let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await drive.files.list({ q, fields: 'files(id, name, webViewLink)' });
  if (res.data.files.length > 0) {
    console.log(`  Found existing folder: ${name} (${res.data.files[0].id})`);
    return res.data.files[0];
  }
  return createFolder(name, parentId);
}

export async function downloadFile(fileId, outputPath) {
  const drive = getDrive();
  const { createWriteStream } = await import('fs');
  const dest = createWriteStream(outputPath);

  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return new Promise((resolve, reject) => {
    res.data.pipe(dest);
    dest.on('finish', () => { console.log(`  Downloaded: ${outputPath}`); resolve(outputPath); });
    dest.on('error', reject);
  });
}

// ── CLI mode ──

const command = process.argv[2];
if (command && !process.argv[1].endsWith('.test.mjs')) {
  const get = (flag, def = null) => { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : def; };

  try {
    switch (command) {
      case 'create-folder': {
        const data = await createFolder(get('--name'), get('--parent'));
        console.log(JSON.stringify(data, null, 2));
        break;
      }
      case 'upload': {
        const data = await uploadFile(get('--file'), get('--folder'), get('--name'));
        console.log(JSON.stringify(data, null, 2));
        break;
      }
      case 'list': {
        const files = await listFolder(get('--folder'));
        console.log(JSON.stringify(files, null, 2));
        break;
      }
      case 'link': {
        const links = await getShareableLink(get('--file-id'));
        console.log(JSON.stringify(links, null, 2));
        break;
      }
      case 'delete': {
        await deleteFile(get('--file-id'));
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Commands: create-folder, upload, list, link, delete');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Verify script loads**

Run:
```bash
node -e "import('./scripts/gdrive.mjs').then(m => console.log('Exports:', Object.keys(m).join(', ')))"
```

Expected: `Exports: getAuth, createFolder, uploadFile, getShareableLink, listFolder, deleteFile, searchFiles, findOrCreateFolder, downloadFile`

- [ ] **Step 3: Commit**

```bash
git add scripts/gdrive.mjs
git commit -m "feat: add Google Drive operations library"
```

---

## Task 4: Google Sheets Library (`gsheets.mjs`)

**Files:**
- Create: `scripts/gsheets.mjs`

- [ ] **Step 1: Write gsheets.mjs**

```javascript
#!/usr/bin/env node
/**
 * gsheets.mjs — Google Sheets operations library.
 *
 * Library mode (import):
 *   import { createSpreadsheet, appendRow, readRange, updateCell, batchUpdate } from './gsheets.mjs';
 *
 * CLI mode:
 *   node gsheets.mjs create --title "Project Tracker" --parent FOLDER_ID --tabs "Review,Generation Log,Prompts,Cost Summary"
 *   node gsheets.mjs read --sheet-id ID --range "Review!A1:F10"
 *   node gsheets.mjs append --sheet-id ID --tab "Review" --values '["project","1","Keyframe","link","Pending",""]'
 *   node gsheets.mjs update --sheet-id ID --range "Review!E2" --value "Approved"
 */

import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { getAuth } from './gdrive.mjs';

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getDriveService() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// ── Core operations ──

export async function createSpreadsheet(title, parentFolderId = null, tabNames = []) {
  const sheets = getSheets();
  const drive = getDriveService();

  const sheetsList = tabNames.length > 0
    ? tabNames.map(name => ({ properties: { title: name } }))
    : [{ properties: { title: 'Sheet1' } }];

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: sheetsList,
    },
  });

  const spreadsheetId = res.data.spreadsheetId;
  const url = res.data.spreadsheetUrl;

  // Move to parent folder if specified
  if (parentFolderId) {
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: parentFolderId,
      removeParents: 'root',
      fields: 'id, parents',
    });
  }

  console.log(`  Created spreadsheet: ${title} (${spreadsheetId})`);
  console.log(`  URL: ${url}`);
  return { spreadsheetId, url, sheets: res.data.sheets };
}

export async function addHeaders(spreadsheetId, tabName, headers) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
  console.log(`  Headers set on "${tabName}": ${headers.length} columns`);
}

export async function appendRow(spreadsheetId, tabName, values) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
  return res.data.updates;
}

export async function appendRows(spreadsheetId, tabName, rows) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
  return res.data.updates;
}

export async function readRange(spreadsheetId, range) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return res.data.values || [];
}

export async function readAllRows(spreadsheetId, tabName) {
  return readRange(spreadsheetId, `'${tabName}'!A:ZZ`);
}

export async function updateCell(spreadsheetId, range, value) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

export async function updateRange(spreadsheetId, range, values) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

export async function findRowsByColumn(spreadsheetId, tabName, columnIndex, value) {
  const rows = await readAllRows(spreadsheetId, tabName);
  const matches = [];
  for (let i = 1; i < rows.length; i++) {  // skip header
    if (rows[i][columnIndex] === value) {
      matches.push({ rowIndex: i + 1, data: rows[i] });  // 1-based for Sheets API
    }
  }
  return matches;
}

// ── Tracker-specific helpers ──

export const TRACKER_TABS = {
  REVIEW: 'Review',
  GEN_LOG: 'Generation Log',
  PROMPTS: 'Prompts',
  COST_SUMMARY: 'Cost Summary',
  SETTINGS: 'Settings',
};

export const REVIEW_HEADERS = [
  'Project', 'Clip #', 'Asset Type', 'Preview Link', 'Status', 'Reviewer Notes',
];

export const GEN_LOG_HEADERS = [
  'Project', 'Clip #', 'Asset Type', 'Model', 'API Provider',
  'Timestamp Start', 'Timestamp End', 'Duration (s)',
  'Input Tokens', 'Output Tokens', 'Cost (USD)', 'Cost (INR)',
  'Attempt #', 'Status', 'Error Message', 'Resolution Summary',
  'Validation Score', 'File Size', 'Dimensions / Aspect Ratio',
  'Voice ID', 'Drive Link',
];

export const PROMPTS_HEADERS = [
  'Project', 'Clip #', 'Asset Type', 'Attempt #', 'Prompt Type',
  'Prompt Text', 'Referenced Prompts', 'Response Summary',
];

export const COST_SUMMARY_HEADERS = [
  'Project', 'Phase', 'API', 'Total Calls', 'Successful',
  'Failed / Retried', 'Total Tokens', 'Total Cost (USD)',
  'Total Cost (INR)', 'Total Duration',
];

export async function createTrackerSheet(title, parentFolderId) {
  const tabs = [
    TRACKER_TABS.REVIEW,
    TRACKER_TABS.GEN_LOG,
    TRACKER_TABS.PROMPTS,
    TRACKER_TABS.COST_SUMMARY,
    TRACKER_TABS.SETTINGS,
  ];

  const { spreadsheetId, url } = await createSpreadsheet(title, parentFolderId, tabs);

  // Set headers for each tab
  await addHeaders(spreadsheetId, TRACKER_TABS.REVIEW, REVIEW_HEADERS);
  await addHeaders(spreadsheetId, TRACKER_TABS.GEN_LOG, GEN_LOG_HEADERS);
  await addHeaders(spreadsheetId, TRACKER_TABS.PROMPTS, PROMPTS_HEADERS);
  await addHeaders(spreadsheetId, TRACKER_TABS.COST_SUMMARY, COST_SUMMARY_HEADERS);

  // Set exchange rate in Settings tab
  const usdToInr = process.env.USD_TO_INR || '84.5';
  await addHeaders(spreadsheetId, TRACKER_TABS.SETTINGS, ['Setting', 'Value']);
  await appendRow(spreadsheetId, TRACKER_TABS.SETTINGS, ['USD_TO_INR', usdToInr]);

  console.log(`  Tracker sheet ready with ${tabs.length} tabs`);
  return { spreadsheetId, url };
}

export const TIMELINE_HEADERS = [
  'Project', 'Clip #', 'Role', 'Duration (s)', 'Narration Text',
  'Visual Description', 'Status', 'Notes',
];

export async function createTimelineSheet(title, parentFolderId) {
  const { spreadsheetId, url } = await createSpreadsheet(title, parentFolderId, ['Timeline']);
  await addHeaders(spreadsheetId, 'Timeline', TIMELINE_HEADERS);
  console.log(`  Timeline sheet ready`);
  return { spreadsheetId, url };
}

// ── CLI mode ──

const command = process.argv[2];
if (command && !process.argv[1].endsWith('.test.mjs')) {
  const get = (flag, def = null) => { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : def; };

  try {
    switch (command) {
      case 'create': {
        const tabs = get('--tabs') ? get('--tabs').split(',') : [];
        const data = await createSpreadsheet(get('--title'), get('--parent'), tabs);
        console.log(JSON.stringify(data, null, 2));
        break;
      }
      case 'read': {
        const values = await readRange(get('--sheet-id'), get('--range'));
        console.log(JSON.stringify(values, null, 2));
        break;
      }
      case 'append': {
        const values = JSON.parse(get('--values'));
        const result = await appendRow(get('--sheet-id'), get('--tab'), values);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'update': {
        await updateCell(get('--sheet-id'), get('--range'), get('--value'));
        console.log('Updated.');
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Verify script loads and exports**

Run:
```bash
node -e "import('./scripts/gsheets.mjs').then(m => console.log('Exports:', Object.keys(m).join(', ')))"
```

Expected: Exports list including `createSpreadsheet, addHeaders, appendRow, readRange, updateCell, createTrackerSheet, createTimelineSheet`, etc.

- [ ] **Step 3: Commit**

```bash
git add scripts/gsheets.mjs
git commit -m "feat: add Google Sheets operations library with tracker/timeline helpers"
```

---

## Task 5: Google Docs Library (`gdocs.mjs`)

**Files:**
- Create: `scripts/gdocs.mjs`

- [ ] **Step 1: Write gdocs.mjs**

```javascript
#!/usr/bin/env node
/**
 * gdocs.mjs — Google Docs operations library.
 *
 * Library mode:
 *   import { createDoc, readDoc, readComments, appendToDoc } from './gdocs.mjs';
 *
 * CLI mode:
 *   node gdocs.mjs create --title "Video Brief" --parent FOLDER_ID --content "# Brief\n..."
 *   node gdocs.mjs read --doc-id DOC_ID
 *   node gdocs.mjs comments --doc-id DOC_ID
 */

import { google } from 'googleapis';
import { getAuth } from './gdrive.mjs';

function getDocs() {
  return google.docs({ version: 'v1', auth: getAuth() });
}

function getDriveService() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// ── Core operations ──

export async function createDoc(title, parentFolderId = null, content = '') {
  const docs = getDocs();
  const drive = getDriveService();

  // Create empty doc
  const res = await docs.documents.create({
    requestBody: { title },
  });

  const docId = res.data.documentId;

  // Move to folder
  if (parentFolderId) {
    await drive.files.update({
      fileId: docId,
      addParents: parentFolderId,
      removeParents: 'root',
      fields: 'id, parents',
    });
  }

  // Insert content if provided
  if (content) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: 1 },
            text: content,
          },
        }],
      },
    });
  }

  const url = `https://docs.google.com/document/d/${docId}/edit`;
  console.log(`  Created doc: ${title}`);
  console.log(`  URL: ${url}`);
  return { docId, url };
}

export async function readDoc(docId) {
  const docs = getDocs();
  const res = await docs.documents.get({ documentId: docId });

  // Extract plain text from document body
  let text = '';
  const body = res.data.body;
  if (body && body.content) {
    for (const element of body.content) {
      if (element.paragraph) {
        for (const pe of element.paragraph.elements) {
          if (pe.textRun) {
            text += pe.textRun.content;
          }
        }
      }
    }
  }

  return { title: res.data.title, text, raw: res.data };
}

export async function readComments(docId) {
  const drive = getDriveService();
  const res = await drive.comments.list({
    fileId: docId,
    fields: 'comments(id, content, author(displayName), createdTime, resolved, replies(content, author(displayName), createdTime))',
  });

  const comments = (res.data.comments || []).map(c => ({
    id: c.id,
    content: c.content,
    author: c.author?.displayName || 'Unknown',
    createdTime: c.createdTime,
    resolved: c.resolved || false,
    replies: (c.replies || []).map(r => ({
      content: r.content,
      author: r.author?.displayName || 'Unknown',
      createdTime: r.createdTime,
    })),
  }));

  return comments;
}

export async function appendToDoc(docId, text) {
  const docs = getDocs();

  // Get current doc length
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body.content.at(-1).endIndex - 1;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{
        insertText: {
          location: { index: endIndex },
          text: '\n' + text,
        },
      }],
    },
  });

  console.log(`  Appended ${text.length} chars to doc ${docId}`);
}

export async function updateDocContent(docId, newContent) {
  const docs = getDocs();

  // Get current doc to find content range
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body.content.at(-1).endIndex - 1;

  const requests = [];

  // Delete existing content (if any beyond the initial newline)
  if (endIndex > 1) {
    requests.push({
      deleteContentRange: {
        range: { startIndex: 1, endIndex },
      },
    });
  }

  // Insert new content
  requests.push({
    insertText: {
      location: { index: 1 },
      text: newContent,
    },
  });

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests },
  });

  console.log(`  Updated doc ${docId} with ${newContent.length} chars`);
}

// ── CLI mode ──

const command = process.argv[2];
if (command && !process.argv[1].endsWith('.test.mjs')) {
  const get = (flag, def = null) => { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : def; };

  try {
    switch (command) {
      case 'create': {
        const data = await createDoc(get('--title'), get('--parent'), get('--content') || '');
        console.log(JSON.stringify(data, null, 2));
        break;
      }
      case 'read': {
        const data = await readDoc(get('--doc-id'));
        console.log(`Title: ${data.title}\n\n${data.text}`);
        break;
      }
      case 'comments': {
        const comments = await readComments(get('--doc-id'));
        console.log(JSON.stringify(comments, null, 2));
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Verify script loads**

Run:
```bash
node -e "import('./scripts/gdocs.mjs').then(m => console.log('Exports:', Object.keys(m).join(', ')))"
```

Expected: `Exports: createDoc, readDoc, readComments, appendToDoc, updateDocContent`

- [ ] **Step 3: Commit**

```bash
git add scripts/gdocs.mjs
git commit -m "feat: add Google Docs operations library with comments support"
```

---

## Task 6: Sync-to-Drive Script (`sync-to-drive.mjs`)

**Files:**
- Create: `scripts/sync-to-drive.mjs`

- [ ] **Step 1: Write sync-to-drive.mjs**

```javascript
#!/usr/bin/env node
/**
 * sync-to-drive.mjs — Upload a local file to the correct project subfolder in Google Drive.
 *
 * Usage:
 *   node sync-to-drive.mjs --file ./cache/clip-01.mp4 --subfolder clips --project-folder-id FOLDER_ID
 *
 * Returns JSON: { fileId, webViewLink, fileName, fileSize }
 */

import { statSync } from 'fs';
import { basename } from 'path';
import { uploadFile, findOrCreateFolder } from './gdrive.mjs';

const args = process.argv.slice(2);
const get = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const filePath        = get('--file');
const subfolder       = get('--subfolder');          // e.g., "clips", "keyframes", "audio"
const projectFolderId = get('--project-folder-id');  // ID of the project folder in Drive

if (!filePath || !subfolder || !projectFolderId) {
  console.error('Usage: node sync-to-drive.mjs --file <path> --subfolder <name> --project-folder-id <id>');
  process.exit(1);
}

try {
  // Find or create the subfolder inside the project folder
  const folder = await findOrCreateFolder(subfolder, projectFolderId);

  // Upload the file
  const result = await uploadFile(filePath, folder.id);

  const fileStat = statSync(filePath);
  const output = {
    fileId: result.id,
    webViewLink: result.webViewLink,
    fileName: basename(filePath),
    fileSize: fileStat.size,
    fileSizeMB: (fileStat.size / (1024 * 1024)).toFixed(2),
    folderId: folder.id,
    folderName: subfolder,
  };

  console.log(JSON.stringify(output));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
```

- [ ] **Step 2: Verify script parses**

Run:
```bash
node -c scripts/sync-to-drive.mjs
```

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-to-drive.mjs
git commit -m "feat: add sync-to-drive script for uploading assets to project folders"
```

---

## Task 7: Read-Review Script (`read-review.mjs`)

**Files:**
- Create: `scripts/read-review.mjs`

- [ ] **Step 1: Write read-review.mjs**

```javascript
#!/usr/bin/env node
/**
 * read-review.mjs — Read a Google Doc or Sheet to check for client edits/feedback.
 *
 * Usage:
 *   node read-review.mjs --type doc --id DOC_ID
 *   node read-review.mjs --type sheet --id SHEET_ID --tab "Review"
 *   node read-review.mjs --type sheet --id SHEET_ID --tab "Review" --filter-status "Rejected"
 *   node read-review.mjs --type comments --id DOC_OR_FILE_ID
 *
 * Outputs JSON with content, comments, and review statuses.
 */

import { readDoc, readComments } from './gdocs.mjs';
import { readAllRows, REVIEW_HEADERS, TIMELINE_HEADERS } from './gsheets.mjs';

const args = process.argv.slice(2);
const get = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const type         = get('--type');        // "doc", "sheet", "comments"
const id           = get('--id');          // Google Doc/Sheet ID
const tab          = get('--tab');         // Sheet tab name
const filterStatus = get('--filter-status'); // Optional: filter rows by Status column value

if (!type || !id) {
  console.error('Usage: node read-review.mjs --type <doc|sheet|comments> --id <ID> [--tab <tab>] [--filter-status <status>]');
  process.exit(1);
}

try {
  let output;

  switch (type) {
    case 'doc': {
      const doc = await readDoc(id);
      const comments = await readComments(id);
      const unresolvedComments = comments.filter(c => !c.resolved);
      output = {
        type: 'doc',
        title: doc.title,
        content: doc.text,
        comments: unresolvedComments,
        commentCount: unresolvedComments.length,
      };
      break;
    }

    case 'sheet': {
      if (!tab) { console.error('--tab required for sheet type'); process.exit(1); }
      const rows = await readAllRows(id, tab);
      if (rows.length === 0) {
        output = { type: 'sheet', tab, headers: [], rows: [], rowCount: 0 };
        break;
      }

      const headers = rows[0];
      let dataRows = rows.slice(1).map((row, i) => {
        const obj = {};
        headers.forEach((h, j) => { obj[h] = row[j] || ''; });
        obj._rowNumber = i + 2;  // 1-based, +1 for header
        return obj;
      });

      // Filter by status if requested
      if (filterStatus) {
        dataRows = dataRows.filter(r => r['Status'] === filterStatus);
      }

      output = {
        type: 'sheet',
        tab,
        headers,
        rows: dataRows,
        rowCount: dataRows.length,
      };
      break;
    }

    case 'comments': {
      const comments = await readComments(id);
      output = {
        type: 'comments',
        comments,
        total: comments.length,
        unresolved: comments.filter(c => !c.resolved).length,
      };
      break;
    }

    default:
      console.error(`Unknown type: ${type}. Use: doc, sheet, comments`);
      process.exit(1);
  }

  console.log(JSON.stringify(output, null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
```

- [ ] **Step 2: Verify script parses**

Run:
```bash
node -c scripts/read-review.mjs
```

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add scripts/read-review.mjs
git commit -m "feat: add read-review script for reading client edits and feedback"
```

---

## Task 8: Project Initialization Script (`init-project.mjs`)

**Files:**
- Create: `scripts/init-project.mjs`

- [ ] **Step 1: Write init-project.mjs**

```javascript
#!/usr/bin/env node
/**
 * init-project.mjs — Create Google Drive folder structure + Sheets for a new video project.
 *
 * Usage:
 *   node init-project.mjs --topic "Water Cycle" --class "Class 5" [--root-folder-id ID]
 *
 * Creates:
 *   EduVidGen/{Topic}-{Class}-{Date}/
 *     character-sheets/, keyframes/, audio/, clips/, scenes/, print/, final/
 *     + brief (Google Doc) + timeline (Sheet) + tracker (Sheet with 5 tabs)
 *
 * Outputs JSON manifest with all folder/file IDs.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { findOrCreateFolder, createFolder } from './gdrive.mjs';
import { createTrackerSheet, createTimelineSheet } from './gsheets.mjs';
import { createDoc } from './gdocs.mjs';

const args = process.argv.slice(2);
const get = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const topic        = get('--topic');
const classLevel   = get('--class');
const rootFolderId = get('--root-folder-id');  // optional: existing EduVidGen folder ID

if (!topic || !classLevel) {
  console.error('Usage: node init-project.mjs --topic "Water Cycle" --class "Class 5" [--root-folder-id ID]');
  process.exit(1);
}

try {
  const date = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
  const safeTopic = topic.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-');
  const safeClass = classLevel.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-');
  const projectName = `${safeTopic}-${safeClass}-${date}`;

  console.log(`\nInitializing project: ${projectName}\n`);

  // 1. Find or create root EduVidGen folder
  const rootFolder = rootFolderId
    ? { id: rootFolderId }
    : await findOrCreateFolder('EduVidGen');

  // 2. Create project folder
  const projectFolder = await createFolder(projectName, rootFolder.id);

  // 3. Create subfolders
  const subfolders = ['character-sheets', 'keyframes', 'audio', 'clips', 'scenes', 'print', 'final'];
  const folderIds = {};
  for (const name of subfolders) {
    const folder = await createFolder(name, projectFolder.id);
    folderIds[name] = folder.id;
  }

  // 4. Create brief (Google Doc)
  const brief = await createDoc(
    `${projectName} -- Brief`,
    projectFolder.id,
    `# Video Brief\n\nTopic: ${topic}\nClass: ${classLevel}\nDate: ${date}\n\n## Inputs\n\n(To be filled by pipeline)\n`
  );

  // 5. Create timeline sheet
  const timeline = await createTimelineSheet(
    `${projectName} -- Timeline`,
    projectFolder.id
  );

  // 6. Create tracker sheet (4 tabs + Settings)
  const tracker = await createTrackerSheet(
    `${projectName} -- Tracker`,
    projectFolder.id
  );

  // 7. Output manifest
  const manifest = {
    projectName,
    topic,
    classLevel,
    date,
    rootFolderId: rootFolder.id,
    projectFolderId: projectFolder.id,
    folders: folderIds,
    brief: { docId: brief.docId, url: brief.url },
    timeline: { sheetId: timeline.spreadsheetId, url: timeline.url },
    tracker: { sheetId: tracker.spreadsheetId, url: tracker.url },
  };

  console.log('\n--- Project Manifest ---');
  console.log(JSON.stringify(manifest, null, 2));

  // Write manifest to local cache for the skill to reference
  const cacheDir = `.cache/${projectName}`;
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(`${cacheDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved to: ${cacheDir}/manifest.json`);

} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
```

- [ ] **Step 2: Verify script parses**

Run:
```bash
node -c scripts/init-project.mjs
```

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add scripts/init-project.mjs
git commit -m "feat: add project initialization script for Drive folder structure + Sheets"
```

---

## Task 9: Budget Tier Config (`budget-tiers.mjs`)

**Files:**
- Create: `scripts/budget-tiers.mjs`

- [ ] **Step 1: Write budget-tiers.mjs**

```javascript
/**
 * budget-tiers.mjs — Budget tier configuration.
 *
 * Import and use in SKILL.md orchestration to determine
 * which models, transitions, and compositing strategy to use.
 *
 * Usage:
 *   import { getTierConfig, estimateCost } from './budget-tiers.mjs';
 *   const config = getTierConfig('medium');
 */

export const TIERS = {
  low: {
    label: 'Low',
    videoModel: 'veo-3.1-fast',
    videoAudio: false,
    imageModel: 'gemini-2.0-flash',
    voiceModel: 'eleven_flash_v2_5',
    voiceCreditMultiplier: 0.5,
    transitions: 'moviepy',
    ambient: 'bundled',
    soundEffects: false,
    compositor: 'composite.py',
  },
  medium: {
    label: 'Medium',
    videoModel: 'veo-3.1-fast',
    videoAudio: true,
    imageModel: 'gemini-2.0-flash',
    voiceModel: 'eleven_v3',
    voiceCreditMultiplier: 1.0,
    transitions: 'mixed',
    ambient: 'mixed',
    soundEffects: 'selective',
    compositor: 'composite.py',
  },
  high: {
    label: 'High',
    videoModel: 'veo-3.1',
    videoAudio: true,
    imageModel: 'gemini-2.0-flash',
    voiceModel: 'eleven_v3',
    voiceCreditMultiplier: 1.0,
    transitions: 'generated',
    ambient: 'generated',
    soundEffects: true,
    compositor: 'composite-video-first.py',
  },
};

export function getTierConfig(tier) {
  const config = TIERS[tier.toLowerCase()];
  if (!config) throw new Error(`Unknown budget tier: ${tier}. Use: low, medium, high`);
  return config;
}

// Cost estimation per API call (approximate, USD)
const COST_PER_CALL = {
  'gemini-2.0-flash': { image: 0.001 },
  'veo-3.1-fast': { video: 0.020 },
  'veo-3.1': { video: 0.035 },
  'eleven_v3': { perChar: 0.00024 },
  'eleven_flash_v2_5': { perChar: 0.00012 },
  'elevenlabs-sfx': { perGeneration: 0.01 },
  'validation': { perCall: 0.001 },
};

export function estimateCost(tier, clipCount, avgCharsPerClip = 120) {
  const config = getTierConfig(tier);
  const usdToInr = parseFloat(process.env.USD_TO_INR || '84.5');

  const phases = {
    'Character Sheets': { calls: 2, costUsd: 2 * COST_PER_CALL[config.imageModel].image },
    'Keyframe Images': { calls: clipCount, costUsd: clipCount * COST_PER_CALL[config.imageModel].image },
    'Voiceover': {
      calls: 1,
      costUsd: clipCount * avgCharsPerClip * COST_PER_CALL[config.voiceModel].perChar,
    },
    'Video Clips': {
      calls: config.transitions === 'generated' ? clipCount * 2 : clipCount,
      costUsd: (config.transitions === 'generated' ? clipCount * 2 : clipCount) * COST_PER_CALL[config.videoModel].video,
    },
    'Ambient Audio': {
      calls: config.ambient === 'generated' ? 1 : 0,
      costUsd: config.ambient === 'generated' ? COST_PER_CALL['elevenlabs-sfx'].perGeneration : 0,
    },
    'Compositing': { calls: 0, costUsd: 0 },
    'Validation': { calls: clipCount + 1, costUsd: (clipCount + 1) * COST_PER_CALL.validation.perCall },
  };

  let totalUsd = 0;
  const breakdown = {};
  for (const [phase, data] of Object.entries(phases)) {
    totalUsd += data.costUsd;
    breakdown[phase] = {
      calls: data.calls,
      costUsd: data.costUsd.toFixed(4),
      costInr: (data.costUsd * usdToInr).toFixed(2),
    };
  }

  const timeEstimateSec = (clipCount * 10) + (phases['Video Clips'].calls * 80) + 30 + 120;
  const timeEstimateMin = Math.ceil(timeEstimateSec / 60);

  return {
    tier: config.label,
    clipCount,
    totalCostUsd: totalUsd.toFixed(4),
    totalCostInr: (totalUsd * usdToInr).toFixed(2),
    estimatedTimeMin: timeEstimateMin,
    breakdown,
  };
}
```

- [ ] **Step 2: Verify exports and test estimateCost**

Run:
```bash
node -e "
  import { estimateCost } from './scripts/budget-tiers.mjs';
  console.log(JSON.stringify(estimateCost('low', 6), null, 2));
  console.log(JSON.stringify(estimateCost('high', 6), null, 2));
"
```

Expected: Two JSON objects showing cost breakdowns. Low should be cheaper than high.

- [ ] **Step 3: Commit**

```bash
git add scripts/budget-tiers.mjs
git commit -m "feat: add budget tier config with cost estimation"
```

---

## Task 10: Update Setup Skill

**Files:**
- Modify: `skills/setup/SKILL.md`

- [ ] **Step 1: Read current setup skill fully**

Read `skills/setup/SKILL.md` in full to understand the existing structure.

- [ ] **Step 2: Add Google Workspace section after existing verification steps**

After the existing Vertex AI / ElevenLabs / Gemini verification steps, add:

```markdown
## Step 5 — Google Workspace Setup (Drive, Docs, Sheets)

### 5.1 — Check for credentials.json

Run:
\`\`\`bash
ls "__PLUGIN_DIR__/credentials.json" 2>/dev/null
\`\`\`

If file exists, skip to 5.2.

If file does not exist, guide the user:

> Google Workspace setup is needed for cloud-native artifact storage.
>
> You need to create an OAuth Client ID in your Google Cloud project.
> Since you already have a Google Cloud project (from Veo setup), this is quick:
>
> 1. Go to: https://console.cloud.google.com/apis/library
> 2. Enable these 3 APIs (click each, then Enable):
>    - Google Drive API
>    - Google Docs API
>    - Google Sheets API
>
> 3. Go to: https://console.cloud.google.com/apis/credentials
> 4. Click "Create Credentials" then "OAuth Client ID"
> 5. Application type: "Desktop App"
> 6. Name: "EduVidGen" (or anything)
> 7. Click "Create" then "Download JSON"
> 8. Save the downloaded file as: __PLUGIN_DIR__/credentials.json

Use **AskUserQuestion** to confirm they've saved the file, then verify it exists.

### 5.2 — Check for token.json

Run:
\`\`\`bash
ls "__PLUGIN_DIR__/token.json" 2>/dev/null
\`\`\`

If file exists, skip to 5.3.

If not, run the auth flow:

\`\`\`bash
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
cd "__PLUGIN_DIR__" && node scripts/google-auth.mjs
\`\`\`

**Note:** If user sees "This app isn't verified" warning, tell them:
> This is normal for personal/internal Google Cloud projects. Click "Advanced" then "Go to EduVidGen (unsafe)". This is safe — it's your own project.

### 5.3 — Verify Google Workspace connection

\`\`\`bash
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
node -e "
  import { findOrCreateFolder } from '__PLUGIN_DIR__/scripts/gdrive.mjs';
  const folder = await findOrCreateFolder('EduVidGen');
  console.log('Google Drive connected. Root folder: ' + folder.id);
"
\`\`\`

If successful, display connection confirmation and store root folder ID.
```

- [ ] **Step 3: Update the verification summary step to include Google Workspace**

- [ ] **Step 4: Commit**

```bash
git add skills/setup/SKILL.md
git commit -m "feat: add Google Workspace setup steps to /setup skill"
```

---

## Task 11: Update Main SKILL.md — Phase 1 (Inputs + Budget Tier + Project Init)

**Files:**
- Modify: `skills/edu-vid-gen/SKILL.md`

- [ ] **Step 1: Read the full current SKILL.md**

- [ ] **Step 2: Add budget tier to Phase 1 inputs (after input #9)**

Add input #10 for budget tier selection (Low/Medium/High) with descriptions of what each tier includes. Add import of `getTierConfig` from `budget-tiers.mjs`.

- [ ] **Step 3: Add Phase 1.5 — Initialize Google Drive Project**

After collecting inputs, add project initialization via `init-project.mjs`, writing inputs to `brief.gdoc`, and Gate G1 (client reviews inputs, STOP and wait).

- [ ] **Step 4: Commit**

```bash
git add skills/edu-vid-gen/SKILL.md
git commit -m "feat: add budget tier input and Drive project init to Phase 1"
```

---

## Task 12: Update SKILL.md — Phase 2 (Brief + Timeline + Cost Gate)

**Files:**
- Modify: `skills/edu-vid-gen/SKILL.md`

- [ ] **Step 1: Add Drive sync after brief/timeline generation**

After existing Phase 2 logic, add: update `brief.gdoc` with narration script, populate `timeline.gsheet` with clip rows, Gate G2 (share links, STOP, wait for all timeline rows to be "Approved"), then read review back.

- [ ] **Step 2: Add Cost Approval (G0) after G2**

After timeline is approved, run `estimateCost()`, append cost breakdown to `brief.gdoc`, share with client, STOP and wait for cost approval.

- [ ] **Step 3: Commit**

```bash
git add skills/edu-vid-gen/SKILL.md
git commit -m "feat: add Drive sync, review gate G2, and cost approval G0 to Phase 2"
```

---

## Task 13: Update SKILL.md — Phases 2.1 through 6 (Gates G3-G8)

**Files:**
- Modify: `skills/edu-vid-gen/SKILL.md`

- [ ] **Step 1: Add the review gate pattern to each phase**

For each phase (2.1, 2.5, 3, 4, 5, 6), after generation logic add:
1. Upload to Drive via `sync-to-drive.mjs` with correct `--subfolder`
2. Log to tracker Review tab via `gsheets.mjs append`
3. Log to tracker Generation Log tab (all 21 columns)
4. Log to tracker Prompts tab
5. Gate message with links, STOP and wait
6. Read review via `read-review.mjs`, handle rejections (regenerate rejected only)

- [ ] **Step 2: Add milestone restart instructions at end of SKILL.md**

Document common restart scenarios and the pattern for handling them.

- [ ] **Step 3: Commit**

```bash
git add skills/edu-vid-gen/SKILL.md
git commit -m "feat: add review gates G3-G8 and milestone restart to all pipeline phases"
```

---

## Task 14: Update SKILL.md — Post-Completion (G9)

**Files:**
- Modify: `skills/edu-vid-gen/SKILL.md`

- [ ] **Step 1: Add Phase 7 — Post-Completion Actions**

Add the 4-option menu (additional scenes, print-ready, redo from milestone, text layouts coming soon). Detail each option: scene generation with aspect ratio selection, print enhancement via `enhance-for-print.mjs`, redo via milestone restart, text layouts as placeholder.

- [ ] **Step 2: Commit**

```bash
git add skills/edu-vid-gen/SKILL.md
git commit -m "feat: add post-completion actions (scenes, print, redo, text layouts)"
```

---

## Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md for cloud-native plugin**

Update: plugin description, add cloud-native workflow section, add budget tiers table, add Google Workspace scripts to script table, add `credentials.json`/`token.json` to API keys table, update pipeline description to include review gates.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for cloud-native plugin variant"
```

---

## Task 16: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Ensure .gitignore covers cache and credentials**

Add: `scripts/node_modules/`, `credentials.json`, `token.json`, `.cache/`

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore for cloud-native plugin"
```

---

## Task 17: End-to-End Smoke Test

**Files:** None (manual verification)

- [ ] **Step 1: Verify all scripts parse without errors**

```bash
cd ~/Documents/GitHub/edu-vid-gen-cloud
for script in google-auth gdrive gsheets gdocs sync-to-drive read-review init-project budget-tiers; do
  echo -n "$script.mjs: "
  node -c "scripts/$script.mjs" 2>&1 && echo "OK" || echo "FAIL"
done
```

Expected: All 8 scripts report "OK".

- [ ] **Step 2: Verify budget tier estimation**

```bash
node -e "
  import { estimateCost } from './scripts/budget-tiers.mjs';
  ['low','medium','high'].forEach(t => {
    const e = estimateCost(t, 6);
    console.log(t + ': \$' + e.totalCostUsd + ' (Rs' + e.totalCostInr + ') ~' + e.estimatedTimeMin + 'min');
  });
"
```

Expected: Three lines with increasing costs from low to high.

- [ ] **Step 3: Test Google auth (requires credentials.json)**

```bash
set -a; source .env 2>/dev/null; set +a
node scripts/google-auth.mjs
```

Expected: Browser opens, sign in, token.json saved.

- [ ] **Step 4: Test full project initialization (requires auth)**

```bash
node scripts/init-project.mjs --topic "Water Cycle" --class "Class 5"
```

Expected: Full folder structure created in Drive, manifest JSON output.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: smoke test fixes"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Fork repo and bootstrap | plugin.json, .env.example, package.json, .gitignore |
| 2 | Google OAuth auth script | google-auth.mjs |
| 3 | Google Drive library | gdrive.mjs |
| 4 | Google Sheets library | gsheets.mjs |
| 5 | Google Docs library | gdocs.mjs |
| 6 | Sync-to-Drive script | sync-to-drive.mjs |
| 7 | Read-Review script | read-review.mjs |
| 8 | Project init script | init-project.mjs |
| 9 | Budget tier config | budget-tiers.mjs |
| 10 | Update setup skill | skills/setup/SKILL.md |
| 11 | Update SKILL.md Phase 1 | skills/edu-vid-gen/SKILL.md |
| 12 | Update SKILL.md Phase 2 + cost gate | skills/edu-vid-gen/SKILL.md |
| 13 | Update SKILL.md Phases 2.1-6 gates | skills/edu-vid-gen/SKILL.md |
| 14 | Update SKILL.md post-completion | skills/edu-vid-gen/SKILL.md |
| 15 | Update CLAUDE.md | CLAUDE.md |
| 16 | Update .gitignore | .gitignore |
| 17 | End-to-end smoke test | (manual) |

**Dependency order:** Tasks 1 then 2 then 3 then 4,5 (parallel) then 6,7 (parallel) then 8 then 9 then 10,11,12,13,14 (parallel skill updates) then 15,16 then 17
