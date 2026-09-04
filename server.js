require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files if hosted from the same server
app.use(express.static(__dirname));

// System prompt tailored for University of Batangas Student Records Management System
const SYSTEM_PROMPT = `
You are the official AI Assistant for the University of Batangas Student Records Management System (IPT102 - Integrative Programming and Technologies 2).
Your purpose is to help students, faculty, and administrators navigate the system, understand CRUD operations with Firebase, and query or manage student records.

Key System Facts:
1. Application Purpose: Student Records Management System built for IPT102 at the University of Batangas.
2. Tech Stack: HTML5, CSS3, Vanilla JavaScript (ES Modules), Firebase Authentication, Cloud Firestore, and Firebase Hosting.
3. Student Record Fields:
   - Full Name (fullName)
   - Student ID (studentID)
   - Programme (e.g. BSIT, BSCS, BSCpE)
   - Year Level (1 to 6)
   - Email (email)
   - Favourite Technology (favouriteTechnology)
   - Portfolio Link (portfolioLink - optional)
   - ownerId (Firebase Auth UID of the record creator)
   - createdAt (Firestore server timestamp)
4. Data Isolation & Security: Every record belongs to an ownerId. Users only see and manage their own records via both Firestore query (where("ownerId", "==", currentUser.uid)) and Firestore Security Rules.
5. CRUD Operations:
   - Create: Fill the form and click "Add Record".
   - Read: View records in the "My Student Records" table.
   - Update: Click "Edit" beside any record to load into form, modify, and click "Update Record".
   - Delete: Click "Delete" and confirm the deletion prompt.

If the user provides information to add a student, format your response helpfully and provide the exact fields so the system can offer to fill the form.
Keep responses concise, friendly, and structured.
`.trim();

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    elevenlabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, uid, studentContext } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "A valid message string is required." });
    }

    // 1. Generate text response via LLM (Gemini -> OpenAI -> Local Fallback)
    const aiText = await generateAiResponse(message, studentContext, uid);

    // 2. Generate voice via ElevenLabs if configured
    let audioBase64 = null;
    let useClientTts = true;

    if (process.env.ELEVENLABS_API_KEY) {
      try {
        audioBase64 = await generateElevenLabsAudio(aiText);
        if (audioBase64) {
          useClientTts = false;
        }
      } catch (ttsErr) {
        console.warn("ElevenLabs TTS warning (falling back to browser voice):", ttsErr.message);
      }
    }

    // 3. Return response to frontend
    res.json({
      textResponse: aiText,
      audioBase64,
      useClientTts,
    });
  } catch (error) {
    console.error("Chat Error:", error.message);
    res.status(500).json({
      error: "Failed to process chat request.",
      details: error.message,
    });
  }
});

/**
 * Generates text response using Gemini API, OpenAI, or intelligent local rules.
 */
async function generateAiResponse(userMessage, studentContext = "", uid = "unauthenticated") {
  const contextNote = studentContext
    ? `\nActive Student Directory Context for this user (${uid}):\n${studentContext}\n`
    : "";

  const fullPrompt = `${SYSTEM_PROMPT}\n${contextNote}\nUser Query: ${userMessage}`;

  // Option A: Google Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      const model = "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const response = await axios.post(
        url,
        {
          contents: [
            {
              role: "user",
              parts: [{ text: fullPrompt }],
            },
          ],
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const candidateText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidateText) {
        return candidateText.trim();
      }
    } catch (geminiErr) {
      console.warn("Gemini API error, attempting fallback:", geminiErr.response?.data || geminiErr.message);
    }
  }

  // Option B: OpenAI API
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: `${SYSTEM_PROMPT}\n${contextNote}` },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const openAiText = response.data?.choices?.[0]?.message?.content;
      if (openAiText) {
        return openAiText.trim();
      }
    } catch (openAiErr) {
      console.warn("OpenAI API error, attempting fallback:", openAiErr.response?.data || openAiErr.message);
    }
  }

  // Option C: Smart Local Assistant Engine (Fallback for offline/development)
  return generateLocalSmartResponse(userMessage, studentContext);
}

