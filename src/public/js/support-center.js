// Helper to get token
var getAuthToken = () => localStorage.getItem("token") || localStorage.getItem("accessToken");

// socket is already initialized in admin-apex.js globally

var activeConvoId = null;

function initSupportCenter() {
    console.log("[Support] Initializing Support Center...");
    loadKB();
    
    const ticketForm = document.getElementById("createTicketForm");
    if (ticketForm) {
        console.log("[Support] Attaching ticket form handler");
        ticketForm.onsubmit = handleCreateTicket;
    }

    setupSocketListeners();
    
    if (window.lucide) window.lucide.createIcons();
}

function setupSocketListeners() {
    socket.on("new-message", (message) => {
        if (message.conversationId === activeConvoId) {
            appendTenantChatMessage(message);
        }
    });

    socket.on("ticket-activity", (data) => {
        console.log("[Tenant] Ticket Activity:", data);
        // Refresh ticket list if on that view
        if (document.getElementById("ticketsView").classList.contains("active")) {
            loadMyTickets();
        }
    });

    socket.on("user-viewing", ({ userId, isViewing }) => {
        // Optional: show "Agent is reading" status
    });
}

// ─── KNOWLEDGE BASE ───────────────────────────────────────────────────────────

async function loadKB() {
    try {
        const res = await fetch("/api/support/kb", {
            headers: { "Authorization": `Bearer ${getAuthToken()}` }
        });
        const r = await res.json();
        if (r.success) renderKB(r.data);
    } catch (e) { console.error("KB Load Error", e); }
}

function renderKB(articles) {
    const container = document.getElementById("kbArticles");
    if (!container) return;

    if (!articles || articles.length === 0) {
        articles = [
            {
                slug: "quickstart-voice-agent",
                title: "AI Voice Agent Quickstart Guide",
                content: "Learn how to configure your Twilio inbound lines, custom prompt directives, and live voice synthesis in under 5 minutes.",
                category: "TELEPHONY"
            },
            {
                slug: "pos-integration-setup",
                title: "POS & Ecosystem Synchronization",
                content: "Step-by-step instructions for connecting Toast, Square, and Clover POS integrations to enable real-time order injection.",
                category: "INTEGRATION"
            },
            {
                slug: "booking-calendar-rules",
                title: "Smart Calendar & Slot Booking Protocols",
                content: "Configure opening hours, staff availability matrix, buffer durations, and automatic SMS appointment confirmations.",
                category: "CALENDAR"
            },
            {
                slug: "billing-and-minute-allocations",
                title: "Billing Tiers & Voice Minute Quotas",
                content: "Understand how monthly voice minutes, token limits, and overage credits are calculated and renewed across your subscription.",
                category: "BILLING"
            }
        ];
    }

    window._kbArticlesCache = articles;

    container.innerHTML = articles.map(a => `
        <div class="kb-card animate-entrance" onclick="viewArticle('${a.slug}')">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <div style="width: 3rem; height: 3rem; border-radius: 1rem; background: rgba(0, 242, 255, 0.1); border: 1px solid rgba(0, 242, 255, 0.2); display: flex; align-items: center; justify-content: center; color: var(--support-primary);">
                    <i data-lucide="${a.category === 'TELEPHONY' ? 'phone-call' : a.category === 'INTEGRATION' ? 'cpu' : a.category === 'CALENDAR' ? 'calendar' : 'file-text'}" style="width: 1.5rem;"></i>
                </div>
                <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--support-primary); background: rgba(0, 242, 255, 0.08); padding: 0.25rem 0.75rem; border-radius: 9999px; border: 1px solid rgba(0, 242, 255, 0.2);">${a.category || 'GUIDE'}</span>
            </div>
            <h4 style="margin-bottom: 0.75rem; font-size: 1.2rem; font-weight: 800; color: white;">${a.title}</h4>
            <p style="font-size: 0.875rem; color: var(--support-text-muted); line-height: 1.6; margin-bottom: 1.5rem;">${a.content.substring(0, 110)}...</p>
            <div style="margin-top: auto; display: flex; align-items: center; gap: 0.5rem; color: var(--support-primary); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                Analyze Protocol <i data-lucide="arrow-right" style="width: 14px;"></i>
            </div>
        </div>
    `).join("");
    if (window.lucide) window.lucide.createIcons();
}

// ─── TICKETS ──────────────────────────────────────────────────────────────────

async function loadMyTickets() {
    try {
        const res = await fetch("/api/support/tickets", {
            headers: { "Authorization": `Bearer ${getAuthToken()}` }
        });
        const r = await res.json();
        if (r.success) renderMyTickets(r.data);
    } catch (e) { console.error("Tickets Load Error", e); }
}

function renderMyTickets(tickets) {
    const container = document.getElementById("myTicketsList");
    if (!container) return;
    container.innerHTML = tickets.map(t => {
        const statusColors = {
            'open': '#00f2ff',
            'closed': '#64748b',
            'pending': '#f59e0b',
            'resolved': '#10b981'
        };
        const statusKey = (t.status || 'open').toLowerCase();
        const color = statusColors[statusKey] || '#00f2ff';
        const subject = t.subject || t.title || 'Support Ticket Inquiry';
        
        return `
            <tr onclick="viewTicketDetails('${t.id}')" style="cursor: pointer;">
                <td><span style="font-family: 'JetBrains Mono', monospace; color: var(--support-primary); font-weight: 800; opacity: 0.9;">#${t.id.substring(0, 8).toUpperCase()}</span></td>
                <td style="font-weight: 700; color: white;">${subject}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; box-shadow: 0 0 10px ${color};"></div>
                        <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${color};">${(t.status || 'OPEN').toUpperCase()}</span>
                    </div>
                </td>
                <td style="font-size: 0.85rem; color: var(--support-text-muted); font-weight: 600;">${t.createdAt ? new Date(t.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : 'N/A'}</td>
            </tr>
        `;
    }).join("");
}

