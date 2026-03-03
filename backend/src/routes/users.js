const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')
const auth = require('../middleware/auth')

const router = express.Router()

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  next()
}

// GET /users — liste tous les utilisateurs (admin only)
router.get('/', auth, adminOnly, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, nom: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  })
  res.json(users)
})

// POST /users — créer un utilisateur (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  const { nom, email, password, role } = req.body
  if (!nom || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' })
  }

  const ROLES = ['admin', 'expert', 'moa', 'architecte', 'ingenieur_fluides', 'ingenieur_structure', 'ingenieur_electricite', 'economiste', 'chef_projet', 'bureau_controle']
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' })
  }

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return res.status(409).json({ error: 'Cet email est déjà utilisé' })

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { nom, email, password: hashed, role: role || 'expert' },
    select: { id: true, nom: true, email: true, role: true, createdAt: true }
  })
  res.status(201).json(user)
})

// PATCH /users/:id/password — changer le mot de passe (admin only)
router.patch('/:id/password', auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id)
  const { password } = req.body
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' })
  }
  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id }, data: { password: hashed } })
  res.json({ ok: true })
})

// PATCH /users/:id/role — changer le rôle (admin only)
router.patch('/:id/role', auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id)
  const { role } = req.body
  const ROLES = ['admin', 'expert', 'moa', 'architecte', 'ingenieur_fluides', 'ingenieur_structure', 'ingenieur_electricite', 'economiste', 'chef_projet', 'bureau_controle']
  if (!role || !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' })
  }
  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, nom: true, email: true, role: true, createdAt: true }
  })
  res.json(user)
})

// DELETE /users/:id — supprimer un utilisateur (admin only, ne peut pas se supprimer soi-même)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id)
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' })
  }
  await prisma.user.delete({ where: { id } })
  res.json({ ok: true })
})

module.exports = router
