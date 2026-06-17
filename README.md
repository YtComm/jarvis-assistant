# Jarvis — Personal Voice Assistant

Voice-activated AI assistant. Gemini brain, Web Speech API, Google Calendar.

---

## Setup (15 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Get your Gemini API key (free)
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy it

### 3. Set up Google OAuth (for Calendar)
1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Go to "APIs & Services" → "Enable APIs" → enable:
   - Google Calendar API
   - Google Drive API
4. Go to "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: **Web application**
6. Add Authorized redirect URI: `http://localhost:3000/auth/callback`
7. Copy Client ID and Client Secret

### 4. Create your .env file
```bash
cp .env.example .env
```
Fill in your values in `.env`.

### 5. Run it
```bash
npm start
```

Open http://localhost:3000 in Chrome.

### 6. Connect Google Calendar
Click "Connect Google" in the top right → authorize → done.

---

## Usage

**Voice:** Click the mic button, speak, it replies out loud.

**Text:** Type in the input box, hit Enter.

**Save notes:** Say "note that I need to call Shantanu" or "write this down: review D2CX deck"

**Calendar:** Say "what's on my calendar" or "what do I have today"

**Casual chat:** Just talk to it.

---

## Stack
- **Backend:** Node.js + Express
- **AI:** Gemini 1.5 Flash (free tier)
- **Voice In:** Web Speech API (Chrome)
- **Voice Out:** Browser SpeechSynthesis
- **Calendar:** Google Calendar API
- **Notes:** Local JSON file

---

## Adding home control later
If you get Philips Hue / smart plugs — add a `/home` route in server.js using the device's local API. Say "turn off the lights" and route it through Gemini intent detection.
