# Family Hub — Easter Egg Backlog

*Hidden delights for power users and the easily amused. Each egg should be surprising, harmless, and self-resetting. No egg should break any real feature or require cleanup.*

Last updated: 2026-06-12

---

## Implementation Notes

- **Konami sequence detector:** rolling key buffer on `document` keydown.
- **Assistant trigger detection:** intercept in `sendAssistantMessage()` before the Gemini call — matched phrases return a canned response and skip the API.
- **Click counter pattern:** store count + timestamp per element; reset if clicks slow down.
- **CSS chaos:** add a scoped body class, remove after a timeout.
- **Confetti:** pure-JS canvas `spawnConfetti()` — no CDN.
- **Toast:** `showToast(msg, duration)` — shared utility already in place.
- **No persistence needed** — all eggs are session-only.

---

## ✅ Shipped

| Egg | Trigger | Notes |
|---|---|---|
| **Konami Code** | ↑↑↓↓←→←→BA | Full-page rainbow hue-rotate + 🌈 KONAMI burst, 3 s |
| **You Shall Not Pass** | Assistant: "you shall not pass" | Settings modal shakes + Gandalf deflection |
| **42 / Answer to Everything** | Assistant: "answer to life…" | Returns 42 + pending to-do count |
| **Don't Panic** | Assistant: "don't panic" | Calm briefing prefaced with the Guide's motto |
| **The Spice Must Flow** | Assistant: "the spice must flow" | Dune shopping list lore |
| **Tell Me the Future** | Assistant: "tell me the future" | Mentat disclaimer + live briefing |
| **My Precious** | Assistant: "my precious" | Gollum voice about top to-do |
| **Second Breakfast** | Assistant: "what time is it" | Hobbit time response |
| **Hobbit Dinner** | Assistant: "what's for dinner" (no meal planned) | Hobbit hole shrug |
| **I Am No Man** | Assistant: "i am no man" | Éowyn pivot |
| **So Say We All** | Assistant: "so say we all" | Just solidarity |
| **Politeness** | Assistant: "please" (standalone) | Unusual warmth |
| **Darker Mode** | Assistant: "darker mode" | Dims to near-black, snaps back |
| **One List to Rule Them All** | Shopping list hits exactly 9 pending items | 💍 pill banner fades in/out |
| **Calendar Worm** | Hold a calendar day cell for 3 s | 🪱 wriggles up from the cell and fades |
| **Birthday Confetti** | Assistant: "it's my birthday" / "it's [name]'s birthday" | Canvas confetti + named response |
| **Destroy the Ring** | Check off a to-do exactly named "destroy the ring" | 🌋 orange glow + fire toast |
| **Emoji Fireworks** | Click app title emoji 7× in 2 s | 12 colored sparks radiate from emoji |
| **Don't Panic Budget** | Monthly bills total exactly $42.00 | DON'T PANIC badge next to amount |
| **Perfect Weather** | Temperature exactly 72°F | 😎 pulses after the temp, 5 s |
| **Heatwave** | Temperature ≥ 100°F | 💧 sweat drops fall down the weather card |
| **Full Moon Glow** | Moon phase is 🌕 | Continuous silver pulse on moon emoji in ticker |
| **Weather on Arrakis** | Assistant: "arrakis" | Fremen weather report |
| **May the 4th** | Today is May 4 and it's in the calendar view | ⭐ pulsing badge in the nav label |
| **Seasonal Title Emoji** | Dec 25 / Oct 31 / Feb 14 | App emoji → 🎄 / 🎃 / 💝 for the day |
| **Back to the Future** | Drag calendar event onto today | ⚡ "Back to the future!" toast |
| **Welcome Back to the Shire** | Click Refocus/Today when calendar is away | Toast: "The Shire has been quiet in your absence, [name]." |
| **Inconceivable** | Assistant: "inconceivable" | Princess Bride quote |
| **As You Wish** | Assistant: "as you wish" | Princess Bride acknowledgement |
| **Inigo Montoya** | Assistant: "my name is inigo montoya" | Princess Bride productivity pivot |
| **I'll Be Back** | Assistant: "i'll be back" | Terminator confirmation |
| **I Want to Believe** | Assistant: "i want to believe" | X-Files + shopping count |
| **Make It So** | Assistant: "make it so" | TNG captain response |
| **Beam Me Up** | Assistant: "beam me up" | No intelligent life on the shopping list |
| **Show Me the Money** | Assistant: "show me the money" | Jerry Maguire budget readout |
| **Yada Yada Yada** | Assistant: "yada yada yada" | Seinfeld daily briefing |
| **No Soup for You** | Assistant: "no soup for you" | Soup Nazi, then relents |
| **How You Doin** | Assistant: "how you doin" | Friends Joey response |
| **You Can't Handle the Truth** | Assistant: "you can't handle the truth" | A Few Good Men blunt report |
| **Bueller** | Assistant: "bueller" | Ferris Bueller pending tasks |
| **Party On** | Assistant: "party on wayne/garth" | Wayne's World one-liner |
| **Excellent** | Assistant: "excellent" | Bill & Ted one-liner |
| **Houston We Have a Problem** | Assistant: "houston we have a problem" | Apollo 13 mission status |
| **What Is the Matrix** | Assistant: "what is the matrix" | Matrix lore + task count + no spoon |
| **Wax On Wax Off** | Assistant: "wax on wax off" | Karate Kid list discipline |
| **It's Dangerous to Go Alone** | Assistant: "it's dangerous to go alone" | Zelda — adds motivational to-do |
| **IDDQD** | Assistant: "iddqd" | Doom god mode, shopping unaffected |
| **IDKFA** | Assistant: "idkfa" | Doom all weapons, fridge still locked |
| **Do a Barrel Roll** | Assistant: "do a barrel roll" | Full-page CSS rotateY flip |
| **Home Alone** | Calendar: December 24 | Toast: "Merry Christmas, ya filthy animal." |
| **Independence Day** | Calendar: July 4 | Badge: "🇺🇸 Today we celebrate our Independence Day!" |
| **Groundhog Day** | Calendar: February 2 | Toast: "It's Groundhog Day… again." |
| **Jarvis** | Assistant renamed to "Jarvis" | Character voice in all Gemini responses; phrase triggers: hello, diagnostics, status report, "yes jarvis", thanks, initiate |
| **HAL 9000** | Assistant renamed to "HAL 9000" | Character voice in all Gemini responses; phrase triggers: open the pod bay doors, hello, sing daisy, are you safe, shut down |
| **Alfred** | Assistant renamed to "Alfred" | Character voice in all Gemini responses; phrase triggers: hello, where's batman, to the batmobile, thanks, why do you serve |
| **Hadouken** | Assistant: "hadouken" | Glowing blue energy ball slides across the viewport |
| **Vogon Poetry** | Assistant: "vogon poetry" / "recite my shopping list" / "oh freddled" | Terrible verse built from current shopping items |

