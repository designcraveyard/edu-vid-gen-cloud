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
