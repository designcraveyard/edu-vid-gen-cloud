# Edu-Vid-Gen Cloud Native Plugin — Design Spec

**Date:** 2026-04-11
**Status:** Draft
**Plugin name:** `edu-vid-gen-cloud` (separate repo from `edu-vid-gen-plugin`)

---

## 1. Overview

A cloud-native variant of the edu-vid-gen plugin where Google Drive is the source of truth for all artifacts. Designed for remote client collaboration — clients review and edit outputs directly in Google Workspace (Drive, Docs, Sheets), and Claude Code reads their changes back to proceed through the pipeline.

**Target:** Pro version — single project at a time, per-user credentials, distributable to multiple team members within an organization.

---

## 2. Architecture Decision

**Approach: Cloud Native (with local cache)**

- Google Drive is the primary storage for all project artifacts
- Scripts generate files locally to a temp/cache directory, then upload to Drive
- Local cache is retained for tools that need local file access (ffmpeg, MoviePy)
- Google Sheets serves as the asset tracker and observability layer
- Google Docs serves as the editable collaboration surface for text artifacts

**Why not Cloud Mirror (local-first with Drive sync)?**
- Multiple team members review outputs — single Drive source of truth is cleaner
- File sizes are manageable (images ~100-500KB, clips ~2-5MB, final MP4 ~30-50MB)
- Avoids "which copy is current?" confusion
- Would require rewriting I/O layer anyway if migrating to cloud-native later

---

## 3. Google Drive Project Structure

```
EduVidGen/
└── {Topic}-{Class}-{YYYY-MM-DD}/
    ├── brief.gdoc                  # Video brief + narration script (Google Doc)
    ├── timeline.gsheet             # Audio timeline (Google Sheet)
    ├── tracker.gsheet              # Asset tracker + observability (Google Sheet, 4 tabs)
    ├── character-sheets/           # Character reference images
    ├── keyframes/                  # Per-clip keyframe images
    ├── audio/
    │   ├── full-vo.mp3
    │   └── slice-01.mp3, slice-02.mp3, ...
    ├── clips/                      # Generated video clips
    ├── scenes/                     # Post-completion additional scene images
    ├── print/                      # Print-ready enhanced images
    └── final/                      # Composite MP4 + subtitle version
```

- One root `EduVidGen/` folder per user, all projects nest under it
- Project folder name: `{Topic}-{Class}-{Date}` for easy identification
- Media files uploaded as regular Drive files
- Text artifacts as native Google Docs/Sheets for in-browser editing

---

## 4. Budget Tiers

Client selects one tier per project at Phase 1 (Inputs). Presented as Low / Medium / High.

| | Low | Medium | High |
|--|-----|--------|------|
| **Video model** | Veo 3.1 Fast (no audio) | Veo 3.1 Fast | Veo 3.1 Full |
| **Image model** | Gemini | Gemini | Gemini |
| **Voice model** | `eleven_flash_v2_5` (0.5 credits/char) | `eleven_v3` (1 credit/char) | `eleven_v3` (1 credit/char) |
| **Transitions** | MoviePy library only | Mix — model decides per transition | Generated transition clips (TC) |
| **Ambient audio** | Bundled loops only | Bundled or generated (model decides) | ElevenLabs generated ambient |
| **Sound effects / VFX** | None | Selective (model decides) | Yes, per clip |
| **Compositing** | `composite.py` (VO master clock) | `composite.py` (VO master clock) | `composite-video-first.py` (video master clock, VO spaced at AC positions) |

**Voice ID selection:** Client chooses the ElevenLabs voice during Phase 1 (Inputs), same as the current plugin. Budget tier determines the voice *model* (Flash v2.5 vs v3), not the voice *identity*.

**Future extension:** A hidden "model override" variable will allow swapping models within each tier without changing the client-facing Low/Medium/High interface.

---

## 5. Google Sheets Schema

### 5.1 `timeline.gsheet` — Audio-First Plan

