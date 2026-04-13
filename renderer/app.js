// ── State ───────────────────────────────────────────────────────────────────
let chats = [];        // { id, title, messages: [{role, content}] }
let activeChatId = null;
let isStreaming = false;

// ── DOM refs ────────────────────────────────────────────────────────────────
const messagesEl    = document.getElementById('messages');
const inputEl       = document.getElementById('message-input');
const sendBtn       = document.getElementById('send-btn');
const stopBtn       = document.getElementById('stop-btn');
const newChatBtn    = document.getElementById('new-chat-btn');
const chatListEl    = document.getElementById('chat-list');
const modelSelect   = document.getElementById('model-select');

// ── Chat management ─────────────────────────────────────────────────────────

function generateId() {
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
    el.textContent = chat.title;
    el.addEventListener('click', () => switchChat(chat.id));
    chatListEl.appendChild(el);
  }
}

function renderMessages() {
  messagesEl.innerHTML = '';
  const chat = getActiveChat();
  if (!chat) return;

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

function setStreaming(streaming) {
  isStreaming = streaming;
  sendBtn.classList.toggle('hidden', streaming);
  stopBtn.classList.toggle('hidden', !streaming);
  sendBtn.disabled = streaming;
  inputEl.disabled = streaming;
}

// ── Send message ────────────────────────────────────────────────────────────

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

  const chat = getActiveChat();
  if (!chat) return;

  // Add user message
  chat.messages.push({ role: 'user', content: text });
  appendMessageEl('user', text);
  scrollToBottom();

  // Update chat title from first message
  if (chat.messages.length === 1) {
    chat.title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
    renderChatList();
  }

  inputEl.value = '';
  autoResizeInput();
  setStreaming(true);

  // Create placeholder for AI response
  const aiBody = appendMessageEl('assistant', '');
  scrollToBottom();

  let fullResponse = '';

  try {
    const model = modelSelect.value;
    const response = await window.electronAPI.sendMessage(text, chat.id, 'claude', model);
    const reader = await response.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullResponse += value;
      aiBody.textContent = fullResponse;
      scrollToBottom();
    }
  } catch (err) {
    if (err.message && err.message.includes('aborted')) {
      fullResponse += '\n\n[Stopped]';
    } else {
      fullResponse = `[Error: ${err.message}]`;
    }
    aiBody.textContent = fullResponse;
  }

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
