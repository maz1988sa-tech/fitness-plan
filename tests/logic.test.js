// Run: node --test tests/   (FP_PLAN=/path/to/plan.json to test against another plan)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require('../logic.js');
const plan = require(process.env.FP_PLAN || path.join(__dirname, 'fixture-plan.json'));

test('parseNum handles Arabic digits, separators and integers', () => {
  assert.equal(L.parseNum('٨٣٫٦٥'), 83.65);
  assert.equal(L.parseNum('83,6'), 83.6);
  assert.equal(L.parseNum(' 82.4 '), 82.4);
  assert.equal(L.parseNum('8,500', { int: true }), 8500);
  assert.equal(L.parseNum('٨٬٥٠٠', { int: true }), 8500);
  assert.equal(L.parseNum(''), null);
  assert.equal(L.parseNum('abc'), null);
  assert.equal(L.parseNum('1.2.3'), null);
  assert.equal(L.parseNum(0), 0);
});

test('fmt groups thousands and rounds', () => {
  assert.equal(L.fmt(8500), '8,500');
  assert.equal(L.fmt(83.654, 2), '83.65');
  assert.equal(L.fmt(-0.6, 1), '−0.6');
  assert.equal(L.fmt(null), '—');
});

test('plan calendar: weeks run Sunday to Saturday from plan.start', () => {
  assert.equal(L.weekNo(plan, '2026-10-10'), 0);
  assert.equal(L.weekNo(plan, '2026-10-11'), 1);
  assert.equal(L.weekNo(plan, '2026-10-17'), 1);
  assert.equal(L.weekNo(plan, '2026-10-18'), 2);
  assert.equal(L.weekNo(plan, '2026-12-27'), 12);
  assert.equal(L.weekNo(plan, '2026-12-31'), 12);
  assert.deepEqual(L.weekRange(plan, 3), { from: '2026-10-25', to: '2026-10-31' });
  assert.equal(L.phase(plan, '2026-10-10'), 'before');
  assert.equal(L.phase(plan, '2027-01-01'), 'after');
  assert.equal(L.dayLabel('2026-10-12'), 'الاثنين 12 أكتوبر');
});

test('schedule maps weekdays to sessions', () => {
  assert.equal(L.sessionKeyFor(plan, '2026-10-11'), 'rest');
  assert.equal(L.sessionKeyFor(plan, '2026-10-12'), 'upper');
  assert.equal(L.sessionKeyFor(plan, '2026-10-13'), 'lower');
  assert.equal(L.sessionKeyFor(plan, '2026-10-14'), 'push');
  assert.equal(L.sessionKeyFor(plan, '2026-10-15'), 'rest');
  assert.equal(L.sessionKeyFor(plan, '2026-10-16'), 'pull');
  assert.equal(L.sessionKeyFor(plan, '2026-10-17'), 'legs');
  assert.equal(L.isTrainingDay(plan, '2026-10-10'), false, 'before training start');
  assert.equal(L.isTrainingDay(plan, '2026-10-12'), true);
});

test('sets, RIR, steps and cardio follow the week', () => {
  const hack = plan.sessions.legs.exercises.find(e => e.key === 'sat.hack_squat');
  const bulg = plan.sessions.legs.exercises.find(e => e.key === 'sat.bulgarian');
  const lat = plan.sessions.upper.exercises.find(e => e.key === 'mon.lateral_db');
  assert.deepEqual([1, 2, 3, 9].map(n => L.setsFor(hack, n)), [2, 3, 4, 4]);
  assert.equal(L.setsFor(bulg, 1), 0);
  assert.equal(L.rirFor(plan, hack, 1), '3–4');
  assert.equal(L.rirFor(plan, hack, 2), '2–3');
  assert.equal(L.rirFor(plan, hack, 3), '2');
  assert.equal(L.rirFor(plan, lat, 5), '1');
  assert.deepEqual([1, 2, 3, 4, 5, 12].map(n => L.stepsTarget(plan, n).target), [6500, 7500, 8500, 8500, 9000, 9000]);
  assert.deepEqual([1, 2, 3, 5].map(n => L.cardioFor(plan, n).min), [30, 30, 40, 45]);
  assert.equal(L.waterTarget(plan, '2026-10-12'), 3.5);
  assert.equal(L.waterTarget(plan, '2026-10-15'), 3);
  assert.equal(L.bridgeAllowed(plan, '2026-10-20'), true);
  assert.equal(L.bridgeAllowed(plan, '2026-10-25'), false);
});

test('events on key dates', () => {
  const types = d => L.events(plan, d).map(e => e.type).sort();
  assert.deepEqual(types('2026-10-11'), ['inbody', 'waist']);
  assert.deepEqual(types('2026-11-29'), ['inbody', 'review', 'waist']);
  assert.deepEqual(types('2026-10-15'), ['test']);
  assert.deepEqual(types('2026-10-25'), ['photos', 'waist']);
  assert.deepEqual(types('2026-10-13'), []);
  assert.ok(L.milestones(plan).length >= 15);
});

test('eating window state', () => {
  assert.deepEqual(L.windowState(plan, 4 * 60), { open: false, until: 60 });
  assert.deepEqual(L.windowState(plan, 14 * 60), { open: true, left: 60 });
  assert.deepEqual(L.windowState(plan, 16 * 60), { open: false, until: 13 * 60 });
  assert.equal(L.dur(135), '2 س و15 د');
});

