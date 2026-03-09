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
      lignes.push(ref.contenuTexte.substring(0, 1500))
    }
    return lignes.join('\n')
  }).join('\n\n---\n\n')

  // Appel Haiku pour filtrer les vrais problèmes parmi les écarts détectés
  try {
    const prompt = `Tu es un expert en bureau d'études thermiques et fluides (BET), spécialisé dans l'analyse de documents de construction (programmes, CCTP, DPGF).

Un script d'analyse automatique a comparé le document "${nomDoc}" (${categorieDoc.toUpperCase()}) avec les documents de référence du projet.
Voici les écarts détectés ainsi que les extraits des deux documents pour vérification :

${resumeEcarts}

---
Extrait du document analysé (${nomDoc}) :
${texteDoc.substring(0, 1500)}

---
Mission : en te basant sur les extraits ci-dessus, identifie UNIQUEMENT les omissions ou incohérences techniques importantes et réelles entre le ${categorieDoc.toUpperCase()} et le programme.
Ignore les faux positifs : synonymes acceptables, reformulations équivalentes, termes génériques, différences de forme sans impact technique.

Réponds UNIQUEMENT en JSON :
{
  "alertes": [
    {
      "message": "Description précise de l'omission ou incohérence technique, en citant les éléments des deux documents"
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
