# Event Discovery Backend Testing Setup

Quick reference for setting up and testing the Netlify functions backend locally.

---

## Prerequisites

✅ Already installed:
- Node.js & npm (tested with v11.12.1)
- Netlify CLI (installed globally in this session)

---

## Step 1: Get API Keys (Free Tier)

### Ticketmaster Discovery API
1. Visit: https://developer.ticketmaster.com/
2. Sign up or login
3. Create a new application
4. Copy your **API Key** (found in app details)
5. Save it for `.env.local`

### Eventbrite API
1. Visit: https://www.eventbrite.com/platform/api/
2. Login to your Eventbrite account
3. Create OAuth application OR get Personal OAuth Token
4. Copy your **OAuth Token** or **API Key**
5. Save it for `.env.local`

### OpenWeatherMap API
1. Visit: https://openweathermap.org/api
2. Sign up (free tier available)
3. Go to API Keys section
4. Copy your **API Key**
5. Save it for `.env.local`

---

## Step 2: Configure Environment Variables

Edit or create `.env.local` in the project root:

```bash
# Option A: Edit existing file
nano /Users/matt/Documents/Claude/Projects/Family\ Hub/.env.local

# Option B: Create new with your keys
cat > /Users/matt/Documents/Claude/Projects/Family\ Hub/.env.local << EOF
TICKETMASTER_KEY=your_ticketmaster_api_key_here
EVENTBRITE_KEY=your_eventbrite_api_key_here
OWM_KEY=your_openweathermap_api_key_here
EOF
```

---

## Step 3: Start Netlify Dev Server

```bash
cd /Users/matt/Documents/Claude/Projects/Family\ Hub
netlify dev
```

Expected output:
```
Starting Netlify Dev server...
ld v18.0.0
✔ Loaded function /netlify/functions/events
⠙ Waiting for framework detection...
◈ Netlify Dev server running at http://localhost:8888
```

The dev server runs on `http://localhost:8888`

---

## Step 4: Test Backend with curl

### Test 1: Basic Event Fetch (Portland)
```bash
curl "http://localhost:8888/.netlify/functions/events?location=Portland&radius=120"
```

Expected response:
```json
{
  "success": true,
  "events": [
    {
      "id": "tm_...",
      "title": "Concert Name",
      "type": "concert",
      "source": "ticketmaster",
      "date": "2026-06-25",
      "time": "19:30",
      "location": {
        "city": "Portland",
        "state": "OR",
        "address": "123 Main St",
        "lat": 45.5234,
        "lon": -122.6762,
        "distanceMiles": 5.2
      },
      "weather": {
        "condition": "Cloudy",
        "temp": 72,
        "precipitation": 10
      },
      "calendarConflict": false,
      "description": "...",
      "sourceUrl": "..."
    }
    // ... more events
  ],
  "location": "Portland",
  "radius": 120,
  "timestamp": 1718714400000,
  "sourceStats": {
    "ticketmaster": 15,
    "eventbrite": 8,
    "estatesales": 0,
    "craigslist": 0
  },
  "warnings": []
}
```

### Test 2: Different Location (Seattle)
```bash
curl "http://localhost:8888/.netlify/functions/events?location=Seattle&radius=60"
```

### Test 3: Filter by Event Type
```bash
curl "http://localhost:8888/.netlify/functions/events?location=Portland&radius=120&eventTypes=concert,show"
```

### Test 4: Check Error Handling (Bad Location)
```bash
curl "http://localhost:8888/.netlify/functions/events?location=NonexistentCity12345&radius=120"
```

Expected: Error response with helpful message

---

## Step 5: Test UI with Backend

1. Open browser to: http://localhost:8888/family-hub.html
2. Click ⚙️ (Settings) in top-left
3. Go to **Events** tab
4. Configure location (e.g., "Portland") and distance (e.g., "2 hours")
5. Click **Save**
6. Click 💡 (Events discovery button) on calendar header
7. Watch modal load events in real-time

### Expected Behavior

**First load:**
- Modal opens
- Age label: "Refreshing…"
- Loading spinner in event list

**Fresh data arrives:**
- Age label: "🟢 Fresh — just now"
- Event cards appear with:
  - Title + type badge (concert, show, etc.)
  - Date/time
  - Location + distance
  - Calendar status (✓ You're free or ⚠ You're busy)
  - Weather (emoji + temp + condition)
  - Link to event source

