from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass
class DashboardService:
    data_path: Path

    def __post_init__(self) -> None:
        self.df = pd.read_csv(self.data_path)
        self.df.columns = [col.strip().upper() for col in self.df.columns]
        self.df["ESTRELLAS"] = pd.to_numeric(self.df.get("ESTRELLAS"), errors="coerce")
        self.df["ALTA_CALIDAD"] = pd.to_numeric(self.df.get("ALTA_CALIDAD"), errors="coerce").fillna(0).astype(int)
        self.df["DEPARTAMENTO"] = self.df.get("DEPARTAMENTO", "").fillna("").astype(str).str.strip()
        self.df["DEPARTAMENTO_KEY"] = self.df["DEPARTAMENTO"].map(self._normalize_text)

    @staticmethod
    def _normalize_text(value: str) -> str:
        text = str(value or "").strip().upper()
        replacements = {
            "Á": "A",
            "É": "E",
            "Í": "I",
            "Ó": "O",
            "Ú": "U",
            "Ü": "U",
            "Ñ": "N",
        }
        for src, target in replacements.items():
            text = text.replace(src, target)
        return text

    def _department_metrics(self, frame: pd.DataFrame) -> list[dict]:
        if frame.empty:
            return []

        grouped = (
            frame.assign(DEPARTAMENTO=frame["DEPARTAMENTO"].replace("", "SIN_DATO"))
            .groupby("DEPARTAMENTO", as_index=False)
            .agg(
                value=("DEPARTAMENTO", "size"),
                promedio_estrellas=("ESTRELLAS", "mean"),
                alta_calidad_percent=("ALTA_CALIDAD", lambda s: float((s == 1).mean() * 100) if len(s) else 0.0),
            )
            .sort_values("value", ascending=False)
        )

        payload = []
        for _, row in grouped.iterrows():
            payload.append(
                {
                    "name": str(row["DEPARTAMENTO"]),
                    "value": int(row["value"]),
                    "promedio_estrellas": round(float(row["promedio_estrellas"]), 2)
                    if pd.notna(row["promedio_estrellas"])
                    else 0.0,
                    "alta_calidad": round(float(row["alta_calidad_percent"]), 2),
                }
            )

        return payload

    def get_location_catalog(self) -> dict:
        if self.df.empty:
            return {"departamentos": [], "location_tree": {}}

        frame = self.df[["DEPARTAMENTO", "PROVINCIA", "DISTRITO"]].copy()
        for column in ["DEPARTAMENTO", "PROVINCIA", "DISTRITO"]:
            frame[column] = frame[column].fillna("").astype(str).str.strip()

        department_names: dict[str, str] = {}
        province_names: dict[tuple[str, str], str] = {}
        district_names: dict[tuple[str, str, str], str] = {}
        location_tree_by_key: dict[str, dict[str, set[str]]] = {}

        for _, row in frame.iterrows():
            dep = row["DEPARTAMENTO"]
            if not dep:
                continue

            dep_key = self._normalize_text(dep)
            if dep_key not in department_names:
                department_names[dep_key] = dep
            location_tree_by_key.setdefault(dep_key, {})

            prov = row["PROVINCIA"]
            if not prov:
                continue

            prov_key = self._normalize_text(prov)
            province_label_key = (dep_key, prov_key)
            if province_label_key not in province_names:
                province_names[province_label_key] = prov
            location_tree_by_key[dep_key].setdefault(prov_key, set())

            dist = row["DISTRITO"]
            if not dist:
                continue

            dist_key = self._normalize_text(dist)
            district_label_key = (dep_key, prov_key, dist_key)
            if district_label_key not in district_names:
                district_names[district_label_key] = dist
            location_tree_by_key[dep_key][prov_key].add(dist_key)

        sorted_dep_keys = sorted(location_tree_by_key.keys())
        location_tree: dict[str, dict[str, list[str]]] = {}

        for dep_key in sorted_dep_keys:
            # Use the normalized key (no tildes) so the frontend can match it
            # using normalizeDepartmentKey() regardless of what department name was selected.
            location_tree[dep_key] = {}
            for prov_key in sorted(location_tree_by_key[dep_key].keys()):
                district_values = [
                    district_names.get((dep_key, prov_key, dist_key), dist_key)
                    for dist_key in sorted(location_tree_by_key[dep_key][prov_key])
                ]
                # Keep province name with tildes for display but use normalized key.
                prov_name = province_names.get((dep_key, prov_key), prov_key)
                location_tree[dep_key][prov_name] = district_values

        departamentos = [department_names.get(k, k) for k in sorted(location_tree.keys(), key=self._normalize_text)]
        return {
            "departamentos": departamentos,
            "location_tree": location_tree,
        }

    def get_dashboard(self, departamento: str | None = None) -> dict:
        requested_department = str(departamento or "").strip()
        requested_key = self._normalize_text(requested_department)

        scoped_df = self.df
        if requested_department and requested_key not in {"TODOS", "ALL"}:
            scoped_df = self.df[self.df["DEPARTAMENTO_KEY"] == requested_key]

        total = int(len(scoped_df))
        promedio_estrellas = round(float(scoped_df["ESTRELLAS"].dropna().mean()), 2) if total else 0.0
        departamentos_unicos = int(scoped_df["DEPARTAMENTO"].replace("", pd.NA).dropna().nunique())
        alta_count = int((scoped_df["ALTA_CALIDAD"] == 1).sum())
        alta_percent = round((alta_count / total) * 100, 2) if total else 0.0

        por_categoria = (
            scoped_df.dropna(subset=["ESTRELLAS"])
            .groupby("ESTRELLAS", as_index=False)
            .size()
            .rename(columns={"size": "value"})
            .sort_values("ESTRELLAS")
        )
        por_categoria_payload = [
            {"star": int(row["ESTRELLAS"]), "value": int(row["value"])}
            for _, row in por_categoria.iterrows()
        ]

        por_departamento_payload = [
            {"name": row["name"], "value": row["value"]}
            for row in self._department_metrics(scoped_df)
        ]

        mapa_departamentos = self._department_metrics(self.df)
        top_departamentos = mapa_departamentos[:5]

        filtro_departamento = "TODOS"
        if requested_department and requested_key not in {"TODOS", "ALL"}:
            filtro_departamento = requested_department if total == 0 else str(scoped_df.iloc[0]["DEPARTAMENTO"])

        return {
            "filtro_departamento": filtro_departamento,
            "total_hospedajes": total,
            "promedio_estrellas": promedio_estrellas,
            "departamentos": departamentos_unicos,
            "alta_calidad": alta_percent,
            "alta_calidad_count": alta_count,
            "por_categoria": por_categoria_payload,
            "por_departamento": por_departamento_payload,
            "mapa_departamentos": mapa_departamentos,
            "top_departamentos": top_departamentos,
        }
