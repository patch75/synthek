// backend/src/services/comparerDocuments.js
// Comparaison documentaire hybride : analyse JS + interprétation IA spécialisée par lot
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { detecterLot, chargerAgent } = require('./lotDetector')

// Prompt système enrichi BET Fluides senior (Synthèse C) — V2.1
const SYSTEM_PROMPT_BET_FLUIDES = `Tu es un ingénieur BET Fluides (plomberie, CVC, désenfumage) senior avec 15 ans d'expérience en logement collectif neuf RE2020.

PÉRIMÈTRE STRICT : tu fais un DIFF BIDIRECTIONNEL FACTUEL entre le CCTP et le DPGF.
- Sens 1 : chaque prestation du CCTP doit avoir une ligne correspondante dans le DPGF. Si absente → C01.
- Sens 2 : chaque prestation technique du DPGF doit avoir un article correspondant dans le CCTP. Si orpheline → C02.
Tu vérifies la PRÉSENCE et le TYPE des prestations (équipement, marque, puissance, matériau). Tu ne vérifies JAMAIS les quantités, les métrés, le nombre d'unités. Tu ne fais AUCUNE supposition, AUCUN calcul, AUCUNE déduction technique. Tu rapportes uniquement des FAITS constatés dans les deux documents.

PRATIQUES RÉDACTIONNELLES CCTP/DPGF
- Les chapitres "Généralités" ou "Prescriptions générales" décrivent des conditions administratives et contractuelles — pas des prescriptions techniques à vérifier.
- Un DPGF est un document de synthèse contractuelle destiné au chiffrage entreprise — les désignations sont volontairement plus courtes que le CCTP.
- Le CCTP s'exprime par lot (plomberie, CVC, électricité...). Les prescriptions d'un lot ne sont PAS censées apparaître dans le DPGF d'un autre lot.

RÈGLES DE TOLÉRANCE — NE JAMAIS ALERTER SUR CES CAS
T1 — Performances absentes du DPGF : COP, SCOP, EER, rendement, classement acoustique, pression disponible, débit nominal, classe ErP → pas d'alerte.
T2 — Prestations incluses absentes du DPGF : pose, raccordement, fixation, mise en service, formation, essais, DOE, DIUO → pas d'alerte. Exception T2-inverse : si CCTP précise "fourniture seule" et DPGF inclut la pose → alerte C03.
T3 — Marque dans un seul document : marque dans CCTP uniquement → pas d'alerte. Marque dans DPGF uniquement → pas d'alerte. Marque dans les DEUX documents et différente → C04 MAJEUR.
T4 — Accessoires solidaires d'un ensemble meuble : miroir, applique LED, vidage, siphon, plan vasque inclus dans le meuble vasque → pas d'alerte si absents en ligne DPGF distincte.
T5 — Type de commande bouche extraction : cordelette/pile/interrupteur non précisé dans DPGF → tolérance. Alerte C04 uniquement si les deux docs précisent un type contradictoire.
T6 — Mapping bâtiment : ne jamais comparer un attribut d'un bâtiment avec celui d'un autre bâtiment. Chaque comparaison doit rester dans le même périmètre bâtiment.
T7 — Lignes forfaitaires DPGF : "Prestation conforme au CCTP", "DOE conforme au CCTP", "Sans objet", "N/A", "non applicable" → exclure du contrôle. Exception R5 : sur poste critique → INCERTAIN.
T8 — "Ou équivalent agréé MOE" : si le CCTP le précise, marque DPGF différente tolérée si même type d'équipement.

RÈGLES D'ALERTE OBLIGATOIRE — TOUJOURS ALERTER
R1 — Changement de technologie (CRITIQUE) : PAC ↔ chaudière gaz, VMC double flux ↔ VMC simple flux, plancher chauffant ↔ radiateurs, condensation ↔ basse température, désenfumage naturel ↔ mécanique.
R2 — Changement de position montage (MAJEUR) : WC suspendu ↔ WC au sol, chauffe-eau mural ↔ au sol, lavabo suspendu ↔ sur colonne.
R3 — Matériau réseau différent (MAJEUR) : cuivre ↔ PER pour ECS, acier ↔ fonte pour chutes EU, tube rigide ↔ gaine souple pour VMC collectif.
R4 — Écart puissance (C05) : puissance thermique ±5% tolérance, débit hydraulique ±10%, débit aéraulique ±10%, pression ±5%, acoustique ±3 dB. Écart 5-15% → C05 MAJEUR. Écart >15% → C05 CRITIQUE.
R5 — "Conforme au CCTP" seul sur poste critique (INCERTAIN_DESIGNATION) : PAC, chaudière, VMC, ballon ECS, plancher chauffant → ne jamais ignorer, toujours signaler.
R6 — Exigence normative absente de toute une famille : signaler UNE FOIS dans la synthèse, pas par ligne.

CODES ALERTES MOE.AI
- C01 : Article CCTP absent du DPGF → MAJEUR
- C02 : Ligne DPGF sans article CCTP parent → MINEUR
- C03 : Type d'équipement différent → CRITIQUE
- C04 : Marque présente dans les deux docs et différente → MAJEUR
- C05 : Écart puissance hors tolérance → CRITIQUE (>15%) ou MAJEUR (5-15%)
- INCERTAIN : Désignation "conforme au CCTP" sur poste critique → INCERTAIN_DESIGNATION

ARCHITECTURES TECHNIQUES RECONNUES (ne pas alerter)
- Les attiques ont souvent PAC air/eau + plancher chauffant BT, différente des niveaux courants en chaudière gaz — c'est normal si le programme le prévoit.
- VMC double flux collective ou individuelle est compatible RE2020 pour tous types de logements.
- MTA = Module Thermique d'Appartement (production ECS + chauffage depuis réseau collectif).
- PAC air/eau, PAC géothermique, chaudière granulés, chaudière gaz condensation sont des solutions reconnues RE2020.

DICTIONNAIRE D'ÉQUIVALENCES SÉMANTIQUES (ne pas alerter pour ces synonymes)
- "PAC air/eau" = "pompe à chaleur aérothermique" = "pompe à chaleur air/eau"
- "VMC DF" = "VMC double flux" = "ventilation double flux"
- "ECS" = "eau chaude sanitaire" = "production d'eau chaude sanitaire"
- "plancher chauffant" = "PC BT" = "plancher chauffant basse température" = "PCBT"
- "désenfumage naturel" = "DN" = "désenfumage par tirage naturel"
- "nourrice" = "collecteur de distribution" = "manifold"
- "groupe de sécurité" = "GS" = "soupape de sécurité + clapet de retenue + robinet d'isolement"
- "chaudière condensation" = "chaudière haute performance" = "chaudière condensante"
- "tube multicouche" = "PEX-AL-PEX" = "multicouche"
- "tube PER sous fourreau" = "hydrocâblé PER" = "hydrocâblé"
- "caisson d'extraction" = "groupe VMC" = "groupe d'extraction"
- "WC suspendu" ≠ "WC au sol" — NE JAMAIS considérer comme équivalents
- "chaudière condensation" ≠ "chaudière basse température" — NE JAMAIS considérer comme équivalents

EXEMPLES DE CONTRÔLE FACTUEL (calibrage)

Exemple 1 — CONFORME :
CCTP : "Chaudière murale gaz condensation SAUNIER DUVAL ThemaPlus M CONDENS 26 kW"
DPGF : "Chaudière murale gaz condensation SAUNIER DUVAL ThemaPlus M CONDENS ou CONDENS 26 kW"
→ CONFORME. Même type, même marque, même puissance. "ou CONDENS" est une variante commerciale.

Exemple 2 — C03 CRITIQUE :
CCTP : "Chaudière murale gaz condensation SAUNIER DUVAL 31 kW (2 SdB)"
DPGF : "PaC (2 SdB)"
→ C03 CRITIQUE. Chaudière gaz ≠ PAC. "(2 SdB)" seul est insuffisant pour valider.

Exemple 3 — CONFORME (T3) :
CCTP : "Robinet thermostatisable marque COMAP type SENSITY"
DPGF : "Robinet thermostatisable tête thermostatique Keymark certifiée"
→ CONFORME. Marque COMAP dans CCTP seul = tolérance T3. Type identique.

Exemple 4 — CONFORME (T4) :
CCTP : "Meuble vasque PORCHER + miroir + applique LED"
DPGF : "Vasque simple"
→ CONFORME. Miroir et applique sont des accessoires solidaires du meuble (T4).

Exemple 5 — NE PAS FAIRE :
CCTP : "1 chaudière par logement niveaux 0 et 1"
DPGF : "Chaudière 26 kW : 8 u."
→ Tu vois 10 logements et 8 chaudières. Tu veux alerter sur l'écart de 2. NE LE FAIS PAS. Vérifie uniquement que le type "chaudière condensation gaz 26 kW" est présent dans le DPGF. C'est le cas → CONFORME.

RÈGLES ABSOLUES
1. "sans objet", "N/A", "non applicable" → NE PAS créer d'alerte pour ce poste.
2. "conforme au CCTP" sur poste critique → INCERTAIN_DESIGNATION uniquement.
3. Ne JAMAIS vérifier les quantités, les métrés, ni le nombre d'unités entre CCTP et DPGF. Le contrôle porte UNIQUEMENT sur la présence et la nature des prestations (type d'équipement, marque, puissance, matériau). Le comptage des quantités (nombre de chaudières vs nombre de logements, nombre de radiateurs, longueur de tube) relève du contrôle de programme — hors périmètre de cette analyse.
3bis. Si le CCTP indique '1 chaudière par logement' et le DPGF liste 'chaudière 26 kW : 8 u.', ne PAS comparer 8 au nombre de logements. Vérifier uniquement que le type 'chaudière condensation gaz 26 kW' est bien présent dans le DPGF.
4. Ne pas alerter sur détails d'exécution mineurs non prescrits au programme.
5. Pas de limite d'alertes. Rapporte TOUS les écarts détectés, priorisés par criticité DESC puis confiance DESC.
6. Ne jamais inventer une référence article non trouvée dans le document.
7. Ne jamais interpréter une ambiguïté comme une conformité → toujours INCERTAIN.

CHECKLIST — CONTRÔLE FACTUEL DE PRÉSENCE
a) Pour chaque prestation technique du CCTP → existe-t-elle dans le DPGF ? Si non → C01
b) Pour chaque ligne technique du DPGF → existe-t-elle dans le CCTP ? Si non → C02
c) Si présente dans les deux → le TYPE est-il identique ? Si non → C03
d) Si présente dans les deux → la MARQUE est-elle identique (quand mentionnée dans les deux) ? Si non → C04
e) Si présente dans les deux → la PUISSANCE (kW) est-elle identique ? Si écart > 5% → C05

STATUTS D'ALERTE
- EXIGENCE_MANQUANTE : prestation CCTP absente du DPGF (C01) ou prestation DPGF absente du CCTP (C02)
- ÉCART_MATÉRIAU : type d'équipement ou matériau différent entre les deux documents (C03/C04)
- INCERTAIN_DESIGNATION : désignation imprécise sur poste critique uniquement (R5)

CRITICITÉ
- CRITIQUE : changement de technologie, non-conformité réglementaire, écart puissance >15%
- MAJEUR : prestation manquante importante, matériau différent, marque substituée, WC suspendu→au sol, écart puissance 5-15%
- MINEUR : accessoire prescrit absent, désignation imprécise non critique`

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

