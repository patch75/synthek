const express = require('express')
const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { genererCertificat } = require('../services/certificat')
const { questionIA } = require('../services/ia')

const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || './storage')

const router = express.Router()
router.use(authMiddleware)

// GET /projets — liste les projets de l'utilisateur connecté
router.get('/', async (req, res) => {
  const projets = await prisma.projet.findMany({
    where: { membres: { some: { userId: req.user.id } } },
    include: {
      membres: { include: { user: { select: { id: true, nom: true, email: true, role: true } } } },
      _count: { select: { documents: true, alertes: { where: { statut: 'active' } } } }
    }
  })
  res.json(projets)
})

// POST /projets — créer un projet (V3 : champs enrichis + arborescence stockage)
router.post('/', async (req, res) => {
  const {
    nom, client, typeBatiment, nombreNiveaux, shon, energieRetenue,
    zoneClimatique, classementErp, typeErp, nombreLogements, adresse,
    batimentsComposition
  } = req.body

  if (!nom || !client) {
    return res.status(400).json({ error: 'Nom et client requis' })
  }

  // Validations V3
  const typesValides = ['logements_collectifs', 'bureaux', 'erp', 'industrie', 'mixte']
  if (typeBatiment && !typesValides.includes(typeBatiment)) {
    return res.status(400).json({ error: `typeBatiment invalide. Valeurs : ${typesValides.join(', ')}` })
  }

  const energiesValides = ['gaz', 'electricite', 'pac', 'geothermie', 'bois', 'mixte']
  if (energieRetenue && !energiesValides.includes(energieRetenue)) {
    return res.status(400).json({ error: `energieRetenue invalide. Valeurs : ${energiesValides.join(', ')}` })
  }

  const zonesValides = ['H1a', 'H1b', 'H1c', 'H2a', 'H2b', 'H2c', 'H2d', 'H3']
  if (zoneClimatique && !zonesValides.includes(zoneClimatique)) {
    return res.status(400).json({ error: `zoneClimatique invalide. Valeurs : ${zonesValides.join(', ')}` })
  }

  if (classementErp && !typeErp) {
    return res.status(400).json({ error: 'typeErp requis si classementErp est activé' })
  }

  const typesResidentiels = ['logements_collectifs', 'mixte']
  if (typeBatiment && typesResidentiels.includes(typeBatiment) && !nombreLogements) {
    return res.status(400).json({ error: 'nombreLogements requis pour un bâtiment résidentiel' })
  }

  const data = {
    nom,
    client,
    membres: { create: { userId: req.user.id, role: 'admin' } }
  }

  if (typeBatiment) data.typeBatiment = typeBatiment
  if (nombreNiveaux != null) data.nombreNiveaux = parseInt(nombreNiveaux)
  if (shon != null) data.shon = parseFloat(shon)
  if (energieRetenue) data.energieRetenue = energieRetenue
  if (zoneClimatique) data.zoneClimatique = zoneClimatique
  if (classementErp != null) data.classementErp = !!classementErp
  if (typeErp) data.typeErp = typeErp
  if (nombreLogements != null) data.nombreLogements = parseInt(nombreLogements)
  if (adresse) data.adresse = adresse
  if (batimentsComposition) data.batimentsComposition = batimentsComposition

  const projet = await prisma.projet.create({ data })

  // Créer l'arborescence de stockage (Bloc 6)
  const projetDir = path.join(STORAGE_ROOT, 'projets', String(projet.id))
  const sousDossiers = [
    'architecte', 'bet_fluides', 'bet_thermique', 'bet_structure',
    'bet_electricite', 'bet_vrd', 'bet_geotechnique', 'economiste',
    'moa', 'assistant_moa', 'bet_hqe', 'acousticien', 'bureau_controle'
  ]
  fs.mkdirSync(projetDir, { recursive: true })
  for (const d of sousDossiers) {
    fs.mkdirSync(path.join(projetDir, d), { recursive: true })
  }

  // Générer config.json initial
  const configJson = {
    projetId: projet.id,
    nom: projet.nom,
    client: projet.client,
    typeBatiment: projet.typeBatiment || null,
    zoneClimatique: projet.zoneClimatique || null,
    energieRetenue: projet.energieRetenue || null,
    adresse: projet.adresse || null,
    dateCreation: projet.dateCreation
  }
  fs.writeFileSync(path.join(projetDir, 'config.json'), JSON.stringify(configJson, null, 2))

  res.status(201).json(projet)
})

