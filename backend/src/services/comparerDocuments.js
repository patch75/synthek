// backend/src/services/comparerDocuments.js
// Comparaison documentaire hybride : analyse JS + interprétation IA spécialisée par lot
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { detecterLot, chargerAgent } = require('./lotDetector')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MOTS_VIDES = new Set([
  'le','la','les','de','du','des','un','une','et','ou','mais','donc','or','ni',
  'car','que','qui','dont','où','à','au','aux','en','par','pour','sur','sous',
  'dans','avec','sans','entre','vers','il','elle','ils','elles','ce','cette',
  'ces','mon','ton','son','ma','ta','sa','notre','votre','leur','leurs','se',
  'si','ne','pas','plus','très','tout','tous','toute','toutes','bien','être',
  'avoir','faire','est','sont','sera','seront','ont','y','lors','selon','ainsi',
  'aussi','comme','même','après','avant','puis','afin','chaque','cas','type',
  'autre','autres','suivant','article','point','page','annexe','partie'
])

const MOTS_EXIGENCE = [
  'doit','devra','devront','doivent','obligatoire','obligatoirement',
  'requis','requise','exigé','exigée','imposé','imposée','nécessaire',
  'minimum','minimal','minimale','maximum','maximal','maximale',
  'interdit','interdite','prohibé','au moins','au minimum','au maximum'
]

function tokeniser(texte) {
  return texte.toLowerCase()
    .replace(/[^\w\sàâäéèêëîïôöùûüçñ]/g, ' ')
    .split(/\s+/)
    .filter(m => m.length >= 4 && !MOTS_VIDES.has(m))
}

function frequences(mots) {
  const freq = {}
  mots.forEach(m => freq[m] = (freq[m] || 0) + 1)
  return freq
}

function extraireExigences(texte) {
  const phrases = texte.split(/[.!?\n]/).map(p => p.trim()).filter(p => p.length > 25)
  return phrases
    .filter(p => MOTS_EXIGENCE.some(mot => p.toLowerCase().includes(mot)))
    .slice(0, 30)
}

/**
 * Extrait la section la plus pertinente d'un CCTP pour un sous-programme donné.
 * Cherche d'abord un titre de chapitre correspondant au nom du sous-programme,
 * puis fallback sur la fenêtre glissante avec le plus de mots en commun avec le programme.
 */
