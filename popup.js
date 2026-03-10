// popup.js — Orchestrator
// Manages API key, talks to content.js, calls Claude, renders results.

// Stores the connect message so the copy button can access it without
// digging through the DOM or encoding it into an HTML attribute.
let currentConnectMessage = "";

document.addEventListener("DOMContentLoaded", async function () {
  const analyzeBtn  = document.getElementById("analyzeBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const saveKeyBtn  = document.getElementById("saveKeyBtn");
  const apiKeyInput = document.getElementById("apiKey");
  const keyStatus   = document.getElementById("keyStatus");
  const resultDiv   = document.getElementById("result");
  const loadingDiv  = document.getElementById("loading");
  const apiKeyPanel = document.getElementById("apiKeyPanel");

  // ── On open: if key exists collapse the panel; otherwise open it ────────────
  const stored = await storageGet("apiKey");
  if (stored.apiKey) {
    apiKeyInput.value = stored.apiKey;
    setKeyStatus("Key saved ✓", "ok");
    // Panel stays closed (max-height: 0)
  } else {
    // No key yet — open the panel so user knows what to do
    apiKeyPanel.classList.add("open");
  }

  // ── Gear icon toggles the settings panel ───────────────────────────────────
  settingsBtn.addEventListener("click", function () {
    apiKeyPanel.classList.toggle("open");
  });

  // ── Save key ────────────────────────────────────────────────────────────────
  saveKeyBtn.addEventListener("click", async function () {
    const key = apiKeyInput.value.trim();
    if (!key) {
      setKeyStatus("Key cannot be empty.", "error");
      return;
    }
    if (!key.startsWith("sk-ant-")) {
      setKeyStatus("Invalid — should start with sk-ant-", "error");
      return;
    }
    await storageSet({ apiKey: key });
    setKeyStatus("Saved ✓", "ok");
    // Auto-close the panel after a short delay so user sees confirmation
    setTimeout(() => apiKeyPanel.classList.remove("open"), 900);
  });

  // ── Copy button — event delegation survives innerHTML rewrites ──────────────
  resultDiv.addEventListener("click", function (e) {
    const btn = e.target.closest("#copyBtn");
    if (!btn || !currentConnectMessage) return;

    navigator.clipboard.writeText(currentConnectMessage).then(() => {
      btn.textContent = "✓ Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "📋 Copy Message";
        btn.classList.remove("copied");
      }, 2000);
    }).catch(() => {
      btn.textContent = "Copy failed — try again";
      setTimeout(() => { btn.textContent = "📋 Copy Message"; }, 2000);
    });
  });

  // ── Main: Analyze button ────────────────────────────────────────────────────
  analyzeBtn.addEventListener("click", async function () {
    resultDiv.innerHTML = "";
    currentConnectMessage = "";
    setLoading(false);

    // 1. Check API key
    const { apiKey } = await storageGet("apiKey");
    if (!apiKey) {
      showError(resultDiv, "Please enter and save your Anthropic API key first (click ⚙️).");
      apiKeyPanel.classList.add("open");
      return;
    }

    // 2. Check URL
    const tabs = await queryTabs({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab.url || !activeTab.url.includes("linkedin.com/in/")) {
      showError(resultDiv, "Please navigate to a LinkedIn profile page (linkedin.com/in/...) first.");
      return;
    }

    // 3. Scrape profile via content.js
    let profile;
    try {
      profile = await sendTabMessage(activeTab.id, { action: "getProfileData" });
    } catch (e) {
      showError(resultDiv, "Cannot connect to the LinkedIn tab. Please refresh that tab and try again.");
      return;
    }

    if (!profile || !profile.name) {
      showError(resultDiv, "Could not read profile data. Make sure the page has fully loaded.");
      return;
    }

    // 4. Show scraped data immediately while AI thinks
    resultDiv.innerHTML = buildProfileCard(profile.name, profile.about, null);

    // 5. Call Claude
    setLoading(true);
    let aiResult;
    try {
      const rawText = await callClaude(apiKey, profile.name, profile.about);
      aiResult = parseAiResponse(rawText);
    } catch (e) {
      setLoading(false);
      showError(resultDiv, "Claude API error: " + e.message);
      return;
    }
    setLoading(false);

    // 6. Store message for copy button, then re-render the full card
    currentConnectMessage = aiResult.message || "";
    resultDiv.innerHTML = buildProfileCard(profile.name, profile.about, aiResult);
  });

  function setKeyStatus(message, type) {
    keyStatus.textContent = message;
    keyStatus.className = type === "ok" ? "status-ok" : "status-error";
  }

  function setLoading(show) {
    loadingDiv.classList.toggle("hidden", !show);
  }
});

// ── Claude API call ──────────────────────────────────────────────────────────
async function callClaude(apiKey, name, about) {
  const userPrompt =
    `Here is the LinkedIn profile of the person I want to connect with:\n\n` +
    `Name: ${name}\n` +
    `About: ${about}\n\n` +
    `任务：\n` +
    `1. 分析此人的 LinkedIn 简介，用一句话推测他的 DISC 性格倾向。\n` +
    `2. Analyze this LinkedIn profile. Generate a connection message.
STRICT RULES FOR THE MESSAGE:
Absolutely NO emojis.
Zero corporate buzzwords (do not use 'leverage', 'synergy', 'delve', 'align').
Write like a busy Senior BA sending a quick, casual, but polite message.
Max 2 sentences.
Pick ONE specific, interesting detail from their 'About' section to mention.
DO NOT use em dashes (—) or hyphens (-). Keep punctuation simple (only periods and commas). \n\n` +
    `请严格按以下 JSON 格式返回，不要有任何多余的文字或代码块标记：\n` +
    `{"disc":"你的一句话 DISC 判断","message":"英文破冰消息"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      msg = err.error?.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── Parse Claude's JSON response ─────────────────────────────────────────────
// Claude is asked to return {"disc":"...","message":"..."}.
// If it wraps in markdown code fences or fails, we fall back gracefully.
function parseAiResponse(rawText) {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.disc && parsed.message) return parsed;
  } catch (_) {}
  // Fallback: treat the whole text as the message
  return { disc: null, message: rawText };
}

// ── Build result card HTML ────────────────────────────────────────────────────
// aiData: null (still loading) | { disc, message } | { disc: null, message }
function buildProfileCard(name, about, aiData) {
  const metaSection =
    `<div class="profile-meta">` +
      `<div class="meta-name">👤 ${escapeHtml(name)}</div>` +
      `<div class="meta-about">${escapeHtml(about)}</div>` +
    `</div>`;

  if (!aiData) {
    return `<div class="profile-card">${metaSection}</div>`;
  }

  const discBlock = aiData.disc
    ? `<div class="disc-block">` +
        `<div class="block-label disc-label">🎯 DISC Personality</div>` +
        `<div class="disc-text">${escapeHtml(aiData.disc)}</div>` +
      `</div>`
    : "";

  const messageBlock =
    `<div class="message-block">` +
      `<div class="block-label msg-label">💬 Connect Message</div>` +
      `<div class="message-text">${escapeHtml(aiData.message)}</div>` +
      `<button id="copyBtn" class="btn-copy">📋 Copy Message</button>` +
    `</div>`;

  return `<div class="profile-card">${metaSection}${discBlock}${messageBlock}</div>`;
}

// ── Chrome API wrappers ───────────────────────────────────────────────────────
function queryTabs(queryInfo) {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get(key, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showError(container, message) {
  container.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(text || "")));
  return div.innerHTML;
}
