const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { enrichirContexteReglementaire } = require('./reglementation')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HIERARCHIE_VERITE = `Ordre de priorité des documents en cas de conflit :
1. Programme (référence absolue du projet — exprime les exigences du maître d'ouvrage)
2. CCTP (cahier des clauses techniques particulières — décline le programme lot par lot)
3. DPGF (décomposition du prix global et forfaitaire — chiffrage des prestations du CCTP)
4. Plans architecte
5. Notes de calcul ingénieurs
6. Comptes-rendus de réunion
→ En cas de conflit, désigner le document déviant et citer les deux valeurs contradictoires.
→ Le programme prime toujours : toute exigence du programme doit se retrouver dans le CCTP, et tout lot du CCTP doit être chiffré dans le DPGF.`

const REGLEMENTATION = `Contexte réglementaire applicable :
- DTU (Documents Techniques Unifiés) : normes d'exécution des travaux
- Arrêtés ERP (Établissements Recevant du Public) : sécurité incendie, accessibilité
- RE2020 (ex-RT2020) : réglementation environnementale, performance thermique
- Code de la Construction et de l'Habitation (CCH)
- Eurocode : calculs de structure
- NF EN 1992 (béton), NF EN 1993 (acier), NF EN 1996 (maçonnerie)
- Règles professionnelles et avis techniques CSTB`

// V3 — Charge la ConfigProjet pour injection dans les prompts
async function chargerConfigProjet(projetId) {
  try {
    const config = await prisma.configProjet.findUnique({ where: { projetId } })
    if (!config) return null
    return config
  } catch {
    return null
  }
}

// Charge les textes des documents de réglementation de référence
async function chargerReglementationRef() {
  try {
    const refs = await prisma.reglementationRef.findMany({
      select: { nom: true, contenuTexte: true }
    })
    if (!refs.length) return null
    return refs
      .filter(r => r.contenuTexte)
      .map(r => `--- ${r.nom} ---\n${r.contenuTexte}`)
      .join('\n\n')
  } catch {
    return null
  }
}

// Génère une Puce standardisée pour un document via Claude (Haiku — rapide)
async function genererPuce(documentId, projetId, contenuTexte, nomDocument) {
  if (!contenuTexte || contenuTexte.trim().length < 50) return null

  const prompt = `Tu es un assistant expert en construction. Analyse ce document et extrais une fiche standardisée à 5 champs.

Document : "${nomDocument}"
Contenu :
${contenuTexte.substring(0, 4000)}

Réponds UNIQUEMENT en JSON avec ce format exact :
{
  "typeLivrable": "ex: CCTP, DPGF, Plan, Note de calcul, CR réunion",
  "valeurCle": "la donnée technique principale (ex: résistance béton C25/30, surface 450m², puissance 120kW)",
  "version": "numéro ou date de version si mentionné, sinon null",
  "resumeModification": "résumé des modifications ou objet du document en 1-2 phrases"
}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = response.content[0].text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(raw)

    const puce = await prisma.puce.create({
      data: {
        documentId,
        projetId,
        typeLivrable: parsed.typeLivrable || null,
        valeurCle: parsed.valeurCle || null,
        version: parsed.version || null,
        resumeModification: parsed.resumeModification || null
      }
    })

    return puce
  } catch (err) {
    console.error('Erreur génération puce:', err.message)
    return null
  }
}

// Compare deux versions d'un document et stocke le delta (Sonnet)
async function comparerVersions(docId, docPrecedentId, contenuTexte, contenuPrecedent, nomDocument) {
  if (!contenuTexte || !contenuPrecedent) return null

  const prompt = `Tu es un assistant expert en construction. Compare ces deux versions du document "${nomDocument}" et isole uniquement les modifications techniques.

VERSION PRÉCÉDENTE :
${contenuPrecedent.substring(0, 5000)}

VERSION ACTUELLE :
${contenuTexte.substring(0, 5000)}

Réponds UNIQUEMENT en JSON avec ce format exact :
{
  "delta": "Résumé synthétique des modifications en 2-3 phrases",
  "modifications": [
    "Modification 1 : valeur ancienne → valeur nouvelle",
    "Modification 2 : ..."
  ]
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })

    const parsed = JSON.parse(response.content[0].text)
    const deltaTexte = parsed.delta + '\n' + (parsed.modifications || []).map(m => `• ${m}`).join('\n')

    await prisma.document.update({
      where: { id: docId },
      data: { deltaModifications: deltaTexte }
    })

    return parsed
  } catch (err) {
    console.error('Erreur comparaison versions:', err.message)
    return null
  }
}

