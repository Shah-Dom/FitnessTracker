let appData = getLocalData();
let currentUser = null;
let charts = {};
let equipment = [];
let equipmentFilter = "all";
let editingEquipmentId = null;

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );

function localDate() {
  const d = new Date();
  return new Date(
    d.getTime() - d.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);
}

function setStatus(text, online = false) {
  $("syncStatus").textContent = text;
  $("syncStatus").classList.toggle("online", online);
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {

  $("workoutDate").value = localDate();

  document
    .querySelectorAll(".nav-btn")
    .forEach(b =>
      b.addEventListener("click", () =>
        showTab(b.dataset.tab)
      )
    );

  $("addExerciseBtn").onclick = () =>
    addExerciseRow();

  $("loadPreviousBtn").onclick =
    loadPreviousSession;

  $("loadRecommendedBtn").onclick =
    loadRecommendedWorkout;

  $("saveWorkoutBtn").onclick =
    saveWorkout;

  $("clearWorkoutBtn").onclick =
    clearWorkoutForm;


  /* Equipment */

  $("addEquipmentBtn").onclick =
    () => openEquipmentForm();

  $("saveEquipmentBtn").onclick =
    saveEquipment;

  $("cancelEquipmentBtn").onclick =
    closeEquipmentForm;

  $("equipmentType").onchange =
    updateEquipmentBenefitVisibility;

  document
    .querySelectorAll(".equipment-filter")
    .forEach(btn => {

      btn.onclick = () => {

        equipmentFilter =
          btn.dataset.filter;

        document
          .querySelectorAll(".equipment-filter")
          .forEach(b =>
            b.classList.remove("active")
          );

        btn.classList.add("active");

        renderEquipment();
      };

    });


  /* Data */

  $("exportJsonBtn").onclick = () =>
    downloadBlob(
      new Blob(
        [JSON.stringify(appData, null, 2)],
        { type: "application/json" }
      ),
      "fitness-backup.json"
    );

  $("exportCsvBtn").onclick =
    exportCSV;

  $("importFile").onchange =
    importJSON;

  $("deleteAllBtn").onclick =
    deleteAllCloudData;


  /* Authentication */

  $("signInBtn").onclick =
    () => authenticate(false);

  $("signUpBtn").onclick =
    () => authenticate(true);

  $("logoutBtn").onclick =
    () => supabaseClient.auth.signOut();


  /* Connection */

  window.addEventListener(
    "online",
    () =>
      syncFromCloud()
        .catch(() =>
          setStatus("Offline cache")
        )
  );

  window.addEventListener(
    "offline",
    () =>
      setStatus("Offline cache")
  );


  /* Auth state */

  supabaseClient.auth.onAuthStateChange(
    async (_event, session) => {

      if (session?.user) {

        currentUser = session.user;

        await enterApp();

      } else {

        currentUser = null;

        $("appShell").hidden = true;
        $("authScreen").hidden = false;

      }

    }
  );


  const { data } =
    await supabaseClient.auth.getSession();

  if (data.session) {

    currentUser = data.session.user;

    await enterApp();

  } else {

    $("authScreen").hidden = false;

  }
}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function authenticate(signup) {

  const email =
    $("authEmail").value.trim();

  const password =
    $("authPassword").value;

  $("authMessage").className =
    "message";

  $("authMessage").textContent = "";

  if (!email || password.length < 6) {

    $("authMessage").className =
      "message error";

    $("authMessage").textContent =
      "Enter an email and a password of at least 6 characters.";

    return;
  }

  const result =
    signup
      ? await supabaseClient.auth.signUp({
          email,
          password
        })
      : await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

  if (result.error) {

    $("authMessage").className =
      "message error";

    $("authMessage").textContent =
      result.error.message;

    return;
  }

  $("authMessage").className =
    "message success";

  $("authMessage").textContent =
    signup
      ? "Account created. Check your email if confirmation is required."
      : "Signed in.";
}


/* =========================================================
   ENTER APP
========================================================= */

async function enterApp() {

  $("authScreen").hidden = true;
  $("appShell").hidden = false;

  $("userEmail").textContent =
    currentUser.email || "";

  setStatus("Syncing…");

  try {

    const cloud =
      await loadCloudData();

    if (
      !cloud.workouts.length &&
      appData.workouts.length
    ) {

      const yes = confirm(
        "No cloud workouts were found. Import your existing local workouts into your new account?"
      );

      if (yes) {

        await replaceCloudData(
          appData,
          currentUser.id
        );

        setStatus(
          "Synced",
          true
        );

      } else {

        appData = cloud;

        setStatus(
          "Synced",
          true
        );

      }

    } else {

      appData = cloud;

      setStatus(
        "Synced",
        true
      );
    }

  } catch (e) {

    setStatus("Offline cache");

    console.error(e);
  }


  await loadEquipment();

  clearWorkoutForm();

  renderDashboard();
}


/* =========================================================
   TAB NAVIGATION
========================================================= */

function showTab(id) {

  document
    .querySelectorAll(".tab")
    .forEach(t =>
      t.classList.remove("active")
    );

  document
    .querySelectorAll(".nav-btn")
    .forEach(b =>
      b.classList.remove("active")
    );

  $(id).classList.add("active");

  const nav =
    document.querySelector(
      `[data-tab="${id}"]`
    );

  if (nav) {
    nav.classList.add("active");
  }


  if (id === "dashboard")
    renderDashboard();

  if (id === "history")
    renderHistory();

  if (id === "progress") {

    renderCharts();
    renderBenchmarkTable();

  }

  if (id === "equipment") {

    renderEquipment();

  }

  if (id === "workout") {

    populateCardioSelect();

  }
}


/* =========================================================
   EQUIPMENT — SUPABASE
========================================================= */

async function loadEquipment() {

  if (!navigator.onLine) {

    console.warn(
      "Offline: equipment cannot be refreshed from Supabase."
    );

    return;

  }

  const {
    data,
    error
  } =
    await supabaseClient
      .from("equipment")
      .select("*")
      .order("type")
      .order("name");

  if (error) {

    console.error(
      "Could not load equipment:",
      error
    );

    equipment = [];

    $("equipmentContent").innerHTML =
      `<p class="message error">
        Could not load equipment from Supabase.
        Check that the equipment table exists and RLS allows SELECT.
      </p>`;

    return;

  }

  equipment = data || [];

  populateCardioSelect();

  renderEquipment();
}


/* =========================================================
   EQUIPMENT — DROPDOWNS
========================================================= */

function getStrengthEquipment() {

  return equipment
    .filter(e => e.type === "strength")
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
}


function getCardioEquipment() {

  return equipment
    .filter(e => e.type === "cardio")
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
}


function buildEquipmentOptions(
  selected = ""
) {

  return getStrengthEquipment()
    .map(e =>
      `<option value="${esc(e.name)}"
        ${e.name === selected ? "selected" : ""}>
        ${esc(e.name)}
      </option>`
    )
    .join("");
}


function populateCardioSelect(
  selected = ""
) {

  const select =
    $("cardioType");

  if (!select) return;

  select.innerHTML =
    `<option value="">
      Select cardio equipment
    </option>` +
    getCardioEquipment()
      .map(e =>
        `<option value="${esc(e.name)}"
          ${e.name === selected ? "selected" : ""}>
          ${esc(e.name)}
        </option>`
      )
      .join("");
}


/* =========================================================
   EQUIPMENT — WORKOUT ROW
========================================================= */

function addExerciseRow(
  v = ["", "", "", "", ""]
) {

  const row =
    document.createElement("div");

  row.className =
    "exercise-row";

  row.innerHTML = `

    <div>
      <label>Exercise</label>

      <select class="exercise-name">

        <option value="">
          Select exercise
        </option>

        ${buildEquipmentOptions(v[0])}

      </select>
    </div>

    <div>
      <label>Weight kg</label>

      <input
        class="exercise-weight"
        type="number"
        step="0.5"
        value="${esc(v[1])}">
    </div>

    <div>
      <label>Sets</label>

      <input
        class="exercise-sets"
        type="number"
        value="${esc(v[2])}">
    </div>

    <div>
      <label>Reps</label>

      <input
        class="exercise-reps"
        type="number"
        value="${esc(v[3])}">
    </div>

    <div>
      <label>RPE</label>

      <input
        class="exercise-rpe"
        type="number"
        min="1"
        max="10"
        step="0.5"
        value="${esc(v[4])}">
    </div>

    <button
      class="btn remove-exercise"
      type="button">
      ×
    </button>
  `;

  row
    .querySelector(".remove-exercise")
    .onclick = () =>
      row.remove();

  $("exerciseRows")
    .appendChild(row);
}


/* =========================================================
   EQUIPMENT TAB — DISPLAY
========================================================= */

function renderEquipment() {

  const container =
    $("equipmentContent");

  if (!equipment.length) {

    container.innerHTML =
      `<p class="muted">
        No equipment found.
      </p>`;

    return;
  }


  let list = equipment;

  if (equipmentFilter !== "all") {

    list =
      equipment.filter(
        e =>
          e.type === equipmentFilter
      );

  }


  list =
    [...list].sort((a, b) =>
      a.name.localeCompare(b.name)
    );


  container.innerHTML = `

    <div style="overflow-x:auto">

      <table>

        <thead>

          <tr>

            <th>Equipment</th>

            <th>Type</th>

            <th>Primary Muscle</th>

            <th>Secondary Muscles</th>

            <th>Cardio Benefit</th>

            <th>Actions</th>

          </tr>

        </thead>

        <tbody>

          ${list.map(e => `

            <tr>

              <td>
                <strong>
                  ${esc(e.name)}
                </strong>
              </td>

              <td>
                <span class="badge ${
                  e.type === "cardio"
                    ? "badge-good"
                    : ""
                }">
                  ${esc(e.type)}
                </span>
              </td>

              <td>
                ${esc(
                  e.primary_muscles || "—"
                )}
              </td>

              <td>
                ${esc(
                  e.secondary_muscles || "—"
                )}
              </td>

              <td>
                ${e.type === "cardio"
                  ? esc(
                      e.cardio_benefit || "—"
                    )
                  : "—"}
              </td>

              <td>

                <button
                  class="btn edit-equipment"
                  data-id="${e.id}">
                  Edit
                </button>

                <button
                  class="btn-danger delete-equipment"
                  data-id="${e.id}">
                  Delete
                </button>

              </td>

            </tr>

          `).join("")}

        </tbody>

      </table>

    </div>
  `;


  container
    .querySelectorAll(".edit-equipment")
    .forEach(btn => {

      btn.onclick = () =>
        openEquipmentForm(
          Number(btn.dataset.id)
        );

    });


  container
    .querySelectorAll(".delete-equipment")
    .forEach(btn => {

      btn.onclick = () =>
        deleteEquipment(
          Number(btn.dataset.id)
        );

    });
}


