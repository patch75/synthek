// backend/src/services/comparerDocuments.js
// Comparaison documentaire hybride : analyse JS + interprétation Haiku
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')

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
  const TAILLE = 12000

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

    for (const ligne of lignes) {
      const ligneNorm = norm(ligne)
      const score = motsCle.filter(m => ligneNorm.includes(m)).length
      // Favoriser les lignes courtes (titres) avec bonne correspondance
      if (score > 0 && ligne.trim().length < 80 && score >= meilleurScore) {
        meilleurScore = score
        meilleurePos = pos
      }
      pos += ligne.length + 1
    }

    if (meilleurePos >= 0) {
      console.log(`[comparerDocuments] Section trouvée pour "${nomSousProgramme}" à pos ${meilleurePos}`)
      return texteDoc.substring(meilleurePos, meilleurePos + TAILLE)
    }
  }

  // Fallback : fenêtre glissante avec meilleure densité de mots du programme
  if (texteRef && texteRef.length > 100) {
    const motsRef = new Set(tokeniser(texteRef).filter(m => m.length >= 5).slice(0, 50))
    const step = 500
    let meilleurExtrait = texteDoc.substring(0, TAILLE)
    let maxScore = 0

    for (let i = 0; i < texteDoc.length - TAILLE; i += step) {
      const extrait = texteDoc.substring(i, i + TAILLE)
      const score = tokeniser(extrait).filter(m => motsRef.has(m)).length
      if (score > maxScore) {
        maxScore = score
        meilleurExtrait = extrait
      }
    }
    return meilleurExtrait
  }

  return texteDoc.substring(0, TAILLE)
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
async function comparerAvecReference(documentId, projetId, texteDoc, nomDoc, categorieDoc, avecCctp = false, sousProgrammeId = null) {
  if (!texteDoc || texteDoc.trim().length < 200) return []

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

  // Si un sous-programme est défini, on ne compare qu'avec les docs du même sous-programme
  if (sousProgrammeId) {
    whereRef.sousProgrammeId = sousProgrammeId
  }

  const docsRef = await prisma.document.findMany({
    where: whereRef,
    select: { id: true, nom: true, contenuTexte: true, categorieDoc: true }
  })

  if (docsRef.length === 0) {
    console.log(`[comparerDocuments] Aucun doc de référence (${categoriesRef.join('/')}) dans le projet ${projetId}`)
    return []
  }

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
      lignes.push(ref.contenuTexte.substring(0, 2000))
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

  // Appel Haiku pour filtrer les vrais problèmes parmi les écarts détectés
  try {
    const prompt = `Tu es un ingénieur BET thermique et fluides senior, expert en analyse de documents de construction (programmes MOA, CCTP, DPGF).

CONTEXTE DU PROJET
${contextProjet}${contextSousProgramme}${promptConfig}${vocabMetier}

RÈGLES MÉTIER À APPLIQUER
- Les attiques (derniers niveaux en retrait) ont souvent une solution technique différente des niveaux courants : PAC air/eau plutôt que chaudière gaz, plancher chauffant basse température, etc. C'est normal et ne constitue pas une incohérence si le programme le prévoit.
- RE2020 : vérifier la cohérence des solutions énergétiques (PAC, chaudière, plancher chauffant, radiateurs, VMC simple/double flux hygroréglable).
- La VMC simple flux hygroréglable est compatible RE2020 pour le résidentiel collectif.
- Un programme peut omettre certains détails techniques (canalisations, raccords) qui relèvent de l'entreprise — ce ne sont pas des incohérences.
- Se concentrer sur les écarts qui ont un impact réel : système de chauffage différent, énergie différente, prestations manquantes ou contradictoires, performances non conformes.

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

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
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

    const alertesCreees = []
    for (const alerte of parsed.alertes) {
      const nouvelleAlerte = await prisma.alerte.create({
        data: {
          projetId,
          message: `[${labelType}] ${alerte.message}`,
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
