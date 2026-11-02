// resources/js/data/guideBotKnowledge.js
// Comprehensive Bilingual (English + Urdu / اردو) Screen-Aware Feature Knowledge Base
// Covers every route, sub-tab, and workflow in Karobar App ERP v2.

export const GUIDE_BOT_UI_TEXT = {
  en: {
    botName: "Karobar Guide Bot",
    botTagline: "Screen-Aware Bilingual ERP Assistant",
    topNavLabel: "Screen Guide",
    topNavBadge: "EN / اردو",
    sensingLabel: "Sensing Active Screen",
    viewingOtherLabel: "Previewing Guide For",
    backToCurrentScreen: "Back to Current Screen",
    openPageBtn: "Open This Screen",
    tabCurrent: "This Screen",
    tabAsk: "Ask Bot (Q&A)",
    tabExplore: "All Modules",
    langEnglish: "English",
    langUrdu: "اردو",
    langBoth: "EN + اردو",
    listenBtn: "Listen",
    stopListenBtn: "Stop Audio",
    whatIsThisTitle: "What This Screen Does",
    keyFeaturesTitle: "Key Features on This Screen",
    howToUseTitle: "Step-by-Step How to Use",
    behindTheScenesTitle: "Accounting & Stock Impact",
    shortcutsTitle: "Keyboard Shortcuts Here",
    quickQuestionsTitle: "Common Questions About This Screen",
    relatedScreensTitle: "Connected Workflow Screens",
    askPlaceholder: "Ask in English, اردو, or Roman Urdu (e.g. 'how to add stock', 'udhar khata', 'FEFO')...",
    askSendBtn: "Ask",
    suggestedPromptsTitle: "Try asking:",
    exploreSearchPlaceholder: "Search any screen or feature (e.g. POS, Ledger, Expiry, Payroll)...",
    closeLabel: "Close Guide (Esc)",
    welcomeGreeting: "Assalam-o-Alaikum! I sense you are on the",
    welcomeSuffix: "screen. Here is everything this page does and how you can use it:",
  },
  ur: {
    botName: "کاروبار گائیڈ بوٹ",
    botTagline: "اسکرین کو سمجھنے والا دو لسانی معاون (انگلش اور اردو)",
    topNavLabel: "اسکرین گائیڈ",
    topNavBadge: "اردو / EN",
    sensingLabel: "موجودہ اسکرین کی شناخت",
    viewingOtherLabel: "منتخب کردہ گائیڈ",
    backToCurrentScreen: "موجودہ اسکرین پر واپس جائیں",
    openPageBtn: "یہ صفحہ کھولیں",
    tabCurrent: "موجودہ اسکرین",
    tabAsk: "سوال پوچھیں",
    tabExplore: "تمام فیچرز",
    langEnglish: "English",
    langUrdu: "اردو",
    langBoth: "دونوں (EN+اردو)",
    listenBtn: "آواز میں سنیں",
    stopListenBtn: "آواز روکیں",
    whatIsThisTitle: "یہ اسکرین کیا کام کرتی ہے؟",
    keyFeaturesTitle: "اس صفحے کی اہم خصوصیات",
    howToUseTitle: "استعمال کرنے کا مرحلہ وار طریقہ",
    behindTheScenesTitle: "اسٹاک اور کھاتوں (اکاؤنٹس) پر اثر",
    shortcutsTitle: "اس اسکرین کے کی بورڈ شارٹ کٹس",
    quickQuestionsTitle: "اس اسکرین سے متعلق عام سوالات",
    relatedScreensTitle: "متعلقہ صفحات اور اگلے مراحل",
    askPlaceholder: "انگلش، اردو یا رومن اردو میں سوال لکھیں (مثلاً: 'اسٹاک کیسے ڈالیں'، 'ادھار کھاتہ'، 'ایکسپائری')...",
    askSendBtn: "پوچھیں",
    suggestedPromptsTitle: "یہ سوالات پوچھ کر دیکھیں:",
    exploreSearchPlaceholder: "کسی بھی اسکرین یا فیچر کو تلاش کریں (مثلاً POS، لیجر، ایکسپائری، تنخواہ)...",
    closeLabel: "بند کریں (Esc)",
    welcomeGreeting: "السلام علیکم! آپ اس وقت",
    welcomeSuffix: "اسکرین پر موجود ہیں۔ اس صفحے کی مکمل تفصیل اور طریقہ کار نیچے دیا گیا ہے:",
  },
};

