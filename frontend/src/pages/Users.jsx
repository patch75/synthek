import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

const ROLES = [
  { value: 'admin',           label: 'Administrateur' },
  { value: 'moa',             label: 'MOA' },
  { value: 'architecte',      label: 'Architecte' },
  { value: 'bet_fluides',     label: 'BET Fluides' },
  { value: 'bet_thermique',   label: 'BET Thermique' },
  { value: 'bet_structure',   label: 'BET Structure' },
  { value: 'bet_electricite', label: 'BET Électricité' },
  { value: 'bet_vrd',         label: 'BET VRD' },
  { value: 'bet_geotechnique',label: 'BET Géotechnique' },
  { value: 'economiste',      label: 'Économiste' },
  { value: 'assistant_moa',   label: 'Assistant MOA' },
  { value: 'bet_hqe',         label: 'BET HQE' },
  { value: 'acousticien',     label: 'Acousticien' },
  { value: 'bureau_controle', label: 'Bureau de contrôle' },
]

const ROLE_COLORS = {
  admin:           { bg: '#ede9fe', color: '#7c3aed' },
  moa:             { bg: '#f0fdf4', color: '#059669' },
  architecte:      { bg: '#eff6ff', color: '#2563eb' },
  bet_fluides:     { bg: '#f0fdf4', color: '#16a34a' },
  bet_thermique:   { bg: '#fff7ed', color: '#c2410c' },
  bet_structure:   { bg: '#fef3c7', color: '#b45309' },
  bet_electricite: { bg: '#fdf4ff', color: '#9333ea' },
  bet_vrd:         { bg: '#f0f9ff', color: '#0369a1' },
  bet_geotechnique:{ bg: '#fdf2f8', color: '#db2777' },
  economiste:      { bg: '#ecfdf5', color: '#047857' },
  assistant_moa:   { bg: '#f8fafc', color: '#475569' },
  bet_hqe:         { bg: '#f0fdfa', color: '#0f766e' },
  acousticien:     { bg: '#fef9c3', color: '#a16207' },
  bureau_controle: { bg: '#fef9c3', color: '#a16207' },
}

function RoleBadge({ role }) {
  const style = ROLE_COLORS[role] || { bg: '#f1f5f9', color: '#475569' }
  const label = ROLES.find(r => r.value === role)?.label || role
  return (
    <span style={{ background: style.bg, color: style.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  )
}

function PasswordModal({ user, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirm) return setError('Les mots de passe ne correspondent pas')
    setSaving(true)
    try {
      await api.patch(`/users/${user.id}/password`, { password: newPassword })
      onSuccess(`Mot de passe modifié pour ${user.nom}`)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la modification')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Modifier le mot de passe</h3>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        <p className="text-muted" style={{ marginBottom: 20, fontSize: 13 }}>
          Compte : <strong>{user.nom}</strong> — {user.email}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nouveau mot de passe</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Confirmer le mot de passe</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Users() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('moa')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [creating, setCreating] = useState(false)
  const [editPwd, setEditPwd] = useState(null)
  const [editingRoleId, setEditingRoleId] = useState(null)

  useEffect(() => {
    api.get('/users').then(res => {
      setUsers(res.data)
      setLoading(false)
    })
  }, [])

  async function creerUtilisateur(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setCreating(true)
    try {
      const res = await api.post('/users', { nom, email, password, role })
      setUsers(prev => [res.data, ...prev])
      setNom(''); setEmail(''); setPassword(''); setRole('moa')
      setShowForm(false)
      showSuccess(`Compte créé pour ${res.data.nom}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  async function supprimerUtilisateur(id, nom) {
    if (!confirm(`Supprimer le compte de ${nom} ? Cette action est irréversible.`)) return
    try {
      await api.delete(`/users/${id}`)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  function showSuccess(msg) {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 4000)
  }

  async function changerRole(id, newRole) {
    try {
      const res = await api.patch(`/users/${id}/role`, { role: newRole })
      setUsers(prev => prev.map(u => u.id === id ? res.data : u))
      setEditingRoleId(null)
      showSuccess(`Rôle mis à jour`)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la modification du rôle')
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="container">

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Gestion des utilisateurs
          </h2>
          <button onClick={() => { setShowForm(!showForm); setError('') }} className="btn-primary">
            + Nouvel utilisateur
          </button>
        </div>

        {success && (
          <div className="analyse-msg analyse-ok" style={{ marginBottom: 20 }}>✓ {success}</div>
        )}

        {/* Formulaire de création */}
        {showForm && (
          <div className="card" style={{ marginBottom: 28 }}>
            <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 700 }}>Créer un compte utilisateur</h3>
            <form onSubmit={creerUtilisateur}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                <div className="form-group">
                  <label>Nom complet</label>
                  <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Jean Dupont" required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jean@exemple.fr" required />
                </div>
                <div className="form-group">
                  <label>Mot de passe</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
                <div className="form-group">
                  <label>Rôle</label>
                  <select value={role} onChange={e => setRole(e.target.value)}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              {error && <p className="error-msg">{error}</p>}
              <div className="form-actions">
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Création...' : 'Créer le compte'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError('') }} className="btn-ghost">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tableau des utilisateurs */}
        <div className="section-header">
          <h2>Tous les comptes ({users.length})</h2>
        </div>

        {loading ? (
          <p className="text-muted">Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Créé le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.nom}</td>
                    <td className="text-muted">{u.email}</td>
                    <td>
                      {editingRoleId === u.id ? (
                        <select
                          defaultValue={u.role}
                          autoFocus
                          onChange={e => changerRole(u.id, e.target.value)}
                          onBlur={() => setEditingRoleId(null)}
                          style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}
                        >
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span
                          onClick={() => setEditingRoleId(u.id)}
                          title="Cliquer pour modifier"
                          style={{ cursor: 'pointer' }}
                        >
                          <RoleBadge role={u.role} />
                        </span>
                      )}
                    </td>
                    <td className="text-muted text-sm">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setEditPwd(u)}
                          title="Modifier le mot de passe"
                        >
                          🔑 Mot de passe
                        </button>
                        <button
                          className="btn-danger-sm"
                          onClick={() => supprimerUtilisateur(u.id, u.nom)}
                          title="Supprimer ce compte"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modale mot de passe */}
      {editPwd && (
        <PasswordModal
          user={editPwd}
          onClose={() => setEditPwd(null)}
          onSuccess={showSuccess}
        />
      )}
    </div>
  )
}
