const STORAGE_KEY = "myFitnessTracker_v1";

export function loadData() {

    try {

        const saved =
            localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return {
                workouts: []
            };
        }

        const data = JSON.parse(saved);

        if (
            !data ||
            !Array.isArray(data.workouts)
        ) {
            throw new Error("Invalid data");
        }

        return data;

    } catch (error) {

        console.error(
            "Could not load fitness data:",
            error
        );

        return {
            workouts: []
        };
    }
}


export function saveData(data) {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
    );

}


export function exportData(data) {

    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type: "application/json"
            }
        );

    downloadBlob(
        blob,
        "fitness-backup.json"
    );
}


export function exportCSV(data) {

    const rows = [

        [
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
        ]

    ];


    data.workouts.forEach(workout => {

        workout.exercises.forEach(exercise => {

            const cardio =
                workout.cardio || {};

            rows.push([

                workout.date,
                workout.session,
                exercise.name,
                exercise.weight,
                exercise.sets,
                exercise.reps,
                exercise.rpe,
                cardio.type || "",
                cardio.minutes || "",
                cardio.distance || "",
                cardio.speed || "",
                cardio.incline || "",
                cardio.avgHR || "",
                cardio.peakHR || "",
                cardio.rpe || "",
                cardio.recovery || ""

            ]);

        });

    });


    const csv =
        rows
            .map(row =>
                row
                    .map(value =>
                        `"${String(value ?? "")
                            .replaceAll('"', '""')}"`
                    )
                    .join(",")
            )
            .join("\n");


    const blob =
        new Blob(
            [csv],
            {
                type: "text/csv"
            }
        );


    downloadBlob(
        blob,
        "fitness-data.csv"
    );
}


function downloadBlob(blob, filename) {

    const link =
        document.createElement("a");

    link.href =
        URL.createObjectURL(blob);

    link.download =
        filename;

    link.click();

    setTimeout(() => {

        URL.revokeObjectURL(
            link.href
        );

    }, 1000);
}