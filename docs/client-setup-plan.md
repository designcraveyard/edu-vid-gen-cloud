# Client Setup Plan — One-Click Installation

## Goal

Client receives a zip folder, double-clicks one file, does a quick Google login, and the plugin is ready to generate videos. Total client effort: **under 2 minutes**.

---

## What You (Developer) Pre-Package

Before handing the zip to the client, you do all the GCP heavy lifting:

| File | What it does | You create it once |
|------|-------------|-------------------|
| `credentials.json` | OAuth client ID — identifies the app | GCP Console → APIs & Credentials → OAuth Desktop Client |
| `service-account.json` | Vertex AI auth — image/video gen | GCP Console → IAM → Service Accounts → Create Key |
| `.env` | Pre-filled with API keys | ElevenLabs, Gemini, project ID — all filled in |

These three files are **not secrets of the client** — they're your app's credentials. You control them.

### Pre-setup checklist (you do this once per client):
1. Create GCP project (or reuse existing) with billing enabled
2. Enable APIs: Drive, Sheets, Docs, Vertex AI
3. Create OAuth Desktop Client → download `credentials.json`
4. Create Service Account → download JSON → rename to `service-account.json`
5. Share the client's Drive folder with the service account email
6. Fill `.env` with all API keys
7. Zip everything up

---

## What the Zip Contains

```
edu-vid-gen/
├── setup.bat                    # Windows: double-click to install
├── setup.sh                     # Mac: double-click to install
├── credentials.json             # Pre-packaged by you
├── service-account.json         # Pre-packaged by you
├── .env                         # Pre-filled by you
├── scripts/                     # All pipeline scripts
├── skills/                      # All skills
├── editor/                      # Timeline editor
└── README.txt                   # "Double-click setup.bat to get started"
```

---

## The Setup Script (what it does)

### `setup.bat` (Windows) / `setup.sh` (Mac)

```
Step 1: Check if Python 3.10+ is installed → if not, download & install
Step 2: Check if Node.js 18+ is installed → if not, download & install  
Step 3: Check if ffmpeg is installed → if not, download & install
Step 4: pip install moviepy google-genai Pillow requests
Step 5: cd scripts && npm install
Step 6: Run Google OAuth login (opens browser)
        → Client signs into their Google account
        → token.json is saved automatically
Step 7: Ask: "Where do you want videos saved?"
        → Opens folder picker dialog
        → Saves path to .env as OUTPUT_BASE_DIR
Step 8: Open Claude Code desktop app automatically
        → Windows: start claude://
        → Mac: open claude://
        → Client lands directly in the app, ready to generate videos
```

### What the client experiences:
1. Unzip folder
2. Double-click `setup.bat`
3. A terminal window opens, installs dependencies (1-2 min)
4. Browser opens → sign into Google → approve access
5. A folder picker appears → select where to save videos
6. Claude Code desktop app opens automatically — ready to go

---

## Output Folder Strategy

### Problem with current default
The current default saves videos in the plugin directory, which is:
- Hard to find (buried in `.claude/plugins/...`)
- Not intuitive for non-technical users
- Mixed with code files

### Proposed behavior

#### Default output folder
```
Windows: C:\Users\{username}\Videos\EduVidGen\
Mac:     ~/Movies/EduVidGen/
```
- Created automatically during setup
- Easy to find in File Explorer / Finder
- Separate from plugin code

#### Per-project folder structure (inside output dir)
```
EduVidGen/
├── photosynthesis-class5-20260414/
│   ├── brief.md
│   ├── timeline.json
│   ├── keyframes/
│   ├── clips/
│   └── final.mp4
├── fractions-class3-20260415/
│   └── ...
```

#### Changing folder on the fly
Three ways to override the default:

**1. Per-video override (in conversation)**
User says: *"For this video, save it in ~/Desktop/client-review/"*
→ The skill uses that path for this video only, doesn't change the default.

