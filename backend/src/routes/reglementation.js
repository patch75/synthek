const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { extractText } = require('../services/extractText')

const router = express.Router()
router.use(authMiddleware)

// Seuls les admins peuvent gérer les documents de réglementation
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' })
  }
  next()
}

const reglDir = path.join(process.env.UPLOAD_DIR || './uploads', 'reglementation')
if (!fs.existsSync(reglDir)) fs.mkdirSync(reglDir, { recursive: true })

const storage = multer.diskStorage({
  destination: reglDir,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.pdf') cb(null, true)
    else cb(new Error('Seuls les fichiers PDF sont acceptés'))
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

// GET /reglementation — liste les PDFs de référence
router.get('/', async (req, res) => {
  const refs = await prisma.reglementationRef.findMany({
    include: { uploadedBy: { select: { nom: true } } },
    orderBy: { dateUpload: 'desc' }
  })
  res.json(refs)
})

// POST /reglementation/upload — upload un PDF de référence (admin only)
router.post('/upload', adminOnly, upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' })

  const { nom, description } = req.body
  if (!nom) return res.status(400).json({ error: 'nom requis' })

  // Extraction automatique du texte
  let contenuTexte = null
  try {
    contenuTexte = await extractText(req.file.path, 'pdf')
  } catch (err) {
    console.error('Erreur extraction texte réglementation:', err.message)
  }

  const ref = await prisma.reglementationRef.create({
    data: {
      nom,
      description: description || null,
      cheminFichier: req.file.path,
      contenuTexte,
      uploadedById: req.user.id
    },
    include: { uploadedBy: { select: { nom: true } } }
  })

  res.status(201).json(ref)
})

// DELETE /reglementation/:id — supprimer un PDF de référence (admin only)
router.delete('/:id', adminOnly, async (req, res) => {
  const ref = await prisma.reglementationRef.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!ref) return res.status(404).json({ error: 'Document non trouvé' })

  // Supprimer le fichier physique
  try {
    if (fs.existsSync(ref.cheminFichier)) fs.unlinkSync(ref.cheminFichier)
  } catch (err) {
    console.error('Erreur suppression fichier:', err.message)
  }

  await prisma.reglementationRef.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ message: 'Document supprimé' })
})

module.exports = router
