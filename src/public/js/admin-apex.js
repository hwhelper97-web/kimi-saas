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
const socket = io();

socket.on("connect", () => {
  console.log("[Socket] Connected to server");
  const bId = getBusinessId();
  if (bId) socket.emit("join-business", bId);
});

socket.on("new_appointment", (data) => {
  notify(`New Booking: ${data.customerName || 'Voice Customer'} - ${data.serviceName || 'General Service'}`, "Appointment Received");
  if (currentSection === "dashboard" || currentSection === "appointments") loadSection(currentSection);
});

socket.on("new_order", (data) => {
  notify(`New Order: ${data.customerName || 'Voice Customer'} - $${data.total.toFixed(2)}`, "Order Received");
  if (currentSection === "dashboard" || currentSection === "orders") loadSection(currentSection);
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
  window.location.href = "/login";
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
  if (title.toLowerCase().includes("order")) {
    iconBox.style.background = "rgba(var(--success-rgb), 0.1)";
    iconBox.style.color = "var(--success)";
    iconBox.innerHTML = '<i data-lucide="shopping-bag"></i>';
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
  
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
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
      `<option value="${b.id}" data-type="${b.type}" ${b.id === getBusinessId() ? 'selected' : ''}>${b.name}</option>`
    ).join("");

    if (!getBusinessId()) {
      localStorage.setItem("activeBusinessId", result.data[0].id);
      localStorage.setItem("activeBusinessType", result.data[0].type);
    } else {
      const active = result.data.find(b => b.id === getBusinessId());
      if (active) localStorage.setItem("activeBusinessType", active.type);
    }

    renderSidebar();
  } catch (err) {
    console.error("Load businesses error:", err);
  }
}

function switchBusiness(id) {
  const select = document.getElementById("businessSwitcher");
  const option = select.options[select.selectedIndex];
  if (option) localStorage.setItem("activeBusinessType", option.dataset.type);
  
  localStorage.setItem("activeBusinessId", id);
  socket.emit("join-business", id);
  renderSidebar();
  loadSection(currentSection);
}

