const S={
study:null,
scenario:null,
key:null,
mode:"with_defense",
leftLayer:null,
rightLayer:null,
leftBase:null,
rightBase:null,
syncing:false
};

const map=L.map("map");
const compareMap=L.map("map-compare");

const BASE={
imagery:()=>L.tileLayer(
"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
{attribution:"Tiles © Esri"}
),
streets:()=>L.tileLayer(
"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
{maxZoom:19,attribution:"© OpenStreetMap contributors"}
)
};

const P={
turbo:[[48,18,59],[65,68,135],[42,120,142],[34,168,132],[122,209,81],[253,231,37],[180,4,38]],
blues:[[247,251,255],[198,219,239],[107,174,214],[33,113,181],[8,48,107]],
viridis:[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]],
plasma:[[13,8,135],[126,3,168],[203,71,119],[248,149,64],[240,249,33]]
};

const f=(v,d=2)=>
v===null||v===undefined||Number.isNaN(Number(v))
?"—"
:Number(v).toFixed(d);

function conditions(){
return [...new Map(
S.study.scenarios.map(s=>[s.condition_id,s.condition_name])
).entries()];
}

function byCondition(id){
return S.study.scenarios
.filter(s=>s.condition_id===id)
.sort((a,b)=>a.slr_m-b.slr_m);
}

function scenario(){
const c=document.querySelector("#condition-select").value;
const l=Number(document.querySelector("#slr-select").value);
return S.study.scenarios.find(
s=>s.condition_id===c&&Number(s.slr_m)===l
);
}

function fillSlr(){
const id=document.querySelector("#condition-select").value;
const e=document.querySelector("#slr-select");
e.innerHTML="";
byCondition(id).forEach(
s=>e.add(new Option(`${f(s.slr_m,1)} m`,s.slr_m))
);
}

function forcing(){
const s=S.scenario;
const tide=Number(S.study.tide_level_m ?? 0.57);
const surge=Number(s.storm_surge_m || 0);
const slr=Number(s.slr_m || 0);
const combined=tide+surge+slr;

document.querySelector("#forcing").innerHTML=
`<dt>Return interval</dt><dd>${s.return_period_years?`${s.return_period_years} years`:"Historical event"}</dd>
<dt>Incident Hs</dt><dd>${f(s.Hs_m)} m</dd>
<dt>Peak period</dt><dd>${f(s.Tp_s)} s</dd>
<dt>Direction</dt><dd>Shore normal</dd>
<dt>Tide level MHWS</dt><dd>${f(tide)} m</dd>
<dt>Storm surge</dt><dd>${f(surge)} m</dd>
<dt>SLR increment</dt><dd>${f(slr)} m</dd>
<dt>Combined water level</dt><dd>${f(combined)} m</dd>`;
}

function statDL(v){
return `<dl>
<dt>Maximum water level</dt><dd>${f(v.maximum_water_level_m)} m</dd>
<dt>Maximum overland depth</dt><dd>${f(v.maximum_overland_depth_m)} m</dd>
<dt>Overland area</dt><dd>${f((v.inundated_overland_area_m2||0)/1e6,3)} km²</dd>
<dt>Mean overland depth</dt><dd>${f(v.mean_overland_depth_m)} m</dd>
<dt>Maximum Hsig</dt><dd>${f(v.maximum_hs_m)} m</dd>
</dl>`;
}

function statistics(){
const d=S.scenario.variants.with_defense.summary;
const r=S.scenario.variants.without_defense.summary;
const box=document.querySelector("#statistics");
const title=document.querySelector("#statistics-title");

if(S.mode==="compare"){
title.textContent="Seawall comparison";

const areaD=Number(d.inundated_overland_area_m2 || 0);
const areaR=Number(r.inundated_overland_area_m2 || 0);
const reduction=areaR-areaD;
const reductionPct=areaR>0 ? 100*reduction/areaR : null;

box.innerHTML=
`<dl>
<dt>With seawall</dt><dd>${f(areaD/1e6,3)} km²</dd>
<dt>Without seawall</dt><dd>${f(areaR/1e6,3)} km²</dd>
<dt>Area reduction</dt><dd>${f(reduction/1e6,3)} km²</dd>
<dt>Reduction</dt><dd>${reductionPct===null?"—":f(reductionPct,1)+" %"}</dd>
</dl>`;
}else{
title.textContent=S.mode==="with_defense"
?"With-seawall statistics"
:"Without-seawall statistics";

const v=S.mode==="with_defense"?d:r;
box.innerHTML=`<div class="single-stats">${statDL(v)}</div>`;
}
}

function setBase(name){
if(S.leftBase)map.removeLayer(S.leftBase);
if(S.rightBase)compareMap.removeLayer(S.rightBase);

S.leftBase=null;
S.rightBase=null;

if(name!=="none"){
S.leftBase=BASE[name]().addTo(map);
S.rightBase=BASE[name]().addTo(compareMap);
}
}

function removeResult(which){
if(which==="left"&&S.leftLayer){
map.removeLayer(S.leftLayer);
S.leftLayer=null;
}
if(which==="right"&&S.rightLayer){
compareMap.removeLayer(S.rightLayer);
S.rightLayer=null;
}
}

function imageUrl(info){
const separator=info.display_url.includes("?")?"&":"?";
return `${info.display_url}${separator}build=${encodeURIComponent(S.study.build_id||"1")}`;
}

function preload(url){
return new Promise((resolve,reject)=>{
const img=new Image();
img.onload=()=>resolve();
img.onerror=()=>reject(new Error(`Could not load display image: ${url}`));
img.src=url;
});
}