function extraireSectionPertinente(texteDoc, nomSousProgramme, texteRef) {
  if (!texteDoc) return ''
  const TAILLE_FALLBACK = 12000
  const MAX_TAILLE = 25000

  // Normalisation sans accents
  const norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')

  // Chercher un titre de chapitre correspondant au sous-programme
  if (nomSousProgramme) {
    const motsCle = norm(nomSousProgramme).split(/\s+/).filter(m => m.length >= 3)
    const lignes = texteDoc.split('\n')
    let pos = 0
    let meilleurePos = -1
    let meilleurScore = 0
    const posParLigne = []
    let idxMeilleureLigne = -1

    for (let i = 0; i < lignes.length; i++) {
      posParLigne.push(pos)
      const ligneNorm = norm(lignes[i])
      const score = motsCle.filter(m => ligneNorm.includes(m)).length
      if (score > 0 && lignes[i].trim().length < 80 && score >= meilleurScore) {
        meilleurScore = score
        meilleurePos = pos
        idxMeilleureLigne = i
      }
      pos += lignes[i].length + 1
    }

    if (meilleurePos >= 0) {
      // Chercher la fin du chapitre : prochain titre de même niveau (ligne courte commençant par chiffre + point)
      const chapitreRegex = /^\d+\.\s*[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/
      let finSection = texteDoc.length
      for (let i = idxMeilleureLigne + 1; i < lignes.length; i++) {
        const l = lignes[i].trim()
        if (l.length > 0 && l.length < 80 && (chapitreRegex.test(l) || l.toUpperCase().startsWith('ANNEXE'))) {
          finSection = posParLigne[i]
          break
        }
      }
      const section = texteDoc.substring(meilleurePos, finSection)
      console.log(`[comparerDocuments] Section "${nomSousProgramme}" extraite: ${section.length} chars`)
      return section.length <= MAX_TAILLE ? section : section.substring(0, MAX_TAILLE)
    }
  }

  // Fallback : collecter les blocs les plus pertinents de tout le CCTP
  // Découper par titres de sections, scorer chaque bloc, prendre les meilleurs
  const lignes = texteDoc.split('\n')
  const motsCle = nomSousProgramme
    ? norm(nomSousProgramme).split(/\s+/).filter(m => m.length >= 3)
    : []
  const motsRef = texteRef
    ? new Set(tokeniser(texteRef).filter(m => m.length >= 5).slice(0, 80))
    : new Set()

  const blocs = []
  let blocLignes = []
  let blocScore = 0

  const finaliserBloc = () => {
    if (blocLignes.length > 0) blocs.push({ texte: blocLignes.join('\n'), score: blocScore })
    blocLignes = []
    blocScore = 0
  }

  for (const ligne of lignes) {
    const trim = ligne.trim()
    const isTitre = trim.length > 0 && trim.length < 80
    if (isTitre && blocLignes.length > 2) finaliserBloc()
    blocLignes.push(ligne)
    const ligneNorm = norm(ligne)
    const scoreMotsCle = motsCle.filter(m => ligneNorm.includes(m)).length * 3
    const scoreMots = tokeniser(ligne).filter(m => motsRef.has(m)).length
    blocScore += scoreMotsCle + scoreMots
  }
  finaliserBloc()

  // Prendre les blocs les plus pertinents jusqu'à MAX_TAILLE
  const blocsTriés = blocs.filter(b => b.score > 0).sort((a, b) => b.score - a.score)
  let extraction = ''
  for (const bloc of blocsTriés) {
    if (extraction.length + bloc.texte.length > MAX_TAILLE) break
    extraction += bloc.texte + '\n\n'
  }

  if (extraction.length > 100) {
    console.log(`[comparerDocuments] Fallback blocs: ${blocsTriés.length} blocs pertinents, ${extraction.length} chars extraits`)
    return extraction
  }

  return texteDoc.substring(0, TAILLE_FALLBACK)
}

/**
 * Analyse JS des écarts entre le texte d'un document et un document de référence
 */
function analyserEcarts(texteDoc, texteRef, nomDoc, nomRef) {
  const motsDoc = new Set(tokeniser(texteDoc))
  const freqRef = frequences(tokeniser(texteRef))

  // Termes importants de la référence (freq >= 2) absents du doc
  const termesManquants = Object.entries(freqRef)
    .filter(([terme, freq]) => freq >= 2 && terme.length >= 5 && !motsDoc.has(terme))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([terme]) => terme)

  // Exigences de la référence potentiellement non couvertes dans le doc
  const exigences = extraireExigences(texteRef)
  const exigencesNonCouvertes = exigences.filter(exigence => {
    const mots = new Set(tokeniser(exigence))
    const couverts = [...mots].filter(m => motsDoc.has(m)).length
    return mots.size > 3 && (couverts / mots.size) < 0.35
  }).slice(0, 8)

  // Taux de couverture global (termes ref présents dans doc)
  const termesPropresRef = Object.keys(freqRef).filter(t => t.length >= 5)
  const communs = termesPropresRef.filter(t => motsDoc.has(t)).length
  const couverture = termesPropresRef.length > 0
    ? Math.round((communs / termesPropresRef.length) * 100)
    : 100

  return { termesManquants, exigencesNonCouvertes, couverture, nomDoc, nomRef }
}

/**
 * Compare un document uploadé (CCTP ou DPGF) avec les références du projet.
 * Catégorie cctp → compare vs programmes uniquement
 * Catégorie dpgf → compare vs programmes + optionnellement CCTPs
 * Crée des alertes en BDD si des incohérences réelles sont détectées.
 */
