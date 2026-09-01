# Meal Planning — Backlog

*Enhancement ideas for the Meal Planning feature (planner modal, week/day meal strips, and the meal detail popup). Constraints: Gemini API (Meals key), three-file no-build architecture, CDN only, free/keyless external services preferred.*

Last updated: 2026-09-01

---

## Already Shipped (for reference)

AI meal suggestions (per-meal-type + "all") · accept to plan · add ingredients to shopping · week-strip + day-chip display · remove buttons · **meal detail popup** (click a planned meal → photo, details, Keep / Adjust / Delete; Adjust re-generates via AI with presets + free-text) · manual entry + **Recipe Box** · **import a recipe from a URL** (schema.org/Recipe — NYT Cooking, AllRecipes, food blogs) · **multi-pass dish photos** (TheMealDB exact → adjective-stripped → main food noun → labelled stock fallback, exact matches persisted).

**Key functions:** `openMealModal`, `generateMealSuggestions`, `callMealAI`, `openMealDetail`, `adjustMeal`, `fetchMealImage`, `persistMealImage` in `family-hub.js`.

---

## ~~Priority 1 — Higher meal-photo hit rate~~ ✅ SHIPPED

*Landed in two parts. Options **1**, **2** and **3** from the original plan all shipped; option 4 (AI-supplied image URLs) stays rejected — model-supplied URLs are routinely hallucinated.*

**Part one (`c09f142`, recorded late):** `fetchMealImage()` became a multi-pass lookup returning `{ url, stock }`; exact matches are written onto the meal by `persistMealImage()` so later opens are instant and survive reloads; a LoremFlickr photo backstops a total miss and is captioned "stock photo" via `#mealStockLabel`.

**Part two (2026-09-01):** the simplification pass only stripped a fixed adjective list from the front and **stopped at the first word it didn't know** — so cuisines and one-off modifiers sank the whole retry. The backlog's own motivating example was among the casualties:

| Meal name | Before | Now |
|---|---|---|
| Creamy Tuscan Chicken Skillet | `Tuscan Chicken Skillet` → miss → stock | → `Chicken Skillet` |
| Cajun Shrimp Pasta | no retry at all → stock | → `Shrimp Pasta` |
| Honey Garlic Salmon Bites | no retry at all → stock | → `Salmon Bites` → `Salmon` |

Added **pass 2b**: search from the main food noun (`MEAL_MAIN_NOUN` — proteins and dish forms, deliberately no cookware) to the end of the name, then the bare noun. `dbLookup` now dedupes, so a query an earlier pass already spent is never repeated.

**Honesty about the label:** a noun match is a photo of the right *food*, not of *this dish*, so pass 2b is flagged `stock:true` — it gets the "stock photo" caption and is **not** persisted. Only passes 1–2, which keep the dish noun intact, count as exact.

**Verified:** `tests/meal-image.test.js` — 19 offline cases (each pass, plurals, the label flag, cache keying, dedupe, and the empty/malformed/offline paths), mirroring the shipped function verbatim per the repo's no-build test convention. Full suite green at 69.

**⚠️ Not verified against the live API.** The implementing session's sandbox egress policy denied `www.themealdb.com` (same wall the recipe-import session hit with NYT), so every pass is exercised against stubs. That run did confirm the degradation path end-to-end: all lookups denied → captioned stock photo, no crash, no hang. **First real meal open on the panel is the live confirmation.**

**Known limits (by design):**
- A transient network failure is cached like a genuine miss, so an offline blip pins a stock photo for the rest of the session (a reload clears `_mealImgCache`).
- `MEAL_MAIN_NOUN` is a fixed list — an unlisted food ("Shakshuka", "Bibimbap") still falls through to the stock photo. Extending it is a one-line change.
- A name that is all cookware and adjectives ("Tuscan Skillet Supper") has no noun to retry on, by design — guessing there would cost a request to gain nothing.

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
