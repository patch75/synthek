import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

export default function Upload() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [fichier, setFichier] = useState(null)
  const [resumeModif, setResumeModif] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fichier) return
    setError('')
    setLoading(true)

    const formData = new FormData()
    formData.append('fichier', fichier)
    formData.append('projetId', id)
    formData.append('resumeModif', resumeModif)

    try {
      const res = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      navigate(`/projets/${id}`, { state: { newDocId: res.data.id } })
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du dépôt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <h1>Déposer un document</h1>
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="container container-sm">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Fichier <span className="text-muted">(PDF, Word, Excel — max 20 Mo)</span></label>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.xls"
                onChange={e => {
                  const f = e.target.files[0]
                  if (f && f.size > 20 * 1024 * 1024) {
                    setError('Fichier trop volumineux (max 20 Mo)')
                    e.target.value = ''
                    setFichier(null)
                  } else {
                    setError('')
                    setFichier(f)
                  }
                }}
                required
              />
              {fichier && (
                <p className="text-muted text-sm">
                  {fichier.name} — {(fichier.size / 1024 / 1024).toFixed(2)} Mo
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Résumé des modifications <span className="text-muted">(2 lignes max)</span></label>
              <textarea
                value={resumeModif}
                onChange={e => setResumeModif(e.target.value)}
                placeholder="Ex: Mise à jour de la puissance de la pompe à chaleur de 12kW à 14kW suite à recalcul thermique."
                rows={3}
              />
            </div>

            {error && <p className="error-msg">{error}</p>}

            <div className="form-actions">
              <button type="submit" disabled={loading || !fichier} className="btn-primary">
                {loading ? 'Dépôt en cours...' : 'Déposer et analyser'}
              </button>
              <button type="button" onClick={() => navigate(`/projets/${id}`)} className="btn-ghost">
                Annuler
              </button>
            </div>
          </form>
        </div>

        {loading && (
          <div className="card info-card">
            <p>Extraction du texte et analyse IA en cours...</p>
            <p className="text-muted text-sm">Cette opération peut prendre quelques secondes.</p>
          </div>
        )}
      </main>
    </div>
  )
}
