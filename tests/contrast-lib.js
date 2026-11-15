/* WCAG contrast audit that runs inside the page. For every visible element that directly owns text it computes the
   text colour, the effective background (compositing translucent layers up the tree) and the ratio between them. */
module.exports.AUDIT_FN = () => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
  const over = (top, bot) => { const a = top.a + bot.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
  const root = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const page = parse(getComputedStyle(document.body).backgroundColor);
  const base = over(page && page.a ? page : { r: 0, g: 0, b: 0, a: 0 }, root.a ? root : { r: 255, g: 255, b: 255, a: 1 });
  const bgOf = el => { const chain = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { chain.push(c); if (c.a >= 1) break; } }
    let acc = base.a ? base : { r: 255, g: 255, b: 255, a: 1 }; for (let i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc); return acc; };
  const visible = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; }
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const out = [];
  const open = [...document.querySelectorAll('.modal.open,.overlay.open')].filter(visible);
  const scope = open.length ? open[open.length - 1] : document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n; (n = walker.nextNode());) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length < 2 || !/[A-Za-z0-9]/.test(t)) continue;
    const el = n.parentElement; if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'OPTION', 'CANVAS'].includes(el.tagName) || !visible(el)) continue; seen.add(el);
    const fg0 = parse(getComputedStyle(el).color); if (!fg0) continue;
    const bg = bgOf(el); const fg = over(fg0, bg);
    const fs = parseFloat(getComputedStyle(el).fontSize), bold = parseInt(getComputedStyle(el).fontWeight) >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const r = ratio(fg, bg);
    out.push({ ratio: +r.toFixed(2), large, text: t.slice(0, 28), sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), fs });
  }
  return out;
};
