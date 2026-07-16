// =====================================================================
// PT Tracker — app.js
// A small client-only app that uses a Google Sheet as its data store
// (so data syncs between phone and laptop) plus Google Calendar for
// scheduling. No backend server required.
// =====================================================================

const CFG = window.PT_CONFIG || {};
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const state = {
  sheetsToken: null,      // { access_token, expires_at }
  calendarToken: null,    // { access_token, expires_at }
  clients: [],            // [{Name,Phone,Email,Notes}]
  sessions: [],           // [{rowIndex,Date,Time,Client,Status,Cost,Notes,ViaReach}]
  payments: [],           // [{rowIndex,Date,Client,Amount,Method,Notes}]
  reachPayments: []       // [{rowIndex,Date,Amount,Notes}]
};

let sheetsTokenClient, calendarTokenClient;

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  wireStaticUI();
  restoreTokens();

  const notConfigured = !CFG.CLIENT_ID || CFG.CLIENT_ID.startsWith("YOUR_") ||
                         !CFG.SHEET_ID || CFG.SHEET_ID.startsWith("YOUR_");
  document.getElementById("configNotice").classList.toggle("hidden", !notConfigured);

  if (window.google && google.accounts) {
    initGoogleClients();
  } else {
    window.addEventListener("load", initGoogleClients);
  }

  if (state.sheetsToken) {
    onSignedIn();
  } else {
    document.getElementById("signedOutNotice").classList.remove("hidden");
  }
  updateCalendarButton();
});

function initGoogleClients() {
  if (!window.google || !google.accounts || sheetsTokenClient) return;
  sheetsTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CFG.CLIENT_ID,
    scope: SHEETS_SCOPE,
    callback: (resp) => {
      if (resp.error) { console.error(resp); alert("Sign-in failed: " + resp.error); return; }
      state.sheetsToken = { access_token: resp.access_token, expires_at: Date.now() + (resp.expires_in - 60) * 1000 };
      persistTokens();
      onSignedIn();
    }
  });
  calendarTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CFG.CLIENT_ID,
    scope: CALENDAR_SCOPE,
    callback: (resp) => {
      if (resp.error) { console.error(resp); alert("Calendar connect failed: " + resp.error); return; }
      state.calendarToken = { access_token: resp.access_token, expires_at: Date.now() + (resp.expires_in - 60) * 1000 };
      persistTokens();
      updateCalendarButton();
    }
  });
}

function persistTokens() {
  localStorage.setItem("pt_tokens", JSON.stringify({ sheets: state.sheetsToken, calendar: state.calendarToken }));
}
function restoreTokens() {
  try {
    const raw = JSON.parse(localStorage.getItem("pt_tokens") || "{}");
    if (raw.sheets && raw.sheets.expires_at > Date.now()) state.sheetsToken = raw.sheets;
    if (raw.calendar && raw.calendar.expires_at > Date.now()) state.calendarToken = raw.calendar;
  } catch (e) { /* ignore */ }
}

async function onSignedIn() {
  document.getElementById("signedOutNotice").classList.add("hidden");
  document.getElementById("signinBtn").classList.add("hidden");
  document.getElementById("signoutBtn").classList.remove("hidden");
  await loadAll();
  renderAll();
}

function wireStaticUI() {
  document.getElementById("signinBtn").addEventListener("click", () => {
    if (!sheetsTokenClient) { alert("Still loading Google sign-in, try again in a second."); return; }
    sheetsTokenClient.requestAccessToken({ prompt: state.sheetsToken ? "" : "consent" });
  });
  document.getElementById("signoutBtn").addEventListener("click", () => {
    state.sheetsToken = null; state.calendarToken = null;
    localStorage.removeItem("pt_tokens");
    location.reload();
  });
  document.getElementById("calendarBtn").addEventListener("click", () => {
    if (!calendarTokenClient) { alert("Still loading Google sign-in, try again in a second."); return; }
    calendarTokenClient.requestAccessToken({ prompt: state.calendarToken ? "" : "consent" });
  });

  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });

  document.querySelectorAll(".report-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".report-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".report-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("report-" + btn.dataset.report).classList.add("active");
    });
  });

  document.getElementById("addClientBtn").addEventListener("click", () => openClientModal());
  document.getElementById("addSessionBtn").addEventListener("click", () => openSessionModal());
  document.getElementById("addPaymentBtn").addEventListener("click", () => openPaymentModal());
  document.getElementById("addReachPaymentBtn").addEventListener("click", () => openReachPaymentModal());

  document.getElementById("recurringForm").addEventListener("submit", onGenerateRecurring);
  document.getElementById("statementForm").addEventListener("submit", onGenerateStatement);
  document.getElementById("summaryForm").addEventListener("submit", onGenerateSummary);
}