---

## 🎬 80s / 90s Movies, TV & Video Games

### Princess Bride

#### Assistant: "inconceivable"
*"You keep using that word. I do not think it means what you think it means."*

#### Assistant: "as you wish"
Repeats whatever the previous user message was, but formatted as a gracious command acknowledgement: *"As you wish. [previous request]."* Falls back to *"As you wish — your every command is noted, though I'll need a bit more detail."* if there's no prior message.

#### Assistant: "my name is inigo montoya"
*"You killed my productivity. Prepare to get organized."*

---

### Terminator

#### Assistant: "i'll be back"
*"Confirmed. I will return. I mean, I'm already here, but — noted."*

---

### X-Files

#### Assistant: "i want to believe"
*"The truth is out there. Also, you have [n] items on your shopping list that remain unexplained."*

---

### Star Trek: The Next Generation

#### Assistant: "make it so"
*"Aye, Captain."* — then attempts to re-execute the previous message as if it were a command (re-sends it through the assistant pipeline).

#### Assistant: "beam me up"
*"No intelligent life detected in the vicinity of the shopping list. Transporting anyway."*

---

### Jerry Maguire

#### Assistant: "show me the money"
Responds with a dramatic readout of the current weekly and monthly budget totals: *"YOU. COMPLETE. ME. Also: this week [x], this month [y]."*

---

### Seinfeld

#### Assistant: "yada yada yada"
*"…and that's when I realized: here's your day."* then delivers a terse briefing of today's calendar, to-dos, and shopping.

#### Assistant: "no soup for you"
*"NO SOUP FOR YOU."* — pauses 2 seconds — *"…fine. What do you need?"*

---

### Friends

#### Assistant: "how you doin"
*"Hey. How YOU doin'? (I'm an assistant. I don't actually know how I'm doing. What can I help you with?)"*

---

### A Few Good Men

#### Assistant: "you can't handle the truth"
Delivers a blunt mission report: overdue tasks, unchecked shopping items, unplanned meals. No softening. *"You want the truth? Here it is. [list of problems]."*

---

### Ferris Bueller's Day Off

