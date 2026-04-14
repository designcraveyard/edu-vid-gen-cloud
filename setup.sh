#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Edu Video Gen — One-Click Setup (Mac/Linux)
# Double-click this file or run: bash setup.sh
# ═══════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     Edu Video Gen — Setup Wizard         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Check & Install Prerequisites ──

echo "Step 1/7: Checking prerequisites..."
echo ""

MISSING=""

# Node.js
if command -v node &>/dev/null; then
  echo "  ✅ Node.js $(node -v)"
else
  echo "  ❌ Node.js — not found"
  MISSING="$MISSING node"
fi

# Python 3
if command -v python3 &>/dev/null; then
  echo "  ✅ Python $(python3 --version 2>&1 | awk '{print $2}')"
else
  echo "  ❌ Python 3 — not found"
  MISSING="$MISSING python3"
fi

# ffmpeg
if command -v ffmpeg &>/dev/null; then
  echo "  ✅ ffmpeg installed"
else
  echo "  ❌ ffmpeg — not found"
  MISSING="$MISSING ffmpeg"
fi

# ImageMagick
if command -v magick &>/dev/null || command -v convert &>/dev/null; then
  echo "  ✅ ImageMagick installed"
else
  echo "  ❌ ImageMagick — not found"
  MISSING="$MISSING imagemagick"
fi

echo ""

# Install missing prerequisites
if [ -n "$MISSING" ]; then
  echo "  Installing missing packages:$MISSING"
  if command -v brew &>/dev/null; then
    brew install $MISSING 2>&1 | tail -3
  elif command -v apt-get &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y -qq $MISSING 2>&1 | tail -3
  else
    echo "  ⚠️  Cannot auto-install. Please install manually:$MISSING"
    echo "  Then re-run this script."
    exit 1
  fi
  echo "  ✅ Dependencies installed"
fi

# ── Step 2: Install Python packages ──

echo "Step 2/7: Installing Python packages..."
pip3 install google-genai moviepy Pillow requests --break-system-packages -q 2>/dev/null || \
pip3 install google-genai moviepy Pillow requests -q 2>/dev/null || \
echo "  ⚠️  pip install failed — try manually: pip3 install google-genai moviepy Pillow requests"
echo "  ✅ Python packages ready"
echo ""

# ── Step 3: Install Node.js packages ──

echo "Step 3/7: Installing Node.js packages..."
cd "$SCRIPT_DIR/scripts" && npm install --silent 2>&1 | tail -1
cd "$SCRIPT_DIR"
echo "  ✅ Node packages ready"
echo ""

# ── Step 4: Check auth files ──

echo "Step 4/7: Checking authentication files..."

if [ -f "$SCRIPT_DIR/service-account.json" ]; then
  SA_EMAIL=$(python3 -c "import json; print(json.load(open('service-account.json'))['client_email'])" 2>/dev/null || echo "unknown")
  SA_PROJECT=$(python3 -c "import json; print(json.load(open('service-account.json'))['project_id'])" 2>/dev/null || echo "unknown")
  echo "  ✅ Service Account: $SA_EMAIL"
  echo "     Project: $SA_PROJECT"
else
  echo "  ❌ service-account.json not found"
  echo "     Ask your admin for this file and place it in: $SCRIPT_DIR/"
  exit 1
fi

if [ -f "$SCRIPT_DIR/credentials.json" ]; then
  echo "  ✅ OAuth credentials.json found"
else
  echo "  ❌ credentials.json not found"
  echo "     Ask your admin for this file and place it in: $SCRIPT_DIR/"
  exit 1
fi

echo ""

# ── Step 5: Google OAuth login ──

echo "Step 5/7: Google account sign-in..."
if [ -f "$SCRIPT_DIR/token.json" ]; then
  echo "  ✅ Already signed in (token.json exists)"
  echo "     To switch accounts, delete token.json and re-run setup"
else
  echo "  A browser window will open — sign in with your Google account."
  echo "  This gives the app access to Google Drive, Docs, and Sheets."
  echo ""
  read -p "  Press Enter to open the browser..." _
  cd "$SCRIPT_DIR" && node scripts/google-auth.mjs --credentials ./credentials.json --token ./token.json
  echo "  ✅ Google sign-in complete"
