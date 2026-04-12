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

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === __filename;
const command = process.argv[2];
if (isMain && command) {
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