**Sorting:**
- Dropdown to sort by "distance" or "date"
- Event order updates immediately

**Filtering:**
- Type filter input to search by event type
- Event list updates as you type

**Manual Refresh:**
- Click "Refresh" button
- Loading spinner appears
- Fresh data fetches from backend

---

## Troubleshooting

### "TICKETMASTER_KEY not set" error
**Problem:** API key not in `.env.local` or env var not loaded  
**Solution:**
1. Check `.env.local` exists and has the key
2. Make sure you're running `netlify dev` (not plain `python3 -m http.server`)
3. Try restarting `netlify dev` after editing `.env.local`

### 403 Forbidden from API
**Problem:** API key is invalid or expired  
**Solution:**
1. Verify the API key is copied correctly (no extra spaces)
2. Check the API service's dashboard to ensure key is active
3. For Ticketmaster: keys may take a few minutes to activate
4. For OWM: free keys may take 2+ hours to become active

### No events returned
**Problem:** Valid API calls but empty results  
**Possible causes:**
- Location name misspelled
- Radius too small
- No events in that area/date range
- Eventbrite/Ticketmaster have no listings for that city
**Solution:** Try major city like "New York" or "Los Angeles" to verify APIs work

### Network timeout
**Problem:** Curl hangs or times out  
**Solution:**
1. Check `netlify dev` is running (check terminal where you started it)
2. Check port 8888 is accessible: `curl http://localhost:8888/` should respond
3. Try shorter timeout: `curl --max-time 10 http://localhost:8888/.netlify/functions/events?location=Portland&radius=120`

### "Cannot find module 'cheerio'" error
**Problem:** Craigslist/estatesales scrapers try to use cheerio  
**Expected:** Currently placeholders, not implemented  
**Solution:** Ignore for now; Ticketmaster + Eventbrite work without it

---

## What to Expect

### Successful Backend
✅ Returns 200 OK with JSON  
✅ `"success": true`  
✅ Events from multiple sources (Ticketmaster, Eventbrite)  
✅ Each event has all required fields (title, date, location, weather, etc.)  
✅ `sourceStats` shows counts from each API  
✅ `warnings` is empty array (no source failures)

### Partial Failures (Still OK)
⚠️ One API fails (e.g., Eventbrite timeout)  
⚠️ Response still `"success": true`  
⚠️ Events from working sources included  
⚠️ `warnings: ["eventbrite unavailable"]` present  
⚠️ `sourceStats.eventbrite: 0`

### Full Failure
❌ Response `"success": false`  
❌ Error message explains reason  
❌ No events returned  
❌ Retry with fresh API keys or contact API providers

---

## File Locations

| File | Purpose |
|------|---------|
| `.env.local` | Local API keys (gitignored) |
| `netlify/functions/events.js` | Backend function code |
| `family-hub.html` | Modal UI structure |
| `family-hub.js` | Event modal logic, caching |
| `family-hub.css` | Event card styling |
| `EVENT_DISCOVERY.md` | Full feature documentation |

---

## Next Steps After Testing

1. ✅ Verify backend returns data
2. ✅ Verify UI renders events correctly
3. ✅ Test sorting/filtering works
4. ✅ Test calendar conflict detection
5. ✅ Test error handling (unplug internet, etc.)
6. Code review on GitHub
7. Merge to main
8. Deploy to production (add keys to Netlify dashboard)

---

## Quick Commands Reference

```bash
# Start dev server
cd /Users/matt/Documents/Claude/Projects/Family\ Hub && netlify dev

# Test basic backend
curl "http://localhost:8888/.netlify/functions/events?location=Portland&radius=120"

# Format JSON response (requires jq)
curl -s "http://localhost:8888/.netlify/functions/events?location=Portland&radius=120" | jq '.'

# Edit environment variables
nano /Users/matt/Documents/Claude/Projects/Family\ Hub/.env.local

# Check if Netlify CLI is working
netlify --version

# Check if port 8888 is free
lsof -i :8888
```

---

## Support

For issues or questions:
1. Check EVENT_DISCOVERY.md for detailed documentation
2. Review git commits on feat/event-discovery branch
3. Check browser console (DevTools → Console) for client-side errors
4. Check netlify dev terminal output for server-side errors
