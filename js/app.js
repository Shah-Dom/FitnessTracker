let appData=getLocalData(),currentUser=null,charts={},equipment=[],equipmentFilter="all",editingEquipmentId=null;
window.appData=appData;
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
  supabaseClient.auth.onAuthStateChange(async(_event,session)=>{if(session?.user){currentUser=session.user;await enterApp();window.dispatchEvent(new CustomEvent("myfitness:auth"));}else{currentUser=null;$("appShell").hidden=true;$("authScreen").hidden=false;}});
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
      if(yes){try{await replaceCloudData(localBeforeCloud,currentUser.id);appData=localBeforeCloud;window.appData=appData;setStatus("Synced",true);}catch(e){console.error(e);appData=cloud;alert("Could not import the local workouts.");}}
      else {appData=cloud;window.appData=appData;}
    }else {appData=cloud;window.appData=appData;}
  }
  try{equipment=await loadEquipmentCloud();appData.equipment=equipment;setLocalData(appData);}catch(e){console.error("Equipment load failed",e);equipment=localBeforeCloud.equipment||[];appData.equipment=equipment;if(equipment.length)showMessage("equipmentMessage","Using cached equipment. Supabase equipment could not be loaded.","error");}
  clearWorkoutForm();renderDashboard();
}

function showTab(id){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));$(id)?.classList.add("active");document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");
  if(id==="dashboard")renderDashboard();if(id==="equipment")renderEquipment();if(id==="history")renderHistory();if(id==="progress"){renderCharts();renderBenchmarkTable();}if(id==="weight")window.loadWeights?.();if(id==="profile")window.loadProfile?.();
}

function buildEquipmentOptions(selected=""){
  return `<option value="">Select exercise…</option>`+getStrengthEquipment().map(e=>`<option value="${esc(e.name)}" ${normalizeKey(e.name)===normalizeKey(selected)?"selected":""}>${esc(e.name)}</option>`).join("");
}
function populateCardioSelect(selected=""){
  const select=$("cardioType");if(!select)return;select.innerHTML=`<option value="">No cardio</option>`+getCardioEquipment().map(e=>`<option value="${esc(e.name)}" ${normalizeKey(e.name)===normalizeKey(selected)?"selected":""}>${esc(e.name)}</option>`).join("");
}
function addExerciseRow(v={name:"",weight:"",sets:"",reps:"",rpe:"",completed:false}){
  const row=document.createElement("div");row.className="exercise-row"+(v.completed?" exercise-completed":"");row.innerHTML=`
  <div class="exercise-row-main"><div class="exercise-number"></div><div class="exercise-fields">
  <div><label>Exercise</label><select class="exercise-name">${buildEquipmentOptions(v.name)}</select></div>
  <div><label>Weight kg</label><input class="exercise-weight" type="number" step="0.5" value="${esc(v.weight)}"></div>
  <div><label>Sets</label><input class="exercise-sets" type="number" min="1" value="${esc(v.sets)}"></div>
  <div><label>Reps</label><input class="exercise-reps" type="number" min="1" value="${esc(v.reps)}"></div>
  <div><label>RPE</label><input class="exercise-rpe" type="number" min="1" max="10" step="0.5" value="${esc(v.rpe)}"></div></div></div>
  <div class="exercise-actions"><button class="btn exercise-complete" type="button">${v.completed?"✓ Completed":"Mark Complete"}</button><button class="btn btn-danger-outline remove-exercise" type="button">Delete</button></div>`;
  row.querySelector(".exercise-complete").onclick=()=>toggleExerciseComplete(row);
  row.querySelector(".remove-exercise").onclick=()=>{if(confirm("Delete this exercise from today's workout?")){row.remove();updateExerciseRowNumbers();}};
  $("exerciseRows").appendChild(row);updateExerciseRowNumbers();
}
function toggleExerciseComplete(row){const done=!row.classList.contains("exercise-completed");row.classList.toggle("exercise-completed",done);row.querySelector(".exercise-complete").textContent=done?"✓ Completed":"Mark Complete";updateExerciseCompletionSummary();}
function updateExerciseRowNumbers(){document.querySelectorAll("#exerciseRows .exercise-row").forEach((r,i)=>{const n=r.querySelector(".exercise-number");if(n)n.textContent=i+1;});updateExerciseCompletionSummary();}
function updateExerciseCompletionSummary(){const rows=[...document.querySelectorAll("#exerciseRows .exercise-row")],done=rows.filter(r=>r.classList.contains("exercise-completed")).length,el=$("exerciseCompletionStatus");if(el){el.textContent=rows.length?`${done} of ${rows.length} exercises completed`:"No exercises added";el.classList.toggle("all-complete",rows.length>0&&done===rows.length);}}
function collectExercises(){return [...document.querySelectorAll(".exercise-row")].map(row=>({name:row.querySelector(".exercise-name").value.trim(),weight:num(row.querySelector(".exercise-weight").value),sets:num(row.querySelector(".exercise-sets").value),reps:num(row.querySelector(".exercise-reps").value),rpe:num(row.querySelector(".exercise-rpe").value)})).filter(e=>e.name);}

