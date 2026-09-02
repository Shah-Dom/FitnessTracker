import {
    loadData,
    saveData,
    exportData,
    exportCSV
} from "./storage.js";

import {
    initializeWorkout,
    addExerciseRow,
    loadRecommendedWorkout,
    saveWorkout,
    clearWorkoutForm
} from "./workout.js";

import {
    renderCharts
} from "./charts.js";

import {
    getRecommendedExercises
} from "./recommendations.js";


let appData = loadData();


/* =========================================================
   SERVICE WORKER
========================================================= */

if ("serviceWorker" in navigator) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register("./sw.js")
                .catch(error =>
                    console.error(
                        "Service worker registration failed:",
                        error
                    )
                );

        }
    );

}


/* =========================================================
   NAVIGATION
========================================================= */

document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

        button.addEventListener(
            "click",
            () =>
                showTab(
                    button.dataset.tab
                )
        );

    });


function showTab(tabID) {

    document
        .querySelectorAll(".tab")
        .forEach(tab =>
            tab.classList.remove("active")
        );


    document
        .querySelectorAll(".nav-btn")
        .forEach(button =>
            button.classList.remove("active")
        );


    document
        .getElementById(tabID)
        .classList.add("active");


    document
        .querySelector(
            `[data-tab="${tabID}"]`
        )
        .classList.add("active");


    if (tabID === "dashboard") {
        renderDashboard();
    }

    if (tabID === "history") {
        renderHistory();
    }

    if (tabID === "progress") {
        renderCharts(appData);
        renderBenchmarkTable();
    }
}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

    const workouts =
        appData.workouts;


    const totalCardio =
        workouts.reduce(
            (sum, workout) =>
                sum +
                (
                    workout.cardio?.minutes ||
                    0
                ),
            0
        );


    const lastCardio =
        workouts
            .filter(
                workout =>
                    workout.cardio &&
                    workout.cardio.minutes > 0
            )
            .slice(-1)[0];


    document.getElementById(
        "dashboardMetrics"
    ).innerHTML = `

        <div class="metric">

            <div class="metric-title">
                Total Workouts
            </div>

            <div class="metric-value">
                ${workouts.length}
            </div>

        </div>


        <div class="metric">

            <div class="metric-title">
                Cardio Minutes
            </div>

            <div class="metric-value">
                ${Math.round(totalCardio)}
            </div>

        </div>


        <div class="metric">

            <div class="metric-title">
                Last Avg HR
            </div>

            <div class="metric-value">
                ${lastCardio?.cardio?.avgHR || "—"}
            </div>

        </div>


        <div class="metric">

            <div class="metric-title">
                Last Cardio RPE
            </div>

            <div class="metric-value">
                ${lastCardio?.cardio?.rpe || "—"}
            </div>

        </div>

    `;


    renderCardioBenchmarkStatus();

    renderNextWorkout();

    renderRecentSessions();
}


/* =========================================================
   BENCHMARK
========================================================= */

function getStandardTreadmillSessions() {

    return appData.workouts.filter(
        workout => {

            const c =
                workout.cardio;

            if (!c) return false;


            return (

                c.type === "Treadmill" &&

                Math.abs(
                    c.speed - 5
                ) < 0.11 &&

                Math.abs(
                    c.incline - 5
                ) < 0.6 &&

                c.avgHR > 0

            );

        }
    );
}


function renderCardioBenchmarkStatus() {

    const sessions =
        getStandardTreadmillSessions();


    const element =
        document.getElementById(
            "cardioBenchmarkStatus"
        );


    if (!sessions.length) {

        element.innerHTML = `

            <p class="muted">
                No standardized 5 kph / 5% treadmill
                sessions have been logged yet.
            </p>

        `;

        return;
    }


    const latest =
        sessions[sessions.length - 1];


    const previous =
        sessions.length > 1
            ? sessions[sessions.length - 2]
            : null;


    let message = "";


    if (previous) {

        const difference =
            latest.cardio.avgHR -
            previous.cardio.avgHR;


        if (difference <= -2) {

            message =
                "📈 HR is lower than your previous benchmark — encouraging sign.";

        }

        else if (difference >= 2) {

            message =
                "HR is higher than the previous benchmark. Check fatigue, sleep, heat and recovery before interpreting this as a fitness change.";

        }

        else {

            message =
                "HR is broadly stable. Continue collecting standardized sessions.";

        }

    }


    element.innerHTML = `

        <div class="progress-box">

            <strong>
                Latest benchmark:
                ${latest.cardio.avgHR} bpm
            </strong>

            <p>
                ${message}
            </p>

        </div>

    `;
}


/* =========================================================
   NEXT WORKOUT
========================================================= */

function renderNextWorkout() {

    const recommendations =
        getRecommendedExercises(
            appData.workouts
        );


    document.getElementById(
        "nextWorkout"
    ).innerHTML =
        recommendations.map(
            exercise => {

                const [
                    name,
                    weight,
                    sets,
                    reps,
                    rpe
                ] = exercise;


                return `

                    <span class="badge badge-good">

                        <strong>${name}</strong>:

                        ${weight || "—"} kg ×

                        ${reps} ×

                        ${sets}

                        • target RPE ${rpe}

                    </span>

                `;

            }
        ).join("");
}


/* =========================================================
   RECENT SESSIONS
========================================================= */

