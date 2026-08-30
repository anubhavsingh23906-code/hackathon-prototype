from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import pandas as pd
from typing import List

app = FastAPI(
    title="HealthConnect ML Service",
    description="AI Hospital Recommendation Service",
    version="1.0"
)

# Load trained model
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
model = joblib.load(BASE_DIR / "model" / "hospital_model.pkl")

class Hospital(BaseModel):
    name: str
    distance_km: float
    beds: int
    icu_beds: int
    trauma: int
    emergency_match: int
    priority: int


class RecommendationRequest(BaseModel):
    hospitals: List[Hospital]


@app.get("/")
def home():
    return {
        "message": "HealthConnect ML Service is running"
    }


@app.post("/recommend-hospitals")
def recommend_hospitals(request: RecommendationRequest):

    # Convert incoming hospitals to DataFrame
    hospitals = [hospital.model_dump() for hospital in request.hospitals]
    df = pd.DataFrame(hospitals)

    features = [
        "distance_km",
        "beds",
        "icu_beds",
        "trauma",
        "emergency_match",
        "priority"
    ]

    # Get probability of hospital being suitable
    df["suitability_score"] = model.predict_proba(
        df[features]
    )[:, 1]

    # Sort highest score first
    df = df.sort_values(
        by="suitability_score",
        ascending=False
    )

    # Convert score to percentage
    df["suitability_score"] = (
        df["suitability_score"] * 100
    ).round(2)

    # Return JSON
    recommendations = df[
        [
            "name",
            "distance_km",
            "beds",
            "icu_beds",
            "suitability_score"
        ]
    ].to_dict(orient="records")

    return {
        "recommendations": recommendations
    }