/* =========================================================
   EQUIPMENT — FORM
========================================================= */

function openEquipmentForm(id = null) {

  editingEquipmentId = id;

  $("equipmentFormCard").hidden =
    false;


  if (id === null) {

    $("equipmentFormTitle").textContent =
      "Add Equipment";

    $("equipmentName").value = "";
    $("equipmentType").value =
      "strength";

    $("equipmentPrimary").value =
      "";

    $("equipmentSecondary").value =
      "";

    $("equipmentBenefit").value =
      "";

  } else {

    const item =
      equipment.find(
        e => Number(e.id) === id
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

  }

  updateEquipmentBenefitVisibility();

  $("equipmentFormCard")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
}


function closeEquipmentForm() {

  editingEquipmentId = null;

  $("equipmentFormCard").hidden =
    true;

}


function updateEquipmentBenefitVisibility() {

  const cardio =
    $("equipmentType").value ===
    "cardio";

  $("equipmentBenefitField").hidden =
    !cardio;

}


/* =========================================================
   EQUIPMENT — SAVE
========================================================= */

async function saveEquipment() {

  const name =
    $("equipmentName")
      .value
      .trim();

  const type =
    $("equipmentType").value;

  const primary =
    $("equipmentPrimary")
      .value
      .trim();

  const secondary =
    $("equipmentSecondary")
      .value
      .trim();

  const benefit =
    $("equipmentBenefit")
      .value
      .trim();


  if (!name) {

    alert(
      "Please enter an equipment name."
    );

    return;

  }


  const duplicate =
    equipment.find(
      e =>
        e.name.toLowerCase() ===
          name.toLowerCase() &&
        Number(e.id) !==
          Number(editingEquipmentId)
    );

  if (duplicate) {

    alert(
      "Equipment with this name already exists."
    );

    return;

  }


  const payload = {

    name,
    type,

    primary_muscles:
      primary || null,

    secondary_muscles:
      secondary || null,

    cardio_benefit:
      type === "cardio"
        ? benefit || null
        : null

  };


  setStatus("Saving…");


  try {

    let result;

    if (editingEquipmentId === null) {

      result =
        await supabaseClient
          .from("equipment")
          .insert(payload);

    } else {

      result =
        await supabaseClient
          .from("equipment")
          .update(payload)
          .eq(
            "id",
            editingEquipmentId
          );

    }


    if (result.error)
      throw result.error;


    await loadEquipment();

    closeEquipmentForm();

    setStatus(
      "Synced",
      true
    );

    alert(
      editingEquipmentId === null
        ? "Equipment added."
        : "Equipment updated."
    );

  } catch (e) {

    console.error(e);

    setStatus(
      "Sync error"
    );

    alert(
      "Could not save equipment.\n\n" +
      e.message
    );

  }
}


/* =========================================================
   EQUIPMENT — DELETE
========================================================= */

async function deleteEquipment(id) {

  const item =
    equipment.find(
      e => Number(e.id) === id
    );

  if (!item) return;


  const yes =
    confirm(
      `Delete "${item.name}" from your equipment list?\n\n` +
      `Existing workout history will not be deleted.`
    );

  if (!yes) return;


  try {

    const {
      error
    } =
      await supabaseClient
        .from("equipment")
        .delete()
        .eq("id", id);

    if (error)
      throw error;


    await loadEquipment();

    setStatus(
      "Synced",
      true
    );

  } catch (e) {

    console.error(e);

    alert(
      "Could not delete equipment.\n\n" +
      e.message
    );

  }
}


/* =========================================================
   PREVIOUS SESSION
========================================================= */

function getLastWorkout() {

  if (!appData.workouts.length)
    return null;

  return [...appData.workouts]
    .sort((a, b) => {

      const dateCompare =
        String(a.date).localeCompare(
          String(b.date)
        );

      if (dateCompare !== 0)
        return dateCompare;

      return (
        Number(a.id) -
        Number(b.id)
      );

    })
    .at(-1);
}


function loadPreviousSession() {

  const last =
    getLastWorkout();

  if (!last) {

    alert(
      "There is no previous workout to load."
    );

    return;

  }


  $("exerciseRows").innerHTML = "";


  /* Strength */

  (last.exercises || [])
    .forEach(e => {

      addExerciseRow([
        e.name || "",
        e.weight ?? "",
        e.sets ?? "",
        e.reps ?? "",
        e.rpe ?? ""
      ]);

    });


  /* Cardio */

  const c =
    last.cardio || {};


  populateCardioSelect(
    c.type || ""
  );


  $("cardioMinutes").value =
    c.minutes || "";

  $("cardioDistance").value =
    c.distance || "";

  $("cardioSpeed").value =
    c.speed || "";

  $("cardioIncline").value =
    c.incline || "";

  $("cardioAverageHR").value =
    c.avgHR || "";

  $("cardioPeakHR").value =
    c.peakHR || "";

  $("cardioRPE").value =
    c.rpe || "";

  $("cardioCalories").value =
    c.calories || "";

  $("hrRecovery").value =
    c.recovery || "";


  $("preWorkoutHR").value =
    "";

  $("workoutDate").value =
    localDate();

  $("sessionName").value =
    "Session " +
    (appData.workouts.length + 1);


  alert(
    `Previous workout loaded:\n\n${last.date} — ${last.session}\n\n` +
    `${last.exercises?.length || 0} strength exercises` +
    `${c.type ? `\nCardio: ${c.type}` : ""}`
  );
}


/* =========================================================
   RECOMMENDATION ENGINE
========================================================= */

function getAllExerciseRecords() {

  return appData.workouts.flatMap(
    w =>
      (w.exercises || []).map(
        e => ({
          ...e,
          date: w.date,
          session: w.session
        })
      )
  );

}


function getLastExercise(name) {

  const a =
    getAllExerciseRecords()
      .filter(
        x =>
          x.name &&
          x.name.toLowerCase() ===
            name.toLowerCase()
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date)
      );

  return a.at(-1) || null;
}


