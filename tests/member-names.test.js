// Golden test for stripMemberNames() — mirrors the copy in family-hub.js
// (no-build monolith has no harness). Run: node --test tests/member-names.test.js
// ponytail: deliberate duplication so the Month-pill title cleanup has a runnable check.
//
// The two definitions below are spliced verbatim from family-hub.js. If you change
// them there, change them here. What they protect: a phone's Month pill shows the
// title without family members' names (their colors show who instead), so the
// cleanup must leave the meaningful part and never eat words that aren't names.

const test = require('node:test');
const a = require('assert');

/** Matches a member's name as a whole word, possessive included ("Jack's"). */
function memberNameRe(name, flags) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${esc}(['’]s)?\\b`, flags);
}

/** The title with member names taken out, plus the joiners that only made
 *  sense between them ("Jack & Matt", "Jack, Matt and Kate") and any dash or
 *  colon left at either end: "Jack & Matt - Dentist" → "Dentist". An "and"
 *  elsewhere in the title stays. Falls back to the full title when nothing
 *  would be left. */
function stripMemberNames(summary, names) {
  const NAME = '\u0000';
  let t = summary || '';
  names.forEach(name => { t = t.replace(memberNameRe(name, 'gi'), NAME); });
  const joined = new RegExp(`${NAME}\\s*(?:,|&|\\+|\\band\\b)\\s*${NAME}`, 'i');
  while (joined.test(t)) t = t.replace(joined, NAME);
  t = t.replace(new RegExp(`\\s+(?:with|for)\\s+${NAME}\\s*$`, 'i'), '');   // "Lunch with Jack"
  t = t.split(NAME).join(' ')
       .replace(/\s+/g, ' ')
       .replace(/^[\s,&+:\-–—/|]+|[\s,&+:\-–—/|]+$/g, '');
  if (!t) return summary || '';
  return t[0].toUpperCase() + t.slice(1);
}

const cases = [
  ['Jack hockey practice',        ['Jack'],                'Hockey practice'],
  ['Jack & Matt - Dentist',       ['Jack', 'Matt'],        'Dentist'],
  ['Jack, Matt and Kate dinner',  ['Jack', 'Matt', 'Kate'], 'Dinner'],
  ["Kate's soccer and swim",      ['Kate'],                'Soccer and swim'],
  ['Dentist: Jack',               ['Jack'],                'Dentist'],
  ['Lunch with Jack',             ['Jack'],                'Lunch'],
  ['Rock and Roll with Matt',     ['Matt'],                'Rock and Roll'],
  ['Pick up Jack from school',    ['Jack'],                'Pick up from school'],
  ['Jackson Hole trip',           ['Jack'],                'Jackson Hole trip'],
  ['Jack',                        ['Jack'],                'Jack'],
];

for (const [title, names, want] of cases) {
  test(`${JSON.stringify(title)} → ${JSON.stringify(want)}`, () => {
    a.strictEqual(stripMemberNames(title, names), want);
  });
}
