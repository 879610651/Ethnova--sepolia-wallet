/* ─────────────────────────────────────────────────────────────────
   chatbot.js  —  SepoliaWallet AI Chat Assistant
   Powered by Groq LLM (llama-3.3-70b-versatile)
   ───────────────────────────────────────────────────────────────── */

"use strict";

// ─── CONFIG ──────────────────────────────────────────────────────
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_TOKENS   = 700;
const MAX_HISTORY  = 20;
const STORAGE_KEY  = "sw_groq_api_key";

// ─── CHATBOT STATE ────────────────────────────────────────────────
const chatState = {
  isOpen:   false,
  isTyping: false,
  messages: [],
  apiKey:   localStorage.getItem(STORAGE_KEY) || "",
};

// ─── DOM REFS (resolved after DOMContentLoaded) ───────────────────
let fab, panel, messagesEl, inputEl, chatSendBtn, clearBtn, closeBtn,
    suggestsEl, unreadBadge, statusText, openIcon, closeIcon;

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  fab         = document.getElementById("chat-fab");
  panel       = document.getElementById("chat-panel");
  messagesEl  = document.getElementById("chat-messages");
  inputEl     = document.getElementById("chat-input");
  chatSendBtn = document.getElementById("chat-send-btn");
  clearBtn    = document.getElementById("chat-clear-btn");
  closeBtn    = document.getElementById("chat-close-btn");
  suggestsEl  = document.getElementById("chat-suggestions");
  unreadBadge = document.getElementById("chat-unread");
  statusText  = document.getElementById("chat-status-text");
  openIcon    = fab.querySelector(".open-icon");
  closeIcon   = fab.querySelector(".close-icon");

  injectApiKeyUI();
  renderWelcomeMessage();
  bindEvents();

  setTimeout(() => {
    if (!chatState.isOpen) unreadBadge.classList.remove("hidden");
  }, 3000);
});

// ─── API KEY BANNER ───────────────────────────────────────────────
function injectApiKeyUI() {
  const header = panel.querySelector(".chat-header");
  const banner = document.createElement("div");
  banner.id = "api-key-banner";
  banner.className = "api-key-banner" + (chatState.apiKey ? " hidden" : "");
  banner.innerHTML = `
    <div class="api-key-info">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
      Enter your Groq API key to enable AI chat
    </div>
    <div class="api-key-row">
      <input id="api-key-input" type="password" placeholder="gsk_…" autocomplete="off" spellcheck="false" />
      <button id="api-key-save" class="btn-save-key">Save</button>
    </div>
    <div class="api-key-hint">
      Get a free key at <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a>
      &nbsp;·&nbsp; Stored in your browser only.
    </div>`;
  header.insertAdjacentElement("afterend", banner);

  // Status pill inside header
  const pill = document.createElement("button");
  pill.id = "key-status-pill";
  pill.title = chatState.apiKey ? "API key saved — click to change" : "Add Groq API key";
  pill.className = "chat-icon-btn key-status-pill" + (chatState.apiKey ? " active" : "");
  pill.innerHTML = chatState.apiKey
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`;
  panel.querySelector(".chat-header-actions").prepend(pill);

  document.getElementById("api-key-save").addEventListener("click", saveApiKey);
  document.getElementById("api-key-input").addEventListener("keydown", e => {
    if (e.key === "Enter") saveApiKey();
  });
  pill.addEventListener("click", () => {
    document.getElementById("api-key-banner").classList.toggle("hidden");
  });
}

function saveApiKey() {
  const keyInput = document.getElementById("api-key-input");
  const key = keyInput.value.trim();
  if (!key.startsWith("gsk_")) {
    keyInput.style.borderColor = "var(--red)";
    keyInput.placeholder = "Must start with gsk_…";
    setTimeout(() => {
      keyInput.style.borderColor = "";
      keyInput.placeholder = "gsk_…";
    }, 2500);
    return;
  }
  chatState.apiKey = key;
  localStorage.setItem(STORAGE_KEY, key);
  keyInput.value = "";
  document.getElementById("api-key-banner").classList.add("hidden");

  const pill = document.getElementById("key-status-pill");
  pill.className = "chat-icon-btn key-status-pill active";
  pill.title = "API key saved — click to change";
  pill.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

  appendSystemMessage("✅ Groq API key saved — ask me anything!");
  inputEl.focus();
}

// ─── EVENTS ───────────────────────────────────────────────────────
function bindEvents() {
  fab.addEventListener("click", toggleChat);
  closeBtn.addEventListener("click", closeChat);
  clearBtn.addEventListener("click", clearChat);
  chatSendBtn.addEventListener("click", handleSend);

  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  inputEl.addEventListener("input", () => {
    autoResizeTextarea();
    chatSendBtn.disabled = inputEl.value.trim().length === 0;
  });

  suggestsEl.querySelectorAll(".suggestion-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      inputEl.value = chip.dataset.prompt;
      chatSendBtn.disabled = false;
      handleSend();
      suggestsEl.classList.add("hidden");
    });
  });
}

// ─── OPEN / CLOSE ─────────────────────────────────────────────────
function toggleChat() { chatState.isOpen ? closeChat() : openChat(); }

function openChat() {
  chatState.isOpen = true;
  unreadBadge.classList.add("hidden");
  openIcon.classList.add("hidden");
  closeIcon.classList.remove("hidden");
  panel.classList.remove("hidden");
  panel.classList.add("animating-in");
  panel.addEventListener("animationend", () => panel.classList.remove("animating-in"), { once: true });
  scrollToBottom();
  inputEl.focus();
}

function closeChat() {
  chatState.isOpen = false;
  openIcon.classList.remove("hidden");
  closeIcon.classList.add("hidden");
  panel.classList.add("animating-out");
  panel.addEventListener("animationend", () => {
    panel.classList.remove("animating-out");
    panel.classList.add("hidden");
  }, { once: true });
}

function clearChat() {
  chatState.messages = [];
  messagesEl.innerHTML = "";
  suggestsEl.classList.remove("hidden");
  renderWelcomeMessage();
}

// ─── WELCOME ──────────────────────────────────────────────────────
function renderWelcomeMessage() {
  appendAssistantMessage(
    `👋 Hi! I'm your **Wallet AI** — powered by Groq.\n\nI can help with your Sepolia wallet, gas fees, sending ETH, faucets, and Web3 questions.\n\n${chatState.apiKey ? "Ready! Ask me anything ⬇️" : "⚠️ Please enter your **Groq API key** (click the 🔑 icon above) to get started."}`,
    true
  );
}

