let appData=getLocalData(),currentUser=null,charts={},equipment=[],equipmentFilter="all",editingEquipmentId=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const normalizeText=s=>String(s??"").trim().toLowerCase();
const normalizeKey=s=>normalizeText(s).replace(/[^a-z0-9]+/g,"");
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function localDate(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
function setStatus(text,online=false){if($("syncStatus")){$("syncStatus").textContent=text;$("syncStatus").classList.toggle("online",online);}}
function showMessage(id,text,type=""){const el=$(id);if(!el)return;el.className="message"+(type?` ${type}`:"");el.textContent=text;}
function typeIs(e,type){return normalizeText(e?.type)===normalizeText(type);}
function getStrengthEquipment(){return equipment.filter(e=>typeIs(e,"strength")).sort((a,b)=>a.name.localeCompare(b.name));}
function getCardioEquipment(){return equipment.filter(e=>typeIs(e,"cardio")).sort((a,b)=>a.name.localeCompare(b.name));}
function findEquipment(name){const key=normalizeKey(name);return equipment.find(e=>normalizeKey(e.name)===key)||null;}

async function init(){
  $("workoutDate").value=localDate();
  document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
  $("addExerciseBtn").onclick=()=>addExerciseRow();
  $("loadPreviousBtn").onclick=loadPreviousSession;
  $("loadRecommendedBtn").onclick=loadRecommendedWorkout;
  $("saveWorkoutBtn").onclick=saveWorkout;
  $("clearWorkoutBtn").onclick=clearWorkoutForm;
  $("exportJsonBtn").onclick=()=>downloadBlob(new Blob([JSON.stringify(appData,null,2)],{type:"application/json"}),"fitness-backup.json");
  $("exportCsvBtn").onclick=exportCSV;
  $("importFile").onchange=importJSON;
  $("deleteAllBtn").onclick=deleteAllCloudData;
  $("signInBtn").onclick=()=>authenticate(false);
  $("signUpBtn").onclick=()=>authenticate(true);
  $("logoutBtn").onclick=()=>supabaseClient.auth.signOut();
  $("addEquipmentBtn").onclick=()=>openEquipmentForm();
  $("cancelEquipmentBtn").onclick=closeEquipmentForm;
  $("saveEquipmentBtn").onclick=saveEquipment;
  $("equipmentType").onchange=updateEquipmentBenefitVisibility;
  document.querySelectorAll(".equipment-filter").forEach(b=>b.onclick=()=>{equipmentFilter=b.dataset.filter;document.querySelectorAll(".equipment-filter").forEach(x=>x.classList.toggle("active",x===b));renderEquipment();});
  window.addEventListener("online",()=>syncFromCloud().catch(()=>setStatus("Offline cache")));
  window.addEventListener("offline",()=>setStatus("Offline cache"));
  supabaseClient.auth.onAuthStateChange(async(_event,session)=>{if(session?.user){currentUser=session.user;await enterApp();}else{currentUser=null;$("appShell").hidden=true;$("authScreen").hidden=false;}});
  try{const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;if(data.session){currentUser=data.session.user;await enterApp();}else{$("authScreen").hidden=false;}}catch(e){console.error(e);showMessage("authMessage",e.message||"Could not initialize the app.","error");}
}

async function authenticate(signup){
  const email=$("authEmail").value.trim(),password=$("authPassword").value;showMessage("authMessage","");
  if(!email||password.length<6){showMessage("authMessage","Enter an email and a password of at least 6 characters.","error");return;}
  const result=signup?await supabaseClient.auth.signUp({email,password}):await supabaseClient.auth.signInWithPassword({email,password});
  if(result.error){showMessage("authMessage",result.error.message,"error");return;}
  showMessage("authMessage",signup?"Account created. Check your email if confirmation is required.":"Signed in.","success");
}

async function enterApp(){
  $("authScreen").hidden=true;$("appShell").hidden=false;$("userEmail").textContent=currentUser.email||"";setStatus("Connecting…");
  const localBeforeCloud=getLocalData();
  let cloudOK=false,cloud={workouts:[]};
  try{cloud=await loadCloudData();cloudOK=true;setStatus("Synced",true);}catch(e){console.error("Workout cloud load failed",e);appData=localBeforeCloud;setStatus("Offline cache");}
  if(cloudOK){
    if(!cloud.workouts.length&&localBeforeCloud.workouts.length){
      const yes=confirm("No cloud workouts were found. Import your existing local workouts into your account?");
      if(yes){try{await replaceCloudData(localBeforeCloud,currentUser.id);appData=localBeforeCloud;setStatus("Synced",true);}catch(e){console.error(e);appData=cloud;alert("Could not import the local workouts.");}}
      else appData=cloud;
    }else appData=cloud;
  }
  try{equipment=await loadEquipmentCloud();appData.equipment=equipment;setLocalData(appData);}catch(e){console.error("Equipment load failed",e);equipment=localBeforeCloud.equipment||[];appData.equipment=equipment;if(equipment.length)showMessage("equipmentMessage","Using cached equipment. Supabase equipment could not be loaded.","error");}
  clearWorkoutForm();renderDashboard();
}

function showTab(id){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));$(id)?.classList.add("active");document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");
  if(id==="dashboard")renderDashboard();if(id==="equipment")renderEquipment();if(id==="history")renderHistory();if(id==="progress"){renderCharts();renderBenchmarkTable();}
}