/**
 * Generates ElevenLabs text-to-speech audio in Base64 format.
 */
async function generateElevenLabsAudio(text) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default Rachel
  const cleanText = text.replace(/[*#_`>]/g, "").replace(/\n+/g, " ").slice(0, 1000);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: cleanText,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
      timeout: 15000,
    }
  );

  return Buffer.from(response.data, "binary").toString("base64");
}

/**
 * Intelligent local response generator when external API keys are not supplied.
 */
function generateLocalSmartResponse(message, studentContext = "") {
  const q = message.toLowerCase();

  // 1. Check if user is asking to add a student / providing student information
  if (
    q.includes("add student") ||
    q.includes("register student") ||
    (q.includes("id") && (q.includes("bsit") || q.includes("bscs") || q.includes("year")))
  ) {
    return `I can help you add this student record to your directory! If you provided details, you can use the "Fill Form" button below or complete the Add Student Record form directly. Remember that all six fields (Full Name, Student ID, Programme, Year, Email, and Favourite Technology) are required.`;
  }

  // 2. Count or summarize records query
  if (q.includes("how many") || q.includes("total students") || q.includes("count")) {
    if (studentContext) {
      return `Based on your current directory:\n${studentContext}\n\nYou can search or filter through these directly in the records table.`;
    }
    return `You can check your student count in the "My Student Records" table below. Make sure you are logged in to view your records.`;
  }

  // 3. Search by technology or programme
  if (q.includes("who likes") || q.includes("technology") || q.includes("python") || q.includes("javascript") || q.includes("flutter") || q.includes("react") || q.includes("java")) {
    if (studentContext) {
      return `Here is what I found in your records regarding favourite technologies:\n${studentContext}`;
    }
    return `You can use the search bar above the table to search for any technology, programme, or student name in real-time.`;
  }

  // 4. CRUD operations explanation
  if (q.includes("crud") || q.includes("what is crud")) {
    return `In this University of Batangas system, CRUD stands for:\n• **Create**: Fill the student form and click "Add record".\n• **Read**: View your private records in the directory table.\n• **Update**: Click "Edit" to modify any existing record.\n• **Delete**: Click "Delete" to remove a record with confirmation.`;
  }

  // 5. How to edit
  if (q.includes("how to edit") || q.includes("update")) {
    return `To edit a student record:\n1. Scroll to **My Student Records** table.\n2. Click the yellow **Edit** button beside the student.\n3. The form will automatically populate with the record's details.\n4. Make your changes and click **Update record**.`;
  }

  // 6. How to delete
  if (q.includes("how to delete") || q.includes("remove")) {
    return `To delete a record, click the red **Delete** button next to the student in the table. The system will ask for confirmation before permanently deleting the document from Cloud Firestore.`;
  }

  // 7. Security and Data Isolation
  if (q.includes("security") || q.includes("rules") || q.includes("ownerid") || q.includes("isolation")) {
    return `Data isolation is enforced at two levels:\n1. **Firestore Queries**: We filter by \`where("ownerId", "==", currentUser.uid)\`.\n2. **Firestore Security Rules**: The rules verify \`request.resource.data.ownerId == request.auth.uid\` on write and \`resource.data.ownerId == request.auth.uid\` on read. Users can never view or modify another user's records.`;
  }

  // 8. General Help
  return `Hello! I am your University of Batangas Student Records Assistant. I can help you with:\n• Explaining CRUD and Firestore security\n• Answering questions about your student directory\n• Auto-filling student records from text or bios\n• Guiding you through adding, editing, or deleting records.\n\nWhat would you like to do?`;
}

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎓 UB Student Records AI Assistant Server`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`🔊 ElevenLabs Voice: ${process.env.ELEVENLABS_API_KEY ? "Enabled" : "Browser Web Speech Fallback"}`);
  console.log(`🧠 AI Engine: ${process.env.GEMINI_API_KEY ? "Gemini API" : process.env.OPENAI_API_KEY ? "OpenAI" : "Smart Local Engine"}`);
  console.log(`====================================================`);
});
