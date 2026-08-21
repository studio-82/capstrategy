/* ==========================================================================
   PLATES — the SVG engine.
   Charts follow one rule set: thin marks, recessive grid, a legend whenever
   two or more series run, selective direct labels, a table fallback for every
   figure, and hues assigned in fixed order — never cycled, never by rank.
   ========================================================================== */

const SERIES = ['#c0392b', '#1e88a8', '#d89b0a', '#2e7d4f', '#8e5bb5', '#b3541e'];
const GRID = '#cbc2ab';
const INK = '#171512';
const FAINT = '#7c7364';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmt = (n, unit) => {
  if (unit === '%') return n + '%';
  if (unit === '$m') return '$' + n + 'm';
  if (unit === '$b') return '$' + n + 'b';
  if (unit === 'x') return n + '×';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US');
  return String(n);
};

/* --- shared furniture ---------------------------------------------------- */

function legend(names) {
  if (names.length < 2) return '';
  return `<div class="figure__legend">${names.map((n, i) =>
    `<span><i style="background:${SERIES[i % 6]}"></i>${esc(n)}</span>`).join('')}</div>`;
}

function tableFallback(cols, rows) {
  return `<table class="data"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map(r => `<tr>${r.map((c, i) =>
      `<td class="${i ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function wrap(block, svg, extra = '') {
  return `<figure class="figure">
    ${block.head ? `<figcaption class="figure__head">${esc(block.head)}</figcaption>` : ''}
    ${block.sub ? `<div class="figure__sub">${esc(block.sub)}</div>` : ''}
    ${extra}${svg}
    ${block.foot ? `<div class="figure__foot">${block.foot}</div>` : ''}
  </figure>`;
}

/* --- horizontal bars: magnitude across named things ---------------------- */

function hbar(b) {
  const d = b.data, unit = b.unit || '';
  const max = Math.max(...d.map(r => Math.abs(r.v))) || 1;
  const rowH = 26, padL = Math.min(190, 8 * Math.max(...d.map(r => r.k.length)) + 10);
  const W = 620, H = d.length * rowH + 16, barW = W - padL - 74;
  const bars = d.map((r, i) => {
    const w = Math.max(2, Math.abs(r.v) / max * barW);
    const y = i * rowH + 4;
    const col = r.hl ? SERIES[0] : (b.mono ? '#3d5a73' : SERIES[i % 6]);
    return `<g>
      <text x="${padL - 8}" y="${y + 13}" text-anchor="end" class="axis" style="font-size:10px;fill:${INK}">${esc(r.k)}</text>
      <rect x="${padL}" y="${y + 2}" width="${w}" height="14" rx="4" fill="${col}"
            stroke="#e9e4d4" stroke-width="2"><title>${esc(r.k)}: ${fmt(r.v, unit)}</title></rect>
      <text x="${padL + w + 7}" y="${y + 13}" class="val-label">${fmt(r.v, unit)}</text>
    </g>`;
  }).join('');
  return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.head || 'chart')}">
    <line x1="${padL}" y1="0" x2="${padL}" y2="${H - 12}" stroke="${GRID}" stroke-width=".75"/>${bars}</svg>`,
    '');
}

/* --- columns over an ordered axis ---------------------------------------- */

function column(b) {
  const d = b.data, unit = b.unit || '';
  const W = 620, H = 240, padL = 46, padB = 34, padT = 18;
  const max = Math.max(...d.map(r => r.v)) * 1.12 || 1;
  const min = Math.min(0, ...d.map(r => r.v));
  const plotW = W - padL - 16, plotH = H - padB - padT;
  const x = i => padL + (i + 0.5) * (plotW / d.length);
  const y = v => padT + plotH - ((v - min) / (max - min)) * plotH;
  const cw = Math.min(46, plotW / d.length * 0.62);
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map(f => min + (max - min) * f);
  return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.head || 'chart')}">
    ${ticksY.map(t => `<line class="gridline" x1="${padL}" x2="${W - 16}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="axis" x="${padL - 8}" y="${y(t) + 3}" text-anchor="end">${fmt(Math.round(t), unit)}</text>`).join('')}
    ${d.map((r, i) => {
      const col = r.hl ? SERIES[0] : (b.mono ? '#3d5a73' : SERIES[i % 6]);
      const h = Math.abs(y(r.v) - y(0));
      return `<g><rect x="${x(i) - cw / 2}" y="${Math.min(y(r.v), y(0))}" width="${cw}" height="${Math.max(2, h)}"
        rx="4" fill="${col}" stroke="#e9e4d4" stroke-width="2"><title>${esc(r.k)}: ${fmt(r.v, unit)}</title></rect>
        <text class="val-label" x="${x(i)}" y="${y(r.v) - 6}" text-anchor="middle">${fmt(r.v, unit)}</text>
        <text class="axis" x="${x(i)}" y="${H - 14}" text-anchor="middle">${esc(r.k)}</text></g>`;
    }).join('')}
    <line x1="${padL}" x2="${W - 16}" y1="${y(0)}" y2="${y(0)}" stroke="${GRID}" stroke-width=".75"/></svg>`);
}

/* --- lines over time ------------------------------------------------------ */

function line(b) {
  const series = b.data, unit = b.unit || '';
  const labels = b.labels || [];
  const W = 620, H = 250, padL = 48, padB = 32, padT = 16, padR = 92;
  const all = series.flatMap(s => s.v);
  const max = Math.max(...all) * 1.08, min = Math.min(0, ...all);
  const plotW = W - padL - padR, plotH = H - padB - padT;
  const x = i => padL + (i / Math.max(1, labels.length - 1)) * plotW;
  const y = v => padT + plotH - ((v - min) / (max - min || 1)) * plotH;
  const gridY = [0, 0.25, 0.5, 0.75, 1].map(f => min + (max - min) * f);
  const paths = series.map((s, si) => {
    const col = SERIES[si % 6];
    const dstr = s.v.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const pts = s.v.map((v, i) =>
      `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${col}" stroke="#e9e4d4" stroke-width="2">
        <title>${esc(s.k)} — ${esc(labels[i])}: ${fmt(v, unit)}</title></circle>`).join('');
    const last = s.v.length - 1;
    return `<path d="${dstr}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>${pts}
      <text class="series-label" x="${x(last) + 9}" y="${y(s.v[last]) + 3}" fill="${col}">${esc(s.k)}</text>`;
  }).join('');
  return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.head || 'chart')}">
    ${gridY.map(t => `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="axis" x="${padL - 8}" y="${y(t) + 3}" text-anchor="end">${fmt(Math.round(t), unit)}</text>`).join('')}
    ${labels.map((l, i) => `<text class="axis" x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(l)}</text>`).join('')}
    ${paths}</svg>`, legend(series.map(s => s.k)));
}

