// ─────────────────────────────────────────────────────────────
// 1) Firebase project settings
//    Firebase console → Project settings → General → Your apps → Web app → "Config".
//    These values are NOT secret (they only identify the project); access is
//    protected by Firebase Auth + the rules in firestore.rules.
//    While apiKey starts with "PASTE" — or when the address ends in ?demo —
//    the app runs in DEMO mode and saves data only in this browser.
// ─────────────────────────────────────────────────────────────
window.BP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyBlINs0S12S5FsQFfIqAqw9c8LxzeGdhEw",
    authDomain: "budget-planner-482de.firebaseapp.com",
    projectId: "budget-planner-482de",
    storageBucket: "budget-planner-482de.firebasestorage.app",
    messagingSenderId: "479787543451",
    appId: "1:479787543451:web:c08d2d90c87df1f7d24f3e",
  },

  // ───────────────────────────────────────────────────────────
  // 2) Department settings
  // ───────────────────────────────────────────────────────────
  settings: {
    departmentId: "focused-medical-equipment",   // Firestore key: departments/{departmentId}/...
    departmentName: "Focused Medical Equipment",
    currency: "GEL",                             // budget currency
    locale: "en-US",                             // number format: 1,234,567

    // Budget lines used for Revenue, Profit and Procurement in a new year.
    // (You can also add, rename or remove lines in the app while editing.)
    categories: [
      "ექოსკოპია",
      "ენდოსკოპია",
      "ლაპაროსკოპია",
      "ოფთალმოლოგია",
      "სტერილიზაცია",
      "სიმულატორები",
      "რადიოლოგია",
      "სამედიცინო აირი",
      "დამატება",
    ],
    // Extra "of which" lines shown under the total but NOT added to it.
    memoLines: {
      revenue: ["ბათუმის რეალიზაცია", "ქუთაისის რეალიზაცია"],
    },

    // Sales-forecast deal statuses (same colours as the Excel sheet).
    // Rename the labels to whatever your team means by each colour.
    dealStatuses: [
      { key: "closed", label: "Closed", color: "#0ca30c" },
      { key: "likely", label: "Likely", color: "#fab219" },
      { key: "progress", label: "In progress", color: "#ec835a" },
      { key: "pipeline", label: "Pipeline", color: "#a8a79f" },
    ],

    // Supplier payments
    paymentCurrencies: ["EUR", "USD", "GEL"],
    defaultFx: { USD: 2.70, EUR: 3.15 },         // GEL per 1 unit; editable in the app
  },
};
