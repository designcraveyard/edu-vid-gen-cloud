---
name: setup
description: First-time setup for edu-vid-gen plugin. Installs prerequisites (ffmpeg, imagemagick, python packages), configures API keys, Google auth (service account + OAuth), sets output directory, and verifies everything works. Run this once on a new machine before using /edu-video. No gcloud CLI needed.
argument-hint: "[--check] to verify existing setup without modifying"
allowed-tools: ["Bash", "Read", "Write", "Edit", "AskUserQuestion"]
---

# Edu Video Gen — First-Time Setup

Interactive setup wizard. If called with `--check`, skip to **Step 6 — Verify Setup** and only report status.

---

## Step 1 — Welcome & Account Inventory

### 1.1 — Welcome

Display:

```
Welcome to Edu Video Gen setup!

This wizard will help you:
  1. Check & install prerequisites (ffmpeg, Python, Node.js)
  2. Configure authentication (service account + Google sign-in)
  3. Set API keys (ElevenLabs, Gemini)
  4. Choose where to save generated videos
  5. Verify everything works

Should take about 2 minutes. Let's go!
```

### 1.2 — Account inventory

Use **AskUserQuestion** with a **multi-select** question:

> Which of these do you already have set up?

| Option | Description |
|--------|-------------|
| service-account.json | I have the service account JSON file for Vertex AI (image/video generation). |
| credentials.json | I have the OAuth credentials JSON file for Google Drive/Docs/Sheets. |
| ElevenLabs API key | I have an ElevenLabs account and API key for voiceover. |
| Gemini API key | I have a Google AI Studio API key (optional fallback). |
| None of the above | I need everything from scratch. |

---

## Step 2 — Check & Install Prerequisites

Check each prerequisite:

```bash
echo "=== Prerequisite Check ==="

# Detect platform
OS="$(uname -s 2>/dev/null || echo Windows)"
echo "Platform: $OS"

# Node.js (try both `node` and `node.exe` for Windows compatibility)
if command -v node &>/dev/null || where node &>/dev/null 2>&1; then
  echo "✅ Node.js $(node -v 2>/dev/null || node --version 2>/dev/null)"
else
  echo "❌ Node.js — not found"
fi

# Python 3 (Windows often uses `python` not `python3`)
if command -v python3 &>/dev/null; then
  echo "✅ Python $(python3 --version 2>&1)"
elif command -v python &>/dev/null && python --version 2>&1 | grep -q "3\."; then
  echo "✅ Python $(python --version 2>&1) (as 'python')"
else
  echo "❌ Python 3 — not found"
fi

# ffmpeg
if command -v ffmpeg &>/dev/null || where ffmpeg &>/dev/null 2>&1; then
  echo "✅ ffmpeg installed"
else
  echo "❌ ffmpeg — not found"
fi

# ImageMagick
if command -v magick &>/dev/null || command -v convert &>/dev/null || where magick &>/dev/null 2>&1; then
  echo "✅ ImageMagick installed"
else
  echo "❌ ImageMagick — not found"
fi

# Python packages (use whichever python command works)
PY="python3"
command -v python3 &>/dev/null || PY="python"
$PY -c "import google.genai" 2>/dev/null && echo "✅ google-genai" || echo "❌ google-genai"
$PY -c "import moviepy" 2>/dev/null && echo "✅ moviepy" || echo "❌ moviepy"
$PY -c "from PIL import Image" 2>/dev/null && echo "✅ Pillow" || echo "❌ Pillow"
```

If anything is missing, use **AskUserQuestion**:

> The following are missing: {list}. Should I install them?

| Option | Description |
|--------|-------------|
| Yes, install all | Install all missing prerequisites automatically. |
| Skip | I'll install them myself later. |

**Detect the platform first**, then install only what's missing:

```bash
OS="$(uname -s)"
```

### macOS
```bash
brew install ffmpeg imagemagick node python3
```

