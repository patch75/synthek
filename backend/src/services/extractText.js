const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const ExcelJS = require('exceljs')
const XLSX = require('xlsx')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { extractTextVision } = require('./extractVision')

const SEUIL_VISION = 200
const PARSER_URL = { host: '127.0.0.1', port: 5001 }

/**
 * Appelle le microservice Python pour un parsing amélioré.
 * Retourne null si le service est indisponible (fallback automatique sur Node).
 */
async function callParserService(endpoint, buffer) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ content: buffer.toString('base64') })
    const options = {
      ...PARSER_URL,
      path: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve(parsed.texte || null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}

async function extractText(filePath, fileType, nomDocument) {
  const buffer = fs.readFileSync(filePath)

  if (fileType === 'pdf') {
    // Essayer le parser Python (pdfplumber) en priorité
    const textePython = await callParserService('/parse/pdf', buffer)
    if (textePython && textePython.replace(/\s/g, '').length > SEUIL_VISION) {
      console.log(`[extractText] PDF parsé via service Python (${textePython.length} chars)`)
      return textePython
    }

    // Fallback Node
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
    // Essayer le parser Python (python-docx avec styles Heading) en priorité
    const textePython = await callParserService('/parse/docx', buffer)
    if (textePython && textePython.length > 100) {
      console.log(`[extractText] DOCX parsé via service Python (${textePython.length} chars)`)
      return textePython
    }

    // Fallback mammoth
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (fileType === 'xlsx') {
    // Essayer le parser Python (openpyxl avec hiérarchie parent/enfant) en priorité
    const textePython = await callParserService('/parse/xlsx', buffer)
    if (textePython && textePython.length > 100) {
      console.log(`[extractText] XLSX parsé via service Python (${textePython.length} chars)`)
      return textePython
    }

    // Fallback ExcelJS
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    let text = ''
    workbook.eachSheet((sheet) => {
      text += `\n=== Feuille: ${sheet.name} ===\n`
      sheet.eachRow((row) => {
        text += row.values.slice(1).join(',') + '\n'
      })
    })
    return text
  }

  if (fileType === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    let text = ''
    for (const sheetName of workbook.SheetNames) {
      text += `\n=== Feuille: ${sheetName} ===\n`
      const sheet = workbook.Sheets[sheetName]
      text += XLSX.utils.sheet_to_csv(sheet)
    }
    return text
  }

  return ''
}

module.exports = { extractText }
