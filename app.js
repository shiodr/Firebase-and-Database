import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// =========================================
// DOM ELEMENTS
// =========================================
const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");

const loginPanel = document.getElementById("login-panel");
const registerPanel = document.getElementById("register-panel");
const showRegisterBtn = document.getElementById("show-register");
const showLoginBtn = document.getElementById("show-login");

const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const userEmail = document.getElementById("user-email");

const studentForm = document.getElementById("student-form");
const recordsBody = document.getElementById("records-body");
const studentMessage = document.getElementById("student-message");
const registerMessage = document.getElementById("register-message");
const loginMessage = document.getElementById("login-message");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const formTitle = document.getElementById("form-title");

const refreshBtn = document.getElementById("refresh-btn");
const searchBtn = document.getElementById("search-btn");
const searchInput = document.getElementById("search-input");

// =========================================
// STATE
// =========================================
let currentUser = null;
let editingRecordId = null;

// =========================================
// AUTH PANEL SWITCHING
// =========================================
showRegisterBtn.addEventListener("click", () => {
  loginPanel.classList.add("hidden");
  registerPanel.classList.remove("hidden");
  showMessage(loginMessage, "");
  showMessage(registerMessage, "");
});

showLoginBtn.addEventListener("click", () => {
  registerPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  showMessage(loginMessage, "");
  showMessage(registerMessage, "");
});

// =========================================
// HELPER FUNCTIONS
// =========================================
function showMessage(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = "message";

  if (type) {
    element.classList.add(type);
  }
}

function clearStudentForm() {
  studentForm.reset();
  editingRecordId = null;
  formTitle.textContent = "Add Student Record";
  submitBtn.innerHTML = 'Add record <span aria-hidden="true">&#8594;</span>';
  cancelEditBtn.classList.add("hidden");
}

function normalizePortfolioLink(value) {
  if (!value) return "";
  const portfolioLink = value.trim();
  if (!portfolioLink) return "";

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(portfolioLink)) {
    return portfolioLink;
  }

  return `https://${portfolioLink}`;
}

function getStudentFormData() {
  return {
    fullName: document.getElementById("full-name").value.trim(),
    studentID: document.getElementById("student-id").value.trim(),
    programme: document.getElementById("programme").value.trim(),
    year: Number(document.getElementById("year").value),
    email: document.getElementById("student-email").value.trim(),
    favouriteTechnology: document.getElementById("favourite-technology").value.trim(),
    portfolioLink: normalizePortfolioLink(document.getElementById("portfolio-link").value),
  };
}

function populateStudentForm(data) {
  document.getElementById("full-name").value = data.fullName || "";
  document.getElementById("student-id").value = data.studentID || "";
  document.getElementById("programme").value = data.programme || "";
  document.getElementById("year").value = data.year || "";
  document.getElementById("student-email").value = data.email || "";
  document.getElementById("favourite-technology").value = data.favouriteTechnology || "";
  document.getElementById("portfolio-link").value = data.portfolioLink || "";
}

function renderPortfolioLink(value) {
  if (!value || !value.trim()) {
    return '<span class="muted-cell">No link</span>';
  }

  const normalized = normalizePortfolioLink(value);

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return '<span class="muted-cell">Invalid link</span>';
    }
    return `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer" class="portfolio-link" title="Open portfolio">View portfolio</a>`;
  } catch {
    return '<span class="muted-cell">Invalid link</span>';
  }
}

