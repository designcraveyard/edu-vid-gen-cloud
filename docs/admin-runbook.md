# Admin Runbook — Onboarding a New Client

Copy-paste checklist. Do this once per client. Takes ~15 minutes.

---

## Step 1 — Clone the repo (one-time)

```bash
git clone https://github.com/designcraveyard/edu-vid-gen-cloud.git
cd edu-vid-gen-cloud
cd scripts && npm install && cd ..
```

If you already have the repo, just pull latest:
```bash
cd edu-vid-gen-cloud && git pull
```

---

## Step 2 — Set up Google Cloud for this client

### 2.1 — Create GCP project

1. Go to https://console.cloud.google.com
2. Sign in with the client's Google account (or yours if you're managing billing)
3. Create new project → name it something like `eduvid-clientname`
4. Enable billing (free $300 credits if new account)

### 2.2 — Enable APIs

Click each link (replace `PROJECT_ID` with the actual project ID):

- https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=PROJECT_ID
- https://console.cloud.google.com/apis/library/drive.googleapis.com?project=PROJECT_ID
- https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=PROJECT_ID
- https://console.cloud.google.com/apis/library/docs.googleapis.com?project=PROJECT_ID

Click **Enable** on each.

### 2.3 — Create Service Account → download JSON

1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts?project=PROJECT_ID
2. Click **+ CREATE SERVICE ACCOUNT**
3. Name: `edu-vid-bot`
4. Click **Create and Continue**
5. Add roles: **Vertex AI User** + **Storage Object Viewer**
6. Click **Done**
7. Click the service account → **Keys** tab → **Add Key** → **Create new key** → **JSON**
8. Save the downloaded file as `service-account.json` in the repo root

### 2.4 — Create OAuth credentials → download JSON

1. Go to https://console.cloud.google.com/apis/credentials?project=PROJECT_ID
2. If no consent screen exists:
   - Click **Configure Consent Screen** → External → Create
   - App name: `EduVidGen`, email fields: your email
   - Save through all steps
3. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
4. Application type: **Desktop app**, Name: `EduVidGen`
5. Click **Create** → **Download JSON**
6. Save as `credentials.json` in the repo root

### 2.5 — Create & share Google Drive folder

1. Go to Google Drive
2. Create a folder for this client (e.g. `EduVidGen - ClientName`)
3. Right-click → Share → paste the service account email:
   `edu-vid-bot@PROJECT_ID.iam.gserviceaccount.com`
   → give **Editor** access
4. Also share with the client's personal Google email as **Editor**

### 2.6 — Set API keys in .env

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `GCLOUD_PROJECT=PROJECT_ID`
- `ELEVENLABS_API_KEY=sk_...` (your shared key or client's own)
- `GEMINI_API_KEY=...` (optional)

---

## Step 3 — Build the package

```bash
# For Mac client → .pkg installer
bash build-installer.sh --client-name "ClientName"

# Or just a zip (works on both platforms)
bash build-package.sh --client-name "ClientName"
```

Output appears in `dist/`:
- `EduVidGen-clientname-YYYYMMDD.pkg` — Mac installer
- `EduVidGen-clientname-YYYYMMDD.iss` — Windows installer script (compile with Inno Setup)
- `EduVidGen-clientname-YYYYMMDD.zip` — Universal zip fallback

---

## Step 4 — Send to client

Send the `.pkg` (Mac) or `.exe` (Windows) or `.zip` to the client with this message:

> **Getting started with Edu Video Gen**
>
> 1. Double-click the installer file I sent you
> 2. Follow the install wizard (Mac: click Continue through steps)
> 3. A browser page will open — sign into your Google account when prompted
> 4. Claude Code will open automatically — type `/generate-video` to create your first video!
>
> That's it. If anything goes wrong, just message me.

---

## Quick reference — what's in the package

| File | Purpose | Pre-filled by you |
|------|---------|-------------------|
| `service-account.json` | Vertex AI auth (Veo, Imagen) | Yes |
| `credentials.json` | OAuth app ID (Drive/Docs/Sheets) | Yes |
| `.env` | API keys, project config | Yes |
| `setup.sh` / `setup.bat` | Installs deps + opens web wizard | Auto |
| `token.json` | Google sign-in token | Generated on client's machine |

---

## Onboarding a second client

Repeat from Step 2. Each client gets their own:
- GCP project (own billing / free credits)
- Service account JSON
- OAuth credentials JSON
- Drive folder

The repo code (Step 1) is the same — just `git pull` for latest.

---

## Troubleshooting

| Client says | Fix |
|-------------|-----|
| "Setup won't start" | Check Node.js is installed: `node -v` |
| "Google sign-in failed" | Delete `token.json`, re-run setup |
| "Drive upload error" | Check the Drive folder is shared with the service account email |
| "Vertex AI error" | Check APIs are enabled + service account has Vertex AI User role |
| "Can't find my videos" | Check OUTPUT_BASE_DIR in .env — default is ~/Videos/EduVidGen or ~/Movies/EduVidGen |
| "Want to change output folder" | Re-run setup, or edit .env, or say "save in [path]" during video gen |
| "Switch Google account" | Delete `token.json`, re-run `bash setup.sh` |
