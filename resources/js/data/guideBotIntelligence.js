// resources/js/data/guideBotIntelligence.js
// Trained Bilingual (English + Urdu + Roman Urdu) NLU & ERP Question-Answering Engine for Karobar App ERP v2.

/**
 * Stopwords excluded during semantic scoring so filler words ("how", "can", "who", "what", "kaise")
 * never cause false-positive substring matches.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "about",
  "as", "into", "like", "through", "after", "over", "between", "out",
  "against", "during", "without", "before", "under", "around", "among",
  "i", "me", "my", "we", "our", "you", "your", "it", "its", "they", "them",
  "can", "could", "should", "would", "may", "might", "must", "will", "shall",
  "do", "does", "did", "done", "doing", "have", "has", "had", "having",
  "get", "gets", "got", "make", "makes", "made", "want", "need", "please",
  "tell", "show", "explain", "guide", "where", "when", "why", "which",
  "ka", "ki", "ke", "ko", "se", "mein", "me", "par", "pe", "hai", "hain",
  "ho", "hota", "hoti", "hote", "tha", "thi", "the", "kar", "kare", "karein",
  "karen", "karna", "karni", "karne", "kya", "kis", "kahan", "kab", "kyun",
  "aur", "ya", "bhi", "toh", "ye", "yeh", "wo", "woh", "is", "us", "apna",
  "کا", "کی", "کے", "کو", "سے", "میں", "پر", "ہے", "ہیں", "ہو", "ہوتا", "ہوتی",
  "کر", "کریں", "کرنا", "کرنے", "کیا", "کس", "کہاں", "کب", "کیوں", "اور", "یا",
  "بھی", "تو", "یہ", "وہ", "اس", "اپنا", "اپنے", "مجھے", "بتائیں", "بتاؤ"
]);

/**
 * Lightweight English + Roman Urdu stemmer so plurals/inflections match cleanly.
 */
export function stemToken(word) {
  if (!word || word.length <= 2) return word;
  let w = word.toLowerCase();
  // Common Roman Urdu / Urdu transliteration normalizations
  if (w === "udhaar" || w === "udhar" || w === "qarz" || w === "baqaya") return "udhar";
  if (w === "khata" || w === "khaata" || w === "khate") return "khata";
  if (w === "wapsi" || w === "waapsi" || w === "wapas") return "return";
  if (w === "parchi" || w === "raseed") return "receipt";
  if (w === "tankhwah" || w === "tankhah" || w === "pagar") return "salary";
  if (w === "hazri" || w === "haazri") return "attendance";
  if (w === "munafa" || w === "nafa" || w === "faida") return "profit";
  if (w === "kharcha" || w === "kharche" || w === "akhrajat") return "expense";
  if (w === "maal" || w === "saman") return "stock";
  if (w === "dawai" || w === "dawa" || w === "medicine" || w === "medicines") return "medicine";
  if (w === "goli" || w === "goliyan" || w === "tablets") return "tablet";
  if (w === "galla" || w === "galle") return "drawer";

  // English morphological suffixes
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("es") && w.length > 4 && (w.endsWith("ches") || w.endsWith("shes") || w.endsWith("xes") || w.endsWith("ses"))) {
    return w.slice(0, -2);
  }
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is") && w.length > 3) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * Tokenizes any English / Urdu / Roman Urdu string into clean normalized words and stems.
 */
