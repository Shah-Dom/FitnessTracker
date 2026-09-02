import {
    saveData
} from "./storage.js";

import {
    defaultExercises,
    getRecommendedExercises
} from "./recommendations.js";


export function initializeWorkout(data) {

    document.getElementById(
        "workoutDate"
    ).value =
        new Date()
            .toISOString()
            .slice(0, 10);


    clearWorkoutForm(data);
}


export function addExerciseRow(
    values = ["", "", "", "", ""]
) {

    const row =
        document.createElement("div");

    row.className =
        "exercise-row";


    row.innerHTML = `

        <div>

            <label>Exercise</label>

            <input
                class="exercise-name"
                value="${values[0] || ""}"
            >

        </div>


        <div>

            <label>Weight kg</label>

            <input
                class="exercise-weight"
                type="number"
                step="0.5"
                value="${values[1] || ""}"
            >

        </div>


        <div>

            <label>Sets</label>

            <input
                class="exercise-sets"
                type="number"
                value="${values[2] || ""}"
            >

        </div>


        <div>

            <label>Reps</label>

            <input
                class="exercise-reps"
                type="number"
                value="${values[3] || ""}"
            >

        </div>


        <div>

            <label>RPE</label>

            <input
                class="exercise-rpe"
                type="number"
                min="1"
                max="10"
                step="0.5"
                value="${values[4] || ""}"
            >

        </div>


        <button class="btn remove-exercise">
            ×
        </button>

    `;


    row
        .querySelector(".remove-exercise")
        .addEventListener(
            "click",
            () => row.remove()
        );


    document
        .getElementById("exerciseRows")
        .appendChild(row);
}


export function loadRecommendedWorkout(data) {

    const container =
        document.getElementById(
            "exerciseRows"
        );

    container.innerHTML = "";


    const recommendations =
        getRecommendedExercises(
            data.workouts
        );


    recommendations.forEach(
        exercise =>
            addExerciseRow(exercise)
    );


    document.getElementById(
        "sessionName"
    ).value =
        "Session " +
        (data.workouts.length + 1);
}


export function saveWorkout(data) {

    const rows =
        [
            ...document.querySelectorAll(
                ".exercise-row"
            )
        ];


    const exercises =
        rows
            .map(row => ({

                name:
                    row
                        .querySelector(
                            ".exercise-name"
                        )
                        .value
                        .trim(),

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
                exercise =>
                    exercise.name
            );


    const cardio = {

        type:
            document.getElementById(
                "cardioType"
            ).value,

        minutes:
            Number(
                document.getElementById(
                    "cardioMinutes"
                ).value
            ) || 0,

        distance:
            Number(
                document.getElementById(
                    "cardioDistance"
                ).value
            ) || 0,

        speed:
            Number(
                document.getElementById(
                    "cardioSpeed"
                ).value
            ) || 0,

        incline:
            Number(
                document.getElementById(
                    "cardioIncline"
                ).value
            ) || 0,

        avgHR:
            Number(
                document.getElementById(
                    "cardioAverageHR"
                ).value
            ) || 0,

        peakHR:
            Number(
                document.getElementById(
                    "cardioPeakHR"
                ).value
            ) || 0,

        rpe:
            Number(
                document.getElementById(
                    "cardioRPE"
                ).value
            ) || 0,

        calories:
            Number(
                document.getElementById(
                    "cardioCalories"
                ).value
            ) || 0,

        recovery:
            Number(
                document.getElementById(
                    "hrRecovery"
                ).value
            ) || 0

    };


    const workout = {

        id: Date.now(),

        date:
            document.getElementById(
                "workoutDate"
            ).value,

        session:
            document.getElementById(
                "sessionName"
            ).value ||
            "Workout " +
            (data.workouts.length + 1),

        preHR:
            Number(
                document.getElementById(
                    "preWorkoutHR"
                ).value
            ) || 0,

        exercises,

        cardio

    };


    data.workouts.push(workout);

    saveData(data);

    alert("Workout saved.");

    clearWorkoutForm(data);

    return true;
}


export function clearWorkoutForm(data) {

    document.getElementById(
        "exerciseRows"
    ).innerHTML = "";


    defaultExercises
        .slice(0, 6)
        .forEach(
            exercise =>
                addExerciseRow(exercise)
        );


    document.getElementById(
        "sessionName"
    ).value =
        "Session " +
        (data.workouts.length + 1);


    document.getElementById(
        "preWorkoutHR"
    ).value = "";


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
    ].forEach(id => {

        document.getElementById(id).value = "";

    });
}