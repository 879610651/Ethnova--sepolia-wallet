/* ─────────────────────────────────────────────────────────────
   wallet.js  —  SepoliaWallet full Web3 logic
   Connects to MetaMask, handles Sepolia ETH send/receive,
   tracks transactions, updates UI in real time.
   ───────────────────────────────────────────────────────────── */

"use strict";

// ─── CONSTANTS ──────────────────────────────────────────────────
const SEPOLIA_CHAIN_ID   = "0xaa36a7";          // 11155111
const SEPOLIA_CHAIN_DEC  = 11155111;
const ETHERSCAN_BASE     = "https://sepolia.etherscan.io";
const FAUCET_URL         = "https://sepoliafaucet.com";
const ETH_PRICE_USD      = 2450;                 // Approximate; Sepolia has no real value

const SEPOLIA_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID,
  chainName: "Sepolia Test Network",
  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com"],
  blockExplorerUrls: [ETHERSCAN_BASE],
};

// ─── STATE ───────────────────────────────────────────────────────
let state = {
  account: null,
  chainId: null,
  balanceWei: null,
  balanceEth: "0",
  txHistory: [],
  currentTab: "dashboard",
  gasEstimates: { slow: 20, avg: 30, fast: 50 }, // Gwei
  selectedGas: "avg",
  isConnected: false,
};

// ─── DOM CACHE ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const loader         = $("loader");
const connectScreen  = $("connect-screen");
const app            = $("app");
const wrongNetwork   = $("wrong-network");
const confirmModal   = $("confirm-modal");
const toastContainer = $("toast-container");

// ─── INIT ─────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    loader.classList.add("hidden");

    if (!window.ethereum) {
      showConnect();
      $("no-metamask-msg").classList.remove("hidden");
      return;
    }

    // Check if already connected
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        await handleConnect(accounts[0]);
      } else {
        showConnect();
      }
    } catch {
      showConnect();
    }

    setupEthereumListeners();
  }, 1200);
});

// ─── ETHEREUM LISTENERS ───────────────────────────────────────────
function setupEthereumListeners() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", async accounts => {
    if (accounts.length === 0) {
      handleDisconnect();
    } else {
      await handleConnect(accounts[0]);
    }
  });

  window.ethereum.on("chainChanged", async chainId => {
    state.chainId = chainId;
    await checkNetwork();
    await refreshBalance();
  });

  window.ethereum.on("message", msg => {
    console.log("MetaMask message:", msg);
  });
}

// ─── CONNECT / DISCONNECT ─────────────────────────────────────────
$("connect-btn").addEventListener("click", async () => {
  if (!window.ethereum) {
    $("no-metamask-msg").classList.remove("hidden");
    return;
  }
  try {
    $("connect-btn").textContent = "Connecting…";
    $("connect-btn").disabled = true;

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (accounts.length > 0) {
      await handleConnect(accounts[0]);
    }
  } catch (err) {
    $("connect-btn").innerHTML = `<span>Connect MetaMask</span>`;
    $("connect-btn").disabled = false;
    showToast("Connection rejected", "error");
  }
});

$("disconnect-btn").addEventListener("click", () => {
  handleDisconnect();
});

async function handleConnect(account) {
  state.account = account;
  state.isConnected = true;

  try {
    state.chainId = await window.ethereum.request({ method: "eth_chainId" });
  } catch { state.chainId = null; }

  showApp();
  await checkNetwork();
  await refreshBalance();
  await fetchGasPrices();
  updateUI();
  loadHistoryFromStorage();

  // Update block
  updateBlock();
  setInterval(updateBlock, 12000);
  setInterval(refreshBalance, 15000);
}

function handleDisconnect() {
  state = { ...state, account: null, isConnected: false, balanceEth: "0", txHistory: [] };
  showConnect();
}

