import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

const ACTION_STYLES = {
  'FAVORABLE':     { bg: '#dcfce7', color: '#16a34a', icon: '✓', label: 'Favorable' },
  'AVEC_RESERVES': { bg: '#fff7ed', color: '#ea580c', icon: '~', label: 'Avec réserves' },
  'DEFAVORABLE':   { bg: '#fee2e2', color: '#dc2626', icon: '✗', label: 'Défavorable' }
}

export default function Visas() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [documents, setDocuments] = useState([])
  const [visas, setVisas] = useState([])
  const [loading, setLoading] = useState(true)
  const [docChoisi, setDocChoisi] = useState('')
  const [action, setAction] = useState('FAVORABLE')
  const [commentaire, setCommentaire] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const isBureauControle = user?.role === 'bureau_controle'

  useEffect(() => {
    Promise.all([
      api.get(`/documents/${id}`),
      api.get(`/visas/${id}`)
    ]).then(([dRes, vRes]) => {
      setDocuments(dRes.data)
      setVisas(vRes.data)
      if (dRes.data.length > 0) setDocChoisi(String(dRes.data[0].id))
      setLoading(false)
    })
  }, [id])

  async function ajouterVisa(e) {
    e.preventDefault()
    setError('')
    setEnvoi(true)
    try {
      const res = await api.post('/visas', {
        projetId: parseInt(id),
        documentId: parseInt(docChoisi),
        action,
        commentaire: commentaire || undefined
      })
      setVisas(prev => [res.data, ...prev])
      setCommentaire('')
      setShowForm(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du visa')
    } finally {
      setEnvoi(false)
    }
  }

  // Regrouper les visas par document
  const visasParDoc = visas.reduce((acc, v) => {
    const key = v.document.id
    if (!acc[key]) acc[key] = { document: v.document, visas: [] }
    acc[key].visas.push(v)
    return acc
  }, {})

  if (loading) return <div className="page"><p className="text-muted container">Chargement...</p></div>

  return (
    <div className="page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <h1>Visas & Validations</h1>
        <span className="text-muted">Traçabilité juridique</span>
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {!isBureauControle && (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              + Nouveau visa
            </button>
          )}
        </div>
      </header>

      <main className="container">

        {isBureauControle && (
          <div className="banner-readonly">
            Vous êtes en lecture seule — le bureau de contrôle ne peut pas créer de visas.
          </div>
        )}

        {showForm && !isBureauControle && (
          <section className="section">
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Nouveau visa</h3>
              <form onSubmit={ajouterVisa}>
                <div className="form-group">
                  <label>Document</label>
                  <select value={docChoisi} onChange={e => setDocChoisi(e.target.value)} required>
                    {documents.map(d => (
                      <option key={d.id} value={d.id}>{d.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Action</label>
                  <div className="visa-action-picker">
                    {['FAVORABLE', 'AVEC_RESERVES', 'DEFAVORABLE'].map(a => (
                      <button
                        key={a}
                        type="button"
                        className={`visa-action-btn ${action === a ? 'visa-action-active' : ''}`}
                        style={action === a ? { background: ACTION_STYLES[a].bg, color: ACTION_STYLES[a].color, borderColor: ACTION_STYLES[a].color } : {}}
                        onClick={() => setAction(a)}
                      >
                        {ACTION_STYLES[a].icon} {ACTION_STYLES[a].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label>Commentaire <span className="text-muted">(optionnel)</span></label>
                  <textarea
                    value={commentaire}
                    onChange={e => setCommentaire(e.target.value)}
                    placeholder="Observations, réserves, motif de refus..."
                    rows={3}
                  />
                </div>
                {error && <p className="error-msg">{error}</p>}
                <div className="form-actions">
                  <button type="submit" disabled={envoi} className="btn-primary">
                    {envoi ? 'Enregistrement...' : 'Enregistrer le visa'}
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setError('') }} className="btn-ghost">
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* Historique des visas par document */}
        <section className="section">
          <h2 className="section-title">Historique des visas</h2>
          {visas.length === 0 ? (
            <p className="text-muted">Aucun visa enregistré.</p>
          ) : (
            <div className="visas-liste">
              {Object.values(visasParDoc).map(({ document, visas: vList }) => (
                <div key={document.id} className="card visa-doc-card">
                  <div className="visa-doc-header">
                    <div>
                      <strong>{document.nom}</strong>
                      <span className="badge" style={{ marginLeft: 8 }}>{document.type?.toUpperCase()}</span>
                    </div>
                    <span className="text-muted text-sm">v{document.version}</span>
                  </div>
                  <div className="visa-entries">
                    {vList.map(v => {
                      const style = ACTION_STYLES[v.action] || {}
                      return (
                        <div key={v.id} className="visa-entry">
                          <span
                            className="visa-action-badge"
                            style={{ background: style.bg, color: style.color }}
                          >
                            {style.icon} {style.label || v.action}
                          </span>
                          <div className="visa-entry-meta">
                            <strong>{v.user.nom}</strong>
                            <span className="text-muted">{v.user.role?.replace(/_/g, ' ')}</span>
                            <span className="text-muted text-sm">
                              {new Date(v.dateVisa).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          {v.commentaire && (
                            <p className="visa-commentaire">"{v.commentaire}"</p>
                          )}
                          {v.hashDocument && (
                            <p className="visa-hash">SHA-256 : {v.hashDocument}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