function getWeightStep(w) {

  if (w < 20)
    return 1;

  if (w < 40)
    return 2;

  if (w < 80)
    return 2;

  return 2.5;
}


function getRecommendedExercises() {

  return getStrengthEquipment()
    .map(def => {

      const name =
        def.name;

      const last =
        getLastExercise(name);


      /* No previous record */

      if (!last) {

        return [
          name,
          "",
          3,
          12,
          7
        ];

      }


      let weight =
        Number(last.weight) || 0;

      let reps =
        Number(last.reps) || 10;

      let sets =
        Number(last.sets) || 2;

      let rpe = 7;


      /*
        Progression rule:

        RPE >= 9:
        reduce weight

        RPE < 7 and completed 12 reps:
        increase weight

        otherwise:
        maintain weight
      */

      if (
        Number(last.rpe) >= 9
      ) {

        weight =
          Math.max(
            0,
            weight -
              getWeightStep(weight)
          );

      } else if (
        Number(last.rpe) < 7 &&
        reps >= 12
      ) {

        weight =
          weight +
          getWeightStep(weight);

      }


      reps =
        Math.min(
          reps,
          12
        );


      return [
        name,
        weight,
        sets,
        reps,
        rpe
      ];

    });

}


/* =========================================================
   LOAD RECOMMENDED WORKOUT
========================================================= */

