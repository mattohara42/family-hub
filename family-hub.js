// ════════════════════════════════════════════════════════════════
//  🔧 CONFIGURATION — fill these in before opening the app
// ════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCq_WtqHd5WmJldlNptE8zchu2RmuAX_yE",
  authDomain:        "familyhub-5fc43.firebaseapp.com",
  projectId:         "familyhub-5fc43",
  storageBucket:     "familyhub-5fc43.firebasestorage.app",
  messagingSenderId: "941604403053",
  appId:             "1:941604403053:web:4ba83f1a451693f69b8c64"
};

const GOOGLE_CLIENT_ID = "1023822683234-e0pslac1cag5ju2o26gl5c9kq36udr7q.apps.googleusercontent.com";
const GOOGLE_SCOPES    = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

const WEATHER_API_KEY  = "a8f8bb29d46ba4fab174544439d4a849";   // ← paste your OpenWeatherMap key here
const WEATHER_CITY     = "";   // ← e.g. "Rochester, US"  (optional — can also set in ⚙️)

// ── Pinned API versions & model names ─────────────────────────
// Update these when providers deprecate a version, then note the date.
const GEMINI_MODEL          = 'gemini-2.5-flash';            // pinned 2026-05-31
const GEMINI_API_BASE       = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_MODEL          = 'gpt-4o-mini';                 // pinned 2026-05-31
const OPENAI_API_BASE       = 'https://api.openai.com/v1';
const OWM_API_BASE          = 'https://api.openweathermap.org/data/2.5'; // v2.5 free tier
const DICT_API_BASE         = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DADJOKE_API_BASE      = 'https://icanhazdadjoke.com';

// ── Netlify proxy helpers ──────────────────────────────────────
// When a client-side API key is blank (production Netlify deploy), requests
// are routed through /.netlify/functions/* which holds the key server-side.
// When the key is set in the config block above (local dev), calls go direct.

const OWM_ENDPOINTS = {
  weather:       `${OWM_API_BASE}/weather`,
  forecast:      `${OWM_API_BASE}/forecast`,
  air_pollution: `${OWM_API_BASE}/air_pollution`,
  reverse:       'https://api.openweathermap.org/geo/1.0/reverse',
};

function owmFetch(endpoint, params) {
  if (weatherKey) {
    const url = new URL(OWM_ENDPOINTS[endpoint]);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('appid', weatherKey);
    return fetch(url.toString());
  }
  const qs = new URLSearchParams({ endpoint, ...params });
  return fetch(`/.netlify/functions/weather?${qs}`);
}

function geminiFetch(body) {
  if (mealAiKey) {
    return fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${mealAiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  }
  return fetch('/.netlify/functions/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GEMINI_MODEL, ...body }),
  });
}

// ════════════════════════════════════════════════════════════════

// ── Security: HTML-escape helper (prevents XSS in innerHTML) ──
/** Escape a value before inserting into innerHTML. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Allow only http/https URLs; return '#' for anything else (e.g. javascript:). */
function safeUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? url : '#';
  } catch { return '#'; }
}

/** Safe JSON.parse from localStorage — returns fallback on missing or corrupt data. */
function lsGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}

// ── Detect unconfigured state ──────────────────────────────────
const isConfigured =
  FIREBASE_CONFIG.apiKey !== "YOUR_FIREBASE_API_KEY" &&
  GOOGLE_CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

if (!isConfigured) {
  document.getElementById('configBanner').style.display = 'block';
}

// ── Firebase init ──────────────────────────────────────────────
let db = null;
if (isConfigured) {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
}

// ── State ──────────────────────────────────────────────────────
let currentUser     = null;
let googleToken     = null;
// calendarMeta: [{ id, label, color }]  — migrates from old string-array format
const DEFAULT_COLORS = ['#6c8ef5','#f5a623','#4caf82','#e06c75','#c678dd','#61afef'];
function loadCalendarMeta() {
  const parsed = lsGet('fh_calMeta', null);
  if (parsed) return parsed;
  // Migrate from old string-array format
  const old = lsGet('fh_calendars', ['primary']);
  return old.map((id, i) => ({ id, label: '', color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] }));
}
let calendarMeta  = loadCalendarMeta();
let showHolidays  = localStorage.getItem('fh_holidays') === 'true';
let holidaysColor = localStorage.getItem('fh_holidaysColor') || '#e8a838';
const HOLIDAYS_ID = 'en.usa#holiday@group.v.calendar.google.com';
// File-level constants win; localStorage is the fallback for values set via ⚙️ Settings
let weatherKey      = WEATHER_API_KEY  || localStorage.getItem('fh_wkey')  || '';
let weatherCity     = WEATHER_CITY     || localStorage.getItem('fh_wcity') || ''; // kept for compat
// Multi-location weather
// Migrate legacy single-city to array on first run
(function migrateWeatherLocations() {
  const stored = lsGet('fh_wlocations', null);
  if (stored) return; // already migrated
  const legacy = WEATHER_CITY || localStorage.getItem('fh_wcity') || '';
  localStorage.setItem('fh_wlocations', JSON.stringify(legacy ? [legacy] : []));
})();
let weatherLocations    = lsGet('fh_wlocations', []);
let weatherLocIdx       = 0;                   // currently-displayed location index
const weatherCache      = {};                  // { cityKey: { ts, data } }
const WX_CACHE_TTL      = 30 * 60 * 1000;     // 30 minutes
let weatherForecastMode = localStorage.getItem('fh_wxForecastMode') || '5day'; // '5day' | 'hourly'
let sunArcEnabled       = lsGet('fh_sunArc', true);        // sun-path arc visibility
let snarkyMode          = lsGet('fh_snarkyMode', false);   // WTF/snarky forecast toggle
let wxEnabledViews      = lsGet('fh_wxEnabledViews', { '5day': true, 'hourly': true, 'curve': true, 'radar': true, 'snarky': true });
const snarkyCache       = {};                              // { cacheKey: text } — in-memory per session
let wxTickerEnabled     = lsGet('fh_wxTicker', true);      // weather info ticker
let wxActivityEnabled   = lsGet('fh_wxActivity', true);    // activity tags strip
let userName        = localStorage.getItem('fh_name') || 'Someone';
let appTitle        = localStorage.getItem('fh_appTitle') || 'Family Hub';
let appTitleEmoji   = localStorage.getItem('fh_appTitleEmoji') || '🏠';
let safePaletteMode = lsGet('fh_safePalette', false);
const SAFE_COLORS = [
  '#000000','#E69F00','#56B4E9','#009E73',
  '#F0E442','#0072B2','#D55E00','#CC79A7',
  '#FFFFFF','#888888','#CC3311','#33BBEE',
];
let familyMembers   = lsGet('fh_familyMembers', []);
// each: { name: string }
let todoItems       = []; // in-memory mirror of Firestore 'todo' collection for calendar use
// Migrate old mode names
if (localStorage.getItem('fh_mode') === 'amazing')        localStorage.setItem('fh_mode', 'nautical');
if (localStorage.getItem('fh_mode') === 'nautical-light') localStorage.setItem('fh_mode', 'nautical');
const _savedMode    = localStorage.getItem('fh_mode');
let appMode         = _savedMode || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');  // 'light' | 'dark' | 'nautical'
let mobileTab       = localStorage.getItem('fh_mobileTab') || 'cal';  // 'cal' | 'widgets'
// URL param ?layout=auto|portrait|landscape overrides saved setting (emergency escape)
(function() {
  const p = new URLSearchParams(window.location.search).get('layout');
  if (p === 'auto' || p === 'portrait' || p === 'landscape') {
    localStorage.setItem('fh_layoutMode', p);
    // Strip the param from the URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete('layout');
    window.history.replaceState({}, '', url);
  }
})();
let layoutMode      = localStorage.getItem('fh_layoutMode') || 'auto'; // 'auto' | 'portrait' | 'landscape'
let smsContacts     = lsGet('fh_smsContacts', []);
// migrate legacy single-number setting
(function(){
  const old = localStorage.getItem('fh_smsRecipient');
  if (old && !smsContacts.length) {
    smsContacts = [{ nick: 'Contact', phone: old }];
    localStorage.setItem('fh_smsContacts', JSON.stringify(smsContacts));
    localStorage.removeItem('fh_smsRecipient');
  }
})();

// ── Meal Planning state ────────────────────────────────────────
let mealPlan        = lsGet('fh_mealPlan', {});
let mealAiKey       = localStorage.getItem('fh_mealAiKey')                || '';
let mealAiProvider  = localStorage.getItem('fh_mealAiProvider')           || 'gemini';
let mealDietPrefs   = lsGet('fh_mealDietPrefs', []);
let mealPantryDef   = localStorage.getItem('fh_mealPantry')               || '';
let mealTemplates   = lsGet('fh_mealTemplates', []);
// ── Shopping categories ───────────────────────────────────────────────────
const SHOP_DEFAULT_CATEGORIES = ['Produce','Dairy','Meat & Seafood','Bakery','Frozen','Pantry','Beverages','Household','Other'];
const SHOP_CATEGORY_ICONS = {
  'Produce':'🥦','Dairy':'🧀','Meat & Seafood':'🥩','Bakery':'🍞',
  'Frozen':'🧊','Pantry':'🥫','Beverages':'🧃','Household':'🧹','Other':'📦'
};
let shopCategories = lsGet('fh_shopCategories', SHOP_DEFAULT_CATEGORIES.slice());
let shopCollapsed  = {};   // { categoryName: true } — true means collapsed
// ── Family Assistant state ─────────────────────────────────────────────────
const ASSISTANT_HISTORY_KEY = 'fh_assistantHistory';
const ASSISTANT_HISTORY_MAX = 40; // store up to 40 half-turns (~20 exchanges)
let assistantHistory = (()=>{
  try {
    const saved = JSON.parse(localStorage.getItem(ASSISTANT_HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
})();   // [{role:'user'|'model', parts:[{text}]}]
let shopItemsCache    = [];   // in-memory mirror of shopping items for context
let assistantRecognition = null;  // SpeechRecognition instance
let assistantListening   = false; // true while mic is open
let assistantTTS         = lsGet('fh_assistantTTS', false); // read replies aloud
let assistantWelcomeMode = localStorage.getItem('fh_assistantWelcome') || 'ticker'; // 'static' | 'ticker'
// Starter prompts shown as clickable chips in the empty chat state.
// ⚠️ Keep this current: when a new assistant capability ships (see ASSISTANT_BACKLOG.md),
// add a representative prompt here so users discover it.
const ASSISTANT_QUICK_PROMPTS = [
  "What's on this week?",
  "What do I need at the store?",
  "What's for dinner?",
  "Add milk to shopping",
  "Plan pizza for Friday dinner",
  "Add a $60 internet bill monthly",
];
// ── Widget visibility & placement ────────────────────────────────────────────
const WIDGET_DEFAULTS = { shopping: true, todo: true, budget: true, wotd: true, quote: true, dadjoke: true, yearstrip: true, assistant: true, countdown: true, news: false, stock: false };
let widgetVisibility = { ...WIDGET_DEFAULTS, ...lsGet('fh_widgets', {}) };

// Placement: 'sidebar' (right column) or 'bottom' (full-width strip below layout)
const WIDGET_PLACEMENT_DEFAULTS = {
  shopping: 'sidebar', todo: 'sidebar', budget: 'sidebar',
  wotd: 'sidebar', quote: 'sidebar', dadjoke: 'sidebar',
  yearstrip: 'bottom', assistant: 'sidebar', countdown: 'sidebar',
  news: 'sidebar', stock: 'sidebar',
};
let widgetPlacement = { ...WIDGET_PLACEMENT_DEFAULTS, ...lsGet('fh_widget_placement', {}) };

// Canonical sidebar order for re-insertion
const WIDGET_ORDER = [
  { key: 'shopping',  id: 'shopCard'       },
  { key: 'todo',      id: 'todoCard'       },
  { key: 'budget',    id: 'budgetCard'     },
  { key: 'yearstrip', id: 'yearCard'       },  // sidebar 2-month view
  { key: 'wotd',      id: 'wotdCard'       },
  { key: 'dadjoke',   id: 'dadjokeCard'    },
  { key: 'quote',     id: 'quoteCard'      },
  { key: 'assistant', id: 'assistantCard'  },
  { key: 'countdown', id: 'countdownCard' },
  { key: 'news',      id: 'newsCard'      },
  { key: 'stock',     id: 'stockCard'     },
];

// User-defined widget order (keys only). Persisted in fh_widget_order.
// New widgets not in saved order are appended at the end.
let widgetOrder = lsGet('fh_widget_order', null);

function resolvedWidgetOrder() {
  const base = WIDGET_ORDER.map(w => w.key);
  if (!widgetOrder) return [...base];
  const saved   = widgetOrder.filter(k => base.includes(k));
  const newKeys = base.filter(k => !saved.includes(k));
  return [...saved, ...newKeys];
}

/** Move widget cards between sidebar and #bottomStrip, then enforce visibility */
function applyWidgetPlacement() {
  const sidebar     = document.querySelector('.sidebar');
  const bottomStrip = document.getElementById('bottomStrip');
  if (!sidebar || !bottomStrip) return;

  // Distribute each widget card to the right container in user-defined order
  resolvedWidgetOrder().forEach(key => {
    const entry = WIDGET_ORDER.find(w => w.key === key);
    if (!entry) return;
    const card = document.getElementById(entry.id);
    if (!card) return;
    const dest = widgetPlacement[key] === 'bottom' ? bottomStrip : sidebar;
    dest.appendChild(card);
  });

  // Enforce show/hide
  applyWidgetVisibility();

  // Show/hide the bottom strip container itself
  const hasBottom = bottomStrip.children.length > 0 &&
    [...bottomStrip.children].some(c => c.style.display !== 'none');
  bottomStrip.style.display = hasBottom ? '' : 'none';
}

// ── Widget drag-and-drop ──
let _dndSrcKey = null;

function initWidgetDragDrop() {
  WIDGET_ORDER.forEach(({ key, id }) => {
    const card = document.getElementById(id);
    if (!card) return;
    card.dataset.widgetKey = key;

    // Inject grip handle into card-header (skip if already added)
    const header = card.querySelector('.card-header');
    if (header && !header.querySelector('.widget-drag-handle')) {
      const handle = document.createElement('span');
      handle.className = 'widget-drag-handle';
      handle.textContent = '⠿';
      handle.title = 'Drag to reorder';
      handle.addEventListener('mousedown', () => { card.draggable = true; });
      header.prepend(handle);
    }

    card.addEventListener('dragstart', e => {
      _dndSrcKey = key;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('widget-dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.draggable = false;
      card.classList.remove('widget-dragging');
      document.querySelectorAll('.widget-drop-target').forEach(el => el.classList.remove('widget-drop-target'));
      _dndSrcKey = null;
    });
    card.addEventListener('dragover', e => {
      if (!_dndSrcKey || _dndSrcKey === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.widget-drop-target').forEach(el => el.classList.remove('widget-drop-target'));
      card.classList.add('widget-drop-target');
    });
    card.addEventListener('dragleave', e => {
      if (!e.relatedTarget || !card.contains(e.relatedTarget)) {
        card.classList.remove('widget-drop-target');
      }
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dndSrcKey || _dndSrcKey === key) return;
      card.classList.remove('widget-drop-target');
      const order   = resolvedWidgetOrder();
      const srcIdx  = order.indexOf(_dndSrcKey);
      const tgtIdx  = order.indexOf(key);
      if (srcIdx === -1 || tgtIdx === -1) return;
      order.splice(srcIdx, 1);
      order.splice(tgtIdx, 0, _dndSrcKey);
      widgetOrder = order;
      localStorage.setItem('fh_widget_order', JSON.stringify(widgetOrder));
      applyWidgetPlacement();
    });
  });
}

function applyWidgetVisibility() {
  // yearstrip: which card to show depends on placement
  const yearInBottom = widgetPlacement.yearstrip === 'bottom';
  const yearCard  = document.getElementById('yearCard');
  const yearStrip = document.getElementById('yearStrip');
  if (yearCard)  yearCard.style.display  = (!yearInBottom && widgetVisibility.yearstrip) ? '' : 'none';
  if (yearStrip) yearStrip.style.display = (yearInBottom  && widgetVisibility.yearstrip) ? '' : 'none';

  // All other widget cards
  const MAP = {
    shopping: 'shopCard',
    todo:     'todoCard',
    budget:   'budgetCard',
    wotd:     'wotdCard',
    quote:    'quoteCard',
    dadjoke:  'dadjokeCard',
    assistant:'assistantCard',
    countdown:'countdownCard',
    news:     'newsCard',
    stock:    'stockCard',
  };
  Object.entries(MAP).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = widgetVisibility[key] ? '' : 'none';
  });

  // Re-evaluate bottom strip container visibility
  const bottomStrip = document.getElementById('bottomStrip');
  if (bottomStrip) {
    const hasVisible = [...bottomStrip.children].some(c => c.style.display !== 'none');
    bottomStrip.style.display = hasVisible ? '' : 'none';
  }
}

// ── Budget ───────────────────────────────────────────────────────────────────
let budgetItems = []; // populated by Firestore onSnapshot (or localStorage fallback)
const BUDGET_COLOR = '#e57373'; // all budget items are red

/** Returns dates (as YYYY-MM-DD strings) on which a budget item falls within [startD, endD] */
function budgetDatesInRange(item, startD, endD) {
  const results = [];
  const cur = new Date(startD);
  cur.setHours(0,0,0,0);
  const end = new Date(endD);
  end.setHours(23,59,59,999);

  while (cur <= end) {
    let hit = false;
    const dom = cur.getDate();
    const dow = cur.getDay();
    const m   = cur.getMonth();

    if (item.frequency === 'monthly') {
      hit = (dom === item.dayOfMonth);
    } else if (item.frequency === 'weekly') {
      hit = (dow === item.dayOfWeek);
    } else if (item.frequency === 'biweekly') {
      const anchor = new Date(item.startDate);
      anchor.setHours(0,0,0,0);
      const diffDays = Math.round((cur - anchor) / 86400000);
      hit = (diffDays >= 0 && diffDays % 14 === 0);
    } else if (item.frequency === 'yearly') {
      hit = (m === item.month && dom === item.dayOfMonth);
    }
    if (hit) {
      results.push(cur.toISOString().slice(0,10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return results;
}

/** All budget events for a given date key (YYYY-MM-DD) */
/** Returns todo items with dueDate === dateKey that are not done */
function todosDueOnDate(dateKey) {
  return todoItems.filter(t => t.dueDate === dateKey && !t.done);
}

function budgetEventsForDate(dateKey) {
  if (!budgetItems.length) return [];
  const d = new Date(dateKey + 'T00:00:00');
  return budgetItems.filter(item => budgetDatesInRange(item, d, d).length > 0);
}

/** Total budget amount due in a date range */
function budgetTotalInRange(startD, endD) {
  return budgetItems.reduce((sum, item) => {
    const hits = budgetDatesInRange(item, startD, endD);
    return sum + hits.length * item.amount;
  }, 0);
}

function fmt$(n) { return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function freqLabel(item) {
  if (item.frequency === 'monthly')  return `Monthly · day ${item.dayOfMonth}`;
  if (item.frequency === 'yearly')   return `Yearly · ${new Date(2000, item.month, item.dayOfMonth).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  if (item.frequency === 'weekly')   return `Weekly · ${'Sun Mon Tue Wed Thu Fri Sat'.split(' ')[item.dayOfWeek]}`;
  if (item.frequency === 'biweekly') return `Bi-weekly · from ${item.startDate}`;
  return item.frequency;
}

/** Called whenever budgetItems changes — refreshes card and calendar overlays. */
function onBudgetChanged() {
  renderBudgetCard();
  renderCurrentView();
}

// ── Budget Card ───────────────────────────────────────────────────────────────

function renderBudgetCard() {
  const labelEl = document.getElementById('budgetCardLabel');
  const body    = document.getElementById('budgetCardBody');
  const card    = document.getElementById('budgetCard');
  if (!body || !card) return;

  // ── Compute range & label from the active calendar view ──
  let start, end, periodLabel, summaryTitle;
  const today = new Date().toISOString().slice(0, 10);

  if (calView === 'week') {
    const ws = getWeekStart(calViewDate);
    const we = new Date(ws.getTime() + 6 * 86400000);
    start = ws; end = we;
    const sameMonth = ws.getMonth() === we.getMonth();
    periodLabel = sameMonth
      ? ws.toLocaleDateString([], { month: 'long', year: 'numeric' }) + '  ' + ws.getDate() + '–' + we.getDate()
      : ws.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' – ' + we.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    summaryTitle = 'Total Bills this Week';
  } else if (calView === 'day') {
    const d = calViewDate;
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    end   = start;
    periodLabel = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    summaryTitle = 'Bills Today';
  } else {
    // month (default)
    const yr = calViewDate.getFullYear(), mo = calViewDate.getMonth();
    start = new Date(yr, mo, 1);
    end   = new Date(yr, mo + 1, 0);
    periodLabel = calViewDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
    summaryTitle = 'Total Bills this Month';
  }

  // Collect occurrences in range
  const upcoming = [];
  budgetItems.forEach(item => {
    budgetDatesInRange(item, start, end).forEach(d => upcoming.push({ item, date: d }));
  });
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  // ── Budget total sidebar card — always show week + month ──
  const totalCard  = document.getElementById('budgetTotalCard');
  const totalInner = document.getElementById('budgetTotalInner');
  if (totalCard && totalInner) {
    // Week range anchored to calViewDate
    const ws = getWeekStart(calViewDate);
    const we = new Date(ws.getTime() + 6 * 86400000);
    const weekItems = [];
    budgetItems.forEach(item => budgetDatesInRange(item, ws, we).forEach(d => weekItems.push(item)));
    const weekTotal = weekItems.reduce((s, item) => s + item.amount, 0);

    // Month range anchored to calViewDate
    const yr = calViewDate.getFullYear(), mo = calViewDate.getMonth();
    const ms = new Date(yr, mo, 1), me = new Date(yr, mo + 1, 0);
    const monthItems = [];
    budgetItems.forEach(item => budgetDatesInRange(item, ms, me).forEach(d => monthItems.push(item)));
    const monthTotal = monthItems.reduce((s, item) => s + item.amount, 0);

    if (budgetItems.length && (weekTotal > 0 || monthTotal > 0)) {
      totalInner.innerHTML =
        `<div class="budget-total-row"><span class="budget-total-label">Total Bills this Week</span><span class="budget-total-amount">${fmt$(weekTotal)}</span></div>
         <div class="budget-total-row"><span class="budget-total-label">Total Bills this Month</span><span class="budget-total-amount">${fmt$(monthTotal)}</span></div>`;
      totalCard.style.display = '';
    } else {
      totalCard.style.display = 'none';
    }
  }

  // Hide entire budget card only when there are no budget items at all
  if (!budgetItems.length) {
    card.style.display = 'none';
    return;
  }
  if (widgetVisibility.budget) card.style.display = '';

  // No line items for this period — show totals strip but no list
  if (!upcoming.length) {
    if (labelEl) labelEl.textContent = periodLabel;
    body.innerHTML = '';
    return;
  }

  if (labelEl) labelEl.textContent = periodLabel;
  body.innerHTML = '';

  // ── Add form (hidden by default) ──
  const addForm = document.createElement('div');
  addForm.id = 'budgetAddForm';
  addForm.style.display = 'none';
  addForm.innerHTML = `
    <div class="budget-add-form-inner">
      <div class="budget-add-title">New Budget Item</div>
      <div class="field"><label>Name</label>
        <input type="text" id="biName" placeholder="e.g. Internet, Electric, Loan…" /></div>
      <div class="field"><label>Amount ($)</label>
        <input type="number" id="biAmount" placeholder="0.00" step="0.01" min="0" /></div>
      <div class="field"><label>Frequency</label>
        <select id="biFreq" onchange="updateBudgetFormFields()" class="budget-select">
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="yearly">Yearly</option>
        </select></div>
      <div class="field" id="biDayOfMonthField">
        <label>Day of Month</label>
        <input type="number" id="biDayOfMonth" min="1" max="31" placeholder="e.g. 15" /></div>
      <div class="field" id="biDayOfWeekField" style="display:none">
        <label>Day of Week</label>
        <select id="biDayOfWeek" class="budget-select">
          <option value="0">Sunday</option><option value="1">Monday</option>
          <option value="2">Tuesday</option><option value="3">Wednesday</option>
          <option value="4">Thursday</option><option value="5">Friday</option>
          <option value="6">Saturday</option>
        </select></div>
      <div class="field" id="biMonthField" style="display:none">
        <label>Month</label>
        <select id="biMonth" class="budget-select">
          <option value="0">January</option><option value="1">February</option>
          <option value="2">March</option><option value="3">April</option>
          <option value="4">May</option><option value="5">June</option>
          <option value="6">July</option><option value="7">August</option>
          <option value="8">September</option><option value="9">October</option>
          <option value="10">November</option><option value="11">December</option>
        </select></div>
      <div class="field" id="biStartDateField" style="display:none">
        <label>First Occurrence Date</label>
        <input type="date" id="biStartDate" class="budget-date-input" /></div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-secondary btn-sm" onclick="cancelBudgetCardAdd()" style="flex:1">Cancel</button>
        <button class="btn btn-primary btn-sm"   onclick="saveAddBudgetItem()"   style="flex:1">Add</button>
      </div>
    </div>`;
  body.appendChild(addForm);

  // ── Bill rows ──
  upcoming.forEach(({ item, date }) => {
    const isPast  = date < today;
    const isToday = date === today;
    const row = document.createElement('div');
    row.className = 'budget-card-row'
      + (isPast  ? ' budget-card-row-past'  : '')
      + (isToday ? ' budget-card-row-today' : '');
    const dateLbl = calView === 'day' ? '' :
      new Date(date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
    row.innerHTML = `
      ${dateLbl ? `<span class="budget-card-date">${dateLbl}${isToday ? ' <span class="budget-card-today-badge">today</span>' : ''}</span>` : ''}
      <span class="budget-card-name">${esc(item.name)}</span>
      <span class="budget-card-amt">${fmt$(item.amount)}</span>
      <button class="budget-item-del" onclick="deleteBudgetItem('${item.id}')" title="Remove">✕</button>`;
    body.appendChild(row);
  });

  // ── Manage bills toggle ──
  const manageToggle = document.createElement('button');
  manageToggle.className = 'budget-manage-toggle';
  manageToggle.textContent = 'Manage bills ▾';
  manageToggle.onclick = () => {
    const list = document.getElementById('budgetManageList');
    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : '';
    manageToggle.textContent = open ? 'Manage bills ▾' : 'Manage bills ▴';
  };
  body.appendChild(manageToggle);

  const manageList = document.createElement('div');
  manageList.id = 'budgetManageList';
  manageList.style.display = 'none';
  budgetItems.forEach(item => {
    const r = document.createElement('div');
    r.className = 'budget-item-row';
    r.innerHTML = `
      <div class="budget-item-dot"></div>
      <div style="flex:1">
        <div class="budget-item-name">${esc(item.name)}</div>
        <div class="budget-item-meta">${freqLabel(item)}</div>
      </div>
      <div class="budget-item-amt">${fmt$(item.amount)}</div>
      <button class="budget-item-del" onclick="deleteBudgetItem('${item.id}')" title="Remove">✕</button>`;
    manageList.appendChild(r);
  });
  body.appendChild(manageList);
}

function openBudgetCardAdd() {
  const form = document.getElementById('budgetAddForm');
  if (!form) return;
  document.getElementById('biName').value       = '';
  document.getElementById('biAmount').value     = '';
  document.getElementById('biFreq').value       = 'monthly';
  document.getElementById('biDayOfMonth').value = new Date().getDate();
  document.getElementById('biStartDate').value  = new Date().toISOString().slice(0, 10);
  updateBudgetFormFields();
  form.style.display = '';
  document.getElementById('biName').focus();
  document.getElementById('budgetAddBtn').style.display = 'none';
}

function cancelBudgetCardAdd() {
  const form = document.getElementById('budgetAddForm');
  if (form) form.style.display = 'none';
  const btn = document.getElementById('budgetAddBtn');
  if (btn) btn.style.display = '';
}

function updateBudgetFormFields() {
  const freq = document.getElementById('biFreq').value;
  document.getElementById('biDayOfMonthField').style.display = (freq === 'monthly' || freq === 'yearly') ? '' : 'none';
  document.getElementById('biDayOfWeekField').style.display  = (freq === 'weekly')    ? '' : 'none';
  document.getElementById('biMonthField').style.display      = (freq === 'yearly')    ? '' : 'none';
  document.getElementById('biStartDateField').style.display  = (freq === 'biweekly')  ? '' : 'none';
}

async function deleteBudgetItem(id) {
  const item = budgetItems.find(b => b.id === id);
  if (!item || !confirm(`Remove "${item.name}"?`)) return;
  if (db) {
    await db.collection('budget').doc(id).delete();
  } else {
    budgetItems = budgetItems.filter(b => b.id !== id);
    localStorage.setItem('fh_budgetItems', JSON.stringify(budgetItems));
    onBudgetChanged();
  }
}

function scrollToBudgetCard() {
  const card = document.getElementById('budgetCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveAddBudgetItem() {
  const name   = document.getElementById('biName').value.trim();
  const amount = parseFloat(document.getElementById('biAmount').value);
  const freq   = document.getElementById('biFreq').value;
  if (!name)                        { alert('Please enter a name.');         return; }
  if (isNaN(amount) || amount < 0)  { alert('Please enter a valid amount.'); return; }

  const item = { name, amount, frequency: freq, color: BUDGET_COLOR,
                 createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  if (freq === 'monthly')  { item.dayOfMonth = parseInt(document.getElementById('biDayOfMonth').value) || 1; }
  if (freq === 'weekly')   { item.dayOfWeek  = parseInt(document.getElementById('biDayOfWeek').value); }
  if (freq === 'biweekly') { item.startDate  = document.getElementById('biStartDate').value; }
  if (freq === 'yearly')   {
    item.month      = parseInt(document.getElementById('biMonth').value);
    item.dayOfMonth = parseInt(document.getElementById('biDayOfMonth').value) || 1;
  }

  if (db) {
    await db.collection('budget').add(item);
  } else {
    item.id = String(Date.now());
    budgetItems.push(item);
    localStorage.setItem('fh_budgetItems', JSON.stringify(budgetItems));
    onBudgetChanged();
  }
  cancelBudgetCardAdd();
}

// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MEAL_LOADING_MSGS = [
  "Checking with Wingmings…","Acquiring Cheesy Dibbles…","CANAL!!!","Sipica Sipica!","CHOOCH!",
  "Adding side trip to Barnes and Bungle…","Maflingo Alert…","Don't go furout me!",
  "Stinging and Stoonging…","Building the sangwiches…","Searching for trockolates…"
];
let mealLoadingMsgs = lsGet('fh_mealLoadingMsgs', null) || [...DEFAULT_MEAL_LOADING_MSGS];
const MEAL_DIET_OPTIONS = ['Vegetarian','Vegan','Gluten-Free','Dairy-Free','Low-Carb','Nut-Free'];
const RECIPE_SITES = {
  allrecipes:    { name: 'AllRecipes',     url: q => `https://www.allrecipes.com/search?q=${encodeURIComponent(q)}` },
  seriouseats:   { name: 'Serious Eats',   url: q => `https://www.seriouseats.com/search?q=${encodeURIComponent(q)}` },
  nytcooking:    { name: 'NYT Cooking',    url: q => `https://cooking.nytimes.com/search?q=${encodeURIComponent(q)}` },
  epicurious:    { name: 'Epicurious',     url: q => `https://www.epicurious.com/search/${encodeURIComponent(q)}` },
  simplyrecipes: { name: 'Simply Recipes', url: q => `https://www.simplyrecipes.com/search?q=${encodeURIComponent(q)}` },
  bonappetit:    { name: "Bon Appétit",    url: q => `https://www.bonappetit.com/search?q=${encodeURIComponent(q)}` },
};
// Modal state
let _mealDate = '';   // YYYY-MM-DD
let _mealType = 'dinner'; // 'breakfast'|'lunch'|'dinner'|'all'
let _mealSuggestions = []; // current AI suggestions
// Meal-detail modal state
let _mealDetailDate = '';
let _mealDetailType = '';
const _mealImgCache = {};   // { lowercaseName: thumbUrl|null } — best-effort dish photos
const MEAL_ADJUST_PRESETS = ['Vegetarian','Vegan','Lactose-free','Gluten-free','Lower-carb','Spicier','Kid-friendly','Quicker'];

// ── Google Sign-In ─────────────────────────────────────────────
let tokenClient;
let gsiReady = false;

// Called by the GSI script once it has loaded
function onGsiLoad() {
  gsiReady = true;
  initGoogleAuth();
}

// Register service worker for offline support / PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

window.addEventListener('load', () => {
  if (!isConfigured) return;
  // GSI may already be ready (cached) or will call onGsiLoad when it loads
  if (typeof google !== 'undefined' && google.accounts) {
    gsiReady = true;
    initGoogleAuth();
  }
  applyAppMode(appMode);
  applyAppTitle();
  applySafePaletteMode();
  applyLayoutMode();
  setMobileTab(mobileTab);
  updateStatusPill();
  if (weatherLocations.length) showWeatherLocation(0);
  else if (weatherCity) { weatherLocations = [weatherCity]; showWeatherLocation(0); }
  switchCalView(calView);   // sets up tabs + renders the right view
  renderYearStrip();
  setupCalSwipe();
  // Load ICS subs even without Google auth; loadAllCalendars also calls this for signed-in users
  if (icsSubs.length && !googleToken) {
    loadIcsSubs().then(() => { renderCalendarTabs(); renderCurrentView(); renderYearStrip(); });
  }
  setupListeners();
  loadBgFromDb();
  populateTodoAssigneeDropdown();
  populateShopCategorySelect();
  applyWidgetPlacement();   // moves cards to sidebar/bottom, then calls applyWidgetVisibility
  initWidgetDragDrop();
  renderBudgetCard();
  loadWotd();
  loadDadJoke();
  loadQuote();
  loadNewsFeeds();
  loadStockQuotes();
  setupKonamiCode();
  initAssistantVoice();
  updateAssistantTtsBtn();      // set the 🔊/🔇 voice-output toggle state
  renderAssistantMessages();   // render empty-state welcome + quick-prompt chips
  // Briefing is now on-demand via the pill button in the assistant header
  renderCountdownCard(); // generate after page settles + weather/cal data loads
  // Close SMS popover on outside click
  document.addEventListener('click', e => {
    const pop = document.getElementById('smsPopover');
    if (pop && !pop.contains(e.target) && e.target.id !== 'smsTriggerBtn')
      pop.style.display = 'none';
  });
  // Escape key closes event editor
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('eventEditorModal');
      if (modal && modal.style.display !== 'none') closeEventEditor();
    }
    // Alt+Shift+L → cycle layout mode (emergency escape if settings are unreachable)
    if (e.altKey && e.shiftKey && e.key === 'L') {
      const modes = ['auto', 'landscape', 'portrait'];
      layoutMode = modes[(modes.indexOf(layoutMode) + 1) % modes.length];
      localStorage.setItem('fh_layoutMode', layoutMode);
      applyLayoutMode();
      // Brief toast so user knows what mode they're now in
      const t = document.createElement('div');
      t.textContent = `Layout: ${layoutMode}`;
      Object.assign(t.style, { position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
        background:'var(--accent)', color:'#fff', padding:'8px 18px', borderRadius:'8px',
        fontSize:'0.9rem', zIndex:'9999', pointerEvents:'none' });
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2000);
    }
  });
});

function initGoogleAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
    callback: async (resp) => {
      if (resp.error) { console.error('OAuth error', resp); return; }
      googleToken = resp.access_token;

      // Sign in to Firebase Auth with the Google credential so that
      // Firestore Security Rules can use request.auth (A01/A07 fix).
      try {
        const credential = firebase.auth.GoogleAuthProvider.credential(null, googleToken);
        await firebase.auth().signInWithCredential(credential);
      } catch(e) { console.warn('Firebase Auth sign-in failed', e); }

      // Fetch user profile if not already known
      if (!currentUser) {
        try {
          const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          const p = await r.json();
          currentUser = { name: p.name, email: p.email, picture: p.picture };
          localStorage.setItem('fh_user', JSON.stringify(currentUser));
          onSignedIn();
        } catch(e) { console.error('userinfo fetch failed', e); }
      }
      loadAllCalendars();
    }
  });

  // Restore session from previous visit
  const saved = lsGet('fh_user', null);
  if (saved) {
    currentUser = saved;
    onSignedIn();
    // Silently refresh token (no prompt)
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function signIn() {
  if (!isConfigured) { alert('Please complete setup first — see the banner at the top.'); return; }
  if (!gsiReady || !tokenClient) {
    alert('Google sign-in is still loading, please try again in a moment.');
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function signOut() {
  if (googleToken) google.accounts.oauth2.revoke(googleToken);
  firebase.auth().signOut().catch(() => {});
  currentUser = null; googleToken = null;
  localStorage.removeItem('fh_user');
  document.getElementById('calNotSignedIn').style.display = '';
  document.getElementById('calendarTabs').innerHTML = '';
  calEventCache = {};
  disabledCals.clear();
  updateStatusPill();
  renderCurrentView();
  renderYearStrip();
}

function onSignedIn() {
  document.getElementById('calNotSignedIn').style.display = 'none';
  // Reveal calendar section in settings
  document.getElementById('settingCalNotSignedIn').style.display = 'none';
  document.getElementById('settingCalSignedIn').style.display = '';
  renderSettingCalList();
  updateStatusPill();
}

// ── Control card (collapsible status + calendars) ──────────────
let controlCardOpen = false;

function updateStatusPill() {
  const firebaseOk = isConfigured && db !== null;
  const googleOk   = !!currentUser;
  const calOk      = googleOk && (typeof calendarMeta !== 'undefined') && calendarMeta.length > 0;
  const weatherOk  = !!(typeof weatherKey !== 'undefined' && weatherKey);
  const allOk      = firebaseOk && googleOk && calOk && weatherOk;

  const pill = document.getElementById('statusPill');
  if (!pill) return;
  if (allOk) {
    pill.textContent = 'CONNECTED';
    pill.className = 'status-pill status-connected';
  } else {
    pill.textContent = 'STATUS';
    pill.className = 'status-pill status-fix';
  }
  // Refresh body content if open
  if (controlCardOpen) showControlCardView();
}

function toggleControlCard() {
  controlCardOpen = !controlCardOpen;
  const body    = document.getElementById('ctrlBody');
  const chevron = document.getElementById('ctrlChevron');
  if (!body || !chevron) return;
  body.style.display    = controlCardOpen ? '' : 'none';
  chevron.style.transform = controlCardOpen ? 'rotate(90deg)' : '';
  if (controlCardOpen) showControlCardView();
}

function handleStatusPillClick(e) {
  e.stopPropagation();
  controlCardOpen = true;
  const body    = document.getElementById('ctrlBody');
  const chevron = document.getElementById('ctrlChevron');
  if (body)    body.style.display = '';
  if (chevron) chevron.style.transform = 'rotate(90deg)';
  showControlCardView();
}

function showControlCardView() {
  renderCtrlStatusView();
}

function renderCtrlStatusView() {
  const container = document.getElementById('ctrlStatusRows');
  if (!container) return;

  const firebaseOk = isConfigured && db !== null;
  const googleOk   = !!currentUser;
  const calOk      = googleOk && (typeof calendarMeta !== 'undefined') && calendarMeta.length > 0;
  const weatherOk  = !!(typeof weatherKey !== 'undefined' && weatherKey);
  const aiOk       = !!(typeof mealAiKey !== 'undefined' && mealAiKey);

  const checks = [
    {
      label: 'Firebase',
      desc:  firebaseOk ? 'Firestore connected — shared state is live' : 'Add FIREBASE_CONFIG to family-hub.js',
      ok: firebaseOk
    },
    {
      label: 'Google Sign-in',
      desc:  googleOk
        ? `Signed in as ${currentUser.name || currentUser.email}`
        : 'Required for Calendar access and Google Photos',
      ok: googleOk
    },
    {
      label: 'Google Calendar',
      desc:  calOk
        ? `${calendarMeta.length} calendar${calendarMeta.length !== 1 ? 's' : ''} loaded — toggle visibility in ⚙️ Calendar`
        : googleOk ? 'Sign in and grant Calendar permissions when prompted' : 'Requires Google sign-in',
      ok: calOk
    },
    {
      label: 'Weather API',
      desc:  weatherOk ? 'OpenWeatherMap key active' : 'Add your free API key in ⚙️ Weather',
      ok: weatherOk
    },
    {
      label: 'Gemini AI',
      desc:  aiOk ? 'AI Studio key active — meal planning enabled' : 'Add an AI Studio key in ⚙️ Meals to enable AI meal planning',
      ok: aiOk
    },
  ];

  container.innerHTML = checks.map(c => `
    <div class="ctrl-status-row">
      <span class="ctrl-status-dot ${c.ok ? 'ok' : 'fail'}"></span>
      <div class="ctrl-status-text">
        <span class="ctrl-status-label">${c.label}</span>
        <span class="ctrl-status-desc">${c.desc}</span>
      </div>
    </div>
  `).join('');

  // Sign-in / sign-out button visibility
  const signIn  = document.getElementById('signInBtn');
  const signOut = document.getElementById('signOutBtn');
  if (signIn)  signIn.style.display  = googleOk ? 'none' : '';
  if (signOut) signOut.style.display = googleOk ? ''     : 'none';
}


// ── Calendar ───────────────────────────────────────────────────
const CAL_COLORS = DEFAULT_COLORS;
const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let calViewDate    = new Date();  // anchor date for any view
let calView        = localStorage.getItem('fh_calView') || 'month'; // 'month'|'week'|'day'
// calEventCache: { [calId]: { [YYYY-MM-DD]: [{summary, color, holiday, allDay, startDT, endDT}] } }
let calEventCache  = {};
// IDs currently hidden by the user clicking a pill
let disabledCals   = new Set();

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

function changeCalPeriod(delta) {
  if (calView === 'month') {
    calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + delta, 1);
  } else if (calView === 'week') {
    calViewDate = new Date(calViewDate.getTime() + delta * 7 * 86400000);
  } else if (calView === 'agenda') {
    calViewDate = new Date(calViewDate.getTime() + delta * 30 * 86400000);
  } else {
    calViewDate = new Date(calViewDate.getTime() + delta * 86400000);
  }
  renderCurrentView();
  renderYearStrip();
  if (googleToken) loadAllCalendars();
}

function goToToday() {
  calViewDate = new Date();
  renderCurrentView();
  renderYearStrip();
  if (googleToken) loadAllCalendars();
}

function switchCalView(view) {
  calView = view;
  localStorage.setItem('fh_calView', view);
  ['month','week','day','agenda'].forEach(v => {
    const btn = document.getElementById('viewTab_' + v);
    if (btn) btn.classList.toggle('active', v === view);
  });
  renderCurrentView();
  if (googleToken) loadAllCalendars();
}

function renderCurrentView() {
  injectLocalEvents();
  document.getElementById('calGrid').style.display      = calView === 'month'  ? ''     : 'none';
  document.getElementById('weekView').style.display     = calView === 'week'   ? 'flex' : 'none';
  document.getElementById('dayView').style.display      = calView === 'day'    ? 'flex' : 'none';
  document.getElementById('agendaView').style.display   = calView === 'agenda' ? 'flex' : 'none';
  if (calView === 'month')  renderMonthGrid();
  if (calView === 'week')   renderWeekGrid();
  if (calView === 'day')    renderDayGrid();
  if (calView === 'agenda') renderAgendaView();

  // Show "Today" button when the view has navigated away from the current period
  const btn = document.getElementById('backToTodayBtn');
  if (btn) {
    const now = new Date();
    let awayFromToday = false;
    if (calView === 'month') {
      awayFromToday = calViewDate.getFullYear() !== now.getFullYear() || calViewDate.getMonth() !== now.getMonth();
    } else if (calView === 'week') {
      const ws = getWeekStart(calViewDate);
      const todayWs = getWeekStart(now);
      awayFromToday = ws.toDateString() !== todayWs.toDateString();
    } else if (calView === 'day') {
      awayFromToday = calViewDate.toDateString() !== now.toDateString();
    }
    btn.style.display = awayFromToday ? '' : 'none';
  }

  renderBudgetCard();
}

// ── Week View ─────────────────────────────────────────────────
function renderWeekGrid() {
  const container = document.getElementById('weekView');
  container.innerHTML = '';
  const today     = new Date();
  const weekStart = getWeekStart(calViewDate);
  const weekEnd   = new Date(weekStart.getTime() + 6 * 86400000);

  // Nav label
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear  = weekStart.getFullYear() === weekEnd.getFullYear();
  let label;
  if (sameMonth && sameYear) {
    label = weekStart.toLocaleDateString([], { month: 'long', year: 'numeric' })
          + '  ' + weekStart.getDate() + '–' + weekEnd.getDate();
  } else {
    label = weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })
          + ' – ' + weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  document.getElementById('calMonthLabel').textContent = label;

  const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const grid = document.createElement('div');
  grid.className = 'week-grid';

  for (let i = 0; i < 7; i++) {
    const day    = new Date(weekStart.getTime() + i * 86400000);
    const isToday = day.toDateString() === today.toDateString();
    const dateKey = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;

    const col = document.createElement('div');
    col.className = 'week-day-col' + (isToday ? ' today' : '');

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'week-day-header';
    hdr.innerHTML = `<div class="week-day-dow">${DOW[i].slice(0,3)}</div>
                     <div class="week-day-num">${day.getDate()}</div>`;
    if (googleToken) {
      hdr.title = 'Click to add event';
      hdr.style.cursor = 'pointer';
      hdr.classList.add('can-add');
      hdr.onclick = () => openEventEditor(null, dateKey);
    }
    col.appendChild(hdr);

    // ── To-Do due on this day (always at TOP, just under header) ──
    const weekTodos = todosDueOnDate(dateKey);
    if (weekTodos.length) {
      const todoStrip = document.createElement('div');
      todoStrip.style.cssText = 'border-bottom:1px solid rgba(108,142,245,.2);padding:4px 5px 5px;background:rgba(108,142,245,.06);flex-shrink:0';
      weekTodos.forEach(todo => {
        const el = document.createElement('div');
        el.style.cssText = 'font-size:.62rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 3px';
        el.textContent = '✅ ' + todo.text + (todo.assignedTo ? ' · ' + todo.assignedTo : '');
        el.title = todo.text;
        todoStrip.appendChild(el);
      });
      col.appendChild(todoStrip);
    }

    // Events
    const body = document.createElement('div');
    body.className = 'week-day-body';

    const evts = Object.entries(calEventCache)
      .filter(([calId]) => !disabledCals.has(calId))
      .flatMap(([, byDate]) => byDate[dateKey] || [])
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return (a.startDT || '') < (b.startDT || '') ? -1 : 1;
      });

    if (!evts.length) {
      const empty = document.createElement('div');
      empty.className = 'week-empty';
      empty.textContent = '—';
      body.appendChild(empty);
    } else {
      evts.forEach(ev => {
        const pill = document.createElement('div');
        pill.className = 'week-event';
        pill.style.background = ev.color;
        pill.title = ev.summary;
        if (!ev.allDay && ev.startDT) {
          const t = document.createElement('span');
          t.className = 'week-event-time';
          t.textContent = new Date(ev.startDT).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          pill.appendChild(t);
        }
        const s = document.createElement('span');
        s.textContent = (ev.holiday ? '🎉 ' : '') + ev.summary;
        pill.appendChild(s);
        if (!ev.holiday && ev.eventId) {
          pill.onclick = e => { e.stopPropagation(); openEventEditor(ev); };
          pill.draggable = true;
          pill.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify({
              eventId: ev.eventId, calId: ev.calId, allDay: ev.allDay,
              startDT: ev.startDT, endDT: ev.endDT,
              startDate: ev.startDate, endDate: ev.endDate,
            }));
            setTimeout(() => pill.classList.add('cal-dnd-dragging'), 0);
          });
          pill.addEventListener('dragend', () => pill.classList.remove('cal-dnd-dragging'));
        }
        body.appendChild(pill);
      });
    }

    col.appendChild(body);

    // Drop zone: the whole day column accepts dragged events
    if (googleToken) {
      col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('cal-dnd-over'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('cal-dnd-over'); });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('cal-dnd-over');
        try { rescheduleEvent(JSON.parse(e.dataTransfer.getData('text/plain')), dateKey); } catch(_) {}
      });
    }

    // Budget strip
    const budgetDayItems = budgetEventsForDate(dateKey);
    if (budgetItems.length && budgetDayItems.length) {
      const budgetStrip = document.createElement('div');
      budgetStrip.className = 'week-budget-strip';
      budgetDayItems.forEach(item => {
        const el = document.createElement('div');
        el.className = 'week-budget-item';
        el.style.color = '#e57373';
        el.textContent = `💰 ${item.name} ${fmt$(item.amount)}`;
        el.title = `${item.name} — ${fmt$(item.amount)}`;
        budgetStrip.appendChild(el);
      });
      const dayTotal = budgetDayItems.reduce((s, it) => s + it.amount, 0);
      const tot = document.createElement('div');
      tot.className = 'week-budget-total';
      tot.textContent = fmt$(dayTotal);
      budgetStrip.appendChild(tot);
      budgetStrip.onclick = scrollToBudgetCard;
      budgetStrip.style.cursor = 'pointer';
      col.appendChild(budgetStrip);
    }

    // ── Meal strip (always at the BOTTOM of the day card) ──
    const mealsStrip = document.createElement('div');
    mealsStrip.className = 'week-meals-strip';
    const dayMeals = mealPlan[dateKey] || {};
    const MEAL_ICONS = { breakfast:'🌅', lunch:'☀️', dinner:'🌙' };
    const plannedTypes = ['breakfast','lunch','dinner'].filter(t => dayMeals[t]);
    if (plannedTypes.length) {
      plannedTypes.forEach(t => {
        const item = document.createElement('div');
        item.className = 'week-meal-item';
        item.title = dayMeals[t].name;
        item.onclick = () => openMealDetail(dateKey, t);

        const label = document.createElement('span');
        label.textContent = MEAL_ICONS[t] + ' ' + dayMeals[t].name;
        label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'meal-remove-btn';
        removeBtn.title = 'Remove meal';
        removeBtn.textContent = '×';
        removeBtn.onclick = e => { e.stopPropagation(); removeMeal(dateKey, t); };

        item.appendChild(label);
        item.appendChild(removeBtn);
        mealsStrip.appendChild(item);
      });
    } else {
      const addBtn = document.createElement('button');
      addBtn.className = 'week-add-meal-btn';
      addBtn.textContent = '🍽 + plan meal';
      addBtn.onclick = () => openMealModal(dateKey, 'all');
      mealsStrip.appendChild(addBtn);
    }
    col.appendChild(mealsStrip);

    grid.appendChild(col);
  }
  container.appendChild(grid);

  // Bulk "add all week's ingredients to shopping list" button
  const bulkBar = document.createElement('div');
  bulkBar.style.cssText = 'display:flex;justify-content:flex-end;padding:6px 2px 2px';
  const bulkBtn = document.createElement('button');
  bulkBtn.className = 'btn btn-sm';
  bulkBtn.textContent = '🛒 Add week\'s ingredients to shopping';
  bulkBtn.style.cssText = 'font-size:.75rem;padding:4px 10px';
  bulkBtn.onclick = exportWeekMealsToShopping;
  bulkBar.appendChild(bulkBtn);
  container.appendChild(bulkBar);
}

// ── Day View ──────────────────────────────────────────────────
function renderDayGrid() {
  const container = document.getElementById('dayView');
  container.innerHTML = '';
  const d       = calViewDate;
  const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Nav label
  document.getElementById('calMonthLabel').textContent =
    d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const evts = Object.entries(calEventCache)
    .filter(([calId]) => !disabledCals.has(calId))
    .flatMap(([, byDate]) => byDate[dateKey] || []);

  const allDayEvts = evts.filter(ev => ev.allDay);
  const timedEvts  = evts.filter(ev => !ev.allDay && ev.startDT)
    .sort((a, b) => a.startDT < b.startDT ? -1 : 1);

  const wrap = document.createElement('div');
  wrap.className = 'day-view-wrap';

  // ── All-day section ──
  const allDayRow = document.createElement('div');
  allDayRow.className = 'day-allday-row';
  const adLabel = document.createElement('div');
  adLabel.className = 'day-time-label';
  adLabel.innerHTML = googleToken
    ? `All day <span style="font-size:.7rem;color:var(--accent);cursor:pointer;margin-left:4px" title="Add all-day event" onclick="openEventEditor(null,'${dateKey}',null,null,true)">＋</span>`
    : 'All day';
  const adPills = document.createElement('div');
  adPills.className = 'day-allday-pills';
  if (allDayEvts.length) {
    allDayEvts.forEach(ev => {
      const p = document.createElement('div');
      p.className = 'day-event-pill';
      p.style.background = ev.color;
      p.innerHTML = `<span class="evt-title">${(ev.holiday ? '🎉 ' : '') + esc(ev.summary)}</span>`;
      if (!ev.holiday && ev.eventId) {
        p.style.cursor = 'pointer';
        p.onclick = () => openEventEditor(ev);
      }
      adPills.appendChild(p);
    });
  } else {
    adPills.style.cssText = 'font-size:.75rem;color:var(--muted);padding-top:3px';
    adPills.textContent = 'No all-day events';
  }
  allDayRow.appendChild(adLabel);
  allDayRow.appendChild(adPills);
  wrap.appendChild(allDayRow);


  // ── Budget section (day view) ──
  const budgetDayItems = budgetEventsForDate(dateKey);
  if (budgetItems.length && budgetDayItems.length) {
    const budgetSection = document.createElement('div');
    budgetSection.className = 'budget-day-section';
    budgetSection.style.cursor = 'pointer';
    budgetSection.onclick = scrollToBudgetCard;
    const budgetHdr = document.createElement('div');
    budgetHdr.style.cssText = 'font-size:.78rem;font-weight:700;color:#e57373;margin-bottom:6px';
    budgetHdr.textContent = '💰 Bills Due Today';
    budgetSection.appendChild(budgetHdr);
    budgetDayItems.forEach(item => {
      const r = document.createElement('div');
      r.className = 'budget-day-item';
      r.innerHTML = `<span class="budget-day-name"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e57373;margin-right:6px"></span>${esc(item.name)}</span>
                     <span class="budget-day-amt">${fmt$(item.amount)}</span>`;
      budgetSection.appendChild(r);
    });
    const dayTotal = budgetDayItems.reduce((s, it) => s + it.amount, 0);
    const totRow = document.createElement('div');
    totRow.style.cssText = 'display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;padding-top:5px;border-top:1px solid rgba(255,193,7,.2);margin-top:3px';
    totRow.innerHTML = `<span style="color:var(--muted)">Total</span><span style="color:#e57373">${fmt$(dayTotal)}</span>`;
    budgetSection.appendChild(totRow);
    wrap.appendChild(budgetSection);
  }

  // ── To-Do items due today ──
  const dayTodos = todosDueOnDate(dateKey);
  if (dayTodos.length) {
    const todoSection = document.createElement('div');
    todoSection.style.cssText = 'background:rgba(108,142,245,.07);border-radius:8px;padding:8px 10px;margin-bottom:8px;border:1px solid rgba(108,142,245,.2)';
    const todoHdr = document.createElement('div');
    todoHdr.style.cssText = 'font-size:.78rem;font-weight:700;color:var(--accent);margin-bottom:6px';
    todoHdr.textContent = '✅ To-Dos Due Today';
    todoSection.appendChild(todoHdr);
    dayTodos.forEach(todo => {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;justify-content:space-between;font-size:.82rem;padding:3px 0;border-bottom:1px solid rgba(108,142,245,.1)';
      r.innerHTML = `<span style="color:var(--text)">${esc(todo.text)}</span>
                     ${todo.assignedTo ? `<span style="color:var(--accent);font-size:.75rem">👤 ${todo.assignedTo}</span>` : ''}`;
      todoSection.appendChild(r);
    });
    wrap.appendChild(todoSection);
  }

  // ── Hourly timeline 6 AM – 10 PM ──
  const MEAL_HOURS = { breakfast: 8, lunch: 12, dinner: 17 };
  const MEAL_ICONS  = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };
  const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
  const dayMealsObj = mealPlan[dateKey] || {};

  const hourBuckets = {};
  timedEvts.forEach(ev => {
    const h = new Date(ev.startDT).getHours();
    (hourBuckets[h] || (hourBuckets[h] = [])).push(ev);
  });

  const timeline = document.createElement('div');
  timeline.className = 'day-timeline';

  const nowHour = new Date().getHours();
  const isViewingToday = calViewDate.toDateString() === new Date().toDateString();

  for (let h = 6; h <= 22; h++) {
    const isCurrentHour = isViewingToday && h === nowHour;
    const row   = document.createElement('div');
    row.className = 'day-hour-row' + (isCurrentHour ? ' current-hour' : '');

    const lbl = document.createElement('div');
    lbl.className = 'day-hour-label';
    lbl.textContent = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h-12} PM`;

    const slot = document.createElement('div');
    slot.className = 'day-hour-slot';

    (hourBuckets[h] || []).forEach(ev => {
      const startStr = new Date(ev.startDT).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const endStr   = ev.endDT ? new Date(ev.endDT).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
      const pill = document.createElement('div');
      pill.className = 'day-event-pill';
      pill.style.background = ev.color;
      pill.innerHTML = `<span class="evt-title">${esc(ev.summary)}</span>
                        <span class="evt-time">${startStr}${endStr ? ' – ' + endStr : ''}</span>`;
      if (!ev.holiday && ev.eventId) {
        pill.style.cursor = 'pointer';
        pill.onclick = () => openEventEditor(ev);
      }
      slot.appendChild(pill);
    });

    // Meal plan chip at this hour
    const mealType = Object.keys(MEAL_HOURS).find(t => MEAL_HOURS[t] === h);
    if (mealType) {
      const meal = dayMealsObj[mealType];
      const chip = document.createElement('div');
      chip.className = 'day-meal-chip' + (meal ? ' has-meal' : '');
      chip.onclick = e => { e.stopPropagation(); (meal ? openMealDetail : openMealModal)(dateKey, mealType); };
      if (meal) {
        chip.innerHTML = `<span class="day-meal-chip-icon">${MEAL_ICONS[mealType]}</span>`
          + `<span class="day-meal-chip-text">${esc(meal.name)}</span>`
          + `<button class="meal-remove-btn" title="Remove" onclick="event.stopPropagation();removeMeal('${dateKey}','${mealType}')">×</button>`;
      } else {
        chip.innerHTML = `<span class="day-meal-chip-icon">${MEAL_ICONS[mealType]}</span>`
          + `<span class="day-meal-chip-label">${MEAL_LABELS[mealType]}</span>`
          + `<span class="day-meal-chip-add">＋</span>`;
      }
      slot.appendChild(chip);
    }

    // Click on empty hour slot to create event (only when no meal chip and no events)
    if (googleToken && !(hourBuckets[h] || []).length && !mealType) {
      slot.style.cursor = 'pointer';
      const hh = String(h).padStart(2,'0');
      slot.onclick = () => openEventEditor(null, dateKey, `${hh}:00`, `${String(h+1).padStart(2,'0')}:00`);
    }

    row.appendChild(lbl);
    row.appendChild(slot);
    timeline.appendChild(row);
  }

  wrap.appendChild(timeline);
  container.appendChild(wrap);

  // Auto-scroll to first event (or 8 AM if no events)
  const firstHour = timedEvts.length
    ? Math.min(...timedEvts.map(ev => new Date(ev.startDT).getHours()))
    : 8;
  const scrollTo = Math.max(0, firstHour - 6 - 1); // -1 to show one hour before
  setTimeout(() => { timeline.scrollTop = scrollTo * 54; }, 30);
}

function renderMultidayOverlay() {
  if (calView !== 'month') return;
  const grid = document.getElementById('calGrid');
  if (!grid) return;

  // Remove previous overlay
  grid.querySelector('.cal-multiday-overlay')?.remove();
  // Reset all spacers
  grid.querySelectorAll('.cal-md-spacer').forEach(s => { s.style.height = '0'; });

  // Build cell position map keyed by date string.
  // Measure spacer top while height=0 so we know exactly where bars should start
  // (right below the day-number circle, regardless of font size or cell padding).
  const cellEls = Array.from(grid.querySelectorAll('[data-date]'));
  if (!cellEls.length) return;
  const gridRect = grid.getBoundingClientRect();
  const cellMap = {};
  cellEls.forEach(el => {
    const r = el.getBoundingClientRect();
    const spacerEl = el.querySelector('.cal-md-spacer');
    const sr = spacerEl ? spacerEl.getBoundingClientRect() : null;
    cellMap[el.dataset.date] = {
      el,
      left:      r.left  - gridRect.left,
      top:       r.top   - gridRect.top,
      right:     r.right - gridRect.left,
      spacerTop: sr ? sr.top - gridRect.top : (r.top - gridRect.top + 26),
    };
  });

  // Collect unique true multi-day events (allDay, endDate > startDate, non-holiday)
  const seen = new Set();
  const mdEvents = [];
  Object.entries(calEventCache)
    .filter(([calId]) => !disabledCals.has(calId))
    .flatMap(([, byDate]) => Object.values(byDate).flat())
    .forEach(ev => {
      if (!ev.allDay || ev.holiday || !ev.eventId) return;
      if (!ev.endDate || ev.endDate <= ev.startDate) return;
      if (seen.has(ev.eventId)) return;
      seen.add(ev.eventId);
      mdEvents.push(ev);
    });
  if (!mdEvents.length) return;

  // Sort: earlier start first; longer duration first within same start
  mdEvents.sort((a, b) => {
    if (a.startDate < b.startDate) return -1;
    if (a.startDate > b.startDate) return 1;
    const aDur = (new Date(a.endDate) - new Date(a.startDate));
    const bDur = (new Date(b.endDate) - new Date(b.startDate));
    return bDur - aDur;
  });

  // Group cells into week rows by Y position
  const rowByTop = {};
  cellEls.forEach(el => {
    const topKey = Math.round(cellMap[el.dataset.date].top);
    if (!rowByTop[topKey]) rowByTop[topKey] = [];
    rowByTop[topKey].push(el.dataset.date);
  });
  const rows = Object.entries(rowByTop)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([top, dates]) => ({ top: Number(top), dates: dates.sort() }));

  const MAX_LANES = 3;
  const BAR_H    = 18;
  const BAR_GAP  = 2;

  // Per-cell lane tracking: cellLanes[dateKey][lane] = eventId or null.
  // Two non-overlapping events in the same week row can share lane 0 without conflict.
  const cellLanes = {};
  Object.keys(cellMap).forEach(dk => { cellLanes[dk] = new Array(MAX_LANES).fill(null); });

  // Helper: iterate all dates in a segment range
  const segDates = (startDate, endDate) => {
    const out = [];
    const d = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
    return out;
  };

  const segments = [];

  mdEvents.forEach(ev => {
    const evSegments = [];
    rows.forEach((row, rowIdx) => {
      const visible = row.dates.filter(d => d >= ev.startDate && d < ev.endDate);
      if (!visible.length) return;
      evSegments.push({ rowIdx, startDate: visible[0], endDate: visible[visible.length - 1] });
    });
    if (!evSegments.length) return;

    // Find the lowest lane free in every cell this event covers
    let lane = -1;
    outer: for (let l = 0; l < MAX_LANES; l++) {
      for (const { startDate, endDate } of evSegments) {
        for (const dk of segDates(startDate, endDate)) {
          if (cellLanes[dk] && cellLanes[dk][l] !== null) continue outer;
        }
      }
      lane = l; break;
    }
    if (lane === -1) return; // too many overlapping events

    // Mark each covered cell as occupied in this lane
    evSegments.forEach(({ startDate, endDate }) => {
      segDates(startDate, endDate).forEach(dk => {
        if (cellLanes[dk]) cellLanes[dk][lane] = ev.eventId;
      });
    });

    evSegments.forEach(seg => segments.push({ ev, ...seg, lane }));
  });

  if (!segments.length) return;

  // Spacers: per-cell height = (highest occupied lane + 1) × bar stride
  Object.entries(cellLanes).forEach(([dk, lanes]) => {
    const highest = lanes.reduce((max, v, i) => v !== null ? i : max, -1);
    const sp = cellMap[dk]?.el.querySelector('.cal-md-spacer');
    if (sp) sp.style.height = highest >= 0 ? ((highest + 1) * (BAR_H + BAR_GAP)) + 'px' : '0';
  });

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'cal-multiday-overlay';

  segments.forEach(({ ev, startDate, endDate, lane }) => {
    const sc = cellMap[startDate];
    const ec = cellMap[endDate];
    if (!sc || !ec) return;

    const bar = document.createElement('div');
    bar.className = 'cal-multiday-bar';
    bar.textContent = ev.summary;
    bar.title = ev.summary;
    bar.style.cssText =
      `left:${sc.left}px;` +
      `top:${sc.spacerTop + lane * (BAR_H + BAR_GAP)}px;` +
      `width:${ec.right - sc.left}px;` +
      `height:${BAR_H}px;` +
      `background:${ev.color};`;

    bar.addEventListener('click', e => { e.stopPropagation(); openEventEditor(ev); });
    bar.draggable = true;
    bar.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        eventId: ev.eventId, calId: ev.calId, allDay: ev.allDay,
        startDT: ev.startDT, endDT: ev.endDT,
        startDate: ev.startDate, endDate: ev.endDate,
      }));
      setTimeout(() => bar.classList.add('cal-dnd-dragging'), 0);
    });
    bar.addEventListener('dragend', () => bar.classList.remove('cal-dnd-dragging'));

    overlay.appendChild(bar);
  });

  grid.appendChild(overlay);
}

// Re-render overlay on window resize (BoundingClientRect values change)
window.addEventListener('resize', () => { if (calView === 'month') renderMultidayOverlay(); });

function renderMonthGrid() {
  const year  = calViewDate.getFullYear();
  const month = calViewDate.getMonth();

  document.getElementById('calMonthLabel').textContent =
    calViewDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // Day-of-week headers
  DOW_LABELS.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayDow = today.getDay(); // 0=Sun … 6=Sat

  // Mark the matching DOW header
  grid.querySelectorAll('.cal-dow')[todayDow]?.classList.add('current-dow');

  // Determine which column indices (0=Sun … 6=Sat) belong to the current week
  const todayInThisMonth = today.getFullYear() === year && today.getMonth() === month;
  const currentWeekStart = todayInThisMonth ? getWeekStart(today) : null;
  const currentWeekEnd   = currentWeekStart ? new Date(currentWeekStart.getTime() + 6 * 86400000) : null;
  const inCurrentWeek = d => currentWeekStart && d >= currentWeekStart && d <= currentWeekEnd;

  // Prev-month filler
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrev - i);
    const cell = makeDayCell(year, month - 1, daysInPrev - i, true);
    if (inCurrentWeek(d)) cell.classList.add('current-week');
    grid.appendChild(cell);
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const cell = makeDayCell(year, month, d, false, isToday);
    if (inCurrentWeek(dateObj)) cell.classList.add('current-week');
    grid.appendChild(cell);
  }
  // Next-month filler
  const total = firstDay + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= trailing; d++) {
    const fd = new Date(year, month + 1, d);
    const cell = makeDayCell(year, month + 1, d, true);
    if (inCurrentWeek(fd)) cell.classList.add('current-week');
    grid.appendChild(cell);
  }

  // Multi-day spanning events are rendered in an overlay layer after layout
  requestAnimationFrame(() => renderMultidayOverlay());
}

function makeDayCell(year, month, day, otherMonth, isToday) {
  const cell = document.createElement('div');
  const canAdd = !otherMonth && !!googleToken;
  cell.className = 'cal-day' + (otherMonth ? ' other-month' : '') + (isToday ? ' today' : '') + (canAdd ? ' can-add' : '');

  const num = document.createElement('div');
  num.className = 'cal-day-num';
  num.textContent = day;
  if (!otherMonth && googleToken) {
    num.title = 'Click to add event';
    num.style.cursor = 'pointer';
    num.onclick = e => { e.stopPropagation(); openEventEditor(null, key); };
  }
  cell.appendChild(num);

  // Merge visible events from all enabled calendars
  const key  = `${year}-${String(new Date(year, month, day).getMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  cell.dataset.date = key; // used by overlay renderer and DnD drop
  const evts = Object.entries(calEventCache)
    .filter(([calId]) => !disabledCals.has(calId))
    .flatMap(([, byDate]) => byDate[key] || []);
  // Cell-level click opens new event editor
  if (!otherMonth && googleToken) {
    cell.style.cursor = 'pointer';
    cell.onclick = () => openEventEditor(null, key);
  }

  // Spacer placeholder — height set by renderMultidayOverlay() so single-day pills
  // appear below any overlay bars that pass through this cell
  const mdSpacer = document.createElement('div');
  mdSpacer.className = 'cal-md-spacer';
  cell.appendChild(mdSpacer);

  // Split: multi-day all-day events go to overlay; everything else renders inline
  const isMultiDay = ev => ev.allDay && !ev.holiday && ev.startDate && ev.endDate && ev.endDate > ev.startDate;
  const sdEvts = evts.filter(ev => !isMultiDay(ev));

  sdEvts.slice(0, 3).forEach(ev => {
    const pill = document.createElement('div');
    pill.className = 'cal-event' + (ev.holiday ? ' cal-event-holiday' : '');
    pill.style.background = ev.color;
    pill.textContent = (ev.holiday ? '🎉 ' : '') + ev.summary;
    pill.title = ev.summary;
    if (!ev.holiday && ev.eventId) {
      pill.onclick = e => { e.stopPropagation(); openEventEditor(ev); };
      pill.draggable = true;
      pill.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
          eventId: ev.eventId, calId: ev.calId, allDay: ev.allDay,
          startDT: ev.startDT, endDT: ev.endDT,
          startDate: ev.startDate, endDate: ev.endDate,
        }));
        setTimeout(() => pill.classList.add('cal-dnd-dragging'), 0);
      });
      pill.addEventListener('dragend', () => pill.classList.remove('cal-dnd-dragging'));
    }
    cell.appendChild(pill);
  });
  if (sdEvts.length > 3) {
    const more = document.createElement('div');
    more.style.cssText = 'font-size:.65rem;color:var(--muted);padding-left:4px';
    more.textContent = `+${sdEvts.length - 3} more`;
    cell.appendChild(more);
  }

  // Drop zone for drag-and-drop rescheduling
  if (googleToken) {
    cell.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; cell.classList.add('cal-dnd-over'); });
    cell.addEventListener('dragleave', e => { if (!cell.contains(e.relatedTarget)) cell.classList.remove('cal-dnd-over'); });
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('cal-dnd-over');
      try {
        const ev = JSON.parse(e.dataTransfer.getData('text/plain'));
        rescheduleEvent(ev, key);
      } catch(_) {}
    });
  }

  // Budget events
  const budgetDay = budgetEventsForDate(key);
  budgetDay.forEach(item => {
    const pill = document.createElement('div');
    pill.className = 'cal-event-budget';
    pill.style.background = 'rgba(229,115,115,.18)';
    pill.style.color = '#e57373';
    pill.textContent = `💰 ${item.name} ${fmt$(item.amount)}`;
    pill.title = `${item.name} — ${fmt$(item.amount)} (${freqLabel(item)})`;
    pill.onclick = e => e.stopPropagation();
    cell.appendChild(pill);
  });

  // To-Do due dates
  todosDueOnDate(key).forEach(todo => {
    const pill = document.createElement('div');
    pill.className = 'cal-event-todo';
    pill.textContent = '✅ ' + todo.text + (todo.assignedTo ? ' · ' + todo.assignedTo : '');
    pill.title = todo.text + (todo.assignedTo ? ' — assigned to ' + todo.assignedTo : '');
    pill.onclick = e => e.stopPropagation();
    cell.appendChild(pill);
  });

  return cell;
}

async function loadAllCalendars() {
  if (!googleToken) return;
  document.getElementById('calendarStatus').innerHTML = '<span class="spinner"></span>';

  // Compute date range based on current view
  let timeMin, timeMax;
  if (calView === 'week') {
    const ws = getWeekStart(calViewDate);
    const we = new Date(ws.getTime() + 6 * 86400000);
    we.setHours(23, 59, 59);
    timeMin = ws.toISOString(); timeMax = we.toISOString();
  } else if (calView === 'day') {
    const d = calViewDate;
    timeMin = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
    timeMax = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
  } else if (calView === 'agenda') {
    const start = new Date(calViewDate); start.setHours(0, 0, 0, 0);
    const end   = new Date(start.getTime() + 30 * 86400000); end.setHours(23, 59, 59);
    timeMin = start.toISOString(); timeMax = end.toISOString();
  } else {
    const year = calViewDate.getFullYear(), month = calViewDate.getMonth();
    timeMin = new Date(year, month, 1).toISOString();
    timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
  }

  calEventCache = {};

  // Helper: store events under their calendar ID, including time data
  function cacheEvents(calId, items, color, holiday = false) {
    if (!calEventCache[calId]) calEventCache[calId] = {};
    items.forEach(ev => {
      const startDate = ev.start?.date || ev.start?.dateTime?.slice(0,10);
      if (!startDate) return;
      const base = {
        eventId:   ev.id || null,
        calId,
        summary:   ev.summary || (holiday ? '(Holiday)' : '(No title)'),
        description: ev.description || '',
        color, holiday,
        allDay:    !!ev.start?.date,
        startDT:   ev.start?.dateTime || null,
        endDT:     ev.end?.dateTime   || null,
        startDate: ev.start?.date     || null,
        endDate:   ev.end?.date       || null,
      };
      // Multi-day all-day events: cache on every date in their range
      if (base.allDay && base.startDate && base.endDate && base.endDate > base.startDate) {
        const endD = new Date(base.endDate + 'T00:00:00');
        for (let d = new Date(base.startDate + 'T00:00:00'); d < endD; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          if (!calEventCache[calId][key]) calEventCache[calId][key] = [];
          calEventCache[calId][key].push(base);
        }
      } else {
        if (!calEventCache[calId][startDate]) calEventCache[calId][startDate] = [];
        calEventCache[calId][startDate].push(base);
      }
    });
  }

  // Fetch user calendars
  const fetches = calendarMeta.map(async ({ id, color }) => {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`
        + `?maxResults=100&orderBy=startTime&singleEvents=true`
        + `&timeMin=${timeMin}&timeMax=${timeMax}`;
      const r    = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
      const data = await r.json();
      if (data.items) cacheEvents(id, data.items, color, false);
    } catch(e) { console.warn('Cal error', id, e); }
  });

  // Fetch holidays if enabled
  if (showHolidays) {
    fetches.push((async () => {
      try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(HOLIDAYS_ID)}/events`
          + `?maxResults=100&orderBy=startTime&singleEvents=true`
          + `&timeMin=${timeMin}&timeMax=${timeMax}`;
        const r    = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
        const data = await r.json();
        if (data.items) cacheEvents(HOLIDAYS_ID, data.items, holidaysColor, true);
      } catch(e) { console.warn('Holidays error', e); }
    })());
  }

  await Promise.all(fetches);

  // Inject ICS subscription events (uses its own cache; independent of Google auth)
  await loadIcsSubs();

  applyMemberColors();

  renderCalendarTabs();
  updateStatusPill();
  renderCurrentView();
  renderYearStrip();
  renderCountdownCard();
  document.getElementById('calendarStatus').textContent = '';
}

// ── Agenda View ──
function renderAgendaView() {
  const el = document.getElementById('agendaView');
  if (!el) return;
  el.innerHTML = '';

  const start = new Date(calViewDate); start.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const days = 30;

  let hasAny = false;
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0,10);
    const isToday = d.getTime() === today.getTime();

    const evts = Object.entries(calEventCache)
      .filter(([calId]) => !disabledCals.has(calId))
      .flatMap(([, byDate]) => byDate[key] || [])
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return (a.startDT || '') < (b.startDT || '') ? -1 : 1;
      });

    if (!evts.length) continue;
    hasAny = true;

    const hdr = document.createElement('div');
    hdr.className = 'agenda-day-header' + (isToday ? ' agenda-today' : '');
    hdr.textContent = d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
    el.appendChild(hdr);

    evts.forEach(ev => {
      const row = document.createElement('div');
      const clickable = !ev.holiday && ev.eventId;
      row.className = 'agenda-event' + (clickable ? ' agenda-clickable' : '');
      if (clickable) row.onclick = () => openEventEditor(ev);

      const dot = document.createElement('div');
      dot.className = 'agenda-dot';
      dot.style.background = ev.color;

      const info = document.createElement('div');
      info.className = 'agenda-info';

      const timeEl = document.createElement('div');
      timeEl.className = 'agenda-time';
      if (ev.allDay) {
        timeEl.textContent = 'All day';
      } else if (ev.startDT) {
        timeEl.textContent = new Date(ev.startDT).toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
      }

      const title = document.createElement('div');
      title.className = 'agenda-title';
      title.textContent = (ev.holiday ? '🎉 ' : '') + ev.summary;

      info.appendChild(timeEl);
      info.appendChild(title);
      row.appendChild(dot);
      row.appendChild(info);
      el.appendChild(row);
    });
  }

  if (!hasAny) {
    const empty = document.createElement('div');
    empty.className = 'agenda-empty';
    empty.textContent = googleToken ? 'No events in the next 30 days' : 'Sign in to see your events';
    el.appendChild(empty);
  }

  // Update header label
  const endDate = new Date(start); endDate.setDate(endDate.getDate() + days - 1);
  const lbl = document.getElementById('calMonthLabel');
  if (lbl) lbl.textContent = start.toLocaleDateString(undefined, { month:'short', day:'numeric' })
    + ' – ' + endDate.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

function renderCalendarTabs() {
  const tabs = document.getElementById('calendarTabs');
  if (!tabs) return;

  tabs.innerHTML = '';

  const all = [...calendarMeta];
  if (showHolidays) all.push({ id: HOLIDAYS_ID, label: 'Holidays', color: holidaysColor });
  // ICS subscriptions
  icsSubs.forEach(sub => all.push({ id: sub.id, label: sub.label, color: sub.color }));
  // Local calendars that have data
  LC_DEFS.forEach(lc => {
    const hasData =
      lc.id === LC_IDS.birthdays ? birthdays.length > 0 :
      lc.id === LC_IDS.meds      ? medications.length > 0 :
      lc.id === LC_IDS.school    ? schoolPeriods.length > 0 :
      lc.id === LC_IDS.trash     ? trashPickups.length > 0 :
      lc.id === LC_IDS.bills     ? showBillsOnCal && budgetItems.length > 0 : false;
    if (hasData) all.push({ id: lc.id, label: lc.label, color: lc.color });
  });

  if (!all.length) {
    tabs.innerHTML = `<div style="color:var(--muted);font-size:var(--text-xs);padding:6px 0;text-align:center">
      ${googleToken ? 'No calendars found' : 'Sign in to see your calendars'}
    </div>`;
    return;
  }

  all.forEach(({ id, label, color }) => {
    const enabled = !disabledCals.has(id);
    const name    = label || (id === 'primary' ? 'My Calendar' : id.split('@')[0]);

    const row = document.createElement('label');
    row.className = 'cal-toggle-row';
    row.title = enabled ? 'Click to hide' : 'Click to show';

    const swatch = document.createElement('span');
    swatch.className = 'cal-toggle-swatch';
    swatch.style.background = enabled ? color : 'transparent';
    swatch.style.borderColor = color;

    const nameEl = document.createElement('span');
    nameEl.className = 'cal-toggle-name';
    nameEl.textContent = name;

    const toggle = document.createElement('input');
    toggle.type    = 'checkbox';
    toggle.checked = enabled;
    toggle.className = 'cal-toggle-check';
    toggle.onchange = () => {
      if (toggle.checked) disabledCals.delete(id);
      else                disabledCals.add(id);
      renderCalendarTabs();
      renderCurrentView();
      renderYearStrip();
    };

    row.appendChild(swatch);
    row.appendChild(nameEl);
    row.appendChild(toggle);
    tabs.appendChild(row);
  });
}

// Render the editable calendar list inside Settings
function renderSettingCalList() {
  const ul = document.getElementById('settingCalList');
  if (!ul) return;
  ul.innerHTML = '';

  calendarMeta.forEach(({ id, label, color }, i) => {
    const li = document.createElement('li');
    li.className = 'cal-row';

    // Color swatch / picker
    const colorWrap = document.createElement('div');
    colorWrap.className = 'cal-color-wrap';
    colorWrap.style.background = color;
    const swatch = document.createElement('div');
    swatch.className = 'cal-color-swatch';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = color;
    colorInput.oninput = e => {
      calendarMeta[i].color = e.target.value;
      colorWrap.style.background = e.target.value;
      saveCalendarMeta();
      renderCalendarTabs();
      renderMonthGrid();
    };
    colorWrap.appendChild(swatch);
    colorWrap.appendChild(colorInput);

    // Label input (ID shown as tooltip)
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cal-label-input';
    labelInput.value = label;
    labelInput.placeholder = id === 'primary' ? 'My Calendar' : id.split('@')[0];
    labelInput.title = id;
    labelInput.oninput = e => {
      calendarMeta[i].label = e.target.value;
      saveCalendarMeta();
      renderCalendarTabs();
    };

    // Show / hide toggle
    const enabled = !disabledCals.has(id);
    const visToggle = document.createElement('input');
    visToggle.type = 'checkbox';
    visToggle.checked = enabled;
    visToggle.className = 'cal-vis-toggle';
    visToggle.title = enabled ? 'Visible — click to hide' : 'Hidden — click to show';
    visToggle.onchange = () => {
      if (visToggle.checked) disabledCals.delete(id);
      else disabledCals.add(id);
      renderCalendarTabs();
      renderCurrentView();
      renderYearStrip();
    };

    // Remove button (hidden when only one calendar)
    const removeBtn = document.createElement('button');
    removeBtn.className = 'cal-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove calendar';
    if (calendarMeta.length === 1) removeBtn.style.visibility = 'hidden';
    removeBtn.onclick = () => removeCalendar(id);

    li.appendChild(visToggle);
    li.appendChild(colorWrap);
    li.appendChild(labelInput);
    li.appendChild(removeBtn);
    ul.appendChild(li);
  });

  // Holidays row (treated like a regular calendar)
  {
    const li = document.createElement('li');
    li.className = 'cal-row';

    const colorWrap = document.createElement('div');
    colorWrap.className = 'cal-color-wrap';
    colorWrap.style.background = holidaysColor;
    const swatch = document.createElement('div');
    swatch.className = 'cal-color-swatch';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = holidaysColor;
    colorInput.oninput = e => {
      holidaysColor = e.target.value;
      localStorage.setItem('fh_holidaysColor', holidaysColor);
      colorWrap.style.background = holidaysColor;
      // Update already-cached events in place
      if (calEventCache[HOLIDAYS_ID]) {
        Object.values(calEventCache[HOLIDAYS_ID]).forEach(dayEvts =>
          dayEvts.forEach(ev => { ev.color = holidaysColor; })
        );
      }
      renderCalendarTabs();
      renderCurrentView();
    };
    colorWrap.appendChild(swatch);
    colorWrap.appendChild(colorInput);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cal-label-input';
    labelInput.value = 'US Holidays';
    labelInput.disabled = true;
    labelInput.title = HOLIDAYS_ID;

    const visToggle = document.createElement('input');
    visToggle.type = 'checkbox';
    visToggle.checked = showHolidays;
    visToggle.className = 'cal-vis-toggle';
    visToggle.title = showHolidays ? 'Visible — click to hide' : 'Hidden — click to show';
    visToggle.onchange = () => toggleHolidays(visToggle.checked);

    li.appendChild(visToggle);
    li.appendChild(colorWrap);
    li.appendChild(labelInput);
    ul.appendChild(li);
  }
}

function saveCalendarMeta() {
  localStorage.setItem('fh_calMeta', JSON.stringify(calendarMeta));
}

function toggleHolidays(checked) {
  showHolidays = checked;
  localStorage.setItem('fh_holidays', checked ? 'true' : 'false');
  if (googleToken) loadAllCalendars();
  else renderCalendarTabs();
}

function removeCalendar(id) {
  if (calendarMeta.length <= 1) return;
  calendarMeta = calendarMeta.filter(c => c.id !== id);
  saveCalendarMeta();
  renderSettingCalList();
  loadAllCalendars();
}

function addCalendar() {
  const input = document.getElementById('calIdInput');
  const id = input.value.trim();
  if (!id || calendarMeta.some(c => c.id === id)) return;
  const nextColor = DEFAULT_COLORS[calendarMeta.length % DEFAULT_COLORS.length];
  calendarMeta.push({ id, label: '', color: nextColor });
  saveCalendarMeta();
  input.value = '';
  renderSettingCalList();
  loadAllCalendars();
}

// ── ICS Calendar Subscriptions ─────────────────────────────────
let icsSubs      = lsGet('fh_icsSubs', []);    // [{id, url, label, color}]
let icsCache     = lsGet('fh_icsCache', {});   // {id: {fetchedAt, events[]}}
const ICS_TTL_MS = 4 * 60 * 60 * 1000;        // refresh every 4 hours

/** Parse an ICS text string into a flat array of event objects compatible with cacheEvents(). */
function parseIcs(text) {
  const events = [];
  const lines  = text.replace(/\r\n?/g, '\n').replace(/\n /g, '').split('\n');
  let cur = null;

  const val    = line => line.slice(line.indexOf(':') + 1).trim();
  const dtPart = prop => { // returns {date, dateTime} compatible with GCal format
    const raw = prop.replace(/;[^:]+/g, ''); // strip params like TZID=...
    const v   = val(raw);
    if (/^\d{8}$/.test(v)) { // all-day: 20250901
      return { date: `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}` };
    }
    // datetime: 20250901T120000Z or 20250901T120000
    const y=v.slice(0,4),mo=v.slice(4,6),d=v.slice(6,8),h=v.slice(9,11),mi=v.slice(11,13),s=v.slice(13,15)||'00';
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${v.endsWith('Z')?'Z':''}`;
    return { dateTime: iso };
  };

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT' && cur) {
      if (cur.start) events.push(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    if (line.startsWith('SUMMARY'))     cur.summary     = val(line);
    if (line.startsWith('DESCRIPTION')) cur.description = val(line).replace(/\\n/g, '\n').replace(/\\,/g, ',');
    if (line.startsWith('DTSTART'))     cur.start       = dtPart(line);
    if (line.startsWith('DTEND'))       cur.end         = dtPart(line);
    if (line.startsWith('UID'))         cur.id          = val(line);
  }
  return events;
}

/** Fetch one ICS URL (via a CORS proxy if needed), parse, and cache it. */
async function fetchIcsSub(sub) {
  // Try direct fetch first; many ICS feeds are CORS-friendly
  const CORS_PROXY = 'https://corsproxy.io/?';
  let text = null;
  try {
    const r = await fetch(sub.url, { cache: 'no-store' });
    if (r.ok) text = await r.text();
  } catch {}
  if (!text) {
    try {
      const r = await fetch(CORS_PROXY + encodeURIComponent(sub.url), { cache: 'no-store' });
      if (r.ok) text = await r.text();
    } catch {}
  }
  if (!text || !text.includes('BEGIN:VCALENDAR')) return null;
  return parseIcs(text);
}

/** Load all ICS subscriptions, using cache when fresh; inject into calEventCache. */
async function loadIcsSubs() {
  if (!icsSubs.length) return;
  const now = Date.now();
  const fetches = icsSubs.map(async sub => {
    const cached = icsCache[sub.id];
    let events = cached && (now - cached.fetchedAt < ICS_TTL_MS) ? cached.events : null;
    if (!events) {
      events = await fetchIcsSub(sub);
      if (events) {
        icsCache[sub.id] = { fetchedAt: now, events };
        localStorage.setItem('fh_icsCache', JSON.stringify(icsCache));
      } else {
        events = cached?.events || []; // fall back to stale cache
      }
    }
    // Inject into calEventCache under the sub's id
    if (!calEventCache[sub.id]) calEventCache[sub.id] = {};
    events.forEach(ev => {
      const startDate = ev.start?.date || ev.start?.dateTime?.slice(0,10);
      if (!startDate) return;
      const entry = {
        eventId:     ev.id || null,
        calId:       sub.id,
        summary:     ev.summary || '(No title)',
        description: ev.description || '',
        color:       sub.color,
        holiday:     false,
        allDay:      !!ev.start?.date,
        startDT:     ev.start?.dateTime || null,
        endDT:       ev.end?.dateTime   || null,
        startDate:   ev.start?.date     || null,
        endDate:     ev.end?.date       || null,
      };
      // Multi-day all-day
      if (entry.allDay && entry.startDate && entry.endDate && entry.endDate > entry.startDate) {
        const endD = new Date(entry.endDate + 'T00:00:00');
        for (let d = new Date(entry.startDate + 'T00:00:00'); d < endD; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          if (!calEventCache[sub.id][key]) calEventCache[sub.id][key] = [];
          calEventCache[sub.id][key].push(entry);
        }
      } else {
        if (!calEventCache[sub.id][startDate]) calEventCache[sub.id][startDate] = [];
        calEventCache[sub.id][startDate].push(entry);
      }
    });
  });
  await Promise.all(fetches);
}

/** Add a new ICS subscription from the settings UI. */
async function addIcsSub() {
  const url   = document.getElementById('icsUrlInput').value.trim();
  const label = document.getElementById('icsLabelInput').value.trim();
  const color = document.getElementById('icsColorInput').value;
  const statusEl = document.getElementById('icsSubStatus');
  if (!url) return;
  if (icsSubs.some(s => s.url === url)) {
    statusEl.textContent = 'Already subscribed to that URL.'; return;
  }
  statusEl.textContent = 'Fetching…';
  const id = 'ics_' + Date.now();
  const sub = { id, url, label: label || url, color };
  const events = await fetchIcsSub(sub);
  if (!events) {
    statusEl.textContent = '⚠️ Could not fetch that URL. Make sure it is a valid public ICS link.'; return;
  }
  icsCache[id] = { fetchedAt: Date.now(), events };
  icsSubs.push(sub);
  localStorage.setItem('fh_icsSubs', JSON.stringify(icsSubs));
  localStorage.setItem('fh_icsCache', JSON.stringify(icsCache));
  document.getElementById('icsUrlInput').value   = '';
  document.getElementById('icsLabelInput').value = '';
  statusEl.textContent = `✓ Subscribed — ${events.length} event${events.length !== 1 ? 's' : ''} loaded.`;
  renderIcsSubList();
  renderCalendarTabs();
  // Inject into calEventCache and re-render
  await loadIcsSubs();
  renderCurrentView();
  renderYearStrip();
}

function removeIcsSub(id) {
  icsSubs = icsSubs.filter(s => s.id !== id);
  delete icsCache[id];
  delete calEventCache[id];
  localStorage.setItem('fh_icsSubs', JSON.stringify(icsSubs));
  localStorage.setItem('fh_icsCache', JSON.stringify(icsCache));
  renderIcsSubList();
  renderCalendarTabs();
  renderCurrentView();
  renderYearStrip();
}

function renderIcsSubList() {
  const el = document.getElementById('icsSubList');
  if (!el) return;
  el.innerHTML = '';

  if (!icsSubs.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:4px 0">No subscriptions yet.</div>';
    return;
  }

  icsSubs.forEach((sub, i) => {
    const row = document.createElement('div');
    row.className = 'cal-row';

    // Color picker
    const colorWrap = document.createElement('div');
    colorWrap.className = 'cal-color-wrap';
    colorWrap.style.background = sub.color;
    const swatch = document.createElement('div');
    swatch.className = 'cal-color-swatch';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = sub.color;
    colorInput.oninput = e => {
      const newColor = e.target.value;
      icsSubs[i].color = newColor;
      colorWrap.style.background = newColor;
      localStorage.setItem('fh_icsSubs', JSON.stringify(icsSubs));
      // Update color on already-cached events so the live calendar reflects immediately
      if (calEventCache[sub.id]) {
        Object.values(calEventCache[sub.id]).forEach(dayEvts =>
          dayEvts.forEach(ev => { ev.color = newColor; })
        );
      }
      renderCalendarTabs();
      renderCurrentView();
    };
    colorWrap.appendChild(swatch);
    colorWrap.appendChild(colorInput);

    // Label input (URL shown as tooltip)
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cal-label-input';
    labelInput.value = sub.label;
    labelInput.title = sub.url;
    labelInput.placeholder = 'Label';
    labelInput.oninput = e => {
      icsSubs[i].label = e.target.value;
      localStorage.setItem('fh_icsSubs', JSON.stringify(icsSubs));
      renderCalendarTabs();
    };

    // Weekdays-only toggle
    const wdLabel = document.createElement('label');
    wdLabel.className = 'ics-weekdays-label';
    wdLabel.title = 'Count Mon–Fri only for countdowns';
    const wdCheck = document.createElement('input');
    wdCheck.type = 'checkbox';
    wdCheck.checked = !!sub.weekdaysOnly;
    wdCheck.style.accentColor = 'var(--accent)';
    wdCheck.onchange = () => {
      icsSubs[i].weekdaysOnly = wdCheck.checked;
      localStorage.setItem('fh_icsSubs', JSON.stringify(icsSubs));
      renderCountdownCard();
    };
    const wdText = document.createElement('span');
    wdText.textContent = 'Wkdays';
    wdText.style.cssText = 'font-size:.68rem;color:var(--muted);white-space:nowrap';
    wdLabel.appendChild(wdCheck);
    wdLabel.appendChild(wdText);

    // Show / hide toggle
    const enabled = !disabledCals.has(sub.id);
    const visToggle = document.createElement('input');
    visToggle.type = 'checkbox';
    visToggle.checked = enabled;
    visToggle.className = 'cal-vis-toggle';
    visToggle.title = enabled ? 'Visible — click to hide' : 'Hidden — click to show';
    visToggle.onchange = () => {
      if (visToggle.checked) disabledCals.delete(sub.id);
      else disabledCals.add(sub.id);
      renderCalendarTabs();
      renderCurrentView();
      renderYearStrip();
    };

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'cal-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove subscription';
    removeBtn.onclick = () => removeIcsSub(sub.id);

    row.appendChild(visToggle);
    row.appendChild(colorWrap);
    row.appendChild(labelInput);
    row.appendChild(wdLabel);
    row.appendChild(removeBtn);
    el.appendChild(row);
  });
}

// ── Countdowns ─────────────────────────────────────────────────
let countdowns = lsGet('fh_countdowns', []); // [{id, label, emoji, targetDate}]

function saveCountdowns() {
  localStorage.setItem('fh_countdowns', JSON.stringify(countdowns));
}

/** Calendar days until a YYYY-MM-DD date string (negative if past). */
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

/** Weekdays (Mon–Fri) until a YYYY-MM-DD date string (negative if past). */
function weekdaysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  if (target <= today) return Math.round((target - today) / 86400000); // keep negatives as calendar days
  let count = 0;
  const d = new Date(today);
  d.setDate(d.getDate() + 1); // start counting from tomorrow
  while (d <= target) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Return the appropriate day count for a countdown object. */
function countdownDays(cd) {
  return cd.weekdaysOnly ? weekdaysUntil(cd.targetDate) : daysUntil(cd.targetDate);
}

function addCountdown() {
  const label       = document.getElementById('cdLabelInput').value.trim();
  const date        = document.getElementById('cdDateInput').value;
  const emoji       = document.getElementById('cdEmojiInput').value.trim() || '⏳';
  const weekdaysOnly = document.getElementById('cdWeekdaysOnly').checked;
  if (!label || !date) return;
  countdowns.push({ id: 'cd_' + Date.now(), label, emoji, targetDate: date, weekdaysOnly });
  saveCountdowns();
  document.getElementById('cdLabelInput').value = '';
  document.getElementById('cdDateInput').value  = '';
  document.getElementById('cdEmojiInput').value = '';
  renderCountdownSettingList();
  renderCountdownCard();
}

function addCountdownFromEvent() {
  const picker      = document.getElementById('cdEventPicker');
  const weekdaysOnly = document.getElementById('cdWeekdaysOnly').checked;
  const val = picker.value;
  if (!val) return;
  try {
    const { label, targetDate, emoji } = JSON.parse(val);
    if (!label || !targetDate) return;
    countdowns.push({ id: 'cd_' + Date.now(), label, emoji: emoji || '📅', targetDate, weekdaysOnly });
    saveCountdowns();
    picker.value = '';
    renderCountdownSettingList();
    renderCountdownCard();
  } catch {}
}

function removeCountdown(id) {
  countdowns = countdowns.filter(c => c.id !== id);
  saveCountdowns();
  renderCountdownSettingList();
  renderCountdownCard();
}

/** Populate the event picker with upcoming events from calEventCache. */
function populateCountdownEventPicker() {
  const picker = document.getElementById('cdEventPicker');
  if (!picker) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today.getTime() + 366 * 86400000);
  const seen = new Set();
  const options = [];

  // Collect all events across all calendars in the next year
  Object.entries(calEventCache).forEach(([calId, byDate]) => {
    Object.entries(byDate).forEach(([dateStr, evts]) => {
      const d = new Date(dateStr + 'T00:00:00');
      if (d < today || d > cutoff) return;
      evts.forEach(ev => {
        const key = dateStr + '|' + (ev.summary || '');
        if (seen.has(key)) return;
        seen.add(key);
        // Get label from matching cal/ICS
        const calLabel = (() => {
          const ics = icsSubs.find(s => s.id === calId);
          if (ics) return ics.label;
          const meta = calendarMeta.find(c => c.id === calId);
          if (meta) return meta.label || calId.split('@')[0];
          return calId;
        })();
        options.push({ dateStr, summary: ev.summary || '(No title)', calLabel, color: ev.color });
      });
    });
  });

  // Sort by date
  options.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  // Rebuild picker
  picker.innerHTML = '<option value="">— or pick a calendar event —</option>';
  options.forEach(({ dateStr, summary, calLabel }) => {
    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ label: summary, targetDate: dateStr, emoji: '📅' });
    opt.textContent = `${dateLabel} — ${summary} (${calLabel})`;
    picker.appendChild(opt);
  });
}

/** Render the countdown list in settings — fully editable rows. */
function renderCountdownSettingList() {
  const el = document.getElementById('countdownSettingList');
  if (!el) return;
  el.innerHTML = '';
  if (!countdowns.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:4px 0">No countdowns yet.</div>';
    return;
  }

  countdowns.forEach((cd, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:5px;padding:5px 0;border-bottom:1px solid rgba(128,128,128,.1);flex-wrap:wrap';

    // Emoji button (opens picker)
    const emojiBtn = document.createElement('button');
    emojiBtn.type = 'button';
    emojiBtn.textContent = cd.emoji || '⏳';
    emojiBtn.title = 'Change emoji';
    emojiBtn.style.cssText = 'background:none;border:1px solid rgba(128,128,128,.25);border-radius:5px;cursor:pointer;font-size:1rem;padding:2px 5px;color:var(--text)';
    emojiBtn.onclick = () => openEmojiPicker(null, emojiBtn, v => {
      countdowns[i].emoji = v;
      emojiBtn.textContent = v;
      saveCountdowns();
      renderCountdownCard();
    });

    // Label input
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'lc-input';
    labelInput.value = cd.label;
    labelInput.placeholder = 'Label';
    labelInput.style.flex = '1';
    labelInput.style.minWidth = '80px';

    // Date input
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'lc-input lc-input-sm';
    dateInput.value = cd.targetDate;

    // Weekdays checkbox
    const wdLabel = document.createElement('label');
    wdLabel.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:.75rem;color:var(--muted);cursor:pointer;white-space:nowrap';
    const wdChk = document.createElement('input');
    wdChk.type = 'checkbox';
    wdChk.checked = !!cd.weekdaysOnly;
    wdChk.style.accentColor = 'var(--accent)';
    wdLabel.appendChild(wdChk);
    wdLabel.appendChild(document.createTextNode('Wkdays'));

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
      const newLabel = labelInput.value.trim();
      const newDate  = dateInput.value;
      if (!newLabel || !newDate) return;
      countdowns[i] = { ...countdowns[i], label: newLabel, emoji: emojiBtn.textContent, targetDate: newDate, weekdaysOnly: wdChk.checked };
      saveCountdowns();
      renderCountdownCard();
    };

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.style.cssText = 'background:none;border:none;color:var(--muted);cursor:pointer;font-size:.85rem;padding:2px 4px';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => removeCountdown(cd.id);

    row.appendChild(emojiBtn);
    row.appendChild(labelInput);
    row.appendChild(dateInput);
    row.appendChild(wdLabel);
    row.appendChild(saveBtn);
    row.appendChild(removeBtn);
    el.appendChild(row);
  });
}

// ── Emoji Picker ──
const EMOJI_LIST = [
  '🎉','🎂','🎁','🎈','🏖️','✈️','🏕️','⛷️','🎄','🎃','🎆','🎇',
  '🏫','🎓','📚','🏆','⚽','🏀','🎾','🏊','🚴','🧘','🎵','🎬',
  '❤️','🌟','🌈','🌺','🍕','🎮','🐶','🐱','🚀','🌍','💪','🥳',
  '👨‍👩‍👧','👨‍👩‍👦','👩‍👧','👨‍👦','🏠','🚗','💼','📅','⏳','🔔','🎯','🌙',
];

let _emojiPickerCallback = null;
let _emojiPickerInputId  = null;

function openEmojiPicker(inputId, anchorEl, callback) {
  _emojiPickerInputId = inputId;
  _emojiPickerCallback = callback || null;

  let picker = document.getElementById('emojiPickerPopup');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'emojiPickerPopup';
    picker.style.cssText = 'position:fixed;z-index:9999;background:var(--bg);border:1px solid rgba(128,128,128,.3);border-radius:10px;padding:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:230px;box-shadow:0 4px 20px rgba(0,0,0,.5)';
    document.body.appendChild(picker);

    document.addEventListener('mousedown', e => {
      if (!document.getElementById('emojiPickerPopup')?.contains(e.target) &&
          !e.target.closest('[data-emoji-anchor]')) {
        const p = document.getElementById('emojiPickerPopup');
        if (p) p.style.display = 'none';
      }
    });
  }

  picker.innerHTML = '';
  EMOJI_LIST.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = em;
    btn.style.cssText = 'background:none;border:none;font-size:1.3rem;cursor:pointer;padding:2px;border-radius:4px;line-height:1';
    btn.onmouseenter = () => btn.style.background = 'rgba(128,128,128,.2)';
    btn.onmouseleave = () => btn.style.background = 'none';
    btn.onclick = () => {
      if (_emojiPickerCallback) {
        _emojiPickerCallback(em);
      } else if (_emojiPickerInputId) {
        const inp = document.getElementById(_emojiPickerInputId);
        if (inp) inp.value = em;
      }
      picker.style.display = 'none';
    };
    picker.appendChild(btn);
  });

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.display = 'flex';
  picker.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
  picker.style.top  = (rect.bottom + 4) + 'px';
}

/** Render the countdown card on the dashboard. */
function renderCountdownCard() {
  const el = document.getElementById('countdownBody');
  if (!el) return;

  // Sort: soonest first; exclude past events older than 1 day
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const active = countdowns
    .map(cd => ({ ...cd, days: countdownDays(cd) }))
    .filter(cd => cd.days >= -1)
    .sort((a, b) => a.days - b.days);

  if (!active.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:10px 0">No countdowns. Add some in ⚙️ Settings → Calendar.</div>';
    return;
  }

  el.innerHTML = active.map(cd => {
    const unit = cd.weekdaysOnly ? 'weekday' : 'day';
    const daysLabel = cd.days > 1  ? `<strong>${cd.days}</strong> ${unit}s`
                    : cd.days === 1 ? `<strong>1</strong> ${unit}`
                    : cd.days === 0 ? `<strong>Today!</strong>`
                    :                 `<strong>Yesterday</strong>`;
    return `<div class="countdown-item">
      <div class="countdown-label">${cd.emoji} ${cd.label}</div>
      <div class="countdown-days">${daysLabel}</div>
    </div>`;
  }).join('');
}

// ── Calendar Event Editor ─────────────────────────────────────
let evtEditing = null; // { ev, calId } when editing; null when creating

function openEventEditor(ev, dateKey, startTime, endTime, forceAllDay) {
  if (!googleToken) return;
  evtEditing = ev || null;

  document.getElementById('eventEditorTitle').textContent = ev ? '✏️ Edit Event' : '📅 New Event';
  document.getElementById('evtEdTitle').value      = ev?.summary     || '';
  document.getElementById('evtEdDesc').value       = ev?.description || '';
  document.getElementById('evtEdDeleteBtn').style.display = ev ? '' : 'none';
  document.getElementById('evtEdStatus').style.display = 'none';

  // Date
  const dk = dateKey || ev?.startDate || ev?.startDT?.slice(0,10) || new Date().toISOString().slice(0,10);
  document.getElementById('evtEdDate').value = dk;

  // All-day
  const isAllDay = forceAllDay || ev?.allDay || false;
  document.getElementById('evtEdAllDay').checked = isAllDay;
  document.getElementById('evtEdTimeSection').style.display = isAllDay ? 'none' : '';

  // Times
  if (ev?.startDT) {
    document.getElementById('evtEdStart').value = ev.startDT.slice(11,16);
    document.getElementById('evtEdEnd').value   = ev.endDT?.slice(11,16) || '';
  } else {
    document.getElementById('evtEdStart').value = startTime || '09:00';
    document.getElementById('evtEdEnd').value   = endTime   || '10:00';
  }

  // Calendar selector — only writable calendars (not holidays, not 'group.v.calendar')
  const calSel = document.getElementById('evtEdCalSelect');
  calSel.innerHTML = '';
  const writableCals = calendarMeta.filter(c => c.id !== HOLIDAYS_ID);
  if (!writableCals.length) {
    calSel.innerHTML = '<span style="font-size:.8rem;color:var(--muted)">Sign in and add a calendar first</span>';
  } else {
    writableCals.forEach(cal => {
      const btn = document.createElement('button');
      btn.className = 'evt-editor-cal-opt';
      btn.style.color = cal.color;
      btn.textContent = cal.label || cal.id.split('@')[0];
      btn.dataset.calId = cal.id;
      const defaultCalId = ev?.calId || writableCals[0].id;
      if (cal.id === defaultCalId) btn.classList.add('selected');
      btn.onclick = () => {
        calSel.querySelectorAll('.evt-editor-cal-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      };
      calSel.appendChild(btn);
    });
  }

  document.getElementById('eventEditorModal').style.display = 'flex';
  trapFocus(document.querySelector('#eventEditorModal .modal'), null, closeEventEditor);
}

function closeEventEditor() {
  document.getElementById('eventEditorModal').style.display = 'none';
  releaseFocusTrap();
  evtEditing = null;
}

function toggleEvtEdAllDay() {
  const isAllDay = document.getElementById('evtEdAllDay').checked;
  document.getElementById('evtEdTimeSection').style.display = isAllDay ? 'none' : '';
}

function evtEdStatus(msg, isError) {
  const el = document.getElementById('evtEdStatus');
  el.textContent = msg;
  el.style.color = isError ? '#e57373' : 'var(--muted)';
  el.style.display = 'block';
}

async function saveCalEvent() {
  const title = document.getElementById('evtEdTitle').value.trim();
  if (!title) { evtEdStatus('Please enter a title.', true); return; }

  const date    = document.getElementById('evtEdDate').value;
  const isAllDay = document.getElementById('evtEdAllDay').checked;
  const startT  = document.getElementById('evtEdStart').value;
  const endT    = document.getElementById('evtEdEnd').value;
  const desc    = document.getElementById('evtEdDesc').value.trim();

  const selectedCalBtn = document.getElementById('evtEdCalSelect').querySelector('.selected');
  if (!selectedCalBtn) { evtEdStatus('Please select a calendar.', true); return; }
  const calId = selectedCalBtn.dataset.calId;

  let start, end;
  if (isAllDay) {
    start = { date };
    // Google Calendar: end date for all-day is exclusive (next day)
    const nextDay = new Date(date + 'T00:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    end = { date: nextDay.toISOString().slice(0,10) };
  } else {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    start = { dateTime: `${date}T${startT || '09:00'}:00`, timeZone: tz };
    end   = { dateTime: `${date}T${endT   || '10:00'}:00`, timeZone: tz };
  }

  const body = { summary: title, description: desc, start, end };
  evtEdStatus('Saving…', false);

  try {
    if (evtEditing?.eventId) {
      // PATCH existing event
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(evtEditing.eventId)}`;
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || r.statusText);
      }
    } else {
      // POST new event
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || r.statusText);
      }
    }
    closeEventEditor();
    loadAllCalendars(); // refresh cache + views
  } catch(e) {
    evtEdStatus('⚠️ ' + e.message, true);
  }
}

async function deleteCalEvent() {
  if (!evtEditing?.eventId) return;
  if (!confirm(`Delete "${evtEditing.summary}"?`)) return;

  const selectedCalBtn = document.getElementById('evtEdCalSelect').querySelector('.selected');
  const calId = selectedCalBtn?.dataset.calId || evtEditing.calId;

  evtEdStatus('Deleting…', false);
  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(evtEditing.eventId)}`;
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${googleToken}` },
    });
    if (!r.ok && r.status !== 204) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || r.statusText);
    }
    closeEventEditor();
    loadAllCalendars();
  } catch(e) {
    evtEdStatus('⚠️ ' + e.message, true);
  }
}

// ── Calendar drag-and-drop rescheduling ──────────────────────
async function rescheduleEvent(ev, newDateKey) {
  if (!googleToken || !ev.eventId) return;
  const oldDateKey = ev.startDate || ev.startDT?.slice(0, 10);
  if (!oldDateKey || oldDateKey === newDateKey) return;

  const deltaDays = Math.round(
    (new Date(newDateKey + 'T00:00:00') - new Date(oldDateKey + 'T00:00:00')) / 86400000
  );
  const shiftDateStr = (str, delta) => {
    const d = new Date(str + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  };
  const shiftDT = (isoStr, delta) => {
    const d = new Date(isoStr);
    d.setDate(d.getDate() + delta);
    return d.toISOString();
  };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let start, end;
  if (ev.allDay) {
    start = { date: shiftDateStr(ev.startDate, deltaDays) };
    // Google Calendar all-day end is exclusive (startDate + 1 for single-day events)
    const srcEnd = ev.endDate && ev.endDate !== ev.startDate
      ? ev.endDate
      : shiftDateStr(ev.startDate, 1);
    end = { date: shiftDateStr(srcEnd, deltaDays) };
  } else {
    start = { dateTime: shiftDT(ev.startDT, deltaDays), timeZone: tz };
    end   = { dateTime: shiftDT(ev.endDT,   deltaDays), timeZone: tz };
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.eventId)}`;
  try {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error?.message || r.statusText);
    }
    loadAllCalendars();
  } catch(e) {
    alert('Could not reschedule: ' + e.message);
  }
}

// ── Year Card (sidebar 2-month view) ──────────────────────────
const _now = new Date();
let yearCardDate = new Date(_now.getFullYear(), _now.getMonth(), 1);

function changeYearCardMonth(delta) {
  yearCardDate = new Date(yearCardDate.getFullYear(), yearCardDate.getMonth() + delta, 1);
  renderYearCard();
  updateYearCardTodayBtn();
}

function resetYearCard() {
  const now = new Date();
  yearCardDate = new Date(now.getFullYear(), now.getMonth(), 1);
  renderYearCard();
  updateYearCardTodayBtn();
}

function updateYearCardTodayBtn() {
  const btn = document.getElementById('yearCardTodayBtn');
  if (!btn) return;
  const now = new Date();
  const isDefault = yearCardDate.getFullYear() === now.getFullYear()
                 && yearCardDate.getMonth()    === now.getMonth();
  btn.style.display = isDefault ? 'none' : '';
}

function renderYearCard() {
  const body  = document.getElementById('yearCardBody');
  if (!body) return;
  const today = new Date();
  body.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'year-card-grid';

  for (let offset = 0; offset < 2; offset++) {
    const ref  = new Date(yearCardDate.getFullYear(), yearCardDate.getMonth() + offset, 1);
    const year = ref.getFullYear();
    const m    = ref.getMonth();
    const isCurrentMonth = year === today.getFullYear() && m === today.getMonth();

    const card = document.createElement('div');
    card.className = 'mini-card year-card-mini' + (isCurrentMonth ? ' current-month' : '');
    card.title = 'Jump to ' + ref.toLocaleDateString([], { month: 'long', year: 'numeric' });
    card.onclick = () => {
      calViewDate = new Date(year, m, 1);
      switchCalView('month');
      if (googleToken) loadAllCalendars();
      document.querySelector('.cal-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Month + year label
    const lbl = document.createElement('div');
    lbl.className = 'mini-month-label year-card-month-label' + (isCurrentMonth ? ' current-month-label' : '');
    lbl.textContent = ref.toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (isCurrentMonth) {
      const badge = document.createElement('span');
      badge.className = 'year-card-now-badge';
      badge.textContent = 'Now';
      lbl.appendChild(badge);
    }
    card.appendChild(lbl);

    // Mini grid
    const mg = document.createElement('div');
    mg.className = 'year-card-cal-grid';

    // DOW header row
    const dowRow = document.createElement('div');
    dowRow.className = 'year-card-dow-row';
    ['S','M','T','W','T','F','S'].forEach(d => {
      const dh = document.createElement('div');
      dh.className = 'mini-dow';
      dh.textContent = d;
      dowRow.appendChild(dh);
    });
    mg.appendChild(dowRow);

    const firstDay    = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const daysInPrev  = new Date(year, m, 0).getDate();
    const todayGridPos = isCurrentMonth ? firstDay + today.getDate() - 1 : -1;
    const todayWeekRow = todayGridPos >= 0 ? Math.floor(todayGridPos / 7) : -1;

    // Build flat list of all day cells/wraps
    const cells = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'mini-day year-card-day';
      cell.textContent = daysInPrev - i;
      cells.push(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = isCurrentMonth && d === today.getDate();
      const dateKey = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dots    = getEventDotsForDate(dateKey);

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center';

      const cell = document.createElement('div');
      cell.className = 'mini-day year-card-day in-month' + (isToday ? ' today' : '');
      cell.textContent = d;
      wrap.appendChild(cell);

      if (dots.length) {
        const dotRow = document.createElement('div');
        dotRow.className = 'mini-dots';
        dots.slice(0, 3).forEach(color => {
          const dot = document.createElement('div');
          dot.className = 'mini-dot';
          dot.style.background = color;
          dotRow.appendChild(dot);
        });
        wrap.appendChild(dotRow);
      }

      cells.push(wrap);
    }

    const total    = firstDay + daysInMonth;
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= trailing; d++) {
      const cell = document.createElement('div');
      cell.className = 'mini-day year-card-day';
      cell.textContent = d;
      cells.push(cell);
    }

    // Group cells into week rows
    for (let r = 0; r < cells.length; r += 7) {
      const weekRow = document.createElement('div');
      const isTodayWeek = todayWeekRow >= 0 && r / 7 === todayWeekRow;
      weekRow.className = 'year-card-week-row' + (isTodayWeek ? ' today-week' : '');
      for (let c = r; c < r + 7 && c < cells.length; c++) {
        weekRow.appendChild(cells[c]);
      }
      mg.appendChild(weekRow);
    }

    card.appendChild(mg);
    grid.appendChild(card);
  }

  body.appendChild(grid);
  updateYearCardTodayBtn();
}

// ── 6-month strip ─────────────────────────────────────────────
// Default: start from the current month
let stripStart = new Date(_now.getFullYear(), _now.getMonth(), 1);

function changeStripMonth(delta) {
  stripStart = new Date(stripStart.getFullYear(), stripStart.getMonth() + delta, 1);
  renderYearStrip();
}

function resetStripToToday() {
  const now = new Date();
  stripStart = new Date(now.getFullYear(), now.getMonth(), 1);
  renderYearStrip();
}

function updateStripTodayBtn() {
  const btn = document.getElementById('stripTodayBtn');
  if (!btn) return;
  const now = new Date();
  const isDefault = stripStart.getFullYear() === now.getFullYear()
                 && stripStart.getMonth()    === now.getMonth();
  btn.style.opacity       = isDefault ? '0'    : '1';
  btn.style.pointerEvents = isDefault ? 'none' : 'auto';
}

function renderYearStrip() {
  // Also refresh the sidebar year card whenever the strip updates
  renderYearCard();

  const grid  = document.getElementById('miniGrid');
  const today = new Date();
  grid.innerHTML = '';

  // Range label  e.g. "Jun 2026 – Nov 2026"
  const endDate = new Date(stripStart.getFullYear(), stripStart.getMonth() + 5, 1);
  document.getElementById('stripRangeLabel').textContent =
    stripStart.toLocaleDateString([], { month: 'short', year: 'numeric' }) + ' – ' +
    endDate.toLocaleDateString([], { month: 'short', year: 'numeric' });

  for (let offset = 0; offset < 6; offset++) {
    const yr = stripStart.getFullYear();
    const mo = stripStart.getMonth() + offset;
    // normalise (handles year rollover)
    const ref = new Date(yr, mo, 1);
    const year = ref.getFullYear();
    const m    = ref.getMonth();

    const isCurrentMonth = year === today.getFullYear() && m === today.getMonth();

    const card = document.createElement('div');
    card.className = 'mini-card' + (isCurrentMonth ? ' current-month' : '');
    card.title = 'Jump to ' + ref.toLocaleDateString([], { month: 'long', year: 'numeric' });
    card.onclick = () => {
      calViewDate = new Date(year, m, 1);
      switchCalView('month');
      if (googleToken) loadAllCalendars();
      document.querySelector('.cal-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Month + year label
    const lbl = document.createElement('div');
    lbl.className = 'mini-month-label';
    lbl.textContent = ref.toLocaleDateString([], { month: 'short', year: '2-digit' });
    card.appendChild(lbl);

    // Mini grid
    const mg = document.createElement('div');
    mg.className = 'mini-cal-grid';

    ['S','M','T','W','T','F','S'].forEach(d => {
      const dh = document.createElement('div');
      dh.className = 'mini-dow';
      dh.textContent = d;
      mg.appendChild(dh);
    });

    const firstDay    = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const daysInPrev  = new Date(year, m, 0).getDate();

    // Prev-month filler
    for (let i = firstDay - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'mini-day';
      cell.textContent = daysInPrev - i;
      mg.appendChild(cell);
    }

    // Days in month
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = year === today.getFullYear() && m === today.getMonth() && d === today.getDate();
      const dateKey = `${year}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dots    = getEventDotsForDate(dateKey);

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center';

      const cell = document.createElement('div');
      cell.className = 'mini-day in-month' + (isToday ? ' today' : '');
      cell.textContent = d;
      wrap.appendChild(cell);

      if (dots.length) {
        const dotRow = document.createElement('div');
        dotRow.className = 'mini-dots';
        dots.slice(0, 3).forEach(color => {
          const dot = document.createElement('div');
          dot.className = 'mini-dot';
          dot.style.background = color;
          dotRow.appendChild(dot);
        });
        wrap.appendChild(dotRow);
      }

      mg.appendChild(wrap);
    }

    // Next-month filler
    const total    = firstDay + daysInMonth;
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= trailing; d++) {
      const cell = document.createElement('div');
      cell.className = 'mini-day';
      cell.textContent = d;
      mg.appendChild(cell);
    }

    card.appendChild(mg);
    grid.appendChild(card);
  }
  updateStripTodayBtn();
}

// Return an array of event colors for a given date key, respecting disabled calendars
function getEventDotsForDate(dateKey) {
  const colors = [];
  Object.entries(calEventCache).forEach(([calId, byDate]) => {
    if (disabledCals.has(calId)) return;
    const evts = byDate[dateKey] || [];
    evts.forEach(ev => { if (colors.length < 3) colors.push(ev.color); });
  });
  return colors;
}

// ── Weather ────────────────────────────────────────────────────
const WX_ICONS = {
  Thunderstorm:'⛈', Drizzle:'🌦', Rain:'🌧', Snow:'❄️',
  Clear:'☀️', Clouds:'☁️', Mist:'🌫', Fog:'🌫', Haze:'🌫',
  Smoke:'🌫', Dust:'🌬', Sand:'🌬', Ash:'🌋', Squall:'💨', Tornado:'🌪'
};

// ── Weather: multi-location ──────────────────────────────────────

// Called from the widget's first-time setup form
async function fetchWeather() {
  const city = document.getElementById('cityInput').value.trim();
  if (!city) return;
  if (!weatherLocations.includes(city)) {
    weatherLocations.push(city);
    saveWeatherLocations();
  }
  weatherLocIdx = weatherLocations.indexOf(city);
  await showWeatherLocation(weatherLocIdx);
}

// Detect location via browser geolocation + OWM reverse geocode
async function fetchWeatherByGeolocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  if (!weatherKey) {
    alert('Add your OpenWeatherMap API key in ⚙️ Settings → Weather first.');
    return;
  }
  const btn = document.getElementById('geoLocBtn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  const restore = () => { if (btn) { btn.textContent = '📍'; btn.disabled = false; } };

  navigator.geolocation.getCurrentPosition(
    async ({ coords: { latitude: lat, longitude: lon } }) => {
      try {
        const r = await owmFetch('reverse', { lat, lon, limit: 1 });
        const d = await r.json();
        const place = d?.[0];
        if (!place) { alert('Could not resolve your location to a city.'); restore(); return; }

        // Build a readable city label: "City, State" (US) or "City, Country"
        const city = place.name + (place.state ? `, ${place.state}` : place.country ? `, ${place.country}` : '');

        if (!weatherLocations.includes(city)) {
          weatherLocations.push(city);
          saveWeatherLocations();
        }
        weatherLocIdx = weatherLocations.indexOf(city);
        restore();
        await showWeatherLocation(weatherLocIdx);
      } catch (e) {
        alert('Location lookup failed: ' + e.message);
        restore();
      }
    },
    err => {
      const msgs = {
        1: 'Location permission denied. Allow location access in your browser settings.',
        2: 'Location unavailable.',
        3: 'Location request timed out.',
      };
      alert(msgs[err.code] || 'Geolocation error.');
      restore();
    },
    { timeout: 10000 }
  );
}

// Navigate
function prevWeatherLocation() {
  weatherLocIdx = (weatherLocIdx - 1 + weatherLocations.length) % weatherLocations.length;
  showWeatherLocation(weatherLocIdx);
}
function nextWeatherLocation() {
  weatherLocIdx = (weatherLocIdx + 1) % weatherLocations.length;
  showWeatherLocation(weatherLocIdx);
}

// Persist
function saveWeatherLocations() {
  localStorage.setItem('fh_wlocations', JSON.stringify(weatherLocations));
  // Keep legacy key in sync with first location for any old code paths
  if (weatherLocations.length) localStorage.setItem('fh_wcity', weatherLocations[0]);
}

// Show data for one location (by index). Uses cache when fresh.
async function showWeatherLocation(idx) {
  if (!weatherLocations.length) {
    document.getElementById('weatherSetup').style.display = '';
    document.getElementById('weatherDisplay').style.display = 'none';
    return;
  }
  weatherLocIdx = Math.max(0, Math.min(idx, weatherLocations.length - 1));
  const city = weatherLocations[weatherLocIdx];

  destroyRadarMap();   // reset map so it re-centers on the new location

  // Update nav dots
  renderWeatherNav();

  // Cache hit?
  const cacheKey = city.toLowerCase().trim();
  const cached = weatherCache[cacheKey];
  if (cached && (Date.now() - cached.ts) < WX_CACHE_TTL) {
    renderWeatherData(cached.data);
    return;
  }

  await loadWeatherByCity(city);
}

// Render the prev/next nav and dot indicators
function renderWeatherNav() {
  const dotsEl = document.getElementById('wxLocDots');
  const prevBtn = document.getElementById('wxLocPrev');
  const nextBtn = document.getElementById('wxLocNext');
  if (!dotsEl) return;
  const n = weatherLocations.length;
  const multi = n > 1;
  if (prevBtn) prevBtn.style.display = multi ? '' : 'none';
  if (nextBtn) nextBtn.style.display = multi ? '' : 'none';
  dotsEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const dot = document.createElement('button');
    dot.className = 'wx-loc-dot' + (i === weatherLocIdx ? ' active' : '');
    dot.title = weatherLocations[i];
    dot.onclick = () => showWeatherLocation(i);
    dotsEl.appendChild(dot);
  }
}

/** Active severe-weather alerts from the U.S. National Weather Service (free, keyless,
 *  US-only). Returns [{ event, headline, severity }]; [] on any failure or non-US point. */
async function fetchNwsAlerts(lat, lon) {
  try {
    const r = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`,
      { headers: { Accept: 'application/geo+json' } });
    if (!r.ok) return [];
    const d = await r.json();
    const order = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
    return (d.features || [])
      .map(f => ({
        event:    f.properties?.event    || 'Weather Alert',
        headline: f.properties?.headline || '',
        severity: f.properties?.severity || 'Unknown',
      }))
      .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  } catch { return []; }
}

async function loadWeatherByCity(city) {
  if (!weatherKey && !window.location.hostname.includes('netlify')) {
    document.getElementById('weatherSetup').style.display = '';
    document.getElementById('weatherDisplay').style.display = 'none';
    document.getElementById('cityInput').value = city;
    document.getElementById('cityInput').placeholder = 'Enter city, then add API key in ⚙️ Settings';
    return;
  }

  try {
    const [curR, fcastR] = await Promise.all([
      owmFetch('weather',  { q: city, units: 'imperial' }),
      owmFetch('forecast', { q: city, units: 'imperial', cnt: 56 }),
    ]);
    const cur   = await curR.json();
    const fcast = await fcastR.json();

    if (cur.cod !== 200) { alert('Weather error: ' + cur.message); return; }

    // Fetch air quality + reverse geocode (state) + severe-weather alerts using lat/lon
    const { lat, lon } = cur.coord || {};
    let aqi = null, aqiLabel = '', locationState = '', weatherAlerts = [];
    if (lat != null && lon != null) {
      const alertsP = fetchNwsAlerts(lat, lon);   // independent — never throws, [] on failure / non-US
      try {
        const [aqiR, geoR] = await Promise.all([
          owmFetch('air_pollution', { lat, lon }),
          owmFetch('reverse',       { lat, lon, limit: 1 }),
        ]);
        const aqiD = await aqiR.json();
        aqi = aqiD?.list?.[0]?.main?.aqi ?? null;
        const aqiLabels = ['', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];
        aqiLabel = aqiLabels[aqi] || '';

        const geoD = await geoR.json();
        const geo  = Array.isArray(geoD) ? geoD[0] : null;
        // Use state for US; fall back to country code elsewhere
        locationState = (geo?.country === 'US' && geo?.state) ? geo.state : (cur.sys?.country || '');
      } catch(e) { locationState = cur.sys?.country || ''; }
      weatherAlerts = await alertsP;
    } else {
      locationState = cur.sys?.country || '';
    }

    // Build processed data object and cache it
    const todayStr = new Date().toISOString().slice(0, 10);
    const forecastList = fcast.list || [];
    const todaySlots = forecastList.filter(s => s.dt_txt.startsWith(todayStr));

    let todayHi = -999, todayLo = 999, todayRainPct = 0, rainStartTime = null;
    todaySlots.forEach(s => {
      if (s.main.temp_max > todayHi) todayHi = s.main.temp_max;
      if (s.main.temp_min < todayLo) todayLo = s.main.temp_min;
      const pop = Math.round((s.pop || 0) * 100);
      if (pop > todayRainPct) todayRainPct = pop;
      if (pop >= 30 && !rainStartTime)
        rainStartTime = new Date(s.dt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    });
    if (todaySlots.length === 0) { todayHi = cur.main.temp_max; todayLo = cur.main.temp_min; }

    const dayMap = {};
    forecastList.forEach(s => {
      const date = s.dt_txt.slice(0, 10);
      if (date === todayStr) return;
      if (!dayMap[date]) dayMap[date] = { hi: -999, lo: 999, pop: 0, icon: null };
      const d = dayMap[date];
      if (s.main.temp_max > d.hi) d.hi = s.main.temp_max;
      if (s.main.temp_min < d.lo) d.lo = s.main.temp_min;
      const pop = Math.round((s.pop || 0) * 100);
      if (pop > d.pop) d.pop = pop;
      if (!d.icon || s.dt_txt.includes('12:00')) d.icon = s.weather[0].main;
    });

    // Hourly: first column is the CURRENT 3-hour block (anchored to the mark just
    // before the next forecast slot, shown with live conditions), then the next 4
    // forecast slots — e.g. 8·11·2·5·8 in the morning, 11·2·5·8·11 after noon.
    const SLOT_SECS = 3 * 3600;
    const futureSlots = forecastList.filter(s => s.dt * 1000 >= Date.now());
    const hours = [];
    if (futureSlots.length) {
      const anchorDt = futureSlots[0].dt - SLOT_SECS;   // start of the in-progress block
      hours.push({
        time: new Date(anchorDt * 1000).toLocaleTimeString([], { hour: 'numeric' }),
        icon: cur.weather[0].main,
        temp: Math.round(cur.main.temp),
        pop:  0,
      });
      futureSlots.slice(0, 4).forEach(s => hours.push({
        time: new Date(s.dt * 1000).toLocaleTimeString([], { hour: 'numeric' }),
        icon: s.weather[0].main,
        temp: Math.round(s.main.temp),
        pop:  Math.round((s.pop || 0) * 100),
      }));
    }

    // Curve: up to 16 slots (~48h), starting from the current in-progress block
    const tempSlots = [];
    if (futureSlots.length) {
      const anchorDt = futureSlots[0].dt - SLOT_SECS;
      tempSlots.push({ dt: anchorDt, temp: Math.round(cur.main.temp), pop: 0 });
      futureSlots.slice(0, 15).forEach(s => tempSlots.push({
        dt:   s.dt,
        temp: Math.round(s.main.temp),
        pop:  Math.round((s.pop || 0) * 100),
      }));
    }

    const fmtTime = ts => new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // Wind direction: degrees → compass label
    const windDeg = cur.wind?.deg ?? null;
    const windDirs = ['N','NE','E','SE','S','SW','W','NW'];
    const windDir  = windDeg != null ? windDirs[Math.round(windDeg / 45) % 8] : '';

    const data = {
      label:         cur.name,
      lat:           cur.coord?.lat ?? null,
      lon:           cur.coord?.lon ?? null,
      icon:          cur.weather[0].main,
      temp:          Math.round(cur.main.temp),
      feels:         cur.main.feels_like != null ? Math.round(cur.main.feels_like) : null,
      desc:          cur.weather[0].description,
      hi:            Math.round(todayHi),
      lo:            Math.round(todayLo),
      rain:          todayRainPct,
      rainStartTime: (todayRainPct >= 30 && rainStartTime) ? rainStartTime : null,
      humidity:      cur.main.humidity ?? null,
      windSpeed:     cur.wind?.speed != null ? Math.round(cur.wind.speed) : null,
      windDeg,
      windDir,
      visibility:    cur.visibility != null ? Math.round(cur.visibility / 1609.34 * 10) / 10 : null, // metres → miles
      days:          Object.entries(dayMap).sort(([a],[b]) => a < b ? -1 : 1).slice(0, 5),
      hours,
      tempSlots,
      sunrise:       cur.sys?.sunrise ? fmtTime(cur.sys.sunrise) : null,
      sunset:        cur.sys?.sunset  ? fmtTime(cur.sys.sunset)  : null,
      sunriseTs:     cur.sys?.sunrise ?? null,   // raw epoch seconds (for sun-path arc)
      sunsetTs:      cur.sys?.sunset  ?? null,
      tzOffset:      cur.timezone ?? 0,          // location's UTC offset in seconds
      aqi,
      aqiLabel,
      alerts:        weatherAlerts,   // real NWS severe-weather alerts (US); [] elsewhere
    };

    weatherCache[city.toLowerCase().trim()] = { ts: Date.now(), data };
    renderWeatherData(data);

  } catch(e) {
    console.error(e);
    alert('Could not load weather. Check your API key in Settings.');
  }
}

function renderWeatherData(data) {
  // Animated icon
  const iconEl = document.getElementById('wIcon');
  const wrapEl = document.getElementById('wIconWrap');
  iconEl.textContent = WX_ICONS[data.icon] || '🌡';
  const animClass = { Clear:'wx-anim-sunny', Rain:'wx-anim-rain', Drizzle:'wx-anim-rain',
                      Thunderstorm:'wx-anim-storm', Snow:'wx-anim-snow', Clouds:'wx-anim-clouds',
                      Mist:'wx-anim-clouds', Fog:'wx-anim-clouds', Haze:'wx-anim-clouds' };
  wrapEl.className = 'wx-icon-wrap ' + (animClass[data.icon] || '');

  document.getElementById('wTemp').textContent  = data.temp + '°F';
  const feelsEl = document.getElementById('wFeels');
  feelsEl.textContent = data.feels != null ? `Feels ${data.feels}°` : '';
  document.getElementById('wDesc').textContent  = data.desc;
  document.getElementById('weatherCity').textContent = '📍 ' + data.label;

  // Detail pills: compass rose only (humidity/wind/visibility moved to ticker)
  const detailsEl = document.getElementById('wDetails');
  detailsEl.innerHTML = '';

  // Activity tags
  const actEl = document.getElementById('wActivityTags');
  if (!wxActivityEnabled) {
    actEl.innerHTML = '';
    actEl.style.display = 'none';
  } else {
    actEl.style.display = '';
    const tags  = [];
    const temp  = data.temp, rain = data.rain, wind = data.windSpeed ?? 0, icon = data.icon;
    if (rain >= 60)                           tags.push({ e:'☂️',  label:'Bring umbrella' });
    if (rain < 20 && temp >= 60 && temp < 85 && wind < 20) tags.push({ e:'🚴', label:'Great for a bike ride' });
    if (rain < 30 && temp >= 55 && wind < 25) tags.push({ e:'🌳', label:'Good for outdoors' });
    if (temp < 40)                            tags.push({ e:'🧥',  label:'Bundle up' });
    if (temp >= 85)                           tags.push({ e:'🥵',  label:'Stay cool & hydrate' });
    if (icon === 'Clear' && temp >= 65 && temp < 90) tags.push({ e:'😎', label:'Great beach/pool day' });
    if (wind >= 20)                           tags.push({ e:'💨',  label:'Windy — hold onto your hat' });
    if (icon === 'Snow')                      tags.push({ e:'⛄',  label:'Snow day!' });
    if (icon === 'Thunderstorm')              tags.push({ e:'⚡',  label:'Stay indoors' });
    actEl.innerHTML = tags.map(t =>
      `<span class="wx-activity-tag" title="${t.label}">${t.e} ${t.label}</span>`
    ).join('');
  }

  // Condition-based card tint
  const cardEl = document.getElementById('weatherCard');
  if (cardEl) {
    const tints = {
      Clear:'rgba(255,210,80,.06)', Rain:'rgba(80,140,255,.07)', Drizzle:'rgba(80,140,255,.05)',
      Thunderstorm:'rgba(120,80,200,.09)', Snow:'rgba(200,230,255,.07)',
      Clouds:'rgba(160,160,180,.05)', Mist:'rgba(160,160,180,.04)',
      Fog:'rgba(160,160,180,.04)', Haze:'rgba(160,160,180,.04)',
    };
    cardEl.style.setProperty('--wx-tint', tints[data.icon] || 'transparent');
  }
  document.getElementById('wHigh').textContent  = data.hi + '°';
  document.getElementById('wLow').textContent   = data.lo + '°';
  document.getElementById('wRain').textContent  = data.rain + '%';
  const rainTimeEl = document.getElementById('wRainTime');
  if (data.rainStartTime) {
    document.getElementById('wRainStart').textContent = data.rainStartTime;
    rainTimeEl.style.display = '';
  } else {
    rainTimeEl.style.display = 'none';
  }

  // Toggle button state
  const btn5day   = document.getElementById('wxToggle5day');
  const btnHourly = document.getElementById('wxToggleHourly');
  const btnCurve  = document.getElementById('wxToggleCurve');
  const btnRadar  = document.getElementById('wxToggleRadar');
  if (btn5day)   btn5day.classList.toggle('active', weatherForecastMode === '5day');
  if (btnHourly) btnHourly.classList.toggle('active', weatherForecastMode === 'hourly');
  if (btnCurve)  btnCurve.classList.toggle('active',  weatherForecastMode === 'curve');
  if (btnRadar)  btnRadar.classList.toggle('active',  weatherForecastMode === 'radar');

  const fcastEl = document.getElementById('wForecast');
  fcastEl.innerHTML = '';

  // Radar map lives in its own persistent container — show/hide it here
  const radarEl = document.getElementById('wxRadarMap');
  if (radarEl) radarEl.style.display = 'none';

  if (weatherForecastMode === 'radar') {
    renderRadarMap(data);
  } else if (weatherForecastMode === 'curve' && data.tempSlots?.length) {
    fcastEl.appendChild(renderTempCurve(data.tempSlots));
  } else if (weatherForecastMode === 'hourly' && data.hours?.length) {
    const strip = document.createElement('div');
    strip.className = 'wx-hourly';
    data.hours.forEach(h => {
      const card = document.createElement('div');
      card.className = 'wx-hour';
      const timeEl = document.createElement('span');
      timeEl.className = 'wx-hour-time';
      timeEl.textContent = h.time;
      const iconEl = document.createElement('span');
      iconEl.className = 'wx-hour-icon';
      iconEl.textContent = WX_ICONS[h.icon] || '🌡';
      const tempEl = document.createElement('span');
      tempEl.className = 'wx-hour-temp';
      tempEl.textContent = h.temp + '°';
      // Precip bar
      const barWrap = document.createElement('div');
      barWrap.className = 'wx-hour-bar-wrap';
      barWrap.title = h.pop > 0 ? h.pop + '% chance of rain' : 'No precipitation';
      const bar = document.createElement('div');
      bar.className = 'wx-hour-bar';
      bar.style.height = h.pop + '%';
      barWrap.appendChild(bar);
      card.appendChild(timeEl);
      card.appendChild(iconEl);
      card.appendChild(tempEl);
      card.appendChild(barWrap);
      strip.appendChild(card);
    });
    fcastEl.appendChild(strip);
  } else {
    const days = data.days;
    const allHi  = days.map(([,d]) => d.hi);
    const absMax = Math.max(...allHi);
    const absMin = Math.min(...days.map(([,d]) => d.lo));
    days.forEach(([date, d]) => {
      const dayName = new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });
      const barPct  = absMax > absMin ? Math.round(((d.hi - absMin) / (absMax - absMin)) * 100) : 50;
      const row = document.createElement('div');
      row.className = 'wx-day';
      row.innerHTML = `
        <span class="wx-day-name">${dayName}</span>
        <span class="wx-day-icon">${WX_ICONS[d.icon] || '🌡'}</span>
        <div class="wx-day-bar-wrap"><div class="wx-day-bar" style="width:${barPct}%"></div></div>
        <span class="wx-day-lo">${Math.round(d.lo)}°</span>
        <span class="wx-day-hi">${Math.round(d.hi)}°</span>
        <span class="wx-day-rain">${d.pop > 0 ? d.pop + '%' : ''}</span>
      `;
      fcastEl.appendChild(row);
    });
  }

  // ── Sun-path arc ──
  renderSunArc(data);

  // ── Weather ticker ──
  if (wxTickerEnabled) {
    renderWeatherTicker(data);
  } else {
    const ticker = document.getElementById('wxTicker');
    if (ticker) ticker.style.display = 'none';
  }

  const fcastToggle = document.getElementById('wxForecastToggle');
  if (fcastToggle) fcastToggle.style.display = '';
  document.getElementById('weatherSetup').style.display  = 'none';
  document.getElementById('weatherDisplay').style.display = 'block';
  applyWxViewToggles();
}

// Sun-path arc: shows the sun's position between sunrise & sunset, daylight
// remaining, and a golden-hour tint. Pure local compute — no extra API call.
function renderSunArc(data) {
  const el = document.getElementById('wxSunArc');
  if (!el) return;
  if (!sunArcEnabled) { el.style.display = 'none'; return; }
  const sr = data.sunriseTs, ss = data.sunsetTs;
  if (sr == null || ss == null || ss <= sr) { el.style.display = 'none'; return; }
  el.style.display = '';

  const nowSec = Date.now() / 1000;
  const frac   = (nowSec - sr) / (ss - sr);
  const isDay  = frac >= 0 && frac <= 1;
  const fC     = Math.max(0, Math.min(1, frac));

  // Arc geometry — top half of an ellipse in a 0 0 300 96 viewBox
  const cx = 150, cy = 84, rx = 138, ry = 70;
  const theta = Math.PI * (1 - fC);            // fC 0→left, 1→right
  const sunX  = cx + rx * Math.cos(theta);
  const sunY  = cy - ry * Math.sin(theta);

  const trackPath    = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`;
  const progressPath = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${sunX.toFixed(1)} ${sunY.toFixed(1)}`;

  const fmtDur = secs => {
    secs = Math.max(0, Math.round(secs));
    const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  let readout, emoji = '☀️', goldenHour = false;
  if (isDay) {
    goldenHour = (nowSec - sr) <= 3600 || (ss - nowSec) <= 3600;  // within 1h of sun events
    readout = `${fmtDur(ss - nowSec)} of daylight left`;
    emoji   = goldenHour ? '🌇' : '☀️';
  } else if (frac < 0) {
    readout = `Sunrise in ${fmtDur(sr - nowSec)}`;
    emoji   = '🌙';
  } else {
    readout = `Sunset was ${fmtDur(nowSec - ss)} ago`;
    emoji   = '🌙';
  }

  const sunColor = goldenHour ? '#ff9d3c' : '#ffd24a';

  el.innerHTML = `
    <svg viewBox="0 0 300 96" class="wx-sun-svg" preserveAspectRatio="xMidYMid meet">
      <path class="wx-sun-track" d="${trackPath}" />
      ${isDay ? `<path class="wx-sun-progress" d="${progressPath}" />` : ''}
      ${isDay ? `
        <circle class="wx-sun-glow" cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="9" fill="${sunColor}" />
        <circle class="wx-sun-dot"  cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="5.5" fill="${sunColor}" />
      ` : ''}
      <text class="wx-sun-end" x="${cx - rx}" y="94" text-anchor="start">${data.sunrise || ''}</text>
      <text class="wx-sun-end" x="${cx + rx}" y="94" text-anchor="end">${data.sunset || ''}</text>
    </svg>
    <div class="wx-sun-readout">${emoji} ${readout}</div>
  `;
}

// Leaflet map instance + state (persisted across mode switches to avoid re-init)
let _radarMap     = null;
let _radarLayer   = null;
let _radarLat     = null;
let _radarLon     = null;

/** Show/update the Leaflet precipitation radar panel.
 *  #wxRadarMap is a persistent div in the HTML — never recreated — so Leaflet's
 *  internal state stays valid across mode switches.
 */
function renderRadarMap(data) {
  const container = document.getElementById('wxRadarMap');
  if (!container) return;

  const lat = data.lat, lon = data.lon;
  if (lat == null || lon == null) {
    container.innerHTML = '<p style="color:var(--muted);font-size:.8rem;padding:8px">Location coordinates unavailable</p>';
    container.style.display = '';
    return;
  }

  if (typeof L === 'undefined') {
    container.innerHTML = '<p style="color:var(--muted);font-size:.8rem;padding:8px">Map loading…</p>';
    container.style.display = '';
    return;
  }

  // Make container visible FIRST, then wait one frame for the browser to lay it
  // out before Leaflet measures its size — prevents the split-tile bug.
  container.style.display = '';

  const doInit = () => {
    if (!_radarMap) {
      _radarMap = L.map(container, {
        zoomControl: true,
        attributionControl: true,
      }).setView([lat, lon], 7);

      // OpenStreetMap base layer (free, no key, universally available)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(_radarMap);

      // OWM precipitation overlay
      _radarLayer = L.tileLayer(
        `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${weatherKey}`,
        { opacity: 0.65, maxZoom: 19 }
      ).addTo(_radarMap);

      _radarLat = lat; _radarLon = lon;
    } else {
      // Re-center if location changed
      if (lat !== _radarLat || lon !== _radarLon) {
        _radarMap.setView([lat, lon], 7);
        _radarLat = lat; _radarLon = lon;
      }
      _radarMap.invalidateSize();
    }
  };

  // Double rAF ensures the browser has painted the container at its CSS height
  // before Leaflet reads offsetWidth/offsetHeight for tile calculations.
  requestAnimationFrame(() => requestAnimationFrame(doInit));
}

/** Reset the radar map so it re-initializes on the next location. */
function destroyRadarMap() {
  if (_radarMap) { _radarMap.remove(); _radarMap = null; _radarLayer = null; }
  _radarLat = null; _radarLon = null;
  const el = document.getElementById('wxRadarMap');
  if (el) el.style.display = 'none';
}

/** Build and return an SVG temperature curve element for the next ~48h.
 *  @param {Array<{dt:number, temp:number, pop:number}>} slots — epoch-second timestamps
 *  @returns {SVGElement}
 */
function renderTempCurve(slots) {
  const W = 300, H = 110, PAD_L = 28, PAD_R = 8, PAD_T = 18, PAD_B = 24;
  const iW = W - PAD_L - PAD_R, iH = H - PAD_T - PAD_B;

  const temps = slots.map(s => s.temp);
  const minT  = Math.min(...temps), maxT = Math.max(...temps);
  const rangeT = Math.max(maxT - minT, 5); // avoid division by zero on flat days

  const xOf = i => PAD_L + (i / (slots.length - 1)) * iW;
  const yOf = t => PAD_T + iH - ((t - minT) / rangeT) * iH;

  // Smooth polyline via cubic bezier control points
  const pts = slots.map((s, i) => [xOf(i), yOf(s.temp)]);
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = (pts[i-1][0] + pts[i][0]) / 2;
    const cp2x = cp1x;
    d += ` C ${cp1x.toFixed(1)} ${pts[i-1][1].toFixed(1)}, ${cp2x.toFixed(1)} ${pts[i][1].toFixed(1)}, ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  }
  // Fill path — close down and back
  const fillD = `${d} L ${pts[pts.length-1][0].toFixed(1)} ${PAD_T + iH} L ${pts[0][0].toFixed(1)} ${PAD_T + iH} Z`;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'wx-curve-svg');

  // Gradient fill under curve
  const defs   = document.createElementNS(ns, 'defs');
  const grad   = document.createElementNS(ns, 'linearGradient');
  grad.setAttribute('id', 'wxCurveGrad');
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  const stop1  = document.createElementNS(ns, 'stop');
  stop1.setAttribute('offset', '0%');   stop1.setAttribute('stop-color', 'var(--accent)');  stop1.setAttribute('stop-opacity', '0.25');
  const stop2  = document.createElementNS(ns, 'stop');
  stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', 'var(--accent)');  stop2.setAttribute('stop-opacity', '0');
  grad.appendChild(stop1); grad.appendChild(stop2); defs.appendChild(grad); svg.appendChild(defs);

  // Fill
  const fillEl = document.createElementNS(ns, 'path');
  fillEl.setAttribute('d', fillD);
  fillEl.setAttribute('fill', 'url(#wxCurveGrad)');
  svg.appendChild(fillEl);

  // Precip bars (behind line)
  const BAR_MAX_H = iH * 0.3;
  slots.forEach((s, i) => {
    if (!s.pop) return;
    const bx = xOf(i);
    const bh = (s.pop / 100) * BAR_MAX_H;
    const bar = document.createElementNS(ns, 'rect');
    bar.setAttribute('x', (bx - 2).toFixed(1));
    bar.setAttribute('y', (PAD_T + iH - bh).toFixed(1));
    bar.setAttribute('width', '4');
    bar.setAttribute('height', bh.toFixed(1));
    bar.setAttribute('rx', '2');
    bar.setAttribute('fill', '#61afef');
    bar.setAttribute('opacity', '0.35');
    svg.appendChild(bar);
  });

  // Curve line
  const lineEl = document.createElementNS(ns, 'path');
  lineEl.setAttribute('d', d);
  lineEl.setAttribute('class', 'wx-curve-line');
  svg.appendChild(lineEl);

  // Dots + labels — only at 12h intervals + first + last
  // Label slot 0 (current), plus the 8 / 12 / 16 / 20 / 0 hour boundaries
  const KEY_HOURS = new Set([0, 8, 12, 16, 20]);
  const labeledIdx = new Set([0]);
  slots.forEach((s, i) => {
    if (i === 0) return; // already included
    const h = new Date(s.dt * 1000).getHours();
    if (KEY_HOURS.has(h)) labeledIdx.add(i);
  });

  labeledIdx.forEach(i => {
    const [px, py] = pts[i];
    const s = slots[i];
    const isCurrent = i === 0;

    // Dot — larger + accent2 fill for the current hour
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', px.toFixed(1));
    circle.setAttribute('cy', py.toFixed(1));
    circle.setAttribute('r', isCurrent ? '4.5' : '3');
    circle.setAttribute('class', 'wx-curve-dot' + (isCurrent ? ' wx-curve-dot-now' : ''));
    svg.appendChild(circle);

    // Temp label (above dot, but keep inside PAD_T)
    const tempLabel = document.createElementNS(ns, 'text');
    tempLabel.setAttribute('x', px.toFixed(1));
    const ly = Math.max(PAD_T - 2, py - (isCurrent ? 8 : 6));
    tempLabel.setAttribute('y', ly.toFixed(1));
    tempLabel.setAttribute('class', 'wx-curve-label' + (isCurrent ? ' wx-curve-label-now' : ''));
    tempLabel.textContent = s.temp + '°';
    svg.appendChild(tempLabel);

    // Time label (below baseline) — "Now" for slot 0
    const timeLabel = document.createElementNS(ns, 'text');
    timeLabel.setAttribute('x', px.toFixed(1));
    timeLabel.setAttribute('y', (PAD_T + iH + 10).toFixed(1));
    timeLabel.setAttribute('class', 'wx-curve-time' + (isCurrent ? ' wx-curve-label-now' : ''));
    timeLabel.textContent = isCurrent ? 'Now' : new Date(s.dt * 1000).toLocaleTimeString([], { hour: 'numeric' });
    svg.appendChild(timeLabel);
  });

  const wrap = document.createElement('div');
  wrap.className = 'wx-curve-wrap';
  wrap.appendChild(svg);
  return wrap;
}

/** Return moon phase emoji + name for a given Date (default: today).
 *  Uses the standard synodic-month approximation (29.53059 days).
 *  Known new moon anchor: 2000-01-06 18:14 UTC.
 */
function getMoonPhase(date = new Date()) {
  const KNOWN_NEW = new Date('2000-01-06T18:14:00Z').getTime();
  const SYNODIC   = 29.53059 * 24 * 3600 * 1000;
  const age = ((date.getTime() - KNOWN_NEW) % SYNODIC + SYNODIC) % SYNODIC; // ms into cycle
  const frac = age / SYNODIC; // 0–1

  // 8-phase labels + emoji
  const phases = [
    { max: 0.033, emoji: '🌑', name: 'New Moon'        },
    { max: 0.216, emoji: '🌒', name: 'Waxing Crescent'  },
    { max: 0.283, emoji: '🌓', name: 'First Quarter'    },
    { max: 0.466, emoji: '🌔', name: 'Waxing Gibbous'   },
    { max: 0.533, emoji: '🌕', name: 'Full Moon'        },
    { max: 0.716, emoji: '🌖', name: 'Waning Gibbous'   },
    { max: 0.783, emoji: '🌗', name: 'Last Quarter'     },
    { max: 0.966, emoji: '🌘', name: 'Waning Crescent'  },
    { max: 1.000, emoji: '🌑', name: 'New Moon'         },
  ];
  const p = phases.find(p => frac < p.max) || phases[phases.length - 1];
  return { emoji: p.emoji, name: p.name };
}

function renderWeatherTicker(data) {
  const ticker = document.getElementById('wxTicker');
  const track  = document.getElementById('wxTickerTrack');
  if (!ticker || !track) return;

  const aqiColors = ['', '#4caf82', '#a8d84e', '#f5c542', '#f5822a', '#e05c2a'];
  const segments  = [];

  // Severe-weather alerts first (highest priority), colored by NWS severity
  const sevColor = { Extreme: '#e53935', Severe: '#e53935', Moderate: '#f5822a', Minor: '#f5c542', Unknown: '#f5c542' };
  (data.alerts || []).forEach(a => {
    const c = sevColor[a.severity] || '#f5c542';
    segments.push(`<span style="color:${c};font-weight:700">⚠️ ${esc(a.headline || a.event)}</span>`);
  });

  // Precipitation start time
  if (data.rainStartTime) {
    segments.push(`🌧 Precipitation starts around ${data.rainStartTime}`);
  }

  // Humidity / Wind / Visibility
  if (data.humidity  != null) segments.push(`💧 Humidity ${data.humidity}%`);
  if (data.windSpeed != null) segments.push(`💨 Wind ${data.windSpeed} mph ${data.windDir}`);
  if (data.visibility != null) segments.push(`👁 Visibility ${data.visibility} mi`);

  // Sunrise / Sunset / Moon phase
  if (data.sunrise) segments.push(`🌅 Sunrise ${data.sunrise}`);
  if (data.sunset)  segments.push(`🌇 Sunset ${data.sunset}`);
  const moon = getMoonPhase();
  segments.push(`${moon.emoji} ${moon.name}`);

  // Air Quality
  if (data.aqi != null) {
    const color = aqiColors[data.aqi] || 'var(--muted)';
    segments.push(`🌬 Air Quality: <span style="color:${color};font-weight:600">${data.aqiLabel || 'AQI ' + data.aqi}</span>`);
  }

  if (!segments.length) { ticker.style.display = 'none'; return; }

  // Duplicate content so the scroll loops seamlessly
  const sep    = ' &nbsp;&nbsp;·&nbsp;&nbsp; ';
  const joined = segments.join(sep);
  track.innerHTML = joined + sep + joined;

  // Reset animation by toggling class
  track.classList.remove('wx-ticker-anim');
  void track.offsetWidth; // force reflow
  track.classList.add('wx-ticker-anim');
  ticker.style.display = 'block';
}

function setWeatherForecastMode(mode) {
  weatherForecastMode = mode;
  localStorage.setItem('fh_wxForecastMode', mode);
  const city = weatherLocations[weatherLocIdx];
  if (!city) return;
  const cached = weatherCache[city.toLowerCase().trim()];
  if (cached?.data) renderWeatherData(cached.data);
}

// Settings: render the location list
function renderWeatherLocationsList() {
  const el = document.getElementById('wxLocationsList');
  if (!el) return;
  el.innerHTML = '';
  if (!weatherLocations.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:var(--text-xs);padding:4px 0">No locations added yet.</div>';
    return;
  }
  weatherLocations.forEach((city, i) => {
    const row = document.createElement('div');
    row.className = 'sms-setting-row';
    row.innerHTML = `
      <span style="flex:1;font-size:var(--text-sm)">${esc(city)}</span>
      <button onclick="removeWeatherLocation(${i})"
              style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1"
              title="Remove">✕</button>
    `;
    el.appendChild(row);
  });
}

function addWeatherLocation() {
  const input = document.getElementById('wxNewCity');
  const city = input.value.trim();
  if (!city || weatherLocations.includes(city)) { input.focus(); return; }
  weatherLocations.push(city);
  saveWeatherLocations();
  input.value = '';
  renderWeatherLocationsList();
  // Pre-fetch the new location in the background
  if (weatherKey) loadWeatherByCity(city);
}

function removeWeatherLocation(i) {
  weatherLocations.splice(i, 1);
  saveWeatherLocations();
  renderWeatherLocationsList();
  if (weatherLocIdx >= weatherLocations.length) weatherLocIdx = Math.max(0, weatherLocations.length - 1);
  if (weatherLocations.length) showWeatherLocation(weatherLocIdx);
  else {
    document.getElementById('weatherSetup').style.display = '';
    document.getElementById('weatherDisplay').style.display = 'none';
    renderWeatherNav();
  }
}

function changeCity() {
  // Legacy: clear all locations and show setup
  weatherLocations = [];
  saveWeatherLocations();
  document.getElementById('weatherSetup').style.display = '';
  document.getElementById('weatherDisplay').style.display = 'none';
  renderWeatherNav();
  document.getElementById('cityInput').value = '';
  document.getElementById('cityInput').focus();
}

// ── Snarky / WTF Forecast ──
function applyWxViewToggles() {
  const btnMap = { '5day': 'wxToggle5day', 'hourly': 'wxToggleHourly', 'curve': 'wxToggleCurve', 'radar': 'wxToggleRadar' };
  Object.entries(btnMap).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = wxEnabledViews[key] ? '' : 'none';
  });
  const snarkyBtn = document.getElementById('wxSnarkyBtn');
  if (snarkyBtn) {
    snarkyBtn.style.display = wxEnabledViews['snarky'] ? '' : 'none';
    snarkyBtn.classList.toggle('active', snarkyMode);
  }
  // If current forecast mode was disabled, fall back to first enabled mode
  if (!wxEnabledViews[weatherForecastMode]) {
    const first = ['5day','hourly','curve','radar'].find(k => wxEnabledViews[k]);
    if (first) setWeatherForecastMode(first);
  }
  // If snarky was on but is now disabled, turn it off
  if (!wxEnabledViews['snarky'] && snarkyMode) {
    snarkyMode = false;
    localStorage.setItem('fh_snarkyMode', JSON.stringify(false));
    const el = document.getElementById('wxSnarky');
    if (el) el.style.display = 'none';
  }
  if (snarkyMode) showSnarkyForecast();
}

function toggleSnarkyForecast() {
  snarkyMode = !snarkyMode;
  localStorage.setItem('fh_snarkyMode', JSON.stringify(snarkyMode));
  const btn = document.getElementById('wxSnarkyBtn');
  if (btn) btn.classList.toggle('active', snarkyMode);
  if (snarkyMode) {
    showSnarkyForecast();
  } else {
    const el = document.getElementById('wxSnarky');
    if (el) el.style.display = 'none';
  }
}

async function showSnarkyForecast() {
  const el = document.getElementById('wxSnarky');
  if (!el) return;
  const city = weatherLocations[weatherLocIdx];
  if (!city) { el.style.display = 'none'; return; }
  const cached = weatherCache[city.toLowerCase().trim()];
  if (!cached) { el.style.display = 'none'; return; }
  const wx = cached.data;

  const cacheKey = `${city.toLowerCase().trim()}_${wx.temp}_${wx.icon}`;
  el.style.display = '';

  if (snarkyCache[cacheKey]) {
    const t = '😜 ' + snarkyCache[cacheKey] + '        ';
    el.innerHTML = `<div class="wx-snarky-track">${esc(t)}${esc(t)}</div>`;
    return;
  }

  el.innerHTML = `<span class="wx-snarky-loading">Cooking up something ridiculous…</span>`;

  try {
    const parts = [`${wx.temp}°F`, wx.desc];
    if (wx.feels != null) parts.push(`feels like ${wx.feels}°F`);
    if (wx.hi != null && wx.lo != null) parts.push(`high ${wx.hi}° / low ${wx.lo}°`);
    if (wx.rain != null) parts.push(`${wx.rain}% chance of rain`);
    if (wx.windSpeed) parts.push(`wind ${wx.windSpeed} mph`);
    const conditions = parts.join(', ');

    const prompt = `You are a hilariously dramatic but totally kid-friendly weather announcer for elementary school children. Write exactly 2 funny sentences describing today's weather. Use silly comparisons, goofy exaggeration, and playful humor — like a Saturday morning cartoon. No scary content, no gross-out humor, no adult themes, no bad words. Keep vocabulary simple enough for a 7-year-old.

Weather: ${conditions}.

Reply with only the 2 sentences. No intro, no labels.`;

    const resp = await geminiFetch({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (text) {
      snarkyCache[cacheKey] = text;
      const t = '😜 ' + text + '        ';
      el.innerHTML = `<div class="wx-snarky-track">${esc(t)}${esc(t)}</div>`;
    } else {
      el.style.display = 'none';
    }
  } catch(e) {
    el.style.display = 'none';
  }
}

// ── Calendar Swipe ──
function setupCalSwipe() {
  let startX = 0, startY = 0;
  const body = document.querySelector('.cal-card .card-body');
  if (!body) return;
  body.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  body.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    changeCalPeriod(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// ── Firestore Lists ─────────────────────────────────────────────
function setupListeners() {
  if (!db) {
    // Fallback to localStorage if Firebase not configured
    todoItems = getLocalList('todo');
    renderTodoList();
    renderLocalList('shopping');
    budgetItems = lsGet('fh_budgetItems', []);
    onBudgetChanged();
    return;
  }

  db.collection('todo').orderBy('createdAt').onSnapshot(snap => {
    todoItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTodoList();
    renderCurrentView(); // refresh calendar so due-date items update
  });
  db.collection('shopping').orderBy('createdAt').onSnapshot(snap => {
    renderFsList('shopList', 'shopEmpty', snap.docs, 'shopping');
  });

  // Budget — real-time sync
  db.collection('budget').orderBy('createdAt').onSnapshot(snap => {
    budgetItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    onBudgetChanged();
  });

  // One-time migration: if localStorage has budget items, push them to Firestore
  const legacy = lsGet('fh_budgetItems', []);
  if (legacy.length) {
    const batch = db.batch();
    legacy.forEach(item => {
      const { id: _oldId, ...rest } = item; // drop old numeric id
      const ref = db.collection('budget').doc();
      batch.set(ref, { ...rest, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    batch.commit().then(() => {
      localStorage.removeItem('fh_budgetItems');
      console.log('[Budget] Migrated', legacy.length, 'item(s) from localStorage to Firestore.');
    });
  }

  // Meal plan — real-time sync across all family devices
  db.collection('mealPlan').onSnapshot(snap => {
    mealPlan = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (d.dateKey && d.mealType) {
        if (!mealPlan[d.dateKey]) mealPlan[d.dateKey] = {};
        const { dateKey: _dk, mealType: _mt, ...rest } = d;
        mealPlan[d.dateKey][d.mealType] = rest;
      }
    });
    renderCurrentView();
  });

  // One-time migration: push localStorage meal plan to Firestore
  const legacyMeals = lsGet('fh_mealPlan', {});
  const legacyMealEntries = [];
  Object.entries(legacyMeals).forEach(([dateKey, meals]) => {
    Object.entries(meals).forEach(([mealType, data]) => {
      legacyMealEntries.push({ dateKey, mealType, ...data });
    });
  });
  if (legacyMealEntries.length) {
    const mealBatch = db.batch();
    legacyMealEntries.forEach(entry => {
      mealBatch.set(db.collection('mealPlan').doc(`${entry.dateKey}_${entry.mealType}`), entry);
    });
    mealBatch.commit().then(() => {
      localStorage.removeItem('fh_mealPlan');
      console.log('[MealPlan] Migrated', legacyMealEntries.length, 'meal(s) from localStorage to Firestore.');
    });
  }

  // Family members — real-time sync so every device shares the same list
  db.collection('familyMembers').orderBy('order').onSnapshot(snap => {
    familyMembers = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name, order: doc.data().order ?? 0, gender: doc.data().gender || 'neutral', color: doc.data().color || null }));
    // Back-fill missing order fields (e.g. docs created before this field existed)
    const needsOrder = familyMembers.filter(m => m.order === 0 && familyMembers.indexOf(m) > 0);
    if (snap.docs.some(d => d.data().order == null)) {
      const batch = db.batch();
      snap.docs.forEach((d, i) => {
        if (d.data().order == null) batch.update(d.ref, { order: i });
      });
      batch.commit();
    }
    renderFamilyMemberList();
  });

  // One-time migration: push localStorage family members to Firestore
  const legacyMembers = lsGet('fh_familyMembers', []);
  if (legacyMembers.length) {
    const memberBatch = db.batch();
    legacyMembers.forEach(m => {
      memberBatch.set(db.collection('familyMembers').doc(), { name: m.name });
    });
    memberBatch.commit().then(() => {
      localStorage.removeItem('fh_familyMembers');
      console.log('[FamilyMembers] Migrated', legacyMembers.length, 'member(s) from localStorage to Firestore.');
    });
  }
}

function renderTodoList() {
  const ul    = document.getElementById('todoList');
  const empty = document.getElementById('todoEmpty');
  if (!ul) return;
  ul.innerHTML = '';
  const hasDone = todoItems.some(i => i.done);
  const hasAny  = todoItems.length > 0;
  const doneBtn = document.getElementById('todoClearDoneBtn');
  const allBtn  = document.getElementById('todoClearAllBtn');
  if (doneBtn) doneBtn.style.display = hasDone ? '' : 'none';
  if (allBtn)  allBtn.style.display  = hasAny  ? '' : 'none';
  if (!todoItems.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  todoItems.forEach(item => {
    const onToggle = db
      ? () => toggleFs('todo', item.id, item.done)
      : () => { item.done = !item.done; saveLocalList('todo', todoItems); renderTodoList(); };
    const onDelete = db
      ? () => deleteFs('todo', item.id)
      : () => { todoItems = todoItems.filter(t => t.id !== item.id); saveLocalList('todo', todoItems); renderTodoList(); };
    ul.appendChild(makeTodoItem(item, onToggle, onDelete));
  });
}

function renderFsList(ulId, emptyId, docs, collection) {
  if (collection === 'shopping') {
    const entries = docs.map(doc => {
      const d = doc.data();
      return { text: d.text, done: d.done, by: d.by, category: d.category || 'Other',
               onToggle: () => toggleFs(collection, doc.id, d.done),
               onDelete: () => deleteFs(collection, doc.id) };
    });
    renderShopGrouped(entries);
    return;
  }
  const ul = document.getElementById(ulId);
  const empty = document.getElementById(emptyId);
  ul.innerHTML = '';
  if (!docs.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  docs.forEach(doc => {
    const d = doc.data();
    ul.appendChild(makeListItem(d.text, d.done, d.by, () => toggleFs(collection, doc.id, d.done), () => deleteFs(collection, doc.id)));
  });
}

async function toggleFs(col, id, done) {
  await db.collection(col).doc(id).update({ done: !done });
}
async function deleteFs(col, id) {
  await db.collection(col).doc(id).delete();
}

async function addToFs(col, text, extra = {}) {
  await db.collection(col).add({ text, done: false, by: userName, createdAt: firebase.firestore.FieldValue.serverTimestamp(), ...extra });
}

async function clearDoneFs(col) {
  const snap = await db.collection(col).where('done','==',true).get();
  snap.forEach(doc => doc.ref.delete());
}

async function setMealInFs(dateKey, mealType, mealData) {
  if (!db) {
    if (!mealPlan[dateKey]) mealPlan[dateKey] = {};
    mealPlan[dateKey][mealType] = mealData;
    localStorage.setItem('fh_mealPlan', JSON.stringify(mealPlan));
    renderCurrentView();
    return;
  }
  await db.collection('mealPlan').doc(`${dateKey}_${mealType}`).set({ dateKey, mealType, ...mealData });
}

async function deleteMealFromFs(dateKey, mealType) {
  if (!db) {
    if (!mealPlan[dateKey]) return;
    delete mealPlan[dateKey][mealType];
    if (!Object.keys(mealPlan[dateKey]).length) delete mealPlan[dateKey];
    localStorage.setItem('fh_mealPlan', JSON.stringify(mealPlan));
    renderCurrentView();
    return;
  }
  await db.collection('mealPlan').doc(`${dateKey}_${mealType}`).delete();
}

// ── Local storage fallback ─────────────────────────────────────
function localKey(col) { return 'fh_' + col; }
function getLocalList(col) { return lsGet(localKey(col), []); }
function saveLocalList(col, items) { localStorage.setItem(localKey(col), JSON.stringify(items)); }

function renderLocalList(col) {
  if (col === 'shopping') {
    const items = getLocalList('shopping');
    const entries = items.map((item, i) => ({
      text: item.text, done: item.done, by: item.by, category: item.category || 'Other',
      onToggle: () => { items[i].done = !items[i].done; saveLocalList('shopping', items); renderLocalList('shopping'); },
      onDelete: () => { items.splice(i, 1); saveLocalList('shopping', items); renderLocalList('shopping'); },
    }));
    renderShopGrouped(entries);
    return;
  }
  const ulId    = col === 'todo' ? 'todoList' : 'shopList';
  const emptyId = col === 'todo' ? 'todoEmpty' : 'shopEmpty';
  const items   = getLocalList(col);
  const ul      = document.getElementById(ulId);
  const empty   = document.getElementById(emptyId);
  ul.innerHTML  = '';
  if (!items.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  items.forEach((item, i) => {
    ul.appendChild(makeListItem(
      item.text, item.done, item.by,
      () => { items[i].done = !items[i].done; saveLocalList(col, items); renderLocalList(col); },
      () => { items.splice(i, 1); saveLocalList(col, items); renderLocalList(col); }
    ));
  });
}

function makeListItem(text, done, by, onToggle, onDelete) {
  const li = document.createElement('li');
  li.className = 'list-item';
  const check = document.createElement('div');
  check.className = 'list-check' + (done ? ' done' : '');
  check.onclick = onToggle;
  const wrap = document.createElement('div');
  wrap.className = 'list-label-wrap';
  const label = document.createElement('span');
  label.className = 'list-label' + (done ? ' done' : '');
  label.textContent = text;
  wrap.appendChild(label);
  if (by) {
    const meta = document.createElement('span');
    meta.className = 'list-meta';
    meta.textContent = by;
    wrap.appendChild(meta);
  }
  const del = document.createElement('button');
  del.className = 'list-delete';
  del.textContent = '✕';
  del.onclick = onDelete;
  li.appendChild(check);
  li.appendChild(wrap);
  li.appendChild(del);
  return li;
}

function makeTodoItem(item, onToggle, onDelete) {
  const li = document.createElement('li');
  li.className = 'list-item';

  const check = document.createElement('div');
  check.className = 'list-check' + (item.done ? ' done' : '');
  check.onclick = onToggle;

  const wrap = document.createElement('div');
  wrap.className = 'list-label-wrap';

  const label = document.createElement('span');
  label.className = 'list-label' + (item.done ? ' done' : '');
  label.textContent = item.text;
  wrap.appendChild(label);

  // Badges row (due date + assignee)
  const today = new Date().toISOString().slice(0, 10);
  const hasBadge = item.dueDate || item.assignedTo;
  if (hasBadge) {
    const badges = document.createElement('div');
    badges.className = 'list-badges';
    if (item.dueDate) {
      const overdue = !item.done && item.dueDate < today;
      const badge = document.createElement('span');
      badge.className = 'list-badge list-badge-due' + (overdue ? ' overdue' : '');
      const d = new Date(item.dueDate + 'T12:00:00');
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      badge.textContent = overdue ? '⚠️ Overdue · ' + dateStr : '📅 ' + dateStr;
      badges.appendChild(badge);
    }
    if (item.assignedTo) {
      const badge = document.createElement('span');
      badge.className = 'list-badge list-badge-assign';
      badge.textContent = '👤 ' + item.assignedTo;
      badges.appendChild(badge);
    }
    if (item.by) {
      const meta = document.createElement('span');
      meta.className = 'list-meta';
      meta.textContent = 'by ' + item.by;
      badges.appendChild(meta);
    }
    wrap.appendChild(badges);
  } else if (item.by) {
    const meta = document.createElement('span');
    meta.className = 'list-meta';
    meta.textContent = item.by;
    wrap.appendChild(meta);
  }

  const del = document.createElement('button');
  del.className = 'list-delete';
  del.textContent = '✕';
  del.onclick = onDelete;

  li.appendChild(check);
  li.appendChild(wrap);
  li.appendChild(del);
  return li;
}

// ── Family Members ─────────────────────────────────────────────

// Post-fetch pass: override ev.color for events whose title contains a member name.
// Longer names matched first to avoid "Jack" stealing "Jackson's" events.
function applyMemberColors() {
  const colored = familyMembers.filter(m => m.color).sort((a, b) => b.name.length - a.name.length);
  if (!colored.length) return;
  Object.values(calEventCache).forEach(byDate => {
    Object.values(byDate).forEach(evts => {
      evts.forEach(ev => {
        if (ev.holiday) return;
        const title = (ev.summary || '').toLowerCase();
        const match = colored.find(m => title.includes(m.name.toLowerCase()));
        if (match) ev.color = match.color;
      });
    });
  });
}

async function setFamilyMemberColor(idOrIndex, color) {
  const m = typeof idOrIndex === 'string'
    ? familyMembers.find(m => m.id === idOrIndex)
    : familyMembers[idOrIndex];
  if (!m) return;
  m.color = color || null;
  if (db) {
    await db.collection('familyMembers').doc(m.id).update({ color: color || null });
  } else {
    localStorage.setItem('fh_familyMembers', JSON.stringify(familyMembers));
  }
  if (googleToken) loadAllCalendars();
}

function renderFamilyMemberList() {
  const el = document.getElementById('familyMemberList');
  if (!el) return;
  el.innerHTML = '';
  if (!familyMembers.length) {
    el.innerHTML = '<div style="font-size:.82rem;color:var(--muted);padding:4px 0">No members yet.</div>';
  } else {
    const last = familyMembers.length - 1;
    familyMembers.forEach((m, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--surface2);border-radius:8px;padding:6px 10px;font-size:.84rem;margin-bottom:6px';
      const removeArg = db ? `'${m.id}'` : i;
      const genderArg = db ? `'${m.id}'` : i;
      const colorArg  = db ? `'${m.id}'` : i;
      const btnStyle = 'background:none;border:none;color:var(--muted);cursor:pointer;font-size:.85rem;line-height:1;padding:0 3px';
      row.innerHTML = `
        <span style="flex:1">👤 ${esc(m.name)}</span>
        <input type="color" value="${m.color || '#6c8ef5'}"
               title="Calendar event color for ${esc(m.name)}"
               class="lc-color"
               onchange="setFamilyMemberColor(${colorArg},this.value)"
               style="width:24px;height:24px;border:none;border-radius:4px;cursor:pointer;padding:0;background:none;flex-shrink:0;opacity:${m.color ? '1' : '0.4'}"
               oninput="this.style.opacity='1'">
        <select onchange="setFamilyMemberGender(${genderArg},this.value)"
                style="font-size:.75rem;padding:2px 4px;border-radius:5px;background:var(--surface);border:1px solid rgba(255,255,255,.15);color:var(--text);cursor:pointer"
                title="Pronouns used by the assistant">
          <option value="neutral" ${(m.gender||'neutral')==='neutral'?'selected':''}>they/them</option>
          <option value="male"    ${m.gender==='male'   ?'selected':''}>he/him</option>
          <option value="female"  ${m.gender==='female' ?'selected':''}>she/her</option>
        </select>
        <button onclick="moveFamilyMember(${i},-1)" ${i === 0 ? 'disabled' : ''} style="${btnStyle};opacity:${i === 0 ? '.25' : '1'}" title="Move up">▲</button>
        <button onclick="moveFamilyMember(${i}, 1)" ${i === last ? 'disabled' : ''} style="${btnStyle};opacity:${i === last ? '.25' : '1'}" title="Move down">▼</button>
        <button onclick="removeFamilyMember(${removeArg})" style="${btnStyle};font-size:1rem" title="Remove">✕</button>`;
      el.appendChild(row);
    });
  }
  populateTodoAssigneeDropdown();
}

async function setFamilyMemberGender(idOrIndex, gender) {
  const m = typeof idOrIndex === 'string'
    ? familyMembers.find(m => m.id === idOrIndex)
    : familyMembers[idOrIndex];
  if (!m) return;
  m.gender = gender;
  if (db) {
    await db.collection('familyMembers').doc(m.id).update({ gender });
    // onSnapshot will re-render
  } else {
    localStorage.setItem('fh_familyMembers', JSON.stringify(familyMembers));
    renderFamilyMemberList();
  }
}

async function addFamilyMember() {
  const input = document.getElementById('newFamilyMemberInput');
  const name  = input.value.trim();
  if (!name) return;
  input.value = '';
  if (db) {
    await db.collection('familyMembers').add({ name, order: familyMembers.length, gender: 'neutral', color: null });
    // onSnapshot updates familyMembers + renderFamilyMemberList
    return;
  }
  familyMembers.push({ name });
  localStorage.setItem('fh_familyMembers', JSON.stringify(familyMembers));
  renderFamilyMemberList();
}

async function removeFamilyMember(idOrIndex) {
  if (db) {
    await db.collection('familyMembers').doc(idOrIndex).delete();
    // onSnapshot updates familyMembers + renderFamilyMemberList
    return;
  }
  familyMembers.splice(idOrIndex, 1);
  localStorage.setItem('fh_familyMembers', JSON.stringify(familyMembers));
  renderFamilyMemberList();
}

async function moveFamilyMember(index, direction) {
  const swap = index + direction;
  if (swap < 0 || swap >= familyMembers.length) return;
  [familyMembers[index], familyMembers[swap]] = [familyMembers[swap], familyMembers[index]];
  if (db) {
    const batch = db.batch();
    familyMembers.forEach((m, i) => {
      batch.update(db.collection('familyMembers').doc(m.id), { order: i });
    });
    await batch.commit();
    // onSnapshot will re-render
  } else {
    localStorage.setItem('fh_familyMembers', JSON.stringify(familyMembers));
    renderFamilyMemberList();
  }
}

function populateTodoAssigneeDropdown() {
  const sel = document.getElementById('todoAssignee');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— anyone —</option>';
  familyMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  sel.value = current;
}

// ── Add/clear helpers ──────────────────────────────────────────
function toggleTodoExtra() {
  document.getElementById('todoExtra').classList.toggle('open');
}

function addTodo() {
  const input      = document.getElementById('todoInput');
  const text       = input.value.trim();
  if (!text) return;
  const dueDate    = document.getElementById('todoDueDate').value   || null;
  const assignedTo = document.getElementById('todoAssignee').value  || null;
  input.value      = '';
  document.getElementById('todoDueDate').value   = '';
  document.getElementById('todoAssignee').value  = '';
  document.getElementById('todoExtra').classList.remove('open');

  const extra = {};
  if (dueDate)    extra.dueDate    = dueDate;
  if (assignedTo) extra.assignedTo = assignedTo;

  if (db) {
    addToFs('todo', text, extra);
  } else {
    const item = { id: String(Date.now()), text, done: false, by: userName, ...extra };
    todoItems.push(item);
    saveLocalList('todo', todoItems);
    renderTodoList();
    renderCurrentView();
  }
}

function renderShopGrouped(entries) {
  const ul    = document.getElementById('shopList');
  const empty = document.getElementById('shopEmpty');
  if (!ul) return;
  ul.innerHTML = '';
  shopItemsCache = entries.map(({ text, done, by, category }) => ({ text, done, by, category }));
  const hasDone = entries.some(i => i.done);
  const hasAny  = entries.length > 0;
  const doneBtn = document.getElementById('shopClearDoneBtn');
  const allBtn  = document.getElementById('shopClearAllBtn');
  if (doneBtn) doneBtn.style.display = hasDone ? '' : 'none';
  if (allBtn)  allBtn.style.display  = hasAny  ? '' : 'none';
  if (!entries.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  // Ordered: known categories first, then any custom ones found in items
  const usedCats = [...new Set(entries.map(e => e.category || 'Other'))];
  const orderedCats = [
    ...shopCategories.filter(c => usedCats.includes(c)),
    ...usedCats.filter(c => !shopCategories.includes(c))
  ];

  orderedCats.forEach(cat => {
    const items = entries.filter(e => (e.category || 'Other') === cat);
    if (!items.length) return;
    const icon        = SHOP_CATEGORY_ICONS[cat] || '📦';
    const isCollapsed = !!shopCollapsed[cat];
    const undone      = items.filter(i => !i.done).length;

    const groupLi = document.createElement('li');
    groupLi.className = 'shop-cat-group';

    const header = document.createElement('div');
    header.className = 'shop-cat-header' + (isCollapsed ? ' collapsed' : '');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'shop-cat-name';
    nameSpan.textContent = `${icon} ${cat}`;
    const countSpan = document.createElement('span');
    countSpan.className = 'shop-cat-count';
    countSpan.textContent = undone;
    const toggleSpan = document.createElement('span');
    toggleSpan.className = 'shop-cat-toggle';
    toggleSpan.textContent = '▾';
    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    header.appendChild(toggleSpan);

    const itemsUl = document.createElement('ul');
    itemsUl.className = 'shop-cat-items' + (isCollapsed ? ' hidden' : '');
    items.forEach(item => itemsUl.appendChild(makeListItem(item.text, item.done, item.by, item.onToggle, item.onDelete)));

    header.onclick = () => {
      shopCollapsed[cat] = !shopCollapsed[cat];
      header.classList.toggle('collapsed');
      itemsUl.classList.toggle('hidden');
    };

    groupLi.appendChild(header);
    groupLi.appendChild(itemsUl);
    ul.appendChild(groupLi);
  });
}

function populateShopCategorySelect() {
  const sel = document.getElementById('shopCategorySelect');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = shopCategories.map(c =>
    `<option value="${c}">${SHOP_CATEGORY_ICONS[c] || '📦'} ${c}</option>`
  ).join('');
  if (prev && shopCategories.includes(prev)) sel.value = prev;
}

function renderShopCategorySettings() {
  const list = document.getElementById('shopCategoryList');
  if (!list) return;
  list.innerHTML = '';
  shopCategories.forEach((cat, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;font-size:var(--text-sm)';
    const icon = SHOP_CATEGORY_ICONS[cat] || '📦';
    const nameSpan = document.createElement('span');
    nameSpan.style.flex = '1';
    nameSpan.textContent = `${icon} ${cat}`;
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm';
    delBtn.style.cssText = 'padding:1px 7px;background:var(--surface2);color:var(--red)';
    delBtn.textContent = '✕';
    delBtn.onclick = () => removeShopCategory(i);
    row.appendChild(nameSpan);
    row.appendChild(delBtn);
    list.appendChild(row);
  });
}

function addShopCategory() {
  const input = document.getElementById('newShopCategoryInput');
  const name  = input.value.trim();
  if (!name || shopCategories.includes(name)) return;
  input.value = '';
  shopCategories.push(name);
  localStorage.setItem('fh_shopCategories', JSON.stringify(shopCategories));
  populateShopCategorySelect();
  renderShopCategorySettings();
  renderLocalList('shopping');
}

function removeShopCategory(idx) {
  const removed = shopCategories[idx];
  delete shopCollapsed[removed];
  shopCategories.splice(idx, 1);
  localStorage.setItem('fh_shopCategories', JSON.stringify(shopCategories));
  populateShopCategorySelect();
  renderShopCategorySettings();
}

function addShop() {
  const input = document.getElementById('shopInput');
  const text  = input.value.trim();
  if (!text) return;
  const category = document.getElementById('shopCategorySelect')?.value || 'Other';
  input.value = '';
  if (db) { addToFs('shopping', text, { category }); }
  else {
    const items = getLocalList('shopping');
    items.push({ text, done: false, by: userName, category });
    saveLocalList('shopping', items);
    renderLocalList('shopping');
  }
}

function clearDoneTodo()     { db ? clearDoneFs('todo')     : clearDoneLocal('todo'); }
function clearDoneShopping() { db ? clearDoneFs('shopping') : clearDoneLocal('shopping'); }

async function clearAllFs(col) {
  const snap = await db.collection(col).get();
  snap.forEach(doc => doc.ref.delete());
}
function clearAllLocal(col) {
  if (col === 'todo') {
    todoItems = [];
    saveLocalList('todo', todoItems);
    renderTodoList();
    renderCurrentView();
  } else {
    saveLocalList(col, []);
    renderLocalList(col);
  }
}
function clearAllTodo() {
  if (!confirm('Clear all to-do items?')) return;
  db ? clearAllFs('todo') : clearAllLocal('todo');
}
function clearAllShopping() {
  if (!confirm('Clear all shopping items?')) return;
  db ? clearAllFs('shopping') : clearAllLocal('shopping');
}

function clearDoneLocal(col) {
  if (col === 'todo') {
    todoItems = todoItems.filter(i => !i.done);
    saveLocalList('todo', todoItems);
    renderTodoList();
    renderCurrentView();
  } else {
    const items = getLocalList(col).filter(i => !i.done);
    saveLocalList(col, items);
    renderLocalList(col);
  }
}

// ── Meal Planning ──────────────────────────────────────────────
function openMealModal(dateKey, mealType) {
  _mealDate = dateKey;
  _mealType = mealType;
  _mealSuggestions = [];

  const dt        = new Date(dateKey + 'T12:00:00');
  const dateLabel = dt.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const typeLabel = mealType === 'all' ? 'All Meals'
                  : mealType.charAt(0).toUpperCase() + mealType.slice(1);

  const STYLE_PLACEHOLDERS = {
    breakfast: 'e.g. egg-based, smoothie bowl, savory, high-protein, quick grab-and-go…',
    lunch:     'e.g. light salad, warm soup, sandwich, grain bowl, low-carb…',
    dinner:    'e.g. Italian, quick Asian, comfort food, Mediterranean, grilled…',
    all:       'e.g. Italian, quick Asian, comfort food, Mediterranean, 30-min…',
  };
  const PANTRY_PLACEHOLDERS = {
    breakfast: 'e.g. eggs, oats, Greek yogurt, berries, bananas, almond milk…',
    lunch:     'e.g. deli turkey, canned tuna, lettuce, avocado, whole-grain bread…',
    dinner:    'e.g. chicken breasts, pasta, canned tomatoes, frozen shrimp…',
    all:       'e.g. chicken breasts, pasta, canned tomatoes, frozen shrimp…',
  };

  document.getElementById('mealModalTitle').textContent    = `🍽 ${typeLabel}`;
  document.getElementById('mealModalSubtitle').textContent = dateLabel;
  document.getElementById('mealStyleInput').value          = '';
  document.getElementById('mealStyleInput').placeholder    = STYLE_PLACEHOLDERS[mealType] || STYLE_PLACEHOLDERS.all;
  document.getElementById('mealPantryInput').value         = mealPantryDef;
  document.getElementById('mealPantryInput').placeholder   = PANTRY_PLACEHOLDERS[mealType] || PANTRY_PLACEHOLDERS.all;
  document.getElementById('mealUseCalendar').checked       = true;
  document.getElementById('mealSuggestionsWrap').innerHTML = '';
  document.getElementById('mealGenerateBtn').disabled      = false;
  document.getElementById('mealModal').style.display       = 'flex';
  trapFocus(document.querySelector('#mealModal .modal'), null, closeMealModal);
}

function closeMealModal() {
  document.getElementById('mealModal').style.display = 'none';
  releaseFocusTrap();
}

// ── Provider selector ─────────────────────────────────────────
function setMealProvider(provider, save = true) {
  mealAiProvider = 'gemini'; // always gemini
  if (save) localStorage.setItem('fh_mealAiProvider', 'gemini');
}

// Call the selected AI provider
async function callMealAI(prompt) {
  const key = mealAiKey;

  if (mealAiProvider === 'gemini') {
    // ── Google Gemini ──────────────────────────────────────────
    const resp = await geminiFetch({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 8192 },
    });
    if (!resp.ok) {
      const err    = await resp.json().catch(() => ({}));
      const status = err.error?.status  || '';
      const msg    = err.error?.message || `Gemini HTTP ${resp.status}`;
      if (resp.status === 429 || status === 'RESOURCE_EXHAUSTED') {
        showAIQuotaError('gemini', msg); return null;
      }
      if (resp.status === 403 || status === 'PERMISSION_DENIED') {
        showAIPermissionError('gemini', msg); return null;
      }
      throw new Error(`[${resp.status} ${status}] ${msg}`);
    }
    const data = await resp.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    // Strip optional markdown fences the model may add
    return raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'').trim();

  } else { // openai
    const resp = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful family meal planning assistant. Always respond with valid JSON only.' },
          { role: 'user',   content: prompt }
        ],
        temperature: 0.85,
        max_tokens: 2400
      })
    });
    if (!resp.ok) {
      const err  = await resp.json().catch(() => ({}));
      const code = err.error?.code || '';
      const msg  = err.error?.message || `OpenAI error ${resp.status}`;
      if (resp.status === 429 || code === 'insufficient_quota' || code === 'rate_limit_exceeded') {
        showAIQuotaError('openai', msg);
        return null;
      }
      throw new Error(msg);
    }
    const data = await resp.json();
    return data.choices[0].message.content.trim()
               .replace(/^```json\s*/,'').replace(/\s*```$/,'');
  }
}

function showAIQuotaError(provider, rawMsg = '') {
  const isGemini = provider === 'gemini';
  document.getElementById('mealSuggestionsWrap').innerHTML = `
    <div style="background:var(--surface2);border-radius:10px;padding:16px;font-size:.85rem;border:1px solid var(--accent2)">
      <strong style="color:var(--accent2)">⚠️ ${isGemini ? 'Gemini' : 'OpenAI'} — rate limited</strong><br><br>
      ${isGemini ? `
        ${rawMsg.includes('limit: 0') ? `
        <strong>Your project's free tier is set to 0.</strong><br><br>
        This happens when Google Cloud <strong>billing is enabled</strong> on the project that owns your key —
        billing disables the free tier without granting paid access automatically.<br><br>
        <strong>Fix — create a fresh key in a billing-free project:</strong>
        <ol style="margin:8px 0 10px 18px;line-height:2">
          <li>Go to <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent)">aistudio.google.com/apikey ↗</a></li>
          <li>Click <strong>Create API key</strong></li>
          <li>In the project dropdown choose <strong>Create a new project</strong> (don't reuse an existing billing-enabled project)</li>
          <li>Copy the new key and paste it in <strong>Settings → 🍽 Meals</strong></li>
        </ol>` : `
        Possible causes:<br>
        <ul style="margin:6px 0 10px 18px;line-height:1.9">
          <li>Free-tier daily limit reached (resets midnight PT)</li>
          <li>The <strong>Generative Language API</strong> isn't enabled —
              <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com"
                 target="_blank" style="color:var(--accent)">enable it ↗</a></li>
          <li>Try a <a href="https://aistudio.google.com/apikey" target="_blank"
              style="color:var(--accent)">fresh key in a new project ↗</a></li>
        </ul>`}` : `
        Your OpenAI account is out of credits. Add billing at
        <a href="https://platform.openai.com/settings/organization/billing"
           target="_blank" style="color:var(--accent)">platform.openai.com/billing ↗</a>,
        or switch to free <strong>Google Gemini</strong> in Settings → 🍽 Meals.<br><br>`
      }
      ${rawMsg ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:var(--muted);font-size:.75rem">Raw API error</summary>
        <code style="font-size:.72rem;color:var(--muted);word-break:break-all">${esc(rawMsg)}</code></details>` : ''}
    </div>`;
  document.getElementById('mealGenerateBtn').disabled = false;
}

// ── News Feed ────────────────────────────────────────────────────────────────

const CORS_PROXY_NEWS = 'https://corsproxy.io/?';
const NEWS_CACHE_TTL  = 30 * 60 * 1000; // 30 min

let newsFeeds        = lsGet('fh_newsFeeds', [
  { id: 'nf_bbc',  label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'nf_ap',   label: 'AP News',  url: 'https://feeds.apnews.com/rss/apf-topnews' },
]);
let newsHeadlineCount = lsGet('fh_newsHeadlineCount', 5);

function saveNewsFeeds() {
  localStorage.setItem('fh_newsFeeds',         JSON.stringify(newsFeeds));
  localStorage.setItem('fh_newsHeadlineCount', JSON.stringify(newsHeadlineCount));
}

async function fetchFeed(url) {
  // Try direct first, fall back to CORS proxy
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return await r.text();
  } catch {}
  const r = await fetch(CORS_PROXY_NEWS + encodeURIComponent(url), { cache: 'no-store' });
  return r.ok ? r.text() : '';
}

function parseRssItems(xmlText, label, count) {
  try {
    const doc   = new DOMParser().parseFromString(xmlText, 'application/xml');
    const items = [...doc.querySelectorAll('item, entry')].slice(0, count);
    return items.map(item => ({
      title: item.querySelector('title')?.textContent?.trim() || '',
      link:  item.querySelector('link')?.textContent?.trim() ||
             item.querySelector('link')?.getAttribute('href') || '#',
      pub:   item.querySelector('pubDate, published, updated')?.textContent?.trim() || '',
      source: label,
    }));
  } catch { return []; }
}

async function loadNewsFeeds(force = false) {
  const el = document.getElementById('newsBody');
  if (!el) return;
  if (!newsFeeds.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">No feeds configured. Add some in ⚙️ Settings → 📊 Feeds.</div>';
    return;
  }

  const cacheKey  = 'fh_newsCache';
  const cacheTime = 'fh_newsCacheTime';
  const now       = Date.now();
  const cached    = lsGet(cacheKey, null);
  const cachedAt  = parseInt(localStorage.getItem(cacheTime) || '0');

  if (!force && cached && (now - cachedAt) < NEWS_CACHE_TTL) {
    renderNewsCard(cached);
    return;
  }

  el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">Loading…</div>';

  try {
    const results = await Promise.all(
      newsFeeds.map(async f => {
        try {
          const xml = await fetchFeed(f.url);
          return parseRssItems(xml, f.label, newsHeadlineCount);
        } catch { return []; }
      })
    );
    // Interleave: one headline per feed, round-robin, up to newsHeadlineCount * feeds
    const interleaved = [];
    const maxPerFeed  = newsHeadlineCount;
    for (let i = 0; i < maxPerFeed; i++) {
      results.forEach(feedItems => { if (feedItems[i]) interleaved.push(feedItems[i]); });
    }
    localStorage.setItem(cacheKey,  JSON.stringify(interleaved));
    localStorage.setItem(cacheTime, String(now));
    renderNewsCard(interleaved);
  } catch (e) {
    el.innerHTML = `<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">Could not load feeds.</div>`;
  }
}

function renderNewsCard(items) {
  const el = document.getElementById('newsBody');
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">No headlines found.</div>';
    return;
  }
  el.innerHTML = items.map(item => `
    <div class="news-item">
      <span class="news-source">${esc(item.source)}</span>
      <a class="news-headline" href="${safeUrl(item.link)}" target="_blank" rel="noopener">${esc(item.title)}</a>
    </div>`).join('');
}

function renderNewsFeedList() {
  const el = document.getElementById('newsFeedList');
  if (!el) return;
  el.innerHTML = '';
  if (!newsFeeds.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:4px 0">No feeds yet.</div>';
    return;
  }
  newsFeeds.forEach((f, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.1)';
    row.innerHTML = `
      <span style="flex:0 0 70px;font-size:.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.url)}">${esc(f.label)}</span>
      <span style="flex:1;font-size:.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.url)}</span>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.85rem" onclick="removeNewsFeed(${i})">✕</button>`;
    el.appendChild(row);
  });
}

function addNewsFeed() {
  const label = document.getElementById('newsFeedLabel').value.trim();
  const url   = document.getElementById('newsFeedUrl').value.trim();
  if (!label || !url) return;
  newsFeeds.push({ id: 'nf_' + Date.now(), label, url });
  saveNewsFeeds();
  document.getElementById('newsFeedLabel').value = '';
  document.getElementById('newsFeedUrl').value   = '';
  renderNewsFeedList();
  loadNewsFeeds(true);
}

function removeNewsFeed(i) {
  newsFeeds.splice(i, 1);
  saveNewsFeeds();
  renderNewsFeedList();
  loadNewsFeeds(true);
}

// ── Stock Ticker ──────────────────────────────────────────────────────────────

const STOCK_CACHE_TTL  = 5 * 60 * 1000; // 5 min
const YAHOO_QUOTE_URL  = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';

let stockTickers = lsGet('fh_stockTickers', []);

function saveStockTickers() {
  localStorage.setItem('fh_stockTickers', JSON.stringify(stockTickers));
}

async function loadStockQuotes(force = false) {
  const el = document.getElementById('stockBody');
  if (!el) return;
  if (!stockTickers.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">Add tickers in ⚙️ Settings → 📊 Feeds.</div>';
    return;
  }

  const cacheKey  = 'fh_stockCache';
  const cacheTime = 'fh_stockCacheTime';
  const now       = Date.now();
  const cached    = lsGet(cacheKey, null);
  const cachedAt  = parseInt(localStorage.getItem(cacheTime) || '0');

  if (!force && cached && (now - cachedAt) < STOCK_CACHE_TTL) {
    renderStockCard(cached);
    return;
  }

  el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">Loading…</div>';

  const symbols = stockTickers.join(',');
  try {
    let data = null;
    // Try direct (Yahoo sometimes allows CORS), fall back to proxy
    try {
      const r = await fetch(YAHOO_QUOTE_URL + encodeURIComponent(symbols));
      if (r.ok) data = await r.json();
    } catch {}
    if (!data) {
      const r = await fetch(CORS_PROXY_NEWS + encodeURIComponent(YAHOO_QUOTE_URL + symbols));
      if (r.ok) data = await r.json();
    }
    const quotes = data?.quoteResponse?.result || [];
    localStorage.setItem(cacheKey,  JSON.stringify(quotes));
    localStorage.setItem(cacheTime, String(now));
    renderStockCard(quotes);
  } catch {
    el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">Could not load quotes.</div>';
  }
}

function renderStockCard(quotes) {
  const el = document.getElementById('stockBody');
  if (!el) return;
  if (!quotes?.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0">No data.</div>';
    return;
  }
  el.innerHTML = quotes.map(q => {
    const price  = q.regularMarketPrice?.toFixed(2) ?? '—';
    const change = q.regularMarketChangePercent;
    const chgStr = change != null ? (change >= 0 ? '+' : '') + change.toFixed(2) + '%' : '';
    const color  = change == null ? 'var(--muted)' : change >= 0 ? 'var(--green, #4caf82)' : 'var(--red, #e06c75)';
    return `<div class="stock-row">
      <span class="stock-symbol">${esc(q.symbol)}</span>
      <span class="stock-name">${esc(q.shortName || q.longName || '')}</span>
      <span class="stock-price">$${esc(price)}</span>
      <span class="stock-change" style="color:${color}">${esc(chgStr)}</span>
    </div>`;
  }).join('');
}

function renderStockTickerList() {
  const el = document.getElementById('stockTickerList');
  if (!el) return;
  el.innerHTML = '';
  if (!stockTickers.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:4px 0">No tickers yet.</div>';
    return;
  }
  stockTickers.forEach((sym, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.1)';
    row.innerHTML = `
      <span style="flex:1;font-size:.85rem;font-weight:600">${esc(sym)}</span>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.85rem" onclick="removeStockTicker(${i})">✕</button>`;
    el.appendChild(row);
  });
}

function addStockTicker() {
  const inp = document.getElementById('stockTickerInput');
  const sym = inp.value.trim().toUpperCase();
  if (!sym || stockTickers.includes(sym)) { inp.value = ''; return; }
  stockTickers.push(sym);
  saveStockTickers();
  inp.value = '';
  renderStockTickerList();
  loadStockQuotes(true);
}

function removeStockTicker(i) {
  stockTickers.splice(i, 1);
  saveStockTickers();
  renderStockTickerList();
  loadStockQuotes(true);
}

// ── Word of the Day ──────────────────────────────────────────────────────────

// Curated seed list — one word picked per calendar day, definition fetched from free API
const WOTD_WORDS = [
  'ephemeral','serendipity','sonder','petrichor','hiraeth','mellifluous','ineffable',
  'solipsism','sanguine','loquacious','perspicacious','equanimity','ebullient','sycophant',
  'truculent','garrulous','obsequious','fastidious','recondite','propitious','quotidian',
  'nefarious','perspicuous','laconic','myriad','tangential','vicarious','pernicious',
  'insouciant','pulchritudinous','sempiternal','defenestrate','absquatulate','flibbertigibbet',
  'lollygag','kerfuffle','brouhaha','hullabaloo','cattywampus','bumfuzzle','discombobulate',
  'widdershins','comeuppance','fuddy-duddy','scalawag','shenanigan','whippersnapper',
  'blatherskite','nincompoop','poppycock','codswallop','balderdash','flummox','bamboozle',
  'persnickety','snollygoster','skedaddle','collywobbles','lollygag','higgledy-piggledy',
  'taradiddle','wabbit','sockdolager','hobnob','rambunctious','curmudgeon','rapscallion',
  'spiffy','klutz','dunderhead','wishy-washy','lollipop','flabbergast','gobsmacked'
];

// Built-in fallback definitions (used when dictionary API is unavailable)
const WOTD_FALLBACKS = {
  ephemeral:    { pos: 'adjective', def: 'Lasting for only a short time; transitory.' },
  serendipity:  { pos: 'noun',      def: 'The occurrence of fortunate events by chance.' },
  sonder:       { pos: 'noun',      def: 'The realisation that each passerby has a life as vivid and complex as your own.' },
  petrichor:    { pos: 'noun',      def: 'A pleasant smell that frequently accompanies the first rain after a long dry spell.' },
  hiraeth:      { pos: 'noun',      def: 'A deep longing for home or something no longer present; a Welsh concept of nostalgic grief.' },
  mellifluous:  { pos: 'adjective', def: 'Sweet or musical; pleasant to hear.' },
  ineffable:    { pos: 'adjective', def: 'Too great or extreme to be expressed in words.' },
  equanimity:   { pos: 'noun',      def: 'Mental calmness and composure, especially in difficult situations.' },
  ebullient:    { pos: 'adjective', def: 'Cheerful and full of energy.' },
  sanguine:     { pos: 'adjective', def: 'Optimistic, especially in a difficult situation.' },
  loquacious:   { pos: 'adjective', def: 'Tending to talk a great deal; talkative.' },
  laconic:      { pos: 'adjective', def: 'Using very few words; brief and concise.' },
  perspicacious:{ pos: 'adjective', def: 'Having a ready insight; shrewd and discerning.' },
  kerfuffle:    { pos: 'noun',      def: 'A commotion or fuss, especially one caused by conflicting views.' },
  discombobulate:{ pos: 'verb',     def: 'To disconcert or confuse.' },
  flabbergast:  { pos: 'verb',      def: 'To surprise greatly; to astonish.' },
  bamboozle:    { pos: 'verb',      def: 'To fool or cheat someone; to confuse.' },
  persnickety:  { pos: 'adjective', def: 'Placing too much emphasis on trivial details; fussy.' },
  curmudgeon:   { pos: 'noun',      def: 'A bad-tempered or surly person.' },
  rambunctious: { pos: 'adjective', def: 'Uncontrollably exuberant; boisterous.' },
  gobsmacked:   { pos: 'adjective', def: 'Utterly astonished; astounded.' },
  flummox:      { pos: 'verb',      def: 'To perplex or bewilder someone completely.' },
};

async function loadWotd(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = lsGet('fh_wotd', null);
  if (!force && cached && cached.date === today && cached.definition) {
    renderWotd(cached);
    return;
  }
  // Pick word based on day-of-year for consistency across refreshes
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const word = WOTD_WORDS[dayOfYear % WOTD_WORDS.length];
  renderWotdLoading();
  try {
    const resp = await fetch(`${DICT_API_BASE}/${encodeURIComponent(word)}`);
    if (!resp.ok) throw new Error('lookup failed');
    const data = await resp.json();
    const entry   = data[0];
    const meaning = entry.meanings?.[0];
    const wotd = {
      date: today,
      word: entry.word,
      phonetic: entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '',
      partOfSpeech: meaning?.partOfSpeech || '',
      definition: meaning?.definitions?.[0]?.definition || '',
      example: meaning?.definitions?.[0]?.example || ''
    };
    localStorage.setItem('fh_wotd', JSON.stringify(wotd));
    renderWotd(wotd);
  } catch(e) {
    // Fall back to built-in definition if available
    const fb = WOTD_FALLBACKS[word];
    if (fb) {
      const wotd = { date: today, word, phonetic: '', partOfSpeech: fb.pos, definition: fb.def, example: '' };
      localStorage.setItem('fh_wotd', JSON.stringify(wotd));
      renderWotd(wotd);
    } else {
      document.getElementById('wotdBody').innerHTML =
        `<div style="font-size:.85rem;color:var(--muted)">Couldn't load today's word. <button onclick="loadWotd(true)" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:.85rem">Try again</button></div>`;
    }
  }
}

function renderWotdLoading() {
  document.getElementById('wotdBody').innerHTML =
    '<div style="text-align:center;color:var(--muted);font-size:.85rem"><span class="spinner"></span> Loading…</div>';
}

function renderWotd(w) {
  document.getElementById('wotdBody').innerHTML = `
    <div style="margin-bottom:4px">
      <span style="font-size:1.3rem;font-weight:700;color:var(--text)">${esc(w.word)}</span>
      ${w.phonetic ? `<span style="font-size:.8rem;color:var(--muted);margin-left:8px">${esc(w.phonetic)}</span>` : ''}
    </div>
    ${w.partOfSpeech ? `<div style="font-size:.72rem;font-style:italic;color:var(--accent);margin-bottom:6px">${esc(w.partOfSpeech)}</div>` : ''}
    <div style="font-size:.85rem;color:var(--text);line-height:1.5">${esc(w.definition)}</div>
    ${w.example ? `<div style="font-size:.78rem;color:var(--muted);margin-top:6px;font-style:italic">"${esc(w.example)}"</div>` : ''}
  `;
}

function refreshWotd() {
  loadWotd(true);
}

// ── Dad Joke of the Day ───────────────────────────────────────────────────────

async function loadDadJoke(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = lsGet('fh_dadjoke', null);
  if (!force && cached && cached.date === today) {
    renderDadJoke(cached.joke);
    return;
  }
  renderDadJokeLoading();
  try {
    const resp = await fetch(DADJOKE_API_BASE + '/', {
      headers: { Accept: 'application/json' }
    });
    if (!resp.ok) throw new Error('fetch failed');
    const data = await resp.json();
    localStorage.setItem('fh_dadjoke', JSON.stringify({ date: today, joke: data.joke }));
    renderDadJoke(data.joke);
  } catch(e) {
    document.getElementById('dadjokeBody').innerHTML =
      `<div style="font-size:.85rem;color:var(--muted)">Couldn't load a joke. <button onclick="loadDadJoke(true)" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:.85rem">Try again</button></div>`;
  }
}

function renderDadJokeLoading() {
  document.getElementById('dadjokeBody').innerHTML =
    '<div style="text-align:center;color:var(--muted);font-size:.85rem"><span class="spinner"></span> Loading…</div>';
}

function renderDadJoke(joke) {
  document.getElementById('dadjokeBody').innerHTML =
    `<div style="font-size:.88rem;line-height:1.6;color:var(--text)">${esc(joke)}</div>`;
}

function refreshDadJoke() {
  loadDadJoke(true);
}

// ── Inspirational Quote ───────────────────────────────────────────────────────
// Curated list — one quote per day picked by day-of-year (no network request needed)

const QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Spread love everywhere you go. Let no one ever come to you without leaving happier.", author: "Mother Teresa" },
  { text: "When you reach the end of your rope, tie a knot in it and hang on.", author: "Franklin D. Roosevelt" },
  { text: "Always remember that you are absolutely unique. Just like everyone else.", author: "Margaret Mead" },
  { text: "Don't judge each day by the harvest you reap but by the seeds that you plant.", author: "Robert Louis Stevenson" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "An unexamined life is not worth living.", author: "Socrates" },
  { text: "Spread love everywhere you go.", author: "Mother Teresa" },
  { text: "When you change the way you look at things, the things you look at change.", author: "Wayne Dyer" },
  { text: "It is never too late to be what you might have been.", author: "George Eliot" },
  { text: "You must be the change you wish to see in the world.", author: "Mahatma Gandhi" },
  { text: "In three words I can sum up everything I've learned about life: it goes on.", author: "Robert Frost" },
  { text: "If you look at what you have in life, you'll always have more.", author: "Oprah Winfrey" },
  { text: "If you want to lift yourself up, lift up someone else.", author: "Booker T. Washington" },
  { text: "I have been impressed with the urgency of doing. Knowing is not enough; we must apply.", author: "Leonardo da Vinci" },
  { text: "We must accept finite disappointment, but never lose infinite hope.", author: "Martin Luther King Jr." },
  { text: "Life is not measured by the number of breaths we take, but by the moments that take our breath away.", author: "Maya Angelou" },
  { text: "Happiness is not something ready made. It comes from your own actions.", author: "Dalai Lama" },
  { text: "If you're offered a seat on a rocket ship, don't ask what seat! Just get on.", author: "Sheryl Sandberg" },
  { text: "First, have a definite, clear practical ideal; a goal, an objective.", author: "Aristotle" },
  { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { text: "Two roads diverged in a wood, and I took the one less traveled by.", author: "Robert Frost" },
  { text: "I attribute my success to this: I never gave or took any excuse.", author: "Florence Nightingale" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "The most common way people give up their power is by thinking they don't have any.", author: "Alice Walker" },
  { text: "The mind is everything. What you think you become.", author: "Buddha" },
  { text: "The best revenge is massive success.", author: "Frank Sinatra" },
  { text: "People who are crazy enough to think they can change the world are the ones who do.", author: "Rob Siltanen" },
  { text: "Failure will never overtake me if my determination to succeed is strong enough.", author: "Og Mandino" },
  { text: "We may encounter many defeats but we must not be defeated.", author: "Maya Angelou" },
  { text: "Knowing is not enough; we must apply. Wishing is not enough; we must do.", author: "Johann Wolfgang von Goethe" },
  { text: "Imagine your life is perfect in every respect; what would it look like?", author: "Brian Tracy" },
  { text: "We generate fears while we sit. We overcome them by action.", author: "Dr. Henry Link" },
  { text: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { text: "Security is mostly a superstition. Life is either a daring adventure or nothing.", author: "Helen Keller" },
  { text: "The man who has confidence in himself gains the confidence of others.", author: "Hasidic Proverb" },
  { text: "The only way to achieve the impossible is to believe it is possible.", author: "Charles Kingsleigh" },
  { text: "When everything seems to be going against you, remember that the airplane takes off against the wind.", author: "Henry Ford" },
  { text: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
  { text: "If you really look closely, most overnight successes took a long time.", author: "Steve Jobs" },
  { text: "The successful warrior is the average man with laser-like focus.", author: "Bruce Lee" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Magic is believing in yourself. If you can do that, you can make anything happen.", author: "Johann Wolfgang von Goethe" },
  { text: "All our dreams can come true, if we have the courage to pursue them.", author: "Walt Disney" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It's hard to beat a person who never gives up.", author: "Babe Ruth" },
  { text: "I wake up every morning and think to myself: how far can I push this company in the next 24 hours.", author: "Leah Busque" },
  { text: "If you genuinely want something, don't wait for it — teach yourself to be impatient.", author: "Gurbaksh Chahal" },
  { text: "If you don't value your time, neither will others. Stop giving away your time and talents.", author: "Kim Garst" },
  { text: "A successful man is one who can lay a firm foundation with the bricks others have thrown at him.", author: "David Brinkley" },
  { text: "No one can make you feel inferior without your consent.", author: "Eleanor Roosevelt" },
  { text: "Certain things catch your eye, but pursue only those that capture the heart.", author: "Ancient Indian Proverb" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { text: "We can easily forgive a child who is afraid of the dark; the real tragedy is when men are afraid of the light.", author: "Plato" },
  { text: "Teach thy tongue to say 'I do not know,' and thou shalt progress.", author: "Maimonides" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "When I dare to be powerful, to use my strength in the service of my vision, then it becomes less and less important whether I am afraid.", author: "Audre Lorde" },
  { text: "Inclusivity means not 'just we're allowed to be there,' but we are valued.", author: "Claudia Brind-Woody" },
  { text: "The most wasted of all days is one without laughter.", author: "E.E. Cummings" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Too many of us are not living our dreams because we are living our fears.", author: "Les Brown" },
  { text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "That which does not kill us makes us stronger.", author: "Friedrich Nietzsche" },
  { text: "Life is short, and it is here to be lived.", author: "Kate Winslet" },
  { text: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
  { text: "Yesterday is history, tomorrow is a mystery, today is a gift — that's why we call it the present.", author: "Eleanor Roosevelt" },
  { text: "The most difficult thing is the decision to act, the rest is merely tenacity.", author: "Amelia Earhart" },
  { text: "How wonderful it is that nobody need wait a single moment before starting to improve the world.", author: "Anne Frank" },
  { text: "Do one thing every day that scares you.", author: "Eleanor Roosevelt" },
  { text: "What's money? A man is a success if he gets up in the morning and goes to bed at night and in between does what he wants to do.", author: "Bob Dylan" },
  { text: "I have learned over the years that when one's mind is made up, this diminishes fear.", author: "Rosa Parks" },
  { text: "I didn't fail the test. I just found 100 ways to do it wrong.", author: "Benjamin Franklin" },
  { text: "You may not control all the events that happen to you, but you can decide not to be reduced by them.", author: "Maya Angelou" },
  { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
  { text: "It is not the mountain we conquer, but ourselves.", author: "Edmund Hillary" },
  { text: "Impossible is just an opinion.", author: "Paulo Coelho" },
  { text: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson" },
  { text: "You become what you believe.", author: "Oprah Winfrey" },
  { text: "Small steps in the right direction can turn out to be the biggest step of your life.", author: "Unknown" },
  { text: "Kind words can be short and easy to speak, but their echoes are truly endless.", author: "Mother Teresa" },
  { text: "We know what we are, but know not what we may be.", author: "William Shakespeare" },
  { text: "Nothing is impossible, the word itself says 'I'm possible'!", author: "Audrey Hepburn" },
  { text: "Keep your face always toward the sunshine — and shadows will fall behind you.", author: "Walt Whitman" },
  { text: "Once you choose hope, anything is possible.", author: "Christopher Reeve" },
  { text: "Try to be a rainbow in someone's cloud.", author: "Maya Angelou" },
  { text: "We know what we are, but know not what we may be.", author: "William Shakespeare" },
  { text: "Today is your opportunity to build the tomorrow you want.", author: "Ken Poirot" },
  { text: "Do not wait to strike till the iron is hot; but make it hot by striking.", author: "William Butler Yeats" },
  { text: "Great minds discuss ideas; average minds discuss events; small minds discuss people.", author: "Eleanor Roosevelt" },
  { text: "If you want to fly, give up everything that weighs you down.", author: "Toni Morrison" },
  { text: "Perfection is not attainable, but if we chase perfection we can catch excellence.", author: "Vince Lombardi" },
  { text: "Life isn't about finding yourself. Life is about creating yourself.", author: "George Bernard Shaw" },
];

function loadQuote(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  if (!force) {
    const cached = lsGet('fh_quote', null);
    if (cached && cached.date === today) { renderQuote(cached); return; }
  }
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  // On force/refresh, pick a random quote different from today's default
  const idx = force
    ? (dayOfYear + Math.floor(Math.random() * (QUOTES.length - 1)) + 1) % QUOTES.length
    : dayOfYear % QUOTES.length;
  const q = { date: today, ...QUOTES[idx] };
  localStorage.setItem('fh_quote', JSON.stringify(q));
  renderQuote(q);
}

function renderQuote(q) {
  document.getElementById('quoteBody').innerHTML = `
    <div class="quote-text">${esc(q.text)}</div>
    <div class="quote-author">— ${esc(q.author)}</div>
  `;
}

function refreshQuote() {
  loadQuote(true);
}

// ─────────────────────────────────────────────────────────────────────────────

function renderLoadingMsgList() {
  const list = document.getElementById('loadingMsgList');
  if (!list) return;
  list.innerHTML = '';
  mealLoadingMsgs.forEach((msg, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:8px;padding:6px 10px;font-size:.84rem';
    row.innerHTML = `
      <span style="flex:1;color:var(--text)">${msg}</span>
      <button onclick="removeLoadingMsg(${i})" title="Remove"
        style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px">✕</button>`;
    list.appendChild(row);
  });
}

function addLoadingMsg() {
  const input = document.getElementById('newLoadingMsgInput');
  const val = input.value.trim();
  if (!val) return;
  mealLoadingMsgs.push(val);
  input.value = '';
  renderLoadingMsgList();
}

function removeLoadingMsg(i) {
  mealLoadingMsgs.splice(i, 1);
  renderLoadingMsgList();
}

function resetLoadingMsgs() {
  if (!confirm('Reset loading messages to defaults?')) return;
  mealLoadingMsgs = [...DEFAULT_MEAL_LOADING_MSGS];
  renderLoadingMsgList();
}

function showAIPermissionError(provider, rawMsg = '') {
  document.getElementById('mealSuggestionsWrap').innerHTML = `
    <div style="background:var(--surface2);border-radius:10px;padding:16px;font-size:.85rem;border:1px solid var(--accent2)">
      <strong style="color:var(--accent2)">⚠️ Gemini — API not enabled</strong><br><br>
      Your API key is valid, but the <strong>Gemini API</strong> isn't enabled for this Google Cloud project.<br><br>
      <strong>Fix:</strong>
      <ol style="margin:8px 0 10px 18px;line-height:2">
        <li>Go to <a href="https://console.cloud.google.com/apis/library" target="_blank" style="color:var(--accent)">Cloud Console → API Library ↗</a></li>
        <li>Make sure the correct project is selected in the top dropdown</li>
        <li>Search for <strong>Gemini API</strong> and click <strong>Enable</strong></li>
        <li>Wait ~30 seconds, then try again</li>
      </ol>
      <strong>Or get a key that works immediately (no Cloud Console needed):</strong><br>
      <ol style="margin:8px 0 10px 18px;line-height:2">
        <li>Go to <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent)">aistudio.google.com/apikey ↗</a></li>
        <li>Click <strong>Create API key</strong> → choose a project (or create new)</li>
        <li>Paste the new key in <strong>Settings → 🍽 Meals</strong></li>
      </ol>
      ${rawMsg ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:var(--muted);font-size:.75rem">Raw API error</summary>
        <code style="font-size:.72rem;color:var(--muted);word-break:break-all">${esc(rawMsg)}</code></details>` : ''}
    </div>`;
  document.getElementById('mealGenerateBtn').disabled = false;
}

async function generateMealSuggestions() {
  const wrap = document.getElementById('mealSuggestionsWrap');

  if (!mealAiKey) {
    wrap.innerHTML = `
      <div style="background:var(--surface2);border-radius:10px;padding:16px;font-size:.85rem">
        <strong>⚙️ API key required</strong><br><br>
        Add your key in <strong>Settings → 🍽 Meals</strong>.
      </div>`;
    return;
  }

  const style       = document.getElementById('mealStyleInput').value.trim();
  const pantry      = document.getElementById('mealPantryInput').value.trim();
  const useCalendar = document.getElementById('mealUseCalendar').checked;

  let calContext = '';
  if (useCalendar) {
    const evts = Object.entries(calEventCache)
      .filter(([id]) => !disabledCals.has(id))
      .flatMap(([, byDate]) => byDate[_mealDate] || []);
    if (evts.length) calContext = evts.map(e => e.summary).join(', ');
  }

  const existing    = mealPlan[_mealDate] || {};
  const existingStr = Object.entries(existing).map(([t,m]) => `${t}: ${m.name}`).join(', ');
  const dietStr     = mealDietPrefs.length ? mealDietPrefs.join(', ') : 'none specified';

  // Per-meal-type count and variant instructions
  let countStr, variantGuide;
  if (_mealType === 'breakfast') {
    countStr     = '3 breakfast options';
    variantGuide = 'Make 2 solid everyday breakfast options (variant: "Standard") and 1 unique, creative, or unexpected breakfast (variant: "Creative").';
  } else if (_mealType === 'lunch') {
    countStr     = '3 lunch options';
    variantGuide = 'Make 2 practical everyday lunch options (variant: "Standard") and 1 unique, creative, or unexpected lunch (variant: "Creative").';
  } else if (_mealType === 'dinner') {
    countStr     = '3 dinner options';
    variantGuide = 'Make exactly: 1 creative or inventive dinner (variant: "Creative"), 1 quick dinner ready in 30 minutes or less (variant: "Quick"), and 1 simple easy weeknight dinner (variant: "Easy").';
  } else {
    countStr     = '1 breakfast, 1 lunch, and 3 dinner options';
    variantGuide = 'For breakfast and lunch use variant: "Standard". For dinners make: 1 creative (variant: "Creative"), 1 quick under 30 min (variant: "Quick"), 1 easy weeknight (variant: "Easy").';
  }

  const prompt =
`Suggest ${countStr} for a family meal plan.
${style       ? `Cuisine/style preference: ${style}` : ''}
${pantry      ? `On-hand ingredients to incorporate: ${pantry}` : ''}
${calContext  ? `Calendar events today (gauge busyness/time): ${calContext}` : ''}
${existingStr ? `Already planned today: ${existingStr}` : ''}
Dietary preferences: ${dietStr}
${variantGuide}
Prioritise healthy, nutritious, well-balanced options.
Choose the best matching recipe site from: allrecipes, seriouseats, nytcooking, epicurious, simplyrecipes, bonappetit.

Return ONLY a valid JSON array — no markdown, no explanation. Each element:
{
  "mealType": "${_mealType === 'all' ? 'breakfast|lunch|dinner' : _mealType}",
  "variant": "Standard|Creative|Quick|Easy",
  "name": "Meal Name",
  "description": "1–2 sentence description",
  "cuisine": "cuisine type",
  "prepTime": 30,
  "healthyNotes": "brief health benefit",
  "recipeSite": "allrecipes|seriouseats|nytcooking|epicurious|simplyrecipes|bonappetit",
  "recipeSearchQuery": "exact recipe name to search",
  "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3", "ingredient 4", "ingredient 5"]
}`;

  let _loadingIdx = Math.floor(Math.random() * mealLoadingMsgs.length);
  const _showLoadingMsg = () => {
    const msg = mealLoadingMsgs[_loadingIdx % mealLoadingMsgs.length];
    wrap.innerHTML = `<div id="mealLoadingDiv" style="text-align:center;padding:24px;color:var(--muted);transition:opacity .3s"><span class="spinner"></span>&nbsp; ${msg}</div>`;
    _loadingIdx++;
  };
  _showLoadingMsg();
  const _loadingTimer = setInterval(_showLoadingMsg, 3000);
  document.getElementById('mealGenerateBtn').disabled = true;

  try {
    const raw = await callMealAI(prompt);
    clearInterval(_loadingTimer);
    if (!raw) return; // quota error already shown
    // Extract JSON array robustly — model may wrap in markdown or add preamble
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in response. Raw: ' + raw.slice(0, 300));
    let jsonStr = jsonMatch[0];
    // Attempt parse; on failure show raw snippet around error position
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch(parseErr) {
      const pos = parseInt((parseErr.message.match(/position (\d+)/) || [])[1]) || 0;
      const snippet = jsonStr.slice(Math.max(0, pos - 60), pos + 60).replace(/</g,'&lt;');
      throw new Error(`JSON parse error: ${parseErr.message}<br><code style="font-size:.75rem">…${snippet}…</code><br><br>Try generating again — the AI occasionally produces malformed output.`);
    }
    _mealSuggestions = parsed;
    renderMealSuggestions();
  } catch(e) {
    clearInterval(_loadingTimer);
    wrap.innerHTML = `<div style="color:var(--red);font-size:.85rem;padding:8px;line-height:1.6">⚠️ ${esc(e.message)}</div>`;
  } finally {
    document.getElementById('mealGenerateBtn').disabled = false;
  }
}

function renderMealSuggestions() {
  const wrap = document.getElementById('mealSuggestionsWrap');
  wrap.innerHTML = '';
  if (!_mealSuggestions.length) {
    wrap.innerHTML = '<p style="color:var(--muted);padding:8px">No suggestions returned — try again.</p>';
    return;
  }
  const MEAL_TYPE_LABELS = { breakfast:'🌅 Breakfast', lunch:'☀️ Lunch', dinner:'🌙 Dinner' };

  const VARIANT_STYLES = {
    Creative: 'background:rgba(155,89,182,.2);color:#c39bd3',
    Quick:    'background:rgba(52,152,219,.2);color:#7fb3d3',
    Easy:     'background:rgba(39,174,96,.2);color:#82c99a',
  };

  _mealSuggestions.forEach((s, i) => {
    const site       = RECIPE_SITES[s.recipeSite] || RECIPE_SITES.allrecipes;
    const recipeUrl  = site.url(s.recipeSearchQuery || s.name);
    const typeLabel  = _mealType === 'all' ? `<span style="font-size:.7rem;font-weight:600;color:var(--accent);margin-left:6px">${MEAL_TYPE_LABELS[s.mealType] || s.mealType}</span>` : '';
    const vStyle     = s.variant && s.variant !== 'Standard' ? VARIANT_STYLES[s.variant] || '' : '';
    const variantBadge = vStyle ? `<span style="font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:20px;margin-left:7px;${vStyle}">${esc(s.variant)}</span>` : '';
    const ingList    = (s.ingredients || []).slice(0,7).join(', ') + ((s.ingredients||[]).length > 7 ? '…' : '');

    const card = document.createElement('div');
    card.className = 'meal-suggestion';
    card.id = `meal-s-${i}`;
    card.innerHTML = `
      <div class="meal-s-name">${esc(s.name)}${typeLabel}${variantBadge}</div>
      <div class="meal-s-meta">
        <span>⏱ ${esc(s.prepTime)} min</span>
        <span>🍜 ${esc(s.cuisine)}</span>
      </div>
      <p class="meal-s-desc">${esc(s.description)}</p>
      <div class="meal-s-healthy">🥗 ${esc(s.healthyNotes)}</div>
      <div class="meal-s-ingredients">🧅 ${esc(ingList)}</div>
      <div class="meal-s-actions">
        <a href="${safeUrl(recipeUrl)}" target="_blank" rel="noopener"
           class="btn btn-sm btn-secondary" style="text-decoration:none">
          📖 ${site.name} ↗
        </a>
        <button class="btn btn-sm btn-primary" onclick="acceptMeal(${i})">✓ Use This</button>
        <button class="btn btn-sm" style="background:var(--surface2);color:var(--text)"
                onclick="addMealIngredients(${i})">🛒 Add Ingredients</button>
      </div>`;
    wrap.appendChild(card);
  });
}

async function acceptMeal(idx) {
  const s        = _mealSuggestions[idx];
  const mealType = (_mealType === 'all') ? (s.mealType || 'dinner') : _mealType;
  const site     = RECIPE_SITES[s.recipeSite] || RECIPE_SITES.allrecipes;
  const recipeUrl = site.url(s.recipeSearchQuery || s.name);

  // Mark card accepted immediately for instant visual feedback
  const card = document.getElementById(`meal-s-${idx}`);
  if (card) card.classList.add('accepted');

  await setMealInFs(_mealDate, mealType, {
    name: s.name, description: s.description,
    recipeUrl, recipeSite: s.recipeSite,
    ingredients: s.ingredients || [],
    healthyNotes: s.healthyNotes,
    prepTime: s.prepTime, cuisine: s.cuisine
  });
  // renderCurrentView() is triggered by onSnapshot (or by setMealInFs in the !db fallback)
}

function addMealIngredients(idx) {
  const s = _mealSuggestions[idx];
  const ingredients = s.ingredients || [];
  if (!ingredients.length) { alert('No ingredients listed for this meal.'); return; }

  let added = 0;
  if (db) {
    ingredients.forEach(ing => { addToFs('shopping', ing, { category: 'Other' }); added++; });
  } else {
    const items = getLocalList('shopping');
    ingredients.forEach(ing => {
      if (!items.some(i => i.text.toLowerCase() === ing.toLowerCase())) {
        items.push({ text: ing, done: false, by: userName, category: 'Other' });
        added++;
      }
    });
    saveLocalList('shopping', items);
    renderLocalList('shopping');
  }
  // Brief toast via bgStatus re-use or alert
  alert(`✓ Added ${added} ingredient(s) from "${s.name}" to the Shopping List.`);
}

async function removeMeal(dateKey, mealType) {
  await deleteMealFromFs(dateKey, mealType);
  // renderCurrentView() is triggered by onSnapshot (or by deleteMealFromFs in the !db fallback)
}

// ── Meal export to shopping list ──────────────────────────────
function exportWeekMealsToShopping() {
  const weekStart = getWeekStart(calViewDate);
  const toAdd = [];   // unique ingredient strings not already in shopping list
  const existingLower = shopItemsCache.map(i => i.text.toLowerCase());
  let mealCount = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 86400000);
    const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    ['breakfast','lunch','dinner'].forEach(type => {
      const meal = (mealPlan[dk] || {})[type];
      if (!meal || !meal.ingredients || !meal.ingredients.length) return;
      mealCount++;
      meal.ingredients.forEach(ing => {
        const lower = ing.toLowerCase();
        if (!toAdd.some(x => x.toLowerCase() === lower) && !existingLower.includes(lower)) {
          toAdd.push(ing);
        }
      });
    });
  }

  if (!mealCount) {
    alert('No meals with ingredients found this week. Plan meals using the AI assistant to generate ingredient lists.');
    return;
  }
  if (!toAdd.length) {
    alert('All ingredients from this week\'s meals are already in your shopping list.');
    return;
  }

  if (db) {
    toAdd.forEach(ing => addToFs('shopping', ing, { category: 'Other' }));
  } else {
    const items = getLocalList('shopping');
    toAdd.forEach(ing => items.push({ text: ing, done: false, by: userName, category: 'Other' }));
    saveLocalList('shopping', items);
    renderLocalList('shopping');
  }

  // Brief toast
  const t = document.createElement('div');
  t.textContent = `✓ Added ${toAdd.length} ingredient${toAdd.length !== 1 ? 's' : ''} from ${mealCount} meal${mealCount !== 1 ? 's' : ''} to shopping list`;
  Object.assign(t.style, { position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
    background:'var(--accent)', color:'#fff', padding:'8px 18px', borderRadius:'8px',
    fontSize:'0.88rem', zIndex:'9999', pointerEvents:'none', whiteSpace:'nowrap' });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Meal Plan Templates ───────────────────────────────────────

function saveMealTemplate() {
  const nameEl = document.getElementById('mealTemplateNameInput');
  const name = (nameEl?.value || '').trim();
  if (!name) { nameEl?.focus(); return; }

  // Capture the currently-viewed week (week view) or current week (other views)
  const weekStart = calView === 'week' ? getWeekStart(calViewDate) : getWeekStart(new Date());
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 86400000);
    const dk = d.toISOString().slice(0, 10);
    const dm = mealPlan[dk] || {};
    week.push({
      breakfast: dm.breakfast || null,
      lunch:     dm.lunch     || null,
      dinner:    dm.dinner    || null,
    });
  }

  mealTemplates.push({ id: Date.now(), name, createdAt: new Date().toISOString().slice(0, 10), week });
  localStorage.setItem('fh_mealTemplates', JSON.stringify(mealTemplates));
  if (nameEl) nameEl.value = '';
  renderMealTemplateList();
}

async function applyMealTemplate(id) {
  const tmpl = mealTemplates.find(t => t.id === id);
  if (!tmpl) return;

  const mealCount = tmpl.week.reduce((n, d) =>
    n + (d?.breakfast?1:0) + (d?.lunch?1:0) + (d?.dinner?1:0), 0);
  if (!mealCount) { alert('This template has no meals saved.'); return; }

  const weekStart = getWeekStart(new Date());
  const targetDates = Array.from({length: 7}, (_, i) =>
    new Date(weekStart.getTime() + i * 86400000).toISOString().slice(0, 10));

  const hasExisting = targetDates.some(dk => {
    const dm = mealPlan[dk] || {};
    return dm.breakfast || dm.lunch || dm.dinner;
  });
  const weekLabel = `${weekStart.toLocaleDateString([],{month:'short',day:'numeric'})} – ${
    new Date(weekStart.getTime()+6*86400000).toLocaleDateString([],{month:'short',day:'numeric'})}`;

  if (hasExisting && !confirm(`Apply "${tmpl.name}" to this week (${weekLabel})?\nExisting meals will be replaced.`)) return;

  for (let i = 0; i < 7; i++) {
    const dk  = targetDates[i];
    const day = tmpl.week[i] || {};
    for (const mealType of ['breakfast', 'lunch', 'dinner']) {
      if (day[mealType]) {
        await setMealInFs(dk, mealType, day[mealType]);
      } else if ((mealPlan[dk] || {})[mealType]) {
        await deleteMealFromFs(dk, mealType);
      }
    }
  }
  closeSettings();
}

function deleteMealTemplate(id) {
  if (!confirm('Delete this template?')) return;
  mealTemplates = mealTemplates.filter(t => t.id !== id);
  localStorage.setItem('fh_mealTemplates', JSON.stringify(mealTemplates));
  renderMealTemplateList();
}

function renderMealTemplateList() {
  const list = document.getElementById('mealTemplateList');
  if (!list) return;
  list.innerHTML = '';
  if (!mealTemplates.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:.8rem;padding:4px 0">No templates yet — plan a week then click Save Week.</div>';
    return;
  }
  mealTemplates.forEach(tmpl => {
    const mealCount = tmpl.week.reduce((n, d) =>
      n + (d?.breakfast?1:0) + (d?.lunch?1:0) + (d?.dinner?1:0), 0);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface2);border-radius:8px';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    info.innerHTML = `<div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(tmpl.name)}</div>
      <div style="font-size:.73rem;color:var(--muted)">${tmpl.createdAt} · ${mealCount} meal${mealCount !== 1 ? 's' : ''}</div>`;

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-sm btn-primary';
    applyBtn.textContent = '▶ Apply';
    applyBtn.title = 'Apply to current week (Mon–Sun)';
    applyBtn.onclick = () => applyMealTemplate(tmpl.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm';
    delBtn.style.cssText = 'color:var(--red);background:none;border:1px solid rgba(255,255,255,.15);padding:3px 8px';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete template';
    delBtn.onclick = () => deleteMealTemplate(tmpl.id);

    row.append(info, applyBtn, delBtn);
    list.appendChild(row);
  });
}

// ── Meal Detail modal ─────────────────────────────────────────
const MEAL_DETAIL_LABELS = { breakfast:'🌅 Breakfast', lunch:'☀️ Lunch', dinner:'🌙 Dinner' };
const MEAL_DETAIL_EMOJI  = { breakfast:'🍳', lunch:'🥪', dinner:'🍽' };

/** Best-effort dish photo. Returns { url, stock } where stock=true means a representative image.
 *  Pass 1: exact TheMealDB name. Pass 2: simplified name. Pass 3: LoremFlickr fallback. */
async function fetchMealImage(name) {
  const key = (name || '').toLowerCase().trim();
  if (!key) return null;
  if (key in _mealImgCache) return _mealImgCache[key];

  // Helper: one TheMealDB lookup
  const dbLookup = async q => {
    try {
      const r = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`);
      const d = await r.json();
      return d?.meals?.[0]?.strMealThumb || null;
    } catch { return null; }
  };

  // Pass 1: exact name
  let thumb = await dbLookup(name);

  // Pass 2: simplified name — strip leading adjectives / cooking methods iteratively and retry
  if (!thumb) {
    const STRIP_WORD = /^(creamy|spicy|crispy|crunchy|smoky|tangy|zesty|savory|sweet|sticky|juicy|tender|baked|grilled|roasted|pan[-\s]?fried|fried|braised|slow[-\s]?cooked|air[-\s]?fried|sautéed|steamed|poached|smoked|stuffed|glazed|marinated|easy|simple|classic|homemade|quick|healthy|hearty|loaded|one[-\s]?pan|one[-\s]?pot|sheet[-\s]?pan|garlic|herb|lemon|butter|[a-z]+-style)\s+/i;
    let simplified = name, prev;
    do { prev = simplified; simplified = simplified.replace(STRIP_WORD, ''); } while (simplified !== prev);
    simplified = simplified.trim();
    if (simplified && simplified.toLowerCase() !== key) {
      thumb = await dbLookup(simplified);
    }
  }

  if (thumb) {
    const result = { url: thumb, stock: false };
    _mealImgCache[key] = result;
    return result;
  }

  // Pass 3: LoremFlickr representative food photo — always returns an image
  const keywords = encodeURIComponent(name.replace(/\s+/g, ',').toLowerCase());
  const stockUrl = `https://loremflickr.com/600/400/${keywords},food/all`;
  const result = { url: stockUrl, stock: true };
  _mealImgCache[key] = result;
  return result;
}

/** Persist a found image URL onto the meal in Firestore so future opens are instant. */
async function persistMealImage(dateKey, mealType, imageUrl) {
  const meal = (mealPlan[dateKey] || {})[mealType];
  if (!meal || meal.image === imageUrl) return; // already stored
  await setMealInFs(dateKey, mealType, { ...meal, image: imageUrl });
}

/** Open the detail popup for an already-planned meal. Falls back to the planner if none exists. */
function openMealDetail(dateKey, mealType) {
  const meal = (mealPlan[dateKey] || {})[mealType];
  if (!meal) { openMealModal(dateKey, mealType); return; }
  _mealDetailDate = dateKey;
  _mealDetailType = mealType;

  const dt        = new Date(dateKey + 'T12:00:00');
  const dateLabel = dt.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' });
  document.getElementById('mealDetailTitle').textContent    = meal.name || 'Meal';
  document.getElementById('mealDetailSubtitle').textContent = `${MEAL_DETAIL_LABELS[mealType] || mealType} · ${dateLabel}`;

  const meta = [];
  if (meal.prepTime) meta.push(`⏱ ${esc(String(meal.prepTime))} min`);
  if (meal.cuisine)  meta.push(`🍜 ${esc(meal.cuisine)}`);
  document.getElementById('mealDetailMeta').innerHTML = meta.map(m => `<span>${m}</span>`).join('');

  document.getElementById('mealDetailDesc').textContent = meal.description || '';

  const healthyEl = document.getElementById('mealDetailHealthy');
  if (meal.healthyNotes) { healthyEl.textContent = '🥗 ' + meal.healthyNotes; healthyEl.style.display = ''; }
  else healthyEl.style.display = 'none';

  const ingEl = document.getElementById('mealDetailIngredients');
  if (meal.ingredients && meal.ingredients.length) { ingEl.textContent = '🧅 ' + meal.ingredients.join(', '); ingEl.style.display = ''; }
  else ingEl.style.display = 'none';

  const recipeEl  = document.getElementById('mealDetailRecipe');
  const recipeUrl = meal.recipeUrl
    || (meal.recipeSite ? (RECIPE_SITES[meal.recipeSite] || RECIPE_SITES.allrecipes).url(meal.recipeSearchQuery || meal.name) : '');
  if (recipeUrl) {
    const site = RECIPE_SITES[meal.recipeSite];
    recipeEl.href = safeUrl(recipeUrl);
    recipeEl.textContent = `📖 ${site ? site.name : 'View recipe'} ↗`;
    recipeEl.style.display = '';
  } else recipeEl.style.display = 'none';

  // Reset adjust UI
  document.getElementById('mealAdjustSection').style.display = 'none';
  document.getElementById('mealAdjustInput').value = '';
  document.getElementById('mealAdjustStatus').innerHTML = '';
  document.getElementById('mealAdjustChips').innerHTML = MEAL_ADJUST_PRESETS
    .map(p => `<button class="meal-adjust-chip" onclick="addAdjustPreset(this.textContent)">${esc(p)}</button>`).join('');

  // Image: emoji placeholder first, then best-effort dish photo
  const img = document.getElementById('mealDetailImg');
  const ph  = document.getElementById('mealDetailImgPlaceholder');
  img.style.display = 'none';
  img.removeAttribute('src');
  ph.textContent = MEAL_DETAIL_EMOJI[mealType] || '🍽';
  ph.style.display = '';
  const token = dateKey + '|' + mealType;
  const showImg = url => {
    img.onload = () => { if (_mealDetailDate + '|' + _mealDetailType === token) { img.style.display = ''; ph.style.display = 'none'; } };
    img.src = url;
  };
  const stockLabel = document.getElementById('mealStockLabel');
  if (meal.image) {
    showImg(meal.image);
    if (stockLabel) stockLabel.style.display = 'none';
  } else {
    fetchMealImage(meal.name).then(result => {
      if (result && _mealDetailDate + '|' + _mealDetailType === token) {
        showImg(result.url);
        if (stockLabel) stockLabel.style.display = result.stock ? '' : 'none';
        if (!result.stock) persistMealImage(dateKey, mealType, result.url);
      }
    });
  }

  document.getElementById('mealDetailModal').style.display = 'flex';
}

function closeMealDetail() {
  document.getElementById('mealDetailModal').style.display = 'none';
}

function toggleMealAdjust() {
  const sec = document.getElementById('mealAdjustSection');
  const show = sec.style.display === 'none';
  sec.style.display = show ? 'block' : 'none';
  if (show) document.getElementById('mealAdjustInput').focus();
}

/** Append a quick-adjust preset to the instruction input (comma-separated, de-duped). */
function addAdjustPreset(label) {
  const inp   = document.getElementById('mealAdjustInput');
  const parts = inp.value.trim() ? inp.value.split(/,\s*/) : [];
  if (!parts.some(p => p.toLowerCase() === label.toLowerCase())) parts.push(label);
  inp.value = parts.join(', ');
  inp.focus();
}

async function deleteMealFromDetail() {
  await removeMeal(_mealDetailDate, _mealDetailType);
  closeMealDetail();
}

/** Re-generate the current meal with the user's adjustment, then refresh the detail view. */
async function adjustMeal() {
  const instruction = document.getElementById('mealAdjustInput').value.trim();
  const statusEl    = document.getElementById('mealAdjustStatus');
  if (!instruction) { statusEl.innerHTML = '<span style="color:var(--muted);font-size:.8rem">Describe a change or tap a chip first.</span>'; return; }
  if (!mealAiKey)   { statusEl.innerHTML = '<span style="color:var(--accent2);font-size:.8rem">⚙️ Add a Gemini API key in Settings → 🍽 Meals.</span>'; return; }

  const meal = (mealPlan[_mealDetailDate] || {})[_mealDetailType];
  if (!meal) { closeMealDetail(); return; }

  const dietStr = mealDietPrefs.length ? mealDietPrefs.join(', ') : 'none specified';
  const prompt =
`Adjust this planned ${_mealDetailType} meal based on the request, keeping it appealing and family-friendly.
Current meal: ${meal.name} — ${meal.description || ''}
Cuisine: ${meal.cuisine || 'any'}. Current ingredients: ${(meal.ingredients || []).join(', ')}
Adjustment request: ${instruction}
Also respect these dietary preferences: ${dietStr}
Choose the best matching recipe site from: allrecipes, seriouseats, nytcooking, epicurious, simplyrecipes, bonappetit.
Return ONLY a valid JSON object (no markdown, no explanation):
{ "name":"", "description":"1-2 sentences", "cuisine":"", "prepTime":30, "healthyNotes":"", "recipeSite":"allrecipes", "recipeSearchQuery":"exact recipe name to search", "ingredients":["",""] }`;

  const btn = document.getElementById('mealAdjustBtn');
  btn.disabled = true;
  statusEl.innerHTML = '<span class="spinner"></span> <span style="color:var(--muted);font-size:.82rem">Reworking the meal…</span>';
  try {
    const raw = await callMealAI(prompt);
    if (!raw) { statusEl.innerHTML = '<span style="color:var(--accent2);font-size:.8rem">⚠️ The AI service is rate-limited or unavailable right now. Try again shortly.</span>'; return; }
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON returned — try again.');
    const s    = JSON.parse(m[0]);
    const site = RECIPE_SITES[s.recipeSite] || RECIPE_SITES.allrecipes;
    const newMeal = {
      name: s.name, description: s.description,
      recipeUrl: site.url(s.recipeSearchQuery || s.name), recipeSite: s.recipeSite,
      ingredients: s.ingredients || [], healthyNotes: s.healthyNotes,
      prepTime: s.prepTime, cuisine: s.cuisine,
    };
    await setMealInFs(_mealDetailDate, _mealDetailType, newMeal);
    // Optimistic local update so the detail re-opens with fresh data regardless of the Firestore round-trip
    if (!mealPlan[_mealDetailDate]) mealPlan[_mealDetailDate] = {};
    mealPlan[_mealDetailDate][_mealDetailType] = newMeal;
    openMealDetail(_mealDetailDate, _mealDetailType);
  } catch (e) {
    statusEl.innerHTML = `<span style="color:var(--red);font-size:.8rem">⚠️ ${esc(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

// ── Family Assistant ───────────────────────────────────────────────────────

/** Gather current app state into a system prompt for the AI. */
function buildAssistantContext() {
  const today = new Date();
  const fmt = (d, opts) => d.toLocaleDateString('en-US', opts);

  // ── Calendar: next 7 days (with event times) ──
  const localDateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const calLines = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
                : fmt(d, { weekday: 'long', month: 'short', day: 'numeric' });
    const evts = Object.values(calEventCache)
      .flatMap(calDays => calDays[dateStr] || [])
      .filter(e => !e.holiday)
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return (a.startDT || '') < (b.startDT || '') ? -1 : 1;
      })
      .map(e => {
        if (!e.allDay && e.startDT) {
          const t = new Date(e.startDT).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return `${e.summary} at ${t}`;
        }
        return e.summary;
      });
    if (evts.length) calLines.push(`  ${label}: ${evts.join(', ')}`);
  }

  // ── Meal plan: next 7 days ──
  const mealLines = [];
  const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
                : fmt(d, { weekday: 'long', month: 'short', day: 'numeric' });
    const dayMeals = mealPlan[dateStr] || {};
    const parts = MEAL_TYPES.filter(t => dayMeals[t]).map(t => `${t}: ${dayMeals[t].name}`);
    if (parts.length) mealLines.push(`  ${label}: ${parts.join(', ')}`);
  }

  // ── Family members ──
  const memberLines = familyMembers.map(m => {
    const pronouns = m.gender === 'male' ? 'he/him' : m.gender === 'female' ? 'she/her' : 'they/them';
    return `  • ${m.name} (${pronouns})`;
  });

  // ── To-Do (pending) ──
  const pendingTodos = todoItems
    .filter(t => !t.done)
    .map(t => {
      let s = `  • ${t.text}`;
      if (t.dueDate)    s += ` (due ${t.dueDate})`;
      if (t.assignedTo) s += ` [${t.assignedTo}]`;
      return s;
    });

  // ── Shopping (pending) ──
  const pendingShop = shopItemsCache
    .filter(s => !s.done)
    .map(s => `  • ${s.text}`);

  // ── Budget ──
  const budgetLines = budgetItems
    .map(b => `  • ${b.name}: $${b.amount} (${b.frequency})`);

  // ── Weather (real conditions from cache) ──
  const weatherCity = weatherLocations[weatherLocIdx] || 'not set';
  let weatherSummary = `Location: ${weatherCity}`;
  const wxCached = weatherLocations[weatherLocIdx]
    && weatherCache[weatherLocations[weatherLocIdx].toLowerCase().trim()];
  if (wxCached) {
    const wx = wxCached.data;
    const parts = [`${wx.temp}°F`, wx.desc];
    if (wx.feels != null) parts.push(`feels like ${wx.feels}°`);
    if (wx.hi != null && wx.lo != null) parts.push(`hi ${wx.hi}° / lo ${wx.lo}°`);
    if (wx.rain != null) parts.push(`${wx.rain}% precip`);
    if (wx.windSpeed != null) parts.push(`wind ${wx.windSpeed} mph ${wx.windDir || ''}`.trim());
    if (wx.aqi != null) parts.push(`AQI: ${wx.aqiLabel || wx.aqi}`);
    if (wx.alerts && wx.alerts.length) {
      parts.push(`⚠️ ${wx.alerts.map(a => a.event).join(', ')}`);
    }
    weatherSummary = `${weatherCity} — ${parts.join(', ')}`;
  }

  const name = userName || 'the family';
  const timeStr = today.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `You are a helpful assistant built into a family dashboard. You are talking to ${name}. Today is ${fmt(today, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current local time: ${timeStr}.

CURRENT FAMILY DATA (use this to answer questions):

Family members and their pronouns (use ONLY these pronouns — never guess from names):
${memberLines.length ? memberLines.join('\n') : '  (none set up)'}

Weather: ${weatherSummary}

Calendar — next 7 days:
${calLines.length ? calLines.join('\n') : '  (no upcoming events)'}

Meal plan — next 7 days:
${mealLines.length ? mealLines.join('\n') : '  (no meals planned)'}

To-Do list — ${pendingTodos.length} pending item(s):
${pendingTodos.length ? pendingTodos.join('\n') : '  (nothing pending)'}

Shopping list — ${pendingShop.length} item(s):
${pendingShop.length ? pendingShop.join('\n') : '  (list is empty)'}

Budget / recurring bills:
${budgetLines.length ? budgetLines.join('\n') : '  (none set up)'}

ACTIONS YOU CAN TAKE:
When the user clearly asks you to add or change something, append one tag per action at the very END of your response (after your text). Tags are executed automatically and hidden from the display. Resolve relative dates ("tomorrow", "Friday") to YYYY-MM-DD using today's date above.

- Add to shopping list:      [ACTION:addShopping:item name]
- Add a to-do task:          [ACTION:addTodo:task description]
- Mark a to-do as done:      [ACTION:completeTodo:task text or keywords]
- Check off a shopping item: [ACTION:checkShopping:item text or keywords]
- Add a calendar event:      [ACTION:addEvent:YYYY-MM-DD|HH:MM|Title]   (use "allday" in place of HH:MM if no specific time)
- Plan a meal:               [ACTION:setMeal:YYYY-MM-DD|mealType|Meal name]   (mealType is breakfast, lunch, or dinner)
- Add a recurring bill:      [ACTION:addBudget:Name|Amount|frequency]   (frequency is monthly, weekly, biweekly, or yearly)

You may include multiple tags. Only emit a tag when the user clearly requests that change — never for questions. Calendar events require Google sign-in; if it's unavailable the user will be told automatically.

GUIDELINES:
- Keep responses concise and friendly. 2–4 sentences is usually enough.
- Use bullet points (•) for lists.
- When asked "what's going on this week?" or similar, summarise the calendar events including times.
- When asked about free time or scheduling, look at the calendar gaps.
- When asked about weather ("will it rain?", "is it going to be hot?"), use the real weather data above.
- When asked "what's for dinner?" or "what's the meal plan?", use the meal plan data above.
- When asked about family members or who is assigned to something, use the family members list.
- Do not repeat raw data back verbatim — synthesise and be helpful.
- If no data exists for a question (e.g. no calendar events), say so briefly.`;
}

/** Format AI reply text safely for innerHTML: escape HTML, then apply light markdown. */
function formatAssistantText(raw) {
  const safe = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

/** Strip [ACTION:...] tags from reply text, return {text, actions[]}. */
function extractAssistantActions(raw) {
  const actions = [];
  const actionRe = /\[ACTION:(\w+):([^\]]+)\]/g;
  let m;
  while ((m = actionRe.exec(raw)) !== null) {
    actions.push({ type: m[1], value: m[2].trim() });
  }
  const text = raw.replace(/\[ACTION:\w+:[^\]]+\]/g, '').trim();
  return { text, actions };
}

/** Loose text match for completing items by keyword. */
function fuzzyTextMatch(stored, query) {
  const a = (stored || '').toLowerCase().trim();
  const b = (query  || '').toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

// ── Assistant action handlers (each returns a confirmation string) ──
function assistantAddShopping(item) {
  if (db) { addToFs('shopping', item, { category: 'Other' }); }
  else {
    const items = getLocalList('shopping');
    items.push({ text: item, done: false, by: userName, category: 'Other' });
    saveLocalList('shopping', items);
    renderLocalList('shopping');
  }
  return `✓ Added "${item}" to Shopping`;
}

function assistantAddTodo(task) {
  if (db) { addToFs('todo', task); }
  else {
    todoItems.push({ id: String(Date.now() + Math.random()), text: task, done: false, by: userName });
    saveLocalList('todo', todoItems);
    renderTodoList();
  }
  return `✓ Added "${task}" to To-Do`;
}

async function assistantCompleteTodo(query) {
  const t = todoItems.find(t => !t.done && fuzzyTextMatch(t.text, query));
  if (!t) return `⚠️ Couldn't find a pending to-do matching "${query}"`;
  if (db) { await toggleFs('todo', t.id, t.done); }
  else { t.done = true; saveLocalList('todo', todoItems); renderTodoList(); renderCurrentView(); }
  return `✓ Marked "${t.text}" done`;
}

async function assistantCheckShopping(query) {
  if (db) {
    const snap = await db.collection('shopping').where('done', '==', false).get();
    let match = null;
    snap.forEach(doc => { if (!match && fuzzyTextMatch(doc.data().text, query)) match = doc; });
    if (!match) return `⚠️ Couldn't find a shopping item matching "${query}"`;
    await match.ref.update({ done: true });
    return `✓ Checked off "${match.data().text}"`;
  }
  const items = getLocalList('shopping');
  const i = items.findIndex(it => !it.done && fuzzyTextMatch(it.text, query));
  if (i < 0) return `⚠️ Couldn't find a shopping item matching "${query}"`;
  items[i].done = true;
  saveLocalList('shopping', items);
  renderLocalList('shopping');
  return `✓ Checked off "${items[i].text}"`;
}

async function assistantAddEvent(dateStr, timeStr, title) {
  if (!title || !dateStr) return `⚠️ Couldn't add the event — missing a date or title`;
  if (!googleToken)       return `⚠️ Sign in with Google to let me add calendar events`;
  const allDay = !timeStr || /^all\s?day$/i.test(timeStr.trim());
  let start, end;
  if (allDay) {
    start = { date: dateStr };
    const next = new Date(dateStr + 'T00:00:00'); next.setDate(next.getDate() + 1);
    end = { date: next.toISOString().slice(0, 10) };
  } else {
    const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endD = new Date(`${dateStr}T${timeStr}:00`); endD.setHours(endD.getHours() + 1);
    const endT = `${String(endD.getHours()).padStart(2,'0')}:${String(endD.getMinutes()).padStart(2,'0')}`;
    start = { dateTime: `${dateStr}T${timeStr}:00`, timeZone: tz };
    end   = { dateTime: `${dateStr}T${endT}:00`,    timeZone: tz };
  }
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: title, start, end }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return `⚠️ Calendar error: ${e.error?.message || r.status}`; }
    await loadAllCalendars();
    const when = allDay ? dateStr : `${dateStr} ${timeStr}`;
    return `✓ Added "${title}" to your calendar (${when})`;
  } catch (e) { return `⚠️ Couldn't add the event: ${e.message}`; }
}

async function assistantSetMeal(dateStr, mealType, name) {
  const type = (mealType || '').toLowerCase().trim();
  if (!['breakfast','lunch','dinner'].includes(type)) return `⚠️ Meal type must be breakfast, lunch, or dinner`;
  if (!dateStr || !name) return `⚠️ Couldn't plan the meal — missing a date or name`;
  await setMealInFs(dateStr, type, { name, description: '', ingredients: [] });
  return `✓ Planned "${name}" for ${type} on ${dateStr}`;
}

async function assistantAddBudget(name, amountStr, freqRaw) {
  const amount = parseFloat(String(amountStr).replace(/[^0-9.]/g, ''));
  if (!name || isNaN(amount)) return `⚠️ Couldn't add the bill — need a name and amount`;
  let freq = (freqRaw || 'monthly').toLowerCase().trim();
  if (!['monthly','weekly','biweekly','yearly'].includes(freq)) freq = 'monthly';
  const today = new Date();
  const item = { name, amount, frequency: freq, color: BUDGET_COLOR };
  if (freq === 'monthly')  item.dayOfMonth = today.getDate();
  if (freq === 'weekly')   item.dayOfWeek  = today.getDay();
  if (freq === 'biweekly') item.startDate  = today.toISOString().slice(0, 10);
  if (freq === 'yearly')   { item.month = today.getMonth(); item.dayOfMonth = today.getDate(); }
  if (db) {
    item.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('budget').add(item);
  } else {
    item.id = String(Date.now());
    budgetItems.push(item);
    localStorage.setItem('fh_budgetItems', JSON.stringify(budgetItems));
    onBudgetChanged();
  }
  return `✓ Added bill "${name}" — ${fmt$(amount)} (${freq})`;
}

/** Execute parsed assistant actions; returns an array of confirmation strings. */
async function executeAssistantActions(actions) {
  const confirmMsgs = [];
  for (const { type, value } of actions) {
    const parts = value.split('|').map(p => p.trim());
    try {
      if      (type === 'addShopping')   confirmMsgs.push(assistantAddShopping(value));
      else if (type === 'addTodo')       confirmMsgs.push(assistantAddTodo(value));
      else if (type === 'completeTodo')  confirmMsgs.push(await assistantCompleteTodo(value));
      else if (type === 'checkShopping') confirmMsgs.push(await assistantCheckShopping(value));
      else if (type === 'addEvent')      confirmMsgs.push(await assistantAddEvent(parts[0], parts[1], parts.slice(2).join('|')));
      else if (type === 'setMeal')       confirmMsgs.push(await assistantSetMeal(parts[0], parts[1], parts.slice(2).join('|')));
      else if (type === 'addBudget')     confirmMsgs.push(await assistantAddBudget(parts[0], parts[1], parts[2]));
    } catch (e) {
      confirmMsgs.push(`⚠️ Action failed: ${e.message}`);
    }
  }
  return confirmMsgs;
}

/** Re-render all chat bubbles from assistantHistory. */
function renderAssistantMessages() {
  const container = document.getElementById('assistantMessages');
  if (!container) return;
  if (!assistantHistory.length) {
    if (assistantWelcomeMode === 'static') {
      container.innerHTML =
        `<div class="assistant-welcome">Hi! Ask me about your schedule, lists, or budget — or say things like "add milk to shopping" or "what's on this week?"</div>`;
    } else {
      const chips = ASSISTANT_QUICK_PROMPTS
        .map(p => `<button class="assistant-chip" onclick="useQuickPrompt(this.textContent)">${formatAssistantText(p)}</button>`)
        .join('');
      const group = `<div class="assistant-ticker-group">${chips}</div>`;
      container.innerHTML =
        `<div class="assistant-ticker"><div class="assistant-ticker-track">${group}${group}</div></div>`;
    }
    return;
  }
  container.innerHTML = '';
  assistantHistory.forEach(turn => {
    const div = document.createElement('div');
    div.className = `assistant-msg ${turn.role === 'user' ? 'user' : 'ai'}`;
    div.innerHTML = formatAssistantText(turn.parts[0].text);
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

/** Fill the input with a quick-prompt chip's text and send it. */
function useQuickPrompt(text) {
  const inp = document.getElementById('assistantInput');
  if (inp) inp.value = text;
  sendAssistantMessage();
}

// ── Easter eggs ────────────────────────────────────────────────
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let _konamiBuf = [];

function setupKonamiCode() {
  document.addEventListener('keydown', e => {
    _konamiBuf.push(e.key);
    if (_konamiBuf.length > KONAMI.length) _konamiBuf.shift();
    if (_konamiBuf.length === KONAMI.length && _konamiBuf.every((k, i) => k === KONAMI[i])) {
      _konamiBuf = [];
      triggerKonami();
    }
  });
}

function triggerKonami() {
  if (document.body.classList.contains('konami-mode')) return;
  document.body.classList.add('konami-mode');
  // Brief toast
  const toast = document.createElement('div');
  toast.textContent = '🌈 KONAMI';
  Object.assign(toast.style, {
    position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
    fontSize:'3rem', fontWeight:'900', letterSpacing:'.1em',
    background:'transparent', color:'#fff',
    textShadow:'0 0 20px #fff, 0 0 40px #f0f',
    zIndex:'99999', pointerEvents:'none', animation:'konamiText 3s ease forwards',
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    document.body.classList.remove('konami-mode');
    toast.remove();
  }, 3000);
}

// ── Easter egg phrase triggers ──────────────────────────────────
function checkAssistantEasterEgg(text) {
  const t = text.toLowerCase().trim();

  // ── Hitchhiker's Guide ──
  if (/\b(answer to (life|everything)|meaning of life|42)\b/.test(t)) {
    const n = todoItems.filter(i => !i.done).length;
    return `42. Though I'd argue the more pressing question is why you still have ${n} item${n === 1 ? '' : 's'} on your to-do list.`;
  }

  if (/^don'?t panic[.!]?$/.test(t)) {
    const briefing = buildDailyBriefingSummary();
    return `Printed in large, friendly letters: **DON'T PANIC.**\n\n${briefing}`;
  }

  // ── Dune ──
  if (/the spice must flow/.test(t)) {
    return `The spice is the shopping list. The shopping list is the spice. Without the list, the household foldspace collapses. Add your items, Muad'Dib.`;
  }

  if (/^(tell|show) me (about |the )?the future[.!?]?$/.test(t) || /^what (does|will) the future (hold|bring)[.!?]?$/.test(t)) {
    const briefing = buildDailyBriefingSummary();
    return `I am not a Mentat. But I have looked at your calendar, and I can tell you this:\n\n${briefing}`;
  }

  // ── Lord of the Rings / Hobbit ──
  if (/my precious/.test(t)) {
    const pending = todoItems.filter(i => !i.done);
    if (pending.length) {
      const top = pending[0].text;
      return `We wants it, we needs it… must finish *${top}*. Nasty unfinished taskses. Gollum.`;
    }
    return `We has no precious taskses. We is… free? Gollum.`;
  }

  if (/^(what('?s| is) the time|what time is it)[.!?]?$/.test(t)) {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `It is the quiet hour between second breakfast and elevenses — approximately ${time}. Mind you don't miss either.`;
  }

  if (/^(what'?s for dinner|what are we (having|eating) (for )?dinner)[.!?]?$/.test(t)) {
    const today = new Date().toISOString().slice(0, 10);
    const dinner = (mealPlan[today] || {}).dinner;
    if (!dinner) {
      return `In a hole in the ground there lived a hobbit. And that hobbit had absolutely no idea what was for dinner either. Perhaps you'd like to plan something?`;
    }
    return null; // let Gemini handle it — there's an actual meal planned
  }

  if (/^i am no (wo)?man[.!]?$/.test(t)) {
    return `…and I am no scheduling assistant. Oh wait, yes I am. What do you need?`;
  }

  if (/^you shall not pass[.!]?$/.test(t)) {
    document.getElementById('settingsModal')?.classList.add('gandalf-shake');
    setTimeout(() => document.getElementById('settingsModal')?.classList.remove('gandalf-shake'), 900);
    return `YOU… SHALL NOT… pass on answering this: what actually did you need help with?`;
  }

  // ── Politeness ──
  if (/^(please|pretty please)[.!]?$/.test(t)) {
    return `Well, since you asked so nicely — you're very welcome. 🌟 Now, what can I actually help you with?`;
  }

  // ── Battlestar Galactica ──
  if (/^so say we all[.!]?$/.test(t)) {
    return `So say we all.`;
  }

  // ── Dark mode escalation ──
  if (/\b(darker mode|dark(er| mode))\b/.test(t)) {
    document.body.style.transition = 'filter 0.3s';
    document.body.style.filter = 'brightness(0.12)';
    setTimeout(() => { document.body.style.filter = ''; setTimeout(() => { document.body.style.transition = ''; }, 300); }, 1500);
    return `I think you mean **darker** mode.`;
  }

  return null;
}

/** Build a brief plain-text summary of today for easter egg responses. */
function buildDailyBriefingSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  const pending = todoItems.filter(i => !i.done);
  if (pending.length) lines.push(`📋 ${pending.length} to-do item${pending.length === 1 ? '' : 's'} pending`);
  const shopping = shopItems.filter(i => !i.done);
  if (shopping.length) lines.push(`🛒 ${shopping.length} item${shopping.length === 1 ? '' : 's'} on the shopping list`);
  const todayMeals = mealPlan[today] || {};
  const plannedMeals = Object.entries(todayMeals).filter(([,v]) => v?.name).map(([k,v]) => `${k}: ${v.name}`);
  if (plannedMeals.length) lines.push(`🍽 Today's meals: ${plannedMeals.join(', ')}`);
  if (!lines.length) lines.push(`All clear — nothing pressing today.`);
  return lines.join('\n');
}

/** Send the typed message to Gemini and render the reply. */
async function sendAssistantMessage() {
  const input = document.getElementById('assistantInput');
  const text  = input.value.trim();
  if (!text) return;
  if ('speechSynthesis' in window) speechSynthesis.cancel();  // stop reading any prior reply
  input.value = '';

  if (!mealAiKey) {
    assistantHistory.push({ role: 'model', parts: [{ text: 'I need a Gemini API key to work. Add one in ⚙️ Settings → 🍽 Meals.' }] });
    renderAssistantMessages();
    return;
  }

  // Add user turn and show it immediately
  assistantHistory.push({ role: 'user', parts: [{ text }] });
  renderAssistantMessages();

  // Easter egg intercept — skip Gemini for known phrases
  const eggReply = checkAssistantEasterEgg(text);
  if (eggReply !== null) {
    assistantHistory.push({ role: 'model', parts: [{ text: eggReply }] });
    renderAssistantMessages();
    speakAssistant(eggReply);
    return;
  }

  // Thinking indicator
  const container = document.getElementById('assistantMessages');
  const thinkEl = document.createElement('div');
  thinkEl.className = 'assistant-msg ai assistant-thinking';
  thinkEl.textContent = '•••';
  container.appendChild(thinkEl);
  container.scrollTop = container.scrollHeight;

  try {
    const systemPrompt = buildAssistantContext();
    const resp = await geminiFetch({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: assistantHistory,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });
    thinkEl.remove();

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err.error?.message || `HTTP ${resp.status}`;
      assistantHistory.pop(); // remove user turn on error
      assistantHistory.push({ role: 'model', parts: [{ text: `⚠️ ${msg}` }] });
      renderAssistantMessages();
      return;
    }

    const data     = await resp.json();
    const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I didn't get a response.";
    const { text: cleanText, actions } = extractAssistantActions(rawReply);
    const confirms = await executeAssistantActions(actions);

    // Append confirmation note to reply if actions were taken
    const finalText = confirms.length
      ? cleanText + (cleanText ? '\n' : '') + confirms.join('\n')
      : cleanText;

    assistantHistory.push({ role: 'model', parts: [{ text: finalText }] });
    saveAssistantHistory();
    renderAssistantMessages();
    speakAssistant(finalText);   // read aloud if TTS is on

  } catch(e) {
    thinkEl.remove();
    assistantHistory.pop();
    assistantHistory.push({ role: 'model', parts: [{ text: `⚠️ Error: ${e.message}` }] });
    renderAssistantMessages();
  }
}

/** Persist assistantHistory to localStorage (capped to avoid bloat). */
function saveAssistantHistory() {
  const trimmed = assistantHistory.slice(-ASSISTANT_HISTORY_MAX);
  try { localStorage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify(trimmed)); } catch {}
}

/** Clear conversation history and reset to welcome state. */
function clearAssistantChat() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  assistantHistory = [];
  localStorage.removeItem(ASSISTANT_HISTORY_KEY);
  renderAssistantMessages();
}

// ── Daily Briefing ─────────────────────────────────────────────
const BRIEFING_DATE_KEY   = 'fh_briefingDate';
const BRIEFING_TEXT_KEY   = 'fh_briefingText';
const BRIEFING_BUCKET_KEY = 'fh_briefingBucket'; // 'morning'|'afternoon'|'evening'

function toggleBriefing() {
  const banner = document.getElementById('briefingBanner');
  if (banner && banner.style.display !== 'none') {
    dismissBriefing();
  } else {
    loadDailyBriefing();
  }
}

function updateBriefingPill(active) {
  const pill = document.getElementById('briefingPill');
  if (!pill) return;
  pill.classList.toggle('active', !!active);
  pill.title = active ? 'Dismiss briefing' : 'Daily briefing';
}

/** Show (or generate) the daily briefing banner above the chat. */
async function loadDailyBriefing() {
  const banner = document.getElementById('briefingBanner');
  if (!banner || !mealAiKey) return;

  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
  const h = new Date().getHours();
  const bucket = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const greeting = bucket === 'morning' ? 'Good morning' : bucket === 'afternoon' ? 'Good afternoon' : 'Good evening';

  const cachedDate   = localStorage.getItem(BRIEFING_DATE_KEY);
  const cachedBucket = localStorage.getItem(BRIEFING_BUCKET_KEY);
  const cachedText   = localStorage.getItem(BRIEFING_TEXT_KEY);

  if (cachedDate === today && cachedBucket === bucket && cachedText) {
    showBriefingBanner(cachedText);
    return;
  }

  // Generate a fresh briefing
  showBriefingBanner(null, true); // show loading state
  try {
    const context = buildAssistantContext();
    const prompt = `${context}

---
Write a warm, concise daily briefing (3–5 sentences max). Your response MUST begin with exactly "${greeting}, ${userName || 'there'}!" — do not alter this opening phrase. Then cover:
1. Any calendar events or tasks due today
2. Today's weather highlights (if available)
3. Any bills due soon or a notable meal planned
4. One encouraging closing line

Be specific and personal. Use the family data above, including the correct pronouns for each family member. Do NOT use bullet points or headers — write in flowing prose. Do not include action tags.`;

    const resp = await geminiFetch({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (text) {
      localStorage.setItem(BRIEFING_DATE_KEY,   today);
      localStorage.setItem(BRIEFING_BUCKET_KEY, bucket);
      localStorage.setItem(BRIEFING_TEXT_KEY,   text);
      showBriefingBanner(text);
    } else {
      banner.style.display = 'none';
    }
  } catch {
    banner.style.display = 'none';
  }
}

/** Render the briefing banner. Pass null + loading=true for the skeleton state. */
function showBriefingBanner(text, loading = false) {
  const banner = document.getElementById('briefingBanner');
  if (!banner) return;
  if (loading) {
    banner.style.display = '';
    banner.className = 'briefing-banner briefing-loading';
    banner.innerHTML = '<span class="briefing-dots">•••</span>';
    updateBriefingPill(true);
    return;
  }
  banner.style.display = '';
  banner.className = 'briefing-banner';
  banner.innerHTML = `
    <div class="briefing-body">${formatAssistantText(text)}</div>
  `;
  updateBriefingPill(true);
}

/** Hide the banner for the rest of this session (doesn't clear the cache). */
function dismissBriefing() {
  const banner = document.getElementById('briefingBanner');
  if (banner) banner.style.display = 'none';
  updateBriefingPill(false);
}

// ── Assistant voice output (TTS) ───────────────────────────────
/** Toggle reading replies aloud; persists to fh_assistantTTS. */
function toggleAssistantTTS() {
  assistantTTS = !assistantTTS;
  localStorage.setItem('fh_assistantTTS', JSON.stringify(assistantTTS));
  if (!assistantTTS && 'speechSynthesis' in window) speechSynthesis.cancel();
  updateAssistantTtsBtn();
}

function updateAssistantTtsBtn() {
  const btn = document.getElementById('assistantTtsBtn');
  if (!btn) return;
  const supported = 'speechSynthesis' in window;
  btn.style.display = supported ? '' : 'none';
  btn.textContent = assistantTTS ? '🔊' : '🔇';
  btn.title = assistantTTS ? 'Reading replies aloud (click to mute)' : 'Read replies aloud';
  btn.style.color = assistantTTS ? 'var(--accent)' : 'var(--muted)';
}

/** Speak an assistant reply, stripping markdown/emoji. Interruptible. */
function speakAssistant(text) {
  if (!assistantTTS || !('speechSynthesis' in window) || !text) return;
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')                       // bold markers
    .replace(/[⌀-➿☀-⛿️\u{1F000}-\u{1FAFF}]/gu, '') // emoji/symbols
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!clean) return;
  speechSynthesis.cancel();                                // interrupt any prior speech
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'en-US';
  u.rate = 1.0;
  speechSynthesis.speak(u);
}

// ── Assistant voice ────────────────────────────────────────────

/**
 * Mic permission states drive the button appearance:
 *   'unsupported' — browser has no SpeechRecognition API   → button hidden
 *   'prompt'      — user hasn't been asked yet             → button shown, subtle ring
 *   'granted'     — mic allowed                           → button shown, ready
 *   'denied'      — mic blocked                           → button shown, blocked style; click shows help
 *   'recording'   — actively capturing                    → red pulse
 */
function setMicState(state) {
  const micBtn = document.getElementById('assistantMicBtn');
  if (!micBtn) return;
  micBtn.classList.remove('mic-prompt', 'mic-blocked', 'recording');
  micBtn.removeAttribute('data-mic-state');
  micBtn.setAttribute('data-mic-state', state);

  switch (state) {
    case 'unsupported':
      micBtn.style.display = 'none';
      break;
    case 'prompt':
      micBtn.style.display = 'flex';
      micBtn.classList.add('mic-prompt');
      micBtn.title = 'Enable voice input';
      break;
    case 'granted':
      micBtn.style.display = 'flex';
      micBtn.title = 'Speak (click to start)';
      break;
    case 'denied':
      micBtn.style.display = 'flex';
      micBtn.classList.add('mic-blocked');
      micBtn.title = 'Microphone blocked — click for help';
      break;
    case 'recording':
      micBtn.style.display = 'flex';
      micBtn.classList.add('recording');
      micBtn.title = 'Stop recording';
      break;
  }
}

/** Show a Chrome-specific step-by-step help message in the chat. */
function showMicDeniedHelp() {
  const container = document.getElementById('assistantMessages');
  if (!container) return;

  // Remove any existing help message so we don't stack them
  container.querySelectorAll('.assistant-mic-help').forEach(el => el.remove());

  const div = document.createElement('div');
  div.className = 'assistant-msg ai assistant-mic-help';
  div.innerHTML = `
    <strong>🎤 Microphone blocked</strong><br>
    To enable voice input in Chrome:<br><br>
    <span class="mic-help-step">1</span> Click the <strong>🔒</strong> or <strong>ⓘ</strong> icon in the address bar<br>
    <span class="mic-help-step">2</span> Click <strong>Site settings</strong><br>
    <span class="mic-help-step">3</span> Find <strong>Microphone</strong> → change to <strong>Allow</strong><br>
    <span class="mic-help-step">4</span> Refresh this page<br><br>
    <span style="color:var(--muted);font-size:.78rem">Or type your question below — voice is optional.</span>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/** Show a brief priming message before the browser's permission dialog fires. */
function showMicPrimingMessage() {
  const container = document.getElementById('assistantMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'assistant-msg ai assistant-mic-priming';
  div.innerHTML = `🎤 Chrome will ask for microphone access — click <strong>Allow</strong> to enable voice input.`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/** Remove the one-time priming message once no longer needed. */
function clearMicPrimingMessage() {
  document.querySelectorAll('.assistant-mic-priming').forEach(el => el.remove());
}

/** Initialise SpeechRecognition, check permission state, wire up listeners. */
async function initAssistantVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById('assistantMicBtn');
  if (!SpeechRecognition || !micBtn) { setMicState('unsupported'); return; }

  // Build the recognition instance
  assistantRecognition = new SpeechRecognition();
  assistantRecognition.lang = 'en-US';
  assistantRecognition.interimResults = true;
  assistantRecognition.maxAlternatives = 1;
  assistantRecognition.continuous = false;

  assistantRecognition.onstart = () => {
    assistantListening = true;
    setMicState('recording');
    clearMicPrimingMessage();
    const inp = document.getElementById('assistantInput');
    if (inp) { inp.value = ''; inp.placeholder = 'Listening…'; }
  };

  assistantRecognition.onresult = (event) => {
    const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
    const inp = document.getElementById('assistantInput');
    if (inp) inp.value = transcript;
    if (event.results[event.results.length - 1].isFinal) {
      stopAssistantMic();
      sendAssistantMessage();
    }
  };

  assistantRecognition.onerror = (event) => {
    console.warn('[Assistant voice] error:', event.error);
    stopAssistantMic();
    clearMicPrimingMessage();
    switch (event.error) {
      case 'not-allowed':
      case 'permission-denied':
        setMicState('denied');
        showMicDeniedHelp();
        break;
      case 'no-speech':
        appendAssistantNote('No speech detected — try again.');
        break;
      case 'audio-capture':
        appendAssistantNote('No microphone found. Check that one is connected.');
        break;
      case 'network':
        appendAssistantNote('Voice recognition needs an internet connection (Chrome sends audio to Google).');
        break;
      case 'aborted':
        // user cancelled — silent
        break;
      default:
        appendAssistantNote(`Voice error: ${event.error}`);
    }
  };

  assistantRecognition.onend = () => {
    if (assistantListening) stopAssistantMic();
  };

  // ── Check / watch permission state via Permissions API ──
  if (navigator.permissions) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      setMicState(status.state === 'granted' ? 'granted'
                : status.state === 'denied'  ? 'denied'
                : 'prompt');

      status.addEventListener('change', () => {
        if (assistantListening) return; // don't interrupt an active session
        setMicState(status.state === 'granted' ? 'granted'
                  : status.state === 'denied'  ? 'denied'
                  : 'prompt');
        // If the user just granted permission in settings, clear the help message
        if (status.state === 'granted') {
          document.querySelectorAll('.assistant-mic-help').forEach(el => el.remove());
        }
      });
    } catch(e) {
      // Permissions API not fully supported — show mic button optimistically
      setMicState('granted');
    }
  } else {
    setMicState('granted');
  }
}

/** Start or stop the mic depending on current state. */
function toggleAssistantMic() {
  const micBtn = document.getElementById('assistantMicBtn');
  const state  = micBtn?.getAttribute('data-mic-state');

  if (state === 'denied') { showMicDeniedHelp(); return; }
  if (state === 'recording' || assistantListening) { assistantRecognition.stop(); return; }

  // 'prompt' — show priming message before the browser dialog fires
  if (state === 'prompt') showMicPrimingMessage();

  try {
    assistantRecognition.start();
  } catch(e) {
    console.warn('[Assistant voice] start failed:', e);
    clearMicPrimingMessage();
  }
}

/** Reset mic button and input placeholder after a session ends. */
function stopAssistantMic() {
  assistantListening = false;
  const micBtn = document.getElementById('assistantMicBtn');
  const currentState = micBtn?.getAttribute('data-mic-state');
  if (currentState === 'recording') {
    // Revert to whichever state we were in before recording started
    // Re-query permission so the icon stays in sync
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' })
        .then(s => setMicState(s.state === 'granted' ? 'granted' : s.state === 'denied' ? 'denied' : 'prompt'))
        .catch(() => setMicState('granted'));
    } else {
      setMicState('granted');
    }
  }
  const input = document.getElementById('assistantInput');
  if (input && input.placeholder === 'Listening…') input.placeholder = 'Ask anything…';
}

/** Append a small italic note to the chat (for non-critical voice feedback). */
function appendAssistantNote(text) {
  const container = document.getElementById('assistantMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'assistant-msg ai assistant-note';
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ── SMS Shopping List ──────────────────────────────────────────
function buildShoppingBody() {
  const items = [];
  document.querySelectorAll('#shopList .list-item').forEach(li => {
    const text = li.querySelector('.list-label')?.textContent?.trim();
    const done = li.querySelector('.list-check')?.classList.contains('done') ?? false;
    if (text) items.push({ text, done });
  });
  if (!items.length) return null;
  const pending = items.filter(i => !i.done);
  const toSend  = pending.length ? pending : items;
  return '🛒 Shopping List:\n' + toSend.map(i => '• ' + i.text).join('\n');
}

function toggleSmsPopover(event) {
  event.stopPropagation();
  const pop = document.getElementById('smsPopover');
  const isOpen = pop.style.display === 'block';
  // Close any other open popovers first
  pop.style.display = 'none';
  if (isOpen) return;

  pop.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'sms-popover-title';
  title.textContent = 'Send list to…';
  pop.appendChild(title);

  if (!smsContacts.length) {
    const empty = document.createElement('div');
    empty.className = 'sms-popover-empty';
    empty.innerHTML = 'No recipients saved.<br><span style="color:var(--accent);cursor:pointer" onclick="openSettings();switchSettingsTab(\'shopping\')">Add in Settings ↗</span>';
    pop.appendChild(empty);
  } else {
    smsContacts.forEach(c => {
      const row = document.createElement('div');
      row.className = 'sms-contact-row';
      row.innerHTML = `<span>👤</span>
                       <span class="sms-contact-nick">${c.nick}</span>
                       <span class="sms-contact-phone">${c.phone}</span>`;
      row.onclick = () => sendToContact(c.phone);
      pop.appendChild(row);
    });
  }

  // Move popover to <body> so backdrop-filter on .card doesn't trap it
  if (pop.parentElement !== document.body) document.body.appendChild(pop);

  // Position below the trigger button, right-aligned, clamped to viewport
  const btn  = document.getElementById('smsTriggerBtn');
  const rect = btn.getBoundingClientRect();
  const popW = 210;
  let left = rect.right - popW;
  if (left < 8) left = 8;
  pop.style.top  = (rect.bottom + 5) + 'px';
  pop.style.left = left + 'px';
  pop.style.right = '';
  pop.style.display = 'block';
}

function sendToContact(phone) {
  document.getElementById('smsPopover').style.display = 'none';
  const body = buildShoppingBody();
  if (!body) { alert('Your shopping list is empty.'); return; }
  const encoded  = encodeURIComponent(body);
  const number   = phone.replace(/\s+/g, '');
  const uri      = number ? `sms:${number}?&body=${encoded}` : `sms:?&body=${encoded}`;
  const a        = document.createElement('a');
  a.href = uri; a.click();
}

// ── SMS contacts management (Settings) ────────────────────────
function renderSmsContactsList() {
  const list = document.getElementById('smsContactsList');
  if (!list) return;
  list.innerHTML = '';
  if (!smsContacts.length) {
    list.innerHTML = '<p style="font-size:.8rem;color:var(--muted);padding:4px 0 8px">No recipients yet.</p>';
    return;
  }
  smsContacts.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'sms-setting-row';
    const nick  = document.createElement('span');
    nick.className = 'sms-setting-nick';
    nick.textContent = c.nick;
    const phone = document.createElement('span');
    phone.className = 'sms-setting-phone';
    phone.textContent = c.phone;
    const del = document.createElement('button');
    del.className = 'cal-remove-btn';
    del.style.opacity = '1';
    del.textContent = '✕';
    del.title = 'Remove';
    del.onclick = () => removeSmsContact(i);
    row.appendChild(nick); row.appendChild(phone); row.appendChild(del);
    list.appendChild(row);
  });
}

function addSmsContact() {
  const nickEl  = document.getElementById('smsNewNick');
  const phoneEl = document.getElementById('smsNewPhone');
  const nick    = nickEl.value.trim();
  const phone   = phoneEl.value.trim();
  if (!nick || !phone) return;
  smsContacts.push({ nick, phone });
  localStorage.setItem('fh_smsContacts', JSON.stringify(smsContacts));
  nickEl.value = ''; phoneEl.value = '';
  renderSmsContactsList();
}

function removeSmsContact(idx) {
  smsContacts.splice(idx, 1);
  localStorage.setItem('fh_smsContacts', JSON.stringify(smsContacts));
  renderSmsContactsList();
}

// ── Local Calendars ────────────────────────────────────────────

let birthdays    = lsGet('fh_birthdays',    []);
let medications  = lsGet('fh_medications',  []);
let schoolPeriods= lsGet('fh_school',       []);
let trashPickups = lsGet('fh_trash',        []);
let showBillsOnCal = lsGet('fh_bills_on_cal', false);

const LC_IDS = {
  birthdays: 'local_birthdays',
  meds:      'local_meds',
  school:    'local_school',
  trash:     'local_trash',
  bills:     'local_bills',
};
const LC_DEFS = [
  { id: LC_IDS.birthdays, label: '🎂 Birthdays',        color: '#e91e8c' },
  { id: LC_IDS.meds,      label: '💊 Medications',       color: '#4caf82' },
  { id: LC_IDS.school,    label: '🏫 School',            color: '#61afef' },
  { id: LC_IDS.trash,     label: '🗑 Trash & Recycling', color: '#8bc34a' },
  { id: LC_IDS.bills,     label: '💰 Bills Due',         color: '#f5a623' },
];

function lcDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function lcAddToCache(calId, dateKey, ev) {
  if (!calEventCache[calId]) calEventCache[calId] = {};
  if (!calEventCache[calId][dateKey]) calEventCache[calId][dateKey] = [];
  calEventCache[calId][dateKey].push({ calId, holiday: false, ...ev });
}

function lcGetRange() {
  const d = calViewDate;
  if (calView === 'week') {
    const ws = getWeekStart(d);
    return { start: ws, end: new Date(ws.getTime() + 6*86400000) };
  }
  if (calView === 'day') {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return { start: s, end: s };
  }
  if (calView === 'agenda') {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return { start: s, end: new Date(s.getTime() + 30*86400000) };
  }
  // month
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end:   new Date(d.getFullYear(), d.getMonth()+1, 0),
  };
}

function lcIterateDays({ start, end }, cb) {
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e   = new Date(end.getFullYear(),   end.getMonth(),   end.getDate());
  while (cur <= e) { cb(new Date(cur)); cur.setDate(cur.getDate() + 1); }
}

function injectLocalEvents() {
  // Clear previous local events
  LC_DEFS.forEach(c => { calEventCache[c.id] = {}; });
  const range = lcGetRange();

  // Birthdays
  if (!disabledCals.has(LC_IDS.birthdays)) {
    birthdays.forEach(b => {
      for (let yr = range.start.getFullYear(); yr <= range.end.getFullYear(); yr++) {
        const date = new Date(yr, b.month - 1, b.day);
        if (date >= range.start && date <= range.end) {
          const key = lcDateKey(date);
          const age = b.year ? ` (turns ${yr - b.year})` : '';
          lcAddToCache(LC_IDS.birthdays, key, {
            eventId: `bday_${b.id}_${yr}`, summary: `🎂 ${b.name}'s Birthday${age}`,
            color: '#e91e8c', allDay: true, startDate: key, endDate: key,
          });
        }
      }
    });
  }

  // Medications
  if (!disabledCals.has(LC_IDS.meds)) {
    medications.forEach(m => {
      lcIterateDays(range, day => {
        const dow = day.getDay(); // 0=Sun
        const matches = m.days === 'daily'    ? true
                      : m.days === 'weekdays' ? dow >= 1 && dow <= 5
                      : m.days === 'weekends' ? dow === 0 || dow === 6
                      : false;
        if (!matches) return;
        const key = lcDateKey(day);
        const [hh, mm] = m.time.split(':').map(Number);
        const startDT = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
        const endDT   = new Date(startDT.getTime() + 30*60000);
        lcAddToCache(LC_IDS.meds, key, {
          eventId: `med_${m.id}_${key}`, summary: `💊 ${m.name}${m.dosage ? ' · ' + m.dosage : ''}`,
          color: '#4caf82', allDay: false, startDT, endDT, startDate: key, endDate: key,
        });
      });
    });
  }

  // School schedule
  if (!disabledCals.has(LC_IDS.school)) {
    schoolPeriods.forEach(p => {
      lcIterateDays(range, day => {
        const dow = day.getDay();
        if (!p.days.includes(dow)) return;
        const key = lcDateKey(day);
        const [sh, sm] = p.startTime.split(':').map(Number);
        const [eh, em] = p.endTime.split(':').map(Number);
        const startDT = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm);
        const endDT   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em);
        lcAddToCache(LC_IDS.school, key, {
          eventId: `school_${p.id}_${key}`, summary: `🏫 ${p.name}`,
          color: p.color, allDay: false, startDT, endDT, startDate: key, endDate: key,
        });
      });
    });
  }

  // Trash & recycling
  if (!disabledCals.has(LC_IDS.trash)) {
    trashPickups.forEach(t => {
      lcIterateDays(range, day => {
        if (day.getDay() !== t.weekday) return;
        const key = lcDateKey(day);
        lcAddToCache(LC_IDS.trash, key, {
          eventId: `trash_${t.id}_${key}`, summary: `${t.emoji} ${t.label}`,
          color: t.color, allDay: true, startDate: key, endDate: key,
        });
      });
    });
  }

  // Bills due (reuse budgetDatesInRange)
  if (showBillsOnCal && !disabledCals.has(LC_IDS.bills)) {
    budgetItems.forEach(item => {
      budgetDatesInRange(item, range.start, range.end).forEach(key => {
        // budgetDatesInRange already returns YYYY-MM-DD strings
        lcAddToCache(LC_IDS.bills, key, {
          eventId: `bill_${item.id}_${key}`, summary: `💰 ${item.name} due`,
          color: '#f5a623', allDay: true, startDate: key, endDate: key,
        });
      });
    });
  }
}

// Settings panel — populate lists
function lcOpenSettings() {
  // Birthday month/day selects
  const mSel = document.getElementById('lcBdayMonth');
  const dSel = document.getElementById('lcBdayDay');
  if (mSel && !mSel.options.length) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    mSel.innerHTML = `<option value="">Month</option>` +
      months.map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
  }
  if (dSel && !dSel.options.length) {
    dSel.innerHTML = `<option value="">Day</option>` +
      Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  }
  lcRenderBdayList();
  lcRenderMedList();
  lcRenderSchoolList();
  lcRenderTrashList();
  const billsEl = document.getElementById('lcBillsOnCal');
  if (billsEl) billsEl.checked = showBillsOnCal;
}


// ── Birthdays ──
function lcRenderBdayList() {
  const el = document.getElementById('lcBdayList');
  if (!el) return;
  if (!birthdays.length) { el.innerHTML = '<div class="lc-empty">No birthdays added yet.</div>'; return; }
  el.innerHTML = birthdays.map(b => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const date   = `${months[b.month-1]} ${b.day}${b.year ? ', '+b.year : ''}`;
    return `<div class="lc-item"><span class="lc-dot" style="background:#e91e8c"></span>
      <span class="lc-item-label">${b.name}</span>
      <span class="lc-item-meta">${date}</span>
      <button class="lc-del" onclick="lcDelBirthday('${b.id}')">✕</button></div>`;
  }).join('');
}
function lcAddBirthday() {
  const name  = document.getElementById('lcBdayName').value.trim();
  const month = parseInt(document.getElementById('lcBdayMonth').value);
  const day   = parseInt(document.getElementById('lcBdayDay').value);
  const year  = parseInt(document.getElementById('lcBdayYear').value) || null;
  if (!name || !month || !day) { alert('Enter a name, month and day.'); return; }
  birthdays.push({ id: String(Date.now()), name, month, day, year });
  localStorage.setItem('fh_birthdays', JSON.stringify(birthdays));
  document.getElementById('lcBdayName').value = '';
  document.getElementById('lcBdayMonth').value = '';
  document.getElementById('lcBdayDay').value = '';
  document.getElementById('lcBdayYear').value = '';
  lcRenderBdayList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}
function lcDelBirthday(id) {
  birthdays = birthdays.filter(b => b.id !== id);
  localStorage.setItem('fh_birthdays', JSON.stringify(birthdays));
  lcRenderBdayList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}

// ── Medications ──
function lcRenderMedList() {
  const el = document.getElementById('lcMedList');
  if (!el) return;
  if (!medications.length) { el.innerHTML = '<div class="lc-empty">No medications added yet.</div>'; return; }
  el.innerHTML = medications.map(m =>
    `<div class="lc-item"><span class="lc-dot" style="background:#4caf82"></span>
      <span class="lc-item-label">${m.name}${m.dosage ? ' · '+m.dosage : ''}</span>
      <span class="lc-item-meta">${m.time} · ${m.days}</span>
      <button class="lc-del" onclick="lcDelMedication('${m.id}')">✕</button></div>`
  ).join('');
}
function lcAddMedication() {
  const name   = document.getElementById('lcMedName').value.trim();
  const dosage = document.getElementById('lcMedDosage').value.trim();
  const time   = document.getElementById('lcMedTime').value;
  const days   = document.getElementById('lcMedDays').value;
  if (!name) { alert('Enter a medication name.'); return; }
  medications.push({ id: String(Date.now()), name, dosage, time, days });
  localStorage.setItem('fh_medications', JSON.stringify(medications));
  document.getElementById('lcMedName').value = '';
  document.getElementById('lcMedDosage').value = '';
  lcRenderMedList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}
function lcDelMedication(id) {
  medications = medications.filter(m => m.id !== id);
  localStorage.setItem('fh_medications', JSON.stringify(medications));
  lcRenderMedList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}

// ── School schedule ──
function lcRenderSchoolList() {
  const el = document.getElementById('lcSchoolList');
  if (!el) return;
  if (!schoolPeriods.length) { el.innerHTML = '<div class="lc-empty">No classes added yet.</div>'; return; }
  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  el.innerHTML = schoolPeriods.map(p =>
    `<div class="lc-item"><span class="lc-dot" style="background:${p.color}"></span>
      <span class="lc-item-label">${p.name}</span>
      <span class="lc-item-meta">${p.startTime}–${p.endTime} · ${p.days.map(d=>dayLabels[d]).join(', ')}</span>
      <button class="lc-del" onclick="lcDelSchool('${p.id}')">✕</button></div>`
  ).join('');
}
function lcAddSchoolPeriod() {
  const name  = document.getElementById('lcSchoolName').value.trim();
  const start = document.getElementById('lcSchoolStart').value;
  const end   = document.getElementById('lcSchoolEnd').value;
  const color = document.getElementById('lcSchoolColor').value;
  const days  = [...document.querySelectorAll('#lcSchoolDays input:checked')].map(i => parseInt(i.value));
  if (!name)        { alert('Enter a class name.'); return; }
  if (!days.length) { alert('Select at least one day.'); return; }
  schoolPeriods.push({ id: String(Date.now()), name, startTime: start, endTime: end, color, days });
  localStorage.setItem('fh_school', JSON.stringify(schoolPeriods));
  document.getElementById('lcSchoolName').value = '';
  lcRenderSchoolList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}
function lcDelSchool(id) {
  schoolPeriods = schoolPeriods.filter(p => p.id !== id);
  localStorage.setItem('fh_school', JSON.stringify(schoolPeriods));
  lcRenderSchoolList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}

// ── Trash & Recycling ──
function lcRenderTrashList() {
  const el = document.getElementById('lcTrashList');
  if (!el) return;
  if (!trashPickups.length) { el.innerHTML = '<div class="lc-empty">No pickups added yet.</div>'; return; }
  const dayLabels = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  el.innerHTML = trashPickups.map(t =>
    `<div class="lc-item"><span class="lc-dot" style="background:${t.color}"></span>
      <span class="lc-item-label">${t.emoji} ${t.label}</span>
      <span class="lc-item-meta">${dayLabels[t.weekday]}</span>
      <button class="lc-del" onclick="lcDelTrash('${t.id}')">✕</button></div>`
  ).join('');
}
function lcAddTrash() {
  const label   = document.getElementById('lcTrashLabel').value.trim();
  const weekday = parseInt(document.getElementById('lcTrashDay').value);
  const emoji   = document.getElementById('lcTrashEmoji').value;
  const color   = document.getElementById('lcTrashColor').value;
  if (!label) { alert('Enter a label.'); return; }
  trashPickups.push({ id: String(Date.now()), label, weekday, emoji, color });
  localStorage.setItem('fh_trash', JSON.stringify(trashPickups));
  document.getElementById('lcTrashLabel').value = '';
  lcRenderTrashList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}
function lcDelTrash(id) {
  trashPickups = trashPickups.filter(t => t.id !== id);
  localStorage.setItem('fh_trash', JSON.stringify(trashPickups));
  lcRenderTrashList();
  injectLocalEvents(); renderCurrentView(); renderCalendarTabs();
}

// ── Appearance mode ────────────────────────────────────────────
function setMobileTab(tab) {
  mobileTab = tab;
  localStorage.setItem('fh_mobileTab', tab);
  document.body.setAttribute('data-mobile-tab', tab);
  const calBtn = document.getElementById('mobileNavCal');
  const widBtn = document.getElementById('mobileNavWidgets');
  if (calBtn) calBtn.classList.toggle('active', tab === 'cal');
  if (widBtn) widBtn.classList.toggle('active', tab === 'widgets');
}

const THEME_COLORS = {
  dark:             '#0f1117',
  light:            '#f0f2f8',
  nautical:         '#1a2e52',
  aurora:           '#ede8ff',
  colorblind:       '#0d1117',
};

const EMOJI_PICKER_OPTIONS = [
  '🏠','🏡','🌟','⭐','🌈','🌻','🌺','🦋',
  '🐾','🎨','🎯','🌊','🌙','☀️','🍀','🦄',
  '🐬','🎵','💫','✨','🔮','🧩','🦁','🌿',
  '🎪','🚀','🎭','🎁','🎉','🐘','🌋','🏕️',
];

function renderEmojiPicker(selectedEmoji) {
  const grid = document.getElementById('emojiPickerGrid');
  if (!grid) return;
  grid.innerHTML = '';
  EMOJI_PICKER_OPTIONS.forEach(e => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-picker-btn' + (e === selectedEmoji ? ' selected' : '');
    btn.textContent = e;
    btn.onclick = () => {
      grid.querySelectorAll('.emoji-picker-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    grid.appendChild(btn);
  });
}

function applySafePaletteMode() {
  document.body.classList.toggle('safe-palette-on', safePaletteMode);
  document.querySelectorAll('input.lc-color').forEach(input => {
    let swatches = input.nextElementSibling;
    if (!swatches || !swatches.classList.contains('safe-swatches')) {
      swatches = document.createElement('div');
      swatches.className = 'safe-swatches';
      SAFE_COLORS.forEach(color => {
        const s = document.createElement('button');
        s.type = 'button';
        s.className = 'color-swatch';
        s.style.background = color;
        s.title = color;
        s.onclick = () => {
          input.value = color;
          swatches.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('swatch-selected'));
          s.classList.add('swatch-selected');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input',  { bubbles: true }));
        };
        swatches.appendChild(s);
      });
      input.insertAdjacentElement('afterend', swatches);
    }
    const cur = input.value.toUpperCase();
    swatches.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('swatch-selected', s.title.toUpperCase() === cur);
    });
  });
}

function applyAppTitle() {
  const el = document.querySelector('.cal-app-title');
  if (!el) return;
  const emoji = appTitleEmoji || '🏠';
  const title = appTitle.trim() || 'Family Hub';
  const parts = title.split(/\s+/);
  let textHtml;
  if (parts.length >= 2) {
    textHtml = parts.slice(0, -1).join(' ') + ' <span>' + parts[parts.length - 1] + '</span>';
  } else {
    textHtml = '<span>' + title + '</span>';
  }
  el.innerHTML = `<em class="cal-app-emoji">${emoji}</em><span class="cal-app-title-text">${textHtml}</span>`;
  document.title = title;
}

function applyAppMode(mode) {
  appMode = mode;
  document.body.classList.remove('light-mode', 'nautical-mode', 'aurora-mode', 'colorblind-mode');
  if (mode === 'light')      document.body.classList.add('light-mode');
  if (mode === 'nautical')   document.body.classList.add('nautical-mode');
  if (mode === 'aurora')     document.body.classList.add('aurora-mode');
  if (mode === 'colorblind') document.body.classList.add('colorblind-mode');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[mode] || THEME_COLORS.dark;
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
  if (!localStorage.getItem('fh_mode')) applyAppMode(e.matches ? 'light' : 'dark');
});

function applyLayoutMode(mode) {
  if (mode !== undefined) layoutMode = mode;
  document.body.classList.remove('portrait-mode', 'force-landscape', 'auto-portrait');
  if (layoutMode === 'portrait')  document.body.classList.add('portrait-mode');
  if (layoutMode === 'landscape') document.body.classList.add('force-landscape');
  // 'auto' = class toggled by orientation media query listener
  if (layoutMode === 'auto') {
    if (window.matchMedia('(orientation: portrait)').matches) {
      document.body.classList.add('auto-portrait');
    }
  }
}

// Keep auto-portrait in sync with device orientation changes
window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
  if (layoutMode === 'auto') applyLayoutMode();
});

function setAppMode(mode) {
  applyAppMode(mode);
  localStorage.setItem('fh_mode', mode);
  document.getElementById('modeLight').className          = 'btn btn-sm' + (mode === 'light'          ? ' btn-mode-active' : '');
  document.getElementById('modeDark').className           = 'btn btn-sm' + (mode === 'dark'           ? ' btn-mode-active' : '');
  document.getElementById('modeNautical').className       = 'btn btn-sm' + (mode === 'nautical'       ? ' btn-mode-active' : '');
  document.getElementById('modeAurora').className         = 'btn btn-sm' + (mode === 'aurora'         ? ' btn-mode-active' : '');
  document.getElementById('modeColorblind').className     = 'btn btn-sm' + (mode === 'colorblind'     ? ' btn-mode-active' : '');
}

// ── Focus trap ─────────────────────────────────────────────────
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let _focusTrapCleanup = null;

function trapFocus(modalEl, returnEl, onEscape) {
  if (_focusTrapCleanup) _focusTrapCleanup();
  const focusable = () => [...modalEl.querySelectorAll(FOCUSABLE)].filter(el => !el.closest('[style*="display:none"]') && el.offsetParent !== null);
  requestAnimationFrame(() => { const f = focusable()[0]; if (f) f.focus(); });
  function onKeyDown(e) {
    if (e.key === 'Escape') { if (onEscape) onEscape(); return; }
    if (e.key !== 'Tab') return;
    const els = focusable();
    if (!els.length) { e.preventDefault(); return; }
    if (e.shiftKey) { if (document.activeElement === els[0])      { e.preventDefault(); els.at(-1).focus(); } }
    else            { if (document.activeElement === els.at(-1))   { e.preventDefault(); els[0].focus(); } }
  }
  document.addEventListener('keydown', onKeyDown);
  _focusTrapCleanup = () => {
    document.removeEventListener('keydown', onKeyDown);
    _focusTrapCleanup = null;
    if (returnEl) returnEl.focus();
  };
}

function releaseFocusTrap() {
  if (_focusTrapCleanup) _focusTrapCleanup();
}

// ── Settings modal ─────────────────────────────────────────────
function switchSettingsTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.settings-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
}

function openSettings() {
  switchSettingsTab('look');   // always open on first tab
  const lmEl = document.getElementById('settingLayoutMode');
  if (lmEl) lmEl.value = layoutMode;
  document.getElementById('settingName').value          = userName;
  document.getElementById('settingAppTitle').value      = appTitle;
  renderEmojiPicker(appTitleEmoji);
  document.getElementById('settingWeatherKey').value    = weatherKey;
  document.getElementById('sunArcToggle').checked        = sunArcEnabled;
  document.getElementById('wxTickerToggle').checked     = wxTickerEnabled;
  document.getElementById('wxActivityToggle').checked   = wxActivityEnabled;
  document.getElementById('wxView5day').checked   = !!wxEnabledViews['5day'];
  document.getElementById('wxViewHourly').checked = !!wxEnabledViews['hourly'];
  document.getElementById('wxViewCurve').checked  = !!wxEnabledViews['curve'];
  document.getElementById('wxViewRadar').checked  = !!wxEnabledViews['radar'];
  document.getElementById('wxViewSnarky').checked = !!wxEnabledViews['snarky'];
  renderWeatherLocationsList();
  renderSmsContactsList();
  renderShopCategorySettings();
  document.getElementById('settingSlideInterval').value = slideInterval;
  document.getElementById('settingMealAiKey').value     = mealAiKey;
  document.getElementById('settingMealPantry').value    = mealPantryDef;
  // provider is always gemini — no UI to update
  renderNewsFeedList();
  renderStockTickerList();
  const hnc = document.getElementById('newsHeadlineCount');
  if (hnc) hnc.value = newsHeadlineCount;
  renderLoadingMsgList();
  renderFamilyMemberList();
  renderMealTemplateList();
  // Render diet checkboxes
  const dietGrid = document.getElementById('mealDietGrid');
  dietGrid.innerHTML = '';
  MEAL_DIET_OPTIONS.forEach(opt => {
    const label = document.createElement('label');
    label.className = 'meal-diet-option';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = opt;
    cb.checked = mealDietPrefs.includes(opt);
    cb.style.cssText = 'width:14px;height:14px;accent-color:var(--accent)';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(opt));
    dietGrid.appendChild(label);
  });
  // Highlight active mode button
  document.getElementById('modeLight').className          = 'btn btn-sm' + (appMode === 'light'          ? ' btn-mode-active' : '');
  document.getElementById('modeDark').className           = 'btn btn-sm' + (appMode === 'dark'           ? ' btn-mode-active' : '');
  document.getElementById('modeNautical').className       = 'btn btn-sm' + (appMode === 'nautical'       ? ' btn-mode-active' : '');
  document.getElementById('modeColorblind').className     = 'btn btn-sm' + (appMode === 'colorblind'     ? ' btn-mode-active' : '');
  renderBgPreview();
  const statusEl = document.getElementById('bgStatus');
  if (statusEl && bgPhotos.length) statusEl.textContent = `✓ ${bgPhotos.length} image(s) loaded`;
  // Calendar section visibility
  if (googleToken) {
    document.getElementById('settingCalNotSignedIn').style.display = 'none';
    document.getElementById('settingCalSignedIn').style.display = '';
    renderSettingCalList();
  } else {
    document.getElementById('settingCalNotSignedIn').style.display = '';
    document.getElementById('settingCalSignedIn').style.display = 'none';
  }
  renderIcsSubList();
  renderCountdownSettingList();
  populateCountdownEventPicker();
  // Widget visibility checkboxes + placement radios
  Object.keys(WIDGET_DEFAULTS).forEach(key => {
    const cb = document.getElementById('widget_' + key);
    if (cb) cb.checked = widgetVisibility[key];
    const placement = widgetPlacement[key] || WIDGET_PLACEMENT_DEFAULTS[key] || 'sidebar';
    const radio = document.querySelector(`input[name="placement_${key}"][value="${placement}"]`);
    if (radio) radio.checked = true;
  });
  lcOpenSettings();
  document.getElementById('safePaletteToggle').checked = safePaletteMode;
  document.querySelector(`input[name="assistantWelcome"][value="${assistantWelcomeMode}"]`).checked = true;
  document.getElementById('settingsModal').style.display = 'flex';
  applySafePaletteMode();
  trapFocus(document.querySelector('#settingsModal .modal'), document.getElementById('settingsBtn'), closeSettings);
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
  releaseFocusTrap();
}

function saveSettings() {
  userName      = document.getElementById('settingName').value.trim() || 'Someone';
  appTitle      = document.getElementById('settingAppTitle').value.trim() || 'Family Hub';
  localStorage.setItem('fh_appTitle', appTitle);
  const selEmoji = document.querySelector('#emojiPickerGrid .emoji-picker-btn.selected');
  if (selEmoji) { appTitleEmoji = selEmoji.textContent; localStorage.setItem('fh_appTitleEmoji', appTitleEmoji); }
  applyAppTitle();
  weatherKey    = document.getElementById('settingWeatherKey').value.trim();
  sunArcEnabled     = document.getElementById('sunArcToggle').checked;
  wxTickerEnabled   = document.getElementById('wxTickerToggle').checked;
  wxActivityEnabled = document.getElementById('wxActivityToggle').checked;
  wxEnabledViews = {
    '5day':   document.getElementById('wxView5day').checked,
    'hourly': document.getElementById('wxViewHourly').checked,
    'curve':  document.getElementById('wxViewCurve').checked,
    'radar':  document.getElementById('wxViewRadar').checked,
    'snarky': document.getElementById('wxViewSnarky').checked,
  };
  localStorage.setItem('fh_sunArc',        JSON.stringify(sunArcEnabled));
  localStorage.setItem('fh_wxTicker',      JSON.stringify(wxTickerEnabled));
  localStorage.setItem('fh_wxActivity',    JSON.stringify(wxActivityEnabled));
  localStorage.setItem('fh_wxEnabledViews', JSON.stringify(wxEnabledViews));
  applyWxViewToggles();
  safePaletteMode = document.getElementById('safePaletteToggle').checked;
  localStorage.setItem('fh_safePalette', JSON.stringify(safePaletteMode));
  applySafePaletteMode();
  const welcomeRadio = document.querySelector('input[name="assistantWelcome"]:checked');
  if (welcomeRadio) {
    assistantWelcomeMode = welcomeRadio.value;
    localStorage.setItem('fh_assistantWelcome', assistantWelcomeMode);
    renderAssistantMessages();
  }
  // smsContacts and familyMembers saved immediately on add/remove — nothing to save here
  slideInterval = parseInt(document.getElementById('settingSlideInterval').value) || 30;
  mealAiKey     = document.getElementById('settingMealAiKey').value.trim();
  mealPantryDef = document.getElementById('settingMealPantry').value.trim();
  mealDietPrefs = Array.from(document.querySelectorAll('#mealDietGrid input:checked')).map(cb => cb.value);
  localStorage.setItem('fh_name',          userName);
  localStorage.setItem('fh_wkey',          weatherKey);
  localStorage.setItem('fh_slideInterval', String(slideInterval));
  localStorage.setItem('fh_mealAiKey',      mealAiKey);
  localStorage.setItem('fh_mealAiProvider', mealAiProvider);
  localStorage.setItem('fh_mealPantry',    mealPantryDef);
  localStorage.setItem('fh_mealDietPrefs', JSON.stringify(mealDietPrefs));
  localStorage.setItem('fh_mealLoadingMsgs', JSON.stringify(mealLoadingMsgs));
  // Widget visibility + placement
  Object.keys(WIDGET_DEFAULTS).forEach(key => {
    const cb = document.getElementById('widget_' + key);
    if (cb) widgetVisibility[key] = cb.checked;
    const radio = document.querySelector(`input[name="placement_${key}"]:checked`);
    if (radio) widgetPlacement[key] = radio.value;
  });
  localStorage.setItem('fh_widgets',          JSON.stringify(widgetVisibility));
  localStorage.setItem('fh_widget_placement', JSON.stringify(widgetPlacement));
  applyWidgetPlacement();
  const hncEl = document.getElementById('newsHeadlineCount');
  if (hncEl) { newsHeadlineCount = parseInt(hncEl.value) || 5; saveNewsFeeds(); }
  if (widgetVisibility.news)  loadNewsFeeds();
  if (widgetVisibility.stock) loadStockQuotes();
  // Save layout orientation mode
  const lmSaveEl = document.getElementById('settingLayoutMode');
  if (lmSaveEl) { layoutMode = lmSaveEl.value; localStorage.setItem('fh_layoutMode', layoutMode); applyLayoutMode(); }
  // Save bills-on-cal toggle
  const billsEl = document.getElementById('lcBillsOnCal');
  if (billsEl) {
    showBillsOnCal = billsEl.checked;
    localStorage.setItem('fh_bills_on_cal', JSON.stringify(showBillsOnCal));
  }
  closeSettings();
  injectLocalEvents();
  renderCurrentView();
  renderCalendarTabs();
  if (weatherKey && weatherLocations.length) showWeatherLocation(weatherLocIdx);
  if (bgPhotos.length) startSlideshow(); // restart with updated interval
}

// ── Background image slideshow (local files via IndexedDB) ────
const BG_DB_NAME    = 'fh_bgImages';
const BG_DB_VERSION = 1;
const BG_STORE_NAME = 'images';

let bgDb       = null;
let bgPhotos   = [];   // object URLs for the current session
let bgIndex    = 0;
let bgTimer    = null;
let slideInterval = parseInt(localStorage.getItem('fh_slideInterval')) || 30;

function openBgDb() {
  return new Promise((resolve, reject) => {
    if (bgDb) { resolve(bgDb); return; }
    const req = indexedDB.open(BG_DB_NAME, BG_DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(BG_STORE_NAME, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => { bgDb = e.target.result; resolve(bgDb); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function loadBgFromDb() {
  try {
    const db  = await openBgDb();
    const all = await new Promise((res, rej) => {
      const req = db.transaction(BG_STORE_NAME, 'readonly').objectStore(BG_STORE_NAME).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    if (!all.length) return;
    bgPhotos = all.map(r => URL.createObjectURL(new Blob([r.data], { type: r.type })));
    renderBgPreview();
    startSlideshow();
  } catch(e) { console.warn('loadBgFromDb', e); }
}

function handleBgFiles(files) {
  if (!files || !files.length) return;
  saveBgFiles(Array.from(files));
}

function handleBgDrop(e) {
  e.preventDefault();
  document.getElementById('bgDropZone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) saveBgFiles(files);
}

async function saveBgFiles(files) {
  document.getElementById('bgStatus').textContent = `Loading ${files.length} image(s)…`;
  try {
    const db = await openBgDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(BG_STORE_NAME, 'readwrite');
      tx.objectStore(BG_STORE_NAME).clear();
      tx.oncomplete = res; tx.onerror = rej;
    });
    const blobs = await Promise.all(files.map(f => f.arrayBuffer().then(buf => ({ type: f.type, data: buf }))));
    await new Promise((res, rej) => {
      const tx    = db.transaction(BG_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BG_STORE_NAME);
      blobs.forEach(b => store.add(b));
      tx.oncomplete = res; tx.onerror = rej;
    });
    bgPhotos.forEach(u => URL.revokeObjectURL(u));
    bgPhotos = blobs.map(b => URL.createObjectURL(new Blob([b.data], { type: b.type })));
    for (let i = bgPhotos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bgPhotos[i], bgPhotos[j]] = [bgPhotos[j], bgPhotos[i]];
    }
    renderBgPreview();
    document.getElementById('bgStatus').textContent = `✓ ${bgPhotos.length} image(s) loaded`;
    startSlideshow();
  } catch(e) {
    console.error('saveBgFiles', e);
    document.getElementById('bgStatus').textContent = 'Error: ' + e.message;
  }
}

function renderBgPreview() {
  const strip = document.getElementById('bgPreviewStrip');
  if (!strip) return;
  strip.innerHTML = '';
  const show = Math.min(bgPhotos.length, 7);
  for (let i = 0; i < show; i++) {
    const img = document.createElement('img');
    img.className = 'bg-thumb';
    img.src = bgPhotos[i];
    strip.appendChild(img);
  }
  if (bgPhotos.length > 7) {
    const more = document.createElement('div');
    more.className = 'bg-thumb-more';
    more.textContent = `+${bgPhotos.length - 7}`;
    strip.appendChild(more);
  }
}

async function clearBgImages() {
  if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
  bgPhotos.forEach(u => URL.revokeObjectURL(u));
  bgPhotos = [];
  document.body.classList.remove('has-bg');
  const el = document.getElementById('bgPhoto');
  el.classList.remove('visible');
  setTimeout(() => { el.style.backgroundImage = ''; }, 400);
  const strip = document.getElementById('bgPreviewStrip');
  if (strip) strip.innerHTML = '';
  const status = document.getElementById('bgStatus');
  if (status) status.textContent = 'Background cleared.';
  try {
    const db = await openBgDb();
    const tx = db.transaction(BG_STORE_NAME, 'readwrite');
    tx.objectStore(BG_STORE_NAME).clear();
  } catch(e) { console.warn('clearBgImages', e); }
}

// ── Google Photos Picker API ───────────────────────────────────
async function openPhotosPicker() {
  const statusEl = document.getElementById('bgStatus');

  if (!googleToken) {
    statusEl.textContent = '⚠️ Sign in with Google first, then try again.';
    return;
  }

  statusEl.textContent = 'Creating Google Photos session…';
  document.getElementById('photosPickerBtn').disabled = true;

  try {
    // ── 1. Create a picker session ──────────────────────────────
    const sessionResp = await fetch('https://photospicker.googleapis.com/v1/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!sessionResp.ok) {
      const err = await sessionResp.json().catch(() => ({}));
      const msg = err?.error?.message || sessionResp.statusText;
      if (sessionResp.status === 403) {
        statusEl.textContent = '🔄 Re-authorising for Photos access…';
        document.getElementById('photosPickerBtn').disabled = false;
        tokenClient.requestAccessToken({ prompt: 'consent' });
        return;
      }
      throw new Error(`Session error ${sessionResp.status}: ${msg}`);
    }

    const session   = await sessionResp.json();
    const sessionId = session.id;
    const pickerUri = session.pickerUri;
    console.log('[Photos] Session created:', sessionId, session);

    // ── 2. Open the picker popup ────────────────────────────────
    const popup = window.open(pickerUri, 'googlePhotosPicker',
      'width=1000,height=720,resizable=yes,scrollbars=yes');

    if (!popup) {
      throw new Error('Popup blocked — please allow pop-ups for this page and try again.');
    }

    statusEl.textContent = '📷 Select photos, click Done in the picker, then wait…';

    // ── 3. Poll until mediaItemsSet = true ───────────────────────
    // The picker sets mediaItemsSet server-side after the user confirms.
    // The popup may close before or after this happens, so we keep polling
    // for up to 30 s after the popup closes rather than stopping immediately.
    const startedAt = Date.now();
    let popupClosedAt = null;

    await new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        const elapsed = Date.now() - startedAt;

        // Hard 5-minute timeout
        if (elapsed > 300_000) {
          clearInterval(timer);
          if (!popup.closed) popup.close();
          reject(new Error('Timed out waiting for photo selection.'));
          return;
        }

        // If popup closed, give it 30 extra seconds then give up
        if (popup.closed && !popupClosedAt) popupClosedAt = Date.now();
        if (popupClosedAt && Date.now() - popupClosedAt > 30_000) {
          clearInterval(timer);
          reject(new Error('Picker closed before a selection was confirmed. Please try again and click the Done/Select button inside the picker.'));
          return;
        }

        try {
          const pollResp = await fetch(
            `https://photospicker.googleapis.com/v1/sessions/${sessionId}`,
            { headers: { Authorization: `Bearer ${googleToken}` } }
          );
          if (!pollResp.ok) return;
          const pollData = await pollResp.json();
          console.log('[Photos] Poll:', pollData.mediaItemsSet, pollData);

          if (pollData.mediaItemsSet) {
            clearInterval(timer);
            if (!popup.closed) popup.close();
            resolve();
          }
        } catch (_) { /* network blip */ }
      }, 2000);
    });

    // ── 4. Fetch the selected media items ───────────────────────
    statusEl.textContent = 'Fetching selected photos…';
    const itemsResp = await fetch(
      `https://photospicker.googleapis.com/v1/mediaItems?sessionId=${sessionId}&pageSize=100`,
      { headers: { Authorization: `Bearer ${googleToken}` } }
    );
    if (!itemsResp.ok) {
      const err = await itemsResp.json().catch(() => ({}));
      throw new Error('Could not fetch items: ' + (err?.error?.message || itemsResp.statusText));
    }
    const itemsData  = await itemsResp.json();
    const mediaItems = itemsData.mediaItems || [];
    console.log('[Photos] Media items:', mediaItems);

    if (!mediaItems.length) {
      statusEl.textContent = 'No photos were returned.';
      document.getElementById('photosPickerBtn').disabled = false;
      return;
    }

    // ── 5. Download each photo as a blob ────────────────────────
    statusEl.textContent = `Downloading ${mediaItems.length} photo(s)…`;
    const blobs = [];
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      statusEl.textContent = `Downloading photo ${i + 1} of ${mediaItems.length}…`;
      try {
        // baseUrl needs a size suffix; =w2048 gives a high-res download
        const baseUrl = item.mediaFile?.baseUrl;
        if (!baseUrl) { console.warn('[Photos] No baseUrl on item', item); continue; }
        const url = baseUrl + '=w2048';
        console.log('[Photos] Downloading', url);
        const r = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
        console.log('[Photos] Download response', r.status, r.headers.get('content-type'));
        if (!r.ok) { console.warn('[Photos] Download failed', r.status, url); continue; }
        const contentType = r.headers.get('content-type') || 'image/jpeg';
        const buf = await r.arrayBuffer();
        blobs.push({ type: contentType, data: buf });
      } catch (dlErr) {
        console.error('[Photos] Download error for item', item, dlErr);
      }
    }

    if (!blobs.length) {
      throw new Error('Downloaded 0 of ' + mediaItems.length + ' photo(s). Check the browser console (F12) for details.');
    }

    // ── 6. Persist to IndexedDB ─────────────────────────────────
    statusEl.textContent = 'Saving to local storage…';
    const idb = await openBgDb();
    await new Promise((res, rej) => {
      const tx = idb.transaction(BG_STORE_NAME, 'readwrite');
      tx.objectStore(BG_STORE_NAME).clear();
      tx.oncomplete = res; tx.onerror = rej;
    });
    await new Promise((res, rej) => {
      const tx    = idb.transaction(BG_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BG_STORE_NAME);
      blobs.forEach(b => store.add(b));
      tx.oncomplete = res; tx.onerror = rej;
    });

    // Revoke old URLs, build new ones, shuffle
    bgPhotos.forEach(u => URL.revokeObjectURL(u));
    bgPhotos = blobs.map(b => URL.createObjectURL(new Blob([b.data], { type: b.type })));
    for (let i = bgPhotos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bgPhotos[i], bgPhotos[j]] = [bgPhotos[j], bgPhotos[i]];
    }

    renderBgPreview();
    statusEl.textContent = `✓ ${bgPhotos.length} photo(s) loaded from Google Photos`;
    startSlideshow();

  } catch (e) {
    console.error('[Photos] openPhotosPicker error:', e);
    statusEl.textContent = '⚠️ ' + e.message;
  } finally {
    document.getElementById('photosPickerBtn').disabled = false;
  }
}

function startSlideshow() {
  if (bgTimer) clearInterval(bgTimer);
  if (!bgPhotos.length) return;
  bgIndex = 0;
  showBgPhoto(bgPhotos[bgIndex]);
  bgTimer = setInterval(() => {
    bgIndex = (bgIndex + 1) % bgPhotos.length;
    showBgPhoto(bgPhotos[bgIndex]);
  }, slideInterval * 1000);
}

function showBgPhoto(url) {
  const el = document.getElementById('bgPhoto');
  el.classList.remove('visible');
  setTimeout(() => {
    el.style.backgroundImage = `url("${url}")`;
    el.classList.add('visible');
    document.body.classList.add('has-bg');
  }, 300);
}

