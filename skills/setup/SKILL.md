---
name: setup
description: First-time setup for edu-vid-gen plugin. Installs prerequisites (ffmpeg, imagemagick, python packages, gcloud), configures API keys and Google Cloud Vertex AI, sets output directory, and verifies everything works. Run this once on a new machine before using /edu-video.
argument-hint: "[--check] to verify existing setup without modifying"
allowed-tools: ["Bash", "Read", "Write", "Edit", "AskUserQuestion"]
---

# Edu Video Gen — First-Time Setup

Interactive setup wizard that walks the user through prerequisites, account creation, API configuration, and verification.

If called with `--check`, skip to **Step 6 — Verify Setup** and only report status without modifying anything.

---

## Step 1 — Welcome & Account Inventory

### 1.1 — Welcome

Display:

```
Welcome to Edu Video Gen setup!

This wizard will help you:
  1. Check & install prerequisites (ffmpeg, Python, Node.js, etc.)
  2. Set up the cloud accounts you need
  3. Configure API keys and authentication
  4. Set up Google Workspace (Drive, Docs, Sheets) for cloud-native storage
  5. Verify everything works

If you have the Claude browser extension, I can see your screen and
help you through the Google Cloud Console setup step by step.

Let's start by understanding what accounts you already have.
```

### 1.2 — Account inventory

Use **AskUserQuestion** with a **multi-select** question:

> Which of these accounts do you already have?

| Option | Description |
|--------|-------------|
| Google Cloud Platform | Used for video generation (Veo) and image generation via Vertex AI. This is the primary auth method. |
| ElevenLabs | Used for AI voiceover generation. |
| Google AI Studio (Gemini API key) | Optional fallback for image generation if you prefer not to use Google Cloud. |
| Together AI | Optional — enables the Wan 2.7 video backend (~33% cheaper than Veo). |
| None of the above | I need to create all accounts from scratch. |

Store the user's selections. Steps 2.x below will guide them through creating any missing accounts.

---

## Step 2 — Account Creation Guidance

For each account the user does NOT already have, walk them through creation using the relevant subsection below. Skip subsections for accounts they already have.

### 2.1 — Google Cloud Platform (required)

Google Cloud is the **primary authentication method** for this plugin. It powers:
- Video generation (Veo 3.1 via Vertex AI)
- Image generation (Imagen 4 / Nano Banana 2 via Vertex AI)
- All validation scripts (clip, sync, final review)

**Full step-by-step guide:** Load `references/google-cloud-setup-guide.md` — it covers account creation, billing, project setup, all 4 APIs, consent screen, OAuth credentials, and gcloud CLI installation with screenshots-level detail and troubleshooting. If the user has the Claude browser extension, tell them that Claude can see their screen and help at each step.

Guide the user through these steps ONE AT A TIME using **AskUserQuestion** for each:

**Step 2.1a** — Use **AskUserQuestion**:

> **Google Cloud Platform Setup (1/4)**
>
> Go to https://console.cloud.google.com/ and sign in with the Google account you want to use for this project.
>
> If you're new: accept terms, choose your country, and add billing info. GCP offers $300 free credit — more than enough to get started.
>
> **Are you signed in?**

| Option | Description |
|--------|-------------|
| Yes, I'm signed in | I can see the Google Cloud Console. |
| I need help | I'm having trouble signing in. |
| Skip Google Cloud | I'll use a Gemini API key as fallback instead. |

**Step 2.1b** — Use **AskUserQuestion**:

> **Google Cloud Platform Setup (2/4)**
>
> Now create a project:
> 1. Click the project selector at the top of the page (it may say "Select a project" or show an existing project name)
> 2. Click **"NEW PROJECT"** in the popup
> 3. Name it: **edu-video-gen** (or any name you like)
> 4. Click **"CREATE"**
> 5. **Important:** After creating, click the project selector again and make sure your new project is selected (it should show in bold)
>
> **What is your Project ID?** (visible under the project name in the selector — looks like `edu-video-gen` or `edu-video-gen-12345`)