function loadRecommendedWorkout() {

  const recommended =
    getRecommendedExercises();

  if (!recommended.length) {

    alert(
      "No strength equipment is currently available."
    );

    return;

  }


  $("exerciseRows").innerHTML = "";


  recommended.forEach(
    addExerciseRow
  );


  $("sessionName").value =
    "Session " +
    (appData.workouts.length + 1);

}


/* =========================================================
   CLEAR WORKOUT
========================================================= */

function clearWorkoutForm() {

  $("exerciseRows").innerHTML = "";


  /*
    Start with a sensible selection
    from the equipment catalogue.
  */

  const startingExercises =
    getStrengthEquipment()
      .slice(0, 6);


  startingExercises.forEach(
    e =>
      addExerciseRow([
        e.name,
        "",
        3,
        12,
        ""
      ])
  );


  $("sessionName").value =
    "Session " +
    (appData.workouts.length + 1);


  $("workoutDate").value =
    localDate();

  $("preWorkoutHR").value =
    "";


  populateCardioSelect();


  [
    "cardioMinutes",
    "cardioDistance",
    "cardioSpeed",
    "cardioIncline",
    "cardioAverageHR",
    "cardioPeakHR",
    "cardioRPE",
    "cardioCalories",
    "hrRecovery"
  ]
    .forEach(
      id =>
        $(id).value = ""
    );

}


