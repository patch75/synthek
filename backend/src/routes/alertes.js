const express = require('express')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const router = express.Router()
router.use(authMiddleware)

// GET /alertes/:projetId
router.get('/:projetId', async (req, res) => {
  const alertes = await prisma.alerte.findMany({
    where: { projetId: parseInt(req.params.projetId) },
    include: {
      documents: { include: { document: { select: { nom: true, type: true, user: { select: { nom: true } } } } } }
    },
    orderBy: { dateCreation: 'desc' }
  })
  res.json(alertes)
})

// DELETE /alertes/:id — supprimer définitivement une alerte
router.delete('/:id', async (req, res) => {
  await prisma.alerte.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ message: 'Alerte supprimée' })
})

// PATCH /alertes/:id/resoudre — marquer une alerte comme résolue (V3 : enrichie)
router.patch('/:id/resoudre', async (req, res) => {
  const { resoluePar, justificationDerogation } = req.body || {}
  const data = {
    statut: 'resolue',
    dateResolution: new Date()
  }
  if (resoluePar) data.resoluePar = resoluePar
  if (justificationDerogation) data.justificationDerogation = justificationDerogation

  const alerte = await prisma.alerte.update({
    where: { id: parseInt(req.params.id) },
    data
  })
  res.json(alerte)
})

// POST /alertes/:id/arbitrage — créer une décision d'arbitrage (V3 — Bloc 5)
router.post('/:id/arbitrage', async (req, res) => {
  const alerteId = parseInt(req.params.id)
  const { type, justification } = req.body

  if (!type || !justification) {
    return res.status(400).json({ error: 'type et justification requis' })
  }

  const typesValides = ['arbitrage_moa', 'derogation_reglementaire']
  if (!typesValides.includes(type)) {
    return res.status(400).json({ error: `type invalide. Valeurs : ${typesValides.join(', ')}` })
  }

  const alerte = await prisma.alerte.findUnique({ where: { id: alerteId } })
  if (!alerte) return res.status(404).json({ error: 'Alerte non trouvée' })

  const decision = await prisma.decisionArbitrage.create({
    data: {
      projetId: alerte.projetId,
      alerteId,
      type,
      justification,
      decideParId: req.user.id
    }
  })
  res.status(201).json(decision)
})

// GET /alertes/:projetId/arbitrages — lister les décisions d'arbitrage (V3 — Bloc 5)
router.get('/:projetId/arbitrages', async (req, res) => {
  const projetId = parseInt(req.params.projetId)
  const decisions = await prisma.decisionArbitrage.findMany({
    where: { projetId },
    include: {
      alerte: { select: { message: true, statut: true } },
      decidePar: { select: { nom: true, email: true } }
    },
    orderBy: { dateDecision: 'desc' }
  })
  res.json(decisions)
})

// GET /alertes/:projetId/historique — alertes résolues + messages IA
router.get('/:projetId/historique', async (req, res) => {
  const projetId = parseInt(req.params.projetId)

  const [alertesResolues, messagesIA] = await Promise.all([
    prisma.alerte.findMany({
      where: { projetId, statut: 'resolue' },
      include: {
        documents: { include: { document: { select: { nom: true, type: true } } } }
      },
      orderBy: { dateResolution: 'desc' }
    }),
    prisma.messageIA.findMany({
      where: { projetId },
      include: { user: { select: { nom: true } } },
      orderBy: { date: 'desc' }
    })
  ])

  res.json({ alertesResolues, messagesIA })
})

module.exports = router
