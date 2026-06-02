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
let userName        = localStorage.getItem('fh_name') || 'Someone';
let familyMembers   = lsGet('fh_familyMembers', []);
// each: { name: string }
let todoItems       = []; // in-memory mirror of Firestore 'todo' collection for calendar use
// Migrate old 'amazing' mode name to 'nautical'
if (localStorage.getItem('fh_mode') === 'amazing') localStorage.setItem('fh_mode', 'nautical');
let appMode         = localStorage.getItem('fh_mode') || 'dark';   // 'light' | 'dark' | 'nautical'
let mobileTab       = localStorage.getItem('fh_mobileTab') || 'cal';  // 'cal' | 'widgets'
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
// ── Family Assistant state ─────────────────────────────────────────────────
let assistantHistory  = [];   // [{role:'user'|'model', parts:[{text}]}]
let shopItemsCache    = [];   // in-memory mirror of shopping items for context
let assistantRecognition = null;  // SpeechRecognition instance
let assistantListening   = false; // true while mic is open
// ── Widget visibility & placement ────────────────────────────────────────────
const WIDGET_DEFAULTS = { shopping: true, todo: true, budget: true, wotd: true, quote: true, dadjoke: true, yearstrip: true, assistant: true };
let widgetVisibility = { ...WIDGET_DEFAULTS, ...lsGet('fh_widgets', {}) };

// Placement: 'sidebar' (right column) or 'bottom' (full-width strip below layout)
const WIDGET_PLACEMENT_DEFAULTS = {
  shopping: 'sidebar', todo: 'sidebar', budget: 'sidebar',
  wotd: 'sidebar', quote: 'sidebar', dadjoke: 'sidebar',
  yearstrip: 'bottom', assistant: 'sidebar'
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
];

