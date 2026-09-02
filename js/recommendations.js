export const defaultExercises = [

    ["Leg Press", "", 3, 12, ""],

    ["Lat Pulldown", "", 3, 12, ""],

    ["Chest Press", "", 3, 12, ""],

    ["Seated Leg Curl", "", 3, 12, ""],

    ["Seated Row", "", 3, 12, ""],

    ["Shoulder Press", "", 2, 10, ""],

    ["Leg Extension", "", 2, 15, ""],

    ["Calf Extension", "", 2, 15, ""],

    ["Biceps Curl", "", 2, 12, ""]

];


const exerciseNames = [

    "Leg Press",
    "Lat Pulldown",
    "Chest Press",
    "Seated Leg Curl",
    "Seated Row",
    "Shoulder Press",
    "Leg Extension",
    "Calf Extension",
    "Biceps Curl"

];


function getWeightStep(weight) {

    if (weight < 20) return 1;

    if (weight < 40) return 2;

    if (weight < 80) return 2;

    return 2.5;
}


function getLastExercise(workouts, name) {

    const records =
        workouts
            .flatMap(workout =>

                workout.exercises.map(exercise => ({

                    ...exercise,

                    date: workout.date

                }))

            )
            .filter(record =>
                record.name.toLowerCase() ===
                name.toLowerCase()
            )
            .sort(
                (a, b) =>
                    a.date.localeCompare(b.date)
            );


    return records.length
        ? records[records.length - 1]
        : null;
}


export function getRecommendedExercises(workouts) {

    return exerciseNames.map(name => {

        const last =
            getLastExercise(
                workouts,
                name
            );


        if (!last) {

            const defaults =
                defaultExercises.find(
                    exercise =>
                        exercise[0] === name
                );

            return defaults ||
                [name, "", 3, 12, 7];
        }


        let weight = last.weight;
        let sets = last.sets || 2;
        let reps = last.reps || 10;

        let targetRPE = 7;


        if (last.rpe >= 9) {

            weight =
                Math.max(
                    0,
                    last.weight -
                    getWeightStep(last.weight)
                );

            reps =
                Math.min(
                    last.reps,
                    12
                );

            targetRPE = 7;

        }

        else if (last.rpe >= 8) {

            weight = last.weight;

            reps =
                Math.min(
                    last.reps,
                    12
                );

            targetRPE = 7.5;

        }

        else if (
            last.rpe <= 6 &&
            last.reps >= 12
        ) {

            weight =
                last.weight +
                getWeightStep(last.weight);

            reps =
                last.reps >= 15
                    ? 12
                    : last.reps;

            targetRPE = 7;

        }

        else {

            weight = last.weight;
            reps = last.reps;
            targetRPE = 7;

        }


        return [
            name,
            weight,
            sets,
            reps,
            targetRPE
        ];

    });
}