require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── Gemini setup ──────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Conversation history (in-memory, resets on server restart)
let chatHistory = [];

const SYSTEM_CONTEXT = `You are Jarvis — a sharp, casual personal assistant for Yatish.
Today's date is ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
You help with calendar, notes, home control, and general conversation.
Keep responses concise and conversational since they'll be spoken aloud.
When fetching calendar or notes, you'll receive the data as context.
Yatish is based in Delhi, works at Inc42 Media as a Program Manager.
Be direct, a little witty, no fluff.`;

// ── Google OAuth2 setup ───────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const TOKEN_PATH = path.join(__dirname, "token.json");

// Load saved token if exists
if (fs.existsSync(TOKEN_PATH)) {
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
}

// Save token on refresh
oauth2Client.on("tokens", (tokens) => {
  let existing = {};
  if (fs.existsSync(TOKEN_PATH)) existing = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const merged = { ...existing, ...tokens };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged));
});

// ── Auth routes ───────────────────────────────────────────────
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
    prompt: "consent",
  });
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send(`
      <html><body style="font-family:monospace;background:#0a0a0a;color:#00ff88;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center">
          <h2>✓ Google connected</h2>
          <p>You can close this tab and go back to Jarvis.</p>
        </div>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send("Auth failed: " + err.message);
  }
});

app.get("/auth/status", (req, res) => {
  const connected = fs.existsSync(TOKEN_PATH);
  res.json({ connected });
});

// ── Calendar ──────────────────────────────────────────────────
app.get("/calendar", async (req, res) => {
  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: weekLater.toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items.map((e) => ({
      title: e.summary,
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
      description: e.description || "",
    }));

    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notes ─────────────────────────────────────────────────────
const NOTES_FILE = path.join(__dirname, "notes.json");

function loadNotes() {
  if (!fs.existsSync(NOTES_FILE)) return [];
  return JSON.parse(fs.readFileSync(NOTES_FILE));
}

function saveNote(note) {
  const notes = loadNotes();
  notes.unshift({ id: Date.now(), text: note, timestamp: new Date().toISOString() });
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  return notes[0];
}

app.get("/notes", (req, res) => {
  res.json({ notes: loadNotes() });
});

app.post("/notes", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });
  const note = saveNote(text);
  res.json({ note });
});

app.delete("/notes/:id", (req, res) => {
  const notes = loadNotes().filter((n) => n.id !== parseInt(req.params.id));
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  res.json({ success: true });
});

// ── Chat (main brain) ─────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, calendarData, notesData } = req.body;

  try {
    // Build context string
    let contextStr = SYSTEM_CONTEXT;

    if (calendarData && calendarData.length > 0) {
      contextStr += `\n\nCurrent calendar (next 7 days):\n`;
      calendarData.forEach((e) => {
        contextStr += `- ${e.title} at ${new Date(e.start).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n`;
      });
    }

    if (notesData && notesData.length > 0) {
      contextStr += `\n\nRecent notes:\n`;
      notesData.slice(0, 5).forEach((n) => {
        contextStr += `- ${n.text} (${new Date(n.timestamp).toLocaleDateString()})\n`;
      });
    }

    // Detect note-saving intent
    const noteTriggers = ["note that", "write this", "save this", "remember that", "note:", "jot down"];
    const isNoteRequest = noteTriggers.some((t) => message.toLowerCase().includes(t));

    if (isNoteRequest) {
      // Extract the note content
      let noteText = message;
      noteTriggers.forEach((t) => {
        noteText = noteText.replace(new RegExp(t, "gi"), "").trim();
      });
      if (noteText) {
        saveNote(noteText);
        chatHistory.push({ role: "user", parts: [{ text: message }] });
        chatHistory.push({ role: "model", parts: [{ text: `Got it, saved: "${noteText}"` }] });
        return res.json({ reply: `Got it, saved: "${noteText}"`, noteSaved: noteText });
      }
    }

    // Build Gemini chat with history
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: contextStr }] },
        { role: "model", parts: [{ text: "Got it. I'm Jarvis, ready to help Yatish." }] },
        ...chatHistory,
      ],
      generationConfig: { maxOutputTokens: 1000 },
    });

    const result = await chat.sendMessage(message);
const reply = result.response.candidates[0].content.parts
  .map(p => p.text)
  .join('');

    // Update history
    chatHistory.push({ role: "user", parts: [{ text: message }] });
    chatHistory.push({ role: "model", parts: [{ text: reply }] });

    // Keep history from ballooning
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    res.json({ reply });
  } catch (err) {
    console.error("Gemini error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Clear history ─────────────────────────────────────────────
app.post("/clear", (req, res) => {
  chatHistory = [];
  res.json({ success: true });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎙️  Jarvis running at http://localhost:${PORT}`);
  console.log(`📅  Connect Google: http://localhost:${PORT}/auth\n`);
});