function getAllExerciseRecords(){return appData.workouts.flatMap(w=>(w.exercises||[]).map(e=>({...e,date:w.date,session:w.session})));}
function getLastExercise(name){return getAllExerciseRecords().filter(x=>normalizeKey(x.name)===normalizeKey(name)).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;}
function getWeightStep(w){if(w<20)return 1;if(w<40)return 2;if(w<80)return 2;return 2.5;}
function getRecommendedExercises(){
  const recent=[...appData.workouts].sort((a,b)=>b.date.localeCompare(a.date));
  const lastCount=recent[0]?.exercises?.length||0;
  const targetCount=recent.length?Math.min(12,Math.max(1,lastCount+1)):Math.min(6,getStrengthEquipment().length);
  const seen=new Set(),ordered=[];
  for(const w of recent.slice(0,4)) for(const ex of (w.exercises||[])){const k=normalizeKey(ex.name);if(k&&!seen.has(k)){seen.add(k);ordered.push(ex.name);}}
  for(const eq of getStrengthEquipment()) if(!seen.has(normalizeKey(eq.name))&&ordered.length<targetCount){seen.add(normalizeKey(eq.name));ordered.push(eq.name);}
  return ordered.slice(0,targetCount).map(name=>{const last=getLastExercise(name);if(!last)return {name,weight:"",sets:3,reps:12,rpe:7};let weight=last.weight,sets=last.sets||3,reps=Math.min(last.reps||12,12),rpe=7;if(last.rpe>=9)weight=Math.max(0,last.weight-getWeightStep(last.weight));else if(last.rpe>0&&last.rpe<7&&last.reps>=12)weight=last.weight+getWeightStep(last.weight);return {name,weight,sets,reps,rpe};});
}
function loadRecommendedWorkout(){$("exerciseRows").innerHTML="";getRecommendedExercises().forEach(addExerciseRow);$("sessionName").value="Session "+(appData.workouts.length+1);}
function getLastWorkout(){return [...appData.workouts].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;}
function loadPreviousSession(){const last=getLastWorkout();if(!last){alert("No previous workout is available.");return;}$("exerciseRows").innerHTML="";(last.exercises||[]).forEach(e=>addExerciseRow(e));const c=last.cardio||{};populateCardioSelect(c.type||"");$("cardioType").value=c.type||"";$("cardioMinutes").value=c.minutes||"";$("cardioDistance").value=c.distance||"";$("cardioSpeed").value=c.speed||"";$("cardioIncline").value=c.incline||"";$("cardioAverageHR").value=c.avgHR||"";$("cardioPeakHR").value=c.peakHR||"";$("cardioRPE").value=c.rpe||"";$("cardioCalories").value=c.calories||"";$("hrRecovery").value=c.recovery||"";$("hrRecovery2").value=c.recovery2||"";$("preWorkoutHR").value="";$("sessionName").value="Session "+(appData.workouts.length+1);showMessage("workoutMessage","Previous session loaded. Pre-workout HR was cleared so you can enter today's reading.","success");window.scrollTo({top:0,behavior:"smooth"});}
function clearWorkoutForm(){
  $("exerciseRows").innerHTML="";getStrengthEquipment().slice(0,6).forEach(eq=>addExerciseRow({name:eq.name,weight:"",sets:3,reps:12,rpe:7}));$("sessionName").value="Session "+(appData.workouts.length+1);$("preWorkoutHR").value="";populateCardioSelect("");["cardioMinutes","cardioDistance","cardioSpeed","cardioIncline","cardioAverageHR","cardioPeakHR","cardioRPE","cardioCalories","hrRecovery","hrRecovery2"].forEach(id=>$(id).value="");showMessage("workoutMessage","");}

