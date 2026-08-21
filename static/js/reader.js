/* ==========================================================================
   THE READER
   Spread-based paging over a 250-page issue. Active state (the spread you are
   on, the rail, the search string, the instrument's draft text) is queryable
   and restorable so a reload never costs you your place.
   ========================================================================== */

(function () {
'use strict';

const { CHARTS, DIAGRAMS, SERIES, tableFallback, esc } = window.PLATES;
const STATIC_SITE = Boolean(window.__STATIC_SITE__);
const STORAGE_KEY = 'capstrategy-reader-v1';

const S = {
  pages: [], sources: {}, plates: {}, marks: [], reading: {},
  spread: 0, flow: false, rail: false, railMode: 'contents', q: '', draft: '',
};

const $ = (id) => document.getElementById(id);
const stage = $('stage'), spreadEl = $('spread'), rail = $('rail'), railBody = $('rail-body');

function loadLocal() {
  if (!STATIC_SITE) return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch (_error) { return {}; }
}

function saveLocal() {
  if (!STATIC_SITE) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    marks: S.marks,
    reading: {
      spread: String(S.spread), flow: S.flow ? '1' : '', draft: S.draft,
      rail: S.rail ? '1' : '', railMode: S.railMode, query: S.q,
      scroll: String(S.flow ? stage.scrollTop : 0),
    },
  }));
}

function plainText(value) {
  const node = document.createElement('div');
  node.innerHTML = String(value || '');
  return (node.textContent || '').replace(/\s+/g, ' ').trim();
}

function searchableText(value) {
  if (typeof value === 'string') return plainText(value);
  if (Array.isArray(value)) return value.map(searchableText).join(' ');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['t', 'slug', 'kind', 'ref', 'file', 'ids'].includes(key))
      .map(([, item]) => searchableText(item)).join(' ');
  }
  return '';
}

function syllableCount(value) {
  const word = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  let count = 0, previousWasVowel = false;
  for (const character of word) {
    const isVowel = 'aeiouy'.includes(character);
    if (isVowel && !previousWasVowel) count += 1;
    previousWasVowel = isVowel;
  }
  if (word.endsWith('e') && count > 1) count -= 1;
  return Math.max(1, count);
}

function scoreText(text) {
  const sentences = String(text || '').split(/[.!?]+/).filter(part => part.trim());
  const words = String(text || '').match(/[A-Za-z']+/g) || [];
  if (!sentences.length || !words.length) {
    return { words: 0, sentences: 0, flesch: null, fog: null, grade: null,
      long_words: [], asl: 0, asw: 0, complex_pct: 0 };
  }
  const syllables = words.map(syllableCount);
  const asl = words.length / sentences.length;
  const asw = syllables.reduce((sum, count) => sum + count, 0) / words.length;
  const complex = words.filter((word, index) => syllables[index] >= 3 && word.length > 6);
  const complexPct = 100 * complex.length / words.length;
  const seen = new Set();
  const longWords = words.map((word, index) => ({ word, syllables: syllables[index] }))
    .sort((a, b) => b.syllables - a.syllables)
    .filter(item => item.syllables >= 3 && !seen.has(item.word.toLowerCase()) && seen.add(item.word.toLowerCase()))
    .slice(0, 12);
  const round = (value, places) => Number(value.toFixed(places));
  return {
    words: words.length, sentences: sentences.length,
    asl: round(asl, 1), asw: round(asw, 2),
    flesch: round(206.835 - 1.015 * asl - 84.6 * asw, 1),
    fog: round(0.4 * (asl + complexPct), 1),
    grade: round(0.39 * asl + 11.8 * asw - 15.59, 1),
    complex_pct: round(complexPct, 1), long_words: longWords,
  };
}

/* --- block rendering ------------------------------------------------------ */

function citeify(html) {
  return String(html || '').replace(/data-src='([^']+)'/g, (m, id) => {
    const s = S.sources[id];
    return s ? `href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.label)} — ${esc(s.outlet || '')}"` : '';
  });
}

