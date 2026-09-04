/**
 * ============================================================================
 * UniGuide AI - ElevenLabs Conversational RAGbot Client Application
 * ============================================================================
 * 
 * Week 3 Project: Build a RAGbot Using ElevenLabs
 * Description: Client-side integration of ElevenLabs Conversational AI with
 * live microphone streaming, Web Audio visualizer, and dynamic visual states.
 */

// Import official ElevenLabs Conversational AI SDK from verified ESM CDN
import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@latest/+esm";

// ============================================================================
// 1. ELEVENLABS AGENT CONFIGURATION
// Replace the placeholder below with your Agent ID from the ElevenLabs Dashboard.
// Location: ElevenLabs Dashboard -> Conversational AI -> Your Agent -> Agent ID
// ============================================================================
const AGENT_ID = "agent_2001m1pjp56ve6gb66qvq3gp4rw8";

// Application State
let activeConversation = null;
let mediaStream = null;
let audioContext = null;
let analyserNode = null;
let animationFrameId = null;
let isMuted = false;
let messageCount = 1;

// DOM Elements
const elements = {
  // Orb & Buttons
  orbWrapper: document.getElementById("orb-wrapper"),
  micOrbBtn: document.getElementById("mic-orb-btn"),
  micIcon: document.getElementById("mic-icon"),
  hangupIcon: document.getElementById("hangup-icon"),
  primaryActionBtn: document.getElementById("primary-action-btn"),
  primaryBtnLabel: document.getElementById("primary-btn-label"),
  muteBtn: document.getElementById("mute-btn"),
  muteLabel: document.getElementById("mute-label"),
  clearTranscriptBtn: document.getElementById("clear-transcript-btn"),
  
  // Status & Feedback
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  feedbackHeadline: document.getElementById("feedback-headline"),
  feedbackSubtext: document.getElementById("feedback-subtext"),
  audioVisualizer: document.getElementById("audio-visualizer"),
  visualizerBars: document.querySelectorAll(".vbar"),
  
  // Transcript
  transcriptStream: document.getElementById("transcript-stream"),
  messageCountBadge: document.getElementById("message-count"),
  
  // Modal & Prompt Chips
  setupModal: document.getElementById("setup-modal"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  promptChips: document.querySelectorAll(".prompt-chip"),
};

// ============================================================================
// 2. UI STATE MANAGEMENT
// Visual Feedback States: "disconnected", "connecting", "listening", "speaking"
// ============================================================================

/**
 * Updates all visual UI elements to reflect the current conversation state.
 * @param {'disconnected' | 'connecting' | 'listening' | 'speaking'} state 
 */
function setConversationState(state) {
  console.log(`[RAGbot State Transition] -> ${state.toUpperCase()}`);

  // Reset all state classes from orb and status dot
  elements.orbWrapper.classList.remove("state-disconnected", "state-connecting", "state-listening", "state-speaking");
  elements.statusDot.classList.remove("disconnected", "connecting", "listening", "speaking");
  elements.audioVisualizer.classList.remove("idle", "listening", "speaking");

  // Apply new state class
  elements.orbWrapper.classList.add(`state-${state}`);
  elements.statusDot.classList.add(state);

  switch (state) {
    case "disconnected":
      elements.statusText.textContent = "Disconnected";
      elements.feedbackHeadline.textContent = "Ready to Connect";
      elements.feedbackSubtext.textContent = "Click the microphone above to start talking with the campus RAGbot.";
      elements.micIcon.classList.remove("hidden");
      elements.hangupIcon.classList.add("hidden");
      
      elements.primaryActionBtn.classList.remove("btn-danger");
      elements.primaryActionBtn.classList.add("btn-primary");
      elements.primaryBtnLabel.textContent = "Start Conversation";
      elements.primaryActionBtn.disabled = false;
      elements.micOrbBtn.disabled = false;
      
      elements.muteBtn.disabled = true;
      elements.audioVisualizer.classList.add("idle");
      stopAudioVisualizer();
      break;

    case "connecting":
      elements.statusText.textContent = "Connecting...";
      elements.feedbackHeadline.textContent = "Establishing Connection...";
      elements.feedbackSubtext.textContent = "Initializing secure WebRTC audio channel with ElevenLabs Agent...";
      
      elements.primaryActionBtn.disabled = true;
      elements.micOrbBtn.disabled = true;
      elements.muteBtn.disabled = true;
      break;

    case "listening":
      elements.statusText.textContent = "Listening...";
      elements.feedbackHeadline.textContent = "Listening to You";
      elements.feedbackSubtext.textContent = "Go ahead, ask any campus or academic question...";
      elements.micIcon.classList.add("hidden");
      elements.hangupIcon.classList.remove("hidden");

      elements.primaryActionBtn.classList.remove("btn-primary");
      elements.primaryActionBtn.classList.add("btn-danger");
      elements.primaryBtnLabel.textContent = "End Conversation";
      elements.primaryActionBtn.disabled = false;
      elements.micOrbBtn.disabled = false;

      elements.muteBtn.disabled = false;
      elements.audioVisualizer.classList.add("listening");
      startAudioVisualizer();
      break;

    case "speaking":
      elements.statusText.textContent = "Speaking...";
      elements.feedbackHeadline.textContent = "UniGuide is Speaking";
      elements.feedbackSubtext.textContent = "Synthesizing answer grounded in verified university documents...";
      elements.micIcon.classList.add("hidden");
      elements.hangupIcon.classList.remove("hidden");

      elements.primaryActionBtn.classList.remove("btn-primary");
      elements.primaryActionBtn.classList.add("btn-danger");
      elements.primaryBtnLabel.textContent = "End Conversation";
      elements.primaryActionBtn.disabled = false;
      elements.micOrbBtn.disabled = false;

      elements.muteBtn.disabled = false;
      elements.audioVisualizer.classList.add("speaking");
      break;
  }
}

// ============================================================================
// 3. MICROPHONE & AUDIO VISUALIZER (Web Audio API)
// ============================================================================

/**
 * Requests microphone permission and initializes local AudioContext for visual feedback.
 */
async function setupMicrophoneStream() {
  console.log("[Audio] Requesting microphone access...");
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Your browser does not support microphone audio capture (navigator.mediaDevices.getUserMedia).");
  }

  // Request high-quality speech audio stream
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  console.log("[Audio] Microphone permission granted.");

  // Initialize Web Audio API Analyser for real-time waveform visualization
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.8;
    sourceNode.connect(analyserNode);
  } catch (err) {
    console.warn("[Audio] Web Audio Analyser setup warning (non-fatal):", err);
  }

  return mediaStream;
}