/* --- stacked composition -------------------------------------------------- */

function stack(b) {
  const d = b.data, keys = b.keys, unit = b.unit || '%';
  const W = 620, rowH = 34, H = d.length * rowH + 12, padL = Math.min(150, 8 * Math.max(...d.map(r => r.k.length)) + 8);
  const barW = W - padL - 20;
  const rows = d.map((r, i) => {
    const total = keys.reduce((a, k) => a + (r[k] || 0), 0) || 1;
    let cx = padL;
    const segs = keys.map((k, ki) => {
      const w = (r[k] || 0) / total * barW;
      const seg = `<rect x="${cx}" y="${i * rowH + 8}" width="${Math.max(0, w - 2)}" height="17"
        fill="${SERIES[ki % 6]}" stroke="#e9e4d4" stroke-width="2" rx="${ki === 0 || ki === keys.length - 1 ? 4 : 0}">
        <title>${esc(r.k)} — ${esc(k)}: ${fmt(r[k], unit)}</title></rect>
        ${w > 42 ? `<text x="${cx + w / 2 - 1}" y="${i * rowH + 20}" text-anchor="middle" class="val-label"
          style="fill:#fff">${fmt(r[k], unit)}</text>` : ''}`;
      cx += w;
      return seg;
    }).join('');
    return `<text x="${padL - 8}" y="${i * rowH + 21}" text-anchor="end" class="axis"
      style="font-size:10px;fill:${INK}">${esc(r.k)}</text>${segs}`;
  }).join('');
  return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.head || 'chart')}">${rows}</svg>`,
    legend(keys));
}

/* --- dot plot: two states, one row per item ------------------------------- */

