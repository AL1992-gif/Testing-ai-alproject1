const APP_BUILD = "20260715.5";
const FALLBACK = [
  {id:"rba-1",title:"A2A Payments Roundtable releases vision for account-to-account payments in Australia",link:"https://www.rba.gov.au/media-releases/2026/mr-26-18.html",source:"Reserve Bank of Australia",publishedAt:"2026-07-08T00:00:00+10:00",category:"official",official:true,description:"An official RBA update on the future of account-to-account payments in Australia."},
  {id:"rba-2",title:"Review of Payments System Regulation",link:"https://www.rba.gov.au/media-releases/2026/mr-26-17.html",source:"Reserve Bank of Australia",publishedAt:"2026-06-25T00:00:00+10:00",category:"official",official:true,description:"The RBA publishes an official update on payments system regulation."}
];

const $ = id => document.getElementById(id);
function readJSON(key, fallback) { try { const value=localStorage.getItem(key); return value===null?fallback:JSON.parse(value); } catch { return fallback; } }
function readText(key, fallback="") { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, typeof value==="string"?value:JSON.stringify(value)); return true; } catch { return false; } }

const state = {
  articles: [], category: "all", query: "", newest: true, view: "feed",
  saved: new Set(readJSON("aufp_saved", [])),
  auto: readText("aufp_auto", "true") !== "false",
  compact: readText("aufp_compact", "false") === "true",
  brief: readText("aufp_brief", ""), timer: null, installPrompt: null
};

