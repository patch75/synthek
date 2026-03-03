const prisma = require('../lib/prisma')

// Niveau 2 — API Légifrance (structure préparée)
// TODO: Configurer clés API Légifrance (LEGIFRANCE_CLIENT_ID, LEGIFRANCE_CLIENT_SECRET)
async function rechercherLegifrance(query) {
  // Simulation en attendant les clés API
  console.log(`[Légifrance] Recherche simulée : "${query}"`)
  return {
    source: 'legifrance',
    simule: true,
    resultats: [],
    message: 'API Légifrance non configurée — résultats simulés'
  }
}

// Niveau 3 — API GPU / Géoportail de l'Urbanisme (structure préparée)
// TODO: Configurer clés API GPU (GPU_API_KEY)
async function rechercherGPU(adresse) {
  // Simulation en attendant les clés API
  console.log(`[GPU] Recherche PLU simulée pour : "${adresse}"`)
  return {
    source: 'gpu',
    simule: true,
    plu: null,
    message: 'API GPU non configurée — résultats simulés'
  }
}

// Fonction principale : enrichit le contexte réglementaire pour les prompts IA
async function enrichirContexteReglementaire(projetId, question) {
  const projet = await prisma.projet.findUnique({
    where: { id: projetId },
    select: {
      typeBatiment: true,
      zoneClimatique: true,
      energieRetenue: true,
      classementErp: true,
      typeErp: true,
      adresse: true,
      nombreNiveaux: true,
      shon: true
    }
  })

  if (!projet) return ''

  const sections = []

  // Contexte bâtiment
  if (projet.typeBatiment || projet.zoneClimatique || projet.energieRetenue) {
    const infos = []
    if (projet.typeBatiment) infos.push(`Type de bâtiment : ${projet.typeBatiment}`)
    if (projet.nombreNiveaux) infos.push(`Nombre de niveaux : ${projet.nombreNiveaux}`)
    if (projet.shon) infos.push(`Surface SHON : ${projet.shon} m²`)
    if (projet.zoneClimatique) infos.push(`Zone climatique : ${projet.zoneClimatique}`)
    if (projet.energieRetenue) infos.push(`Énergie retenue : ${projet.energieRetenue}`)
    if (projet.classementErp) infos.push(`Classement ERP : type ${projet.typeErp}`)
    sections.push(`Caractéristiques du bâtiment :\n${infos.join('\n')}`)
  }

  // Niveau 2 — Légifrance (si question fournie)
  if (question) {
    const legifrance = await rechercherLegifrance(question)
    if (legifrance.resultats && legifrance.resultats.length > 0) {
      sections.push(`Résultats Légifrance :\n${legifrance.resultats.map(r => `- ${r}`).join('\n')}`)
    }
  }

  // Niveau 3 — GPU (si adresse disponible)
  if (projet.adresse) {
    const gpu = await rechercherGPU(projet.adresse)
    if (gpu.plu) {
      sections.push(`Données PLU (Géoportail de l'Urbanisme) :\n${JSON.stringify(gpu.plu)}`)
    }
  }

  return sections.length > 0
    ? `\nContexte projet enrichi :\n${sections.join('\n\n')}`
    : ''
}

module.exports = { enrichirContexteReglementaire, rechercherLegifrance, rechercherGPU }
