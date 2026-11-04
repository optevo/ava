/* AVA pipeline simulation (prototype v0.3)
 * A Monte Carlo of the same gate model as AVAEngine.expectedTime, so the animation and the maths agree.
 * Each item is one application. Stages: design -> build -> gates (wait + review; pass, or reject back for a fix) -> integration -> deploy.
 *
 * Capacity (optional, switched on by the UI with limitTeams = true): applications wait for a delivery team and a team
 * picks up the next one when free. With supply = true new applications keep arriving for as long as the simulation runs, so teams never run out of work. A team is busy only for design, build and fixes, not while work waits in a review queue
 * (the same rule as the Summary and the project timeline). Fixes have priority over starting new applications.
 *
 * Period (optional): the simulation stops when the clock reaches `period` weeks, so two sims can be compared on how many
 * applications each put into production in the same time. Seeded, so runs are repeatable. No DOM.
 */
(function (root) {
  'use strict';

  var num = function (x) { x = parseFloat(x); return isFinite(x) ? x : 0; };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function stageList(state, ap) {
    var st = state.stages, list = [];
    list.push({ key: 'design', label: 'Design', type: 'work', dur: num(st.design[ap]) });
    list.push({ key: 'build', label: 'Build', type: 'work', dur: num(st.build[ap]) });
    state.gates.forEach(function (g) {
      list.push({ key: g.id, label: g.name, type: 'gate', gate: g });
    });
    list.push({ key: 'integration', label: 'Integration', type: 'work', dur: num(st.integration[ap]) });
    list.push({ key: 'deploy', label: 'Deploy', type: 'work', dur: num(st.deploy[ap]) });
    return list;
  }

  function create(state, ap, seed) {
    var sim = {
      ap: ap, state: state, rng: mulberry32(seed || 1), items: [], nextId: 1,
      clock: 0, spawned: 0,
      delivered: 0, totalTime: 0, rejections: 0, times: [], gateRejects: {},
      period: Infinity, finished: false, limitTeams: false, supply: false
    };

    function gateParams(item) { return item.stage.gate[ap]; }
    function teams() { return sim.limitTeams ? Math.max(1, Math.floor(num(sim.state.lanes))) : Infinity; }
    function needsTeam(it) {
      return it.state === 'fix' || (it.state === 'work' && (it.stage.key === 'design' || it.stage.key === 'build'));
    }
    function busy() {
      var n = 0;
      for (var i = 0; i < sim.items.length; i++) if (needsTeam(sim.items[i])) n++;
      return n;
    }

    function enter(item, idx) {
      var stages = stageList(sim.state, ap);
      item.idx = idx;
      item.stage = stages[idx];
      if (item.stage.type === 'work') { item.state = 'work'; item.remaining = item.stage.dur; }
      else { var p = gateParams(item); item.state = 'gate'; item.remaining = num(p.w) + num(p.r); }
      item.nStages = stages.length;
    }
    function finishItem(item) {
      item.state = 'done';
      sim.delivered++; sim.totalTime += item.elapsed; sim.times.push(item.elapsed);
    }
    function advance(item) {
      if (item.idx + 1 >= item.nStages) { finishItem(item); return; }
      enter(item, item.idx + 1);
    }
    function failGate(item) {
      sim.rejections++; item.rejections++;
      sim.gateRejects[item.stage.key] = (sim.gateRejects[item.stage.key] || 0) + 1;
      var cap = teams();
      item.state = (cap === Infinity || busy() < cap) ? 'fix' : 'fixwait';   // a fix needs a team; wait if none is free
      item.remaining = num(gateParams(item).f);
    }
    function passProbOf(item) {
      var s = num(gateParams(item).s) / 100;
      return Math.min(1, Math.max(0.01, s));
    }
    /* A gate attempt has just finished: decide pass or reject at random, using the gate's pass rate. */
    function gateDone(item) {
      if (sim.rng() < passProbOf(item)) advance(item); else failGate(item);
    }

    /* Hand free teams to waiting fixes first, then to applications waiting in the backlog. */
    function allocate() {
      var cap = teams(), b = cap === Infinity ? 0 : busy(), i, it;
      if (sim.supply) {   // new applications keep arriving: there is always one ready for a team that becomes free
        var q = 0; for (i = 0; i < sim.items.length; i++) if (sim.items[i].state === 'queued') q++;
        for (; q < (cap === Infinity ? 1 : cap + 1); q++) sim.spawn();
      }
      for (i = 0; i < sim.items.length; i++) {
        it = sim.items[i];
        if (it.state === 'fixwait' && b < cap) { it.state = 'fix'; b++; }
      }
      for (i = 0; i < sim.items.length; i++) {
        it = sim.items[i];
        if (it.state === 'queued' && b < cap) { enter(it, 0); b++; }
      }
    }

    sim.spawn = function () {
      var item = { id: sim.nextId++, elapsed: 0, rejections: 0, idx: 0, state: 'queued', remaining: 0 };
      sim.spawned++;
      sim.items.push(item);
      return item;
    };
    /* Put n applications in the backlog. */
    sim.fill = function (n) { for (var i = 0; i < n; i++) sim.spawn(); };

    sim.step = function (dt) {
      if (sim.finished) return;
      var left = sim.period - sim.clock;
      if (left <= 1e-12) { sim.finished = true; return; }
      if (dt > left) dt = left;
      allocate();
      sim.clock += dt;
      sim.items.forEach(function (item) {
        var t = dt, guard = 0;
        while (t > 1e-12 && item.state !== 'done' && item.state !== 'queued' && guard++ < 1000) {
          if (item.state === 'fixwait') { item.elapsed += t; break; }   // waiting for a team: time passes, no progress
          var use = Math.min(t, item.remaining);
          item.elapsed += use; item.remaining -= use; t -= use;
          if (item.remaining <= 1e-9) {
            if (item.state === 'work') advance(item);
            else if (item.state === 'gate') gateDone(item);
            else if (item.state === 'fix') { enter(item, item.idx); }
          } else break;
        }
      });
      sim.items = sim.items.filter(function (it) { return it.state !== 'done'; });
      if (sim.period - sim.clock <= 1e-9) sim.finished = true;
    };

    sim.stats = function () {
      var inFlight = 0, waiting = 0;
      sim.items.forEach(function (it) { if (it.state === 'queued') waiting++; if (it.state !== 'done') inFlight++; });
      return {
        delivered: sim.delivered, avg: sim.delivered ? sim.totalTime / sim.delivered : null,
        rejections: sim.rejections,
        inFlight: inFlight,              // everything not yet delivered, including the backlog
        waiting: waiting,                // still in the backlog
        active: inFlight - waiting,      // started but not delivered
        spawned: sim.spawned, finished: sim.finished, clock: sim.clock
      };
    };

    return sim;
  }

  var api = { create: create, stageList: stageList, mulberry32: mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVASim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
