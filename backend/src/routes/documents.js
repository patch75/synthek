const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { extractText } = require('../services/extractText')
const { genererPuce, comparerVersions } = require('../services/ia')
const { extraireFaits } = require('../services/extractFaits')
const { comparerAvecReference } = require('../services/comparerDocuments')
const { detecterLot } = require('../services/lotDetector')

const router = express.Router()
router.use(authMiddleware)

const fixFilename = (name) => Buffer.from(name, 'latin1').toString('utf8')

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
    cb(null, `${unique}${path.extname(fixFilename(file.originalname))}`)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.xlsx', '.xls']
    const ext = path.extname(fixFilename(file.originalname)).toLowerCase()
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

  const { projetId, resumeModif, categorieDoc, sousProgrammeId, modeleIA } = req.body
  // IDs des sous-programmes sélectionnés pour la comparaison (tableau ou valeur unique)
  const comparerAvecSpsRaw = req.body['comparerAvecSps[]'] || req.body.comparerAvecSps
  const comparerAvecSps = comparerAvecSpsRaw
    ? (Array.isArray(comparerAvecSpsRaw) ? comparerAvecSpsRaw : [comparerAvecSpsRaw]).map(Number)
    : null
  if (!projetId) {
    return res.status(400).json({ error: 'projetId requis' })
  }

  const nomFichier = fixFilename(req.file.originalname)
  const ext = path.extname(nomFichier).toLowerCase().replace('.', '')

  // Calculer SHA-256 du fichier uploadé
  const hashNouveauFichier = calculerHash(req.file.path)

  // Chercher un document existant avec le même nom et projetId
  const docExistant = await prisma.document.findFirst({
    where: {
      projetId: parseInt(projetId),
      nom: nomFichier
    },
    orderBy: { version: 'desc' }
  })

  // Détection de doublon : même nom ET même hash ET fichier toujours présent sur disque
  if (docExistant && hashNouveauFichier && docExistant.hashFichier === hashNouveauFichier) {
    const cheminExistant = path.resolve(__dirname, '../../', docExistant.cheminFichier)
    if (fs.existsSync(cheminExistant)) {
      fs.unlinkSync(req.file.path)
      return res.status(200).json({
        doublon: true,
        message: 'Pas de modification détectée, fichier identique à la version précédente'
      })
    }
    // Fichier supprimé du disque → on permet le re-dépôt (ancienne entrée DB orpheline)
  }

  // Extraction du texte
  let contenuTexte = null
  try {
    contenuTexte = await extractText(req.file.path, ext, nomFichier)
  } catch (err) {
    console.error('Erreur extraction texte:', err.message)
  }

  // V3 — Bloc 3 : extraire statut et indice du nom de fichier
  const { statutDocument, indiceRevision } = parseNomFichier(nomFichier)

  // Détecter le lot automatiquement si CCTP ou DPGF
  const cat = categorieDoc || ''
  const lotDetecte = (cat === 'cctp' || cat === 'dpgf') ? detecterLot(nomFichier) : null

  // Construire les données du document
  const documentData = {
    projetId: parseInt(projetId),
    userId: req.user.id,
    nom: nomFichier,
    type: ext,
    cheminFichier: req.file.path,
    contenuTexte,
    resumeModif: resumeModif || null,
    hashFichier: hashNouveauFichier,
    statutDocument,
    indiceRevision,
    categorieDoc: categorieDoc || null,
    sousProgrammeId: sousProgrammeId ? parseInt(sousProgrammeId) : null,
    lotType: lotDetecte
  }

  // Si version précédente existe avec hash différent → nouvelle version
  if (docExistant) {
    documentData.versionPrecedenteId = docExistant.id
    documentData.version = docExistant.version + 1
  }

  const document = await prisma.document.create({ data: documentData })

  // Extraction puce + faits en background (analyse projet = manuelle)
  const pid = parseInt(projetId)
  const backgroundTasks = async () => {
    // 1. Puce + Faits en parallèle — analyse projet déclenchée manuellement
    await Promise.all([
      genererPuce(document.id, pid, contenuTexte, document.nom)
        .catch(err => console.error('Erreur génération puce:', err.message)),
      extraireFaits(document.id, pid, contenuTexte, document.nom)
        .catch(err => console.error('Erreur extraction faits:', err.message))
    ])

    // 2. Delta si version précédente (indépendant)
    if (docExistant && docExistant.contenuTexte) {
      comparerVersions(document.id, docExistant.id, contenuTexte, docExistant.contenuTexte, document.nom)
        .catch(err => console.error('Erreur comparaison versions:', err.message))
    }

    // 3. Comparaison vs référence si CCTP ou DPGF (une seule comparaison globale, pas par sous-programme)
    if ((cat === 'cctp' || cat === 'dpgf') && lotDetecte !== 'generalites') {
      const avecCctp = req.body.comparaisonAvec === 'cctp' || req.body.comparaisonAvec === 'les_deux'
      const modele = modeleIA === 'sonnet' ? 'sonnet' : 'haiku'
      comparerAvecReference(document.id, pid, contenuTexte, document.nom, cat, avecCctp, null, modele, lotDetecte)
        .catch(err => console.error('Erreur comparaison documents:', err.message))
    }
  }
  backgroundTasks()  // sans await — non-bloquant

  res.status(201).json(document)
})