/* =========================================================
   SAVE WORKOUT
========================================================= */

async function saveWorkout() {

  const exercises =
    [
      ...document.querySelectorAll(
        ".exercise-row"
      )
    ]
      .map(row => ({

        name:
          row.querySelector(
            ".exercise-name"
          ).value.trim(),

        weight:
          Number(
            row.querySelector(
              ".exercise-weight"
            ).value
          ) || 0,

        sets:
          Number(
            row.querySelector(
              ".exercise-sets"
            ).value
          ) || 0,

        reps:
          Number(
            row.querySelector(
              ".exercise-reps"
            ).value
          ) || 0,

        rpe:
          Number(
            row.querySelector(
              ".exercise-rpe"
            ).value
          ) || 0

      }))
      .filter(
        e => e.name
      );


  const cardio = {

    type:
      $("cardioType").value,

    minutes:
      Number(
        $("cardioMinutes").value
      ) || 0,

    distance:
      Number(
        $("cardioDistance").value
      ) || 0,

    speed:
      Number(
        $("cardioSpeed").value
      ) || 0,

    incline:
      Number(
        $("cardioIncline").value
      ) || 0,

    avgHR:
      Number(
        $("cardioAverageHR").value
      ) || 0,

    peakHR:
      Number(
        $("cardioPeakHR").value
      ) || 0,

    rpe:
      Number(
        $("cardioRPE").value
      ) || 0,

    calories:
      Number(
        $("cardioCalories").value
      ) || 0,

    recovery:
      Number(
        $("hrRecovery").value
      ) || 0

  };


  const workout = {

    id:
      "local-" +
      Date.now(),

    date:
      $("workoutDate").value,

    session:
      $("sessionName").value ||
      "Workout " +
      (appData.workouts.length + 1),

    preHR:
      Number(
        $("preWorkoutHR").value
      ) || 0,

    exercises,

    cardio

  };


  appData.workouts.push(
    workout
  );

  setLocalData(
    appData
  );


  try {

    await saveWorkoutToCloud(
      workout,
      currentUser.id
    );

    setStatus(
      "Synced",
      true
    );

    await syncFromCloud();

    alert(
      "Workout saved and synced."
    );

  } catch (e) {

    setStatus(
      "Saved offline"
    );

    alert(
      "Workout saved locally. Cloud sync will be retried when you are online."
    );

    console.error(e);

  }


  clearWorkoutForm();

  renderDashboard();

  showTab("dashboard");

}


/* =========================================================
   CLOUD SYNC
========================================================= */

