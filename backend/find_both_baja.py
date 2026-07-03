import joblib
import pandas as pd
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

alta_model = joblib.load(os.path.join(MODELS_DIR, "modelo_alta_calidad.pkl"))
estrellas_model = joblib.load(os.path.join(MODELS_DIR, "modelo_estrellas.pkl"))
preprocesador = joblib.load(os.path.join(MODELS_DIR, "preprocesador.pkl"))
scaler_alta = joblib.load(os.path.join(MODELS_DIR, "scaler_alta.pkl"))
scaler_est = joblib.load(os.path.join(MODELS_DIR, "scaler_est.pkl"))

def find_perfect_baja():
    for depto in ["LIMA", "CUSCO", "AREQUIPA", "PIURA"]:
        for clase in ["HOTEL", "HOSTAL", "ALBERGUE", "APART HOTEL"]:
            for camas in [5, 10, 15, 20]:
                for habs in [5, 10, 15, 20]:
                    input_data = pd.DataFrame([
                        {
                            "CAMA": camas,
                            "HABI": habs,
                            "DEPARTAMENTO": depto,
                            "PROVINCIA": depto,
                            "DISTRITO": "NO_ESPECIFICADO",
                            "CLASE": clase,
                        }
                    ])

                    transformed = preprocesador.transform(input_data)
                    alta_pred = int(alta_model.predict(scaler_alta.transform(transformed))[0])
                    est_pred = int(estrellas_model.predict(scaler_est.transform(transformed))[0])

                    if alta_pred == 0 and est_pred <= 2:
                        print(f"¡BINGO! Depto: {depto}, Clase: {clase}, Camas: {camas}, Habs: {habs}, Estrellas: {est_pred}")
                        return
    print("No se encontro una combinacion de baja calidad y pocas estrellas en el rango probado.")

find_perfect_baja()
