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
