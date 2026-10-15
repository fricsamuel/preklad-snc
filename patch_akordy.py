#!/usr/bin/env python3
# Přesouvání akordů: podrž akord ~0,6 s a táhni doleva/doprava, po puštění se uloží (jako tlačítko Uložit).
# Lze spustit na čistém souboru i na souboru, kde už je starší verze této úpravy (ta se nahradí).
# Použití: ve složce s zpevnik.js a style.css spusť:  python3 patch_akordy.py
import re, sys, pathlib
js = pathlib.Path("zpevnik.js"); css = pathlib.Path("style.css")
s = js.read_text(encoding="utf-8")
START = "// ---- přesouvání akordů"
END = "// ---- /přesouvání akordů"
OLD_END = 'mvToast("Nepodařilo se uložit: " + err.message) }\n});'

# 1) songHTML: každý řádek do <span class="ln">, akordy dostanou data-l/data-k/data-c (jen pokud ještě není)
if "const chordsL" not in s:
    new_song = r'''const chordsL = (h, n, li) => { let k = 0; return h.replace(/\[([^\]\s][^\]]{0,10})\]([^\s\[]*)/g, (m, c, b) => { const t = n ? tchord(c, n) : c; return `<span class="cw" data-l="${li}" data-k="${k++}" data-c="${c}"><span${b ? "" : ' class="ph"'}>${b || "\u00a0"}</span><span class="cc" data-chord="${t}">${t}</span></span>` }) };
function songHTML(t, n) { let o = "", li = 0; for (const l of t.replace(/\r/g, "").split("\n")) { const m = l.match(/^\s*\{([^}]+)\}\s*$/); o += m ? `<span class="sec">${esc(secLabel(m[1].trim()))}</span>` : `<span class="ln" data-l="${li}">${chordsL(esc(l), n, li)}\n</span>`; li++ } return o }'''
    s, cnt = re.subn(r'^function songHTML\(t, n\) \{.*$', lambda m: new_song, s, count=1, flags=re.M)
    if cnt != 1: sys.exit("nenašel jsem funkci songHTML v zpevnik.js")

# 2) odstranit starší verzi bloku (pokud je)
a = s.find(START)
if a >= 0:
    if END in s: b = s.index(END) + len(END)
    elif OLD_END in s: b = s.index(OLD_END) + len(OLD_END)
    else: sys.exit("starší blok přesouvání akordů nemá rozpoznatelný konec, uprav ho ručně")
    s = (s[:a].rstrip("\n") + "\n" + s[b:].lstrip("\n")).rstrip("\n") + "\n"

