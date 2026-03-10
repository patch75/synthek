import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

function SourceTag({ label, color }) {
  return (
    <span className="source-tag" style={{ background: color + '20', color }}>
      {label}
    </span>
  )
}

function detectSources(text) {
  const sources = []
  if (/DTU|arrêté|RE2020|RT2020|ERP|CCH|Eurocode|NF EN|réglementation/i.test(text)) {
    sources.push({ label: 'Réglementation', color: '#7c3aed' })
  }
  if (/document|CCTP|DPGF|plan|note de calcul|compte.rendu/i.test(text)) {
    sources.push({ label: 'Documents', color: '#2563eb' })
  }
  if (/puce|fiche|livrable|valeur clé/i.test(text)) {
    sources.push({ label: 'Puces', color: '#059669' })
  }
  return sources
}

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState([])
  const [docsSelectionnes, setDocsSelectionnes] = useState(new Set())
  const [showDocSelector, setShowDocSelector] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    api.get(`/documents/${id}`)
      .then(res => setDocs(res.data.filter(d => d.contenuTexte)))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function toggleDoc(docId) {
    setDocsSelectionnes(prev => {
      const next = new Set(prev)
      next.has(docId) ? next.delete(docId) : next.add(docId)
      return next
    })
  }

  async function poserQuestion(e) {
    e.preventDefault()
    if (!question.trim()) return

    const q = question.trim()
    setQuestion('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)

    try {
      const res = await api.post('/ia/question', {
        projetId: parseInt(id),
        question: q,
        documentIds: [...docsSelectionnes]
      })
      const reponse = res.data.reponse
      setMessages(prev => [...prev, { role: 'ia', content: reponse, sources: detectSources(reponse) }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ia', content: 'Erreur : ' + (err.response?.data?.error || 'Impossible de contacter l\'IA'), sources: [] }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page chat-page">
      <header className="topbar">
        <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: 22, lineHeight: 1 }}>⬅</button>
        <img src={logo} alt="synthek" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <div className="chat-container">
        <div style={{ padding: '20px 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 4 }}>
            Assistant IA
          </h2>
          <span className="text-muted" style={{ fontSize: 12 }}>Réglementation · puces · documents sélectionnés</span>
        </div>

        {/* Sélecteur de documents */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
          <div
            onClick={() => setShowDocSelector(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-muted)', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              Documents inclus dans le contexte
              <span style={{ marginLeft: 8, color: docsSelectionnes.size > 0 ? '#2563eb' : 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}>
                {docsSelectionnes.size === 0 ? 'aucun — réglementation + puces seulement' : `${docsSelectionnes.size} sélectionné${docsSelectionnes.size > 1 ? 's' : ''}`}
              </span>
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', transform: showDocSelector ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
          </div>
          {showDocSelector && (
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {docs.length === 0 ? (
                <p className="text-muted text-sm">Aucun document avec texte extrait.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setDocsSelectionnes(new Set(docs.map(d => d.id)))}>Tout sélectionner</button>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setDocsSelectionnes(new Set())}>Tout désélectionner</button>
                  </div>
                  {docs.map(doc => (
                    <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={docsSelectionnes.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                      />
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.nom}</span>
                      <span className="text-muted" style={{ fontSize: 11, flexShrink: 0 }}>{doc.type?.toUpperCase()}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Posez une question sur vos documents ou la réglementation.</p>
              <p className="text-muted">Sélectionnez les documents à inclure dans le contexte ci-dessus.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`message message-${msg.role}`}>
              <div className="message-bubble">
                {msg.role === 'ia' && msg.sources?.length > 0 && (
                  <div className="message-sources">
                    {msg.sources.map(s => (
                      <SourceTag key={s.label} label={s.label} color={s.color} />
                    ))}
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message message-ia">
              <div className="message-bubble loading-bubble">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={poserQuestion} className="chat-input-bar">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Posez votre question..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !question.trim()} className="btn-primary">
            Envoyer
          </button>
        </form>
      </div>
    </div>
  )
}