export function analyzeQuery(rawText = "") {
  const cleaned = (rawText || "")
    .toLowerCase()
    .replace(/[?؟!.,;:()"'“”‘’[\]{}\\/|+=-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawWords = cleaned ? cleaned.split(" ") : [];
  const wordSet = new Set(rawWords);
  const stemSet = new Set(rawWords.map(stemToken));
  const meaningfulWords = rawWords.filter((w) => !STOP_WORDS.has(w) && w.length > 1);
  const meaningfulStems = meaningfulWords.map(stemToken);

  const isHowMuchOrMany = /\b(how much|how many)\b/.test(cleaned);

  const isHowQuery =
    (!isHowMuchOrMany && /\b(how|kaise|kesay|kese|tareeqa|tarika|steps|step|way)\b/.test(cleaned)) ||
    /\b(how to check|how to see|how to view|how do i check)\b/.test(cleaned) ||
    cleaned.includes("کیسے") ||
    cleaned.includes("طریقہ") ||
    cleaned.includes("کس طرح");

  const isDifferenceQuery =
    /\b(difference|different|vs|versus|compare|comparison|farq|muwazna)\b/.test(cleaned) ||
    cleaned.includes("فرق") ||
    cleaned.includes("موازنہ");

  const isImpactQuery =
    /\b(impact|affect|effect|happen|behind the scenes)\b/.test(cleaned) ||
    cleaned.includes("اثر");

  const isContextualFollowUp =
    /\b(explain in detail|more detail|in detail|elaborate|clarify|still confused|what happens if|what if|suppose|scenario|best way|can i|should i|when should|why is|why does|how does|problem|issue|mistake|error|wrong|not working|why did that|why is that|another example|in my case|tafseel|mazeed|samjha dein|agar aisa|kya hum|kyun hota)\b/.test(
      cleaned
    ) ||
    /^(and what|what about|so if|but what|or if|if i|when i|can we|aur agar|toh phir|agar main|agar customer|agar supplier)\b/.test(
      cleaned
    ) ||
    cleaned.includes("مزید وضاحت") ||
    cleaned.includes("تفصیل سے") ||
    cleaned.includes("کیوں ضروری") ||
    cleaned.includes("اگر ایسا ہو") ||
    cleaned.includes("اس کے بعد کیا");

  const asksLiveAmount =
    /\b(how much|how many|what is my current|what is the current|what is the balance|tell me the balance|exact balance|exact stock|kitna hai|kitne hain|kitna stock|kitna balance|kitna munafa)\b/.test(
      cleaned
    ) ||
    cleaned.includes("کتنا ہے") ||
    cleaned.includes("کتنے ہیں") ||
    cleaned.includes("کتنا اسٹاک") ||
    cleaned.includes("کتنا بیلنس") ||
    cleaned.includes("کتنا منافع");

  const mentionsBusinessRecord =
    /\b(stock|balance|udhar|profit|munafa|sale|sales|invoice|payable|receivable|salary|payroll|bank|cash|phone|number)\b/.test(
      cleaned
    ) ||
    cleaned.includes("اسٹاک") ||
    cleaned.includes("بیلنس") ||
    cleaned.includes("ادھار") ||
    cleaned.includes("منافع") ||
    cleaned.includes("سیل") ||
    cleaned.includes("تنخواہ");

  const isLiveRecordQuery = !isHowQuery && asksLiveAmount && mentionsBusinessRecord;

  return {
    cleaned,
    rawWords,
    wordSet,
    stemSet,
    meaningfulWords,
    meaningfulStems,
    isHowQuery,
    isDifferenceQuery,
    isImpactQuery,
    isContextualFollowUp,
    isLiveRecordQuery,
  };
}

export const MATCH_CATEGORIES = {
  STRONG_INTENT: "strong_intent_match",
  STRONG_INTENT_MATCH: "strong_intent_match",
  FAQ: "faq_match",
  FAQ_MATCH: "faq_match",
  SCREEN_GUIDE: "screen_guide_match",
  SCREEN_GUIDE_MATCH: "screen_guide_match",
  PARTIAL: "partial_match",
  PARTIAL_MATCH: "partial_match",
  NONE: "no_reliable_match",
  NO_RELIABLE_MATCH: "no_reliable_match",
};

export const MATCH_CATEGORY_LABELS = {
  strong_intent_match: "Strong intent match",
  faq_match: "FAQ match",
  screen_guide_match: "Screen-guide match",
  partial_match: "Partial match",
  no_reliable_match: "No reliable match",
};

export const EVIDENCE_TYPES = {
  DOCUMENTED_INFO: "documented_info",
  CURRENT_SCREEN_CONTEXT: "current_screen_context",
  LIVE_DOM_INSPECTION: "live_dom_inspection",
  AI_GROUNDED_DOCS: "ai_grounded_docs",
};

/**
 * Checks if a multi-word phrase or single word exists on true word boundaries in the query.
 */
function hasBoundedPhrase(cleanedQuery, wordSet, stemSet, phrase) {
  const norm = phrase.toLowerCase().trim();
  if (!norm) return false;
  if (!norm.includes(" ")) {
    return wordSet.has(norm) || stemSet.has(stemToken(norm));
  }
  // Multi-word phrase: check word-bounded presence in cleanedQuery
  const paddedQuery = ` ${cleanedQuery} `;
  return paddedQuery.includes(` ${norm} `);
}

/**
 * Deeply Trained Intent Knowledge Base for Karobar App ERP v2.
 * Each intent has:
 * - id: unique identifier
 * - phrases: high-precision multi-word phrases (English, Urdu, Roman Urdu)
 * - requiredGroups: optional array of token groups where EVERY group must match at least 1 token (for compositional understanding!)
 * - keywords: supporting domain tokens (matched strictly on word/stem boundaries, never raw substrings!)
 * - negativePhrases: phrases that disqualify this intent
 * - title, en, ur, links
 */
export const TRAINED_ERP_INTENTS = [
  // ==========================================================================
  // 0. CONVERSATIONAL & BOT IDENTITY INTENTS
  // ==========================================================================
  {
    id: "greeting_hello",
    phrases: [
      "hello", "hi", "hey", "salam", "assalam o alaikum", "assalamualaikum",
      "aoa", "good morning", "good evening", "اسلام علیکم", "السلام علیکم", "ہیلو"
    ],
    keywords: [],
    onlyWhenShort: true,
    title: {
      en: "Assalam-o-Alaikum! I'm Cube — Your Karobar ERP AI Guide",
      ur: "السلام علیکم! میں کیوب (Cube) ہوں — آپ کا کاروبار ERP گائیڈ",
    },
    en: "Hello! I am **Cube**, your trained bilingual (English & اردو) AI assistant for **Karobar App ERP v2**.\n\nYou can ask me anything about your software—for example:\n• **Purchasing:** *\"How to make a Purchase Order?\"*, *\"How to add new stock (Purchase Invoice)?\"*, *\"How do bonus units work?\"*\n• **Sales & POS:** *\"How to sell loose tablets?\"*, *\"How to give a discount?\"*, *\"How to hold a bill?\"*, *\"How to find substitute medicine?\"*\n• **Inventory & Expiry:** *\"How to print barcode stickers?\"*, *\"How to check near-expiry batches?\"*, *\"How to enter opening stock?\"*\n• **Finance & HR:** *\"How to check customer udhar khata?\"*, *\"How to close cash drawer shift?\"*, *\"How to mark attendance & pay salary?\"*",
    ur: "خوش آمدید! میں **کیوب (Cube)** ہوں، جو **کاروبار ایپ ERP** کے تمام فیچرز پر مکمل طور پر ٹرینڈ ہے۔\n\nآپ مجھ سے انگلش، اردو یا رومن اردو میں کوئی بھی سوال پوچھ سکتے ہیں، مثلاً:\n• **خریداری اور اسٹاک:** *\"پرچیز آرڈر (PO) کیسے بنائیں؟\"*، *\"نیا اسٹاک اور پرچیز بل کیسے ڈالیں؟\"*، *\"بونس یونٹس کیسے کام کرتے ہیں؟\"*\n• **سیلز اور POS:** *\"کھلی گولیاں (Loose Tablets) کیسے بیچیں؟\"*، *\"بل میں ڈسکاؤنٹ کیسے دیں؟\"*، *\"بل ہولڈ کیسے کریں؟\"*\n• **انوینٹری اور بارکوڈ:** *\"بارکوڈ اسٹیکر کیسے پرنٹ کریں؟\"*، *\"قریب ایکسپائری مال کیسے چیک کریں؟\"*\n• **کھاتے اور اسٹاف:** *\"گاہک کا ادھار کھاتہ کیسے دیکھیں؟\"*، *\"کیش ڈراور شفٹ کیسے بند کریں؟\"*، *\"تنخواہ اور حاضری کیسے لگائیں؟\"*",
    links: [
      { path: "/sale-invoices/pos", en: "Open Barcode POS", ur: "بارکوڈ POS کھولیں" },
      { path: "/purchase-invoices/create", en: "Add Stock (Purchase Invoice)", ur: "نیا اسٹاک ڈالیں" },
      { path: "/cash-drawer", en: "Cash Drawer & Shifts", ur: "کیش ڈراور اور شفٹس" },
    ],
  },

  {
    id: "bot_identity_capabilities",
    phrases: [
      "who are you", "what are you", "what can you do", "what is your name",
      "introduce yourself", "tum kaun ho", "aap kaun hain", "ap kon ho",
      "آپ کون ہیں", "تم کون ہو", "آپ کیا کر سکتے ہیں", "تمہارا نام کیا ہے"
    ],
    keywords: ["cube", "karo"],
    title: {
      en: "About Cube — Karobar ERP Intelligence Sidekick",
      ur: "کیوب (Cube) کا تعارف — کاروبار ERP اسسٹنٹ",
    },
    en: "I am **Cube (`کیوب`)**, the built-in AI sidekick trained on every module, field, formula, accounting rule, and keyboard shortcut in **Karobar App ERP v2**.\n\n**What I can do for you:**\n1. **Explain Every Field & Column:** Open the **Fields & Glossary** tab or click **Inspect (`?`)** in my header and click any button, input, or column on your screen.\n2. **Show Worked Numerical Examples & Accounting Impact:** See how every screen affects Stock, Party Ledgers, Cash Drawer, and Double-Entry GL.\n3. **Interactive Step-by-Step Walkthroughs:** Click **Start Walkthrough** to highlight controls directly on your live screen while you work!",
    ur: "میرا نام **کیوب (`Cube`)** ہے اور مجھے **Karobar App ERP v2** کے تمام ماڈیولز، فیلڈز، فارمولوں اور اکاؤنٹنگ اصولوں پر ٹرین کیا گیا ہے۔\n\n**میں آپ کی کیا مدد کر سکتا ہوں:**\n1. **ہر فیلڈ اور کالم کی وضاحت:** میرے ہیڈر میں **Inspect (`?`)** بٹن دبا کر اسکرین کے کسی بھی بٹن یا خانے پر کلک کریں، میں اس کا مقصد بتاؤں گا۔\n2. **عملی مثالیں اور اکاؤنٹنگ اثر:** ہر اسکرین کا اسٹاک، کھاتوں، کیش ڈراور اور جنرل لیجر پر اثر واضح مثال کے ساتھ دیکھیں۔\n3. **لائیو ڈیمو گائیڈ:** آپ کے کام میں رکاوٹ ڈالے بغیر اسکرین کے بٹن ہائی لائٹ کر کے مرحلہ وار رہنمائی۔",
    links: [
      { path: "/dashboard", en: "Dashboard", ur: "ڈیش بورڈ" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
    ],
  },

  // ==========================================================================
  // 1. PURCHASING, PROCUREMENT, PO vs GRN, BONUS & DEMANDS
  // ==========================================================================
  {
    id: "po_vs_purchase_invoice",
    phrases: [
      "difference between purchase order and purchase invoice",
      "purchase order vs purchase invoice",
      "po vs purchase invoice",
      "po and purchase invoice difference",
      "po aur purchase invoice mein farq",
      "پرچیز آرڈر اور پرچیز انوائس میں فرق"
    ],
    requiredGroups: [["po", "order", "آرڈر"], ["invoice", "bill", "grn", "انوائس", "بل"], ["difference", "vs", "farq", "فرق"]],
    keywords: [],
    title: {
      en: "Purchase Order (PO) vs. Purchase Invoice (GRN)",
      ur: "پرچیز آرڈر (PO) اور پرچیز انوائس (بل) میں فرق",
    },
    en: "Here is the exact difference in Karobar ERP:\n\n1. **Purchase Order (`/purchase-orders`):**\n   • A **Purchase Order (PO)** is a **demand list / order sheet** you prepare and send to your supplier or order booker.\n   • **Impact:** Creating a PO **does NOT increase product stock** and **does NOT create a supplier payable** in the ledger yet.\n\n2. **Purchase Invoice / GRN (`/purchase-invoices/create` or `Ctrl+1`):**\n   • A **Purchase Invoice** is recorded when the supplier physically delivers the goods and bill to your shop.\n   • **Impact:** Saving a Purchase Invoice **immediately increases your batch stock**, records batch numbers & expiry dates, and **updates your Supplier Ledger / General Ledger**.\n   • **Tip:** You can convert any saved PO into a Purchase Invoice in one click!",
    ur: "کاروبار ایپ میں ان دونوں کا فرق بہت واضح ہے:\n\n1. **پرچیز آرڈر (`Purchase Order — /purchase-orders`):**\n   • پرچیز آرڈر (PO) وہ **ڈیمانڈ لسٹ یا آرڈر شیٹ** ہے جو آپ سپلائر یا آرڈر بُکر کو مال منگوانے کے لیے بھیجتے ہیں۔\n   • **اثر:** پرچیز آرڈر بنانے سے **اسٹاک میں اضافہ نہیں ہوتا** اور نہ ہی سپلائر کے کھاتے میں رقم جمع ہوتی ہے۔\n\n2. **پرچیز انوائس (`Purchase Invoice — /purchase-invoices/create` یا `Ctrl+1`):**\n   • جب سپلائر دکان پر مال اور بل پہنچا دے، تب آپ **Purchase Invoice** درج کرتے ہیں۔\n   • **اثر:** اسے محفوظ کرتے ہی **اسٹاک اور بیچ فوری بڑھ جاتے ہیں** اور سپلائر کے کھاتے (Ledger) میں بل درج ہو جاتا ہے۔ آپ کسی بھی PO کو ایک کلک سے پرچیز انوائس میں تبدیل کر سکتے ہیں!",
    links: [
      { path: "/purchase-orders", en: "Open Purchase Orders (PO)", ur: "پرچیز آرڈرز (PO) کھولیں" },
      { path: "/purchase-invoices/create", en: "Create Purchase Invoice (Add Stock)", ur: "پرچیز انوائس بنائیں (اسٹاک ڈالیں)" },
    ],
  },

  {
    id: "create_purchase_order",
    phrases: [
      "purchase order", "make purchase order", "create purchase order",
      "new purchase order", "how to order supplier", "draft po", "create po",
      "make a po", "supplier order sheet", "purchase order kaise", "po kaise",
      "پرچیز آرڈر", "پرچیز آرڈر کیسے بنائیں", "سپلائر آرڈر"
    ],
    requiredGroups: [["purchase", "supplier", "پرچیز", "سپلائر"], ["order", "po", "آرڈر"]],
    keywords: ["po", "purchase order"],
    title: {
      en: "How to Create a Purchase Order (PO)",
      ur: "پرچیز آرڈر (Purchase Order - PO) بنانے کا طریقہ",
    },
    en: "To create a **Purchase Order (PO)** for a supplier:\n\n1. Open **Purchase Orders** (`/purchase-orders`) from the sidebar (**Invoices → Purchase Orders**).\n2. Select the **Supplier** and **Order Date**.\n3. Add the products and required quantities manually, **OR** click **Load Low-Stock / Smart Suggestions** to auto-fill items that need restocking from that supplier.\n4. Click **Save Purchase Order** to store it, print the PDF, or send it directly to the supplier on **WhatsApp**.\n5. **When goods arrive:** Click **Convert to Purchase Invoice (GRN)** on that PO to enter batch/expiry details and add the stock into inventory.",
    ur: "سپلائر کے لیے **پرچیز آرڈر (PO)** بنانے کا مرحلہ وار طریقہ:\n\n1. سائیڈ بار سے **Purchase Orders** (`/purchase-orders`) کھولیں۔\n2. اپنا **Supplier (سپلائر)** اور تاریخ منتخب کریں۔\n3. مطلوبہ پروڈکٹس اور مقدار درج کریں، یا **Auto-Suggest Low Stock** بٹن دبائیں تاکہ کم اسٹاک والے آئٹمز خودکار شامل ہو جائیں۔\n4. **Save Purchase Order** پر کلک کریں اور آرڈر کا PDF پرنٹ نکالیں یا **WhatsApp** پر سپلائر کو بھیج دیں۔\n5. **جب مال پہنچ جائے:** اسی آرڈر کے آگے **Convert to Purchase Invoice** پر کلک کر کے بیچ اور ایکسپائری درج کریں تاکہ اسٹاک جمع ہو جائے۔",
    links: [
      { path: "/purchase-orders", en: "Open Purchase Orders", ur: "پرچیز آرڈر اسکرین کھولیں" },
      { path: "/purchase-orders/forecast", en: "Smart Reorder Forecast", ur: "سمارٹ ری آرڈر فورکاسٹ" },
    ],
  },

  {
    id: "smart_reorder_forecast",
    phrases: [
      "smart reorder", "reorder forecast", "sales velocity", "auto order forecast",
      "how much to order", "forecast purchase order", "سمارٹ ری آرڈر", "آرڈر فورکاسٹ"
    ],
    requiredGroups: [["forecast", "velocity", "فورکاسٹ"], ["order", "reorder", "stock", "آرڈر", "اسٹاک"]],
    keywords: ["forecast"],
    title: {
      en: "Smart Reorder & Sales-Velocity Forecast",
      ur: "سمارٹ ری آرڈر اور سیلز فورکاسٹ (Smart Forecast)",
    },
    en: "**Smart Reorder Forecast (`/purchase-orders/forecast`)** calculates exactly how much stock you should order based on your real sales speed:\n\n1. Open **Smart Reorder Forecast** (`/purchase-orders/forecast`).\n2. Choose your **Sales Lookback Period** (e.g., last 30 days of sales) and **Target Coverage Days** (e.g., stock needed for the next 15 days), and optionally filter by **Supplier** or **Brand**.\n3. The system compares each item's daily sales rate against current on-hand stock and recommends the exact **Suggested Order Quantity**.\n4. Review/adjust quantities and click **Generate Purchase Order** or export to PDF.",
    ur: "**سمارٹ ری آرڈر فورکاسٹ (`/purchase-orders/forecast`)** آپ کی روزانہ کی فروخت کی رفتار کے مطابق خودکار بتاتا ہے کہ کون سا مال کتنا منگوانا چاہیے:\n\n1. **Smart Reorder Forecast** (`/purchase-orders/forecast`) کھولیں۔\n2. پچھلی سیلز کی مدت (Lookback Days) اور اگلے کتنے دنوں کا اسٹاک چاہیے (Target Days) منتخب کریں، اور چاہیں تو سپلائر یا برانڈ فلٹر لگائیں۔\n3. سسٹم موجودہ اسٹاک اور روزانہ کی کھپت کا موازنہ کر کے **تجویز کردہ آرڈر مقدار (Suggested Qty)** نکال دے گا۔\n4. ایک کلک سے پرچیز آرڈر (PO) بنائیں یا فہرست پرنٹ کریں۔",
    links: [
      { path: "/purchase-orders/forecast", en: "Open Smart Reorder Forecast", ur: "سمارٹ ری آرڈر فورکاسٹ کھولیں" },
      { path: "/reports/reorder", en: "Low Stock Report", ur: "کم اسٹاک رپورٹ" },
    ],
  },

  {
    id: "add_stock_purchase_invoice",
    phrases: [
      "purchase invoice", "create purchase invoice", "new purchase invoice",
      "add stock", "add new stock", "how to add stock", "receive stock",
      "inward stock", "enter supplier bill", "enter purchase bill", "grn",
      "naya stock", "stock kaise add", "stock kaise dalein", "maal kaise dalein",
      "purchase bill kaise", "پرچیز انوائس", "نیا اسٹاک", "نیا مال کیسے ڈالیں",
      "اسٹاک کیسے ڈالیں", "خریداری کا بل کیسے بنائیں", "پرچیز بل"
    ],
    requiredGroups: [["add", "new", "enter", "inward", "receive", "dalna", "dalein", "ڈالیں", "شامل"], ["stock", "inventory", "purchase", "maal", "اسٹاک", "مال", "خریداری"]],
    keywords: ["grn", "purchase invoice"],
    negativePhrases: ["purchase order", "پرچیز آرڈر"],
    title: {
      en: "How to Add New Stock (Create Purchase Invoice / GRN)",
      ur: "نیا اسٹاک اور خریداری کا بل (Purchase Invoice) درج کرنے کا طریقہ",
    },
    en: "To add new stock bought from a supplier into your inventory:\n\n1. Open **Create Purchase Invoice** (`/purchase-invoices/create`) or press **`Ctrl + 1`** from anywhere.\n2. Select the **Supplier**, enter the supplier's **Invoice / Reference #**, and verify the **Invoice Date**.\n3. Search and select each **Product**, then enter:\n   • **Batch Number** & **Expiry Date**\n   • **Pack / Unit Quantity** & **Bonus Units** (free scheme units)\n   • **Purchase Cost**, **Sale Price (MRP)**, **Discount %**, and **Tax/WHT %**\n4. At the bottom, enter **Paid Amount** (if paying cash/bank now) or leave `0` for **Credit (Payable)**, then click **Save (`Ctrl+S`)**.\n\n**Result:** Your product & batch stock increases immediately, and the supplier's ledger is updated automatically.",
    ur: "سپلائر سے خریدا گیا نیا مال (Stock) سسٹم میں ڈالنے کا طریقہ:\n\n1. **Create Purchase Invoice** (`/purchase-invoices/create`) کھولیں یا کی بورڈ سے **`Ctrl + 1`** دبائیں۔\n2. **Supplier (سپلائر)** منتخب کریں اور سپلائر کا بل نمبر اور تاریخ درج کریں۔\n3. ہر پروڈکٹ کو سرچ کر کے شامل کریں اور درج ذیل تفصیلات لکھیں:\n   • **بیچ نمبر (Batch #)** اور **ایکسپائری تاریخ (Expiry Date)**\n   • **پیک یا یونٹ کی مقدار** اور **بونس یونٹس (Bonus Units)**\n   • **قیمتِ خرید (Cost)**، **قیمتِ فروخت (Sale Price)** اور ڈسکاؤنٹ/ٹیکس\n4. نیچے اگر نقد ادائیگی کی ہے تو **Paid Amount** لکھیں ورنہ ادھار کے لیے `0` چھوڑ کر **Save (`Ctrl+S`)** دبا دیں۔\n\n**نتیجہ:** تمام آئٹمز کا اسٹاک اور بیچ فوری بڑھ جائیں گے اور سپلائر کے کھاتے میں بل درج ہو جائے گا۔",
    links: [
      { path: "/purchase-invoices/create", en: "Create Purchase Invoice (Ctrl+1)", ur: "نیا پرچیز بل بنائیں (Ctrl+1)" },
      { path: "/purchase-invoices", en: "All Purchase Invoices", ur: "تمام پرچیز بل دیکھیں" },
      { path: "/stock-adjustments/create", en: "Opening Stock / Adjustment", ur: "اوپننگ اسٹاک / ایڈجسٹمنٹ" },
    ],
  },

  {
    id: "bonus_units_scheme",
    phrases: [
      "bonus unit", "bonus units", "free units", "free scheme", "trade offer",
      "add bonus", "bonus in purchase", "bonus in sale", "بونس یونٹس", "فری اسکیم"
    ],
    keywords: ["bonus"],
    title: {
      en: "How Bonus Units (Free Scheme / Trade Offer) Work",
      ur: "بونس یونٹس (Bonus / Free Scheme) کیسے کام کرتے ہیں؟",
    },
    en: "Karobar ERP supports **Bonus Units** on both Purchase Invoices and Wholesale/Retail Sale Invoices:\n\n1. **On Purchase Invoices (`/purchase-invoices/create`):**\n   • Enter billed quantity in **Qty** and free scheme units in the **Bonus** column (e.g., `10 + 2 Bonus`).\n   • **Stock & Cost Impact:** All `12` units are added to your inventory batch, while you are only billed for `10` units—automatically lowering your effective unit cost!\n\n2. **On Sale Invoices (`/sale-invoices/create/wholesale` or `retail`):**\n   • Enter promotional free units in the **Bonus** column.\n   • **Impact:** Those bonus units are deducted from batch stock at `Rs. 0` charge to the customer.",
    ur: "کاروبار ایپ میں خریداری اور فروخت دونوں بلوں میں **بونس یونٹس (Bonus Units)** کی سہولت موجود ہے:\n\n1. **پرچیز انوائس میں (`/purchase-invoices/create`):**\n   • خریدی گئی مقدار **Qty** میں لکھیں اور کمپنی کی طرف سے ملنے والے مفت یونٹس **Bonus** کے خانے میں لکھیں (مثلاً `10 + 2 بونس`)۔\n   • **اثر:** آپ کے اسٹاک میں پورے `12` یونٹس جمع ہوں گے جبکہ بل صرف `10` یونٹس کا بنے گا۔\n\n2. **سیل انوائس میں (`/sale-invoices/create/wholesale`):**\n   • گاہک کو دیے جانے والے فری اسکیم یونٹس **Bonus** کالم میں لکھیں؛ وہ اسٹاک سے کم ہو جائیں گے لیکن گاہک سے ان کی قیمت چارج نہیں ہو گی۔",
    links: [
      { path: "/purchase-invoices/create", en: "Create Purchase Invoice", ur: "نیا پرچیز بل بنائیں" },
      { path: "/sale-invoices/create/wholesale", en: "Create Wholesale Invoice", ur: "نیا ہول سیل بل بنائیں" },
    ],
  },

  {
    id: "purchase_return_supplier",
    phrases: [
      "purchase return", "return to supplier", "return items to supplier",
      "supplier return", "return expired to supplier", "debit note",
      "supplier ko maal wapas", "purchase return kaise",
      "پرچیز ریٹرن", "سپلائر کو مال واپس", "ڈیبٹ نوٹ"
    ],
    requiredGroups: [["return", "wapsi", "wapas", "واپس", "واپسی", "ریٹرن"], ["supplier", "purchase", "distributor", "سپلائر", "پرچیز", "ڈسٹری بیوٹر"]],
    keywords: ["debit note"],
    title: {
      en: "How to Return Goods to a Supplier (Purchase Return / Debit Note)",
      ur: "سپلائر کو مال واپس کرنے (Purchase Return) کا طریقہ",
    },
    en: "To return damaged, slow-moving, or near-expiry stock back to a supplier:\n\n1. Open **Create Purchase Return** (`/purchase-returns/create`) or press **`Ctrl + N`** on the Purchase Returns screen.\n2. Select the **Supplier** (or load items from the original Purchase Invoice).\n3. Pick the exact **Product & Batch** being returned and enter the **Return Quantity**.\n4. Choose whether the supplier gave a **Cash/Bank Refund** or a **Payable Ledger Deduction (Debit Note)**.\n5. Click **Save (`Ctrl+S`)**.\n\n**Impact:** The returned units are immediately deducted from that batch's stock, and your Supplier Payable balance is reduced.",
    ur: "خراب، زائد المیعاد (Near-Expiry) یا فالتو مال سپلائر کو واپس کرنے کا طریقہ:\n\n1. **Create Purchase Return** (`/purchase-returns/create`) کھولیں یا پرچیز ریٹرنز پیج پر **`Ctrl + N`** دبائیں۔\n2. اپنا **Supplier (سپلائر)** منتخب کریں (یا اصل پرچیز بل لوڈ کریں)۔\n3. واپس کیے جانے والے پروڈکٹ کا **بیچ (Batch)** اور **مقدار (Return Qty)** درج کریں۔\n4. منتخب کریں کہ سپلائر سے نقد رقم واپس ملی ہے یا کھاتے (Payable Balance) میں کٹوتی کرنی ہے۔\n5. **Save (`Ctrl+S`)** بٹن دبائیں۔ اسٹاک فوری کم ہو جائے گا اور سپلائر کے کھاتے سے رقم منہا ہو جائے گی۔",
    links: [
      { path: "/purchase-returns/create", en: "Create Purchase Return (Ctrl+N)", ur: "نئی پرچیز ریٹرن بنائیں (Ctrl+N)" },
      { path: "/purchase-returns", en: "Purchase Returns History", ur: "پرچیز ریٹرنز کی فہرست" },
    ],
  },

  {
    id: "customer_demand_short_book",
    phrases: [
      "user demand", "user demands", "customer demand", "short book", "shortbook",
      "missing medicine", "requested item", "out of stock request", "want book",
      "demand kaise likhein", "کسٹمر ڈیمانڈ", "شارٹ بک", "مانگی گئی ادویات"
    ],
    requiredGroups: [["demand", "short", "request", "missing", "ڈیمانڈ", "شارٹ"], ["customer", "item", "product", "medicine", "book", "گاہک", "آئٹم", "بک"]],
    keywords: ["shortbook", "user demand"],
    title: {
      en: "How to Record Customer Product Demands (Short Book)",
      ur: "گاہک کی ڈیمانڈز (Short Book / User Demands) درج کرنے کا طریقہ",
    },
    en: "When a customer asks for an item that is out of stock or not yet in your catalog, record it in the **Short Book (`User Demands`)**:\n\n1. Open **Record Customer Demand** (`/user-demands/create`) or **Customer Demands List** (`/user-demands`).\n2. Select an existing product or type the name of the **New Requested Item**, enter the **Quantity Requested**, optional **Customer Name/Phone**, and **Urgency/Notes**.\n3. Click **Save**.\n4. When preparing your next **Purchase Order**, check `/user-demands` to order all requested items and mark them **Fulfilled** once stocked!",
    ur: "جب کوئی گاہک ایسی دوائی یا آئٹم مانگے جو اس وقت اسٹاک میں نہ ہو تو اسے **شارٹ بک (`User Demands`)** میں درج کریں:\n\n1. **Record Customer Demand** (`/user-demands/create`) کھولیں۔\n2. پروڈکٹ کا نام، مطلوبہ مقدار، گاہک کا نام/فون نمبر اور نوٹ لکھ کر **Save** کریں۔\n3. نیا مال منگواتے وقت **User Demands** (`/user-demands`) کی فہرست دیکھ کر سپلائر کو آرڈر لکھوائیں اور مال آنے پر اسے **Fulfilled (مکمل)** مارک کر دیں۔",
    links: [
      { path: "/user-demands/create", en: "Record New Customer Demand", ur: "نئی کسٹمر ڈیمانڈ درج کریں" },
      { path: "/user-demands", en: "View All Customer Demands", ur: "تمام کسٹمر ڈیمانڈز دیکھیں" },
    ],
  },

  // ==========================================================================
  // 2. SALES, BARCODE POS, LOOSE TABLETS, DISCOUNTS, HOLD BILL, SUBSTITUTES & RETURNS
  // ==========================================================================
  {
    id: "how_to_make_sale_billing",
    phrases: [
      "how to make a sale", "how to create sale invoice", "make sale bill",
      "create sale invoice", "pos vs retail", "retail vs wholesale",
      "sale bill kaise", "bill kaise banayein", "سیل بل کیسے بنائیں", "بل کیسے کاٹیں"
    ],
    requiredGroups: [["make", "create", "new", "kaise", "بنائیں", "کاٹیں"], ["sale", "pos", "invoice", "billing", "سیل", "بل"]],
    negativePhrases: ["purchase", "return", "edit", "delete", "پرچیز", "ریٹرن"],
    keywords: ["pos"],
    title: {
      en: "3 Ways to Bill Customers (POS vs. Retail vs. Wholesale)",
      ur: "گاہک کا سیل بل بنانے کے 3 طریقے (POS، ریٹیل اور ہول سیل)",
    },
    en: "Karobar ERP gives you **3 specialized billing screens** depending on your counter workflow:\n\n1. **High-Speed Barcode POS (`/sale-invoices/pos`):**\n   • Best for fast walk-in counter billing with a barcode scanner, instant FEFO batch pick, Hold/Recall carts (`F8`), and thermal receipt printing (`Ctrl+P`).\n2. **Create Retail Sale Invoice (`/sale-invoices/create/retail` or `Ctrl+2`):**\n   • Full-page tabular invoice form ideal for detailed walk-in or credit customer bills.\n3. **Create Wholesale (B2B) Invoice (`/sale-invoices/create/wholesale` or `Ctrl+3` / `Ctrl+W`):**\n   • Designed for B2B distributors/clinics with Wholesale Prices, Bonus Units, Credit Limit checks, and Salesman Commission tracking.",
    ur: "کاروبار ایپ میں سیل بل بنانے کے **3 بہترین طریقے** موجود ہیں:\n\n1. **بارکوڈ POS ٹرمینل (`/sale-invoices/pos`):**\n   • کاؤنٹر پر تیز ترین بارکوڈ اسکیننگ، فوری بلنگ، بل ہولڈ (`F8`) اور تھرمل سلپ پرنٹنگ (`Ctrl+P`) کے لیے۔\n2. **ریٹیل سیل انوائس (`/sale-invoices/create/retail` یا `Ctrl+2`):**\n   • تفصیلی ریٹیل بل اور ادھار/نقد گاہکوں کے لیے مکمل انوائس فارم۔\n3. **ہول سیل (B2B) انوائس (`/sale-invoices/create/wholesale` یا `Ctrl+3` / `Ctrl+W`):**\n   • ہول سیل ریٹ، بونس یونٹس، کریڈٹ لمٹ اور سیلز مین کمیشن کے ساتھ بل بنانے کے لیے۔",
    links: [
      { path: "/sale-invoices/pos", en: "Open Barcode POS", ur: "بارکوڈ POS کھولیں" },
      { path: "/sale-invoices/create/retail", en: "Create Retail Invoice (Ctrl+2)", ur: "ریٹیل بل بنائیں (Ctrl+2)" },
      { path: "/sale-invoices/create/wholesale", en: "Create Wholesale Invoice (Ctrl+3)", ur: "ہول سیل بل بنائیں (Ctrl+3)" },
    ],
  },

  {
    id: "sell_loose_tablets_pack_vs_unit",
    phrases: [
      "sell loose", "loose tablet", "loose tablets", "single tablet", "open strip",
      "pack size", "unit vs pack", "pack vs unit", "khuli goli", "khuli goliyan",
      "کھلی گولیاں", "کھلی گولی کیسے بیچیں", "پیک سائز اور یونٹ"
    ],
    requiredGroups: [["loose", "single", "unit", "pack", "tablet", "goli", "کھلی", "گولی", "یونٹ"]],
    keywords: ["loose", "tablet"],
    title: {
      en: "How to Sell Loose Tablets / Single Units vs. Full Packs",
      ur: "کھلی گولیاں (Loose Units) اور پورا ڈبہ (Pack) بیچنے کا طریقہ",
    },
    en: "Karobar ERP handles **Full Packs (Boxes)** and **Loose Units (Tablets / Strips)** automatically through **Pack Size**:\n\n1. **When Creating/Editing the Product (`/products/create`):**\n   • Set **Pack Size** to the number of units inside 1 box (e.g., `30` tablets per box).\n   • Enter the **Pack Price**—the system automatically calculates the exact **Unit Price** per tablet (`Pack Price ÷ Pack Size`).\n2. **When Billing in POS or Sale Invoice:**\n   • Enter **Packs** (if selling whole boxes) or **Units** (e.g., `4` loose tablets) in the quantity fields.\n   • Inventory is tracked at the **Unit level**, so selling `4` tablets out of a `30`-tablet box cleanly leaves `26` units (`0 Packs, 26 Units`) in stock!",
    ur: "کاروبار ایپ میں **پورا ڈبہ (Pack)** اور **کھلی گولیاں (Loose Units)** بیچنا انتہائی آسان ہے:\n\n1. **پروڈکٹ بناتے وقت (`/products/create`):**\n   • **Pack Size** میں ڈبے کے اندر موجود کل گولیوں یا یونٹس کی تعداد لکھیں (مثلاً ایک ڈبے میں `30` گولیاں)۔\n   • سسٹم خودکار طور پر ایک گولی کی قیمت (**Unit Price**) نکال لیتا ہے۔\n2. **بل بناتے وقت (POS یا Sale Invoice میں):**\n   • اگر پورا ڈبہ بیچنا ہو تو **Pack** لکھیں، اور اگر کھلی گولیاں دینی ہوں تو **Unit** کے خانے میں گولیوں کی تعداد (مثلاً `4`) لکھ دیں۔\n   • اسٹاک خودکار طور پر یونٹس کے حساب سے کم ہو جائے گا (مثلاً `30` میں سے `4` نکل کر `26` گولیاں باقی رہ جائیں گی)۔",
    links: [
      { path: "/sale-invoices/pos", en: "Open Barcode POS", ur: "بارکوڈ POS کھولیں" },
      { path: "/products/create", en: "Add Product (Set Pack Size)", ur: "پروڈکٹ بنائیں (Pack Size)" },
    ],
  },

  {
    id: "how_to_give_discount",
    phrases: [
      "how to give discount", "give discount", "apply discount", "item discount",
      "invoice discount", "bill discount", "max discount", "discount override",
      "discount kaise dein", "ڈسکاؤنٹ کیسے دیں", "رعایت دینے کا طریقہ"
    ],
    requiredGroups: [["discount", "riayat", "ڈسکاؤنٹ", "رعایت"]],
    keywords: ["discount"],
    title: {
      en: "How to Give Item-Level or Whole-Bill Discounts",
      ur: "بل میں آئٹم یا پورے بل پر ڈسکاؤنٹ (Discount) دینے کا طریقہ",
    },
    en: "You can give discounts in **2 ways** on POS, Retail, and Wholesale invoices:\n\n1. **Item-Level Discount (Per Line):**\n   • In the invoice row, enter either **Discount %** (e.g., `5%`) or **Discount Amount (Rs.)**—both fields sync automatically.\n2. **Whole-Bill / Flat Invoice Discount:**\n   • In the bottom summary footer of the invoice, enter a flat **Bill Discount** amount or percentage.\n\n**Security Note:** If a cashier enters a discount higher than the **Max Allowed Discount %** configured in **Settings (`/settings#sale`)**, the system prompts for a Manager Override PIN.",
    ur: "آپ POS، ریٹیل اور ہول سیل بلوں میں **2 طرح سے ڈسکاؤنٹ** دے سکتے ہیں:\n\n1. **ہر آئٹم پر الگ ڈسکاؤنٹ (Line Discount):**\n   • پروڈکٹ کی لائن میں **Disc %** (فیصد) یا **Disc Rs** (روپے) درج کریں—دونوں خودکار حساب کر لیتے ہیں۔\n2. **مکمل بل پر ڈسکاؤنٹ (Total Bill Discount):**\n   • بل کے نیچے ٹوٹل کے حصے میں مجموعی ڈسکاؤنٹ درج کریں۔\n\n**نوٹ:** آپ **Settings (`/settings#sale`)** میں زیادہ سے زیادہ ڈسکاؤنٹ کی حد (Max Discount %) بھی مقرر کر سکتے ہیں۔",
    links: [
      { path: "/sale-invoices/pos", en: "Barcode POS", ur: "بارکوڈ POS" },
      { path: "/sale-invoices/create/retail", en: "Retail Sale Invoice", ur: "ریٹیل سیل انوائس" },
      { path: "/settings#sale", en: "Discount & Sale Rules", ur: "ڈسکاؤنٹ اور سیل اصول" },
    ],
  },

  {
    id: "hold_park_recall_bill",
    phrases: [
      "hold bill", "how to hold a bill", "park bill", "hold invoice", "save draft bill",
      "recall held bill", "resume held bill", "hold cart", "bill hold kaise",
      "بل ہولڈ کیسے کریں", "بل روکنے کا طریقہ"
    ],
    requiredGroups: [["hold", "park", "draft", "recall", "ہولڈ"], ["bill", "invoice", "cart", "sale", "بل", "انوائس"]],
    keywords: ["f8"],
    title: {
      en: "How to Hold (Park) & Recall a Customer Bill",
      ur: "گاہک کا بل ہولڈ (Hold / Park) اور دوبارہ اوپن کرنے کا طریقہ",
    },
    en: "If a customer at the counter is still shopping or forgot their wallet, you can **Hold (Park)** their bill without losing items:\n\n1. **In Barcode POS (`/sale-invoices/pos`):**\n   • Press **`F8`** or **`Ctrl + H`** (or click the **Hold Bill** button). Your cart is saved to the Held Queue and the screen clears immediately for the next customer.\n   • To resume: click the **Held Bills** badge at the top to restore the cart in one click.\n2. **In Retail & Wholesale Invoice Forms:**\n   • Press **`Ctrl + H`** (or click **Hold / Drafts**) to park the current invoice and recall it anytime.",
    ur: "اگر کاؤنٹر پر موجود گاہک مزید چیزیں لے رہا ہو اور آپ نے اگلے گاہک کا بل بنانا ہو تو بل کو **Hold (ہولڈ)** کریں:\n\n1. **بارکوڈ POS میں (`/sale-invoices/pos`):**\n   • کی بورڈ سے **`F8`** یا **`Ctrl + H`** دبائیں یا **Hold Bill** بٹن پر کلک کریں۔ موجودہ بل محفوظ ہو جائے گا اور اسکرین نئے گاہک کے لیے خالی ہو جائے گی۔\n   • واپس لانے کے لیے اوپر **Held Bills** بٹن پر کلک کر کے بل دوبارہ لوڈ کر لیں۔\n2. **ریٹیل اور ہول سیل فارم میں:**\n   • **`Ctrl + H`** دبا کر بل ڈرافٹ/ہولڈ میں محفوظ کریں۔",
    links: [
      { path: "/sale-invoices/pos", en: "Open Barcode POS (F8 Hold)", ur: "بارکوڈ POS کھولیں" },
      { path: "/sale-invoices/create/retail", en: "Create Retail Invoice (Ctrl+H)", ur: "ریٹیل بل کھولیں" },
    ],
  },

  {
    id: "substitute_alternative_medicine",
    phrases: [
      "substitute medicine", "find substitute", "alternative medicine", "generic salt",
      "same formula", "same salt", "out of stock alternative", "متبادل دوائی",
      "ہم فارمولا دوائی", "فارمولیشن سرچ"
    ],
    requiredGroups: [["substitute", "alternative", "generic", "formula", "formulation", "salt", "متبادل", "فارمولا"]],
    keywords: ["substitute", "formulation", "salt"],
    title: {
      en: "How to Find Substitute / Alternative Medicines (Same Generic Salt)",
      ur: "ہم فارمولا متبادل دوائی (Substitute Medicine) تلاش کرنے کا طریقہ",
    },
    en: "When a requested medicine is out of stock, Karobar ERP can find **Substitute / Generic Alternatives** with the exact same active salt:\n\n1. **Setup:** When adding/editing products (`/products/create`), fill in the **Formulation / Generic Salt** field (e.g., *Paracetamol 500mg* or *Omeprazole 20mg*).\n2. **At the Counter (POS or Retail Invoice):**\n   • Search by the generic salt name directly in the product search box, **OR**\n   • Click the **Substitutes / Alternatives** action on an out-of-stock item to see all in-stock brands sharing the same formulation, along with their available batch quantities and prices!",
    ur: "اگر کوئی دوائی ختم ہو گئی ہو تو اسی فارمولے (Salt) کی دوسری کمپنی کی **متبادل دوائی (Substitute)** تلاش کرنے کا طریقہ:\n\n1. **پروڈکٹ کارڈ میں:** پروڈکٹ بناتے وقت **Formulation / Generic Salt** کے خانے میں دوائی کا فارمولا درج کریں۔\n2. **بل بناتے وقت (POS یا Sale Invoice میں):**\n   • سرچ بار میں براہِ راست فارمولا لکھ کر سرچ کریں، یا\n   • آئٹم کے آگے **Substitute / Alternatives** بٹن پر کلک کریں—سسٹم اسی فارمولے کی تمام دستیاب ادویات، ان کا اسٹاک اور قیمتیں دکھا دے گا۔",
    links: [
      { path: "/sale-invoices/pos", en: "Open Barcode POS", ur: "بارکوڈ POS کھولیں" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
    ],
  },

  {
    id: "edit_or_delete_invoice",
    phrases: [
      "edit invoice", "how to edit an invoice", "edit sale invoice", "edit purchase invoice",
      "delete invoice", "delete a sale invoice", "modify bill", "correct wrong bill",
      "cancel invoice", "void invoice", "bill edit kaise", "bill delete kaise",
      "بل ایڈٹ کیسے کریں", "بل ڈیلیٹ کیسے کریں", "بل میں تبدیلی"
    ],
    requiredGroups: [["edit", "delete", "modify", "change", "cancel", "void", "ایڈٹ", "ڈیلیٹ", "تبدیل"], ["invoice", "bill", "sale", "purchase", "بل", "انوائس"]],
    keywords: [],
    title: {
      en: "How to Edit or Delete a Sale / Purchase Invoice",
      ur: "سیل یا پرچیز بل میں ترمیم (Edit) یا ڈیلیٹ کرنے کا طریقہ",
    },
    en: "To modify or delete an existing invoice:\n\n1. **For Sale Invoices:** Open **Sale Invoices List** (`/sale-invoices`), search by Invoice # or Customer, and click the **Edit (Pencil)** icon (`/sale-invoices/:id/edit`) or **Delete** icon.\n2. **For Purchase Invoices:** Open **Purchase Invoices List** (`/purchase-invoices`), find the supplier bill, and click **Edit** (`/purchase-invoices/:id/edit`) or **Delete**.\n\n**What happens automatically:**\n• Editing or deleting an invoice **automatically reverses the old batch stock & ledger entries** and posts the corrected quantities and balances so your stock and General Ledger never go out of sync!\n• *Note:* Staff users only see Edit/Delete buttons if their **Role (`/roles`)** grants `sale-invoice.edit` / `sale-invoice.delete` permission.",
    ur: "پہلے سے بنے ہوئے سیل یا پرچیز بل میں تبدیلی (Edit) یا اسے ختم (Delete) کرنے کا طریقہ:\n\n1. **سیل بل کے لیے:** **Sale Invoices** (`/sale-invoices`) کی فہرست کھولیں، بل نمبر تلاش کریں اور آگے بنے **Edit (پنسل)** یا **Delete** آئیکن پر کلک کریں۔\n2. **پرچیز بل کے لیے:** **Purchase Invoices** (`/purchase-invoices`) میں جا کر متعلقہ بل کے آگے **Edit** یا **Delete** دبائیں۔\n\n**خودکار اثر:** بل ایڈٹ یا ڈیلیٹ کرنے سے سسٹم **خودکار طور پر اسٹاک، بیچ اور کھاتوں (Ledger) کا حساب درست کر دیتا ہے**۔ (یہ بٹن صرف ان یوزرز کو نظر آتے ہیں جن کے رول میں اس کی اجازت ہو)۔",
    links: [
      { path: "/sale-invoices", en: "Open Sale Invoices List", ur: "سیل انوائسز کی فہرست" },
      { path: "/purchase-invoices", en: "Open Purchase Invoices List", ur: "پرچیز انوائسز کی فہرست" },
      { path: "/roles", en: "Roles & Permissions", ur: "رولز اور اختیارات" },
    ],
  },

  {
    id: "sale_return_customer_refund",
    phrases: [
      "sale return", "sales return", "return sold items", "customer return",
      "customer refund", "bikay hue maal ki wapsi", "sale return kaise",
      "سیل ریٹرن", "گاہک کی واپسی", "فروخت شدہ مال کی واپسی"
    ],
    requiredGroups: [["return", "refund", "wapsi", "wapas", "واپسی", "واپس", "ریٹرن"], ["sale", "sold", "customer", "item", "سیل", "گاہک", "فروخت"]],
    negativePhrases: ["supplier", "purchase", "سپلائر", "پرچیز"],
    keywords: ["sale return"],
    title: {
      en: "How to Process a Customer Sale Return & Refund",
      ur: "گاہک سے مال واپس لینے (Sale Return) اور رقم واپسی کا طریقہ",
    },
    en: "When a customer returns sold items:\n\n1. Open **Create Sale Return** (`/sale-returns/create`) or press **`Ctrl + N`** on the Sale Returns screen.\n2. Search the original **Sale Invoice #** (recommended, as it auto-loads exact sold batches and prices) or select the **Customer** and **Product/Batch** manually.\n3. Enter the **Return Quantity**.\n4. Choose the settlement mode:\n   • **Cash / Bank Refund:** Deducts cash from your Cash Drawer/Bank.\n   • **Credit Ledger Adjustment:** Reduces the customer's unpaid receivable (`Udhar`) balance.\n5. Click **Save (`Ctrl+S`)**—the returned units are added right back into batch inventory!",
    ur: "جب کوئی گاہک خریدا ہوا مال واپس لائے تو **Sale Return** درج کرنے کا طریقہ:\n\n1. **Create Sale Return** (`/sale-returns/create`) کھولیں یا سیل ریٹرنز پیج پر **`Ctrl + N`** دبائیں۔\n2. اصل **Sale Invoice #** سرچ کر کے لوڈ کریں یا گاہک اور پروڈکٹ منتخب کریں۔\n3. واپس آنے والی مقدار (**Return Qty**) درج کریں۔\n4. منتخب کریں کہ گاہک کو **نقد رقم (Cash Refund)** واپس دی ہے یا اس کے **ادھار کھاتے (Credit Balance)** میں سے رقم کم کرنی ہے۔\n5. **Save (`Ctrl+S`)** پر کلک کریں—واپس آنے والا مال خودکار طور پر دوبارہ اسٹاک میں جمع ہو جائے گا۔",
    links: [
      { path: "/sale-returns/create", en: "Create Sale Return (Ctrl+N)", ur: "نئی سیل ریٹرن بنائیں (Ctrl+N)" },
      { path: "/sale-returns", en: "Sale Returns History", ur: "سیل ریٹرنز کی فہرست" },
    ],
  },

  // ==========================================================================
  // 3. PRODUCTS, BARCODE STICKERS, BATCHES, EXPIRY/FEFO & STOCK AUDITS
  // ==========================================================================
  {
    id: "print_barcode_stickers",
    phrases: [
      "print barcode", "barcode sticker", "barcode label", "barcode studio",
      "how to print barcode", "how to print sticker", "generate barcode",
      "barcode kaise print", "بارکوڈ اسٹیکر", "بارکوڈ کیسے پرنٹ کریں", "لیبل پرنٹنگ"
    ],
    requiredGroups: [["barcode", "sticker", "label", "بارکوڈ", "اسٹیکر", "لیبل"]],
    keywords: ["barcode", "sticker"],
    title: {
      en: "How to Generate & Print Barcode Stickers (Barcode Studio)",
      ur: "بارکوڈ اسٹیکرز (Barcode Labels) بنانے اور پرنٹ کرنے کا طریقہ",
    },
    en: "To design and print barcode stickers for your products:\n\n1. Open **Barcode Studio** (`/barcode-labels`) from the sidebar (**Items → Barcode Labels**).\n2. Search and select the **Products** (and specific **Batches**) you want to print labels for, and set the **Label Quantity** for each.\n3. Choose what appears on the sticker: **Store Name**, **Product Name**, **Retail Price (MRP)**, **Batch / Expiry**, and **Barcode Graphic**.\n4. Pick your label paper layout (Thermal Roll `38×25mm`, `50×25mm`, or A4 Sticker Sheet) and click **Print Labels**!",
    ur: "پروڈکٹس پر لگانے کے لیے **بارکوڈ اسٹیکرز (Barcode Stickers)** پرنٹ کرنے کا طریقہ:\n\n1. سائیڈ بار سے **Barcode Studio** (`/barcode-labels`) کھولیں۔\n2. جن پروڈکٹس کے اسٹیکر نکالنے ہیں انہیں منتخب کریں اور ہر ایک کے اسٹیکرز کی تعداد لکھیں۔\n3. اسٹیکر پر دکھائی دینے والی معلومات منتخب کریں (دکان کا نام، آئٹم کا نام، قیمت، ایکسپائری اور بارکوڈ)۔\n4. اپنے اسٹیکر پیپر کا سائز منتخب کریں اور **Print Labels** بٹن دبا کر پرنٹ نکال لیں۔",
    links: [
      { path: "/barcode-labels", en: "Open Barcode Studio", ur: "بارکوڈ اسٹوڈیو کھولیں" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
    ],
  },

  {
    id: "add_new_product_catalog",
    phrases: [
      "add product", "add new product", "create product", "register medicine",
      "new item", "product kaise add", "naya product",
      "نیا پروڈکٹ کیسے شامل کریں", "نئی دوائی رجسٹر کریں"
    ],
    requiredGroups: [["add", "create", "new", "register", "naya", "نیا", "شامل"], ["product", "medicine", "item", "پروڈکٹ", "دوائی", "آئٹم"]],
    negativePhrases: ["demand", "short", "stock", "purchase", "ڈیمانڈ", "اسٹاک"],
    keywords: [],
    title: {
      en: "How to Register a New Product / Medicine",
      ur: "کیٹلاگ میں نیا پروڈکٹ یا دوائی شامل کرنے کا طریقہ",
    },
    en: "To add a new product to your master catalog:\n\n1. Open **Add New Product** (`/products/create`).\n2. Enter **Product Name**, **Barcode / SKU** (scan or auto-generate), and **Formulation / Generic Salt**.\n3. Select **Category**, **Brand / Company**, **Supplier**, and **Rack / Shelf #**.\n4. Set **Pack Size** (units per box, e.g., `1` or `30`), **Purchase Price**, **Retail Price**, and **Wholesale Price** (margin % calculates automatically).\n5. Click **Save**.",
    ur: "سسٹم میں نیا پروڈکٹ یا دوائی رجسٹر کرنے کا طریقہ:\n\n1. **Add New Product** (`/products/create`) کھولیں۔\n2. پروڈکٹ کا **نام**، **بارکوڈ** اور **فارمولیشن (Salt)** درج کریں۔\n3. **کیٹیگری**، **برانڈ (کمپنی)**، **سپلائر** اور **ریک نمبر (Rack #)** منتخب کریں۔\n4. **Pack Size** (ڈبے میں یونٹس کی تعداد)، **قیمتِ خرید** اور **قیمتِ فروخت** درج کر کے **Save** پر کلک کریں۔",
    links: [
      { path: "/products/create", en: "Add New Product", ur: "نیا پروڈکٹ شامل کریں" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کی فہرست" },
    ],
  },

  {
    id: "bulk_import_excel_csv",
    phrases: [
      "import excel", "import csv", "bulk import", "upload products excel",
      "import customers", "import suppliers", "excel se import",
      "ایکسل سے امپورٹ", "بلک امپورٹ"
    ],
    requiredGroups: [["import", "upload", "excel", "csv", "امپورٹ", "ایکسل"]],
    keywords: ["import", "csv", "excel"],
    title: {
      en: "How to Bulk Import Products, Customers, Suppliers, Brands & Categories (Excel/CSV)",
      ur: "ایکسل (Excel / CSV) فائل سے ڈیٹا ایک ساتھ امپورٹ کرنے کا طریقہ",
    },
    en: "You can bulk-upload hundreds of records in seconds using **CSV / Excel Import**:\n\n1. Open the module you want to import into: **Products (`/products`)**, **Customers (`/customers`)**, **Suppliers (`/suppliers`)**, **Brands (`/brands`)**, or **Categories (`/categories`)**.\n2. Click the **Import** button at the top right.\n3. Click **Download Sample Template** inside the modal to see the exact column headers.\n4. Select your `.csv` / `.xlsx` file and click **Upload & Import**.",
    ur: "ایکسل یا CSV فائل کے ذریعے سینکڑوں پروڈکٹس، گاہک یا سپلائرز ایک ساتھ اپلوڈ کرنے کا طریقہ:\n\n1. متعلقہ صفحہ کھولیں: **Products (`/products`)**، **Customers (`/customers`)**، **Suppliers (`/suppliers`)**، **Brands (`/brands`)** یا **Categories (`/categories`)**۔\n2. اوپر دائیں جانب **Import** بٹن پر کلک کریں۔\n3. نمونے کی فائل کے لیے **Download Sample Template** پر کلک کریں، اس میں اپنا ڈیٹا ڈالیں اور فائل اپلوڈ کر دیں۔",
    links: [
      { path: "/products", en: "Import Products", ur: "پروڈکٹس امپورٹ کریں" },
      { path: "/customers", en: "Import Customers", ur: "گاہک امپورٹ کریں" },
      { path: "/suppliers", en: "Import Suppliers", ur: "سپلائرز امپورٹ کریں" },
    ],
  },

  {
    id: "check_expiry_fefo",
    phrases: [
      "check expiry", "how to check expiry", "near expiry", "expired items",
      "expired stock", "batch expiry", "fefo", "first expired first out",
      "expiry kaise check", "ایکسپائری کیسے چیک کریں", "قریب ایکسپائری"
    ],
    requiredGroups: [["expiry", "expired", "expire", "fefo", "ایکسپائری", "ایکسپائر"]],
    keywords: ["expiry", "fefo"],
    title: {
      en: "How to Track Batch Expiry & How FEFO Works",
      ur: "بیچ ایکسپائری (Batch Expiry) چیک کرنے اور FEFO کا طریقہ کار",
    },
    en: "Karobar ERP protects your store from expiry losses in **3 ways**:\n\n1. **Batch Expiry Radar (`/batch-expiry`):**\n   • Live color-coded dashboard showing **Already Expired (Red)**, **Expiring in ≤30 Days**, **31–90 Days**, and **91–180 Days** batches, with one-click actions to **Return to Supplier** or **Quarantine/Dispose**.\n2. **Printable Near-Expiry Report (`/reports/near-expiry-product`):**\n   • Filter expiring batches by **Supplier** or **Brand** and print a PDF for distributor return claims.\n3. **Automatic FEFO in POS & Sales:**\n   • During billing, the system automatically selects the **earliest expiring batch first (FEFO)** and warns/blocks expired batches.",
    ur: "کاروبار ایپ میں ایکسپائری کو کنٹرول کرنے کے **3 طاقتور فیچرز** موجود ہیں:\n\n1. **بیچ ایکسپائری ریڈار (`/batch-expiry`):**\n   • یہاں آپ ایکسپائر شدہ، 30 دن، 90 دن اور 180 دن میں ایکسپائر ہونے والے تمام بیچز الگ الگ رنگوں میں دیکھ سکتے ہیں اور وہیں سے سپلائر کو واپس (Purchase Return) یا تلف (Dispose) کر سکتے ہیں۔\n2. **قریب ایکسپائری رپورٹ (`/reports/near-expiry-product`):**\n   • سپلائر یا کمپنی کے لحاظ سے قریب ایکسپائری مال کی لسٹ پرنٹ کریں۔\n3. **خودکار FEFO اصول:**\n   • سیل بل بناتے وقت سسٹم خودکار طور پر وہ بیچ پہلے منتخب کرتا ہے جس کی ایکسپائری قریب ہو۔",
    links: [
      { path: "/batch-expiry", en: "Open Batch Expiry Radar", ur: "بیچ ایکسپائری ریڈار کھولیں" },
      { path: "/reports/near-expiry-product", en: "Near-Expiry Report", ur: "قریب ایکسپائری رپورٹ" },
      { path: "/product-batches", en: "Product Batches Workbench", ur: "پروڈکٹ بیچز ورک بینچ" },
    ],
  },

  {
    id: "opening_stock_adjustment",
    phrases: [
      "opening stock", "how to enter opening stock", "stock adjustment",
      "adjust stock", "manual stock correction", "fix stock quantity",
      "opening stock kaise", "اوپننگ اسٹاک", "اسٹاک ایڈجسٹمنٹ"
    ],
    requiredGroups: [["opening", "adjustment", "adjust", "correct", "اوپننگ", "ایڈجسٹمنٹ"], ["stock", "inventory", "qty", "اسٹاک"]],
    keywords: ["opening stock", "stock adjustment"],
    title: {
      en: "How to Enter Opening Stock or Manual Stock Adjustments",
      ur: "اوپننگ اسٹاک (Opening Stock) یا اسٹاک ایڈجسٹمنٹ درج کرنے کا طریقہ",
    },
    en: "To enter initial **Opening Stock** (without a supplier bill) or fix a manual stock count discrepancy:\n\n1. Open **Create Stock Adjustment** (`/stock-adjustments/create`).\n2. Search and select the **Product** and **Batch** (or create a batch in **Product Batches** `/product-batches`).\n3. Choose the adjustment type:\n   • **Addition (+):** Increases stock (use for Opening Stock or found units).\n   • **Deduction (−):** Decreases stock (use for minor shrinkage/audit corrections).\n4. Enter the **Quantity**, **Unit Cost**, and **Reason Note**, then click **Save**.\n\n**Impact:** Updates product/batch stock immediately and posts an Inventory Adjustment entry to the General Ledger.",
    ur: "بغیر سپلائر بل کے **ابتدائی اسٹاک (Opening Stock)** ڈالنے یا اسٹاک کی کمی بیشی درست کرنے کا طریقہ:\n\n1. **Create Stock Adjustment** (`/stock-adjustments/create`) کھولیں۔\n2. پروڈکٹ اور بیچ منتخب کریں۔\n3. اسٹاک بڑھانے کے لیے **Addition (+)** (جیسے اوپننگ اسٹاک کے لیے) یا کم کرنے کے لیے **Deduction (−)** منتخب کریں۔\n4. مقدار اور وجہ (Reason) لکھ کر **Save** دبائیں۔\n\n*(نوٹ: آپ **Product Batches** `/product-batches` اسکرین سے بھی براہِ راست نیا بیچ اور اوپننگ اسٹاک ڈال سکتے ہیں)*۔",
    links: [
      { path: "/stock-adjustments/create", en: "Create Stock Adjustment", ur: "اسٹاک ایڈجسٹمنٹ بنائیں" },
      { path: "/product-batches", en: "Product Batches Workbench", ur: "پروڈکٹ بیچز ورک بینچ" },
      { path: "/stocktake-sessions", en: "Physical Stocktake Audit", ur: "فزیکل اسٹاک آڈٹ" },
    ],
  },

  {
    id: "physical_stocktake_audit",
    phrases: [
      "stocktake", "stock take", "physical stock audit", "physical count",
      "shelf count", "inventory audit session", "اسٹاک ٹیک", "فزیکل اسٹاک آڈٹ"
    ],
    requiredGroups: [["stocktake", "audit", "physical", "count", "آڈٹ", "گنتی"]],
    keywords: ["stocktake"],
    title: {
      en: "How to Run a Physical Stocktake (Shelf Audit Session)",
      ur: "دکان کے اسٹاک کی فزیکل گنتی اور آڈٹ (Stocktake Session) کا طریقہ",
    },
    en: "To audit your physical shelves against system stock:\n\n1. Open **Stocktake Sessions** (`/stocktake-sessions`) and click **+ New Stocktake Session** (`/stocktake-sessions/create`).\n2. Scope the audit by **All Products**, a specific **Category**, **Brand**, or **Rack Location**.\n3. In the active counting screen, enter the **Physical Counted Quantity** for each item.\n4. Click **Review Variances** to see exact **Surplus (+)**, **Shortage (−)**, and value differences.\n5. Click **Approve & Sync Stock** to automatically post all stock adjustments in one click!",
    ur: "شیلف میں موجود مال کی گنتی کو کمپیوٹر اسٹاک سے ملانے (Audit) کا طریقہ:\n\n1. **Stocktake Sessions** (`/stocktake-sessions/create`) کھول کر نیا آڈٹ سیشن شروع کریں۔\n2. پوری دکان یا کسی مخصوص کیٹیگری/برانڈ کا انتخاب کریں۔\n3. ہر آئٹم کی شیلف پر موجود حقیقی تعداد (**Counted Qty**) درج کریں۔\n4. **Review** اسکرین پر کم یا زیادہ نکلنے والے مال (Variance) کا جائزہ لیں اور **Approve & Sync** دبا کر ایک کلک سے پورا اسٹاک برابر کر لیں۔",
    links: [
      { path: "/stocktake-sessions", en: "Open Stocktake Sessions", ur: "اسٹاک ٹیک آڈٹ کھولیں" },
      { path: "/stocktake-sessions/create", en: "Start New Stocktake", ur: "نیا آڈٹ شروع کریں" },
    ],
  },

  {
    id: "stock_disposal_quarantine",
    phrases: [
      "stock disposal", "dispose expired", "quarantine stock", "quarantine batch",
      "write off damaged", "damaged stock", "broken medicine", "تلف کرنا",
      "ایکسپائر مال تلف کریں", "کوارنٹائن"
    ],
    requiredGroups: [["disposal", "dispose", "quarantine", "write off", "damaged", "تلف", "کوارنٹائن"]],
    keywords: ["disposal", "quarantine"],
    title: {
      en: "How to Quarantine or Dispose Expired / Damaged Stock",
      ur: "ایکسپائر یا ٹوٹ پھوٹ کا شکار مال کوارنٹائن اور تلف (Dispose) کرنے کا طریقہ",
    },
    en: "When batches expire or break and cannot be returned to the supplier:\n\n1. Open **Stock Disposals & Quarantine** (`/stock-disposals`) or click **New Disposal** (`/stock-disposals/create`).\n2. **Quarantine:** Moves unsafe/near-expiry batches out of sellable POS stock so cashiers cannot accidentally bill them while you await supplier claim settlement.\n3. **Permanent Disposal (Write-Off):** Permanently removes the expired/damaged units from inventory, records the loss in the **General Ledger**, and prints an official **Disposal Certificate**.",
    ur: "ایکسپائر یا خراب ہونے والے مال کو سیل سے روکنے (Quarantine) یا مستقل تلف (Dispose) کرنے کا طریقہ:\n\n1. **Stock Disposals & Quarantine** (`/stock-disposals/create`) کھولیں۔\n2. **Quarantine (کوارنٹائن):** مشکوک یا ایکسپائر بیچ کو قابلِ فروخت اسٹاک سے الگ کر دیتا ہے تاکہ غلطی سے سیل نہ ہو سکے۔\n3. **Disposal (تلف کرنا):** خراب یا ایکسپائر مال کو مستقل طور پر اسٹاک سے خارج کرتا ہے، نقصان کی جنرل لیجر انٹری کرتا ہے اور سرکاری ریکارڈ کے لیے **Disposal Certificate** پرنٹ کرتا ہے۔",
    links: [
      { path: "/stock-disposals", en: "Open Stock Disposals & Quarantine", ur: "اسٹاک ڈسپوزل کھولیں" },
      { path: "/stock-disposals/create", en: "Create Stock Disposal", ur: "نیا ڈسپوزل اندراج کریں" },
    ],
  },

  // ==========================================================================
  // 4. LEDGERS (UDHAR KHATA), PAYMENTS, CASH DRAWER, ACCOUNTS & ACCOUNTING
  // ==========================================================================
  {
    id: "customer_udhar_ledger_payment",
    phrases: [
      "customer ledger", "customer udhar", "udhar khata", "check customer balance",
      "receive money from customer", "receive payment from customer", "customer payment",
      "customer recovery", "wasooli", "udhar kaise wasool", "customer khata",
      "گاہک کا ادھار کھاتہ", "کسٹمر لیجر", "گاہک سے وصولی", "ادھار کھاتہ کیسے دیکھیں"
    ],
    requiredGroups: [["customer", "udhar", "receivable", "wasool", "wasooli", "گاہک", "کسٹمر", "ادھار", "وصولی"], ["ledger", "khata", "balance", "payment", "money", "receive", "کھاتہ", "لیجر", "بیلنس", "پیمنٹ", "وصول"]],
    keywords: ["udhar", "customer ledger"],
    title: {
      en: "How to Check Customer Udhar Khata & Receive Customer Payments",
      ur: "گاہک کا ادھار کھاتہ (Customer Ledger) دیکھنے اور وصولی درج کرنے کا طریقہ",
    },
    en: "To check a customer's credit (`Udhar`) balance or record a payment received from a customer:\n\n1. Open **Customer Ledger (Udhar Khata)** (`/customer-ledger`) from the sidebar (**Finance → Customer Ledger**).\n2. Select the **Customer** to view their complete chronological statement (Opening Balance, Credit Invoices, Returns, Payments Received, and Running Balance).\n3. **To Receive Payment:** Click **+ Record Payment / Receipt** (or open `/payments`), enter the **Amount Received**, select the destination account (**Cash Drawer**, **Bank**, or **JazzCash/EasyPaisa**), and click **Save**.\n4. You can also **Print Statement PDF** or send a **WhatsApp Payment Reminder** directly from the ledger!",
    ur: "گاہک کا ادھار کھاتہ چیک کرنے اور بقایا رقم کی وصولی درج کرنے کا طریقہ:\n\n1. سائیڈ بار سے **Customer Ledger** (`/customer-ledger`) کھولیں۔\n2. مطلوبہ **Customer (گاہک)** منتخب کریں—آپ کے سامنے اس کے تمام بل، واپسی، وصولیاں اور موجودہ بقایا بیلنس آ جائے گا۔\n3. **رقم وصول کرنے کے لیے:** اوپر **+ Record Payment** بٹن پر کلک کریں، وصول شدہ رقم لکھیں، اکاؤنٹ (**کیش ڈراور** یا **بینک/والٹ**) منتخب کریں اور **Save** دبائیں۔\n4. آپ یہیں سے کھاتے کا **PDF پرنٹ** نکال سکتے ہیں یا گاہک کو **WhatsApp** پر بقایا بل کا پیغام بھیج سکتے ہیں۔",
    links: [
      { path: "/customer-ledger", en: "Open Customer Ledger (Udhar Khata)", ur: "کسٹمر کھاتہ کھولیں" },
      { path: "/payments", en: "Payment Vouchers", ur: "پیمنٹ واؤچرز" },
      { path: "/reports/outstanding-aging", en: "Outstanding Aging Report", ur: "بقایاجات ایجنگ رپورٹ" },
    ],
  },

  {
    id: "supplier_ledger_pay_supplier",
    phrases: [
      "supplier ledger", "pay supplier", "how to pay supplier", "supplier payment",
      "supplier balance", "supplier khata", "distributor payment", "vendor payment",
      "supplier ko payment", "سپلائر کو پیمنٹ", "سپلائر کا کھاتہ", "ڈسٹری بیوٹر کو ادائیگی"
    ],
    requiredGroups: [["supplier", "distributor", "vendor", "سپلائر", "ڈسٹری بیوٹر"], ["pay", "payment", "ledger", "khata", "balance", "پیمنٹ", "ادائیگی", "کھاتہ", "لیجر", "بیلنس"]],
    keywords: ["supplier ledger"],
    title: {
      en: "How to Check Supplier Balance & Pay a Supplier",
      ur: "سپلائر کا کھاتہ (Supplier Ledger) چیک کرنے اور پیمنٹ کرنے کا طریقہ",
    },
    en: "To view what you owe a supplier or record a payment to a distributor:\n\n1. Open **Supplier Ledger** (`/supplier-ledger`) from the sidebar (**Finance → Supplier Ledger**).\n2. Select the **Supplier** to inspect all Purchase Invoices, Purchase Returns, past payments, and net **Payable Balance**.\n3. **To Pay the Supplier:** Click **+ Record Payment** (or open **Payment Vouchers** `/payments`), enter the **Payment Amount**, choose the payment source (**Cash Drawer** or **Bank Account**), add any cheque/reference note, and click **Save**.\n4. The payment immediately deducts from your Cash/Bank account and reduces your Supplier Payable balance.",
    ur: "سپلائر یا ڈسٹری بیوٹر کا بقایا بیلنس دیکھنے اور اسے رقم ادا کرنے کا طریقہ:\n\n1. سائیڈ بار سے **Supplier Ledger** (`/supplier-ledger`) کھولیں۔\n2. اپنا **Supplier (سپلائر)** منتخب کریں تاکہ تمام پرچیز بل اور واجب الادا بیلنس سامنے آ جائے۔\n3. **پیمنٹ درج کرنے کے لیے:** **+ Record Payment** بٹن دبائیں (یا `/payments` کھولیں)، ادا کردہ رقم لکھیں، جس اکاؤنٹ (**کیش ڈراور** یا **بینک**) سے رقم دی ہے وہ منتخب کریں اور **Save** کر دیں۔\n4. رقم فوری طور پر سپلائر کے کھاتے سے کم ہو جائے گی اور آپ پیمنٹ سلپ بھی پرنٹ کر سکتے ہیں۔",
    links: [
      { path: "/supplier-ledger", en: "Open Supplier Ledger", ur: "سپلائر کھاتہ کھولیں" },
      { path: "/payments", en: "Open Payment Vouchers", ur: "پیمنٹ واؤچرز کھولیں" },
    ],
  },

  {
    id: "cash_drawer_shift_z_report",
    phrases: [
      "cash drawer", "open cash drawer", "close cash drawer", "open shift",
      "close shift", "z report", "opening float", "galla", "daily cash count",
      "کیش ڈراور", "گلہ کھولیں", "شفٹ کلوزنگ"
    ],
    requiredGroups: [["cash", "shift", "drawer", "galla", "z report", "کیش", "ڈراور", "گلہ", "شفٹ"]],
    keywords: ["drawer", "galla"],
    title: {
      en: "How to Open & Close the Cash Drawer Shift (Z-Report)",
      ur: "کیش ڈراور (Cash Drawer / گلہ) شفٹ کھولنے اور بند کرنے کا طریقہ",
    },
    en: "To track physical counter cash across cashier shifts:\n\n1. Open **Cash Drawer** (`/cash-drawer`) or press **`Ctrl + D`** from the topbar.\n2. **Start of Day (Open Shift):** Enter your **Opening Cash Float** (change money in the drawer) and click **Open Shift**.\n3. **During the Day:** Every cash Sale, Sale Return refund, Customer Receipt, Supplier Payment, and Expense automatically updates the **Expected Cash in Drawer**.\n4. **End of Day (Close Shift):** Count the physical cash notes in the till, enter the **Counted Cash**, review any **Over / Short variance**, and click **Close Shift & Print Z-Report**.",
    ur: "کاؤنٹر کے گلے (Cash Drawer) کا روزانہ حساب رکھنے کا طریقہ:\n\n1. **Cash Drawer** (`/cash-drawer`) کھولیں یا کی بورڈ سے **`Ctrl + D`** دبائیں۔\n2. **صبح شفٹ شروع کرتے وقت:** گلے میں موجود ابتدائی نقدی (**Opening Float**) لکھ کر **Open Shift** پر کلک کریں۔\n3. **دن بھر کے دوران:** تمام نقد سیلز، واپسی، وصولیاں اور اخراجات خودکار طور پر گلے کے بیلنس میں شامل ہوتے رہیں گے۔\n4. **رات کو دکان بند کرتے وقت:** گلے کی نقدی گن کر **Closing Count** درج کریں، فرق چیک کریں اور **Close Shift (Z-Report)** پرنٹ کر لیں۔",
    links: [
      { path: "/cash-drawer", en: "Open Cash Drawer (Ctrl+D)", ur: "کیش ڈراور کھولیں (Ctrl+D)" },
      { path: "/accounts", en: "Financial Accounts (Ctrl+A)", ur: "بینک اور کیش اکاؤنٹس" },
    ],
  },

  {
    id: "bank_accounts_fund_transfer",
    phrases: [
      "transfer money", "cash to bank", "bank to cash", "deposit cash in bank",
      "bank account", "mobile wallet", "jazzcash", "easypaisa", "financial accounts",
      "کیش سے بینک ٹرانسفر", "بینک اکاؤنٹ کیسے بنائیں"
    ],
    requiredGroups: [["transfer", "deposit", "bank", "wallet", "jazzcash", "easypaisa", "account", "ٹرانسفر", "بینک", "اکاؤنٹ"]],
    keywords: ["transfer", "jazzcash", "easypaisa"],
    title: {
      en: "How to Manage Bank / Wallet Accounts & Transfer Funds (Cash / Bank)",
      ur: "بینک / والٹ اکاؤنٹس بنانے اور کیش سے بینک میں رقم منتقل کرنے کا طریقہ",
    },
    en: "To manage your **Bank Accounts**, **Mobile Wallets (JazzCash / EasyPaisa)**, and **Cash Drawer** balances:\n\n1. Open **Financial Accounts** (`/accounts`) or press **`Ctrl + A`** from anywhere.\n2. **Add a Bank or Wallet:** Click **+ Add Account**, choose the type (`Bank`, `Mobile Wallet`, or `Cash`), enter the Account Title/Number and Opening Balance, and click **Save**.\n3. **Transfer Money (e.g., Cash Drawer → Bank Deposit):** Click **Transfer Funds**, select **From Account** (e.g., Cash Drawer) and **To Account** (e.g., Meezan Bank), enter the **Amount**, and click **Transfer**.",
    ur: "بینک اکاؤنٹس، جاز کیش/ایزی پیسہ اور کیش ٹرانسفر منیج کرنے کا طریقہ:\n\n1. **Financial Accounts** (`/accounts`) کھولیں یا **`Ctrl + A`** دبائیں۔\n2. **نیا اکاؤنٹ بنانے کے لیے:** **+ Add Account** پر کلک کر کے بینک یا موبائل والٹ کا نام اور ابتدائی بیلنس درج کریں۔\n3. **کیش سے بینک میں رقم جمع کروانے کے لیے:** **Transfer Funds** بٹن دبائیں، کس اکاؤنٹ سے کس اکاؤنٹ میں رقم بھیجنی ہے منتخب کریں اور رقم لکھ کر محفوظ کریں۔",
    links: [
      { path: "/accounts", en: "Open Financial Accounts (Ctrl+A)", ur: "فنانشل اکاؤنٹس کھولیں (Ctrl+A)" },
      { path: "/accounting", en: "Double-Entry Accounting", ur: "ڈبل انٹری اکاؤنٹنگ" },
    ],
  },

  {
    id: "record_shop_expenses",
    phrases: [
      "shop rent", "electricity bill", "add expense", "record expense",
      "operating expense", "daily expense", "tea expense", "kharcha kaise",
      "دکان کا خرچہ", "کرایہ اور بجلی کا بل", "اخراجات کیسے درج کریں"
    ],
    requiredGroups: [["expense", "rent", "electricity", "bill", "kharcha", "خرچہ", "اخراجات", "کرایہ", "بجلی"]],
    negativePhrases: ["purchase invoice", "sale invoice"],
    keywords: ["expense", "kharcha"],
    title: {
      en: "How to Record Store Expenses (Rent, Electricity, Refreshments, Freight)",
      ur: "دکان کے روزمرہ اخراجات (کرایہ، بجلی کا بل، چائے پانی) درج کرنے کا طریقہ",
    },
    en: "To record store overhead expenses:\n\n1. Open **Operating Expenses** (`/expenses`) from the sidebar (**Finance → Expenses**).\n2. Click **Expense Categories** if you want to create a custom category (e.g., *Shop Rent*, *Electricity Bill*, *Staff Tea*, *Packaging*).\n3. Click **+ Add Expense**, select the **Category**, **Date**, **Amount**, **Payment Account** (Cash Drawer or Bank), and **Notes**, then click **Save**.\n\n**Impact:** Automatically deducts from the selected Cash/Bank account and subtracts from Gross Profit on your **Profit & Loss Report (`/reports/net-profit`)**.",
    ur: "دکان کے اخراجات (جیسے کرایہ، بجلی کا بل، چائے پانی، پیکنگ یا مرمت) ریکارڈ کرنے کا طریقہ:\n\n1. سائیڈ بار سے **Operating Expenses** (`/expenses`) کھولیں۔\n2. **+ Add Expense** پر کلک کریں۔\n3. خرچے کی **کیٹیگری (Category)**، **تاریخ**، **رقم**، **ادائیگی کا اکاؤنٹ** (کیش ڈراور یا بینک) اور تفصیل لکھ کر **Save** دبائیں۔\n\n**اثر:** یہ رقم کیش یا بینک سے کم ہو جاتی ہے اور **نفع و نقصان کی رپورٹ (`/reports/net-profit`)** میں شامل ہو کر خالص منافع دکھاتی ہے۔",
    links: [
      { path: "/expenses", en: "Open Operating Expenses", ur: "کاروباری اخراجات کھولیں" },
      { path: "/reports/net-profit", en: "Profit & Loss Report", ur: "نفع و نقصان کی رپورٹ" },
    ],
  },

  {
    id: "double_entry_accounting_gl_jv",
    phrases: [
      "double entry", "general ledger", "chart of accounts", "journal voucher",
      "manual jv", "trial balance", "balance sheet", "owner capital", "owner drawing",
      "ڈبل انٹری اکاؤنٹنگ", "جنرل لیجر", "ٹرائل بیلنس", "بیلنس شیٹ"
    ],
    requiredGroups: [["accounting", "ledger", "journal", "voucher", "trial", "capital", "coa", "اکاؤنٹنگ", "لیجر", "بیلنس شیٹ"]],
    keywords: ["jv", "coa", "trial balance", "balance sheet"],
    title: {
      en: "How Double-Entry Accounting, General Ledger & Journal Vouchers (JV) Work",
      ur: "ڈبل انٹری اکاؤنٹنگ، جنرل لیجر اور جرنل واؤچر (JV) کا طریقہ کار",
    },
    en: "**Double-Entry Accounting (`/accounting`)** is your IFRS-compliant financial engine:\n\n1. **100% Automated Operational Postings:** Every Sale, Purchase, Return, Payment, Expense, and Payroll transaction automatically posts a balanced `Debit = Credit` Journal Voucher to the General Ledger.\n2. **Chart of Accounts (COA):** Organized into `1000 Assets`, `2000 Liabilities`, `3000 Equity`, `4000 Revenue`, and `5000 Expenses`.\n3. **Manual Journal Vouchers (JV):** Click **+ Post Journal Voucher** in `/accounting` to record **Owner Capital injections**, **Owner Drawings**, **Depreciation**, or fixed asset adjustments.\n4. **Financial Statements:** View and print your real-time **Trial Balance**, **Balance Sheet**, and **Income Statement**.",
    ur: "**ڈبل انٹری اکاؤنٹنگ (`/accounting`)** میں آپ کے کاروبار کا مکمل مالیاتی حساب خودکار طریقے سے بنتا ہے:\n\n1. **خودکار جنرل لیجر انٹری:** جب بھی آپ سیل، پرچیز، ریٹرن، پیمنٹ، خرچہ یا تنخواہ درج کرتے ہیں تو سسٹم خودکار طور پر جنرل لیجر میں اس کی ڈبل انٹری (`Debit = Credit`) کر دیتا ہے۔\n2. **مینوئل جرنل واؤچر (JV):** اگر کاروبار میں نیا سرمایہ (Capital) ڈالنا ہو یا ذاتی استعمال (Drawing) کی انٹری کرنی ہو تو `/accounting` میں **+ Post Journal Voucher** استعمال کریں۔\n3. **ٹرائل بیلنس اور بیلنس شیٹ:** ایک کلک سے مکمل ٹرائل بیلنس اور بیلنس شیٹ چیک اور پرنٹ کریں۔",
    links: [
      { path: "/accounting", en: "Open Accounting & GL", ur: "ڈبل انٹری اکاؤنٹنگ کھولیں" },
      { path: "/reports/net-profit", en: "Profit & Loss Report", ur: "نفع و نقصان کی رپورٹ" },
    ],
  },

  // ==========================================================================
  // 5. HR, STAFF ATTENDANCE, MONTHLY PAYROLL & SALESPERSON COMMISSIONS
  // ==========================================================================
  {
    id: "mark_staff_attendance",
    phrases: [
      "mark attendance", "how to mark attendance", "daily attendance",
      "staff attendance", "employee attendance", "hazri kaise",
      "حاضری کیسے لگائیں", "ملازمین کی حاضری"
    ],
    requiredGroups: [["attendance", "present", "absent", "hazri", "حاضری"]],
    keywords: ["attendance", "hazri"],
    title: {
      en: "How to Mark Daily Staff Attendance",
      ur: "عملے کی روزانہ حاضری (Daily Attendance) لگانے کا طریقہ",
    },
    en: "To mark daily attendance for your staff:\n\n1. Open **HR & Payroll Center** (`/hr-payroll`) and switch to **Tab 2: Daily Attendance** (`/hr-payroll?tab=attendance`).\n2. Select the **Attendance Date**.\n3. Mark each employee as **Present**, **Late**, **Half-Day**, **Absent**, **Paid Leave**, or **Holiday** (or click **Mark All Present** for one-click entry).\n4. Click **Save Attendance**.\n\n**Impact:** Absent and Half-Day records automatically calculate pro-rated deductions when you generate **Monthly Payroll** at month-end!",
    ur: "دکان کے ملازمین کی روزانہ حاضری لگانے کا طریقہ:\n\n1. **HR & Payroll Center** (`/hr-payroll?tab=attendance`) کھولیں اور **Attendance** ٹیب پر کلک کریں۔\n2. تاریخ منتخب کریں اور ہر ملازم کے آگے **Present (حاضر)**، **Late**، **Half-Day**، **Absent (غیر حاضر)** یا **Leave (چھٹی)** نشان زد کریں (یا سب کو حاضر کرنے کے لیے **Mark All Present** دبائیں)۔\n3. **Save Attendance** پر کلک کریں۔ مہینے کے آخر میں تنخواہ بناتے وقت چھٹیوں کی کٹوتی خودکار ہو جائے گی۔",
    links: [
      { path: "/hr-payroll", en: "Open HR & Attendance Center", ur: "ایچ آر اور حاضری کھولیں" },
    ],
  },

  {
    id: "pay_staff_salary_payroll_commission",
    phrases: [
      "pay staff salary", "how to pay salary", "monthly payroll", "generate payroll",
      "salary advance", "staff salary", "sales commission", "salesman commission",
      "tankhwah kaise dein", "تنخواہ کیسے دیں", "ماہانہ پے رول", "سیلز کمیشن"
    ],
    requiredGroups: [["salary", "payroll", "commission", "advance", "employee", "staff", "tankhwah", "تنخواہ", "پے رول", "کمیشن", "ملازم"]],
    keywords: ["salary", "payroll", "commission", "tankhwah"],
    title: {
      en: "How to Manage Employees, Salary Advances, Monthly Payroll & Sales Commissions",
      ur: "ملازمین کی تنخواہ (Payroll)، ایڈوانس اور سیلز کمیشن دینے کا طریقہ",
    },
    en: "All staff compensation is managed in **HR & Payroll Center (`/hr-payroll`)**:\n\n1. **Add Employees & Salary Advances (`Tab 1 — Directory`):**\n   • Register each staff member with their **Basic Salary**, **Allowances**, and **Sales Commission Rule** (`% of Sale`, `% of Profit`, or `Fixed per Invoice`).\n   • If an employee takes a mid-month loan/advance, click **Issue Salary Advance**.\n2. **Generate & Pay Monthly Salary (`Tab 3 — Monthly Payroll`):**\n   • Select the **Month** and click **Generate Payroll**. The system automatically deducts **Absent Days** and **Salary Advances** and adds **Earned Commissions**.\n   • Click **Disburse / Pay Salary** to pay from **Cash Drawer** or **Bank** and print the **Salary Slip**.\n3. **Sales Commissions (`Tab 4 — Commissions`):**\n   • Track and settle salesperson commissions earned on wholesale/retail invoices.",
    ur: "اسٹاف کی تنخواہ، ایڈوانس اور کمیشن کا مکمل انتظام **HR & Payroll Center (`/hr-payroll`)** میں ہوتا ہے:\n\n1. **ملازم کا اندراج اور ایڈوانس (`Directory ٹیب`):**\n   • ملازم کا نام، بنیادی تنخواہ، الاؤنس اور کمیشن کا اصول درج کریں۔ اگر ملازم مہینے کے درمیان **ایڈوانس (پیشگی رقم)** لے تو وہ بھی یہیں سے درج کریں۔\n2. **ماہانہ تنخواہ کی تیاری اور ادائیگی (`Payroll ٹیب`):**\n   • مہینہ منتخب کر کے **Generate Payroll** دبائیں۔ سسٹم خودکار طور پر غیر حاضری اور ایڈوانس کاٹ کر اور کمیشن شامل کر کے خالص تنخواہ نکال دے گا۔\n   • **Pay / Disburse** پر کلک کر کے کیش یا بینک سے تنخواہ ادا کریں اور سلپ پرنٹ کریں۔",
    links: [
      { path: "/hr-payroll", en: "Open HR & Payroll Center", ur: "ایچ آر اور پے رول سینٹر کھولیں" },
      { path: "/expenses", en: "Operating Expenses", ur: "کاروباری اخراجات" },
    ],
  },

  // ==========================================================================
  // 6. REPORTS & ANALYTICS (TODAY SALE, PROFIT, LOW STOCK, VALUATION, TAX)
  // ==========================================================================
  {
    id: "check_today_sales_report",
    phrases: [
      "check today sale", "how to check today sale", "today sales", "daily sale",
      "aaj ki sale", "sale report", "sales detail report",
      "آج کی سیل کیسے دیکھیں", "سیل رپورٹ"
    ],
    requiredGroups: [["today", "daily", "check", "report", "detail", "aaj", "آج", "رپورٹ", "چیک"], ["sale", "sales", "سیل", "فروخت"]],
    negativePhrases: ["return", "create", "make"],
    keywords: ["sale detail"],
    title: {
      en: "How to Check Today's Sales & Detailed Sales Reports",
      ur: "آج کی سیل (Today's Sales) اور تفصیلی سیل رپورٹ دیکھنے کا طریقہ",
    },
    en: "You can check today's sales in **3 places**:\n\n1. **Dashboard (`/dashboard`):** Set the top-right date filter to **Today** to see Total Sales Revenue, Gross Profit, Returns, and Net Collections at a glance.\n2. **Sales Detail Report (`/reports/sale-detail`):** Pick any date range (e.g., Today) and filter by **Customer**, **Product**, **Brand**, or **Cashier/User** to see every sold item and print a PDF.\n3. **Sale Invoices List (`/sale-invoices`):** Browse, reprint, or inspect every individual invoice billed today.",
    ur: "آج کی کل سیل اور فروخت کی تفصیل دیکھنے کے **3 طریقے** ہیں:\n\n1. **ڈیش بورڈ (`/dashboard`):** اوپر تاریخ کا فلٹر **Today (آج)** پر سیٹ کریں تاکہ آج کی کل سیل، منافع اور وصولیاں سامنے آ جائیں۔\n2. **سیلز تفصیلی رپورٹ (`/reports/sale-detail`):** تاریخ، گاہک، پروڈکٹ یا کیشیئر کے لحاظ سے مکمل رپورٹ دیکھیں اور PDF پرنٹ نکالیں۔\n3. **سیل انوائسز لسٹ (`/sale-invoices`):** آج بننے والے تمام بلوں کی فہرست دیکھیں۔",
    links: [
      { path: "/reports/sale-detail", en: "Open Sales Detail Report", ur: "سیل تفصیلی رپورٹ کھولیں" },
      { path: "/dashboard", en: "Open Dashboard", ur: "ڈیش بورڈ کھولیں" },
      { path: "/sale-invoices", en: "All Sale Invoices", ur: "تمام سیل انوائسز" },
    ],
  },

  {
    id: "check_profit_and_loss_margin",
    phrases: [
      "check profit", "how to check profit", "net profit", "profit and loss",
      "income statement", "cost of sale", "item margin", "munafa kaise check",
      "منافع کیسے چیک کریں", "نفع و نقصان کی رپورٹ"
    ],
    requiredGroups: [["profit", "loss", "margin", "cogs", "munafa", "nafa", "منافع", "نفع"]],
    keywords: ["profit", "munafa", "cogs"],
    title: {
      en: "How to Check Net Profit (P&L) & Item-Wise Profit Margins",
      ur: "کاروبار کا خالص منافع (Net Profit) اور آئٹم وائز مارجن چیک کرنے کا طریقہ",
    },
    en: "Karobar ERP provides **3 profitability reports**:\n\n1. **Profit & Loss Statement (`/reports/net-profit`):**\n   • Shows `Gross Sales − Sale Returns = Net Revenue`, minus `Batch Cost of Goods Sold (COGS) = Gross Profit`, minus `Operating Expenses = Net Profit` for any date range.\n2. **Cost of Sale Summary (`/reports/cost-of-sale`):**\n   • Compares invoice-wise Sale Value vs. Purchase Cost and Gross Margin %.\n3. **Cost of Sale Detail (`/reports/cost-of-sale-detail`):**\n   • Shows item-by-item profit earned on every sold product.",
    ur: "اپنے کاروبار کا منافع چیک کرنے کے لیے یہ **3 رپورٹس** استعمال کریں:\n\n1. **نفع و نقصان کی رپورٹ (`/reports/net-profit`):**\n   • منتخب تاریخوں کی کل سیل میں سے فروخت شدہ مال کی اصل لاگت (COGS) اور دکان کے اخراجات نکال کر **خالص منافع (Net Profit)** دکھاتی ہے۔\n2. **لاگتِ فروخت کا خلاصہ (`/reports/cost-of-sale`):**\n   • ہر بل پر حاصل ہونے والا منافع اور مارجن فیصد دکھاتی ہے۔\n3. **آئٹم وائز منافع کی رپورٹ (`/reports/cost-of-sale-detail`):**\n   • ہر فروخت شدہ پروڈکٹ پر ملنے والا منافع الگ الگ دکھاتی ہے۔",
    links: [
      { path: "/reports/net-profit", en: "Open Profit & Loss (P&L)", ur: "نفع و نقصان (P&L) کھولیں" },
      { path: "/reports/cost-of-sale", en: "Cost of Sale (COGS)", ur: "لاگتِ فروخت (COGS)" },
      { path: "/reports/cost-of-sale-detail", en: "Item-Wise Profit Detail", ur: "آئٹم وائز منافع رپورٹ" },
    ],
  },

  {
    id: "check_low_stock_shortage",
    phrases: [
      "low stock", "how to check low stock", "out of stock", "shortage items",
      "reorder report", "kam stock", "کم اسٹاک", "ختم ہونے والا مال"
    ],
    requiredGroups: [["low", "shortage", "reorder", "out", "kam", "کم", "ختم"], ["stock", "item", "product", "اسٹاک", "مال"]],
    keywords: ["low stock", "reorder"],
    title: {
      en: "How to Check Low-Stock & Out-of-Stock Items",
      ur: "کم اسٹاک (Low Stock) اور ختم ہونے والے آئٹمز چیک کرنے کا طریقہ",
    },
    en: "To see all products that are running low or out of stock:\n\n1. **Low Stock & Reorder Report (`/reports/reorder`):** Lists every item whose stock has fallen below its pack/reorder threshold. You can filter by **Supplier** and print the list for your order booker.\n2. **Smart Reorder Forecast (`/purchase-orders/forecast`):** Calculates suggested order quantities based on daily sales velocity and creates a Purchase Order in one click.\n3. **Products Catalog (`/products`):** Toggle the **Low Stock** filter chip at the top of the catalog.",
    ur: "کم اسٹاک والے آئٹمز چیک کرنے کے **3 آسان طریقے** ہیں:\n\n1. **کم اسٹاک رپورٹ (`/reports/reorder`):** ان تمام اشیاء کی فہرست دکھاتی ہے جن کا اسٹاک کم یا ختم ہو چکا ہے؛ اسے سپلائر کے لحاظ سے فلٹر کر کے پرنٹ نکال سکتے ہیں۔\n2. **سمارٹ ری آرڈر فورکاسٹ (`/purchase-orders/forecast`):** سیلز کی رفتار کے مطابق خودکار پرچیز آرڈر تیار کرتا ہے۔\n3. **پروڈکٹس کیٹلاگ (`/products`):** اوپر **Low Stock** فلٹر بٹن آن کریں۔",
    links: [
      { path: "/reports/reorder", en: "Open Low Stock Report", ur: "کم اسٹاک رپورٹ کھولیں" },
      { path: "/purchase-orders/forecast", en: "Smart Reorder Forecast", ur: "سمارٹ ری آرڈر فورکاسٹ" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
    ],
  },

  {
    id: "current_stock_valuation_history",
    phrases: [
      "current stock value", "stock valuation", "total inventory value",
      "product history", "stock card", "item movement history",
      "موجودہ اسٹاک کی مالیت", "پروڈکٹ کی مکمل ہسٹری"
    ],
    requiredGroups: [["valuation", "value", "current", "history", "comprehensive", "card", "مالیت", "ہسٹری"], ["stock", "inventory", "product", "اسٹاک", "پروڈکٹ"]],
    keywords: ["valuation", "comprehensive"],
    title: {
      en: "How to Check Current Stock Valuation & Item Movement History",
      ur: "موجودہ اسٹاک کی کل مالیت اور پروڈکٹ کی مکمل ہسٹری دیکھنے کا طریقہ",
    },
    en: "1. **Current Stock & Valuation Report (`/reports/current-stock`):**\n   • Shows every product's on-hand quantity along with **Total Purchase Cost Value** and **Total Retail Value** of your entire store (filterable by Category, Brand, or Supplier).\n2. **Product Comprehensive History / Stock Card (`/reports/product-comprehensive`):**\n   • Select any single product to trace every **Purchase, Sale, Return, Adjustment, and Disposal** unit-by-unit.",
    ur: "1. **موجودہ اسٹاک اور مالیت کی رپورٹ (`/reports/current-stock`):**\n   • پوری دکان میں موجود مال کی تعداد، کل قیمتِ خرید (**Total Cost Value**) اور کل قیمتِ فروخت (**Total Sale Value**) دکھاتی ہے۔\n2. **پروڈکٹ کی مکمل ہسٹری (`/reports/product-comprehensive`):**\n   • کسی بھی ایک آئٹم کا مکمل کھاتہ (کب خریدا، کس کو بیچا، کتنا واپس آیا اور موجودہ اسٹاک کیسے بنا) دکھاتی ہے۔",
    links: [
      { path: "/reports/current-stock", en: "Current Stock Valuation Report", ur: "موجودہ اسٹاک رپورٹ" },
      { path: "/reports/product-comprehensive", en: "Product History (Stock Card)", ur: "پروڈکٹ ہسٹری رپورٹ" },
    ],
  },

  {
    id: "tax_gst_return_report",
    phrases: [
      "tax report", "tax return", "gst report", "sales tax", "withholding tax",
      "wht report", "fbr tax", "ٹیکس رپورٹ", "جی ایس ٹی گوشوارہ"
    ],
    requiredGroups: [["tax", "gst", "wht", "withholding", "fbr", "ٹیکس", "جی ایس ٹی"]],
    keywords: ["gst", "wht", "tax"],
    title: {
      en: "How to Check Statutory Tax / GST & Withholding Tax (WHT) Reports",
      ur: "ٹیکس اور جی ایس ٹی (GST / WHT) گوشوارہ رپورٹ دیکھنے کا طریقہ",
    },
    en: "Open **Statutory Tax & GST Return Report (`/reports/tax-return`)** to view your complete tax summary for any filing period:\n\n• **Output Sales Tax:** Total GST collected on Sale Invoices.\n• **Input Tax & WHT:** Total tax paid on Purchase Invoices.\n• **Net Tax Liability:** Automatically calculates `Output Tax − Input Tax = Net Tax Payable` (or refundable carry-forward credit) with a printable PDF schedule.",
    ur: "کسی بھی مہینے کا ٹیکس حساب دیکھنے کے لیے **Tax & GST Return Report (`/reports/tax-return`)** کھولیں:\n\n• یہ رپورٹ سیل بلوں پر وصول کیے گئے **Output Tax** اور خریداری کے بلوں پر ادا کیے گئے **Input Tax / WHT** کا موازنہ کر کے واجب الادا ٹیکس کا مکمل حساب اور PDF پرنٹ فراہم کرتی ہے۔",
    links: [
      { path: "/reports/tax-return", en: "Open Tax & GST Return Report", ur: "ٹیکس گوشوارہ رپورٹ کھولیں" },
      { path: "/accounting", en: "Double-Entry Accounting", ur: "ڈبل انٹری اکاؤنٹنگ" },
    ],
  },

  // ==========================================================================
  // 7. SETTINGS, PASSWORD, PRINTER, USERS/ROLES, BACKUPS & LICENSE
  // ==========================================================================
  {
    id: "change_password_user_profile",
    phrases: [
      "change password", "how to change password", "reset password", "update password",
      "update profile", "change my name", "password kaise badlein",
      "پاس ورڈ کیسے بدلیں", "پاس ورڈ تبدیل کریں"
    ],
    requiredGroups: [["password", "profile", "پاس ورڈ", "پروفائل"]],
    keywords: ["password"],
    title: {
      en: "How to Change Your Password or Update Staff Passwords",
      ur: "اپنا یا اسٹاف کا پاس ورڈ تبدیل کرنے کا طریقہ",
    },
    en: "1. **To change your own password:** Open **My Profile (`/profile`)** (or click your avatar in the top-right bar), enter your **Current Password** and **New Password**, and click **Save Changes**.\n2. **To reset a staff member's password (Admin):** Open **Staff Login Users (`/users`)**, click **Edit** next to that staff user, type a new password, and click **Save**.",
    ur: "1. **اپنا پاس ورڈ بدلنے کے لیے:** اوپر دائیں کونے سے **Profile (`/profile`)** کھولیں، موجودہ پاس ورڈ اور نیا پاس ورڈ لکھ کر **Save** دبائیں۔\n2. **کسی ملازم کا پاس ورڈ بدلنے کے لیے:** **Users (`/users`)** میں جا کر اس یوزر کے آگے **Edit** پر کلک کریں اور نیا پاس ورڈ سیٹ کر دیں۔",
    links: [
      { path: "/profile", en: "Open My Profile", ur: "اپنی پروفائل کھولیں" },
      { path: "/users", en: "Manage Staff Users", ur: "اسٹاف یوزرز منیج کریں" },
    ],
  },

  {
    id: "printer_receipt_template_settings",
    phrases: [
      "printer setting", "thermal printer", "80mm receipt", "a4 invoice print",
      "receipt template", "invoice logo", "shop name on bill", "printer kaise set",
      "پرنٹر سیٹنگ", "تھرمل پرنٹر", "بل کا ڈیزائن"
    ],
    requiredGroups: [["printer", "thermal", "receipt", "template", "logo", "پرنٹر", "تھرمل", "رسید"]],
    keywords: ["printer", "thermal"],
    title: {
      en: "How to Configure Thermal (80mm) / A4 Printer & Receipt Templates",
      ur: "تھرمل پرنٹر، A4 پرنٹ اور بل کا ڈیزائن (Logo / Template) سیٹ کرنے کا طریقہ",
    },
    en: "To customize your printed bills and receipt layout:\n\n1. Open **System Settings (`/settings`)**.\n2. **In the General Tab:** Upload your **Store Logo**, set your **Store Name**, **Phone**, **Address**, **License #**, and **Invoice Footer Note**.\n3. **In the Printer Setting Tab:**\n   • Choose default paper size: **Thermal 80mm** or **A4 Full Page**.\n   • Pick your preferred invoice design: **Standard**, **Detailed**, **Compact**, **Bold**, **Barcode**, or **Minimal**.\n4. Click **Save Settings**.",
    ur: "بل پر اپنی دکان کا نام، لوگو اور پرنٹر سائز سیٹ کرنے کا طریقہ:\n\n1. **System Settings (`/settings`)** کھولیں۔\n2. **General ٹیب میں:** دکان کا نام، فون نمبر، پتہ، لائسنس نمبر، لوگو اور بل کے نیچے چھپنے والا نوٹ درج کریں۔\n3. **Printer Setting ٹیب میں:** **Thermal (80mm)** یا **A4** سائز منتخب کریں اور بل کا ڈیزائن (Standard، Detailed، Compact وغیرہ) چن کر **Save** دبائیں۔",
    links: [
      { path: "/settings", en: "Open System Settings", ur: "سسٹم سیٹنگز کھولیں" },
    ],
  },

  {
    id: "staff_users_roles_permissions",
    phrases: [
      "add user", "create cashier account", "staff login", "roles and permissions",
      "restrict cashier", "hide profit from cashier", "user permission",
      "نیا یوزر کیسے بنائیں", "کیشیئر کے اختیارات"
    ],
    requiredGroups: [["user", "cashier", "role", "permission", "login", "یوزر", "رول", "اختیارات", "کیشیئر"]],
    negativePhrases: ["demand"],
    keywords: ["role", "permission"],
    title: {
      en: "How to Create Staff Logins & Restrict Cashier Permissions (Roles)",
      ur: "کیشیئر یا اسٹاف کا لاگ ان بنانے اور اختیارات (Permissions) محدود کرنے کا طریقہ",
    },
    en: "To give staff their own login while hiding sensitive screens (like Net Profit or Invoice Deletion):\n\n1. **Step 1 — Define the Role (`/roles`):**\n   • Open **Roles & Permissions (`/roles`)** and click **+ Create Role** (e.g., *Cashier* or *Salesman*).\n   • Check only the actions they should have (e.g., allow `POS & Sale Invoice Create`, and uncheck `Delete`, `Reports`, or `Settings`), then click **Save**.\n2. **Step 2 — Create the User Login (`/users`):**\n   • Open **Staff Login Users (`/users/create`)**, enter the staff member's Name, Email, Password, and assign their **Role**.",
    ur: "ملازمین کے لیے الگ لاگ ان بنانے اور ان کے اختیارات کنٹرول کرنے کا طریقہ:\n\n1. **پہلا مرحلہ — رول بنائیں (`/roles`):**\n   • **Roles & Permissions (`/roles/create`)** کھولیں، رول کا نام (مثلاً *Cashier*) رکھیں اور صرف وہ اختیارات ٹک (Check) کریں جن کی اجازت دینی ہے (مثلاً بل بنانے کی اجازت، لیکن ڈیلیٹ یا منافع دیکھنے کی اجازت بند)۔\n2. **دوسرا مرحلہ — یوزر بنائیں (`/users`):**\n   • **Users (`/users/create`)** کھول کر ملازم کا نام، ای میل، پاس ورڈ لکھیں اور اسے وہ رول دے دیں۔",
    links: [
      { path: "/roles", en: "Open Roles & Permissions", ur: "رولز اور اختیارات کھولیں" },
      { path: "/users", en: "Open Staff Users", ur: "اسٹاف یوزرز کھولیں" },
    ],
  },

  {
    id: "database_backup_restore",
    phrases: [
      "backup database", "how to backup", "create backup", "restore backup",
      "download backup", "data safety", "cloud backup", "ڈیٹا بیک اپ", "بیک اپ کیسے لیں"
    ],
    requiredGroups: [["backup", "restore", "بیک اپ", "ری اسٹور"]],
    keywords: ["backup", "restore"],
    title: {
      en: "How to Backup & Restore Your Business Database",
      ur: "سافٹ ویئر کے ڈیٹا کا بیک اپ (Backup) لینے اور ری اسٹور کرنے کا طریقہ",
    },
    en: "To keep your ERP database 100% safe:\n\n1. Open **Backups & Storage (`/backups`)** from the sidebar (**System → Backups**).\n2. Click **Create Backup Now** to generate an instant snapshot of all your products, invoices, ledgers, and settings.\n3. Click **Download** on the backup row to save a copy onto an external USB flash drive or cloud folder.\n4. You can also enable **Automated Backup Schedules** or click **Restore** to recover from a backup archive.",
    ur: "اپنے کاروباری ڈیٹا کو محفوظ رکھنے کے لیے بیک اپ لینے کا طریقہ:\n\n1. سائیڈ بار سے **Backups (`/backups`)** کھولیں۔\n2. **Create Backup Now** بٹن پر کلک کریں—چند سیکنڈ میں پورے ڈیٹا کا بیک اپ تیار ہو جائے گا۔\n3. **Download** بٹن دبا کر بیک اپ فائل کو اپنی USB یا دوسری ڈرائیو میں محفوظ کر لیں۔",
    links: [
      { path: "/backups", en: "Open Backups & Restore", ur: "ڈیٹا بیک اپ کھولیں" },
    ],
  },

  {
    id: "keyboard_shortcuts_master",
    phrases: [
      "keyboard shortcut", "keyboard shortcuts", "all shortcuts", "shortcut keys",
      "hotkeys", "fast keys", "کی بورڈ شارٹ کٹس", "شارٹ کٹ بٹن"
    ],
    requiredGroups: [["shortcut", "hotkey", "شارٹ کٹ"]],
    keywords: ["shortcut", "hotkey"],
    title: {
      en: "All Keyboard Shortcuts in Karobar App ERP",
      ur: "کاروبار ایپ کے تمام اہم کی بورڈ شارٹ کٹس",
    },
    en: "Use these keyboard shortcuts anywhere in Karobar ERP for high-speed operation:\n\n• **`Ctrl + G`** — Open/Close Karo AI Assistant\n• **`Ctrl + K`** — Quick Go-To-Page Command Palette\n• **`Ctrl + Shift + A` / `Ctrl + Shift + O`** — Search Open Tabs & Open Any Page in New Tab\n• **`Ctrl + Tab` / `Ctrl + Shift + Tab`** — Switch Next / Previous Browser Tab\n• **`Ctrl + Shift + 1..9`** — Jump Directly to Browser Tab 1–8 or Last Tab\n• **`Ctrl + F4` / `Ctrl + Shift + Q`** — Close Active Browser Tab\n• **`Ctrl + Shift + T` / `Ctrl + Shift + N` / `Ctrl + Shift + D`** — Reopen Closed Tab / New Dashboard Tab / Duplicate Tab\n• **`Ctrl + P`** — Global Product, Price & Batch Lookup\n• **`Ctrl + 1`** — Create Purchase Invoice (Add Stock)\n• **`Ctrl + 2`** — Create Retail Sale Invoice\n• **`Ctrl + 3` / `Ctrl + W`** — Create Wholesale Sale Invoice\n• **`Ctrl + Shift + P`** — Open Barcode POS in New Tab\n• **`Ctrl + Shift + S` / `W` / `U` / `L`** — Open Retail / Wholesale / Purchase / Customer Ledger in New Tab\n• **`Ctrl + A`** — Quick Financial Accounts Popup\n• **`Ctrl + D`** — Open Cash Drawer Shift Modal (or Held Drafts on Invoice screens)\n• **`F2` / `F8` / `Ctrl + S` / `Ctrl + P`** — Search / Hold / Save / Print on POS & Invoices",
    ur: "تیز رفتار کام کے لیے یہ کی بورڈ شارٹ کٹس استعمال کریں:\n\n• **`Ctrl + G`** — کارو اے آئی گائیڈ کھولیں/بند کریں\n• **`Ctrl + K`** — کسی بھی صفحے پر فوری جائیں\n• **`Ctrl + Shift + A` / `Ctrl + Shift + O`** — کھلے ٹیبز سرچ کریں یا کوئی بھی صفحہ نئے ٹیب میں کھولیں\n• **`Ctrl + Tab` / `Ctrl + Shift + Tab`** — اگلے یا پچھلے براؤزر ٹیب پر جائیں\n• **`Ctrl + Shift + 1..9`** — براہِ راست ٹیب 1 تا 8 یا آخری ٹیب پر جائیں\n• **`Ctrl + F4` / `Ctrl + Shift + Q`** — موجودہ براؤزر ٹیب بند کریں\n• **`Ctrl + Shift + T` / `Ctrl + Shift + N` / `Ctrl + Shift + D`** — بند کیا گیا ٹیب دوبارہ کھولیں / نیا ڈیش بورڈ ٹیب / ڈپلیکیٹ ٹیب\n• **`Ctrl + P`** — کوئی بھی پروڈکٹ، قیمت یا بیچ سرچ کریں\n• **`Ctrl + 1`** — نیا پرچیز بل بنائیں (اسٹاک ڈالیں)\n• **`Ctrl + 2`** — نیا ریٹیل سیل بل بنائیں\n• **`Ctrl + 3` / `Ctrl + W`** — نیا ہول سیل بل بنائیں\n• **`Ctrl + Shift + P`** — بارکوڈ POS نئے ٹیب میں کھولیں\n• **`Ctrl + Shift + S` / `W` / `U` / `L`** — ریٹیل / ہول سیل / پرچیز / کسٹمر کھاتہ نئے ٹیب میں کھولیں\n• **`Ctrl + A`** — بینک اور کیش اکاؤنٹس دیکھیں\n• **`Ctrl + D`** — کیش ڈراور کھولیں (یا انوائس پیج پر ہولڈ ڈرافٹس دیکھیں)",
    links: [
      { path: "/sale-invoices/pos", en: "Open Barcode POS", ur: "بارکوڈ POS کھولیں" },
      { path: "/dashboard", en: "Dashboard", ur: "ڈیش بورڈ" },
    ],
  },

  {
    id: "customer_credit_limit_hold",
    phrases: [
      "credit limit", "set credit limit", "customer credit limit", "block udhar",
      "stop over credit", "udhar limit", "گاہک کی ادھار لمٹ", "کریڈٹ لمٹ کیسے لگائیں"
    ],
    requiredGroups: [["credit", "udhar", "ادھار", "کریڈٹ"], ["limit", "block", "hold", "max", "لمٹ", "حد"]],
    keywords: ["credit limit"],
    title: {
      en: "How to Set Customer Credit Limits (Udhar Limit)",
      ur: "گاہک کے ادھار کی حد (Credit Limit) مقرر کرنے کا طریقہ",
    },
    en: "To prevent customers from exceeding their allowed credit (`Udhar`) balance:\n\n1. Open **Customers (`/customers`)** from the sidebar.\n2. When adding or editing a customer, enter their maximum allowed balance in the **Credit Limit** field and click **Save**.\n3. In **System Settings (`/settings#sale`)**, you can configure whether exceeding the Credit Limit shows a **Warning** or **Strictly Blocks** the credit invoice unless overridden by a manager.",
    ur: "گاہک کے لیے ادھار کی حد (Credit Limit) مقرر کرنے کا طریقہ:\n\n1. سائیڈ بار سے **Customers (`/customers`)** کھولیں۔\n2. گاہک کا ریکارڈ بناتے یا ایڈٹ کرتے وقت **Credit Limit** کے خانے میں زیادہ سے زیادہ ادھار کی رقم لکھ کر **Save** کریں۔\n3. جب اس گاہک کا ادھار مقررہ حد سے بڑھے گا تو بل بناتے وقت سسٹم فوری الرٹ دے گا۔",
    links: [
      { path: "/customers", en: "Open Customers & Credit Limits", ur: "گاہک اور کریڈٹ لمٹ کھولیں" },
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
    ],
  },

  {
    id: "overdue_aging_recovery_report",
    phrases: [
      "overdue invoice", "overdue bills", "aging report", "outstanding aging",
      "old udhar", "recovery list", "purana udhar", "ایجنگ رپورٹ", "پرانا ادھار"
    ],
    requiredGroups: [["overdue", "aging", "old", "recovery", "purana", "ایجنگ", "پرانا", "ریکوری"]],
    keywords: ["aging", "overdue"],
    title: {
      en: "How to Check Overdue Bills & 30/60/90-Day Aging Reports",
      ur: "پرانے بقایاجات (Aging Report) اور واجب الادا بلوں کی ریکوری لسٹ",
    },
    en: "To follow up on old unpaid balances:\n\n1. **Outstanding Aging Report (`/reports/outstanding-aging`):** Groups customer receivables and supplier payables into **0–30**, **31–60**, **61–90**, and **90+ Days Overdue** buckets.\n2. **Overdue Collections Work Queue (`/reports/overdue-work-queue`):** Lists every credit invoice that has passed its promised **Due Date** so recovery staff can call customers directly.",
    ur: "پرانے ادھار کی ریکوری کے لیے یہ **2 رپورٹس** دیکھیں:\n\n1. **بقایاجات ایجنگ رپورٹ (`/reports/outstanding-aging`):** گاہکوں کے ادھار کو `30`، `60` اور `90+` دنوں کے حساب سے الگ الگ دکھاتی ہے۔\n2. **واجب الادا وصولیوں کی فہرست (`/reports/overdue-work-queue`):** ان بلوں کی فہرست جن کی ادائیگی کی تاریخ (Due Date) گزر چکی ہے۔",
    links: [
      { path: "/reports/outstanding-aging", en: "Outstanding Aging Report", ur: "ایجنگ رپورٹ کھولیں" },
      { path: "/reports/overdue-work-queue", en: "Overdue Work Queue", ur: "واجب الادا وصولیاں" },
    ],
  },

  {
    id: "rack_shelf_storage_locations",
    phrases: [
      "rack number", "shelf location", "storage location", "godown to shop",
      "cold storage", "move batch location", "ریک نمبر", "گودام سے دکان"
    ],
    requiredGroups: [["rack", "shelf", "location", "godown", "warehouse", "cold", "ریک", "شیلف", "گودام", "لوکیشن"]],
    keywords: ["rack", "godown"],
    title: {
      en: "How to Manage Rack Numbers, Godown & Cold Storage Locations",
      ur: "ریک نمبر (Rack #) اور گودام / فریج لوکیشن منیج کرنے کا طریقہ",
    },
    en: "1. **Product Rack / Shelf #:** Set the **Rack** field when adding/editing a product (`/products/create`) so cashiers see the exact shelf number during POS billing.\n2. **Multi-Location Batch Storage (`/product-batches`):** Open **Product Batches Workbench (`/product-batches`)** to assign or transfer batches between **Main Shop Floor**, **Cold Storage / Fridge**, and **Warehouse / Godown**.",
    ur: "1. **شیلف / ریک نمبر:** پروڈکٹ بناتے وقت **Rack** کے خانے میں ریک نمبر لکھیں تاکہ بل بناتے وقت دوائی کی جگہ فوری نظر آئے۔\n2. **گودام، دکان اور فریج لوکیشن (`/product-batches`):** **Product Batches** اسکرین سے کسی بھی بیچ کو گودام سے دکان یا کولڈ سٹوریج (فریج) میں منتقل کریں۔",
    links: [
      { path: "/product-batches", en: "Open Product Batches & Locations", ur: "پروڈکٹ بیچز اور لوکیشنز" },
      { path: "/products", en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
    ],
  },

  {
    id: "batch_different_mrp_pricing",
    phrases: [
      "new batch price", "different price for batch", "manage batches",
      "edit batch", "unassigned stock", "نیا بیچ اور نئی قیمت", "بیچ کیسے ایڈٹ کریں"
    ],
    requiredGroups: [["batch", "بیچ"], ["price", "mrp", "cost", "edit", "manage", "unassigned", "قیمت", "ایڈٹ"]],
    keywords: ["unassigned"],
    title: {
      en: "How to Manage Product Batches & Batch-Specific Pricing (MRP)",
      ur: "پروڈکٹ کے مختلف بیچز اور ہر بیچ کی الگ قیمت (MRP) منیج کرنے کا طریقہ",
    },
    en: "In Karobar ERP, each batch of a product can carry its own **Expiry Date**, **Purchase Cost**, and **Retail Price (MRP)**:\n\n1. Open **Product Batches Workbench (`/product-batches`)**.\n2. Search and select the **Product** at the top.\n3. You can add a new batch, edit an existing batch's **Qty / Cost / MRP / Expiry**, or assign **Unassigned Stock** to a named batch.",
    ur: "کاروبار ایپ میں ایک ہی پروڈکٹ کے مختلف بیچز کی الگ ایکسپائری اور الگ قیمت (MRP) رکھی جا سکتی ہے:\n\n1. **Product Batches Workbench (`/product-batches`)** کھولیں۔\n2. پروڈکٹ منتخب کریں—یہاں آپ نیا بیچ ڈال سکتے ہیں یا کسی بھی موجودہ بیچ کی قیمت، مقدار اور ایکسپائری تبدیل کر سکتے ہیں۔",
    links: [
      { path: "/product-batches", en: "Open Product Batches Workbench", ur: "پروڈکٹ بیچز ورک بینچ کھولیں" },
    ],
  },

  {
    id: "theme_dark_mode_colors",
    phrases: [
      "dark mode", "light mode", "change theme", "change color", "button style",
      "ڈارک موڈ", "تھیم کا رنگ کیسے بدلیں"
    ],
    requiredGroups: [["dark", "light", "theme", "color", "ڈارک", "تھیم", "رنگ"]],
    keywords: ["theme", "dark mode"],
    title: {
      en: "How to Switch Dark / Light Mode & Customize Brand Theme Colors",
      ur: "ڈارک موڈ (Dark Mode) اور سافٹ ویئر کے رنگ تبدیل کرنے کا طریقہ",
    },
    en: "1. **Quick Dark / Light Toggle:** Click the **Sun / Moon** icon in the top navigation bar.\n2. **Custom Brand Colors & Button Styles:** Open **System Settings (`/settings`)** and switch to the **Theme Setting** tab to customize Primary, Secondary, and Tertiary colors across the entire app.",
    ur: "1. **ڈارک یا لائٹ موڈ:** اوپر ٹاپ بار میں موجود **سورج / چاند** کے بٹن پر کلک کریں۔\n2. **سافٹ ویئر کے رنگ بدلنے کے لیے:** **System Settings (`/settings`)** میں **Theme Setting** ٹیب کھول کر اپنی پسند کے رنگ منتخب کریں۔",
    links: [
      { path: "/settings", en: "Open Theme Settings", ur: "تھیم سیٹنگز کھولیں" },
    ],
  },

  {
    id: "whatsapp_share_invoice_ledger",
    phrases: [
      "send on whatsapp", "whatsapp invoice", "share bill whatsapp",
      "whatsapp reminder", "واٹس ایپ پر بل کیسے بھیجیں"
    ],
    requiredGroups: [["whatsapp", "واٹس ایپ"]],
    keywords: ["whatsapp"],
    title: {
      en: "How to Share Invoices, Purchase Orders & Ledger Reminders on WhatsApp",
      ur: "بل، پرچیز آرڈر اور ادھار کھاتے کا پیغام واٹس ایپ (WhatsApp) پر بھیجنے کا طریقہ",
    },
    en: "You can share documents via **WhatsApp** from multiple screens:\n\n1. **Sale & Purchase Invoices (`/sale-invoices`, `/purchase-invoices`):** Open or view any invoice and click the **WhatsApp** share button.\n2. **Purchase Orders (`/purchase-orders`):** Send your PO directly to the supplier's WhatsApp number.\n3. **Customer Ledger (`/customer-ledger`):** Send an instant balance reminder message to a customer on WhatsApp.",
    ur: "آپ سافٹ ویئر سے براہِ راست **WhatsApp** پر تفصیلات بھیج سکتے ہیں:\n\n1. **سیل اور پرچیز بل:** کسی بھی بل کو کھول کر **WhatsApp** بٹن دبائیں۔\n2. **پرچیز آرڈر (`/purchase-orders`):** سپلائر کو مال کا آرڈر واٹس ایپ کریں۔\n3. **کسٹمر کھاتہ (`/customer-ledger`):** گاہک کو بقایا بل کی یاد دہانی واٹس ایپ پر بھیجیں۔",
    links: [
      { path: "/sale-invoices", en: "Sale Invoices", ur: "سیل انوائسز" },
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
      { path: "/purchase-orders", en: "Purchase Orders", ur: "پرچیز آرڈرز" },
    ],
  },

  {
    id: "software_license_activation",
    phrases: [
      "activate license", "software license", "machine id", "renew license",
      "license key", "لائسنس ایکٹیویٹ کیسے کریں", "مشین آئی ڈی"
    ],
    requiredGroups: [["license", "activate", "machine id", "لائسنس", "ایکٹیویٹ"]],
    keywords: ["license"],
    title: {
      en: "How to Activate or Renew Your Software License",
      ur: "سافٹ ویئر لائسنس ایکٹیویٹ یا رینیو کرنے کا طریقہ",
    },
    en: "To view your Machine ID or enter a new License Key:\n\n1. Open **License Activation (`/activate`)** or **System Settings → License Tab (`/settings#license`)**.\n2. Copy your **Machine ID** and send it to your vendor.\n3. Paste the provided cryptographic **License Key** and click **Activate**.",
    ur: "سافٹ ویئر لائسنس ایکٹیویٹ کرنے کا طریقہ:\n\n1. **License Activation (`/activate`)** یا **Settings → License (`/settings#license`)** کھولیں۔\n2. اپنی **Machine ID** کاپی کریں اور فراہم کردہ **License Key** پیسٹ کر کے **Activate** پر کلک کریں۔",
    links: [
      { path: "/activate", en: "Open License Activation", ur: "لائسنس ایکٹیویشن کھولیں" },
      { path: "/settings#license", en: "Settings — License Tab", ur: "لائسنس سیٹنگز" },
    ],
  },

  {
    id: "thank_you_acknowledgement",
    phrases: [
      "thank you", "thanks", "thx", "shukriya", "jazakallah", "good job",
      "شکریہ", "جزاک اللہ", "بہت شکریہ"
    ],
    keywords: ["thanks", "shukriya"],
    onlyWhenShort: true,
    title: {
      en: "You're Most Welcome! — Karo AI Guide",
      ur: "بہت شکریہ! میں ہمیشہ آپ کی خدمت میں حاضر ہوں",
    },
    en: "You're very welcome! Anytime you have a question about **Karobar App ERP**, just press **`Ctrl + G`** or type your question below.",
    ur: "آپ کا بہت شکریہ! جب بھی آپ کو **کاروبار ایپ ERP** کے کسی فیچر کے بارے میں کچھ پوچھنا ہو تو **`Ctrl + G`** دبائیں یا نیچے اپنا سوال لکھیں۔",
    links: [
      { path: "/dashboard", en: "Dashboard", ur: "ڈیش بورڈ" },
    ],
  },

  // ==========================================================================
  // 8. TROUBLESHOOTING, LIMITATIONS, DESTRUCTIVE GUARDRAILS & COMPARISONS
  // ==========================================================================
  {
    id: "troubleshoot_wrong_total_calculation",
    phrases: [
      "why is my total wrong", "my totals look wrong", "total is wrong",
      "wrong calculation", "tax is wrong", "bill total mismatch",
      "بل کا ٹوٹل غلط", "حساب غلط آ رہا ہے"
    ],
    requiredGroups: [["wrong", "mismatch", "incorrect", "error", "غلط", "فرق"], ["total", "calculation", "tax", "bill", "balance", "ٹوٹل", "حساب", "بل"]],
    keywords: [],
    preferredAgent: "nova",
    handoffWorkflowId: "create_retail_invoice",
    title: {
      en: "Diagnosing Invoice Total or Calculation Differences",
      ur: "بل کے ٹوٹل یا حساب میں فرق کی تشخیص (Troubleshooting)",
    },
    en: "Let's narrow down which part of the total looks unexpected:\n\n1. **Pack vs. Loose Unit Quantity:** Check whether the quantity was entered in **Packs (Boxes)** or **Loose Units**. If Pack Size is `30`, entering `1` in Packs bills the full box, whereas `1` in Units bills a single tablet.\n2. **Line Discount vs. Bill Discount:** Check both the row-level `Disc % / Rs` column and the bottom summary `Bill Discount` field.\n3. **Tax / WHT Profile:** Check if an item-level GST % or invoice-level Withholding Tax % is applied.\n4. **Previous Customer Balance:** On credit bills, the printed receipt shows **Current Bill Total** + **Previous Udhar Balance = Net Payable**.\n\n*If you want, **Cube** can walk you through the invoice calculation fields step-by-step.*",
    ur: "آئیے چیک کرتے ہیں کہ بل کے ٹوٹل میں فرق کس وجہ سے آ رہا ہے:\n\n1. **پیک بمقابلہ کھلے یونٹس (Pack vs. Unit):** چیک کریں کہ مقدار **Pack** میں لکھی گئی ہے یا **Unit** میں۔\n2. **ڈسکاؤنٹ:** آئٹم کی لائن والا ڈسکاؤنٹ اور بل کے نیچے والا مجموعی ڈسکاؤنٹ دونوں چیک کریں۔\n3. **ٹیکس (GST / WHT):** دیکھیں کہ آئٹم یا بل پر ٹیکس فیصد تو شامل نہیں۔\n4. **پچھلا بقایا بیلنس (Previous Balance):** ادھار بلوں پر موجودہ بل کے ساتھ گاہک کا پچھلا بقایا ملا کر کل رقم دکھائی جاتی ہے۔\n\n*اگر آپ چاہیں تو **Cube** آپ کو بل کے تمام خانوں کا مرحلہ وار ڈیمو دکھا سکتا ہے۔*",
    links: [
      { path: "/sale-invoices/create/retail", en: "Inspect Retail Invoice Form", ur: "ریٹیل بل فارم چیک کریں" },
      { path: "/settings#sale", en: "Check Sale & Tax Rules", ur: "سیل اور ٹیکس سیٹنگز" },
    ],
  },

  {
    id: "assistant_limitations_transparency",
    phrases: [
      "what are your limitations", "your limitations", "what can you not do",
      "are you human", "are you a real person", "can you delete my data",
      "آپ کی حدود کیا ہیں", "کیا آپ انسان ہیں"
    ],
    requiredGroups: [["limitation", "cannot", "human", "boundary", "حدود", "انسان"]],
    keywords: ["limitations"],
    preferredAgent: "cube",
    title: {
      en: "Cube — Capabilities & Safety Boundaries",
      ur: "کیوب (Cube) کی صلاحیتیں اور حفاظتی حدود",
    },
    en: "**Cube** is your AI software assistant and interactive demonstrator built for **Karobar App ERP v2** (not a human operator):\n\n• **What Cube does:** Answers your questions concisely, diagnoses issues, explains how screens work, and runs grounded, step-by-step interactive walkthroughs.\n• **Safety Boundaries:**\n  1. **No Silent Destructive Actions:** Cube will never silently delete customers, void invoices, or post ledger entries without your explicit action on the screen.\n  2. **Observed vs. Documented Truth:** Cube clearly badges whether an instruction is **Observed on your current screen** or **Documented for Karobar v2026.10**.",
    ur: "**کیوب (Cube)** کاروبار ایپ کا مخصوص اے آئی اسسٹنٹ اور انٹرایکٹو گائیڈ ہے:\n\n• **Cube کا کام:** آپ کے سوالات کو سمجھنا، مسائل کی تشخیص کرنا، سافٹ ویئر کے فیچرز کی وضاحت کرنا اور مرحلہ وار عملی ڈیمو (Walkthrough) دکھانا۔\n• **حفاظتی اصول:** اسسٹنٹ کبھی بھی آپ کی اجازت کے بغیر کوئی بل، گاہک یا کھاتہ خودکار طور پر ڈیلیٹ یا تبدیل نہیں کرتا، اور ہمیشہ واضح بتاتا ہے کہ معلومات آپ کی موجودہ اسکرین سے دیکھی گئی ہیں یا دستاویزات سے۔",
    links: [
      { path: "/dashboard", en: "Dashboard", ur: "ڈیش بورڈ" },
    ],
  },

  {
    id: "destructive_action_guardrail",
    phrases: [
      "delete this customer", "delete customer", "delete all products",
      "wipe database", "do this for me", "delete supplier",
      "گاہک ڈیلیٹ کر دیں", "ڈیٹا ختم کریں"
    ],
    requiredGroups: [["delete", "wipe", "remove", "destroy", "ڈیلیٹ", "ختم"], ["customer", "supplier", "database", "all", "گاہک", "سپلائر", "ڈیٹا"]],
    keywords: [],
    preferredAgent: "nova",
    riskLevel: "high_destructive",
    title: {
      en: "Safety Guardrail: Destructive Action vs. Non-Destructive Guide",
      ur: "حفاظتی وارننگ: ریکارڈ ڈیلیٹ کرنے کے اثرات اور محفوظ طریقہ",
    },
    en: "Deleting a master record (such as a **Customer**, **Supplier**, or **Product**) affects historical invoices and ledger statements, so **I do not execute deletions automatically**.\n\n**What will be affected if you delete a record:**\n• If a Customer or Supplier already has posted invoices or ledger transactions, the system protects accounting integrity by preventing orphan ledger entries.\n• **How to perform it safely yourself:** Open **Customers (`/customers`)** or **Suppliers (`/suppliers`)**, locate the unused record, and click the **Delete** icon—the app will ask for your confirmation first.",
    ur: "کسی گاہک، سپلائر یا پروڈکٹ کو ڈیلیٹ کرنے سے کھاتوں اور پرانے بلوں پر اثر پڑتا ہے، اس لیے **اسسٹنٹ خودکار طور پر کوئی ریکارڈ ڈیلیٹ نہیں کرتا**۔\n\n**محفوظ طریقہ کار:**\n• اگر کسی گاہک یا سپلائر کے کھاتے میں لین دین موجود ہو تو سسٹم اکاؤنٹنگ کو محفوظ رکھنے کے لیے اسے غلطی سے ڈیلیٹ ہونے سے روکتا ہے۔\n• غیر استعمال شدہ ریکارڈ ہٹانے کے لیے متعلقہ صفحہ (`/customers` یا `/suppliers`) کھول کر خود تصدیق (Confirm) کے بعد ڈیلیٹ کریں۔",
    links: [
      { path: "/customers", en: "Open Customers", ur: "گاہکوں کی فہرست" },
      { path: "/suppliers", en: "Open Suppliers", ur: "سپلائرز کی فہرست" },
    ],
  },

  {
    id: "compare_adjustment_stocktake_disposal",
    phrases: [
      "difference between stock adjustment and stocktake",
      "difference between stock adjustment",
      "stock adjustment vs stocktake",
      "transfer vs adjustment", "adjustment vs disposal",
      "which stock feature should i use", "compare stock adjustment",
      "اسٹاک ایڈجسٹمنٹ اور اسٹاک ٹیک میں فرق",
      "اسٹاک ایڈجسٹمنٹ، اسٹاک ٹیک اور ڈسپوزل میں کیا فرق ہے"
    ],
    requiredGroups: [["adjustment", "stocktake", "disposal", "transfer", "ایڈجسٹمنٹ", "آڈٹ", "تلف"], ["difference", "vs", "compare", "why", "فرق", "موازنہ"]],
    keywords: ["difference", "vs", "compare", "stocktake", "disposal", "فرق"],
    preferredAgent: "cube",
    title: {
      en: "Comparison: Stock Adjustment vs. Stocktake vs. Disposal vs. Transfer",
      ur: "موازنہ: اسٹاک ایڈجسٹمنٹ، اسٹاک ٹیک آڈٹ، ڈسپوزل اور لوکیشن ٹرانسفر میں فرق",
    },
    en: "Each inventory tool preserves a distinct audit trail in Karobar ERP:\n\n1. **Location Transfer (`/product-batches`):** Moves stock between *Godown*, *Shop Floor*, and *Cold Storage* without changing total company stock.\n2. **Stock Adjustment (`/stock-adjustments/create`):** Quick manual `+ / −` correction for **Opening Stock** or single-item count fixes.\n3. **Stocktake Session (`/stocktake-sessions`):** Structured shelf-by-shelf physical counting sheet that calculates variances across an entire Category or Brand.\n4. **Stock Disposal (`/stock-disposals/create`):** Quarantines or writes off **expired / broken** stock and generates an official Disposal Certificate.",
    ur: "کاروبار ایپ میں اسٹاک کے ان 4 ٹولز کا فرق درج ذیل ہے:\n\n1. **لوکیشن ٹرانسفر (`/product-batches`):** گودام سے دکان یا فریج میں مال منتقل کرنے کے لیے (اس سے کل اسٹاک تبدیل نہیں ہوتا)۔\n2. **اسٹاک ایڈجسٹمنٹ (`/stock-adjustments/create`):** اوپننگ اسٹاک ڈالنے یا کسی ایک آئٹم کی فوری کمی بیشی درست کرنے کے لیے۔\n3. **اسٹاک ٹیک سیشن (`/stocktake-sessions`):** پوری دکان یا کیٹیگری کی شیلف گنتی (Audit) کر کے فرق نکالنے کے لیے۔\n4. **اسٹاک ڈسپوزل (`/stock-disposals/create`):** ایکسپائر یا ٹوٹ پھوٹ کا شکار مال کوارنٹائن یا تلف کرنے کے لیے۔",
    links: [
      { path: "/stock-adjustments/create", en: "Stock Adjustment", ur: "اسٹاک ایڈجسٹمنٹ" },
      { path: "/stocktake-sessions", en: "Stocktake Audit", ur: "اسٹاک ٹیک آڈٹ" },
      { path: "/stock-disposals", en: "Stock Disposals", ur: "اسٹاک ڈسپوزل" },
    ],
  },
];

// ============================================================================
// VERSIONED DEMO MANIFESTS (Product Version: 2026.10) FOR CUBE WALKTHROUGHS
// Grounded step-by-step workflows with screen paths, DOM targets & checkpoints
// ============================================================================
export const PRODUCT_VERSION = "2026.10";

export const DEMO_MANIFESTS = {
  create_purchase_order: {
    id: "create_purchase_order",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Create a Purchase Order (PO)",
      ur: "عملی ڈیمو: سپلائر کے لیے پرچیز آرڈر (PO) بنانا",
    },
    primaryScreen: "/purchase-orders/create",
    steps: [
      {
        step: 1,
        screen: "/purchase-orders/create",
        screenLabel: { en: "Purchase Orders", ur: "پرچیز آرڈرز" },
        exactSelector: ".purchase-entry-details",
        target: ".purchase-entry-details, select, input[type='text']",
        title: { en: "Select Supplier, PO Date & Expected Receiving Date", ur: "سپلائر، آرڈر کی تاریخ اور متوقع وصولی کی تاریخ منتخب کریں" },
        instruction: {
          en: "Open Purchase Orders (`/purchase-orders/create`), set the Date and Expected Receiving Date *, and select your Supplier *.",
          ur: "Purchase Orders (`/purchase-orders/create`) کھولیں، متوقع تاریخ اور اپنا سپلائر منتخب کریں۔",
        },
        observedInstruction: {
          en: "Start by choosing the Order Date, Expected Receiving Date *, and Supplier * in the details card at the top.",
          ur: "آپ اس وقت پرچیز آرڈر فارم پر موجود ہیں۔ سب سے اوپر متوقع تاریخ اور سپلائر منتخب کریں۔",
        },
        checkpoint: {
          en: "Remember: A Purchase Order is a demand sheet—it won't alter your live stock until goods arrive.",
          ur: "یاد رکھیں: پرچیز آرڈر سے ابھی اسٹاک میں کوئی تبدیلی نہیں ہو گی۔",
        },
      },
      {
        step: 2,
        screen: "/purchase-orders/create",
        screenLabel: { en: "Purchase Orders", ur: "پرچیز آرڈرز" },
        exactSelector: ".purchase-order-form-items",
        target: ".purchase-order-form-items, table",
        title: { en: "Add Products, Order Packs, Pack Price & Bonus", ur: "پروڈکٹس، آرڈر پیکس، قیمتِ خرید اور بونس درج کریں" },
        instruction: {
          en: "Search and add items in the table, enter Order Packs, Pack Purchase Price, Bonus, and Discount %, or use Smart Forecast (`Ctrl+N`).",
          ur: "ٹیبل میں مطلوبہ آئٹمز شامل کریں اور Order Packs، قیمتِ خرید اور ڈسکاؤنٹ لکھیں۔",
        },
        observedInstruction: {
          en: "Search for products in the order items table and enter Order Packs, Pack Purchase Price, and optional Bonus/Discount %.",
          ur: "آرڈر ٹیبل میں پروڈکٹس سرچ کریں اور مطلوبہ ڈبوں کی تعداد (Order Packs) درج کریں۔",
        },
        checkpoint: {
          en: "Verify the order quantities and estimated purchase rates.",
          ur: "ہر آئٹم کی مطلوبہ مقدار چیک کر لیں۔",
        },
      },
      {
        step: 3,
        screen: "/purchase-orders/create",
        screenLabel: { en: "Purchase Orders", ur: "پرچیز آرڈرز" },
        exactSelector: ".purchase-entry-footer",
        target: ".purchase-entry-footer, button[type='submit']",
        title: { en: "Apply Saved Brand Order & Save Purchase Order (Ctrl+S)", ur: "محفوظ شدہ برانڈ ترتیب لگائیں اور آرڈر سیو کریں (Ctrl+S)" },
        instruction: {
          en: "Click 'Save Purchase Order' (`Ctrl+S`). You can share the PDF on WhatsApp and click 'Receive Delivery' when goods arrive to convert it into a Purchase Invoice.",
          ur: "Save Purchase Order (`Ctrl+S`) دبا کر آرڈر محفوظ کریں۔ مال آنے پر 'Receive Delivery' سے اسے پرچیز انوائس میں تبدیل کر لیں۔",
        },
        observedInstruction: {
          en: "Review the total Packs and Order Total in the footer and click 'Save Purchase Order' (`Ctrl+S`).",
          ur: "فوٹر میں کل پیکس اور رقم چیک کر کے 'Save Purchase Order' (`Ctrl+S`) پر کلک کریں۔",
        },
        checkpoint: {
          en: "Walkthrough complete! Your PO is ready without prematurely inflating stock.",
          ur: "ڈیمو مکمل! آپ کا پرچیز آرڈر تیار ہے۔",
        },
      },
    ],
  },

  create_purchase_invoice: {
    id: "create_purchase_invoice",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Add New Stock (Purchase Invoice / GRN)",
      ur: "عملی ڈیمو: نیا اسٹاک اور پرچیز بل (GRN) درج کرنا",
    },
    primaryScreen: "/purchase-invoices/create",
    steps: [
      {
        step: 1,
        screen: "/purchase-invoices/create",
        screenLabel: { en: "Create Purchase Invoice", ur: "نیا پرچیز بل" },
        exactSelector: ".purchase-entry-details",
        target: ".purchase-entry-details",
        title: { en: "Select Supplier, Paper Invoice # & Bill Amt (±5 Rs Diff Guard)", ur: "سپلائر، بل نمبر اور Bill Amt (±5 روپے Diff گارڈ) درج کریں" },
        instruction: {
          en: "Open Create Purchase Invoice (`/purchase-invoices/create` or `Ctrl+1`), select the Supplier *, and enter their paper Invoice # and printed Bill Amt so the Diff box verifies accuracy within ±5 Rs.",
          ur: "Create Purchase Invoice (`/purchase-invoices/create`) کھولیں، سپلائر، بل نمبر اور بل کی کل رقم (Bill Amt) لکھیں۔",
        },
        observedInstruction: {
          en: "Select the Supplier *, enter their paper Invoice # and printed Bill Amt in the header card, and watch the Diff field verify your bill within ±5 Rs.",
          ur: "ہیڈر کارڈ میں سپلائر، بل نمبر اور Bill Amt درج کریں تاکہ Diff خانہ بل کی درستگی چیک کر سکے۔",
        },
        checkpoint: {
          en: "Matching the supplier's printed Bill Amt within ±5 Rs prevents accidental data entry errors.",
          ur: "سپلائر کے بل کی کل رقم Bill Amt میں لکھنے سے غلطی کا امکان ختم ہو جاتا ہے۔",
        },
      },
      {
        step: 2,
        screen: "/purchase-invoices/create",
        screenLabel: { en: "Create Purchase Invoice", ur: "نیا پرچیز بل" },
        exactSelector: ".purchase-entry-items",
        target: ".purchase-entry-items",
        title: { en: "Enter Product, Batch, Expiry, Pack/Unit Qty, Bonus & Sale Prices", ur: "پروڈکٹ، بیچ، ایکسپائری، مقدار، بونس اور قیمتِ فروخت لکھیں" },
        instruction: {
          en: "Add each received product and fill in Batch, Exp Date, Pack.Q / Unit.Q, Purchase Price (Pack.P / Unit.P), Disc%, PBonus / UBonus, Retail Sale Price (Pack.S / Unit.S), and Wholesale Price.",
          ur: "پروڈکٹ منتخب کریں اور بیچ نمبر، ایکسپائری تاریخ، مقدار، بونس یونٹس اور قیمتِ خرید و فروخت درج کریں۔",
        },
        observedInstruction: {
          en: "In the 21-column GRN table, search each product and enter its Batch, Expiry, Pack/Unit Qty, Purchase Cost, Bonus units, and Retail/Wholesale prices (ensuring Margin % > 0).",
          ur: "ٹیبل میں پروڈکٹ سرچ کریں اور بیچ، ایکسپائری، مقدار، بونس اور قیمتِ خرید و فروخت درج کریں۔",
        },
        checkpoint: {
          en: "Bonus units increase your physical batch stock and automatically lower your effective Avg unit cost!",
          ur: "بونس یونٹس مفت اسٹاک کے طور پر جمع ہوتے ہیں اور اوسط لاگت (Avg Cost) کم کرتے ہیں۔",
        },
      },
      {
        step: 3,
        screen: "/purchase-invoices/create",
        screenLabel: { en: "Create Purchase Invoice", ur: "نیا پرچیز بل" },
        exactSelector: ".purchase-entry-footer",
        target: ".purchase-entry-footer",
        title: { en: "Select Payment Account, Enter Total Paid & Save (Ctrl+S)", ur: "پیمنٹ اکاؤنٹ اور ادا شدہ رقم لکھیں اور Save (Ctrl+S) دبائیں" },
        instruction: {
          en: "Choose the Payment Account, enter Total Paid (or 0 for Credit payable), and press Save Purchase Invoice (`Ctrl+S`).",
          ur: "پیمنٹ اکاؤنٹ اور ادا شدہ رقم (Total Paid) لکھیں یا ادھار رکھ کر Save Purchase Invoice (`Ctrl+S`) دبائیں۔",
        },
        observedInstruction: {
          en: "Review the sticky 2-row footer, verify Discount/Tax and Total Paid, and click 'Save Purchase Invoice' (`Ctrl+S`).",
          ur: "نچلے فوٹر میں کل رقم چیک کریں اور 'Save Purchase Invoice' (`Ctrl+S`) دبا کر اسٹاک جمع کر لیں۔",
        },
        checkpoint: {
          en: "Walkthrough complete! Batch stock and Supplier Ledger update immediately on Save.",
          ur: "ڈیمو مکمل! محفوظ کرتے ہی اسٹاک اور سپلائر کھاتہ اپڈیٹ ہو جائے گا۔",
        },
      },
    ],
  },

  pos_counter_billing: {
    id: "pos_counter_billing",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: High-Speed Barcode POS Billing",
      ur: "عملی ڈیمو: بارکوڈ POS ٹرمینل پر تیز بلنگ",
    },
    primaryScreen: "/sale-invoices/pos",
    steps: [
      {
        step: 1,
        screen: "/sale-invoices/pos",
        screenLabel: { en: "Barcode POS Terminal", ur: "بارکوڈ POS ٹرمینل" },
        exactSelector: ".scanner-target",
        target: ".scanner-target, input[type='text']",
        title: { en: "Scan Barcode Hands-Free or Search Medicine (F3 / F2)", ur: "بارکوڈ اسکین کریں یا نام سے سرچ کریں (F3 / F2)" },
        instruction: {
          en: "Open Barcode POS (`/sale-invoices/pos`). Scan an item's barcode hands-free, press `F3` to search by name/salt, or press `F2` to type a barcode manually.",
          ur: "بارکوڈ POS (`/sale-invoices/pos`) کھولیں اور بارکوڈ اسکین کریں یا `F3` دبا کر نام سے سرچ کریں۔",
        },
        observedInstruction: {
          en: "Scan a barcode with your hardware gun or use `F3` (Product Search) / `F2` (Manual Barcode)—the earliest expiring batch (FEFO) is picked automatically.",
          ur: "آئٹم اسکین کریں یا `F3` سرچ بار میں نام لکھیں۔",
        },
        checkpoint: {
          en: "FEFO automatically selects the batch expiring soonest to prevent expiry loss.",
          ur: "سسٹم خودکار طور پر قریب ایکسپائری والا بیچ پہلے منتخب کرتا ہے۔",
        },
      },
      {
        step: 2,
        screen: "/sale-invoices/pos",
        screenLabel: { en: "Barcode POS Terminal", ur: "بارکوڈ POS ٹرمینل" },
        exactSelector: ".barcode-pos-items",
        target: ".barcode-pos-items, table",
        title: { en: "Adjust Cart Quantity (-/+), Substitutes & Park Cart (F8)", ur: "کارٹ میں مقدار (-/+)، متبادل دوائی اور ہولڈ بل (F8)" },
        instruction: {
          en: "Adjust Unit Quantity (-/+), switch the FEFO Batch, click 'Substitutes' for generic salt alternatives, or press `F8` to Park (Hold) the cart.",
          ur: "کارٹ میں مقدار یا ڈسکاؤنٹ ایڈجسٹ کریں، متبادل دوائی دیکھیں، یا بل روکنے کے لیے `F8` (Park) دبائیں۔",
        },
        observedInstruction: {
          en: "In your active POS cart table, adjust quantities, check generic Substitutes, or press `F8` to park this cart.",
          ur: "کارٹ ٹیبل میں مقدار یا ڈسکاؤنٹ ایڈجسٹ کریں۔",
        },
        checkpoint: {
          en: "Repeated barcode scans automatically increment the item's quantity in the cart.",
          ur: "بار بار اسکین کرنے سے آئٹم کی تعداد خودکار بڑھتی جاتی ہے۔",
        },
      },
      {
        step: 3,
        screen: "/sale-invoices/pos",
        screenLabel: { en: "Barcode POS Terminal", ur: "بارکوڈ POS ٹرمینل" },
        exactSelector: "#pos-tender-panel",
        target: "#pos-tender-panel",
        title: { en: "Select Payment Method, Enter Cash Given (Ctrl+C) & Complete Sale (F4 / Ctrl+S)", ur: "پیمنٹ کا طریقہ منتخب کریں اور بل مکمل کریں (F4 / Ctrl+S)" },
        instruction: {
          en: "Choose Cash, Card / POS, Wallet, or Split / Credit, enter Cash Given (or press `Ctrl+C` for Exact Cash), and press `F4` or `Ctrl+S` to Complete Sale & Print.",
          ur: "وصول شدہ رقم درج کریں (`Ctrl+C`) اور `F4` یا `Ctrl+S` دبا کر بل محفوظ اور پرنٹ کر لیں۔",
        },
        observedInstruction: {
          en: "Complete the right-side tender panel and press `F4` or `Ctrl+S` to post the sale and print the receipt.",
          ur: "دائیں جانب ٹینڈر پینل میں رقم لکھیں اور `F4` یا `Ctrl+S` دبا کر رسید پرنٹ کریں۔",
        },
        checkpoint: {
          en: "Walkthrough complete! Stock, Cash Drawer, COGS, and General Ledger are all updated.",
          ur: "ڈیمو مکمل! اسٹاک اور کیش ڈراور خودکار اپڈیٹ ہو چکے ہیں۔",
        },
      },
    ],
  },

  create_retail_invoice: {
    id: "create_retail_invoice",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Create a Retail / Credit Sale Invoice",
      ur: "عملی ڈیمو: ریٹیل یا ادھار سیل انوائس بنانا",
    },
    primaryScreen: "/sale-invoices/create/retail",
    steps: [
      {
        step: 1,
        screen: "/sale-invoices/create/retail",
        screenLabel: { en: "Create Retail Sale Invoice", ur: "ریٹیل سیل انوائس" },
        exactSelector: ".sale-entry-details",
        target: ".sale-entry-details",
        title: { en: "Choose Walk-In or Credit Customer & Clinical Details", ur: "نقد یا ادھار والا گاہک اور ڈاکٹر/مریض کا نام منتخب کریں" },
        instruction: {
          en: "Open Create Retail Invoice (`/sale-invoices/create/retail`), toggle Debit (Cash) or Credit (Udhar) with `Ctrl+T`, and select Walk-In Customer or a registered Customer.",
          ur: "Create Retail Invoice (`/sale-invoices/create/retail`) کھولیں، `Ctrl+T` سے نقد یا ادھار منتخب کریں اور گاہک سلیکٹ کریں۔",
        },
        observedInstruction: {
          en: "Choose your Customer * in the header details section (required for Credit/Udhar sales) and optionally enter Doctor/Patient names.",
          ur: "ہیڈر سیکشن میں اپنا گاہک (Customer *) منتخب کریں۔",
        },
        checkpoint: {
          en: "Named customers display a live Credit Limit, Ledger Balance, and Due Date strip.",
          ur: "رجسٹرڈ گاہک منتخب کرنے پر اس کی کریڈٹ لمٹ اور پچھلا بقایا نظر آتا ہے۔",
        },
      },
      {
        step: 2,
        screen: "/sale-invoices/create/retail",
        screenLabel: { en: "Create Retail Sale Invoice", ur: "ریٹیل سیل انوائس" },
        exactSelector: ".sale-entry-items",
        target: ".sale-entry-items",
        title: { en: "Add Products, FEFO Batch, Unit Qty * & Generic Substitutes (⇄)", ur: "پروڈکٹس، FEFO بیچ، یونٹ مقدار اور متبادل دوائی (⇄) شامل کریں" },
        instruction: {
          en: "Search products in the 12-column unit-based table, verify the auto-picked FEFO Batch, enter Qty * in units, or click the green Substitute (⇄) icon for same-salt alternatives.",
          ur: "ٹیبل میں پروڈکٹ سرچ کریں، بیچ چیک کریں، یونٹس کی تعداد (`Qty *`) اور ڈسکاؤنٹ لکھیں۔",
        },
        observedInstruction: {
          en: "Add products into the 12-column retail table, enter unit quantities in `Qty *`, and press Enter to advance rapidly across columns.",
          ur: "بل کی لائنوں میں پروڈکٹ اور یونٹس کی مقدار (`Qty *`) درج کریں۔",
        },
        checkpoint: {
          en: "Each line shows live Pack Size (PSize), Expiry, Available Units (Avail), and Unit MRP.",
          ur: "ہر لائن میں پیک سائز، ایکسپائری اور موجودہ یونٹس (Avail) نظر آتے ہیں۔",
        },
      },
      {
        step: 3,
        screen: "/sale-invoices/create/retail",
        screenLabel: { en: "Create Retail Sale Invoice", ur: "ریٹیل سیل انوائس" },
        exactSelector: ".sale-entry-summary",
        target: ".sale-entry-summary",
        title: { en: "Select Payment Account, Cash Given & Create Sale (Ctrl+S)", ur: "پیمنٹ اکاؤنٹ، وصول شدہ رقم اور بل محفوظ کریں (Ctrl+S)" },
        instruction: {
          en: "On the right summary sidebar, choose the Payment Method & Account, enter Cash Given (or adjust Received in Credit mode), and click 'Create Sale' (`Ctrl+S`).",
          ur: "دائیں جانب سمری پینل میں پیمنٹ اکاؤنٹ اور وصول شدہ رقم چیک کریں اور 'Create Sale' (`Ctrl+S`) دبائیں۔",
        },
        observedInstruction: {
          en: "Check the right-side Summary & Tender panel and click 'Create Sale' (`Ctrl+S`) to post and print the invoice.",
          ur: "دائیں جانب ٹوٹل اور وصولی چیک کر کے 'Create Sale' (`Ctrl+S`) پر کلک کریں۔",
        },
        checkpoint: {
          en: "Walkthrough complete!",
          ur: "ڈیمو مکمل!",
        },
      },
    ],
  },

  customer_udhar_recovery: {
    id: "customer_udhar_recovery",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Check Customer Udhar & Record Payment",
      ur: "عملی ڈیمو: گاہک کا ادھار کھاتہ اور وصولی درج کرنا",
    },
    primaryScreen: "/customer-ledger",
    steps: [
      {
        step: 1,
        screen: "/customer-ledger",
        screenLabel: { en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
        target: "select, input[type='text']",
        title: { en: "Select Customer to View Statement", ur: "کھاتہ دیکھنے کے لیے گاہک منتخب کریں" },
        instruction: {
          en: "Open Customer Ledger (`/customer-ledger`) and select the Customer from the dropdown.",
          ur: "Customer Ledger (`/customer-ledger`) کھولیں اور گاہک منتخب کریں۔",
        },
        observedInstruction: {
          en: "I can see you're on the Customer Ledger page. Select a customer at the top to load their bill-by-bill statement.",
          ur: "آپ اس وقت کسٹمر لیجر اسکرین پر ہیں۔ اوپر سے گاہک منتخب کریں۔",
        },
        checkpoint: {
          en: "You'll see Opening Balance, Credit Sales, Returns, Payments, and Net Receivable.",
          ur: "یہاں آپ کو گاہک کے تمام بل اور کل بقایا بیلنس نظر آئے گا۔",
        },
      },
      {
        step: 2,
        screen: "/customer-ledger",
        screenLabel: { en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
        target: "button",
        title: { en: "Click Record Payment & Choose Cash/Bank Account", ur: "Record Payment دبائیں اور رقم و اکاؤنٹ درج کریں" },
        instruction: {
          en: "Click '+ Record Payment', enter the received amount, choose Cash Drawer or Bank/Wallet, and click Save.",
          ur: "'+ Record Payment' بٹن پر کلک کریں، وصول شدہ رقم اور کیش/بینک اکاؤنٹ لکھ کر Save کریں۔",
        },
        observedInstruction: {
          en: "Click the Record Payment button on your screen to post the customer's payment into Cash Drawer or Bank.",
          ur: "اپنی اسکرین پر موجود Record Payment بٹن دبائیں اور وصولی محفوظ کریں۔",
        },
        checkpoint: {
          en: "Walkthrough complete! The customer's Udhar balance decreases immediately.",
          ur: "ڈیمو مکمل! گاہک کا بقایا بیلنس فوری کم ہو جائے گا۔",
        },
      },
    ],
  },

  manage_suppliers: {
    id: "manage_suppliers",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Add Supplier & Set Expiry Return Policy",
      ur: "عملی ڈیمو: نیا سپلائر اور ایکسپائری واپسی کی پالیسی درج کرنا",
    },
    primaryScreen: "/suppliers",
    steps: [
      {
        step: 1,
        screen: "/suppliers",
        screenLabel: { en: "Suppliers Directory", ur: "سپلائرز ڈائریکٹری" },
        target: "a[href*='/suppliers/create'], button",
        title: { en: "Click '+ Add Supplier' or Search Directory", ur: "'+ Add Supplier' پر کلک کریں یا فہرست میں سرچ کریں" },
        instruction: {
          en: "Open Suppliers (`/suppliers`) and click '+ Add Supplier' to register a distributor or pharmaceutical company.",
          ur: "Suppliers (`/suppliers`) کھولیں اور نیا ڈسٹری بیوٹر شامل کرنے کے لیے '+ Add Supplier' دبائیں۔",
        },
        observedInstruction: {
          en: "You are on the Suppliers Directory. Click '+ Add Supplier' at the top right, or inspect existing suppliers' Expiry Return Policy and Intimation badges in the table.",
          ur: "آپ سپلائرز اسکرین پر موجود ہیں۔ نیا سپلائر بنانے کے لیے اوپر '+ Add Supplier' پر کلک کریں۔",
        },
        checkpoint: {
          en: "Each supplier row shows their live Expiry Return Policy and whether near-expiry stock has been intimated.",
          ur: "ہر سپلائر کے سامنے اس کی ایکسپائری واپسی کی پالیسی اور انٹیمیشن اسٹیٹس نظر آتا ہے۔",
        },
      },
      {
        step: 2,
        screen: "/suppliers/create",
        screenLabel: { en: "Create Supplier", ur: "نیا سپلائر فارم" },
        target: "input[name='name'], input[type='text']",
        title: { en: "Enter Supplier Name, Phone & Opening Payable", ur: "سپلائر کا نام، فون اور پرانا بقایا درج کریں" },
        instruction: {
          en: "Fill in the Distributor Name, Contact Person/Phone, and any historical Opening Payable Balance.",
          ur: "سپلائر کا نام، فون نمبر اور اگر کوئی پرانا بقایا (Opening Balance) ہے تو وہ درج کریں۔",
        },
        observedInstruction: {
          en: "Enter the Supplier Name, Phone, and any prior Opening Balance in the form fields on your screen.",
          ur: "فارم میں سپلائر کا نام، فون نمبر اور ابتدائی کھاتہ بیلنس لکھیں۔",
        },
        checkpoint: {
          en: "Opening Balance sets the starting credit in the Supplier Ledger (`/supplier-ledger`).",
          ur: "اوپننگ بیلنس سپلائر کھاتے میں ابتدائی واجب الادا رقم کے طور پر درج ہو جائے گا۔",
        },
      },
      {
        step: 3,
        screen: "/suppliers/create",
        screenLabel: { en: "Create Supplier", ur: "نیا سپلائر فارم" },
        target: "select, input[type='number'], button[type='submit']",
        title: { en: "Configure Expiry Return Policy (Months Before/After) & Save", ur: "ایکسپائری واپسی کی مدت مقرر کریں اور Save دبائیں" },
        instruction: {
          en: "Set 'Months Before Expiry' (e.g. 3 months) or 'After Expiry' return policy and click Save.",
          ur: "ایکسپائری سے کتنے ماہ پہلے یا بعد مال واپس ہو سکتا ہے (مثلاً 3 ماہ قبل) منتخب کریں اور Save دبائیں۔",
        },
        observedInstruction: {
          en: "Set the supplier's Expiry Return Policy window and Intimation status, then click Save.",
          ur: "ایکسپائری واپسی کے مہینے مقرر کر کے Save بٹن پر کلک کریں۔",
        },
        checkpoint: {
          en: "Walkthrough complete! Batch Expiry Radar will now alert you before this supplier's return deadline closes.",
          ur: "ڈیمو مکمل! اب سسٹم اس سپلائر کی ایکسپائری مدت ختم ہونے سے پہلے آپ کو الرٹ کرے گا۔",
        },
      },
    ],
  },

  manage_products: {
    id: "manage_products",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Add Product & Configure Pack Size",
      ur: "عملی ڈیمو: نئی پروڈکٹ اور پیک سائز (Pack Size) شامل کرنا",
    },
    primaryScreen: "/products",
    steps: [
      {
        step: 1,
        screen: "/products",
        screenLabel: { en: "Products Catalog", ur: "پروڈکٹس کیٹلاگ" },
        target: "a[href*='/products/create'], input[type='search'], input[type='text']",
        title: { en: "Search Catalog or Click '+ Add Product'", ur: "کیٹلاگ سرچ کریں یا '+ Add Product' دبائیں" },
        instruction: {
          en: "Open Products (`/products`) and click '+ Add Product' (`Ctrl+N`) to create a new item.",
          ur: "Products (`/products`) کھولیں اور نیا آئٹم بنانے کے لیے '+ Add Product' پر کلک کریں۔",
        },
        observedInstruction: {
          en: "You're on the Products Catalog. Click '+ Add Product' at the top right, or search existing items by Name, Generic Formula, or Barcode.",
          ur: "آپ پروڈکٹس کیٹلاگ پر ہیں۔ نیا آئٹم شامل کرنے کے لیے '+ Add Product' بٹن دبائیں۔",
        },
        checkpoint: {
          en: "Defining Generic Formula (Salt) enables 1-click Substitute Medicine search in POS!",
          ur: "فارمولا (Generic Salt) لکھنے سے POS میں متبادل دوائی ایک کلک پر مل جاتی ہے۔",
        },
      },
      {
        step: 2,
        screen: "/products/create",
        screenLabel: { en: "Add Product", ur: "نئی پروڈکٹ فارم" },
        target: "input[name*='pack' i], input[type='number'], input[type='text']",
        title: { en: "Set Pack Size, Pack Cost & Pack Sale Price", ur: "پیک سائز، قیمتِ خرید اور قیمتِ فروخت درج کریں" },
        instruction: {
          en: "Enter Product Name, Generic Formula, Barcode, and Pack Size (e.g. 30 tablets per box). Single-unit price calculates automatically!",
          ur: "پروڈکٹ کا نام، فارمولا، بارکوڈ اور Pack Size (ڈبے میں گولیوں کی تعداد) لکھیں۔ ایک گولی کی قیمت خودکار نکل آئے گی۔",
        },
        observedInstruction: {
          en: "Fill in the Product Name, Category/Brand, Pack Size, and Pack Prices on your screen—watch Unit Price calculate automatically.",
          ur: "پروڈکٹ کا نام، پیک سائز اور ڈبے کی قیمت لکھیں—سنگل یونٹ ریٹ خودکار بن جائے گا۔",
        },
        checkpoint: {
          en: "Walkthrough complete! Once saved, add physical stock via Purchase Invoice (`Ctrl+1`).",
          ur: "ڈیمو مکمل! پروڈکٹ محفوظ کرنے کے بعد Purchase Invoice کے ذریعے اسٹاک شامل کریں۔",
        },
      },
    ],
  },

  cash_drawer_shift: {
    id: "cash_drawer_shift",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Open, Audit & Reconcile Cash Drawer Shift",
      ur: "عملی ڈیمو: کیش ڈراور شفٹ کھولنا، چیک کرنا اور کلوز کرنا",
    },
    primaryScreen: "/cash-drawer",
    steps: [
      {
        step: 1,
        screen: "/cash-drawer",
        screenLabel: { en: "Cash Drawer & Shift Reconciliation", ur: "کیش ڈراور اور شفٹ کا حساب" },
        target: "button",
        title: { en: "Open Shift with Starting Float (or Carryover)", ur: "ابتدائی کیش (Opening Float) سے شفٹ اوپن کریں" },
        instruction: {
          en: "Open Cash Drawer (`/cash-drawer`), click 'Open Cash Drawer', and enter your starting cash float (or use the PKR Note Calculator / Last Shift Carryover).",
          ur: "Cash Drawer (`/cash-drawer`) کھولیں اور ابتدائی نقدی (Opening Float) درج کر کے شفٹ شروع کریں۔",
        },
        observedInstruction: {
          en: "You're on the Cash Drawer screen. If closed, click 'Open Cash Drawer'; if open, inspect your live Expected Cash formula banner at the top.",
          ur: "آپ کیش ڈراور اسکرین پر ہیں۔ اگر شفٹ بند ہے تو 'Open Cash Drawer' دبائیں، یا اوپر متوقع کیش کا لائیو فارمولا دیکھیں۔",
        },
        checkpoint: {
          en: "Formula: Expected Cash = Opening Float + Total Cash Inflows − Total Cash Outflows.",
          ur: "فارمولا: متوقع کیش = اوپننگ فلوٹ + کل کیش ان − کل کیش آؤٹ۔",
        },
      },
      {
        step: 2,
        screen: "/cash-drawer",
        screenLabel: { en: "Cash Drawer & Shift Reconciliation", ur: "کیش ڈراور اور شفٹ کا حساب" },
        target: "table, button",
        title: { en: "Audit Inflows vs. Outflows & Click Category Cards to Filter", ur: "آمد و اخراج کے کارڈز اور واؤچر نمبرز چیک کریں" },
        instruction: {
          en: "Review the Cash Inflows vs. Cash Outflows breakdown cards. Click any category card to filter the transaction log by invoice/voucher.",
          ur: "کیش ان اور کیش آؤٹ کے کارڈز چیک کریں۔ کسی بھی کارڈ پر کلک کر کے نیچے متعلقہ بلوں کی فہرست فلٹر کریں۔",
        },
        observedInstruction: {
          en: "Click any category row inside the Green (Inflows) or Red (Outflows) breakdown cards on your screen to filter the chronological ledger below.",
          ur: "سبز (کیش ان) یا سرخ (کیش آؤٹ) کارڈز میں کسی بھی کیٹیگری پر کلک کر کے نیچے لین دین فلٹر کریں۔",
        },
        checkpoint: {
          en: "Every row shows its clickable Invoice/Voucher badge (`SI-...`, `EXP-...`, `PMT-...`) and customer/supplier name.",
          ur: "ہر لائن میں بل یا واؤچر کا نمبر اور گاہک/سپلائر کا نام صاف نظر آتا ہے۔",
        },
      },
      {
        step: 3,
        screen: "/cash-drawer",
        screenLabel: { en: "Cash Drawer & Shift Reconciliation", ur: "کیش ڈراور اور شفٹ کا حساب" },
        target: "button",
        title: { en: "Close Shift, Count Notes & Download Official Z-Report PDF", ur: "نوٹ گن کر شفٹ کلوز کریں اور Z-Report نکالیں" },
        instruction: {
          en: "At shift end, click 'Close & Reconcile', use the PKR Denomination Calculator to enter your physical cash count, verify Variance, and download the Z-Report PDF.",
          ur: "شفٹ کے اختتام پر 'Close & Reconcile' دبائیں، نوٹوں کی تعداد درج کریں اور Z-Report پی ڈی ایف ڈاؤن لوڈ کریں۔",
        },
        observedInstruction: {
          en: "Click 'Close & Reconcile' at the top right when ending your shift, or click 'Z-Report PDF' on any closed shift in the history table.",
          ur: "شفٹ بند کرنے کے لیے 'Close & Reconcile' دبائیں یا نیچے ہسٹری سے Z-Report PDF ڈاؤن لوڈ کریں۔",
        },
        checkpoint: {
          en: "Walkthrough complete! Your Cash Drawer and Cash in Hand (`1000`) GL account stay 100% synchronized.",
          ur: "ڈیمو مکمل! آپ کا کیش ڈراور اور جنرل لیجر کیش اکاؤنٹ مکمل طور پر سنک رہتے ہیں۔",
        },
      },
    ],
  },

  record_shop_expense: {
    id: "record_shop_expense",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Record Daily Shop Expense",
      ur: "عملی ڈیمو: دکان کا روزمرہ خرچہ درج کرنا",
    },
    primaryScreen: "/expenses",
    steps: [
      {
        step: 1,
        screen: "/expenses",
        screenLabel: { en: "Expenses & Petty Cash", ur: "اخراجات اور پیٹی کیش" },
        target: "button, input[type='text']",
        title: { en: "Open Expenses & Click '+ Add Expense'", ur: "اخراجات کھولیں اور '+ Add Expense' دبائیں" },
        instruction: {
          en: "Open Expenses (`/expenses`), click '+ Add Expense', select the Category (Rent, Electricity, Tea/Refreshments), and enter the Amount.",
          ur: "Expenses (`/expenses`) کھولیں، '+ Add Expense' پر کلک کریں، کیٹیگری اور رقم درج کریں۔",
        },
        observedInstruction: {
          en: "You're on the Expenses screen. Click '+ Add Expense' to record a shop outflow from Cash Drawer or Bank.",
          ur: "آپ اخراجات کی اسکرین پر ہیں۔ نیا خرچہ درج کرنے کے لیے '+ Add Expense' بٹن دبائیں۔",
        },
        checkpoint: {
          en: "Cash expenses automatically deduct from your open Cash Drawer (`Shop Expenses`) and Net Profit report!",
          ur: "نقد اخراجات خودکار طور پر آپ کے کیش ڈراور اور خالص منافع سے منہا ہو جاتے ہیں۔",
        },
      },
    ],
  },

  manage_accounts_transfer: {
    id: "manage_accounts_transfer",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Transfer Cash Between Drawer & Bank",
      ur: "عملی ڈیمو: کیش ڈراور اور بینک کے درمیان رقم ٹرانسفر کرنا",
    },
    primaryScreen: "/accounts",
    steps: [
      {
        step: 1,
        screen: "/accounts",
        screenLabel: { en: "Financial Accounts & Treasury", ur: "فنانشل اکاؤنٹس اور ٹریژری" },
        target: "button",
        title: { en: "Review Account Cards & Click 'Transfer Funds'", ur: "اکاؤنٹ بیلنس دیکھیں اور 'Transfer' بٹن دبائیں" },
        instruction: {
          en: "Open Accounts (`/accounts`), inspect your Cash in Hand, Bank, and Wallet balances, and click 'Transfer' to deposit counter cash into the bank.",
          ur: "Accounts (`/accounts`) کھولیں، کیش اور بینک بیلنس چیک کریں اور رقم منتقل کرنے کے لیے 'Transfer' پر کلک کریں۔",
        },
        observedInstruction: {
          en: "You're on the Financial Accounts screen. Click the 'Transfer' button to move money between Cash in Hand and your Bank/Wallet accounts.",
          ur: "آپ فنانشل اکاؤنٹس اسکرین پر ہیں۔ گلے سے بینک میں رقم جمع کرنے کے لیے 'Transfer' بٹن دبائیں۔",
        },
        checkpoint: {
          en: "Internal transfers update both accounts and the active Cash Drawer without distorting Profit & Loss!",
          ur: "انٹرنل ٹرانسفر سے دونوں اکاؤنٹس اور کیش ڈراور اپڈیٹ ہو جاتے ہیں اور منافع کی رپورٹ متاثر نہیں ہوتی۔",
        },
      },
    ],
  },

  inventory_adjustment: {
    id: "inventory_adjustment",
    product_version: PRODUCT_VERSION,
    title: {
      en: "Interactive Demo: Adjust Stock or Enter Opening Inventory",
      ur: "عملی ڈیمو: اسٹاک ایڈجسٹمنٹ یا ابتدائی اسٹاک درج کرنا",
    },
    primaryScreen: "/stock-adjustments/create",
    steps: [
      {
        step: 1,
        screen: "/stock-adjustments/create",
        screenLabel: { en: "Create Stock Adjustment", ur: "نئی اسٹاک ایڈجسٹمنٹ" },
        target: "input[type='text'], select",
        title: { en: "Select Product, Choose Add (+) or Deduct (−) & Enter Reason", ur: "پروڈکٹ منتخب کریں، اضافہ/کمی اور وجہ لکھیں" },
        instruction: {
          en: "Open Create Stock Adjustment (`/stock-adjustments/create`), select the Product & Batch, choose Add (+) or Deduct (−), enter Quantity and Audit Reason, then Save.",
          ur: "Create Stock Adjustment (`/stock-adjustments/create`) کھولیں، پروڈکٹ، مقدار اور وجہ لکھ کر Save دبائیں۔",
        },
        observedInstruction: {
          en: "Select the product and batch on your screen, set Add (+) or Deduct (−), type the audit reason, and click Save.",
          ur: "اسکرین پر پروڈکٹ اور بیچ منتخب کریں، مقدار اور وجہ لکھ کر Save پر کلک کریں۔",
        },
        checkpoint: {
          en: "Live batch stock and Inventory Asset valuation update immediately on Save.",
          ur: "محفوظ کرتے ہی اسٹاک اور انوینٹری ویلیو فوری اپڈیٹ ہو جائے گی۔",
        },
      },
    ],
  },
};

