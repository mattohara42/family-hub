# Family Hub — Setup Guide

*Last updated: 2026-06-01*

Family Hub is a local web dashboard made of three files — `family-hub.html`, `family-hub.css`, and `family-hub.js` — that run together in your browser. No installation is required, but a handful of free cloud accounts are needed to unlock the full feature set. This guide walks through every account, every step, and every value you need to configure.

---

## Quick Overview — What Accounts You Need

| Service | Used For | Cost |
|---|---|---|
| Google Cloud Console | Calendar sync, Google sign-in, background photos | Free |
| Firebase | Shared real-time Shopping & To-Do lists | Free tier |
| OpenWeatherMap | Weather widget | Free tier |
| Google AI Studio | Meal Planning AI suggestions | Free tier (or pay-as-you-go) |

---

## Before You Start — Run the Local Server

Google OAuth and the Photos Picker **will not work** when you open the HTML file directly from your filesystem (`file://`). You must serve it over a local HTTP server.

**One-time setup:**
1. Make sure Python 3 is installed (it comes pre-installed on Mac)
2. Open Terminal
3. `cd` to the folder containing `family-hub.html`, `family-hub.css`, and `family-hub.js`
4. Run:
   ```
   python3 -m http.server 8080
   ```
5. Open your browser to: `http://localhost:8080/family-hub.html`

Leave that Terminal window open whenever you use Family Hub. You can bookmark `http://localhost:8080/family-hub.html`.

> **Important:** All three files (`family-hub.html`, `family-hub.css`, `family-hub.js`) must be in the same folder. The HTML file loads the other two as siblings.