// =========================================
// AUTH EVENT HANDLERS
// =========================================
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(registerMessage, "");

  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirmPassword = document.getElementById("register-confirm-password").value;

  if (password !== confirmPassword) {
    showMessage(registerMessage, "Passwords do not match.", "error");
    return;
  }

  const submitBtnEl = registerForm.querySelector('button[type="submit"]');
  if (submitBtnEl) submitBtnEl.disabled = true;

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showMessage(registerMessage, "Registration successful.", "success");
    registerForm.reset();
  } catch (error) {
    console.error(error);
    showMessage(registerMessage, getAuthErrorMessage(error.code), "error");
  } finally {
    if (submitBtnEl) submitBtnEl.disabled = false;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(loginMessage, "");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const submitBtnEl = loginForm.querySelector('button[type="submit"]');
  if (submitBtnEl) submitBtnEl.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    console.error(error);
    showMessage(loginMessage, "Unable to log in. Please check your credentials.", "error");
  } finally {
    if (submitBtnEl) submitBtnEl.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("Unable to log out.");
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    userEmail.textContent = user.email;
    await loadRecords();
  } else {
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    userEmail.textContent = "";
    clearStudentForm();
    recordsBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty">No records found.</td>
      </tr>
    `;
  }
});

// =========================================
// CRUD EVENT HANDLERS
// =========================================
studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    showMessage(studentMessage, "You must be logged in.", "error");
    return;
  }

  const data = getStudentFormData();

  if (!data.fullName || !data.studentID || !data.programme || !data.year || !data.email || !data.favouriteTechnology) {
    showMessage(studentMessage, "Please complete all required fields.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = editingRecordId ? "Updating..." : "Adding...";

  try {
    if (editingRecordId) {
      const recordRef = doc(db, "students", editingRecordId);
      await updateDoc(recordRef, data);
      showMessage(studentMessage, "Record updated successfully.", "success");
    } else {
      await addDoc(collection(db, "students"), {
        ...data,
        ownerId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      showMessage(studentMessage, "Record added successfully.", "success");
    }

    clearStudentForm();
    await loadRecords();
  } catch (error) {
    console.error(error);
    showMessage(studentMessage, getFirestoreErrorMessage(error), "error");
  } finally {
    submitBtn.disabled = false;
    if (editingRecordId) {
      submitBtn.textContent = "Update record";
    } else {
      submitBtn.innerHTML = 'Add record <span aria-hidden="true">&#8594;</span>';
    }
  }
});

async function loadRecords() {
  if (!currentUser) {
    return;
  }

  recordsBody.innerHTML = `
    <tr>
      <td colspan="8" class="empty">Loading records...</td>
    </tr>
  `;

  try {
    const studentsRef = collection(db, "students");
    const q = query(studentsRef, where("ownerId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);

    recordsBody.innerHTML = "";

    if (querySnapshot.empty) {
      recordsBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty">No records found.</td>
        </tr>
      `;
      return;
    }

    querySnapshot.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${escapeHTML(data.fullName)}</td>
        <td>${escapeHTML(data.studentID)}</td>
        <td>${escapeHTML(data.programme)}</td>
        <td>${escapeHTML(String(data.year))}</td>
        <td>${escapeHTML(data.email)}</td>
        <td>${escapeHTML(data.favouriteTechnology)}</td>
        <td>${renderPortfolioLink(data.portfolioLink)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-edit" data-action="edit" data-id="${documentSnapshot.id}">Edit</button>
            <button class="btn btn-delete" data-action="delete" data-id="${documentSnapshot.id}">Delete</button>
          </div>
        </td>
      `;

      row.dataset.record = JSON.stringify({
        id: documentSnapshot.id,
        ...data,
      });

      recordsBody.appendChild(row);
    });

    applySearch();
  } catch (error) {
    console.error(error);
    recordsBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty">Unable to load records.</td>
      </tr>
    `;
  }
}

recordsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const recordId = button.dataset.id;
  const row = button.closest("tr");

  if (button.dataset.action === "edit") {
    const record = JSON.parse(row.dataset.record);
    editingRecordId = recordId;
    populateStudentForm(record);

    formTitle.textContent = "Edit Student Record";
    submitBtn.textContent = "Update record";
    cancelEditBtn.classList.remove("hidden");

    window.scrollTo({ top: 0, behavior: "smooth" });
    showMessage(studentMessage, "Edit the record details above, then click Update record.", "success");
  }

  if (button.dataset.action === "delete") {
    const confirmed = confirm("Are you sure you want to delete this record?");
    if (!confirmed) {
      return;
    }

    button.disabled = true;
    try {
      await deleteDoc(doc(db, "students", recordId));
      showMessage(studentMessage, "Record deleted successfully.", "success");
      await loadRecords();
    } catch (error) {
      console.error(error);
      showMessage(studentMessage, "Unable to delete the record.", "error");
    } finally {
      button.disabled = false;
    }
  }
});

cancelEditBtn.addEventListener("click", () => {
  clearStudentForm();
  showMessage(studentMessage, "Edit cancelled.", "");
});

// =========================================
// SEARCH & REFRESH TOOLS
// =========================================
refreshBtn.addEventListener("click", async () => {
  searchInput.value = "";
  searchInput.classList.add("hidden");
  searchBtn.setAttribute("aria-expanded", "false");
  await loadRecords();
});

