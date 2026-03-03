require('dotenv').config()
const app = require('./src/app')

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Serveur synthek démarré sur http://localhost:${PORT}`)
})