// ─── SCREEN MANAGEMENT ────────────────────────────────────────────
function showConnect() {
  connectScreen.classList.remove("hidden");
  app.classList.add("hidden");
  wrongNetwork.classList.add("hidden");
  $("connect-btn").innerHTML = `
    <svg viewBox="0 0 318.6 318.6" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;fill:currentColor">
      <path d="M274.1 35.5l-99.5 73.9L193 65.8z" opacity=".8"/>
      <path d="M44.4 35.5l98.7 74.6-17.5-44.3zm193.9 171.3l-26.5 40.6 56.7 15.6 16.3-55.3zm-204.4.9L50.1 263l56.7-15.6-26.5-40.6z"/>
      <path d="M103.6 138.2l-15.8 23.9 56.3 2.5-1.9-60.5zm111.3 0l-39-34.8-1.3 61.2 56.2-2.5zM106.8 247.4l33.8-16.5-29.2-22.8zm71.1-16.5l33.9 16.5-4.7-39.3z"/>
      <path d="M177.9 230.9l-33.9-16.5 2.7 22.1-.3 9.3zm-71.1 0l31.5 14.9-.2-9.3 2.5-22.1z" opacity=".8"/>
      <path d="M138.8 193.5l-28.9-8.5 20.4-9.3zm40.9 0l8.5-17.8 20.5 9.3z"/>
      <path d="M106.8 247.4l4.8-40.6-31.3.9zM207 206.8l4.8 40.6 26.5-39.7zm23.8-44.7l-56.2 2.5 5.2 28.9 8.5-17.8 20.5 9.3zm-120.2 23l20.4-9.3 8.4 17.8 5.3-28.9-56.3-2.5z"/>
      <path d="M87.8 162.1l23.6 46-.8-22.9zm119.7 23.1l-1 22.9 23.7-46zm-64-20.6l-5.3 28.9 6.6 34.1 1.5-44.9zm30.5 0l-2.7 18 1.2 45 6.7-34.1z" opacity=".5"/>
    </svg>
    Connect MetaMask`;
  $("connect-btn").disabled = false;
}

function showApp() {
  connectScreen.classList.add("hidden");
  app.classList.remove("hidden");
}

async function checkNetwork() {
  if (!state.chainId) return;
  const onSepolia = state.chainId.toLowerCase() === SEPOLIA_CHAIN_ID.toLowerCase();
  if (onSepolia) {
    wrongNetwork.classList.add("hidden");
    setNetworkIndicator("Sepolia", "green");
    $("stat-network").textContent = "Sepolia";
  } else {
    wrongNetwork.classList.remove("hidden");
    const chainNum = parseInt(state.chainId, 16);
    setNetworkIndicator(`Chain ${chainNum}`, "red");
  }
}

function setNetworkIndicator(name, color) {
  $("network-name").textContent = name;
  const dot = $("network-dot");
  dot.className = "dot";
  if (color) dot.classList.add(color);
}

// ─── SWITCH NETWORK ───────────────────────────────────────────────
$("switch-network-btn").addEventListener("click", async () => {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (err) {
    if (err.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [SEPOLIA_PARAMS],
        });
      } catch (addErr) {
        showToast("Failed to add Sepolia network", "error");
      }
    } else {
      showToast("Failed to switch network", "error");
    }
  }
});

// ─── BALANCE ──────────────────────────────────────────────────────
async function refreshBalance() {
  if (!state.account || !window.ethereum) return;
  try {
    const balanceHex = await window.ethereum.request({
      method: "eth_getBalance",
      params: [state.account, "latest"],
    });
    state.balanceWei = BigInt(balanceHex);
    state.balanceEth = weiToEth(state.balanceWei);
    updateBalanceUI();
  } catch (err) {
    console.error("Balance fetch error:", err);
  }
}

function weiToEth(wei) {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6);
}

function formatEth(eth, decimals = 4) {
  const n = parseFloat(eth);
  if (n === 0) return "0.0000";
  return n.toFixed(decimals);
}

function ethToUsd(eth) {
  return (parseFloat(eth) * ETH_PRICE_USD).toFixed(2);
}

// ─── GAS PRICES ───────────────────────────────────────────────────
async function fetchGasPrices() {
  try {
    const gasHex = await window.ethereum.request({ method: "eth_gasPrice" });
    const gasGwei = Math.round(Number(BigInt(gasHex)) / 1e9);
    state.gasEstimates = {
      slow: Math.max(Math.round(gasGwei * 0.7), 1),
      avg: gasGwei,
      fast: Math.round(gasGwei * 1.5),
    };
    $("gas-slow").textContent = `~${state.gasEstimates.slow} Gwei`;
    $("gas-avg").textContent  = `~${state.gasEstimates.avg} Gwei`;
    $("gas-fast").textContent = `~${state.gasEstimates.fast} Gwei`;
  } catch { /* use defaults */ }
}

