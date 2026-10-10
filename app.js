/* خطة اللياقة: daily app. Data lives in Supabase (auth + RLS); this file holds no personal data. */
(function () {
  'use strict';

  var L = window.FPLogic;
  var APP_VERSION = '1.0.0';
  var CFG = window.APP_CONFIG || {};
  var K = { cache: 'fp.cache.v1', queue: 'fp.queue.v1', failed: 'fp.failed.v1', drafts: 'fp.drafts.v1', prefs: 'fp.prefs.v1', sets: 'fp.setdrafts.v1' };
  var $app = document.getElementById('app');
  var $tabs = document.getElementById('tabs');
  var $save = document.getElementById('savebar');
  var $rest = document.getElementById('restbar');
  var $toast = document.getElementById('toast');

  // ---------------------------------------------------------------- storage
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nz(v) { return v === undefined ? null : v; }
  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function trimNum(n, d) { if (n === null || n === undefined || !isFinite(n)) return '—'; return String(Number(Number(n).toFixed(d === undefined ? 2 : d))); }
  function today() { return L.ymd(new Date()); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function clock(ts) {
    var d = new Date(ts), h = d.getHours(), m = d.getMinutes();
    var suffix = h < 12 ? 'ص' : 'م';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + suffix;
  }
  function signed(n, d) { if (n === null || n === undefined || !isFinite(n)) return '—'; var v = Number(Number(n).toFixed(d === undefined ? 2 : d)); return (v > 0 ? '+' : (v < 0 ? '−' : '')) + String(Math.abs(v)); }
  function count(n, one, two, few, many) { return n === 1 ? one : (n === 2 ? two : (n >= 3 && n <= 10 ? n + ' ' + few : n + ' ' + many)); }
  function mmss(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  function firstNum(text) { var m = String(text || '').match(/\d+/); return m ? m[0] : ''; }

  var I = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3.5 10h17"/></svg>',
    workout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
    progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20.5h18"/><path d="M4.5 16l4.5-5.5 4 3.5 6.5-8"/></svg>',
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.5h10.5a3.5 3.5 0 0 1 3.5 3.5v13.5H8.5A3.5 3.5 0 0 1 5 17z"/><path d="M9 8.5h6M9 12.5h6"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5.5l6.5 6.5L9 18.5"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.5L8.5 12l6.5 6.5"/></svg>'
  };

  // ---------------------------------------------------------------- state
  function emptyData() { return { logs: {}, sessions: {}, sets: {}, meas: {} }; }
  var prefs = load(K.prefs, {});
  var S = {
    sb: null, user: null, profile: null, plan: null, meta: null,
    data: emptyData(), view: 'today', date: today(), wKey: null,
    queue: load(K.queue, []), failed: load(K.failed, []),
    drafts: load(K.drafts, {}), setDrafts: load(K.sets, {}),
    variants: {}, extraRows: {}, errs: {},
    sync: { state: 'idle', at: null, msg: '' }, syncing: false, loadedAt: null,
    needsRender: false, ready: false, showInbody: false
  };

  // ---------------------------------------------------------------- boot
  function configProblem() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return 'مكتبة Supabase لم تُحمَّل (vendor/supabase-2.117.2.js).';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CFG.supabaseUrl || '')) return 'رابط المشروع في config.js ناقص أو غير صالح.';
    if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(CFG.supabaseKey || '')) {
      return 'المفتاح في config.js ليس مفتاحًا قابلًا للنشر (يبدأ بـ sb_publishable_). لا يقبل التطبيق أي مفتاح آخر حتى لا يصل مفتاح سري إلى المتصفح.';
    }
    return null;
  }

  function boot() {
    applyTheme();
    bindGlobal();
    var problem = configProblem();
    if (problem) { renderFatal('إعداد الاتصال غير صالح', problem, false); return; }
    S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'fp.auth' }
    });
    S.sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') { S.user = null; renderLogin(); }
      if (event === 'TOKEN_REFRESHED' && S.queue.length) flushSoon(500);
    });
    S.sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (session && session.user) onSignedIn(session.user); else renderLogin();
    }).catch(function () { renderLogin(); });
    registerSW();
    setInterval(tick, 1000);
  }

  function onSignedIn(user) {
    S.user = user;
    var c = load(K.cache, null);
    if (c && c.uid === user.id && c.plan) {
      S.plan = c.plan; S.meta = c.meta; S.profile = c.profile; S.data = c.data || emptyData();
      overlayQueue();
      if (S.profile && S.profile.active) { S.ready = true; render(); }
    } else {
      drop(K.cache);
      renderLoading();
    }
    refresh();
  }

  function saveCache() {
    if (!S.user) return;
    store(K.cache, { uid: S.user.id, plan: S.plan, meta: S.meta, profile: S.profile, data: S.data, at: Date.now() });
  }

  async function fetchAll(table, orderCols, dateCol, since) {
    var out = [], size = 1000, from = 0;
    for (;;) {
      var q = S.sb.from(table).select('*').gte(dateCol, since);
      orderCols.forEach(function (c) { q = q.order(c, { ascending: true }); });
      var r = await q.range(from, from + size - 1);
      if (r.error) throw r.error;
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
      from += size;
    }
    return out;
  }

  async function refresh() {
    if (!S.user) return;
    setSync('syncing');
    try {
      var pr = await S.sb.from('profiles').select('role,active').eq('id', S.user.id).maybeSingle();
      if (pr.error) throw pr.error;
      S.profile = pr.data || { role: null, active: false };
      if (!S.profile.active) { S.ready = false; saveCache(); setSync('idle'); renderInactive(); return; }
      var pl = await S.sb.from('plan_versions').select('version,title,plan,doc_markdown,change_note,created_at').eq('is_current', true).maybeSingle();
      if (pl.error) throw pl.error;
      if (!pl.data) { renderFatal('لا توجد خطة حالية', 'جدول plan_versions لا يحوي نسخة حالية (is_current).', true); return; }
      S.plan = pl.data.plan;
      S.meta = { version: pl.data.version, title: pl.data.title, note: pl.data.change_note, at: pl.data.created_at, doc: pl.data.doc_markdown };
      var since = L.addDays(S.plan.start, -21);
      var res = await Promise.all([
        fetchAll('daily_logs', ['log_date'], 'log_date', since),
        fetchAll('workout_sessions', ['session_date', 'session_key'], 'session_date', since),
        fetchAll('workout_sets', ['session_date', 'session_key', 'exercise_key', 'set_no'], 'session_date', since),
        fetchAll('body_measurements', ['measured_on', 'source'], 'measured_on', since)
      ]);
      var d = emptyData();
      res[0].forEach(function (r) { d.logs[r.log_date] = r; });
      res[1].forEach(function (r) { d.sessions[keyFor('workout_sessions', r)] = r; });
      res[2].forEach(function (r) { d.sets[keyFor('workout_sets', r)] = r; });
      res[3].forEach(function (r) { d.meas[keyFor('body_measurements', r)] = r; });
      S.data = d;
      overlayQueue();
      S.loadedAt = Date.now();
      saveCache();
      var first = !S.ready;
      S.ready = true;
      if (first) render(); else renderSoon();
      if (S.queue.length) flush(); else setSync('ok');
    } catch (e) {
      netProblem(e);
    }
  }

  function netProblem(e) {
    var msg = (e && e.message) || String(e);
    if (S.ready) {
      setSync(navigator.onLine ? 'pending' : 'offline', msg);
      renderStatus();
      return;
    }
    renderFatal('تعذّر الوصول إلى Supabase',
      (navigator.onLine ? 'الاتصال موجود لكن الخادم لم يرد. قد يكون المشروع المجاني متوقفًا بعد أسبوع بلا استخدام: افتح لوحة Supabase واضغط Restore.' : 'لا يوجد اتصال بالإنترنت، ولا توجد نسخة محفوظة على هذا الجهاز بعد.') + '\n\n' + msg, true);
  }

  // ---------------------------------------------------------------- local data + queue
  var TBL = { daily_logs: 'logs', workout_sessions: 'sessions', workout_sets: 'sets', body_measurements: 'meas' };
  var CONFLICT = {
    daily_logs: 'user_id,log_date',
    workout_sessions: 'user_id,session_date,session_key',
    workout_sets: 'user_id,session_date,session_key,exercise_key,set_no',
    body_measurements: 'user_id,measured_on,source'
  };
  function keyFor(table, r) {
    if (table === 'daily_logs') return r.log_date;
    if (table === 'workout_sessions') return r.session_date + '|' + r.session_key;
    if (table === 'workout_sets') return r.session_date + '|' + r.session_key + '|' + r.exercise_key + '|' + r.set_no;
    return r.measured_on + '|' + (r.source || 'inbody');
  }
  function putLocal(table, row) {
    var bag = S.data[TBL[table]], k = keyFor(table, row);
    bag[k] = Object.assign({}, bag[k] || {}, row);
  }
  function delLocal(table, match) { delete S.data[TBL[table]][keyFor(table, match)]; }
  function overlayQueue() {
    S.queue.forEach(function (op) { if (op.op === 'upsert') putLocal(op.table, op.row); else delLocal(op.table, op.match); });
  }
  function write(table, row) {
    row.user_id = S.user.id;
    putLocal(table, row);
    enqueue({ op: 'upsert', table: table, key: keyFor(table, row), row: row, at: Date.now() });
    saveCache();
  }
  function remove(table, match) {
    match.user_id = S.user.id;
    delLocal(table, match);
    enqueue({ op: 'delete', table: table, key: keyFor(table, match), match: match, at: Date.now() });
    saveCache();
  }
  function enqueue(op) {
    var i = -1;
    for (var j = 0; j < S.queue.length; j++) if (S.queue[j].table === op.table && S.queue[j].key === op.key) { i = j; break; }
    if (i >= 0 && S.queue[i].op === 'upsert' && op.op === 'upsert') {
      S.queue[i].row = Object.assign({}, S.queue[i].row, op.row); // merge in place keeps the original order
      S.queue[i].at = op.at;
    } else {
      if (i >= 0) S.queue.splice(i, 1);
      S.queue.push(op);
    }
    store(K.queue, S.queue);
    renderStatus();
    flushSoon(250);
  }

  var flushTimer = null, retryTimer = null;
  function flushSoon(ms) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms || 300); }
  function classify(res) {
    var e = res.error || {}, st = res.status || 0, code = e.code || '';
    if (code === 'PGRST301' || code === 'PGRST303' || st === 401) return 'auth';
    if (code === '23503') return 'fk';
    if (!st || st >= 500 || st === 408 || st === 429) return 'transient';
    return 'permanent';
  }
  function friendlyError(e) {
    if (!e) return 'خطأ غير معروف';
    if (e.code === '42501') return 'لا تملك صلاحية الكتابة. تأكد أن حسابك مفعّل كمالك.';
    if (e.code === '23514') return 'قيمة خارج النطاق المسموح.';
    if (e.code === '22P02' || e.code === '22003') return 'قيمة غير صالحة.';
    return e.message || 'خطأ غير معروف';
  }

  async function flush() {
    if (S.syncing || !S.user || !S.sb) return;
    if (!S.queue.length) { if (S.sync.state === 'syncing') setSync(S.failed.length ? 'error' : 'ok'); return; }
    if (navigator.onLine === false) { setSync('offline'); return; }
    S.syncing = true;
    setSync('syncing');
    while (S.queue.length) {
      var op = S.queue[0], res;
      try {
        res = op.op === 'upsert'
          ? await S.sb.from(op.table).upsert(op.row, { onConflict: CONFLICT[op.table] })
          : await S.sb.from(op.table).delete().match(op.match);
      } catch (e) {
        res = { error: { message: String((e && e.message) || e) }, status: 0 };
      }
      if (res.error) {
        var kind = classify(res);
        if (kind === 'auth' && !op._authRetried) {
          op._authRetried = true;
          var rr = await S.sb.auth.refreshSession().catch(function () { return { error: true }; });
          if (rr && !rr.error) continue;
          S.syncing = false; setSync('error', 'انتهت الجلسة: سجّل الدخول من جديد.'); return;
        }
        if (kind === 'fk' && op.table === 'workout_sets' && !op._fkRetried) {
          op._fkRetried = true;
          var sk = op.row.session_date + '|' + op.row.session_key;
          var sess = Object.assign({ session_date: op.row.session_date, session_key: op.row.session_key }, S.data.sessions[sk] || {});
          sess.user_id = S.user.id;
          S.queue.unshift({ op: 'upsert', table: 'workout_sessions', key: sk, row: sess, at: Date.now() });
          store(K.queue, S.queue);
          continue;
        }
        if (kind === 'transient') {
          S.syncing = false;
          setSync(navigator.onLine === false ? 'offline' : 'pending', res.error.message);
          clearTimeout(retryTimer); retryTimer = setTimeout(flush, 20000);
          return;
        }
        S.failed.push({ op: op, error: friendlyError(res.error), code: res.error.code || '', at: Date.now() });
        store(K.failed, S.failed);
        S.queue.shift(); store(K.queue, S.queue);
        if (isAwaited(op)) S.saveToast = null; // never announce success for a record the server refused
        toast('تعذّر الحفظ في Supabase: ' + friendlyError(res.error), true);
        continue;
      }
      S.queue.shift();
      store(K.queue, S.queue);
      if (isAwaited(op)) { toast(S.saveToast.text); S.saveToast = null; } // success only after the server confirmed this record
    }
    S.syncing = false;
    S.sync.at = Date.now();
    setSync(S.failed.length ? 'error' : 'ok');
  }
  function isAwaited(op) { return !!(S.saveToast && S.saveToast.table === op.table && S.saveToast.key === op.key); }
  function awaitSave(table, key, text) { S.saveToast = { table: table, key: key, text: text }; }

  function setSync(state, msg) { S.sync.state = state; S.sync.msg = msg || ''; renderStatus(); }
  function syncInfo() {
    var n = S.queue.length, f = S.failed.length, off = navigator.onLine === false;
    if (S.sync.state === 'syncing') return { cls: 'syncing', text: 'جارٍ الحفظ' };
    if (f) return { cls: 'error', text: 'تعذّر حفظ ' + f };
    if (off) return { cls: 'offline', text: n ? 'دون اتصال (' + n + ')' : 'دون اتصال' };
    if (n) return { cls: 'pending', text: 'بانتظار الرفع (' + n + ')' };
    if (S.sync.state === 'ok' || S.loadedAt) return { cls: 'ok', text: 'محفوظ' };
    return { cls: '', text: 'جارٍ الاتصال' };
  }

  // ---------------------------------------------------------------- daily form model
  var FIELDS = {
    weight_kg: { kind: 'dec', min: 30, max: 250, dp: 2 },
    waist1: { kind: 'dec', min: 40, max: 200, dp: 1 },
    waist2: { kind: 'dec', min: 40, max: 200, dp: 1 },
    sleep_h: { kind: 'dec', min: 0, max: 24, dp: 1 },
    resting_hr: { kind: 'int', min: 25, max: 150 },
    water_l: { kind: 'dec', min: 0, max: 15, dp: 2 },
    steps: { kind: 'int', min: 0, max: 100000 },
    kcal: { kind: 'int', min: 0, max: 10000 },
    protein_g: { kind: 'int', min: 0, max: 600 },
    cardio_min: { kind: 'int', min: 0, max: 600 },
    test_hr: { kind: 'int', min: 40, max: 220 }
  };
  function savedForm(row) {
    if (!row) return {};
    var ex = row.extra || {}, w = ex.waist || [], meals = row.meals || {};
    return {
      weight_kg: str(row.weight_kg), waist1: str(w.length ? w[0] : row.waist_cm), waist2: str(w.length > 1 ? w[1] : null),
      sleep_h: str(row.sleep_h), resting_hr: str(row.resting_hr), water_l: str(row.water_l), steps: str(row.steps),
      kcal: str(row.kcal), protein_g: str(row.protein_g), cardio_min: str(row.cardio_min), test_hr: str(row.test_hr),
      hunger: nz(row.hunger), adherent: nz(row.adherent), shoulder_am: nz(row.shoulder_pain), cardio_mode: nz(row.cardio_mode),
      creatine: !!row.creatine, vitd: !!ex.vitd, photos_done: !!row.photos_done,
      m1: !!meals.m1, m2: !!meals.m2, m3: !!meals.m3, m4: !!meals.m4, bridge: !!meals.bridge, treat: !!meals.treat,
      notes: row.notes || ''
    };
  }
  function formFor(d) { return Object.assign({}, savedForm(S.data.logs[d]), S.drafts[d] || {}); }
  function norm(v) { if (v === undefined || v === null) return ''; if (typeof v === 'boolean') return v ? '1' : ''; return String(v).trim(); }
  function isDirty(d) {
    var dr = S.drafts[d];
    if (!dr) return false;
    var sv = savedForm(S.data.logs[d]);
    return Object.keys(dr).some(function (k) { return norm(dr[k]) !== norm(sv[k]); });
  }
  var draftTimer = null;
  function setDraft(d, k, v) {
    S.drafts[d] = S.drafts[d] || {};
    S.drafts[d][k] = v;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () { store(K.drafts, S.drafts); }, 250);
    if (S.errs[k]) { delete S.errs[k]; var el = document.querySelector('[data-wrap="' + k + '"]'); if (el) el.classList.remove('err'); }
    renderSavebar();
  }

  function saveDay() {
    var d = S.date, f = formFor(d), errs = {};
    function num(k) {
      var spec = FIELDS[k], raw = f[k];
      if (raw === undefined || raw === null || String(raw).trim() === '') return null;
      var v = L.parseNum(raw, { int: spec.kind === 'int' });
      if (v === null || v < spec.min || v > spec.max) { errs[k] = 'أدخل رقمًا بين ' + spec.min + ' و' + spec.max; return null; }
      return spec.dp !== undefined ? L.round(v, spec.dp) : v;
    }
    var prev = S.data.logs[d] || {};
    var row = { log_date: d };
    row.weight_kg = num('weight_kg');
    var w1 = num('waist1'), w2 = num('waist2');
    row.sleep_h = num('sleep_h'); row.resting_hr = num('resting_hr'); row.water_l = num('water_l');
    row.steps = num('steps'); row.kcal = num('kcal'); row.protein_g = num('protein_g');
    row.cardio_min = num('cardio_min'); row.test_hr = num('test_hr');
    if (Object.keys(errs).length) {
      S.errs = errs;
      render(true);
      toast('صحّح الحقول المعلّمة بالأحمر ثم احفظ.', true);
      return;
    }
    var waists = [w1, w2].filter(function (x) { return x !== null; });
    row.waist_cm = waists.length ? L.round(L.mean(waists), 1) : null;
    row.extra = Object.assign({}, prev.extra || {}, { waist: waists, vitd: !!f.vitd });
    row.meals = { m1: !!f.m1, m2: !!f.m2, m3: !!f.m3, m4: !!f.m4, bridge: !!f.bridge, treat: !!f.treat };
    row.hunger = f.hunger === null || f.hunger === undefined ? null : f.hunger;
    row.adherent = f.adherent === true || f.adherent === false ? f.adherent : null;
    row.shoulder_pain = f.shoulder_am === null || f.shoulder_am === undefined ? null : f.shoulder_am;
    row.cardio_mode = f.cardio_mode || null;
    row.creatine = !!f.creatine;
    row.photos_done = !!f.photos_done;
    row.notes = String(f.notes || '').trim().slice(0, 2000) || null;
    delete S.drafts[d];
    store(K.drafts, S.drafts);
    S.errs = {};
    awaitSave('daily_logs', d, 'حُفظ يوم ' + L.dayLabel(d) + ' في Supabase');
    write('daily_logs', row);
    if (navigator.onLine === false) toast('لا يوجد اتصال: حُفظ على الجهاز وسيُرفع تلقائيًا عند عودة الاتصال.');
    render(true);
  }

  // ---------------------------------------------------------------- rendering core
  function render(keepScroll) {
    if (!S.ready || !S.plan) return;
    var y = window.scrollY;
    var views = { today: viewToday, workout: viewWorkout, progress: viewProgress, plan: viewPlan, more: viewMore };
    $app.innerHTML = (views[S.view] || viewToday)();
    renderTabs();
    renderSavebar();
    renderStatus();
    S.needsRender = false;
    window.scrollTo(0, keepScroll ? y : 0);
    tick();
  }
  function renderSoon() {
    var a = document.activeElement;
    if (a && $app.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { S.needsRender = true; return; }
    render(true);
  }
  function renderTabs() {
    var items = [['today', 'اليوم'], ['workout', 'التمرين'], ['progress', 'التقدم'], ['plan', 'الخطة'], ['more', 'المزيد']];
    $tabs.hidden = false;
    $tabs.querySelector('.in').innerHTML = items.map(function (t) {
      return '<button type="button" data-act="tab" data-v="' + t[0] + '"' + (S.view === t[0] ? ' aria-current="page"' : '') + '>' + I[t[0]] + '<span>' + t[1] + '</span></button>';
    }).join('');
  }
  function hideChrome() { $tabs.hidden = true; $save.hidden = true; $rest.hidden = true; }
  function renderStatus() {
    var info = syncInfo();
    Array.prototype.forEach.call(document.querySelectorAll('.sync'), function (el) {
      el.className = 'sync ' + info.cls;
      el.innerHTML = '<i></i>' + esc(info.text);
    });
    renderSavebar();
  }
  function renderSavebar() {
    var show = S.ready && S.view === 'today';
    document.body.classList.toggle('has-savebar', !!show);
    if (!show) { $save.hidden = true; return; }
    var d = S.date, dirty = isDirty(d), saved = !!S.data.logs[d];
    var pending = S.queue.some(function (q) { return q.table === 'daily_logs' && q.key === d; });
    var state;
    if (dirty) state = '<b>تغييرات غير محفوظة</b>محفوظة مؤقتًا على الجهاز';
    else if (pending) state = '<b>محفوظ على الجهاز</b>بانتظار الرفع إلى Supabase';
    else if (saved) state = '<b>محفوظ في Supabase</b>' + (S.sync.at ? 'آخر رفع ' + clock(S.sync.at) : '');
    else state = '<b>لم يُسجَّل هذا اليوم</b>';
    $save.hidden = false;
    $save.className = 'savebar' + (dirty ? '' : ' clean');
    $save.innerHTML = '<div class="in"><div class="state">' + state.replace('</b>', '</b><br>') + '</div>' +
      '<button type="button" class="btn btn-primary" data-act="save-day">' + (dirty ? 'حفظ اليوم' : (saved ? 'حفظ مجددًا' : 'حفظ اليوم')) + '</button></div>';
  }

  function topbar() {
    var d = S.date, t = today();
    var label = d === t ? 'اليوم، ' + L.dayLabel(d) : L.dayLabel(d);
    return '<div class="top">' +
      '<div class="datenav">' +
      '<button type="button" class="iconbtn" data-act="day" data-n="-1" aria-label="اليوم السابق">' + I.prev + '</button>' +
      '<button type="button" class="d" data-act="day-today" title="العودة إلى اليوم">' + esc(label) + '</button>' +
      '<button type="button" class="iconbtn" data-act="day" data-n="1" aria-label="اليوم التالي">' + I.next + '</button>' +
      '</div><button type="button" class="sync" data-act="sync"><i></i></button></div>';
  }

  // ---------------------------------------------------------------- TODAY
  var SHORT_DAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  function weekStrip(n, d) {
    var P = S.plan, html = '<div class="weeks" aria-hidden="true">';
    for (var i = 1; i <= P.weeks; i++) {
      if (i < n) html += '<i class="past"></i>';
      else if (i === n) {
        var r = L.weekRange(P, n), p = Math.round(((L.daysBetween(r.from, d) + 1) / 7) * 100);
        html += '<i class="now" style="--p:' + p + '%"></i>';
      } else html += '<i></i>';
    }
    return html + '</div>';
  }

  function sessionDone(dateStr, key) {
    var prefix = dateStr + '|' + key + '|';
    return Object.keys(S.data.sets).some(function (k) { return k.indexOf(prefix) === 0; });
  }
  function sessionsInRange(from, to) {
    var out = {};
    Object.keys(S.data.sets).forEach(function (k) {
      var r = S.data.sets[k];
      if (r.session_date >= from && r.session_date <= to) out[r.session_key] = (out[r.session_key] || 0) + 1;
    });
    return out;
  }

  function dayChips(n, sel) {
    var P = S.plan, r = L.weekRange(P, Math.max(1, Math.min(P.weeks, n))), html = '<div class="days">';
    for (var i = 0; i < 7; i++) {
      var d = L.addDays(r.from, i), sk = L.sessionKeyFor(P, d);
      var logged = !!S.data.logs[d], trained = sk !== 'rest' && sessionDone(d, sk);
      var cls = 'day' + (d === sel ? ' sel' : '') + (sk === 'rest' ? ' rest' : '') + (L.inPlan(P, d) ? '' : ' out');
      html += '<button type="button" class="' + cls + '" data-act="goto" data-d="' + d + '" aria-label="' + esc(L.dayLabel(d)) + '">' +
        '<span>' + SHORT_DAYS[i] + '</span><b>' + (+d.slice(8)) + '</b>' +
        '<span class="marks">' + (logged ? '<u title="مسجّل"></u>' : '') + (trained ? '<u class="t" title="تمرين"></u>' : '') + '</span></button>';
    }
    return html + '</div>';
  }

  function heroToday() {
    var P = S.plan, d = S.date, n = L.weekNo(P, d), ph = L.phase(P, d);
    var sk = L.sessionKeyFor(P, d), sess = sk !== 'rest' ? P.sessions[sk] : null;
    var kicker, title, sub, cta = '';
    if (ph === 'before') {
      kicker = 'قبل البداية';
      title = 'استعداد';
      sub = 'الخطة تبدأ ' + L.dayLabel(P.start) + ' بقياس InBody، والتمرين ' + L.dayLabel(P.train_start) + ' الساعة 6:00.';
    } else if (ph === 'after') {
      kicker = 'بعد الخطة';
      title = 'انتهت الخطة';
      sub = 'القياس النهائي كان ' + L.dayLabel(P.end) + '.';
    } else if (L.isTrainingDay(P, d)) {
      kicker = 'الأسبوع ' + n + ' من ' + P.weeks;
      title = sess.name;
      var cnt = sess.exercises.filter(function (e) { return L.setsFor(e, n) > 0; }).length;
      sub = sess.day + '، ' + count(cnt, 'تمرين واحد', 'تمرينان', 'تمارين', 'تمرينًا') + '، الساعة 6:00' + (sess.duration ? '، ' + sess.duration : '');
      cta = '<button type="button" class="btn btn-primary go" data-act="open-workout">' + (sessionDone(d, sk) ? 'متابعة حصة اليوم' : 'افتح حصة اليوم') + '</button>';
    } else {
      var c = L.cardioFor(P, n);
      kicker = 'الأسبوع ' + n + ' من ' + P.weeks;
      title = P.rest_day.name;
      sub = 'كارديو ' + c.min + ' دقيقة: ' + P.cardio.modes.join(' أو ') + '.';
    }
    var wk = ph === 'during' ? n : 1;
    return '<section class="hero"><p class="kicker">' + esc(kicker) + '</p><h1>' + esc(title) + '</h1><p class="sub">' + esc(sub) + '</p>' +
      (ph !== 'after' ? weekStrip(ph === 'during' ? n : 0, d) : '') +
      (ph === 'during' ? '<div class="weekline"><span>' + esc(L.shortDate(L.weekRange(P, n).from)) + ' – ' + esc(L.shortDate(L.weekRange(P, n).to)) + '</span><span>الخطوات: ' + esc(L.stepsTarget(P, n).label) + ' يوميًا</span></div>' : '') +
      dayChips(wk, d) + cta + '</section>';
  }

  function eventsBlock() {
    var P = S.plan, d = S.date, ev = L.events(P, d).filter(function (e) { return e.type !== 'waist'; });
    if (!ev.length) return '';
    var text = {
      inbody: P.measure.inbody + ' سجّل النتائج في «التقدم».',
      review: 'افتح «التقدم» لترى اقتراح جدول القرار، وأرسل لي الأرقام.',
      photos: P.measure.photos,
      test: P.fitness_test ? P.fitness_test.protocol : ''
    };
    return '<div class="events">' + ev.map(function (e) {
      return '<div class="event ' + e.type + '"><i class="dot"></i><div><b>' + esc(e.label) + '</b><span>' + esc(text[e.type] || '') + '</span></div></div>';
    }).join('') + '</div>';
  }

  function field(k, label, unit, f, opts) {
    opts = opts || {};
    var spec = FIELDS[k] || {}, err = S.errs[k];
    var mode = spec.kind === 'int' ? 'numeric' : 'decimal';
    return '<div class="field' + (opts.big ? ' hero-field' : '') + (opts.span ? ' span2' : '') + (err ? ' err' : '') + '" data-wrap="' + k + '">' +
      '<label for="f-' + k + '">' + esc(label) + '</label>' +
      '<div class="val"><input id="f-' + k + '" data-f="' + k + '" type="text" inputmode="' + mode + '" autocomplete="off" enterkeyhint="done" value="' + esc(f[k]) + '"' +
      (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '>' + (unit ? '<span class="unit">' + esc(unit) + '</span>' : '') + '</div>' +
      (err ? '<span class="errmsg">' + esc(err) + '</span>' : (opts.hint ? '<span class="fhint' + (opts.good ? ' good' : '') + '">' + esc(opts.hint) + '</span>' : '')) + '</div>';
  }

  function scale(k, from, to, f, cls, levelFn) {
    var html = '<div class="scale ' + cls + '" role="group">';
    for (var v = from; v <= to; v++) {
      var lv = levelFn ? levelFn(v) : '';
      html += '<button type="button" class="chip ' + lv + '" data-act="pick" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + (f[k] === v) + '">' + v + '</button>';
    }
    return html + '</div>';
  }

  function toggleRow(k, title, sub, f) {
    return '<div class="qline"><div class="q">' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' +
      '<button type="button" class="tog" data-act="bool" data-k="' + k + '" aria-pressed="' + (!!f[k]) + '" aria-label="' + esc(title) + '"></button></div>';
  }

  function recentWeights(d, days) {
    var from = L.addDays(d, -days + 1);
    return L.logsInRange(S.data.logs, from, d).map(function (r) { return L.parseNum(r.weight_kg); }).filter(function (x) { return x !== null; });
  }

  function viewToday() {
    var P = S.plan, d = S.date, n = Math.max(1, L.weekNo(P, d)), f = formFor(d);
    var isSun = L.dow(d) === 0, ev = L.events(P, d).map(function (e) { return e.type; });
    var training = L.isTrainingDay(P, d);
    var prevW = recentWeights(L.addDays(d, -1), 7);
    var avg7 = L.mean(prevW);

    // morning
    var morning = '<section class="block"><h2>الصباح <small>قبل الأكل والشرب</small></h2><div class="grid2">' +
      field('weight_kg', 'الوزن الصباحي', 'كغ', f, { big: true, span: true, ph: '00.0', hint: prevW.length ? 'آخر قراءة ' + trimNum(prevW[prevW.length - 1]) + ' كغ، ومتوسط الأيام السبعة السابقة ' + trimNum(avg7, 2) + '. المهم متوسط الأسبوع.' : P.measure.weight });
    if (isSun || f.waist1 || f.waist2) {
      var w1 = L.parseNum(f.waist1), w2 = L.parseNum(f.waist2);
      var wa = w1 !== null && w2 !== null ? 'المتوسط ' + trimNum((w1 + w2) / 2, 1) + ' سم' : 'الموضع نفسه، نهاية زفير عادي';
      morning += field('waist1', 'الخصر (قياس 1)', 'سم', f, { hint: wa }) + field('waist2', 'الخصر (قياس 2)', 'سم', f, { hint: 'يُحفظ متوسط القياسين' });
    }
    morning += field('sleep_h', 'النوم', 'ساعة', f, { hint: 'الهدف ' + P.targets.sleep_h + ' ساعات، والنوم قرابة 9:45' }) +
      field('resting_hr', 'نبض الراحة', 'ن/د', f, { hint: 'من الساعة' }) + '</div>' +
      '<div class="panel" style="margin-top:10px"><div class="q" style="font-weight:600;margin-bottom:8px">ألم الكتف الأيسر صباحًا <span class="muted small">(0 لا ألم، 10 أسوأ ألم)</span></div>' +
      scale('shoulder_am', 0, 10, f, 's11', function (v) { return v >= 5 ? 'stop' : (v >= 3 ? 'warn' : ''); }) +
      (f.shoulder_am !== null && f.shoulder_am !== undefined ? '<p class="hint ' + painCls(f.shoulder_am) + '">' + esc(L.painLevel(P, f.shoulder_am).text) + '</p>' : '') +
      '</div></section>';

    // food
    var ws = L.windowState(P, nowMin());
    var winLine = d === today()
      ? (ws.open ? '<span class="st open">النافذة مفتوحة</span><span>تغلق 3:00 عصرًا، باقٍ ' + L.dur(ws.left) + '</span>'
        : '<span class="st">النافذة مغلقة</span><span>تفتح 5:00 فجرًا بعد ' + L.dur(ws.until) + '</span>')
      : '<span class="st">نافذة الأكل</span><span>' + esc(P.window.label) + '</span>';
    var checked = { kcal: 0, p: 0 };
    var meals = P.meals.map(function (m) {
      if (f[m.key]) { checked.kcal += m.kcal; checked.p += m.p; }
      return '<div class="meal"><div class="t">' + esc(m.time_label) + '<small>' + esc(m.place) + '</small></div>' +
        '<div><div class="nm">' + esc(m.name) + ' <span class="kc">' + m.kcal + ' سعرة</span></div><div class="mac">بروتين ' + m.p + ' غ، كارب ' + m.c + ' غ، دهون ' + m.f + ' غ</div>' +
        '<div class="mex">' + esc(m.example) + (m.alt ? '<br>بديل: ' + esc(m.alt) : '') + '</div></div>' +
        '<button type="button" class="tick" data-act="bool" data-k="' + m.key + '" aria-pressed="' + (!!f[m.key]) + '" aria-label="' + esc('أكلت ' + m.name) + '">' + I.check + '</button></div>';
    }).join('');
    var wr = L.weekRange(P, n);
    var treats = L.logsInRange(S.data.logs, wr.from, wr.to).filter(function (r) { return r.log_date !== d && r.meals && r.meals.treat; }).length + (f.treat ? 1 : 0);
    var extras = '';
    if (L.bridgeAllowed(P, d)) {
      extras += '<div class="meal"><div class="t">مساءً<small>البيت</small></div><div><div class="nm">وجبة الجسر</div><div class="mex">' + esc(P.bridge.text) + '</div></div>' +
        '<button type="button" class="tick" data-act="bool" data-k="bridge" aria-pressed="' + (!!f.bridge) + '" aria-label="وجبة الجسر">' + I.check + '</button></div>';
    }
    extras += '<div class="meal"><div class="t">مرة<small>أسبوعيًا</small></div><div><div class="nm">حصة الحلو المخططة</div><div class="mex">حتى ' + P.treat.kcal_max + ' سعرة داخل النافذة، مكان وحدتي نشويات. هذا الأسبوع: ' + treats + ' من ' + P.treat.per_week + '.</div></div>' +
      '<button type="button" class="tick" data-act="bool" data-k="treat" aria-pressed="' + (!!f.treat) + '" aria-label="حصة الحلو">' + I.check + '</button></div>';
    var T = P.targets;
    var food = '<section class="block"><h2>الأكل <small>' + T.kcal.toLocaleString('en-US') + ' سعرة، ' + T.protein_g + ' غ بروتين</small></h2>' +
      '<div class="window" id="win">' + winLine + '</div>' + meals + extras +
      '<div class="totals"><span>المنجز من الوجبات: ' + checked.kcal.toLocaleString('en-US') + ' سعرة، ' + checked.p + ' غ بروتين</span></div>' +
      '<div class="grid2" style="margin-top:14px">' +
      field('kcal', 'السعرات المسجّلة', 'سعرة', f, { hint: 'الهدف ' + T.kcal_range[0].toLocaleString('en-US') + '–' + T.kcal_range[1].toLocaleString('en-US') + (n <= 2 ? '. سجّل يوميًا في أول أسبوعين' : '') }) +
      field('protein_g', 'البروتين المسجّل', 'غ', f, { hint: 'الهدف ' + T.protein_g + ' غ من كل الأكل' }) + '</div>' +
      '<div class="panel" style="margin-top:10px"><div style="font-weight:600;margin-bottom:8px">الجوع اليوم</div>' + scale('hunger', 1, 5, f, 's5') +
      '<div class="scale-ends"><span>1 مرتاح</span><span>5 جوع شديد</span></div>' +
      '<div style="font-weight:600;margin:16px 0 8px">هل كان اليوم على الخطة؟</div><div class="chips">' +
      '<button type="button" class="chip" data-act="pick" data-k="adherent" data-v="true" aria-pressed="' + (f.adherent === true) + '">نعم</button>' +
      '<button type="button" class="chip" data-act="pick" data-k="adherent" data-v="false" aria-pressed="' + (f.adherent === false) + '">لا</button></div></div></section>';

    // movement
    var wt = L.waterTarget(P, d), wv = L.parseNum(f.water_l) || 0, st = L.stepsTarget(P, n), c = L.cardioFor(P, n);
    var isCardio = L.isCardioDay(P, d);
    var move = '<section class="block"><h2>الحركة والسوائل</h2>' +
      '<div class="panel"><div class="q" style="font-weight:600">السوائل <span class="muted small">الهدف ' + trimNum(wt, 1) + ' لتر' + (training ? ' (يوم تمرين)' : '') + '</span></div>' +
      '<div class="stepper" style="margin-top:8px"><button type="button" data-act="water" data-n="-0.5" aria-label="ناقص نصف لتر">−</button>' +
      '<div class="field" style="flex:1" data-wrap="water_l"><div class="val"><input data-f="water_l" id="f-water_l" type="text" inputmode="decimal" autocomplete="off" value="' + esc(f.water_l) + '" placeholder="0" aria-label="السوائل باللتر"><span class="unit">لتر</span></div></div>' +
      '<button type="button" data-act="water" data-n="0.5" aria-label="زائد نصف لتر">+</button></div>' +
      '<div class="bar"><i id="waterbar" style="--w:' + Math.min(100, Math.round(wv / wt * 100)) + '%"></i></div>' +
      '<p class="hint" style="margin-top:10px">لتر قبل 9:00، ولتر قبل 1:00 ظهرًا، ولتر قبل 7:00 مساءً. القهوة والغازيات الدايت تُحسب.</p></div>' +
      '<div class="grid2" style="margin-top:10px">' +
      field('steps', 'الخطوات', '', f, { span: true, hint: 'هدف الأسبوع ' + n + ': ' + st.label + ' يوميًا' }) +
      field('cardio_min', isCardio ? 'الكارديو (الهدف ' + c.min + ' د)' : 'كارديو إضافي', 'دقيقة', f, { span: true, hint: isCardio ? P.cardio.intensity : (training && c.after_upper && P.sessions[L.sessionKeyFor(P, d)] && P.sessions[L.sessionKeyFor(P, d)].upper ? c.after_upper : 'اختياري في أيام المقاومة، وبعد الحصة لا قبلها') }) +
      '</div><div class="chips" style="margin-top:10px">' + P.cardio.modes.map(function (m) {
        return '<button type="button" class="chip" data-act="pick" data-k="cardio_mode" data-v="' + esc(m) + '" aria-pressed="' + (f.cardio_mode === m) + '">' + esc(m) + '</button>';
      }).join('') + '</div>';
    if (ev.indexOf('test') >= 0 || f.test_hr) {
      move += '<div class="grid2" style="margin-top:10px">' + field('test_hr', 'اختبار اللياقة: متوسط النبض آخر 3 دقائق', 'ن/د', f, { span: true, hint: P.fitness_test.protocol }) + '</div>';
    }
    move += '</section>';

    // supplements and notes
    var supp = '<section class="block"><h2>المكملات</h2><div class="panel">' + P.supplements.filter(function (s) { return s.track; }).map(function (s) {
      return toggleRow(s.key, s.name, s.dose, f);
    }).join('') + '</div></section>';
    var notes = '<section class="block"><h2>ملاحظات</h2>' +
      (ev.indexOf('photos') >= 0 || f.photos_done ? '<div class="panel" style="margin-bottom:10px">' + toggleRow('photos_done', 'التقطت صور التقدم', P.measure.photos, f) + '</div>' : '') +
      '<textarea data-f="notes" id="f-notes" maxlength="2000" placeholder="أي شيء يفسّر رقم اليوم: سهر، مناسبة، ملح عالٍ، ألم…" aria-label="ملاحظات اليوم">' + esc(f.notes) + '</textarea></section>';

    return topbar() + heroToday() + eventsBlock() + morning + food + move + supp + notes;
  }

  function painCls(v) { return v >= 5 ? 'stop' : (v >= 3 ? 'low' : 'up'); }

  // ---------------------------------------------------------------- WORKOUT
  var SESSION_ORDER = ['upper', 'lower', 'push', 'pull', 'legs'];
  function sessKey(d, key) { return d + '|' + key; }
  function setKey(d, key, ex, n) { return d + '|' + key + '|' + ex + '|' + n; }
  function committedSets(d, key, exKey) {
    var prefix = d + '|' + key + '|' + exKey + '|';
    return Object.keys(S.data.sets).filter(function (k) { return k.indexOf(prefix) === 0; })
      .map(function (k) { return S.data.sets[k]; }).sort(function (a, b) { return a.set_no - b.set_no; });
  }
  function variantFor(d, key, exKey) {
    var vk = sessKey(d, key) + '|' + exKey;
    if (S.variants[vk]) return S.variants[vk];
    var c = committedSets(d, key, exKey);
    return c.length ? (c[0].variant || 'main') : 'main';
  }
  function currentWKey() {
    if (S.wKey && S.wKey.d === S.date) return S.wKey.k;
    var sk = L.sessionKeyFor(S.plan, S.date);
    return sk !== 'rest' ? sk : null;
  }

  function viewWorkout() {
    var P = S.plan, d = S.date, n = Math.max(1, L.weekNo(P, d)), key = currentWKey();
    var scheduled = L.sessionKeyFor(P, d);
    var wr = L.weekRange(P, n), doneMap = sessionsInRange(wr.from, wr.to);
    var seg = '<div class="seg" role="tablist">' + SESSION_ORDER.map(function (k) {
      return '<button type="button" class="chip' + (k === scheduled ? ' today' : '') + '" data-act="wsess" data-k="' + k + '" aria-pressed="' + (k === key) + '">' + esc(P.sessions[k].name) + (doneMap[k] ? ' ✓' : '') + '</button>';
    }).join('') + '</div>';
    var head = topbar();
    if (!key) {
      return head + '<section class="hero"><p class="kicker">' + esc(L.dayLabel(d)) + '</p><h1>يوم راحة</h1><p class="sub">لا حصة مقاومة اليوم. إن فاتتك حصة، اخترها هنا لتسجيلها.</p></section>' + seg +
        missedFold();
    }
    var sess = P.sessions[key], sk = sessKey(d, key), srow = S.data.sessions[sk] || null;
    var rirLine = n <= 1 ? 'الأسبوع 1: اترك في الخزان ' + P.rir.w1 + ' تكرارات (RIR ' + P.rir.w1 + ').'
      : (n === 2 ? 'الأسبوع 2: RIR ' + P.rir.w2 + '.' : 'المركّبة RIR ' + P.rir.compound + '، والعزل RIR ' + P.rir.isolation + '. ' + P.rir.note);
    var timer = '';
    if (srow && srow.started_at) {
      timer = '<div class="timerline"><div><div class="muted small">' + (srow.finished_at ? 'مدة الحصة' : 'منذ بداية الحصة') + '</div><div class="el num" id="elapsed">' +
        mmss(((srow.finished_at ? Date.parse(srow.finished_at) : Date.now()) - Date.parse(srow.started_at)) / 1000) + '</div></div>' +
        (srow.finished_at ? '<span class="tag rir">انتهت الحصة</span>' : '<button type="button" class="btn btn-ghost sm" data-act="finish" style="width:auto">إنهاء الحصة</button>') + '</div>';
    }
    var warm = '<details class="fold"><summary>الإحماء</summary><div class="body"><ul>' + P.warmup.filter(function (w) { return !w.upper_only || sess.upper; }).map(function (w) { return '<li>' + esc(w.text) + '</li>'; }).join('') + '</ul></div></details>';
    var exHtml = sess.exercises.map(function (ex, i) { return exerciseCard(ex, i, sess, key, d, n); }).join('');
    var end = '<section class="block"><h2>نهاية الحصة</h2><div class="panel">';
    if (sess.upper) {
      var pv = srow ? nz(srow.shoulder_pain) : null;
      if (S.sessPain && S.sessPain[sk] !== undefined) pv = S.sessPain[sk];
      end += '<div style="font-weight:600;margin-bottom:8px">ألم الكتف الأيسر أثناء الحصة</div>' +
        scale('sess_pain', 0, 10, { sess_pain: pv }, 's11', function (v) { return v >= 5 ? 'stop' : (v >= 3 ? 'warn' : ''); }) +
        (pv !== null && pv !== undefined ? '<p class="hint ' + painCls(pv) + '">' + esc(L.painLevel(P, pv).text) + '</p>' : '<p class="hint">' + esc(P.shoulder.excluded) + '</p>');
    }
    var noteVal = S.sessNotes && S.sessNotes[sk] !== undefined ? S.sessNotes[sk] : (srow && srow.notes) || '';
    end += '<textarea data-snote="' + esc(sk) + '" style="margin-top:12px" maxlength="2000" placeholder="ملاحظة على الحصة: جهاز مختلف، تعب، ألم…" aria-label="ملاحظات الحصة">' + esc(noteVal) + '</textarea>' +
      '<button type="button" class="btn btn-primary" style="margin-top:12px" data-act="finish">' + (srow && srow.finished_at ? 'حفظ ملاحظات الحصة' : 'إنهاء الحصة وحفظها') + '</button></div></section>' + missedFold();
    return head + '<section class="hero"><p class="kicker">الأسبوع ' + n + '، ' + esc(sess.day) + (sess.duration ? '، ' + esc(sess.duration) : '') + '</p><h1>' + esc(sess.name) + '</h1>' +
      '<p class="sub">' + esc(rirLine) + '</p></section>' + seg + timer +
      (sess.note ? '<p class="hint">' + esc(sess.note) + '</p>' : '') + warm + exHtml + end;
  }

  function missedFold() {
    var P = S.plan;
    return '<details class="fold"><summary>الحصة الفائتة وأسبوع التخفيف</summary><div class="body"><ul>' +
      P.missed.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '<li>' + esc(P.deload) + '</li></ul></div></details>';
  }

  function setLine(sets) {
    return sets.filter(function (s) { return L.parseNum(s.reps) !== null; }).map(function (s) {
      var w = L.parseNum(s.weight_kg);
      return '<b class="ltr">' + (w !== null ? trimNum(w) + '×' : '') + s.reps + '</b>';
    }).join('، ');
  }

  function exerciseCard(ex, idx, sess, key, d, n) {
    var P = S.plan, planned = L.setsFor(ex, n), variant = variantFor(d, key, ex.key);
    var committed = committedSets(d, key, ex.key);
    var lp = L.lastPerformance(S.data.sets, ex.key, d, variant);
    var hint = L.progressionHint(ex, lp);
    var lo = ex.reps[0], hi = ex.reps[1], per = ex.per ? ' ' + ex.per : '';
    var rir = L.rirFor(P, ex, n);
    var ek = sessKey(d, key) + '|' + ex.key;
    var rows = Math.max(planned, committed.length ? committed[committed.length - 1].set_no : 0, planned + (S.extraRows[ek] || 0));
    var tags = '<div class="tags"><span class="tag">' + (planned || '—') + ' × ' + lo + '–' + hi + esc(per) + '</span><span class="tag">راحة ' + esc(ex.rest) + '</span>' +
      '<span class="tag rir">RIR ' + esc(rir) + '</span>' +
      (ex.alt ? '<button type="button" class="tag" data-act="variant" data-ex="' + ex.key + '" aria-pressed="' + (variant === 'alt') + '">البديل</button>' : '') +
      (n <= 1 && ex.shoulder_test ? '<span class="tag warn">اختبار الكتف بوزن خفيف</span>' : '') + '</div>';
    var title = variant === 'alt' ? ex.alt : ex.ar;
    var sub = variant === 'alt' ? 'بديل عن ' + ex.ar : ex.en;
    var lastLine = lp ? '<p class="last">آخر مرة (' + esc(L.shortDate(lp.date)) + '): ' + setLine(lp.sets) + '</p>' : '';
    var hintHtml;
    if (hint.kind === 'first') hintHtml = '<p class="hint">أول مرة: اختر وزنًا يترك في خزانك 3–4 تكرارات. بعد المجموعة الأولى: زِد 5–10% إن بقي أكثر بتكرارين، وانقص 10% إن لم تبلغ ' + lo + '.</p>';
    else if (hint.kind === 'increase') hintHtml = '<p class="hint up">بلغت ' + hi + ' في كل المجموعات: زِد أصغر خطوة اليوم' + (hint.weight !== null ? ' فوق ' + trimNum(hint.weight) + ' كغ' : '') + '، وابدأ من ' + lo + '.</p>';
    else if (hint.kind === 'low') hintHtml = '<p class="hint low">مجموعة تحت ' + lo + ': ابقَ على ' + (hint.weight !== null ? trimNum(hint.weight) + ' كغ' : 'الوزن نفسه') + '، وإن تكرر فخفّف 5–10%.</p>';
    else hintHtml = '<p class="hint">ابقَ على ' + (hint.weight !== null ? trimNum(hint.weight) + ' كغ' : 'الوزن نفسه') + ' وزِد التكرارات حتى ' + hi + ' في كل المجموعات.</p>';
    var ramp = L.warmupFor(P, sess, idx, hint.weight);
    var rampHtml = ramp ? '<p class="hint">إحماء قبلها: ' + ramp.map(function (r) { return (r.weight !== null ? trimNum(r.weight) + ' كغ' : Math.round(r.pct * 100) + '%') + ' × ' + r.reps; }).join('، ثم ') + '.</p>' : '';
    var extra = (n >= 6 && ex.week6_extra) ? '<p class="hint">من الأسبوع 6: مجموعة إضافية اختيارية إذا كان التعافي جيدًا.</p>' : '';
    var setsHtml = '';
    if (rows > 0) {
      setsHtml = '<div class="sets"><div class="sethead"><span>#</span><span>الوزن (كغ)</span><span>تكرار</span><span>RIR</span><span></span></div>';
      for (var s = 1; s <= rows; s++) setsHtml += setRow(ex, key, d, s, lp, rir, variant);
      setsHtml += '</div>';
    } else {
      setsHtml = '<p class="hint">يبدأ من الأسبوع 2.</p>';
    }
    var btns = '<div class="setbtns"><button type="button" class="btn btn-quiet sm" data-act="addset" data-ex="' + ex.key + '">+ مجموعة</button>' +
      (rows > planned ? '<button type="button" class="btn btn-quiet sm" data-act="delset" data-ex="' + ex.key + '" data-n="' + rows + '">حذف الأخيرة</button>' : '') + '</div>';
    var cue = ex.cue ? '<details class="fold"><summary>طريقة الأداء</summary><div class="body">' + esc(P.cues[ex.cue]) +
      ((P.cue_links && P.cue_links[ex.cue]) ? '<br>' + P.cue_links[ex.cue].map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'; }).join(' و') : '') + '</div></details>' : '';
    return '<article class="ex" id="ex-' + esc(ex.key.replace('.', '-')) + '"><div class="hd"><div><h3>' + esc(title) + '</h3><span class="en">' + esc(sub) + '</span></div><span class="ord">' + (idx + 1) + '</span></div>' +
      tags + lastLine + hintHtml + rampHtml + extra + setsHtml + btns + cue + '</article>';
  }

  function setRow(ex, key, d, s, lp, rir, variant) {
    var k = setKey(d, key, ex.key, s), row = S.data.sets[k], dr = S.setDrafts[k] || {};
    var lastSet = lp ? lp.sets.filter(function (x) { return x.set_no === s; })[0] || lp.sets[lp.sets.length - 1] : null;
    var wv = dr.w !== undefined ? dr.w : (row ? str(row.weight_kg) : '');
    var rv = dr.r !== undefined ? dr.r : (row ? str(row.reps) : '');
    var iv = dr.i !== undefined ? dr.i : (row ? str(row.rir) : '');
    var done = !!row, dirty = done && (dr.w !== undefined || dr.r !== undefined || dr.i !== undefined);
    var wph = lastSet && L.parseNum(lastSet.weight_kg) !== null ? trimNum(L.parseNum(lastSet.weight_kg)) : (ex.bodyweight ? 'وزن الجسم' : '');
    var rph = lastSet && lastSet.reps !== null && lastSet.reps !== undefined ? String(lastSet.reps) : String(ex.reps[0]) + '–' + ex.reps[1];
    return '<div class="set' + (done ? ' done' : '') + (dirty ? ' dirty' : '') + '" data-row="' + esc(k) + '">' +
      '<span class="n">' + s + '</span>' +
      '<input type="text" inputmode="decimal" autocomplete="off" aria-label="الوزن للمجموعة ' + s + '" data-sf="w" data-k="' + esc(k) + '" value="' + esc(wv) + '" placeholder="' + esc(wph) + '">' +
      '<input type="text" inputmode="numeric" autocomplete="off" aria-label="التكرارات للمجموعة ' + s + '" data-sf="r" data-k="' + esc(k) + '" value="' + esc(rv) + '" placeholder="' + esc(rph) + '">' +
      '<input type="text" inputmode="numeric" autocomplete="off" aria-label="RIR للمجموعة ' + s + '" data-sf="i" data-k="' + esc(k) + '" value="' + esc(iv) + '" placeholder="' + esc(firstNum(rir)) + '">' +
      '<button type="button" class="ok" data-act="commit" data-k="' + esc(k) + '" data-ex="' + ex.key + '" data-n="' + s + '" aria-label="' + (done ? 'تحديث المجموعة ' : 'تسجيل المجموعة ') + s + '">' + I.check + '</button></div>';
  }

  function ensureSession(d, key) {
    var sk = sessKey(d, key), row = S.data.sessions[sk];
    if (row && row.started_at) return row;
    var r = { session_date: d, session_key: key, week_no: L.weekNo(S.plan, d), started_at: new Date().toISOString() };
    write('workout_sessions', r);
    requestWake();
    return S.data.sessions[sk];
  }

  function commitSet(btn) {
    var P = S.plan, d = S.date, key = currentWKey(), exKey = btn.getAttribute('data-ex'), s = +btn.getAttribute('data-n');
    var k = setKey(d, key, exKey, s), row = btn.closest('.set');
    var inputs = row.querySelectorAll('input');
    var wRaw = inputs[0].value, rRaw = inputs[1].value, iRaw = inputs[2].value;
    var ex = P.sessions[key].exercises.filter(function (e) { return e.key === exKey; })[0];
    var reps = L.parseNum(rRaw, { int: true });
    if (reps === null || reps < 0 || reps > 100) { inputs[1].focus(); toast('أدخل عدد التكرارات أولًا.', true); return; }
    var w = L.parseNum(wRaw);
    if (w === null && wRaw.trim() === '' && inputs[0].placeholder && L.parseNum(inputs[0].placeholder) !== null) w = L.parseNum(inputs[0].placeholder);
    if (w !== null && (w < 0 || w > 1000)) { inputs[0].focus(); toast('وزن غير منطقي.', true); return; }
    var rir = L.parseNum(iRaw, { int: true });
    if (rir !== null && (rir < 0 || rir > 10)) { inputs[2].focus(); toast('RIR بين 0 و10.', true); return; }
    var wasDone = !!S.data.sets[k];
    var rowsInCard = row.parentNode ? row.parentNode.querySelectorAll('.set').length : 0;
    ensureSession(d, key);
    write('workout_sets', {
      session_date: d, session_key: key, exercise_key: exKey, set_no: s,
      variant: variantFor(d, key, exKey), weight_kg: w === null ? null : L.round(w, 2), reps: reps, rir: rir, done: true
    });
    delete S.setDrafts[k];
    store(K.sets, S.setDrafts);
    render(true);
    if (!wasDone) {
      var sess = P.sessions[key], lastEx = sess.exercises[sess.exercises.length - 1].key === exKey;
      if (!(lastEx && s >= rowsInCard)) startRest(ex.rest_s, ex.ar + '، بعد المجموعة ' + s);
    } else {
      toast('عُدّلت المجموعة ' + s + '.');
    }
  }

  function finishSession() {
    var d = S.date, key = currentWKey(); if (!key) return;
    var sk = sessKey(d, key), row = S.data.sessions[sk] || { session_date: d, session_key: key, week_no: L.weekNo(S.plan, d), started_at: null };
    var upd = { session_date: d, session_key: key, week_no: row.week_no || L.weekNo(S.plan, d), started_at: row.started_at || null };
    upd.finished_at = row.finished_at || new Date().toISOString();
    if (S.sessPain && S.sessPain[sk] !== undefined) upd.shoulder_pain = S.sessPain[sk];
    else if (row.shoulder_pain !== undefined) upd.shoulder_pain = row.shoulder_pain;
    var note = S.sessNotes && S.sessNotes[sk] !== undefined ? S.sessNotes[sk] : row.notes;
    upd.notes = note ? String(note).trim().slice(0, 2000) : null;
    awaitSave('workout_sessions', sk, 'حُفظت حصة ' + S.plan.sessions[key].name + ' في Supabase');
    write('workout_sessions', upd);
    if (S.sessNotes) delete S.sessNotes[sk];
    if (S.sessPain) delete S.sessPain[sk];
    stopRest(); releaseWake();
    render(true);
  }

  // ---------------------------------------------------------------- rest timer, sound, wake lock
  var REST = { end: 0, total: 0, label: '', iv: null, fired: false };
  var audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ignore */ }
  }
  function beep(times) {
    if (prefs.sound === false || !audioCtx) return;
    try {
      for (var i = 0; i < times; i++) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * 0.32;
        o.type = 'square'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + 0.24);
      }
    } catch (e) { /* ignore */ }
  }
  function buzz() { if (prefs.vibrate !== false && navigator.vibrate) { try { navigator.vibrate([250, 120, 250, 120, 450]); } catch (e) { /* ignore */ } } }
  function startRest(sec, label) {
    unlockAudio();
    REST.total = sec; REST.end = Date.now() + sec * 1000; REST.label = label; REST.fired = false;
    clearInterval(REST.iv); REST.iv = setInterval(tickRest, 250);
    tickRest();
  }
  function stopRest() { clearInterval(REST.iv); REST.iv = null; $rest.hidden = true; }
  function tickRest() {
    var left = (REST.end - Date.now()) / 1000;
    if (left <= 0 && !REST.fired) { REST.fired = true; beep(3); buzz(); }
    if (left < -90) { stopRest(); return; }
    $rest.hidden = false;
    $rest.className = left <= 0 ? 'done' : '';
    $rest.innerHTML = '<div class="lbl"><b>' + (left <= 0 ? 'انتهت الراحة' : 'راحة') + '</b>' + esc(REST.label) + '</div>' +
      '<div class="t">' + (left <= 0 ? '0:00' : mmss(Math.ceil(left))) + '</div>' +
      (left > 0 ? '<button type="button" data-act="rest" data-n="-15" aria-label="أنقص 15 ثانية">−15</button><button type="button" data-act="rest" data-n="15" aria-label="زِد 15 ثانية">+15</button>' : '') +
      '<button type="button" data-act="rest-stop">' + (left <= 0 ? 'إغلاق' : 'تخطٍّ') + '</button>';
  }
  var wakeLock = null;
  function requestWake() {
    if (prefs.wake === false || !('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }).catch(function () { /* ignore */ });
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }

  // ---------------------------------------------------------------- PROGRESS
  function viewProgress() {
    var P = S.plan, t = today(), n = Math.max(1, Math.min(P.weeks, L.weekNo(P, t)));
    var stats = L.allWeekStats(P, S.data.logs, t);
    var cur = stats[n - 1] || null, prev = stats[n - 2] || null;
    var latest = null;
    Object.keys(S.data.logs).sort().forEach(function (k) { var w = L.parseNum(S.data.logs[k].weight_kg); if (w !== null) latest = { d: k, w: w }; });
    var big = cur && cur.weightAvg !== null ? cur.weightAvg : (latest ? latest.w : null);
    var delta = cur && prev && cur.weightAvg !== null && prev.weightAvg !== null ? cur.weightAvg - prev.weightAvg : null;
    var fromStart = big !== null ? big - P.goal.weight_start : null;
    var hero = '<section class="hero"><p class="kicker">' + (cur && cur.weightAvg !== null ? 'متوسط الأسبوع ' + n + ' (' + count(cur.weightN, 'قراءة واحدة', 'قراءتان', 'قراءات', 'قراءة') + ')' : (latest ? 'آخر وزن (' + L.shortDate(latest.d) + ')' : 'لا توجد أوزان بعد')) + '</p>' +
      '<div class="stat"><span class="big">' + (big !== null ? trimNum(big, 2) : '—') + '</span><span class="u">كغ</span>' +
      (delta !== null ? '<span class="delta ' + (delta <= 0 ? 'good' : 'bad') + '">' + (delta > 0 ? '+' : '−') + trimNum(Math.abs(delta), 2) + ' عن الأسبوع السابق</span>' : '') + '</div>' +
      '<p class="sub">البداية ' + trimNum(P.goal.weight_start, 2) + ' كغ' + (fromStart !== null ? '، والتغير ' + (fromStart > 0 ? '+' : '−') + trimNum(Math.abs(fromStart), 2) + ' كغ' : '') + '. الهدف ' + P.goal.weight_target[0] + '–' + P.goal.weight_target[1] + ' كغ في ' + L.shortDate(P.end) + '.</p></section>';
    var chart = '<section class="block"><h2>الوزن <small>يوميًا ومتوسط الأسبوع</small></h2>' + weightChart(stats) +
      '<div class="legend"><span><i></i>متوسط الأسبوع</span><span><i class="dot"></i>قراءة يومية</span><span><i class="dash"></i>المسار المخطط</span><span><i class="band"></i>نطاق الهدف</span></div></section>';
    var dec = L.decide(P, S.data.logs, t), decHtml;
    if (!dec.ready) {
      decHtml = '<div class="decision"><h3>جدول القرار</h3><p class="muted" style="margin:0">' +
        (dec.reason === 'early' ? 'الحكم يبدأ بعد اكتمال الأسبوع 3، وأول مراجعة ' + L.dayLabel(P.dates.reviews[0]) + '. حتى ذلك الحين: الأرقام كما هي.' : 'يحتاج 3 أوزان على الأقل في كل أسبوع من الأسبوعين المقارنين.') + '</p></div>';
    } else {
      var adhTxt = dec.adherence === null ? '—' : Math.round(dec.adherence * 100) + '% (' + dec.adherenceDays + ' من 14 يومًا)';
      decHtml = '<div class="decision"><h3>اقتراح القواعد للأسابيع ' + dec.rateWeeks[0] + '–' + dec.rateWeeks[1] + '</h3>' +
        '<p class="muted" style="margin:0">' + esc(dec.when) + '</p><p class="act">' + esc(dec.action) + '</p>' +
        '<dl class="kv"><dt>النزول الأسبوعي</dt><dd>' + trimNum(dec.rate, 2) + ' كغ</dd><dt>الالتزام المسجّل</dt><dd>' + adhTxt + '</dd>' +
        '<dt>تغير الخصر</dt><dd class="ltr">' + (dec.waistChange === null ? '—' : signed(dec.waistChange, 1) + ' سم') + '</dd>' +
        '<dt>متوسط الجوع</dt><dd>' + (dec.hunger === null ? '—' : trimNum(dec.hunger, 1) + ' من 5') + '</dd>' +
        '<dt>متوسط النوم</dt><dd>' + (dec.sleep === null ? '—' : trimNum(dec.sleep, 1) + ' ساعة') + '</dd>' +
        (dec.maintenance ? '<dt>المحافظة التقديرية</dt><dd>' + Math.round(dec.maintenance).toLocaleString('en-US') + ' سعرة</dd>' : '') + '</dl>' +
        '<p class="hint">اقتراح من جدول القرار في الخطة بشرط التزام 85% أو أكثر. التعديل الفعلي في يوم المراجعة، بخطوات 100–200 سعرة.</p></div>';
    }
    var rows = stats.map(function (w, i) {
      var p = stats[i - 1], ch = p && w.weightAvg !== null && p.weightAvg !== null ? w.weightAvg - p.weightAvg : null;
      var sess = sessionsInRange(w.from, w.to);
      return '<tr' + (w.n === n ? ' class="cur"' : '') + '><td>' + w.n + '</td><td>' + (w.weightAvg === null ? '—' : trimNum(w.weightAvg, 2)) + '</td><td class="ltr">' + signed(ch, 2) + '</td>' +
        '<td>' + (w.waist === null ? '—' : trimNum(w.waist, 1)) + '</td><td>' + (w.steps === null ? '—' : Math.round(w.steps).toLocaleString('en-US')) + '</td>' +
        '<td>' + (w.adherenceN ? w.adherenceYes + '/' + 7 : '—') + '</td><td>' + Object.keys(sess).length + '/5</td></tr>';
    }).join('');
    var table = '<section class="block"><h2>الأسابيع</h2><div class="scroll"><table class="tbl"><thead><tr><th>الأسبوع</th><th>الوزن</th><th>التغير</th><th>الخصر</th><th>الخطوات</th><th>الالتزام</th><th>الحصص</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="t muted">تظهر الأسابيع هنا بعد أول تسجيل.</td></tr>') + '</tbody></table></div></section>';
    return topbar() + hero + chart + '<section class="block"><h2>جدول القرار</h2>' + decHtml + '</section>' + table + liftsBlock() + inbodyBlock() + timelineBlock();
  }

  function weightChart(stats) {
    var P = S.plan, W = 360, H = 210, padL = 34, padR = 10, padT = 12, padB = 26;
    var x0 = P.goal.weight_start_date, x1 = P.end, span = L.daysBetween(x0, x1);
    var pts = Object.keys(S.data.logs).sort().filter(function (k) { return k >= x0 && k <= x1; })
      .map(function (k) { return { d: k, w: L.parseNum(S.data.logs[k].weight_kg) }; }).filter(function (p) { return p.w !== null; });
    var avgs = stats.filter(function (s) { return s.weightAvg !== null; }).map(function (s) { return { d: L.addDays(s.from, 3), w: s.weightAvg }; });
    var tr = L.trajectory(P);
    var ys = pts.map(function (p) { return p.w; }).concat([P.goal.weight_start, P.goal.weight_target[0], P.goal.weight_target[1]]);
    var yMin = Math.floor(Math.min.apply(null, ys) - 0.5), yMax = Math.ceil(Math.max.apply(null, ys) + 0.5);
    // Time runs right to left (RTL): the start is on the right edge.
    function X(d) { return W - padR - (L.daysBetween(x0, d) / span) * (W - padL - padR); }
    function Y(w) { return padT + (yMax - w) / (yMax - yMin) * (H - padT - padB); }
    var g = '<svg class="chart" direction="ltr" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="مخطط الوزن من البداية حتى نهاية الخطة">';
    for (var y = yMin; y <= yMax; y += (yMax - yMin > 10 ? 2 : 1)) {
      g += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(y) + '" y2="' + Y(y) + '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (padL - 6) + '" y="' + (Y(y) + 4) + '" text-anchor="end">' + y + '</text>';
    }
    g += '<rect x="' + padL + '" y="' + Y(P.goal.weight_target[1]) + '" width="' + (W - padL - padR) + '" height="' + (Y(P.goal.weight_target[0]) - Y(P.goal.weight_target[1])) + '" fill="var(--volt-soft)"/>';
    g += '<line x1="' + X(tr.from) + '" y1="' + Y(tr.w0) + '" x2="' + X(tr.to) + '" y2="' + Y(tr.w1) + '" stroke="var(--chalk-2)" stroke-width="1.5" stroke-dasharray="4 3"/>';
    ['2026-11-01', '2026-12-01'].forEach(function (m) {
      if (m > x0 && m < x1) g += '<line x1="' + X(m) + '" x2="' + X(m) + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="var(--line)" stroke-dasharray="2 3"/>';
    });
    [[x0, L.shortDate(x0)], ['2026-11-01', 'نوفمبر'], ['2026-12-01', 'ديسمبر'], [x1, L.shortDate(x1)]].forEach(function (t, i) {
      g += '<text x="' + X(t[0]) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'end' : (i === 3 ? 'start' : 'middle')) + '">' + esc(t[1]) + '</text>';
    });
    var td = today();
    if (td >= x0 && td <= x1) g += '<line x1="' + X(td) + '" x2="' + X(td) + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="var(--chalk-3)" stroke-width="1"/>';
    pts.forEach(function (p) { g += '<circle cx="' + X(p.d).toFixed(1) + '" cy="' + Y(p.w).toFixed(1) + '" r="2.6" fill="var(--chalk-3)"/>'; });
    if (avgs.length > 1) g += '<polyline fill="none" stroke="var(--volt)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + avgs.map(function (a) { return X(a.d).toFixed(1) + ',' + Y(a.w).toFixed(1); }).join(' ') + '"/>';
    avgs.forEach(function (a) { g += '<circle cx="' + X(a.d).toFixed(1) + '" cy="' + Y(a.w).toFixed(1) + '" r="4" fill="var(--volt)"/>'; });
    return g + '</svg>';
  }

  function liftsBlock() {
    var P = S.plan, items = [];
    SESSION_ORDER.forEach(function (k) {
      var ex = P.sessions[k].exercises[0];
      var rows = Object.keys(S.data.sets).map(function (x) { return S.data.sets[x]; }).filter(function (r) { return r.exercise_key === ex.key && (r.variant || 'main') === 'main' && L.parseNum(r.weight_kg) !== null; });
      if (!rows.length) return;
      var dates = rows.map(function (r) { return r.session_date; }).sort();
      function best(d) {
        return rows.filter(function (r) { return r.session_date === d; }).sort(function (a, b) { return (L.parseNum(b.weight_kg) - L.parseNum(a.weight_kg)) || (b.reps - a.reps); })[0];
      }
      var a = best(dates[0]), b = best(dates[dates.length - 1]);
      items.push('<li><span>' + esc(ex.ar) + '</span><span class="v ltr">' + trimNum(L.parseNum(a.weight_kg)) + '×' + a.reps + (dates[0] !== dates[dates.length - 1] ? ' → ' + trimNum(L.parseNum(b.weight_kg)) + '×' + b.reps : '') + '</span></li>');
    });
    var t = today(), wr = L.weekRange(P, Math.max(1, Math.min(P.weeks, L.weekNo(P, t)))), sess = sessionsInRange(wr.from, wr.to);
    var setsWeek = Object.keys(S.data.sets).filter(function (k) { var r = S.data.sets[k]; return r.session_date >= wr.from && r.session_date <= wr.to; }).length;
    return '<section class="block"><h2>القوة <small>هذا الأسبوع: ' + Object.keys(sess).length + ' من 5 حصص، ' + setsWeek + ' مجموعة</small></h2>' +
      (items.length ? '<ul class="lifts">' + items.join('') + '</ul><p class="hint">أول تمرين في كل حصة: أفضل مجموعة في أول حصة ← أفضل مجموعة في آخر حصة. القوة الثابتة أو المتزايدة في العجز هي مؤشر حفظ العضل.</p>'
        : '<p class="muted">تظهر هنا أوزان التمارين الأساسية بعد أول حصة.</p>') + '</section>';
  }

  var MEAS_FIELDS = [
    ['weight_kg', 'الوزن', 'كغ'], ['smm_kg', 'كتلة العضلات الهيكلية', 'كغ'], ['bfm_kg', 'كتلة الدهون', 'كغ'],
    ['pbf', 'نسبة الدهون', '%'], ['ffm_kg', 'الكتلة الخالية من الدهون', 'كغ'], ['tbw_l', 'ماء الجسم', 'لتر'],
    ['visceral_level', 'مستوى الدهون الحشوية', ''], ['bmr_kcal', 'الأيض الأساسي', 'سعرة'], ['inbody_score', 'درجة InBody', '']
  ];
  function inbodyBlock() {
    var list = Object.keys(S.data.meas).sort().reverse().map(function (k) { return S.data.meas[k]; });
    var html = '<section class="block"><h2>InBody <small>' + esc(S.plan.dates.inbody.map(L.shortDate).join('، ')) + '</small></h2>';
    if (list.length) {
      html += '<div class="scroll"><table class="tbl"><thead><tr><th>التاريخ</th><th>الوزن</th><th>العضل</th><th>الدهون %</th><th>الدهون</th><th>الخالية</th></tr></thead><tbody>' +
        list.map(function (m) {
          return '<tr><td class="t">' + esc(L.shortDate(m.measured_on)) + '</td><td>' + trimNum(L.parseNum(m.weight_kg), 1) + '</td><td>' + trimNum(L.parseNum(m.smm_kg), 1) + '</td><td>' + trimNum(L.parseNum(m.pbf), 1) + '</td><td>' + trimNum(L.parseNum(m.bfm_kg), 1) + '</td><td>' + trimNum(L.parseNum(m.ffm_kg), 1) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (S.showInbody) {
      html += '<form id="inbodyform" class="panel" style="margin-top:12px" novalidate><div class="grid2">' +
        '<div class="field span2"><label for="m-date">تاريخ القياس</label><div class="val"><input id="m-date" name="measured_on" type="date" value="' + today() + '" style="font-size:20px"></div></div>' +
        MEAS_FIELDS.map(function (f) {
          return '<div class="field"><label for="m-' + f[0] + '">' + esc(f[1]) + '</label><div class="val"><input id="m-' + f[0] + '" name="' + f[0] + '" type="text" inputmode="decimal" autocomplete="off">' + (f[2] ? '<span class="unit">' + esc(f[2]) + '</span>' : '') + '</div></div>';
        }).join('') +
        '<div class="field span2"><label for="m-device">الجهاز (الموديل)</label><div class="val"><input id="m-device" name="device" type="text" style="font:400 18px var(--body)" placeholder="مثل InBody 270"></div></div>' +
        '</div><div class="row" style="margin-top:12px"><button type="submit" class="btn btn-primary">حفظ القياس</button><button type="button" class="btn btn-ghost" data-act="inbody-cancel">إلغاء</button></div>' +
        '<p class="hint">' + esc(S.plan.measure.inbody) + '</p></form>';
    } else {
      html += '<button type="button" class="btn btn-quiet" style="margin-top:12px" data-act="inbody-new">إضافة قياس InBody</button>';
    }
    return html + '</section>';
  }

  function timelineBlock() {
    var t = today(), ms = L.milestones(S.plan), nextShown = false;
    return '<section class="block"><h2>المواعيد</h2><ul class="timeline">' + ms.map(function (m) {
      var cls = m.date < t ? 'past' : (!nextShown ? (nextShown = true, 'next') : '');
      return '<li class="' + cls + '"><span class="dt">' + esc(L.shortDate(m.date)) + '</span><span>' + esc(m.items.map(function (x) { return x.label; }).join('، ')) + '</span></li>';
    }).join('') + '</ul></section>';
  }

  // ---------------------------------------------------------------- PLAN (markdown reader)
  function inlineMd(s) {
    var out = esc(s);
    out = out.replace(/\[([^\]]+)\]\(&lt;(https?:\/\/[^\s]+?)&gt;\)/g, function (m, t, u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>'; });
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, t, u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>'; });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return out;
  }
  function renderMd(md) {
    var lines = String(md || '').replace(/\r/g, '').split('\n'), html = '', i = 0, secs = [], open = false;
    function cells(l) { return l.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); }
    while (i < lines.length) {
      var l = lines[i];
      if (/^# /.test(l)) { i++; continue; }
      if (/^## /.test(l)) {
        if (open) html += '</section>';
        var id = 'sec-' + (secs.length + 1);
        secs.push({ id: id, t: l.slice(3).trim() });
        html += '<section id="' + id + '"><h2>' + inlineMd(l.slice(3)) + '</h2>';
        open = true; i++; continue;
      }
      if (/^### /.test(l)) { html += '<h3>' + inlineMd(l.slice(4)) + '</h3>'; i++; continue; }
      if (/^\|/.test(l)) {
        var rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        var head = cells(rows[0]), body = rows.slice(2);
        html += '<div class="tw"><table><thead><tr>' + head.map(function (c) { return '<th>' + inlineMd(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + cells(r).map(function (c) { return '<td>' + inlineMd(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
        continue;
      }
      if (/^- /.test(l)) {
        html += '<ul>';
        while (i < lines.length && /^- /.test(lines[i])) {
          var item = lines[i].slice(2);
          html += '<li>' + (/^\[ \] /.test(item) ? '<span class="cb" aria-hidden="true"></span>' + inlineMd(item.slice(4)) : inlineMd(item)) + '</li>';
          i++;
        }
        html += '</ul>'; continue;
      }
      if (/^\d+\. /.test(l)) {
        html += '<ol>';
        while (i < lines.length && /^\d+\. /.test(lines[i])) { html += '<li>' + inlineMd(lines[i].replace(/^\d+\. /, '')) + '</li>'; i++; }
        html += '</ol>'; continue;
      }
      if (l.trim() === '') { i++; continue; }
      html += '<p>' + inlineMd(l) + '</p>'; i++;
    }
    if (open) html += '</section>';
    return { html: html, secs: secs };
  }
  function viewPlan() {
    var P = S.plan, M = S.meta || {}, T = P.targets, n = Math.max(1, L.weekNo(P, today()));
    var r = renderMd(M.doc);
    var chips = [T.kcal.toLocaleString('en-US') + ' سعرة', T.protein_g + ' غ بروتين', T.carbs_g + ' غ كارب', T.fat_g + ' غ دهون', 'ألياف ' + T.fiber_g + ' غ فأكثر', T.water_l + '–' + T.water_l_training + ' لتر', L.stepsTarget(P, n).label + ' خطوة'];
    return '<section class="hero"><p class="kicker">النسخة ' + esc(M.version) + (M.at ? '، ' + esc(L.shortDate(String(M.at).slice(0, 10))) : '') + '</p><h1>' + esc(M.title || P.title) + '</h1>' +
      '<p class="sub">' + esc(P.summary) + '</p>' + (P.status_note ? '<p class="hint">' + esc(P.status_note) + '</p>' : '') +
      (M.note ? '<p class="hint up">آخر تعديل: ' + esc(M.note) + '</p>' : '') +
      '<div class="chips" style="margin-top:14px">' + chips.map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') + '</div></section>' +
      (r.secs.length ? '<nav class="toc" aria-label="أقسام الخطة">' + r.secs.map(function (s) { return '<a href="#' + s.id + '" data-act="toc" data-id="' + s.id + '">' + esc(s.t) + '</a>'; }).join('') + '</nav>' : '') +
      '<div class="md">' + (r.html || '<p class="muted">نص الخطة غير متوفر في هذه النسخة.</p>') + '</div>';
  }

  // ---------------------------------------------------------------- MORE
  function viewMore() {
    var info = syncInfo(), theme = prefs.theme || 'system';
    var failed = S.failed.map(function (f, i) {
      var o = f.op, what = o.table === 'daily_logs' ? 'يوم ' + (o.row || o.match).log_date : (o.table === 'workout_sets' ? 'مجموعة ' + (o.row || o.match).exercise_key : o.table);
      return '<li><div class="k">' + esc(what) + '<small>' + esc(f.error) + '</small></div><div class="row" style="flex:0 0 auto"><button type="button" class="btn btn-quiet sm" data-act="retry-failed" data-i="' + i + '">إعادة</button><button type="button" class="btn btn-danger sm" data-act="drop-failed" data-i="' + i + '">حذف</button></div></li>';
    }).join('');
    return '<section class="hero"><h1>المزيد</h1></section>' +
      '<section class="block"><h2>الحساب</h2><ul class="list"><li><div class="k">' + esc(S.user.email || '') + '<small>' + (S.profile && S.profile.role === 'owner' ? 'مالك: قراءة وكتابة' : 'اطلاع فقط') + '</small></div>' +
      '<button type="button" class="btn btn-ghost sm" data-act="signout">تسجيل الخروج</button></li></ul></section>' +
      '<section class="block"><h2>الحفظ والمزامنة</h2><ul class="list">' +
      '<li><div class="k">الحالة<small>' + esc(info.text) + (S.sync.at ? '، آخر رفع ' + clock(S.sync.at) : '') + (S.sync.msg ? '، ' + esc(S.sync.msg) : '') + '</small></div><button type="button" class="btn btn-quiet sm" data-act="sync-now">رفع الآن</button></li>' +
      '<li><div class="k">تحديث من Supabase<small>' + (S.loadedAt ? 'آخر تحميل ' + clock(S.loadedAt) : 'لم يكتمل التحميل') + '</small></div><button type="button" class="btn btn-quiet sm" data-act="reload-data">تحديث</button></li>' +
      failed + '</ul><p class="note">كل حفظ يُكتب أولًا على هذا الجهاز ثم يُرفع إلى Supabase. لا تظهر «محفوظ» إلا بعد تأكيد الخادم. المشروع المجاني يتوقف إذا لم يُستخدم 7 أيام، ويُعاد تشغيله من لوحة Supabase بزر Restore.</p></section>' +
      '<section class="block"><h2>الإعدادات</h2><div class="panel"><div style="font-weight:600;margin-bottom:8px">المظهر</div><div class="chips">' +
      [['system', 'حسب الجهاز'], ['dark', 'داكن'], ['light', 'فاتح']].map(function (t) { return '<button type="button" class="chip" data-act="theme" data-v="' + t[0] + '" aria-pressed="' + (theme === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div style="margin-top:8px">' +
      prefRow('sound', 'صوت نهاية الراحة', '') + prefRow('vibrate', 'اهتزاز نهاية الراحة', 'غير مدعوم في Safari على iPhone') + prefRow('wake', 'إبقاء الشاشة مضاءة أثناء الحصة', '') +
      '</div><button type="button" class="btn btn-quiet" style="margin-top:8px" data-act="test-alert">جرّب تنبيه الراحة (5 ثوانٍ)</button></div></section>' +
      '<section class="block"><h2>بياناتي</h2><div class="stack"><button type="button" class="btn btn-quiet" data-act="export-json">تنزيل نسخة كاملة (JSON)</button>' +
      '<button type="button" class="btn btn-quiet" data-act="export-csv">تنزيل السجل اليومي (CSV)</button>' +
      '<a class="btn btn-ghost" href="archive/4-week-plan.html">خطة الأسابيع الأربعة السابقة</a></div></section>' +
      '<p class="note">الإصدار ' + APP_VERSION + '، الخطة ' + esc(S.meta ? S.meta.version : '—') + '. التطبيق لا يحفظ أي بيانات شخصية في مستودع GitHub؛ الخطة والسجلات في Supabase خلف تسجيل الدخول.</p>';
  }
  function prefRow(k, title, sub) {
    return '<div class="qline"><div class="q">' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div><button type="button" class="tog" data-act="pref" data-k="' + k + '" aria-pressed="' + (prefs[k] !== false) + '" aria-label="' + esc(title) + '"></button></div>';
  }

  // ---------------------------------------------------------------- screens without tabs
  function renderLoading() {
    hideChrome();
    $app.innerHTML = '<div class="center"><p class="brand">خطة اللياقة</p><p class="brand-sub">جارٍ تحميل خطتك من Supabase…</p><div class="skeleton"></div><div class="skeleton" style="width:70%"></div></div>';
  }
  function renderLogin(msg) {
    hideChrome(); stopRest();
    S.ready = false;
    $app.innerHTML = '<div class="center"><p class="brand">خطة اللياقة</p><p class="brand-sub">سجّل الدخول بحسابك.</p>' +
      '<form id="login" class="stack" novalidate>' +
      '<div class="field"><label for="em">البريد</label><div class="val"><input id="em" name="email" type="email" autocomplete="username" inputmode="email" dir="ltr" style="font:400 19px var(--body)" required></div></div>' +
      '<div class="field"><label for="pw">كلمة المرور</label><div class="val"><input id="pw" name="password" type="password" autocomplete="current-password" dir="ltr" style="font:400 19px var(--body)" required></div></div>' +
      '<p class="formerr" id="loginerr" role="alert">' + esc(msg || '') + '</p>' +
      '<button class="btn btn-primary" type="submit">تسجيل الدخول</button></form>' +
      '<p class="note">لا يوجد إنشاء حساب من هنا. الحساب يُنشأ من لوحة Supabase، وأي حساب جديد يبدأ بلا صلاحية حتى يفعّله المالك.</p></div>';
  }
  function renderInactive() {
    hideChrome();
    $app.innerHTML = '<div class="center"><p class="brand">الحساب غير مفعّل</p><p class="brand-sub">دخلت بنجاح، لكن هذا الحساب لم يُمنح صلاحية بعد. التفعيل يتم من لوحة Supabase: جدول profiles، الحقل active = true والدور owner.</p>' +
      '<div class="stack"><button type="button" class="btn btn-primary" data-act="reload-data">تحقق مجددًا</button><button type="button" class="btn btn-ghost" data-act="signout">تسجيل الخروج</button></div></div>';
  }
  function renderFatal(title, msg, canRetry) {
    hideChrome();
    $app.innerHTML = '<div class="center"><p class="brand">' + esc(title) + '</p><p class="brand-sub" style="white-space:pre-line">' + esc(msg) + '</p>' +
      (canRetry ? '<button type="button" class="btn btn-primary" data-act="reload-page">إعادة المحاولة</button>' : '') + '</div>';
  }

  // ---------------------------------------------------------------- toast
  var toastTimer = null;
  function toast(msg, bad) {
    $toast.textContent = msg;
    $toast.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.className = bad ? 'bad' : ''; }, bad ? 4200 : 2600);
  }

  // ---------------------------------------------------------------- export
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportCsv() {
    var cols = ['log_date', 'weight_kg', 'waist_cm', 'sleep_h', 'resting_hr', 'water_l', 'steps', 'kcal', 'protein_g', 'hunger', 'adherent', 'creatine', 'cardio_min', 'cardio_mode', 'test_hr', 'shoulder_pain', 'notes'];
    var lines = [cols.join(',')];
    Object.keys(S.data.logs).sort().forEach(function (k) {
      var r = S.data.logs[k];
      lines.push(cols.map(function (c) { var v = r[c]; if (v === null || v === undefined) return ''; v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','));
    });
    download('fitness-daily-' + today() + '.csv', '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  // ---------------------------------------------------------------- events
  function gotoView(v) {
    S.view = v;
    if (v === 'workout') S.wKey = null;
    render(false);
  }
  var ACT = {
    tab: function (el) { gotoView(el.getAttribute('data-v')); },
    day: function (el) { S.date = L.addDays(S.date, +el.getAttribute('data-n')); S.errs = {}; render(true); },
    'day-today': function () { S.date = today(); S.errs = {}; render(true); },
    goto: function (el) { S.date = el.getAttribute('data-d'); S.errs = {}; render(true); },
    sync: function () { if (S.failed.length) gotoView('more'); else { flush(); toast(syncInfo().text + (S.sync.at ? '، آخر رفع ' + clock(S.sync.at) : '')); } },
    'save-day': function () { saveDay(); },
    'open-workout': function () { S.view = 'workout'; S.wKey = null; render(false); },
    pick: function (el) {
      var k = el.getAttribute('data-k'), raw = el.getAttribute('data-v'), v;
      if (raw === 'true') v = true; else if (raw === 'false') v = false; else if (/^\d+$/.test(raw)) v = +raw; else v = raw;
      if (k === 'sess_pain') {
        var sk = sessKey(S.date, currentWKey());
        S.sessPain = S.sessPain || {};
        var curP = S.sessPain[sk] !== undefined ? S.sessPain[sk] : (S.data.sessions[sk] ? S.data.sessions[sk].shoulder_pain : null);
        S.sessPain[sk] = curP === v ? null : v;
        render(true); return;
      }
      var f = formFor(S.date);
      setDraft(S.date, k, f[k] === v ? null : v);
      render(true);
    },
    bool: function (el) { var k = el.getAttribute('data-k'), f = formFor(S.date); setDraft(S.date, k, !f[k]); render(true); },
    water: function (el) {
      var f = formFor(S.date), v = (L.parseNum(f.water_l) || 0) + parseFloat(el.getAttribute('data-n'));
      setDraft(S.date, 'water_l', String(Math.max(0, L.round(v, 2))));
      render(true);
    },
    wsess: function (el) { S.wKey = { d: S.date, k: el.getAttribute('data-k') }; render(false); },
    variant: function (el) {
      var key = currentWKey(), exKey = el.getAttribute('data-ex'), vk = sessKey(S.date, key) + '|' + exKey;
      var cur = variantFor(S.date, key, exKey), next = cur === 'alt' ? 'main' : 'alt';
      S.variants[vk] = next;
      committedSets(S.date, key, exKey).forEach(function (r) { var c = Object.assign({}, r, { variant: next }); delete c.user_id; write('workout_sets', c); });
      render(true);
    },
    commit: function (el) { commitSet(el); },
    addset: function (el) { var ek = sessKey(S.date, currentWKey()) + '|' + el.getAttribute('data-ex'); S.extraRows[ek] = (S.extraRows[ek] || 0) + 1; render(true); },
    delset: function (el) {
      var key = currentWKey(), exKey = el.getAttribute('data-ex'), n = +el.getAttribute('data-n'), ek = sessKey(S.date, key) + '|' + exKey;
      var k = setKey(S.date, key, exKey, n);
      if (S.data.sets[k]) remove('workout_sets', { session_date: S.date, session_key: key, exercise_key: exKey, set_no: n });
      delete S.setDrafts[k]; store(K.sets, S.setDrafts);
      S.extraRows[ek] = Math.max(0, (S.extraRows[ek] || 0) - 1);
      render(true);
    },
    finish: function () { finishSession(); },
    rest: function (el) { REST.end += (+el.getAttribute('data-n')) * 1000; tickRest(); },
    'rest-stop': function () { stopRest(); },
    'inbody-new': function () { S.showInbody = true; render(true); },
    'inbody-cancel': function () { S.showInbody = false; render(true); },
    theme: function (el) { prefs.theme = el.getAttribute('data-v'); store(K.prefs, prefs); applyTheme(); render(true); },
    pref: function (el) { var k = el.getAttribute('data-k'); prefs[k] = prefs[k] === false; store(K.prefs, prefs); if (k === 'wake' && prefs.wake === false) releaseWake(); render(true); },
    'test-alert': function () { startRest(5, 'تجربة التنبيه'); },
    'export-json': function () { download('fitness-backup-' + today() + '.json', JSON.stringify({ exported_at: new Date().toISOString(), plan_version: S.meta && S.meta.version, data: S.data }, null, 1), 'application/json'); },
    'export-csv': function () { exportCsv(); },
    'sync-now': function () { flush(); },
    'reload-data': function () { refresh(); },
    'reload-page': function () { location.reload(); },
    'retry-failed': function (el) { var f = S.failed.splice(+el.getAttribute('data-i'), 1)[0]; store(K.failed, S.failed); if (f) { delete f.op._fkRetried; delete f.op._authRetried; S.queue.push(f.op); store(K.queue, S.queue); flush(); } render(true); },
    'drop-failed': function (el) { S.failed.splice(+el.getAttribute('data-i'), 1); store(K.failed, S.failed); renderStatus(); render(true); },
    signout: function () {
      if (S.queue.length && !confirmLeave()) return;
      S.sb.auth.signOut().finally(function () {
        drop(K.cache); drop(K.queue); drop(K.drafts); drop(K.sets);
        S.queue = []; S.drafts = {}; S.setDrafts = {}; S.data = emptyData(); S.plan = null; S.ready = false;
        renderLogin();
      });
    },
    toc: function (el, ev) { ev.preventDefault(); var t = document.getElementById(el.getAttribute('data-id')); if (t) t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
  };
  function confirmLeave() {
    toast('لديك ' + S.queue.length + ' سجل لم يُرفع بعد. اتصل بالإنترنت وارفعها قبل تسجيل الخروج.', true);
    return false;
  }

  function bindGlobal() {
    document.addEventListener('click', function (ev) {
      unlockAudio();
      var el = ev.target.closest('[data-act]');
      if (!el) return;
      var fn = ACT[el.getAttribute('data-act')];
      if (fn) fn(el, ev);
    });
    document.addEventListener('input', function (ev) {
      var el = ev.target;
      if (el.hasAttribute('data-f')) {
        setDraft(S.date, el.getAttribute('data-f'), el.value);
        if (el.getAttribute('data-f') === 'water_l') {
          var bar = document.getElementById('waterbar'), wt = L.waterTarget(S.plan, S.date);
          if (bar) bar.style.setProperty('--w', Math.min(100, Math.round((L.parseNum(el.value) || 0) / wt * 100)) + '%');
        }
      } else if (el.hasAttribute('data-sf')) {
        var k = el.getAttribute('data-k');
        S.setDrafts[k] = S.setDrafts[k] || {};
        S.setDrafts[k][el.getAttribute('data-sf')] = el.value;
        store(K.sets, S.setDrafts);
        var row = el.closest('.set');
        if (row && row.classList.contains('done')) row.classList.add('dirty');
      } else if (el.hasAttribute('data-snote')) {
        S.sessNotes = S.sessNotes || {};
        S.sessNotes[el.getAttribute('data-snote')] = el.value;
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var el = ev.target;
      if (el.hasAttribute && el.hasAttribute('data-sf')) {
        ev.preventDefault();
        var inputs = Array.prototype.slice.call(el.closest('.set').querySelectorAll('input')), i = inputs.indexOf(el);
        if (i < inputs.length - 1) inputs[i + 1].focus(); else el.closest('.set').querySelector('.ok').click();
      } else if (el.hasAttribute && el.hasAttribute('data-f') && el.tagName === 'INPUT') {
        ev.preventDefault(); el.blur();
      }
    });
    document.addEventListener('focusout', function () { if (S.needsRender) setTimeout(renderSoon, 30); });
    document.addEventListener('submit', function (ev) {
      if (ev.target.id === 'login') { ev.preventDefault(); doLogin(ev.target); }
      if (ev.target.id === 'inbodyform') { ev.preventDefault(); saveInbody(ev.target); }
    });
    window.addEventListener('online', function () { renderStatus(); flush(); });
    window.addEventListener('offline', function () { renderStatus(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (S.ready && S.loadedAt && Date.now() - S.loadedAt > 10 * 60 * 1000 && !S.syncing) refresh();
      var key = S.ready ? currentWKey() : null, sr = key ? S.data.sessions[sessKey(S.date, key)] : null;
      if (sr && sr.started_at && !sr.finished_at) requestWake();
      flushSoon(500);
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if ((prefs.theme || 'system') === 'system') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  }

  async function doLogin(form) {
    var email = form.email.value.trim(), pw = form.password.value, err = document.getElementById('loginerr');
    if (!email || !pw) { err.textContent = 'أدخل البريد وكلمة المرور.'; return; }
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'جارٍ الدخول…';
    try {
      var r = await S.sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) {
        var m = r.error.message || '';
        err.textContent = /invalid login/i.test(m) ? 'البريد أو كلمة المرور غير صحيحة.'
          : (/not confirmed/i.test(m) ? 'البريد غير مؤكد. أكّده من لوحة Supabase (Auto Confirm).' : (/fetch|network/i.test(m) ? 'تعذّر الاتصال. تحقق من الإنترنت.' : m));
        btn.disabled = false; btn.textContent = 'تسجيل الدخول';
        return;
      }
      onSignedIn(r.data.user);
    } catch (e) {
      err.textContent = 'تعذّر الاتصال. تحقق من الإنترنت.';
      btn.disabled = false; btn.textContent = 'تسجيل الدخول';
    }
  }

  function saveInbody(form) {
    var row = { measured_on: form.measured_on.value || today(), source: 'inbody', device: form.device.value.trim() || null }, bad = null;
    MEAS_FIELDS.forEach(function (f) {
      var raw = form[f[0]].value, v = L.parseNum(raw, { int: f[0] === 'visceral_level' || f[0] === 'bmr_kcal' || f[0] === 'inbody_score' });
      if (raw.trim() !== '' && (v === null || v < 0 || v > 10000)) bad = f[1];
      row[f[0]] = raw.trim() === '' ? null : v;
    });
    if (bad) { toast('قيمة غير صالحة في: ' + bad, true); return; }
    if (row.weight_kg === null && row.pbf === null && row.smm_kg === null) { toast('أدخل الوزن ونسبة الدهون والعضل على الأقل.', true); return; }
    awaitSave('body_measurements', row.measured_on + '|inbody', 'حُفظ قياس InBody في Supabase');
    write('body_measurements', row);
    S.showInbody = false;
    render(true);
  }

  function applyTheme() {
    var pref = prefs.theme || 'system';
    var dark = pref === 'dark' || (pref === 'system' && (!window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches));
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f110d' : '#f1f2ec');
  }

  var lastDay = today();
  function tick() {
    var t = today();
    if (t !== lastDay) { if (S.date === lastDay) S.date = t; lastDay = t; if (S.ready) renderSoon(); }
    if (!S.ready || !S.plan) return;
    var win = document.getElementById('win');
    if (win && S.date === t && S.view === 'today') {
      var ws = L.windowState(S.plan, nowMin());
      var html = ws.open ? '<span class="st open">النافذة مفتوحة</span><span>تغلق 3:00 عصرًا، باقٍ ' + L.dur(ws.left) + '</span>'
        : '<span class="st">النافذة مغلقة</span><span>تفتح 5:00 فجرًا بعد ' + L.dur(ws.until) + '</span>';
      if (win.innerHTML !== html) win.innerHTML = html;
    }
    var el = document.getElementById('elapsed');
    if (el && S.view === 'workout') {
      var key = currentWKey(), sr = key ? S.data.sessions[sessKey(S.date, key)] : null;
      if (sr && sr.started_at && !sr.finished_at) el.textContent = mmss((Date.now() - Date.parse(sr.started_at)) / 1000);
    }
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
  }

  window.FPApp = { state: S, version: APP_VERSION }; // for debugging from the console
  boot();
})();
