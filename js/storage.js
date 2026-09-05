const LOCAL_KEY="myFitnessTracker_v3_cache";
const LEGACY_LOCAL_KEYS=["myFitnessTracker_v2_cache"];

function emptyLocalData(){return {workouts:[],equipment:[]};}

function getLocalData(){
  try{
    const raw=localStorage.getItem(LOCAL_KEY);
    if(raw){
      const data=JSON.parse(raw);
      return {workouts:Array.isArray(data.workouts)?data.workouts:[],equipment:Array.isArray(data.equipment)?data.equipment:[]};
    }
    for(const key of LEGACY_LOCAL_KEYS){
      const legacy=localStorage.getItem(key);
      if(legacy){
        const data=JSON.parse(legacy);
        const migrated={workouts:Array.isArray(data.workouts)?data.workouts:[],equipment:[]};
        localStorage.setItem(LOCAL_KEY,JSON.stringify(migrated));
        return migrated;
      }
    }
  }catch(e){console.warn("Could not read local cache",e);}
  return emptyLocalData();
}

function setLocalData(data){
  localStorage.setItem(LOCAL_KEY,JSON.stringify({
    workouts:Array.isArray(data.workouts)?data.workouts:[],
    equipment:Array.isArray(data.equipment)?data.equipment:[]
  }));
}

function normalizeEquipment(rows){
  return (rows||[]).map(e=>({
    id:e.id,
    name:String(e.name||"").trim(),
    type:String(e.type||"").trim(),
    primary_muscles:e.primary_muscles||"",
    secondary_muscles:e.secondary_muscles||"",
    cardio_benefit:e.cardio_benefit||"",
    created_at:e.created_at||null
  })).filter(e=>e.name);
}

function normalizeCloudData(workouts,exercises,cardio){
  const exBy={};
  (exercises||[]).forEach(e=>{
    (exBy[e.workout_id]??=[]).push({
      name:e.exercise_name,weight:Number(e.weight_kg)||0,sets:Number(e.sets)||0,
      reps:Number(e.reps)||0,rpe:Number(e.rpe)||0
    });
  });
  const cBy={};
  (cardio||[]).forEach(c=>cBy[c.workout_id]={
    type:c.cardio_type||"",minutes:Number(c.duration_minutes)||0,distance:Number(c.distance_km)||0,
    speed:Number(c.speed_kph)||0,incline:Number(c.incline_percent)||0,avgHR:Number(c.average_hr)||0,
    peakHR:Number(c.peak_hr)||0,rpe:Number(c.rpe)||0,calories:Number(c.calories)||0,
    recovery:Number(c.hr_recovery_1min)||0
  });
  return {workouts:(workouts||[]).map(w=>({
    id:w.id,date:w.workout_date,session:w.session_name||"Workout",preHR:Number(w.pre_workout_hr)||0,
    notes:w.notes||"",exercises:exBy[w.id]||[],cardio:cBy[w.id]||{
      type:"",minutes:0,distance:0,speed:0,incline:0,avgHR:0,peakHR:0,rpe:0,calories:0,recovery:0
    }
  }))};
}

async function loadCloudData(){
  const {data:w,error:we}=await supabaseClient.from("workouts").select("*").order("workout_date",{ascending:true});
  if(we)throw we;
  const ids=(w||[]).map(x=>x.id);
  let ex=[],ca=[];
  if(ids.length){
    const e=await supabaseClient.from("exercise_sets").select("*").in("workout_id",ids);
    if(e.error)throw e.error; ex=e.data||[];
    const c=await supabaseClient.from("cardio_sessions").select("*").in("workout_id",ids);
    if(c.error)throw c.error; ca=c.data||[];
  }
  const data=normalizeCloudData(w||[],ex,ca);
  const current=getLocalData();
  setLocalData({...data,equipment:current.equipment});
  return data;
}

async function loadEquipmentCloud(){
  const {data,error}=await supabaseClient.from("equipment").select("*").order("type").order("name");
  if(error)throw error;
  return normalizeEquipment(data||[]);
}

async function saveWorkoutToCloud(workout,userId){
  const {data:w,error:we}=await supabaseClient.from("workouts").insert({
    user_id:userId,workout_date:workout.date,session_name:workout.session,
    pre_workout_hr:workout.preHR,notes:workout.notes||""
  }).select().single();
  if(we)throw we;
  if(workout.exercises.length){
    const rows=workout.exercises.map(e=>({workout_id:w.id,user_id:userId,exercise_name:e.name,weight_kg:e.weight,sets:e.sets,reps:e.reps,rpe:e.rpe}));
    const x=await supabaseClient.from("exercise_sets").insert(rows);if(x.error)throw x.error;
  }
  const c=workout.cardio||{};
  if(c.type&&(c.minutes||c.avgHR||c.distance||c.speed||c.incline||c.peakHR||c.rpe||c.calories||c.recovery)){
    const x=await supabaseClient.from("cardio_sessions").insert({
      workout_id:w.id,user_id:userId,cardio_type:c.type,duration_minutes:c.minutes,
      distance_km:c.distance,speed_kph:c.speed,incline_percent:c.incline,average_hr:c.avgHR,
      peak_hr:c.peakHR,rpe:c.rpe,calories:c.calories,hr_recovery_1min:c.recovery
    });
    if(x.error)throw x.error;
  }
}

async function replaceCloudData(data,userId){
  const {data:existing,error}=await supabaseClient.from("workouts").select("id").eq("user_id",userId);
  if(error)throw error;
  const ids=(existing||[]).map(x=>x.id);
  if(ids.length){const d=await supabaseClient.from("workouts").delete().in("id",ids);if(d.error)throw d.error;}
  for(const w of data.workouts)await saveWorkoutToCloud(w,userId);
  const current=getLocalData();
  setLocalData({workouts:data.workouts,equipment:current.equipment});
}
