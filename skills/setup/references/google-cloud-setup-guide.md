# Google Cloud Setup Guide (with Claude Browser Extension)

This guide walks you through setting up Google Cloud from scratch for the Edu Video Gen plugin. It assumes you have the Claude browser extension installed — Claude can see your screen and help you at each step.

> **Tell Claude:** "I'm on step X and I see..." if you get stuck. Claude can read your screen and guide you.

---

## What You're Setting Up (and Why)

| What | Why You Need It | Time |
|------|----------------|------|
| Google Cloud account | Hosts the AI models that generate your videos | 2 min |
| A "project" inside Google Cloud | Keeps your video generation separate from other work | 1 min |
| Vertex AI API | The AI service that generates video clips (Veo) and images | 30 sec |
| Google Drive/Docs/Sheets APIs | Stores your video assets and lets you review them in familiar tools | 1 min |
| OAuth credentials | A special file that lets the plugin talk to Google on your behalf | 2 min |
| gcloud CLI | A terminal tool that handles login — the plugin uses it behind the scenes | 3 min |

**Total time: ~10 minutes.** You only do this once.

**Cost:** Google Cloud gives new accounts **$300 in free credits** (valid for 90 days). A typical educational video costs $2-5 to generate, so the free credits cover 60-150 videos.

---

## Step 1 — Create a Google Cloud Account

### 1.1 Open Google Cloud Console

Go to: **https://console.cloud.google.com/**

**What you should see:**
- If you're signed in to Google already: You'll see the Google Cloud Console dashboard
- If not: A "Sign in" or "Get started for free" page

### 1.2 Sign in or create account

- **Already have a Gmail/Google account?** Click "Sign in" and use that account
- **No Google account?** Click "Create account" and follow the steps

> **Important:** Remember which Google account you use here. You'll need to use the **same account** for Google Drive later. If you have multiple Google accounts, pick the one you want to own the video projects.

### 1.3 Set up billing (required, but free)

If this is your first time:
1. You'll see a "Try Google Cloud for free" banner
2. Click **"Get started for free"** or **"Activate"**
3. Choose your country
4. Accept the terms of service
5. Add a payment method (credit card or bank account)

> **Don't worry about charges.** Google won't charge you until you explicitly upgrade from the free trial AND exceed the $300 credit. The plugin uses very little — typically $2-5 per video.

**What you should see after this step:** The Google Cloud Console dashboard with a blue banner saying "$300 free trial credit"

---

## Step 2 — Create a Project

A "project" is like a folder that keeps all your video generation resources together.

1. Look at the **top of the page** — you'll see a project selector (it might say "Select a project" or show a default project name)
2. **Click it** — a popup appears
3. Click **"NEW PROJECT"** (top-right of the popup)
4. Fill in:
   - **Project name:** `edu-video-gen` (or any name you like)
   - **Organization:** Leave as "No organization" (unless you know you need one)
   - **Location:** Leave as default
5. Click **"CREATE"**
6. **Wait 10-15 seconds** for it to create

### After creating:
1. Click the project selector at the top again
2. Find your new project in the list
3. **Click on it** to select it
4. The project selector should now show **"edu-video-gen"** (or your chosen name)

> **Write down your Project ID.** It's shown under the project name in the selector. It looks like `edu-video-gen` or `edu-video-gen-428819`. You'll need this later. It is NOT the project number (which is all digits).

---

## Step 3 — Enable the APIs

You need to turn on 4 APIs. Each one takes about 10 seconds.

### 3.1 Enable Vertex AI API (for video and image generation)

