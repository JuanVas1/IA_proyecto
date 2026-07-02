import joblib
import pandas as pd
import os

MODELS_DIR = r"c:\Users\user\Documents\GitHub\IA_proyecto\backend\models"
knn_model = joblib.load(os.path.join(MODELS_DIR, "modelo_knn.pkl"))
bayes_model = joblib.load(os.path.join(MODELS_DIR, "modelo_bayes.pkl"))
model_columns = joblib.load(os.path.join(MODELS_DIR, "columnas_modelo.pkl"))

def find_perfect_baja():
    valid_deptos = [col for col in model_columns if col.startswith('DEPARTAMENTO_') and not any(char.isdigit() for char in col)]
    for depto in valid_deptos:
        for clase in ['CLASE_Hotel', 'CLASE_Hostal', 'CLASE_Albergue', 'CLASE_Apart Hotel']:
            for camas in [5, 10, 15, 20]:
                for habs in [5, 10, 15, 20]:
                    input_data = pd.DataFrame(columns=model_columns)
                    input_data.loc[0] = 0
                    input_data.at[0, "CAMA"] = camas
                    input_data.at[0, "HABI"] = habs
                    input_data.at[0, depto] = 1
                    input_data.at[0, clase] = 1
                    
                    knn_pred = knn_model.predict(input_data)[0]
                    bayes_pred = bayes_model.predict(input_data)[0]
                    
                    if knn_pred == 0 and bayes_pred == 0:
                        print(f"¡BINGO! Depto: {depto.replace('DEPARTAMENTO_', '')}, Clase: {clase.replace('CLASE_', '')}, Camas: {camas}, Habs: {habs}")
                        return

find_perfect_baja()
