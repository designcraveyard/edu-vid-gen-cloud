---
name: edu-vid-gen
description: Generate an educational explainer video for a given topic and school class. Cloud-native Google Drive-first pipeline with budget tiers (Low/Medium/High), collaborative review gates at every milestone, full observability via Google Sheets tracker, and Google Docs for editable briefs. Audio-first architecture with VO-driven clip planning, Gemini-powered validation, MoviePy compositor, ambient audio layers, and multi-model video backends (Veo, Wan). Use this skill when the user asks to create an educational video, generate a video for a class/topic, or wants to produce animated explainer content.
---

# Edu Video Generator V2

Follow each phase exactly and in order. Heavy content lives in `references/` — load only when needed.

## Real-Time Tracker Logging

**CRITICAL:** Log to the Google Sheets tracker **immediately** after each operation — do NOT batch logs at the end of a phase. Every API call (image, video, VO, ambient), every review gate decision, every prompt, and every cost incurrence must be logged within the same step that performs the operation.

Use this pattern: after each generation call, immediately append to the relevant tracker tabs (Generation Log, Prompts, Cost Summary) before proceeding to the next generation. The Review tab is updated when assets are uploaded for review. The Cost Summary tab maintains a running total — update it after every billable API call.

## Scripts & Auth Setup

Scripts live at: `__PLUGIN_DIR__/scripts/`

| Script | Purpose | Auth |
|--------|---------|------|
| `generate-audio-timeline.mjs` | Full VO + word timestamps -> `timeline.json` | `ELEVENLABS_API_KEY` |
| `rebuild-timeline.mjs` | Validate + renumber timeline after edits | none |
| `slice-audio.mjs` | Slice `full-vo.mp3` at clip boundaries | ffmpeg |
| `generate-image.mjs` | Keyframe images via Gemini | `GEMINI_API_KEY` |
| `generate-image-vertex.py` | Keyframe images via Vertex AI | gcloud ADC |
| `generate-voiceover.mjs` | Single-segment TTS (legacy/standalone) | `ELEVENLABS_API_KEY` |
| `generate-video.py` | Video clips via Vertex AI Veo 3.1 | gcloud ADC |
| `generate-character-sheet.mjs` | Character pose/expression reference sheets | `GEMINI_API_KEY` |
| `generate-subtitle-video.py` | Karaoke subtitle overlay for review | ffmpeg + Pillow |
| `generate-ambient.mjs` | Generate ambient loop via ElevenLabs Sound Effects API | `ELEVENLABS_API_KEY` |
| `composite.py` | **MoviePy compositor** — transitions + VO overlay + ambient layer | ffmpeg + moviepy |
| `validate-clip.py` | Per-clip Gemini validation (sync, text, style) | `GEMINI_API_KEY` |
| `validate-final.py` | Final video Gemini validation (junctions, ship_ready) | `GEMINI_API_KEY` |
| `checkpoint.py` | Phase gate verification | none |
| `enhance-for-print.mjs` | Upscale, CMYK, contrast for print | ImageMagick 7 |
| `extend-image.mjs` | Extend images for text overlay space | `GEMINI_API_KEY` + ImageMagick |
| `extend-video.py` | Veo video extension chain | gcloud ADC |
| `generate-zoom.mjs` | Ken Burns zoom clip generation | ffmpeg |
| `stitch.mjs` | Legacy ffmpeg concatenation | ffmpeg |

**First-time setup:** Run `/setup` to install prerequisites and configure API keys.

**Loading API keys:** Before running any script that requires an API key, source the plugin's `.env` file:
```bash
# Load keys from plugin .env
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
```

---

## Phase 1 — Collect Inputs

**IMPORTANT:** Use the `AskUserQuestion` tool for EVERY input below. Collect one question at a time with clear defaults and options shown. Do NOT dump all questions in a single text block.

Ask the user:

1. **Topic** — educational concept (e.g. "Water Cycle", "Photosynthesis")
2. **Class** — grade level (e.g. "Class 5", "7th grade")
3. **Narration language** — Hindi / English / Hinglish / Other. Save as `NARRATION_LANG`.
4. **Chapter source** (optional) — URL, PDF, or textbook text. If provided, ALL narration must derive from it.
5. **Visual style** — Pixar, Clay, 2D Flat, Doodle, Watercolour, or Photorealistic
6. **Characters** — Human (`CHARACTER_MODE=human`), Abstract (`abstract`), or None (`none`)
   - Human: **Veo content filter sensitivity depends on style.** See style-safety matrix below.
   - Abstract: image-to-video safe. Generate character sheets in Phase 2.1.
   - None: image-to-video with start+end frames. Skip Phase 2.1.

**Style-Safety Matrix for Human Characters (Veo content filter):**

| Style | Image-to-video safe? | Notes |
|-------|---------------------|-------|
| Clay/Claymation | **YES** — figurine/toy read bypasses filter | Use "clay figurine", "toy diorama", "fingerprint textures" |
| Pixar (toy-like) | **YES** — if bobblehead/plastic/figurine proportions | Use "toy-like", "plastic skin", "figurine proportions", oversized head |
| Pixar (realistic) | **NO** — human-proportioned faces trigger filter | Fall back to text-to-video |
| Watercolour | **NO** — even fully clothed, illustration-style children get blocked | Fall back to text-to-video |
| 2D Flat / Doodle | Usually safe — test first frame before batch | Very stylized = safer |
| Photorealistic | **NO** — always triggers filter for child characters | Text-to-video only |

**Key rules for passing Veo's content filter with human characters:**
- The more artificial/toy-like the character looks, the safer it is
- Always give characters full clothing (shorts + vest/shirt) — never just a loincloth
- Use "figurine", "toy", "plastic", "puppet" language in Veo prompts
- Replace "toddler/baby/child/boy/girl" with "small character", "cartoon figurine"
- If a style fails: don't retry same style — switch to toy-Pixar or clay
7. **Duration** — 30s / 45s / 60s / 90s
   - **30s** — Single-topic clip. One focused concept, 3-4 clips. Best for social media reels, quick explainers, or single-fact videos.
   - **45s** — Single-topic clip. Slightly more depth, 5-6 clips. Good for classroom warm-ups or topic teasers.
   - **60s** — Standard explainer. Full concept with hook, explanation, and summary.
   - **90s** — Deep dive. Multiple sub-topics or detailed step-by-step walkthroughs.
8. **Aspect ratio** — 16:9 or 9:16
9. **Ambient layer** (`--audio-layers`) — Auto-suggest a category based on topic/setting. User can accept, override, or disable (`--no-ambient`).
   - **Bundled loops** (zero cost, instant): `forest`, `rain`, `ocean`, `space`, `underwater`, `workshop`, `lab`, `garden`. Stored in repo `ambient-loops/` dir.
   - **ElevenLabs generation** (`--generate-ambient`): For vibes not covered by bundled loops. Costs ~$0.04 per 30s clip.
   - Save as `AMBIENT_CATEGORY` (or `none`).
10. **Subtitles** — Yes / No (default: Yes)
    - If Yes, generate two final outputs: `final.mp4` (clean) and `final-subtitled.mp4` (karaoke-style subtitles)
    - Also generate `subtitles.srt` as a standalone file
    - Subtitle positioning adapts to aspect ratio: bottom-center for 9:16, lower-third for 16:9
    - Save as `SUBTITLES_ENABLED`
