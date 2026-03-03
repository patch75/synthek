# Plan V4 — FaitDocument : Extraction structurée + Optimisation analyserProjet

## Pourquoi

Actuellement, `analyserProjet()` envoie le texte complet de TOUS les documents à Claude Sonnet à chaque upload.
Pour un projet de 8 docs → 24 000–64 000 tokens par appel. Lent et coûteux.

**Solution** : à l'upload, Claude Haiku extrait les faits structurés (quantités, matériaux, dimensions, normes…)
et les stocke dans une table `FaitDocument`. `analyserProjet()` interroge cette table au lieu de renvoyer les textes bruts.

**Gain estimé : 10x–20x de réduction de tokens sur les appels Sonnet.**

Exemple :
- Avant : `"Fourniture de 220 tuyaux PVC rouge DN32 série 1 conformes NF EN 12201..."` → 3 000 tokens
- Après : `| quantite    | tuyau PVC rouge     | 220 u |` → 15 tokens

---

## Fichiers à modifier / créer

| Fichier | Action |
|---------|--------|
| `backend/prisma/schema.prisma` | Ajouter modèle `FaitDocument` + back-relations |
| `backend/src/services/extractFaits.js` | **Créer** — service extraction Haiku |
| `backend/src/routes/documents.js` | Ajouter import + restructurer tâches background |
| `backend/src/services/ia.js` | Modifier `analyserProjet()` — requête faits + contexte hybride |
| `backend/scripts/backfill_faits.js` | **Créer** — script backfill pour documents existants |

---

## Étape 1 — Schéma Prisma (`schema.prisma`)

Ajouter à la fin du fichier (après `DecisionArbitrage`) :

```prisma
// V4 — Faits structurés extraits à l'upload (Claude Haiku)
model FaitDocument {
  id             Int      @id @default(autoincrement())
  documentId     Int
  projetId       Int
  categorie      String   // 'quantite'|'materiau'|'dimension'|'norme'|'performance'|'equipement'|'contrainte'
  sujet          String   // ex: "tuyau PVC rouge"
  valeur         String   // ex: "220" ou "DN32" ou "NF EN 12201"
  unite          String?  // ex: "u", "ml", "m²", "kW"
  contexte       String?  @db.Text  // phrase d'origine pour traçabilité
  dateExtraction DateTime @default(now())

  document       Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  projet         Projet   @relation(fields: [projetId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([projetId])
}
```

Ajouter les back-relations dans les modèles existants :
```prisma
// Dans model Document — ajouter :
faits  FaitDocument[]

// Dans model Projet — ajouter :
faits  FaitDocument[]
```

---

## Étape 2 — Migration

```bash
cd synthek/backend
npx prisma migrate dev --name fait_document
npx prisma generate
```

---

## Étape 3 — Nouveau fichier `backend/src/services/extractFaits.js`

```javascript
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
      max_tokens: 2048,
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
```

---

## Étape 4 — `routes/documents.js` — Restructurer les tâches background

### Import à ajouter en haut du fichier
```javascript
const { extraireFaits } = require('../services/extractFaits')
```

### Remplacer le bloc (AVANT) — génération des tâches background
```javascript
// Génération Puce + Analyse IA + Delta (si version précédente) en arrière-plan
const pid = parseInt(projetId)
const tasks = [
  genererPuce(document.id, pid, contenuTexte, document.nom)
    .catch(err => console.error('Erreur génération puce:', err.message)),
  analyserProjet(pid)
    .catch(err => console.error('Erreur analyse IA:', err.message))
]
if (docExistant && docExistant.contenuTexte) {
  tasks.push(
    comparerVersions(document.id, docExistant.id, contenuTexte, docExistant.contenuTexte, document.nom)
      .catch(err => console.error('Erreur comparaison versions:', err.message))
  )
}
Promise.all(tasks)
```

### Par (APRÈS)
```javascript
// Extraction faits → puis analyse projet (séquencé)
const pid = parseInt(projetId)
const backgroundTasks = async () => {
  // 1. Puce + Faits en parallèle (indépendants l'un de l'autre)
  await Promise.all([
    genererPuce(document.id, pid, contenuTexte, document.nom)
      .catch(err => console.error('Erreur génération puce:', err.message)),
    extraireFaits(document.id, pid, contenuTexte, document.nom)
      .catch(err => console.error('Erreur extraction faits:', err.message))
  ])

  // 2. Analyse projet une fois les faits en base
  analyserProjet(pid)
    .catch(err => console.error('Erreur analyse IA:', err.message))

  // 3. Delta si version précédente (indépendant)
  if (docExistant && docExistant.contenuTexte) {
    comparerVersions(document.id, docExistant.id, contenuTexte, docExistant.contenuTexte, document.nom)
      .catch(err => console.error('Erreur comparaison versions:', err.message))
  }
}
backgroundTasks()  // sans await — non-bloquant
```

