# Family Hub — Setup Guide

*Last updated: 2026-06-14*

Family Hub is a web dashboard made of three files — `family-hub.html`, `family-hub.css`, and `family-hub.js` — that run together in your browser. No installation is required, but a handful of free cloud accounts are needed to unlock the full feature set. This guide walks through every account, every step, and every value you need to configure.

---

## Quick Overview — What Accounts You Need

| Service | Used For | Cost |
|---|---|---|
| Google Cloud Console | Calendar sync, Google sign-in, background photos | Free |
| Firebase | Shared real-time Shopping, To-Do, Budget, Meal Plans, Family Members & Chore Chart | Free tier |
| OpenWeatherMap | Weather widget | Free tier |
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

- [ ] ⚙️ Settings → **Look & Feel**: Set your name and choose an appearance (Light, Dark, or Nautical)
- [ ] Click **Sign in with Google** → sign in with your Google account
- [ ] Calendars appear in the **Calendars** sidebar card — toggle each on/off with the checkboxes
- [ ] ⚙️ Settings → **🌤 Weather**: API key saved and at least one location added
- [ ] ⚙️ Settings → **🍽 Meals**: Gemini key saved; click a day in Week or Day view → plan a meal → try ✨ Suggest
- [ ] ⚙️ Settings → **💰 Budget**: Add a recurring bill (e.g. Internet, $79.99, Monthly, day 1)
- [ ] Shopping List and To-Do List add items and persist on reload

---

## Step 6 — Home Assistant (optional, smart home control)

Adds a 🏠 Home widget that shows and controls lights, switches, locks and sensors.
Skip this entirely if you don't run Home Assistant — every other feature works without it.

This guide covers the setup we chose: **Home Assistant in Docker on the same Raspberry Pi
that runs the wall panel**, reached over **Tailscale HTTPS**.

### Why not just use `http://homeassistant.local:8123`?

Because Family Hub is served over HTTPS from Netlify, and browsers refuse to let an HTTPS
page call a plain `http://` address. There is no setting that turns that off. Home Assistant
therefore needs a real HTTPS URL, which is what Tailscale gives you for free.

### What you need

- A Raspberry Pi 4 or 5 with **4 GB RAM or more** (2 GB will thrash once Chromium and Home Assistant are both running)
- Raspberry Pi OS 64-bit
- Strongly recommended: boot from a **USB SSD rather than an SD card**. Home Assistant writes to its database constantly, and SD cards die from it.
- A free Tailscale account

> **Note on the shared Pi.** The official "Home Assistant OS" image is an appliance and
> cannot run a desktop browser, so it can't share the Pi with your wall panel. That's why
> this guide uses Home Assistant in Docker on top of Raspberry Pi OS. The trade: no add-on
> store and no built-in backups. Tailscale gets installed natively instead (simpler anyway),
> and backups are a manual tar (step 6h).

### 6a. Install Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

Log out and back in so the group change takes effect, then confirm with `docker ps`.

### 6b. Start Home Assistant

```bash
mkdir -p ~/homeassistant
docker run -d \
  --name homeassistant \
  --restart=unless-stopped \
  --privileged \
  --network=host \
  -e TZ=America/Detroit \
  -v ~/homeassistant:/config \
  -v /run/dbus:/run/dbus:ro \
  ghcr.io/home-assistant/home-assistant:stable
```

First start takes a few minutes. On the Pi itself, open `http://localhost:8123` and complete
the onboarding wizard (create your admin account, set your location). Home Assistant will
auto-discover a lot of your house on its own, WiZ bulbs and Nest thermostats included.

To update later: `docker pull ghcr.io/home-assistant/home-assistant:stable && docker restart homeassistant`.

### 6c. Turn down the disk writes

Edit `~/homeassistant/configuration.yaml` and add:

```yaml
recorder:
  purge_keep_days: 3
  commit_interval: 30
```