11. **Annotations/Labels** — Yes / No (smart defaults based on topic)
    - **Science** (biology, physics, chemistry): Recommend **Yes** — label body parts, forces, reactions, molecules
    - **Math**: Recommend **Yes** — label equations, steps, geometric shapes
    - **Story/Narrative**: Recommend **No**
    - **Language**: Recommend **No** (subtitles are sufficient)
    - If Yes, annotations are defined per-clip in the brief (Phase 2) and rendered by the compositor
    - Save as `ANNOTATIONS_ENABLED`
12. **Budget tier** — Low / Medium / High
    - **Low**: Minimal cost. Veo Fast (no audio), MoviePy transitions, bundled ambient loops, Flash v2.5 voice model. Best for drafts or budget-conscious projects.
    - **Medium**: Balanced. Model intelligently decides transitions and ambient. Eleven v3 voice. Good default.
    - **High**: Quality-driven. Video-first compositing, generated transition clips, ElevenLabs ambient, sound effects, Eleven v3 voice.
    
    Load tier config:
    ```javascript
    import { getTierConfig } from '__PLUGIN_DIR__/scripts/budget-tiers.mjs';
    const tierConfig = getTierConfig(BUDGET_TIER);
    ```
    
    Use `tierConfig` throughout all subsequent phases to select models, transition strategy, and compositing script.

Save variables: `TOPIC`, `CLASS`, `NARRATION_LANG`, `CHAPTER_SOURCE`, `STYLE`, `CHARACTER_MODE`, `DURATION_SEC`, `ASPECT`, `AMBIENT_CATEGORY`, `SUBTITLES_ENABLED`, `ANNOTATIONS_ENABLED`, `BUDGET_TIER`

Create output folder:
```bash
# Load env for OUTPUT_BASE_DIR (and API keys)
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
BASE_DIR="${OUTPUT_BASE_DIR:-$PWD}"
SLUG=$(echo "{TOPIC}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="${BASE_DIR}/${SLUG}-${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"/{images,clips,clips-transition,audio,prompts,characters}
```

### Phase 1.5 — Initialize Google Drive Project

Run the project initialization script:

```bash
set -a; source "__PLUGIN_DIR__/.env" 2>/dev/null; set +a
node "__PLUGIN_DIR__/scripts/init-project.mjs" \
  --topic "$TOPIC" \
  --class "$CLASS"
```

This creates the full Drive folder structure, brief doc, timeline sheet, and tracker sheet. Save the output manifest — it contains all folder/file IDs needed for subsequent phases.

**Gate G1:** Write the collected inputs to `brief.gdoc` using gdocs.mjs. Share the brief link with the client:

> "Project initialized. Brief uploaded: [Drive link]
>  Please review the inputs and reply when ready to proceed."

**STOP. Wait for client confirmation.**

When client replies, read the brief back:

```bash
node "__PLUGIN_DIR__/scripts/read-review.mjs" --type doc --id $BRIEF_DOC_ID
```

Check for any changes the client made. Apply changes before proceeding to Phase 2.

---

## Phase 2 — Write Video Brief

**If chapter source provided:** Read it first. Use the textbook's exact definitions and terminology.

### Phase 2.0 — Content Length Check (Multi-Part Decision)

If a chapter source was provided (PDF, URL, or text), estimate its narration-worthy content length:
- Count words or estimate from page count (~250 words/page)
- A 90s video covers ~270 words of narration (150 WPM × 1.5 min)
- If content fits in the chosen duration → proceed normally (single video)
- If content exceeds ~270 words → trigger multi-part decision

**If content is too long**, use **AskUserQuestion**:

> The chapter content (~{WORD_COUNT} words) is too long for a single {DURATION_SEC}s video.
>
> How would you like to proceed?

| Option | Description |
|--------|-------------|
| Summarize into one video | I'll condense the key points into a single {DURATION_SEC}s video. Some details will be cut. |
| Split into multiple parts | Create a multi-part series. Each part ~60-90s, covering the full content. Same characters, style, and visual continuity throughout. |

**If user chooses "Split into multiple parts":**

1. Analyze the content and identify natural section boundaries (chapters, headings, topic shifts)
2. Propose part boundaries with estimated duration per part:

```
Suggested multi-part breakdown:

Part 1: "Introduction to the Water Cycle" (~75s, 8 clips)
  - What is the water cycle?
  - Key vocabulary

Part 2: "Evaporation & Condensation" (~90s, 10 clips)
  - How water evaporates
  - Cloud formation

Part 3: "Precipitation & Collection" (~70s, 8 clips)
  - Rain, snow, sleet
  - Water returns to Earth

Total: 3 parts, ~235s combined
```

3. Use **AskUserQuestion** to confirm or let the user adjust boundaries
4. Save as `MULTI_PART = true`, `TOTAL_PARTS = N`, and create `parts-manifest.json`:

```json
{
  "multiPart": true,
  "totalParts": 3,
  "sharedAssets": {
    "characters": "characters/",
    "styleDescriptor": "style-descriptor.txt",
    "voiceId": "ecp3DWciuUyW7BYM7II1",
    "voiceModel": "eleven_v3",
    "style": "Pixar",
    "aspect": "16:9"
  },
  "parts": [
    {
      "part": 1,
      "title": "Introduction to the Water Cycle",
      "durationSec": 75,
      "clipPrefix": "p1",
      "timeline": "audio/timeline-p1.json",
      "voFile": "audio/full-vo-p1.mp3",
      "output": "final-part1.mp4",
      "subtitledOutput": "final-part1-subtitled.mp4",
      "intro": { "type": "hook", "description": "Full hook introducing the series" },
      "outro": { "type": "full", "description": "Summary + 'Next: Evaporation & Condensation'" }
    },
    {
      "part": 2,
      "title": "Evaporation & Condensation",
      "durationSec": 90,
      "clipPrefix": "p2",
      "timeline": "audio/timeline-p2.json",
      "voFile": "audio/full-vo-p2.mp3",
      "output": "final-part2.mp4",
      "subtitledOutput": "final-part2-subtitled.mp4",
      "intro": { "type": "recap", "description": "5s recap: 'In Part 1, we learned...' + title card" },
      "outro": { "type": "full", "description": "Summary + 'Next: Precipitation & Collection'" }
    },
    {
      "part": 3,
      "title": "Precipitation & Collection",
      "durationSec": 70,
      "clipPrefix": "p3",
      "timeline": "audio/timeline-p3.json",
      "voFile": "audio/full-vo-p3.mp3",
      "output": "final-part3.mp4",
      "subtitledOutput": "final-part3-subtitled.mp4",
      "intro": { "type": "recap", "description": "5s recap: 'So far, we learned...' + title card" },
      "outro": { "type": "full", "description": "Series summary wrapping all parts" }
    }
  ]
}
```

Save to `$OUTPUT_DIR/parts-manifest.json`.

**Multi-part file naming convention:**
- Images: `images/frame-p1-01.jpg`, `images/frame-p2-01.jpg` (reset per part)
- Clips: `clips/clip-p1-01.mp4`, `clips/clip-p2-01.mp4` (reset per part)
- Transition clips: `clips-transition/tc-p1-01.mp4`
- Audio slices: `audio/slice-p1-01.mp3`, `audio/slice-p2-01.mp3`
- Timelines: `audio/timeline-p1.json`, `audio/timeline-p2.json`
- Full VO: `audio/full-vo-p1.mp3`, `audio/full-vo-p2.mp3`
- Finals: `final-part1.mp4`, `final-part2.mp4`
- Prompts: `prompts/frame-p1-01_prompt.md`, `prompts/clip-p2-03_prompt.md`

All files stay in the same project folder — no subfolders per part.

**Multi-part intro/outro structure:**