# 3) nový blok na konec
s = s.rstrip("\n") + '\n\n' + r'''// ---- přesouvání akordů (podržet ~0,6 s a táhnout; po puštění se uloží) ----
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
function caretRect(c) {
    const r = document.createRange(), L = c.n.data.length, o = Math.min(c.o, L);
    r.setStart(c.n, o); r.collapse(true); let b = r.getClientRects()[0];
    if (b && (b.height || b.width)) return { x: b.left, y: b.top, h: b.height };
    if (o > 0) { r.setStart(c.n, o - 1); r.setEnd(c.n, o); b = r.getClientRects()[0]; if (b) return { x: b.right, y: b.top, h: b.height } }
    if (o < L) { r.setStart(c.n, o); r.setEnd(c.n, o + 1); b = r.getClientRects()[0]; if (b) return { x: b.left, y: b.top, h: b.height } }
    return null
}
function mvToast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2800) }
let mv = null, noClick = false, ghost = null;
function mvBegin(el, x, y, touch) {
    if (S.edit || S.pres) return;
    const cw = el.parentElement, ln = cw.closest(".ln");
    mv = { el, cw, ln, x0: x, y0: y, on: false, li: +cw.dataset.l, k: +cw.dataset.k, p: null, touch: !!touch };
    mv.t = setTimeout(mvStart, HOLD)
}
function mvStart() {
    const m = mv; if (!m) return;
    const s = songs.find(x => x.id === S.song); if (!s) { mv = null; return }
    const raw = s.text.replace(/\r/g, "").split("\n"), cs = lineParts(raw[m.li] || "").cs;
    if (!cs[m.k] || cs[m.k].c !== m.cw.dataset.c) { mv = null; mvToast("Tenhle akord nejde přesunout (zobrazený text se liší od uloženého)."); return }
    const tr = m.cw.firstElementChild.getBoundingClientRect(), cr = m.el.getBoundingClientRect();
    m.dy = (tr.top + tr.height / 2) - (cr.top + cr.height / 2);
    m.sid = s.id; m.raw0 = raw; m.on = true;
    ghost = document.createElement("div"); ghost.className = "mvghost"; ghost.style.display = "none";
    const lb = document.createElement("span"); lb.textContent = m.el.textContent; ghost.appendChild(lb); document.body.appendChild(ghost);
    m.el.classList.add("mv"); document.body.classList.add("mvg"); if (navigator.vibrate) navigator.vibrate(25)
}
function mvMove(x, y) {
    if (!mv) return false;
    if (!mv.on) { if (Math.hypot(x - mv.x0, y - mv.y0) > 10) { clearTimeout(mv.t); mv = null } return false }
    const pr = mv.ln.parentElement.getBoundingClientRect(), cx = Math.max(pr.left + 2, Math.min(pr.right - 2, x));
    const c = caretAt(cx, y + mv.dy), p = plainIdx(mv.ln, c); if (p == null) return true;
    mv.p = p; const b = caretRect(c);
    if (b && ghost) { ghost.style.display = "block"; ghost.style.left = b.x + "px"; ghost.style.top = b.y + "px"; ghost.style.height = b.h + "px" }
    return true
}
async function mvEnd(ok) {
    const m = mv; if (!m) return; clearTimeout(m.t); mv = null; if (!m.on) return;
    document.body.classList.remove("mvg"); m.el.classList.remove("mv"); if (ghost) { ghost.remove(); ghost = null }
    noClick = true; setTimeout(() => noClick = false, 500);
    const s = songs.find(x => x.id === m.sid); if (!ok || !s || m.p == null) return;
    const lines = m.raw0.slice(); lines[m.li] = moveChord(lines[m.li], m.k, m.p).raw;
    const nt = lines.join("\n"), old = s.text;
    if (nt === m.raw0.join("\n")) return;
    s.text = nt; renderSongs();
    try { const msg = await store("save", { ...s, text: nt }); mvToast("Akord přesunut. " + msg) }
    catch (err) { const s2 = songs.find(x => x.id === m.sid); if (s2) s2.text = old; renderSongs(); mvToast("Nepodařilo se uložit: " + err.message) }
}
const chordEl = e => e.target.closest && e.target.closest(".ln .cc");
// myš
document.addEventListener("pointerdown", e => { if (e.pointerType === "touch" || e.button) return; const el = chordEl(e); if (el) mvBegin(el, e.clientX, e.clientY) });
document.addEventListener("pointermove", e => { if (e.pointerType !== "touch" && mvMove(e.clientX, e.clientY)) e.preventDefault() });
document.addEventListener("pointerup", e => { if (e.pointerType !== "touch") mvEnd(true) });
document.addEventListener("pointercancel", e => { if (e.pointerType !== "touch") mvEnd(false) });
// dotyk (touch události: cíl se během tažení nemění, takže na telefonu funguje spolehlivě)
document.addEventListener("touchstart", e => { if (e.touches.length !== 1) { mvEnd(false); return } const el = chordEl(e); if (el) mvBegin(el, e.touches[0].clientX, e.touches[0].clientY, true) }, { passive: true });
document.addEventListener("touchmove", e => { if (!mv || !mv.touch) return; const t = e.touches[0]; if (mvMove(t.clientX, t.clientY)) e.preventDefault() }, { passive: false });
document.addEventListener("touchend", e => { if (!mv || !mv.touch) return; if (mv.on) e.preventDefault(); mvEnd(true) }, { passive: false });
document.addEventListener("touchcancel", () => { if (mv && mv.touch) mvEnd(false) });
document.addEventListener("contextmenu", e => { if (mv || (e.target.closest && e.target.closest(".ln .cc"))) e.preventDefault() });
document.addEventListener("click", e => { if (noClick) { e.stopPropagation(); e.preventDefault() } }, true);
// ---- /přesouvání akordů
'''
js.write_text(s, encoding="utf-8")

c = css.read_text(encoding="utf-8") if css.exists() else ""
if "/* ---- přesouvání akordů v2 */" not in c:
    css.write_text(c + '''
/* ---- přesouvání akordů v2 */
.cc { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none }
.cc.mv { background: var(--ch); color: var(--bg); outline: 2px solid var(--ch); border-radius: 3px }
body.mvg { user-select: none; -webkit-user-select: none }
.mvghost { position: fixed; z-index: 200; pointer-events: none; border-left: 3px solid var(--ch); width: 0 }
.mvghost span { position: absolute; bottom: 100%; left: -3px; background: var(--ch); color: var(--bg); font: 700 14px var(--sans); padding: 2px 6px; border-radius: 6px; white-space: nowrap }
''', encoding="utf-8")
print("Hotovo: zpevnik.js a style.css upraveny.")
