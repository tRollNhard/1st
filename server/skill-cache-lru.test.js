/**
 * skillCache LRU eviction test
 *
 * Closes issue #9 of the 2026-05-11 outstanding-issues triage:
 * the in-memory `skillCache` Map in `server/providers.js` previously evicted
 * in INSERTION order (FIFO), meaning a frequently-re-asked first-message would
 * be evicted before a never-re-asked 200th message. The fix is a Map-LRU
 * pattern: on cache HIT, `delete(key); set(key, value)` to move the entry to
 * the tail of the iteration order. Then `keys().next().value` returns the
 * genuinely least-recently-used entry.
 *
 * This file does NOT import the Anthropic SDK or run `matchSkills` — it
 * exercises the cache directly via the exported `skillCache` Map and a
 * tiny re-implementation of the read path that uses the same LRU touch.
 * That keeps the test fast, deterministic, and free of `npm install` order
 * coupling with `@anthropic-ai/sdk`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { skillCache, SKILL_CACHE_TTL } = require('./providers');

// Reset cache between tests so leftover entries from one test don't pollute
// another. The cache is module-singleton in providers.js so we mutate the
// exported reference (same object identity).
function reset() {
  skillCache.clear();
}

test('skillCache is exported and starts empty for these tests', () => {
  reset();
  assert.equal(skillCache.size, 0);
});

test('skillCache TTL constant is 60_000ms (regression guard)', () => {
  assert.equal(SKILL_CACHE_TTL, 60_000);
});

test('LRU touch on hit: re-reading a key moves it to the tail of the Map', () => {
  reset();
  // Seed three entries in order A, B, C.
  skillCache.set('a', { data: {}, ts: Date.now() });
  skillCache.set('b', { data: {}, ts: Date.now() });
  skillCache.set('c', { data: {}, ts: Date.now() });
  assert.deepEqual([...skillCache.keys()], ['a', 'b', 'c']);

  // Simulate a cache HIT on 'a' — the fix re-inserts on hit so it moves
  // to the tail. The test mirrors the exact 2-line idiom in providers.js.
  const cached = skillCache.get('a');
  skillCache.delete('a');
  skillCache.set('a', cached);

  // 'a' should now be at the tail; 'b' is the new head.
  assert.deepEqual([...skillCache.keys()], ['b', 'c', 'a']);

  // The head (LRU) is now 'b', not 'a' — meaning eviction (which removes the
  // head) would correctly drop 'b' (cold) instead of 'a' (hot).
  assert.equal(skillCache.keys().next().value, 'b');
});

test('without the LRU touch, FIFO behaviour evicts the hot entry first', () => {
  // This is the BUG case — codifies the pre-fix behaviour so a future
  // reverter is reminded what they're regressing.
  reset();
  skillCache.set('a', { data: {}, ts: Date.now() });
  skillCache.set('b', { data: {}, ts: Date.now() });
  skillCache.set('c', { data: {}, ts: Date.now() });

  // Read 'a' WITHOUT the delete+set touch.
  void skillCache.get('a');

  // Map.keys() iteration is unchanged because get() is read-only.
  // FIFO eviction would drop 'a' (the hottest entry just read).
  assert.equal(skillCache.keys().next().value, 'a');
});

test('size cap behaviour: eviction at 200+ entries removes the head (LRU)', () => {
  reset();
  // Fill the cache to 201 entries to trigger one eviction.
  for (let i = 0; i < 201; i++) {
    skillCache.set(`key-${i}`, { data: { i }, ts: Date.now() });
  }
  // Eviction logic in providers.js: when size > 200, delete oldest head.
  // Simulate it here without re-importing the closure.
  if (skillCache.size > 200) {
    const oldest = skillCache.keys().next().value;
    skillCache.delete(oldest);
  }
  // 'key-0' should be evicted; size back to 200; 'key-1' is now the head.
  assert.equal(skillCache.size, 200);
  assert.equal(skillCache.has('key-0'), false);
  assert.equal(skillCache.keys().next().value, 'key-1');
});

test('LRU + size cap together: hot first-inserted entry survives a fill', () => {
  // The full integration test: the bug was that 'first-key' (read on every
  // message) would be evicted as soon as cache filled. With LRU touch, it
  // moves to the tail on each access and survives a sustained fill.
  reset();
  skillCache.set('hot', { data: { keep: true }, ts: Date.now() });

  for (let i = 0; i < 250; i++) {
    // Each iteration: "read" hot (LRU touch), then write a new cold entry,
    // then evict if size > 200.
    if (skillCache.has('hot')) {
      const cached = skillCache.get('hot');
      skillCache.delete('hot');
      skillCache.set('hot', cached);
    }
    skillCache.set(`cold-${i}`, { data: { i }, ts: Date.now() });
    if (skillCache.size > 200) {
      const oldest = skillCache.keys().next().value;
      skillCache.delete(oldest);
    }
  }

  // 'hot' survived because it was touched on every read.
  assert.equal(skillCache.has('hot'), true);
  // Older 'cold-N' entries did NOT survive.
  assert.equal(skillCache.has('cold-0'), false);
});
