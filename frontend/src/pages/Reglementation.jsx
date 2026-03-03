import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

export default function Reglementation() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [refs, setRefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [fichier, setFichier] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    api.get('/reglementation').then(res => {
      setRefs(res.data)
      setLoading(false)
    })
  }, [])

  async function uploadRef(e) {
    e.preventDefault()
    setError('')
    if (!fichier) return setError('Fichier PDF requis')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('fichier', fichier)
      form.append('nom', nom)
      if (description) form.append('description', description)
      const res = await api.post('/reglementation/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setRefs(prev => [res.data, ...prev])
      setNom(''); setDescription(''); setFichier(null)
      if (fileRef.current) fileRef.current.value = ''
      setShowForm(false)
      showSuccessMsg('Document de référence ajouté')
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'upload')
    } finally {
      setUploading(false)
    }
  }

  async function supprimerRef(id, refNom) {
    if (!confirm(`Supprimer "${refNom}" ? Cette action est irréversible.`)) return
    try {
      await api.delete(`/reglementation/${id}`)
      setRefs(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  function showSuccessMsg(msg) {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 4000)
  }

  if (user?.role !== 'admin') {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: 40 }}>
          <p className="text-muted">Accès réservé aux administrateurs.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <h1>Réglementation de référence</h1>
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            + Ajouter un PDF
          </button>
        </div>
      </header>

      <main className="container">

        <div style={{ marginBottom: 20 }}>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Ces documents PDF sont injectés automatiquement dans tous les prompts d'analyse IA et de chat, en complément de la réglementation native de Claude.
          </p>
        </div>

        {success && (
          <div className="analyse-msg analyse-ok" style={{ marginBottom: 20 }}>✓ {success}</div>
        )}

        {/* Formulaire upload */}
        {showForm && (
          <section className="section">
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Ajouter un document de référence</h3>
              <form onSubmit={uploadRef}>
                <div className="form-group">
                  <label>Nom du document</label>
                  <input
                    value={nom}
                    onChange={e => setNom(e.target.value)}
                    placeholder="ex: Arrêté du 25/06/1980 ERP"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description <span className="text-muted">(optionnel)</span></label>
                  <input
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="ex: Réglementation incendie ERP type W"
                  />
                </div>
                <div className="form-group">
                  <label>Fichier PDF</label>
                  <input
                    type="file"
                    accept=".pdf"
                    ref={fileRef}
                    onChange={e => setFichier(e.target.files[0])}
                    required
                  />
                </div>
                {error && <p className="error-msg">{error}</p>}
                <div className="form-actions">
                  <button type="submit" disabled={uploading} className="btn-primary">
                    {uploading ? 'Upload en cours...' : 'Ajouter'}
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setError('') }} className="btn-ghost">
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* Liste des documents */}
        <section className="section">
          <h2 className="section-title">Documents de référence ({refs.length})</h2>
          {loading ? (
            <p className="text-muted">Chargement...</p>
          ) : refs.length === 0 ? (
            <p className="text-muted">Aucun document de référence ajouté.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Description</th>
                    <th>Texte extrait</th>
                    <th>Ajouté par</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {refs.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.nom}</td>
                      <td className="text-muted">{r.description || '—'}</td>
                      <td>
                        {r.contenuTexte
                          ? <span style={{ color: '#16a34a', fontSize: 12 }}>✓ {Math.round(r.contenuTexte.length / 1000)}k caractères</span>
                          : <span style={{ color: '#dc2626', fontSize: 12 }}>✗ Non extrait</span>
                        }
                      </td>
                      <td className="text-muted">{r.uploadedBy?.nom}</td>
                      <td className="text-muted text-sm">{new Date(r.dateUpload).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <button
                          className="btn-danger-sm"
                          onClick={() => supprimerRef(r.id, r.nom)}
                          title="Supprimer"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