searchBtn.addEventListener("click", () => {
  if (searchInput.classList.contains("hidden")) {
    searchInput.classList.remove("hidden");
    searchBtn.setAttribute("aria-expanded", "true");
    searchInput.focus();
    return;
  }

  applySearch();
});

searchInput.addEventListener("input", applySearch);
searchInput.addEventListener("search", applySearch);

function applySearch() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const rows = recordsBody.querySelectorAll("tr");

  rows.forEach((row) => {
    if (!row.dataset.record) {
      row.hidden = false;
      return;
    }

    const record = JSON.parse(row.dataset.record);
    const searchableDetails = [
      record.fullName,
      record.studentID,
      record.programme,
      record.year,
      record.email,
      record.favouriteTechnology,
      record.portfolioLink,
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(" ")
      .toLowerCase();

    row.hidden = Boolean(searchTerm) && !searchableDetails.includes(searchTerm);
  });
}

// =========================================
// ERROR & SANITIZATION UTILITIES
// =========================================
function getAuthErrorMessage(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak.";
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/wrong-password":
      return "Invalid email or password.";
    default:
      return "An authentication error occurred.";
  }
}

function getFirestoreErrorMessage(error) {
  switch (error?.code) {
    case "permission-denied":
      return "Permission denied. Check that your Firestore rules allow your account to manage its own records.";
    case "unavailable":
      return "Firestore is temporarily unavailable. Check your connection and try again.";
    case "failed-precondition":
      return "Firestore is not ready for this request. Check the Firebase project configuration.";
    default:
      return "Unable to save the record. Please try again.";
  }
}

function escapeHTML(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =========================================
// AI VOICE CHATBOT SYSTEM CONTROLLER
// =========================================
const chatWidget = document.getElementById("chat-widget");
const openChatBtn = document.getElementById("open-chat-btn");
const closeChatBtn = document.getElementById("close-chat-btn");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const voiceToggle = document.getElementById("voice-toggle");
const ttsAudio = document.getElementById("tts-audio");
const chatChips = document.getElementById("chat-chips");

// Open & Close Window
if (openChatBtn && chatWidget) {
  openChatBtn.addEventListener("click", () => {
    chatWidget.classList.remove("hidden");
    openChatBtn.setAttribute("aria-expanded", "true");
    chatInput?.focus();
  });
}

if (closeChatBtn && chatWidget) {
  closeChatBtn.addEventListener("click", () => {
    chatWidget.classList.add("hidden");
    openChatBtn?.setAttribute("aria-expanded", "false");
    stopAllAudio();
  });
}

// Quick Prompt Chips
if (chatChips) {
  chatChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const prompt = chip.dataset.prompt;
    if (prompt && chatInput) {
      chatInput.value = prompt;
      sendChatMessage();
    }
  });
}

// Send Message Handlers
if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendChatMessage();
  });
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  // Append User message
  appendChatMessage("user", text);
  chatInput.value = "";
  chatInput.focus();

  // Show typing indicator
  const loadingId = "typing-" + Date.now();
  appendTypingIndicator(loadingId);

  // Check for student data entities in user input for quick auto-fill offer
  const detectedStudent = parseStudentEntitiesFromText(text);

  // Prepare Live Student Records Context
  const studentContext = getLoadedRecordsSummary();

  try {
    // Attempt connecting to local backend server
    const backendUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? `http://${window.location.hostname}:3000/api/chat`
      : "/api/chat";

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        uid: currentUser ? currentUser.uid : "unauthenticated",
        studentContext: studentContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    removeTypingIndicator(loadingId);

    // Display Bot response
    appendChatMessage("bot", data.textResponse, detectedStudent);

    // Play Voice
    if (voiceToggle && voiceToggle.checked) {
      if (data.audioBase64) {
        playElevenLabsAudio(data.audioBase64);
      } else {
        speakWithBrowserTts(data.textResponse);
      }
    }
  } catch (error) {
    console.warn("Backend server connection notice:", error.message);
    removeTypingIndicator(loadingId);

    // Fallback directly to client-side smart assistant
    const localResponse = generateClientSideResponse(text, studentContext);
    appendChatMessage("bot", localResponse, detectedStudent);

    if (voiceToggle && voiceToggle.checked) {
      speakWithBrowserTts(localResponse);
    }
  }
}

/**
 * Appends a chat bubble to the UI with formatted content and action buttons.
 */
