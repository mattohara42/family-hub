# Meal Planning — Backlog

*Enhancement ideas for the Meal Planning feature (planner modal, week/day meal strips, and the meal detail popup). Constraints: Gemini API (Meals key), three-file no-build architecture, CDN only, free/keyless external services preferred.*

Last updated: 2026-06-04

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

## Notes & Constraints

- **Keyless/free external services only** for images (TheMealDB, LoremFlickr). Respect the CSP in `family-hub.html` (`img-src`, `connect-src`).
- **Three themes.** Any new UI must look correct in dark, light, and nautical modes.
- **No build step.** Inline helpers only.
- **`meal.image` is the persisted hook** — populate it to make any image source instant and reload-safe.
