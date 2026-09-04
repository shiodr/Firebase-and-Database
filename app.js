import { auth, db } from "./firebase-config.js";
import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@latest/+esm";

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
  if (!data) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : "";
  };
  setVal("full-name", data.fullName);
  setVal("student-id", data.studentID);
  setVal("programme", data.programme);
  setVal("year", data.year);
  setVal("student-email", data.email);
  setVal("favourite-technology", data.favouriteTechnology);
  setVal("portfolio-link", data.portfolioLink);
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
// ELEVENLABS CONVERSATIONAL AI RAGBOT CONTROLLER
// Week 3 Project: Build a RAGbot Using ElevenLabs
// =========================================

/**
 * -------------------------------------------------------------------------
 * 1. ELEVENLABS AGENT CONFIGURATION
 * Replace the placeholder below with your Agent ID from the ElevenLabs Dashboard.
 * Location: ElevenLabs Dashboard -> Conversational AI -> Your Agent -> Copy Agent ID
 * -------------------------------------------------------------------------
 */
const ELEVENLABS_AGENT_ID = "agent_2001m1pjp56ve6gb66qvq3gp4rw8";

// ElevenLabs Voice Session State
let activeVoiceSession = null;
let voiceMediaStream = null;
let voiceAudioContext = null;
let voiceAnalyserNode = null;
let voiceAnimationFrameId = null;
let isVoiceMuted = false;

// DOM Elements: Chat & Voice Widget
const chatWidget = document.getElementById("chat-widget");
const openChatBtn = document.getElementById("open-chat-btn");
const closeChatBtn = document.getElementById("close-chat-btn");
const voiceToggleBtn = document.getElementById("voice-toggle-btn");
const voicePillText = document.getElementById("voice-pill-text");

// Tabs & Views
const tabChatBtn = document.getElementById("tab-chat-btn");
const tabVoiceBtn = document.getElementById("tab-voice-btn");
const chatViewContainer = document.getElementById("chat-view-container");
const voiceViewContainer = document.getElementById("voice-view-container");
const quickVoiceBtn = document.getElementById("quick-voice-btn");

// Text Chat DOM Elements
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatChips = document.getElementById("chat-chips");
const ttsAudio = document.getElementById("tts-audio");

// Voice Mode DOM Elements
const voiceStatusDot = document.getElementById("voice-status-dot");
const voiceStatusText = document.getElementById("voice-status-text");
const voiceOrbWrapper = document.getElementById("voice-orb-wrapper");
const voiceMicOrb = document.getElementById("voice-mic-orb");
const voiceMicSvg = document.getElementById("voice-mic-svg");
const voiceHangupSvg = document.getElementById("voice-hangup-svg");
const voiceFeedbackTitle = document.getElementById("voice-feedback-title");
const voiceFeedbackSubtitle = document.getElementById("voice-feedback-subtitle");
const voiceAudioBars = document.getElementById("voice-audio-bars");
const voiceVisualizerBars = document.querySelectorAll("#voice-audio-bars .vbar");
const voicePrimaryBtn = document.getElementById("voice-primary-btn");
const voicePrimaryLabel = document.getElementById("voice-primary-label");
const voiceMuteBtn = document.getElementById("voice-mute-btn");
const voiceMuteLabel = document.getElementById("voice-mute-label");
const voiceTranscriptStream = document.getElementById("voice-transcript-stream");
const voicePromptChips = document.querySelectorAll(".voice-chip");

// Setup Modal
const agentSetupModal = document.getElementById("agent-setup-modal");
const closeSetupModalBtn = document.getElementById("close-setup-modal-btn");

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
    endElevenLabsVoiceSession();
  });
}