function dot(b) {
  const d = b.data, unit = b.unit || '';
  const W = 620, rowH = 28, H = d.length * rowH + 26, padL = Math.min(170, 8 * Math.max(...d.map(r => r.k.length)) + 8);
  const plotW = W - padL - 60;
  const max = Math.max(...d.flatMap(r => [r.a, r.b])) * 1.05 || 1;
  const x = v => padL + (v / max) * plotW;
  const rows = d.map((r, i) => {
    const y = i * rowH + 20;
    return `<line x1="${x(r.a)}" x2="${x(r.b)}" y1="${y}" y2="${y}" stroke="${GRID}" stroke-width="2"/>
      <circle cx="${x(r.a)}" cy="${y}" r="5.5" fill="${SERIES[1]}" stroke="#e9e4d4" stroke-width="2">
        <title>${esc(r.k)} — ${esc(b.aName)}: ${fmt(r.a, unit)}</title></circle>
      <circle cx="${x(r.b)}" cy="${y}" r="5.5" fill="${SERIES[0]}" stroke="#e9e4d4" stroke-width="2">
        <title>${esc(r.k)} — ${esc(b.bName)}: ${fmt(r.b, unit)}</title></circle>
      <text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="axis"
        style="font-size:10px;fill:${INK}">${esc(r.k)}</text>
      <text x="${Math.max(x(r.a), x(r.b)) + 10}" y="${y + 4}" class="val-label">${fmt(r.b, unit)}</text>`;
  }).join('');
  return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.head || 'chart')}">${rows}</svg>`,
    legend([b.aName, b.bName]));
}

/* --- matrix / heat grid: ordinal magnitude across two dimensions ---------- */

