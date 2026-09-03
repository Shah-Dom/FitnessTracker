/* =========================================================
   FITNESS TRACKER - app.js
   ========================================================= */

let appData = getLocalData();
let currentUser = null;
let charts = {};
let equipment = [];
let equipmentFilter = "all";
let editingEquipmentId = null;


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function showMessage(id, text, type = "") {
  const el = $(id);
  if (!el) return;

  el.textContent = text;
  el.className = `message ${type}`.trim();
}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

async function authenticate(signup = false) {
  const email = normalizeText($("authEmail")?.value);
  const password = $("authPassword")?.value || "";

  if (!email || !password) {
    showMessage(
      "authMessage",
      "Please enter your email and password.",
      "error"
    );
    return;
  }

  showMessage("authMessage", "Please wait...");

  try {
    let result;

    if (signup) {
      result = await supabaseClient.auth.signUp({
        email,
        password
      });
    } else {
      result = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) throw result.error;

    if (signup && !result.data.session) {
      showMessage(
        "authMessage",
        "Account created. Check your email if confirmation is required.",
        "success"
      );
      return;
    }

    showMessage("authMessage", "Success.", "success");

  } catch (error) {
    console.error("Authentication error:", error);

    showMessage(
      "authMessage",
      error.message || "Authentication failed.",
      "error"
    );
  }
}


async function signOut() {
  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.error("Sign out error:", error);
  }
}


/* =========================================================
   APP ENTRY
   ========================================================= */

async function enterApp() {
  $("authScreen")?.setAttribute("hidden", "");
  $("appShell")?.removeAttribute("hidden");

  try {
    appData = await loadCloudData();
  } catch (error) {
    console.error("Cloud data load error:", error);

    appData = getLocalData();

    showMessage(
      "globalMessage",
      "Could not load cloud workout data. Showing local data.",
      "error"
    );
  }

  await loadEquipment();

  clearWorkoutForm();
  renderDashboard();
  renderHistory();
  renderProgress();
}


async function handleAuthState(session) {
  currentUser = session?.user || null;

  if (currentUser) {
    await enterApp();
  } else {
    $("authScreen")?.removeAttribute("hidden");
    $("appShell")?.setAttribute("hidden", "");
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function showTab(tabName) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.remove("active");
  });

  document.querySelectorAll("nav button").forEach(button => {
    button.classList.remove("active");
  });

  const tab = $(`${tabName}Tab`);

  if (tab) {
    tab.classList.add("active");
  }

  const button = document.querySelector(
    `nav button[data-tab="${tabName}"]`
  );

  if (button) {
    button.classList.add("active");
  }

  if (tabName === "dashboard") {
    renderDashboard();
  }

  if (tabName === "history") {
    renderHistory();
  }

  if (tabName === "progress") {
    renderProgress();
  }

  if (tabName === "equipment") {
    renderEquipment();
  }
}


/* =========================================================
   EQUIPMENT
   ========================================================= */

async function loadEquipment() {
  if (!navigator.onLine) {
    renderEquipment();
    populateCardioSelect();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("equipment")
      .select("*")
      .order("type")
      .order("name");

    if (error) throw error;

    equipment = (data || []).map(e => ({
      ...e,
      name: normalizeText(e.name),
      type: normalizeKey(e.type),
      primary_muscles: normalizeText(e.primary_muscles),
      secondary_muscles: normalizeText(e.secondary_muscles),
      cardio_benefit: normalizeText(e.cardio_benefit)
    }));

    console.log("Equipment loaded:", equipment);

    populateCardioSelect();
    renderEquipment();

  } catch (error) {
    console.error("Equipment load error:", error);

    equipment = [];

    populateCardioSelect();
    renderEquipment();

    const container = $("equipmentContent");

    if (container) {
      container.innerHTML = `
        <div class="message error">
          Could not load equipment: ${esc(error.message)}
        </div>
      `;
    }
  }
}


function getStrengthEquipment() {
  return equipment
    .filter(
      e => normalizeKey(e.type) === "strength"
    )
    .sort(
      (a, b) =>
        normalizeText(a.name).localeCompare(
          normalizeText(b.name)
        )
    );
}


function getCardioEquipment() {
  return equipment
    .filter(
      e => normalizeKey(e.type) === "cardio"
    )
    .sort(
      (a, b) =>
        normalizeText(a.name).localeCompare(
          normalizeText(b.name)
        )
    );
}


function buildEquipmentOptions(selected = "") {
  const selectedKey = normalizeKey(selected);

  const options = getStrengthEquipment();

  if (!options.length) {
    return `<option value="">No strength equipment available</option>`;
  }

  return options
    .map(e => {
      const name = normalizeText(e.name);

      return `
        <option
          value="${esc(name)}"
          ${normalizeKey(name) === selectedKey ? "selected" : ""}
        >
          ${esc(name)}
        </option>
      `;
    })
    .join("");
}