/**
 * Starts continuous animation loop to pulse visualizer bars with microphone volume.
 */
function startAudioVisualizer() {
  if (!analyserNode) return;
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

  function renderFrame() {
    analyserNode.getByteFrequencyData(dataArray);
    
    // Calculate average volume level (0 - 255)
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    // Scale individual visualizer bars dynamically
    elements.visualizerBars.forEach((bar, index) => {
      const sample = dataArray[index % dataArray.length];
      const height = Math.max(6, Math.min(32, (sample / 255) * 36));
      bar.style.height = `${height}px`;
    });

    animationFrameId = requestAnimationFrame(renderFrame);
  }

  cancelAnimationFrame(animationFrameId);
  renderFrame();
}

/**
 * Stops audio analysis and restores default visualizer bar heights.
 */
function stopAudioVisualizer() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  elements.visualizerBars.forEach((bar) => {
    bar.style.height = "6px";
  });
}

/**
 * Cleans up media stream tracks and AudioContext.
 */
function teardownMicrophone() {
  stopAudioVisualizer();

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (audioContext && audioContext.state !== "closed") {
    audioContext.close().catch(console.error);
    audioContext = null;
  }
}

// ============================================================================
// 4. ELEVENLABS CONVERSATIONAL AI SESSION LIFECYCLE
// ============================================================================

/**
 * Initiates an ElevenLabs Conversational AI voice session.
 */
async function startSession() {
  // Check if user still has the placeholder AGENT_ID
  if (!AGENT_ID || AGENT_ID === "agent_2001m1pjp56ve6gb66qvq3gp4rw8" || AGENT_ID.trim() === "") {
    console.warn("[ElevenLabs] Placeholder AGENT_ID detected. Prompting user configuration.");
    elements.setupModal.showModal();
    return;
  }

  try {
    setConversationState("connecting");

    // 1. Request microphone permission
    await setupMicrophoneStream();

    console.log(`[ElevenLabs] Starting session for Agent ID: ${AGENT_ID}...`);

    // 2. Start Conversation Session via ElevenLabs SDK
    activeConversation = await Conversation.startSession({
      agentId: AGENT_ID,
      
      // Fired when connection is established
      onConnect: ({ conversationId }) => {
        console.log(`[ElevenLabs] Session connected! ID: ${conversationId}`);
        setConversationState("listening");
      },

      // Fired when session is ended
      onDisconnect: () => {
        console.log("[ElevenLabs] Session disconnected.");
        endSession();
      },

      // Fired when the agent toggles between speaking and listening
      onModeChange: ({ mode }) => {
        console.log(`[ElevenLabs] Mode changed: ${mode}`);
        if (mode === "speaking") {
          setConversationState("speaking");
        } else if (mode === "listening") {
          setConversationState("listening");
        }
      },

      // Fired when user or agent speech is transcribed
      onMessage: (data) => {
        console.log("[ElevenLabs] Transcript message received:", data);
        const speaker = data.source === "user" || data.role === "user" ? "user" : "agent";
        const messageText = data.message || data.text || "";
        if (messageText.trim()) {
          appendMessageToTranscript(speaker, messageText);
        }
      },

      // Fired on runtime errors
      onError: (err) => {
        console.error("[ElevenLabs] Conversation error:", err);
        alert(`ElevenLabs Session Error: ${err.message || err}`);
        endSession();
      },
    });

  } catch (error) {
    console.error("[ElevenLabs] Failed to start conversation:", error);
    
    // User-friendly error feedback for common issues
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      alert("Microphone Access Denied: Please allow microphone permissions in your browser to speak with the agent.");
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      alert("Microphone Not Found: Please ensure a microphone is connected to your device.");
    } else {
      alert(`Could not start conversation: ${error.message || error}`);
    }

    setConversationState("disconnected");
    teardownMicrophone();
  }
}

