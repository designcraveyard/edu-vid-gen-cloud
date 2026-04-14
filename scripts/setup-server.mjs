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

  return config;
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Edu Video Gen — Setup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0a0a0a; color: #e5e5e5;
    min-height: 100vh; display: flex; justify-content: center; padding: 40px 20px;
  }
  .container { max-width: 640px; width: 100%; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #fff; }
  .subtitle { color: #888; margin-bottom: 32px; font-size: 15px; }
  .section { margin-bottom: 28px; }
  .section-title {
    font-size: 13px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px; color: #888; margin-bottom: 12px;
  }
  .card {
    background: #161616; border: 1px solid #262626; border-radius: 12px;
    padding: 20px; margin-bottom: 12px;
  }
  label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #ccc; }
  .hint { font-size: 12px; color: #666; margin-bottom: 8px; }
  input[type="text"], input[type="password"] {
    width: 100%; padding: 10px 12px; background: #0a0a0a; border: 1px solid #333;
    border-radius: 8px; color: #fff; font-size: 14px; font-family: monospace;
    outline: none; transition: border-color 0.2s;
  }
  input:focus { border-color: #666; }
  input::placeholder { color: #444; }

  .file-upload {
    border: 2px dashed #333; border-radius: 8px; padding: 20px;
    text-align: center; cursor: pointer; transition: all 0.2s;
    position: relative;
  }
  .file-upload:hover { border-color: #555; background: #1a1a1a; }
  .file-upload.has-file { border-color: #22c55e; border-style: solid; }
  .file-upload input[type="file"] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer;
  }
  .file-upload .icon { font-size: 24px; margin-bottom: 4px; }
  .file-upload .text { font-size: 13px; color: #888; }
  .file-upload.has-file .text { color: #22c55e; }

  .status-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 0; font-size: 14px;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .status-dot.green { background: #22c55e; }
  .status-dot.red { background: #ef4444; }
  .status-dot.yellow { background: #eab308; }

  .btn {
    width: 100%; padding: 14px; background: #fff; color: #000;
    border: none; border-radius: 10px; font-size: 16px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; margin-top: 8px;
  }
  .btn:hover { background: #e5e5e5; }
  .btn:disabled { background: #333; color: #666; cursor: not-allowed; }
  .btn.secondary {
    background: transparent; border: 1px solid #333; color: #ccc;
    font-size: 14px; padding: 10px; margin-top: 4px;
  }
  .btn.secondary:hover { border-color: #555; }

  .success {
    text-align: center; padding: 60px 20px;
  }
  .success .checkmark { font-size: 64px; margin-bottom: 16px; }
  .success h2 { font-size: 24px; color: #fff; margin-bottom: 8px; }
  .success p { color: #888; margin-bottom: 24px; }

  .error-msg { color: #ef4444; font-size: 13px; margin-top: 8px; }
  .info-msg { color: #888; font-size: 13px; margin-top: 4px; }

  .row { display: flex; gap: 12px; }
  .row > * { flex: 1; }
</style>
</head>
<body>
<div class="container" id="app">

  <h1>Edu Video Gen</h1>
  <p class="subtitle">Setup wizard — configure your video generation pipeline</p>

  <!-- Status -->
  <div class="section" id="status-section">
    <div class="section-title">Current Status</div>
    <div class="card" id="status-card">
      <div class="status-row"><div class="status-dot" id="dot-sa"></div><span id="status-sa">Checking...</span></div>
      <div class="status-row"><div class="status-dot" id="dot-cred"></div><span id="status-cred">Checking...</span></div>
      <div class="status-row"><div class="status-dot" id="dot-token"></div><span id="status-token">Checking...</span></div>
    </div>
  </div>

  <!-- Auth Files -->
  <div class="section">
    <div class="section-title">Authentication Files</div>
    <div class="card">
      <label>Service Account JSON</label>
      <p class="hint">For Vertex AI (Veo video gen, Imagen images). Ask your admin if you don't have this.</p>
      <div class="file-upload" id="sa-upload">
        <input type="file" accept=".json" onchange="handleFile(this, 'service-account')">
        <div class="icon">📄</div>
        <div class="text" id="sa-text">Drop service-account.json here or click to browse</div>
      </div>
    </div>
    <div class="card">
      <label>OAuth Credentials JSON</label>
      <p class="hint">For Google Drive, Docs, Sheets access. Ask your admin if you don't have this.</p>
      <div class="file-upload" id="cred-upload">
        <input type="file" accept=".json" onchange="handleFile(this, 'credentials')">
        <div class="icon">📄</div>
        <div class="text" id="cred-text">Drop credentials.json here or click to browse</div>
      </div>
    </div>
  </div>

  <!-- API Keys -->
  <div class="section">
    <div class="section-title">API Keys</div>
    <div class="card">
      <label>ElevenLabs API Key <span style="color:#ef4444">*required</span></label>
      <p class="hint">For voiceover generation. Get one at elevenlabs.io/app/settings/api-keys</p>
      <input type="password" id="elevenlabs-key" placeholder="sk_..." autocomplete="off">
    </div>
    <div class="card">
      <label>Gemini API Key <span style="color:#666">optional</span></label>
      <p class="hint">Fallback for image generation. Get one at aistudio.google.com/apikey</p>
      <input type="password" id="gemini-key" placeholder="AI..." autocomplete="off">
    </div>
    <div class="card">
      <label>Together AI Key <span style="color:#666">optional</span></label>
      <p class="hint">Enables Wan 2.7 video backend (~33% cheaper than Veo)</p>
      <input type="password" id="together-key" placeholder="" autocomplete="off">
    </div>
  </div>

  <!-- Output -->
  <div class="section">
    <div class="section-title">Output</div>
    <div class="card">
      <label>Video Output Folder</label>
      <p class="hint">Where generated videos will be saved. You can change this anytime.</p>
      <input type="text" id="output-dir" placeholder="">
    </div>
  </div>

  <!-- Actions -->
  <div class="section">
    <button class="btn" onclick="saveConfig()">Save & Continue</button>
    <button class="btn secondary" onclick="startGoogleLogin()">Sign into Google (Drive/Sheets)</button>
    <p class="info-msg" id="google-login-status"></p>
    <p class="error-msg" id="error-msg"></p>
  </div>

</div>

<!-- Success screen -->
<div class="container" id="success-screen" style="display:none">
  <div class="success">
    <div class="checkmark">✅</div>
    <h2>Setup Complete!</h2>
    <p>Your video generation pipeline is ready.</p>
    <button class="btn" onclick="openClaude()">Open Claude Code</button>
    <p class="info-msg" style="margin-top:16px">
      Type <code>/edu-video</code> in Claude Code to generate your first video.
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
    document.getElementById('sa-upload').classList.add('has-file');
    document.getElementById('sa-text').textContent = 'service-account.json (' + (config.saProject || 'loaded') + ')';
  }
  if (config.hasCredentials) {
    document.getElementById('cred-upload').classList.add('has-file');
    document.getElementById('cred-text').textContent = 'credentials.json (loaded)';
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
  document.getElementById('dot-' + id).className = 'status-dot ' + (ok ? 'green' : 'red');
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
      el.classList.add('has-file');

      if (type === 'service-account' && json.client_email) {
        textEl.textContent = json.client_email + ' (' + json.project_id + ')';
        setStatus('sa', true, 'Service Account: ' + json.client_email);
      } else if (type === 'credentials') {
        textEl.textContent = 'credentials.json (loaded)';
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
