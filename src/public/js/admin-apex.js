// Global State
window.currentSection = "dashboard";
window.token = localStorage.getItem("accessToken");
window.getBusinessId = getBusinessId;

const token = window.token;
let liveCallsInterval = null;
let revenueChartInstance = null;
let callsChartInstance = null;

// Auth Check
const decodedToken = window.token ? JSON.parse(atob(window.token.split(".")[1])) : null;

if (!window.token || !decodedToken || decodedToken.exp < Date.now() / 1000) {
  logout();
}

// Socket Setup
const socket = io({ auth: { token: window.token } });

socket.on("connect", () => {
  console.log("[Socket] Connected to server");
  const bId = getBusinessId();
  if (bId) {
    socket.emit("join_business", bId);
    console.log("[Socket] Joined business room:", bId);
  }
  if (decodedToken && decodedToken.role === "SUPERADMIN") {
    socket.emit("join_superadmin");
  }
});

socket.on("new_appointment", (data) => {
  const serviceName = data.service?.name || data.serviceName || 'General Service';
  const apptDate = data.appointmentTime ? new Date(data.appointmentTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown Time';
  
  notify(`New Booking: ${data.customerName || 'Voice Customer'} - ${serviceName} on ${apptDate}`, "Appointment Received");
  
  // 1. Update Stats if on Dashboard
  if (currentSection === "dashboard") {
    const statsValues = document.querySelectorAll(".stat-value");
    if (statsValues[0]) {
      const current = parseInt(statsValues[0].innerText.replace(/,/g, '')) || 0;
      statsValues[0].innerText = (current + 1).toLocaleString();
    }
  }

  // 2. Refresh Full Section if active
  if ((currentSection === "appointment" || currentSection === "dashboard") && !document.querySelector('.modal-overlay.show')) {
     loadSection(currentSection);
  }
});

socket.on("call_started", (data) => {
  const container = document.getElementById("liveCallsContainer");
  if (!container) return;
  
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const card = `
    <div class="live-call-card" id="call-${data.id}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); padding: 1.25rem; border-radius: 1rem; margin-bottom: 1rem; animation: slideInUp 0.5s ease-out;">
      <div style="margin-bottom: 0.75rem;">
        <p style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Active Interaction</p>
        <p style="font-size: 1.125rem; font-weight: 700; color: white;">${data.from}</p>
        <p style="font-size: 0.7rem; color: var(--primary); font-weight: 600;">AI Monitoring Enabled</p>
      </div>
      <div id="transcript-${data.id}" style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; max-height: 80px; overflow: hidden; font-style: italic;">
        Waiting for speech...
      </div>
    </div>
  `;
  container.insertAdjacentHTML('afterbegin', card);
});

socket.on("call_transcribed", (data) => {
  const tId = data.id || data.callSid;
  const tDiv = document.getElementById(`transcript-${tId}`);
  if (tDiv) {
    tDiv.innerText = (data.role === 'assistant' ? 'AI: ' : 'User: ') + data.text;
    tDiv.style.fontStyle = "normal";
    tDiv.style.color = data.role === 'assistant' ? 'var(--primary)' : 'white';
  }
});

socket.on("call_ended", (data) => {
  const tId = data.id || data.callSid;
  const card = document.getElementById(`call-${tId}`);
  if (card) {
    card.style.opacity = "0.5";
    const status = card.querySelector('p[style*="font-weight: 600"]');
    if (status) status.innerText = "Completed";
    setTimeout(() => card.remove(), 5000);
  }
});

socket.on("new_order", (data) => {
  notify(`New Order ${data.displayId || ''}: ${data.customerName || 'Voice Customer'} - $${data.total.toFixed(2)}`, "Order Received");
  
  // 1. Update Dashboard Widget if visible
  const dashboardList = document.getElementById("dashboardOrdersList");
  if (dashboardList) {
    const emptyState = dashboardList.querySelector(".empty-state");
    if (emptyState) emptyState.remove();

    const orderHtml = `
      <div style="background: rgba(var(--primary-rgb), 0.1); border: 1px solid var(--primary); padding: 0.75rem; border-radius: 0.75rem; display: flex; justify-content: space-between; align-items: center; animation: slideInRight 0.5s ease-out;">
        <div>
          <p style="font-size: 0.75rem; font-weight: 700; color: white;">${data.customerName || 'Guest'}</p>
          <p style="font-size: 0.65rem; color: var(--text-muted);">${new Date(data.createdAt).toLocaleTimeString()}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 0.875rem; font-weight: 700; color: var(--primary);">$${(data.total || 0).toFixed(2)}</p>
          <span style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--success); font-weight: 700;">${data.status || 'PENDING'}</span>
        </div>
      </div>
    `;
    dashboardList.insertAdjacentHTML('afterbegin', orderHtml);
    
    // Keep only top 5
    if (dashboardList.children.length > 5) {
      dashboardList.removeChild(dashboardList.lastElementChild);
    }
  }

  // 2. Update Stats if on Dashboard
  if (currentSection === "dashboard") {
    const statsValues = document.querySelectorAll(".stat-value");
    // Update "Total Orders" (index 0 usually)
    if (statsValues[0]) {
      const current = parseInt(statsValues[0].innerText.replace(/,/g, '')) || 0;
      statsValues[0].innerText = (current + 1).toLocaleString();
    }
    // Update "Sales Revenue" (index 1 usually)
    if (statsValues[1] && statsValues[1].innerText.startsWith("$")) {
      const current = parseFloat(statsValues[1].innerText.replace(/[$,]/g, '')) || 0;
      statsValues[1].innerText = "$" + (current + (data.total || 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
  }
  
  // 3. Update Orders Page if active
  const ordersGrid = document.getElementById("ordersGrid");
  if (ordersGrid) {
    const emptyState = ordersGrid.querySelector('div[style*="text-align:center"]');
    if (emptyState && emptyState.innerText.includes("No active orders")) emptyState.remove();

    // Need to define getStatusColor and getStatusBorder locally or ensure they are global
    const statusColor = (status) => {
      switch((status || 'pending').toLowerCase()) {
        case 'pending': return '#f59e0b';
        case 'preparing': return '#3b82f6';
        case 'completed': return '#10b981';
        case 'cancelled': return '#ef4444';
        default: return '#6b7280';
      }
    };

    const orderCard = `
      <div class="apex-card" style="display:flex; flex-direction:column; gap:1rem; border-left: 4px solid ${statusColor(data.status)}; animation: slideInUp 0.5s ease-out;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h4 style="margin-bottom:0.25rem;">Order ${data.displayId || '#' + data.id.substring(data.id.length - 6)}</h4>
            <p style="font-size:0.75rem; color:var(--text-muted);">${new Date(data.createdAt).toLocaleString()}</p>
          </div>
          <span class="badge" style="background:${statusColor(data.status)}20; color:${statusColor(data.status)}; font-weight:700;">
            ${(data.status || 'pending').toUpperCase()}
          </span>
        </div>
        
        <div style="padding:1rem; background:rgba(255,255,255,0.02); border-radius:0.5rem; border:1px solid var(--border);">
          <p style="font-size:0.875rem; color:var(--text-primary); font-weight:600; margin-bottom:0.5rem;">${data.customerName || 'Guest'}</p>
          
          <div style="margin-bottom: 0.75rem;">
            ${data.items && data.items.length > 0 ? data.items.map(i => `
              <div style="display:flex; justify-content:space-between; font-size:0.875rem; margin-bottom:0.25rem;">
                <span><strong style="color:var(--primary);">${i.quantity}x</strong> ${i.menuItem?.name || 'Item'}</span>
                <span style="color:var(--text-secondary);">$${((i.unitPrice || 0) * i.quantity).toFixed(2)}</span>
              </div>
            `).join("") : '<p style="font-size:0.8rem; color:var(--text-muted);">No items listed.</p>'}
          </div>

          <div style="margin-top:0.75rem; padding:0.75rem; background:rgba(245,158,11,0.05); border-radius:0.4rem; border:1px dashed rgba(245,158,11,0.2);">
            <p style="font-size:0.65rem; text-transform:uppercase; font-weight:800; color:#f59e0b; margin-bottom:0.25rem;">Special Instructions</p>
            <p style="font-size:0.8rem; color:${data.notes ? 'white' : 'var(--text-muted)'};">
              ${data.notes || 'None'}
            </p>
          </div>

          <div style="margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed var(--border); display:flex; justify-content:space-between; font-weight:700;">
            <span>Total</span>
            <span style="color:var(--primary); font-size:1.125rem;">$${(data.total || 0).toFixed(2)}</span>
          </div>
        </div>

        <div style="display:flex; gap:0.75rem;">
          <button class="action-btn" style="flex:1; background:var(--primary); color:white; border:none; font-weight:600;" onclick="updateOrderStatus('${data.id}', 'preparing')">Accept</button>
          <button class="action-btn" style="flex:1; border-color:var(--border);" onclick="updateOrderStatus('${data.id}', 'completed')">Done</button>
        </div>
      </div>
    `;
    ordersGrid.insertAdjacentHTML('afterbegin', orderCard);
    if (window.lucide) lucide.createIcons();
  }
});

// Live transcript handling (Sarah V2)
socket.on("live-transcript", (data) => {
  const container = document.getElementById("liveFeedContainer");
  const transcriptEl = document.getElementById("liveTranscript");
  const callIdEl = document.getElementById("liveCallId");

  if (!container || !transcriptEl) return;
  container.style.display = "block";

  if (callIdEl) callIdEl.textContent = `SID: ${data.callSid?.substring(0, 10)}...`;

  // Create or update entry
  const entry = document.createElement("div");
  entry.style.marginBottom = "0.5rem";
  const roleColor = data.role === "assistant" ? "var(--primary)" : "var(--text-primary)";
  entry.innerHTML = `<span style="color:${roleColor}; font-weight:700; font-size: 0.75rem;">[${data.role.toUpperCase()}]</span> 
                     <span style="font-size: 0.875rem;">${data.text}</span>`;
  
  transcriptEl.appendChild(entry);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;

  // Cleanup old lines
  if (transcriptEl.children.length > 50) {
    transcriptEl.removeChild(transcriptEl.firstChild);
  }
});

// Helpers
function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  localStorage.removeItem("activeBusinessId");
  localStorage.removeItem("activeBusinessType");
  window.token = null;
  window.currentBusinessId = null;
  window.location.href = "/logout";
}

function getBusinessId() {
  const stored = localStorage.getItem("activeBusinessId");
  if (stored) return stored;
  
  const tokenBizId = decodedToken?.businessId;
  if (tokenBizId) {
    localStorage.setItem("activeBusinessId", tokenBizId);
    return tokenBizId;
  }
  return null;
}

function notify(message, title = "Notification") {
  const box = document.getElementById("notificationBox");
  const titleEl = document.getElementById("notificationTitle");
  const textEl = document.getElementById("notificationText");
  const iconBox = document.getElementById("notificationIcon");
  const sound = document.getElementById("notifySound");

  if (!box || !titleEl || !textEl) return;

  // Set Style based on type
  let activeSound = sound;
  
  if (title.toLowerCase().includes("order")) {
    iconBox.style.background = "rgba(var(--success-rgb), 0.1)";
    iconBox.style.color = "var(--success)";
    iconBox.innerHTML = '<i data-lucide="shopping-bag"></i>';
    activeSound = document.getElementById("orderSound") || sound;
  } else if (title.toLowerCase().includes("appointment") || title.toLowerCase().includes("booking")) {
    iconBox.style.background = "rgba(var(--primary-rgb), 0.1)";
    iconBox.style.color = "var(--primary)";
    iconBox.innerHTML = '<i data-lucide="calendar"></i>';
  } else {
    iconBox.style.background = "rgba(255,255,255,0.05)";
    iconBox.style.color = "var(--text-muted)";
    iconBox.innerHTML = '<i data-lucide="bell"></i>';
  }

  if (window.lucide) lucide.createIcons({ attrs: { "stroke-width": 2 } });

  titleEl.innerText = title;
  textEl.innerText = message;
  box.style.transform = "translateX(0)";
  
  if (activeSound) {
    activeSound.currentTime = 0;
    activeSound.play().catch(e => console.warn("[Audio] Autoplay blocked or failed:", e));
  }

  setTimeout(() => {
    box.style.transform = "translateX(120%)";
  }, 6000);
}

// Business Management
async function loadBusinesses() {
  const select = document.getElementById("businessSwitcher");
  if (!select) return;

  try {
    const res = await fetch("/api/business/all", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();

    if (!result.success || !result.data.length) {
      select.innerHTML = '<option value="">No businesses</option>';
      return;
    }

    select.innerHTML = result.data.map(b => 
      `<option value="${b.id}" data-type="${b.type}" data-logo="${b.logoUrl || ''}" ${b.id === getBusinessId() ? 'selected' : ''}>${b.name}</option>`
    ).join("");

    if (!getBusinessId()) {
      localStorage.setItem("activeBusinessId", result.data[0].id);
      localStorage.setItem("activeBusinessType", result.data[0].type);
    } else {
      const active = result.data.find(b => b.id === getBusinessId());
      if (active) localStorage.setItem("activeBusinessType", active.type);
    }

    await fetchBillingStatus();
    renderSidebar();
  } catch (err) {
    console.error("Load businesses error:", err);
  }
}

function switchBusiness(id) {
  const select = document.getElementById("businessSwitcher");
  const option = select.options[select.selectedIndex];
  if (option) {
    localStorage.setItem("activeBusinessType", option.dataset.type);
    
    // Update Branding UI Manually
    const bizName = option.text;
    const bizLogo = option.dataset.logo;
    const nameEl = document.getElementById("brandLogoText");
    const logoImg = document.getElementById("brandLogoImg");
    const logoPlaceholder = document.getElementById("brandLogoPlaceholder");

    if (nameEl) nameEl.innerText = bizName;
    if (logoImg) {
      if (bizLogo && bizLogo !== "null") {
        logoImg.src = bizLogo;
        logoImg.style.display = "block";
        if (logoPlaceholder) logoPlaceholder.style.display = "none";
        // Apply Global Branding (Favicon & Profile Avatar)
        updateTenantBranding(bizLogo);
      } else {
        logoImg.style.display = "none";
        if (logoPlaceholder) logoPlaceholder.style.display = "block";
      }
    }
  }
  
  localStorage.setItem("activeBusinessId", id);
  socket.emit("join_business", id);
  renderSidebar();
  loadSection(currentSection);
}

function renderSidebar() {
  const nav = document.getElementById("sidebarNav");
  if (!nav) return;

  const bType = localStorage.getItem("activeBusinessType");
  const isOrder = bType ? ["order", "restaurant", "food"].some(t => bType.toLowerCase().includes(t)) : false;
  const isSuper = decodedToken && decodedToken.role === "SUPERADMIN";
  const role = decodedToken ? decodedToken.role.toUpperCase() : "ADMIN";

  let html = `
    <div id="planIndicatorContainer" style="margin-bottom: 1.5rem; padding: 0 0.5rem;"></div>
    <div class="nav-group-label">Overview</div>
    ${isSuper ? `
      <a class="apex-nav-item" href="/superadmin" style="background: rgba(var(--primary-rgb), 0.1); border: 1px solid var(--primary); margin-bottom: 0.5rem; color: var(--primary);">
        <i data-lucide="shield-check"></i>
        <span style="font-weight: 700;">Back to Hub</span>
      </a>
    ` : ''}
    <a class="apex-nav-item ${currentSection === 'dashboard' ? 'active' : ''}" onclick="loadSection('dashboard')">
      <i data-lucide="layout-grid"></i>
      <span>Dashboard</span>
    </a>
  `;

  // Specialized Workspaces for different roles
  if (role === "DEVELOPER") {
    html += `
      <div class="nav-group-label" style="color: #00f2ff; opacity: 0.8;">Engineering Hub</div>
      <a class="apex-nav-item ${currentSection === 'dev-ops' ? 'active' : ''}" onclick="loadSection('dev-ops')">
        <i data-lucide="terminal" style="color: #00f2ff;"></i>
        <span style="color: #00f2ff;">DevOps Console</span>
      </a>
    `;
  } else if (role === "MANAGER") {
    html += `
      <div class="nav-group-label" style="color: #a855f7; opacity: 0.8;">Executive View</div>
      <a class="apex-nav-item ${currentSection === 'manager-kpi' ? 'active' : ''}" onclick="loadSection('manager-kpi')">
        <i data-lucide="briefcase" style="color: #a855f7;"></i>
        <span style="color: #a855f7;">Manager Hub</span>
      </a>
    `;
  } else if (role === "PRODUCT") {
    html += `
      <div class="nav-group-label" style="color: #ec4899; opacity: 0.8;">Growth & Strategy</div>
      <a class="apex-nav-item ${currentSection === 'product-trends' ? 'active' : ''}" onclick="loadSection('product-trends')">
        <i data-lucide="layers" style="color: #ec4899;"></i>
        <span style="color: #ec4899;">Product Metrics</span>
      </a>
    `;
  } else if (role === "AGENT") {
    html += `
      <div class="nav-group-label" style="color: #10b981; opacity: 0.8;">Support Ops</div>
      <a class="apex-nav-item ${currentSection === 'agent-inbox' ? 'active' : ''}" onclick="loadSection('agent-inbox')">
        <i data-lucide="headphones" style="color: #10b981;"></i>
        <span style="color: #10b981;">Agent Inbox</span>
      </a>
    `;
  }

  html += `<div class="nav-group-label">Management</div>`;

  if (isOrder) {
    html += `
      <a class="apex-nav-item ${currentSection === 'menu' ? 'active' : ''}" onclick="loadSection('menu')">
        <i data-lucide="utensils"></i>
        <span>Menu Management</span>
      </a>
      <a class="apex-nav-item ${currentSection === 'orders' ? 'active' : ''}" onclick="loadSection('orders')">
        <i data-lucide="package"></i>
        <span>Order History</span>
      </a>
    `;
  } else {
    html += `
      <a class="apex-nav-item ${currentSection === 'appointment' ? 'active' : ''}" onclick="loadSection('appointment')">
        <i data-lucide="calendar"></i>
        <span>Bookings</span>
      </a>
      <a class="apex-nav-item ${currentSection === 'services' ? 'active' : ''}" onclick="loadSection('services')">
        <i data-lucide="list-checks"></i>
        <span>Service Menu</span>
      </a>
    `;
  }

  html += `
    <a class="apex-nav-item ${currentSection === 'call' ? 'active' : ''}" onclick="loadSection('call')">
      <i data-lucide="phone"></i>
      <span>AI Calls</span>
    </a>
    <a class="apex-nav-item ${currentSection === 'phone' ? 'active' : ''}" onclick="loadSection('phone')">
      <i data-lucide="phone-forwarded"></i>
      <span>Phone Numbers</span>
    </a>

    <div class="nav-group-label">Support</div>
    <a class="apex-nav-item ${currentSection === 'support-center' ? 'active' : ''}" onclick="loadSection('support-center')">
      <i data-lucide="help-circle"></i>
      <span>Support Center</span>
    </a>
    <a class="apex-nav-item ${currentSection === 'tickets' ? 'active' : ''}" onclick="loadSection('tickets')">
      <i data-lucide="ticket"></i>
      <span>Tickets</span>
    </a>

    <div class="nav-group-label">Configuration</div>
    <a class="apex-nav-item ${currentSection === 'integrations' ? 'active' : ''}" onclick="loadSection('integrations')">
      <i data-lucide="puzzle"></i>
      <span>Integrations</span>
    </a>
    <a class="apex-nav-item ${currentSection === 'billing' ? 'active' : ''}" onclick="loadSection('billing')">
      <i data-lucide="credit-card"></i>
      <span>Billing & Plans</span>
    </a>
    <a class="apex-nav-item ${currentSection === 'business' ? 'active' : ''}" onclick="loadSection('business')">
      <i data-lucide="settings"></i>
      <span>Business Settings</span>
    </a>
  `;

  nav.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
  renderPlanIndicator();
}

let billingData = null;
async function fetchBillingStatus() {
  try {
    const res = await fetch("/api/billing/status", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (result.success) {
      billingData = result.data;
    }
  } catch (err) {
    console.error("Fetch billing error:", err);
  }
}

function renderPlanIndicator() {
  const container = document.getElementById("planIndicatorContainer");
  if (!container || !billingData) return;

  const plan = billingData.plan || "nexa_core";
  const planName = plan.toUpperCase().replace("_", " ");
  const isCore = plan === "nexa_core";
  
  container.innerHTML = `
    <div class="apex-card" style="padding: 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 0.75rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Current Plan</span>
        <span class="badge ${isCore ? 'badge-pending' : 'badge-connected'}" style="font-size: 0.6rem;">${planName}</span>
      </div>
      <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">
        ${billingData.usedMinutes || 0} / ${billingData.monthlyLimit || 300} mins
      </div>
      <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
        <div style="width: ${Math.min(100, ((billingData.usedMinutes || 0) / (billingData.monthlyLimit || 300)) * 100)}%; height: 100%; background: var(--primary);"></div>
      </div>
      ${isCore ? `
        <button class="apex-btn" style="width: 100%; margin-top: 1rem; padding: 0.5rem; font-size: 0.7rem; height: auto;" onclick="loadSection('billing')">
          <i data-lucide="trending-up" style="width: 12px; height: 12px;"></i> Upgrade to Flow
        </button>
      ` : ''}
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

// Section Loading
let isSectionLoading = false;
async function loadSection(section) {
  if (isSectionLoading) return;
  isSectionLoading = true;
  currentSection = section;
  const contentArea = document.getElementById("contentArea");
  const dashboardGrid = document.getElementById("dashboardGrid");
  const pageHeader = document.getElementById("pageHeader");
  
  if (!contentArea || !dashboardGrid) {
    isSectionLoading = false;
    return;
  }

  // Clear intervals/charts
  if (liveCallsInterval) clearInterval(liveCallsInterval);
  if (revenueChartInstance) revenueChartInstance.destroy();
  if (callsChartInstance) callsChartInstance.destroy();

  // Set titles centrally
  const titleEl = document.getElementById("pageTitle");
  const subEl = document.getElementById("pageSubtitle");
  const bType = localStorage.getItem("activeBusinessType") || "restaurant";
  const isOrder = ["order", "restaurant", "food", "shop", "store", "bakery"].some(t => bType.toLowerCase().includes(t));

  if (titleEl) {
    const isSalon = bType.toLowerCase().includes("salon") || bType.toLowerCase().includes("hair");
    const isClinic = bType.toLowerCase().includes("clinic") || bType.toLowerCase().includes("doctor");
    const isSpa = bType.toLowerCase().includes("spa") || bType.toLowerCase().includes("wellness");
    const isBarber = bType.toLowerCase().includes("barber");
    
    if (section === 'dashboard') {
      if (isOrder) titleEl.innerText = "Restaurant Analytics";
      else if (isSalon) titleEl.innerText = "Salon Insights";
      else if (isBarber) titleEl.innerText = "Barbershop Analytics";
      else if (isSpa) titleEl.innerText = "Wellness Insights";
      else if (isClinic) titleEl.innerText = "Clinic Insights";
      else titleEl.innerText = "Business Insights";
    }
    else if (section === 'menu') titleEl.innerText = isOrder ? "Menu Management" : "Service Menu Management";
    else if (section === 'orders') titleEl.innerText = "Order History";
    else if (section === 'appointment') titleEl.innerText = "Booking Management";
    else if (section === 'services') titleEl.innerText = isOrder ? "Item Menu" : "Service & Treatment Menu";
    else if (section === 'call') titleEl.innerText = "AI Call Center";
    else if (section === 'support-center') titleEl.innerText = "Support Center";
    else if (section === 'tickets') titleEl.innerText = "Your Tickets";
    else if (section === 'dev-ops') titleEl.innerText = "Developer Console";
    else if (section === 'manager-kpi') titleEl.innerText = "Management Hub";
    else if (section === 'product-trends') titleEl.innerText = "Product Insights";
    else if (section === 'agent-inbox') titleEl.innerText = "Support Agent Hub";
    else if (section === 'integrations') titleEl.innerText = "Marketplace";
    else if (section === 'business') titleEl.innerText = "Business Settings";
    else if (section === 'phone') titleEl.innerText = "Phone Management";
    else if (section === 'billing') titleEl.innerText = "Billing & Subscriptions";
  }

  if (subEl) {
    if (section === 'dashboard') subEl.innerText = isOrder ? "Monitor your orders, revenue, and AI sales performance." : "Track bookings, patient flow, and service analytics.";
    else if (section === 'menu') subEl.innerText = "Configure your dishes, categories, and AI ordering rules.";
    else if (section === 'orders') subEl.innerText = "Track and manage incoming guest orders.";
    else if (section === 'appointment') subEl.innerText = "Manage your calendar and patient appointments.";
    else if (section === 'services') subEl.innerText = "Define your services, durations, and pricing.";
    else if (section === 'call') subEl.innerText = "Real-time AI voice interaction monitoring.";
    else if (section === 'support-center') subEl.innerText = "We’re here to help. Chat with our support team or AI assistant.";
    else if (section === 'tickets') subEl.innerText = "Track and manage your technical and billing tickets.";
    else if (section === 'dev-ops') subEl.innerText = "System health, API logs, and deployment monitoring.";
    else if (section === 'manager-kpi') subEl.innerText = "Executive oversight of team performance and KPIs.";
    else if (section === 'product-trends') subEl.innerText = "Data-driven insights into feature adoption and growth.";
    else if (section === 'agent-inbox') subEl.innerText = "Your primary workspace for resolving customer tickets.";
    else if (section === 'phone') subEl.innerText = "Manage your business numbers, routing, and AI answering.";
    else if (section === 'billing') subEl.innerText = "Manage your Nexa package, track AI minutes, and view usage metrics.";
  }

  // Handle header action button
  const header = document.getElementById("pageHeader");
  let actionBtn = document.getElementById("headerActionBtn");
  if (actionBtn) actionBtn.remove();

  if (section === 'support-center') {
    const btn = document.createElement("button");
    btn.id = "headerActionBtn";
    btn.className = "apex-btn apex-btn-secondary";
    btn.style = "position: absolute; top: 0; right: 0;";
    btn.innerHTML = '<i data-lucide="book-open" style="width: 16px;"></i> View Knowledge Base';
    header.style.position = "relative";
    header.appendChild(btn);
  }

  // Active state in sidebar
  renderSidebar();

  // Toggle visibility
  if (section === "dashboard") {
    contentArea.style.display = "none";
    dashboardGrid.style.display = "block";
    await renderDashboard();
    isSectionLoading = false;
  } else {
    dashboardGrid.style.display = "none";
    contentArea.style.display = "block";
    contentArea.innerHTML = '<div class="apex-card" style="text-align:center; padding:4rem;"><div class="spin" style="width:24px; height:24px; border:2px solid var(--primary); border-top-color:transparent; border-radius:50%; margin: 0 auto 1rem;"></div>Loading section...</div>';
    
  try {
    console.log(`[Apex] Loading section: ${section} for business: ${getBusinessId()}`);
    const res = await fetch(`/api/dashboard/${section}?partial=true&businessId=${getBusinessId()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      const html = await res.text();
      console.log(`[Apex] Section ${section} fetched successfully. Length: ${html.length}`);
      
      contentArea.innerHTML = html;
      console.log(`[Apex] HTML injected into contentArea`);

      // Re-run scripts
      const scripts = contentArea.querySelectorAll("script");
      console.log(`[Apex] Found ${scripts.length} scripts to execute`);
      
      scripts.forEach((oldScript, idx) => {
        const newScript = document.createElement("script");
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
        console.log(`[Apex] Script ${idx+1} executed`);
      });

      if (window.lucide) window.lucide.createIcons();
      if (section === "dashboard") renderDashboard();
    } else {
      console.error(`[Apex] Failed to load section ${section}:`, res.status);
      contentArea.innerHTML = `<div class="apex-card" style="color:var(--danger);">Failed to load ${section} (Status: ${res.status})</div>`;
    }
  } catch (err) {
    console.error(`[Apex] Error loading section ${section}:`, err);
    contentArea.innerHTML = `<div class="apex-card" style="color:var(--danger);">Error: ${err.message}</div>`;
    } finally {
      isSectionLoading = false;
    }
  }
}

// Dashboard Specific
async function renderDashboard() {
  const bType = localStorage.getItem("activeBusinessType") || "appointment";
  const isOrder = ["order", "restaurant", "food"].some(t => bType.includes(t));
  
  const titleEl = document.getElementById("pageTitle");
  const subEl = document.getElementById("pageSubtitle");
  const activityTitle = document.getElementById("recentActivityTitle");
  const activityIcon = document.getElementById("recentActivityIcon");
  
  const isSalon = bType.toLowerCase().includes("salon");
  const isClinic = bType.toLowerCase().includes("clinic");

  if (titleEl) {
    if (isOrder) titleEl.innerText = "Restaurant Analytics";
    else if (isSalon) titleEl.innerText = "Salon Insights";
    else if (isClinic) titleEl.innerText = "Clinic Insights";
    else titleEl.innerText = "Business Insights";
  }
  
  if (subEl) subEl.innerText = isOrder ? "Monitor your orders, revenue, and AI sales performance." : "Track bookings, patient flow, and service analytics.";

  if (activityTitle) activityTitle.innerText = isOrder ? "Recent Orders" : "Recent Appointments";
  if (activityIcon && !isOrder) {
    activityIcon.setAttribute("data-lucide", "calendar");
    if (window.lucide) lucide.createIcons();
  }

  try {
    const bId = getBusinessId();
    const res = await fetch(`/api/dashboard/analytics?businessId=${bId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) {
      console.error("[Dashboard] Analytics failed:", result.error);
      const statsGrid = document.getElementById("statsGrid");
      if (statsGrid) statsGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 2rem; text-align: center; color: var(--danger);">Failed to load analytics: ${result.error || 'Server Error'}</div>`;
      return;
    }

    // 🏆 Dynamic Stat Generation (Industry-Aware)
    const statsGrid = document.getElementById("statsGrid");
    const activityTitle = document.getElementById("recentActivityTitle");
    const activityIcon = document.getElementById("recentActivityIcon");
    
    if (statsGrid) {
      let stats = [];
      if (isOrder) {
        if (activityTitle) activityTitle.innerText = "Recent Orders";
        if (activityIcon && window.lucide) {
          activityIcon.setAttribute("data-lucide", "shopping-bag");
          lucide.createIcons();
        }
        stats = [
          { label: "Total Orders", value: result.data.totals.totalOrders || 0, icon: "package" },
          { label: "Sales Revenue", value: "$" + (result.data.totals.totalRevenue || 0).toFixed(2), icon: "dollar-sign" },
          { label: "Order Success Rate", value: (result.data.totals.aiSuccessRate || 0) + "%", icon: "zap" },
          { label: "AI Minutes", value: result.data.totals.totalMinutes || 0, icon: "clock" }
        ];
      } else {
        if (activityTitle) activityTitle.innerText = "Recent Bookings";
        if (activityIcon && window.lucide) {
          activityIcon.setAttribute("data-lucide", "calendar");
          lucide.createIcons();
        }
        stats = [
          { label: "Total Bookings", value: result.data.totals.totalAppointments || 0, icon: "calendar" },
          { label: "Service Revenue", value: "$" + (result.data.totals.totalRevenue || 0).toFixed(2), icon: "dollar-sign" },
          { label: "Booking Success Rate", value: (result.data.totals.aiSuccessRate || 0) + "%", icon: "check-circle" },
          { label: "AI Minutes", value: result.data.totals.totalMinutes || 0, icon: "clock" }
        ];
      }


      statsGrid.innerHTML = stats.map(s => `
        <div class="stat-card">
          <div class="stat-icon"><i data-lucide="${s.icon}"></i></div>
          <div class="stat-content">
            <p class="stat-label">${s.label}</p>
            <h3 class="stat-value">${s.value}</h3>
          </div>
        </div>
      `).join("");
      if (window.lucide) window.lucide.createIcons();
    }

    // 📊 Render Charts
    try {
      if (result.data.charts) {
        initDashboardCharts(result.data.charts, isOrder);
      }
    } catch (chartErr) {
      console.error("[Dashboard] Chart Init Failed:", chartErr);
    }
    
    // 🛍️ Load Dashboard Activity Widget
    if (isOrder) {
      try {
        fetchDashboardOrders();
      } catch (orderErr) {
        console.error("[Dashboard] Orders Fetch Failed:", orderErr);
      }
    } else {
      try {
        fetchDashboardAppointments();
      } catch (apptErr) {
        console.error("[Dashboard] Appointments Fetch Failed:", apptErr);
      }
    }

    // 📡 Start Live AI Operations Polling
    try {
      startLivePolling();
    } catch (pollErr) {
      console.error("[Dashboard] Polling Start Failed:", pollErr);
    }
  } catch (err) {
    console.error("Dashboard render error:", err);
  }
}

async function fetchDashboardAppointments() {
  const container = document.getElementById("dashboardOrdersList");
  if (!container) return;

  try {
    const bId = getBusinessId();
    const res = await fetch(`/api/appointment?businessId=${bId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();

    if (result.success && result.data && result.data.length) {
      container.innerHTML = result.data.slice(0, 5).map(a => `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); padding: 0.75rem; border-radius: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <p style="font-size: 0.75rem; font-weight: 700; color: white;">${a.customerName || 'Guest'}</p>
            <p style="font-size: 0.65rem; color: var(--text-muted);">${a.service?.name || 'General Service'} • ${new Date(a.appointmentTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 0.75rem; font-weight: 600; color: var(--primary);">${new Date(a.appointmentTime).toLocaleDateString()}</p>
            <span style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: ${a.status === 'PENDING' ? 'var(--warning)' : (a.status === 'CANCELLED' ? 'var(--danger)' : 'var(--success)')}; font-weight: 700;">${a.status || 'BOOKED'}</span>
          </div>
        </div>
      `).join("");
    } else {
      container.innerHTML = '<div class="empty-state" style="padding: 1rem;">No recent bookings.</div>';
    }
  } catch (err) {
    console.error("Fetch dashboard appointments error:", err);
  }
}
async function fetchDashboardOrders() {
  const container = document.getElementById("dashboardOrdersList");
  if (!container) return;

  try {
    const bId = getBusinessId();
    const res = await fetch(`/api/order?businessId=${bId}&take=5`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();

    if (result.success && result.data && result.data.length) {
      container.innerHTML = result.data.slice(0, 5).map(o => `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); padding: 0.75rem; border-radius: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <p style="font-size: 0.75rem; font-weight: 700; color: white;">${o.customerName || 'Guest'}</p>
            <p style="font-size: 0.65rem; color: var(--text-muted);">${o.displayId || '#' + o.id.substring(o.id.length - 4)} • ${new Date(o.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 0.875rem; font-weight: 700; color: var(--primary);">$${(o.total || 0).toFixed(2)}</p>
            <span style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--success); font-weight: 700;">${o.status}</span>
          </div>
        </div>
      `).join("");
    } else {
      container.innerHTML = '<div class="empty-state" style="padding: 1rem;">No recent orders.</div>';
    }
  } catch (err) {
    console.error("Fetch dashboard orders error:", err);
  }
}

function initDashboardCharts(chartData, isOrder) {
  const revCtx = document.getElementById("revenueChart");
  if (revCtx && chartData.revenueChart) {
    const ctx = revCtx.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.12)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    revenueChartInstance = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: chartData.revenueChart.labels,
        datasets: [{
          label: isOrder ? 'Sales Revenue' : 'Projected Revenue',
          data: chartData.revenueChart.values,
          borderColor: '#06b6d4',
          borderWidth: 3,
          pointBackgroundColor: '#06b6d4',
          pointBorderColor: '#ffffff',
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.4,
          fill: true,
          backgroundColor: gradient
        }]
      },
      options: { 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } } },
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } } }
        }
      }
    });
  }

  const callsCtx = document.getElementById("callsChart");
  if (callsCtx && chartData.callsChart) {
    const ctx = callsCtx.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');

    callsChartInstance = new Chart(callsCtx, {
      type: 'bar',
      data: {
        labels: chartData.callsChart.labels,
        datasets: [{
          label: 'Calls',
          data: chartData.callsChart.values,
          backgroundColor: gradient,
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 8
        }]
      },
      options: { 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } } },
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } } }
        }
      }
    });
  }
}

async function fetchLiveCalls() {
  try {
    const bId = getBusinessId();
    if (!bId && typeof user !== 'undefined' && user.role !== 'SUPERADMIN') return;
    
    const url = bId ? `/api/dashboard/live-calls?businessId=${bId}` : `/api/dashboard/live-calls`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json();
    const container = document.getElementById("liveCallsContainer");
    if (!container) return;

    if (result.data && result.data.length) {
      container.innerHTML = result.data.map(c => {
        const isCurrent = c.status === 'active';
        const displayName = (c.customerName && c.customerName !== 'Voice Customer' && c.customerName !== 'Unknown') 
          ? c.customerName 
          : (c.fromNumber || 'Inbound Line');
        
        const sentimentColor = c.sentiment === 'positive' ? '#10b981' : (c.sentiment === 'negative' ? '#ef4444' : '#64748b');

        return `
        <div class="live-call-card" style="background: rgba(var(--primary-rgb), 0.05); border: 1px solid ${isCurrent ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; padding: 1.25rem; border-radius: 1rem; margin-bottom: 0.75rem; transition: all 0.3s ease; position: relative;">
          ${isCurrent ? '<div style="position:absolute; top:12px; right:12px; display:flex; align-items:center; gap:4px;"><span class="status-dot online"></span><span style="font-size:0.6rem; color:var(--success); font-weight:700;">LIVE</span></div>' : ''}
          <div style="margin-bottom: 0.75rem;">
            <p style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 0.25rem;">
              ${c.customerName && c.customerName !== 'Voice Customer' ? 'Verified Customer' : 'Mobile Inbound'}
            </p>
            <h4 style="font-size: 1.125rem; font-weight: 700; color: white; margin: 0;">${displayName}</h4>
          </div>
          
          <div style="font-size: 0.8rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 1rem; padding: 0.75rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem; border-left: 2px solid ${sentimentColor};">
            ${c.summary || 'AI is currently analyzing the conversation stream...'}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display:flex; align-items:center; gap:0.4rem; color: var(--primary); font-size: 0.75rem; font-weight: 600;">
              <i data-lucide="clock" style="width:14px; height:14px;"></i>
              <span>${Math.floor(c.duration/60)}m ${c.duration%60}s</span>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">
              ${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>`;
      }).join("");
      if (window.lucide) window.lucide.createIcons();
    } else {
      container.innerHTML = '<div class="empty-state" style="padding: 3rem 1rem;">No AI operations currently active. Monitoring streams...</div>';
    }
  } catch (err) {
    console.error("Fetch live calls error:", err);
  }
}

// Integrations
function openSettings(id) {
  const modal = document.getElementById("integrationSettingsModal");
  if (!modal) return;
  document.getElementById("settingsModalTitle").innerText = `${id} Settings`;
  document.getElementById("currentIntegrationId").value = id;
  modal.style.display = "flex";
  
  // Show/Hide provider specific fields
  const cloverFields = document.getElementById("cloverFields");
  if (cloverFields) cloverFields.style.display = (id === "CLOVER") ? "block" : "none";
}

function closeSettings() {
  const modal = document.getElementById("integrationSettingsModal");
  if (modal) modal.style.display = "none";
}

async function connectIntegration(id) {
  notify(`Initiating connection to ${id}...`, "Sync");
  // Mock connection logic
  setTimeout(() => {
    notify(`${id} connected successfully!`, "Success");
    const badge = document.getElementById(`badge-${id}`);
    if (badge) {
      badge.innerText = "Connected";
      badge.className = "badge badge-connected";
    }
  }, 2000);
}

// Business Management
async function saveBusiness() {
  const data = {
    name: document.getElementById("bizName").value,
    phoneNumber: document.getElementById("bizPhone").value,
    address: document.getElementById("bizAddress").value,
    country: document.getElementById("bizCountry") ? document.getElementById("bizCountry").value : "US",
    timings: document.getElementById("bizTimings").value,
    currency: document.getElementById("bizCurrency").value,
    taxRate: parseFloat(document.getElementById("bizTaxRate").value) || 0,
    logoUrl: document.getElementById("bizLogo").value
  };
  const res = await fetch(`/api/business/current?businessId=${getBusinessId()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    notify("Business updated successfully", "Success");
    loadBusinesses(); // Refresh logo in switcher
  } else {
    notify("Failed to update business", "Error");
  }
}

async function deleteBusiness() {
  if (!confirm("CRITICAL WARNING: Are you sure you want to permanently delete this business and ALL its data? This cannot be undone.")) return;
  try {
    const res = await fetch(`/api/business/${getBusinessId()}`, { 
      method: "DELETE", 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (res.ok) {
      notify("Business deleted", "Success");
      setTimeout(() => window.location.reload(), 1500);
    } else {
      const err = await res.json();
      notify(err.error || "Failed to delete", "Error");
    }
  } catch (error) {
    notify(error.message, "Error");
  }
}

function startLivePolling() {
  if (liveCallsInterval) clearInterval(liveCallsInterval);
  fetchLiveCalls();
  liveCallsInterval = setInterval(fetchLiveCalls, 5000);
}

// Modal Management
let editingCategoryId = null;
let editingItemId = null;
let currentAliases = [];

function openCategoryModal(cat = null) {
  editingCategoryId = cat ? cat.id : null;
  const bType = localStorage.getItem("activeBusinessType") || "";
  const isOrder = ["order", "restaurant", "food"].some(t => bType.includes(t));
  
  document.getElementById("categoryModalTitle").innerText = cat ? "Edit Category" : (isOrder ? "Add Menu Category" : "Add Service Category");
  document.getElementById("catName").value = cat ? cat.name : "";
  document.getElementById("catDesc").value = cat ? cat.description : "";
  document.getElementById("catImage").value = cat ? cat.imageUrl : "";
  
  document.getElementById("categoryModal").classList.add("show");
  
  // Toggle delete button visibility
  const delBtn = document.getElementById("deleteCatBtn");
  if (delBtn) delBtn.style.display = cat ? "flex" : "none";
}

async function openItemModal(item = null) {
  editingItemId = item ? item.id : null;
  const bType = localStorage.getItem("activeBusinessType") || "";
  const isOrder = ["order", "restaurant", "food"].some(t => bType.includes(t));
  
  document.getElementById("itemModalTitle").innerText = item ? "Edit Details" : (isOrder ? "Add Menu Item" : "Add New Service");
  document.getElementById("durationLabel").innerText = isOrder ? "Prep Time (Minutes)" : "Service Duration (Minutes)";
  
  document.getElementById("itemName").value = item ? item.name : "";
  document.getElementById("itemPrice").value = item ? item.price : "";
  document.getElementById("itemDuration").value = item ? (item.serviceDuration || item.prepTime) : 30;
  document.getElementById("itemDesc").value = item ? item.description : "";
  document.getElementById("itemImage").value = item ? item.imageUrl : "";
  document.getElementById("itemPricingType").value = item ? (item.pricingType || "FIXED") : "FIXED";

  const catSelect = document.getElementById("itemCategory");
  const currentCats = isOrder ? allCategories : allServiceCategories;
  catSelect.innerHTML = currentCats.map(c => `<option value="${c.id}" ${item && item.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join("");

  // 🤖 Load Aliases
  currentAliases = item && item.aliases ? item.aliases.map(a => a.alias) : [];
  renderAliases();

  // 🤖 Enterprise Loading
  await loadModifierGroups();
  await loadAddons();

  // Populate Fields
  document.getElementById("itemCalories").value = item ? (item.calories || "") : "";
  document.getElementById("itemSpicyLevel").value = item ? (item.spicyLevel || 0) : 0;
  document.getElementById("itemAllergens").value = item ? (item.allergens || "") : "";
  
  document.getElementById("itemIsVeg").checked = item ? !!item.isVeg : false;
  document.getElementById("itemIsVegan").checked = item ? !!item.isVegan : false;
  document.getElementById("itemIsPopular").checked = item ? !!item.isPopular : false;
  document.getElementById("itemIsNew").checked = item ? !!item.isNew : false;
  
  if (item && item.availabilityRule) {
    document.getElementById("availStart").value = item.availabilityRule.startTime || "";
    document.getElementById("availEnd").value = item.availabilityRule.endTime || "";
    document.getElementById("itemStock").value = item.availabilityRule.stockQuantity || "";
  } else {
    document.getElementById("availStart").value = "";
    document.getElementById("availEnd").value = "";
    document.getElementById("itemStock").value = "";
  }

  // 🚀 Render Enterprise Sub-Sections
  renderVariants(item ? item.variants : []);
  renderModifierGroupSelection(item ? (item.modifierGroups ? item.modifierGroups.map(m => m.modifierGroupId) : []) : []);
  renderAddonSelection(item ? (item.itemAddons ? item.itemAddons.map(a => a.addonId) : []) : []);

  document.getElementById("itemModal").classList.add("show");
  switchTab('general', document.querySelector('.apex-tab-item')); // Reset to first tab
}

function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}

// Data Saving
async function saveCategory() {
  const formData = new FormData();
  formData.append("name", document.getElementById("catName").value);
  formData.append("description", document.getElementById("catDesc").value);
  formData.append("imageUrl", document.getElementById("catImage").value);
  formData.append("businessId", getBusinessId());

  const file = document.getElementById("catImageFile")?.files[0];
  if (file) {
    formData.append("image", file);
  }

  const method = editingCategoryId ? "PUT" : "POST";
  const isServices = currentSection === "services";
  const baseUrl = isServices ? "/api/services/categories" : "/api/menu/category";
  const url = editingCategoryId ? `${baseUrl}/${editingCategoryId}` : baseUrl;

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  if (res.ok) {
    notify(`Category ${editingCategoryId ? 'updated' : 'created'}`, "Success");
    closeModal('categoryModal');
    if (currentSection === "menu") loadCategories();
    else if (currentSection === "services") loadServiceCategories();
  } else {
    notify("Failed to save category", "Error");
  }
}

async function deleteCategory() {
  if (!editingCategoryId) return;
  if (!confirm("Are you sure? This will delete the category. Note: Items in this category might become orphaned or deleted depending on server rules.")) return;
  
  try {
    const isServices = currentSection === "services";
    const baseUrl = isServices ? "/api/services/categories" : "/api/menu/category";
    const res = await fetch(`${baseUrl}/${editingCategoryId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      notify("Category deleted", "Success");
      closeModal('categoryModal');
      if (currentSection === "menu") loadCategories();
      else if (currentSection === "services") loadServiceCategories();
    } else {
      notify("Failed to delete category", "Error");
    }
  } catch (err) {
    notify("Network error", "Error");
  }
}

async function saveItem() {
  const formData = new FormData();
  formData.append("name", document.getElementById("itemName").value);
  formData.append("price", document.getElementById("itemPrice").value);
  formData.append("description", document.getElementById("itemDesc").value);
  formData.append("imageUrl", document.getElementById("itemImage").value);
  formData.append("pricingType", document.getElementById("itemPricingType").value);
  formData.append("businessId", getBusinessId());
  formData.append("categoryId", document.getElementById("itemCategory").value);

  // 🚀 Enterprise Metadata
  formData.append("calories", document.getElementById("itemCalories").value);
  formData.append("spicyLevel", document.getElementById("itemSpicyLevel").value);
  formData.append("allergens", document.getElementById("itemAllergens").value);
  
  formData.append("isVeg", document.getElementById("itemIsVeg").checked);
  formData.append("isVegan", document.getElementById("itemIsVegan").checked);
  formData.append("isPopular", document.getElementById("itemIsPopular").checked);
  formData.append("isNew", document.getElementById("itemIsNew").checked);

  // 🚀 Variants
  const variants = [];
  document.querySelectorAll('.variant-row').forEach(row => {
    variants.push({
      name: row.querySelector('.v-name').value,
      price: row.querySelector('.v-price').value,
      calories: row.querySelector('.v-cal').value,
      isDefault: row.querySelector('.v-def').checked
    });
  });
  formData.append("variants", JSON.stringify(variants));

  // 🚀 Modifiers & Addons
  const mgIds = Array.from(document.querySelectorAll('input[name="modGroup"]:checked')).map(cb => cb.value);
  formData.append("modifierGroups", JSON.stringify(mgIds));

  const addonIds = Array.from(document.querySelectorAll('input[name="itemAddon"]:checked')).map(cb => cb.value);
  formData.append("itemAddons", JSON.stringify(addonIds));

  // 🚀 Availability
  const avail = {
    start: document.getElementById("availStart").value,
    end: document.getElementById("availEnd").value,
    stock: document.getElementById("itemStock").value,
    days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] // Default for now
  };
  formData.append("availabilityRule", JSON.stringify(avail));
  
  // 🤖 Add Aliases
  currentAliases.forEach(alias => {
    formData.append("aliases[]", alias);
  });

  const bType = localStorage.getItem("activeBusinessType") || "";
  const isOrder = ["order", "restaurant", "food"].some(t => bType.includes(t));
  formData.append(isOrder ? "prepTime" : "serviceDuration", document.getElementById("itemDuration").value);

  const file = document.getElementById("itemImageFile")?.files[0];
  if (file) {
    formData.append("image", file);
  }

  const method = editingItemId ? "PUT" : "POST";
  const url = editingItemId ? `/api/menu/item/${editingItemId}` : "/api/menu/item";

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  if (res.ok) {
    notify(`Item/Service ${editingItemId ? 'updated' : 'created'}`, "Success");
    closeModal('itemModal');
    const catId = document.getElementById("itemCategory").value;
    if (currentSection === "menu") loadItems(catId);
    else if (currentSection === "services") loadServices(catId);
  } else {
    notify("Failed to save", "Error");
  }
}

// 🤖 Alias UI Logic
function renderAliases() {
  const container = document.getElementById("aliasContainer");
  if (!container) return;
  container.innerHTML = currentAliases.map((alias, idx) => `
    <div class="badge" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; background: var(--bg-muted); color: var(--text-primary); border: 1px solid var(--border); font-family: 'JetBrains Mono'; font-size: 0.7rem;">
      ${alias}
      <i data-lucide="x" style="width: 12px; cursor: pointer; color: var(--text-muted);" onclick="removeAliasTag(${idx})"></i>
    </div>
  `).join("");
  if (window.lucide) window.lucide.createIcons();
}

function addAliasTag() {
  const input = document.getElementById("aliasInput");
  const val = input.value.trim().toLowerCase();
  if (val && !currentAliases.includes(val)) {
    currentAliases.push(val);
    input.value = "";
    renderAliases();
  }
}

function removeAliasTag(idx) {
  currentAliases.splice(idx, 1);
  renderAliases();
}

async function generateSuggestedAliases() {
  const name = document.getElementById("itemName").value;
  if (!name) return notify("Enter an item name first", "Warning");
  
  try {
    const res = await fetch(`/api/menu/suggest-aliases?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (result.success) {
      result.data.forEach(alias => {
        if (!currentAliases.includes(alias)) currentAliases.push(alias);
      });
      renderAliases();
      notify("AI Suggestions added", "Success");
    }
  } catch (err) {
    notify("Failed to get suggestions", "Error");
  }
}

// 🚀 Enterprise UI Logic
function switchTab(tabId, el) {
  document.querySelectorAll('.apex-tab-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.apex-tab-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

function renderVariants(variants = []) {
  const container = document.getElementById("variantRepeater");
  container.innerHTML = "";
  if (variants.length === 0) {
    addVariantRow(); // Add one empty row
  } else {
    variants.forEach(v => addVariantRow(v));
  }
}

function addVariantRow(v = null) {
  const container = document.getElementById("variantRepeater");
  const div = document.createElement("div");
  div.className = "variant-row repeater-row";
  div.innerHTML = `
    <div>
      <label style="font-size: 0.65rem;">Size Name</label>
      <input type="text" class="form-control v-name" value="${v ? v.name : ''}" placeholder="Large" />
    </div>
    <div>
      <label style="font-size: 0.65rem;">Price ($)</label>
      <input type="number" class="form-control v-price" value="${v ? v.price : ''}" placeholder="0.00" />
    </div>
    <div>
      <label style="font-size: 0.65rem;">Calories</label>
      <input type="number" class="form-control v-cal" value="${v ? (v.calories || '') : ''}" placeholder="0" />
    </div>
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <input type="radio" name="defaultVariant" class="v-def" ${v && v.isDefault ? 'checked' : ''} />
      <i data-lucide="trash-2" style="width: 14px; color: var(--danger); cursor: pointer;" onclick="this.closest('.variant-row').remove()"></i>
    </div>
  `;
  container.appendChild(div);
  if (window.lucide) window.lucide.createIcons();
}

let allModifierGroups = [];
async function loadModifierGroups() {
  const res = await fetch(`/api/menu/modifier-groups?businessId=${getBusinessId()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await res.json();
  allModifierGroups = result.data || [];
}

function renderModifierGroupSelection(selectedIds = []) {
  const container = document.getElementById("modifierGroupList");
  container.innerHTML = allModifierGroups.map(mg => `
    <label class="multi-select-item">
      <input type="checkbox" name="modGroup" value="${mg.id}" ${selectedIds.includes(mg.id) ? 'checked' : ''} />
      <span>${mg.name} <small style="color: var(--text-muted)">(${mg.options.length} options)</small></span>
    </label>
  `).join("") || '<p style="font-size: 0.75rem; color: var(--text-muted)">No groups found. Create one in Menu Settings.</p>';
}

let allBusinessAddons = [];
async function loadAddons() {
  const res = await fetch(`/api/menu/addons?businessId=${getBusinessId()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await res.json();
  allBusinessAddons = result.data || [];
}

function renderAddonSelection(selectedIds = []) {
  const container = document.getElementById("addonList");
  container.innerHTML = allBusinessAddons.map(a => `
    <label class="multi-select-item">
      <input type="checkbox" name="itemAddon" value="${a.id}" ${selectedIds.includes(a.id) ? 'checked' : ''} />
      <span>${a.name} <small style="color: var(--text-muted)">($${a.price})</small></span>
    </label>
  `).join("") || '<p style="font-size: 0.75rem; color: var(--text-muted)">No global addons found.</p>';
}

async function editItem(id) {
  const catId = currentSection === "menu" ? currentCategoryId : activeServiceCategoryId;
  const res = await fetch(`/api/menu/items?businessId=${getBusinessId()}&categoryId=${catId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await res.json();
  const item = result.data.find(i => i.id === id);
  if (item) openItemModal(item);
}

async function deleteItem(id) {
  if (!confirm("Are you sure you want to delete this item/service?")) return;
  const res = await fetch(`/api/menu/item/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    notify("Deleted", "Success");
    if (currentSection === "menu") loadItems(currentCategoryId);
    else if (currentSection === "services") loadServices(activeServiceCategoryId);
  }
}

// Global Search
function handleGlobalSearch(query) {
  console.log("Search query:", query);
}

// Business Management
async function saveBusiness() {
  const selectedDays = Array.from(document.querySelectorAll('input[name="bizDays"]:checked')).map(cb => cb.value).join(',');
  const formData = new FormData();
  
  formData.append("name", document.getElementById("bizName").value);
  formData.append("phoneNumber", document.getElementById("bizPhone").value);
  formData.append("address", document.getElementById("bizAddress").value);
  formData.append("openTime", document.getElementById("bizOpenTime").value);
  formData.append("closeTime", document.getElementById("bizCloseTime").value);
  formData.append("timings", selectedDays);
  formData.append("currency", document.getElementById("bizCurrency").value);
  formData.append("taxRate", parseFloat(document.getElementById("bizTaxRate").value) || 0);
  formData.append("logoUrl", document.getElementById("bizLogo").value);
  
  let aiVoiceId = document.getElementById("aiVoiceId")?.value || "";
  if (aiVoiceId === "custom") {
    aiVoiceId = document.getElementById("customAiVoiceId")?.value || "";
  }
  formData.append("aiVoiceId", aiVoiceId);
  formData.append("aiPersonality", document.getElementById("aiPersonality")?.value || 'friendly');
  formData.append("aiName", document.getElementById("aiName")?.value || 'Sarah');
  formData.append("appointmentDuration", parseInt(document.getElementById("appointmentDuration")?.value) || 30);
  
  // Restaurant Specifics
  if (document.getElementById("deliveryAvailable")) {
    formData.append("deliveryAvailable", document.getElementById("deliveryAvailable").checked);
    formData.append("deliveryRadius", document.getElementById("deliveryRadius").value);
    formData.append("dineInAvailable", document.getElementById("dineInAvailable").checked);
    formData.append("takeawayAvailable", document.getElementById("takeawayAvailable").checked);
    formData.append("reservationsEnabled", document.getElementById("reservationsEnabled").checked);
  }

  const logoFile = document.getElementById("bizLogoFile")?.files[0];
  if (logoFile) {
    formData.append("logo", logoFile);
  }

  try {
    const res = await fetch(`/api/business/current?businessId=${getBusinessId()}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    if (res.ok) {
      const result = await res.json();
      notify("Business updated successfully", "Success");
      // Refresh logo in header if changed
      const headerLogo = document.querySelector(".nav-logo img");
      if (headerLogo && result.data.logoUrl) headerLogo.src = result.data.logoUrl;
      // Update the URL field in UI if it was a file upload
      if (document.getElementById("bizLogo")) document.getElementById("bizLogo").value = result.data.logoUrl;
    } else {
      const err = await res.json();
      notify(err.error || "Failed to update business", "Error");
    }
  } catch (err) {
    notify("Network error", "Error");
  }
}

async function deleteBusiness() {
  if (!confirm("CRITICAL: Are you sure? This will delete ALL data for this business. This cannot be undone.")) return;
  try {
    const res = await fetch(`/api/business/${getBusinessId()}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      notify("Business deleted", "Success");
      window.location.reload();
    }
  } catch (err) {
    notify("Failed to delete", "Error");
  }
}

// =============================================================================
// THEME MANAGEMENT
// =============================================================================

function toggleThemeMenu() {
  const menu = document.getElementById("themeMenu");
  if (!menu) return;
  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

async function applyTheme(themeName) {
  document.body.setAttribute("data-theme", themeName);
  localStorage.setItem("apex_theme", themeName);
  
  // Update local user object
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (user && user.id) {
    user.theme = themeName;
    localStorage.setItem("user", JSON.stringify(user));
  }

  const menu = document.getElementById("themeMenu");
  if (menu) menu.style.display = "none";
  
  console.log(`[Apex] Theme applied: ${themeName}`);

  // Persist to DB
  try {
    await fetch("/api/auth/update-theme", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (window.token || localStorage.getItem("accessToken"))
      },
      body: JSON.stringify({ theme: themeName })
    });
  } catch (e) { console.warn("Theme sync failed:", e); }
}

// Close menu on click outside
document.addEventListener("click", (e) => {
  const menu = document.getElementById("themeMenu");
  const btn = document.getElementById("themeBtn");
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.style.display = "none";
  }
});

// Load saved theme on boot
(function initTheme() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const savedTheme = user.theme || localStorage.getItem("apex_theme") || "default";
  document.body.setAttribute("data-theme", savedTheme);
})();

// =============================================================================
// GLOBAL LOGOUT
// =============================================================================

/* ==========================================================================
   INTEGRATION SYSTEM
   ========================================================================== */
async function connectIntegration(provider) {
  const btn = document.getElementById(`btn-${provider}`);
  const originalText = btn.innerText;
  btn.innerText = "Connecting...";
  btn.disabled = true;

  try {
    const res = await fetch("/api/integrations/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ provider, businessId: getBusinessId() })
    });
    const result = await res.json();
    if (result.success) {
      notify(`${provider} Connected`, "Success");
      loadSection("integrations");
    } else {
      notify(result.error || "Connection failed", "Error");
    }
  } catch (err) {
    notify("Network error", "Error");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

function openSettings(provider) {
  const modal = document.getElementById("integrationSettingsModal");
  document.getElementById("currentIntegrationId").value = provider;
  document.getElementById("settingsModalTitle").innerText = `${provider} Integration Configuration`;
  
  // Reset fields
  document.getElementById("cloverFields").style.display = (provider === 'CLOVER') ? 'block' : 'none';
  
  modal.style.display = "flex";
  fetchIntegrationSettings(provider);
}

function closeSettings() {
  document.getElementById("integrationSettingsModal").style.display = "none";
}

async function fetchIntegrationSettings(provider) {
  try {
    const res = await fetch(`/api/integrations/get-settings?provider=${provider}&businessId=${getBusinessId()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (result.success && result.data) {
      const s = result.data;
      document.getElementById("syncMenuToggle").checked = s.syncMenu;
      document.getElementById("pushOrderToggle").checked = s.pushOrders;
      document.getElementById("inventorySyncToggle").checked = s.syncInventory;
      document.getElementById("settingsStatus").innerText = s.isConnected ? "CONNECTED" : "DISCONNECTED";
      document.getElementById("settingsLastSync").innerText = s.lastSync ? new Date(s.lastSync).toLocaleString() : "Never";
      
      if (provider === 'CLOVER' && s.credentials) {
        document.getElementById("cloverMerchantId").value = s.credentials.merchantId || "";
        document.getElementById("cloverSandboxToggle").checked = s.credentials.isSandbox || false;
      }
    }
  } catch (err) {
    console.error("Fetch settings error:", err);
  }
}

async function saveIntegrationSettings() {
  const provider = document.getElementById("currentIntegrationId").value;
  const data = {
    provider,
    businessId: getBusinessId(),
    syncMenu: document.getElementById("syncMenuToggle").checked,
    pushOrders: document.getElementById("pushOrderToggle").checked,
    syncInventory: document.getElementById("inventorySyncToggle").checked,
    credentials: {}
  };

  if (provider === 'CLOVER') {
    data.credentials = {
      merchantId: document.getElementById("cloverMerchantId").value,
      accessToken: document.getElementById("cloverAccessToken").value,
      isSandbox: document.getElementById("cloverSandboxToggle").checked
    };
  }

  try {
    const res = await fetch("/api/integrations/update-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      notify("Settings Saved", "Success");
      closeSettings();
      loadSection("integrations");
    }
  } catch (err) {
    notify("Save failed", "Error");
  }
}

async function disconnectIntegrationAction() {
  const provider = document.getElementById("currentIntegrationId").value;
  if (!confirm(`Are you sure you want to disconnect ${provider}?`)) return;

  try {
    const res = await fetch("/api/integrations/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ provider, businessId: getBusinessId() })
    });
    if (res.ok) {
      notify("Disconnected", "Success");
      closeSettings();
      loadSection("integrations");
    }
  } catch (err) {
    notify("Disconnect failed", "Error");
  }
}

async function refreshLogs() {
  const logContainer = document.getElementById("syncLogs");
  logContainer.innerHTML = '<div style="opacity:0.5;">[SYSTEM] Fetching latest sync logs...</div>';
  
  try {
    const res = await fetch(`/api/integrations/logs?businessId=${getBusinessId()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (result.success) {
      logContainer.innerHTML = result.data.map(log => 
        `<div style="margin-bottom:4px;"><span style="color:#555;">[${new Date(log.timestamp).toLocaleTimeString()}]</span> <span style="color:${log.type === 'error' ? '#f55' : '#0f0'};">${log.message}</span></div>`
      ).join("") || '<div style="opacity:0.5;">No logs found.</div>';
    }
  } catch (err) {
    logContainer.innerHTML = '<div style="color:#f55;">[ERROR] Failed to fetch logs.</div>';
  }
}

// Global Init
document.addEventListener("DOMContentLoaded", async () => {
  await loadBusinesses();
  
  // Set profile info
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (user && user.email) {
    const profileName = document.getElementById("headerProfileName");
    const profileRole = profileName?.nextElementSibling;
    const avatarText = document.getElementById("headerAvatarText");

    if (profileName) profileName.innerText = user.email.split("@")[0].charAt(0).toUpperCase() + user.email.split("@")[0].slice(1);
    if (profileRole) profileRole.innerText = user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
    if (avatarText) avatarText.innerText = user.email.substring(0, 2).toUpperCase();
  }

  // Auto-apply branding from active business
  const select = document.getElementById("businessSwitcher");
  if (select && select.selectedIndex >= 0) {
    const logo = select.options[select.selectedIndex].dataset.logo;
    if (logo) updateTenantBranding(logo);
  }

  // Auto-load specialized workspace based on role
  const role = user.role ? user.role.toUpperCase() : "ADMIN";
  if (role === "DEVELOPER") loadSection("dev-ops");
  else if (role === "MANAGER") loadSection("manager-kpi");
  else if (role === "PRODUCT") loadSection("product-trends");
  else if (role === "AGENT") loadSection("agent-inbox");
  else loadSection("dashboard");
});

function updateTenantBranding(logoUrl) {
  if (!logoUrl) return;
  
  // Update Favicon
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.getElementsByTagName('head')[0].appendChild(link);
  }
  link.href = logoUrl;

  // Update Header Profile Image
  const avatarImg = document.getElementById("headerAvatarImg");
  const avatarText = document.getElementById("headerAvatarText");
  if (avatarImg && logoUrl) {
    avatarImg.src = logoUrl;
    avatarImg.style.display = "block";
    if (avatarText) avatarText.style.display = "none";
  }
}
// 🚀 Modifier Group Logic
function openModifierGroupModal() {
  document.getElementById("mgName").value = "";
  document.getElementById("mgOptionsRepeater").innerHTML = "";
  addMgOptionRow();
  document.getElementById("modifierGroupModal").classList.add("show");
}

function addMgOptionRow(v = null) {
  const container = document.getElementById("mgOptionsRepeater");
  const div = document.createElement("div");
  div.className = "repeater-row";
  div.style.gridTemplateColumns = "1fr 1fr auto";
  div.innerHTML = `
    <div>
      <input type="text" class="form-control mg-opt-name" value="${v ? v.name : ''}" placeholder="Option name" />
    </div>
    <div>
      <input type="number" class="form-control mg-opt-price" value="${v ? v.price : ''}" placeholder="Price" />
    </div>
    <i data-lucide="trash-2" style="width: 14px; color: var(--danger); cursor: pointer;" onclick="this.closest('.repeater-row').remove()"></i>
  `;
  container.appendChild(div);
  if (window.lucide) window.lucide.createIcons();
}

async function saveModifierGroup() {
  const name = document.getElementById("mgName").value;
  const selectionType = document.getElementById("mgSelectionType").value;
  const options = [];
  document.querySelectorAll('.mg-opt-name').forEach((el, idx) => {
    const priceEl = document.querySelectorAll('.mg-opt-price')[idx];
    if (el.value) options.push({ name: el.value, price: priceEl.value });
  });

  const res = await fetch("/api/menu/modifier-group", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ businessId: getBusinessId(), name, selectionType, options })
  });

  if (res.ok) {
    notify("Modifier group created", "Success");
    closeModal('modifierGroupModal');
    // Preserve currently selected IDs
    const currentSelected = Array.from(document.querySelectorAll('input[name="modGroup"]:checked')).map(cb => cb.value);
    await loadModifierGroups();
    renderModifierGroupSelection(currentSelected);
  }
}

// 🚀 Addon Logic
function openAddonModal() {
  document.getElementById("addonName").value = "";
  document.getElementById("addonPrice").value = "";
  document.getElementById("addonModal").classList.add("show");
}

async function saveAddon() {
  const name = document.getElementById("addonName").value;
  const price = document.getElementById("addonPrice").value;

  const res = await fetch("/api/menu/addon", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ businessId: getBusinessId(), name, price })
  });

  if (res.ok) {
    notify("Addon created", "Success");
    closeModal('addonModal');
    // Preserve currently selected IDs
    const currentSelected = Array.from(document.querySelectorAll('input[name="itemAddon"]:checked')).map(cb => cb.value);
    await loadAddons();
    renderAddonSelection(currentSelected);
  }
}
