// resources/js/data/guideBotScreenBlueprints.js
// Rich field-by-field glossaries, worked numerical examples, 4-pillar accounting impact matrices,
// modal context guides, and live DOM element inspection for the Cube Companion Drawer.

export const SCREEN_BLUEPRINTS = {
  "/dashboard": {
    fields: [
      {
        term: { en: "Today's Sales & Net Profit KPIs", ur: "آج کی سیلز اور خالص منافع" },
        type: "Card",
        en: "Shows today's gross revenue, returns deducted, and net profit after subtracting batch Cost of Goods Sold (COGS) and operating expenses.",
        ur: "یہ کارڈز آج کی کل فروخت، واپسی، اور قیمتِ خرید و اخراجات نکالنے کے بعد خالص منافع دکھاتے ہیں۔",
      },
      {
        term: { en: "Near-Expiry & Expired Batch Alerts", ur: "قریب ایکسپائری اور ایکسپائرڈ بیچ الرٹس" },
        type: "Badge",
        en: "Highlights batches expiring within your configured window (e.g. 90 days) so you can intimate suppliers or sell them first via FEFO.",
        ur: "یہ الرٹس ان بیچز کی نشاندہی کرتے ہیں جو جلد ایکسپائر ہونے والے ہیں تاکہ آپ سپلائر کو بروقت اطلاع دے سکیں۔",
      },
      {
        term: { en: "Low Stock / Reorder Alerts", ur: "کم اسٹاک اور ری آرڈر الرٹس" },
        type: "Badge",
        en: "Lists products whose current total units have dropped at or below their minimum Reorder Level.",
        ur: "وہ آئٹمز جن کا اسٹاک مقررہ حد (Reorder Level) سے کم ہو چکا ہے اور جن کا آرڈر دینا ضروری ہے۔",
      },
      {
        term: { en: "Receivables (Customer Udhar) vs. Payables", ur: "کسٹمر ادھار (وصول طلب) بمقابلہ سپلائر واجبات" },
        type: "Formula",
        en: "Compares total money customers owe your shop (Receivables) against total money you owe distributors (Payables).",
        ur: "گاہکوں سے وصول طلب رقم اور سپلائرز کو واجب الادا رقم کا فوری موازنہ۔",
      },
    ],
    example: {
      title: { en: "Example: Morning Shop Health Check", ur: "مثال: صبح دکان کھولتے وقت جائزہ" },
      en: "Formula: `Net Profit = (Gross Sales − Sale Returns − Discounts) − Batch COGS − Shop Expenses`.\nExample: If today's sales are Rs. 50,000, medicine batch cost (COGS) is Rs. 38,000, and electricity/tea expense is Rs. 1,500, your Net Profit shows **Rs. 10,500**.",
      ur: "فارمولا: `خالص منافع = (کل سیل − واپسی − ڈسکاؤنٹ) − قیمتِ خرید (COGS) − دکان کے اخراجات`۔\nمثال: اگر آج کی سیل 50,000 روپے، ادویات کی لاگت 38,000 روپے اور اخراجات 1,500 روپے ہیں تو خالص منافع **10,500 روپے** ہو گا۔",
    },
    impactMatrix: {
      stock: { en: "Read-only analytics (click alerts to jump to Batches or Reorder PO).", ur: "صرف معلوماتی ڈیش بورڈ (الرٹ پر کلک کر کے بیچ یا آرڈر کھولیں)۔" },
      ledger: { en: "Summarizes live Customer Receivable & Supplier Payable balances.", ur: "کسٹمر اور سپلائر کھاتوں کا مجموعی خلاصہ دکھاتا ہے۔" },
      treasury: { en: "Displays live Cash Drawer & Bank Account liquidity.", ur: "کیش ڈراور اور بینک اکاؤنٹس کا موجودہ بیلنس دکھاتا ہے۔" },
      gl: { en: "Aggregates real-time Revenue, COGS, Expense, and Asset accounts.", ur: "آمدنی، لاگت اور اخراجات کے جنرل لیجر کھاتوں کا خلاصہ۔" },
    },
    commonMistake: {
      en: "Tip: Always check the Topbar 'Cash Drawer' badge before starting morning sales to ensure your shift float is open.",
      ur: "مشورہ: صبح بلنگ شروع کرنے سے پہلے اوپر ٹاپ بار میں کیش ڈراور کا اسٹیٹس ضرور چیک کریں۔",
    },
  },

  "/suppliers": {
    fields: [
      {
        term: { en: "Expiry Return Policy (Before / After Expiry)", ur: "ایکسپائری واپسی کی پالیسی (قبل از ایکسپائری / بعد از ایکسپائری)" },
        type: "Field",
        en: "Defines how many months before expiry (e.g. `3 Months Before`) or after expiry this distributor accepts expired stock returns. The system uses this rule to trigger intimation alerts in time.",
        ur: "یہ طے کرتا ہے کہ سپلائر ایکسپائری سے کتنے ماہ پہلے (مثلاً 3 ماہ قبل) یا بعد میں مال واپس لیتا ہے۔ سسٹم اسی کے مطابق الرٹ دیتا ہے۔",
      },
      {
        term: { en: "Intimation Status (Intimated vs. Pending)", ur: "انٹیمیشن اسٹیٹس (اطلاع دی گئی / باقی ہے)" },
        type: "Badge",
        en: "In pharma distribution, suppliers require advance notice ('Intimation') before a batch expires. Marking a batch/supplier as **Intimated** records that you notified the distributor on time so your return claim stays valid.",
        ur: "ادویات کے کاروبار میں ایکسپائری سے پہلے کمپنی کو پیشگی اطلاع (Intimation) دینا لازمی ہوتا ہے۔ یہ بیج دکھاتا ہے کہ آپ نے سپلائر کو اطلاع دے دی ہے یا ابھی باقی ہے۔",
      },
      {
        term: { en: "Opening Balance (Payable)", ur: "اوپننگ بیلنس (ابتدائی واجب الادا رقم)" },
        type: "Field",
        en: "Any historical balance you already owed this supplier before using Karobar ERP. It initializes their Supplier Ledger.",
        ur: "سافٹ ویئر شروع کرنے سے پہلے کا پرانا بقایا جو آپ نے سپلائر کو ادا کرنا ہے۔",
      },
      {
        term: { en: "Current Payable / Credit Summary", ur: "موجودہ واجب الادا بیلنس (Credit Summary)" },
        type: "Column",
        en: "`Opening Balance + Credit Purchase Bills − Purchase Returns − Payments Made = Current Payable`.",
        ur: "`اوپننگ بیلنس + ادھار پرچیز بل − پرچیز واپسی − ادا شدہ رقم = موجودہ بقایا`۔",
      },
    ],
    example: {
      title: { en: "Example: How Supplier Expiry Intimation Works", ur: "مثال: سپلائر ایکسپائری انٹیمیشن کیسے کام کرتی ہے؟" },
      en: "Example: Suppose **Muller & Phipps (M&P)** has a `3 Months Before Expiry` policy. If a batch expires in **December**, Karobar flags it in **September** so you can send an **Expiry Intimation Letter** to the order booker and claim 100% replacement/credit.",
      ur: "مثال: فرض کریں سپلائر کی پالیسی `ایکسپائری سے 3 ماہ قبل` کی ہے۔ اگر دوائی دسمبر میں ایکسپائر ہو رہی ہے تو سسٹم ستمبر میں ہی الرٹ دے گا تاکہ آپ بروقت انٹیمیشن دے کر نقصان سے بچ سکیں۔",
    },
    impactMatrix: {
      stock: { en: "Links products and batches to their source distributor for return claims.", ur: "پروڈکٹس اور بیچز کو ان کے سپلائر کے ساتھ منسلک کرتا ہے۔" },
      ledger: { en: "Creates a Supplier Payable Ledger; Opening Balance posts as initial credit payable.", ur: "سپلائر کھاتہ بناتا ہے اور اوپننگ بیلنس درج کرتا ہے۔" },
      treasury: { en: "No direct cash movement until a Purchase Bill or Supplier Payment is recorded.", ur: "پروفائل بنانے سے کیش پر اثر نہیں پڑتا جب تک ادائیگی نہ کی جائے۔" },
      gl: { en: "Opening Balance credits Accounts Payable (`2000`) and debits Opening Equity.", ur: "اوپننگ بیلنس اکاؤنٹس پے ایبل (Cr) میں درج ہوتا ہے۔" },
    },
    commonMistake: {
      en: "Warning: Do not edit Opening Balance to record new payments or bills! Always use 'Purchase Invoice' for new bills and 'Supplier Ledger → Record Payment' for cash/bank payouts.",
      ur: "احتیاط: نئی ادائیگی درج کرنے کے لیے اوپننگ بیلنس تبدیل نہ کریں بلکہ سپلائر لیجر میں Record Payment استعمال کریں۔",
    },
  },

  "/products": {
    fields: [
      {
        term: { en: "Pack Size (Units per Pack)", ur: "پیک سائز (ڈبے میں گولیوں/یونٹس کی تعداد)" },
        type: "Field",
        en: "Number of loose units (tablets, capsules, sachets, ampoules) inside 1 full box/pack. Example: If 1 box has 3 strips of 10 tablets, enter `Pack Size = 30`. For a single syrup bottle, enter `1`.",
        ur: "ایک ڈبے میں موجود کھلی گولیوں یا یونٹس کی کل تعداد۔ مثلاً 3 پتوں والا ڈبہ جس میں ہر پتے میں 10 گولیاں ہوں تو پیک سائز `30` لکھیں۔ سیرپ کی بوتل کے لیے `1` لکھیں۔",
      },
      {
        term: { en: "Pack Purchase / Sale Price vs. Unit Price", ur: "پیک قیمت بمقابلہ فی یونٹ قیمت" },
        type: "Formula",
        en: "`Unit Price = Pack Price ÷ Pack Size`. When you enter Pack Price and Pack Size, Karobar automatically calculates the per-tablet/unit price for loose counter sales.",
        ur: "`فی گولی قیمت = ڈبے کی قیمت ÷ پیک سائز`۔ ڈبے کی قیمت لکھنے سے سسٹم ایک گولی کی قیمت خودکار نکال لیتا ہے۔",
      },
      {
        term: { en: "Reorder Level & Max Stock", ur: "ری آرڈر لیول (کم از کم اسٹاک کی حد)" },
        type: "Field",
        en: "When total available units fall below `Reorder Level`, the item appears in Low-Stock Alerts and Smart Purchase Order suggestions.",
        ur: "جب اسٹاک اس تعداد سے کم ہو جائے تو سسٹم کم اسٹاک کا الرٹ دیتا ہے اور پرچیز آرڈر میں شامل کرتا ہے۔",
      },
      {
        term: { en: "Rack / Shelf Location", ur: "ریک / شیلف نمبر" },
        type: "Field",
        en: "Physical cabinet or shelf code (e.g. `Rack A-3`, `Fridge-1`) shown during POS billing so counter staff can find the medicine immediately.",
        ur: "دکان میں دوائی رکھنے کی جگہ (مثلاً `Rack A-3`) تاکہ سیلز مین فوری دوائی نکال سکے۔",
      },
    ],
    example: {
      title: { en: "Example: Setting Up a Tablet Box vs. Syrup", ur: "مثال: گولیوں کے ڈبے اور سیرپ کی انٹری" },
      en: "Example: **Panadol 500mg** box has 200 tablets (`Pack Size = 200`). If Pack Sale Price is **Rs. 600**, the system automatically prices 1 loose tablet at **Rs. 3.00** (`600 ÷ 200`). Selling 10 loose tablets deducts 10 units and leaves 190 units (0 Packs + 190 Loose Units).",
      ur: "مثال: پیناڈول کے ڈبے میں 200 گولیاں ہیں (`Pack Size = 200`)۔ اگر ڈبے کی قیمت **600 روپے** ہے تو ایک گولی کی قیمت خودکار **3 روپے** ہو گی۔ 10 کھلی گولیاں بیچنے پر اسٹاک میں 190 گولیاں باقی رہ جائیں گی۔",
    },
    impactMatrix: {
      stock: { en: "Defines master SKU rules; actual quantities live inside Product Batches.", ur: "پروڈکٹ کے بنیادی اصول طے کرتا ہے؛ اصل تعداد بیچز میں ہوتی ہے۔" },
      ledger: { en: "No party ledger impact until purchased or sold.", ur: "پروڈکٹ کارڈ بنانے سے کھاتے پر کوئی اثر نہیں پڑتا۔" },
      treasury: { en: "No cash impact.", ur: "کیش پر کوئی اثر نہیں۔" },
      gl: { en: "Maps item to Inventory Asset (`1200`) and COGS (`5000`) when transacted.", ur: "خرید و فروخت کے وقت انوینٹری اور COGS کھاتوں سے جڑتا ہے۔" },
    },
    commonMistake: {
      en: "Tip: Set the correct Pack Size before recording Purchase Invoices so pack-to-unit conversions remain accurate.",
      ur: "مشورہ: پرچیز بل ڈالنے سے پہلے پیک سائز درست رکھیں تاکہ کھلی گولیوں کا حساب بالکل ٹھیک رہے۔",
    },
  },

  "/purchase-invoices": {
    fields: [
      {
        term: { en: "Posted Number vs. Supplier Bill #", ur: "سسٹم بل نمبر بمقابلہ سپلائر بل نمبر" },
        type: "Column",
        en: "`Posted Number` (e.g. `PI-00042`) is your internal sequential GRN number; `Supplier Bill #` is the invoice number printed on the distributor's paper bill.",
        ur: "`PI-...` آپ کے سسٹم کا نمبر ہے جبکہ `Supplier Bill #` کمپنی کے کاغذی بل کا نمبر ہے۔",
      },
      {
        term: { en: "Total Amount, Paid & Balance Payable", ur: "کل بل، ادا شدہ رقم اور بقایا" },
        type: "Column",
        en: "Shows total bill value, immediate cash/bank payment made on the spot, and remaining credit balance posted to Supplier Ledger.",
        ur: "بل کی کل رقم، موقع پر ادا کی گئی رقم، اور سپلائر کھاتے میں جانے والا بقایا۔",
      },
    ],
    example: {
      title: { en: "Example: Cash vs. Credit Purchase Bill", ur: "مثال: نقد اور ادھار پرچیز بل" },
      en: "Example: A Purchase Invoice of **Rs. 25,000** with **Paid Amount = Rs. 10,000 (Cash)** deducts Rs. 10,000 from your active Cash Drawer and adds **Rs. 15,000** to the Supplier's Payable Ledger.",
      ur: "مثال: **25,000 روپے** کے پرچیز بل میں اگر **10,000 روپے نقد** ادا کیے جائیں تو 10,000 کیش ڈراور سے کم ہوں گے اور **15,000 روپے** سپلائر کے ادھار کھاتے میں جمع ہو جائیں گے۔",
    },
    impactMatrix: {
      stock: { en: "Adds received packs, loose units, and bonus units into Product Batches.", ur: "نیا اسٹاک اور بونس یونٹس بیچز میں جمع کرتا ہے۔" },
      ledger: { en: "Increases Supplier Payable by `(Total Bill − Paid Amount)`.", ur: "غیر ادا شدہ رقم سپلائر کھاتے میں جمع کرتا ہے۔" },
      treasury: { en: "Deducts `Paid Amount` from Cash Drawer or selected Bank Account.", ur: "ادا شدہ رقم کیش ڈراور یا بینک اکاؤنٹ سے کم کرتا ہے۔" },
      gl: { en: "Debits Inventory (`1200`), Credits Accounts Payable (`2000`) / Cash (`1000`).", ur: "انوینٹری کو ڈیبٹ (Dr) اور سپلائر/کیش کو کریڈٹ (Cr) کرتا ہے۔" },
    },
    commonMistake: {
      en: "Tip: If you paid Rs. 0 when the goods arrived and pay the order booker next week, leave Paid Amount = 0 on the bill and record the payout later in Supplier Ledger.",
      ur: "مشورہ: اگر مال ادھار آیا ہے تو بل میں Paid Amount کو 0 رکھیں اور بعد میں ادائیگی سپلائر لیجر سے درج کریں۔",
    },
  },

  "/purchase-invoices/create": {
    fields: [
      {
        term: { en: "Batch Number & Expiry Date", ur: "بیچ نمبر اور ایکسپائری تاریخ" },
        type: "Field",
        en: "Identifies the exact manufacturing lot and expiration date. Required for FEFO counter sales and supplier expiry return claims.",
        ur: "دوائی کا بیچ نمبر اور ایکسپائری تاریخ۔ یہ FEFO بلنگ اور ایکسپائری واپسی کے لیے نہایت ضروری ہے۔",
      },
      {
        term: { en: "Pack Qty, Loose Units & Bonus Units", ur: "پیک تعداد، کھلے یونٹس اور بونس" },
        type: "Formula",
        en: "`Total Stock Added = (Pack Qty × Pack Size) + Loose Units + Bonus Units`. Bonus units are free units from the supplier—they increase your stock count without increasing the bill payable!",
        ur: "`کل اسٹاک = (پیک × پیک سائز) + کھلے یونٹس + بونس یونٹس`۔ بونس یونٹس مفت اسٹاک کے طور پر جمع ہوتے ہیں اور بل کی رقم نہیں بڑھاتے۔",
      },
      {
        term: { en: "Purchase Price vs. Sale Price (MRP) & Margin %", ur: "قیمتِ خرید بمقابلہ قیمتِ فروخت اور مارجن" },
        type: "Formula",
        en: "Enter Trade/Purchase cost and Retail MRP. The row shows your live profit margin % and updates the batch's selling price.",
        ur: "خرید اور فروخت کی قیمت درج کرنے پر سسٹم فوری منافع کا فیصد (Margin %) دکھاتا ہے۔",
      },
      {
        term: { en: "Line Discount % & Withholding Tax (WHT)", ur: "ڈسکاؤنٹ % اور ودہولڈنگ ٹیکس (WHT)" },
        type: "Field",
        en: "`Net Row Total = (Gross Cost − Trade Discount) + Tax`. Adjusts both your effective batch cost and supplier bill total.",
        ur: "کمپنی ڈسکاؤنٹ اور ٹیکس ایڈجسٹ کر کے خالص بل اور فی یونٹ لاگت نکالتا ہے۔",
      },
      {
        term: { en: "Paid Amount & Payment Method / Account", ur: "ادا شدہ رقم اور ادائیگی کا اکاؤنٹ" },
        type: "Field",
        en: "Leave `0` for full credit (`Udhar` from supplier), or enter the cash/bank amount paid right now.",
        ur: "مکمل ادھار بل کے لیے `0` چھوڑ دیں، یا موقع پر ادا کی گئی نقد/بینک رقم لکھیں۔",
      },
    ],
    example: {
      title: { en: "Example: How Bonus Units Lower Your Effective Cost", ur: "مثال: بونس یونٹس سے اوسط لاگت کیسے کم ہوتی ہے؟" },
      en: "Example: You buy **10 Packs** @ **Rs. 300/pack** (= Rs. 3,000 bill) and receive **2 Bonus Packs** free.\n• Total stock added = **12 Packs**\n• Supplier payable = **Rs. 3,000**\n• Your effective cost per pack drops from Rs. 300 to **Rs. 250** (`3,000 ÷ 12`)!",
      ur: "مثال: آپ نے **300 روپے** کے حساب سے **10 ڈبے** خریدے (کل بل 3,000 روپے) اور کمپنی نے **2 ڈبے بونس** دیے۔\n• اسٹاک میں **12 ڈبے** جمع ہوں گے\n• بل صرف **3,000 روپے** رہے گا\n• آپ کی فی ڈبہ اوسط لاگت کم ہو کر **250 روپے** رہ جائے گی!",
    },
    impactMatrix: {
      stock: { en: "Immediately increments Product Batch stock by Purchased + Bonus units.", ur: "خریدے گئے اور بونس یونٹس فوری طور پر بیچ اسٹاک میں جمع ہوتے ہیں۔" },
      ledger: { en: "Posts Bill Total and any Paid Amount to the Supplier's Ledger.", ur: "بل اور ادائیگی سپلائر کے کھاتے میں درج ہوتی ہے۔" },
      treasury: { en: "If Paid > 0 in Cash, deducts from active Cash Drawer (`cash_purchase`).", ur: "نقد ادائیگی کی صورت میں رقم کیش ڈراور سے منہا ہوتی ہے۔" },
      gl: { en: "Dr Inventory (`1200`), Cr Accounts Payable (`2000`) & Cr Cash/Bank.", ur: "انوینٹری ڈیبٹ اور اکاؤنٹس پے ایبل/کیش کریڈٹ ہوتا ہے۔" },
    },
    commonMistake: {
      en: "Pro-Tip: Press `Ctrl+S` to save immediately, and always verify the Expiry Date so FEFO picks the right batch at the POS counter.",
      ur: "مشورہ: بل محفوظ کرنے کے لیے `Ctrl+S` دبائیں اور ایکسپائری تاریخ ضرور چیک کریں۔",
    },
  },

  "/sale-invoices/pos": {
    fields: [
      {
        term: { en: "Barcode Scanner & Medicine Search (F2)", ur: "بارکوڈ اسکینر اور دوائی سرچ (F2)" },
        type: "Field",
        en: "Scan any product barcode or press `F2` to search by brand name or generic formula/salt. The system automatically selects the earliest-expiring batch (**FEFO**).",
        ur: "بارکوڈ اسکین کریں یا `F2` دبا کر نام یا فارمولے سے سرچ کریں۔ سسٹم خودکار طور پر قریب ایکسپائری والا بیچ منتخب کرتا ہے۔",
      },
      {
        term: { en: "Pack Qty vs. Loose Unit Qty", ur: "مکمل ڈبہ (Pack) بمقابلہ کھلی گولیاں (Loose Units)" },
        type: "Field",
        en: "Enter full boxes in `Pack` or individual tablets/strips in `Units`. Selling loose units automatically breaks a pack and deducts exact unit stock.",
        ur: "پورا ڈبہ بیچنے کے لیے Pack اور کھلی گولیاں بیچنے کے لیے Units میں تعداد لکھیں۔",
      },
      {
        term: { en: "Hold Bill (F8) & Held Carts", ur: "بل ہولڈ کرنا (F8) اور واپس بلانا" },
        type: "Button",
        en: "Temporarily parks the current customer's cart so you can bill the next customer in queue, then restore the held cart with 1 click.",
        ur: "موجودہ گاہک کا بل عارضی طور پر روک کر اگلے گاہک کو فارغ کریں اور بعد میں بل واپس کھول لیں۔",
      },
      {
        term: { en: "Cash Received, Change Due & Payment Account", ur: "وصول شدہ نقد رقم، بقایا واپسی اور اکاؤنٹ" },
        type: "Formula",
        en: "`Change Due = Cash Tendered − Net Bill Total`. For walk-in customers, full payment is collected; for registered customers, any unpaid amount goes to their Udhar Ledger.",
        ur: "گاہک سے لی گئی رقم لکھنے پر سسٹم واپس کرنے والے بقایا پیسے (Change) خودکار دکھاتا ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Selling Loose Tablets with FEFO", ur: "مثال: کھلی گولیاں اور FEFO بیچ سلیکشن" },
      en: "Example: You have Batch A (expires in 2 months) and Batch B (expires in 11 months). When you scan the item at POS, Karobar automatically picks **Batch A** so it sells before expiring!",
      ur: "مثال: اگر آپ کے پاس ایک بیچ 2 ماہ بعد اور دوسرا 11 ماہ بعد ایکسپائر ہو رہا ہے تو POS خودکار طور پر **2 ماہ والا بیچ** پہلے سیل کرے گا تاکہ دوائی ایکسپائر نہ ہو۔",
    },
    impactMatrix: {
      stock: { en: "Deducts exact Packs/Units from the selected Product Batch immediately.", ur: "منتخب بیچ سے فروخت شدہ یونٹس فوری کم ہو جاتے ہیں۔" },
      ledger: { en: "Posts credit/partial balance to Customer Receivable Ledger if a named customer is selected.", ur: "رجسٹرڈ گاہک کے کھاتے میں بقایا ادھار درج کرتا ہے۔" },
      treasury: { en: "Logs `cash_sale` inflow into the active Cash Drawer (or deposits to Bank/Wallet).", ur: "نقد وصولی فوری طور پر کیش ڈراور میں جمع ہو جاتی ہے۔" },
      gl: { en: "Dr Cash/AR, Cr Sales Revenue (`4000`); Dr COGS (`5000`), Cr Inventory (`1200`).", ur: "سیلز ریونیو کریڈٹ اور COGS و کیش ڈیبٹ ہوتے ہیں۔" },
    },
    commonMistake: {
      en: "Tip: Make sure your Cash Drawer shift is OPEN before billing cash customers so every POS receipt reconciles in your evening Z-Report.",
      ur: "مشورہ: نقد بلنگ سے پہلے کیش ڈراور شفٹ ضرور کھول لیں تاکہ شام کی Z-Report بالکل درست نکلے۔",
    },
  },

  "/sale-invoices/create/retail": {
    fields: [
      {
        term: { en: "Customer Selection & Credit Limit Alert", ur: "گاہک کا انتخاب اور ادھار کی حد (Credit Limit)" },
        type: "Field",
        en: "Select `Walk-In Customer` for cash counter sales, or choose a registered customer to view their current `Udhar` balance, default discount %, and credit limit.",
        ur: "نقد بل کے لیے Walk-In منتخب کریں یا ادھار کھاتے والے گاہک کا انتخاب کریں۔",
      },
      {
        term: { en: "Batch Selection & Live Stock Badge", ur: "بیچ کا انتخاب اور موجودہ اسٹاک" },
        type: "Column",
        en: "Shows each batch's expiry date, available units, and retail price. Defaults to the earliest expiring batch (FEFO).",
        ur: "ہر بیچ کی ایکسپائری تاریخ اور موجودہ اسٹاک دکھاتا ہے۔",
      },
      {
        term: { en: "Received Amount vs. Net Receivable (Udhar)", ur: "وصول شدہ رقم بمقابلہ بقایا ادھار" },
        type: "Formula",
        en: "`Posted to Customer Udhar = Net Bill Total − Received Amount`. If a bill is Rs. 2,000 and the customer pays Rs. 500 cash, Rs. 500 enters Cash Drawer and Rs. 1,500 enters Customer Ledger.",
        ur: "`بقایا ادھار = کل بل − وصول شدہ رقم`۔ جو رقم کم وصول ہو گی وہ خودکار گاہک کے کھاتے میں چلی جائے گی۔",
      },
    ],
    example: {
      title: { en: "Example: Partial Cash + Udhar Retail Bill", ur: "مثال: آدھی نقد اور آدھی ادھار بلنگ" },
      en: "Example: Bill Total = **Rs. 1,800** for customer *Ali Khan*. He pays **Rs. 800 Cash** now.\n• **Rs. 800** is added to your active Cash Drawer (`cash_sale`).\n• **Rs. 1,000** is added to Ali Khan's Customer Ledger (`Udhar`).",
      ur: "مثال: علی خان کا کل بل **1,800 روپے** بنا جس میں سے اس نے **800 روپے نقد** دیے۔\n• **800 روپے** کیش ڈراور میں جمع ہوں گے۔\n• **1,000 روپے** علی خان کے ادھار کھاتے میں درج ہو جائیں گے۔",
    },
    impactMatrix: {
      stock: { en: "Deducts sold units from the selected batch.", ur: "منتخب بیچ سے اسٹاک کم کرتا ہے۔" },
      ledger: { en: "Adds unpaid balance to Customer Receivable Ledger.", ur: "باقی رقم گاہک کے کھاتے میں جمع کرتا ہے۔" },
      treasury: { en: "Adds Received Cash to active Cash Drawer or Bank Account.", ur: "وصول شدہ نقد رقم کیش ڈراور میں جمع کرتا ہے۔" },
      gl: { en: "Posts Sales Revenue, COGS, Inventory reduction, and Cash/AR.", ur: "سیلز، اسٹاک اور کیش/ادھار کی ڈبل انٹری پوسٹ کرتا ہے۔" },
    },
    commonMistake: {
      en: "Warning: Walk-In Customer bills cannot be saved with unpaid credit (`Udhar`)—select or create a named Customer if the bill is not paid in full.",
      ur: "احتیاط: Walk-In گاہک کے نام پر ادھار محفوظ نہیں ہو سکتا؛ ادھار کے لیے گاہک کا نام منتخب کرنا لازمی ہے۔",
    },
  },

  "/cash-drawer": {
    fields: [
      {
        term: { en: "Opening Float (Initial Drawer Cash)", ur: "اوپننگ فلوٹ (ابتدائی نقد رقم)" },
        type: "Field",
        en: "The physical coins and notes in the counter drawer when you start your shift (for giving change to customers). You can carry over the last shift's actual closing cash with 1 click.",
        ur: "شفٹ شروع کرتے وقت گلے میں موجود ابتدائی نقدی (بقایا دینے کے لیے)۔ آپ پچھلی شفٹ کا کلوزنگ کیش ایک کلک سے منتقل کر سکتے ہیں۔",
      },
      {
        term: { en: "Cash Inflows Breakdown (+)", ur: "کیش ان فلو (گلے میں آنے والی رقم +)" },
        type: "Card",
        en: "Breaks down all cash entering the drawer into 4 clear buckets: **Cash Sales**, **Customer Udhar Receipts**, **Supplier Return Refunds**, and **Manual Cash In / Bank Withdrawals**. Click any bucket to filter the ledger!",
        ur: "گلے میں آنے والی تمام نقدی کی 4 اقسام: نقد سیلز، گاہکوں سے ادھار وصولی، سپلائر واپسی ریفنڈ، اور مینوئل کیش ان۔ کسی بھی قسم پر کلک کر کے نیچے لسٹ فلٹر کریں۔",
      },
      {
        term: { en: "Cash Outflows Breakdown (−)", ur: "کیش آؤٹ فلو (گلے سے نکلنے والی رقم −)" },
        type: "Card",
        en: "Breaks down all cash leaving the drawer into 6 buckets: **Cash Purchases (GRN)**, **Customer Cash Sale Returns**, **Supplier Payments**, **Shop Expenses**, **Staff Salary Advances**, and **Manual Cash Out / Safe Drops**.",
        ur: "گلے سے نکلنے والی نقدی کی 6 اقسام: نقد خریداری، گاہک کو نقد واپسی، سپلائر کو ادائیگی، دکان کے اخراجات، اسٹاف ایڈوانس، اور مینوئل کیش آؤٹ۔",
      },
      {
        term: { en: "Expected Drawer Cash Formula", ur: "متوقع کیش بیلنس (Expected Balance) کا فارمولا" },
        type: "Formula",
        en: "`Expected Drawer Cash = Opening Float + Total Cash Inflows − Total Cash Outflows`. This is the exact physical cash that should be inside your drawer right now.",
        ur: "`متوقع کیش = اوپننگ فلوٹ + کل کیش ان − کل کیش آؤٹ`۔ اس وقت گلے میں اتنی نقد رقم موجود ہونی چاہیے۔",
      },
      {
        term: { en: "Document & Party Reference Badges", ur: "بل نمبر اور پارٹی کا نام (ریفرنس بیج)" },
        type: "Column",
        en: "Shows the exact invoice or voucher number (`SI-00045`, `EXP-...`, `PMT-...`, `ADV-...`) and the Customer, Supplier, or Employee name. Click any blue badge to open the original record.",
        ur: "ہر لین دین کے سامنے اصل بل نمبر اور گاہک/سپلائر/اسٹاف کا نام دکھاتا ہے۔ نیلے بیج پر کلک کر کے اصل ریکارڈ کھولیں۔",
      },
      {
        term: { en: "PKR Note & Coin Denomination Calculator", ur: "پاکستانی نوٹوں اور سکوں کا کیلکولیٹر" },
        type: "Button",
        en: "Available inside the **Open Drawer** and **Close Drawer** modals. Enter the quantity of Rs. 5000, 1000, 500, 100, 50, 20, 10 notes and coins to auto-sum your physical cash without mental math errors.",
        ur: "شفٹ کھولتے یا بند کرتے وقت 5000، 1000، 500 وغیرہ کے نوٹوں کی تعداد لکھیں، سسٹم خودکار کل رقم گن لے گا۔",
      },
    ],
    example: {
      title: { en: "Example: Full Shift Reconciliation & Z-Report", ur: "مثال: شفٹ کا حساب ملانا اور Z-Report" },
      en: "Example:\n• **Opening Float**: Rs. 5,000\n• **Cash Sales**: +Rs. 18,000 | **Customer Udhar Received**: +Rs. 2,000 (`Total In = +Rs. 20,000`)\n• **Shop Expenses**: −Rs. 1,200 | **Cash Sale Refund**: −Rs. 800 (`Total Out = −Rs. 2,000`)\n• **Expected Drawer Cash**: `5,000 + 20,000 − 2,000 = Rs. 23,000`\nIf you count **Rs. 22,900** in physical notes at closing, the system highlights a **Shortage of −Rs. 100** on the Shift Z-Report.",
      ur: "مثال:\n• **اوپننگ فلوٹ**: 5,000 روپے\n• **نقد سیل**: +18,000 | **ادھار وصولی**: +2,000 (`کل آمد = +20,000 روپے`)\n• **دکان کا خرچہ**: −1,200 | **سیل واپسی**: −800 (`کل اخراج = −2,000 روپے`)\n• **متوقع کیش**: `5,000 + 20,000 − 2,000 = 23,000 روپے`\nاگر گنتی میں **22,900 روپے** نکلیں تو سسٹم **100 روپے کمی (Shortage)** دکھائے گا۔",
    },
    impactMatrix: {
      stock: { en: "No direct stock change (linked invoices/returns handle stock).", ur: "براہِ راست اسٹاک تبدیل نہیں ہوتا۔" },
      ledger: { en: "Displays customer/supplier cash payments recorded from ledgers.", ur: "کھاتوں سے ہونے والی نقد وصولیاں اور ادائیگیاں دکھاتا ہے۔" },
      treasury: { en: "Automatically syncs with the default 'Cash in Hand (Drawer)' account in Financial Accounts (`/accounts`).", ur: "فنانشل اکاؤنٹس میں موجود 'Cash in Hand (Drawer)' کے ساتھ خودکار مطابقت رکھتا ہے۔" },
      gl: { en: "Manual Cash In/Out updates Cash in Hand (`1000`) and Treasury logs.", ur: "مینوئل کیش ان/آؤٹ سے کیش اکاؤنٹ اپڈیٹ ہوتا ہے۔" },
    },
    commonMistake: {
      en: "Important: To move cash from the Drawer to a Bank Account (e.g. evening bank deposit), use Financial Accounts (`/accounts` → Transfer) or record Cash Out with clear notes.",
      ur: "اہم بات: گلے سے بینک میں پیسے جمع کروانے کے لیے `/accounts` میں ٹرانسفر آپشن استعمال کریں۔",
    },
  },

  "/product-batches": {
    fields: [
      {
        term: { en: "Expiry Status Badge (Valid / Expiring Soon / Expired)", ur: "ایکسپائری اسٹیٹس بیج (محفوظ / قریب ایکسپائری / ایکسپائرڈ)" },
        type: "Badge",
        en: "Color-coded indicator: **Green** = healthy shelf life, **Amber** = expiring within alert window (sell first or intimate supplier), **Red** = expired (quarantine/dispose immediately).",
        ur: "سبز = محفوظ، پیلا = جلد ایکسپائر ہونے والا، سرخ = ایکسپائر ہو چکا۔",
      },
      {
        term: { en: "Storage Location (Shop Floor / Godown / Cold Storage)", ur: "اسٹوریج لوکیشن (دکان / گودام / فریج)" },
        type: "Column",
        en: "Shows where the batch is stored. Use **Transfer Location** to move stock between Godown and Shop Floor without changing total stock.",
        ur: "بیچ کہاں رکھا ہے (دکان، گودام یا فریج)۔ لوکیشن ٹرانسفر سے مال ایک جگہ سے دوسری جگہ منتقل کریں۔",
      },
    ],
    example: {
      title: { en: "Example: FEFO & Expiry Management", ur: "مثال: بیچ اور ایکسپائری کنٹرول" },
      en: "Filter by **Expiring in 90 Days** once a week, export the list, and submit Expiry Intimations to your suppliers before their return window closes.",
      ur: "ہر ہفتے 90 دن میں ایکسپائر ہونے والے بیچز فلٹر کریں اور سپلائر کو بروقت اطلاع دیں۔",
    },
    impactMatrix: {
      stock: { en: "Tracks exact unit count, cost, and MRP per lot.", ur: "ہر بیچ کی الگ تعداد، لاگت اور قیمتِ فروخت محفوظ رکھتا ہے۔" },
      ledger: { en: "No party ledger change on location transfers.", ur: "لوکیشن بدلنے سے کسی کھاتے پر اثر نہیں پڑتا۔" },
      treasury: { en: "No cash impact.", ur: "کیش پر کوئی اثر نہیں۔" },
      gl: { en: "Inventory valuation is calculated from active batch quantities × unit cost.", ur: "انوینٹری کی کل مالیت بیچز کی لاگت سے نکلتی ہے۔" },
    },
    commonMistake: {
      en: "Never delete a batch that has historical sales—use Stock Adjustment or Stock Disposal to zero out damaged/expired units.",
      ur: "جس بیچ کی سیل ہو چکی ہو اسے ڈیلیٹ نہ کریں بلکہ اسٹاک ایڈجسٹمنٹ یا ڈسپوزل استعمال کریں۔",
    },
  },

  "/customer-ledger": {
    fields: [
      {
        term: { en: "Debit (Bill / Udhar Added) vs. Credit (Payment / Return)", ur: "ڈیبٹ (نیا ادھار بل) بمقابلہ کریڈٹ (وصولی / واپسی)" },
        type: "Column",
        en: "In a Customer Ledger, **Debit (+)** increases what the customer owes you (Credit Sale Bills), while **Credit (−)** reduces their balance (Cash/Bank Payments received or Sale Returns).",
        ur: "گاہک کے کھاتے میں **ڈیبٹ (+)** سے ادھار بڑھتا ہے (نیا بل) اور **کریڈٹ (−)** سے ادھار کم ہوتا ہے (رقم کی وصولی یا مال واپسی)۔",
      },
      {
        term: { en: "+ Record Payment Button", ur: "رقم وصولی کا بٹن (+ Record Payment)" },
        type: "Button",
        en: "Records cash, bank transfer, or mobile wallet recovery from the customer, reduces their receivable balance, and prints a Payment Receipt.",
        ur: "گاہک سے نقد یا بینک وصولی درج کرتا ہے، بقایا کم کرتا ہے اور رسید پرنٹ کرتا ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Recovering Customer Udhar in Cash", ur: "مثال: گاہک سے نقد ادھار وصولی" },
      en: "Example: Customer owes **Rs. 5,000**. They pay **Rs. 3,000 Cash**.\n• Customer Ledger balance drops to **Rs. 2,000**.\n• Active Cash Drawer increases by **+Rs. 3,000** (`customer_payment`).",
      ur: "مثال: گاہک کے ذمے **5,000 روپے** تھے، اس نے **3,000 روپے نقد** ادا کیے۔\n• گاہک کا بقایا کم ہو کر **2,000 روپے** رہ جائے گا۔\n• کیش ڈراور میں **+3,000 روپے** جمع ہو جائیں گے۔",
    },
    impactMatrix: {
      stock: { en: "No stock change on payment recovery.", ur: "رقم وصولی سے اسٹاک پر اثر نہیں پڑتا۔" },
      ledger: { en: "Reduces Customer Receivable balance immediately.", ur: "گاہک کا واجب الوصول بیلنس کم کرتا ہے۔" },
      treasury: { en: "Adds cash to Cash Drawer (`customer_payment`) or selected Bank/Wallet.", ur: "وصول شدہ رقم کیش ڈراور یا بینک اکاؤنٹ میں جمع ہوتی ہے۔" },
      gl: { en: "Dr Cash/Bank (`1000`/`1100`), Cr Accounts Receivable (`1300`).", ur: "کیش/بینک ڈیبٹ اور اکاؤنٹس ریسیوایبل کریڈٹ ہوتا ہے۔" },
    },
    commonMistake: {
      en: "Always verify whether the customer paid in Physical Cash (goes to Cash Drawer) or EasyPaisa/JazzCash/Bank (select the matching Bank/Wallet account).",
      ur: "رقم وصول کرتے وقت درست اکاؤنٹ (نقد ڈراور یا بینک/ایزی پیسہ) منتخب کریں۔",
    },
  },

  "/supplier-ledger": {
    fields: [
      {
        term: { en: "Credit (Purchase Bill) vs. Debit (Payment / Return)", ur: "کریڈٹ (پرچیز بل) بمقابلہ ڈیبٹ (ادائیگی / واپسی)" },
        type: "Column",
        en: "In a Supplier Ledger, **Credit (+)** increases what you owe the distributor (Purchase Invoices), while **Debit (−)** reduces your payable (Payments made or Purchase Returns).",
        ur: "سپلائر کھاتے میں **کریڈٹ (+)** سے واجب الادا رقم بڑھتی ہے اور **ڈیبٹ (−)** (ادائیگی یا پرچیز واپسی) سے بقایا کم ہوتا ہے۔",
      },
      {
        term: { en: "Record Supplier Payment", ur: "سپلائر کو ادائیگی درج کرنا" },
        type: "Button",
        en: "Records cash, cheque, or bank transfer paid to the supplier and allocates it against open purchase invoices.",
        ur: "سپلائر کو نقد، بینک یا چیک کے ذریعے کی گئی ادائیگی درج کرتا ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Paying an Order Booker from Cash Drawer", ur: "مثال: کیش ڈراور سے سپلائر کو ادائیگی" },
      en: "Example: You owe a distributor **Rs. 40,000** and pay **Rs. 15,000 Cash** from the counter drawer.\n• Supplier Payable drops to **Rs. 25,000**.\n• Active Cash Drawer decreases by **−Rs. 15,000** (`supplier_payment`).",
      ur: "مثال: سپلائر کے **40,000 روپے** واجب الادا تھے، آپ نے گلے سے **15,000 روپے نقد** ادا کیے۔\n• سپلائر کا بقایا **25,000 روپے** رہ جائے گا۔\n• کیش ڈراور سے **15,000 روپے** کم ہو جائیں گے۔",
    },
    impactMatrix: {
      stock: { en: "No stock change on payment.", ur: "ادائیگی سے اسٹاک تبدیل نہیں ہوتا۔" },
      ledger: { en: "Reduces Supplier Payable balance.", ur: "سپلائر کا واجب الادا بیلنس کم کرتا ہے۔" },
      treasury: { en: "Deducts from Cash Drawer (`supplier_payment`) or Bank Account.", ur: "کیش ڈراور یا بینک اکاؤنٹ سے رقم منہا کرتا ہے۔" },
      gl: { en: "Dr Accounts Payable (`2000`), Cr Cash/Bank (`1000`/`1100`).", ur: "اکاؤنٹس پے ایبل ڈیبٹ اور کیش/بینک کریڈٹ ہوتا ہے۔" },
    },
    commonMistake: {
      en: "If paying by Cheque or Bank Transfer, select your Bank Account instead of Cash so your physical Cash Drawer expected balance stays accurate.",
      ur: "اگر بینک یا چیک سے ادائیگی کی ہے تو Cash کی بجائے Bank اکاؤنٹ منتخب کریں تاکہ گلے کا کیش خراب نہ ہو۔",
    },
  },

  "/accounts": {
    fields: [
      {
        term: { en: "Cash in Hand (Drawer) — Default Cash Account", ur: "کیش ان ہینڈ (ڈراور) — بنیادی کیش اکاؤنٹ" },
        type: "Card",
        en: "Automatically synchronized with your active Cash Drawer shift (`Safe Opening Reserve + Open Shift Expected Cash`).",
        ur: "یہ اکاؤنٹ آپ کے فعال کیش ڈراور کے بیلنس کے ساتھ خودکار طور پر منسلک رہتا ہے۔",
      },
      {
        term: { en: "Inter-Account Transfer (Drawer ↔ Bank / Safe)", ur: "اکاؤنٹ ٹرانسفر (ڈراور سے بینک یا سیف میں منتقلی)" },
        type: "Button",
        en: "Moves money between two treasury accounts (e.g. depositing Rs. 50,000 from Cash Drawer into HBL Bank). Automatically logs the matching `cash_out` / `cash_in` in your open Cash Drawer shift!",
        ur: "ایک اکاؤنٹ سے دوسرے اکاؤنٹ میں رقم منتقل کرتا ہے (مثلاً گلے سے بینک میں پیسے جمع کروانا)۔",
      },
    ],
    example: {
      title: { en: "Example: Evening Bank Deposit from Drawer", ur: "مثال: گلے سے بینک میں کیش جمع کروانا" },
      en: "Example: Your drawer has **Rs. 35,000** and you deposit **Rs. 25,000** into **Meezan Bank**.\nUse **Transfer** (`From: Cash in Hand` → `To: Meezan Bank`, `Rs. 25,000`). Your Drawer Expected Cash becomes **Rs. 10,000** and Meezan Bank increases by **+Rs. 25,000**.",
      ur: "مثال: گلے میں **35,000 روپے** ہیں اور آپ **25,000 روپے** میزان بینک میں جمع کرواتے ہیں۔\n**Transfer** استعمال کریں۔ گلے میں متوقع کیش **10,000 روپے** رہ جائے گا اور بینک بیلنس **25,000 روپے** بڑھ جائے گا۔",
    },
    impactMatrix: {
      stock: { en: "No stock impact.", ur: "اسٹاک پر کوئی اثر نہیں۔" },
      ledger: { en: "No customer/supplier ledger change on internal transfers.", ur: "اندرونی ٹرانسفر سے گاہک یا سپلائر کھاتے متاثر نہیں ہوتے۔" },
      treasury: { en: "Updates source & destination Account balances + Cash Drawer log.", ur: "دونوں اکاؤنٹس اور کیش ڈراور کا بیلنس اپڈیٹ کرتا ہے۔" },
      gl: { en: "Posts balanced asset transfer between Cash (`1000`) and Bank (`1100`).", ur: "کیش اور بینک کے درمیان متوازن جنرل لیجر انٹری کرتا ہے۔" },
    },
    commonMistake: {
      en: "Never record a bank deposit as an 'Expense'—a bank deposit is an asset transfer (`Transfer`), not a shop cost!",
      ur: "بینک میں جمع کروائی گئی رقم کو کبھی بھی 'Expense' (خرچہ) میں نہ لکھیں بلکہ 'Transfer' استعمال کریں۔",
    },
  },

  "/expenses": {
    fields: [
      {
        term: { en: "Expense Category & Payee", ur: "خرچے کی قسم (Category) اور وصول کنندہ" },
        type: "Field",
        en: "Classifies the operating cost (e.g. Electricity, Shop Rent, Tea/Refreshments, Packaging) for your Profit & Loss statement.",
        ur: "نفع و نقصان کی رپورٹ کے لیے خرچے کی مد (مثلاً بجلی بل، کرایہ، چائے پانی)۔",
      },
      {
        term: { en: "Payment Account (Cash Drawer vs. Bank)", ur: "ادائیگی کا اکاؤنٹ (کیش ڈراور یا بینک)" },
        type: "Field",
        en: "If paid in Cash while a shift is open, it automatically deducts from your active **Cash Drawer** (`Operating Shop Expense`).",
        ur: "نقد ادائیگی کی صورت میں رقم خودکار طور پر فعال کیش ڈراور سے منہا ہو جاتی ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Recording Daily Shop Petty Cash Expense", ur: "مثال: دکان کا روزمرہ خرچہ درج کرنا" },
      en: "Example: Paying **Rs. 450** cash for shop refreshments.\n• Deducts **−Rs. 450** from active Cash Drawer.\n• Adds **Rs. 450** to Operating Expenses on your Profit & Loss report.",
      ur: "مثال: چائے پانی کے لیے گلے سے **450 روپے** ادا کیے۔\n• کیش ڈراور سے **450 روپے** کم ہو جائیں گے۔\n• نفع و نقصان رپورٹ میں **450 روپے** خرچہ درج ہو جائے گا۔",
    },
    impactMatrix: {
      stock: { en: "No inventory impact.", ur: "اسٹاک پر کوئی اثر نہیں۔" },
      ledger: { en: "No customer/supplier ledger impact.", ur: "گاہک یا سپلائر کھاتے پر اثر نہیں۔" },
      treasury: { en: "Deducts from active Cash Drawer (`expense`) or selected Bank Account.", ur: "کیش ڈراور یا بینک اکاؤنٹ سے رقم کم کرتا ہے۔" },
      gl: { en: "Dr Operating Expense (`6xxx`), Cr Cash/Bank (`1000`/`1100`).", ur: "خرچہ اکاؤنٹ ڈیبٹ اور کیش/بینک کریڈٹ ہوتا ہے۔" },
    },
    commonMistake: {
      en: "Do not record medicine purchases or supplier payments under Expenses—those belong in Purchase Invoices and Supplier Ledger.",
      ur: "ادویات کی خریداری یا سپلائر کی ادائیگی کو اخراجات (Expenses) میں درج نہ کریں۔",
    },
  },

  "/accounting": {
    fields: [
      {
        term: { en: "Chart of Accounts (COA)", ur: "چارٹ آف اکاؤنٹس (کھاتوں کی فہرست)" },
        type: "Field",
        en: "Organized into 5 accounting groups: **1xxx Assets** (Cash, Bank, Inventory, Receivables), **2xxx Liabilities** (Supplier Payables), **3xxx Equity** (Capital), **4xxx Revenue** (Sales), and **5xxx/6xxx Expenses** (COGS & Shop Expenses).",
        ur: "کاروبار کے 5 بنیادی کھاتے: اثاثے (Assets)، واجبات (Liabilities)، سرمایہ (Equity)، آمدنی (Revenue) اور اخراجات (Expenses)۔",
      },
      {
        term: { en: "Trial Balance (Dr = Cr Check)", ur: "ٹرائل بیلنس (ڈیبٹ اور کریڈٹ کی برابری)" },
        type: "Formula",
        en: "`Total Debits (Dr) = Total Credits (Cr)`. Verifies that every single invoice, return, expense, and payment in the ERP is mathematically balanced.",
        ur: "تصدیق کرتا ہے کہ سسٹم کے تمام ڈیبٹ اور کریڈٹ سوفیصد برابر ہیں۔",
      },
      {
        term: { en: "Profit & Loss vs. Balance Sheet", ur: "نفع و نقصان بمقابلہ بیلنس شیٹ" },
        type: "Card",
        en: "**Profit & Loss** shows `Revenue − COGS − Expenses = Net Profit` for a date range. **Balance Sheet** shows `Assets = Liabilities + Equity` as of a specific date.",
        ur: "**نفع و نقصان** مخصوص مدت کی کمائی دکھاتا ہے جبکہ **بیلنس شیٹ** کاروبار کے کل اثاثے اور واجبات دکھاتی ہے۔",
      },
    ],
    example: {
      title: { en: "Example: How Auto-Posting Works Behind the Scenes", ur: "مثال: خودکار ڈبل انٹری کیسے کام کرتی ہے؟" },
      en: "You don't need to write manual journal entries for daily sales or purchases! Every POS bill automatically posts:\n1. `Dr Cash / Receivable` & `Cr Sales Revenue`\n2. `Dr Cost of Goods Sold (COGS)` & `Cr Inventory Asset`",
      ur: "آپ کو روزمرہ بلنگ کے لیے خود جنرل انٹری کرنے کی ضرورت نہیں—ہر سیل اور پرچیز بل خودکار طور پر ڈبل انٹری لیجر میں پوسٹ ہوتا ہے۔",
    },
    impactMatrix: {
      stock: { en: "Reflects live Inventory Asset (`1200`) valuation.", ur: "انوینٹری اثاثے کی کل مالیت دکھاتا ہے۔" },
      ledger: { en: "Reconciles with Customer AR (`1300`) and Supplier AP (`2000`).", ur: "کسٹمر اور سپلائر کنٹرول اکاؤنٹس سے مطابقت رکھتا ہے۔" },
      treasury: { en: "Reconciles with Cash (`1000`) and Bank (`1100`) accounts.", ur: "کیش اور بینک کھاتوں سے مطابقت رکھتا ہے۔" },
      gl: { en: "Master Double-Entry General Ledger & Financial Statements.", ur: "مرکزی جنرل لیجر اور مالیاتی رپورٹس۔" },
    },
    commonMistake: {
      en: "Use Manual Journal Entries only for accountant adjustments (e.g. depreciation, owner capital injection, or tax provisions).",
      ur: "مینوئل جنرل انٹری صرف اکاؤنٹنگ ایڈجسٹمنٹ یا سرمایہ شامل کرنے کے لیے استعمال کریں۔",
    },
  },

  "/hr-payroll": {
    fields: [
      {
        term: { en: "Employee Attendance & ZKTeco Biometric Sync", ur: "اسٹاف حاضری اور بائیومیٹرک مشین سنک" },
        type: "Field",
        en: "Tracks daily Present, Absent, Late, and Leave status—either marked manually or pulled directly from your ZKTeco fingerprint device over LAN.",
        ur: "اسٹاف کی روزانہ حاضری، چھٹی اور بائیومیٹرک مشین سے خودکار حاضری کا ریکارڈ۔",
      },
      {
        term: { en: "Staff Salary Advances vs. Monthly Payroll", ur: "اسٹاف ایڈوانس بمقابلہ ماہانہ تنخواہ (Payroll)" },
        type: "Formula",
        en: "`Net Payable Salary = Basic Salary + Sales Commissions + Allowances − Attendance Deductions − Advance Recovery`. Issuing a cash advance mid-month automatically deducts from your open Cash Drawer (`Staff Salary Advance`)!",
        ur: "`خالص تنخواہ = بنیادی تنخواہ + کمیشن − غیر حاضری کٹوتی − ایڈوانس کی واپسی`۔ مہینے کے درمیان نقد ایڈوانس دینے سے رقم کیش ڈراور سے کم ہو جاتی ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Mid-Month Advance & Month-End Salary", ur: "مثال: ایڈوانس کٹوتی اور ماہانہ تنخواہ" },
      en: "Example: Salesman *Bilal* has **Rs. 30,000** salary, earns **Rs. 2,500** commission, and took a **Rs. 5,000** cash advance on the 15th.\nAt month-end payroll, the system auto-deducts the Rs. 5,000 advance so net payout is **Rs. 27,500**.",
      ur: "مثال: بلال کی تنخواہ **30,000 روپے** اور کمیشن **2,500 روپے** ہے، جبکہ اس نے 15 تاریخ کو **5,000 روپے** ایڈوانس لیا۔\nمہینے کے آخر میں پے رول بناتے وقت 5,000 ایڈوانس کٹ کر بقایا تنخواہ **27,500 روپے** ادا ہو گی۔",
    },
    impactMatrix: {
      stock: { en: "No stock impact.", ur: "اسٹاک پر کوئی اثر نہیں۔" },
      ledger: { en: "Maintains individual Employee Advance & Salary Ledgers.", ur: "ہر ملازم کے ایڈوانس اور تنخواہ کا کھاتہ رکھتا ہے۔" },
      treasury: { en: "Deducts cash advances & salary payouts from Cash Drawer or Bank.", ur: "نقد ایڈوانس اور تنخواہ کیش ڈراور یا بینک سے منہا کرتا ہے۔" },
      gl: { en: "Posts Staff Advance Asset (`1400`) and Salary Expense (`6100`).", ur: "اسٹاف ایڈوانس اور تنخواہ کے اخراجات جنرل لیجر میں پوسٹ کرتا ہے۔" },
    },
    commonMistake: {
      en: "Always record mid-month staff loans under the 'Advances & Loans' tab so payroll automatically recovers them at month-end!",
      ur: "اسٹاف کو ادھار یا ایڈوانس دیتے وقت 'Advances' ٹیب میں درج کریں تاکہ تنخواہ سے خودکار کٹوتی ہو سکے۔",
    },
  },

  "/purchase-orders": {
    fields: [
      {
        term: { en: "Load Low-Stock / Smart Suggestions", ur: "لو اسٹاک اور ڈیمانڈ آئٹمز خودکار لوڈ کریں" },
        type: "Action",
        en: "Automatically populates the order table with products below their Reorder Alert Level plus pending items from the Customer Shortage Book.",
        ur: "کم اسٹاک والی اشیاء اور گاہکوں کی ڈیمانڈ بُک والے آئٹمز ایک کلک سے آرڈر میں شامل کرتا ہے۔",
      },
      {
        term: { en: "Convert to Purchase Invoice (GRN)", ur: "پرچیز انوائس (بل) میں تبدیل کریں" },
        type: "Action",
        en: "When the supplier delivers the ordered goods, click Convert to open a pre-filled Purchase Invoice where you only need to enter Batch # and Expiry Date.",
        ur: "جب سپلائر مال پہنچا دے تو آرڈر کو ایک کلک سے پرچیز انوائس میں تبدیل کریں اور صرف بیچ اور ایکسپائری درج کریں۔",
      },
    ],
    example: {
      title: { en: "Example: Purchase Order vs. Purchase Invoice", ur: "مثال: پرچیز آرڈر اور پرچیز بل میں فرق" },
      en: "A **Purchase Order (PO)** is just a demand list sent to the distributor (via PDF/WhatsApp) — it **does not** change your stock or ledger.\nOnce the delivery arrives, convert it to a **Purchase Invoice** to add the stock!",
      ur: "**پرچیز آرڈر (PO)** صرف سپلائر کو بھیجی جانے والی ڈیمانڈ لسٹ ہے—اس سے اسٹاک یا کھاتہ تبدیل نہیں ہوتا۔ مال آنے پر اسے **Purchase Invoice** میں تبدیل کرنے سے اسٹاک جمع ہوتا ہے۔",
    },
    impactMatrix: {
      stock: { en: "No stock change until converted into a Purchase Invoice.", ur: "پرچیز انوائس بننے تک اسٹاک تبدیل نہیں ہوتا۔" },
      ledger: { en: "No payable posted until goods are received.", ur: "مال وصول ہونے تک سپلائر کھاتے پر اثر نہیں پڑتا۔" },
      treasury: { en: "No cash or bank movement.", ur: "کیش یا بینک پر کوئی اثر نہیں۔" },
      gl: { en: "Non-posting procurement document.", ur: "جنرل لیجر میں کوئی انٹری نہیں ہوتی۔" },
    },
    commonMistake: {
      en: "If your stock didn't increase after saving a Purchase Order, remember to click 'Convert to Purchase Invoice' when the delivery arrives!",
      ur: "صرف پرچیز آرڈر بنانے سے اسٹاک نہیں بڑھتا—مال آنے پر اسے Purchase Invoice میں تبدیل کرنا ضروری ہے۔",
    },
  },

  "/sale-returns": {
    fields: [
      {
        term: { en: "Load Original Sale Invoice", ur: "اصل سیل بل سے آئٹمز لوڈ کریں" },
        type: "Field",
        en: "Select the customer's original Sale Invoice to automatically pull the exact batch sold, unit price, and discount given on that bill.",
        ur: "گاہک کا اصل سیل بل منتخب کرنے سے فروخت شدہ بیچ، قیمت اور ڈسکاؤنٹ خودکار لوڈ ہو جاتے ہیں۔",
      },
      {
        term: { en: "Refund Method (Cash vs. Ledger Credit)", ur: "رقم کی واپسی کا طریقہ (نقد یا کھاتہ ایڈجسٹمنٹ)" },
        type: "Field",
        en: "Choose whether you handed physical cash back from the Cash Drawer or credited the customer's Udhar Ledger balance.",
        ur: "طے کریں کہ گاہک کو گلے سے نقد رقم واپس دی گئی ہے یا اس کے ادھار کھاتے سے رقم کم کی گئی ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Returning 1 Strip from a Sale Bill", ur: "مثال: فروخت شدہ بل میں سے 1 پتا واپس لینا" },
      en: "Example: Customer returns **10 tablets (Rs. 150)** from Invoice `SI-00120` for cash.\n• Batch stock increases by **+10 units**\n• Cash Drawer expected cash decreases by **−Rs. 150** (`Sale Return Refund`)\n• Sales revenue & COGS reverse automatically.",
      ur: "مثال: گاہک نے بل `SI-00120` میں سے **10 گولیاں (150 روپے)** واپس کیں:\n• اسٹاک میں **10 یونٹس** واپس جمع ہو جائیں گے\n• کیش ڈراور سے **150 روپے** کم ہو جائیں گے۔",
    },
    impactMatrix: {
      stock: { en: "Restores returned units back into the original Product Batch (+).", ur: "واپس آنے والے یونٹس دوبارہ اسی بیچ کے اسٹاک میں جمع کرتا ہے۔" },
      ledger: { en: "Credits Customer Ledger if adjusted against Udhar.", ur: "ادھار گاہک کے کھاتے سے بقایا کم کرتا ہے۔" },
      treasury: { en: "Deducts Cash Refund from open Cash Drawer (`sale_return`).", ur: "نقد واپسی کی صورت میں کیش ڈراور سے رقم منہا کرتا ہے۔" },
      gl: { en: "Dr Sales Returns & Cr Cash/AR; Dr Inventory & Cr COGS.", ur: "سیلز ریٹرن اور انوینٹری کی ڈبل انٹری پوسٹ کرتا ہے۔" },
    },
    commonMistake: {
      en: "Always link the Sale Return to the original invoice when possible so the exact batch and discount rate are restored.",
      ur: "ہمیشہ اصل سیل بل منتخب کر کے ریٹرن ڈالیں تاکہ درست بیچ اور ڈسکاؤنٹ لاگو ہو۔",
    },
  },

  "/purchase-returns": {
    fields: [
      {
        term: { en: "Batch Selection & Return Qty", ur: "بیچ کا انتخاب اور واپسی کی مقدار" },
        type: "Field",
        en: "Select the exact supplier batch being returned (e.g. near-expiry or damaged stock) so units are deducted from the right batch.",
        ur: "سپلائر کو واپس بھیجا جانے والا مخصوص بیچ اور مقدار منتخب کریں۔",
      },
      {
        term: { en: "Debit Note / Supplier Ledger Adjustment", ur: "ڈیبٹ نوٹ اور سپلائر کھاتہ ایڈجسٹمنٹ" },
        type: "Formula",
        en: "Automatically reduces your Supplier Payable balance (`Payable − Return Total`) or logs a cash refund received from the distributor.",
        ur: "سپلائر کے واجب الادا کھاتے سے واپسی کی رقم خودکار کم کر دیتا ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Returning Near-Expiry Stock to Distributor", ur: "مثال: قریب ایکسپائری مال ڈسٹری بیوٹر کو واپس بھیجنا" },
      en: "Example: You return **5 packs** of a near-expiry batch worth **Rs. 4,000** to *Premier Distributors*.\n• Batch stock decreases by **−5 packs**\n• Your payable to Premier Distributors drops by **Rs. 4,000**\n• Print the **Debit Note PDF** and hand it to their deliveryman.",
      ur: "مثال: آپ نے **4,000 روپے** کے 5 پیک سپلائر کو واپس بھیجے:\n• اسٹاک سے 5 پیک کم ہو جائیں گے\n• سپلائر کے کھاتے سے 4,000 روپے کم ہو جائیں گے۔",
    },
    impactMatrix: {
      stock: { en: "Deducts returned units from the selected Product Batch (−).", ur: "منتخب بیچ کے اسٹاک سے واپس کردہ یونٹس کم کرتا ہے۔" },
      ledger: { en: "Debits Supplier Ledger, reducing your net payable balance.", ur: "سپلائر کو واجب الادا رقم (Payable) میں کمی کرتا ہے۔" },
      treasury: { en: "Records Cash Inflow if the supplier refunds cash immediately.", ur: "نقد واپسی ملنے پر کیش ڈراور میں اضافہ کرتا ہے۔" },
      gl: { en: "Dr Accounts Payable (`2000`), Cr Inventory Asset (`1200`).", ur: "سپلائر پے ایبل کو ڈیبٹ اور انوینٹری کو کریڈٹ کرتا ہے۔" },
    },
    commonMistake: {
      en: "Check the Supplier's 'Expiry Return Policy' and 'Intimation Status' on the Suppliers screen before their return window closes!",
      ur: "سپلائر کی ایکسپائری واپسی کی مدت ختم ہونے سے پہلے انٹیمیشن اور پرچیز ریٹرن مکمل کریں۔",
    },
  },

  "/stock-adjustments": {
    fields: [
      {
        term: { en: "Adjustment Type (Add + vs. Deduct −)", ur: "ایڈجسٹمنٹ کی قسم (اضافہ + یا کمی −)" },
        type: "Field",
        en: "Choose **Add (+)** for found stock or initial opening stock, or **Deduct (−)** for shelf shrinkage, internal clinic use, or unrecorded breakage.",
        ur: "ملنے والے یا ابتدائی اسٹاک کے لیے **Add (+)** اور کم نکلنے والے مال کے لیے **Deduct (−)** منتخب کریں۔",
      },
      {
        term: { en: "Reason / Audit Note", ur: "ایڈجسٹمنٹ کی وجہ (Audit Note)" },
        type: "Field",
        en: "Mandatory explanation recorded permanently in the adjustment register so managers can audit why stock was changed manually.",
        ur: "اسٹاک کم یا زیادہ کرنے کی لازمی وجہ جو آڈٹ ریکارڈ میں محفوظ رہتی ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Correcting Shelf Count Discrepancy", ur: "مثال: شیلف گنتی کا فرق درست کرنا" },
      en: "If the system shows **22 units** of a syrup but the shelf has **20 units** due to 2 broken bottles, create a **Deduct (−2)** adjustment with reason `Shelf breakage`.",
      ur: "اگر کمپیوٹر میں **22 بوتلیں** ہیں مگر شیلف پر **20** ہیں (2 ٹوٹ گئیں)، تو **Deduct (−2)** ایڈجسٹمنٹ ڈالیں۔",
    },
    impactMatrix: {
      stock: { en: "Directly increases (+) or decreases (−) batch inventory.", ur: "بیچ اسٹاک میں فوری اضافہ یا کمی کرتا ہے۔" },
      ledger: { en: "No customer or supplier ledger impact.", ur: "گاہک یا سپلائر کے کھاتے پر اثر نہیں پڑتا۔" },
      treasury: { en: "No cash or bank impact.", ur: "کیش یا بینک پر کوئی اثر نہیں۔" },
      gl: { en: "Adjusts Inventory Asset (`1200`) against Inventory Shrinkage/Adjustment.", ur: "انوینٹری اثاثے اور ایڈجسٹمنٹ اکاؤنٹ کو اپڈیٹ کرتا ہے۔" },
    },
    commonMistake: {
      en: "Never use Stock Adjustments for supplier deliveries — use Purchase Invoices so Supplier Payables and batch costs stay accurate.",
      ur: "سپلائر سے آنے والے نئے مال کے لیے اسٹاک ایڈجسٹمنٹ استعمال نہ کریں بلکہ Purchase Invoice بنائیں۔",
    },
  },

  "/stocktake-sessions": {
    fields: [
      {
        term: { en: "Audit Scope (All / Category / Brand / Rack)", ur: "آڈٹ کا دائرہ کار (پوری دکان، برانڈ یا ریک)" },
        type: "Field",
        en: "Choose whether to count the entire store or audit one specific Rack/Shelf or Brand at a time during working hours.",
        ur: "پوری دکان یا ایک وقت میں صرف ایک ریک/شیلف یا برانڈ کی گنتی کرنے کا انتخاب کریں۔",
      },
      {
        term: { en: "Blind Count Mode", ur: "بلائنڈ کاؤنٹ موڈ (کمپیوٹر اسٹاک چھپانا)" },
        type: "Field",
        en: "Hides system expected quantities from counting staff so they must count physical units on the shelf honestly instead of copying system numbers.",
        ur: "گنتی کرنے والے اسٹاف سے کمپیوٹر کا اسٹاک چھپاتا ہے تاکہ وہ شیلف پر موجود اصل مال ایمانداری سے گنیں۔",
      },
      {
        term: { en: "Variance Review & 1-Click Reconcile", ur: "فرق کا جائزہ (Variance Review) اور منظوری" },
        type: "Formula",
        en: "`Stock Variance = Physical Counted Qty − System Expected Qty`. Approving the session automatically posts stock adjustments for all variances.",
        ur: "`اسٹاک کا فرق = اصل گنتی − کمپیوٹر اسٹاک`۔ منظوری دینے پر تمام فرق خودکار طور پر برابر ہو جاتے ہیں۔",
      },
    ],
    example: {
      title: { en: "Example: Weekly Rack Audit", ur: "مثال: ہفتہ وار ریک آڈٹ" },
      en: "Start a Stocktake scoped to **Rack A-1** with **Blind Count ON** → Staff scan/enter counts → Manager opens **Variance Review**, sees `-3 tablets` shortage worth Rs. 45, and clicks **Approve & Reconcile**.",
      ur: "**Rack A-1** کا بلائنڈ آڈٹ شروع کریں → اسٹاف اصل گنتی درج کرے گا → منیجر **Variance Review** میں فرق چیک کر کے **Approve** کرے گا تو اسٹاک خودکار برابر ہو جائے گا۔",
    },
    impactMatrix: {
      stock: { en: "Updates live batch stock to match physical counts upon approval.", ur: "منظوری کے بعد کمپیوٹر اسٹاک کو اصل گنتی کے مطابق اپڈیٹ کرتا ہے۔" },
      ledger: { en: "No customer or supplier ledger impact.", ur: "گاہک یا سپلائر کھاتے پر کوئی اثر نہیں۔" },
      treasury: { en: "No cash or bank impact.", ur: "کیش یا بینک پر کوئی اثر نہیں۔" },
      gl: { en: "Posts inventory surplus/shortage valuation adjustments.", ur: "اسٹاک کی کمی بیشی کی مالیاتی انٹری پوسٹ کرتا ہے۔" },
    },
    commonMistake: {
      en: "Remember that entering counts in a Stocktake Session saves them as draft — live stock only updates when you click 'Approve / Finalize' on the Review screen.",
      ur: "گنتی درج کرنے کے بعد Review اسکرین سے 'Approve / Finalize' کرنا لازمی ہے تبھی لائیو اسٹاک اپڈیٹ ہو گا۔",
    },
  },

  "/stock-disposals": {
    fields: [
      {
        term: { en: "Quarantine Holding vs. Finalized Disposal", ur: "قرنطینہ (Quarantine) بمقابلہ مستقل تلفی (Disposal)" },
        type: "Field",
        en: "**Quarantine** immediately locks expired/damaged units out of POS selling while awaiting inspection or supplier return. **Finalize Disposal** permanently writes them off.",
        ur: "**Quarantine** خراب یا ایکسپائر مال کو فوری طور پر سیل ہونے سے روک دیتا ہے، جبکہ **Finalize Disposal** اسے مستقل طور پر ضائع (Write-off) کر دیتا ہے۔",
      },
      {
        term: { en: "Official Disposal Certificate (PDF)", ur: "آفیشل ڈسپوزل سرٹیفکیٹ (PDF)" },
        type: "Action",
        en: "Prints a regulatory destruction certificate showing Batch #, Expiry, Cause, Disposal Method, Cost Value, and Witness signatures for drug inspector audits.",
        ur: "ڈرگ انسپکٹر اور ٹیکس آڈٹ کے لیے بیچ نمبر، وجہ اور مالیت سمیت باقاعدہ ڈسپوزل سرٹیفکیٹ پرنٹ کرتا ہے۔",
      },
    ],
    example: {
      title: { en: "Example: Isolating Expired Syrup Batches", ur: "مثال: ایکسپائر شدہ سیرپ کو سیل سے روکنا" },
      en: "When a batch expires and cannot be returned to the distributor, move it to **Quarantine / Disposal** immediately so no cashier can scan or sell it at the counter.",
      ur: "جب کوئی بیچ ایکسپائر ہو جائے اور سپلائر کو واپس نہ ہو سکے تو اسے فوراً **Quarantine / Disposal** میں ڈالیں تاکہ کاؤنٹر پر غلطی سے بھی فروخت نہ ہو سکے۔",
    },
    impactMatrix: {
      stock: { en: "Immediately removes quarantined/disposed units from salable stock (−).", ur: "قابلِ فروخت اسٹاک سے فوری طور پر یونٹس نکال دیتا ہے۔" },
      ledger: { en: "No customer or supplier ledger impact.", ur: "گاہک یا سپلائر کھاتے پر کوئی اثر نہیں۔" },
      treasury: { en: "No cash or bank movement.", ur: "کیش یا بینک پر کوئی اثر نہیں۔" },
      gl: { en: "Dr Inventory Write-Off / Expiry Loss, Cr Inventory Asset (`1200`).", ur: "ایکسپائری نقصان (Expense) کو ڈیبٹ اور انوینٹری کو کریڈٹ کرتا ہے۔" },
    },
    commonMistake: {
      en: "If a quarantined batch is later cleared or accepted back by the supplier, click 'Restore to Stock' before creating a Purchase Return.",
      ur: "اگر قرنطینہ میں رکھا گیا مال سپلائر واپس لینے پر راضی ہو جائے تو اسے Restore کر کے Purchase Return ڈال لیں۔",
    },
  },
};

