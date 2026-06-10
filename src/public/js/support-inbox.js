// Initialize Socket with Authentication
const token = localStorage.getItem("token") || localStorage.getItem("accessToken");
const socket = io({
  auth: { token }
});

let activeConversationId = null;
let currentUserId = null;
let currentTenantId = null;

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  currentUserId = user.id;
  currentTenantId = user.tenantId;

  loadConversations();
  setupSocketListeners();
  
  const staffForm = document.getElementById("createStaffForm");
  if (staffForm) staffForm.onsubmit = handleCreateStaff;
});

function setupSocketListeners() {
  socket.on("new-message", (message) => {
    if (message.conversationId === activeConversationId) {
      appendChatMessage(message);
      scrollToBottom("chatMessages");
    }
    loadConversations();
  });

  socket.on("ticket-activity", (data) => {
    console.log("[Support] Ticket Activity:", data);
    // Refresh ticket list if on that view
    if (document.getElementById("ticketsView").classList.contains("active")) {
      loadTickets();
    }
    // Show notification toast if needed
  });

  socket.on("presence-update", ({ userId, status }) => {
    console.log(`[Support] Presence: ${userId} is now ${status}`);
    // Update staff list UI if visible
    if (document.getElementById("staffView").classList.contains("active")) {
      loadStaff();
    }
  });

  socket.on("user-typing", ({ userId, isTyping }) => {
    const indicator = document.getElementById("activeConvoName");
    if (isTyping) {
      indicator.dataset.originalText = indicator.innerText;
      indicator.innerText = "Tenant is typing...";
    } else if (indicator.dataset.originalText) {
      indicator.innerText = indicator.dataset.originalText;
    }
  });

  socket.on("metrics-pulse", (metrics) => {
    console.log("[Support] Live Metrics Pulse Received");
    updateDashboardUI(metrics);
  });
}

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────

async function loadConversations() {
  try {
    const res = await fetch("/api/support/conversations");
    const r = await res.json();
    if (r.success) renderConversationList(r.data);
  } catch (e) { console.error("Failed to load conversations", e); }
}

function renderConversationList(convos) {
  const container = document.getElementById("convoList");
  if (!container) return;

  container.innerHTML = convos.map(c => {
    const name = c.customer?.name || "Anonymous Tenant";
    const snippet = c.messages?.[0]?.body || "No messages yet";
    const initials = name.substring(0, 2).toUpperCase();
    
    return `
      <div class="convo-item ${c.id === activeConversationId ? 'active' : ''} animate-entrance" onclick="selectConversation('${c.id}', '${name}')">
        <div class="avatar">${initials}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span style="font-weight: 900; font-size: 1rem; color: white;">${name}</span>
            <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">${formatTime(c.updatedAt)}</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${snippet}</p>
        </div>
      </div>
    `;
  }).join("");
}

async function selectConversation(id, name) {
  activeConversationId = id;
  document.getElementById("activeConvoName").innerText = name;
  const statusEl = document.getElementById("activeConvoStatus");
  if (statusEl) statusEl.innerText = "Direct Neural Link Synchronized";
  
  document.querySelectorAll(".convo-item").forEach(el => el.classList.remove("active"));
  
  socket.emit("join-conversation", { conversationId: id });
  
  const res = await fetch(`/api/support/conversations/${id}/messages`);
  const r = await res.json();
  if (r.success) {
    const container = document.getElementById("chatMessages");
    container.innerHTML = "";
    r.data.forEach(appendChatMessage);
    scrollToBottom("chatMessages");
  }
}

function appendChatMessage(m) {
  const container = document.getElementById("chatMessages");
  if (!container) return;
  const isAgent = m.senderType === "AGENT";
  const div = document.createElement("div");
  div.className = `bubble ${isAgent ? 'agent' : 'tenant'} animate-entrance`;
  div.innerText = m.body;
  container.appendChild(div);
  scrollToBottom("chatMessages");
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const body = input.value.trim();
  if (!body || !activeConversationId) return;

  socket.emit("send-message", {
    conversationId: activeConversationId,
    body,
    senderType: "AGENT"
  });
  input.value = "";
}

// ─── TICKETS ──────────────────────────────────────────────────────────────────

