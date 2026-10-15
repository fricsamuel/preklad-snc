#!/usr/bin/env python3
# Použití: dej tento soubor do složky s zpevnik.js a style.css a spusť:  python3 patch.py
import sys, pathlib
js = pathlib.Path("zpevnik.js"); css = pathlib.Path("style.css")
s = js.read_text(encoding="utf-8")
if "// ---- nezhasínání displeje" in s:
    sys.exit("zpevnik.js už je upravený.")

# 1) transpozice se pamatuje u každé písničky
a = 'await loadSongs(); const m = $("#main"), qv = norm($("#q").value.trim());'
assert a in s, "nenašel jsem řádek v renderSongs()"
s = s.replace(a, a + '''
    $("#pr").hidden = !S.song || !!S.edit;
    if (S.song) {
        if (S.trFor !== S.song) { S.tr = +ls("tr_" + S.song) || 0; S.trFor = S.song }
        else ls("tr_" + S.song, S.tr);
    } else S.trFor = null;''', 1)

# 2) při změně adresy (zpět/vpřed) načíst transpozici znovu
b = 'S.song = so ? so.id : null; S.edit = null;'
assert b in s, "nenašel jsem řádek v routeFromUrl()"
s = s.replace(b, 'S.trFor = null; ' + b, 1)

# 3) wake lock + tisk na konec
s = s.rstrip("\n") + '''

// ---- nezhasínání displeje (Wake Lock) ----
let wl = null;
const wkSync = () => $("#wk").classList.toggle("on", !!wl);
async function wake(on) {
    try {
        if (on) {
            wl = await navigator.wakeLock.request("screen");
            wl.addEventListener("release", () => { wl = null; wkSync() });
        } else { await wl?.release(); wl = null }
    } catch (e) { wl = null }
    wkSync();
}
$("#wk").onclick = async () => { const on = !wl; await wake(on); ls("wake", on ? "1" : "0") };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && ls("wake") === "1" && !wl) wake(true) });
if (ls("wake") === "1") wake(true);
if (!("wakeLock" in navigator)) $("#wk").hidden = true;

// ---- tisk ----
$("#pr").onclick = () => window.print();
'''
js.write_text(s, encoding="utf-8")

c = '''
/* ---- nezhasínání + tisk ---- */
#wk.on { background: var(--acc); color: var(--bg); border-color: var(--acc) }
@media print {
    header, nav, #bd, .ed, .pres, .tp, .prb, .toast, .cdpop, button, .btn, .info { display: none !important }
    html, body, .wrap, main, article { background: #fff !important; color: #000 !important; margin: 0; padding: 0; display: block; max-width: none }
    :root { --ink: #000; --bg: #fff; --ch: #000; --mute: #000 }
    .cc { color: #000 !important; background: none !important; outline: none !important }
    pre.song { font-size: 14pt }
}
'''
css.write_text((css.read_text(encoding="utf-8") if css.exists() else "") + c, encoding="utf-8")
print("Hotovo: zpevnik.js a style.css upraveny.")