/**
 * Maps an intent ID or query to a matching Cube Demo Manifest ID when a walkthrough is available.
 * Returns `null` when no walkthrough applies (never falls back to an unrelated screen's demo!).
 */
export function resolveWorkflowIdForIntent(intentId = "", cleanedQuery = "", currentPath = "") {
  if (intentId === "create_purchase_order" || intentId === "po_vs_purchase_invoice" || intentId === "smart_reorder_forecast") {
    return "create_purchase_order";
  }
  if (intentId === "add_stock_purchase_invoice" || intentId === "bonus_units_scheme") {
    return "create_purchase_invoice";
  }
  if (intentId === "how_to_make_sale_billing" || intentId === "sell_loose_tablets_pack_vs_unit" || intentId === "hold_park_recall_bill") {
    return currentPath === "/sale-invoices/create/retail" ? "create_retail_invoice" : "pos_counter_billing";
  }
  if (intentId === "how_to_give_discount" || intentId === "troubleshoot_wrong_total_calculation") {
    return "create_retail_invoice";
  }
  if (intentId === "customer_udhar_ledger_payment" || intentId === "customer_credit_limit_hold") {
    return "customer_udhar_recovery";
  }
  if (intentId === "cash_drawer_shift_management" || intentId === "cash_drawer_shift_z_report") {
    return "cash_drawer_shift";
  }
  if (intentId === "record_daily_expenses" || intentId === "record_shop_expenses") {
    return "record_shop_expense";
  }
  if (intentId === "opening_stock_and_adjustments" || intentId === "opening_stock_adjustment") {
    return "inventory_adjustment";
  }
  if (intentId === "add_new_product_catalog") {
    return "manage_products";
  }
  if (intentId === "bank_accounts_fund_transfer") {
    return "manage_accounts_transfer";
  }
  if (intentId === "supplier_payment_and_ledger") {
    return "manage_suppliers";
  }
  if (cleanedQuery.includes("purchase order") || cleanedQuery.includes("پرچیز آرڈر")) {
    return "create_purchase_order";
  }
  if (cleanedQuery.includes("purchase invoice") || cleanedQuery.includes("add stock") || cleanedQuery.includes("نیا اسٹاک")) {
    return "create_purchase_invoice";
  }
  if (cleanedQuery.includes("udhar") || cleanedQuery.includes("customer ledger") || cleanedQuery.includes("ادھار")) {
    return "customer_udhar_recovery";
  }
  if (cleanedQuery.includes("cash drawer") || cleanedQuery.includes("z-report") || cleanedQuery.includes("galla") || cleanedQuery.includes("گلہ") || cleanedQuery.includes("ڈراور")) {
    return "cash_drawer_shift";
  }
  if (cleanedQuery.includes("supplier") || cleanedQuery.includes("intimation") || cleanedQuery.includes("سپلائر")) {
    return "manage_suppliers";
  }
  if (cleanedQuery.includes("expense") || cleanedQuery.includes("kharcha") || cleanedQuery.includes("خرچہ")) {
    return "record_shop_expense";
  }
  if (cleanedQuery.includes("pos") || cleanedQuery.includes("barcode billing")) {
    return "pos_counter_billing";
  }
  if (currentPath.startsWith("/purchase-orders")) return "create_purchase_order";
  if (currentPath.startsWith("/purchase-invoices")) return "create_purchase_invoice";
  if (currentPath.startsWith("/customer-ledger") || currentPath.startsWith("/customers")) return "customer_udhar_recovery";
  if (currentPath.startsWith("/sale-invoices/pos")) return "pos_counter_billing";
  if (currentPath.startsWith("/sale-invoices")) return "create_retail_invoice";
  if (currentPath.startsWith("/suppliers")) return "manage_suppliers";
  if (currentPath.startsWith("/products")) return "manage_products";
  if (currentPath.startsWith("/cash-drawer")) return "cash_drawer_shift";
  if (currentPath.startsWith("/expenses")) return "record_shop_expense";
  if (currentPath.startsWith("/accounts")) return "manage_accounts_transfer";
  if (currentPath.startsWith("/stock-adjustments")) return "inventory_adjustment";
  return null;
}

