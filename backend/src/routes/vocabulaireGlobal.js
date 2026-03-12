const express = require('express')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const router = express.Router()
router.use(authMiddleware)

// GET /vocabulaire-global — liste tous les termes
router.get('/', async (req, res) => {
  const termes = await prisma.vocabulaireGlobal.findMany({ orderBy: { terme: 'asc' } })
  res.json(termes)
})

// POST /vocabulaire-global — créer ou mettre à jour un terme (admin)
router.post('/', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { terme, definition } = req.body
  if (!terme || !definition) return res.status(400).json({ error: 'terme et definition requis' })
  const entry = await prisma.vocabulaireGlobal.upsert({
    where: { terme },
    create: { terme, definition },
    update: { definition }
  })
  res.json(entry)
})

// DELETE /vocabulaire-global/:id — supprimer un terme (admin)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.vocabulaireGlobal.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ ok: true })
})

// POST /vocabulaire-global/import — import en masse (admin)
router.post('/import', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { entrees } = req.body // [{ terme, definition }]
  if (!Array.isArray(entrees)) return res.status(400).json({ error: 'entrees doit être un tableau' })
  let count = 0
  for (const e of entrees) {
    if (!e.terme || !e.definition) continue
    await prisma.vocabulaireGlobal.upsert({
      where: { terme: e.terme },
      create: { terme: e.terme, definition: e.definition },
      update: { definition: e.definition }
    })
    count++
  }
  res.json({ importes: count })
})

module.exports = router
