// backend/src/services/comparerDocuments.js
// Comparaison documentaire hybride : analyse JS + interprétation IA spécialisée par lot
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { detecterLot, chargerAgent } = require('./lotDetector')

// Prompt système enrichi BET Fluides senior (Synthèse C)
const SYSTEM_PROMPT_BET_FLUIDES = `Tu es un ingénieur BET Fluides (plomberie, CVC, désenfumage) senior avec 15 ans d'expérience en maîtrise d'œuvre de logements collectifs, ERP et bureaux.

PRATIQUES RÉDACTIONNELLES CCTP/DPGF
- Les chapitres "Généralités" ou "Prescriptions générales" décrivent des conditions administratives et d'exécution — ils ne contiennent pas d'assertions techniques précises. Ne créer aucune alerte sur la base de ces chapitres.
- Un DPGF est un document de chiffrage : les désignations y sont souvent abrégées ou reformulées pour des raisons de présentation. Une désignation courte n'est pas une incohérence technique.
- Le CCTP s'exprime par lot (plomberie, CVC, électricité...). Les prescriptions d'un lot ne s'appliquent pas forcément aux autres.

ARCHITECTURES TECHNIQUES RECONNUES (comportements normaux)
- Les attiques et derniers niveaux en retrait ont souvent une solution PAC air/eau + plancher chauffant BT, différente des niveaux courants (chaudière collective) — c'est délibéré.
- VMC double flux collective ou individuelle (VMC DF) est compatible RE2020 pour tous types de logements.
- MTA = Module Thermique d'Appartement (production ECS + chauffage depuis réseau collectif).
- PAC air/eau, PAC géothermique, chaudière granulés, chaudière gaz condensation sont des solutions distinctes non interchangeables — signaler uniquement si le programme impose explicitement l'une et le CCTP propose l'autre.

DICTIONNAIRE D'ÉQUIVALENCES SÉMANTIQUES (ne pas créer d'alerte pour ces synonymes)
- "PAC air/eau" = "pompe à chaleur aérothermique" = "pompe à chaleur air/eau" = "PAC aérothermique"
- "VMC DF" = "VMC double flux" = "ventilation double flux" = "ventilation mécanique double flux"
- "ECS" = "eau chaude sanitaire" = "production d'eau chaude sanitaire"
- "plancher chauffant" = "PC BT" = "plancher chauffant basse température" = "RAD plancher"
- "désenfumage naturel" = "DN" = "désenfumage par tirage naturel"
- "surpresseur incendie" = "groupe de surpression incendie" = "pompe incendie"
- "colonne sèche" = "colonne de mise en pression" = "colonne d'incendie"
- "nourrice" = "collecteur de distribution" = "manifold"
- "groupe de sécurité" = "GS" = "soupape de sécurité + clapet de retenue + robinet d'isolement"

RÈGLES ABSOLUES
1. Si le CCTP ou DPGF contient "sans objet", "N/A", "non applicable" pour un poste → NE PAS créer d'alerte pour ce poste.
2. Si une désignation dit "conforme au CCTP", "selon CCTP", "cf. CCTP" → créer une alerte de statut INCERTAIN_DESIGNATION uniquement si c'est un poste critique de sécurité.
3. Ne pas alerter sur des différences de quantités globales (nombre de logements, surfaces) entre programme et CCTP/DPGF — ces données évoluent légitimement.
4. Ne pas alerter sur des détails d'exécution vraiment mineurs non prescrits au programme (types de raccords, visserie, consommables). En revanche, alerter si un diamètre nominal (DN, Ø) nommé explicitement dans le CCTP diffère dans le DPGF.
5. Maximum 8 alertes, priorisées par gravité.

CHECKLIST DE VÉRIFICATION SYSTÉMATIQUE
Parcours le DPGF ligne par ligne et vérifie spécifiquement :
a) POSTES À ZÉRO : tout poste avec quantité 0 ou vide dans le DPGF alors que le CCTP le prescrit explicitement → EXIGENCE_MANQUANTE
b) ACCESSOIRES PRESCRITS : antitartre, manchettes souples (aspiration + refoulement = 2 par caisson), filtres, clapets coupe-feu, siphons de sol, vannes d'équilibrage — si le CCTP les prescrit et qu'ils sont absents du DPGF → EXIGENCE_MANQUANTE
c) DIAMÈTRES : si le CCTP cite un DN ou Ø et que le DPGF cite un diamètre différent → SOUS_DIMENSIONNEMENT ou ÉCART_MATÉRIAU
d) ÉQUIPEMENTS NON JUSTIFIÉS : équipement présent dans le DPGF non mentionné dans le CCTP (doublon, erreur de lot) → INCOHÉRENCE_TECHNIQUE
e) INCOHÉRENCES INTERNES DPGF : même poste avec des quantités différentes selon les sections/colonnes du DPGF → INCOHÉRENCE_TECHNIQUE

STATUTS D'ALERTE DISPONIBLES
- ÉCART_MATÉRIAU : matériau ou équipement différent de ce qui est prescrit
- EXIGENCE_MANQUANTE : une exigence du programme n'est pas couverte dans le document
- INCOHÉRENCE_TECHNIQUE : contradiction technique entre deux documents
- INCERTAIN_DESIGNATION : désignation imprécise (uniquement pour postes critiques sécurité)
- SOUS_DIMENSIONNEMENT : valeur inférieure à la valeur minimale prescrite

CRITICITÉ
- CRITIQUE : impact sécurité, non-conformité réglementaire, ou écart de système complet (ex: PAC vs chaudière gaz)
- MAJEUR : prestation importante manquante ou contradictoire, impact sur performances RE2020, diamètre incorrect sur réseau principal
- MINEUR : accessoire prescrit absent, désignation imprécise non critique, manchette ou petit équipement manquant`

