const express = require('express')
const authMiddleware = require('../middleware/auth')
const { questionIA, analyserProjet, verifierAlertes } = require('../services/ia')

const router = express.Router()
router.use(authMiddleware)

// POST /ia/question
router.post('/question', async (req, res) => {
  const { projetId, question, documentIds } = req.body
  if (!projetId || !question) {
    return res.status(400).json({ error: 'projetId et question requis' })
  }

  const ids = Array.isArray(documentIds) ? documentIds.map(Number) : []
  const reponse = await questionIA(parseInt(projetId), req.user.id, question, ids)
  res.json({ reponse })
})

// POST /ia/analyser — déclencher manuellement l'analyse
router.post('/analyser', async (req, res) => {
  const { projetId } = req.body
  if (!projetId) {
    return res.status(400).json({ error: 'projetId requis' })
  }

  const alertes = await analyserProjet(parseInt(projetId))
  res.json({ alertes, count: alertes.length })
})

// POST /ia/verifier-alertes/:projetId
router.post('/verifier-alertes/:projetId', async (req, res) => {
  const projetId = parseInt(req.params.projetId)
  if (!projetId) return res.status(400).json({ error: 'projetId requis' })
  try {
    const result = await verifierAlertes(projetId)
    res.json(result)
  } catch (err) {
    console.error('Erreur verifierAlertes:', err)
    res.status(500).json({ error: err.message || 'Erreur lors de la vérification' })
  }
})

module.exports = router