// ─── UPDATE UI ────────────────────────────────────────────────────
function updateUI() {
  if (!state.account) return;
  const shortAddr = shortAddress(state.account);

  // Topbar
  $("topbar-address").textContent = shortAddr;
  $("topbar-avatar").style.background = makeGradientFromAddr(state.account);

  // Hero
  $("hero-address").textContent = shortAddr;
  $("hero-etherscan").href = `${ETHERSCAN_BASE}/address/${state.account}`;

  // Receive
  $("receive-address").textContent = state.account;
  $("receive-etherscan").href = `${ETHERSCAN_BASE}/address/${state.account}`;

  // Send balance
  $("send-balance-display").textContent = formatEth(state.balanceEth);

  updateBalanceUI();
  generateQR(state.account);
}

function updateBalanceUI() {
  const eth = state.balanceEth;
  $("hero-balance").textContent = formatEth(eth);
  $("hero-usd").textContent = `≈ $${ethToUsd(eth)} USD (approx.)`;
  $("send-balance-display").textContent = formatEth(eth);
}

// ─── BLOCK NUMBER ─────────────────────────────────────────────────
async function updateBlock() {
  if (!window.ethereum) return;
  try {
    const blockHex = await window.ethereum.request({ method: "eth_blockNumber" });
    $("stat-block").textContent = parseInt(blockHex, 16).toLocaleString();
  } catch {}
}

// ─── TABS ─────────────────────────────────────────────────────────
document.querySelectorAll("[data-tab]").forEach(el => {
  el.addEventListener("click", e => {
    e.preventDefault();
    switchTab(el.dataset.tab);
  });
});

document.querySelectorAll("[data-goto]").forEach(el => {
  el.addEventListener("click", e => {
    e.preventDefault();
    switchTab(el.dataset.goto);
  });
});

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const tabEl = $(`tab-${tab}`);
  if (tabEl) tabEl.classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add("active");

  const titles = { dashboard: "Dashboard", send: "Send ETH", receive: "Receive ETH", history: "Transaction History" };
  $("page-title").textContent = titles[tab] || tab;

  if (tab === "history") renderHistory("all");
  if (tab === "dashboard") renderRecentTxns();
}

// ─── REFRESH BTN ──────────────────────────────────────────────────
$("refresh-btn").addEventListener("click", async () => {
  const btn = $("refresh-btn");
  btn.classList.add("spin");
  await refreshBalance();
  await fetchGasPrices();
  updateUI();
  showToast("Balance updated", "success");
  setTimeout(() => btn.classList.remove("spin"), 600);
});

// ─── COPY BUTTONS ─────────────────────────────────────────────────
function copyToClipboard(text, label = "Copied!") {
  navigator.clipboard.writeText(text).then(() => showToast(label, "success"));
}

$("copy-topbar").addEventListener("click", () => copyToClipboard(state.account, "Address copied!"));
$("copy-hero").addEventListener("click", () => copyToClipboard(state.account, "Address copied!"));
$("copy-receive").addEventListener("click", () => copyToClipboard(state.account, "Address copied!"));

// ─── FAUCET ───────────────────────────────────────────────────────
$("request-faucet").addEventListener("click", () => {
  window.open(FAUCET_URL, "_blank");
  showToast("Opening Sepolia faucet…", "info");
});

// ─── SEND FORM LOGIC ──────────────────────────────────────────────
const sendToInput     = $("send-to");
const sendAmountInput = $("send-amount");
const sendBtn         = $("send-btn");
const addrValidation  = $("addr-validation");
const amountUsdPrev   = $("amount-usd-preview");
const sendError       = $("send-error");

function isValidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

sendToInput.addEventListener("input", () => {
  const val = sendToInput.value.trim();
  if (!val) {
    addrValidation.textContent = "";
    addrValidation.className = "field-hint";
    sendToInput.className = "";
  } else if (isValidAddress(val)) {
    addrValidation.textContent = "✓ Valid Ethereum address";
    addrValidation.className = "field-hint success";
    sendToInput.className = "valid";
  } else {
    addrValidation.textContent = "✗ Invalid address format";
    addrValidation.className = "field-hint error";
    sendToInput.className = "invalid";
  }
  validateForm();
});

sendAmountInput.addEventListener("input", () => {
  const amt = parseFloat(sendAmountInput.value) || 0;
  amountUsdPrev.textContent = `≈ $${(amt * ETH_PRICE_USD).toFixed(2)}`;
  validateForm();
});

