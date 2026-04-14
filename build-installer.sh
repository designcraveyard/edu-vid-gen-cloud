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
# Mac .pkg installer
# ═══════════════════════════════════════

echo ""
echo "Building Mac .pkg..."

INSTALL_LOCATION="/Applications/$APP_NAME"
PKG_ID="com.eduvid.$SLUG"
PKG_PATH="$DIST_DIR/${APP_NAME}-${SLUG}-${DATE}.pkg"
COMPONENT_PKG="$DIST_DIR/component-${SLUG}.pkg"

# Create post-install script
mkdir -p "$STAGE_DIR/scripts-pkg"
cat > "$STAGE_DIR/scripts-pkg/postinstall" << 'POSTINSTALL'
#!/bin/bash
INSTALL_DIR="/Applications/EduVidGen"

# Make setup.sh executable
chmod +x "$INSTALL_DIR/setup.sh"

# Create desktop shortcut (symlink)
ln -sf "$INSTALL_DIR/setup.sh" "$HOME/Desktop/EduVidGen Setup.command"
chmod +x "$HOME/Desktop/EduVidGen Setup.command"

# Open the setup wizard automatically after install
open -a Terminal "$INSTALL_DIR/setup.sh" &

exit 0
POSTINSTALL
chmod +x "$STAGE_DIR/scripts-pkg/postinstall"

# Build component package
pkgbuild \
  --root "$STAGE_DIR/$APP_NAME" \
  --identifier "$PKG_ID" \
  --version "$VERSION" \
  --install-location "$INSTALL_LOCATION" \
  --scripts "$STAGE_DIR/scripts-pkg" \
  "$COMPONENT_PKG" 2>&1 | tail -1

# Create distribution XML for productbuild
cat > "$STAGE_DIR/distribution.xml" << DISTXML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>Edu Video Gen</title>
    <welcome file="welcome.html" mime-type="text/html"/>
    <background file="background.png" alignment="bottomleft" scaling="none"/>
    <options customize="never" require-scripts="false" hostArchitectures="x86_64,arm64"/>
    <choices-outline>
        <line choice="default">
            <line choice="$PKG_ID"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="$PKG_ID" visible="false">
        <pkg-ref id="$PKG_ID"/>
    </choice>
    <pkg-ref id="$PKG_ID" version="$VERSION" onConclusion="none">${APP_NAME}-component.pkg</pkg-ref>
</installer-gui-script>
DISTXML

# Create welcome HTML
mkdir -p "$STAGE_DIR/resources"
cat > "$STAGE_DIR/resources/welcome.html" << 'WELCOME'
<html>
<body style="font-family: -apple-system, Helvetica, sans-serif; padding: 20px; color: #333;">
<h2 style="font-weight: 600; margin-bottom: 8px;">Edu Video Gen</h2>
<p style="color: #666; line-height: 1.6;">
This will install the AI video generation pipeline on your Mac.
</p>
<p style="color: #666; line-height: 1.6;">
After installation, a setup wizard will open automatically in your browser to complete the configuration.
</p>
<p style="margin-top: 20px; font-size: 13px; color: #999;">
Installs to: /Applications/EduVidGen
</p>
</body>
</html>
WELCOME

# Build product (final .pkg with welcome screen)
productbuild \
  --distribution "$STAGE_DIR/distribution.xml" \
  --resources "$STAGE_DIR/resources" \
  --package-path "$DIST_DIR" \
  "$PKG_PATH" 2>&1 | tail -1

rm -f "$COMPONENT_PKG"
PKG_SIZE=$(du -sh "$PKG_PATH" | cut -f1)
echo "  Mac installer: $PKG_PATH ($PKG_SIZE)"

# ═══════════════════════════════════════
# Windows Inno Setup script (.iss)
# ═══════════════════════════════════════

echo ""
echo "Generating Windows Inno Setup script..."

ISS_PATH="$DIST_DIR/${APP_NAME}-${SLUG}-${DATE}.iss"

cat > "$ISS_PATH" << INNO
; Edu Video Gen — Windows Installer
; Compile with Inno Setup: https://jrsoftware.org/isinfo.php

#define MyAppName "Edu Video Gen"
#define MyAppVersion "$VERSION"
#define MyAppPublisher "EduVidGen"
#define MyAppURL "https://github.com/designcraveyard/edu-vid-gen-cloud"

[Setup]
AppId={{8F3E4A2B-1C5D-4E6F-A7B8-9C0D1E2F3A4B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\\EduVidGen
DefaultGroupName={#MyAppName}
OutputDir=.
OutputBaseFilename=${APP_NAME}-${SLUG}-${DATE}-setup
Compression=lzma2/ultra64
SolidCompression=yes
SetupIconFile=compiler:SetupClassicIcon.ico
WizardStyle=modern
PrivilegesRequired=lowest
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "stage-${SLUG}\\EduVidGen\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\\{#MyAppName} Setup"; Filename: "{app}\\setup.bat"
Name: "{autodesktop}\\{#MyAppName} Setup"; Filename: "{app}\\setup.bat"; Comment: "Run EduVidGen setup wizard"

[Run]
Filename: "{app}\\setup.bat"; Description: "Run setup wizard now"; Flags: postinstall nowait skipifsilent shellexec

[Messages]
WelcomeLabel2=This will install the AI video generation pipeline on your computer.%n%nAfter installation, a setup wizard will guide you through the final configuration (API keys, Google sign-in, output folder).
FinishedLabel=Setup has been installed. Click Finish to run the setup wizard and complete configuration.
INNO

echo "  Windows script: $ISS_PATH"

# Check if we can compile the .exe on this Mac
if command -v iscc &>/dev/null; then
  echo "  Compiling .exe with Inno Setup..."
  iscc "$ISS_PATH" 2>&1 | tail -3
  EXE_PATH="$DIST_DIR/${APP_NAME}-${SLUG}-${DATE}-setup.exe"
  [ -f "$EXE_PATH" ] && echo "  Windows installer: $EXE_PATH ($(du -sh "$EXE_PATH" | cut -f1))"
else
  echo ""
  echo "  To compile the .exe installer:"
  echo "    Option A (Mac): brew install --cask innosetup && iscc $ISS_PATH"
  echo "    Option B (Win): Install Inno Setup, open $ISS_PATH, click Compile"
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
echo "  Mac:     ${APP_NAME}-${SLUG}-${DATE}.pkg"
echo "  Windows: ${APP_NAME}-${SLUG}-${DATE}.iss (compile to .exe)"
echo "  Zip:     ${APP_NAME}-${SLUG}-${DATE}.zip (fallback)"
echo ""