| Part | Intro | Outro |
|------|-------|-------|
| Part 1 | Full hook (same as single video) | Summary of Part 1 + "Next: {Part 2 title}" teaser |
| Parts 2..N-1 | 5s recap: "In Part {N-1}, we learned {key points}..." + title card "Part N: {title}" | Summary of this part + "Next: {Part N+1 title}" teaser |
| Last part | 5s recap of previous parts + title card | Full series summary wrapping all parts together |

The recap clip for parts 2+ is a **narrated segment** (not a visual flashback). It goes in the first clip slot of each part's timeline.

### Multi-Part Pipeline Flow

When `MULTI_PART = true`, the pipeline runs as a **phased hybrid**:

1. **Shared phases (run once):**
   - Phase 2.0: Multi-part decision + parts-manifest.json *(done)*
   - Phase 2: Write ALL part briefs together in one document (one section per part)
   - Phase 2.1: Character sheets (shared across all parts)
   - Review gates G1-G3: Cover the full brief + characters for all parts

2. **Per-part phases (run sequentially for each part):**
   For each part in `parts-manifest.json`:
   - Phase 2.5: Generate audio timeline for THIS part (`--prefix pN`, output `timeline-pN.json`)
   - Phase 3: Generate keyframe images for THIS part (`frame-pN-01.jpg`, etc.)
   - Phase 4: Generate video clips for THIS part (`clip-pN-01.mp4`, etc.)
   - Phase 5: Composite THIS part (`--clip-prefix pN`, output `final-partN.mp4`)
   - Review gates G4-G7 run per-part

3. **Final review (Gate G8):** All parts reviewed together as a series

**Compositor invocation for multi-part:**
```bash
python3 $COMPOSITOR \
  --clips-dir "{OUTPUT_DIR}/clips" \
  --timeline "{OUTPUT_DIR}/audio/timeline-p{N}.json" \
  --vo-audio "{OUTPUT_DIR}/audio/full-vo-p{N}.mp3" \
  --output "{OUTPUT_DIR}/final-part{N}.mp4" \
  --veo-tcs-dir "{OUTPUT_DIR}/clips-transition" \
  --clip-prefix "p{N}" \
  --sfx-volume 0.35 \
  --ambient "{AMBIENT_PATH}" --ambient-volume 0.15
```

**Slice audio invocation for multi-part:**
```bash
node __PLUGIN_DIR__/scripts/slice-audio.mjs \
  --timeline "{OUTPUT_DIR}/audio/timeline-p{N}.json" \
  --audio "{OUTPUT_DIR}/audio/full-vo-p{N}.mp3" \
  --output-dir "{OUTPUT_DIR}/audio" \
  --prefix "p{N}"
```

If `MULTI_PART = false` (single video), skip all of the above and proceed with the normal single-video flow below.

---

**Script guidelines:**
- Each keyframe = 5-8 seconds. Total = `DURATION_SEC / 8` keyframes (round up).
- Each narration segment = ~18-22 words (~150 WPM for 8s).
- Character descriptions must be identical verbatim in every prompt.
- Auto-insert audio tags for `eleven_v3` (see `references/audio-tags.md` for tag reference).

**Structure by duration:**

| Duration | Clips | Structure |
|----------|-------|-----------|
| 30s | 3-4 | Hook (1 clip) → Core explanation (2-3 clips). No summary — end on the key takeaway. |
| 45s | 5-6 | Hook (1) → Core explanation (3-4) → Quick summary (1). Tight, no filler. |
| 60s | 7-8 | Hook (1) → Core explanation (4-5) → Key facts (1) → Summary (1). |
| 90s | 10-12 | Hook (1) → Core explanation (5-7) → Key facts (2) → Summary (1-2). |

For 30s/45s clips: keep narration dense and focused on one single concept. No sub-topics, no tangents. Every second must earn its place.

**For prompt construction details:** Read `references/prompting.md`

**If `ANNOTATIONS_ENABLED`:** For each clip in the brief, include an `annotations` field:
```json
{
  "annotations": [
    { "text": "Carnivore", "position": "top-right", "showAt": 2.0, "hideAt": 6.0, "style": "pill" }
  ]
}
```
- **Styles:** `pill` (rounded background), `arrow` (with pointer line), `label` (plain text with drop shadow)
- **Positions:** `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center-top`, `center-bottom`
- Position adapts to aspect ratio — e.g. for 9:16, prefer `center-top` and `center-bottom` over side positions
- Keep annotations concise (1-4 words), timed to appear when the narrator mentions the concept

Present brief as:
- Keyframe table: #, Timestamp, Scene Description, Narration, Visual Notes, Text, Transition, Sound Cue, Duration, Annotations (if enabled)
- Scene wireframe diagrams (ASCII art showing composition)

Save to `$OUTPUT_DIR/script.md`. Ask for approval before proceeding.

### Phase 2 — Drive Sync & Review (Gate G2)

After the brief is approved locally, sync everything to Google Drive and wait for client review.

**Step 2-G2a — Upload brief to Drive:**
```bash
node __PLUGIN_DIR__/scripts/sync-to-drive.mjs \
  --file "$OUTPUT_DIR/script.md" --subfolder "brief" \
  --manifest "$OUTPUT_DIR/drive-manifest.json"
```

**Step 2-G2b — Update brief.gdoc with narration script:**
```bash
node __PLUGIN_DIR__/scripts/gdocs.mjs update \
  --doc-id "$(jq -r '.briefDocId' $OUTPUT_DIR/drive-manifest.json)" \
  --section "Narration Script" \
  --content-file "$OUTPUT_DIR/script.md"
```

**Step 2-G2c — Populate timeline.gsheet with clip rows:**

For each clip in the brief's keyframe table, append a row to the Timeline tab:
```bash
node __PLUGIN_DIR__/scripts/gsheets.mjs append \
  --sheet-id "$(jq -r '.trackerSheetId' $OUTPUT_DIR/drive-manifest.json)" \
  --tab "Timeline" \
  --row '{
    "Clip #": "{NN}",
    "Timestamp": "{timestamp}",
    "Scene Description": "{scene_desc}",
    "Narration": "{narration_text}",
    "Visual Notes": "{visual_notes}",
    "Text Overlay": "{text}",
    "Transition": "{transition}",
    "Sound Cue": "{sound_cue}",
    "Duration": "{duration}",
    "Status": "Pending Review",
    "Reviewer Notes": ""
  }'
```

**Step 2-G2d — Gate G2: Share and STOP.**

Present to client:
```
📋 REVIEW GATE G2 — Brief & Timeline

Your video brief and timeline are ready for review:
• Brief: [link to brief.gdoc]
• Timeline: [link to timeline.gsheet → Timeline tab]

Please review each timeline row and set Status to "Approved" or "Rejected" (with notes).

⏸️ STOPPING — waiting for your review. Reply here when done.
```

**STOP.** Do not proceed until the client replies.

**Step 2-G2e — Read review and check approval:**
```bash
node __PLUGIN_DIR__/scripts/read-review.mjs \
  --sheet-id "$(jq -r '.trackerSheetId' $OUTPUT_DIR/drive-manifest.json)" \
  --tab "Timeline"
```

Check that ALL rows have Status = "Approved". If any row is "Rejected":
1. Read the Reviewer Notes for each rejected row
2. Summarize what was rejected and why
3. Revise the rejected clips in the brief
4. Re-upload to brief.gdoc and update the timeline.gsheet rows
5. Return to Gate G2 (re-share links and STOP again)

### Phase 2 — Cost Approval (Gate G0)

After timeline is approved (G2 passed), estimate costs and get client sign-off before spending money.