function populateCardioSelect(selected = "") {
  const select = $("cardioType");

  if (!select) return;

  const selectedKey = normalizeKey(selected);

  const options = getCardioEquipment();

  select.innerHTML = `
    <option value="">Select cardio equipment</option>
    ${options
      .map(e => {
        const name = normalizeText(e.name);

        return `
          <option
            value="${esc(name)}"
            ${normalizeKey(name) === selectedKey ? "selected" : ""}
          >
            ${esc(name)}
          </option>
        `;
      })
      .join("")}
  `;
}


/* =========================================================
   EQUIPMENT RENDERING
   ========================================================= */

function renderEquipment() {
  const container = $("equipmentContent");

  if (!container) return;

  let list = [...equipment];

  if (equipmentFilter !== "all") {
    list = list.filter(
      e =>
        normalizeKey(e.type) ===
        normalizeKey(equipmentFilter)
    );
  }

  list.sort(
    (a, b) =>
      normalizeText(a.name).localeCompare(
        normalizeText(b.name)
      )
  );

  if (!list.length) {
    container.innerHTML = `
      <div class="message muted">
        No equipment found for this filter.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Equipment</th>
            <th>Type</th>
            <th>Primary muscles</th>
            <th>Secondary muscles</th>
            <th>Cardio benefit</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          ${list.map(e => `
            <tr>
              <td><strong>${esc(e.name)}</strong></td>

              <td>
                <span class="badge">
                  ${esc(e.type)}
                </span>
              </td>

              <td>
                ${esc(e.primary_muscles || "—")}
              </td>

              <td>
                ${esc(e.secondary_muscles || "—")}
              </td>

              <td>
                ${
                  normalizeKey(e.type) === "cardio"
                    ? esc(
                        e.cardio_benefit ||
                        "Not specified"
                      )
                    : "—"
                }
              </td>

              <td>
                <div class="actions">
                  <button
                    class="btn equipment-edit"
                    data-id="${esc(e.id)}"
                  >
                    Edit
                  </button>

                  <button
                    class="btn-danger equipment-delete"
                    data-id="${esc(e.id)}"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container
    .querySelectorAll(".equipment-edit")
    .forEach(button => {
      button.addEventListener("click", () => {
        editEquipment(button.dataset.id);
      });
    });

  container
    .querySelectorAll(".equipment-delete")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteEquipment(button.dataset.id);
      });
    });
}


/* =========================================================
   EQUIPMENT FORM
   ========================================================= */

function openEquipmentForm(equipmentId = null) {
  editingEquipmentId = equipmentId;

  const card = $("equipmentFormCard");

  if (!card) return;

  card.removeAttribute("hidden");

  if (equipmentId === null) {
    $("equipmentFormTitle").textContent =
      "Add Equipment";

    $("equipmentName").value = "";
    $("equipmentType").value = "strength";
    $("equipmentPrimary").value = "";
    $("equipmentSecondary").value = "";
    $("equipmentBenefit").value = "";

    updateEquipmentBenefitVisibility();

  } else {
    const item = equipment.find(
      e => String(e.id) === String(equipmentId)
    );

    if (!item) return;

    $("equipmentFormTitle").textContent =
      "Edit Equipment";

    $("equipmentName").value =
      item.name || "";

    $("equipmentType").value =
      item.type || "strength";

    $("equipmentPrimary").value =
      item.primary_muscles || "";

    $("equipmentSecondary").value =
      item.secondary_muscles || "";

    $("equipmentBenefit").value =
      item.cardio_benefit || "";

    updateEquipmentBenefitVisibility();
  }
}


function closeEquipmentForm() {
  editingEquipmentId = null;

  $("equipmentFormCard")?.setAttribute(
    "hidden",
    ""
  );
}


function updateEquipmentBenefitVisibility() {
  const type = normalizeKey(
    $("equipmentType")?.value
  );

  const field = $("equipmentBenefitField");

  if (!field) return;

  if (type === "cardio") {
    field.removeAttribute("hidden");
  } else {
    field.setAttribute("hidden", "");
  }
}


async function saveEquipment() {
  const name = normalizeText(
    $("equipmentName")?.value
  );

  const type = normalizeKey(
    $("equipmentType")?.value
  );

  const primary = normalizeText(
    $("equipmentPrimary")?.value
  );

  const secondary = normalizeText(
    $("equipmentSecondary")?.value
  );

  const benefit = normalizeText(
    $("equipmentBenefit")?.value
  );

  if (!name) {
    showMessage(
      "equipmentMessage",
      "Please enter an equipment name.",
      "error"
    );
    return;
  }

  if (!["strength", "cardio"].includes(type)) {
    showMessage(
      "equipmentMessage",
      "Please select a valid equipment type.",
      "error"
    );
    return;
  }

  const payload = {
    name,
    type,
    primary_muscles: primary || null,
    secondary_muscles: secondary || null,
    cardio_benefit:
      type === "cardio"
        ? benefit || null
        : null
  };

  try {
    let result;

    if (editingEquipmentId === null) {
      result = await supabaseClient
        .from("equipment")
        .insert(payload);
    } else {
      result = await supabaseClient
        .from("equipment")
        .update(payload)
        .eq("id", editingEquipmentId);
    }

    if (result.error) {
      throw result.error;
    }

    showMessage(
      "equipmentMessage",
      "Equipment saved successfully.",
      "success"
    );

    closeEquipmentForm();

    await loadEquipment();

    /*
     * Rebuild any currently visible exercise rows
     * only when they are empty/new rows. Existing
     * selected exercises are preserved elsewhere.
     */

  } catch (error) {
    console.error("Save equipment error:", error);

    showMessage(
      "equipmentMessage",
      error.message || "Could not save equipment.",
      "error"
    );
  }
}