fi
echo ""

# ── Step 6: Choose output folder ──

echo "Step 6/7: Choose where to save generated videos..."
echo ""

# Detect platform default
if [ "$(uname)" = "Darwin" ]; then
  DEFAULT_DIR="$HOME/Movies/EduVidGen"
else
  DEFAULT_DIR="$HOME/Videos/EduVidGen"
fi

echo "  Default: $DEFAULT_DIR"
echo ""
read -p "  Press Enter to use default, or type a custom path: " CUSTOM_DIR

if [ -n "$CUSTOM_DIR" ]; then
  OUTPUT_DIR="$CUSTOM_DIR"
else
  OUTPUT_DIR="$DEFAULT_DIR"
fi

mkdir -p "$OUTPUT_DIR" 2>/dev/null
echo "  ✅ Output folder: $OUTPUT_DIR"
echo ""

# ── Step 7: Write .env ──

echo "Step 7/7: Writing configuration..."

# Read existing .env values if they exist
EXISTING_ELEVENLABS=""
EXISTING_GEMINI=""
EXISTING_TOGETHER=""
if [ -f "$SCRIPT_DIR/.env" ]; then
  EXISTING_ELEVENLABS=$(grep "^ELEVENLABS_API_KEY=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2-)
  EXISTING_GEMINI=$(grep "^GEMINI_API_KEY=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2-)
  EXISTING_TOGETHER=$(grep "^TOGETHER_API_KEY=" "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2-)
fi

# Only ask for keys if not already set
if [ -z "$EXISTING_ELEVENLABS" ] || [ "$EXISTING_ELEVENLABS" = "sk_your_key_here" ]; then
  echo ""
  read -p "  ElevenLabs API key (required for voiceover): " ELEVENLABS_KEY
else
  ELEVENLABS_KEY="$EXISTING_ELEVENLABS"
  echo "  ✅ ElevenLabs key already configured"
fi

if [ -z "$EXISTING_GEMINI" ] || [ "$EXISTING_GEMINI" = "your_key_here" ]; then
  read -p "  Gemini API key (optional, press Enter to skip): " GEMINI_KEY
else
  GEMINI_KEY="$EXISTING_GEMINI"
  echo "  ✅ Gemini key already configured"
fi

cat > "$SCRIPT_DIR/.env" << EOF
# Edu Video Gen — Configuration
# Generated by setup.sh on $(date +%Y-%m-%d)

# Google Cloud project
GCLOUD_PROJECT=$SA_PROJECT

# Service Account (Vertex AI — Veo, Imagen)
GOOGLE_APPLICATION_CREDENTIALS=$SCRIPT_DIR/service-account.json
GOOGLE_SERVICE_ACCOUNT_PATH=$SCRIPT_DIR/service-account.json

# OAuth (Google Drive, Docs, Sheets)
GOOGLE_CREDENTIALS_PATH=$SCRIPT_DIR/credentials.json
GOOGLE_TOKEN_PATH=$SCRIPT_DIR/token.json

# ElevenLabs (voiceover)
ELEVENLABS_API_KEY=${ELEVENLABS_KEY:-}

# Gemini API key (optional fallback)
GEMINI_API_KEY=${GEMINI_KEY:-}

# Together AI (optional — Wan 2.7 backend)
TOGETHER_API_KEY=${EXISTING_TOGETHER:-}

# Output directory
OUTPUT_BASE_DIR=$OUTPUT_DIR

# Exchange rate
USD_TO_INR=84.5
EOF

echo "  ✅ Configuration saved to .env"
echo ""

# ── Done ──

echo "╔══════════════════════════════════════════╗"
echo "║          Setup Complete! 🎬              ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Project:  $SA_PROJECT"
echo "║  Output:   $OUTPUT_DIR"
echo "║  Auth:     Service Account + OAuth       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Opening Claude Code..."
echo ""

# Open Claude Code desktop app
if [ "$(uname)" = "Darwin" ]; then
  open "claude://" 2>/dev/null || echo "  Claude Code app not found. Open it manually."
else
  xdg-open "claude://" 2>/dev/null || echo "  Claude Code app not found. Open it manually."
fi
