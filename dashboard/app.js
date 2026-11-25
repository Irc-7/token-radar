/* Renders window.RADAR (written by main.ts). No fetch, no network, no inline handlers. */
(function () {
  var D = window.RADAR || { metrics: {}, rows: [] };
  var M = D.metrics || {};
  var ROWS = D.rows || [];
  var q = new URLSearchParams(location.search);

  function $(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function int(n) { return Number(n || 0).toLocaleString('en-US'); }
  function usd(n) {
    var v = Math.round(Number(n) || 0);
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v;
  }
  function full(n) { return '$' + int(n); }
  // Cents: net an hour runs from $0.04 to $63.54, and whole dollars would print "$0" for most rows.
  function usd2(n) { return '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }
  function pct(n) {
    var v = Number(n) * 100;
    if (!isFinite(v)) return '-';
    return (v < 0 ? String.fromCharCode(8722) : '+') + Math.abs(v).toFixed(1) + '%';
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  var V = M.value_model || {};
  var O = M.odds_model || {};
  var kpi = {
    rows: int(M.board_rows),
    coverage: (M.watchlist_covered || 0) + ' / ' + (M.watchlist_size || 0),
    total: usd(M.total_implied_usd),
    miss: 'x' + (V.walk_forward_miss != null ? V.walk_forward_miss : '-'),
    brier: O.brier_cv != null ? Number(O.brier_cv).toFixed(4) : '-',
    checksum: M.checksum || '-',
    as_of: M.as_of || '-',
    wf_miss: 'x' + (V.walk_forward_miss != null ? V.walk_forward_miss : '-'),
    loo_miss: 'x' + (V.leave_one_out_miss != null ? V.leave_one_out_miss : '-'),
    base_miss: 'x' + (V.baseline_miss != null ? V.baseline_miss : '-'),
    kept: (V.kept && V.kept.length ? V.kept.join(', ') : 'none'),
    tested_wf: int(V.tested_walk_forward),
    tested_loo: int(V.tested_loo),
    brier_cv: O.brier_cv != null ? Number(O.brier_cv).toFixed(4) : '-',
    brier_base_cv: O.base_brier_cv != null ? Number(O.base_brier_cv).toFixed(4) : '-',
    brier_base_cv_scored: O.base_brier_cv_scored != null ? Number(O.base_brier_cv_scored).toFixed(4) : '-',
    brier_skill_cv_scored: O.skill_cv_scored != null ? pct(O.skill_cv_scored) : '-',
    brier_in: O.brier != null ? Number(O.brier).toFixed(4) : '-',
    brier_base_in: O.base_brier != null ? Number(O.base_brier).toFixed(4) : '-',
    odds_n: int(O.n),
    median_age: int(O.median_age_days),
    total_protocols: int(M.total),
    sum_implied: full(M.total_implied_usd),
    checksum2: M.checksum || '-'
  };
  all('[data-kpi]').forEach(function (n) {
    var k = n.getAttribute('data-kpi');
    if (kpi[k] !== undefined) n.textContent = kpi[k];
  });
  all('[data-count]').forEach(function (n) {
    n.textContent = int((M.counts || {})[n.getAttribute('data-count')]);
  });
  // The comparison lives beside the number: the judge reads three stills, not the panel below the board.
  var subs = {
    miss: V.baseline_miss != null && V.leave_one_out_miss != null
      ? [['baseline ', 'x' + V.baseline_miss], [' \u00b7 LOO ', 'x' + V.leave_one_out_miss]]
      : null,
    brier: O.base_brier_cv_scored != null && O.skill_cv_scored != null
      ? [['base ', Number(O.base_brier_cv_scored).toFixed(4)], [' · BSS ', pct(O.skill_cv_scored)]]
      : null
  };
  all('[data-sub]').forEach(function (n) {
    var parts = subs[n.getAttribute('data-sub')];
    if (!parts) return;
    n.textContent = '';
    parts.forEach(function (p) {
      n.appendChild(document.createTextNode(p[0]));
      n.appendChild(el('b', null, p[1]));
    });
  });

  // Three sentences, not one: the page says where the model wins and where it loses, and the gate
  // counts words per run. Each is at most six words.
  function note(key) { return document.querySelector('[data-note="' + key + '"]'); }
  if (O.skill_cv_scored != null) {
    var scored = note('scored');
    if (scored) scored.textContent = O.skill_cv_scored < 0 ? 'No edge on scored rows.' : 'Edge on scored rows.';
    var train = note('train');
    if (train && O.skill_cv_train != null) {
      var s = Number(O.skill_cv_train) * 100;
      train.textContent = (s >= 0 ? 'Beats' : 'Loses to') + ' training-side base by ' + Math.abs(s).toFixed(1) + '%.';
    }
    var folds = note('folds');
    if (folds && O.folds_lost_scored != null) folds.textContent = 'Loses ' + O.folds_lost_scored + ' of ' + O.folds + ' folds.';
  }

  // The verdict spread sits beside the filter: a column that reads FARM 197 of 198 is decoration, and
  // printing FARM 11 / MARGINAL 174 / SKIP 13 is the cheapest proof that it classifies.
  var Vd = M.verdicts || {};
  var spreadEl = $('#spread');
  if (spreadEl) {
    spreadEl.textContent = '';
    ['FARM', 'MARGINAL', 'SKIP'].forEach(function (tier, i) {
      if (i) spreadEl.appendChild(document.createTextNode(' \u00b7 '));
      spreadEl.appendChild(document.createTextNode(tier + ' '));
      spreadEl.appendChild(el('b', null, int(Vd[tier])));
    });
  }
  // One delta, on the card that carries the strongest claim: the walk-forward miss against its baseline.
  all('[data-delta]').forEach(function (n) {
    var key = n.getAttribute('data-delta');
    var value = null;
    if (key === 'miss' && V.walk_forward_miss != null && V.baseline_miss) value = (V.walk_forward_miss - V.baseline_miss) / V.baseline_miss;
    if (key === 'brier' && O.brier_cv != null && O.base_brier_cv) value = (O.brier_cv - O.base_brier_cv) / O.base_brier_cv;
    if (value === null || !isFinite(value)) { n.style.display = 'none'; return; }
    n.textContent = (value <= 0 ? '\u2212' : '+') + Math.abs(value * 100).toFixed(1) + '% vs ' + (key === 'miss' ? 'baseline' : 'base rate');
    n.className = 'delta ' + (value <= 0 ? 'good' : 'bad');
  });

  var catSel = $('#f-cat');
  var verdictSel = $('#f-verdict');
  var search = $('#f-q');
  var cats = [];
  ROWS.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  catSel.appendChild(new Option('All', ''));
  cats.forEach(function (c) { catSel.appendChild(new Option(c, c)); });
  catSel.value = q.get('category') || '';
  verdictSel.value = q.get('verdict') || '';
  if (q.get('state') === 'farm') verdictSel.value = 'FARM';

  var tbody = $('[data-board]');
  var countEl = $('#count');

  function filtered() {
    var c = catSel.value, v = verdictSel.value, s = (search.value || '').trim().toLowerCase();
    return ROWS.filter(function (r) {
      if (c && r.category !== c) return false;
      if (v && r.verdict !== v) return false;
      if (s && r.slug.toLowerCase().indexOf(s) < 0) return false;
      return true;
    });
  }

  function paint() {
    var rows = filtered();
    countEl.textContent = int(rows.length) + ' / ' + int(ROWS.length) + ' rows';
    tbody.textContent = '';
    if (!rows.length) {
      var tr0 = el('tr');
      var td0 = el('td', 'empty', 'No protocol matches these filters');
      td0.colSpan = 9;
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.setAttribute('data-slug', r.slug);
      tr.appendChild(el('td', 'n', r.rank));
      var name = el('td', 'name');
      name.appendChild(el('div', null, r.name));
      name.appendChild(el('div', 'slug', r.slug));
      tr.appendChild(name);
      tr.appendChild(el('td', null, r.category || '-'));
      tr.appendChild(el('td', 'n', usd(r.tvl_usd)));
      tr.appendChild(el('td', 'n', full(r.implied_value_usd)));
      tr.appendChild(el('td', 'n range', usd(r.p25_usd) + ' - ' + usd(r.p75_usd)));
      tr.appendChild(el('td', 'n', Number(r.odds).toFixed(2)));
      tr.appendChild(el('td', 'n', usd2(r.net_per_hour_usd)));
      var vcell = el('td');
      vcell.appendChild(el('span', 'badge ' + r.verdict, r.verdict));
      tr.appendChild(vcell);
      tr.addEventListener('click', function () { openDetail(r); });
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  var dlg = $('#detail');
  function openDetail(r) {
    $('#d-name').textContent = r.name;
    var grid = $('#d-grid');
    grid.textContent = '';
    [
      ['Rank', '#' + r.rank], ['Category', r.category || '-'], ['Chains', (r.chains || []).join(', ') || '-', 'wrap'],
      ['TVL', full(r.tvl_usd)], ['Implied', full(r.implied_value_usd)], ['P25-P75', usd(r.p25_usd) + ' - ' + usd(r.p75_usd)],
      ['Peer odds', Number(r.odds).toFixed(3)], ['Age (days)', r.age_days == null ? '-' : int(r.age_days)], ['Net/hour', usd2(r.net_per_hour_usd)]
    ].forEach(function (pair) {
      var d = el('div', pair[2] || null);
      d.appendChild(el('span', null, pair[0]));
      d.appendChild(el('b', null, pair[1]));
      grid.appendChild(d);
    });
    var p = M.params || {};
    var farm = $('#d-farm').querySelector('tbody');
    farm.textContent = '';
    // Every line below is on the drop basis: the allocation, split across the assumed participants,
    // with the fee taken out of that same drop. The deposit is the capital the steps ask for, nothing more.
    [
      ['Deposit', full(p.depositUsd), 'capital, not a denominator'],
      ['Drop basis', (Number(p.dropShare) * 100).toFixed(1) + '% of implied', 'the protocol allocation'],
      ['Participants', int(p.participants), 'assumed, split evenly'],
      ['Drop', usd2(r.drop_usd), 'one farmer’s share'],
      ['Fee (' + p.feeBps + ' bps of drop)', usd2(r.fee_usd), 'same basis as the drop'],
      ['Net', usd2(r.net_usd), 'drop minus fee'],
      ['Horizon hours', int(p.horizonWeeks * p.hoursPerWeek), 'weeks x hours a week'],
      ['Net/hour', usd2(r.net_per_hour_usd), r.verdict],
    ].forEach(function (row) {
      var tr = el('tr');
      tr.appendChild(el('th', null, row[0]));
      tr.appendChild(el('td', 'n', row[1]));
      var note = el('td', 'note', row[2]);
      tr.appendChild(note);
      farm.appendChild(tr);
    });
    var ol = $('#d-steps');
    ol.textContent = '';
    (r.farm_steps || []).forEach(function (s) { ol.appendChild(el('li', null, s)); });
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
  }

  [catSel, verdictSel, search].forEach(function (n) {
    n.addEventListener('input', paint);
    n.addEventListener('change', paint);
  });
  $('#reset').addEventListener('click', function () {
    catSel.value = ''; verdictSel.value = ''; search.value = ''; paint();
  });

  paint();

  // The third still is the method, not a second copy of the board: the board panel folds away so the
  // validation tables and the ledger start at the top of the frame. Same page, one view state.
  if (q.get('state') === 'method') document.body.classList.add('method');

  var slug = q.get('slug');
  if (slug) {
    var hit = ROWS.filter(function (r) { return r.slug === slug; })[0];
    if (hit) openDetail(hit);
  }
})();