async function syncFromCloud() {

  if (
    !currentUser ||
    !navigator.onLine
  )
    return;


  setStatus("Syncing…");


  try {

    appData =
      await loadCloudData();

    setStatus(
      "Synced",
      true
    );

    renderDashboard();

  } catch (e) {

    setStatus(
      "Offline cache"
    );

    throw e;

  }
}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  const ws =
    appData.workouts;

  const total =
    ws.reduce(
      (s, w) =>
        s +
        (w.cardio?.minutes || 0),
      0
    );

  const last =
    ws
      .filter(
        w =>
          w.cardio?.minutes > 0
      )
      .at(-1);


  $("dashboardMetrics").innerHTML = `

    <div class="metric">

      <div class="metric-title">
        Total Workouts
      </div>

      <div class="metric-value">
        ${ws.length}
      </div>

    </div>


    <div class="metric">

      <div class="metric-title">
        Cardio Minutes
      </div>

      <div class="metric-value">
        ${Math.round(total)}
      </div>

    </div>


    <div class="metric">

      <div class="metric-title">
        Last Avg HR
      </div>

      <div class="metric-value">
        ${last?.cardio?.avgHR || "—"}
      </div>

    </div>


    <div class="metric">

      <div class="metric-title">
        Last Cardio RPE
      </div>

      <div class="metric-value">
        ${last?.cardio?.rpe || "—"}
      </div>

    </div>

  `;


  renderCardioBenchmarkStatus();


  const recommended =
    getRecommendedExercises();


  $("nextWorkout").innerHTML =
    recommended.length

      ? recommended
          .map(
            e =>
              `<span class="badge ${
                e[4] >= 8
                  ? "badge-warning"
                  : "badge-good"
              }">
                <strong>
                  ${esc(e[0])}
                </strong>:
                ${e[1] || "—"} kg ×
                ${e[3]} ×
                ${e[2]}
                • target RPE ${e[4]}
              </span>`
          )
          .join("")

      : "<p>No strength equipment configured.</p>";


  const s =
    appData.workouts
      .slice(-5)
      .reverse();


  $("recentSessions").innerHTML =
    s.length

      ? s
          .map(
            w =>
              `<div class="progress-box">

                <strong>
                  ${esc(w.date)}
                </strong>
                —
                ${esc(w.session)}

                <br>

                <span class="small">

                  ${w.exercises.length}
                  strength exercises

                  ${
                    w.cardio?.minutes
                      ? ` •
                         ${esc(w.cardio.type)}
                         ${w.cardio.minutes}
                         min • HR
                         ${w.cardio.avgHR || "—"}`
                      : ""
                  }

                </span>

              </div>`
          )
          .join("")

      : "<p>No workouts recorded yet.</p>";

}


/* =========================================================
   CARDIO BENCHMARK
========================================================= */

function renderCardioBenchmarkStatus() {

  const s =
    appData.workouts.filter(
      w => {

        const c =
          w.cardio;

        return (
          c &&
          c.type === "Treadmill" &&
          Math.abs(c.speed - 5) < 0.11 &&
          Math.abs(c.incline - 5) < 0.6 &&
          c.avgHR > 0
        );

      }
    );


  if (!s.length) {

    $("cardioBenchmarkStatus").innerHTML =
      `<p class="muted">
        No standardized 5 kph / 5% treadmill
        sessions logged yet.
      </p>`;

    return;

  }


  const l =
    s.at(-1);

  const p =
    s.at(-2);

  const d =
    p
      ? l.cardio.avgHR -
        p.cardio.avgHR
      : 0;


  const msg =
    !p

      ? "First benchmark recorded."

      : d <= -2

        ? "HR is lower than the previous benchmark — encouraging sign."

        : d >= 2

          ? "HR is higher than the previous benchmark; consider fatigue and recovery before interpreting this."

          : "HR is broadly stable. Continue collecting standardized sessions.";


  $("cardioBenchmarkStatus").innerHTML =
    `<div class="progress-box">

      <strong>
        Latest benchmark:
        ${l.cardio.avgHR} bpm
      </strong>

      <p>${msg}</p>

    </div>`;

}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

  const ws =
    [...appData.workouts]
      .reverse();


  $("historyContent").innerHTML =
    ws.length

      ? `<table>

          <thead>

            <tr>

              <th>Date</th>
              <th>Session</th>
              <th>Strength</th>
              <th>Cardio</th>
              <th></th>

            </tr>

          </thead>

          <tbody>

            ${ws
              .map(
                (w, ri) => {

                  const i =
                    appData.workouts.length -
                    1 -
                    ri;

                  return `

                    <tr>

                      <td>
                        ${esc(w.date)}
                      </td>

                      <td>
                        ${esc(w.session)}
                      </td>

                      <td>

                        ${w.exercises
                          .map(
                            e =>
                              `${esc(e.name)}:
                               ${e.weight} kg ×
                               ${e.reps} ×
                               ${e.sets},
                               RPE ${e.rpe}`
                          )
                          .join("<br>")}

                      </td>

                      <td>

                        ${
                          w.cardio?.minutes

                            ? `${esc(w.cardio.type)}
                               <br>
                               ${w.cardio.minutes} min
                               <br>
                               HR:
                               ${w.cardio.avgHR || "—"}
                               <br>
                               RPE:
                               ${w.cardio.rpe || "—"}`

                            : "—"
                        }

                      </td>

                      <td>

                        <button
                          class="btn-danger delete-one"
                          data-index="${i}">
                          Delete
                        </button>

                      </td>

                    </tr>

                  `;

                }
              )
              .join("")}

          </tbody>

        </table>`

      : "<p>No workouts recorded.</p>";


  document
    .querySelectorAll(".delete-one")
    .forEach(
      b =>
        b.onclick = () =>
          deleteWorkout(
            Number(
              b.dataset.index
            )
          )
    );

}