function buildEquipmentOptions(selected=""){
  return `<option value="">Select exercise…</option>`+getStrengthEquipment().map(e=>`<option value="${esc(e.name)}" ${normalizeKey(e.name)===normalizeKey(selected)?"selected":""}>${esc(e.name)}</option>`).join("");
}
function populateCardioSelect(selected=""){
  const select=$("cardioType");if(!select)return;select.innerHTML=`<option value="">No cardio</option>`+getCardioEquipment().map(e=>`<option value="${esc(e.name)}" ${normalizeKey(e.name)===normalizeKey(selected)?"selected":""}>${esc(e.name)}</option>`).join("");
}
function addExerciseRow(v={name:"",weight:"",sets:"",reps:"",rpe:""}){
  const row=document.createElement("div");row.className="exercise-row";row.innerHTML=`
    <div><label>Exercise</label><select class="exercise-name">${buildEquipmentOptions(v.name)}</select></div>
    <div><label>Weight kg</label><input class="exercise-weight" type="number" step="0.5" value="${esc(v.weight)}"></div>
    <div><label>Sets</label><input class="exercise-sets" type="number" min="1" value="${esc(v.sets)}"></div>
    <div><label>Reps</label><input class="exercise-reps" type="number" min="1" value="${esc(v.reps)}"></div>
    <div><label>RPE</label><input class="exercise-rpe" type="number" min="1" max="10" step="0.5" value="${esc(v.rpe)}"></div>
    <button class="btn remove-exercise" type="button">×</button>`;
  row.querySelector(".remove-exercise").onclick=()=>row.remove();$("exerciseRows").appendChild(row);
}
function collectExercises(){return [...document.querySelectorAll(".exercise-row")].map(row=>({name:row.querySelector(".exercise-name").value.trim(),weight:num(row.querySelector(".exercise-weight").value),sets:num(row.querySelector(".exercise-sets").value),reps:num(row.querySelector(".exercise-reps").value),rpe:num(row.querySelector(".exercise-rpe").value)})).filter(e=>e.name);}