function renderSidebar() {
  const nav = document.getElementById("sidebarNav");
  if (!nav) return;

  const bType = localStorage.getItem("activeBusinessType");
  const isOrder = bType ? ["order", "restaurant", "food"].some(t => bType.toLowerCase().includes(t)) : false;
  const isSuper = decodedToken && decodedToken.role === "SUPERADMIN";

  let html = `
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

    <div class="nav-group-label">Management</div>
  `;

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
    <a class="apex-nav-item ${currentSection === 'business' ? 'active' : ''}" onclick="loadSection('business')">
      <i data-lucide="settings"></i>
      <span>Business Settings</span>
    </a>
  `;

  nav.innerHTML = html;
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
  const bType = localStorage.getItem("activeBusinessType");
  const isOrder = bType ? ["order", "restaurant", "food"].some(t => bType.toLowerCase().includes(t)) : false;

  if (titleEl) {
    if (section === 'dashboard') titleEl.innerText = isOrder ? "Restaurant Analytics" : "Clinic Insights";
    else if (section === 'menu') titleEl.innerText = "Menu Management";
    else if (section === 'orders') titleEl.innerText = "Order History";
    else if (section === 'appointment') titleEl.innerText = "Booking Management";
    else if (section === 'services') titleEl.innerText = "Service & Treatment Menu";
    else if (section === 'call') titleEl.innerText = "AI Call Center";
    else if (section === 'support-center') titleEl.innerText = "Support Center";
    else if (section === 'tickets') titleEl.innerText = "Your Tickets";
    else if (section === 'integrations') titleEl.innerText = "";
    else if (section === 'business') titleEl.innerText = "";
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
    else if (section === 'integrations') subEl.innerText = "";
    else if (section === 'business') subEl.innerText = "";
  }

  // Handle header action button
  const header = document.getElementById("pageHeader");
  let actionBtn = document.getElementById("headerActionBtn");
  if (actionBtn) actionBtn.remove();

  if (section === 'support-center') {
    const btn = document.createElement("button");
    btn.id = "headerActionBtn";
    btn.className = "action-button";
    btn.style = "position: absolute; top: 0; right: 0; background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 0.6rem 1.2rem; border-radius: 10px; font-weight: 700; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; color: white;";
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
  if (titleEl) titleEl.innerText = isOrder ? "Restaurant Analytics" : "Clinic Insights";
  if (subEl) subEl.innerText = isOrder ? "Monitor your orders, revenue, and AI sales performance." : "Track bookings, patient flow, and service analytics.";

  try {
    const bId = getBusinessId();
    const res = await fetch(`/api/dashboard/analytics?businessId=${bId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) return;

    // Stats Grid
    const statsGrid = document.getElementById("statsGrid");
    if (statsGrid) {
      let stats = [];
      if (isOrder) {
        stats = [
          { label: "Total Orders", value: result.data.totals.totalOrders || 0, icon: "package" },
          { label: "Sales Revenue", value: "$" + (result.data.totals.totalRevenue || 0).toFixed(2), icon: "dollar-sign" },
          { label: "Order Success Rate", value: (result.data.totals.aiSuccessRate || 0) + "%", icon: "zap" },
          { label: "AI Minutes", value: result.data.totals.totalMinutes || 0, icon: "clock" }
        ];
      } else {
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

    initDashboardCharts(result.data.charts, isOrder);
    
    // Start Live Polling
    startLivePolling();
  } catch (err) {
    console.error("Dashboard render error:", err);
  }
}

function initDashboardCharts(chartData, isOrder) {
  const revCtx = document.getElementById("revenueChart");
  if (revCtx && chartData.revenueChart) {
    revenueChartInstance = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: chartData.revenueChart.labels,
        datasets: [{
          label: isOrder ? 'Sales Revenue' : 'Projected Revenue',
          data: chartData.revenueChart.values,
          borderColor: '#00bcd4',
          tension: 0.4,
          fill: true,
          backgroundColor: 'rgba(0, 188, 212, 0.1)'
        }]
      },
      options: { 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  const callsCtx = document.getElementById("callsChart");
  if (callsCtx && chartData.callsChart) {
    callsChartInstance = new Chart(callsCtx, {
      type: 'bar',
      data: {
        labels: chartData.callsChart.labels,
        datasets: [{
          label: 'Calls',
          data: chartData.callsChart.values,
          backgroundColor: '#00bcd4',
          borderRadius: 4
        }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}

async function fetchLiveCalls() {
  try {
    const bId = getBusinessId();
    const res = await fetch(`/api/dashboard/live-calls?businessId=${bId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    const container = document.getElementById("liveCallsContainer");
    if (!container) return;

    if (result.data && result.data.length) {
      container.innerHTML = result.data.map(c => `
        <div class="live-call-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 1.25rem; border-radius: 1rem; margin-bottom: 1rem;">
          <div style="margin-bottom: 0.75rem;">
            <p style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 0.25rem;">${c.name || 'Voice Customer'}</p>
            <p style="font-size: 1.125rem; font-weight: 700; color: white;">${c.fromNumber}</p>
          </div>
          <div style="background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 0.5rem; display: flex; align-items: center; gap: 1rem; font-size: 0.75rem;">
            <div style="display:flex; align-items:center; gap:0.4rem; color: var(--primary);">
              <i data-lucide="activity" style="width:14px; height:14px;"></i>
              <span>${Math.floor(c.duration/60)}m ${c.duration%60}s</span>
          </div>
        </div>
      `).join("");
      if (window.lucide) window.lucide.createIcons();
    } else {
      container.innerHTML = '<div class="empty-state">No active calls.</div>';
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

function openItemModal(item = null) {
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

  // Load categories for select
  const catSelect = document.getElementById("itemCategory");
  const currentCats = isOrder ? allCategories : allServiceCategories;
  catSelect.innerHTML = currentCats.map(c => `<option value="${c.id}" ${item && item.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join("");

  document.getElementById("itemModal").classList.add("show");
  
  // Toggle delete button visibility
  const delBtn = document.getElementById("deleteItemBtn");
  if (delBtn) delBtn.style.display = item ? "flex" : "none";
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
  const url = editingCategoryId ? `/api/menu/category/${editingCategoryId}` : "/api/menu/category";

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
    const res = await fetch(`/api/menu/category/${editingCategoryId}`, {
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
  formData.append("categoryId", document.getElementById("itemCategory").value);
  formData.append("pricingType", document.getElementById("itemPricingType").value);
  formData.append("businessId", getBusinessId());

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
  formData.append("aiVoiceId", document.getElementById("aiVoiceId")?.value || "");
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

function applyTheme(themeName) {
  document.body.setAttribute("data-theme", themeName);
  localStorage.setItem("apex_theme", themeName);
  
  const menu = document.getElementById("themeMenu");
  if (menu) menu.style.display = "none";
  
  console.log(`[Apex] Theme applied: ${themeName}`);
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
  const savedTheme = localStorage.getItem("apex_theme") || "default";
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
  renderSidebar();
  await loadSection("dashboard");
});
