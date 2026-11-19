/* Position + team filter shared by the analysis pages.
   One sticky bar filters every registered chart and the table at once.
   Usage on a page:
     PF.init({ mount: 'pf-mount', onChange: () => {...redraw...} });
     const rows = PF.apply(DATA);        // filtered copy
     PF.note(fullText, rows, xf, yf, {logx}) // r / n annotation for the subset
*/
(function () {
  const TEAM_NAMES = {
    ARI: 'Arizona Diamondbacks', ATH: 'Athletics', ATL: 'Atlanta Braves', BAL: 'Baltimore Orioles',
    BOS: 'Boston Red Sox', CHC: 'Chicago Cubs', CHW: 'Chicago White Sox', CIN: 'Cincinnati Reds',
    CLE: 'Cleveland Guardians', COL: 'Colorado Rockies', DET: 'Detroit Tigers', HOU: 'Houston Astros',
    KCR: 'Kansas City Royals', LAA: 'Los Angeles Angels', LAD: 'Los Angeles Dodgers', MIA: 'Miami Marlins',
    MIL: 'Milwaukee Brewers', MIN: 'Minnesota Twins', NYM: 'New York Mets', NYY: 'New York Yankees',
    OAK: 'Oakland Athletics', PHI: 'Philadelphia Phillies', PIT: 'Pittsburgh Pirates', SDP: 'San Diego Padres',
    SEA: 'Seattle Mariners', SFG: 'San Francisco Giants', STL: 'St. Louis Cardinals', TBR: 'Tampa Bay Rays',
    TEX: 'Texas Rangers', TOR: 'Toronto Blue Jays', WSN: 'Washington Nationals'
  };
  const ORDER = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'];
  const GROUPS = {
    'g:IF': { label: 'Infield (1B, 2B, 3B, SS)', set: ['1B', '2B', '3B', 'SS'] },
    'g:OF': { label: 'Outfield (LF, CF, RF)', set: ['LF', 'CF', 'RF'] },
    'g:P': { label: 'Pitchers (SP, RP)', set: ['SP', 'RP'] }
  };
  const state = { pos: 'all', team: 'all' };
  let cfg = null, sources = [];
  const listeners = [];

  const parts = p => String(p || '').split('/');
  const posMatch = d => {
    if (state.pos === 'all') return true;
    const ps = parts(d.Pos);
    if (GROUPS[state.pos]) return ps.some(p => GROUPS[state.pos].set.includes(p));
    return ps.includes(state.pos);
  };
  const teamMatch = d => state.team === 'all' || d.Team === state.team;

  function apply(arr) { return (arr || []).filter(d => posMatch(d) && teamMatch(d)); }
  function active() { return state.pos !== 'all' || state.team !== 'all'; }

  function pearson(xs, ys) {
    const n = xs.length; if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  // Annotation text: full-sample text when no filter, subset r and n otherwise
  function note(fullText, rows, xf, yf, opt) {
    opt = opt || {};
    if (!active()) return fullText;
    const ok = rows.filter(d => xf(d) != null && yf(d) != null && (!opt.logx || xf(d) > 0));
    const r = pearson(ok.map(d => opt.logx ? Math.log10(xf(d)) : xf(d)), ok.map(yf));
    const small = window.innerWidth < 640;
    const base = `Filtered: ${r === null ? 'r n/a' : 'r = ' + r.toFixed(2)} · n = ${ok.length}`;
    return small || !opt.full ? base : `${base} (all players: ${opt.full})`;
  }
  // Message drawn on an empty chart
  function emptyAnn(rows) {
    return rows.length ? [] : [{ x: .5, y: .5, xref: 'paper', yref: 'paper', showarrow: false,
      text: 'No player matches this filter', font: { size: 13, color: '#94a3b8' } }];
  }

  // Overlay message on a chart whose filtered dataset is empty
  function markEmpty(id, rows) {
    const el = document.getElementById(id); if (!el) return;
    let o = el.querySelector(':scope > .pf-empty');
    if (!o) { o = document.createElement('div'); o.className = 'pf-empty'; o.textContent = 'No player matches this filter'; el.style.position = 'relative'; el.appendChild(o); }
    o.style.display = rows.length ? 'none' : 'flex';
  }

  function label() {
    const bits = [];
    if (state.pos !== 'all') bits.push(GROUPS[state.pos] ? GROUPS[state.pos].label.split(' (')[0] : state.pos);
    if (state.team !== 'all') bits.push(state.team);
    return bits.join(' · ');
  }

  function buildOptions() {
    const all = [].concat(...sources.map(s => s() || []));
    const pos = new Set(), teams = new Set();
    all.forEach(d => { parts(d.Pos).forEach(p => p && p !== '–' && pos.add(p)); if (d.Team) teams.add(d.Team); });
    const pList = ORDER.filter(p => pos.has(p));
    const groups = Object.entries(GROUPS).filter(([, g]) => g.set.some(p => pos.has(p)));
    let ph = '<option value="all">All positions</option>';
    if (groups.length > 1) ph += '<optgroup label="Groups">' + groups.map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('') + '</optgroup>';
    ph += '<optgroup label="Position">' + pList.map(p => `<option value="${p}">${p}</option>`).join('') + '</optgroup>';
    const multi = [...teams].filter(t => /TM$/.test(t)).sort();
    const single = [...teams].filter(t => !/TM$/.test(t)).sort();
    let th = '<option value="all">All teams</option>' + single.map(t => `<option value="${t}">${t}${TEAM_NAMES[t] ? ' · ' + TEAM_NAMES[t] : ''}</option>`).join('');
    if (multi.length) th += '<optgroup label="Traded mid-season">' + multi.map(t => `<option value="${t}">${t} (${t[0]} teams)</option>`).join('') + '</optgroup>';
    const ps = document.getElementById('pf-pos'), ts = document.getElementById('pf-team');
    ps.innerHTML = ph; ts.innerHTML = th;
    if (![...ps.options].some(o => o.value === state.pos)) state.pos = 'all';
    if (![...ts.options].some(o => o.value === state.team)) state.team = 'all';
    ps.value = state.pos; ts.value = state.team;
  }

  function updateCount() {
    const n = apply(sources[0] ? sources[0]() : []).length;
    const tot = sources[0] ? (sources[0]() || []).length : 0;
    const el = document.getElementById('pf-count');
    el.textContent = active() ? `${n} of ${tot} players · ${label()}` : `${tot} players`;
    document.getElementById('pf-reset').style.visibility = active() ? 'visible' : 'hidden';
    document.getElementById('pf-bar').classList.toggle('pf-on', active());
  }

  function changed() { updateCount(); if (cfg.onChange) cfg.onChange(); listeners.forEach(fn => fn()); }
  function on(fn) { listeners.push(fn); }

  function injectCss() {
    const css = `
#pf-bar{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.96);backdrop-filter:blur(6px);
  border-top:1px solid var(--border,#e2e8f0);border-bottom:1px solid var(--border,#e2e8f0)}
#pf-bar.pf-on{border-bottom:2px solid var(--blue,#2563eb)}
#pf-bar .pf-inner{max-width:1100px;margin:0 auto;padding:.55rem 1.5rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
#pf-bar .pf-title{font-family:var(--mono,monospace);font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--navy,#0A1628)}
#pf-bar select{padding:.4rem .6rem;border:1px solid var(--border,#e2e8f0);background:#fff;font-family:var(--font,sans-serif);
  font-size:.8rem;color:var(--text,#1a1f2e);max-width:220px;cursor:pointer;border-radius:0}
#pf-bar select:focus{outline:2px solid var(--blue,#2563eb);outline-offset:1px}
#pf-bar .pf-count{font-size:.76rem;color:var(--muted,#64748b);margin-left:auto}
#pf-bar button{padding:.4rem .7rem;border:1px solid var(--border,#e2e8f0);background:#fff;font-size:.76rem;color:var(--muted,#64748b);cursor:pointer}
#pf-bar button:hover{color:var(--navy,#0A1628);border-color:var(--navy,#0A1628)}
.pf-empty{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(255,255,255,.85);font-size:.9rem;color:var(--muted,#64748b);z-index:5}
.pf-static{font-size:.72rem;color:var(--muted,#64748b);font-style:italic;margin:.4rem 0 0}
@media(max-width:640px){#pf-bar .pf-inner{padding:.45rem 1rem;gap:.4rem}#pf-bar .pf-title{display:none}
  #pf-bar select{flex:1 1 0;min-width:0;max-width:none;font-size:.78rem}#pf-bar .pf-count{width:100%;margin:0;font-size:.7rem;order:5}}`;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  function init(c) {
    cfg = c; sources = c.sources || [];
    injectCss();
    const bar = document.createElement('div');
    bar.id = 'pf-bar';
    bar.innerHTML = `<div class="pf-inner"><span class="pf-title">Filter charts &amp; table</span>
      <select id="pf-pos" aria-label="Filter by position"></select>
      <select id="pf-team" aria-label="Filter by team"></select>
      <button id="pf-reset" type="button">Reset</button>
      <span class="pf-count" id="pf-count"></span></div>`;
    const el = document.getElementById(c.mount);
    const mount = (el.closest && el.closest('.section')) || el;
    mount.parentNode.insertBefore(bar, mount);
    buildOptions(); updateCount();
    document.getElementById('pf-pos').addEventListener('change', e => { state.pos = e.target.value; changed(); });
    document.getElementById('pf-team').addEventListener('change', e => { state.team = e.target.value; changed(); });
    document.getElementById('pf-reset').addEventListener('click', () => {
      state.pos = 'all'; state.team = 'all';
      document.getElementById('pf-pos').value = 'all'; document.getElementById('pf-team').value = 'all'; changed();
    });
  }
  // Rebuild dropdowns when the underlying dataset changes (e.g. a year toggle)
  function refresh() { if (!cfg) return; buildOptions(); updateCount(); }

  window.PF = { init, on, apply, active, note, emptyAnn, markEmpty, refresh, state, TEAM_NAMES };
})();