// Analyse tous les documents d'un projet et détecte les incohérences (Sonnet)
async function analyserProjet(projetId) {
  const documents = await prisma.document.findMany({
    where: { projetId },
    include: { user: { select: { nom: true, role: true } } }
  })

  if (documents.length < 2) return []

  // Supprimer les alertes actives existantes avant de recréer
  await prisma.alerte.deleteMany({ where: { projetId, statut: 'active' } })

  const [contenuReglementationRef, configProjet, contexteReglementaire, faitsParDoc] = await Promise.all([
    chargerReglementationRef(),
    chargerConfigProjet(projetId),
    enrichirContexteReglementaire(projetId),
    prisma.faitDocument.findMany({
      where: { projetId },
      orderBy: [{ documentId: 'asc' }, { categorie: 'asc' }]
    })
  ])

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

  const reglementationSection = contenuReglementationRef
    ? `\n4. Documents réglementaires de référence (uploadés par l'admin) :\n${contenuReglementationRef}`
    : ''

  // V3 — Injection config projet + contexte réglementaire enrichi
  const configSection = configProjet?.promptSystemeGlobal
    ? `\nConsignes spécifiques du projet :\n${configProjet.promptSystemeGlobal}`
    : ''
  const seuilsSection = configProjet?.seuilsTolerance
    ? `\nSeuils de tolérance : ${JSON.stringify(configProjet.seuilsTolerance)}`
    : ''
  const vocabSection = configProjet?.vocabulaireMetier
    ? `\nVocabulaire métier (synonymes) : ${JSON.stringify(configProjet.vocabulaireMetier)}`
    : ''

  const prompt = `Tu es un assistant de coordination de chantier. Analyse ces documents de projet et identifie les incohérences techniques, contradictions ou conflits entre eux.

${HIERARCHIE_VERITE}
${reglementationSection}${contexteReglementaire}${configSection}${seuilsSection}${vocabSection}

Les documents sont présentés sous forme de tableaux de faits structurés (catégorie | sujet | valeur).
Compare les valeurs de même sujet entre documents pour détecter les contradictions.

${contexte}

Réponds UNIQUEMENT en JSON avec ce format exact :
{
  "alertes": [
    {
      "message": "Description claire de l'incohérence avec les deux valeurs contradictoires et le document déviant selon la hiérarchie de priorité",
      "documents": ["nom du document 1", "nom du document 2"]
    }
  ]
}

Si aucune incohérence n'est détectée, retourne { "alertes": [] }`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = response.content[0].text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
  const parsed = JSON.parse(text)

  // Créer les alertes en base
  const alertesCreees = []
  for (const alerte of parsed.alertes) {
    const docsConcernes = documents.filter(d => alerte.documents.includes(d.nom))

    const nouvelleAlerte = await prisma.alerte.create({
      data: {
        projetId,
        message: alerte.message,
        documents: {
          create: docsConcernes.map(d => ({ documentId: d.id }))
        }
      }
    })
    alertesCreees.push(nouvelleAlerte)
  }

  // Si nouvelles alertes et projet en phase EXE → bloquer
  if (alertesCreees.length > 0) {
    const projet = await prisma.projet.findUnique({ where: { id: projetId }, select: { phase: true } })
    if (projet && projet.phase === 'EXE') {
      await prisma.projet.update({
        where: { id: projetId },
        data: {
          bloqueExe: true,
          raisonBlocage: `${alertesCreees.length} alerte(s) active(s) détectée(s) lors de l'analyse IA`
        }
      })
    }
  }

  return alertesCreees
}

