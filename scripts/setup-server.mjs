#!/usr/bin/env node
/**
 * setup-server.mjs — Local setup wizard web UI.
 * Starts a local server, opens browser, collects config, writes files, exits.
 *
 * Usage: node scripts/setup-server.mjs [--port 3456]
 */

import { createServer } from 'http';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..');

const args = process.argv.slice(2);
const port = parseInt(args[args.indexOf('--port') + 1] || '3456', 10);

// Detect existing config
function getExistingConfig() {
  const config = {};
  if (existsSync(resolve(PLUGIN_DIR, '.env'))) {
    const env = readFileSync(resolve(PLUGIN_DIR, '.env'), 'utf-8');
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) config[m[1]] = m[2];
    }
  }
  config.hasServiceAccount = existsSync(resolve(PLUGIN_DIR, 'service-account.json'));
  config.hasCredentials = existsSync(resolve(PLUGIN_DIR, 'credentials.json'));
  config.hasToken = existsSync(resolve(PLUGIN_DIR, 'token.json'));

  if (config.hasServiceAccount) {
    try {
      const sa = JSON.parse(readFileSync(resolve(PLUGIN_DIR, 'service-account.json'), 'utf-8'));
      config.saEmail = sa.client_email;
      config.saProject = sa.project_id;
    } catch {}
  }

  // Platform default output dir
  config.defaultOutputDir = process.platform === 'darwin'
    ? `${process.env.HOME}/Movies/EduVidGen`
    : process.platform === 'win32'
      ? `${process.env.USERPROFILE}\\Videos\\EduVidGen`
      : `${process.env.HOME}/Videos/EduVidGen`;

  // Show the actual plugin directory for debugging
  config.pluginDir = PLUGIN_DIR;

  return config;
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Edu Video Gen — Setup</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --success: 142 76% 36%;
    --radius: 0.5rem;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: hsl(var(--secondary));
    color: hsl(var(--foreground));
    min-height: 100vh;
    display: flex; justify-content: center;
    padding: 48px 16px;
    -webkit-font-smoothing: antialiased;
  }

  .container { max-width: 580px; width: 100%; }

  /* Header */
  .header { margin-bottom: 32px; }
  .header h1 {
    font-size: 24px; font-weight: 700; letter-spacing: -0.025em;
    color: hsl(var(--foreground)); margin-bottom: 4px;
  }
  .header p {
    font-size: 14px; color: hsl(var(--muted-foreground)); line-height: 1.5;
  }

  /* Card */
  .card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 16px;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }
  .card-header {
    margin-bottom: 20px;
  }
  .card-title {
    font-size: 16px; font-weight: 600; letter-spacing: -0.01em;
    color: hsl(var(--foreground)); margin-bottom: 2px;
  }
  .card-description {
    font-size: 13px; color: hsl(var(--muted-foreground)); line-height: 1.5;
  }

  /* Form */
  .form-group { margin-bottom: 16px; }
  .form-group:last-child { margin-bottom: 0; }

  .form-label {
    display: block; font-size: 13px; font-weight: 500;
    color: hsl(var(--foreground)); margin-bottom: 6px;
  }
  .form-label .badge {
    display: inline-block; font-size: 11px; font-weight: 500;
    padding: 1px 6px; border-radius: 9999px; margin-left: 6px;
    vertical-align: middle;
  }
  .badge-required { background: hsl(0 84.2% 60.2% / 0.1); color: hsl(var(--destructive)); }
  .badge-optional { background: hsl(var(--secondary)); color: hsl(var(--muted-foreground)); }

  .form-hint {
    font-size: 12px; color: hsl(var(--muted-foreground));
    margin-bottom: 8px; line-height: 1.4;
  }

  input[type="text"], input[type="password"] {
    width: 100%; height: 36px; padding: 0 12px;
    background: transparent;
    border: 1px solid hsl(var(--input));
    border-radius: calc(var(--radius) - 2px);
    color: hsl(var(--foreground));
    font-size: 13px; font-family: 'Inter', system-ui, sans-serif;
    outline: none; transition: all 0.15s;
  }
  input:focus {
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.1);
  }
  input::placeholder { color: hsl(var(--muted-foreground) / 0.5); }
  input.mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace; font-size: 12px; }

  /* File upload */
  .file-zone {
    border: 1px dashed hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    padding: 24px 16px;
    text-align: center; cursor: pointer;
    transition: all 0.15s; position: relative;
    background: hsl(var(--secondary) / 0.5);
  }
  .file-zone:hover {
    border-color: hsl(var(--muted-foreground) / 0.3);
    background: hsl(var(--secondary));
  }
  .file-zone.uploaded {
    border-color: hsl(var(--success));
    border-style: solid;
    background: hsl(142 76% 36% / 0.04);
  }
  .file-zone input[type="file"] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer;
  }
  .file-zone svg { margin: 0 auto 8px; display: block; }
  .file-zone .file-label {
    font-size: 13px; color: hsl(var(--muted-foreground));
  }
  .file-zone.uploaded .file-label { color: hsl(var(--success)); font-weight: 500; }

  /* Status badges */
  .status-list { display: flex; flex-direction: column; gap: 8px; }
  .status-item {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: hsl(var(--foreground));
  }
  .status-icon {
    width: 18px; height: 18px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; font-size: 10px;
  }
  .status-icon.ok { background: hsl(142 76% 36% / 0.1); color: hsl(var(--success)); }
  .status-icon.err { background: hsl(0 84.2% 60.2% / 0.1); color: hsl(var(--destructive)); }
  .status-icon.warn { background: hsl(48 96% 53% / 0.15); color: hsl(48 96% 40%); }

  /* Buttons */
  .btn-primary {
    display: inline-flex; align-items: center; justify-content: center;
    width: 100%; height: 40px;
    background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
    border: none; border-radius: calc(var(--radius) - 2px);
    font-size: 14px; font-weight: 500; font-family: inherit;
    cursor: pointer; transition: opacity 0.15s;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-outline {
    display: inline-flex; align-items: center; justify-content: center;
    width: 100%; height: 40px;
    background: transparent; color: hsl(var(--foreground));
    border: 1px solid hsl(var(--input));
    border-radius: calc(var(--radius) - 2px);
    font-size: 14px; font-weight: 500; font-family: inherit;
    cursor: pointer; transition: all 0.15s;
    margin-top: 8px;
  }
  .btn-outline:hover { background: hsl(var(--accent)); }

  .btn-group { margin-top: 4px; }

  /* Separator */
  .separator {
    height: 1px; background: hsl(var(--border));
    margin: 16px 0;
  }

  /* Messages */
  .msg { font-size: 13px; margin-top: 8px; line-height: 1.4; }
  .msg-error { color: hsl(var(--destructive)); }
  .msg-info { color: hsl(var(--muted-foreground)); }
  .msg-success { color: hsl(var(--success)); }

  /* Success screen */
  .success-screen { text-align: center; padding: 80px 20px; }
  .success-screen .icon {
    width: 56px; height: 56px; margin: 0 auto 20px;
    background: hsl(142 76% 36% / 0.1); border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px;
  }
  .success-screen h2 {
    font-size: 20px; font-weight: 600; letter-spacing: -0.01em;
    margin-bottom: 4px;
  }
  .success-screen p {
    font-size: 14px; color: hsl(var(--muted-foreground));
    margin-bottom: 24px;
  }
  .success-screen code {
    background: hsl(var(--secondary)); padding: 2px 6px;
    border-radius: 4px; font-size: 13px;
    font-family: ui-monospace, monospace;
  }
</style>
</head>
<body>
<div class="container" id="app">

  <div class="header">
    <h1>Edu Video Gen</h1>
    <p>Configure your video generation pipeline. This takes about a minute.</p>
  </div>

  <!-- Status -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Status</div>
    </div>
    <div class="status-list">
      <div class="status-item"><div class="status-icon" id="dot-sa"></div><span id="status-sa">Checking...</span></div>
      <div class="status-item"><div class="status-icon" id="dot-cred"></div><span id="status-cred">Checking...</span></div>
      <div class="status-item"><div class="status-icon" id="dot-token"></div><span id="status-token">Checking...</span></div>
    </div>
  </div>

  <!-- Auth Files -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Authentication</div>
      <div class="card-description">Upload the JSON files provided by your admin.</div>
    </div>

    <div class="form-group">
      <label class="form-label">Service Account <span class="badge badge-required">required</span></label>
      <p class="form-hint">For video and image generation via Vertex AI.</p>
      <div class="file-zone" id="sa-upload">
        <input type="file" accept=".json" onchange="handleFile(this, 'service-account')">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color:hsl(var(--muted-foreground))"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
        <div class="file-label" id="sa-text">Click to upload service-account.json</div>
      </div>
    </div>

    <div class="separator"></div>

    <div class="form-group">
      <label class="form-label">OAuth Credentials <span class="badge badge-required">required</span></label>
      <p class="form-hint">For Google Drive, Docs, and Sheets access.</p>
      <div class="file-zone" id="cred-upload">
        <input type="file" accept=".json" onchange="handleFile(this, 'credentials')">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color:hsl(var(--muted-foreground))"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
        <div class="file-label" id="cred-text">Click to upload credentials.json</div>
      </div>
    </div>
  </div>

  <!-- API Keys -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">API Keys</div>
      <div class="card-description">Paste your API keys below.</div>
    </div>

    <div class="form-group">
      <label class="form-label">ElevenLabs <span class="badge badge-required">required</span></label>
      <p class="form-hint">For voiceover generation. Get yours at elevenlabs.io/app/settings/api-keys</p>
      <input type="password" class="mono" id="elevenlabs-key" placeholder="sk_..." autocomplete="off">
    </div>

    <div class="form-group">
      <label class="form-label">Gemini API Key <span class="badge badge-optional">optional</span></label>
      <p class="form-hint">Fallback for image generation. Get yours at aistudio.google.com/apikey</p>
      <input type="password" class="mono" id="gemini-key" placeholder="AI..." autocomplete="off">
    </div>

    <div class="form-group">
      <label class="form-label">Together AI <span class="badge badge-optional">optional</span></label>
      <p class="form-hint">Enables Wan 2.7 video backend, ~33% cheaper than Veo.</p>
      <input type="password" class="mono" id="together-key" placeholder="" autocomplete="off">
    </div>
  </div>

  <!-- Output -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Output Folder</div>
      <div class="card-description">Where your generated videos will be saved. You can change this anytime.</div>
    </div>
    <div class="form-group">
      <input type="text" id="output-dir" placeholder="">
    </div>
  </div>

  <!-- Actions -->
  <div class="btn-group">
    <button class="btn-primary" onclick="saveConfig()">Save Configuration</button>
    <button class="btn-outline" onclick="startGoogleLogin()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
      Sign into Google
    </button>
    <p class="msg msg-info" id="google-login-status"></p>
    <p class="msg msg-error" id="error-msg"></p>
  </div>

</div>

<!-- Success screen -->
<div class="container" id="success-screen" style="display:none">
  <div class="success-screen">
    <div class="icon">&#10003;</div>
    <h2>Setup Complete</h2>
    <p>Your video generation pipeline is ready to go.</p>
    <button class="btn-primary" onclick="openClaude()" style="max-width:280px;margin:0 auto">Open Claude Code</button>
    <p class="msg msg-info" style="margin-top:16px">
      Type <code>/generate-video</code> to generate your first video.
    </p>
  </div>
</div>

<script>
let config = {};
let uploadedFiles = {};

async function init() {
  const res = await fetch('/api/config');
  config = await res.json();

  // Status dots
  setStatus('sa', config.hasServiceAccount, config.saEmail ? 'Service Account: ' + config.saEmail : 'Not configured');
  setStatus('cred', config.hasCredentials, config.hasCredentials ? 'OAuth credentials found' : 'Not configured');
  setStatus('token', config.hasToken, config.hasToken ? 'Google signed in' : 'Not signed in yet');

  // Pre-fill
  if (config.hasServiceAccount) {
    document.getElementById('sa-upload').classList.add('uploaded');
    document.getElementById('sa-text').textContent = config.saEmail || 'Loaded';
  }
  if (config.hasCredentials) {
    document.getElementById('cred-upload').classList.add('uploaded');
    document.getElementById('cred-text').textContent = 'credentials.json loaded';
  }

  document.getElementById('elevenlabs-key').value = config.ELEVENLABS_API_KEY || '';
  document.getElementById('gemini-key').value = config.GEMINI_API_KEY || '';
  document.getElementById('together-key').value = config.TOGETHER_API_KEY || '';
  document.getElementById('output-dir').value = config.OUTPUT_BASE_DIR || config.defaultOutputDir || '';

  if (config.hasToken) {
    document.getElementById('google-login-status').textContent = 'Already signed in. Click to switch accounts.';
  }
}

function setStatus(id, ok, text) {
  const dot = document.getElementById('dot-' + id);
  dot.className = 'status-icon ' + (ok ? 'ok' : 'err');
  dot.textContent = ok ? String.fromCharCode(10003) : String.fromCharCode(10007);
  document.getElementById('status-' + id).textContent = text;
}

function handleFile(input, type) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      uploadedFiles[type] = e.target.result;

      const el = document.getElementById(type === 'service-account' ? 'sa-upload' : 'cred-upload');
      const textEl = document.getElementById(type === 'service-account' ? 'sa-text' : 'cred-text');
      el.classList.add('uploaded');

      if (type === 'service-account' && json.client_email) {
        textEl.textContent = json.client_email;
        setStatus('sa', true, 'Service Account: ' + json.client_email);
      } else if (type === 'credentials') {
        textEl.textContent = 'credentials.json loaded';
        setStatus('cred', true, 'OAuth credentials loaded');
      }
    } catch (err) {
      alert('Invalid JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

async function saveConfig() {
  const errEl = document.getElementById('error-msg');
  errEl.textContent = '';

  const payload = {
    elevenlabsKey: document.getElementById('elevenlabs-key').value.trim(),
    geminiKey: document.getElementById('gemini-key').value.trim(),
    togetherKey: document.getElementById('together-key').value.trim(),
    outputDir: document.getElementById('output-dir').value.trim(),
    serviceAccountJson: uploadedFiles['service-account'] || null,
    credentialsJson: uploadedFiles['credentials'] || null,
  };

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (result.ok) {
      // Check if Google login is needed
      if (!config.hasToken && !result.hasToken) {
        errEl.textContent = '';
        errEl.style.color = '#eab308';
        errEl.textContent = 'Config saved! Now click "Sign into Google" below to complete setup.';
      } else {
        document.getElementById('app').style.display = 'none';
        document.getElementById('success-screen').style.display = 'block';
      }
    } else {
      errEl.textContent = result.error || 'Save failed';
    }
  } catch (err) {
    errEl.textContent = 'Connection error: ' + err.message;
  }
}

async function startGoogleLogin() {
  const statusEl = document.getElementById('google-login-status');
  statusEl.textContent = 'Opening browser for Google sign-in...';
  try {
    const res = await fetch('/api/google-login', { method: 'POST' });
    const result = await res.json();
    if (result.ok) {
      statusEl.style.color = '#22c55e';
      statusEl.textContent = 'Signed in as: ' + (result.email || 'unknown');
      setStatus('token', true, 'Signed in as ' + (result.email || 'unknown'));
      config.hasToken = true;
    } else {
      statusEl.textContent = 'Sign-in failed: ' + (result.error || 'unknown error');
    }
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
}

function openClaude() {
  fetch('/api/open-claude', { method: 'POST' });
  // Also try protocol handler
  window.location.href = 'claude://';
}

init();
</script>
</body>
</html>`;

// ── Server ──

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getExistingConfig()));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/save') {
    const body = await readBody(req);
    try {
      const data = JSON.parse(body);

      // Save uploaded files
      if (data.serviceAccountJson) {
        writeFileSync(resolve(PLUGIN_DIR, 'service-account.json'), data.serviceAccountJson);
      }
      if (data.credentialsJson) {
        writeFileSync(resolve(PLUGIN_DIR, 'credentials.json'), data.credentialsJson);
      }

      // Read service account project
      let saProject = '';
      if (existsSync(resolve(PLUGIN_DIR, 'service-account.json'))) {
        try {
          const sa = JSON.parse(readFileSync(resolve(PLUGIN_DIR, 'service-account.json'), 'utf-8'));
          saProject = sa.project_id || '';
        } catch {}
      }

      // Create output dir
      if (data.outputDir) {
        mkdirSync(data.outputDir, { recursive: true });
      }

      // Write .env
      const env = `# Edu Video Gen — Configuration
# Generated by setup wizard on ${new Date().toISOString().split('T')[0]}

# Google Cloud project
GCLOUD_PROJECT=${saProject}

# Service Account (Vertex AI — Veo, Imagen)
GOOGLE_APPLICATION_CREDENTIALS=${resolve(PLUGIN_DIR, 'service-account.json')}
GOOGLE_SERVICE_ACCOUNT_PATH=${resolve(PLUGIN_DIR, 'service-account.json')}

# OAuth (Google Drive, Docs, Sheets)
GOOGLE_CREDENTIALS_PATH=${resolve(PLUGIN_DIR, 'credentials.json')}
GOOGLE_TOKEN_PATH=${resolve(PLUGIN_DIR, 'token.json')}

# ElevenLabs (voiceover)
ELEVENLABS_API_KEY=${data.elevenlabsKey || ''}

# Gemini API key (optional fallback)
GEMINI_API_KEY=${data.geminiKey || ''}

# Together AI (optional)
TOGETHER_API_KEY=${data.togetherKey || ''}

# Output directory
OUTPUT_BASE_DIR=${data.outputDir || ''}

# Exchange rate
USD_TO_INR=84.5
`;
      writeFileSync(resolve(PLUGIN_DIR, '.env'), env);

      const hasToken = existsSync(resolve(PLUGIN_DIR, 'token.json'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, hasToken }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/google-login') {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = execFile('node', [
          `${PLUGIN_DIR}/scripts/google-auth.mjs`,
          '--credentials', `${PLUGIN_DIR}/credentials.json`,
          '--token', `${PLUGIN_DIR}/token.json`,
        ], { cwd: PLUGIN_DIR, timeout: 120000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve(stdout);
        });
      });

      const emailMatch = result.match(/Authenticated as (\S+)/);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, email: emailMatch?.[1] || 'unknown' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/open-claude') {
    try {
      if (process.platform === 'darwin') {
        execFile('open', ['claude://']);
      } else if (process.platform === 'win32') {
        execFile('cmd', ['/c', 'start', '', 'claude://']);
      }
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

    // Shut down server after a short delay
    setTimeout(() => process.exit(0), 2000);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
  });
}

// Kill any existing process on this port before starting
import { execFileSync } from 'child_process';
try {
  if (process.platform === 'win32') {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`
    ], { encoding: 'utf-8', timeout: 5000 }).trim();
    if (out && out !== '0') {
      execFileSync('taskkill', ['/F', '/PID', out], { timeout: 5000 });
    }
  }
} catch {}

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  Setup wizard running at: ${url}\n`);

  // Open browser
  if (process.platform === 'darwin') {
    execFile('open', [url]);
  } else if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile('xdg-open', [url]);
  }
});