/** Move widget cards between sidebar and #bottomStrip, then enforce visibility */
function applyWidgetPlacement() {
  const sidebar     = document.querySelector('.sidebar');
  const bottomStrip = document.getElementById('bottomStrip');
  if (!sidebar || !bottomStrip) return;

  // Distribute each widget card to the right container (maintains canonical order within each)
  WIDGET_ORDER.forEach(({ key, id }) => {
    const card = document.getElementById(id);
    if (!card) return;
    const dest = widgetPlacement[key] === 'bottom' ? bottomStrip : sidebar;
    dest.appendChild(card);
  });

  // #yearStrip always lives in .cal-column (in HTML); #bottomStrip also lives there.
  // yearstrip placement controls whether #yearStrip or #yearCard is shown — handled by applyWidgetVisibility.

  // Enforce show/hide
  applyWidgetVisibility();

  // Show/hide the bottom strip container itself
  const hasBottom = bottomStrip.children.length > 0 &&
    [...bottomStrip.children].some(c => c.style.display !== 'none');
  bottomStrip.style.display = hasBottom ? '' : 'none';
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

  // ── Budget total sidebar card (month + week only) ──
  const totalCard  = document.getElementById('budgetTotalCard');
  const totalInner = document.getElementById('budgetTotalInner');
  if (totalCard && totalInner) {
    const showTotal = (calView === 'month' || calView === 'week') && upcoming.length > 0;
    if (showTotal) {
      const total = upcoming.reduce((s, { item }) => s + item.amount, 0);
      totalInner.innerHTML = `
        <span class="budget-total-label">${esc(summaryTitle)}</span>
        <span class="budget-total-amount">${fmt$(total)}</span>`;
      totalCard.style.display = '';
    } else {
      totalCard.style.display = 'none';
    }
  }

  // Hide main budget card if no items for this period
  if (!budgetItems.length || !upcoming.length) {
    card.style.display = 'none';
    return;
  }
  // Restore visibility if widget is enabled
  if (widgetVisibility.budget) card.style.display = '';

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

  // ── Summary bar ──
  const total = upcoming.reduce((s, { item }) => s + item.amount, 0);
  const bar = document.createElement('div');
  bar.className = 'budget-summary-bar';
  bar.innerHTML = `<span class="budget-summary-label">${esc(summaryTitle)}</span>
                   <span class="budget-summary-amount">${fmt$(total)}</span>`;
  body.appendChild(bar);

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

// ── Google Sign-In ─────────────────────────────────────────────
let tokenClient;
let gsiReady = false;

// Called by the GSI script once it has loaded
function onGsiLoad() {
  gsiReady = true;
  initGoogleAuth();
}

window.addEventListener('load', () => {
  if (!isConfigured) return;
  // GSI may already be ready (cached) or will call onGsiLoad when it loads
  if (typeof google !== 'undefined' && google.accounts) {
    gsiReady = true;
    initGoogleAuth();
  }
  applyAppMode(appMode);
  setMobileTab(mobileTab);
  if (weatherLocations.length) showWeatherLocation(0);
  else if (weatherCity) { weatherLocations = [weatherCity]; showWeatherLocation(0); }
  switchCalView(calView);   // sets up tabs + renders the right view
  renderYearStrip();
  setupCalSwipe();
  setupListeners();
  loadBgFromDb();
  populateTodoAssigneeDropdown();
  applyWidgetPlacement();   // moves cards to sidebar/bottom, then calls applyWidgetVisibility
  renderBudgetCard();
  loadWotd();
  loadDadJoke();
  loadQuote();
  initAssistantVoice();
  // Close SMS popover on outside click
  document.addEventListener('click', e => {
    const pop = document.getElementById('smsPopover');
    if (pop && !pop.contains(e.target) && e.target.id !== 'smsTriggerBtn')
      pop.style.display = 'none';
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
  firebase.auth().signOut().catch(() => {});  // sign out of Firebase Auth too
  currentUser = null; googleToken = null;
  localStorage.removeItem('fh_user');
  document.getElementById('signInBtn').style.display = '';
  document.getElementById('signOutBtn').style.display = 'none';
  document.getElementById('userInfo').textContent = '';
  document.getElementById('calNotSignedIn').style.display = '';
  const calCard = document.getElementById('calendarCard');
  if (calCard) calCard.style.display = 'none';
  document.getElementById('calendarTabs').innerHTML = '';
  // Clear all events and reset visibility state
  calEventCache = {};
  disabledCals.clear();
  renderCurrentView();
  renderYearStrip();
}

function onSignedIn() {
  document.getElementById('signInBtn').style.display = 'none';
  document.getElementById('signOutBtn').style.display = '';
  document.getElementById('userInfo').textContent = currentUser.name;
  document.getElementById('calNotSignedIn').style.display = 'none';
  // Reveal calendar section in settings
  document.getElementById('settingCalNotSignedIn').style.display = 'none';
  document.getElementById('settingCalSignedIn').style.display = '';
  renderSettingCalList();
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
  document.getElementById('calGrid').style.display      = calView === 'month'  ? ''     : 'none';
  document.getElementById('weekView').style.display     = calView === 'week'   ? 'flex' : 'none';
  document.getElementById('dayView').style.display      = calView === 'day'    ? 'flex' : 'none';
  document.getElementById('agendaView').style.display   = calView === 'agenda' ? 'flex' : 'none';
  if (calView === 'month')  renderMonthGrid();
  if (calView === 'week')   renderWeekGrid();
  if (calView === 'day')    renderDayGrid();
  if (calView === 'agenda') renderAgendaView();
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
      hdr.onclick = () => openEventEditor(null, dateKey);
    }
    col.appendChild(hdr);

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
        }
        body.appendChild(pill);
      });
    }

    col.appendChild(body);

    // ── Meal strip (footer) ──
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
        item.onclick = () => openMealModal(dateKey, t);

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

    // To-Do due on this day
    const weekTodos = todosDueOnDate(dateKey);
    if (weekTodos.length) {
      const todoStrip = document.createElement('div');
      todoStrip.style.cssText = 'border-top:1px solid rgba(108,142,245,.2);padding:4px 5px 5px;background:rgba(108,142,245,.06)';
      weekTodos.forEach(todo => {
        const el = document.createElement('div');
        el.style.cssText = 'font-size:.62rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 3px';
        el.textContent = '✅ ' + todo.text + (todo.assignedTo ? ' · ' + todo.assignedTo : '');
        el.title = todo.text;
        todoStrip.appendChild(el);
      });
      col.appendChild(todoStrip);
    }

    grid.appendChild(col);
  }
  container.appendChild(grid);

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

  // ── Meal Planning section ──
  const mealsSection = document.createElement('div');
  mealsSection.className = 'day-meals-section';
  const mealsHdr = document.createElement('div');
  mealsHdr.className = 'day-meals-header';
  mealsHdr.innerHTML = '<span>🍽 Meal Plan</span>';
  const suggestAllBtn = document.createElement('button');
  suggestAllBtn.className = 'btn btn-sm';
  suggestAllBtn.style.cssText = 'background:var(--surface2);font-size:.74rem;padding:3px 10px';
  suggestAllBtn.textContent = '✨ Suggest';
  suggestAllBtn.onclick = () => openMealModal(dateKey, 'all');
  mealsHdr.appendChild(suggestAllBtn);
  mealsSection.appendChild(mealsHdr);
  const mealsGrid = document.createElement('div');
  mealsGrid.className = 'day-meals-grid';
  const MEAL_ICONS = { breakfast:'🌅', lunch:'☀️', dinner:'🌙' };
  const MEAL_LABELS = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner' };
  ['breakfast','lunch','dinner'].forEach(type => {
    const meal = (mealPlan[dateKey] || {})[type];
    const slot = document.createElement('div');
    slot.className = 'day-meal-slot' + (meal ? ' has-meal' : '');
    slot.onclick = () => openMealModal(dateKey, type);
    if (meal) {
      const recipeLink = meal.recipeUrl
        ? `<a class="day-meal-slot-link" href="${safeUrl(meal.recipeUrl)}" target="_blank" onclick="event.stopPropagation()">📖 Recipe ↗</a>`
        : '';
      slot.innerHTML = `
        <button class="meal-remove-btn day-meal-remove-btn" title="Remove meal"
                onclick="event.stopPropagation();removeMeal('${dateKey}','${type}')">×</button>
        <div class="day-meal-slot-label">${MEAL_ICONS[type]} ${MEAL_LABELS[type]}</div>
        <div class="day-meal-slot-name">${esc(meal.name)}</div>${recipeLink}`;
    } else {
      slot.innerHTML = `<div class="day-meal-slot-label">${MEAL_ICONS[type]} ${MEAL_LABELS[type]}</div>
                        <div class="day-meal-empty">+ suggest</div>`;
    }
    mealsGrid.appendChild(slot);
  });
  mealsSection.appendChild(mealsGrid);
  wrap.appendChild(mealsSection);

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
  const hourBuckets = {};
  timedEvts.forEach(ev => {
    const h = new Date(ev.startDT).getHours();
    (hourBuckets[h] || (hourBuckets[h] = [])).push(ev);
  });

  const timeline = document.createElement('div');
  timeline.className = 'day-timeline';

  for (let h = 6; h <= 22; h++) {
    const row   = document.createElement('div');
    row.className = 'day-hour-row';

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

    // Click on empty hour slot to create event
    if (googleToken && !(hourBuckets[h] || []).length) {
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

function renderMonthGrid() {
  const year  = calViewDate.getFullYear();
  const month = calViewDate.getMonth();

  document.getElementById('calMonthLabel').textContent =
    calViewDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // Day-of-week headers
  DOW_LABELS.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const today = new Date();

  // Prev-month filler
  for (let i = firstDay - 1; i >= 0; i--) {
    grid.appendChild(makeDayCell(year, month - 1, daysInPrev - i, true));
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    grid.appendChild(makeDayCell(year, month, d, false, isToday));
  }
  // Next-month filler
  const total = firstDay + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= trailing; d++) {
    grid.appendChild(makeDayCell(year, month + 1, d, true));
  }

}

function makeDayCell(year, month, day, otherMonth, isToday) {
  const cell = document.createElement('div');
  cell.className = 'cal-day' + (otherMonth ? ' other-month' : '') + (isToday ? ' today' : '');

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
  const evts = Object.entries(calEventCache)
    .filter(([calId]) => !disabledCals.has(calId))
    .flatMap(([, byDate]) => byDate[key] || []);
  // Cell-level click opens new event editor
  if (!otherMonth && googleToken) {
    cell.style.cursor = 'pointer';
    cell.onclick = () => openEventEditor(null, key);
  }

  evts.slice(0, 3).forEach(ev => {
    const pill = document.createElement('div');
    const isMultiDay = ev.allDay && ev.startDate && ev.endDate && ev.endDate > ev.startDate;
    let spanClass = '';
    if (isMultiDay) {
      // Last date in range is endDate - 1 day
      const lastKey = new Date(new Date(ev.endDate + 'T00:00:00').getTime() - 86400000)
        .toISOString().slice(0, 10);
      if (key === ev.startDate && key === lastKey) spanClass = ''; // single-day fallback
      else if (key === ev.startDate) spanClass = 'cal-event-span-start';
      else if (key === lastKey)      spanClass = 'cal-event-span-end';
      else                           spanClass = 'cal-event-span-mid';
    }
    pill.className = 'cal-event' + (ev.holiday ? ' cal-event-holiday' : '') + (spanClass ? ' ' + spanClass : '');
    pill.style.background = ev.color;
    // Only show text on start day (or non-spanning events)
    if (!isMultiDay || key === ev.startDate) {
      pill.textContent = (ev.holiday ? '🎉 ' : '') + ev.summary;
    }
    pill.title = ev.summary;
    if (!ev.holiday && ev.eventId) {
      pill.onclick = e => { e.stopPropagation(); openEventEditor(ev); };
    }
    cell.appendChild(pill);
  });
  if (evts.length > 3) {
    const more = document.createElement('div');
    more.style.cssText = 'font-size:.65rem;color:var(--muted);padding-left:4px';
    more.textContent = `+${evts.length - 3} more`;
    cell.appendChild(more);
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
        if (data.items) cacheEvents(HOLIDAYS_ID, data.items, '#e8a838', true);
      } catch(e) { console.warn('Holidays error', e); }
    })());
  }

  await Promise.all(fetches);

  renderCalendarTabs();
  renderCurrentView();
  renderYearStrip();
  document.getElementById('calendarStatus').textContent = '';
}