function updateCalendarButton() {
  const label = document.getElementById("calendarBtnLabel");
  const connected = state.calendarToken && state.calendarToken.expires_at > Date.now();
  label.textContent = connected ? "Google Calendar Connected" : "Connect Google Calendar";
  document.getElementById("calendarBtn").classList.toggle("btn-outline", !connected);
}

// ---------------------------------------------------------------------
// Sheets API helpers
// ---------------------------------------------------------------------
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsFetch(path, options = {}) {
  if (!state.sheetsToken) throw new Error("Not signed in");
  const res = await fetch(`${SHEETS_BASE}/${CFG.SHEET_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.sheetsToken.access_token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

function getValues(range) {
  return sheetsFetch(`/values/${encodeURIComponent(range)}`).then(d => d.values || []);
}
function updateValues(range, values) {
  return sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ range, values })
  });
}
function appendValues(range, values) {
  return sheetsFetch(`/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ range, values })
  });
}
function clearValues(range) {
  return sheetsFetch(`/values/${encodeURIComponent(range)}:clear`, { method: "POST", body: "{}" });
}

// ---------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------
async function loadAll() {
  const [clientRows, sessionRows, paymentRows, reachRows] = await Promise.all([
    getValues("Clients!A2:D1000"),
    getValues("Sessions!A2:G1000"),
    getValues("Payments!A2:E1000"),
    getValues("Reach!A5:C1000")
  ]);

  state.clients = clientRows
    .map((r, i) => ({ rowIndex: i + 2, Name: r[0] || "", Phone: r[1] || "", Email: r[2] || "", Notes: r[3] || "" }))
    .filter(c => c.Name);

  state.sessions = sessionRows
    .map((r, i) => ({
      rowIndex: i + 2, Date: r[0] || "", Time: r[1] || "", Client: r[2] || "",
      Status: r[3] || "", Cost: parseFloat(r[4]) || 0, Notes: r[5] || "", ViaReach: !!(r[6] && String(r[6]).trim())
    }))
    .filter(s => s.Date && s.Client);

  state.payments = paymentRows
    .map((r, i) => ({ rowIndex: i + 2, Date: r[0] || "", Client: r[1] || "", Amount: parseFloat(r[2]) || 0, Method: r[3] || "", Notes: r[4] || "" }))
    .filter(p => p.Date && p.Client);

  state.reachPayments = reachRows
    .map((r, i) => ({ rowIndex: i + 5, Date: r[0] || "", Amount: parseFloat(r[1]) || 0, Notes: r[2] || "" }))
    .filter(p => p.Date);
}

function renderAll() {
  renderClients();
  populateClientDropdowns();
  renderSessions();
  renderPayments();
  renderReach();
  renderDashboard();
}

// ---------------------------------------------------------------------
// Derived calculations
// ---------------------------------------------------------------------
function dateStr(d) { return typeof d === "string" ? d.slice(0, 10) : ""; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtMoney(n) { return "$" + (Math.round(n * 100) / 100).toFixed(2); }

function clientStats(name) {
  const sessions = state.sessions.filter(s => s.Client === name);
  const payments = state.payments.filter(p => p.Client === name);
  const totalCharged = sessions.filter(s => s.Status !== "Cancelled").reduce((sum, s) => sum + s.Cost, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.Amount, 0);
  const completed = sessions.filter(s => s.Status === "Completed" && s.Date).sort((a, b) => b.Date.localeCompare(a.Date));
  const lastCompleted = completed[0] ? completed[0].Date : "";
  const daysSince = lastCompleted ? Math.floor((new Date(todayStr()) - new Date(lastCompleted)) / 86400000) : "";
  return { totalCharged, totalPaid, balanceDue: totalCharged - totalPaid, lastCompleted, daysSince };
}

function reachOwed() {
  const rate = CFG.REACH_RATE || 10;
  const owedFromSessions = state.sessions.filter(s => s.Status === "Completed" && s.ViaReach).length * rate;
  const paidToReach = state.reachPayments.reduce((sum, p) => sum + p.Amount, 0);
  return owedFromSessions - paidToReach;
}

function monthKey(dateStrVal) { return dateStrVal ? dateStrVal.slice(0, 7) : ""; }

function monthlyOverview(numMonths) {
  const now = new Date();
  const months = [];
  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString(undefined, { month: "short", year: "numeric" }) });
  }
  return months.map(m => {
    const sessionsInMonth = state.sessions.filter(s => monthKey(s.Date) === m.key);
    const completed = sessionsInMonth.filter(s => s.Status === "Completed");
    const scheduled = sessionsInMonth.filter(s => s.Status === "Scheduled");
    const paymentsInMonth = state.payments.filter(p => monthKey(p.Date) === m.key);
    return {
      ...m,
      sessionsCompleted: completed.length,
      revenueEarned: completed.reduce((s, x) => s + x.Cost, 0),
      sessionsScheduled: scheduled.length,
      pendingRevenue: scheduled.reduce((s, x) => s + x.Cost, 0),
      revenueReceived: paymentsInMonth.reduce((s, x) => s + x.Amount, 0)
    };
  });
}

