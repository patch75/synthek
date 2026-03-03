import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

function fmt(date) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function Historique() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [data, setData] = useState(null)
  const [onglet, setOnglet] = useState('alertes')

  useEffect(() => {
    api.get(`/alertes/${id}/historique`).then(res => setData(res.data))
  }, [id])

  if (!data) return <div className="page"><p className="text-muted container">Chargement...</p></div>

  return (
    <div className="page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <h1>Historique</h1>
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="container">
        <div className="onglets">
          <button
            className={onglet === 'alertes' ? 'onglet onglet-actif' : 'onglet'}
            onClick={() => setOnglet('alertes')}
          >
            Alertes résolues ({data.alertesResolues.length})
          </button>
          <button
            className={onglet === 'ia' ? 'onglet onglet-actif' : 'onglet'}
            onClick={() => setOnglet('ia')}
          >
            Questions IA ({data.messagesIA.length})
          </button>
        </div>

        {onglet === 'alertes' && (
          <div className="historique-liste">
            {data.alertesResolues.length === 0 ? (
              <p className="text-muted">Aucune alerte résolue.</p>
            ) : data.alertesResolues.map(a => (
              <div key={a.id} className="card historique-card">
                <div className="historique-header">
                  <span className="badge-resolue">✓ Résolu</span>
                  <span className="text-muted text-sm">{fmt(a.dateResolution)}</span>
                </div>
                <p>{a.message}</p>
                <p className="text-muted text-sm">
                  Documents : {a.documents.map(d => d.document.nom).join(', ')}
                </p>
                <p className="text-muted text-sm">Détecté le {fmt(a.dateCreation)}</p>
              </div>
            ))}
          </div>
        )}

        {onglet === 'ia' && (
          <div className="historique-liste">
            {data.messagesIA.length === 0 ? (
              <p className="text-muted">Aucune question posée.</p>
            ) : data.messagesIA.map(m => (
              <div key={m.id} className="card historique-card">
                <div className="historique-header">
                  <span className="text-sm"><strong>{m.user.nom}</strong></span>
                  <span className="text-muted text-sm">{fmt(m.date)}</span>
                </div>
                <p className="question-ia">Q : {m.question}</p>
                <p className="reponse-ia">{m.reponse}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