function matrix(b) {
  const rows = b.rows, cols = b.cols, d = b.data;
  const cw = Math.min(96, 520 / cols.length), ch = 30;
  const padL = Math.min(160, 8 * Math.max(...rows.map(r => r.length)) + 8), padT = 40;
  const W = padL + cols.length * cw + 12, H = padT + rows.length * ch + 10;
  const max = Math.max(...d.flat()) || 1;
  const cells = rows.map((r, ri) => cols.map((c, ci) => {
    const v = d[ri][ci];
    const t = v / max;
    return `<rect x="${padL + ci * cw}" y="${padT + ri * ch}" width="${cw - 2}" height="${ch - 2}"
      fill="${SERIES[3]}" fill-opacity="${(0.12 + t * 0.85).toFixed(2)}" stroke="#e9e4d4" stroke-width="2">
      <title>${esc(r)} × ${esc(c)}: ${v}</title></rect>
      <text x="${padL + ci * cw + (cw - 2) / 2}" y="${padT + ri * ch + 19}" text-anchor="middle"
        class="val-label" style="fill:${t > 0.55 ? '#fff' : INK}">${v}</text>`;
  }).join('')).join('');
  return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.head || 'matrix')}">
    ${cols.map((c, ci) => `<text class="axis" x="${padL + ci * cw + (cw - 2) / 2}" y="${padT - 10}"
      text-anchor="middle">${esc(c)}</text>`).join('')}
    ${rows.map((r, ri) => `<text class="axis" x="${padL - 8}" y="${padT + ri * ch + 19}" text-anchor="end"
      style="font-size:10px;fill:${INK}">${esc(r)}</text>`).join('')}
    ${cells}</svg>`);
}

const CHARTS = { hbar, column, line, stack, dot, matrix };

/* ==========================================================================
   DIAGRAMS — authored plates. Each one encodes an argument, not a decoration.
   ========================================================================== */

const DIAGRAMS = {

  /* engraved rosette, the security-print texture used on part openers */
  guilloche(o = {}) {
    const R = o.r || 300, cx = R, cy = R, stroke = o.stroke || '#d6cdb6';
    let d = '';
    for (let k = 0; k < (o.rings || 7); k++) {
      const a = R * (0.94 - k * 0.055), b = a * (0.60 + k * 0.045), n = 7 + k * 2;
      let pts = '';
      for (let t = 0; t <= 360; t += 1.4) {
        const rad = t * Math.PI / 180;
        const rr = a * 0.5 + b * 0.5 * Math.cos(n * rad);
        pts += `${(cx + rr * Math.cos(rad)).toFixed(1)},${(cy + rr * Math.sin(rad)).toFixed(1)} `;
      }
      d += `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width=".5" opacity="${0.9 - k * 0.08}"/>`;
    }
    return `<svg viewBox="0 0 ${R * 2} ${R * 2}" preserveAspectRatio="xMidYMid slice"
      style="width:100%;height:100%">${d}</svg>`;
  },

  /* Cap's three-sided structure, drawn as the flow of money and risk */
  threesided(b) {
    return wrap(b, `<svg viewBox="0 0 620 300" role="img" aria-label="Cap's three sides">
      <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="${INK}"/></marker>
        <marker id="arR" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#6e1622"/></marker></defs>
      ${[['Depositor', 60, 40, 'puts dollars in,<br>wants them back'],
         ['Borrower', 380, 40, 'takes the loan,<br>runs the strategy'],
         ['Underwriter', 220, 190, 'stakes own capital<br>behind the borrower']]
        .map(([n, x, y]) => `<rect x="${x}" y="${y}" width="180" height="62" fill="#f2eee1"
          stroke="${INK}" stroke-width="1"/>
          <text x="${x + 90}" y="${y + 26}" text-anchor="middle" class="series-label"
            style="font-size:13px;fill:${INK}">${n}</text>`).join('')}
      <text x="150" y="122" text-anchor="middle" class="axis">puts dollars in</text>
      <text x="470" y="122" text-anchor="middle" class="axis">takes the loan</text>
      <text x="310" y="286" text-anchor="middle" class="axis" style="fill:#6e1622">
        …and is liquidated first if the loan goes bad</text>
      <path d="M150,102 L150,180 L215,205" fill="none" stroke="${INK}" stroke-width="1.4" marker-end="url(#ar)"/>
      <path d="M470,102 L470,180 L405,205" fill="none" stroke="${INK}" stroke-width="1.4" marker-end="url(#ar)"/>
      <path d="M310,252 L310,268" fill="none" stroke="#6e1622" stroke-width="1.4" marker-end="url(#arR)"/>
      <path d="M240,40 L240,20 L560,20 L560,40" fill="none" stroke="${SERIES[3]}" stroke-width="1.4"
        stroke-dasharray="4 3" marker-end="url(#ar)"/>
      <text x="400" y="14" text-anchor="middle" class="axis" style="fill:${SERIES[3]}">
        interest flows back the other way</text>
    </svg>`);
  },

  /* Schwartz's five stages, as a staircase with the copy that fits each */
  awareness(b) {
    const stages = [
      ['Unaware', "Doesn't know the problem exists", '#c0392b'],
      ['Problem-aware', 'Feels the pain, no idea a fix exists', '#b3541e'],
      ['Solution-aware', 'Knows fixes exist, not yours', '#d89b0a'],
      ['Product-aware', 'Knows you, unconvinced', '#2e7d4f'],
      ['Most aware', 'Wants it, needs the terms', '#1e88a8'],
    ];
    const W = 620, H = 250, bw = W / 5;
    return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Five stages of awareness">
      ${stages.map(([n, s, c], i) => {
        const h = 30 + i * 38, y = H - 46 - h;
        return `<rect x="${i * bw + 6}" y="${y}" width="${bw - 12}" height="${h}" fill="${c}"
          stroke="#e9e4d4" stroke-width="2" rx="4"/>
          <text x="${i * bw + bw / 2}" y="${y - 8}" text-anchor="middle" class="series-label"
            style="fill:${c}">${n}</text>
          <foreignObject x="${i * bw + 4}" y="${H - 42}" width="${bw - 8}" height="42">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font:9px/1.25 'Avenir Next Condensed',sans-serif;
              color:${FAINT};text-align:center">${s}</div></foreignObject>`;
      }).join('')}
      <text x="8" y="18" class="axis" style="fill:${INK};font-weight:600">
        ← Cap's audience sits here          Cap's copy is written for here →</text>
    </svg>`);
  },

  /* the message house: one line, three pillars, the proof under each */
  messagehouse(b) {
    const pillars = b.pillars || [];
    const W = 620, H = 300;
    return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Message house">
      <path d="M20,86 L310,16 L600,86 Z" fill="#f2eee1" stroke="${INK}" stroke-width="1.2"/>
      <foreignObject x="90" y="44" width="440" height="40"><div xmlns="http://www.w3.org/1999/xhtml"
        style="font:600 15px/1.2 'Avenir Next Condensed',sans-serif;color:#6e1622;text-align:center">
        ${esc(b.roof || '')}</div></foreignObject>
      ${pillars.map((pl, i) => {
        const x = 26 + i * 194;
        return `<rect x="${x}" y="94" width="176" height="182" fill="none" stroke="${INK}" stroke-width="1"/>
          <rect x="${x}" y="94" width="176" height="30" fill="${SERIES[i % 6]}"/>
          <foreignObject x="${x + 4}" y="99" width="168" height="26"><div xmlns="http://www.w3.org/1999/xhtml"
            style="font:600 12px/1.1 'Avenir Next Condensed',sans-serif;color:#fff;text-align:center">
            ${esc(pl.h)}</div></foreignObject>
          <foreignObject x="${x + 8}" y="130" width="160" height="142"><div xmlns="http://www.w3.org/1999/xhtml"
            style="font:10px/1.4 'Avenir Next Condensed',sans-serif;color:${INK}">
            ${pl.proof.map(t => `<div style="margin-bottom:6px;padding-left:9px;border-left:2px solid ${SERIES[i % 6]}">${esc(t)}</div>`).join('')}
          </div></foreignObject>`;
      }).join('')}
    </svg>`);
  },

  /* the ladder of abstraction — how a sentence climbs away from the reader */
  ladder(b) {
    const rungs = b.rungs || [];
    const W = 620, rh = 40, H = rungs.length * rh + 24;
    return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ladder of abstraction">
      ${rungs.map((r, i) => {
        const y = i * rh + 12, t = i / Math.max(1, rungs.length - 1);
        return `<rect x="0" y="${y}" width="${W}" height="${rh - 6}" fill="${SERIES[0]}"
            fill-opacity="${(0.05 + t * 0.24).toFixed(2)}"/>
          <text x="10" y="${y + 21}" class="series-label" style="fill:${FAINT};font-size:9px">
            ${i === 0 ? 'CONCRETE' : i === rungs.length - 1 ? 'ABSTRACT' : ''}</text>
          <foreignObject x="86" y="${y + 2}" width="${W - 96}" height="${rh - 8}">
            <div xmlns="http://www.w3.org/1999/xhtml"
              style="font:${13 - i}px/1.3 'Iowan Old Style',Georgia,serif;color:${INK}">${r}</div>
          </foreignObject>`;
      }).join('')}</svg>`);
  },

  /* the 95-5 disc: who is in-market right now */
  ninetyfive(b) {
    return wrap(b, `<svg viewBox="0 0 620 210" role="img" aria-label="The 95-5 rule">
      <rect x="10" y="20" width="580" height="120" fill="${SERIES[1]}" fill-opacity=".16" stroke="${SERIES[1]}"/>
      <rect x="10" y="20" width="29" height="120" fill="${SERIES[0]}"/>
      <text x="24" y="160" text-anchor="middle" class="series-label" style="fill:${SERIES[0]}">5%</text>
      <text x="24" y="174" text-anchor="middle" class="axis">in market</text>
      <text x="315" y="160" text-anchor="middle" class="series-label" style="fill:${SERIES[1]}">95%</text>
      <text x="315" y="174" text-anchor="middle" class="axis">not buying today — but will, later</text>
      <text x="20" y="14" class="axis" style="fill:${INK};font-weight:600">EVERY BUYER OF A CREDIT PRODUCT, AT ANY MOMENT</text>
      <text x="20" y="200" class="axis">Advertising to the 5% is called demand capture. Building memory in the 95% is called brand. You need both, in ratio.</text>
    </svg>`);
  },

  /* before/after page architecture — two wireframes side by side */
  wireframe(b) {
    const draw = (spec, ox, title, tone) => {
      let y = 34, out = `<text x="${ox + 110}" y="20" text-anchor="middle" class="series-label"
        style="fill:${tone}">${esc(title)}</text>`;
      spec.forEach((s) => {
        const h = s.h || 26;
        out += `<rect x="${ox}" y="${y}" width="220" height="${h}" fill="${s.fill || '#f2eee1'}"
          stroke="${s.stroke || GRID}" stroke-width="1"/>
          <foreignObject x="${ox + 6}" y="${y + 3}" width="208" height="${h - 4}">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font:${s.big ? 600 : 400} ${s.big ? 11 : 9}px/1.2
              'Avenir Next Condensed',sans-serif;color:${s.color || INK}">${esc(s.t)}</div></foreignObject>`;
        y += h + 4;
      });
      return out;
    };
    const H = Math.max(
      b.before.reduce((a, s) => a + (s.h || 26) + 4, 60),
      b.after.reduce((a, s) => a + (s.h || 26) + 4, 60));
    return wrap(b, `<svg viewBox="0 0 620 ${H}" role="img" aria-label="Page architecture, before and after">
      ${draw(b.before, 50, b.beforeName || 'NOW', '#6e1622')}
      ${draw(b.after, 350, b.afterName || 'PROPOSED', '#0e3b2e')}
      <path d="M290,${H / 2} L330,${H / 2}" stroke="${INK}" stroke-width="1.2"
        marker-end="url(#ar2)"/>
      <defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="${INK}"/></marker></defs></svg>`);
  },

  /* four forces of switching */
  fourforces(b) {
    return wrap(b, `<svg viewBox="0 0 620 250" role="img" aria-label="The four forces of switching">
      <rect x="230" y="96" width="160" height="58" fill="#f2eee1" stroke="${INK}"/>
      <text x="310" y="130" text-anchor="middle" class="series-label" style="font-size:13px">THE SWITCH</text>
      ${[['PUSH', 20, 40, SERIES[0], b.push, 'what makes today intolerable'],
         ['PULL', 400, 40, SERIES[3], b.pull, 'what makes you attractive'],
         ['HABIT', 20, 176, SERIES[5], b.habit, 'what holds them where they are'],
         ['ANXIETY', 400, 176, SERIES[4], b.anxiety, 'what they fear about moving']]
        .map(([n, x, y, c, txt, gloss]) => `
          <text x="${x}" y="${y}" class="series-label" style="fill:${c}">${n} — ${gloss}</text>
          <foreignObject x="${x}" y="${y + 6}" width="200" height="52"><div xmlns="http://www.w3.org/1999/xhtml"
            style="font:10px/1.35 'Avenir Next Condensed',sans-serif;color:${INK};border-left:2px solid ${c};
            padding-left:7px">${esc(txt)}</div></foreignObject>`).join('')}
      <path d="M226,66 L296,96" stroke="${SERIES[0]}" stroke-width="1.4"/>
      <path d="M394,66 L324,96" stroke="${SERIES[3]}" stroke-width="1.4"/>
      <path d="M226,196 L296,154" stroke="${SERIES[5]}" stroke-width="1.4" stroke-dasharray="3 3"/>
      <path d="M394,196 L324,154" stroke="${SERIES[4]}" stroke-width="1.4" stroke-dasharray="3 3"/>
      <text x="310" y="238" text-anchor="middle" class="axis">
        Solid arrows push toward the switch. Dashed arrows push back. Most marketing only works the solid two.</text>
    </svg>`);
  },

  /* a timeline of a campaign or a collapse */
  timeline(b) {
    const ev = b.events;
    const W = 620, H = ev.length * 44 + 20;
    return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Timeline">
      <line x1="96" y1="10" x2="96" y2="${H - 16}" stroke="${GRID}" stroke-width="1.5"/>
      ${ev.map((e, i) => {
        const y = 24 + i * 44, c = e.bad ? SERIES[0] : (e.good ? SERIES[3] : '#3d5a73');
        return `<circle cx="96" cy="${y}" r="5.5" fill="${c}" stroke="#e9e4d4" stroke-width="2"/>
          <text x="84" y="${y + 4}" text-anchor="end" class="axis"
            style="font-weight:600;fill:${INK}">${esc(e.when)}</text>
          <foreignObject x="110" y="${y - 14}" width="${W - 120}" height="40">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font:10.5px/1.35 'Avenir Next Condensed',sans-serif;
              color:${INK}">${e.what}</div></foreignObject>`;
      }).join('')}</svg>`);
  },

  /* the funnel, drawn honestly — as a leaky sequence, not a smooth cone */
  funnel(b) {
    const st = b.stages.map(stage => typeof stage === 'string' ? { k: stage } : stage);
    const W = 620, H = st.length * 44 + 16;
    const measured = st.every(stage => Number.isFinite(stage.v));
    const max = measured ? st[0].v : 1;
    return wrap(b, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Funnel">
      ${st.map((s, i) => {
        const w = measured ? Math.max(30, (s.v / max) * 470) : 470 - i * 72;
        const y = i * 44 + 8;
        const drop = measured && i ? Math.round(100 - (s.v / st[i - 1].v) * 100) : null;
        const value = measured ? `<text x="${128 + w}" y="${y + 20}" class="val-label">
          ${s.v.toLocaleString('en-US')}${drop !== null
            ? `  <tspan style="fill:${SERIES[0]}">−${drop}%</tspan>` : ''}</text>` : '';
        return `<rect x="120" y="${y}" width="${w}" height="30" fill="${SERIES[i % 6]}"
            stroke="#e9e4d4" stroke-width="2" rx="4"><title>${esc(s.k)}${measured ? `: ${s.v}` : ''}</title></rect>
          <text x="112" y="${y + 20}" text-anchor="end" class="axis"
            style="font-size:10px;fill:${INK}">${esc(s.k)}</text>
          ${value}`;
      }).join('')}</svg>`);
  },
};

window.PLATES = { CHARTS, DIAGRAMS, SERIES, tableFallback, esc };
