# Pond Chimes — backlog / next up

Ideas to pick up in a future session. (A new session starts fresh, so this
file is the memory.)

## ⚠️ Branch cleanup pending (from the 2026-08-31 audit)

Four stale branches to delete — **no unmerged work here**, no open PRs. All
four are squash-merged leftovers whose content is already in `main` (squash
rewrites the SHA, so git still reports them as "ahead").

```
git push origin --delete claude/new-session-ww9ro2                 # was ed62bea
git push origin --delete claude/ripple-frog-audio-n6h769           # was 0b7dac4
git push origin --delete claude/session-overview-next-steps-kxgpm2 # was cf1e038
git push origin --delete claude/whats-next-k32r3o                  # was 88bfe43
```

`claude/new-session-ww9ro2` is the one that looked alarming at first glance —
"M2: frogs and dragonflies join the ensemble", 39 commits behind. It's a false
alarm: the frogs and dragonflies are already in `main` (`index.html`,
`README.md` and `docs/CONCEPTS.md` all reference them). The branch is the
pre-squash original.

Any deletion is reversible: `git push origin <sha>:refs/heads/<branch>`.
Enabling **Settings → General → "Automatically delete head branches"** stops
these accumulating.

## Birthday family polish

- **Bunnies on land.** The bunny family (Frankie's birthday, May 10) currently
  sits on the stony shore. Give them a proper patch of land / grass to sit on
  instead of the rocks. See the `bunnyfamily` discovery in `index.html`
  (`placeGroup` positions them along `groundRightAt(...)`, the stone waterline).
- **Add a dad bunny.** Make the bunny family mama **+ dad** + 3 kits (currently
  mama + 3 kits). `bunnyfamily.placeGroup` / the `drawBunny` calls.
- **Add a daddy duck.** Give Jack's duck family (June 5) a **drake** (green head)
  alongside the hen and the 3 ducklings. See the `duckfamily` discovery — add a
  second adult next to `drawMama` (a green-headed drake).

## Notes

- **Matt's birthday message already exists.** On June 8 the narwhal breaches and
  a "Happy birthday, Matt!" card fades in (same as every birthday — see the
  birthday manager in `updateDiscoveries` and the `BIRTHDAYS` table). If a
  bigger / longer / more prominent message is wanted for Matt specifically,
  enhance the card for that entry.

## Handy pointers

- Birthdays are the `BIRTHDAYS` array near the discoveries in `index.html`
  (name, month, day, animal id).
- Hidden test/re-show: press-and-hold on the stony left shore to summon and
  cycle every discovery (including the birthday animals) regardless of date.

## Other deferred (from the README status)

- Feeding mechanic; settings UI; optional weather/season sound; more discoveries.