/**
 * Builds an accurate evidence classification badge.
 * Never labels static documentation as a live UI observation.
 */
export function buildEvidenceBadge(evidenceType, currentGuide = null, providerLabel = null) {
  const screenTitleEn = currentGuide?.title?.en || currentGuide?.key || "Current Screen";
  const screenTitleUr = currentGuide?.title?.ur || currentGuide?.key || "موجودہ اسکرین";

  switch (evidenceType) {
    case EVIDENCE_TYPES.LIVE_DOM_INSPECTION:
      return {
        en: `Live DOM Inspection (${screenTitleEn})`,
        ur: `لائیو اسکرین کنٹرول کا معائنہ (${screenTitleUr})`,
      };
    case EVIDENCE_TYPES.CURRENT_SCREEN_CONTEXT:
      return {
        en: `Current Screen Context (${screenTitleEn})`,
        ur: `موجودہ اسکرین کا سیاق و سباق (${screenTitleUr})`,
      };
    case EVIDENCE_TYPES.AI_GROUNDED_DOCS:
      return {
        en: `AI-Assisted Explanation • Generated by ${providerLabel || "Generative AI"} (v${PRODUCT_VERSION})`,
        ur: `اے آئی سے تیار کردہ وضاحت • ${providerLabel || "Generative AI"} (v${PRODUCT_VERSION})`,
      };
    case EVIDENCE_TYPES.DOCUMENTED_INFO:
    default:
      return {
        en: `Documented in Karobar Knowledge Base (v${PRODUCT_VERSION})`,
        ur: `کاروبار ایپ مستند گائیڈ میں درج معلومات (v${PRODUCT_VERSION})`,
      };
  }
}