// Prompt quantités — vérification de la cohérence des quantités du DPGF
const SYSTEM_PROMPT_CHIFFRAGE = `Tu es un économiste de la construction senior avec 15 ans d'expérience en vérification de DPGF pour des opérations de logements collectifs, ERP et bureaux.

TON RÔLE
Vérifier la cohérence des quantités d'un DPGF en le croisant avec le CCTP de référence.
Tu n'analyses PAS les désignations techniques ni les prix (ils sont renseignés par les entreprises, pas par le maître d'œuvre) — tu te concentres UNIQUEMENT sur les quantités et les omissions de postes.

RÈGLES DE BASE
1. "Sans objet", "N/A", "non applicable" → NE PAS créer d'alerte pour ce poste.
2. Ne jamais alerter sur les prix unitaires.
3. Ne pas alerter sur les variations de quantités globales liées à l'évolution normale du programme.
4. Une quantité est acceptable si elle est cohérente avec le nombre de logements/bâtiments du projet.

CHECKLIST DE VÉRIFICATION DES QUANTITÉS
a) POSTES MANQUANTS : poste prescrit dans le CCTP avec quantité = 0 ou ligne absente du DPGF → EXIGENCE_MANQUANTE
b) INCOHÉRENCES ENTRE BÂTIMENTS : même équipement avec des quantités très différentes entre bâtiments de gabarit similaire sans justification (ex: 3 VMC pour Bat A, 1 VMC pour Bat B de même taille) → INCOHÉRENCE_TECHNIQUE
c) DOUBLONS : même prestation comptée plusieurs fois dans des lignes distinctes du même lot → INCOHÉRENCE_TECHNIQUE
d) QUANTITÉS ABERRANTES : quantité manifestement incohérente avec le contexte projet (ex: 1 VMC pour 50 logements, 0 robinet pour une installation hydraulique complète) → SOUS_DIMENSIONNEMENT

STATUTS D'ALERTE
- EXIGENCE_MANQUANTE : poste du CCTP absent ou à quantité 0 dans le DPGF
- INCOHÉRENCE_TECHNIQUE : incohérence de quantités entre bâtiments ou doublon
- SOUS_DIMENSIONNEMENT : quantité manifestement insuffisante au regard du contexte projet

CRITICITÉ
- CRITIQUE : équipement principal entièrement absent ou à quantité 0
- MAJEUR : incohérence de quantité significative entre bâtiments de même gabarit
- MINEUR : doublon mineur, petit accessoire manquant, écart de quantité marginal`

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
 * Découpe un texte en chunks de taille fixe avec chevauchement.
 * Coupe de préférence aux sauts de ligne pour ne pas couper une phrase.
 */