/* =========================================================
   DELETE WORKOUT
========================================================= */

async function deleteWorkout(i) {

  if (
    !confirm(
      "Delete this workout from the cloud?"
    )
  )
    return;


  const local =
    appData.workouts[i];


  try {

    if (
      String(local.id)
        .startsWith("local-")
    ) {

      appData.workouts.splice(
        i,
        1
      );

    } else {

      const {
        error
      } =
        await supabaseClient
          .from("workouts")
          .delete()
          .eq(
            "id",
            local.id
          );

      if (error)
        throw error;

      appData.workouts.splice(
        i,
        1
      );

    }


    setLocalData(
      appData
    );

    renderHistory();

    renderDashboard();

    setStatus(
      "Synced",
      true
    );

  } catch (e) {

    alert(
      "Could not delete the workout."
    );

    console.error(e);

  }

}


/* =========================================================
   CHARTS
========================================================= */

function renderCharts() {

  Object
    .values(charts)
    .forEach(
      c => c?.destroy()
    );


  const ws =
    [...appData.workouts]
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );


  const names =
    getStrengthEquipment()
      .slice(0, 10)
      .map(e => e.name);


  charts.strength =
    new Chart(
      $("strengthChart"),
      {

        type: "line",

        data: {

          labels:
            ws.map(
              w => w.date
            ),

          datasets:
            names.map(
              n => ({

                label: n,

                data:
                  ws.map(
                    w => {

                      const e =
                        w.exercises
                          ?.find(
                            e =>
                              e.name === n
                          );

                      return e
                        ? e.weight
                        : null;

                    }
                  )

              })
            )

        },

        options: {

          responsive: true,

          maintainAspectRatio:
            false

        }

      }
    );


  const cw =
    ws.filter(
      w =>
        w.cardio?.minutes > 0 &&
        w.cardio?.avgHR > 0
    );


  charts.cardio =
    new Chart(
      $("cardioChart"),
      {

        type: "scatter",

        data: {

          datasets: [{

            label:
              "Cardio HR",

            data:
              cw.map(
                w => {

                  const c =
                    w.cardio;

                  return {

                    x:
                      c.type === "Treadmill"

                        ? c.speed *
                          (
                            1 +
                            c.incline /
                            100
                          )

                        : (
                            c.speed ||
                            c.minutes
                          ),

                    y:
                      c.avgHR

                  };

                }
              )

          }]

        },

        options: {

          responsive: true,

          maintainAspectRatio:
            false,

          scales: {

            x: {

              title: {

                display: true,

                text:
                  "Workload index"

              }

            },

            y: {

              title: {

                display: true,

                text:
                  "Average HR (bpm)"

              }

            }

          }

        }

      }
    );


  charts.duration =
    new Chart(
      $("durationChart"),
      {

        type: "line",

        data: {

          labels:
            cw.map(
              w => w.date
            ),

          datasets: [{

            label:
              "Cardio minutes",

            data:
              cw.map(
                w =>
                  w.cardio.minutes
              )

          }]

        },

        options: {

          responsive: true,

          maintainAspectRatio:
            false

        }

      }
    );

}


/* =========================================================
   BENCHMARK TABLE
========================================================= */

