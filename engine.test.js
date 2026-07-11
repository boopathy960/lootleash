var assert = require('assert');
var MergeEngine = require('./engine.js');
var threeWayMerge = MergeEngine.threeWayMerge;
var stampConflict = MergeEngine.stampConflict;
var CausalityGraph = MergeEngine.CausalityGraph;

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('PASS: ' + name);
    passed++;
  } catch (e) {
    console.error('FAIL: ' + name);
    console.error('  ' + e.message);
    failed++;
    process.exitCode = 1;
  }
}

test('disjoint branch changes merge silently, zero conflicts', function () {
  var base = { torch1: { lit: false }, torch2: { lit: false } };
  var a = { torch1: { lit: true }, torch2: { lit: false } };
  var b = { torch1: { lit: false }, torch2: { lit: true } };
  var r = threeWayMerge(base, a, b);
  assert.strictEqual(r.conflicts.length, 0);
  assert.strictEqual(r.merged.torch1.lit, true);
  assert.strictEqual(r.merged.torch2.lit, true);
});

test('identical changes on both branches do not conflict', function () {
  var base = { gate: { open: false } };
  var a = { gate: { open: true } };
  var b = { gate: { open: true } };
  var r = threeWayMerge(base, a, b);
  assert.strictEqual(r.conflicts.length, 0);
  assert.strictEqual(r.merged.gate.open, true);
});

test('differing changes on the same key produce exactly one conflict', function () {
  var base = { crate: { position: 'start' } };
  var a = { crate: { position: 'plate' } };
  var b = { crate: { position: 'ledge' } };
  var r = threeWayMerge(base, a, b);
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.conflicts[0].aValue, 'plate');
  assert.strictEqual(r.conflicts[0].bValue, 'ledge');
});

test('crate puzzle: stamping A gives a fully consistent world, zero paradoxes', function () {
  var base = { crate: { position: 'start' }, plate: { weighted: false }, door: { open: false }, key: { held: false } };
  var a = { crate: { position: 'plate' }, plate: { weighted: true }, door: { open: true }, key: { held: false } };
  var b = { crate: { position: 'ledge' }, plate: { weighted: false }, door: { open: false }, key: { held: true } };
  var r = threeWayMerge(base, a, b);

  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.conflicts[0].key, 'crate.position');
  assert.strictEqual(r.merged.plate.weighted, true);
  assert.strictEqual(r.merged.door.open, true);
  assert.strictEqual(r.merged.key.held, true);

  stampConflict(r.merged, r.conflicts[0], 'A');
  assert.strictEqual(r.merged.crate.position, 'plate');

  var graph = new CausalityGraph([
    { promise: 'plate.weighted', dependsOn: 'crate.position', require: function (v) { return v === 'plate'; } },
    { promise: 'door.open', dependsOn: 'plate.weighted', require: function (v) { return v === true; } }
  ]);
  var paradoxes = graph.evaluateParadoxes(r.merged);
  assert.strictEqual(paradoxes.size, 0);
  assert.strictEqual(r.merged.key.held, true);
});

test('crate puzzle: stamping B paradoxes the door, but the key survives', function () {
  var base = { crate: { position: 'start' }, plate: { weighted: false }, door: { open: false }, key: { held: false } };
  var a = { crate: { position: 'plate' }, plate: { weighted: true }, door: { open: true }, key: { held: false } };
  var b = { crate: { position: 'ledge' }, plate: { weighted: false }, door: { open: false }, key: { held: true } };
  var r = threeWayMerge(base, a, b);

  stampConflict(r.merged, r.conflicts[0], 'B');
  assert.strictEqual(r.merged.crate.position, 'ledge');
  assert.strictEqual(r.merged.plate.weighted, true);
  assert.strictEqual(r.merged.door.open, true);

  var graph = new CausalityGraph([
    { promise: 'plate.weighted', dependsOn: 'crate.position', require: function (v) { return v === 'plate'; } },
    { promise: 'door.open', dependsOn: 'plate.weighted', require: function (v) { return v === true; } }
  ]);
  var paradoxes = graph.evaluateParadoxes(r.merged);
  assert.ok(paradoxes.has('plate.weighted'));
  assert.ok(paradoxes.has('door.open'));
  assert.strictEqual(r.merged.key.held, true);
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed.');
