const socket = io();
let activeConversationId = null;
let currentUserId = "agent_1"; // Mock for now, should come from auth

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  fetchConversations();
  fetchBusinessContext();

  // Socket listeners
  socket.on("new-message", (message) => {
    if (message.conversationId === activeConversationId) {
      appendMessage(message);
      scrollToBottom();
    }
    fetchConversations(); // Refresh list to update snippets and ordering
  });

  socket.on("user-typing", ({ senderName, isTyping }) => {
    const indicator = document.getElementById("typingIndicator");
    indicator.innerText = isTyping ? `${senderName} is typing...` : "";
  });

  // UI Events
  document.getElementById("sendBtn").onclick = sendMessage;
  document.getElementById("messageInput").onkeypress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
});

let currentBusinessData = null;

async function fetchBusinessContext() {
  try {
    const businessId = localStorage.getItem("activeBusinessId");
    const res = await fetch(`/api/business/current?businessId=${businessId}`);
    const r = await res.json();
    if (r.success && r.data) {
      currentBusinessData = r.data;
      const biz = r.data;
      document.getElementById("businessName").innerText = biz.name || "UNNAMED BUSINESS";
      if (biz.logoUrl) {
        document.getElementById("businessLogo").src = biz.logoUrl;
        document.getElementById("businessLogo").style.display = "block";
        document.getElementById("businessLogoPlaceholder").style.display = "none";
      }
    }
  } catch (e) { console.error("Failed to load business context"); }
}

let allConvos = [];

async function fetchConversations() {
  const businessId = localStorage.getItem("activeBusinessId");
  const res = await fetch(`/api/support/conversations?businessId=${businessId}`);
  const r = await res.json();
  if (r.success) {
    allConvos = r.data;
    renderConversationList(r.data);
  }
}

function renderConversationList(convos) {
  const container = document.getElementById("conversationList");
  container.innerHTML = convos.map(c => {
    const name = c.customer?.name || c.customer?.phone || 'Guest';
    const email = c.customer?.email || 'N/A';
    const phone = c.customer?.phone || 'N/A';
    const initials = name.substring(0, 2).toUpperCase();
    
    // Status logic (mock for now)
    let statusClass = 'status-online';
    if (c.status === 'escalated') statusClass = 'status-escalated';
    else if (c.aiHandled === false) statusClass = 'status-waiting';

    return `
      <div class="convo-item ${c.id === activeConversationId ? 'active' : ''}" 
           onclick="selectConversation('${c.id}')" 
           id="convo-${c.id}"
           data-email="${email}"
           data-phone="${phone}">
        <div class="item-avatar">
          ${initials}
          <div class="status-badge-mini ${statusClass}"></div>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
            <span class="convo-name" style="font-size: 0.85rem; font-weight: 700;">${name}</span>
            <span style="font-size: 0.65rem; color: var(--text-muted);">${new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <p style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" class="snippet">
            ${c.messages?.[0]?.content || 'No messages yet'}
          </p>
        </div>
      </div>
    `;
  }).join("");
}

function selectConversation(id) {
  activeConversationId = id;
  document.querySelectorAll(".convo-item").forEach(el => el.classList.remove("active"));
  const item = document.getElementById(`convo-${id}`);
  if (item) item.classList.add("active");

  // Join room
  socket.emit("join-conversation", { conversationId: id, userId: currentUserId });

  // Update header & details
  const name = item.querySelector(".convo-name").innerText;
  const email = item.dataset.email || 'N/A';
  const phone = item.dataset.phone || 'N/A';

  // Header update
  const activeName = document.getElementById("activeName");
  if (activeName) activeName.innerText = name;
  
  // Right sidebar updates
  const detailName = document.getElementById("detailName");
  if (detailName) detailName.innerText = name;

  const detailEmail = document.getElementById("detailEmail");
  if (detailEmail) detailEmail.innerText = email;

  const detailPhone = document.getElementById("detailPhone");
  if (detailPhone) detailPhone.innerText = phone;

  // Fetch messages
  fetchMessages(id);
}

async function fetchMessages(id) {
  const res = await fetch(`/api/support/conversations/${id}/messages`);
  const r = await res.json();
  if (r.success) {
    const container = document.getElementById("messageContainer");
    container.innerHTML = "";
    r.data.reverse().forEach(appendMessage);
    scrollToBottom();
  }
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const content = input.value.trim();
  if (!content || !activeConversationId) return;

  socket.emit("send-message", {
    conversationId: activeConversationId,
    senderId: currentUserId,
    senderType: "AGENT",
    content
  });

  input.value = "";
}

function appendMessage(m) {
  const container = document.getElementById("messageContainer");
  const isAgent = m.senderType === "AGENT";
  const isAI = m.senderType === "AI";
  
  if (isAI) {
    const div = document.createElement("div");
    div.className = "ai-interjection";
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <i data-lucide="bot" style="width: 14px;"></i>
        <span style="font-weight: 700;">AI Assistant</span>
      </div>
      ${m.content}
    `;
    container.appendChild(div);
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = `bubble-wrap ${isAgent ? 'support' : 'tenant'}`;
  
  wrap.innerHTML = `
    <div class="chat-bubble">
      ${m.content}
    </div>
    <span class="msg-meta">
      ${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  `;
  
  container.appendChild(wrap);
}

function scrollToBottom() {
  const container = document.getElementById("messageContainer");
  container.scrollTop = container.scrollHeight;
}

function updateSidebarItem(m) {
  const item = document.getElementById(`convo-${m.conversationId}`);
  if (item) {
    item.querySelector(".snippet").innerText = m.content;
  }
}

async function startNewChat() {
  if (!currentBusinessData) {
    alert("Business context not loaded yet. Please wait.");
    return;
  }

  const name = currentBusinessData.name;
  const email = currentBusinessData.ownerEmail || `support@${currentBusinessData.subdomain || 'nexton'}.ai`;

  try {
    const businessId = localStorage.getItem("activeBusinessId");
    const tenantId = localStorage.getItem("tenantId");
    const res = await fetch("/api/support/conversations/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, tenantId, businessId })
    });
    const r = await res.json();
    if (r.success) {
      fetchConversations();
      // Auto select the new conversation
      setTimeout(() => selectConversation(r.conversationId), 500);
    }
  } catch (e) { alert("Failed to start conversation"); }
}

function updateAIStatusDisplay(isHandled) {
  const pulse = document.getElementById("aiStatusPulse");
  const text = document.getElementById("aiStatusText");
  if (isHandled) {
    pulse.style.background = "var(--accent-green)";
    pulse.style.boxShadow = "0 0 10px var(--accent-green)";
    text.innerText = "ACTIVE";
    text.style.color = "var(--accent-green)";
  } else {
    pulse.style.background = "var(--text-muted)";
    pulse.style.boxShadow = "none";
    text.innerText = "PAUSED";
    text.style.color = "var(--text-muted)";
  }
}