// Map aliases so sub-routes inherit rich blueprint fields & examples
SCREEN_BLUEPRINTS["/suppliers/create"] = SCREEN_BLUEPRINTS["/suppliers"];
SCREEN_BLUEPRINTS["/suppliers/:id/edit"] = SCREEN_BLUEPRINTS["/suppliers"];
SCREEN_BLUEPRINTS["/products/create"] = SCREEN_BLUEPRINTS["/products"];
SCREEN_BLUEPRINTS["/products/:id/edit"] = SCREEN_BLUEPRINTS["/products"];
SCREEN_BLUEPRINTS["/purchase-invoices/:id"] = SCREEN_BLUEPRINTS["/purchase-invoices/create"];
SCREEN_BLUEPRINTS["/purchase-invoices/:id/edit"] = SCREEN_BLUEPRINTS["/purchase-invoices/create"];
SCREEN_BLUEPRINTS["/sale-invoices"] = SCREEN_BLUEPRINTS["/sale-invoices/create/retail"];
SCREEN_BLUEPRINTS["/sale-invoices/create/wholesale"] = SCREEN_BLUEPRINTS["/sale-invoices/create/retail"];
SCREEN_BLUEPRINTS["/sale-invoices/:id"] = SCREEN_BLUEPRINTS["/sale-invoices/create/retail"];
SCREEN_BLUEPRINTS["/sale-invoices/:id/edit"] = SCREEN_BLUEPRINTS["/sale-invoices/create/retail"];
SCREEN_BLUEPRINTS["/sale-returns/create"] = SCREEN_BLUEPRINTS["/sale-returns"];
SCREEN_BLUEPRINTS["/sale-returns/:id/edit"] = SCREEN_BLUEPRINTS["/sale-returns"];
SCREEN_BLUEPRINTS["/purchase-returns/create"] = SCREEN_BLUEPRINTS["/purchase-returns"];
SCREEN_BLUEPRINTS["/purchase-returns/:id/edit"] = SCREEN_BLUEPRINTS["/purchase-returns"];
SCREEN_BLUEPRINTS["/stock-adjustments/create"] = SCREEN_BLUEPRINTS["/stock-adjustments"];
SCREEN_BLUEPRINTS["/stock-adjustments/:id"] = SCREEN_BLUEPRINTS["/stock-adjustments"];
SCREEN_BLUEPRINTS["/stocktake-sessions/create"] = SCREEN_BLUEPRINTS["/stocktake-sessions"];
SCREEN_BLUEPRINTS["/stocktake-sessions/:id"] = SCREEN_BLUEPRINTS["/stocktake-sessions"];
SCREEN_BLUEPRINTS["/stocktake-sessions/:id/review"] = SCREEN_BLUEPRINTS["/stocktake-sessions"];
SCREEN_BLUEPRINTS["/stock-disposals/create"] = SCREEN_BLUEPRINTS["/stock-disposals"];

