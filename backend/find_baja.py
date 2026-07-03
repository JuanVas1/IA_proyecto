import joblib
import pandas as pd
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

alta_model = joblib.load(os.path.join(MODELS_DIR, "modelo_alta_calidad.pkl"))
preprocesador = joblib.load(os.path.join(MODELS_DIR, "preprocesador.pkl"))
scaler_alta = joblib.load(os.path.join(MODELS_DIR, "scaler_alta.pkl"))

def find_baja_calidad():
    for clase in ["HOTEL", "HOSTAL", "ALBERGUE", "APART HOTEL"]:
        for camas in range(1, 100, 5):
            for habs in range(1, 100, 5):
                input_data = pd.DataFrame([
                    {
                        "CAMA": camas,
                        "HABI": habs,
                        "DEPARTAMENTO": "LIMA",
                        "PROVINCIA": "LIMA",
                        "DISTRITO": "MIRAFLORES",
                        "CLASE": clase,
                    }
                ])

                transformed = preprocesador.transform(input_data)
                alta_pred = int(alta_model.predict(scaler_alta.transform(transformed))[0])
                if alta_pred == 0:
                    print(f"¡ENCONTRADO! Camas: {camas}, Habs: {habs}, Clase: {clase}")
                    return
    print("El modelo de alta calidad no predice Baja Calidad para Lima en este rango.")

find_baja_calidad()