async function editEquipment(id) {
  openEquipmentForm(id);
}


async function deleteEquipment(id) {
  const item = equipment.find(
    e => String(e.id) === String(id)
  );

  if (!item) return;

  const confirmed = confirm(
    `Delete "${item.name}"?`
  );

  if (!confirmed) return;

  try {
    const { error } = await supabaseClient
      .from("equipment")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await loadEquipment();

  } catch (error) {
    console.error("Delete equipment error:", error);

    showMessage(
      "equipmentMessage",
      error.message || "Could not delete equipment.",
      "error"
    );
  }
}


/* =========================================================
   WORKOUT EXERCISE ROWS
   ========================================================= */

function addExerciseRow(
  name = "",
  weight = "",
  sets = 3,
  reps = 12,
  rpe = ""
) {
  const container = $("exerciseRows");

  if (!container) return;

  const row = document.createElement("div");

  row.className = "exercise-row";

  row.innerHTML = `
    <div>
      <label>Exercise</label>
      <select class="exercise-name">
        ${buildEquipmentOptions(name)}
      </select>
    </div>

    <div>
      <label>Weight (kg)</label>
      <input
        type="number"
        class="exercise-weight"
        min="0"
        step="0.5"
        value="${esc(weight)}"
      >
    </div>

    <div>
      <label>Sets</label>
      <input
        type="number"
        class="exercise-sets"
        min="1"
        step="1"
        value="${esc(sets)}"
      >
    </div>

    <div>
      <label>Reps</label>
      <input
        type="number"
        class="exercise-reps"
        min="1"
        step="1"
        value="${esc(reps)}"
      >
    </div>

    <div>
      <label>RPE</label>
      <input
        type="number"
        class="exercise-rpe"
        min="1"
        max="10"
        step="0.5"
        value="${esc(rpe)}"
      >
    </div>

    <div>
      <button
        type="button"
        class="btn-danger remove-exercise"
      >
        ×
      </button>
    </div>
  `;

  container.appendChild(row);

  row
    .querySelector(".remove-exercise")
    .addEventListener("click", () => {
      row.remove();
    });
}


function collectExercises() {
  const rows = document.querySelectorAll(
    "#exerciseRows .exercise-row"
  );

  const exercises = [];

  rows.forEach(row => {
    const name = normalizeText(
      row.querySelector(".exercise-name")?.value
    );

    if (!name) return;

    exercises.push({
      name,
      weight: num(
        row.querySelector(".exercise-weight")?.value
      ),
      sets: num(
        row.querySelector(".exercise-sets")?.value
      ),
      reps: num(
        row.querySelector(".exercise-reps")?.value
      ),
      rpe: num(
        row.querySelector(".exercise-rpe")?.value
      )
    });
  });

  return exercises;
}


/* =========================================================
   CLEAR WORKOUT FORM
   ========================================================= */

function clearWorkoutForm() {
  if ($("workoutDate")) {
    $("workoutDate").value =
      new Date().toISOString().slice(0, 10);
  }

  if ($("sessionName")) {
    $("sessionName").value = "";
  }

  if ($("preWorkoutHR")) {
    $("preWorkoutHR").value = "";
  }

  if ($("notes")) {
    $("notes").value = "";
  }

  if ($("exerciseRows")) {
    $("exerciseRows").innerHTML = "";
  }

  /*
   * Start with the first six strength machines.
   */
  getStrengthEquipment()
    .slice(0, 6)
    .forEach(e => {
      addExerciseRow(
        e.name,
        "",
        3,
        12,
        ""
      );
    });

  populateCardioSelect();

  if ($("cardioType")) {
    $("cardioType").value = "";
  }

  const cardioFields = [
    "cardioDuration",
    "cardioDistance",
    "cardioSpeed",
    "cardioIncline",
    "cardioAvgHR",
    "cardioPeakHR",
    "cardioRPE",
    "cardioCalories",
    "cardioRecovery"
  ];

  cardioFields.forEach(id => {
    if ($(id)) {
      $(id).value = "";
    }
  });
}


/* =========================================================
   GET LAST WORKOUT
   ========================================================= */

function getLastWorkout() {
  const workouts = [...(appData.workouts || [])];

  workouts.sort((a, b) => {
    const dateCompare =
      normalizeText(b.date).localeCompare(
        normalizeText(a.date)
      );

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return normalizeText(b.id).localeCompare(
      normalizeText(a.id)
    );
  });

  return workouts[0] || null;
}


