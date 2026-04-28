// ── State ───────────────────────────────────────────────────────────────────
let chats = [];        // { id, title, messages: [{role, content}] }
let activeChatId = null;
let isStreaming = false;

// ── DOM refs ────────────────────────────────────────────────────────────────
const messagesEl        = document.getElementById('messages');
const emptyStateEl      = document.getElementById('empty-state');
const typingIndicatorEl = document.getElementById('typing-indicator');
const inputEl           = document.getElementById('message-input');
const sendBtn           = document.getElementById('send-btn');
const stopBtn           = document.getElementById('stop-btn');
const newChatBtn        = document.getElementById('new-chat-btn');
const chatListEl        = document.getElementById('chat-list');
const modelSelect       = document.getElementById('model-select');

// ── Chat management ─────────────────────────────────────────────────────────

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createChat() {
  const chat = {
    id: generateId(),
    title: 'New chat',
    messages: [],
  };
  chats.unshift(chat);
  activeChatId = chat.id;
  renderChatList();
  renderMessages();
  inputEl.focus();
}

function switchChat(chatId) {
  activeChatId = chatId;
  renderChatList();
  renderMessages();
}

function getActiveChat() {
  return chats.find(c => c.id === activeChatId);
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderChatList() {
  chatListEl.innerHTML = '';
  for (const chat of chats) {
    const el = document.createElement('div');
    el.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
    el.setAttribute('role', 'listitem');
    el.textContent = chat.title;
    el.addEventListener('click', () => switchChat(chat.id));
    chatListEl.appendChild(el);
  }
}

function renderMessages() {
  // Remove only message elements — leave DOM structure intact
  messagesEl.querySelectorAll('.message').forEach(el => el.remove());

  const chat = getActiveChat();

  if (!chat || chat.messages.length === 0) {
    emptyStateEl.classList.remove('hidden');
    messagesEl.classList.add('hidden');
    typingIndicatorEl.classList.add('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');
  messagesEl.classList.remove('hidden');

  for (const msg of chat.messages) {
    appendMessageEl(msg.role, msg.content);
  }
  scrollToBottom();
}

function appendMessageEl(role, content) {
  const el = document.createElement('div');
  el.className = `message ${role}`;

  const label = document.createElement('div');
  label.className = 'role-label';
  label.textContent = role === 'user' ? 'You' : 'Claude';
  el.appendChild(label);

  const body = document.createElement('div');
  body.textContent = content;
  el.appendChild(body);

  messagesEl.appendChild(el);
  return body;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Streaming UI helpers ────────────────────────────────────────────────────

function showMessages() {
  emptyStateEl.classList.add('hidden');
  messagesEl.classList.remove('hidden');
}

function setStreaming(streaming) {
  isStreaming = streaming;
  sendBtn.classList.toggle('hidden', streaming);
  stopBtn.classList.toggle('hidden', !streaming);
  sendBtn.disabled = streaming;
  inputEl.disabled = streaming;
  // Belt-and-suspenders: ensure indicator is hidden when streaming ends
  if (!streaming) {
    typingIndicatorEl.classList.add('hidden');
  }
}

// ── Send message ────────────────────────────────────────────────────────────

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

  const chat = getActiveChat();
  if (!chat) return;

  // Reveal the messages area (hides empty state)
  showMessages();

  // Add user message
  chat.messages.push({ role: 'user', content: text });
  appendMessageEl('user', text);
  scrollToBottom();

  // Update chat title from first message
  if (chat.messages.length === 1) {
    chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    renderChatList();
  }

  inputEl.value = '';
  autoResizeInput();
  setStreaming(true);

  // Show typing indicator while waiting for the first token
  typingIndicatorEl.classList.remove('hidden');
  scrollToBottom();

  let fullResponse = '';
  let aiBody = null;  // created lazily on first content chunk

  try {
    const model = modelSelect.value;
    const response = await window.electronAPI.sendMessage(text, chat.id, 'claude', model);
    const reader = await response.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullResponse += value;

      // First chunk: swap typing indicator for the assistant bubble
      if (!aiBody) {
        typingIndicatorEl.classList.add('hidden');
        aiBody = appendMessageEl('assistant', '');
      }

      aiBody.textContent = fullResponse;
      scrollToBottom();
    }
  } catch (err) {
    typingIndicatorEl.classList.add('hidden');
    if (err.message && err.message.includes('aborted')) {
      fullResponse += '\n\n[Stopped]';
    } else {
      fullResponse = `[Error: ${err.message}]`;
    }
    if (!aiBody) {
      aiBody = appendMessageEl('assistant', '');
    }
    aiBody.textContent = fullResponse;
  }

  // Ensure indicator is always cleaned up
  typingIndicatorEl.classList.add('hidden');

  if (fullResponse) {
    chat.messages.push({ role: 'assistant', content: fullResponse });
  }

  setStreaming(false);
  inputEl.focus();
}

async function stopMessage() {
  const chat = getActiveChat();
  if (!chat) return;
  window.electronAPI.abortCurrentRequest();
  await window.electronAPI.stopQuery(chat.id, 'claude');
}

// ── Auto-resize textarea ────────────────────────────────────────────────────

function autoResizeInput() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
}