function renderRecentSessions() {

    const sessions =
        appData.workouts
            .slice(-5)
            .reverse();


    const element =
        document.getElementById(
            "recentSessions"
        );


    if (!sessions.length) {

        element.innerHTML =
            "<p>No workouts recorded yet.</p>";

        return;
    }


    element.innerHTML =
        sessions
            .map(workout => {

                const c =
                    workout.cardio;


                return `

                    <div class="progress-box">

                        <strong>
                            ${workout.date}
                        </strong>

                        —
                        ${workout.session}

                        <br>

                        <span class="small">

                            ${workout.exercises.length}
                            strength exercises

                            ${
                                c?.minutes
                                ? ` • ${c.type}
                                   ${c.minutes} min
                                   • HR ${c.avgHR || "—"}`
                                : ""
                            }

                        </span>

                    </div>

                `;

            })
            .join("");
}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

    const workouts =
        [...appData.workouts]
            .reverse();


    const element =
        document.getElementById(
            "historyContent"
        );


    if (!workouts.length) {

        element.innerHTML =
            "<p>No workouts recorded.</p>";

        return;
    }


    element.innerHTML = `

        <table>

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

                ${workouts.map(
                    workout => {

                        return `

                            <tr>

                                <td>
                                    ${workout.date}
                                </td>

                                <td>
                                    ${workout.session}
                                </td>

                                <td>

                                    ${workout.exercises
                                        .map(
                                            e =>
                                                `${e.name}:
                                                ${e.weight} kg ×
                                                ${e.reps} ×
                                                ${e.sets},
                                                RPE ${e.rpe}`
                                        )
                                        .join("<br>")
                                    }

                                </td>

                                <td>

                                    ${
                                        workout.cardio?.minutes

                                        ?

                                        `${workout.cardio.type}
                                        <br>
                                        ${workout.cardio.minutes} min
                                        <br>
                                        HR:
                                        ${workout.cardio.avgHR || "—"}
                                        <br>
                                        RPE:
                                        ${workout.cardio.rpe || "—"}`

                                        :

                                        "—"
                                    }

                                </td>

                                <td>

                                    <button
                                        class="btn-danger delete-workout"
                                        data-id="${workout.id}"
                                    >
                                        Delete
                                    </button>

                                </td>

                            </tr>

                        `;

                    }
                ).join("")}

            </tbody>

        </table>

    `;


    document
        .querySelectorAll(".delete-workout")
        .forEach(button => {

            button.addEventListener(
                "click",
                () =>
                    deleteWorkout(
                        Number(
                            button.dataset.id
                        )
                    )
            );

        });
}


/* =========================================================
   DELETE WORKOUT
========================================================= */

function deleteWorkout(id) {

    if (
        !confirm(
            "Delete this workout?"
        )
    ) return;


    appData.workouts =
        appData.workouts.filter(
            workout =>
                workout.id !== id
        );


    saveData(appData);

    renderHistory();

    renderDashboard();
}


/* =========================================================
   BENCHMARK TABLE
========================================================= */

function renderBenchmarkTable() {

    const sessions =
        getStandardTreadmillSessions();


    const element =
        document.getElementById(
            "benchmarkTable"
        );


    if (!sessions.length) {

        element.innerHTML =
            "<p>No standardized benchmark sessions yet.</p>";

        return;
    }


    element.innerHTML = `

        <table>

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

                ${sessions.map(workout => {

                    const c =
                        workout.cardio;

                    return `

                        <tr>

                            <td>
                                ${workout.date}
                            </td>

                            <td>
                                ${c.minutes} min
                            </td>

                            <td>
                                ${c.avgHR}
                            </td>

                            <td>
                                ${c.peakHR || "—"}
                            </td>

                            <td>
                                ${c.rpe || "—"}
                            </td>

                        </tr>

                    `;

                }).join("")}

            </tbody>

        </table>

    `;
}


/* =========================================================
   BUTTON EVENTS
========================================================= */

document
    .getElementById("addExerciseBtn")
    .addEventListener(
        "click",
        () => addExerciseRow()
    );


document
    .getElementById("recommendedWorkoutBtn")
    .addEventListener(
        "click",
        () =>
            loadRecommendedWorkout(
                appData
            )
    );


document
    .getElementById("saveWorkoutBtn")
    .addEventListener(
        "click",
        () => {

            saveWorkout(appData);

            renderDashboard();

        }
    );


document
    .getElementById("clearWorkoutBtn")
    .addEventListener(
        "click",
        () =>
            clearWorkoutForm(
                appData
            )
    );


document
    .getElementById("exportJSONBtn")
    .addEventListener(
        "click",
        () =>
            exportData(appData)
    );


document
    .getElementById("exportCSVBtn")
    .addEventListener(
        "click",
        () =>
            exportCSV(appData)
    );


document
    .getElementById("importFile")
    .addEventListener(
        "change",
        event => {

            const file =
                event.target.files[0];

            if (!file) return;


            const reader =
                new FileReader();


            reader.onload =
                () => {

                    try {

                        const imported =
                            JSON.parse(
                                reader.result
                            );


                        if (
                            !imported.workouts ||
                            !Array.isArray(
                                imported.workouts
                            )
                        ) {

                            throw new Error(
                                "Invalid backup"
                            );

                        }


                        if (
                            !confirm(
                                "Import this backup and replace your current data?"
                            )
                        ) return;


                        appData =
                            imported;

                        saveData(appData);

                        renderDashboard();

                        alert(
                            "Data imported successfully."
                        );

                    }

                    catch {

                        alert(
                            "Invalid fitness backup file."
                        );

                    }

                };


            reader.readAsText(file);

        }
    );


document
    .getElementById("deleteAllDataBtn")
    .addEventListener(
        "click",
        () => {

            if (
                !confirm(
                    "DELETE ALL workout data? This cannot be undone unless you have an exported backup."
                )
            ) return;


            appData = {
                workouts: []
            };


            saveData(appData);

            location.reload();

        }
    );


/* =========================================================
   INITIALIZE
========================================================= */

initializeWorkout(appData);

renderDashboard();