/**
 * Contextual overlays when a modal is currently open on the screen.
 */
export const MODAL_CONTEXT_GUIDES = {
  cash_drawer: {
    id: "modal_cash_drawer",
    badge: { en: "Open Modal: Cash Register / Drawer", ur: "کھلا ہوا موڈل: کیش رجسٹر / ڈراور" },
    title: { en: "Cash Register Popup Guide", ur: "کیش رجسٹر پاپ اپ گائیڈ" },
    summary: {
      en: "You are viewing the quick Cash Register popup. Here you can check your live **Expected Cash in Drawer** (`Opening Float + Cash In − Cash Out`), record manual **Cash In / Out**, view the **Detailed Audit Report**, or **Close & Reconcile** the shift.",
      ur: "آپ اس وقت کیش رجسٹر پاپ اپ دیکھ رہے ہیں۔ یہاں آپ گلے کا متوقع کیش چیک کر سکتے ہیں، مینوئل کیش ان/آؤٹ درج کر سکتے ہیں، یا شفٹ کلوز کر سکتے ہیں۔",
    },
  },
  accounts: {
    id: "modal_accounts",
    badge: { en: "Open Modal: Financial Accounts & Transfers", ur: "کھلا ہوا موڈل: فنانشل اکاؤنٹس اور ٹرانسفر" },
    title: { en: "Financial Accounts Popup Guide", ur: "فنانشل اکاؤنٹس پاپ اپ گائیڈ" },
    summary: {
      en: "Manage your **Cash in Hand (Drawer)**, **Bank Accounts**, and **Mobile Wallets**, or use **Transfer** to move cash between your counter drawer and bank account.",
      ur: "یہاں سے کیش ڈراور، بینک اور موبائل والٹ اکاؤنٹس کے بیلنس دیکھیں یا ایک اکاؤنٹ سے دوسرے میں رقم ٹرانسفر کریں۔",
    },
  },
};

