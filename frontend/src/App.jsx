import { useEffect, useMemo, useState } from "react";
import { getDashboard, getHistory, getHotels, getLocationsCatalog, getSimilarHotels, predictHotel, recommendTourist } from "./services/api";
import fallbackHotel from "./assets/fallbacks/hotel.svg";
import fallbackHostal from "./assets/fallbacks/hostal.svg";
import fallbackResort from "./assets/fallbacks/resort.svg";
import fallbackApartHotel from "./assets/fallbacks/apart-hotel.svg";
import fallbackAlbergue from "./assets/fallbacks/albergue.svg";
import peruDepartmentsGeo from "./assets/peru-departamentos.json";
import "./App.css";

const menuItems = [
  { id: "inicio", label: "Inicio" },
  { id: "dashboard", label: "Dashboard" },
  { id: "inversionista", label: "Inversionista" },
  { id: "historial", label: "Historial" },
];

const SYSTEM_MODULES = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "KPIs, gráficos y mapa analítico por departamento para monitoreo nacional.",
  },
  {
    id: "turista",
    title: "Módulo Turista",
    description: "Explora hospedajes por departamento y recibe sugerencias con apoyo de IA.",
  },
  {
    id: "inversionista",
    title: "Módulo Inversionista",
    description: "Evalúa viabilidad y calidad estimada de nuevos proyectos de hospedaje.",
  },
  {
    id: "historial",
    title: "Historial",
    description: "Consulta predicciones recientes para auditoría y seguimiento de decisiones.",
  },
  {
    id: "mapa",
    title: "Mapa de Hoteles",
    description: "Visualiza concentración geográfica y distribución territorial de hospedajes.",
  },
];
const HOTELS_PAGE_SIZE = 25;
const MAP_WIDTH = 460;
const MAP_HEIGHT = 620;

const MAP_LEVEL_COLORS = {
  "MUY ALTO": "#0f3b83",
  ALTO: "#1f63c9",
  MEDIO: "#4f94ea",
  BAJO: "#95c9ff",
  "MUY BAJO": "#dfe6ef",
};

const FALLBACK_BY_CLASS = {
  HOTEL: fallbackHotel,
  HOSTAL: fallbackHostal,
  RESORT: fallbackResort,
  "APART HOTEL": fallbackApartHotel,
  ALBERGUE: fallbackAlbergue,
};

const REMOTE_IMAGES_BY_CLASS = {
  HOTEL: [
    "https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/164595/pexels-photo-164595.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/803975/pexels-photo-803975.jpeg?auto=compress&cs=tinysrgb&w=1200",
  ],
  HOSTAL: [
    "https://images.pexels.com/photos/271643/pexels-photo-271643.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/775219/pexels-photo-775219.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/6585750/pexels-photo-6585750.jpeg?auto=compress&cs=tinysrgb&w=1200",
  ],
  RESORT: [
    "https://images.pexels.com/photos/338504/pexels-photo-338504.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/803975/pexels-photo-803975.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1200",
  ],
  "APART HOTEL": [
    "https://images.pexels.com/photos/271643/pexels-photo-271643.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/164595/pexels-photo-164595.jpeg?auto=compress&cs=tinysrgb&w=1200",
  ],
  ALBERGUE: [
    "https://images.pexels.com/photos/6585750/pexels-photo-6585750.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/775219/pexels-photo-775219.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "https://images.pexels.com/photos/338504/pexels-photo-338504.jpeg?auto=compress&cs=tinysrgb&w=1200",
  ],
};

function normalizeDepartmentKey(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ñ/g, "N");
}

function getFeatureDepartmentName(feature) {
  return feature?.properties?.NOMBDEP || feature?.properties?.name || "";
}