Client-editable. Claude proceeds to audio generation only when all rows have Status = "Approved".

| Column | Description |
|--------|-------------|
| Project | Project name (future-proofs for batch/enterprise mode) |
| Clip # | Sequential clip number |
| Role | AC (Anchor Clip) or TC (Transition Clip) |
| Duration (s) | Planned duration |
| Narration Text | VO script for this clip |
| Visual Description | What the keyframe/clip should depict |
| Status | Draft / Needs Edit / Approved |
| Notes | Free-text column for client feedback |

### 5.2 `tracker.gsheet` — Multi-Tab Asset Tracker

#### Tab 1: "Review" (Client-facing)

Clean view for review decisions.

| Column | Description |
|--------|-------------|
| Project | Project name |
| Clip # | Clip number |
| Asset Type | Keyframe / Audio / Video Clip / Final MP4 / Character Sheet / Scene / Print |
| Preview Link | Google Drive link to the asset |
| Status | Pending Review / Approved / Rejected / Redo Pending |
| Reviewer Notes | Client writes feedback here |

#### Tab 2: "Generation Log" (Full trace)

Every API call logged as a row.

| Column | Description |
|--------|-------------|
| Project | Project name |
| Clip # | Clip number (or "-" for project-level assets) |
| Asset Type | Keyframe / Video Clip / Voiceover / Ambient / Validation / Character Sheet / Scene / Print |
| Model | Model used (e.g., gemini-2.0-flash, veo-3.1-fast, eleven_v3, eleven_flash_v2_5) |
| API Provider | Vertex AI / ElevenLabs / Gemini / Local |
| Timestamp Start | ISO 8601 timestamp when API call started |
| Timestamp End | ISO 8601 timestamp when API call completed |
| Duration (s) | Wall-clock duration of the API call |
| Input Tokens | Token count sent (where applicable) |
| Output Tokens | Token count received (where applicable) |
| Cost (USD) | Estimated cost in US dollars |
| Cost (INR) | Estimated cost in Indian rupees (USD * exchange rate from Settings) |
| Attempt # | 1 for first try, increments on retry |
| Status | Success / Failed / Retried |
| Error Message | Error details if failed (content filter, rate limit, timeout, etc.) |
| Resolution Summary | What changed on retry (style switch, prompt edit, wait time, parameter change). Blank for first-attempt successes |
| Validation Score | Score from validate-clip.py / validate-final.py (sync, style, text checks) |
| File Size | Output file size (e.g., "482KB", "3.2MB") |
| Dimensions / Aspect Ratio | e.g., "1920x1080 / 16:9" or "1024x1024 / 1:1" |
| Voice ID | ElevenLabs voice ID used (for audio assets) |
| Drive Link | Google Drive link to the output file |

**Settings:** A named cell stores the USD→INR exchange rate (e.g., `Settings!A1 = 84.5`). INR column formula: `=USD_cell * Settings!$A$1`.

#### Tab 3: "Prompts" (Full prompt trace)

| Column | Description |
|--------|-------------|
| Project | Project name |
| Clip # | Clip number |
| Asset Type | Keyframe / Video Clip / Voiceover / Ambient / Validation / Character Sheet |
| Attempt # | Matches attempt # in Generation Log |
| Prompt Type | Image Generation / Veo t2v / Veo i2v / TTS / Validation / Ambient / Character Sheet |
| Prompt Text | The full prompt sent to the API |
| Referenced Prompts | Which other prompts/assets were combined (e.g., "Style prompt + Character sheet ref + Scene description") |
| Response Summary | Brief description of what came back |

#### Tab 4: "Cost Summary" (Aggregated)

| Column | Description |
|--------|-------------|
| Project | Project name |
| Phase | Character Sheets / Keyframes / Audio / Video Clips / Ambient / Validation / Compositing |
| API | Gemini / Vertex AI (Veo) / ElevenLabs / Local |
| Total Calls | Number of API calls |
| Successful | Count of successful calls |
| Failed / Retried | Count of failed/retried calls |
| Total Tokens | Sum of input + output tokens |
| Total Cost (USD) | Sum of costs |
| Total Cost (INR) | Sum of INR costs |
| Total Duration | Sum of API call durations |