// ── Agenda View ──
function renderAgendaView() {
  const el = document.getElementById('agendaView');
  if (!el) return;
  el.innerHTML = '';

  const start = new Date(calViewDate + 'T00:00:00');
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
  const card = document.getElementById('calendarCard');
  if (!tabs || !card) return;

  tabs.innerHTML = '';

  const all = [...calendarMeta];
  if (showHolidays) all.push({ id: HOLIDAYS_ID, label: 'Holidays', color: '#e8a838' });

  if (!all.length) {
    card.style.display = '';
    tabs.innerHTML = `<div style="color:var(--muted);font-size:var(--text-xs);padding:6px 0;text-align:center">
      ${googleToken ? 'No calendars found' : 'Sign in to see your calendars'}
    </div>`;
    return;
  }
  card.style.display = '';

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

    // Color swatch + hidden color input
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

    // Label input
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cal-label-input';
    labelInput.value = label;
    labelInput.placeholder = id === 'primary' ? 'My Calendar' : id.split('@')[0];
    labelInput.oninput = e => {
      calendarMeta[i].label = e.target.value;
      saveCalendarMeta();
      renderCalendarTabs();
    };

    // ID display
    const idSpan = document.createElement('span');
    idSpan.className = 'cal-id-display';
    idSpan.textContent = id === 'primary' ? 'primary' : id;
    idSpan.title = id;

    // Remove button (hidden when only one calendar)
    const removeBtn = document.createElement('button');
    removeBtn.className = 'cal-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    if (calendarMeta.length === 1) removeBtn.style.visibility = 'hidden';
    removeBtn.onclick = () => removeCalendar(id);

    li.appendChild(colorWrap);
    li.appendChild(labelInput);
    li.appendChild(idSpan);
    li.appendChild(removeBtn);
    ul.appendChild(li);
  });

  // Sync holidays toggle
  const toggle = document.getElementById('holidaysToggle');
  if (toggle) toggle.checked = showHolidays;
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
  setTimeout(() => document.getElementById('evtEdTitle').focus(), 50);
}