// GET /projets/:id — détail d'un projet
router.get('/:id', async (req, res) => {
  const projet = await prisma.projet.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      membres: { include: { user: { select: { id: true, nom: true, email: true, role: true } } } },
      documents: {
        orderBy: { dateDepot: 'desc' },
        include: {
          user: { select: { nom: true, email: true } },
          puce: true,
          sousProgramme: { select: { id: true, nom: true } }
        }
      },
      alertes: { where: { statut: 'active' }, orderBy: { dateCreation: 'desc' } },
      sousProgrammes: { orderBy: { nom: 'asc' } },
      batiments: { orderBy: { nom: 'asc' } }
    }
  })
  if (!projet) return res.status(404).json({ error: 'Projet non trouvé' })
  res.json(projet)
})

// GET /projets/:id/sous-programmes
router.get('/:id/sous-programmes', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const sps = await prisma.sousProgramme.findMany({ where: { projetId }, orderBy: { position: 'asc' } })
  res.json(sps)
})

// POST /projets/:id/sous-programmes
router.post('/:id/sous-programmes', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { nom, typologies } = req.body
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  const count = await prisma.sousProgramme.count({ where: { projetId } })
  const sp = await prisma.sousProgramme.create({
    data: {
      projetId,
      nom: nom.trim(),
      typologies: typologies?.length ? JSON.stringify(typologies) : null,
      position: count
    }
  })
  res.status(201).json(sp)
})

// PATCH /projets/:id/sous-programmes/ordre — réordonner (DOIT être avant /:spId)
router.patch('/:id/sous-programmes/ordre', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { ordre } = req.body // tableau d'ids dans le nouvel ordre
  if (!Array.isArray(ordre)) return res.status(400).json({ error: 'ordre requis (tableau d\'ids)' })
  await Promise.all(ordre.map((spId, index) =>
    prisma.sousProgramme.update({ where: { id: spId }, data: { position: index } })
  ))
  res.json({ ok: true })
})

// PATCH /projets/:id/sous-programmes/:spId — renommer / mettre à jour typologies
router.patch('/:id/sous-programmes/:spId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { nom, typologies } = req.body
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  const data = { nom: nom.trim() }
  if (typologies !== undefined) data.typologies = typologies?.length ? JSON.stringify(typologies) : null
  const sp = await prisma.sousProgramme.update({ where: { id: parseInt(req.params.spId) }, data })
  res.json(sp)
})

// DELETE /projets/:id/sous-programmes/:spId
router.delete('/:id/sous-programmes/:spId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.sousProgramme.delete({ where: { id: parseInt(req.params.spId) } })
  res.json({ message: 'Sous-programme supprimé' })
})

// PATCH /projets/:id — modifier le projet (admin only)
router.patch('/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { nom, client, metadonnees, batimentsComposition } = req.body

  const data = {}
  if (nom?.trim()) data.nom = nom.trim()
  if (client?.trim()) data.client = client.trim()
  if (metadonnees !== undefined) data.metadonnees = metadonnees ? JSON.stringify(metadonnees) : null
  if (batimentsComposition !== undefined) data.batimentsComposition = batimentsComposition || null

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Aucune donnée à modifier' })

  const projet = await prisma.projet.update({ where: { id: projetId }, data })
  res.json(projet)
})

// PATCH /projets/:id/phase — changer la phase du projet
router.patch('/:id/phase', async (req, res) => {
  const { phase } = req.body
  const phases = ['APS', 'APD', 'PRO', 'DCE', 'EXE']
  if (!phase || !phases.includes(phase)) {
    return res.status(400).json({ error: `Phase invalide. Valeurs acceptées : ${phases.join(', ')}` })
  }

  const projetId = parseInt(req.params.id)

  // Bloquer le passage en EXE s'il y a des alertes actives
  if (phase === 'EXE') {
    const alertesActives = await prisma.alerte.count({ where: { projetId, statut: 'active' } })
    if (alertesActives > 0) {
      await prisma.projet.update({
        where: { id: projetId },
        data: { bloqueExe: true, raisonBlocage: `${alertesActives} alerte(s) non résolue(s)` }
      })
      return res.status(409).json({
        error: `Passage en phase EXE impossible : ${alertesActives} alerte(s) non résolue(s)`,
        bloqueExe: true
      })
    }
  }

  const projet = await prisma.projet.update({
    where: { id: projetId },
    data: { phase, bloqueExe: false, raisonBlocage: null }
  })
  res.json(projet)
})

