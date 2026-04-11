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