> **On Windows:** Python 3 may need to be installed from [python.org](https://www.python.org). The command is the same.

---

## Step 1 — Google Cloud Console (Calendar + Photos + Sign-In)

This gives you Google sign-in, Google Calendar sync, and the Google Photos background picker.

### 1a. Create a project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it `Family Hub` → **Create**
4. Make sure this project is selected in the dropdown before continuing

### 1b. Enable required APIs

Go to **APIs & Services → Library** and enable each of these (search by name):

- **Google Calendar API**
- **Photos Picker API**

Click each one → **Enable**.

### 1c. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** → **Create**
3. Fill in:
   - App name: `Family Hub`
   - User support email: your email
   - Developer contact: your email
4. On the **Scopes** screen, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`
   Then click **Update** and **Save and Continue**
5. On the **Test users** screen, click **Add users** and add the Google accounts for every family member who will use the app
6. Click **Save and Continue** → **Back to Dashboard**

### 1d. Create an OAuth Client ID

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `Family Hub`
4. Under **Authorized JavaScript origins**, click **Add URI** and add:
   - `http://localhost:8080`
5. Click **Create**
6. Copy the **Client ID** — it looks like `123480809-abcdefg.apps.googleusercontent.com`

### 1e. Put the Client ID in the app

Open `family-hub.js` in a text editor. Near the very top, find:

```js
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
```

Replace it with your actual Client ID.

---

## Step 2 — Firebase (Shared Shopping List & To-Do)

The Shopping List and To-Do list sync in real time across all family members' devices via Firebase Firestore. This step is optional — the lists work locally without Firebase, but won't sync.

### 2a. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Name it `Family Hub`
4. Disable Google Analytics if you don't want it → **Create project**

### 2b. Create a Firestore database

1. In the left sidebar, click **Firestore Database → Create database**
2. Select **Start in test mode** (allows open read/write — fine for family use on a private network)
3. Choose a region close to you → **Enable**

### 2c. Get your Firebase config

1. Click the ⚙️ gear icon → **Project settings**
2. Scroll down to **Your apps** → click **< />** (Web app)
3. Register the app with any name (e.g. `Family Hub Web`)
4. Copy the `firebaseConfig` object — it looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123480809",
     appId: "1:123480809:web:abcdef"
   };
   ```

### 2d. Put the Firebase config in the app

Open `family-hub.js` and find the `FIREBASE_CONFIG` constant near the very top. Replace the placeholder values with your actual config values.

---

## Step 3 — OpenWeatherMap (Weather Widget)

### 3a. Create an account

1. Go to [openweathermap.org](https://openweathermap.org) → **Sign Up** (free)
2. Verify your email

### 3b. Get your API key

1. Log in → click your username → **My API keys**
2. Copy the **Default** key (or create a new one)

> **Note:** New keys take up to 2 hours to activate. If you get a 401 error, wait and try again.

### 3c. Enter it in the app

1. Open Family Hub → click ⚙️ **Settings → 🌤 Weather**
2. Paste your API key
3. Under **Locations**, type a city name (e.g. `Boston, US` or `London, GB`) and click **Add**
4. Add as many locations as you like — use the **‹** and **›** arrows in the widget to switch between them
5. Click **Save**

---

## Step 4 — Google AI Studio (Meal Planning AI)

This powers the Meal Planning feature — it suggests meals, incorporates your pantry, dietary preferences, and what's on your calendar.

### 4a. Create an API key (free, no credit card required)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click **Create API key**
3. In the project dropdown, either:
   - Select **Create a new project** (recommended — keeps it on the free tier)
   - Or select an existing Google Cloud project that does **not** have billing enabled
4. Copy the API key

> ⚠️ **Important:** If the project you choose has Google Cloud billing enabled, the free tier is disabled. You'll get a quota error immediately. Use a project without billing, or be prepared to pay (costs are very small — roughly $0.001 per suggestion batch with Gemini 2.5 Flash).

### 4b. Enter it in the app

1. Open Family Hub → click ⚙️ **Settings → 🍽 Meals**
2. Select **Google Gemini** as the provider
3. Paste your API key
4. Click **Save**

### 4c. Optional: Use OpenAI instead

If you have an OpenAI API key with credits:
1. In **Settings → 🍽 Meals**, select **OpenAI**
2. Paste your OpenAI API key (from [platform.openai.com/api-keys](https://platform.openai.com/api-keys))
3. Click **Save**

---

## Step 5 — First Launch Checklist

Once all the above is done, open `http://localhost:8080/family-hub.html` and verify:

- [ ] ⚙️ Settings → **Look & Feel**: Set your name and choose an appearance (Light, Dark, or Nautical)
- [ ] Click **Sign in with Google** → sign in with your Google account
- [ ] Calendars appear in the **Calendars** sidebar card — toggle each on/off with the checkboxes
- [ ] ⚙️ Settings → **🌤 Weather**: API key saved and at least one location added
- [ ] ⚙️ Settings → **🍽 Meals**: Gemini key saved; click a day in Week or Day view → plan a meal → try ✨ Suggest
- [ ] ⚙️ Settings → **💰 Budget**: Add a recurring bill (e.g. Internet, $79.99, Monthly, day 1)
- [ ] Shopping List and To-Do List add items and persist on reload

---

## Feature Configuration Reference

### Appearance Themes

Three themes are available in ⚙️ **Settings → Look & Feel**:

| Theme | Description |
|---|---|
| ☀️ Light | Light grey background, dark text |
| 🌙 Dark | Deep charcoal background, blue accents (default) |
| ⚓ Nautical | Navy blue hull with diagonal white stripes, beige-gold accents, animated anchor and wave decorations |

### Widget Placement

Every widget can be shown in the **right sidebar** or the **bottom strip** below the calendar. Configure this in ⚙️ **Settings → Widgets**. Each widget has a radio button for Sidebar or Bottom placement, plus a checkbox to show/hide it entirely.

### Multi-Location Weather

The weather widget supports multiple cities:
1. ⚙️ **Settings → 🌤 Weather** → type a city in the **Locations** field → click **Add**
2. Repeat for each city
3. The widget shows **‹** and **›** navigation arrows and dot indicators when you have more than one location
4. Each dot is also clickable to jump directly to that city