function closeEventEditor() {
  document.getElementById('eventEditorModal').style.display = 'none';
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
    lbl.className = 'mini-month-label year-card-month-label';
    lbl.textContent = ref.toLocaleDateString([], { month: 'long', year: 'numeric' });
    card.appendChild(lbl);

    // Mini grid
    const mg = document.createElement('div');
    mg.className = 'mini-cal-grid year-card-cal-grid';

    ['S','M','T','W','T','F','S'].forEach(d => {
      const dh = document.createElement('div');
      dh.className = 'mini-dow';
      dh.textContent = d;
      mg.appendChild(dh);
    });

    const firstDay    = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const daysInPrev  = new Date(year, m, 0).getDate();

    for (let i = firstDay - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'mini-day year-card-day';
      cell.textContent = daysInPrev - i;
      mg.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = year === today.getFullYear() && m === today.getMonth() && d === today.getDate();
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

      mg.appendChild(wrap);
    }

    const total    = firstDay + daysInMonth;
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= trailing; d++) {
      const cell = document.createElement('div');
      cell.className = 'mini-day year-card-day';
      cell.textContent = d;
      mg.appendChild(cell);
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
  const nav = document.getElementById('wxLocNav');
  const dotsEl = document.getElementById('wxLocDots');
  if (!nav || !dotsEl) return;
  const n = weatherLocations.length;
  nav.style.display = n > 1 ? 'flex' : 'none';
  dotsEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const dot = document.createElement('button');
    dot.className = 'wx-loc-dot' + (i === weatherLocIdx ? ' active' : '');
    dot.title = weatherLocations[i];
    dot.onclick = () => showWeatherLocation(i);
    dotsEl.appendChild(dot);
  }
}