/**
 * Builds a helpful instructional boundary response when a user asks Cube for live ERP figures
 * (such as current stock quantities, live customer balances, or live profit figures).
 */
export function buildLiveRecordBoundaryAnswer(cleaned = "", currentGuide = null) {
  const isStock = /\b(stock|inventory|quantity|qty|batch|panadol|medicine|item|اسٹاک|مقدار)\b/.test(cleaned);
  const isCustomer = /\b(customer|receivable|udhar|گاہک|ادھار)\b/.test(cleaned);
  const isSupplier = /\b(supplier|payable|vendor|سپلائر)\b/.test(cleaned);
  const isProfitOrSales = /\b(profit|sale|revenue|income|expense|منافع|سیل)\b/.test(cleaned);

  const links = [];
  if (isStock) {
    links.push(
      { path: "/reports/current-stock", en: "Open Current Stock Report", ur: "موجودہ اسٹاک رپورٹ کھولیں" },
      { path: "/products", en: "Open Products Catalog", ur: "پروڈکٹس لسٹ کھولیں" }
    );
  } else if (isCustomer) {
    links.push(
      { path: "/customer-ledger", en: "Open Customer Ledger", ur: "کسٹمر کھاتہ کھولیں" },
      { path: "/reports/accounts-receivable-aging", en: "Receivable Aging Report", ur: "وصولیوں کی ایجنگ رپورٹ" }
    );
  } else if (isSupplier) {
    links.push(
      { path: "/supplier-ledger", en: "Open Supplier Ledger", ur: "سپلائر کھاتہ کھولیں" },
      { path: "/reports/accounts-payable-aging", en: "Payable Aging Report", ur: "واجب الادا رپورٹس" }
    );
  } else if (isProfitOrSales) {
    links.push(
      { path: "/reports/net-profit", en: "Open Net Profit & Loss Report", ur: "نفع و نقصان رپورٹ کھولیں" },
      { path: "/dashboard", en: "Open Executive Dashboard", ur: "ڈیش بورڈ کھولیں" }
    );
  } else {
    links.push(
      { path: "/reports/current-stock", en: "Current Stock Report", ur: "موجودہ اسٹاک رپورٹ" },
      { path: "/customer-ledger", en: "Customer Ledger", ur: "کسٹمر کھاتہ" },
      { path: "/accounts", en: "Financial Accounts", ur: "فنانشل اکاؤنٹس" }
    );
  }

  return {
    title: {
      en: "How to Check Live Figures in Karobar ERP (Privacy & Data Boundary)",
      ur: "کاروبار ایپ میں لائیو اعداد و شمار اور ریکارڈ چیک کرنے کا طریقہ",
    },
    en:
      `Cube is your **software training and workflow assistant** — for your business privacy and security, Cube does not read or transmit live ERP records (such as exact stock quantities, customer balances, invoices, or account figures).\n\n` +
      `**How to view your live figures directly:**\n` +
      `1. **Live Stock Quantities & Batches:** Open **Current Stock Report** (\`/reports/current-stock\`) or **Products** (\`/products\`) and type the item name.\n` +
      `2. **Customer Receivable / Udhar Balance:** Open **Customer Ledger** (\`/customer-ledger\`) and select the customer.\n` +
      `3. **Supplier Payable Balance:** Open **Supplier Ledger** (\`/supplier-ledger\`) and select the supplier.\n` +
      `4. **Cash, Bank & Profit Figures:** Open **Financial Accounts** (\`/accounts\`) or **Net Profit Report** (\`/reports/net-profit\`).\n\n` +
      `Click any shortcut below to jump straight to the live screen:`,
    ur:
      `کیوب (Cube) آپ کا **سافٹ ویئر ٹریننگ اسسٹنٹ** ہے — آپ کے کاروباری ڈیٹا کے تحفظ کے لیے کیوب لائیو اسٹاک، گاہکوں کے کھاتے، بل یا اکاؤنٹ بیلنس تک رسائی نہیں رکھتا اور نہ ہی انہیں کسی بیرونی سروس کو بھیجتا ہے۔\n\n` +
      `**لائیو اعداد و شمار خود دیکھنے کا طریقہ:**\n` +
      `1. **موجودہ اسٹاک اور بیچ:** **Current Stock Report** (\`/reports/current-stock\`) یا **Products** (\`/products\`) کھول کر آئٹم سرچ کریں۔\n` +
      `2. **گاہک کا ادھار بیلنس:** **Customer Ledger** (\`/customer-ledger\`) کھول کر گاہک منتخب کریں۔\n` +
      `3. **سپلائر کا بقایا بیلنس:** **Supplier Ledger** (\`/supplier-ledger\`) کھولیں۔\n` +
      `4. **کیش، بینک اور منافع:** **Financial Accounts** (\`/accounts\`) یا **Net Profit Report** (\`/reports/net-profit\`) دیکھیں۔\n\n` +
      `متعلقہ اسکرین کھولنے کے لیے نیچے دیے گئے بٹن پر کلک کریں:`,
    links,
    sourceIds: ["policy:live_data_boundary"],
  };
}