// ─── SEND ─────────────────────────────────────────────────────────
async function handleSend() {
  const text = inputEl.value.trim();
  if (!text || chatState.isTyping) return;

  if (!chatState.apiKey) {
    document.getElementById("api-key-banner").classList.remove("hidden");
    document.getElementById("api-key-input").focus();
    appendErrorMessage("Please enter your Groq API key first (click the key icon in the header).");
    return;
  }

  inputEl.value = "";
  chatSendBtn.disabled = true;
  autoResizeTextarea();
  suggestsEl.classList.add("hidden");

  appendUserMessage(text);
  chatState.messages.push({ role: "user", content: text });
  if (chatState.messages.length > MAX_HISTORY * 2)
    chatState.messages = chatState.messages.slice(-MAX_HISTORY * 2);

  const typingId = showTypingIndicator();
  chatState.isTyping = true;
  setStatus("Thinking…");

  try {
    const reply = await callGroqAPI(chatState.messages);
    removeTypingIndicator(typingId);
    appendAssistantMessage(reply);
    chatState.messages.push({ role: "assistant", content: reply });
  } catch (err) {
    removeTypingIndicator(typingId);
    appendErrorMessage(err.message || "Something went wrong. Please try again.");
  } finally {
    chatState.isTyping = false;
    setStatus("Online · Sepolia Expert");
    inputEl.focus();
  }
}