> **Pourquoi chaîner ?** `analyserProjet()` va lire la table `FaitDocument`. Il faut que `extraireFaits()` ait fini d'écrire avant que `analyserProjet()` commence.

---

## Étape 5 — `services/ia.js` — `analyserProjet()`

### Juste après le chargement des documents, ajouter :
```javascript
// Charger les faits structurés pour tous les documents du projet
const faitsParDoc = await prisma.faitDocument.findMany({
  where: { projetId },
  orderBy: [{ documentId: 'asc' }, { categorie: 'asc' }]
})
const faitsByDocId = {}
for (const fait of faitsParDoc) {
  if (!faitsByDocId[fait.documentId]) faitsByDocId[fait.documentId] = []
  faitsByDocId[fait.documentId].push(fait)
}

// Contexte hybride : tableau de faits si dispo, sinon texte brut (fallback)
const contexte = documents
  .map(doc => {
    const faits = faitsByDocId[doc.id] || []
    const header = `--- Document: "${doc.nom}" (${doc.user.nom}) ---`

    if (faits.length > 0) {
      // Mode optimisé : tableau compact
      const entete = `| catégorie   | sujet                                    | valeur      |`
      const sep    = `|-------------|------------------------------------------|-------------|`
      const lignes = faits
        .map(f => {
          const vu = f.unite ? `${f.valeur} ${f.unite}` : f.valeur
          return `| ${f.categorie.padEnd(11)} | ${f.sujet.substring(0, 40).padEnd(40)} | ${vu} |`
        })
        .join('\n')
      const delta = doc.deltaModifications
        ? `\nModifications récentes :\n${doc.deltaModifications}`
        : ''
      return `${header}\n${entete}\n${sep}\n${lignes}${delta}`
    } else {
      // Fallback : aucun fait → texte complet (documents sans extraction)
      const texte = doc.deltaModifications || doc.contenuTexte || ''
      const label = doc.deltaModifications ? '(delta v' + doc.version + ')' : ''
      return `--- Document: "${doc.nom}" ${label}(déposé par ${doc.user.nom}) ---\n${texte}`
    }
  })
  .join('\n\n')
```

### Ajouter dans le prompt (avant `${contexte}`)
```
Les documents sont présentés sous forme de tableaux de faits structurés (catégorie | sujet | valeur).
Compare les valeurs de même sujet entre documents pour détecter les contradictions.
```

---

## Étape 6 — Script de backfill (documents déjà en base)

Créer `backend/scripts/backfill_faits.js` :

```javascript
require('dotenv').config()
const prisma = require('../src/lib/prisma')
const { extraireFaits } = require('../src/services/extractFaits')

async function backfill() {
  const docs = await prisma.document.findMany({
    where: { contenuTexte: { not: null } },
    select: { id: true, projetId: true, contenuTexte: true, nom: true }
  })

  console.log(`Backfill de ${docs.length} documents...`)

  for (const doc of docs) {
    const existants = await prisma.faitDocument.count({ where: { documentId: doc.id } })
    if (existants > 0) {
      console.log(`  [skip] ${doc.nom} (${existants} faits déjà en base)`)
      continue
    }
    console.log(`  [extract] ${doc.nom}`)
    await extraireFaits(doc.id, doc.projetId, doc.contenuTexte, doc.nom)
    await new Promise(r => setTimeout(r, 800))  // throttle API Haiku
  }

  console.log('Backfill terminé.')
  await prisma.$disconnect()
}

backfill().catch(e => { console.error(e); process.exit(1) })
```

Lancer avec :
```bash
cd synthek/backend && node scripts/backfill_faits.js
```

---

## Vérification

1. **Upload un doc** → vérifier dans Prisma Studio (`npx prisma studio`) que des lignes `FaitDocument` apparaissent
2. **Trigger `/ia/analyser`** → les alertes doivent rester cohérentes ; les logs montrent le tableau de faits
3. **Comparer les tokens** : ajouter `console.log('Prompt length:', prompt.length)` dans `analyserProjet()` avant/après

---

## Résumé des commandes d'implémentation

```bash
# 1. Éditer schema.prisma (ajouter FaitDocument + back-relations)

# 2. Migration
cd synthek/backend
npx prisma migrate dev --name fait_document
npx prisma generate

# 3. Créer backend/src/services/extractFaits.js

# 4-5. Modifier documents.js et ia.js

# 6. Backfill (optionnel, pour docs existants)
node scripts/backfill_faits.js

# 7. Redémarrer le backend
npm run dev
```