// Mode Switching (Tabs & Toggle Button)
function switchWidgetMode(mode) {
  if (mode === "voice") {
    tabVoiceBtn?.classList.add("active");
    tabChatBtn?.classList.remove("active");
    tabVoiceBtn?.setAttribute("aria-selected", "true");
    tabChatBtn?.setAttribute("aria-selected", "false");
    voiceViewContainer?.classList.remove("hidden");
    chatViewContainer?.classList.add("hidden");
    if (voicePillText) voicePillText.textContent = "Chat Mode";
  } else {
    tabChatBtn?.classList.add("active");
    tabVoiceBtn?.classList.remove("active");
    tabChatBtn?.setAttribute("aria-selected", "true");
    tabVoiceBtn?.setAttribute("aria-selected", "false");
    chatViewContainer?.classList.remove("hidden");
    voiceViewContainer?.classList.add("hidden");
    if (voicePillText) voicePillText.textContent = "Voice Mode";
  }
}

if (tabChatBtn) {
  tabChatBtn.addEventListener("click", () => switchWidgetMode("chat"));
}

if (tabVoiceBtn) {
  tabVoiceBtn.addEventListener("click", () => switchWidgetMode("voice"));
}

if (quickVoiceBtn) {
  quickVoiceBtn.addEventListener("click", () => {
    switchWidgetMode("voice");
  });
}

if (voiceToggleBtn) {
  voiceToggleBtn.addEventListener("click", () => {
    const isVoiceActive = tabVoiceBtn?.classList.contains("active");
    switchWidgetMode(isVoiceActive ? "chat" : "voice");
  });
}

// Setup Modal Close Handler
if (closeSetupModalBtn && agentSetupModal) {
  closeSetupModalBtn.addEventListener("click", () => {
    agentSetupModal.close();
  });
}

// Voice Suggestion Chips
if (voicePromptChips) {
  voicePromptChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-speak");
      if (prompt) {
        if (activeVoiceSession) {
          alert(`Say this aloud into your microphone:\n\n"${prompt}"`);
        } else {
          alert(`Click "Start Voice Session" and speak this aloud:\n\n"${prompt}"`);
        }
      }
    });
  });
}

// =========================================================================
// ELEVENLABS CONVERSATIONAL AI STATE MACHINE
// Visual Feedback States: "disconnected", "connecting", "listening", "speaking"
// =========================================================================
function setVoiceState(state) {
  console.log(`[ElevenLabs State] -> ${state.toUpperCase()}`);

  voiceOrbWrapper?.classList.remove("state-disconnected", "state-connecting", "state-listening", "state-speaking");
  voiceStatusDot?.classList.remove("disconnected", "connecting", "listening", "speaking");
  voiceAudioBars?.classList.remove("idle", "listening", "speaking");

  voiceOrbWrapper?.classList.add(`state-${state}`);
  voiceStatusDot?.classList.add(state);

  switch (state) {
    case "disconnected":
      if (voiceStatusText) voiceStatusText.textContent = "Disconnected";
      if (voiceFeedbackTitle) voiceFeedbackTitle.textContent = "Ready to Connect";
      if (voiceFeedbackSubtitle) voiceFeedbackSubtitle.textContent = "Tap the microphone to speak with your Academic Assistant.";
      voiceMicSvg?.classList.remove("hidden");
      voiceHangupSvg?.classList.add("hidden");
      if (voicePrimaryBtn) {
        voicePrimaryBtn.classList.remove("btn-danger");
        voicePrimaryBtn.classList.add("btn-primary");
        voicePrimaryBtn.disabled = false;
      }
      if (voicePrimaryLabel) voicePrimaryLabel.textContent = "Start Voice Session";
      if (voiceMicOrb) voiceMicOrb.disabled = false;
      if (voiceMuteBtn) voiceMuteBtn.disabled = true;
      voiceAudioBars?.classList.add("idle");
      stopVoiceAudioVisualizer();
      break;

    case "connecting":
      if (voiceStatusText) voiceStatusText.textContent = "Connecting...";
      if (voiceFeedbackTitle) voiceFeedbackTitle.textContent = "Establishing Connection...";
      if (voiceFeedbackSubtitle) voiceFeedbackSubtitle.textContent = "Initializing secure WebRTC audio channel with ElevenLabs Agent...";
      if (voicePrimaryBtn) voicePrimaryBtn.disabled = true;
      if (voiceMicOrb) voiceMicOrb.disabled = true;
      if (voiceMuteBtn) voiceMuteBtn.disabled = true;
      break;

    case "listening":
      if (voiceStatusText) voiceStatusText.textContent = "Listening...";
      if (voiceFeedbackTitle) voiceFeedbackTitle.textContent = "Listening to You";
      if (voiceFeedbackSubtitle) voiceFeedbackSubtitle.textContent = "Speak clearly—ask about records, CRUD, or UB policies...";
      voiceMicSvg?.classList.add("hidden");
      voiceHangupSvg?.classList.remove("hidden");
      if (voicePrimaryBtn) {
        voicePrimaryBtn.classList.remove("btn-primary");
        voicePrimaryBtn.classList.add("btn-danger");
        voicePrimaryBtn.disabled = false;
      }
      if (voicePrimaryLabel) voicePrimaryLabel.textContent = "End Call";
      if (voiceMicOrb) voiceMicOrb.disabled = false;
      if (voiceMuteBtn) voiceMuteBtn.disabled = false;
      voiceAudioBars?.classList.add("listening");
      startVoiceAudioVisualizer();
      break;

    case "speaking":
      if (voiceStatusText) voiceStatusText.textContent = "Speaking...";
      if (voiceFeedbackTitle) voiceFeedbackTitle.textContent = "Academic Assistant Speaking";
      if (voiceFeedbackSubtitle) voiceFeedbackSubtitle.textContent = "Synthesizing answer grounded in verified university knowledge...";
      voiceMicSvg?.classList.add("hidden");
      voiceHangupSvg?.classList.remove("hidden");
      if (voicePrimaryBtn) {
        voicePrimaryBtn.classList.remove("btn-primary");
        voicePrimaryBtn.classList.add("btn-danger");
        voicePrimaryBtn.disabled = false;
      }
      if (voicePrimaryLabel) voicePrimaryLabel.textContent = "End Call";
      if (voiceMicOrb) voiceMicOrb.disabled = false;
      if (voiceMuteBtn) voiceMuteBtn.disabled = false;
      voiceAudioBars?.classList.add("speaking");
      break;
  }
}