/**
 * Universal ERP Term & Control Dictionary used by the "Point & Explain (?)" Element Inspector.
 * Every entry explains the specific clicked UI control, button, field, column, or page section in detail.
 */
export const UNIVERSAL_CONTROL_DICTIONARY = [
  // =========================================================================
  // 1. INVOICE & TABLE ROW CONTROLS / COLUMNS
  // =========================================================================
  {
    keywords: ["del", "remove row", "delete row", "remove item"],
    exactTokens: ["del", "×", "✕"],
    title: { en: "Delete / Remove Item Row (DEL)", ur: "سطر ختم کرنے کا بٹن (DEL)" },
    en: "**What this control does:** Immediately removes this specific medicine/item row from the current invoice table.\n**How it works:**\n• Recalculates **Gross Total**, **Tax**, **Discount**, and **Net Payable** automatically as soon as the row is removed.\n• Does **not** affect saved stock or ledgers until the invoice is saved.",
    ur: "**یہ بٹن کیا کرتا ہے:** بل کی اس مخصوص سطر (Row) کو فوری طور پر فہرست سے خارج کر دیتا ہے۔\n**طریقہ کار:**\n• سطر ختم ہوتے ہی کل رقم، ڈسکاؤنٹ اور ٹیکس خودکار طور پر دوبارہ کیلکولیٹ ہو جاتے ہیں۔",
  },
  {
    keywords: ["add row", "new row", "add item", "+ item", "insert row"],
    exactTokens: ["+"],
    shortcut: {
      keys: "↓ (Down Arrow on last row) / Enter",
      en: "Press `↓` (Down Arrow) on the last row or `Enter` at the end of a row to auto-add a new item row",
      ur: "آخری سطر پر `↓` (نیچے والا تیر) یا سطر کے آخر میں `Enter` دبائیں",
    },
    title: { en: "Add New Item Row Button (+)", ur: "نئی سطر شامل کرنے کا بٹن (+)" },
    en: "**What this button does:** Appends a fresh blank line item row at the bottom of the invoice table so you can add another product to the same bill.\n**How it works:** Clicking `+` or pressing `↓` (Down Arrow) from the last row immediately creates and focuses the new row.",
    ur: "**یہ بٹن کیا کرتا ہے:** بل میں ایک اور دوا یا پراڈکٹ شامل کرنے کے لیے ٹیبل کے آخر میں نئی خالی سطر کھولتا ہے۔",
  },
  {
    keywords: ["drag to reorder", "move brand", "move item", "invoice-drag-handle"],
    shortcut: {
      keys: "↑ / ↓ Arrow Keys (when focused) or Drag",
      en: "Focus the `⠿` grip and press `↑` / `↓` Arrow Keys (or drag with mouse) to move the row or brand group",
      ur: "`⠿` بٹن پر کلک کر کے کی بورڈ کے `↑` / `↓` تیر کے بٹن دبائیں یا ماؤس سے کھینچیں",
    },
    title: { en: "Row / Brand Reorder Handle (⠿)", ur: "سطر یا برانڈ کی ترتیب بدلنے کا ہینڈل (⠿)" },
    en: "**What this handle does:** Lets you manually reorder individual product rows or entire brand groups inside the invoice table.\n**Why it matters:** When you reorder items on a Purchase Invoice, Karobar can remember that supplier's item sequence for future bills.",
    ur: "**یہ ہینڈل کیا کرتا ہے:** بل کے اندر کسی بھی دوا کی سطر یا پورے برانڈ گروپ کو اوپر نیچے ترتیب دینے کے کام آتا ہے۔",
  },
  {
    keywords: ["pack.q", "pack_quantity", "pack qty", "pack quantity"],
    exactTokens: ["pack.q"],
    shortcut: {
      keys: "Enter (Next Field) · ↑ / ↓ (Prev / Next Row)",
      en: "`Enter` moves to Purchase Price (`Pack.P`) · `↑` / `↓` jumps to the same column in the row above/below",
      ur: "`Enter` اگلے خانے (`Pack.P`) میں جانے کے لیے · `↑` / `↓` اوپر یا نیچے والی سطر میں جانے کے لیے",
    },
    title: { en: "Pack Quantity Input (Pack.Q)", ur: "ڈبوں کی تعداد کا خانہ (Pack.Q)" },
    en: "**What this input does:** Enters the number of **full boxes/packs** purchased or billed on this line.\n**Automatic Calculation:**\n• Automatically multiplies by `PSize` to fill **Unit Quantity (`Unit.Q = Pack.Q × PSize`)**.\n• Multiplies by `Pack.P` (Pack Purchase Price) to update the row's **Sub Total** immediately.",
    ur: "**یہ خانہ کیا کرتا ہے:** خریدے گئے پورے ڈبوں (Packs) کی تعداد درج کرتا ہے۔\n**خودکار حساب:** یہ خودکار طور پر `PSize` سے ضرب دے کر کھلے یونٹس (`Unit.Q`) اور سطر کی کل رقم (`Sub Total`) نکالتا ہے۔",
  },
  {
    keywords: ["unit.q", "unit_quantity", "unit qty", "loose qty"],
    exactTokens: ["unit.q"],
    shortcut: {
      keys: "Tab / Shift + Tab",
      en: "`Tab` moves to the next input · `Shift + Tab` moves back",
      ur: "`Tab` اگلے خانے میں جانے کے لیے",
    },
    title: { en: "Total Unit Quantity (Unit.Q — Loose Units)", ur: "کل کھلے یونٹس کی تعداد (Unit.Q)" },
    en: "**What this input shows/captures:** The total number of individual/loose units (`Pack.Q × PSize`, or loose units entered directly).\n**How it works:** Editing `Pack.Q` auto-calculates `Unit.Q`, or you can type loose units directly here when purchasing/selling partial packs.",
    ur: "**یہ خانہ کیا کرتا ہے:** کل کھلی گولیوں یا یونٹس کی تعداد دکھاتا یا درج کرتا ہے (`Pack.Q × PSize`)۔",
  },
  {
    keywords: ["pack.p", "pack_purchase_price", "pack purchase"],
    exactTokens: ["pack.p"],
    shortcut: {
      keys: "Enter (Next Field) · ↑ / ↓ (Prev / Next Row)",
      en: "`Enter` moves to Discount (`Disc%`) · `↑` / `↓` jumps to the row above/below",
      ur: "`Enter` اگلے خانے (`Disc%`) میں جانے کے لیے · `↑` / `↓` اوپر یا نیچے والی سطر کے لیے",
    },
    title: { en: "Pack Purchase Price (Pack.P — Cost per Box)", ur: "ڈبے کی قیمتِ خرید (Pack.P)" },
    en: "**What this input does:** Enters the supplier's purchase price (Trade Price) for **1 full pack/box**.\n**Automatic Calculation:**\n• Divides by `PSize` to automatically compute **Unit Purchase Price (`Unit.P = Pack.P ÷ PSize`)**.\n• Compares against `Pack.S` (Sale Price) to compute your live **Retail Margin % (`Margin%`)** and **Average Cost (`Avg`)**.",
    ur: "**یہ خانہ کیا کرتا ہے:** ایک پورے ڈبے کی قیمتِ خرید درج کرتا ہے۔ اس سے فی یونٹ قیمتِ خرید (`Unit.P`)، منافع فیصد (`Margin%`) اور `Sub Total` خودکار نکلتے ہیں۔",
  },
  {
    keywords: ["unit.p", "unit_purchase_price", "unit purchase"],
    exactTokens: ["unit.p"],
    title: { en: "Unit Purchase Price (Unit.P — Cost per Loose Unit)", ur: "فی یونٹ قیمتِ خرید (Unit.P)" },
    en: "**What this field shows/captures:** The purchase cost of **1 single loose tablet/unit** (`Pack.P ÷ PSize`).\n**How it works:** Automatically calculated when you enter `Pack.P`, or you can type a unit cost directly and Karobar will back-calculate `Pack.P`.",
    ur: "**یہ خانہ کیا کرتا ہے:** ایک کھلی گولی یا یونٹ کی قیمتِ خرید (`Pack.P ÷ PSize`) جو خودکار طریقے سے نکلتی ہے۔",
  },
  {
    keywords: ["pbonus", "pack_bonus", "pack bonus"],
    exactTokens: ["pbonus"],
    shortcut: {
      keys: "Enter (Next Field) · ↑ / ↓ (Prev / Next Row)",
      en: "`Enter` moves to Retail Sale Price (`Pack.S`) · `↑` / `↓` moves between rows",
      ur: "`Enter` اگلے خانے (`Pack.S`) میں جانے کے لیے · `↑` / `↓` سطر بدلنے کے لیے",
    },
    title: { en: "Pack Bonus (PBonus — Free Boxes from Supplier)", ur: "بونس ڈبے (PBonus — مفت ڈبے)" },
    en: "**What this input does:** Enters the number of **free bonus packs/boxes** given by the supplier on this item line.\n**Accounting & Stock Effect:**\n• Automatically converts to free units (`UBonus = PBonus × PSize`) and adds them to batch stock.\n• Does **not** increase the bill's `Sub Total`, which reduces your effective landed cost (`Avg`) and boosts your profit margin.",
    ur: "**یہ خانہ کیا کرتا ہے:** سپلائر کی طرف سے ملنے والے مفت ڈبوں (Bonus Packs) کی تعداد درج کرتا ہے جو بل کی رقم بڑھائے بغیر اسٹاک میں جمع ہو جاتے ہیں۔",
  },
  {
    keywords: ["ubonus", "unit_bonus", "unit bonus"],
    exactTokens: ["ubonus"],
    title: { en: "Unit Bonus (UBonus — Free Loose Units)", ur: "بونس یونٹس (UBonus — مفت کھلے یونٹس)" },
    en: "**What this input does:** Records the total free bonus units (`PBonus × PSize` or loose bonus units) received at zero extra bill cost.",
    ur: "**یہ خانہ کیا کرتا ہے:** سپلائر کی طرف سے ملنے والے کل مفت کھلے یونٹس (Bonus Units) درج یا ظاہر کرتا ہے۔",
  },
  {
    keywords: ["pack.s", "pack_sale_price", "pack sale"],
    exactTokens: ["pack.s"],
    shortcut: {
      keys: "Enter (Next Row / Field) · ↑ / ↓ (Prev / Next Row)",
      en: "`Enter` moves to the next product row (or Wholesale Price if enabled) · `↑` / `↓` moves between rows",
      ur: "`Enter` اگلی سطر کے پراڈکٹ خانے میں جانے کے لیے · `↑` / `↓` سطر بدلنے کے لیے",
    },
    title: { en: "Pack Retail Sale Price / MRP (Pack.S)", ur: "ڈبے کی قیمتِ فروخت (Pack.S / MRP)" },
    en: "**What this input does:** Sets the retail selling price (MRP) for **1 full pack/box**.\n**Automatic Calculation:**\n• Divides by `PSize` to automatically fill **Unit Sale Price (`Unit.S = Pack.S ÷ PSize`)** charged at POS.\n• Immediately calculates your live **Profit Margin % (`Margin%`)** against the purchase cost.",
    ur: "**یہ خانہ کیا کرتا ہے:** ایک پورے ڈبے کی ریٹیل قیمتِ فروخت (MRP) مقرر کرتا ہے جس سے فی گولی قیمت (`Unit.S`) اور منافع (`Margin%`) خودکار نکل آتے ہیں۔",
  },
  {
    keywords: ["unit.s", "unit_sale_price", "unit sale"],
    exactTokens: ["unit.s"],
    title: { en: "Unit Retail Sale Price (Unit.S — Price per Loose Unit)", ur: "فی یونٹ قیمتِ فروخت (Unit.S)" },
    en: "**What this field shows/captures:** The retail selling price charged to customers for **1 single loose unit/tablet** (`Pack.S ÷ PSize`).",
    ur: "**یہ خانہ کیا دکھاتا ہے:** گاہک کو فروخت کی جانے والی ایک کھلی گولی یا یونٹ کی قیمت (`Pack.S ÷ PSize`)۔",
  },
  {
    keywords: ["w.s.pack", "whole_sale_pack_price", "wholesale pack"],
    exactTokens: ["w.s.pack"],
    shortcut: {
      keys: "Enter (Next Field) · ↑ / ↓ (Prev / Next Row)",
      en: "`Enter` moves to Wholesale Unit Price (`W.S.Unit`) · `↑` / `↓` moves between rows",
      ur: "`Enter` اگلے خانے میں جانے کے لیے · `↑` / `↓` سطر بدلنے کے لیے",
    },
    title: { en: "Wholesale Pack Price (W.S.Pack)", ur: "ہول سیل ڈبہ قیمت (W.S.Pack)" },
    en: "**What this input does:** Sets the wholesale selling price for 1 full pack when billing wholesale customers, and auto-calculates `W.S.Unit` and `W.S.Mrg%`.",
    ur: "**یہ خانہ کیا کرتا ہے:** ہول سیل گاہکوں کے لیے ایک ڈبے کی قیمتِ فروخت مقرر کرتا ہے۔",
  },
  {
    keywords: ["w.s.unit", "whole_sale_unit_price", "wholesale unit"],
    exactTokens: ["w.s.unit"],
    title: { en: "Wholesale Unit Price (W.S.Unit)", ur: "ہول سیل فی یونٹ قیمت (W.S.Unit)" },
    en: "**What this input does:** Shows or sets the per-unit wholesale selling price (`W.S.Pack ÷ PSize`).",
    ur: "**یہ خانہ کیا کرتا ہے:** ہول سیل میں فی یونٹ قیمتِ فروخت دکھاتا یا مقرر کرتا ہے۔",
  },
  {
    keywords: ["margin%", "margin %", "retail margin", "w.s.mrg%"],
    exactTokens: ["margin%", "w.s.mrg%"],
    title: { en: "Profit Margin Percentage (Margin% — Auto-Calculated)", ur: "منافع کا تناسب (Margin% — خودکار حساب)" },
    en: "**What this read-only column shows:** The live profit margin percentage earned on this product row based on your net purchase cost vs. selling price.\n**Why it matters:** Karobar validates that `Margin% > 0` before saving a Purchase Invoice so you never accidentally set a selling price below cost.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** قیمتِ خرید اور قیمتِ فروخت کے فرق سے نکلنے والا منافع (فیصد میں)۔ سسٹم نقصان سے بچانے کے لیے منفی مارجن پر الرٹ دیتا ہے۔",
  },
  {
    keywords: ["avg", "avg_price", "average unit cost", "average price"],
    exactTokens: ["avg"],
    title: { en: "Effective Average Unit Cost (Avg — Auto-Calculated)", ur: "فی یونٹ اوسط لاگت (Avg — خودکار حساب)" },
    en: "**What this read-only column shows:** Your true net landed cost per unit after factoring in line discounts and free bonus units:\n**Formula:** `Row Sub Total ÷ (Billed Units + Bonus Units) = Avg Cost per Unit`.",
    ur: "**یہ خانہ کیا کرتا ہے:** ڈسکاؤنٹ اور مفت بونس یونٹس شامل کرنے کے بعد ایک یونٹ کی اصل اوسط لاگت (`Sub Total ÷ Total Units`)۔",
  },
  {
    keywords: ["bill amt", "invoice_amount"],
    shortcut: {
      keys: "Enter or Tab (Jump to First Product Row)",
      en: "Press `Enter` or `Tab` after typing the paper Bill Amount to jump straight to the first **Product** row",
      ur: "کاغذی بل کی رقم لکھ کر `Enter` یا `Tab` دبانے سے فوکس سیدھا پہلے پراڈکٹ خانے پر چلا جاتا ہے",
    },
    title: { en: "Supplier Paper Bill Amount (Bill Amt — Verification Field)", ur: "سپلائر کے کاغذی بل کی رقم (Bill Amt)" },
    en: "**What this field does:** Enter the grand total printed on the supplier's physical paper invoice.\n**Built-in Audit Check:**\n• Karobar compares your typed `Bill Amt` against the calculated `Total Amount` in real time.\n• If the difference (`Diff`) is greater than Rs. 5, Karobar blocks saving and alerts you so data-entry mistakes are caught before posting!",
    ur: "**یہ خانہ کیا کرتا ہے:** سپلائر کے کاغذی بل پر لکھی کل رقم یہاں درج کریں۔ سسٹم اس کا موازنہ آپ کے درج کردہ آئٹمز کے ٹوٹل سے کرتا ہے تاکہ بلنگ کی کوئی غلطی نہ رہے۔",
  },
  {
    keywords: ["diff", "difference"],
    exactTokens: ["diff"],
    title: { en: "Bill Verification Difference (Diff — Auto Check)", ur: "بل کی رقم کا فرق (Diff — خودکار پڑتال)" },
    en: "**What this read-only box shows:** The live difference between the supplier's paper `Bill Amt` and your calculated `Total Amount` (`Diff = Bill Amt − Total Amount`).\n• **`0.00`:** Your entered rows match the supplier's bill 100%.\n• **Red Non-Zero Value:** Indicates a quantity, rate, discount, or tax mismatch that needs checking (must be within ±Rs. 5 to save).",
    ur: "**یہ خانہ کیا دکھاتا ہے:** سپلائر کے کاغذی بل (`Bill Amt`) اور سسٹم کے کیلکولیٹڈ ٹوٹل (`Total Amount`) کا فرق۔ `0.00` کا مطلب ہے کہ بل بالکل درست میچ ہو گیا ہے۔",
  },
  {
    keywords: ["posted #", "posted_number", "auto on save"],
    title: { en: "System Posted Invoice Number (Posted # — Auto)", ur: "سسٹم انوائس نمبر (Posted # — خودکار)" },
    en: "**What this read-only field shows:** The unique, sequential system voucher number (e.g., `PI-00124` or `SI-00450`).\n**Why it says `Auto`:** Assigned automatically by the server at the exact moment you press **Save (`Alt+S`)** so two open billing tabs never collide on the same number.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** سسٹم کی طرف سے دیا جانے والا منفرد بل نمبر جو بل محفوظ کرتے وقت (`Alt+S`) خودکار طور پر جاری ہوتا ہے۔",
  },
  {
    keywords: ["relink paid to total", "🔗"],
    exactTokens: ["🔗"],
    title: { en: "Relink Paid Amount to Total Amount (🔗)", ur: "ادا شدہ رقم کو کل رقم کے برابر کرنے کا بٹن (🔗)" },
    en: "**What this button does:** Resets `Total Paid` back to match the full `Total Amount` and re-enables automatic syncing if you previously edited `Total Paid` manually.",
    ur: "**یہ بٹن کیا کرتا ہے:** ایک کلک سے `Total Paid` (ادا شدہ رقم) کو دوبارہ بل کی کل رقم (`Total Amount`) کے برابر کر دیتا ہے۔",
  },
  {
    keywords: ["arrange products", "apply sort", "arrangement"],
    title: { en: "Product & Brand Row Arrangement Control", ur: "پراڈکٹس اور برانڈز کی ترتیب (Arrange Products)" },
    en: "**What this control does:** Automatically sorts the items in your invoice table (e.g., by **Saved Supplier Order**, **Brand A→Z**, **Product Name A→Z**, or **Custom Manual Drag Order**).",
    ur: "**یہ کنٹرول کیا کرتا ہے:** بل میں موجود ادویات کو سپلائر کی محفوظ کردہ ترتیب، برانڈ یا نام کے لحاظ سے خودکار ترتیب دیتا ہے۔",
  },
  {
    keywords: ["debit"],
    exactTokens: ["debit"],
    shortcut: {
      keys: "Alt + D (Select Debit) · Alt + T (Toggle Debit ↔ Credit)",
      en: "Press `Alt + D` to switch directly to **Debit (Cash)** mode, or `Alt + T` to toggle between Debit and Credit",
      ur: "`Alt + D` دبا کر فوری نقد (Debit) موڈ منتخب کریں، یا `Alt + T` سے موڈ تبدیل کریں",
    },
    title: { en: "Debit (Immediate Cash / Bank Settlement) Mode", ur: "ڈیبٹ / نقد ادائیگی موڈ (Debit)" },
    en: "**What this mode button does:** Sets the invoice to **Debit (Cash / Immediate Payment)** mode.\n**Accounting Impact:**\n• Auto-links `Total Paid / Received` to the full `Total Amount`.\n• Deducts or deposits the payment immediately in your selected **Cash Drawer / Bank Account** upon saving.",
    ur: "**یہ بٹن کیا کرتا ہے:** بل کو نقد ادائیگی (Debit) موڈ پر سیٹ کرتا ہے جس سے بل کی کل رقم خودکار طور پر وصول/ادا شدہ خانے میں آ جاتی ہے اور کیش ڈراور/بینک سے منسلک ہوتی ہے۔",
  },
  {
    keywords: ["psize", "pack size", "units per pack", "pack_size"],
    title: { en: "Pack Size (PSize — Units per Box)", ur: "پیک سائز (PSize — ڈبے میں یونٹس کی تعداد)" },
    en: "**What this column/field shows:** The number of loose tablets, capsules, strips, or vials inside **1 full pack/box** of this product.\n**How it works in calculations:**\n• Example: `PSize = 30` means 1 box contains 30 tablets.\n• Helps Karobar convert between full-box purchases and loose-unit retail sales accurately.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** ایک پورے ڈبے (Pack) میں موجود کھلی گولیوں، کیپسول یا اسٹرپس کی تعداد۔\n**استعمال:** مثلاً `30` کا مطلب ہے کہ ایک ڈبے میں 30 گولیاں ہیں، جس سے کھلی فروخت اور اسٹاک کا حساب درست رہتا ہے۔",
  },
  {
    keywords: ["avail", "available stock", "in stock", "current stock", "on hand", "stock qty"],
    title: { en: "Available Stock Indicator (Avail)", ur: "موجودہ دستیاب اسٹاک (Avail)" },
    en: "**What this column/badge shows:** The live, real-time physical quantity currently available in your inventory for the selected product and batch.\n**Why it matters:**\n• Prevents billing more units than you actually have on the shelf.\n• Updates automatically whenever a Purchase, Sale, Return, or Stock Audit is posted.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** منتخب کردہ دوا اور بیچ کے اس وقت اسٹور میں موجود اصل یونٹس کی تعداد۔\n**اہمیت:** یہ بلنگ کے دوران دستیاب اسٹاک سے زیادہ مال فروخت ہونے سے روکتا ہے۔",
  },
  {
    keywords: ["bonus", "free unit", "bonus qty", "scheme"],
    title: { en: "Bonus Quantity (Free Trade Scheme Units)", ur: "بونس یونٹس (کمپنی کی طرف سے مفت اسٹاک)" },
    en: "**What this input does:** Records free promotional units received from a supplier (or given to a customer) alongside billed quantity.\n**Accounting & Stock Effect:**\n• Increases physical batch stock by `Qty + Bonus`.\n• Charges **Rs. 0** for the bonus units on the invoice (`Sub Total` is calculated only on billed `Qty × Price`), which automatically lowers your effective average unit cost.",
    ur: "**یہ خانہ کیا کرتا ہے:** سپلائر کی اسکیم کے تحت ملنے والے مفت (Bonus) یونٹس درج کرنے کے لیے استعمال ہوتا ہے۔\n**اسٹاک اور بل پر اثر:**\n• یہ یونٹس مفت اسٹاک میں جمع ہو جاتے ہیں لیکن بل کی رقم (`Sub Total`) میں ان کی کوئی قیمت شامل نہیں ہوتی، جس سے فی یونٹ اوسط لاگت کم ہو جاتی ہے۔",
  },
  {
    keywords: ["wht%", "wht %", "wht", "withholding", "section 236"],
    title: { en: "Withholding Tax (WHT % / Amount)", ur: "ودہولڈنگ ٹیکس (WHT %)" },
    en: "**What this field does:** Applies advance Withholding Tax (`WHT %`) on the line item or invoice under FBR rules.\n**Calculation:**\n• Adds the calculated WHT amount into the line's `Sub Total` and final `Net Payable`.\n• Tracks withholding tax separately for supplier/tax compliance reports.",
    ur: "**یہ خانہ کیا کرتا ہے:** اس آئٹم یا بل پر لاگو ہونے والا ودہولڈنگ ٹیکس (WHT فیصد) شمار کرتا ہے اور اسے کل واجب الادا رقم (`Sub Total`) میں شامل کرتا ہے۔",
  },
  {
    keywords: ["tax%", "tax %", "gst%", "gst %", "sales tax", "tax amount"],
    title: { en: "Sales Tax / GST Field (Tax %)", ur: "سیلز ٹیکس / جی ایس ٹی (Tax %)" },
    en: "**What this field does:** Applies Sales Tax / GST percentage to this product line.\n**Calculation:**\n• `Tax Amount = (Taxable Line Amount × Tax %) ÷ 100`\n• Automatically adds the tax into the row's `Sub Total` and the bill's total tax summary.",
    ur: "**یہ خانہ کیا کرتا ہے:** اس پراڈکٹ پر لاگو ہونے والا سیلز ٹیکس (فیصد) شمار کر کے سطر کے `Sub Total` اور بل کے کل ٹیکس میں جمع کرتا ہے۔",
  },
  {
    keywords: ["disc%", "disc %", "discount %", "line discount", "disc amount", "trade discount"],
    title: { en: "Line Discount Control (Disc % / Rs.)", ur: "ڈسکاؤنٹ / رعایت کا خانہ (Disc %)" },
    en: "**What this field does:** Deducts a percentage or flat rupee discount from this specific item row.\n**Calculation:**\n• `Discount = (Qty × Price) × (Disc % ÷ 100)`\n• Immediately reduces the row's `Sub Total` and updates the total discount shown at the bottom of the bill.",
    ur: "**یہ خانہ کیا کرتا ہے:** اس مخصوص دوا یا آئٹم کی قیمت پر فیصد کے حساب سے رعایت (Discount) کم کرتا ہے اور فوری طور پر `Sub Total` کو اپڈیٹ کرتا ہے۔",
  },
  {
    keywords: ["sub total", "subtotal", "line total", "net line", "row total", "amount"],
    title: { en: "Row Sub-Total (Auto-Calculated Line Total)", ur: "سطر کی کل رقم (Sub Total — خودکار حساب)" },
    en: "**What this read-only box shows:** The final calculated amount for this single item row after applying quantity, price, discount, and taxes.\n**Live Formula:**\n`(Qty × Unit Price) − Line Discount + Sales Tax + WHT = Row Sub Total`\n*(Note: Bonus units are added to stock for free and do not increase this Sub Total.)*",
    ur: "**یہ خانہ کیا دکھاتا ہے:** اس ایک سطر کی حتمی رقم جو خودکار طریقے سے کیلکولیٹ ہوتی ہے۔\n**فارمولا:**\n`(تعداد × قیمت) − ڈسکاؤنٹ + ٹیکس + WHT = Sub Total`",
  },
  {
    keywords: ["fefo", "batch", "batch no", "batch #", "lot no"],
    title: { en: "Batch Number & FEFO Selector", ur: "بیچ نمبر اور FEFO سیلیکٹر (Batch)" },
    en: "**What this control does:** Identifies the exact manufacturing lot/batch number for this medicine.\n**How it works:**\n• **On Purchase:** Type the new batch number printed on the medicine box so stock is tracked separately by lot.\n• **On Sale / POS:** Click to pick from existing in-stock batches. Karobar automatically prioritizes **FEFO (First-Expired, First-Out)** so the batch expiring soonest sells first.",
    ur: "**یہ خانہ کیا کرتا ہے:** دوا کا مخصوص بیچ نمبر (Batch No) منتخب یا درج کرتا ہے۔\n• **خریداری پر:** ڈبے پر لکھا نیا بیچ نمبر درج کریں۔\n• **فروخت پر:** سسٹم خودکار طور پر **FEFO** اصول کے تحت وہ بیچ پہلے منتخب کرتا ہے جس کی ایکسپائری قریب ہو۔",
  },
  {
    keywords: ["expiry", "exp date", "expiration", "valid thru"],
    title: { en: "Batch Expiry Date Control", ur: "دوا کی تاریخِ تنسیخ (Expiry Date)" },
    en: "**What this control shows/captures:** The expiration date of the selected medicine batch.\n**Why it is critical:**\n• Powers automatic **Near-Expiry Alerts**, **FEFO sorting** during sales, and **Supplier Expiry Intimation** deadlines.\n• Blocks accidental sale of already-expired batches at the POS counter.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** اس بیچ کے ایکسپائر ہونے کی تاریخ۔\n**اہمیت:** اس تاریخ کی بنیاد پر سسٹم قریب ایکسپائری الرٹس، سپلائر انٹیمیشن اور ایکسپائر شدہ دوا کی فروخت روکنے کا کام کرتا ہے۔",
  },
  {
    keywords: ["purchase price", "cost price", "trade price", "unit cost", "tp", "rate"],
    title: { en: "Purchase / Cost Price (Unit Rate)", ur: "قیمتِ خرید / لاگت (Purchase Price)" },
    en: "**What this field does:** Sets the per-unit purchase cost (Trade Price / Invoice Rate) charged by the supplier before discounts and taxes.\n**How it works:**\n• Multiplies with billed `Qty` to compute the row's base cost.\n• Updates the batch's landed cost for accurate **Gross Profit** and **Inventory Valuation** reporting.",
    ur: "**یہ خانہ کیا کرتا ہے:** سپلائر کی طرف سے ایک یونٹ یا ڈبے کی قیمتِ خرید درج کرتا ہے۔ اس سے بل کی رقم اور منافع (Profit Margin) کا درست حساب نکلتا ہے۔",
  },
  {
    keywords: ["sale price", "retail price", "mrp", "selling price"],
    title: { en: "Retail Sale Price / MRP", ur: "قیمتِ فروخت / ریٹیل قیمت (Sale Price)" },
    en: "**What this field does:** Defines or applies the per-unit selling price charged to customers at POS / Sale Invoice.\n**How it works:**\n• On **Purchase / Product Form**, setting this updates the default retail price for the batch.\n• On **Sale Invoice**, it multiplies by `Qty` to calculate customer bill amount and compares against cost price to protect your profit margin.",
    ur: "**یہ خانہ کیا کرتا ہے:** گاہک کو فروخت کرنے کی فی یونٹ ریٹیل قیمت (MRP / Sale Price) مقرر یا لاگو کرتا ہے۔",
  },
  {
    keywords: ["qty", "quantity", "billed qty", "return qty", "units"],
    title: { en: "Quantity Input Field (Qty)", ur: "تعداد کا خانہ (Qty / Quantity)" },
    en: "**What this input does:** Enters the number of paid/billed units being purchased, sold, returned, or transferred on this line.\n**Immediate Effect:**\n• Multiplies by `Price` to update `Sub Total` in real time.\n• Directly adds to (Purchase/Sale Return) or deducts from (Sale/Purchase Return) physical batch inventory upon saving.",
    ur: "**یہ خانہ کیا کرتا ہے:** خریدے، بیچے یا واپس کیے جانے والے یونٹس کی تعداد درج کرتا ہے۔ تعداد بدلنے سے `Sub Total` اور اسٹاک فوری اپڈیٹ ہوتے ہیں۔",
  },

  // =========================================================================
  // 2. INVOICE HEADER, PAYMENT MODE & SUMMARY FOOTER CONTROLS
  // =========================================================================
  {
    keywords: ["cash", "credit", "payment mode", "sale type", "purchase type", "payment type"],
    exactTokens: ["cash", "credit"],
    title: { en: "Payment Mode Selector (Cash vs. Credit / Udhar)", ur: "طریقہ ادائیگی (نقد Cash بمقابلہ ادھار Credit)" },
    en: "**What this toggle/selector controls:** Determines how this invoice affects your Cash Drawer vs. Party Ledger:\n• **Cash Mode:** Marks the bill as paid immediately and posts the cash movement straight into your active **Cash Drawer / Payment Account**.\n• **Credit (Udhar) Mode:** Posts the unpaid balance to the selected **Customer's Receivable Ledger** or **Supplier's Payable Ledger**.",
    ur: "**یہ بٹن کیا کنٹرول کرتا ہے:**\n• **نقد (Cash):** بل کی رقم فوری طور پر کیش ڈراور یا منتخب اکاؤنٹ میں درج ہوتی ہے۔\n• **ادھار (Credit):** بقایا رقم خودکار طور پر گاہک یا سپلائر کے کھاتے (Ledger) میں چلی جاتی ہے۔",
  },
  {
    keywords: ["gross total", "gross amount", "items total", "total before"],
    title: { en: "Gross Total (Sum of All Item Rows)", ur: "خام کل رقم (Gross Total)" },
    en: "**What this summary box shows:** The combined total of all item rows in the table before bill-level extra charges or overall bill discounts are applied.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** تمام آئٹم سطروں کا مجموعہ (بل کے مجموعی ڈسکاؤنٹ یا اضافی اخراجات سے پہلے کی رقم)۔",
  },
  {
    keywords: ["extra charge", "freight", "loading", "delivery charge", "other charges", "shipping"],
    title: { en: "Extra Charges / Freight & Delivery Input", ur: "اضافی اخراجات / کرایہ وبلٹی (Extra Charges)" },
    en: "**What this field does:** Adds bill-level charges (such as freight, delivery, cold-chain packing, or handling fees) on top of the invoice total.\n**Calculation:** `Grand Total = Items Sub-Total − Bill Discount + Extra Charges`.",
    ur: "**یہ خانہ کیا کرتا ہے:** بل میں کرایہ، ڈلیوری یا پیکنگ جیسے اضافی اخراجات جمع کرتا ہے جس سے کل واجب الادا رقم بڑھ جاتی ہے۔",
  },
  {
    keywords: ["net payable", "grand total", "final total", "net total", "bill total", "total payable", "net amount"],
    title: { en: "Net Payable / Grand Total Display", ur: "حتمی واجب الادا رقم (Grand Total / Net Payable)" },
    en: "**What this summary card shows:** The final, net invoice amount after all item quantities, line discounts, GST/WHT taxes, bill-level discounts, and extra charges have been calculated.\n**Formula:** `Sum of Row Sub-Totals − Overall Bill Discount + Extra Charges = Net Payable`.",
    ur: "**یہ کارڈ کیا دکھاتا ہے:** تمام آئٹمز، ڈسکاؤنٹ، ٹیکس اور اضافی چارجز کے بعد بل کی حتمی واجب الادا رقم۔",
  },
  {
    keywords: ["paid amount", "received amount", "cash received", "tendered", "amount paid", "paid rs"],
    title: { en: "Paid / Received Cash Input", ur: "وصول شدہ یا ادا شدہ نقد رقم (Paid / Received)" },
    en: "**What this input does:** Records the exact cash/bank amount actually paid to the supplier or received from the customer right now on this invoice.\n**How it works:**\n• If `Paid = Net Payable`: The bill is **Fully Settled**.\n• If `Paid < Net Payable` (Partial Payment): The paid portion goes to your Cash/Bank account, and the remaining balance automatically posts to the party's **Credit (Udhar) Ledger**.\n• On POS, if `Received > Net Payable`, the system calculates the **Change Due** to return to the customer.",
    ur: "**یہ خانہ کیا کرتا ہے:** بل کے وقت موقع پر وصول کی گئی یا ادا کی گئی نقد رقم درج کرتا ہے۔\n• اگر کم رقم لکھی جائے تو بقایا رقم خودکار طور پر کھاتے (ادھار) میں درج ہو جاتی ہے۔",
  },
  {
    keywords: ["change due", "change back", "remaining balance", "balance due", "due amount"],
    title: { en: "Remaining Balance / Change Due Indicator", ur: "بقایا رقم / واپسی بقایا (Remaining / Change Due)" },
    en: "**What this read-only indicator shows:**\n• **If Customer Paid Extra:** Shows the exact **Change to Return** (`Cash Received − Net Bill`).\n• **If Partial or Credit Bill:** Shows the **Remaining Unpaid Balance** (`Net Bill − Paid Amount`) that will be posted to the party's ledger.",
    ur: "**یہ خانہ کیا دکھاتا ہے:**\n• گاہک سے زیادہ نقدی ملنے پر واپس کرنے والے پیسے (Change Due)۔\n• ادھار یا جزوی ادائیگی کی صورت میں کھاتے میں جانے والی بقایا رقم۔",
  },
  {
    keywords: ["payment account", "deposit to", "paid from", "cash account", "bank account", "wallet"],
    title: { en: "Payment Account Selector (Cash Drawer / Bank / Wallet)", ur: "ادائیگی کا اکاؤنٹ (کیش ڈراور / بینک / والٹ)" },
    en: "**What this dropdown does:** Selects which financial account receives or pays the money for this transaction (e.g., **Counter Cash Drawer**, **Meezan Bank**, **JazzCash / EasyPaisa**).\n**Why it matters:** Ensures your physical cash drawer reconciliation and bank ledger balances stay 100% accurate.",
    ur: "**یہ ڈراپ ڈاؤن کیا کرتا ہے:** یہ منتخب کرتا ہے کہ رقم کس اکاؤنٹ (کیش ڈراور، بینک اکاؤنٹ یا جیز کیش/ایزی پیسہ) میں جمع ہو گی یا نکلے گی۔",
  },
  {
    keywords: ["save & print", "save and print", "f9", "post & print"],
    title: { en: "Save & Print Receipt Button (F9)", ur: "محفوظ اور پرنٹ کریں (Save & Print — F9)" },
    en: "**What this button does:** Validates and posts the transaction (updating stock, cash drawer, and ledgers) and **immediately opens the thermal/A4 print dialog** for the customer or supplier receipt.\n**Keyboard Shortcut:** Press `F9` from anywhere on the billing screen.",
    ur: "**یہ بٹن کیا کرتا ہے:** بل کو محفوظ کر کے اسٹاک اور کھاتے اپڈیٹ کرتا ہے اور ساتھ ہی رسید پرنٹ کرنے کے لیے پرنٹر ڈائیلاگ کھول دیتا ہے۔ شارٹ کٹ: `F9`۔",
  },
  {
    keywords: ["save invoice", "save purchase", "save sale", "save product", "save changes", "submit", "f10", "save bill", "complete sale"],
    exactTokens: ["save", "submit", "update", "create"],
    title: { en: "Save / Post Record Button (F10)", ur: "ریکارڈ محفوظ کرنے کا بٹن (Save — F10)" },
    en: "**What this button does:** Validates all required fields on this form and permanently saves the record to the database.\n**What happens when clicked:**\n• On **Invoices / Returns:** Atomically updates batch quantities, Cash Drawer / Bank balance, and Party Ledger.\n• On **Master Forms (Product / Supplier / Customer):** Saves the profile so it is immediately available across all billing screens.",
    ur: "**یہ بٹن کیا کرتا ہے:** فارم کے تمام ضروری خانے چیک کرنے کے بعد ریکارڈ کو مستقل طور پر سسٹم میں محفوظ کرتا ہے اور متعلقہ اسٹاک یا کھاتوں کو اپڈیٹ کرتا ہے۔",
  },
  {
    keywords: ["hold", "f8", "park bill", "recall"],
    title: { en: "Hold / Recall Bill Button (F8)", ur: "بل ہولڈ کرنے کا بٹن (Hold Bill — F8)" },
    en: "**What this button does:** Temporarily parks the current unfinished customer cart in memory so you can bill the next customer in line without losing your typed items.\n**How to resume:** Click the Held Bills badge/list to restore the parked cart with one click.",
    ur: "**یہ بٹن کیا کرتا ہے:** موجودہ گاہک کا ادھورا بل عارضی طور پر محفوظ کر کے اگلے گاہک کی بلنگ کرنے کی سہولت دیتا ہے جسے بعد میں دوبارہ کھولا جا سکتا ہے۔",
  },
  {
    keywords: ["clear", "reset", "cancel", "discard"],
    exactTokens: ["clear", "reset", "cancel"],
    title: { en: "Clear / Reset / Cancel Button", ur: "فارم صاف یا منسوخ کرنے کا بٹن (Clear / Cancel)" },
    en: "**What this button does:** Discards unsaved inputs in the current form or closes the active modal without changing any database records, stock, or ledgers.",
    ur: "**یہ بٹن کیا کرتا ہے:** بغیر محفوظ کیے موجودہ فارم کے خانوں کو صاف کرتا ہے یا کھلی ہوئی ونڈو کو بند کر دیتا ہے۔",
  },
  {
    keywords: ["invoice #", "invoice no", "bill #", "bill no", "reference #", "ref no", "voucher #", "po #"],
    title: { en: "Invoice / Reference Number Field", ur: "انوائس نمبر / بل ریفرنس نمبر" },
    en: "**What this field shows/captures:**\n• **System Invoice #:** The unique sequential tracking number generated by Karobar ERP for audit and return lookup.\n• **Supplier Invoice / Ref #:** On Purchase Invoices, enter the distributor's printed paper bill number here so you can match physical bills during supplier audits.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** بل کا منفرد انوائس نمبر یا سپلائر کے کاغذی بل کا ریفرنس نمبر جس سے مستقبل میں بل تلاش یا آڈٹ کیا جاتا ہے۔",
  },
  {
    keywords: ["remarks", "notes", "narration", "description", "comment", "memo"],
    title: { en: "Remarks / Narration / Notes Field", ur: "تفصیل / نوٹس کا خانہ (Remarks / Notes)" },
    en: "**What this field does:** Stores optional reference notes, delivery instructions, doctor/patient references, or voucher explanations alongside this transaction.\n**Where it appears:** Printed on invoices/vouchers and shown in the **Account & Party Ledger** narration column.",
    ur: "**یہ خانہ کیا کرتا ہے:** اس بل یا واؤچر کے ساتھ اضافی یادداشت، حوالہ یا تفصیل محفوظ کرتا ہے جو کھاتے (Ledger) اور پرنٹ میں نظر آتی ہے۔",
  },

  // =========================================================================
  // 3. PRODUCT, FORMULATION, BARCODE, SUPPLIER & INVENTORY CONTROLS
  // =========================================================================
  {
    keywords: ["formulation", "generic", "salt", "active ingredient", "composition"],
    title: { en: "Medicine Formulation / Generic Salt Field", ur: "دوا کا فارمولیشن / جینرک سالٹ (Formulation)" },
    en: "**What this field does:** Stores the active pharmaceutical ingredient / generic chemical salt and strength (e.g., `Paracetamol 500mg` or `Amoxicillin + Clavulanic Acid`).\n**Why it is super useful:**\n• Lets cashiers search for **substitute brands** with the exact same salt when a requested brand is out of stock.",
    ur: "**یہ خانہ کیا کرتا ہے:** دوا کا اصل کیمیائی فارمولا یا سالٹ (مثلاً `Paracetamol 500mg`) محفوظ کرتا ہے، جس کی مدد سے کسی برانڈ کے ختم ہونے پر متبادل دوا باآسانی تلاش کی جا سکتی ہے۔",
  },
  {
    keywords: ["barcode", "sku", "item code", "scan barcode", "ean", "upc"],
    title: { en: "Barcode / SKU Scanner Field", ur: "بارکوڈ / اسکینر کوڈ کا خانہ (Barcode / SKU)" },
    en: "**What this field does:** Links the physical barcode printed on the medicine box (or an auto-generated internal code) to this product.\n**How it works:** Scanning this code with a USB/wireless barcode gun at the POS counter immediately adds the product to the bill.",
    ur: "**یہ خانہ کیا کرتا ہے:** دوا کے ڈبے پر موجود بارکوڈ کو محفوظ کرتا ہے یا اسکین کر کے فوری طور پر بل میں شامل کرتا ہے۔",
  },
  {
    keywords: ["reorder", "min stock", "minimum stock", "low stock", "alert level"],
    title: { en: "Reorder Level (Low-Stock Alert Threshold)", ur: "کم از کم اسٹاک الرٹ کی حد (Reorder Level)" },
    en: "**What this field does:** Sets the minimum safety stock quantity for this product.\n**How it works:** As soon as total available units drop at or below this number, Karobar flags the item in **Low Stock Alerts** and the **Reorder / Shortage Report** so you can order it on time.",
    ur: "**یہ خانہ کیا کرتا ہے:** دوا کے کم از کم اسٹاک کی حد مقرر کرتا ہے۔ اسٹاک اس تعداد سے کم ہوتے ہی سسٹم لو اسٹاک الرٹ جاری کر دیتا ہے۔",
  },
  {
    keywords: ["rack", "shelf", "bin", "cabinet", "location"],
    title: { en: "Rack / Shelf Location Field", ur: "ریک یا شیلف لوکیشن (Rack / Shelf)" },
    en: "**What this field does:** Records the physical store rack, cabinet, or shelf code (e.g., `Rack A-3`, `Fridge-1`) where this medicine is kept, helping staff locate items in seconds.",
    ur: "**یہ خانہ کیا کرتا ہے:** دکان میں دوا رکھنے کی جگہ (مثلاً `Rack A-3` یا `Fridge`) درج کرتا ہے تاکہ عملہ دوا فوری تلاش کر سکے۔",
  },
  {
    keywords: ["brand", "manufacturer", "company", "pharma"],
    title: { en: "Brand / Pharmaceutical Company Selector", ur: "برانڈ / فارما کمپنی کا انتخاب (Brand)" },
    en: "**What this control does:** Links or filters products by their pharmaceutical manufacturer/brand (e.g., GSK, Getz, Abbott, Sami) for brand-wise stock and sales analysis.",
    ur: "**یہ کنٹرول کیا کرتا ہے:** دوا کو اس کی سازندہ کمپنی یا برانڈ سے منسلک کرتا ہے یا برانڈ کے لحاظ سے فہرست کو فلٹر کرتا ہے۔",
  },
  {
    keywords: ["category", "dosage form", "product type"],
    title: { en: "Product Category / Dosage Form Selector", ur: "کیٹیگری / دوا کی قسم (Category)" },
    en: "**What this control does:** Classifies the item into its group (e.g., Tablets, Capsules, Syrups, Injections, Surgical, Cosmetics) for organized reporting and tax/discount rules.",
    ur: "**یہ کنٹرول کیا کرتا ہے:** پراڈکٹ کی کیٹیگری (مثلاً گولیاں، سیرپ، انجیکشن یا سرجیکل) منتخب یا فلٹر کرتا ہے۔",
  },
  {
    keywords: ["intimat", "انٹیمیشن"],
    title: { en: "Supplier Expiry Intimation Status & Action", ur: "سپلائر ایکسپائری انٹیمیشن اسٹیٹس" },
    en: "**What this control does:** Tracks and marks whether you have officially notified the supplier/distributor about near-expiry batches within their policy window (e.g., 3 months before expiry).\n**Why it matters:** Distributors often refuse expired stock returns if prior intimation was not recorded on time.",
    ur: "**یہ کنٹرول کیا کرتا ہے:** یہ دکھاتا اور محفوظ کرتا ہے کہ آیا آپ نے قریب ایکسپائری ادویات کی اطلاع مقررہ وقت پر سپلائر کو دے دی ہے یا نہیں تاکہ واپسی کلیم رد نہ ہو۔",
  },
  {
    keywords: ["before expiry", "after expiry", "return policy", "expiry policy"],
    title: { en: "Supplier Expiry Return Policy Rule", ur: "سپلائر ایکسپائری واپسی پالیسی" },
    en: "**What this control does:** Specifies how many months before or after expiration this supplier accepts stock returns.\n**Example:** `3 Months Before Expiry` means batches expiring in December are flagged for intimation/return by September.",
    ur: "**یہ کنٹرول کیا کرتا ہے:** یہ بتاتا ہے کہ سپلائر ایکسپائری سے کتنے ماہ پہلے یا بعد میں مال واپس لیتا ہے۔ سسٹم اسی اصول کے تحت الرٹ جاری کرتا ہے۔",
  },
  {
    keywords: ["blind count", "physical count", "counted qty", "audit qty"],
    title: { en: "Physical / Blind Stock Count Input", ur: "فزیکل اسٹاک گنتی کا خانہ (Physical Count)" },
    en: "**What this input does:** Enter the actual number of units you physically counted on the shelf during a stock audit.\n**How it works:** After submission, Karobar compares your physical count against system stock to compute **Surplus / Shortage Variance** and post an audit adjustment.",
    ur: "**یہ خانہ کیا کرتا ہے:** شیلف پر موجود اصل گنے گئے یونٹس کی تعداد درج کرتا ہے جس کا سسٹم اسٹاک سے موازنہ کر کے کمی یا بیشی نکالتا ہے۔",
  },
  {
    keywords: ["quarantine", "disposal", "write off", "write-off", "damaged"],
    title: { en: "Quarantine / Stock Write-Off Control", ur: "قرنطینہ / ضائع شدہ اسٹاک (Quarantine / Disposal)" },
    en: "**What this control does:** Moves expired or damaged batches out of sellable POS inventory into quarantine or records a permanent financial write-off loss.",
    ur: "**یہ کنٹرول کیا کرتا ہے:** ایکسپائر یا خراب شدہ اسٹاک کو قابلِ فروخت انوینٹری سے الگ (Quarantine) کرتا ہے یا نقصان کے طور پر خارج کرتا ہے۔",
  },

  // =========================================================================
  // 4. CASH REGISTER, SHIFT RECONCILIATION & ACCOUNTING CONTROLS
  // =========================================================================
  {
    keywords: ["opening float", "opening balance", "initial float", "starting cash"],
    title: { en: "Opening Balance / Starting Shift Float", ur: "اوپننگ بیلنس / ابتدائی کیش فلوٹ" },
    en: "**What this field shows/captures:**\n• **On Cash Register:** The starting physical cash placed in the counter drawer when opening a shift.\n• **On Customer / Supplier / Account Profiles:** The historical balance carried forward before starting Karobar ERP.",
    ur: "**یہ خانہ کیا دکھاتا ہے:** کیش ڈراور میں شفٹ کے آغاز پر گلے میں رکھی گئی ابتدائی نقدی، یا گاہک/سپلائر کا پرانا ابتدائی بقایا۔",
  },
  {
    keywords: ["expected balance", "expected drawer", "expected cash", "system expected"],
    title: { en: "Expected Drawer Cash Balance Card", ur: "متوقع کیش ڈراور بیلنس (Expected Cash)" },
    en: "**What this metric card shows:** The exact amount of physical cash that *should* currently be inside your counter drawer according to all transactions recorded in this shift.\n**Live Formula:** `Opening Float + Total Cash Inflows (Sales/Receipts) − Total Cash Outflows (Purchases/Expenses/Returns) = Expected Cash`.",
    ur: "**یہ کارڈ کیا دکھاتا ہے:** سسٹم کے مطابق اس وقت آپ کے کیش گلے میں موجود ہونی والی متوقع نقد رقم۔\n**فارمولا:** `اوپننگ فلوٹ + کل کیش آمد − کل کیش اخراج = متوقع کیش بیلنس`۔",
  },
  {
    keywords: ["actual physical", "actual count", "closing balance", "variance", "discrepancy", "surplus", "shortage"],
    title: { en: "Actual Cash Count & Shift Variance (Over / Short)", ur: "اصل کیش گنتی اور فرق (Variance)" },
    en: "**What this control does:** Compares the physical cash counted at shift close against the system's Expected Drawer Cash.\n**Formula:** `Variance = Actual Counted Cash − Expected Drawer Cash`\n• `0.00` = **Balanced**\n• `+ Positive` = **Cash Surplus** (extra cash in drawer)\n• `− Negative` = **Cash Shortage** (missing cash in drawer)",
    ur: "**یہ کنٹرول کیا کرتا ہے:** گلے کی اصل گنی گئی رقم کا سسٹم کے متوقع کیش سے موازنہ کر کے فرق نکالتا ہے:\n• `0` = حساب بالکل برابر ہے\n• `+` = گلے میں اضافی رقم (Surplus)\n• `−` = گلے میں رقم کی کمی (Shortage)",
  },
  {
    keywords: ["z-report", "z report", "shift report"],
    title: { en: "Official Shift Z-Report Button (PDF / Print)", ur: "شفٹ کی آفیشل Z-Report کا بٹن" },
    en: "**What this button does:** Generates a complete, auditable PDF summary of the shift including Opening Float, Category Inflows/Outflows, Expected vs. Actual Cash, Variance, and chronological transaction log.",
    ur: "**یہ بٹن کیا کرتا ہے:** پوری شفٹ کی مکمل آڈٹ رپورٹ (PDF) تیار کرتا ہے جس میں ابتدائی کیش، آمد و اخراج اور تمام لین دین شامل ہوتے ہیں۔",
  },
  {
    keywords: ["denomination", "5000", "1000", "notes", "coins"],
    title: { en: "PKR Note & Coin Denomination Counter", ur: "پاکستانی نوٹوں اور سکوں کا کیلکولیٹر" },
    en: "**What this tool does:** Lets you type how many physical notes of Rs. 5000, 1000, 500, 100, 50, 20, 10 and coins are in your drawer and automatically sums the exact physical cash total.",
    ur: "**یہ ٹول کیا کرتا ہے:** نوٹوں (5000، 1000، 500 وغیرہ) کی تعداد لکھنے سے کل نقد رقم خودکار طریقے سے بغیر کسی غلطی کے گن لیتا ہے۔",
  },
  {
    keywords: ["udhar", "receivable", "credit limit", "payable", "party balance", "ledger balance", "current balance"],
    title: { en: "Party Ledger Balance & Credit Status", ur: "کھاتہ بیلنس اور کریڈٹ اسٹیٹس" },
    en: "**What this field/card shows:** The live outstanding balance owed by this customer (`Receivable / Udhar`) or owed to this supplier (`Payable`).\n**How it updates:** Increases automatically on credit invoices and decreases immediately when a cash/bank receipt or payment voucher is recorded.",
    ur: "**یہ کارڈ کیا دکھاتا ہے:** گاہک سے وصول طلب ادھار (Receivable) یا سپلائر کو واجب الادا رقم (Payable) کا موجودہ بیلنس۔",
  },

  // =========================================================================
  // 5. SEARCH, FILTER, EXPORT, PRINT, TABLE ACTIONS & TOPBAR SHORTCUTS
  // =========================================================================
  {
    keywords: ["search", "filter", "find", "type to search", "quick search"],
    title: { en: "Live Search & Filter Input", ur: "تلاش اور فلٹر کا خانہ (Search / Filter)" },
    en: "**What this search box does:** Instantly filters the visible records on this screen by matching product name, generic salt, barcode, invoice number, or party name as you type.",
    ur: "**یہ خانہ کیا کرتا ہے:** ٹائپ کرتے ہی نام، فارمولے، بارکوڈ، انوائس نمبر یا پارٹی کے نام کے مطابق فہرست کو فوری فلٹر کرتا ہے۔",
  },
  {
    keywords: ["from date", "to date", "start date", "end date", "date range", "period", "invoice date", "date"],
    title: { en: "Transaction / Filter Date Picker", ur: "تاریخ منتخب کرنے کا خانہ (Date Picker)" },
    en: "**What this date control does:**\n• **On Invoices & Vouchers:** Sets the official accounting date on which this transaction is recorded in ledgers and reports.\n• **On Reports & Lists:** Filters the displayed transactions and totals to the selected date range.",
    ur: "**یہ تاریخ کا خانہ کیا کرتا ہے:** بل یا واؤچر کی سرکاری تاریخ درج کرتا ہے، یا رپورٹس کو منتخب کردہ تاریخوں کے درمیان فلٹر کرتا ہے۔",
  },
  {
    keywords: ["export", "excel", "csv", "download pdf", "download"],
    title: { en: "Export / Download Data Button (Excel / CSV / PDF)", ur: "ڈیٹا ایکسپورٹ اور ڈاؤن لوڈ بٹن (Export)" },
    en: "**What this button does:** Exports the currently filtered table rows and summary totals into a downloadable file (Excel, CSV, or PDF) for external sharing, CA/tax filing, or backup.",
    ur: "**یہ بٹن کیا کرتا ہے:** اسکرین پر موجود جدول اور ریکارڈز کو ایکسل (Excel)، CSV یا PDF فائل کی صورت میں ڈاؤن لوڈ کرتا ہے۔",
  },
  {
    keywords: ["print", "thermal", "a4 print"],
    exactTokens: ["print"],
    title: { en: "Print Receipt / Report Button", ur: "پرنٹ نکالنے کا بٹن (Print)" },
    en: "**What this button does:** Formats the selected invoice, barcode label, or report for printing on your connected thermal receipt printer or A4 laser printer.",
    ur: "**یہ بٹن کیا کرتا ہے:** منتخب بل، بارکوڈ اسٹیکر یا رپورٹ کو تھرمل یا A4 پرنٹر پر پرنٹ کرنے کے لیے تیار کرتا ہے۔",
  },
  {
    keywords: ["edit", "modify", "update row"],
    exactTokens: ["edit"],
    title: { en: "Edit Record Button", ur: "ریکارڈ میں تبدیلی کا بٹن (Edit)" },
    en: "**What this action button does:** Opens this specific record's details in edit mode so you can update its fields and save changes.",
    ur: "**یہ بٹن کیا کرتا ہے:** اس مخصوص ریکارڈ کی تفصیلات کو ترمیم (Edit) کے لیے کھولتا ہے تاکہ آپ اس میں تبدیلی کر سکیں۔",
  },
  {
    keywords: ["view", "details", "preview", "eye"],
    exactTokens: ["view", "details"],
    title: { en: "View Details / Preview Button", ur: "تفصیل دیکھنے کا بٹن (View Details)" },
    en: "**What this action button does:** Opens a complete read-only breakdown of this invoice, batch, or transaction without modifying any data.",
    ur: "**یہ بٹن کیا کرتا ہے:** اس بل یا ریکارڈ کی مکمل تفصیل دیکھنے کے لیے ونڈو کھولتا ہے۔",
  },
  {
    keywords: ["alt+c", "cash register", "cash drawer"],
    shortcut: {
      keys: "Alt + C",
      en: "Press `Alt + C` from anywhere in the app to open the Cash Register",
      ur: "کیش رجسٹر کھولنے کے لیے کہیں بھی `Alt + C` دبائیں",
    },
    title: { en: "Cash Register / Shift Drawer Shortcut (Alt+C)", ur: "کیش رجسٹر / گلے کا بٹن (Alt+C)" },
    en: "**What this topbar button does:** Opens the **Cash Register & Shift Reconciliation** screen (or press `Alt+C` anytime) to view live counter cash, record cash in/out, or close the shift with a Z-Report.",
    ur: "**یہ بٹن کیا کرتا ہے:** کیش رجسٹر (گلے کا حساب) کھولتا ہے جہاں آپ موجودہ کیش بیلنس دیکھ سکتے ہیں اور شفٹ کلوز کر سکتے ہیں۔ شارٹ کٹ: `Alt+C`۔",
  },
  {
    keywords: ["alt+a", "accounts hub", "chart of accounts"],
    shortcut: {
      keys: "Alt + A",
      en: "Press `Alt + A` from anywhere in the app to open the Accounts & Finance Hub",
      ur: "اکاؤنٹس ماڈیول کھولنے کے لیے کہیں بھی `Alt + A` دبائیں",
    },
    title: { en: "Accounts & Ledgers Shortcut (Alt+A)", ur: "اکاؤنٹس اور کھاتہ ہب بٹن (Alt+A)" },
    en: "**What this topbar button does:** Jumps directly to the **Accounts & Finance** module (`Alt+A`) to inspect cash/bank accounts, expenses, and financial statements.",
    ur: "**یہ بٹن کیا کرتا ہے:** براہِ راست اکاؤنٹس اور فنانس ماڈیول (`Alt+A`) کھولتا ہے جہاں بینک، کیش اور اخراجات کا مکمل حساب موجود ہے۔",
  },
];

