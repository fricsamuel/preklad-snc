
const NAMES="Genesis|Exodus|Leviticus|Numeri|Deuteronomium|Jozue|Soudců|Rút|1. Samuelova|2. Samuelova|1. Královská|2. Královská|1. Paralipomenon|2. Paralipomenon|Ezdráš|Nehemjáš|Ester|Job|Žalmy|Přísloví|Kazatel|Píseň písní|Izajáš|Jeremjáš|Pláč|Ezechiel|Daniel|Ozeáš|Joel|Amos|Abdijáš|Jonáš|Micheáš|Nahum|Abakuk|Sofonjáš|Ageus|Zacharjáš|Malachiáš|Matouš|Marek|Lukáš|Jan|Skutky|Římanům|1. Korintským|2. Korintským|Galatským|Efezským|Filipským|Kolosským|1. Tesalonickým|2. Tesalonickým|1. Timoteovi|2. Timoteovi|Titovi|Filemonovi|Židům|Jakubův|1. Petrův|2. Petrův|1. Janův|2. Janův|3. Janův|Juda|Zjevení".split("|");
const $=s=>document.querySelector(s),esc=s=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm=s=>{let o="";for(const c of s){const n=c.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();o+=n[0]||c}return o};
let S={b:0,c:0,view:"read",focus:null,max:100},idx=null;
function drawer(o){$("#nav").classList.toggle("open",o);$("#bd").classList.toggle("open",o)}
function verses(b,c){const out=[];BIBLE[b][c].forEach((t,i)=>{if(t.trim()==="***")return;const m=t.match(/^(\d+\s?[-–]\s?\d+)\s+([\s\S]*)$/);out.push(m?[m[1].replace(/\s/g,"–"),m[2],i]:[String(i+1),t,i])});return out}
function terms(){return norm($("#q").value.trim()).split(/\s+/).filter(Boolean)}
function hl(text,ts){if(!ts.length)return esc(text);const n=norm(text),rg=[];
for(const t of ts){let p=0;while((p=n.indexOf(t,p))>-1){rg.push([p,p+t.length]);p+=t.length}}
if(!rg.length)return esc(text);rg.sort((a,b)=>a[0]-b[0]);const m=[];for(const r of rg){const l=m[m.length-1];if(l&&r[0]<=l[1])l[1]=Math.max(l[1],r[1]);else m.push(r.slice())}
let o="",p=0;for(const[a,b]of m){o+=esc(text.slice(p,a))+"<mark>"+esc(text.slice(a,b))+"</mark>";p=b}return o+esc(text.slice(p))}
function navUI(){let h='<button class="btn" id="xn" style="float:right">Zavřít</button>';[["Starý zákon",0,39],["Nový zákon",39,66]].forEach(([t,a,z])=>{h+=`<h2>${t}</h2>`;for(let i=a;i<z;i++){h+=`<button class="bk${i===S.b?" on":""}" data-b="${i}">${NAMES[i]}</button>`;
if(i===S.b){h+='<div class="chs">';for(let c=0;c<BIBLE[i].length;c++)h+=`<button class="${c===S.c?"on":""}" data-b="${i}" data-c="${c}">${c+1}</button>`;h+="</div>"}}});$("#nav").innerHTML=h}
function go(b,c,f,keep){S.b=b;S.c=c;S.focus=f??null;S.view="read";history.replaceState(null,"","#"+(b+1)+"-"+(c+1));if(!keep)drawer(false);render();
if(keep){const e=document.querySelector(".chs");e&&e.scrollIntoView({block:"nearest"})}else if(f==null)window.scrollTo(0,0);else{const e=document.querySelector(".v.f");e&&e.scrollIntoView({block:"center"})}}
function render(){navUI();const ts=terms(),q=ts.length&&$("#q").value.trim().length>1;
if(S.view==="results"&&q){results(ts);return}
const vs=verses(S.b,S.c),sc=$("#sc").value;let hits=0;
const body=vs.map(([n,t,i])=>{const w=q?hl(t,ts):esc(t);if(q&&w.includes("<mark>"))hits++;return`<p class="v${S.focus===i?" f":""}"><sup>${n}</sup>${w}</p>`}).join("");
const info=q?`<p class="info">Shody v této kapitole: ${hits}</p>`:"";
const pv=S.c>0?[S.b,S.c-1]:S.b>0?[S.b-1,BIBLE[S.b-1].length-1]:null,nx=S.c<BIBLE[S.b].length-1?[S.b,S.c+1]:S.b<65?[S.b+1,0]:null;
const lb=a=>a?`${NAMES[a[0]]} ${a[1]+1}`:"";
$("#main").innerHTML=`<article>${info}<h2>${NAMES[S.b]} ${S.c+1}</h2>${body}<div class="pg">${pv?`<button class="btn" data-b="${pv[0]}" data-c="${pv[1]}">← ${lb(pv)}</button>`:"<span></span>"}${nx?`<button class="btn" data-b="${nx[0]}" data-c="${nx[1]}">${lb(nx)} →</button>`:""}</div>
<p class="foot">Slovo na cestu™ (Czech Living New Testament™) © 1988, 2000, 2012 Biblica, Inc.</p></article>`}
function results(ts){if(!idx)idx=BIBLE.map(b=>b.map(c=>c.map(norm)));const sc=$("#sc").value,res=[];
for(let b=0;b<66;b++){if(sc==="book"&&b!==S.b)continue;for(let c=0;c<BIBLE[b].length;c++)for(let i=0;i<idx[b][c].length;i++){const n=idx[b][c][i];if(ts.every(t=>n.includes(t)))res.push([b,c,i])}}
const shown=res.slice(0,S.max);
$("#main").innerHTML=`<article><p class="info">${res.length?`Nalezeno veršů: ${res.length}`+(sc==="book"?` v knize ${NAMES[S.b]}`:""):"Nic nenalezeno. Zkuste kratší nebo jiné slovo."}</p>`+
shown.map(([b,c,i])=>{const t=BIBLE[b][c][i],m=t.match(/^(\d+\s?[-–]\s?\d+)\s+([\s\S]*)$/);return`<button class="r" data-b="${b}" data-c="${c}" data-v="${i}"><b>${NAMES[b]} ${c+1}:${m?m[1].replace(/\s/g,"–"):i+1}</b>${hl(m?m[2]:t,ts)}</button>`}).join("")+
(res.length>S.max?`<button class="btn" id="more">Zobrazit dalších ${Math.min(100,res.length-S.max)}</button>`:"")+"</article>"}
document.addEventListener("click",e=>{const t=e.target.closest("[data-b],#more,#menu,#fs,#th,#xn,#bd");if(!t)return;
if(t.id==="more"){S.max+=100;render()}else if(t.id==="xn"||t.id==="bd")drawer(false);else if(t.id==="menu")drawer(true);
else if(t.id==="fs"){const r=document.documentElement,v=parseInt(getComputedStyle(r).getPropertyValue("--fs"));r.style.setProperty("--fs",(v>=26?16:v+2)+"px")}
else if(t.id==="th"){const r=document.documentElement,d=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme:dark)").matches;const next=d?"light":"dark";r.dataset.theme=next;localStorage.setItem("theme",next)}
else if(t.dataset.b!=null){const b=+t.dataset.b;if(t.classList.contains("bk")){go(b,0,null,true)}else go(b,+(t.dataset.c??0),t.dataset.v!=null?+t.dataset.v:null)}});
let tm;$("#q").addEventListener("input",()=>{clearTimeout(tm);tm=setTimeout(()=>{S.max=100;S.focus=null;S.view=$("#sc").value==="chapter"?"read":"results";render()},180)});
$("#sc").addEventListener("change",()=>{S.max=100;S.view=$("#sc").value==="chapter"?"read":"results";render()});
const m=location.hash.match(/^#(\d+)-(\d+)$/);if(m&&BIBLE[m[1]-1]&&BIBLE[m[1]-1][m[2]-1]){S.b=m[1]-1;S.c=m[2]-1}
render();
