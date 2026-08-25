# Pond Chimes — backlog / next up

Ideas to pick up in a future session. (A new session starts fresh, so this
file is the memory.)

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