// GET /projets/:id/config — lire la config projet (Bloc 2 + 6)
router.get('/:id/config', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const config = await prisma.configProjet.findUnique({ where: { projetId } })
  res.json(config || {})
})

// POST /projets/:id/config — créer/mettre à jour la config projet (Bloc 2 + 6)
router.post('/:id/config', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const { promptSystemeGlobal, seuilsTolerance, vocabulaireMetier, valeursReference, conventionNommage } = req.body

  const data = { projetId }
  if (promptSystemeGlobal !== undefined) data.promptSystemeGlobal = promptSystemeGlobal
  if (seuilsTolerance !== undefined) data.seuilsTolerance = seuilsTolerance
  if (vocabulaireMetier !== undefined) data.vocabulaireMetier = vocabulaireMetier
  if (valeursReference !== undefined) data.valeursReference = valeursReference
  if (conventionNommage !== undefined) data.conventionNommage = conventionNommage

  const config = await prisma.configProjet.upsert({
    where: { projetId },
    create: data,
    update: data
  })

  // Synchroniser config.json sur disque
  const projetDir = path.join(STORAGE_ROOT, 'projets', String(projetId))
  if (fs.existsSync(projetDir)) {
    const projet = await prisma.projet.findUnique({ where: { id: projetId } })
    const configJson = {
      projetId,
      nom: projet?.nom,
      client: projet?.client,
      typeBatiment: projet?.typeBatiment || null,
      zoneClimatique: projet?.zoneClimatique || null,
      energieRetenue: projet?.energieRetenue || null,
      adresse: projet?.adresse || null,
      configIA: {
        promptSystemeGlobal: config.promptSystemeGlobal,
        seuilsTolerance: config.seuilsTolerance,
        vocabulaireMetier: config.vocabulaireMetier,
        valeursReference: config.valeursReference,
        conventionNommage: config.conventionNommage
      }
    }
    fs.writeFileSync(path.join(projetDir, 'config.json'), JSON.stringify(configJson, null, 2))
  }

  res.json(config)
})

// DELETE /projets/:id — supprimer un projet (admin global seulement)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Réservé aux administrateurs' })
  }

  const projet = await prisma.projet.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!projet) return res.status(404).json({ error: 'Projet non trouvé' })

  await prisma.projet.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ message: 'Projet supprimé' })
})

// POST /projets/:id/membres — inviter un expert par email
router.post('/:id/membres', async (req, res) => {
  const { email, role } = req.body
  const projetId = parseInt(req.params.id)

  if (!email) return res.status(400).json({ error: 'Email requis' })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return res.status(404).json({ error: 'Aucun compte avec cet email' })

  const existe = await prisma.projetUser.findUnique({
    where: { userId_projetId: { userId: user.id, projetId } }
  })
  if (existe) return res.status(409).json({ error: 'Déjà membre du projet' })

  const membre = await prisma.projetUser.create({
    data: { userId: user.id, projetId, role: role || 'expert' },
    include: { user: { select: { id: true, nom: true, email: true } } }
  })
  res.status(201).json(membre)
})