async function comparerAvecReference(documentId, projetId, texteDoc, nomDoc, categorieDoc, avecCctp = false, sousProgrammeId = null, modeleIA = 'haiku', lotType = null) {
  if (!texteDoc || texteDoc.trim().length < 200) return []

  // Détecter le lot si non fourni, et charger l'agent spécialisé
  const lotDetecte = lotType || detecterLot(nomDoc)
  const agent = chargerAgent(lotDetecte)
  console.log(`[comparerDocuments] Agent chargé: ${lotDetecte || 'generique'} pour "${nomDoc}"`)

  const categoriesRef = ['programme']
  if (avecCctp) categoriesRef.push('cctp')

  // Récupérer le nom du sous-programme + contexte projet
  let nomSousProgramme = null
  if (sousProgrammeId) {
    const sp = await prisma.sousProgramme.findUnique({ where: { id: sousProgrammeId }, select: { nom: true } })
    nomSousProgramme = sp?.nom || null
  }

  const [projet, configProjet] = await Promise.all([
    prisma.projet.findUnique({
      where: { id: projetId },
      select: {
        nom: true, client: true, typeBatiment: true, energieRetenue: true,
        zoneClimatique: true, nombreLogements: true,
        sousProgrammes: { select: { nom: true } }
      }
    }),
    prisma.configProjet.findUnique({
      where: { projetId },
      select: { promptSystemeGlobal: true, vocabulaireMetier: true }
    })
  ])

  const whereRef = {
    projetId,
    id: { not: documentId },
    categorieDoc: { in: categoriesRef },
    contenuTexte: { not: null }
  }

  if (sousProgrammeId) {
    whereRef.sousProgrammeId = sousProgrammeId
  }

  let docsRef = await prisma.document.findMany({
    where: whereRef,
    select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, lotType: true }
  })

  // Si on compare un DPGF vs CCTPs et qu'un lotType est détecté → filtrer par même lot
  if (avecCctp && lotType && categoriesRef.includes('cctp')) {
    const cctpsMemeLog = docsRef.filter(d => d.categorieDoc === 'cctp' && d.lotType === lotType)
    const programmes = docsRef.filter(d => d.categorieDoc === 'programme')
    // Garder les programmes + uniquement les CCTPs du même lot
    docsRef = [...programmes, ...cctpsMemeLog]
    if (cctpsMemeLog.length > 0) {
      console.log(`[comparerDocuments] Filtre lot "${lotType}" : ${cctpsMemeLog.length} CCTP(s) retenu(s)`)
    } else {
      console.log(`[comparerDocuments] Aucun CCTP avec lotType "${lotType}" — comparaison sans CCTP`)
    }
  }

  if (docsRef.length === 0) {
    console.log(`[comparerDocuments] Aucun doc de référence (${categoriesRef.join('/')}) dans le projet ${projetId}`)
    return []
  }

  // Récupérer le CCTP Généralités (Lot 00) s'il existe dans le projet
  const cctpGeneralDoc = await prisma.document.findFirst({
    where: { projetId, categorieDoc: 'cctp', lotType: 'generalites', contenuTexte: { not: null } },
    select: { nom: true, contenuTexte: true }
  })
  const cctpGeneralTexte = cctpGeneralDoc?.contenuTexte
    ? cctpGeneralDoc.contenuTexte.substring(0, 6000)
    : null

  // Analyse JS pour chaque document de référence
  const resultats = docsRef
    .filter(ref => ref.contenuTexte && ref.contenuTexte.length > 100)
    .map(ref => ({
      refId: ref.id,
      refNom: ref.nom,
      analyse: analyserEcarts(texteDoc, ref.contenuTexte, nomDoc, ref.nom)
    }))

  // Vérifier s'il y a des écarts significatifs (sinon pas d'appel IA)
  const aDesEcarts = resultats.some(r =>
    r.analyse.termesManquants.length > 3 || r.analyse.exigencesNonCouvertes.length > 0
  )

  if (!aDesEcarts) {
    console.log(`[comparerDocuments] Bonne couverture pour doc ${documentId} — aucun écart significatif`)
    return []
  }

  // Résumé des écarts + extraits des deux côtés pour que Haiku puisse juger
  const resumeEcarts = resultats.map(r => {
    const a = r.analyse
    const ref = docsRef.find(d => d.nom === a.nomRef)
    const lignes = [`== ${nomDoc} vs ${a.nomRef} (couverture ${a.couverture}%) ==`]
    if (a.termesManquants.length > 0) {
      lignes.push(`Termes du programme absents du document : ${a.termesManquants.slice(0, 12).join(', ')}`)
    }
    if (a.exigencesNonCouvertes.length > 0) {
      lignes.push(`Exigences potentiellement non couvertes :`)
      a.exigencesNonCouvertes.forEach(e => lignes.push(`  • ${e.substring(0, 120)}`))
    }
    if (ref?.contenuTexte) {
      lignes.push(`\nExtrait du programme de référence (${a.nomRef}) :`)
      lignes.push(ref.contenuTexte.substring(0, 10000))
    }
    return lignes.join('\n')
  }).join('\n\n---\n\n')

  // Extraire la section pertinente du CCTP selon le sous-programme
  const premiereRef = docsRef[0]
  const sectionCctp = extraireSectionPertinente(texteDoc, nomSousProgramme, premiereRef?.contenuTexte)
  const labelSection = nomSousProgramme ? ` — section "${nomSousProgramme}"` : ''

  // Construire le contexte projet pour le prompt
  const typologiesList = projet?.sousProgrammes?.length
    ? `Typologies du projet : ${projet.sousProgrammes.map(s => s.nom).join(', ')}.`
    : ''
  const contextProjet = [
    projet?.nom ? `Projet : ${projet.nom} (${projet.client || ''})` : '',
    projet?.typeBatiment ? `Type de bâtiment : ${projet.typeBatiment}` : '',
    projet?.nombreLogements ? `${projet.nombreLogements} logements` : '',
    projet?.energieRetenue ? `Énergie retenue : ${projet.energieRetenue}` : '',
    projet?.zoneClimatique ? `Zone climatique : ${projet.zoneClimatique}` : '',
    typologiesList
  ].filter(Boolean).join(' | ')

  const contextSousProgramme = nomSousProgramme
    ? `\nPérimètre analysé : "${nomSousProgramme}" — tu analyses UNIQUEMENT la section du CCTP correspondant à ce périmètre.`
    : ''

  const promptConfig = configProjet?.promptSystemeGlobal
    ? `\nConsignes spécifiques du projet : ${configProjet.promptSystemeGlobal}`
    : ''

  const vocabMetier = configProjet?.vocabulaireMetier
    ? `\nVocabulaire métier accepté comme équivalent : ${JSON.stringify(configProjet.vocabulaireMetier)}`
    : ''

  // Appel IA pour filtrer les vrais problèmes parmi les écarts détectés
  try {
    const reglesAgent = agent.reglesMetier?.length
      ? `\nPOINTS DE CONTRÔLE SPÉCIFIQUES À CE LOT\n${agent.reglesMetier.map(r => `- ${r}`).join('\n')}`
      : ''

    const contextGeneralites = cctpGeneralTexte
      ? `\nPRESCRIPTIONS GÉNÉRALES APPLICABLES À TOUS LES LOTS (Lot 00)\nCes prescriptions s'appliquent en complément des exigences du programme :\n${cctpGeneralTexte}`
      : ''

    const prompt = `${agent.systemPrompt}

CONTEXTE DU PROJET
${contextProjet}${contextSousProgramme}${promptConfig}${vocabMetier}${reglesAgent}${contextGeneralites}

ÉCARTS DÉTECTÉS PAR L'ANALYSE AUTOMATIQUE
${resumeEcarts}

SECTION DU ${categorieDoc.toUpperCase()} ANALYSÉE${labelSection ? ` (${labelSection})` : ''}
${sectionCctp}

MISSION
En croisant les extraits du programme et du ${categorieDoc.toUpperCase()} ci-dessus, identifie UNIQUEMENT les incohérences techniques réelles et significatives.
Ignore : synonymes acceptables, reformulations équivalentes, détails d'exécution non prescrits au programme, différences sans impact technique.
Pour chaque alerte, cite précisément les éléments contradictoires des deux documents.

Réponds UNIQUEMENT en JSON :
{
  "alertes": [
    {
      "message": "Description précise de l'incohérence, en citant les deux documents"
    }
  ]
}

Maximum 5 alertes. Si aucun problème réel : { "alertes": [] }`

    const model = modeleIA === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })

    const rawText = response.content[0].text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(rawText)

    if (!parsed.alertes?.length) {
      console.log(`[comparerDocuments] IA : aucun problème réel détecté pour doc ${documentId}`)
      return []
    }

    // Créer les alertes en BDD
    const refIds = docsRef.map(r => r.id)
    const uniqueDocIds = [...new Set([documentId, ...refIds])]
    const labelType = categorieDoc === 'cctp' ? 'CCTP vs Programme' : `DPGF vs ${avecCctp ? 'Programme+CCTP' : 'Programme'}`

    const labelComplet = nomSousProgramme ? `[${labelType} — ${nomSousProgramme}]` : `[${labelType}]`

    // Supprimer les anciennes alertes du même type pour ce document avant d'en créer de nouvelles
    const alertesLiees = await prisma.alerteDocument.findMany({
      where: { documentId },
      select: { alerteId: true }
    })
    if (alertesLiees.length > 0) {
      const alerteIds = alertesLiees.map(a => a.alerteId)
      await prisma.alerte.deleteMany({
        where: { id: { in: alerteIds }, message: { startsWith: labelComplet } }
      })
    }

    const alertesCreees = []
    for (const alerte of parsed.alertes) {
      const nouvelleAlerte = await prisma.alerte.create({
        data: {
          projetId,
          message: `${labelComplet} ${alerte.message}`,
          documents: {
            create: uniqueDocIds.map(id => ({ documentId: id }))
          }
        }
      })
      alertesCreees.push(nouvelleAlerte)
    }

    console.log(`[comparerDocuments] ${alertesCreees.length} alertes créées pour doc ${documentId} (${nomDoc})`)
    return alertesCreees
  } catch (err) {
    console.error(`[comparerDocuments] Erreur IA:`, err.message)
    return []
  }
}

module.exports = { comparerAvecReference }