function getAllExerciseRecords(){return appData.workouts.flatMap(w=>(w.exercises||[]).map(e=>({...e,date:w.date,session:w.session})));}
function getLastExercise(name){return getAllExerciseRecords().filter(x=>normalizeKey(x.name)===normalizeKey(name)).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;}
function getWeightStep(w){if(w<20)return 1;if(w<40)return 2;if(w<80)return 2;return 2.5;}
function getRecommendedExercises(){return getStrengthEquipment().map(eq=>{const last=getLastExercise(eq.name);if(!last)return {name:eq.name,weight:"",sets:3,reps:12,rpe:7};let weight=last.weight,sets=last.sets||3,reps=Math.min(last.reps||12,12),rpe=7;if(last.rpe>=9)weight=Math.max(0,last.weight-getWeightStep(last.weight));else if(last.rpe>0&&last.rpe<7&&last.reps>=12)weight=last.weight+getWeightStep(last.weight);return {name:eq.name,weight,sets,reps,rpe};});}
function loadRecommendedWorkout(){$("exerciseRows").innerHTML="";getRecommendedExercises().forEach(addExerciseRow);$("sessionName").value="Session "+(appData.workouts.length+1);}
function getLastWorkout(){return [...appData.workouts].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;}
function loadPreviousSession(){const last=getLastWorkout();if(!last){alert("No previous workout is available.");return;}$("exerciseRows").innerHTML="";(last.exercises||[]).forEach(e=>addExerciseRow(e));const c=last.cardio||{};populateCardioSelect(c.type||"");$("cardioType").value=c.type||"";$("cardioMinutes").value=c.minutes||"";$("cardioDistance").value=c.distance||"";$("cardioSpeed").value=c.speed||"";$("cardioIncline").value=c.incline||"";$("cardioAverageHR").value=c.avgHR||"";$("cardioPeakHR").value=c.peakHR||"";$("cardioRPE").value=c.rpe||"";$("cardioCalories").value=c.calories||"";$("hrRecovery").value=c.recovery||"";$("preWorkoutHR").value="";$("sessionName").value="Session "+(appData.workouts.length+1);showMessage("workoutMessage","Previous session loaded. Pre-workout HR was cleared so you can enter today's reading.","success");window.scrollTo({top:0,behavior:"smooth"});}
function clearWorkoutForm(){
  $("exerciseRows").innerHTML="";getStrengthEquipment().slice(0,6).forEach(eq=>addExerciseRow({name:eq.name,weight:"",sets:3,reps:12,rpe:7}));$("sessionName").value="Session "+(appData.workouts.length+1);$("preWorkoutHR").value="";populateCardioSelect("");["cardioMinutes","cardioDistance","cardioSpeed","cardioIncline","cardioAverageHR","cardioPeakHR","cardioRPE","cardioCalories","hrRecovery"].forEach(id=>$(id).value="");showMessage("workoutMessage","");}

async function saveWorkout(){
  if(!currentUser){alert("Please sign in first.");return;}
  const exercises=collectExercises();const cardio={type:$("cardioType").value,minutes:num($("cardioMinutes").value),distance:num($("cardioDistance").value),speed:num($("cardioSpeed").value),incline:num($("cardioIncline").value),avgHR:num($("cardioAverageHR").value),peakHR:num($("cardioPeakHR").value),rpe:num($("cardioRPE").value),calories:num($("cardioCalories").value),recovery:num($("hrRecovery").value)};
  const workout={id:"local-"+Date.now(),date:$("workoutDate").value,session:$("sessionName").value||"Workout "+(appData.workouts.length+1),preHR:num($("preWorkoutHR").value),exercises,cardio};appData.workouts.push(workout);setLocalData(appData);
  try{await saveWorkoutToCloud(workout,currentUser.id);await syncFromCloud();alert("Workout saved and synced.");}catch(e){setStatus("Saved offline");console.error(e);alert("Workout saved locally. Cloud sync will be retried when you are online.");}
  clearWorkoutForm();renderDashboard();showTab("dashboard");
}
async function syncFromCloud(){if(!currentUser||!navigator.onLine)return;setStatus("Syncing…");try{const cloud=await loadCloudData();appData={...appData,...cloud};try{equipment=await loadEquipmentCloud();appData.equipment=equipment;}catch(e){console.error("Equipment sync failed",e);}setLocalData(appData);setStatus("Synced",true);renderDashboard();}catch(e){setStatus("Offline cache");throw e;}}