const B = {
  p: (b) => `<p class="${b.drop ? 'dropcap' : ''} ${b.lead ? 'lead' : ''}">${citeify(b.x)}</p>`,
  hed: (b) => b.size === 2 ? `<h2 class="hed">${b.x}</h2>` : `<h1 class="hed">${b.x}</h1>`,
  sub: (b) => `<h3 class="subhed">${esc(b.x)}</h3>`,
  stand: (b) => `<div class="standfirst">${citeify(b.x)}</div>`,
  eyebrow: (b) => `<span class="eyebrow ${b.vault ? 'eyebrow--vault' : ''}">${esc(b.x)}</span>`,
  ticks: (b) => `<ul class="ticks">${b.items.map(i => `<li>${citeify(i)}</li>`).join('')}</ul>`,
  steps: (b) => `<ol class="steps">${b.items.map(i => `<li>${citeify(i)}</li>`).join('')}</ol>`,
  note: (b) => `<div class="note">${citeify(b.x)}</div>`,
  rule: () => `<div style="border-top:.5px solid var(--tint-deep);margin:1em 0"></div>`,
  sidenote: (b) => `<aside class="sidenote"><span class="sidenote__label">${esc(b.label)}</span>
      <p>${citeify(b.x)}</p></aside>`,

  redline: (b) => `<div class="redline" data-mark="${esc(b.mark)}">
      ${b.rows.map(r => `<div class="redline__row">
        <span class="redline__tag redline__tag--cut">Struck</span>
        <span class="cut">${citeify(r.cut)}</span>
        <span class="redline__tag redline__tag--set" style="margin-top:.5em">Set</span>
        <span class="set">${citeify(r.set)}</span></div>`).join('')}
      ${b.why ? `<div class="redline__why"><b>Why —</b> ${citeify(b.why)}</div>` : ''}</div>`,

  tear: (b) => `<div class="tearsheet"><div class="tearsheet__head"><span>${esc(b.head)}</span>
      ${b.right ? `<span>${esc(b.right)}</span>` : ''}</div>
      <div class="tearsheet__grid ${b.items.length % 3 === 0 ? 'tearsheet__grid--3' : ''}">
      ${b.items.map(i => `<div><span class="ts-figure ${i.vault ? 'ts-figure--vault' : ''}">${citeify(i.fig)}</span>
        <span class="ts-label">${citeify(i.label)}</span></div>`).join('')}</div></div>`,

  pull: (b) => `<div class="pullquote"><blockquote>“${citeify(b.x)}”</blockquote>
      <cite>${esc(b.cite)}</cite></div>`,

  table: (b) => `<table class="data"><thead><tr>${b.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${citeify(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${b.foot ? `<div class="figure__foot">${citeify(b.foot)}</div>` : ''}`,

  chart: (b) => (CHARTS[b.kind] || (() => ''))(b),
  diagram: (b) => (DIAGRAMS[b.name] || (() => ''))(b),

  srcs: (b) => `<div class="sourcebar"><b>Sources on this page</b><ol>${b.ids.map(id => {
    const s = S.sources[id];
    return s ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>
      — ${esc(s.outlet || '')}${s.dated ? ', ' + esc(s.dated) : ''}</li>` : '';
  }).join('')}</ol></div>`,

  instrument: () => `<div class="instrument">
      <div class="figure__head">The clarity instrument</div>
      <div class="figure__sub">Paste any passage. Scoring runs in Python, so the numbers do not drift.</div>
      <textarea id="inst-text" placeholder="Paste a sentence from cap.app here…"></textarea>
      <div class="instrument__row"><button class="instrument__btn" id="inst-run">Measure</button>
        <span class="note" id="inst-hint">Aim for Flesch 50+ and fog under 14 for a landing page.</span></div>
      <div class="instrument__out" id="inst-out"></div></div>`,

  cover: (b) => {
    const pl = S.plates[b.slug];
    return `${pl ? `<div class="cover__art"><img src="static/img/${esc(pl.file)}" alt=""></div>` : ''}
      <div class="cover__guilloche">${DIAGRAMS.guilloche({ stroke: '#8a8060', rings: 8 })}</div>
      <div class="cover__stamp">${b.stamp}</div>
      <div class="cover__body">
        <div class="cover__logo">${b.logo}</div>
        <div class="cover__rule"></div>
        <div class="cover__meta">${b.meta.map(m => esc(m)).join('<br>')}</div>
        <ul class="cover__lines" style="padding:0;margin:auto 0 0">${b.lines.map(l => `<li>${l}</li>`).join('')}</ul>
      </div>`;
  },

  toc: (b) => `<span class="eyebrow">${esc(b.head)}</span>
      ${b.rows.map(r => r.part
        ? `<div class="toc__row toc__row--part"><span class="toc__no"></span>
             <span class="toc__name">${esc(r.name)}</span><span class="toc__folio">${esc(r.folio)}</span></div>`
        : `<button class="toc__row" data-goto="${esc(r.folio)}" style="width:100%;text-align:left">
             <span class="toc__no">${esc(r.no || '')}</span>
             <span class="toc__name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
             <span class="toc__folio">${esc(r.folio)}</span></button>`).join('')}`,

  part: (b) => `<div class="guilloche">${DIAGRAMS.guilloche({ stroke: '#4a4436', rings: 6 })}</div>
      <div style="position:relative;z-index:2">
        <div class="part__no">${esc(b.no)}</div>
        <div class="part__name">${b.name}</div>
        <div class="part__blurb">${citeify(b.blurb)}</div>
        ${b.toc ? `<ul class="part__toc" style="padding:0">${b.toc.map(t =>
          `<li><b>${esc(t[0])}</b><span>${esc(t[1])}</span></li>`).join('')}</ul>` : ''}
      </div>`,

  plate: (b) => {
    const pl = S.plates[b.slug];
    if (!pl) return `<div class="plate" style="background:#241f19"></div>`;
    const source = pl.source
      ? ` <a href="${esc(pl.source)}" target="_blank" rel="noopener" style="color:inherit">Source</a>`
      : '';
    return `<div class="plate plate--${esc(b.treatment || 'tint')}">
        <img src="static/img/${esc(pl.file)}" alt="${esc(b.caption).slice(0, 120)}">
        ${b.overlay ? `<div class="plate__scrim"></div><div class="plate__overlay">
          <h1 class="hed">${b.overlay}</h1></div>` : ''}
      </div>
      <div class="plate__caption"><b>${esc(b.caption.split('.')[0])}.</b>${esc(b.caption.slice(b.caption.indexOf('.') + 1))}
        <span class="credit"> — ${esc(pl.author || 'Wikimedia Commons')}. ${esc(pl.licence || '')}.
        ${source}</span></div>`;
  },
};

function renderBlocks(blocks) {
  return blocks.map(b => (B[b.t] || (() => ''))(b)).join('');
}

/* --- page rendering ------------------------------------------------------- */

function renderPage(pg, side) {
  if (!pg) return `<div class="page page--${side}" style="background:#dcd6c4"></div>`;
  const kindClass = {
    cover: 'page--cover', plate: 'page--plate', part: 'page--part',
    pull: 'page--pull', toc: 'page--toc',
  }[pg.kind] || 'page--text';
  const bare = pg.kind === 'cover' || pg.kind === 'plate';
  const inner = renderBlocks(pg.body);
  const twoCol = pg.kind === 'text' && !pg.body.some(b =>
    ['chart', 'diagram', 'table', 'tear', 'instrument', 'pull'].includes(b.t));
  return `<article class="page page--${side} ${kindClass}" data-folio="${pg.folio}">
    ${bare ? '' : `<div class="page__head"><span>${esc(pg.chapter || pg.part || '')}</span>
        <span>${esc(pg.part_no ? 'Part ' + pg.part_no : 'The Plain English Issue')}</span></div>`}
    ${bare ? inner : `<div class="page__scroll ${twoCol ? 'cols' : ''}">${inner}</div>`}
    ${bare ? '' : `<div class="page__rule"></div><div class="page__folio">${pg.folio}</div>`}
  </article>`;
}

/* Spreads: the cover stands alone, then even-left / odd-right, as in print. */
function spreadFor(index) {
  if (index === 0) return [null, S.pages[0]];
  const left = index * 2 - 1, right = index * 2;
  return [S.pages[left], S.pages[right]];
}
const spreadCount = () => Math.ceil((S.pages.length + 1) / 2);
const spreadOf = (folio) => folio <= 1 ? 0 : Math.floor(folio / 2);

function paint(animate = true) {
  spreadEl.classList.remove('spread--flow-stack');
  const [l, r] = spreadFor(S.spread);
  const html = renderPage(l, 'left') + renderPage(r, 'right');
  const go = () => {
    spreadEl.innerHTML = html;
    spreadEl.classList.remove('turning');
    wireSpread();
    const label = (r || l);
    $('running').textContent = label
      ? `${label.part_no ? 'PT ' + label.part_no + ' · ' : ''}${(label.chapter || label.part || '').toUpperCase()} · ${l ? l.folio + '–' : ''}${(r || l).folio} / ${S.pages.length}`
      : '';
    $('btn-mark').setAttribute('aria-pressed', S.marks.some(m => spreadOf(m.folio) === S.spread));
    save();
  };
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    spreadEl.classList.add('turning');
    setTimeout(go, 150);
  } else go();
}

function paintFlow() {
  spreadEl.classList.add('spread--flow-stack');
  spreadEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < spreadCount(); i++) {
    const [l, r] = spreadFor(i);
    const div = document.createElement('div');
    div.className = 'site-section';
    div.dataset.spread = i;
    div.innerHTML = [l, r].filter(Boolean).map((page, pageIndex) => {
      try {
        return renderPage(page, pageIndex ? 'right' : 'left');
      } catch (error) {
        console.error(`Could not render section ${page.folio}`, error);
        return `<article class="page page--text page--render-error">
          <div class="page__scroll">
            <span class="eyebrow">${esc(page.part || 'Plain English')}</span>
            <h1 class="hed">${esc(page.title || page.chapter || 'Section unavailable')}</h1>
            <p>This section could not be displayed. Use Chapters to continue exploring the site.</p>
          </div>
        </article>`;
      }
    }).join('');
    frag.appendChild(div);
  }
  spreadEl.appendChild(frag);
  wireSpread();
}

function wireSpread() {
  spreadEl.querySelectorAll('[data-goto]').forEach(el =>
    el.onclick = () => goFolio(parseInt(el.dataset.goto, 10)));
  const run = $('inst-run');
  if (run) {
    const ta = $('inst-text');
    ta.value = S.draft;
    ta.oninput = () => { S.draft = ta.value; };
    run.onclick = async () => measure(ta.value);
    if (S.draft) measure(S.draft);
  }
}

async function measure(text) {
  const out = $('inst-out');
  if (!out) return;
  if (!text.trim()) { out.innerHTML = '<div class="note">Paste something first.</div>'; return; }
  const res = STATIC_SITE ? scoreText(text) : await fetch('api/readability', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(r => r.json());
  if (!res.words) { out.innerHTML = '<div class="note">Not enough text to score.</div>'; return; }
  const band = (v, good, ok) => v >= good ? '' : v >= ok ? 'warn' : 'bad';
  const fleschPct = Math.max(0, Math.min(100, res.flesch));
  out.innerHTML = `
    <div class="figure__head" style="margin-top:.4em">Flesch reading ease — ${res.flesch}</div>
    <div class="gauge ${band(res.flesch, 50, 30)}"><i style="width:${fleschPct}%"></i></div>
    <div class="note">60–70 is plain English. Under 30 is a legal document. Cap's About page scores in the 20s.</div>
    ${tableFallback(['Measure', 'Value', 'Target'], [
      ['Words', res.words, '—'],
      ['Sentences', res.sentences, '—'],
      ['Avg. sentence length', res.asl, 'under 18'],
      ['Avg. syllables/word', res.asw, 'under 1.6'],
      ['Gunning fog index', res.fog, 'under 14'],
      ['Flesch–Kincaid grade', res.grade, 'under 10'],
      ['Complex words', res.complex_pct + '%', 'under 12%'],
    ])}
    ${res.long_words.length ? `<div class="note"><b>Heaviest words —</b> ${res.long_words
      .map(w => `${esc(w.word)} (${w.syllables})`).join(', ')}. Each one is a place a reader can fall off.</div>` : ''}`;
}

/* --- navigation ----------------------------------------------------------- */

function go(n) {
  S.spread = Math.max(0, Math.min(spreadCount() - 1, n));
  if (S.flow) {
    const el = document.querySelector(`[data-spread="${S.spread}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
    save();
  } else paint();
}
const goFolio = (folio) => { closeRail(); go(spreadOf(folio)); };