/* =========================================================
   LOAD PREVIOUS SESSION
   ========================================================= */

function loadPreviousSession() {
  const last = getLastWorkout();

  if (!last) {
    alert("No previous workout found.");
    return;
  }

  if ($("workoutDate")) {
    $("workoutDate").value =
      new Date().toISOString().slice(0, 10);
  }

  if ($("sessionName")) {
    $("sessionName").value =
      `Workout ${num(
        String(last.session || "").replace(/\D/g, ""),
        0
      ) + 1}`;
  }

  if ($("preWorkoutHR")) {
    $("preWorkoutHR").value = "";
  }

  $("exerciseRows").innerHTML = "";

  (last.exercises || []).forEach(e => {
    addExerciseRow(
      e.name,
      e.weight,
      e.sets || 3,
      e.reps || 12,
      e.rpe || ""
    );
  });

  const c = last.cardio || {};

  populateCardioSelect(c.type || "");

  if ($("cardioType")) {
    $("cardioType").value = c.type || "";
  }

  if ($("cardioDuration")) {
    $("cardioDuration").value =
      c.minutes || "";
  }

  if ($("cardioDistance")) {
    $("cardioDistance").value =
      c.distance || "";
  }

  if ($("cardioSpeed")) {
    $("cardioSpeed").value =
      c.speed || "";
  }

  if ($("cardioIncline")) {
    $("cardioIncline").value =
      c.incline || "";
  }

  if ($("cardioAvgHR")) {
    $("cardioAvgHR").value =
      c.avgHR || "";
  }

  if ($("cardioPeakHR")) {
    $("cardioPeakHR").value =
      c.peakHR || "";
  }

  if ($("cardioRPE")) {
    $("cardioRPE").value =
      c.rpe || "";
  }

  if ($("cardioCalories")) {
    $("cardioCalories").value =
      c.calories || "";
  }

  if ($("cardioRecovery")) {
    $("cardioRecovery").value =
      c.recovery || "";
  }
}


/* =========================================================
   RECOMMENDATIONS
   ========================================================= */

function getAllExerciseRecords(name) {
  const key = normalizeKey(name);

  const records = [];

  (appData.workouts || []).forEach(workout => {
    (workout.exercises || []).forEach(ex => {
      if (
        normalizeKey(ex.name) === key
      ) {
        records.push({
          ...ex,
          date: workout.date,
          workoutId: workout.id
        });
      }
    });
  });

  records.sort((a, b) => {
    const dateCompare =
      normalizeText(b.date).localeCompare(
        normalizeText(a.date)
      );

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return normalizeText(b.workoutId).localeCompare(
      normalizeText(a.workoutId)
    );
  });

  return records;
}


function getLastExercise(name) {
  const records =
    getAllExerciseRecords(name);

  return records[0] || null;
}


function getWeightStep(weight) {
  weight = num(weight);

  if (weight < 10) return 1;
  if (weight < 25) return 2.5;
  if (weight < 50) return 2.5;
  return 5;
}


function getRecommendedExercise(name) {
  const last = getLastExercise(name);

  /*
   * No previous record.
   */
  if (!last) {
    return {
      name,
      weight: "",
      sets: 3,
      reps: 12,
      rpe: 7
    };
  }

  let weight = num(last.weight);
  let reps = num(last.reps, 12);
  let sets = num(last.sets, 3);
  let targetRPE = num(last.rpe, 7);

  /*
   * RPE >= 9:
   * reduce load slightly.
   */
  if (targetRPE >= 9) {
    weight = Math.max(
      0,
      weight - getWeightStep(weight)
    );

    targetRPE = 7;
  }

  /*
   * RPE < 7 and completed at least 12 reps:
   * increase load.
   */
  else if (
    targetRPE > 0 &&
    targetRPE < 7 &&
    reps >= 12
  ) {
    weight += getWeightStep(weight);
    targetRPE = 7;
  }

  /*
   * Otherwise maintain load.
   */
  else {
    targetRPE = 7;
  }

  return {
    name,
    weight,
    sets,
    reps,
    rpe: targetRPE
  };
}


function getRecommendedExercises() {
  return getStrengthEquipment().map(
    e => getRecommendedExercise(e.name)
  );
}


function loadRecommendedWorkout() {
  const recommendations =
    getRecommendedExercises();

  if (!recommendations.length) {
    alert(
      "No strength equipment is available. Please check the Equipment section."
    );
    return;
  }

  $("exerciseRows").innerHTML = "";

  recommendations.forEach(e => {
    addExerciseRow(
      e.name,
      e.weight,
      e.sets,
      e.reps,
      e.rpe
    );
  });

  if (!$("sessionName").value) {
    $("sessionName").value =
      `Workout ${
        (appData.workouts?.length || 0) + 1
      }`;
  }
}


/* =========================================================
   SAVE WORKOUT
   ========================================================= */