function renderDashboard(){const ws=appData.workouts,total=ws.reduce((s,w)=>s+(w.cardio?.minutes||0),0),last=ws.filter(w=>w.cardio?.minutes>0).at(-1);$("dashboardMetrics").innerHTML=`<div class="metric"><div class="metric-title">Total Workouts</div><div class="metric-value">${ws.length}</div></div><div class="metric"><div class="metric-title">Cardio Minutes</div><div class="metric-value">${Math.round(total)}</div></div><div class="metric"><div class="metric-title">Last Avg HR</div><div class="metric-value">${last?.cardio?.avgHR||"—"}</div></div><div class="metric"><div class="metric-title">Last Cardio RPE</div><div class="metric-value">${last?.cardio?.rpe||"—"}</div></div>`;renderCardioBenchmarkStatus();$("nextWorkout").innerHTML=getRecommendedExercises().map(e=>`<span class="badge ${e.rpe>=8?"badge-warning":"badge-good"}"><strong>${esc(e.name)}</strong>: ${e.weight||"—"} kg × ${e.reps} × ${e.sets} • target RPE ${e.rpe}</span>`).join("");const s=ws.slice(-5).reverse();$("recentSessions").innerHTML=s.length?s.map(w=>`<div class="progress-box"><strong>${esc(w.date)}</strong> — ${esc(w.session)}<br><span class="small">${w.exercises.length} strength exercises${w.cardio?.minutes?` • ${esc(w.cardio.type)} ${w.cardio.minutes} min • HR ${w.cardio.avgHR||"—"}`:""}</span></div>`).join(""):"<p>No workouts recorded yet.</p>";}
function renderCardioBenchmarkStatus(){const s=appData.workouts.filter(w=>{const c=w.cardio||{};return normalizeKey(c.type)==="treadmill"&&Math.abs(c.speed-5)<.11&&Math.abs(c.incline-5)<.6&&c.avgHR>0;});if(!s.length){$("cardioBenchmarkStatus").innerHTML="<p class='muted'>No standardized 5 kph / 5% treadmill sessions logged yet.</p>";return;}const l=s.at(-1),p=s.at(-2),d=p?l.cardio.avgHR-p.cardio.avgHR:0,msg=!p?"First benchmark recorded.":d<=-2?"HR is lower than the previous benchmark — encouraging sign.":d>=2?"HR is higher than the previous benchmark; consider fatigue and recovery before interpreting this.":"HR is broadly stable. Continue collecting standardized sessions.";$("cardioBenchmarkStatus").innerHTML=`<div class="progress-box"><strong>Latest benchmark: ${l.cardio.avgHR} bpm</strong><p>${msg}</p></div>`;}