**2. Environment variable**
```
OUTPUT_BASE_DIR=/path/to/custom/folder
```
Set in `.env` or pass as env var. Persists across sessions.

**3. Setup skill re-run**
User runs `/setup` again → option to change output directory.

#### Implementation
The output directory resolution order:
1. **Explicit path in conversation** (highest priority) — "save this video in X"
2. **`OUTPUT_BASE_DIR` in `.env`** — persistent default
3. **Platform default** (`~/Videos/EduVidGen` or `~/Movies/EduVidGen`) — fallback

The skill should print the output path at the start of every video generation:
```
Output folder: /Users/client/Videos/EduVidGen/photosynthesis-class5-20260414/
```

---

## Auth Architecture (Final)

```
┌─────────────────────────────────────────────┐
│              Client's Machine               │
├─────────────────────────────────────────────┤
│                                             │
│  service-account.json ──→ Vertex AI (Veo)   │
│  (pre-packaged)           Image generation  │
│                           Video generation  │
│                                             │
│  credentials.json ──→ OAuth2 ──→ token.json │
│  (pre-packaged)     (one-time    (auto-     │
│                      browser      saved)    │
│                      login)                 │
│                           ↓                 │
│                      Google Drive           │
│                      Google Sheets          │
│                      Google Docs            │
│                                             │
│  .env ──→ ELEVENLABS_API_KEY                │
│  (pre-filled)  GEMINI_API_KEY               │
│                OUTPUT_BASE_DIR              │
│                                             │
└─────────────────────────────────────────────┘
```

### Why two auth methods?
- **Service account** = zero-click for Vertex AI (just a file)
- **OAuth2** = one-click for Drive/Sheets (Google requires user consent for personal Drive access — service accounts on free accounts have zero Drive storage)
- Both are pre-configured by you. Client only does the Google sign-in once.

---

## Windows-Specific Considerations

| Concern | Solution |
|---------|---------|
| No Python pre-installed | setup.bat checks & installs via winget or direct download |
| No Node.js pre-installed | setup.bat checks & installs via winget or direct download |
| No ffmpeg | Download static build, add to PATH |
| Path separators (`\` vs `/`) | Scripts already use `path.resolve()` / `os.path.join()` — cross-platform |
| No `bash` | Use `setup.bat` (batch script) — no WSL needed |
| Long path names | Enable long paths in Windows (setup.bat does this) |

---

## What Needs to Change in the Codebase

### 1. Create `setup.bat` and `setup.sh`
- Dependency installation (Python, Node, ffmpeg)
- `npm install` in scripts/
- `pip install` for Python deps
- Run OAuth flow (`node scripts/google-auth.mjs`)
- Folder picker for output directory
- Write selection to `.env`

### 2. Update the `/setup` skill
- Default OUTPUT_BASE_DIR to platform-appropriate Videos folder
- Add "Change output folder" option
- Remove gcloud CLI requirement (no longer needed)

### 3. Update the `/edu-vid-gen` skill
- Read OUTPUT_BASE_DIR at start
- Support per-video folder override from conversation
- Print output path clearly at start

### 4. Already done
- `getAuth()` in gdrive.mjs — searches plugin root + CWD for credential files
- `.env.example` — documents service account approach
- `.gitignore` — excludes `service-account.json`
- Vertex AI Python scripts — already use `GOOGLE_APPLICATION_CREDENTIALS`

---

## Summary: Client Experience

```
Before (painful):                    After (one-click):
─────────────────                    ──────────────────
Install gcloud CLI                   Unzip folder
Install Python                       Double-click setup.bat
Install Node.js                      Sign into Google (browser)
Install ffmpeg                       Pick output folder
Install imagemagick                  Done ✓
Configure gcloud project
Run gcloud auth login
Run gcloud auth application-default login
Create OAuth credentials
Download credentials.json
Run google-auth.mjs
Configure .env manually
Figure out where videos are saved
```

**From ~30 minutes of technical setup → 2 minutes, mostly waiting for installs.**
