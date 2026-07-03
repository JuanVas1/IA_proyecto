from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
import datetime
from typing import Optional

from services.dashboard_service import DashboardService
from services.hotel_service import HotelService
from services.prediction_service import PredictionService

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

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"

prediction_service = PredictionService(MODELS_DIR)
dashboard_service = DashboardService(DATA_DIR / "dashboard.csv")
hotel_service = HotelService(DATA_DIR / "hospedajes_turista.csv")

# Define input schema
class PredictionRequest(BaseModel):
    cama: float
    habi: float
    departamento: str
    clase: str
    provincia: Optional[str] = None
    distrito: Optional[str] = None


class TouristHotelRequest(BaseModel):
    id: int
    nombre_comercial: str
    cama: float
    habi: float
    departamento: str
    provincia: str
    distrito: str
    clase: str


class TouristRecommendationsRequest(BaseModel):
    hoteles: list[TouristHotelRequest]

@app.post("/predict")
async def predict(request: PredictionRequest):
    try:
        result_payload = prediction_service.evaluate_hotel(
            request.cama,
            request.habi,
            request.departamento,
            request.provincia,
            request.distrito,
            request.clase,
        )
        
        # Save to MongoDB
        record = {
            "timestamp": datetime.datetime.now(),
            "inputs": {
                "cama": request.cama,
                "habi": request.habi,
                "departamento": request.departamento,
                "provincia": request.provincia,
                "distrito": request.distrito,
                "clase": request.clase,
            },
            "predictions": {
                **result_payload,
                "alta_calidad_raw": 1 if result_payload["calidad"] == "Alta Calidad" else 0,
            },
            "result": result_payload,
        }
        
        try:
            inserted = collection.insert_one(record)
            saved = True
        except Exception as e:
            print(f"Could not save to MongoDB: {e}")
            saved = False
            
        return {
            "success": True,
            "result": result_payload,
            "saved_to_db": saved
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recommend-tourist")
async def recommend_tourist(payload: TouristRecommendationsRequest):
    try:
        if not payload.hoteles:
            return {"hoteles": []}

        enriched_hotels = prediction_service.recommend_hotels([hotel.model_dump() for hotel in payload.hoteles])
        return {"hoteles": enriched_hotels}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/hoteles")
async def get_hoteles(
    departamento: Optional[str] = None,
    provincia: Optional[str] = None,
    distrito: Optional[str] = None,
    clase: Optional[str] = None,
    estrellas: Optional[int] = None,
    presupuesto: Optional[str] = None,
    grupo: Optional[int] = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=25),
):
    try:
        return hotel_service.get_hoteles(
            departamento=departamento,
            provincia=provincia,
            distrito=distrito,
            clase=clase,
            estrellas=estrellas,
            presupuesto=presupuesto,
            grupo=grupo,
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/hoteles/similares")
async def get_hoteles_similares(
    hotel_id: int = Query(..., ge=1),
    k: int = Query(default=6, ge=1, le=12),
    departamento: Optional[str] = None,
):
    try:
        return {"items": hotel_service.get_similares(hotel_id=hotel_id, k=k, departamento=departamento)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/hoteles/perfil-bayes")
async def get_hoteles_perfil_bayes(
    departamento: str,
    clase: str,
):
    try:
        return hotel_service.get_bayes_profile(departamento=departamento, clase=clase)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
async def get_history():
    try:
        cursor = collection.find({}, {"_id": 0}).sort("timestamp", -1).limit(10)
        history = list(cursor)
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/dashboard")
async def get_dashboard(departamento: Optional[str] = Query(default=None)):
    try:
        return dashboard_service.get_dashboard(departamento=departamento)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