function appendChatMessage(sender, text, detectedStudent = null) {
  const msgEl = document.createElement("div");
  msgEl.className = `chat-message ${sender}`;

  const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formattedHtml = formatChatMarkdown(text);

  let actionCardHtml = "";
  if (detectedStudent && Object.keys(detectedStudent).length >= 2) {
    actionCardHtml = `
      <div class="student-action-card">
        <span class="student-action-header">&#128221; Detected Student Details</span>
        <div class="student-action-preview">
          ${detectedStudent.fullName ? `<strong>Name:</strong> ${escapeHTML(detectedStudent.fullName)}<br>` : ""}
          ${detectedStudent.studentID ? `<strong>ID:</strong> ${escapeHTML(detectedStudent.studentID)}<br>` : ""}
          ${detectedStudent.programme ? `<strong>Programme:</strong> ${escapeHTML(detectedStudent.programme)}<br>` : ""}
          ${detectedStudent.year ? `<strong>Year:</strong> ${escapeHTML(String(detectedStudent.year))}<br>` : ""}
          ${detectedStudent.email ? `<strong>Email:</strong> ${escapeHTML(detectedStudent.email)}<br>` : ""}
          ${detectedStudent.favouriteTechnology ? `<strong>Favourite Tech:</strong> ${escapeHTML(detectedStudent.favouriteTechnology)}<br>` : ""}
          ${detectedStudent.portfolioLink ? `<strong>Portfolio:</strong> ${escapeHTML(detectedStudent.portfolioLink)}` : ""}
        </div>
        <button type="button" class="btn btn-primary student-action-btn" data-autofill='${escapeHTML(JSON.stringify(detectedStudent))}'>
          Populate Add Form &#8594;
        </button>
      </div>
    `;
  }

  msgEl.innerHTML = `
    <div class="msg-content">
      ${formattedHtml}
      ${actionCardHtml}
    </div>
    <span class="msg-time">${timeString}</span>
  `;

  // Attach click handler for auto-fill button
  const autoFillBtn = msgEl.querySelector(".student-action-btn");
  if (autoFillBtn) {
    autoFillBtn.addEventListener("click", () => {
      try {
        const studentData = JSON.parse(autoFillBtn.dataset.autofill);
        populateStudentForm(studentData);
        window.scrollTo({ top: 0, behavior: "smooth" });
        showMessage(studentMessage, "Student details populated from AI assistant! Click 'Add record' to save.", "success");
      } catch (err) {
        console.error("Auto-fill error:", err);
      }
    });
  }

  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTypingIndicator(id) {
  const loadingEl = document.createElement("div");
  loadingEl.id = id;
  loadingEl.className = "chat-message bot";
  loadingEl.innerHTML = `
    <div class="msg-content">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  chatMessages.appendChild(loadingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/**
 * Summarizes the currently loaded student records in the UI table.
 */
function getLoadedRecordsSummary() {
  const rows = recordsBody.querySelectorAll("tr");
  const records = [];

  rows.forEach((row) => {
    if (row.dataset.record) {
      try {
        records.push(JSON.parse(row.dataset.record));
      } catch {
        // Skip malformed dataset
      }
    }
  });

  if (records.length === 0) {
    return "The user currently has 0 student records in their directory.";
  }

  const summaries = records.map((r, i) =>
    `${i + 1}. ${r.fullName} (ID: ${r.studentID}, Programme: ${r.programme}, Year: ${r.year}, Email: ${r.email}, Favourite Tech: ${r.favouriteTechnology}${r.portfolioLink ? `, Portfolio: ${r.portfolioLink}` : ""})`
  );

  return `Total student records: ${records.length}\nList of records:\n${summaries.join("\n")}`;
}

/**
 * Extracts student fields from unstructured text (e.g. pasted bio or prompt).
 */
function parseStudentEntitiesFromText(text) {
  const result = {};

  // Email detection
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  // Student ID detection (e.g. 2026-0001, 20260001, ID: 12345)
  const idMatch = text.match(/(?:id|student\s*id)[:=\s]*([0-9]{4,}[-0-9]*)/i) || text.match(/\b(20[123][0-9][-0-9]{3,})\b/);
  if (idMatch) result.studentID = idMatch[1];

  // Year detection (e.g. 3rd year, Year 4, 2nd)
  const yearMatch = text.match(/(?:year|yr)[:=\s]*([1-6])/i) || text.match(/\b([1-6])(?:st|nd|rd|th)?\s*year\b/i);
  if (yearMatch) result.year = Number(yearMatch[1]);

  // Programme detection
  const progMatch = text.match(/\b(BSIT|BSCS|BSCpE|BSIS|BSEMC|ACT|IT|CS)\b/i);
  if (progMatch) {
    result.programme = progMatch[0].toUpperCase();
  }

  // Portfolio link detection
  const urlMatch = text.match(/(?:https?:\/\/|www\.)[^\s,]+/i) || text.match(/(?:github\.com|linkedin\.com|portfolio)[:\s/]*([^\s,]+)/i);
  if (urlMatch) result.portfolioLink = urlMatch[0];

  // Favourite technology detection
  const techKeywords = ["flutter", "react", "python", "javascript", "typescript", "java", "c#", "c++", "php", "swift", "kotlin", "node", "unity", "vue", "angular", "firebase", "sql"];
  for (const tech of techKeywords) {
    const regex = new RegExp(`\\b${tech}\\b`, "i");
    if (regex.test(text)) {
      result.favouriteTechnology = tech.charAt(0).toUpperCase() + tech.slice(1);
      break;
    }
  }

  // Full Name detection
  const nameMatch = text.match(/(?:name|student)[:=\s]*([a-zA-Z\s.]+?)(?:,|\n|id|programme|year|email|$)/i) ||
                    text.match(/(?:add|create)\s+(?:student\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (nameMatch) {
    const rawName = nameMatch[1].trim();
    if (rawName.length > 2 && rawName.length < 50) {
      result.fullName = rawName;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Basic Markdown Formatter for Chat Output
 */
function formatChatMarkdown(text) {
  if (!text) return "";
  let clean = escapeHTML(text);

  // Bold text: **word**
  clean = clean.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Bullet items: • or - item
  clean = clean.replace(/^[•\-\*]\s+(.*)$/gm, "<li>$1</li>");
  clean = clean.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

  // Code snippets: `code`
  clean = clean.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Line breaks
  clean = clean.replace(/\n/g, "<br>");

  return clean;
}

/**
 * Audio / Voice Playback Functions
 */
function playElevenLabsAudio(base64Data) {
  stopAllAudio();
  if (ttsAudio) {
    ttsAudio.src = `data:audio/mp3;base64,${base64Data}`;
    ttsAudio.play().catch((err) => console.warn("Audio autoplay blocked or failed:", err));
  }
}

function speakWithBrowserTts(text) {
  if (!("speechSynthesis" in window)) return;
  stopAllAudio();

  const cleanText = text
    .replace(/[*#_`>]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n+/g, " ")
    .slice(0, 400);

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Try selecting an English voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Female")));
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  window.speechSynthesis.speak(utterance);
}