// =========================================================================
// MICROPHONE & AUDIO VISUALIZER (Web Audio API)
// =========================================================================
async function setupVoiceMicrophoneStream() {
  console.log("[ElevenLabs Audio] Requesting microphone access...");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Microphone access is not supported by your browser.");
  }

  voiceMediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  console.log("[ElevenLabs Audio] Microphone access granted.");

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    voiceAudioContext = new AudioContextClass();
    const sourceNode = voiceAudioContext.createMediaStreamSource(voiceMediaStream);
    voiceAnalyserNode = voiceAudioContext.createAnalyser();
    voiceAnalyserNode.fftSize = 64;
    voiceAnalyserNode.smoothingTimeConstant = 0.8;
    sourceNode.connect(voiceAnalyserNode);
  } catch (err) {
    console.warn("[ElevenLabs Audio] Visualizer setup warning (non-fatal):", err);
  }

  return voiceMediaStream;
}

function startVoiceAudioVisualizer() {
  if (!voiceAnalyserNode) return;
  const dataArray = new Uint8Array(voiceAnalyserNode.frequencyBinCount);

  function renderFrame() {
    voiceAnalyserNode.getByteFrequencyData(dataArray);
    voiceVisualizerBars.forEach((bar, index) => {
      const sample = dataArray[index % dataArray.length];
      const height = Math.max(5, Math.min(24, (sample / 255) * 26));
      bar.style.height = `${height}px`;
    });
    voiceAnimationFrameId = requestAnimationFrame(renderFrame);
  }

  cancelAnimationFrame(voiceAnimationFrameId);
  renderFrame();
}

function stopVoiceAudioVisualizer() {
  if (voiceAnimationFrameId) {
    cancelAnimationFrame(voiceAnimationFrameId);
    voiceAnimationFrameId = null;
  }
  voiceVisualizerBars.forEach((bar) => {
    bar.style.height = "5px";
  });
}

