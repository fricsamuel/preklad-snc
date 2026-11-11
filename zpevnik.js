const $ = s => document.querySelector(s), esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = s => { let o = ""; for (const c of s) { const n = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); o += n[0] || c } return o };
let S = { song: null, edit: null, msg: "", tr: 0, pop: false, p0: 0, pres: false, seq: null, pl: 2 };
const API = window.SONGS_API || "";
let songs = null;
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch (e) { return null } };

// ---- adresa písničky: /preklad-snc/jsi-kral-cz (404.html pošle neznámou adresu sem jako zpevnik.html?song=jsi-kral-cz) ----
const LANG = "-cz";                                          // přípona adresy; ať se nikdy nepotká s názvem souboru
const baseDir = location.pathname.replace(/[^/]*$/, "");     // složka se stránkami, např. "/preklad-snc/"
const slugify = t => norm(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pisnicka";
const songSlug = s => s.slug || slugify(s.title) + LANG;     // starší písničky bez uložené adresy ji dostanou z názvu
function uniqueSlug(title, id) {                             // při shodě s jinou písničkou přidá -2, -3 …
    const b = slugify(title) + LANG; let u = b, n = 2;
    while (songs.some(x => x.id !== id && songSlug(x) === u)) u = b + "-" + n++;
    return u;
}
function setUrl(song, push) {                                // song = otevřená písnička, nebo null = seznam
    document.title = song ? song.title + " – Zpěvník" : "Zpěvník";
    const url = baseDir + (song ? songSlug(song) : "zpevnik.html");
    if (location.pathname === url) return;
    history[push ? "pushState" : "replaceState"](null, "", url);
}
function routeFromUrl() {                                    // z adresy zjistí, která písnička se má otevřít
    const q = new URLSearchParams(location.search).get("song");
    const slug = q || decodeURIComponent(location.pathname.slice(baseDir.length)).replace(/\/$/, "");
    const so = slug && songs.find(x => songSlug(x) === slug);
    S.trFor = null; S.song = so ? so.id : null; S.edit = null; S.tr = 0; S.pop = false; S.pres = false;
    if (!so && q) S.msg = "Písnička „" + q + "“ nebyla nalezena.";
    setUrl(so || null, false);
}
window.addEventListener("popstate", () => { routeFromUrl(); renderSongs() });

async function fetchSongs() { try { const j = await (await fetch(API)).json(); if (Array.isArray(j)) return j } catch (e) { } return null }
async function loadSongs() {                                  // mezipaměť: nejdřív okamžitě co si pamatuje prohlížeč, pak čerstvá data z GitHubu
    if (songs) return;
    if (!API) { try { songs = JSON.parse(ls("songs") || "[]") } catch (e) { songs = [] } return }
    let cached = null; try { cached = JSON.parse(ls("songs_cache") || "null") } catch (e) { }
    const fresh = fetchSongs();
    if (Array.isArray(cached)) {
        songs = cached;
        fresh.then(j => { if (!j) return; songs = j; ls("songs_cache", JSON.stringify(j)); if (!S.edit && !S.pres) { if (S.song === null) routeFromUrl(); renderSongs() } });
    } else { songs = (await fresh) || []; if (songs.length) ls("songs_cache", JSON.stringify(songs)) }
}
async function store(act, song) {
    if (API) { const r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ act, pin: ls("pin") || "", song }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || "chyba serveru"); songs = j.songs; ls("songs_cache", JSON.stringify(songs)); return "Uloženo na GitHub." }
    if (act === "del") songs = songs.filter(x => x.id !== song.id); else { const i = songs.findIndex(x => x.id === song.id); i < 0 ? songs.push(song) : songs[i] = song }
    ls("songs", JSON.stringify(songs)); return "Uloženo jen v tomto prohlížeči (API není nastavené)."
}
const PN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, H: 11, B: 10 }, NM = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "B", "H"];
const CRE = /^([A-H])([#b]?)((?:maj|min|mi|m|M|dim|aug|sus|add|[0-9+°()\-#b])*)$/;

// ==== ZÁPIS AKORDŮ NAD ŘÁDKEM ====
// V databázi i v editoru jsou akordy na samostatném řádku NAD textem, zarovnané sloupcem nad slabiku:
//       G        C
//     Jsi Král a Pán
// Starý zápis "Jsi Kr[G]al" se pořád čte (a při úpravě písničky se převede). Vykreslování, transpozice a prezentace
// pracují s vnitřním tvarem "akord v závorkách", na který text převádí inl(); toAbove() jde opačným směrem.
const isCh = w => { const i = w.indexOf("/"), a = i < 0 ? w : w.slice(0, i); return CRE.test(a) && (i < 0 || /^[A-H](?:#|b|is|es)?\d?$/.test(w.slice(i + 1))) };   // basa za lomítkem smí být i české Fis, Es
const SEPTOK = /^(?:[|/\\:\-–]+|x\d|\dx|\(\dx\)|\(x\d\))$/;             // oddělovače na řádku akordů: | / - x2 (2x)
const REP = /^\|*:\|*$/;                                       // značky opakování na řádku akordů: |: :| ||: :||
const isChordLine = l => { const w = l.trim().split(/\s+/); return !!l.trim() && w.some(isCh) && w.every(x => isCh(x) || SEPTOK.test(x)) };
const SECLINE = /^\s*\{[^}]+\}/;
function inl(t) {
    const L = String(t).replace(/\r/g, "").split("\n"), out = [];
    for (let i = 0; i < L.length; i++) {
        const l = L[i];
        if (!isChordLine(l)) { out.push(l); continue }
        const nx = L[i + 1];
        if (nx !== undefined && nx.trim() && !SECLINE.test(nx) && !isChordLine(nx)) {      // řádek akordů + text pod ním = jeden řádek
            const lyric = nx.replace(/\s+$/, ""), re = /\S+/g; let m, o = "", p = 0;
            while ((m = re.exec(l))) if (isCh(m[0]) || REP.test(m[0])) { const c = Math.min(m.index, lyric.length); o += lyric.slice(p, c) + "[" + m[0] + "]"; p = c }
            out.push(o + lyric.slice(p)); i++;
        } else out.push(l.trim().split(/\s+/).filter(w => isCh(w) || REP.test(w)).map(c => "[" + c + "]").join(" "));   // samotné akordy (předehra, mezihra)
    }
    return out.join("\n");
}
function toAbove(t) {
    const L = String(t).replace(/\r/g, "").split("\n"), out = [], HAS = /\[[^\]]+\]/;
    for (let i = 0; i < L.length; i++) {
        const l = L[i];
        if (!HAS.test(l)) { out.push(l); continue }
        let lyric = "", cs = [], p = 0, m; const re = /\[([^\]]*)\]/g;
        while ((m = re.exec(l))) { lyric += l.slice(p, m.index); p = m.index + m[0].length; const c = m[1].trim(); if (isCh(c) || REP.test(c)) cs.push([lyric.length, c]); else lyric += m[0] }
        lyric += l.slice(p);
        const lead = lyric.length - lyric.replace(/^\s+/, "").length; lyric = lyric.trim();
        if (!lyric) {                                                // řádek jen s akordy
            out.push(cs.map(c => c[1]).join(" "));
            const nx = L[i + 1]; if (nx !== undefined && nx.trim() && !SECLINE.test(nx) && !HAS.test(nx)) out.push("");   // prázdný řádek, ať se nespojí s textem pod ním
            continue
        }
        let row = "";
        for (const [pos, ch] of cs) row = row.padEnd(Math.max(pos - lead, 0, row.length ? row.length + 1 : 0)) + ch;   // při srážce se akord posune doprava
        out.push(row, lyric);
    }
    return out.join("\n");
}
// vloží akord do editoru nad řádek, na sloupec kurzoru
function insChord(ta, ch) {
    const v = ta.value, p = ta.selectionStart, ls = v.lastIndexOf("\n", p - 1) + 1;
    let le = v.indexOf("\n", p); if (le < 0) le = v.length;
    const line = v.slice(ls, le), col = p - ls;
    if (SECLINE.test(line)) return;
    if (!line.trim() || isChordLine(line)) { ta.setRangeText(ch + " ", p, p, "end"); return }     // kurzor je na řádku akordů: prostě psát
    const ps = ls > 0 ? v.lastIndexOf("\n", ls - 2) + 1 : -1, prev = ls > 0 ? v.slice(ps, ls - 1) : "";
    if (ls > 0 && isChordLine(prev)) {
        let q = col; const fits = x => !/\S/.test(prev.slice(Math.max(0, x - 1), x + ch.length + 1));
        while (!fits(q)) q++;
        const np = (prev.padEnd(q + ch.length).slice(0, q) + ch + prev.slice(q + ch.length)).replace(/\s+$/, "");
        ta.setRangeText(np, ps, ls - 1, "preserve"); ta.selectionStart = ta.selectionEnd = p + np.length - prev.length;
    } else {
        const nl = " ".repeat(col) + ch + "\n";
        ta.setRangeText(nl, ls, ls, "preserve"); ta.selectionStart = ta.selectionEnd = p + nl.length;
    }
}
// ==== /ZÁPIS AKORDŮ ====
const base = (L, a) => L === "B" ? 10 + (a === "#" ? 1 : 0) : PN[L] + (a === "#" ? 1 : a === "b" ? -1 : 0);
const firstChord = t => { const re = /\[([^\]\s][^\]]{0,10})\]/g; let m; while ((m = re.exec(t))) if (CRE.test(m[1].split("/")[0])) return m[1]; return null };
const pcOf = c => { const m = c.split("/")[0].match(CRE); return (base(m[1], m[2]) + 12) % 12 };
function tchord(c, n) { return c.split("/").map((p, i) => { const m = p.match(CRE); if (!m || (i > 0 && m[3])) return p; return NM[(base(m[1], m[2]) + n + 24) % 12] + m[3] }).join("/") }
const secLabel = k => { const m = k.match(/^V(\d+)$/i); return m ? m[1] + ". sloka" : /^REF$/i.test(k) ? "Refrén" : /^BRIDGE$/i.test(k) ? "Bridge" : /^CODA$/i.test(k) ? "Coda" : k };
const chordsL = (h, n, li) => { let k = 0; return h.replace(/\[([^\]\s][^\]]{0,10})\]([^\s\[]*)/g, (m, c, b) => { const t = n ? tchord(c, n) : c; return `<span class="cw" data-l="${li}" data-k="${k++}" data-c="${c}"><span${b ? "" : ' class="ph"'}>${b || "\u00a0"}</span><span class="cc${REP.test(c) ? " rp" : ""}" data-chord="${t}">${t}</span></span>` }) };
function songHTML(t, n) { let o = "", li = 0; for (const l of t.replace(/\r/g, "").split("\n")) { const m = l.match(/^\s*\{([^}]+)\}\s*$/); o += m ? `<span class="sec">${esc(secLabel(m[1].trim()))}</span>` : `<span class="ln" data-l="${li}">${chordsL(esc(l), n, li)}\n</span>`; li++ } return o }
function expand(t) {
    t = inl(t);
    const lines = []; for (const l of t.replace(/\r/g, "").split("\n")) { const m = l.match(/^\s*(\{[^}]+\})[ \t]+(\S.*)$/); if (m) lines.push(m[1], m[2]); else lines.push(l) }
    const secs = [{ k: null, b: [] }]; for (const l of lines) { const m = l.match(/^\s*\{([^}]+)\}\s*$/); if (m) secs.push({ k: m[1].trim().toUpperCase(), r: m[1].trim(), b: [] }); else secs[secs.length - 1].b.push(l) }
    const trim = b => { let a = 0, z = b.length; while (a < z && !b[a].trim()) a++; while (z > a && !b[z - 1].trim()) z--; return b.slice(a, z) };
    const cps = l => { const r = [], re = /\[([^\]]*)\]/g; let m, rem = 0; while ((m = re.exec(l))) { r.push([m.index - rem, m[1]]); rem += m[0].length } return r };
    const snap = (p, o) => { const st = [], re = /\S+/g; let m; while ((m = re.exec(p))) st.push(m.index); if (!st.length) return 0; let b = st[0]; for (const x of st) if (Math.abs(x - o) < Math.abs(b - o)) b = x; return b };
    const put = (p, cs) => { let r = "", pos = 0; for (const [o, c] of cs.map(([o, c]) => [snap(p, o), c])) { r += p.slice(pos, o) + "[" + c + "]"; pos = o } return r + p.slice(pos) };
    const done = {}; let v1 = null;
    for (const s of secs) {
        if (s.k === null) continue; const body = trim(s.b);
        if (!body.length) { if (done[s.k]) s.b = [...done[s.k], ""]; else if (/^REF$/i.test(s.k) && done["REF"]) s.b = [...done["REF"], ""]; else if (/^BRIDGE$/i.test(s.k) && done["BRIDGE"]) s.b = [...done["BRIDGE"], ""]; else if (/^CODA$/i.test(s.k) && done["CODA"]) s.b = [...done["CODA"], ""]; continue }
        if (/^V\d+$/.test(s.k) && s.k !== "V1" && v1) { const src = v1.filter(l => l.trim()); let i = 0; s.b = s.b.map(l => { if (!l.trim()) return l; const sl = src[i++]; return sl && !/\[/.test(l) ? put(l, cps(sl)) : l }) }
        if (!done[s.k]) done[s.k] = trim(s.b); if (s.k === "V1" && !v1) v1 = done.V1
    }
    return secs.map(s => (s.k === null ? [] : ["{" + s.r + "}"]).concat(s.b)).flat().join("\n")
}
const strip = l => l.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();
function parts(t) {
    const out = []; let cur = null;
    for (const l of expand(t).split("\n")) {
        const m = l.match(/^\s*\{([^}]+)\}\s*$/);
        if (m) { cur = { k: m[1].trim(), lines: [] }; out.push(cur) } else { if (!cur) { cur = { k: "", lines: [] }; out.push(cur) } cur.lines.push(l) }
    }
    return out.map(p => {
        const blocks = []; let b = []; for (const l of p.lines) { if (!l.trim()) { if (b.length) blocks.push(b); b = []; continue } const s = strip(l); if (s) b.push(s) } if (b.length) blocks.push(b);
        return { k: p.k, label: p.k ? secLabel(p.k) : "Text", blocks }
    }).filter(p => p.blocks.length)
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true } catch (e) { const x = document.createElement("textarea"); x.value = t; x.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(x); x.select(); let ok = false; try { ok = document.execCommand("copy") } catch (e) { } x.remove(); return ok } }
document.addEventListener("change", e => { if (e.target.id === "pl") S.pl = +e.target.value });
function qlText(s, ps, seq, per) {
    const nm = p => /^V\d+$/i.test(p.k) ? "Verse" : /^REF$/i.test(p.k) ? "Chorus" : /^BRIDGE$/i.test(p.k) ? "Bridge" : /^CODA$/i.test(p.k) ? "Coda" : p.k ? p.label : "Verse";
    let o = "Title=" + s.title + "\n" + (s.author ? "Author=" + s.author + "\n" : "");
    for (const i of seq) {
        const p = ps[i], ch = []; for (const b of p.blocks) { if (!per) ch.push(b); else for (let a = 0; a < b.length; a += per)ch.push(b.slice(a, a + per)) }
        o += "\n[" + nm(p) + "]\n" + ch.map(c => c.join("\n")).join("\n\n") + "\n"
    }
    return o
}
const chunk = (p, per) => { const ch = []; for (const b of p.blocks) { if (!per) ch.push(b); else for (let a = 0; a < b.length; a += per)ch.push(b.slice(a, a + per)) } return ch };
function loadPptx() { return window.PptxGenJS ? Promise.resolve() : new Promise((ok, no) => { const x = document.createElement("script"); x.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js"; x.onload = ok; x.onerror = () => no(new Error("nepodařilo se načíst knihovnu (potřebuje internet)")); document.head.appendChild(x) }) }
async function mkPptx(s, ps, seq, per, name) {
    await loadPptx(); const px = new PptxGenJS(); px.layout = "LAYOUT_WIDE"; px.title = s.title;
    for (const i of seq) {
        const p = ps[i]; for (const c of chunk(p, per)) {
            const sl = px.addSlide(); sl.background = { color: "000000" };
            const mx = Math.max(...c.map(l => l.length)), fs = Math.max(28, Math.min(54, Math.round(60 - Math.max(0, mx - 18) * .9 - (c.length > 3 ? 6 : 0))));
            sl.addText(c.map((l, j) => ({ text: l, options: { breakLine: j < c.length - 1 } })), { x: .5, y: .5, w: 12.33, h: 6.5, align: "center", valign: "middle", color: "FFFFFF", fontFace: "Calibri", fontSize: fs, fit: "shrink", isTextBox: true });
            sl.addNotes(p.label)
        }
    }
    await px.writeFile({ fileName: name })
}
const QS = [["", "dur"], ["m", "m"], ["7", "7"], ["m7", "m7"], ["maj7", "maj7"], ["sus4", "sus4"], ["sus2", "sus2"], ["dim", "dim"], ["aug", "aug"], ["add9", "add9"], ["6", "6"]];
function edBar() { const q = S.q || ""; return `<div class="ed"><b>Akord</b><div class="qs">${QS.map(([v, n]) => `<button type="button" class="${v === q ? "on" : ""}" data-s="iq" data-q="${v}">${n}</button>`).join("")}</div><div class="rs">${NM.map(r => `<button type="button" data-s="ins" data-r="${r}" data-v="[${r + q}]">${r + q}</button>`).join("")}</div><b>Části písničky</b><div class="qs"><button type="button" data-s="isv">+ Sloka</button><button type="button" data-s="irf">+ Refrén</button><button type="button" data-s="ibr">+ Bridge</button><button type="button" data-s="ico">+ Coda</button></div></div>` }
function secStr(t, a, k) {
    const pre = t.slice(0, a); const lead = !pre || /\n\n$/.test(pre) ? "" : /\n$/.test(pre) ? "\n" : "\n\n";
    let name = "REF";
    if (k === "V") { const n = [...t.matchAll(/\{V(\d+)\}/gi)].map(m => +m[1]); name = "V" + (n.length ? Math.max(...n) + 1 : 1) }
    else if (k === "B") name = "BRIDGE";
    else if (k === "C") name = "CODA";
    return lead + "{" + name + "}\n"
}
document.addEventListener("mousedown", e => { if (e.target.closest(".ed button")) e.preventDefault() });
async function renderSongs() {
    await loadSongs(); const m = $("#main"), qv = norm($("#q").value.trim());
    $("#pr").hidden = !S.song || !!S.edit;
    if (S.song) {
        if (S.trFor !== S.song) { S.tr = +ls("tr_" + S.song) || 0; S.trFor = S.song }
        else ls("tr_" + S.song, S.tr);
    } else S.trFor = null;
    if (S.edit) {
        const s = S.edit; m.innerHTML = `<article><h2>${s.id ? "Upravit písničku" : "Nová písnička"}</h2>
${!s.id && !S.draft ? aiBox() : ""}
${S.draft ? '<details class="aisrc" open><summary>Originál ze screenshotu (klepnutím na obrázek ho zvětšíš)</summary><div id="aisrc"></div></details>' : ""}
<input class="f1" id="st" placeholder="Název" value="${esc(s.title)}">
<input class="f1" id="sa" placeholder="Autor (nepovinné)" value="${esc(s.author || "")}">
<div class="edw"><textarea class="f1" id="sx" wrap="off" spellcheck="false" placeholder="Text písničky. Akordy piš na řádek nad text, zarovnané nad slabiku:&#10;      G        C&#10;Jsi Král a Pán">${esc(s.text)}</textarea>${edBar()}</div>
<p class="info">Akordy piš na řádek nad text, zarovnané nad slabiku (jako ve zpěvnících, klidně sem vlož zkopírovaný text). Tlačítka akordů je vloží nad místo, kde stojí kurzor. Části na samostatný řádek: {V1}, {V2}, {REF}. {V2} bez akordů se doplní podle {V1}, prázdné {REF} se doplní refrénem.</p>
${API ? `<input class="f1" id="sp" type="password" placeholder="PIN pro ukládání" value="${esc(ls("pin") || "")}">` : ""}
<p class="info" id="sm"></p><button class="btn ac" data-s="save">Uložit</button> <button class="btn" data-s="cancel">Zrušit</button></article>`; return
    }
    if (S.song) {
        const s = songs.find(x => x.id === S.song); if (s) {
            const i = S.msg || s.author || ""; S.msg = "";
            const ps = parts(s.text); let pr = "";
            if (ps.length) {
                if (S.pres) {
                    if (!S.seq || S.seq.some(i => i >= ps.length)) S.seq = ps.map((_, i) => i);
                    const uk = {}; ps.forEach((p, i) => { if (!(p.label in uk)) uk[p.label] = i });
                    pr = `<div class="pres"><b>Pořadí částí</b><div class="seq">${S.seq.map((i, j) => `<span class="chip">${esc(ps[i].label)}<button data-s="px" data-i="${j}" aria-label="Odebrat">×</button></span>`).join("") || "<i>nic nevybráno</i>"}</div>
<div class="seq">Přidat: ${Object.entries(uk).map(([l, i]) => `<button class="btn" data-s="pa" data-i="${i}">+ ${esc(l)}</button>`).join("")}</div>
<label class="info">Řádků na slide (FreeShow): <select id="pl">${[[1, "1"], [2, "2"], [3, "3"], [4, "4"], [0, "celá část"]].map(([v, n]) => `<option value="${v}"${v === (S.pl ?? 2) ? " selected" : ""}>${n}</option>`).join("")}</select></label>
<div class="seq"><button class="btn ac" data-s="pfs">Kopírovat pro FreeShow</button><button class="btn pp" data-s="ppt">PowerPoint</button></div><p class="info" id="pm">Pro FreeShow: zkopíruj a ve FreeShow stiskni Ctrl+Alt+I. Text se kopíruje bez akordů a značek.</p></div>`}
                pr = `<div class="prb"><button class="btn" data-s="pr">Přidat do prezentace ${S.pres ? "▴" : "▾"}</button></div>` + pr
            }
            const f = firstChord(expand(s.text)), p0 = f ? pcOf(f) : 0; S.p0 = p0; const cur = ((p0 + S.tr) % 12 + 12) % 12;
            const tp = f ? `<div class="tp"><button class="btn" data-s="tm">−1</button><button class="btn" data-s="tk">${esc(tchord(f, S.tr))} ▾</button><button class="btn" data-s="tp">+1</button>${S.pop ? `<div class="pop">${NM.map((n, k) => `<button class="btn${k === cur ? " on" : ""}" data-s="key" data-k="${k}">${n}</button>`).join("")}</div>` : ""}</div>` : "";
            m.innerHTML = `<article><button class="btn" data-s="back">← Zpěvník</button><h2>${esc(s.title)}</h2><p class="info">${esc(i)}</p><pre class="song">${songHTML(expand(s.text), S.tr)}</pre>${pr}<div class="pg"><button class="btn" data-s="edit" data-id="${esc(s.id)}">Upravit</button>${tp}<button class="btn" data-s="del" data-id="${esc(s.id)}">Smazat</button></div></article>`;
            fixChordCollisions();
            return
        } S.song = null
    }
    const l = songs.filter(s => !qv || qv.split(/\s+/).every(t => norm(s.title + " " + (s.author || "") + " " + strip(inl(s.text))).includes(t))).sort((a, b) => a.title.localeCompare(b.title, "cs"));
    m.innerHTML = `<article><h2>Zpěvník</h2><p class="info">${esc(S.msg || l.length + " písniček")}</p><button class="btn ac" data-s="new">+ Nová písnička</button><div style="height:14px"></div><div class="aib" id="airows">${aiRows()}</div>` + l.map(s => `<button class="r" data-s="open" data-id="${esc(s.id)}"><b>${esc(s.title)}</b>${esc(s.author || "")}</button>`).join("") + `</article>`; S.msg = ""
}
async function songAct(t) {
    const a = t.dataset.s, id = t.dataset.id;
    if (a === "open") { const keep = S.song === id; S.song = id; if (!keep) { S.tr = 0; S.pop = false; S.pres = false; window.scrollTo(0, 0); setUrl(songs.find(x => x.id === id), true) } renderSongs() }
    else if (a === "back") { S.song = null; S.pop = false; S.pres = false; setUrl(null, true); renderSongs() }
    else if (a === "tm" || a === "tp") { S.tr = ((S.tr + (a === "tm" ? -1 : 1)) % 12 + 12) % 12; renderSongs() }
    else if (a === "tk") { S.pop = !S.pop; renderSongs() }
    else if (a === "key") { S.tr = ((+t.dataset.k - S.p0) % 12 + 12) % 12; S.pop = false; renderSongs() }
    else if (a === "pr") { S.pres = !S.pres; S.seq = null; renderSongs() }
    else if (a === "pa") { S.seq.push(+t.dataset.i); renderSongs() }
    else if (a === "px") { S.seq.splice(+t.dataset.i, 1); renderSongs() }
    else if (a === "iq") { S.q = t.dataset.q; document.querySelectorAll(".ed .qs button[data-q]").forEach(b => b.classList.toggle("on", b === t)); document.querySelectorAll(".rs button").forEach(b => { const c = b.dataset.r + S.q; b.dataset.v = "[" + c + "]"; b.textContent = c }) }
    else if (a === "ins" || a === "isv" || a === "irf" || a === "ibr" || a === "ico") { const ta = $("#sx"); if (ta) { const p = ta.selectionStart; const k = a === "isv" ? "V" : a === "irf" ? "REF" : a === "ibr" ? "B" : a === "ico" ? "C" : null; if (a === "ins") insChord(ta, t.dataset.v.slice(1, -1)); else ta.setRangeText(secStr(ta.value, p, k), p, p, "end"); ta.focus() } }
    else if (a === "ppt") {
        const so = songs.find(x => x.id === S.song), ps = parts(so.text), pm = $("#pm");
        if (!S.seq.length) { pm.textContent = "Přidej aspoň jednu část."; return }
        pm.textContent = "Vytvářím PowerPoint…";
        try { await mkPptx(so, ps, S.seq, S.pl ?? 2, (so.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "pisnicka") + ".pptx"); pm.textContent = "PowerPoint stažen." } catch (e) { pm.textContent = "PowerPoint se nepodařilo vytvořit: " + (e.message || e) }
    }
    else if (a === "pfs") {
        const so = songs.find(x => x.id === S.song), ps = parts(so.text), pm = $("#pm");
        if (!S.seq.length) { pm.textContent = "Přidej aspoň jednu část."; return }
        pm.textContent = (await copyText(qlText(so, ps, S.seq, S.pl ?? 2))) ? "Zkopírováno. Ve FreeShow stiskni Ctrl+Alt+I (Cmd+Option+I na Macu)." : "Kopírování se nepovedlo."
    }
    else if (a === "aip") { const p = $("#aipin"); if (p && p.value) ls("pin", p.value); if (!ls("pin")) { toast("Nejdřív zadej PIN."); return } $("#aif").click() }
    else if (a === "aid") { const d = drafts.find(x => x.id === id); if (!d) return; if (S.edit && ($("#st") && $("#st").value.trim() || $("#sx") && $("#sx").value.trim()) && !confirm("V editoru je rozepsaný text. Nahradit ho konceptem z AI?")) return; S.edit = { title: d.title, author: d.author, text: toAbove(d.text) }; S.draft = id; await renderSongs(); showSrc(id); $("#sm").textContent = d.notes ? "AI: " + d.notes : "Zkontroluj text a akordy před uložením." }
    else if (a === "aix") { idb.del(id); drafts = drafts.filter(x => x.id !== id); jobs = jobs.filter(x => x.id !== id); saveDrafts(); aiRefresh() }
    else if (a === "air") { const j = jobs.find(x => x.id === id); if (j) { j.st = "wait"; aiPump(); aiRefresh() } }
    else if (a === "new") { S.edit = { title: "", author: "", text: "" }; S.draft = null; renderSongs() }
    else if (a === "edit") { const so = songs.find(x => x.id === id); S.edit = { ...so, text: toAbove(so.text) }; renderSongs() }
    else if (a === "cancel") { S.edit = null; S.draft = null; renderSongs() }
    else if (a === "save") {
        const s = { ...S.edit, title: $("#st").value.trim(), author: $("#sa").value.trim(), text: $("#sx").value.replace(/\r/g, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, "") };
        if (!s.title || !s.text.trim()) { $("#sm").textContent = "Vyplň název a text."; return }
        if (!s.id) s.id = Date.now().toString(36); if (!s.slug) s.slug = uniqueSlug(s.title, s.id); if (API) ls("pin", $("#sp").value); $("#sm").textContent = "Ukládám…";
        try { S.msg = await store("save", s); if (S.draft) { idb.del(S.draft); drafts = drafts.filter(x => x.id !== S.draft); saveDrafts(); S.draft = null } S.edit = null; S.song = s.id; S.tr = 0; S.pres = false; setUrl(songs.find(x => x.id === s.id), true); renderSongs() } catch (e) { $("#sm").textContent = "Nepodařilo se uložit: " + e.message }
    }
    else if (a === "del") { t.parentElement.innerHTML = (API ? `<input class="f1" id="dp" type="password" placeholder="PIN" style="max-width:180px;margin:0">` : "") + `<button class="btn ac" data-s="del2" data-id="${esc(id)}">Smazat</button><button class="btn" data-s="open" data-id="${esc(id)}">Zrušit</button>`; const d = $("#dp"); if (d) d.focus() }
    else if (a === "del2") {
        const d = $("#dp"), old = ls("pin"); if (d) ls("pin", d.value); let ok = true;
        try { S.msg = await store("del", { id }) } catch (e) { ok = false; S.msg = "Chyba: " + e.message; if (d) ls("pin", old || "") }
        S.song = ok ? null : id; if (ok) setUrl(null, true); renderSongs()
    }
}
document.addEventListener("click", e => {
    if (document.querySelector(".cdpop") && !e.target.closest(".cdpop,.cc")) closeChordPop();
    if (S.pop && !e.target.closest(".pop,[data-s=tk]")) { S.pop = false; const q = document.querySelector(".pop"); if (q) q.remove() }
    if (e.target.closest(".cc")) { const cc = e.target.closest(".cc"); if (!cc.classList.contains("rp")) openChordPop(cc, cc.dataset.chord); return; }
    const t = e.target.closest("[data-s],#fs,#th"); if (!t) return;
    if (t.dataset.s) songAct(t);
    else if (t.id === "fs") { const r = document.documentElement, v = parseInt(getComputedStyle(r).getPropertyValue("--fs")); r.style.setProperty("--fs", (v >= 26 ? 16 : v + 2) + "px"); fixChordCollisions(); }
    else if (t.id === "th") { const r = document.documentElement, d = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches; const next = d ? "light" : "dark"; r.dataset.theme = next; localStorage.setItem("theme", next) }
});

document.addEventListener("keydown", e => { if (e.key === "Escape") closeChordPop() });

// ---- Chord diagram popup ----
let cdTab = ls("cdTab") || "guitar";
if (!["guitar", "ukulele", "piano"].includes(cdTab)) cdTab = "guitar";

// Akordy se hledají přes pcOfChord/chordKey: české B = Bb, H = h; enharmonické názvy (Db, Gb, Ab, Hmi, A2…) se převedou na tyto klíče.
// Tvary: [pražce po strunách odspodu, "x" = nehrát, 0 = prázdná], b = první zobrazený pražec.
const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "Bb", "H"];
const GUITAR_CHORDS = {
    "C": { f: ["x", 3, 2, 0, 1, 0], b: 0 },
    "Cm": { f: ["x", 3, 5, 5, 4, 3], b: 3 },
    "C7": { f: ["x", 3, 2, 3, 1, 0], b: 0 },
    "Cm7": { f: ["x", 3, 5, 3, 4, 3], b: 3 },
    "Cmaj7": { f: ["x", 3, 2, 0, 0, 0], b: 0 },
    "Csus4": { f: ["x", 3, 3, 0, 1, 1], b: 0 },
    "Csus2": { f: ["x", 3, 0, 0, 1, "x"], b: 0 },
    "Cdim": { f: ["x", 3, 4, 5, 4, "x"], b: 0 },
    "Caug": { f: ["x", 3, 2, 1, 1, 0], b: 0 },
    "Cadd9": { f: ["x", 3, 0, 0, 1, 0], b: 0 },
    "C6": { f: ["x", 3, 2, 2, 1, 0], b: 0 },
    "Cm6": { f: ["x", 3, 1, 2, 1, "x"], b: 0 },
    "C#": { f: ["x", 4, 3, 1, 2, 1], b: 0 },
    "C#m": { f: ["x", 4, 6, 6, 5, 4], b: 4 },
    "C#7": { f: ["x", 4, 3, 4, 0, "x"], b: 0 },
    "C#m7": { f: ["x", 4, 2, 4, 0, 0], b: 0 },
    "C#maj7": { f: ["x", 4, 3, 1, 1, 1], b: 0 },
    "C#sus4": { f: ["x", 4, 4, 1, 2, "x"], b: 0 },
    "C#sus2": { f: ["x", 4, 1, 1, 2, "x"], b: 0 },
    "C#dim": { f: [0, 4, 2, 0, "x", "x"], b: 0 },
    "C#aug": { f: ["x", 4, 3, 2, 2, "x"], b: 2 },
    "C#add9": { f: ["x", 4, 1, 1, 2, 1], b: 0 },
    "C#6": { f: ["x", 4, 3, 3, 2, "x"], b: 2 },
    "C#m6": { f: [0, 1, 2, 1, 2, 0], b: 0 },
    "D": { f: ["x", "x", 0, 2, 3, 2], b: 0 },
    "Dm": { f: ["x", "x", 0, 2, 3, 1], b: 0 },
    "D7": { f: ["x", "x", 0, 2, 1, 2], b: 0 },
    "Dm7": { f: ["x", "x", 0, 2, 1, 1], b: 0 },
    "Dmaj7": { f: ["x", "x", 0, 2, 2, 2], b: 0 },
    "Dsus4": { f: ["x", "x", 0, 2, 3, 3], b: 0 },
    "Dsus2": { f: ["x", "x", 0, 2, 3, 0], b: 0 },
    "Ddim": { f: ["x", "x", 0, 1, 3, 1], b: 0 },
    "Daug": { f: ["x", "x", 0, 3, 3, 2], b: 0 },
    "Dadd9": { f: [0, 0, 0, 2, 3, 2], b: 0 },
    "D6": { f: ["x", "x", 0, 4, 0, 2], b: 0 },
    "Dm6": { f: ["x", "x", 0, 2, 0, 1], b: 0 },
    "D#": { f: ["x", "x", 1, 3, 4, 3], b: 0 },
    "D#m": { f: ["x", "x", 1, 3, 4, 2], b: 0 },
    "D#7": { f: ["x", "x", 1, 0, 2, 3], b: 0 },
    "D#m7": { f: ["x", "x", 1, 3, 2, 2], b: 0 },
    "D#maj7": { f: ["x", "x", 1, 0, 3, 3], b: 0 },
    "D#sus4": { f: ["x", "x", 1, 3, 4, 4], b: 0 },
    "D#sus2": { f: ["x", "x", 1, 3, 4, 1], b: 0 },
    "D#dim": { f: [2, 0, 1, 2, "x", "x"], b: 0 },
    "D#aug": { f: ["x", "x", 1, 0, 0, 3], b: 0 },
    "D#add9": { f: [1, 1, 1, 0, "x", "x"], b: 0 },
    "D#6": { f: ["x", "x", 1, 3, 1, 3], b: 0 },
    "D#m6": { f: ["x", "x", 1, 3, 1, 2], b: 0 },
    "E": { f: [0, 2, 2, 1, 0, 0], b: 0 },
    "Em": { f: [0, 2, 2, 0, 0, 0], b: 0 },
    "E7": { f: [0, 2, 0, 1, 0, 0], b: 0 },
    "Em7": { f: [0, 2, 0, 0, 0, 0], b: 0 },
    "Emaj7": { f: [0, 2, 1, 1, 0, 0], b: 0 },
    "Esus4": { f: [0, 2, 2, 2, 0, 0], b: 0 },
    "Esus2": { f: [0, 2, 4, 4, 0, 0], b: 0 },
    "Edim": { f: [0, 1, 2, 0, "x", "x"], b: 0 },
    "Eaug": { f: [0, 3, 2, 1, 1, 0], b: 0 },
    "Eadd9": { f: [0, 2, 2, 1, 0, 2], b: 0 },
    "E6": { f: [0, 2, 2, 1, 2, 0], b: 0 },
    "Em6": { f: [0, 4, 2, 0, 0, 0], b: 0 },
    "F": { f: [1, 3, 3, 2, 1, 1], b: 0 },
    "Fm": { f: [1, 3, 3, 1, 1, 1], b: 1 },
    "F7": { f: [1, 3, 1, 2, 1, 1], b: 0 },
    "Fm7": { f: [1, 3, 1, 1, 1, 1], b: 1 },
    "Fmaj7": { f: ["x", "x", 3, 2, 1, 0], b: 0 },
    "Fsus4": { f: [1, 1, 3, 3, 1, 1], b: 0 },
    "Fsus2": { f: ["x", "x", 3, 0, 1, 1], b: 0 },
    "Fdim": { f: [1, 2, 3, 1, 0, "x"], b: 0 },
    "Faug": { f: [1, 0, 3, 2, 2, 1], b: 0 },
    "Fadd9": { f: [1, 0, 3, 0, "x", "x"], b: 0 },
    "F6": { f: [1, 0, 0, 2, "x", "x"], b: 0 },
    "Fm6": { f: ["x", "x", 0, 1, 1, 1], b: 0 },
    "F#": { f: [2, 4, 4, 3, 2, 2], b: 2 },
    "F#m": { f: [2, 4, 4, 2, 2, 2], b: 2 },
    "F#7": { f: [2, 1, 2, 3, "x", "x"], b: 0 },
    "F#m7": { f: [0, 0, 2, 2, 2, 2], b: 0 },
    "F#maj7": { f: [2, 1, 3, 3, "x", "x"], b: 0 },
    "F#sus4": { f: [2, 2, 4, 4, 2, 2], b: 2 },
    "F#sus2": { f: ["x", "x", 4, 1, 2, 2], b: 0 },
    "F#dim": { f: [2, 3, 4, 2, "x", "x"], b: 2 },
    "F#aug": { f: [2, 1, 0, 3, "x", "x"], b: 0 },
    "F#add9": { f: [2, 1, 4, 1, "x", "x"], b: 0 },
    "F#6": { f: [2, 1, 1, 3, "x", "x"], b: 0 },
    "F#m6": { f: [2, 0, 1, 2, "x", "x"], b: 0 },
    "G": { f: [3, 2, 0, 0, 0, 3], b: 0 },
    "Gm": { f: [3, 5, 5, 3, 3, 3], b: 3 },
    "G7": { f: [3, 2, 0, 0, 0, 1], b: 0 },
    "Gm7": { f: [3, 5, 3, 3, 3, 3], b: 3 },
    "Gmaj7": { f: [3, 2, 0, 0, 0, 2], b: 0 },
    "Gsus4": { f: [3, 3, 0, 0, 1, 3], b: 0 },
    "Gsus2": { f: [3, 0, 0, 0, "x", "x"], b: 0 },
    "Gdim": { f: [3, 4, 5, 3, "x", "x"], b: 3 },
    "Gaug": { f: [3, 2, 1, 0, 0, 3], b: 0 },
    "Gadd9": { f: ["x", 0, 0, 0, 0, "x"], b: 0 },
    "G6": { f: ["x", "x", 0, 0, 0, 0], b: 0 },
    "Gm6": { f: [0, 1, 0, 0, "x", "x"], b: 0 },
    "G#": { f: [4, 3, 1, 1, 1, 4], b: 0 },
    "G#m": { f: [4, 6, 6, 4, 4, 4], b: 4 },
    "G#7": { f: ["x", "x", 1, 1, 1, 2], b: 0 },
    "G#m7": { f: ["x", "x", 1, 1, 0, 2], b: 0 },
    "G#maj7": { f: [4, 3, 1, 0, "x", "x"], b: 0 },
    "G#sus4": { f: [4, 4, 1, 1, "x", "x"], b: 0 },
    "G#sus2": { f: [4, 1, 1, 1, "x", "x"], b: 0 },
    "G#dim": { f: [4, 2, 0, 4, 0, "x"], b: 0 },
    "G#aug": { f: ["x", "x", 2, 1, 1, 0], b: 0 },
    "G#add9": { f: ["x", 1, 1, 1, 1, "x"], b: 0 },
    "G#6": { f: ["x", "x", 1, 1, 1, 1], b: 0 },
    "G#m6": { f: [1, 2, 1, 1, 0, "x"], b: 0 },
    "A": { f: ["x", 0, 2, 2, 2, 0], b: 0 },
    "Am": { f: ["x", 0, 2, 2, 1, 0], b: 0 },
    "A7": { f: ["x", 0, 2, 0, 2, 0], b: 0 },
    "Am7": { f: ["x", 0, 2, 0, 1, 0], b: 0 },
    "Amaj7": { f: ["x", 0, 2, 1, 2, 0], b: 0 },
    "Asus4": { f: ["x", 0, 2, 2, 3, 0], b: 0 },
    "Asus2": { f: ["x", 0, 2, 2, 0, 0], b: 0 },
    "Adim": { f: ["x", 0, 1, 2, 1, "x"], b: 0 },
    "Aaug": { f: ["x", 0, 3, 2, 2, 1], b: 0 },
    "Aadd9": { f: [0, 2, 2, 2, 2, 0], b: 0 },
    "A6": { f: ["x", 0, 2, 2, 2, 2], b: 0 },
    "Am6": { f: ["x", 0, 2, 2, 1, 2], b: 0 },
    "Bb": { f: [1, 1, 3, 3, 3, 1], b: 1 },
    "Bbm": { f: ["x", 1, 3, 3, 2, 1], b: 0 },
    "Bb7": { f: ["x", 1, 3, 1, 3, 1], b: 0 },
    "Bbm7": { f: ["x", 1, 3, 1, 2, 1], b: 0 },
    "Bbmaj7": { f: ["x", 1, 0, 2, 3, "x"], b: 0 },
    "Bbsus4": { f: ["x", 1, 1, 3, 4, 1], b: 0 },
    "Bbsus2": { f: ["x", 1, 3, 3, 1, 1], b: 0 },
    "Bbdim": { f: ["x", 1, 2, 3, 2, 0], b: 0 },
    "Bbaug": { f: ["x", 1, 0, 3, 3, 2], b: 0 },
    "Bbadd9": { f: ["x", 3, 3, 3, 3, "x"], b: 3 },
    "Bb6": { f: [1, 1, 0, 0, "x", "x"], b: 0 },
    "Bbm6": { f: ["x", 1, 3, 0, 2, "x"], b: 0 },
    "H": { f: ["x", 2, 4, 4, 4, 2], b: 0 },
    "Hm": { f: ["x", 2, 4, 4, 3, 2], b: 2 },
    "H7": { f: ["x", 2, 1, 2, 0, 2], b: 0 },
    "Hm7": { f: ["x", 2, 4, 2, 3, 2], b: 2 },
    "Hmaj7": { f: ["x", 2, 4, 3, 4, 2], b: 0 },
    "Hsus4": { f: ["x", 2, 4, 4, 0, 0], b: 0 },
    "Hsus2": { f: ["x", 2, 4, 4, 2, 2], b: 2 },
    "Hdim": { f: ["x", 2, 3, 4, 3, "x"], b: 2 },
    "Haug": { f: ["x", 2, 1, 0, 0, 3], b: 0 },
    "Hadd9": { f: ["x", 2, 1, 4, 2, "x"], b: 0 },
    "H6": { f: ["x", 2, 1, 1, 0, "x"], b: 0 },
    "Hm6": { f: ["x", 2, 0, 1, 0, "x"], b: 0 },
};

const UKE_CHORDS = {
    "C": { f: [0, 0, 0, 3], b: 0 },
    "Cm": { f: [0, 3, 3, 3], b: 0 },
    "C7": { f: [0, 0, 0, 1], b: 0 },
    "Cm7": { f: [3, 3, 3, 3], b: 3 },
    "Cmaj7": { f: [0, 0, 0, 2], b: 0 },
    "Csus4": { f: [0, 0, 1, 3], b: 0 },
    "Csus2": { f: [0, 2, 3, 3], b: 0 },
    "Cdim": { f: [5, 3, 2, 3], b: 2 },
    "Caug": { f: [1, 0, 0, 3], b: 0 },
    "Cadd9": { f: [0, 2, 0, 3], b: 0 },
    "C6": { f: [0, 0, 0, 0], b: 0 },
    "Cm6": { f: [2, 3, 3, 3], b: 2 },
    "C#": { f: [1, 1, 1, 4], b: 0 },
    "C#m": { f: [1, 1, 0, 4], b: 0 },
    "C#7": { f: [1, 1, 1, 2], b: 0 },
    "C#m7": { f: [1, 1, 0, 2], b: 0 },
    "C#maj7": { f: [1, 1, 1, 3], b: 0 },
    "C#sus4": { f: [1, 1, 2, 4], b: 0 },
    "C#sus2": { f: [1, 3, 4, 4], b: 0 },
    "C#dim": { f: [0, 1, 0, 4], b: 0 },
    "C#aug": { f: [2, 1, 1, 0], b: 0 },
    "C#add9": { f: [1, 3, 1, 4], b: 0 },
    "C#6": { f: [1, 1, 1, 1], b: 0 },
    "C#m6": { f: [3, 4, 0, 4], b: 0 },
    "D": { f: [2, 2, 2, 0], b: 0 },
    "Dm": { f: [2, 2, 1, 0], b: 0 },
    "D7": { f: [2, 2, 2, 3], b: 0 },
    "Dm7": { f: [2, 2, 1, 3], b: 0 },
    "Dmaj7": { f: [2, 2, 2, 4], b: 0 },
    "Dsus4": { f: [0, 2, 3, 0], b: 0 },
    "Dsus2": { f: [2, 2, 0, 0], b: 0 },
    "Ddim": { f: [7, 5, 4, 5], b: 4 },
    "Daug": { f: [3, 2, 2, 1], b: 0 },
    "Dadd9": { f: [2, 4, 2, 5], b: 2 },
    "D6": { f: [2, 2, 2, 2], b: 2 },
    "Dm6": { f: [2, 2, 1, 2], b: 0 },
    "D#": { f: [3, 3, 3, 1], b: 0 },
    "D#m": { f: [3, 3, 2, 1], b: 0 },
    "D#7": { f: [0, 3, 3, 4], b: 0 },
    "D#m7": { f: [3, 3, 2, 4], b: 2 },
    "D#maj7": { f: [3, 3, 3, 5], b: 3 },
    "D#sus4": { f: [1, 3, 4, 1], b: 0 },
    "D#sus2": { f: [3, 3, 1, 1], b: 0 },
    "D#dim": { f: [2, 3, 2, 0], b: 0 },
    "D#aug": { f: [0, 3, 3, 2], b: 0 },
    "D#add9": { f: [0, 3, 1, 1], b: 0 },
    "D#6": { f: [0, 3, 3, 3], b: 0 },
    "D#m6": { f: [3, 3, 2, 3], b: 2 },
    "E": { f: [4, 4, 4, 2], b: 0 },
    "Em": { f: [0, 4, 3, 2], b: 0 },
    "E7": { f: [1, 2, 0, 2], b: 0 },
    "Em7": { f: [0, 2, 0, 2], b: 0 },
    "Emaj7": { f: [1, 3, 0, 2], b: 0 },
    "Esus4": { f: [4, 4, 0, 0], b: 0 },
    "Esus2": { f: [4, 4, 2, 2], b: 2 },
    "Edim": { f: [0, 4, 0, 1], b: 0 },
    "Eaug": { f: [1, 0, 0, 3], b: 0 },
    "Eadd9": { f: [1, 4, 2, 2], b: 0 },
    "E6": { f: [1, 1, 0, 2], b: 0 },
    "Em6": { f: [0, 1, 0, 2], b: 0 },
    "F": { f: [2, 0, 1, 0], b: 0 },
    "Fm": { f: [1, 0, 1, 3], b: 0 },
    "F7": { f: [2, 3, 1, 0], b: 0 },
    "Fm7": { f: [1, 3, 1, 3], b: 0 },
    "Fmaj7": { f: [2, 4, 1, 0], b: 0 },
    "Fsus4": { f: [3, 0, 1, 1], b: 0 },
    "Fsus2": { f: [0, 0, 1, 3], b: 0 },
    "Fdim": { f: [4, 5, 4, 2], b: 2 },
    "Faug": { f: [2, 1, 1, 0], b: 0 },
    "Fadd9": { f: [0, 0, 1, 0], b: 0 },
    "F6": { f: [2, 2, 1, 0], b: 0 },
    "Fm6": { f: [1, 2, 1, 3], b: 0 },
    "F#": { f: [3, 1, 2, 1], b: 0 },
    "F#m": { f: [2, 1, 2, 0], b: 0 },
    "F#7": { f: [3, 4, 2, 4], b: 2 },
    "F#m7": { f: [2, 4, 2, 0], b: 0 },
    "F#maj7": { f: [3, 5, 2, 4], b: 2 },
    "F#sus4": { f: [4, 1, 2, 2], b: 0 },
    "F#sus2": { f: [1, 1, 2, 4], b: 0 },
    "F#dim": { f: [5, 6, 5, 3], b: 3 },
    "F#aug": { f: [3, 2, 2, 1], b: 0 },
    "F#add9": { f: [1, 1, 2, 1], b: 0 },
    "F#6": { f: [3, 3, 2, 1], b: 0 },
    "F#m6": { f: [2, 3, 2, 0], b: 0 },
    "G": { f: [0, 2, 3, 2], b: 0 },
    "Gm": { f: [0, 2, 3, 1], b: 0 },
    "G7": { f: [0, 2, 1, 2], b: 0 },
    "Gm7": { f: [0, 2, 1, 1], b: 0 },
    "Gmaj7": { f: [0, 2, 2, 2], b: 0 },
    "Gsus4": { f: [0, 2, 3, 3], b: 0 },
    "Gsus2": { f: [0, 2, 3, 0], b: 0 },
    "Gdim": { f: [0, 1, 3, 1], b: 0 },
    "Gaug": { f: [0, 3, 3, 2], b: 0 },
    "Gadd9": { f: [2, 2, 3, 2], b: 2 },
    "G6": { f: [0, 4, 0, 2], b: 0 },
    "Gm6": { f: [0, 2, 0, 1], b: 0 },
    "G#": { f: [5, 3, 4, 3], b: 3 },
    "G#m": { f: [4, 3, 4, 2], b: 0 },
    "G#7": { f: [1, 0, 2, 3], b: 0 },
    "G#m7": { f: [1, 3, 2, 2], b: 0 },
    "G#maj7": { f: [1, 0, 3, 3], b: 0 },
    "G#sus4": { f: [1, 3, 4, 4], b: 0 },
    "G#sus2": { f: [1, 3, 4, 1], b: 0 },
    "G#dim": { f: [4, 2, 4, 2], b: 2 },
    "G#aug": { f: [1, 0, 0, 3], b: 0 },
    "G#add9": { f: [3, 3, 4, 3], b: 3 },
    "G#6": { f: [1, 3, 1, 3], b: 0 },
    "G#m6": { f: [1, 3, 1, 2], b: 0 },
    "A": { f: [2, 1, 0, 0], b: 0 },
    "Am": { f: [2, 0, 0, 0], b: 0 },
    "A7": { f: [0, 1, 0, 0], b: 0 },
    "Am7": { f: [0, 0, 0, 0], b: 0 },
    "Amaj7": { f: [1, 1, 0, 0], b: 0 },
    "Asus4": { f: [2, 2, 0, 0], b: 0 },
    "Asus2": { f: [4, 4, 0, 0], b: 0 },
    "Adim": { f: [5, 3, 5, 3], b: 3 },
    "Aaug": { f: [2, 1, 1, 4], b: 0 },
    "Aadd9": { f: [2, 1, 0, 2], b: 0 },
    "A6": { f: [2, 1, 2, 0], b: 0 },
    "Am6": { f: [2, 4, 2, 3], b: 2 },
    "Bb": { f: [3, 2, 1, 1], b: 0 },
    "Bbm": { f: [3, 1, 1, 1], b: 0 },
    "Bb7": { f: [1, 2, 1, 1], b: 0 },
    "Bbm7": { f: [1, 1, 1, 1], b: 0 },
    "Bbmaj7": { f: [2, 2, 1, 1], b: 0 },
    "Bbsus4": { f: [3, 3, 1, 1], b: 0 },
    "Bbsus2": { f: [3, 0, 1, 1], b: 0 },
    "Bbdim": { f: [3, 4, 0, 4], b: 0 },
    "Bbaug": { f: [3, 2, 2, 1], b: 0 },
    "Bbadd9": { f: [3, 2, 1, 3], b: 0 },
    "Bb6": { f: [0, 2, 1, 1], b: 0 },
    "Bbm6": { f: [0, 1, 1, 1], b: 0 },
    "H": { f: [4, 3, 2, 2], b: 0 },
    "Hm": { f: [4, 2, 2, 2], b: 0 },
    "H7": { f: [2, 3, 2, 2], b: 0 },
    "Hm7": { f: [2, 2, 2, 2], b: 0 },
    "Hmaj7": { f: [3, 3, 2, 2], b: 0 },
    "Hsus4": { f: [4, 4, 2, 2], b: 2 },
    "Hsus2": { f: [4, 1, 2, 2], b: 0 },
    "Hdim": { f: [4, 2, 1, 2], b: 0 },
    "Haug": { f: [0, 3, 3, 2], b: 0 },
    "Hadd9": { f: [4, 3, 2, 4], b: 2 },
    "H6": { f: [1, 3, 2, 2], b: 0 },
    "Hm6": { f: [1, 2, 2, 2], b: 0 },
};

// Tóny akordu (půltóny od základního tónu)
const CHORD_NOTES = {
    "": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11],
    "sus4": [0, 5, 7], "sus2": [0, 2, 7], "dim": [0, 3, 6], "aug": [0, 4, 8], "add9": [0, 4, 7, 14],
    "6": [0, 4, 7, 9], "m6": [0, 3, 7, 9], "9": [0, 4, 7, 10, 14], "m9": [0, 3, 7, 10, 14],
};
// Přípony zapsané různě -> jednotný název. "2" = sus2 a "4" = sus4 (zápis A2, D2, E4 ve zpěvnících).
const SUFFIX_ALIAS = {
    "": "", "M": "", "maj": "", "dur": "",
    "m": "m", "mi": "m", "min": "m", "-": "m", "mol": "m",
    "7": "7", "m7": "m7", "mi7": "m7", "min7": "m7", "-7": "m7",
    "maj7": "maj7", "M7": "maj7", "ma7": "maj7",
    "sus4": "sus4", "sus": "sus4", "4": "sus4", "sus2": "sus2", "2": "sus2",
    "dim": "dim", "°": "dim", "aug": "aug", "+": "aug",
    "add9": "add9", "6": "6", "m6": "m6", "mi6": "m6", "9": "9", "m9": "m9",
};
function parseChord(chord) {
    const m = chord.split("/")[0].match(/^([A-H])([#b]?)(.*)$/);
    if (!m) return null;
    const suf = SUFFIX_ALIAS[m[3]];
    if (suf === undefined) return null;
    return { pc: ((base(m[1], m[2]) % 12) + 12) % 12, suf };
}
function chordNotes(chord) {
    const p = parseChord(chord);
    return p && CHORD_NOTES[p.suf] ? CHORD_NOTES[p.suf].map(i => (p.pc + i) % 12) : [];
}
function chordKey(chord) {      // klíč do tabulek, např. "Bb", "H", "F#m7"; basa za lomítkem se ignoruje
    const p = parseChord(chord);
    return p ? ROOT_NAMES[p.pc] + p.suf : null;
}

// Render fretboard SVG (guitar: 6 strings, ukulele: 4 strings)
function fretboardSVG(data, stringCount) {
    if (!data) return `<div class="cdno">Akord nenalezen</div>`;
    const { f, b } = data;
    const frets = f.map(x => x === "x" ? -1 : x);
    const nonMuted = frets.filter(x => x > 0);
    const maxFret = nonMuted.length ? Math.max(...nonMuted) : 4;
    const minFret = nonMuted.length ? Math.min(...nonMuted) : 1;
    const base = b || (minFret > 1 && !frets.includes(0) ? minFret : 0);   // s prázdnými strunami se kreslí od hmatníku (nutu)
    const showFrets = 4; // frets to display
    const startFret = base > 0 ? base : 1;

    const sw = 34, sh = 36; // string spacing, fret spacing
    const pw = 14, ph = 20; // padding
    const w = sw * (stringCount - 1) + pw * 2;
    const h = sh * showFrets + ph * 2 + 22;
    const strings = Array.from({ length: stringCount }, (_, i) => i);
    const fretLines = Array.from({ length: showFrets + 1 }, (_, i) => i);

    let dots = "";
    frets.forEach((fr, si) => {
        const x = pw + si * sw;
        if (fr === -1) {
            dots += `<text x="${x}" y="${ph - 6}" text-anchor="middle" class="cdx">×</text>`;
        } else if (fr === 0) {
            dots += `<circle cx="${x}" cy="${ph - 6}" r="5" class="cdo"/>`;
        } else {
            const relFret = fr - startFret + 1;
            if (relFret >= 1 && relFret <= showFrets) {
                const cy = ph + (relFret - 0.5) * sh;
                dots += `<circle cx="${x}" cy="${cy}" r="10" class="cdd"/>`;
            }
        }
    });

    const nut = startFret === 1 ? `<rect x="${pw}" y="${ph}" width="${sw * (stringCount - 1)}" height="5" class="cdnut" rx="2"/>` : ``;
    const fretLabel = base > 1 ? `<text x="${pw + sw * (stringCount - 1) + 6}" y="${ph + sh * 0.6}" class="cdfl">${base}fr</text>` : ``;

    const gridLines = fretLines.map(i => `<line x1="${pw}" y1="${ph + i * sh}" x2="${pw + sw * (stringCount - 1)}" y2="${ph + i * sh}" class="cdg"/>`).join("");
    const strLines = strings.map(i => `<line x1="${pw + i * sw}" y1="${ph}" x2="${pw + i * sw}" y2="${ph + showFrets * sh}" class="cdg"/>`).join("");

    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="cdfb">
    ${gridLines}${strLines}${nut}${dots}${fretLabel}
  </svg>`;
}

// Render piano SVG – one octave with chord notes highlighted
function pianoSVG(notes) {
    const wk = [0, 2, 4, 5, 7, 9, 11]; // white key semitones (C D E F G A B)
    const bk = [1, 3, -1, 6, 8, 10, -1]; // black key semitones (some don't exist)
    const kw = 30, kh = 90, bw = 20, bh = 56;
    const totalW = 7 * kw;
    const noteSet = new Set(notes);

    let wKeys = wk.map((n, i) => {
        const active = noteSet.has(n);
        return `<rect x="${i * kw}" y="0" width="${kw - 1}" height="${kh}" rx="3" class="cpwk${active ? " cpa" : ""}"/>`
            + (active ? `<circle cx="${i * kw + kw / 2}" cy="${kh - 12}" r="7" class="cpd" style="fill:var(--ink)"/>` : "");
    }).join("");

    let bKeys = bk.map((n, i) => {
        if (n === -1) return "";
        const active = noteSet.has(n);
        const x = (i + 1) * kw - bw / 2 - 1;
        return `<rect x="${x}" y="0" width="${bw}" height="${bh}" rx="3" class="cpbk${active ? " cpa" : ""}"/>`
            + (active ? `<circle cx="${x + bw / 2}" cy="${bh - 9}" r="6" class="cpd" style="fill:#fff"/>` : "");
    }).join("");

    return `<svg width="${totalW}" height="${kh}" viewBox="0 0 ${totalW} ${kh}" class="cppiano">${wKeys}${bKeys}</svg>`;
}

function openChordPop(anchor, chord) {
    closeChordPop();
    if (S.edit || S.pres) return;
    const key = chordKey(chord);
    const pop = document.createElement("div");
    pop.className = "cdpop";
    // kliky uvnitř popupu nesmí probublat do dokumentu (po překreslení by popup zavřely)
    pop.addEventListener("click", e => e.stopPropagation());
    const tabs = [{ id: "guitar", label: "Kytara" }, { id: "ukulele", label: "Ukulele" }, { id: "piano", label: "Piano" }];
    function render() {
        const notes = chordNotes(chord);
        const content = cdTab === "guitar" ? fretboardSVG(GUITAR_CHORDS[key], 6)
            : cdTab === "ukulele" ? fretboardSVG(UKE_CHORDS[key], 4)
                : notes.length ? pianoSVG(notes) : `<div class="cdno">Akord nenalezen</div>`;
        pop.innerHTML = `
      <div class="cdhead">
        <span class="cdname">${esc(chord)}</span>
        <button class="cdcl" aria-label="Zavřít">×</button>
      </div>
      <div class="cdtabs">${tabs.map(t => `<button class="cdtb${cdTab === t.id ? " cdon" : ""}" data-cdtab="${t.id}">${t.label}</button>`).join("")}</div>
      <div class="cdcont">${content}</div>
    `;
        pop.querySelector(".cdcl").onclick = closeChordPop;
        pop.querySelectorAll(".cdtb").forEach(b => b.onclick = () => { cdTab = b.dataset.cdtab; ls("cdTab", cdTab); render(); });
    }
    render();
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    let left = rect.left + window.scrollX, top = rect.bottom + window.scrollY + 6;
    pop.style.visibility = "hidden"; pop.style.display = "block";
    const pw = pop.offsetWidth;
    if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12 + window.scrollX;
    if (left < 8 + window.scrollX) left = 8 + window.scrollX;
    pop.style.left = left + "px"; pop.style.top = top + "px"; pop.style.visibility = "";
}
function closeChordPop() { document.querySelectorAll(".cdpop").forEach(p => p.remove()) }
function fixChordCollisions() {
    const song = document.querySelector("pre.song");
    if (!song) return;
    const chords = song.querySelectorAll(".cc");
    for (const c of chords) c.style.left = "";
    let prev = null;
    for (const c of chords) {
        const r = c.getBoundingClientRect();
        if (prev && Math.abs(r.top - prev.top) < 14 && r.left < prev.right + 5) {
            const shift = Math.ceil(prev.right + 5 - r.left);
            c.style.left = shift + "px";
            prev = { top: r.top, bottom: r.bottom, left: r.left + shift, right: r.right + shift };
        } else {
            prev = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        }
    }
}
window.addEventListener("resize", fixChordCollisions);
if (document.fonts) document.fonts.ready.then(fixChordCollisions);

let tm; $("#q").addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { if (S.edit) return; S.song = null; setUrl(null, true); renderSongs() }, 180) });
(async () => { await loadSongs(); routeFromUrl(); renderSongs() })();

// ---- AI import: screenshot písničky -> koncept ve formátu zpěvníku. Běží na pozadí ve frontě (2 najednou), výsledky čekají v konceptech ----
let jobs = [], running = 0, jobSeq = 0, drafts = [];
try { drafts = JSON.parse(ls("ai_drafts") || "[]") } catch (e) { }
const saveDrafts = () => ls("ai_drafts", JSON.stringify(drafts));
function toast(msg) {                                        // krátká zpráva dole, vidět v každém zobrazení
    let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t) }
    t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true }, 5000);
}
function shrink(file, max = 2000) {                          // zmenší obrázek a převede na JPEG; 2000 px, ať jsou čitelné i drobné akordy
    return new Promise((ok, no) => {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"), x = c.getContext("2d");
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            ok({ mime: "image/jpeg", data: c.toDataURL("image/jpeg", .88).split(",")[1] });
        };
        img.onerror = () => no(new Error("obrázek nejde přečíst"));
        img.src = url;
    });
}
// originály screenshotů ke konceptům (IndexedDB, v localStorage by se nevešly); bez podpory prohlížeče se prostě nezobrazí
const idb = (() => {
    let db; const open = () => db || (db = new Promise((ok, no) => { const r = indexedDB.open("zpevnik", 1); r.onupgradeneeded = () => r.result.createObjectStore("img"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) }));
    const tx = async (mode, f) => { const d = await open(); return new Promise((ok, no) => { const t = d.transaction("img", mode), r = f(t.objectStore("img")); t.oncomplete = () => ok(r.result); t.onerror = t.onabort = () => no(t.error) }) };
    return { get: k => tx("readonly", s => s.get(k)).catch(() => null), set: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => { }), del: k => tx("readwrite", s => s.delete(k)).catch(() => { }) };
})();
async function showSrc(id) {
    const a = await idb.get(id), el = $("#aisrc"); if (!el) return;
    if (!a || !a.length) { const w = el.closest("details"); if (w) w.remove(); return }
    el.innerHTML = a.map(u => `<img src="${u}" alt="Originál">`).join("");
}
document.addEventListener("click", e => { const im = e.target.closest(".aisrc img"); if (im) fetch(im.src).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), "_blank")).catch(() => { }) });
document.addEventListener("input", e => { if (e.target.id === "aih") S.aih = e.target.value });
const aiRefresh = () => { const r = $("#airows"); if (r) r.innerHTML = aiRows() };   // překreslí jen frontu a koncepty (seznam i editor), rozepsaný text zůstane
function aiAdd(files, merge) {                               // merge = všechny obrázky patří k jedné písničce
    const groups = merge ? [files.slice(0, 4)] : files.map(f => [f]);
    groups.forEach(g => jobs.push({ id: "ai" + Date.now().toString(36) + (jobSeq++), files: g, name: g.map(f => f.name).join(", ") || "obrázek", hint: (S.aih || "").trim().slice(0, 300), st: "wait" }));
    aiPump(); aiRefresh();
}
function aiPump() {
    while (running < 2) {
        const j = jobs.find(x => x.st === "wait"); if (!j) return;
        j.st = "run"; running++; aiRun(j).finally(() => { running--; aiPump() });
    }
}
async function aiRun(j) {
    try {
        const images = await Promise.all(j.files.map(f => shrink(f)));
        let res;
        for (let k = 0; ; k++) {                             // výpadek spojení nebo odpověď Cloudflare (ne od Workeru): zkus znovu, max. 3×
            try { res = await (await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ act: "ai", pin: ls("pin") || "", images, hint: j.hint || "" }) })).json(); break }
            catch (e) { if (k >= 2) throw new Error("Worker neodpověděl (síť nebo limit Cloudflare)"); await new Promise(r => setTimeout(r, 2000)) }
        }
        if (!res.ok) throw new Error(res.error || "chyba serveru");
        const dup = songs && songs.some(x => norm(x.title.trim()) === norm((res.song.title || "").trim()));
        idb.set(j.id, images.map(i => "data:" + i.mime + ";base64," + i.data));
        drafts.push({ id: j.id, title: res.song.title || "Bez názvu", author: res.song.author || "", text: expand(res.song.text), notes: (dup ? "Písnička s tímto názvem už ve zpěvníku je. " : "") + (res.via && res.via !== "Gemini" ? "Přepsal záložní model (" + res.via + "), zkontroluj pozorně. " : "") + (res.notes || "") });
        saveDrafts(); jobs = jobs.filter(x => x !== j);
        toast("AI dokončila: " + (res.song.title || j.name) + (res.via && res.via !== "Gemini" ? " (záložní model: " + res.via + ")" : ""));
    } catch (err) { j.st = "err"; j.msg = err.message; toast("AI se nepovedla: " + j.name) }
    aiRefresh();
}
function aiRows() {                                          // fronta a koncepty (zobrazí se v seznamu i v editoru nové písničky)
    return jobs.map(j => j.st === "err"
        ? `<div class="job">⚠ ${esc(j.name)} – ${esc(j.msg)} <button class="btn" data-s="air" data-id="${j.id}">Znovu</button><button class="btn" data-s="aix" data-id="${j.id}">×</button></div>`
        : `<div class="job">⏳ ${j.st === "run" ? "Čtu" : "Čeká"}: ${esc(j.name)}</div>`).join("")
        + drafts.map(d => `<div class="job">✓ <b>${esc(d.title)}</b><button class="btn ac" data-s="aid" data-id="${d.id}">Zkontrolovat a uložit</button><button class="btn" data-s="aix" data-id="${d.id}" aria-label="Zahodit">×</button></div>`).join("");
}
function aiBox() {                                           // blok v editoru „+ Nová písnička“: přidání z obrázku, tip pro AI, fronta
    if (!API) return "";
    return `<div class="aib aip"><b>Přidat písničku z obrázku (AI)</b><p class="info">Vyber screenshot nebo fotku a AI ji přepíše. Výsledek se objeví níže mezi koncepty, tam ho zkontroluješ a uložíš.</p><input class="f1" id="aih" maxlength="300" placeholder="Tip pro AI (nepovinné), např. text je slovensky · akordy jsou anglicky · kapodastr na 2. pražci" value="${esc(S.aih || "")}" style="margin:8px 0">${ls("pin") ? "" : '<input class="f1" id="aipin" type="password" placeholder="PIN" style="max-width:140px;margin:0 0 8px">'}<button class="btn ac" data-s="aip">Vybrat obrázek</button> <label class="info"><input type="checkbox" id="aim"${S.aim ? " checked" : ""}> více obrázků = jedna písnička</label><input type="file" id="aif" accept="image/*" multiple hidden><div id="airows">${aiRows()}</div></div>`;
}
document.addEventListener("change", e => {
    if (e.target.id === "aim") S.aim = e.target.checked;
    if (e.target.id !== "aif" || !e.target.files.length) return;
    const files = [...e.target.files]; e.target.value = "";
    aiAdd(files, S.aim);
});

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