| Option | Description |
|--------|-------------|
| I'll type my project ID | (user types it) |
| I already have a project | I'll use an existing project instead. |

**Step 2.1c** — Use **AskUserQuestion**:

> **Google Cloud Platform Setup (3/4)**
>
> Enable the Vertex AI API. Click this link (it opens directly to the right page):
>
> https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project={PROJECT_ID}
>
> Click the blue **"ENABLE"** button and wait for it to finish.
>
> **Did it enable successfully?**

| Option | Description |
|--------|-------------|
| Yes, enabled | I see "API enabled" or "Manage" button. |
| Error | I'm getting an error message. |

**Step 2.1d** — Use **AskUserQuestion**:

> **Google Cloud Platform Setup (4/6) — IAM Permissions**
>
> You need the right permissions to use Vertex AI. Open:
> https://console.cloud.google.com/iam-admin/iam?project={PROJECT_ID}
>
> 1. Find your email in the members list
> 2. If you see **"Owner"** next to your email — you're good, skip ahead
> 3. If you do NOT see your email, or it doesn't have Owner/Editor:
>    - Click **"GRANT ACCESS"**
>    - Type your email in "New principals"
>    - Add role: **"Vertex AI User"**
>    - Click "+ ADD ANOTHER ROLE", add: **"Service Usage Consumer"**
>    - Click **"SAVE"**
>
> **Do you see your email with Owner or the roles above?**

| Option | Description |
|--------|-------------|
| Yes, I have Owner | My email shows Owner — no changes needed. |
| I added the roles | I granted Vertex AI User and Service Usage Consumer. |
| I need help | I can't find the IAM page or my email isn't listed. |

**Step 2.1e** — Use **AskUserQuestion**:

> **Google Cloud Platform Setup (5/6) — Service Account**
>
> Vertex AI needs a service account in your project. Open:
> https://console.cloud.google.com/iam-admin/serviceaccounts?project={PROJECT_ID}
>
> **Do you see any service accounts listed?** (e.g. "Compute Engine default service account" or anything ending in `@developer.gserviceaccount.com`)

| Option | Description |
|--------|-------------|
| Yes, there's at least one | A service account already exists. |
| No, the list is empty | I need to create one. |

If the list is empty, guide them:

> Create a service account:
> 1. Click **"+ CREATE SERVICE ACCOUNT"**
> 2. Name: `edu-video-gen`
> 3. Click **"CREATE AND CONTINUE"**
> 4. Add role: **"Vertex AI User"**
> 5. Click **"+ ADD ANOTHER ROLE"**, add: **"Storage Object Viewer"**
> 6. Click **"CONTINUE"** → **"DONE"**
>
> You do NOT need to download a key file.

**Step 2.1f** — Use **AskUserQuestion**:

> **Google Cloud Platform Setup (6/6) — OAuth Consent Screen**
>
> Set up the consent screen (needed for Google Drive later):
>
> 1. Go to: https://console.cloud.google.com/apis/credentials/consent?project={PROJECT_ID}
> 2. Choose **"External"** user type → click **Create**
> 3. Fill in:
>    - App name: **EduVidGen**
>    - User support email: your email
>    - Developer contact: your email
> 4. Click **"Save and Continue"** through all remaining steps (no need to add anything else)
>
> **Done?**

| Option | Description |
|--------|-------------|
| Yes, consent screen configured | I completed all steps. |
| I already had one | It was set up from before. |

If they skip GCP at any point, note that they MUST provide a Gemini API key in Step 3 and warn that validation scripts and Vertex-based image generation won't work without GCP.

### 2.2 — ElevenLabs (required)

ElevenLabs powers all voiceover generation. There is no alternative backend for this.

```
=== ElevenLabs Setup ===

1. Go to https://elevenlabs.io/
2. Click "Sign up" and create an account (Google/GitHub sign-in works)
3. Choose a plan — the free tier works for testing (10 min/month)
   - For production use, the Starter plan ($5/mo) is recommended
4. Get your API key:
   - Go to https://elevenlabs.io/app/settings/api-keys
   - Click "Create API Key" or copy the existing one
   - Save it somewhere secure — you'll need it shortly
```

