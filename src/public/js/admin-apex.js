let currentSection = "dashboard";
let currentCategoryId = null;
let isListView = false;
let selectedItemIds = [];
let revenueChartInstance = null;
let callsChartInstance = null;
let liveCallsInterval = null;

// Ensure token exists
const token = localStorage.getItem("accessToken");
const decodedToken = token ? JSON.parse(atob(token.split(".")[1])) : null;

if (!token || !decodedToken || decodedToken.exp < Date.now() / 1000) {
  logout();
}

// Socket Setup
const socket = io();
socket.on("connect", () => {
  const businessId = getBusinessId();
  if (businessId) socket.emit("join-business", businessId);
});

socket.on("new_appointment", (data) => {
  notify(`New booking: ${data.name} (${data.service})`, "Success");
  if (["dashboard", "appointments"].includes(currentSection)) loadSection(currentSection);
});

socket.on("new_order", (data) => {
  notify(`New order: ${data.name}`, "Success");
  if (["dashboard", "orders"].includes(currentSection)) loadSection(currentSection);
});

socket.on("live-transcript", (data) => {
  const container = document.getElementById("liveFeedContainer");
  const transcriptEl = document.getElementById("liveTranscript");
  const callIdEl = document.getElementById("liveCallId");

  if (container && transcriptEl) {
    container.style.display = "block";
    if (callIdEl) callIdEl.innerText = `CALL_ID: ${data.callId.substring(0,8)}`;
    
    const p = document.createElement("p");
    p.style.marginBottom = "0.5rem";
    p.innerHTML = `<span style="color:var(--primary); font-weight:700;">[Live]</span> ${data.text}`;
    transcriptEl.appendChild(p);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;

    // Auto-hide after 30 seconds of inactivity
    clearTimeout(window.liveFeedTimeout);
    window.liveFeedTimeout = setTimeout(() => {
      container.style.display = "none";
      transcriptEl.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">Waiting for incoming voice stream...</p>';
    }, 30000);
  }
});

// Start app
document.addEventListener("DOMContentLoaded", () => {
  loadBusinesses().then(() => {
    applyTheme(localStorage.getItem("kimi_theme") || "dark");
    
    // Load cached branding immediately for persistence
    const cachedName = localStorage.getItem("kimi_brand_name");
    const cachedLogo = localStorage.getItem("kimi_brand_logo");
    if (cachedName || cachedLogo) {
      applyBrandName(cachedName, cachedLogo);
    } else {
      applyBrandName(localStorage.getItem("kimi_brand") || "Nexton Technologies LLC");
    }

    renderSidebar();
    loadSection("dashboard");
  });
});

/* ==========================================================================
   HELPERS
   ========================================================================== */
function logout() {
  localStorage.removeItem("accessToken");
  sessionStorage.removeItem("accessToken");
  window.location.href = "/login";
}

function notify(message, title = "Notification") {
  const box = document.getElementById("notificationBox");
  if (!box) return;
  document.getElementById("notificationTitle").innerText = title;
  document.getElementById("notificationText").innerText = message;
  box.style.transform = "translateX(0)";
  document.getElementById("notifySound").play().catch(() => {});
  setTimeout(() => box.style.transform = "translateX(120%)", 4000);
}

function getBusinessId() {
  return localStorage.getItem("activeBusinessId") || decodedToken?.businessId;
}

function getBusinessType() {
  const select = document.getElementById("businessSwitcher");
  if (!select) return "appointment";
  const option = select.options[select.selectedIndex];
  return option ? option.dataset.type : "appointment";
}

function isOrderBusiness() {
  const type = (getBusinessType() || "").toLowerCase();
  return ["order", "restaurant", "food", "shop", "store"].some((t) => type.includes(t));
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("kimi_theme", theme);
}

function applyBrandName(name, logoUrl = null) {
  const textEl = document.getElementById("brandLogoText");
  const imgEl = document.getElementById("brandLogoImg");
  const placeholderEl = document.getElementById("brandLogoPlaceholder");

  if (textEl) textEl.innerText = name || "Nexton Technologies LLC";
  
  if (imgEl && logoUrl) {
    imgEl.src = logoUrl;
    imgEl.style.display = "block";
    if (placeholderEl) placeholderEl.style.display = "none";
  } else if (imgEl) {
    imgEl.style.display = "none";
    if (placeholderEl) placeholderEl.style.display = "block";
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("show");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}

async function handleFileUpload(input, targetId) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append("file", file);
  
  notify("Uploading image...", "Info");
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById(targetId).value = result.url;
      if (targetId === "itemImage") updateImagePreview(result.url);
      notify("Image uploaded successfully", "Success");
    } else {
      notify(result.error || "Upload failed", "Error");
    }
  } catch (err) {
    notify("Upload failed: " + err.message, "Error");
  }
}

/* ==========================================================================
   NAVIGATION & BUSINESS SWITCHING
   ========================================================================== */
