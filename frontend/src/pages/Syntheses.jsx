import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

const VISA_STYLES = {
  'FAVORABLE':     { bg: '#dcfce7', color: '#16a34a', icon: '✓' },
  'AVEC_RESERVES': { bg: '#fff7ed', color: '#ea580c', icon: '~' },
  'DEFAVORABLE':   { bg: '#fee2e2', color: '#dc2626', icon: '✗' },
}

const MATRICE = [
  { code: 'S-00',  label: 'Notice MOA ↔ CCTP Fluides' },
  { code: 'S-05',  label: 'Notice MOA ↔ DPGF Économiste' },
  { code: 'S-14',  label: 'BET Thermique ↔ BET Fluides' },
  { code: 'S-15',  label: 'Structure ↔ Architecte' },
  { code: 'S-16',  label: 'Structure ↔ BET Fluides' },
  { code: 'S-20',  label: 'BET Fluides ↔ Architecte' },
  { code: 'S-22',  label: 'BET Fluides ↔ BET VRD' },
  { code: 'S-28',  label: 'Économiste ↔ BET Fluides' },
  { code: 'S-34',  label: 'Bureau Contrôle ↔ Tous' },
]

function SyntheseBadge({ resultat }) {
  if (!resultat) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Non analysé</span>
  const s = VISA_STYLES[resultat] || {}
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {s.icon} {resultat.replace('_', ' ')}
    </span>
  )
}

export default function Syntheses() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [syntheses, setSyntheses] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formCode, setFormCode] = useState('S-00')
  const [formDocSource, setFormDocSource] = useState('')
  const [formDocsCroises, setFormDocsCroises] = useState([])
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState('')
  const [selectedSynthese, setSelectedSynthese] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get(`/syntheses/${id}`),
      api.get(`/documents/${id}`)
    ]).then(([sRes, dRes]) => {
      setSyntheses(sRes.data)
      setDocuments(dRes.data)
      if (dRes.data.length > 0) {
        setFormDocSource(String(dRes.data[0].id))
      }
      setLoading(false)
    })
  }, [id])

  async function declencher(e) {
    e.preventDefault()
    setError('')
    if (formDocsCroises.length === 0) {
      setError('Sélectionner au moins un document croisé')
      return
    }
    setAnalysing(true)
    try {
      const res = await api.post('/syntheses/declencher', {
        projetId: parseInt(id),
        codeSynthese: formCode,
        documentIdSource: parseInt(formDocSource),
        documentsCroisesIds: formDocsCroises.map(Number)
      })
      setSyntheses(prev => [res.data, ...prev])
      setShowForm(false)
      setFormDocsCroises([])
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'analyse')
    } finally {
      setAnalysing(false)
    }
  }

  function toggleDocCroise(docId) {
    setFormDocsCroises(prev =>
      prev.includes(docId) ? prev.filter(d => d !== docId) : [...prev, docId]
    )
  }

  if (loading) return <div className="page"><p className="text-muted container">Chargement...</p></div>

  return (
    <div className="page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <h1>Synthèses de croisement</h1>
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            + Déclencher une analyse
          </button>
        </div>
      </header>

      <main className="container">

        {/* Formulaire déclenchement */}
        {showForm && (
          <section className="section">
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Nouvelle analyse croisée</h3>
              <form onSubmit={declencher}>
                <div className="form-group">
                  <label>Code synthèse</label>
                  <select value={formCode} onChange={e => setFormCode(e.target.value)}>
                    {MATRICE.map(m => (
                      <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Document source</label>
                  <select value={formDocSource} onChange={e => setFormDocSource(e.target.value)} required>
                    {documents.map(d => (
                      <option key={d.id} value={d.id}>{d.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Documents à croiser <span className="text-muted">(sélection multiple)</span></label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', padding: '8px', border: '1px solid var(--border)', borderRadius: 8 }}>
                    {documents
                      .filter(d => String(d.id) !== formDocSource)
                      .map(d => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={formDocsCroises.includes(String(d.id))}
                            onChange={() => toggleDocCroise(String(d.id))}
                          />
                          {d.nom}
                        </label>
                      ))}
                    {documents.length <= 1 && <p className="text-muted" style={{ fontSize: 12 }}>Aucun autre document disponible</p>}
                  </div>
                </div>
                {error && <p className="error-msg">{error}</p>}
                <div className="form-actions">
                  <button type="submit" disabled={analysing} className="btn-primary">
                    {analysing ? 'Analyse en cours...' : 'Lancer l\'analyse'}
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setError('') }} className="btn-ghost">
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* Matrice de statut */}
        <section className="section">
          <h2 className="section-title">Matrice des croisements V1</h2>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Croisement</th>
                  <th>Statut</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {MATRICE.map(m => {
                  const analyses = syntheses.filter(s => s.codeSynthese === m.code)
                  const derniere = analyses[0]
                  return (
                    <tr key={m.code}>
                      <td><span className="badge">{m.code}</span></td>
                      <td style={{ fontWeight: 500 }}>{m.label}</td>
                      <td><SyntheseBadge resultat={derniere?.resultatVisa} /></td>
                      <td className="text-muted text-sm">
                        {derniere ? new Date(derniere.dateAnalyse).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td>
                        {derniere && (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => setSelectedSynthese(selectedSynthese?.id === derniere.id ? null : derniere)}
                          >
                            {selectedSynthese?.id === derniere.id ? 'Fermer' : 'Voir rapport'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Rapport détaillé */}
        {selectedSynthese && (
          <section className="section">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>{selectedSynthese.codeSynthese} — Rapport d'analyse</h3>
                  <span className="text-muted text-sm">
                    Source : {selectedSynthese.documentSource?.nom} — {new Date(selectedSynthese.dateAnalyse).toLocaleString('fr-FR')}
                  </span>
                </div>
                <SyntheseBadge resultat={selectedSynthese.resultatVisa} />
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                {selectedSynthese.rapportTexte || 'Aucun rapport disponible.'}
              </div>
            </div>
          </section>
        )}

        {/* Historique complet */}
        {syntheses.length > 0 && (
          <section className="section">
            <h2 className="section-title">Historique des analyses ({syntheses.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {syntheses.map(s => (
                <div key={s.id} className="card" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span className="badge">{s.codeSynthese}</span>
                      <span style={{ fontSize: 13 }}>{s.documentSource?.nom}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <SyntheseBadge resultat={s.resultatVisa} />
                      <span className="text-muted text-sm">{new Date(s.dateAnalyse).toLocaleDateString('fr-FR')}</span>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setSelectedSynthese(selectedSynthese?.id === s.id ? null : s)}
                      >
                        {selectedSynthese?.id === s.id ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {syntheses.length === 0 && !showForm && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Aucune synthèse disponible.</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">
              Déclencher une première analyse
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
