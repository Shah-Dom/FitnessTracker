import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const responseSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    session_type: { type: "string", enum: ["A", "B"] },
    estimated_minutes: { type: "integer" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          exercise_name: { type: "string" },
          sets: { type: "integer" },
          reps_min: { type: "integer" },
          reps_max: { type: "integer" },
          weight_kg: { type: "number" },
          target_rpe: { type: "number" },
          progression: { type: "string", enum: ["increase", "maintain", "decrease"] },
          reason: { type: "string" },
        },
        required: ["exercise_name", "sets", "reps_min", "reps_max", "weight_kg", "target_rpe", "progression", "reason"],
      },
    },
    cardio: {
      type: "object",
      properties: {
        included: { type: "boolean" },
        type: { type: "string" },
        minutes: { type: "integer" },
        intensity: { type: "string" },
        reason: { type: "string" },
      },
      required: ["included", "type", "minutes", "intensity", "reason"],
    },
    answer: { type: "string" },
  },
  required: ["title", "summary", "session_type", "estimated_minutes", "exercises", "cardio", "answer"],
};

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: HEADERS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action === "ask" ? "ask" : "propose";
    const userId = authData.user.id;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "Set GEMINI_API_KEY in Supabase secrets." }, 500);

    // Read the user's data on the server. The frontend cannot substitute another user's context.
    const [profileResult, weightResult, workoutResult, equipmentResult] = await Promise.all([
      supabase.from("profiles").select("date_of_birth,gender,height_cm,goal").eq("user_id", userId).maybeSingle(),
      supabase.from("weight_entries").select("recorded_at,weight_kg").eq("user_id", userId).order("recorded_at", { ascending: false }).limit(30),
      supabase.from("workouts").select("id,workout_date,session_name,pre_workout_hr,notes").eq("user_id", userId).order("workout_date", { ascending: false }).limit(12),
      supabase.from("equipment").select("id,name,type,primary_muscles,secondary_muscles,cardio_benefit").order("type").order("name").limit(100),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (weightResult.error) throw weightResult.error;
    if (workoutResult.error) throw workoutResult.error;
    if (equipmentResult.error) throw equipmentResult.error;

    const workouts = workoutResult.data || [];
    const workoutIds = workouts.map((w) => w.id);
    let exerciseSets: any[] = [];
    let cardioSessions: any[] = [];
    if (workoutIds.length) {
      const [e, c] = await Promise.all([
        supabase.from("exercise_sets").select("workout_id,exercise_name,weight_kg,sets,reps,rpe").in("workout_id", workoutIds),
        supabase.from("cardio_sessions").select("workout_id,cardio_type,duration_minutes,distance_km,speed_kph,incline_percent,average_hr,peak_hr,rpe,calories,hr_recovery_1min").in("workout_id", workoutIds),
      ]);
      if (e.error) throw e.error;
      if (c.error) throw c.error;
      exerciseSets = e.data || [];
      cardioSessions = c.data || [];
    }

    const exercisesByWorkout = new Map<string, any[]>();
    for (const e of exerciseSets) {
      const list = exercisesByWorkout.get(e.workout_id) || [];
      list.push({ name: e.exercise_name, weight_kg: e.weight_kg, sets: e.sets, reps: e.reps, rpe: e.rpe });
      exercisesByWorkout.set(e.workout_id, list);
    }
    const cardioByWorkout = new Map<string, any>();
    for (const c of cardioSessions) {
      cardioByWorkout.set(c.workout_id, {
        type: c.cardio_type, minutes: c.duration_minutes, distance_km: c.distance_km,
        speed_kph: c.speed_kph, incline_percent: c.incline_percent, average_hr: c.average_hr,
        peak_hr: c.peak_hr, rpe: c.rpe, calories: c.calories, recovery_1min: c.hr_recovery_1min,
      });
    }

    const context = {
      age: calculateAge(profileResult.data?.date_of_birth || null),
      gender: profileResult.data?.gender || null,
      height_cm: profileResult.data?.height_cm || null,
      goal: profileResult.data?.goal || null,
      weights: weightResult.data || [],
      workouts: workouts.map((w) => ({
        date: w.workout_date,
        session: w.session_name,
        pre_workout_hr: w.pre_workout_hr,
        notes: w.notes,
        exercises: exercisesByWorkout.get(w.id) || [],
        cardio: cardioByWorkout.get(w.id) || null,
      })),
      equipment: equipmentResult.data || [],
    };

    const systemInstruction = `You are the My Fitness AI Coach. You advise an adult beginner/intermediate user whose goals are cardiovascular fitness and maintaining/building muscle. Sessions should be about 60 minutes and follow an A/B rotation. Use ONLY equipment supplied in the context. Strength target is generally RPE 7-8, leaving about 2-3 reps in reserve. Progress conservatively: RPE >=9 means hold or decrease load; RPE 7-8 means maintain or progress reps when appropriate; RPE <=6 at the top of the rep range may justify a small load increase. Main exercises are generally 3 sets of 8-12; accessories generally 2 sets of 10-15. Cardio is generally RPE 5-6. Never diagnose conditions or make medical claims. Recommendations are advice only and are not saved automatically. For a workout proposal, alternate A/B based on recent sessions. Do not invent equipment or exercise names. Keep proposed loads conservative and use 0 kg only when no prior load is available.`;
    const userPrompt = action === "ask"
      ? `Answer the user's question using the supplied training context. Question: ${String(body.question || "")}. Context: ${JSON.stringify(context)}`
      : `Propose the next workout using the supplied context. Alternate A/B from recent history, prioritize the user's goal, and fit the session into about 60 minutes. Context: ${JSON.stringify(context)}`;

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.3 },
        }),
      },
    );

    const result = await geminiResponse.json();
    if (!geminiResponse.ok) return json({ error: `Gemini API error (${geminiResponse.status}).` }, 502);
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ error: "Gemini returned no usable response." }, 502);

    const output = JSON.parse(text);
    return action === "ask" ? json({ answer: output.answer || output.summary || "No answer returned." }) : json({ proposal: output });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
