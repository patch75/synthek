const Anthropic = require('@anthropic-ai/sdk')
const fs = require('fs')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT_EXTRACTION = `Tu es un expert en lecture de plans d'architecture. Extrais les surfaces de tous les logements visibles sur ce plan PDF.

Retourne UNIQUEMENT un JSON valide, sans markdown, sans texte autour, sans \`\`\`.

Structure attendue :
{
  "logements": [
    {
      "batiment": "string ou null",
      "niveau": "string ou null",
      "numero": "string",
      "typologie": "string (ex: T2, T3, Studio)",
      "pieces": {
        "sejour": 0.0,
        "cuisine": 0.0,
        "chambre_1": 0.0,
        "chambre_2": 0.0,
        "salle_de_bain": 0.0,
        "wc": 0.0,
        "degagement": 0.0,
        "entree": 0.0
      },
      "surface_habitable": 0.0,
      "surfaces_annexes": {
        "terrasse": 0.0,
        "jardin": 0.0,
        "cellier_ext": 0.0,
        "balcon": 0.0
      }
    }
  ]
}

Règles :
- Inclure uniquement les pièces réellement présentes (ne pas inventer)
- Les noms de pièces dans "pieces" doivent correspondre exactement à ce qui est indiqué sur le plan
- "surface_habitable" = somme des surfaces des pièces à vivre (S. hab. si indiquée explicitement, sinon calculer)
- "surfaces_annexes" : inclure uniquement ce qui est visible, omettre les clés absentes
- Toutes les surfaces sont en m², valeurs numériques (float)
- Si une information est absente, utiliser null (pas une chaîne vide)`

async function extractTextVision(filePath, nomDocument) {
  const buffer = fs.readFileSync(filePath)
  const base64 = buffer.toString('base64')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