function esc(v="") { return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function safeUrl(v="") { try { const u=new URL(v); return /^https?:$/.test(u.protocol)?u.href:"#"; } catch { return "#"; } }
function normalise(a) { return {id:a.id||`${Date.now()}-${Math.random()}`,title:a.title||"Untitled story",link:safeUrl(a.link),source:a.source||"Unknown source",publishedAt:a.publishedAt||new Date().toISOString(),category:a.category||"all",official:Boolean(a.official),description:a.description||"Open the original source for the full context."}; }
function ago(value) { const t=new Date(value).getTime(); if(!Number.isFinite(t)) return "Recently"; const m=Math.max(0,Math.floor((Date.now()-t)/60000)); if(m<1)return"Just now"; if(m<60)return`${m}m ago`; const h=Math.floor(m/60); if(h<24)return`${h}h ago`; const d=Math.floor(h/24); if(d<7)return`${d}d ago`; return new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short"}).format(new Date(t)); }
function toast(text) { const n=$("toast"); n.textContent=text; n.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>n.classList.remove("show"),3600); }

function filtered() {
  const q=state.query.trim().toLowerCase();
  return state.articles.filter(a => (state.category==="all" || a.category===state.category || (state.category==="official"&&a.official)) && (!q || `${a.title} ${a.source} ${a.description}`.toLowerCase().includes(q)))
    .sort((a,b)=>(state.newest?1:-1)*(new Date(b.publishedAt)-new Date(a.publishedAt)));
}

function card(a) {
  const saved=state.saved.has(a.id);
  return `<article class="news-card" data-id="${esc(a.id)}">
    <div class="news-meta"><span class="source-badge">${esc(a.source)}</span><span class="dot"></span><span>${esc(ago(a.publishedAt))}</span>${a.official?'<span class="official-tag">OFFICIAL</span>':""}</div>
    <h3>${esc(a.title)}</h3><p>${esc(a.description)}</p>
    <div class="card-actions"><a href="${esc(a.link)}" target="_blank" rel="noopener">Open source <span>↗</span></a>
      <div><button class="mini share" data-share="${esc(a.id)}" aria-label="Share">↗</button><button class="mini save ${saved?"saved":""}" data-save="${esc(a.id)}" aria-label="Save">${saved?"★":"☆"}</button></div>
    </div></article>`;
}

function render() {
  const items=filtered();
  $("newsList").innerHTML=items.map(card).join("");
  $("emptyState").classList.toggle("hidden",Boolean(items.length));
  $("headlineCount").textContent=state.articles.length;
  $("officialCount").textContent=state.articles.filter(a=>a.official).length;
  $("savedCount").textContent=state.saved.size;
  const labels={all:"Top stories",markets:"Markets",economy:"Economy",companies:"Companies",housing:"Housing",super:"Super & retirement",official:"Official updates"};
  $("feedTitle").textContent=labels[state.category]||"Top stories";
  renderSaved();
}
function renderSaved() {
  const items=state.articles.filter(a=>state.saved.has(a.id));
  $("savedList").innerHTML=items.map(card).join("");
  $("savedEmpty").classList.toggle("hidden",Boolean(items.length));
  $("clearSavedButton").classList.toggle("hidden",!items.length);
}

async function requestFeed() {
  const stamp=Date.now();
  const endpoints=[
    new URL(`news.json?build=${APP_BUILD}&t=${stamp}`,location.href).href,
    `https://raw.githubusercontent.com/AL1992-gif/Testing-ai-alproject1/main/docs/news.json?t=${stamp}`
  ];
  const failures=[];
  for(const endpoint of endpoints) {
    try {
      const response=await fetch(endpoint,{cache:"no-store",headers:{Accept:"application/json"}});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const text=await response.text();
      if(text.trim().startsWith("<")) throw new Error("HTML returned instead of JSON");
      const data=JSON.parse(text);
      if(!Array.isArray(data.articles)||!data.articles.length) throw new Error("No articles in response");
      return {data,endpoint};
    } catch(error) { failures.push(`${new URL(endpoint).hostname}: ${error.message}`); }
  }
  throw new Error(failures.join(" | "));
}

async function loadNews(silent=false) {
  if(!silent) $("newsList").innerHTML='<div class="loading-card">Refreshing Australian finance feeds…</div>';
  $("refreshButton").classList.add("loading"); $("syncStatus").textContent="Checking updated headlines…";
  try {
    const {data,endpoint}=await requestFeed();
    state.articles=data.articles.map(normalise);
    write("aufp_cache",{articles:state.articles,generatedAt:data.generatedAt});
    $("syncStatus").textContent="Auto-updated feed connected";
    $("lastUpdated").textContent=`Updated ${ago(data.generatedAt||new Date().toISOString())}`;
    if(!silent && endpoint.includes("raw.githubusercontent.com")) toast("Feed connected through backup source");
  } catch(err) {
    const cache=readJSON("aufp_cache",null);
    state.articles=(cache?.articles?.length?cache.articles:FALLBACK).map(normalise);
    $("syncStatus").textContent=cache?.articles?.length?"Network issue · showing last saved feed":"Feed connection failed";
    $("lastUpdated").textContent=cache?.generatedAt?`Saved ${ago(cache.generatedAt)}`:"";
    if(!silent) toast(`Feed error: ${String(err.message||err).slice(0,110)}`);
    console.warn("AU Finance feed error",err);
  } finally { $("refreshButton").classList.remove("loading"); render(); }
}

function save(id) { state.saved.has(id)?state.saved.delete(id):state.saved.add(id); write("aufp_saved",[...state.saved]); render(); toast(state.saved.has(id)?"Story saved":"Removed from saved"); }
async function share(id) { const a=state.articles.find(x=>x.id===id); if(!a)return; try { if(navigator.share) await navigator.share({title:a.title,text:`${a.title} — ${a.source}`,url:a.link}); else { await navigator.clipboard.writeText(`${a.title}\n${a.link}`); toast("Link copied"); } } catch(e) { if(e.name!=="AbortError") toast("Could not share"); } }

function quickBrief() {
  const top=filtered().slice(0,12); if(!top.length)return toast("Refresh the feed first");
  const group=(name,cats)=>{const rows=top.filter(a=>cats.includes(a.category)||(cats.includes("official")&&a.official)).slice(0,2); return `• ${name}: ${rows.length?rows.map(a=>a.title.replace(/[.!?]+$/,"" )).join("; "):"No major headline in the current feed"}.`;};
  const lead=top.slice(0,2).map(a=>a.title.replace(/[.!?]+$/,"" )).join("; ");
  state.brief=`${lead}.\n\n${group("Markets",["markets"])}\n${group("Economy",["economy","official"])}\n${group("Companies & consumers",["companies","housing","super"])}\n\nHeadline-based overview only — open the original sources for context. Not financial advice.`;
  write("aufp_brief",state.brief); $("briefText").textContent=state.brief; $("shareBriefButton").disabled=false;
}
async function shareBrief() { if(!state.brief)return; const text=`AU Finance Pulse\n\n${state.brief}`; try { if(navigator.share) await navigator.share({title:"AU Finance Pulse",text}); else { await navigator.clipboard.writeText(text); toast("Brief copied"); } } catch(e) { if(e.name!=="AbortError") toast("Could not share"); } }

function switchView(view) {
  state.view=view; $("mainContent").classList.toggle("hidden",view!=="feed"); $("savedView").classList.toggle("hidden",view!=="saved"); $("sourcesView").classList.toggle("hidden",view!=="sources"); $("settingsView").classList.toggle("hidden",view!=="settings");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view)); if(view==="saved")renderSaved(); scrollTo({top:0,behavior:"smooth"});
}
function timer() { clearInterval(state.timer); if(state.auto) state.timer=setInterval(()=>loadNews(true),15*60*1000); }
function install() { if(state.installPrompt){state.installPrompt.prompt();state.installPrompt=null;} else $("installSheet").classList.remove("hidden"); }

