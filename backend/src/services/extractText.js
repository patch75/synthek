const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const xlsx = require('xlsx')
const fs = require('fs')
const path = require('path')
const { extractTextVision } = require('./extractVision')

const SEUIL_VISION = 200

async function extractText(filePath, fileType, nomDocument) {
  const buffer = fs.readFileSync(filePath)

  if (fileType === 'pdf') {
    const data = await pdfParse(buffer)
    const texteUtile = data.text.replace(/\s/g, '').length

    if (texteUtile < SEUIL_VISION) {
      console.log(`[extractText] PDF graphique détecté (${texteUtile} chars utiles < ${SEUIL_VISION}), fallback Vision`)
      try {
        const texteVision = await extractTextVision(filePath, nomDocument || path.basename(filePath))
        if (texteVision.trim().length > 0) return texteVision
      } catch (err) {
        console.error('[extractText] Erreur Vision, fallback texte brut :', err.message)
      }
    }

    return data.text
  }

  if (fileType === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (fileType === 'xlsx') {
    const workbook = xlsx.read(buffer, { type: 'buffer' })
    let text = ''
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      text += `\n=== Feuille: ${sheetName} ===\n`
      text += xlsx.utils.sheet_to_csv(sheet)
    }
    return text
  }

  return ''
}

module.exports = { extractText }