// ─── GROQ API CALL (OpenAI-compatible) ───────────────────────────
async function callGroqAPI(messages) {
  const systemPrompt = buildSystemPrompt();

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${chatState.apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!response.ok) {
    let errBody = {};
    try { errBody = await response.json(); } catch {}

    if (response.status === 401) {
      // Invalidate stored key
      chatState.apiKey = "";
      localStorage.removeItem(STORAGE_KEY);
      const pill = document.getElementById("key-status-pill");
      if (pill) {
        pill.className = "chat-icon-btn key-status-pill";
        pill.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`;
      }
      document.getElementById("api-key-banner")?.classList.remove("hidden");
      throw new Error("Invalid API key (401). Please enter a valid Groq key (starts with gsk_).");
    }
    if (response.status === 429)
      throw new Error("Rate limit reached — please wait a moment and try again.");

    const msg = errBody?.error?.message || `API error ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("AI returned an empty response.");
  return text;
}

// ─── SYSTEM PROMPT WITH LIVE WALLET CONTEXT ───────────────────────
function buildSystemPrompt() {
  let walletCtx = "Wallet: not connected.";
  try {
    if (typeof state !== "undefined" && state.isConnected && state.account) {
      const txSent = state.txHistory?.filter(t => t.type === "sent").length ?? 0;
      const txRecv = state.txHistory?.filter(t => t.type === "received").length ?? 0;
      const recent = (state.txHistory || []).slice(0, 3)
        .map(t => `  • ${t.type === "sent" ? "Sent" : "Received"} ${parseFloat(t.amount).toFixed(4)} ETH (${t.status}) — ${new Date(t.timestamp).toLocaleString()}`)
        .join("\n") || "  None yet";
      walletCtx = [
        `Address: ${state.account}`,
        `Balance: ${parseFloat(state.balanceEth || 0).toFixed(6)} SepoliaETH`,
        `Network: Sepolia Testnet (Chain ID 11155111)`,
        `Sent: ${txSent} txns  |  Received: ${txRecv} txns`,
        `Recent:\n${recent}`,
        `Gas — Slow: ${state.gasEstimates?.slow ?? "?"}  Avg: ${state.gasEstimates?.avg ?? "?"}  Fast: ${state.gasEstimates?.fast ?? "?"} Gwei`,
      ].join("\n");
    }
  } catch {}

  return `You are "Wallet AI", a helpful Web3 assistant inside SepoliaWallet — a MetaMask-connected wallet for the Sepolia Testnet.

## Personality
- Friendly, concise, technically accurate
- Use **bold** for key terms, \`code\` for addresses/hashes/values
- Keep replies under 200 words unless more detail is asked
- Bullet points only when listing multiple items

## Role
- Help with wallet balance, transactions, gas fees, MetaMask, Sepolia faucets
- Explain Web3 concepts simply (many users are beginners)
- NEVER ask for or suggest sharing private keys or seed phrases
- NEVER suggest using mainnet ETH — this is Sepolia testnet only

## Live Wallet Data
${walletCtx}

## Useful Resources
- Faucet: https://sepoliafaucet.com  |  https://faucets.chain.link/sepolia
- Explorer: https://sepolia.etherscan.io
- MetaMask: https://metamask.io/download`;
}

// ─── UI HELPERS ───────────────────────────────────────────────────
function appendUserMessage(text) {
  const el = document.createElement("div");
  el.className = "chat-msg user";
  el.innerHTML = `
    <div>
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${fmtTime(Date.now())}</div>
    </div>
    <div class="msg-avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    </div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function appendAssistantMessage(text, isWelcome = false) {
  const el = document.createElement("div");
  el.className = "chat-msg assistant";
  el.innerHTML = `
    <div class="msg-avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </div>
    <div>
      <div class="msg-bubble">${renderMarkdown(text)}</div>
      ${isWelcome ? "" : `<div class="msg-time">${fmtTime(Date.now())}</div>`}
    </div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function appendErrorMessage(text) {
  const el = document.createElement("div");
  el.className = "chat-msg assistant";
  el.innerHTML = `
    <div class="msg-avatar" style="background:var(--red-dim)">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div>
      <div class="msg-bubble error">⚠️ ${escapeHtml(text)}</div>
      <div class="msg-time">${fmtTime(Date.now())}</div>
    </div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function appendSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "chat-msg system";
  el.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function showTypingIndicator() {
  const id = "typing-" + Date.now();
  const el = document.createElement("div");
  el.className = "chat-msg assistant typing";
  el.id = id;
  el.innerHTML = `
    <div class="msg-avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </div>
    <div class="msg-bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
  return id;
}

function removeTypingIndicator(id) { document.getElementById(id)?.remove(); }

function scrollToBottom() {
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

function setStatus(t) { if (statusText) statusText.textContent = t; }

function autoResizeTextarea() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
}

function renderMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1 ↗</a>')
    .replace(/^[-•]\s+(.+)$/gm, '<span style="display:flex;gap:6px;margin:2px 0"><span style="color:var(--purple-light);flex-shrink:0">•</span><span>$1</span></span>')
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}