export const SCREEN_GUIDES = {
  // ============================================================================
  // 1. OVERVIEW & PERSONAL
  // ============================================================================
  "/dashboard": {
    key: "/dashboard",
    category: "overview",
    title: {
      en: "Business Intelligence Dashboard",
      ur: "بزنس ڈیش بورڈ (مکمل کاروباری خلاصہ)",
    },
    section: {
      en: "Overview & Analytics",
      ur: "عمومی جائزہ اور رپورٹس",
    },
    summary: {
      en: "Your real-time command center showing sales revenue, gross profit, purchase volume, customer receivables, supplier payables, low-stock warnings, and batch expiry alerts across any custom date range.",
      ur: "یہ آپ کے کاروبار کا مرکزی کنٹرول روم ہے۔ یہاں آپ کسی بھی تاریخ کے دوران ہونے والی سیلز، منافع، خریداری، گاہکوں کے واجبات (Receivables)، سپلائرز کی ادائیگیاں، کم اسٹاک اور قریب ایکسپائر ہونے والے بیچز ایک ہی نظر میں دیکھ سکتے ہیں۔",
    },
    features: {
      en: [
        "Custom Date Filter (Today, This Month, This Year, or any custom From–To dates) that recalculates all KPI cards and charts live.",
        "Financial KPI Cards displaying Total Sales, Gross Profit, Purchase Volume, Expenses, and Net Cash Position.",
        "Interactive Area & Bar Charts comparing daily/monthly Sales vs. Purchases and Returns.",
        "Operational Alerts Strip for Low Stock items, Near-Expiry/Expired batches, and Pending Customer Product Demands.",
        "One-Click Module Shortcuts to jump directly to POS, Invoices, Ledgers, or Inventory reports.",
      ],
      ur: [
        "تاریخ کا فلٹر (آج، رواں ماہ، رواں سال یا اپنی مرضی کی تاریخیں) جس سے تمام کارڈز اور گراف فوری اپڈیٹ ہو جاتے ہیں۔",
        "اہم مالیاتی کارڈز جو کل سیلز، مجموعی منافع (Gross Profit)، خریداری، اخراجات اور کیش پوزیشن دکھاتے ہیں۔",
        "سیلز، خریداری اور واپسی (Returns) کا موازنہ کرنے والے خوبصورت اور واضح چارٹس۔",
        "کم اسٹاک، ایکسپائر ہونے والی ادویات/اشیاء اور گاہکوں کی ڈیمانڈز کے فوری الرٹس۔",
        "کسی بھی کارڈ پر کلک کر کے متعلقہ تفصیلی رپورٹ یا اسکرین پر جانے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Select your desired date range at the top right (e.g., Today or This Month) and click Refresh if needed.",
        "Review the top KPI cards to check today's total sales, returns, and net collections.",
        "Check the Low Stock and Expiry alert cards to see which products need urgent reordering or quarantine.",
        "Click any module card or chart metric to drill down into its detailed report.",
      ],
      ur: [
        "اوپر دائیں جانب اپنی مطلوبہ تاریخ (مثلاً آج یا پورا مہینہ) منتخب کریں۔",
        "اوپر والے کارڈز میں کل سیلز، منافع، خریداری اور وصولیوں کا جائزہ لیں۔",
        "لو اسٹاک (Low Stock) اور ایکسپائری (Expiry) الرٹس چیک کریں تاکہ بروقت نیا مال منگوایا جا سکے۔",
        "مزید تفصیل دیکھنے کے لیے کسی بھی کارڈ پر کلک کریں تاکہ اس کا متعلقہ صفحہ کھل جائے۔",
      ],
    },
    impacts: {
      en: "Read-only analytical screen. Changing filters here does not alter any accounting or stock records.",
      ur: "یہ صرف معلومات دیکھنے کی اسکرین ہے۔ یہاں فلٹر بدلنے سے کسی کھاتے یا اسٹاک میں کوئی تبدیلی نہیں ہوتی۔",
    },
    shortcuts: [
      { keys: ["Alt", "K"], en: "Quick Jump to any Page", ur: "کسی بھی صفحے پر فوری جائیں" },
      { keys: ["Alt", "P"], en: "Global Product & Batch Lookup", ur: "پروڈکٹ اور بیچ سرچ کریں" },
      { keys: ["Alt", "2"], en: "Open New Retail Sale Invoice", ur: "نیا ریٹیل سیل بل کھولیں" },
      { keys: ["Alt", "1"], en: "Open New Purchase Invoice", ur: "نیا پرچیز بل کھولیں" },
    ],
    faqs: [
      {
        q: { en: "Why do dashboard numbers change when I pick different dates?", ur: "تاریخ بدلنے سے ڈیش بورڈ کے نمبر کیوں بدلتے ہیں؟" },
        a: {
          en: "Sales, purchases, returns, and profit charts reflect transactions within your selected From–To date window, while current stock and ledger balances show live standing totals.",
          ur: "سیلز، خریداری اور منافع کے اعداد و شمار آپ کی منتخب کردہ تاریخوں کے مطابق دکھائے جاتے ہیں، جبکہ موجودہ اسٹاک اور کھاتوں کا بیلنس ہمیشہ لائیو ہوتا ہے۔",
        },
      },
    ],
    relatedRoutes: [
      { path: "/sale-invoices/pos", en: "Barcode POS", ur: "بارکوڈ POS ٹرمینل" },
      { path: "/reports/net-profit", en: "Profit & Loss Report", ur: "نفع و نقصان کی رپورٹ" },
      { path: "/batch-expiry", en: "Batch Expiry Tracking", ur: "بیچ ایکسپائری ٹریکنگ" },
    ],
  },

  "/profile": {
    key: "/profile",
    category: "overview",
    title: {
      en: "User Profile & Password Security",
      ur: "یوزر پروفائل اور پاس ورڈ سیٹنگز",
    },
    section: {
      en: "Account & Security",
      ur: "اکاؤنٹ اور سیکیورٹی",
    },
    summary: {
      en: "Manage your personal account name, login email, and update your password securely.",
      ur: "یہاں سے آپ اپنے اکاؤنٹ کا نام، ای میل اور لاگ ان پاس ورڈ محفوظ طریقے سے تبدیل کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Update display name shown on invoices, cash drawer shifts, and audit logs.",
        "Change account password with current-password verification.",
        "View your assigned role and active account details.",
      ],
      ur: [
        "اپنا نام اپڈیٹ کریں جو آپ کے بنائے گئے بلوں اور کیش ڈراور شفٹ پر ظاہر ہوتا ہے۔",
        "پرانا پاس ورڈ درج کر کے نیا محفوظ پاس ورڈ سیٹ کریں۔",
        "اپنے یوزر اکاؤنٹ کی معلومات چیک کریں۔",
      ],
    },
    steps: {
      en: [
        "Update your Name or Email in the profile fields.",
        "To change your password, enter your Current Password, New Password, and Confirm Password.",
        "Click Save Changes to apply immediately.",
      ],
      ur: [
        "اپنا نام یا ای میل تبدیل کرنے کے لیے متعلقہ خانے میں ترمیم کریں۔",
        "پاس ورڈ بدلنے کے لیے موجودہ پاس ورڈ اور نیا پاس ورڈ درج کریں۔",
        "تبدیلیاں محفوظ کرنے کے لیے Save بٹن پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Updates your operator identity on future invoices and shift logs without altering historical records.",
      ur: "اس سے آپ کی لاگ ان معلومات اپڈیٹ ہو جاتی ہیں اور پرانے بلوں کا ریکارڈ محفوظ رہتا ہے۔",
    },
    shortcuts: [
      { keys: ["Alt", "K"], en: "Search & switch page", ur: "کسی بھی صفحے پر جائیں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/dashboard", en: "Dashboard", ur: "ڈیش بورڈ" },
      { path: "/settings", en: "System Settings", ur: "سسٹم سیٹنگز" },
    ],
  },

  // ============================================================================
  // 2. ITEMS & CATALOG MASTERS
  // ============================================================================
  "/products": {
    key: "/products",
    category: "items",
    title: {
      en: "Products Catalog & Master Inventory",
      ur: "پروڈکٹس کیٹلاگ اور انوینٹری لسٹ",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Central catalog of all products/medicines in your store. View on-hand stock, pack size, purchase cost, retail/wholesale prices, rack locations, formulation/salt, and perform bulk imports or edits.",
      ur: "یہ آپ کی دکان یا فارمیسی میں موجود تمام اشیاء (پروڈکٹس/ادویات) کی مکمل فہرست ہے۔ یہاں سے آپ ہر آئٹم کا موجودہ اسٹاک، پیک سائز، قیمتِ خرید، قیمتِ فروخت، ریک نمبر، فارمولیشن (Salt) دیکھ سکتے ہیں اور ایکسل فائل سے پروڈکٹس امپورٹ بھی کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Fast Search & Filtering by product name, barcode/SKU, category, brand, supplier, or Low-Stock status.",
        "Inline visibility of Pack Size, Unit/Pack Purchase Price, Retail Price, Wholesale Price, and On-Hand Units.",
        "Bulk Actions: Import products via CSV/Excel, Bulk Edit prices/categories, or Bulk Delete unused items.",
        "Direct links to manage Product Batches, print Barcode Stickers, or create a new Product.",
      ],
      ur: [
        "نام، بارکوڈ، کیٹیگری، برانڈ، سپلائر یا کم اسٹاک (Low Stock) کے لحاظ سے تیز ترین سرچ اور فلٹر۔",
        "ہر پروڈکٹ کا پیک سائز، خرید و فروخت کی قیمت، ہول سیل ریٹ اور موجودہ اسٹاک ایک ہی ٹیبل میں دیکھیں۔",
        "بلک ایکشنز: ایکسل/CSV سے سینکڑوں پروڈکٹس ایک ساتھ امپورٹ کریں یا ایک ساتھ ایڈٹ کریں۔",
        "کسی بھی پروڈکٹ کے بیچز (Batches) دیکھنے یا نیا پروڈکٹ شامل کرنے کی فوری سہولت۔",
      ],
    },
    steps: {
      en: [
        "Use the search bar or Category/Brand/Supplier filters to find any item quickly.",
        "Click '+ Add Product' to register a new item, or 'Import' to upload a spreadsheet.",
        "Click the Edit icon on any row to update pricing, rack number, barcode, or margin.",
        "Use the Low Stock filter toggle to see items that have dropped below their pack/reorder threshold.",
      ],
      ur: [
        "سرچ بار یا فلٹرز کی مدد سے کوئی بھی پروڈکٹ فوری تلاش کریں۔",
        "نیا آئٹم شامل کرنے کے لیے '+ Add Product' پر کلک کریں یا ایکسل شیٹ اپلوڈ کرنے کے لیے 'Import' دبائیں۔",
        "کسی بھی آئٹم کی قیمت، بارکوڈ یا ریک نمبر بدلنے کے لیے اس کے آگے Edit بٹن پر کلک کریں۔",
        "کم اسٹاک والے آئٹمز دیکھنے کے لیے Low Stock فلٹر آن کریں۔",
      ],
    },
    impacts: {
      en: "Master product definitions control default pricing, pack conversions, and tax/margin calculations on all Sale and Purchase invoices.",
      ur: "یہاں درج کی گئی قیمتیں اور پیک سائز سیل اور پرچیز بل بناتے وقت خودکار طریقے سے استعمال ہوتے ہیں۔",
    },
    shortcuts: [
      { keys: ["Alt", "P"], en: "Quick Product Lookup Modal", ur: "کہیں سے بھی پروڈکٹ سرچ کریں" },
      { keys: ["Alt", "K"], en: "Navigate to another page", ur: "دوسرے صفحے پر جائیں" },
    ],
    faqs: [
      {
        q: { en: "How do I add stock quantity to a product?", ur: "پروڈکٹ میں نیا اسٹاک کیسے شامل کریں؟" },
        a: {
          en: "You can add stock via a Purchase Invoice (recommended for supplier bills), via Product Batches workbench, or via Stock Adjustments for opening/audit corrections.",
          ur: "نیا اسٹاک شامل کرنے کے لیے 'Purchase Invoice' (خریداری کا بل) بنائیں، یا 'Product Batches' اسکرین سے بیچ شامل کریں، یا اسٹاک ایڈجسٹمنٹ استعمال کریں۔",
        },
      },
    ],
    relatedRoutes: [
      { path: "/products/create", en: "Add New Product", ur: "نیا پروڈکٹ شامل کریں" },
      { path: "/product-batches", en: "Product Batches Workbench", ur: "پروڈکٹ بیچز ورک بینچ" },
      { path: "/barcode-labels", en: "Barcode Studio", ur: "بارکوڈ اسٹوڈیو" },
    ],
  },

  "/products/create": {
    key: "/products/create",
    category: "items",
    title: {
      en: "Add New Product",
      ur: "نیا پروڈکٹ شامل کریں",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Register a new product or medicine in your catalog with its barcode, pack size, purchase price, retail/wholesale sale prices, margin %, formulation/generic salt, rack location, and supplier/brand links.",
      ur: "اپنے سافٹ ویئر میں نیا پروڈکٹ یا دوائی رجسٹر کریں۔ یہاں آپ آئٹم کا نام، بارکوڈ، پیک سائز، قیمتِ خرید، ریٹیل اور ہول سیل قیمت، منافع کا فیصد (Margin %)، فارمولیشن (Salt)، ریک نمبر، برانڈ اور سپلائر درج کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Auto-calculated Unit & Pack pricing: enter Pack Price and Pack Size to automatically compute Unit Price and Margin %.",
        "Barcode / SKU assignment with auto-generation or hardware barcode scanner input.",
        "Formulation / Generic Salt field so POS and Retail Invoices can suggest substitute medicines when out of stock.",
        "Category, Brand, Supplier, and Rack Location tagging for organized inventory.",
      ],
      ur: [
        "خودکار قیمت کا حساب: پیک سائز اور پیک کی قیمت لکھنے سے فی یونٹ قیمت اور منافع کا فیصد خودکار نکل آتا ہے۔",
        "بارکوڈ اسکین کرنے یا خودکار نیا بارکوڈ جنریٹ کرنے کی سہولت۔",
        "فارمولیشن (Generic Salt) کا خانہ، جس کی مدد سے بل بناتے وقت متبادل (Substitute) ادویات تلاش کی جا سکتی ہیں۔",
        "کیٹیگری، برانڈ، سپلائر اور شیلف/ریک نمبر محفوظ کرنے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Enter the Product Name, Barcode/Code, and Generic Formulation (if applicable).",
        "Select Category, Brand, and primary Supplier (you can create new ones inline if needed).",
        "Set Pack Size (e.g., 1 for single item, 10 or 30 for strips/boxes) and enter Pack/Unit Purchase and Sale prices.",
        "Press Save to add the product to your catalog.",
      ],
      ur: [
        "پروڈکٹ کا نام، بارکوڈ اور فارمولیشن درج کریں۔",
        "کیٹیگری، برانڈ اور سپلائر منتخب کریں۔",
        "پیک سائز (مثلاً ڈبے میں کتنے یونٹ ہیں) اور خرید و فروخت کی قیمتیں درج کریں۔",
        "محفوظ کرنے کے لیے Save بٹن پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Creates a new catalog item immediately available in POS, Sale Invoices, Purchase Invoices, and Barcode Studio.",
      ur: "نیا آئٹم فوری طور پر کیٹلاگ میں شامل ہو جاتا ہے اور POS، سیل اور پرچیز بلوں میں دستیاب ہو جاتا ہے۔",
    },
    shortcuts: [
      { keys: ["Enter"], en: "Advance to next input field", ur: "اگلے خانے میں جائیں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/products", en: "Products List", ur: "پروڈکٹس کی فہرست" },
      { path: "/product-batches", en: "Manage Batches", ur: "بیچز منیج کریں" },
    ],
  },

  "/products/:id/edit": {
    key: "/products/:id/edit",
    category: "items",
    title: {
      en: "Edit Product Details & Pricing",
      ur: "پروڈکٹ کی معلومات اور قیمت میں ترمیم",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Modify an existing product's name, barcode, pack size, purchase/sale prices, formulation, rack location, or active status.",
      ur: "پہلے سے موجود پروڈکٹ کا نام، بارکوڈ، پیک سائز، خرید و فروخت کی قیمتیں، فارمولیشن یا ریک نمبر تبدیل کریں۔",
    },
    features: {
      en: [
        "Update retail, wholesale, and purchase prices with automatic margin recalculation.",
        "Change rack/shelf location, brand, category, or supplier assignment.",
        "Update generic formulation for accurate substitute product matching.",
      ],
      ur: [
        "ریٹیل، ہول سیل اور خریداری کی قیمتوں کو اپڈیٹ کریں۔",
        "ریک نمبر، برانڈ، کیٹیگری یا سپلائر تبدیل کریں۔",
        "متبادل ادویات کی درست شناخت کے لیے فارمولیشن اپڈیٹ کریں۔",
      ],
    },
    steps: {
      en: [
        "Review and edit the fields you want to change (such as updated MRP or rack location).",
        "Verify the calculated unit price and margin percentage.",
        "Click Update/Save to apply changes across future transactions.",
      ],
      ur: [
        "جن خانوں میں تبدیلی درکار ہے (جیسے نئی قیمت یا ریک نمبر) انہیں اپڈیٹ کریں۔",
        "یونٹ پرائس اور مارجن چیک کریں۔",
        "تبدیلیاں محفوظ کرنے کے لیے Save/Update پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Updates default pricing and metadata for future invoices without altering past posted invoices.",
      ur: "نئی قیمتیں آئندہ بننے والے بلوں پر لاگو ہوں گی جبکہ پرانے بل محفوظ رہیں گے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/products", en: "Back to Products", ur: "پروڈکٹس لسٹ پر واپس" },
      { path: "/product-batches", en: "Product Batches", ur: "پروڈکٹ بیچز" },
    ],
  },

  "/product-batches": {
    key: "/product-batches",
    category: "items",
    title: {
      en: "Product Batches & Storage Locations Workbench",
      ur: "پروڈکٹ بیچز اور گودام/لوکیشن ورک بینچ",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Dedicated workbench to add, edit, split, or transfer batch numbers, expiry dates, batch-specific MRP/cost prices, and storage locations (Shop Floor, Cold Storage, Warehouse/Godown) for any product.",
      ur: "یہاں آپ کسی بھی پروڈکٹ کے مختلف بیچ نمبر (Batch Numbers)، ان کی ایکسپائری تاریخ، ہر بیچ کی الگ قیمت اور سٹوریج لوکیشن (دکان، فریج/کولڈ سٹوریج، گودام) شامل یا تبدیل کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Fast Product Combobox to pick any product and immediately inspect all its active batches and unassigned stock.",
        "Add or Edit Batches with Batch Number, Expiry Date, Quantity, Unit Cost, Unit MRP, Storage Location, and Rack.",
        "Move Batch Location Modal to transfer stock between Main Shop, Godown/Warehouse, or Cold Chain.",
        "Manage Custom Storage Locations & Zones for multi-location inventory organization.",
      ],
      ur: [
        "کسی بھی پروڈکٹ کو سرچ کر کے اس کے تمام بیچز اور بغیر بیچ والا اسٹاک (Unassigned Stock) فوری دیکھیں۔",
        "نیا بیچ نمبر، ایکسپائری تاریخ، مقدار، قیمتِ خرید و فروخت اور ریک نمبر شامل یا ایڈٹ کریں۔",
        "ایک لوکیشن (مثلاً گودام) سے دوسری لوکیشن (مثلاً دکان یا فریج) میں اسٹاک منتقل کریں۔",
        "اپنی مرضی کی سٹوریج لوکیشنز (Storage Locations) بنانے اور منیج کرنے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Search and select a product in the top Product Selector.",
        "Enter the Batch Number, Expiry Date, Quantity, Cost, and MRP in the quick-entry form and press Enter/Save.",
        "Use the batch table actions to edit an existing batch, move it to another storage location, or delete empty batches.",
      ],
      ur: [
        "سب سے اوپر سرچ باکس میں پروڈکٹ تلاش کر کے منتخب کریں۔",
        "بیچ نمبر، ایکسپائری تاریخ، مقدار اور قیمت درج کر کے Save دبائیں۔",
        "نیچے دیے گئے ٹیبل سے کسی بھی بیچ میں ترمیم کریں یا اسے دوسری لوکیشن پر منتقل کریں۔",
      ],
    },
    impacts: {
      en: "Synchronizes batch quantities with total product stock and feeds FEFO (First-Expired, First-Out) auto-selection in POS and Sale Invoices.",
      ur: "بیچز کا اسٹاک خودکار طور پر پروڈکٹ کے کل اسٹاک سے جڑا ہوتا ہے اور سیل بل بناتے وقت FEFO (پہلے ایکسپائر ہونے والا بیچ پہلے فروخت) اصول کے تحت سامنے آتا ہے۔",
    },
    shortcuts: [
      { keys: ["Enter"], en: "Step through Batch → Expiry → Qty → Cost → MRP → Save", ur: "انٹر دبا کر تیزی سے تمام خانے پُر کریں" },
    ],
    faqs: [
      {
        q: { en: "What is 'Unassigned Stock'?", ur: "'Unassigned Stock' (بغیر بیچ کا اسٹاک) کیا ہوتا ہے؟" },
        a: {
          en: "If a product has total stock greater than the sum of its named batches, the difference is shown as Unassigned Stock so you can easily assign it to a batch number and expiry date.",
          ur: "اگر کسی پروڈکٹ کا کل اسٹاک اس کے درج شدہ بیچز سے زیادہ ہو تو اضافی مقدار 'Unassigned' کہلاتی ہے، جسے آپ یہاں بیچ نمبر اور ایکسپائری دے سکتے ہیں۔",
        },
      },
    ],
    relatedRoutes: [
      { path: "/batch-expiry", en: "Batch Expiry Radar", ur: "بیچ ایکسپائری ٹریکنگ" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
    ],
  },

  "/categories": {
    key: "/categories",
    category: "items",
    title: {
      en: "Product Categories",
      ur: "پروڈکٹ کیٹیگریز (اقسام)",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Organize your products into logical categories (e.g., Tablets, Syrups, Injections, Cosmetics, Surgical, Grocery) for faster filtering and reporting.",
      ur: "اپنی اشیاء کو مختلف اقسام (مثلاً ٹیبلٹس، سیرپ، انجیکشن، سرجیکل، کاسمیٹکس وغیرہ) میں تقسیم کریں تاکہ تلاش اور رپورٹس میں آسانی رہے۔",
    },
    features: {
      en: [
        "Create, rename, and delete product categories on a single screen.",
        "Bulk import categories via Excel/CSV.",
        "Filter products and sales reports by category.",
      ],
      ur: [
        "نئی کیٹیگری بنائیں، نام تبدیل کریں یا غیر ضروری کیٹیگری ختم کریں۔",
        "ایکسل فائل کے ذریعے ایک ساتھ کئی کیٹیگریز امپورٹ کریں۔",
        "پروڈکٹس اور رپورٹس کو کیٹیگری کے لحاظ سے فلٹر کریں۔",
      ],
    },
    steps: {
      en: [
        "Type the new Category Name in the form and click Save.",
        "Use the search bar to find existing categories or click Edit/Delete on any row.",
      ],
      ur: [
        "نئی کیٹیگری کا نام لکھ کر Save پر کلک کریں۔",
        "موجودہ کیٹیگریز کو سرچ کریں یا Edit/Delete بٹن استعمال کریں۔",
      ],
    },
    impacts: {
      en: "Used across Product Catalog, Stocktake Sessions, and Reports for grouping items.",
      ur: "اس سے پروڈکٹس کی درجہ بندی ہوتی ہے اور اسٹاک آڈٹ و رپورٹس میں سہولت ملتی ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/products", en: "Products", ur: "پروڈکٹس" },
      { path: "/brands", en: "Brands", ur: "برانڈز" },
    ],
  },

  "/brands": {
    key: "/brands",
    category: "items",
    title: {
      en: "Brands & Manufacturers",
      ur: "برانڈز اور سازندہ کمپنیاں (Manufacturers)",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Manage pharmaceutical companies, manufacturers, and product brands (e.g., GSK, Abbott, Getz, Unilever) to track brand-wise stock, sales, and purchase forecasts.",
      ur: "تمام کمپنیوں اور برانڈز (مثلاً GSK، ایبٹ، گیٹز وغیرہ) کا ریکارڈ رکھیں تاکہ کمپنی کے لحاظ سے اسٹاک، سیلز اور آرڈر فورکاسٹ دیکھا جا سکے۔",
    },
    features: {
      en: [
        "Searchable list of all brands with product count and quick edit/delete.",
        "CSV/Excel bulk brand import support.",
        "Used in Smart Reorder Forecast and Reports to filter by company/manufacturer.",
      ],
      ur: [
        "تمام برانڈز اور کمپنیوں کی فہرست مع سرچ اور ایڈٹ کی سہولت۔",
        "ایکسل فائل سے برانڈز امپورٹ کرنے کی سہولت۔",
        "آرڈر فورکاسٹ اور رپورٹس میں کمپنی کے حساب سے فلٹر کرنے کے لیے استعمال ہوتا ہے۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Add Brand' to register a new manufacturer or brand.",
        "Use 'Import' to bulk upload brands from a file, or click Edit on any row to rename.",
      ],
      ur: [
        "نیا برانڈ شامل کرنے کے لیے '+ Add Brand' پر کلک کریں۔",
        "کسی برانڈ کا نام تبدیل کرنے کے لیے اس کے آگے Edit پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Links products to manufacturers for brand-wise reporting and purchase order forecasting.",
      ur: "پروڈکٹس کو کمپنیوں کے ساتھ منسلک کرتا ہے جس سے کمپنی وائز سیل اور اسٹاک رپورٹ ملتی ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/brands/create", en: "Add Brand", ur: "نیا برانڈ بنائیں" },
      { path: "/products", en: "Products", ur: "پروڈکٹس" },
    ],
  },

  "/brands/create": {
    key: "/brands/create",
    category: "items",
    title: { en: "Add New Brand", ur: "نیا برانڈ شامل کریں" },
    section: { en: "Items & Masters", ur: "آئٹمز اور ماسٹر ریکارڈ" },
    summary: {
      en: "Create a new brand or manufacturer profile so products can be grouped under it.",
      ur: "نئی کمپنی یا برانڈ کا نام اور تفصیل درج کر کے محفوظ کریں۔",
    },
    features: {
      en: ["Enter Brand Name, optional logo/image, and description.", "Immediately selectable in Product Creation and Filters."],
      ur: ["برانڈ کا نام اور لوگو شامل کریں۔", "محفوظ ہوتے ہی پروڈکٹ فارم میں دستیاب ہو جاتا ہے۔"],
    },
    steps: {
      en: ["Type the Brand Name.", "Click Save to return to the Brands list."],
      ur: ["برانڈ کا نام لکھیں۔", "Save بٹن دبا کر محفوظ کریں۔"],
    },
    impacts: { en: "Adds a new manufacturer/brand to the master catalog.", ur: "ماسٹر لسٹ میں نیا برانڈ شامل کرتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/brands", en: "Brands List", ur: "برانڈز کی فہرست" }],
  },

  "/brands/:id/edit": {
    key: "/brands/:id/edit",
    category: "items",
    title: { en: "Edit Brand", ur: "برانڈ میں ترمیم کریں" },
    section: { en: "Items & Masters", ur: "آئٹمز اور ماسٹر ریکارڈ" },
    summary: {
      en: "Update an existing brand's name or details.",
      ur: "پہلے سے موجود برانڈ کے نام یا تفصیلات میں تبدیلی کریں۔",
    },
    features: {
      en: ["Rename brand across all linked products and reports automatically."],
      ur: ["برانڈ کا نام اپڈیٹ کرنے سے تمام منسلک پروڈکٹس میں خودکار اپڈیٹ ہو جاتا ہے۔"],
    },
    steps: {
      en: ["Modify the Brand Name and click Update."],
      ur: ["برانڈ کا نام تبدیل کر کے Update پر کلک کریں۔"],
    },
    impacts: { en: "Updates brand display name system-wide.", ur: "پورے سسٹم میں برانڈ کا نام اپڈیٹ ہو جاتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/brands", en: "Brands List", ur: "برانڈز کی فہرست" }],
  },

  "/suppliers": {
    key: "/suppliers",
    category: "items",
    title: {
      en: "Suppliers & Distributors Directory",
      ur: "سپلائرز اور ڈسٹری بیوٹرز کی فہرست",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Manage all vendors, distributors, and wholesalers from whom you purchase inventory. Track their contact details, payable balances, and jump to their Supplier Ledger.",
      ur: "ان تمام سپلائرز اور ڈسٹری بیوٹرز کا ریکارڈ رکھیں جن سے آپ مال خریدتے ہیں۔ یہاں آپ ان کا فون نمبر، پتہ، واجب الادا بیلنس دیکھ سکتے ہیں اور ان کے کھاتے (Supplier Ledger) میں جا سکتے ہیں۔",
    },
    features: {
      en: [
        "Directory of all suppliers with phone numbers, addresses, and current payable balances.",
        "Bulk import suppliers via Excel/CSV.",
        "Quick navigation to Supplier Ledger and Purchase Invoices.",
      ],
      ur: [
        "تمام سپلائرز کے نام، فون نمبر، پتہ اور موجودہ بقایاجات کی فہرست۔",
        "ایکسل شیٹ کے ذریعے سپلائرز امپورٹ کرنے کی سہولت۔",
        "سپلائر لیجر (کھاتہ) اور پرچیز بلوں تک فوری رسائی۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Add Supplier' to register a new distributor or vendor.",
        "Search by supplier name or phone number to find any vendor.",
        "Click Edit to update contact info or open Supplier Ledger to record/view payments.",
      ],
      ur: [
        "نیا سپلائر شامل کرنے کے لیے '+ Add Supplier' پر کلک کریں۔",
        "نام یا فون نمبر سے کسی بھی ڈسٹری بیوٹر کو تلاش کریں۔",
        "تفصیل بدلنے کے لیے Edit دبائیں یا کھاتہ دیکھنے کے لیے Supplier Ledger کھولیں۔",
      ],
    },
    impacts: {
      en: "Suppliers are linked to Products, Purchase Orders, Purchase Invoices, Purchase Returns, and Supplier Ledgers.",
      ur: "سپلائرز کا تعلق پروڈکٹس، پرچیز آرڈرز، خریداری کے بلوں اور سپلائر کھاتے سے ہوتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/suppliers/create", en: "Add Supplier", ur: "نیا سپلائر بنائیں" },
      { path: "/supplier-ledger", en: "Supplier Ledger", ur: "سپلائر کھاتہ" },
      { path: "/purchase-invoices", en: "Purchase Invoices", ur: "خریداری کے بل" },
    ],
  },

  "/suppliers/create": {
    key: "/suppliers/create",
    category: "items",
    title: { en: "Add New Supplier", ur: "نیا سپلائر شامل کریں" },
    section: { en: "Items & Masters", ur: "آئٹمز اور ماسٹر ریکارڈ" },
    summary: {
      en: "Register a new supplier/distributor with contact details and opening payable balance.",
      ur: "نئے ڈسٹری بیوٹر یا سپلائر کا نام، فون نمبر، پتہ اور ابتدائی بیلنس درج کریں۔",
    },
    features: {
      en: ["Record Supplier Name, Phone, Email, Address, and Opening Balance.", "Instantly available in Purchase Orders and Purchase Invoices."],
      ur: ["سپلائر کا نام، فون، پتہ اور اوپننگ بیلنس محفوظ کریں۔", "محفوظ کرتے ہی پرچیز بلوں میں دستیاب ہو جاتا ہے۔"],
    },
    steps: {
      en: ["Fill in the supplier's name and contact details.", "Click Save to add the supplier."],
      ur: ["سپلائر کی تفصیلات درج کریں اور Save پر کلک کریں۔"],
    },
    impacts: { en: "Creates a supplier account in payables.", ur: "سپلائر کا نیا کھاتہ بن جاتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/suppliers", en: "Suppliers List", ur: "سپلائرز کی فہرست" }],
  },

  "/suppliers/:id/edit": {
    key: "/suppliers/:id/edit",
    category: "items",
    title: { en: "Edit Supplier", ur: "سپلائر کی معلومات میں ترمیم" },
    section: { en: "Items & Masters", ur: "آئٹمز اور ماسٹر ریکارڈ" },
    summary: {
      en: "Update contact information and details for an existing supplier.",
      ur: "سپلائر کے نام، فون نمبر یا پتے میں تبدیلی کریں۔",
    },
    features: {
      en: ["Update supplier phone, address, and contact person details."],
      ur: ["سپلائر کا فون نمبر اور پتہ اپڈیٹ کریں۔"],
    },
    steps: {
      en: ["Modify the desired fields and click Save/Update."],
      ur: ["مطلوبہ تبدیلی کر کے Save پر کلک کریں۔"],
    },
    impacts: { en: "Updates supplier profile across all purchase modules.", ur: "تمام پرچیز ماڈیولز میں سپلائر کی تفصیل اپڈیٹ ہو جاتی ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/suppliers", en: "Suppliers List", ur: "سپلائرز کی فہرست" }],
  },

  "/customers": {
    key: "/customers",
    category: "items",
    title: {
      en: "Customers & Credit Rules Management",
      ur: "گاہکوں (Customers) اور ادھار لمٹ کا ریکارڈ",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Manage retail and wholesale customers, contact details, default discount %, credit limits, and receivable balances.",
      ur: "اپنے ریٹیل اور ہول سیل گاہکوں کا مکمل ریکارڈ رکھیں۔ یہاں آپ ہر گاہک کا فون نمبر، پتہ، مخصوص ڈسکاؤنٹ فیصد، ادھار کی حد (Credit Limit) اور بقایا بیلنس منیج کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Add, edit, search, and bulk-import customers on a single unified screen.",
        "Configure Customer Credit Limits and Credit Hold rules to prevent unauthorized over-credit billing.",
        "View live receivable balances and jump to Customer Ledger for statement printing or payment collection.",
      ],
      ur: [
        "نئے گاہک شامل کریں، تلاش کریں یا ایکسل سے امپورٹ کریں۔",
        "ہر گاہک کے لیے ادھار کی حد (Credit Limit) مقرر کریں تاکہ مقررہ حد سے زیادہ ادھار پر خودکار وارننگ ملے۔",
        "گاہک کے ذمے واجب الادا رقم دیکھیں اور کھاتہ (Customer Ledger) کھولیں۔",
      ],
    },
    steps: {
      en: [
        "Use the left/top form to add a new customer with Name, Phone, Address, and optional Credit Limit.",
        "Search existing customers in the table to edit their profile or check their balance.",
        "Click Customer Ledger to view full bill-by-bill history or receive a payment.",
      ],
      ur: [
        "نیا گاہک شامل کرنے کے لیے نام، فون نمبر اور کریڈٹ لمٹ درج کر کے Save کریں۔",
        "ٹیبل میں کسی بھی گاہک کو سرچ کر کے اس کا بیلنس دیکھیں یا تفصیل ایڈٹ کریں۔",
        "وصولی درج کرنے یا مکمل کھاتہ دیکھنے کے لیے Customer Ledger میں جائیں۔",
      ],
    },
    impacts: {
      en: "Customer credit limits and discounts automatically apply during POS, Retail, and Wholesale invoicing.",
      ur: "گاہک کی کریڈٹ لمٹ اور ڈسکاؤنٹ سیل بل بناتے وقت خودکار طور پر کام کرتے ہیں۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ (Ledger)" },
      { path: "/sale-invoices", en: "Sale Invoices", ur: "سیل انوائسز" },
    ],
  },

  "/barcode-labels": {
    key: "/barcode-labels",
    category: "items",
    title: {
      en: "Barcode Studio & Label Printing",
      ur: "بارکوڈ اسٹوڈیو اور اسٹیکر پرنٹنگ",
    },
    section: {
      en: "Items & Masters",
      ur: "آئٹمز اور ماسٹر ریکارڈ",
    },
    summary: {
      en: "Design and print custom barcode labels and price stickers for thermal roll printers or A4 sticker sheets. Supports product name, store name, retail price, batch/expiry, and SKU barcodes.",
      ur: "اپنی پروڈکٹس کے لیے بارکوڈ اسٹیکرز اور قیمت کے لیبل ڈیزائن اور پرنٹ کریں۔ یہ تھرمل لیبل پرنٹر اور A4 اسٹیکر شیٹ دونوں کو سپورٹ کرتا ہے۔",
    },
    features: {
      en: [
        "Add products individually or load all items from a Purchase Invoice in one click to print stickers for newly arrived stock.",
        "Customize label dimensions, paper format (Thermal Roll vs. A4 Grid), font sizes, and visible fields (Store Name, Product Name, Price, Batch, Expiry).",
        "Live interactive preview before sending to your barcode printer.",
      ],
      ur: [
        "پروڈکٹس کو الگ الگ منتخب کریں یا کسی پرچیز بل (Purchase Invoice) کے تمام آئٹمز کے اسٹیکر ایک ہی کلک میں لوڈ کریں۔",
        "اسٹیکر کا سائز، تھرمل رول یا A4 شیٹ، اور اسٹیکر پر نظر آنے والی معلومات (دکان کا نام، قیمت، ایکسپائری) اپنی مرضی سے سیٹ کریں۔",
        "پرنٹ کرنے سے پہلے اسٹیکر کا لائیو ڈیزائن (Preview) دیکھیں۔",
      ],
    },
    steps: {
      en: [
        "Search and add products (or import lines from a recent Purchase Invoice).",
        "Set the label count for each item (e.g., match received quantity).",
        "Choose your label template/size and toggle which details to show on the sticker.",
        "Click Print Labels to open the print-ready barcode layout.",
      ],
      ur: [
        "پروڈکٹ سرچ کر کے شامل کریں یا پرچیز انوائس سے آئٹمز لوڈ کریں۔",
        "ہر آئٹم کے جتنے اسٹیکر پرنٹ کرنے ہیں ان کی تعداد لکھیں۔",
        "اسٹیکر کا سائز منتخب کریں اور Print بٹن پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Generates scannable barcode stickers that work seamlessly with the Barcode POS terminal.",
      ur: "اس سے پرنٹ ہونے والے بارکوڈ اسٹیکرز POS کاؤنٹر پر فوری اسکیننگ کے کام آتے ہیں۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/sale-invoices/pos", en: "Barcode POS Terminal", ur: "بارکوڈ POS ٹرمینل" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
    ],
  },

  // ============================================================================
  // 3. INVOICES, POS & PROCUREMENT
  // ============================================================================
  "/sale-invoices/pos": {
    key: "/sale-invoices/pos",
    category: "invoices",
    title: {
      en: "High-Speed Barcode POS Terminal",
      ur: "تیز رفتار بارکوڈ POS کاؤنٹر ٹرمینل",
    },
    section: {
      en: "Invoices & Counter Billing",
      ur: "بلنگ اور پوائنٹ آف سیل",
    },
    summary: {
      en: "Hands-free, zero-click counter checkout terminal designed for pharmacies, supermarkets, and retail stores. Scan barcodes continuously, auto-select batches via FEFO, find generic salt substitutes, park/hold customer carts, and accept Cash, Card, Mobile Wallet, or Split payments.",
      ur: "یہ تیز ترین کاؤنٹر بلنگ کی اسکرین ہے۔ بارکوڈ اسکینر سے آئٹمز اسکین کرتے جائیں، سسٹم خودکار طور پر FEFO (پہلے ایکسپائر ہونے والا بیچ) منتخب کرے گا۔ یہاں آپ متبادل دوائی (Substitute) تلاش کر سکتے ہیں، گاہک کا بل ہولڈ (Park) کر سکتے ہیں، اور نقد، کارڈ، ایزی پیسہ/جاز کیش یا ملا جلا (Split) بل وصول کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Hands-Free Hardware Barcode Listener: simply scan any item barcode—if already in cart, its quantity increments automatically with audio feedback.",
        "Automatic FEFO Batch Picking: selects the earliest-expiring non-expired batch automatically, with dropdown to switch batches.",
        "One-Click Generic/Salt Substitute Finder: if an item is out of stock, click 'Substitutes' to replace it with an identical-salt product.",
        "Park / Hold Carts (F8): pause a customer's cart to serve the next person in line, then resume anytime.",
        "Flexible Tender: Cash (with live change calculation), Card, Mobile Wallet (JazzCash/EasyPaisa), Customer Credit redemption, and Split Tender.",
      ],
      ur: [
        "آٹو بارکوڈ اسکیننگ: بغیر کلک کیے بارکوڈ اسکین کریں، آئٹم خودکار بل میں شامل ہو جائے گا اور آواز (Beep) سے تصدیق ہو گی۔",
        "فیفو (FEFO) بیچ سلیکشن: جو بیچ پہلے ایکسپائر ہو رہا ہو سسٹم خودکار طور پر اسے منتخب کرتا ہے۔",
        "متبادل دوائی (Substitutes): اگر کوئی دوائی ختم ہو تو 'Substitutes' بٹن دبا کر اسی فارمولے (Salt) کی دوسری دستیاب دوائی منتخب کریں۔",
        "بل ہولڈ کریں (Park Cart - F8): اگر گاہک مزید چیزیں لے رہا ہو تو بل کو عارضی طور پر ہولڈ کریں اور دوسرے گاہک کو فارغ کریں۔",
        "ادائیگی کے تمام طریقے: نقد (بقایا رقم کے خودکار حساب کے ساتھ)، بینک کارڈ، موبائل والٹ (JazzCash/EasyPaisa) یا Split پیمنٹ۔",
      ],
    },
    steps: {
      en: [
        "Scan product barcodes directly or press F3 to search products by name.",
        "Adjust quantities, batch selection, or line discount % if needed.",
        "Select Customer (defaults to Walk-In Customer) and choose Payment Method (Cash, Card, Mobile Wallet, or Split).",
        "Enter Cash Given to see Change Due, then click Complete Sale (or press F9 / Ctrl+Enter) to print receipt.",
      ],
      ur: [
        "بارکوڈ اسکینر سے آئٹم اسکین کریں یا نام سے تلاش کرنے کے لیے F3 دبائیں۔",
        "ضرورت ہو تو مقدار، بیچ یا ڈسکاؤنٹ تبدیل کریں۔",
        "گاہک منتخب کریں (عام گاہک کے لیے Walk-In خودکار سلیکٹ ہوتا ہے) اور ادائیگی کا طریقہ (Cash/Card/Wallet) چنیں۔",
        "گاہک کی دی گئی رقم لکھیں تاکہ بقایا (Change) نظر آ جائے، اور بل مکمل کرنے کے لیے F9 یا Complete Sale دبائیں۔",
      ],
    },
    impacts: {
      en: "Deducts batch & product stock immediately, posts revenue to Cash Drawer or selected Bank/Wallet account, and generates a thermal/A4 sale receipt.",
      ur: "بل مکمل ہوتے ہی اسٹاک اور بیچ سے مقدار کم ہو جاتی ہے، رقم کیش ڈراور یا بینک اکاؤنٹ میں جمع ہو جاتی ہے اور پرنٹ رسید تیار ہو جاتی ہے۔",
    },
    shortcuts: [
      { keys: ["F2"], en: "Focus Manual Barcode / SKU Input", ur: "مینوئل بارکوڈ خانے میں جائیں" },
      { keys: ["F3"], en: "Focus Product Name Search", ur: "نام سے پروڈکٹ سرچ کریں" },
      { keys: ["F8"], en: "Park / Hold Current Cart", ur: "موجودہ بل ہولڈ (Park) کریں" },
      { keys: ["F9"], en: "Complete Checkout & Print", ur: "بل محفوظ اور پرنٹ کریں" },
    ],
    faqs: [
      {
        q: { en: "How do I switch from Barcode POS to the detailed Sale Invoice form?", ur: "بارکوڈ POS سے تفصیلی سیل انوائس فارم پر کیسے جائیں؟" },
        a: {
          en: "Click the 'Standard Form' button in the top-right header of the POS screen to open the full Retail Sale Invoice form.",
          ur: "اوپر دائیں کونے میں 'Standard Form' کے بٹن پر کلک کریں تو مکمل ریٹیل سیل انوائس فارم کھل جائے گا۔",
        },
      },
    ],
    relatedRoutes: [
      { path: "/sale-invoices/create/retail", en: "Standard Retail Invoice", ur: "معیاری ریٹیل سیل بل" },
      { path: "/sale-invoices", en: "All Sale Invoices", ur: "تمام سیل بلوں کی فہرست" },
      { path: "/cash-drawer", en: "Cash Drawer Shift", ur: "کیش ڈراور شفٹ" },
    ],
  },

  "/sale-invoices": {
    key: "/sale-invoices",
    category: "invoices",
    title: {
      en: "Sale Invoices Register",
      ur: "سیل انوائسز (فروخت کے بلوں کا ریکارڈ)",
    },
    section: {
      en: "Invoices",
      ur: "انوائسز اور بلنگ",
    },
    summary: {
      en: "Complete register of all posted retail and wholesale sale invoices. Search by invoice number, customer, date, or status; print thermal/A4 receipts, share PDF/WhatsApp invoices, record payments, or void/edit bills.",
      ur: "یہاں آپ کی دکان کے تمام سیل بلوں (ریٹیل اور ہول سیل) کا مکمل ریکارڈ موجود ہوتا ہے۔ آپ بل نمبر، گاہک کے نام یا تاریخ سے کوئی بھی بل تلاش کر سکتے ہیں، دوبارہ پرنٹ نکال سکتے ہیں، واٹس ایپ/ای میل پر شیئر کر سکتے ہیں یا بقایا وصولی درج کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Filter & Search by Invoice/Posted Number, Customer Name, Sale Type (Retail/Wholesale), Payment Status, and Date Range.",
        "One-click Print (Thermal or A4), PDF Download, Delivery Challan, and WhatsApp/Email document sharing.",
        "View Audit History, Record Customer Payment directly against an unpaid/credit invoice, or Void an invoice with reason.",
      ],
      ur: [
        "بل نمبر، گاہک، تاریخ یا ادائیگی کی صورتحال (Paid/Unpaid) کے لحاظ سے فوری فلٹر اور سرچ۔",
        "تھرمل یا A4 پرنٹ نکالنے، PDF ڈاؤن لوڈ کرنے اور واٹس ایپ پر بل بھیجنے کی سہولت۔",
        "ادھار بلوں کی وصولی (Record Payment) درج کرنے، بل کی ہسٹری دیکھنے یا بل کینسل (Void) کرنے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Retail Invoice', '+ Wholesale Invoice', or 'Barcode POS' at the top to create a new bill.",
        "Use the search bar to locate any past invoice by invoice # or customer.",
        "Click View (Eye icon) to open and print the invoice, or Edit to modify items.",
      ],
      ur: [
        "نیا بل بنانے کے لیے اوپر '+ Retail Invoice' یا 'Barcode POS' پر کلک کریں۔",
        "پرانا بل تلاش کرنے کے لیے سرچ باکس میں بل نمبر یا گاہک کا نام لکھیں۔",
        "بل دیکھنے یا پرنٹ کرنے کے لیے View آئیکن پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Central hub for managing customer billing, reprints, credit collections, and invoice audit trails.",
      ur: "تمام فروخت کے بلوں، دوبارہ پرنٹنگ اور گاہکوں سے وصولیوں کا مرکزی ریکارڈ۔",
    },
    shortcuts: [
      { keys: ["Alt", "2"], en: "New Retail Sale Invoice", ur: "نیا ریٹیل بل بنائیں" },
      { keys: ["Alt", "W"], en: "New Wholesale Invoice", ur: "نیا ہول سیل بل بنائیں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/sale-invoices/create/retail", en: "Create Retail Invoice", ur: "نیا ریٹیل بل" },
      { path: "/sale-invoices/pos", en: "Barcode POS", ur: "بارکوڈ POS" },
      { path: "/sale-returns", en: "Sale Returns", ur: "سیل ریٹرن (واپسی)" },
    ],
  },

  "/wholesale-invoices": {
    key: "/wholesale-invoices",
    category: "invoices",
    title: {
      en: "Wholesale (B2B) Sale Invoices",
      ur: "ہول سیل (تھوک فروخت) کے بل",
    },
    section: {
      en: "Invoices",
      ur: "انوائسز اور بلنگ",
    },
    summary: {
      en: "Dedicated view of B2B / Wholesale sale invoices with credit terms, due dates, pack/unit wholesale pricing, and delivery challan printing.",
      ur: "ہول سیل گاہکوں کو کیے گئے تمام بلوں کا ریکارڈ۔ اس میں کریڈٹ لمٹ، ادائیگی کی مقررہ تاریخ (Due Date)، ڈلیوری چالان اور تھوک ریٹس شامل ہوتے ہیں۔",
    },
    features: {
      en: [
        "Filtered view showing wholesale distribution invoices and credit receivables.",
        "Print A4 Invoices, Delivery Challans, and share statements with B2B clients.",
        "Track partial payments, credit aging, and salesman commissions.",
      ],
      ur: [
        "صرف ہول سیل بلوں اور ادھار کھاتوں کی الگ فہرست۔",
        "بڑے بل (A4)، ڈلیوری چالان اور واٹس ایپ پی ڈی ایف شیئرنگ۔",
        "اقساط میں وصولی اور سیلز مین کمیشن کی ٹریکنگ۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Create Wholesale Invoice' (or press Alt+W) to bill a wholesale client.",
        "Search or filter existing wholesale bills to print Delivery Challans or record payments.",
      ],
      ur: [
        "نیا ہول سیل بل بنانے کے لیے '+ Create Wholesale Invoice' یا Alt+W دبائیں۔",
        "کسی بھی بل کا ڈلیوری چالان پرنٹ کرنے یا وصولی درج کرنے کے لیے فہرست سے بل منتخب کریں۔",
      ],
    },
    impacts: {
      en: "Posts B2B sales to Customer Ledgers, deducts inventory, and tracks due dates for the Outstanding Aging report.",
      ur: "اسٹاک کم کرتا ہے، ہول سیل گاہک کے کھاتے میں رقم درج کرتا ہے اور ادھار کی مدت (Aging) ٹریک کرتا ہے۔",
    },
    shortcuts: [
      { keys: ["Alt", "W"], en: "Create Wholesale Invoice", ur: "نیا ہول سیل بل کھولیں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/sale-invoices/create/wholesale", en: "New Wholesale Invoice", ur: "نیا ہول سیل بل بنائیں" },
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
    ],
  },

  "/sale-invoices/create/retail": {
    key: "/sale-invoices/create/retail",
    category: "invoices",
    title: {
      en: "Create Retail Sale Invoice",
      ur: "نیا ریٹیل سیل بل (انوائس) بنائیں",
    },
    section: {
      en: "Invoices",
      ur: "انوائسز اور بلنگ",
    },
    summary: {
      en: "Full-featured retail billing form with keyboard-driven line entry, batch/expiry selection, doctor/patient reference fields, discount/credit override controls, auto-saved drafts, and instant thermal/A4 printing.",
      ur: "ریٹیل بلنگ کا مکمل فارم جس میں آپ کی بورڈ کی مدد سے تیزی سے آئٹمز شامل کر سکتے ہیں، بیچ اور ایکسپائری منتخب کر سکتے ہیں، ڈاکٹر یا مریض کا نام لکھ سکتے ہیں، ڈسکاؤنٹ دے سکتے ہیں اور بل کو ڈرافٹ (Hold) یا پرنٹ کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Keyboard-first line entry: search product, pick batch, enter quantity and discount % using Enter key progression.",
        "Auto-Save Drafts & Hold/Recall (Alt+H): never lose an in-progress invoice even if the browser refreshes.",
        "Substitute Medicine Finder: replace out-of-stock items with matching generic formulation.",
        "Manager Override Modals for Credit Limit breaches, high discounts, or near-expiry batch warnings.",
        "Select Payment Method (Cash Drawer, Bank Account, Mobile Wallet) or post on Credit (Debit invoice).",
      ],
      ur: [
        "کی بورڈ سے تیز ترین انٹری: پروڈکٹ منتخب کریں، بیچ چنیں، مقدار لکھیں اور Enter دبا کر اگلی لائن پر جائیں۔",
        "آٹو سیو ڈرافٹ اور ہولڈ بل (Alt+H): بل بناتے وقت خودکار محفوظ رہتا ہے اور آپ اسے ہولڈ کر کے بعد میں دوبارہ کھول سکتے ہیں۔",
        "متبادل دوائی (Substitutes) تلاش کرنے اور منیجر اوور رائیڈ (کریڈٹ لمٹ یا زیادہ ڈسکاؤنٹ) کی سہولت۔",
        "نقد (کیش ڈراور)، بینک/والٹ یا ادھار (Credit) پر بل بنانے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Select Customer (or keep Walk-in Customer) and set Invoice Type (Cash/Debit).",
        "Search and select a Product in the first row, verify Batch/Expiry, and enter Quantity.",
        "Apply any item-level or invoice-level discount and enter Total Received / Cash Given.",
        "Press Ctrl+Enter (or F9 / Save button) to finalize and print the invoice.",
      ],
      ur: [
        "گاہک منتخب کریں اور بل کی قسم (نقد یا ادھار) طے کریں۔",
        "پہلی لائن میں پروڈکٹ سرچ کریں، بیچ چیک کریں اور مقدار (Quantity) درج کریں۔",
        "اگر کوئی ڈسکاؤنٹ دینا ہو تو درج کریں اور وصول شدہ رقم لکھیں۔",
        "بل مکمل اور پرنٹ کرنے کے لیے Ctrl+Enter یا Save بٹن دبائیں۔",
      ],
    },
    impacts: {
      en: "Deducts stock from the selected batch, updates Customer Ledger & Cash Drawer/Bank Account, and posts Double-Entry GL revenue & COGS entries.",
      ur: "منتخب بیچ سے اسٹاک کم کرتا ہے، کسٹمر کھاتے اور کیش ڈراور/بینک کو اپڈیٹ کرتا ہے اور جنرل لیجر میں سیل اور لاگت (COGS) کا اندراج کرتا ہے۔",
    },
    shortcuts: [
      { keys: ["Ctrl", "Enter"], en: "Finalize & Save Invoice", ur: "بل محفوظ اور مکمل کریں" },
      { keys: ["Alt", "C"], en: "Focus Customer Selector", ur: "گاہک منتخب کرنے والے خانے میں جائیں" },
      { keys: ["Alt", "N"], en: "Add New Item Row", ur: "نئی پروڈکٹ لائن شامل کریں" },
      { keys: ["Alt", "H"], en: "Hold / Recall Draft Invoices", ur: "بل ہولڈ کریں یا ہولڈ شدہ بل کھولیں" },
      { keys: ["Alt", "M"], en: "Focus Payment Method", ur: "ادائیگی کا طریقہ منتخب کریں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/sale-invoices/pos", en: "Switch to Barcode POS", ur: "بارکوڈ POS پر جائیں" },
      { path: "/sale-invoices", en: "Sale Invoices List", ur: "تمام سیل بل" },
    ],
  },

  "/sale-invoices/create/wholesale": {
    key: "/sale-invoices/create/wholesale",
    category: "invoices",
    title: {
      en: "Create Wholesale (B2B) Sale Invoice",
      ur: "نیا ہول سیل (تھوک) سیل بل بنائیں",
    },
    section: {
      en: "Invoices",
      ur: "انوائسز اور بلنگ",
    },
    summary: {
      en: "Specialized B2B wholesale billing form supporting Pack vs. Unit wholesale pricing modes, bonus units, credit due dates, credit limit enforcement, and delivery challan generation.",
      ur: "ہول سیل گاہکوں اور میڈیکل سٹورز کو مال فروخت کرنے کا خصوصی فارم۔ اس میں پیک یا یونٹ کے حساب سے ہول سیل ریٹ، بونس یونٹس، ادائیگی کی مقررہ تاریخ (Due Date) اور کریڈٹ لمٹ کنٹرول شامل ہے۔",
    },
    features: {
      en: [
        "Pack or Unit Wholesale Mode: bill in full packs/cartons or individual units at wholesale rates.",
        "Customer Credit Limit & Aging Check: warns automatically if the customer exceeds their approved credit limit.",
        "Due Date & Payment Terms tracking for the Outstanding Aging & Overdue Work Queue reports.",
      ],
      ur: [
        "پیک یا یونٹ ہول سیل موڈ: پورے ڈبے/پیک یا کھلے یونٹس کے حساب سے تھوک بل بنائیں۔",
        "کریڈٹ لمٹ چیک: اگر گاہک کا بقایا مقررہ حد سے بڑھ جائے تو سسٹم فوری مطلع کرتا ہے۔",
        "واجب الادا تاریخ (Due Date) درج کریں تاکہ بقایاجات کی رپورٹ میں یاد دہانی مل سکے۔",
      ],
    },
    steps: {
      en: [
        "Select the Wholesale Customer and set the payment Due Date.",
        "Choose Wholesale Pricing Mode (Unit or Pack) and add product lines.",
        "Enter amount received (if partial/cash) or leave 0 for full credit billing, then press Ctrl+Enter to save.",
      ],
      ur: [
        "ہول سیل گاہک منتخب کریں اور ادائیگی کی تاریخ (Due Date) درج کریں۔",
        "پروڈکٹس شامل کریں، بیچ اور مقدار درج کریں۔",
        "وصول شدہ رقم لکھیں (یا مکمل ادھار کے لیے 0 رہنے دیں) اور Ctrl+Enter سے محفوظ کریں۔",
      ],
    },
    impacts: {
      en: "Deducts batch inventory, posts receivable balance to Customer Ledger, and calculates salesperson commission if applicable.",
      ur: "اسٹاک کم کرتا ہے، گاہک کے کھاتے میں ادھار جمع کرتا ہے اور سیلز مین کا کمیشن ریکارڈ کرتا ہے۔",
    },
    shortcuts: [
      { keys: ["Ctrl", "Enter"], en: "Save Wholesale Invoice", ur: "ہول سیل بل محفوظ کریں" },
      { keys: ["Alt", "C"], en: "Focus Customer Search", ur: "گاہک تلاش کریں" },
      { keys: ["Alt", "R"], en: "Toggle Pricing Mode", ur: "ریٹ موڈ تبدیل کریں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/wholesale-invoices", en: "Wholesale Invoices List", ur: "ہول سیل بلوں کی فہرست" },
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
    ],
  },

  "/sale-invoices/:id": {
    key: "/sale-invoices/:id",
    category: "invoices",
    title: {
      en: "Sale Invoice Details & Print Preview",
      ur: "سیل انوائس کی تفصیل اور پرنٹ",
    },
    section: {
      en: "Invoices",
      ur: "انوائسز اور بلنگ",
    },
    summary: {
      en: "Inspect a completed sale invoice, print Thermal or A4 receipts, generate a Delivery Challan, share via WhatsApp/Email, or view payment history.",
      ur: "مکمل شدہ سیل بل کی تفصیل دیکھیں، تھرمل یا A4 پرنٹ نکالیں، ڈلیوری چالان پرنٹ کریں یا واٹس ایپ پر شیئر کریں۔",
    },
    features: {
      en: [
        "Press Alt+P to print the invoice immediately using your configured printer template.",
        "Switch between Thermal Receipt and A4 Invoice/Delivery Challan layouts.",
        "Share PDF link via WhatsApp or Email.",
      ],
      ur: [
        "بل کا فوری پرنٹ نکالنے کے لیے Alt+P دبائیں۔",
        "تھرمل رسید، A4 بل یا ڈلیوری چالان کے ڈیزائن منتخب کریں۔",
        "واٹس ایپ یا ای میل کے ذریعے گاہک کو بل بھیجیں۔",
      ],
    },
    steps: {
      en: [
        "Review the invoice line items, totals, and customer balance.",
        "Click Print (or press Alt+P) to send to your thermal or laser printer.",
      ],
      ur: [
        "بل کے آئٹمز اور کل رقم کا جائزہ لیں۔",
        "پرنٹ نکالنے کے لیے Print بٹن یا Alt+P دبائیں۔",
      ],
    },
    impacts: { en: "Read and print view for an existing sale invoice.", ur: "محفوظ شدہ بل دیکھنے اور پرنٹ کرنے کی اسکرین۔" },
    shortcuts: [
      { keys: ["Alt", "P"], en: "Print Invoice Immediately", ur: "بل فوری پرنٹ کریں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/sale-invoices", en: "All Sale Invoices", ur: "تمام سیل بل" },
      { path: "/sale-returns/create", en: "Create Sale Return", ur: "سیل ریٹرن بنائیں" },
    ],
  },

  "/sale-invoices/:id/edit": {
    key: "/sale-invoices/:id/edit",
    category: "invoices",
    title: { en: "Edit Sale Invoice", ur: "سیل انوائس میں ترمیم کریں" },
    section: { en: "Invoices", ur: "انوائسز اور بلنگ" },
    summary: {
      en: "Modify items, quantities, prices, or payment details on an existing sale invoice with automatic stock and ledger reconciliation.",
      ur: "پہلے سے بنے ہوئے سیل بل کے آئٹمز، مقدار یا قیمت میں تبدیلی کریں۔ سسٹم خودکار طور پر اسٹاک اور کھاتے کا حساب برابر کر دے گا۔",
    },
    features: {
      en: ["Automatically reverses old stock/ledger impact and applies the updated invoice lines.", "Full audit log of modifications."],
      ur: ["بل میں تبدیلی کرنے پر پرانا اسٹاک اور کھاتہ خودکار ایڈجسٹ ہو جاتا ہے۔", "تبدیلی کا مکمل آڈٹ ریکارڈ محفوظ رہتا ہے۔"],
    },
    steps: {
      en: ["Update the required line items or quantities.", "Press Ctrl+Enter or Save to commit the updated invoice."],
      ur: ["مطلوبہ آئٹمز یا مقدار تبدیل کریں۔", "تبدیلیاں محفوظ کرنے کے لیے Ctrl+Enter یا Save دبائیں۔"],
    },
    impacts: { en: "Reconciles product batch stock, customer ledger, and GL postings.", ur: "اسٹاک، بیچ اور کسٹمر کھاتے کو نئے بل کے مطابق اپڈیٹ کرتا ہے۔" },
    shortcuts: [{ keys: ["Ctrl", "Enter"], en: "Save Updated Invoice", ur: "ترمیم شدہ بل محفوظ کریں" }],
    faqs: [],
    relatedRoutes: [{ path: "/sale-invoices", en: "Sale Invoices", ur: "سیل انوائسز" }],
  },

  "/purchase-invoices": {
    key: "/purchase-invoices",
    category: "invoices",
    title: {
      en: "Purchase Invoices (GRN & Supplier Bills)",
      ur: "پرچیز انوائسز (خریداری کے بل)",
    },
    section: {
      en: "Invoices & Procurement",
      ur: "انوائسز اور خریداری",
    },
    summary: {
      en: "Manage all supplier purchase bills and Goods Received Notes (GRNs). View inward stock bills, supplier invoice numbers, paid/payable amounts, print barcode stickers for received items, or record supplier payments.",
      ur: "سپلائرز اور ڈسٹری بیوٹرز سے خریدے گئے تمام مال کے بلوں کا ریکارڈ۔ یہاں سے آپ نئے پرچیز بل داخل کر سکتے ہیں، موصول شدہ مال کے بارکوڈ اسٹیکرز پرنٹ کر سکتے ہیں اور سپلائرز کو ادائیگی کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Search by Posted Number, Supplier Invoice #, Supplier Name, or Date Range.",
        "View item lines, pack/unit costs, bonus quantities, taxes, and supplier payable status.",
        "Print A4 Purchase Vouchers, share via WhatsApp/Email, or send items directly to Barcode Studio.",
      ],
      ur: [
        "بل نمبر، سپلائر انوائس نمبر، سپلائر کے نام یا تاریخ سے بل تلاش کریں۔",
        "خریدے گئے آئٹمز، پیک ریٹ، بونس یونٹس، ٹیکس اور بقایا رقم کی تفصیل دیکھیں۔",
        "پرچیز بل پرنٹ کریں یا نئے آنے والے مال کے بارکوڈ لیبل نکالیں۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Create Purchase Invoice' (or press Alt+1) when new stock arrives from a supplier.",
        "Locate any existing bill in the table to view details, edit, or record a supplier payment.",
      ],
      ur: [
        "سپلائر سے نیا مال آنے پر '+ Create Purchase Invoice' (یا Alt+1) دبا کر بل چڑھائیں۔",
        "پرانے بل کی تفصیل دیکھنے یا ادائیگی درج کرنے کے لیے فہرست سے بل منتخب کریں۔",
      ],
    },
    impacts: {
      en: "Purchase invoices are the primary source of inward batch stock, cost price updates, and supplier payable balances.",
      ur: "پرچیز بلوں سے دکان کا اسٹاک بڑھتا ہے، نئے بیچ اور ایکسپائری درج ہوتے ہیں اور سپلائر کا کھاتہ اپڈیٹ ہوتا ہے۔",
    },
    shortcuts: [
      { keys: ["Alt", "1"], en: "New Purchase Invoice", ur: "نیا پرچیز بل بنائیں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/purchase-invoices/create", en: "Create Purchase Invoice", ur: "نیا پرچیز بل بنائیں" },
      { path: "/purchase-orders", en: "Purchase Orders", ur: "پرچیز آرڈرز" },
      { path: "/supplier-ledger", en: "Supplier Ledger", ur: "سپلائر کھاتہ" },
    ],
  },

  "/purchase-invoices/create": {
    key: "/purchase-invoices/create",
    category: "invoices",
    title: {
      en: "Create Purchase Invoice (Stock Inward)",
      ur: "نیا پرچیز بل درج کریں (اسٹاک انٹری)",
    },
    section: {
      en: "Invoices & Procurement",
      ur: "انوائسز اور خریداری",
    },
    summary: {
      en: "Enter supplier bills to add received inventory into stock. Supports importing items from a Purchase Order, entering Batch Numbers & Expiry Dates, Pack/Unit quantities, Bonus units, Trade Discounts, GST/Withholding Tax, and automatic Retail/Margin calculation.",
      ur: "سپلائر سے آنے والے مال کا بل سافٹ ویئر میں چڑھائیں۔ یہاں آپ پرچیز آرڈر سے آئٹمز لوڈ کر سکتے ہیں، ہر آئٹم کا بیچ نمبر، ایکسپائری تاریخ، ڈبے/پیک کی تعداد، بونس یونٹس، ڈسکاؤنٹ اور ٹیکس درج کر کے اسٹاک اور قیمتیں اپڈیٹ کر سکتے ہیں۔",
    },
    features: {
      en: [
        "One-Click Purchase Order Import: load ordered items from an open PO to avoid re-typing.",
        "Batch & Expiry Entry per row: creates or updates product batches with exact expiry dates and MRP.",
        "Pack & Bonus Math: enter Purchased Packs + Bonus Units + Discount % to auto-calculate net unit cost and retail margin.",
        "Drag-and-drop row reordering and auto-saved purchase drafts.",
      ],
      ur: [
        "پرچیز آرڈر امپورٹ: پہلے سے دیے گئے آرڈر (PO) کے آئٹمز ایک کلک سے بل میں لوڈ کریں۔",
        "بیچ اور ایکسپائری اندراج: ہر آئٹم کا بیچ نمبر اور ایکسپائری تاریخ درج کریں جو خودکار طور پر اسٹاک میں شامل ہو جائے گی۔",
        "پیک اور بونس کا حساب: خریدے گئے پیک، بونس یونٹس اور ڈسکاؤنٹ لکھنے سے فی یونٹ لاگت اور منافع خودکار نکل آتا ہے۔",
        "ڈرافٹ سیونگ: بل بناتے وقت کام خودکار محفوظ رہتا ہے۔",
      ],
    },
    steps: {
      en: [
        "Select the Supplier (Alt+S) and enter the Supplier's Invoice Number and Date.",
        "Add products row by row (or load from a Purchase Order), entering Batch #, Expiry, Packs/Units, Purchase Price, Bonus, and Sale Price.",
        "Enter any Paid Amount (and select payment account) or leave as payable on credit.",
        "Press Ctrl+Enter (or Save) to post the purchase bill and add stock.",
      ],
      ur: [
        "سپلائر منتخب کریں (Alt+S) اور سپلائر کا بل نمبر اور تاریخ لکھیں۔",
        "پروڈکٹس شامل کریں اور ہر لائن میں بیچ نمبر، ایکسپائری، پیک کی تعداد، قیمتِ خرید، بونس اور قیمتِ فروخت درج کریں۔",
        "اگر موقع پر کچھ رقم ادا کی ہے تو Paid خانے میں لکھیں ورنہ ادھار کھاتے کے لیے خالی چھوڑ دیں۔",
        "بل محفوظ کرنے اور اسٹاک بڑھانے کے لیے Ctrl+Enter یا Save دبائیں۔",
      ],
    },
    impacts: {
      en: "Increases product & batch stock, updates product purchase/sale prices, credits Supplier Ledger, and posts Inventory Asset & AP entries to the General Ledger.",
      ur: "اس سے پروڈکٹ اور بیچ کا اسٹاک فوری بڑھ جاتا ہے، نئی قیمتیں اپڈیٹ ہو جاتی ہیں، سپلائر کھاتے میں بل جمع ہو جاتا ہے اور جنرل لیجر میں اندراج ہو جاتا ہے۔",
    },
    shortcuts: [
      { keys: ["Ctrl", "Enter"], en: "Save Purchase Invoice", ur: "پرچیز بل محفوظ کریں" },
      { keys: ["Alt", "S"], en: "Focus Supplier Selector", ur: "سپلائر منتخب کریں" },
      { keys: ["Alt", "N"], en: "Add New Item Row", ur: "نئی آئٹم لائن شامل کریں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/purchase-invoices", en: "Purchase Invoices List", ur: "تمام پرچیز بل" },
      { path: "/barcode-labels", en: "Print Barcode Stickers", ur: "بارکوڈ اسٹیکرز پرنٹ کریں" },
    ],
  },

  "/purchase-invoices/:id": {
    key: "/purchase-invoices/:id",
    category: "invoices",
    title: { en: "Purchase Invoice Details", ur: "پرچیز بل کی تفصیل" },
    section: { en: "Invoices & Procurement", ur: "انوائسز اور خریداری" },
    summary: {
      en: "View complete line-item breakdown, batch numbers, expiry dates, bonus units, and payment status of a posted purchase invoice.",
      ur: "محفوظ شدہ خریداری کے بل کی مکمل تفصیل، بیچ نمبر، ایکسپائری، بونس اور ادائیگی کا ریکارڈ دیکھیں یا پرنٹ کریں۔",
    },
    features: {
      en: ["Print A4 Purchase Invoice voucher.", "Share PDF with supplier or accountant.", "Inspect batch and cost breakdown."],
      ur: ["پرچیز واؤچر پرنٹ کریں۔", "پی ڈی ایف شیئر کریں۔", "ہر آئٹم کی لاگت اور بیچ چیک کریں۔"],
    },
    steps: {
      en: ["Review the purchase lines and click Print or Share as needed."],
      ur: ["بل کی تفصیل چیک کریں اور ضرورت کے مطابق Print یا Share دبائیں۔"],
    },
    impacts: { en: "Read/print view of a posted purchase bill.", ur: "صرف دیکھنے اور پرنٹ کرنے کی اسکرین۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/purchase-invoices", en: "Purchase Invoices", ur: "پرچیز انوائسز" },
      { path: "/purchase-returns/create", en: "Create Purchase Return", ur: "پرچیز ریٹرن بنائیں" },
    ],
  },

  "/purchase-invoices/:id/edit": {
    key: "/purchase-invoices/:id/edit",
    category: "invoices",
    title: { en: "Edit Purchase Invoice", ur: "پرچیز بل میں ترمیم کریں" },
    section: { en: "Invoices & Procurement", ur: "انوائسز اور خریداری" },
    summary: {
      en: "Edit an existing purchase invoice to correct quantities, batch/expiry details, costs, or supplier billing info.",
      ur: "پہلے سے درج شدہ پرچیز بل کی مقدار، قیمت، بیچ یا ایکسپائری میں درستگی کریں۔",
    },
    features: {
      en: ["Automatically recalculates batch stock and supplier payable ledger upon saving."],
      ur: ["تبدیلی محفوظ کرنے پر اسٹاک، بیچ اور سپلائر کا کھاتہ خودکار طور پر نئے حساب سے ایڈجسٹ ہو جاتا ہے۔"],
    },
    steps: {
      en: ["Adjust the necessary rows and press Ctrl+Enter or Save."],
      ur: ["مطلوبہ تبدیلی کریں اور Save بٹن دبائیں۔"],
    },
    impacts: { en: "Updates inward stock, batches, and supplier ledger balance.", ur: "اسٹاک اور سپلائر کھاتے کو اپڈیٹ کرتا ہے۔" },
    shortcuts: [{ keys: ["Ctrl", "Enter"], en: "Save Changes", ur: "تبدیلیاں محفوظ کریں" }],
    faqs: [],
    relatedRoutes: [{ path: "/purchase-invoices", en: "Purchase Invoices", ur: "پرچیز انوائسز" }],
  },

  "/purchase-orders": {
    key: "/purchase-orders",
    category: "invoices",
    title: {
      en: "Purchase Orders (PO) Management",
      ur: "پرچیز آرڈرز (مال منگوانے کے آرڈر)",
    },
    section: {
      en: "Invoices & Procurement",
      ur: "انوائسز اور خریداری",
    },
    summary: {
      en: "Create, track, print, and share formal Purchase Orders sent to suppliers. Track Ordered vs. Received vs. Remaining units as deliveries arrive.",
      ur: "سپلائرز کو نیا مال منگوانے کے لیے باقاعدہ پرچیز آرڈر (PO) بنائیں، پرنٹ کریں یا واٹس ایپ پر بھیجیں۔ جب مال آ جائے تو آرڈر کے مقابلے میں موصول شدہ اور بقایا مقدار ٹریک کریں۔",
    },
    features: {
      en: [
        "Create new Purchase Orders with Pack quantities, expected delivery dates, and expected bonus/discounts.",
        "Automatic status tracking: Ordered → Partially Received → Received.",
        "Share PO via WhatsApp/Email or download PDF to send to supplier order bookers.",
        "Direct link to Smart Reorder Forecast to auto-generate POs from sales velocity and low stock.",
      ],
      ur: [
        "سپلائر کے لیے نیا پرچیز آرڈر بنائیں جس میں مطلوبہ ڈبے/پیک اور متوقع ڈلیوری تاریخ درج ہو۔",
        "آرڈر کی صورتحال خودکار اپڈیٹ ہوتی ہے (Ordered، Partially Received، Received)۔",
        "آرڈر بکر کو واٹس ایپ یا پی ڈی ایف کے ذریعے فوری آرڈر بھیجیں۔",
        "Smart Reorder Forecast کی مدد سے کم اسٹاک اور سیل کی رفتار کے مطابق خودکار آرڈر تیار کریں۔",
      ],
    },
    steps: {
      en: [
        "Click '+ New Purchase Order' or 'Smart Reorder Forecast' to draft an order.",
        "Select Supplier, add items and ordered packs, and click Save.",
        "Share the PO with your vendor; when goods arrive, convert/import it inside Create Purchase Invoice.",
      ],
      ur: [
        "نیا آرڈر بنانے کے لیے '+ New Purchase Order' یا 'Smart Reorder Forecast' پر کلک کریں۔",
        "سپلائر منتخب کریں، مطلوبہ آئٹمز اور پیک لکھ کر Save کریں۔",
        "آرڈر سپلائر کو بھیجیں اور مال آنے پر Purchase Invoice میں اسے لوڈ کر لیں۔",
      ],
    },
    impacts: {
      en: "Purchase Orders track procurement commitments without inflating on-hand stock until a Purchase Invoice is posted.",
      ur: "پرچیز آرڈر صرف آرڈر کا ریکارڈ رکھتا ہے؛ اصل اسٹاک اس وقت بڑھتا ہے جب مال آنے پر Purchase Invoice محفوظ کی جاتی ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/purchase-orders/forecast", en: "Smart Reorder Forecast", ur: "سمارٹ ری آرڈر فورکاسٹ" },
      { path: "/purchase-invoices/create", en: "Receive into Purchase Invoice", ur: "پرچیز بل میں مال وصول کریں" },
    ],
  },

  "/purchase-orders/forecast": {
    key: "/purchase-orders/forecast",
    category: "invoices",
    title: {
      en: "Smart Reorder Forecast & Auto-PO Generator",
      ur: "سمارٹ ری آرڈر فورکاسٹ (خودکار آرڈر پلانر)",
    },
    section: {
      en: "Invoices & Procurement",
      ur: "انوائسز اور خریداری",
    },
    summary: {
      en: "Intelligent procurement engine that analyzes historical sales velocity over a date range, subtracts current on-hand stock, includes pending customer demands, and calculates exactly how many packs you need to order for your target projection days.",
      ur: "یہ ایک ذہین سسٹم ہے جو پچھلے دنوں کی سیلز کی رفتار، موجودہ اسٹاک اور گاہکوں کی ڈیمانڈز کا تجزیہ کر کے خودکار حساب لگاتا ہے کہ اگلے چند دنوں کے لیے آپ کو کس کمپنی یا سپلائر سے کتنے پیک منگوانے چاہئیں۔",
    },
    features: {
      en: [
        "Sales Velocity Analysis: select historical Sales From–To dates and Target Projection Days (e.g. next 15 or 30 days) with Safety Buffer %.",
        "Filter by Brand/Company or Supplier to generate targeted orders for a specific distributor visit.",
        "Integrates Pending User Demands so requested out-of-stock items are never forgotten.",
        "One-click 'Create Purchase Order' converts your reviewed forecast table directly into an official PO.",
      ],
      ur: [
        "سیلز کی رفتار کے مطابق حساب: پچھلی تاریخوں کی سیل کی بنیاد پر اگلے 10، 15 یا 30 دنوں کے لیے درکار اسٹاک کا خودکار تخمینہ۔",
        "کسی خاص برانڈ (کمپنی) یا سپلائر کے لحاظ سے فلٹر کریں جب اس کمپنی کا آرڈر بکر دکان پر آئے۔",
        "گاہکوں کی لکھوائی گئی ڈیمانڈز (User Demands) کو بھی آرڈر میں شامل کرنے کی سہولت۔",
        "تجویز کردہ مقدار کو چیک کرنے کے بعد ایک کلک سے باقاعدہ Purchase Order بنائیں یا پرنٹ نکالیں۔",
      ],
    },
    steps: {
      en: [
        "Set the Historical Sales Date Range, Projection Days, and optional Brand or Supplier filter.",
        "Click Generate / Fetch Forecast to compute suggested order packs for each product.",
        "Review or adjust the suggested pack quantities in the table, then click Save as Purchase Order or Print.",
      ],
      ur: [
        "پچھلی سیلز کی تاریخ، اگلے مطلوبہ دن (Projection Days) اور برانڈ یا سپلائر منتخب کریں۔",
        "فورکاسٹ حاصل کرنے کے لیے Generate بٹن پر کلک کریں۔",
        "تجویز کردہ پیک کی تعداد دیکھیں، ضرورت ہو تو کم یا زیادہ کریں اور Purchase Order کے طور پر محفوظ کر لیں۔",
      ],
    },
    impacts: {
      en: "Eliminates guesswork and stockouts by turning real sales data into actionable supplier Purchase Orders.",
      ur: "اندازے کے بجائے اصل سیل ڈیٹا کی بنیاد پر آرڈر بنانے میں مدد دیتا ہے جس سے دکان میں اہم آئٹمز کبھی ختم نہیں ہوتے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/purchase-orders", en: "Purchase Orders List", ur: "پرچیز آرڈرز کی فہرست" },
      { path: "/user-demands", en: "Customer Demands", ur: "گاہکوں کی ڈیمانڈز" },
    ],
  },

  // ============================================================================
  // 4. RETURNS (SALE & PURCHASE RETURNS)
  // ============================================================================
  "/sale-returns": {
    key: "/sale-returns",
    category: "returns",
    title: {
      en: "Sale Returns (Customer Refunds & Credit Notes)",
      ur: "سیل ریٹرنز (گاہک سے مال کی واپسی)",
    },
    section: {
      en: "Returns",
      ur: "مال کی واپسی (Returns)",
    },
    summary: {
      en: "Track all items returned by customers. Returning items restores salable stock back into the batch, adjusts Customer Ledger or refunds cash from the Cash Drawer, and reverses revenue/COGS in accounting.",
      ur: "گاہکوں کی طرف سے واپس کیے گئے مال کا مکمل ریکارڈ۔ جب سیل ریٹرن ڈالی جاتی ہے تو واپس آنے والا مال دوبارہ اسٹاک اور بیچ میں جمع ہو جاتا ہے اور گاہک کو نقد رقم واپس ہو جاتی ہے یا اس کے ادھار کھاتے میں کمی ہو جاتی ہے۔",
    },
    features: {
      en: [
        "View all customer return vouchers with original invoice reference, returned units, and refund totals.",
        "Print Sale Return / Credit Note receipts or share PDF.",
        "Create linked returns against a specific Sale Invoice or standalone customer returns.",
      ],
      ur: [
        "تمام سیل ریٹرن بلوں کی فہرست مع اصل بل نمبر اور واپس کی گئی رقم۔",
        "ریٹرن رسید پرنٹ کرنے یا پی ڈی ایف شیئر کرنے کی سہولت۔",
        "اصل سیل بل کو سرچ کر کے اس کے آئٹمز واپس لینے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Create Sale Return' when a customer brings items back.",
        "Search existing return vouchers in the list to print a credit note or edit details.",
      ],
      ur: [
        "گاہک سے مال واپس لینے کے لیے '+ Create Sale Return' پر کلک کریں۔",
        "پرانی ریٹرن دیکھنے یا پرنٹ کرنے کے لیے فہرست میں تلاش کریں۔",
      ],
    },
    impacts: {
      en: "Increases on-hand product/batch stock and reduces net sales revenue and customer receivable balance.",
      ur: "اسٹاک واپس بڑھا دیتا ہے اور سیلز و گاہک کے بقایا بیلنس سے رقم کم کر دیتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/sale-returns/create", en: "Create Sale Return", ur: "نئی سیل ریٹرن بنائیں" },
      { path: "/sale-invoices", en: "Sale Invoices", ur: "سیل انوائسز" },
    ],
  },

  "/sale-returns/create": {
    key: "/sale-returns/create",
    category: "returns",
    title: {
      en: "Create Sale Return Voucher",
      ur: "نئی سیل ریٹرن (گاہک کی واپسی) درج کریں",
    },
    section: {
      en: "Returns",
      ur: "مال کی واپسی (Returns)",
    },
    summary: {
      en: "Process a customer return by searching their original Sale Invoice or selecting returned products manually, specifying return quantities, and choosing whether to refund Cash or credit their Customer Ledger.",
      ur: "گاہک کا پرانا سیل بل لوڈ کر کے یا براہِ راست پروڈکٹ منتخب کر کے واپس آنے والی مقدار درج کریں اور طے کریں کہ گاہک کو نقد رقم واپس کرنی ہے یا اس کے کھاتے میں ایڈجسٹ کرنی ہے۔",
    },
    features: {
      en: [
        "Load from Sale Invoice: pick the original bill to automatically populate sold batches, prices, and discounts.",
        "Enforces Expiry & Return Policy rules configured in Settings.",
        "Refund via Cash Drawer, Bank/Wallet, or Customer Credit Ledger.",
      ],
      ur: [
        "اصل سیل بل سے لوڈ کریں: بل نمبر سلیکٹ کرنے سے بیچ، قیمت اور ڈسکاؤنٹ خودکار آ جاتے ہیں۔",
        "نقد واپسی (Cash Refund) یا گاہک کے کھاتے (Credit Note) میں جمع کرنے کا آپشن۔",
      ],
    },
    steps: {
      en: [
        "Select Customer and optionally search the original Sale Invoice.",
        "Enter the Returned Quantity for each item being returned.",
        "Choose refund method and press Save to restock the items and issue the return.",
      ],
      ur: [
        "گاہک منتخب کریں اور اگر اصل بل نمبر معلوم ہو تو اسے سرچ کریں۔",
        "واپس آنے والے آئٹمز کی مقدار درج کریں۔",
        "رقوم کی واپسی کا طریقہ چن کر Save دبائیں۔",
      ],
    },
    impacts: {
      en: "Adds returned units back to batch inventory and posts a sales return reversal in the General Ledger.",
      ur: "واپس شدہ یونٹس دوبارہ بیچ اسٹاک میں شامل ہو جاتے ہیں اور اکاؤنٹس میں ریٹرن کا اندراج ہو جاتا ہے۔",
    },
    shortcuts: [{ keys: ["Ctrl", "Enter"], en: "Save Sale Return", ur: "سیل ریٹرن محفوظ کریں" }],
    faqs: [],
    relatedRoutes: [{ path: "/sale-returns", en: "Sale Returns List", ur: "سیل ریٹرن لسٹ" }],
  },

  "/sale-returns/:id/edit": {
    key: "/sale-returns/:id/edit",
    category: "returns",
    title: { en: "Edit Sale Return", ur: "سیل ریٹرن میں ترمیم" },
    section: { en: "Returns", ur: "مال کی واپسی" },
    summary: {
      en: "Update quantities or refund details on an existing sale return voucher.",
      ur: "پہلے سے درج شدہ سیل ریٹرن کی مقدار یا تفصیل میں تبدیلی کریں۔",
    },
    features: {
      en: ["Automatically reconciles batch stock and customer ledger balance."],
      ur: ["اسٹاک اور گاہک کے کھاتے کو خودکار طور پر نئے حساب سے برابر کرتا ہے۔"],
    },
    steps: {
      en: ["Adjust the return lines and click Save."],
      ur: ["مطلوبہ تبدیلی کر کے Save پر کلک کریں۔"],
    },
    impacts: { en: "Updates stock and customer ledger.", ur: "اسٹاک اور کھاتہ اپڈیٹ کرتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/sale-returns", en: "Sale Returns", ur: "سیل ریٹرنز" }],
  },

  "/purchase-returns": {
    key: "/purchase-returns",
    category: "returns",
    title: {
      en: "Purchase Returns (Supplier Debit Notes)",
      ur: "پرچیز ریٹرنز (سپلائر کو مال کی واپسی)",
    },
    section: {
      en: "Returns",
      ur: "مال کی واپسی (Returns)",
    },
    summary: {
      en: "Manage goods returned to suppliers/distributors (e.g., near-expiry batches, damaged stock, or excess items). Deducts stock and reduces your Supplier Payable balance.",
      ur: "سپلائر یا ڈسٹری بیوٹر کو واپس بھیجے گئے مال (مثلاً قریب ایکسپائری، خراب یا اضافی اسٹاک) کا ریکارڈ۔ اس سے اسٹاک کم ہو جاتا ہے اور سپلائر کو واجب الادا رقم (Payable) میں کمی ہو جاتی ہے۔",
    },
    features: {
      en: [
        "List of all supplier debit notes / purchase returns with supplier name, invoice link, and total return value.",
        "Print formal Debit Note / Purchase Return PDF to hand over to the supplier's deliveryman.",
      ],
      ur: [
        "سپلائرز کو واپس کیے گئے تمام بلوں کی فہرست مع رقم اور تفصیل۔",
        "سپلائر یا ڈسٹری بیوٹر کو دینے کے لیے باقاعدہ Debit Note پرنٹ کرنے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Create Purchase Return' to record items sent back to a vendor.",
        "Print or share the return voucher from the table actions.",
      ],
      ur: [
        "سپلائر کو مال واپس کرنے کے لیے '+ Create Purchase Return' پر کلک کریں۔",
        "فہرست سے کسی بھی ریٹرن کا پرنٹ نکالیں یا شیئر کریں۔",
      ],
    },
    impacts: {
      en: "Deducts returned units from batch inventory and debits the Supplier Ledger (reducing what you owe).",
      ur: "بیچ اسٹاک سے واپس کردہ مقدار کم کرتا ہے اور سپلائر کے کھاتے سے آپ کے ذمے واجب الادا رقم کم کرتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/purchase-returns/create", en: "Create Purchase Return", ur: "نئی پرچیز ریٹرن بنائیں" },
      { path: "/batch-expiry", en: "Near-Expiry Batches", ur: "قریب ایکسپائری بیچز" },
    ],
  },

  "/purchase-returns/create": {
    key: "/purchase-returns/create",
    category: "returns",
    title: {
      en: "Create Purchase Return (Debit Note)",
      ur: "نئی پرچیز ریٹرن (سپلائر واپسی) بنائیں",
    },
    section: {
      en: "Returns",
      ur: "مال کی واپسی (Returns)",
    },
    summary: {
      en: "Record inventory returned to a supplier against an original Purchase Invoice or directly by batch, reducing supplier payable balance or recording cash refund.",
      ur: "سپلائر کو مال واپس کرتے وقت پرانا پرچیز بل منتخب کریں یا براہِ راست آئٹم اور بیچ چن کر واپسی کا بل بنائیں۔",
    },
    features: {
      en: [
        "Load items from an original Purchase Invoice or pick any product batch directly.",
        "Supports pack/unit return quantities, discount adjustments, and supplier ledger credit.",
      ],
      ur: [
        "اصل پرچیز بل سے آئٹمز لوڈ کریں یا براہِ راست پروڈکٹ اور بیچ منتخب کریں۔",
        "واپسی کی رقم سپلائر کے کھاتے میں ایڈجسٹ کریں یا نقد وصولی ریکارڈ کریں۔",
      ],
    },
    steps: {
      en: [
        "Select the Supplier and optionally pick the original Purchase Invoice.",
        "Enter the returned packs/units for each item and verify the return rate.",
        "Click Save (or Ctrl+Enter) to post the purchase return.",
      ],
      ur: [
        "سپلائر منتخب کریں اور چاہیں تو اصل پرچیز انوائس منتخب کریں۔",
        "واپس بھیجے جانے والے یونٹس یا پیک درج کریں۔",
        "محفوظ کرنے کے لیے Save یا Ctrl+Enter دبائیں۔",
      ],
    },
    impacts: {
      en: "Removes returned units from stock and reduces your payable balance in the Supplier Ledger.",
      ur: "اسٹاک سے مال کم ہو جاتا ہے اور سپلائر کا بقایا کم ہو جاتا ہے۔",
    },
    shortcuts: [{ keys: ["Ctrl", "Enter"], en: "Save Purchase Return", ur: "پرچیز ریٹرن محفوظ کریں" }],
    faqs: [],
    relatedRoutes: [{ path: "/purchase-returns", en: "Purchase Returns List", ur: "پرچیز ریٹرن لسٹ" }],
  },

  "/purchase-returns/:id/edit": {
    key: "/purchase-returns/:id/edit",
    category: "returns",
    title: { en: "Edit Purchase Return", ur: "پرچیز ریٹرن میں ترمیم" },
    section: { en: "Returns", ur: "مال کی واپسی" },
    summary: {
      en: "Modify an existing purchase return voucher and automatically reconcile batch stock and supplier payable ledger.",
      ur: "پہلے سے بنی ہوئی پرچیز ریٹرن میں تبدیلی کریں، سسٹم اسٹاک اور سپلائر کھاتہ خودکار اپڈیٹ کر دے گا۔",
    },
    features: {
      en: ["Reconciles batch inventory and supplier ledger automatically."],
      ur: ["بیچ اسٹاک اور سپلائر لیجر خودکار طور پر ایڈجسٹ ہو جاتے ہیں۔"],
    },
    steps: {
      en: ["Update the return quantities or rates and click Save."],
      ur: ["مطلوبہ تبدیلی کر کے Save پر کلک کریں۔"],
    },
    impacts: { en: "Updates batch inventory and supplier ledger.", ur: "اسٹاک اور سپلائر کھاتہ اپڈیٹ کرتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/purchase-returns", en: "Purchase Returns", ur: "پرچیز ریٹرنز" }],
  },

  // ============================================================================
  // 5. STOCK & INVENTORY CONTROL
  // ============================================================================
  "/batch-expiry": {
    key: "/batch-expiry",
    category: "inventory",
    title: {
      en: "Batch Expiry & Near-Expiry Radar",
      ur: "بیچ ایکسپائری ٹریکنگ اور الرٹ سسٹم",
    },
    section: {
      en: "Stock & Inventory",
      ur: "اسٹاک اور انوینٹری کنٹرول",
    },
    summary: {
      en: "Proactive radar monitoring all product batches by expiry date. Instantly filter Expired batches, Critical (<30 days), Warning (<90 days), or Safe stock—and take immediate action by returning to supplier or moving to Quarantine/Disposal.",
      ur: "یہ اسکرین آپ کی دکان میں موجود تمام بیچز کی ایکسپائری تاریخ پر نظر رکھتی ہے۔ آپ ایک کلک سے دیکھ سکتے ہیں کہ کون سا مال ایکسپائر ہو چکا ہے اور کون سا اگلے 30، 60 یا 90 دنوں میں ایکسپائر ہونے والا ہے تاکہ وقت سے پہلے سپلائر کو واپس کیا جا سکے یا سیل کیا جا سکے۔",
    },
    features: {
      en: [
        "Color-Coded Expiry Buckets: Expired (Red), Critical 0–30 Days (Amber), Upcoming 31–90 Days, and Healthy Batches.",
        "Valuation at Risk KPI: shows total cost and retail value tied up in expiring or expired batches.",
        "One-Click Actions: send expired batch to Quarantine & Disposal, initiate a Purchase Return, or open in Batch Workbench.",
      ],
      ur: [
        "رنگوں کے ذریعے واضح درجہ بندی: ایکسپائر شدہ (سرخ)، 30 دن سے کم (نارنجی)، اور 90 دن کے اندر ایکسپائر ہونے والے بیچز۔",
        "رسک ویلیو (Valuation at Risk): ایکسپائر ہونے والے مال کی کل لاگت اور مارکیٹ ویلیو کا فوری حساب۔",
        "فوری ایکشن: ایکسپائر مال کو ایک کلک سے Quarantine/Disposal میں بھیجیں یا سپلائر کو واپس کرنے کے لیے نوٹ کریں۔",
      ],
    },
    steps: {
      en: [
        "Select a bucket filter at the top (e.g., Expired, Within 30 Days, Within 90 Days) or filter by Supplier.",
        "Review the days remaining and on-hand units for each batch.",
        "Click Quarantine/Dispose on expired batches so they cannot be accidentally sold at the counter, or return near-expiry batches to the supplier.",
      ],
      ur: [
        "اوپر دیے گئے فلٹرز (Expired، 30 Days، 90 Days) یا سپلائر فلٹر کا انتخاب کریں۔",
        "ہر بیچ کے باقی دن اور موجودہ یونٹس چیک کریں۔",
        "ایکسپائر شدہ مال کو Quarantine/Disposal میں منتقل کریں تاکہ غلطی سے فروخت نہ ہو، اور قریب ایکسپائری مال سپلائر کو واپس بھیجیں۔",
      ],
    },
    impacts: {
      en: "Protects customers and prevents financial loss by catching near-expiry batches before their return window closes.",
      ur: "گاہکوں کو ایکسپائر مال سے محفوظ رکھتا ہے اور وقت پر سپلائر کو واپسی کے ذریعے دکان کو مالی نقصان سے بچاتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/product-batches", en: "Batch Workbench", ur: "پروڈکٹ بیچز ورک بینچ" },
      { path: "/stock-disposals", en: "Quarantine & Disposals", ur: "قرنطینہ اور تلفی (Disposals)" },
      { path: "/purchase-returns/create", en: "Return to Supplier", ur: "سپلائر کو مال واپس کریں" },
    ],
  },

  "/user-demands": {
    key: "/user-demands",
    category: "inventory",
    title: {
      en: "Customer Product Demands (Shortage Book)",
      ur: "گاہکوں کی ڈیمانڈز (شارٹیج بک / مطلوبہ اشیاء)",
    },
    section: {
      en: "Stock & Inventory",
      ur: "اسٹاک اور انوینٹری کنٹرول",
    },
    summary: {
      en: "Digital Shortage Book to log products requested by customers that were out of stock or not yet in your catalog. Feeds directly into Smart Reorder Forecast and Live Topbar Notifications.",
      ur: "یہ آپ کی ڈیجیٹل 'شارٹیج بک' ہے۔ جب کوئی گاہک ایسی چیز مانگے جو دکان میں ختم ہو یا موجود نہ ہو تو اسے یہاں نوٹ کر لیں۔ یہ ڈیمانڈز خودکار طور پر آپ کے آرڈر فورکاسٹ اور نوٹیفکیشن بیل میں ظاہر ہوتی ہیں۔",
    },
    features: {
      en: [
        "Log demands for both existing catalog products and brand-new requested items.",
        "Track status: Pending → Ordered → Fulfilled / Cancelled.",
        "Shows customer name/phone so you can notify them when the item arrives.",
      ],
      ur: [
        "موجودہ پروڈکٹس یا بالکل نئی اشیاء دونوں کی ڈیمانڈ نوٹ کرنے کی سہولت۔",
        "ڈیمانڈ کا اسٹیٹس ٹریک کریں (Pending، Ordered، Fulfilled)۔",
        "گاہک کا نام اور نمبر نوٹ کریں تاکہ مال آنے پر انہیں اطلاع دی جا سکے۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Request Product' to log a missing item requested at the counter.",
        "Filter by Pending status when preparing supplier orders.",
        "Mark demands as Fulfilled once purchased, or convert them in Smart Reorder Forecast.",
      ],
      ur: [
        "کاؤنٹر پر مانگی گئی نایاب چیز نوٹ کرنے کے لیے '+ Request Product' پر کلک کریں۔",
        "سپلائر کو آرڈر دیتے وقت Pending ڈیمانڈز چیک کریں۔",
        "مال آ جانے پر اسٹیٹس کو Fulfilled کر دیں۔",
      ],
    },
    impacts: {
      en: "Captures lost sales opportunities and integrates directly into the Smart Reorder Forecast screen.",
      ur: "گاہک کی ضرورت کوضائع ہونے سے بچاتا ہے اور نئے آرڈر بناتے وقت یاد دہانی کرواتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/user-demands/create", en: "Log New Demand", ur: "نئی ڈیمانڈ درج کریں" },
      { path: "/purchase-orders/forecast", en: "Smart Reorder Forecast", ur: "سمارٹ ری آرڈر فورکاسٹ" },
    ],
  },

  "/user-demands/create": {
    key: "/user-demands/create",
    category: "inventory",
    title: { en: "Log New Product Demand", ur: "نئی پروڈکٹ ڈیمانڈ درج کریں" },
    section: { en: "Stock & Inventory", ur: "اسٹاک اور انوینٹری کنٹرول" },
    summary: {
      en: "Record a customer's request for an out-of-stock or new product so procurement can order it.",
      ur: "گاہک کی مطلوبہ پروڈکٹ، مقدار، گاہک کا نام اور نوٹ درج کریں تاکہ خریداری کے وقت منگوائی جا سکے۔",
    },
    features: {
      en: ["Pick an existing product or type a custom new item name.", "Attach optional Customer and Urgency notes."],
      ur: ["کیٹلاگ سے پروڈکٹ منتخب کریں یا نئی چیز کا نام لکھیں۔", "گاہک کا نام اور مطلوبہ مقدار درج کریں۔"],
    },
    steps: {
      en: ["Enter the requested product, quantity, and optional customer details, then click Save."],
      ur: ["پروڈکٹ کا نام اور مقدار لکھ کر Save پر کلک کریں۔"],
    },
    impacts: { en: "Triggers a live demand notification and adds to pending procurement requests.", ur: "نوٹیفکیشن سینٹر اور آرڈر لسٹ میں ڈیمانڈ شامل ہو جاتی ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/user-demands", en: "All Demands", ur: "تمام ڈیمانڈز" }],
  },

  "/stock-adjustments": {
    key: "/stock-adjustments",
    category: "inventory",
    title: {
      en: "Stock Adjustments Register",
      ur: "اسٹاک ایڈجسٹمنٹ (اسٹاک میں کمی بیشی کی درستگی)",
    },
    section: {
      en: "Stock & Inventory",
      ur: "اسٹاک اور انوینٹری کنٹرول",
    },
    summary: {
      en: "Audit-logged manual inventory adjustments to add found/opening stock or deduct shrinkage/internal usage with reason codes.",
      ur: "اگر دکان کے اصل اسٹاک اور کمپیوٹر اسٹاک میں فرق ہو، یا ابتدائی اسٹاک (Opening Stock) ڈالنا ہو، تو یہاں وجہ لکھ کر اسٹاک کم یا زیادہ کیا جا سکتا ہے۔",
    },
    features: {
      en: [
        "Complete history of all manual positive (+) and negative (-) stock adjustments.",
        "Tracks adjustment date, operator, reason/notes, and total cost impact.",
      ],
      ur: [
        "اسٹاک میں کی گئی تمام مثبت (+) اور منفی (-) تبدیلیوں کا مکمل ریکارڈ۔",
        "تاریخ، یوزر، وجہ اور مالیاتی اثر کی تفصیل۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Add Stock Adjustment' to record a new stock correction.",
        "Click View on any adjustment voucher to inspect its line items.",
      ],
      ur: [
        "نئی اسٹاک ایڈجسٹمنٹ کے لیے '+ Add Stock Adjustment' پر کلک کریں۔",
        "کسی بھی پرانی ایڈجسٹمنٹ کی تفصیل دیکھنے کے لیے View دبائیں۔",
      ],
    },
    impacts: {
      en: "Directly adjusts product/batch quantities and posts corresponding inventory valuation adjustments.",
      ur: "پروڈکٹ کے اسٹاک اور انوینٹری ویلیو کو فوری طور پر اپڈیٹ کرتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/stock-adjustments/create", en: "New Stock Adjustment", ur: "نئی اسٹاک ایڈجسٹمنٹ" },
      { path: "/stocktake-sessions", en: "Physical Stocktake Audit", ur: "فزیکل اسٹاک آڈٹ (Stocktake)" },
    ],
  },

  "/stock-adjustments/create": {
    key: "/stock-adjustments/create",
    category: "inventory",
    title: { en: "Create Stock Adjustment", ur: "نئی اسٹاک ایڈجسٹمنٹ درج کریں" },
    section: { en: "Stock & Inventory", ur: "اسٹاک اور انوینٹری کنٹرول" },
    summary: {
      en: "Add or deduct product quantities with batch selection and mandatory audit reason.",
      ur: "پروڈکٹ منتخب کر کے اس کے اسٹاک میں اضافہ یا کمی درج کریں اور وجہ (Note) لکھیں۔",
    },
    features: {
      en: ["Supports multi-row positive (Add) and negative (Deduct) adjustments.", "Displays current stock vs. new adjusted stock live."],
      ur: ["ایک ہی فارم میں کئی آئٹمز کا اسٹاک کم یا زیادہ کریں۔", "موجودہ اسٹاک اور نئے اسٹاک کا فرق لائیو دیکھیں۔"],
    },
    steps: {
      en: ["Select products, choose Add or Deduct, enter quantity and reason, then click Save."],
      ur: ["پروڈکٹ منتخب کریں، مقدار اور وجہ لکھ کر Save پر کلک کریں۔"],
    },
    impacts: { en: "Immediately updates on-hand inventory and logs an adjustment voucher.", ur: "فوری طور پر اسٹاک اپڈیٹ ہو جاتا ہے اور ریکارڈ بن جاتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/stock-adjustments", en: "Stock Adjustments List", ur: "اسٹاک ایڈجسٹمنٹ لسٹ" }],
  },

  "/stock-adjustments/:id": {
    key: "/stock-adjustments/:id",
    category: "inventory",
    title: { en: "Stock Adjustment Details", ur: "اسٹاک ایڈجسٹمنٹ کی تفصیل" },
    section: { en: "Stock & Inventory", ur: "اسٹاک اور انوینٹری کنٹرول" },
    summary: {
      en: "Inspect the products, quantities, cost impact, and reason recorded in a stock adjustment voucher.",
      ur: "اسٹاک ایڈجسٹمنٹ واؤچر کے تمام آئٹمز، مقدار اور وجہ کی تفصیل دیکھیں۔",
    },
    features: { en: ["Detailed breakdown of adjusted items and audit trail."], ur: ["ایڈجسٹ کیے گئے تمام آئٹمز کی مکمل تفصیل۔"] },
    steps: { en: ["Review the adjustment lines or print for audit records."], ur: ["تفصیلات کا جائزہ لیں یا ریکارڈ کے لیے پرنٹ کریں۔"] },
    impacts: { en: "Read-only voucher view.", ur: "صرف معلومات دیکھنے کی اسکرین۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/stock-adjustments", en: "Stock Adjustments", ur: "اسٹاک ایڈجسٹمنٹس" }],
  },

  "/stocktake-sessions": {
    key: "/stocktake-sessions",
    category: "inventory",
    title: {
      en: "Physical Stocktake & Inventory Audit Sessions",
      ur: "فزیکل اسٹاک آڈٹ (دکان کے مال کی گنتی)",
    },
    section: {
      en: "Stock & Inventory",
      ur: "اسٹاک اور انوینٹری کنٹرول",
    },
    summary: {
      en: "Run structured physical inventory counts (full store or filtered by Category/Brand/Rack). Supports Blind Count mode so staff count honestly without seeing system stock, followed by Manager Variance Review and 1-click reconciliation.",
      ur: "دکان یا گودام کے مال کی باقاعدہ فزیکل گنتی (Audit) کرنے کا سسٹم۔ آپ پوری دکان یا کسی ایک کیٹیگری/برانڈ/ریک کا آڈٹ شروع کر سکتے ہیں، 'Blind Count' موڈ استعمال کر سکتے ہیں تاکہ ملازمین ایمانداری سے گنتی کریں، اور آخر میں فرق (Variance) چیک کر کے ایک کلک سے اسٹاک برابر کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Scoped Audits: audit the entire catalog or filter by specific Category, Brand, or Rack.",
        "Blind Count Option: hides expected system quantities during counting to prevent staff from copying numbers.",
        "Variance Review & Auto-Adjustment: compares Physical Count vs. System Stock, calculates surplus/shortage value, and posts reconciling Stock Adjustments on approval.",
      ],
      ur: [
        "مخصوص یا مکمل آڈٹ: پوری دکان یا صرف کسی ایک ریک، برانڈ یا کیٹیگری کی گنتی کریں۔",
        "بلائنڈ کاؤنٹ (Blind Count): گنتی کرنے والے اسٹاف سے کمپیوٹر کا اسٹاک چھپائیں تاکہ وہ اصل گنتی درج کریں۔",
        "فرق کا جائزہ (Variance Review): کمپیوٹر اسٹاک اور اصل گنتی کا موازنہ کریں اور منظوری دے کر خودکار اسٹاک برابر کریں۔",
      ],
    },
    steps: {
      en: [
        "Click '+ New Stocktake Session' to start a count session.",
        "Enter physical counts inside the Session screen (via barcode scanner or keyboard).",
        "Open Variance Review to inspect discrepancies and click Approve & Reconcile to update inventory.",
      ],
      ur: [
        "نیا آڈٹ شروع کرنے کے لیے '+ New Stocktake Session' پر کلک کریں۔",
        "سیشن اسکرین میں جا کر شیلف پر موجود اصل مال کی گنتی درج کریں۔",
        "Review اسکرین پر فرق چیک کریں اور Approve کر کے اسٹاک اپڈیٹ کر دیں۔",
      ],
    },
    impacts: {
      en: "When a stocktake session is finalized/approved, it automatically generates stock adjustment entries for any variances.",
      ur: "جب اسٹاک آڈٹ منظور (Approve) کیا جاتا ہے تو کم یا زیادہ نکلنے والے آئٹمز کا اسٹاک خودکار طور پر اصل گنتی کے برابر ہو جاتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/stocktake-sessions/create", en: "Start New Stocktake", ur: "نیا اسٹاک آڈٹ شروع کریں" },
      { path: "/stock-adjustments", en: "Stock Adjustments", ur: "اسٹاک ایڈجسٹمنٹس" },
    ],
  },

  "/stocktake-sessions/create": {
    key: "/stocktake-sessions/create",
    category: "inventory",
    title: { en: "Start New Stocktake Session", ur: "نیا فزیکل اسٹاک آڈٹ شروع کریں" },
    section: { en: "Stock & Inventory", ur: "اسٹاک اور انوینٹری کنٹرول" },
    summary: {
      en: "Configure and launch a new physical inventory count session by selecting scope (All Products, Category, Brand, or Rack) and Blind Count preference.",
      ur: "نئی اسٹاک گنتی شروع کرنے کے لیے سیشن کا نام، دائرہ کار (پوری دکان، مخصوص کیٹیگری یا برانڈ) اور بلائنڈ کاؤنٹ آپشن منتخب کریں۔",
    },
    features: {
      en: ["Snapshot current system stock at the start of the count.", "Enable Blind Count mode for unbiased physical verification."],
      ur: ["آڈٹ کے آغاز پر موجودہ کمپیوٹر اسٹاک کو محفوظ کرتا ہے۔", "شفاف گنتی کے لیے Blind Count موڈ آن کرنے کی سہولت۔"],
    },
    steps: {
      en: ["Enter a Session Title/Reference, select scope filters if desired, and click Start Session."],
      ur: ["سیشن کا عنوان لکھیں، فلٹر منتخب کریں اور Start Session پر کلک کریں۔"],
    },
    impacts: { en: "Creates an active counting session without locking sales until final reconciliation.", ur: "نیا گنتی سیشن بناتا ہے جس میں اسٹاف مقدار درج کر سکتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/stocktake-sessions", en: "All Stocktake Sessions", ur: "تمام آڈٹ سیشنز" }],
  },

  "/stocktake-sessions/:id": {
    key: "/stocktake-sessions/:id",
    category: "inventory",
    title: { en: "Active Stocktake Counting Workspace", ur: "اسٹاک آڈٹ گنتی کی اسکرین" },
    section: { en: "Stock & Inventory", ur: "اسٹاک اور انوینٹری کنٹرول" },
    summary: {
      en: "Enter physical shelf counts by scanning barcodes or typing counted quantities for each item/batch in the session.",
      ur: "شیلف پر موجود مال کو گن کر یا بارکوڈ اسکین کر کے ہر آئٹم کی اصل تعداد یہاں درج کریں۔",
    },
    features: {
      en: ["Scan-to-count barcode support or fast tabular keyboard entry.", "Save progress anytime and proceed to Variance Review when counting is complete."],
      ur: ["بارکوڈ اسکین کر کے یا کی بورڈ سے تیزی سے گنتی درج کریں۔", "گنتی مکمل ہونے پر Variance Review کے لیے جمع کروائیں۔"],
    },
    steps: {
      en: ["Enter the physical quantity counted for each row.", "Click Save Progress or Proceed to Review when finished."],
      ur: ["ہر آئٹم کے سامنے گنی گئی اصل تعداد لکھیں۔", "مکمل ہونے پر Review پر کلک کریں۔"],
    },
    impacts: { en: "Saves counted quantities in draft until approved on the Review screen.", ur: "گنتی کو محفوظ رکھتا ہے جب تک کہ Review اسکرین سے منظور نہ کیا جائے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/stocktake-sessions", en: "Stocktake Sessions", ur: "اسٹاک آڈٹ سیشنز" }],
  },

  "/stocktake-sessions/:id/review": {
    key: "/stocktake-sessions/:id/review",
    category: "inventory",
    title: { en: "Stocktake Variance Review & Approval", ur: "اسٹاک آڈٹ کے فرق (Variance) کا جائزہ اور منظوری" },
    section: { en: "Stock & Inventory", ur: "اسٹاک اور انوینٹری کنٹرول" },
    summary: {
      en: "Compare System Expected Stock vs. Physical Counted Stock, inspect financial surplus/shortage values, print the variance audit report, and approve to update live inventory.",
      ur: "کمپیوٹر کے اسٹاک اور اصل گنتی کے درمیان فرق (کمی یا زیادتی) اور اس کی مالیاتی مالیت کا جائزہ لیں، رپورٹ پرنٹ کریں اور منظوری دے کر اسٹاک برابر کریں۔",
    },
    features: {
      en: ["Highlights exact Shortage (-) and Surplus (+) quantities and their cost impact.", "One-click Finalize & Post Adjustments updates live stock."],
      ur: ["کم یا زیادہ نکلنے والے آئٹمز اور ان کی مالیت کو واضح دکھاتا ہے۔", "منظور کرنے پر کمپیوٹر اسٹاک خودکار طور پر اصل گنتی کے مطابق اپڈیٹ ہو جاتا ہے۔"],
    },
    steps: {
      en: ["Filter by Discrepancies Only to review items with variances.", "Click Approve / Finalize Stocktake to apply the stock adjustments."],
      ur: ["فرق والے آئٹمز چیک کریں اور درست ہونے پر Approve/Finalize بٹن دبائیں۔"],
    },
    impacts: { en: "Posts official stock adjustments for all variance items and closes the audit session.", ur: "فرق والے تمام آئٹمز کی اسٹاک ایڈجسٹمنٹ پوسٹ کر کے آڈٹ مکمل کر دیتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/stocktake-sessions", en: "Stocktake Sessions", ur: "اسٹاک آڈٹ سیشنز" }],
  },

  "/stock-disposals": {
    key: "/stock-disposals",
    category: "inventory",
    title: {
      en: "Quarantine & Stock Disposals (Write-Offs)",
      ur: "قرنطینہ (Quarantine) اور خراب/ایکسپائر مال کی تلفی",
    },
    section: {
      en: "Stock & Inventory",
      ur: "اسٹاک اور انوینٹری کنٹرول",
    },
    summary: {
      en: "Isolate expired, damaged, temperature-spoiled, or recalled batches into Quarantine so they cannot be sold, then finalize their destruction with regulatory Disposal Certificates or restore them if cleared.",
      ur: "ایکسپائر شدہ، ٹوٹ پھوٹ کا شکار یا خراب مال کو فروخت ہونے سے روکنے کے لیے قرنطینہ (Quarantine) میں الگ کریں، یا مکمل طور پر ضائع (Dispose/Write-off) کر کے سرکاری/آڈٹ سرٹیفکیٹ پرنٹ کریں۔",
    },
    features: {
      en: [
        "Two-stage lifecycle: Quarantine Holding (isolated from salable stock) → Finalized Disposal (permanently written off) or Restored.",
        "Tracks Cause (Shelf Expiry, Breakage, Cold-Chain Spoilage, Recall) and Disposal Method (Incineration, Supplier Destruction, etc.).",
        "Generates printable official Disposal Certificates for drug inspectors and tax write-off audits.",
      ],
      ur: [
        "دو مراحل کا محفوظ نظام: پہلے مال کو Quarantine (الگ تھلگ) کریں تاکہ کاؤنٹر پر سیل نہ ہو سکے، پھر تصدیق کے بعد مستقل تلف (Dispose) کریں یا واپس اسٹاک میں بحال کریں۔",
        "خرابی کی وجہ (ایکسپائری، ٹوٹ پھوٹ، درجہ حرارت) اور تلفی کا طریقہ ریکارڈ کریں۔",
        "ڈرگ انسپکٹر یا آڈٹ کے لیے باقاعدہ Disposal Certificate پرنٹ کریں۔",
      ],
    },
    steps: {
      en: [
        "Click '+ New Quarantine / Disposal' to isolate damaged or expired stock.",
        "Use the table actions to Finalize Destruction, Restore to salable stock, or Print Disposal Certificate.",
      ],
      ur: [
        "خراب یا ایکسپائر مال الگ کرنے کے لیے '+ New Quarantine / Disposal' پر کلک کریں۔",
        "فہرست میں موجود آئٹمز کو مستقل ضائع (Finalize) کریں یا Disposal Certificate پرنٹ کریں۔",
      ],
    },
    impacts: {
      en: "Immediately removes quarantined/disposed units from salable batch inventory and records inventory shrinkage/write-off.",
      ur: "یہ یونٹس فوری طور پر قابلِ فروخت اسٹاک سے نکل جاتے ہیں اور نقصان (Write-off) کا باقاعدہ ریکارڈ بن جاتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/stock-disposals/create", en: "New Quarantine / Disposal", ur: "نیا قرنطینہ / ڈسپوزل بنائیں" },
      { path: "/batch-expiry", en: "Batch Expiry Radar", ur: "بیچ ایکسپائری ٹریکنگ" },
    ],
  },

  "/stock-disposals/create": {
    key: "/stock-disposals/create",
    category: "inventory",
    title: { en: "New Quarantine or Stock Disposal", ur: "نیا قرنطینہ یا اسٹاک ڈسپوزل درج کریں" },
    section: { en: "Stock & Inventory", ur: "اسٹاک اور انوینٹری کنٹرول" },
    summary: {
      en: "Remove expired, broken, or recalled product batches from salable inventory into Quarantine holding or immediate disposal.",
      ur: "ایکسپائر یا خراب ہونے والے بیچ اور اس کی مقدار منتخب کریں، وجہ لکھیں اور اسے اسٹاک سے الگ (Quarantine) یا ضائع (Dispose) کریں۔",
    },
    features: {
      en: ["Select exact Product and Batch to quarantine or dispose.", "Record Cause, Disposal Method, Witness/Authorized By, and Remarks."],
      ur: ["مخصوص پروڈکٹ اور بیچ منتخب کریں۔", "خرابی کی وجہ، تلف کرنے کا طریقہ اور تصدیق کنندہ کا نام درج کریں۔"],
    },
    steps: {
      en: ["Choose whether to hold in Quarantine or Finalize Disposal immediately, add batch lines, and click Save."],
      ur: ["پروڈکٹ اور بیچ منتخب کریں، مقدار اور وجہ لکھ کر Save پر کلک کریں۔"],
    },
    impacts: { en: "Deducts units from salable batch stock and creates a disposal certificate record.", ur: "قابلِ فروخت اسٹاک سے مقدار کم کر کے ڈسپوزل ریکارڈ بناتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/stock-disposals", en: "Quarantine & Disposals List", ur: "ڈسپوزل لسٹ" }],
  },

  // ============================================================================
  // 6. FINANCE, LEDGERS, ACCOUNTING & HR
  // ============================================================================
  "/customer-ledger": {
    key: "/customer-ledger",
    category: "finance",
    title: {
      en: "Customer Ledger & Receivable Statement (Udhar Khata)",
      ur: "کسٹمر لیجر (گاہکوں کا ادھار کھاتہ اور وصولی)",
    },
    section: {
      en: "Finance & Ledgers",
      ur: "فنانس اور کھاتے (Ledgers)",
    },
    summary: {
      en: "Complete running statement of every customer's credit bills, returns, and payments. Record new customer receipts into Cash Drawer or Bank/Wallet accounts, print A4 or Thermal statements, and send WhatsApp payment reminders.",
      ur: "ہر گاہک کے ادھار بلوں، واپسی (Returns) اور وصولیوں کا مکمل کھاتہ۔ یہاں سے آپ گاہک سے نقد یا بینک/والٹ میں رقم وصول کر سکتے ہیں، کھاتے کی اسٹیٹمنٹ (تھرمل یا A4) پرنٹ کر سکتے ہیں اور واٹس ایپ پر بل/کھاتہ بھیج سکتے ہیں۔",
    },
    features: {
      en: [
        "Running Balance Ledger: shows Opening Balance, Debit (Sale Bills), Credit (Payments & Sale Returns), and Net Closing Receivable.",
        "Instant Payment Collection: record customer receipts directly into Cash Drawer, Bank Account, JazzCash, or EasyPaisa.",
        "Print & Share: print A4 Statement, Thermal Receipt slip, or share PDF via WhatsApp/Email.",
      ],
      ur: [
        "مکمل رننگ بیلنس: ابتدائی بیلنس، نئے بل (Debit)، وصولیاں اور واپسی (Credit) اور کل بقایا رقم۔",
        "فوری وصولی (Receive Payment): گاہک سے ملنے والی رقم کیش ڈراور، بینک یا ایزی پیسہ/جاز کیش میں درج کریں۔",
        "پرنٹ اور شیئر: گاہک کو دینے کے لیے کھاتے کی پرنٹ سلپ نکالیں یا واٹس ایپ پر PDF بھیجیں۔",
      ],
    },
    steps: {
      en: [
        "Search and select a Customer from the customer picker.",
        "Set the Date Range to view their transaction history.",
        "Click Record Payment to receive money from the customer, or click Print / Share to send their statement.",
      ],
      ur: [
        "سب سے پہلے گاہک (Customer) تلاش کر کے منتخب کریں۔",
        "مطلوبہ تاریخ منتخب کریں تاکہ تمام لین دین سامنے آ جائے۔",
        "وصولی درج کرنے کے لیے Record Payment دبائیں یا کھاتہ پرنٹ کرنے کے لیے Print پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Recording a customer payment reduces their receivable balance, increases your Cash Drawer or Bank Account balance, and posts to the General Ledger.",
      ur: "وصولی درج کرنے سے گاہک کا ادھار کم ہو جاتا ہے اور آپ کے کیش ڈراور یا بینک اکاؤنٹ کا بیلنس بڑھ جاتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/customers", en: "Customers Directory", ur: "گاہکوں کی فہرست" },
      { path: "/payments", en: "Payment Vouchers", ur: "پیمنٹ واؤچرز" },
      { path: "/reports/outstanding-aging", en: "Outstanding Aging Report", ur: "بقایاجات کی ایجنگ رپورٹ" },
    ],
  },

  "/supplier-ledger": {
    key: "/supplier-ledger",
    category: "finance",
    title: {
      en: "Supplier Ledger & Payable Statement",
      ur: "سپلائر لیجر (سپلائرز اور ڈسٹری بیوٹرز کا کھاتہ)",
    },
    section: {
      en: "Finance & Ledgers",
      ur: "فنانس اور کھاتے (Ledgers)",
    },
    summary: {
      en: "Track everything you owe to each supplier/distributor across purchase bills, purchase returns, and outgoing payment vouchers. Record payments from Cash Drawer or Bank accounts and print statements.",
      ur: "ہر سپلائر اور ڈسٹری بیوٹر کے ساتھ ہونے والی خریداری، مال کی واپسی اور ادا کی گئی رقوم کا مکمل کھاتہ۔ یہاں آپ دیکھ سکتے ہیں کہ کس سپلائر کو کتنی رقم ادا کرنی باقی ہے اور نئی ادائیگی درج کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Chronological ledger of Purchase Invoices, Debit Notes (Returns), and Supplier Payments.",
        "Record Outgoing Payment directly from Cash Drawer, Bank Transfer, Cheque, or Mobile Wallet.",
        "Print A4 or Thermal Supplier Ledger statements or share via WhatsApp/Email.",
      ],
      ur: [
        "تمام پرچیز بلوں، ریٹرنز اور کی گئی ادائیگیوں کی تاریخ وار تفصیل۔",
        "کیش ڈراور، بینک اکاؤنٹ یا چیک کے ذریعے سپلائر کو ادائیگی درج کرنے کی سہولت۔",
        "سپلائر کے کھاتے کا پرنٹ نکالنے یا پی ڈی ایف شیئر کرنے کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Select a Supplier from the dropdown and choose your Date Range.",
        "Review the running payable balance.",
        "Click Make Payment to record cash/bank payment to the supplier.",
      ],
      ur: [
        "سپلائر منتخب کریں اور تاریخ مقرر کریں۔",
        "سپلائر کا کل بقایا بیلنس چیک کریں۔",
        "ادائیگی درج کرنے کے لیے Payment بٹن پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "Supplier payments reduce Accounts Payable, deduct from your selected Cash/Bank account, and post to the General Ledger.",
      ur: "سپلائر کو ادائیگی کرنے سے آپ کے ذمے بقایا کم ہو جاتا ہے اور کیش ڈراور یا بینک بیلنس سے رقم منہا ہو جاتی ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/suppliers", en: "Suppliers List", ur: "سپلائرز کی فہرست" },
      { path: "/payments", en: "Payment Vouchers", ur: "پیمنٹ واؤچرز" },
    ],
  },

  "/payments": {
    key: "/payments",
    category: "finance",
    title: {
      en: "Payment Vouchers (Receipts & Disbursements)",
      ur: "پیمنٹ واؤچرز (وصولی اور ادائیگی کے واؤچرز)",
    },
    section: {
      en: "Finance & Ledgers",
      ur: "فنانس اور کھاتے (Ledgers)",
    },
    summary: {
      en: "Unified treasury register for all Customer Receipts (Inflow) and Supplier Payments (Outflow). Create, print, filter, and share official Payment & Receipt Vouchers.",
      ur: "گاہکوں سے ملنے والی رقوم (Receipts) اور سپلائرز کو کی جانے والی ادائیگیوں (Payments) کے تمام واؤچرز کا مرکزی ریکارڈ۔ یہاں سے آپ نیا واؤچر بنا سکتے ہیں اور باقاعدہ رسید پرنٹ کر سکتے ہیں۔",
    },
    features: {
      en: [
        "Create Customer Receipt Vouchers or Supplier Payment Vouchers from one screen.",
        "Supports Cash Drawer, Bank Accounts, Cheques, and Mobile Wallets (EasyPaisa/JazzCash).",
        "Print official Payment/Receipt Vouchers and share via WhatsApp or Email.",
      ],
      ur: [
        "گاہک کی وصولی یا سپلائر کی ادائیگی کا نیا واؤچر ایک ہی جگہ سے بنائیں۔",
        "نقد (کیش ڈراور)، بینک ٹرانسفر، چیک یا موبائل والٹ کا انتخاب کریں۔",
        "پیمنٹ واؤچر پرنٹ کریں یا واٹس ایپ پر بھیجیں۔",
      ],
    },
    steps: {
      en: [
        "Click '+ New Payment Voucher' and choose Customer Receipt or Supplier Payment.",
        "Select the Party, Payment Account, Amount, and Reference/Notes, then click Save.",
      ],
      ur: [
        "نیا واؤچر بنانے کے لیے '+ New Payment' پر کلک کریں۔",
        "کسٹمر یا سپلائر چنیں، اکاؤنٹ اور رقم لکھ کر Save کریں۔",
      ],
    },
    impacts: {
      en: "Updates Customer/Supplier Ledgers, Cash Drawer/Bank balances, and Double-Entry GL automatically.",
      ur: "یہ واؤچر خودکار طور پر پارٹی کے کھاتے، کیش ڈراور/بینک اور جنرل لیجر کو اپڈیٹ کرتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
      { path: "/supplier-ledger", en: "Supplier Ledger", ur: "سپلائر کھاتہ" },
      { path: "/accounts", en: "Financial Accounts", ur: "مالیاتی اکاؤنٹس" },
    ],
  },

  "/cash-drawer": {
    key: "/cash-drawer",
    category: "finance",
    title: {
      en: "Cash Drawer Shift Register & Z-Report",
      ur: "کیش ڈراور شفٹ رجسٹر (گلے کا حساب اور Z-Report)",
    },
    section: {
      en: "Finance & Ledgers",
      ur: "فنانس اور کھاتے (Ledgers)",
    },
    summary: {
      en: "Manage counter cash till shifts. Open a shift with an Opening Float, track every Cash Sale, Return, Customer Receipt, Expense, and Manual Cash In/Out in real time, and close the shift with Physical Cash Counting and Z-Report printing.",
      ur: "دکان کے کیش کاؤنٹر (گلے) کا مکمل حساب کتاب۔ صبح شفٹ شروع کرتے وقت ابتدائی کیش (Opening Float) درج کریں، دن بھر کی نقد سیلز، واپسی، اخراجات اور وصولیاں خودکار ٹریک کریں، اور رات کو شفٹ بند کرتے وقت اصل نقدی گن کر فرق (Short/Excess) چیک کریں اور Z-Report پرنٹ کریں۔",
    },
    features: {
      en: [
        "Live Expected Cash Balance: automatically sums Opening Float + Cash Sales + Cash Receipts − Cash Returns − Cash Purchases − Expenses.",
        "Manual Cash In / Cash Out: record petty cash additions or owner safe drops during the shift.",
        "Shift Closing Reconciliation & Z-Report PDF: enter actual counted cash at shift close to calculate exact Over/Short variance.",
      ],
      ur: [
        "متوقع کیش بیلنس (Expected Balance): ابتدائی کیش، نقد سیلز، وصولیوں اور اخراجات کا خودکار لائیو حساب۔",
        "مینوئل کیش اِن / کیش آؤٹ: گلے میں اضافی کیش رکھنے یا مالک کو کیش نکال کر دینے کا اندراج۔",
        "شفٹ کلوزنگ اور Z-Report: شفٹ ختم ہونے پر گلے کی اصل رقم درج کریں تاکہ کمی یا زیادتی سامنے آ جائے اور Z-Report پرنٹ ہو سکے۔",
      ],
    },
    steps: {
      en: [
        "If the drawer is closed, enter your Opening Float cash amount and click Open Cash Drawer.",
        "During the day, use Manual Cash In / Out for non-invoice cash movements.",
        "At shift end, click Close Shift, enter the physical cash counted in the till, and print the Z-Report.",
      ],
      ur: [
        "شفٹ شروع کرنے کے لیے گلے میں موجود ابتدائی رقم (Opening Balance) لکھ کر Open Drawer دبائیں۔",
        "دن کے دوران اگر گلے میں الگ سے پیسے رکھے یا نکالے جائیں تو Manual Cash In/Out استعمال کریں۔",
        "شفٹ کے اختتام پر Close Drawer دبائیں، گنی گئی اصل رقم لکھیں اور Z-Report پرنٹ کریں۔",
      ],
    },
    impacts: {
      en: "Synchronizes live with the Topbar Cash Drawer pill (Alt+D) and links physical counter cash to the Cash in Hand financial account.",
      ur: "اوپر ٹاپ بار میں نظر آنے والے Drawer بٹن (Alt+D) کے ساتھ لائیو جڑا ہوتا ہے اور کاؤنٹر کی نقدی کا مکمل آڈٹ رکھتا ہے۔",
    },
    shortcuts: [
      { keys: ["Alt", "D"], en: "Quick Cash Drawer Popup Anywhere", ur: "کہیں سے بھی کیش ڈراور پاپ اپ کھولیں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/accounts", en: "Financial Accounts", ur: "بینک اور کیش اکاؤنٹس" },
      { path: "/sale-invoices/pos", en: "Barcode POS", ur: "بارکوڈ POS" },
    ],
  },

  "/accounts": {
    key: "/accounts",
    category: "finance",
    title: {
      en: "Financial Accounts (Banks, Wallets & Cash)",
      ur: "مالیاتی اکاؤنٹس (بینک، جاز کیش، ایزی پیسہ اور نقدی)",
    },
    section: {
      en: "Finance & Ledgers",
      ur: "فنانس اور کھاتے (Ledgers)",
    },
    summary: {
      en: "Manage all your business treasury accounts—Pakistani Banks (HBL, Meezan, UBL, Alfalah, MCB, etc.), Mobile Wallets (JazzCash, EasyPaisa, SadaPay, NayaPay), and Cash in Hand. View live balances, transfer funds between accounts, and inspect account statements.",
      ur: "اپنے کاروبار کے تمام بینک اکاؤنٹس (میزان، HBL، UBL وغیرہ)، موبائل والٹس (JazzCash، EasyPaisa) اور کیش اکاؤنٹس کو منیج کریں۔ ہر اکاؤنٹ کا لائیو بیلنس دیکھیں، ایک اکاؤنٹ سے دوسرے میں رقم منتقل (Transfer) کریں اور اسٹیٹمنٹ چیک کریں۔",
    },
    features: {
      en: [
        "Create & manage Bank, Mobile Wallet, Card POS, and Cash accounts with account numbers/IBAN.",
        "Inter-Account Fund Transfers (Contra Entries): e.g., deposit Cash Drawer money into Meezan Bank.",
        "Detailed Account Transaction History showing every inflow and outflow.",
      ],
      ur: [
        "بینک اکاؤنٹس، موبائل والٹس اور کیش اکاؤنٹس بنائیں اور ان کا موجودہ بیلنس دیکھیں۔",
        "اکاؤنٹ ٹرانسفر: مثلاً دکان کے کیش سے بینک اکاؤنٹ میں رقم جمع کروانے کی انٹری کریں۔",
        "ہر اکاؤنٹ میں آنے اور جانے والی رقوم کی مکمل ہسٹری دیکھیں۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Add Account' to register a new Bank or Mobile Wallet account.",
        "Click 'Transfer Funds' to move money between Cash and Bank accounts.",
        "Click any account card to inspect its statement of transactions.",
      ],
      ur: [
        "نیا بینک یا والٹ اکاؤنٹ بنانے کے لیے '+ Add Account' پر کلک کریں۔",
        "ایک اکاؤنٹ سے دوسرے میں رقم بھیجنے کے لیے Transfer استعمال کریں۔",
        "کسی بھی اکاؤنٹ کی تفصیل دیکھنے کے لیے اس پر کلک کریں۔",
      ],
    },
    impacts: {
      en: "All POS, Sale, Purchase, Payment, Expense, and Payroll transactions route their cash/bank movements through these accounts.",
      ur: "سیلز، پرچیز، اخراجات اور تنخواہوں کی تمام ادائیگیاں انہی اکاؤنٹس کے ذریعے ریکارڈ ہوتی ہیں۔",
    },
    shortcuts: [
      { keys: ["Alt", "A"], en: "Quick Financial Accounts Popup Anywhere", ur: "کہیں سے بھی اکاؤنٹس کا بیلنس دیکھیں" },
    ],
    faqs: [],
    relatedRoutes: [
      { path: "/cash-drawer", en: "Cash Drawer", ur: "کیش ڈراور" },
      { path: "/accounting", en: "Double-Entry Accounting & GL", ur: "ڈبل انٹری اکاؤنٹنگ اور GL" },
    ],
  },

  "/expenses": {
    key: "/expenses",
    category: "finance",
    title: {
      en: "Operating Expenses Management",
      ur: "کاروباری اخراجات (Operating Expenses)",
    },
    section: {
      en: "Finance & Ledgers",
      ur: "فنانس اور کھاتے (Ledgers)",
    },
    summary: {
      en: "Record and categorize all daily and monthly store expenses (Shop Rent, Electricity/Gas Bills, Staff Refreshments, Packaging, Freight, Maintenance). Automatically deducts from Cash Drawer or Bank and flows into the Profit & Loss report.",
      ur: "دکان کے روزمرہ اور ماہانہ اخراجات (جیسے دکان کا کرایہ، بجلی کا بل، چائے پانی، پیکنگ، کرایہ باربرداری، مرمت وغیرہ) کا مکمل ریکارڈ رکھیں۔ یہ اخراجات کیش ڈراور یا بینک سے منہا ہوتے ہیں اور نفع و نقصان (P&L) رپورٹ میں شامل ہوتے ہیں۔",
    },
    features: {
      en: [
        "Custom Expense Categories modal to organize overhead costs.",
        "Select Payment Account (Cash Drawer, Bank, Mobile Wallet) for each expense voucher.",
        "Filter expenses by date range, category, or search keywords.",
      ],
      ur: [
        "اخراجات کی مختلف کیٹیگریز (کرایہ، بجلی، چائے پانی وغیرہ) بنانے اور منیج کرنے کی سہولت۔",
        "ہر خرچے کے لیے ادائیگی کا اکاؤنٹ (کیش ڈراور یا بینک) منتخب کریں۔",
        "تاریخ یا کیٹیگری کے لحاظ سے اخراجات کی رپورٹ فلٹر کریں۔",
      ],
    },
    steps: {
      en: [
        "Click 'Expense Categories' if you need to add a new expense head.",
        "Click '+ Add Expense', select the Category, Date, Amount, Payment Account, and Notes, then click Save.",
      ],
      ur: [
        "نیا خرچہ درج کرنے کے لیے '+ Add Expense' پر کلک کریں۔",
        "خرچے کی قسم (Category)، تاریخ، رقم، اکاؤنٹ اور تفصیل لکھ کر Save دبائیں۔",
      ],
    },
    impacts: {
      en: "Deducts from the chosen Cash/Bank account, posts an Expense Debit in the General Ledger, and reduces Net Profit on the P&L statement.",
      ur: "منتخب کردہ کیش یا بینک اکاؤنٹ سے رقم کم کرتا ہے اور خالص منافع (Net Profit) کے حساب میں شامل ہوتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/reports/net-profit", en: "Net Profit (P&L) Report", ur: "خالص منافع (P&L) رپورٹ" },
      { path: "/accounting", en: "Double-Entry GL", ur: "جنرل لیجر" },
    ],
  },

  "/accounting": {
    key: "/accounting",
    category: "finance",
    title: {
      en: "Double-Entry Accounting, Chart of Accounts & General Ledger",
      ur: "ڈبل انٹری اکاؤنٹنگ، جنرل لیجر اور فنانشل اسٹیٹمنٹس",
    },
    section: {
      en: "Finance & Ledgers",
      ur: "فنانس اور کھاتے (Ledgers)",
    },
    summary: {
      en: "Enterprise IFRS/GAAP-compliant Double-Entry Accounting suite. Includes Chart of Accounts (1000 Assets to 5000 Expenses), General Ledger (GL) Journal Vouchers, Trial Balance, Balance Sheet, Income Statement, Manual Journal Entry (JV) wizard, and Tax/GST Sub-Ledger.",
      ur: "مکمل اور مستند ڈبل انٹری اکاؤنٹنگ سسٹم۔ اس میں چارٹ آف اکاؤنٹس (Assets، Liabilities، Equity، Revenue، Expenses)، جنرل لیجر (GL)، ٹرائل بیلنس (Trial Balance)، بیلنس شیٹ، مینوئل جرنل واؤچر (JV) اور ٹیکس لیجر شامل ہیں۔",
    },
    features: {
      en: [
        "Chart of Accounts (COA): structured 1000–5000 account hierarchy with live normal Debit/Credit balances and custom account creation.",
        "General Ledger & Auto-Postings: view every automated journal voucher from Sales, Purchases, Returns, Expenses, and Payroll alongside Manual JVs.",
        "Manual Journal Voucher (JV) Entry: record Owner Capital injections, Drawings, Depreciation, Fixed Asset purchases, or adjustments with strict Debit = Credit validation.",
        "Trial Balance & Balance Sheet: real-time verification that Total Debits equal Total Credits and Assets = Liabilities + Equity.",
        "One-click 'Sync Historical Transactions to GL' to backfill any legacy invoices into the double-entry ledger.",
      ],
      ur: [
        "چارٹ آف اکاؤنٹس (COA): اثاثہ جات (1000)، واجبات (2000)، سرمایہ (3000)، آمدنی (4000) اور اخراجات (5000) کے تمام کھاتے۔",
        "جنرل لیجر (GL): سیلز، پرچیز، ریٹرن، اخراجات اور تنخواہوں کی خودکار ڈبل انٹریز کے ساتھ ساتھ مینوئل واؤچرز کا ریکارڈ۔",
        "مینوئل جرنل واؤچر (JV): مالک کا سرمایہ (Capital)، ذاتی استعمال کی رقم (Drawing)، مشینری/فرنیچر کی خریداری یا دیگر ایڈجسٹمنٹ انٹریز (Debit = Credit کے اصول کے ساتھ)۔",
        "ٹرائل بیلنس اور بیلنس شیٹ: ایک کلک پر مکمل مالیاتی توازن اور پی ڈی ایف پرنٹ۔",
      ],
    },
    steps: {
      en: [
        "Switch between tabs: Overview & Statements, Chart of Accounts, General Ledger (JVs), Trial Balance, or Tax Register.",
        "Click '+ Post Journal Voucher (JV)' to record capital, drawings, or manual accounting entries.",
        "Use 'Sync GL' if you ever need to re-synchronize historical operational documents into the ledger.",
      ],
      ur: [
        "مطلوبہ ٹیب منتخب کریں: چارٹ آف اکاؤنٹس، جنرل لیجر، ٹرائل بیلنس یا بیلنس شیٹ۔",
        "نئی جرنل انٹری (JV) ڈالنے کے لیے '+ Post Journal Voucher' پر کلک کریں اور Debit و Credit برابر رکھ کر محفوظ کریں۔",
        "کسی بھی اسٹیٹمنٹ کا PDF پرنٹ نکالنے کے لیے Print/Export بٹن دبائیں۔",
      ],
    },
    impacts: {
      en: "Serves as the authoritative financial backbone of the ERP, tying together Inventory, AR, AP, Cash/Banks, Expenses, Payroll, and Equity.",
      ur: "یہ پورے سافٹ ویئر کا مرکزی مالیاتی ستون ہے جو تمام اسٹاک، کیش، بینک، ادھار اور منافع کا مکمل حساب رکھتا ہے۔",
    },
    shortcuts: [],
    faqs: [
      {
        q: { en: "Do I have to enter Sales and Purchases manually in the General Ledger?", ur: "کیا سیلز اور پرچیز کی انٹری جنرل لیجر میں الگ سے کرنی پڑتی ہے؟" },
        a: {
          en: "No! Karobar App automatically posts balanced Double-Entry Journal Vouchers whenever you create a Sale, Purchase, Return, Payment, Expense, or Payroll disbursement. You only use Manual JVs for non-invoice items like Owner Capital, Drawings, or Depreciation.",
          ur: "ہرگز نہیں! جب بھی آپ سیل، پرچیز، ریٹرن، پیمنٹ یا خرچہ درج کرتے ہیں تو سسٹم خودکار طور پر جنرل لیجر میں اس کی ڈبل انٹری کر دیتا ہے۔ آپ کو صرف سرمایہ (Capital) یا ذاتی اخراجات (Drawings) وغیرہ کے لیے مینوئل JV ڈالنے کی ضرورت ہوتی ہے۔",
        },
      },
    ],
    relatedRoutes: [
      { path: "/accounts", en: "Financial Accounts", ur: "مالیاتی اکاؤنٹس" },
      { path: "/reports/net-profit", en: "Profit & Loss Statement", ur: "نفع و نقصان کی رپورٹ" },
      { path: "/reports/tax-return", en: "Statutory Tax Return", ur: "ٹیکس اور جی ایس ٹی گوشوارہ" },
    ],
  },

  "/hr-payroll": {
    key: "/hr-payroll",
    category: "finance",
    title: {
      en: "HR, Attendance, Monthly Payroll & Sales Commissions",
      ur: "ایچ آر (HR)، حاضری، ماہانہ تنخواہ اور سیلز کمیشن سینٹر",
    },
    section: {
      en: "Finance & HR",
      ur: "فنانس اور اسٹاف مینجمنٹ",
    },
    summary: {
      en: "Complete staff management suite with 4 integrated modules: Employee Directory & Salary Advances, Daily Attendance Sheet, Monthly Payroll Generation & Salary Disbursement, and Automated Salesperson Commission Ledger.",
      ur: "عملے (Staff) کے انتظام کا مکمل سسٹم جس میں 4 حصے شامل ہیں: (1) ملازمین کا ریکارڈ اور ایڈوانس تنخواہ، (2) روزانہ حاضری (Attendance)، (3) ماہانہ تنخواہ کی تیاری اور ادائیگی (Payroll)، اور (4) سیلز مین کمیشن کا حساب۔",
    },
    features: {
      en: [
        "Tab 1 — Staff Directory & Advances: register employees, link to system users, set base salary + allowances + commission rules, and issue Salary Advances/Loans.",
        "Tab 2 — Daily Attendance: mark Present, Late, Half-Day, Absent, Paid Leave, or Holiday for all staff in one click.",
        "Tab 3 — Monthly Payroll: auto-calculates pro-rated salary, deducts absent days and salary advances, includes earned sales commissions, and disburses net pay from Cash/Bank.",
        "Tab 4 — Sales Commissions: tracks invoice-level salesperson commissions (% of Net Sales, % of Gross Profit, or Fixed per Invoice) and settles unpaid commissions.",
      ],
      ur: [
        "ٹیب 1 — اسٹاف ڈائریکٹری اور ایڈوانس: ملازمین کا نام، عہدہ، بنیادی تنخواہ، الاؤنس اور کمیشن کا اصول درج کریں اور اگر ملازم ایڈوانس (پیشگی رقم) لے تو وہ بھی ریکارڈ کریں۔",
        "ٹیب 2 — روزانہ حاضری (Attendance): تمام عملے کی حاضری (Present، Late، Half Day، Absent، Leave) ایک کلک سے لگائیں۔",
        "ٹیب 3 — ماہانہ پے رول (Payroll): مہینے کے آخر میں حاضری، چھٹیوں کی کٹوتی، ایڈوانس کٹوتی اور کمیشن شامل کر کے خودکار تنخواہ تیار کریں اور کیش/بینک سے ادا کریں۔",
        "ٹیب 4 — سیلز کمیشن: سیلز مین کی فروخت یا منافع پر بننے والا کمیشن خودکار ٹریک کریں اور ادائیگی کریں۔",
      ],
    },
    steps: {
      en: [
        "In 'Staff Directory', add your employees with their Basic Salary, Allowances, and Commission structure.",
        "In 'Attendance', mark daily staff attendance (or use 'Mark All Present').",
        "At month-end, open 'Monthly Payroll', click Generate Payroll for the month, review net payable salaries, and click Pay/Disburse.",
      ],
      ur: [
        "سب سے پہلے 'Directory' ٹیب میں ملازمین کا ریکارڈ اور تنخواہ درج کریں۔",
        "'Attendance' ٹیب میں روزانہ کی حاضری لگائیں۔",
        "مہینے کے آخر میں 'Payroll' ٹیب کھول کر پورے مہینے کی تنخواہ جنریٹ کریں، ایڈوانس کٹوتی چیک کریں اور تنخواہ ادا (Disburse) کر کے سلپ پرنٹ کریں۔",
      ],
    },
    impacts: {
      en: "Salary advances, payroll disbursements, and commission payouts automatically deduct from your chosen Cash/Bank account and post to Operating Expenses & General Ledger.",
      ur: "تنخواہ، ایڈوانس اور کمیشن کی ادائیگی خودکار طور پر کیش ڈراور یا بینک سے منہا ہوتی ہے اور دکان کے اخراجات و جنرل لیجر میں شامل ہو جاتی ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/expenses", en: "Operating Expenses", ur: "کاروباری اخراجات" },
      { path: "/accounting", en: "Double-Entry GL", ur: "ڈبل انٹری اکاؤنٹنگ" },
      { path: "/users", en: "System Login Users", ur: "سسٹم یوزرز" },
    ],
  },

  // ============================================================================
  // 7. REPORTS SUITE
  // ============================================================================
  "/reports": {
    key: "/reports",
    category: "reports",
    title: { en: "Business Reports Center", ur: "کاروباری رپورٹس کا مرکز" },
    section: { en: "Reports", ur: "رپورٹس اور تجزیہ" },
    summary: {
      en: "Comprehensive suite of Financial, Tax, Sales, Purchase, Return, and Inventory reports with date filtering, PDF download, and direct printing.",
      ur: "مالیاتی، ٹیکس، سیلز، خریداری اور اسٹاک کی تمام تفصیلی رپورٹس۔ ہر رپورٹ کو تاریخ کے لحاظ سے فلٹر کیا جا سکتا ہے اور PDF یا پرنٹ نکالا جا سکتا ہے۔",
    },
    features: {
      en: ["Financial & Tax Reports (P&L, Tax Return, COGS, Aging).", "Sales & Purchase Detail/Summary Reports.", "Stock Valuation, Low Stock Reorder, Comprehensive Ledger & Near-Expiry Reports."],
      ur: ["نفع و نقصان، ٹیکس گوشوارہ، لاگت (COGS) اور بقایاجات کی رپورٹس۔", "سیلز، پرچیز اور ریٹرنز کی تفصیلی رپورٹس۔", "موجودہ اسٹاک کی مالیت، کم اسٹاک اور ایکسپائری رپورٹس۔"],
    },
    steps: {
      en: ["Pick any report from the Reports menu in the sidebar or search via Alt+K."],
      ur: ["سائیڈ بار کے Reports مینو سے یا Alt+K دبا کر مطلوبہ رپورٹ منتخب کریں۔"],
    },
    impacts: { en: "Read-only analytical reporting suite.", ur: "کاروباری تجزیے اور پرنٹنگ کے لیے رپورٹس۔" },
    shortcuts: [{ keys: ["Alt", "K"], en: "Quick Search Any Report", ur: "کوئی بھی رپورٹ فوری تلاش کریں" }],
    faqs: [],
    relatedRoutes: [
      { path: "/reports/net-profit", en: "Net Profit (P&L)", ur: "نفع و نقصان (P&L)" },
      { path: "/reports/current-stock", en: "Current Stock Report", ur: "موجودہ اسٹاک رپورٹ" },
    ],
  },

  "/reports/net-profit": {
    key: "/reports/net-profit",
    category: "reports",
    title: {
      en: "Profit & Loss Statement (Net Profit Report)",
      ur: "نفع و نقصان کی رپورٹ (Profit & Loss Statement)",
    },
    section: {
      en: "Reports — Financial & Tax",
      ur: "رپورٹس — مالیاتی اور ٹیکس",
    },
    summary: {
      en: "Complete Income Statement calculating Gross Sales − Sale Returns = Net Revenue, minus Cost of Goods Sold (COGS) = Gross Profit, minus Operating Expenses = Net Profit for any selected period.",
      ur: "کسی بھی منتخب تاریخ کے دوران کاروبار کی کل فروخت، سیل ریٹرن، فروخت شدہ مال کی اصل لاگت (Cost of Sale)، مجموعی منافع (Gross Profit)، دکان کے اخراجات اور خالص منافع (Net Profit) کا مکمل حساب۔",
    },
    features: {
      en: [
        "Accurate batch-cost COGS deduction to show true Gross Margin % and Net Profit %.",
        "Breakdown of Operating Expenses by category during the period.",
        "Export to PDF or Print official P&L Statement.",
      ],
      ur: [
        "فروخت شدہ مال کی اصل قیمتِ خرید منہا کر کے حقیقی منافع (Gross & Net Profit) دکھاتا ہے۔",
        "منتخب تاریخ کے تمام کاروباری اخراجات کی کیٹیگری وائز تفصیل۔",
        "پی ڈی ایف ڈاؤن لوڈ اور پرنٹ کی سہولت۔",
      ],
    },
    steps: {
      en: [
        "Select your From and To dates (e.g., current month) and click Generate/Filter.",
        "Review Gross Revenue, COGS, Gross Profit, Expenses, and Net Profit.",
        "Click Print or Export PDF for management review.",
      ],
      ur: [
        "شروع اور آخر کی تاریخ منتخب کریں۔",
        "کل سیلز، مال کی لاگت، اخراجات اور خالص منافع کا جائزہ لیں۔",
        "پرنٹ یا PDF محفوظ کرنے کے لیے اوپر دیے گئے بٹن استعمال کریں۔",
      ],
    },
    impacts: { en: "Read-only financial statement.", ur: "یہ رپورٹ صرف دیکھنے اور پرنٹ کرنے کے لیے ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/reports/cost-of-sale", en: "Cost of Sale Report", ur: "لاگتِ فروخت (COGS) رپورٹ" },
      { path: "/expenses", en: "Operating Expenses", ur: "کاروباری اخراجات" },
    ],
  },

  "/reports/tax-return": {
    key: "/reports/tax-return",
    category: "reports",
    title: {
      en: "Statutory Tax & GST Return Report",
      ur: "ٹیکس اور جی ایس ٹی (GST) گوشوارہ رپورٹ",
    },
    section: {
      en: "Reports — Financial & Tax",
      ur: "رپورٹس — مالیاتی اور ٹیکس",
    },
    summary: {
      en: "Summarizes Output Sales Tax collected on Sale Invoices vs. Input Tax paid on Purchase Invoices and Withholding Tax (WHT), calculating your Net GST Payable or Refundable Credit for FBR/statutory filing.",
      ur: "سیل بلوں پر وصول کیے گئے ٹیکس (Output Tax) اور خریداری کے بلوں پر ادا کیے گئے ٹیکس (Input Tax / WHT) کا موازنہ کر کے بتاتا ہے کہ حکومت کو کتنا ٹیکس جمع کروانا باقی ہے یا کتنا کریڈٹ موجود ہے۔",
    },
    features: {
      en: [
        "Net Tax Liability calculation: Output Tax − Input Tax = Net Tax Payable / Carry-Forward Credit.",
        "Invoice-by-invoice taxable amount and tax breakdown for both Sales and Purchases.",
        "Printable statutory tax summary PDF for your tax consultant.",
      ],
      ur: [
        "آؤٹ پٹ ٹیکس اور ان پٹ ٹیکس کا خودکار موازنہ اور خالص واجب الادا ٹیکس کا حساب۔",
        "ٹیکس والے تمام سیل اور پرچیز بلوں کی الگ الگ فہرست۔",
        "ٹیکس وکیل یا اکاؤنٹنٹ کو دینے کے لیے تیار شدہ PDF رپورٹ۔",
      ],
    },
    steps: {
      en: [
        "Select the tax period (e.g., monthly filing dates) and review Output vs. Input tax cards.",
        "Export or print the PDF for tax return filing.",
      ],
      ur: [
        "مطلوبہ مہینے کی تاریخیں منتخب کریں اور ٹیکس کا خلاصہ چیک کریں۔",
        "گوشوارہ جمع کروانے کے لیے PDF پرنٹ نکال لیں۔",
      ],
    },
    impacts: { en: "Read-only statutory tax report.", ur: "ٹیکس کے حساب کتاب کی معلوماتی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/accounting", en: "Double-Entry GL & Tax Payment", ur: "اکاؤنٹنگ اور ٹیکس چالان انٹری" },
      { path: "/reports/net-profit", en: "Profit & Loss Report", ur: "نفع و نقصان کی رپورٹ" },
    ],
  },

  "/reports/cost-of-sale": {
    key: "/reports/cost-of-sale",
    category: "reports",
    title: { en: "Cost of Sale (COGS) Summary Report", ur: "لاگتِ فروخت (Cost of Sale) کی خلاصہ رپورٹ" },
    section: { en: "Reports — Financial & Tax", ur: "رپورٹس — مالیاتی اور ٹیکس" },
    summary: {
      en: "Analyzes invoice-wise Sale Value vs. Purchase Cost of sold items to show exact Gross Profit and Margin % earned each day or per invoice.",
      ur: "فروخت کیے گئے مال کی قیمتِ فروخت اور اس کی اصل قیمتِ خرید کا موازنہ کر کے ہر بل اور ہر دن کا منافع دکھاتی ہے۔",
    },
    features: {
      en: ["Shows Sale Revenue, Cost of Goods Sold, Gross Profit, and Margin % across your chosen date range.", "Export PDF or print."],
      ur: ["منتخب تاریخوں میں ہونے والی سیل، اس کی اصل لاگت اور خالص مارجن دکھاتی ہے۔", "پی ڈی ایف ایکسپورٹ اور پرنٹ کی سہولت۔"],
    },
    steps: {
      en: ["Select From–To dates and filter by customer/type if needed, then review profit margins."],
      ur: ["تاریخ منتخب کر کے رپورٹ لوڈ کریں اور منافع کا جائزہ لیں۔"],
    },
    impacts: { en: "Read-only margin analysis report.", ur: "منافع کے تجزیے کی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/reports/cost-of-sale-detail", en: "Cost of Sale Detail", ur: "لاگتِ فروخت کی تفصیلی رپورٹ" }],
  },

  "/reports/cost-of-sale-detail": {
    key: "/reports/cost-of-sale-detail",
    category: "reports",
    title: { en: "Cost of Sale Detail (Item-Wise Margin) Report", ur: "لاگتِ فروخت کی تفصیلی رپورٹ (آئٹم وائز منافع)" },
    section: { en: "Reports — Financial & Tax", ur: "رپورٹس — مالیاتی اور ٹیکس" },
    summary: {
      en: "Line-by-line product profitability report showing every sold item's quantity, unit sale price, unit purchase cost, and exact profit earned.",
      ur: "ہر فروخت شدہ پروڈکٹ کی مقدار، اس کی قیمتِ خرید، قیمتِ فروخت اور ہر آئٹم پر حاصل ہونے والے منافع کی مکمل تفصیل۔",
    },
    features: {
      en: ["Filter by Date Range, Product, Brand, or Customer.", "Identifies your highest-margin and lowest-margin products."],
      ur: ["تاریخ، پروڈکٹ، برانڈ یا گاہک کے لحاظ سے فلٹر کریں۔", "جانیں کہ کون سا آئٹم سب سے زیادہ منافع دے رہا ہے۔"],
    },
    steps: {
      en: ["Pick your date range and optional product/brand filter to inspect item-level profit."],
      ur: ["تاریخ اور فلٹر منتخب کر کے ہر آئٹم کا منافع چیک کریں۔"],
    },
    impacts: { en: "Read-only analytical report.", ur: "آئٹم وائز منافع کی معلوماتی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/reports/cost-of-sale", en: "Cost of Sale Summary", ur: "لاگتِ فروخت کا خلاصہ" }],
  },

  "/reports/outstanding-aging": {
    key: "/reports/outstanding-aging",
    category: "reports",
    title: {
      en: "Outstanding Aging Report (Receivables & Payables)",
      ur: "بقایاجات کی ایجنگ رپورٹ (پرانے ادھار کی تفصیل)",
    },
    section: {
      en: "Reports — Financial & Tax",
      ur: "رپورٹس — مالیاتی اور ٹیکس",
    },
    summary: {
      en: "Breaks down unpaid customer receivables and supplier payables by age buckets (0–30 days, 31–60 days, 61–90 days, 90+ days overdue) so you can prioritize collections.",
      ur: "گاہکوں کے ذمے واجب الادا ادھار اور سپلائرز کی ادائیگیوں کو مدت (30 دن، 60 دن، 90 دن سے پرانا ادھار) کے لحاظ سے تقسیم کر کے دکھاتی ہے تاکہ پرانے بقایاجات کی وصولی بروقت کی جا سکے۔",
    },
    features: {
      en: [
        "Aging Buckets showing how long balances have been outstanding.",
        "Direct contact numbers and printable aging schedules for recovery staff.",
      ],
      ur: [
        "واضح ایجنگ کالم (30، 60، 90+ دن) جن سے معلوم ہوتا ہے کہ کون سا ادھار کتنا پرانا ہے۔",
        "ریکوری اسٹاف کے لیے پرنٹ اور پی ڈی ایف ایکسپورٹ۔",
      ],
    },
    steps: {
      en: [
        "Review the aging buckets and identify accounts in the 60+ or 90+ day columns.",
        "Print or export the PDF for collection follow-up.",
      ],
      ur: [
        "پرانے بقایاجات والے گاہکوں کی فہرست چیک کریں۔",
        "ریکوری کے لیے رپورٹ پرنٹ کریں یا کسٹمر کھاتے میں جا کر وصولی درج کریں۔",
      ],
    },
    impacts: { en: "Read-only credit recovery report.", ur: "ادھار کی ریکوری میں مدد دینے والی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
      { path: "/supplier-ledger", en: "Supplier Ledger", ur: "سپلائر کھاتہ" },
    ],
  },

  "/reports/overdue-work-queue": {
    key: "/reports/overdue-work-queue",
    category: "reports",
    title: { en: "Overdue Collections Work Queue", ur: "واجب الادا وصولیوں کی فہرست (Overdue Queue)" },
    section: { en: "Reports — Financial & Tax", ur: "رپورٹس — مالیاتی اور ٹیکس" },
    summary: {
      en: "Actionable follow-up queue of invoices that have passed their payment Due Date.",
      ur: "ان ادھار بلوں کی فہرست جن کی ادائیگی کی مقررہ تاریخ (Due Date) گزر چکی ہے تاکہ گاہکوں سے فوری رابطہ کیا جا سکے۔",
    },
    features: { en: ["Prioritizes overdue invoices by days past due and balance amount."], ur: ["مقررہ تاریخ سے اوپر ہونے والے دنوں اور بقایا رقم کی تفصیل۔"] },
    steps: { en: ["Contact customers listed in the queue and record payments in Customer Ledger."], ur: ["فہرست میں موجود گاہکوں سے رابطہ کریں اور وصولی درج کریں۔"] },
    impacts: { en: "Read-only collections queue.", ur: "ریکوری فالو اپ رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/reports/outstanding-aging", en: "Outstanding Aging", ur: "ایجنگ رپورٹ" }],
  },

  "/reports/sale-detail": {
    key: "/reports/sale-detail",
    category: "reports",
    title: { en: "Sales Detail Report", ur: "سیلز کی تفصیلی رپورٹ (Sale Detail)" },
    section: { en: "Reports — Sales & Purchases", ur: "رپورٹس — سیلز اور خریداری" },
    summary: {
      en: "Comprehensive report of all sales transactions and sold line items filtered by date range, customer, product, brand, or user/salesperson.",
      ur: "منتخب تاریخوں میں ہونے والی تمام سیلز، فروخت شدہ آئٹمز، مقدار، ڈسکاؤنٹ اور کل رقم کی تفصیلی رپورٹ۔",
    },
    features: {
      en: ["Filter by Date Range, Customer, Product, Brand, or Cashier/User.", "Print or export PDF."],
      ur: ["تاریخ، گاہک، پروڈکٹ، برانڈ یا سیلز مین کے لحاظ سے فلٹر کریں۔", "پرنٹ اور PDF ڈاؤن لوڈ کی سہولت۔"],
    },
    steps: { en: ["Select your date range and filters, then click Generate/Search."], ur: ["تاریخ اور فلٹر منتخب کر کے رپورٹ دیکھیں اور پرنٹ نکالیں۔"] },
    impacts: { en: "Read-only sales analytics report.", ur: "سیلز کے تجزیے کی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/sale-invoices", en: "Sale Invoices", ur: "سیل انوائسز" }],
  },

  "/reports/purchase-detail": {
    key: "/reports/purchase-detail",
    category: "reports",
    title: { en: "Purchase Detail Report", ur: "خریداری کی تفصیلی رپورٹ (Purchase Detail)" },
    section: { en: "Reports — Sales & Purchases", ur: "رپورٹس — سیلز اور خریداری" },
    summary: {
      en: "Detailed line-item report of all inventory purchases filtered by date range, supplier, product, or brand.",
      ur: "کسی بھی تاریخ کے دوران سپلائرز سے خریدے گئے تمام آئٹمز، بیچ، ریٹ، بونس اور کل رقم کی تفصیلی رپورٹ۔",
    },
    features: {
      en: ["Filter by Supplier, Product, Brand, and Date Range.", "Export PDF or print."],
      ur: ["سپلائر، پروڈکٹ، برانڈ اور تاریخ کے حساب سے فلٹر کریں۔", "پی ڈی ایف اور پرنٹ کی سہولت۔"],
    },
    steps: { en: ["Choose your date window and optional supplier/product filters."], ur: ["تاریخ اور سپلائر منتخب کر کے خریداری کا مکمل ریکارڈ دیکھیں۔"] },
    impacts: { en: "Read-only purchase analysis report.", ur: "خریداری کے تجزیے کی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/purchase-invoices", en: "Purchase Invoices", ur: "پرچیز انوائسز" }],
  },

  "/reports/purchase-summary": {
    key: "/reports/purchase-summary",
    category: "reports",
    title: { en: "Purchase Summary Report", ur: "خریداری کا خلاصہ (Purchase Summary)" },
    section: { en: "Reports — Sales & Purchases", ur: "رپورٹس — سیلز اور خریداری" },
    summary: {
      en: "Invoice-level summary of all supplier purchases showing invoice totals, paid amounts, and remaining balances.",
      ur: "تمام پرچیز بلوں کا خلاصہ جس میں کل بل، ادا شدہ رقم اور بقایاجات ایک ہی ٹیبل میں نظر آتے ہیں۔",
    },
    features: { en: ["Date range and supplier filtering with summary KPI cards and PDF export."], ur: ["تاریخ اور سپلائر فلٹر مع پی ڈی ایف پرنٹ۔"] },
    steps: { en: ["Select From–To dates and supplier to view summarized purchase totals."], ur: ["تاریخ اور سپلائر منتخب کر کے خلاصہ دیکھیں۔"] },
    impacts: { en: "Read-only summary report.", ur: "معلوماتی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/reports/purchase-detail", en: "Purchase Detail Report", ur: "پرچیز تفصیلی رپورٹ" }],
  },

  "/reports/sale-returns": {
    key: "/reports/sale-returns",
    category: "reports",
    title: { en: "Sale Returns Report", ur: "سیل ریٹرنز کی رپورٹ" },
    section: { en: "Reports — Sales & Purchases", ur: "رپورٹس — سیلز اور خریداری" },
    summary: {
      en: "Summary and list of all customer sale returns within a selected period.",
      ur: "منتخب تاریخوں میں گاہکوں کی طرف سے واپس کیے گئے تمام مال اور رقوم کی رپورٹ۔",
    },
    features: { en: ["Tracks total return count, returned units, and refunded value with PDF export."], ur: ["واپس آنے والے یونٹس اور کل رقم کا حساب مع پرنٹ سہولت۔"] },
    steps: { en: ["Set the date range to review customer return volume."], ur: ["تاریخ منتخب کر کے سیل ریٹرن کا ریکارڈ چیک کریں۔"] },
    impacts: { en: "Read-only report.", ur: "صرف دیکھنے اور پرنٹ کرنے کی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/sale-returns", en: "Sale Returns", ur: "سیل ریٹرنز" }],
  },

  "/reports/purchase-returns": {
    key: "/reports/purchase-returns",
    category: "reports",
    title: { en: "Purchase Returns Report", ur: "پرچیز ریٹرنز (سپلائر واپسی) کی رپورٹ" },
    section: { en: "Reports — Sales & Purchases", ur: "رپورٹس — سیلز اور خریداری" },
    summary: {
      en: "Report of all goods returned to suppliers/distributors within a chosen date range.",
      ur: "سپلائرز کو واپس بھیجے گئے مال اور ڈیبٹ نوٹس کی مکمل رپورٹ۔",
    },
    features: { en: ["Filter by date range and supplier; export to PDF or print."], ur: ["تاریخ اور سپلائر کے لحاظ سے فلٹر اور پی ڈی ایف پرنٹ۔"] },
    steps: { en: ["Select dates and optional supplier to view purchase return totals."], ur: ["تاریخ منتخب کر کے سپلائر واپسی کی رپورٹ دیکھیں۔"] },
    impacts: { en: "Read-only report.", ur: "معلوماتی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/purchase-returns", en: "Purchase Returns", ur: "پرچیز ریٹرنز" }],
  },

  "/reports/current-stock": {
    key: "/reports/current-stock",
    category: "reports",
    title: {
      en: "Current Stock & Inventory Valuation Report",
      ur: "موجودہ اسٹاک اور انوینٹری مالیت کی رپورٹ",
    },
    section: {
      en: "Reports — Inventory & Stock",
      ur: "رپورٹس — اسٹاک اور انوینٹری",
    },
    summary: {
      en: "Live snapshot of all on-hand inventory quantities, pack sizes, purchase cost valuation, and retail sale valuation across your store—filterable by Category, Brand, Supplier, or Rack.",
      ur: "اس وقت آپ کی دکان اور گودام میں موجود تمام مال کی مقدار، اس کی کل قیمتِ خرید (Cost Value) اور کل قیمتِ فروخت (Sale Value) کی مکمل رپورٹ۔",
    },
    features: {
      en: [
        "Calculates Total Stock Cost Value and Total Retail Value of your entire inventory.",
        "Filter by Category, Brand, Supplier, or Stock status (In Stock, Low Stock, Out of Stock).",
        "Print or export PDF for bank audits or insurance valuation.",
      ],
      ur: [
        "پوری دکان کے موجودہ اسٹاک کی کل مالیت (خرید اور فروخت دونوں کے حساب سے) دکھاتی ہے۔",
        "کیٹیگری، برانڈ یا سپلائر کے لحاظ سے اسٹاک چیک کریں۔",
        "آڈٹ کے لیے مکمل اسٹاک رپورٹ پرنٹ یا PDF ڈاؤن لوڈ کریں۔",
      ],
    },
    steps: {
      en: [
        "Apply any Category, Brand, or Supplier filter if needed.",
        "Review the top Valuation KPIs and item table, or click Export PDF / Print.",
      ],
      ur: [
        "اگر کسی خاص کمپنی یا کیٹیگری کا اسٹاک دیکھنا ہو تو فلٹر لگائیں۔",
        "کل اسٹاک ویلیو دیکھیں اور ضرورت ہو تو پرنٹ نکال لیں۔",
      ],
    },
    impacts: { en: "Read-only inventory valuation report.", ur: "اسٹاک کی مالیت جانچنے کی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
      { path: "/reports/reorder", en: "Low Stock & Reorder Report", ur: "کم اسٹاک رپورٹ" },
    ],
  },

  "/reports/reorder": {
    key: "/reports/reorder",
    category: "reports",
    title: { en: "Low Stock & Reorder Report", ur: "کم اسٹاک اور ری آرڈر رپورٹ (Low Stock)" },
    section: { en: "Reports — Inventory & Stock", ur: "رپورٹس — اسٹاک اور انوینٹری" },
    summary: {
      en: "Lists all products whose on-hand quantity has fallen below their pack size or reorder threshold, grouped or filtered by Supplier so you can reorder immediately.",
      ur: "ان تمام اشیاء کی فہرست جن کا اسٹاک ختم ہو چکا ہے یا پیک سائز سے کم رہ گیا ہے، تاکہ آپ سپلائر کو بروقت نیا آرڈر لکھوا سکیں۔",
    },
    features: {
      en: ["Filter by Supplier to see all low-stock items from that vendor.", "Print or share reorder list directly with supplier bookers."],
      ur: ["سپلائر کے حساب سے فلٹر کریں تاکہ معلوم ہو کہ کس ڈسٹری بیوٹر سے کیا منگوانا ہے۔", "فہرست پرنٹ کریں یا واٹس ایپ پر شیئر کریں۔"],
    },
    steps: {
      en: ["Filter by Supplier if desired, review shortage items, and print or jump to Smart Reorder Forecast."],
      ur: ["سپلائر منتخب کریں، کم اسٹاک والے آئٹمز دیکھیں اور آرڈر تیار کریں۔"],
    },
    impacts: { en: "Read-only shortage report.", ur: "کم اسٹاک کی نشاندہی کرنے والی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/purchase-orders/forecast", en: "Smart Reorder Forecast", ur: "سمارٹ ری آرڈر فورکاسٹ" }],
  },

  "/reports/product-comprehensive": {
    key: "/reports/product-comprehensive",
    category: "reports",
    title: {
      en: "Product Comprehensive History (Item Stock Card)",
      ur: "پروڈکٹ کی مکمل ہسٹری رپورٹ (اسٹاک کارڈ / کھاتہ)",
    },
    section: {
      en: "Reports — Inventory & Stock",
      ur: "رپورٹس — اسٹاک اور انوینٹری",
    },
    summary: {
      en: "Complete item-level audit trail showing every single Purchase, Sale, Return, Adjustment, and Disposal for a selected product—answering 'Where did every unit of this product go?'",
      ur: "کسی بھی ایک پروڈکٹ کا مکمل ریکارڈ۔ اس سے آپ دیکھ سکتے ہیں کہ یہ آئٹم کب اور کس سے خریدا گیا، کس گاہک کو کب فروخت ہوا، کتنا واپس آیا اور موجودہ اسٹاک کیسے بنا۔",
    },
    features: {
      en: ["Tracks Opening Stock, Inward Purchases, Outward Sales, Returns, Adjustments, and Closing Stock.", "Essential for resolving stock count mysteries."],
      ur: ["پروڈکٹ کی ایک ایک یونٹ کے آنے اور جانے کا مکمل حساب دکھاتا ہے۔", "اسٹاک کا فرق چیک کرنے کے لیے بہترین رپورٹ ہے۔"],
    },
    steps: {
      en: ["Search and select the Product, choose the Date Range, and review its complete movement ledger."],
      ur: ["پروڈکٹ منتخب کریں اور تاریخ مقرر کر کے اس کی مکمل ہسٹری دیکھیں۔"],
    },
    impacts: { en: "Read-only item audit ledger.", ur: "پروڈکٹ کے آڈٹ کی معلوماتی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" }],
  },

  "/reports/near-expiry-product": {
    key: "/reports/near-expiry-product",
    category: "reports",
    title: { en: "Near Expiry Product Report", ur: "قریب ایکسپائری پروڈکٹس کی رپورٹ" },
    section: { en: "Reports — Inventory & Stock", ur: "رپورٹس — اسٹاک اور انوینٹری" },
    summary: {
      en: "Printable report of batches expiring within your specified window (e.g., next 30, 60, 90, or 180 days), filterable by Supplier and Brand.",
      ur: "آئندہ چند ماہ میں ایکسپائر ہونے والے تمام بیچز کی پرنٹ ایبل رپورٹ جسے آپ سپلائر یا کمپنی کے لحاظ سے فلٹر کر سکتے ہیں۔",
    },
    features: {
      en: ["Filter by Expiry Window, Supplier, or Brand.", "Export PDF to send to suppliers for return/replacement claims."],
      ur: ["سپلائر یا کمپنی کے لحاظ سے قریب ایکسپائری مال کی فہرست نکالیں۔", "سپلائر سے ایکسپائری کلیم کرنے کے لیے PDF پرنٹ کریں۔"],
    },
    steps: {
      en: ["Select the expiry timeframe and supplier filter, then print or export PDF."],
      ur: ["مدت اور سپلائر منتخب کر کے رپورٹ پرنٹ کریں۔"],
    },
    impacts: { en: "Read-only expiry report.", ur: "ایکسپائری کلیم اور آڈٹ کے لیے رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/batch-expiry", en: "Interactive Batch Expiry Radar", ur: "بیچ ایکسپائری ریڈار" }],
  },

  "/reports/stock-adjustment": {
    key: "/reports/stock-adjustment",
    category: "reports",
    title: { en: "Stock Adjustment Audit Report", ur: "اسٹاک ایڈجسٹمنٹ آڈٹ رپورٹ" },
    section: { en: "Reports — Inventory & Stock", ur: "رپورٹس — اسٹاک اور انوینٹری" },
    summary: {
      en: "Detailed audit report of all manual stock additions and deductions over a selected date range.",
      ur: "منتخب تاریخوں کے دوران اسٹاک میں کی گئی تمام دستی کمی بیشی (Adjustments) اور ان کی وجوہات کی رپورٹ۔",
    },
    features: { en: ["Shows adjusted products, quantities, value impact, operator, and reason notes."], ur: ["ایڈجسٹ کیے گئے آئٹمز، مقدار، مالیت اور وجہ دکھاتی ہے۔"] },
    steps: { en: ["Select From–To dates to review all stock adjustments."], ur: ["تاریخ منتخب کر کے تمام ایڈجسٹمنٹس کا جائزہ لیں۔"] },
    impacts: { en: "Read-only audit report.", ur: "آڈٹ کے لیے معلوماتی رپورٹ۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/stock-adjustments", en: "Stock Adjustments", ur: "اسٹاک ایڈجسٹمنٹس" }],
  },

  // ============================================================================
  // 8. SYSTEM, SETTINGS, USERS, ROLES & BACKUPS
  // ============================================================================
  "/settings": {
    key: "/settings",
    category: "system",
    title: {
      en: "System Settings & Store Configuration",
      ur: "سسٹم سیٹنگز اور دکان کی ترتیبات",
    },
    section: {
      en: "System & Settings",
      ur: "سسٹم اور سیٹنگز",
    },
    summary: {
      en: "Configure your Store Name, Logo, Address, Drug/Business License #, Currency (Rs. / PKR), Sale System (Retail vs. Retail + Wholesale), Return/Expiry Policies, Theme Colors & Button Styles, Thermal/A4 Printer Templates, Email/SMTP, and Software License.",
      ur: "اپنی دکان کا نام، لوگو، پتہ، لائسنس نمبر، کرنسی (Rs.)، سیل سسٹم (ریٹیل یا ہول سیل)، تھیم کے رنگ، تھرمل یا A4 بل پرنٹر کا ڈیزائن، ای میل سیٹنگز اور سافٹ ویئر لائسنس یہاں سے کنٹرول کریں۔",
    },
    features: {
      en: [
        "General Tab: Store Name, Phone, Address, License #, Invoice Footer Note, Store Logo upload, and Currency format.",
        "Sale System Tab: choose Retail Only or Retail + Wholesale, plus Expiry/Return policy rules.",
        "Theme Setting Tab: customize Primary/Secondary/Tertiary brand colors, dark/light mode, and button style.",
        "Printer Setting Tab: choose Thermal (80mm) vs. A4 default printer and pick from Standard, Detailed, Compact, Bold, Barcode, or Minimal receipt templates.",
        "Email / SMTP & License Tabs: configure outgoing email for sharing invoices and view/renew your software license.",
      ],
      ur: [
        "General ٹیب: دکان کا نام، فون نمبر، پتہ، لوگو، بل کے نیچے چھپنے والا نوٹ اور کرنسی سیٹ کریں۔",
        "Sale System ٹیب: ریٹیل یا ہول سیل موڈ اور ایکسپائری/واپسی کے اصول طے کریں۔",
        "Theme ٹیب: سافٹ ویئر کے رنگ اور بٹن اسٹائل اپنی پسند کے مطابق بدلیں۔",
        "Printer ٹیب: تھرمل پرنٹر یا A4 پرنٹر اور بل کا ڈیزائن (Standard، Detailed، Compact، Barcode وغیرہ) منتخب کریں۔",
        "Email اور License ٹیب: بل ای میل کرنے کی سیٹنگ اور سافٹ ویئر لائسنس کی تفصیلات۔",
      ],
    },
    steps: {
      en: [
        "Click the desired tab at the top of Settings (General, Sale System, Theme, Printer, Email/SMTP, or License).",
        "Adjust your preferences and click Save Settings at the bottom.",
      ],
      ur: [
        "اپنی ضرورت کے مطابق متعلقہ ٹیب (General، Sale System، Theme، Printer وغیرہ) پر کلک کریں۔",
        "مطلوبہ تبدیلی کرنے کے بعد Save Settings بٹن دبائیں۔",
      ],
    },
    impacts: {
      en: "Changes here immediately update your store branding on printed receipts, topbar/sidebar themes, and billing rules across the app.",
      ur: "یہاں کی گئی تبدیلیاں فوری طور پر پرنٹ ہونے والے بلوں، سافٹ ویئر کے ڈیزائن اور بلنگ کے اصولوں پر لاگو ہو جاتی ہیں۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/users", en: "Users Management", ur: "یوزرز مینجمنٹ" },
      { path: "/roles", en: "Roles & Permissions", ur: "رولز اور اختیارات" },
      { path: "/backups", en: "Backups & Storage", ur: "ڈیٹا بیک اپ" },
    ],
  },

  "/users": {
    key: "/users",
    category: "system",
    title: {
      en: "Staff Login Users Management",
      ur: "یوزرز (اسٹاف لاگ ان اکاؤنٹس)",
    },
    section: {
      en: "System & Settings",
      ur: "سسٹم اور سیٹنگز",
    },
    summary: {
      en: "Create and manage login accounts for cashiers, pharmacists, salesmen, accountants, and managers, and assign each user their Role.",
      ur: "اپنے کیشیئر، سیلز مین، فارماسسٹ، اکاؤنٹنٹ اور منیجر کے لیے الگ الگ لاگ ان اکاؤنٹ بنائیں اور ہر ایک کو اس کے کام کے مطابق رول (Role) تفویض کریں۔",
    },
    features: {
      en: [
        "Create staff accounts with individual login emails, passwords, and assigned security roles.",
        "Link system users to HR Employee profiles for automated sales commission tracking.",
      ],
      ur: [
        "ہر ملازم کا الگ لاگ ان اور پاس ورڈ بنائیں تاکہ معلوم ہو سکے کون سا بل کس نے بنایا۔",
        "یوزر کو رول (مثلاً Cashier یا Manager) دے کر اس کے اختیارات محدود رکھیں۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Add User' to create a new staff login.",
        "Assign the appropriate Role (e.g., Admin, Cashier, Pharmacist) and click Save.",
      ],
      ur: [
        "نیا یوزر بنانے کے لیے '+ Add User' پر کلک کریں۔",
        "نام، ای میل، پاس ورڈ اور رول (Role) منتخب کر کے محفوظ کریں۔",
      ],
    },
    impacts: {
      en: "Controls who can log into Karobar App and tracks operator accountability on every invoice and shift.",
      ur: "ہر بل اور ٹرانزیکشن پر لاگ ان یوزر کا نام ریکارڈ ہوتا ہے جس سے مکمل شفافیت رہتی ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/users/create", en: "Add New User", ur: "نیا یوزر بنائیں" },
      { path: "/roles", en: "Roles & Permissions", ur: "رولز اور پرمیشنز" },
      { path: "/hr-payroll", en: "HR & Payroll", ur: "ایچ آر اور پے رول" },
    ],
  },

  "/users/create": {
    key: "/users/create",
    category: "system",
    title: { en: "Add New System User", ur: "نیا سسٹم یوزر بنائیں" },
    section: { en: "System & Settings", ur: "سسٹم اور سیٹنگز" },
    summary: {
      en: "Create a new login account for a staff member and assign their security role.",
      ur: "اسٹاف ممبر کے لیے نیا لاگ ان اکاؤنٹ، پاس ورڈ اور رول بنائیں۔",
    },
    features: { en: ["Set Name, Email, Password, and Role assignment."], ur: ["نام، ای میل، پاس ورڈ اور رول منتخب کریں۔"] },
    steps: { en: ["Fill out user credentials, select Role, and click Save."], ur: ["تفصیلات پُر کریں، رول منتخب کریں اور Save دبائیں۔"] },
    impacts: { en: "Grants system login access according to the selected role's permissions.", ur: "منتخب رول کے مطابق سافٹ ویئر استعمال کرنے کی اجازت دیتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/users", en: "Users List", ur: "یوزرز کی فہرست" }],
  },

  "/users/:id/edit": {
    key: "/users/:id/edit",
    category: "system",
    title: { en: "Edit System User", ur: "یوزر اکاؤنٹ میں ترمیم" },
    section: { en: "System & Settings", ur: "سسٹم اور سیٹنگز" },
    summary: {
      en: "Update a staff member's name, email, password, or assigned role.",
      ur: "کسی یوزر کا نام، پاس ورڈ یا رول تبدیل کریں۔",
    },
    features: { en: ["Change user role or reset password."], ur: ["یوزر کا رول بدلیں یا نیا پاس ورڈ دیں۔"] },
    steps: { en: ["Modify the desired fields and click Save."], ur: ["تبدیلی کر کے Save بٹن دبائیں۔"] },
    impacts: { en: "Immediately updates the user's permissions and login credentials.", ur: "یوزر کے اختیارات فوری اپڈیٹ ہو جاتے ہیں۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/users", en: "Users List", ur: "یوزرز کی فہرست" }],
  },

  "/roles": {
    key: "/roles",
    category: "system",
    title: {
      en: "Roles & Granular Access Permissions",
      ur: "رولز اور اختیارات (Roles & Permissions)",
    },
    section: {
      en: "System & Settings",
      ur: "سسٹم اور سیٹنگز",
    },
    summary: {
      en: "Define security roles (e.g., Cashier, Salesman, Store Keeper, Accountant, Admin) and control exactly which screens and actions (View, Create, Edit, Delete, Export, Override) each role is allowed to perform.",
      ur: "مختلف عہدوں (مثلاً کیشیئر، سیلز مین، منیجر، اکاؤنٹنٹ) کے لیے رولز بنائیں اور طے کریں کہ کون سا ملازم کون سی اسکرین دیکھ سکتا ہے اور کیا کام (بل بنانا، ایڈٹ کرنا، ڈیلیٹ کرنا یا رپورٹ دیکھنا) کر سکتا ہے۔",
    },
    features: {
      en: [
        "Granular module-by-module permission checkboxes (Products, Sales, POS, Purchases, Ledgers, Reports, Settings).",
        "Protects sensitive financial reports (like Net Profit) and prevents unauthorized invoice deletion or price/discount overrides.",
      ],
      ur: [
        "ہر ماڈیول کے لیے الگ الگ اجازت نامے (مثلاً صرف بل بنانے کی اجازت، ڈیلیٹ یا منافع دیکھنے کی اجازت بند)۔",
        "حساس مالیاتی رپورٹس اور قیمتوں میں غیر مجاز تبدیلی سے مکمل تحفظ۔",
      ],
    },
    steps: {
      en: [
        "Click '+ Create Role' to define a new staff profile, or click Edit on an existing role.",
        "Check or uncheck permissions per module and click Save.",
      ],
      ur: [
        "نیا رول بنانے کے لیے '+ Create Role' پر کلک کریں یا موجودہ رول کے آگے Edit دبائیں۔",
        "جو اختیارات دینے ہیں ان پر ٹک (Check) لگائیں اور Save کریں۔",
      ],
    },
    impacts: {
      en: "Sidebar menus, Topbar buttons, and API endpoints automatically hide or block actions the user's role does not permit.",
      ur: "جس چیز کی اجازت نہ ہو وہ مینو اور بٹن اس یوزر کے لیے خودکار طور پر چھپ جاتے ہیں۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/roles/create", en: "Create New Role", ur: "نیا رول بنائیں" },
      { path: "/users", en: "Assign Roles to Users", ur: "یوزرز کو رول دیں" },
    ],
  },

  "/roles/create": {
    key: "/roles/create",
    category: "system",
    title: { en: "Create New Security Role", ur: "نیا سیکیورٹی رول بنائیں" },
    section: { en: "System & Settings", ur: "سسٹم اور سیٹنگز" },
    summary: {
      en: "Create a custom role and select its exact module permissions.",
      ur: "نئے رول کا نام لکھیں اور اس کے اختیارات (Permissions) منتخب کریں۔",
    },
    features: { en: ["Group-wise select all or individual permission toggles."], ur: ["ماڈیول وائز اختیارات منتخب کرنے کی سہولت۔"] },
    steps: { en: ["Enter Role Name, check allowed permissions, and click Save."], ur: ["رول کا نام لکھیں، اختیارات منتخب کریں اور Save دبائیں۔"] },
    impacts: { en: "Creates a reusable security profile for staff users.", ur: "اسٹاف کے لیے نیا رول بناتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/roles", en: "Roles List", ur: "رولز کی فہرست" }],
  },

  "/roles/:id/edit": {
    key: "/roles/:id/edit",
    category: "system",
    title: { en: "Edit Role Permissions", ur: "رول کے اختیارات میں ترمیم" },
    section: { en: "System & Settings", ur: "سسٹم اور سیٹنگز" },
    summary: {
      en: "Modify permissions granted to an existing role.",
      ur: "پہلے سے بنے ہوئے رول کے اختیارات کم یا زیادہ کریں۔",
    },
    features: { en: ["Updates permissions for all users assigned to this role."], ur: ["اس رول سے منسلک تمام یوزرز کے اختیارات اپڈیٹ ہو جاتے ہیں۔"] },
    steps: { en: ["Toggle the permission checkboxes and click Save."], ur: ["اختیارات میں تبدیلی کر کے Save پر کلک کریں۔"] },
    impacts: { en: "Immediately updates access control for assigned users.", ur: "فوری طور پر رسائی کے اختیارات اپڈیٹ کرتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/roles", en: "Roles List", ur: "رولز کی فہرست" }],
  },

  "/backups": {
    key: "/backups",
    category: "system",
    title: {
      en: "Database Backups, Restore & Offsite Cloud Storage",
      ur: "ڈیٹا بیک اپ، ری اسٹور اور کلاؤڈ سٹوریج",
    },
    section: {
      en: "System & Settings",
      ur: "سسٹم اور سیٹنگز",
    },
    summary: {
      en: "Protect your business data by creating instant local database backups, downloading backup archives to USB/external drives, configuring automated schedules, or syncing offsite backups.",
      ur: "اپنے قیمتی کاروباری ڈیٹا کو محفوظ رکھنے کے لیے ایک کلک سے بیک اپ (Backup) بنائیں، اسے کمپیوٹر یا USB میں ڈاؤن لوڈ کریں، آٹو بیک اپ شیڈول سیٹ کریں یا بیک اپ فائل سے ڈیٹا دوبارہ بحال (Restore) کریں۔",
    },
    features: {
      en: [
        "One-Click Create Backup: snapshots your entire database and settings.",
        "Download backup files to your computer/USB or Restore from a previous snapshot.",
        "Configure automated backup schedules and offsite cloud storage.",
      ],
      ur: [
        "ون کلک بیک اپ: ایک بٹن دبا کر پورے سافٹ ویئر کے ڈیٹا کا محفوظ بیک اپ بنائیں۔",
        "بیک اپ فائل کو کمپیوٹر یا فلیش ڈرائیو (USB) میں ڈاؤن لوڈ کریں۔",
        "ضرورت پڑنے پر پرانے بیک اپ کو ری اسٹور (Restore) کریں۔",
      ],
    },
    steps: {
      en: [
        "Click 'Create Backup Now' to generate a fresh snapshot.",
        "Click Download on the latest backup row to keep an external copy on a USB drive.",
      ],
      ur: [
        "نیا بیک اپ بنانے کے لیے 'Create Backup' پر کلک کریں۔",
        "بیک اپ فائل کو محفوظ رکھنے کے لیے Download بٹن دبا کر USB یا دوسری ڈرائیو میں رکھ لیں۔",
      ],
    },
    impacts: {
      en: "Ensures zero data loss in case of hardware failure or system migration.",
      ur: "کمپیوٹر خراب ہونے یا ونڈوز بدلنے کی صورت میں آپ کا پورا حساب کتاب محفوظ رہتا ہے۔",
    },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [
      { path: "/settings", en: "System Settings", ur: "سسٹم سیٹنگز" },
    ],
  },

  "/activate": {
    key: "/activate",
    category: "system",
    title: { en: "Software License Activation", ur: "سافٹ ویئر لائسنس ایکٹیویشن" },
    section: { en: "System & Security", ur: "سسٹم اور لائسنس" },
    summary: {
      en: "View your Machine ID and enter your cryptographic license key to activate or renew Karobar App ERP.",
      ur: "اپنے کمپیوٹر کی Machine ID کاپی کریں اور فراہم کردہ لائسنس کی (License Key) درج کر کے سافٹ ویئر ایکٹیویٹ کریں۔",
    },
    features: {
      en: ["Copy Machine ID with one click.", "Paste and activate license key with instant verification."],
      ur: ["ایک کلک سے Machine ID کاپی کریں۔", "لائسنس کی پیسٹ کر کے فوری ایکٹیویٹ کریں۔"],
    },
    steps: {
      en: ["Copy your Machine ID and share it with your vendor to receive a license key.", "Paste the license string in the box and click Activate."],
      ur: ["Machine ID کاپی کر کے لائسنس حاصل کریں، پھر لائسنس کوڈ خانے میں پیسٹ کر کے Activate دبائیں۔"],
    },
    impacts: { en: "Unlocks full ERP access on this machine.", ur: "سافٹ ویئر کے تمام فیچرز کو فعال کر دیتا ہے۔" },
    shortcuts: [],
    faqs: [],
    relatedRoutes: [{ path: "/dashboard", en: "Go to Dashboard", ur: "ڈیش بورڈ پر جائیں" }],
  },
};