// ── Event listeners ─────────────────────────────────────────────────────────

sendBtn.addEventListener('click', sendMessage);
stopBtn.addEventListener('click', stopMessage);
newChatBtn.addEventListener('click', createChat);

inputEl.addEventListener('input', autoResizeInput);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── Init ────────────────────────────────────────────────────────────────────
createChat();

// ── View switching (Chat ↔ Automation) ─────────────────────────────────────

const chatAreaEl       = document.getElementById('chat-area');
const automationAreaEl = document.getElementById('automation-area');
const settingsAreaEl   = document.getElementById('settings-area');
const viewTabs         = document.querySelectorAll('.view-tab');

const VIEW_ELS = { chat: chatAreaEl, automation: automationAreaEl, settings: settingsAreaEl };

function switchView(view) {
  Object.entries(VIEW_ELS).forEach(([v, el]) => el.classList.toggle('hidden', v !== view));
  viewTabs.forEach(t => {
    const active = t.dataset.view === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  if (view === 'automation') refreshAutomationStatus();
  if (view === 'settings')   refreshSettingsStatus();
}

viewTabs.forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));

// ── Automation UI ───────────────────────────────────────────────────────────

const autoStartBtn    = document.getElementById('auto-start-btn');
const autoStopBtn     = document.getElementById('auto-stop-btn');
const autoSaveBtn     = document.getElementById('auto-save-config-btn');
const autoStatusBadge = document.getElementById('auto-status-badge');
const autoDryrunBadge = document.getElementById('auto-dryrun-badge');
const rssUrlInput     = document.getElementById('rss-url-input');
const intervalSelect  = document.getElementById('interval-select');
const jobListEl       = document.getElementById('job-list');

let autoPollingId = null;

function getSelectedPlatforms() {
  return [...document.querySelectorAll('.platform-checkboxes input:checked')].map(cb => cb.value);
}

function setSelectedPlatforms(platforms) {
  document.querySelectorAll('.platform-checkboxes input').forEach(cb => {
    cb.checked = platforms.includes(cb.value);
  });
}

function applyStatus(status) {
  const running = status.isRunning;

  autoStatusBadge.textContent = running ? 'Running' : 'Stopped';
  autoStatusBadge.className = `badge ${running ? 'badge-running' : 'badge-stopped'}`;

  autoDryrunBadge.classList.toggle('hidden', !status.dryRun);

  autoStartBtn.classList.toggle('hidden', running);
  autoStopBtn.classList.toggle('hidden', !running);

  // Pulse active platform nodes while running
  document.querySelectorAll('.pipe-social').forEach(n => n.classList.toggle('active', running));

  if (status.config) {
    if (status.config.rssUrl)         rssUrlInput.value = status.config.rssUrl;
    if (status.config.pollIntervalMs) intervalSelect.value = String(status.config.pollIntervalMs);
    if (status.config.platforms)      setSelectedPlatforms(status.config.platforms);
  }

  renderJobHistory(status.jobHistory || []);
}