// ---------------------------------------------------------------------
// Rendering: Dashboard
// ---------------------------------------------------------------------
function renderDashboard() {
  const today = todayStr();
  const thisMonth = today.slice(0, 7);
  const todaysSessions = state.sessions.filter(s => s.Date === today);
  const activeClients = new Set(state.sessions.filter(s => s.Status !== "Cancelled").map(s => s.Client)).size;
  const revenueMonth = state.sessions.filter(s => s.Status === "Completed" && monthKey(s.Date) === thisMonth).reduce((s, x) => s + x.Cost, 0);
  const outstanding = state.clients.reduce((sum, c) => sum + Math.max(0, clientStats(c.Name).balanceDue), 0);
  const pending = state.sessions.filter(s => s.Status === "Scheduled").reduce((s, x) => s + x.Cost, 0);
  const receivedMonth = state.payments.filter(p => monthKey(p.Date) === thisMonth).reduce((s, x) => s + x.Amount, 0);

  document.getElementById("dashToday").textContent = todaysSessions.length;
  document.getElementById("dashActiveClients").textContent = activeClients;
  document.getElementById("dashRevenueMonth").textContent = fmtMoney(revenueMonth);
  document.getElementById("dashOutstanding").textContent = fmtMoney(outstanding);
  document.getElementById("dashOwedReach").textContent = fmtMoney(reachOwed());
  document.getElementById("dashPending").textContent = fmtMoney(pending);
  document.getElementById("dashReceivedMonth").textContent = fmtMoney(receivedMonth);

  const upcoming = state.sessions.filter(s => s.Status === "Scheduled" && s.Date >= today).sort((a, b) => a.Date.localeCompare(b.Date)).slice(0, 10);
  document.querySelector("#dashUpcomingTable tbody").innerHTML = upcoming.map(s =>
    `<tr><td>${s.Date}</td><td>${s.Time || ""}</td><td>${s.Client}</td><td>${fmtMoney(s.Cost)}</td></tr>`
  ).join("") || `<tr><td colspan="4">No upcoming sessions.</td></tr>`;

  const followup = state.clients.map(c => ({ c, stats: clientStats(c.Name) }))
    .filter(x => x.stats.daysSince !== "" && x.stats.daysSince >= 14)
    .sort((a, b) => b.stats.daysSince - a.stats.daysSince);
  document.querySelector("#dashFollowupTable tbody").innerHTML = followup.map(x =>
    `<tr><td>${x.c.Name}</td><td>${x.stats.lastCompleted}</td><td>${x.stats.daysSince}</td></tr>`
  ).join("") || `<tr><td colspan="3">Nobody is overdue for a follow-up.</td></tr>`;
}