Use **AskUserQuestion**:

> Have you set up your ElevenLabs account and got your API key?

| Option | Description |
|--------|-------------|
| Yes, I have my API key | Ready to proceed. |
| Skip for now | I'll set up ElevenLabs later. |

### 2.3 — Google AI Studio / Gemini API key (optional fallback)

Only guide users through this if:
- They explicitly said they have a Gemini API key, OR
- They skipped Google Cloud in 2.1 (they need this as fallback)

```
=== Google AI Studio (Gemini API Key) — Optional Fallback ===

The Gemini API key is an alternative to Google Cloud for image generation.
It's simpler to set up but less capable (no Imagen 4, no validation support).

If you already set up Google Cloud above, you can skip this — Vertex AI
handles everything the Gemini API key does, and more.

To get a Gemini API key:
1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Select your Google Cloud project (or create one)
5. Copy the key — you'll need it shortly
```

### 2.4 — Together AI (optional)

Only guide users through this if they don't have an account.

```
=== Together AI — Optional ===

Together AI provides the Wan 2.7 video backend, which is ~33% cheaper
than Veo and produces a different visual style. It's completely optional.

To set up:
1. Go to https://api.together.ai/
2. Click "Sign up" and create an account
3. Get your API key:
   - Go to https://api.together.ai/settings/api-keys
   - Copy the key — you'll need it shortly
```

---

## Step 3 — Check & Install Prerequisites

Check each prerequisite. For any missing ones, offer to install them.

```bash
echo "=== Prerequisite Check ==="

# Node.js
if command -v node &>/dev/null; then
  echo "✅ Node.js $(node -v)"
else
  echo "❌ Node.js — not found"
fi

# Python 3
if command -v python3 &>/dev/null; then
  echo "✅ Python $(python3 --version 2>&1)"
else
  echo "❌ Python 3 — not found"
fi

# ffmpeg
if command -v ffmpeg &>/dev/null; then
  echo "✅ ffmpeg $(ffmpeg -version 2>&1 | head -1)"
else
  echo "❌ ffmpeg — not found"
fi

# ImageMagick
if command -v magick &>/dev/null; then
  echo "✅ ImageMagick $(magick -version 2>&1 | head -1)"
else
  echo "❌ ImageMagick 7 — not found"
fi

# gcloud
GCLOUD_PATH=""
if command -v gcloud &>/dev/null; then
  GCLOUD_PATH="gcloud"
  echo "✅ gcloud $(gcloud --version 2>&1 | head -1)"
elif [ -f ~/Downloads/google-cloud-sdk/bin/gcloud ]; then
  GCLOUD_PATH="$HOME/Downloads/google-cloud-sdk/bin/gcloud"
  echo "✅ gcloud (at $GCLOUD_PATH)"
elif [ -f ~/google-cloud-sdk/bin/gcloud ]; then
  GCLOUD_PATH="$HOME/google-cloud-sdk/bin/gcloud"
  echo "✅ gcloud (at $GCLOUD_PATH)"
else
  echo "❌ gcloud CLI — not found"
fi

# Python packages
python3 -c "import google.genai" 2>/dev/null && echo "✅ google-genai" || echo "❌ google-genai"
python3 -c "import moviepy" 2>/dev/null && echo "✅ moviepy" || echo "❌ moviepy"
python3 -c "from PIL import Image" 2>/dev/null && echo "✅ Pillow" || echo "❌ Pillow"
```

If anything is missing, use **AskUserQuestion**:

> The following prerequisites are missing: {list}. Should I install them?

| Option | Description |
|--------|-------------|
| Yes, install all (Recommended) | Install all missing prerequisites automatically. |
| Let me choose | I'll select which ones to install. |
| Skip | I'll install them myself later. |

For installation, use the appropriate commands per platform:

```bash
# macOS installs
brew install ffmpeg imagemagick node python3

# Linux (Debian/Ubuntu) installs
sudo apt-get update && sudo apt-get install -y ffmpeg imagemagick nodejs python3

# Python packages (all platforms)
pip3 install google-genai moviepy Pillow --break-system-packages

# gcloud — cannot be auto-installed, direct user to:
# https://cloud.google.com/sdk/docs/install
```

If gcloud is missing and the user chose the Vertex AI path, emphasize that they need it:

```
⚠️ gcloud CLI is required for Vertex AI authentication.
Install from: https://cloud.google.com/sdk/docs/install

After installing:
  - macOS: Run the installer, then restart your terminal
  - Linux: Extract the archive, run ./install.sh, then restart your terminal

Run /setup again after installing gcloud.
```

---

## Step 4 — Configure Authentication & API Keys

### 4.1 — Auth strategy selection

Use **AskUserQuestion**:

> How would you like to authenticate for image generation and validation?

| Option | Description |
|--------|-------------|
| Vertex AI (Recommended) | Uses Google Cloud Application Default Credentials. Supports all features: Imagen 4, Nano Banana 2, Veo 3.1, all validation scripts. Requires gcloud CLI. |
| Gemini API Key | Simpler setup, just paste a key. Works for basic image generation only. Validation scripts and Imagen 4 require Vertex AI. |
| Both | Set up Vertex AI as primary and Gemini API key as fallback. Maximum compatibility. |

Store this choice as `AUTH_STRATEGY` (vertex / gemini / both).

### 4.2 — Google Cloud configuration (if Vertex AI selected)

If AUTH_STRATEGY is `vertex` or `both`:

**Step 4.2a — Check current gcloud account:**

```bash
{GCLOUD_PATH} auth list 2>/dev/null
{GCLOUD_PATH} config get-value account 2>/dev/null
{GCLOUD_PATH} config get-value project 2>/dev/null
```

**Step 4.2b — Show current state and ask about account:**

If gcloud already has an active account, show it clearly and ask:

Use **AskUserQuestion**:

> You're currently logged into Google Cloud as: **{current_email}** (project: **{current_project}**)
>
> Is this the account you want to use for Edu Video Gen?

| Option | Description |
|--------|-------------|
| Yes, use this account | Keep using {current_email}. |
| No, switch account | I need to log in with a different Google account. |
| I'm not logged in yet | I need to log in for the first time. |

**If user says "switch account" or "not logged in":**

Show this guide (the user can follow it while the setup continues):

```
=== Switching Google Cloud Account ===

Don't worry — this is quick and won't affect your other Google tools.

Step 1: Log out of the current account:
   Run this in your terminal (I'll do it for you):
   gcloud auth revoke {current_email}

Step 2: Log in with your new account:
   A browser window will open — pick the Google account
   that has your Edu Video Gen project.

Step 3: Set up Application Default Credentials:
   Another browser window will open — pick the same account again.
   This is what the video generation scripts use behind the scenes.
```

Then run:
```bash
# Revoke old account if switching
{GCLOUD_PATH} auth revoke {CURRENT_EMAIL} 2>/dev/null || true

# Login — opens browser with account chooser
{GCLOUD_PATH} auth login --brief

# Set up ADC — opens browser again (same account)
{GCLOUD_PATH} auth application-default login
```

After login, confirm the new account:
```bash
{GCLOUD_PATH} auth list 2>/dev/null
```

Show the logged-in email to the user for confirmation.

**Step 4.2c — Collect the project ID:**

Use **AskUserQuestion**:

> What is your Google Cloud project ID?
>
> **How to find it:** Look at the top of https://console.cloud.google.com/ — it's in the project selector dropdown. It looks like `my-project-123` or `edu-video-gen` (NOT the project number which is all digits).

| Option | Description |
|--------|-------------|
| I know my project ID | I'll type it in. |
| Help me find it | Run `gcloud projects list` to show my projects. |

If they need help, run:
```bash
{GCLOUD_PATH} projects list --format="table(projectId, name, projectNumber)"
```