// Répond à une question en croisant 3 sources : réglementation, documents, puces (Haiku)
async function questionIA(projetId, userId, question) {
  const [documents, puces, contenuReglementationRef, configProjet, contexteReglementaire] = await Promise.all([
    prisma.document.findMany({
      where: { projetId },
      select: { nom: true, contenuTexte: true }
    }),
    prisma.puce.findMany({
      where: { projetId },
      include: { document: { select: { nom: true } } }
    }),
    chargerReglementationRef(),
    chargerConfigProjet(projetId),
    enrichirContexteReglementaire(projetId, question)
  ])

  const contexteDocuments = documents
    .filter(d => d.contenuTexte)
    .map(doc => `--- ${doc.nom} ---\n${doc.contenuTexte}`)
    .join('\n\n')

  const contextePuces = puces.length > 0
    ? puces.map(p =>
        `[${p.document.nom}] Type: ${p.typeLivrable || 'N/A'} | Valeur clé: ${p.valeurCle || 'N/A'} | Version: ${p.version || 'N/A'} | ${p.resumeModification || ''}`
      ).join('\n')
    : 'Aucune puce disponible'

  const reglementationSection = contenuReglementationRef
    ? `\n4. Documents réglementaires de référence (uploadés par l'admin) :\n${contenuReglementationRef}`
    : ''

  // V3 — Injection config projet + contexte réglementaire enrichi
  const configSectionQ = configProjet?.promptSystemeGlobal
    ? `\n5. Consignes spécifiques du projet :\n${configProjet.promptSystemeGlobal}`
    : ''

  const prompt = `Tu es un assistant expert en réglementation de construction. Réponds à la question en croisant 3 sources.

1. Contexte réglementaire :
${REGLEMENTATION}

2. Documents du projet :
${contexteDocuments || 'Aucun document disponible'}

3. Puces actives (fiches standardisées des documents) :
${contextePuces}
${reglementationSection}${contexteReglementaire}${configSectionQ}

Question : ${question}

→ Dans ta réponse, indique clairement :
- La source réglementaire applicable (si pertinent)
- La valeur ou information trouvée dans les documents du projet
- Un diagnostic de cohérence entre la réglementation et les documents
Cite les noms de documents sources quand possible.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  })

  const reponse = response.content[0].text

  await prisma.messageIA.create({
    data: { projetId, userId, question, reponse }
  })

  return reponse
}

// Analyse croisée pour une synthèse (Sonnet)
async function analyserSynthese(projetId, codeSynthese, docSourceId, docCroisesIds) {
  const [docSource, ...docsCroises] = await Promise.all([
    prisma.document.findUnique({
      where: { id: docSourceId },
      include: { puce: true }
    }),
    ...docCroisesIds.map(id => prisma.document.findUnique({
      where: { id },
      include: { puce: true }
    }))
  ])

  if (!docSource) throw new Error('Document source introuvable')

  const typeSource = docSource.puce?.typeLivrable || docSource.nom
  const typesCroises = docsCroises
    .filter(Boolean)
    .map(d => d.puce?.typeLivrable || d.nom)
    .join(' / ')

  const contexteSource = `--- ${docSource.nom} (${typeSource}) ---\n${docSource.contenuTexte || 'Pas de contenu'}`
  const contexteCroise = docsCroises
    .filter(Boolean)
    .map(d => `--- ${d.nom} (${d.puce?.typeLivrable || d.nom}) ---\n${d.contenuTexte || 'Pas de contenu'}`)
    .join('\n\n')

  const prompt = `Tu es un assistant expert en coordination de chantier. Analyse le croisement ${codeSynthese} : ${typeSource} ↔ ${typesCroises}.

Document source :
${contexteSource.substring(0, 4000)}

Documents croisés :
${contexteCroise.substring(0, 4000)}

${HIERARCHIE_VERITE}

Réponds UNIQUEMENT en JSON avec ce format exact :
{
  "resultatVisa": "FAVORABLE" | "AVEC_RESERVES" | "DEFAVORABLE",
  "rapportTexte": "Rapport détaillé du croisement en 3-5 paragraphes",
  "recommandations": ["recommandation 1", "recommandation 2"]
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  })

  const parsed = JSON.parse(response.content[0].text)

  const synthese = await prisma.synthese.create({
    data: {
      projetId,
      codeSynthese,
      documentIdSource: docSourceId,
      documentsCroisesIds: JSON.stringify(docCroisesIds),
      resultatVisa: parsed.resultatVisa || null,
      rapportTexte: (parsed.rapportTexte || '') + (parsed.recommandations?.length
        ? '\n\nRecommandations :\n' + parsed.recommandations.map(r => `• ${r}`).join('\n')
        : '')
    }
  })

  return synthese
}

module.exports = { analyserProjet, questionIA, genererPuce, comparerVersions, analyserSynthese }