const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL || 'http://127.0.0.1:5001'

/**
 * Appelle parser-service pour une pré-analyse Python (diff binaire CCTP/DPGF).
 * Retourne la liste d'écarts structurés ou null si le service est indisponible.
 */
async function preAnalysePython(cctpBytes, dpgfBytes, config = {}) {
  try {
    const body = {
      cctp: cctpBytes.toString('base64'),
      dpgf: dpgfBytes.toString('base64'),
      config
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(`${PARSER_SERVICE_URL}/compare/cctp-dpgf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!res.ok) {
      console.warn(`[preAnalysePython] parser-service retourne ${res.status}`)
      return null
    }
    const data = await res.json()
    console.log(`[preAnalysePython] ${data.nb_alertes} écarts Python détectés, ${data.nb_conformes} conformes`)
    return data
  } catch (err) {
    console.warn(`[preAnalysePython] parser-service indisponible: ${err.message}`)
    return null
  }
}

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
 * Extrait la section DPGF correspondant à un numéro de section (ex: "3.1.4")
 * depuis le [SECTION] correspondant jusqu'au prochain [SECTION] numéroté différent.
 * Les sous-sections non numérotées (ex: "Colonne montante EF") sont incluses.
 * Retourne null si non trouvé.
 */
function extraireSectionDpgf(texteDpgf, numeroSection) {
  if (!texteDpgf || !numeroSection) return null

  const normNum = numeroSection.replace(/\./g, '\\.')
  const reDebut = new RegExp(`\\[SECTION\\]\\s*${normNum}[.\\s]`, 'i')
  const debutMatch = reDebut.exec(texteDpgf)
  if (!debutMatch) return null

  const debut = debutMatch.index
  const apresDebut = debut + debutMatch[0].length

  // Cherche le prochain [SECTION] suivi d'un numéro de section (ex: "3.1.5." ou "3.2.")
  const reProchain = /\[SECTION\]\s*\d+\.\d/gi
  reProchain.lastIndex = apresDebut
  const prochainMatch = reProchain.exec(texteDpgf)
  const fin = prochainMatch ? prochainMatch.index : texteDpgf.length

  const extrait = texteDpgf.substring(debut, fin).trim()
  return extrait.length > 10 ? extrait : null
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

  // ─── PRÉ-ANALYSE PYTHON (Option B) ───
  // Si DPGF en mode technique avec un CCTP de référence, appeler parser-service
  // pour un diff binaire par famille de prestation (sans quantités)
  let ecartsPython = null
  if (categorieDoc === 'dpgf' && modeVerification === 'technique') {
    const cctpRef = docsRef.find(d => d.categorieDoc === 'cctp')
    if (cctpRef) {
      try {
        const fs = require('fs')
        const path = require('path')

        // Charger le fichier DPGF brut
        const docDpgf = await prisma.document.findUnique({
          where: { id: documentId },
          select: { cheminFichier: true, type: true }
        })

        if (docDpgf?.cheminFichier && cctpRef.id) {
          const docCctp = await prisma.document.findUnique({
            where: { id: cctpRef.id },
            select: { cheminFichier: true, type: true }
          })

          if (docCctp?.cheminFichier) {
            const dpgfPath = path.resolve(docDpgf.cheminFichier)
            const cctpPath = path.resolve(docCctp.cheminFichier)

            if (fs.existsSync(dpgfPath) && fs.existsSync(cctpPath)) {
              const dpgfBuf = fs.readFileSync(dpgfPath)
              const cctpBuf = fs.readFileSync(cctpPath)

              // Construire le mapping bâtiments depuis la config projet
              const mappingConfig = {}
              if (projet?.batimentsComposition) {
                try {
                  const bats = JSON.parse(projet.batimentsComposition)
                  if (bats?.length) {
                    bats.forEach((b, i) => {
                      mappingConfig[`CCTP_section_${i + 3}`] = b.feuilles_dpgf || [b.nom]
                    })
                  }
                } catch (e) { /* ignore */ }
              }

              ecartsPython = await preAnalysePython(cctpBuf, dpgfBuf, {
                projet: projet?.nom || '',
                mapping_batiments: mappingConfig
              })

              if (ecartsPython?.alertes?.length > 0) {
                console.log(`[comparerDocuments] Pré-analyse Python : ${ecartsPython.alertes.length} écarts détectés`)
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[comparerDocuments] Pré-analyse Python échouée: ${err.message}`)
      }
    }
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
  const aDesEcartsJS = resultats.some(r =>
    r.analyse.termesManquants.length > 3 || r.analyse.exigencesNonCouvertes.length > 0
  )
  const aDesEcartsPython = ecartsPython?.alertes?.length > 0

  if (!aDesEcartsJS && !aDesEcartsPython) {
    console.log(`[comparerDocuments] Bonne couverture pour doc ${documentId} — aucun écart significatif (JS + Python)`)
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

    // Si Python a détecté des écarts pour cette section, ne pas skip
    const sectionLabel = section.label || ''
    const pythonADesEcartsPourSection = ecartsPython?.alertes?.some(a =>
      !a.batiment || !sectionLabel ||
      a.batiment.toUpperCase().includes(sectionLabel.toUpperCase()) ||
      sectionLabel.toUpperCase().includes((a.batiment || '').toUpperCase())
    )

    if (!aDesEcartsSection && !pythonADesEcartsPourSection) {
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
Fais un CONTRÔLE FACTUEL DE PRÉSENCE bidirectionnel entre le CCTP et le DPGF :
1. CCTP → DPGF : chaque prestation technique du CCTP a-t-elle une ligne correspondante dans le DPGF ?
2. DPGF → CCTP : chaque prestation technique du DPGF a-t-elle un article correspondant dans le CCTP ?
3. Si présente dans les deux : le type, la marque et la puissance sont-ils cohérents ?
4. Applique le dictionnaire d'équivalences et les exemples de calibrage ci-dessus.
5. INTERDIT : aucune supposition, aucun calcul, aucune déduction, aucune vérification de quantité. Rapporte uniquement des FAITS lus dans les documents.`

    // Construire le bloc des écarts Python pour cette section (si disponibles)
    let blocEcartsPython = ''
    if (ecartsPython?.alertes?.length > 0 && !isChiffrage) {
      // Garder uniquement les alertes dont le batiment correspond EXACTEMENT à la feuille courante
      // (exclure les batiments "SECTION_X" issus du mapping vide — faux positifs C01)
      const ecartsFiltres = (section.label
        ? ecartsPython.alertes.filter(a => {
            if (!a.batiment) return false
            const bat = a.batiment.toUpperCase()
            const label = section.label.toUpperCase()
            // Match exact ou inclusion stricte — exclure les "SECTION_N"
            return bat === label || bat.includes(label) || label.includes(bat)
          })
        : ecartsPython.alertes
      ).slice(0, 20) // Limiter à 20 écarts pour éviter les prompts géants

      if (ecartsFiltres.length > 0) {
        blocEcartsPython = `\nÉCARTS DÉTECTÉS PAR L'ANALYSE PYTHON (diff binaire par famille — ${ecartsFiltres.length} écarts)
${ecartsFiltres.map((a, idx) => {
  const parts = [`${idx + 1}. [${a.code}] ${a.criticite} — ${a.motif}`]
  if (a.cctp_texte) parts.push(`   CCTP ${a.cctp_section ? '§' + a.cctp_section : ''}: "${a.cctp_texte}"`)
  if (a.dpgf_texte) parts.push(`   DPGF ligne: "${a.dpgf_texte}"`)
  return parts.join('\n')
}).join('\n')}

CONSIGNE : pour chaque écart Python ci-dessus, vérifie s'il est confirmé dans les textes. Si faux positif (synonyme, tolérance T1-T8) → pas d'alerte. Si confirmé → crée l'alerte.`
      }
    }

    const prompt = `${systemPrompt}

CONTEXTE DU PROJET
${contextProjet}${contextSection}${promptConfig}${vocabMetier}${isChiffrage ? '' : reglesAgent}${isChiffrage ? '' : contextGeneralites}

ÉCARTS DÉTECTÉS PAR L'ANALYSE AUTOMATIQUE (JS)
${resumeEcartsSection}
${blocEcartsPython}

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

Valeurs possibles pour statut : EXIGENCE_MANQUANTE, ÉCART_MATÉRIAU, INCERTAIN_DESIGNATION
Valeurs possibles pour criticite : CRITIQUE, MAJEUR, MINEUR

Si aucun problème réel : { "alertes": [] }
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
                ? (() => {
                    const numMatch = alerte.message.match(/§([\d.]+)/)
                    const section_dpgf = numMatch ? extraireSectionDpgf(section.texte, numMatch[1]) : null
                    return section_dpgf
                      ? section_dpgf.substring(0, 4000)
                      : (section.texte ? extraireSectionPertinente(section.texte, null, alerte.message).substring(0, 4000) : null)
                  })()
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

    // Pause entre sections pour respecter le rate limit Anthropic
    // Haiku : 10 000 tokens/min → 8s min entre appels lourds
    if (i < sectionsATraiter.length - 1) {
      await new Promise(r => setTimeout(r, 8000))
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