/**
 * Evaluates a user query against local intents, FAQs, and screen guides,
 * returning calibrated match quality metadata and the grounded local answer.
 */
export function evaluateLocalQuery(
  queryText = "",
  currentGuide = null,
  allScreenGuides = {}
) {
  const raw = (queryText || "").trim();
  if (!raw) return null;

  const analysis = analyzeQuery(raw);
  const { cleaned } = analysis;
  const fallbackGuide = currentGuide || allScreenGuides["/dashboard"] || Object.values(allScreenGuides)[0] || null;
  const currentPath = currentGuide?.key || fallbackGuide?.key || "/dashboard";

  // 1. Check Explicit Demonstration / Interactive Walkthrough Request
  const wantsInteractiveDemo =
    /\b(show me|walk me through|step by step demo|interactive demo|take me through|demonstrate)\b/.test(cleaned) ||
    cleaned === "show me" ||
    cleaned.includes("ڈیمو دکھائیں") ||
    cleaned.includes("مرحلہ وار سکھائیں") ||
    cleaned.includes("چل کر دکھائیں");

  // 2. Score all Trained ERP Intents (tracking top and second-best scores)
  let bestIntent = null;
  let bestIntentScore = 0;
  let secondBestIntentScore = 0;

  for (const intent of TRAINED_ERP_INTENTS) {
    const sc = scoreTrainedIntent(intent, analysis);
    if (sc > bestIntentScore) {
      secondBestIntentScore = bestIntentScore;
      bestIntentScore = sc;
      bestIntent = intent;
    } else if (sc > secondBestIntentScore) {
      secondBestIntentScore = sc;
    }
  }

  const intentMargin = Math.max(0, bestIntentScore - secondBestIntentScore);

  // 3. Check Live ERP Record Boundary (unless it's a clearly documented procedural how-to with very high intent score)
  if (analysis.isLiveRecordQuery && bestIntentScore < 120) {
    const boundaryAnswer = buildLiveRecordBoundaryAnswer(cleaned, fallbackGuide);
    const evidenceType = EVIDENCE_TYPES.DOCUMENTED_INFO;
    const evidenceBadge = buildEvidenceBadge(evidenceType, fallbackGuide);
    return {
      matchedIntentId: "live_data_privacy_boundary",
      intentScore: 110,
      secondBestScore: bestIntentScore,
      matchMargin: Math.max(25, 110 - bestIntentScore),
      answerSource: "privacy_boundary_guide",
      matchCategory: MATCH_CATEGORIES.STRONG_INTENT_MATCH,
      matchCategoryLabel: MATCH_CATEGORY_LABELS[MATCH_CATEGORIES.STRONG_INTENT_MATCH],
      evidenceType,
      evidenceBadge,
      workflowId: null,
      riskLevel: "low",
      confidence: 0.96,
      shouldCallAi: false,
      wantsInteractiveDemo: false,
      sourceIds: boundaryAnswer.sourceIds,
      answer: {
        ...boundaryAnswer,
        evidenceBadge,
        workflowId: null,
        risk: "low",
      },
    };
  }

  // 4. Explicit "Explain this screen / current page" intent
  const isCurrentScreenExplain =
    cleaned.includes("this screen") ||
    cleaned.includes("this page") ||
    cleaned.includes("current screen") ||
    cleaned.includes("yeh screen") ||
    cleaned.includes("ye screen") ||
    cleaned.includes("یہ اسکرین") ||
    cleaned.includes("یہ صفحہ") ||
    cleaned === "what does this do";

  if (isCurrentScreenExplain && fallbackGuide) {
    const screenAnswer = buildTailoredScreenAnswer(fallbackGuide, analysis);
    const workflowId = resolveWorkflowIdForIntent("screen_contextual", cleaned, currentPath);
    const evidenceType = EVIDENCE_TYPES.CURRENT_SCREEN_CONTEXT;
    const evidenceBadge = buildEvidenceBadge(evidenceType, fallbackGuide);
    return {
      matchedIntentId: "current_screen_overview",
      intentScore: 100,
      secondBestScore: bestIntentScore,
      matchMargin: Math.max(20, 100 - bestIntentScore),
      answerSource: "current_screen_guide",
      matchCategory: MATCH_CATEGORIES.SCREEN_GUIDE_MATCH,
      matchCategoryLabel: MATCH_CATEGORY_LABELS[MATCH_CATEGORIES.SCREEN_GUIDE_MATCH],
      evidenceType,
      evidenceBadge,
      workflowId,
      riskLevel: "low",
      confidence: 0.94,
      shouldCallAi: false,
      wantsInteractiveDemo,
      sourceIds: [`screen:${fallbackGuide.key}`],
      answer: {
        ...screenAnswer,
        sourceIds: [`screen:${fallbackGuide.key}`],
        evidenceBadge,
        workflowId,
        risk: "low",
      },
    };
  }

  // 5. Score FAQs across all screens
  let bestFaq = null;
  let bestFaqGuide = null;
  let bestFaqScore = 0;
  let secondBestFaqScore = 0;

  for (const guide of Object.values(allScreenGuides)) {
    for (let idx = 0; idx < (guide.faqs || []).length; idx++) {
      const faq = guide.faqs[idx];
      const faqAnalysis = analyzeQuery(`${faq.q.en} ${faq.q.ur}`);
      let hits = 0;
      for (const st of analysis.meaningfulStems) {
        if (faqAnalysis.stemSet.has(st) && st.length > 2) {
          hits += 1;
        }
      }
      const queryComparison = faq.q.en.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, "");
      const exactFaqMatch = cleaned === queryComparison;
      const sc = exactFaqMatch ? 130 : hits * 24 + (guide.key === currentPath ? 8 : 0);
      if (sc > bestFaqScore) {
        secondBestFaqScore = bestFaqScore;
        bestFaqScore = sc;
        bestFaq = { ...faq, faqId: `faq:${guide.key}#${idx}` };
        bestFaqGuide = guide;
      } else if (sc > secondBestFaqScore) {
        secondBestFaqScore = sc;
      }
    }
  }

  // 6. Score all Screen Guides
  let bestGuide = null;
  let bestGuideScore = 0;
  let secondBestGuideScore = 0;

  for (const guide of Object.values(allScreenGuides)) {
    const gScore = scoreScreenGuide(guide, analysis);
    if (gScore > bestGuideScore) {
      secondBestGuideScore = bestGuideScore;
      bestGuideScore = gScore;
      bestGuide = guide;
    } else if (gScore > secondBestGuideScore) {
      secondBestGuideScore = gScore;
    }
  }

  // 7. Evaluate Strong Intent Match
  // Strong intent match requires either a phrase/compositional hit (score >= 65)
  // or two solid keyword hits (score >= 48) with a clear margin (>= 24).
  const isStrongIntent =
    bestIntent &&
    (bestIntentScore >= 65 || (bestIntentScore >= 48 && intentMargin >= 24));

  if (isStrongIntent) {
    const scoreFactor = Math.min(1, Math.max(0, (bestIntentScore - 45) / 135));
    const marginFactor = Math.min(1, Math.max(0, intentMargin / 85));
    const confidence = Number(
      Math.min(0.99, Math.max(0.76, 0.75 + scoreFactor * 0.17 + marginFactor * 0.07)).toFixed(2)
    );
    const workflowId =
      bestIntent.handoffWorkflowId ||
      resolveWorkflowIdForIntent(bestIntent.id, cleaned, currentPath);
    const primaryLinkPath = bestIntent.links?.[0]?.path || "";
    const evidenceType =
      primaryLinkPath && primaryLinkPath === currentPath
        ? EVIDENCE_TYPES.CURRENT_SCREEN_CONTEXT
        : EVIDENCE_TYPES.DOCUMENTED_INFO;
    const evidenceBadge = buildEvidenceBadge(evidenceType, fallbackGuide);
    const riskLevel = bestIntent.riskLevel || "low";

    // Escalate a strong intent match to AI only when the user explicitly requests a detailed follow-up,
    // elaboration, or multi-module comparison that is not already a dedicated comparison intent.
    const isCrossModuleComparison =
      Boolean(analysis.isDifferenceQuery) &&
      bestIntent.id !== "po_vs_purchase_invoice" &&
      bestIntent.id !== "sell_loose_tablets_pack_vs_unit" &&
      secondBestIntentScore >= 48;

    const isComplexOrLooseMatch =
      bestIntent.id !== "greeting_and_help" &&
      (analysis.meaningfulWords.length >= 6 || bestIntentScore < 95);

    const shouldCallAi =
      (Boolean(analysis.isContextualFollowUp) ||
        isCrossModuleComparison ||
        isComplexOrLooseMatch) &&
      !wantsInteractiveDemo;

    return {
      matchedIntentId: bestIntent.id,
      intentScore: bestIntentScore,
      secondBestScore: secondBestIntentScore,
      matchMargin: intentMargin,
      answerSource: "trained_intent",
      matchCategory: MATCH_CATEGORIES.STRONG_INTENT_MATCH,
      matchCategoryLabel: MATCH_CATEGORY_LABELS[MATCH_CATEGORIES.STRONG_INTENT_MATCH],
      evidenceType,
      evidenceBadge,
      workflowId,
      riskLevel,
      confidence,
      shouldCallAi,
      wantsInteractiveDemo,
      sourceIds: [`intent:${bestIntent.id}`],
      answer: {
        title: bestIntent.title,
        en: bestIntent.en,
        ur: bestIntent.ur,
        links: bestIntent.links || [],
        sourceIds: [`intent:${bestIntent.id}`],
        evidenceBadge,
        workflowId,
        risk: riskLevel,
      },
    };
  }

  // 8. Evaluate FAQ Match (requires >= 3 meaningful stem hits or exact FAQ match -> score >= 72)
  if (bestFaq && bestFaqGuide && bestFaqScore >= 72) {
    const faqMargin = Math.max(0, bestFaqScore - secondBestFaqScore);
    const confidence = Number(
      Math.min(0.94, Math.max(0.74, 0.72 + Math.min(0.15, (bestFaqScore - 70) / 250) + Math.min(0.07, faqMargin / 100))).toFixed(2)
    );
    const evidenceType =
      bestFaqGuide.key === currentPath
        ? EVIDENCE_TYPES.CURRENT_SCREEN_CONTEXT
        : EVIDENCE_TYPES.DOCUMENTED_INFO;
    const evidenceBadge = buildEvidenceBadge(evidenceType, bestFaqGuide);
    const workflowId = resolveWorkflowIdForIntent("faq_match", cleaned, bestFaqGuide.key);
    const faqAnswer = {
      title: bestFaq.q,
      en: `${bestFaq.a.en}\n\n**Screen:** ${bestFaqGuide.title.en} (\`${bestFaqGuide.key}\`)`,
      ur: `${bestFaq.a.ur}\n\n**متعلقہ اسکرین:** ${bestFaqGuide.title.ur}`,
      links: [
        ...(bestFaqGuide.key.includes(":")
          ? []
          : [{ path: bestFaqGuide.key, en: `Open ${bestFaqGuide.title.en}`, ur: `${bestFaqGuide.title.ur} کھولیں` }]),
        ...(bestFaqGuide.relatedRoutes || []).slice(0, 2),
      ],
      sourceIds: [bestFaq.faqId, `screen:${bestFaqGuide.key}`],
      evidenceBadge,
      workflowId,
      risk: "low",
    };

    return {
      matchedIntentId: bestFaq.faqId,
      intentScore: bestFaqScore,
      secondBestScore: secondBestFaqScore,
      matchMargin: faqMargin,
      answerSource: "faq_database",
      matchCategory: MATCH_CATEGORIES.FAQ_MATCH,
      matchCategoryLabel: MATCH_CATEGORY_LABELS[MATCH_CATEGORIES.FAQ_MATCH],
      evidenceType,
      evidenceBadge,
      workflowId,
      riskLevel: "low",
      confidence,
      shouldCallAi: Boolean(analysis.isContextualFollowUp) && !wantsInteractiveDemo,
      wantsInteractiveDemo,
      sourceIds: [bestFaq.faqId, `screen:${bestFaqGuide.key}`],
      answer: faqAnswer,
    };
  }

  // 9. Evaluate Strong Screen-Guide Match (score >= 52: e.g. 2+ title hits or 1 title hit + 3 body hits)
  const guideMargin = Math.max(0, bestGuideScore - secondBestGuideScore);
  if (bestGuide && bestGuideScore >= 52 && guideMargin >= 18) {
    const screenAnswer = buildTailoredScreenAnswer(bestGuide, analysis);
    const evidenceType =
      bestGuide.key === currentPath
        ? EVIDENCE_TYPES.CURRENT_SCREEN_CONTEXT
        : EVIDENCE_TYPES.DOCUMENTED_INFO;
    const evidenceBadge = buildEvidenceBadge(evidenceType, bestGuide);
    const workflowId = resolveWorkflowIdForIntent("screen_guide_match", cleaned, bestGuide.key);
    const confidence = Number(
      Math.min(0.91, Math.max(0.72, 0.70 + Math.min(0.14, (bestGuideScore - 50) / 180) + Math.min(0.07, guideMargin / 90))).toFixed(2)
    );

    return {
      matchedIntentId: `screen:${bestGuide.key}`,
      intentScore: bestGuideScore,
      secondBestScore: secondBestGuideScore,
      matchMargin: guideMargin,
      answerSource: "screen_guide",
      matchCategory: MATCH_CATEGORIES.SCREEN_GUIDE_MATCH,
      matchCategoryLabel: MATCH_CATEGORY_LABELS[MATCH_CATEGORIES.SCREEN_GUIDE_MATCH],
      evidenceType,
      evidenceBadge,
      workflowId,
      riskLevel: "low",
      confidence,
      shouldCallAi: Boolean(analysis.isContextualFollowUp) && !wantsInteractiveDemo,
      wantsInteractiveDemo,
      sourceIds: [`screen:${bestGuide.key}`],
      answer: {
        ...screenAnswer,
        sourceIds: [`screen:${bestGuide.key}`],
        evidenceBadge,
        workflowId,
        risk: "low",
      },
    };
  }

  // 10. Evaluate Partial Match (intentScore 24..64 or screenGuideScore 28..51 or faqScore 48..71)
  if ((bestIntent && bestIntentScore >= 24) || (bestGuide && bestGuideScore >= 28)) {
    const useIntent = bestIntent && bestIntentScore >= (bestGuideScore >= 36 ? 36 : 24);
    const partialScore = useIntent ? bestIntentScore : bestGuideScore;
    const partialSecond = useIntent ? secondBestIntentScore : secondBestGuideScore;
    const partialMargin = Math.max(0, partialScore - partialSecond);
    const confidence = Number(
      Math.min(0.68, Math.max(0.42, 0.40 + Math.min(0.20, partialScore / 120) + Math.min(0.08, partialMargin / 80))).toFixed(2)
    );

    const matchedId = useIntent ? bestIntent.id : `screen:${bestGuide.key}`;
    const workflowId =
      (useIntent ? bestIntent.handoffWorkflowId : null) ||
      resolveWorkflowIdForIntent(matchedId, cleaned, currentPath);
    const riskLevel = (useIntent && bestIntent.riskLevel) || "low";
    const evidenceType =
      !useIntent && bestGuide.key === currentPath
        ? EVIDENCE_TYPES.CURRENT_SCREEN_CONTEXT
        : EVIDENCE_TYPES.DOCUMENTED_INFO;
    const evidenceBadge = buildEvidenceBadge(evidenceType, useIntent ? fallbackGuide : bestGuide);

    const baseAns = useIntent
      ? {
          title: bestIntent.title,
          en: bestIntent.en,
          ur: bestIntent.ur,
          links: bestIntent.links || [],
        }
      : buildTailoredScreenAnswer(bestGuide, analysis);

    return {
      matchedIntentId: matchedId,
      intentScore: partialScore,
      secondBestScore: partialSecond,
      matchMargin: partialMargin,
      answerSource: useIntent ? "trained_intent_partial" : "screen_guide_partial",
      matchCategory: MATCH_CATEGORIES.PARTIAL_MATCH,
      matchCategoryLabel: MATCH_CATEGORY_LABELS[MATCH_CATEGORIES.PARTIAL_MATCH],
      evidenceType,
      evidenceBadge,
      workflowId,
      riskLevel,
      confidence,
      // Partial matches are sent to AI for a better contextual explanation unless the user explicitly requested a deterministic walkthrough demo
      shouldCallAi: !(wantsInteractiveDemo && workflowId),
      wantsInteractiveDemo,
      sourceIds: [useIntent ? `intent:${bestIntent.id}` : `screen:${bestGuide.key}`],
      answer: {
        ...baseAns,
        sourceIds: [useIntent ? `intent:${bestIntent.id}` : `screen:${bestGuide.key}`],
        evidenceBadge,
        workflowId,
        risk: riskLevel,
      },
    };
  }

  // 11. No Reliable Match — Local Fallback Directory
  const evidenceType = EVIDENCE_TYPES.CURRENT_SCREEN_CONTEXT;
  const evidenceBadge = buildEvidenceBadge(evidenceType, fallbackGuide);
  const workflowId = resolveWorkflowIdForIntent("screen_contextual", cleaned, currentPath);
  const fallbackAnswer = {
    title: {
      en: `How Can I Help You on ${fallbackGuide?.title?.en || "Karobar ERP"}?`,
      ur: `${fallbackGuide?.title?.ur || "کاروبار ایپ"} — میں آپ کی کیا مدد کر سکتا ہوں؟`,
    },
    en: `I want to make sure I give you the exact answer for **"${raw}"**.\n\nHere is what your current screen (**${fallbackGuide?.title?.en || "Dashboard"}**) does:\n${fallbackGuide?.summary?.en || ""}\n\n**Or ask me directly about any Karobar workflow:**\n• **Purchasing:** *"How to make a Purchase Order"*, *"How to add new stock"*, *"How to return items to supplier"*\n• **Sales & POS:** *"How to sell loose tablets"*, *"How to give discount"*, *"How to hold a bill"*, *"How to find substitute medicine"*\n• **Finance & HR:** *"How to check customer udhar"*, *"How to pay supplier"*, *"How to mark attendance & pay salary"*`,
    ur: `آپ کے سوال **"${raw}"** کے حوالے سے رہنمائی:\n\nآپ اس وقت **${fallbackGuide?.title?.ur || "ڈیش بورڈ"}** اسکرین پر موجود ہیں:\n${fallbackGuide?.summary?.ur || ""}\n\n**آپ مجھ سے کوئی بھی مخصوص سوال پوچھ سکتے ہیں:**\n• **خریداری:** *"پرچیز آرڈر کیسے بنائیں"*, *"نیا اسٹاک کیسے ڈالیں"*, *"سپلائر کو مال واپس کیسے کریں"*\n• **سیلز اور POS:** *"کھلی گولیاں کیسے بیچیں"*, *"ڈسکاؤنٹ کیسے دیں"*, *"بل ہولڈ کیسے کریں"*\n• **کھاتے اور اسٹاف:** *"گاہک کا ادھار کھاتہ"*, *"سپلائر کو پیمنٹ"*, *"ملازمین کی حاضری اور تنخواہ"*`,
    links: [
      ...(fallbackGuide?.key && !fallbackGuide.key.includes(":")
        ? [{ path: fallbackGuide.key, en: `Current: ${fallbackGuide.title.en}`, ur: `${fallbackGuide.title.ur}` }]
        : []),
      { path: "/sale-invoices/pos", en: "Barcode POS", ur: "بارکوڈ POS" },
      { path: "/purchase-invoices/create", en: "Add Stock (Purchase Invoice)", ur: "نیا اسٹاک ڈالیں" },
    ],
    sourceIds: fallbackGuide?.key ? [`screen:${fallbackGuide.key}`] : [],
    evidenceBadge,
    workflowId,
    risk: "low",
  };

  return {
    matchedIntentId: null,
    intentScore: Math.max(0, bestIntentScore),
    secondBestScore: Math.max(0, secondBestIntentScore),
    matchMargin: 0,
    answerSource: "local_fallback_directory",
    matchCategory: MATCH_CATEGORIES.NO_RELIABLE_MATCH,
    matchCategoryLabel: MATCH_CATEGORY_LABELS[MATCH_CATEGORIES.NO_RELIABLE_MATCH],
    evidenceType,
    evidenceBadge,
    workflowId,
    riskLevel: "low",
    confidence: Number((0.15 + Math.min(0.10, Math.max(0, bestIntentScore) / 240)).toFixed(2)),
    shouldCallAi: !(wantsInteractiveDemo && workflowId),
    wantsInteractiveDemo,
    sourceIds: fallbackGuide?.key ? [`screen:${fallbackGuide.key}`] : [],
    answer: fallbackAnswer,
  };
}