### Linux (Debian/Ubuntu)
```bash
sudo apt-get update && sudo apt-get install -y ffmpeg imagemagick nodejs python3
```

### Windows (Git Bash / PowerShell)

Use `winget` (built into Windows 10+). Run each missing tool individually so one failure doesn't block the rest:

```powershell
# Node.js
winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

# Python 3
winget install --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements

# ffmpeg
winget install --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements

# ImageMagick
winget install --id ImageMagick.ImageMagick --accept-source-agreements --accept-package-agreements
```

**Important (Windows):** After `winget install`, the tool may not be on PATH in the current terminal. Tell the user:

> ⚠️ Please **close and reopen your terminal** (or run `refreshenv` if using Chocolatey) after installation, then re-run `/setup` to continue.

If `winget` is not available (older Windows), fall back to direct download links:
- Node.js: https://nodejs.org (LTS `.msi` installer)
- Python: https://python.org/downloads (check "Add to PATH" during install)
- FFmpeg: https://github.com/BtbN/FFmpeg-Builds/releases (add `bin/` to PATH)

### All platforms — Python packages + Node deps

```bash
# Python packages
pip3 install google-genai moviepy Pillow requests --break-system-packages

# Node.js packages
cd "__PLUGIN_DIR__/scripts" && npm install
```

### Timeout safeguard

If any single install command takes longer than **3 minutes**, cancel it and tell the user to install that tool manually using the download links above. Do not let the wizard hang indefinitely.

---

## Step 3 — Configure Authentication

### 3.1 — Service Account (Vertex AI — image/video generation)

Check for `service-account.json`:

```bash
# Check plugin dir and current dir
SA_PATH=""
[ -f "__PLUGIN_DIR__/service-account.json" ] && SA_PATH="__PLUGIN_DIR__/service-account.json"
[ -f "./service-account.json" ] && SA_PATH="./service-account.json"

if [ -n "$SA_PATH" ]; then
  SA_EMAIL=$(python3 -c "import json; print(json.load(open('$SA_PATH'))['client_email'])")
  SA_PROJECT=$(python3 -c "import json; print(json.load(open('$SA_PATH'))['project_id'])")
  echo "✅ Service Account: $SA_EMAIL (project: $SA_PROJECT)"
else
  echo "❌ service-account.json not found"
fi
```

**If file not found**, use **AskUserQuestion**:

> I need a `service-account.json` file for Vertex AI (Veo video generation, Imagen images).
>
> **If your admin gave you the file:** Drop it in the plugin directory and tell me.
>
> **If you need to create one yourself:**
> 1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts
> 2. Click **"+ CREATE SERVICE ACCOUNT"**
> 3. Name it `edu-vid-bot`, click Create
> 4. Add roles: **Vertex AI User** + **Storage Object Viewer**
> 5. Click Done, then click the service account → Keys → Add Key → JSON
> 6. Move the downloaded file to: `__PLUGIN_DIR__/service-account.json`
>
> Have you placed the file?

| Option | Description |
|--------|-------------|
| Yes, it's in place | I put service-account.json in the plugin folder. |
| Skip Vertex AI | I'll use Gemini API key instead (limited features). |

After file is confirmed, extract the project ID:

```bash
SA_PROJECT=$(python3 -c "import json; print(json.load(open('__PLUGIN_DIR__/service-account.json'))['project_id'])")
echo "Project ID: $SA_PROJECT"
```

### 3.2 — Google OAuth (Drive, Docs, Sheets)

Check for `credentials.json`:

```bash
[ -f "__PLUGIN_DIR__/credentials.json" ] && echo "✅ credentials.json found" || echo "❌ credentials.json not found"
```

**If file not found**, guide the user:

