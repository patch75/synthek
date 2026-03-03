const express = require('express')
const authMiddleware = require('../middleware/auth')
const { questionIA, analyserProjet } = require('../services/ia')

const router = express.Router()
router.use(authMiddleware)

// POST /ia/question
router.post('/question', async (req, res) => {
  const { projetId, question } = req.body
  if (!projetId || !question) {
    return res.status(400).json({ error: 'projetId et question requis' })
  }

  const reponse = await questionIA(parseInt(projetId), req.user.id, question)
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

module.exports = router