### Google Photos Background

After signing in with Google:
1. Click ⚙️ **Settings → 🎨 Look & Feel**
2. Click **Choose from Google Photos**
3. A Google Photos picker opens — select photos or albums
4. Click **Import selected**

Photos are downloaded and stored locally in your browser (IndexedDB). They persist between sessions. The slideshow interval is configurable in Settings.

### Calendar Toggles

After signing in:
- Your calendars appear as toggle rows in the **Calendars** sidebar card
- Each row shows a coloured dot, the calendar name, and a checkbox
- Uncheck a calendar to hide its events from all views
- In ⚙️ **Settings → 📅 Calendar**, you can assign custom labels and colors to each calendar
- Toggle the **National Holidays** overlay on/off in calendar settings

### Shopping List — Clear Options

The Shopping card header has two clear buttons:
- **✕ done** — removes only items you've checked off
- **✕ all** — removes every item (asks for confirmation first)

### To-Do List — Clear Options

Same two clear buttons as Shopping. To-Do items can also be assigned to a family member and given a due date — overdue items appear highlighted on calendar views.

### SMS Shopping List

1. ⚙️ **Settings → 🛒 Shopping** → add contacts with nickname and phone number
2. In the Shopping List card, click **📱 SMS ▾** to pick a recipient
3. Your device's SMS app opens with the list pre-filled

### Budget

1. ⚙️ **Settings → 💰 Budget** → click **+ Add Budget Item**
2. Fill in name, amount, frequency, and which day it falls on
3. A **Budget Total** pill appears in the right sidebar showing the total for the current calendar period (month or week)
4. The pill is hidden when no bills fall in the current period

### Meal Planning Loading Messages

The funny loading messages shown while AI thinks are customizable:
1. ⚙️ **Settings → 🍽 Meals** → scroll to **Loading Messages**
2. Add, remove, or reset to defaults

---

## Sharing with Family Members

Family Hub works best when every family member has the three files and serves them locally. There is no hosted version.

**To share:**
1. Send each family member copies of `family-hub.html`, `family-hub.css`, and `family-hub.js`
2. They put all three files in the same folder and run `python3 -m http.server 8080`
3. Add their Google account as a Test User in Google Cloud Console (Step 1c)
4. They sign in with their own Google account
5. The Shopping and To-Do lists sync automatically via Firebase

**What syncs across devices:**
- Shopping List items ✅
- To-Do items ✅

**What is local per-device:**
- Settings (name, weather key, API keys)
- Appearance theme
- Weather locations
- Calendar view preferences
- Background photos
- Meal plans
- Budget items
- Word of the Day / Dad Joke cache
- Widget placement preferences

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Google sign-in does nothing | Make sure you're serving from `http://localhost:8080`, not `file://` |
| "This app isn't verified" warning | Click **Advanced → Go to Family Hub (unsafe)** — this is normal for personal apps in test mode |
| Weather shows nothing after saving key | New OWM keys take up to 2 hours to activate |
| Weather only shows 1–2 forecast days | The free OWM tier returns up to 5 days of 3-hour slots — fewer may appear depending on time of day |
| Meal AI says "rate limited" | You've hit the free daily limit — it resets at midnight Pacific Time |
| Meal AI says "API not enabled" | Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a fresh key in a new project |
| Photos don't appear as background | Re-open the Photos Picker and re-import — Picker sessions expire |
| Calendar shows no events | Check that your Google account is a Test User in Cloud Console |
| Calendars card shows nothing | The card shows a placeholder until you sign in — click **Sign in with Google** |
| Lists don't sync | Verify Firebase config values are correct and Firestore is in test mode |
| Word of the Day shows "Loading…" | The dictionary API may be temporarily unavailable — click the ↺ refresh button |
