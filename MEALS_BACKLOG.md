# Meal Planning — Backlog

*Enhancement ideas for the Meal Planning feature (planner modal, week/day meal strips, and the meal detail popup). Constraints: Gemini API (Meals key), three-file no-build architecture, CDN only, free/keyless external services preferred.*

Last updated: 2026-07-06

---

## Already Shipped (for reference)

AI meal suggestions (per-meal-type + "all") · accept to plan · add ingredients to shopping · week-strip + day-chip display · remove buttons · **meal detail popup** (click a planned meal → photo, details, Keep / Adjust / Delete; Adjust re-generates via AI with presets + free-text).

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

## Priority 2 — Import recipe from URL (schema.org/Recipe)

**What:** Paste a recipe URL → pull the dish name + ingredients (and optionally instructions) into the meal plan, and push ingredients to the shopping list (the Meals feature already does ingredients→shopping). Works for **any** site that emits `schema.org/Recipe` JSON-LD — NYT Cooking, AllRecipes, Serious Eats, food blogs — so it's a generic importer, not an NYT-specific integration. Motivated by "add content from our NYT Cooking account."

**Feasibility — PROVEN (probe 2026-07-06):** unauthenticated server-side fetches of NYT Cooking recipe pages (`cooking.nytimes.com/recipes/...`) returned HTTP 200 with the full `schema.org/Recipe` JSON-LD intact — title, all ingredients, and instructions — **even though `isAccessibleForFree: false`** (paywalled). The paywall gates the human-facing render, not the structured metadata. So a proxy fetch + JSON-LD parse gets everything Meals needs.

**Approach:**
- **Fetch** via a small Netlify function (same pattern as `ics.js` / `news.js`) — browsers can't fetch cross-origin recipe pages directly. Send a browser-like User-Agent.
- **Parse:** extract `<script type="application/ld+json">` blocks, find the object whose `@type` is `Recipe` (may be nested in an array or `@graph`), read `name` + `recipeIngredient[]` (+ `recipeInstructions`). ~20 lines, no dependency.
- **Wire into Meals:** new "Import from URL" affordance in the meal planner → prefill a planned meal (`setMealInFs` with name/ingredients/description) → existing "add ingredients to shopping" applies.

**Caveats / must-handle:**
- **Fragile external dependency** — this is undocumented page behavior, not a contract; NYT could gate the JSON-LD anytime. Degrade gracefully: if no parseable `Recipe` is found, show "couldn't read a recipe from that link" and fall back to manual entry.
- **Personal use / ToS** — one-off imports of recipes the user is entitled to, not bulk scraping. No auto-sync of a whole NYT Recipe Box (no API exists for that).
- Respect CSP; keep the fetch server-side. Store the source URL on the meal for reference.

**Acceptance:** Pasting an NYT Cooking (and a non-NYT) recipe URL populates a planned meal's name + ingredients; ingredients export to shopping; an unparseable URL fails cleanly to manual entry.

---

## Notes & Constraints

- **Keyless/free external services only** for images (TheMealDB, LoremFlickr). Respect the CSP in `family-hub.html` (`img-src`, `connect-src`).
- **Three themes.** Any new UI must look correct in dark, light, and nautical modes.
- **No build step.** Inline helpers only.
- **`meal.image` is the persisted hook** — populate it to make any image source instant and reload-safe.