async function saveWorkout(){
  if(!currentUser){alert("Please sign in first.");return;}
  const exercises=collectExercises();const cardio={type:$("cardioType").value,minutes:num($("cardioMinutes").value),distance:num($("cardioDistance").value),speed:num($("cardioSpeed").value),incline:num($("cardioIncline").value),avgHR:num($("cardioAverageHR").value),peakHR:num($("cardioPeakHR").value),rpe:num($("cardioRPE").value),calories:num($("cardioCalories").value),recovery:num($("hrRecovery").value),recovery2:num($("hrRecovery2").value)};
  const workout={id:"local-"+Date.now(),date:$("workoutDate").value,session:$("sessionName").value||"Workout "+(appData.workouts.length+1),preHR:num($("preWorkoutHR").value),exercises,cardio};appData.workouts.push(workout);window.appData=appData;setLocalData(appData);
  try{await saveWorkoutToCloud(workout,currentUser.id);await syncFromCloud();alert("Workout saved and synced.");}catch(e){setStatus("Saved offline");console.error(e);alert("Workout saved locally. Cloud sync will be retried when you are online.");}
  clearWorkoutForm();renderDashboard();if($("getAiReportBtn")){ $("getAiReportBtn").hidden=false; }showTab("workout");
}
async function syncFromCloud(){if(!currentUser||!navigator.onLine)return;setStatus("Syncing…");try{const cloud=await loadCloudData();appData={...appData,...cloud};window.appData=appData;try{equipment=await loadEquipmentCloud();appData.equipment=equipment;}catch(e){console.error("Equipment sync failed",e);}setLocalData(appData);setStatus("Synced",true);renderDashboard();}catch(e){setStatus("Offline cache");throw e;}}

