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

const forceReauth = args.includes('--force');

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

// Check for existing valid token (skip if --force)
if (existsSync(tokenPath) && !forceReauth) {
  const token = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  const oauth2 = new google.auth.OAuth2(client_id, client_secret);
  oauth2.setCredentials(token);

  try {
    const drive = google.drive({ version: 'v3', auth: oauth2 });
    const aboutRes = await drive.about.get({ fields: 'user' });
    const email = aboutRes.data.user.emailAddress;
    console.log(`CURRENT_ACCOUNT=${email}`);
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
} else if (forceReauth && existsSync(tokenPath)) {
  console.log('Force re-auth requested. Removing old token...');
  const { unlinkSync } = await import('fs');
  unlinkSync(tokenPath);
}

// New auth flow — start local server to receive callback
const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3847/callback');
// prompt: 'consent' forces account chooser so user can pick the right account
const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

console.log('\n--- Google Workspace Authentication ---');
console.log('Opening browser for sign-in...\n');

// Open browser safely using execFile (no shell injection risk)
// Open browser — on Windows, write a temp .html redirect file to avoid URL mangling
import { tmpdir } from 'os';
import { join } from 'path';
if (process.platform === 'win32') {
  const tmpFile = join(tmpdir(), 'eduvidgen-auth.html');
  writeFileSync(tmpFile, `<html><head><meta http-equiv="refresh" content="0;url=${authUrl}"></head><body>Redirecting to Google sign-in...</body></html>`);
  execFile('cmd', ['/c', 'start', '', tmpFile], (err) => {
    if (err) console.log(`Could not open browser. Visit:\n${authUrl}\n`);
  });
} else if (process.platform === 'darwin') {
  execFile('open', [authUrl], (err) => {
    if (err) console.log(`Could not open browser. Visit:\n${authUrl}\n`);
  });
} else {
  execFile('xdg-open', [authUrl], (err) => {
    if (err) console.log(`Could not open browser. Visit:\n${authUrl}\n`);
  });
}

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

// Kill any existing process on port 3847 before starting
import { execFileSync } from 'child_process';
try {
  if (process.platform === 'win32') {
    // Use PowerShell to find and kill process on port 3847
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      '(Get-NetTCPConnection -LocalPort 3847 -State Listen -ErrorAction SilentlyContinue).OwningProcess'
    ], { encoding: 'utf-8', timeout: 5000 }).trim();
    if (out && out !== '0') {
      execFileSync('taskkill', ['/F', '/PID', out], { timeout: 5000 });
      console.log(`  Killed old process on port 3847 (PID ${out})`);
    }
  } else {
    const out = execFileSync('lsof', ['-ti', ':3847'], { encoding: 'utf-8', timeout: 5000 }).trim();
    if (out) { execFileSync('kill', ['-9', out], { timeout: 5000 }); }
  }
} catch {}

server.listen(3847, () => {
  console.log('Waiting for Google sign-in callback on http://localhost:3847/callback ...');
});

// Timeout after 2 minutes
setTimeout(() => {
  console.error('Timeout — no callback received after 2 minutes.');
  server.close();
  process.exit(1);
}, 120_000);