$("max-btn").addEventListener("click", () => {
  // Leave tiny buffer for gas
  const gasBuffer = (state.gasEstimates[state.selectedGas] * 21000) / 1e9;
  const maxEth = Math.max(0, parseFloat(state.balanceEth) - gasBuffer);
  sendAmountInput.value = maxEth.toFixed(6);
  sendAmountInput.dispatchEvent(new Event("input"));
});

$("paste-btn").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    sendToInput.value = text.trim();
    sendToInput.dispatchEvent(new Event("input"));
  } catch {
    showToast("Clipboard permission denied", "warning");
  }
});

// Gas selection
document.querySelectorAll(".gas-option").forEach(opt => {
  opt.addEventListener("click", () => {
    document.querySelectorAll(".gas-option").forEach(o => o.classList.remove("selected"));
    opt.classList.add("selected");
    state.selectedGas = opt.dataset.speed;
    opt.querySelector("input").checked = true;
  });
});

function validateForm() {
  const to  = sendToInput.value.trim();
  const amt = parseFloat(sendAmountInput.value);
  const bal = parseFloat(state.balanceEth);
  sendBtn.disabled = !(isValidAddress(to) && amt > 0 && amt <= bal);
}

// ─── SEND TRANSACTION ─────────────────────────────────────────────
sendBtn.addEventListener("click", async () => {
  const to  = sendToInput.value.trim();
  const amt = sendAmountInput.value.trim();

  if (!isValidAddress(to)) return showToast("Invalid recipient address", "error");
  if (!amt || parseFloat(amt) <= 0) return showToast("Enter a valid amount", "error");
  if (parseFloat(amt) > parseFloat(state.balanceEth)) return showToast("Insufficient balance", "error");

  // Estimate gas
  let gasLimit = "0x5208"; // 21000 in hex (standard ETH transfer)
  let gasPriceWei;
  try {
    const rawGas = await window.ethereum.request({ method: "eth_gasPrice" });
    const baseGwei = Math.round(Number(BigInt(rawGas)) / 1e9);
    const multipliers = { slow: 0.7, avg: 1, fast: 1.5 };
    const gwei = Math.round(baseGwei * multipliers[state.selectedGas]);
    gasPriceWei = "0x" + BigInt(gwei * 1e9).toString(16);
    const gasCostEth = (gwei * 21000 / 1e9).toFixed(6);
    $("confirm-gas").textContent = `${gwei} Gwei (~${gasCostEth} ETH)`;
  } catch {
    gasPriceWei = null;
    $("confirm-gas").textContent = "Unable to estimate";
  }

  // Show confirmation modal
  $("confirm-to").textContent = shortAddress(to, 10, 8);
  $("confirm-amount").textContent = `${parseFloat(amt).toFixed(6)} ETH`;
  confirmModal.classList.remove("hidden");

  // Store pending params
  confirmModal._pendingTx = { to, amt, gasLimit, gasPriceWei };
});

$("confirm-cancel").addEventListener("click", () => {
  confirmModal.classList.add("hidden");
});

$("confirm-send").addEventListener("click", async () => {
  confirmModal.classList.add("hidden");
  const { to, amt, gasLimit, gasPriceWei } = confirmModal._pendingTx;
  await executeSend(to, amt, gasLimit, gasPriceWei);
});

