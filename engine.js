/**
 * Merge Conflict — Core Engine
 * Pure state/logic layer: no rendering, no DOM, no input.
 * Runs identically under Node (for tests) and in the browser (for the game).
 */
(function (root) {
  'use strict';

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function setProp(state, entityId, prop, value) {
    if (!state[entityId]) state[entityId] = {};
    state[entityId][prop] = value;
  }

  function getProp(state, entityId, prop, fallback) {
    if (!state[entityId] || state[entityId][prop] === undefined) return fallback;
    return state[entityId][prop];
  }

  // { entityId: { prop: newValue } } for every prop that differs from base.
  function diffState(branch, base) {
    var diff = {};
    var ids = new Set(Object.keys(branch).concat(Object.keys(base)));
    ids.forEach(function (id) {
      var b = branch[id] || {};
      var ba = base[id] || {};
      var props = new Set(Object.keys(b).concat(Object.keys(ba)));
      props.forEach(function (p) {
        var bv = b[p];
        var av = ba[p];
        if (JSON.stringify(bv) !== JSON.stringify(av)) {
          if (!diff[id]) diff[id] = {};
          diff[id][p] = bv;
        }
      });
    });
    return diff;
  }

  function touchedKeys(diff) {
    var keys = new Set();
    Object.keys(diff).forEach(function (id) {
      Object.keys(diff[id]).forEach(function (p) {
        keys.add(id + '.' + p);
      });
    });
    return keys;
  }

  function splitKey(key) {
    var idx = key.lastIndexOf('.');
    return [key.slice(0, idx), key.slice(idx + 1)];
  }

  // Keys touched by exactly one branch merge silently.
  // Keys touched by both branches with the same value merge silently.
  // Keys touched by both branches with different values become conflicts.
  function threeWayMerge(base, branchA, branchB) {
    var merged = cloneState(base);
    var diffA = diffState(branchA, base);
    var diffB = diffState(branchB, base);
    var touchedA = touchedKeys(diffA);
    var touchedB = touchedKeys(diffB);
    var conflicts = [];
    var allKeys = new Set(Array.from(touchedA).concat(Array.from(touchedB)));

    allKeys.forEach(function (key) {
      var parts = splitKey(key);
      var entityId = parts[0];
      var prop = parts[1];
      var inA = touchedA.has(key);
      var inB = touchedB.has(key);

      if (inA && !inB) {
        setProp(merged, entityId, prop, diffA[entityId][prop]);
      } else if (inB && !inA) {
        setProp(merged, entityId, prop, diffB[entityId][prop]);
      } else {
        var aVal = diffA[entityId][prop];
        var bVal = diffB[entityId][prop];
        if (JSON.stringify(aVal) === JSON.stringify(bVal)) {
          setProp(merged, entityId, prop, aVal);
        } else {
          conflicts.push({ key: key, entityId: entityId, prop: prop, aValue: aVal, bValue: bVal });
        }
      }
    });

    return { merged: merged, conflicts: conflicts };
  }

  function stampConflict(merged, conflict, choice) {
    var value = choice === 'A' ? conflict.aValue : conflict.bValue;
    setProp(merged, conflict.entityId, conflict.prop, value);
    return merged;
  }

  // edges: [{ promise: 'door.open', dependsOn: 'plate.weighted', require: v => v === true }]
  // A promise is paradoxed if its dependency doesn't hold, or if its dependency is itself
  // paradoxed (paradox propagates transitively through the graph until it reaches fixed point).
  function CausalityGraph(edges) {
    this.edges = edges || [];
  }

  CausalityGraph.prototype.evaluateParadoxes = function (state) {
    var paradoxed = new Set();
    var changed = true;
    var guard = 0;
    var maxGuard = this.edges.length + 5;

    while (changed && guard < maxGuard) {
      changed = false;
      guard++;
      this.edges.forEach(function (edge) {
        if (paradoxed.has(edge.promise)) return;
        var parts = splitKey(edge.dependsOn);
        var depValue = getProp(state, parts[0], parts[1]);
        var depParadoxed = paradoxed.has(edge.dependsOn);
        var holds = !depParadoxed && edge.require(depValue);
        if (!holds) {
          paradoxed.add(edge.promise);
          changed = true;
        }
      });
    }

    return paradoxed;
  };

  var MergeEngine = {
    cloneState: cloneState,
    setProp: setProp,
    getProp: getProp,
    diffState: diffState,
    touchedKeys: touchedKeys,
    splitKey: splitKey,
    threeWayMerge: threeWayMerge,
    stampConflict: stampConflict,
    CausalityGraph: CausalityGraph
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MergeEngine;
  }
  if (typeof root !== 'undefined' && root) {
    root.MergeEngine = MergeEngine;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
