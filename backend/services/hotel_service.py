from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass
class HotelService:
    data_path: Path

    def __post_init__(self) -> None:
        self.df = pd.read_csv(self.data_path)
        self.df.columns = [col.strip().lower() for col in self.df.columns]
        for col in ["estrellas", "cama", "habi"]:
            if col in self.df.columns:
                self.df[col] = pd.to_numeric(self.df[col], errors="coerce")

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

    def get_hoteles(
        self,
        departamento: str | None = None,
        provincia: str | None = None,
        distrito: str | None = None,
        clase: str | None = None,
        estrellas: int | None = None,
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

        total = int(len(filtered))
        total_pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, total_pages)
        start = (page - 1) * page_size
        end = start + page_size

        page_df = filtered.iloc[start:end].copy()
        records = page_df.where(pd.notna(page_df), None).to_dict(orient="records")

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
        }
