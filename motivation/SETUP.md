# Motivation — Setup Guide
One-time setup (~25 minutes). Do these in order.

---

## 1. Install Prerequisites

### Node.js (if not installed)
Download Node 18+ from https://nodejs.org

### FFmpeg (required for video assembly)
1. Go to https://www.gyan.dev/ffmpeg/builds/
2. Download **ffmpeg-release-essentials.zip**
3. Extract to `C:\ffmpeg\`
4. Add `C:\ffmpeg\bin` to your Windows PATH:
   - Search "Environment Variables" in Start
   - Edit "Path" → New → `C:\ffmpeg\bin`
5. Verify: open a new terminal and run `ffmpeg -version`

---

## 2. Install App Dependencies

Open a terminal in the `motivation/` folder:
```
npm install
```

---

## 3. API Keys — Get Each One

### A. Anthropic (Claude)
Already have this from BRAIN project.
Copy it into `.env` as `ANTHROPIC_API_KEY`.

### B. ElevenLabs (Voice)
1. Go to https://elevenlabs.io → Sign in with Google (jwclarkladymae@gmail.com)
2. Click your avatar → **Profile + API Key**
3. Copy the key → paste as `ELEVENLABS_API_KEY` in `.env`
4. The app defaults to the "Josh" voice (energetic/uplifting). To change:
   - Go to **Voice Library** → find a voice you like → click it
   - Copy the Voice ID from the URL
   - Paste as `ELEVENLABS_VOICE_ID` in `.env`

### C. Runway ML (Video Generation)
1. Go to https://runwayml.com → Sign in with Google
2. Click your avatar → **API Keys** → **Create new key**
3. Copy the key → paste as `RUNWAY_API_KEY` in `.env`
4. Add credits: Runway Gen-3 Alpha costs ~$0.05/second. Each 60s video ≈ $3–5.

### D. Brave Search (Trend Research)
1. Go to https://api.search.brave.com → Sign up with Google
2. Create an API key (free tier: 2,000 queries/month — plenty)
3. Paste as `BRAVE_SEARCH_API_KEY` in `.env`

---

## 4. YouTube Setup

### Create Google Cloud App
1. Go to https://console.cloud.google.com
2. Create project → name it **"Motivation"**
3. Enable **YouTube Data API v3** (search in API Library)
4. Go to **Credentials** → Create OAuth 2.0 Client ID
   - Application type: **Desktop app**
   - Name: Motivation
5. Download JSON → copy `client_id` and `client_secret`
6. Paste into `.env`:
   ```
   YOUTUBE_CLIENT_ID=your_client_id
   YOUTUBE_CLIENT_SECRET=your_client_secret
   YOUTUBE_REDIRECT_URI=http://localhost:3456/oauth/youtube
   ```

### Authorize (one-time)
Run the app once, click **"Connect YouTube"** in the tray menu — it opens a browser,
you log in with Google, and the token is saved automatically to `tokens.json`.

---

## 5. LinkedIn Setup

1. Go to https://www.linkedin.com/developers/ → Create app
   - App name: Motivation
   - LinkedIn page: your personal profile URL
2. Under **Products**, request access to **Share on LinkedIn** and **Sign In with LinkedIn**
3. Go to **Auth** tab → add redirect URL: `http://localhost:3456/oauth/linkedin`
4. Get a token via the OAuth flow or use the LinkedIn Token Inspector:
   https://www.linkedin.com/developers/tools/oauth
   - Scopes: `r_liteprofile`, `w_member_social`, `r_emailaddress`
5. Paste the access token as `LINKEDIN_ACCESS_TOKEN` in `.env` (valid 60 days)
6. Get your Person URN: call https://api.linkedin.com/v2/me with your token
   - It looks like `urn:li:person:XXXXXXXX`
   - Paste as `LINKEDIN_PERSON_URN` in `.env`

---

## 6. TikTok Setup

1. Go to https://developers.tiktok.com → Log in with TikTok
2. Create an app → name it **Motivation**
3. Add product: **Content Posting API**
4. Under sandbox, generate an access token for your TikTok account
5. Paste as `TIKTOK_ACCESS_TOKEN` in `.env`
6. Your Open ID is shown on the same page → paste as `TIKTOK_OPEN_ID`

Note: TikTok requires app review for production. In the meantime, use sandbox mode
(posts to your account but marked as sandbox). Apply for review after testing.

---

## 7. Instagram Setup

1. Go to https://developers.facebook.com → Create app → **Business** type
2. Add product: **Instagram Graph API**
3. Connect your Instagram Business or Creator account (must switch from Personal in Instagram settings)
4. Generate a long-lived access token:
   - Go to Graph API Explorer → select your app → get token with scopes:
     `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
   - Exchange for long-lived token (valid 60 days):
     ```
     https://graph.facebook.com/oauth/access_token?
       grant_type=fb_exchange_token&
       client_id=YOUR_APP_ID&
       client_secret=YOUR_APP_SECRET&
       fb_exchange_token=YOUR_SHORT_TOKEN
     ```
5. Paste as `INSTAGRAM_ACCESS_TOKEN` in `.env`
6. Get your Instagram Business Account ID:
   ```
   https://graph.facebook.com/me/accounts?access_token=YOUR_TOKEN
   ```
7. Paste as `INSTAGRAM_BUSINESS_ACCOUNT_ID` in `.env`

---

## 8. Add Dubstep Music

Drop any `.mp3` or `.wav` dubstep tracks into:
```
motivation/assets/music/
```
The app picks one randomly per video and mixes it at 20% volume under the voiceover.

Free royalty-free dubstep sources:
- https://www.bensound.com (search "electronic")
- https://freemusicarchive.org (filter: Electronic)
- https://pixabay.com/music/ (search "dubstep")

---

## 9. Run the App

```
npm start
```

The app runs in the **system tray** (bottom-right corner, ⚡ icon).
Every day at **9:00 AM** it pops up the prompt window automatically.
To trigger manually: right-click the tray icon → **Post Now**.

---

## Cost Estimate Per Video

| Service | Cost |
|---|---|
| Runway ML (8 clips × 10s) | ~$4 |
| ElevenLabs (60s audio) | ~$0.10 |
| Anthropic (script generation) | ~$0.01 |
| Brave Search | Free |
| **Total per video** | **~$4.11** |
| **Monthly (30 videos)** | **~$123** |