function renderJobHistory(jobs) {
  if (!jobs.length) {
    jobListEl.innerHTML = '<p class="feed-empty">No jobs yet. Start the automation to begin.</p>';
    return;
  }

  jobListEl.innerHTML = '';

  jobs.slice(0, 30).forEach(job => {
    const card = document.createElement('div');
    const safeStatus = escHtml(job.status || 'unknown');
    const safeType = job.type === 'cycle' ? 'cycle' : 'item';
    card.className = `job-card ${safeType}-card`;

    if (job.type === 'cycle') {
      card.innerHTML = `
        <div class="job-meta">
          <span class="job-type">Cycle</span>
          <span class="job-time">${escHtml(fmtTime(job.startedAt))}</span>
          <span class="job-badge">${safeStatus}</span>
        </div>
        <div class="job-body">Found ${escHtml(String(job.itemsFound ?? '?'))} items · Processed ${escHtml(String(job.itemsProcessed ?? 0))} new${job.error ? ` · Error: ${escHtml(job.error)}` : ''}</div>
      `;
    } else {
      const platformBits = Object.entries(job.platforms || {}).map(([p, info]) => {
        const safePlat = escHtml(p);
        const safeInfoStatus = escHtml(info.status || '');
        let details = '';
        if (info.content) {
          const pre = document.createElement('pre');
          pre.textContent = info.content;
          details = `<details><summary>Content</summary>${pre.outerHTML}</details>`;
        }
        return `<div class="platform-result"><span class="plat-name">${safePlat}</span><span class="plat-status">${safeInfoStatus}</span>${details}</div>`;
      }).join('');

      card.innerHTML = `
        <div class="job-meta">
          <span class="job-type">Article</span>
          <span class="job-time">${escHtml(fmtTime(job.startedAt))}</span>
          <span class="job-badge">${safeStatus}</span>
        </div>
        <div class="job-title">${escHtml(job.title || 'Untitled')}</div>
        ${job.summary ? `<div class="job-summary">${escHtml(job.summary)}</div>` : ''}
        ${platformBits}
      `;
    }

    jobListEl.appendChild(card);
  });
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshAutomationStatus() {
  try {
    const status = await window.electronAPI.automationStatus();
    applyStatus(status);
  } catch (e) {
    console.error('[AUTO UI] Status fetch failed:', e);
  }
}

function startPolling() {
  if (autoPollingId) return;
  autoPollingId = setInterval(refreshAutomationStatus, 4000);
}

function stopPolling() {
  clearInterval(autoPollingId);
  autoPollingId = null;
}

autoStartBtn.addEventListener('click', async () => {
  const config = {
    rssUrl:         rssUrlInput.value.trim() || undefined,
    pollIntervalMs: Number(intervalSelect.value),
    platforms:      getSelectedPlatforms(),
  };
  autoStartBtn.disabled = true;
  try {
    const result = await window.electronAPI.automationStart(config);
    applyStatus(await window.electronAPI.automationStatus());
    startPolling();
    if (result.dryRun) {
      appendSystemNote('Running in dry-run mode (no Composio key). Content will be generated but not posted.');
    }
  } finally {
    autoStartBtn.disabled = false;
  }
});

autoStopBtn.addEventListener('click', async () => {
  autoStopBtn.disabled = true;
  try {
    await window.electronAPI.automationStop();
    applyStatus(await window.electronAPI.automationStatus());
    stopPolling();
  } finally {
    autoStopBtn.disabled = false;
  }
});

autoSaveBtn.addEventListener('click', async () => {
  const config = {
    rssUrl:         rssUrlInput.value.trim() || undefined,
    pollIntervalMs: Number(intervalSelect.value),
    platforms:      getSelectedPlatforms(),
  };
  await window.electronAPI.automationConfigure(config);
  autoSaveBtn.textContent = 'Saved!';
  setTimeout(() => (autoSaveBtn.textContent = 'Save Config'), 1500);
});

function appendSystemNote(msg) {
  const note = document.createElement('p');
  note.className = 'system-note';
  note.textContent = msg;
  jobListEl.prepend(note);
}

// ── Settings UI ─────────────────────────────────────────────────────────────

const anthropicInput   = document.getElementById('anthropic-key-input');
const composioInput    = document.getElementById('composio-key-input');
const settingsSaveBtn  = document.getElementById('settings-save-btn');
const settingsSaveMsg  = document.getElementById('settings-save-msg');
const anthropicDot     = document.getElementById('anthropic-status-dot');
const composioDot      = document.getElementById('composio-status-dot');

function setDot(el, ok) {
  el.className = `status-dot ${ok ? 'dot-ok' : 'dot-missing'}`;
  el.title = ok ? 'Configured' : 'Not set';
}

async function refreshSettingsStatus() {
  try {
    const s = await window.electronAPI.settingsStatus();
    setDot(anthropicDot, s.anthropic);
    setDot(composioDot,  s.composio);
  } catch {}
}

settingsSaveBtn.addEventListener('click', async () => {
  settingsSaveBtn.disabled = true;
  settingsSaveMsg.classList.add('hidden');

  const anthropicKey = anthropicInput.value.trim();
  const composioKey  = composioInput.value.trim();

  if (!anthropicKey && !composioKey) {
    showSettingsMsg('Enter at least one key.', 'error');
    settingsSaveBtn.disabled = false;
    return;
  }

  try {
    const result = await window.electronAPI.settingsSaveKeys({ anthropicKey, composioKey });
    if (result.ok) {
      anthropicInput.value = '';
      composioInput.value  = '';
      setDot(anthropicDot, result.status.anthropic);
      setDot(composioDot,  result.status.composio);
      showSettingsMsg(`Saved: ${result.updated.join(', ')}`, 'ok');
    } else {
      showSettingsMsg('Save failed.', 'error');
    }
  } catch (e) {
    showSettingsMsg(`Error: ${e.message}`, 'error');
  } finally {
    settingsSaveBtn.disabled = false;
  }
});

function showSettingsMsg(text, type) {
  settingsSaveMsg.textContent = text;
  settingsSaveMsg.className = `settings-msg settings-msg-${type}`;
  settingsSaveMsg.classList.remove('hidden');
  setTimeout(() => settingsSaveMsg.classList.add('hidden'), 4000);
}

// Show/hide password toggle
document.querySelectorAll('.key-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const show  = input.type === 'password';
    input.type  = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
  });
});

// Load status on startup
refreshSettingsStatus();
