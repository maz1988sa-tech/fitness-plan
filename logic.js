/* Fitness plan: pure logic (no DOM, no network). Loaded by the app and by tests/logic.test.js. */
(function (root) {
  'use strict';

  // ---------- numbers ----------
  var AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

  /**
   * Parses user input that may use Arabic-Indic digits and the Arabic decimal separator. Returns a number or null.
   * Decimal fields (default) read a comma as a decimal point ("83,6" = 83.6).
   * Integer fields (opts.int) read commas as thousands separators ("8,500" = 8500).
   */
  function parseNum(v, opts) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim();
    if (!s) return null;
    s = s.replace(/[٠-٩۰-۹]/g, function (c) { return AR_DIGITS[c]; }).replace(/[٬\s]/g, '');
    s = (opts && opts.int) ? s.replace(/,/g, '').replace(/٫/g, '.') : s.replace(/[٫,]/g, '.');
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return (opts && opts.int) ? Math.round(n) : n;
  }

  function round(n, d) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    var f = Math.pow(10, d || 0);
    return Math.round(n * f) / f;
  }

  function fmt(n, d) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var v = round(n, d === undefined ? 0 : d);
    var parts = Math.abs(v).toFixed(d || 0).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−' : '') + parts.join('.');
  }

  function mean(arr) {
    var xs = arr.filter(function (x) { return x !== null && x !== undefined && isFinite(x); });
    if (!xs.length) return null;
    return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  }

  // ---------- dates (all local calendar dates as 'YYYY-MM-DD') ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parts(s) { var p = String(s).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function utc(s) { var p = parts(s); return Date.UTC(p.y, p.m - 1, p.d); }
  function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / 86400000); }
  function addDays(s, n) {
    var t = new Date(utc(s) + n * 86400000);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  function dow(s) { return new Date(utc(s)).getUTCDay(); } // 0 = Sunday

  var DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function dayLabel(s) { var p = parts(s); return DAY_NAMES[dow(s)] + ' ' + p.d + ' ' + MONTHS[p.m - 1]; }
  function shortDate(s) { var p = parts(s); return p.d + ' ' + MONTHS[p.m - 1]; }

  // ---------- plan calendar ----------
  /** Week number of the plan (Sunday–Saturday weeks, week 1 starts plan.start). <= 0 before the plan. */
  function weekNo(plan, s) { return Math.floor(daysBetween(plan.start, s) / 7) + 1; }
  function weekRange(plan, n) { var from = addDays(plan.start, (n - 1) * 7); return { from: from, to: addDays(from, 6) }; }
  function inPlan(plan, s) { return daysBetween(plan.start, s) >= 0 && daysBetween(s, plan.end) >= 0; }
  function phase(plan, s) {
    if (daysBetween(plan.start, s) < 0) return 'before';
    if (daysBetween(s, plan.end) < 0) return 'after';
    return 'during';
  }
  function sessionKeyFor(plan, s) { return plan.schedule[String(dow(s))] || 'rest'; }
  function isTrainingDay(plan, s) { return sessionKeyFor(plan, s) !== 'rest' && daysBetween(plan.train_start, s) >= 0 && daysBetween(s, plan.end) >= 0; }

  function setIndex(n) { return n <= 1 ? 0 : (n === 2 ? 1 : 2); }
  function setsFor(ex, n) { return ex.sets[setIndex(Math.max(1, n))]; }
  function rirFor(plan, ex, n) {
    if (n <= 1) return plan.rir.w1;
    if (n === 2) return plan.rir.w2;
    return ex.type === 'compound' ? plan.rir.compound : plan.rir.isolation;
  }
  function byWeek(list, n) {
    for (var i = 0; i < list.length; i++) if (n >= list[i].from && n <= list[i].to) return list[i];
    return n < 1 ? list[0] : list[list.length - 1];
  }
  function stepsTarget(plan, n) { return byWeek(plan.steps, n); }
  function cardioFor(plan, n) { return byWeek(plan.cardio.by_week, n); }
  function isCardioDay(plan, s) { return plan.cardio.days.indexOf(dow(s)) >= 0 && inPlan(plan, s); }
  function waterTarget(plan, s) {
    return sessionKeyFor(plan, s) !== 'rest' ? plan.targets.water_l_training : plan.targets.water_l;
  }
  function bridgeAllowed(plan, s) { return plan.bridge && plan.bridge.weeks.indexOf(weekNo(plan, s)) >= 0; }

  /** Events that fall on a date: InBody, reviews, photos, fitness test, waist (Sundays in plan). */
  function events(plan, s) {
    var out = [];
    var d = plan.dates || {};
    if ((d.inbody || []).indexOf(s) >= 0) out.push({ type: 'inbody', label: 'قياس InBody' });
    if ((d.reviews || []).indexOf(s) >= 0) out.push({ type: 'review', label: s === plan.end ? 'القياس النهائي' : 'مراجعة الأسبوعين' });
    if ((d.photos || []).indexOf(s) >= 0) out.push({ type: 'photos', label: 'صور التقدم' });
    if (plan.fitness_test && plan.fitness_test.dates.indexOf(s) >= 0) out.push({ type: 'test', label: 'اختبار اللياقة على السير' });
    if (dow(s) === 0 && inPlan(plan, s)) out.push({ type: 'waist', label: 'قياس الخصر' });
    return out;
  }

  /** All dated milestones in order, for the timeline. */
  function milestones(plan) {
    var map = {};
    function add(date, type, label) { (map[date] = map[date] || []).push({ type: type, label: label }); }
    (plan.dates.inbody || []).forEach(function (x) { add(x, 'inbody', 'InBody'); });
    (plan.dates.reviews || []).forEach(function (x) { add(x, 'review', x === plan.end ? 'القياس النهائي' : 'مراجعة'); });
    (plan.dates.photos || []).forEach(function (x) { add(x, 'photos', 'صور'); });
    (plan.fitness_test ? plan.fitness_test.dates : []).forEach(function (x) { add(x, 'test', 'اختبار اللياقة'); });
    return Object.keys(map).sort().map(function (k) { return { date: k, items: map[k] }; });
  }

  // ---------- eating window ----------
  function hm(str) { var p = str.split(':'); return (+p[0]) * 60 + (+p[1]); }
  /** now = minutes since midnight. */
  function windowState(plan, minutesNow) {
    var o = hm(plan.window.open), c = hm(plan.window.close);
    if (minutesNow >= o && minutesNow < c) return { open: true, left: c - minutesNow };
    var until = minutesNow < o ? o - minutesNow : 1440 - minutesNow + o;
    return { open: false, until: until };
  }
  function dur(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + ' س و' + m + ' د';
    if (h) return h + ' س';
    return m + ' د';
  }

  // ---------- weekly statistics ----------
  function logsInRange(logs, from, to) {
    return Object.keys(logs).filter(function (k) { return k >= from && k <= to; }).sort().map(function (k) { return logs[k]; });
  }

  function weekStats(plan, logs, n) {
    var r = weekRange(plan, n);
    var rows = logsInRange(logs, r.from, r.to);
    var weights = rows.map(function (x) { return parseNum(x.weight_kg); }).filter(function (x) { return x !== null; });
    var waists = rows.filter(function (x) { return parseNum(x.waist_cm) !== null; });
    var adh = rows.filter(function (x) { return x.adherent === true || x.adherent === false; });
    var treats = rows.filter(function (x) { return x.meals && x.meals.treat; }).length;
    return {
      n: n, from: r.from, to: r.to,
      weightAvg: mean(weights), weightN: weights.length,
      waist: waists.length ? parseNum(waists[waists.length - 1].waist_cm) : null,
      steps: mean(rows.map(function (x) { return parseNum(x.steps); })),
      sleep: mean(rows.map(function (x) { return parseNum(x.sleep_h); })),
      water: mean(rows.map(function (x) { return parseNum(x.water_l); })),
      kcal: mean(rows.map(function (x) { return parseNum(x.kcal); })),
      protein: mean(rows.map(function (x) { return parseNum(x.protein_g); })),
      hunger: mean(rows.map(function (x) { return parseNum(x.hunger); })),
      restingHr: mean(rows.map(function (x) { return parseNum(x.resting_hr); })),
      adherenceYes: adh.filter(function (x) { return x.adherent === true; }).length,
      adherenceN: adh.length,
      treats: treats,
      logged: rows.length
    };
  }

  function allWeekStats(plan, logs, uptoDate) {
    var last = Math.min(plan.weeks, Math.max(0, weekNo(plan, uptoDate)));
    var out = [];
    for (var n = 1; n <= last; n++) out.push(weekStats(plan, logs, n));
    return out;
  }

  /**
   * Rate of loss in kg/week from weekly averages, judged on completed weeks.
   * Uses (avg[n-2] - avg[n]) / 2; week 1 is excluded (water and glycogen) whenever possible.
   */
  function lossRate(stats, lastCompleteWeek) {
    function avg(n) {
      var w = stats[n - 1];
      return w && w.weightN >= 3 ? w.weightAvg : null;
    }
    var n = lastCompleteWeek;
    if (n >= 4 && avg(n) !== null && avg(n - 2) !== null) return { rate: (avg(n - 2) - avg(n)) / 2, from: n - 2, to: n };
    if (n >= 3 && avg(n) !== null && avg(n - 1) !== null) return { rate: avg(n - 1) - avg(n), from: n - 1, to: n };
    return null;
  }

  /** Suggestion from the plan's decision table. Never applied automatically. */
  function decide(plan, logs, todayStr) {
    var curWeek = weekNo(plan, todayStr);
    var lastComplete = Math.min(plan.weeks, curWeek - 1);
    var res = { ready: false, week: lastComplete };
    if (lastComplete < 3) { res.reason = 'early'; return res; }
    var stats = allWeekStats(plan, logs, weekRange(plan, lastComplete).to);
    var lr = lossRate(stats, lastComplete);
    var from14 = addDays(weekRange(plan, lastComplete).to, -13);
    var rows14 = logsInRange(logs, from14, weekRange(plan, lastComplete).to);
    var adhRows = rows14.filter(function (x) { return x.adherent === true || x.adherent === false; });
    var adherence = adhRows.length ? adhRows.filter(function (x) { return x.adherent === true; }).length / 14 : null;
    var hunger = mean(rows14.map(function (x) { return parseNum(x.hunger); }));
    var sleep = mean(rows14.map(function (x) { return parseNum(x.sleep_h); }));
    var kcalDays = rows14.map(function (x) { return parseNum(x.kcal); }).filter(function (x) { return x !== null; });
    var waistNow = stats[lastComplete - 1] ? stats[lastComplete - 1].waist : null;
    var twoBack = stats[lastComplete - 3], oneBack = stats[lastComplete - 2];
    var waistBefore = (twoBack && twoBack.waist !== null) ? twoBack.waist : (oneBack && oneBack.waist !== null ? oneBack.waist : null);
    res.rate = lr ? lr.rate : null;
    res.rateWeeks = lr ? [lr.from, lr.to] : null;
    res.adherence = adherence;
    res.adherenceDays = adhRows.filter(function (x) { return x.adherent === true; }).length;
    res.hunger = hunger; res.sleep = sleep;
    res.waistChange = (waistNow !== null && waistBefore !== null) ? waistNow - waistBefore : null;
    if (kcalDays.length >= 7 && lr) {
      res.maintenance = mean(kcalDays) + lr.rate * 7700 / 7;
      res.kcalAvg = mean(kcalDays);
    }
    if (!lr) { res.reason = 'no_weights'; return res; }
    res.ready = true;
    var g = plan.goal, rule;
    var stressed = (hunger !== null && hunger >= 4.5) || (sleep !== null && sleep < 6);
    if (adherence === null || adherence < g.adherence_target) rule = 'low_adherence';
    else if (lr.rate > g.fast_limit || stressed) rule = 'too_fast';
    else if (lr.rate >= g.band[0] && lr.rate <= g.band[1]) rule = 'on_track';
    else if (lr.rate > g.band[1]) rule = 'upper_edge';
    else if (res.waistChange !== null && res.waistChange <= -0.5) rule = 'recomp';
    else rule = 'too_slow';
    res.rule = rule;
    var found = plan.rules.filter(function (r) { return r.key === rule; })[0];
    res.action = found ? found.action : 'قرب الحد الأعلى للنطاق: استمر وراقب الأسبوع القادم.';
    res.when = found ? found.when : 'بين 0.9 و1 كغ أسبوعيًا';
    res.stressed = stressed;
    return res;
  }

  // ---------- training ----------
  /** Latest earlier session's sets for an exercise and variant: [{set_no, weight_kg, reps, rir}] sorted by set_no. */
  function lastPerformance(sets, exKey, beforeDate, variant) {
    var best = null;
    Object.keys(sets).forEach(function (k) {
      var r = sets[k];
      if (r.exercise_key !== exKey || r.session_date >= beforeDate) return;
      if ((r.variant || 'main') !== (variant || 'main')) return;
      if (!best || r.session_date > best) best = r.session_date;
    });
    if (!best) return null;
    var rows = Object.keys(sets).map(function (k) { return sets[k]; }).filter(function (r) {
      return r.exercise_key === exKey && r.session_date === best && (r.variant || 'main') === (variant || 'main');
    }).sort(function (a, b) { return a.set_no - b.set_no; });
    return { date: best, sets: rows };
  }

  /** Double progression hint for the next session. */
  function progressionHint(ex, last) {
    var lo = ex.reps[0], hi = ex.reps[1];
    if (!last || !last.sets.length) return { kind: 'first' };
    var done = last.sets.filter(function (s) { return parseNum(s.reps) !== null; });
    if (!done.length) return { kind: 'first' };
    var weights = done.map(function (s) { return parseNum(s.weight_kg); }).filter(function (x) { return x !== null; });
    var w = weights.length ? Math.max.apply(null, weights) : null;
    var allTop = done.every(function (s) { return parseNum(s.reps) >= hi; });
    var anyLow = done.some(function (s) { return parseNum(s.reps) < lo; });
    if (allTop) return { kind: 'increase', weight: w };
    if (anyLow) return { kind: 'low', weight: w };
    return { kind: 'hold', weight: w };
  }

  function warmupFor(plan, session, exIndex, workingWeight) {
    var compounds = [];
    session.exercises.forEach(function (e, i) { if (e.type === 'compound' && !e.bodyweight) compounds.push(i); });
    var slot = compounds[0] === exIndex ? 'first_compound' : (compounds[1] === exIndex ? 'second_compound' : null);
    if (!slot) return null;
    var item = plan.warmup.filter(function (w) { return w.target === slot; })[0];
    if (!item) return null;
    return item.ramp.map(function (r) {
      return { pct: r[0], reps: r[1], weight: workingWeight ? Math.round(workingWeight * r[0] * 2) / 2 : null };
    });
  }

  function painLevel(plan, v) {
    if (v === null || v === undefined) return null;
    for (var i = 0; i < plan.shoulder.scale.length; i++) if (v <= plan.shoulder.scale[i].max) return plan.shoulder.scale[i];
    return plan.shoulder.scale[plan.shoulder.scale.length - 1];
  }

  /** Planned trajectory for the chart: straight line from the start weight to the middle of the target range. */
  function trajectory(plan) {
    var g = plan.goal;
    return { from: g.weight_start_date, w0: g.weight_start, to: plan.end, w1: (g.weight_target[0] + g.weight_target[1]) / 2 };
  }

  var api = {
    parseNum: parseNum, round: round, fmt: fmt, mean: mean,
    ymd: ymd, daysBetween: daysBetween, addDays: addDays, dow: dow, dayLabel: dayLabel, shortDate: shortDate,
    DAY_NAMES: DAY_NAMES, MONTHS: MONTHS,
    weekNo: weekNo, weekRange: weekRange, inPlan: inPlan, phase: phase, sessionKeyFor: sessionKeyFor,
    isTrainingDay: isTrainingDay, setIndex: setIndex, setsFor: setsFor, rirFor: rirFor,
    stepsTarget: stepsTarget, cardioFor: cardioFor, isCardioDay: isCardioDay, waterTarget: waterTarget,
    bridgeAllowed: bridgeAllowed, events: events, milestones: milestones,
    windowState: windowState, dur: dur, hm: hm,
    weekStats: weekStats, allWeekStats: allWeekStats, lossRate: lossRate, decide: decide,
    lastPerformance: lastPerformance, progressionHint: progressionHint, warmupFor: warmupFor,
    painLevel: painLevel, trajectory: trajectory, logsInRange: logsInRange
  };
  root.FPLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