function renderEquipment(){let list=[...equipment];if(equipmentFilter!=="all")list=list.filter(e=>typeIs(e,equipmentFilter));list.sort((a,b)=>a.name.localeCompare(b.name));if(!list.length){$("equipmentContent").innerHTML="<p class='muted'>No equipment is available. Check your Supabase equipment table and RLS SELECT policy.</p>";return;}$("equipmentContent").innerHTML=`<div class="equipment-table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Primary muscles</th><th>Secondary muscles</th><th>Cardio benefit</th><th>Actions</th></tr></thead><tbody>${list.map(e=>`<tr><td><strong>${esc(e.name)}</strong></td><td><span class="badge">${esc(e.type)}</span></td><td>${esc(e.primary_muscles)||"—"}</td><td>${esc(e.secondary_muscles)||"—"}</td><td>${typeIs(e,"cardio")?esc(e.cardio_benefit)||"—":"—"}</td><td><div class="actions"><button class="btn edit-equipment" data-id="${esc(e.id)}">Edit</button><button class="btn-danger delete-equipment" data-id="${esc(e.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>`;document.querySelectorAll(".edit-equipment").forEach(b=>b.onclick=()=>editEquipment(b.dataset.id));document.querySelectorAll(".delete-equipment").forEach(b=>b.onclick=()=>deleteEquipment(b.dataset.id));}
function openEquipmentForm(e=null){editingEquipmentId=e?.id||null;$("equipmentFormTitle").textContent=e?"Edit Equipment":"Add Equipment";$("equipmentName").value=e?.name||"";$("equipmentType").value=e?.type||"Strength";$("equipmentPrimary").value=e?.primary_muscles||"";$("equipmentSecondary").value=e?.secondary_muscles||"";$("equipmentBenefit").value=e?.cardio_benefit||"";updateEquipmentBenefitVisibility();$("equipmentFormCard").hidden=false;$("equipmentName").focus();}
function closeEquipmentForm(){editingEquipmentId=null;$("equipmentFormCard").hidden=true;}
function updateEquipmentBenefitVisibility(){$("equipmentBenefitField").style.display=typeIs({type:$("equipmentType").value},"cardio")?"block":"none";}
async function saveEquipment(){const name=$("equipmentName").value.trim(),type=$("equipmentType").value,primary=$("equipmentPrimary").value.trim(),secondary=$("equipmentSecondary").value.trim(),benefit=$("equipmentBenefit").value.trim();if(!name){showMessage("equipmentMessage","Equipment name is required.","error");return;}const payload={name,type,primary_muscles:primary||null,secondary_muscles:secondary||null,cardio_benefit:typeIs({type},"cardio")?(benefit||null):null};try{let result;if(editingEquipmentId)result=await supabaseClient.from("equipment").update(payload).eq("id",editingEquipmentId).select().single();else result=await supabaseClient.from("equipment").insert(payload).select().single();if(result.error)throw result.error;equipment=await loadEquipmentCloud();appData.equipment=equipment;setLocalData(appData);closeEquipmentForm();populateCardioSelect($("cardioType").value);renderEquipment();clearWorkoutExerciseSelectors();showMessage("equipmentMessage",editingEquipmentId?"Equipment updated.":"Equipment added.","success");}catch(e){console.error(e);showMessage("equipmentMessage",e.message||"Could not save equipment. Check Supabase RLS policies.","error");}}
function clearWorkoutExerciseSelectors(){document.querySelectorAll(".exercise-name").forEach(s=>{const value=s.value;s.innerHTML=buildEquipmentOptions(value);});}
function editEquipment(id){const e=equipment.find(x=>String(x.id)===String(id));if(e)openEquipmentForm(e);}
async function deleteEquipment(id){const e=equipment.find(x=>String(x.id)===String(id));if(!e||!confirm(`Delete equipment “${e.name}”? This does not delete historical workout records.`))return;try{const result=await supabaseClient.from("equipment").delete().eq("id",id);if(result.error)throw result.error;equipment=await loadEquipmentCloud();appData.equipment=equipment;setLocalData(appData);renderEquipment();populateCardioSelect($("cardioType").value);clearWorkoutExerciseSelectors();showMessage("equipmentMessage","Equipment deleted.","success");}catch(err){console.error(err);showMessage("equipmentMessage",err.message||"Could not delete equipment. Check Supabase RLS policies.","error");}}

function renderHistory(){const ws=[...appData.workouts].reverse();$("historyContent").innerHTML=ws.length?`<table><thead><tr><th>Date</th><th>Session</th><th>Strength</th><th>Cardio</th><th></th></tr></thead><tbody>${ws.map((w,ri)=>{const i=appData.workouts.length-1-ri;return `<tr><td>${esc(w.date)}</td><td>${esc(w.session)}</td><td>${(w.exercises||[]).map(e=>`${esc(e.name)}: ${e.weight} kg × ${e.reps} × ${e.sets}, RPE ${e.rpe}`).join("<br>")||"—"}</td><td>${w.cardio?.minutes?`${esc(w.cardio.type)}<br>${w.cardio.minutes} min<br>HR: ${w.cardio.avgHR||"—"}<br>RPE: ${w.cardio.rpe||"—"}`:"—"}</td><td><button class="btn-danger delete-one" data-index="${i}">Delete</button></td></tr>`;}).join("")}</tbody></table>`:"<p>No workouts recorded.</p>";document.querySelectorAll(".delete-one").forEach(b=>b.onclick=()=>deleteWorkout(Number(b.dataset.index)));}
async function deleteWorkout(i){if(!confirm("Delete this workout from the cloud?"))return;const local=appData.workouts[i];try{if(!String(local.id).startsWith("local-")){const r=await supabaseClient.from("workouts").delete().eq("id",local.id);if(r.error)throw r.error;}appData.workouts.splice(i,1);setLocalData(appData);renderHistory();renderDashboard();setStatus("Synced",true);}catch(e){alert("Could not delete the workout.");console.error(e);}}

function renderCharts(){Object.values(charts).forEach(c=>c?.destroy());const ws=[...appData.workouts].sort((a,b)=>a.date.localeCompare(b.date));const names=[...new Set(ws.flatMap(w=>(w.exercises||[]).map(e=>e.name)).filter(Boolean))];charts.strength=new Chart($("strengthChart"),{type:"line",data:{labels:ws.map(w=>w.date),datasets:names.map(n=>({label:n,data:ws.map(w=>{const e=(w.exercises||[]).find(e=>normalizeKey(e.name)===normalizeKey(n));return e&&e.weight>0?e.weight:null;})}))},options:{responsive:true,maintainAspectRatio:false}});const cw=ws.filter(w=>w.cardio?.minutes>0&&w.cardio?.avgHR>0);charts.cardio=new Chart($("cardioChart"),{type:"scatter",data:{datasets:[{label:"Cardio HR",data:cw.map(w=>{const c=w.cardio;return{x:normalizeKey(c.type)==="treadmill"?c.speed*(1+c.incline/100):(c.speed||c.minutes),y:c.avgHR};})}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{title:{display:true,text:"Workload index"}},y:{title:{display:true,text:"Average HR (bpm)"}}}}});charts.duration=new Chart($("durationChart"),{type:"line",data:{labels:cw.map(w=>w.date),datasets:[{label:"Cardio minutes",data:cw.map(w=>w.cardio.minutes)}]},options:{responsive:true,maintainAspectRatio:false}});if(!names.length)$("strengthChart").parentElement.innerHTML='<p class="muted">No strength weights have been recorded yet.</p><canvas id="strengthChart"></canvas>';}
function renderBenchmarkTable(){const s=appData.workouts.filter(w=>{const c=w.cardio||{};return normalizeKey(c.type)==="treadmill"&&Math.abs(c.speed-5)<.11&&Math.abs(c.incline-5)<.6&&c.avgHR>0;});$("benchmarkTable").innerHTML=s.length?`<table><thead><tr><th>Date</th><th>Duration</th><th>Avg HR</th><th>Peak HR</th><th>RPE</th></tr></thead><tbody>${s.map(w=>`<tr><td>${esc(w.date)}</td><td>${w.cardio.minutes} min</td><td>${w.cardio.avgHR}</td><td>${w.cardio.peakHR||"—"}</td><td>${w.cardio.rpe||"—"}</td></tr>`).join("")}</tbody></table>`:"<p>No standardized benchmark sessions yet.</p>";}

function exportCSV(){const rows=[["date","session","exercise","weight_kg","sets","reps","rpe","cardio_type","cardio_minutes","distance_km","speed_kph","incline","avg_hr","peak_hr","cardio_rpe","hr_recovery"]];appData.workouts.forEach(w=>(w.exercises||[]).forEach(e=>rows.push([w.date,w.session,e.name,e.weight,e.sets,e.reps,e.rpe,w.cardio?.type||"",w.cardio?.minutes||0,w.cardio?.distance||0,w.cardio?.speed||0,w.cardio?.incline||0,w.cardio?.avgHR||0,w.cardio?.peakHR||0,w.cardio?.rpe||0,w.cardio?.recovery||0])));downloadBlob(new Blob([rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n")],{type:"text/csv"}),"fitness-data.csv");}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function importJSON(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const x=JSON.parse(r.result);if(!Array.isArray(x.workouts))throw new Error("Invalid backup");if(!confirm("Import this backup into your account? Existing cloud workout data will be replaced."))return;appData={workouts:x.workouts,equipment:equipment};setLocalData(appData);await replaceCloudData(appData,currentUser.id);appData=await loadCloudData();setLocalData({...appData,equipment});setStatus("Synced",true);renderDashboard();alert("Backup imported and synced.");}catch(err){alert("Import failed: "+(err.message||"Unknown error"));console.error(err);}finally{e.target.value="";}};r.readAsText(f);}
async function deleteAllCloudData(){if(!confirm("DELETE ALL your cloud workout data? Export a backup first if needed."))return;try{await replaceCloudData({workouts:[]},currentUser.id);appData={workouts:[],equipment};setLocalData(appData);renderDashboard();alert("All workout data deleted.");}catch(e){alert("Could not delete all data.");console.error(e);}}

init();