/**
 * Router-First Query Orchestrator (`routeUserQuery`):
 * Evaluates intent, match quality, risk, evidence classification, and interactive walkthrough triggers.
 */
export function routeUserQuery(
  queryText = "",
  currentAgent = "cube",
  currentGuide = null,
  allScreenGuides = {},
  hasActiveDemo = false
) {
  const evaluation = evaluateLocalQuery(queryText, currentGuide, allScreenGuides);
  if (!evaluation) return null;

  const {
    matchedIntentId,
    intentScore,
    secondBestScore,
    matchMargin,
    answerSource,
    matchCategory,
    matchCategoryLabel,
    evidenceType,
    evidenceBadge,
    workflowId,
    riskLevel,
    confidence,
    shouldCallAi,
    wantsInteractiveDemo,
    sourceIds,
    answer,
  } = evaluation;

  return {
    agent: "cube",
    intentId: matchedIntentId || "screen_contextual",
    matchedIntentId,
    intentScore,
    secondBestScore,
    matchMargin,
    answerSource,
    matchCategory,
    matchCategoryLabel,
    evidenceType,
    evidenceTier: evidenceType,
    evidenceBadge,
    risk: riskLevel,
    riskLevel,
    confidence,
    shouldCallAi,
    sourceIds,
    handoffOccurred: false,
    handoffFrom: null,
    handoffReason: null,
    workflowId,
    startDemoNow: Boolean(wantsInteractiveDemo && workflowId),
    answer: {
      ...answer,
      matchedIntentId,
      intentScore,
      secondBestScore,
      matchMargin,
      answerSource,
      matchCategory,
      matchCategoryLabel,
      evidenceType,
      evidenceBadge,
      workflowId,
      risk: riskLevel,
      riskLevel,
      confidence,
      sourceIds,
    },
  };
}


