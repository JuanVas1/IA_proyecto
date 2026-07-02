import joblib
import pandas as pd
import os

MODELS_DIR = r"c:\Users\user\Documents\GitHub\IA_proyecto\backend\models"

knn_model = joblib.load(os.path.join(MODELS_DIR, "modelo_knn.pkl"))
bayes_model = joblib.load(os.path.join(MODELS_DIR, "modelo_bayes.pkl"))
model_columns = joblib.load(os.path.join(MODELS_DIR, "columnas_modelo.pkl"))

def test_model(cama, habi, depto, clase):
    input_data = pd.DataFrame(columns=model_columns)
    input_data.loc[0] = 0
    input_data.at[0, "CAMA"] = cama
    input_data.at[0, "HABI"] = habi
    if depto in model_columns:
        input_data.at[0, depto] = 1
    if clase in model_columns:
        input_data.at[0, clase] = 1
        
    knn_pred = knn_model.predict(input_data)[0]
    bayes_pred = bayes_model.predict(input_data)[0]
    bayes_prob = bayes_model.predict_proba(input_data)[0]
    
    print(f"Prueba: {cama} camas, {habi} habs, {depto}, {clase}")
    print(f" KNN: {knn_pred}")
    print(f" Bayes: {bayes_pred} (Prob: {bayes_prob})")
    print("-" * 30)

test_model(1, 1, 'DEPARTAMENTO_LIMA', 'CLASE_Hostal')
test_model(5, 5, 'DEPARTAMENTO_LIMA', 'CLASE_Hostal')
test_model(10, 5, 'DEPARTAMENTO_LIMA', 'CLASE_Hostal')
test_model(20, 10, 'DEPARTAMENTO_LIMA', 'CLASE_Albergue')
test_model(50, 20, 'DEPARTAMENTO_LIMA', 'CLASE_Albergue')
test_model(100, 50, 'DEPARTAMENTO_LIMA', 'CLASE_Hostal')
test_model(500, 200, 'DEPARTAMENTO_LIMA', 'CLASE_Hotel')
test_model(2, 1, 'DEPARTAMENTO_LIMA', 'CLASE_Hotel')
