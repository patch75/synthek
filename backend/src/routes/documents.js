const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { extractText } = require('../services/extractText')
const { analyserProjet, genererPuce, comparerVersions } = require('../services/ia')
const { extraireFaits } = require('../services/extractFaits')

const router = express.Router()
router.use(authMiddleware)

const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || './storage')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projetId = req.body.projetId
    if (projetId && req.user?.role) {
      const role = req.user.role === 'admin' ? 'moa' : req.user.role
      const dest = path.join(STORAGE_ROOT, 'projets', String(projetId), role)
      fs.mkdirSync(dest, { recursive: true })
      cb(null, dest)
    } else {
      cb(null, process.env.UPLOAD_DIR || './uploads')
    }
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.xlsx', '.xls']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('Type de fichier non supporté'))
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
})

// V3 — Bloc 3 : extraire statutDocument et indiceRevision du nom de fichier
// Convention : TYPE_INTERVENANT_vX_STATUT.ext
// STATUT : PRO=provisoire, VISA=pour_visa, VALID=valide
function parseNomFichier(nomFichier) {
  const sanExt = path.basename(nomFichier, path.extname(nomFichier))
  const parties = sanExt.split('_')

  let statutDocument = null
  let indiceRevision = null

  for (const partie of parties) {
    // Indice de révision : v1, v2, v3...
    if (/^v\d+$/i.test(partie)) {
      indiceRevision = partie.toLowerCase()
    }
    // Statut document
    const upper = partie.toUpperCase()
    if (upper === 'PRO') statutDocument = 'provisoire'
    else if (upper === 'VISA') statutDocument = 'pour_visa'
    else if (upper === 'VALID') statutDocument = 'valide'
  }

  return { statutDocument, indiceRevision }
}

function calculerHash(cheminFichier) {
  try {
    const contenu = fs.readFileSync(cheminFichier)
    return crypto.createHash('sha256').update(contenu).digest('hex')
  } catch {
    return null
  }
}

// POST /documents/upload
router.post('/upload', upload.single('fichier'), async (req, res) => {
  // Le bureau de contrôle ne peut pas déposer de documents
  if (req.user.role === 'bureau_controle') {
    return res.status(403).json({ error: 'Le bureau de contrôle est en lecture seule et ne peut pas déposer de documents' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Fichier requis' })
  }

  const { projetId, resumeModif } = req.body
  if (!projetId) {
    return res.status(400).json({ error: 'projetId requis' })
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '')

  // Calculer SHA-256 du fichier uploadé
  const hashNouveauFichier = calculerHash(req.file.path)

  // Chercher un document existant avec le même nom et projetId
  const docExistant = await prisma.document.findFirst({
    where: {
      projetId: parseInt(projetId),
      nom: req.file.originalname
    },
    orderBy: { version: 'desc' }
  })

  // Détection de doublon : même nom ET même hash → fichier identique
  if (docExistant && hashNouveauFichier && docExistant.hashFichier === hashNouveauFichier) {
    fs.unlinkSync(req.file.path)
    return res.status(200).json({
      doublon: true,
      message: 'Pas de modification détectée, fichier identique à la version précédente'
    })
  }

  // Extraction du texte
  let contenuTexte = null
  try {
    contenuTexte = await extractText(req.file.path, ext, req.file.originalname)
  } catch (err) {
    console.error('Erreur extraction texte:', err.message)
  }

  // V3 — Bloc 3 : extraire statut et indice du nom de fichier
  const { statutDocument, indiceRevision } = parseNomFichier(req.file.originalname)

  // Construire les données du document
  const documentData = {
    projetId: parseInt(projetId),
    userId: req.user.id,
    nom: req.file.originalname,
    type: ext,
    cheminFichier: req.file.path,
    contenuTexte,
    resumeModif: resumeModif || null,
    hashFichier: hashNouveauFichier,
    statutDocument,
    indiceRevision
  }

  // Si version précédente existe avec hash différent → nouvelle version
  if (docExistant) {
    documentData.versionPrecedenteId = docExistant.id
    documentData.version = docExistant.version + 1
  }

  const document = await prisma.document.create({ data: documentData })

  // Extraction faits → puis analyse projet (séquencé)
  const pid = parseInt(projetId)
  const backgroundTasks = async () => {
    // 1. Puce + Faits en parallèle (indépendants l'un de l'autre)
    await Promise.all([
      genererPuce(document.id, pid, contenuTexte, document.nom)
        .catch(err => console.error('Erreur génération puce:', err.message)),
      extraireFaits(document.id, pid, contenuTexte, document.nom)
        .catch(err => console.error('Erreur extraction faits:', err.message))
    ])

    // 2. Analyse projet une fois les faits en base
    analyserProjet(pid)
      .catch(err => console.error('Erreur analyse IA:', err.message))

    // 3. Delta si version précédente (indépendant)
    if (docExistant && docExistant.contenuTexte) {
      comparerVersions(document.id, docExistant.id, contenuTexte, docExistant.contenuTexte, document.nom)
        .catch(err => console.error('Erreur comparaison versions:', err.message))
    }
  }
  backgroundTasks()  // sans await — non-bloquant

  res.status(201).json(document)
})

// GET /documents/:projetId — liste les documents d'un projet
router.get('/:projetId', async (req, res) => {
  const documents = await prisma.document.findMany({
    where: { projetId: parseInt(req.params.projetId) },
    include: {
      user: { select: { nom: true, email: true } },
      puce: true
    },
    orderBy: { dateDepot: 'desc' }
  })
  res.json(documents)
})

module.exports = router
