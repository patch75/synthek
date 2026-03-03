const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')

const router = express.Router()

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  res.json({ token, user: { id: user.id, nom: user.nom, email: user.email, role: user.role } })
})

// POST /auth/register (création d'un compte, usage interne/admin)
router.post('/register', async (req, res) => {
  const { nom, email, password, role } = req.body
  if (!nom || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' })
  }

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    return res.status(409).json({ error: 'Email déjà utilisé' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { nom, email, password: hashed, role: role || 'expert' },
    select: { id: true, nom: true, email: true, role: true }
  })

  res.status(201).json(user)
})

module.exports = router
