(function () {
  const today = new Date("2026-06-23T09:00:00+05:30");

  const customers = [
    {
      id: "cust-arvind",
      name: "Arvind EPC Projects",
      segment: "EPC contractor",
      contact: "Nisha Rao",
      phone: "+91 98765 10021",
      email: "nisha.rao@arvindepc.example",
      city: "Bengaluru",
      gst: "29AABCA9911K1Z2",
      paymentTerms: "30 days from invoice",
      creditLimit: 4200000
    },
    {
      id: "cust-vardhan",
      name: "Vardhan Infra Works",
      segment: "Civil contractor",
      contact: "Manoj Patil",
      phone: "+91 98220 44518",
      email: "manoj@vardhaninfra.example",
      city: "Pune",
      gst: "27AAECV4318H1Z9",
      paymentTerms: "50% advance, balance before dispatch",
      creditLimit: 2500000
    },
    {
      id: "cust-suryanet",
      name: "Suryanet Solar",
      segment: "Solar installer",
      contact: "Farah Khan",
      phone: "+91 99870 81132",
      email: "farah@suryanet.example",
      city: "Hyderabad",
      gst: "36AALCS8720R1Z6",
      paymentTerms: "Against proforma invoice",
      creditLimit: 1800000
    },
    {
      id: "cust-northbay",
      name: "Northbay Utilities",
      segment: "Utility distributor",
      contact: "Rakesh Mehta",
      phone: "+91 97111 33908",
      email: "rakesh@northbay.example",
      city: "Delhi NCR",
      gst: "07AADCN2390B1Z5",
      paymentTerms: "45 days approved account",
      creditLimit: 6000000
    }
  ];

  const inquiries = [
    {
      id: "inq-1042",
      customerId: "cust-arvind",
      requirement: "3.5C x 240 sq mm aluminium armoured cable",
      source: "Repeat order",
      value: 1845000,
      dueDate: "2026-06-26",
      status: "Costing",
      owner: "Operations",
      nextAction: "Lock conductor price before quote approval"
    },
    {
      id: "inq-1043",
      customerId: "cust-vardhan",
      requirement: "1C x 630 sq mm copper flexible cable",
      source: "Tender portal",
      value: 3220000,
      dueDate: "2026-06-24",
      status: "Commercial review",
      owner: "Sales",
      nextAction: "Confirm EMD exemption certificate"
    },
    {
      id: "inq-1044",
      customerId: "cust-suryanet",
      requirement: "DC solar cable, 6 sq mm, red/black drums",
      source: "Website",
      value: 740000,
      dueDate: "2026-06-28",
      status: "Quote sent",
      owner: "Sales",
      nextAction: "Follow up after technical approval"
    },
    {
      id: "inq-1045",
      customerId: "cust-northbay",
      requirement: "11kV XLPE feeder cable for utility maintenance",
      source: "Distributor call",
      value: 5125000,
      dueDate: "2026-07-02",
      status: "Spec clarification",
      owner: "Operations",
      nextAction: "Request drum schedule"
    }
  ];

  const quotes = [
    {
      id: "Q-2606-118",
      inquiryId: "inq-1042",
      customerId: "cust-arvind",
      cableSpec: "3.5C x 240 sq mm Al, XLPE insulated, GI armoured",
      material: "Aluminium",
      conductorSize: 240,
      lengthM: 1800,
      metalRate: 248,
      overheadPerM: 86,
      marginPct: 14,
      total: 1845216,
      status: "Approved",
      validUntil: "2026-06-30",
      aiFlag: "Margin is 2.1 points below usual EPC margin"
    },
    {
      id: "Q-2606-119",
      inquiryId: "inq-1043",
      customerId: "cust-vardhan",
      cableSpec: "1C x 630 sq mm Cu, EPR insulated, flexible",
      material: "Copper",
      conductorSize: 630,
      lengthM: 950,
      metalRate: 892,
      overheadPerM: 138,
      marginPct: 11,
      total: 3219555,
      status: "Review",
      validUntil: "2026-06-25",
      aiFlag: "Tender due in 1 day; BG clause missing"
    },
    {
      id: "Q-2606-120",
      inquiryId: "inq-1044",
      customerId: "cust-suryanet",
      cableSpec: "1C x 6 sq mm Cu solar DC cable, UV resistant",
      material: "Copper",
      conductorSize: 6,
      lengthM: 12000,
      metalRate: 886,
      overheadPerM: 22,
      marginPct: 18,
      total: 739680,
      status: "Sent",
      validUntil: "2026-07-01",
      aiFlag: "Good margin; follow-up due after 48 hours"
    }
  ];

  const orders = [
    {
      id: "ORD-7741",
      quoteId: "Q-2606-118",
      customerId: "cust-arvind",
      title: "Arvind EPC feeder cable",
      stage: "In Production",
      promisedDate: "2026-06-29",
      amount: 1845216,
      priority: "High",
      owner: "Operations",
      completionPct: 62
    },
    {
      id: "ORD-7736",
      quoteId: "Q-2606-120",
      customerId: "cust-suryanet",
      title: "Solar DC cable drums",
      stage: "Ready for Dispatch",
      promisedDate: "2026-06-24",
      amount: 739680,
      priority: "Medium",
      owner: "Operations",
      completionPct: 100
    },
    {
      id: "ORD-7728",
      quoteId: "Q-2606-111",
      customerId: "cust-northbay",
      title: "11kV maintenance feeder",
      stage: "Invoiced",
      promisedDate: "2026-06-18",
      amount: 2860000,
      priority: "Medium",
      owner: "Accounts",
      completionPct: 100
    },
    {
      id: "ORD-7745",
      quoteId: "Q-2606-119",
      customerId: "cust-vardhan",
      title: "Copper flexible tender lot",
      stage: "Quoted",
      promisedDate: "2026-07-05",
      amount: 3219555,
      priority: "High",
      owner: "Sales",
      completionPct: 0
    }
  ];

  const jobCards = [
    {
      id: "JC-8814",
      orderId: "ORD-7741",
      conductor: "Aluminium stranded compacted",
      insulation: "XLPE, natural",
      armour: "GI strip armour",
      sheath: "FR PVC black",
      drumPlan: "3 drums x 600 m",
      operatorNotes: "Hold final sheath print until client confirms project code.",
      qualityChecks: ["Conductor resistance", "Spark test", "Armour lay length"]
    },
    {
      id: "JC-8809",
      orderId: "ORD-7736",
      conductor: "Copper class 5",
      insulation: "XLPO UV resistant",
      armour: "None",
      sheath: "Red and black",
      drumPlan: "24 drums x 500 m",
      operatorNotes: "Pack red and black drums in matched pairs.",
      qualityChecks: ["Continuity", "OD check", "Print legibility"]
    }
  ];

  const dispatches = [
    {
      id: "DSP-3391",
      orderId: "ORD-7736",
      transporter: "Venkatesh Logistics",
      vehicle: "KA-05-MR-7712",
      checklist: [
        { label: "Drum marking verified", done: true },
        { label: "Test certificate attached", done: true },
        { label: "Packing list printed", done: true },
        { label: "Invoice ready", done: false },
        { label: "E-way bill generated", done: false }
      ]
    },
    {
      id: "DSP-3395",
      orderId: "ORD-7741",
      transporter: "Pending allocation",
      vehicle: "Not assigned",
      checklist: [
        { label: "Drum marking verified", done: false },
        { label: "Test certificate attached", done: false },
        { label: "Packing list printed", done: false },
        { label: "Invoice ready", done: false },
        { label: "E-way bill generated", done: false }
      ]
    }
  ];

  const accountingDocs = [
    {
      id: "INV-2606-062",
      orderId: "ORD-7728",
      customerId: "cust-northbay",
      amount: 2860000,
      dueDate: "2026-07-28",
      status: "Payment pending",
      syncStatus: "Synced to Tally",
      risk: "Low"
    },
    {
      id: "PI-2606-081",
      orderId: "ORD-7736",
      customerId: "cust-suryanet",
      amount: 739680,
      dueDate: "2026-06-24",
      status: "Awaiting balance before dispatch",
      syncStatus: "Ready to sync",
      risk: "Medium"
    },
    {
      id: "DRAFT-2606-088",
      orderId: "ORD-7741",
      customerId: "cust-arvind",
      amount: 1845216,
      dueDate: "2026-06-29",
      status: "Invoice draft blocked",
      syncStatus: "Missing dispatch data",
      risk: "High"
    }
  ];

  const complianceItems = [
    {
      id: "CMP-501",
      type: "EMD",
      customerId: "cust-vardhan",
      inquiryId: "inq-1043",
      amount: 50000,
      dueDate: "2026-06-24",
      status: "Needs approval",
      risk: "High"
    },
    {
      id: "CMP-502",
      type: "Bank guarantee",
      customerId: "cust-northbay",
      inquiryId: "inq-1045",
      amount: 260000,
      dueDate: "2026-07-12",
      status: "Draft requested",
      risk: "Medium"
    },
    {
      id: "CMP-503",
      type: "Tender document",
      customerId: "cust-arvind",
      inquiryId: "inq-1042",
      amount: 0,
      dueDate: "2026-06-26",
      status: "Complete",
      risk: "Low"
    }
  ];

  const activityEvents = [
    { at: "2026-06-23 09:15", actor: "Operations", text: "Costing updated for Q-2606-118 after aluminium rate review." },
    { at: "2026-06-23 10:05", actor: "Accounts", text: "PI-2606-081 marked ready to sync after balance confirmation request." },
    { at: "2026-06-23 11:20", actor: "Sales", text: "Follow-up scheduled with Suryanet Solar for technical approval." },
    { at: "2026-06-23 12:10", actor: "AI-ready rule", text: "Flagged ORD-7741 as delay risk because dispatch docs are not started." }
  ];

  const aiInsights = [
    { type: "Margin anomaly", severity: "Medium", route: "#/quote", text: "Q-2606-118 is below the normal EPC target margin. Owner review recommended before final approval." },
    { type: "Delay risk", severity: "High", route: "#/dispatch", text: "ORD-7741 has production at 62% but no dispatch checklist progress with six days to promise date." },
    { type: "Missing document", severity: "High", route: "#/compliance", text: "Vardhan tender requires EMD approval before June 24, 2026." },
    { type: "Cash control", severity: "Medium", route: "#/accounting", text: "Suryanet dispatch should wait for balance payment confirmation." }
  ];

  function money(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(value);
  }

  function shortDate(value) {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(value + "T00:00:00+05:30"));
  }

  function customerName(customerId) {
    const customer = customers.find((item) => item.id === customerId);
    return customer ? customer.name : "Unknown customer";
  }

  function daysUntil(value) {
    const due = new Date(value + "T00:00:00+05:30");
    return Math.ceil((due - today) / 86400000);
  }

  function calculateCableQuote(input) {
    const conductorFactor = input.material === "Copper" ? 0.0092 : 0.00325;
    const metalCostPerM = input.conductorSize * conductorFactor * input.metalRate;
    const basePerM = metalCostPerM + input.overheadPerM;
    const subtotal = basePerM * input.lengthM;
    const margin = subtotal * (input.marginPct / 100);
    const total = Math.round(subtotal + margin);
    return {
      metalCostPerM,
      basePerM,
      subtotal,
      margin,
      total
    };
  }

  window.AutoloomData = {
    today,
    customers,
    inquiries,
    quotes,
    orders,
    jobCards,
    dispatches,
    accountingDocs,
    complianceItems,
    activityEvents,
    aiInsights,
    helpers: {
      money,
      shortDate,
      customerName,
      daysUntil,
      calculateCableQuote
    }
  };
})();