function renderBenchmarkTable() {

  const s =
    appData.workouts.filter(
      w => {

        const c =
          w.cardio;

        return (
          c &&
          c.type === "Treadmill" &&
          Math.abs(c.speed - 5) < 0.11 &&
          Math.abs(c.incline - 5) < 0.6 &&
          c.avgHR > 0
        );

      }
    );


  $("benchmarkTable").innerHTML =
    s.length

      ? `<table>

          <thead>

            <tr>

              <th>Date</th>
              <th>Duration</th>
              <th>Avg HR</th>
              <th>Peak HR</th>
              <th>RPE</th>

            </tr>

          </thead>

          <tbody>

            ${s
              .map(
                w =>
                  `<tr>

                    <td>
                      ${esc(w.date)}
                    </td>

                    <td>
                      ${w.cardio.minutes} min
                    </td>

                    <td>
                      ${w.cardio.avgHR}
                    </td>

                    <td>
                      ${w.cardio.peakHR || "—"}
                    </td>

                    <td>
                      ${w.cardio.rpe || "—"}
                    </td>

                  </tr>`
              )
              .join("")}

          </tbody>

        </table>`

      : "<p>No standardized benchmark sessions yet.";

}


/* =========================================================
   CSV EXPORT
========================================================= */

function exportCSV() {

  const rows = [[

    "date",
    "session",
    "exercise",
    "weight_kg",
    "sets",
    "reps",
    "rpe",
    "cardio_type",
    "cardio_minutes",
    "distance_km",
    "speed_kph",
    "incline",
    "avg_hr",
    "peak_hr",
    "cardio_rpe",
    "hr_recovery"

  ]];


  appData.workouts
    .forEach(
      w =>
        w.exercises
          .forEach(
            e =>
              rows.push([

                w.date,
                w.session,
                e.name,
                e.weight,
                e.sets,
                e.reps,
                e.rpe,

                w.cardio?.type || "",
                w.cardio?.minutes || "",
                w.cardio?.distance || "",
                w.cardio?.speed || "",
                w.cardio?.incline || "",
                w.cardio?.avgHR || "",
                w.cardio?.peakHR || "",
                w.cardio?.rpe || "",
                w.cardio?.recovery || ""

              ])
          )
    );


  downloadBlob(

    new Blob(

      [
        rows
          .map(
            r =>
              r
                .map(
                  v =>
                    `"${String(v ?? "")
                      .replaceAll(
                        '"',
                        '""'
                      )}"`
                )
                .join(",")
          )
          .join("\n")
      ],

      {
        type:
          "text/csv"
      }

    ),

    "fitness-data.csv"

  );

}


/* =========================================================
   DOWNLOAD
========================================================= */

function downloadBlob(
  blob,
  name
) {

  const a =
    document.createElement("a");

  a.href =
    URL.createObjectURL(blob);

  a.download =
    name;

  a.click();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        a.href
      ),
    1000
  );

}


/* =========================================================
   IMPORT
========================================================= */

function importJSON(e) {

  const f =
    e.target.files[0];

  if (!f)
    return;


  const r =
    new FileReader();


  r.onload =
    async () => {

      try {

        const x =
          JSON.parse(
            r.result
          );


        if (
          !Array.isArray(
            x.workouts
          )
        )
          throw 0;


        if (
          !confirm(
            "Import this backup into your account? Existing cloud data will be replaced."
          )
        )
          return;


        appData =
          x;


        setLocalData(
          appData
        );


        await replaceCloudData(
          appData,
          currentUser.id
        );


        setStatus(
          "Synced",
          true
        );


        renderDashboard();


        alert(
          "Backup imported and synced."
        );


      } catch (err) {

        alert(
          "Import failed."
        );

        console.error(
          err
        );

      } finally {

        e.target.value =
          "";

      }

    };


  r.readAsText(f);

}


/* =========================================================
   DELETE ALL
========================================================= */

async function deleteAllCloudData() {

  if (
    !confirm(
      "DELETE ALL your cloud workout data? Export a backup first if needed."
    )
  )
    return;


  try {

    await replaceCloudData(
      {
        workouts: []
      },
      currentUser.id
    );


    appData = {
      workouts: []
    };


    setLocalData(
      appData
    );


    renderDashboard();


    alert(
      "All workout data deleted."
    );


  } catch (e) {

    alert(
      "Could not delete all data."
    );

    console.error(e);

  }

}


/* =========================================================
   START
========================================================= */

init();