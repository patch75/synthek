import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

const PHASES = ['APS', 'APD', 'PRO', 'DCE', 'EXE']

const PHASE_COLORS = {
  APS: '#7c3aed', APD: '#2563eb', PRO: '#0891b2',
  DCE: '#059669', EXE: '#dc2626'
}

const PHASE_LEXIQUE = [
  { sigle: 'APS', nom: 'Avant-Projet Sommaire',          color: '#7c3aed', desc: 'Première esquisse technique. Grands principes constructifs, estimation globale du coût de l\'opération.' },
  { sigle: 'APD', nom: 'Avant-Projet Définitif',         color: '#2563eb', desc: 'Études approfondies, plans détaillés de tous les lots. Estimation précise du coût des travaux.' },
  { sigle: 'PRO', nom: 'Projet',                         color: '#0891b2', desc: 'Plans d\'exécution complets, tous les lots définis. Dossier technique finalisé avant consultation.' },
  { sigle: 'DCE', nom: 'Dossier de Consultation des Entreprises', color: '#059669', desc: 'Appel d\'offres — CCTP, DPGF et plans envoyés aux entreprises pour chiffrage et sélection.' },
  { sigle: 'EXE', nom: 'Exécution',                      color: '#dc2626', desc: 'Phase chantier. Suivi des travaux, visa des plans d\'exécution des entreprises, réception.' },
]

function LexiqueModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Phases de la mission MOE</h3>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Nomenclature loi MOP — maîtrise d'œuvre en construction.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PHASE_LEXIQUE.map(p => (
            <div key={p.sigle} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{
                background: p.color,
                color: 'white',
                fontWeight: 800,
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 20,
                letterSpacing: '0.06em',
                flexShrink: 0,
                marginTop: 2,
                minWidth: 44,
                textAlign: 'center',
              }}>
                {p.sigle}
              </span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{p.nom}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PuceCard({ puce }) {
  if (!puce) return <span className="text-muted text-sm">—</span>
  return (
    <div className="puce-inline">
      {puce.typeLivrable && <span className="badge-puce">{puce.typeLivrable}</span>}
      {puce.valeurCle && <span className="puce-valeur">{puce.valeurCle}</span>}
    </div>
  )
}