/**
 * Scores a single trained intent against the analyzed user query.
 * Uses strict word/stem boundaries so short words never match inside unrelated words.
 */
function scoreTrainedIntent(intent, analysis) {
  const { cleaned, rawWords, wordSet, stemSet } = analysis;
  if (!cleaned) return 0;

  if (intent.onlyWhenShort && rawWords.length > 5) {
    return 0;
  }

  // Disqualify if any negativePhrase matches on word boundaries
  if (intent.negativePhrases?.length) {
    for (const neg of intent.negativePhrases) {
      if (hasBoundedPhrase(cleaned, wordSet, stemSet, neg)) {
        return -100;
      }
    }
  }

  let score = 0;

  // 1. High-precision phrase matching (word-bounded)
  if (intent.phrases?.length) {
    for (const phrase of intent.phrases) {
      const p = phrase.toLowerCase().trim();
      if (cleaned === p) {
        score += 140;
      } else if (hasBoundedPhrase(cleaned, wordSet, stemSet, p)) {
        const wordCount = p.split(" ").length;
        score += 55 + wordCount * 22;
      }
    }
  }

  // 2. Compositional requiredGroups (every group must have at least 1 matching word/stem)
  if (intent.requiredGroups?.length) {
    let allGroupsMatched = true;
    let matchedGroupTokens = 0;
    for (const group of intent.requiredGroups) {
      let groupHit = false;
      for (const candidate of group) {
        if (hasBoundedPhrase(cleaned, wordSet, stemSet, candidate)) {
          groupHit = true;
          matchedGroupTokens += 1;
        }
      }
      if (!groupHit) {
        allGroupsMatched = false;
        break;
      }
    }
    if (allGroupsMatched) {
      score += 65 + intent.requiredGroups.length * 18 + matchedGroupTokens * 6;
    }
  }

  // 3. Supporting keywords (strictly word-bounded)
  if (intent.keywords?.length) {
    for (const kw of intent.keywords) {
      if (hasBoundedPhrase(cleaned, wordSet, stemSet, kw)) {
        score += 24;
      }
    }
  }

  return score;
}

/**
 * Synthesizes a targeted, intelligent answer from a `SCREEN_GUIDES` entry
 * tailored to whether the user asked "how to", "impact", "features", or general overview.
 */
export function buildTailoredScreenAnswer(guide, analysis = null, customTip = null) {
  if (!guide) return null;

  const isHow = analysis?.isHowQuery;
  const isImpact = analysis?.isImpactQuery;

  const enParts = [];
  const urParts = [];

  if (isHow && guide.steps?.en?.length) {
    enParts.push(`**Step-by-Step on ${guide.title.en} (\`${guide.key}\`):**`);
    enParts.push(guide.steps.en.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    if (guide.impacts?.en) {
      enParts.push(`**Result:** ${guide.impacts.en}`);
    }
  } else if (isImpact && guide.impacts?.en) {
    enParts.push(`**Stock & Accounting Impact:** ${guide.impacts.en}`);
    enParts.push(guide.summary.en);
  } else {
    enParts.push(guide.summary.en);
    if (guide.steps?.en?.length) {
      enParts.push(
        `**How to use:**\n` + guide.steps.en.map((s, i) => `${i + 1}. ${s}`).join("\n")
      );
    }
    if (guide.example?.en && guide.example.en !== guide.summary.en) {
      enParts.push(`**${guide.example.title?.en || "Practical Example"}:**\n${guide.example.en}`);
    }
    if (guide.impacts?.en) {
      enParts.push(`**Stock & Ledger Impact:** ${guide.impacts.en}`);
    }
  }

  if (isHow && guide.steps?.ur?.length) {
    urParts.push(`**${guide.title.ur} — استعمال کا مرحلہ وار طریقہ:**`);
    urParts.push(guide.steps.ur.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    if (guide.impacts?.ur) {
      urParts.push(`**نتیجہ:** ${guide.impacts.ur}`);
    }
  } else if (isImpact && guide.impacts?.ur) {
    urParts.push(`**اسٹاک اور کھاتوں پر اثر:** ${guide.impacts.ur}`);
    urParts.push(guide.summary.ur);
  } else {
    urParts.push(guide.summary.ur);
    if (guide.steps?.ur?.length) {
      urParts.push(
        `**استعمال کا طریقہ:**\n` + guide.steps.ur.map((s, i) => `${i + 1}. ${s}`).join("\n")
      );
    }
    if (guide.example?.ur && guide.example.ur !== guide.summary.ur) {
      urParts.push(`**${guide.example.title?.ur || "عملی مثال"}:**\n${guide.example.ur}`);
    }
    if (guide.impacts?.ur) {
      urParts.push(`**کھاتے اور اسٹاک پر اثر:** ${guide.impacts.ur}`);
    }
  }

  if (customTip?.en) enParts.push(customTip.en);
  if (customTip?.ur) urParts.push(customTip.ur);

  const primaryLink =
    guide.key && !guide.key.includes(":")
      ? [{ path: guide.key, en: `Open ${guide.title.en}`, ur: `${guide.title.ur} کھولیں` }]
      : [];
  const extraLinks = (guide.relatedRoutes || [])
    .filter((r) => r.path !== guide.key)
    .slice(0, 2);

  return {
    title: guide.title,
    en: enParts.join("\n\n"),
    ur: urParts.join("\n\n"),
    links: [...primaryLink, ...extraLinks],
  };
}

/**
 * Scores a `SCREEN_GUIDES` entry using strict word-boundary token matching (never substring matching!).
 */
function scoreScreenGuide(guide, analysis) {
  const { meaningfulWords, meaningfulStems } = analysis;
  if (!meaningfulWords.length) return 0;

  const titleAnalysis = analyzeQuery(`${guide.title.en} ${guide.title.ur} ${guide.key}`);
  const bodyAnalysis = analyzeQuery(
    `${guide.section.en} ${guide.section.ur} ${guide.summary.en} ${guide.summary.ur} ${(guide.steps?.en || []).join(" ")} ${(guide.features?.en || []).join(" ")}`
  );

  let score = 0;
  let titleHits = 0;

  for (let i = 0; i < meaningfulWords.length; i++) {
    const w = meaningfulWords[i];
    const st = meaningfulStems[i];

    if (titleAnalysis.wordSet.has(w) || titleAnalysis.stemSet.has(st)) {
      score += 28;
      titleHits += 1;
    } else if (bodyAnalysis.wordSet.has(w) || bodyAnalysis.stemSet.has(st)) {
      score += 9;
    }
  }

  if (titleHits >= 2) {
    score += 25;
  }

  return score;
}

/**
 * Main Entry Point: Answers any user question in English, Urdu, or Roman Urdu
 * using the trained Karobar ERP Intelligence Engine.
 */
export function answerWithTrainedEngine(
  queryText = "",
  currentGuide = null,
  allScreenGuides = {}
) {
  const evaluation = evaluateLocalQuery(queryText, currentGuide, allScreenGuides);
  return evaluation ? evaluation.answer : null;
}



