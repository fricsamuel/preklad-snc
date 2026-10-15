#!/usr/bin/env python3
# Přesouvání akordů: podrž akord ~0,6 s a táhni doleva/doprava, po puštění se uloží (stejně jako tlačítko Uložit).
# Použití: ve složce s zpevnik.js a style.css spusť:  python3 patch_akordy.py
import re, sys, pathlib
js = pathlib.Path("zpevnik.js"); css = pathlib.Path("style.css")
s = js.read_text(encoding="utf-8")
if "// ---- přesouvání akordů" in s:
    sys.exit("zpevnik.js už je upravený.")

# 1) songHTML: každý řádek do <span class="ln" data-l=číslo řádku>, akordy dostanou data-l/data-k/data-c
new_song = r'''const chordsL = (h, n, li) => { let k = 0; return h.replace(/\[([^\]\s][^\]]{0,10})\]([^\s\[]*)/g, (m, c, b) => { const t = n ? tchord(c, n) : c; return `<span class="cw" data-l="${li}" data-k="${k++}" data-c="${c}"><span${b ? "" : ' class="ph"'}>${b || "\u00a0"}</span><span class="cc" data-chord="${t}">${t}</span></span>` }) };
function songHTML(t, n) { let o = "", li = 0; for (const l of t.replace(/\r/g, "").split("\n")) { const m = l.match(/^\s*\{([^}]+)\}\s*$/); o += m ? `<span class="sec">${esc(secLabel(m[1].trim()))}</span>` : `<span class="ln" data-l="${li}">${chordsL(esc(l), n, li)}\n</span>`; li++ } return o }'''
s, cnt = re.subn(r'^function songHTML\(t, n\) \{.*$', lambda m: new_song, s, count=1, flags=re.M)
if cnt != 1: sys.exit("nenašel jsem funkci songHTML v zpevnik.js")