**Step 4.2d — Set project, enable APIs, and verify IAM:**

```bash
# Set the project
{GCLOUD_PATH} config set project {GCLOUD_PROJECT}

# Enable Vertex AI API (in case user didn't do it in Step 2)
{GCLOUD_PATH} services enable aiplatform.googleapis.com

# Verify the current user has Vertex AI access
{GCLOUD_PATH} projects get-iam-policy {GCLOUD_PROJECT} \
  --flatten="bindings[].members" \
  --filter="bindings.members:$(gcloud config get-value account 2>/dev/null)" \
  --format="table(bindings.role)" 2>/dev/null
```

Check the output for `roles/owner`, `roles/editor`, or `roles/aiplatform.user`. If none are present, add the required role:

```bash
ACCOUNT=$({GCLOUD_PATH} config get-value account 2>/dev/null)
{GCLOUD_PATH} projects add-iam-policy-binding {GCLOUD_PROJECT} \
  --member="user:$ACCOUNT" \
  --role="roles/aiplatform.user" \
  --quiet
```

Verify a service account exists (Vertex AI requires one):

```bash
{GCLOUD_PATH} iam service-accounts list --project={GCLOUD_PROJECT} --format="table(email, displayName)" 2>/dev/null
```

If no service accounts are listed, create one:

```bash
{GCLOUD_PATH} iam service-accounts create edu-video-gen \
  --display-name="Edu Video Gen" \
  --project={GCLOUD_PROJECT}

{GCLOUD_PATH} projects add-iam-policy-binding {GCLOUD_PROJECT} \
  --member="serviceAccount:edu-video-gen@{GCLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user" \
  --quiet
```

### 4.3 — Collect API keys

Collect keys interactively. Only ask for keys relevant to the user's setup:

**Always ask — ElevenLabs (required):**

Use **AskUserQuestion**:

> Please paste your ElevenLabs API key:

| Option | Description |
|--------|-------------|
| I have it ready | I'll paste my key. |
| Skip for now | I'll add it later. Voiceover generation won't work without it. |

**If AUTH_STRATEGY is `gemini` or `both` — Gemini API key:**

Use **AskUserQuestion**:

> Please paste your Gemini API key:

| Option | Description |
|--------|-------------|
| I have it ready | I'll paste my key. |
| Skip for now | I'll add it later. |

**Always ask — Together AI (optional):**

Use **AskUserQuestion**:

> Do you have a Together AI API key? (Optional — enables the Wan 2.7 video backend)

| Option | Description |
|--------|-------------|
| Yes, I have it | I'll paste my key. |
| No, skip | I'll only use the Veo video backend. |

### 4.4 — Configure output directory

Use **AskUserQuestion**:

> Where should generated videos be saved?

| Option | Description |
|--------|-------------|
| Default (current directory) | Each video run creates a folder in whatever directory you're in when you run /edu-video. |
| Custom path | I'll specify a fixed directory like ~/Documents/edu-videos/. |

If custom path, ask the user to type it. Validate the path is writable.

### 4.5 — Write .env file

After collecting everything, write the `.env` file:

```bash
cat > "__PLUGIN_DIR__/.env" << 'EOF'
# Edu Video Gen — Configuration
# Generated by /setup on {date}
# Auth strategy: {AUTH_STRATEGY}

# Google Cloud project (required for Vertex AI)
GCLOUD_PROJECT={user_provided_or_empty}

# ElevenLabs (required for voiceover)
ELEVENLABS_API_KEY={user_provided_or_empty}

# Gemini API key (optional fallback for image generation)
GEMINI_API_KEY={user_provided_or_empty}

# Together AI (optional — Wan 2.7 video backend)
TOGETHER_API_KEY={user_provided_or_empty}

# Output directory (leave empty = use current working directory)
OUTPUT_BASE_DIR={user_provided_or_empty}
EOF
```

---

## Step 5 — Google Workspace Setup (Drive, Docs, Sheets)