1. Go to: **https://console.cloud.google.com/apis/library/aiplatform.googleapis.com**
2. Make sure your project is selected at the top (it should say `edu-video-gen`)
3. Click the blue **"ENABLE"** button
4. Wait for it to finish (you'll see "API enabled" or a "MANAGE" button)

### 3.2 Enable Google Drive API (for storing video assets)

1. Go to: **https://console.cloud.google.com/apis/library/drive.googleapis.com**
2. Click **"ENABLE"**

### 3.3 Enable Google Docs API (for video briefs)

1. Go to: **https://console.cloud.google.com/apis/library/docs.googleapis.com**
2. Click **"ENABLE"**

### 3.4 Enable Google Sheets API (for tracking and timeline)

1. Go to: **https://console.cloud.google.com/apis/library/sheets.googleapis.com**
2. Click **"ENABLE"**

> **Checkpoint:** Go to https://console.cloud.google.com/apis/dashboard — you should see 4 APIs listed: Vertex AI, Google Drive, Google Docs, Google Sheets.

### 3.5 Grant yourself Vertex AI permissions (IAM roles)

Vertex AI needs your Google account to have the right permissions on the project. For new projects you own, you typically already have "Owner" which covers everything. But if you're using a shared project or org, you need to verify this.

1. Go to: **https://console.cloud.google.com/iam-admin/iam**
2. Find your email in the members list
3. Check that you have **one of** these roles:
   - **Owner** (covers everything — most personal projects have this)
   - OR **Editor** + **Vertex AI User**
4. **If your email is NOT listed** or is missing roles:
   a. Click **"GRANT ACCESS"** at the top
   b. In "New principals", type your email address
   c. In "Select a role", search for and add **"Vertex AI User"** (`roles/aiplatform.user`)
   d. Click **"+ ADD ANOTHER ROLE"** and add **"Service Usage Consumer"** (`roles/serviceusage.serviceUsageConsumer`)
   e. Click **"SAVE"**

> **Why these roles?**
> - **Vertex AI User** — Lets you call Veo (video generation), Imagen (image generation), and Gemini (validation) through Vertex AI
> - **Service Usage Consumer** — Lets your account use enabled APIs on this project

### 3.6 Create a default service account (Vertex AI needs this)

Vertex AI requires a service account to exist in your project for certain operations. Most new projects create one automatically, but let's make sure.

1. Go to: **https://console.cloud.google.com/iam-admin/serviceaccounts**
2. Check if a service account already exists. Look for one named:
   - `Compute Engine default service account` (created automatically when you enable Compute Engine)
   - or any account ending in `@developer.gserviceaccount.com`
3. **If no service account exists**, create one:
   a. Click **"+ CREATE SERVICE ACCOUNT"** at the top
   b. Service account name: `edu-video-gen` (or anything)
   c. Service account ID: auto-fills (e.g. `edu-video-gen@your-project.iam.gserviceaccount.com`)
   d. Description: `Service account for Edu Video Gen plugin`
   e. Click **"CREATE AND CONTINUE"**
   f. Grant this service account the role: **"Vertex AI User"** — search and select it
   g. Click **"+ ADD ANOTHER ROLE"** and add **"Storage Object Viewer"** (needed for some Vertex AI operations that read/write temporary files)
   h. Click **"CONTINUE"**
   i. Skip "Grant users access" — click **"DONE"**

> **You do NOT need to download a key file.** The plugin uses Application Default Credentials (ADC) from `gcloud auth application-default login`, not service account keys. The service account just needs to *exist* in the project for Vertex AI to work.

> **Checkpoint:** Go to https://console.cloud.google.com/iam-admin/serviceaccounts — you should see at least one service account listed.

---

## Step 4 — Set Up the OAuth Consent Screen

This tells Google what your app is called when it asks for permission to access Drive/Docs/Sheets.

1. Go to: **https://console.cloud.google.com/apis/credentials/consent**
2. Select **"External"** user type
3. Click **"CREATE"**
4. Fill in the form:
   - **App name:** `EduVidGen`
   - **User support email:** Select your email from the dropdown
   - **App logo:** Skip (leave empty)
   - **App domain / Authorized domains:** Skip all of these
   - **Developer contact information:** Type your email address
5. Click **"SAVE AND CONTINUE"**
6. **Scopes page:** Don't add anything. Click **"SAVE AND CONTINUE"**
7. **Test users page:** Don't add anything. Click **"SAVE AND CONTINUE"**
8. **Summary page:** Click **"BACK TO DASHBOARD"**

> **Why "External"?** It's the only option for personal Google accounts. It doesn't mean your app is public — only you will use it.

---

## Step 5 — Create OAuth Credentials (credentials.json)

This creates a special file that the plugin uses to connect to your Google Drive.

1. Go to: **https://console.cloud.google.com/apis/credentials**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. Fill in:
   - **Application type:** Select **"Desktop app"**
   - **Name:** `EduVidGen` (or anything)
5. Click **"CREATE"**
6. A popup appears showing your Client ID — click **"DOWNLOAD JSON"**
7. A file downloads — it'll be named something like `client_secret_XXXXX.json`
8. **Rename it** to `credentials.json`
9. **Move it** to your plugin directory (the setup wizard will tell you exactly where)

> **Keep this file safe.** Don't share it or commit it to git. It's like a key to your Google account's Drive access.

---

## Step 6 — Install the gcloud CLI

The gcloud CLI is a terminal tool that handles authentication. The plugin uses it behind the scenes.

### macOS

**Option A — With Homebrew (if you have it):**
```
brew install google-cloud-cli
```

**Option B — Manual install:**
1. Go to: **https://cloud.google.com/sdk/docs/install**
2. Click the **macOS** tab
3. Download the package for your chip:
   - **Apple Silicon (M1/M2/M3/M4):** `google-cloud-cli-darwin-arm.tar.gz`
   - **Intel Mac:** `google-cloud-cli-darwin-x86_64.tar.gz`
4. Open your Downloads folder
5. Double-click the downloaded file to extract it
6. Open Terminal and run:
   ```
   cd ~/Downloads/google-cloud-sdk
   ./install.sh
   ```
7. Say **Yes** to adding it to your PATH
8. **Close and reopen Terminal** (important!)

### Windows

1. Go to: **https://cloud.google.com/sdk/docs/install**
2. Click the **Windows** tab
3. Download and run the installer (.exe)
4. Follow the installation wizard (keep all defaults)
5. It will open a terminal window at the end — keep it open for the next step

### Linux

```
curl https://sdk.cloud.google.com | bash
```
Then restart your terminal.

### Verify it's installed

Open a new terminal and run:
```
gcloud --version
```

You should see something like `Google Cloud SDK 500.x.x`. If you get "command not found", restart your terminal and try again.

---

## Step 7 — Log In with gcloud

This connects your terminal to your Google Cloud account.

### 7.1 Log in to Google Cloud

Run in your terminal:
```
gcloud auth login
```

A browser window opens:
1. Pick the **same Google account** you used in Step 1
2. Click **"Allow"** on the permissions page
3. You'll see "You are now authenticated" — you can close the browser tab

### 7.2 Set up Application Default Credentials

Run in your terminal:
```
gcloud auth application-default login
```

Another browser window opens:
1. Pick the **same Google account** again
2. Click **"Allow"**
3. Close the browser tab

### 7.3 Set your project

Run in your terminal (replace `edu-video-gen` with YOUR project ID from Step 2):
```
gcloud config set project edu-video-gen
```

### Verify

Run:
```
gcloud auth list
```

You should see your email with an asterisk (*) next to it — that means it's the active account.

---

## Done!

You're all set. Now run `/setup` in Claude Code — it will detect everything you just configured and complete the remaining setup (API keys, dependencies, etc.).

---

## Troubleshooting

### "This app isn't verified" warning
When signing in with Google (browser popup), you may see this scary-looking warning. This is normal for personal projects.
- Click **"Advanced"** (small text at the bottom)
- Click **"Go to EduVidGen (unsafe)"**
- This is safe — it's YOUR project, not a third-party app

### "Permission denied" or "API not enabled"
- Go back to Step 3 and make sure all 4 APIs are enabled
- Make sure the right project is selected (check the project selector at the top of every Google Cloud page)

### "gcloud: command not found"
- Close and reopen your terminal after installing gcloud
- On macOS: try `~/google-cloud-sdk/bin/gcloud --version` — if that works, run `~/google-cloud-sdk/install.sh` again and say Yes to PATH

### "Wrong account" / need to switch accounts
If you're logged into the wrong Google account:
```
gcloud auth revoke your-old-email@gmail.com
gcloud auth login
gcloud auth application-default login
```
This logs out the old account and lets you pick a new one.

### "Billing account not found"
- Go to https://console.cloud.google.com/billing
- Make sure a billing account is linked to your project
- You need a payment method even for the free trial

### Asking Claude for help
If you have the Claude browser extension, you can say:
- "I'm on the Google Cloud Console and I see [describe what's on screen]. What do I click?"
- "I'm getting this error: [paste error]. How do I fix it?"
- Claude can see your screen and guide you step by step.