async function handleCreateTicket(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    try {
        const res = await fetch("/api/support/tickets", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(data)
        });
        const r = await res.json();
        if (r.success) { 
            if (window.showToast) window.showToast("Case transmission successful", "success");
            else alert("Ticket created!"); 
            e.target.reset(); 
            switchSupportView('tickets'); 
        }
    } catch (e) { alert("Failed to submit ticket."); }
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────

async function startSupportChat() {
    console.log("[Support] Starting chat session...");
    const container = document.getElementById("tenantChatBox");
    container.innerHTML = '<div style="text-align:center; padding:4rem; opacity:0.5; font-weight: 600;">Establishing direct neural link...</div>';

    try {
        const user = window.currentUser || {};
        const res = await fetch("/api/support/conversations/start", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ 
                name: user.name || user.email?.split('@')[0] || "Tenant Admin", 
                email: user.email || "admin@tenant.com" 
            })
        });
        const r = await res.json();
        if (r.success) {
            activeConvoId = r.conversationId;
            console.log("[Support] Conversation started:", activeConvoId);
            socket.emit("join-conversation", { conversationId: activeConvoId });
            loadChatMessages(activeConvoId);
        } else {
            console.error("[Support] Start failed:", r.message);
            container.innerHTML = `<div style="text-align:center; padding:4rem; color: #ef4444; font-weight: 700;">Protocol error: ${r.message}</div>`;
        }
    } catch (e) { 
        console.error("Chat Start Error", e); 
        container.innerHTML = `<div style="text-align:center; padding:4rem; color: #ef4444; font-weight: 700;">Connection sync failure.</div>`;
    }
}

async function loadChatMessages(id) {
    const res = await fetch(`/api/support/conversations/${id}/messages`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
    });
    const r = await res.json();
    if (r.success) {
        const container = document.getElementById("tenantChatBox");
        container.innerHTML = "";
        r.data.forEach(appendTenantChatMessage);
        container.scrollTop = container.scrollHeight;
    }
}

async function sendTenantChatMessage() {
    const input = document.getElementById("tenantChatInput");
    const body = input.value.trim();
    if (!body || !activeConvoId) return;

    input.value = "";
    
    // Optimistic UI
    appendTenantChatMessage({ body, senderType: "CUSTOMER" });

    try {
        const res = await fetch(`/api/support/conversations/${activeConvoId}/messages`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ body, senderType: "CUSTOMER" })
        });
        
        const r = await res.json();
        if (!r.success) {
            console.error("Failed to send message");
        }
    } catch (e) {
        console.error("[Support] Send Error:", e);
    }
}

function appendTenantChatMessage(m) {
    const container = document.getElementById("tenantChatBox");
    if (!container) return;
    const isCustomer = m.senderType === "CUSTOMER";
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.justifyContent = isCustomer ? "flex-end" : "flex-start";
    wrap.style.marginBottom = "1rem";
    
    const bubbleClass = isCustomer ? "bubble-tenant" : "bubble-agent";
    wrap.innerHTML = `<div class="chat-bubble ${bubbleClass} animate-entrance">${m.body}</div>`;
    
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
}

// ─── UTILS & MODALS ──────────────────────────────────────────────────────────

async function viewTicketDetails(id) {
    const overlay = document.getElementById("ticketDetailOverlay");
    overlay.classList.add("active");
    
    try {
        const res = await fetch(`/api/support/tickets/${id}`, {
            headers: { "Authorization": `Bearer ${getAuthToken()}` }
        });
        const r = await res.json();
        if (r.success) {
            const t = r.data;
            document.getElementById("td_subject").innerText = t.subject;
            document.getElementById("td_status").innerText = t.status.toUpperCase();
            document.getElementById("td_priority").innerText = t.priority.toUpperCase();
            document.getElementById("td_date").innerText = new Date(t.createdAt).toLocaleDateString();
            document.getElementById("td_description").innerText = t.description;
            
            const msgList = document.getElementById("td_messages");
            msgList.innerHTML = t.messages.map(m => `
                <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 12px; border: 1px solid var(--support-border);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.75rem;">
                        <span style="color: var(--support-primary); font-weight: 700;">${m.senderType}</span>
                        <span style="color: var(--support-text-muted);">${new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p style="font-size: 0.85rem; line-height: 1.5;">${m.body}</p>
                </div>
            `).join("");
        }
    } catch (e) { console.error("Ticket Load Error", e); }
}

function closeTicketDetails() {
    document.getElementById("ticketDetailOverlay").classList.remove("active");
}

function viewArticle(slug) {
    // For now, let's just show an alert or open in new tab if we had a public route
    // But since this is a hub, we should probably have an article view
    alert("Knowledge Base Article: " + slug + "\n(Detailed article view coming soon)");
}

// Initialize immediately
initSupportCenter();