/**
 * Resolves the exact `<th>` column header for a `<td>` or `<th>` cell, even in
 * multi-row `<thead>` tables with `rowSpan` / `colSpan` (such as Purchase Invoice).
 */
export function resolveTableColumnHeader(element) {
  const cell = element?.closest?.("td, th");
  if (!cell) return "";
  if (cell.tagName?.toLowerCase() === "th") {
    return (cell.innerText || "").replace(/\s+/g, " ").trim();
  }
  const table = cell.closest?.("table");
  if (!table) return "";

  const allThs = Array.from(table.querySelectorAll("thead th"));
  if (!allThs.length) return "";

  // 1. Try horizontal bounding-box alignment against the bottom-most matching `<th>` in `<thead>`
  const cellRect = cell.getBoundingClientRect?.();
  if (cellRect && cellRect.width > 0) {
    const centerX = cellRect.left + cellRect.width / 2;
    const matchingThs = allThs
      .map((th) => ({ th, rect: th.getBoundingClientRect?.() }))
      .filter(
        ({ rect }) =>
          rect &&
          rect.width > 0 &&
          centerX >= rect.left - 2 &&
          centerX <= rect.right + 2
      );
    if (matchingThs.length > 0) {
      // Pick the bottom-most `<th>` (the specific sub-column header rather than the group header)
      matchingThs.sort((a, b) => b.rect.top - a.rect.top);
      const bestText = (matchingThs[0].th.innerText || "").replace(/\s+/g, " ").trim();
      if (bestText) return bestText;
    }
  }

  // 2. Fallback to the last header row's `cellIndex` or `allThs[cell.cellIndex]`
  const lastHeaderRowThs = table.querySelectorAll("thead tr:last-child th");
  if (lastHeaderRowThs && lastHeaderRowThs[cell.cellIndex]) {
    return (lastHeaderRowThs[cell.cellIndex].innerText || "").replace(/\s+/g, " ").trim();
  }
  if (allThs[cell.cellIndex]) {
    return (allThs[cell.cellIndex].innerText || "").replace(/\s+/g, " ").trim();
  }
  return "";
}

