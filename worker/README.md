# OAuth Token Service (Cloudflare Worker)

This Worker provides **true permanent authentication** for the frontend by
managing Google OAuth refresh tokens server-side. The browser never sees
the refresh token — it calls `/auth/token` to get a fresh short-lived
access token whenever needed.

## Why

Google's browser OAuth flow returns access tokens that expire after 1 hour
and **does not** issue refresh tokens (they require `access_type=offline`
in the authorization code flow, which in turn requires a server to keep
the `client_secret` safe). This Worker is that server.

## Setup (one-time, ~15 minutes)

### 1. Install the Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 2. Configure a Google OAuth "Web application" client

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Create a new OAuth 2.0 Client ID of type **Web application**.
2. Add **Authorized redirect URIs**:
   - `https://google-ai-workspace-auth.<YOUR-CF-ACCOUNT>.workers.dev/auth/callback`
   - (you'll get the exact URL after the first deploy — can come back to update)
3. Note the **Client ID** and **Client Secret**.
4. Enable these APIs in your GCP project: Gmail API, Calendar API, Tasks API.

### 3. Create the KV namespace

```bash
cd worker
npm install
wrangler kv:namespace create "TOKENS"
```

Copy the returned `id` into `wrangler.toml` (replace `REPLACE_WITH_KV_NAMESPACE_ID`).

### 4. Configure environment variables

Edit `wrangler.toml`:

- `FRONTEND_ORIGIN` → your frontend URL (e.g. `https://soloceo.github.io`)
- `GOOGLE_CLIENT_ID` → the Client ID from step 2

Set secrets (not stored in the file):

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
# paste the client secret from step 2

# Generate a random AES-256 key:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
wrangler secret put ENCRYPTION_KEY
# paste the output above
```

### 5. Deploy

```bash
npm run deploy
```

Wrangler prints the deployed URL, e.g.
`https://google-ai-workspace-auth.<account>.workers.dev`.

### 6. Update Google redirect URI (if needed)

If the deployed URL differs from what you entered in step 2, go back to
Google Cloud Console and update the authorized redirect URI to match
`<WORKER_URL>/auth/callback`.

### 7. Point the frontend at the Worker

In the frontend repo's `.env.local` (or GitHub Actions secrets):

```
VITE_AUTH_BACKEND_URL=https://google-ai-workspace-auth.<account>.workers.dev
```

Rebuild the frontend. That's it — the app now uses the Worker for token
management and tokens will live as long as the user doesn't revoke
consent in their Google account settings.

## How it works

```
Browser                          Worker                       Google
  │                                │                             │
  │  POST /auth/start ────────────▶│                             │
  │◀──── { authorize_url } ────────│                             │
  │  window.location = url ─────────────────────────────────────▶│
  │                                │                             │
  │◀──── redirect to /auth/callback?code=... ───────────────────┤
  │  GET /auth/callback ──────────▶│                             │
  │                                │  POST /token (exchange) ───▶│
  │                                │◀── access + refresh token ──│
  │                                │  (encrypt & store in KV)    │
  │◀──── 302 → frontend ───────────│                             │
  │                                │                             │
  │  POST /auth/token ────────────▶│                             │
  │                                │  POST /token (refresh) ────▶│
  │                                │◀── new access_token ────────│
  │◀──── { access_token } ─────────│                             │
  │                                                              │
  │  Direct call to Gmail/Cal/Tasks APIs with access_token ─────▶│
```

- Refresh tokens are encrypted (AES-GCM) before storage
- Session cookie (HttpOnly, Secure, SameSite=Lax) identifies the browser
- Access tokens never touch KV — they're minted on demand and returned
  directly to the browser
- CORS is locked to `FRONTEND_ORIGIN`

## Free tier

Cloudflare Workers free tier: 100,000 requests/day + 1GB KV storage. For
a single-user app doing a few refreshes per hour, you'll never come
close to the limit.

## Local development

```bash
wrangler dev
```

Runs the Worker at `http://localhost:8787`. Set `VITE_AUTH_BACKEND_URL`
in the frontend's `.env.local` to this for local testing.