function teardownVoiceMicrophone() {
  stopVoiceAudioVisualizer();
  if (voiceMediaStream) {
    voiceMediaStream.getTracks().forEach((track) => track.stop());
    voiceMediaStream = null;
  }
  if (voiceAudioContext && voiceAudioContext.state !== "closed") {
    voiceAudioContext.close().catch(console.error);
    voiceAudioContext = null;
  }
}

// =========================================================================
// ELEVENLABS CONVERSATIONAL AI SESSION LIFECYCLE
// =========================================================================
async function startElevenLabsVoiceSession() {
  if (!ELEVENLABS_AGENT_ID || ELEVENLABS_AGENT_ID === "YOUR_ELEVENLABS_AGENT_ID_HERE" || ELEVENLABS_AGENT_ID.trim() === "") {
    console.warn("[ElevenLabs] Placeholder Agent ID detected. Showing setup instructions.");
    agentSetupModal?.showModal();
    return;
  }

  try {
    setVoiceState("connecting");
    await setupVoiceMicrophoneStream();

    console.log(`[ElevenLabs] Initiating session with Agent ID: ${ELEVENLABS_AGENT_ID}`);

    activeVoiceSession = await Conversation.startSession({
      agentId: ELEVENLABS_AGENT_ID,
      onConnect: ({ conversationId }) => {
        console.log(`[ElevenLabs] Session connected! ID: ${conversationId}`);
        setVoiceState("listening");
        appendVoiceTranscript("agent", "I'm listening! You can ask about student records, CRUD operations, or UB policies.");
      },
      onDisconnect: () => {
        console.log("[ElevenLabs] Session disconnected.");
        endElevenLabsVoiceSession();
      },
      onModeChange: ({ mode }) => {
        console.log(`[ElevenLabs] Mode: ${mode}`);
        if (mode === "speaking") {
          setVoiceState("speaking");
        } else if (mode === "listening") {
          setVoiceState("listening");
        }
      },
      onMessage: (data) => {
        console.log("[ElevenLabs] Message received:", data);
        const speaker = data.source === "user" || data.role === "user" ? "user" : "agent";
        const messageText = data.message || data.text || "";
        if (messageText.trim()) {
          appendVoiceTranscript(speaker, messageText);
          appendChatMessage(speaker === "agent" ? "bot" : "user", messageText);
        }
      },
      onError: (err) => {
        console.error("[ElevenLabs] Session error:", err);
        alert(`ElevenLabs Voice Error: ${err.message || err}`);
        endElevenLabsVoiceSession();
      },
    });

  } catch (error) {
    console.error("[ElevenLabs] Connection failed:", error);
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      alert("Microphone permission was denied. Please allow microphone access in your browser address bar.");
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      alert("No microphone device was found. Please connect a microphone.");
    } else {
      alert(`Could not start ElevenLabs voice session: ${error.message || error}`);
    }
    setVoiceState("disconnected");
    teardownVoiceMicrophone();
  }
}

async function endElevenLabsVoiceSession() {
  if (activeVoiceSession) {
    try {
      await activeVoiceSession.endSession();
    } catch (err) {
      console.warn("[ElevenLabs] End session notice:", err);
    } finally {
      activeVoiceSession = null;
    }
  }
  teardownVoiceMicrophone();
  setVoiceState("disconnected");
}

function toggleVoiceMute() {
  if (!voiceMediaStream) return;
  isVoiceMuted = !isVoiceMuted;
  voiceMediaStream.getAudioTracks().forEach((track) => {
    track.enabled = !isVoiceMuted;
  });
  if (isVoiceMuted) {
    if (voiceMuteLabel) voiceMuteLabel.textContent = "Unmute";
    voiceMuteBtn?.classList.add("btn-danger");
    console.log("[ElevenLabs Audio] Mic MUTED");
  } else {
    if (voiceMuteLabel) voiceMuteLabel.textContent = "Mute";
    voiceMuteBtn?.classList.remove("btn-danger");
    console.log("[ElevenLabs Audio] Mic UNMUTED");
  }
}