**Step 2-G0a — Estimate cost:**
```bash
node __PLUGIN_DIR__/scripts/budget-tiers.mjs estimate \
  --tier "$BUDGET_TIER" \
  --clip-count "$(jq '.total_clips' $OUTPUT_DIR/audio/timeline.json 2>/dev/null || echo $(grep -c '|' $OUTPUT_DIR/script.md))"
```

**Step 2-G0b — Append cost breakdown to brief.gdoc:**
```bash
node __PLUGIN_DIR__/scripts/gdocs.mjs update \
  --doc-id "$(jq -r '.briefDocId' $OUTPUT_DIR/drive-manifest.json)" \
  --section "Estimated Cost & Time" \
  --content "$(cat <<'COST_EOF'
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
COST_EOF
)"
```

Replace the `$X.XX` placeholders with actual values from the `estimateCost()` output.

**Step 2-G0c — Gate G0: Share and STOP.**

Present to client:
```
💰 COST APPROVAL GATE G0

Estimated cost breakdown has been added to your brief:
• Brief: [link to brief.gdoc → "Estimated Cost & Time" section]

Budget tier: [tier]
Total estimated cost: $X.XX (₹X.X)
Estimated time: ~XX minutes

Options:
1. ✅ Approve — proceed with generation
2. 🔄 Change tier — switch to low/medium/high tier
3. ❌ Cancel — stop the pipeline

⏸️ STOPPING — waiting for cost approval. Reply here with your choice.
```

**STOP.** Do not proceed until the client approves.

If client changes tier, re-run `estimateCost()` with the new tier and re-present. If client cancels, end the pipeline gracefully.

### Phase 2.1 — Character Sheets (if `CHARACTER_MODE != none`)

**Step 1 — Generate a shared style descriptor** before any character prompts. This ensures visual consistency across all characters. The style descriptor is a single sentence that defines the exact aesthetic:

Example: `"Funko Pop figurine, egg-shaped body, 3:2 head-to-body ratio, plastic sheen, round black dot eyes, no mouth, standing on a round base"`

Save as `STYLE_DESCRIPTOR`. This exact string must be prepended to EVERY character sheet prompt and EVERY subsequent image prompt.

**Step 2 — Generate character sheets:**

For each character, prepend `STYLE_DESCRIPTOR` to the description and add: `"Must match the visual style of {other_character_name}"` (if multiple characters).

```bash
GEMINI_API_KEY="$GEMINI_API_KEY" node __PLUGIN_DIR__/scripts/generate-character-sheet.mjs \
  --name "{NAME}" --description "{STYLE_DESCRIPTOR}. {DESC}. Must match the visual style of {OTHER_CHAR}." \
  --style "{STYLE}" --type both \
  --output "{OUTPUT_DIR}/characters/{name}" --aspect "{ASPECT}"
```

Generates: poses sheet, expressions sheet, recreation prompt. Wait 35s between sheets. Review with user. Use pose sheet as `--reference` in all subsequent image prompts.

Save `STYLE_DESCRIPTOR` to `$OUTPUT_DIR/style-descriptor.txt` for use in later phases.

### Phase 2.1 — Drive Sync & Review (Gate G3)

After character sheet images are generated and approved locally, sync to Drive and wait for client review.

**Step 2.1-G3a — Upload character sheets to Drive:**
```bash
for img in "$OUTPUT_DIR"/characters/*.png "$OUTPUT_DIR"/characters/*.jpg; do
  node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
    --file "$img" --subfolder "character-sheets" \
    --project-folder-id "$PROJECT_FOLDER_ID"
done
```