function makeLogs(spec) {
  // spec: {weekNo: [weights...]} -> logs keyed by date, adherent true, waist on Sundays
  const logs = {};
  for (const [n, ws] of Object.entries(spec)) {
    const { from } = L.weekRange(plan, +n);
    ws.forEach((w, i) => {
      const d = L.addDays(from, i);
      logs[d] = { log_date: d, weight_kg: w, adherent: true, hunger: 2, sleep_h: 7, kcal: 2000, waist_cm: i === 0 ? 99 - +n * 0.5 : null };
    });
  }
  return logs;
}

test('decision waits until week 3 is complete', () => {
  const logs = makeLogs({ 1: [83, 82.8, 82.6, 82.5, 82.4, 82.3, 82.2], 2: [82, 81.9, 81.9, 81.8, 81.7, 81.6, 81.6] });
  assert.equal(L.decide(plan, logs, '2026-10-27').ready, false);
});

test('decision: on track, too slow, too fast, low adherence', () => {
  const base = { 2: Array(7).fill(82.0), 3: Array(7).fill(81.4) };
  let r = L.decide(plan, makeLogs(base), '2026-11-01');
  assert.equal(r.ready, true);
  assert.equal(r.rule, 'on_track');
  assert.equal(Math.round(r.rate * 100) / 100, 0.6);
  assert.ok(r.maintenance > 2000);

  r = L.decide(plan, makeLogs({ 2: Array(7).fill(82.0), 3: Array(7).fill(81.9) }), '2026-11-01');
  assert.equal(r.rule, 'recomp', 'waist dropped 0.5 cm so slow scale = possible recomposition');

  r = L.decide(plan, makeLogs({ 2: Array(7).fill(82.0), 3: Array(7).fill(80.6) }), '2026-11-01');
  assert.equal(r.rule, 'too_fast');

  const logs = makeLogs(base);
  Object.values(logs).slice(0, 5).forEach(x => { x.adherent = false; });
  r = L.decide(plan, logs, '2026-11-01');
  assert.equal(r.rule, 'low_adherence');

  // From week 4 the rate uses two weeks: (avg[n-2] - avg[n]) / 2
  r = L.decide(plan, makeLogs({ 2: Array(7).fill(82.0), 3: Array(7).fill(81.6), 4: Array(7).fill(81.0) }), '2026-11-08');
  assert.equal(Math.round(r.rate * 100) / 100, 0.5);
  assert.deepEqual(r.rateWeeks, [2, 4]);
});

test('double progression hints', () => {
  const ex = { reps: [6, 10] };
  const mk = reps => ({ date: '2026-10-12', sets: reps.map((r, i) => ({ set_no: i + 1, weight_kg: 40, reps: r })) });
  assert.equal(L.progressionHint(ex, null).kind, 'first');
  assert.deepEqual(L.progressionHint(ex, mk([10, 10, 10])), { kind: 'increase', weight: 40 });
  assert.equal(L.progressionHint(ex, mk([10, 9, 8])).kind, 'hold');
  assert.equal(L.progressionHint(ex, mk([6, 5])).kind, 'low');
});

test('last performance picks the latest earlier session of the same variant', () => {
  const sets = {
    a: { exercise_key: 'x', session_date: '2026-10-12', set_no: 1, weight_kg: 40, reps: 8 },
    b: { exercise_key: 'x', session_date: '2026-10-19', set_no: 2, weight_kg: 42, reps: 7 },
    c: { exercise_key: 'x', session_date: '2026-10-19', set_no: 1, weight_kg: 42, reps: 8 },
    d: { exercise_key: 'x', session_date: '2026-10-19', set_no: 1, weight_kg: 20, reps: 12, variant: 'alt' },
    e: { exercise_key: 'x', session_date: '2026-10-26', set_no: 1, weight_kg: 45, reps: 6 }
  };
  const last = L.lastPerformance(sets, 'x', '2026-10-26', 'main');
  assert.equal(last.date, '2026-10-19');
  assert.deepEqual(last.sets.map(s => s.set_no), [1, 2]);
  assert.equal(L.lastPerformance(sets, 'x', '2026-10-26', 'alt').sets[0].weight_kg, 20);
  assert.equal(L.lastPerformance(sets, 'x', '2026-10-12', 'main'), null);
});

test('warm-up ramp for the first two compound lifts', () => {
  const s = plan.sessions.upper;
  assert.deepEqual(L.warmupFor(plan, s, 0, 60).map(r => [r.weight, r.reps]), [[30, 10], [45, 5]]);
  assert.deepEqual(L.warmupFor(plan, s, 1, 60).map(r => [r.weight, r.reps]), [[36, 7]]);
  assert.equal(L.warmupFor(plan, s, 4, 10), null);
});

test('shoulder pain scale', () => {
  assert.equal(L.painLevel(plan, 1).level, 'ok');
  assert.equal(L.painLevel(plan, 3).level, 'warn');
  assert.equal(L.painLevel(plan, 6).level, 'stop');
  assert.equal(L.painLevel(plan, null), null);
});

test('every exercise is well-formed', () => {
  for (const [key, s] of Object.entries(plan.sessions)) {
    for (const ex of s.exercises) {
      assert.equal(ex.sets.length, 3, ex.key);
      assert.ok(ex.reps[0] < ex.reps[1], ex.key);
      assert.ok(ex.rest_s >= 45 && ex.rest_s <= 180, ex.key);
      assert.ok(['compound', 'isolation'].includes(ex.type), ex.key);
      if (ex.cue) assert.ok(plan.cues[ex.cue], ex.key + ' cue');
      assert.ok(ex.key.includes('.'), key);
    }
  }
  const keys = Object.values(plan.sessions).flatMap(s => s.exercises.map(e => e.key));
  assert.equal(new Set(keys).size, keys.length, 'exercise keys are unique');
});
