# Meal Planning — Backlog

*Enhancement ideas for the Meal Planning feature (planner modal, week/day meal strips, and the meal detail popup). Constraints: Gemini API (Meals key), three-file no-build architecture, CDN only, free/keyless external services preferred.*

Last updated: 2026-09-01

---

## Already Shipped (for reference)

AI meal suggestions (per-meal-type + "all") · accept to plan · add ingredients to shopping · week-strip + day-chip display · remove buttons · **meal detail popup** (click a planned meal → photo, details, Keep / Adjust / Delete; Adjust re-generates via AI with presets + free-text) · manual entry + **Recipe Box** · **import a recipe from a URL** (schema.org/Recipe — NYT Cooking, AllRecipes, food blogs).

**Key functions:** `openMealModal`, `generateMealSuggestions`, `callMealAI`, `openMealDetail`, `adjustMeal`, `fetchMealImage` in `family-hub.js`.

---

## Priority 1 — Higher meal-photo hit rate  ⭐ NEXT UP

**Problem:** The detail popup fetches dish photos from **TheMealDB** (free, keyless), which only matches its ~300 known dishes. Most AI-generated meal names (e.g. "Creamy Tuscan Chicken Skillet") return no match and fall back to the emoji placeholder, so photos appear less often than would be ideal.

**Already in place:** `openMealDetail()` checks a stored `meal.image` field **first** before falling back to TheMealDB — so any of the approaches below just needs to populate `meal.image`.

**Options (pick one or combine):**
1. **Persist a found photo.** When TheMealDB *does* match, write the thumb URL onto the meal (`setMealInFs` with `image`) so it's instant next time and survives reloads. Low effort; only helps matched dishes.
2. **Fuzzy / simplified query.** Before giving up, retry TheMealDB with a simplified name (drop adjectives, use the main protein/dish noun, e.g. "chicken skillet" → "chicken"). Cheap; modest hit-rate gain, lower accuracy.
3. **Broader keyless image source.** Use a generic food-photo service (e.g. LoremFlickr `https://loremflickr.com/600/400/{keywords}`) as a final fallback. **Always returns a photo**, but it's *representative*, not the exact dish — flag visually (e.g. "stock photo") so it isn't mistaken for the real plate. Respect CSP `img-src`.
4. **AI-provided image URL.** Ask the model for an `image` URL during generation/adjust. ❌ Not recommended — model-supplied URLs are frequently hallucinated/broken.

**Recommendation:** Ship **#1 (persist matches)** + **#2 (simplified-query retry)** first — both improve accuracy without misleading stock imagery. Consider **#3** only behind a clear "representative image" label.

**Acceptance:** More planned meals show a photo; matched photos persist across reloads; any non-exact image is clearly labeled; emoji placeholder remains the final fallback.

---

## ~~Priority 2 — Import recipe from URL (schema.org/Recipe)~~ ✅ SHIPPED 2026-09-01

**What shipped:** Paste a recipe URL in the Add-a-Meal modal's **📖 Recipe Box** tab → the dish name, ingredients, instructions, photo, servings and total time are parsed and stored in our own `recipeBox` database, then either saved for later or dropped straight into the open meal slot. Ingredients flow to the shopping list through the existing path. Generic by design — **any** site emitting `schema.org/Recipe` JSON-LD works; NYT Cooking was the motivating case, not a special case.

**Where it lives:**
- `netlify/functions/recipe.js` — server-side fetch + JSON-LD parse. `GET ?url=<encoded>` → `{ok:true, recipe}` / `422 {ok:false,error:'no-recipe'}`. Browser-like User-Agent, 15s timeout, 5MB cap, content-type check, hostname SSRF guard (same pattern as `ics.js`/`news.js`).
- `tests/recipe.test.js` — 50 offline cases: every JSON-LD shape in the wild (`@type` string vs array, `@graph`/`mainEntity` nesting, `HowToStep`/`HowToSection` instructions, ISO-8601 durations, `ImageObject`), plus handler paths with `global.fetch` stubbed.
- `family-hub.js` — `importRecipeFromUrl()`, `renderRecipeImportPreview()`, `saveImportedRecipe()`, `useImportedRecipe()`, `recipeToMeal()`, `recipeExtras()`; the `recipeBox` record gained optional `instructions`/`sourceUrl`/`sourceName`/`image`/`servings`/`totalTime`/`author`/`cuisine`/`paywalled` fields.
- `#mealDetailSteps` — collapsed instructions block in the meal detail popup.

**Feasibility — PROVEN (probe 2026-07-06):** unauthenticated server-side fetches of NYT Cooking recipe pages (`cooking.nytimes.com/recipes/...`) returned HTTP 200 with the full `schema.org/Recipe` JSON-LD intact — title, all ingredients, and instructions — **even though `isAccessibleForFree: false`** (paywalled). The paywall gates the human-facing render, not the structured metadata.

**⚠️ Not re-verified live since the probe.** The implementing session (2026-09-01) could not reach `cooking.nytimes.com` — the sandbox egress policy blocked the host on both available network paths — so the parser was built and tested against fixtures shaped like the recorded probe output. **First real NYT paste is the live confirmation.** If NYT has since gated the JSON-LD, the symptom is a clean "couldn't read a recipe from that link", not a crash.

**Known limits (by design):**
- **Fragile external dependency** — undocumented page behavior, not a contract. Degrades to `no-recipe` → "Type It In".
- **Personal use / ToS** — one-off imports of recipes you're entitled to, not bulk scraping. **No auto-sync of a whole NYT Recipe Box — no API exists for that**, and reaching a saved-recipe collection would mean authenticating as the user and scraping a logged-in page. Out of scope.
- **Netlify-only** — like the ICS proxy, import needs the functions running (`netlify dev` on :8888 or the deployed site). Plain `python3 -m http.server` gets a clear message saying so, not a silent failure.

---

## Notes & Constraints

- **Keyless/free external services only** for images (TheMealDB, LoremFlickr). Respect the CSP in `family-hub.html` (`img-src`, `connect-src`).
- **Three themes.** Any new UI must look correct in dark, light, and nautical modes.
- **No build step.** Inline helpers only.
- **`meal.image` is the persisted hook** — populate it to make any image source instant and reload-safe.
