const express = require('express')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { analyserSynthese } = require('../services/ia')

const router = express.Router()
router.use(authMiddleware)

// GET /syntheses/:projetId — liste les synthèses d'un projet
router.get('/:projetId', async (req, res) => {
  const syntheses = await prisma.synthese.findMany({
    where: { projetId: parseInt(req.params.projetId) },
    include: {
      documentSource: { select: { id: true, nom: true, type: true } }
    },
    orderBy: { dateAnalyse: 'desc' }
  })
  res.json(syntheses)
})

// GET /syntheses/detail/:id — détail d'une synthèse
router.get('/detail/:id', async (req, res) => {
  const synthese = await prisma.synthese.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      documentSource: { select: { id: true, nom: true, type: true } }
    }
  })
  if (!synthese) return res.status(404).json({ error: 'Synthèse non trouvée' })
  res.json(synthese)
})

// POST /syntheses/declencher — déclenche une analyse croisée manuellement
router.post('/declencher', async (req, res) => {
  const { projetId, codeSynthese, documentIdSource, documentsCroisesIds } = req.body

  if (!projetId || !codeSynthese || !documentIdSource || !documentsCroisesIds) {
    return res.status(400).json({ error: 'projetId, codeSynthese, documentIdSource et documentsCroisesIds requis' })
  }

  if (!Array.isArray(documentsCroisesIds) || documentsCroisesIds.length === 0) {
    return res.status(400).json({ error: 'documentsCroisesIds doit être un tableau non vide' })
  }

  try {
    const synthese = await analyserSynthese(
      parseInt(projetId),
      codeSynthese,
      parseInt(documentIdSource),
      documentsCroisesIds.map(id => parseInt(id))
    )
    res.status(201).json(synthese)
  } catch (err) {
    console.error('Erreur analyse synthèse:', err.message)
    res.status(500).json({ error: err.message || 'Erreur lors de l\'analyse' })
  }
})

module.exports = router