// POST /documents/:id/comparer — relancer la comparaison sans re-uploader
router.post('/:id/comparer', async (req, res) => {
  const docId = parseInt(req.params.id)
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, projetId: true, sousProgrammeId: true, lotType: true }
  })
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' })
  if (!doc.contenuTexte) return res.status(400).json({ error: 'Texte non extrait pour ce document' })
  if (doc.categorieDoc !== 'cctp' && doc.categorieDoc !== 'dpgf') {
    return res.status(400).json({ error: 'Comparaison disponible uniquement pour CCTP et DPGF' })
  }

  const comparaisonAvec = req.body.comparaisonAvec || 'programme'
  const avecCctp = comparaisonAvec === 'cctp' || comparaisonAvec === 'les_deux'
  const modele = req.body.modeleIA === 'sonnet' ? 'sonnet' : 'haiku'
  const lotType = doc.lotType || detecterLot(doc.nom)

  res.json({ message: 'Comparaison lancée' })

  comparerAvecReference(doc.id, doc.projetId, doc.contenuTexte, doc.nom, doc.categorieDoc, avecCctp, null, modele, lotType)
    .catch(err => console.error('Erreur comparaison:', err.message))
})

// GET /documents/:id/texte — retourne le contenu texte extrait
router.get('/:id/texte', async (req, res) => {
  const docId = parseInt(req.params.id)
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, lotType: true, dateDepot: true }
  })
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' })
  res.json({ id: doc.id, nom: doc.nom, categorieDoc: doc.categorieDoc, lotType: doc.lotType, dateDepot: doc.dateDepot, contenuTexte: doc.contenuTexte })
})

// DELETE /documents/:id — supprimer un document (admin only)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Réservé aux administrateurs' })
  }
  const docId = parseInt(req.params.id)
  const doc = await prisma.document.findUnique({ where: { id: docId } })
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' })

  if (req.query.resoudreAlertes === 'true') {
    const liens = await prisma.alerteDocument.findMany({ where: { documentId: docId }, select: { alerteId: true } })
    const alerteIds = liens.map(l => l.alerteId)
    if (alerteIds.length > 0) {
      await prisma.alerte.updateMany({
        where: { id: { in: alerteIds } },
        data: { statut: 'resolue', resoluePar: 'manuelle' }
      })
    }
  }

  // Supprimer toutes les versions du même document (même nom + même projet)
  const toutesVersions = await prisma.document.findMany({
    where: { projetId: doc.projetId, nom: doc.nom }
  })

  for (const v of toutesVersions) {
    const chemin = path.resolve(__dirname, '../../', v.cheminFichier)
    if (v.cheminFichier && fs.existsSync(chemin)) {
      fs.unlinkSync(chemin)
    }
  }

  await prisma.document.deleteMany({ where: { projetId: doc.projetId, nom: doc.nom } })
  res.json({ message: 'Document supprimé' })
})

// GET /documents/:id/faits — faits extraits d'un document
router.get('/:id/faits', async (req, res) => {
  const faits = await prisma.faitDocument.findMany({
    where: { documentId: parseInt(req.params.id) },
    orderBy: [{ categorie: 'asc' }, { sujet: 'asc' }]
  })
  res.json(faits)
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
