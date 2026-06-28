(function () {
  const data = window.AutoloomData;
  const h = data.helpers;
  const STORAGE_KEY = "autoloom-demo-state-v4";
  const STAGES = ["Quoted", "Won", "In Production", "Ready for Dispatch", "Invoiced"];
  const STAGE_PROGRESS = {
    Quoted: 0,
    Won: 12,
    "In Production": 62,
    "Ready for Dispatch": 100,
    Invoiced: 100
  };
  // Five calm stages keep the board scannable and mirror the order board.
  const SALES_STAGES = ["New", "Quoting", "Quote sent", "Won", "Lost"];
  // Map any legacy/finer-grained status onto a canonical stage.
  const STAGE_ALIASES = {
    Costing: "Quoting",
    "Commercial review": "Quoting",
    "Spec clarification": "New",
    "Follow-up scheduled": "Quote sent"
  };

  // Metal rates are derived from the (mock) MCX commodity index.
  const MCX_RATES = { Aluminium: 248, Copper: 886 };

  // Cable spec vocabularies — the standard options a cable manufacturer works
  // with. Used across the quote builder and inquiry forms so specs are
  // structured (not free text).
  const CABLE_TYPES = [
    "3.5 Core XLPE Armoured 1.1kV",
    "3.5 Core XLPE Armoured 11kV",
    "2 Core Aluminium Flexible",
    "4 Core PVC Armoured",
    "3.5 Core ACSR",
    "PIJF Unarmoured",
    "PIJF Armoured",
    "Jelly Filled Unarmoured",
    "Jelly Filled Armoured",
    "Other"
  ];
  const CROSS_SECTIONS = [16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];
  const CONDUCTOR_MATERIALS = ["Aluminium", "Copper", "Copper Clad Steel (CCS)"];
  const VOLTAGE_RATINGS = ["1.1kV", "6.6kV", "11kV", "33kV"];
  const INSULATION_TYPES = ["XLPE", "PVC", "EPR"];
  const ARMORING_TYPES = ["Steel Wire", "Steel Tape", "Unarmoured"];
  // EMD / bank-guarantee instrument modes.
  const EMD_MODES = ["Demand Draft", "Bank Guarantee", "Online Transfer", "Cash", "Exempted"];

  const defaultQuoteInput = {
      customerId: "cust-arvind",
      cableType: "3.5 Core XLPE Armoured 1.1kV",
      material: "Aluminium",
      conductorSize: 240,
      voltage: "1.1kV",
      insulation: "XLPE",
      armoring: "Steel Wire",
      lengthM: 1800,
      metalRate: MCX_RATES.Aluminium,
      overheadPerM: 86,
      marginPct: 14
  };

  // Each role owns one step of the chain and only sees the tabs it needs; the
  // deal is handed forward from one team to the next. `null` means full access
  // (Owner), so the owner can view and step in at any stage.
  const roleAccess = {
    Owner: null,
    Sales: ["#/dashboard", "#/sales", "#/quote", "#/contacts", "#/compliance"],
    Operations: ["#/dashboard", "#/orders", "#/job-card", "#/dispatch"],
    Accounts: ["#/dashboard", "#/orders", "#/dispatch", "#/accounting"]
  };

  // The end-to-end business process, in order, with the team that owns each step.
  // Shown on every workflow page so the whole team understands the chronology.
  const WORKFLOW = [
    { key: "inquiry", label: "Inquiry", team: "Sales", hash: "#/sales" },
    { key: "quote", label: "Quote", team: "Sales", hash: "#/quote" },
    { key: "order", label: "Order", team: "Operations", hash: "#/orders" },
    { key: "dispatch", label: "Dispatch", team: "Operations", hash: "#/dispatch" },
    { key: "invoice", label: "Invoice", team: "Accounts", hash: "#/accounting" }
  ];

  // Non-persisted UI state for toggling inline "add" forms.
  const ui = { addInquiry: false, addCustomer: false, addCompliance: false };

  // Order whose detail drawer is open (transient, not persisted).
  let detailOrderId = null;

  let state = loadState();
  // Re-hydrate any customers the user onboarded in a previous session.
  (state.extraCustomers || []).forEach((customer) => {
    if (!data.customers.find((item) => item.id === customer.id)) data.customers.push(customer);
  });
  migrateInquiryStages();

  function migrateInquiryStages() {
    // Normalize legacy inquiry statuses to the current 5-stage model.
    state.inquiries.forEach((inquiry) => {
      if (!SALES_STAGES.includes(inquiry.status)) {
        inquiry.status = STAGE_ALIASES[inquiry.status] || "New";
      }
    });
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createInitialState() {
    const initial = {
      role: "Owner",
      lastQuoteInput: { ...defaultQuoteInput },
      quoteLines: [],
      activeQuoteId: data.quotes[0].id,
      activeOrderId: data.orders[0].id,
      activeInquiryId: null,
      quotes: clone(data.quotes),
      orders: clone(data.orders),
      jobCards: clone(data.jobCards),
      dispatches: clone(data.dispatches),
      accountingDocs: clone(data.accountingDocs),
      inquiries: clone(data.inquiries),
      complianceItems: clone(data.complianceItems),
      activityEvents: clone(data.activityEvents),
      extraCustomers: [],
      orderStages: {},
      dispatchChecks: {}
    };
    initial.orders.forEach((order) => {
      initial.orderStages[order.id] = order.stage;
    });
    initial.dispatches.forEach((dispatch) => {
      initial.dispatchChecks[dispatch.id] = dispatch.checklist.map((item) => item.done);
    });
    return initial;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return createInitialState();
      const parsed = JSON.parse(saved);
      return { ...createInitialState(), ...parsed };
    } catch (_error) {
      return createInitialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      // Demo still works in-memory if browser storage is unavailable.
    }
  }

  function resetDemo() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_error) {
      // Ignore storage failures; reset in-memory state below.
    }
    state = createInitialState();
    roleSelect.value = state.role;
    renderNav();
    renderCurrentRoute();
  }

  function addActivity(actor, text) {
    state.activityEvents.unshift({
      at: "2026-06-23 " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      actor,
      text
    });
    state.activityEvents = state.activityEvents.slice(0, 8);
    saveState();
  }

  function nextNumber(prefix, collection) {
    return collection.filter((item) => item.id.startsWith(prefix)).length + 1;
  }

  // Nav is ordered to mirror the real business chronology: a deal starts in
  // Sales, becomes a quote, converts into an order for Operations, and finishes
  // with Accounts. The Owner sees every step and can intervene anywhere.
  const routes = [
    {
      group: "Command",
      phase: "Overview",
      items: [{ hash: "#/dashboard", title: "Dashboard", icon: "DB", render: renderDashboard }]
    },
    {
      group: "Sales",
      phase: "Step 1 · Sales",
      items: [
        { hash: "#/sales", title: "Sales Board", icon: "SB", render: renderSales },
        { hash: "#/quote", title: "Quote Builder", icon: "QB", render: renderQuoteBuilder },
        { hash: "#/contacts", title: "Contacts", icon: "CT", render: renderContacts },
        { hash: "#/compliance", title: "EMD & BG Tracker", icon: "BG", render: renderCompliance }
      ]
    },
    {
      group: "Operations",
      phase: "Step 2 · Operations",
      items: [
        { hash: "#/orders", title: "Order Board", icon: "OB", render: renderOrders },
        { hash: "#/job-card", title: "Operator Card", icon: "JC", render: renderJobCard },
        { hash: "#/dispatch", title: "Dispatch Checklist", icon: "DC", render: renderDispatch }
      ]
    },
    {
      group: "Accounts",
      phase: "Step 3 · Accounts",
      items: [{ hash: "#/accounting", title: "Invoice Readiness", icon: "AR", render: renderAccounting }]
    }
  ];

  const flatRoutes = routes.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      group: group.group,
      phase: group.phase
    }))
  );

  function allowedHashes(role) {
    return roleAccess[role] || flatRoutes.map((item) => item.hash);
  }

  function isAllowed(hash, role) {
    return allowedHashes(role).includes(hash);
  }

  const nav = document.getElementById("sidebar-nav");
  const content = document.getElementById("content");
  const title = document.getElementById("route-title");
  const phase = document.getElementById("route-phase");
  const roleSelect = document.getElementById("role-select");
  const notifButton = document.getElementById("notif-button");
  const notifPanel = document.getElementById("notif-panel");
  const notifCount = document.getElementById("notif-count");

  function init() {
    renderNav();
    renderNotifPanel();
    bindChrome();
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && detailOrderId) {
        detailOrderId = null;
        renderCurrentRoute();
      }
    });
    window.addEventListener("hashchange", renderCurrentRoute);
    if (!window.location.hash) {
      window.location.hash = "#/dashboard";
    }
    renderCurrentRoute();
  }

  function bindChrome() {
    roleSelect.value = state.role;
    roleSelect.addEventListener("change", (event) => {
      state.role = event.target.value;
      saveState();
      renderNav();
      const hash = window.location.hash || "#/dashboard";
      if (!isAllowed(hash, state.role)) {
        window.location.hash = "#/dashboard";
      } else {
        renderCurrentRoute();
      }
    });

    document.getElementById("reset-button").addEventListener("click", resetDemo);

    notifButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleNotif();
    });
    notifPanel.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNotif();
    });
    document.addEventListener("click", (event) => {
      if (notifPanel.hidden) return;
      if (notifPanel.contains(event.target) || notifButton.contains(event.target)) return;
      closeNotif();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNotif();
    });
  }

  function toggleNotif() {
    if (notifPanel.hidden) {
      notifPanel.hidden = false;
      notifButton.setAttribute("aria-expanded", "true");
    } else {
      closeNotif();
    }
  }

  function closeNotif() {
    notifPanel.hidden = true;
    notifButton.setAttribute("aria-expanded", "false");
  }

  function renderNotifPanel() {
    const signals = data.aiInsights;
    const highCount = signals.filter((item) => item.severity === "High").length;
    notifCount.textContent = String(signals.length);
    notifButton.classList.toggle("has-high", highCount > 0);
    notifButton.setAttribute(
      "aria-label",
      `${signals.length} AI-ready signals, ${highCount} high priority`
    );
    notifPanel.innerHTML = `
      <div class="notif-head">
        <div>
          <strong>AI-Ready Signals</strong>
          <p class="muted">Rules watching margin, delays, documents, and cash.</p>
        </div>
        <span class="badge ${highCount ? "High" : "medium"}">${highCount} high</span>
      </div>
      <div class="insight-list">
        ${signals
          .map(
            (item) => `
              <article class="insight">
                <div><span class="badge ${item.severity}">${item.severity}</span> <strong>${item.type}</strong></div>
                <p class="muted">${item.text}</p>
                <a href="${item.route}">Review source</a>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderNav() {
    const allowed = allowedHashes(state.role);
    nav.innerHTML = routes
      .map((group) => {
        const items = group.items.filter((item) => allowed.includes(item.hash));
        if (!items.length) return "";
        return `
          <section class="nav-section">
            <div class="nav-heading">
              <span>${group.group}</span>
              <span class="phase-pill">${group.phase}</span>
            </div>
            ${items
              .map(
                (item) => `
                  <a class="nav-link" href="${item.hash}" data-hash="${item.hash}">
                    <span class="nav-icon" aria-hidden="true">${item.icon}</span>
                    <span>${item.title}</span>
                  </a>
                `
              )
              .join("")}
          </section>
        `;
      })
      .join("");
  }

  function renderCurrentRoute() {
    const hash = window.location.hash || "#/dashboard";
    if (!isAllowed(hash, state.role)) {
      window.location.hash = "#/dashboard";
      return;
    }
    // The detail drawer only belongs on the order board.
    if (hash !== "#/orders") detailOrderId = null;
    const route = flatRoutes.find((item) => item.hash === hash) || flatRoutes[0];
    title.textContent = route.title;
    phase.textContent = `${route.phase} / ${state.role} view`;
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.hash === route.hash);
    });
    content.innerHTML = route.render();
    bindRouteEvents(route.hash);
  }

  function bindRouteEvents(hash) {
    if (hash === "#/quote") bindQuoteBuilder();
    if (hash === "#/orders") bindOrderBoard();
    if (hash === "#/dispatch") bindDispatch();
    if (hash === "#/job-card") bindJobCard();
    if (hash === "#/accounting") bindAccounting();
    if (hash === "#/sales") bindSales();
    if (hash === "#/contacts") bindContacts();
    if (hash === "#/compliance") bindCompliance();
  }

  function roleNote() {
    const notes = {
      Owner: "Owner view shows every step of the chain end to end — you can watch the handoffs and step in at any stage.",
      Sales: "Step 1. Sales captures inquiries, builds quotes, and sends won deals to the order board — handing off to Operations.",
      Operations: "Step 2. Operations picks up new orders from Sales, runs production and operator cards, and clears dispatch for Accounts.",
      Accounts: "Step 3. Accounts picks up dispatched orders, raises and syncs invoices, and tracks receivables."
    };
    return `<div class="role-note"><strong>${state.role} workspace.</strong> ${notes[state.role]}</div>`;
  }

  function workflowGuide(activeKey, hint) {
    return `
      <section class="workflow-guide" aria-label="Inquiry to invoice workflow">
        <ol class="workflow-steps">
          ${WORKFLOW.map((step, index) => {
            const allowed = isAllowed(step.hash, state.role);
            const inner = `<span class="step-num">${index + 1}</span><span class="step-text">${step.label}<small>${step.team}</small></span>`;
            const cls = `${step.key === activeKey ? "current" : ""} ${allowed ? "" : "locked"}`.trim();
            return `<li class="${cls}">${allowed ? `<a href="${step.hash}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
          }).join("")}
        </ol>
        ${hint ? `<p class="workflow-hint"><span class="badge medium">Next step</span> ${hint}</p>` : ""}
      </section>
    `;
  }

  /* ----------------------------- Generic form helpers ----------------------------- */

  function fField(name, label, inner, span) {
    return `<div class="field ${span ? "span-2" : ""}"><label for="${name}">${label}</label>${inner}</div>`;
  }

  function fInput(name, label, type, value, attrs) {
    return fField(
      name,
      label,
      `<input id="${name}" name="${name}" type="${type}" value="${value == null ? "" : value}" ${attrs || ""}>`
    );
  }

  function fSelect(name, label, options, value) {
    return fField(
      name,
      label,
      `<select id="${name}" name="${name}">${options
        .map(([optionValue, text]) => `<option value="${optionValue}" ${String(optionValue) === String(value) ? "selected" : ""}>${text}</option>`)
        .join("")}</select>`
    );
  }

  function addFormShell(id, title, fields, submitLabel) {
    return `
      <form class="add-form card" data-add-form="${id}">
        <div class="add-form-head">
          <strong>${title}</strong>
          <button type="button" class="ghost-button" data-cancel-add="${id}">Cancel</button>
        </div>
        <div class="form-grid">${fields}</div>
        <div class="action-row"><button type="submit" class="primary-button">${submitLabel}</button></div>
      </form>
    `;
  }

  function bindAddControls() {
    document.querySelectorAll("[data-open-add]").forEach((button) => {
      button.addEventListener("click", () => {
        ui[button.dataset.openAdd] = true;
        renderCurrentRoute();
      });
    });
    document.querySelectorAll("[data-cancel-add]").forEach((button) => {
      button.addEventListener("click", () => {
        ui[button.dataset.cancelAdd] = false;
        renderCurrentRoute();
      });
    });
  }

  /* ----------------------------- Dashboard ----------------------------- */

  function renderDashboard() {
    const openQuotes = state.quotes.filter((quote) => quote.status !== "Approved").length;
    const productionOrders = Object.values(state.orderStages).filter((stage) => stage === "In Production").length;
    const readyDispatch = Object.values(state.orderStages).filter((stage) => stage === "Ready for Dispatch").length;
    const dispatchBlocks = state.dispatches.filter((dispatch) =>
      state.dispatchChecks[dispatch.id].some((done) => !done)
    ).length;

    const receivables = state.accountingDocs.reduce((sum, doc) => sum + doc.amount, 0);
    const synced = state.accountingDocs.filter((doc) => doc.syncStatus.startsWith("Synced")).length;
    const pendingSync = state.accountingDocs.length - synced;
    const paymentHolds = state.accountingDocs.filter(
      (doc) => doc.risk === "High" || /block|await|pending/i.test(doc.status)
    ).length;

    return `
      <div class="stack">
        ${roleNote()}
        <section class="kpi-grid">
          ${kpiCard(
            "Operational Overview",
            "Quote-to-dispatch health",
            "#/orders",
            "Open order board",
            [
              { label: "Open quotes", value: openQuotes, caption: "Awaiting approval" },
              { label: "In production", value: productionOrders, caption: "Active factory jobs" },
              { label: "Ready to dispatch", value: readyDispatch, caption: "Cleared for pickup" },
              { label: "Dispatch blockers", value: dispatchBlocks, caption: "Docs or payment missing", tone: dispatchBlocks ? "alert" : "" }
            ]
          )}
          ${kpiCard(
            "Accounts Overview",
            "Invoicing and receivables",
            "#/accounting",
            "Open invoice readiness",
            [
              { label: "Receivables tracked", value: h.money(receivables), caption: "Across invoices and PI" },
              { label: "Invoices synced", value: synced, caption: "Live in Tally" },
              { label: "Pending sync", value: pendingSync, caption: "Not yet in books", tone: pendingSync ? "alert" : "" },
              { label: "Payment holds", value: paymentHolds, caption: "Need follow-up", tone: paymentHolds ? "alert" : "" }
            ]
          )}
        </section>
        <div class="page-grid">
          <div class="stack">
            ${renderPriorityTable()}
            ${renderOrderSummaryTable()}
          </div>
          <aside class="stack">
            ${renderActivity()}
          </aside>
        </div>
      </div>
    `;
  }

  function kpiCard(title, caption, linkHash, linkLabel, stats) {
    return `
      <article class="kpi-card">
        <div class="kpi-head">
          <div>
            <h2>${title}</h2>
            <p class="muted">${caption}</p>
          </div>
          <a class="badge" href="${linkHash}">${linkLabel}</a>
        </div>
        <div class="kpi-stats">
          ${stats
            .map(
              (stat) => `
                <div class="kpi-stat ${stat.tone === "alert" ? "alert" : ""}">
                  <span>${stat.label}</span>
                  <strong>${stat.value}</strong>
                  <small>${stat.caption || ""}</small>
                </div>
              `
            )
            .join("")}
        </div>
      </article>
    `;
  }

  function renderPriorityTable() {
    return `
      <section class="table-card">
        <div class="table-header">
          <div>
            <h2>Today Priority Queue</h2>
            <p>Items that make the demo feel operationally alive.</p>
          </div>
          <span class="badge medium">AI-ready rules</span>
        </div>
        <table>
          <thead><tr><th>Area</th><th>Customer</th><th>Action</th><th>Due</th></tr></thead>
          <tbody>
            ${state.inquiries
              .slice(0, 4)
              .map(
                (item) => `
                  <tr>
                    <td><span class="badge">${item.status}</span></td>
                    <td>${h.customerName(item.customerId)}</td>
                    <td>${item.nextAction}</td>
                    <td>${h.shortDate(item.dueDate)} <span class="muted">(${h.daysUntil(item.dueDate)}d)</span></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderOrderSummaryTable() {
    return `
      <section class="table-card">
        <div class="table-header">
          <div>
            <h2>Live Order Snapshot</h2>
            <p>Operations, accounts, and sales see the same source of truth.</p>
          </div>
          <a class="badge" href="#/orders">Open Board</a>
        </div>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Stage</th><th>Amount</th><th>Promise</th></tr></thead>
          <tbody>
            ${state.orders
              .map(
                (order) => `
                  <tr>
                    <td class="mono">${order.id}</td>
                    <td>${h.customerName(order.customerId)}</td>
                    <td><span class="badge ${state.orderStages[order.id].replaceAll(" ", "")}">${state.orderStages[order.id]}</span></td>
                    <td>${h.money(order.amount)}</td>
                    <td>${h.shortDate(order.promisedDate)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderActivity() {
    return `
      <section class="card">
        <h2>Activity Trail</h2>
        <div class="activity-list">
          ${state.activityEvents
            .map(
              (event) => `
                <article class="insight">
                  <strong>${event.actor}</strong>
                  <p class="muted">${event.text}</p>
                  <span class="mono muted">${event.at}</span>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  /* ----------------------------- Quote builder (calculator + preview) ----------------------------- */

  function activeInquiry() {
    if (!state.activeInquiryId) return null;
    return state.inquiries.find((item) => item.id === state.activeInquiryId && !item.orderId) || null;
  }

  function renderQuoteBuilder() {
    const result = h.calculateCableQuote(state.lastQuoteInput);
    const lines = state.quoteLines;
    const grandTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const hasLines = lines.length > 0;
    const inquiry = activeInquiry();
    const inquiryBanner = inquiry
      ? `<div class="link-banner">
           <span><span class="badge">From Sales</span> Quoting inquiry <span class="mono">${inquiry.id}</span> — ${inquiry.requirement} for <strong>${h.customerName(inquiry.customerId)}</strong>. Sending to the order board will move it off the sales board.</span>
           <button class="ghost-button" type="button" data-clear-inquiry>Clear link</button>
         </div>`
      : "";
    return `
      <div class="stack">
        ${workflowGuide("quote", "Send the quote to the order board — that hands the order off to Operations.")}
        ${inquiryBanner}
        <div class="page-grid">
          <section class="card">
            <h2>Build a Quote</h2>
            <p class="muted">Add as many cable types as the customer needs. Metal prices come from the MCX index.</p>

            <div class="step-head">
              <p class="step-label">Step 1 — Choose the customer</p>
              <button class="ghost-button btn-sm" type="button" data-open-add="addCustomer">+ New customer</button>
            </div>
            <div class="form-grid">
              ${selectField("customerId", "Customer", state.lastQuoteInput.customerId, data.customers.map((customer) => [customer.id, customer.name]))}
            </div>
            ${ui.addCustomer ? addCustomerForm() : ""}

            <p class="step-label">Step 2 — Configure a cable</p>
            <div class="form-grid" id="costing-form">
              ${selectField("cableType", "Cable type", state.lastQuoteInput.cableType, CABLE_TYPES.map((t) => [t, t]))}
              ${selectField("material", "Conductor material", state.lastQuoteInput.material, CONDUCTOR_MATERIALS.map((m) => [m, m]))}
              ${selectField("conductorSize", "Conductor size (sq mm)", state.lastQuoteInput.conductorSize, CROSS_SECTIONS.map((s) => [s, `${s} sq mm`]))}
              ${selectField("voltage", "Voltage rating", state.lastQuoteInput.voltage, VOLTAGE_RATINGS.map((v) => [v, v]))}
              ${selectField("insulation", "Insulation", state.lastQuoteInput.insulation, INSULATION_TYPES.map((i) => [i, i]))}
              ${selectField("armoring", "Armouring", state.lastQuoteInput.armoring, ARMORING_TYPES.map((a) => [a, a]))}
              ${numberField("lengthM", "Length (m)", state.lastQuoteInput.lengthM)}
              ${numberField("metalRate", "Metal rate per kg (MCX index)", state.lastQuoteInput.metalRate, "Auto-filled from MCX; editable for what-ifs")}
              ${numberField("overheadPerM", "Overhead per meter (₹)", state.lastQuoteInput.overheadPerM)}
              ${numberField("marginPct", "Margin percent (%)", state.lastQuoteInput.marginPct)}
            </div>
            ${costingResults(result, state.lastQuoteInput)}
            <div class="action-row">
              <button class="primary-button" type="button" data-add-line>+ Add this cable to the quote</button>
            </div>

            <p class="step-label">Step 3 — Cables in this quote <span class="badge">${lines.length}</span></p>
            ${renderQuoteLines(lines, grandTotal)}
            ${renderMcxCard()}
          </section>

          <aside class="stack">
            ${renderDraftPreview()}
            <section class="card">
              <h2>Send this quote</h2>
              <p class="muted">Preview reflects the cables on the left. “Send to order board” hands the order to Operations and (if linked) moves the inquiry off the sales board.</p>
              <div class="action-row">
                <button class="primary-button" type="button" data-send-order ${hasLines ? "" : "disabled"}>Send to order board</button>
                <button class="ghost-button" type="button" data-save-draft ${hasLines ? "" : "disabled"}>Save as draft quote</button>
              </div>
            </section>
          </aside>
        </div>
        ${renderSavedQuotes()}
      </div>
    `;
  }

  function renderDraftPreview() {
    const input = state.lastQuoteInput;
    const customer = data.customers.find((item) => item.id === input.customerId);
    const lines = state.quoteLines;
    const grandTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    return `
      <section class="quote-paper">
        <div class="quote-top">
          <div>
            <p class="eyebrow">Autoloom Cable OS</p>
            <h2>Quote Preview</h2>
            <p class="muted">Draft for ${customer ? customer.name : "—"}</p>
          </div>
          <div class="quote-total">
            <span class="muted">Grand total</span>
            <h2>${h.money(grandTotal)}</h2>
            <span class="badge medium">Draft</span>
          </div>
        </div>
        ${customer
          ? `<div class="form-grid section-offset">
              <div><h3>Customer</h3><p>${customer.name}<br><span class="muted">${customer.contact}, ${customer.city}</span></p></div>
              <div><h3>Payment terms</h3><p>${customer.paymentTerms}</p></div>
            </div>`
          : ""}
        ${lines.length
          ? `<table class="table-offset">
              <thead><tr><th>Description</th><th>Material</th><th>Length</th><th>Line total</th></tr></thead>
              <tbody>
                ${lines
                  .map(
                    (line) => `
                      <tr>
                        <td>${line.cableSpec}</td>
                        <td>${line.material}</td>
                        <td>${line.lengthM.toLocaleString("en-IN")} m</td>
                        <td class="mono">${h.money(line.lineTotal)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
              <tfoot>
                <tr><th colspan="3">Grand total (${lines.length} cable type${lines.length === 1 ? "" : "s"})</th><th class="mono">${h.money(grandTotal)}</th></tr>
              </tfoot>
            </table>`
          : `<div class="empty">Add cables on the left to build this quote.</div>`}
        <p class="muted section-offset">Metal pricing on every line is derived from the MCX index.</p>
      </section>
    `;
  }

  function renderMcxCard() {
    const input = state.lastQuoteInput;
    return `
      <section class="card flat-card mcx-card section-offset">
        <h3>MCX Index Pricing</h3>
        <p class="muted">Metal rates are derived from the live MCX (Multi Commodity Exchange) index and locked into each line as you add it.</p>
        <div class="mcx-rates">
          <div class="mcx-rate ${input.material === "Aluminium" ? "active" : ""}">
            <span>Aluminium · MCX</span>
            <strong>${h.money(MCX_RATES.Aluminium)}/kg</strong>
          </div>
          <div class="mcx-rate ${input.material === "Copper" ? "active" : ""}">
            <span>Copper · MCX</span>
            <strong>${h.money(MCX_RATES.Copper)}/kg</strong>
          </div>
        </div>
        <span class="badge medium">Current line uses ${h.money(input.metalRate)}/kg from MCX (${input.material})</span>
      </section>
    `;
  }

  function renderQuoteLines(lines, grandTotal) {
    if (!lines.length) {
      return `<div class="empty">No cables added yet. Configure a cable above and choose “Add this cable to the quote”.</div>`;
    }
    return `
      <div class="table-card flat-card line-table">
        <table>
          <thead><tr><th>Cable</th><th>Material</th><th>Length</th><th>Margin</th><th>Line total</th><th></th></tr></thead>
          <tbody>
            ${lines
              .map(
                (line) => `
                  <tr>
                    <td>${line.cableSpec}</td>
                    <td>${line.material}</td>
                    <td>${line.lengthM.toLocaleString("en-IN")} m</td>
                    <td>${line.marginPct}%</td>
                    <td class="mono">${h.money(line.lineTotal)}</td>
                    <td><button class="ghost-button" type="button" data-remove-line="${line.id}">Remove</button></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr><th colspan="4">Grand total (${lines.length} cable type${lines.length === 1 ? "" : "s"})</th><th class="mono">${h.money(grandTotal)}</th><th></th></tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function renderSavedQuotes() {
    return `
      <section class="table-card">
        <div class="table-header">
          <div>
            <h2>Saved Quotes</h2>
            <p>Every locked quote, ready to push to the order board.</p>
          </div>
          <span class="badge">${state.quotes.length}</span>
        </div>
        <table>
          <thead><tr><th>Quote</th><th>Customer</th><th>Cables</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${state.quotes
              .map((quote) => {
                const order = state.orders.find((item) => item.quoteId === quote.id);
                const cables = getQuoteLines(quote).length;
                return `
                  <tr>
                    <td class="mono">${quote.id}</td>
                    <td>${h.customerName(quote.customerId)}</td>
                    <td>${cables}</td>
                    <td class="mono">${h.money(quote.total)}</td>
                    <td><span class="badge ${quote.status}">${quote.status}</span></td>
                    <td>${order
                      ? `<a class="badge" href="#/orders">On board · ${order.id}</a>`
                      : `<button class="ghost-button" type="button" data-send-quote-order="${quote.id}">Send to order board</button>`}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </section>
    `;
  }

  function selectField(name, label, value, options) {
    return `
      <div class="field">
        <label for="${name}">${label}</label>
        <select id="${name}" name="${name}" autocomplete="off" data-cost-input="${name}">
          ${options.map(([optionValue, text]) => `<option value="${optionValue}" ${String(value) === String(optionValue) ? "selected" : ""}>${text}</option>`).join("")}
        </select>
      </div>
    `;
  }

  function numberField(name, label, value, hint) {
    return `
      <div class="field">
        <label for="${name}">${label}</label>
        <input id="${name}" name="${name}" data-cost-input="${name}" type="number" inputmode="decimal" min="0" step="1" autocomplete="off" value="${value}">
        ${hint ? `<small class="field-hint">${hint}</small>` : ""}
      </div>
    `;
  }

  function costingResults(result, input) {
    return `
      <div class="result-block" id="costing-results">
        <div class="result-strip">
          <div class="result-item"><span>Metal cost / m</span><strong>${h.money(result.metalCostPerM)}</strong></div>
          <div class="result-item"><span>Base cost / m</span><strong>${h.money(result.basePerM)}</strong></div>
          <div class="result-item"><span>Margin</span><strong>${h.money(result.margin)}</strong></div>
          <div class="result-item"><span>Line total</span><strong>${h.money(result.total)}</strong></div>
        </div>
        <p class="mcx-note muted">Metal cost is derived from the MCX index rate of ${h.money(input.metalRate)}/kg for ${input.material}.</p>
      </div>
    `;
  }

  function buildLine(input) {
    const result = h.calculateCableQuote(input);
    const armourText = input.armoring === "Unarmoured" ? "unarmoured" : `${input.armoring} armoured`;
    return {
      id: "line-" + Math.random().toString(36).slice(2, 9),
      cableType: input.cableType,
      material: input.material,
      conductorSize: input.conductorSize,
      voltage: input.voltage,
      insulation: input.insulation,
      armoring: input.armoring,
      lengthM: input.lengthM,
      metalRate: input.metalRate,
      overheadPerM: input.overheadPerM,
      marginPct: input.marginPct,
      cableSpec: `${input.cableType} · ${input.conductorSize} sq mm ${input.material}, ${input.voltage}, ${input.insulation} insulated, ${armourText}`,
      basePerM: result.basePerM,
      metalCostPerM: result.metalCostPerM,
      lineTotal: result.total
    };
  }

  function bindQuoteBuilder() {
    document.querySelectorAll("[data-cost-input]").forEach((input) => {
      input.addEventListener("input", updateCostingState);
      input.addEventListener("change", updateCostingState);
    });

    const addLine = document.querySelector("[data-add-line]");
    if (addLine) {
      addLine.addEventListener("click", () => {
        state.quoteLines.push(buildLine(state.lastQuoteInput));
        saveState();
        renderCurrentRoute();
      });
    }

    document.querySelectorAll("[data-remove-line]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const id = event.currentTarget.dataset.removeLine;
        state.quoteLines = state.quoteLines.filter((line) => line.id !== id);
        saveState();
        renderCurrentRoute();
      });
    });

    const clearInquiry = document.querySelector("[data-clear-inquiry]");
    if (clearInquiry) {
      clearInquiry.addEventListener("click", () => {
        state.activeInquiryId = null;
        saveState();
        renderCurrentRoute();
      });
    }

    const sendOrder = document.querySelector("[data-send-order]");
    if (sendOrder) {
      sendOrder.addEventListener("click", () => {
        const quote = buildQuoteFromDraft("Approved");
        const order = createOrderFromQuote(quote);
        state.activeOrderId = order.id;
        saveState();
        addActivity(
          "Sales",
          `Built ${quote.id} (${getQuoteLines(quote).length} cable type(s), ${h.money(quote.total)}) and handed it to Operations as ${order.id}.`
        );
        handoffToOrderBoard();
      });
    }

    const saveDraft = document.querySelector("[data-save-draft]");
    if (saveDraft) {
      saveDraft.addEventListener("click", () => {
        const quote = buildQuoteFromDraft("Draft");
        state.activeQuoteId = quote.id;
        saveState();
        addActivity("Operations", `Saved draft quote ${quote.id} for ${h.customerName(quote.customerId)}.`);
        renderCurrentRoute();
      });
    }

    document.querySelectorAll("[data-send-quote-order]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const quote = state.quotes.find((item) => item.id === event.currentTarget.dataset.sendQuoteOrder);
        if (!quote) return;
        quote.status = "Approved";
        const order = createOrderFromQuote(quote);
        state.activeOrderId = order.id;
        addActivity("Sales", `Sent ${quote.id} to the order board as ${order.id}.`);
        handoffToOrderBoard();
      });
    });

    // Inline "+ New customer" — opens the shared add-customer form and selects
    // the new customer straight into this quote (no detour to Contacts).
    bindAddControls();
    bindAddCustomerForm((customer) => {
      state.lastQuoteInput.customerId = customer.id;
    });
  }

  function handoffToOrderBoard() {
    // The order now belongs to Operations. Roles that can't open the order board
    // (e.g. Sales) land on the dashboard, where the handoff is visible.
    window.location.hash = isAllowed("#/orders", state.role) ? "#/orders" : "#/dashboard";
  }

  function updateCostingState(event) {
    const key = event.target.dataset.costInput;
    const numeric = ["conductorSize", "lengthM", "metalRate", "overheadPerM", "marginPct"];
    state.lastQuoteInput[key] = numeric.includes(key) ? Number(event.target.value) : event.target.value;

    if (key === "material") {
      // Pull the matching MCX rate so pricing always tracks the index by default.
      state.lastQuoteInput.metalRate = MCX_RATES[state.lastQuoteInput.material] || state.lastQuoteInput.metalRate;
      saveState();
      renderCurrentRoute();
      return;
    }
    if (key === "customerId") {
      // Customer changes the live preview, so re-render the whole tab.
      saveState();
      renderCurrentRoute();
      return;
    }

    const result = h.calculateCableQuote(state.lastQuoteInput);
    document.getElementById("costing-results").outerHTML = costingResults(result, state.lastQuoteInput);
    const mcx = document.querySelector(".mcx-card");
    if (mcx) mcx.outerHTML = renderMcxCard();
    saveState();
  }

  function buildQuoteFromDraft(status) {
    const input = state.lastQuoteInput;
    let lines = state.quoteLines.slice();
    if (!lines.length) {
      lines = [buildLine(input)];
    }
    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const minMargin = Math.min(...lines.map((line) => line.marginPct));
    const id = `Q-DEMO-${String(nextNumber("Q-DEMO-", state.quotes)).padStart(3, "0")}`;
    const quote = {
      id,
      inquiryId: state.activeInquiryId || "demo-inquiry",
      customerId: input.customerId,
      lines,
      cableSpec: lines.length > 1 ? `${lines.length} cable types` : lines[0].cableSpec,
      material: lines[0].material,
      conductorSize: lines[0].conductorSize,
      lengthM: lines.reduce((sum, line) => sum + line.lengthM, 0),
      metalRate: lines[0].metalRate,
      overheadPerM: lines[0].overheadPerM,
      marginPct: minMargin,
      basePerM: lines[0].basePerM,
      total,
      status,
      validUntil: "2026-06-30",
      aiFlag:
        minMargin < 12
          ? "One or more lines are below the preferred margin threshold; owner review recommended."
          : "All lines are within margin policy and ready for approval."
    };
    state.quotes.unshift(quote);
    state.quoteLines = [];
    saveState();
    return quote;
  }

  function getQuoteLines(quote) {
    if (quote.lines && quote.lines.length) return quote.lines;
    return [
      {
        cableSpec: quote.cableSpec,
        material: quote.material,
        conductorSize: quote.conductorSize,
        lengthM: quote.lengthM,
        metalRate: quote.metalRate,
        overheadPerM: quote.overheadPerM,
        marginPct: quote.marginPct,
        basePerM: quote.basePerM || quote.total / quote.lengthM,
        lineTotal: quote.total
      }
    ];
  }

  function createOrderFromQuote(quote) {
    const existing = state.orders.find((order) => order.quoteId === quote.id);
    if (existing) return existing;
    const lines = getQuoteLines(quote);
    const primary = lines[0];
    const order = {
      id: `ORD-DEMO-${String(nextNumber("ORD-DEMO-", state.orders)).padStart(3, "0")}`,
      quoteId: quote.id,
      inquiryId: quote.inquiryId,
      customerId: quote.customerId,
      title:
        lines.length > 1
          ? `${h.customerName(quote.customerId)} multi-cable order (${lines.length} types)`
          : `${h.customerName(quote.customerId)} ${primary.conductorSize} sq mm cable`,
      stage: "Won",
      promisedDate: "2026-07-03",
      amount: quote.total,
      priority: quote.marginPct < 12 ? "High" : "Medium",
      owner: "Operations",
      completionPct: STAGE_PROGRESS.Won
    };
    state.orders.unshift(order);
    state.orderStages[order.id] = order.stage;

    const dispatch = {
      id: `DSP-DEMO-${String(nextNumber("DSP-DEMO-", state.dispatches)).padStart(3, "0")}`,
      orderId: order.id,
      transporter: "Pending allocation",
      vehicle: "Not assigned",
      checklist: [
        { label: "Drum marking verified", done: false },
        { label: "Test certificate attached", done: false },
        { label: "Packing list printed", done: false },
        { label: "Invoice ready", done: false },
        { label: "E-way bill generated", done: false }
      ]
    };
    state.dispatches.unshift(dispatch);
    state.dispatchChecks[dispatch.id] = dispatch.checklist.map((item) => item.done);

    state.accountingDocs.unshift({
      id: `DRAFT-DEMO-${String(nextNumber("DRAFT-DEMO-", state.accountingDocs)).padStart(3, "0")}`,
      orderId: order.id,
      customerId: order.customerId,
      amount: order.amount,
      dueDate: order.promisedDate,
      status: "Invoice draft blocked",
      syncStatus: "Missing dispatch data",
      risk: "Medium"
    });

    const totalLength = lines.reduce((sum, line) => sum + line.lengthM, 0);
    state.jobCards.unshift({
      id: `JC-DEMO-${String(nextNumber("JC-DEMO-", state.jobCards)).padStart(3, "0")}`,
      orderId: order.id,
      conductor: lines.length > 1 ? `Mixed: ${lines.map((line) => line.material).join(", ")}` : `${primary.material} stranded conductor`,
      insulation: "XLPE, natural",
      armour: "GI strip armour",
      sheath: "FR PVC black",
      drumPlan: totalLength > 1000 ? `${lines.length > 1 ? "Per cable type, " : ""}3 drums x ${Math.ceil(totalLength / 3)} m` : `1 drum x ${totalLength} m`,
      operatorNotes: "Demo order generated from approved quotation; confirm drum markings before dispatch.",
      qualityChecks: ["Conductor resistance", "Spark test", "Print legibility"]
    });

    // Hand off: a converted inquiry leaves the sales board and lives on the order board.
    const inquiry = state.inquiries.find((item) => item.id === quote.inquiryId);
    if (inquiry) {
      inquiry.status = "Won";
      inquiry.orderId = order.id;
      inquiry.nextAction = `Converted to order ${order.id}`;
    }
    if (state.activeInquiryId === quote.inquiryId) {
      state.activeInquiryId = null;
    }

    saveState();
    return order;
  }

  /* ----------------------------- Orders ----------------------------- */

  function renderOrders() {
    return `
      <div class="stack">
        ${roleNote()}
        ${workflowGuide("order", "Move each order through production; completing its dispatch checklist unlocks invoicing.")}
        <section class="kanban">
          ${STAGES
            .map((stage) => {
              const orders = state.orders.filter((order) => state.orderStages[order.id] === stage);
              return `
                <div class="kanban-column" data-order-drop="${stage}">
                  <h3><span class="col-name">${stage}</span><span class="col-count">${orders.length}</span></h3>
                  ${orders.map(renderOrderCard).join("") || `<div class="empty">Drop orders here</div>`}
                </div>
              `;
            })
            .join("")}
        </section>
      </div>
      ${renderOrderDetailDrawer()}
    `;
  }

  // Detail drawer shown when an order card is clicked — surfaces the spec,
  // customer payment terms, EMD / bank-guarantee terms, and date reminders.
  function renderOrderDetailDrawer() {
    if (!detailOrderId) return "";
    const order = state.orders.find((item) => item.id === detailOrderId);
    if (!order) return "";
    const customer = data.customers.find((item) => item.id === order.customerId);
    const quote = state.quotes.find((item) => item.id === order.quoteId);
    const stage = state.orderStages[order.id] || order.stage;
    const compliance = state.complianceItems.filter((item) => item.customerId === order.customerId);
    const dispatch = state.dispatches.find((item) => item.orderId === order.id);

    const specRows = quote
      ? `
        <div class="drawer-row"><span>Cable spec</span><span>${quote.cableSpec || "—"}</span></div>
        <div class="drawer-row"><span>Conductor</span><span>${quote.conductorSize} sq mm ${quote.material}</span></div>
        <div class="drawer-row"><span>Length</span><span>${(quote.lengthM || 0).toLocaleString("en-IN")} m</span></div>
      `
      : `<div class="drawer-row"><span>Spec</span><span class="muted">Linked quote not on file</span></div>`;

    const complianceHtml = compliance.length
      ? compliance
          .map(
            (item) => `
              <div class="drawer-compliance">
                <div class="dc-head">
                  <strong>${item.type}</strong>
                  <span class="badge ${item.risk}">${item.risk} risk</span>
                </div>
                ${item.mode ? `<div class="drawer-row"><span>Instrument</span><span>${item.mode}</span></div>` : ""}
                ${item.referenceNumber ? `<div class="drawer-row"><span>Reference no.</span><span class="mono">${item.referenceNumber}</span></div>` : ""}
                ${item.issuingBank ? `<div class="drawer-row"><span>Issuing bank</span><span>${item.issuingBank}</span></div>` : ""}
                <div class="drawer-row"><span>Amount</span><span>${item.amount ? h.money(item.amount) : "—"}</span></div>
                <div class="drawer-row"><span>Due</span><span>${h.shortDate(item.dueDate)}</span></div>
                ${item.expiryDate ? `<div class="drawer-row"><span>Validity / return</span><span>${h.shortDate(item.expiryDate)}</span></div>` : ""}
                <div class="drawer-row"><span>Status</span><span>${item.status}</span></div>
              </div>
            `
          )
          .join("")
      : `<p class="muted" style="font-size:13px;margin:0">No EMD or bank guarantee on file for this customer.</p>`;

    const reminderRows = compliance
      .filter((item) => item.status !== "Complete")
      .map((item) => `<div class="drawer-row"><span>${item.type} due</span><span>${h.shortDate(item.dueDate)}</span></div>`)
      .join("");

    return `
      <div class="drawer-scrim" data-close-detail></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="Details for ${order.id}">
        <div class="drawer-head">
          <div>
            <p class="eyebrow">Order ${order.id}</p>
            <h2>${order.title}</h2>
          </div>
          <button class="icon-button" type="button" data-close-detail aria-label="Close details">✕</button>
        </div>
        <div style="margin:0 0 4px"><span class="badge">${stage}</span> <span class="badge ${order.priority}">${order.priority} priority</span></div>

        <section class="drawer-section">
          <h3>Cable specification</h3>
          ${specRows}
        </section>

        <section class="drawer-section">
          <h3>Customer &amp; payment terms</h3>
          <div class="drawer-row"><span>Customer</span><span>${customer ? customer.name : h.customerName(order.customerId)}</span></div>
          ${customer
            ? `<div class="drawer-row"><span>Contact</span><span>${customer.contact}${customer.phone ? " · " + customer.phone : ""}</span></div>
               <div class="drawer-row"><span>Payment terms</span><span>${customer.paymentTerms}</span></div>
               <div class="drawer-row"><span>Credit limit</span><span>${h.money(customer.creditLimit || 0)}</span></div>
               <div class="drawer-row"><span>GST</span><span class="mono">${customer.gst || "—"}</span></div>`
            : ""}
          <div class="drawer-row"><span>Order value</span><span>${h.money(order.amount)}</span></div>
        </section>

        <section class="drawer-section">
          <h3>EMD &amp; bank guarantees</h3>
          ${complianceHtml}
        </section>

        <section class="drawer-section">
          <h3>Reminders</h3>
          <div class="drawer-row"><span>Promised dispatch</span><span>${h.shortDate(order.promisedDate)}</span></div>
          ${dispatch ? `<div class="drawer-row"><span>Dispatch readiness</span><span>${state.dispatchChecks[dispatch.id].filter(Boolean).length}/${state.dispatchChecks[dispatch.id].length} checks done</span></div>` : ""}
          ${reminderRows}
        </section>

        <div class="action-row">
          <a class="ghost-button" href="#/dispatch" data-close-detail>Open dispatch checklist →</a>
        </div>
      </aside>
    `;
  }

  function renderOrderCard(order) {
    const dispatch = state.dispatches.find((item) => item.orderId === order.id);
    let dispatchLine = "";
    if (dispatch) {
      const checks = state.dispatchChecks[dispatch.id];
      const done = checks.filter(Boolean).length;
      const ready = done === checks.length;
      dispatchLine = `<a class="order-dispatch ${ready ? "ready" : ""}" href="#/dispatch">Dispatch ${done}/${checks.length} ${ready ? "ready ✓" : "→"}</a>`;
    }
    return `
      <article class="order-card" draggable="true" data-order-id="${order.id}" title="Click for details · drag to change stage">
        <div>
          <strong class="card-title">${order.title}</strong>
          <p class="card-sub muted">${h.customerName(order.customerId)} · <span class="nowrap">${order.id}</span></p>
          ${order.inquiryId && order.inquiryId.startsWith("inq") ? `<p class="card-note muted">From sales inquiry ${order.inquiryId}</p>` : ""}
        </div>
        <div class="progress" role="progressbar" aria-label="${order.id} completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${order.completionPct}">
          <span style="width: ${order.completionPct}%"></span>
        </div>
        <div class="order-meta">
          <span class="prio prio-${order.priority.toLowerCase()}">${order.priority}</span>
          <span class="card-amount">${h.money(order.amount)}</span>
        </div>
        ${dispatchLine}
        <label class="card-select-label" for="stage-${order.id}">Move to stage</label>
        <select id="stage-${order.id}" name="stage-${order.id}" autocomplete="off" data-order-stage="${order.id}" aria-label="Move ${order.id}">
          ${STAGES
            .map((stage) => `<option value="${stage}" ${state.orderStages[order.id] === stage ? "selected" : ""}>${stage}</option>`)
            .join("")}
        </select>
      </article>
    `;
  }

  // Shared by the dropdown (fallback) and drag-and-drop.
  function moveOrderToStage(orderId, stage) {
    if (!STAGES.includes(stage)) return;
    if (state.orderStages[orderId] === stage) return;
    const order = state.orders.find((item) => item.id === orderId);
    state.orderStages[orderId] = stage;
    if (order) {
      order.stage = stage;
      order.completionPct = STAGE_PROGRESS[stage] || order.completionPct;
      state.activeOrderId = order.id;
      if (stage === "Invoiced") {
        markOrderInvoiceReady(order);
      }
      addActivity("Operations", `Moved ${order.id} to ${stage}.`);
    }
    saveState();
    renderCurrentRoute();
  }

  function bindOrderBoard() {
    document.querySelectorAll("[data-order-stage]").forEach((select) => {
      select.addEventListener("change", (event) => {
        moveOrderToStage(event.target.dataset.orderStage, event.target.value);
      });
    });
    bindKanbanDnD("order");

    // Click a card (not a control) to open its detail drawer. A real drag
    // suppresses the click, so this never fires mid-drag.
    document.querySelectorAll("[data-order-id]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("select, button, a, input, label, textarea")) return;
        detailOrderId = card.dataset.orderId;
        renderCurrentRoute();
      });
    });

    document.querySelectorAll("[data-close-detail]").forEach((el) => {
      el.addEventListener("click", () => {
        detailOrderId = null;
        // Plain controls (X, scrim) need an explicit re-render; the dispatch
        // link navigates and re-renders on its own.
        if (!el.getAttribute("href")) renderCurrentRoute();
      });
    });
  }

  // Native HTML5 drag-and-drop for both the order board and the sales board.
  // Cards carry data-order-id / data-inquiry-id; columns carry the matching
  // data-order-drop / data-inquiry-drop with the destination stage.
  function bindKanbanDnD(kind) {
    const cardSel = kind === "order" ? "[data-order-id]" : "[data-inquiry-id]";
    const dropSel = kind === "order" ? "[data-order-drop]" : "[data-inquiry-drop]";

    document.querySelectorAll(cardSel).forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        // Don't start a drag when the gesture begins on an interactive control.
        if (event.target.closest("select, button, a, input, label, textarea")) {
          event.preventDefault();
          return;
        }
        const id = card.dataset.orderId || card.dataset.inquiryId;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        document
          .querySelectorAll(".kanban-column.drag-over")
          .forEach((col) => col.classList.remove("drag-over"));
      });
    });

    document.querySelectorAll(dropSel).forEach((col) => {
      col.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        col.classList.add("drag-over");
      });
      col.addEventListener("dragleave", (event) => {
        // Ignore leaves that bubble from child elements still inside the column.
        if (col.contains(event.relatedTarget)) return;
        col.classList.remove("drag-over");
      });
      col.addEventListener("drop", (event) => {
        event.preventDefault();
        col.classList.remove("drag-over");
        const id = event.dataTransfer.getData("text/plain");
        if (!id) return;
        if (kind === "order") moveOrderToStage(id, col.dataset.orderDrop);
        else moveInquiryToStage(id, col.dataset.inquiryDrop);
      });
    });
  }

  function markOrderInvoiceReady(order) {
    const doc = state.accountingDocs.find((item) => item.orderId === order.id);
    if (doc) {
      doc.status = doc.syncStatus.startsWith("Synced") ? "Payment pending" : "Ready to sync";
      doc.syncStatus = doc.syncStatus.startsWith("Synced") ? doc.syncStatus : "Ready to sync";
      doc.risk = "Low";
    }
  }

  /* ----------------------------- Operator card (configurable) ----------------------------- */

  function activeJobOrder() {
    return state.orders.find((item) => item.id === state.activeOrderId) || state.orders[0];
  }

  function ensureJobCard(orderId) {
    let job = state.jobCards.find((item) => item.orderId === orderId);
    if (!job) {
      const seed = data.jobCards.find((item) => item.orderId === orderId);
      job = seed
        ? clone(seed)
        : {
            id: `JC-DEMO-${String(nextNumber("JC-DEMO-", state.jobCards)).padStart(3, "0")}`,
            orderId,
            conductor: "",
            insulation: "",
            armour: "",
            sheath: "",
            drumPlan: "",
            operatorNotes: "",
            qualityChecks: []
          };
      state.jobCards.unshift(job);
      saveState();
    }
    return job;
  }

  function jcInput(name, label, value) {
    return `
      <div class="field">
        <label for="jc-${name}">${label}</label>
        <input id="jc-${name}" data-jc-input="${name}" value="${value || ""}" autocomplete="off">
      </div>
    `;
  }

  function renderJobCard() {
    const order = activeJobOrder();
    const job = ensureJobCard(order.id);
    return `
      <div class="stack">
        ${workflowGuide("order", "The operator card is part of production. Configure it, then move the order to dispatch.")}
        <div class="page-grid">
          <section class="job-card">
            <p class="eyebrow">Operator View — configurable</p>
          <div class="field jc-order-field">
            <label for="jc-order">Order</label>
            <select id="jc-order" data-jobcard-order>
              ${state.orders
                .map((item) => `<option value="${item.id}" ${item.id === order.id ? "selected" : ""}>${item.id} — ${item.title}</option>`)
                .join("")}
            </select>
          </div>
          <h2 class="section-offset">${job.id} / ${order.title}</h2>
          <p class="muted">${h.customerName(order.customerId)} / Promise date ${h.shortDate(order.promisedDate)} / <span class="badge medium">${state.orderStages[order.id]}</span></p>

          <p class="step-label">Card specification</p>
          <div class="form-grid">
            ${jcInput("conductor", "Conductor", job.conductor)}
            ${jcInput("insulation", "Insulation", job.insulation)}
            ${jcInput("armour", "Armour", job.armour)}
            ${jcInput("sheath", "Sheath", job.sheath)}
            ${jcInput("drumPlan", "Drum plan", job.drumPlan)}
          </div>
          <div class="field section-offset">
            <label for="jc-operatorNotes">Operator notes</label>
            <textarea id="jc-operatorNotes" data-jc-input="operatorNotes" rows="3">${job.operatorNotes || ""}</textarea>
          </div>

          <p class="step-label">Quality checks (required before dispatch)</p>
          <div class="qc-list">
            ${job.qualityChecks.length
              ? job.qualityChecks
                  .map(
                    (check, index) => `
                      <div class="qc-row">
                        <input data-qc-index="${index}" value="${check}" aria-label="Quality check ${index + 1}">
                        <button class="ghost-button" type="button" data-remove-qc="${index}">Remove</button>
                      </div>
                    `
                  )
                  .join("")
              : `<p class="muted">No checks yet — add the first one below.</p>`}
          </div>
          <div class="qc-add">
            <input id="new-qc" placeholder="e.g. Insulation thickness" aria-label="New quality check">
            <button class="ghost-button" type="button" data-add-qc>+ Add check</button>
          </div>

          <div class="action-row">
            <button class="primary-button" type="button" data-save-jc>Save operator card</button>
          </div>
        </section>
        <aside class="stack">
          <section class="card">
            <h2>Operator handoff</h2>
            <p class="muted">Configure the card for this order, then print a shop-floor copy or hand it to the operator. Switching orders loads that card.</p>
            <button class="ghost-button" type="button" data-print-card>Print this job card</button>
          </section>
        </aside>
        </div>
      </div>
    `;
  }

  function saveJobCardForm(job) {
    document.querySelectorAll("[data-jc-input]").forEach((el) => {
      job[el.dataset.jcInput] = el.value;
    });
    document.querySelectorAll("[data-qc-index]").forEach((el) => {
      job.qualityChecks[Number(el.dataset.qcIndex)] = el.value;
    });
  }

  function bindJobCard() {
    const orderSelect = document.querySelector("[data-jobcard-order]");
    if (orderSelect) {
      orderSelect.addEventListener("change", (event) => {
        state.activeOrderId = event.target.value;
        saveState();
        renderCurrentRoute();
      });
    }

    const save = document.querySelector("[data-save-jc]");
    if (save) {
      save.addEventListener("click", () => {
        const job = ensureJobCard(activeJobOrder().id);
        saveJobCardForm(job);
        saveState();
        addActivity("Operations", `Updated operator card ${job.id}.`);
        renderCurrentRoute();
      });
    }

    const addQc = document.querySelector("[data-add-qc]");
    if (addQc) {
      addQc.addEventListener("click", () => {
        const job = ensureJobCard(activeJobOrder().id);
        saveJobCardForm(job);
        const value = (document.getElementById("new-qc").value || "").trim();
        if (value) job.qualityChecks.push(value);
        saveState();
        renderCurrentRoute();
      });
    }

    document.querySelectorAll("[data-remove-qc]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const job = ensureJobCard(activeJobOrder().id);
        saveJobCardForm(job);
        job.qualityChecks.splice(Number(event.currentTarget.dataset.removeQc), 1);
        saveState();
        renderCurrentRoute();
      });
    });

    const printCard = document.querySelector("[data-print-card]");
    if (printCard) {
      printCard.addEventListener("click", () => window.print());
    }
  }

  /* ----------------------------- Dispatch (connected to orders) ----------------------------- */

  function renderDispatch() {
    return `
      <div class="stack">
        ${workflowGuide("dispatch", "Tick every checklist item to mark the order ready for dispatch and hand off to accounts.")}
        <div class="dispatch-grid">
          ${state.dispatches.map(renderDispatchCard).join("")}
        </div>
      </div>
    `;
  }

  function renderDispatchCard(dispatch) {
    const order = state.orders.find((item) => item.id === dispatch.orderId);
    const checks = state.dispatchChecks[dispatch.id];
    const done = checks.filter(Boolean).length;
    const pct = Math.round((done / checks.length) * 100);
    const stage = state.orderStages[order.id];
    return `
      <section class="card dispatch-card">
        <div class="dispatch-head">
          <div>
            <p class="eyebrow">Dispatch for order</p>
            <h2><a href="#/orders" class="order-link">${order.id}</a> · ${order.title}</h2>
            <p class="muted">${h.customerName(order.customerId)} · ${dispatch.transporter} · ${dispatch.vehicle}</p>
          </div>
          <div class="dispatch-head-meta">
            <span class="badge ${stage.replaceAll(" ", "")}">${stage}</span>
            <span class="muted">${h.money(order.amount)}</span>
          </div>
        </div>
        <div class="dispatch-progress">
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
          <span class="muted">${done}/${checks.length} ready</span>
        </div>
        <div class="checklist grid">
          ${dispatch.checklist
            .map(
              (item, index) => `
                <div class="check-row">
                  <label>
                    <input type="checkbox" name="${dispatch.id}-${index}" data-dispatch="${dispatch.id}" data-check-index="${index}" ${checks[index] ? "checked" : ""}>
                    ${item.label}
                  </label>
                  <span class="badge ${checks[index] ? "Complete" : "medium"}">${checks[index] ? "Done" : "Open"}</span>
                </div>
              `
            )
            .join("")}
        </div>
        <p class="dispatch-foot muted">Completing every item moves <span class="mono">${order.id}</span> to “Ready for Dispatch” and flags its invoice as ready. <a href="#/orders">View on order board →</a></p>
      </section>
    `;
  }

  function bindDispatch() {
    document.querySelectorAll("[data-dispatch]").forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const dispatchId = event.target.dataset.dispatch;
        const index = Number(event.target.dataset.checkIndex);
        state.dispatchChecks[dispatchId][index] = event.target.checked;
        const dispatch = state.dispatches.find((item) => item.id === dispatchId);
        const order = dispatch ? state.orders.find((item) => item.id === dispatch.orderId) : null;
        if (dispatch) {
          dispatch.checklist[index].done = event.target.checked;
        }
        if (dispatch && state.dispatchChecks[dispatchId].every(Boolean) && order) {
          order.stage = "Ready for Dispatch";
          order.completionPct = STAGE_PROGRESS["Ready for Dispatch"];
          state.orderStages[order.id] = "Ready for Dispatch";
          markOrderInvoiceReady(order);
          addActivity("Operations", `Completed dispatch checklist for ${order.id}; invoice is ready to sync.`);
        } else if (dispatch && order) {
          addActivity("Operations", `Updated ${dispatch.id} checklist for ${order.id}.`);
        }
        saveState();
        renderCurrentRoute();
      });
    });
  }

  /* ----------------------------- Accounting (cleaner layout) ----------------------------- */

  function renderAccounting() {
    return `
      <div class="stack">
        ${workflowGuide("invoice", "Sync ready invoices to Tally and track receivables.")}
        <section class="table-card invoice-table">
          <div class="table-header">
            <div>
              <h2>Invoice Readiness &amp; Receivables</h2>
              <p>One row per order — documents, payment holds, and Tally sync.</p>
            </div>
            <span class="badge medium">Mock sync</span>
          </div>
          <table>
            <thead>
              <tr><th>Document</th><th>Customer</th><th>Amount</th><th>Due</th><th>Risk</th><th>Sync status</th><th>Action</th></tr>
            </thead>
            <tbody>
              ${state.accountingDocs
                .map(
                  (doc) => `
                    <tr>
                      <td>
                        <div class="doc-cell">
                          <span class="mono doc-id">${doc.id}</span>
                          <span class="doc-status">${doc.status}</span>
                        </div>
                      </td>
                      <td>${h.customerName(doc.customerId)}</td>
                      <td class="mono">${h.money(doc.amount)}</td>
                      <td>${h.shortDate(doc.dueDate)}</td>
                      <td><span class="badge ${doc.risk}">${doc.risk}</span></td>
                      <td><span class="badge ${doc.syncStatus.startsWith("Synced") ? "Synced" : "medium"}">${doc.syncStatus}</span></td>
                      <td><button class="ghost-button" type="button" data-sync-doc="${doc.id}">${doc.syncStatus.startsWith("Synced") ? "Re-sync" : "Sync"}</button></td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
      </div>
    `;
  }

  function bindAccounting() {
    document.querySelectorAll("[data-sync-doc]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const doc = state.accountingDocs.find((item) => item.id === event.currentTarget.dataset.syncDoc);
        if (!doc) return;
        doc.syncStatus = "Synced to Tally";
        doc.status = "Payment pending";
        doc.risk = "Low";
        const order = state.orders.find((item) => item.id === doc.orderId);
        if (order) {
          order.stage = "Invoiced";
          order.completionPct = STAGE_PROGRESS.Invoiced;
          state.orderStages[order.id] = "Invoiced";
        }
        addActivity("Accounts", `Synced ${doc.id} to Tally and marked payment follow-up.`);
        saveState();
        renderCurrentRoute();
      });
    });
  }

  /* ----------------------------- Sales board ----------------------------- */

  function renderSales() {
    const stageOf = (status) => (SALES_STAGES.includes(status) ? status : "New");
    // Converted inquiries have become orders and now live on the order board.
    const active = state.inquiries.filter((item) => !item.orderId);
    const convertedCount = state.inquiries.length - active.length;
    const convertedNote = convertedCount
      ? `<a class="badge" href="#/orders">${convertedCount} converted to orders →</a>`
      : "";
    return `
      <div class="stack">
        ${roleNote()}
        ${workflowGuide("inquiry", "Qualify the inquiry, then build a quote for it — that starts the handoff to Operations.")}
        <section class="board-toolbar">
          <div>
            <h2>Sales Board</h2>
            <p class="muted">Work each inquiry across stages. Build a quote to convert it into an order.</p>
          </div>
          <div class="toolbar-actions">
            ${convertedNote}
            <button class="primary-button" type="button" data-open-add="addInquiry">+ New inquiry</button>
          </div>
        </section>
        ${ui.addInquiry ? addInquiryForm() : ""}
        <section class="kanban sales-kanban">
          ${SALES_STAGES
            .map((stage) => {
              const items = active.filter((item) => stageOf(item.status) === stage);
              return `
                <div class="kanban-column" data-inquiry-drop="${stage}">
                  <h3><span class="col-name">${stage}</span><span class="col-count">${items.length}</span></h3>
                  ${items.map(renderInquiryCard).join("") || `<div class="empty">Drop inquiries here</div>`}
                </div>
              `;
            })
            .join("")}
        </section>
      </div>
    `;
  }

  function renderInquiryCard(item) {
    const canQuote = item.status !== "Lost";
    const isWon = item.status === "Won";
    return `
      <article class="order-card ${isWon ? "won" : ""}" draggable="true" data-inquiry-id="${item.id}">
        <div>
          <strong class="card-title">${item.requirement}</strong>
          <p class="card-sub muted">${h.customerName(item.customerId)} · <span class="nowrap">${item.id}</span></p>
        </div>
        <div class="order-meta">
          <span class="card-amount">${h.money(item.value)}</span>
          <span class="badge">${item.source || "Inquiry"}</span>
        </div>
        <p class="card-note muted">${isWon ? "Won — build the quote to convert it into an order." : "Next: " + item.nextAction}</p>
        ${canQuote ? `<button class="primary-button block-button" type="button" data-quote-inquiry="${item.id}">${isWon ? "Build quote & convert →" : "Build quote →"}</button>` : ""}
        <label class="card-select-label" for="inq-stage-${item.id}">Move to stage</label>
        <select id="inq-stage-${item.id}" autocomplete="off" data-inquiry-status="${item.id}" aria-label="Move ${item.id}">
          ${SALES_STAGES.map((stage) => `<option value="${stage}" ${item.status === stage ? "selected" : ""}>${stage}</option>`).join("")}
        </select>
      </article>
    `;
  }

  function addInquiryForm() {
    return addFormShell(
      "addInquiry",
      "New inquiry",
      `
        ${fSelect("customerId", "Customer", data.customers.map((customer) => [customer.id, customer.name]), state.lastQuoteInput.customerId)}
        ${fSelect("cableType", "Cable type", CABLE_TYPES.map((t) => [t, t]), CABLE_TYPES[0])}
        ${fInput("requirement", "Requirement / notes", "text", "", 'placeholder="e.g. 3C x 95 sq mm Al armoured"')}
        ${fInput("quantity", "Quantity (m)", "number", "", 'min="0" step="100"')}
        ${fInput("value", "Estimated value (₹)", "number", "", 'min="0" step="1000"')}
        ${fInput("dueDate", "Follow-up by", "date", "2026-07-01")}
      `,
      "Add inquiry"
    );
  }

  // Shared by the dropdown (fallback) and drag-and-drop on the sales board.
  function moveInquiryToStage(inquiryId, stage) {
    if (!SALES_STAGES.includes(stage)) return;
    const inquiry = state.inquiries.find((item) => item.id === inquiryId);
    if (!inquiry || inquiry.status === stage) return;
    inquiry.status = stage;
    inquiry.nextAction =
      stage === "Won"
        ? "Convert to production order"
        : stage === "Lost"
          ? "Record reason and nurture later"
          : "Follow up with customer";
    addActivity("Sales", `Moved ${inquiry.id} to ${stage}.`);
    saveState();
    renderCurrentRoute();
  }

  function bindSales() {
    bindAddControls();

    document.querySelectorAll("[data-quote-inquiry]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const inquiry = state.inquiries.find((item) => item.id === event.currentTarget.dataset.quoteInquiry);
        if (!inquiry) return;
        // Carry the inquiry's customer into the quote builder and link them.
        state.activeInquiryId = inquiry.id;
        state.lastQuoteInput.customerId = inquiry.customerId;
        state.quoteLines = [];
        if (inquiry.status === "New") {
          inquiry.status = "Quoting";
          inquiry.nextAction = "Finish costing and send the quote";
        }
        saveState();
        addActivity("Sales", `Started a quote for inquiry ${inquiry.id} (${h.customerName(inquiry.customerId)}).`);
        window.location.hash = "#/quote";
      });
    });

    document.querySelectorAll("[data-inquiry-status]").forEach((select) => {
      select.addEventListener("change", (event) => {
        moveInquiryToStage(event.currentTarget.dataset.inquiryStatus, event.currentTarget.value);
      });
    });
    bindKanbanDnD("inquiry");

    const form = document.querySelector('[data-add-form="addInquiry"]');
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        const inquiry = {
          id: `inq-DEMO-${String(nextNumber("inq-DEMO-", state.inquiries)).padStart(3, "0")}`,
          customerId: fd.get("customerId"),
          cableType: (fd.get("cableType") || CABLE_TYPES[0]).toString(),
          requirement: (fd.get("requirement") || fd.get("cableType") || "New requirement").toString(),
          quantity: Number(fd.get("quantity")) || 0,
          source: "Manual entry",
          value: Number(fd.get("value")) || 0,
          dueDate: fd.get("dueDate") || "2026-07-01",
          status: "New",
          owner: "Sales",
          nextAction: "Qualify requirement and prepare costing"
        };
        state.inquiries.unshift(inquiry);
        ui.addInquiry = false;
        addActivity("Sales", `Logged new inquiry ${inquiry.id} for ${h.customerName(inquiry.customerId)}.`);
        saveState();
        renderCurrentRoute();
      });
    }
  }

  /* ----------------------------- Contacts (with onboarding) ----------------------------- */

  function renderContacts() {
    return `
      <div class="stack">
        <section class="board-toolbar">
          <div>
            <h2>Customer Directory</h2>
            <p class="muted">Structured customer context for sales, accounts, and repeat operations.</p>
          </div>
          <button class="primary-button" type="button" data-open-add="addCustomer">+ Add customer</button>
        </section>
        ${ui.addCustomer ? addCustomerForm() : ""}
        <section class="table-card">
          <table>
            <thead><tr><th>Customer</th><th>Contact</th><th>Segment</th><th>City</th><th>Terms</th><th>Credit limit</th></tr></thead>
            <tbody>
              ${data.customers
                .map(
                  (customer) => `
                    <tr>
                      <td><strong>${customer.name}</strong><br><span class="mono muted">${customer.gst || "GST pending"}</span></td>
                      <td>${customer.contact}<br><span class="muted">${customer.phone || ""}</span></td>
                      <td>${customer.segment || "—"}</td>
                      <td>${customer.city || "—"}</td>
                      <td>${customer.paymentTerms || "—"}</td>
                      <td>${h.money(customer.creditLimit || 0)}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
      </div>
    `;
  }

  function addCustomerForm() {
    return addFormShell(
      "addCustomer",
      "Add customer",
      `
        ${fInput("name", "Company name", "text", "", 'placeholder="Company Pvt Ltd"')}
        ${fInput("contact", "Contact person", "text", "")}
        ${fInput("phone", "Phone", "text", "", 'placeholder="+91 ..."')}
        ${fInput("email", "Email", "email", "")}
        ${fInput("segment", "Segment", "text", "", 'placeholder="EPC contractor"')}
        ${fInput("city", "City", "text", "")}
        ${fInput("paymentTerms", "Payment terms", "text", "", 'placeholder="30 days from invoice"')}
        ${fInput("creditLimit", "Credit limit (₹)", "number", "", 'min="0" step="50000"')}
        ${fInput("gst", "GST number", "text", "")}
      `,
      "Add customer"
    );
  }

  // Create a customer from the shared add-customer form (used by Contacts and
  // the inline "+ New customer" action in the Quote Builder).
  function createCustomerFromForm(form) {
    const fd = new FormData(form);
    const name = (fd.get("name") || "").toString().trim();
    if (!name) return null;
    const customer = {
      id: `cust-demo-${nextNumber("cust-demo-", data.customers)}`,
      name,
      segment: (fd.get("segment") || "—").toString(),
      contact: (fd.get("contact") || "—").toString(),
      phone: (fd.get("phone") || "").toString(),
      email: (fd.get("email") || "").toString(),
      city: (fd.get("city") || "—").toString(),
      gst: (fd.get("gst") || "GST pending").toString(),
      paymentTerms: (fd.get("paymentTerms") || "—").toString(),
      creditLimit: Number(fd.get("creditLimit")) || 0
    };
    data.customers.push(customer);
    state.extraCustomers.push(customer);
    addActivity("Sales", `Onboarded new customer ${customer.name}.`);
    return customer;
  }

  function bindAddCustomerForm(onCreated) {
    const form = document.querySelector('[data-add-form="addCustomer"]');
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const customer = createCustomerFromForm(form);
      if (!customer) return;
      ui.addCustomer = false;
      if (onCreated) onCreated(customer);
      saveState();
      renderCurrentRoute();
    });
  }

  function bindContacts() {
    bindAddControls();
    bindAddCustomerForm();
  }

  /* ----------------------------- Compliance (with onboarding) ----------------------------- */

  function renderCompliance() {
    return `
      <div class="stack">
        <section class="board-toolbar">
          <div>
            <h2>EMD &amp; Bank Guarantee Tracker</h2>
            <p class="muted">Compliance deadlines that usually live in calls, email, and spreadsheets.</p>
          </div>
          <button class="primary-button" type="button" data-open-add="addCompliance">+ Add item</button>
        </section>
        ${ui.addCompliance ? addComplianceForm() : ""}
        <div class="page-grid">
          <section class="table-card">
            <table>
              <thead><tr><th>Item</th><th>Customer</th><th>Type</th><th>Amount</th><th>Due</th><th>Status</th><th>Risk</th><th>Action</th></tr></thead>
              <tbody>
                ${state.complianceItems
                  .map(
                    (item) => `
                      <tr>
                        <td class="mono">${item.id}</td>
                        <td>${h.customerName(item.customerId)}</td>
                        <td>${item.type}</td>
                        <td><span class="mono">${item.amount ? h.money(item.amount) : "Not applicable"}</span></td>
                        <td>${h.shortDate(item.dueDate)} <span class="muted">(${h.daysUntil(item.dueDate)}d)</span></td>
                        <td>${item.status}</td>
                        <td><span class="badge ${item.risk}">${item.risk}</span></td>
                        <td>
                          <select name="compliance-${item.id}" autocomplete="off" data-compliance-status="${item.id}" aria-label="Update ${item.id}">
                            ${["Needs approval", "Draft requested", "Submitted", "Complete", "Expired"]
                              .map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`)
                              .join("")}
                          </select>
                        </td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </section>
          <aside class="stack">
            <section class="card">
              <h2>Suggested Controls</h2>
              <p class="muted">Future automations can draft reminders, flag expiry risk, and attach tender documents to customer records.</p>
            </section>
            ${renderActivity()}
          </aside>
        </div>
      </div>
    `;
  }

  function addComplianceForm() {
    return addFormShell(
      "addCompliance",
      "Add compliance item",
      `
        ${fSelect("type", "Type", [["EMD", "EMD"], ["Bank guarantee", "Bank guarantee"], ["Tender document", "Tender document"]], "EMD")}
        ${fSelect("customerId", "Customer", data.customers.map((customer) => [customer.id, customer.name]), state.lastQuoteInput.customerId)}
        ${fSelect("mode", "Instrument / mode", EMD_MODES.map((m) => [m, m]), EMD_MODES[0])}
        ${fInput("referenceNumber", "Reference / instrument no.", "text", "", 'placeholder="DD/BG/UTR number"')}
        ${fInput("issuingBank", "Issuing bank", "text", "", 'placeholder="e.g. SBI Main Branch, Mumbai"')}
        ${fInput("amount", "Amount (₹, 0 if N/A)", "number", "", 'min="0" step="1000"')}
        ${fInput("dueDate", "Due date", "date", "2026-07-01")}
        ${fInput("expiryDate", "Validity / return date", "date", "")}
        ${fSelect("status", "Status", [["Needs approval", "Needs approval"], ["Draft requested", "Draft requested"], ["Submitted", "Submitted"], ["Complete", "Complete"]], "Needs approval")}
      `,
      "Add item"
    );
  }

  function complianceRisk(status) {
    if (status === "Complete" || status === "Submitted") return "Low";
    if (status === "Expired") return "High";
    return "Medium";
  }

  function bindCompliance() {
    bindAddControls();

    document.querySelectorAll("[data-compliance-status]").forEach((select) => {
      select.addEventListener("change", (event) => {
        const item = state.complianceItems.find((entry) => entry.id === event.currentTarget.dataset.complianceStatus);
        if (!item) return;
        item.status = event.currentTarget.value;
        item.risk = complianceRisk(item.status);
        addActivity("Sales", `Updated ${item.id} ${item.type} status to ${item.status}.`);
        saveState();
        renderCurrentRoute();
      });
    });

    const form = document.querySelector('[data-add-form="addCompliance"]');
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        const status = (fd.get("status") || "Needs approval").toString();
        const item = {
          id: `CMP-DEMO-${String(nextNumber("CMP-DEMO-", state.complianceItems)).padStart(3, "0")}`,
          type: (fd.get("type") || "EMD").toString(),
          customerId: fd.get("customerId"),
          mode: (fd.get("mode") || "").toString(),
          referenceNumber: (fd.get("referenceNumber") || "").toString(),
          issuingBank: (fd.get("issuingBank") || "").toString(),
          amount: Number(fd.get("amount")) || 0,
          dueDate: fd.get("dueDate") || "2026-07-01",
          expiryDate: (fd.get("expiryDate") || "").toString(),
          status,
          risk: complianceRisk(status)
        };
        state.complianceItems.unshift(item);
        ui.addCompliance = false;
        addActivity("Sales", `Added ${item.type} item ${item.id} for ${h.customerName(item.customerId)}.`);
        saveState();
        renderCurrentRoute();
      });
    }
  }

  init();
})();