function daysSince(date){if(!date)return null;const a=new Date(date+'T00:00:00'),b=new Date(localDate()+'T00:00:00');return Math.max(0,Math.round((b-a)/86400000));}
function weekKey(date){const d=new Date(date+"T00:00:00");const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.toISOString().slice(0,10);}
function weeklyStreak(ws){const weeks=[...new Set(ws.map(w=>weekKey(w.date)).filter(Boolean))].sort().reverse();if(!weeks.length)return 0;let streak=1;for(let i=1;i<weeks.length;i++){const prev=new Date(weeks[i-1]+"T00:00:00"),cur=new Date(weeks[i]+"T00:00:00");if(Math.round((prev-cur)/604800000)===1)streak++;else break;}return streak;}
function renderDashboard(){const ws=[...appData.workouts].sort((a,b)=>a.date.localeCompare(b.date)),total=ws.reduce((s,w)=>s+(w.cardio?.minutes||0),0),last=ws.at(-1),lastCardio=[...ws].reverse().find(w=>w.cardio?.minutes>0),profileName=window.myFitnessProfile?.name||"";const dashTitle=$("dashboardGreeting");if(dashTitle)dashTitle.textContent=profileName?`Welcome back, ${profileName}!`:"Your Fitness Dashboard";const gap=last?daysSince(last.date):null,streak=weeklyStreak(ws),enc=[];const hour=new Date().getHours();enc.push(ws.length?`${hour<12?"Good morning":"Good evening"}${profileName?', '+profileName:''}!`: `Welcome${profileName?', '+profileName:''}! Let's build your first win.`);if(gap!==null)enc.push(gap===0?"You trained today — great work!":`${gap} day${gap===1?'':'s'} since your last session.`);if(streak>=2)enc.push(`${streak} weeks in a row — keep the momentum going!`);else if(ws.length>=4)enc.push(`${ws.length} sessions logged — consistency is paying off.`);else if(ws.length)enc.push("Every session counts. Keep building the habit.");$("dashboardEncouragement").innerHTML=enc.map(x=>`<span>💪 ${esc(x)}</span>`).join("");$("dashboardMetrics").innerHTML=`<div class="metric"><div class="metric-title">Total Workouts</div><div class="metric-value">${ws.length}</div></div><div class="metric"><div class="metric-title">Cardio Minutes</div><div class="metric-value">${Math.round(total)}</div></div><div class="metric"><div class="metric-title">Last Avg HR</div><div class="metric-value">${lastCardio?.cardio?.avgHR||"—"}</div></div><div class="metric"><div class="metric-title">Last Cardio RPE</div><div class="metric-value">${lastCardio?.cardio?.rpe||"—"}</div></div>`;renderCardioBenchmarkStatus();const rec=getRecommendedExercises();$("nextWorkout").innerHTML=rec.length?`<div class="next-workout-summary"><strong>${rec.length} strength exercises</strong> based on your recent sessions.</div>`+rec.map(e=>`<span class="badge ${e.rpe>=8?"badge-warning":"badge-good"}"><strong>${esc(e.name)}</strong>: ${e.weight||"—"} kg × ${e.reps} × ${e.sets} • target RPE ${e.rpe}</span>`).join(""):"<p>No recommendation yet. Log a session to build your training pattern.";const recent=ws.slice(-5).reverse();$("recentSessions").innerHTML=recent.length?recent.map(w=>`<div class="progress-box"><strong>${esc(w.date)}</strong> — ${esc(w.session)}<br><span class="small">${w.exercises.length} strength exercises${w.cardio?.minutes?` • ${esc(w.cardio.type)} ${w.cardio.minutes} min • HR ${w.cardio.avgHR||"—"}`:""}</span></div>`).join(""):"<p>No workouts recorded yet.</p>";}

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
async function deleteWorkout(i){if(!confirm("Delete this workout from the cloud?"))return;const local=appData.workouts[i];try{if(!String(local.id).startsWith("local-")){const r=await supabaseClient.from("workouts").delete().eq("id",local.id);if(r.error)throw r.error;}appData.workouts.splice(i,1);window.appData=appData;setLocalData(appData);renderHistory();renderDashboard();setStatus("Synced",true);}catch(e){alert("Could not delete the workout.");console.error(e);}}