/**
 * Gracefully terminates the active ElevenLabs voice session.
 */
async function endSession() {
  if (activeConversation) {
    console.log("[ElevenLabs] Ending active conversation session...");
    try {
      await activeConversation.endSession();
    } catch (err) {
      console.warn("[ElevenLabs] Warning while ending session:", err);
    } finally {
      activeConversation = null;
    }
  }

  teardownMicrophone();
  setConversationState("disconnected");
}

/**
 * Toggles microphone mute during an active session.
 */
function toggleMute() {
  if (!mediaStream) return;
  
  isMuted = !isMuted;
  mediaStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });

  if (isMuted) {
    elements.muteLabel.textContent = "Unmute";
    elements.muteBtn.classList.add("btn-danger");
    console.log("[Audio] Microphone MUTED");
  } else {
    elements.muteLabel.textContent = "Mute";
    elements.muteBtn.classList.remove("btn-danger");
    console.log("[Audio] Microphone UNMUTED");
  }
}

// ============================================================================
// 5. TRANSCRIPT UI HELPERS
// ============================================================================

/**
 * Appends a message bubble to the live transcript chat stream.
 * @param {'user' | 'agent'} speaker 
 * @param {string} text 
 */
function appendMessageToTranscript(speaker, text) {
  const isAgent = speaker === "agent";
  const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const messageEl = document.createElement("div");
  messageEl.className = `chat-message ${isAgent ? "agent" : "user"}`;

  messageEl.innerHTML = `
    <div class="avatar">${isAgent ? "🤖" : "👤"}</div>
    <div class="bubble">
      <div class="message-meta">
        <span class="speaker-name">${isAgent ? "UniGuide AI" : "You"}</span>
        <span class="message-time">${timeString}</span>
      </div>
      <div class="message-body">${escapeHtml(text)}</div>
    </div>
  `;

  elements.transcriptStream.appendChild(messageEl);
  elements.transcriptStream.scrollTop = elements.transcriptStream.scrollHeight;

  messageCount += 1;
  elements.messageCountBadge.textContent = `${messageCount} ${messageCount === 1 ? "message" : "messages"}`;
}

/**
 * Clears the chat stream and resets to default greeting.
 */
function clearTranscript() {
  elements.transcriptStream.innerHTML = `
    <div class="chat-message agent">
      <div class="avatar">🤖</div>
      <div class="bubble">
        <div class="message-meta">
          <span class="speaker-name">UniGuide AI</span>
          <span class="message-time">Just now</span>
        </div>
        <div class="message-body">
          Transcript cleared. I'm ready to answer any questions grounded in the university knowledge base!
        </div>
      </div>
    </div>
  `;
  messageCount = 1;
  elements.messageCountBadge.textContent = "1 message";
}

/**
 * Simple HTML escaping to avoid XSS in transcript rendering.
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================================
// 6. EVENT LISTENERS & INITIALIZATION
// ============================================================================

function setupEventListeners() {
  // Main Orb Button & Primary Action Button
  const handleToggleSession = () => {
    if (activeConversation) {
      endSession();
    } else {
      startSession();
    }
  };

  elements.micOrbBtn.addEventListener("click", handleToggleSession);
  elements.primaryActionBtn.addEventListener("click", handleToggleSession);

  // Mute Button
  elements.muteBtn.addEventListener("click", toggleMute);

  // Clear Transcript Button
  elements.clearTranscriptBtn.addEventListener("click", clearTranscript);

  // Modal Close Button
  elements.closeModalBtn.addEventListener("click", () => {
    elements.setupModal.close();
  });

  // Prompt Chips: Clicking a suggestion shows user guidance
  elements.promptChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const promptText = chip.getAttribute("data-prompt");
      console.log(`[Prompt Suggestion Selected]: "${promptText}"`);
      if (!activeConversation) {
        alert(`Tip: Click "Start Conversation" and speak this prompt aloud to the bot:\n\n"${promptText}"`);
      }
    });
  });
}

// Initialize Application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("[RAGbot] Initializing UniGuide AI Web Application...");
  setupEventListeners();
  setConversationState("disconnected");
});