async function loadWeatherByCity(city) {
  const key = weatherKey;
  if (!key) {
    document.getElementById('weatherSetup').style.display = '';
    document.getElementById('weatherDisplay').style.display = 'none';
    document.getElementById('cityInput').value = city;
    document.getElementById('cityInput').placeholder = 'Enter city, then add API key in ⚙️ Settings';
    return;
  }

  try {
    const [curR, fcastR] = await Promise.all([
      fetch(`${OWM_API_BASE}/weather?q=${encodeURIComponent(city)}&appid=${key}&units=imperial`),
      fetch(`${OWM_API_BASE}/forecast?q=${encodeURIComponent(city)}&appid=${key}&units=imperial&cnt=56`)
    ]);
    const cur   = await curR.json();
    const fcast = await fcastR.json();

    if (cur.cod !== 200) { alert('Weather error: ' + cur.message); return; }

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

    const data = {
      label:         cur.name + ', ' + cur.sys.country,
      icon:          cur.weather[0].main,
      temp:          Math.round(cur.main.temp),
      desc:          cur.weather[0].description,
      hi:            Math.round(todayHi),
      lo:            Math.round(todayLo),
      rain:          todayRainPct,
      rainStartTime: (todayRainPct >= 30 && rainStartTime) ? rainStartTime : null,
      days:          Object.entries(dayMap).sort(([a],[b]) => a < b ? -1 : 1).slice(0, 5)
    };

    weatherCache[city.toLowerCase().trim()] = { ts: Date.now(), data };
    renderWeatherData(data);

  } catch(e) {
    console.error(e);
    alert('Could not load weather. Check your API key in Settings.');
  }
}