function bind() {
  $("refreshButton").onclick=()=>loadNews(); $("briefButton").onclick=quickBrief; $("shareBriefButton").onclick=shareBrief;
  $("searchInput").oninput=e=>{state.query=e.target.value;$("clearSearch").style.display=state.query?"grid":"none";render();};
  $("clearSearch").onclick=()=>{$("searchInput").value="";state.query="";$("clearSearch").style.display="none";render();};
  $("categoryTabs").onclick=e=>{const b=e.target.closest("[data-category]");if(!b)return;state.category=b.dataset.category;document.querySelectorAll(".category-tab").forEach(x=>x.classList.toggle("active",x===b));render();};
  $("sortButton").onclick=e=>{state.newest=!state.newest;e.currentTarget.textContent=state.newest?"Newest":"Oldest";render();};
  document.onclick=e=>{const s=e.target.closest("[data-save]");if(s)return save(s.dataset.save);const sh=e.target.closest("[data-share]");if(sh)return share(sh.dataset.share);};
  document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $("clearSavedButton").onclick=()=>{state.saved.clear();write("aufp_saved",[]);render();toast("Saved stories cleared");};
  $("autoRefreshToggle").checked=state.auto; $("compactToggle").checked=state.compact; document.body.classList.toggle("compact",state.compact);
  $("autoRefreshToggle").onchange=e=>{state.auto=e.target.checked;write("aufp_auto",String(state.auto));timer();};
  $("compactToggle").onchange=e=>{state.compact=e.target.checked;write("aufp_compact",String(state.compact));document.body.classList.toggle("compact",state.compact);};
  $("installButton").onclick=install; $("closeInstallSheet").onclick=()=>$("installSheet").classList.add("hidden"); $("installSheet").onclick=e=>{if(e.target===$("installSheet"))$("installSheet").classList.add("hidden");};
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e;});
  let start=0,dist=0; addEventListener("touchstart",e=>{if(scrollY===0)start=e.touches[0].clientY;},{passive:true}); addEventListener("touchmove",e=>{if(!start||scrollY>0)return;dist=Math.max(0,e.touches[0].clientY-start);$("pullIndicator").classList.toggle("visible",dist>55);},{passive:true}); addEventListener("touchend",()=>{if(dist>85)loadNews(true);start=dist=0;$("pullIndicator").classList.remove("visible");},{passive:true});
}

async function refreshAppCache() {
  try {
    const previous=readText("aufp_build","");
    if(previous!==APP_BUILD && "caches" in window) {
      const keys=await caches.keys();
      await Promise.all(keys.filter(key=>key.startsWith("au-finance-pulse")).map(key=>caches.delete(key)));
      write("aufp_build",APP_BUILD);
    }
    if("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      const registration=await navigator.serviceWorker.register(`./sw.js?v=${APP_BUILD}`,{updateViaCache:"none"});
      registration.update().catch(()=>{});
    }
  } catch(error) { console.warn("Cache refresh failed",error); }
}

function init() {
  $("todayLabel").textContent=new Intl.DateTimeFormat("en-AU",{weekday:"short",day:"numeric",month:"short"}).format(new Date());
  if(state.brief){$("briefText").textContent=state.brief;$("shareBriefButton").disabled=false;}
  bind(); timer(); refreshAppCache(); loadNews();
}
document.addEventListener("DOMContentLoaded",init);