async function loadTickets() {
  try {
    const res = await fetch("/api/support/tickets");
    const r = await res.json();
    if (r.success) renderTicketList(r.data);
  } catch (e) { console.error("Failed to load tickets", e); }
}

function renderTicketList(tickets) {
  const container = document.getElementById("ticketList");
  if (!container) return;
  container.innerHTML = tickets.map(t => {
    const statusBadge = t.status === 'open' ? 'badge-open' : (t.status === 'escalated' ? 'badge-urgent' : 'badge');
    return `
      <tr class="table-row-elite" onclick="viewTicket('${t.id}')">
        <td style="font-family: monospace; color: var(--primary); font-weight: 800; opacity: 0.8;">#${t.id.substring(0, 8).toUpperCase()}</td>
        <td><span class="badge ${statusBadge}">${t.status}</span></td>
        <td style="font-weight: 700; color: white;">${t.subject}</td>
        <td>${t.customer?.name || "Guest Tenant"}</td>
        <td><span style="font-weight: 600; color: var(--text-muted);">${t.assignedTo?.email || "Protocol Unassigned"}</span></td>
        <td style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${formatTime(t.updatedAt)}</td>
      </tr>
    `;
  }).join("");
}

// ─── STAFF ───────────────────────────────────────────────────────────────────

async function loadStaff() {
  try {
    const res = await fetch("/api/auth/staff");
    const r = await res.json();
    if (r.success) renderStaffList(r.data);
  } catch (e) { console.error("Failed to load staff", e); }
}

