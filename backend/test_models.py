import joblib
import pandas as pd
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

def load_models():
    alta_model = joblib.load(os.path.join(MODELS_DIR, "modelo_alta_calidad.pkl"))
    estrellas_model = joblib.load(os.path.join(MODELS_DIR, "modelo_estrellas.pkl"))
    preprocesador = joblib.load(os.path.join(MODELS_DIR, "preprocesador.pkl"))
    scaler_alta = joblib.load(os.path.join(MODELS_DIR, "scaler_alta.pkl"))
    scaler_est = joblib.load(os.path.join(MODELS_DIR, "scaler_est.pkl"))
    return alta_model, estrellas_model, preprocesador, scaler_alta, scaler_est

def run_model_test(cama, habi, departamento, clase, provincia=None, distrito=None):
    alta_model, estrellas_model, preprocesador, scaler_alta, scaler_est = load_models()
    input_data = pd.DataFrame([
        {
            "CAMA": cama,
            "HABI": habi,
            "DEPARTAMENTO": departamento,
            "PROVINCIA": provincia or departamento,
            "DISTRITO": distrito or "NO_ESPECIFICADO",
            "CLASE": clase,
        }
    ])

    transformed = preprocesador.transform(input_data)
    alta_pred = int(alta_model.predict(scaler_alta.transform(transformed))[0])
    estrellas_pred = int(estrellas_model.predict(scaler_est.transform(transformed))[0])
    alta_prob = alta_model.predict_proba(scaler_alta.transform(transformed))[0]

    print(f"Prueba: {cama} camas, {habi} habs, {departamento}, {clase}")
    print(f" Alta calidad: {alta_pred} (Prob: {alta_prob})")
    print(f" Estrellas estimadas: {estrellas_pred}")
    print("-" * 30)

if __name__ == "__main__":
    run_model_test(1, 1, "LIMA", "HOSTAL", "LIMA", "MIRAFLORES")
    run_model_test(5, 5, "LIMA", "HOSTAL", "LIMA", "MIRAFLORES")
    run_model_test(10, 5, "LIMA", "HOSTAL", "LIMA", "MIRAFLORES")
    run_model_test(20, 10, "LIMA", "ALBERGUE", "LIMA", "MIRAFLORES")
    run_model_test(50, 20, "LIMA", "ALBERGUE", "LIMA", "MIRAFLORES")
    run_model_test(100, 50, "LIMA", "HOSTAL", "LIMA", "MIRAFLORES")
    run_model_test(500, 200, "LIMA", "HOTEL", "LIMA", "MIRAFLORES")
    run_model_test(2, 1, "LIMA", "HOTEL", "LIMA", "MIRAFLORES")