#### Assistant: "bueller"
Checks for any to-do items assigned to other family members that aren't done: *"Bueller… Bueller… [names]? Anyone? Anyone? [n] tasks still waiting on someone."* If none assigned: *"Bueller… Bueller… crickets. You're on your own."*

---

### Wayne's World

#### Assistant: "party on wayne" / "party on garth"
*"Party on."* Nothing else.

#### Assistant: "excellent" (standalone)
*"Excellent."* — Bill & Ted crossover bonus. Nothing else.

---

### Apollo 13

#### Assistant: "houston we have a problem"
Scans for issues and reports them as a mission status: overdue to-dos, empty shopping list, unplanned meals today, any bills past due. Tone: calm but concerned. *"Houston, we copy. Here's the situation…"*

---

### Home Alone

#### Calendar: December 24th
When the calendar shows December 24, a toast fires: *"Merry Christmas, ya filthy animal."*

---

### Independence Day

#### Calendar: July 4th
When today is July 4 and in the calendar view, shows a header badge: *"🇺🇸 Today we celebrate our Independence Day!"*

---

### Groundhog Day

#### Calendar: February 2nd
When today is February 2 and in the calendar view: *"It's Groundhog Day… again."* toast.

---

### The Matrix

#### Assistant: "what is the matrix"
*"The Matrix is everywhere. It is all around us. Even now, in this very room. Also, you have [n] tasks. There is no spoon."*

---

### Karate Kid

#### Assistant: "wax on wax off"
*"The discipline of the list is the discipline of the mind. Wax on: add an item. Wax off: check it done."*

---

## 🎮 Video Game Easter Eggs

### The Legend of Zelda

#### Assistant: "it's dangerous to go alone"
*"Take this."* — adds a random motivational tip as a to-do item: e.g., "Take a 5-minute walk", "Drink some water", "Check in with someone you love".

---

### Doom

#### Assistant: "iddqd" (god mode cheat)
*"God mode activated. You are now invincible. (This changes nothing about the shopping list.)"*

#### Assistant: "idkfa" (all weapons cheat)
*"You now have all weapons, full ammo, and every key. I have checked: none of them open the fridge."*

---

### Star Fox

#### Assistant: "do a barrel roll"
The entire page does a single 360° CSS `rotateY` flip over 0.8 seconds, then returns to normal. *"Barrel roll complete. Enemy neutralized."*

---

### Oregon Trail

#### Clear all shopping items at once (clear-done or clear-all)
1-in-5 chance: instead of the normal empty state, shows *"🪦 [userName] has died of dysentery."* for 3 seconds before reverting to normal.

---

### Street Fighter

#### Assistant: "hadouken"
*"HADOUKEN!"* — a `div` styled as a glowing energy ball slides across the screen from left to right and fades. Pure CSS animation.

---

## 🎯 General Interaction Eggs

### Player 1 Has Entered the Game
When the user successfully signs in with Google OAuth, show a toast: *"🎮 PLAYER 1 HAS ENTERED THE GAME"*

### Game Over — You Win
When both the to-do list AND shopping list are simultaneously empty (both hit 0 at the same time), trigger full confetti + toast: *"🎮 GAME OVER — You win!"*

### Level Up
When an item is added that brings any single list to exactly 100 total items ever (cumulative, not just active), show a toast: *"🎮 LEVEL UP!"*

---

## Remaining Priority Order

| # | Egg | Effort |
|---|---|---|
| 1 | Player 1 has entered the game | Low — sign-in hook |
| 2 | Oregon Trail dysentery (1-in-5) | Low — clear-all hook |
| 3 | Game Over — both lists empty | Low — render check |
| 4 | Eleventy-one countdown | Low |
| 5 | Victorian weather oracle (Shift+click) | Low |
| 6 | Budget row × 3 escalation | Low |
| ~~7~~ | ~~Complete last to-do → confetti~~ | ✅ |
| ~~8~~ | ~~Triple-click temperature unit conversion~~ | ✅ |
| 11 | "Are you sentient?" | Low |
| 12 | "Who made you?" credits | Low |
| 13 | Same message × 3 | Low |
| 14 | "Please" × 3 escalation | Low |
| 15 | Moon phase click × 5 / howl | Low |
| 16 | Shopping scroll "There and back again" | Medium |
| 17 | Triple-click settings meta overlay | Medium |
| 18 | $666 budget 😈 | Low |
| 19 | Countdown hits 0 → eagles | Low |
| 20 | "Tell me a joke" | Low |
| 21 | "Sing me a song" Vogon poetry | Medium |
| 22 | Level Up at 100 items | Low |
