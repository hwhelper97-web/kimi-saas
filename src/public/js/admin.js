let currentSection = "dashboard";
let currentCategoryId = null;
let lastAppointmentCount = 0;
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
  notify(`New booking: ${data.name} (${data.service})`);
  if (["dashboard", "appointments"].includes(currentSection)) loadSection(currentSection);
});

socket.on("new_order", (data) => {
  notify(`New order: ${data.name}`);
  if (["dashboard", "orders"].includes(currentSection)) loadSection(currentSection);
});

// Start app
document.addEventListener("DOMContentLoaded", () => {
  loadBusinesses().then(() => {
    applyTheme(localStorage.getItem("kimi_theme") || "dark");
    applyBrandName(localStorage.getItem("kimi_brand") || "Nexton AI");
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
  document.getElementById("notificationTitle").innerText = title;
  document.getElementById("notificationText").innerText = message;
  box.classList.add("show");
  document.getElementById("notifySound").play().catch(() => {});
  setTimeout(() => box.classList.remove("show"), 4000);
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

function applyBrandName(name) {
  document.getElementById("brandLogoText").innerText = name;
  localStorage.setItem("kimi_brand", name);
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
    
    // UI Restriction
    if (decodedToken && decodedToken.role !== "SUPERADMIN") {
      select.style.display = "none";
    }
  } catch (err) {
    console.error("Load businesses error:", err);
  }
}

function switchBusiness(id) {
  localStorage.setItem("activeBusinessId", id);
  if (liveCallsInterval) { clearInterval(liveCallsInterval); liveCallsInterval = null; }
  socket.emit("join-business", id);
  renderSidebar();
  loadSection("dashboard");
}

function renderSidebar() {
  const nav = document.getElementById("sidebarNav");
  let items = [{ name: "Dashboard", key: "dashboard", icon: "📊" }];

  if (isOrderBusiness()) {
    items.push({ name: "Menu", key: "menu", icon: "🍽️" });
    items.push({ name: "Orders", key: "orders", icon: "📦" });
  } else {
    items.push({ name: "Appointments", key: "appointments", icon: "📅" });
  }

  items.push({ name: "AI Calls", key: "calls", icon: "📞" });
  items.push({ name: "Business Info", key: "business", icon: "🏢" });
  items.push({ name: "Staff", key: "staff", icon: "👥" });
  items.push({ name: "Settings", key: "settings", icon: "⚙️" });

  if (decodedToken && decodedToken.role === "SUPERADMIN") {
    items.push({ name: "Create Business", key: "create-business", icon: "✨" });
  }

  nav.innerHTML = items.map(item => `
    <a class="nav-item ${item.key === currentSection ? 'active' : ''}" onclick="loadSection('${item.key}')">
      <span>${item.icon}</span> ${item.name}
    </a>
  `).join("");
}

/* ==========================================================================
   SECTION LOADING
   ========================================================================== */
async function loadSection(section) {
  currentSection = section;
  renderSidebar(); // update active class
  
  if (liveCallsInterval) { clearInterval(liveCallsInterval); liveCallsInterval = null; }
  if (revenueChartInstance) revenueChartInstance.destroy();
  if (callsChartInstance) callsChartInstance.destroy();

  document.getElementById("pageTitle").innerText = section.charAt(0).toUpperCase() + section.slice(1);
  const content = document.getElementById("contentArea");
  const charts = document.getElementById("chartsContainer");
  
  charts.style.display = (section === "dashboard") ? "grid" : "none";
  content.innerHTML = "<p>Loading...</p>";

  try {
    if (section === "dashboard") await renderDashboard(content);
    else if (section === "appointments") await renderAppointments(content);
    else if (section === "orders") await renderOrders(content);
    else if (section === "calls") await renderCalls(content);
    else if (section === "business") await renderBusinessInfo(content);
    else if (section === "menu") await renderMenu(content);
    else if (section === "staff") await renderStaff(content);
    else if (section === "settings") await renderSettings(content);
    else if (section === "create-business") await renderCreateBusiness(content);
  } catch (err) {
    content.innerHTML = `<div class="card badge-danger">Failed to load ${section}: ${err.message}</div>`;
  }
}

/* ==========================================================================
   SUPERADMIN BUSINESS CREATION
   ========================================================================== */
async function renderCreateBusiness(content) {
  content.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <h2 style="margin-bottom: 24px;">Create New Business</h2>
      <p style="color:var(--text-muted); margin-bottom:24px;">Provision a new business, automatically create the Owner account, and scaffold dynamic staff roles.</p>
      
      <div class="settings-grid">
        <div>
          <h3 style="margin-bottom: 16px; font-size:15px; color:var(--brand-primary);">1. Business Details</h3>
          <div class="form-group">
            <label>Business Name</label>
            <input type="text" id="cbName" class="form-control" placeholder="e.g. Nexton's Diner" />
          </div>
          <div class="form-group">
            <label>Business Type</label>
            <select id="cbType" class="form-control">
              <option value="order">Order / Restaurant</option>
              <option value="appointment">Appointment / Service</option>
            </select>
          </div>
          <div class="form-group">
            <label>Business Phone (Twilio)</label>
            <input type="text" id="cbPhone" class="form-control" placeholder="+1234567890" />
          </div>
          <div class="form-group">
            <label>Address</label>
            <input type="text" id="cbAddress" class="form-control" />
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="cbMainBranch" checked /> Is Main Branch?
            </label>
          </div>
        </div>

        <div>
          <h3 style="margin-bottom: 16px; font-size:15px; color:var(--brand-primary);">2. Owner Credentials</h3>
          <div class="form-group">
            <label>Owner Name</label>
            <input type="text" id="cbOwnerName" class="form-control" />
          </div>
          <div class="form-group">
            <label>Owner Email</label>
            <input type="email" id="cbOwnerEmail" class="form-control" />
          </div>
          <div class="form-group">
            <label>Owner Password</label>
            <input type="password" id="cbOwnerPassword" class="form-control" />
          </div>
          <div class="form-group">
            <label>Owner Phone</label>
            <input type="text" id="cbOwnerPhone" class="form-control" />
          </div>
        </div>
      </div>
      
      <div style="margin-top: 24px; padding-top:24px; border-top:1px solid var(--border-subtle); display:flex; justify-content:flex-end;">
        <button class="btn btn-primary" onclick="submitNewBusiness()" style="padding: 12px 24px;">Create Business & Send Invites</button>
      </div>
    </div>
  `;
}

async function submitNewBusiness() {
  const data = {
    name: document.getElementById("cbName").value,
    type: document.getElementById("cbType").value,
    phoneNumber: document.getElementById("cbPhone").value,
    address: document.getElementById("cbAddress").value,
    isMainBranch: document.getElementById("cbMainBranch").checked,
    ownerName: document.getElementById("cbOwnerName").value,
    ownerEmail: document.getElementById("cbOwnerEmail").value,
    ownerPassword: document.getElementById("cbOwnerPassword").value,
    ownerPhone: document.getElementById("cbOwnerPhone").value
  };

  try {
    const res = await fetch("/api/business", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      notify("Business & Staff Provisioned Successfully", "Success");
      setTimeout(() => window.location.reload(), 1500);
    } else {
      const err = await res.json();
      notify(err.error || "Failed to create business", "Error");
    }
  } catch (error) {
    notify(error.message, "Error");
  }
}


/* ==========================================================================
   DASHBOARD
   ========================================================================== */
async function renderDashboard(content) {
  const res = await fetch(`/api/dashboard/analytics?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  if (!result.success) throw new Error("Analytics failed");

  const data = result.data.totals;
  const topItems = result.data.topItems || [];

  content.innerHTML = `
    <div class="hero-grid" style="grid-template-columns: 1fr 1.5fr 1fr; gap:16px;">
      <!-- CARD 1: AI OVERVIEW -->
      <div class="card" style="margin:0; background: rgba(94, 234, 212, 0.03); border-color: rgba(94, 234, 212, 0.2);">
        <h3 style="margin-bottom: 12px; font-size:14px;">AI Performance</h3>
        <div class="stats-grid" style="grid-template-columns: 1fr; gap:12px;">
          <div>
            <div class="stat-title" style="font-size:11px;">Conversion</div>
            <div class="stat-value text-gradient" style="font-size:24px;">${data.conversionRate}%</div>
          </div>
          <div>
            <div class="stat-title" style="font-size:11px;">Success</div>
            <div class="stat-value text-gradient" style="font-size:24px;">${data.aiSuccessRate}%</div>
          </div>
        </div>
      </div>

      <!-- CARD 2: REVENUE GROWTH (FIXED AT TOP) -->
      <div class="card" style="margin:0; padding:12px 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h3 style="font-size:14px;">Revenue Growth</h3>
          <span style="font-size:11px; color:var(--status-success); font-weight:700;">+$${(data.totalOrders * 12.5).toFixed(2)} Today</span>
        </div>
        <div class="analytics-hub">
          <div class="chart-box">
            <div class="chart-header">
              <div class="eyebrow">Engagement Metrics</div>
              <h3>Call Volume History</h3>
            </div>
            <canvas id="callsChart"></canvas>
          </div>
        </div>  </div>
      </div>

      <!-- CARD 3: TOP PERFORMERS -->
      <div class="card" style="margin:0; border-color: rgba(129, 140, 248, 0.2); background: rgba(129, 140, 248, 0.03);">
        <h3 style="font-size:14px; margin-bottom:12px;">Top Items</h3>
        <div style="display:grid; grid-template-columns: 1fr; gap:8px;">
          ${topItems.slice(0, 3).map(item => `
            <div style="display:flex; align-items:center; gap:8px; background:var(--bg-elevated); padding:8px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
              <div style="flex:1;">
                <strong style="display:block; color:var(--text-heading); font-size:12px;">${item.name}</strong>
              </div>
              <div style="font-weight:700; color:var(--brand-primary); font-size:12px;">$${item.revenue.toFixed(0)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">Total Calls</div>
        <div class="stat-value">${data.totalCalls}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">${isOrderBusiness() ? 'Total Orders' : 'Total Appointments'}</div>
        <div class="stat-value">${data.totalOrders}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">AI Minutes</div>
        <div class="stat-value">${data.totalMinutes}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Avg Duration</div>
        <div class="stat-value">${data.averageCallDuration}s</div>
      </div>
    </div>
  `;

  // Start polling live calls
  liveCallsInterval = setInterval(fetchLiveCalls, 3000);
  fetchLiveCalls();
  initCharts(result.data.charts);
}

async function fetchLiveCalls() {
  const res = await fetch(`/api/dashboard/live-calls?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const container = document.getElementById("liveCallsContainer");
  if (!container) return;
  
  if (!result.success || !result.data.length) {
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">No active calls right now</div>`;
    return;
  }

  container.innerHTML = result.data.map(call => `
    <div class="live-call-card" style="background:var(--bg-elevated); border:1px solid rgba(94, 234, 212, 0.2); border-radius:var(--radius-md); padding:16px; margin-bottom:16px; position:relative; box-shadow: var(--shadow-md);">
      <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:12px;">
        <div>
          <div class="eyebrow" style="font-size:9px; margin-bottom:2px;">Neural Voice Stream</div>
          <strong style="color:var(--text-heading); font-size:15px; letter-spacing:-0.01em;">${call.from || "Private Line"}</strong>
        </div>
        <div style="text-align:right;">
          <span class="badge badge-success" style="font-size:9px; padding:2px 8px; box-shadow: 0 0 10px rgba(52, 211, 153, 0.3);">ACTIVE</span>
        </div>
      </div>
      
      <div style="display:flex; align-items:center; gap:8px; background:rgba(0,0,0,0.2); padding:8px 12px; border-radius:8px; margin-bottom:12px;">
        <div class="waveform" style="display:flex; align-items:center; gap:2px; height:12px;">
          <div style="width:2px; height:60%; background:var(--brand-primary); animation: wave 1s infinite ease-in-out;"></div>
          <div style="width:2px; height:100%; background:var(--brand-primary); animation: wave 1.2s infinite ease-in-out;"></div>
          <div style="width:2px; height:40%; background:var(--brand-primary); animation: wave 0.8s infinite ease-in-out;"></div>
          <div style="width:2px; height:80%; background:var(--brand-primary); animation: wave 1.1s infinite ease-in-out;"></div>
        </div>
        <span style="font-size:11px; color:var(--text-muted); font-family:monospace;">Duration: ${call.duration}s</span>
      </div>

      <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted);">
        <span>Lat: 842ms</span>
        <span>Bitrate: 64kbps</span>
      </div>
    </div>
  `).join("");
}

function initCharts(chartData) {
  if (!chartData) return;
  
  const revCtx = document.getElementById("revenueChart");
  if (revCtx) {
    revCtx.height = 180;
    revenueChartInstance = new Chart(revCtx, {
      type: "line",
      data: {
        labels: chartData.revenueChart.labels,
        datasets: [{
          label: "Revenue",
          data: chartData.revenueChart.values,
          borderColor: "#5eead4",
          borderWidth: 2,
          pointRadius: 2,
          backgroundColor: "rgba(94, 234, 212, 0.05)",
          fill: true, tension: 0.4
        }]
      },
      options: { 
        maintainAspectRatio: false,
        responsive: true, 
        plugins: { legend: { display: false } }, 
        scales: { 
          y: { 
            ticks: { font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.03)' } 
          }, 
          x: { 
            ticks: { font: { size: 10 } },
            grid: { display: false } 
          } 
        } 
      }
    });
  }

  const callsCtx = document.getElementById("callsChart");
  if (callsCtx) {
    callsCtx.height = 160;
    callsChartInstance = new Chart(callsCtx, {
      type: "bar",
      data: {
        labels: chartData.callsChart.labels,
        datasets: [{
          label: "Calls",
          data: chartData.callsChart.values,
          backgroundColor: "rgba(129, 140, 248, 0.6)",
          borderRadius: 4
        }]
      },
      options: { 
        maintainAspectRatio: false,
        responsive: true, 
        plugins: { legend: { display: false } }, 
        scales: { 
          y: { 
            ticks: { font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.03)' } 
          }, 
          x: { 
            ticks: { font: { size: 10 } },
            grid: { display: false } 
          } 
        } 
      }
    });
  }
}

/* ==========================================================================
   STAFF MANAGEMENT
   ========================================================================== */
async function renderStaff(content) {
  const res = await fetch("/api/auth/staff", { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const staff = result.data || [];

  content.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
        <h2>Access Control</h2>
        <button class="btn btn-primary" onclick="openAddStaffModal()">+ Add Staff</button>
      </div>
      <div id="addStaffForm" style="display:none; margin-bottom:24px; padding:20px; background:var(--bg-elevated); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="staffEmail" class="form-control" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="staffPassword" class="form-control" />
        </div>
        <div class="form-group">
          <label>Role</label>
          <select id="staffRole" class="form-control">
            <option value="STAFF">Staff (Basic)</option>
            <option value="MANAGER">Manager</option>
            <option value="BARBER">Barber</option>
            <option value="STYLIST">Stylist</option>
            <option value="THERAPIST">Therapist</option>
            <option value="BARISTA">Barista</option>
            <option value="WAITER">Waiter</option>
            <option value="CHEF">Chef</option>
            <option value="HEAD_CHEF">Head Chef</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="createStaff()">Save Staff</button>
        <button class="btn btn-secondary" onclick="document.getElementById('addStaffForm').style.display='none'">Cancel</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>Email</th><th>Role</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${staff.map(s => `
              <tr>
                <td style="color:var(--text-heading); font-weight:500;">${s.email}</td>
                <td><span class="badge ${s.role === 'OWNER' ? 'badge-success' : 'badge-warning'}">${s.role}</span></td>
                <td>
                  ${s.role !== 'OWNER' ? `<button class="btn btn-danger" onclick="alert('Feature coming soon')">Remove</button>` : `<span class="text-muted">N/A</span>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAddStaffModal() {
  document.getElementById("addStaffForm").style.display = "block";
}

async function createStaff() {
  const email = document.getElementById("staffEmail").value;
  const password = document.getElementById("staffPassword").value;
  const role = document.getElementById("staffRole").value;

  const res = await fetch("/api/auth/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, password, role })
  });

  const result = await res.json();
  if (result.success) {
    notify("Staff member added successfully", "Success");
    loadSection("staff");
  } else {
    notify(result.error || "Failed to add staff", "Error");
  }
}

/* ==========================================================================
   SETTINGS
   ========================================================================== */
async function renderSettings(content) {
  content.innerHTML = `
    <div class="settings-grid">
      <div class="card">
        <h3 style="margin-bottom: 20px;">Platform Appearance</h3>
        
        <div class="form-group">
          <label>Brand Name</label>
          <input type="text" id="settingBrandName" class="form-control" value="${localStorage.getItem('kimi_brand') || 'Nexton AI'}" />
        </div>

        <div class="form-group">
          <label>UI Theme</label>
          <select id="settingTheme" class="form-control">
            <option value="dark" ${localStorage.getItem('kimi_theme') === 'dark' ? 'selected' : ''}>Premium Dark (Default)</option>
            <option value="light" ${localStorage.getItem('kimi_theme') === 'light' ? 'selected' : ''}>Clean Light</option>
          </select>
        </div>

        <button class="btn btn-primary" onclick="saveSettings()">Save Preferences</button>
      </div>

      <div class="card">
        <h3 style="margin-bottom: 20px;">API & Integrations</h3>
        <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">
          Configure your external API connections. These apply globally to your tenant.
        </p>

        <div class="form-group">
          <label>OpenAI API Key (Model routing)</label>
          <input type="password" class="form-control" value="sk-proj-**********************" disabled />
        </div>
        
        <div class="form-group">
          <label>Twilio Account SID</label>
          <input type="text" class="form-control" value="AC23c65a**********************" disabled />
        </div>

        <p style="color:var(--text-muted); font-size:12px;">
          <em>Note: In this demo environment, keys are managed via environment variables.</em>
        </p>
      </div>
    </div>
  `;
}

function saveSettings() {
  const brand = document.getElementById("settingBrandName").value;
  const theme = document.getElementById("settingTheme").value;
  applyBrandName(brand);
  applyTheme(theme);
  notify("Settings saved successfully", "Success");
}

/* ==========================================================================
   APPOINTMENTS (CALENDAR VIEW)
   ========================================================================== */
async function renderAppointments(content) {
  const res = await fetch(`/api/appointment?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const appts = result.data || [];

  content.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
        <h2>Schedule & Calendar</h2>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary">Today</button>
          <button class="btn btn-primary">+ New Booking</button>
        </div>
      </div>
      
      <div class="settings-grid" style="grid-template-columns: 300px 1fr; gap: 30px;">
        <!-- Left: Upcoming List -->
        <div>
          <h3 style="font-size:15px; color:var(--brand-primary); margin-bottom:16px;">Upcoming Today</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${appts.length ? appts.map(a => `
              <div style="background:var(--bg-elevated); border-left:3px solid var(--brand-primary); padding:16px; border-radius:var(--radius-md);">
                <div style="font-size:12px; color:var(--brand-primary); font-weight:600; margin-bottom:4px;">${new Date(a.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div style="font-weight:600; color:var(--text-heading);">${a.customerName}</div>
                <div style="font-size:13px; color:var(--text-muted);">${a.serviceName}</div>
              </div>
            `).join("") : `<div style="color:var(--text-muted); font-size:14px; text-align:center; padding:20px;">No appointments scheduled.</div>`}
          </div>
        </div>

        <!-- Right: Calendar Mockup -->
        <div style="background:var(--bg-panel); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
            <h3 style="margin:0;">${new Date().toLocaleDateString([], {month:'long', year:'numeric'})}</h3>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary" style="padding:4px 10px;">&larr;</button>
              <button class="btn btn-secondary" style="padding:4px 10px;">&rarr;</button>
            </div>
          </div>
          
          <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:1px; background:var(--border-subtle); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); overflow:hidden;">
            ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `
              <div style="background:var(--bg-panel); padding:10px; text-align:center; font-weight:600; font-size:13px; color:var(--text-muted);">${d}</div>
            `).join("")}
            ${Array.from({length: 35}).map((_, i) => {
              const day = i - 2; // Offset for demo
              const isToday = day === new Date().getDate();
              const hasAppt = appts.some(a => new Date(a.date).getDate() === day);
              
              if (day < 1 || day > 31) return `<div style="background:var(--bg-body); padding:30px 10px;"></div>`;
              return `
                <div style="background:var(--bg-panel); padding:10px; height:80px; position:relative; ${isToday ? 'background:rgba(94, 234, 212, 0.05);' : ''}">
                  <span style="${isToday ? 'background:var(--brand-primary); color:#000; border-radius:50%; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; font-weight:700;' : 'color:var(--text-heading);'}">${day}</span>
                  ${hasAppt ? `<div style="position:absolute; bottom:10px; left:10px; right:10px; background:var(--brand-primary); height:6px; border-radius:3px;"></div>` : ''}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderOrders(content) {
  const res = await fetch(`/api/order?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const orders = result.data || [];
  
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom: 20px;">Recent Orders</h2>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>ID</th><th>Customer</th><th>Total</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${orders.length ? orders.map(o => `
              <tr>
                <td>#${o.id.substring(0,8)}</td>
                <td style="color:var(--text-heading); font-weight:500;">${o.customerName}</td>
                <td style="color:var(--status-success); font-weight:600;">$${(o.total || 0).toFixed(2)}</td>
                <td>${new Date(o.createdAt).toLocaleString()}</td>
                <td>
                  <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="openOrderDetails('${o.id}')">View Details</button>
                </td>
              </tr>
            `).join("") : `<tr><td colspan="5" style="text-align:center;">No orders yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function openOrderDetails(orderId) {
  try {
    const res = await fetch(`/api/order/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json();
    if (!result.success) throw new Error("Failed to load details");
    const order = result.data;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay show";
    overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div class="receipt-modal">
        <div class="receipt-header">
          <div class="receipt-badge">AI Voice Order</div>
          <div class="receipt-logo">Nexton Burger Joint</div>
          <p style="font-size:12px; color:var(--text-muted);">#${order.id.substring(0,8)} | ${new Date(order.createdAt).toLocaleString()}</p>
        </div>

        <div class="receipt-items">
          ${order.items.map(item => `
            <div class="receipt-item">
              <div class="receipt-item-main">
                <div class="receipt-item-name">${item.quantity}x ${item.menuItem?.name || 'Item'}</div>
                <div class="receipt-item-details">${item.selectedAddons || ''}</div>
              </div>
              <div class="receipt-item-price">$${(item.menuItem?.price || 0).toFixed(2)}</div>
            </div>
          `).join("")}
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-totals">
          <div class="receipt-total-row">
            <span>Subtotal</span>
            <span>$${(order.total * 0.9).toFixed(2)}</span>
          </div>
          <div class="receipt-total-row">
            <span>Tax (10%)</span>
            <span>$${(order.total * 0.1).toFixed(2)}</span>
          </div>
          <div class="receipt-grand-total">
            <span>Total</span>
            <span>$${order.total.toFixed(2)}</span>
          </div>
        </div>

        <div class="receipt-footer">
          <p>Thank you for your order!</p>
          <p style="margin-top:8px; font-size:10px;">Processed by Kimi AI Voice Engine</p>
          <button class="btn btn-primary w-full" style="margin-top:24px;" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  } catch (err) {
    notify(err.message, "Error");
  }
}

async function renderCalls(content) {
  const res = await fetch(`/api/call/history?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const calls = result.data || [];

  content.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom: 20px;">Call History</h2>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Duration</th><th>Tokens Used</th></tr></thead>
          <tbody>
            ${calls.length ? calls.map(c => `
              <tr>
                <td>${new Date(c.createdAt).toLocaleString()}</td>
                <td>${c.duration}s</td>
                <td>${c.tokensUsed}</td>
              </tr>
            `).join("") : `<tr><td colspan="3" style="text-align:center;">No calls logged</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderBusinessInfo(content) {
  const res = await fetch(`/api/business/current?businessId=${getBusinessId()}`, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();
  const b = result.data || {};

  content.innerHTML = `
    <div class="card" style="max-width: 800px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h2 style="margin:0;">Business Profile</h2>
        ${decodedToken && decodedToken.role === "SUPERADMIN" ? `<button class="btn btn-danger" onclick="deleteBusiness()">Delete Business</button>` : ""}
      </div>
      
      <div class="settings-grid">
        <div class="form-group">
          <label>Business Name</label>
          <input type="text" id="bizName" class="form-control" value="${b.name || ''}" />
        </div>
        <div class="form-group">
          <label>Twilio Phone Number</label>
          <input type="text" id="bizPhone" class="form-control" value="${b.phoneNumber || ''}" />
        </div>
        <div class="form-group">
          <label>Address</label>
          <input type="text" id="bizAddress" class="form-control" value="${b.address || ''}" />
        </div>
        <div class="form-group">
          <label>Timings (e.g. Mon-Fri 9AM-10PM)</label>
          <input type="text" id="bizTimings" class="form-control" value="${b.timings || ''}" />
        </div>
        <div class="form-group">
          <label>Currency</label>
          <select id="bizCurrency" class="form-control">
            <option value="USD" ${b.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
            <option value="EUR" ${b.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
            <option value="GBP" ${b.currency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tax Rate (%)</label>
          <input type="number" step="0.1" id="bizTaxRate" class="form-control" value="${b.taxRate || '0'}" />
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Platform Appearance: Logo URL</label>
          <input type="text" id="bizLogo" class="form-control" placeholder="https://..." value="${b.logoUrl || ''}" />
        </div>
      </div>
      
      <button class="btn btn-primary" style="margin-top:20px;" onclick="saveBusiness()">Save Profile</button>
    </div>
  `;
}

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
    if (data.logoUrl) document.querySelector(".logo-icon").innerHTML = `<img src="${data.logoUrl}" style="width:32px; height:32px; border-radius:8px; object-fit:cover;" />`;
  } else {
    notify("Failed to update business", "Error");
  }
}

async function deleteBusiness() {
  if (!confirm("CRITICAL WARNING: Are you sure you want to permanently delete this business and ALL its data (Orders, Staff, Calls)? This cannot be undone.")) return;
  
  try {
    const res = await fetch(`/api/business/${getBusinessId()}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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

/* ==========================================================================
   MENU MANAGEMENT (UBER EATS STYLE)
   ========================================================================== */
async function renderMenu(content) {
  const businessId = getBusinessId();
  const res = await fetch(`/api/menu/categories?businessId=${businessId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await res.json();
  content.innerHTML = `
    <div class="menu-layout">
      <div class="menu-sidebar">
        <div class="menu-sidebar-header">
          <h3>Categories</h3>
          <button class="btn btn-primary" style="padding: 4px 8px;" onclick="openCategoryModal()">+</button>
        </div>
        <div id="categoryList" class="category-list">
          <p>Loading...</p>
        </div>
      </div>
      <div class="menu-main">
        <div class="menu-toolbar">
          <div class="search-input-wrap">
            <span class="icon">🔍</span>
            <input type="text" id="menuSearch" placeholder="Search menu items..." oninput="handleMenuSearch(this.value)" />
          </div>
          <button class="btn btn-primary" onclick="openItemModal()">+ Add New Item</button>
        </div>
        <div id="itemsGrid" class="items-grid">
          <p>Select a category to view items</p>
        </div>
      </div>
    </div>

    <!-- Category Modal -->
    <div id="categoryModal" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 id="categoryModalTitle">Add Category</h3>
          <button class="close-modal" onclick="closeModal('categoryModal')">&times;</button>
        </div>
        <div class="form-group">
          <label>Quick Select Predefined Category</label>
          <select id="catPredefined" class="form-control" onchange="document.getElementById('catName').value = this.value">
            <option value="">-- Choose or type below --</option>
            <option value="Main Dishes">Main Dishes</option>
            <option value="Burgers">Burgers</option>
            <option value="Pizza">Pizza</option>
            <option value="Sandwiches">Sandwiches</option>
            <option value="Rice / Biryani">Rice / Biryani</option>
            <option value="BBQ / Grill">BBQ / Grill</option>
            <option value="Fast Food">Fast Food</option>
            <option value="Sides">Sides</option>
            <option value="Fries">Fries</option>
            <option value="Nuggets">Nuggets</option>
            <option value="Wings">Wings</option>
            <option value="Drinks">Drinks</option>
            <option value="Soft Drinks">Soft Drinks</option>
            <option value="Juices">Juices</option>
            <option value="Milkshakes">Milkshakes</option>
            <option value="Coffee / Tea">Coffee / Tea</option>
            <option value="Desserts">Desserts</option>
            <option value="Cakes">Cakes</option>
            <option value="Ice Cream">Ice Cream</option>
          </select>
        </div>
        <div class="form-group">
          <label>Category Name (Custom)</label>
          <input type="text" id="catName" class="form-control" placeholder="e.g. My Special Wraps" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="catDesc" class="form-control" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>Image URL</label>
          <input type="text" id="catImage" class="form-control" />
        </div>
        <div class="form-group">
          <label>Display Order</label>
          <input type="number" id="catOrder" class="form-control" value="0" />
        </div>
        <div style="margin-top: 24px; display:flex; justify-content:flex-end; gap: 12px;">
          <button class="btn btn-secondary" onclick="closeModal('categoryModal')">Cancel</button>
          <button class="btn btn-primary" id="saveCatBtn" onclick="saveCategory()">Save Category</button>
        </div>
      </div>
    </div>

    <!-- Item Modal -->
    <div id="itemModal" class="modal-overlay">
      <div class="modal-container" style="width: 800px;">
        <div class="modal-header">
          <h3 id="itemModalTitle">Add Menu Item</h3>
          <button class="close-modal" onclick="closeModal('itemModal')">&times;</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <div class="form-group">
              <label>Item Name</label>
              <input type="text" id="itemName" class="form-control" />
            </div>
            <div class="form-group">
              <label>Base Price</label>
              <input type="number" id="itemPrice" class="form-control" step="0.01" />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea id="itemDesc" class="form-control" rows="3"></textarea>
            </div>
            <div class="form-group">
              <label>Category</label>
              <select id="itemCategory" class="form-control"></select>
            </div>
            <div class="form-group">
              <label>Image URL</label>
              <input type="text" id="itemImage" class="form-control" />
            </div>
            <div class="form-group">
              <label>Prep Time (mins)</label>
              <input type="number" id="itemPrepTime" class="form-control" value="15" />
            </div>
          </div>
          <div>
            <div class="variant-section">
              <div class="variant-header">
                <h4>Sizes</h4>
                <button class="btn btn-secondary" style="padding: 2px 6px; font-size:12px;" onclick="addSizeRow()">+ Add</button>
              </div>
              <div id="sizesList"></div>
            </div>
            <div class="variant-section">
              <div class="variant-header">
                <h4>Add-ons</h4>
                <button class="btn btn-secondary" style="padding: 2px 6px; font-size:12px;" onclick="addAddonRow()">+ Add</button>
              </div>
              <div id="addonsList"></div>
            </div>
            <div class="variant-section">
              <div class="variant-header">
                <h4>Options (Spice, Crust, etc.)</h4>
                <button class="btn btn-secondary" style="padding: 2px 6px; font-size:12px;" onclick="addOptionRow()">+ Add</button>
              </div>
              <div id="optionsList"></div>
            </div>
          </div>
        </div>
        <div style="margin-top: 24px; display:flex; justify-content:flex-end; gap: 12px;">
          <button class="btn btn-secondary" onclick="closeModal('itemModal')">Cancel</button>
          <button class="btn btn-primary" id="saveItemBtn" onclick="saveItem()">Save Item</button>
        </div>
      </div>
    </div>
  `;
  await loadCategories();
}

async function loadCategories() {
  const businessId = getBusinessId();
  const res = await fetch(`/api/menu/categories?businessId=${businessId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await res.json();
  const container = document.getElementById("categoryList");
  
  if (result.success) {
    const categories = result.data;
    if (categories.length === 0) {
      container.innerHTML = `<p style="padding: 16px; font-size:13px; color:var(--text-muted);">No categories found.</p>`;
      return;
    }
    
    container.innerHTML = categories.map(c => `
      <div class="category-item ${currentCategoryId === c.id ? 'active' : ''}" onclick="selectCategory('${c.id}')">
        <span>${c.name}</span>
        <div class="actions" style="display:none;">
          <button onclick="event.stopPropagation(); editCategory('${c.id}')">✏️</button>
        </div>
      </div>
    `).join("");

    if (!currentCategoryId && categories.length > 0) {
      selectCategory(categories[0].id);
    } else if (currentCategoryId) {
      loadItems();
    }
  }
}

function selectCategory(id) {
  currentCategoryId = id;
  const items = document.querySelectorAll(".category-item");
  items.forEach(it => it.classList.remove("active"));
  
  // Update UI and load items
  loadCategories(); // Refresh list to update active class
}

async function loadItems(search = "") {
  const businessId = getBusinessId();
  const container = document.getElementById("itemsGrid");
  container.innerHTML = `<p>Loading items...</p>`;

  let url = `/api/menu/items?businessId=${businessId}`;
  if (currentCategoryId) url += `&categoryId=${currentCategoryId}`;
  if (search) url += `&search=${search}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const result = await res.json();

  if (result.success) {
    const items = result.data;
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align:center;">No items found in this category.</div>`;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="menu-item-card">
        <img src="${item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'}" class="menu-item-img" />
        <div class="menu-item-content">
          <div class="menu-item-header">
            <h4>${item.name}</h4>
            <span class="menu-item-price">$${item.price.toFixed(2)}</span>
          </div>
          <p class="menu-item-desc">${item.description || 'No description available'}</p>
          
          <div style="margin-bottom: 16px;">
            ${item.sizes && item.sizes.length ? `
              <div class="menu-sizes" style="margin-bottom: 8px;">
                ${item.sizes.map(s => `<span class="menu-size-pill">${s.name}: +$${s.price.toFixed(2)}</span>`).join("")}
              </div>
            ` : ''}
            ${item.addons && item.addons.length ? `
              <div class="menu-sizes">
                ${item.addons.map(a => `<span class="menu-size-pill" style="border-color:var(--brand-secondary);">${a.name}: +$${a.price.toFixed(2)}</span>`).join("")}
              </div>
            ` : ''}
          </div>

          <div class="menu-item-footer">
            <div class="availability-toggle">
              <label class="switch">
                <input type="checkbox" ${item.isAvailable ? 'checked' : ''} onchange="toggleItemAvailability('${item.id}', this.checked)">
                <span class="slider"></span>
              </label>
              <span>${item.isAvailable ? 'In Stock' : 'Out of Stock'}</span>
            </div>
            <div style="display:flex; gap: 8px;">
              <button class="btn btn-secondary" style="padding: 6px 10px;" onclick="editItem('${item.id}')">Edit</button>
              <button class="btn btn-danger" style="padding: 6px 10px;" onclick="deleteItem('${item.id}')">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    `).join("");
  }
}

let editingCategoryId = null;
function openCategoryModal(cat = null) {
  editingCategoryId = cat ? cat.id : null;
  document.getElementById("categoryModalTitle").innerText = cat ? "Edit Category" : "Add Category";
  document.getElementById("catPredefined").value = "";
  document.getElementById("catName").value = cat ? cat.name : "";
  document.getElementById("catDesc").value = cat ? cat.description : "";
  document.getElementById("catImage").value = cat ? cat.imageUrl : "";
  document.getElementById("catOrder").value = cat ? cat.displayOrder : 0;
  
  document.getElementById("categoryModal").classList.add("show");
}

async function saveCategory() {
  const data = {
    name: document.getElementById("catName").value,
    description: document.getElementById("catDesc").value,
    imageUrl: document.getElementById("catImage").value,
    displayOrder: parseInt(document.getElementById("catOrder").value),
    businessId: getBusinessId()
  };

  const method = editingCategoryId ? "PUT" : "POST";
  const url = editingCategoryId ? `/api/menu/category/${editingCategoryId}` : "/api/menu/category";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    notify(`Category ${editingCategoryId ? 'updated' : 'created'}`, "Success");
    closeModal('categoryModal');
    loadCategories();
  } else {
    notify("Failed to save category", "Error");
  }
}

async function editCategory(id) {
  const businessId = getBusinessId();
  const res = await fetch(`/api/menu/categories?businessId=${businessId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await res.json();
  const cat = result.data.find(c => c.id === id);
  if (cat) openCategoryModal(cat);
}

// Item Functions
let editingItemId = null;
async function openItemModal(item = null) {
  editingItemId = item ? item.id : null;
  document.getElementById("itemModalTitle").innerText = item ? "Edit Menu Item" : "Add Menu Item";
  document.getElementById("itemName").value = item ? item.name : "";
  document.getElementById("itemPrice").value = item ? item.price : "";
  document.getElementById("itemDesc").value = item ? item.description : "";
  document.getElementById("itemImage").value = item ? item.imageUrl : "";
  document.getElementById("itemPrepTime").value = item ? item.prepTime : 15;

  // Load categories for dropdown
  const businessId = getBusinessId();
  const catRes = await fetch(`/api/menu/categories?businessId=${businessId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const catResult = await catRes.json();
  const catSelect = document.getElementById("itemCategory");
  catSelect.innerHTML = catResult.data.map(c => `<option value="${c.id}" ${item && item.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join("");
  if (!item && currentCategoryId) catSelect.value = currentCategoryId;

  // Clear and load variants
  document.getElementById("sizesList").innerHTML = "";
  document.getElementById("addonsList").innerHTML = "";
  document.getElementById("optionsList").innerHTML = "";

  if (item) {
    if (item.sizes) item.sizes.forEach(s => addSizeRow(s.name, s.price));
    if (item.addons) item.addons.forEach(a => addAddonRow(a.name, a.price));
    if (item.options) item.options.forEach(o => addOptionRow(o.type, o.value));
  }

  document.getElementById("itemModal").classList.add("show");
}

function addSizeRow(name = "", price = "") {
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Size Name" value="${name}" />
    <input type="number" class="form-control" placeholder="+$" step="0.01" value="${price}" />
    <button class="btn btn-danger" onclick="this.parentElement.remove()">🗑️</button>
  `;
  document.getElementById("sizesList").appendChild(row);
}

function addAddonRow(name = "", price = "") {
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Add-on Name" value="${name}" />
    <input type="number" class="form-control" placeholder="+$" step="0.01" value="${price}" />
    <button class="btn btn-danger" onclick="this.parentElement.remove()">🗑️</button>
  `;
  document.getElementById("addonsList").appendChild(row);
}

function addOptionRow(type = "", value = "") {
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `
    <input type="text" class="form-control" placeholder="Type (e.g. Spice)" value="${type}" />
    <input type="text" class="form-control" placeholder="Value (e.g. Mild)" value="${value}" />
    <button class="btn btn-danger" onclick="this.parentElement.remove()">🗑️</button>
  `;
  document.getElementById("optionsList").appendChild(row);
}

async function saveItem() {
  const businessId = getBusinessId();
  
  const sizes = Array.from(document.getElementById("sizesList").children).map(row => ({
    name: row.children[0].value,
    price: row.children[1].value
  })).filter(s => s.name);

  const addons = Array.from(document.getElementById("addonsList").children).map(row => ({
    name: row.children[0].value,
    price: row.children[1].value
  })).filter(a => a.name);

  const options = Array.from(document.getElementById("optionsList").children).map(row => ({
    type: row.children[0].value,
    value: row.children[1].value
  })).filter(o => o.type);

  const data = {
    name: document.getElementById("itemName").value,
    price: document.getElementById("itemPrice").value,
    description: document.getElementById("itemDesc").value,
    imageUrl: document.getElementById("itemImage").value,
    prepTime: document.getElementById("itemPrepTime").value,
    categoryId: document.getElementById("itemCategory").value,
    businessId,
    sizes,
    addons,
    options
  };

  const method = editingItemId ? "PUT" : "POST";
  const url = editingItemId ? `/api/menu/item/${editingItemId}` : "/api/menu/item";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    notify(`Item ${editingItemId ? 'updated' : 'created'}`, "Success");
    closeModal('itemModal');
    loadItems();
  } else {
    notify("Failed to save item", "Error");
  }
}

async function editItem(id) {
  const res = await fetch(`/api/menu/items?businessId=${getBusinessId()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await res.json();
  const item = result.data.find(i => i.id === id);
  if (item) openItemModal(item);
}

async function deleteItem(id) {
  if (!confirm("Are you sure you want to delete this item?")) return;
  const res = await fetch(`/api/menu/item/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    notify("Item deleted", "Success");
    loadItems();
  }
}

async function toggleItemAvailability(id, isAvailable) {
  const res = await fetch(`/api/menu/item/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ isAvailable })
  });
  if (res.ok) {
    notify(`Item is now ${isAvailable ? 'In Stock' : 'Out of Stock'}`, "Info");
    loadItems();
  }
}

function handleMenuSearch(val) {
  loadItems(val);
}

function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}