function chunkerTexte(texte, tailleChunk = 6000, overlap = 500) {
  const chunks = []
  let debut = 0
  while (debut < texte.length) {
    const finBrute = Math.min(debut + tailleChunk, texte.length)
    // Couper au dernier saut de ligne dans la zone finale (évite de couper une phrase)
    let fin = finBrute
    if (finBrute < texte.length) {
      const nl = texte.lastIndexOf('\n', finBrute)
      if (nl > debut + tailleChunk * 0.6) fin = nl
    }
    const chunk = texte.substring(debut, fin).trim()
    if (chunk.length > 200) chunks.push(chunk)
    debut = fin - overlap
    if (debut >= texte.length - 100) break
  }
  return chunks
}

/**
 * Découpe un texte produit par le parser Python en feuilles distinctes.
 * Exploite les séparateurs "=== Feuille: NOM ===" générés par le microservice Python.
 * Retourne [{nom, texte}], en excluant les feuilles RECAP.
 */
function splitParFeuilles(texteDoc) {
  const regex = /=== Feuille: (.+?) ===/g
  const positions = []
  let match
  while ((match = regex.exec(texteDoc)) !== null) {
    positions.push({ nom: match[1].trim(), debut: match.index + match[0].length })
  }
  if (positions.length === 0) return []

  const feuilles = []
  for (let i = 0; i < positions.length; i++) {
    const fin = i + 1 < positions.length ? positions[i + 1].debut - positions[i + 1].nom.length - 20 : texteDoc.length
    const texte = texteDoc.substring(positions[i].debut, fin).trim()
    if (texte.length > 200 && !/(recap|récap)/i.test(positions[i].nom)) {
      feuilles.push({ nom: positions[i].nom, texte })
    }
  }
  return feuilles
}

/**
 * Compare un document uploadé (CCTP ou DPGF) avec les références du projet.
 * Catégorie cctp → compare vs programmes uniquement
 * Catégorie dpgf → compare vs programmes + optionnellement CCTPs
 * Crée des alertes en BDD si des incohérences réelles sont détectées.
 * Pour les DPGF multi-feuilles : une passe Claude par feuille Excel.
 */
