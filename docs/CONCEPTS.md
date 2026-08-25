# Audio Toy Concepts

Planning-stage concepts, captured 2026-07-13. Both are follow-ons to Grid Sings ("The Grid Sings" M1) and share its core: Tone.js + Canvas, single HTML file, no build step, own repo + own Netlify site each. Nothing here starts until Grid Sings M1 ships.

**Suggested build order:** Grid Sings → Pond Chimes → Chord Garden.
Rationale: Grid Sings solves audio scheduling + touch-on-RAYPODO. Pond Chimes is the smallest project and reuses the ripple animation. Chord Garden has the most new design work (growth states, plant art).

**Design status (2026-07-13):** UI mockups for both toys built and **approved by Matt** as the design direction. Mockups are silent/visual-only (`pond-chimes-mockup.html`, `chord-garden-mockup.html`) and serve as the visual spec for the real builds. **Locked:** each toy keeps its own palette identity — moonlit pond (deep teal-black, cool ripple whites) vs. dusk garden (plum-ember sky, warm soil) — rather than a shared family theme. Sound design is deliberately not locked yet.

---

## Pond Chimes

**One-liner:** An ambient, self-playing pond that sings when you tap the fish. A screensaver with a voice.

**Core interaction**
- Dark water surface; koi/goldfish silhouettes drift on lazy paths.
- Tap a fish → it darts, a ripple expands, a note plays.
- Pitch mapped to fish Y position at tap time, locked to a pentatonic scale.

**Idle mode**
- Pond life occasionally acts on its own (fish surface, frog croaks, dragonfly lands) — the toy self-plays as gentle ambient background. Ideal default state for the wall panel.

**The pond ensemble (creature → voice mapping)**

| Creature | Behavior | Sound role |
|---|---|---|
| Fish | Drift underwater; tap → dart + ripple | Marimba/kalimba pluck, pitch from Y position (the melodic core) |
| Lily pads + water lilies | Static anchors on the surface; tap a lily flower → it opens/closes | Soft sustained chord swell — the harmonic bed. Open flowers hold their chord tone in the drone |
| Frogs | Sit on lily pads; tap → hop to another pad with a splash | Plucked bass-guitar note — the bass voice. Occasional idle croak |
| Dragonflies | Skim across the surface in darting paths; tap → quick zigzag | Short high shimmer/flutter arp — sparkle on top |
| Hummingbirds | Rare visitors hovering at lilies near the edges | Fast tremolo trill, highest register — a treat, not a regular |

Everything stays pentatonic/key-locked, so any combination of taps sounds intentional. Each creature type = one register of a natural little ensemble: lilies (harmony) / frogs (bass) / fish (melody) / dragonflies + hummingbirds (sparkle).

**Sound**
- One synth voice per creature type, shared key + scale.
- Low sustained pad drone underneath for warmth, fed by open lily flowers.

**Visuals**
- Expanding ripple rings on water triggers (shared DNA with Grid Sings ripple).
- Overlapping ripples interact visually (interference shimmer) — cosmetic only.
- Frog hops and dragonfly darts double as trigger animations.

**Suggested M-scoping (assumption, adjust at design lock)**
- M1: fish + lily pads (melody + harmonic bed) — proves the whole feel.
- M2: frogs + dragonflies.
- M3: hummingbirds + any idle-behavior polish.

**Explicitly deferred:** day/night cycle, seasons, feeding mechanic, creature unlocks, any settings UI.

**Notes**
- The pond ensemble grows this beyond the original "smaller than Grid Sings" estimate — it's now a comparable-sized project. Flagged, not a problem.
- Thematic tie-in to the real backyard pond.

---

## Chord Garden (chili edition)

**One-liner:** Plant chili peppers that grow into looping arpeggios. Heat level = harmonic tension.

**Core interaction**
- Dirt bed along the bottom of the screen.
- Tap to plant a seed → grows to maturity over ~6 seconds → loops an arpeggio. *(Was ~10s; mockup's 6s felt right and is approved.)*
- Tap a mature plant to pull it (poof animation). *(Simplified from pull/drag per the approved mockup.)*
- Seed tray along the bottom: six pepper chips labeled with name + chord; approved as the only UI chrome.
- All plants quantized to a shared key and tempo, so any combination sounds intentional.

**The roster (Scoville → tension mapping)**

| Pepper | Chord | Character |
|---|---|---|
| Hatch | major add9 | Warm, open, roasted — the comfort chord |
| Jalapeño | minor 7th | A little bite |
| Cayenne | dominant 7th | Bright, sharp heat |
| Habanero | 7♯9 (Hendrix chord) | Appropriately spicy |
| Ghost | diminished shimmer | Rarely plant more than one |
| Carolina Reaper | chaotic cluster | A musical dare |

**Possible mappings (to decide at design lock)**
- Plant height or pepper count → arpeggio speed or octave.
- Plant position (X) → pan and/or arpeggio phase offset.

**Signature touch (backlog)**
- Mature Hatch plants occasionally get a char/smoke animation with a subtle low-pass "roasted" warmth on their arpeggio.

**Explicitly deferred:** watering/pruning mechanics, seasons, seed unlocks, saving garden state, grown-up mode with custom chords.

**Notes**
- Heat-as-tension doubles as a genuine harmony teaching metaphor for the kids.
- Art approach settled by the approved mockup: procedural Canvas drawing (bezier peppers, parametric stems/leaves), no sprite assets needed. Per-variety signatures approved: reaper jitter-on-pulse, heat shimmer on the hot three, Hatch smoke wisps, ghost pepper translucency flicker.
- Rhythm model from the mockup (shared 104 BPM 8-step cycle, per-variety step patterns) is placeholder — real chord voicings and patterns get designed with Tone.js at build time.

---

## Shared open questions (all audio toys)

1. Extract a tiny shared audio core after Grid Sings, or copy-paste per project? (Lean copy-paste — simplest thing, three small projects don't justify a library yet.)
2. Naming — working titles only. Candidates can accumulate here.
3. Kiosk rotation: does Fully Kiosk cycle between these + Family Hub, or is each a manually chosen URL? Decide once two of them exist.
