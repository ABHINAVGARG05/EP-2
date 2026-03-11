import numpy as np
import torch
import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

from model import FallCNN
from preprocessing import CHANNELS, WINDOW_SIZE

MODEL_PATH  = "model.pth"
SCALER_PATH = "scaler.pkl"
DEVICE      = torch.device("cpu")
THRESHOLD   = 0.5

model = FallCNN(in_channels=CHANNELS, window_size=WINDOW_SIZE).to(DEVICE)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.eval()

scaler = joblib.load(SCALER_PATH)

app = FastAPI(title="Fall Detection API", version="1.0.0")

class SensorWindow(BaseModel):
    acc: List[List[float]]
    gyro: List[List[float]]


def _to_window(signal: np.ndarray, name: str) -> np.ndarray:
    if signal.ndim != 2 or signal.shape[1] != 3:
        raise HTTPException(status_code=422, detail=f"{name} must be a 2D array with 3 columns (x, y, z)")
    if signal.shape[0] == 0:
        raise HTTPException(status_code=422, detail=f"{name} must contain at least 1 time step")

    # Keep most recent samples when there are extra points.
    if signal.shape[0] > WINDOW_SIZE:
        return signal[-WINDOW_SIZE:]

    # Right-pad short sequences with the last sample to preserve continuity.
    if signal.shape[0] < WINDOW_SIZE:
        pad_rows = WINDOW_SIZE - signal.shape[0]
        pad = np.repeat(signal[-1:, :], pad_rows, axis=0)
        return np.concatenate([signal, pad], axis=0)

    return signal

@app.post("/predict")
def predict(data: SensorWindow):
    acc = _to_window(np.array(data.acc, dtype=np.float32), "acc")
    gyro = _to_window(np.array(data.gyro, dtype=np.float32), "gyro")

    features = np.concatenate([acc, gyro], axis=1)
    #features_norm = scaler.transform(features)
    features_norm = features
    tensor = torch.tensor(features_norm.T[np.newaxis], dtype=torch.float32).to(DEVICE)

    with torch.no_grad():
        prob = model(tensor).item()
    
    print("Prediction probability:", prob)

    return {
        "fall":       prob >= THRESHOLD,
        "confidence": round(prob, 4),
    }


@app.get("/health")
def health():
    return {"status": "ok"}