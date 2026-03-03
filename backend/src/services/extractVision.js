const Anthropic = require('@anthropic-ai/sdk')
const fs = require('fs')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT_EXTRACTION = `Tu es un expert en lecture de plans de construction (architecture, fluides, structure, électricité, VRD).
Extrais TOUTES les informations visibles sur ce document PDF :
- Cartouche : titre du plan, numéro, indice de révision, date, nom de l'intervenant, maître d'ouvrage, adresse du projet
- Cotes et dimensions (longueurs, hauteurs, épaisseurs)
- Noms des pièces et leurs surfaces
- Légendes et symboles normalisés
- Annotations techniques (matériaux, spécifications, notes)
- Réseaux visibles (gaines, canalisations, câbles) et leurs caractéristiques
- Niveaux (NGF, altimétrie)
- Tout texte lisible sur le plan

Restitue les informations de manière structurée et exhaustive en texte brut.`

async function extractTextVision(filePath, nomDocument) {
  const buffer = fs.readFileSync(filePath)
  const base64 = buffer.toString('base64')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Document : "${nomDocument}"\n\n${PROMPT_EXTRACTION}`,
          },
        ],
      },
    ],
  })

  return response.content[0]?.text || ''
}

module.exports = { extractTextVision }
