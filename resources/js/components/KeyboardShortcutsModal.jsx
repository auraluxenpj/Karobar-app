// src/components/KeyboardShortcutsModal.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  CommandLineIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  KeyIcon,
  LanguageIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext.jsx";

export const SHORTCUT_CATEGORIES = [
  {
    id: "mdi_windows",
    name: "Browser Tabs & Multi-Tasking Workspace",
    nameUr: "براؤزر ٹیبز اور ملٹی ٹاسکنگ ورک اسپیس",
    description: "Manage Chrome-style top browser tabs and switch between open screens instantaneously",
    descriptionUr: "کروم اسٹائل ٹاپ براؤزر ٹیبز کو کنٹرول کریں اور کھلی اسکرینوں کے درمیان فوری سوئچ کریں",
    shortcuts: [
      {
        keys: ["Ctrl", "Tab"],
        altKeys: ["Ctrl", "PageDown"],
        label: "Switch to Next Tab (Forward)",
        labelUr: "اگلے ٹیب پر جائیں (آگے)",
        description: "Cycle forward through open top browser tabs (also Ctrl + PageDown or Ctrl + ])",
        descriptionUr: "کھلے ہوئے ٹاپ براؤزر ٹیبز میں آگے کی طرف جائیں (Ctrl + PageDown یا Ctrl + ] بھی استعمال کریں)",
        badge: "Browser Tabs",
        badgeUr: "براؤزر ٹیبز",
      },
      {
        keys: ["Ctrl", "Shift", "Tab"],
        altKeys: ["Ctrl", "PageUp"],
        label: "Switch to Previous Tab (Reverse)",
        labelUr: "پچھلے ٹیب پر جائیں (پیچھے)",
        description: "Cycle in reverse through open top browser tabs (also Ctrl + PageUp or Ctrl + [)",
        descriptionUr: "کھلے ہوئے ٹاپ براؤزر ٹیبز میں پیچھے کی طرف جائیں (Ctrl + PageUp یا Ctrl + [ بھی استعمال کریں)",
        badge: "Browser Tabs",
        badgeUr: "براؤزر ٹیبز",
      },
      {
        keys: ["Ctrl", "Shift", "1–8"],
        altKeys: ["Ctrl", "Shift", "9"],
        label: "Jump Directly to Tab 1–8 / Last Tab",
        labelUr: "براہِ راست ٹیب 1 تا 8 یا آخری ٹیب پر جائیں",
        description: "Press Ctrl+Shift+1 through Ctrl+Shift+8 to jump to a specific tab, or Ctrl+Shift+9 for the last tab",
        descriptionUr: "مخصوص ٹیب پر جانے کے لیے Ctrl+Shift+1 سے 8 دبائیں، یا آخری ٹیب کے لیے Ctrl+Shift+9 دبائیں",
        badge: "Browser Tabs",
        badgeUr: "براؤزر ٹیبز",
      },
      {
        keys: ["Ctrl", "Shift", "A"],
        altKeys: ["Ctrl", "Shift", "O"],
        label: "Search Open Tabs & Open Any Page in New Tab",
        labelUr: "کھلے ٹیبز سرچ کریں اور کوئی بھی صفحہ نئے ٹیب میں کھولیں",
        description: "Open the unified Tab Search & New Tab Launcher to search open tabs or launch any ERP page in a new tab",
        descriptionUr: "کھلے ٹیبز تلاش کرنے یا کسی بھی صفحے کو نئے براؤزر ٹیب میں کھولنے کے لیے سرچ لانچر کھولیں",
        badge: "New Tab Search",
        badgeUr: "نیا ٹیب سرچ",
      },
      {
        keys: ["Ctrl", "Shift", "N"],
        label: "Open Blank Dashboard Tab",
        labelUr: "نیا ڈیش بورڈ ٹیب کھولیں",
        description: "Immediately open a fresh Dashboard tab in the top tab strip",
        descriptionUr: "ٹاپ ٹیب بار میں فوری طور پر ایک نیا ڈیش بورڈ ٹیب کھولیں",
        badge: "Browser Tabs",
        badgeUr: "براؤزر ٹیبز",
      },
      {
        keys: ["Ctrl", "Shift", "D"],
        label: "Duplicate Active Tab",
        labelUr: "موجودہ ٹیب کی ڈپلیکیٹ بنائیں",
        description: "Clone the currently active workspace screen into a new browser tab",
        descriptionUr: "موجودہ اسکرین کی ہو بہو کاپی ایک نئے براؤزر ٹیب میں کھولیں",
      },
      {
        keys: ["Ctrl", "F4"],
        altKeys: ["Ctrl", "Shift", "Q"],
        label: "Close Active Tab",
        labelUr: "موجودہ ٹیب بند کریں",
        description: "Close the currently focused browser tab (or middle-click any tab in the top bar)",
        descriptionUr: "موجودہ منتخب براؤزر ٹیب کو بند کریں (یا ٹیب پر مڈل کلک کریں)",
      },
      {
        keys: ["Ctrl", "Shift", "T"],
        label: "Reopen Last Closed Tab",
        labelUr: "آخری بند کیا گیا ٹیب دوبارہ کھولیں",
        description: "Restore the most recently closed browser tab from tab history",
        descriptionUr: "حال ہی میں بند کیے گئے براؤزر ٹیب کو ہسٹری سے دوبارہ بحال کریں",
      },
      {
        keys: ["Ctrl", "Shift", "X"],
        label: "Close All Other Tabs",
        labelUr: "باقی تمام ٹیبز بند کریں",
        description: "Close all unpinned background tabs and keep only the active tab",
        descriptionUr: "موجودہ ٹیب کے علاوہ تمام غیر پن شدہ ٹیبز بند کر دیں",
      },
      {
        keys: ["Ctrl", "Shift", "H"],
        label: "Focus Main Dashboard Tab",
        labelUr: "مین ڈیش بورڈ ٹیب پر واپس جائیں",
        description: "Switch focus directly back to the primary workspace tab",
        descriptionUr: "فوکس کو براہِ راست مین ڈیش بورڈ ٹیب پر واپس لے جائیں",
      },
      {
        keys: ["Ctrl", "Shift", "P"],
        label: "Quick Tab: Barcode POS",
        labelUr: "فوری ٹیب: بارکوڈ POS ٹرمینل",
        description: "Launch High-Speed Barcode POS inside a new top browser tab",
        descriptionUr: "تیز رفتار بارکوڈ POS ٹرمینل کو نئے براؤزر ٹیب میں کھولیں",
      },
      {
        keys: ["Ctrl", "Shift", "S"],
        label: "Quick Tab: Retail Sale Invoice",
        labelUr: "فوری ٹیب: ریٹیل سیل انوائس",
        description: "Launch Create Retail Sale Invoice inside a new top browser tab",
        descriptionUr: "نئی ریٹیل سیل انوائس اسکرین کو نئے براؤزر ٹیب میں کھولیں",
      },
      {
        keys: ["Ctrl", "Shift", "W"],
        label: "Quick Tab: Wholesale Sale Invoice",
        labelUr: "فوری ٹیب: ہول سیل انوائس",
        description: "Launch Create Wholesale Sale Invoice inside a new top browser tab",
        descriptionUr: "نئی ہول سیل انوائس اسکرین کو نئے براؤزر ٹیب میں کھولیں",
      },
      {
        keys: ["Ctrl", "Shift", "U"],
        label: "Quick Tab: Purchase Invoice",
        labelUr: "فوری ٹیب: پرچیز انوائس (خریداری بل)",
        description: "Launch Create Purchase Invoice (GRN) inside a new top browser tab",
        descriptionUr: "نئی پرچیز انوائس (اسٹاک خریداری) کو نئے براؤزر ٹیب میں کھولیں",
      },
      {
        keys: ["Ctrl", "Shift", "L"],
        label: "Quick Tab: Customer Ledger",
        labelUr: "فوری ٹیب: کسٹمر کھاتہ (لیجر)",
        description: "Launch Customer Ledger (Khata) inside a new top browser tab",
        descriptionUr: "کسٹمر لیجر (کھاتہ) کو نئے براؤزر ٹیب میں کھولیں",
      },
    ],
  },
  {
    id: "global",
    name: "Global & Quick Navigation",
    nameUr: "عمومی اور فوری نیویگیشن شارٹ کٹس",
    description: "Available from anywhere in the Windows desktop application",
    descriptionUr: "پروگرام کے کسی بھی صفحے سے فوری استعمال کے لیے دستیاب شارٹ کٹس",
    shortcuts: [
      {
        keys: ["Ctrl", "K"],
        label: "Go to Page (Quick Navigation)",
        labelUr: "کسی بھی صفحے پر فوری جائیں (کمانڈ پیلیٹ)",
        description: "Search available pages and jump between modules with arrow keys and Enter",
        descriptionUr: "کوئی بھی صفحہ تلاش کریں اور ایرو کیز اور Enter کی مدد سے فوری اس صفحے پر جائیں",
        badge: "Everywhere",
        badgeUr: "ہر جگہ",
      },
      {
        keys: ["Ctrl", "P"],
        label: "Product Catalog Search",
        labelUr: "پروڈکٹ، قیمت اور بیچ سرچ",
        description: "Instant product lookup by name, salt, or batch across the software (when not on a printable view)",
        descriptionUr: "پورے سافٹ ویئر میں کسی بھی دوا یا پروڈکٹ کو نام، فارمولا یا بیچ سے فوری تلاش کریں",
        badge: "Everywhere",
        badgeUr: "ہر جگہ",
      },
      {
        keys: ["Ctrl", "/"],
        label: "Focus Product Search Input",
        labelUr: "پروڈکٹ سرچ بار پر فوکس کریں",
        description: "Focus the inline product search input bar from anywhere on the screen",
        descriptionUr: "اسکرین پر موجود پروڈکٹ سرچ باکس میں کرسر فوری لے جائیں",
      },
      {
        keys: ["Ctrl", "G"],
        label: "Karobar Screen Guide Bot (EN / اردو)",
        labelUr: "کاروبار اسکرین گائیڈ اسسٹنٹ (انگلش / اردو)",
        description: "Open the screen-aware bilingual assistant that explains the active page in English and Urdu",
        descriptionUr: "موجودہ صفحے کی مکمل رہنمائی انگریزی اور اردو میں حاصل کرنے کے لیے گائیڈ بوٹ کھولیں",
        badge: "Everywhere",
        badgeUr: "ہر جگہ",
      },
      {
        keys: ["?"],
        label: "Keyboard Shortcuts Guide",
        labelUr: "کی بورڈ شارٹ کٹس گائیڈ",
        description: "Open this keyboard shortcuts quick reference modal",
        descriptionUr: "کی بورڈ شارٹ کٹس کی یہ معلوماتی ونڈو کھولیں",
        badge: "Everywhere",
        badgeUr: "ہر جگہ",
      },
      {
        keys: ["Ctrl", "1"],
        label: "New Purchase Invoice",
        labelUr: "نئی پرچیز انوائس (اسٹاک بل)",
        description: "Open a new Purchase Invoice (GRN) creation screen",
        descriptionUr: "نیا مال اور اسٹاک داخل کرنے کے لیے پرچیز انوائس اسکرین کھولیں",
      },
      {
        keys: ["Ctrl", "2"],
        label: "New Retail Sale Invoice",
        labelUr: "نئی ریٹیل سیل انوائس",
        description: "Open a new Retail POS Sale Invoice creation screen",
        descriptionUr: "نئی ریٹیل سیل انوائس بنانے کی اسکرین کھولیں",
      },
      {
        keys: ["Ctrl", "3"],
        altKeys: ["Ctrl", "W"],
        label: "New Wholesale Sale Invoice",
        labelUr: "نئی ہول سیل انوائس",
        description: "Open a new B2B Wholesale Sale Invoice creation screen",
        descriptionUr: "نئی ہول سیل (B2B) انوائس بنانے کی اسکرین کھولیں",
      },
      {
        keys: ["Ctrl", "D"],
        label: "Cash Drawer Shift Register",
        labelUr: "کیش ڈراور شفٹ رجسٹر",
        description: "Open cash drawer shift status, cash in/out, and float reconciliation modal",
        descriptionUr: "کیش ڈراور شفٹ، نقد آمد وخرچ اور کلوزنگ بیلنس چیک کرنے کی ونڈو کھولیں",
      },
      {
        keys: ["Ctrl", "A"],
        label: "Financial Accounts Register",
        labelUr: "فنانشل اکاؤنٹس اور بینک بیلنس",
        description: "View liquid balances across all Pakistani banks, wallets, and cash in drawer (when not typing in an input)",
        descriptionUr: "تمام بینک اکاؤنٹس، موبائل والٹس اور کیش کا موجودہ بیلنس فوری دیکھیں",
      },
      {
        keys: ["Ctrl", "R"],
        label: "Refresh Dashboard / Expiry / Batches",
        labelUr: "ڈیش بورڈ، ایکسپائری اور بیچ ڈیٹا ریفریش کریں",
        description: "Reload live metrics and data on Dashboard, Batch Expiry Radar, and Product Batch Workbench",
        descriptionUr: "ڈیش بورڈ، ایکسپائری ریڈار اور بیچ ورک بینچ پر تازہ ترین اعداد و شمار لوڈ کریں",
      },
      {
        keys: ["Ctrl", "Shift", "R"],
        label: "Reload Desktop Application",
        labelUr: "ڈیسک ٹاپ ایپلیکیشن ری لوڈ کریں",
        description: "Perform a clean reload of the desktop application window",
        descriptionUr: "ڈیسک ٹاپ ایپلیکیشن ونڈو کو مکمل طور پر ری لوڈ کریں",
      },
    ],
  },
  {
    id: "invoicing",
    name: "Invoicing, Returns & Held Drafts",
    nameUr: "انوائسنگ، ریٹرنز اور ہولڈ ڈرافٹس",
    description: "Speed up checkout, billing, and return workflows in Sale and Purchase forms",
    descriptionUr: "سیل اور پرچیز فارمز میں بلنگ، واپسی اور ڈرافٹ ہولڈ کرنے کی تیز رفتار کیز",
    shortcuts: [
      {
        keys: ["Ctrl", "S"],
        altKeys: ["F9"],
        label: "Quick Save / Finalize Invoice",
        labelUr: "بل فوری محفوظ اور مکمل کریں",
        description: "Submit and complete the current Sale Invoice, Purchase Invoice, Return, or Purchase Order (also Ctrl + Enter)",
        descriptionUr: "موجودہ سیل بل، پرچیز بل، ریٹرن یا پرچیز آرڈر کو محفوظ اور فائنل کریں (Ctrl + Enter بھی کام کرتا ہے)",
        badge: "Fast Checkout",
        badgeUr: "تیز بلنگ",
      },
      {
        keys: ["Ctrl", "T"],
        label: "Toggle Debit (Cash) / Credit (Udhar)",
        labelUr: "نقد (Cash) اور ادھار (Credit) کے درمیان تبدیلی",
        description: "Switch invoice settlement mode between immediate Cash (Debit) and Party Ledger (Credit)",
        descriptionUr: "انوائس کو فوری نقد (ڈیبٹ) یا پارٹی کھاتہ (ادھار/کریڈٹ) موڈ پر منتقل کریں",
        badge: "Billing",
        badgeUr: "بلنگ",
      },
      {
        keys: ["Ctrl", "H"],
        label: "Quick-Hold Current Invoice Draft",
        labelUr: "موجودہ بل کو ہولڈ (Park) کریں",
        description: "Park the active invoice into Held Drafts and start a fresh invoice immediately",
        descriptionUr: "موجودہ بل کو عارضی طور پر ہولڈ ڈرافٹس میں رکھیں اور نیا بل شروع کریں",
      },
      {
        keys: ["Ctrl", "D"],
        label: "Open Held / Auto-Saved Drafts",
        labelUr: "ہولڈ اور آٹو سیو شدہ ڈرافٹس کھولیں",
        description: "View, resume, or manage parked and auto-saved draft invoices",
        descriptionUr: "ہولڈ کیے گئے یا خودکار محفوظ شدہ ادھورے بل دیکھیں اور دوبارہ لوڈ کریں",
      },
      {
        keys: ["Ctrl", "N"],
        label: "Start New Blank Invoice / Add Row",
        labelUr: "نیا خالی بل شروع کریں / نئی لائن شامل کریں",
        description: "Start a fresh blank invoice (or insert a new product line row when editing / on Return forms)",
        descriptionUr: "نیا خالی بل کھولیں (یا ریٹرن فارم اور ایڈٹ موڈ میں نئی پروڈکٹ لائن شامل کریں)",
      },
      {
        keys: ["Ctrl", "C"],
        label: "Focus Customer / Supplier Search",
        labelUr: "گاہک یا سپلائر سرچ پر جائیں",
        description: "Open the Customer or Supplier search modal when no text is selected",
        descriptionUr: "جب کوئی ٹیکسٹ سلیکٹ نہ ہو تو گاہک یا سپلائر منتخب کرنے کی ونڈو کھولیں",
      },
      {
        keys: ["Ctrl", "M"],
        label: "Focus Payment Method / Account",
        labelUr: "پیمنٹ کا طریقہ اور اکاؤنٹ منتخب کریں",
        description: "Focus payment method selector (Cash Drawer, Bank, EasyPaisa, etc.)",
        descriptionUr: "ادائیگی کا اکاؤنٹ (کیش ڈراور، بینک، ایزی پیسہ وغیرہ) منتخب کرنے پر فوکس کریں",
      },
      {
        keys: ["Ctrl", "R"],
        label: "Toggle Retail / Wholesale Pricing",
        labelUr: "ریٹیل اور ہول سیل ریٹ موڈ تبدیل کریں",
        description: "Switch sale invoice creation between Retail and Wholesale mode",
        descriptionUr: "سیل انوائس بناتے وقت ریٹیل اور ہول سیل قیمتوں کے درمیان سوئچ کریں",
      },
    ],
  },
  {
    id: "pos",
    name: "High-Speed Barcode POS",
    nameUr: "تیز رفتار بارکوڈ POS ٹرمینل",
    description: "Dedicated hotkeys for rapid counter checkout on the Barcode POS terminal",
    descriptionUr: "کاؤنٹر پر تیز ترین بارکوڈ بلنگ اور رسید پرنٹ کرنے کے خصوصی بٹن",
    shortcuts: [
      {
        keys: ["F2"],
        label: "Focus Manual Barcode / SKU Input",
        labelUr: "مینوئل بارکوڈ / SKU باکس پر جائیں",
        description: "Jump cursor to the manual barcode entry box (or focus Product Selector on Batch Workbench)",
        descriptionUr: "کرسر کو فوری طور پر بارکوڈ انٹری باکس میں لے جائیں",
        badge: "POS",
        badgeUr: "POS",
      },
      {
        keys: ["F3"],
        label: "Focus Product Name / Salt Search",
        labelUr: "پروڈکٹ نام یا سالٹ سرچ باکس پر جائیں",
        description: "Jump cursor to search medicines by brand name or generic formulation",
        descriptionUr: "برانڈ نام یا فارمولا (Salt) سے دوائی تلاش کرنے والے باکس پر جائیں",
        badge: "POS",
        badgeUr: "POS",
      },
      {
        keys: ["F4"],
        altKeys: ["Ctrl", "S"],
        label: "Complete Sale & Print Receipt",
        labelUr: "سیل مکمل کریں اور رسید پرنٹ کریں",
        description: "Finalize the POS cart and trigger thermal receipt printing (also F9 or Ctrl + Enter)",
        descriptionUr: "POS بل مکمل کریں اور فوری طور پر تھرمل رسید پرنٹ نکالیں (F9 یا Ctrl + Enter بھی)",
        badge: "Fast Checkout",
        badgeUr: "فوری رسید",
      },
      {
        keys: ["Ctrl", "C"],
        label: "Exact Cash Received",
        labelUr: "پوری نقد رقم وصولی (Exact Cash)",
        description: "Fill 'Cash Given' with the exact Net Payable total when no text is selected",
        descriptionUr: "بل کی کل واجب الادا رقم کو خودکار طور پر 'وصول شدہ رقم' (Cash Given) میں درج کریں",
      },
      {
        keys: ["F8"],
        altKeys: ["Ctrl", "H"],
        label: "Park (Hold) Current POS Cart",
        labelUr: "موجودہ POS کارٹ ہولڈ کریں",
        description: "Park the current customer's cart into the held queue and clear the counter for the next customer",
        descriptionUr: "موجودہ گاہک کا بل ہولڈ قطار میں رکھیں اور اگلے گاہک کے لیے اسکرین صاف کریں",
      },
    ],
  },
  {
    id: "views_masters",
    name: "Invoice View, Lists, Ledgers & Master Forms",
    nameUr: "انوائس ویو، لسٹ، کھاتے اور ماسٹر فارمز",
    description: "Document actions, printing, and CRUD shortcuts across lists, ledgers, and master forms",
    descriptionUr: "بل دیکھنے، پرنٹ کرنے، کھاتوں اور ماسٹر ریکارڈز میں کام کرنے کے شارٹ کٹس",
    shortcuts: [
      {
        keys: ["Ctrl", "N"],
        label: "Create New Record / Invoice",
        labelUr: "نیا ریکارڈ یا انوائس بنائیں",
        description: "Open creation form on Products, Categories, Brands, Suppliers, Customers, Invoices, Returns, Stock Adjustments, Demands, Users & Roles",
        descriptionUr: "پروڈکٹس، کیٹیگریز، برانڈز، سپلائرز، گاہک، انوائسز، ریٹرنز اور دیگر صفحات پر نیا ریکارڈ فارم کھولیں",
        badge: "Lists & Views",
        badgeUr: "لسٹ اور فارمز",
      },
      {
        keys: ["Ctrl", "S"],
        label: "Save Form / Record Ledger Entry",
        labelUr: "فارم یا کھاتہ انٹری محفوظ کریں",
        description: "Save changes on Product, Category, Brand, Supplier, Customer, Stock Adjustment, Demand, User, Role, Ledger & Settings screens",
        descriptionUr: "پروڈکٹ، گاہک، سپلائر، اسٹاک ایڈجسٹمنٹ، کھاتہ اور سیٹنگز فارم کو محفوظ کریں",
        badge: "Forms",
        badgeUr: "فارمز",
      },
      {
        keys: ["Ctrl", "P"],
        label: "Print Invoice / Ledger / Forecast",
        labelUr: "انوائس، کھاتہ یا رپورٹ پرنٹ کریں",
        description: "Print the active Sale Invoice, Purchase Invoice, Customer/Supplier Ledger statement, or Reorder Forecast",
        descriptionUr: "موجودہ سیل بل، پرچیز بل، کسٹمر/سپلائر کھاتہ اسٹیٹمنٹ یا ری آرڈر رپورٹ پرنٹ کریں",
        badge: "Print",
        badgeUr: "پرنٹ",
      },
      {
        keys: ["Ctrl", "F"],
        label: "Search & Jump to Another Invoice",
        labelUr: "دوسری انوائس تلاش کریں",
        description: "Focus the quick invoice lookup bar on Sale/Purchase Invoice view screens (or Product search on Batch Workbench)",
        descriptionUr: "سیل یا پرچیز انوائس ویو اسکرین پر کسی دوسرے بل نمبر کو فوری تلاش کریں",
      },
      {
        keys: ["Ctrl", "E"],
        label: "Edit Current Invoice",
        labelUr: "موجودہ انوائس میں تبدیلی (Edit) کریں",
        description: "Open the currently viewed Sale or Purchase Invoice in Edit mode",
        descriptionUr: "سامنے کھلے ہوئے سیل یا پرچیز بل کو ایڈٹ موڈ میں کھولیں",
      },
      {
        keys: ["Ctrl", "D"],
        label: "Delete Current Invoice",
        labelUr: "موجودہ انوائس حذف (Delete) کریں",
        description: "Prompt confirmation to delete the currently viewed Sale or Purchase Invoice",
        descriptionUr: "سامنے کھلے ہوئے سیل یا پرچیز بل کو تصدیق کے بعد حذف کریں",
      },
      {
        keys: ["Ctrl", "B"],
        label: "Go Back / Focus Batch Input",
        labelUr: "واپس فہرست پر جائیں / بیچ نمبر پر فوکس کریں",
        description: "Return to the list from Product or Demand forms, or focus Batch # input on the Product Batch Workbench",
        descriptionUr: "فارم سے واپس فہرست پر جائیں یا بیچ ورک بینچ پر بیچ نمبر باکس میں جائیں",
      },
      {
        keys: ["Ctrl", "Enter"],
        label: "Generate Smart Reorder Forecast",
        labelUr: "سمارٹ ری آرڈر فورکاسٹ تیار کریں",
        description: "Calculate suggested reorder quantities on the Purchase Order Forecast screen",
        descriptionUr: "پرچیز آرڈر فورکاسٹ اسکرین پر منگوانے والے مال کی تجویز کردہ مقدار نکالیں",
      },
    ],
  },
  {
    id: "tables",
    name: "Grids, Dropdowns & Modals",
    nameUr: "ٹیبلز، ڈراپ ڈاؤنز اور ونڈوز",
    description: "Effortless hands-free navigation across table cells, controls, and dialogs",
    descriptionUr: "ماؤس کے بغیر ٹیبل خانوں، مینیوز اور ڈائیلاگ ونڈوز میں تیز رفتار کام",
    shortcuts: [
      {
        keys: ["↑", "↓"],
        label: "Navigate Rows & Dropdowns",
        labelUr: "لسٹ اور ٹیبل کی لائنوں میں اوپر نیچے جائیں",
        description: "Move selection highlight up or down in product search, menus, and invoice table rows",
        descriptionUr: "پروڈکٹ سرچ، مینیو اور بل کے ٹیبل میں اوپر یا نیچے کی لائن منتخب کریں",
      },
      {
        keys: ["Enter"],
        label: "Confirm Selection / Next Field",
        labelUr: "انتخاب مکمل کریں / اگلے خانے میں جائیں",
        description: "Pick highlighted search result or advance to the next column in invoice entry tables",
        descriptionUr: "منتخب کردہ آئٹم کو شامل کریں یا بل کے ٹیبل میں اگلے خانے پر جائیں",
      },
      {
        keys: ["Esc"],
        label: "Close Modal / Dismiss Dropdown",
        labelUr: "پاپ اپ ونڈو یا ڈراپ ڈاؤن بند کریں",
        description: "Dismiss any open modal, popup, or dropdown menu",
        descriptionUr: "کھلی ہوئی کسی بھی پاپ اپ ونڈو یا ڈراپ ڈاؤن لسٹ کو بند کریں",
        badge: "Dismiss",
        badgeUr: "بند کریں",
      },
      {
        keys: ["Tab"],
        altKeys: ["Shift", "Tab"],
        label: "Cycle Form Fields",
        labelUr: "فارم کے خانوں میں آگے یا پیچھے جائیں",
        description: "Move keyboard focus forward or backward sequentially between input fields",
        descriptionUr: "فارم کے ان پٹ خانوں میں ترتیب وار آگے یا پیچھے منتقل ہوں",
      },
    ],
  },
];

