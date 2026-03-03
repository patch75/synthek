const express = require('express')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { hashFichier } = require('../services/certificat')

const router = express.Router()
router.use(authMiddleware)

// GET /visas/:projetId — liste tous les visas d'un projet
router.get('/:projetId', async (req, res) => {
  const visas = await prisma.visa.findMany({
    where: { projetId: parseInt(req.params.projetId) },
    include: {
      user: { select: { id: true, nom: true, role: true } },
      document: { select: { id: true, nom: true, type: true, version: true } }
    },
    orderBy: { dateVisa: 'desc' }
  })
  res.json(visas)
})

// GET /visas/document/:documentId — visas d'un document spécifique
router.get('/document/:documentId', async (req, res) => {
  const visas = await prisma.visa.findMany({
    where: { documentId: parseInt(req.params.documentId) },
    include: {
      user: { select: { id: true, nom: true, role: true } }
    },
    orderBy: { dateVisa: 'desc' }
  })
  res.json(visas)
})

// POST /visas — créer un visa
router.post('/', async (req, res) => {
  // Le bureau de contrôle ne peut pas créer de visas
  if (req.user.role === 'bureau_controle') {
    return res.status(403).json({ error: 'Le bureau de contrôle est en lecture seule' })
  }

  const { projetId, documentId, action, commentaire } = req.body
  const actionsValides = ['FAVORABLE', 'AVEC_RESERVES', 'DEFAVORABLE']

  if (!projetId || !documentId || !action) {
    return res.status(400).json({ error: 'projetId, documentId et action requis' })
  }
  if (!actionsValides.includes(action)) {
    return res.status(400).json({ error: `Action invalide. Valeurs acceptées : ${actionsValides.join(', ')}` })
  }

  const document = await prisma.document.findUnique({ where: { id: parseInt(documentId) } })
  if (!document) return res.status(404).json({ error: 'Document non trouvé' })

  // Calculer le hash du fichier au moment du visa
  const hashDocument = hashFichier(document.cheminFichier)

  const visa = await prisma.visa.create({
    data: {
      projetId: parseInt(projetId),
      documentId: parseInt(documentId),
      userId: req.user.id,
      action,
      commentaire: commentaire || null,
      hashDocument
    },
    include: {
      user: { select: { id: true, nom: true, role: true } },
      document: { select: { id: true, nom: true, type: true } }
    }
  })

  res.status(201).json(visa)
})

module.exports = router