**Step 2.1-G3b — Log to tracker (Review tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Review" \
  --values '["{TIMESTAMP}", "Character Sheet", "{filename}", "Pending Review", "", "{drive_link}"]'
```

**Step 2.1-G3c — Log to tracker (Generation Log tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Generation Log" \
  --values '["{TIMESTAMP}", "Phase 2.1", "Character Sheet", "{filename}", "Generated", "{model}", "{cost}"]'
```

**Step 2.1-G3d — Log to tracker (Prompts tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Prompts" \
  --values '["{TIMESTAMP}", "Character Sheet", "{filename}", "{prompt_text}"]'
```

**Step 2.1-G3e — Gate G3: Share and STOP.**

Present to client:
```
🎨 REVIEW GATE G3 — Character Sheets

Character sheets have been uploaded for review:
• Drive folder: [link to character-sheets subfolder]
• Review tracker: [link to tracker → Review tab]

Please review each character sheet and set Status to "Approved" or "Rejected" (with notes in the tracker).

⏸️ STOPPING — waiting for your review. Reply here when done.
```

**STOP.** Do not proceed until the client replies.

**Step 2.1-G3f — Read review and check approval:**
```bash
node "__PLUGIN_DIR__/scripts/read-review.mjs" \
  --type sheet --id "$TRACKER_SHEET_ID" --tab "Review" \
  --filter-status "Rejected"
```

If any rows are rejected:
1. Read the reviewer notes for each rejected character sheet
2. Summarize what was rejected and why
3. Regenerate only the rejected character sheets with updated prompts
4. Re-upload the regenerated sheets to Drive (same subfolder)
5. Update the Review tab rows with new links and reset status to "Pending Review"
6. Return to Gate G3 (re-share links and STOP again)

**GATE:**
```bash
python3 __PLUGIN_DIR__/scripts/checkpoint.py --phase 2 --output-dir "{OUTPUT_DIR}"
```

---

## Phase 2.5 — Audio Timeline

Generate the entire narration at once with word-level timestamps. The clip count is locked at the end of this phase.

**Step 2.5a** — Choose voice + settings. Default: Anika (`ecp3DWciuUyW7BYM7II1`), `eleven_v3`, stability 0.5, speed 0.98.

**Step 2.5b** — Pronunciation prep (MANDATORY for Hindi/Hinglish):
1. Read `references/audio-tags.md` — load the Devanagari substitution table
2. Scan the full narration for ALL Hindi words with retroflex, aspirated, or nasal sounds
3. Replace romanized Hindi with Devanagari inline (e.g. `kapde` → `कपड़े`). Keep English words in Roman.
4. For English technical terms that ElevenLabs mispronounces, use a pronunciation dictionary:
   - Create one via ElevenLabs dashboard or API (`POST /v1/pronunciation-dictionaries/add-from-rules`)
   - Pass `--dict-id {ID}` to the script
   - **Do NOT use dictionaries for Hindi** — they make pronunciation worse. Devanagari embedding is the fix.
5. Present the processed narration text to the user for approval before generating.

**Step 2.5c** — Generate full VO + timeline:
```bash
# Use voice model from budget tier config
VOICE_MODEL=$(node -e "import {getTierConfig} from '__PLUGIN_DIR__/scripts/budget-tiers.mjs'; console.log(getTierConfig('$BUDGET_TIER').voiceModel)")
ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" node __PLUGIN_DIR__/scripts/generate-audio-timeline.mjs \
  --text "{FULL_NARRATION_WITH_DEVANAGARI}" \
  --output-dir "{OUTPUT_DIR}/audio" \
  --voice "ecp3DWciuUyW7BYM7II1" --model "$VOICE_MODEL" \
  --stability 0.5 --speed 0.98 --language hi \
  --min-clip 5 --max-clip 8
# Optional: --dict-id {ID} --dict-version {VER} for English pronunciation fixes
# Optional: --text-normalization on|off|auto (default: auto)
```

**Step 2.5d** — If `AMBIENT_CATEGORY != none`, add ambient config to `timeline.json`:
```json
{
  "ambient": {
    "category": "{AMBIENT_CATEGORY}",
    "volume": 0.15,
    "source": "bundled",
    "path": "${PWD}/ambient-loops/{AMBIENT_CATEGORY}.mp3"
  }
}
```
If bundled loop doesn't exist for the category, generate one:
```bash
ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" node __PLUGIN_DIR__/scripts/generate-ambient.mjs \
  --prompt "{vibe description}, seamless loop" --duration 30 \
  --output "{OUTPUT_DIR}/audio/ambient-generated.mp3"
```
Then set `"source": "generated"` and `"path"` to the generated file.

**Step 2.5e** — Present timeline as readable table. Ask for edits (merge, split, adjust).

**Step 2.5f** — Validate after edits:
```bash
node __PLUGIN_DIR__/scripts/rebuild-timeline.mjs --timeline "{OUTPUT_DIR}/audio/timeline.json"
```

**Step 2.5g** — Slice audio:
```bash
node __PLUGIN_DIR__/scripts/slice-audio.mjs \
  --timeline "{OUTPUT_DIR}/audio/timeline.json" \
  --audio "{OUTPUT_DIR}/audio/full-vo.mp3" \
  --output-dir "{OUTPUT_DIR}/audio"
```

**Step 2.5h** — Flag VO overflow clips (VO > 8s) for AC+TC split in Phase 4.

### Phase 2.5 — Drive Sync & Review (Gate G4)

After audio/VO is generated and approved locally, sync to Drive and wait for client review.

**Step 2.5-G4a — Upload audio files to Drive:**
```bash
for audio_file in "$OUTPUT_DIR"/audio/full-vo.mp3 "$OUTPUT_DIR"/audio/timeline.json; do
  node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
    --file "$audio_file" --subfolder "audio" \
    --project-folder-id "$PROJECT_FOLDER_ID"
done
```

**Step 2.5-G4b — Log to tracker (Review tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Review" \
  --values '["{TIMESTAMP}", "Audio", "full-vo.mp3", "Pending Review", "", "{drive_link}"]'
```

**Step 2.5-G4c — Log to tracker (Generation Log tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Generation Log" \
  --values '["{TIMESTAMP}", "Phase 2.5", "Audio", "full-vo.mp3", "Generated", "{model}", "{cost}"]'
```

**Step 2.5-G4d — Log to tracker (Prompts tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Prompts" \
  --values '["{TIMESTAMP}", "Audio", "full-vo.mp3", "{narration_text}"]'
```

**Step 2.5-G4e — Gate G4: Share and STOP.**

Present to client:
```
🎙️ REVIEW GATE G4 — Audio / Voiceover

Audio files have been uploaded for review:
• Drive folder: [link to audio subfolder]
• Full VO: [direct link to full-vo.mp3]
• Review tracker: [link to tracker → Review tab]

Please listen to the voiceover and set Status to "Approved" or "Rejected" (with notes in the tracker).

⏸️ STOPPING — waiting for your review. Reply here when done.
```

**STOP.** Do not proceed until the client replies.

**Step 2.5-G4f — Read review and check approval:**
```bash
node "__PLUGIN_DIR__/scripts/read-review.mjs" \
  --type sheet --id "$TRACKER_SHEET_ID" --tab "Review" \
  --filter-status "Rejected"
```

If any rows are rejected:
1. Read the reviewer notes for each rejected audio asset
2. Summarize what was rejected and why
3. Regenerate only the rejected audio with updated settings/text
4. Re-upload the regenerated audio to Drive (same subfolder)
5. Update the Review tab rows with new links and reset status to "Pending Review"
6. Return to Gate G4 (re-share links and STOP again)

**GATE:**
```bash
python3 __PLUGIN_DIR__/scripts/checkpoint.py --phase 2.5 --output-dir "{OUTPUT_DIR}"
```

---

## Phase 2.7 — Strategy Selection

Present both options with recommendation:

**Option A: AC + TC** — Each clip gets its own keyframe. Best for distinct scene changes. Pre-plan transitions from VO gap analysis.

**Option B: Veo Extend Chain** — Chain extensions from first clip. Best for continuous narrative in one environment. Risk: character drift after 3+ extensions.

Save as `VIDEO_STRATEGY = "ac_tc"` or `"extend"`.

If AC+TC: pre-plan transition types per junction (hard cut / crossfade / slow zoom / Veo TC) based on VO gaps from timeline.json.

---

## Phase 3 — Generate Keyframe Images

**If `VIDEO_STRATEGY = "extend"`:** Generate only frame-01, skip rest.

Image count = `timeline.total_clips`. Wait 35s between Gemini calls.

**For prompt templates and rules:** Read `references/prompting.md`

For each clip in timeline.json:
1. **Build image prompt** — character description (verbatim) + scene + style descriptors + TEXT RULES anti-prompt. Remember BEFORE-state for action scenes.
2. **Save prompt** to `prompts/frame-{NN}_prompt.md`
3. **Generate image** — with `--reference` if character sheets exist
4. **Quality gate** — Claude vision review: aspect ratio, character consistency, scene continuity, VO-scene alignment, text contamination. Max 2 retries.
5. **Display and ask** — if user approves + says keep going, skip confirmation on subsequent passing frames.
6. **Compress all** after approval: `sips -Z 1280 frame-{NN}.jpg --out frame-{NN}-small.jpg --setProperty formatOptions 65`

### Phase 3 — Drive Sync & Review (Gate G5)

After keyframe images are generated and approved locally, sync to Drive and wait for client review.

**Step 3-G5a — Upload keyframes to Drive:**
```bash
for img in "$OUTPUT_DIR"/images/frame-*.jpg; do
  node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
    --file "$img" --subfolder "keyframes" \
    --project-folder-id "$PROJECT_FOLDER_ID"
done
```

**Step 3-G5b — Log to tracker (Review tab):**

For each keyframe image:
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Review" \
  --values '["{TIMESTAMP}", "Keyframe", "{filename}", "Pending Review", "", "{drive_link}"]'
```

**Step 3-G5c — Log to tracker (Generation Log tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Generation Log" \
  --values '["{TIMESTAMP}", "Phase 3", "Keyframe", "{filename}", "Generated", "{model}", "{cost}"]'
```

**Step 3-G5d — Log to tracker (Prompts tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Prompts" \
  --values '["{TIMESTAMP}", "Keyframe", "{filename}", "{prompt_text}"]'
```

**Step 3-G5e — Gate G5: Share and STOP.**

Present to client:
```
🖼️ REVIEW GATE G5 — Keyframe Images

All keyframe images have been uploaded for review:
• Drive folder: [link to keyframes subfolder]
• Review tracker: [link to tracker → Review tab]

Please review each keyframe and set Status to "Approved" or "Rejected" (with notes in the tracker).

⏸️ STOPPING — waiting for your review. Reply here when done.
```

**STOP.** Do not proceed until the client replies.

**Step 3-G5f — Read review and check approval:**
```bash
node "__PLUGIN_DIR__/scripts/read-review.mjs" \
  --type sheet --id "$TRACKER_SHEET_ID" --tab "Review" \
  --filter-status "Rejected"
```

If any rows are rejected:
1. Read the reviewer notes for each rejected keyframe
2. Summarize what was rejected and why
3. Regenerate only the rejected keyframes with updated prompts
4. Re-upload the regenerated keyframes to Drive (same subfolder)
5. Update the Review tab rows with new links and reset status to "Pending Review"
6. Return to Gate G5 (re-share links and STOP again)

**GATE:**
```bash
python3 __PLUGIN_DIR__/scripts/checkpoint.py --phase 3 --output-dir "{OUTPUT_DIR}"
```

---

## Phase 4 — Generate Video Clips

**If `VIDEO_STRATEGY = "extend"`:** Use `extend-video.py` chain instead (generate initial 8s clip, then chain +7s extensions).

Model: `veo-3.1-fast-generate-001`. Process clips sequentially.

**For Veo prompt structure and beat maps:** Read `references/prompting.md`

**Audio prompt rewriting when `--audio-layers` is active:** When `AMBIENT_CATEGORY != none`, Veo clips must produce SFX only — no ambient/atmospheric sounds. For each clip's `--audio-prompt`:
1. Extract action-specific SFX from the scene (footsteps, splashes, clicks, door creaks, etc.)
2. Prefix with `[SFX only: {extracted SFX}]`
3. Append: `No background music, no ambient noise, no atmospheric sounds`
4. Strip any ambient/atmosphere descriptors from the original prompt

For each clip:
1. **Build word-synced beat map** from `full-vo-timestamps.json` — rebase to clip-relative time, add +1s anticipation buffer
2. **Build timestamp-structured Veo prompt** using `[MM:SS-MM:SS]` format
3. **Save prompts** to `prompts/clip-{NN}_prompt.md`
4. **Generate clip** — image-to-video (abstract/none) or text-to-video (human)
5. **MANDATORY: Run validate-clip.py after EACH clip** (also enforced by hook):
   ```bash
   python3 __PLUGIN_DIR__/scripts/validate-clip.py \
     --clip "{OUTPUT_DIR}/clips/clip-{NN}.mp4" \
     --clip-num {NN} \
     --timeline "{OUTPUT_DIR}/audio/timeline.json" \
     --output-dir "{OUTPUT_DIR}"
   ```
   If any score < 7: pause, alert operator, wait for decision (accept/regenerate/adjust).
6. **Generate transition clips** after all ACs — extract last frames, generate TCs at correct Veo duration [2,4s]

**For validation details:** Read `references/validation.md`
**For error handling:** Read `references/api-errors.md`

Wait 60-90s between Veo calls.

### Phase 4 — Drive Sync & Review (Gate G6)

After all video clips (AC and TC) are generated and validated, sync to Drive and wait for client review.

**Step 4-G6a — Upload video clips to Drive:**
```bash
for clip in "$OUTPUT_DIR"/clips/clip-*.mp4 "$OUTPUT_DIR"/clips-transition/tc-*.mp4; do
  node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
    --file "$clip" --subfolder "clips" \
    --project-folder-id "$PROJECT_FOLDER_ID"
done
```

**Step 4-G6b — Log to tracker (Review tab):**

For each video clip:
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Review" \
  --values '["{PROJECT}", "{CLIP_NUM}", "Video Clip", "{drive_link}", "Pending Review", ""]'
```

**Step 4-G6c — Log to tracker (Generation Log tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Generation Log" \
  --values '["{TIMESTAMP}", "Phase 4", "Video Clip", "{filename}", "Generated", "{model}", "{cost}", "{duration}", "{resolution}", "{strategy}", "{attempt}", "{validation_score}", "{sync_score}", "{style_score}", "{text_score}", "{motion_score}", "{audio_score}", "{notes}", "{prompt_hash}", "{drive_link}", "{local_path}", "{clip_num}"]'
```

**Step 4-G6d — Log to tracker (Prompts tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Prompts" \
  --values '["{TIMESTAMP}", "Video Clip", "{filename}", "{prompt_text}"]'
```

**Step 4-G6e — Gate G6: Share and STOP.**

Present to client:
```
🎬 REVIEW GATE G6 — Video Clips

All video clips have been uploaded for review:
• Drive folder: [link to clips subfolder]
• Review tracker: [link to tracker → Review tab]

Please review each video clip and set Status to "Approved" or "Rejected" (with notes in the tracker).

⏸️ STOPPING — waiting for your review. Reply here when done.
```

**STOP.** Do not proceed until the client replies.

**Step 4-G6f — Read review and check approval:**
```bash
node "__PLUGIN_DIR__/scripts/read-review.mjs" \
  --type sheet --id "$TRACKER_SHEET_ID" --tab "Review" \
  --filter-status "Rejected"
```

If any rows are rejected:
1. Read the reviewer notes for each rejected video clip
2. Summarize what was rejected and why
3. Regenerate only the rejected clips with updated prompts
4. Re-upload the regenerated clips to Drive (same subfolder)
5. Update the Review tab rows with new links and reset status to "Pending Review"
6. Return to Gate G6 (re-share links and STOP again)

**GATE:**
```bash
python3 __PLUGIN_DIR__/scripts/checkpoint.py --phase 4 --output-dir "{OUTPUT_DIR}"
```

---

## Phase 5 — Composite & Export

Use `composite.py` — NOT manual ffmpeg xfade chains. The compositor reads timeline.json, calculates all gaps and overflow automatically, applies transitions, and overlays the VO.

**Step 5a — Run compositor:**
```bash
# Select compositor based on budget tier
COMPOSITOR="__PLUGIN_DIR__/scripts/$(node -e "import {getTierConfig} from '__PLUGIN_DIR__/scripts/budget-tiers.mjs'; console.log(getTierConfig('$BUDGET_TIER').compositor)")"
python3 $COMPOSITOR \
  --clips-dir "{OUTPUT_DIR}/clips" \
  --timeline "{OUTPUT_DIR}/audio/timeline.json" \
  --vo-audio "{OUTPUT_DIR}/audio/full-vo.mp3" \
  --output "{OUTPUT_DIR}/final.mp4" \
  --veo-tcs-dir "{OUTPUT_DIR}/clips-transition" \
  --sfx-volume 0.35 \
  --ambient "{AMBIENT_PATH}" --ambient-volume 0.15
```
Omit `--ambient` if `AMBIENT_CATEGORY == none`. The ambient path comes from `timeline.json.ambient.path`.

**Audio stack in final video:**
| Layer | Source | Volume |
|-------|--------|--------|
| 1 — VO | ElevenLabs full-vo.mp3 | 100% |
| 2 — SFX | Veo 3.1 native audio per clip | 35% |
| 3 — Ambient | Looped to video length | 15% |

**For transition details:** Read `references/transitions.md`

**Step 5b — Validate final video:**
```bash
python3 __PLUGIN_DIR__/scripts/validate-final.py \
  --video "{OUTPUT_DIR}/final.mp4" \
  --timeline "{OUTPUT_DIR}/audio/timeline.json" \
  --output-dir "{OUTPUT_DIR}"
```

If `ship_ready = yes` and average score >= 8: proceed. Otherwise: present scores, wait for human decision.

**Step 5b2 — Generate subtitles (if `SUBTITLES_ENABLED`):**
```bash
python3 __PLUGIN_DIR__/scripts/generate-subtitle-video.py \
  --video "{OUTPUT_DIR}/final.mp4" \
  --timeline "{OUTPUT_DIR}/audio/timeline.json" \
  --output "{OUTPUT_DIR}/final-subtitled.mp4" \
  --srt-output "{OUTPUT_DIR}/subtitles.srt" \
  --aspect "{ASPECT}" \
  --style karaoke
```

This generates:
- `final-subtitled.mp4` — video with karaoke-style word-by-word highlighting
- `subtitles.srt` — standalone SRT file for external use (YouTube, etc.)

Subtitle positioning: bottom-center for 9:16, lower-third for 16:9. Font size, color, and highlight color are configurable via `--font-size`, `--font-color`, `--highlight-color`.

**Step 5b3 — Render annotations (if `ANNOTATIONS_ENABLED`):**

The compositor handles annotation overlays if `annotations` data is present in `timeline.json`. Each annotation is rendered as a text overlay at the specified position/time with the chosen style (pill, arrow, or label). If the final video was rendered without annotations, re-composite with `--annotations` flag:

```bash
python3 $COMPOSITOR \
  --clips-dir "{OUTPUT_DIR}/clips" \
  --timeline "{OUTPUT_DIR}/audio/timeline.json" \
  --vo-audio "{OUTPUT_DIR}/audio/full-vo.mp3" \
  --output "{OUTPUT_DIR}/final.mp4" \
  --veo-tcs-dir "{OUTPUT_DIR}/clips-transition" \
  --sfx-volume 0.35 \
  --ambient "{AMBIENT_PATH}" --ambient-volume 0.15 \
  --annotations
```

**Step 5c — Generate metadata.json** with all generation settings for reproducibility.

**Step 5d — Launch Timeline Editor (AUTOMATIC):**

**This step is mandatory** — always launch the editor after a successful composite + validation. Do not skip or wait for the user to request it.

The editor lets the operator trim clips, adjust VO timing, add transitions, preview the video, and export to professional NLEs (Premiere Pro, DaVinci Resolve, After Effects).

```bash
node __PLUGIN_DIR__/editor/start.mjs \
  --project "{OUTPUT_DIR}"
```

This starts a local Next.js app at `http://localhost:3333` with a media server at port 3334. The browser opens automatically. The editor provides:
- **Video preview** with per-clip playback and timeline scrubbing
- **Trim & reorder** video clips and VO segments on a visual timeline
- **Transition editor** — apply crossfade, dissolve, wipe, slide, etc. per-clip or globally
- **Save Timeline** — writes `edited-timeline.json` to the project folder
- **Render MP4** — re-renders from the edited timeline using ffmpeg
- **Export Premiere XML** — FCP7 XML format (works in Premiere Pro, DaVinci Resolve, Final Cut Pro) → `{OUTPUT_DIR}/export/project.xml`
- **Export AE Script** — After Effects ExtendScript (.jsx) → `{OUTPUT_DIR}/export/project.jsx`

After the editor launches, also open the project folder:
```bash
open "{OUTPUT_DIR}"
```

Report: output folder, script, characters, prompts, voiceover, frames, clips, final video, metadata, editor URL.

### Phase 5 — Drive Sync & Review (Gate G7)

After the final composite video is rendered and validated, sync to Drive and wait for client review.

**Step 5-G7a — Upload final video to Drive:**
```bash
node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
  --file "$OUTPUT_DIR/final.mp4" --subfolder "final" \
  --project-folder-id "$PROJECT_FOLDER_ID"
```

**Step 5-G7b — Log to tracker (Review tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Review" \
  --values '["{PROJECT}", "", "Final MP4", "{drive_link}", "Pending Review", ""]'
```

**Step 5-G7c — Log to tracker (Generation Log tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Generation Log" \
  --values '["{TIMESTAMP}", "Phase 5", "Final MP4", "final.mp4", "Composited", "MoviePy", "$0.00", "{duration}", "{resolution}", "{strategy}", "1", "{avg_score}", "{sync_score}", "{style_score}", "{text_score}", "{motion_score}", "{audio_score}", "{ship_ready}", "", "{drive_link}", "{local_path}", ""]'
```

**Step 5-G7d — Log to tracker (Prompts tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Prompts" \
  --values '["{TIMESTAMP}", "Final MP4", "final.mp4", "Composite settings: transitions={transition_types}, sfx_vol=0.35, ambient_vol=0.15"]'
```

**Step 5-G7e — Gate G7: Share and STOP.**

Present to client:
```
🎥 REVIEW GATE G7 — Final Composite Video

The final composited video has been uploaded for review:
• Drive folder: [link to final subfolder]
• Direct link: [link to final.mp4]
• Review tracker: [link to tracker → Review tab]

Please watch the full video and set Status to "Approved" or "Rejected" (with notes in the tracker).

⏸️ STOPPING — waiting for your review. Reply here when done.
```

**STOP.** Do not proceed until the client replies.

**Step 5-G7f — Read review and check approval:**
```bash
node "__PLUGIN_DIR__/scripts/read-review.mjs" \
  --type sheet --id "$TRACKER_SHEET_ID" --tab "Review" \
  --filter-status "Rejected"
```

If any rows are rejected:
1. Read the reviewer notes for the rejected composite
2. Summarize what was rejected and why
3. Fix the compositing issues (adjust transitions, volumes, timing)
4. Re-render using composite.py with updated settings
5. Re-upload the new final.mp4 to Drive (same subfolder)
6. Update the Review tab row with new link and reset status to "Pending Review"
7. Return to Gate G7 (re-share links and STOP again)

**GATE:**
```bash
python3 __PLUGIN_DIR__/scripts/checkpoint.py --phase 5 --output-dir "{OUTPUT_DIR}"
```

---

## Phase 6 — Post-Pipeline Options

Optional enhancements after video is complete:

**NLE Export (from Timeline Editor):**

If the operator made edits in the Timeline Editor (Step 5d), they can export directly from the editor UI. If the editor is not running, re-launch it:
```bash
node __PLUGIN_DIR__/editor/start.mjs \
  --project "{OUTPUT_DIR}"
```

| Export | Button | Output | Compatible With |
|--------|--------|--------|-----------------|
| DaVinci XML | "DaVinci XML" | `export/project.xml` | DaVinci Resolve, Final Cut Pro |
| Premiere EDL | "Premiere EDL" | `export/project.edl` | Premiere Pro, DaVinci Resolve |
| After Effects | "AE Script" | `export/project.jsx` | After Effects (File → Scripts → Run Script) |
| Re-render MP4 | "Render MP4" | `final-edited.mp4` | Standalone playback |

The XML export uses FCP7 XML format with individual VO slice files (not in/out ranges on full-vo.mp3) for DaVinci Resolve compatibility. The EDL uses CMX 3600 format — the most universal NLE interchange format. The AE script creates a composition with all clips and VO segments at their correct timeline positions, including opacity keyframes for cross-dissolve transitions.

**Print-ready images:**
```bash
node __PLUGIN_DIR__/scripts/enhance-for-print.mjs \
  --dir "{OUTPUT_DIR}/images" --output-dir "{OUTPUT_DIR}/images/print" --dpi 300 --format tiff
```
For RGB proofs: add `--skip-cmyk --format jpeg`.

**Image extensions for text overlays:**
```bash
GEMINI_API_KEY="$GEMINI_API_KEY" node __PLUGIN_DIR__/scripts/extend-image.mjs \
  --input "{OUTPUT_DIR}/images/frame-{NN}.jpg" \
  --output "{OUTPUT_DIR}/images/frame-{NN}-extended.jpg" \
  --direction "{direction}" --extend-by 30 --style "{style}"
```
Directions: left, right, top, bottom, corners, all. Styles: gradient, flat, blur. Wait 35s between calls.

### Phase 6 — Drive Sync & Review (Gate G8)

After any post-production enhancements are applied (print-ready images, image extensions, NLE exports, re-renders), sync the final deliverables to Drive and wait for client sign-off.

**Step 6-G8a — Upload post-production assets to Drive:**
```bash
# Upload re-rendered final if it exists
if [ -f "$OUTPUT_DIR/final-edited.mp4" ]; then
  node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
    --file "$OUTPUT_DIR/final-edited.mp4" --subfolder "final" \
    --project-folder-id "$PROJECT_FOLDER_ID"
fi

# Upload NLE exports if they exist
for export_file in "$OUTPUT_DIR"/export/project.*; do
  node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
    --file "$export_file" --subfolder "final" \
    --project-folder-id "$PROJECT_FOLDER_ID"
done

# Upload print-ready images if they exist
for print_img in "$OUTPUT_DIR"/images/print/*; do
  node "__PLUGIN_DIR__/scripts/sync-to-drive.mjs" \
    --file "$print_img" --subfolder "final" \
    --project-folder-id "$PROJECT_FOLDER_ID"
done
```

**Step 6-G8b — Log to tracker (Review tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Review" \
  --values '["{PROJECT}", "", "Final MP4", "{drive_link}", "Pending Review", ""]'
```

**Step 6-G8c — Log to tracker (Generation Log tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Generation Log" \
  --values '["{TIMESTAMP}", "Phase 6", "Final MP4", "{filename}", "Post-production", "N/A", "$0.00", "{duration}", "{resolution}", "N/A", "1", "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "{enhancements_applied}", "", "{drive_link}", "{local_path}", ""]'
```

**Step 6-G8d — Log to tracker (Prompts tab):**
```bash
node "__PLUGIN_DIR__/scripts/gsheets.mjs" append \
  --sheet-id "$TRACKER_SHEET_ID" --tab "Prompts" \
  --values '["{TIMESTAMP}", "Final MP4", "{filename}", "Post-production: {enhancements_list}"]'
```

**Step 6-G8e — Gate G8: Share and STOP.**

Present to client:
```
✅ REVIEW GATE G8 — Post-Production Deliverables

Post-production deliverables have been uploaded:
• Drive folder: [link to final subfolder]
• Review tracker: [link to tracker → Review tab]

Assets delivered:
- [list of uploaded assets: re-rendered MP4, NLE exports, print images, etc.]

Please review and set Status to "Approved" or "Rejected" (with notes in the tracker).

⏸️ STOPPING — waiting for your final sign-off. Reply here when done.
```

**STOP.** Do not proceed until the client replies.

**Step 6-G8f — Read review and check approval:**
```bash
node "__PLUGIN_DIR__/scripts/read-review.mjs" \
  --type sheet --id "$TRACKER_SHEET_ID" --tab "Review" \
  --filter-status "Rejected"
```

If any rows are rejected:
1. Read the reviewer notes for each rejected deliverable
2. Summarize what was rejected and why
3. Re-apply post-production with updated settings
4. Re-upload the fixed deliverables to Drive (same subfolder)
5. Update the Review tab rows with new links and reset status to "Pending Review"
6. Return to Gate G8 (re-share links and STOP again)

---

## Milestone Restart

At any review gate (G3-G8), the client can request: **"Redo from Phase X."** This allows restarting the pipeline from a specific phase while preserving approved work from earlier phases.

### How Milestone Restart Works

1. **Client triggers restart** — At any gate, client says something like "redo from Phase 3" or "change the character and redo"
2. **Claude asks what to keep/redo** — Confirm which phases to preserve and which to regenerate:
   - "Which earlier assets should I keep as-is?"
   - "What specifically should change in the redo?"
3. **Mark affected tracker rows** — For all assets from the restart phase onward, update each affected row's Status to "Redo Pending" in the Review tab of the tracker sheet.
4. **Re-run from the specified phase** — Execute all phases from the restart point forward, with all gates (G3-G8) active. Earlier phases' assets remain untouched.

### Restart Examples

**Example 1: Change character design**
- Client says: "I want a different character. Redo from Phase 2.1."
- Keep: Brief (Phase 2), audio/VO (Phase 2.5)
- Redo: Character sheets (2.1) → Keyframes (3) → Video clips (4) → Composite (5) → Post-production (6)
- All gates G3-G8 are active during the redo

**Example 2: Redo compositing only**
- Client says: "The transitions are too fast. Redo compositing."
- Keep: Everything through Phase 4 (characters, audio, keyframes, clips)
- Redo: Composite (5) → Post-production (6)
- Gates G7-G8 are active during the redo

**Example 3: Change VO voice**
- Client says: "Use a different voice. Redo from audio."
- Keep: Brief (Phase 2), character sheets (Phase 2.1)
- Redo: Audio (2.5) → Keyframes (3, if timing changed) → Video clips (4) → Composite (5) → Post-production (6)
- Gates G4-G8 are active during the redo

**Example 4: Redo specific clips only**
- Client says: "Clips 3 and 7 look wrong. Redo just those."
- Keep: Everything except clips 3 and 7
- Redo: Only clips 3 and 7 in Phase 4, then re-composite in Phase 5
- Mark only clip-03 and clip-07 rows as "Redo Pending"
- Gates G6-G8 are active during the redo

### Restart Rules

- Earlier phases are NEVER re-run unless explicitly requested
- All gates from the restart phase onward remain active — no skipping reviews
- The tracker preserves history: old rows stay with "Superseded" status, new rows are appended
- If the restart changes clip count or timing (e.g., new VO), downstream phases must regenerate fully

---

## Error Handling

**For the full error table, face-blocking workarounds, rate limits, and cost reference:** Read `references/api-errors.md`

Quick reference for the most common issues:
- Gemini 429 -> wait 60s, retry
- ElevenLabs 401 -> check `ELEVENLABS_API_KEY`
- Veo 403 -> `gcloud auth application-default login`
- Veo face-blocking (17301594) -> use text-to-video mode (omit `--image`)
- Veo word restriction (58061214) -> replace "girl/boy/child" with "character/animated figure"
- ffmpeg not found -> `brew install ffmpeg`

---

## Phase 7 — Post-Completion Actions (G9)

After the final video is approved, present options:

> Video complete! Here are some things you can do next:
>
> 1. **Generate additional scenes** — Create standalone images using your character(s).
>    Choose aspect ratio: 1:1, 9:16, 16:9, or other Gemini-supported ratios.
>    Tell me a theme and I'll generate scene concepts to pick from.
>
> 2. **Print-ready images** — Convert keyframes and/or scene images to
>    high-res, CMYK, print-ready format for book layouts.
>
> 3. **Redo from a milestone** — Change something in the pipeline:
>    - Regenerate characters
>    - Redo from after voiceover
>    - Change compositing settings
>    - Update ambient audio / sound effects
>    - Re-do voiceover with different voice
>
> 4. **Image-wrapped text layouts** (Coming soon) — Generate book page layouts
>    where text wraps around subjects in your images.
>    This feature is not yet available but will be added in a future update.
>
> What would you like to do?

### Option 1: Additional Scenes

1. Ask the client for a theme or vague idea
2. Generate 5-8 scene ideas based on topic + existing character
3. Present ideas, let client pick which to create
4. Ask for aspect ratio: 1:1, 9:16, 16:9, or other Gemini-supported
5. Generate each scene using generate-image.mjs with --reference pointing to character sheet
6. Upload to scenes/ folder via sync-to-drive.mjs
7. Log in tracker (all tabs)
8. Present for review

### Option 2: Print-Ready Images

1. Ask which images to enhance (keyframes, scenes, or specific ones)
2. Run enhance-for-print.mjs on each selected image
3. Upload to print/ folder via sync-to-drive.mjs
4. Log in tracker

### Option 3: Redo from Milestone

Follow the Milestone Restart instructions.

### Option 4: Image-Wrapped Text Layouts

Inform client: "This feature is coming in a future update. It will generate book page layouts where text wraps around subjects in your images."