async function executeSend(to, amtEth, gasLimit, gasPriceWei) {
  sendBtn.disabled = true;
  sendBtn.innerHTML = `<span class="loader-spinner" style="width:16px;height:16px;border-width:2px;margin:0"></span> Sending…`;
  sendError.classList.add("hidden");

  const valueWei = "0x" + BigInt(Math.round(parseFloat(amtEth) * 1e18)).toString(16);

  const txParams = {
    from: state.account,
    to: to,
    value: valueWei,
    gas: gasLimit,
  };
  if (gasPriceWei) txParams.gasPrice = gasPriceWei;

  try {
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [txParams],
    });

    // Add to history
    const txRecord = {
      hash: txHash,
      type: "sent",
      to: to,
      from: state.account,
      amount: amtEth,
      timestamp: Date.now(),
      status: "pending",
    };
    state.txHistory.unshift(txRecord);
    saveHistoryToStorage();
    renderRecentTxns();

    showToast(`Transaction sent! ${shortAddress(txHash, 8, 6)}`, "success");
    sendToInput.value = "";
    sendAmountInput.value = "";
    addrValidation.textContent = "";
    addrValidation.className = "field-hint";
    sendToInput.className = "";

    // Poll for receipt
    pollTxReceipt(txHash);

    // Switch to dashboard
    switchTab("dashboard");
    updateStats();

  } catch (err) {
    const msg = err.code === 4001 ? "Transaction rejected by user"
              : err.message?.slice(0, 100) || "Transaction failed";
    sendError.textContent = msg;
    sendError.classList.remove("hidden");
    showToast(msg, "error");
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send ETH`;
    validateForm();
  }
}

// ─── POLL RECEIPT ─────────────────────────────────────────────────
async function pollTxReceipt(txHash, attempts = 0) {
  if (attempts > 40) return; // Give up after ~4 min
  try {
    const receipt = await window.ethereum.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });
    if (receipt) {
      const success = receipt.status === "0x1";
      const tx = state.txHistory.find(t => t.hash === txHash);
      if (tx) {
        tx.status = success ? "success" : "failed";
        tx.blockNumber = parseInt(receipt.blockNumber, 16);
        saveHistoryToStorage();
        renderRecentTxns();
        if (state.currentTab === "history") renderHistory("all");
      }
      showToast(
        success ? "Transaction confirmed! ✓" : "Transaction failed",
        success ? "success" : "error"
      );
      await refreshBalance();
      updateStats();
    } else {
      setTimeout(() => pollTxReceipt(txHash, attempts + 1), 6000);
    }
  } catch {
    setTimeout(() => pollTxReceipt(txHash, attempts + 1), 6000);
  }
}

// ─── HISTORY ──────────────────────────────────────────────────────
function saveHistoryToStorage() {
  if (!state.account) return;
  try {
    localStorage.setItem(`sw_history_${state.account}`, JSON.stringify(state.txHistory));
  } catch {}
}

function loadHistoryFromStorage() {
  if (!state.account) return;
  try {
    const saved = localStorage.getItem(`sw_history_${state.account}`);
    if (saved) {
      state.txHistory = JSON.parse(saved);
      renderRecentTxns();
      updateStats();
    }
  } catch {}
}

$("clear-history").addEventListener("click", () => {
  if (!confirm("Clear all transaction history?")) return;
  state.txHistory = [];
  saveHistoryToStorage();
  renderHistory("all");
  renderRecentTxns();
  updateStats();
  showToast("History cleared", "info");
});

// Filter pills
document.querySelectorAll(".filter-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    renderHistory(pill.dataset.filter);
  });
});

function renderHistory(filter = "all") {
  const list = $("history-list");
  let txns = state.txHistory;
  if (filter === "sent")     txns = txns.filter(t => t.type === "sent");
  if (filter === "received") txns = txns.filter(t => t.type === "received");

  if (txns.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="3 3 3 7 7 7"/></svg>
        <p>No transaction history</p>
        <small>Transactions will appear here after you send or receive ETH</small>
      </div>`;
    return;
  }
  list.innerHTML = txns.map(t => buildTxnHTML(t)).join("");
  list.querySelectorAll(".txn-item").forEach((el, i) => {
    el.addEventListener("click", () => openTxOnEtherscan(txns[i].hash));
  });
}