/* --- rail: contents, search, marks ---------------------------------------- */

function openRail(mode) {
  S.rail = true; S.railMode = mode || 'contents';
  rail.classList.add('open'); $('scrim').classList.add('on');
  $('rail-title').textContent = { contents: 'Contents', search: 'Search', marks: 'Marks' }[S.railMode];
  drawRail();
  save();
  if (S.railMode === 'search') setTimeout(() => $('q').focus(), 60);
}
function closeRail() {
  S.rail = false;
  rail.classList.remove('open');
  $('scrim').classList.remove('on');
  save();
}

function drawRail() {
  if (S.railMode === 'search') return drawSearch();
  if (S.railMode === 'marks') {
    railBody.innerHTML = S.marks.length ? S.marks.map(m => {
      const pg = S.pages.find(p => p.folio === m.folio);
      return `<button class="rail__item" data-folio="${m.folio}"><span class="n">${m.folio}</span>
        <span class="t">${esc(pg ? (pg.title || pg.chapter || '') : '')}<small>${esc(pg ? pg.part : '')}</small></span></button>`;
    }).join('') : '<div class="rail__empty">No marks yet. Press B on any spread.</div>';
    return wireRail();
  }
  let html = '', part = null;
  S.pages.forEach(pg => {
    if (pg.part !== part) {
      part = pg.part;
      html += `<div class="rail__group">${esc(part)}</div>`;
    }
    if (['cover', 'plate'].includes(pg.kind) && !pg.title) return;
    const isChapterHead = pg.kind === 'part' || (pg.title && pg.title.length);
    if (!isChapterHead) return;
    html += `<button class="rail__item ${spreadOf(pg.folio) === S.spread ? 'current' : ''}"
      data-folio="${pg.folio}"><span class="n">${pg.folio}</span>
      <span class="t">${esc(pg.title || pg.chapter)}${pg.eyebrow ? `<small>${esc(pg.eyebrow)}</small>` : ''}</span></button>`;
  });
  railBody.innerHTML = html;
  wireRail();
  const cur = railBody.querySelector('.current');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

let searchTimer;
async function drawSearch() {
  const q = S.q.trim();
  if (q.length < 2) {
    railBody.innerHTML = '<div class="rail__empty">Type at least two letters. Searches every page, caption and table cell.</div>';
    return;
  }
  const results = STATIC_SITE ? S.pages.map(page => {
    const haystack = searchableText([page.title, page.eyebrow, page.chapter, page.body]).toLowerCase();
    const at = haystack.indexOf(q.toLowerCase());
    if (at < 0) return null;
    const start = Math.max(0, at - 90);
    return {
      folio: page.folio, part: page.part, chapter: page.chapter,
      kind: page.kind, title: page.title,
      excerpt: `${start ? '…' : ''}${haystack.slice(start, at + 150).trim()}…`,
    };
  }).filter(Boolean).slice(0, 60)
    : (await fetch('api/search?q=' + encodeURIComponent(q)).then(r => r.json())).results;
  railBody.innerHTML = results.length ? results.map(r =>
    `<button class="rail__item" data-folio="${r.folio}"><span class="n">${r.folio}</span>
      <span class="t">${esc(r.title || r.chapter || '')}<small>${esc(r.excerpt)}</small></span></button>`).join('')
    : '<div class="rail__empty">Nothing found.</div>';
  wireRail();
}

function wireRail() {
  railBody.querySelectorAll('[data-folio]').forEach(el =>
    el.onclick = () => goFolio(parseInt(el.dataset.folio, 10)));
}

/* --- marks + persistence --------------------------------------------------- */

async function toggleMark() {
  const [, r] = spreadFor(S.spread);
  const folio = (r || spreadFor(S.spread)[0] || {}).folio;
  if (!folio) return;
  const on = S.marks.some(m => spreadOf(m.folio) === S.spread);
  if (STATIC_SITE) {
    S.marks = on
      ? S.marks.filter(mark => spreadOf(mark.folio) !== S.spread)
      : [{ folio, kind: 'bookmark', created: Date.now() }, ...S.marks];
    saveLocal();
  } else {
    const res = await fetch('api/mark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folio, kind: 'bookmark', remove: on }),
    }).then(r => r.json());
    S.marks = res.marks;
  }
  $('btn-mark').setAttribute('aria-pressed', !on);
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (STATIC_SITE) { saveLocal(); return; }
    fetch('api/reading', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spread: S.spread, flow: S.flow ? '1' : '', draft: S.draft,
        rail: S.rail ? '1' : '', railMode: S.railMode, query: S.q,
        scroll: S.flow ? stage.scrollTop : 0,
      }),
    }).catch(() => {});
  }, 600);
}

