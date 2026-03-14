import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

const PHASE_COLORS = {
  APS: '#7c3aed', APD: '#2563eb', PRO: '#0891b2',
  DCE: '#059669', EXE: '#dc2626'
}

export default function Dashboard() {
  const [projets, setProjets] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  // V3 — champs création projet
  const [nom, setNom] = useState('')
  const [client, setClient] = useState('')
  const [adresse, setAdresse] = useState('')
  const [typeBatiment, setTypeBatiment] = useState('')
  const [nombreNiveaux, setNombreNiveaux] = useState('')
  const [shon, setShon] = useState('')
  const [energieRetenue, setEnergieRetenue] = useState('')
  const [zoneClimatique, setZoneClimatique] = useState('')
  const [classementErp, setClassementErp] = useState(false)
  const [typeErp, setTypeErp] = useState('')
  const [nombreLogements, setNombreLogements] = useState('')
  const [batiments, setBatiments] = useState([])
  const [createError, setCreateError] = useState('')
  const [showMenu, setShowMenu] = useState(false)

  const TYPOLOGIES = [
    { value: 'BRS', label: 'BRS' },
    { value: 'LLS', label: 'LLS' },
    { value: 'LLTS', label: 'LLTS' },
    { value: 'PLS', label: 'PLS' },
    { value: 'Accession libre', label: 'Accession libre' },
    { value: 'Accession aidée', label: 'Accession aidée' },
  ]

  useEffect(() => {
    api.get('/projets').then(res => {
      setProjets(res.data)
      setLoading(false)
    })
  }, [])

  function resetForm() {
    setNom(''); setClient(''); setAdresse('')
    setTypeBatiment(''); setNombreNiveaux(''); setShon('')
    setEnergieRetenue(''); setZoneClimatique('')
    setClassementErp(false); setTypeErp(''); setNombreLogements('')
    setBatiments([])
    setCreateError('')
  }

  function ajouterBatiment() {
    setBatiments(prev => [...prev, { nom: '', typologies: [] }])
  }

  function supprimerBatiment(i) {
    setBatiments(prev => prev.filter((_, j) => j !== i))
  }

  function updateBatimentNom(i, valeur) {
    setBatiments(prev => prev.map((b, j) => j === i ? { ...b, nom: valeur } : b))
  }

  function toggleTypologie(i, valeur) {
    setBatiments(prev => prev.map((b, j) => {
      if (j !== i) return b
      const typos = b.typologies.includes(valeur)
        ? b.typologies.filter(t => t !== valeur)
        : [...b.typologies, valeur]
      return { ...b, typologies: typos }
    }))
  }

  async function creerProjet(e) {
    e.preventDefault()
    setCreateError('')
    try {
      const body = { nom, client }
      if (adresse) body.adresse = adresse
      if (typeBatiment) body.typeBatiment = typeBatiment
      if (nombreNiveaux) body.nombreNiveaux = parseInt(nombreNiveaux)
      if (shon) body.shon = parseFloat(shon)
      if (energieRetenue) body.energieRetenue = energieRetenue
      if (zoneClimatique) body.zoneClimatique = zoneClimatique
      body.classementErp = classementErp
      if (classementErp && typeErp) body.typeErp = typeErp
      if (nombreLogements) body.nombreLogements = parseInt(nombreLogements)
      const batimentsValides = batiments.filter(b => b.nom.trim())
      if (batimentsValides.length) body.batimentsComposition = JSON.stringify(batimentsValides)

      const res = await api.post('/projets', body)
      setProjets(prev => [res.data, ...prev])
      resetForm()
      setShowForm(false)
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Erreur lors de la création')
    }
  }

  async function supprimerProjet(e, projetId) {
    e.stopPropagation()
    if (!confirm('Supprimer ce projet ? Cette action est irréversible.')) return
    await api.delete(`/projets/${projetId}`)
    setProjets(prev => prev.filter(p => p.id !== projetId))
  }


  return (
    <div className="page">
      <header className="topbar">
        <img src={logo} alt="synthek" className="topbar-logo" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <div className="topbar-right">
          {/* Nav desktop */}
          <div className="topbar-nav">
            <span className="text-muted">{user?.nom}</span>
            {user?.role === 'admin' && (
              <>
                <span className="badge">Admin</span>
                <button onClick={() => navigate('/users')} className="btn-secondary" style={{ fontSize: 13, padding: '6px 14px' }}>
                  Utilisateurs
                </button>
                <button onClick={() => navigate('/reglementation')} className="btn-secondary" style={{ fontSize: 13, padding: '6px 14px' }}>
                  Réglementation
                </button>
                <button onClick={() => navigate('/vocabulaire-global')} className="btn-secondary" style={{ fontSize: 13, padding: '6px 14px' }}>
                  Vocabulaire
                </button>
              </>
            )}
            <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={logout} className="btn-ghost">Déconnexion</button>
          </div>
          {/* Theme toggle toujours visible sur mobile */}
          <button onClick={toggleTheme} className="btn-ghost burger-theme" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {/* Burger mobile */}
          <button className="btn-ghost burger-btn" onClick={() => setShowMenu(v => !v)} aria-label="Menu">
            {showMenu ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Menu burger mobile */}
      {showMenu && (
        <>
          <div className="burger-overlay" onClick={() => setShowMenu(false)} />
          <nav className="burger-menu">
            <div className="burger-user">
              <span>{user?.nom}</span>
              {user?.role === 'admin' && <span className="badge">Admin</span>}
            </div>
            {user?.role === 'admin' && (
              <>
                <button onClick={() => { navigate('/users'); setShowMenu(false) }} className="burger-item">👥 Utilisateurs</button>
                <button onClick={() => { navigate('/reglementation'); setShowMenu(false) }} className="burger-item">📋 Réglementation</button>
                <button onClick={() => { navigate('/vocabulaire-global'); setShowMenu(false) }} className="burger-item">📖 Vocabulaire</button>
              </>
            )}
            <button onClick={() => { logout(); setShowMenu(false) }} className="burger-item burger-item--danger">🚪 Déconnexion</button>
          </nav>
        </>
      )}

      <main className="container">

        {/* Hero banner */}
        <div className="hero-banner">
          <div className="hero-content">
            <p className="hero-greeting">Bonjour, {user?.nom} 👋</p>
            <h2 className="hero-title">Coordination de chantier assistée par IA</h2>
            <p className="hero-sub">
              synthek analyse vos documents, détecte les incohérences entre lots,
              gère les visas et répond à vos questions réglementaires en temps réel.
            </p>
            <div className="hero-features">
              <span className="hero-feature">📄 Analyse documentaire</span>
              <span className="hero-feature">⚡ Alertes IA automatiques</span>
              <span className="hero-feature">✅ Visas &amp; validations</span>
              <span className="hero-feature">💬 Assistant réglementaire</span>
            </div>
          </div>
          {!loading && projets.length > 0 && (
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-value">{projets.length}</span>
                <span className="hero-stat-label">projet{projets.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>

        {/* Section projets */}
        <div className="section-header">
          <h2>Mes projets</h2>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            + Nouveau projet
          </button>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => { setShowForm(false); resetForm() }}>
            <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Nouveau projet</h3>
                <button className="btn-ghost" onClick={() => { setShowForm(false); resetForm() }} style={{ padding: '4px 8px' }}>✕</button>
              </div>
              <form onSubmit={creerProjet}>
                {createError && <p className="error-msg" style={{ marginBottom: 12 }}>{createError}</p>}

                {/* Section 1 : Identification */}
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 4 }}>Identification</p>
                <div className="form-group">
                  <label>Nom du projet *</label>
                  <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Résidence Les Iris" required />
                </div>
                <div className="form-group">
                  <label>Client / Maître d'ouvrage *</label>
                  <input value={client} onChange={e => setClient(e.target.value)} placeholder="Ex : SARL Habitat Plus" required />
                </div>
                <div className="form-group">
                  <label>Adresse</label>
                  <input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Ex : 12 rue des Lilas, 69003 Lyon" />
                </div>

                {/* Section 2 : Caractéristiques */}
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 16 }}>Caractéristiques du bâtiment</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Type de bâtiment</label>
                    <select value={typeBatiment} onChange={e => setTypeBatiment(e.target.value)}>
                      <option value="">— Sélectionner —</option>
                      <option value="logements_collectifs">Logements collectifs</option>
                      <option value="bureaux">Bureaux</option>
                      <option value="erp">ERP</option>
                      <option value="industrie">Industrie</option>
                      <option value="mixte">Mixte</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Nombre de niveaux</label>
                    <input type="number" min="1" value={nombreNiveaux} onChange={e => setNombreNiveaux(e.target.value)} placeholder="Ex : 5" />
                  </div>
                  <div className="form-group">
                    <label>SHON (m²)</label>
                    <input type="number" min="0" step="0.01" value={shon} onChange={e => setShon(e.target.value)} placeholder="Ex : 2500" />
                  </div>
                  <div className="form-group">
                    <label>Énergie retenue</label>
                    <select value={energieRetenue} onChange={e => setEnergieRetenue(e.target.value)}>
                      <option value="">— Sélectionner —</option>
                      <option value="gaz">Gaz</option>
                      <option value="electricite">Électricité</option>
                      <option value="pac">PAC</option>
                      <option value="geothermie">Géothermie</option>
                      <option value="bois">Bois</option>
                      <option value="mixte">Mixte</option>
                    </select>
                  </div>
                </div>

                {/* Section 3 : Réglementation */}
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, marginTop: 16 }}>Réglementation</p>
                <div className="form-group">
                  <label>Zone climatique</label>
                  <select value={zoneClimatique} onChange={e => setZoneClimatique(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {['H1a','H1b','H1c','H2a','H2b','H2c','H2d','H3'].map(z => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={classementErp} onChange={e => setClassementErp(e.target.checked)} style={{ width: 'auto' }} />
                    Classement ERP
                  </label>
                </div>
                {classementErp && (
                  <div className="form-group">
                    <label>Type ERP</label>
                    <select value={typeErp} onChange={e => setTypeErp(e.target.value)}>
                      <option value="">— Sélectionner —</option>
                      {['M','J','U','W','PS','L','N','O','P','R','S','T','X','Y'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}
                {['logements_collectifs', 'mixte'].includes(typeBatiment) && (
                  <div className="form-group">
                    <label>Nombre de logements</label>
                    <input type="number" min="1" value={nombreLogements} onChange={e => setNombreLogements(e.target.value)} placeholder="Ex : 40" />
                  </div>
                )}

                {/* Section 4 : Composition des bâtiments */}
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, marginTop: 16 }}>
                  Composition des bâtiments <span style={{ fontWeight: 400 }}>(optionnel)</span>
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Si le projet a plusieurs bâtiments avec des typologies de logements différentes, définissez-les ici. Claude s'en servira pour une analyse plus précise.
                </p>
                {batiments.map((bat, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                      <input
                        value={bat.nom}
                        onChange={e => updateBatimentNom(i, e.target.value)}
                        placeholder="Ex : Bâtiment A, Villas, BAT C-D..."
                        style={{ flex: 1 }}
                      />
                      <button type="button" onClick={() => supprimerBatiment(i)} className="btn-ghost" style={{ padding: '4px 8px', color: 'var(--danger, #ef4444)' }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {TYPOLOGIES.map(t => (
                        <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={bat.typologies.includes(t.value)}
                            onChange={() => toggleTypologie(i, t.value)}
                            style={{ width: 'auto' }}
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={ajouterBatiment} className="btn-secondary" style={{ fontSize: 13, padding: '6px 12px', marginBottom: 4 }}>
                  + Ajouter un bâtiment
                </button>

                <div className="form-actions" style={{ marginTop: 20 }}>
                  <button type="submit" className="btn-primary">Créer le projet</button>
                  <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="btn-ghost">Annuler</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-muted">Chargement...</p>
        ) : projets.length === 0 ? (
          <div className="empty-dashboard">
            <div className="empty-dashboard-grid">
              {[
                { icon: '📁', title: 'Gestion documentaire', desc: 'Déposez vos PDF, Word et Excel. synthek extrait automatiquement les données clés de chaque document.' },
                { icon: '🤖', title: 'Analyse IA', desc: 'L\'IA détecte les incohérences entre lots (structure, fluides, électricité…) et génère des alertes ciblées.' },
                { icon: '🔏', title: 'Visas & traçabilité', desc: 'Validez, refusez ou réservez des documents. Chaque visa est horodaté et signé numériquement (SHA-256).' },
                { icon: '💬', title: 'Assistant réglementaire', desc: 'Posez vos questions en langage naturel. L\'assistant croise DTU, RE2020 et vos documents de projet.' },
              ].map(f => (
                <div key={f.title} className="feature-card">
                  <span className="feature-icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
            <p className="empty-cta">Créez votre premier projet pour commencer.</p>
          </div>
        ) : (
          <div className="projets-grid">
            {projets.map(p => (
              <div key={p.id} className="card projet-card" onClick={() => navigate(`/projets/${p.id}`)}>
                <div className="projet-card-header">
                  <h3>{p.nom}</h3>
                  {user?.role === 'admin' && (
                    <button
                      className="btn-danger-sm"
                      onClick={e => supprimerProjet(e, p.id)}
                      title="Supprimer le projet"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className="text-muted">{p.client}</p>
                <div className="projet-stats">
                  <span className="badge" style={{ background: PHASE_COLORS[p.phase] || '#64748b', color: 'white', fontSize: 11 }}>
                    {p.phase || 'APS'}
                  </span>
                  <span>{p._count?.documents ?? 0} docs</span>
                  <span className={p._count?.alertes > 0 ? 'badge-alert' : 'badge-ok'}>
                    {p._count?.alertes ?? 0} alertes
                  </span>
                  {p.bloqueExe && <span className="badge-alert">⛔ EXE bloqué</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