async function saveWorkout() {
  const date =
    normalizeText($("workoutDate")?.value) ||
    new Date().toISOString().slice(0, 10);

  const session =
    normalizeText($("sessionName")?.value) ||
    `Workout ${
      (appData.workouts?.length || 0) + 1
    }`;

  const preHR =
    num($("preWorkoutHR")?.value);

  const exercises =
    collectExercises();

  const cardio = {
    type:
      normalizeText($("cardioType")?.value),

    minutes:
      num($("cardioDuration")?.value),

    distance:
      num($("cardioDistance")?.value),

    speed:
      num($("cardioSpeed")?.value),

    incline:
      num($("cardioIncline")?.value),

    avgHR:
      num($("cardioAvgHR")?.value),

    peakHR:
      num($("cardioPeakHR")?.value),

    rpe:
      num($("cardioRPE")?.value),

    calories:
      num($("cardioCalories")?.value),

    recovery:
      num($("cardioRecovery")?.value)
  };

  const workout = {
    id: `local-${Date.now()}`,
    date,
    session,
    preHR,
    notes:
      normalizeText($("notes")?.value),
    exercises,
    cardio
  };

  /*
   * Save locally first.
   */
  appData.workouts.push(workout);
  setLocalData(appData);

  try {
    await saveWorkoutToCloud(
      workout,
      currentUser.id
    );

    /*
     * Reload from cloud so local data receives
     * the real Supabase workout ID.
     */
    appData = await loadCloudData();
    setLocalData(appData);

    showMessage(
      "workoutMessage",
      "Workout saved successfully.",
      "success"
    );

  } catch (error) {
    console.error(
      "Cloud workout save error:",
      error
    );

    showMessage(
      "workoutMessage",
      "Workout saved locally, but cloud sync failed: " +
        (error.message || ""),
      "error"
    );
  }

  clearWorkoutForm();
  renderDashboard();
  renderHistory();
  renderProgress();

  showTab("dashboard");
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  const workouts =
    appData.workouts || [];

  const totalWorkouts =
    workouts.length;

  const cardioMinutes =
    workouts.reduce(
      (sum, w) =>
        sum + num(w.cardio?.minutes),
      0
    );

  const last =
    getLastWorkout();

  const lastAvgHR =
    num(last?.cardio?.avgHR);

  const lastCardioRPE =
    num(last?.cardio?.rpe);

  if ($("totalWorkouts")) {
    $("totalWorkouts").textContent =
      totalWorkouts;
  }

  if ($("totalCardioMinutes")) {
    $("totalCardioMinutes").textContent =
      Math.round(cardioMinutes);
  }

  if ($("lastAvgHR")) {
    $("lastAvgHR").textContent =
      lastAvgHR || "—";
  }

  if ($("lastCardioRPE")) {
    $("lastCardioRPE").textContent =
      lastCardioRPE || "—";
  }

  renderNextWorkout();
  renderRecentSessions();
}


