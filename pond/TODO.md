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