// ---------------------------------------------------------------------
// Rendering: Clients
// ---------------------------------------------------------------------
function renderClients() {
  const tbody = document.querySelector("#clientsTable tbody");
  tbody.innerHTML = state.clients.map(c => {
    const s = clientStats(c.Name);
    return `<tr>
      <td>${c.Name}</td><td>${c.Phone}</td><td>${c.Email}</td><td>${c.Notes}</td>
      <td>${fmtMoney(s.totalCharged)}</td><td>${fmtMoney(s.totalPaid)}</td><td>${fmtMoney(s.balanceDue)}</td>
      <td>${s.lastCompleted || "-"}</td><td>${s.daysSince === "" ? "-" : s.daysSince}</td>
      <td><button class="btn btn-small btn-ghost" data-edit-client="${c.rowIndex}">Edit</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="10">No clients yet. Click "+ Add Client" to get started.</td></tr>`;

  tbody.querySelectorAll("[data-edit-client]").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = state.clients.find(x => x.rowIndex == btn.dataset.editClient);
      openClientModal(c);
    });
  });
}

function populateClientDropdowns() {
  const options = state.clients.map(c => `<option value="${c.Name}">${c.Name}</option>`).join("");
  ["recClient", "stClient"].forEach(id => {
    const el = document.getElementById(id);
    const current = el.value;
    el.innerHTML = options;
    if (current) el.value = current;
  });
}

// ---------------------------------------------------------------------
// Rendering: Sessions
// ---------------------------------------------------------------------
function renderSessions() {
  const tbody = document.querySelector("#sessionsTable tbody");
  const rows = [...state.sessions].sort((a, b) => b.Date.localeCompare(a.Date));
  tbody.innerHTML = rows.map(s => `<tr>
    <td>${s.Date}</td><td>${s.Time || ""}</td><td>${s.Client}</td>
    <td><span class="status-pill status-${s.Status.replace(/\s/g, "-")}">${s.Status}</span></td>
    <td>${fmtMoney(s.Cost)}</td><td>${s.ViaReach ? "Reach" : "-"}</td>
    <td>${s.Status === "Completed" && s.ViaReach ? fmtMoney(CFG.REACH_RATE || 10) : "-"}</td>
    <td>${s.Notes || ""}</td>
    <td>
      <button class="btn btn-small btn-ghost" data-edit-session="${s.rowIndex}">Edit</button>
      <button class="btn btn-small btn-outline" data-cal-session="${s.rowIndex}" style="color:#234f3b;border-color:#234f3b;">Add to Calendar</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="9">No sessions logged yet.</td></tr>`;

  tbody.querySelectorAll("[data-edit-session]").forEach(btn => {
    btn.addEventListener("click", () => openSessionModal(state.sessions.find(x => x.rowIndex == btn.dataset.editSession)));
  });
  tbody.querySelectorAll("[data-cal-session]").forEach(btn => {
    btn.addEventListener("click", () => addSessionToCalendar(state.sessions.find(x => x.rowIndex == btn.dataset.calSession)));
  });
}

// ---------------------------------------------------------------------
// Rendering: Payments
// ---------------------------------------------------------------------
function renderPayments() {
  const tbody = document.querySelector("#paymentsTable tbody");
  const rows = [...state.payments].sort((a, b) => b.Date.localeCompare(a.Date));
  tbody.innerHTML = rows.map(p => `<tr>
    <td>${p.Date}</td><td>${p.Client}</td><td>${fmtMoney(p.Amount)}</td><td>${p.Method || ""}</td><td>${p.Notes || ""}</td>
    <td><button class="btn btn-small btn-ghost" data-edit-payment="${p.rowIndex}">Edit</button></td>
  </tr>`).join("") || `<tr><td colspan="6">No payments logged yet.</td></tr>`;

  tbody.querySelectorAll("[data-edit-payment]").forEach(btn => {
    btn.addEventListener("click", () => openPaymentModal(state.payments.find(x => x.rowIndex == btn.dataset.editPayment)));
  });
}

// ---------------------------------------------------------------------
// Rendering: Reach
// ---------------------------------------------------------------------
function renderReach() {
  document.getElementById("reachOwed").textContent = fmtMoney(reachOwed());
  document.getElementById("reachRate").textContent = fmtMoney(CFG.REACH_RATE || 10);
  const tbody = document.querySelector("#reachTable tbody");
  const rows = [...state.reachPayments].sort((a, b) => b.Date.localeCompare(a.Date));
  tbody.innerHTML = rows.map(p => `<tr>
    <td>${p.Date}</td><td>${fmtMoney(p.Amount)}</td><td>${p.Notes || ""}</td>
    <td><button class="btn btn-small btn-ghost" data-edit-reach="${p.rowIndex}">Edit</button></td>
  </tr>`).join("") || `<tr><td colspan="4">No payments to Reach logged yet.</td></tr>`;

  tbody.querySelectorAll("[data-edit-reach]").forEach(btn => {
    btn.addEventListener("click", () => openReachPaymentModal(state.reachPayments.find(x => x.rowIndex == btn.dataset.editReach)));
  });
}

// ---------------------------------------------------------------------
// Modals (generic small form modal)
// ---------------------------------------------------------------------
function openModal(title, fieldsHtml, onSave, onDelete) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>${title}</h3>
        <form id="modalForm">${fieldsHtml}</form>
        <div class="modal-actions">
          ${onDelete ? '<button type="button" class="btn btn-danger" id="modalDelete">Delete</button>' : ""}
          <button type="button" class="btn btn-ghost" id="modalCancel">Cancel</button>
          <button type="submit" form="modalForm" class="btn btn-primary">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  if (onDelete) document.getElementById("modalDelete").addEventListener("click", () => { onDelete(); closeModal(); });
  document.getElementById("modalForm").addEventListener("submit", (e) => { e.preventDefault(); onSave(new FormData(e.target)); closeModal(); });
}
function closeModal() { document.getElementById("modalRoot").innerHTML = ""; }