Final row: **TOTAL** across all phases.

---

## 6. Review Gates

Pipeline stops at each gate. Client reviews in Google Workspace, then replies in Claude Code chat. Claude reads the updated Google Doc/Sheet and proceeds.

| Gate | After Phase | Client Reviews | Approval Criteria |
|------|------------|---------------|-------------------|
| **G1** | Phase 1 (Inputs) | `brief.gdoc` — topic, class, style, character mode, duration, aspect ratio, ambient, budget tier | Client confirms or edits inputs |
| **G2** | Phase 2 (Brief + Timeline) | `brief.gdoc` — full narration script. `timeline.gsheet` — clip breakdown | Every timeline row Status = "Approved" |
| **G0** | Cost Approval (after G2) | `brief.gdoc` — estimated cost breakdown per phase (USD + INR), estimated time | Client confirms budget or changes tier |
| **G3** | Phase 2.1 (Character Sheets) | Character images in `character-sheets/`. Tracker Review tab | All character sheet rows = "Approved" |
| **G4** | Phase 2.5 (Audio/VO) | `full-vo.mp3` + per-clip slices in `audio/`. Tracker updated with actual durations | All audio rows = "Approved" |
| **G5** | Phase 3 (Keyframes) | Per-clip images in `keyframes/`. Validation scores in Generation Log | All keyframe rows = "Approved" |
| **G6** | Phase 4 (Video Clips) | Generated clips in `clips/`. Validation scores + cost in tracker | All clip rows = "Approved" |
| **G7** | Phase 5 (Composite) | Final MP4 in `final/`. Cost Summary tab shows total project cost | Final row = "Approved" |
| **G8** | Phase 6 (Post-production) | Subtitle version, post-processing. Full Cost Summary | Final sign-off = "Approved" |
| **G9** | Post-completion | Additional scenes, print-ready, redo, text layouts (see Section 9) | Client chooses next action or exits |

### 6.1 Cost Estimation (G0)

Inserted after G2 (once timeline is approved and clip count is known). Claude writes to `brief.gdoc`:

```
## Estimated Cost & Time

Budget tier: [selected tier]
Estimated total cost: $X.XX (₹X.X)
Estimated completion time: ~XX minutes

### Cost Breakdown
| Phase                | Est. Cost (USD) | Est. Cost (INR) |
|----------------------|-----------------|-----------------|
| Character Sheets     | $X.XX           | ₹X.X            |
| Keyframe Images (N)  | $X.XX           | ₹X.X            |
| Voiceover            | $X.XX           | ₹X.X            |
| Video Clips (N)      | $X.XX           | ₹X.X            |
| Ambient Audio        | $X.XX           | ₹X.X            |
| Compositing          | $0.00           | ₹0.0 (local)    |
| Validation           | $X.XX           | ₹X.X            |
| TOTAL                | $X.XX           | ₹X.X            |
```

Client can: approve, change budget tier, or cancel.

### 6.2 Rejection Handling

At any gate:
- Client sets row Status = "Rejected" + writes Reviewer Notes
- Claude reads tracker, identifies rejected rows
- Claude summarizes what was rejected and why
- Re-runs only affected assets
- Updates Generation Log with incremented Attempt #
- Returns to same gate for re-review

### 6.3 Partial Approval

Client can approve some assets and reject others at the same gate. Claude regenerates only rejected assets.

### 6.4 Milestone Restart

At any gate, client can say "redo from Phase X." Claude:
1. Asks what to keep and what to redo
2. Marks affected rows in tracker as "Redo Pending"
3. Preserves all upstream assets that aren't affected
4. Re-runs from the specified phase forward, stopping at each gate (all gates re-activated)
5. Updates Generation Log with new attempts