async function loadVariant(which,variantKey){
const variant=S.scenario.variants[variantKey];
const info=variant.layers[S.key];

if(!info){
throw new Error(`Layer unavailable for ${variant.label}.`);
}

const url=imageUrl(info);
await preload(url);

const opacity=Number(document.querySelector("#opacity").value);
const layer=L.imageOverlay(
url,
info.leaflet_bounds,
{
opacity:opacity,
interactive:false,
crossOrigin:false
}
);

if(which==="left"){
removeResult("left");
S.leftLayer=layer;
layer.addTo(map);
}else{
removeResult("right");
S.rightLayer=layer;
layer.addTo(compareMap);
}

return {info,layer};
}

function updateLegend(info){
const meta=S.study.layers[S.key];
const stops=P[meta.palette]||P.viridis;

document.querySelector("#legend-gradient").style.background=
`linear-gradient(90deg,${stops.map(c=>`rgb(${c})`).join(",")})`;

document.querySelector("#legend-min").textContent=
`${f(info.min)} ${meta.units}`;

document.querySelector("#legend-max").textContent=
`${f(info.max)} ${meta.units}`;

}

function updateDownloads(){
const d=S.scenario.variants.with_defense;
const r=S.scenario.variants.without_defense;

document.querySelector("#download-layer-defense").href=
d.layers[S.key]?.url||"#";

document.querySelector("#download-layer-raw").href=
r.layers[S.key]?.url||"#";

document.querySelector("#download-netcdf-defense").href=
d.summary_netcdf||"#";

document.querySelector("#download-netcdf-raw").href=
r.summary_netcdf||"#";
}

const nextLayoutFrame=()=>new Promise(resolve=>{
requestAnimationFrame(()=>requestAnimationFrame(resolve));
});

async function load(fit=true){
const loading=document.querySelector("#loading");
loading.style.display="block";

try{
S.scenario=scenario();
S.key=document.querySelector("#layer-select").value;

forcing();
statistics();
updateDownloads();

const grid=document.querySelector("#map-grid");
const leftLabel=document.querySelector("#map-label-left");

if(S.mode==="compare"){
grid.classList.add("compare");
leftLabel.textContent="With seawall";

await nextLayoutFrame();
map.invalidateSize({animate:false,pan:false});
compareMap.invalidateSize({animate:false,pan:false});

const [a,b]=await Promise.all([
loadVariant("left","with_defense"),
loadVariant("right","without_defense")
]);

updateLegend(a.info);

const bounds=L.latLngBounds(a.info.leaflet_bounds);
map.fitBounds(bounds,{animate:false,padding:[8,8]});

await nextLayoutFrame();

compareMap.setView(
map.getCenter(),
map.getZoom(),
{animate:false}
);

map.invalidateSize({animate:false,pan:false});
compareMap.invalidateSize({animate:false,pan:false});

}else{
grid.classList.remove("compare");
removeResult("right");

const variantKey=S.mode;
leftLabel.textContent=
variantKey==="with_defense"
?"With seawall"
:"Without seawall";

await nextLayoutFrame();
map.invalidateSize({animate:false,pan:false});

const a=await loadVariant("left",variantKey);
updateLegend(a.info);

if(fit){
map.fitBounds(
L.latLngBounds(a.info.leaflet_bounds),
{animate:false,padding:[8,8]}
);
}

map.invalidateSize({animate:false,pan:false});
}
}finally{
loading.style.display="none";
}
}

function setMode(mode){
S.mode=mode;

document.querySelectorAll(".mode-button")
.forEach(b=>b.classList.remove("active"));

const selector=
mode==="with_defense"?"#mode-defense":
mode==="without_defense"?"#mode-raw":
"#mode-compare";

document.querySelector(selector).classList.add("active");
load(true);
}

function syncFrom(sourceMap,targetMap){
if(S.mode!=="compare"||S.syncing)return;

S.syncing=true;
targetMap.setView(
sourceMap.getCenter(),
sourceMap.getZoom(),
{animate:false}
);
S.syncing=false;
}

map.on("moveend zoomend",()=>{
syncFrom(map,compareMap);
});

compareMap.on("moveend zoomend",()=>{
syncFrom(compareMap,map);
});

async function init(){
S.study=await(
await fetch(`data/study.json?build=${Date.now()}`)
).json();

document.querySelector("#study-subtitle").textContent=
S.study.subtitle;

const c=document.querySelector("#condition-select");
conditions().forEach(
([id,n])=>c.add(new Option(n,id))
);

fillSlr();

const l=document.querySelector("#layer-select");
Object.entries(S.study.layers).forEach(
([k,m])=>l.add(new Option(m.label,k))
);

setBase("imagery");
await load(true);
}

document.querySelector("#condition-select").onchange=()=>{
fillSlr();
load(true);
};

document.querySelector("#slr-select").onchange=()=>load(true);
document.querySelector("#layer-select").onchange=()=>load(true);

document.querySelector("#basemap-select").onchange=
e=>setBase(e.target.value);

document.querySelector("#opacity").oninput=e=>{
const o=Number(e.target.value);
if(S.leftLayer)S.leftLayer.setOpacity(o);
if(S.rightLayer)S.rightLayer.setOpacity(o);
};

document.querySelector("#mode-defense").onclick=
()=>setMode("with_defense");

document.querySelector("#mode-raw").onclick=
()=>setMode("without_defense");

document.querySelector("#mode-compare").onclick=
()=>setMode("compare");

window.addEventListener("resize",()=>{
map.invalidateSize({animate:false,pan:false});
if(S.mode==="compare"){
compareMap.invalidateSize({animate:false,pan:false});
}
});

init().catch(e=>{
const b=document.querySelector("#loading");
b.textContent=e.message;
b.style.display="block";
console.error(e);
});
