let charts = {};


export function renderCharts(data) {

    Object.values(charts).forEach(chart => {

        if (chart) {
            chart.destroy();
        }

    });


    const workouts =
        [...data.workouts]
            .sort(
                (a, b) =>
                    a.date.localeCompare(b.date)
            );


    const strengthExercises = [

        "Leg Press",
        "Chest Press",
        "Lat Pulldown",
        "Seated Row",
        "Seated Leg Curl",
        "Shoulder Press"

    ];


    const labels =
        workouts.map(
            workout => workout.date
        );


    const datasets =
        strengthExercises.map(name => ({

            label: name,

            data:
                workouts.map(workout => {

                    const exercise =
                        workout.exercises.find(
                            e =>
                                e.name === name
                        );

                    return exercise
                        ? exercise.weight
                        : null;

                })

        }));


    charts.strength =
        new Chart(

            document.getElementById(
                "strengthChart"
            ),

            {

                type: "line",

                data: {
                    labels,
                    datasets
                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    scales: {

                        y: {

                            title: {

                                display: true,

                                text: "Weight (kg)"

                            }

                        }

                    }

                }

            }

        );


    const cardioWorkouts =
        workouts.filter(
            workout =>
                workout.cardio &&
                workout.cardio.minutes > 0 &&
                workout.cardio.avgHR > 0
        );


    charts.cardio =
        new Chart(

            document.getElementById(
                "cardioChart"
            ),

            {

                type: "scatter",

                data: {

                    datasets: [

                        {

                            label:
                                "Cardio HR",

                            data:
                                cardioWorkouts.map(
                                    workout => {

                                        const c =
                                            workout.cardio;

                                        let workload = 0;


                                        if (
                                            c.type ===
                                            "Treadmill"
                                        ) {

                                            workload =
                                                c.speed *
                                                (
                                                    1 +
                                                    c.incline /
                                                    100
                                                );

                                        }

                                        else {

                                            workload =
                                                c.speed ||
                                                c.minutes;

                                        }


                                        return {

                                            x: workload,
                                            y: c.avgHR

                                        };

                                    }
                                )

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

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

            document.getElementById(
                "durationChart"
            ),

            {

                type: "line",

                data: {

                    labels:
                        cardioWorkouts.map(
                            workout =>
                                workout.date
                        ),

                    datasets: [

                        {

                            label:
                                "Cardio minutes",

                            data:
                                cardioWorkouts.map(
                                    workout =>
                                        workout.cardio.minutes
                                )

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false

                }

            }

        );
}