function KeyCap({ keyStr }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 py-0.5 text-[11px] font-mono font-bold tracking-tight rounded-md shadow-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 select-none">
      {keyStr}
    </kbd>
  );
}

function ShortcutItem({ item, lang }) {
  const showEn = lang === "both" || lang === "en";
  const showUr = lang === "both" || lang === "ur";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors">
      <div className="min-w-0 flex-1 space-y-1">
        {showEn && (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                {item.label}
              </span>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {item.badge}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {item.description}
            </p>
          </div>
        )}

        {showUr && item.labelUr && (
          <div
            dir="rtl"
            className={`${
              showEn
                ? "pt-1 mt-1 border-t border-slate-200/60 dark:border-slate-700/50"
                : ""
            } text-right`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                {item.labelUr}
              </span>
              {(item.badgeUr || item.badge) && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {item.badgeUr || item.badge}
                </span>
              )}
            </div>
            {item.descriptionUr && (
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {item.descriptionUr}
              </p>
            )}
          </div>
        )}
      </div>

      <div
        dir="ltr"
        className="flex items-center gap-1.5 shrink-0 self-start sm:self-center"
      >
        <div className="flex items-center gap-1">
          {item.keys.map((k, i) => (
            <React.Fragment key={k}>
              {i > 0 && <span className="text-xs text-slate-400 font-bold">+</span>}
              <KeyCap keyStr={k} />
            </React.Fragment>
          ))}
        </div>

        {item.altKeys && (
          <>
            <span className="text-[11px] text-slate-400 font-medium px-0.5">
              {lang === "ur" ? "یا" : "or"}
            </span>
            <div className="flex items-center gap-1">
              {item.altKeys.map((k, i) => (
                <React.Fragment key={k}>
                  {i > 0 && <span className="text-xs text-slate-400 font-bold">+</span>}
                  <KeyCap keyStr={k} />
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SHORTCUTS_LANG_STORAGE_KEY = "karobar_shortcuts_modal_lang_v1";

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  const { isDark, theme } = useTheme();
  const [filterQuery, setFilterQuery] = useState("");
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(SHORTCUTS_LANG_STORAGE_KEY);
      if (saved === "en" || saved === "ur" || saved === "both") return saved;
    } catch {
      // ignore storage errors
    }
    return "both";
  });
  const mouseDownRef = useRef(null);
  const searchInputRef = useRef(null);

  const handleLangChange = (nextLang) => {
    setLang(nextLang);
    try {
      localStorage.setItem(SHORTCUTS_LANG_STORAGE_KEY, nextLang);
    } catch {
      // ignore storage errors
    }
  };

  // Focus filter input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
    } else {
      setFilterQuery("");
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose && onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Filter shortcuts across both English and Urdu
  const filteredCategories = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return SHORTCUT_CATEGORIES;

    return SHORTCUT_CATEGORIES.map((cat) => {
      const filtered = cat.shortcuts.filter((s) => {
        const text = `${s.label} ${s.description} ${s.labelUr || ""} ${
          s.descriptionUr || ""
        } ${s.badge || ""} ${s.badgeUr || ""} ${s.keys.join(" ")} ${s.keys.join("+")} ${
          s.altKeys ? `${s.altKeys.join(" ")} ${s.altKeys.join("+")}` : ""
        }`.toLowerCase();
        return text.includes(q);
      });
      return { ...cat, shortcuts: filtered };
    }).filter((cat) => cat.shortcuts.length > 0);
  }, [filterQuery]);

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={(e) => {
        mouseDownRef.current = e.target;
      }}
      onClick={(e) => {
        // Outside click handler
        if (e.target === e.currentTarget && mouseDownRef.current === e.currentTarget) {
          onClose && onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-default"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-2xl shadow-2xl border transition-all duration-200 overflow-hidden ${
          isDark
            ? "bg-slate-900 border-slate-700/80 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b shrink-0 ${
            isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-100 bg-slate-50/70"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl text-white shadow-md"
              style={{
                backgroundColor: theme?.primary_color || "#3b82f6",
              }}
            >
              <CommandLineIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold">
                  Keyboard Shortcuts / کی بورڈ شارٹ کٹس
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  Ctrl + Quick Access
                </span>
              </div>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Work at lightning speed in English &amp; اردو without lifting your hands from the keyboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher: Both | English | اردو */}
            <div
              className={`inline-flex items-center rounded-xl p-0.5 border text-xs font-semibold ${
                isDark
                  ? "bg-slate-800/90 border-slate-700 text-slate-300"
                  : "bg-slate-100 border-slate-200 text-slate-600"
              }`}
              role="group"
              aria-label="Shortcut language selector"
            >
              <LanguageIcon className="w-3.5 h-3.5 mx-1.5 text-slate-400" />
              {[
                { id: "both", label: "EN + اردو" },
                { id: "en", label: "English" },
                { id: "ur", label: "اردو" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleLangChange(opt.id)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    lang === opt.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          className={`px-6 py-3 border-b flex items-center gap-3 ${
            isDark ? "border-slate-800 bg-slate-800/30" : "border-slate-100 bg-slate-50/30"
          }`}
        >
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search shortcuts in English or اردو (e.g. tab, Ctrl+Shift+A, انوائس, ٹیب, کھاتہ)..."
            className="flex-1 bg-transparent text-base sm:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => {
                setFilterQuery("");
                searchInputRef.current?.focus();
              }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>

        {/* Shortcuts List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <KeyIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium">
                No shortcuts matching "{filterQuery}" / کوئی شارٹ کٹ نہیں ملا
              </p>
              <button
                type="button"
                onClick={() => setFilterQuery("")}
                className="mt-3 text-xs font-semibold text-blue-500 hover:underline"
              >
                View all shortcuts / تمام شارٹ کٹس دیکھیں
              </button>
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div key={cat.id} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(lang === "both" || lang === "en") && (
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {cat.name}
                      </h3>
                    )}
                    {lang === "both" && cat.nameUr && (
                      <span className="text-xs text-slate-300 dark:text-slate-600">•</span>
                    )}
                    {(lang === "both" || lang === "ur") && cat.nameUr && (
                      <h3
                        dir="rtl"
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        {cat.nameUr}
                      </h3>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {cat.shortcuts.length} {lang === "ur" ? "شارٹ کٹس" : "shortcuts"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {cat.shortcuts.map((s) => (
                    <ShortcutItem key={s.label} item={s} lang={lang} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Note */}
        <div
          className={`px-6 py-3 border-t flex flex-wrap items-center justify-between gap-2 shrink-0 ${
            isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-100 bg-slate-50/50"
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <SparklesIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              Press{" "}
              <kbd className="px-1 py-0.5 text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                Ctrl+Shift+A
              </kbd>{" "}
              to search &amp; open any page in a new tab, or{" "}
              <kbd className="px-1 py-0.5 text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                Esc
              </kbd>{" "}
              to close • بند کرنے کے لیے Esc دبائیں
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Got it / ٹھیک ہے
          </button>
        </div>
      </div>
    </div>
  );
}