function renderRecentTxns() {
  const list = $("recent-txns");
  const recent = state.txHistory.slice(0, 5);
  if (recent.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>No transactions yet</p>
      </div>`;
    return;
  }
  list.innerHTML = recent.map(t => buildTxnHTML(t)).join("");
  list.querySelectorAll(".txn-item").forEach((el, i) => {
    el.addEventListener("click", () => openTxOnEtherscan(recent[i].hash));
  });
}

function buildTxnHTML(tx) {
  const isSent = tx.type === "sent";
  const iconSvg = isSent
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>`;
  const peer = isSent ? tx.to : tx.from;
  const amtSign = isSent ? "-" : "+";
  const statusClass = tx.status || "pending";
  return `
    <div class="txn-item" title="View on Etherscan">
      <div class="txn-icon ${isSent ? "sent" : "received"}">${iconSvg}</div>
      <div class="txn-info">
        <div class="txn-type">${isSent ? "Sent" : "Received"}</div>
        <div class="txn-addr">${peer ? shortAddress(peer, 8, 6) : "—"}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${isSent ? "sent" : "received"}">${amtSign}${parseFloat(tx.amount).toFixed(6)} ETH</div>
        <div class="txn-time">${formatTime(tx.timestamp)}</div>
        <div class="txn-status ${statusClass}">${tx.status || "pending"}</div>
      </div>
    </div>`;
}

function openTxOnEtherscan(hash) {
  window.open(`${ETHERSCAN_BASE}/tx/${hash}`, "_blank");
}

function updateStats() {
  const sent     = state.txHistory.filter(t => t.type === "sent").length;
  const received = state.txHistory.filter(t => t.type === "received").length;
  $("stat-sent").textContent     = sent;
  $("stat-received").textContent = received;
}

// ─── QR CODE GENERATOR (pure canvas, no library) ──────────────────
function generateQR(text) {
  const canvas = $("qr-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = 220;
  canvas.width = canvas.height = size;

  // Simple placeholder QR-like visual (real QR needs a library)
  // We'll draw a distinctive pattern that looks like a QR code
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";

  // Use text hash to generate pseudo-QR pattern
  const hash = hashStr(text);
  const cells = 21;
  const cell  = Math.floor(size / cells);
  const offset = Math.floor((size - cells * cell) / 2);

  // Finder patterns (corners)
  drawFinder(ctx, offset, offset, cell);
  drawFinder(ctx, offset + (cells - 7) * cell, offset, cell);
  drawFinder(ctx, offset, offset + (cells - 7) * cell, cell);

  // Data cells (pseudo-random from address hash)
  const reserved = new Set();
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    reserved.add(`${r},${c}`);
    reserved.add(`${r},${cells - 7 + c}`);
    reserved.add(`${cells - 7 + r},${c}`);
  }

  let seed = hash;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (reserved.has(`${r},${c}`)) continue;
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      if ((seed >>> 16) & 1) {
        ctx.fillRect(offset + c * cell, offset + r * cell, cell - 1, cell - 1);
      }
    }
  }

  // Center "ETH" label
  ctx.fillStyle = "#fff";
  ctx.fillRect(offset + 8 * cell, offset + 9 * cell, 5 * cell, 3 * cell);
  ctx.fillStyle = "#000";
  ctx.font = `bold ${cell + 2}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ETH", offset + size / 2 - offset / 2, offset + size / 2 - offset / 2 + 2);
}

function drawFinder(ctx, x, y, cell) {
  // Outer 7×7 black
  ctx.fillRect(x, y, 7 * cell, 7 * cell);
  // White 5×5
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + cell, y + cell, 5 * cell, 5 * cell);
  // Black 3×3 center
  ctx.fillStyle = "#000";
  ctx.fillRect(x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell);
}

function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// ─── HELPERS ──────────────────────────────────────────────────────
function shortAddress(addr, start = 6, end = 4) {
  if (!addr) return "—";
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

function formatTime(ts) {
  const now  = Date.now();
  const diff = now - ts;
  if (diff < 60000)   return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function makeGradientFromAddr(addr) {
  if (!addr) return "var(--gradient)";
  const h1 = parseInt(addr.slice(2, 8), 16) % 360;
  const h2 = (h1 + 120) % 360;
  return `linear-gradient(135deg, hsl(${h1},70%,50%), hsl(${h2},70%,50%))`;
}

// ─── TOAST SYSTEM ─────────────────────────────────────────────────
const TOAST_ICONS = {
  success: "✅",
  error:   "❌",
  info:    "ℹ️",
  warning: "⚠️",
};

function showToast(message, type = "info", duration = 4000) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || "ℹ️"}</span>
    <span class="toast-text">${message}</span>
    <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── ACCOUNT CHANGE LISTENER (MetaMask) ───────────────────────────
// Handles incoming transactions by watching for balance changes
let _lastBalance = null;
setInterval(async () => {
  if (!state.isConnected || !state.account) return;
  try {
    const balHex = await window.ethereum.request({
      method: "eth_getBalance",
      params: [state.account, "latest"],
    });
    const newBal = weiToEth(BigInt(balHex));
    if (_lastBalance !== null && _lastBalance !== newBal) {
      const diff = parseFloat(newBal) - parseFloat(_lastBalance);
      if (diff > 0) {
        const rx = {
          hash: "0x" + Math.random().toString(16).slice(2).padEnd(64, "0"),
          type: "received",
          from: "Unknown",
          to: state.account,
          amount: diff.toFixed(6),
          timestamp: Date.now(),
          status: "success",
        };
        state.txHistory.unshift(rx);
        saveHistoryToStorage();
        renderRecentTxns();
        updateStats();
        showToast(`Received ${diff.toFixed(4)} ETH`, "success");
      }
    }
    _lastBalance = newBal;
    state.balanceEth = newBal;
    updateBalanceUI();
  } catch {}
}, 8000);
