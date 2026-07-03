from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd


@dataclass
class PredictionService:
    models_dir: Path

    def __post_init__(self) -> None:
        self.alta_model = joblib.load(self.models_dir / "modelo_alta_calidad.pkl")
        self.estrellas_model = joblib.load(self.models_dir / "modelo_estrellas.pkl")
        self.preprocesador = joblib.load(self.models_dir / "preprocesador.pkl")
        self.scaler_alta = joblib.load(self.models_dir / "scaler_alta.pkl")
        self.scaler_est = joblib.load(self.models_dir / "scaler_est.pkl")
        self.expected_columns = list(self.preprocesador.feature_names_in_)

    @staticmethod
    def normalize_label(value: str | None, prefix: str = "") -> str:
        text = str(value or "").strip()
        if prefix and text.upper().startswith(prefix.upper()):
            text = text[len(prefix):]
        return text.upper()

    @staticmethod
    def build_stars_visual(stars: int) -> str:
        value = max(1, min(5, int(stars)))
        return "★" * value + "☆" * (5 - value)

    @staticmethod
    def build_recommendation(calidad: str, estrellas: int, confianza_alta: float, cama: float, habi: float) -> str:
        if calidad == "Alta Calidad" and estrellas >= 4:
            return "Existe alto potencial para desarrollar un hospedaje premium en esta configuracion."
        if calidad == "Alta Calidad" and estrellas == 3:
            return "Existe potencial de inversion competitivo. Reforzar servicios diferenciales elevaria la categoria."
        if confianza_alta < 55:
            return "La prediccion es incierta. Se recomienda validar ubicacion y capacidad antes de invertir."
        if cama > habi * 3:
            return "La proporcion camas/habitaciones es alta; optimizar la distribucion puede mejorar la experiencia."
        return "Enfocar la propuesta en eficiencia operativa y mejora gradual de servicios para aumentar categoria."

    def build_input_dataframe(
        self,
        cama: float,
        habi: float,
        departamento: str,
        provincia: str | None,
        distrito: str | None,
        clase: str,
    ) -> pd.DataFrame:
        departamento_value = self.normalize_label(departamento, "DEPARTAMENTO_")
        provincia_value = self.normalize_label(provincia, "PROVINCIA_") if provincia else departamento_value
        distrito_value = self.normalize_label(distrito, "DISTRITO_") if distrito else "NO_ESPECIFICADO"
        clase_value = self.normalize_label(clase, "CLASE_")

        row = {
            "CAMA": float(cama),
            "HABI": float(habi),
            "DEPARTAMENTO": departamento_value,
            "PROVINCIA": provincia_value,
            "DISTRITO": distrito_value,
            "CLASE": clase_value,
        }
        return pd.DataFrame([row], columns=self.expected_columns)

    def evaluate_hotel(
        self,
        cama: float,
        habi: float,
        departamento: str,
        provincia: str | None,
        distrito: str | None,
        clase: str,
    ) -> dict:
        input_data = self.build_input_dataframe(cama, habi, departamento, provincia, distrito, clase)
        transformed = self.preprocesador.transform(input_data)
        transformed_alta = self.scaler_alta.transform(transformed)
        transformed_est = self.scaler_est.transform(transformed)

        alta_raw = int(self.alta_model.predict(transformed_alta)[0])
        alta_prob = round(float(self.alta_model.predict_proba(transformed_alta)[0][1]) * 100, 2)
        estrellas_raw = int(self.estrellas_model.predict(transformed_est)[0])
        estrellas_visual = self.build_stars_visual(estrellas_raw)

        if hasattr(self.estrellas_model, "predict_proba"):
            estrellas_probs = self.estrellas_model.predict_proba(transformed_est)[0]
            estrellas_prob = round(float(max(estrellas_probs)) * 100, 2)
        else:
            estrellas_prob = 85.0

        calidad_texto = "Alta Calidad" if alta_raw == 1 else "Estándar"
        recomendado = bool(calidad_texto == "Alta Calidad" and estrellas_raw >= 4)

        return {
            "calidad": calidad_texto,
            "confianza_alta": alta_prob,
            "estrellas": estrellas_raw,
            "estrellas_visual": estrellas_visual,
            "confianza_estrellas": estrellas_prob,
            "recomendacion": self.build_recommendation(calidad_texto, estrellas_raw, alta_prob, cama, habi),
            "recomendado_ia": recomendado,
        }

    def recommend_hotels(self, hoteles: list[dict]) -> list[dict]:
        enriched: list[dict] = []
        for hotel in hoteles:
            prediction = self.evaluate_hotel(
                cama=float(hotel.get("cama") or hotel.get("camas") or 0),
                habi=float(hotel.get("habi") or 0),
                departamento=str(hotel.get("departamento") or ""),
                provincia=str(hotel.get("provincia") or ""),
                distrito=str(hotel.get("distrito") or ""),
                clase=str(hotel.get("clase") or ""),
            )

            enriched.append(
                {
                    **hotel,
                    "calidad_ia": prediction["calidad"],
                    "confianza_ia": prediction["confianza_alta"],
                    "estrellas_ia": prediction["estrellas"],
                    "estrellas_visual": prediction["estrellas_visual"],
                    "recomendado_ia": prediction["recomendado_ia"],
                }
            )

        enriched.sort(
            key=lambda item: (
                0 if item.get("calidad_ia") == "Alta Calidad" else 1,
                -float(item.get("confianza_ia") or 0),
                -int(item.get("estrellas_ia") or 0),
            )
        )
        return enriched