function renderWeatherData(data) {
  document.getElementById('wIcon').textContent  = WX_ICONS[data.icon] || '🌡';
  document.getElementById('wTemp').textContent  = data.temp + '°F';
  document.getElementById('wDesc').textContent  = data.desc;
  document.getElementById('weatherCity').textContent = '📍 ' + data.label;
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

  const fcastEl = document.getElementById('wForecast');
  fcastEl.innerHTML = '';
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

  document.getElementById('weatherSetup').style.display  = 'none';
  document.getElementById('weatherDisplay').style.display = 'block';
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
  db.collection('familyMembers').orderBy('name').onSnapshot(snap => {
    familyMembers = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
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
  // Shopping list only (todo now uses renderTodoList)
  if (collection === 'shopping') shopItemsCache = docs.map(doc => doc.data());
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
  const ulId    = col === 'todo' ? 'todoList' : 'shopList';
  const emptyId = col === 'todo' ? 'todoEmpty' : 'shopEmpty';
  const items   = getLocalList(col);
  if (col === 'shopping') shopItemsCache = items;
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
      badge.textContent = '📅 ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
function renderFamilyMemberList() {
  const el = document.getElementById('familyMemberList');
  if (!el) return;
  el.innerHTML = '';
  if (!familyMembers.length) {
    el.innerHTML = '<div style="font-size:.82rem;color:var(--muted);padding:4px 0">No members yet.</div>';
  } else {
    familyMembers.forEach((m, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:8px;padding:6px 10px;font-size:.84rem;margin-bottom:6px';
      const removeArg = db ? `'${m.id}'` : i;
      row.innerHTML = `<span style="flex:1">👤 ${esc(m.name)}</span>
        <button onclick="removeFamilyMember(${removeArg})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px">✕</button>`;
      el.appendChild(row);
    });
  }
  populateTodoAssigneeDropdown();
}

async function addFamilyMember() {
  const input = document.getElementById('newFamilyMemberInput');
  const name  = input.value.trim();
  if (!name) return;
  input.value = '';
  if (db) {
    await db.collection('familyMembers').add({ name });
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

function addShop() {
  const input = document.getElementById('shopInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  if (db) { addToFs('shopping', text); }
  else {
    const items = getLocalList('shopping');
    items.push({ text, done: false, by: userName });
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

  document.getElementById('mealModalTitle').textContent    = `🍽 ${typeLabel}`;
  document.getElementById('mealModalSubtitle').textContent = dateLabel;
  document.getElementById('mealStyleInput').value          = '';
  document.getElementById('mealPantryInput').value         = mealPantryDef;
  document.getElementById('mealUseCalendar').checked       = true;
  document.getElementById('mealSuggestionsWrap').innerHTML = '';
  document.getElementById('mealGenerateBtn').disabled      = false;
  document.getElementById('mealModal').style.display       = 'flex';
}

function closeMealModal() {
  document.getElementById('mealModal').style.display = 'none';
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
    const resp = await fetch(
      `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 8192 }
        })
      }
    );
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
  const count       = _mealType === 'all' ? '1 breakfast, 1 lunch, and 3 dinner options' : `3 ${_mealType} options`;
  const dietStr     = mealDietPrefs.length ? mealDietPrefs.join(', ') : 'none specified';

  const prompt =
`Suggest ${count} for a family meal plan.
${style       ? `Cuisine/style preference: ${style}` : ''}
${pantry      ? `On-hand ingredients to incorporate: ${pantry}` : ''}
${calContext  ? `Calendar events today (gauge busyness/time): ${calContext}` : ''}
${existingStr ? `Already planned today: ${existingStr}` : ''}
Dietary preferences: ${dietStr}
Prioritise healthy, nutritious, well-balanced options.
Choose the best matching recipe site from: allrecipes, seriouseats, nytcooking, epicurious, simplyrecipes, bonappetit.

Return ONLY a valid JSON array — no markdown, no explanation. Each element:
{
  "mealType": "${_mealType === 'all' ? 'breakfast|lunch|dinner' : _mealType}",
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

  _mealSuggestions.forEach((s, i) => {
    const site       = RECIPE_SITES[s.recipeSite] || RECIPE_SITES.allrecipes;
    const recipeUrl  = site.url(s.recipeSearchQuery || s.name);
    const typeLabel  = _mealType === 'all' ? `<span style="font-size:.7rem;font-weight:600;color:var(--accent);margin-left:6px">${MEAL_TYPE_LABELS[s.mealType] || s.mealType}</span>` : '';
    const ingList    = (s.ingredients || []).slice(0,7).join(', ') + ((s.ingredients||[]).length > 7 ? '…' : '');

    const card = document.createElement('div');
    card.className = 'meal-suggestion';
    card.id = `meal-s-${i}`;
    card.innerHTML = `
      <div class="meal-s-name">${esc(s.name)}${typeLabel}</div>
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
    ingredients.forEach(ing => { addToFs('shopping', ing); added++; });
  } else {
    const items = getLocalList('shopping');
    ingredients.forEach(ing => {
      if (!items.some(i => i.text.toLowerCase() === ing.toLowerCase())) {
        items.push({ text: ing, done: false, by: userName });
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

// ── Family Assistant ───────────────────────────────────────────────────────

/** Gather current app state into a system prompt for the AI. */
function buildAssistantContext() {
  const today = new Date();
  const fmt = (d, opts) => d.toLocaleDateString('en-US', opts);

  // ── Calendar: next 7 days ──
  const calLines = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
                : fmt(d, { weekday: 'long', month: 'short', day: 'numeric' });
    const evts = Object.values(calEventCache)
      .flatMap(calDays => calDays[dateStr] || [])
      .filter(e => !e.holiday)
      .map(e => e.summary);
    if (evts.length) calLines.push(`  ${label}: ${evts.join(', ')}`);
  }

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

  // ── Weather ──
  const weatherCity = weatherLocations[weatherLocIdx] || 'not set';

  const name = userName || 'the family';
  return `You are a helpful assistant built into a family dashboard. You are talking to ${name}. Today is ${fmt(today, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

CURRENT FAMILY DATA (use this to answer questions):

Calendar — next 7 days:
${calLines.length ? calLines.join('\n') : '  (no upcoming events)'}

To-Do list — ${pendingTodos.length} pending item(s):
${pendingTodos.length ? pendingTodos.join('\n') : '  (nothing pending)'}

Shopping list — ${pendingShop.length} item(s):
${pendingShop.length ? pendingShop.join('\n') : '  (list is empty)'}

Budget / recurring bills:
${budgetLines.length ? budgetLines.join('\n') : '  (none set up)'}

Current weather location: ${weatherCity}

ACTIONS YOU CAN TAKE:
If the user asks you to add something to the shopping list, append one tag per item at the very end of your response, after your text:
[ACTION:addShopping:item name]

If the user asks you to add a to-do task, append:
[ACTION:addTodo:task description]

You may include multiple action tags. They are executed automatically and hidden from the display.

GUIDELINES:
- Keep responses concise and friendly. 2–4 sentences is usually enough.
- Use bullet points (•) for lists.
- When asked "what's going on this week?" or similar, summarise the calendar events.
- When asked about free time or scheduling, look at the calendar gaps.
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

/** Execute parsed assistant actions (add to shopping / todo). */
function executeAssistantActions(actions) {
  const confirmMsgs = [];
  actions.forEach(({ type, value }) => {
    if (type === 'addShopping') {
      if (db) { addToFs('shopping', value); }
      else {
        const items = getLocalList('shopping');
        items.push({ text: value, done: false, by: userName });
        saveLocalList('shopping', items);
        renderLocalList('shopping');
      }
      confirmMsgs.push(`✓ Added "${value}" to Shopping`);
    } else if (type === 'addTodo') {
      if (db) { addToFs('todo', value); }
      else {
        todoItems.push({ id: String(Date.now() + Math.random()), text: value, done: false, by: userName });
        saveLocalList('todo', todoItems);
        renderTodoList();
      }
      confirmMsgs.push(`✓ Added "${value}" to To-Do`);
    }
  });
  return confirmMsgs;
}

/** Re-render all chat bubbles from assistantHistory. */
function renderAssistantMessages() {
  const container = document.getElementById('assistantMessages');
  if (!container) return;
  if (!assistantHistory.length) {
    container.innerHTML = `<div class="assistant-welcome">Hi! Ask me about your schedule, lists, or budget — or say things like "add milk to shopping" or "what's on this week?"</div>`;
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

/** Send the typed message to Gemini and render the reply. */
async function sendAssistantMessage() {
  const input = document.getElementById('assistantInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  if (!mealAiKey) {
    assistantHistory.push({ role: 'model', parts: [{ text: 'I need a Gemini API key to work. Add one in ⚙️ Settings → 🍽 Meals.' }] });
    renderAssistantMessages();
    return;
  }

  // Add user turn and show it immediately
  assistantHistory.push({ role: 'user', parts: [{ text }] });
  renderAssistantMessages();

  // Thinking indicator
  const container = document.getElementById('assistantMessages');
  const thinkEl = document.createElement('div');
  thinkEl.className = 'assistant-msg ai assistant-thinking';
  thinkEl.textContent = '•••';
  container.appendChild(thinkEl);
  container.scrollTop = container.scrollHeight;

  try {
    const systemPrompt = buildAssistantContext();
    const resp = await fetch(
      `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${mealAiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: assistantHistory,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      }
    );
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
    const confirms = executeAssistantActions(actions);

    // Append confirmation note to reply if actions were taken
    const finalText = confirms.length
      ? cleanText + (cleanText ? '\n' : '') + confirms.join('\n')
      : cleanText;

    assistantHistory.push({ role: 'model', parts: [{ text: finalText }] });
    renderAssistantMessages();

  } catch(e) {
    thinkEl.remove();
    assistantHistory.pop();
    assistantHistory.push({ role: 'model', parts: [{ text: `⚠️ Error: ${e.message}` }] });
    renderAssistantMessages();
  }
}

/** Clear conversation history and reset to welcome state. */
function clearAssistantChat() {
  assistantHistory = [];
  renderAssistantMessages();
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

function applyAppMode(mode) {
  appMode = mode;
  document.body.classList.remove('light-mode', 'nautical-mode');
  if (mode === 'light')   document.body.classList.add('light-mode');
  if (mode === 'nautical') document.body.classList.add('nautical-mode');
}

function setAppMode(mode) {
  applyAppMode(mode);
  localStorage.setItem('fh_mode', mode);
  document.getElementById('modeLight').className   = 'btn btn-sm' + (mode === 'light'    ? ' btn-mode-active' : '');
  document.getElementById('modeDark').className    = 'btn btn-sm' + (mode === 'dark'     ? ' btn-mode-active' : '');
  document.getElementById('modeAmazing').className = 'btn btn-sm' + (mode === 'nautical' ? ' btn-mode-active' : '');
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
  document.getElementById('settingName').value          = userName;
  document.getElementById('settingWeatherKey').value    = weatherKey;
  renderWeatherLocationsList();
  renderSmsContactsList();
  document.getElementById('settingSlideInterval').value = slideInterval;
  document.getElementById('settingMealAiKey').value     = mealAiKey;
  document.getElementById('settingMealPantry').value    = mealPantryDef;
  // provider is always gemini — no UI to update
  renderLoadingMsgList();
  renderFamilyMemberList();
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
  document.getElementById('modeLight').className   = 'btn btn-sm' + (appMode === 'light'   ? ' btn-mode-active' : '');
  document.getElementById('modeDark').className    = 'btn btn-sm' + (appMode === 'dark'    ? ' btn-mode-active' : '');
  document.getElementById('modeAmazing').className = 'btn btn-sm' + (appMode === 'nautical' ? ' btn-mode-active' : '');
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
  // Widget visibility checkboxes + placement radios
  Object.keys(WIDGET_DEFAULTS).forEach(key => {
    const cb = document.getElementById('widget_' + key);
    if (cb) cb.checked = widgetVisibility[key];
    const placement = widgetPlacement[key] || WIDGET_PLACEMENT_DEFAULTS[key] || 'sidebar';
    const radio = document.querySelector(`input[name="placement_${key}"][value="${placement}"]`);
    if (radio) radio.checked = true;
  });
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
  userName      = document.getElementById('settingName').value.trim() || 'Someone';
  weatherKey    = document.getElementById('settingWeatherKey').value.trim();
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
  closeSettings();
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

