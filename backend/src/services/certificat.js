const PDFDocument = require('pdfkit')
const crypto = require('crypto')
const fs = require('fs')
const prisma = require('../lib/prisma')

// Calcule le hash SHA-256 d'un fichier
function hashFichier(cheminFichier) {
  try {
    const contenu = fs.readFileSync(cheminFichier)
    return crypto.createHash('sha256').update(contenu).digest('hex')
  } catch {
    return null
  }
}

// Génère un certificat PDF scellé pour un projet
async function genererCertificat(projetId) {
  const projet = await prisma.projet.findUnique({
    where: { id: projetId },
    include: {
      documents: {
        include: {
          user: { select: { nom: true } },
          visas: {
            include: { user: { select: { nom: true, role: true } } },
            orderBy: { dateVisa: 'desc' }
          }
        },
        orderBy: { dateDepot: 'asc' }
      }
    }
  })

  if (!projet) throw new Error('Projet non trouvé')

  const dateGeneration = new Date()
  const donneesSignature = {
    projetId,
    nom: projet.nom,
    phase: projet.phase,
    dateGeneration: dateGeneration.toISOString(),
    documents: projet.documents.map(d => ({
      id: d.id,
      nom: d.nom,
      hash: hashFichier(d.cheminFichier)
    }))
  }

  const signatureGlobale = crypto
    .createHash('sha256')
    .update(JSON.stringify(donneesSignature))
    .digest('hex')

  // Génération du PDF
  const doc = new PDFDocument({ margin: 50 })
  const chunks = []
  doc.on('data', chunk => chunks.push(chunk))

  // En-tête
  doc.fontSize(20).font('Helvetica-Bold').text('CERTIFICAT DE JALONS synthek', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(12).font('Helvetica').text(`Projet : ${projet.nom}`, { align: 'center' })
  doc.text(`Client : ${projet.client}`, { align: 'center' })
  doc.text(`Phase : ${projet.phase}`, { align: 'center' })
  doc.text(`Généré le : ${dateGeneration.toLocaleString('fr-FR')}`, { align: 'center' })
  doc.moveDown()

  // Ligne séparatrice
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
  doc.moveDown()

  // Section documents et visas
  doc.fontSize(14).font('Helvetica-Bold').text('DOCUMENTS VALIDÉS')
  doc.moveDown(0.5)

  for (const document of projet.documents) {
    const hash = hashFichier(document.cheminFichier)
    doc.fontSize(11).font('Helvetica-Bold').text(`• ${document.nom}`)
    doc.fontSize(9).font('Helvetica')
    doc.text(`  Type : ${document.type.toUpperCase()} | Version : ${document.version} | Déposé par : ${document.user.nom}`)
    doc.text(`  Date de dépôt : ${new Date(document.dateDepot).toLocaleString('fr-FR')}`)
    if (hash) {
      doc.text(`  SHA-256 : ${hash}`, { characterSpacing: -0.3 })
    }

    if (document.visas.length > 0) {
      doc.moveDown(0.2)
      doc.fontSize(9).font('Helvetica-Bold').text('  Visas :')
      for (const visa of document.visas) {
        const actionEmoji = visa.action === 'FAVORABLE' ? '✓' : visa.action === 'DEFAVORABLE' ? '✗' : '~'
        const actionLabel = visa.action === 'FAVORABLE' ? 'FAVORABLE' : visa.action === 'AVEC_RESERVES' ? 'AVEC RÉSERVES' : visa.action === 'DEFAVORABLE' ? 'DÉFAVORABLE' : visa.action.toUpperCase()
        doc.fontSize(9).font('Helvetica').text(
          `    ${actionEmoji} ${actionLabel} — ${visa.user.nom} (${visa.user.role}) — ${new Date(visa.dateVisa).toLocaleString('fr-FR')}${visa.commentaire ? ` : "${visa.commentaire}"` : ''}`
        )
      }
    } else {
      doc.fontSize(9).font('Helvetica').text('  Aucun visa enregistré')
    }
    doc.moveDown(0.5)
  }

  // Signature globale
  doc.moveDown()
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()
  doc.moveDown()
  doc.fontSize(10).font('Helvetica-Bold').text('SIGNATURE GLOBALE DU CERTIFICAT (SHA-256) :')
  doc.fontSize(9).font('Helvetica').text(signatureGlobale, { characterSpacing: -0.3 })
  doc.moveDown()
  doc.fontSize(8).font('Helvetica').fillColor('grey')
    .text('Ce certificat est généré automatiquement par synthek. La signature globale garantit l\'intégrité de l\'ensemble des données au moment de la génération.', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(7).font('Helvetica-Oblique').fillColor('#888888')
    .text('Ce certificat est un outil de traçabilité interne uniquement. Il ne constitue pas une preuve juridique opposable et ne se substitue pas aux documents contractuels signés par les parties.', { align: 'center' })

  doc.end()

  return new Promise((resolve) => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks)
      resolve({ pdfBuffer, signatureGlobale, dateGeneration })
    })
  })
}

module.exports = { genererCertificat, hashFichier }
