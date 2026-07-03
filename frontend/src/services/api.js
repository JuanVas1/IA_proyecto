import axios from "axios";

const API_BASE = "http://localhost:8000";

export async function predictHotel(data) {
  const payload = {
    cama: Number(data.cama),
    habi: Number(data.habi),
    departamento: data.departamento,
    provincia: data.provincia,
    distrito: data.distrito,
    clase: data.clase,
  };

  const response = await axios.post(`${API_BASE}/predict`, payload);
  return response.data;
}

export async function getHistory() {
  const response = await axios.get(`${API_BASE}/history`);
  return response.data.history || [];
}

export async function getDashboard(departamento) {
  const params = {};
  if (departamento && departamento !== "TODOS") {
    params.departamento = departamento;
  }
  const response = await axios.get(`${API_BASE}/dashboard`, { params });
  return response.data;
}

export async function getHotels(params = {}) {
  const response = await axios.get(`${API_BASE}/hoteles`, { params });
  return response.data;
}

export async function getSimilarHotels(hotelId, k = 6, departamento) {
  const response = await axios.get(`${API_BASE}/hoteles/similares`, {
    params: { hotel_id: hotelId, k, departamento },
  });
  return response.data.items || [];
}

export async function getBayesProfile(departamento, clase) {
  const response = await axios.get(`${API_BASE}/hoteles/perfil-bayes`, {
    params: { departamento, clase },
  });
  return response.data;
}

export async function recommendTourist(hoteles) {
  const response = await axios.post(`${API_BASE}/recommend-tourist`, { hoteles });
  return response.data.hoteles || [];
}