async function loadBusinesses() {
  const select = document.getElementById("businessSwitcher");
  try {
    const res = await fetch("/api/business/all", { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json();
    
    if (!result.success || !result.data.length) {
      select.innerHTML = `<option value="">No businesses found</option>`;
      return;
    }

    select.innerHTML = result.data.map(b => 
      `<option value="${b.id}" data-type="${b.type}">${b.name}</option>`
    ).join("");

    const active = getBusinessId();
    if (active && result.data.some(b => b.id === active)) {
      select.value = active;
    } else {
      select.value = result.data[0].id;
      localStorage.setItem("activeBusinessId", result.data[0].id);
    }
    
    if (decodedToken && decodedToken.role !== "SUPERADMIN") {
      select.style.display = "none";
    }
    
    // Initial branding fetch for the selected business
    fetchBusinessBranding(select.value);
  } catch (err) {
    console.error("Load businesses error:", err);
  }
}

function switchBusiness(id) {
  localStorage.setItem("activeBusinessId", id);
  if (liveCallsInterval) { clearInterval(liveCallsInterval); liveCallsInterval = null; }
  socket.emit("join-business", id);
  
  fetchBusinessBranding(id);
  renderSidebar();
  loadSection("dashboard");
}

async function fetchBusinessBranding(id) {
  try {
    const res = await fetch(`/api/business/current?businessId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json();
    if (result.success && result.data) {
      applyBrandName(result.data.name, result.data.logoUrl);
    }
  } catch (err) {
    console.error("Branding fetch error:", err);
  }
}

function renderSidebar() {
  const nav = document.getElementById("sidebarNav");
  let groups = [
    {
      label: "Overview",
      items: [{ name: "Dashboard", key: "dashboard", icon: "layout-dashboard" }]
    },
    {
      label: "Management",
      items: []
    },
    {
      label: "System",
      items: [
        { name: "Staff", key: "staff", icon: "users" },
        { name: "Settings", key: "settings", icon: "settings" }
      ]
    }
  ];

  const management = groups[1].items;
  if (isOrderBusiness()) {
    management.push({ name: "Menu", key: "menu", icon: "utensils-crossbones" });
    management.push({ name: "Orders", key: "orders", icon: "shopping-bag" });
  } else {
    management.push({ name: "Appointments", key: "appointments", icon: "calendar" });
  }
  management.push({ name: "AI Calls", key: "calls", icon: "phone" });
  management.push({ name: "Business Profile", key: "business", icon: "building-2" });

  if (decodedToken && decodedToken.role === "SUPERADMIN") {
    groups[2].items.push({ name: "Create Business", key: "create-business", icon: "plus-circle" });
  }

  nav.innerHTML = groups.map(group => `
    <div class="nav-group-label">${group.label}</div>
    ${group.items.map(item => `
      <a class="apex-nav-item ${item.key === currentSection ? 'active' : ''}" onclick="loadSection('${item.key}')">
        <i data-lucide="${item.icon}"></i>
        <span>${item.name}</span>
      </a>
    `).join("")}
  `).join("");

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ==========================================================================
   SECTION LOADING
   ========================================================================== */
async function loadSection(section) {
  currentSection = section;
  renderSidebar();
  
  if (liveCallsInterval) { clearInterval(liveCallsInterval); liveCallsInterval = null; }
  if (revenueChartInstance) revenueChartInstance.destroy();
  if (callsChartInstance) callsChartInstance.destroy();

  const titleEl = document.getElementById("pageTitle");
  const subEl = document.getElementById("pageSubtitle");
  const content = document.getElementById("contentArea");
  const dashboardGrid = document.getElementById("dashboardGrid");
  
  if (titleEl) titleEl.innerText = section.replace("-", " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  if (dashboardGrid) dashboardGrid.style.display = (section === "dashboard") ? "block" : "none";
  if (content) content.innerHTML = "<div style='display:flex; align-items:center; gap:0.5rem; color:var(--text-muted); padding: 2rem;'><i data-lucide='loader-2' class='spin'></i> Loading...</div>";
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    if (section === "dashboard") {
      if (subEl) subEl.innerText = "Welcome back. Here's what's happening with your business today.";
      if (content) content.innerHTML = ""; 
      await renderDashboard();
    } else {
      if (subEl) subEl.innerText = `Manage your ${section.replace("-", " ")} and system configuration.`;
      if (section === "appointments") await renderAppointments(content);
      else if (section === "orders") await renderOrders(content);
      else if (section === "calls") await renderCalls(content);
      else if (section === "business") await renderBusinessInfo(content);
      else if (section === "menu") await renderMenu(content);
      else if (section === "staff") await renderStaff(content);
      else if (section === "settings") await renderSettings(content);
      else if (section === "create-business") await renderCreateBusiness(content);
    }
  } catch (err) {
    if (content) content.innerHTML = `<div class="apex-card" style="border-color: var(--danger); color: var(--danger);">Failed to load ${section}: ${err.message}</div>`;
  }
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ==========================================================================
   DASHBOARD
   ========================================================================== */
async function renderDashboard() {
  const res = await fetch(`/api/dashboard/analytics?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  if (!result.success) throw new Error("Analytics failed");

  const data = result.data.totals;
  const statsGrid = document.getElementById("statsGrid");

  const stats = [
    { label: "Total Revenue", value: `$${(data.totalRevenue || 0).toFixed(2)}`, icon: "dollar-sign", trend: "+12.5%", up: true },
    { label: "Total Calls", value: data.totalCalls, icon: "phone", trend: "+5.2%", up: true },
    { label: isOrderBusiness() ? 'Total Orders' : 'Total Appointments', value: data.totalOrders, icon: "shopping-bag", trend: "+8.1%", up: true },
    { label: "AI Success Rate", value: `${data.aiSuccessRate}%`, icon: "zap", trend: "Stable", up: true }
  ];

  if (statsGrid) {
    statsGrid.innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">${s.label}</span>
          <div class="stat-icon"><i data-lucide="${s.icon}"></i></div>
        </div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-footer">
          <span class="${s.up ? 'trend-up' : 'trend-down'}">${s.trend}</span>
          <span style="color: var(--text-muted);">from last month</span>
        </div>
      </div>
    `).join("");
  }

  liveCallsInterval = setInterval(fetchLiveCalls, 3000);
  fetchLiveCalls();
  initCharts(result.data.charts);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function fetchLiveCalls() {
  const res = await fetch(`/api/dashboard/live-calls?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const container = document.getElementById("liveCallsContainer");
  if (!container) return;
  
  if (!result.success || !result.data.length) {
    container.innerHTML = `<div class="empty-state">System monitoring active. No live calls.</div>`;
    return;
  }

  container.innerHTML = result.data.map(call => `
    <div class="apex-card" style="padding: 1rem; margin-bottom: 0; background: var(--bg-muted); border-color: var(--primary);">
      <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 0.75rem;">
        <div>
          <p style="font-size: 0.625rem; color: var(--primary); font-weight: 600; text-transform: uppercase;">Neural Voice Engine</p>
          <strong style="font-size: 0.875rem;">${call.from || "Private Line"}</strong>
        </div>
        <span class="pulse-indicator"></span>
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 0.25rem;">
        <i data-lucide="activity" style="width: 14px; height: 14px; color: var(--primary);"></i>
        <span style="font-size: 0.75rem; font-family: monospace;">${call.duration}s • ${call.tokens} tokens</span>
      </div>
    </div>
  `).join("");
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function initCharts(chartData) {
  if (!chartData) return;
  
  const revCtx = document.getElementById("revenueChart");
  if (revCtx) {
    revenueChartInstance = new Chart(revCtx, {
      type: "line",
      data: {
        labels: chartData.revenueChart.labels,
        datasets: [{
          label: "Revenue",
          data: chartData.revenueChart.values,
          borderColor: "#3b82f6",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true, tension: 0.4
        }]
      },
      options: { 
        maintainAspectRatio: false,
        responsive: true, 
        plugins: { legend: { display: false } }, 
        scales: { 
          y: { 
            beginAtZero: true,
            ticks: { color: '#71717a', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' } 
          }, 
          x: { 
            ticks: { color: '#71717a', font: { size: 10 } },
            grid: { display: false } 
          } 
        } 
      }
    });
  }

  const callsCtx = document.getElementById("callsChart");
  if (callsCtx) {
    callsChartInstance = new Chart(callsCtx, {
      type: "bar",
      data: {
        labels: chartData.callsChart.labels,
        datasets: [{
          label: "Calls",
          data: chartData.callsChart.values,
          backgroundColor: "#818cf8",
          borderRadius: 4
        }]
      },
      options: { 
        maintainAspectRatio: false,
        responsive: true, 
        plugins: { legend: { display: false } }, 
        scales: { 
          y: { 
            beginAtZero: true,
            ticks: { color: '#71717a', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' } 
          }, 
          x: { 
            ticks: { color: '#71717a', font: { size: 10 } },
            grid: { display: false } 
          } 
        } 
      }
    });
  }
}

/* ==========================================================================
   MENU MANAGEMENT (ENHANCED)
   ========================================================================== */
async function renderMenu(content) {
  selectedItemIds = [];
  content.innerHTML = `
    <div class="menu-container" style="display: grid; grid-template-columns: 280px 1fr; gap: 2rem;">
      
      <!-- LEFT COLUMN: CATEGORIES -->
      <aside class="menu-sidebar">
        <div class="apex-card" style="padding: 1rem; position: sticky; top: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem; padding: 0 0.5rem;">
            <h3 style="font-size: 0.875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Categories</h3>
            <button class="action-btn" style="width:28px; height:28px;" onclick="openCategoryModal()">
              <i data-lucide="plus" style="width:14px; height:14px;"></i>
            </button>
          </div>
          
          <div id="categoryList" class="drag-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
            <!-- Categories injected here -->
          </div>
          
          <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
            <p style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">Drag categories to reorder</p>
          </div>
        </div>
      </aside>

      <!-- RIGHT COLUMN: ITEMS -->
      <div class="menu-main">
        
        <!-- TOOLBAR -->
        <div class="apex-card" style="margin-bottom: 1.5rem; padding: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 1rem;">
            
            <div style="display:flex; align-items:center; gap: 1rem; flex: 1; min-width: 300px;">
              <div class="header-search" style="max-width: 400px; flex: 1;">
                <i data-lucide="search"></i>
                <input type="text" id="menuSearch" placeholder="Search menu items, tags..." oninput="handleMenuSearch(this.value)" />
              </div>
              
              <div class="filter-dropdown">
                <button class="action-btn" style="width: auto; padding: 0 1rem; gap: 0.5rem;" onclick="toggleFilters()">
                  <i data-lucide="filter" style="width:14px; height:14px;"></i>
                  <span>Filters</span>
                </button>
                <div id="filterMenu" class="filter-menu">
                  <h4 style="font-size: 0.75rem; font-weight: 700; margin-bottom: 1rem; text-transform: uppercase;">Advanced Filters</h4>
                  <div class="form-group">
                    <label>Availability</label>
                    <select id="filterAvailability" class="form-control" onchange="loadItems()">
                      <option value="all">All Items</option>
                      <option value="true">In Stock Only</option>
                      <option value="false">Out of Stock</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Price Range</label>
                    <div style="display:flex; gap: 0.5rem; align-items:center;">
                      <input type="number" id="filterPriceMin" class="form-control" placeholder="Min" oninput="loadItems()" />
                      <span style="color: var(--text-muted);">-</span>
                      <input type="number" id="filterPriceMax" class="form-control" placeholder="Max" oninput="loadItems()" />
                    </div>
                  </div>
                  <button class="action-btn" style="width:100%; border:none; background:var(--bg-muted);" onclick="resetFilters()">Reset All</button>
                </div>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap: 0.75rem;">
              <div style="display:flex; background: var(--bg-muted); padding: 0.25rem; border-radius: 0.5rem; border: 1px solid var(--border);">
                <button class="action-btn ${!isListView ? 'active' : ''}" id="gridViewBtn" style="width:32px; height:32px; border:none; ${!isListView ? 'background:var(--bg-card);' : 'background:transparent;'}" onclick="toggleView(false)">
                  <i data-lucide="layout-grid" style="width:14px; height:14px;"></i>
                </button>
                <button class="action-btn ${isListView ? 'active' : ''}" id="listViewBtn" style="width:32px; height:32px; border:none; ${isListView ? 'background:var(--bg-card);' : 'background:transparent;'}" onclick="toggleView(true)">
                  <i data-lucide="list" style="width:14px; height:14px;"></i>
                </button>
              </div>
              <button class="action-btn" style="width: auto; padding: 0 1.25rem; background: var(--primary); color: white; border: none; font-weight: 600;" onclick="openItemModal()">
                Add New Item
              </button>
            </div>

          </div>
        </div>

        <!-- ITEMS DISPLAY -->
        <div id="itemsContainer">
          <div id="itemsGrid" class="${isListView ? 'items-list-view' : 'apex-grid'}"></div>
        </div>
        
        <!-- BULK ACTIONS BAR (Hidden by default) -->
        <div id="bulkActionsBar" class="bulk-actions-bar" style="display: none;">
          <div style="display:flex; align-items:center; gap: 0.75rem;">
            <span id="selectedCount" class="badge badge-primary">0 Selected</span>
            <button class="close-modal" style="font-size: 1.25rem; color: var(--text-muted);" onclick="clearSelection()">&times;</button>
          </div>
          <div style="width: 1px; height: 24px; background: var(--border);"></div>
          <div style="display:flex; gap: 0.75rem;">
            <button class="action-btn" style="width: auto; padding: 0 1rem; gap: 0.5rem;" onclick="bulkStatus(true)">
              <i data-lucide="eye" style="width:14px; height:14px;"></i>
              <span>Enable</span>
            </button>
            <button class="action-btn" style="width: auto; padding: 0 1rem; gap: 0.5rem;" onclick="bulkStatus(false)">
              <i data-lucide="eye-off" style="width:14px; height:14px;"></i>
              <span>Disable</span>
            </button>
            <button class="action-btn" style="width: auto; padding: 0 1rem; gap: 0.5rem; color: var(--danger);" onclick="bulkDelete()">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- Category Modal -->
    <div id="categoryModal" class="modal-overlay">
      <div class="modal-container" style="max-width: 500px;">
        <div class="modal-header">
          <h3 id="categoryModalTitle">Add Category</h3>
          <button class="close-modal" onclick="closeModal('categoryModal')">&times;</button>
        </div>
        <div class="form-group">
          <label>Category Name</label>
          <input type="text" id="catName" class="form-control" placeholder="e.g. Main Course, Desserts" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="catDesc" class="form-control" rows="3" placeholder="Brief description of this category..."></textarea>
        </div>
        <div class="form-group">
          <label>Category Image</label>
          <div style="display:flex; gap:0.5rem;">
            <input type="text" id="catImage" class="form-control" placeholder="https://..." />
            <input type="file" id="catFile" style="display:none;" onchange="handleFileUpload(this, 'catImage')" />
            <button class="action-btn" style="width:auto; padding:0 1rem;" onclick="document.getElementById('catFile').click()">
              <i data-lucide="upload" style="width:14px; height:14px;"></i>
            </button>
          </div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; padding: 1rem; background: var(--bg-muted); border-radius: 0.5rem;">
          <div>
            <p style="font-size: 0.875rem; font-weight: 600;">Active Status</p>
            <p style="font-size: 0.75rem; color: var(--text-muted);">Visible to customers when active</p>
          </div>
          <label class="switch">
            <input type="checkbox" id="catIsActive" checked>
            <span class="slider"></span>
          </label>
        </div>
        <div style="margin-top: 2rem; display:flex; justify-content:flex-end; gap: 1rem;">
          <button class="action-btn" onclick="closeModal('categoryModal')" style="width: auto; padding: 0 1.5rem;">Cancel</button>
          <button class="action-btn" style="background:var(--primary); color:white; border:none; width:auto; padding:0 2rem; font-weight: 600;" onclick="saveCategory()">Save Category</button>
        </div>
      </div>
    </div>

    <!-- Item Modal (Enhanced) -->
    <div id="itemModal" class="modal-overlay">
      <div class="modal-container" style="max-width: 900px; padding: 0; overflow: hidden;">
        <div style="display:flex; height: 80vh;">
          
          <!-- Modal Sidebar: Navigation -->
          <div style="width: 200px; background: var(--bg-muted); border-right: 1px solid var(--border); padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <h3 style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 1rem; color: var(--text-muted);">Edit Item</h3>
            <button class="apex-nav-item active modal-tab-btn" data-tab="basic" onclick="switchModalTab('basic')"><i data-lucide="info"></i> Basic Info</button>
            <button class="apex-nav-item modal-tab-btn" data-tab="variants" onclick="switchModalTab('variants')"><i data-lucide="layers"></i> Variants & Options</button>
            <button class="apex-nav-item modal-tab-btn" data-tab="availability" onclick="switchModalTab('availability')"><i data-lucide="clock"></i> Availability</button>
            <button class="apex-nav-item modal-tab-btn" data-tab="advanced" onclick="switchModalTab('advanced')"><i data-lucide="settings"></i> Advanced</button>
          </div>
          
          <!-- Modal Content Area -->
          <div style="flex: 1; display: flex; flex-direction: column;">
            <div class="modal-header" style="padding: 1.5rem 2rem; border-bottom: 1px solid var(--border); margin-bottom: 0;">
              <h3 id="itemModalTitle">Add Menu Item</h3>
              <button class="close-modal" onclick="closeModal('itemModal')">&times;</button>
            </div>
            
            <div id="itemModalTabs" style="flex: 1; overflow-y: auto; padding: 2rem;">
              
              <!-- Basic Tab -->
              <div id="tab-basic" class="modal-tab-content">
                <div style="display: grid; grid-template-columns: 1fr 240px; gap: 2rem;">
                  <div>
                    <div class="form-group"><label>Item Name</label><input type="text" id="itemName" class="form-control" /></div>
                    <div class="form-group"><label>Base Price ($)</label><input type="number" id="itemPrice" class="form-control" step="0.01" /></div>
                    <div class="form-group"><label>Description</label><textarea id="itemDesc" class="form-control" rows="4"></textarea></div>
                    <div class="form-group"><label>Category</label><select id="itemCategory" class="form-control"></select></div>
                  </div>
                  <div>
                    <div class="form-group">
                      <label>Item Image</label>
                      <div id="imagePreview" style="width:100%; height:160px; background:var(--bg-muted); border-radius:0.5rem; display:flex; align-items:center; justify-content:center; border: 1px dashed var(--border); margin-bottom: 1rem; overflow:hidden;">
                        <i data-lucide="image" style="width:32px; height:32px; color:var(--text-muted);"></i>
                      </div>
                      <div style="display:flex; gap:0.5rem;">
                        <input type="text" id="itemImage" class="form-control" placeholder="Image URL" oninput="updateImagePreview(this.value)" />
                        <input type="file" id="itemFile" style="display:none;" onchange="handleFileUpload(this, 'itemImage')" />
                        <button class="action-btn" style="width:auto; padding:0 1rem;" onclick="document.getElementById('itemFile').click()">
                          <i data-lucide="upload" style="width:14px; height:14px;"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Variants Tab -->
              <div id="tab-variants" class="modal-tab-content" style="display:none;">
                <div class="variant-section" style="border-top:none; padding-top:0; margin-top:0;">
                  <div class="variant-header">
                    <div>
                      <h4 style="color:var(--text-primary);">Size-based Pricing</h4>
                      <p style="font-size: 0.75rem; color: var(--text-muted);">Define different sizes (e.g. Small, Medium, Large)</p>
                    </div>
                    <button class="action-btn" onclick="addSizeRow()" style="width:auto; padding:0 1rem;">+ Add Size</button>
                  </div>
                  <div id="sizesList"></div>
                </div>
                
                <div class="variant-section">
                  <div class="variant-header">
                    <div>
                      <h4 style="color:var(--text-primary);">Option Groups</h4>
                      <p style="font-size: 0.75rem; color: var(--text-muted);">Customizations like "Extra Toppings" or "Choice of Sauce"</p>
                    </div>
                    <button class="action-btn" onclick="addOptionGroup()" style="width:auto; padding:0 1rem;">+ Add Group</button>
                  </div>
                  <div id="optionGroupsList"></div>
                </div>
              </div>

              <!-- Availability Tab -->
              <div id="tab-availability" class="modal-tab-content" style="display:none;">
                <div style="display:flex; align-items:center; justify-content:space-between; padding: 1.5rem; background: var(--bg-muted); border-radius: 0.5rem; margin-bottom: 2rem;">
                  <div>
                    <h4 style="margin-bottom: 0.25rem;">General Availability</h4>
                    <p style="font-size: 0.875rem; color: var(--text-muted);">Toggle whether this item is currently in stock.</p>
                  </div>
                  <label class="switch">
                    <input type="checkbox" id="itemIsAvailable" checked>
                    <span class="slider"></span>
                  </label>
                </div>
                
                <div class="form-group">
                  <label>Preparation Time (minutes)</label>
                  <input type="number" id="itemPrepTime" class="form-control" value="15" />
                </div>

                <div class="variant-section">
                  <h4 style="margin-bottom: 1rem;">Daily Availability</h4>
                  <div id="dayAvailability" style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; margin-bottom: 1.5rem;">
                    ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => `
                      <button class="action-btn day-btn active" data-day="${i}" onclick="toggleDay(this)" style="width:100%; height:40px; font-size:0.75rem;">${day}</button>
                    `).join("")}
                  </div>
                </div>
              </div>

              <!-- Advanced Tab -->
              <div id="tab-advanced" class="modal-tab-content" style="display:none;">
                <div class="form-group">
                  <label>Tags (comma separated)</label>
                  <input type="text" id="itemTags" class="form-control" placeholder="popular, chef-special, spicy" />
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem;">
                  <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.75rem; background: var(--bg-muted); border-radius: 0.5rem;">
                    <span style="font-size: 0.875rem;">Vegetarian</span>
                    <label class="switch"><input type="checkbox" id="itemIsVeg"><span class="slider"></span></label>
                  </div>
                  <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.75rem; background: var(--bg-muted); border-radius: 0.5rem;">
                    <span style="font-size: 0.875rem;">Vegan</span>
                    <label class="switch"><input type="checkbox" id="itemIsVegan"><span class="slider"></span></label>
                  </div>
                  <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.75rem; background: var(--bg-muted); border-radius: 0.5rem;">
                    <span style="font-size: 0.875rem;">Spicy</span>
                    <label class="switch"><input type="checkbox" id="itemIsSpicy"><span class="slider"></span></label>
                  </div>
                  <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.75rem; background: var(--bg-muted); border-radius: 0.5rem;">
                    <span style="font-size: 0.875rem;">Popular Item</span>
                    <label class="switch"><input type="checkbox" id="itemIsPopular"><span class="slider"></span></label>
                  </div>
                  <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.75rem; background: var(--bg-muted); border-radius: 0.5rem;">
                    <span style="font-size: 0.875rem;">New Item</span>
                    <label class="switch"><input type="checkbox" id="itemIsNew"><span class="slider"></span></label>
                  </div>
                </div>
              </div>

            </div>
            
            <div style="padding: 1.5rem 2rem; border-top: 1px solid var(--border); display:flex; justify-content:flex-end; gap: 1rem; background: var(--bg-card);">
              <button class="action-btn" onclick="closeModal('itemModal')" style="width: auto; padding: 0 1.5rem;">Cancel</button>
              <button class="action-btn" style="background:var(--primary); color:white; border:none; width:auto; padding:0 2rem; font-weight: 700;" onclick="saveItem()">Save Changes</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
  await loadCategories();
}

async function loadCategories() {
  const res = await fetch(`/api/menu/categories?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const container = document.getElementById("categoryList");
  if (result.success && container) {
    container.innerHTML = result.data.map(c => `
      <div class="apex-nav-item draggable-item ${currentCategoryId === c.id ? 'active' : ''}" 
           draggable="true" 
           ondragstart="handleDragStart(event, '${c.id}', 'category')" 
           ondragover="handleDragOver(event)" 
           ondrop="handleDrop(event, '${c.id}', 'category')"
           style="justify-content:space-between; padding-right: 0.5rem;" 
           onclick="selectCategory('${c.id}')">
        <div style="display:flex; align-items:center; gap: 0.75rem;">
          <i data-lucide="grip-vertical" style="width:12px; height:12px; color:var(--text-muted); cursor:grab;"></i>
          <span>${c.name}</span>
        </div>
        <div style="display:flex; align-items:center; gap: 0.25rem;">
          ${!c.isActive ? '<span class="badge badge-secondary" style="font-size: 0.5rem;">Hidden</span>' : ''}
          <button class="action-btn" style="width:24px; height:24px; border:none; background:none;" onclick="event.stopPropagation(); editCategory('${c.id}')">
            <i data-lucide="edit-2" style="width:12px; height:12px;"></i>
          </button>
        </div>
      </div>
    `).join("");
    
    if (!currentCategoryId && result.data.length > 0) selectCategory(result.data[0].id);
    else if (currentCategoryId) loadItems();
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectCategory(id) { 
  currentCategoryId = id; 
  loadCategories(); 
  clearSelection();
}

async function loadItems() {
  const search = document.getElementById("menuSearch")?.value || "";
  const availableOnly = document.getElementById("filterAvailability")?.value || "all";
  const priceMin = document.getElementById("filterPriceMin")?.value || "";
  const priceMax = document.getElementById("filterPriceMax")?.value || "";
  
  let url = `/api/menu/items?businessId=${getBusinessId()}&categoryId=${currentCategoryId}&search=${search}`;
  if (availableOnly !== "all") url += `&availableOnly=${availableOnly}`;
  if (priceMin) url += `&priceMin=${priceMin}`;
  if (priceMax) url += `&priceMax=${priceMax}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const container = document.getElementById("itemsGrid");
  
  if (result.success && container) {
    if (result.data.length === 0) {
      container.innerHTML = `<div class="apex-card" style="grid-column: 1/-1; text-align:center; padding: 4rem; color: var(--text-muted); background: rgba(255,255,255,0.01); border-style: dashed;">
        <i data-lucide="search-x" style="width:48px; height:48px; margin-bottom:1rem; opacity:0.5;"></i>
        <p>No items found matching your criteria.</p>
        <button class="action-btn" style="margin-top:1rem; width:auto; padding:0 1rem;" onclick="resetFilters()">Clear Filters</button>
      </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    container.innerHTML = result.data.map(item => {
      const isSelected = selectedItemIds.includes(item.id);
      
      if (isListView) {
        return `
          <div class="list-item-card premium-card ${!item.isAvailable ? 'hidden' : ''}">
            <input type="checkbox" class="item-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleItemSelection('${item.id}')" />
            <img src="${item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'}" style="width:60px; height:60px; object-fit:cover; border-radius:0.5rem;" />
            <div style="flex:1;">
              <h4 style="font-weight:600; font-size:0.9rem;">${item.name}</h4>
              <p style="font-size:0.7rem; color:var(--text-muted);">${item.description || 'No description'}</p>
            </div>
            <div style="display:flex; gap:0.25rem; flex-wrap:wrap;">
              ${item.isVeg ? '<span class="badge badge-success">Veg</span>' : ''}
              ${item.isSpicy ? '<span class="badge badge-danger">Spicy</span>' : ''}
              ${item.isPopular ? '<span class="badge badge-primary">Popular</span>' : ''}
            </div>
            <div class="price-tag">$${(item.price || 0).toFixed(2)}</div>
            <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
               <button class="action-btn" style="width:32px; height:32px;" onclick="editItem('${item.id}')"><i data-lucide="edit-3" style="width:14px; height:14px;"></i></button>
               <button class="action-btn" style="width:32px; height:32px; color:var(--danger);" onclick="deleteItem('${item.id}')"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
            </div>
          </div>
        `;
      }

      return `
        <div class="apex-card premium-card" style="padding: 0; overflow: hidden; display:flex; flex-direction:column; position:relative;">
          <input type="checkbox" class="item-checkbox" style="position:absolute; top:0.75rem; left:0.75rem; z-index:10;" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleItemSelection('${item.id}')" />
          <img src="${item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'}" style="width:100%; height:160px; object-fit:cover;" />
          <div style="padding: 1.25rem; flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.75rem;">
              <h4 style="font-weight:700; font-size:1rem; letter-spacing:-0.01em;">${item.name}</h4>
              <span class="price-tag" style="color:var(--primary);">$${(item.price || 0).toFixed(2)}</span>
            </div>
            <div style="display:flex; gap:0.4rem; margin-bottom:0.75rem; flex-wrap:wrap;">
              ${item.isVeg ? '<div class="dietary-icon veg-icon" title="Vegetarian">V</div>' : ''}
              ${item.isSpicy ? '<span class="badge badge-danger" style="padding:0.1rem 0.4rem;">Spicy</span>' : ''}
              ${item.isPopular ? '<span class="badge badge-primary" style="padding:0.1rem 0.4rem;">Popular</span>' : ''}
              ${!item.isAvailable ? '<span class="badge badge-secondary">Out of Stock</span>' : ''}
            </div>
            <p style="font-size:0.75rem; color:var(--text-secondary); line-height:1.5; margin-bottom:1.5rem; height:2.25rem; overflow:hidden;">${item.description || ''}</p>
            <div style="display:flex; justify-content:flex-end; gap:0.5rem; border-top: 1px solid var(--border); padding-top:1rem;">
               <button class="action-btn" style="width:auto; padding:0 1rem; font-size:0.75rem; gap:0.4rem;" onclick="editItem('${item.id}')">
                 <i data-lucide="edit-3" style="width:12px; height:12px;"></i> Manage
               </button>
               <button class="action-btn" style="width:36px; height:36px; color:var(--danger);" onclick="deleteItem('${item.id}')"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function handleMenuSearch(val) { loadItems(); }

function toggleView(listView) {
  isListView = listView;
  const grid = document.getElementById("itemsGrid");
  if (grid) {
    grid.className = isListView ? 'items-list-view' : 'apex-grid';
    document.getElementById("gridViewBtn").style.background = !isListView ? 'var(--bg-card)' : 'transparent';
    document.getElementById("listViewBtn").style.background = isListView ? 'var(--bg-card)' : 'transparent';
    loadItems();
  }
}

function toggleFilters() {
  const menu = document.getElementById("filterMenu");
  menu.classList.toggle("show");
}

function resetFilters() {
  document.getElementById("menuSearch").value = "";
  document.getElementById("filterAvailability").value = "all";
  document.getElementById("filterPriceMin").value = "";
  document.getElementById("filterPriceMax").value = "";
  loadItems();
}

/* Category CRUD */
let editingCategoryId = null;
function openCategoryModal(cat = null) {
  editingCategoryId = cat ? cat.id : null;
  document.getElementById("categoryModalTitle").innerText = cat ? "Edit Category" : "Add Category";
  document.getElementById("catName").value = cat ? cat.name : "";
  document.getElementById("catDesc").value = cat ? cat.description : "";
  document.getElementById("catImage").value = cat ? cat.imageUrl || "" : "";
  document.getElementById("catIsActive").checked = cat ? cat.isActive : true;
  openModal("categoryModal");
}

async function saveCategory() {
  const data = { 
    name: document.getElementById("catName").value, 
    description: document.getElementById("catDesc").value, 
    imageUrl: document.getElementById("catImage").value,
    isActive: document.getElementById("catIsActive").checked,
    businessId: getBusinessId() 
  };
  const method = editingCategoryId ? "PUT" : "POST";
  const url = editingCategoryId ? `/api/menu/category/${editingCategoryId}` : "/api/menu/category";
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
  if (res.ok) { 
    notify("Category saved", "Success"); 
    closeModal("categoryModal"); 
    loadCategories(); 
  }
}

async function editCategory(id) {
  const res = await fetch(`/api/menu/categories?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const cat = result.data.find(c => c.id === id);
  if (cat) openCategoryModal(cat);
}

/* Item CRUD */
let editingItemId = null;
async function openItemModal(item = null) {
  editingItemId = item ? item.id : null;
  document.getElementById("itemModalTitle").innerText = item ? "Manage Item" : "New Menu Item";
  
  // Basic Info
  document.getElementById("itemName").value = item ? item.name : "";
  document.getElementById("itemPrice").value = item ? item.price : "";
  document.getElementById("itemDesc").value = item ? item.description : "";
  document.getElementById("itemImage").value = item ? item.imageUrl || "" : "";
  updateImagePreview(item ? item.imageUrl : "");

  // Category Select
  const catRes = await fetch(`/api/menu/categories?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const catResult = await catRes.json();
  const catSelect = document.getElementById("itemCategory");
  if (catSelect) {
    catSelect.innerHTML = catResult.data.map(c => `<option value="${c.id}" ${item && item.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join("");
    if (!item && currentCategoryId) catSelect.value = currentCategoryId;
  }

  // Variants
  document.getElementById("sizesList").innerHTML = "";
  document.getElementById("optionGroupsList").innerHTML = "";
  if (item) {
    if (item.sizes) item.sizes.forEach(s => addSizeRow(s.name, s.price));
    if (item.optionGroups) item.optionGroups.forEach(og => addOptionGroup(og));
  }

  // Availability
  document.getElementById("itemIsAvailable").checked = item ? item.isAvailable : true;
  document.getElementById("itemPrepTime").value = item ? item.prepTime : 15;
  
  // Daily Availability (Parse JSON if exists)
  const availability = item && item.availability ? JSON.parse(item.availability) : { days: [0,1,2,3,4,5,6] };
  document.querySelectorAll(".day-btn").forEach((btn, i) => {
    if (availability.days.includes(i)) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  // Advanced
  document.getElementById("itemTags").value = item ? item.tags || "" : "";
  document.getElementById("itemIsVeg").checked = item ? item.isVeg : false;
  document.getElementById("itemIsVegan").checked = item ? item.isVegan : false;
  document.getElementById("itemIsSpicy").checked = item ? item.isSpicy : false;
  document.getElementById("itemIsPopular").checked = item ? item.isPopular : false;
  document.getElementById("itemIsNew").checked = item ? item.isNew : false;

  switchModalTab('basic');
  openModal("itemModal");
}

function updateImagePreview(url) {
  const preview = document.getElementById("imagePreview");
  if (!preview) return;
  if (url) {
    preview.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<i data-lucide=\'image-off\'></i>'; lucide.createIcons();" />`;
  } else {
    preview.innerHTML = `<i data-lucide="image" style="width:32px; height:32px; color:var(--text-muted);"></i>`;
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function switchModalTab(tabId) {
  document.querySelectorAll(".modal-tab-content").forEach(c => c.style.display = "none");
  document.getElementById(`tab-${tabId}`).style.display = "block";
  document.querySelectorAll(".modal-tab-btn").forEach(btn => {
    if (btn.dataset.tab === tabId) btn.classList.add("active");
    else btn.classList.remove("active");
  });
}

function addSizeRow(name = "", price = "") {
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `<input type="text" class="form-control" placeholder="Size (e.g. Small)" value="${name}" /><input type="number" class="form-control" placeholder="Price" value="${price}" /><button class="action-btn" style="color:var(--danger); border:none;" onclick="this.parentElement.remove()">&times;</button>`;
  document.getElementById("sizesList").appendChild(row);
}

function addOptionGroup(group = null) {
  const container = document.getElementById("optionGroupsList");
  const div = document.createElement("div");
  div.className = "option-group-card";
  const id = "og-" + Math.random().toString(36).substr(2, 9);
  div.id = id;
  
  div.innerHTML = `
    <div class="option-group-header">
      <input type="text" class="form-control og-name" placeholder="Group Name (e.g. Toppings)" value="${group ? group.name : ''}" style="font-weight:700;" />
      <button class="action-btn" style="color:var(--danger); border:none;" onclick="this.closest('.option-group-card').remove()">&times;</button>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr 100px; gap: 1rem; margin-bottom: 1rem;">
       <div><label style="font-size:0.6rem;">Min Selection</label><input type="number" class="form-control og-min" value="${group ? group.minSelect : 0}" /></div>
       <div><label style="font-size:0.6rem;">Max Selection</label><input type="number" class="form-control og-max" value="${group ? group.maxSelect : 1}" /></div>
       <div style="display:flex; flex-direction:column; align-items:center;">
         <label style="font-size:0.6rem;">Required</label>
         <label class="switch"><input type="checkbox" class="og-required" ${group && group.isRequired ? 'checked' : ''}><span class="slider"></span></label>
       </div>
    </div>
    <div class="options-list" style="padding-left: 1rem; border-left: 2px solid var(--border);">
       <!-- Options rows -->
    </div>
    <button class="action-btn" style="margin-top:0.5rem; width:auto; padding:0 0.75rem; font-size:0.75rem;" onclick="addOptionRow('${id}')">+ Add Option</button>
  `;
  container.appendChild(div);
  
  if (group && group.options) {
    group.options.forEach(o => addOptionRow(id, o.name, o.price));
  } else {
    addOptionRow(id);
  }
}

function addOptionRow(groupId, name = "", price = "") {
  const container = document.querySelector(`#${groupId} .options-list`);
  const row = document.createElement("div");
  row.className = "variant-row";
  row.style.gridTemplateColumns = "1fr 100px 40px";
  row.innerHTML = `<input type="text" class="form-control opt-name" placeholder="Option Name" value="${name}" /><input type="number" class="form-control opt-price" placeholder="+$" value="${price}" /><button class="action-btn" style="color:var(--danger); border:none;" onclick="this.parentElement.remove()">&times;</button>`;
  container.appendChild(row);
}

async function saveItem() {
  const sizes = Array.from(document.getElementById("sizesList").children).map(row => ({ 
    name: row.children[0].value, 
    price: parseFloat(row.children[1].value) || 0 
  })).filter(s => s.name);
  
  const optionGroups = Array.from(document.getElementById("optionGroupsList").children).map(div => {
    const options = Array.from(div.querySelector(".options-list").children).map(row => ({
      name: row.children[0].value,
      price: parseFloat(row.children[1].value) || 0
    })).filter(o => o.name);
    
    return {
      name: div.querySelector(".og-name").value,
      minSelect: parseInt(div.querySelector(".og-min").value) || 0,
      maxSelect: parseInt(div.querySelector(".og-max").value) || 1,
      isRequired: div.querySelector(".og-required").checked,
      options
    };
  }).filter(g => g.name);

  const availability = {
    days: Array.from(document.querySelectorAll(".day-btn.active")).map(btn => parseInt(btn.dataset.day))
  };

  const data = { 
    name: document.getElementById("itemName").value, 
    price: parseFloat(document.getElementById("itemPrice").value) || 0, 
    description: document.getElementById("itemDesc").value, 
    imageUrl: document.getElementById("itemImage").value, 
    categoryId: document.getElementById("itemCategory").value, 
    businessId: getBusinessId(),
    isAvailable: document.getElementById("itemIsAvailable").checked,
    prepTime: parseInt(document.getElementById("itemPrepTime").value) || 15,
    tags: document.getElementById("itemTags").value,
    isVeg: document.getElementById("itemIsVeg").checked,
    isVegan: document.getElementById("itemIsVegan").checked,
    isSpicy: document.getElementById("itemIsSpicy").checked,
    isPopular: document.getElementById("itemIsPopular").checked,
    isNew: document.getElementById("itemIsNew").checked,
    availability,
    sizes,
    optionGroups
  };

  const method = editingItemId ? "PUT" : "POST";
  const url = editingItemId ? `/api/menu/item/${editingItemId}` : "/api/menu/item";
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
  if (res.ok) { 
    notify("Item saved", "Success"); 
    closeModal("itemModal"); 
    loadItems(); 
  } else {
    const err = await res.json();
    notify(err.error || "Failed to save item", "Error");
  }
}

async function editItem(id) {
  const res = await fetch(`/api/menu/items?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const item = result.data.find(i => i.id === id);
  if (item) openItemModal(item);
}

async function deleteItem(id) {
  if (!confirm("Delete this item? This cannot be undone.")) return;
  const res = await fetch(`/api/menu/item/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) { 
    loadItems(); 
    notify("Item deleted", "Success"); 
  }
}

function toggleDay(btn) {
  btn.classList.toggle("active");
}

/* Bulk Actions */
function toggleItemSelection(id) {
  const index = selectedItemIds.indexOf(id);
  if (index > -1) selectedItemIds.splice(index, 1);
  else selectedItemIds.push(id);
  
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById("bulkActionsBar");
  const count = document.getElementById("selectedCount");
  if (selectedItemIds.length > 0) {
    bar.style.display = "flex";
    count.innerText = `${selectedItemIds.length} Selected`;
  } else {
    bar.style.display = "none";
  }
}

function clearSelection() {
  selectedItemIds = [];
  document.querySelectorAll(".item-checkbox").forEach(cb => cb.checked = false);
  updateBulkBar();
}

async function bulkStatus(isAvailable) {
  if (selectedItemIds.length === 0) return;
  const res = await fetch("/api/menu/items/bulk-update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids: selectedItemIds, updates: { isAvailable } })
  });
  if (res.ok) {
    notify(`Updated ${selectedItemIds.length} items`, "Success");
    clearSelection();
    loadItems();
  }
}

async function bulkDelete() {
  if (selectedItemIds.length === 0) return;
  if (!confirm(`Delete ${selectedItemIds.length} items?`)) return;
  const res = await fetch("/api/menu/items/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids: selectedItemIds })
  });
  if (res.ok) {
    notify(`Deleted ${selectedItemIds.length} items`, "Success");
    clearSelection();
    loadItems();
  }
}

/* Drag & Drop Reordering */
let draggedId = null;
let dragType = null;

function handleDragStart(e, id, type) {
  draggedId = id;
  dragType = type;
  e.target.classList.add('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
}

async function handleDrop(e, targetId, type) {
  e.preventDefault();
  if (dragType !== type || draggedId === targetId) return;

  if (type === 'category') {
    const list = Array.from(document.querySelectorAll('#categoryList .draggable-item'));
    const draggedIdx = list.findIndex(el => el.onclick.toString().includes(draggedId));
    const targetIdx = list.findIndex(el => el.onclick.toString().includes(targetId));
    
    // Simple local reorder for UI feedback (optional, since we reload)
    const orders = list.map((el, i) => {
      // Logic to get ID from onclick is messy, better to have data-id
      // For now, let's just use the result of the move
    });
    
    // Proper way: Send new sequence to backend
    // This requires mapping all IDs in their new order
    const allCategories = await (await fetch(`/api/menu/categories?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const sorted = allCategories.data;
    const dIdx = sorted.findIndex(c => c.id === draggedId);
    const tIdx = sorted.findIndex(c => c.id === targetId);
    const [moved] = sorted.splice(dIdx, 1);
    sorted.splice(tIdx, 0, moved);
    
    const updates = sorted.map((c, i) => ({ id: c.id, displayOrder: i }));
    await fetch("/api/menu/categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orders: updates })
    });
    loadCategories();
  }
}


/* ==========================================================================
   ORDERS & RECEIPTS
   ========================================================================== */
async function renderOrders(content) {
  const res = await fetch(`/api/order?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const orders = result.data || [];
  
  content.innerHTML = `
    <div class="apex-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem;">
        <h2 class="card-title">Recent Orders</h2>
        <button class="action-btn" style="width: auto; padding: 0 1rem;"><i data-lucide="filter" style="width:14px; height:14px; margin-right:0.5rem;"></i> Filter</button>
      </div>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="text-align: left; border-bottom: 1px solid var(--border);">
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Order ID</th>
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Customer</th>
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Total</th>
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Date</th>
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map((o, index) => {
              const seqId = 1001 + (orders.length - 1 - index);
              return `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 1rem; font-family: monospace;">#${seqId}</td>
                <td style="padding: 1rem; font-weight: 500;">${o.customerName}</td>
                <td style="padding: 1rem; color: var(--success); font-weight: 600;">$${(o.total || 0).toFixed(2)}</td>
                <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.875rem;">${new Date(o.createdAt).toLocaleDateString()}</td>
                <td style="padding: 1rem;">
                  <button class="action-btn" onclick="openOrderDetails('${o.id}', ${seqId})">View</button>
                </td>
              </tr>
            `;}).join("")}
            ${orders.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">No orders found</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function openOrderDetails(orderId, seqId) {
  try {
    const res = await fetch(`/api/order/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Failed to load order");
    const order = result.data;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay show";
    overlay.style.zIndex = "2000";
    overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div class="modal-container" style="max-width: 450px; font-family: 'JetBrains Mono', monospace; border-style: dashed;">
        <div style="background: var(--primary); color: white; display: inline-block; padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.625rem; font-weight: 700; margin-bottom: 1rem;">AI VOICE RECEIPT</div>
        <h2 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.25rem;">Nexton AI Voice</h2>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1.5rem;">Order #${seqId || order.id.substring(0,8)} • ${new Date(order.createdAt).toLocaleString()}</p>
        
        <div style="text-align: left; border-top: 1px dashed var(--border); border-bottom: 1px dashed var(--border); padding: 1.5rem 0; margin-bottom: 1.5rem;">
          ${order.items.map(item => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem;">
              <span>${item.quantity}x ${item.menuItem?.name || 'Item'}</span>
              <span>$${((item.menuItem?.price || 0) * item.quantity).toFixed(2)}</span>
            </div>
          `).join("")}
          <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1.125rem; margin-top: 1rem;">
            <span>TOTAL</span>
            <span>$${order.total.toFixed(2)}</span>
          </div>
        </div>
        <button class="action-btn" style="width: 100%; background: var(--primary); color: white; border: none;" onclick="this.closest('.modal-overlay').remove()">CLOSE</button>
      </div>
    `;
    document.body.appendChild(overlay);
  } catch (err) { notify(err.message, "Error"); }
}

/* ==========================================================================
   CALLS & APPOINTMENTS
   ========================================================================== */
async function renderCalls(content) {
  const res = await fetch(`/api/call/history?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const calls = result.data || [];
  content.innerHTML = `
    <div class="apex-card">
      <h2 class="card-title" style="margin-bottom:2rem;">AI Call History</h2>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="text-align: left; border-bottom: 1px solid var(--border);">
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">From / Customer</th>
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">Duration</th>
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">Date</th>
              <th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">Summary</th>
            </tr>
          </thead>
          <tbody>
            ${calls.map(c => `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 1rem;">
                  <div style="font-weight: 600;">${c.customerName || 'Voice Customer'}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${c.fromNumber || 'Private'}</div>
                </td>
                <td style="padding: 1rem; font-family: monospace;">${formatDuration(c.duration)}</td>
                <td style="padding: 1rem; font-size: 0.875rem;">${new Date(c.createdAt).toLocaleString()}</td>
                <td style="padding: 1rem;">
                  <button class="action-btn" style="width:auto; padding:0 0.75rem; font-size:0.7rem;" onclick="showCallSummary('${c.id}')">View Details</button>
                </td>
              </tr>
            `).join("")}
            ${calls.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding:3rem; color:var(--text-muted);">No history found</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function formatDuration(seconds) {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function showCallSummary(id) {
  try {
    const res = await fetch(`/api/call/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json();
    if (!result.success) throw new Error("Failed to load details");
    const call = result.data;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay show";
    overlay.style.zIndex = "2000";
    overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div class="modal-container" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Call Interaction Detail</h3>
          <button class="close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div style="padding: 1rem 0;">
          <div style="margin-bottom: 1.5rem;">
            <p style="font-size: 0.625rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Customer Identity</p>
            <strong style="font-size: 1.125rem;">${call.customerName || 'Voice Customer'}</strong>
            <p style="color: var(--primary); font-family: monospace;">${call.fromNumber}</p>
          </div>
          
          <div class="apex-card" style="background: var(--bg-muted); border-style: dashed; margin-bottom: 1.5rem;">
             <p style="font-size: 0.625rem; color: var(--primary); text-transform: uppercase; margin-bottom: 0.5rem; font-weight: 700;">AI Summary</p>
             <p style="font-size: 0.875rem; line-height: 1.6;">${call.summary || 'Interaction complete. No summary provided.'}</p>
          </div>

          <div>
             <p style="font-size: 0.625rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Full Transcript</p>
             <div style="max-height: 200px; overflow-y: auto; font-size: 0.75rem; color: var(--text-secondary); background: rgba(0,0,0,0.1); padding: 1rem; border-radius: 0.5rem; line-height: 1.6;">
               ${(call.transcript || '').replace(/\\n/g, '<br>')}
             </div>
          </div>
        </div>
        <button class="action-btn" style="width: 100%; margin-top: 1.5rem; background: var(--primary); color: white; border: none;" onclick="this.closest('.modal-overlay').remove()">Close Detail</button>
      </div>
    `;
    document.body.appendChild(overlay);
  } catch (err) { notify(err.message, "Error"); }
}

async function renderAppointments(content) {
  const res = await fetch(`/api/appointment?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const data = result.data || [];
  content.innerHTML = `
    <div class="apex-card">
      <h2 class="card-title" style="margin-bottom:2rem;">Appointments</h2>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead><tr style="text-align: left; border-bottom: 1px solid var(--border);"><th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">Customer</th><th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">Service</th><th style="padding: 1rem; color: var(--text-muted); font-size: 0.75rem;">Date/Time</th></tr></thead>
          <tbody>
            ${data.map(a => `<tr style="border-bottom: 1px solid var(--border);"><td style="padding: 1rem; font-weight: 600;">${a.customerName}</td><td style="padding: 1rem;">${a.serviceName || 'General'}</td><td style="padding: 1rem;">${new Date(a.appointmentTime).toLocaleString()}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ==========================================================================
   SYSTEM & PROFILE
   ========================================================================== */
async function renderStaff(content) {
  const res = await fetch("/api/auth/staff", { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const staff = result.data || [];
  content.innerHTML = `
    <div class="apex-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem;">
        <h2 class="card-title">Staff Management</h2>
        <button class="action-btn" style="width:auto; padding:0 1rem; background:var(--primary); color:white; border:none;" onclick="toggleAddStaffForm()">+ Add Member</button>
      </div>
      <div id="addStaffForm" style="display:none; margin-bottom:2rem; padding:1.5rem; background:var(--bg-muted); border-radius:var(--radius);">
         <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div class="form-group"><label>Email</label><input type="email" id="staffEmail" class="form-control" /></div>
            <div class="form-group"><label>Password</label><input type="password" id="staffPassword" class="form-control" /></div>
            <div class="form-group"><label>Role</label><select id="staffRole" class="form-control"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></select></div>
         </div>
         <button class="action-btn" style="background:var(--primary); color:white; border:none;" onclick="createStaff()">Create Account</button>
      </div>
      <div style="overflow-x: auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr style="text-align:left; border-bottom:1px solid var(--border);"><th style="padding:1rem; color:var(--text-muted); font-size:0.75rem;">Email</th><th style="padding:1rem; color:var(--text-muted); font-size:0.75rem;">Role</th></tr></thead>
          <tbody>${staff.map(s => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:1rem;">${s.email}</td><td style="padding:1rem;">${s.role}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function toggleAddStaffForm() { const f = document.getElementById("addStaffForm"); f.style.display = f.style.display === "none" ? "block" : "none"; }
async function createStaff() {
  const email = document.getElementById("staffEmail").value;
  const password = document.getElementById("staffPassword").value;
  const role = document.getElementById("staffRole").value;
  const res = await fetch("/api/auth/staff", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ email, password, role }) });
  if (res.ok) { notify("Staff created", "Success"); loadSection("staff"); }
}

async function renderBusinessInfo(content) {
  const res = await fetch(`/api/business/current?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const b = result.data || {};
  content.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 300px; gap: 2rem; max-width: 1100px;">
      <div class="apex-card">
        <h2 class="card-title" style="margin-bottom:2rem;">Business Profile</h2>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.5rem;">
          <div class="form-group"><label>Business Name</label><input type="text" id="bizName" class="form-control" value="${b.name || ''}" /></div>
          <div class="form-group"><label>Twilio Phone</label><input type="text" id="bizPhone" class="form-control" value="${b.phoneNumber || ''}" /></div>
          <div class="form-group" style="grid-column: 1/-1;"><label>Address</label><input type="text" id="bizAddress" class="form-control" value="${b.address || ''}" /></div>
          <div class="form-group"><label>City</label><input type="text" id="bizCity" class="form-control" value="${b.city || ''}" /></div>
          <div class="form-group"><label>Country</label><input type="text" id="bizCountry" class="form-control" value="${b.country || ''}" /></div>
        </div>
        <div class="variant-section">
          <h4 style="margin-bottom:1rem;">Logo</h4>
          <div style="display:flex; align-items:center; gap:2rem;">
             <img id="logoPreview" src="${b.logoUrl || ''}" style="width:80px; height:80px; object-fit:contain; border:1px solid var(--border); ${b.logoUrl ? '' : 'display:none;'}" />
             <input type="file" id="bizLogoFile" onchange="handleLogoPreview(this)" />
          </div>
        </div>
        <button class="action-btn" style="background:var(--primary); color:white; border:none; margin-top:2rem;" onclick="saveBusiness()">Save Changes</button>
      </div>
    </div>
  `;
}

function handleLogoPreview(input) { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = (e) => { const preview = document.getElementById("logoPreview"); preview.src = e.target.result; preview.style.display = "block"; }; reader.readAsDataURL(input.files[0]); } }

async function saveBusiness() {
  const formData = new FormData();
  formData.append("name", document.getElementById("bizName").value);
  formData.append("phoneNumber", document.getElementById("bizPhone").value);
  formData.append("address", document.getElementById("bizAddress").value);
  formData.append("city", document.getElementById("bizCity").value);
  formData.append("country", document.getElementById("bizCountry").value);
  const logoFile = document.getElementById("bizLogoFile").files[0];
  if (logoFile) formData.append("logo", logoFile);

  const res = await fetch(`/api/business/current?businessId=${getBusinessId()}`, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: formData });
  const result = await res.json();
  if (result.success) { notify("Updated", "Success"); applyBrandName(result.data.name, result.data.logoUrl); }
}

async function renderCreateBusiness(content) {
  content.innerHTML = `
    <div class="apex-card" style="max-width: 600px;">
      <h2 class="card-title" style="margin-bottom:2rem;">Launch New Business</h2>
      <div class="form-group"><label>Name</label><input type="text" id="newBizName" class="form-control" /></div>
      <div class="form-group"><label>Type</label><select id="newBizType" class="form-control"><option value="restaurant">Restaurant</option><option value="appointment">Service</option></select></div>
      <div class="form-group"><label>Owner Email</label><input type="email" id="newOwnerEmail" class="form-control" /></div>
      <div class="form-group"><label>Password</label><input type="password" id="newOwnerPass" class="form-control" /></div>
      <button class="action-btn" style="background:var(--primary); color:white; border:none; margin-top:1rem;" onclick="submitNewBusiness()">Create Instance</button>
    </div>
  `;
}

async function submitNewBusiness() {
  const data = { name: document.getElementById("newBizName").value, type: document.getElementById("newBizType").value, ownerEmail: document.getElementById("newOwnerEmail").value, ownerPassword: document.getElementById("newOwnerPass").value };
  const res = await fetch("/api/business", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
  if (res.ok) { notify("Launched!", "Success"); loadSection("dashboard"); }
}

async function renderSettings(content) {
  const isSuper = decodedToken && decodedToken.role === "SUPERADMIN";
  content.innerHTML = `
    <div class="apex-card" style="max-width: 500px;">
      <h2 class="card-title">Settings</h2>
      <div class="form-group" style="margin-top:1.5rem;">
        <label>Global Brand Name</label>
        <input type="text" id="settingBrandName" class="form-control" 
               value="${localStorage.getItem('kimi_brand') || 'Nexton Technologies LLC'}" 
               ${isSuper ? '' : 'disabled'} />
        ${!isSuper ? '<p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">Only system administrators can change branding.</p>' : ''}
      </div>
      ${isSuper ? '<button class="action-btn" style="background:var(--primary); color:white; border:none; margin-top:1rem;" onclick="saveSettings()">Save Changes</button>' : ''}
    </div>
  `;
}

function saveSettings() {
  const newName = document.getElementById("settingBrandName").value;
  localStorage.setItem('kimi_brand', newName);
  applyBrandName(newName);
  notify("Settings saved", "Success");
}

async function confirmDeleteBusiness() {
  if (confirm("Permanently delete business?")) {
    const res = await fetch(`/api/business/${getBusinessId()}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { notify("Deleted", "Success"); location.reload(); }
  }
}
