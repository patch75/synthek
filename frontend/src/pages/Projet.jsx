import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
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

function FaitsModal({ doc, onClose }) {
  const [faits, setFaits] = useState(null)

  useEffect(() => {
    api.get(`/documents/${doc.id}/faits`).then(r => setFaits(r.data))
  }, [doc.id])

  const LABELS = {
    quantite: 'Quantités', materiau: 'Matériaux', dimension: 'Dimensions',
    norme: 'Normes', performance: 'Performances', equipement: 'Équipements', contrainte: 'Contraintes'
  }

  const groupes = faits ? faits.filter(f => f.valeur && f.valeur.trim().toLowerCase() !== 'n/a').reduce((acc, f) => {
    if (!acc[f.categorie]) acc[f.categorie] = []
    acc[f.categorie].push(f)
    return acc
  }, {}) : {}

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: 15 }}>Faits extraits — {doc.nom}</h3>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        {faits === null ? (
          <p className="text-muted">Chargement...</p>
        ) : Object.keys(groupes).length === 0 ? (
          <p className="text-muted">Aucun fait extrait pour ce document.</p>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '65vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(groupes).map(([cat, items]) => (
              <div key={cat}>
                <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  {LABELS[cat] || cat} ({items.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{f.sujet}</span>
                      <span style={{ color: '#7c3aed', fontWeight: 700 }}>{f.valeur}{f.unite ? ` ${f.unite}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProgrammeCard({ doc, isAdmin, onDelete }) {
  const [showFaits, setShowFaits] = useState(false)
  return (
    <>
      <div className="card programme-card-inner" style={{ borderLeft: '3px solid #7c3aed', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {doc.nom}
          </p>
          <p className="text-muted text-sm" style={{ margin: '2px 0 0' }}>
            Déposé par {doc.user?.nom} · {new Date(doc.dateDepot).toLocaleDateString('fr-FR')}
            {doc.indiceRevision && <> · <strong>{doc.indiceRevision}</strong></>}
          </p>
        </div>
        <div className="programme-card-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="badge" style={{ background: '#7c3aed', color: 'white', fontSize: 11 }}>
            {doc.type.toUpperCase()}
          </span>
          <PuceCard puce={doc.puce} />
          <button onClick={() => setShowFaits(true)} className="btn-ghost" style={{ fontSize: 12, padding: '3px 10px', border: '1px solid var(--border)' }} title="Voir les données extraites">
            🔍 Données
          </button>
          {isAdmin && (
            <button onClick={onDelete} className="btn-ghost" style={{ color: '#ef4444', padding: '2px 8px', fontSize: 13 }} title="Supprimer">
              ✕
            </button>
          )}
        </div>
      </div>
      {showFaits && <FaitsModal doc={doc} onClose={() => setShowFaits(false)} />}
    </>
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
  const location = useLocation()
  const { user } = useAuth()
  const [verifEnCours, setVerifEnCours] = useState(false)
  const [verifMsg, setVerifMsg] = useState(null)
  const [analyseBg, setAnalyseBg] = useState(false) // polling en cours
  const [analyseTimer, setAnalyseTimer] = useState(0)
  const pollingRef = useRef(null)
  const timerRef = useRef(null)
  const puceDetecteeRef = useRef(false)
  const stableCyclesRef = useRef(0)
  const lastAlertCountRef = useRef(-1)
  const { theme, toggleTheme } = useTheme()
  const [projet, setProjet] = useState(null)
  const [alertes, setAlertes] = useState([])
  const [alerteSourceOuverte, setAlerteSourceOuverte] = useState(null)
  const [alerteDpgfOuverte, setAlerteDpgfOuverte] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [emailInvite, setEmailInvite] = useState('')
  const [roleInvite, setRoleInvite] = useState('moa')
  const [inviteError, setInviteError] = useState('')
  const [showPhase, setShowPhase] = useState(false)
  const [phaseEnCours, setPhaseEnCours] = useState(false)
  const [phaseMsg, setPhaseMsg] = useState(null)
  const [certEnCours, setCertEnCours] = useState(false)
  const [rapportEnCours, setRapportEnCours] = useState(false)
  const [rapportMsg, setRapportMsg] = useState(null)
  const [showJalon, setShowJalon] = useState(false)
  const [jalonChoisi, setJalonChoisi] = useState('DCE')
  const [showLexique, setShowLexique] = useState(false)
  const [showAlertes, setShowAlertes] = useState(false)
  const [alertesGroupesOuverts, setAlertesGroupesOuverts] = useState(new Set())
  const [filtresCriticite, setFiltresCriticite] = useState(new Set())
  const [filtreGroupe, setFiltreGroupe] = useState('')
  const [programmesOuverts, setProgrammesOuverts] = useState(new Set())
  const [showDeleteDoc, setShowDeleteDoc] = useState(null) // { id, nom }
  const [deleteResoudreAlertes, setDeleteResoudreAlertes] = useState(false)
  const [showComparerModal, setShowComparerModal] = useState(null) // { id, nom }
  const [showTexteModal, setShowTexteModal] = useState(null) // { id, nom, contenuTexte, loading }
  const [showPreAnalyse, setShowPreAnalyse] = useState(null) // { loading, data, error }
  const [preAnalyseFeedback, setPreAnalyseFeedback] = useState({}) // { idx: 'ok'|'fp' }

  const [triDoc, setTriDoc] = useState({ col: 'dateDepot', dir: 'desc' })
  const [modifierEnCours, setModifierEnCours] = useState(null) // docId en cours d'upload
  const [comparerIdsRef, setComparerIdsRef] = useState([])
  const [comparerMode, setComparerMode] = useState('technique')
  const [comparerEnCours, setComparerEnCours] = useState(false)
  const [comparerModele, setComparerModele] = useState('sonnet')
  const [showEditProjet, setShowEditProjet] = useState(false)
  const [editMeta, setEditMeta] = useState({})

  const TYPES_OPERATION = [
    'Logements collectifs neufs',
    'Logements individuels groupés neufs',
    'Logements collectifs neufs et individuels neufs',
    'Réhabilitation logements collectifs',
  ]
  const RT_OPTIONS = [
    { value: 'RT2012', label: 'RT2012', detail: 'PC déposé avant le 01/01/2022' },
    { value: 'RE2020_2022', label: 'RE2020 — Seuil 2022', detail: 'PC déposé entre 01/01/2022 et 31/12/2024' },
    { value: 'RE2020_2025', label: 'RE2020 — Seuil 2025', detail: 'PC déposé entre 01/01/2025 et 31/12/2027' },
    { value: 'RE2020_2028', label: 'RE2020 — Seuil 2028', detail: 'PC déposé à partir du 01/01/2028 ou avance de phase / exigence PLUi' },
    { value: 'RT_existant_elements', label: 'RT bâtiments existants par éléments', detail: '' },
    { value: 'RT_existant_global', label: 'RT bâtiments existants global', detail: '' },
  ]
  const ZONES_CLIM = ['H1a', 'H1b', 'H1c', 'H2a', 'H2b', 'H2c', 'H2d', 'H3']
  const LABELS_OPTIONS = ['NF Habitat', 'NF Habitat HQE', 'BBCA', 'E+C-', 'Aucune']

  function getMeta() {
    try { return JSON.parse(projet.metadonnees || '{}') } catch { return {} }
  }
  const [showIntervenants, setShowIntervenants] = useState(false)
  const [editIntervenants, setEditIntervenants] = useState(false)

  const INTERVENANTS_BASE = [
    { role: 'MOA', label: 'Maître d\'ouvrage (MOA)' },
    { role: 'MOE', label: 'Maître d\'œuvre d\'exécution (MOE)' },
    { role: 'Architecte', label: 'Architecte mandataire' },
    { role: 'BET Structure', label: 'Bureau d\'études Structure' },
    { role: 'BET Fluides', label: 'Bureau d\'études Fluides / CVC / Plomberie' },
    { role: 'BET Électricité', label: 'Bureau d\'études Électricité / CFO-CFA' },
    { role: 'BET VRD', label: 'Bureau d\'études VRD / Réseaux extérieurs' },
    { role: 'BCT', label: 'Bureau de contrôle technique (BCT)' },
    { role: 'Économiste', label: 'Économiste de la construction' },
  ]
  const BCT_MISSIONS = ['L', 'S', 'Ph', 'Hand', 'Th', 'Élec']

  function getIntervenants() {
    try { return JSON.parse(projet.intervenants || '[]') } catch { return [] }
  }

  function getIntervenant(role) {
    return getIntervenants().find(i => i.role === role) || { role, societe: '', contact: '', email: '', tel: '', missions: [] }
  }

  const [intervenantsEdit, setIntervenantsEdit] = useState([])
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
  const [editBatiments, setEditBatiments] = useState([]) // [{ id?, nom, typologies[] }]
  const [editEnCours, setEditEnCours] = useState(false)

  const TYPOLOGIES_BASE = ['Social LLS', 'Social LLI', 'Accession BRS', 'Accession standard', 'Accession premium / Attique']
  const [typologiesCustom, setTypologiesCustom] = useState([])
  const [nouvelleTypologie, setNouvelleTypologie] = useState(null)
  const TYPOLOGIES_OPTIONS = [...TYPOLOGIES_BASE, ...typologiesCustom.map(t => t.nom)]

  // Bâtiments
  const [showBatiments, setShowBatiments] = useState(false)
  const [showProgrammes, setShowProgrammes] = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)
  const [batimentEditIdx, setBatimentEditIdx] = useState(null)
  const [batimentEditNom, setBatimentEditNom] = useState('')
  const [batimentEditTypos, setBatimentEditTypos] = useState([])
  const [showAddBatiment, setShowAddBatiment] = useState(false)
  const [newBatimentNom, setNewBatimentNom] = useState('')
  const [newBatimentTypos, setNewBatimentTypos] = useState([])
  // Import granulométrie depuis fichier architecte
  const [importGranuloStep, setImportGranuloStep] = useState(0) // 0=caché, 1=proposition, 2=résultat
  const [importGranuloLoading, setImportGranuloLoading] = useState(false)
  const [importGranuloError, setImportGranuloError] = useState(null)
  const [importGranuloFichierB64, setImportGranuloFichierB64] = useState(null)
  const [importGranuloNomFichier, setImportGranuloNomFichier] = useState('')
  const [propositionRegroupement, setPropositionRegroupement] = useState(null) // { groupName: [montees] }
  const [regroupementEdite, setRegroupementEdite] = useState(null)
  const [granulometreD1, setGranulometreD1] = useState(null)

  // V3 — Config IA
  const [showConfig, setShowConfig] = useState(false)
  const [configPrompt, setConfigPrompt] = useState('')
  const [configSeuils, setConfigSeuils] = useState('')
  const [configVocabEntries, setConfigVocabEntries] = useState([]) // [{ terme, definition }]
  const [showVocabImport, setShowVocabImport] = useState(false)
  const [vocabImportText, setVocabImportText] = useState('')
  const [configNommage, setConfigNommage] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  // V3 — Résolution alerte enrichie
  const [showResolModal, setShowResolModal] = useState(null)
  const [resolType, setResolType] = useState('manuelle')
  const [resolJustif, setResolJustif] = useState('')

  // Sous-programmes
  const [showSousProgrammes, setShowSousProgrammes] = useState(false)
  const dragSpIdx = useRef(null)
  const dragBatIdx = useRef(null)
  const [nouveauSp, setNouveauSp] = useState('')
  const [spEnCours, setSpEnCours] = useState(false)
  const [spRenomId, setSpRenomId] = useState(null)
  const [spRenomNom, setSpRenomNom] = useState('')

  useEffect(() => {
    Promise.all([
      api.get(`/projets/${id}`),
      api.get(`/alertes/${id}`),
      api.get('/typologies')
    ]).then(([pRes, aRes, tRes]) => {
      setProjet(pRes.data)
      setAlertes(aRes.data)
      setTypologiesCustom(tRes.data)
      // Détecter format D1 et restaurer le tableau granulométrie
      if (pRes.data.batimentsComposition) {
        try {
          const bats = JSON.parse(pRes.data.batimentsComposition)
          if (bats?.length && ('LLI' in bats[0] || 'acces_std' in bats[0])) {
            setGranulometreD1({ batiments: bats, total_logements: bats.reduce((s, b) => s + (b.nb_logements || 0), 0), donnees_manquantes: [], source: '' })
            setImportGranuloStep(2)
          }
        } catch {}
      }
      setLoading(false)
    })
  }, [id])

  // Polling après upload
  useEffect(() => {
    const newDocId = location.state?.newDocId
    if (!newDocId) return
    const storageKey = `polling_done_${newDocId}`
    if (sessionStorage.getItem(storageKey)) return
    sessionStorage.setItem(storageKey, '1')
    setAnalyseBg(true)
    setAnalyseTimer(0)
    puceDetecteeRef.current = false
    stableCyclesRef.current = 0
    lastAlertCountRef.current = -1
    const start = Date.now()
    const TIMEOUT = 600000 // 10 min max

    timerRef.current = setInterval(() => {
      setAnalyseTimer(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    pollingRef.current = setInterval(async () => {
      if (Date.now() - start > TIMEOUT) {
        clearInterval(pollingRef.current)
        clearInterval(timerRef.current)
        setAnalyseBg(false)
        return
      }
      try {
        const [pRes, aRes] = await Promise.all([
          api.get(`/projets/${id}`),
          api.get(`/alertes/${id}`)
        ])
        const doc = pRes.data.documents?.find(d => d.id === newDocId)
        setProjet(pRes.data)
        setAlertes(aRes.data)

        if (doc?.puce || !doc) {
          clearInterval(pollingRef.current)
          clearInterval(timerRef.current)
          setAnalyseBg(false)
        }
      } catch {
        clearInterval(pollingRef.current)
        clearInterval(timerRef.current)
        setAnalyseBg(false)
      }
    }, 3000)

    return () => {
      clearInterval(pollingRef.current)
      clearInterval(timerRef.current)
    }
  }, [location.state?.newDocId, id])

  async function chargerConfig() {
    try {
      const res = await api.get(`/projets/${id}/config`)
      if (res.data) {
        setConfigPrompt(res.data.promptSystemeGlobal || '')
        setConfigSeuils(res.data.seuilsTolerance ? JSON.stringify(res.data.seuilsTolerance, null, 2) : '')
        setConfigVocabEntries(res.data.vocabulaireMetier ? Object.entries(res.data.vocabulaireMetier).map(([terme, definition]) => ({ terme, definition: Array.isArray(definition) ? definition.join(', ') : String(definition) })) : [])
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
        vocabulaireMetier: configVocabEntries.filter(e => e.terme.trim()).length > 0
          ? Object.fromEntries(configVocabEntries.filter(e => e.terme.trim()).map(e => [e.terme.trim(), e.definition.trim()]))
          : null
      }
      await api.post(`/projets/${id}/config`, body)
      setConfigMsg('Configuration sauvegardée')
    } catch (err) {
      setConfigMsg(err.response?.data?.error || 'Erreur JSON ou serveur')
    } finally {
      setConfigSaving(false)
    }
  }

  function getBatiments() {
    try { return projet?.batimentsComposition ? JSON.parse(projet.batimentsComposition) : [] }
    catch { return [] }
  }

  async function saveBatiments(newBats) {
    const res = await api.patch(`/projets/${id}`, {
      batimentsComposition: newBats.length ? JSON.stringify(newBats) : null
    })
    setProjet(prev => ({ ...prev, batimentsComposition: res.data.batimentsComposition }))
  }

  async function ajouterBatimentLocal() {
    if (!newBatimentNom.trim()) return
    const updated = [...getBatiments(), { nom: newBatimentNom.trim(), typologies: newBatimentTypos }]
    await saveBatiments(updated)
    setNewBatimentNom(''); setNewBatimentTypos([]); setShowAddBatiment(false)
  }

  async function importerGranuloFichier(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportGranuloError(null)
    setImportGranuloLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      const b64 = btoa(binary)
      setImportGranuloFichierB64(b64)
      setImportGranuloNomFichier(file.name)
      const res = await api.post(`/projets/${id}/granulometrie/proposer`, { fichier: b64, nom_fichier: file.name })
      setPropositionRegroupement(res.data.proposition_regroupement)
      setRegroupementEdite(JSON.parse(JSON.stringify(res.data.proposition_regroupement)))
      setImportGranuloStep(1)
    } catch (err) {
      setImportGranuloError(err.response?.data?.error || err.message)
    } finally {
      setImportGranuloLoading(false)
    }
  }

  async function confirmerGranulo() {
    if (!regroupementEdite) return
    setImportGranuloLoading(true)
    setImportGranuloError(null)
    try {
      const res = await api.post(`/projets/${id}/granulometrie/import`, {
        fichier: importGranuloFichierB64,
        nom_fichier: importGranuloNomFichier,
        regroupement: regroupementEdite
      })
      setGranulometreD1(res.data)
      setProjet(prev => ({ ...prev, batimentsComposition: JSON.stringify(res.data.batiments) }))
      setImportGranuloStep(2)
    } catch (err) {
      setImportGranuloError(err.response?.data?.error || err.message)
    } finally {
      setImportGranuloLoading(false)
    }
  }

  async function sauvegarderBatimentEdit(idx) {
    if (!batimentEditNom.trim()) return
    const updated = getBatiments().map((b, i) => i === idx ? { nom: batimentEditNom.trim(), typologies: batimentEditTypos } : b)
    await saveBatiments(updated)
    setBatimentEditIdx(null)
  }

  async function supprimerBatimentLocal(idx) {
    if (!confirm('Supprimer ce bâtiment ?')) return
    await saveBatiments(getBatiments().filter((_, i) => i !== idx))
  }

  function ouvrirEditProjet() {
    setEditNom(projet.nom)
    setEditClient(projet.client)
    setEditMeta(getMeta())
    setShowEditProjet(true)
  }

  async function sauvegarderProjet(e) {
    e.preventDefault()
    setEditEnCours(true)
    try {
      const res = await api.patch(`/projets/${id}`, { nom: editNom, client: editClient, metadonnees: editMeta })
      setProjet(prev => ({ ...prev, ...res.data }))
      setShowEditProjet(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la modification')
    } finally {
      setEditEnCours(false)
    }
  }

  async function modifierDocument(doc, fichier) {
    setModifierEnCours(doc.id)
    try {
      const formData = new FormData()
      formData.append('fichier', fichier)
      await api.put(`/documents/${doc.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const [pRes, aRes] = await Promise.all([api.get(`/projets/${id}`), api.get(`/alertes/${id}`)])
      setProjet(pRes.data)
      setAlertes(aRes.data)
    } catch (err) {
      console.error('Erreur mise à jour document:', err)
    } finally {
      setModifierEnCours(null)
    }
  }

  async function ouvrirTexteDoc(doc) {
    setShowTexteModal({ id: doc.id, nom: doc.nom, contenuTexte: null, loading: true })
    try {
      const res = await api.get(`/documents/${doc.id}/texte`)
      setShowTexteModal({ id: doc.id, nom: doc.nom, contenuTexte: res.data.contenuTexte, loading: false })
    } catch {
      setShowTexteModal({ id: doc.id, nom: doc.nom, contenuTexte: null, loading: false, error: true })
    }
  }

  async function lancerComparaison() {
    if (!showComparerModal) return
    setComparerEnCours(true)
    try {
      await api.post(`/documents/${showComparerModal.id}/comparer`, { modeleIA: comparerModele, idsRef: comparerIdsRef, modeVerification: comparerMode })
      setShowComparerModal(null)
      // Démarrer le polling pour récupérer les alertes
      setAnalyseBg(true)
      setAnalyseTimer(0)
      stableCyclesRef.current = 0
      lastAlertCountRef.current = -1
      const start = Date.now()
      clearInterval(pollingRef.current)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setAnalyseTimer(Math.floor((Date.now() - start) / 1000)), 1000)
      pollingRef.current = setInterval(async () => {
        if (Date.now() - start > 600000) {
          clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false); return
        }
        try {
          const [pRes, aRes] = await Promise.all([api.get(`/projets/${id}`), api.get(`/alertes/${id}`)])
          setProjet(pRes.data)
          setAlertes(aRes.data)
          const countActif = aRes.data.filter(a => a.statut === 'active').length
          if (countActif !== lastAlertCountRef.current) {
            stableCyclesRef.current = 0
            lastAlertCountRef.current = countActif
          } else if (countActif > 0 || Date.now() - start > 180000) {
            stableCyclesRef.current++
            if (stableCyclesRef.current >= 20) {
              clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false)
            }
          }
        } catch { clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false) }
      }, 3000)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors du lancement')
    } finally {
      setComparerEnCours(false)
    }
  }

  async function supprimerDocument() {
    const { id: docId } = showDeleteDoc
    try {
      await api.delete(`/documents/${docId}?resoudreAlertes=${deleteResoudreAlertes}`)
      setProjet(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }))
      if (deleteResoudreAlertes) {
        setAlertes(prev => prev.map(a =>
          a.documents?.some(d => d.documentId === docId) ? { ...a, statut: 'resolue' } : a
        ))
      }
      setShowDeleteDoc(null)
      setDeleteResoudreAlertes(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  async function verifierAlertesIA() {
    setVerifEnCours(true)
    setVerifMsg(null)
    try {
      const res = await api.post(`/ia/verifier-alertes/${id}`)
      const { verifiees, faux_positifs } = res.data
      const [pRes, aRes] = await Promise.all([api.get(`/projets/${id}`), api.get(`/alertes/${id}`)])
      setProjet(pRes.data)
      setAlertes(aRes.data)
      setVerifMsg(`${verifiees} alertes vérifiées — ${faux_positifs} faux positif${faux_positifs > 1 ? 's' : ''} écartés`)
    } catch {
      setVerifMsg('Erreur lors de la vérification')
    } finally {
      setVerifEnCours(false)
    }
  }

  async function toutResoudre() {
    if (!confirm(`Résoudre les ${alertesActives.length} alertes actives ?`)) return
    await Promise.all(alertesActives.map(a =>
      api.patch(`/alertes/${a.id}/resoudre`, { resoluePar: 'manuelle', justificationDerogation: null })
    ))
    setAlertes(prev => prev.map(a => ({ ...a, statut: 'resolue' })))
  }

  async function toutSupprimer() {
    if (!confirm(`Supprimer définitivement les ${alertesActives.length} alertes actives ? Cette action est irréversible.`)) return
    await api.delete(`/alertes/projet/${id}/toutes`)
    setAlertes(prev => prev.filter(a => a.statut !== 'active'))
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

  async function ajouterSousProgramme(e) {
    e.preventDefault()
    if (!nouveauSp.trim()) return
    setSpEnCours(true)
    try {
      const res = await api.post(`/projets/${id}/sous-programmes`, { nom: nouveauSp.trim() })
      setProjet(prev => ({ ...prev, sousProgrammes: [...(prev.sousProgrammes || []), res.data] }))
      setNouveauSp('')
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur')
    } finally {
      setSpEnCours(false)
    }
  }

  async function renommerSousProgramme(spId) {
    if (!spRenomNom.trim()) return
    try {
      const res = await api.patch(`/projets/${id}/sous-programmes/${spId}`, { nom: spRenomNom.trim() })
      setProjet(prev => ({ ...prev, sousProgrammes: prev.sousProgrammes.map(sp => sp.id === spId ? res.data : sp) }))
      setSpRenomId(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur')
    }
  }

  async function supprimerSousProgramme(spId) {
    if (!confirm('Supprimer ce sous-programme ? Les documents associés ne seront pas supprimés.')) return
    try {
      await api.delete(`/projets/${id}/sous-programmes/${spId}`)
      setProjet(prev => ({ ...prev, sousProgrammes: prev.sousProgrammes.filter(sp => sp.id !== spId) }))
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur')
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

  // Grouper les alertes par sous-programme extrait du label [TYPE — SousProgramme]
  function extraireGroupeAlerte(message) {
    const m = message.match(/\[.*?—\s*(.+?)\]/)
    if (m) return m[1].trim()
    return 'Général'
  }
  const groupesDisponibles = [...new Set(alertesActives.map(a => extraireGroupeAlerte(a.message)))].sort()
  const alertesFiltrees = alertesActives.filter(a => {
    if (filtresCriticite.size > 0 && !filtresCriticite.has(a.criticite || '')) return false
    if (filtreGroupe && extraireGroupeAlerte(a.message) !== filtreGroupe) return false
    return true
  })
  const alertesParGroupe = alertesFiltrees.reduce((acc, a) => {
    const g = extraireGroupeAlerte(a.message)
    if (!acc[g]) acc[g] = []
    acc[g].push(a)
    return acc
  }, {})
  const toggleGroupeAlerte = (g) => setAlertesGroupesOuverts(prev => {
    const next = new Set(prev)
    next.has(g) ? next.delete(g) : next.add(g)
    return next
  })
  const toggleProgramme = (key) => setProgrammesOuverts(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  return (
    <div className="page">
      <header className="topbar">
        <img src={logo} alt="synthek" className="topbar-logo" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
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

        {/* Banner analyse en arrière-plan */}
        {analyseBg && (() => {
          const sectionsAnalysees = alertesActives.reduce((acc, a) => {
            const match = a.message.match(/^\[([^\]]+)\]/)
            if (!match) return acc
            const parts = match[1].split(' — ')
            const section = parts[parts.length - 1]
            if (!acc[section]) acc[section] = 0
            acc[section]++
            return acc
          }, {})
          const entries = Object.entries(sectionsAnalysees)
          return (
            <div className="card info-card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, animation: 'spin 1s linear infinite', display: 'inline-block', flexShrink: 0 }}>⏳</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>Analyse en cours...</p>
                  <p className="text-muted text-sm" style={{ margin: 0 }}>
                    {entries.length === 0
                      ? 'Comparaison en cours — les alertes apparaissent section par section.'
                      : `${alertesActives.length} alerte${alertesActives.length > 1 ? 's' : ''} détectée${alertesActives.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {analyseTimer}s
                </span>
                <button onClick={() => { clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: '0 4px', flexShrink: 0 }} title="Fermer">×</button>
              </div>
              {entries.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entries.map(([section, count]) => (
                    <span key={section} style={{ fontSize: 12, background: 'var(--bg-muted, #f1f5f9)', borderRadius: 4, padding: '2px 8px', color: 'var(--text)' }}>
                      ✓ {section} — {count} alerte{count > 1 ? 's' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

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
          <section className="section section--alertes">
            <div
              className="section-title-row"
              style={{ cursor: 'pointer', marginBottom: showAlertes ? 12 : 0 }}
              onClick={() => setShowAlertes(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <h2 className="section-title alert-title" style={{ marginBottom: 0 }}>
                  ⚠ {alertesActives.length} alerte{alertesActives.length > 1 ? 's' : ''} active{alertesActives.length > 1 ? 's' : ''}
                </h2>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showAlertes ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
              </div>
              <div className="section-title-btns">
                {showAlertes && (
                  <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/historique`) }} className="alerte-action-btn" style={{ background: '#0f766e' }}>Historique</button>
                )}
                {isAdmin && alertesActives.length > 1 && showAlertes && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); verifierAlertesIA() }}
                      disabled={verifEnCours}
                      className="alerte-action-btn"
                      style={{ background: '#7c3aed', opacity: verifEnCours ? 0.6 : 1 }}
                    >
                      {verifEnCours ? '⏳ Vérification...' : '🤖 Vérifier avec IA'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); toutResoudre() }}
                      className="alerte-action-btn"
                      style={{ background: '#2563eb' }}
                    >
                      Tout résoudre
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); toutSupprimer() }}
                      className="alerte-action-btn"
                      style={{ background: '#ef4444' }}
                    >
                      Tout supprimer
                    </button>
                  </>
                )}
              </div>
            </div>
            {showAlertes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {verifMsg && (
                <p style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, margin: 0, padding: '6px 10px', background: '#ede9fe', borderRadius: 6 }}>
                  🤖 {verifMsg}
                </p>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                <strong>Résoudre</strong> archive l'alerte dans l'historique · <strong>Supprimer</strong> l'efface définitivement
              </p>
              {/* Filtres */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {[{ label: 'CRITIQUE', bg: '#dc2626' }, { label: 'MAJEUR', bg: '#ea580c' }, { label: 'MINEUR', bg: '#ca8a04' }].map(({ label, bg }) => {
                  const actif = filtresCriticite.has(label)
                  return (
                    <button
                      key={label}
                      onClick={() => setFiltresCriticite(prev => {
                        const next = new Set(prev)
                        actif ? next.delete(label) : next.add(label)
                        return next
                      })}
                      style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: `2px solid ${bg}`, background: actif ? bg : 'transparent', color: actif ? 'white' : bg, cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                      {label}
                    </button>
                  )
                })}
                {groupesDisponibles.length > 1 && (
                  <select
                    value={filtreGroupe}
                    onChange={e => setFiltreGroupe(e.target.value)}
                    style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: filtreGroupe ? 'var(--primary)' : 'var(--bg-muted)', color: filtreGroupe ? 'white' : 'var(--text)', cursor: 'pointer' }}
                  >
                    <option value=''>Tous les bâtiments</option>
                    {groupesDisponibles.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                {(filtresCriticite.size > 0 || filtreGroupe) && (
                  <button
                    onClick={() => { setFiltresCriticite(new Set()); setFiltreGroupe('') }}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    ✕ Réinitialiser
                  </button>
                )}
                {(filtresCriticite.size > 0 || filtreGroupe) && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                    {alertesFiltrees.length} / {alertesActives.length} alertes
                  </span>
                )}
              </div>
                {Object.entries(alertesParGroupe).sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([groupe, alertesGroupe]) => (
                  <div key={groupe} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleGroupeAlerte(groupe)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-muted)', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {groupe}
                        <span style={{ marginLeft: 8, background: '#ef4444', color: 'white', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                          {alertesGroupe.length}
                        </span>
                      </span>
                      <span style={{ fontSize: 14, color: 'var(--text-muted)', transform: alertesGroupesOuverts.has(groupe) ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                    </div>
                    {alertesGroupesOuverts.has(groupe) && (
                      <div className="alertes-list" style={{ padding: '8px 0', margin: 0 }}>
                        {alertesGroupe.map(alerte => (
                          <div key={alerte.id} className="card alerte-card" style={{ margin: '0 8px 8px', borderRadius: 6 }}>
                            {(() => {
                              const CRITICITE_STYLE = {
                                CRITIQUE: { background: '#dc2626', color: 'white' },
                                MAJEUR:   { background: '#ea580c', color: 'white' },
                                MINEUR:   { background: '#ca8a04', color: 'white' },
                              }
                              const criticiteStyle = alerte.criticite ? CRITICITE_STYLE[alerte.criticite] : null
                              const m = alerte.message.match(/^\[([^\]]+)\]\s*(.*)$/s)
                              if (m) return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>#{alerte.id}</span>
                                    {criticiteStyle && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', ...criticiteStyle }}>{alerte.criticite}</span>}
                                  </div>
                                  <div>
                                    <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 4, padding: '2px 7px' }}>{m[1]}</span>
                                  </div>
                                  <p style={{ margin: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                    {m[2].split(/(INCOHÉRENCE MAJEURE|INCOHÉRENCE)/g).map((part, i) =>
                                      (part === 'INCOHÉRENCE' || part === 'INCOHÉRENCE MAJEURE')
                                        ? <strong key={i}>{part}</strong>
                                        : part
                                    )}
                                  </p>
                                </div>
                              )
                              return (
                                <p style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginRight: 6 }}>#{alerte.id}</span>
                                  {criticiteStyle && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', marginRight: 6, ...criticiteStyle }}>{alerte.criticite}</span>}
                                  {alerte.message}
                                </p>
                              )
                            })()}
                            {(alerte.contexteSource || alerte.dpgfSource) && (
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {alerte.contexteSource && (
                                  <div>
                                    <button
                                      onClick={() => setAlerteSourceOuverte(alerteSourceOuverte === alerte.id ? null : alerte.id)}
                                      style={{ fontSize: 11, padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      {alerteSourceOuverte === alerte.id ? '▲ Masquer CCTP' : '▼ Voir CCTP'}
                                    </button>
                                    {alerteSourceOuverte === alerte.id && (
                                      <pre style={{ marginTop: 4, padding: '8px 10px', background: '#eff6ff', borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto', color: 'var(--text-muted)' }}>
                                        {alerte.contexteSource}
                                      </pre>
                                    )}
                                  </div>
                                )}
                                {alerte.dpgfSource && (
                                  <div>
                                    <button
                                      onClick={() => setAlerteDpgfOuverte(alerteDpgfOuverte === alerte.id ? null : alerte.id)}
                                      style={{ fontSize: 11, padding: '2px 8px', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      {alerteDpgfOuverte === alerte.id ? '▲ Masquer DPGF' : '▼ Voir DPGF'}
                                    </button>
                                    {alerteDpgfOuverte === alerte.id && (
                                      <pre style={{ marginTop: 4, padding: '8px 10px', background: '#f0fdf4', borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto', color: 'var(--text-muted)' }}>
                                        {alerte.dpgfSource}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="alerte-footer">
                              <span className="text-muted text-sm">
                                Documents : {alerte.documents.map(d => d.document.nom).join(', ')}
                              </span>
                              {!isBureauControle && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => { setShowResolModal(alerte.id); setResolType('manuelle'); setResolJustif('') }} className="btn-success">
                                    Résoudre
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm('Supprimer définitivement cette alerte ?')) return
                                      await api.delete(`/alertes/${alerte.id}`)
                                      setAlertes(prev => prev.filter(a => a.id !== alerte.id))
                                    }}
                                    style={{ fontSize: 12, padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                  >Supprimer</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Projet */}
        {(() => {
          const m = getMeta()
          const rt = RT_OPTIONS.find(r => r.value === m.reglementation)
          const RT_COURT = {
            RT2012: 'RT2012', RE2020_2022: 'RE2020 S.2022', RE2020_2025: 'RE2020 S.2025',
            RE2020_2028: 'RE2020 S.2028', RT_existant_elements: 'RT Exist. éléments', RT_existant_global: 'RT Exist. global'
          }
          const TYPE_COURT = {
            'Logements collectifs neufs': 'LC Neuf',
            'Logements individuels groupés neufs': 'LIG Neuf',
            'Logements collectifs neufs et individuels neufs': 'Mixte Neuf',
            'Réhabilitation logements collectifs': 'Réhab.',
          }
          const champStyle = { flex: '1 1 0', minWidth: 0, borderRight: '1px solid var(--border)', padding: '10px 16px', lastChild: { borderRight: 'none' } }
          const labelStyle = { fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }
          const valStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
          const valVideStyle = { fontSize: 13, color: 'var(--text-muted)', margin: 0 }

          const champs = [
            { label: "Nom de l'opération", val: projet.nom },
            { label: "Type d'opération", val: TYPE_COURT[m.typeOperation] || m.typeOperation },
            { label: "Adresse chantier", val: m.adresse || m.commune },
            { label: "MOA / Client", val: projet.client },
            { label: "Réglementation", val: RT_COURT[m.reglementation] },
            { label: "Label / Certification", val: m.labels?.filter(l => l !== 'Aucune').join(', ') || (m.labels?.includes('Aucune') ? 'Aucune' : null) },
          ]

          return (
            <section className="section" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <h2 className="section-title" style={{ marginBottom: 0, fontSize: 14 }}>⚙ Projet</h2>
                {isAdmin && (
                  <button onClick={ouvrirEditProjet} className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)', padding: '3px 10px' }}>✎ Modifier</button>
                )}
              </div>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {champs.map((c, i) => (
                  <div key={i} style={{ ...champStyle, borderRight: i < champs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={labelStyle}>{c.label}</span>
                    {c.val ? <p style={valStyle} title={c.val}>{c.val}</p> : <p style={valVideStyle}>—</p>}
                  </div>
                ))}
              </div>
            </section>
          )
        })()}

        {/* Intervenants */}
        <section className="section">
          <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showIntervenants ? 12 : 0 }} onClick={() => setShowIntervenants(v => !v)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>👥 Intervenants</h2>
              <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showIntervenants ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
            </div>
            {isAdmin && showIntervenants && (
              <div className="section-title-btns">
                {editIntervenants ? (
                  <>
                    <button onClick={async e => {
                      e.stopPropagation()
                      await api.patch(`/projets/${id}/intervenants`, { intervenants: intervenantsEdit })
                      setProjet(prev => ({ ...prev, intervenants: JSON.stringify(intervenantsEdit) }))
                      setEditIntervenants(false)
                    }} className="btn-primary" style={{ fontSize: 13 }}>✓ Enregistrer</button>
                    <button onClick={e => { e.stopPropagation(); setEditIntervenants(false) }} className="btn-ghost" style={{ fontSize: 13 }}>Annuler</button>
                  </>
                ) : (
                  <button onClick={e => {
                    e.stopPropagation()
                    const base = INTERVENANTS_BASE.map(b => ({ ...b, ...getIntervenant(b.role), label: b.label }))
                    setIntervenantsEdit(base)
                    setEditIntervenants(true)
                  }} className="btn-ghost" style={{ fontSize: 13, border: '1px solid var(--border)' }}>✎ Modifier</button>
                )}
              </div>
            )}
          </div>

          {showIntervenants && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {INTERVENANTS_BASE.map((base, idx) => {
                const iv = getIntervenant(base.role)
                const editIv = intervenantsEdit[idx] || {}
                const vide = !iv.societe && !iv.contact && !iv.email && !iv.tel
                return (
                  <div key={base.role} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 8 }}>{base.label}</p>
                    {editIntervenants ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Société / Organisme</label>
                          <input value={editIv.societe || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, societe: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Contact</label>
                          <input value={editIv.contact || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, contact: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Email</label>
                          <input type="email" value={editIv.email || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Tél</label>
                          <input value={editIv.tel || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, tel: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        {base.role === 'BCT' && (
                          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 11 }}>Missions</label>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              {BCT_MISSIONS.map(m => (
                                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                                  <input type="checkbox" style={{ width: 'auto' }}
                                    checked={(editIv.missions || []).includes(m)}
                                    onChange={() => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, missions: (x.missions || []).includes(m) ? x.missions.filter(v => v !== m) : [...(x.missions || []), m] } : x))}
                                  /> {m}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : vide ? (
                      <p className="text-muted text-sm" style={{ margin: 0 }}>— Non renseigné</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px', fontSize: 13 }}>
                        {iv.societe && <span><strong>Société :</strong> {iv.societe}</span>}
                        {iv.contact && <span><strong>Contact :</strong> {iv.contact}</span>}
                        {iv.email && <span><strong>Email :</strong> <a href={`mailto:${iv.email}`} style={{ color: 'var(--primary)' }}>{iv.email}</a></span>}
                        {iv.tel && <span><strong>Tél :</strong> {iv.tel}</span>}
                        {base.role === 'BCT' && iv.missions?.length > 0 && (
                          <span style={{ gridColumn: '1 / -1' }}><strong>Missions :</strong> {iv.missions.join(', ')}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Bâtiments */}
        {isAdmin && (
          <section className="section section--batiments">
            <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showBatiments ? 12 : 0 }} onClick={() => setShowBatiments(v => !v)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <h2 className="section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🏢</span> Bâtiments — Granulométrie
                </h2>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showBatiments ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
              </div>
              <div className="section-title-btns">
                {showBatiments && (<>
                  <button onClick={e => { e.stopPropagation(); setShowAddBatiment(v => !v); setNewBatimentNom(''); setNewBatimentTypos([]) }} className="btn-secondary" style={{ fontSize: 13 }}>+ Ajouter</button>
                  {isAdmin && (
                    <label style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                      <input type="file" accept=".xlsx,.xlsm,.xls,.pdf" style={{ display: 'none' }} onChange={e => { setImportGranuloStep(0); setGranulometreD1(null); importerGranuloFichier(e) }} />
                      <span className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                        {importGranuloLoading ? '⏳' : '📥 Importer Excel'}
                      </span>
                    </label>
                  )}
                  <button onClick={e => { e.stopPropagation(); setNouvelleTypologie(v => v === null ? '' : null) }} className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)' }}>⚙️ Typologies</button>
                </>)}
              </div>
            </div>

            {showBatiments && (<>

            {/* Import granulométrie — Étape 1 : proposition regroupement éditable */}
            {importGranuloStep === 1 && regroupementEdite && (() => {
              // Construire la liste montée → bâtiment depuis regroupementEdite
              const monteeVersGroupe = {}
              Object.entries(regroupementEdite).forEach(([groupe, montees]) => {
                montees.forEach(m => { monteeVersGroupe[m] = groupe })
              })
              const toutesLesMontees = Object.keys(monteeVersGroupe)
              const tousLesGroupes = Object.keys(regroupementEdite)

              function changerGroupe(montee, nouveauGroupe) {
                setRegroupementEdite(prev => {
                  const next = {}
                  Object.entries(prev).forEach(([g, ms]) => {
                    next[g] = ms.filter(m => m !== montee)
                  })
                  if (!next[nouveauGroupe]) next[nouveauGroupe] = []
                  next[nouveauGroupe] = [...next[nouveauGroupe], montee]
                  // Supprimer les groupes vides
                  Object.keys(next).forEach(g => { if (next[g].length === 0) delete next[g] })
                  return next
                })
              }

              return (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#0369a1' }}>📥 Proposition de regroupement — vérifier et corriger si besoin</p>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 10 }}>
                    <thead>
                      <tr style={{ background: '#e0f2fe', textAlign: 'left' }}>
                        <th style={{ padding: '5px 10px', fontWeight: 700 }}>Montée</th>
                        <th style={{ padding: '5px 10px', fontWeight: 700 }}>Bâtiment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {toutesLesMontees.map(montee => (
                        <tr key={montee} style={{ borderTop: '1px solid #bae6fd' }}>
                          <td style={{ padding: '5px 10px', fontWeight: 600 }}>{montee}</td>
                          <td style={{ padding: '5px 10px' }}>
                            <select
                              value={monteeVersGroupe[montee]}
                              onChange={e => changerGroupe(montee, e.target.value)}
                              style={{ fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1px solid #bae6fd' }}
                            >
                              {tousLesGroupes.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importGranuloError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{importGranuloError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={confirmerGranulo} className="btn-primary" style={{ fontSize: 12 }} disabled={importGranuloLoading}>
                      {importGranuloLoading ? '⏳ Import...' : '✓ Confirmer et importer'}
                    </button>
                    <button onClick={() => { setImportGranuloStep(0); setImportGranuloError(null) }} className="btn-ghost" style={{ fontSize: 12 }}>Annuler</button>
                  </div>
                </div>
              )
            })()}

            {/* Import granulométrie — Étape 2 : tableau D1 */}
            {importGranuloStep === 2 && granulometreD1 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#15803d' }}>✅ {granulometreD1.total_logements} logements importés depuis {granulometreD1.source}</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#dcfce7', textAlign: 'left' }}>
                        {['Bâtiment', 'Montées', 'Logements', 'LLI', 'LLS', 'BRS', 'Acc.std', 'Acc.premium', 'Villas', 'Fiabilité'].map(h => (
                          <th key={h} style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {granulometreD1.batiments.map((b, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #bbf7d0' }}>
                          <td style={{ padding: '4px 8px', fontWeight: 700 }}>{b.nom}</td>
                          <td style={{ padding: '4px 8px', color: '#64748b' }}>{b.montees?.join(', ')}</td>
                          <td style={{ padding: '4px 8px', fontWeight: 700 }}>{b.nb_logements}</td>
                          <td style={{ padding: '4px 8px' }}>{b.LLI || '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.LLS || '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.BRS || '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.acces_std || '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.acces_premium || '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.villas || '-'}</td>
                          <td style={{ padding: '4px 8px', color: b.fiabilite === 'haute' ? '#15803d' : '#f59e0b' }}>{b.fiabilite}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #86efac', background: '#dcfce7' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>TOTAL</td>
                        <td style={{ padding: '5px 8px' }}></td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.nb_logements || 0), 0)}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.LLI || 0), 0) || '-'}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.LLS || 0), 0) || '-'}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.BRS || 0), 0) || '-'}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.acces_std || 0), 0) || '-'}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.acces_premium || 0), 0) || '-'}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.villas || 0), 0) || '-'}</td>
                        <td style={{ padding: '5px 8px' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {granulometreD1.donnees_manquantes?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {granulometreD1.donnees_manquantes.map((w, i) => (
                      <p key={i} style={{ fontSize: 11, color: '#f59e0b', margin: 0 }}>⚠ {w}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setImportGranuloStep(0)} className="btn-ghost" style={{ fontSize: 12, marginTop: 8 }}>Fermer</button>
              </div>
            )}

            {importGranuloError && importGranuloStep === 0 && (
              <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>⚠ {importGranuloError}</p>
            )}

            {nouvelleTypologie !== null && (
              <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Typologies disponibles</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {typologiesCustom.map(t => (
                    <span key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ede9fe', color: '#7c3aed', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {t.nom}
                      <button onClick={async () => { await api.delete(`/typologies/${t.id}`); setTypologiesCustom(prev => prev.filter(x => x.id !== t.id)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={nouvelleTypologie}
                    onChange={e => setNouvelleTypologie(e.target.value)}
                    placeholder="Ex : Niveau Attiques, Duplex, T4..."
                    style={{ flex: 1, fontSize: 13 }}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && nouvelleTypologie.trim()) {
                        const res = await api.post('/typologies', { nom: nouvelleTypologie.trim() })
                        setTypologiesCustom(prev => [...prev, res.data])
                        setNouvelleTypologie('')
                      }
                    }}
                  />
                  <button onClick={async () => {
                    if (!nouvelleTypologie.trim()) return
                    const res = await api.post('/typologies', { nom: nouvelleTypologie.trim() })
                    setTypologiesCustom(prev => [...prev, res.data])
                    setNouvelleTypologie('')
                  }} className="btn-primary" style={{ fontSize: 13 }}>Ajouter</button>
                </div>
              </div>
            )}

            {importGranuloStep !== 2 && getBatiments().length === 0 && !showAddBatiment && (
              <p className="text-muted text-sm">Aucun bâtiment défini. Ajoutez les bâtiments du projet avec leurs typologies de logements.</p>
            )}

            {importGranuloStep !== 2 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {getBatiments().map((bat, i) => (
                <div
                  key={i}
                  draggable={batimentEditIdx !== i}
                  onDragStart={() => { dragBatIdx.current = i }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    const from = dragBatIdx.current
                    if (from === null || from === i) return
                    const next = [...getBatiments()]
                    const [moved] = next.splice(from, 1)
                    next.splice(i, 0, moved)
                    saveBatiments(next)
                  }}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', cursor: batimentEditIdx === i ? 'default' : 'grab' }}
                >
                  {batimentEditIdx === i ? (
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <input
                          value={batimentEditNom}
                          onChange={e => setBatimentEditNom(e.target.value)}
                          style={{ flex: 1, fontSize: 13 }}
                          autoFocus
                        />
                        <button onClick={() => sauvegarderBatimentEdit(i)} className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>✓</button>
                        <button onClick={() => setBatimentEditIdx(null)} className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}>✕</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {TYPOLOGIES_OPTIONS.map(t => (
                          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" checked={batimentEditTypos.includes(t)} onChange={() => setBatimentEditTypos(prev => prev.includes(t) ? prev.filter(v => v !== t) : [...prev, t])} style={{ width: 'auto' }} />
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 14, cursor: 'grab' }}>⠿</span>
                      <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{bat.nom}</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 2 }}>
                        {bat.typologies?.map(t => (
                          <span key={t} style={{ fontSize: 11, fontWeight: 700, background: '#ede9fe', color: '#7c3aed', borderRadius: 12, padding: '2px 8px' }}>{t}</span>
                        ))}
                      </div>
                      <button onClick={() => { setBatimentEditIdx(i); setBatimentEditNom(bat.nom); setBatimentEditTypos(bat.typologies || []) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0 }} title="Modifier">✎</button>
                      <button onClick={() => supprimerBatimentLocal(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: 0 }} title="Supprimer">×</button>
                    </div>
                  )}
                </div>
              ))}

              {showAddBatiment && (
                <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <input
                      value={newBatimentNom}
                      onChange={e => setNewBatimentNom(e.target.value)}
                      placeholder="Ex : Bâtiment A, Villas..."
                      style={{ flex: 1, fontSize: 13 }}
                      autoFocus
                    />
                    <button onClick={ajouterBatimentLocal} className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>Ajouter</button>
                    <button onClick={() => setShowAddBatiment(false)} className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {TYPOLOGIES_OPTIONS.map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={newBatimentTypos.includes(t)} onChange={() => setNewBatimentTypos(prev => prev.includes(t) ? prev.filter(v => v !== t) : [...prev, t])} style={{ width: 'auto' }} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>}
            </>)}
          </section>
        )}

        {/* Programme - Notices */}
        {(() => {
          const programmes = projet.documents.filter(d => d.categorieDoc === 'programme')
          const sousProgrammes = projet.sousProgrammes || []
          const hasSousProgrammes = sousProgrammes.length > 0
          return (
            <section className="section section--programmes">
              <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showProgrammes ? 12 : 0 }} onClick={() => setShowProgrammes(v => !v)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <h2 className="section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📌</span> Programme - Notices
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>({programmes.length})</span>
                  </h2>
                  <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showProgrammes ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                </div>
                <div className="section-title-btns">
                  {showProgrammes && (<>
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); setShowSousProgrammes(v => !v) }} className="btn-ghost" style={{ fontSize: 13, backgroundColor: '#f0f0ff', border: '1px solid #c5c5f0', color: '#5a5aaa' }}>
                        ✏️ Sous-programmes
                      </button>
                    )}
                    {!isBureauControle && (
                      <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/upload`) }} className="btn-primary" style={{ fontSize: 13 }}>
                        + Déposer
                      </button>
                    )}
                  </>)}
                </div>
              </div>

              {showProgrammes && (<>
              {/* Gestion sous-programmes (admin) */}
              {isAdmin && showSousProgrammes && (
                <div className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
                  <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                    Sous-programmes de ce projet
                  </p>
                  {sousProgrammes.length === 0 ? (
                    <p className="text-muted text-sm" style={{ marginBottom: 10 }}>
                      Aucun sous-programme — le projet est unique. Ajoutez des sous-programmes si l'opération comporte plusieurs typologies (accession, social, villas...).
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {sousProgrammes.map((sp, idx) => (
                        <span
                          key={sp.id}
                          draggable
                          onDragStart={() => { dragSpIdx.current = idx }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => {
                            const from = dragSpIdx.current
                            if (from === null || from === idx) return
                            const next = [...sousProgrammes]
                            const [moved] = next.splice(from, 1)
                            next.splice(idx, 0, moved)
                            setProjet(prev => ({ ...prev, sousProgrammes: next }))
                            api.patch(`/projets/${id}/sous-programmes/ordre`, { ordre: next.map(s => s.id) })
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-muted)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'grab', userSelect: 'none' }}
                        >
                          <span style={{ color: 'var(--text-muted)', fontSize: 14, cursor: 'grab' }}>⠿</span>
                          {spRenomId === sp.id ? (
                            <>
                              <input
                                value={spRenomNom}
                                onChange={e => setSpRenomNom(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') renommerSousProgramme(sp.id); if (e.key === 'Escape') setSpRenomId(null) }}
                                autoFocus
                                style={{ fontSize: 13, width: 120, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}
                              />
                              <button onClick={() => renommerSousProgramme(sp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', fontSize: 14, lineHeight: 1, padding: 0 }} title="Valider">✓</button>
                              <button onClick={() => setSpRenomId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: 0 }} title="Annuler">✕</button>
                            </>
                          ) : (
                            <>
                              <span style={{ flex: 1 }}>{sp.nom}</span>
                              <button onClick={e => { e.stopPropagation(); setSpRenomId(sp.id); setSpRenomNom(sp.nom) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, lineHeight: 1, padding: 0 }} title="Renommer">✎</button>
                              <button onClick={e => { e.stopPropagation(); supprimerSousProgramme(sp.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, lineHeight: 1, padding: 0 }} title="Supprimer">×</button>
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <form onSubmit={ajouterSousProgramme} style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={nouveauSp}
                      onChange={e => setNouveauSp(e.target.value)}
                      placeholder="Ex : Accession, Social, Villas..."
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button type="submit" disabled={spEnCours || !nouveauSp.trim()} className="btn-primary" style={{ fontSize: 13 }}>
                      Ajouter
                    </button>
                  </form>
                </div>
              )}

              {programmes.length === 0 ? (
                <div className="card" style={{ borderLeft: '3px solid #7c3aed', padding: '16px 20px' }}>
                  <p style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>
                    Aucun programme déposé
                  </p>
                  <p className="text-muted text-sm" style={{ margin: 0 }}>
                    Commencez par déposer le ou les programmes du projet. Ils serviront de référence pour la vérification automatique des CCTP et DPGF.
                  </p>
                </div>
              ) : hasSousProgrammes ? (
                // Affichage groupé par sous-programme — accordéons
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...sousProgrammes, { id: '__sans__', nom: 'Sans périmètre' }].map((sp, idx) => {
                    const docs = sp.id === '__sans__'
                      ? programmes.filter(d => !d.sousProgramme)
                      : programmes.filter(d => d.sousProgramme?.id === sp.id)
                    if (sp.id === '__sans__' && docs.length === 0) return null
                    const key = String(sp.id)
                    const ouvert = programmesOuverts.has(key)
                    const couleur = sp.id === '__sans__' ? '#94a3b8' : '#7c3aed'
                    const isDraggable = sp.id !== '__sans__' && isAdmin
                    return (
                      <div
                        key={key}
                        style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}
                        draggable={isDraggable}
                        onDragStart={isDraggable ? () => { dragSpIdx.current = idx } : undefined}
                        onDragOver={isDraggable ? e => e.preventDefault() : undefined}
                        onDrop={isDraggable ? () => {
                          const from = dragSpIdx.current
                          if (from === null || from === idx) return
                          const next = [...sousProgrammes]
                          const [moved] = next.splice(from, 1)
                          next.splice(idx, 0, moved)
                          setProjet(prev => ({ ...prev, sousProgrammes: next }))
                          api.patch(`/projets/${id}/sous-programmes/ordre`, { ordre: next.map(s => s.id) })
                        } : undefined}
                      >
                        <div
                          onClick={() => toggleProgramme(key)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-muted)', cursor: isDraggable ? 'grab' : 'pointer', userSelect: 'none' }}
                        >
                          <span style={{ fontWeight: 700, fontSize: 13, color: couleur, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {sp.nom}
                            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
                              {docs.length} document{docs.length > 1 ? 's' : ''}
                            </span>
                          </span>
                          <span style={{ fontSize: 14, color: 'var(--text-muted)', transform: ouvert ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                        </div>
                        {ouvert && (
                          <div style={{ padding: '10px 10px 4px' }}>
                            {docs.length === 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 8px' }}>
                                <p className="text-muted text-sm" style={{ margin: 0 }}>Aucun programme pour ce périmètre.</p>
                                {!isBureauControle && (
                                  <button onClick={() => navigate(`/projets/${id}/upload?sousProgrammeId=${sp.id}`)} className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>+ Déposer</button>
                                )}
                                {isAdmin && sp.id !== '__sans__' && (
                                  <button onClick={() => supprimerSousProgramme(sp.id)} style={{ fontSize: 12, padding: '4px 10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Supprimer</button>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {docs.map(doc => <ProgrammeCard key={doc.id} doc={doc} isAdmin={isAdmin} onDelete={() => { setShowDeleteDoc({ id: doc.id, nom: doc.nom }); setDeleteResoudreAlertes(false) }} />)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {programmes.map(doc => <ProgrammeCard key={doc.id} doc={doc} isAdmin={isAdmin} onDelete={() => { setShowDeleteDoc({ id: doc.id, nom: doc.nom }); setDeleteResoudreAlertes(false) }} />)}
                </div>
              )}
            </>)}
            </section>
          )
        })()}

        {/* Documents */}
        <section className="section section--documents">
          <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showDocuments ? 12 : 0 }} onClick={() => setShowDocuments(v => !v)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 16 }}>📄</span> Documents
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>({projet.documents.filter(d => d.categorieDoc !== 'programme').length})</span>
              </h2>
              <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showDocuments ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
            </div>
            <div className="section-title-btns">
              {showDocuments && (<>
                {!isBureauControle && (
                  <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/upload`) }} className="btn-primary" style={{ fontSize: 13 }}>+ Déposer</button>
                )}
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/chat`) }} className="btn-secondary" style={{ fontSize: 13 }}>Assistant IA</button>
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/visas`) }} className="btn-secondary" style={{ fontSize: 13 }}>Visas</button>
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/syntheses`) }} className="btn-secondary" style={{ fontSize: 13 }}>Synthèses</button>
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/historique`) }} className="btn-ghost" style={{ fontSize: 13 }}>Historique</button>
              </>)}
            </div>
          </div>


          {showDocuments && (<>
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

          {(() => {
            const autresDoc = projet.documents.filter(d => d.categorieDoc !== 'programme')
            const categorieLabels = {
              cctp: 'CCTP', dpgf: 'DPGF', plans: 'Plans', pieces_ecrites: 'Pièces écrites',
              etudes_th: 'Études TH', bureau_controle: 'Bureau de contrôle',
              notes_calcul: 'Notes de calcul', comptes_rendus: 'Comptes-rendus', autre: 'Autre'
            }
            const categorieColors = { cctp: '#2563eb', dpgf: '#059669' }
            const lotLabels = {
              cvc: 'CVC', menuiseries: 'Menuiseries', facades: 'Façades',
              etancheite: 'Étanchéité', grosOeuvre: 'Gros œuvre', plomberie: 'Plomberie',
              generalites: 'Généralités'
            }
            const lotColors = {
              cvc: '#f97316', menuiseries: '#8b5cf6', facades: '#0ea5e9',
              etancheite: '#14b8a6', grosOeuvre: '#78716c', plomberie: '#3b82f6',
              generalites: '#94a3b8'
            }

            const toggleTri = (col) => setTriDoc(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }))
            const fleche = (col) => triDoc.col === col ? (triDoc.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
            const docsTries = [...autresDoc].sort((a, b) => {
              let va, vb
              if (triDoc.col === 'nom') { va = a.nom.toLowerCase(); vb = b.nom.toLowerCase() }
              else if (triDoc.col === 'categorieDoc') { va = a.categorieDoc || ''; vb = b.categorieDoc || '' }
              else if (triDoc.col === 'lotType') { va = a.lotType || ''; vb = b.lotType || '' }
              else { va = new Date(a.dateDepot); vb = new Date(b.dateDepot) }
              if (va < vb) return triDoc.dir === 'asc' ? -1 : 1
              if (va > vb) return triDoc.dir === 'asc' ? 1 : -1
              return 0
            })
            const thStyle = { cursor: 'pointer', userSelect: 'none' }

            if (autresDoc.length === 0) {
              return <p className="text-muted">Aucun document déposé.</p>
            }
            return (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={thStyle} onClick={() => toggleTri('nom')}>Nom{fleche('nom')}</th>
                      <th style={thStyle} onClick={() => toggleTri('categorieDoc')}>Catégorie{fleche('categorieDoc')}</th>
                      <th style={thStyle} onClick={() => toggleTri('lotType')}>Lot{fleche('lotType')}</th>
                      <th>Périmètre</th>
                      <th>Puce IA</th>
                      <th style={thStyle} onClick={() => toggleTri('dateDepot')}>Date{fleche('dateDepot')}</th>
                      {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {docsTries.map(doc => (
                      <tr key={doc.id}>
                        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.nom}>
                          {doc.nom}
                          {doc.indiceRevision && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{doc.indiceRevision}</span>}
                        </td>
                        <td>
                          {doc.categorieDoc
                            ? <span className="badge" style={{ background: categorieColors[doc.categorieDoc] || 'var(--bg-muted)', color: categorieColors[doc.categorieDoc] ? 'white' : 'var(--text)', fontSize: 11 }}>{categorieLabels[doc.categorieDoc] || doc.categorieDoc}</span>
                            : <span className="text-muted text-sm">—</span>
                          }
                        </td>
                        <td>
                          {doc.lotType
                            ? <span className="badge" style={{ background: lotColors[doc.lotType] || '#94a3b8', color: 'white', fontSize: 11, whiteSpace: 'nowrap' }}>{lotLabels[doc.lotType] || doc.lotType}</span>
                            : <span className="text-muted text-sm">—</span>
                          }
                        </td>
                        <td>
                          {doc.sousProgramme
                            ? <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 700 }}>{doc.sousProgramme.nom}</span>
                            : <span className="text-muted text-sm">—</span>
                          }
                        </td>
                        <td><PuceCard puce={doc.puce} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(doc.dateDepot).toLocaleDateString('fr-FR')}</td>
                        {isAdmin && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => ouvrirTexteDoc(doc)}
                                style={{ fontSize: 12, padding: '4px 8px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                title="Voir le texte extrait"
                              >👁</button>
                              {doc.categorieDoc === 'dpgf' && (
                                <button
                                  onClick={async () => {
                                    const ids = projet.documents.filter(d => d.categorieDoc === 'cctp').map(d => d.id)
                                    setPreAnalyseFeedback({})
                                    setShowPreAnalyse({ loading: true, data: null, error: null })
                                    try {
                                      const res = await api.post(`/documents/${doc.id}/pre-analyse`, { idsRef: ids })
                                      setShowPreAnalyse({ loading: false, data: res.data, error: null })
                                    } catch (e) {
                                      setShowPreAnalyse({ loading: false, data: null, error: e.response?.data?.error || e.message })
                                    }
                                  }}
                                  style={{ fontSize: 12, padding: '4px 8px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                  title="Pré-analyse Python (sans IA)"
                                >🔍 Python</button>
                              )}
                              {(doc.categorieDoc === 'cctp' || doc.categorieDoc === 'dpgf') && (
                                <button
                                  onClick={() => {
  setShowComparerModal({ id: doc.id, nom: doc.nom, categorie: doc.categorieDoc })
  const cats = doc.categorieDoc === 'dpgf' ? ['programme', 'cctp'] : ['programme']
  const ids = projet.documents
    .filter(d => d.id !== doc.id && cats.includes(d.categorieDoc))
    .map(d => d.id)
  setComparerIdsRef(ids)
}}
                                  style={{ fontSize: 12, padding: '4px 10px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                >⟳ Comparer</button>
                              )}
                              <label style={{ fontSize: 12, padding: '4px 10px', background: '#6366f1', color: 'white', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }} title="Mettre à jour">
                                {modifierEnCours === doc.id ? '…' : '↑'}
                                <input type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) modifierDocument(doc, e.target.files[0]); e.target.value = '' }} />
                              </label>
                              <button
                                onClick={() => { setShowDeleteDoc({ id: doc.id, nom: doc.nom }); setDeleteResoudreAlertes(false) }}
                                style={{ fontSize: 14, padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                title="Supprimer"
                              >✕</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
          </>)}
        </section>

        {/* V3 — Configuration IA (admin uniquement) */}
        {isAdmin && (
          <section className="section section--config">
            <div className="section-title-row" style={{ cursor: 'pointer' }} onClick={() => showConfig ? setShowConfig(false) : chargerConfig()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>Configuration IA</h2>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showConfig ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
              </div>
            </div>
            {showConfig && (
              <form onSubmit={sauvegarderConfig} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label>Prompt système global</label>
                  <textarea
                    value={configPrompt}
                    onChange={e => setConfigPrompt(e.target.value)}
                    placeholder={`Exemple : Les attiques BRS (D201, E1-201, E1-202) sont équipées de PAC air/eau et plancher chauffant. C'est volontaire et conforme au programme.`}
                    rows={4}
                    style={{ fontFamily: 'inherit' }}
                  />
                </div>
                <div className="form-group">
                  <label>Vocabulaire métier</label>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Termes ou abréviations spécifiques à ce projet — injectés dans chaque comparaison IA.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {configVocabEntries.map((entry, i) => (
                      <div key={i} className="vocab-entry-row">
                        <input
                          value={entry.terme}
                          onChange={e => { const n = [...configVocabEntries]; n[i] = { ...n[i], terme: e.target.value }; setConfigVocabEntries(n) }}
                          placeholder="Terme / abréviation"
                          style={{ minWidth: 100, flex: '0 1 160px' }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>→</span>
                        <input
                          value={entry.definition}
                          onChange={e => { const n = [...configVocabEntries]; n[i] = { ...n[i], definition: e.target.value }; setConfigVocabEntries(n) }}
                          placeholder="Définition / équivalent"
                          style={{ flex: 1, minWidth: 100 }}
                        />
                        <button type="button" onClick={() => setConfigVocabEntries(configVocabEntries.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setConfigVocabEntries([...configVocabEntries, { terme: '', definition: '' }])} className="btn-ghost" style={{ fontSize: 13 }}>
                        + Ajouter un terme
                      </button>
                      <button type="button" onClick={() => setShowVocabImport(!showVocabImport)} className="btn-ghost" style={{ fontSize: 13 }}>
                        ↓ Importer en masse
                      </button>
                    </div>
                    {showVocabImport && (
                      <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-muted)', borderRadius: 8 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Une ligne par terme, format : <code>TERME → définition</code>
                        </p>
                        <textarea
                          value={vocabImportText}
                          onChange={e => setVocabImportText(e.target.value)}
                          placeholder={'BATIMENTS AB → Bâtiment A + Bâtiment B\nGO → Gros Œuvre\nBRS → Bail Réel Solidaire'}
                          rows={6}
                          style={{ fontFamily: 'monospace', fontSize: 12, width: '100%', marginBottom: 8 }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: 13 }}
                          onClick={() => {
                            const nouvelles = vocabImportText.split('\n')
                              .map(l => l.split('→'))
                              .filter(p => p.length >= 2 && p[0].trim())
                              .map(p => ({ terme: p[0].trim(), definition: p.slice(1).join('→').trim() }))
                            setConfigVocabEntries([...configVocabEntries, ...nouvelles])
                            setVocabImportText('')
                            setShowVocabImport(false)
                          }}
                        >
                          Importer ({vocabImportText.split('\n').filter(l => l.includes('→')).length} termes)
                        </button>
                      </div>
                    )}
                  </div>
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
        <section className="section section--membres">
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

      {showTexteModal && (
        <div className="modal-overlay" onClick={() => setShowTexteModal(null)}>
          <div className="modal-card" style={{ maxWidth: 780, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 15 }}>Texte extrait — {showTexteModal.nom}</h3>
              <button className="btn-ghost" onClick={() => setShowTexteModal(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
              {showTexteModal.loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}
              {showTexteModal.error && <p style={{ color: '#ef4444', fontSize: 13 }}>Erreur lors du chargement.</p>}
              {!showTexteModal.loading && !showTexteModal.error && (
                showTexteModal.contenuTexte
                  ? <pre style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', color: 'var(--text)', margin: 0 }}>{showTexteModal.contenuTexte}</pre>
                  : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun texte extrait pour ce document.</p>
              )}
            </div>
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {showTexteModal.contenuTexte ? `${showTexteModal.contenuTexte.length.toLocaleString('fr-FR')} caractères` : ''}
              </span>
              <button onClick={() => setShowTexteModal(null)} className="btn-ghost">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {showComparerModal && (
        <div className="modal-overlay" onClick={() => setShowComparerModal(null)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Relancer la comparaison</h3>
              <button className="btn-ghost" onClick={() => setShowComparerModal(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Comparer <strong style={{ color: 'var(--text)' }}>{showComparerModal.nom}</strong> avec :
            </p>
            {(() => {
              const cats = showComparerModal.categorie === 'dpgf'
                ? [{ key: 'programme', label: 'Notices' }, { key: 'cctp', label: 'CCTPs' }]
                : [{ key: 'programme', label: 'Notices' }]
              const docsDispos = projet.documents.filter(d =>
                d.id !== showComparerModal.id &&
                cats.map(c => c.key).includes(d.categorieDoc)
              )
              if (docsDispos.length === 0) return (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Aucun document de référence disponible dans ce projet.</p>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                  {cats.map(cat => {
                    const docs = docsDispos.filter(d => d.categorieDoc === cat.key)
                    if (docs.length === 0) return null
                    const allSelected = docs.every(d => comparerIdsRef.includes(d.id))
                    return (
                      <div key={cat.key}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat.label}</span>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => {
                              const ids = docs.map(d => d.id)
                              if (allSelected) setComparerIdsRef(prev => prev.filter(id => !ids.includes(id)))
                              else setComparerIdsRef(prev => [...new Set([...prev, ...ids])])
                            }}
                          >{allSelected ? 'Tout décocher' : 'Tout cocher'}</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {docs.map(doc => {
                            const checked = comparerIdsRef.includes(doc.id)
                            return (
                              <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary-light)' : 'transparent' }}>
                                <input type="checkbox" checked={checked} onChange={() => {
                                  setComparerIdsRef(prev => checked ? prev.filter(id => id !== doc.id) : [...prev, doc.id])
                                }} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nom}</span>
                                {!doc.puce && <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 'auto', flexShrink: 0 }}>non traité</span>}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            {showComparerModal.categorie === 'dpgf' && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Que vérifier ?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { value: 'technique', label: 'Cohérence technique', desc: 'Désignations, équipements, matériaux vs CCTP' },
                    { value: 'chiffrage', label: 'Cohérence des quantités', desc: 'Postes manquants, quantités à 0, incohérences entre bâtiments' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${comparerMode === opt.value ? 'var(--primary)' : 'var(--border)'}`, background: comparerMode === opt.value ? 'var(--primary-light)' : 'transparent' }}>
                      <input type="radio" name="comparerMode" value={opt.value} checked={comparerMode === opt.value} onChange={() => setComparerMode(opt.value)} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Modèle IA</p>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { value: 'haiku', label: 'Haiku', desc: 'rapide' },
                  { value: 'sonnet', label: 'Sonnet', desc: 'précis' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                    <input type="radio" name="modeleIA" value={opt.value} checked={comparerModele === opt.value} onChange={() => setComparerModele(opt.value)} />
                    <span>{opt.label} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({opt.desc})</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 8 }}>
              <button onClick={lancerComparaison} disabled={comparerEnCours || comparerIdsRef.length === 0} className="btn-primary">
                {comparerEnCours ? 'Lancement...' : `Lancer${comparerIdsRef.length > 0 ? ` (${comparerIdsRef.length} fichier${comparerIdsRef.length > 1 ? 's' : ''})` : ''}`}
              </button>
              <button onClick={() => setShowComparerModal(null)} className="btn-ghost">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDoc && (
        <div className="modal-overlay" onClick={() => setShowDeleteDoc(null)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Supprimer le document</h3>
              <button className="btn-ghost" onClick={() => setShowDeleteDoc(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <p style={{ fontSize: 14, marginBottom: 16 }}>
              Supprimer <strong>{showDeleteDoc.nom}</strong> ?
            </p>
            <div className="form-group">
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={deleteResoudreAlertes}
                  onChange={e => setDeleteResoudreAlertes(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Résoudre les alertes liées à ce document
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: 8 }}>
              <button onClick={supprimerDocument} className="btn-ghost" style={{ color: '#ef4444' }}>Supprimer</button>
              <button onClick={() => setShowDeleteDoc(null)} className="btn-ghost">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showEditProjet && (
        <div className="modal-overlay" onClick={() => setShowEditProjet(false)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifier le projet</h3>
              <button className="btn-ghost" onClick={() => setShowEditProjet(false)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <form onSubmit={sauvegarderProjet}>
              <div style={{ overflowY: 'auto', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 4 }}>

                {/* 1. Identification */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>1. Identification du projet</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Nom de l'opération *</label>
                      <input value={editNom} onChange={e => setEditNom(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>MOA / Client *</label>
                      <input value={editClient} onChange={e => setEditClient(e.target.value)} required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Adresse complète</label>
                        <input value={editMeta.adresse || ''} onChange={e => setEditMeta(p => ({ ...p, adresse: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Commune + Code postal</label>
                        <input value={editMeta.commune || ''} onChange={e => setEditMeta(p => ({ ...p, commune: e.target.value }))} placeholder="Ex : Lumbin 38660" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Références cadastrales</label>
                        <input value={editMeta.refCadastrales || ''} onChange={e => setEditMeta(p => ({ ...p, refCadastrales: e.target.value }))} placeholder="Section + numéro de parcelle" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Zone climatique RE2020</label>
                        <select value={editMeta.zoneClimatique || ''} onChange={e => setEditMeta(p => ({ ...p, zoneClimatique: e.target.value }))}>
                          <option value="">— Non défini —</option>
                          {ZONES_CLIM.map(z => <option key={z} value={z}>{z}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Nature et programme */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>2. Nature et programme</p>
                  <div className="form-group" style={{ margin: '0 0 10px' }}>
                    <label>Type d'opération</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      {TYPES_OPERATION.map(t => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" name="typeOperation" style={{ width: 'auto' }} checked={editMeta.typeOperation === t} onChange={() => setEditMeta(p => ({ ...p, typeOperation: t }))} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0, maxWidth: 160 }}>
                    <label>Nombre de bâtiments</label>
                    <input type="number" min="1" value={editMeta.nombreBatiments || ''} onChange={e => setEditMeta(p => ({ ...p, nombreBatiments: e.target.value }))} />
                  </div>
                </div>

                {/* 3. Réglementation thermique */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>3. Réglementation thermique applicable</p>
                  <div className="form-group" style={{ margin: '0 0 12px' }}>
                    <label>Réglementation</label>
                    <select value={editMeta.reglementation || ''} onChange={e => setEditMeta(p => ({ ...p, reglementation: e.target.value }))}>
                      <option value="">— Sélectionner —</option>
                      {RT_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}{r.detail ? ` — ${r.detail}` : ''}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Date dépôt PC</label>
                      <input type="date" value={editMeta.datePCDepot || ''} disabled={editMeta.pcNonDepose} onChange={e => setEditMeta(p => ({ ...p, datePCDepot: e.target.value }))} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4, cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!editMeta.pcNonDepose} onChange={e => setEditMeta(p => ({ ...p, pcNonDepose: e.target.checked, datePCDepot: e.target.checked ? '' : p.datePCDepot }))} />
                        PC non déposé
                      </label>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Date obtention PC</label>
                      <input type="date" value={editMeta.datePCObtention || ''} disabled={editMeta.pcEnCours} onChange={e => setEditMeta(p => ({ ...p, datePCObtention: e.target.value }))} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4, cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!editMeta.pcEnCours} onChange={e => setEditMeta(p => ({ ...p, pcEnCours: e.target.checked, datePCObtention: e.target.checked ? '' : p.datePCObtention }))} />
                        En cours / Non obtenu
                      </label>
                    </div>
                  </div>
                </div>

                {/* 4. Labels / PLUi */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>4. Labels, certifications et exigences PLUi</p>
                  <div className="form-group" style={{ margin: '0 0 10px' }}>
                    <label>Label / Certification visée</label>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                      {LABELS_OPTIONS.map(l => (
                        <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" style={{ width: 'auto' }}
                            checked={(editMeta.labels || []).includes(l)}
                            onChange={() => setEditMeta(p => {
                              const cur = p.labels || []
                              return { ...p, labels: cur.includes(l) ? cur.filter(v => v !== l) : [...cur, l] }
                            })}
                          /> {l}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Taux EnR PLUi (%)</label>
                      <input type="number" min="0" max="100" value={editMeta.tauxEnR || ''} onChange={e => setEditMeta(p => ({ ...p, tauxEnR: e.target.value }))} placeholder="Ex : 30" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Autres exigences PLUi</label>
                      <input value={editMeta.autresExigences || ''} onChange={e => setEditMeta(p => ({ ...p, autresExigences: e.target.value }))} placeholder="Ex : gaz interdit, toiture végétalisée..." />
                    </div>
                  </div>
                </div>

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

      {/* Modal pré-analyse Python */}
      {showPreAnalyse && (
        <div className="modal-overlay" onClick={() => setShowPreAnalyse(null)}>
          <div className="modal-card" style={{ maxWidth: 820, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔍 Pré-analyse Python</h3>
              <button className="btn-ghost" onClick={() => setShowPreAnalyse(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>

            {showPreAnalyse.loading && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Analyse en cours… (peut prendre 10-30s)</p>
            )}
            {showPreAnalyse.error && (
              <p style={{ color: '#ef4444', fontSize: 13, padding: '20px 0' }}>{showPreAnalyse.error}</p>
            )}
            {showPreAnalyse.data && (() => {
              const d = showPreAnalyse.data
              const alertes = d.alertes || []
              const nbOk = Object.values(preAnalyseFeedback).filter(v => v === 'ok').length
              const nbFp = Object.values(preAnalyseFeedback).filter(v => v === 'fp').length
              const CRITICITE_COLOR = { CRITIQUE: '#ef4444', MAJEUR: '#f59e0b', MINEUR: '#6b7280', INCERTAIN: '#8b5cf6' }
              const CODE_LABEL = { C01: 'CCTP→absent DPGF', C02: 'DPGF orphelin', C03: 'Type différent', C04: 'Marque différente', C05: 'Puissance différente', INCERTAIN: 'Désignation incertaine' }

              // Filtrer : exclure les batiments "SECTION_X" (faux positifs mapping vide)
              const alertesFiltrees = alertes.filter(a => a.batiment && !a.batiment.match(/^SECTION_/))

              return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 0 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text)' }}>{d.dpgf_nom}</strong> vs <strong style={{ color: 'var(--text)' }}>{d.cctp_nom}</strong>
                    <span style={{ marginLeft: 16 }}>{alertesFiltrees.length} écarts détectés</span>
                    {(nbOk + nbFp) > 0 && <span style={{ marginLeft: 12, color: '#22c55e' }}>✓ {nbOk} judicieux</span>}
                    {nbFp > 0 && <span style={{ marginLeft: 8, color: '#6b7280' }}>✗ {nbFp} faux positifs</span>}
                    <span style={{ marginLeft: 12, fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10 }}>Résultats non sauvegardés — calibrage uniquement</span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
                    {alertesFiltrees.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>Aucun écart détecté (mapping bâtiment non configuré — résultats partiels).</p>
                    )}
                    {alertesFiltrees.map((a, idx) => {
                      const fb = preAnalyseFeedback[idx]
                      return (
                        <div key={idx} style={{
                          padding: '10px 12px', marginBottom: 6, borderRadius: 8,
                          background: fb === 'ok' ? '#f0fdf4' : fb === 'fp' ? '#f9fafb' : 'var(--bg-card)',
                          border: `1px solid ${fb === 'ok' ? '#86efac' : fb === 'fp' ? '#e5e7eb' : 'var(--border)'}`,
                          opacity: fb === 'fp' ? 0.5 : 1
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, background: CRITICITE_COLOR[a.criticite] || '#6b7280', color: 'white', padding: '2px 7px', borderRadius: 10 }}>{a.criticite}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 7px', borderRadius: 10, border: '1px solid var(--border)' }}>{CODE_LABEL[a.code] || a.code}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.batiment}</span>
                              </div>
                              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, marginBottom: a.cctp_texte || a.dpgf_texte ? 4 : 0 }}>{a.motif}</p>
                              {a.cctp_texte && <p style={{ fontSize: 11, color: '#0ea5e9', margin: 0 }}>CCTP{a.cctp_section ? ` §${a.cctp_section}` : ''} : « {a.cctp_texte.substring(0, 120)} »</p>}
                              {a.dpgf_texte && <p style={{ fontSize: 11, color: '#22c55e', margin: 0 }}>DPGF : « {a.dpgf_texte.substring(0, 120)} »</p>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => setPreAnalyseFeedback(prev => ({ ...prev, [idx]: prev[idx] === 'ok' ? undefined : 'ok' }))}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600, background: fb === 'ok' ? '#22c55e' : 'white', color: fb === 'ok' ? 'white' : '#22c55e', borderColor: '#22c55e' }}
                              >✓ Judicieux</button>
                              <button
                                onClick={() => setPreAnalyseFeedback(prev => ({ ...prev, [idx]: prev[idx] === 'fp' ? undefined : 'fp' }))}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600, background: fb === 'fp' ? '#6b7280' : 'white', color: fb === 'fp' ? 'white' : '#6b7280', borderColor: '#6b7280' }}
                              >✗ Faux positif</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