This keeps three days of history and batches writes every 30 seconds instead of every second.
If you're on an SD card, this is the single biggest thing you can do to keep it alive. Skip it
only if you're booting from an SSD and actually want long history.

### 6d. Install Tailscale and get an HTTPS URL

On the Pi:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Follow the login link it prints. Then in the [Tailscale admin console](https://login.tailscale.com/admin/dns):

1. **DNS → MagicDNS**: enabled
2. **DNS → HTTPS Certificates**: enabled

Back on the Pi:

```bash
sudo tailscale serve --bg 8123
sudo tailscale serve status
```

`serve status` prints your HTTPS URL, something like `https://familypi.tail1234.ts.net/`.
That's the base URL Family Hub will use. Test it in a browser on any device that's signed
into your tailnet.

> On older Tailscale versions the command is `sudo tailscale serve https / http://localhost:8123`.
> If `--bg` isn't recognised, use that form.

> ⚠️ **Do not use `tailscale funnel`.** Funnel publishes the URL to the open internet.
> `serve` keeps it private to your own devices, which is the whole point.

Install Tailscale on any phone that should control the house, and sign into the same tailnet.
A guest phone on your wifi will *not* be able to use the widget. That's intentional.

### 6e. Let Family Hub talk to Home Assistant (CORS)

Home Assistant rejects browser requests from other websites unless you name them. Add this to
`~/homeassistant/configuration.yaml`:

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

`trusted_proxies` is required whenever `use_x_forwarded_for` is on. Home Assistant refuses to
start without it, and without both, every request looks like it came from `127.0.0.1` and the
brute-force protection misbehaves.

Restart to apply: `docker restart homeassistant`.

### 6f. Create a panel account and a token

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

### 6g. Connect Family Hub

On the wall panel (and again on each phone, since the token is stored per device):

1. ⚙️ Settings → **🧩 Widget Layout** → enable **Home Assistant**
2. ⚙️ Settings → **🏠 Home Assistant**
3. **Base URL**: your `https://….ts.net` address
4. **Token**: the long-lived token from step 6f
5. Click **Test connection**. On success it also loads the list of every entity in your house.
6. Add the entities you want on the panel: `light.kitchen`, `lock.front_door`, and so on.
   You can find any entity ID in Home Assistant under **Developer Tools → States**.
7. Save

Only the entities you list here ever appear in the widget. Lights, switches and fans get a
toggle, locks get lock/unlock, everything else displays read-only.

> **The token is stored on that device only** and is never synced to Firebase. That means
> pasting it once per device, and it means a lost phone costs you one revocable token
> instead of access to your house.

### 6h. Backups

Home Assistant in Docker has no built-in backup, so take one before any risky change:

```bash
docker stop homeassistant
tar czf ~/ha-backup-$(date +%F).tar.gz -C ~ homeassistant
docker start homeassistant
```

Copy the tarball somewhere off the Pi. If the SD card dies, this file is your house.

### Home Assistant troubleshooting

| Problem | Fix |
|---|---|
| Widget says it can't reach Home Assistant | Two causes look identical to the browser. Check `tailscale status` on both the Pi and the device, then check that `cors_allowed_origins` lists this exact origin (scheme + host, no trailing slash) and that you restarted HA after editing it. |
| "Home Assistant rejected the token" | The token was revoked, or copied short. Generate a new one (step 6f); it's only displayed once. |
| "Entity not found" | The entity ID changed or has a typo. Look it up in **Developer Tools → States** and re-add it. |
| Works on the panel but not on a phone | The phone isn't signed into the tailnet, or the token wasn't entered on that device. Both are per-device. |
| Home Assistant won't start after editing YAML | Check `docker logs homeassistant`. Almost always indentation, or `use_x_forwarded_for` without `trusted_proxies`. |
| Panel gets sluggish after a few weeks | The recorder database is growing. Confirm step 6c is in place, and consider moving off the SD card. |
| Toggle flips back after a second | The device didn't actually change state. Some Z-Wave and Zigbee devices take several seconds; the widget re-checks twice before giving up. If it never takes, try the same control inside Home Assistant to see whether the problem is the hub or the device. |

---

## Wall Panel: Building the Pi

How the kitchen wall panel was built, step by step, so it can be rebuilt from a blank SD card.
Everything below was run over SSH from the Mac.

**Hardware:** Raspberry Pi 3B+ (1 GB), Samsung EVO Select microSD, uPerfect 21.5" touchscreen
(HDMI for picture, USB cable for touch), official 5V 2.5A Pi power supply.

> **This Pi is too small for Home Assistant.** Step 6 assumes Home Assistant shares the panel's
> Pi, which needs a Pi 4/5 with 4 GB+. On this 1 GB Pi, run Home Assistant somewhere else.

### Quick reference

| What | How |
|---|---|
| SSH in | `ssh familyhub@family-hub.local` (user is **`familyhub`**, not `matt`) |
| VNC in | **RealVNC Viewer** (not macOS Screen Sharing) → `family-hub.local` at home, `family-hub` over Tailscale → log in as `familyhub` + the Pi password |
| Reload the hub page | `ssh familyhub@family-hub.local sudo systemctl restart lightdm` (restarts the panel's whole session, ~1 min) |
| Reboot | `ssh familyhub@family-hub.local sudo reboot` |
| Kiosk launch line | `~/.config/labwc/autostart` |

### 1. Flash the card

In **Raspberry Pi Imager**: Raspberry Pi 3 → **Raspberry Pi OS (64-bit)** (the desktop one; this
build was Debian 13 "Trixie"). In **Edit settings**:

- Hostname `family-hub`, username `familyhub`, any password (only `sudo` asks for it)
- Wi-Fi, locale, timezone
- **Services → Enable SSH → public-key authentication only**, with the Mac's
  `~/.ssh/id_ed25519.pub` pasted in

> Double-check the username field before writing. The first attempt assumed `matt` and the
> card said `familyhub`; with key-only SSH the only symptom is `Permission denied (publickey)`.

### 2. Power-on order

Card in → HDMI and the touch USB cable to the screen → turn the **screen on first** → Pi power
**last** (the Pi has no switch and checks for a display as it boots). Never power the Pi from the
monitor's USB port. First boot grows the filesystem and reboots once; allow 2–3 minutes.

After a reflash the Pi has a new host key, so clear the old one on the Mac first:

```bash
ssh-keygen -R family-hub.local
```

### 3. Passwordless sudo

Imager's user needs a password for `sudo`, which blocks scripted setup. Run once from a Mac
terminal (it asks for the Pi password):

```bash
ssh -t familyhub@family-hub.local 'echo "familyhub ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/011_familyhub-nopasswd && sudo chmod 440 /etc/sudoers.d/011_familyhub-nopasswd'
```

### 4. Update the OS

```bash
sudo apt-get update && sudo apt-get -y full-upgrade
sudo apt-get install -y fonts-noto-color-emoji   # the hub's icons are emoji; without this they're empty boxes
sudo reboot
```

Over Wi-Fi on a 3B+ this takes a while. Run it inside `sudo systemd-run --unit=upgrade sh -c '…'`
if you don't want a dropped SSH session to kill it halfway; follow it with `journalctl -fu upgrade`.

### 5. Chromium kiosk

The desktop already logs in automatically (`lightdm` → `familyhub` → the `labwc` session).

> **Why not `chromium --kiosk`?** It was the first attempt, and the on-screen keyboard never
> appeared. labwc deliberately hides keyboards and panels (the "top" layer) underneath any
> full-screen window, and `--kiosk` is full screen. So instead Chromium runs as a normal
> **maximized window with no border**, which looks identical but lets the keyboard show.

**a. Drop the desktop and taskbar.** Nothing should sit behind the hub. It also saves about
40 MB of RAM. (Auto-hiding the taskbar instead does *not* work: it pushed the hub window 34 px
off the top of the screen.) The Pi starts labwc with `-m`, which runs the system autostart *and*
ours, so comment the two lines out of the system file:

```bash
sudo sed -i -E 's@^(/usr/bin/lwrespawn /usr/bin/(pcmanfm-pi|wf-panel-pi) &)@# Family Hub kiosk: no desktop/taskbar behind Chromium. \1@' /etc/xdg/labwc/autostart
```

That file belongs to the `rpd-wayland-core` package. apt keeps local edits to it, but if an
upgrade ever asks whether to replace it, answer **keep your version**.

**b. Strip the window border and maximize.** Add a window rule inside `~/.config/labwc/rc.xml`
(the Pi already put a `<touch …/>` line there; keep it):

```xml
<openbox_config xmlns="http://openbox.org/3.4/rc">
	<touch deviceName="…" mapToOutput="HDMI-A-1" mouseEmulation="yes"/>
	<windowRules>
		<windowRule identifier="chrom*" serverDecoration="yes"><action name="SetDecorations" decorations="none"/><action name="Maximize"/></windowRule>
	</windowRules>
</openbox_config>
```

Then tell Chromium to use "system" window borders (so labwc's "none" applies, instead of
Chromium drawing its own title bar). Run this once, with Chromium **not** running:

```bash
python3 -c "
import json, pathlib
p = pathlib.Path.home()/'.config/chromium/Default/Preferences'
d = json.loads(p.read_text()); d.setdefault('browser', {})['custom_chrome_frame'] = False
p.write_text(json.dumps(d))"
```

(On a brand-new card the Preferences file doesn't exist until Chromium has run once. Boot, let
it open, `sudo systemctl stop lightdm`, run the above, `sudo systemctl start lightdm`.)

**c. The launch line.** Create `~/.config/labwc/autostart`:

```bash
cat > ~/.config/labwc/autostart <<'EOF'
# Family Hub kiosk. labwc-pi runs with -m, so this adds to /etc/xdg/labwc/autostart.
# lwrespawn relaunches Chromium if it crashes or gets OOM-killed.
# Maximized --app window, not --kiosk: labwc hides the on-screen keyboard under full-screen windows.
/usr/bin/lwrespawn chromium --app=https://familial.netlify.app/family-hub.html --start-maximized --no-first-run --hide-crash-restore-bubble --noerrdialogs --password-store=basic --disk-cache-dir=/tmp/chromium-cache --check-for-update-interval=31536000 --disable-features=Translate --overscroll-history-navigation=0 --disable-pinch --enable-wayland-ime --wayland-text-input-version=3 &
EOF
```

To restart the hub after changing any of this, restart the whole session:
`sudo systemctl restart lightdm`. (Avoid `pkill -f chromium` over SSH: the pattern also matches
your own SSH command and kills it.)

What the less obvious flags are for:

| Flag | Why |
|---|---|
| `--password-store=basic` | Without it, an auto-logged-in session pops a "unlock your keyring" dialog over the kiosk |
| `--disk-cache-dir=/tmp/…` | HTTP cache goes to RAM (`/tmp` is tmpfs). The profile (Google sign-in, `fh_*` settings) stays on the card on purpose |
| `--overscroll-history-navigation=0` | A sideways swipe on the calendar must page the month, not navigate Back |
| `--disable-pinch` | No accidental zooming on the wall |
| `--app=…` | A window with no tabs or address bar, like `--kiosk` but not full screen |
| `--enable-wayland-ime --wayland-text-input-version=3` | Lets the on-screen keyboard (squeekboard) pop up when a text field is tapped. Squeekboard itself ships with the OS and starts automatically when a touchscreen is plugged in. It takes the bottom half of the screen (its size setting has no effect in landscape) and the hub shrinks to the top half while it's up |
| `--hide-crash-restore-bubble` | No "Restore pages?" bubble after a power cut |

### 6. Mouse cursor and screen blanking

**Cursor:** a touch panel shouldn't show a pointer, and labwc has no "hide cursor" setting, so
we install a cursor theme where every cursor is a transparent pixel:

```bash
python3 - <<'EOF'
# Writes a transparent Xcursor theme ("blank") so no pointer shows on the touch panel.
import os, struct
src = '/usr/share/icons/PiXtrix/cursors'
dst = os.path.expanduser('~/.icons/blank/cursors')
os.makedirs(dst, exist_ok=True)
# Xcursor file: header, one TOC entry, one 1x1 fully transparent 24px-nominal image
img = struct.pack('<9I', 36, 0xfffd0002, 24, 1, 1, 1, 0, 0, 0) + struct.pack('<I', 0)
data = b'Xcur' + struct.pack('<3I', 16, 0x10000, 1) + struct.pack('<3I', 0xfffd0002, 24, 28) + img
with open(os.path.join(dst, 'default'), 'wb') as f:
    f.write(data)
for name in os.listdir(src):
    p = os.path.join(dst, name)
    if name != 'default' and not os.path.lexists(p):
        os.symlink('default', p)
with open(os.path.join(dst, '..', 'index.theme'), 'w') as f:
    f.write('[Icon Theme]\nName=blank\n')
EOF
echo XCURSOR_THEME=blank >> ~/.config/labwc/environment
```

To get the pointer back (say, while debugging over VNC), delete that last line from
`~/.config/labwc/environment` and reboot.

**Blanking:** the OS screen blanking stays **off**. The hub has its own screensaver, and the OS
blanking would turn the screen black over it.

```bash
sudo raspi-config nonint do_blanking 1   # 1 = disabled
```

### 7. Fewer SD card writes

A fresh Trixie install already avoids the worst of it: swap is compressed RAM (`zram`), `/tmp`
is a RAM disk, root is mounted `noatime`, and there's no `rsyslog`. The remaining steady writer
was the systemd journal, so keep it in RAM (logs are lost on reboot, which is fine for a panel):

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nStorage=volatile\nRuntimeMaxUse=32M\n' | sudo tee /etc/systemd/journald.conf.d/10-family-hub.conf
sudo systemctl restart systemd-journald
```

Chromium's HTTP cache is also in RAM (flag above). Its profile is deliberately left on the card.

### 8. VNC (see and drive the panel from the Mac)

The Pi ships `wayvnc`, a VNC server for the labwc desktop. Turn it on:

```bash
sudo raspi-config nonint do_vnc 0   # 0 = enabled; starts now and on every boot
```

**To connect:**

1. On the Mac, install **RealVNC Viewer** (free, realvnc.com → Download → Viewer). The Mac's
   built-in Screen Sharing app **won't work**: wayvnc only offers encrypted logins (TLS and
   RSA-AES), and Screen Sharing doesn't speak either.
2. In the address box type `family-hub.local` (at home) or `family-hub` (from anywhere, with
   Tailscale running on the Mac; see step 9).
3. Log in as **`familyhub`** with the **Pi's password** (the one set in Imager). VNC uses the
   Pi's own login, so there's no separate VNC password to forget.
4. The first time, the viewer asks you to trust the Pi's identity. Accept it.

You'll see the hub as it is on the wall. The panel's pointer is invisible by design (step 6);
RealVNC Viewer draws your own Mac pointer instead, so clicking still works. To get to a
terminal or the desktop behind the kiosk, SSH is quicker than VNC.

### 9. Tailscale (reach the panel from outside the house)

Same install as step 6d, minus `tailscale serve` (nothing on this Pi needs publishing):

```bash
curl -fsSL https://tailscale.com/install.sh | sudo sh
sudo tailscale up --hostname=family-hub
```

`tailscale up` prints a `login.tailscale.com/a/…` link. Open it on the Mac, sign into the
family tailnet, and click **Connect**. (The Pi only shows up under Machines *after* that link
is approved; it won't be waiting there beforehand.) Check from the Pi with `tailscale status`,
which also prints its tailnet IP and `family-hub.<tailnet>.ts.net` name. After that, `ssh familyhub@family-hub` and VNC to
`family-hub` work from anywhere the Mac has Tailscale on. It also puts the panel inside the
tailnet, which the Home Assistant widget needs (see step 6d: HA is only reachable over Tailscale).

> In the [Tailscale admin console](https://login.tailscale.com/admin/machines), open the
> `family-hub` machine's **⋯** menu → **Disable key expiry**. Otherwise the panel quietly drops
> off the tailnet after 180 days, and the HA widget with it.

### 10. In the hub itself (on the panel)

1. **Sign in with Google** on the panel (the Logitech keyboard is easiest for the password).
2. **Settings → Look & Feel:** leave the hub's own **⌨️ On-screen keyboard** toggle **off**. The
   Pi's squeekboard already pops up for every field; with both on you'd get two keyboards.
3. **Settings → Look & Feel → Motion:** switch off the animations you can live without. They're
   per device, so phones keep theirs. On this Pi the weather animations alone kept a CPU core
   busy (idle CPU ~33% with them running, ~7% paused).

### 11. Memory headroom (measured)

1 GB is tight but it holds. Four minutes after a session restart, signed in, with the month
view, weather and sidebar loaded (desktop and taskbar removed per step 5a):

| | |
|---|---|
| Available RAM | ~330 MB of 905 MB |
| Swapped out | ~185 MB, compressed by zram into ~37 MB of RAM (no SD writes) |
| Idle CPU | ~68% idle with all animations running |

Removing the desktop and taskbar bought back ~100 MB. If it ever gets tight (Chromium tabs
crashing, the hub reloading on its own), check with `free -m` and `vmstat 5`: steady non-zero
`si`/`so` columns mean it's thrashing. The real fix at that point is a Pi 4/5 with 2 GB+.

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
- Settings (name, weather key, API keys)
- Appearance theme
- Weather locations
- Calendar view preferences
- Background photos
- Word of the Day / Dad Joke cache
- Widget placement preferences

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Google sign-in does nothing | Must be served over HTTP/HTTPS — not `file://`. Use the Netlify URL or `http://localhost:8080`. Also ensure the origin is in Authorized JavaScript Origins in Google Cloud Console. |
| "This app isn't verified" warning | Click **Advanced → Go to Family Hub (unsafe)** — this is normal for personal apps in test mode |
| Weather shows nothing after saving key | New OWM keys take up to 2 hours to activate |
| Weather only shows 1–2 forecast days | The free OWM tier returns up to 5 days of 3-hour slots — fewer may appear depending on time of day |
| Meal AI says "rate limited" | You've hit the free daily limit — it resets at midnight Pacific Time |
| Meal AI says "API not enabled" | Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a fresh key in a new project |
| Photos don't appear as background | Re-open the Photos Picker and re-import — Picker sessions expire |
| Calendar shows no events | Check that your Google account is a Test User in Cloud Console |
| Calendars card shows nothing | The card shows a placeholder until you sign in — click **Sign in with Google** |
| Lists don't sync | Verify Firebase config values are correct and Firestore is in test mode |
| Weather or AI not working on Netlify | Go to **Project Configuration → Environment variables** and confirm `OWM_KEY` and `GEMINI_KEY` are set, then trigger a new deploy |
| AI key not found on Netlify | Keys must be added before deploying — Netlify functions read env vars at runtime, but a fresh deploy is required after adding them |
| Word of the Day shows "Loading…" | The dictionary API may be temporarily unavailable — click the ↺ refresh button |
