from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
import joblib
import pandas as pd
import numpy as np
import datetime
import os

app = FastAPI()

# Allow CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect to MongoDB
try:
    client = MongoClient("mongodb://localhost:27017/")
    db = client["hotel_quality_db"]
    collection = db["predictions"]
    print("Connected to MongoDB successfully!")
except Exception as e:
    print(f"MongoDB connection error: {e}")

# Load models and columns
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
try:
    knn_model = joblib.load(os.path.join(MODELS_DIR, "modelo_knn.pkl"))
    bayes_model = joblib.load(os.path.join(MODELS_DIR, "modelo_bayes.pkl"))
    model_columns = joblib.load(os.path.join(MODELS_DIR, "columnas_modelo.pkl"))
    print("Models loaded successfully!")
except Exception as e:
    print(f"Error loading models: {e}")
    model_columns = []

# Define input schema
class PredictionRequest(BaseModel):
    cama: float
    habi: float
    departamento: str
    clase: str

@app.post("/predict")
async def predict(request: PredictionRequest):
    try:
        # Create an empty dataframe with the exact columns the model expects
        input_data = pd.DataFrame(columns=model_columns)
        
        # Add a single row initialized with zeros
        input_data.loc[0] = 0
        
        # Set the numerical values
        input_data.at[0, "CAMA"] = request.cama
        input_data.at[0, "HABI"] = request.habi
        
        # Set the location one-hot encoding
        if request.departamento in model_columns:
            input_data.at[0, request.departamento] = 1
            
        # Set the clase one-hot encoding
        if request.clase in model_columns:
            input_data.at[0, request.clase] = 1
        
        # Predict using KNN
        knn_prediction = int(knn_model.predict(input_data)[0])
        
        # Predict using Naive Bayes (get probability for Alta Calidad)
        bayes_probs = bayes_model.predict_proba(input_data)[0]
        bayes_prob_alta = round(float(bayes_probs[1]) * 100, 2)
        bayes_prediction = int(bayes_model.predict(input_data)[0])
        
        # Format the result
        quality_map = {0: "Estándar", 1: "Alta Calidad"}
        knn_result_str = quality_map.get(knn_prediction, "Desconocido")
        bayes_result_str = quality_map.get(bayes_prediction, "Desconocido")
        
        # Save to MongoDB
        record = {
            "timestamp": datetime.datetime.now(),
            "inputs": {
                "cama": request.cama,
                "habi": request.habi,
                "departamento": request.departamento,
                "clase": request.clase
            },
            "predictions": {
                "knn": knn_result_str,
                "naive_bayes": bayes_result_str,
                "naive_bayes_prob": bayes_prob_alta,
                "knn_raw": knn_prediction,
                "naive_bayes_raw": bayes_prediction
            }
        }
        
        try:
            inserted = collection.insert_one(record)
            saved = True
        except Exception as e:
            print(f"Could not save to MongoDB: {e}")
            saved = False
            
        return {
            "success": True,
            "predictions": {
                "knn": knn_result_str,
                "naive_bayes": bayes_result_str,
                "naive_bayes_prob": bayes_prob_alta
            },
            "saved_to_db": saved
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
async def get_history():
    try:
        # Get the last 10 predictions, sorted newest first
        cursor = collection.find({}, {"_id": 0}).sort("timestamp", -1).limit(10)
        history = list(cursor)
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
