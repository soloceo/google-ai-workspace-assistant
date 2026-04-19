# Google AI Workspace Assistant

A static web app that connects to your Gmail & Google Calendar, powered by Gemini AI. Runs entirely in the browser — no backend server needed.

## Features

- **Gmail Integration** — Read, search, compose, reply, and manage emails
- **Calendar Integration** — Monthly calendar grid view with event management
- **AI Chat** — Ask Gemini about your emails and calendar (streaming)
- **AI Draft** — Generate email drafts with AI assistance
- **Email Classification** — Auto-categorize emails by priority and type
- **Attachment Analysis** — Extract and analyze PDF/image attachments with AI
- **Multi-Account** — Switch between multiple Google accounts
- **Bilingual** — English and Chinese (Simplified) interface

## Tech Stack

React 19 + TypeScript 5 + Vite 6 + Tailwind CSS v4 + Shadcn UI

## Quick Start

```bash
npm install
npm run dev
```

## Configuration

This app requires two things to work:

### 1. Google OAuth Client ID

You need a Google Cloud project with OAuth credentials. See the **Setup Guide** section below.

Create a `.env.local` file:
```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### 2. Gemini API Key

Enter your Gemini API key in the app's Settings panel (gear icon). Get one free at [Google AI Studio](https://aistudio.google.com/apikey).

## Setup Guide — Google Cloud Console

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top-left) > **New Project**
3. Name it (e.g. "Workspace Assistant") > **Create**
4. Make sure the new project is selected

### Step 2: Enable APIs

1. Go to **APIs & Services > Library**
2. Search and enable these two APIs:
   - **Gmail API**
   - **Google Calendar API**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** > **Create**
3. Fill in:
   - App name: "Workspace Assistant"
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/userinfo.email`
6. Click **Save and Continue**
7. On the **Test users** page, click **Add Users** and add your Google email
8. Click **Save and Continue**

### Step 4: Create OAuth Client ID

1. Go to **APIs & Services > Credentials**
2. Click **+ CREATE CREDENTIALS > OAuth client ID**
3. Application type: **Web application**
4. Name: "Workspace Assistant"
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (for local dev)
   - `https://YOUR_USERNAME.github.io` (for GitHub Pages deployment)
6. Click **Create**
7. Copy the **Client ID** (looks like: `xxx.apps.googleusercontent.com`)

### Step 5: Add to Your App

Create `.env.local` in the project root:
```
VITE_GOOGLE_CLIENT_ID=paste-your-client-id-here
```

Restart the dev server (`npm run dev`) and you're ready to go!

## Deploy to GitHub Pages

```bash
npm run build
# The dist/ folder is ready to deploy
```

Or use GitHub Actions for automatic deployment on push.

## Optional: Permanent Authentication

By default the app uses Google's browser-only OAuth flow — access
tokens last 1 hour and the app silently refreshes them while your
Google session is active. If you're signed out of Google, you'll need
to re-authenticate.

For **true permanent authentication** (token stays valid until you
revoke it in Google account settings), deploy the optional Cloudflare
Worker backend in [`worker/`](worker/README.md). It's free, deploys in
one command, and holds refresh tokens server-side. Then set
`VITE_AUTH_BACKEND_URL` in your `.env.local` to the deployed Worker URL.

## Important Notes

- **Test mode**: While the OAuth consent screen is in "Testing" status, only the test users you added can log in. To allow anyone, you'd need to publish the app (requires Google review).
- **Token expiry**: Access tokens expire after ~1 hour. The app refreshes them silently while your Google session is active, or permanently via the Cloudflare Worker backend (see above).
- **Privacy**: All data stays in your browser. The app makes direct API calls to Google and Gemini — no intermediate server (except for token refresh if you enable the Worker, which only sees OAuth tokens, never your email/calendar data).

## License

Apache-2.0