/**
 * Extracts deep structural & live state information from a clicked DOM element
 * so `explainDomElement` explains the exact component, field, column, or section.
 */
function inspectElementAnatomy(element) {
  const tag = (element.tagName || "").toLowerCase();
  const typeAttr = (element.getAttribute?.("type") || "").toLowerCase();
  const roleAttr = (element.getAttribute?.("role") || "").toLowerCase();
  const ariaLabel = (element.getAttribute?.("aria-label") || "").trim();
  const titleAttr = (element.getAttribute?.("title") || "").trim();
  const placeholder = (element.getAttribute?.("placeholder") || "").trim();
  const nameAttr = (element.getAttribute?.("name") || "").trim();
  const isReadOnly =
    Boolean(element.readOnly) ||
    element.hasAttribute?.("readonly") ||
    Boolean(element.disabled) ||
    element.getAttribute?.("aria-readonly") === "true" ||
    element.classList?.contains("purchase-readonly-field") ||
    element.classList?.contains("sale-readonly-field");

  // 1. Resolve Table Column Header (`<th>`) if the element is inside a `<td>` or `<th>`
  const tableHeaderText = resolveTableColumnHeader(element);
  let tableRowNumber = null;
  const cell = element.closest?.("td, th");
  if (cell && cell.tagName?.toLowerCase() === "td") {
    const tr = cell.closest?.("tr");
    if (tr && tr.parentElement?.tagName?.toLowerCase() === "tbody") {
      const dataRows = Array.from(tr.parentElement.children).filter(
        (r) => !r.classList?.contains("purchase-invoice-brand-heading")
      );
      const idx = dataRows.indexOf(tr);
      if (idx >= 0) tableRowNumber = idx + 1;
    }
  }

  // 2. Resolve Specific Field Label (only from direct `<label>` or a compact field wrapper, NEVER a giant page wrapper)
  let fieldLabel = "";
  const closestLabel = element.closest?.("label");
  if (closestLabel) {
    fieldLabel = (closestLabel.innerText || "").replace(/\s+/g, " ").trim();
  } else if (element.id) {
    try {
      const forLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (forLabel) {
        fieldLabel = (forLabel.innerText || "").replace(/\s+/g, " ").trim();
      }
    } catch {
      // ignore invalid selector
    }
  }
  if (!fieldLabel) {
    let parent = element.parentElement;
    for (let depth = 0; depth < 3 && parent && parent !== document.body; depth++) {
      const rect = parent.getBoundingClientRect?.();
      const inputCount = parent.querySelectorAll?.("input, select, textarea").length || 0;
      if (rect && rect.height <= 125 && inputCount <= 2) {
        const lbl = parent.querySelector?.("label");
        if (lbl && lbl.innerText) {
          fieldLabel = lbl.innerText.replace(/\s+/g, " ").trim();
          break;
        }
      }
      parent = parent.parentElement;
    }
  }

  // 3. Determine Component Category & Badge
  let componentType = {
    en: "UI Component",
    ur: "اسکرین کنٹرول",
    kind: "section",
  };
  if (tag === "button" || roleAttr === "button" || roleAttr === "radio" || ["button", "submit", "reset"].includes(typeAttr)) {
    componentType = { en: "Action Button", ur: "ایکشن بٹن (Button)", kind: "button" };
  } else if (tag === "a" || roleAttr === "tab") {
    componentType = {
      en: roleAttr === "tab" ? "Tab Switcher" : "Navigation Link",
      ur: roleAttr === "tab" ? "ٹیب بٹن (Tab)" : "نیویگیشن لنک",
      kind: "link",
    };
  } else if (tag === "select" || roleAttr === "combobox" || element.classList?.contains("react-select__control")) {
    componentType = { en: "Dropdown Selector", ur: "ڈراپ ڈاؤن انتخاب (Dropdown)", kind: "select" };
  } else if (typeAttr === "checkbox" || typeAttr === "radio" || roleAttr === "switch") {
    componentType = { en: "Toggle / Checkbox", ur: "ٹوگل / چیک باکس", kind: "toggle" };
  } else if (tag === "input" || tag === "textarea") {
    if (isReadOnly) {
      componentType = {
        en: "Auto-Calculated / Read-Only Field",
        ur: "خودکار کیلکولیٹڈ خانہ (Read-Only)",
        kind: "readonly-input",
      };
    } else if (typeAttr === "date" || typeAttr === "month") {
      componentType = { en: "Date Picker Input", ur: "تاریخ کا خانہ (Date Input)", kind: "date-input" };
    } else if (typeAttr === "number") {
      componentType = { en: "Numeric Input Field", ur: "عددی اندراج کا خانہ (Number Input)", kind: "number-input" };
    } else {
      componentType = { en: "Editable Input Field", ur: "اندراج کا خانہ (Input Field)", kind: "text-input" };
    }
  } else if (tag === "th") {
    componentType = { en: "Table Column Header", ur: "ٹیبل کالم ہیڈر (Column)", kind: "th" };
  } else if (tag === "td") {
    componentType = { en: "Table Cell / Column Value", ur: "ٹیبل سیل ویلیو (Table Cell)", kind: "td" };
  } else if (isReadOnly) {
    componentType = {
      en: "Auto-Calculated / Read-Only Field",
      ur: "خودکار کیلکولیٹڈ خانہ (Read-Only)",
      kind: "readonly-input",
    };
  } else {
    const lines = (element.innerText || "")
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length >= 2 && lines.length <= 5 && lines.some((l) => /\d/.test(l))) {
      componentType = { en: "Summary / KPI Metric Card", ur: "سمری / معلوماتی کارڈ", kind: "card" };
    }
  }

  // 4. Extract Live Current Value / State on Screen
  let liveValue = "";
  if (tag === "select") {
    liveValue = element.selectedOptions?.[0]?.text?.trim() || element.value || "";
  } else if (tag === "input" || tag === "textarea") {
    if (typeAttr === "checkbox" || typeAttr === "radio") {
      liveValue = element.checked ? "Checked / Active" : "Unchecked / Off";
    } else {
      liveValue = String(element.value ?? "").trim();
    }
  } else if (tag === "td" || isReadOnly) {
    liveValue = (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60);
  }

  const ownText = (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const primaryLabel =
    fieldLabel ||
    tableHeaderText ||
    ariaLabel ||
    titleAttr ||
    placeholder ||
    ownText ||
    nameAttr.replace(/[_-]+/g, " ") ||
    componentType.en;

  return {
    tag,
    typeAttr,
    isReadOnly,
    componentType,
    tableHeaderText,
    tableRowNumber,
    fieldLabel,
    ariaLabel,
    titleAttr,
    placeholder,
    nameAttr,
    ownText,
    liveValue,
    primaryLabel: primaryLabel.replace(/\s+/g, " ").trim().slice(0, 75),
  };
}

