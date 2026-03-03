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