function openClientModal(c) {
  openModal(c ? "Edit Client" : "Add Client", `
    <label>Name<input name="Name" required value="${c ? c.Name : ""}"></label>
    <label>Phone<input name="Phone" value="${c ? c.Phone : ""}"></label>
    <label>Email<input name="Email" type="email" value="${c ? c.Email : ""}"></label>
    <label>Notes<textarea name="Notes">${c ? c.Notes : ""}</textarea></label>
  `, async (fd) => {
    const row = [fd.get("Name"), fd.get("Phone"), fd.get("Email"), fd.get("Notes")];
    if (c) await updateValues(`Clients!A${c.rowIndex}:D${c.rowIndex}`, [row]);
    else await appendValues("Clients!A:D", [row]);
    await loadAll(); renderAll();
  }, c ? async () => {
    if (!confirm(`Delete ${c.Name}? Their past sessions and payments will stay in your records, but they'll be removed from the Clients list.`)) return;
    await clearValues(`Clients!A${c.rowIndex}:D${c.rowIndex}`);
    await loadAll(); renderAll();
  } : null);
}

function openSessionModal(s) {
  const statuses = ["Scheduled", "Completed", "No-Show", "Cancelled"];
  openModal(s ? "Edit Session" : "Add Session", `
    <label>Client
      <select name="Client" required>${state.clients.map(c => `<option ${s && s.Client === c.Name ? "selected" : ""}>${c.Name}</option>`).join("")}</select>
    </label>
    <label>Date<input name="Date" type="date" required value="${s ? s.Date : todayStr()}"></label>
    <label>Time<input name="Time" type="time" value="${s ? s.Time : ""}"></label>
    <label>Status<select name="Status">${statuses.map(st => `<option ${s && s.Status === st ? "selected" : ""}>${st}</option>`).join("")}</select></label>
    <label>Cost<input name="Cost" type="number" step="0.01" required value="${s ? s.Cost : ""}"></label>
    <label class="checkbox-row"><input type="checkbox" name="ViaReach" ${s && s.ViaReach ? "checked" : ""}> Booked via Reach</label>
    <label>Notes<textarea name="Notes">${s ? s.Notes : ""}</textarea></label>
  `, async (fd) => {
    const row = [fd.get("Date"), fd.get("Time"), fd.get("Client"), fd.get("Status"), fd.get("Cost"), fd.get("Notes"), fd.get("ViaReach") ? "Reach" : ""];
    if (s) await updateValues(`Sessions!A${s.rowIndex}:G${s.rowIndex}`, [row]);
    else await appendValues("Sessions!A:G", [row]);
    await loadAll(); renderAll();
  }, s ? async () => {
    if (!confirm("Delete this session?")) return;
    await clearValues(`Sessions!A${s.rowIndex}:G${s.rowIndex}`); await loadAll(); renderAll();
  } : null);
}

