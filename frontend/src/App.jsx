import { useEffect, useMemo, useState } from "react";
import { getDashboard, getHistory, getHotels, predictHotel, recommendTourist } from "./services/api";
import hotelPhoto from "./assets/hero.png";
import "./App.css";

const menuItems = [
  { id: "inicio", label: "Inicio" },
  { id: "dashboard", label: "Dashboard" },
  { id: "turista", label: "Turista" },
  { id: "inversionista", label: "Inversionista" },
  { id: "historial", label: "Historial" },
  { id: "mapa", label: "Mapa de Hoteles" },
  { id: "acerca", label: "Acerca del proyecto" },
];
const HOTELS_PAGE_SIZE = 25;

function starsVisual(stars) {
  const count = Math.max(1, Math.min(5, Number(stars) || 1));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

function cleanLabel(text = "") {
  return String(text).replace(/_/g, " ").trim();
}

function adaptHistoryRecord(item) {
  const result = item.result || item.predictions || {};
  return {
    timestamp: item.timestamp,
    inputs: item.inputs || {},
    result: {
      calidad: result.calidad || result.alta_calidad || "Estandar",
      confianza_alta: result.confianza_alta ?? result.alta_calidad_prob ?? 0,
      estrellas: result.estrellas ?? result.estrellas_estimadas ?? 0,
      estrellas_visual: result.estrellas_visual || starsVisual(result.estrellas ?? result.estrellas_estimadas ?? 1),
      confianza_estrellas: result.confianza_estrellas ?? 0,
      recomendacion: result.recomendacion || "Sin recomendacion disponible.",
    },
  };
}

function buildInvestorErrors(form) {
  const errors = {};
  if (!form.departamento) errors.departamento = "Selecciona un departamento.";
  if (!form.provincia) errors.provincia = "Selecciona una provincia.";
  if (!form.distrito) errors.distrito = "Selecciona un distrito.";
  if (!form.clase) errors.clase = "Selecciona una clase.";

  const cama = Number(form.cama);
  const habi = Number(form.habi);

  if (!Number.isFinite(cama) || cama <= 0) {
    errors.cama = "El número de camas debe ser mayor a 0.";
  }

  if (!Number.isFinite(habi) || habi <= 0) {
    errors.habi = "El número de habitaciones debe ser mayor a 0.";
  }

  if (Number.isFinite(cama) && Number.isFinite(habi) && cama > 0 && habi > 0 && cama < habi) {
    errors.cama = "Las camas deben ser mayores o iguales que las habitaciones.";
    errors.habi = "Las habitaciones no pueden superar a las camas.";
  }

  return errors;
}

function interpretQualityConfidence(confidence) {
  const value = Number(confidence) || 0;
  if (value >= 80) return "Predicción con alta confiabilidad.";
  if (value >= 60) return "Predicción con confiabilidad moderada.";
  return "La confianza del modelo es baja. Se recomienda interpretar el resultado como una estimación preliminar.";
}

function interpretRecommendation(result) {
  const calidad = result?.calidad || "Estándar";
  const estrellas = Number(result?.estrellas || 0);

  if (calidad === "Alta Calidad" && estrellas >= 4) {
    return "El proyecto presenta características similares a hospedajes de alta categoría. Existe un alto potencial para desarrollar un establecimiento competitivo en esta ubicación.";
  }

  if (calidad === "Alta Calidad" && estrellas >= 1 && estrellas <= 3) {
    return "El proyecto posee buenas características, aunque podría incrementar su categoría mejorando infraestructura y servicios.";
  }

  if (calidad === "Estándar" && estrellas >= 4) {
    return "El modelo identifica características asociadas a una categoría alta, pero la probabilidad de Alta Calidad aún es baja. Se recomienda realizar un análisis complementario antes de invertir.";
  }

  return "El proyecto presenta características de una categoría estándar. Se recomienda mejorar capacidad, infraestructura y servicios antes de realizar una inversión.";
}

function starsProgressValue(confidence) {
  return `${Math.max(0, Math.min(100, Number(confidence) || 0))}%`;
}

function sortTouristRecommendations(hotels) {
  return [...hotels].sort((left, right) => {
    const leftRank = left.recomendado_ia ? 0 : 1;
    const rightRank = right.recomendado_ia ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return Number(right.confianza_ia || 0) - Number(left.confianza_ia || 0);
  });
}

function App() {
  const [activeSection, setActiveSection] = useState("inicio");
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);

  const [investorForm, setInvestorForm] = useState({
    departamento: "",
    provincia: "",
    distrito: "",
    clase: "",
    cama: 80,
    habi: 40,
  });
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState(null);
  const [predictResult, setPredictResult] = useState(null);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [touristFilter, setTouristFilter] = useState({
    departamento: "TODOS",
    provincia: "TODOS",
    distrito: "TODOS",
    clase: "TODOS",
    estrellas: "TODOS",
  });
  const [touristPrioritizeIA, setTouristPrioritizeIA] = useState(true);
  const [touristAILoading, setTouristAILoading] = useState(false);
  const [touristAIError, setTouristAIError] = useState(null);
  const [touristAHotels, setTouristAHotels] = useState([]);
  const [touristHotels, setTouristHotels] = useState([]);
  const [touristLoading, setTouristLoading] = useState(false);
  const [touristRequestError, setTouristRequestError] = useState(null);
  const [touristAvailable, setTouristAvailable] = useState({ provincias: [], distritos: [], clases: [] });
  const [catalog, setCatalog] = useState({ departamentos: [], clases: [], estrellas: [], location_tree: {} });
  const [touristTotalPages, setTouristTotalPages] = useState(1);
  const [touristTotalItems, setTouristTotalItems] = useState(0);
  const [touristPage, setTouristPage] = useState(1);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const data = await getHistory();
      setHistory(data.map(adaptHistoryRecord));
    } catch (error) {
      setHistoryError("No se pudo cargar el historial desde FastAPI.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchDashboard = async () => {
    try {
      const data = await getDashboard();
      setDashboardData(data);
    } catch (error) {
      setDashboardData(null);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchDashboard();
  }, []);

  const fetchTouristHotels = async (filters, page) => {
    setTouristLoading(true);
    setTouristRequestError(null);

    try {
      const params = {
        page,
        page_size: HOTELS_PAGE_SIZE,
      };

      if (filters.departamento !== "TODOS") params.departamento = filters.departamento;
      if (filters.provincia !== "TODOS") params.provincia = filters.provincia;
      if (filters.distrito !== "TODOS") params.distrito = filters.distrito;
      if (filters.clase !== "TODOS") params.clase = filters.clase;
      if (filters.estrellas !== "TODOS") params.estrellas = Number(filters.estrellas);

      const response = await getHotels(params);
      setTouristHotels(response.items || []);
      setTouristAvailable(response.available || { provincias: [], distritos: [], clases: [] });
      if (response.catalog) {
        setCatalog(response.catalog);
      }
      setTouristTotalPages(Number(response.total_pages || 1));
      setTouristTotalItems(Number(response.total || 0));
    } catch (error) {
      setTouristHotels([]);
      setTouristAvailable({ provincias: [], distritos: [], clases: [] });
      setTouristTotalPages(1);
      setTouristTotalItems(0);
      setTouristRequestError("No se pudo cargar los hospedajes desde el backend.");
    } finally {
      setTouristLoading(false);
    }
  };

  useEffect(() => {
    fetchTouristHotels(touristFilter, touristPage);
  }, [touristFilter, touristPage]);

  const provinceOptions = useMemo(() => {
    if (!investorForm.departamento) {
      return [];
    }
    return Object.keys(catalog.location_tree?.[investorForm.departamento] || {});
  }, [catalog.location_tree, investorForm.departamento]);

  const districtOptions = useMemo(() => {
    if (!investorForm.departamento || !investorForm.provincia) {
      return [];
    }
    return catalog.location_tree?.[investorForm.departamento]?.[investorForm.provincia] || [];
  }, [catalog.location_tree, investorForm.departamento, investorForm.provincia]);

  const filteredTuristaData = useMemo(() => {
    return touristAHotels.length > 0 ? touristAHotels : touristHotels;
  }, [touristAHotels, touristHotels]);

  const touristOptions = useMemo(() => {
    return {
      provinces: touristAvailable.provincias || [],
      districts: touristAvailable.distritos || [],
      classes: touristAvailable.clases || catalog.clases || [],
      stars: catalog.estrellas || [],
    };
  }, [catalog.clases, catalog.estrellas, touristAvailable]);

  const touristVisibleHotels = useMemo(() => {
    if (touristAHotels.length > 0) {
      return touristPrioritizeIA ? sortTouristRecommendations(filteredTuristaData) : filteredTuristaData;
    }
    return filteredTuristaData;
  }, [filteredTuristaData, touristAHotels, touristPrioritizeIA]);

  const kpis = useMemo(() => {
    return {
      totalHospedajes: Number(dashboardData?.total_hospedajes || 0),
      totalDepartamentos: Number(dashboardData?.departamentos || 0),
      altaPorcentaje: Number(dashboardData?.alta_calidad || 0),
      promedioEstrellas: Number(dashboardData?.promedio_estrellas || 0),
    };
  }, [dashboardData]);

  const starsDistribution = dashboardData?.por_categoria || [];

  const departamentosDistribution = dashboardData?.por_departamento || [];

  const submitPrediction = async (event) => {
    event.preventDefault();
    const nextErrors = buildInvestorErrors(investorForm);
    setFieldErrors(nextErrors);
    setFormError(null);
    setPredictError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const cama = Number(investorForm.cama);
    const habi = Number(investorForm.habi);

    setPredictLoading(true);
    setPredictResult(null);

    try {
      const response = await predictHotel({
        cama,
        habi,
        departamento: investorForm.departamento,
        provincia: investorForm.provincia,
        distrito: investorForm.distrito,
        clase: investorForm.clase,
      });
      setPredictResult(response.result);
      await fetchHistory();
      await fetchDashboard();
    } catch (error) {
      setPredictError("No se pudo obtener prediccion. Verifica que FastAPI este ejecutandose en puerto 8000.");
    } finally {
      setPredictLoading(false);
    }
  };

  const onInvestorChange = (event) => {
    const { name, value } = event.target;
    setFormError(null);
    setFieldErrors((current) => ({ ...current, [name]: null }));

    if (name === "departamento") {
      setInvestorForm((prev) => ({ ...prev, departamento: value, provincia: "", distrito: "" }));
      setFieldErrors((current) => ({ ...current, provincia: null, distrito: null }));
      return;
    }

    if (name === "provincia") {
      setInvestorForm((prev) => ({ ...prev, provincia: value, distrito: "" }));
      setFieldErrors((current) => ({ ...current, distrito: null }));
      return;
    }

    setInvestorForm((prev) => ({ ...prev, [name]: value }));
  };

  const updateTouristFilter = (key, value) => {
    setTouristFilter((current) => {
      const nextFilter = { ...current, [key]: value };
      if (key === "departamento") {
        nextFilter.provincia = "TODOS";
        nextFilter.distrito = "TODOS";
      }
      if (key === "provincia") {
        nextFilter.distrito = "TODOS";
      }
      return nextFilter;
    });
    setTouristAHotels([]);
    setTouristAIError(null);
    setTouristPage(1);
  };

  const applyTouristAI = async () => {
    const hotelsToAnalyze = touristHotels.map((hotel, index) => ({
      id: hotel.id ?? index + 1,
      nombre_comercial: hotel.nombre_comercial || hotel.nombre,
      cama: hotel.cama || hotel.camas,
      habi: hotel.habi,
      departamento: hotel.departamento,
      provincia: hotel.provincia,
      distrito: hotel.distrito,
      clase: hotel.clase,
    }));

    if (hotelsToAnalyze.length === 0) {
      setTouristAIError("No hay hospedajes filtrados para evaluar con IA.");
      setTouristAHotels([]);
      return;
    }

    setTouristAILoading(true);
    setTouristAIError(null);

    try {
      const enrichedHotels = await recommendTourist(hotelsToAnalyze);
      setTouristAHotels(touristPrioritizeIA ? sortTouristRecommendations(enrichedHotels) : enrichedHotels);
    } catch (error) {
      setTouristAIError("No se pudo aplicar la recomendación IA. Verifica que FastAPI esté ejecutándose.");
    } finally {
      setTouristAILoading(false);
    }
  };

  const resetInvestorForm = () => {
    setInvestorForm({
      departamento: "",
      provincia: "",
      distrito: "",
      clase: "",
      cama: 80,
      habi: 40,
    });
    setFieldErrors({});
    setFormError(null);
    setPredictError(null);
    setPredictResult(null);
  };

  const lastPredictions = (dashboardData?.latest_predictions || history)
    .map(adaptHistoryRecord)
    .slice(0, 3);

  const renderDashboard = () => (
    <section className="section-grid">
      <div className="kpi-grid">
        <article className="kpi-card">
          <span className="kpi-label">Total de Hospedajes</span>
          <strong>{kpis.totalHospedajes.toLocaleString("es-PE")}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Alta Calidad (IA)</span>
          <strong>{kpis.altaPorcentaje}%</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Promedio de Estrellas</span>
          <strong>{kpis.promedioEstrellas}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Departamentos</span>
          <strong>{kpis.totalDepartamentos}</strong>
        </article>
      </div>

      <div className="dashboard-main-grid">
        <article className="panel card-chart">
          <h3>Distribucion de Hospedajes por Categoria</h3>
          <div className="bar-chart">
            {starsDistribution.map((item) => (
              <div key={item.star} className="bar-item">
                <div className="bar-value">{item.value}</div>
                <div className="bar-visual" style={{ height: `${Math.max(20, item.value / 16)}px` }} />
                <span>{item.star} ★</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel map-card">
          <h3>Mapa de Hospedajes por Departamento</h3>
          <div className="peru-map-wrap">
            <svg viewBox="0 0 220 310" className="peru-map" role="img" aria-label="Mapa estilizado del Peru">
              <path d="M104 12l34 18 9 24 26 20-12 27 17 18-15 34 8 24-23 29-6 31-27 24-37 8-18-16-22 7-16-19-20-6-3-28 15-22-7-29 14-23-7-30 18-20 17-34 33-17z" fill="#d7e7fb" stroke="#9ab8e4" strokeWidth="2" />
              <path d="M104 12l34 18 9 24-21 12-25-6-9-19z" fill="#7aa8e8" />
              <path d="M84 102l28 9 8 30-18 16-26-7-7-23z" fill="#2a6ed7" />
              <path d="M122 164l28 8-8 27-18 13-20-10 4-23z" fill="#4f8fe8" />
              <path d="M75 206l24 11-2 25-22 8-16-13 6-21z" fill="#6da0ea" />
            </svg>
          </div>
          <div className="legend">
            <span><i className="legend-dot low" /> Bajo</span>
            <span><i className="legend-dot high" /> Alto</span>
          </div>
        </article>

        <article className="panel predictions-card">
          <h3>Ultimas Predicciones</h3>
          {lastPredictions.length === 0 && <p className="muted">Sin predicciones recientes.</p>}
          {lastPredictions.map((item, idx) => (
            <div className="prediction-item" key={`${item.timestamp}-${idx}`}>
              <div>
                <strong>{cleanLabel(item.inputs.departamento || "Sin dato")}</strong>
                <p>{cleanLabel(item.inputs.provincia || "-")}, {cleanLabel(item.inputs.distrito || "-")}</p>
              </div>
              <div className="prediction-right">
                <span className={item.result.calidad === "Alta Calidad" ? "tag good" : "tag warn"}>{item.result.calidad}</span>
                <small>{item.result.estrellas_visual}</small>
              </div>
            </div>
          ))}
        </article>
      </div>

      <div className="bottom-grid">
        <article className="panel card-chart">
          <h3>Hospedajes por Departamento</h3>
          <div className="horizontal-bars">
            {departamentosDistribution.map((item) => (
              <div key={item.name} className="hbar-row">
                <span>{cleanLabel(item.name)}</span>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${Math.max(10, item.value / 22)}%` }} />
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );

  const renderInversionista = () => (
    <section className="inversionista-grid">
      <article className="panel">
        <h2>Predicción para Inversionistas</h2>
        <p className="muted">Ingresa las caracteristicas del hospedaje que deseas evaluar.</p>

        <form className="form-grid" onSubmit={submitPrediction}>
          <label>
            Departamento
            <select name="departamento" value={investorForm.departamento} onChange={onInvestorChange}>
              <option value="">Selecciona un departamento</option>
              {(catalog.departamentos || []).map((dep) => (
                <option key={dep} value={dep}>{cleanLabel(dep)}</option>
              ))}
            </select>
            {fieldErrors.departamento && <span className="field-error">{fieldErrors.departamento}</span>}
          </label>

          <label>
            Provincia
            <select
              name="provincia"
              value={investorForm.provincia}
              onChange={onInvestorChange}
              disabled={!investorForm.departamento}
            >
              <option value="">Selecciona una provincia</option>
              {provinceOptions.map((prov) => (
                <option key={prov} value={prov}>{cleanLabel(prov)}</option>
              ))}
            </select>
            {fieldErrors.provincia && <span className="field-error">{fieldErrors.provincia}</span>}
          </label>

          <label>
            Distrito
            <select
              name="distrito"
              value={investorForm.distrito}
              onChange={onInvestorChange}
              disabled={!investorForm.provincia}
            >
              <option value="">Selecciona un distrito</option>
              {districtOptions.map((dist) => (
                <option key={dist} value={dist}>{cleanLabel(dist)}</option>
              ))}
            </select>
            {fieldErrors.distrito && <span className="field-error">{fieldErrors.distrito}</span>}
          </label>

          <label>
            Clase
            <select name="clase" value={investorForm.clase} onChange={onInvestorChange}>
              <option value="">Selecciona una clase</option>
              {(catalog.clases || []).map((clase) => (
                <option key={clase} value={clase}>{clase}</option>
              ))}
            </select>
            {fieldErrors.clase && <span className="field-error">{fieldErrors.clase}</span>}
          </label>

          <label>
            Número de Camas
            <input type="number" min="1" name="cama" value={investorForm.cama} onChange={onInvestorChange} />
            {fieldErrors.cama && <span className="field-error">{fieldErrors.cama}</span>}
          </label>

          <label>
            Número de Habitaciones
            <input type="number" min="1" name="habi" value={investorForm.habi} onChange={onInvestorChange} />
            {fieldErrors.habi && <span className="field-error">{fieldErrors.habi}</span>}
          </label>

          {formError && <div className="error-state">{formError}</div>}

          <div className="investor-actions">
            <button className="primary-btn" type="submit" disabled={predictLoading}>
              {predictLoading ? "Prediciendo..." : "Predecir con IA"}
            </button>
            <button className="secondary-btn" type="button" onClick={resetInvestorForm}>
              Nueva Predicción
            </button>
          </div>
        </form>
      </article>

      <article className="panel results-panel">
        <h2>Resultado de la Predicción</h2>

        {!predictResult && !predictLoading && !predictError && (
          <div className="empty-state">Ejecuta una prediccion para ver resultados.</div>
        )}

        {predictLoading && (
          <div className="loading-state">
            <span className="spinner" />
            Procesando modelos y calculando recomendaciones...
          </div>
        )}

        {predictError && <div className="error-state">{predictError}</div>}

        {predictResult && (
          <div className="result-cards-grid">
            <article className="result-card">
              <h4>Calidad Estimada</h4>
              <div className="result-title-row">
                <span className={predictResult.calidad === "Alta Calidad" ? "result-icon success" : "result-icon warning"}>
                  {predictResult.calidad === "Alta Calidad" ? "✓" : "!"}
                </span>
                <p className={predictResult.calidad === "Alta Calidad" ? "text-good" : "text-warn"}>{predictResult.calidad}</p>
              </div>
              <small>{interpretQualityConfidence(predictResult.confianza_alta)}</small>
              <div className="progress-container slim">
                <div className="progress-bar" style={{ width: starsProgressValue(predictResult.confianza_alta) }} />
              </div>
              <small>Confianza: {predictResult.confianza_alta}%</small>
            </article>

            <article className="result-card">
              <h4>Categoría Estimada</h4>
              <p className="stars-display">{predictResult.estrellas_visual}</p>
              <small>{predictResult.estrellas} Estrellas</small>
              <div className="progress-container slim">
                <div className="progress-bar" style={{ width: starsProgressValue(predictResult.confianza_estrellas) }} />
              </div>
              <small>Confianza: {predictResult.confianza_estrellas}%</small>
            </article>

            <article className="result-card recommendation">
              <h4>Recomendación IA</h4>
              <p>{interpretRecommendation(predictResult)}</p>
            </article>
          </div>
        )}
      </article>
    </section>
  );

  const renderTurista = () => (
    <section className="section-grid">
      <article className="panel">
        <h2>Buscar Hospedajes</h2>
        <p className="muted">Filtra por ubicacion, clase y categoria para descubrir opciones recomendadas.</p>
        <div className="filters-row">
          <select value={touristFilter.departamento} onChange={(e) => updateTouristFilter("departamento", e.target.value)}>
            <option value="TODOS">Departamento</option>
            {(dashboardData?.por_departamento || []).map((dep) => <option key={dep.name} value={dep.name}>{dep.name}</option>)}
          </select>
          <select value={touristFilter.provincia} onChange={(e) => updateTouristFilter("provincia", e.target.value)}>
            <option value="TODOS">Provincia</option>
            {touristOptions.provinces.map((prov) => <option key={prov} value={prov}>{prov}</option>)}
          </select>
          <select value={touristFilter.distrito} onChange={(e) => updateTouristFilter("distrito", e.target.value)}>
            <option value="TODOS">Distrito</option>
            {touristOptions.districts.map((dist) => <option key={dist} value={dist}>{dist}</option>)}
          </select>
          <select value={touristFilter.clase} onChange={(e) => updateTouristFilter("clase", e.target.value)}>
            <option value="TODOS">Clase</option>
            {touristOptions.classes.map((clase) => <option key={clase} value={clase}>{clase}</option>)}
          </select>
          <select value={touristFilter.estrellas} onChange={(e) => updateTouristFilter("estrellas", e.target.value)}>
            <option value="TODOS">Estrellas</option>
            {touristOptions.stars.map((star) => <option key={star} value={star}>{star} estrellas</option>)}
          </select>
        </div>

        <div className="investor-actions" style={{ marginTop: 12 }}>
          <label className="tourist-switch">
            <input
              type="checkbox"
              checked={touristPrioritizeIA}
              onChange={(event) => setTouristPrioritizeIA(event.target.checked)}
            />
            <span>Priorizar recomendados por IA</span>
          </label>
          <button type="button" className="primary-btn" onClick={applyTouristAI} disabled={touristAILoading}>
            {touristAILoading ? "Aplicando IA..." : "✨ Recomendar con IA"}
          </button>
        </div>

        {touristRequestError && <div className="error-state" style={{ marginTop: 12 }}>{touristRequestError}</div>}
        {touristAIError && <div className="error-state" style={{ marginTop: 12 }}>{touristAIError}</div>}
        {touristAILoading && <div className="loading-state" style={{ marginTop: 12 }}><span className="spinner" />Analizando hospedajes...</div>}
        {touristLoading && <div className="loading-state" style={{ marginTop: 12 }}><span className="spinner" />Cargando hospedajes...</div>}
        {!touristAILoading && touristVisibleHotels.length === 0 && <div className="empty-state" style={{ marginTop: 12 }}>No se encontraron hospedajes con los filtros seleccionados.</div>}
      </article>

      <div className="tourist-cards-grid">
        {touristVisibleHotels.map((hotel) => (
          <article className="hotel-card" key={hotel.id || hotel.nombre}>
            <img
              src={hotel.imagen || hotelPhoto}
              alt={hotel.nombre_comercial || hotel.nombre}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = hotelPhoto;
              }}
            />
            <div className="hotel-content">
              <h4>{hotel.nombre_comercial || hotel.nombre}</h4>
              <p className="muted">{hotel.ubicacion || `${hotel.distrito}, ${hotel.provincia}, ${hotel.departamento}`}</p>
              <p><strong>Clase:</strong> {hotel.clase}</p>
              <p><strong>Categoría:</strong> {hotel.categoria || starsVisual(hotel.estrellas)}</p>
              <p><strong>Camas / Habitaciones:</strong> {hotel.cama || hotel.camas} / {hotel.habi}</p>
              <p><strong>Teléfono:</strong> {hotel.telefono}</p>
              <p><strong>Correo:</strong> {hotel.email || hotel.correo}</p>
              <p><strong>Web:</strong> {hotel.web}</p>
              {hotel.recomendado_ia !== undefined && (
                <div className="tourist-ia-block">
                  <div className={hotel.recomendado_ia ? "tag good" : "tag warn"}>
                    {hotel.recomendado_ia ? "Recomendado por IA" : "Evaluado por IA"}
                  </div>
                  <div className="tourist-ia-details">
                    <small>Calidad IA: {hotel.calidad_ia}</small>
                    <small>Categoría IA: {hotel.estrellas_visual}</small>
                    <small>Confianza: {Number(hotel.confianza_ia || 0).toFixed(2)}%</small>
                  </div>
                </div>
              )}
              <button type="button" className="secondary-btn">Ver detalles</button>
            </div>
          </article>
        ))}
      </div>

      {touristTotalPages > 1 && (
        <div className="tourist-pagination panel">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setTouristPage((page) => Math.max(1, page - 1))}
            disabled={touristPage === 1}
          >
            Anterior
          </button>
          <span>Página {touristPage} de {touristTotalPages} ({touristTotalItems} resultados, {HOTELS_PAGE_SIZE} por página)</span>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setTouristPage((page) => Math.min(touristTotalPages, page + 1))}
            disabled={touristPage === touristTotalPages}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );

  const renderHistorial = () => (
    <section className="section-grid">
      <article className="panel">
        <h2>Historial de Predicciones</h2>
        {loadingHistory && <p className="muted">Cargando historial...</p>}
        {historyError && <p className="error-state">{historyError}</p>}
        {!loadingHistory && history.length === 0 && <p className="muted">No hay registros por mostrar.</p>}
        {!loadingHistory && history.length > 0 && (
          <div className="history-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Entrada</th>
                  <th>Calidad</th>
                  <th>Estrellas</th>
                  <th>Confianza</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, idx) => (
                  <tr key={`${item.timestamp}-${idx}`}>
                    <td>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}</td>
                    <td>{item.inputs.departamento || "-"} / {item.inputs.clase || "-"}<br />{item.inputs.cama || 0} camas, {item.inputs.habi || 0} hab.</td>
                    <td>{item.result.calidad}</td>
                    <td>{item.result.estrellas_visual}</td>
                    <td>{item.result.confianza_alta}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );

  const renderMapa = () => (
    <section className="section-grid">
      <article className="panel map-full">
        <h2>Mapa de Hoteles</h2>
        <p className="muted">Vista analitica de concentracion hotelera estimada por departamento.</p>
        <div className="map-large-grid">
          <div className="peru-map-wrap large">
            <svg viewBox="0 0 220 310" className="peru-map" role="img" aria-label="Mapa de analitica hotelera">
              <path d="M104 12l34 18 9 24 26 20-12 27 17 18-15 34 8 24-23 29-6 31-27 24-37 8-18-16-22 7-16-19-20-6-3-28 15-22-7-29 14-23-7-30 18-20 17-34 33-17z" fill="#d7e7fb" stroke="#9ab8e4" strokeWidth="2" />
              <path d="M84 102l28 9 8 30-18 16-26-7-7-23z" fill="#1f5dcc" />
              <path d="M122 164l28 8-8 27-18 13-20-10 4-23z" fill="#2f74df" />
              <path d="M75 206l24 11-2 25-22 8-16-13 6-21z" fill="#6ea2eb" />
            </svg>
          </div>
          <div className="map-side-list">
            {departamentosDistribution.map((item) => (
              <div key={item.name} className="map-row">
                <span>{cleanLabel(item.name)}</span>
                <strong>{item.value} hospedajes</strong>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  );

  const renderInicio = () => (
    <section className="section-grid">
      <article className="hero-panel">
        <div>
          <h1>Sistema Inteligente de Clasificacion de Hospedajes</h1>
          <p>
            Plataforma analitica para turismo e inversion. Consulta el dashboard nacional, explora hospedajes y ejecuta
            predicciones con inteligencia artificial en tiempo real.
          </p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={() => setActiveSection("dashboard")}>Ver Dashboard</button>
            <button className="secondary-btn" onClick={() => setActiveSection("inversionista")}>Probar IA</button>
          </div>
        </div>
      </article>
      {renderDashboard()}
    </section>
  );

  const renderAcerca = () => (
    <section className="section-grid">
      <article className="panel">
        <h2>Acerca del Proyecto</h2>
        <p>
          Este sistema integra FastAPI + React para analizar hospedajes del Peru mediante modelos de IA entrenados para
          estimar calidad y categoria de estrellas. El objetivo es apoyar decisiones de viaje y de inversion con una
          interfaz moderna, clara y accionable.
        </p>
        <ul className="about-list">
          <li>Backend con modelos preentrenados y persistencia en MongoDB.</li>
          <li>Frontend dashboard con visualizaciones y flujo inversionista/turista.</li>
          <li>Historial de predicciones para auditoria de decisiones.</li>
        </ul>
      </article>
    </section>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "inicio":
        return renderInicio();
      case "dashboard":
        return renderDashboard();
      case "turista":
        return renderTurista();
      case "inversionista":
        return renderInversionista();
      case "historial":
        return renderHistorial();
      case "mapa":
        return renderMapa();
      case "acerca":
        return renderAcerca();
      default:
        return renderInicio();
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">H</div>
          <div>
            <strong>Hotel IA Peru</strong>
            <small>Analitica Inteligente</small>
          </div>
        </div>

        <nav>
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={activeSection === item.id ? "nav-btn active" : "nav-btn"}
            >
              <span className="dot" /> {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h2>{menuItems.find((item) => item.id === activeSection)?.label || "Inicio"}</h2>
            <p>Prediccion de calidad y categoria de hospedajes con inteligencia artificial.</p>
          </div>
        </header>

        {renderSection()}
      </main>
    </div>
  );
}

export default App;