function renderCharts(){Object.values(charts).forEach(c=>c?.destroy());const ws=[...appData.workouts].sort((a,b)=>a.date.localeCompare(b.date));const names=[...new Set(ws.flatMap(w=>(w.exercises||[]).map(e=>e.name)).filter(Boolean))];charts.strength=new Chart($("strengthChart"),{type:"line",data:{labels:ws.map(w=>w.date),datasets:names.map(n=>({label:n,data:ws.map(w=>{const e=(w.exercises||[]).find(e=>normalizeKey(e.name)===normalizeKey(n));return e&&e.weight>0?e.weight:null;})}))},options:{responsive:true,maintainAspectRatio:false}});const cw=ws.filter(w=>w.cardio?.minutes>0&&w.cardio?.avgHR>0);charts.cardio=new Chart($("cardioChart"),{type:"scatter",data:{datasets:[{label:"Cardio HR",data:cw.map(w=>{const c=w.cardio;return{x:normalizeKey(c.type)==="treadmill"?c.speed*(1+c.incline/100):(c.speed||c.minutes),y:c.avgHR};})}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{title:{display:true,text:"Workload index"}},y:{title:{display:true,text:"Average HR (bpm)"}}}}});charts.duration=new Chart($("durationChart"),{type:"line",data:{labels:cw.map(w=>w.date),datasets:[{label:"Cardio minutes",data:cw.map(w=>w.cardio.minutes)}]},options:{responsive:true,maintainAspectRatio:false}});if(!names.length)$("strengthChart").parentElement.innerHTML='<p class="muted">No strength weights have been recorded yet.</p><canvas id="strengthChart"></canvas>';}
function renderBenchmarkTable(){const s=appData.workouts.filter(w=>{const c=w.cardio||{};return normalizeKey(c.type)==="treadmill"&&Math.abs(c.speed-5)<.11&&Math.abs(c.incline-5)<.6&&c.avgHR>0;});$("benchmarkTable").innerHTML=s.length?`<table><thead><tr><th>Date</th><th>Duration</th><th>Avg HR</th><th>Peak HR</th><th>RPE</th></tr></thead><tbody>${s.map(w=>`<tr><td>${esc(w.date)}</td><td>${w.cardio.minutes} min</td><td>${w.cardio.avgHR}</td><td>${w.cardio.peakHR||"—"}</td><td>${w.cardio.rpe||"—"}</td></tr>`).join("")}</tbody></table>`:"<p>No standardized benchmark sessions yet.</p>";}