function getGeometryRings(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function buildGeoBounds(features) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const feature of features) {
    for (const ring of getGeometryRings(feature.geometry)) {
      for (const point of ring) {
        const [lon, lat] = point;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  return { minLon, maxLon, minLat, maxLat };
}

function geometryToPath(geometry, project) {
  const rings = getGeometryRings(geometry);
  const parts = [];

  for (const ring of rings) {
    if (!ring.length) continue;
    let path = "";
    ring.forEach(([lon, lat], index) => {
      const [x, y] = project(lon, lat);
      path += `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
    });
    path += "Z";
    parts.push(path);
  }

  return parts.join(" ");
}

function quantile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[position];
}

function getMapIntensityLevel(value, thresholds) {
  if (value >= thresholds.q80) return "MUY ALTO";
  if (value >= thresholds.q60) return "ALTO";
  if (value >= thresholds.q40) return "MEDIO";
  if (value >= thresholds.q20) return "BAJO";
  return "MUY BAJO";
}

function imageFallbackForClass(hotelClass) {
  const key = String(hotelClass || "").trim().toUpperCase();
  return FALLBACK_BY_CLASS[key] || fallbackHotel;
}

function imageRemoteForClass(hotelClass, seed = 0) {
  const key = String(hotelClass || "").trim().toUpperCase();
  const list = REMOTE_IMAGES_BY_CLASS[key] || REMOTE_IMAGES_BY_CLASS.HOTEL;
  const numericSeed = Number(seed) || 0;
  const index = Math.abs(numericSeed) % list.length;
  return list[index];
}

function isInvalidImageSource(source) {
  const value = String(source || "").trim().toLowerCase();
  if (!value) return true;
  return value.includes("placeholder") || value.includes("undefined") || value.includes("null");
}

function imageSourceForHotel(hotel) {
  if (!isInvalidImageSource(hotel?.imagen)) {
    return hotel.imagen;
  }
  return imageRemoteForClass(hotel?.clase, hotel?.id || hotel?.nombre_comercial?.length || 0);
}

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

function buildInvestorErrors(
  form,
  {
    requireProvincia = true,
    requireDistrito = true,
  } = {}
) {
  const errors = {};
  if (!form.departamento) errors.departamento = "Selecciona un departamento.";
  if (requireProvincia && !form.provincia) errors.provincia = "Selecciona una provincia.";
  if (requireDistrito && !form.distrito) errors.distrito = "Selecciona un distrito.";
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

function mixHotelsForBrowse(hotels) {
  const buckets = new Map();
  for (const hotel of hotels) {
    const key = String(hotel.clase || "OTROS");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(hotel);
  }

  const classes = [...buckets.keys()].sort();
  const mixed = [];
  let pending = true;
  let index = 0;

  while (pending) {
    pending = false;
    for (const clase of classes) {
      const list = buckets.get(clase) || [];
      if (index < list.length) {
        mixed.push(list[index]);
        pending = true;
      }
    }
    index += 1;
  }

  return mixed;
}

function sortByQualityThenConfidence(hotels) {
  return [...hotels].sort((a, b) => {
    const aQuality = a.calidad_ia === "Alta Calidad" ? 0 : 1;
    const bQuality = b.calidad_ia === "Alta Calidad" ? 0 : 1;
    if (aQuality !== bQuality) return aQuality - bQuality;

    const confDiff = Number(b.confianza_ia || 0) - Number(a.confianza_ia || 0);
    if (confDiff !== 0) return confDiff;

    return Number(b.estrellas_ia || b.estrellas || 0) - Number(a.estrellas_ia || a.estrellas || 0);
  });
}

function hotelUniqueKey(hotel = {}) {
  const id = String(hotel?.id || "").trim();
  const name = String(hotel?.nombre_comercial || hotel?.nombre || "").trim().toUpperCase();
  const dep = String(hotel?.departamento || "").trim().toUpperCase();
  const prov = String(hotel?.provincia || "").trim().toUpperCase();
  const dist = String(hotel?.distrito || "").trim().toUpperCase();
  const clase = String(hotel?.clase || "").trim().toUpperCase();

  if (id) return `id:${id}`;
  return `n:${name}|d:${dep}|p:${prov}|di:${dist}|c:${clase}`;
}

const TOURIST_CLASS_PRIORITY = {
  HOTEL: 0,
  "APART HOTEL": 1,
  HOSTAL: 2,
  ALBERGUE: 3,
};

function normalizeTouristClass(value = "") {
  return String(value || "").trim().toUpperCase();
}

function extractCategoryValue(hotel) {
  const fromLabel = String(hotel?.categoria || "").match(/(\d+)/);
  if (fromLabel) {
    return Math.max(1, Math.min(5, Number(fromLabel[1]) || 1));
  }
  return Math.max(1, Math.min(5, Number(hotel?.estrellas_ia || hotel?.estrellas || 1) || 1));
}

function sortTouristByCategoryAndClass(hotels) {
  return [...hotels].sort((left, right) => {
    const categoryDiff = extractCategoryValue(right) - extractCategoryValue(left);
    if (categoryDiff !== 0) return categoryDiff;

    const leftClass = normalizeTouristClass(left?.clase);
    const rightClass = normalizeTouristClass(right?.clase);
    const leftPriority = TOURIST_CLASS_PRIORITY[leftClass] ?? 99;
    const rightPriority = TOURIST_CLASS_PRIORITY[rightClass] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    return Number(right?.prob_alta_calidad_bayes || 0) - Number(left?.prob_alta_calidad_bayes || 0);
  });
}

function buildTouristCombinedList(primaryHotels, fallbackHotels, minItems = 10) {
  const preferredClasses = new Set(Object.keys(TOURIST_CLASS_PRIORITY));
  const selected = [];
  const seen = new Set();

  const addHotels = (hotels) => {
    for (const hotel of hotels) {
      const key = hotelUniqueKey(hotel);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(hotel);
    }
  };

  const preferredPrimary = primaryHotels.filter((hotel) => preferredClasses.has(normalizeTouristClass(hotel?.clase)));
  addHotels(sortTouristByCategoryAndClass(preferredPrimary));

  if (selected.length < minItems) {
    const preferredFallback = fallbackHotels.filter((hotel) => preferredClasses.has(normalizeTouristClass(hotel?.clase)));
    addHotels(sortTouristByCategoryAndClass(preferredFallback));
  }

  if (selected.length < minItems) {
    addHotels(sortTouristByCategoryAndClass(primaryHotels));
  }

  if (selected.length < minItems) {
    addHotels(sortTouristByCategoryAndClass(fallbackHotels));
  }

  return sortTouristByCategoryAndClass(selected);
}

function touristStarsByIA(hotel) {
  if (hotel.estrellas_visual) return hotel.estrellas_visual;
  if (hotel.recomendado_ia !== undefined) return hotel.recomendado_ia ? "★★★★★" : "★★★☆☆";
  const bayes = Number(hotel.prob_alta_calidad_bayes || 0);
  if (bayes >= 70) return "★★★★★";
  if (bayes >= 50) return "★★★★☆";
  return starsVisual(hotel.estrellas);
}

function App() {
  const [activeSection, setActiveSection] = useState("inversionista");
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardSelectedDepartment, setDashboardSelectedDepartment] = useState("TODOS");
  const [mapTooltip, setMapTooltip] = useState(null);

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
  });
  const [touristPrioritizeIA, setTouristPrioritizeIA] = useState(false);
  const [touristAppliedFilter, setTouristAppliedFilter] = useState({ departamento: "TODOS" });
  const [touristAppliedPrioritizeIA, setTouristAppliedPrioritizeIA] = useState(false);
  const [touristAILoading, setTouristAILoading] = useState(false);
  const [touristAIError, setTouristAIError] = useState(null);
  const [touristAHotels, setTouristAHotels] = useState([]);
  const [touristHotels, setTouristHotels] = useState([]);
  const [touristFeaturedHotels, setTouristFeaturedHotels] = useState([]);
  const [touristSimilarHotels, setTouristSimilarHotels] = useState([]);
  const [touristLoading, setTouristLoading] = useState(false);
  const [touristRequestError, setTouristRequestError] = useState(null);
  const [catalog, setCatalog] = useState({ departamentos: [], clases: [], estrellas: [], location_tree: {} });
  const [locationCatalog, setLocationCatalog] = useState({ departamentos: [], location_tree: {} });
  const [touristTotalPages, setTouristTotalPages] = useState(1);
  const [touristTotalItems, setTouristTotalItems] = useState(0);
  const [touristPage, setTouristPage] = useState(1);
  const hideSidebar = activeSection === "turista";

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

  const fetchDashboard = async (department = "TODOS") => {
    setDashboardLoading(true);
    try {
      const data = await getDashboard(department);
      setDashboardData(data);
      setDashboardSelectedDepartment(data?.filtro_departamento || "TODOS");
    } catch (error) {
      setDashboardData(null);
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchLocationCatalog = async () => {
    try {
      const data = await getLocationsCatalog();
      setLocationCatalog({
        departamentos: data?.departamentos || [],
        location_tree: data?.location_tree || {},
      });
    } catch (error) {
      setLocationCatalog({ departamentos: [], location_tree: {} });
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchDashboard("TODOS");
    fetchLocationCatalog();
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
      // Tourist flow only searches by department.

      const response = await getHotels(params);
      setTouristHotels(response.items || []);
      setTouristFeaturedHotels(response.destacados || []);
      setTouristSimilarHotels([]);
      if (response.catalog) {
        setCatalog(response.catalog);
      }
      setTouristTotalPages(Number(response.total_pages || 1));
      setTouristTotalItems(Number(response.total || 0));
    } catch (error) {
      setTouristHotels([]);
      setTouristFeaturedHotels([]);
      setTouristSimilarHotels([]);
      setTouristTotalPages(1);
      setTouristTotalItems(0);
      setTouristRequestError("No se pudo cargar los hospedajes desde el backend.");
    } finally {
      setTouristLoading(false);
    }
  };

  useEffect(() => {
    fetchTouristHotels(touristAppliedFilter, touristPage);
  }, [touristAppliedFilter, touristPage]);

  useEffect(() => {
    const fetchSimilar = async () => {
      const selected = (touristAHotels.length > 0 ? touristAHotels : touristHotels)[0];
      if (!selected?.id) {
        setTouristSimilarHotels([]);
        return;
      }
      try {
        const scopeDep = touristAppliedFilter.departamento !== "TODOS" ? touristAppliedFilter.departamento : selected.departamento;
        const data = await getSimilarHotels(selected.id, 6, scopeDep);
        setTouristSimilarHotels(data);
      } catch (error) {
        setTouristSimilarHotels([]);
      }
    };

    fetchSimilar();
  }, [touristAHotels, touristAppliedFilter.departamento, touristHotels]);

  const provinceOptions = useMemo(() => {
    if (!investorForm.departamento) {
      return [];
    }
    const depKey = normalizeDepartmentKey(investorForm.departamento);
    return Object.keys(locationCatalog.location_tree?.[depKey] || {});
  }, [locationCatalog.location_tree, investorForm.departamento]);

  const districtOptions = useMemo(() => {
    if (!investorForm.departamento || !investorForm.provincia) {
      return [];
    }
    const depKey = normalizeDepartmentKey(investorForm.departamento);
    return locationCatalog.location_tree?.[depKey]?.[investorForm.provincia] || [];
  }, [locationCatalog.location_tree, investorForm.departamento, investorForm.provincia]);

  const peruDepartmentOptions = useMemo(() => {
    const features = peruDepartmentsGeo?.features || [];
    const byKey = new Map();

    for (const feature of features) {
      const name = String(getFeatureDepartmentName(feature) || "").trim();
      if (!name) continue;
      const key = normalizeDepartmentKey(name);
      if (!byKey.has(key)) {
        byKey.set(key, name);
      }
    }

    return [...byKey.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, []);

  const allDepartmentOptions = useMemo(() => {
    const byKey = new Map();

    for (const dep of [...peruDepartmentOptions, ...(locationCatalog.departamentos || []), ...(catalog.departamentos || [])]) {
      const value = String(dep || "").trim();
      if (!value) continue;
      const key = normalizeDepartmentKey(value);
      if (!byKey.has(key)) {
        byKey.set(key, value);
      }
    }

    return [...byKey.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [catalog.departamentos, locationCatalog.departamentos, peruDepartmentOptions]);

  const filteredTuristaData = useMemo(() => {
    return touristAHotels.length > 0 ? touristAHotels : touristHotels;
  }, [touristAHotels, touristHotels]);

  const touristOptions = useMemo(() => ({ departamentos: allDepartmentOptions }), [allDepartmentOptions]);

  const touristVisibleHotels = useMemo(() => {
    const touristPool = touristAHotels.length > 0
      ? (touristAppliedPrioritizeIA ? sortByQualityThenConfidence(filteredTuristaData) : filteredTuristaData)
      : filteredTuristaData;

    const baseList = buildTouristCombinedList(touristPool, [], 10);
    const shouldExcludeFeaturedFromMain = touristAppliedPrioritizeIA && touristFeaturedHotels.length > 0;
    if (!shouldExcludeFeaturedFromMain) {
      return baseList;
    }

    const featuredKeys = new Set((touristFeaturedHotels || []).map((hotel) => hotelUniqueKey(hotel)));
    return baseList.filter((hotel) => !featuredKeys.has(hotelUniqueKey(hotel)));
  }, [filteredTuristaData, touristAHotels, touristAppliedPrioritizeIA, touristFeaturedHotels]);

  const visibleModuleCards = useMemo(
    () => SYSTEM_MODULES.filter((module) => module.id !== "turista"),
    []
  );

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
  const mapDepartments = dashboardData?.mapa_departamentos || [];
  const topDepartments = dashboardData?.top_departamentos || [];

  const peruMapPaths = useMemo(() => {
    const features = peruDepartmentsGeo?.features || [];
    if (!features.length) return [];

    const bounds = buildGeoBounds(features);
    const lonRange = Math.max(0.0001, bounds.maxLon - bounds.minLon);
    const latRange = Math.max(0.0001, bounds.maxLat - bounds.minLat);
    const padding = 26;
    const width = MAP_WIDTH - padding * 2;
    const height = MAP_HEIGHT - padding * 2;

    const project = (lon, lat) => {
      const x = padding + ((lon - bounds.minLon) / lonRange) * width;
      const y = padding + (1 - (lat - bounds.minLat) / latRange) * height;
      return [x, y];
    };

    return features.map((feature, index) => {
      const name = getFeatureDepartmentName(feature);
      return {
        name,
        key: normalizeDepartmentKey(name),
        index,
        path: geometryToPath(feature.geometry, project),
      };
    });
  }, []);

  const mapStatsByDepartment = useMemo(() => {
    const next = new Map();
    for (const item of mapDepartments) {
      next.set(normalizeDepartmentKey(item.name), item);
    }
    return next;
  }, [mapDepartments]);

  const mapThresholds = useMemo(() => {
    const values = mapDepartments.map((item) => Number(item.value) || 0).filter((value) => value >= 0);
    return {
      q20: quantile(values, 0.2),
      q40: quantile(values, 0.4),
      q60: quantile(values, 0.6),
      q80: quantile(values, 0.8),
    };
  }, [mapDepartments]);

  const handleMapDepartmentClick = async (departmentName) => {
    const nextDepartment = normalizeDepartmentKey(departmentName) === normalizeDepartmentKey(dashboardSelectedDepartment)
      ? "TODOS"
      : departmentName;
    await fetchDashboard(nextDepartment);
  };

  const handleMapDepartmentHover = (event, departmentName) => {
    const stats = mapStatsByDepartment.get(normalizeDepartmentKey(departmentName)) || {
      name: departmentName,
      value: 0,
      promedio_estrellas: 0,
      alta_calidad: 0,
    };

    const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!svgRect) return;

    setMapTooltip({
      x: event.clientX - svgRect.left + 10,
      y: event.clientY - svgRect.top + 10,
      data: stats,
    });
  };

  const hideMapTooltip = () => setMapTooltip(null);

  const submitPrediction = async (event) => {
    event.preventDefault();
    const nextErrors = buildInvestorErrors(investorForm, {
      requireProvincia: true,
      requireDistrito: true,
    });
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
      await fetchDashboard(dashboardSelectedDepartment);
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
    setTouristFilter((current) => ({ ...current, [key]: value }));
    setTouristAIError(null);
  };

  const runTouristSearch = () => {
    setTouristPage(1);
    setTouristAHotels([]);
    setTouristSimilarHotels([]);
    setTouristAIError(null);
    setTouristAppliedFilter({ ...touristFilter });
    setTouristAppliedPrioritizeIA(touristPrioritizeIA);
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
      setTouristAHotels(touristAppliedPrioritizeIA ? sortTouristRecommendations(enrichedHotels) : enrichedHotels);
    } catch (error) {
      setTouristAIError("No se pudo aplicar la recomendación IA. Verifica que FastAPI esté ejecutándose.");
    } finally {
      setTouristAILoading(false);
    }
  };

  useEffect(() => {
    if (!touristAppliedPrioritizeIA || touristHotels.length === 0 || touristAILoading) {
      if (!touristAppliedPrioritizeIA) {
        setTouristAHotels([]);
      }
      return;
    }
    applyTouristAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touristAppliedPrioritizeIA, touristHotels, touristAppliedFilter.departamento, touristPage]);

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
          <h3>
            Distribucion de Hospedajes por Categoria
            {dashboardSelectedDepartment !== "TODOS" ? ` (${cleanLabel(dashboardSelectedDepartment)})` : ""}
          </h3>
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
          <h3>
            Hospedajes por Departamento
            {dashboardSelectedDepartment !== "TODOS" ? ` (${cleanLabel(dashboardSelectedDepartment)})` : ""}
          </h3>
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

        <article className="panel map-card map-card-compact">
          <h3>Mapa de Hospedajes por Departamento</h3>
          <div className="map-filter-row">
            <span className="muted">
              {dashboardSelectedDepartment === "TODOS"
                ? "Vista nacional"
                : `Filtrado por: ${cleanLabel(dashboardSelectedDepartment)}`}
            </span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => fetchDashboard("TODOS")}
              disabled={dashboardLoading || dashboardSelectedDepartment === "TODOS"}
            >
              Ver todo Peru
            </button>
          </div>

          <div className="map-analytics-layout">
            <div className="peru-map-wrap interactive" onMouseLeave={hideMapTooltip}>
              <svg
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                className="peru-map analytic"
                role="img"
                aria-label="Mapa analitico del Peru por departamentos"
              >
                {peruMapPaths.map((shape) => {
                  const stats = mapStatsByDepartment.get(shape.key) || {
                    name: shape.name,
                    value: 0,
                    promedio_estrellas: 0,
                    alta_calidad: 0,
                  };
                  const level = getMapIntensityLevel(Number(stats.value || 0), mapThresholds);
                  const isSelected = normalizeDepartmentKey(dashboardSelectedDepartment) === shape.key;

                  return (
                    <path
                      key={shape.key}
                      d={shape.path}
                      className={`dept-shape ${isSelected ? "selected" : ""}`}
                      style={{
                        fill: MAP_LEVEL_COLORS[level],
                        animationDelay: `${shape.index * 16}ms`,
                      }}
                      onMouseMove={(event) => handleMapDepartmentHover(event, shape.name)}
                      onClick={() => handleMapDepartmentClick(shape.name)}
                    >
                      <title>{cleanLabel(shape.name)}</title>
                    </path>
                  );
                })}
              </svg>

              {mapTooltip && (
                <div className="map-tooltip" style={{ left: mapTooltip.x, top: mapTooltip.y }}>
                  <strong>{cleanLabel(mapTooltip.data.name)}</strong>
                  <span>Hospedajes: {Number(mapTooltip.data.value || 0).toLocaleString("es-PE")}</span>
                  <span>Promedio de estrellas: {Number(mapTooltip.data.promedio_estrellas || 0).toFixed(2)}</span>
                  <span>Alta Calidad: {Number(mapTooltip.data.alta_calidad || 0).toFixed(2)}%</span>
                </div>
              )}
            </div>

            <div className="legend legend-vertical">
              {[
                "MUY ALTO",
                "ALTO",
                "MEDIO",
                "BAJO",
                "MUY BAJO",
              ].map((level) => (
                <span key={level}>
                  <i className="legend-dot" style={{ background: MAP_LEVEL_COLORS[level] }} />
                  {cleanLabel(level)}
                </span>
              ))}
            </div>
          </div>
        </article>

        <article className="panel map-top-list-panel">
          <h3>Top 5 departamentos con mayor número de hospedajes</h3>
          <div className="map-side-list">
            {topDepartments.map((item, idx) => (
              <div key={item.name} className="map-row">
                <span>{idx + 1}. {cleanLabel(item.name)}</span>
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
              {allDepartmentOptions.map((dep) => (
                <option key={dep} value={dep}>{cleanLabel(dep)}</option>
              ))}
            </select>
            {fieldErrors.departamento && <span className="field-error">{fieldErrors.departamento}</span>}
          </label>

          <label>
            Provincia
            {provinceOptions.length > 0 ? (
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
            ) : (
              <input
                type="text"
                name="provincia"
                value={investorForm.provincia}
                onChange={onInvestorChange}
                placeholder="Escribe la provincia"
                disabled={!investorForm.departamento}
              />
            )}
            {fieldErrors.provincia && <span className="field-error">{fieldErrors.provincia}</span>}
          </label>

          <label>
            Distrito
            {districtOptions.length > 0 ? (
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
            ) : (
              <input
                type="text"
                name="distrito"
                value={investorForm.distrito}
                onChange={onInvestorChange}
                placeholder="Escribe el distrito"
                disabled={!investorForm.provincia}
              />
            )}
            {fieldErrors.distrito && <span className="field-error">{fieldErrors.distrito}</span>}
          </label>

          <label>
            Clase
            <select name="clase" value={investorForm.clase} onChange={onInvestorChange}>
              <option value="">Selecciona una clase</option>
              {["Hotel", "Albergue", "Hostal", "Apart Hotel"].map((clase) => (
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
      <article className="panel tourist-search-panel">
        <h2>Buscador de Viajes</h2>
        <p className="muted">Encuentra hospedajes por departamento y activa IA para priorizar los mejores.</p>
        <div className="tourist-search-grid">
          <label>
            Departamento
            <select value={touristFilter.departamento} onChange={(e) => updateTouristFilter("departamento", e.target.value)}>
              <option value="TODOS">Todos</option>
              {touristOptions.departamentos.map((dep) => <option key={dep} value={dep}>{cleanLabel(dep)}</option>)}
            </select>
          </label>
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
          <button type="button" className="primary-btn" onClick={runTouristSearch}>
            Buscar
          </button>
        </div>

        {touristRequestError && <div className="error-state" style={{ marginTop: 12 }}>{touristRequestError}</div>}
        {touristAIError && <div className="error-state" style={{ marginTop: 12 }}>{touristAIError}</div>}
        {touristAILoading && <div className="loading-state" style={{ marginTop: 12 }}><span className="spinner" />Analizando hospedajes...</div>}
        {touristLoading && <div className="loading-state" style={{ marginTop: 12 }}><span className="spinner" />Cargando hospedajes...</div>}
        {!touristAILoading && touristVisibleHotels.length === 0 && <div className="empty-state" style={{ marginTop: 12 }}>No se encontraron hospedajes con los filtros seleccionados.</div>}
      </article>

      {touristAppliedPrioritizeIA && touristFeaturedHotels.length > 0 && (
        <article className="panel tourist-featured-panel">
          <h3>Hospedajes Garantizados de Alta Calidad en todo el país</h3>
          <div className="tourist-cards-grid">
            {touristFeaturedHotels.map((hotel) => (
              <article className="hotel-card" key={`featured-${hotel.id}`}>
                <img
                  src={imageSourceForHotel(hotel)}
                  alt={hotel.nombre_comercial || hotel.nombre}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = imageFallbackForClass(hotel.clase);
                  }}
                />
                <div className="hotel-content">
                  <h4>{hotel.nombre_comercial || hotel.nombre}</h4>
                  <p className="muted">{hotel.ubicacion || `${hotel.distrito}, ${hotel.provincia}, ${hotel.departamento}`}</p>
                  <p><strong>Clase:</strong> {hotel.clase}</p>
                  <p><strong>Estrellas IA:</strong> {touristStarsByIA(hotel)}</p>
                  <div className="tourist-ia-block">
                    <div className="tag good">Garantizado Alta Calidad</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>
      )}

      <div className="tourist-cards-grid">
        {touristVisibleHotels.map((hotel) => (
          <article className="hotel-card" key={hotel.id || hotel.nombre}>
            <img
              src={imageSourceForHotel(hotel)}
              alt={hotel.nombre_comercial || hotel.nombre}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = imageFallbackForClass(hotel.clase);
              }}
            />
            <div className="hotel-content">
              <h4>{hotel.nombre_comercial || hotel.nombre}</h4>
              <p className="muted">{hotel.ubicacion || `${hotel.distrito}, ${hotel.provincia}, ${hotel.departamento}`}</p>
              <p><strong>Clase:</strong> {hotel.clase}</p>
              <p><strong>Categoría:</strong> {hotel.categoria || starsVisual(hotel.estrellas)}</p>
              <p><strong>Estrellas IA:</strong> {touristStarsByIA(hotel)}</p>
              <p><strong>Camas / Habitaciones:</strong> {hotel.cama || hotel.camas} / {hotel.habi}</p>
              <p><strong>Teléfono:</strong> {hotel.telefono}</p>
              <p><strong>Correo:</strong> {hotel.email || hotel.correo}</p>
              <p><strong>Web:</strong> {hotel.web}</p>
              {hotel.prob_alta_calidad_bayes !== undefined && (
                <p><strong>Prob. Bayes:</strong> {Number(hotel.prob_alta_calidad_bayes || 0).toFixed(1)}%</p>
              )}
              {hotel.calidad_ia && (
                <div className={hotel.calidad_ia === "Alta Calidad" ? "tag good" : "tag warn"}>
                  {hotel.calidad_ia}
                </div>
              )}
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

      {touristAppliedPrioritizeIA && touristSimilarHotels.length > 0 && (
        <article className="panel tourist-featured-panel">
          <h3>Hospedajes similares y con la misma garantía de calidad que te sugerimos considerar</h3>
          <div className="tourist-cards-grid">
            {touristSimilarHotels.map((hotel) => (
              <article className="hotel-card" key={`similar-${hotel.id}`}>
                <img
                  src={imageSourceForHotel(hotel)}
                  alt={hotel.nombre_comercial || hotel.nombre}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = imageFallbackForClass(hotel.clase);
                  }}
                />
                <div className="hotel-content">
                  <h4>{hotel.nombre_comercial || hotel.nombre}</h4>
                  <p className="muted">{hotel.ubicacion || `${hotel.distrito}, ${hotel.provincia}, ${hotel.departamento}`}</p>
                  <p><strong>Clase:</strong> {hotel.clase}</p>
                  <p><strong>Similitud por IA:</strong> {Number(hotel.similitud_ia || 0).toFixed(1)}%</p>
                  <p className="muted">{hotel.distancia_explicacion}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      )}

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
            Plataforma analitica para turismo e inversion. Selecciona un perfil de trabajo y accede a los modulos del sistema.
          </p>

          <div className="hero-actions" role="group" aria-label="Accesos rapidos por perfil">
            <button
              type="button"
              className="primary-btn"
              onClick={() => setActiveSection("inversionista")}
            >
              Ir a Inversionista
            </button>
            <button type="button" className="secondary-btn" onClick={() => setActiveSection("turista")}>Ir a Pestaña Turística</button>
          </div>
        </div>
      </article>

      <article className="panel modules-panel">
        <h3>Modulos del Sistema</h3>
        <div className="modules-grid">
          {visibleModuleCards.map((module) => (
            <button
              key={module.id}
              type="button"
              className="module-card"
              onClick={() => setActiveSection(module.id)}
            >
              <strong>{module.title}</strong>
              <p>{module.description}</p>
            </button>
          ))}
        </div>
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
      default:
        return renderInicio();
    }
  };

  return (
    <div className="layout">
      {!hideSidebar && <aside className="sidebar">
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
      </aside>}

      <main className={hideSidebar ? "content no-sidebar" : "content"}>
        <header className="topbar">
          <div className="topbar-row">
            <div>
              <h2>
                {menuItems.find((item) => item.id === activeSection)?.label
                  || (activeSection === "turista"
                    ? "Turista"
                    : activeSection === "mapa"
                      ? "Mapa de Hoteles"
                      : "Inicio")}
              </h2>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setActiveSection(activeSection === "turista" ? "inversionista" : "turista")}
            >
              {activeSection === "turista" ? "Volver a Inversionista" : "Abrir Pestaña Turística"}
            </button>
          </div>
          <div>
            <p>Prediccion de calidad y categoria de hospedajes con inteligencia artificial.</p>
          </div>
        </header>

        {renderSection()}
      </main>
    </div>
  );
}

export default App;
