import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function VocabulaireGlobal() {
  const navigate = useNavigate()
  const [termes, setTermes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [newTerme, setNewTerme] = useState('')
  const [newDef, setNewDef] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { charger() }, [])

  async function charger() {
    const res = await api.get('/vocabulaire-global')
    setTermes(res.data)
    setLoading(false)
  }

  async function ajouter(e) {
    e.preventDefault()
    if (!newTerme.trim() || !newDef.trim()) return
    await api.post('/vocabulaire-global', { terme: newTerme.trim(), definition: newDef.trim() })
    setNewTerme('')
    setNewDef('')
    charger()
  }

  async function supprimer(id) {
    await api.delete(`/vocabulaire-global/${id}`)
    setTermes(termes.filter(t => t.id !== id))
  }

  async function importer() {
    const entrees = importText.split('\n')
      .map(l => l.split('→'))
      .filter(p => p.length >= 2 && p[0].trim())
      .map(p => ({ terme: p[0].trim(), definition: p.slice(1).join('→').trim() }))
    if (!entrees.length) return
    const res = await api.post('/vocabulaire-global/import', { entrees })
    setMsg(`${res.data.importes} termes importés`)
    setImportText('')
    setShowImport(false)
    charger()
  }

  return (
    <div className="page">
      <header className="topbar">
        <span style={{ fontWeight: 700, fontSize: 18 }}>Vocabulaire global</span>
        <div className="topbar-right">
          <button onClick={() => navigate('/')} className="btn-ghost">← Dashboard</button>
        </div>
      </header>

      <main className="main-content" style={{ maxWidth: 800, margin: '0 auto' }}>
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Termes métier</h2>
              <p className="text-muted text-sm">Injectés automatiquement dans toutes les comparaisons IA de tous les projets.</p>
            </div>
            <button onClick={() => setShowImport(!showImport)} className="btn-secondary">↓ Importer en masse</button>
          </div>

          {showImport && (
            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Une ligne par terme, format : <code>TERME → définition</code>
              </p>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={'GO → Gros Œuvre\nBRS → Bail Réel Solidaire\nECS → Eau Chaude Sanitaire'}
                rows={8}
                style={{ fontFamily: 'monospace', fontSize: 12, width: '100%', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={importer} className="btn-primary" style={{ fontSize: 13 }}>
                  Importer ({importText.split('\n').filter(l => l.includes('→')).length} termes)
                </button>
                <button onClick={() => setShowImport(false)} className="btn-ghost" style={{ fontSize: 13 }}>Annuler</button>
              </div>
            </div>
          )}

          <form onSubmit={ajouter} className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input value={newTerme} onChange={e => setNewTerme(e.target.value)} placeholder="Terme / abréviation" style={{ width: 180, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <input value={newDef} onChange={e => setNewDef(e.target.value)} placeholder="Définition / équivalent" style={{ flex: 1 }} />
            <button type="submit" className="btn-primary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>+ Ajouter</button>
          </form>

          {msg && <p style={{ color: '#22c55e', fontSize: 13, marginBottom: 12 }}>{msg}</p>}

          {loading ? (
            <p className="text-muted">Chargement...</p>
          ) : termes.length === 0 ? (
            <p className="text-muted">Aucun terme défini.</p>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 200 }}>TERME</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>DÉFINITION</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {termes.map((t, i) => (
                    <tr key={t.id} style={{ borderBottom: i < termes.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 13 }}>{t.terme}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{t.definition}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <button onClick={() => supprimer(t.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}>✕</button>
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
