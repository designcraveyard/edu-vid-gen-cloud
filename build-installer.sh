#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Build native installers for Mac (.pkg) and Windows (.exe)
#
# Usage:
#   bash build-installer.sh [--client-name "Client Name"]
#
# Mac (.pkg):  Built using pkgbuild + productbuild (built into macOS)
# Windows (.exe): Generates Inno Setup script (.iss) — compile on Windows
#                 or install innosetup via brew: brew install --cask innosetup
#
# Prerequisites in plugin root: service-account.json, credentials.json
# Output: dist/EduVidGen-{name}.pkg and dist/EduVidGen-{name}-setup.iss
# ═══════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

CLIENT_NAME="client"
while [[ $# -gt 0 ]]; do
  case $1 in
    --client-name) CLIENT_NAME="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SLUG=$(echo "$CLIENT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
DATE=$(date +%Y%m%d)
DIST_DIR="dist"
STAGE_DIR="$DIST_DIR/stage-${SLUG}"
APP_NAME="EduVidGen"
VERSION="1.0.0"

echo ""
echo "Building installers for: $CLIENT_NAME"
echo ""

# ── Preflight ──
[ ! -f "service-account.json" ] && echo "Missing service-account.json" && exit 1
[ ! -f "credentials.json" ] && echo "Missing credentials.json" && exit 1

# ── Stage files ──
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/$APP_NAME"

# Copy everything (same as build-package.sh)
cp setup.sh setup.bat "$STAGE_DIR/$APP_NAME/"
cp service-account.json credentials.json "$STAGE_DIR/$APP_NAME/"
cp CLAUDE.md README.md "$STAGE_DIR/$APP_NAME/" 2>/dev/null || true
mkdir -p "$STAGE_DIR/$APP_NAME/scripts"
rsync -a --exclude='node_modules' --exclude='.cache' scripts/ "$STAGE_DIR/$APP_NAME/scripts/"
cp -r skills "$STAGE_DIR/$APP_NAME/"
mkdir -p "$STAGE_DIR/$APP_NAME/editor"
rsync -a --exclude='node_modules' --exclude='.next' editor/ "$STAGE_DIR/$APP_NAME/editor/"
cp -r docs "$STAGE_DIR/$APP_NAME/" 2>/dev/null || true
cp -r .claude-plugin "$STAGE_DIR/$APP_NAME/" 2>/dev/null || true

# Generate .env
SA_PROJECT=$(python3 -c "import json; print(json.load(open('service-account.json'))['project_id'])" 2>/dev/null || echo "")
ELEVENLABS_KEY=$(grep "^ELEVENLABS_API_KEY=" .env 2>/dev/null | cut -d= -f2- || true)
GEMINI_KEY=$(grep "^GEMINI_API_KEY=" .env 2>/dev/null | cut -d= -f2- || true)

cat > "$STAGE_DIR/$APP_NAME/.env" << EOF
# Edu Video Gen — Configuration
GCLOUD_PROJECT=$SA_PROJECT
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json
ELEVENLABS_API_KEY=$ELEVENLABS_KEY
GEMINI_API_KEY=$GEMINI_KEY
TOGETHER_API_KEY=
OUTPUT_BASE_DIR=
USD_TO_INR=84.5
EOF

# GETTING-STARTED
SA_EMAIL=$(python3 -c "import json; print(json.load(open('service-account.json'))['client_email'])" 2>/dev/null || echo "")
cat > "$STAGE_DIR/$APP_NAME/GETTING-STARTED.txt" << EOF
Edu Video Gen — Getting Started

  Windows:  Double-click setup.bat
  Mac:      Double-click setup.sh (or: bash setup.sh)

The setup installs tools, opens a browser for config, and launches Claude Code.
Type /edu-video in Claude Code to create your first video.
EOF

# Remove things that shouldn't be in installer
rm -f "$STAGE_DIR/$APP_NAME/token.json"
rm -f "$STAGE_DIR/$APP_NAME/build-package.sh"
rm -f "$STAGE_DIR/$APP_NAME/build-installer.sh"
rm -f "$STAGE_DIR/$APP_NAME/.env.example"
rm -rf "$STAGE_DIR/$APP_NAME/.git"

echo "Staged $(find "$STAGE_DIR" -type f | wc -l | tr -d ' ') files"

# ═══════════════════════════════════════
# Mac .dmg installer
# ═══════════════════════════════════════

echo ""
echo "Building Mac .dmg..."

DMG_PATH="$DIST_DIR/${APP_NAME}-${SLUG}-${DATE}.dmg"
DMG_STAGE="$DIST_DIR/dmg-stage-${SLUG}"

rm -rf "$DMG_STAGE"
mkdir -p "$DMG_STAGE"

# Copy the app folder
cp -r "$STAGE_DIR/$APP_NAME" "$DMG_STAGE/$APP_NAME"

# Make setup.sh executable
chmod +x "$DMG_STAGE/$APP_NAME/setup.sh"

# Create a nice .command launcher that clients double-click
cat > "$DMG_STAGE/$APP_NAME/Install EduVidGen.command" << 'LAUNCHER'
#!/bin/bash
# Edu Video Gen — Installer Launcher
# Double-click this file to start setup

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Copy to Applications
APP_DIR="/Applications/EduVidGen"
if [ ! -d "$APP_DIR" ] || [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
  echo "Installing to /Applications/EduVidGen..."
  mkdir -p "$APP_DIR"
  rsync -a --delete "$SCRIPT_DIR/" "$APP_DIR/"
  chmod +x "$APP_DIR/setup.sh"
  chmod +x "$APP_DIR/Install EduVidGen.command"
  echo "Installed!"
  echo ""
  # Run setup from the installed location
  exec bash "$APP_DIR/setup.sh"
else
  exec bash "$SCRIPT_DIR/setup.sh"
fi
LAUNCHER
chmod +x "$DMG_STAGE/$APP_NAME/Install EduVidGen.command"

# Post-install launcher: opens Claude Code with plugin loaded (interactive mode)
cat > "$DMG_STAGE/$APP_NAME/Open EduVidGen.command" << 'LAUNCHER'
#!/bin/bash
APP_DIR="/Applications/EduVidGen"
if [ ! -d "$APP_DIR" ]; then
  APP_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
cd "$APP_DIR"
exec claude --plugin-dir .
LAUNCHER
chmod +x "$DMG_STAGE/$APP_NAME/Open EduVidGen.command"

# Post-install launcher: auto-mode (unattended, bypass permissions)
cat > "$DMG_STAGE/$APP_NAME/Open EduVidGen (Auto Mode).command" << 'LAUNCHER'
#!/bin/bash
# Unattended auto-mode. Answer YES when asked "Auto Mode" in the brief.
APP_DIR="/Applications/EduVidGen"
if [ ! -d "$APP_DIR" ]; then
  APP_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
cd "$APP_DIR"
exec claude --plugin-dir . --dangerously-skip-permissions
LAUNCHER
chmod +x "$DMG_STAGE/$APP_NAME/Open EduVidGen (Auto Mode).command"

# Create the DMG (two-step: create temp read-write, then convert to compressed)
TEMP_DMG="$DIST_DIR/tmp-${SLUG}.dmg"
rm -f "$TEMP_DMG" "$DMG_PATH"

# Calculate size needed (source folder size + 10MB padding)
DMG_SIZE_KB=$(du -sk "$DMG_STAGE" | cut -f1)
DMG_SIZE_MB=$(( (DMG_SIZE_KB / 1024) + 10 ))

hdiutil create -size "${DMG_SIZE_MB}m" -fs HFS+ -volname "$APP_NAME" "$TEMP_DMG" -quiet
# Detach any stale mounts with same volume name
hdiutil detach "/Volumes/$APP_NAME" 2>/dev/null || true

MOUNT_DIR=$(hdiutil attach "$TEMP_DMG" -nobrowse 2>/dev/null | grep "Apple_HFS" | sed 's/.*Apple_HFS[[:space:]]*//')
echo "  Mounted at: $MOUNT_DIR"
# Copy app folder first, then create symlink inside mounted volume
cp -R "$DMG_STAGE/$APP_NAME" "${MOUNT_DIR}/"
ln -s /Applications "${MOUNT_DIR}/Applications"
sync
hdiutil detach "${MOUNT_DIR}" -force -quiet 2>/dev/null || true
hdiutil convert "$TEMP_DMG" -format UDZO -o "$DMG_PATH" -quiet 2>/dev/null
rm -f "$TEMP_DMG"
rm -rf "$DMG_STAGE"
DMG_SIZE=$(du -sh "$DMG_PATH" | cut -f1)
echo "  Mac installer: $DMG_PATH ($DMG_SIZE)"

# ═══════════════════════════════════════
# Windows .exe (self-extracting archive)
# ═══════════════════════════════════════

echo ""
echo "Building Windows .exe installer..."

EXE_PATH="$DIST_DIR/${APP_NAME}-${SLUG}-${DATE}-setup.exe"

# Copy install.bat from repo (standalone file with proper CRLF endings)
cp "$SCRIPT_DIR/install.bat" "$STAGE_DIR/install.bat"

# Ensure all .bat files in stage have CRLF line endings
find "$STAGE_DIR" -name "*.bat" -exec perl -pi -e 's/(?<!\r)\n/\r\n/g' {} \;

# Create 7z archive of the staged content + installer script
ARCHIVE_PATH="$DIST_DIR/tmp-archive-${SLUG}.7z"
rm -f "$ARCHIVE_PATH"

cd "$STAGE_DIR"
7z a -t7z -mx=9 "$SCRIPT_DIR/$ARCHIVE_PATH" . -bso0 -bsp0
cd "$SCRIPT_DIR"

# Create the SFX config file
SFX_CONFIG="$DIST_DIR/sfx-config-${SLUG}.txt"
cat > "$SFX_CONFIG" << SFXCFG
;!@Install@!UTF-8!
Title="Edu Video Gen - Installer"
BeginPrompt="Install Edu Video Gen - AI Video Pipeline?"
RunProgram="install.bat"
;!@InstallEnd@!
SFXCFG

# Download 7-Zip SFX installer module if not cached
# 7zSD.sfx = installer module that extracts to temp, runs a program, cleans up
SFX_MODULE="$DIST_DIR/7zSD.sfx"
if [ ! -f "$SFX_MODULE" ]; then
  echo "  Downloading 7-Zip SFX installer module..."
  SFX_TEMP="$DIST_DIR/7z-sfx-temp"
  mkdir -p "$SFX_TEMP"
  curl -sL "https://www.7-zip.org/a/lzma2301.7z" -o "$SFX_TEMP/lzma.7z"
  cd "$SFX_TEMP"
  7z x lzma.7z bin/7zSD.sfx -bso0 -bsp0 2>/dev/null || true
  cd "$SCRIPT_DIR"
  if [ -f "$SFX_TEMP/bin/7zSD.sfx" ]; then
    cp "$SFX_TEMP/bin/7zSD.sfx" "$SFX_MODULE"
  fi
  rm -rf "$SFX_TEMP"
fi

if [ -f "$SFX_MODULE" ]; then
  # Combine: SFX module + config + archive = .exe
  cat "$SFX_MODULE" "$SFX_CONFIG" "$ARCHIVE_PATH" > "$EXE_PATH"
  rm -f "$ARCHIVE_PATH" "$SFX_CONFIG"
  EXE_SIZE=$(du -sh "$EXE_PATH" | cut -f1)
  echo "  Windows installer: $EXE_PATH ($EXE_SIZE)"
else
  echo "  [!!] Could not download SFX module."
  echo "  Falling back to zip-only distribution."
  rm -f "$ARCHIVE_PATH" "$SFX_CONFIG"
fi

# ── Also build zip as fallback ──

echo ""
echo "Building zip fallback..."
cd "$DIST_DIR"
ZIP_NAME="${APP_NAME}-${SLUG}-${DATE}.zip"
zip -r -q "$ZIP_NAME" "stage-${SLUG}/$APP_NAME"
cd "$SCRIPT_DIR"
echo "  Zip: $DIST_DIR/$ZIP_NAME"

# ── Cleanup staging ──
rm -rf "$STAGE_DIR"

echo ""
echo "Done! Deliverables in $DIST_DIR/:"
echo "  Mac:     ${APP_NAME}-${SLUG}-${DATE}.dmg"
[ -f "$EXE_PATH" ] && echo "  Windows: ${APP_NAME}-${SLUG}-${DATE}-setup.exe"
echo "  Zip:     ${APP_NAME}-${SLUG}-${DATE}.zip (fallback)"
echo ""
