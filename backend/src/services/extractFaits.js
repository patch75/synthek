// backend/src/services/extractFaits.js
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TEXTE_MAX = 50000  // ~12 500 tokens — couvre la plupart des CCTP complets

async function extraireFaits(documentId, projetId, contenuTexte, nomDocument) {
  if (!contenuTexte || contenuTexte.trim().length < 50) return []

  const texte = contenuTexte.substring(0, TEXTE_MAX)

  const prompt = `Tu es un expert en analyse de documents techniques de construction (CCTP, DPGF, plans, notes de calcul, comptes-rendus).

Extrais TOUS les faits techniques quantifiables et vérifiables du document ci-dessous.
Un "fait" est une information technique précise qui peut être comparée à d'autres documents pour détecter des incohérences.

Catégories à extraire :
- "quantite"     : nombre d'éléments (ex: 220 tuyaux, 15 prises, 3 CTA)
- "materiau"     : matière ou nature d'un composant (ex: PVC rouge, béton C25/30, acier S275)
- "dimension"    : cote, diamètre, section, longueur (ex: DN32, 200x200mm, épaisseur 18cm)
- "norme"        : référence normative ou réglementaire (ex: NF EN 12201, DTU 60.1, RE2020)
- "performance"  : valeur de performance ou de calcul (ex: U=0.28 W/m²K, débit 3600 m³/h, 120 kW)
- "equipement"   : nom ou référence d'un équipement (ex: chaudière Viessmann Vitodens 200)
- "contrainte"   : exigence ou condition (ex: pente mini 1%, hauteur libre 2.50m, REI60)

Document : "${nomDocument}"

Texte :
${texte}

Réponds UNIQUEMENT avec un tableau JSON valide. Pas de texte avant ou après. Pas de balises markdown. Format exact :
[
  {
    "categorie": "quantite",
    "sujet": "tuyau PVC rouge",
    "valeur": "220",
    "unite": "u",
    "contexte": "Fourniture de 220 tuyaux PVC rouge DN32 conformes NF EN 12201"
  }
]

Si aucun fait technique n'est trouvé, retourne exactement : []`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })

    const rawText = response.content[0].text.trim()
    // Défense : supprimer les éventuelles balises markdown
    const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    const faits = JSON.parse(jsonText)

    if (!Array.isArray(faits)) return []

    // Upsert : supprimer les anciens faits, insérer les nouveaux
    await prisma.faitDocument.deleteMany({ where: { documentId } })

    const valides = faits.filter(f =>
      f && typeof f.categorie === 'string' &&
      typeof f.sujet === 'string' &&
      typeof f.valeur === 'string'
    )

    if (valides.length > 0) {
      await prisma.faitDocument.createMany({
        data: valides.map(f => ({
          documentId,
          projetId,
          categorie: f.categorie,
          sujet: f.sujet.substring(0, 255),
          valeur: f.valeur.substring(0, 255),
          unite: f.unite ? f.unite.substring(0, 50) : null,
          contexte: f.contexte ? f.contexte.substring(0, 500) : null
        }))
      })
    }

    console.log(`[extractFaits] ${valides.length} faits extraits pour doc ${documentId} (${nomDocument})`)
    return valides
  } catch (err) {
    console.error(`[extractFaits] Erreur doc ${documentId}:`, err.message)
    return []
  }
}

module.exports = { extraireFaits }
