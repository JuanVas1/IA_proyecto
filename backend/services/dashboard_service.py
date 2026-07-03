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

    def get_dashboard(self) -> dict:
        total = int(len(self.df))
        promedio_estrellas = round(float(self.df["ESTRELLAS"].dropna().mean()), 2) if total else 0.0
        departamentos_unicos = int(self.df["DEPARTAMENTO"].fillna("").astype(str).str.strip().replace("", pd.NA).dropna().nunique())
        alta_count = int((self.df["ALTA_CALIDAD"] == 1).sum())
        alta_percent = round((alta_count / total) * 100, 2) if total else 0.0

        por_categoria = (
            self.df.dropna(subset=["ESTRELLAS"])
            .groupby("ESTRELLAS", as_index=False)
            .size()
            .rename(columns={"size": "value"})
            .sort_values("ESTRELLAS")
        )
        por_categoria_payload = [
            {"star": int(row["ESTRELLAS"]), "value": int(row["value"])}
            for _, row in por_categoria.iterrows()
        ]

        por_departamento = (
            self.df.assign(DEPARTAMENTO=self.df["DEPARTAMENTO"].fillna("SIN_DATO").astype(str).str.strip())
            .groupby("DEPARTAMENTO", as_index=False)
            .size()
            .rename(columns={"size": "value", "DEPARTAMENTO": "name"})
            .sort_values("value", ascending=False)
        )
        por_departamento_payload = [
            {"name": str(row["name"]), "value": int(row["value"])}
            for _, row in por_departamento.iterrows()
        ]

        return {
            "total_hospedajes": total,
            "promedio_estrellas": promedio_estrellas,
            "departamentos": departamentos_unicos,
            "alta_calidad": alta_percent,
            "alta_calidad_count": alta_count,
            "por_categoria": por_categoria_payload,
            "por_departamento": por_departamento_payload,
        }