import {
  getBlueprintForGuide,
  MODAL_CONTEXT_GUIDES,
  explainDomElement,
  loadLearnedCursorKnowledge,
  saveLearnedCursorKnowledge,
  getLearnedAnswerForQuery,
} from "./guideBotScreenBlueprints.js";

// Enrich every screen guide in SCREEN_GUIDES with its 4-pillar Screen Blueprint
// (fields glossary, worked numerical example, 4-pillar impactMatrix, commonMistake)
Object.keys(SCREEN_GUIDES).forEach((routeKey) => {
  const guide = SCREEN_GUIDES[routeKey];
  const bp = getBlueprintForGuide(guide);
  if (bp) {
    guide.fields = bp.fields || [];
    guide.example = bp.example || null;
    guide.impactMatrix = bp.impactMatrix || null;
    guide.commonMistake = bp.commonMistake || null;
  }
});

export {
  getBlueprintForGuide,
  MODAL_CONTEXT_GUIDES,
  explainDomElement,
  loadLearnedCursorKnowledge,
  saveLearnedCursorKnowledge,
  getLearnedAnswerForQuery,
};

export const MODULE_CATEGORIES = [
  { key: "all", en: "All Modules", ur: "تمام ماڈیولز" },
  { key: "overview", en: "Overview", ur: "ڈیش بورڈ اور پروفائل" },
  { key: "items", en: "Items & Masters", ur: "پروڈکٹس اور ماسٹرز" },
  { key: "invoices", en: "Invoices & POS", ur: "بلنگ، POS اور آرڈرز" },
  { key: "returns", en: "Returns", ur: "سیل اور پرچیز واپسی" },
  { key: "inventory", en: "Stock & Expiry", ur: "اسٹاک، بیچ اور ایکسپائری" },
  { key: "finance", en: "Finance, GL & HR", ur: "کھاتے، اکاؤنٹس اور اسٹاف" },
  { key: "reports", en: "Reports", ur: "تمام رپورٹس" },
  { key: "system", en: "Settings & Users", ur: "سیٹنگز اور بیک اپ" },
];