/**
 * Resolves the exact keyboard shortcut (if any) for the clicked DOM control.
 */
export function resolveControlShortcut(element, anatomy, matchedEntry = null) {
  if (!element || !anatomy) return null;

  // 1. Dictionary entry with explicit shortcut metadata
  if (matchedEntry?.shortcut?.keys) {
    return matchedEntry.shortcut;
  }

  // 2. Explicit DOM shortcut attributes (`aria-keyshortcuts`, `data-shortcut`, `<kbd>`)
  const ariaKey = (
    element.getAttribute?.("aria-keyshortcuts") ||
    element.getAttribute?.("data-shortcut") ||
    ""
  ).trim();
  if (ariaKey) {
    return {
      keys: ariaKey,
      en: `Press \`${ariaKey}\` on your keyboard to trigger this control directly`,
      ur: `کی بورڈ سے براہِ راست چلانے کے لیے \`${ariaKey}\` دبائیں`,
    };
  }

  const kbdEl = element.querySelector?.("kbd");
  if (kbdEl && kbdEl.innerText?.trim()) {
    const kbdText = kbdEl.innerText.trim();
    return {
      keys: kbdText,
      en: `Press \`${kbdText}\` on your keyboard to trigger this action`,
      ur: `کی بورڈ شارٹ کٹ: \`${kbdText}\``,
    };
  }

  // 3. Parse shortcut pattern from button text or title (e.g., "(Alt+S)", "(F8)", "[F2]")
  const combinedLabel = `${anatomy.ownText} ${anatomy.titleAttr} ${anatomy.ariaLabel}`;
  const shortcutRegex = /\b(Alt\s*\+\s*[A-Z0-9]|Ctrl\s*\+\s*[A-Z0-9]|Shift\s*\+\s*Tab|F(?:[1-9]|1[0-2])|Esc)\b/i;
  const match = combinedLabel.match(shortcutRegex);
  if (match) {
    const keyStr = match[1].replace(/\s+/g, " ");
    return {
      keys: keyStr,
      en: `Press \`${keyStr}\` on your keyboard to activate this control`,
      ur: `کی بورڈ شارٹ کٹ: \`${keyStr}\``,
    };
  }

  // 4. Contextual Invoice / Table / Form Keyboard Navigation Shortcuts
  const lowerClues = `${anatomy.fieldLabel} ${anatomy.tableHeaderText} ${anatomy.ownText} ${anatomy.nameAttr} ${anatomy.ariaLabel}`.toLowerCase();

  // Save / Update / Create / Post buttons on invoices & forms
  if (
    anatomy.componentType.kind === "button" &&
    /\b(save|update invoice|create|complete sale|submit|post)\b/i.test(lowerClues)
  ) {
    return {
      keys: "Alt + S",
      en: "Press `Alt + S` from anywhere on the form to save/post immediately",
      ur: "فارم پر کہیں بھی رہتے ہوئے فوری محفوظ کرنے کے لیے `Alt + S` دبائیں",
    };
  }

  // Debit / Credit segmented buttons on Purchase & Sale Invoices
  if (anatomy.componentType.kind === "button" && /\bdebit\b/i.test(lowerClues)) {
    return {
      keys: "Alt + D (Debit) · Alt + T (Toggle)",
      en: "Press `Alt + D` to select Debit mode, or `Alt + T` to toggle between Debit and Credit",
      ur: "ڈیبٹ موڈ کے لیے `Alt + D` یا موڈ بدلنے کے لیے `Alt + T` دبائیں",
    };
  }
  if (anatomy.componentType.kind === "button" && /\bcredit\b/i.test(lowerClues)) {
    return {
      keys: "Alt + C (Credit) · Alt + T (Toggle)",
      en: "Press `Alt + C` to select Credit mode, or `Alt + T` to toggle between Debit and Credit",
      ur: "کریڈٹ (ادھار) موڈ کے لیے `Alt + C` یا موڈ بدلنے کے لیے `Alt + T` دبائیں",
    };
  }

  // Editable inputs inside a table row (Purchase Invoice, Sale Invoice, Returns, Stock Count)
  if (
    !anatomy.isReadOnly &&
    anatomy.tableHeaderText &&
    ["number-input", "text-input", "date-input", "select"].includes(anatomy.componentType.kind)
  ) {
    return {
      keys: "Enter (Next Field) · ↑ / ↓ (Prev / Next Row) · Shift + Tab (Back)",
      en: "`Enter` advances to the next column in this row · `↑` / `↓` jumps to the same column in the previous/next row (`↓` on the last row auto-adds a new row)",
      ur: "`Enter` اگلے کالم میں جانے کے لیے · `↑` / `↓` اوپر یا نیچے والی سطر میں جانے کے لیے",
    };
  }

  // Editable form inputs outside a table
  if (
    !anatomy.isReadOnly &&
    ["number-input", "text-input", "date-input"].includes(anatomy.componentType.kind)
  ) {
    return {
      keys: "Enter / Tab (Next Field) · Shift + Tab (Previous Field)",
      en: "Press `Enter` or `Tab` to move to the next field (`Shift + Tab` to go back)",
      ur: "اگلے خانے میں جانے کے لیے `Enter` یا `Tab` دبائیں",
    };
  }

  return null;
}

