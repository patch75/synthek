require('dotenv').config()
const express = require('express')
const cors = require('cors')

const authRoutes = require('./routes/auth')
const projetsRoutes = require('./routes/projets')
const documentsRoutes = require('./routes/documents')
const alertesRoutes = require('./routes/alertes')
const iaRoutes = require('./routes/ia')
const visasRoutes = require('./routes/visas')
const usersRoutes = require('./routes/users')
const syntheseRoutes = require('./routes/syntheses')
const reglementationRoutes = require('./routes/reglementation')
const typologiesRoutes = require('./routes/typologies')
const vocabulaireGlobalRoutes = require('./routes/vocabulaireGlobal')

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/auth', authRoutes)
app.use('/projets', projetsRoutes)
app.use('/documents', documentsRoutes)
app.use('/alertes', alertesRoutes)
app.use('/ia', iaRoutes)
app.use('/visas', visasRoutes)
app.use('/users', usersRoutes)
app.use('/syntheses', syntheseRoutes)
app.use('/reglementation', reglementationRoutes)
app.use('/typologies', typologiesRoutes)
app.use('/vocabulaire-global', vocabulaireGlobalRoutes)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Erreur serveur' })
})

module.exports = app
