# Family Hub — Setup Guide

*Last updated: 2026-06-14*

Family Hub is a web dashboard made of three files — `family-hub.html`, `family-hub.css`, and `family-hub.js` — that run together in your browser. No installation is required, but a handful of free cloud accounts are needed to unlock the full feature set. This guide walks through every account, every step, and every value you need to configure.

---

## Quick Overview — What Accounts You Need

| Service | Used For | Cost |
|---|---|---|
| Google Cloud Console | Calendar sync, Google sign-in, background photos | Free |
| Firebase | Shared real-time Shopping, To-Do, Budget, Meal Plans, Family Members & Chore Chart | Free tier |
| Google AI Studio | Meal Planning AI suggestions | Free tier (or pay-as-you-go) |

---

## Before You Start — Choose How to Run Family Hub

Google OAuth and the Photos Picker **will not work** when you open the HTML file directly from your filesystem (`file://`). You need to serve it over HTTP or HTTPS. Two options:

### Option A — Netlify (recommended, accessible from any device)

Family Hub is deployed as a static site on Netlify at **https://familial.netlify.app**. If you're using that instance, skip to Step 1 below. To deploy your own:

1. Push the three files to a GitHub repository
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
3. Connect GitHub → select the repo → set **Publish directory** to `.`, leave **Build command** blank
4. Click **Deploy site** — note the assigned URL (e.g. `https://family-hub-xyz.netlify.app`)
5. Add your API keys as Netlify environment variables (see Step 4b below) and redeploy
6. Complete Steps 1 and 2 below, then add the Netlify domain to:
   - **Google Cloud Console → OAuth Client → Authorized JavaScript Origins**
   - **Firebase Console → Authentication → Settings → Authorized Domains**

### Option B — Local server (for development or offline use)

1. Make sure Python 3 is installed (it comes pre-installed on Mac)
2. Open Terminal
3. `cd` to the folder containing `family-hub.html`, `family-hub.css`, and `family-hub.js`
4. Run:
   ```
   python3 -m http.server 8080
   ```
5. Open your browser to: `http://localhost:8080/family-hub.html`

Leave that Terminal window open whenever you use Family Hub locally.

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
   - Your Netlify URL, e.g. `https://family-hub-xyz.netlify.app` (if using Netlify)
5. Click **Create**
6. Copy the **Client ID** — it looks like `123480809-abcdefg.apps.googleusercontent.com`

### 1e. Put the Client ID in the app

Open `family-hub.js` in a text editor. Near the very top, find:

```js
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
```

Replace it with your actual Client ID.