/**
 * Helper to build a live status footer for the inspected component so the user sees
 * its keyboard shortcut, table column, and current live value on screen.
 */
function buildLiveStatusBlock(anatomy, shortcut = null) {
  const partsEn = [];
  const partsUr = [];

  if (shortcut?.keys) {
    partsEn.push(
      `• **Keyboard Shortcut:** \`${shortcut.keys}\`${
        shortcut.en ? ` — ${shortcut.en}` : ""
      }`
    );
    partsUr.push(
      `• **کی بورڈ شارٹ کٹ:** \`${shortcut.keys}\`${
        shortcut.ur ? ` — ${shortcut.ur}` : ""
      }`
    );
  }

  if (anatomy.tableHeaderText) {
    partsEn.push(
      `• **Table Column:** \`${anatomy.tableHeaderText}\`${
        anatomy.tableRowNumber ? ` (Row #${anatomy.tableRowNumber})` : ""
      }`
    );
    partsUr.push(
      `• **ٹیبل کالم:** \`${anatomy.tableHeaderText}\`${
        anatomy.tableRowNumber ? ` (سطر نمبر ${anatomy.tableRowNumber})` : ""
      }`
    );
  }

  if (anatomy.liveValue !== "") {
    partsEn.push(
      `• **Current Value on Screen:** \`${anatomy.liveValue}\`${
        anatomy.isReadOnly ? " *(Auto-calculated / Read-only)*" : ""
      }`
    );
    partsUr.push(
      `• **اسکرین پر موجودہ ویلیو:** \`${anatomy.liveValue}\`${
        anatomy.isReadOnly ? " *(خودکار کیلکولیٹڈ)*" : ""
      }`
    );
  } else if (anatomy.placeholder && (anatomy.tag === "input" || anatomy.tag === "textarea")) {
    partsEn.push(`• **Input Hint:** *"${anatomy.placeholder}"*`);
    partsUr.push(`• **اندراج کا اشارہ:** *"${anatomy.placeholder}"*`);
  }

  return {
    en: partsEn.length ? `\n\n${partsEn.join("\n")}` : "",
    ur: partsUr.length ? `\n\n${partsUr.join("\n")}` : "",
  };
}

const LEARNED_KNOWLEDGE_STORAGE_KEY = "karobar_cursor_ai_learned_knowledge_v2";
let inMemoryLearnedKnowledge = null;

/**
 * Loads AI-learned improvements persisted by the Explain Cursor & Cube Assistant
 * so old static knowledge is continuously upgraded with Generative AI explanations.
 */
export function loadLearnedCursorKnowledge() {
  if (inMemoryLearnedKnowledge) {
    return inMemoryLearnedKnowledge;
  }
  const empty = {
    controls: {},
    intents: {},
    questions: {},
  };
  if (typeof window === "undefined" || !window.localStorage) {
    inMemoryLearnedKnowledge = empty;
    return inMemoryLearnedKnowledge;
  }
  try {
    const raw = window.localStorage.getItem(LEARNED_KNOWLEDGE_STORAGE_KEY);
    if (!raw) {
      inMemoryLearnedKnowledge = empty;
      return inMemoryLearnedKnowledge;
    }
    const parsed = JSON.parse(raw);
    inMemoryLearnedKnowledge = {
      controls: parsed?.controls && typeof parsed.controls === "object" ? parsed.controls : {},
      intents: parsed?.intents && typeof parsed.intents === "object" ? parsed.intents : {},
      questions: parsed?.questions && typeof parsed.questions === "object" ? parsed.questions : {},
    };
    return inMemoryLearnedKnowledge;
  } catch {
    inMemoryLearnedKnowledge = empty;
    return inMemoryLearnedKnowledge;
  }
}

/**
 * Saves an AI-generated explanation into the learned knowledge store to improve old knowledge.
 */
export function saveLearnedCursorKnowledge({
  controlKey = "",
  intentId = "",
  questionText = "",
  route = "/dashboard",
  titleEn = "",
  titleUr = "",
  answerEn = "",
  answerUr = "",
  provider = "ai",
} = {}) {
  if (!answerEn && !answerUr) return null;
  const store = loadLearnedCursorKnowledge();
  const updatedAt = new Date().toISOString();

  const record = {
    title: {
      en: titleEn || "Karobar ERP Guide",
      ur: titleUr || titleEn || "کاروبار ایپ رہنمائی",
    },
    en: answerEn || answerUr,
    ur: answerUr || answerEn,
    provider,
    updatedAt,
  };

  if (controlKey) {
    store.controls[String(controlKey).toLowerCase()] = record;
  }
  if (intentId) {
    store.intents[String(intentId)] = record;
  }
  if (questionText) {
    const normQ = `${route || "/dashboard"}::${String(questionText)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()}`;
    store.questions[normQ] = record;
  }

  inMemoryLearnedKnowledge = store;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(LEARNED_KNOWLEDGE_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore storage quota errors
    }
  }
  return record;
}

/**
 * Retrieves any AI-improved answer for a previously asked question or matched intent.
 */
export function getLearnedAnswerForQuery(queryText = "", route = "/dashboard", matchedIntentId = "") {
  const store = loadLearnedCursorKnowledge();
  if (matchedIntentId && store.intents[matchedIntentId]) {
    return store.intents[matchedIntentId];
  }
  const normQ = `${route || "/dashboard"}::${String(queryText)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()}`;
  if (store.questions[normQ]) {
    return store.questions[normQ];
  }
  return null;
}

/**
 * Inspects a clicked DOM element on the page and returns a detailed, component-specific
 * bilingual explanation card along with structured `elementContext` for Generative AI enrichment.
 */
export function explainDomElement(element, currentGuide) {
  if (!element) return null;

  const anatomy = inspectElementAnatomy(element);
  const badge = {
    en: anatomy.tableHeaderText
      ? `${anatomy.componentType.en} • Col: ${anatomy.tableHeaderText}`
      : anatomy.componentType.en,
    ur: anatomy.tableHeaderText
      ? `${anatomy.componentType.ur} • کالم: ${anatomy.tableHeaderText}`
      : anatomy.componentType.ur,
  };

  // Build focused search text strictly from this component's own clues (not whole-page parent divs)
  const focusedClues = [
    anatomy.fieldLabel,
    anatomy.tableHeaderText,
    anatomy.ariaLabel,
    anatomy.titleAttr,
    anatomy.placeholder,
    anatomy.ownText,
    anatomy.nameAttr.replace(/[_-]+/g, " "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const cleanTokens = focusedClues.split(/[^a-z0-9+%#.]+/).filter(Boolean);
  const primaryLower = (
    anatomy.fieldLabel ||
    anatomy.tableHeaderText ||
    anatomy.placeholder ||
    anatomy.ariaLabel ||
    anatomy.ownText
  )
    .toLowerCase()
    .trim();

  const guideKey = currentGuide?.key || currentGuide?.path || "/dashboard";
  const displayLabel = anatomy.primaryLabel || anatomy.tableHeaderText || "Selected Control";
  const controlKey = `${guideKey}::${anatomy.componentType.kind}::${(primaryLower || displayLabel.toLowerCase()).slice(0, 80)}`;

  const finalizeExplanation = (baseResult) => {
    const shortcutText = baseResult.shortcut?.keys || "";
    const elementContext = {
      control_key: controlKey,
      label: String(baseResult.title?.en || displayLabel).slice(0, 240),
      component_type: String(anatomy.componentType.en || "UI Control").slice(0, 120),
      zone: String(anatomy.zone?.en || "Active Screen").slice(0, 120),
      table_column: String(anatomy.tableHeaderText || "").slice(0, 160),
      placeholder: String(anatomy.placeholder || "").slice(0, 200),
      shortcut: String(shortcutText).slice(0, 80),
    };

    const learned = loadLearnedCursorKnowledge().controls[controlKey.toLowerCase()];
    if (learned && (learned.en || learned.ur)) {
      const liveStatus = buildLiveStatusBlock(anatomy, baseResult.shortcut);
      return {
        ...baseResult,
        title: {
          en: learned.title?.en || baseResult.title?.en,
          ur: learned.title?.ur || baseResult.title?.ur,
        },
        en: `${learned.en}${liveStatus.en}`,
        ur: `${learned.ur}${liveStatus.ur}`,
        baselineEn: `${learned.en}${liveStatus.en}`,
        baselineUr: `${learned.ur}${liveStatus.ur}`,
        aiGenerated: false,
        aiImproved: true,
        aiProvider: learned.provider || "ai",
        controlKey,
        elementContext,
      };
    }

    return {
      ...baseResult,
      baselineEn: baseResult.en,
      baselineUr: baseResult.ur,
      aiGenerated: false,
      aiImproved: false,
      controlKey,
      elementContext,
    };
  };

  // 1. Check universal ERP control dictionary first (most specific to sub-columns, buttons & shortcuts)
  for (const entry of UNIVERSAL_CONTROL_DICTIONARY) {
    const exactHit =
      entry.exactTokens &&
      entry.exactTokens.some(
        (tok) =>
          primaryLower === tok ||
          anatomy.tableHeaderText.toLowerCase() === tok ||
          cleanTokens.includes(tok)
      );
    const keywordHit = entry.keywords.some((kw) => focusedClues.includes(kw));
    if (exactHit || keywordHit) {
      const shortcut = resolveControlShortcut(element, anatomy, entry);
      const liveStatus = buildLiveStatusBlock(anatomy, shortcut);
      return finalizeExplanation({
        title: {
          en: entry.title.en,
          ur: entry.title.ur,
        },
        badge,
        shortcut,
        en: `${entry.en}${liveStatus.en}`,
        ur: `${entry.ur}${liveStatus.ur}`,
      });
    }
  }

  // 2. Check screen-specific fields glossary when the component's own label/column matches the field name
  const blueprint = SCREEN_BLUEPRINTS[guideKey] || getBlueprintForGuide(currentGuide);
  const allScreenFields = [...(currentGuide?.fields || []), ...(blueprint?.fields || [])];

  if (primaryLower.length >= 2) {
    for (const field of allScreenFields) {
      const termEn = (field.term?.en || "").toLowerCase().trim();
      if (!termEn) continue;
      const significantPhrases = termEn
        .split(/[\/(),—–-]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);

      const isDirectMatch =
        primaryLower.includes(termEn) ||
        significantPhrases.some((phrase) => primaryLower === phrase || primaryLower.includes(phrase));

      if (isDirectMatch) {
        const shortcut = resolveControlShortcut(element, anatomy, null);
        const liveStatus = buildLiveStatusBlock(anatomy, shortcut);
        return finalizeExplanation({
          title: {
            en: field.term.en,
            ur: field.term.ur || field.term.en,
          },
          badge,
          shortcut,
          en: `**What this ${anatomy.componentType.en.toLowerCase()} does:**\n${field.en}${liveStatus.en}`,
          ur: `**اس کنٹرول کا کام:**\n${field.ur || field.en}${liveStatus.ur}`,
        });
      }
    }
  }

  // 3. Detailed Component-Specific Analysis for any custom Button, Input, Dropdown, Table Column, or Card
  const shortcut = resolveControlShortcut(element, anatomy, null);
  const liveStatus = buildLiveStatusBlock(anatomy, shortcut);

  if (anatomy.componentType.kind === "button" || anatomy.componentType.kind === "link") {
    return finalizeExplanation({
      title: {
        en: `${displayLabel}`,
        ur: `${displayLabel}`,
      },
      badge,
      shortcut,
      en: `**What this button does:** Triggers the **${displayLabel}** action.\n**How to use it:**\n• Click this control when you want to execute **${displayLabel}**.${liveStatus.en}`,
      ur: `**یہ بٹن کیا کرتا ہے:** یہ بٹن دبانے سے **${displayLabel}** کا عمل شروع ہوتا ہے۔${liveStatus.ur}`,
    });
  }

  if (anatomy.componentType.kind === "readonly-input") {
    return finalizeExplanation({
      title: {
        en: `${displayLabel}`,
        ur: `${displayLabel}`,
      },
      badge,
      shortcut,
      en: `**What this read-only box shows:** Displays the live calculated value for **${displayLabel}**.\n**Why you cannot type here:**\n• Karobar ERP calculates this value automatically from your item quantities, rates, discounts, or ledger balances so manual typing errors cannot occur.${liveStatus.en}`,
      ur: `**یہ خانہ کیا دکھاتا ہے:** یہ **${displayLabel}** کی خودکار طریقے سے گنی گئی رقم یا معلومات دکھاتا ہے۔\n• حساب کی غلطی سے بچنے کے لیے سسٹم اسے خود کیلکولیٹ کرتا ہے، اس لیے اس میں ہاتھ سے لکھنے کی ضرورت نہیں ہوتی۔${liveStatus.ur}`,
    });
  }

  if (
    anatomy.componentType.kind === "number-input" ||
    anatomy.componentType.kind === "text-input" ||
    anatomy.componentType.kind === "date-input" ||
    anatomy.componentType.kind === "select" ||
    anatomy.componentType.kind === "toggle"
  ) {
    return finalizeExplanation({
      title: {
        en: `${displayLabel}`,
        ur: `${displayLabel}`,
      },
      badge,
      shortcut,
      en: `**What this field captures:** Used to enter or select **${displayLabel}**.\n**How it works:**\n• ${
        anatomy.componentType.kind === "select"
          ? `Click to open the dropdown list and choose the appropriate **${displayLabel}** option.`
          : anatomy.componentType.kind === "number-input"
            ? `Type a numeric value for **${displayLabel}** — related row totals and bill summaries recalculate immediately as you type.`
            : `Enter the required value for **${displayLabel}** before saving or filtering.`
      }${liveStatus.en}`,
      ur: `**اس خانے کا مقصد:** یہاں **${displayLabel}** کی معلومات درج یا منتخب کی جاتی ہیں۔\n• اس خانے میں تبدیلی کرنے سے متعلقہ حساب یا فہرست فوری طور پر اپڈیٹ ہو جاتی ہے۔${liveStatus.ur}`,
    });
  }

  if (anatomy.componentType.kind === "th" || anatomy.componentType.kind === "td") {
    const colName = anatomy.tableHeaderText || displayLabel;
    return finalizeExplanation({
      title: {
        en: `Column: ${colName}`,
        ur: `کالم: ${colName}`,
      },
      badge,
      shortcut,
      en: `**What this table column shows:** Displays the **${colName}** for each row in this table.${
        anatomy.liveValue
          ? `\n• **Selected Cell Value:** Currently showing \`${anatomy.liveValue}\`${
              anatomy.tableRowNumber ? ` on Row #${anatomy.tableRowNumber}` : ""
            }.`
          : ""
      }\n• If the cells in this column contain input boxes or action buttons, you can click directly inside any row's cell to edit or trigger it.${liveStatus.en}`,
      ur: `**یہ کالم کیا دکھاتا ہے:** ٹیبل کی ہر سطر کے لیے **${colName}** کی تفصیل یا قیمت دکھاتا ہے۔${liveStatus.ur}`,
    });
  }

  // KPI Card / Summary Box / Section Block
  const cardLines = (element.innerText || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);

  const cardBreakdownEn =
    cardLines.length >= 2
      ? `\n• **Displayed Metric:** \`${cardLines[0]}\` → **${cardLines.slice(1).join(" • ")}**`
      : "";
  const cardBreakdownUr =
    cardLines.length >= 2
      ? `\n• **موجودہ معلومات:** \`${cardLines[0]}\` ← **${cardLines.slice(1).join(" • ")}**`
      : "";

  return finalizeExplanation({
    title: {
      en: `${cardLines[0] || displayLabel}`,
      ur: `${cardLines[0] || displayLabel}`,
    },
    badge,
    shortcut,
    en: `**What this section shows:** Displays live status and summary figures for **${
      cardLines[0] || displayLabel
    }**.${cardBreakdownEn}\n**How it updates:** Refreshes automatically whenever you filter records or post a new transaction.`,
    ur: `**یہ حصہ کیا دکھاتا ہے:** یہ کارڈ **${
      cardLines[0] || displayLabel
    }** کے موجودہ اعداد و شمار اور خلاصہ دکھاتا ہے۔${cardBreakdownUr}`,
  });
}

/**
 * Returns the structured blueprint (`fields`, `example`, `impactMatrix`, `commonMistake`)
 * for any screen guide, synthesizing a rich fallback when a route doesn't have a custom entry.
 */
export function getBlueprintForGuide(guide) {
  if (!guide) return null;
  const key = guide.key || guide.path || "";
  if (SCREEN_BLUEPRINTS[key]) {
    return SCREEN_BLUEPRINTS[key];
  }

  // Category-aware structured fallback so every single screen in the ERP has a 4-pillar blueprint
  const category = guide.category || "overview";

  // Build field glossary from the screen's features if no custom fields exist
  const derivedFields = (guide.features?.en || []).slice(0, 4).map((featEn, idx) => {
    const featUr = guide.features?.ur?.[idx] || featEn;
    const colonIdx = featEn.indexOf(":");
    const termEn =
      colonIdx > 0 && colonIdx < 42
        ? featEn.slice(0, colonIdx).trim()
        : `Control / Feature ${idx + 1}`;
    const urColonIdx = featUr.indexOf(":");
    const termUr =
      urColonIdx > 0 && urColonIdx < 45
        ? featUr.slice(0, urColonIdx).trim()
        : `خصوصیت ${idx + 1}`;
    return {
      term: { en: termEn, ur: termUr },
      type: category === "reports" ? "Filter / Column" : "Control",
      en: featEn,
      ur: featUr,
    };
  });

  if (category === "reports") {
    return {
      fields:
        derivedFields.length > 0
          ? derivedFields
          : [
              {
                term: { en: "Date Range & Entity Filters", ur: "تاریخ اور فلٹرز" },
                type: "Filter",
                en: "Filter this report by custom From–To dates, party, brand, category, or user and click Generate / Refresh.",
                ur: "مطلوبہ تاریخ، پارٹی یا برانڈ منتخب کر کے رپورٹ فلٹر کریں۔",
              },
              {
                term: { en: "Export PDF / Excel / Print", ur: "پی ڈی ایف، ایکسل یا پرنٹ" },
                type: "Action",
                en: "Export the filtered report table and KPI summary cards to printable A4 PDF or CSV/Excel.",
                ur: "فلٹر شدہ رپورٹ کو پی ڈی ایف یا پرنٹ کی شکل میں محفوظ کریں۔",
              },
            ],
      example: {
        title: { en: `How to Audit with ${guide.title?.en || "This Report"}`, ur: "اس رپورٹ سے آڈٹ کرنے کا طریقہ" },
        en: `Select your target date range at the top of **${guide.title?.en || "the report"}**, review the summary KPI totals, and click any invoice or party row to verify its underlying source transaction.`,
        ur: `اوپر تاریخ منتخب کریں، کل اعداد و شمار (KPIs) چیک کریں اور تفصیل دیکھنے کے لیے متعلقہ لائن کا جائزہ لیں۔`,
      },
      impactMatrix: {
        stock: { en: "Read-only analytical report — never alters live stock.", ur: "صرف معلوماتی رپورٹ—اسٹاک تبدیل نہیں کرتی۔" },
        ledger: { en: "Read-only — reflects posted Customer & Supplier ledgers.", ur: "صرف معلوماتی—پوسٹ شدہ کھاتے دکھاتی ہے۔" },
        treasury: { en: "Read-only — reflects posted Cash & Bank movements.", ur: "صرف معلوماتی—کیش اور بینک کا خلاصہ۔" },
        gl: { en: "Read-only — reconciles with General Ledger balances.", ur: "صرف معلوماتی—جنرل لیجر کے مطابق۔" },
      },
      commonMistake: {
        en: "If a recent bill isn't appearing in the report, check the top Date Range filter and ensure the invoice was Saved (not left on Hold).",
        ur: "اگر کوئی نیا بل رپورٹ میں نظر نہ آئے تو اوپر تاریخ کا فلٹر چیک کریں۔",
      },
    };
  }

  return {
    fields: derivedFields,
    example: {
      title: { en: `Practical Workflow on ${guide.title?.en || "This Screen"}`, ur: `${guide.title?.ur || "اس اسکرین"} کا عملی استعمال` },
      en: guide.summary?.en || "",
      ur: guide.summary?.ur || "",
    },
    impactMatrix: {
      stock: {
        en:
          category === "items" || category === "inventory"
            ? guide.impacts?.en || "Updates catalog/inventory metadata."
            : "No direct stock quantity change.",
        ur:
          category === "items" || category === "inventory"
            ? guide.impacts?.ur || "اسٹاک یا کیٹلاگ اپڈیٹ کرتا ہے۔"
            : "اسٹاک کی مقدار پر براہِ راست اثر نہیں۔",
      },
      ledger: {
        en:
          category === "finance"
            ? guide.impacts?.en || "Updates party ledger balances."
            : "Used as master reference in invoices & ledgers.",
        ur:
          category === "finance"
            ? guide.impacts?.ur || "پارٹی کھاتہ اپڈیٹ کرتا ہے۔"
            : "بلنگ اور کھاتوں میں بطور حوالہ استعمال ہوتا ہے۔",
      },
      treasury: {
        en:
          category === "finance"
            ? "Syncs with selected Cash Drawer or Bank/Wallet account."
            : "No cash or bank movement.",
        ur:
          category === "finance"
            ? "منتخب کیش ڈراور یا بینک اکاؤنٹ سے منسلک۔"
            : "کیش یا بینک پر کوئی اثر نہیں۔",
      },
      gl: {
        en: guide.impacts?.en || "Maintains clean audit trail across the ERP.",
        ur: guide.impacts?.ur || "سافٹ ویئر کا ریکارڈ منظم رکھتا ہے۔",
      },
    },
    commonMistake: null,
  };
}