export default function Projet() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [projet, setProjet] = useState(null)
  const [alertes, setAlertes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [emailInvite, setEmailInvite] = useState('')
  const [roleInvite, setRoleInvite] = useState('moa')
  const [inviteError, setInviteError] = useState('')
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [analyseMsg, setAnalyseMsg] = useState('')
  const [showPhase, setShowPhase] = useState(false)
  const [phaseEnCours, setPhaseEnCours] = useState(false)
  const [phaseMsg, setPhaseMsg] = useState(null)
  const [certEnCours, setCertEnCours] = useState(false)
  const [rapportEnCours, setRapportEnCours] = useState(false)
  const [rapportMsg, setRapportMsg] = useState(null)
  const [showJalon, setShowJalon] = useState(false)
  const [jalonChoisi, setJalonChoisi] = useState('DCE')
  const [showLexique, setShowLexique] = useState(false)
  const [showEditProjet, setShowEditProjet] = useState(false)
  const [editNom, setEditNom] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editAdresse, setEditAdresse] = useState('')
  const [editTypeBatiment, setEditTypeBatiment] = useState('')
  const [editNombreNiveaux, setEditNombreNiveaux] = useState('')
  const [editShon, setEditShon] = useState('')
  const [editEnergieRetenue, setEditEnergieRetenue] = useState('')
  const [editZoneClimatique, setEditZoneClimatique] = useState('')
  const [editClassementErp, setEditClassementErp] = useState(false)
  const [editTypeErp, setEditTypeErp] = useState('')
  const [editNombreLogements, setEditNombreLogements] = useState('')
  const [editEnCours, setEditEnCours] = useState(false)

  // V3 — Config IA
  const [showConfig, setShowConfig] = useState(false)
  const [configPrompt, setConfigPrompt] = useState('')
  const [configSeuils, setConfigSeuils] = useState('')
  const [configVocab, setConfigVocab] = useState('')
  const [configNommage, setConfigNommage] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  // V3 — Résolution alerte enrichie
  const [showResolModal, setShowResolModal] = useState(null)
  const [resolType, setResolType] = useState('manuelle')
  const [resolJustif, setResolJustif] = useState('')

  useEffect(() => {
    Promise.all([
      api.get(`/projets/${id}`),
      api.get(`/alertes/${id}`)
    ]).then(([pRes, aRes]) => {
      setProjet(pRes.data)
      setAlertes(aRes.data)
      setLoading(false)
    })
  }, [id])

  async function chargerConfig() {
    try {
      const res = await api.get(`/projets/${id}/config`)
      if (res.data) {
        setConfigPrompt(res.data.promptSystemeGlobal || '')
        setConfigSeuils(res.data.seuilsTolerance ? JSON.stringify(res.data.seuilsTolerance, null, 2) : '')
        setConfigVocab(res.data.vocabulaireMetier ? JSON.stringify(res.data.vocabulaireMetier, null, 2) : '')
        setConfigNommage(res.data.conventionNommage || '')
      }
      setShowConfig(true)
    } catch {
      setShowConfig(true)
    }
  }

  async function sauvegarderConfig(e) {
    e.preventDefault()
    setConfigSaving(true)
    setConfigMsg('')
    try {
      const body = {
        promptSystemeGlobal: configPrompt || null,
        conventionNommage: configNommage || null,
        seuilsTolerance: configSeuils ? JSON.parse(configSeuils) : null,
        vocabulaireMetier: configVocab ? JSON.parse(configVocab) : null
      }
      await api.post(`/projets/${id}/config`, body)
      setConfigMsg('Configuration sauvegardée')
    } catch (err) {
      setConfigMsg(err.response?.data?.error || 'Erreur JSON ou serveur')
    } finally {
      setConfigSaving(false)
    }
  }

  function ouvrirEditProjet() {
    setEditNom(projet.nom)
    setEditClient(projet.client)
    setEditAdresse(projet.adresse || '')
    setEditTypeBatiment(projet.typeBatiment || '')
    setEditNombreNiveaux(projet.nombreNiveaux ?? '')
    setEditShon(projet.shon ?? '')
    setEditEnergieRetenue(projet.energieRetenue || '')
    setEditZoneClimatique(projet.zoneClimatique || '')
    setEditClassementErp(projet.classementErp || false)
    setEditTypeErp(projet.typeErp || '')
    setEditNombreLogements(projet.nombreLogements ?? '')
    setShowEditProjet(true)
  }

  async function sauvegarderProjet(e) {
    e.preventDefault()
    setEditEnCours(true)
    try {
      const body = {
        nom: editNom,
        client: editClient,
        adresse: editAdresse,
        typeBatiment: editTypeBatiment,
        nombreNiveaux: editNombreNiveaux,
        shon: editShon,
        energieRetenue: editEnergieRetenue,
        zoneClimatique: editZoneClimatique,
        classementErp: editClassementErp,
        typeErp: editTypeErp,
        nombreLogements: editNombreLogements
      }
      const res = await api.patch(`/projets/${id}`, body)
      setProjet(prev => ({ ...prev, ...res.data }))
      setShowEditProjet(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la modification')
    } finally {
      setEditEnCours(false)
    }
  }

  async function supprimerDocument(docId, nomDoc) {
    if (!confirm(`Supprimer "${nomDoc}" ?`)) return
    try {
      await api.delete(`/documents/${docId}`)
      setProjet(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }))
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  async function resoudreAlerte(alerteId) {
    await api.patch(`/alertes/${alerteId}/resoudre`, {
      resoluePar: resolType,
      justificationDerogation: resolJustif || null
    })
    setAlertes(prev => prev.map(a => a.id === alerteId ? { ...a, statut: 'resolue' } : a))
    setShowResolModal(null)
    setResolType('manuelle')
    setResolJustif('')
  }

  async function creerArbitrage(alerteId) {
    try {
      await api.post(`/alertes/${alerteId}/arbitrage`, {
        type: 'arbitrage_moa',
        justification: resolJustif || 'Arbitrage MOA'
      })
      await resoudreAlerte(alerteId)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de l\'arbitrage')
    }
  }

  async function inviterMembre(e) {
    e.preventDefault()
    setInviteError('')
    try {
      const res = await api.post(`/projets/${id}/membres`, { email: emailInvite, role: roleInvite })
      setProjet(prev => ({ ...prev, membres: [...prev.membres, res.data] }))
      setEmailInvite('')
      setShowInvite(false)
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Erreur lors de l\'invitation')
    }
  }

  async function lancerAnalyse() {
    setAnalyseEnCours(true)
    setAnalyseMsg('')
    try {
      const res = await api.post('/ia/analyser', { projetId: parseInt(id) })
      const n = res.data.count
      setAnalyseMsg(n === 0 ? 'Aucune incohérence détectée.' : `${n} nouvelle${n > 1 ? 's' : ''} alerte${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}.`)
      if (n > 0) {
        const aRes = await api.get(`/alertes/${id}`)
        setAlertes(aRes.data)
      }
    } catch {
      setAnalyseMsg('Erreur lors de l\'analyse.')
    } finally {
      setAnalyseEnCours(false)
    }
  }

  async function changerPhase(nouvellePhase) {
    setPhaseEnCours(true)
    setPhaseMsg(null)
    try {
      const res = await api.patch(`/projets/${id}/phase`, { phase: nouvellePhase })
      setProjet(prev => ({ ...prev, phase: res.data.phase, bloqueExe: res.data.bloqueExe, raisonBlocage: res.data.raisonBlocage }))
      setShowPhase(false)
    } catch (err) {
      setPhaseMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors du changement de phase' })
      if (err.response?.data?.bloqueExe) {
        setProjet(prev => ({ ...prev, bloqueExe: true, raisonBlocage: err.response.data.error }))
      }
    } finally {
      setPhaseEnCours(false)
    }
  }

  async function genererCertificat() {
    setCertEnCours(true)
    try {
      const res = await api.post(`/projets/${id}/certificat`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `certificat-projet-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erreur lors de la génération du certificat.')
    } finally {
      setCertEnCours(false)
    }
  }

  async function envoyerRapport() {
    setRapportEnCours(true)
    setRapportMsg(null)
    try {
      const res = await api.post(`/projets/${id}/rapport-jalon`, { jalon: jalonChoisi })
      setRapportMsg({ type: 'ok', text: res.data.message })
      setShowJalon(false)
    } catch (err) {
      setRapportMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors de l\'envoi.' })
    } finally {
      setRapportEnCours(false)
    }
  }

  if (loading) return <div className="page"><p className="text-muted container">Chargement...</p></div>

  const alertesActives = alertes.filter(a => a.statut === 'active')
  const isAdmin = user?.role === 'admin'
  const isBureauControle = user?.role === 'bureau_controle'

  return (
    <div className="page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {/* Bouton lexique */}
          <button
            className="btn-lexique"
            onClick={() => setShowLexique(true)}
            title="Lexique des phases"
          >
            ?
          </button>
          {/* Badge phase */}
          <button
            className="phase-badge"
            style={{ background: PHASE_COLORS[projet.phase] || '#64748b' }}
            onClick={() => !isBureauControle && setShowPhase(!showPhase)}
            title={isBureauControle ? '' : 'Changer de phase'}
          >
            {projet.phase}
          </button>
          {showPhase && (
            <div className="phase-dropdown">
              {PHASES.map(p => {
                const isEXE = p === 'EXE'
                return (
                  <button
                    key={p}
                    className={`phase-option ${p === projet.phase ? 'phase-option-active' : ''}`}
                    onClick={() => !isEXE && changerPhase(p)}
                    disabled={phaseEnCours || p === projet.phase || isEXE}
                    title={isEXE ? 'Phase EXE disponible en V2' : undefined}
                    style={{
                      borderLeft: `3px solid ${PHASE_COLORS[p]}`,
                      opacity: isEXE ? 0.45 : 1,
                      cursor: isEXE ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {p}{isEXE ? ' (V2)' : ''}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      <main className="container">

        {/* En-tête projet */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', marginBottom: 4 }}>
              Projet : {projet.nom}
            </h2>
            <span className="text-muted" style={{ fontSize: 13 }}>{projet.client}</span>
          </div>
          {isAdmin && (
            <button className="btn-ghost" onClick={ouvrirEditProjet} title="Modifier le projet" style={{ fontSize: 15, padding: '6px 12px' }}>
              ✏️ Modifier
            </button>
          )}
        </div>

        {/* Banner BLOQUÉ EXE */}
        {projet.bloqueExe && (
          <div className="banner-bloque">
            <span className="banner-bloque-icon">⛔</span>
            <div>
              <strong>Passage en phase EXE bloqué</strong>
              <p className="text-sm">{projet.raisonBlocage}</p>
            </div>
          </div>
        )}

        {phaseMsg && (
          <div className={`analyse-msg ${phaseMsg.type === 'error' ? 'analyse-alert' : 'analyse-ok'}`}>
            {phaseMsg.text}
          </div>
        )}

        {rapportMsg && (
          <div className={`analyse-msg ${rapportMsg.type === 'error' ? 'analyse-alert' : 'analyse-ok'}`}>
            {rapportMsg.text}
          </div>
        )}

        {/* Alertes actives */}
        {alertesActives.length > 0 && (
          <section className="section">
            <h2 className="section-title alert-title">
              ⚠ {alertesActives.length} alerte{alertesActives.length > 1 ? 's' : ''} active{alertesActives.length > 1 ? 's' : ''}
            </h2>
            <div className="alertes-list">
              {alertesActives.map(alerte => (
                <div key={alerte.id} className="card alerte-card">
                  <p>{alerte.message}</p>
                  <div className="alerte-footer">
                    <span className="text-muted text-sm">
                      Documents : {alerte.documents.map(d => d.document.nom).join(', ')}
                    </span>
                    {!isBureauControle && (
                      <button onClick={() => { setShowResolModal(alerte.id); setResolType('manuelle'); setResolJustif('') }} className="btn-success">
                        Résoudre
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Documents */}
        <section className="section">
          <div className="section-header">
            <h2>Documents</h2>
            <div className="section-actions">
              {!isBureauControle && (
                <>
                  <button onClick={lancerAnalyse} disabled={analyseEnCours} className="btn-secondary">
                    {analyseEnCours ? 'Analyse...' : 'Analyser'}
                  </button>
                  <button onClick={() => navigate(`/projets/${id}/upload`)} className="btn-primary">
                    + Déposer
                  </button>
                </>
              )}
              <button onClick={() => navigate(`/projets/${id}/chat`)} className="btn-secondary">
                Assistant IA
              </button>
              <button onClick={() => navigate(`/projets/${id}/visas`)} className="btn-secondary">
                Visas
              </button>
              <button onClick={() => navigate(`/projets/${id}/syntheses`)} className="btn-secondary">
                Synthèses
              </button>
              <button onClick={() => navigate(`/projets/${id}/historique`)} className="btn-ghost">
                Historique
              </button>
            </div>
          </div>

          {analyseMsg && (
            <p className={`analyse-msg ${analyseMsg.includes('alerte') ? 'analyse-alert' : 'analyse-ok'}`}>
              {analyseMsg}
            </p>
          )}

          {/* Actions jalons */}
          <div className="jalon-actions">
            <button onClick={genererCertificat} disabled={certEnCours} className="btn-ghost btn-sm">
              {certEnCours ? '...' : '⬇ Certificat PDF'}
            </button>
            <button onClick={() => setShowJalon(!showJalon)} className="btn-ghost btn-sm">
              📤 Rapport jalon
            </button>
          </div>

          {showJalon && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <select value={jalonChoisi} onChange={e => setJalonChoisi(e.target.value)} style={{ width: 'auto' }}>
                <option value="DCE">DCE</option>
                <option value="EXE">EXE</option>
              </select>
              <button onClick={envoyerRapport} disabled={rapportEnCours} className="btn-primary">
                {rapportEnCours ? 'Envoi...' : 'Envoyer au bureau de contrôle'}
              </button>
              <button onClick={() => setShowJalon(false)} className="btn-ghost">Annuler</button>
            </div>
          )}

          {projet.documents.length === 0 ? (
            <p className="text-muted">Aucun document déposé.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Type</th>
                    <th>Statut</th>
                    <th>Indice</th>
                    <th>Puce IA</th>
                    <th>Déposé par</th>
                    <th>Date</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {projet.documents.map(doc => {
                    const statutColors = { provisoire: '#94a3b8', pour_visa: '#3b82f6', valide: '#22c55e' }
                    const statutLabels = { provisoire: 'Provisoire', pour_visa: 'Pour visa', valide: 'Validé' }
                    return (
                      <tr key={doc.id}>
                        <td>{doc.nom}</td>
                        <td><span className="badge">{doc.type.toUpperCase()}</span></td>
                        <td>
                          {doc.statutDocument ? (
                            <span className="badge" style={{ background: statutColors[doc.statutDocument] || '#94a3b8', color: 'white', fontSize: 11 }}>
                              {statutLabels[doc.statutDocument] || doc.statutDocument}
                            </span>
                          ) : <span className="text-muted text-sm">—</span>}
                        </td>
                        <td>
                          {doc.indiceRevision ? (
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{doc.indiceRevision}</span>
                          ) : <span className="text-muted text-sm">—</span>}
                        </td>
                        <td><PuceCard puce={doc.puce} /></td>
                        <td>{doc.user?.nom}</td>
                        <td>{new Date(doc.dateDepot).toLocaleDateString('fr-FR')}</td>
                        {isAdmin && (
                          <td>
                            <button
                              onClick={() => supprimerDocument(doc.id, doc.nom)}
                              className="btn-ghost"
                              style={{ color: '#ef4444', padding: '2px 8px', fontSize: 13 }}
                              title="Supprimer"
                            >
                              ✕
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* V3 — Configuration IA (admin uniquement) */}
        {isAdmin && (
          <section className="section">
            <div className="section-header">
              <h2>Configuration IA</h2>
              <button onClick={chargerConfig} className="btn-secondary">
                {showConfig ? 'Masquer' : 'Configurer'}
              </button>
            </div>
            {showConfig && (
              <form onSubmit={sauvegarderConfig} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label>Prompt système global</label>
                  <textarea
                    value={configPrompt}
                    onChange={e => setConfigPrompt(e.target.value)}
                    placeholder="Consignes spécifiques pour l'IA sur ce projet..."
                    rows={4}
                    style={{ fontFamily: 'inherit' }}
                  />
                </div>
                <div className="form-group">
                  <label>Seuils de tolérance (JSON)</label>
                  <textarea
                    value={configSeuils}
                    onChange={e => setConfigSeuils(e.target.value)}
                    placeholder='{"ecart_puissance": {"vigilance": 5, "bloquant": 10}}'
                    rows={3}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>
                <div className="form-group">
                  <label>Vocabulaire métier (JSON)</label>
                  <textarea
                    value={configVocab}
                    onChange={e => setConfigVocab(e.target.value)}
                    placeholder='{"local CTA": ["local VMC", "local ventilation"]}'
                    rows={3}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>
                <div className="form-group">
                  <label>Convention de nommage</label>
                  <input
                    value={configNommage}
                    onChange={e => setConfigNommage(e.target.value)}
                    placeholder="TYPE_INTERVENANT_vX_STATUT.ext"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" disabled={configSaving} className="btn-primary">
                    {configSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                  <button type="button" onClick={() => setShowConfig(false)} className="btn-ghost">Fermer</button>
                  {configMsg && <span className={configMsg.includes('Erreur') ? 'error-msg' : 'text-muted'} style={{ fontSize: 13 }}>{configMsg}</span>}
                </div>
              </form>
            )}
          </section>
        )}

        {/* Membres */}
        <section className="section">
          <div className="section-header">
            <h2>Membres du projet</h2>
            {isAdmin && (
              <button onClick={() => setShowInvite(!showInvite)} className="btn-secondary">
                + Inviter
              </button>
            )}
          </div>

          {showInvite && (
            <form onSubmit={inviterMembre} className="card form-inline" style={{ marginBottom: 16 }}>
              <input
                type="email"
                value={emailInvite}
                onChange={e => setEmailInvite(e.target.value)}
                placeholder="email@expert.fr"
                required
              />
              <select value={roleInvite} onChange={e => setRoleInvite(e.target.value)} style={{ width: 'auto' }}>
                <option value="moa">MOA</option>
                <option value="architecte">Architecte</option>
                <option value="bet_fluides">BET Fluides</option>
                <option value="bet_thermique">BET Thermique</option>
                <option value="bet_structure">BET Structure</option>
                <option value="bet_electricite">BET Électricité</option>
                <option value="bet_vrd">BET VRD</option>
                <option value="bet_geotechnique">BET Géotechnique</option>
                <option value="economiste">Économiste</option>
                <option value="assistant_moa">Assistant MOA</option>
                <option value="bet_hqe">BET HQE</option>
                <option value="acousticien">Acousticien</option>
                <option value="bureau_controle">Bureau de contrôle</option>
              </select>
              <button type="submit" className="btn-primary">Inviter</button>
              <button type="button" onClick={() => { setShowInvite(false); setInviteError('') }} className="btn-ghost">Annuler</button>
              {inviteError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="error-msg">{inviteError}</span>
                  {inviteError.toLowerCase().includes('compte') && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => navigate('/users')}
                    >
                      Créer le compte
                    </button>
                  )}
                </div>
              )}
            </form>
          )}

          <div className="membres-list">
            {projet.membres.map(m => (
              <div key={m.id} className={`membre-chip ${m.user.role === 'bureau_controle' ? 'membre-chip-bc' : ''}`}>
                <strong>{m.user.nom}</strong>
                <span className="text-muted">{m.user.role?.replace(/_/g, ' ')}</span>
                {m.user.role === 'bureau_controle' && <span className="badge-readonly">lecture seule</span>}
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* V3 — Modale résolution alerte */}
      {showResolModal && (
        <div className="modal-overlay" onClick={() => setShowResolModal(null)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Résoudre l'alerte</h3>
              <button className="btn-ghost" onClick={() => setShowResolModal(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <div className="form-group">
              <label>Type de résolution</label>
              <select value={resolType} onChange={e => setResolType(e.target.value)}>
                <option value="manuelle">Manuelle</option>
                <option value="automatique">Automatique</option>
              </select>
            </div>
            <div className="form-group">
              <label>Justification / dérogation (optionnel)</label>
              <textarea
                value={resolJustif}
                onChange={e => setResolJustif(e.target.value)}
                placeholder="Expliquez la raison de la résolution ou dérogation..."
                rows={3}
              />
            </div>
            <div className="form-actions" style={{ gap: 8 }}>
              <button onClick={() => resoudreAlerte(showResolModal)} className="btn-success">
                Confirmer
              </button>
              <button onClick={() => creerArbitrage(showResolModal)} className="btn-secondary">
                Arbitrage MOA
              </button>
              <button onClick={() => setShowResolModal(null)} className="btn-ghost">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showLexique && <LexiqueModal onClose={() => setShowLexique(false)} />}

      {showEditProjet && (
        <div className="modal-overlay" onClick={() => setShowEditProjet(false)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifier le projet</h3>
              <button className="btn-ghost" onClick={() => setShowEditProjet(false)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <form onSubmit={sauvegarderProjet}>
              <div style={{ overflowY: 'auto', maxHeight: '65vh', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
                <div className="form-group">
                  <label>Nom du projet *</label>
                  <input value={editNom} onChange={e => setEditNom(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Client / Maître d'ouvrage *</label>
                  <input value={editClient} onChange={e => setEditClient(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Adresse</label>
                  <input value={editAdresse} onChange={e => setEditAdresse(e.target.value)} placeholder="Adresse du projet" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Type de bâtiment</label>
                    <select value={editTypeBatiment} onChange={e => setEditTypeBatiment(e.target.value)}>
                      <option value="">— Non défini —</option>
                      <option value="logements_collectifs">Logements collectifs</option>
                      <option value="bureaux">Bureaux</option>
                      <option value="erp">ERP</option>
                      <option value="industrie">Industrie</option>
                      <option value="mixte">Mixte</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Énergie retenue</label>
                    <select value={editEnergieRetenue} onChange={e => setEditEnergieRetenue(e.target.value)}>
                      <option value="">— Non défini —</option>
                      <option value="gaz">Gaz</option>
                      <option value="electricite">Électricité</option>
                      <option value="pac">PAC</option>
                      <option value="geothermie">Géothermie</option>
                      <option value="bois">Bois</option>
                      <option value="mixte">Mixte</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Nombre de niveaux</label>
                    <input type="number" min="1" value={editNombreNiveaux} onChange={e => setEditNombreNiveaux(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>SHON (m²)</label>
                    <input type="number" min="0" step="0.1" value={editShon} onChange={e => setEditShon(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Zone climatique</label>
                    <select value={editZoneClimatique} onChange={e => setEditZoneClimatique(e.target.value)}>
                      <option value="">— Non défini —</option>
                      {['H1a','H1b','H1c','H2a','H2b','H2c','H2d','H3'].map(z => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                  {(editTypeBatiment === 'logements_collectifs' || editTypeBatiment === 'mixte') && (
                    <div className="form-group">
                      <label>Nombre de logements</label>
                      <input type="number" min="1" value={editNombreLogements} onChange={e => setEditNombreLogements(e.target.value)} />
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editClassementErp} onChange={e => setEditClassementErp(e.target.checked)} />
                    Classement ERP
                  </label>
                </div>
                {editClassementErp && (
                  <div className="form-group">
                    <label>Type ERP</label>
                    <input value={editTypeErp} onChange={e => setEditTypeErp(e.target.value)} placeholder="M, J, U, W, PS..." />
                  </div>
                )}
              </div>
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button type="submit" disabled={editEnCours} className="btn-primary">
                  {editEnCours ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button type="button" onClick={() => setShowEditProjet(false)} className="btn-ghost">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