function setFlow(on) {
  S.flow = true;
  $('btn-flow').setAttribute('aria-pressed', true);
  stage.classList.add('is-flow');
  boot(false);
}

/* --- the AgentBrowser contracts -------------------------------------------- */

window.__getActiveState = () => ({
  spread: S.spread,
  folios: spreadFor(S.spread).filter(Boolean).map(p => p.folio),
  flow: S.flow, rail: S.rail, railMode: S.railMode, query: S.q,
  instrumentDraft: S.draft,
  marks: S.marks.map(m => m.folio),
  scroll: S.flow ? stage.scrollTop : 0,
});

window.__restoreState = (snap) => {
  if (!snap) return;
  if (typeof snap.instrumentDraft === 'string') S.draft = snap.instrumentDraft;
  S.flow = true;
  stage.classList.add('is-flow');
  $('btn-flow').setAttribute('aria-pressed', true);
  if (typeof snap.spread === 'number') S.spread = snap.spread;
  if (S.flow) {
    paintFlow();
    requestAnimationFrame(() => { stage.scrollTop = snap.scroll || 0; });
  }
  else paint(false);
  if (typeof snap.query === 'string') { S.q = snap.query; $('q').value = snap.query; }
  if (snap.rail) openRail(snap.railMode);
  else closeRail();
};