**IMPORTANT:** The Google Workspace OAuth account must match the Google Cloud account from Step 4.2. If they're different, Drive folders won't be accessible from the same project.

### 5.1 — Check for credentials.json

Run:
```bash
ls "__PLUGIN_DIR__/credentials.json" 2>/dev/null
```

If file exists, skip to 5.2.

If file does not exist, show this step-by-step guide. Use **AskUserQuestion** after EACH major step so the user isn't overwhelmed:

**Step 5.1a** — Use **AskUserQuestion**:

> **Google Workspace Setup (Drive, Docs, Sheets)**
>
> This lets the plugin store all video artifacts in Google Drive and use Google Sheets for tracking.
>
> First, make sure you're in the right Google Cloud project. Open this link:
> https://console.cloud.google.com/apis/library?project={GCLOUD_PROJECT}
>
> **Do you see your project name "{GCLOUD_PROJECT}" at the top of the page?**

| Option | Description |
|--------|-------------|
| Yes, I see it | Great, the right project is selected. |
| No, wrong project | I see a different project name. |
| I'm not sure | Help me check. |

If wrong project: Tell them to click the project selector at the top and switch to the correct project. Provide the direct link: `https://console.cloud.google.com/apis/library?project={GCLOUD_PROJECT}`

**Step 5.1b** — Use **AskUserQuestion**:

> Now enable 3 APIs. Click each link below and press the blue "Enable" button:
>
> 1. **Google Drive API** — https://console.cloud.google.com/apis/library/drive.googleapis.com?project={GCLOUD_PROJECT}
> 2. **Google Docs API** — https://console.cloud.google.com/apis/library/docs.googleapis.com?project={GCLOUD_PROJECT}
> 3. **Google Sheets API** — https://console.cloud.google.com/apis/library/sheets.googleapis.com?project={GCLOUD_PROJECT}
>
> **Have you enabled all 3 APIs?**

| Option | Description |
|--------|-------------|
| Yes, all 3 enabled | I clicked Enable on each one. |
| Having trouble | I'm getting an error or can't find the button. |

**Step 5.1c** — Use **AskUserQuestion**:

> Now create an OAuth credential. This is a one-time download:
>
> 1. Open: https://console.cloud.google.com/apis/credentials?project={GCLOUD_PROJECT}
> 2. Click **"+ CREATE CREDENTIALS"** at the top
> 3. Select **"OAuth client ID"**
> 4. If asked to "Configure consent screen" first:
>    - Click "Configure consent screen"
>    - Choose **"External"** user type → click Create
>    - Fill in: App name = "EduVidGen", User support email = your email, Developer contact = your email
>    - Click "Save and Continue" through all steps (no need to add scopes or test users)
>    - Click "Back to Dashboard"
>    - Then go back to step 2 above
> 5. Application type: **"Desktop app"**
> 6. Name: **"EduVidGen"** (or anything you like)
> 7. Click **"Create"**
> 8. Click **"Download JSON"** on the popup
> 9. Move/rename the downloaded file to: `__PLUGIN_DIR__/credentials.json`
>
> **Have you downloaded and saved credentials.json?**

| Option | Description |
|--------|-------------|
| Yes, saved it | The file is in place. |
| Having trouble | I'm stuck on one of the steps. |

Verify the file exists:
```bash
ls "__PLUGIN_DIR__/credentials.json" 2>/dev/null
```

### 5.2 — Check for token.json and account match

Run:
```bash
ls "__PLUGIN_DIR__/token.json" 2>/dev/null
```

**If token.json exists**, check which account it's for:
```bash
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
cd "__PLUGIN_DIR__" && node scripts/google-auth.mjs 2>&1
```

Parse the output for `CURRENT_ACCOUNT=`. If the account doesn't match the gcloud account from Step 4.2, use **AskUserQuestion**:

> Your Google Workspace is currently connected as **{workspace_email}**, but your Google Cloud project uses **{gcloud_email}**.
>
> For everything to work together, both should use the same account.