function exportCSV(){const rows=[["date","session","exercise","weight_kg","sets","reps","rpe","cardio_type","cardio_minutes","distance_km","speed_kph","incline","avg_hr","peak_hr","cardio_rpe","hr_recovery_1min","hr_recovery_2min"]];appData.workouts.forEach(w=>(w.exercises||[]).forEach(e=>rows.push([w.date,w.session,e.name,e.weight,e.sets,e.reps,e.rpe,w.cardio?.type||"",w.cardio?.minutes||0,w.cardio?.distance||0,w.cardio?.speed||0,w.cardio?.incline||0,w.cardio?.avgHR||0,w.cardio?.peakHR||0,w.cardio?.rpe||0,w.cardio?.recovery||0,w.cardio?.recovery2||0])));downloadBlob(new Blob([rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n")],{type:"text/csv"}),"fitness-data.csv");}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function importJSON(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const x=JSON.parse(r.result);if(!Array.isArray(x.workouts))throw new Error("Invalid backup");if(!confirm("Import this backup into your account? Existing cloud workout data will be replaced."))return;appData={workouts:x.workouts,equipment:equipment};window.appData=appData;setLocalData(appData);await replaceCloudData(appData,currentUser.id);appData=await loadCloudData();setLocalData({...appData,equipment});setStatus("Synced",true);renderDashboard();alert("Backup imported and synced.");}catch(err){alert("Import failed: "+(err.message||"Unknown error"));console.error(err);}finally{e.target.value="";}};r.readAsText(f);}
async function deleteAllCloudData(){if(!confirm("DELETE ALL your cloud workout data? Export a backup first if needed."))return;try{await replaceCloudData({workouts:[]},currentUser.id);appData={workouts:[],equipment};window.appData=appData;setLocalData(appData);renderDashboard();alert("All workout data deleted.");}catch(e){alert("Could not delete all data.");console.error(e);}}

init();

/* Rev 4 AI Coach implementation */
(function(){
const $r=id=>document.getElementById(id);
const sbc=()=>window.supabaseClient||(typeof supabaseClient!=="undefined"?supabaseClient:null);
async function user(){const s=sbc();if(!s)return null;const r=await s.auth.getUser();return r.data?.user||null}
async function profile(){const s=sbc(),u=await user();if(!s||!u)return null;const r=await s.from("profiles").select("*").eq("user_id",u.id).maybeSingle();return r.data||null}
async function loadProfile(){const p=await profile();if(!p)return;window.myFitnessProfile=p;document.title=p.name?`${p.name} • My Fitness`:"My Fitness Tracker";if($r("headerSubtitle"))$r("headerSubtitle").textContent=p.name?`Your personal strength + cardio dashboard, ${p.name}.`:"Strength + cardio + progressive training dashboard";if($r("aiCoachIntro"))$r("aiCoachIntro").textContent=`Your coach uses your profile, weight history and recent workouts to help you, ${p.name||""}.`;if($r("profileName"))$r("profileName").value=p.name||"";$r("profileDob").value=p.date_of_birth||"";$r("profileGender").value=p.gender||"";$r("profileHeight").value=p.height_cm??"";$r("profileGoal").value=p.goal||""}
async function saveProfile(e){e.preventDefault();const s=sbc(),u=await user();if(!s||!u)return alert("Please sign in.");const {error}=await s.from("profiles").upsert({user_id:u.id,name:$r("profileName").value.trim(),date_of_birth:$r("profileDob").value||null,gender:$r("profileGender").value||null,height_cm:$r("profileHeight").value?Number($r("profileHeight").value):null,goal:$r("profileGoal").value.trim()||null},{onConflict:"user_id"});if(error)alert(error.message);else{window.myFitnessProfile={name:$r("profileName").value.trim(),date_of_birth:$r("profileDob").value||null,gender:$r("profileGender").value||null,height_cm:$r("profileHeight").value?Number($r("profileHeight").value):null,goal:$r("profileGoal").value.trim()||null};if($r("headerSubtitle"))$r("headerSubtitle").textContent=window.myFitnessProfile.name?`Your personal strength + cardio dashboard, ${window.myFitnessProfile.name}.`:"Strength + cardio + progressive training dashboard";renderDashboard();alert("Profile saved.")}}
async function saveWeight(e){
  e.preventDefault();
  const s=sbc(),u=await user();
  if(!s||!u){alert("Please sign in.");return;}
  const weight=Number($r("weightKg").value);
  if(!Number.isFinite(weight)||weight<=0){alert("Enter a valid weight.");return;}
  const {error}=await s.from("weight_entries").insert({
    user_id:u.id,
    recorded_at:$r("weightDate").value||localDate(),
    weight_kg:weight,
    notes:$r("weightNote").value.trim()||null
  });
  if(error){alert(error.message);return;}
  $r("weightKg").value="";
  $r("weightNote").value="";
  await loadWeights();
  renderDashboard();
}
async function loadWeights(){const s=sbc(),u=await user();if(!s||!u)return;const r=await s.from("weight_entries").select("*").eq("user_id",u.id).order("recorded_at",{ascending:true});if(r.error)return;const rows=r.data||[],last=rows.at(-1);if($("currentWeightLabel"))$("currentWeightLabel").textContent=last?Number(last.weight_kg).toFixed(1)+" kg":"";const p=window.myFitnessProfile||await profile();const bmi=p?.height_cm&&last?.weight_kg?Number(last.weight_kg)/Math.pow(Number(p.height_cm)/100,2):null;if($("bmiStatus"))$("bmiStatus").textContent=bmi?`Current BMI: ${bmi.toFixed(1)} — ${bmiLabel(bmi)}`:"Add height in Profile and a weight entry to show BMI bands.";$("weightEntries").innerHTML=rows.slice().reverse().map(x=>`<div class="data-list-row"><span>${x.recorded_at}</span><strong>${Number(x.weight_kg).toFixed(1)} kg</strong><span>${esc(x.notes||"")}</span><button class="btn btn-danger-outline weight-delete" data-id="${x.id}">Delete</button></div>`).join("");$("weightEntries").querySelectorAll(".weight-delete").forEach(b=>b.onclick=async()=>{if(confirm("Delete this weight entry?")){await s.from("weight_entries").delete().eq("id",b.dataset.id);loadWeights()}});drawChart(rows,p?.height_cm);}
function bmiLabel(b){return b<18.5?"below the usual healthy range":b<25?"within the usual healthy range":b<30?"above the usual healthy range":"in the obesity range";}
function drawChart(rows,heightCm){const c=$("weightChart");if(!c)return;const x=c.getContext("2d"),w=c.clientWidth||700,h=280,d=window.devicePixelRatio||1;c.width=w*d;c.height=h*d;x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,w,h);if(!rows.length){x.fillText("Add weight entries to see the trend.",20,40);return}const v=rows.map(a=>+a.weight_kg),height=Number(heightCm||0)/100;let mi=Math.min(...v),ma=Math.max(...v);if(height>0){const bounds=[18.5*height*height,24.9*height*height,29.9*height*height,40*height*height];mi=Math.min(mi,bounds[0])-1;ma=Math.max(ma,bounds[3])+1;}else{mi-=1;ma+=1;}const p=35,px=i=>p+(w-2*p)*i/Math.max(1,v.length-1),py=a=>h-p-(h-2*p)*(a-mi)/Math.max(.01,ma-mi);if(height>0){const bands=[[-Infinity,18.5*height*height,"red"],[18.5*height*height,24.9*height*height,"green"],[24.9*height*height,29.9*height*height,"yellow"],[29.9*height*height,Infinity,"red"]];for(const [lo,hi,color] of bands){const y1=py(Math.min(ma,hi===Infinity?ma:hi)),y2=py(Math.max(mi,lo===-Infinity?mi:lo));x.fillStyle=color==="green"?"rgba(34,197,94,.10)":color==="yellow"?"rgba(234,179,8,.12)":"rgba(239,68,68,.10)";x.fillRect(p,Math.min(y1,y2),w-2*p,Math.abs(y2-y1));}}x.strokeStyle="rgba(30,30,30,.25)";x.beginPath();v.forEach((a,i)=>i?x.lineTo(px(i),py(a)):x.moveTo(px(i),py(a)));x.stroke();x.fillStyle="rgba(30,30,30,.8)";v.forEach((a,i)=>{x.beginPath();x.arc(px(i),py(a),3,0,7);x.fill()});}

async function context(){const s=sbc(),u=await user(),p=await profile();let weights=[],workouts=appData.workouts||[],equipment=appData.equipment||[];if(s&&u){const w=await s.from("weight_entries").select("recorded_at,weight_kg").eq("user_id",u.id).order("recorded_at",{ascending:false}).limit(30);weights=w.data||[];const q=await s.from("workouts").select("*").eq("user_id",u.id).order("workout_date",{ascending:false}).limit(12);if(q.data?.length)workouts=q.data}return {profile:p?{name:p.name,date_of_birth:p.date_of_birth,gender:p.gender,height_cm:p.height_cm,goal:p.goal}:null,weights,workouts,equipment}}
async function coach(body){const s=sbc();if(!s)throw Error("Supabase is not configured.");const q=await s.auth.getSession(),t=q.data.session?.access_token;if(!t)throw Error("Please sign in.");const r=await fetch(`${window.SUPABASE_URL}/functions/v1/generate-workout`,{method:"POST",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},body:JSON.stringify(body)});let j={};try{j=await r.json()}catch{}if(!r.ok)throw Error(j.error||`AI Coach request failed (${r.status}).`);return j}
function render(p){const e=$("aiProposal"),cardio=p.cardio||{};e.innerHTML=`<div class="ai-proposal-box"><h3>${esc(p.title||"Recommended Workout")}</h3><p>${esc(p.summary||"")}</p>${(p.exercises||[]).map((x,i)=>`<div class="ai-exercise"><strong>${i+1}. ${esc(x.exercise_name)}</strong> — ${x.sets} × ${x.reps_min}-${x.reps_max} @ ${x.weight_kg} kg, RPE ${x.target_rpe}<br><small>${esc(x.reason||"")}</small></div>`).join("")}<div class="ai-coach-note"><strong>Cardio:</strong> ${cardio.included?`${esc(cardio.type||"Cardio")} for about ${cardio.minutes||0} min — ${esc(cardio.intensity||"")}`:"No cardio recommended today."}${cardio.reason?`<br><small>${esc(cardio.reason)}</small>`:""}</div>${p.weight_decision?`<div class="ai-coach-note"><strong>Weight decision:</strong> ${esc(p.weight_decision)}</div>`:""}<button id="useAiWorkoutBtn" class="btn-primary">Use This Workout</button></div>`;$("useAiWorkoutBtn").onclick=()=>{document.querySelector('[data-tab="workout"]')?.click();$("exerciseRows").innerHTML="";(p.exercises||[]).forEach(x=>addExerciseRow({name:x.exercise_name,weight:x.weight_kg,sets:x.sets,reps:x.reps_min,rpe:x.target_rpe}));$("sessionName")&&($("sessionName").value=p.title||"AI Recommended Workout")}}

function coachPreferences(){return {exercise_preference:$("coachExercisePreference")?.value||"recent",routine_mode:$("coachRoutineMode")?.value||"single",energy_level:$("coachEnergy")?.value||"normal",soreness:$("coachSoreness")?.value||"none",time_minutes:Math.max(20,Math.min(180,num($("coachTime")?.value)||90)),include_cardio:$("coachIncludeCardio")?.checked!==false,ask_increase_weight:!!$("coachIncreaseWeight")?.checked};}
function customInstructionPayload(){const include=!!$("includeCustomInstructions")?.checked;const text=$("customCoachInstructions")?.value.trim()||"";if(include&&text)localStorage.setItem("myFitness_coach_instructions_"+(currentUser?.id||""),text);return {include_custom_instructions:include&&!!text,custom_instructions:include?text:""};}
function loadCustomInstructions(){const key="myFitness_coach_instructions_"+(currentUser?.id||"");const v=localStorage.getItem(key)||"";if($("customCoachInstructions"))$("customCoachInstructions").value=v;}
async function propose(){try{const r=await coach({action:"propose",...coachPreferences(),...customInstructionPayload()});render(r.proposal);if($("dashboardCoachText"))$("dashboardCoachText").textContent=`${window.myFitnessProfile?.name||"Your"}’s recommendation is ready — review it before loading it into Log Workout.`;}catch(e){if($("dashboardCoachText"))$("dashboardCoachText").textContent=e.message;alert(e.message);}}
async function ask(){const q=$("aiQuestion").value.trim();if(!q)return;try{const r=await coach({action:"ask",question:q,...coachPreferences()});$("aiCoachMessages").insertAdjacentHTML("beforeend",`<div class="ai-message coach"><strong>Coach:</strong> ${esc(r.answer||"")}</div>`);$("aiQuestion").value="";}catch(e){alert(e.message);}}
async function reportLastWorkout(){try{const r=await coach({action:"report_last"});$("lastWorkoutReport").innerHTML=`<div class="ai-report-box"><h3>🤖 Your AI Coach Session Report</h3><p><strong>Summary:</strong> ${esc(r.report.summary||"")}</p><p><strong>Compared with previous sessions:</strong> ${esc(r.report.comparison||"")}</p><p><strong>Looking ahead:</strong> ${esc(r.report.future||"")}</p><p class="encouragement-text">💪 ${esc(r.report.encouragement||"")}</p></div>`;showTab("workout");}catch(e){alert(e.message);}}

window.loadProfile=loadProfile;window.loadWeights=loadWeights;window.saveWeight=saveWeight;window.proposeWorkout=propose;window.askCoach=ask;window.reportLastWorkout=reportLastWorkout;

function init(){if($r("profileForm"))$r("profileForm").onsubmit=saveProfile;if($r("weightForm")){$r("weightDate").value=new Date().toISOString().slice(0,10);$r("weightForm").onsubmit=saveWeight}$r("aiProposeBtn")?.addEventListener("click",propose);$r("dashboardProposeBtn")?.addEventListener("click",propose);$r("aiAskBtn")?.addEventListener("click",()=>{$r("aiAskBox").hidden=!$r("aiAskBox").hidden});$r("aiSendBtn")?.addEventListener("click",ask);$r("getAiReportBtn")?.addEventListener("click",reportLastWorkout);loadProfile();loadWeights();loadCustomInstructions()}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();
