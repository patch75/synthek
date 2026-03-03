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
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function poserQuestion(e) {
    e.preventDefault()
    if (!question.trim()) return

    const q = question.trim()
    setQuestion('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)

    try {
      const res = await api.post('/ia/question', { projetId: parseInt(id), question: q })
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
          <span className="text-muted" style={{ fontSize: 12 }}>3 sources : réglementation · documents · puces</span>
        </div>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Posez une question sur vos documents ou la réglementation.</p>
              <p className="text-muted">L'assistant croise la réglementation (DTU, RT2020…), vos documents et les puces.</p>
              <div className="chat-source-legend">
                <SourceTag label="Réglementation" color="#7c3aed" />
                <SourceTag label="Documents" color="#2563eb" />
                <SourceTag label="Puces" color="#059669" />
              </div>
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