function openPaymentModal(p) {
  openModal(p ? "Edit Payment" : "Log Payment", `
    <label>Client
      <select name="Client" required>${state.clients.map(c => `<option ${p && p.Client === c.Name ? "selected" : ""}>${c.Name}</option>`).join("")}</select>
    </label>
    <label>Date<input name="Date" type="date" required value="${p ? p.Date : todayStr()}"></label>
    <label>Amount<input name="Amount" type="number" step="0.01" required value="${p ? p.Amount : ""}"></label>
    <label>Method<select name="Method">${["Card", "Cash", "Venmo", "Zelle", "Other"].map(m => `<option ${p && p.Method === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
    <label>Notes<textarea name="Notes">${p ? p.Notes : ""}</textarea></label>
  `, async (fd) => {
    const row = [fd.get("Date"), fd.get("Client"), fd.get("Amount"), fd.get("Method"), fd.get("Notes")];
    if (p) await updateValues(`Payments!A${p.rowIndex}:E${p.rowIndex}`, [row]);
    else await appendValues("Payments!A:E", [row]);
    await loadAll(); renderAll();
  }, p ? async () => {
    if (!confirm("Delete this payment?")) return;
    await clearValues(`Payments!A${p.rowIndex}:E${p.rowIndex}`); await loadAll(); renderAll();
  } : null);
}

function openReachPaymentModal(p) {
  openModal(p ? "Edit Payment to Reach" : "Log Payment to Reach", `
    <label>Date<input name="Date" type="date" required value="${p ? p.Date : todayStr()}"></label>
    <label>Amount<input name="Amount" type="number" step="0.01" required value="${p ? p.Amount : ""}"></label>
    <label>Notes<textarea name="Notes">${p ? p.Notes : ""}</textarea></label>
  `, async (fd) => {
    const row = [fd.get("Date"), fd.get("Amount"), fd.get("Notes")];
    if (p) await updateValues(`Reach!A${p.rowIndex}:C${p.rowIndex}`, [row]);
    else await appendValues("Reach!A5:C", [row]);
    await loadAll(); renderAll();
  }, p ? async () => {
    if (!confirm("Delete this Reach payment?")) return;
    await clearValues(`Reach!A${p.rowIndex}:C${p.rowIndex}`); await loadAll(); renderAll();
  } : null);
}

// ---------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------
async function addSessionToCalendar(s) {
  if (!s) return;
  if (!state.calendarToken || state.calendarToken.expires_at <= Date.now()) {
    alert('Click "Connect Google Calendar" in the top bar first.');
    return;
  }
  const start = `${s.Date}T${s.Time || "09:00"}:00`;
  const startDate = new Date(start);
  const end = new Date(startDate.getTime() + 60 * 60000); // default 1 hour
  const event = {
    summary: `PT Session — ${s.Client}`,
    description: s.Notes || "",
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: end.toISOString() }
  };
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${state.calendarToken.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(event)
  });
  if (res.ok) alert("Added to Google Calendar.");
  else alert("Couldn't add to calendar: " + (await res.text()));
}

// ---------------------------------------------------------------------
// Recurring session generator
// ---------------------------------------------------------------------
async function onGenerateRecurring(e) {
  e.preventDefault();
  const client = document.getElementById("recClient").value;
  const start = document.getElementById("recStart").value;
  const time = document.getElementById("recTime").value;
  const freqDays = parseInt(document.getElementById("recFrequency").value, 10);
  const count = parseInt(document.getElementById("recCount").value, 10);
  const cost = document.getElementById("recCost").value;
  const notes = document.getElementById("recNotes").value;
  const addToCal = document.getElementById("recAddToCalendar").checked;

  if (!client || !start || !count || !cost) return;

  const rows = [];
  const dates = [];
  const d0 = new Date(start + "T00:00:00");
  for (let i = 0; i < count; i++) {
    const d = new Date(d0.getTime() + i * freqDays * 86400000);
    const dstr = d.toISOString().slice(0, 10);
    dates.push(dstr);
    rows.push([dstr, time, client, "Scheduled", cost, notes, ""]);
  }

  await appendValues("Sessions!A:G", rows);

  if (addToCal) {
    if (!state.calendarToken || state.calendarToken.expires_at <= Date.now()) {
      alert('Sessions were added. Click "Connect Google Calendar" to also add calendar events, then use "Add to Calendar" per session.');
    } else {
      for (const dstr of dates) {
        await addSessionToCalendar({ Date: dstr, Time: time, Client: client, Notes: notes });
      }
    }
  }

  document.getElementById("recurringPreview").innerHTML =
    `<div class="notice">Added ${count} session${count > 1 ? "s" : ""} for ${client}, starting ${start}.</div>`;
  document.getElementById("recurringForm").reset();
  await loadAll(); renderAll();
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------
function onGenerateStatement(e) {
  e.preventDefault();
  const client = document.getElementById("stClient").value;
  const start = document.getElementById("stStart").value;
  const end = document.getElementById("stEnd").value;
  if (!client) return;

  let sessions = state.sessions.filter(s => s.Client === client);
  let payments = state.payments.filter(p => p.Client === client);
  if (start) { sessions = sessions.filter(s => s.Date >= start); payments = payments.filter(p => p.Date >= start); }
  if (end) { sessions = sessions.filter(s => s.Date <= end); payments = payments.filter(p => p.Date <= end); }
  sessions.sort((a, b) => a.Date.localeCompare(b.Date));
  payments.sort((a, b) => a.Date.localeCompare(b.Date));

  const totalCharged = sessions.filter(s => s.Status !== "Cancelled").reduce((s, x) => s + x.Cost, 0);
  const totalPaid = payments.reduce((s, x) => s + x.Amount, 0);
  const period = (start || end) ? `${start || "earliest"} – ${end || "today"}` : "All transactions";

  document.getElementById("statementOutput").innerHTML = `
    <h2 style="margin-top:0;">Client Statement</h2>
    <p><strong>Client:</strong> ${client}<br><strong>Period:</strong> ${period}</p>
    <p><strong>Total Charged:</strong> ${fmtMoney(totalCharged)} &nbsp;&nbsp; <strong>Total Paid:</strong> ${fmtMoney(totalPaid)}<br>
       <strong>Balance Due:</strong> ${fmtMoney(totalCharged - totalPaid)}</p>
    <h3>Sessions</h3>
    <table><thead><tr><th>Date</th><th>Status</th><th>Cost</th></tr></thead><tbody>
      ${sessions.map(s => `<tr><td>${s.Date}</td><td>${s.Status}</td><td>${fmtMoney(s.Cost)}</td></tr>`).join("") || '<tr><td colspan="3">No sessions in this period.</td></tr>'}
    </tbody></table>
    <h3>Payments</h3>
    <table><thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead><tbody>
      ${payments.map(p => `<tr><td>${p.Date}</td><td>${fmtMoney(p.Amount)}</td><td>${p.Method}</td></tr>`).join("") || '<tr><td colspan="3">No payments in this period.</td></tr>'}
    </tbody></table>
    <div class="report-actions"><button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button></div>
  `;
}

function onGenerateSummary(e) {
  e.preventDefault();
  const months = parseInt(document.getElementById("sumMonths").value, 10) || 12;
  const overview = monthlyOverview(months);
  const today = todayStr();
  const thisMonth = today.slice(0, 7);
  const revenueMonth = state.sessions.filter(s => s.Status === "Completed" && monthKey(s.Date) === thisMonth).reduce((s, x) => s + x.Cost, 0);
  const outstanding = state.clients.reduce((sum, c) => sum + Math.max(0, clientStats(c.Name).balanceDue), 0);

  document.getElementById("summaryOutput").innerHTML = `
    <h2 style="margin-top:0;">Business Summary</h2>
    <p><strong>Generated:</strong> ${today}</p>
    <p><strong>Active Clients:</strong> ${state.clients.length} &nbsp;&nbsp;
       <strong>Revenue This Month:</strong> ${fmtMoney(revenueMonth)} &nbsp;&nbsp;
       <strong>Outstanding Balance:</strong> ${fmtMoney(outstanding)} &nbsp;&nbsp;
       <strong>Owed to Reach:</strong> ${fmtMoney(reachOwed())}</p>
    <h3>Monthly Overview</h3>
    <table><thead><tr><th>Month</th><th>Sessions Completed</th><th>Revenue Earned</th><th>Sessions Scheduled</th><th>Pending Revenue</th><th>Revenue Received</th></tr></thead>
    <tbody>
      ${overview.map(m => `<tr><td>${m.label}</td><td>${m.sessionsCompleted}</td><td>${fmtMoney(m.revenueEarned)}</td><td>${m.sessionsScheduled}</td><td>${fmtMoney(m.pendingRevenue)}</td><td>${fmtMoney(m.revenueReceived)}</td></tr>`).join("")}
    </tbody></table>
    <div class="report-actions"><button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button></div>
  `;
}
