import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib

# Load training data
df = pd.read_csv("data/hospital_training.csv")

print("Dataset shape:", df.shape)
print(df.head())

# Features used by the model
features = [
    "distance_km",
    "beds",
    "icu_beds",
    "trauma",
    "emergency_match",
    "priority"
]

X = df[features]
y = df["suitable"]

# Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# Train model
model = RandomForestClassifier(
    n_estimators=200,
    random_state=42,
    class_weight="balanced"
)

model.fit(X_train, y_train)

# Evaluate
y_pred = model.predict(X_test)

print("\nAccuracy:", accuracy_score(y_test, y_pred))
print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# Save model
joblib.dump(model, "model/hospital_model.pkl")

print("\nModel saved to model/hospital_model.pkl")