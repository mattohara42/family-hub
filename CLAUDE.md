# Pond Chimes — working notes for Claude

## Workflow

**Always commit and merge.** Finish the job: commit the work, push to the
working branch, open the PR, mark it ready, and merge it. Don't leave changes
uncommitted or a PR sitting in draft waiting for a nudge.

Match the repo's history style — merge commits, not squash.

## Layout

Single static `index.html` (Tone.js + Canvas), no build step. `vendor/Tone.js`
is checked in. `docs/CONCEPTS.md` holds the creature/voice design table and
`README.md` the feature list and milestone status — when behaviour changes,
update both so they don't drift.

`TODO.md` is the cross-session backlog; a new session starts fresh, so that
file is the memory.

## Verifying

Use the `verify` skill — it has the headless-browser recipe for driving the
pond and capturing audio evidence (every voice goes through
`triggerAttackRelease`, so wrapping the prototypes is how you "hear" it).
Keep that skill current when the synth setup changes.