window.__actions = {
  goToPage: {
    description: 'Turn to a page by its folio number (1–250).',
    params: { folio: 'integer — the printed page number' },
    execute: ({ folio }) => { goFolio(parseInt(folio, 10)); return { spread: S.spread }; },
  },
  nextSpread: {
    description: 'Turn to the next spread.', params: {},
    execute: () => { go(S.spread + 1); return { spread: S.spread }; },
  },
  previousSpread: {
    description: 'Turn back one spread.', params: {},
    execute: () => { go(S.spread - 1); return { spread: S.spread }; },
  },
  search: {
    description: 'Search the full text of the issue and open the results rail.',
    params: { query: 'string — words to look for' },
    execute: ({ query }) => { S.q = query; $('q').value = query; openRail('search'); return { query }; },
  },
  openContents: {
    description: 'Open the contents rail.', params: {},
    execute: () => { openRail('contents'); return { open: true }; },
  },
  openMarks: {
    description: 'List every bookmarked page.', params: {},
    execute: () => { openRail('marks'); return { marks: S.marks.map(m => m.folio) }; },
  },
  toggleBookmark: {
    description: 'Bookmark or un-bookmark the spread currently open.', params: {},
    execute: async () => { await toggleMark(); return { marks: S.marks.map(m => m.folio) }; },
  },
  setReadingMode: {
    description: 'Switch between spread paging and continuous scroll.',
    params: { mode: '"spread" or "flow"' },
    execute: ({ mode }) => { setFlow(mode === 'flow'); return { flow: S.flow }; },
  },
  measureClarity: {
    description: 'Score a passage for readability using the issue\'s own instrument.',
    params: { text: 'string — the passage to score' },
    execute: async ({ text }) => STATIC_SITE ? scoreText(text) : fetch('api/readability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(r => r.json()),
  },
  listChapters: {
    description: 'Return every chapter with its opening folio.', params: {},
    execute: () => S.pages.filter(p => p.kind === 'part' || (p.chapter && p.title === p.chapter))
      .map(p => ({ folio: p.folio, part: p.part, title: p.title })),
  },
};

/* --- boot ------------------------------------------------------------------ */

async function boot(fresh = true) {
  if (fresh) {
    const data = await fetch(STATIC_SITE ? 'data/issue.json' : 'api/issue').then(r => r.json());
    const local = loadLocal();
    Object.assign(S, {
      pages: data.pages, sources: data.sources, plates: data.plates,
      marks: local.marks || data.marks || [], reading: local.reading || data.reading || {},
    });
    if (data.reading.draft) S.draft = data.reading.draft;
    if (data.reading.spread) S.spread = parseInt(data.reading.spread, 10) || 0;
    S.flow = true; stage.classList.add('is-flow'); $('btn-flow').setAttribute('aria-pressed', true);
    if (data.reading.query) { S.q = data.reading.query; $('q').value = S.q; }
  }
  if (S.flow) {
    paintFlow();
    requestAnimationFrame(() => {
      if (fresh) {
        stage.scrollTop = parseInt(S.reading.scroll || '0', 10);
      } else {
        const current = spreadEl.querySelector(`[data-spread="${S.spread}"]`);
        if (current) current.scrollIntoView({ block: 'start' });
      }
    });
  } else paint(false);
}

function fitPage() {
  document.documentElement.style.setProperty('--page-h', 'auto');
  document.documentElement.style.setProperty('--page-w', '100%');
}

addEventListener('resize', fitPage);
fitPage();

let flowScrollTimer;
stage.addEventListener('scroll', () => {
  if (!S.flow) return;
  clearTimeout(flowScrollTimer);
  flowScrollTimer = setTimeout(() => {
    const candidates = [...spreadEl.querySelectorAll('[data-spread]')];
    const nearest = candidates
      .map(el => ({ el, d: Math.abs(el.getBoundingClientRect().top - 72) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest) {
      S.spread = parseInt(nearest.el.dataset.spread, 10);
      const [, right] = spreadFor(S.spread);
      const left = spreadFor(S.spread)[0];
      const current = right || left;
      if (current) $('running').textContent = current.chapter || current.part || 'Plain English';
    }
    save();
  }, 120);
}, { passive: true });

$('next').onclick = () => go(S.spread + 1);
$('prev').onclick = () => go(S.spread - 1);
$('btn-contents').onclick = () => S.rail && S.railMode === 'contents' ? closeRail() : openRail('contents');
$('btn-search').onclick = () => openRail('search');
$('btn-mark').onclick = toggleMark;
$('btn-flow').onclick = () => setFlow(true);
$('rail-close').onclick = closeRail;
$('scrim').onclick = closeRail;
$('q').oninput = (e) => {
  S.q = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { drawSearch(); save(); }, 180);
};
$('q').onfocus = () => { S.railMode = 'search'; $('rail-title').textContent = 'Search'; };

addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === 'Escape') { closeRail(); document.activeElement.blur(); return; }
  if (typing) return;
  if (e.key === '/') { e.preventDefault(); openRail('search'); return; }
  if (e.key === 'ArrowRight' || e.key === 'k') { e.preventDefault(); go(S.spread + 1); }
  if (e.key === 'ArrowLeft' || e.key === 'j') { e.preventDefault(); go(S.spread - 1); }
  if (e.key === 'c' || e.key === 'C') openRail('contents');
  if (e.key === 'b' || e.key === 'B') toggleMark();
  if (e.key === 'm' || e.key === 'M') openRail('marks');
  if (e.key === 'f' || e.key === 'F') setFlow(true);
  if (e.key === 'Home') go(0);
  if (e.key === 'End') go(spreadCount() - 1);
});

if (!STATIC_SITE && window.io) {
  const socket = io();
  socket.on('marks', (m) => { S.marks = m; if (S.railMode === 'marks' && S.rail) drawRail(); });
  socket.on('datachange', () => boot(true));
}
addEventListener('agentbrowser:datachange', () => boot(true));

window.__agentbrowserReady = boot().catch((error) => {
  console.error('Plain English failed to start', error);
  spreadEl.innerHTML = `<section class="site-start-error">
    <span class="eyebrow">Plain English</span>
    <h1>We could not load the stories.</h1>
    <p>Please reopen the project. If the problem continues, the content service may be unavailable.</p>
  </section>`;
  throw error;
});

})();
