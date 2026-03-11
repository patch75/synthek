// backend/src/services/lotDetector.js
// Détecte le type de lot d'un document à partir de son nom et de sa puce IA

const AGENTS = {
  cvc: require('../agents/lots/cvc'),
  menuiseries: require('../agents/lots/menuiseries'),
  facades: require('../agents/lots/facades'),
  etancheite: require('../agents/lots/etancheite'),
  grosOeuvre: require('../agents/lots/grosOeuvre'),
  plomberie: require('../agents/lots/plomberie'),
}

// Mots-clés qui signalent un CCTP général (Lot 00) — vérifiés en priorité absolue
const MOTS_GENERALITES = [
  'lot 00', 'lot00', 'generalites', 'généralités',
  'applicable a tous les lots', 'prescriptions communes',
  'prescriptions generales', 'clauses generales'
]

/**
 * Normalise un texte pour la comparaison (minuscules, sans accents)
 */
function normaliser(texte) {
  return texte.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
}

/**
 * Détecte le type de lot à partir du nom du fichier et/ou de la puce IA.
 * Retourne 'generalites' pour un Lot 00, le nom du lot (ex: 'cvc'), ou null.
 */
function detecterLot(nomFichier = '', puceIA = '') {
  const texteNorm = normaliser(`${nomFichier} ${puceIA}`)

  // Priorité absolue : détecter le CCTP général (Lot 00)
  if (MOTS_GENERALITES.some(m => texteNorm.includes(normaliser(m)))) {
    console.log(`[lotDetector] Lot 00 Généralités détecté pour "${nomFichier}"`)
    return 'generalites'
  }

  let meilleurLot = null
  let meilleurScore = 0

  for (const [nomLot, agent] of Object.entries(AGENTS)) {
    let score = 0
    for (const motCle of agent.motsClefsDétection) {
      const motNorm = normaliser(motCle)
      // Mot simple → vérification présence dans le texte
      if (texteNorm.includes(motNorm)) {
        // Score plus élevé si le mot-clé est dans le nom de fichier
        const dansNom = normaliser(nomFichier).includes(motNorm)
        score += dansNom ? 3 : 1
      }
    }
    if (score > meilleurScore) {
      meilleurScore = score
      meilleurLot = nomLot
    }
  }

  // Seuil minimum pour considérer la détection fiable
  if (meilleurScore < 2) return null

  console.log(`[lotDetector] Lot détecté: ${meilleurLot} (score: ${meilleurScore}) pour "${nomFichier}"`)
  return meilleurLot
}

/**
 * Charge l'agent correspondant au lot détecté.
 * Retourne l'agent générique si le lot est null ou inconnu.
 */
function chargerAgent(lotType) {
  if (lotType && AGENTS[lotType]) {
    return AGENTS[lotType]
  }
  return require('../agents/lots/generique')
}

/**
 * Liste tous les lots disponibles (pour l'UI)
 */
function listeLots() {
  return Object.keys(AGENTS)
}

module.exports = { detecterLot, chargerAgent, listeLots }
