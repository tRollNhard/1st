const test = require('node:test');
const assert = require('node:assert/strict');

const automationModule = require('./automation');
const { SocialAutomation, PROCESSED_GUID_CAP } = automationModule;

// These tests focus on the dedup cap (`_rememberGuid` + `PROCESSED_GUID_CAP`)
// added to close outstanding issue #7 (`processedGuids` unbounded growth).
// They DO NOT exercise the full `runCycle` / `processItem` / Anthropic flow —
// those require network and an API key. Constructing `SocialAutomation`
// instantiates an Anthropic client; that's a no-op without an API call.

test('processedGuids starts as an empty Map', () => {
  const a = new SocialAutomation();
  assert.ok(a.processedGuids instanceof Map, 'should be a Map for insertion-order iteration');
  assert.equal(a.processedGuids.size, 0);
});

test('_rememberGuid inserts new GUIDs', () => {
  const a = new SocialAutomation();
  a._rememberGuid('https://example.com/a');
  a._rememberGuid('https://example.com/b');
  assert.equal(a.processedGuids.size, 2);
  assert.ok(a.processedGuids.has('https://example.com/a'));
  assert.ok(a.processedGuids.has('https://example.com/b'));
});

test('_rememberGuid is idempotent — re-inserting an existing GUID is a no-op', () => {
  const a = new SocialAutomation();
  a._rememberGuid('dup');
  a._rememberGuid('dup');
  a._rememberGuid('dup');
  assert.equal(a.processedGuids.size, 1);
});

test('exposes PROCESSED_GUID_CAP and it is a positive integer', () => {
  assert.equal(typeof PROCESSED_GUID_CAP, 'number');
  assert.ok(PROCESSED_GUID_CAP > 0);
  assert.equal(Math.floor(PROCESSED_GUID_CAP), PROCESSED_GUID_CAP);
});

test('processedGuids size is capped at PROCESSED_GUID_CAP', () => {
  const a = new SocialAutomation();
  // Insert one over the cap; oldest should be evicted.
  for (let i = 0; i < PROCESSED_GUID_CAP + 1; i++) {
    a._rememberGuid(`guid-${i}`);
  }
  assert.equal(a.processedGuids.size, PROCESSED_GUID_CAP);
  // FIFO: the very first GUID inserted must have been the one evicted.
  assert.equal(a.processedGuids.has('guid-0'), false);
  // And the most-recently-inserted must still be present.
  assert.equal(a.processedGuids.has(`guid-${PROCESSED_GUID_CAP}`), true);
});

test('FIFO eviction order — second-oldest survives the first eviction', () => {
  const a = new SocialAutomation();
  for (let i = 0; i < PROCESSED_GUID_CAP; i++) {
    a._rememberGuid(`guid-${i}`);
  }
  assert.equal(a.processedGuids.size, PROCESSED_GUID_CAP);
  // Insert one more — evicts `guid-0` only.
  a._rememberGuid('newer');
  assert.equal(a.processedGuids.has('guid-0'), false);
  assert.equal(a.processedGuids.has('guid-1'), true);
  assert.equal(a.processedGuids.has('newer'), true);
});

test('default singleton export still has the legacy interface', () => {
  // server/index.js uses these methods — make sure exporting the class on
  // the singleton didn't shadow anything.
  assert.equal(typeof automationModule.getStatus, 'function');
  assert.equal(typeof automationModule.start, 'function');
  assert.equal(typeof automationModule.stop, 'function');
  assert.equal(typeof automationModule.configure, 'function');
  assert.equal(typeof automationModule._rememberGuid, 'function');
  assert.ok(automationModule.processedGuids instanceof Map);
});