/**
 * Resolves the exact screen guide for the user's current URL (pathname + search + hash).
 */
export function resolveScreenGuide(pathname = "/dashboard", search = "", hash = "") {
  const cleanPath = (pathname || "/dashboard").replace(/\/+$/, "") || "/dashboard";

  // 1. Check query/hash sub-context enrichment (e.g., /hr-payroll?tab=attendance)
  if (cleanPath === "/hr-payroll" && search) {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    const base = SCREEN_GUIDES["/hr-payroll"];
    if (tab === "attendance") {
      return {
        ...base,
        subContextBadge: { en: "Active Tab: Daily Attendance", ur: "فعال ٹیب: روزانہ حاضری (Attendance)" },
      };
    }
    if (tab === "payroll") {
      return {
        ...base,
        subContextBadge: { en: "Active Tab: Monthly Payroll", ur: "فعال ٹیب: ماہانہ پے رول (تنخواہ)" },
      };
    }
    if (tab === "commissions") {
      return {
        ...base,
        subContextBadge: { en: "Active Tab: Sales Commissions", ur: "فعال ٹیب: سیلز مین کمیشن" },
      };
    }
  }

  if (cleanPath === "/settings" && hash) {
    const base = SCREEN_GUIDES["/settings"];
    const h = hash.replace("#", "").toLowerCase();
    const tabMap = {
      license: { en: "Active Section: License Settings", ur: "فعال حصہ: لائسنس سیٹنگز" },
      sale: { en: "Active Section: Sale System Rules", ur: "فعال حصہ: سیل سسٹم اصول" },
      smtp: { en: "Active Section: Email / SMTP", ur: "فعال حصہ: ای میل / SMTP" },
      cube: { en: "Active Section: Cube AI Bot Settings", ur: "فعال حصہ: کیوب اے آئی سیٹنگز" },
    };
    if (tabMap[h]) {
      return { ...base, subContextBadge: tabMap[h] };
    }
  }

  // 2. Direct path match + aliases
  if (SCREEN_GUIDES[cleanPath]) {
    return SCREEN_GUIDES[cleanPath];
  }

  // Common route aliases
  if (cleanPath === "/sale-invoices/barcode-pos") return SCREEN_GUIDES["/sale-invoices/pos"];
  if (cleanPath === "/sale-invoices/create" || cleanPath === "/sale-invoices/create-retail") {
    return SCREEN_GUIDES["/sale-invoices/create/retail"];
  }
  if (cleanPath === "/ wholesale-invoices/create" || cleanPath === "/wholesale-invoices/create" || cleanPath === "/sale-invoices/create-wholesale") {
    return SCREEN_GUIDES["/sale-invoices/create/wholesale"];
  }
  if (cleanPath === "/purchase-orders/create") return SCREEN_GUIDES["/purchase-orders"];

  // 3. Dynamic route pattern matching (:id, :id/edit, :id/review)
  if (/^\/products\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/products/:id/edit"];
  if (/^\/brands\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/brands/:id/edit"];
  if (/^\/suppliers\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/suppliers/:id/edit"];
  if (/^\/sale-invoices\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/sale-invoices/:id/edit"];
  if (/^\/sale-invoices\/\d+$/.test(cleanPath)) return SCREEN_GUIDES["/sale-invoices/:id"];
  if (/^\/purchase-invoices\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/purchase-invoices/:id/edit"];
  if (/^\/purchase-invoices\/\d+$/.test(cleanPath)) return SCREEN_GUIDES["/purchase-invoices/:id"];
  if (/^\/sale-returns\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/sale-returns/:id/edit"];
  if (/^\/sale-returns\/\d+$/.test(cleanPath)) return SCREEN_GUIDES["/sale-returns"];
  if (/^\/purchase-returns\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/purchase-returns/:id/edit"];
  if (/^\/purchase-returns\/\d+$/.test(cleanPath)) return SCREEN_GUIDES["/purchase-returns"];
  if (/^\/purchase-orders\/\d+(\/edit)?$/.test(cleanPath)) return SCREEN_GUIDES["/purchase-orders"];
  if (/^\/stock-adjustments\/\d+$/.test(cleanPath)) return SCREEN_GUIDES["/stock-adjustments/:id"];
  if (/^\/stocktake-sessions\/\d+\/review$/.test(cleanPath)) return SCREEN_GUIDES["/stocktake-sessions/:id/review"];
  if (/^\/stocktake-sessions\/\d+$/.test(cleanPath)) return SCREEN_GUIDES["/stocktake-sessions/:id"];
  if (/^\/stock-disposals\/\d+$/.test(cleanPath)) return SCREEN_GUIDES["/stock-disposals"];
  if (/^\/users\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/users/:id/edit"];
  if (/^\/roles\/\d+\/edit$/.test(cleanPath)) return SCREEN_GUIDES["/roles/:id/edit"];

  // Fallback to Dashboard guide
  return SCREEN_GUIDES["/dashboard"];
}

import {
  answerWithTrainedEngine,
  evaluateLocalQuery,
  routeUserQuery as routeUserQueryInternal,
  DEMO_MANIFESTS,
  PRODUCT_VERSION,
  TRAINED_ERP_INTENTS,
  MATCH_CATEGORIES,
  MATCH_CATEGORY_LABELS,
  EVIDENCE_TYPES,
  buildEvidenceBadge,
  resolveWorkflowIdForIntent,
} from "./guideBotIntelligence.js";

export {
  DEMO_MANIFESTS,
  PRODUCT_VERSION,
  TRAINED_ERP_INTENTS,
  MATCH_CATEGORIES,
  MATCH_CATEGORY_LABELS,
  EVIDENCE_TYPES,
  buildEvidenceBadge,
  evaluateLocalQuery,
  resolveWorkflowIdForIntent,
};

/**
 * Answers any user question in English, Urdu, or Roman Urdu using the
 * trained Karobar ERP Intelligence Engine (`guideBotIntelligence.js`).
 */
export function answerUserQuestion(queryText = "", currentGuide = SCREEN_GUIDES["/dashboard"]) {
  const baseAnswer = answerWithTrainedEngine(queryText, currentGuide, SCREEN_GUIDES);
  const learned = getLearnedAnswerForQuery(
    queryText,
    currentGuide?.key || currentGuide?.path || "/dashboard",
    baseAnswer?.matchedIntentId || ""
  );
  if (learned && (learned.en || learned.ur)) {
    return {
      ...baseAnswer,
      title: {
        en: learned.title?.en || baseAnswer?.title?.en || "Karobar ERP Guide",
        ur: learned.title?.ur || baseAnswer?.title?.ur || "کاروبار ایپ رہنمائی",
      },
      en: learned.en || baseAnswer?.en,
      ur: learned.ur || baseAnswer?.ur,
      aiImproved: true,
    };
  }
  return baseAnswer;
}

/**
 * Router-First Cube Orchestrator.
 * Determines intent, risk, and evidence tier before response generation.
 */
export function routeUserQuery(
  queryOrOptions = "",
  currentAgentArg = "cube",
  currentGuideArg = null,
  hasActiveDemoArg = false
) {
  if (typeof queryOrOptions === "object" && queryOrOptions !== null) {
    const {
      queryText = "",
      currentSpeaker = "cube",
      currentAgent = currentSpeaker,
      currentGuide = SCREEN_GUIDES["/dashboard"],
      activeDemo = null,
      hasActiveDemo = Boolean(activeDemo),
    } = queryOrOptions;
    return routeUserQueryInternal(
      queryText,
      currentAgent,
      currentGuide || SCREEN_GUIDES["/dashboard"],
      SCREEN_GUIDES,
      hasActiveDemo
    );
  }
  return routeUserQueryInternal(
    queryOrOptions,
    currentAgentArg,
    currentGuideArg || SCREEN_GUIDES["/dashboard"],
    SCREEN_GUIDES,
    hasActiveDemoArg
  );
}