> **Don't want to set up Google OAuth?** You can skip Step 1 entirely and still
> see your calendars: in ⚙️ **Settings → 📅 Calendar → 📡 ICS Subscriptions**,
> paste a calendar's **public or secret `.ics` URL** (Google, Outlook, school or
> sports feeds all provide one). These are **read-only** — you won't be able to
> add/edit events from the app — but they need no sign-in. Recurring events and
> time zones are handled automatically. *(On local dev without Netlify, feeds
> that block cross-origin requests — like Google's — only load once deployed.)*

---

## Step 2 — Firebase (Shared Real-Time Data)

The following features sync in real time across all family members' devices via Firebase Firestore: Shopping List, To-Do List, Budget, Meal Plans, Family Members, and the Chore Chart. This step is optional — all features work locally without Firebase, but data won't be shared between devices.

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

## Step 3 — Weather Widget (no setup needed!)

The weather widget is **keyless** — it uses [Open-Meteo](https://open-meteo.com/)
for the forecast, RainViewer for the radar, and the US National Weather Service
for severe-weather alerts. There's no account to create and no API key to paste.

Just add your locations:

1. Open Family Hub → click ⚙️ **Settings → 🌤 Weather**
2. Under **Locations**, type a city name (e.g. `Boston, US` or `London, GB`) and click **Add**
   - Or click the 📍 button in the widget to use your current location.
3. Add as many locations as you like — use the **‹** and **›** arrows in the widget to switch between them
4. Click **Save**

---

## Step 4 — Google AI Studio (Meal Planning AI, Assistant & Daily Briefing)

This powers the Meal Planning AI, the Family Assistant chat, and the daily briefing banner.

### 4a. Create an API key (free, no credit card required)

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click your profile / account icon in the top-right corner → **Get API key**
3. Click **Create API key**
4. In the project dropdown, either:
   - Select **Create a new project** (recommended — keeps it on the free tier)
   - Or select an existing Google Cloud project that does **not** have billing enabled
5. Copy the API key — it looks like `AIzaSy_...`
6. When prompted, choose to mark it as a **Secret** (recommended — prevents it from showing in logs)

> ⚠️ **Important:** If the project you choose has Google Cloud billing enabled, the free tier is disabled and you'll get a quota error immediately. Use a project without billing, or be prepared to pay (costs are very small — roughly $0.001 per request with Gemini 2.5 Flash).

### 4b. Where to enter it depends on how you run Family Hub

**If using Netlify (recommended):**

The API key is stored as a server-side secret in Netlify — you never paste it into the app itself.

1. Go to [app.netlify.com](https://app.netlify.com) → select your Family Hub site
2. Click **Project Configuration** in the left sidebar
3. Click **Environment variables → Add a variable**
4. Add:
   - Key: `GEMINI_KEY` — Value: your Gemini API key — check **Secret**
   - *(`OWM_KEY` is only needed if you use the optional Event Discovery feature — the weather widget itself is keyless.)*
5. Click **Save**, then trigger a new deploy (Deploys → **Trigger deploy → Deploy site**)

After deploying, leave the AI key field in `family-hub.js` blank — the app will automatically call the Netlify proxy function instead. (Weather needs no key at all.)

**If running locally:**

1. Open Family Hub → click ⚙️ **Settings → 🍽 Meals**
2. Select **Google Gemini** as the provider
3. Paste your API key
4. Click **Save**

### 4c. Optional: Use OpenAI instead (local only)

If you have an OpenAI API key with credits:
1. In **Settings → 🍽 Meals**, select **OpenAI**
2. Paste your OpenAI API key (from [platform.openai.com/api-keys](https://platform.openai.com/api-keys))
3. Click **Save**

---

## Step 5 — First Launch Checklist

Once all the above is done, open the app (your Netlify URL or `http://localhost:8080/family-hub.html`) and verify:

- [ ] ⚙️ Settings → **Look & Feel**: Set your name and choose a theme and flavor (see Appearance Themes below)
- [ ] Click **Sign in with Google** → sign in with your Google account
- [ ] Calendars appear in the **Calendars** sidebar card — toggle each on/off with the checkboxes
- [ ] ⚙️ Settings → **🌤 Weather**: at least one location added (no key needed)
- [ ] ⚙️ Settings → **🍽 Meals**: Gemini key saved; click a day in Week or Day view → plan a meal → try ✨ Suggest
- [ ] **💰 Budget** sidebar card → **+ Add**: Add a recurring bill (e.g. Internet, $79.99, Monthly, day 1)
- [ ] Shopping List and To-Do List add items and persist on reload

---

## Step 6 — Home Assistant (optional, smart home control)

Adds a 🏠 Home widget that shows and controls lights, switches, locks and sensors.
Skip this entirely if you don't run Home Assistant — every other feature works without it.

This guide covers the setup we chose: **Home Assistant on its own always-on machine**,
reached over **Tailscale HTTPS**. The wall panel stays a plain browser pointed at the
Netlify URL and runs nothing else.

> **Why not on the wall panel itself?** An earlier version of this guide put Home Assistant
> in Docker on the same Raspberry Pi as the panel. That needs a Pi with 4 GB of RAM or more,
> and it ties the two together: a browser crash or panel reboot takes the lights down with it,
> and a hung Home Assistant update takes the calendar down. Our panel is a 1 GB Raspberry Pi 3,
> which has no room for Home Assistant at all, so Home Assistant lives on separate hardware.

### Why not just use `http://homeassistant.local:8123`?

Because Family Hub is served over HTTPS from Netlify, and browsers refuse to let an HTTPS
page call a plain `http://` address. There is no setting that turns that off. Home Assistant
therefore needs a real HTTPS URL, which is what Tailscale gives you for free.

### What you need

- **An always-on machine for Home Assistant.** Any of these work:
  - **Home Assistant Green**, the official plug-in appliance. Least setup.
  - **A Raspberry Pi 4 or 5** (a second one, not the panel), ideally booting from a USB SSD
    rather than an SD card. Home Assistant writes to its database constantly, and SD cards die from it.
  - **A Mac mini, mini PC or other computer that stays on**, running Home Assistant OS in a
    virtual machine. Avoid Docker Desktop on a Mac: it can't pass USB radios through to
    containers, and auto-discovery of devices on your network is unreliable there.
- A free Tailscale account

Whichever machine you pick, install **Home Assistant OS** (not the Docker "Container" version).
It includes the add-on store and built-in backups, both of which the steps below rely on.

### 6a. Install Home Assistant

Follow Home Assistant's own installation page for your hardware:
[home-assistant.io/installation](https://www.home-assistant.io/installation/). Their steps
change with each release, so this guide doesn't copy them.

#### Our setup: a Mac mini (Apple Silicon)

We run Home Assistant OS in a **VirtualBox** virtual machine on an M4 Mac mini. VirtualBox is
the route Home Assistant documents for Macs, so follow their
[macOS page](https://www.home-assistant.io/installation/macos) for the click-by-click steps.
In outline:

1. Install VirtualBox, then download the **Apple Silicon** `.vdi.zip` image from that page and unzip it.
2. Create a new Linux VM (Oracle Linux, ARM 64-bit) with **Use EFI** checked. Give it
   **4 GB of memory and 2 CPUs**. A 16 GB Mac has room for that and Home Assistant
   won't need more for a house like ours.
3. Under **Storage**, remove the empty placeholder disk and attach the `.vdi` file.
4. Under **Network**, set **Attached to** to **Bridged Adapter** on the Mac's wired or wifi
   connection. This gives Home Assistant its own address on your home network, which is what
   lets it auto-discover devices. The default NAT mode hides it from them.

A Mac only works as a Home Assistant host if it really stays on, so also do this:

- **System Settings → Energy**: turn on **Prevent automatic sleeping when the display is off**
  and **Start up automatically after a power failure**.
- **System Settings → Users & Groups**: set **Automatically log in as** to your user. macOS
  hides this option while **FileVault** is on, and with FileVault on, a Mac that restarts after
  a power cut waits at the unlock screen with Home Assistant stopped. Decide which matters more
  to you on this machine.
- **Start the VM at login** so it comes back by itself. Save this as
  `~/Library/LaunchAgents/io.home-assistant.vm.plist`:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>Label</key><string>io.home-assistant.vm</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/VBoxManage</string>
      <string>startvm</string>
      <string>Home Assistant</string>
      <string>--type</string>
      <string>headless</string>
    </array>
    <key>RunAtLoad</key><true/>
  </dict>
  </plist>
  ```

  Then run `launchctl load ~/Library/LaunchAgents/io.home-assistant.vm.plist` once. The VM
  name must match what you called it in VirtualBox. `headless` runs it with no window.

macOS updates restart the Mac now and then. With the settings above, Home Assistant comes back
on its own a minute or two later.

When it's running, open `http://homeassistant.local:8123` from a computer on your home network
and complete the onboarding wizard (create your admin account, set your location). Home
Assistant will auto-discover a lot of your house on its own, WiZ bulbs and Nest thermostats included.

Install the **File editor** add-on (**Settings → Add-ons → Add-on store**). The YAML edits
below are made with it.

### 6b. Turn down the disk writes (SD cards only)

If Home Assistant is running from an SD card, add this to `configuration.yaml`:

```yaml
recorder:
  purge_keep_days: 3
  commit_interval: 30
```

This keeps three days of history and batches writes every 30 seconds instead of every second.
On an SD card it's the single biggest thing you can do to keep it alive. Skip it on an SSD,
on Home Assistant Green, or in a virtual machine.

### 6c. Get an HTTPS URL with Tailscale

1. In the [Tailscale admin console](https://login.tailscale.com/admin/dns), turn on
   **DNS → MagicDNS** and **DNS → HTTPS Certificates**.
2. In Home Assistant, install the **Tailscale** add-on from the add-on store, start it, and
   follow the login link in its log to add the machine to your tailnet.
3. In the add-on's **Configuration** tab, turn on the option that shares Home Assistant on
   your tailnet over HTTPS (Tailscale Serve). The option has been renamed between add-on
   versions, so check the add-on's **Documentation** tab for its current name.

Your Home Assistant URL is then something like `https://homeassistant.tail1234.ts.net/`.
That's the base URL Family Hub will use. Test it in a browser on any device that's signed
into your tailnet.

> ⚠️ **Do not use Tailscale Funnel.** Funnel publishes the URL to the open internet.
> Serve keeps it private to your own devices, which is the whole point.

**Every device that shows the widget needs Tailscale too**, including the wall panel. On the
panel's Raspberry Pi:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Follow the login link it prints. The panel only needs to join the tailnet, so there's no
`serve` step on it.

**Phones are optional.** We control lights from our phones with the WiZ and Google Home apps,
so in our setup only the panel and the Home Assistant machine are on the tailnet. If you do
want the widget on a phone, install the Tailscale app, sign into the same tailnet, and allow
the VPN configuration it asks for. Phones allow one VPN at a time, so a work or privacy VPN
disconnects Tailscale while it's on. A guest phone on your wifi will *not* be able to use the
widget. That's intentional.

### 6d. Let Family Hub talk to Home Assistant (CORS)

Home Assistant rejects browser requests from other websites unless you name them. Add this to
`configuration.yaml`:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1
  cors_allowed_origins:
    - https://your-site.netlify.app
    - http://localhost:8080
```

Use your real Netlify URL, with **no trailing slash and no path**. Keep the `localhost:8080`
line only if you also run Family Hub locally for development.

`trusted_proxies` is required whenever `use_x_forwarded_for` is on, because the Tailscale
add-on forwards requests to Home Assistant from the same machine. Home Assistant refuses to
start without it, and without both, every request looks like it came from `127.0.0.1` and the
brute-force protection misbehaves. If the Tailscale add-on's documentation lists different
proxy addresses, use those.

Restart to apply: **Settings → System → ⏻ (top right) → Restart Home Assistant**.

### 6e. Create a panel account and a token

Don't use your own admin account for this. A wall display hanging in the kitchen shouldn't be
holding admin credentials.

1. In Home Assistant: **Settings → People → Add Person**
2. Name it `Wall Panel`, turn on **Allow person to login**, set a username and password
3. Leave **Administrator** OFF
4. Leave **Can only log in from the local network** OFF (Tailscale doesn't count as local)
5. Open a private browser window, go to your `ts.net` URL, and sign in as `Wall Panel`
6. Click the user avatar (bottom left) → **Security** tab → **Long-lived access tokens** → **Create token**
7. Copy it now. Home Assistant shows it exactly once.

If you ever lose a device, revoke just that device's token from this same screen.

### 6f. Connect Family Hub

On the wall panel (and again on any phone you've put on the tailnet, since the token is stored per device):

1. ⚙️ Settings → **🧩 Widget Layout** → enable **Home Assistant**
2. ⚙️ Settings → **🏠 Home Assistant**
3. **Base URL**: your `https://….ts.net` address
4. **Token**: the long-lived token from step 6e
5. Click **Test connection**. On success it also loads the list of every entity in your house.
6. Add the entities you want on the panel: `light.kitchen`, `lock.front_door`, and so on.
   You can find any entity ID in Home Assistant under **Developer Tools → States**.
7. Save

Only the entities you list here ever appear in the widget. Lights, switches and fans get a
toggle, locks get lock/unlock, everything else displays read-only.

> **The token is stored on that device only** and is never synced to Firebase. That means
> pasting it once per device, and it means a lost phone costs you one revocable token
> instead of access to your house.

### 6g. Backups

Home Assistant OS has built-in backups under **Settings → System → Backups**. Turn on
automatic backups there, and take a manual one before any risky change. Keep a copy off the
machine (download it, or add a backup location such as a network share), because a backup
that only lives on a dead disk doesn't help.

### Home Assistant troubleshooting

| Problem | Fix |
|---|---|
| Widget says it can't reach Home Assistant | Two causes look identical to the browser. Check that both the Home Assistant machine and this device show as connected in the [Tailscale admin console](https://login.tailscale.com/admin/machines), then check that `cors_allowed_origins` lists this exact origin (scheme + host, no trailing slash) and that you restarted Home Assistant after editing it. |
| "Home Assistant rejected the token" | The token was revoked, or copied short. Generate a new one (step 6e); it's only displayed once. |
| "Entity not found" | The entity ID changed or has a typo. Look it up in **Developer Tools → States** and re-add it. |
| Works on the panel but not on a phone | The phone isn't signed into the tailnet, or the token wasn't entered on that device. Both are per-device. |
| Home Assistant won't start after editing YAML | Check **Settings → System → Logs**. Almost always indentation, or `use_x_forwarded_for` without `trusted_proxies`. |
| Home Assistant gets slow after a few weeks | The recorder database is growing. On an SD card, confirm step 6b is in place, and consider moving to an SSD. |
| Toggle flips back after a second | The device didn't actually change state. Some Z-Wave and Zigbee devices take several seconds; the widget re-checks twice before giving up. If it never takes, try the same control inside Home Assistant to see whether the problem is the hub or the device. |

---

## Wall Panel — Remote Access

You can see and control the panel's screen from another computer (we use the Mac mini), which
saves walking to the kitchen to fix a frozen page or change a setting.

### On the Pi (one time)

1. Run `sudo raspi-config`
2. **Interface Options → VNC → Enable.** This turns on whichever VNC server your Raspberry Pi
   OS version uses: WayVNC on recent versions, RealVNC on older ones.
3. **Interface Options → SSH → Enable.** Useful for quick fixes that don't need the screen.

### From the Mac

- **See the screen:** install **RealVNC Viewer** (free) and connect to the Pi. macOS's built-in
  Screen Sharing (Finder → **Go → Connect to Server** → `vnc://<pi-address>`) may also work, but
  it doesn't always get along with WayVNC. If it refuses to connect, use RealVNC Viewer.
- **Command line:** `ssh <username>@<pi-address>` in Terminal. `sudo reboot` restarts the
  panel without touching it.

For `<pi-address>`, use the Pi's Tailscale name from the
[Tailscale admin console](https://login.tailscale.com/admin/machines) if it's on your tailnet
(step 6c). That works from anywhere. At home, the Pi's local IP address or
`<hostname>.local` works too.

> **Disconnect when you're done.** A Raspberry Pi 3 has 1 GB of RAM and is already busy running
> the hub. VNC adds load, so expect a laggy picture, and don't leave a session open.

---

## Feature Configuration Reference

### Appearance Themes

Six themes are available in ⚙️ **Settings → 🎨 Look & Feel → Appearance**:

| Theme | Description |
|---|---|
| 🌓 Auto | Follows the device's light/dark setting and switches with it (default) |
| ☀️ Light | Light grey background, dark text |
| 🌙 Dark | Deep charcoal background, blue accents |
| ⚓ Nautical | Navy blue hull with diagonal white stripes, beige-gold accents, animated anchor and wave decorations |
| 🌌 Aurora | Light violet background with soft aurora glows, using a colorblind-safe orange/sky-blue palette |
| 👁 Accessible | High-contrast dark theme with a colorblind-safe (Okabe-Ito) palette |

Separately, **Flavor** changes the material rather than the colors: **◻ Basic** (default) is flat
glass, and **✦ Tactile** adds a serif display font, softer shadows and surface grain. Any flavor
works with any theme. Tactile's decoration is turned off under the Accessible theme.

### Widget Placement

Every widget can be shown in the **right sidebar** or the **bottom strip** below the calendar. Configure this in ⚙️ **Settings → 🧩 Widget Layout**. Each widget has a radio button for Sidebar or Bottom placement, plus a checkbox to show/hide it entirely.

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

### School Day Cycle

Tracks a school's internal rotating day (e.g. a 4-day A/B/C/D schedule), shown as a small "Day N" badge in Week and Day calendar views only.

1. ⚙️ **Settings → 🏫 School → 🔁 School Day Cycle** → set the date Day 1 starts, the last day of the school year, and the cycle length (defaults to 4), then **Save**
2. Add any non-school days (holidays, breaks) so they're skipped rather than counted — the cycle only advances on weekdays that aren't marked off
3. Optionally add **Class Schedule by Day** entries: a subject, which day number(s) it falls on, and which family members have it — e.g. "Gym, Day 1 & 3, Kate" — these show as small chips under the Day N badge
4. The same panel also holds **🏫 Hourly Class Schedule**, a separate, older feature for weekly recurring class periods with specific times (e.g. "Math, 9:00–9:50, Mon/Wed/Fri") — unrelated to the day-rotation cycle, just grouped in the same Settings tab

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

1. In the **💰 Budget** sidebar card, click **+ Add**
2. Fill in name, amount, frequency, and which day it falls on
3. A **Budget Total** pill appears in the card showing the total for the current calendar period (month or week), and matching bills show up in Month/Week/Day calendar views too
4. The card is hidden when no bills exist at all; the total pill is hidden when none fall in the current period
5. Click the **👁** button in the card header to hide all dollar amounts (card, total pill, and every calendar view's bill pills) without removing anything — tap **🙈** to show them again. This is a per-device setting (not synced), meant for a public wall display: leave amounts visible on your phone/laptop and hide them just on the kiosk.

### Chore Chart

1. ⚙️ **Settings → ⭐ Chores** → configure a reward name and point threshold per family member
2. In the Chore Chart card, type a chore name, set its point value, choose who it's assigned to, and click **Add**
3. Each day, family members tap the checkbox next to their chore to mark it done — the progress bar fills as points accumulate
4. When a member hits their threshold, a pulsing **🎉 Redeem!** button appears — click it to reset their points and celebrate with confetti
5. Chores reset automatically each day (marking done is per-day, not permanent)
6. The Chore Chart can be placed in the sidebar or the bottom strip — in the bottom strip, each family member gets their own card displayed horizontally

> **Requires Firebase** — points and completion status sync across all devices in real time.

### Meal Planning Loading Messages

The funny loading messages shown while AI thinks are customizable:
1. ⚙️ **Settings → 🍽 Meals** → scroll to **Loading Messages**
2. Add, remove, or reset to defaults

---

## OAuth App — Stay in Testing Mode

When you try to publish the OAuth consent screen app, Google will say **"Your app requires verification."** This is expected — apps requesting Calendar and Photos scopes must go through a formal review (weeks-long, requires a privacy policy). **Don't submit for review.**

Instead, keep the app in **Testing** mode and add each family member as a test user:

1. Google Cloud Console → **APIs & Services → OAuth consent screen**
2. Scroll to **Test users → Add users**
3. Add every family member's Google email address
4. Click **Save**

Family members will see an "unverified app" warning the first time they sign in — click **Advanced → Go to Family Hub** to proceed. This only happens once per device.

> **Note on token expiry:** This app uses short-lived access tokens (1 hour) that Google silently refreshes in the background while users are signed in to Google. The 7-day refresh token limit that applies to testing mode does not affect this app's sign-in flow.

---

## Sharing with Family Members

Family Hub can be shared in two ways:

**Option A — Share via Netlify (easiest)**
1. Send family members the Netlify URL
2. Add each person's Google account as a Test User in Google Cloud Console (see above)
3. They open the URL, click **Sign in with Google**, and they're in
4. Shopping, To-Do, Budget, Meal Plans, Family Members, and Chore Chart sync automatically via Firebase

**Option B — Each person runs it locally**
1. Send each family member copies of `family-hub.html`, `family-hub.css`, and `family-hub.js`
2. They put all three files in the same folder and run `python3 -m http.server 8080`
3. Add their Google account as a Test User in Google Cloud Console (Step 1c)
4. They sign in with their own Google account
5. Shopping, To-Do, Budget, Meal Plans, Family Members, and Chore Chart sync automatically via Firebase

**What syncs across devices (Firebase):**
- Shopping List items ✅
- To-Do items ✅
- Budget items ✅
- Meal Plans ✅
- Family Members (names, colors, points) ✅
- Chore Chart (chores, completion status, rewards) ✅

**What is local per-device:**
- Settings (name, API keys)
- Appearance theme
- Weather locations
- Calendar view preferences
- Background photos
- Word of the Day / Dad Joke cache
- Widget placement preferences
- Budget privacy toggle (👁/🙈 — deliberately per-device so a wall display can hide amounts while other devices keep them visible)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Google sign-in does nothing | Must be served over HTTP/HTTPS — not `file://`. Use the Netlify URL or `http://localhost:8080`. Also ensure the origin is in Authorized JavaScript Origins in Google Cloud Console. |
| "This app isn't verified" warning | Click **Advanced → Go to Family Hub (unsafe)** — this is normal for personal apps in test mode |
| Weather shows nothing | Check that a location is added in ⚙️ Settings → 🌤 Weather. The widget needs no key, so a blank widget usually means no location or a failed network request to Open-Meteo |
| Meal AI says "rate limited" | You've hit the free daily limit — it resets at midnight Pacific Time |
| Meal AI says "API not enabled" | Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a fresh key in a new project |
| Photos don't appear as background | Re-open the Photos Picker and re-import — Picker sessions expire |
| Calendar shows no events | Check that your Google account is a Test User in Cloud Console |
| Calendars card shows nothing | The card shows a placeholder until you sign in — click **Sign in with Google** |
| Lists don't sync | Verify Firebase config values are correct and Firestore is in test mode |
| AI or Event Discovery not working on Netlify | Go to **Project Configuration → Environment variables** and confirm `GEMINI_KEY` (AI) and `OWM_KEY` (Event Discovery only) are set, then trigger a new deploy |
| AI key not found on Netlify | Keys must be added before deploying — Netlify functions read env vars at runtime, but a fresh deploy is required after adding them |
| Word of the Day shows "Loading…" | The dictionary API may be temporarily unavailable — click the ↺ refresh button |