| Option | Description |
|--------|-------------|
| Switch to {gcloud_email} | Re-authenticate Google Workspace with the correct account. |
| Keep {workspace_email} | I want to use different accounts (I know what I'm doing). |

If switching, run:
```bash
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
cd "__PLUGIN_DIR__" && node scripts/google-auth.mjs --force
```

**If token.json does NOT exist**, run the auth flow:

Use **AskUserQuestion** first:

> A browser window is about to open for Google sign-in.
>
> **Please sign in with the same Google account you used for Google Cloud: {gcloud_email}**
>
> If you see an "This app isn't verified" warning, that's normal — click "Advanced" then "Go to EduVidGen (unsafe)". This is safe because it's your own project.
>
> Ready?

| Option | Description |
|--------|-------------|
| Yes, open the browser | I'll sign in with {gcloud_email}. |

Then run:
```bash
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
cd "__PLUGIN_DIR__" && node scripts/google-auth.mjs
```

### 5.3 — Verify Google Workspace connection

```bash
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
node -e "
  import { findOrCreateFolder } from '__PLUGIN_DIR__/scripts/gdrive.mjs';
  const folder = await findOrCreateFolder('EduVidGen');
  console.log('Google Drive connected. Root folder: ' + folder.id);
"
```

If successful, display connection confirmation and store root folder ID.

---

## Step 6 — Install Editor Dependencies

```bash
cd "__PLUGIN_DIR__/editor" && npm install 2>&1 | tail -3
```

---

## Step 7 — Verify Setup

Run verification of each component. Adapt checks based on AUTH_STRATEGY.

```bash
echo "=== Verification ==="

# Load env
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a

# Check ElevenLabs
if [ -n "$ELEVENLABS_API_KEY" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "xi-api-key: $ELEVENLABS_API_KEY" "https://api.elevenlabs.io/v1/user")
  [ "$STATUS" = "200" ] && echo "✅ ElevenLabs API key valid" || echo "❌ ElevenLabs API key invalid (HTTP $STATUS)"
else
  echo "⚠️ ElevenLabs API key not set — voiceover generation won't work"
fi

# Check gcloud ADC (primary auth for Vertex AI)
if python3 -c "from google.auth import default; default()" 2>/dev/null; then
  echo "✅ Google Cloud ADC configured"
else
  echo "❌ Google Cloud ADC not configured — run: gcloud auth application-default login"
fi

# Check Vertex AI access (test by listing models)
if [ -n "$GCLOUD_PROJECT" ]; then
  if python3 -c "
from google import genai
client = genai.Client(vertexai=True, project='$GCLOUD_PROJECT', location='us-central1')
models = client.models.list()
print('ok')
" 2>/dev/null | grep -q "ok"; then
    echo "✅ Vertex AI connected (project: $GCLOUD_PROJECT)"
  else
    echo "❌ Vertex AI connection failed — check project ID, ADC, and IAM roles (need Vertex AI User)"
  fi
  # Check service account exists
  SA_COUNT=$(gcloud iam service-accounts list --project="$GCLOUD_PROJECT" --format="value(email)" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$SA_COUNT" -gt "0" ]; then
    echo "✅ Service account exists ($SA_COUNT found)"
  else
    echo "❌ No service account found — Vertex AI may fail. Run /setup to create one"
  fi
  # Check IAM roles
  ACCOUNT=$(gcloud config get-value account 2>/dev/null)
  ROLES=$(gcloud projects get-iam-policy "$GCLOUD_PROJECT" --flatten="bindings[].members" --filter="bindings.members:$ACCOUNT" --format="value(bindings.role)" 2>/dev/null | tr '\n' ', ')
  if echo "$ROLES" | grep -qE "owner|editor|aiplatform.user"; then
    echo "✅ IAM roles OK for $ACCOUNT"
  else
    echo "❌ Missing Vertex AI IAM role for $ACCOUNT — run: gcloud projects add-iam-policy-binding $GCLOUD_PROJECT --member=user:$ACCOUNT --role=roles/aiplatform.user"
  fi
else
  echo "⚠️ GCLOUD_PROJECT not set — Vertex AI features unavailable"
fi

# Check Gemini API key (optional fallback)
if [ -n "$GEMINI_API_KEY" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY")
  [ "$STATUS" = "200" ] && echo "✅ Gemini API key valid (fallback)" || echo "❌ Gemini API key invalid (HTTP $STATUS)"
else
  echo "ℹ️  Gemini API key not set (not needed if Vertex AI is configured)"
fi

# Check Together AI (optional)
if [ -n "$TOGETHER_API_KEY" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOGETHER_API_KEY" "https://api.together.xyz/v1/models")
  [ "$STATUS" = "200" ] && echo "✅ Together AI API key valid" || echo "❌ Together AI API key invalid (HTTP $STATUS)"
else
  echo "ℹ️  Together AI not configured (optional — Wan 2.7 backend unavailable)"
fi

# Check Google Workspace
if [ -f "__PLUGIN_DIR__/credentials.json" ] && [ -f "__PLUGIN_DIR__/token.json" ]; then
  if node -e "import { findOrCreateFolder } from '__PLUGIN_DIR__/scripts/gdrive.mjs'; await findOrCreateFolder('EduVidGen'); console.log('ok');" 2>/dev/null | grep -q "ok"; then
    echo "✅ Google Workspace connected (Drive, Docs, Sheets)"
  else
    echo "❌ Google Workspace auth failed — run /setup to reconfigure"
  fi
elif [ -f "__PLUGIN_DIR__/credentials.json" ]; then
  echo "❌ Google Workspace: credentials.json found but token.json missing — run: node __PLUGIN_DIR__/scripts/google-auth.mjs"
else
  echo "⚠️ Google Workspace not configured — cloud-native features unavailable"
fi

# Check output dir
if [ -n "$OUTPUT_BASE_DIR" ]; then
  mkdir -p "$OUTPUT_BASE_DIR" 2>/dev/null && echo "✅ Output directory: $OUTPUT_BASE_DIR" || echo "❌ Cannot create output directory: $OUTPUT_BASE_DIR"
else
  echo "ℹ️  Output directory: current working directory (default)"
fi
```

---

## Step 8 — Summary

Print final setup status. Adapt messaging based on AUTH_STRATEGY.

**If Vertex AI is configured:**

```
=== Setup Complete ===

Auth strategy:    Vertex AI (primary)
Prerequisites:    ✅ All installed
ElevenLabs:       {status}
Vertex AI:        {status} (project: {project_id})
Gemini API key:   {status — or "ℹ️ Not needed (using Vertex AI)"}
Together AI:      {status}
Google Workspace: {status — ✅ Connected (root folder: FOLDER_ID) or ❌ Not configured}
Output directory: {path or "current directory"}
Editor:           ✅ Dependencies installed

Vertex AI is your primary auth method. The pipeline will use:
  • generate-image-vertex.py for keyframe images (Imagen 4 / Nano Banana 2)
  • Veo 3.1 via Vertex AI for video generation
  • Gemini via Vertex AI for all validation scripts

You're ready to go! Run /edu-video to generate your first video.
```

**If only Gemini API key is configured (no Vertex AI):**

```
=== Setup Complete ===

Auth strategy:    Gemini API key (fallback mode)
Prerequisites:    ✅ All installed
ElevenLabs:       {status}
Gemini API key:   {status}
Together AI:      {status}
Google Workspace: {status — ✅ Connected (root folder: FOLDER_ID) or ❌ Not configured}
Output directory: {path or "current directory"}
Editor:           ✅ Dependencies installed

⚠️ Limited mode: without Vertex AI, the following features are unavailable:
  • Imagen 4 / Imagen 4 Ultra image generation
  • Clip validation, sync validation, and final review
  • Veo video generation via ADC (will use API key instead)

The pipeline will use:
  • generate-image.mjs for keyframe images (Nano Banana 2 via API key)
  • Veo via Gemini API key (if supported) or Wan 2.7 for video generation

To unlock all features, run /setup again and set up Google Cloud.
```
