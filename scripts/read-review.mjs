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