Examples:
- "Change character, redo from keyframes" → keep brief + timeline + VO, redo Phase 2.1 onward
- "Redo compositing only" → keep all clips, re-run Phase 5
- "Change VO voice but keep timing" → re-run Phase 2.5 with same timeline, new Voice ID
- "Redo clips 3 and 5 only" → regenerate just those, keep everything else

### 6.5 Skip Gate

Client can reply "all approved, continue" to skip detailed review. Claude marks all pending rows as "Approved" and moves on.

---

## 7. Review Workflow Cycle

```
Pipeline Phase completes
    ↓
Upload artifacts to Drive + update all tracker tabs
    ↓
Claude posts summary to chat:
  "Phase X complete. [artifact] uploaded: [Drive link]
   Tracker updated: [Sheet link]
   Please review and update status columns.
   Reply here when you're done."
    ↓
Claude STOPS. Waits for client message.
    ↓
Client reviews in Google Workspace (edits doc, updates sheet, leaves notes)
    ↓
Client replies: "updated" / "approved" / "check my notes" / "redo from Phase X"
    ↓
Claude reads the relevant Google Doc/Sheet via read-review.mjs
    ↓
Claude diffs changes, summarizes:
  "You changed clip 3 narration from X to Y,
   marked clip 5 as Rejected with note: 'too dark'"
    ↓
Claude applies changes locally and re-runs affected phases
```

---

## 8. Scripts

### 8.1 New Scripts

| Script | Purpose |
|--------|---------|
| `google-auth.mjs` | One-time OAuth2 setup. Enables Drive, Docs, Sheets APIs. Saves `token.json` (auto-refreshes) |
| `gdrive.mjs` | Shared library — create folder, upload file, get shareable link, list folder contents, delete file |
| `gsheets.mjs` | Shared library — create sheet (with multiple tabs), read/write rows, read cell range, append row, update cell |
| `gdocs.mjs` | Shared library — create doc, read doc content (with edits), read comments |
| `sync-to-drive.mjs` | Upload a local file to the correct project subfolder, return Drive link |
| `read-review.mjs` | Read a Google Doc/Sheet, return content + edits + comments for Claude to process |

### 8.2 Existing Scripts — Changes

**No script logic changes.** The I/O wraps around them:

```
generate-image.mjs → saves to local cache
    → sync-to-drive.mjs uploads to Drive/keyframes/
    → gsheets.mjs adds row to tracker (Review tab + Generation Log + Prompts)
```

Pattern for every generation script:
1. Generate locally (same as today)
2. Upload to Drive folder via `sync-to-drive.mjs`
3. Update tracker sheet via `gsheets.mjs` (Review, Generation Log, Prompts tabs)
4. Keep local file as cache

The SKILL.md orchestrates this sequence, not individual scripts.

### 8.3 Authentication

Single OAuth2 credential covers Drive + Docs + Sheets APIs:

1. Client uses their existing Google Cloud project (same one used for Veo)
2. Enables 3 APIs: Drive, Docs, Sheets
3. Creates OAuth Client ID (Desktop App type)
4. Downloads `credentials.json` to plugin directory
5. Runs `node scripts/google-auth.mjs` → browser opens → sign in → `token.json` saved
6. Token auto-refreshes — no recurring setup

**No cost.** Google Drive, Docs, and Sheets APIs are free with no per-call charges.

---

## 9. Post-Completion Actions (G9)

After Phase 6 is approved, Claude suggests:

```
Video complete! Here are some things you can do next:

1. Generate additional scenes — Create standalone images using your character(s).
   Choose aspect ratio: 1:1, 9:16, 16:9, or other Gemini-supported ratios.
   Tell me a theme and I'll generate scene concepts to pick from.

2. Print-ready images — Convert keyframes and/or scene images to
   high-res, CMYK, print-ready format for book layouts.
   (Runs enhance-for-print.mjs)

3. Redo from a milestone — Change something in the pipeline:
   - Regenerate characters
   - Redo from after voiceover
   - Change compositing settings
   - Update ambient audio / sound effects
   - Re-do voiceover with different voice

4. Image-wrapped text layouts (Coming soon) — Generate book page layouts
   where text wraps around subjects in your images.
   This feature is not yet available but will be added in a future update.

What would you like to do?
```