function stopAllAudio() {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.currentTime = 0;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Client-Side Smart Fallback Assistant
 */
function generateClientSideResponse(message, studentContext) {
  const q = message.toLowerCase();

  if (q.includes("crud") || q.includes("what is crud")) {
    return `In our University of Batangas system, **CRUD** stands for:\n• **Create**: Fill the student form and click "Add record".\n• **Read**: View your private records in the directory table.\n• **Update**: Click "Edit" to modify any existing record.\n• **Delete**: Click "Delete" to remove a record with confirmation.`;
  }

  if (q.includes("how many") || q.includes("total") || q.includes("count")) {
    if (studentContext && !studentContext.includes("0 student records")) {
      return `Here is the current directory summary:\n${studentContext}`;
    }
    return `You currently have no records loaded or need to log in to access your directory.`;
  }

  if (q.includes("add student") || q.includes("auto-fill") || q.includes("sample")) {
    return `To add a student record, complete all 6 required fields in the form above. I can also detect details directly from your message—look for the "Populate Add Form" button on detected data cards!`;
  }

  if (q.includes("security") || q.includes("isolation") || q.includes("ownerid")) {
    return `Data isolation is protected at two layers:\n1. **Firestore Query Filter**: \`where("ownerId", "==", currentUser.uid)\`\n2. **Firestore Security Rules**: Rules enforce that only the record creator (\`request.auth.uid\`) can read, create, edit, or delete their documents.`;
  }

  return `I am your **University of Batangas Academic Assistant**. You can ask me how to manage records, explain CRUD or security rules, or ask for counts and technologies in your directory!`;
}