async function comparerAvecReference(documentId, projetId, texteDoc, nomDoc, categorieDoc, avecCctp = false, sousProgrammeId = null, modeleIA = 'haiku', lotType = null, idsRef = null, modeVerification = 'technique') {
  if (!texteDoc || texteDoc.trim().length < 200) return []

  // Détecter le lot si non fourni, et charger l'agent spécialisé
  const lotDetecte = lotType || detecterLot(nomDoc)
  const agent = chargerAgent(lotDetecte)
  console.log(`[comparerDocuments] Agent chargé: ${lotDetecte || 'generique'} pour "${nomDoc}"`)

  // Récupérer le nom du sous-programme + contexte projet
  let nomSousProgramme = null
  if (sousProgrammeId) {
    const sp = await prisma.sousProgramme.findUnique({ where: { id: sousProgrammeId }, select: { nom: true } })
    nomSousProgramme = sp?.nom || null
  }

  const [projet, configProjet, vocabGlobal] = await Promise.all([
    prisma.projet.findUnique({
      where: { id: projetId },
      select: {
        nom: true, client: true, typeBatiment: true, energieRetenue: true,
        zoneClimatique: true, nombreLogements: true, batimentsComposition: true,
        sousProgrammes: { select: { nom: true } }
      }
    }),
    prisma.configProjet.findUnique({
      where: { projetId },
      select: { promptSystemeGlobal: true, vocabulaireMetier: true }
    }),
    prisma.vocabulaireGlobal.findMany({ orderBy: { terme: 'asc' } })
  ])

  let docsRef

  if (idsRef && idsRef.length > 0) {
    // Sélection manuelle : on charge exactement les documents demandés
    docsRef = await prisma.document.findMany({
      where: { id: { in: idsRef }, contenuTexte: { not: null } },
      select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, lotType: true }
    })
    console.log(`[comparerDocuments] Sélection manuelle : ${docsRef.length} doc(s) de référence`)
  } else {
    // Sélection automatique par catégorie (comportement historique)
    const categoriesRef = ['programme']
    if (avecCctp) categoriesRef.push('cctp')

    const whereRef = {
      projetId,
      id: { not: documentId },
      categorieDoc: { in: categoriesRef },
      contenuTexte: { not: null }
    }

    if (sousProgrammeId) {
      whereRef.sousProgrammeId = sousProgrammeId
    }

    docsRef = await prisma.document.findMany({
      where: whereRef,
      select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, lotType: true }
    })

    // Si on compare un DPGF vs CCTPs et qu'un lotType est détecté → filtrer par même lot
    if (avecCctp && lotType && categoriesRef.includes('cctp')) {
      const cctpsMemeLog = docsRef.filter(d => d.categorieDoc === 'cctp' && d.lotType === lotType)
      const programmes = docsRef.filter(d => d.categorieDoc === 'programme')
      docsRef = [...programmes, ...cctpsMemeLog]
      if (cctpsMemeLog.length > 0) {
        console.log(`[comparerDocuments] Filtre lot "${lotType}" : ${cctpsMemeLog.length} CCTP(s) retenu(s)`)
      } else {
        console.log(`[comparerDocuments] Aucun CCTP avec lotType "${lotType}" — comparaison sans CCTP`)
      }
    }
  }

  if (docsRef.length === 0) {
    console.log(`[comparerDocuments] Aucun doc de référence dans le projet ${projetId}`)
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

  const premiereRef = docsRef[0]

  // Construire le contexte projet (partagé entre toutes les sections)
  let compositionBatiments = ''
  if (projet?.batimentsComposition) {
    try {
      const bats = JSON.parse(projet.batimentsComposition)
      if (bats?.length) {
        compositionBatiments = `Composition des bâtiments du projet :\n` +
          bats.map(b => `  - ${b.nom} : ${b.typologies?.join(', ') || '—'}`).join('\n') +
          `\nIMPORTANT : le CCTP doit traiter chaque bâtiment/typologie distinctement (exigences spécifiques par financement).`
      }
    } catch (e) { /* JSON invalide, on ignore */ }
  } else if (projet?.sousProgrammes?.length) {
    compositionBatiments = `Périmètres du projet : ${projet.sousProgrammes.map(s => s.nom).join(', ')}.`
  }

  const contextProjet = [
    projet?.nom ? `Projet : ${projet.nom} (${projet.client || ''})` : '',
    projet?.typeBatiment ? `Type de bâtiment : ${projet.typeBatiment}` : '',
    projet?.nombreLogements ? `${projet.nombreLogements} logements` : '',
    projet?.energieRetenue ? `Énergie retenue : ${projet.energieRetenue}` : '',
    projet?.zoneClimatique ? `Zone climatique : ${projet.zoneClimatique}` : '',
    compositionBatiments
  ].filter(Boolean).join('\n')

  const promptConfig = configProjet?.promptSystemeGlobal
    ? `\nConsignes spécifiques du projet : ${configProjet.promptSystemeGlobal}`
    : ''

  const vocabProjet = configProjet?.vocabulaireMetier
    ? Object.entries(configProjet.vocabulaireMetier).map(([t, d]) => `  ${t} → ${d}`).join('\n')
    : ''
  const vocabGlobalStr = vocabGlobal?.length
    ? vocabGlobal.map(v => `  ${v.terme} → ${v.definition}`).join('\n')
    : ''
  const vocabMetier = (vocabGlobalStr || vocabProjet)
    ? `\nVOCABULAIRE MÉTIER (abréviations et équivalences à connaître) :\n${vocabGlobalStr}${vocabProjet ? '\nSpécifique au projet :\n' + vocabProjet : ''}`
    : ''

  const reglesAgent = agent.reglesMetier?.length
    ? `\nPOINTS DE CONTRÔLE SPÉCIFIQUES À CE LOT\n${agent.reglesMetier.map(r => `- ${r}`).join('\n')}`
    : ''

  const contextGeneralites = cctpGeneralTexte
    ? `\nPRESCRIPTIONS GÉNÉRALES APPLICABLES À TOUS LES LOTS (Lot 00)\nCes prescriptions s'appliquent en complément des exigences du programme :\n${cctpGeneralTexte}`
    : ''

  // Préparer label et nettoyer les anciennes alertes une seule fois (avant la boucle)
  let labelType
  if (categorieDoc === 'cctp') {
    labelType = 'CCTP vs Programme'
  } else if (idsRef && idsRef.length > 0) {
    const hasProg = docsRef.some(d => d.categorieDoc === 'programme')
    const hasCctp = docsRef.some(d => d.categorieDoc === 'cctp')
    const refLabel = hasProg && hasCctp ? 'Programme+CCTP' : hasProg ? 'Programme' : 'CCTP'
    labelType = `DPGF vs ${refLabel} — ${modeVerification === 'chiffrage' ? 'Chiffrage' : 'Technique'}`
  } else {
    const refLabel = avecCctp ? 'Programme+CCTP' : 'Programme'
    labelType = `DPGF vs ${refLabel} — ${modeVerification === 'chiffrage' ? 'Chiffrage' : 'Technique'}`
  }
  const LOT_LABELS = { cvc: 'CVC', menuiseries: 'Menuiseries', facades: 'Façades', etancheite: 'Étanchéité', grosOeuvre: 'Gros œuvre', plomberie: 'Plomberie' }
  const nomLot = lotType ? LOT_LABELS[lotType] || lotType : null
  const groupe = nomSousProgramme || nomLot
  const labelComplet = groupe ? `[${labelType} — ${groupe}]` : `[${labelType}]`

  const alertesLiees = await prisma.alerteDocument.findMany({ where: { documentId }, select: { alerteId: true } })
  if (alertesLiees.length > 0) {
    const alerteIds = alertesLiees.map(a => a.alerteId)
    await prisma.alerte.deleteMany({ where: { id: { in: alerteIds }, message: { startsWith: `[${labelType}` } } })
  }

  // Pour DPGF : traiter feuille par feuille (une passe Claude par feuille Excel)
  // Pour CCTP long (> 20 000 chars) : map-reduce par chunks de 6 000 chars
  // Pour CCTP court : section unique (comportement historique)
  const feuilles = categorieDoc === 'dpgf' ? splitParFeuilles(texteDoc) : []
  let sectionsATraiter
  if (feuilles.length > 1) {
    sectionsATraiter = feuilles.map(f => ({ texte: f.texte, label: f.nom }))
  } else if (categorieDoc === 'cctp' && texteDoc.length > 20000) {
    const chunks = chunkerTexte(texteDoc, 6000, 500)
    sectionsATraiter = chunks.map((chunk, i) => ({ texte: chunk, label: `Partie ${i + 1}/${chunks.length}` }))
    console.log(`[comparerDocuments] CCTP long (${texteDoc.length} chars) → ${chunks.length} chunks de ~6 000 chars`)
  } else {
    sectionsATraiter = [{ texte: extraireSectionPertinente(texteDoc, nomSousProgramme, premiereRef?.contenuTexte), label: nomSousProgramme || null }]
  }

  // TEST TEMPORAIRE — limiter à BAT A uniquement
  sectionsATraiter = sectionsATraiter.filter(s => !s.label || s.label.toUpperCase().includes('BAT A'))
  // FIN TEST

  console.log(`[comparerDocuments] ${sectionsATraiter.length} section(s) à traiter pour "${nomDoc}"`)


  const refIds = docsRef.map(r => r.id)
  const uniqueDocIds = [...new Set([documentId, ...refIds])]
  const model = modeleIA === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
  const alertesCreees = []

  for (let i = 0; i < sectionsATraiter.length; i++) {
    const section = sectionsATraiter[i]

    // Analyse JS pour cette section spécifiquement
    const resultatsSection = docsRef
      .filter(ref => ref.contenuTexte && ref.contenuTexte.length > 100)
      .map(ref => ({
        refNom: ref.nom,
        analyse: analyserEcarts(section.texte, ref.contenuTexte, nomDoc, ref.nom)
      }))

    const aDesEcartsSection = resultatsSection.some(r =>
      r.analyse.termesManquants.length > 3 || r.analyse.exigencesNonCouvertes.length > 0
    )

    if (!aDesEcartsSection) {
      console.log(`[comparerDocuments] Section "${section.label || 'principale'}" — couverture correcte, skip`)
      continue
    }

    const resumeEcartsSection = resultatsSection.map(r => {
      const a = r.analyse
      const ref = docsRef.find(d => d.nom === a.nomRef)
      const lignes = [`== ${section.label || nomDoc} vs ${a.nomRef} (couverture ${a.couverture}%) ==`]
      if (a.termesManquants.length > 0) {
        lignes.push(`Termes du programme absents de cette section : ${a.termesManquants.slice(0, 12).join(', ')}`)
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

    const labelSection = section.label ? ` (${section.label})` : (nomSousProgramme ? ` — section "${nomSousProgramme}"` : '')
    const contextSection = section.label
      ? `\nSection analysée : "${section.label}" — analyse UNIQUEMENT cette feuille du DPGF.`
      : (nomSousProgramme ? `\nPérimètre analysé : "${nomSousProgramme}" — analyse UNIQUEMENT la section correspondant à ce périmètre.` : '')

    const isChiffrage = modeVerification === 'chiffrage'
    const systemPrompt = isChiffrage ? SYSTEM_PROMPT_CHIFFRAGE : SYSTEM_PROMPT_BET_FLUIDES
    const mission = isChiffrage
      ? `MISSION
En analysant le DPGF ci-dessous et en le croisant avec le CCTP de référence :
1. Applique la CHECKLIST DE VÉRIFICATION DU CHIFFRAGE (postes non chiffrés, prix manquants, incohérences de quantités, doublons, quantités aberrantes).
2. Cite toujours la ligne/section précise du DPGF et le chapitre du CCTP correspondant.
3. Priorise par criticité : CRITIQUE en premier, puis MAJEUR, puis MINEUR.`
      : `MISSION
En croisant les extraits du programme et du ${categorieDoc.toUpperCase()} ci-dessus :
1. Applique la CHECKLIST DE VÉRIFICATION SYSTÉMATIQUE (postes à zéro, accessoires prescrits, diamètres, équipements non justifiés, incohérences internes).
2. Applique rigoureusement le dictionnaire d'équivalences — ne pas alerter pour des synonymes.
3. Pour chaque alerte, cite la section et les valeurs précises des deux documents (ex: "CCTP §3.2.4 : Ø250 — DPGF ligne X : Ø200").
4. Priorise par criticité : CRITIQUE en premier, puis MAJEUR, puis MINEUR.`

    const prompt = `${systemPrompt}

CONTEXTE DU PROJET
${contextProjet}${contextSection}${promptConfig}${vocabMetier}${isChiffrage ? '' : reglesAgent}${isChiffrage ? '' : contextGeneralites}

ÉCARTS DÉTECTÉS PAR L'ANALYSE AUTOMATIQUE
${resumeEcartsSection}

SECTION DU ${categorieDoc.toUpperCase()} ANALYSÉE${labelSection}
${section.texte}

${mission}

Réponds UNIQUEMENT en JSON :
{
  "alertes": [
    {
      "message": "Description précise de l'incohérence, en citant section et valeurs des deux documents",
      "statut": "ÉCART_MATÉRIAU",
      "criticite": "CRITIQUE"
    }
  ]
}

Valeurs possibles pour statut : ÉCART_MATÉRIAU, EXIGENCE_MANQUANTE, INCOHÉRENCE_TECHNIQUE, INCERTAIN_DESIGNATION, SOUS_DIMENSIONNEMENT
Valeurs possibles pour criticite : CRITIQUE, MAJEUR, MINEUR

Maximum 8 alertes pour cette section. Si aucun problème réel : { "alertes": [] }
IMPORTANT : si ton analyse conclut elle-même qu'il n'y a pas d'incohérence ("cohérent", "conforme", "pas d'alerte", "aucune anomalie"), ne crée PAS d'alerte pour ce point. Une alerte = un vrai problème, pas une vérification rassurante.`

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })

      const raw = response.content[0].text
      const jsonMatch = raw.match(/\{[\s\S]*"alertes"[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[comparerDocuments] Section "${section.label}" : pas de JSON valide dans la réponse, skip`)
        continue
      }
      const parsed = JSON.parse(jsonMatch[0])

      if (parsed.alertes?.length) {
        for (const alerte of parsed.alertes) {
          const criticiteValides = ['CRITIQUE', 'MAJEUR', 'MINEUR']
          const criticite = criticiteValides.includes(alerte.criticite) ? alerte.criticite : null
          const labelMessage = (feuilles.length > 1 && section.label)
            ? `[${labelType} — ${section.label}]`
            : labelComplet
          const nouvelleAlerte = await prisma.alerte.create({
            data: {
              projetId,
              message: `${labelMessage} ${alerte.message}`,
              criticite,
              contexteSource: categorieDoc === 'dpgf'
                ? (docsRef.filter(r => r.contenuTexte).map(r => extraireSectionPertinente(r.contenuTexte, null, alerte.message).substring(0, 2000)).join('\n\n---\n\n').substring(0, 4000) || null)
                : (section.texte ? section.texte.substring(0, 4000) : null),
              dpgfSource: categorieDoc === 'dpgf'
                ? (section.texte ? extraireSectionPertinente(section.texte, null, alerte.message).substring(0, 4000) : null)
                : null,
              documents: { create: uniqueDocIds.map(id => ({ documentId: id })) }
            }
          })
          alertesCreees.push(nouvelleAlerte)
        }
        console.log(`[comparerDocuments] Section "${section.label || 'principale'}" : ${parsed.alertes.length} alertes`)
      } else {
        console.log(`[comparerDocuments] Section "${section.label || 'principale'}" : aucun problème détecté`)
      }
    } catch (err) {
      console.error(`[comparerDocuments] Erreur IA section "${section.label}":`, err.message)
    }

    // Pause entre sections pour respecter le rate limit Anthropic (Sonnet)
    if (i < sectionsATraiter.length - 1) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log(`[comparerDocuments] Total : ${alertesCreees.length} alertes créées pour doc ${documentId} (${nomDoc})`)

  // Déduplication : supprimer les alertes dont le message est quasi-identique (premiers 80 chars)
  // Peut arriver avec le chevauchement des chunks
  const signaturesSeen = new Set()
  const doublons = []
  for (const alerte of alertesCreees) {
    const sig = alerte.message.substring(0, 80).toLowerCase().replace(/\s+/g, ' ')
    if (signaturesSeen.has(sig)) {
      doublons.push(alerte.id)
    } else {
      signaturesSeen.add(sig)
    }
  }
  if (doublons.length > 0) {
    await prisma.alerte.deleteMany({ where: { id: { in: doublons } } })
    console.log(`[comparerDocuments] ${doublons.length} alertes dupliquées supprimées`)
  }

  return alertesCreees.filter(a => !doublons.includes(a.id))
}

module.exports = { comparerAvecReference }