function renderStaffList(staff) {
  const container = document.getElementById("staffList");
  if (!container) return;
  container.innerHTML = staff.map(s => {
    const initials = s.email.substring(0, 2).toUpperCase();
    return `
      <tr class="table-row-elite">
        <td>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(0, 242, 255, 0.1); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 900; color: var(--primary); border: 1px solid rgba(0, 242, 255, 0.2);">
              ${initials}
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.95rem; color: white;">${s.email}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">Neural Link: Active</div>
            </div>
          </div>
        </td>
        <td><span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">Operation Control</span></td>
        <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div class="pulse-online"></div>
                <span style="color: #10b981; font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">Synchronized</span>
            </div>
        </td>
        <td><span class="badge" style="background: rgba(255,255,255,0.05); color: ${getRoleColor(s.role)}; border: 1px solid ${getRoleColor(s.role)}33; font-weight: 900; font-size: 0.65rem;">${s.role}</span></td>
        <td>
          <button style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: white; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--glass-border)'" onclick="manageStaff('${s.id}')">
            <i data-lucide="shield" style="width: 14px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");
  if (window.lucide) lucide.createIcons();
}

function getRoleColor(role) {
  const colors = {
    'DEVELOPER': '#00f2ff',
    'MANAGER': '#a855f7',
    'PRODUCT': '#f59e0b',
    'AGENT': '#10b981',
    'ADMIN': '#ef4444',
    'SUPERADMIN': '#ef4444'
  };
  return colors[role.toUpperCase()] || 'rgba(255,255,255,0.1)';
}

async function handleCreateStaff(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());
  try {
    const res = await fetch("/api/auth/create-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const r = await res.json();
    if (r.success) { alert("Staff onboarding successful!"); e.target.reset(); loadStaff(); }
  } catch (e) { alert("Error connecting to server"); }
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom(id) {
  const el = document.getElementById(id);
  if (el) el.scrollTop = el.scrollHeight;
}

// ─── AI COPILOT ──────────────────────────────────────────────────────────────

async function getAISuggestion() {
    if (!activeConversationId) return;
    
    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width: 12px;"></i> Thinking...';
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch(`/api/support/ai/suggest/${activeConversationId}`);
        const r = await res.json();
        if (r.success) {
            document.getElementById("chatInput").value = r.suggestion;
        }
    } catch (e) { console.error("AI Suggestion failed"); }
    finally {
        btn.innerHTML = originalContent;
        if (window.lucide) lucide.createIcons();
    }
}

async function analyzeTicketAI(ticketId) {
    const card = document.getElementById("aiInsightCard");
    const summary = document.getElementById("aiSummary");
    
    if (card) card.style.display = "block";
    if (summary) summary.innerText = "Neural processing in progress...";

    try {
        const res = await fetch(`/api/support/ai/analyze/${ticketId}`);
        const r = await res.json();
        if (r.success) {
            const { analysis } = r;
            if (summary) summary.innerText = analysis.summary;
            
            const sentiment = document.getElementById("aiSentiment");
            if (sentiment) {
                sentiment.innerText = analysis.sentiment;
                sentiment.className = `badge badge-${analysis.sentiment.toLowerCase() === 'angry' ? 'urgent' : 'open'}`;
            }
            
            const urgency = document.getElementById("aiUrgency");
            if (urgency) {
                urgency.innerText = `URGENCY: ${analysis.urgency}`;
                urgency.className = `badge badge-${analysis.urgency === 'HIGH' || analysis.urgency === 'CRITICAL' ? 'urgent' : 'open'}`;
            }
        }
    } catch (e) { if (summary) summary.innerText = "Neural link failed. Analysis unavailable."; }
}

async function viewTicket(id) {
    analyzeTicketAI(id);
    
    const res = await fetch(`/api/support/tickets/${id}`);
    const r = await res.json();
    if (r.success) {
        const t = r.data;
        document.getElementById("activeConvoName").innerText = `TICKET: ${t.subject}`;
        
        const container = document.getElementById("chatMessages");
        container.innerHTML = "";
        // If there are messages, append them. In current schema, check t.messages
        if (t.messages) t.messages.forEach(appendChatMessage);
        
        activeConversationId = t.conversationId || t.id;
    }
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

let volumeChart = null;
let currentAnalyticsDays = 30;

async function loadAnalytics(days = 30) {
    currentAnalyticsDays = days;
    
    // UI Feedback for filters
    document.querySelectorAll(".intel-filter").forEach(btn => {
        btn.classList.toggle("active", parseInt(btn.dataset.days) === days);
    });

    try {
        const res = await fetch(`/api/support/intel/metrics?days=${days}`);
        const r = await res.json();
        if (r.success) {
            updateDashboardUI(r.data);
        }
    } catch (e) { console.error("Analytics Load Error", e); }
}

function updateDashboardUI(data) {
    const { summary, trends, leaderboard } = data;
    
    // Update KPIs
    const elRes = document.getElementById("metric_avgResponse");
    const elVel = document.getElementById("metric_avgResolution");
    const elSla = document.getElementById("metric_sla");
    const elAct = document.getElementById("metric_active");

    if (elRes) elRes.innerText = summary.avgResponseTime;
    if (elVel) elVel.innerText = summary.avgResolutionTime;
    if (elSla) elSla.innerText = `${summary.slaCompliance}%`;
    if (elAct) elAct.innerText = summary.openTickets;

    // Render Chart
    renderVolumeChart(trends);
    
    // Render Leaderboard
    renderLeaderboard(leaderboard);
}

function renderVolumeChart(trends) {
    const options = {
        series: [{
            name: 'Tickets',
            data: trends.map(t => t.count)
        }],
        chart: {
            type: 'area',
            height: 350,
            toolbar: { show: false },
            background: 'transparent'
        },
        theme: { mode: 'dark' },
        colors: ['#00f2ff'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        xaxis: {
            categories: trends.map(t => t.day),
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        grid: {
            borderColor: 'rgba(255,255,255,0.05)',
            strokeDashArray: 4
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.7,
                opacityTo: 0.1,
                stops: [0, 90, 100]
            }
        }
    };

    if (volumeChart) volumeChart.destroy();
    volumeChart = new ApexCharts(document.querySelector("#volumeChart"), options);
    volumeChart.render();
}

function renderLeaderboard(board) {
    const container = document.getElementById("leaderboardList");
    container.innerHTML = board.map((entry, i) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 14px; border: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span style="font-weight: 800; color: ${i < 3 ? 'var(--primary)' : 'var(--text-muted)'};">#${i + 1}</span>
                <span style="font-size: 0.9rem;">${entry.email}</span>
            </div>
            <span class="badge" style="background: rgba(0, 242, 255, 0.1); color: var(--primary);">${entry.resolvedCount} Resolved</span>
        </div>
    `).join("");
}