### 9.1 Additional Scenes

- Claude generates 5-8 scene ideas based on topic + character
- Client picks which to create
- Client selects aspect ratio (1:1, 9:16, 16:9, or other Gemini-supported)
- Uses existing character sheets for visual consistency
- Images uploaded to `scenes/` folder in Drive
- Tracked in tracker sheet (Review + Generation Log + Prompts tabs)

### 9.2 Print-Ready Images

- Runs `enhance-for-print.mjs` on selected images (keyframes and/or scenes)
- Upscales, converts to CMYK, adjusts contrast
- Uploaded to `print/` folder in Drive
- Tracked in tracker sheet

### 9.3 Image-Wrapped Text Layouts (Future)

Placeholder — not yet implemented. Claude acknowledges the concept, informs client it will be available in a future plugin update. Intended for book publishers who want text wrapping around subjects in images.

---

## 10. Setup Skill (`/setup`)

### Step 1 — Existing checks (unchanged)
- Python 3.x, Node.js, ffmpeg, MoviePy installed
- `ELEVENLABS_API_KEY` configured
- `GEMINI_API_KEY` configured
- gcloud ADC authenticated (for Veo)

### Step 2 — Google Workspace setup (new)
- Check `credentials.json` exists in plugin directory
  - If not: guide client to Google Cloud Console → enable Drive/Docs/Sheets APIs → create OAuth Client ID → download
- Check `token.json` exists
  - If not: run `google-auth.mjs` → browser auth → token saved
- Test connection: create test file in Drive, read back, delete
- Print: "Google Workspace connected."

### Step 3 — Drive folder (new)
- Check if root `EduVidGen/` folder exists in Drive
  - If not: create it
- Print the Drive folder link

**Estimated first-time setup time:** ~10 minutes (most of which is the existing Veo/ElevenLabs setup).

---

## 11. Plugin Structure

New repo: `edu-vid-gen-cloud`

```
edu-vid-gen-cloud/
├── .claude-plugin/plugin.json
├── .env.example                    # Template with all API keys + Google OAuth
├── CLAUDE.md
├── README.md
├── skills/
│   ├── edu-vid-gen/
│   │   ├── SKILL.md                # Updated with Drive workflow, budget tiers, review gates
│   │   └── references/
│   ├── vo-sync/
│   ├── veo-extend/
│   ├── character-regen/
│   ├── extend-image/
│   ├── batch-gen/                  # Future: enterprise batch mode
│   └── setup/                      # Updated /setup with Google Workspace steps
├── scripts/
│   ├── google-auth.mjs             # NEW: OAuth setup
│   ├── gdrive.mjs                  # NEW: Drive operations library
│   ├── gsheets.mjs                 # NEW: Sheets operations library
│   ├── gdocs.mjs                   # NEW: Docs operations library
│   ├── sync-to-drive.mjs           # NEW: Upload + link
│   ├── read-review.mjs             # NEW: Read edits/comments
│   ├── [all existing scripts]      # Unchanged
│   └── backends/
└── editor/
```

---

## 12. Constraints & Assumptions

- **Internet required:** Pipeline depends on Google Drive APIs for all I/O. Retry with exponential backoff (3 attempts) for transient failures.
- **File size limits:** Google Drive API supports uploads up to 5TB. No practical limit for this use case.
- **Single project at a time (Pro):** No multi-project tracking needed. Enterprise batch mode is a future extension — Project column in Sheets future-proofs for this.
- **Exchange rate:** Stored as a named cell in tracker sheet. Client can update manually.
- **OAuth consent screen:** Client's Google Cloud project will show "unverified app" warning on first auth. Client clicks through once. Publishing the OAuth app (to remove warning) is optional and requires Google review (~1 week).
