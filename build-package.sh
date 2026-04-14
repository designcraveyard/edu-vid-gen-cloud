#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Build Client Package — creates a distributable zip for clients
#
# Usage:
#   bash build-package.sh [--client-name "Client Name"] [--drive-folder FOLDER_ID]
#
# Prerequisites (must exist in plugin root):
#   - service-account.json
#   - credentials.json
#   - .env (with API keys filled in)
#
# Output: dist/EduVidGen-{client-name}-{date}.zip
# ═══════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Parse args
CLIENT_NAME="client"
DRIVE_FOLDER=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --client-name) CLIENT_NAME="$2"; shift 2 ;;
    --drive-folder) DRIVE_FOLDER="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SLUG=$(echo "$CLIENT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
DATE=$(date +%Y%m%d)
PACKAGE_NAME="EduVidGen-${SLUG}-${DATE}"
BUILD_DIR="dist/${PACKAGE_NAME}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Building Client Package                ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Client: $CLIENT_NAME"
echo "  Package: $PACKAGE_NAME"
echo ""

# ── Preflight checks ──

echo "Checking required files..."
MISSING=""
[ ! -f "service-account.json" ] && MISSING="$MISSING service-account.json"
[ ! -f "credentials.json" ] && MISSING="$MISSING credentials.json"

if [ -n "$MISSING" ]; then
  echo "  ❌ Missing:$MISSING"
  echo "  These files must exist in the plugin root before building."
  exit 1
fi

echo "  ✅ All required files present"
echo ""

# ── Clean & create build dir ──

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# ── Copy plugin files ──

echo "Copying files..."

# Core files
cp setup.sh setup.bat "$BUILD_DIR/"
cp service-account.json credentials.json "$BUILD_DIR/"
cp CLAUDE.md README.md "$BUILD_DIR/" 2>/dev/null || true

# Scripts (without node_modules)
mkdir -p "$BUILD_DIR/scripts"
rsync -a --exclude='node_modules' --exclude='.cache' scripts/ "$BUILD_DIR/scripts/"

# Skills
cp -r skills "$BUILD_DIR/"

# Editor (without node_modules and .next)
mkdir -p "$BUILD_DIR/editor"
rsync -a --exclude='node_modules' --exclude='.next' editor/ "$BUILD_DIR/editor/"

# Docs
cp -r docs "$BUILD_DIR/" 2>/dev/null || true

# Plugin manifest
cp -r .claude-plugin "$BUILD_DIR/" 2>/dev/null || true

# ── Generate .env ──

SA_PROJECT=$(python3 -c "import json; print(json.load(open('service-account.json'))['project_id'])" 2>/dev/null || echo "your-project-id")

# Read existing keys from .env if available
ELEVENLABS_KEY=""
GEMINI_KEY=""
TOGETHER_KEY=""
if [ -f ".env" ]; then
  ELEVENLABS_KEY=$(grep "^ELEVENLABS_API_KEY=" .env 2>/dev/null | cut -d= -f2- || true)
  GEMINI_KEY=$(grep "^GEMINI_API_KEY=" .env 2>/dev/null | cut -d= -f2- || true)
  TOGETHER_KEY=$(grep "^TOGETHER_API_KEY=" .env 2>/dev/null | cut -d= -f2- || true)
fi

cat > "$BUILD_DIR/.env" << EOF
# Edu Video Gen — Configuration
# Package built for: $CLIENT_NAME ($DATE)

# Google Cloud project
GCLOUD_PROJECT=$SA_PROJECT

# Service Account (Vertex AI — Veo, Imagen)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json

# OAuth (Google Drive, Docs, Sheets)
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json

# ElevenLabs (voiceover)
ELEVENLABS_API_KEY=$ELEVENLABS_KEY

# Gemini API key (optional fallback)
GEMINI_API_KEY=$GEMINI_KEY

# Together AI (optional)
TOGETHER_API_KEY=$TOGETHER_KEY

# Output directory (set during setup — default: ~/Videos/EduVidGen or ~/Movies/EduVidGen)
OUTPUT_BASE_DIR=

# Exchange rate
USD_TO_INR=84.5
EOF

# ── Generate README for client ──

SA_EMAIL=$(python3 -c "import json; print(json.load(open('service-account.json'))['client_email'])" 2>/dev/null || echo "unknown")

cat > "$BUILD_DIR/GETTING-STARTED.txt" << EOF
╔══════════════════════════════════════════════════════════════╗
║                    Edu Video Gen                             ║
║              Getting Started Guide                           ║
╚══════════════════════════════════════════════════════════════╝

Welcome! This package creates educational explainer videos using AI.

SETUP (one-time, ~2 minutes):

  Windows:  Double-click setup.bat
  Mac:      Double-click setup.sh (or run: bash setup.sh)

The setup will:
  1. Install required tools (Python, Node.js, ffmpeg)
  2. Ask you to sign into Google (opens browser)
  3. Let you choose where to save videos
  4. Open Claude Code — you're ready to go!

WHAT YOU NEED:
  - An internet connection
  - A Google account (your admin has already set up access)

GENERATING VIDEOS:
  In Claude Code, type:  /edu-video
  Then follow the prompts to create your video.

SUPPORT:
  Contact your admin if you have any issues.

───────────────────────────────────────────────────
Technical details (for your admin):
  Service Account: $SA_EMAIL
  Project: $SA_PROJECT
  Drive folder shared with the service account
═══════════════════════════════════════════════════
EOF

# ── Exclude sensitive/unnecessary files ──

# Remove any token.json that might have been copied
rm -f "$BUILD_DIR/token.json"

# Remove build script itself
rm -f "$BUILD_DIR/build-package.sh"

# Remove git files
rm -rf "$BUILD_DIR/.git" "$BUILD_DIR/.gitignore"

# Remove .env.example (we have .env)
rm -f "$BUILD_DIR/.env.example"

# ── Create zip ──

echo "Creating zip..."
mkdir -p dist
cd dist
zip -r -q "${PACKAGE_NAME}.zip" "$PACKAGE_NAME"
cd ..

ZIP_SIZE=$(du -sh "dist/${PACKAGE_NAME}.zip" | cut -f1)
FILE_COUNT=$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')

# ── Cleanup build dir ──

rm -rf "$BUILD_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Package Built Successfully!            ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "  File: dist/${PACKAGE_NAME}.zip"
echo "  Size: $ZIP_SIZE"
echo "  Files: $FILE_COUNT"
echo "║                                          ║"
echo "║  Send this zip to: $CLIENT_NAME"
echo "║  They double-click setup.bat/setup.sh    ║"
echo "║  and they're up and running!              ║"
echo "╚══════════════════════════════════════════╝"
echo ""
