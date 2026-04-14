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

# ── Step 4: Launch setup wizard in browser ──

echo "Step 4/4: Opening setup wizard..."
echo ""
echo "  A browser window will open with the setup page."
echo "  Upload your JSON files, paste API keys, and click Save."
echo ""

node "$SCRIPT_DIR/scripts/setup-server.mjs"
