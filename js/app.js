let appData=getLocalData(),currentUser=null,charts={};
const defaultExercises=[
["Leg Press","",3,12,""],["Lat Pulldown","",3,12,""],["Chest Press","",3,12,""],
["Seated Leg Curl","",3,12,""],["Seated Row","",3,12,""],["Shoulder Press","",2,10,""],
["Leg Extension","",2,15,""],["Calf Extension","",2,15,""],["Biceps Curl","",2,12,""]
];
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function localDate(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function setStatus(text,online=false){$("syncStatus").textContent=text;$("syncStatus").classList.toggle("online",online)}

async function init(){
 $("workoutDate").value=localDate();
 document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
 $("addExerciseBtn").onclick=()=>addExerciseRow();
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
 window.addEventListener("online",()=>syncFromCloud().catch(()=>setStatus("Offline cache")));
 window.addEventListener("offline",()=>setStatus("Offline cache"));
 supabaseClient.auth.onAuthStateChange(async (_event,session)=>{
   if(session?.user){currentUser=session.user;await enterApp();}
   else{currentUser=null;$("appShell").hidden=true;$("authScreen").hidden=false;}
 });
 const {data}=await supabaseClient.auth.getSession();
 if(data.session){currentUser=data.session.user;await enterApp();} else {$("authScreen").hidden=false}
}
async function authenticate(signup){
 const email=$("authEmail").value.trim(),password=$("authPassword").value;
 $("authMessage").className="message";$("authMessage").textContent="";
 if(!email||password.length<6){$("authMessage").className="message error";$("authMessage").textContent="Enter an email and a password of at least 6 characters.";return}
 const result=signup?await supabaseClient.auth.signUp({email,password}):await supabaseClient.auth.signInWithPassword({email,password});
 if(result.error){$("authMessage").className="message error";$("authMessage").textContent=result.error.message;return}
 $("authMessage").className="message success";$("authMessage").textContent=signup?"Account created. Check your email if confirmation is required.":"Signed in.";
}
async function enterApp(){
 $("authScreen").hidden=true;$("appShell").hidden=false;$("userEmail").textContent=currentUser.email||"";
 setStatus("Syncing…");
 try{
   const cloud=await loadCloudData();
   if(!cloud.workouts.length&&appData.workouts.length){
     const yes=confirm("No cloud workouts were found. Import your existing local workouts into your new account?");
     if(yes){await replaceCloudData(appData,currentUser.id);setStatus("Synced",true);}
     else{appData=cloud;setStatus("Synced",true);}
   }else{appData=cloud;setStatus("Synced",true);}
 }catch(e){setStatus("Offline cache");console.error(e)}
 clearWorkoutForm();renderDashboard();
}
function showTab(id){
 document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
 $(id).classList.add("active");document.querySelector(`[data-tab="${id}"]`).classList.add("active");
 if(id==="dashboard")renderDashboard();if(id==="history")renderHistory();if(id==="progress"){renderCharts();renderBenchmarkTable();}
}
function addExerciseRow(v=["","","","",""]){
 const row=document.createElement("div");row.className="exercise-row";
 row.innerHTML=`<div><label>Exercise</label><input class="exercise-name" value="${esc(v[0])}"></div>
 <div><label>Weight kg</label><input class="exercise-weight" type="number" step="0.5" value="${esc(v[1])}"></div>
 <div><label>Sets</label><input class="exercise-sets" type="number" value="${esc(v[2])}"></div>
 <div><label>Reps</label><input class="exercise-reps" type="number" value="${esc(v[3])}"></div>
 <div><label>RPE</label><input class="exercise-rpe" type="number" min="1" max="10" step="0.5" value="${esc(v[4])}"></div>
 <button class="btn remove-exercise" type="button">×</button>`;
 row.querySelector(".remove-exercise").onclick=()=>row.remove();$("exerciseRows").appendChild(row);
}
function getAllExerciseRecords(){return appData.workouts.flatMap(w=>w.exercises.map(e=>({...e,date:w.date,session:w.session})))}
function getLastExercise(name){const a=getAllExerciseRecords().filter(x=>x.name.toLowerCase()===name.toLowerCase()).sort((a,b)=>a.date.localeCompare(b.date));return a.at(-1)||null}
function getWeightStep(w){if(w<20)return 1;if(w<40)return 2;if(w<80)return 2;return 2.5}
function getRecommendedExercises(){
 return defaultExercises.map(def=>{
   const name=def[0],last=getLastExercise(name);if(!last)return def;
   let weight=last.weight,reps=last.reps||10,sets=last.sets||2,rpe=7;
   if(last.rpe>=9)weight=Math.max(0,last.weight-getWeightStep(last.weight));
   else if(last.rpe<7&&last.reps>=12)weight=last.weight+getWeightStep(last.weight);
   reps=Math.min(reps,12);return [name,weight,sets,reps,rpe];
 });
}
function loadRecommendedWorkout(){$("exerciseRows").innerHTML="";getRecommendedExercises().forEach(addExerciseRow);$("sessionName").value="Session "+(appData.workouts.length+1)}
function clearWorkoutForm(){
 $("exerciseRows").innerHTML="";defaultExercises.slice(0,6).forEach(addExerciseRow);
 $("sessionName").value="Session "+(appData.workouts.length+1);$("preWorkoutHR").value="";
 ["cardioMinutes","cardioDistance","cardioSpeed","cardioIncline","cardioAverageHR","cardioPeakHR","cardioRPE","cardioCalories","hrRecovery"].forEach(id=>$(id).value="");
}
async function saveWorkout(){
 const exercises=[...document.querySelectorAll(".exercise-row")].map(row=>({name:row.querySelector(".exercise-name").value.trim(),weight:Number(row.querySelector(".exercise-weight").value)||0,sets:Number(row.querySelector(".exercise-sets").value)||0,reps:Number(row.querySelector(".exercise-reps").value)||0,rpe:Number(row.querySelector(".exercise-rpe").value)||0})).filter(e=>e.name);
 const cardio={type:$("cardioType").value,minutes:Number($("cardioMinutes").value)||0,distance:Number($("cardioDistance").value)||0,speed:Number($("cardioSpeed").value)||0,incline:Number($("cardioIncline").value)||0,avgHR:Number($("cardioAverageHR").value)||0,peakHR:Number($("cardioPeakHR").value)||0,rpe:Number($("cardioRPE").value)||0,calories:Number($("cardioCalories").value)||0,recovery:Number($("hrRecovery").value)||0};
 const workout={id:"local-"+Date.now(),date:$("workoutDate").value,session:$("sessionName").value||"Workout "+(appData.workouts.length+1),preHR:Number($("preWorkoutHR").value)||0,exercises,cardio};
 appData.workouts.push(workout);setLocalData(appData);
 try{await saveWorkoutToCloud(workout,currentUser.id);setStatus("Synced",true);await syncFromCloud();alert("Workout saved and synced.");}
 catch(e){setStatus("Saved offline");alert("Workout saved locally. Cloud sync will be retried when you are online.");console.error(e)}
 clearWorkoutForm();renderDashboard();showTab("dashboard");
}
async function syncFromCloud(){if(!currentUser||!navigator.onLine)return;setStatus("Syncing…");try{appData=await loadCloudData();setStatus("Synced",true);renderDashboard()}catch(e){setStatus("Offline cache");throw e}}
function renderDashboard(){
 const ws=appData.workouts,total=ws.reduce((s,w)=>s+(w.cardio?.minutes||0),0),last=ws.filter(w=>w.cardio?.minutes>0).at(-1);
 $("dashboardMetrics").innerHTML=`<div class="metric"><div class="metric-title">Total Workouts</div><div class="metric-value">${ws.length}</div></div><div class="metric"><div class="metric-title">Cardio Minutes</div><div class="metric-value">${Math.round(total)}</div></div><div class="metric"><div class="metric-title">Last Avg HR</div><div class="metric-value">${last?.cardio?.avgHR||"—"}</div></div><div class="metric"><div class="metric-title">Last Cardio RPE</div><div class="metric-value">${last?.cardio?.rpe||"—"}</div></div>`;
 renderCardioBenchmarkStatus();$("nextWorkout").innerHTML=getRecommendedExercises().map(e=>`<span class="badge ${e[4]>=8?"badge-warning":"badge-good"}"><strong>${esc(e[0])}</strong>: ${e[1]||"—"} kg × ${e[3]} × ${e[2]} • target RPE ${e[4]}</span>`).join("");
 const s=appData.workouts.slice(-5).reverse();$("recentSessions").innerHTML=s.length?s.map(w=>`<div class="progress-box"><strong>${esc(w.date)}</strong> — ${esc(w.session)}<br><span class="small">${w.exercises.length} strength exercises${w.cardio?.minutes?` • ${esc(w.cardio.type)} ${w.cardio.minutes} min • HR ${w.cardio.avgHR||"—"}`:""}</span></div>`).join(""):"<p>No workouts recorded yet.</p>";
}
function renderCardioBenchmarkStatus(){const s=appData.workouts.filter(w=>{const c=w.cardio;return c&&c.type==="Treadmill"&&Math.abs(c.speed-5)<.11&&Math.abs(c.incline-5)<.6&&c.avgHR>0});if(!s.length){$("cardioBenchmarkStatus").innerHTML="<p class='muted'>No standardized 5 kph / 5% treadmill sessions logged yet.</p>";return}const l=s.at(-1),p=s.at(-2),d=p?l.cardio.avgHR-p.cardio.avgHR:0;const msg=!p?"First benchmark recorded.":d<=-2?"HR is lower than the previous benchmark — encouraging sign.":d>=2?"HR is higher than the previous benchmark; consider fatigue and recovery before interpreting this.":"HR is broadly stable. Continue collecting standardized sessions.";$("cardioBenchmarkStatus").innerHTML=`<div class="progress-box"><strong>Latest benchmark: ${l.cardio.avgHR} bpm</strong><p>${msg}</p></div>`}
function renderHistory(){const ws=[...appData.workouts].reverse();$("historyContent").innerHTML=ws.length?`<table><thead><tr><th>Date</th><th>Session</th><th>Strength</th><th>Cardio</th><th></th></tr></thead><tbody>${ws.map((w,ri)=>{const i=appData.workouts.length-1-ri;return `<tr><td>${esc(w.date)}</td><td>${esc(w.session)}</td><td>${w.exercises.map(e=>`${esc(e.name)}: ${e.weight} kg × ${e.reps} × ${e.sets}, RPE ${e.rpe}`).join("<br>")}</td><td>${w.cardio?.minutes?`${esc(w.cardio.type)}<br>${w.cardio.minutes} min<br>HR: ${w.cardio.avgHR||"—"}<br>RPE: ${w.cardio.rpe||"—"}`:"—"}</td><td><button class="btn-danger delete-one" data-index="${i}">Delete</button></td></tr>`}).join("")}</tbody></table>`:"<p>No workouts recorded.</p>";document.querySelectorAll(".delete-one").forEach(b=>b.onclick=()=>deleteWorkout(Number(b.dataset.index)))}
async function deleteWorkout(i){if(!confirm("Delete this workout from the cloud?"))return;const local=appData.workouts[i];try{if(String(local.id).startsWith("local-")){appData.workouts.splice(i,1)}else{await supabaseClient.from("workouts").delete().eq("id",local.id);appData.workouts.splice(i,1)}setLocalData(appData);renderHistory();renderDashboard();setStatus("Synced",true)}catch(e){alert("Could not delete the workout.");console.error(e)}}
function renderCharts(){Object.values(charts).forEach(c=>c?.destroy());const ws=[...appData.workouts].sort((a,b)=>a.date.localeCompare(b.date));const names=["Leg Press","Chest Press","Lat Pulldown","Seated Row","Seated Leg Curl","Shoulder Press"];charts.strength=new Chart($("strengthChart"),{type:"line",data:{labels:ws.map(w=>w.date),datasets:names.map(n=>({label:n,data:ws.map(w=>{const e=w.exercises.find(e=>e.name===n);return e?e.weight:null})}))},options:{responsive:true,maintainAspectRatio:false}});const cw=ws.filter(w=>w.cardio?.minutes>0&&w.cardio?.avgHR>0);charts.cardio=new Chart($("cardioChart"),{type:"scatter",data:{datasets:[{label:"Cardio HR",data:cw.map(w=>{const c=w.cardio;return{x:c.type==="Treadmill"?c.speed*(1+c.incline/100):(c.speed||c.minutes),y:c.avgHR}})]}},options:{responsive:true,maintainAspectRatio:false,scales:{x:{title:{display:true,text:"Workload index"}},y:{title:{display:true,text:"Average HR (bpm)"}}}}});charts.duration=new Chart($("durationChart"),{type:"line",data:{labels:cw.map(w=>w.date),datasets:[{label:"Cardio minutes",data:cw.map(w=>w.cardio.minutes)}]},options:{responsive:true,maintainAspectRatio:false}})}
function renderBenchmarkTable(){const s=appData.workouts.filter(w=>{const c=w.cardio;return c&&c.type==="Treadmill"&&Math.abs(c.speed-5)<.11&&Math.abs(c.incline-5)<.6&&c.avgHR>0});$("benchmarkTable").innerHTML=s.length?`<table><thead><tr><th>Date</th><th>Duration</th><th>Avg HR</th><th>Peak HR</th><th>RPE</th></tr></thead><tbody>${s.map(w=>`<tr><td>${esc(w.date)}</td><td>${w.cardio.minutes} min</td><td>${w.cardio.avgHR}</td><td>${w.cardio.peakHR||"—"}</td><td>${w.cardio.rpe||"—"}</td></tr>`).join("")}</tbody></table>`:"<p>No standardized benchmark sessions yet.</p>"}
function exportCSV(){const rows=[["date","session","exercise","weight_kg","sets","reps","rpe","cardio_type","cardio_minutes","distance_km","speed_kph","incline","avg_hr","peak_hr","cardio_rpe","hr_recovery"]];appData.workouts.forEach(w=>w.exercises.forEach(e=>rows.push([w.date,w.session,e.name,e.weight,e.sets,e.reps,e.rpe,w.cardio.type,w.cardio.minutes,w.cardio.distance,w.cardio.speed,w.cardio.incline,w.cardio.avgHR,w.cardio.peakHR,w.cardio.rpe,w.cardio.recovery])));downloadBlob(new Blob([rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n")],{type:"text/csv"}),"fitness-data.csv")}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function importJSON(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const x=JSON.parse(r.result);if(!Array.isArray(x.workouts))throw 0;if(!confirm("Import this backup into your account? Existing cloud data will be replaced."))return;appData=x;setLocalData(appData);await replaceCloudData(appData,currentUser.id);setStatus("Synced",true);renderDashboard();alert("Backup imported and synced.");}catch(err){alert("Import failed.");console.error(err)}finally{e.target.value=""}};r.readAsText(f)}
async function deleteAllCloudData(){if(!confirm("DELETE ALL your cloud workout data? Export a backup first if needed."))return;try{await replaceCloudData({workouts:[]},currentUser.id);appData={workouts:[]};setLocalData(appData);renderDashboard();alert("All workout data deleted.");}catch(e){alert("Could not delete all data.");console.error(e)}}
init();