function renderNextWorkout() {
  const container =
    $("nextWorkout");

  if (!container) return;

  const recommendations =
    getRecommendedExercises();

  if (!recommendations.length) {
    container.innerHTML = `
      <div class="muted">
        Add strength equipment to see your recommended workout.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="progress-box">
      ${recommendations
        .slice(0, 8)
        .map(e => `
          <div>
            <strong>${esc(e.name)}</strong>:
            ${
              e.weight === ""
                ? "new exercise"
                : `${e.weight} kg`
            }
            × ${e.sets} sets × ${e.reps} reps
          </div>
        `)
        .join("")}
    </div>
  `;
}


function renderRecentSessions() {
  const container =
    $("recentSessions");

  if (!container) return;

  const workouts =
    [...(appData.workouts || [])]
      .sort((a, b) =>
        normalizeText(b.date).localeCompare(
          normalizeText(a.date)
        )
      )
      .slice(0, 5);

  if (!workouts.length) {
    container.innerHTML = `
      <div class="muted">
        No workouts recorded yet.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Session</th>
          <th>Exercises</th>
          <th>Cardio</th>
        </tr>
      </thead>

      <tbody>
        ${workouts.map(w => `
          <tr>
            <td>${esc(w.date)}</td>
            <td>${esc(w.session)}</td>
            <td>${(w.exercises || []).length}</td>
            <td>
              ${
                num(w.cardio?.minutes) > 0
                  ? `${num(w.cardio.minutes)} min`
                  : "—"
              }
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {
  const container =
    $("historyContent");

  if (!container) return;

  const workouts =
    [...(appData.workouts || [])]
      .sort((a, b) => {
        const dateCompare =
          normalizeText(b.date).localeCompare(
            normalizeText(a.date)
          );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return normalizeText(b.id).localeCompare(
          normalizeText(a.id)
        );
      });

  if (!workouts.length) {
    container.innerHTML = `
      <div class="muted">
        No workout history yet.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${workouts.map(w => `
      <div class="card">

        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <h3>
              ${esc(w.session)}
            </h3>

            <div class="muted">
              ${esc(w.date)}
            </div>
          </div>

          <button
            class="btn-danger delete-workout"
            data-id="${esc(w.id)}"
          >
            Delete
          </button>
        </div>

        ${
          (w.exercises || []).length
            ? `
              <h4>Strength</h4>

              <div style="overflow-x:auto">
                <table>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Weight</th>
                      <th>Sets</th>
                      <th>Reps</th>
                      <th>RPE</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${(w.exercises || []).map(e => `
                      <tr>
                        <td>${esc(e.name)}</td>
                        <td>${num(e.weight)} kg</td>
                        <td>${num(e.sets)}</td>
                        <td>${num(e.reps)}</td>
                        <td>${num(e.rpe) || "—"}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `
            : ""
        }

        ${
          num(w.cardio?.minutes) > 0
            ? `
              <h4>Cardio</h4>

              <div class="grid">
                <div class="metric">
                  <div class="metric-title">
                    Equipment
                  </div>
                  <div class="metric-value">
                    ${esc(w.cardio.type || "—")}
                  </div>
                </div>

                <div class="metric">
                  <div class="metric-title">
                    Duration
                  </div>
                  <div class="metric-value">
                    ${num(w.cardio.minutes)} min
                  </div>
                </div>

                <div class="metric">
                  <div class="metric-title">
                    Distance
                  </div>
                  <div class="metric-value">
                    ${num(w.cardio.distance)} km
                  </div>
                </div>

                <div class="metric">
                  <div class="metric-title">
                    Average HR
                  </div>
                  <div class="metric-value">
                    ${num(w.cardio.avgHR) || "—"}
                  </div>
                </div>
              </div>
            `
            : ""
        }

        ${
          w.notes
            ? `
              <div class="progress-box">
                <strong>Notes:</strong>
                ${esc(w.notes)}
              </div>
            `
            : ""
        }

      </div>
    `).join("")}
  `;

  container
    .querySelectorAll(".delete-workout")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteWorkout(button.dataset.id);
      });
    });
}


async function deleteWorkout(id) {
  const workout =
    appData.workouts.find(
      w => String(w.id) === String(id)
    );

  if (!workout) return;

  const confirmed = confirm(
    `Delete workout from ${workout.date}?`
  );

  if (!confirmed) return;

  try {
    /*
     * Local-only workouts do not exist in Supabase.
     */
    if (!String(id).startsWith("local-")) {
      const { error } =
        await supabaseClient
          .from("workouts")
          .delete()
          .eq("id", id);

      if (error) throw error;
    }

    appData.workouts =
      appData.workouts.filter(
        w => String(w.id) !== String(id)
      );

    setLocalData(appData);

    /*
     * Refresh from cloud if online.
     */
    if (
      navigator.onLine &&
      currentUser
    ) {
      try {
        appData = await loadCloudData();
      } catch (e) {
        console.warn(
          "Could not refresh after delete:",
          e
        );
      }
    }

    renderHistory();
    renderDashboard();
    renderProgress();

  } catch (error) {
    console.error(
      "Delete workout error:",
      error
    );

    alert(
      error.message ||
      "Could not delete workout."
    );
  }
}


/* =========================================================
   PROGRESS
   ========================================================= */

function renderProgress() {
  renderCharts();
  renderBenchmarks();
}


/* =========================================================
   STRENGTH + CARDIO + DURATION CHARTS
   ========================================================= */

function renderCharts() {
  const ws =
    [...(appData.workouts || [])]
      .filter(w => w && w.date)
      .sort((a, b) => {
        const dateCompare =
          normalizeText(a.date).localeCompare(
            normalizeText(b.date)
          );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return normalizeText(a.id).localeCompare(
          normalizeText(b.id)
        );
      });


  /* =====================================================
     REMOVE OLD CHARTS
     ===================================================== */

  if (charts.strength) {
    charts.strength.destroy();
    charts.strength = null;
  }

  if (charts.cardio) {
    charts.cardio.destroy();
    charts.cardio = null;
  }

  if (charts.duration) {
    charts.duration.destroy();
    charts.duration = null;
  }


  /* =====================================================
     REMOVE OLD EMPTY-CHART MESSAGE
     ===================================================== */

  document
    .querySelectorAll(".chart-empty-message")
    .forEach(el => el.remove());


  /* =====================================================
     FIND ALL EXERCISES FROM ACTUAL HISTORY
     =====================================================

     IMPORTANT:

     We deliberately do NOT use the equipment table here.

     The progress chart should be able to display old
     workouts even if the equipment table is empty,
     changed, or temporarily unavailable.
  */

  const exerciseMap = new Map();

  ws.forEach(workout => {
    (workout.exercises || []).forEach(ex => {
      const name =
        normalizeText(ex.name);

      if (!name) return;

      const key =
        normalizeKey(name);

      if (!exerciseMap.has(key)) {
        exerciseMap.set(key, name);
      }
    });
  });

  const exerciseNames =
    [...exerciseMap.values()]
      .sort((a, b) =>
        a.localeCompare(b)
      );


  /* =====================================================
     STRENGTH PROGRESS CHART
     ===================================================== */

  const strengthCanvas =
    $("strengthChart");

  if (strengthCanvas) {

    const datasets =
      exerciseNames
        .map(name => {
          const key =
            normalizeKey(name);

          const values =
            ws.map(workout => {

              const matches =
                (workout.exercises || [])
                  .filter(ex =>
                    normalizeKey(ex.name) === key
                  );

              if (!matches.length) {
                return null;
              }

              /*
               * If the same exercise appears more than
               * once in one workout, use the first valid
               * weight.
               */
              const valid =
                matches.find(ex => {
                  const weight =
                    Number(ex.weight);

                  return (
                    Number.isFinite(weight) &&
                    weight > 0
                  );
                });

              if (!valid) {
                return null;
              }

              return Number(valid.weight);
            });

          const hasData =
            values.some(
              value =>
                value !== null &&
                Number.isFinite(value)
            );

          if (!hasData) {
            return null;
          }

          return {
            label: name,
            data: values,
            tension: 0.2,
            spanGaps: true,
            pointRadius: 4,
            pointHoverRadius: 6
          };
        })
        .filter(Boolean);


    charts.strength =
      new Chart(
        strengthCanvas,
        {
          type: "line",

          data: {
            labels:
              ws.map(w => w.date),

            datasets
          },

          options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
              mode: "nearest",
              intersect: false
            },

            plugins: {
              legend: {
                display: true,
                position: "bottom"
              },

              tooltip: {
                callbacks: {
                  label: context => {
                    const value =
                      context.parsed.y;

                    if (
                      value === null ||
                      value === undefined
                    ) {
                      return context.dataset.label;
                    }

                    return `${
                      context.dataset.label
                    }: ${value} kg`;
                  }
                }
              }
            },

            scales: {
              y: {
                beginAtZero: true,

                title: {
                  display: true,
                  text: "Weight (kg)"
                }
              },

              x: {
                title: {
                  display: true,
                  text: "Workout date"
                }
              }
            }
          }
        }
      );


    if (!datasets.length) {
      const parent =
        strengthCanvas.parentElement;

      if (parent) {
        parent.insertAdjacentHTML(
          "beforeend",
          `
            <div class="message muted chart-empty-message">
              No recorded strength weights yet.
            </div>
          `
        );
      }
    }
  }


  /* =====================================================
     CARDIO PROGRESS CHART
     ===================================================== */

  const cardioWorkouts =
    ws.filter(workout => {
      const c =
        workout.cardio || {};

      return (
        num(c.minutes) > 0 &&
        num(c.avgHR) > 0
      );
    });

  const cardioCanvas =
    $("cardioChart");

  if (cardioCanvas) {

    charts.cardio =
      new Chart(
        cardioCanvas,
        {
          type: "line",

          data: {
            labels:
              cardioWorkouts.map(
                w => w.date
              ),

            datasets: [
              {
                label: "Average HR",

                data:
                  cardioWorkouts.map(
                    w =>
                      num(
                        w.cardio?.avgHR
                      ) || null
                  ),

                tension: 0.2,
                spanGaps: true,
                pointRadius: 4
              },

              {
                label: "Peak HR",

                data:
                  cardioWorkouts.map(
                    w =>
                      num(
                        w.cardio?.peakHR
                      ) || null
                  ),

                tension: 0.2,
                spanGaps: true,
                pointRadius: 4
              }
            ]
          },

          options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
              mode: "nearest",
              intersect: false
            },

            plugins: {
              legend: {
                display: true,
                position: "bottom"
              }
            },

            scales: {
              y: {
                beginAtZero: false,

                title: {
                  display: true,
                  text: "Heart Rate (bpm)"
                }
              },

              x: {
                title: {
                  display: true,
                  text: "Workout date"
                }
              }
            }
          }
        }
      );

    if (!cardioWorkouts.length) {
      const parent =
        cardioCanvas.parentElement;

      if (parent) {
        parent.insertAdjacentHTML(
          "beforeend",
          `
            <div class="message muted chart-empty-message">
              No cardio sessions with average heart rate recorded yet.
            </div>
          `
        );
      }
    }
  }


  /* =====================================================
     WORKOUT DURATION CHART
     ===================================================== */

  const durationCanvas =
    $("durationChart");

  if (durationCanvas) {

    charts.duration =
      new Chart(
        durationCanvas,
        {
          type: "bar",

          data: {
            labels:
              ws.map(w => w.date),

            datasets: [
              {
                label: "Cardio minutes",

                data:
                  ws.map(
                    w =>
                      num(
                        w.cardio?.minutes
                      ) || 0
                  )
              }
            ]
          },

          options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
              legend: {
                display: true
              }
            },

            scales: {
              y: {
                beginAtZero: true,

                title: {
                  display: true,
                  text: "Minutes"
                }
              },

              x: {
                title: {
                  display: true,
                  text: "Workout date"
                }
              }
            }
          }
        }
      );
  }


  console.log(
    "Strength chart exercises:",
    exerciseNames
  );

  console.log(
    "Workout history used by charts:",
    ws
  );
}


/* =========================================================
   BENCHMARKS
   ========================================================= */

function renderBenchmarks() {
  const container =
    $("benchmarkTable");

  if (!container) return;

  const workouts =
    [...(appData.workouts || [])]
      .sort((a, b) =>
        normalizeText(a.date).localeCompare(
          normalizeText(b.date)
        )
      );

  /*
   * Treadmill benchmark:
   * approximately 5 kph and 5% incline.
   */
  const treadmillSessions =
    workouts.filter(w => {
      const c =
        w.cardio || {};

      const type =
        normalizeKey(c.type);

      const isTreadmill =
        type === "treadmill";

      const speed =
        num(c.speed);

      const incline =
        num(c.incline);

      return (
        isTreadmill &&
        num(c.minutes) > 0 &&
        Math.abs(speed - 5) <= 0.3 &&
        Math.abs(incline - 5) <= 0.5
      );
    });

  if (!treadmillSessions.length) {
    container.innerHTML = `
      <div class="muted">
        No treadmill benchmark sessions recorded yet.
      </div>
    `;
    return;
  }

  const latest =
    treadmillSessions[
      treadmillSessions.length - 1
    ];

  const c =
    latest.cardio || {};

  container.innerHTML = `
    <div class="progress-box">

      <div class="highlight">
        Treadmill benchmark
      </div>

      <div class="grid">

        <div class="metric">
          <div class="metric-title">
            Date
          </div>
          <div class="metric-value">
            ${esc(latest.date)}
          </div>
        </div>

        <div class="metric">
          <div class="metric-title">
            Speed
          </div>
          <div class="metric-value">
            ${num(c.speed)} kph
          </div>
        </div>

        <div class="metric">
          <div class="metric-title">
            Incline
          </div>
          <div class="metric-value">
            ${num(c.incline)}%
          </div>
        </div>

        <div class="metric">
          <div class="metric-title">
            Average HR
          </div>
          <div class="metric-value">
            ${num(c.avgHR) || "—"}
          </div>
        </div>

        <div class="metric">
          <div class="metric-title">
            Duration
          </div>
          <div class="metric-value">
            ${num(c.minutes)} min
          </div>
        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {

  /* ---------------- AUTH ---------------- */

  $("signInBtn")?.addEventListener(
    "click",
    () => authenticate(false)
  );

  $("signUpBtn")?.addEventListener(
    "click",
    () => authenticate(true)
  );

  $("signOutBtn")?.addEventListener(
    "click",
    signOut
  );


  /* ---------------- NAVIGATION ---------------- */

  document
    .querySelectorAll("nav button[data-tab]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          showTab(
            button.dataset.tab
          );
        }
      );
    });


  /* ---------------- WORKOUT ---------------- */

  $("addExerciseBtn")?.addEventListener(
    "click",
    () => addExerciseRow()
  );

  $("loadPreviousBtn")?.addEventListener(
    "click",
    loadPreviousSession
  );

  $("loadRecommendedBtn")?.addEventListener(
    "click",
    loadRecommendedWorkout
  );

  $("workoutForm")?.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      saveWorkout();
    }
  );


  /* ---------------- EQUIPMENT ---------------- */

  $("addEquipmentBtn")?.addEventListener(
    "click",
    () => openEquipmentForm()
  );

  $("saveEquipmentBtn")?.addEventListener(
    "click",
    saveEquipment
  );

  $("cancelEquipmentBtn")?.addEventListener(
    "click",
    closeEquipmentForm
  );

  $("equipmentType")?.addEventListener(
    "change",
    updateEquipmentBenefitVisibility
  );


  /*
   * Strength / Cardio / All filter.
   */
  document
    .querySelectorAll(".equipment-filter")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".equipment-filter"
            )
            .forEach(
              b =>
                b.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          equipmentFilter =
            normalizeKey(
              button.dataset.filter ||
              "all"
            );

          renderEquipment();
        }
      );

    });
}


/* =========================================================
   SUPABASE AUTH STATE
   ========================================================= */

supabaseClient.auth.onAuthStateChange(
  async (_event, session) => {
    /*
     * Avoid running enterApp repeatedly for
     * token refresh events.
     */
    if (session?.user) {
      currentUser = session.user;

      if (
        $("appShell")?.hasAttribute("hidden")
      ) {
        await enterApp();
      }

    } else {
      currentUser = null;

      $("authScreen")?.removeAttribute(
        "hidden"
      );

      $("appShell")?.setAttribute(
        "hidden",
        ""
      );
    }
  }
);


/* =========================================================
   INITIALISE
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    setupEventListeners();

    /*
     * Check existing Supabase session.
     */
    try {
      const {
        data,
        error
      } =
        await supabaseClient.auth.getSession();

      if (error) {
        console.error(
          "Session error:",
          error
        );
        return;
      }

      if (data.session?.user) {
        currentUser =
          data.session.user;

        await enterApp();
      } else {
        $("authScreen")?.removeAttribute(
          "hidden"
        );

        $("appShell")?.setAttribute(
          "hidden",
          ""
        );
      }

    } catch (error) {
      console.error(
        "Initialisation error:",
        error
      );
    }
  }
);