# 2) logika přesouvání na konec
s = s.rstrip("\n") + '\n' + r'''

// ---- přesouvání akordů (podržet ~0,6 s a táhnout; po puštění se uloží) ----
const HOLD = 600;
function lineParts(raw) { const re = /\[([^\]\s][^\]]{0,10})\]/g; let plain = "", last = 0, m; const cs = []; while ((m = re.exec(raw))) { plain += raw.slice(last, m.index); cs.push({ c: m[1], p: plain.length }); last = m.index + m[0].length } plain += raw.slice(last); return { plain, cs } }
function lineBuild(plain, cs) { let o = "", pos = 0; for (const x of cs) { o += plain.slice(pos, x.p) + "[" + x.c + "]"; pos = x.p } return o + plain.slice(pos) }
function moveChord(raw, k, p) { const { plain, cs } = lineParts(raw); const x = cs.splice(k, 1)[0]; x.p = Math.max(0, Math.min(plain.length, p)); let i = cs.findIndex(y => y.p > x.p); if (i < 0) i = cs.length; cs.splice(i, 0, x); return { raw: lineBuild(plain, cs), k: i } }
function caretAt(x, y) { let n, o; if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) { n = c.offsetNode; o = c.offset } } else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { n = r.startContainer; o = r.startOffset } } return n ? { n, o } : null }
function plainIdx(ln, c) {
    if (!c || c.n.nodeType !== 3 || !ln.contains(c.n)) return null;
    const w = document.createTreeWalker(ln, NodeFilter.SHOW_TEXT); let t = 0, nd;
    while ((nd = w.nextNode())) {
        const pe = nd.parentElement; if (pe.closest(".cc")) { if (nd === c.n) return null; continue }
        const ph = pe.closest(".ph"), len = ph ? 0 : nd.data.replace(/\n/g, "").length;
        if (nd === c.n) return t + (ph ? 0 : Math.min(c.o, len));
        t += len
    }
    return null
}
function mvToast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2800) }
let mv = null, noClick = false;
function startMv() {
    const m = mv; if (!m) return;
    const s = songs.find(x => x.id === S.song); if (!s) { mv = null; return }
    const raw = s.text.replace(/\r/g, "").split("\n"), cs = lineParts(raw[m.li] || "").cs;
    if (!cs[m.k] || cs[m.k].c !== m.cw.dataset.c) { mv = null; mvToast("Tenhle akord nejde přesunout (zobrazený text se liší od uloženého)."); return }
    const tr = m.cw.firstElementChild.getBoundingClientRect(), cr = m.el.getBoundingClientRect();
    m.dy = (tr.top + tr.height / 2) - (cr.top + cr.height / 2);
    m.sid = s.id; m.raw0 = raw; m.lines = raw.slice(); m.on = true;
    m.el.classList.add("mv"); document.body.classList.add("mvg"); if (navigator.vibrate) navigator.vibrate(25)
}
document.addEventListener("pointerdown", e => {
    if (e.button || S.edit || S.pres) return;
    const el = e.target.closest && e.target.closest(".ln .cc"); if (!el) return;
    const cw = el.parentElement, ln = cw.closest(".ln");
    mv = { el, cw, ln, x0: e.clientX, y0: e.clientY, on: false, li: +cw.dataset.l, k: +cw.dataset.k, last: null };
    mv.t = setTimeout(startMv, HOLD)
});
document.addEventListener("pointermove", e => {
    if (!mv) return;
    if (!mv.on) { if (Math.hypot(e.clientX - mv.x0, e.clientY - mv.y0) > 10) { clearTimeout(mv.t); mv = null } return }
    e.preventDefault();
    const pr = mv.ln.parentElement.getBoundingClientRect(), x = Math.max(pr.left + 2, Math.min(pr.right - 2, e.clientX));
    const p = plainIdx(mv.ln, caretAt(x, e.clientY + mv.dy)); if (p == null || p === mv.last) return; mv.last = p;
    const r = moveChord(mv.lines[mv.li], mv.k, p); if (r.raw === mv.lines[mv.li]) return;
    mv.lines[mv.li] = r.raw; mv.k = r.k;
    mv.ln.innerHTML = chordsL(esc(r.raw), S.tr, mv.li) + "\n";
    mv.el = mv.ln.querySelector(`.cw[data-k="${r.k}"] .cc`); if (mv.el) mv.el.classList.add("mv"); mv.cw = mv.el && mv.el.parentElement
}, { passive: false });
document.addEventListener("touchmove", e => { if (mv && mv.on) e.preventDefault() }, { passive: false });
document.addEventListener("contextmenu", e => { if (mv || (e.target.closest && e.target.closest(".ln .cc"))) e.preventDefault() });
document.addEventListener("click", e => { if (noClick) { e.stopPropagation(); e.preventDefault() } }, true);
document.addEventListener("pointercancel", () => { const m = mv; if (!m) return; clearTimeout(m.t); mv = null; if (m.on) { document.body.classList.remove("mvg"); renderSongs() } });
document.addEventListener("pointerup", async () => {
    const m = mv; if (!m) return; clearTimeout(m.t); mv = null; if (!m.on) return;
    document.body.classList.remove("mvg"); noClick = true; setTimeout(() => noClick = false, 400);
    const s = songs.find(x => x.id === m.sid); if (!s) return;
    const nt = m.lines.join("\n"), old = s.text;
    if (nt === m.raw0.join("\n")) { renderSongs(); return }
    s.text = nt; renderSongs();
    try { const msg = await store("save", { ...s, text: nt }); mvToast("Akord přesunut. " + msg) }
    catch (err) { const s2 = songs.find(x => x.id === m.sid); if (s2) s2.text = old; renderSongs(); mvToast("Nepodařilo se uložit: " + err.message) }
});
'''
js.write_text(s, encoding="utf-8")

css.write_text((css.read_text(encoding="utf-8") if css.exists() else "") + '''
/* ---- přesouvání akordů ---- */
.cc { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none }
.cc.mv { background: var(--ch); color: var(--bg); outline: 2px solid var(--ch); border-radius: 3px }
body.mvg { user-select: none; -webkit-user-select: none; cursor: ew-resize }
''', encoding="utf-8")
print("Hotovo: zpevnik.js a style.css upraveny.")
