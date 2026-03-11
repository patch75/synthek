import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

const CATEGORIES = [
  { value: '',               label: '— Choisir une catégorie —' },
  { value: 'programme',      label: 'Programme' },
  { value: 'cctp',           label: 'CCTP' },
  { value: 'dpgf',           label: 'DPGF' },
  { value: 'plans',          label: 'Plans' },
  { value: 'pieces_ecrites', label: 'Pièces écrites' },
  { value: 'etudes_th',      label: 'Études thermiques' },
  { value: 'bureau_controle',label: 'Bureau de contrôle' },
  { value: 'notes_calcul',   label: 'Notes de calcul' },
  { value: 'comptes_rendus', label: 'Comptes-rendus' },
  { value: 'autre',          label: 'Autre' },
]

const INFOS_CATEGORIE = {
  programme: {
    icon: '📌',
    texte: 'Ce document deviendra la référence du projet. Les CCTP et DPGF uploadés ensuite seront automatiquement vérifiés par rapport à lui.',
    style: { background: 'var(--accent-light, #ede9fe)', borderLeft: '3px solid #7c3aed', color: 'var(--text)' }
  },
  cctp: {
    icon: '🔍',
    texte: 'Ce CCTP sera automatiquement comparé aux programmes de référence du projet pour détecter les omissions ou incohérences.',
    style: { background: 'var(--info-light, #dbeafe)', borderLeft: '3px solid #2563eb', color: 'var(--text)' }
  },
  dpgf: {
    icon: '🔍',
    texte: 'Ce DPGF sera comparé aux documents de référence sélectionnés ci-dessous.',
    style: { background: 'var(--info-light, #dbeafe)', borderLeft: '3px solid #2563eb', color: 'var(--text)' }
  }
}

export default function Upload() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [fichier, setFichier] = useState(null)
  const [resumeModif, setResumeModif] = useState('')
  const [categorieDoc, setCategorieDoc] = useState('')
  const [comparaisonAvec, setComparaisonAvec] = useState('programme')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sousProgrammes, setSousProgrammes] = useState([])
  const [sousProgrammeId, setSousProgrammeId] = useState('')
  const [comparerAvecSps, setComparerAvecSps] = useState([])
  const [modeleIA, setModeleIA] = useState('sonnet')

  useEffect(() => {
    api.get(`/projets/${id}/sous-programmes`)
      .then(res => {
        setSousProgrammes(res.data)
        setComparerAvecSps(res.data.map(sp => sp.id))
      })
      .catch(() => {})
  }, [id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fichier) return
    setError('')
    setLoading(true)

    const formData = new FormData()
    formData.append('fichier', fichier)
    formData.append('projetId', id)
    formData.append('resumeModif', resumeModif)
    formData.append('categorieDoc', categorieDoc)
    if (categorieDoc === 'dpgf') {
      formData.append('comparaisonAvec', comparaisonAvec)
    }
    if (sousProgrammeId) {
      formData.append('sousProgrammeId', sousProgrammeId)
    }
    if ((categorieDoc === 'cctp' || categorieDoc === 'dpgf') && sousProgrammes.length > 0 && !sousProgrammeId) {
      comparerAvecSps.forEach(spId => formData.append('comparerAvecSps[]', spId))
    }
    if (categorieDoc === 'cctp' || categorieDoc === 'dpgf') {
      formData.append('modeleIA', modeleIA)
    }

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

  const infoCategorie = INFOS_CATEGORIE[categorieDoc]

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

            {/* Catégorie en premier — elle conditionne le reste */}
            <div className="form-group">
              <label>Catégorie <span className="text-muted">(important — détermine le traitement IA)</span></label>
              <select value={categorieDoc} onChange={e => setCategorieDoc(e.target.value)}>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Sous-programme — visible uniquement pour les programmes (notices) */}
            {sousProgrammes.length > 0 && categorieDoc === 'programme' && (
              <div className="form-group">
                <label>Sous-programme <span className="text-muted">(périmètre de ce document)</span></label>
                <select value={sousProgrammeId} onChange={e => setSousProgrammeId(e.target.value)}>
                  <option value="">— Projet entier (pas de sous-programme) —</option>
                  {sousProgrammes.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.nom}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Message contextuel selon la catégorie */}
            {infoCategorie && (
              <div style={{ ...infoCategorie.style, borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.6, marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{infoCategorie.icon}</span>
                <span>{infoCategorie.texte}</span>
              </div>
            )}


            {/* Options de comparaison pour DPGF */}
            {categorieDoc === 'dpgf' && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Comparer avec</label>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                  {[
                    { value: 'programme', label: 'Programme uniquement' },
                    { value: 'cctp',      label: 'CCTP uniquement' },
                    { value: 'les_deux',  label: 'Programme + CCTP' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                      <input
                        type="radio"
                        name="comparaisonAvec"
                        value={opt.value}
                        checked={comparaisonAvec === opt.value}
                        onChange={() => setComparaisonAvec(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

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

            {(categorieDoc === 'cctp' || categorieDoc === 'dpgf') && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Modèle IA <span className="text-muted">(pour la comparaison)</span></label>
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  {[
                    { value: 'haiku', label: 'Haiku', desc: 'rapide' },
                    { value: 'sonnet', label: 'Sonnet', desc: 'précis' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                      <input type="radio" name="modeleIA" value={opt.value} checked={modeleIA === opt.value} onChange={() => setModeleIA(opt.value)} />
                      <span>{opt.label} <span className="text-muted">({opt.desc})</span></span>
                    </label>
                  ))}
                </div>
              </div>
            )}

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
            <p className="text-muted text-sm">
              {(categorieDoc === 'cctp' || categorieDoc === 'dpgf')
                ? 'Vérification de cohérence avec les documents de référence...'
                : 'Cette opération peut prendre quelques secondes.'}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