> I need a `credentials.json` file for Google Drive/Docs/Sheets access.
>
> **If your admin gave you the file:** Drop it in the plugin directory and tell me.
>
> **If you need to create one:**
> 1. Go to: https://console.cloud.google.com/apis/credentials?project={SA_PROJECT}
> 2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
> 3. If asked for consent screen: choose External, fill in app name + email, save through all steps
> 4. Application type: **Desktop app**, Name: **EduVidGen**
> 5. Click Create → **Download JSON**
> 6. Move to: `__PLUGIN_DIR__/credentials.json`
>
> Also enable these 3 APIs (click each link → Enable):
> - https://console.cloud.google.com/apis/library/drive.googleapis.com?project={SA_PROJECT}
> - https://console.cloud.google.com/apis/library/sheets.googleapis.com?project={SA_PROJECT}
> - https://console.cloud.google.com/apis/library/docs.googleapis.com?project={SA_PROJECT}

### 3.3 — Google Sign-In (one-time)

Check for `token.json`:

```bash
[ -f "__PLUGIN_DIR__/token.json" ] && echo "✅ Already signed in" || echo "❌ Not signed in yet"
```

If no token.json, use **AskUserQuestion**:

> A browser window will open for Google sign-in. This is a one-time step.
>
> Sign in with the Google account that has access to the shared Drive folder.
>
> If you see "This app isn't verified" — click **Advanced** → **Go to EduVidGen**.
>
> Ready?

| Option | Description |
|--------|-------------|
| Yes, open browser | I'll sign in now. |

Then run:

```bash
cd "__PLUGIN_DIR__" && node scripts/google-auth.mjs --credentials ./credentials.json --token ./token.json
```

---

## Step 4 — Collect API Keys

### 4.1 — ElevenLabs (required for voiceover)

Use **AskUserQuestion**:

> Please paste your ElevenLabs API key:
> (Get one at https://elevenlabs.io/app/settings/api-keys)

| Option | Description |
|--------|-------------|
| I have it ready | I'll paste my key. |
| Skip for now | I'll add it later. Voiceover won't work without it. |

### 4.2 — Gemini API Key (optional)

Use **AskUserQuestion**:

> Do you have a Gemini API key? (Optional — used as fallback for image generation)
> (Get one at https://aistudio.google.com/apikey)

| Option | Description |
|--------|-------------|
| Yes, I have it | I'll paste my key. |
| No, skip | I'll use Vertex AI only (service account). |

---

## Step 5 — Configure Output Directory

Use **AskUserQuestion**:

> Where should generated videos be saved?

| Option | Description |
|--------|-------------|
| Default ({platform_default}) | Videos saved to `~/Movies/EduVidGen` (Mac) or `~/Videos/EduVidGen` (Windows/Linux). Easy to find in Finder/File Explorer. |
| Custom path | I'll type a specific folder path. |
| Current directory | Save in whatever folder I'm in when I run /edu-video (old behavior). |

Detect platform default:

```bash
if [ "$(uname)" = "Darwin" ]; then
  PLATFORM_DEFAULT="$HOME/Movies/EduVidGen"
else
  PLATFORM_DEFAULT="$HOME/Videos/EduVidGen"
fi
```

If custom path, ask the user to type it. Validate and create:

```bash
mkdir -p "$OUTPUT_DIR"
echo "✅ Output folder: $OUTPUT_DIR"
```

**Note:** The output folder can be changed anytime:
- Say "save this video in ~/Desktop/review/" during video generation
- Edit `OUTPUT_BASE_DIR` in `.env`
- Re-run `/setup`

---

## Step 5.5 — Write .env File

```bash
cat > "__PLUGIN_DIR__/.env" << EOF
# Edu Video Gen — Configuration
# Generated by /setup on $(date +%Y-%m-%d)

# Google Cloud project
GCLOUD_PROJECT={SA_PROJECT}

# Service Account (Vertex AI — Veo, Imagen)
GOOGLE_APPLICATION_CREDENTIALS=__PLUGIN_DIR__/service-account.json
GOOGLE_SERVICE_ACCOUNT_PATH=__PLUGIN_DIR__/service-account.json

# OAuth (Google Drive, Docs, Sheets)
GOOGLE_CREDENTIALS_PATH=__PLUGIN_DIR__/credentials.json
GOOGLE_TOKEN_PATH=__PLUGIN_DIR__/token.json

# ElevenLabs (voiceover)
ELEVENLABS_API_KEY={elevenlabs_key}

# Gemini API key (optional fallback)
GEMINI_API_KEY={gemini_key}

# Together AI (optional — Wan 2.7 backend)
TOGETHER_API_KEY=

# Output directory
OUTPUT_BASE_DIR={output_dir}

# Exchange rate
USD_TO_INR=84.5
EOF
```

---

## Step 6 — Verify Setup

Run verification of each component:

```bash
echo "=== Verification ==="

# Load env
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a

# Service Account
if [ -f "__PLUGIN_DIR__/service-account.json" ]; then
  SA_EMAIL=$(python3 -c "import json; print(json.load(open('__PLUGIN_DIR__/service-account.json'))['client_email'])")
  echo "✅ Service Account: $SA_EMAIL"
else
  echo "❌ Service Account not configured"
fi

# Vertex AI access
if [ -n "$GCLOUD_PROJECT" ] && [ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  if python3 -c "
from google import genai
client = genai.Client(vertexai=True, project='$GCLOUD_PROJECT', location='us-central1')
print('ok')
" 2>/dev/null | grep -q "ok"; then
    echo "✅ Vertex AI connected (project: $GCLOUD_PROJECT)"
  else
    echo "❌ Vertex AI connection failed — check service account roles"
  fi
else
  echo "⚠️ Vertex AI not configured"
fi

# ElevenLabs
if [ -n "$ELEVENLABS_API_KEY" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "xi-api-key: $ELEVENLABS_API_KEY" "https://api.elevenlabs.io/v1/user")
  [ "$STATUS" = "200" ] && echo "✅ ElevenLabs API key valid" || echo "❌ ElevenLabs API key invalid (HTTP $STATUS)"
else
  echo "⚠️ ElevenLabs API key not set — voiceover won't work"
fi

# Gemini API key
if [ -n "$GEMINI_API_KEY" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY")
  [ "$STATUS" = "200" ] && echo "✅ Gemini API key valid" || echo "❌ Gemini API key invalid (HTTP $STATUS)"
else
  echo "ℹ️  Gemini API key not set (optional)"
fi

# Google Workspace (Drive/Docs/Sheets via OAuth)
if [ -f "__PLUGIN_DIR__/credentials.json" ] && [ -f "__PLUGIN_DIR__/token.json" ]; then
  echo "✅ Google Workspace credentials present"
else
  if [ -f "__PLUGIN_DIR__/credentials.json" ]; then
    echo "❌ Google Workspace: credentials.json found but token.json missing — run: node __PLUGIN_DIR__/scripts/google-auth.mjs"
  else
    echo "⚠️ Google Workspace not configured"
  fi
fi

# Output dir
if [ -n "$OUTPUT_BASE_DIR" ]; then
  mkdir -p "$OUTPUT_BASE_DIR" 2>/dev/null && echo "✅ Output directory: $OUTPUT_BASE_DIR" || echo "❌ Cannot create output directory: $OUTPUT_BASE_DIR"
else
  echo "ℹ️  Output directory: current working directory (default)"
fi
```

---

## Step 7 — Summary

```
=== Setup Complete ===

Auth:             Service Account + OAuth (no gcloud CLI needed)
Vertex AI:        {status} (project: {project_id})
ElevenLabs:       {status}
Gemini API key:   {status}
Google Workspace: {status}
Output directory: {path}

You're ready! Run /edu-video to generate your first video.

Tip: You can change the output folder anytime by saying
"save this video in [path]" during generation, or re-run /setup.
```
