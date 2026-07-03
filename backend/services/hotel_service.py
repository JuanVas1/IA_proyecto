from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.naive_bayes import CategoricalNB
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler


@dataclass
class HotelService:
    data_path: Path

    def __post_init__(self) -> None:
        self.df = pd.read_csv(self.data_path)
        self.df.columns = [col.strip().lower() for col in self.df.columns]

        # Normalize column names from different data sources (small sample vs full dashboard).
        aliases = {
            "e_mail": "email",
            "pagina_web": "web",
            "direccion_completa": "ubicacion",
        }
        for source, target in aliases.items():
            if source in self.df.columns and target not in self.df.columns:
                self.df[target] = self.df[source]
            # Drop the original column so it doesn't stay with raw NaN floats
            if source in self.df.columns:
                self.df = self.df.drop(columns=[source])

        if "nombre_comercial" not in self.df.columns:
            self.df["nombre_comercial"] = self.df.get("razon_social", "")
        if "telefono" not in self.df.columns:
            self.df["telefono"] = ""
        if "email" not in self.df.columns:
            self.df["email"] = ""
        if "web" not in self.df.columns:
            self.df["web"] = ""
        if "ubicacion" not in self.df.columns:
            self.df["ubicacion"] = ""
        if "categoria" not in self.df.columns:
            self.df["categoria"] = ""
        if "id" not in self.df.columns:
            self.df["id"] = range(1, len(self.df) + 1)

        for col in [
            "nombre_comercial",
            "departamento",
            "provincia",
            "distrito",
            "clase",
            "categoria",
            "telefono",
            "email",
            "web",
            "ubicacion",
        ]:
            if col in self.df.columns:
                self.df[col] = self.df[col].fillna("").astype(str).str.strip()

        for col in ["estrellas", "cama", "habi"]:
            if col in self.df.columns:
                self.df[col] = pd.to_numeric(self.df[col], errors="coerce")

        # Remove repeated hotels that come from multiple snapshots/rows.
        dedup_keys = [
            "nombre_comercial",
            "departamento",
            "provincia",
            "distrito",
            "clase",
            "cama",
            "habi",
            "estrellas",
        ]
        existing_dedup_keys = [col for col in dedup_keys if col in self.df.columns]
        if existing_dedup_keys:
            self.df = self.df.drop_duplicates(subset=existing_dedup_keys, keep="first").reset_index(drop=True)

        # Keep IDs stable and unique after deduplication.
        self.df["id"] = range(1, len(self.df) + 1)

        # Proxy target used for tourist confidence ranking when explicit quality labels are absent.
        self.df["alta_calidad_proxy"] = (self.df["estrellas"].fillna(0) >= 4).astype(int)

        self._setup_bayes_model()
        self._setup_knn_model()

        self.catalog_departamentos = sorted(
            [v for v in self.df["departamento"].dropna().astype(str).str.strip().unique().tolist() if v]
        )
        self.catalog_clases = sorted(
            [v for v in self.df["clase"].dropna().astype(str).str.strip().unique().tolist() if v]
        )
        self.catalog_estrellas = sorted(
            [int(v) for v in self.df["estrellas"].dropna().astype(int).unique().tolist()]
        )

        location_tree: dict[str, dict[str, list[str]]] = {}
        for _, row in self.df.iterrows():
            dep = str(row.get("departamento") or "").strip()
            prov = str(row.get("provincia") or "").strip()
            dist = str(row.get("distrito") or "").strip()
            if not dep or not prov or not dist:
                continue
            location_tree.setdefault(dep, {}).setdefault(prov, [])
            if dist not in location_tree[dep][prov]:
                location_tree[dep][prov].append(dist)

        for dep_name in location_tree:
            for prov_name in location_tree[dep_name]:
                location_tree[dep_name][prov_name] = sorted(location_tree[dep_name][prov_name])

        self.location_tree = location_tree

    @staticmethod
    def _to_records(df: pd.DataFrame) -> list[dict]:
        """Convert a DataFrame to a list of dicts, replacing NaN/Inf floats with None."""
        import math
        records = df.where(pd.notna(df), None).to_dict(orient="records")
        cleaned = []
        for rec in records:
            clean_rec = {}
            for k, v in rec.items():
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    clean_rec[k] = None
                else:
                    clean_rec[k] = v
            cleaned.append(clean_rec)
        return cleaned

    def _setup_bayes_model(self) -> None:
        self._bayes_features = ["departamento", "provincia", "distrito", "clase"]
        self._bayes_encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
        encoded = self._bayes_encoder.fit_transform(self.df[self._bayes_features].fillna("SIN_DATO"))
        self._bayes_model = CategoricalNB(alpha=1.0)
        self._bayes_model.fit(encoded, self.df["alta_calidad_proxy"])

    def _setup_knn_model(self) -> None:
        self._knn_num_features = ["cama", "habi", "estrellas"]
        self._knn_cat_features = ["departamento", "provincia", "distrito", "clase"]

        self._knn_transformer = ColumnTransformer(
            transformers=[
                ("num", StandardScaler(), self._knn_num_features),
                (
                    "cat",
                    OneHotEncoder(handle_unknown="ignore"),
                    self._knn_cat_features,
                ),
            ]
        )

        input_df = self.df[self._knn_num_features + self._knn_cat_features].copy()
        for col in self._knn_num_features:
            input_df[col] = pd.to_numeric(input_df[col], errors="coerce").fillna(0)
        for col in self._knn_cat_features:
            input_df[col] = input_df[col].fillna("SIN_DATO").astype(str)

        self._knn_matrix = self._knn_transformer.fit_transform(input_df)
        self._knn_model = NearestNeighbors(metric="euclidean")
        self._knn_model.fit(self._knn_matrix)

    def _add_bayes_scores(self, data: pd.DataFrame) -> pd.DataFrame:
        if data.empty:
            return data
        score_input = data[self._bayes_features].fillna("SIN_DATO")
        encoded = self._bayes_encoder.transform(score_input)
        probs = self._bayes_model.predict_proba(encoded)[:, 1]
        data = data.copy()
        data["prob_alta_calidad_bayes"] = (probs * 100).round(2)
        data["alta_calidad_bayes"] = data["prob_alta_calidad_bayes"] >= 50
        return data

    def get_hoteles(
        self,
        departamento: str | None = None,
        provincia: str | None = None,
        distrito: str | None = None,
        clase: str | None = None,
        estrellas: int | None = None,
        presupuesto: str | None = None,
        grupo: int | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> dict:
        page = max(1, int(page or 1))
        page_size = max(1, min(25, int(page_size or 25)))

        filtered = self.df.copy()

        if departamento:
            filtered = filtered[filtered["departamento"].astype(str).str.upper() == str(departamento).upper()]
        if provincia:
            filtered = filtered[filtered["provincia"].astype(str).str.upper() == str(provincia).upper()]
        if distrito:
            filtered = filtered[filtered["distrito"].astype(str).str.upper() == str(distrito).upper()]
        if clase:
            filtered = filtered[filtered["clase"].astype(str).str.upper() == str(clase).upper()]
        if estrellas is not None:
            filtered = filtered[pd.to_numeric(filtered["estrellas"], errors="coerce") == int(estrellas)]
        if grupo is not None:
            filtered = filtered[pd.to_numeric(filtered["cama"], errors="coerce") >= int(grupo)]
        if presupuesto:
            budget = str(presupuesto).strip().upper()
            if budget == "ECONOMICO":
                filtered = filtered[pd.to_numeric(filtered["estrellas"], errors="coerce") <= 3]
            elif budget == "MEDIO":
                filtered = filtered[
                    (pd.to_numeric(filtered["estrellas"], errors="coerce") >= 3)
                    & (pd.to_numeric(filtered["estrellas"], errors="coerce") <= 4)
                ]
            elif budget == "PREMIUM":
                filtered = filtered[pd.to_numeric(filtered["estrellas"], errors="coerce") >= 4]

        filtered = self._add_bayes_scores(filtered)

        if departamento and clase:
            filtered = filtered.sort_values(
                by=["prob_alta_calidad_bayes", "estrellas", "cama"],
                ascending=[False, False, False],
            )

        total = int(len(filtered))
        total_pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, total_pages)
        start = (page - 1) * page_size
        end = start + page_size

        page_df = filtered.iloc[start:end].copy()
        records = self._to_records(page_df)

        global_scored = self._add_bayes_scores(self.df.copy())
        destacados_base = global_scored[global_scored["prob_alta_calidad_bayes"] >= 50].copy()
        if destacados_base.empty:
            destacados_base = global_scored.copy()

        destacados = (
            destacados_base.sort_values(
                by=["alta_calidad_proxy", "prob_alta_calidad_bayes", "estrellas"],
                ascending=[False, False, False],
            )
            .head(8)
            .copy()
        )
        destacados_records = self._to_records(destacados)

        available_provincias = sorted(
            [v for v in filtered["provincia"].dropna().astype(str).str.strip().unique().tolist() if v]
        )
        available_distritos = sorted(
            [v for v in filtered["distrito"].dropna().astype(str).str.strip().unique().tolist() if v]
        )
        available_clases = sorted(
            [v for v in filtered["clase"].dropna().astype(str).str.strip().unique().tolist() if v]
        )

        return {
            "items": records,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "available": {
                "provincias": available_provincias,
                "distritos": available_distritos,
                "clases": available_clases,
            },
            "catalog": {
                "departamentos": self.catalog_departamentos,
                "clases": self.catalog_clases,
                "estrellas": self.catalog_estrellas,
                "location_tree": self.location_tree,
            },
            "destacados": destacados_records,
        }

    def get_similares(self, hotel_id: int, k: int = 6, departamento: str | None = None) -> list[dict]:
        if self.df.empty:
            return []

        matches = self.df[self.df["id"] == int(hotel_id)]
        if matches.empty:
            return []

        match_row = matches.iloc[0]
        target_dep = str(departamento or match_row.get("departamento") or "").strip().upper()

        search_df = self.df.copy()
        if target_dep:
            same_dep = search_df[search_df["departamento"].astype(str).str.upper() == target_dep]
            if not same_dep.empty:
                search_df = same_dep

        feature_df = search_df[self._knn_num_features + self._knn_cat_features].copy()
        for col in self._knn_num_features:
            feature_df[col] = pd.to_numeric(feature_df[col], errors="coerce").fillna(0)
        for col in self._knn_cat_features:
            feature_df[col] = feature_df[col].fillna("SIN_DATO").astype(str)

        search_matrix = self._knn_transformer.transform(feature_df)
        local_knn = NearestNeighbors(metric="euclidean")
        local_knn.fit(search_matrix)

        target_features = pd.DataFrame(
            [
                {
                    "cama": pd.to_numeric(match_row.get("cama"), errors="coerce") or 0,
                    "habi": pd.to_numeric(match_row.get("habi"), errors="coerce") or 0,
                    "estrellas": pd.to_numeric(match_row.get("estrellas"), errors="coerce") or 0,
                    "departamento": str(match_row.get("departamento") or "SIN_DATO"),
                    "provincia": str(match_row.get("provincia") or "SIN_DATO"),
                    "distrito": str(match_row.get("distrito") or "SIN_DATO"),
                    "clase": str(match_row.get("clase") or "SIN_DATO"),
                }
            ]
        )
        target_vec = self._knn_transformer.transform(target_features)

        neighbors = min(len(search_df), max(2, int(k) + 1))
        distances, indices = local_knn.kneighbors(target_vec, n_neighbors=neighbors)

        similar_rows = []
        max_distance = float(max(distances[0])) if len(distances[0]) else 0.0
        for distance, local_idx in zip(distances[0], indices[0]):
            row = search_df.iloc[local_idx].copy()
            if int(row.get("id") or 0) == int(hotel_id):
                continue
            normalized = 1.0 - (float(distance) / max_distance) if max_distance > 0 else 1.0
            similarity = max(0.0, min(100.0, normalized * 100))
            row["distancia_knn"] = round(float(distance), 4)
            row["similitud_ia"] = round(similarity, 1)
            row["distancia_explicacion"] = "A menor distancia, mayor similitud en infraestructura y ubicación."
            similar_rows.append(row)

        similar_df = pd.DataFrame(similar_rows).head(int(k))
        similar_df = self._add_bayes_scores(similar_df)
        return self._to_records(similar_df)

    def get_bayes_profile(self, departamento: str, clase: str) -> dict:
        sample = pd.DataFrame(
            [
                {
                    "departamento": departamento,
                    "provincia": "SIN_DATO",
                    "distrito": "SIN_DATO",
                    "clase": clase,
                }
            ]
        )
        encoded = self._bayes_encoder.transform(sample[self._bayes_features])
        prob_alta = float(self._bayes_model.predict_proba(encoded)[0][1]) * 100

        subset = self.df[
            (self.df["departamento"].astype(str).str.upper() == str(departamento).upper())
            & (self.df["clase"].astype(str).str.upper() == str(clase).upper())
        ]

        sample_size = int(len(subset))
        avg_stars = round(float(subset["estrellas"].mean()), 2) if sample_size else 0.0

        return {
            "departamento": departamento,
            "clase": clase,
            "probabilidad_alta_calidad": round(prob_alta, 2),
            "muestra": sample_size,
            "promedio_estrellas": avg_stars,
        }
