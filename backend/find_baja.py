import joblib
import pandas as pd
import os

MODELS_DIR = r"c:\Users\user\Documents\GitHub\IA_proyecto\backend\models"
bayes_model = joblib.load(os.path.join(MODELS_DIR, "modelo_bayes.pkl"))
model_columns = joblib.load(os.path.join(MODELS_DIR, "columnas_modelo.pkl"))

def find_baja_calidad():
    for clase in ['CLASE_Hotel', 'CLASE_Hostal', 'CLASE_Albergue', 'CLASE_Apart Hotel']:
        for camas in range(1, 100, 5):
            for habs in range(1, 100, 5):
                input_data = pd.DataFrame(columns=model_columns)
                input_data.loc[0] = 0
                input_data.at[0, "CAMA"] = camas
                input_data.at[0, "HABI"] = habs
                input_data.at[0, "DEPARTAMENTO_LIMA"] = 1
                input_data.at[0, clase] = 1
                
                bayes_pred = bayes_model.predict(input_data)[0]
                if bayes_pred == 0:
                    print(f"¡ENCONTRADO! Camas: {camas}, Habs: {habs}, Clase: {clase}")
                    return
    print("Bayes NUNCA predice Baja Calidad para Lima en este rango.")

find_baja_calidad()