function appendVoiceTranscript(speaker, text) {
  if (!voiceTranscriptStream) return;
  const line = document.createElement("div");
  line.className = `transcript-line ${speaker}`;
  line.innerHTML = `<strong>${speaker === "agent" ? "Agent" : "You"}:</strong> ${escapeHTML(text)}`;
  voiceTranscriptStream.appendChild(line);
  voiceTranscriptStream.scrollTop = voiceTranscriptStream.scrollHeight;
}

// Voice Button Event Listeners
const handleToggleVoiceSession = () => {
  if (activeVoiceSession) {
    endElevenLabsVoiceSession();
  } else {
    startElevenLabsVoiceSession();
  }
};

if (voiceMicOrb) {
  voiceMicOrb.addEventListener("click", handleToggleVoiceSession);
}

if (voicePrimaryBtn) {
  voicePrimaryBtn.addEventListener("click", handleToggleVoiceSession);
}

if (voiceMuteBtn) {
  voiceMuteBtn.addEventListener("click", toggleVoiceMute);
}

// =========================================================================
// TEXT CHAT CONTROLLER & SMART LOCAL ASSISTANT
// =========================================================================

// Quick Prompt Chips in Chat Mode
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

    if (data.audioBase64) {
      playElevenLabsAudio(data.audioBase64);
    }
  } catch (error) {
    console.warn("Backend server connection notice:", error.message);
    removeTypingIndicator(loadingId);

    // Fallback directly to client-side smart assistant
    const localResponse = generateClientSideResponse(text, studentContext);
    appendChatMessage("bot", localResponse, detectedStudent);
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
  const autoFillBtn = msgEl.querySelector(".student-action-btn, .auto-populate-btn");
  if (autoFillBtn) {
    autoFillBtn.addEventListener("click", () => {
      try {
        const studentData = autoFillBtn.dataset.autofill 
          ? JSON.parse(autoFillBtn.dataset.autofill) 
          : detectedStudent;

        // Call official form populator
        populateStudentForm(studentData);

        // Scroll to and focus the form
        const fullNameEl = document.getElementById("full-name");
        if (fullNameEl) {
          fullNameEl.scrollIntoView({ behavior: "smooth", block: "center" });
          fullNameEl.focus();
        }

        // Show green confirmation message above submit button
        if (studentMessage) {
          showMessage(studentMessage, "Student details populated from AI assistant! Click 'Add record' to save.", "success");
        }
      } catch (err) {
        console.error("Auto-fill error:", err);
      }
    });
  }

  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTypingIndicator(id) {
  const typingEl = document.createElement("div");
  typingEl.id = id;
  typingEl.className = "chat-message bot typing";
  typingEl.innerHTML = `
    <div class="msg-content">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  chatMessages.appendChild(typingEl);
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

  // Favourite technology detection (matches keywords like Flutter, React, Python, etc.)
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

function formatChatMarkdown(rawText) {
  if (!rawText) return "";

  let clean = escapeHTML(rawText);

  // Bold text
  clean = clean.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Inline code
  clean = clean.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bullet items
  clean = clean.replace(/^[•\-\*]\s+(.*)$/gm, "<li>$1</li>");
  clean = clean.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");

  // Line breaks
  clean = clean.replace(/\n/g, "<br>");

  return clean;
}

/**
 * Audio Playback Helpers
 */
function playElevenLabsAudio(base64Data) {
  stopAllAudio();
  if (ttsAudio) {
    ttsAudio.src = `data:audio/mp3;base64,${base64Data}`;
    ttsAudio.play().catch((err) => console.warn("Audio autoplay notice:", err));
  }
}

function stopAllAudio() {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.currentTime = 0;
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

  return `I am your **University of Batangas Academic Assistant**. You can ask me how to manage records, explain CRUD or security rules, or click "Voice Mode" to speak aloud with our ElevenLabs Conversational AI RAGbot!`;
}
