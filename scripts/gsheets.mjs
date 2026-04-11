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