// POST /projets/:id/certificat — générer un certificat PDF scellé
router.post('/:id/certificat', async (req, res) => {
  const projetId = parseInt(req.params.id)

  const { pdfBuffer, signatureGlobale, dateGeneration } = await genererCertificat(projetId)

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="certificat-projet-${projetId}-${Date.now()}.pdf"`,
    'X-Signature-SHA256': signatureGlobale,
    'X-Date-Generation': dateGeneration.toISOString()
  })
  res.send(pdfBuffer)
})

// POST /projets/:id/rapport-jalon — envoyer rapport + certificat au bureau de contrôle
router.post('/:id/rapport-jalon', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const { jalon } = req.body // 'DCE' ou 'EXE'

  if (!jalon || !['DCE', 'EXE'].includes(jalon)) {
    return res.status(400).json({ error: 'Jalon invalide. Valeurs acceptées : DCE, EXE' })
  }

  const projet = await prisma.projet.findUnique({
    where: { id: projetId },
    include: {
      membres: {
        include: { user: { select: { nom: true, email: true, role: true } } }
      },
      alertes: { where: { statut: 'active' } },
      _count: { select: { documents: true, alertes: true } }
    }
  })
  if (!projet) return res.status(404).json({ error: 'Projet non trouvé' })

  // Trouver les membres bureau_controle
  const bureauControle = projet.membres
    .filter(m => m.user.role === 'bureau_controle')
    .map(m => m.user)

  if (bureauControle.length === 0) {
    return res.status(400).json({ error: 'Aucun membre bureau de contrôle sur ce projet' })
  }

  // Générer le certificat PDF
  const { pdfBuffer, signatureGlobale } = await genererCertificat(projetId)

  // Générer le rapport de synthèse IA
  const rapportIA = await questionIA(
    projetId,
    req.user.id,
    `Génère un rapport de synthèse complet pour le jalon ${jalon} du projet. Résume l'état des documents, les incohérences détectées, et la conformité réglementaire.`
  )

  // Envoi email
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT) || 1025,
    secure: false,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  })

  const destinataires = bureauControle.map(u => u.email).join(', ')

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'synthek@noreply.com',
    to: destinataires,
    subject: `[synthek] Rapport de jalon ${jalon} — Projet "${projet.nom}"`,
    html: `
      <h2>Rapport de jalon ${jalon}</h2>
      <p><strong>Projet :</strong> ${projet.nom}</p>
      <p><strong>Client :</strong> ${projet.client}</p>
      <p><strong>Phase actuelle :</strong> ${projet.phase}</p>
      <p><strong>Documents :</strong> ${projet._count.documents}</p>
      <p><strong>Alertes actives :</strong> ${projet._count.alertes}</p>
      <hr>
      <h3>Synthèse IA</h3>
      <pre style="white-space:pre-wrap">${rapportIA}</pre>
      <hr>
      <p><em>Certificat PDF scellé en pièce jointe (signature SHA-256 : ${signatureGlobale})</em></p>
    `,
    attachments: [{
      filename: `certificat-${jalon}-${projet.nom.replace(/\s+/g, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  })

  res.json({
    message: `Rapport jalon ${jalon} envoyé à ${bureauControle.length} bureau(x) de contrôle`,
    destinataires: bureauControle.map(u => u.email),
    signatureGlobale
  })
})

// POST /projets/:id/granulometrie/proposer — Étape 1 : propose le regroupement depuis fichier Excel
router.post('/:id/granulometrie/proposer', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { fichier, nom_fichier } = req.body
  if (!fichier || !nom_fichier) return res.status(400).json({ error: 'fichier (base64) et nom_fichier requis' })
  try {
    const response = await fetch('http://127.0.0.1:5001/granulometrie/proposer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fichier, nom_fichier })
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (e) {
    res.status(503).json({ error: 'Parser Python indisponible', detail: e.message })
  }
})

// POST /projets/:id/granulometrie/import — Étape 2 : confirme le regroupement et sauvegarde en BDD
router.post('/:id/granulometrie/import', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { fichier, nom_fichier, regroupement } = req.body
  if (!fichier || !nom_fichier || !regroupement) return res.status(400).json({ error: 'fichier, nom_fichier et regroupement requis' })
  try {
    const response = await fetch('http://127.0.0.1:5001/granulometrie/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fichier, nom_fichier, regroupement })
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    // Sauvegarder dans table Batiment — merge : update si existe, create si nouveau
    if (data.batiments?.length) {
      const existants = await prisma.batiment.findMany({ where: { projetId } })
      for (const b of data.batiments) {
        const existant = existants.find(e => e.nom.trim().toLowerCase() === b.nom.trim().toLowerCase())
        const payload = {
          montees: b.montees?.length ? JSON.stringify(b.montees) : null,
          nosComptes: b.nos_comptes?.length ? JSON.stringify(b.nos_comptes) : null,
          nbLogements: b.nb_logements ?? null,
          lli: b.LLI ?? 0,
          lls: b.LLS ?? 0,
          brs: b.BRS ?? 0,
          acceStd: b.acces_std ?? 0,
          accesPremium: b.acces_premium ?? 0,
          villas: b.villas ?? 0,
          fiabilite: b.fiabilite ?? null,
        }
        if (existant) {
          await prisma.batiment.update({ where: { id: existant.id }, data: payload })
        } else {
          await prisma.batiment.create({ data: { projetId, nom: b.nom, ...payload } })
        }
      }
    }
    // Garder batimentsComposition pour compatibilité affichage
    await prisma.projet.update({
      where: { id: projetId },
      data: { batimentsComposition: JSON.stringify(data.batiments) }
    })
    console.log(`[granulometrie] Projet ${projetId} : ${data.batiments?.length} bâtiments importés, ${data.total_logements} logements`)
    res.json(data)
  } catch (e) {
    res.status(503).json({ error: 'Parser Python indisponible', detail: e.message })
  }
})

// POST /projets/:id/batiments — ajouter un bâtiment manuellement
router.post('/:id/batiments', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { nom, montees, nbLogements, lli, lls, brs, acceStd, accesPremium, villas } = req.body
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  const bat = await prisma.batiment.create({
    data: {
      projetId,
      nom: nom.trim(),
      montees: Array.isArray(montees) && montees.length ? JSON.stringify(montees) : null,
      nbLogements: nbLogements != null ? parseInt(nbLogements) : null,
      lli: lli != null ? parseInt(lli) : 0,
      lls: lls != null ? parseInt(lls) : 0,
      brs: brs != null ? parseInt(brs) : 0,
      acceStd: acceStd != null ? parseInt(acceStd) : 0,
      accesPremium: accesPremium != null ? parseInt(accesPremium) : 0,
      villas: villas != null ? parseInt(villas) : 0,
    }
  })
  res.status(201).json(bat)
})

// PATCH /projets/:id/batiments/:batId — mapper section CCTP + feuilles DPGF
router.patch('/:id/batiments/:batId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { sectionCctp, feuillesDpgf, montees, nbLogements, lli, lls, brs, acceStd, accesPremium, villas } = req.body
  const data = {}
  if (sectionCctp !== undefined) data.sectionCctp = sectionCctp || null
  if (feuillesDpgf !== undefined) data.feuillesDpgf = feuillesDpgf?.length ? JSON.stringify(feuillesDpgf) : null
  if (montees !== undefined) data.montees = Array.isArray(montees) && montees.length ? JSON.stringify(montees) : null
  if (nbLogements !== undefined) data.nbLogements = nbLogements !== null ? parseInt(nbLogements) : null
  if (lli !== undefined) data.lli = lli !== null ? parseInt(lli) : null
  if (lls !== undefined) data.lls = lls !== null ? parseInt(lls) : null
  if (brs !== undefined) data.brs = brs !== null ? parseInt(brs) : null
  if (acceStd !== undefined) data.acceStd = acceStd !== null ? parseInt(acceStd) : null
  if (accesPremium !== undefined) data.accesPremium = accesPremium !== null ? parseInt(accesPremium) : null
  if (villas !== undefined) data.villas = villas !== null ? parseInt(villas) : null
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Aucune donnée à modifier' })
  const bat = await prisma.batiment.update({ where: { id: parseInt(req.params.batId) }, data })
  res.json(bat)
})

// DELETE /projets/:id/batiments — supprimer tous les bâtiments (admin only)
router.delete('/:id/batiments', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.batiment.deleteMany({ where: { projetId: parseInt(req.params.id) } })
  res.json({ ok: true })
})

// DELETE /projets/:id/batiments/:batId — supprimer un bâtiment (admin only)
router.delete('/:id/batiments/:batId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.batiment.delete({ where: { id: parseInt(req.params.batId) } })
  res.json({ ok: true })
})

// PATCH /projets/:id/intervenants — mettre à jour les intervenants (admin only)
router.patch('/:id/intervenants', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { intervenants } = req.body
  if (!Array.isArray(intervenants)) return res.status(400).json({ error: 'intervenants doit être un tableau' })
  const projet = await prisma.projet.update({
    where: { id: projetId },
    data: { intervenants: JSON.stringify(intervenants) }
  })
  res.json({ intervenants: JSON.parse(projet.intervenants || '[]') })
})

module.exports = router
