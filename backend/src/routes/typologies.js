const express = require('express')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const router = express.Router()
router.use(authMiddleware)

// GET /typologies
router.get('/', async (req, res) => {
  const typologies = await prisma.typologiePersonnalisee.findMany({ orderBy: { nom: 'asc' } })
  res.json(typologies)
})

// POST /typologies (admin)
router.post('/', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { nom } = req.body
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  try {
    const t = await prisma.typologiePersonnalisee.create({ data: { nom: nom.trim() } })
    res.status(201).json(t)
  } catch {
    res.status(409).json({ error: 'Cette typologie existe déjà' })
  }
})

// DELETE /typologies/:id (admin)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.typologiePersonnalisee.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ message: 'Supprimé' })
})

module.exports = router
