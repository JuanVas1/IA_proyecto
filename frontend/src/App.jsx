import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [userMode, setUserMode] = useState('turista') // 'turista' or 'inversionista'
  const [formData, setFormData] = useState({
    cama: 1,
    habi: 1,
    departamento: 'DEPARTAMENTO_LIMA',
    clase: 'CLASE_Hotel'
  })
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const departamentos = [
    { value: 'DEPARTAMENTO_AMAZONAS', label: 'Amazonas' },
    { value: 'DEPARTAMENTO_NCASH', label: 'Áncash' },
    { value: 'DEPARTAMENTO_APURMAC', label: 'Apurímac' },
    { value: 'DEPARTAMENTO_AREQUIPA', label: 'Arequipa' },
    { value: 'DEPARTAMENTO_AYACUCHO', label: 'Ayacucho' },
    { value: 'DEPARTAMENTO_CAJAMARCA', label: 'Cajamarca' },
    { value: 'DEPARTAMENTO_CALLAO', label: 'Callao' },
    { value: 'DEPARTAMENTO_CUSCO', label: 'Cusco' },
    { value: 'DEPARTAMENTO_HUANCAVELICA', label: 'Huancavelica' },
    { value: 'DEPARTAMENTO_HUNUCO', label: 'Huánuco' },
    { value: 'DEPARTAMENTO_ICA', label: 'Ica' },
    { value: 'DEPARTAMENTO_JUNN', label: 'Junín' },
    { value: 'DEPARTAMENTO_LA LIBERTAD', label: 'La Libertad' },
    { value: 'DEPARTAMENTO_LAMBAYEQUE', label: 'Lambayeque' },
    { value: 'DEPARTAMENTO_LIMA', label: 'Lima' },
    { value: 'DEPARTAMENTO_LORETO', label: 'Loreto' },
    { value: 'DEPARTAMENTO_MADRE DE DIOS', label: 'Madre de Dios' },
    { value: 'DEPARTAMENTO_MOQUEGUA', label: 'Moquegua' },
    { value: 'DEPARTAMENTO_PASCO', label: 'Pasco' },
    { value: 'DEPARTAMENTO_PIURA', label: 'Piura' },
    { value: 'DEPARTAMENTO_PUNO', label: 'Puno' },
    { value: 'DEPARTAMENTO_SAN MARTN', label: 'San Martín' },
    { value: 'DEPARTAMENTO_TACNA', label: 'Tacna' },
    { value: 'DEPARTAMENTO_TUMBES', label: 'Tumbes' },
    { value: 'DEPARTAMENTO_UCAYALI', label: 'Ucayali' }
  ]

  const clases = [
    { value: 'CLASE_Hotel', label: 'Hotel' },
    { value: 'CLASE_Hostal', label: 'Hostal' },
    { value: 'CLASE_Albergue', label: 'Albergue' },
    { value: 'CLASE_Apart Hotel', label: 'Apart Hotel' }
  ]

  const fetchHistory = async () => {
    try {
      const res = await axios.get('http://localhost:8000/history')
      setHistory(res.data.history)
    } catch (err) {
      console.error("Error fetching history:", err)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const payload = {
        cama: Number(formData.cama),
        habi: Number(formData.habi),
        departamento: formData.departamento,
        clase: formData.clase
      }
      
      const res = await axios.post('http://localhost:8000/predict', payload)
      setResults(res.data.predictions)
      fetchHistory() // Refresh history
    } catch (err) {
      setError("Error conectando con el servidor. ¿Está FastAPI encendido?")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getConclusionText = () => {
    if (!results) return null;
    
    const isAlta = results.knn === 'Alta Calidad';
    
    if (userMode === 'turista') {
      return isAlta 
        ? "Validación de Expectativa: ¡Excelente elección! Este hospedaje tiene las características típicas de un hotel de lujo. Vale totalmente la pena reservarlo para disfrutar de una estadía muy cómoda."
        : "Validación de Expectativa: Es una opción funcional y estándar. Ideal si buscas algo práctico y económico para dormir, pero no esperes lujos ni servicios premium en esta configuración.";
    } else {
      return isAlta
        ? "Simulación de Viabilidad: Configuración de alto potencial. Construir o invertir en esta estructura en esta ubicación promete competir en el sector premium, atrayendo turismo de alto valor."
        : "Simulación de Viabilidad: Modelo de negocio de volumen. Esta configuración se clasifica en el segmento estándar, lo cual significa menores costos operativos pero requerirá alta ocupación para ser muy rentable.";
    }
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>Sistema de Validación Hotelera</h1>
        
        <div className="toggle-container">
          <button 
            className={`toggle-btn ${userMode === 'turista' ? 'active' : ''}`}
            onClick={() => setUserMode('turista')}
            type="button"
          >
            Modo Turista
          </button>
          <button 
            className={`toggle-btn ${userMode === 'inversionista' ? 'active' : ''}`}
            onClick={() => setUserMode('inversionista')}
            type="button"
          >
            Modo Inversionista
          </button>
        </div>
      </header>

      <main>
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              
              <div className="form-group full-width" style={{display: 'flex', gap: '1rem'}}>
                <div style={{flex: 1}}>
                  <label htmlFor="departamento">Departamento</label>
                  <select 
                    id="departamento"
                    name="departamento" 
                    className="form-control"
                    value={formData.departamento}
                    onChange={handleChange}
                  >
                    {departamentos.map(dep => (
                      <option key={dep.value} value={dep.value}>
                        {dep.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{flex: 1}}>
                  <label htmlFor="clase">Clase de Establecimiento</label>
                  <select 
                    id="clase"
                    name="clase" 
                    className="form-control"
                    value={formData.clase}
                    onChange={handleChange}
                  >
                    {clases.map(c => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="cama">Número de Camas</label>
                <input 
                  type="number" 
                  id="cama"
                  name="cama" 
                  className="form-control" 
                  min="1"
                  value={formData.cama}
                  onChange={handleChange}
                  required 
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="habi">Número de Habitaciones</label>
                <input 
                  type="number" 
                  id="habi"
                  name="habi" 
                  className="form-control" 
                  min="1"
                  value={formData.habi}
                  onChange={handleChange}
                  required 
                />
              </div>
            </div>

            {error && <div style={{color: 'var(--danger)', marginTop: '1rem', textAlign: 'center'}}>{error}</div>}

            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Procesando...' : 'Analizar Configuración'}
            </button>
          </form>

          {results && (
            <div className="results-section">
              <div className="results-grid-3">
                
                {/* Tarjeta 1: KNN */}
                <div className="result-card">
                  <h3>Veredicto del Mercado (KNN)</h3>
                  <div className={`result-value ${results.knn === 'Alta Calidad' ? 'alta' : 'estandar'}`}>
                    {results.knn}
                  </div>
                </div>

                {/* Tarjeta 2: Bayes */}
                <div className="result-card">
                  <h3>Nivel de Certeza (Bayes)</h3>
                  <div className="result-value">
                    {results.naive_bayes_prob}%
                  </div>
                  <div style={{color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: '500', textTransform: 'uppercase'}}>
                    Veredicto: <span className={results.naive_bayes === 'Alta Calidad' ? 'alta' : 'estandar'}>{results.naive_bayes}</span>
                  </div>
                  <div className="progress-container">
                    <div 
                      className="progress-bar" 
                      style={{width: `${results.naive_bayes_prob}%`}}
                    >
                    </div>
                  </div>
                </div>

                {/* Tarjeta 3: Conclusión */}
                <div className="result-card" style={{justifyContent: 'flex-start'}}>
                  <h3>Conclusión Estratégica</h3>
                  <div className="conclusion-text">
                    {getConclusionText()}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="history-section card">
            <h2>Historial de Análisis</h2>
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Camas</th>
                    <th>Hab.</th>
                    <th>Ubicación</th>
                    <th>Clase</th>
                    <th>Veredicto</th>
                    <th>Certeza</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record, index) => {
                    const depLabel = departamentos.find(d => d.value === record.inputs.departamento)?.label || record.inputs.departamento.replace('DEPARTAMENTO_', '');
                    return (
                      <tr key={index}>
                        <td>{new Date(record.timestamp).toLocaleString()}</td>
                        <td>{record.inputs.cama}</td>
                        <td>{record.inputs.habi}</td>
                        <td>{depLabel}</td>
                        <td>{record.inputs.clase ? record.inputs.clase.replace('CLASE_', '') : '-'}</td>
                        <td>
                          <span className={`badge ${record.predictions.knn === 'Alta Calidad' ? 'badge-alta' : 'badge-baja'}`}>
                            {record.predictions.knn}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${record.predictions.naive_bayes === 'Alta Calidad' ? 'badge-alta' : 'badge-baja'}`} style={{display: 'block', marginBottom: '0.25rem', width: 'fit-content'}}>
                            {record.predictions.naive_bayes || '-'}
                          </span>
                          {record.predictions.naive_bayes_prob !== undefined && (
                            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                              {record.predictions.naive_bayes_prob}% certeza
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
