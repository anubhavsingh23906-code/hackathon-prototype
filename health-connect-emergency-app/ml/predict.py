import joblib
import pandas as pd

# Load trained model
model = joblib.load("model/hospital_model.pkl")


def recommend_hospitals(hospitals):
    """
    hospitals should be a list of dictionaries containing:
    distance_km, beds, icu_beds, trauma,
    emergency_match, priority
    """

    df = pd.DataFrame(hospitals)

    features = [
        "distance_km",
        "beds",
        "icu_beds",
        "trauma",
        "emergency_match",
        "priority"
    ]

    # Get probability that hospital is suitable
    df["suitability_score"] = model.predict_proba(df[features])[:, 1]

    # Highest score first
    df = df.sort_values(
        by="suitability_score",
        ascending=False
    )

    return df


# Test data
hospitals = [
    {
        "name": "Hospital A",
        "distance_km": 2.1,
        "beds": 15,
        "icu_beds": 4,
        "trauma": 1,
        "emergency_match": 1,
        "priority": 3
    },
    {
        "name": "Hospital B",
        "distance_km": 4.5,
        "beds": 5,
        "icu_beds": 1,
        "trauma": 0,
        "emergency_match": 1,
        "priority": 3
    },
    {
        "name": "Hospital C",
        "distance_km": 3.2,
        "beds": 25,
        "icu_beds": 6,
        "trauma": 1,
        "emergency_match": 1,
        "priority": 3
    }
]

result = recommend_hospitals(hospitals)

print("\nAI Hospital Recommendations:")
print(
    result[
        [
            "name",
            "distance_km",
            "beds",
            "icu_beds",
            "suitability_score"
        ]
    ]
)