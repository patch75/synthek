# KB_SYNC — Synthek
# Généré automatiquement à chaque push sur main
# 2026-03-24 20:38 UTC

---
## CLAUDE.md
```
# Synthek — Contexte projet pour Claude

## Description
Application web de vérification documentaire pour BET thermique (bureaux d'études thermiques).
Analyse et compare automatiquement des documents techniques (Programmes, CCTP, DPGF) via l'API Anthropic.

## Stack technique
- **Frontend** : React + Vite, servi par Nginx
- **Backend** : Node.js + Express, géré par PM2 (port 3000)
- **Base de données** : PostgreSQL (Docker) + Prisma ORM
- **IA** : API Anthropic — Sonnet 4.6 (précis), Haiku 4.5 (rapide)
- **Parser Service** : Python Flask (port 5001) — parsing Excel/PDF + appels Sonnet

## Structure du projet
```
synthek/
├── frontend/        # React + Vite
│   └── src/
│       ├── pages/   # Dashboard.jsx, Projet.jsx, Upload.jsx, Chat.jsx
│       └── services/api.js  # baseURL = /api en prod
├── backend/
│   ├── routes/      # API Express — projets.js, documents.js, alertes.js...
│   ├── services/    # comparerDocuments.js, extractFaits.js, ia.js
│   └── prisma/      # schema.prisma + migrations
├── parser-service/  # Python Flask port 5001
│   ├── main.py      # Routes Flask : /granulometrie/proposer, /granulometrie/import
│   └── extraire_granulometrie.py  # Pipeline LLM granulométrie
└── setup-local.sh   # À lancer après chaque git pull
```

## Développement local — après git pull
```bash
./setup-local.sh
```
Fait : `npm install` + `prisma generate` + `prisma migrate deploy`

Lancer les services :
```bash
# Parser Python
cd parser-service && PYTHONIOENCODING=utf-8 PYTHONUNBUFFERED=1 python main.py

# Backend
cd backend && node server.js

# Frontend
cd frontend && npm run dev
```

## Base de données — IMPORTANT
- Utiliser `prisma migrate deploy` (pas `prisma db push`) pour appliquer les migrations
- Toujours créer une migration SQL dans `prisma/migrations/` pour tout changement de schéma
- Table `Batiment` : créée via migration `20260323000001_batiment_souprogramme`

Tables principales : `User`, `Projet`, `ProjetUser`, `Document`, `Alerte`, `AlerteDocument`,
`MessageIA`, `Puce`, `Visa`, `Synthese`, `ReglementationRef`, `ConfigProjet`,
`DecisionArbitrage`, `SousProgramme`, `Batiment`, `FaitDocument`, `TypologiePersonnalisee`, `VocabulaireGlobal`

## Architecture IA

### Déclenchement automatique à l'upload
- Haiku génère une **puce** (`genererPuce`) + extrait des **faits** (`extraireFaits`) en background
- Upload CCTP/DPGF → comparaison automatique vs programmes de référence

### Hiérarchie documentaire SYNTHEK-LABS (7 niveaux — ordre de vérité décroissant)
1. PLUi / PLU
2. RE2020 + paliers 2022/2025/2028 (selon date dépôt PC)
3. RICT
4. Notice descriptive
5. CCTP
6. DPGF
7. ACV / Annexe 18

En cas de conflit : le niveau supérieur prime — à signaler explicitement.

### Catégories documentaires (`categorieDoc`)
Valeurs : `programme`, `cctp`, `dpgf`, `plans`, `pieces_ecrites`, `etudes_th`, `bureau_controle`, `notes_calcul`, `comptes_rendus`, `autre`

### Sous-programmes (multi-typologies)
- Table `SousProgramme` (id, projetId, nom) — ex: "Villas", "Bâtiments AB", "Social"
- `Document.sousProgrammeId` FK nullable → permet comparaisons ciblées par périmètre
- Routes : GET/POST/PATCH/DELETE `/projets/:id/sous-programmes`

## Pipeline Granulométrie (import fichier architecte)

### Architecture 2 appels
```
Appel 1 — POST /projets/:id/granulometrie/proposer
  → Parser extrait texte Excel (format positionnel)
  → Sonnet 4.6 retourne JSON D1 (batiments, nos_comptes, financements)
  → Frontend affiche proposition — utilisateur édite

Appel 2 — POST /projets/:id/granulometrie/import
  → Validation + merge intelligent BDD (parents→subdivisions)
  → Table Batiment mise à jour
```

### Format dump Excel (positionnel groupé par ligne)
```
L01 | col00=BATIMENT | col02=A1 | col05=A2 | col14=B | col23=C (LLS)
L02 | col00=NIVEAU | col02=RDC | col03=R+1 | col05=RDC
L03 | col00=N° | col02=001 | col03=101 (BRS) | col05=001 | col06=002
```
- `col00` = colonne A (index 0-based)
- Gaps entre indices = cellules vides
- Floats et dates filtrés automatiquement

### nos_comptes — mécanisme anti-hallucination
- Sonnet liste exhaustivement tous les N° de logements lus par bâtiment
- `nb_logements = len(nos_comptes)` — règle absolue
- Annotations : `(LLS)`, `(BRS)`, `(LLI)` dans les N°s → dérive financements
- Financement global : si nom bâtiment contient `(LLS)` → tous libres = LLS
- PREMIUM = dernier niveau montée sans annotation sociale
- VILLA = numéros 1-2 chiffres après section VILLAS

### Dérivation financements (Python — _verifier_et_corriger_batiments)
- Si somme Sonnet (LLI+LLS+BRS+std+premium+villas) == nb_logements → garder Sonnet
- Sinon → recalculer depuis annotations nos_comptes
- Warning `[NOS-R1]` si nb_logements corrigé
- Warning `[FIN-DERIVE]` si financements recalculés

### Format JSON D1 (sortie)
```json
{
  "batiments": [{
    "nom": "A", "montees": ["A1","A2"],
    "nos_comptes": ["001","101 (BRS)"],
    "nb_logements": 2, "LLI": null, "LLS": null, "BRS": 1,
    "acces_std": 1, "acces_premium": null, "villas": 0,
    "fiabilite": "haute"
  }],
  "total_logements": 49
}
```

### Règles métier granulométrie
- Résultat fiable ou null — jamais de valeur fausse
- Python compte mécaniquement (robuste), Sonnet lit sémantiquement (intelligent)
- `nos_comptes` est la source de vérité pour les financements
- N° 001/101/201 légitimement répétés dans chaque bâtiment (RDC/R+1/R+2) — pas des doublons

## Agents SYNTHEK-LABS

### Identité
SYNTHEK-LABS est un moteur d'analyse documentaire spécialisé en ingénierie du bâtiment,
conçu par un ingénieur BET Fluides senior (30 ans d'expérience MOE).

### Principe fondateur — Architecture multi-agents
Règle absolue : le résultat final n'est jamais un agrégat exhaustif.
C'est une **sélection priorisée** — 3 alertes critiques + synthèse projet.
La valeur est dans la réduction, pas dans l'exhaustivité.

### Agent MOE EXE — Chef d'orchestre
Produit dans l'ordre :
1. Description synthétique du projet (programme, typologies, systèmes retenus)
2. Synthèse prestations lot VRD
3. Synthèse prestations lot Fluides
4. **3 alertes critiques priorisées** — sélectionnées parmi toutes les sorties agents
5. Questions de coordination inter-lots

Ne produit jamais plus de 3 alertes — sélectionne, ne compile pas.
Si deux agents sont en contradiction : signale la contradiction, n'arbitre pas techniquement.

### Agents spécialisés — Règles

**FLUIDES** — CVC, plomberie, VMC, ECS, désenfumage
- Règles : cohérence système chauffage/émetteurs/générateur, type VMC vs RE2020, production ECS
- Désenfumage : overlap explicite avec SÉCURITÉ INCENDIE — les deux agents peuvent alerter. MOE EXE arbitre.

**THERMICIEN** — RE2020, Bbio, Cep, ICénergie, paliers 2022/2025/2028
- Règles : palier applicable selon date dépôt PC, cohérence solution CCTP vs étude thermique
- COP PAC vs palier, VMC double flux rendement échangeur
- Alertes BLOQUANT si non-conformité réglementaire

**ÉCONOMISTE** — Cohérence contractuelle CCTP↔DPGF (périmètre strict — jamais de valorisation €)
- Règles : lot présent CCTP absent DPGF, prestation orpheline DPGF, unités incohérentes
- Lignes "conforme au CCTP" sur postes critiques = alerte systématique

**VRD** — EU/EP, branchements, voirie, rétention EP
- Produit aussi : synthèse description prestations lot VRD pour MOE EXE

**SÉCURITÉ INCENDIE** — Désenfumage réglementaire, compartimentage, recoupement gaines, portes CF, colonnes sèches, classement ERP/habitation/IGH
- Overlap assumé avec FLUIDES sur désenfumage — MOE EXE gère la contradiction

**RÉGLEMENTATION** — DTU applicables, accessibilité PMR, cheminements, sanitaires adaptés, hauteurs équipements
- Documents : Notice, CCTP, RICT

**ACOUSTIQUE** — Isolement DnTA, doublages, fourreaux antivibratoires, désolidarisation CVC, vitesses d'air gaines
- Valeur métier : contentieux récurrent en réception logement collectif

**STRUCTURE** — Béton armé, fondations, rupteurs thermiques, sismique, interfaces réservations fluides/structure

**ACV** — FDES, Inies, ICconstruction, matériaux biosourcés (niveau 7 — alertes MINEURES sauf contradiction niveaux supérieurs)

**URBANISME** — PLUi/PLU déclaratif uniquement
- Limite : pas d'accès au PLUi réel — toute alerte accompagnée de "À vérifier contre le PLUi en vigueur — non opposable sans lecture du document source"
- Alertes systématiquement BLOQUANT si conflit détecté

### Agents V3 — NON ACTIFS en V2
ARCHITECTURE, PLANS, DIMENSIONNEMENT : non activés.
DIMENSIONNEMENT limité en V2 à : détection d'absence de note de calcul (alerte MINEUR).

### Dictionnaire de normalisation (équivalences — pas d'écart technique)
CTA=UTA | VMC=extraction mécanique | PAC=heat pump | PLT=plancher chauffant
ECS=eau chaude sanitaire | TGBT=armoire électrique principale | ITE=isolation extérieure

### 6 Synthèses automatisées
A: Notice/CCTP | B: Notice/DPGF | C: CCTP/DPGF lot par lot
D: RICT/CCTP | E: Étude thermique/CCTP | F: Matériaux ACV/CCTP

### Format de sortie systématique
**Synthèse exécutive MOE EXE :** description projet (5 lignes max) + 3 alertes critiques.

**Tableau des écarts par agent :**
| Agent | Réf. Doc A | Réf. Doc B | Écart constaté | Gravité | Intervenant |

**Registre :** date d'analyse, documents comparés, agents activés, version analysée.

### Règles fondamentales
1. Jamais d'écart sans ancrage textuel explicite dans l'un des deux documents comparés
2. Gravité : BLOQUANT (non-conformité réglementaire) / MAJEUR (impact exécution/coût) / MINEUR (imprécision)
3. Signaler, ne pas corriger. Signaler l'absence, ne pas inventer.
4. Écart de terminologie seul = MINEUR ou ignoré
5. MOE EXE ne produit jamais plus de 3 alertes critiques — sélectionne, ne compile pas

### CE QUE SYNTHEK-LABS N'EST PAS — V2
- Pas un contrôleur technique (pas de RICT)
- Pas un juriste
- Ne valide pas les plans (V3)
- Pas d'accès au CSTB Reef / DTU en temps réel — le signaler si vérification DTU nécessaire
- Ne vérifie pas les métrés ni les quantités
- Ne valorise jamais en € — jamais
- Ne garantit pas la conformité PLUi sans lecture du document source

## UI Projet.jsx — structure
- **Alertes** : accordéons par sous-programme, filtres criticité, boutons Résoudre + Supprimer
- **Bâtiments & Granulométrie** : table D1 (montées, LLI/LLS/BRS/accession/villas, fiabilité)
- **Programmes de référence** : accordéons par sous-programme
- **Documents** : tableau (Nom, Catégorie, Périmètre, Puce IA, Date, Actions)
- Modal "Relancer comparaison" : checkboxes sous-programmes + switch Haiku/Sonnet

## Comparaison CCTP/DPGF
- Switch Haiku (rapide) / Sonnet (précis) — défaut : Sonnet (moins de faux positifs)
- Avant chaque comparaison : suppression des anciennes alertes du même label
- Label alertes : `[CCTP vs Programme — NomSousProgramme]`

## Formats de fichiers supportés
- PDF texte → optimal
- DOCX → bon (mammoth)
- XLSX → bon pour DPGF + granulométrie architecte
- PDF scanné → fallback Vision IA
- DOC → **non supporté** (demander .docx)

## Rôles utilisateurs
- `admin`, `bet_thermique`, `moa`, `architecte`, `bet_fluides`, `bet_structure`, etc.
- Les projets sont filtrés par membres — l'admin doit être invité explicitement

## Dépendances notables
- `pdf-parse` : fixé à v1.1.1 (v2 incompatible)
- `xlsx` (SheetJS v0.18.5) : pour .xls uniquement
- `exceljs` : pour .xlsx
- Rate limit Anthropic : 10 000 tokens/min → TEXTE_MAX=12000 chars dans extractFaits.js
- `openpyxl` : parsing Excel granulométrie (Python)
- `pdfplumber` : parsing PDF granulométrie (Python)

## Déploiement
```bash
./deploy.sh "fix: description du changement"
```

## Communication
- Répondre en **français**
- Garder les solutions simples et directes
- Éviter l'over-engineering
- Résultat fiable ou null — jamais de valeur fausse (règle métier BET)
```

---
## backend/src/routes/projets.js
```
const express = require('express')
const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { genererCertificat } = require('../services/certificat')
const { questionIA } = require('../services/ia')

const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || './storage')

const router = express.Router()
router.use(authMiddleware)

// GET /projets — liste les projets de l'utilisateur connecté
router.get('/', async (req, res) => {
  const projets = await prisma.projet.findMany({
    where: { membres: { some: { userId: req.user.id } } },
    include: {
      membres: { include: { user: { select: { id: true, nom: true, email: true, role: true } } } },
      _count: { select: { documents: true, alertes: { where: { statut: 'active' } } } }
    }
  })
  res.json(projets)
})

// POST /projets — créer un projet (V3 : champs enrichis + arborescence stockage)
router.post('/', async (req, res) => {
  const {
    nom, client, typeBatiment, nombreNiveaux, shon, energieRetenue,
    zoneClimatique, classementErp, typeErp, nombreLogements, adresse,
    batimentsComposition
  } = req.body

  if (!nom || !client) {
    return res.status(400).json({ error: 'Nom et client requis' })
  }

  // Validations V3
  const typesValides = ['logements_collectifs', 'bureaux', 'erp', 'industrie', 'mixte']
  if (typeBatiment && !typesValides.includes(typeBatiment)) {
    return res.status(400).json({ error: `typeBatiment invalide. Valeurs : ${typesValides.join(', ')}` })
  }

  const energiesValides = ['gaz', 'electricite', 'pac', 'geothermie', 'bois', 'mixte']
  if (energieRetenue && !energiesValides.includes(energieRetenue)) {
    return res.status(400).json({ error: `energieRetenue invalide. Valeurs : ${energiesValides.join(', ')}` })
  }

  const zonesValides = ['H1a', 'H1b', 'H1c', 'H2a', 'H2b', 'H2c', 'H2d', 'H3']
  if (zoneClimatique && !zonesValides.includes(zoneClimatique)) {
    return res.status(400).json({ error: `zoneClimatique invalide. Valeurs : ${zonesValides.join(', ')}` })
  }

  if (classementErp && !typeErp) {
    return res.status(400).json({ error: 'typeErp requis si classementErp est activé' })
  }

  const typesResidentiels = ['logements_collectifs', 'mixte']
  if (typeBatiment && typesResidentiels.includes(typeBatiment) && !nombreLogements) {
    return res.status(400).json({ error: 'nombreLogements requis pour un bâtiment résidentiel' })
  }

  const data = {
    nom,
    client,
    membres: { create: { userId: req.user.id, role: 'admin' } }
  }

  if (typeBatiment) data.typeBatiment = typeBatiment
  if (nombreNiveaux != null) data.nombreNiveaux = parseInt(nombreNiveaux)
  if (shon != null) data.shon = parseFloat(shon)
  if (energieRetenue) data.energieRetenue = energieRetenue
  if (zoneClimatique) data.zoneClimatique = zoneClimatique
  if (classementErp != null) data.classementErp = !!classementErp
  if (typeErp) data.typeErp = typeErp
  if (nombreLogements != null) data.nombreLogements = parseInt(nombreLogements)
  if (adresse) data.adresse = adresse
  if (batimentsComposition) data.batimentsComposition = batimentsComposition

  const projet = await prisma.projet.create({ data })

  // Créer l'arborescence de stockage (Bloc 6)
  const projetDir = path.join(STORAGE_ROOT, 'projets', String(projet.id))
  const sousDossiers = [
    'architecte', 'bet_fluides', 'bet_thermique', 'bet_structure',
    'bet_electricite', 'bet_vrd', 'bet_geotechnique', 'economiste',
    'moa', 'assistant_moa', 'bet_hqe', 'acousticien', 'bureau_controle'
  ]
  fs.mkdirSync(projetDir, { recursive: true })
  for (const d of sousDossiers) {
    fs.mkdirSync(path.join(projetDir, d), { recursive: true })
  }

  // Générer config.json initial
  const configJson = {
    projetId: projet.id,
    nom: projet.nom,
    client: projet.client,
    typeBatiment: projet.typeBatiment || null,
    zoneClimatique: projet.zoneClimatique || null,
    energieRetenue: projet.energieRetenue || null,
    adresse: projet.adresse || null,
    dateCreation: projet.dateCreation
  }
  fs.writeFileSync(path.join(projetDir, 'config.json'), JSON.stringify(configJson, null, 2))

  res.status(201).json(projet)
})

// GET /projets/:id — détail d'un projet
router.get('/:id', async (req, res) => {
  const projet = await prisma.projet.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      membres: { include: { user: { select: { id: true, nom: true, email: true, role: true } } } },
      documents: {
        orderBy: { dateDepot: 'desc' },
        include: {
          user: { select: { nom: true, email: true } },
          puce: true,
          sousProgramme: { select: { id: true, nom: true } }
        }
      },
      alertes: { where: { statut: 'active' }, orderBy: { dateCreation: 'desc' } },
      sousProgrammes: { orderBy: { nom: 'asc' } },
      batiments: { orderBy: { nom: 'asc' } }
    }
  })
  if (!projet) return res.status(404).json({ error: 'Projet non trouvé' })
  res.json(projet)
})

// GET /projets/:id/sous-programmes
router.get('/:id/sous-programmes', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const sps = await prisma.sousProgramme.findMany({ where: { projetId }, orderBy: { position: 'asc' } })
  res.json(sps)
})

// POST /projets/:id/sous-programmes
router.post('/:id/sous-programmes', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { nom, typologies } = req.body
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  const count = await prisma.sousProgramme.count({ where: { projetId } })
  const sp = await prisma.sousProgramme.create({
    data: {
      projetId,
      nom: nom.trim(),
      typologies: typologies?.length ? JSON.stringify(typologies) : null,
      position: count
    }
  })
  res.status(201).json(sp)
})

// PATCH /projets/:id/sous-programmes/ordre — réordonner (DOIT être avant /:spId)
router.patch('/:id/sous-programmes/ordre', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { ordre } = req.body // tableau d'ids dans le nouvel ordre
  if (!Array.isArray(ordre)) return res.status(400).json({ error: 'ordre requis (tableau d\'ids)' })
  await Promise.all(ordre.map((spId, index) =>
    prisma.sousProgramme.update({ where: { id: spId }, data: { position: index } })
  ))
  res.json({ ok: true })
})

// PATCH /projets/:id/sous-programmes/:spId — renommer / mettre à jour typologies
router.patch('/:id/sous-programmes/:spId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { nom, typologies } = req.body
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  const data = { nom: nom.trim() }
  if (typologies !== undefined) data.typologies = typologies?.length ? JSON.stringify(typologies) : null
  const sp = await prisma.sousProgramme.update({ where: { id: parseInt(req.params.spId) }, data })
  res.json(sp)
})

// DELETE /projets/:id/sous-programmes/:spId
router.delete('/:id/sous-programmes/:spId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.sousProgramme.delete({ where: { id: parseInt(req.params.spId) } })
  res.json({ message: 'Sous-programme supprimé' })
})

// PATCH /projets/:id — modifier le projet (admin only)
router.patch('/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { nom, client, metadonnees, batimentsComposition } = req.body

  const data = {}
  if (nom?.trim()) data.nom = nom.trim()
  if (client?.trim()) data.client = client.trim()
  if (metadonnees !== undefined) data.metadonnees = metadonnees ? JSON.stringify(metadonnees) : null
  if (batimentsComposition !== undefined) data.batimentsComposition = batimentsComposition || null

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Aucune donnée à modifier' })

  const projet = await prisma.projet.update({ where: { id: projetId }, data })
  res.json(projet)
})

// PATCH /projets/:id/phase — changer la phase du projet
router.patch('/:id/phase', async (req, res) => {
  const { phase } = req.body
  const phases = ['APS', 'APD', 'PRO', 'DCE', 'EXE']
  if (!phase || !phases.includes(phase)) {
    return res.status(400).json({ error: `Phase invalide. Valeurs acceptées : ${phases.join(', ')}` })
  }

  const projetId = parseInt(req.params.id)

  // Bloquer le passage en EXE s'il y a des alertes actives
  if (phase === 'EXE') {
    const alertesActives = await prisma.alerte.count({ where: { projetId, statut: 'active' } })
    if (alertesActives > 0) {
      await prisma.projet.update({
        where: { id: projetId },
        data: { bloqueExe: true, raisonBlocage: `${alertesActives} alerte(s) non résolue(s)` }
      })
      return res.status(409).json({
        error: `Passage en phase EXE impossible : ${alertesActives} alerte(s) non résolue(s)`,
        bloqueExe: true
      })
    }
  }

  const projet = await prisma.projet.update({
    where: { id: projetId },
    data: { phase, bloqueExe: false, raisonBlocage: null }
  })
  res.json(projet)
})

// GET /projets/:id/config — lire la config projet (Bloc 2 + 6)
router.get('/:id/config', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const config = await prisma.configProjet.findUnique({ where: { projetId } })
  res.json(config || {})
})

// POST /projets/:id/config — créer/mettre à jour la config projet (Bloc 2 + 6)
router.post('/:id/config', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const { promptSystemeGlobal, seuilsTolerance, vocabulaireMetier, valeursReference, conventionNommage } = req.body

  const data = { projetId }
  if (promptSystemeGlobal !== undefined) data.promptSystemeGlobal = promptSystemeGlobal
  if (seuilsTolerance !== undefined) data.seuilsTolerance = seuilsTolerance
  if (vocabulaireMetier !== undefined) data.vocabulaireMetier = vocabulaireMetier
  if (valeursReference !== undefined) data.valeursReference = valeursReference
  if (conventionNommage !== undefined) data.conventionNommage = conventionNommage

  const config = await prisma.configProjet.upsert({
    where: { projetId },
    create: data,
    update: data
  })

  // Synchroniser config.json sur disque
  const projetDir = path.join(STORAGE_ROOT, 'projets', String(projetId))
  if (fs.existsSync(projetDir)) {
    const projet = await prisma.projet.findUnique({ where: { id: projetId } })
    const configJson = {
      projetId,
      nom: projet?.nom,
      client: projet?.client,
      typeBatiment: projet?.typeBatiment || null,
      zoneClimatique: projet?.zoneClimatique || null,
      energieRetenue: projet?.energieRetenue || null,
      adresse: projet?.adresse || null,
      configIA: {
        promptSystemeGlobal: config.promptSystemeGlobal,
        seuilsTolerance: config.seuilsTolerance,
        vocabulaireMetier: config.vocabulaireMetier,
        valeursReference: config.valeursReference,
        conventionNommage: config.conventionNommage
      }
    }
    fs.writeFileSync(path.join(projetDir, 'config.json'), JSON.stringify(configJson, null, 2))
  }

  res.json(config)
})

// DELETE /projets/:id — supprimer un projet (admin global seulement)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Réservé aux administrateurs' })
  }

  const projet = await prisma.projet.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!projet) return res.status(404).json({ error: 'Projet non trouvé' })

  await prisma.projet.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ message: 'Projet supprimé' })
})

// POST /projets/:id/membres — inviter un expert par email
router.post('/:id/membres', async (req, res) => {
  const { email, role } = req.body
  const projetId = parseInt(req.params.id)

  if (!email) return res.status(400).json({ error: 'Email requis' })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return res.status(404).json({ error: 'Aucun compte avec cet email' })

  const existe = await prisma.projetUser.findUnique({
    where: { userId_projetId: { userId: user.id, projetId } }
  })
  if (existe) return res.status(409).json({ error: 'Déjà membre du projet' })

  const membre = await prisma.projetUser.create({
    data: { userId: user.id, projetId, role: role || 'expert' },
    include: { user: { select: { id: true, nom: true, email: true } } }
  })
  res.status(201).json(membre)
})

// POST /projets/:id/certificat — générer un certificat PDF scellé
router.post('/:id/certificat', async (req, res) => {
  const projetId = parseInt(req.params.id)

  const { pdfBuffer, signatureGlobale, dateGeneration } = await genererCertificat(projetId)

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="certificat-projet-${projetId}-${Date.now()}.pdf"`,
    'X-Signature-SHA256': signatureGlobale,
    'X-Date-Generation': dateGeneration.toISOString()
  })
  res.send(pdfBuffer)
})

// POST /projets/:id/rapport-jalon — envoyer rapport + certificat au bureau de contrôle
router.post('/:id/rapport-jalon', async (req, res) => {
  const projetId = parseInt(req.params.id)
  const { jalon } = req.body // 'DCE' ou 'EXE'

  if (!jalon || !['DCE', 'EXE'].includes(jalon)) {
    return res.status(400).json({ error: 'Jalon invalide. Valeurs acceptées : DCE, EXE' })
  }

  const projet = await prisma.projet.findUnique({
    where: { id: projetId },
    include: {
      membres: {
        include: { user: { select: { nom: true, email: true, role: true } } }
      },
      alertes: { where: { statut: 'active' } },
      _count: { select: { documents: true, alertes: true } }
    }
  })
  if (!projet) return res.status(404).json({ error: 'Projet non trouvé' })

  // Trouver les membres bureau_controle
  const bureauControle = projet.membres
    .filter(m => m.user.role === 'bureau_controle')
    .map(m => m.user)

  if (bureauControle.length === 0) {
    return res.status(400).json({ error: 'Aucun membre bureau de contrôle sur ce projet' })
  }

  // Générer le certificat PDF
  const { pdfBuffer, signatureGlobale } = await genererCertificat(projetId)

  // Générer le rapport de synthèse IA
  const rapportIA = await questionIA(
    projetId,
    req.user.id,
    `Génère un rapport de synthèse complet pour le jalon ${jalon} du projet. Résume l'état des documents, les incohérences détectées, et la conformité réglementaire.`
  )

  // Envoi email
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT) || 1025,
    secure: false,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  })

  const destinataires = bureauControle.map(u => u.email).join(', ')

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'synthek@noreply.com',
    to: destinataires,
    subject: `[synthek] Rapport de jalon ${jalon} — Projet "${projet.nom}"`,
    html: `
      <h2>Rapport de jalon ${jalon}</h2>
      <p><strong>Projet :</strong> ${projet.nom}</p>
      <p><strong>Client :</strong> ${projet.client}</p>
      <p><strong>Phase actuelle :</strong> ${projet.phase}</p>
      <p><strong>Documents :</strong> ${projet._count.documents}</p>
      <p><strong>Alertes actives :</strong> ${projet._count.alertes}</p>
      <hr>
      <h3>Synthèse IA</h3>
      <pre style="white-space:pre-wrap">${rapportIA}</pre>
      <hr>
      <p><em>Certificat PDF scellé en pièce jointe (signature SHA-256 : ${signatureGlobale})</em></p>
    `,
    attachments: [{
      filename: `certificat-${jalon}-${projet.nom.replace(/\s+/g, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  })

  res.json({
    message: `Rapport jalon ${jalon} envoyé à ${bureauControle.length} bureau(x) de contrôle`,
    destinataires: bureauControle.map(u => u.email),
    signatureGlobale
  })
})

// POST /projets/:id/granulometrie/proposer — Étape 1 : propose le regroupement depuis fichier Excel
router.post('/:id/granulometrie/proposer', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { fichier, nom_fichier } = req.body
  if (!fichier || !nom_fichier) return res.status(400).json({ error: 'fichier (base64) et nom_fichier requis' })
  try {
    const response = await fetch('http://127.0.0.1:5001/granulometrie/proposer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fichier, nom_fichier })
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (e) {
    res.status(503).json({ error: 'Parser Python indisponible', detail: e.message })
  }
})

// POST /projets/:id/granulometrie/import — Étape 2 : confirme le regroupement et sauvegarde en BDD
router.post('/:id/granulometrie/import', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { fichier, nom_fichier, regroupement } = req.body
  if (!fichier || !nom_fichier || !regroupement) return res.status(400).json({ error: 'fichier, nom_fichier et regroupement requis' })
  try {
    const response = await fetch('http://127.0.0.1:5001/granulometrie/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fichier, nom_fichier, regroupement })
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    // Sauvegarder dans table Batiment — merge intelligent
    if (data.batiments?.length) {
      // Normalise : supprime le préfixe "BAT " pour comparer "BAT A" avec "A", "BAT E" avec "E1"/"E2"
      const norm = s => s.trim().toLowerCase().replace(/^bat\s+/i, '')
      const existants = await prisma.batiment.findMany({ where: { projetId } })
      const newNomsNorm = data.batiments.map(b => norm(b.nom))

      // Détection parents remplacés par subdivisions (comparaison normalisée)
      // Ex: "BAT A" norm="a" absent du nouveau fichier + "a1","a2" présents → supprimer "BAT A"
      const aSupprimer = existants.filter(e => {
        const n = norm(e.nom)
        const absent = !newNomsNorm.some(nn => nn === n)
        const nbSubdivisions = newNomsNorm.filter(nn => nn.startsWith(n) && nn.length > n.length).length
        return absent && nbSubdivisions >= 2
      })
      if (aSupprimer.length > 0) {
        await prisma.batiment.deleteMany({ where: { id: { in: aSupprimer.map(b => b.id) } } })
        console.log(`[granulometrie] Parents supprimés : ${aSupprimer.map(b => b.nom).join(', ')}`)
      }

      // Merge : update si existe (exact ou normalisé), create si nouveau
      // Ex: "B" dans nouveau fichier → matche "BAT B" en DB
      const existantsMaj = await prisma.batiment.findMany({ where: { projetId } })
      for (const b of data.batiments) {
        const bn = norm(b.nom)
        const existant = existantsMaj.find(e =>
          e.nom.trim().toLowerCase() === b.nom.trim().toLowerCase() || norm(e.nom) === bn
        )
        const payload = {
          nom: b.nom, // met à jour le nom avec la version courte si nécessaire
          montees: b.montees?.length ? JSON.stringify(b.montees) : null,
          nosComptes: b.nos_comptes?.length ? JSON.stringify(b.nos_comptes) : null,
          nbLogements: b.nb_logements ?? null,
          lli: b.LLI ?? 0, lls: b.LLS ?? 0, brs: b.BRS ?? 0,
          acceStd: b.acces_std ?? 0, accesPremium: b.acces_premium ?? 0,
          villas: b.villas ?? 0, fiabilite: b.fiabilite ?? null,
        }
        if (existant) {
          await prisma.batiment.update({ where: { id: existant.id }, data: payload })
        } else {
          await prisma.batiment.create({ data: { projetId, ...payload } })
        }
      }
    }
    // Garder batimentsComposition pour compatibilité affichage
    await prisma.projet.update({
      where: { id: projetId },
      data: { batimentsComposition: JSON.stringify(data.batiments) }
    })
    console.log(`[granulometrie] Projet ${projetId} : ${data.batiments?.length} bâtiments importés, ${data.total_logements} logements`)
    res.json(data)
  } catch (e) {
    res.status(503).json({ error: 'Parser Python indisponible', detail: e.message })
  }
})

// POST /projets/:id/batiments — ajouter un bâtiment manuellement
router.post('/:id/batiments', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { nom, montees, nbLogements, lli, lls, brs, acceStd, accesPremium, villas } = req.body
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  const bat = await prisma.batiment.create({
    data: {
      projetId,
      nom: nom.trim(),
      montees: Array.isArray(montees) && montees.length ? JSON.stringify(montees) : null,
      nbLogements: nbLogements != null ? parseInt(nbLogements) : null,
      lli: lli != null ? parseInt(lli) : 0,
      lls: lls != null ? parseInt(lls) : 0,
      brs: brs != null ? parseInt(brs) : 0,
      acceStd: acceStd != null ? parseInt(acceStd) : 0,
      accesPremium: accesPremium != null ? parseInt(accesPremium) : 0,
      villas: villas != null ? parseInt(villas) : 0,
    }
  })
  res.status(201).json(bat)
})

// PATCH /projets/:id/batiments/:batId — mapper section CCTP + feuilles DPGF
router.patch('/:id/batiments/:batId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const { sectionCctp, feuillesDpgf, montees, nbLogements, lli, lls, brs, acceStd, accesPremium, villas } = req.body
  const data = {}
  if (sectionCctp !== undefined) data.sectionCctp = sectionCctp || null
  if (feuillesDpgf !== undefined) data.feuillesDpgf = feuillesDpgf?.length ? JSON.stringify(feuillesDpgf) : null
  if (montees !== undefined) data.montees = Array.isArray(montees) && montees.length ? JSON.stringify(montees) : null
  if (nbLogements !== undefined) data.nbLogements = nbLogements !== null ? parseInt(nbLogements) : null
  if (lli !== undefined) data.lli = lli !== null ? parseInt(lli) : null
  if (lls !== undefined) data.lls = lls !== null ? parseInt(lls) : null
  if (brs !== undefined) data.brs = brs !== null ? parseInt(brs) : null
  if (acceStd !== undefined) data.acceStd = acceStd !== null ? parseInt(acceStd) : null
  if (accesPremium !== undefined) data.accesPremium = accesPremium !== null ? parseInt(accesPremium) : null
  if (villas !== undefined) data.villas = villas !== null ? parseInt(villas) : null
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Aucune donnée à modifier' })
  const bat = await prisma.batiment.update({ where: { id: parseInt(req.params.batId) }, data })
  res.json(bat)
})

// DELETE /projets/:id/batiments — supprimer tous les bâtiments (admin only)
router.delete('/:id/batiments', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.batiment.deleteMany({ where: { projetId: parseInt(req.params.id) } })
  res.json({ ok: true })
})

// DELETE /projets/:id/batiments/:batId — supprimer un bâtiment (admin only)
router.delete('/:id/batiments/:batId', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  await prisma.batiment.delete({ where: { id: parseInt(req.params.batId) } })
  res.json({ ok: true })
})

// PATCH /projets/:id/intervenants — mettre à jour les intervenants (admin only)
router.patch('/:id/intervenants', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' })
  const projetId = parseInt(req.params.id)
  const { intervenants } = req.body
  if (!Array.isArray(intervenants)) return res.status(400).json({ error: 'intervenants doit être un tableau' })
  const projet = await prisma.projet.update({
    where: { id: projetId },
    data: { intervenants: JSON.stringify(intervenants) }
  })
  res.json({ intervenants: JSON.parse(projet.intervenants || '[]') })
})

module.exports = router
```

---
## backend/src/routes/documents.js
```
const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { extractText } = require('../services/extractText')
const { genererPuce, comparerVersions } = require('../services/ia')
const { extraireFaits } = require('../services/extractFaits')
const { comparerAvecReference } = require('../services/comparerDocuments')
const { detecterLot } = require('../services/lotDetector')

const router = express.Router()
router.use(authMiddleware)

const fixFilename = (name) => Buffer.from(name, 'latin1').toString('utf8')

const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || './storage')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projetId = req.body.projetId
    if (projetId && req.user?.role) {
      const role = req.user.role === 'admin' ? 'moa' : req.user.role
      const dest = path.join(STORAGE_ROOT, 'projets', String(projetId), role)
      fs.mkdirSync(dest, { recursive: true })
      cb(null, dest)
    } else {
      cb(null, process.env.UPLOAD_DIR || './uploads')
    }
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${unique}${path.extname(fixFilename(file.originalname))}`)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.xlsx', '.xls']
    const ext = path.extname(fixFilename(file.originalname)).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('Type de fichier non supporté'))
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
})

// V3 — Bloc 3 : extraire statutDocument et indiceRevision du nom de fichier
// Convention : TYPE_INTERVENANT_vX_STATUT.ext
// STATUT : PRO=provisoire, VISA=pour_visa, VALID=valide
function parseNomFichier(nomFichier) {
  const sanExt = path.basename(nomFichier, path.extname(nomFichier))
  const parties = sanExt.split('_')

  let statutDocument = null
  let indiceRevision = null

  for (const partie of parties) {
    // Indice de révision : v1, v2, v3...
    if (/^v\d+$/i.test(partie)) {
      indiceRevision = partie.toLowerCase()
    }
    // Statut document
    const upper = partie.toUpperCase()
    if (upper === 'PRO') statutDocument = 'provisoire'
    else if (upper === 'VISA') statutDocument = 'pour_visa'
    else if (upper === 'VALID') statutDocument = 'valide'
  }

  return { statutDocument, indiceRevision }
}

function calculerHash(cheminFichier) {
  try {
    const contenu = fs.readFileSync(cheminFichier)
    return crypto.createHash('sha256').update(contenu).digest('hex')
  } catch {
    return null
  }
}

// POST /documents/upload
router.post('/upload', upload.single('fichier'), async (req, res) => {
  // Le bureau de contrôle ne peut pas déposer de documents
  if (req.user.role === 'bureau_controle') {
    return res.status(403).json({ error: 'Le bureau de contrôle est en lecture seule et ne peut pas déposer de documents' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Fichier requis' })
  }

  const { projetId, resumeModif, categorieDoc, sousProgrammeId, modeleIA } = req.body
  // IDs des sous-programmes sélectionnés pour la comparaison (tableau ou valeur unique)
  const comparerAvecSpsRaw = req.body['comparerAvecSps[]'] || req.body.comparerAvecSps
  const comparerAvecSps = comparerAvecSpsRaw
    ? (Array.isArray(comparerAvecSpsRaw) ? comparerAvecSpsRaw : [comparerAvecSpsRaw]).map(Number)
    : null
  if (!projetId) {
    return res.status(400).json({ error: 'projetId requis' })
  }

  const nomFichier = fixFilename(req.file.originalname)
  const ext = path.extname(nomFichier).toLowerCase().replace('.', '')

  // Calculer SHA-256 du fichier uploadé
  const hashNouveauFichier = calculerHash(req.file.path)

  // Chercher un document existant avec le même nom et projetId
  const docExistant = await prisma.document.findFirst({
    where: {
      projetId: parseInt(projetId),
      nom: nomFichier
    },
    orderBy: { version: 'desc' }
  })

  // Détection de doublon : même nom ET même hash ET fichier toujours présent sur disque
  if (docExistant && hashNouveauFichier && docExistant.hashFichier === hashNouveauFichier) {
    const cheminExistant = path.resolve(__dirname, '../../', docExistant.cheminFichier)
    if (fs.existsSync(cheminExistant)) {
      fs.unlinkSync(req.file.path)
      return res.status(200).json({
        doublon: true,
        message: 'Pas de modification détectée, fichier identique à la version précédente'
      })
    }
    // Fichier supprimé du disque → on permet le re-dépôt (ancienne entrée DB orpheline)
  }

  // Extraction du texte
  let contenuTexte = null
  try {
    contenuTexte = await extractText(req.file.path, ext, nomFichier)
  } catch (err) {
    console.error('Erreur extraction texte:', err.message)
  }

  // V3 — Bloc 3 : extraire statut et indice du nom de fichier
  const { statutDocument, indiceRevision } = parseNomFichier(nomFichier)

  // Détecter le lot automatiquement si CCTP ou DPGF
  const cat = categorieDoc || ''
  const lotDetecte = (cat === 'cctp' || cat === 'dpgf') ? detecterLot(nomFichier) : null

  // Construire les données du document
  const documentData = {
    projetId: parseInt(projetId),
    userId: req.user.id,
    nom: nomFichier,
    type: ext,
    cheminFichier: req.file.path,
    contenuTexte,
    resumeModif: resumeModif || null,
    hashFichier: hashNouveauFichier,
    statutDocument,
    indiceRevision,
    categorieDoc: categorieDoc || null,
    sousProgrammeId: sousProgrammeId ? parseInt(sousProgrammeId) : null,
    lotType: lotDetecte
  }

  // Si version précédente existe avec hash différent → nouvelle version
  if (docExistant) {
    documentData.versionPrecedenteId = docExistant.id
    documentData.version = docExistant.version + 1
  }

  const document = await prisma.document.create({ data: documentData })

  // Extraction puce + faits en background (analyse projet = manuelle)
  const pid = parseInt(projetId)
  const backgroundTasks = async () => {
    // 1. Puce + Faits en parallèle — analyse projet déclenchée manuellement
    await Promise.all([
      genererPuce(document.id, pid, contenuTexte, document.nom)
        .catch(err => console.error('Erreur génération puce:', err.message)),
      extraireFaits(document.id, pid, contenuTexte, document.nom)
        .catch(err => console.error('Erreur extraction faits:', err.message))
    ])

    // 2. Delta si version précédente (indépendant)
    if (docExistant && docExistant.contenuTexte) {
      comparerVersions(document.id, docExistant.id, contenuTexte, docExistant.contenuTexte, document.nom)
        .catch(err => console.error('Erreur comparaison versions:', err.message))
    }

  }
  backgroundTasks()  // sans await — non-bloquant

  res.status(201).json(document)
})

// PUT /documents/:id — mettre à jour un document existant (remplace le fichier, conserve l'ID)
router.put('/:id', upload.single('fichier'), async (req, res) => {
  const docId = parseInt(req.params.id)
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' })

  const doc = await prisma.document.findUnique({ where: { id: docId } })
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' })

  const nomFichier = fixFilename(req.file.originalname)
  const ext = path.extname(nomFichier).toLowerCase().replace('.', '')
  const hashNouveauFichier = calculerHash(req.file.path)

  // Supprimer l'ancien fichier du disque
  if (doc.cheminFichier) {
    const ancienChemin = path.resolve(__dirname, '../../', doc.cheminFichier)
    if (fs.existsSync(ancienChemin)) fs.unlinkSync(ancienChemin)
  }

  let contenuTexte = null
  try {
    contenuTexte = await extractText(req.file.path, ext, nomFichier)
  } catch (err) {
    console.error('Erreur extraction texte:', err.message)
  }

  const { statutDocument, indiceRevision } = parseNomFichier(nomFichier)
  const lotDetecte = (doc.categorieDoc === 'cctp' || doc.categorieDoc === 'dpgf') ? detecterLot(nomFichier) : null

  const updated = await prisma.document.update({
    where: { id: docId },
    data: {
      nom: nomFichier,
      type: ext,
      cheminFichier: req.file.path,
      contenuTexte,
      hashFichier: hashNouveauFichier,
      statutDocument,
      indiceRevision,
      lotType: lotDetecte || doc.lotType,
      puce: null
    }
  })

  const pid = doc.projetId
  ;(async () => {
    await Promise.all([
      genererPuce(updated.id, pid, contenuTexte, updated.nom)
        .catch(err => console.error('Erreur génération puce:', err.message)),
      extraireFaits(updated.id, pid, contenuTexte, updated.nom)
        .catch(err => console.error('Erreur extraction faits:', err.message))
    ])
  })()

  res.json(updated)
})

// POST /documents/:id/comparer — relancer la comparaison sans re-uploader
router.post('/:id/comparer', async (req, res) => {
  const docId = parseInt(req.params.id)
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, projetId: true, sousProgrammeId: true, lotType: true }
  })
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' })
  if (!doc.contenuTexte) return res.status(400).json({ error: 'Texte non extrait pour ce document' })
  if (doc.categorieDoc !== 'cctp' && doc.categorieDoc !== 'dpgf') {
    return res.status(400).json({ error: 'Comparaison disponible uniquement pour CCTP et DPGF' })
  }

  const modele = req.body.modeleIA === 'sonnet' ? 'sonnet' : 'haiku'
  const lotType = doc.lotType || detecterLot(doc.nom)
  const modeVerification = req.body.modeVerification === 'chiffrage' ? 'chiffrage' : 'technique'

  // Sélection manuelle de fichiers (nouveau) ou sélection par catégorie (ancien comportement)
  const idsRefRaw = req.body.idsRef
  const idsRef = idsRefRaw && Array.isArray(idsRefRaw) && idsRefRaw.length > 0
    ? idsRefRaw.map(Number)
    : null
  const comparaisonAvec = req.body.comparaisonAvec || 'programme'
  const avecCctp = comparaisonAvec === 'cctp' || comparaisonAvec === 'les_deux'

  res.json({ message: 'Comparaison lancée' })

  comparerAvecReference(doc.id, doc.projetId, doc.contenuTexte, doc.nom, doc.categorieDoc, avecCctp, null, modele, lotType, idsRef, modeVerification)
    .catch(err => console.error('Erreur comparaison:', err.message))
})

// POST /documents/:id/pre-analyse — pré-analyse Python (diff binaire, pas d'écriture en base)
router.post('/:id/pre-analyse', async (req, res) => {
  const docId = parseInt(req.params.id)
  try {
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, nom: true, categorieDoc: true, projetId: true, cheminFichier: true, type: true }
    })
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' })
    if (doc.categorieDoc !== 'dpgf') return res.status(400).json({ error: 'Pré-analyse disponible uniquement pour les DPGF' })

    // Trouver le CCTP de référence parmi les docs du projet
    const idsRefRaw = req.body.idsRef
    let cctpDoc
    if (idsRefRaw?.length > 0) {
      cctpDoc = await prisma.document.findFirst({
        where: { id: { in: idsRefRaw.map(Number) }, categorieDoc: 'cctp' },
        select: { cheminFichier: true, nom: true }
      })
    }
    if (!cctpDoc) {
      cctpDoc = await prisma.document.findFirst({
        where: { projetId: doc.projetId, categorieDoc: 'cctp' },
        select: { cheminFichier: true, nom: true }
      })
    }
    if (!cctpDoc) return res.status(400).json({ error: 'Aucun CCTP trouvé dans le projet' })

    const dpgfPath = path.resolve(doc.cheminFichier)
    const cctpPath = path.resolve(cctpDoc.cheminFichier)
    if (!fs.existsSync(dpgfPath)) return res.status(400).json({ error: 'Fichier DPGF introuvable sur le disque' })
    if (!fs.existsSync(cctpPath)) return res.status(400).json({ error: 'Fichier CCTP introuvable sur le disque' })

    const dpgfBuf = fs.readFileSync(dpgfPath)
    const cctpBuf = fs.readFileSync(cctpPath)

    const PARSER_URL = process.env.PARSER_SERVICE_URL || 'http://127.0.0.1:5001'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const response = await fetch(`${PARSER_URL}/compare/cctp-dpgf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cctp: cctpBuf.toString('base64'),
        dpgf: dpgfBuf.toString('base64'),
        config: { mapping_batiments: {} }
      }),
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!response.ok) throw new Error(`Parser service: ${response.status}`)
    const data = await response.json()

    // Grouper par bâtiment pour affichage
    const parBatiment = {}
    for (const a of data.alertes || []) {
      const bat = a.batiment || 'Inconnu'
      if (!parBatiment[bat]) parBatiment[bat] = []
      parBatiment[bat].push(a)
    }

    res.json({
      nb_alertes: data.nb_alertes,
      nb_conformes: data.nb_conformes,
      cctp_nom: cctpDoc.nom,
      dpgf_nom: doc.nom,
      par_batiment: parBatiment,
      alertes: data.alertes || []
    })
  } catch (err) {
    console.error('[pre-analyse]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /documents/:id/texte — retourne le contenu texte extrait
router.get('/:id/texte', async (req, res) => {
  const docId = parseInt(req.params.id)
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, lotType: true, dateDepot: true }
  })
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' })
  res.json({ id: doc.id, nom: doc.nom, categorieDoc: doc.categorieDoc, lotType: doc.lotType, dateDepot: doc.dateDepot, contenuTexte: doc.contenuTexte })
})

// DELETE /documents/:id — supprimer un document (admin only)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Réservé aux administrateurs' })
  }
  const docId = parseInt(req.params.id)
  const doc = await prisma.document.findUnique({ where: { id: docId } })
  if (!doc) return res.status(404).json({ error: 'Document non trouvé' })

  if (req.query.resoudreAlertes === 'true') {
    const liens = await prisma.alerteDocument.findMany({ where: { documentId: docId }, select: { alerteId: true } })
    const alerteIds = liens.map(l => l.alerteId)
    if (alerteIds.length > 0) {
      await prisma.alerte.updateMany({
        where: { id: { in: alerteIds } },
        data: { statut: 'resolue', resoluePar: 'manuelle' }
      })
    }
  }

  // Supprimer toutes les versions du même document (même nom + même projet)
  const toutesVersions = await prisma.document.findMany({
    where: { projetId: doc.projetId, nom: doc.nom }
  })

  for (const v of toutesVersions) {
    const chemin = path.resolve(__dirname, '../../', v.cheminFichier)
    if (v.cheminFichier && fs.existsSync(chemin)) {
      fs.unlinkSync(chemin)
    }
  }

  await prisma.document.deleteMany({ where: { projetId: doc.projetId, nom: doc.nom } })
  res.json({ message: 'Document supprimé' })
})

// GET /documents/:id/faits — faits extraits d'un document
router.get('/:id/faits', async (req, res) => {
  const faits = await prisma.faitDocument.findMany({
    where: { documentId: parseInt(req.params.id) },
    orderBy: [{ categorie: 'asc' }, { sujet: 'asc' }]
  })
  res.json(faits)
})

// GET /documents/:projetId — liste les documents d'un projet
router.get('/:projetId', async (req, res) => {
  const documents = await prisma.document.findMany({
    where: { projetId: parseInt(req.params.projetId) },
    include: {
      user: { select: { nom: true, email: true } },
      puce: true
    },
    orderBy: { dateDepot: 'desc' }
  })
  res.json(documents)
})

module.exports = router
```

---
## backend/src/routes/alertes.js
```
const express = require('express')
const prisma = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const router = express.Router()
router.use(authMiddleware)

// GET /alertes/:projetId
router.get('/:projetId', async (req, res) => {
  const alertes = await prisma.alerte.findMany({
    where: { projetId: parseInt(req.params.projetId) },
    include: {
      documents: { include: { document: { select: { nom: true, type: true, user: { select: { nom: true } } } } } }
    },
    orderBy: { dateCreation: 'desc' }
  })
  res.json(alertes)
})

// DELETE /alertes/projet/:projetId/toutes — supprimer toutes les alertes actives d'un projet
router.delete('/projet/:projetId/toutes', async (req, res) => {
  const { count } = await prisma.alerte.deleteMany({
    where: { projetId: parseInt(req.params.projetId), statut: 'active' }
  })
  res.json({ message: `${count} alertes supprimées` })
})

// DELETE /alertes/:id — supprimer définitivement une alerte
router.delete('/:id', async (req, res) => {
  await prisma.alerte.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ message: 'Alerte supprimée' })
})

// PATCH /alertes/:id/resoudre — marquer une alerte comme résolue (V3 : enrichie)
router.patch('/:id/resoudre', async (req, res) => {
  const { resoluePar, justificationDerogation } = req.body || {}
  const data = {
    statut: 'resolue',
    dateResolution: new Date()
  }
  if (resoluePar) data.resoluePar = resoluePar
  if (justificationDerogation) data.justificationDerogation = justificationDerogation

  const alerte = await prisma.alerte.update({
    where: { id: parseInt(req.params.id) },
    data
  })
  res.json(alerte)
})

// POST /alertes/:id/arbitrage — créer une décision d'arbitrage (V3 — Bloc 5)
router.post('/:id/arbitrage', async (req, res) => {
  const alerteId = parseInt(req.params.id)
  const { type, justification } = req.body

  if (!type || !justification) {
    return res.status(400).json({ error: 'type et justification requis' })
  }

  const typesValides = ['arbitrage_moa', 'derogation_reglementaire']
  if (!typesValides.includes(type)) {
    return res.status(400).json({ error: `type invalide. Valeurs : ${typesValides.join(', ')}` })
  }

  const alerte = await prisma.alerte.findUnique({ where: { id: alerteId } })
  if (!alerte) return res.status(404).json({ error: 'Alerte non trouvée' })

  const decision = await prisma.decisionArbitrage.create({
    data: {
      projetId: alerte.projetId,
      alerteId,
      type,
      justification,
      decideParId: req.user.id
    }
  })
  res.status(201).json(decision)
})

// GET /alertes/:projetId/arbitrages — lister les décisions d'arbitrage (V3 — Bloc 5)
router.get('/:projetId/arbitrages', async (req, res) => {
  const projetId = parseInt(req.params.projetId)
  const decisions = await prisma.decisionArbitrage.findMany({
    where: { projetId },
    include: {
      alerte: { select: { message: true, statut: true } },
      decidePar: { select: { nom: true, email: true } }
    },
    orderBy: { dateDecision: 'desc' }
  })
  res.json(decisions)
})

// GET /alertes/:projetId/historique — alertes résolues + messages IA
router.get('/:projetId/historique', async (req, res) => {
  const projetId = parseInt(req.params.projetId)

  const [alertesResolues, messagesIA] = await Promise.all([
    prisma.alerte.findMany({
      where: { projetId, statut: 'resolue' },
      include: {
        documents: { include: { document: { select: { nom: true, type: true } } } }
      },
      orderBy: { dateResolution: 'desc' }
    }),
    prisma.messageIA.findMany({
      where: { projetId },
      include: { user: { select: { nom: true } } },
      orderBy: { date: 'desc' }
    })
  ])

  res.json({ alertesResolues, messagesIA })
})

module.exports = router
```

---
## backend/prisma/schema.prisma
```
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id         Int       @id @default(autoincrement())
  nom        String
  email      String    @unique
  password   String
  role       String    @default("moa") // "moa" | "architecte" | "bet_fluides" | "bet_thermique" | "bet_structure" | "bet_electricite" | "bet_vrd" | "bet_geotechnique" | "economiste" | "assistant_moa" | "bet_hqe" | "acousticien" | "bureau_controle" | "admin"
  createdAt  DateTime  @default(now())

  projets              ProjetUser[]
  documents            Document[]
  messages             MessageIA[]
  visas                Visa[]
  reglementationRefs   ReglementationRef[]
  decisions            DecisionArbitrage[]
}

model Projet {
  id              Int       @id @default(autoincrement())
  nom             String
  client          String
  phase           String    @default("APS") // "APS" | "APD" | "PRO" | "DCE" | "EXE"
  bloqueExe       Boolean   @default(false)
  raisonBlocage   String?
  dateCreation    DateTime  @default(now())

  // V3 — Bloc 1 : données d'entrée enrichies
  typeBatiment    String?   // 'logements_collectifs','bureaux','erp','industrie','mixte'
  nombreNiveaux   Int?
  shon            Float?    // surface de plancher m²
  energieRetenue  String?   // 'gaz','electricite','pac','geothermie','bois','mixte'
  zoneClimatique  String?   // 'H1a','H1b','H1c','H2a','H2b','H2c','H2d','H3'
  classementErp   Boolean   @default(false)
  typeErp         String?   // 'M','J','U','W','PS'... si classementErp=true
  nombreLogements Int?      // si résidentiel
  adresse         String?   // pour API GPU/PLU
  batimentsComposition String? @db.Text  // JSON legacy — remplacé par table Batiment
  metadonnees          String? @db.Text  // JSON {adresse, commune, reglementation, ...}
  intervenants         String? @db.Text  // JSON [{role, societe, contact, email, tel}]

  membres         ProjetUser[]
  documents       Document[]
  alertes         Alerte[]
  messages        MessageIA[]
  puces           Puce[]
  visas           Visa[]
  syntheses       Synthese[]
  config          ConfigProjet?
  decisions       DecisionArbitrage[]
  faits           FaitDocument[]
  sousProgrammes  SousProgramme[]
  batiments       Batiment[]
}

model Batiment {
  id            Int     @id @default(autoincrement())
  projetId      Int
  nom           String
  montees       String? @db.Text  // JSON array ex: ["A1","A2"]
  nosComptes    String? @db.Text  // JSON array ex: ["001","101 (BRS)"]
  nbLogements   Int?
  lli           Int?
  lls           Int?
  brs           Int?
  acceStd       Int?
  accesPremium  Int?
  villas        Int?
  fiabilite     String? // "haute" | "basse"
  sectionCctp   String? // mapping CCTP — à renseigner manuellement
  feuillesDpgf  String? @db.Text // JSON array ex: ["BAT A","BAT A BIS"]

  projet  Projet  @relation(fields: [projetId], references: [id], onDelete: Cascade)
}

model SousProgramme {
  id          Int        @id @default(autoincrement())
  projetId    Int
  nom         String
  typologies  String?    // JSON array ex: ["BRS","LLS"]
  position    Int        @default(0)

  projet    Projet     @relation(fields: [projetId], references: [id], onDelete: Cascade)
  documents Document[]
}

model ProjetUser {
  id        Int    @id @default(autoincrement())
  userId    Int
  projetId  Int
  role      String @default("moa")

  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  projet    Projet @relation(fields: [projetId], references: [id], onDelete: Cascade)

  @@unique([userId, projetId])
}

model Document {
  id                  Int       @id @default(autoincrement())
  projetId            Int
  userId              Int
  nom                 String
  type                String    // "pdf" | "docx" | "xlsx"
  cheminFichier       String
  contenuTexte        String?   @db.Text
  resumeModif         String?
  version             Int       @default(1)
  dateDepot           DateTime  @default(now())
  hashFichier         String?   // SHA-256 calculé à l'upload
  versionPrecedenteId Int?      // FK vers Document précédent (même nom)
  deltaModifications  String?   @db.Text  // résumé delta isolé par Claude

  // V3 — Bloc 3 : suivi documentaire
  statutDocument      String?   // 'provisoire','pour_visa','valide'
  indiceRevision      String?   // 'v1','v2','v3'...

  // V4 — Catégorie documentaire choisie à l'upload
  categorieDoc        String?   // 'plans','pieces_ecrites','etudes_th','bureau_controle','programme','notes_calcul','comptes_rendus','autre'

  // V4 — Sous-programme (périmètre) associé
  sousProgrammeId     Int?

  // V4 — Lot détecté automatiquement (cvc, menuiseries, facades, etancheite, grosOeuvre, plomberie)
  lotType             String?

  projet              Projet         @relation(fields: [projetId], references: [id], onDelete: Cascade)
  sousProgramme       SousProgramme? @relation(fields: [sousProgrammeId], references: [id])
  user                User      @relation(fields: [userId], references: [id])
  alertes             AlerteDocument[]
  puce                Puce?
  visas               Visa[]
  syntheses           Synthese[]
  versionPrecedente   Document? @relation("versions", fields: [versionPrecedenteId], references: [id])
  versionsUlterieures Document[] @relation("versions")
  faits               FaitDocument[]
}

model Alerte {
  id             Int       @id @default(autoincrement())
  projetId       Int
  message        String    @db.Text
  statut         String    @default("active") // "active" | "resolue"
  dateCreation   DateTime  @default(now())
  dateResolution DateTime?

  // Synthèse C — criticité
  criticite               String?   // "CRITIQUE" | "MAJEUR" | "MINEUR"

  // V3 — Bloc 5 : résolution enrichie
  resoluePar              String?   // 'manuelle' | 'automatique'
  justificationDerogation String?   @db.Text

  // Traçabilité — extraits utilisés par l'IA
  contexteSource          String?   @db.Text  // référence CCTP/Programme
  dpgfSource              String?   @db.Text  // extrait DPGF analysé

  projet         Projet    @relation(fields: [projetId], references: [id], onDelete: Cascade)
  documents      AlerteDocument[]
  decisions      DecisionArbitrage[]
}

model AlerteDocument {
  id         Int      @id @default(autoincrement())
  alerteId   Int
  documentId Int

  alerte     Alerte   @relation(fields: [alerteId], references: [id], onDelete: Cascade)
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([alerteId, documentId])
}

model MessageIA {
  id        Int      @id @default(autoincrement())
  projetId  Int
  userId    Int
  question  String   @db.Text
  reponse   String   @db.Text
  date      DateTime @default(now())

  projet    Projet   @relation(fields: [projetId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id])
}

model Puce {
  id                  Int      @id @default(autoincrement())
  documentId          Int      @unique
  projetId            Int
  intervenantId       Int?
  typeLivrable        String?  // ex: CCTP, DPGF, Plan
  valeurCle           String?  @db.Text
  version             String?
  resumeModification  String?  @db.Text
  dateCreation        DateTime @default(now())

  document            Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  projet              Projet   @relation(fields: [projetId], references: [id], onDelete: Cascade)
}

model Visa {
  id            Int      @id @default(autoincrement())
  projetId      Int
  documentId    Int
  userId        Int
  action        String   // "FAVORABLE" | "AVEC_RESERVES" | "DEFAVORABLE"
  commentaire   String?  @db.Text
  dateVisa      DateTime @default(now())
  hashDocument  String?

  projet        Projet   @relation(fields: [projetId], references: [id], onDelete: Cascade)
  document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user          User     @relation(fields: [userId], references: [id])
}

model Synthese {
  id                  Int      @id @default(autoincrement())
  projetId            Int
  codeSynthese        String   // 'S-00', 'S-14', etc.
  documentIdSource    Int
  documentsCroisesIds String   @db.Text  // JSON array d'IDs
  resultatVisa        String?  // 'FAVORABLE' | 'AVEC_RESERVES' | 'DEFAVORABLE'
  rapportTexte        String?  @db.Text
  dateAnalyse         DateTime @default(now())

  projet              Projet   @relation(fields: [projetId], references: [id], onDelete: Cascade)
  documentSource      Document @relation(fields: [documentIdSource], references: [id], onDelete: Cascade)
}

model ReglementationRef {
  id            Int      @id @default(autoincrement())
  nom           String
  description   String?
  cheminFichier String
  contenuTexte  String?  @db.Text
  uploadedById  Int
  dateUpload    DateTime @default(now())

  uploadedBy    User     @relation(fields: [uploadedById], references: [id])
}

model TypologiePersonnalisee {
  id        Int      @id @default(autoincrement())
  nom       String   @unique
  createdAt DateTime @default(now())
}

// Vocabulaire global partagé entre tous les projets (admin)
model VocabulaireGlobal {
  id         Int      @id @default(autoincrement())
  terme      String   @unique
  definition String   @db.Text
  createdAt  DateTime @default(now())
}

// V3 — Bloc 2 : configuration projet IA
model ConfigProjet {
  id                    Int     @id @default(autoincrement())
  projetId              Int     @unique
  promptSystemeGlobal   String? @db.Text
  seuilsTolerance       Json?   // {"ecart_puissance": {"vigilance": 5, "bloquant": 10}}
  vocabulaireMetier     Json?   // {"local CTA": ["local VMC", "local ventilation"]}
  valeursReference      Json?   // puissances nominales, débits VMC
  conventionNommage     String? // "TYPE_INTERVENANT_vX_STATUT.ext"

  projet                Projet  @relation(fields: [projetId], references: [id], onDelete: Cascade)
}

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

// V3 — Bloc 5 : décisions d'arbitrage
model DecisionArbitrage {
  id              Int       @id @default(autoincrement())
  projetId        Int
  alerteId        Int?
  type            String    // 'arbitrage_moa' | 'derogation_reglementaire'
  justification   String    @db.Text
  decideParId     Int
  dateDecision    DateTime  @default(now())

  projet          Projet    @relation(fields: [projetId], references: [id], onDelete: Cascade)
  alerte          Alerte?   @relation(fields: [alerteId], references: [id])
  decidePar       User      @relation(fields: [decideParId], references: [id])
}
```

---
## backend/src/services/comparerDocuments.js
```
// backend/src/services/comparerDocuments.js
// Comparaison documentaire hybride : analyse JS + interprétation IA spécialisée par lot
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { detecterLot, chargerAgent } = require('./lotDetector')

// Prompt système enrichi BET Fluides senior (Synthèse C) — V2.1
const SYSTEM_PROMPT_BET_FLUIDES = `Tu es un ingénieur BET Fluides (plomberie, CVC, désenfumage) senior avec 15 ans d'expérience en logement collectif neuf RE2020.

PÉRIMÈTRE STRICT : tu fais un DIFF BIDIRECTIONNEL FACTUEL entre le CCTP et le DPGF.
- Sens 1 : chaque prestation du CCTP doit avoir une ligne correspondante dans le DPGF. Si absente → C01.
- Sens 2 : chaque prestation technique du DPGF doit avoir un article correspondant dans le CCTP. Si orpheline → C02.
Tu vérifies la PRÉSENCE et le TYPE des prestations (équipement, marque, puissance, matériau). Tu ne vérifies JAMAIS les quantités, les métrés, le nombre d'unités. Tu ne fais AUCUNE supposition, AUCUN calcul, AUCUNE déduction technique. Tu rapportes uniquement des FAITS constatés dans les deux documents.

PRATIQUES RÉDACTIONNELLES CCTP/DPGF
- Les chapitres "Généralités" ou "Prescriptions générales" décrivent des conditions administratives et contractuelles — pas des prescriptions techniques à vérifier.
- Un DPGF est un document de synthèse contractuelle destiné au chiffrage entreprise — les désignations sont volontairement plus courtes que le CCTP.
- Le CCTP s'exprime par lot (plomberie, CVC, électricité...). Les prescriptions d'un lot ne sont PAS censées apparaître dans le DPGF d'un autre lot.

RÈGLES DE TOLÉRANCE — NE JAMAIS ALERTER SUR CES CAS
T1 — Performances absentes du DPGF : COP, SCOP, EER, rendement, classement acoustique, pression disponible, débit nominal, classe ErP → pas d'alerte.
T2 — Prestations incluses absentes du DPGF : pose, raccordement, fixation, mise en service, formation, essais, DOE, DIUO → pas d'alerte. Exception T2-inverse : si CCTP précise "fourniture seule" et DPGF inclut la pose → alerte C03.
T3 — Marque dans un seul document : marque dans CCTP uniquement → pas d'alerte. Marque dans DPGF uniquement → pas d'alerte. Marque dans les DEUX documents et différente → C04 MAJEUR.
T4 — Accessoires solidaires d'un ensemble meuble : miroir, applique LED, vidage, siphon, plan vasque inclus dans le meuble vasque → pas d'alerte si absents en ligne DPGF distincte.
T5 — Type de commande bouche extraction : cordelette/pile/interrupteur non précisé dans DPGF → tolérance. Alerte C04 uniquement si les deux docs précisent un type contradictoire.
T6 — Mapping bâtiment : ne jamais comparer un attribut d'un bâtiment avec celui d'un autre bâtiment. Chaque comparaison doit rester dans le même périmètre bâtiment.
T7 — Lignes forfaitaires DPGF : "Prestation conforme au CCTP", "DOE conforme au CCTP", "Sans objet", "N/A", "non applicable" → exclure du contrôle. Exception R5 : sur poste critique → INCERTAIN.
T8 — "Ou équivalent agréé MOE" : si le CCTP le précise, marque DPGF différente tolérée si même type d'équipement.

RÈGLES D'ALERTE OBLIGATOIRE — TOUJOURS ALERTER
R1 — Changement de technologie (CRITIQUE) : PAC ↔ chaudière gaz, VMC double flux ↔ VMC simple flux, plancher chauffant ↔ radiateurs, condensation ↔ basse température, désenfumage naturel ↔ mécanique.
R2 — Changement de position montage (MAJEUR) : WC suspendu ↔ WC au sol, chauffe-eau mural ↔ au sol, lavabo suspendu ↔ sur colonne.
R3 — Matériau réseau différent (MAJEUR) : cuivre ↔ PER pour ECS, acier ↔ fonte pour chutes EU, tube rigide ↔ gaine souple pour VMC collectif.
R4 — Écart puissance (C05) : puissance thermique ±5% tolérance, débit hydraulique ±10%, débit aéraulique ±10%, pression ±5%, acoustique ±3 dB. Écart 5-15% → C05 MAJEUR. Écart >15% → C05 CRITIQUE.
R5 — "Conforme au CCTP" seul sur poste critique (INCERTAIN_DESIGNATION) : PAC, chaudière, VMC, ballon ECS, plancher chauffant → ne jamais ignorer, toujours signaler.
R6 — Exigence normative absente de toute une famille : signaler UNE FOIS dans la synthèse, pas par ligne.

CODES ALERTES MOE.AI
- C01 : Article CCTP absent du DPGF → MAJEUR
- C02 : Ligne DPGF sans article CCTP parent → MINEUR
- C03 : Type d'équipement différent → CRITIQUE
- C04 : Marque présente dans les deux docs et différente → MAJEUR
- C05 : Écart puissance hors tolérance → CRITIQUE (>15%) ou MAJEUR (5-15%)
- INCERTAIN : Désignation "conforme au CCTP" sur poste critique → INCERTAIN_DESIGNATION

ARCHITECTURES TECHNIQUES RECONNUES (ne pas alerter)
- Les attiques ont souvent PAC air/eau + plancher chauffant BT, différente des niveaux courants en chaudière gaz — c'est normal si le programme le prévoit.
- VMC double flux collective ou individuelle est compatible RE2020 pour tous types de logements.
- MTA = Module Thermique d'Appartement (production ECS + chauffage depuis réseau collectif).
- PAC air/eau, PAC géothermique, chaudière granulés, chaudière gaz condensation sont des solutions reconnues RE2020.

DICTIONNAIRE D'ÉQUIVALENCES SÉMANTIQUES (ne pas alerter pour ces synonymes)
- "PAC air/eau" = "pompe à chaleur aérothermique" = "pompe à chaleur air/eau"
- "VMC DF" = "VMC double flux" = "ventilation double flux"
- "ECS" = "eau chaude sanitaire" = "production d'eau chaude sanitaire"
- "plancher chauffant" = "PC BT" = "plancher chauffant basse température" = "PCBT"
- "désenfumage naturel" = "DN" = "désenfumage par tirage naturel"
- "nourrice" = "collecteur de distribution" = "manifold"
- "groupe de sécurité" = "GS" = "soupape de sécurité + clapet de retenue + robinet d'isolement"
- "chaudière condensation" = "chaudière haute performance" = "chaudière condensante"
- "tube multicouche" = "PEX-AL-PEX" = "multicouche"
- "tube PER sous fourreau" = "hydrocâblé PER" = "hydrocâblé"
- "caisson d'extraction" = "groupe VMC" = "groupe d'extraction"
- "WC suspendu" ≠ "WC au sol" — NE JAMAIS considérer comme équivalents
- "chaudière condensation" ≠ "chaudière basse température" — NE JAMAIS considérer comme équivalents

EXEMPLES DE CONTRÔLE FACTUEL (calibrage)

Exemple 1 — CONFORME :
CCTP : "Chaudière murale gaz condensation SAUNIER DUVAL ThemaPlus M CONDENS 26 kW"
DPGF : "Chaudière murale gaz condensation SAUNIER DUVAL ThemaPlus M CONDENS ou CONDENS 26 kW"
→ CONFORME. Même type, même marque, même puissance. "ou CONDENS" est une variante commerciale.

Exemple 2 — C03 CRITIQUE :
CCTP : "Chaudière murale gaz condensation SAUNIER DUVAL 31 kW (2 SdB)"
DPGF : "PaC (2 SdB)"
→ C03 CRITIQUE. Chaudière gaz ≠ PAC. "(2 SdB)" seul est insuffisant pour valider.

Exemple 3 — CONFORME (T3) :
CCTP : "Robinet thermostatisable marque COMAP type SENSITY"
DPGF : "Robinet thermostatisable tête thermostatique Keymark certifiée"
→ CONFORME. Marque COMAP dans CCTP seul = tolérance T3. Type identique.

Exemple 4 — CONFORME (T4) :
CCTP : "Meuble vasque PORCHER + miroir + applique LED"
DPGF : "Vasque simple"
→ CONFORME. Miroir et applique sont des accessoires solidaires du meuble (T4).

Exemple 5 — NE PAS FAIRE :
CCTP : "1 chaudière par logement niveaux 0 et 1"
DPGF : "Chaudière 26 kW : 8 u."
→ Tu vois 10 logements et 8 chaudières. Tu veux alerter sur l'écart de 2. NE LE FAIS PAS. Vérifie uniquement que le type "chaudière condensation gaz 26 kW" est présent dans le DPGF. C'est le cas → CONFORME.

RÈGLES ABSOLUES
1. "sans objet", "N/A", "non applicable" → NE PAS créer d'alerte pour ce poste.
2. "conforme au CCTP" sur poste critique → INCERTAIN_DESIGNATION uniquement.
3. Ne JAMAIS vérifier les quantités, les métrés, ni le nombre d'unités entre CCTP et DPGF. Le contrôle porte UNIQUEMENT sur la présence et la nature des prestations (type d'équipement, marque, puissance, matériau). Le comptage des quantités (nombre de chaudières vs nombre de logements, nombre de radiateurs, longueur de tube) relève du contrôle de programme — hors périmètre de cette analyse.
3bis. Si le CCTP indique '1 chaudière par logement' et le DPGF liste 'chaudière 26 kW : 8 u.', ne PAS comparer 8 au nombre de logements. Vérifier uniquement que le type 'chaudière condensation gaz 26 kW' est bien présent dans le DPGF.
4. Ne pas alerter sur détails d'exécution mineurs non prescrits au programme.
5. Pas de limite d'alertes. Rapporte TOUS les écarts détectés, priorisés par criticité DESC puis confiance DESC.
6. Ne jamais inventer une référence article non trouvée dans le document.
7. Ne jamais interpréter une ambiguïté comme une conformité → toujours INCERTAIN.

CHECKLIST — CONTRÔLE FACTUEL DE PRÉSENCE
a) Pour chaque prestation technique du CCTP → existe-t-elle dans le DPGF ? Si non → C01
b) Pour chaque ligne technique du DPGF → existe-t-elle dans le CCTP ? Si non → C02
c) Si présente dans les deux → le TYPE est-il identique ? Si non → C03
d) Si présente dans les deux → la MARQUE est-elle identique (quand mentionnée dans les deux) ? Si non → C04
e) Si présente dans les deux → la PUISSANCE (kW) est-elle identique ? Si écart > 5% → C05

STATUTS D'ALERTE
- EXIGENCE_MANQUANTE : prestation CCTP absente du DPGF (C01) ou prestation DPGF absente du CCTP (C02)
- ÉCART_MATÉRIAU : type d'équipement ou matériau différent entre les deux documents (C03/C04)
- INCERTAIN_DESIGNATION : désignation imprécise sur poste critique uniquement (R5)

CRITICITÉ
- CRITIQUE : changement de technologie, non-conformité réglementaire, écart puissance >15%
- MAJEUR : prestation manquante importante, matériau différent, marque substituée, WC suspendu→au sol, écart puissance 5-15%
- MINEUR : accessoire prescrit absent, désignation imprécise non critique`

// Prompt quantités — vérification de la cohérence des quantités du DPGF
const SYSTEM_PROMPT_CHIFFRAGE = `Tu es un économiste de la construction senior avec 15 ans d'expérience en vérification de DPGF pour des opérations de logements collectifs, ERP et bureaux.

TON RÔLE
Vérifier la cohérence des quantités d'un DPGF en le croisant avec le CCTP de référence.
Tu n'analyses PAS les désignations techniques ni les prix (ils sont renseignés par les entreprises, pas par le maître d'œuvre) — tu te concentres UNIQUEMENT sur les quantités et les omissions de postes.

RÈGLES DE BASE
1. "Sans objet", "N/A", "non applicable" → NE PAS créer d'alerte pour ce poste.
2. Ne jamais alerter sur les prix unitaires.
3. Ne pas alerter sur les variations de quantités globales liées à l'évolution normale du programme.
4. Une quantité est acceptable si elle est cohérente avec le nombre de logements/bâtiments du projet.

CHECKLIST DE VÉRIFICATION DES QUANTITÉS
a) POSTES MANQUANTS : poste prescrit dans le CCTP avec quantité = 0 ou ligne absente du DPGF → EXIGENCE_MANQUANTE
b) INCOHÉRENCES ENTRE BÂTIMENTS : même équipement avec des quantités très différentes entre bâtiments de gabarit similaire sans justification (ex: 3 VMC pour Bat A, 1 VMC pour Bat B de même taille) → INCOHÉRENCE_TECHNIQUE
c) DOUBLONS : même prestation comptée plusieurs fois dans des lignes distinctes du même lot → INCOHÉRENCE_TECHNIQUE
d) QUANTITÉS ABERRANTES : quantité manifestement incohérente avec le contexte projet (ex: 1 VMC pour 50 logements, 0 robinet pour une installation hydraulique complète) → SOUS_DIMENSIONNEMENT

STATUTS D'ALERTE
- EXIGENCE_MANQUANTE : poste du CCTP absent ou à quantité 0 dans le DPGF
- INCOHÉRENCE_TECHNIQUE : incohérence de quantités entre bâtiments ou doublon
- SOUS_DIMENSIONNEMENT : quantité manifestement insuffisante au regard du contexte projet

CRITICITÉ
- CRITIQUE : équipement principal entièrement absent ou à quantité 0
- MAJEUR : incohérence de quantité significative entre bâtiments de même gabarit
- MINEUR : doublon mineur, petit accessoire manquant, écart de quantité marginal`

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL || 'http://127.0.0.1:5001'

/**
 * Appelle parser-service pour une pré-analyse Python (diff binaire CCTP/DPGF).
 * Retourne la liste d'écarts structurés ou null si le service est indisponible.
 */
async function preAnalysePython(cctpBytes, dpgfBytes, config = {}) {
  try {
    const body = {
      cctp: cctpBytes.toString('base64'),
      dpgf: dpgfBytes.toString('base64'),
      config
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(`${PARSER_SERVICE_URL}/compare/cctp-dpgf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!res.ok) {
      console.warn(`[preAnalysePython] parser-service retourne ${res.status}`)
      return null
    }
    const data = await res.json()
    console.log(`[preAnalysePython] ${data.nb_alertes} écarts Python détectés, ${data.nb_conformes} conformes`)
    return data
  } catch (err) {
    console.warn(`[preAnalysePython] parser-service indisponible: ${err.message}`)
    return null
  }
}

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
 * Extrait la section la plus pertinente d'un CCTP pour un sous-programme donné.
 * Cherche d'abord un titre de chapitre correspondant au nom du sous-programme,
 * puis fallback sur la fenêtre glissante avec le plus de mots en commun avec le programme.
 */
function extraireSectionPertinente(texteDoc, nomSousProgramme, texteRef) {
  if (!texteDoc) return ''
  const TAILLE_FALLBACK = 12000
  const MAX_TAILLE = 25000

  // Normalisation sans accents
  const norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')

  // Chercher un titre de chapitre correspondant au sous-programme
  if (nomSousProgramme) {
    const motsCle = norm(nomSousProgramme).split(/\s+/).filter(m => m.length >= 3)
    const lignes = texteDoc.split('\n')
    let pos = 0
    let meilleurePos = -1
    let meilleurScore = 0
    const posParLigne = []
    let idxMeilleureLigne = -1

    for (let i = 0; i < lignes.length; i++) {
      posParLigne.push(pos)
      const ligneNorm = norm(lignes[i])
      const score = motsCle.filter(m => ligneNorm.includes(m)).length
      if (score > 0 && lignes[i].trim().length < 80 && score >= meilleurScore) {
        meilleurScore = score
        meilleurePos = pos
        idxMeilleureLigne = i
      }
      pos += lignes[i].length + 1
    }

    if (meilleurePos >= 0) {
      // Chercher la fin du chapitre : prochain titre de même niveau (ligne courte commençant par chiffre + point)
      const chapitreRegex = /^\d+\.\s*[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/
      let finSection = texteDoc.length
      for (let i = idxMeilleureLigne + 1; i < lignes.length; i++) {
        const l = lignes[i].trim()
        if (l.length > 0 && l.length < 80 && (chapitreRegex.test(l) || l.toUpperCase().startsWith('ANNEXE'))) {
          finSection = posParLigne[i]
          break
        }
      }
      const section = texteDoc.substring(meilleurePos, finSection)
      console.log(`[comparerDocuments] Section "${nomSousProgramme}" extraite: ${section.length} chars`)
      return section.length <= MAX_TAILLE ? section : section.substring(0, MAX_TAILLE)
    }
  }

  // Fallback : collecter les blocs les plus pertinents de tout le CCTP
  // Découper par titres de sections, scorer chaque bloc, prendre les meilleurs
  const lignes = texteDoc.split('\n')
  const motsCle = nomSousProgramme
    ? norm(nomSousProgramme).split(/\s+/).filter(m => m.length >= 3)
    : []
  const motsRef = texteRef
    ? new Set(tokeniser(texteRef).filter(m => m.length >= 5).slice(0, 80))
    : new Set()

  const blocs = []
  let blocLignes = []
  let blocScore = 0

  const finaliserBloc = () => {
    if (blocLignes.length > 0) blocs.push({ texte: blocLignes.join('\n'), score: blocScore })
    blocLignes = []
    blocScore = 0
  }

  for (const ligne of lignes) {
    const trim = ligne.trim()
    const isTitre = trim.length > 0 && trim.length < 80
    if (isTitre && blocLignes.length > 2) finaliserBloc()
    blocLignes.push(ligne)
    const ligneNorm = norm(ligne)
    const scoreMotsCle = motsCle.filter(m => ligneNorm.includes(m)).length * 3
    const scoreMots = tokeniser(ligne).filter(m => motsRef.has(m)).length
    blocScore += scoreMotsCle + scoreMots
  }
  finaliserBloc()

  // Prendre les blocs les plus pertinents jusqu'à MAX_TAILLE
  const blocsTriés = blocs.filter(b => b.score > 0).sort((a, b) => b.score - a.score)
  let extraction = ''
  for (const bloc of blocsTriés) {
    if (extraction.length + bloc.texte.length > MAX_TAILLE) break
    extraction += bloc.texte + '\n\n'
  }

  if (extraction.length > 100) {
    console.log(`[comparerDocuments] Fallback blocs: ${blocsTriés.length} blocs pertinents, ${extraction.length} chars extraits`)
    return extraction
  }

  return texteDoc.substring(0, TAILLE_FALLBACK)
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
 * Découpe un texte en chunks de taille fixe avec chevauchement.
 * Coupe de préférence aux sauts de ligne pour ne pas couper une phrase.
 */
function chunkerTexte(texte, tailleChunk = 6000, overlap = 500) {
  const chunks = []
  let debut = 0
  while (debut < texte.length) {
    const finBrute = Math.min(debut + tailleChunk, texte.length)
    // Couper au dernier saut de ligne dans la zone finale (évite de couper une phrase)
    let fin = finBrute
    if (finBrute < texte.length) {
      const nl = texte.lastIndexOf('\n', finBrute)
      if (nl > debut + tailleChunk * 0.6) fin = nl
    }
    const chunk = texte.substring(debut, fin).trim()
    if (chunk.length > 200) chunks.push(chunk)
    debut = fin - overlap
    if (debut >= texte.length - 100) break
  }
  return chunks
}

/**
 * Extrait la section DPGF correspondant à un numéro de section (ex: "3.1.4")
 * depuis le [SECTION] correspondant jusqu'au prochain [SECTION] numéroté différent.
 * Les sous-sections non numérotées (ex: "Colonne montante EF") sont incluses.
 * Retourne null si non trouvé.
 */
function extraireSectionDpgf(texteDpgf, numeroSection) {
  if (!texteDpgf || !numeroSection) return null

  const normNum = numeroSection.replace(/\./g, '\\.')
  const reDebut = new RegExp(`\\[SECTION\\]\\s*${normNum}[.\\s]`, 'i')
  const debutMatch = reDebut.exec(texteDpgf)
  if (!debutMatch) return null

  const debut = debutMatch.index
  const apresDebut = debut + debutMatch[0].length

  // Cherche le prochain [SECTION] suivi d'un numéro de section (ex: "3.1.5." ou "3.2.")
  const reProchain = /\[SECTION\]\s*\d+\.\d/gi
  reProchain.lastIndex = apresDebut
  const prochainMatch = reProchain.exec(texteDpgf)
  const fin = prochainMatch ? prochainMatch.index : texteDpgf.length

  const extrait = texteDpgf.substring(debut, fin).trim()
  return extrait.length > 10 ? extrait : null
}

/**
 * Découpe un texte produit par le parser Python en feuilles distinctes.
 * Exploite les séparateurs "=== Feuille: NOM ===" générés par le microservice Python.
 * Retourne [{nom, texte}], en excluant les feuilles RECAP.
 */
function splitParFeuilles(texteDoc) {
  const regex = /=== Feuille: (.+?) ===/g
  const positions = []
  let match
  while ((match = regex.exec(texteDoc)) !== null) {
    positions.push({ nom: match[1].trim(), debut: match.index + match[0].length })
  }
  if (positions.length === 0) return []

  const feuilles = []
  for (let i = 0; i < positions.length; i++) {
    const fin = i + 1 < positions.length ? positions[i + 1].debut - positions[i + 1].nom.length - 20 : texteDoc.length
    const texte = texteDoc.substring(positions[i].debut, fin).trim()
    if (texte.length > 200 && !/(recap|récap)/i.test(positions[i].nom)) {
      feuilles.push({ nom: positions[i].nom, texte })
    }
  }
  return feuilles
}

/**
 * Compare un document uploadé (CCTP ou DPGF) avec les références du projet.
 * Catégorie cctp → compare vs programmes uniquement
 * Catégorie dpgf → compare vs programmes + optionnellement CCTPs
 * Crée des alertes en BDD si des incohérences réelles sont détectées.
 * Pour les DPGF multi-feuilles : une passe Claude par feuille Excel.
 */
async function comparerAvecReference(documentId, projetId, texteDoc, nomDoc, categorieDoc, avecCctp = false, sousProgrammeId = null, modeleIA = 'haiku', lotType = null, idsRef = null, modeVerification = 'technique') {
  if (!texteDoc || texteDoc.trim().length < 200) return []

  // Détecter le lot si non fourni, et charger l'agent spécialisé
  const lotDetecte = lotType || detecterLot(nomDoc)
  const agent = chargerAgent(lotDetecte)
  console.log(`[comparerDocuments] Agent chargé: ${lotDetecte || 'generique'} pour "${nomDoc}"`)

  // Récupérer le nom du sous-programme + contexte projet
  let nomSousProgramme = null
  if (sousProgrammeId) {
    const sp = await prisma.sousProgramme.findUnique({ where: { id: sousProgrammeId }, select: { nom: true } })
    nomSousProgramme = sp?.nom || null
  }

  const [projet, configProjet, vocabGlobal] = await Promise.all([
    prisma.projet.findUnique({
      where: { id: projetId },
      select: {
        nom: true, client: true, typeBatiment: true, energieRetenue: true,
        zoneClimatique: true, nombreLogements: true, batimentsComposition: true,
        sousProgrammes: { select: { nom: true } }
      }
    }),
    prisma.configProjet.findUnique({
      where: { projetId },
      select: { promptSystemeGlobal: true, vocabulaireMetier: true }
    }),
    prisma.vocabulaireGlobal.findMany({ orderBy: { terme: 'asc' } })
  ])

  let docsRef

  if (idsRef && idsRef.length > 0) {
    // Sélection manuelle : on charge exactement les documents demandés
    docsRef = await prisma.document.findMany({
      where: { id: { in: idsRef }, contenuTexte: { not: null } },
      select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, lotType: true }
    })
    console.log(`[comparerDocuments] Sélection manuelle : ${docsRef.length} doc(s) de référence`)
  } else {
    // Sélection automatique par catégorie (comportement historique)
    const categoriesRef = ['programme']
    if (avecCctp) categoriesRef.push('cctp')

    const whereRef = {
      projetId,
      id: { not: documentId },
      categorieDoc: { in: categoriesRef },
      contenuTexte: { not: null }
    }

    if (sousProgrammeId) {
      whereRef.sousProgrammeId = sousProgrammeId
    }

    docsRef = await prisma.document.findMany({
      where: whereRef,
      select: { id: true, nom: true, contenuTexte: true, categorieDoc: true, lotType: true }
    })

    // Si on compare un DPGF vs CCTPs et qu'un lotType est détecté → filtrer par même lot
    if (avecCctp && lotType && categoriesRef.includes('cctp')) {
      const cctpsMemeLog = docsRef.filter(d => d.categorieDoc === 'cctp' && d.lotType === lotType)
      const programmes = docsRef.filter(d => d.categorieDoc === 'programme')
      docsRef = [...programmes, ...cctpsMemeLog]
      if (cctpsMemeLog.length > 0) {
        console.log(`[comparerDocuments] Filtre lot "${lotType}" : ${cctpsMemeLog.length} CCTP(s) retenu(s)`)
      } else {
        console.log(`[comparerDocuments] Aucun CCTP avec lotType "${lotType}" — comparaison sans CCTP`)
      }
    }
  }

  if (docsRef.length === 0) {
    console.log(`[comparerDocuments] Aucun doc de référence dans le projet ${projetId}`)
    return []
  }

  // ─── PRÉ-ANALYSE PYTHON (Option B) ───
  // Si DPGF en mode technique avec un CCTP de référence, appeler parser-service
  // pour un diff binaire par famille de prestation (sans quantités)
  let ecartsPython = null
  if (categorieDoc === 'dpgf' && modeVerification === 'technique') {
    const cctpRef = docsRef.find(d => d.categorieDoc === 'cctp')
    if (cctpRef) {
      try {
        const fs = require('fs')
        const path = require('path')

        // Charger le fichier DPGF brut
        const docDpgf = await prisma.document.findUnique({
          where: { id: documentId },
          select: { cheminFichier: true, type: true }
        })

        if (docDpgf?.cheminFichier && cctpRef.id) {
          const docCctp = await prisma.document.findUnique({
            where: { id: cctpRef.id },
            select: { cheminFichier: true, type: true }
          })

          if (docCctp?.cheminFichier) {
            const dpgfPath = path.resolve(docDpgf.cheminFichier)
            const cctpPath = path.resolve(docCctp.cheminFichier)

            if (fs.existsSync(dpgfPath) && fs.existsSync(cctpPath)) {
              const dpgfBuf = fs.readFileSync(dpgfPath)
              const cctpBuf = fs.readFileSync(cctpPath)

              // Construire le mapping bâtiments depuis la config projet
              const mappingConfig = {}
              if (projet?.batimentsComposition) {
                try {
                  const bats = JSON.parse(projet.batimentsComposition)
                  if (bats?.length) {
                    bats.forEach((b, i) => {
                      mappingConfig[`CCTP_section_${i + 3}`] = b.feuilles_dpgf || [b.nom]
                    })
                  }
                } catch (e) { /* ignore */ }
              }

              ecartsPython = await preAnalysePython(cctpBuf, dpgfBuf, {
                projet: projet?.nom || '',
                mapping_batiments: mappingConfig
              })

              if (ecartsPython?.alertes?.length > 0) {
                console.log(`[comparerDocuments] Pré-analyse Python : ${ecartsPython.alertes.length} écarts détectés`)
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[comparerDocuments] Pré-analyse Python échouée: ${err.message}`)
      }
    }
  }

  // Récupérer le CCTP Généralités (Lot 00) s'il existe dans le projet
  const cctpGeneralDoc = await prisma.document.findFirst({
    where: { projetId, categorieDoc: 'cctp', lotType: 'generalites', contenuTexte: { not: null } },
    select: { nom: true, contenuTexte: true }
  })
  const cctpGeneralTexte = cctpGeneralDoc?.contenuTexte
    ? cctpGeneralDoc.contenuTexte.substring(0, 6000)
    : null

  // Analyse JS pour chaque document de référence
  const resultats = docsRef
    .filter(ref => ref.contenuTexte && ref.contenuTexte.length > 100)
    .map(ref => ({
      refId: ref.id,
      refNom: ref.nom,
      analyse: analyserEcarts(texteDoc, ref.contenuTexte, nomDoc, ref.nom)
    }))

  // Vérifier s'il y a des écarts significatifs (sinon pas d'appel IA)
  const aDesEcartsJS = resultats.some(r =>
    r.analyse.termesManquants.length > 3 || r.analyse.exigencesNonCouvertes.length > 0
  )
  const aDesEcartsPython = ecartsPython?.alertes?.length > 0

  if (!aDesEcartsJS && !aDesEcartsPython) {
    console.log(`[comparerDocuments] Bonne couverture pour doc ${documentId} — aucun écart significatif (JS + Python)`)
    return []
  }

  const premiereRef = docsRef[0]

  // Construire le contexte projet (partagé entre toutes les sections)
  let compositionBatiments = ''
  if (projet?.batimentsComposition) {
    try {
      const bats = JSON.parse(projet.batimentsComposition)
      if (bats?.length) {
        compositionBatiments = `Composition des bâtiments du projet :\n` +
          bats.map(b => `  - ${b.nom} : ${b.typologies?.join(', ') || '—'}`).join('\n') +
          `\nIMPORTANT : le CCTP doit traiter chaque bâtiment/typologie distinctement (exigences spécifiques par financement).`
      }
    } catch (e) { /* JSON invalide, on ignore */ }
  } else if (projet?.sousProgrammes?.length) {
    compositionBatiments = `Périmètres du projet : ${projet.sousProgrammes.map(s => s.nom).join(', ')}.`
  }

  const contextProjet = [
    projet?.nom ? `Projet : ${projet.nom} (${projet.client || ''})` : '',
    projet?.typeBatiment ? `Type de bâtiment : ${projet.typeBatiment}` : '',
    projet?.nombreLogements ? `${projet.nombreLogements} logements` : '',
    projet?.energieRetenue ? `Énergie retenue : ${projet.energieRetenue}` : '',
    projet?.zoneClimatique ? `Zone climatique : ${projet.zoneClimatique}` : '',
    compositionBatiments
  ].filter(Boolean).join('\n')

  const promptConfig = configProjet?.promptSystemeGlobal
    ? `\nConsignes spécifiques du projet : ${configProjet.promptSystemeGlobal}`
    : ''

  const vocabProjet = configProjet?.vocabulaireMetier
    ? Object.entries(configProjet.vocabulaireMetier).map(([t, d]) => `  ${t} → ${d}`).join('\n')
    : ''
  const vocabGlobalStr = vocabGlobal?.length
    ? vocabGlobal.map(v => `  ${v.terme} → ${v.definition}`).join('\n')
    : ''
  const vocabMetier = (vocabGlobalStr || vocabProjet)
    ? `\nVOCABULAIRE MÉTIER (abréviations et équivalences à connaître) :\n${vocabGlobalStr}${vocabProjet ? '\nSpécifique au projet :\n' + vocabProjet : ''}`
    : ''

  const reglesAgent = agent.reglesMetier?.length
    ? `\nPOINTS DE CONTRÔLE SPÉCIFIQUES À CE LOT\n${agent.reglesMetier.map(r => `- ${r}`).join('\n')}`
    : ''

  const contextGeneralites = cctpGeneralTexte
    ? `\nPRESCRIPTIONS GÉNÉRALES APPLICABLES À TOUS LES LOTS (Lot 00)\nCes prescriptions s'appliquent en complément des exigences du programme :\n${cctpGeneralTexte}`
    : ''

  // Préparer label et nettoyer les anciennes alertes une seule fois (avant la boucle)
  let labelType
  if (categorieDoc === 'cctp') {
    labelType = 'CCTP vs Programme'
  } else if (idsRef && idsRef.length > 0) {
    const hasProg = docsRef.some(d => d.categorieDoc === 'programme')
    const hasCctp = docsRef.some(d => d.categorieDoc === 'cctp')
    const refLabel = hasProg && hasCctp ? 'Programme+CCTP' : hasProg ? 'Programme' : 'CCTP'
    labelType = `DPGF vs ${refLabel} — ${modeVerification === 'chiffrage' ? 'Chiffrage' : 'Technique'}`
  } else {
    const refLabel = avecCctp ? 'Programme+CCTP' : 'Programme'
    labelType = `DPGF vs ${refLabel} — ${modeVerification === 'chiffrage' ? 'Chiffrage' : 'Technique'}`
  }
  const LOT_LABELS = { cvc: 'CVC', menuiseries: 'Menuiseries', facades: 'Façades', etancheite: 'Étanchéité', grosOeuvre: 'Gros œuvre', plomberie: 'Plomberie' }
  const nomLot = lotType ? LOT_LABELS[lotType] || lotType : null
  const groupe = nomSousProgramme || nomLot
  const labelComplet = groupe ? `[${labelType} — ${groupe}]` : `[${labelType}]`

  const alertesLiees = await prisma.alerteDocument.findMany({ where: { documentId }, select: { alerteId: true } })
  if (alertesLiees.length > 0) {
    const alerteIds = alertesLiees.map(a => a.alerteId)
    await prisma.alerte.deleteMany({ where: { id: { in: alerteIds }, message: { startsWith: `[${labelType}` } } })
  }

  // Pour DPGF : traiter feuille par feuille (une passe Claude par feuille Excel)
  // Pour CCTP long (> 20 000 chars) : map-reduce par chunks de 6 000 chars
  // Pour CCTP court : section unique (comportement historique)
  const feuilles = categorieDoc === 'dpgf' ? splitParFeuilles(texteDoc) : []
  let sectionsATraiter
  if (feuilles.length > 1) {
    sectionsATraiter = feuilles.map(f => ({ texte: f.texte, label: f.nom }))
  } else if (categorieDoc === 'cctp' && texteDoc.length > 20000) {
    const chunks = chunkerTexte(texteDoc, 6000, 500)
    sectionsATraiter = chunks.map((chunk, i) => ({ texte: chunk, label: `Partie ${i + 1}/${chunks.length}` }))
    console.log(`[comparerDocuments] CCTP long (${texteDoc.length} chars) → ${chunks.length} chunks de ~6 000 chars`)
  } else {
    sectionsATraiter = [{ texte: extraireSectionPertinente(texteDoc, nomSousProgramme, premiereRef?.contenuTexte), label: nomSousProgramme || null }]
  }


  console.log(`[comparerDocuments] ${sectionsATraiter.length} section(s) à traiter pour "${nomDoc}"`)


  const refIds = docsRef.map(r => r.id)
  const uniqueDocIds = [...new Set([documentId, ...refIds])]
  const model = modeleIA === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
  const alertesCreees = []

  for (let i = 0; i < sectionsATraiter.length; i++) {
    const section = sectionsATraiter[i]

    // Analyse JS pour cette section spécifiquement
    const resultatsSection = docsRef
      .filter(ref => ref.contenuTexte && ref.contenuTexte.length > 100)
      .map(ref => ({
        refNom: ref.nom,
        analyse: analyserEcarts(section.texte, ref.contenuTexte, nomDoc, ref.nom)
      }))

    const aDesEcartsSection = resultatsSection.some(r =>
      r.analyse.termesManquants.length > 3 || r.analyse.exigencesNonCouvertes.length > 0
    )

    // Si Python a détecté des écarts pour cette section, ne pas skip
    const sectionLabel = section.label || ''
    const pythonADesEcartsPourSection = ecartsPython?.alertes?.some(a =>
      !a.batiment || !sectionLabel ||
      a.batiment.toUpperCase().includes(sectionLabel.toUpperCase()) ||
      sectionLabel.toUpperCase().includes((a.batiment || '').toUpperCase())
    )

    if (!aDesEcartsSection && !pythonADesEcartsPourSection) {
      console.log(`[comparerDocuments] Section "${section.label || 'principale'}" — couverture correcte, skip`)
      continue
    }

    const resumeEcartsSection = resultatsSection.map(r => {
      const a = r.analyse
      const ref = docsRef.find(d => d.nom === a.nomRef)
      const lignes = [`== ${section.label || nomDoc} vs ${a.nomRef} (couverture ${a.couverture}%) ==`]
      if (a.termesManquants.length > 0) {
        lignes.push(`Termes du programme absents de cette section : ${a.termesManquants.slice(0, 12).join(', ')}`)
      }
      if (a.exigencesNonCouvertes.length > 0) {
        lignes.push(`Exigences potentiellement non couvertes :`)
        a.exigencesNonCouvertes.forEach(e => lignes.push(`  • ${e.substring(0, 120)}`))
      }
      if (ref?.contenuTexte) {
        lignes.push(`\nExtrait du programme de référence (${a.nomRef}) :`)
        lignes.push(ref.contenuTexte.substring(0, 10000))
      }
      return lignes.join('\n')
    }).join('\n\n---\n\n')

    const labelSection = section.label ? ` (${section.label})` : (nomSousProgramme ? ` — section "${nomSousProgramme}"` : '')
    const contextSection = section.label
      ? `\nSection analysée : "${section.label}" — analyse UNIQUEMENT cette feuille du DPGF.`
      : (nomSousProgramme ? `\nPérimètre analysé : "${nomSousProgramme}" — analyse UNIQUEMENT la section correspondant à ce périmètre.` : '')

    const isChiffrage = modeVerification === 'chiffrage'
    const systemPrompt = isChiffrage ? SYSTEM_PROMPT_CHIFFRAGE : SYSTEM_PROMPT_BET_FLUIDES
    const mission = isChiffrage
      ? `MISSION
En analysant le DPGF ci-dessous et en le croisant avec le CCTP de référence :
1. Applique la CHECKLIST DE VÉRIFICATION DU CHIFFRAGE (postes non chiffrés, prix manquants, incohérences de quantités, doublons, quantités aberrantes).
2. Cite toujours la ligne/section précise du DPGF et le chapitre du CCTP correspondant.
3. Priorise par criticité : CRITIQUE en premier, puis MAJEUR, puis MINEUR.`
      : `MISSION
Fais un CONTRÔLE FACTUEL DE PRÉSENCE bidirectionnel entre le CCTP et le DPGF :
1. CCTP → DPGF : chaque prestation technique du CCTP a-t-elle une ligne correspondante dans le DPGF ?
2. DPGF → CCTP : chaque prestation technique du DPGF a-t-elle un article correspondant dans le CCTP ?
3. Si présente dans les deux : le type, la marque et la puissance sont-ils cohérents ?
4. Applique le dictionnaire d'équivalences et les exemples de calibrage ci-dessus.
5. INTERDIT : aucune supposition, aucun calcul, aucune déduction, aucune vérification de quantité. Rapporte uniquement des FAITS lus dans les documents.`

    // Construire le bloc des écarts Python pour cette section (si disponibles)
    let blocEcartsPython = ''
    if (ecartsPython?.alertes?.length > 0 && !isChiffrage) {
      // Garder uniquement les alertes dont le batiment correspond EXACTEMENT à la feuille courante
      // (exclure les batiments "SECTION_X" issus du mapping vide — faux positifs C01)
      const ecartsFiltres = (section.label
        ? ecartsPython.alertes.filter(a => {
            if (!a.batiment) return false
            const bat = a.batiment.toUpperCase()
            const label = section.label.toUpperCase()
            // Match exact ou inclusion stricte — exclure les "SECTION_N"
            return bat === label || bat.includes(label) || label.includes(bat)
          })
        : ecartsPython.alertes
      ).slice(0, 20) // Limiter à 20 écarts pour éviter les prompts géants

      if (ecartsFiltres.length > 0) {
        blocEcartsPython = `\nÉCARTS DÉTECTÉS PAR L'ANALYSE PYTHON (diff binaire par famille — ${ecartsFiltres.length} écarts)
${ecartsFiltres.map((a, idx) => {
  const parts = [`${idx + 1}. [${a.code}] ${a.criticite} — ${a.motif}`]
  if (a.cctp_texte) parts.push(`   CCTP ${a.cctp_section ? '§' + a.cctp_section : ''}: "${a.cctp_texte}"`)
  if (a.dpgf_texte) parts.push(`   DPGF ligne: "${a.dpgf_texte}"`)
  return parts.join('\n')
}).join('\n')}

CONSIGNE : pour chaque écart Python ci-dessus, vérifie s'il est confirmé dans les textes. Si faux positif (synonyme, tolérance T1-T8) → pas d'alerte. Si confirmé → crée l'alerte.`
      }
    }

    const prompt = `${systemPrompt}

CONTEXTE DU PROJET
${contextProjet}${contextSection}${promptConfig}${vocabMetier}${isChiffrage ? '' : reglesAgent}${isChiffrage ? '' : contextGeneralites}

ÉCARTS DÉTECTÉS PAR L'ANALYSE AUTOMATIQUE (JS)
${resumeEcartsSection}
${blocEcartsPython}

SECTION DU ${categorieDoc.toUpperCase()} ANALYSÉE${labelSection}
${section.texte}

${mission}

Réponds UNIQUEMENT en JSON :
{
  "alertes": [
    {
      "message": "Description précise de l'incohérence, en citant section et valeurs des deux documents",
      "statut": "ÉCART_MATÉRIAU",
      "criticite": "CRITIQUE"
    }
  ]
}

Valeurs possibles pour statut : EXIGENCE_MANQUANTE, ÉCART_MATÉRIAU, INCERTAIN_DESIGNATION
Valeurs possibles pour criticite : CRITIQUE, MAJEUR, MINEUR

Si aucun problème réel : { "alertes": [] }
IMPORTANT : si ton analyse conclut elle-même qu'il n'y a pas d'incohérence ("cohérent", "conforme", "pas d'alerte", "aucune anomalie"), ne crée PAS d'alerte pour ce point. Une alerte = un vrai problème, pas une vérification rassurante.`

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })

      const raw = response.content[0].text
      const jsonMatch = raw.match(/\{[\s\S]*"alertes"[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[comparerDocuments] Section "${section.label}" : pas de JSON valide dans la réponse, skip`)
        continue
      }
      const parsed = JSON.parse(jsonMatch[0])

      if (parsed.alertes?.length) {
        for (const alerte of parsed.alertes) {
          const criticiteValides = ['CRITIQUE', 'MAJEUR', 'MINEUR']
          const criticite = criticiteValides.includes(alerte.criticite) ? alerte.criticite : null
          const labelMessage = (feuilles.length > 1 && section.label)
            ? `[${labelType} — ${section.label}]`
            : labelComplet
          const nouvelleAlerte = await prisma.alerte.create({
            data: {
              projetId,
              message: `${labelMessage} ${alerte.message}`,
              criticite,
              contexteSource: categorieDoc === 'dpgf'
                ? (docsRef.filter(r => r.contenuTexte).map(r => extraireSectionPertinente(r.contenuTexte, null, alerte.message).substring(0, 2000)).join('\n\n---\n\n').substring(0, 4000) || null)
                : (section.texte ? section.texte.substring(0, 4000) : null),
              dpgfSource: categorieDoc === 'dpgf'
                ? (() => {
                    const numMatch = alerte.message.match(/§([\d.]+)/)
                    const section_dpgf = numMatch ? extraireSectionDpgf(section.texte, numMatch[1]) : null
                    return section_dpgf
                      ? section_dpgf.substring(0, 4000)
                      : (section.texte ? extraireSectionPertinente(section.texte, null, alerte.message).substring(0, 4000) : null)
                  })()
                : null,
              documents: { create: uniqueDocIds.map(id => ({ documentId: id })) }
            }
          })
          alertesCreees.push(nouvelleAlerte)
        }
        console.log(`[comparerDocuments] Section "${section.label || 'principale'}" : ${parsed.alertes.length} alertes`)
      } else {
        console.log(`[comparerDocuments] Section "${section.label || 'principale'}" : aucun problème détecté`)
      }
    } catch (err) {
      console.error(`[comparerDocuments] Erreur IA section "${section.label}":`, err.message)
    }

    // Pause entre sections pour respecter le rate limit Anthropic
    // Haiku : 10 000 tokens/min → 8s min entre appels lourds
    if (i < sectionsATraiter.length - 1) {
      await new Promise(r => setTimeout(r, 8000))
    }
  }

  console.log(`[comparerDocuments] Total : ${alertesCreees.length} alertes créées pour doc ${documentId} (${nomDoc})`)

  // Déduplication : supprimer les alertes dont le message est quasi-identique (premiers 80 chars)
  // Peut arriver avec le chevauchement des chunks
  const signaturesSeen = new Set()
  const doublons = []
  for (const alerte of alertesCreees) {
    const sig = alerte.message.substring(0, 80).toLowerCase().replace(/\s+/g, ' ')
    if (signaturesSeen.has(sig)) {
      doublons.push(alerte.id)
    } else {
      signaturesSeen.add(sig)
    }
  }
  if (doublons.length > 0) {
    await prisma.alerte.deleteMany({ where: { id: { in: doublons } } })
    console.log(`[comparerDocuments] ${doublons.length} alertes dupliquées supprimées`)
  }

  return alertesCreees.filter(a => !doublons.includes(a.id))
}

module.exports = { comparerAvecReference }
```

---
## backend/src/services/ia.js
```
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
async function questionIA(projetId, userId, question, documentIds = []) {
  const whereDoc = documentIds.length > 0
    ? { projetId, id: { in: documentIds } }
    : { projetId, id: { in: [] } } // aucun doc si rien sélectionné
  const [documents, puces, contenuReglementationRef, configProjet, contexteReglementaire] = await Promise.all([
    prisma.document.findMany({
      where: whereDoc,
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
    model: 'claude-sonnet-4-6',
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

// Vérifie les alertes actives d'un projet par batch de 10 — résout les faux positifs
async function verifierAlertes(projetId) {
  const BATCH_SIZE = 10

  const [alertes, configProjet] = await Promise.all([
    prisma.alerte.findMany({
      where: { projetId, statut: 'active' },
      include: {
        documents: {
          include: { document: { select: { nom: true, contenuTexte: true, categorieDoc: true } } }
        }
      }
    }),
    chargerConfigProjet(projetId)
  ])

  if (alertes.length === 0) return { verifiees: 0, faux_positifs: 0 }

  const configSection = configProjet?.promptSystemeGlobal
    ? `\nConsignes spécifiques du projet :\n${configProjet.promptSystemeGlobal}`
    : ''

  const vocabSection = configProjet?.vocabulaireMetier
    ? `\nVocabulaire métier du projet :\n${Object.entries(configProjet.vocabulaireMetier).map(([k, v]) => `${k} → ${v}`).join('\n')}`
    : ''

  let totalFauxPositifs = 0

  // Traitement par batch
  for (let i = 0; i < alertes.length; i += BATCH_SIZE) {
    const batch = alertes.slice(i, i + BATCH_SIZE)

    // Extraire les documents uniques du batch pour le contexte
    const docsMap = {}
    for (const alerte of batch) {
      for (const ad of alerte.documents) {
        const doc = ad.document
        if (doc.contenuTexte && !docsMap[doc.nom]) {
          docsMap[doc.nom] = `--- ${doc.nom} (${doc.categorieDoc || 'document'}) ---\n${doc.contenuTexte.substring(0, 1500)}`
        }
      }
    }
    const contexteDocuments = Object.values(docsMap).join('\n\n') || 'Aucun document disponible'

    const alertesJson = JSON.stringify(batch.map(a => ({
      id: a.id,
      message: a.message,
      criticite: a.criticite
    })), null, 2)

    const prompt = `Tu es un expert en vérification documentaire BET thermique. Tu reçois des alertes générées automatiquement lors de la comparaison de documents (DPGF, CCTP, Programme).

Ta mission : pour chaque alerte, décider si elle est réelle ou un faux positif.

Critères de faux positif :
- Simple reformulation ou synonyme sans écart technique réel
- Différence de présentation ou de granularité sans impact
- Information présente dans un document mais formulée différemment dans l'autre
- Alerte redondante avec une autre

Critères pour confirmer :
- Valeur numérique différente (puissance, surface, quantité...)
- Équipement ou matériau absent d'un document
- Exigence du programme non couverte dans le CCTP ou DPGF
- Incohérence technique réelle entre documents
${configSection}${vocabSection}

Extraits des documents concernés :
${contexteDocuments}

Alertes à vérifier :
${alertesJson}

Réponds UNIQUEMENT en JSON valide, sans texte autour :
[
  { "id": 123, "decision": "confirmer" },
  { "id": 124, "decision": "faux_positif", "justification": "Explication courte et précise." }
]`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })

    let decisions = []
    try {
      const text = response.content[0].text.trim()
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) decisions = JSON.parse(jsonMatch[0])
    } catch {
      continue // si parsing échoue, on passe au batch suivant
    }

    // Résoudre les faux positifs
    for (const d of decisions) {
      if (d.decision === 'faux_positif') {
        await prisma.alerte.update({
          where: { id: d.id },
          data: {
            statut: 'resolue',
            resoluePar: 'ia_verification',
            justificationDerogation: `Faux positif détecté par agent IA : ${d.justification || 'non pertinent'}`
          }
        })
        totalFauxPositifs++
      }
    }
  }

  return { verifiees: alertes.length, faux_positifs: totalFauxPositifs }
}

module.exports = { analyserProjet, questionIA, genererPuce, comparerVersions, analyserSynthese, verifierAlertes }
```

---
## backend/src/services/extractFaits.js
```
// backend/src/services/extractFaits.js
const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TEXTE_MAX = 12000  // ~3 000 tokens — respecte le rate limit 10k tokens/min

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

Retourne au maximum 50 faits (les plus importants en priorité).
N'inclus un fait que si la valeur est précise et connue. Si la valeur est inconnue, absente ou "N/A", n'inclus pas ce fait.
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
      max_tokens: 8192,
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
      typeof f.valeur === 'string' &&
      f.valeur.trim().toLowerCase() !== 'n/a' &&
      f.valeur.trim() !== ''
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
## parser-service/extraire_granulometrie.py
```
"""
Synthek — extraire_granulometrie.py
Pipeline import granulométrie : fichier architecte (Excel) → JSON normalisé contrat D1
via extraction texte brut (Python) + extraction sémantique (Sonnet 4.6)

Workflow :
  Appel 1 (regroupement_valide=None, nom_feuille=None|"X") :
    a) Si plusieurs feuilles éligibles et nom_feuille absent :
         → { etape: "selection_feuille", feuilles_disponibles, feuille_suggeree }
    b) Sinon :
         → Extrait texte brut + appelle Sonnet
         → { etape: "validation", batiments: [...], total_logements, ... }

  Appel 2 — nouveau format (regroupement_valide = list de batiment objects) :
    → Valide les données confirmées par l'utilisateur → retourne JSON D1 final

  Appel 2 — rétrocompat (regroupement_valide = dict {groupe: [montees]}) :
    → Re-extrait + appelle Sonnet → retourne JSON D1 final
"""

import io
import re
import os
import json
import logging
import datetime
from typing import Optional

import openpyxl
import pdfplumber
import anthropic

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────────

PREFIXES_FEUILLES_EXCLUES = (
    'calcul', 'détail', 'detail', 'graphique', 'récap', 'recap', 'total'
)
LIMITE_TEXTE_BRUT = 25_000
MODELE_SONNET = 'claude-sonnet-4-6'

PROMPT_SYSTEME = """Ne réfléchis pas à voix haute. Commence ta réponse immédiatement par { sans aucun texte avant.

Tu es un parser de donnees immobilieres specialise en programmes de logements.
Tu recois le contenu brut d'un fichier Excel architecte au format positionnel groupé par ligne :
  L01 | col00=BATIMENT | col02=A1 | col05=A2 | col14=B | col23=C (LLS)
  L02 | col00=NIVEAU | col02=RDC | col03=R+1 | col05=RDC | col08=R+1 | col11=R+2
  L03 | col00=N° | col02=001 | col03=101 (BRS) | col05=001 | col06=002 | col07=003
Chaque ligne = une ligne Excel non vide. col00 = colonne A, col01 = B, etc. (index 0-based).
Les gaps entre indices de colonnes indiquent les cellules vides (ex : col02 à col05 = A1 occupe 3 colonnes).

Extrais les informations suivantes par batiment ou groupe de batiments :
- nom du batiment ou groupe (ex: A, BAT A, Batiment A)
- montees : sous-entrees du batiment si presentes (ex: A1, A2) — [] si absent ou SANS OBJET
- nos_comptes : liste exhaustive et exacte de tous les N° de logements que tu as lus pour ce batiment
- nb_logements : doit etre exactement egal a len(nos_comptes)
- LLI, LLS, BRS, acces_std, acces_premium, villas : deduits des annotations dans nos_comptes

Regles strictes :
- Lecture colonnes : la ligne BATIMENT definit les groupes — chaque nom (A1, A2, B...) occupe les colonnes depuis son index jusqu'au prochain nom. Les N° sous ces colonnes appartiennent a ce batiment.
- nos_comptes : liste TOUS les N° du fichier pour ce batiment — ne rien inventer, ne rien omettre, ne pas dupliquer entre batiments
- Financements deduits de nos_comptes : "(LLS)" → LLS, "(BRS)" → BRS, "(LLI)" → LLI, sans annotation → accession libre (acces_std ou acces_premium), entier 1-2 chiffres → villa
- Nom batiment ou montee contient "(LLS)"/"(LLI)"/"(BRS)" → tous logements sans annotation de ce batiment = ce financement
- PREMIUM = logement au dernier niveau de sa montee sans annotation sociale
- VILLA = maison individuelle — Section VILLAS : entiers simples sur la ligne suivant "VILLAS" = numeros de villas
- SANS OBJET dans montees → montees: []
- Ignorer lignes TOTAL et recapitulatives
- Si une donnee est absente ou non deductible avec certitude → null
- Fiabilite "haute" si nos_comptes rempli, "estimee" si compte depuis typologies, "incomplete" si financements tous null
- Retourne UNIQUEMENT le JSON valide, sans texte avant ni apres, sans backticks

Format de sortie exact :
{
  "projet": null,
  "source": "nom_fichier",
  "batiments": [
    {
      "nom": "A",
      "montees": ["A1", "A2"],
      "nos_comptes": ["001", "002 (BRS)", "101", "102 (LLS)"],
      "nb_logements": 4,
      "LLI": null,
      "LLS": 1,
      "BRS": 1,
      "acces_std": 2,
      "acces_premium": null,
      "villas": 0,
      "fiabilite": "haute",
      "section_cctp": null,
      "feuilles_dpgf": [],
      "systeme_chauffage": null,
      "systeme_vmc": null,
      "regulation": null,
      "notes": null
    }
  ],
  "total_logements": 4,
  "donnees_manquantes": [],
  "hypotheses": []
}"""

PROMPT_SYSTEME_PDF = """Ne réfléchis pas à voix haute. Commence ta réponse immédiatement par { sans aucun texte avant.

Tu es un parser de données immobilières spécialisé en programmes de logements.
Tu reçois le contenu texte extrait d'un document PDF (tableau de surfaces architecte).
Chaque mot est préfixé de sa position horizontale : [x=NNN]texte (NNN = position en pixels, arrondie à 10px).
Plusieurs bâtiments apparaissent côte à côte : leur nom est dans la ligne BATIMENT, et leurs colonnes occupent une plage X.

Méthode pour identifier les bâtiments et leurs logements :
1. Repère la ligne BATIMENT → chaque nom (A1, A2, B, E1...) a une position X de début
2. La ligne NIVEAU (RDC, R+1, R+2) définit les sous-colonnes de chaque bâtiment
3. La ligne N° liste les numéros de logements — associe chaque N° à son bâtiment selon sa position X
4. Les annotations (BRS), (LLS), (LLI) après un N° ou sur le nom du bâtiment indiquent le financement
5. La section VILLAS (N° 1,2,3,4...) = villas

Règles strictes :
- nb_logements = nombre exact de N° appartenant à ce bâtiment (selon position X)
- Annotations : (LLS) → LLS, (BRS) → BRS, (LLI) → LLI, sans annotation → acces_std
- Si financement sur le nom du bâtiment (ex: C (LLS)) → tous les logements sans annotation = LLS
- Typologies T1/T2/T3/T4/T5 sans annotation → acces_std
- Si nb_logements connu mais financements indéterminables → acces_std = nb_logements, autres = 0
- Ne jamais retourner null pour LLI/LLS/BRS/acces_std/acces_premium/villas — utiliser 0
- Ignorer #REF! (formules Excel cassées)
- Fiabilité "haute" si nos_comptes rempli, "estimee" sinon
- Retourne UNIQUEMENT le JSON valide, sans texte avant ni après, sans backticks

Format de sortie exact :
{
  "projet": null,
  "source": "nom_fichier",
  "batiments": [
    {
      "nom": "A",
      "montees": ["A1", "A2"],
      "nos_comptes": ["001", "002 (BRS)"],
      "nb_logements": 2,
      "LLI": null,
      "LLS": 0,
      "BRS": 1,
      "acces_std": 1,
      "acces_premium": null,
      "villas": 0,
      "fiabilite": "haute",
      "section_cctp": null,
      "feuilles_dpgf": [],
      "systeme_chauffage": null,
      "systeme_vmc": null,
      "regulation": null,
      "notes": null
    }
  ],
  "total_logements": 2,
  "donnees_manquantes": [],
  "hypotheses": []
}"""


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 1 — EXTRACTION TEXTE BRUT EXCEL
# ─────────────────────────────────────────────────────────────────

def _feuille_eligible(nom: str) -> bool:
    n = nom.lower().strip()
    return not any(n.startswith(p) for p in PREFIXES_FEUILLES_EXCLUES)


def _extraire_texte_brut_excel(file_bytes: bytes, nom_feuille: str = None) -> dict:
    """
    Lit le fichier Excel et produit un texte positionnel cellule par cellule.

    Retourne l'un de ces deux formats :
      {'texte': str, 'tronque': bool, 'feuille': str}
          — si une feuille cible est identifiée et extraite
      {'feuilles_disponibles': [...], 'feuille_suggeree': str}
          — si plusieurs feuilles éligibles et nom_feuille non fourni
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    feuilles_eligibles = [s for s in wb.sheetnames if _feuille_eligible(s)]

    # Résoudre la feuille cible
    if nom_feuille:
        cible = nom_feuille
    elif len(feuilles_eligibles) == 1:
        cible = feuilles_eligibles[0]
    elif not feuilles_eligibles:
        cible = wb.sheetnames[0]  # fallback : aucune feuille exclue
    else:
        # Plusieurs feuilles éligibles → retourner la liste pour sélection utilisateur
        suggeree = next(
            (s for s in feuilles_eligibles if 'surfaces pro' in s.lower()),
            feuilles_eligibles[0],
        )
        return {
            'feuilles_disponibles': feuilles_eligibles,
            'feuille_suggeree': suggeree,
        }

    if cible not in wb.sheetnames:
        raise ValueError(f"Feuille '{cible}' introuvable. Disponibles : {list(wb.sheetnames)}")

    ws = wb[cible]
    lignes_dump = []
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        cellules = []
        for j, val in enumerate(row):  # j = index 0-based
            if val is None:
                continue
            if isinstance(val, (datetime.date, datetime.datetime)):
                continue
            if isinstance(val, float):
                continue
            s = str(val).strip()
            if not s or s.startswith('='):
                continue
            cellules.append(f'col{j:02d}={s}')
        if cellules:
            lignes_dump.append(f'L{i:02d} | ' + ' | '.join(cellules))

    texte = '\n'.join(lignes_dump)
    tronque = len(texte) > LIMITE_TEXTE_BRUT
    if tronque:
        texte = texte[:LIMITE_TEXTE_BRUT]

    return {'texte': texte, 'tronque': tronque, 'feuille': cible}


def _extraire_texte_brut_pdf(file_bytes: bytes) -> str:
    """
    Extrait le texte d'un PDF avec pdfplumber.
    Utilise extract_words() avec regroupement par position Y.
    Inclut la position X de chaque mot (arrondie à 10px) pour permettre
    à Sonnet d'associer chaque valeur à sa colonne/bâtiment.
    """
    result = []
    Y_TOLERANCE = 10  # pixels de tolérance pour regrouper sur la même ligne

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            result.append(f"\n--- Page {i} ---")
            words = page.extract_words(x_tolerance=5, y_tolerance=5)

            if not words:
                text = page.extract_text()
                if text:
                    result.append(text)
                continue

            # Grouper les mots par ligne (Y proche)
            lignes = {}
            for w in words:
                bucket = round(w['top'] / Y_TOLERANCE) * Y_TOLERANCE
                if bucket not in lignes:
                    lignes[bucket] = []
                lignes[bucket].append(w)

            # Reconstruire chaque ligne triée par X, avec position X
            for y in sorted(lignes.keys()):
                mots = sorted(lignes[y], key=lambda w: w['x0'])
                # Format : [x=NNN]texte pour chaque mot — aide Sonnet à associer colonnes et bâtiments
                parties = [f"[x={round(m['x0']/10)*10}]{m['text']}" for m in mots]
                texte_ligne = '  '.join(parties)
                if texte_ligne.strip():
                    result.append(texte_ligne)

    texte = '\n'.join(result)
    if len(texte) > LIMITE_TEXTE_BRUT:
        texte = texte[:LIMITE_TEXTE_BRUT]
    return texte


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 2 — EXTRACTION SÉMANTIQUE VIA SONNET
# ─────────────────────────────────────────────────────────────────

def _compter_logements_individuels(dump: str) -> tuple:
    """
    Compte les N° de logements individuels depuis le dump positionnel groupé.

    Format attendu : "L01 | col00=BATIMENT | col02=A1 | col05=A2"
    col00 = colonne A (index 0-based).

    Détection lignes N° :
      - Primaire : col00 contient "N°" ou variante (N°, No, N.)
      - Fallback : ligne avec ≥3 tokens col\d+ de type N° 3-chiffres hors col00

    Retourne (count, tous_nos) :
      count    : int — total N° détectés (0 si format typologies/comptage)
      tous_nos : list[str] — liste brute exhaustive pour contrainte Sonnet
    """
    lignes_par_ln = {}   # {ln: [(col_idx, val)]}
    lignes_villas = set()
    lignes_numero = set()

    for line in dump.split('\n'):
        line = line.strip()
        if not line.startswith('L'):
            continue
        parts = line.split(' | ')
        if not parts:
            continue
        try:
            ln = int(parts[0][1:])
        except ValueError:
            continue
        cellules = []
        for part in parts[1:]:
            idx_str, _, val = part.partition('=')
            if not idx_str.startswith('col'):
                continue
            try:
                col_idx = int(idx_str[3:])
            except ValueError:
                continue
            val = val.strip()
            if not val:
                continue
            cellules.append((col_idx, val))
            if val.upper() == 'VILLAS':
                lignes_villas.add(ln)
            if col_idx == 0 and re.match(r'^N.{0,2}$', val):
                lignes_numero.add(ln)
        lignes_par_ln[ln] = cellules

    pat_collectif = re.compile(r'^\d{3,}(\s*\([^)]+\))?$')
    pat_villa_num = re.compile(r'^\d{1,2}$')

    # Fallback : ligne avec ≥3 N° 3-chiffres hors col00
    for ln, cellules in lignes_par_ln.items():
        if ln in lignes_numero or ln in lignes_villas:
            continue
        nb_nos = sum(1 for col_idx, val in cellules if col_idx > 0 and pat_collectif.match(val))
        if nb_nos >= 3:
            lignes_numero.add(ln)

    tous_nos = []
    for ln, cellules in lignes_par_ln.items():
        is_numero_row = ln in lignes_numero
        is_villa_row  = (ln - 1) in lignes_villas or (ln - 2) in lignes_villas
        for col_idx, val in cellules:
            if col_idx == 0:
                continue
            if is_numero_row and pat_collectif.match(val):
                tous_nos.append(val)
            elif is_villa_row and pat_villa_num.match(val):
                tous_nos.append(val)

    return len(tous_nos), tous_nos


def _formater_contrainte_nos(nb: int, tous_nos: list) -> str:
    """Formate la contrainte N° exhaustive pour le prompt Sonnet."""
    if not tous_nos:
        return ''
    return (
        f'\n\nContrainte stricte — {nb} N° de logements détectés par Python (liste exhaustive) :\n'
        f'{tous_nos}\n'
        'Règles absolues :\n'
        '- nos_comptes de chaque bâtiment = les N°s de cette liste qui lui appartiennent\n'
        '- Chaque N° doit figurer dans nos_comptes d\'exactement UN bâtiment (pas de doublon)\n'
        '- nb_logements = len(nos_comptes) pour chaque bâtiment\n'
        f'- total_logements DOIT être exactement {nb}'
    )


def _verifier_et_corriger_batiments(batiments: list, nb_python: int) -> tuple:
    """
    Vérifie la cohérence des nos_comptes et dérive les financements.

    Règle 1 — nb_logements = len(nos_comptes) : corrige silencieusement
    Financement global — nom ou montées contient "(LLS)"/"(LLI)"/"(BRS)" :
      tous les libres de ce bâtiment = ce financement
    Warning [NOS-PREM] — std+premium ≠ libres : tout mis en acces_std

    Dérive financements depuis annotations nos_comptes :
      "(LLS)" → LLS, "(BRS)" → BRS, "(LLI)" → LLI
      entier 1-2 chiffres → villas, sans annotation → accession libre

    Retourne (batiments_corrigés, warnings).
    """
    warnings = []
    pat_villa_num = re.compile(r'^\d{1,2}$')

    # Règle 1 : nb_logements = len(nos_comptes)
    for b in batiments:
        nos = b.get('nos_comptes') or []
        nb  = b.get('nb_logements')
        if nos and nb != len(nos):
            warnings.append(
                f"[NOS-R1] {b.get('nom', '?')} : nb_logements={nb} "
                f"≠ len(nos_comptes)={len(nos)} → corrigé"
            )
            b['nb_logements'] = len(nos)

    # R2 et R3 supprimées — les N° 001/101/201 se répètent légitimement dans chaque bâtiment
    # (chaque montée a son propre RDC/R+1/R+2), ce ne sont pas des doublons inter-bâtiments.

    # Vérification et dérivation financements
    # Règle : si somme(financements Sonnet) == nb_logements → Sonnet est cohérent → garder
    # Sinon → dériver depuis annotations dans nos_comptes (fallback)
    for b in batiments:
        nos = b.get('nos_comptes') or []
        nb  = b.get('nb_logements') or 0

        somme_sonnet = (
            (b.get('LLI') or 0) + (b.get('LLS') or 0) + (b.get('BRS') or 0) +
            (b.get('acces_std') or 0) + (b.get('acces_premium') or 0) +
            (b.get('villas') or 0)
        )

        if somme_sonnet == nb:
            # Sonnet cohérent → conserver sa répartition, normaliser None → 0
            b['LLI']           = b.get('LLI') or 0
            b['LLS']           = b.get('LLS') or 0
            b['BRS']           = b.get('BRS') or 0
            b['acces_std']     = b.get('acces_std') or 0
            b['acces_premium'] = b.get('acces_premium') or 0
            b['villas']        = b.get('villas') or 0
        else:
            # Sonnet incohérent → dériver depuis annotations nos_comptes
            if not nos:
                continue
            lls    = sum(1 for n in nos if re.search(r'\(LLS\)', n, re.IGNORECASE))
            brs    = sum(1 for n in nos if re.search(r'\(BRS\)', n, re.IGNORECASE))
            lli    = sum(1 for n in nos if re.search(r'\(LLI\)', n, re.IGNORECASE))
            villas = sum(1 for n in nos if pat_villa_num.match(n))
            libres = sum(1 for n in nos if not re.search(r'\(', n) and not pat_villa_num.match(n))

            # Financement global depuis nom bâtiment ou montées
            sources_nom = [b.get('nom', '')] + list(b.get('montees') or [])
            financement_global = None
            for source in sources_nom:
                if re.search(r'\(LLS\)', source, re.IGNORECASE):
                    financement_global = 'LLS'; break
                if re.search(r'\(LLI\)', source, re.IGNORECASE):
                    financement_global = 'LLI'; break
                if re.search(r'\(BRS\)', source, re.IGNORECASE):
                    financement_global = 'BRS'; break
            if financement_global and libres > 0:
                if financement_global == 'LLS':   lls += libres
                elif financement_global == 'LLI': lli += libres
                elif financement_global == 'BRS': brs += libres
                libres = 0

            b['LLS']           = lls or 0
            b['BRS']           = brs or 0
            b['LLI']           = lli or 0
            b['acces_std']     = libres or 0
            b['acces_premium'] = 0
            b['villas']        = villas or (b.get('villas') or 0)
            warnings.append(
                f"[FIN-DERIVE] {b.get('nom','?')} : "
                f"somme Sonnet ({somme_sonnet}) ≠ nb_logements ({nb}) → financements recalculés"
            )

        # Fiabilité haute si nb_logements connu
        if b.get('nb_logements') is not None:
            b['fiabilite'] = 'haute'

    return batiments, warnings


def _appeler_sonnet(texte_brut: str, nom_fichier: str, nb_logements_detectes: int = 0, tous_nos: list = None) -> dict:
    """
    Envoie le texte positionnel à Sonnet 4.6 et retourne le dict Python parsé.
    Si nb_logements_detectes > 0, ajoute la liste exhaustive des N°s comme contrainte.
    """
    contrainte = ''
    if nb_logements_detectes > 0:
        contrainte = _formater_contrainte_nos(nb_logements_detectes, tous_nos or [])

    client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))
    message = client.messages.create(
        model=MODELE_SONNET,
        max_tokens=4000,
        system=PROMPT_SYSTEME,
        messages=[{
            'role': 'user',
            'content': f'Fichier : {nom_fichier}{contrainte}\n\n{texte_brut}',
        }],
    )

    raw = message.content[0].text.strip()
    # Nettoyer les backticks markdown éventuels
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    # Parsing direct
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Fallback : extraire le bloc JSON depuis le premier { jusqu'à la fin
    idx = raw.find('{')
    if idx > 0:
        try:
            return json.loads(raw[idx:])
        except json.JSONDecodeError:
            pass

    raise ValueError(
        f"Sonnet n'a pas retourné un JSON valide.\n"
        f"Réponse brute (500 premiers chars) : {raw[:500]}"
    )


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 3 — VALIDATION
# ─────────────────────────────────────────────────────────────────

def _valider(batiments: list) -> list:
    """
    V1 : nb_logements = somme typologies — uniquement si fiabilite == "haute" ET financements non null.
    V5 : aucun financement identifié — skip si fiabilite "incomplete" ou "estimee".
    """
    warnings = []
    for b in batiments:
        fiabilite = b.get('fiabilite', 'incomplete')
        nb      = b.get('nb_logements') or 0
        LLI     = b.get('LLI') or 0
        LLS     = b.get('LLS') or 0
        BRS     = b.get('BRS') or 0
        std     = b.get('acces_std') or 0
        premium = b.get('acces_premium') or 0
        villas  = b.get('villas') or 0

        financements_null = all(
            b.get(k) is None
            for k in ('LLI', 'LLS', 'BRS', 'acces_std', 'acces_premium', 'villas')
        )

        if fiabilite == 'haute' and not financements_null:
            somme = LLI + LLS + BRS + std + premium + villas
            if somme != nb:
                warnings.append(
                    f"V1 [{b.get('nom', '?')}] : nb_logements={nb} ≠ somme typologies={somme}"
                )

        if fiabilite not in ('incomplete', 'estimee') and not financements_null:
            somme = LLI + LLS + BRS + std + premium + villas
            if nb > 0 and somme == 0:
                warnings.append(f"V5 [{b.get('nom', '?')}] : aucun financement identifié")

    return warnings


# ─────────────────────────────────────────────────────────────────
# STUB — conservé pour compatibilité import main.py
# ─────────────────────────────────────────────────────────────────

def proposer_regroupement(montees: list) -> dict:
    """Conservé pour compatibilité avec main.py — non utilisé dans le pipeline LLM."""
    return {}


# ─────────────────────────────────────────────────────────────────
# HELPERS INTERNES
# ─────────────────────────────────────────────────────────────────

def _run_extraction_sonnet(
    file_bytes: bytes,
    nom_fichier: str,
    nom_feuille: str = None,
    force_feuille_suggeree: bool = False,
) -> dict:
    """
    Extrait le texte brut et appelle Sonnet.
    Retourne soit un dict avec 'feuilles_disponibles' (sélection requise),
    soit un dict avec 'batiments', 'total_logements', etc.
    """
    resultat_extraction = _extraire_texte_brut_excel(file_bytes, nom_feuille)

    # Multi-feuilles sans cible forcée
    if 'feuilles_disponibles' in resultat_extraction:
        if force_feuille_suggeree:
            # En mode rétrocompat Appel 2 : utiliser la feuille suggérée automatiquement
            resultat_extraction = _extraire_texte_brut_excel(
                file_bytes, resultat_extraction['feuille_suggeree']
            )
        else:
            return resultat_extraction  # renvoi liste feuilles pour sélection UI

    texte_brut = resultat_extraction['texte']
    tronque = resultat_extraction.get('tronque', False)
    feuille_utilisee = resultat_extraction.get('feuille', nom_feuille or '')

    nb_individuels, tous_nos = _compter_logements_individuels(texte_brut)
    json_sonnet = _appeler_sonnet(texte_brut, nom_fichier, nb_logements_detectes=nb_individuels, tous_nos=tous_nos)

    print("=== JSON SONNET BRUT ===", flush=True)
    print(json.dumps(json_sonnet, ensure_ascii=False, indent=2), flush=True)
    print("=== FIN JSON SONNET ===", flush=True)

    batiments = json_sonnet.get('batiments', [])

    # Vérification et correction via nos_comptes
    if nb_individuels > 0:
        batiments, warnings_nos = _verifier_et_corriger_batiments(batiments, nb_individuels)
    else:
        warnings_nos = []

    # Total : Python fait foi si N° détectés, sinon Sonnet
    if nb_individuels > 0:
        total = nb_individuels
    else:
        total = json_sonnet.get('total_logements') or sum(
            (b.get('nb_logements') or 0) for b in batiments
        )

    donnees_manquantes = list(json_sonnet.get('donnees_manquantes', []))
    donnees_manquantes.extend(warnings_nos)
    hypotheses = list(json_sonnet.get('hypotheses', []))

    if tronque:
        donnees_manquantes.append(
            f"Fichier tronqué à {LIMITE_TEXTE_BRUT} caractères — données potentiellement incomplètes"
        )

    return {
        'projet': json_sonnet.get('projet'),
        'source': nom_fichier,
        'feuille': feuille_utilisee,
        'batiments': batiments,
        'total_logements': total,
        'donnees_manquantes': donnees_manquantes,
        'hypotheses': hypotheses,
    }


# ─────────────────────────────────────────────────────────────────
# POINT D'ENTRÉE PRINCIPAL
# ─────────────────────────────────────────────────────────────────

def _extraire_granulometrie_pdf(
    file_bytes: bytes,
    nom_fichier: str,
    regroupement_valide=None,
) -> dict:
    """Pipeline granulométrie pour fichiers PDF."""

    # Appel 2 nouveau format : l'utilisateur renvoie la liste validée
    if isinstance(regroupement_valide, list):
        batiments = regroupement_valide
        warnings = _valider(batiments)
        total = sum((b.get('nb_logements') or 0) for b in batiments)
        return {
            'projet': None,
            'source': nom_fichier,
            'batiments': batiments,
            'total_logements': total,
            'donnees_manquantes': warnings,
            'hypotheses': ['Données extraites depuis PDF via Sonnet 4.6 — vérifiées et confirmées par le BET'],
        }

    # Appel 1 : extraction + Sonnet
    texte_brut = _extraire_texte_brut_pdf(file_bytes)
    if not texte_brut.strip():
        raise ValueError("Le PDF ne contient pas de texte extractible. Vérifiez qu'il n'est pas scanné.")

    client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))
    message = client.messages.create(
        model=MODELE_SONNET,
        max_tokens=8000,
        system=PROMPT_SYSTEME_PDF,
        messages=[{'role': 'user', 'content': f'Fichier : {nom_fichier}\n\n{texte_brut}'}],
    )
    raw = message.content[0].text.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        json_sonnet = json.loads(raw)
    except json.JSONDecodeError:
        idx = raw.find('{')
        if idx >= 0:
            json_sonnet = json.loads(raw[idx:])
        else:
            raise ValueError(f"Sonnet n'a pas retourné un JSON valide.\nRéponse : {raw[:500]}")

    batiments = json_sonnet.get('batiments', [])
    batiments, warnings_nos = _verifier_et_corriger_batiments(batiments, 0)

    # Fallback : si tous les financements sont null mais nb_logements connu → acces_std = nb_logements
    for b in batiments:
        champs_fin = ('LLI', 'LLS', 'BRS', 'acces_std', 'acces_premium', 'villas')
        tous_null = all(b.get(f) is None for f in champs_fin)
        nb = b.get('nb_logements')
        if tous_null and nb:
            b['LLI'] = 0; b['LLS'] = 0; b['BRS'] = 0
            b['acces_std'] = nb; b['acces_premium'] = 0; b['villas'] = 0

    total = json_sonnet.get('total_logements') or sum((b.get('nb_logements') or 0) for b in batiments)
    donnees_manquantes = list(json_sonnet.get('donnees_manquantes', []))
    donnees_manquantes.extend(warnings_nos)

    print("=== JSON SONNET PDF BRUT ===", flush=True)
    print(json.dumps(json_sonnet, ensure_ascii=False, indent=2), flush=True)
    print("=== FIN JSON SONNET PDF ===", flush=True)

    return {
        'etape': 'validation',
        'projet': json_sonnet.get('projet'),
        'source': nom_fichier,
        'feuille': '',
        'batiments': batiments,
        'total_logements': total,
        'donnees_manquantes': donnees_manquantes,
        'hypotheses': json_sonnet.get('hypotheses', []),
    }


def extraire_granulometrie(
    file_bytes: bytes,
    nom_fichier: str,
    regroupement_valide=None,
    nom_feuille: str = None,
) -> dict:
    """
    Pipeline granulométrie LLM universel.

    Appel 1 (regroupement_valide=None) :
      → Extrait texte brut + appelle Sonnet
      → Retourne {etape: "selection_feuille"} si multi-feuilles
      → Retourne {etape: "validation", batiments: [...]} sinon

    Appel 2 nouveau format (regroupement_valide = list) :
      → Valide les batiments confirmés/édités par l'utilisateur
      → Retourne JSON D1 final (pas de second appel Sonnet)

    Appel 2 rétrocompat (regroupement_valide = dict {groupe: [montees]}) :
      → Re-extrait + appelle Sonnet → retourne JSON D1 final
    """
    ext = nom_fichier.lower().rsplit('.', 1)[-1] if '.' in nom_fichier else ''
    if ext == 'pdf':
        return _extraire_granulometrie_pdf(file_bytes, nom_fichier, regroupement_valide)
    if ext not in ('xlsx', 'xlsm', 'xls'):
        raise ValueError(f"Format non supporté : {ext}. Acceptés : xlsx, xlsm, xls")

    # ── Appel 2 nouveau format : l'utilisateur renvoie la liste de batiments validée ──
    if isinstance(regroupement_valide, list):
        batiments = regroupement_valide
        warnings = _valider(batiments)
        total = sum((b.get('nb_logements') or 0) for b in batiments)
        return {
            'projet': None,
            'source': nom_fichier,
            'batiments': batiments,
            'total_logements': total,
            'donnees_manquantes': warnings,
            'hypotheses': [
                'Données extraites via Sonnet 4.6 — vérifiées et confirmées par le BET',
            ],
        }

    # ── Appel 1 + Appel 2 rétrocompat (dict) : extraction texte + Sonnet ──
    force_suggeree = isinstance(regroupement_valide, dict)
    resultat = _run_extraction_sonnet(
        file_bytes, nom_fichier, nom_feuille, force_feuille_suggeree=force_suggeree
    )

    # Cas : sélection de feuille nécessaire (Appel 1 multi-feuilles uniquement)
    if 'feuilles_disponibles' in resultat:
        return {
            'etape': 'selection_feuille',
            'feuilles_disponibles': resultat['feuilles_disponibles'],
            'feuille_suggeree': resultat['feuille_suggeree'],
            'message': 'Plusieurs feuilles disponibles. Confirmer la feuille de référence.',
        }

    batiments          = resultat['batiments']
    total              = resultat['total_logements']
    donnees_manquantes = resultat['donnees_manquantes']
    hypotheses         = resultat['hypotheses']

    # ── Appel 1 : retourner pour validation utilisateur ──
    if regroupement_valide is None:
        return {
            'etape': 'validation',
            'projet': resultat.get('projet'),
            'source': nom_fichier,
            'feuille': resultat.get('feuille', ''),
            'batiments': batiments,
            'total_logements': total,
            'donnees_manquantes': donnees_manquantes,
            'hypotheses': hypotheses,
        }

    # ── Appel 2 rétrocompat (dict) : retourner JSON D1 final avec données Sonnet ──
    warnings = _valider(batiments)
    warnings.extend(donnees_manquantes)
    return {
        'projet': resultat.get('projet'),
        'source': nom_fichier,
        'batiments': batiments,
        'total_logements': total,
        'donnees_manquantes': warnings,
        'hypotheses': hypotheses,
    }
```

---
## parser-service/main.py
```
"""
Synthek Parser Service — microservice local (port 5001)
Parsing amélioré de fichiers DPGF/CCTP/PDF avec reconstruction hiérarchie parent/enfant.
"""
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify
import openpyxl
from docx import Document
import pdfplumber
import base64
import io
import traceback
from comparaison_cctp_dpgf import extraire_cctp, extraire_dpgf, detecter_alertes, extraire_programme
from equivalences_fluides import est_ligne_exclue, sont_equivalents
from extraire_granulometrie import extraire_granulometrie, proposer_regroupement

app = Flask(__name__)


def parse_xlsx(file_bytes):
    """
    Parse Excel DPGF avec reconstruction de la hiérarchie parent/enfant.
    Les lignes-sections (ex: "Vanne d'arrêt générale repérée") sont préfixées
    aux lignes-détail (ex: "DN 40 : 1 u") pour que Claude ait le contexte complet.
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    result = []

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        result.append(f"\n=== Feuille: {sheet_name} ===")

        current_section = ""

        for row in ws.iter_rows(values_only=True):
            # Ignorer les lignes vides
            cells = [str(c).strip() if c is not None else '' for c in row]
            if all(c == '' for c in cells):
                continue

            first_cell = cells[0] if cells else ''
            other_cells = [c for c in cells[1:] if c and c != '0' and c != 'None']

            # Détection ligne-section : première colonne substantielle, peu d'autres données,
            # et pas de valeur numérique isolée dans les premières colonnes
            def is_numeric(s):
                try:
                    float(s.replace(',', '.').replace(' ', ''))
                    return True
                except ValueError:
                    return False

            has_price = any(is_numeric(c) for c in cells[2:5] if c)
            qte_value = cells[1] if len(cells) > 1 else ''
            has_quantity = is_numeric(qte_value)
            is_section = (
                len(first_cell) > 8
                and not has_quantity
                and len(other_cells) < 3
                and not has_price
            )

            if is_section:
                current_section = first_cell
                result.append(f"\n[SECTION] {first_cell}")
            else:
                content = ' | '.join(c for c in cells if c and c != 'None')
                if content:
                    if current_section and first_cell and first_cell != current_section:
                        result.append(f"{current_section} > {content}")
                    elif content:
                        result.append(content)

    return '\n'.join(result)


def parse_docx(file_bytes):
    """
    Parse Word document avec chunking par styles Heading (Titre 1/2/3).
    Reconstruit la structure documentaire pour faciliter l'extraction de sections.
    """
    doc = Document(io.BytesIO(file_bytes))
    result = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        style_name = para.style.name.lower()

        # Ignorer la table des matières
        if any(s in style_name for s in ['toc ', 'toc\t', 'table des mat']):
            continue

        if any(s in style_name for s in ['heading 1', 'titre 1', 'heading1']):
            result.append(f"\n## {text}")
        elif any(s in style_name for s in ['heading 2', 'titre 2', 'heading2']):
            result.append(f"\n### {text}")
        elif any(s in style_name for s in ['heading 3', 'titre 3', 'heading3']):
            result.append(f"\n#### {text}")
        elif any(s in style_name for s in ['heading 4', 'titre 4', 'heading4']):
            result.append(f"\n##### {text}")
        else:
            result.append(text)

    # Traiter les tableaux
    for table in doc.tables:
        result.append("\n[TABLEAU]")
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            line = ' | '.join(c for c in cells if c)
            if line:
                result.append(line)

    return '\n'.join(result)


def parse_pdf(file_bytes):
    """
    Parse PDF avec pdfplumber pour meilleure extraction tabulaire.
    Fallback sur extraction texte brut si pas de tableaux détectés.
    """
    result = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if tables:
                result.append(f"\n--- Page {i + 1} ---")
                for table in tables:
                    for row in table:
                        cells = [str(c).strip() if c else '' for c in row]
                        non_empty = [c for c in cells if c]
                        if non_empty:
                            result.append(' | '.join(non_empty))
            else:
                text = page.extract_text()
                if text:
                    result.append(f"\n--- Page {i + 1} ---")
                    result.append(text)

    return '\n'.join(result)


@app.route('/parse/xlsx', methods=['POST'])
def route_xlsx():
    try:
        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({'error': 'content (base64) requis'}), 400
        file_bytes = base64.b64decode(data['content'])
        texte = parse_xlsx(file_bytes)
        return jsonify({'texte': texte})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/parse/docx', methods=['POST'])
def route_docx():
    try:
        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({'error': 'content (base64) requis'}), 400
        file_bytes = base64.b64decode(data['content'])
        texte = parse_docx(file_bytes)
        return jsonify({'texte': texte})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/parse/pdf', methods=['POST'])
def route_pdf():
    try:
        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({'error': 'content (base64) requis'}), 400
        file_bytes = base64.b64decode(data['content'])
        texte = parse_pdf(file_bytes)
        return jsonify({'texte': texte})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


def _criticite_moeai_to_synthek(code):
    """Convertit le code MOE.AI en criticité Synthek — V2.1 complet."""
    return {
        'C01': 'MAJEUR',
        'C02': 'MINEUR',
        'C03': 'CRITIQUE',
        'C04': 'MAJEUR',
        'C05': 'CRITIQUE',
        'INCERTAIN': 'INCERTAIN',
    }.get(code, 'MINEUR')


@app.route('/compare/cctp-dpgf', methods=['POST'])
def route_compare_cctp_dpgf():
    """
    Compare un CCTP et un DPGF selon les règles MOE.AI.

    Body JSON :
    {
        "cctp": "<base64 du .docx>",
        "dpgf": "<base64 du .xlsx>",
        "config": {
            "projet": "Mon projet",
            "mapping_batiments": {
                "CCTP_section_3": ["BAT A", "BAT B"]
            },
            "programme": [
                {
                    "nom": "Bâtiment A",
                    "section_cctp": "CCTP_section_3",
                    "feuilles_dpgf": ["BAT A"],
                    "nb_logements_total": 12,
                    "types_logements": {"Accession": 8, "BRS": 4},
                    "systeme_chauffage": "Chaudière gaz N0/N1 + PAC N2"
                }
            ]
        }
    }

    Retourne :
    {
        "alertes": [ ... ],
        "nb_alertes": 5,
        "nb_conformes": 245
    }
    """
    try:
        data = request.get_json()
        if not data or 'cctp' not in data or 'dpgf' not in data:
            return jsonify({'error': 'cctp (base64) et dpgf (base64) requis'}), 400

        cctp_bytes = base64.b64decode(data['cctp'])
        dpgf_bytes = base64.b64decode(data['dpgf'])
        config = data.get('config', {})

        if not config.get('mapping_batiments'):
            config['mapping_batiments'] = {}

        # Extraire le programme bâtiment si présent
        programme = extraire_programme(config) if 'programme' in config else None

        articles = extraire_cctp(cctp_bytes, config)
        lignes = extraire_dpgf(dpgf_bytes, config)
        alertes = detecter_alertes(
            articles, lignes, config,
            utiliser_ia=False,
            programme=programme,
        )

        return jsonify({
            'alertes': [
                {
                    'code': a.code,
                    'criticite': _criticite_moeai_to_synthek(a.code),
                    'confiance': a.confiance,
                    'batiment': a.batiment,
                    'cctp_section': a.cctp_section,
                    'cctp_texte': a.cctp_texte,
                    'dpgf_feuille': a.dpgf_feuille,
                    'dpgf_ligne': a.dpgf_ligne,
                    'dpgf_texte': a.dpgf_texte,
                    'motif': a.motif,
                    'regle': a.regle,
                    'methode': a.methode,
                }
                for a in alertes
            ],
            'nb_alertes': len(alertes),
            'nb_conformes': max(0, len(articles) - len(alertes)),
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/granulometrie/proposer', methods=['POST'])
def route_granulometrie_proposer():
    try:
        data = request.get_json()
        if not data or 'fichier' not in data or 'nom_fichier' not in data:
            return jsonify({'error': 'fichier (base64) et nom_fichier requis'}), 400
        file_bytes = base64.b64decode(data['fichier'])
        nom_fichier = data['nom_fichier']
        nom_feuille = data.get('nom_feuille')
        result = extraire_granulometrie(file_bytes, nom_fichier, regroupement_valide=None, nom_feuille=nom_feuille)
        return jsonify(result)
    except NotImplementedError as e:
        return jsonify({'error': str(e)}), 501
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/granulometrie/import', methods=['POST'])
def route_granulometrie_import():
    try:
        data = request.get_json()
        if not data or 'fichier' not in data or 'nom_fichier' not in data:
            return jsonify({'error': 'fichier (base64) et nom_fichier requis'}), 400
        if 'regroupement' not in data:
            return jsonify({'error': 'regroupement requis - appeler /granulometrie/proposer dabord'}), 400
        file_bytes = base64.b64decode(data['fichier'])
        nom_fichier = data['nom_fichier']
        regroupement = data['regroupement']
        nom_feuille = data.get('nom_feuille')
        import json
        print("=== BODY /granulometrie/import ===", flush=True)
        print("nom_fichier:", nom_fichier, flush=True)
        print("regroupement:", json.dumps(regroupement, ensure_ascii=False, indent=2), flush=True)
        print("=== FIN BODY ===", flush=True)
        result = extraire_granulometrie(file_bytes, nom_fichier, regroupement_valide=regroupement, nom_feuille=nom_feuille)
        return jsonify(result)
    except NotImplementedError as e:
        return jsonify({'error': str(e)}), 501
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False)
```

---
## frontend/src/pages/Projet.jsx
```
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import logo from '../assets/images/synthek.png'
import { useTheme } from '../context/ThemeContext'

const PHASES = ['APS', 'APD', 'PRO', 'DCE', 'EXE']

const PHASE_COLORS = {
  APS: '#7c3aed', APD: '#2563eb', PRO: '#0891b2',
  DCE: '#059669', EXE: '#dc2626'
}

const PHASE_LEXIQUE = [
  { sigle: 'APS', nom: 'Avant-Projet Sommaire',          color: '#7c3aed', desc: 'Première esquisse technique. Grands principes constructifs, estimation globale du coût de l\'opération.' },
  { sigle: 'APD', nom: 'Avant-Projet Définitif',         color: '#2563eb', desc: 'Études approfondies, plans détaillés de tous les lots. Estimation précise du coût des travaux.' },
  { sigle: 'PRO', nom: 'Projet',                         color: '#0891b2', desc: 'Plans d\'exécution complets, tous les lots définis. Dossier technique finalisé avant consultation.' },
  { sigle: 'DCE', nom: 'Dossier de Consultation des Entreprises', color: '#059669', desc: 'Appel d\'offres — CCTP, DPGF et plans envoyés aux entreprises pour chiffrage et sélection.' },
  { sigle: 'EXE', nom: 'Exécution',                      color: '#dc2626', desc: 'Phase chantier. Suivi des travaux, visa des plans d\'exécution des entreprises, réception.' },
]

function LexiqueModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Phases de la mission MOE</h3>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Nomenclature loi MOP — maîtrise d'œuvre en construction.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PHASE_LEXIQUE.map(p => (
            <div key={p.sigle} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{
                background: p.color,
                color: 'white',
                fontWeight: 800,
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 20,
                letterSpacing: '0.06em',
                flexShrink: 0,
                marginTop: 2,
                minWidth: 44,
                textAlign: 'center',
              }}>
                {p.sigle}
              </span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{p.nom}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FaitsModal({ doc, onClose }) {
  const [faits, setFaits] = useState(null)

  useEffect(() => {
    api.get(`/documents/${doc.id}/faits`).then(r => setFaits(r.data))
  }, [doc.id])

  const LABELS = {
    quantite: 'Quantités', materiau: 'Matériaux', dimension: 'Dimensions',
    norme: 'Normes', performance: 'Performances', equipement: 'Équipements', contrainte: 'Contraintes'
  }

  const groupes = faits ? faits.filter(f => f.valeur && f.valeur.trim().toLowerCase() !== 'n/a').reduce((acc, f) => {
    if (!acc[f.categorie]) acc[f.categorie] = []
    acc[f.categorie].push(f)
    return acc
  }, {}) : {}

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: 15 }}>Faits extraits — {doc.nom}</h3>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        {faits === null ? (
          <p className="text-muted">Chargement...</p>
        ) : Object.keys(groupes).length === 0 ? (
          <p className="text-muted">Aucun fait extrait pour ce document.</p>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '65vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(groupes).map(([cat, items]) => (
              <div key={cat}>
                <p style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  {LABELS[cat] || cat} ({items.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{f.sujet}</span>
                      <span style={{ color: '#7c3aed', fontWeight: 700 }}>{f.valeur}{f.unite ? ` ${f.unite}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProgrammeCard({ doc, isAdmin, onDelete }) {
  const [showFaits, setShowFaits] = useState(false)
  return (
    <>
      <div className="card programme-card-inner" style={{ borderLeft: '3px solid #7c3aed', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {doc.nom}
          </p>
          <p className="text-muted text-sm" style={{ margin: '2px 0 0' }}>
            Déposé par {doc.user?.nom} · {new Date(doc.dateDepot).toLocaleDateString('fr-FR')}
            {doc.indiceRevision && <> · <strong>{doc.indiceRevision}</strong></>}
          </p>
        </div>
        <div className="programme-card-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="badge" style={{ background: '#7c3aed', color: 'white', fontSize: 11 }}>
            {doc.type.toUpperCase()}
          </span>
          <PuceCard puce={doc.puce} />
          <button onClick={() => setShowFaits(true)} className="btn-ghost" style={{ fontSize: 12, padding: '3px 10px', border: '1px solid var(--border)' }} title="Voir les données extraites">
            🔍 Données
          </button>
          {isAdmin && (
            <button onClick={onDelete} className="btn-ghost" style={{ color: '#ef4444', padding: '2px 8px', fontSize: 13 }} title="Supprimer">
              ✕
            </button>
          )}
        </div>
      </div>
      {showFaits && <FaitsModal doc={doc} onClose={() => setShowFaits(false)} />}
    </>
  )
}

function PuceCard({ puce }) {
  if (!puce) return <span className="text-muted text-sm">—</span>
  return (
    <div className="puce-inline">
      {puce.typeLivrable && <span className="badge-puce">{puce.typeLivrable}</span>}
      {puce.valeurCle && <span className="puce-valeur">{puce.valeurCle}</span>}
    </div>
  )
}

export default function Projet() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [verifEnCours, setVerifEnCours] = useState(false)
  const [verifMsg, setVerifMsg] = useState(null)
  const [analyseBg, setAnalyseBg] = useState(false) // polling en cours
  const [analyseTimer, setAnalyseTimer] = useState(0)
  const pollingRef = useRef(null)
  const timerRef = useRef(null)
  const puceDetecteeRef = useRef(false)
  const stableCyclesRef = useRef(0)
  const lastAlertCountRef = useRef(-1)
  const { theme, toggleTheme } = useTheme()
  const [projet, setProjet] = useState(null)
  const [alertes, setAlertes] = useState([])
  const [alerteSourceOuverte, setAlerteSourceOuverte] = useState(null)
  const [alerteDpgfOuverte, setAlerteDpgfOuverte] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [emailInvite, setEmailInvite] = useState('')
  const [roleInvite, setRoleInvite] = useState('moa')
  const [inviteError, setInviteError] = useState('')
  const [showPhase, setShowPhase] = useState(false)
  const [phaseEnCours, setPhaseEnCours] = useState(false)
  const [phaseMsg, setPhaseMsg] = useState(null)
  const [certEnCours, setCertEnCours] = useState(false)
  const [rapportEnCours, setRapportEnCours] = useState(false)
  const [rapportMsg, setRapportMsg] = useState(null)
  const [showJalon, setShowJalon] = useState(false)
  const [jalonChoisi, setJalonChoisi] = useState('DCE')
  const [showLexique, setShowLexique] = useState(false)
  const [showAlertes, setShowAlertes] = useState(false)
  const [alertesGroupesOuverts, setAlertesGroupesOuverts] = useState(new Set())
  const [filtresCriticite, setFiltresCriticite] = useState(new Set())
  const [filtreGroupe, setFiltreGroupe] = useState('')
  const [programmesOuverts, setProgrammesOuverts] = useState(new Set())
  const [showDeleteDoc, setShowDeleteDoc] = useState(null) // { id, nom }
  const [deleteResoudreAlertes, setDeleteResoudreAlertes] = useState(false)
  const [showComparerModal, setShowComparerModal] = useState(null) // { id, nom }
  const [showTexteModal, setShowTexteModal] = useState(null) // { id, nom, contenuTexte, loading }
  const [showPreAnalyse, setShowPreAnalyse] = useState(null) // { loading, data, error }
  const [preAnalyseFeedback, setPreAnalyseFeedback] = useState({}) // { idx: 'ok'|'fp' }

  const [triDoc, setTriDoc] = useState({ col: 'dateDepot', dir: 'desc' })
  const [modifierEnCours, setModifierEnCours] = useState(null) // docId en cours d'upload
  const [comparerIdsRef, setComparerIdsRef] = useState([])
  const [comparerMode, setComparerMode] = useState('technique')
  const [comparerEnCours, setComparerEnCours] = useState(false)
  const [comparerModele, setComparerModele] = useState('sonnet')
  const [showEditProjet, setShowEditProjet] = useState(false)
  const [editMeta, setEditMeta] = useState({})

  const TYPES_OPERATION = [
    'Logements collectifs neufs',
    'Logements individuels groupés neufs',
    'Logements collectifs neufs et individuels neufs',
    'Réhabilitation logements collectifs',
  ]
  const RT_OPTIONS = [
    { value: 'RT2012', label: 'RT2012', detail: 'PC déposé avant le 01/01/2022' },
    { value: 'RE2020_2022', label: 'RE2020 — Seuil 2022', detail: 'PC déposé entre 01/01/2022 et 31/12/2024' },
    { value: 'RE2020_2025', label: 'RE2020 — Seuil 2025', detail: 'PC déposé entre 01/01/2025 et 31/12/2027' },
    { value: 'RE2020_2028', label: 'RE2020 — Seuil 2028', detail: 'PC déposé à partir du 01/01/2028 ou avance de phase / exigence PLUi' },
    { value: 'RT_existant_elements', label: 'RT bâtiments existants par éléments', detail: '' },
    { value: 'RT_existant_global', label: 'RT bâtiments existants global', detail: '' },
  ]
  const ZONES_CLIM = ['H1a', 'H1b', 'H1c', 'H2a', 'H2b', 'H2c', 'H2d', 'H3']
  const LABELS_OPTIONS = ['NF Habitat', 'NF Habitat HQE', 'BBCA', 'E+C-', 'Aucune']

  function getMeta() {
    try { return JSON.parse(projet.metadonnees || '{}') } catch { return {} }
  }
  const [showIntervenants, setShowIntervenants] = useState(false)
  const [editIntervenants, setEditIntervenants] = useState(false)

  const INTERVENANTS_BASE = [
    { role: 'MOA', label: 'Maître d\'ouvrage (MOA)' },
    { role: 'MOE', label: 'Maître d\'œuvre d\'exécution (MOE)' },
    { role: 'Architecte', label: 'Architecte mandataire' },
    { role: 'BET Structure', label: 'Bureau d\'études Structure' },
    { role: 'BET Fluides', label: 'Bureau d\'études Fluides / CVC / Plomberie' },
    { role: 'BET Électricité', label: 'Bureau d\'études Électricité / CFO-CFA' },
    { role: 'BET VRD', label: 'Bureau d\'études VRD / Réseaux extérieurs' },
    { role: 'BCT', label: 'Bureau de contrôle technique (BCT)' },
    { role: 'Économiste', label: 'Économiste de la construction' },
  ]
  const BCT_MISSIONS = ['L', 'S', 'Ph', 'Hand', 'Th', 'Élec']

  function getIntervenants() {
    try { return JSON.parse(projet.intervenants || '[]') } catch { return [] }
  }

  function getIntervenant(role) {
    return getIntervenants().find(i => i.role === role) || { role, societe: '', contact: '', email: '', tel: '', missions: [] }
  }

  const [intervenantsEdit, setIntervenantsEdit] = useState([])
  const [editNom, setEditNom] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editAdresse, setEditAdresse] = useState('')
  const [editTypeBatiment, setEditTypeBatiment] = useState('')
  const [editNombreNiveaux, setEditNombreNiveaux] = useState('')
  const [editShon, setEditShon] = useState('')
  const [editEnergieRetenue, setEditEnergieRetenue] = useState('')
  const [editZoneClimatique, setEditZoneClimatique] = useState('')
  const [editClassementErp, setEditClassementErp] = useState(false)
  const [editTypeErp, setEditTypeErp] = useState('')
  const [editNombreLogements, setEditNombreLogements] = useState('')
  const [editBatiments, setEditBatiments] = useState([]) // [{ id?, nom, typologies[] }]
  const [editEnCours, setEditEnCours] = useState(false)

  const TYPOLOGIES_BASE = ['Social LLS', 'Social LLI', 'Accession BRS', 'Accession standard', 'Accession premium / Attique']
  const [typologiesCustom, setTypologiesCustom] = useState([])
  const [nouvelleTypologie, setNouvelleTypologie] = useState(null)
  const TYPOLOGIES_OPTIONS = [...TYPOLOGIES_BASE, ...typologiesCustom.map(t => t.nom)]

  // Bâtiments
  const [showBatiments, setShowBatiments] = useState(false)
  const [showProgrammes, setShowProgrammes] = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)
  const [batimentEditIdx, setBatimentEditIdx] = useState(null)
  const [batimentEditNom, setBatimentEditNom] = useState('')
  const [batimentEditTypos, setBatimentEditTypos] = useState([])
  const [showAddBatiment, setShowAddBatiment] = useState(false)
  const [newBatimentNom, setNewBatimentNom] = useState('')
  const [newBatimentTypos, setNewBatimentTypos] = useState([])
  // Import granulométrie depuis fichier architecte
  const [importGranuloStep, setImportGranuloStep] = useState(0) // 0=caché, 1=proposition, 2=résultat
  const [importGranuloLoading, setImportGranuloLoading] = useState(false)
  const [importGranuloError, setImportGranuloError] = useState(null)
  const [importGranuloFichierB64, setImportGranuloFichierB64] = useState(null)
  const [importGranuloNomFichier, setImportGranuloNomFichier] = useState('')
  const [feuillesDisponibles, setFeuillesDisponibles] = useState(null) // { feuilles_disponibles, feuille_suggeree }
  const [regroupementEdite, setRegroupementEdite] = useState(null) // liste de batiment objects (Sonnet)
  const [granulometreD1, setGranulometreD1] = useState(null)
  const [monteesEdit, setMonteesEdit] = useState({}) // { [batNom]: valeur en cours d'édition }
  const [newBatD1, setNewBatD1] = useState(null) // null = caché, objet = ligne inline d'ajout

  // V3 — Config IA
  const [showConfig, setShowConfig] = useState(false)
  const [configPrompt, setConfigPrompt] = useState('')
  const [configSeuils, setConfigSeuils] = useState('')
  const [configVocabEntries, setConfigVocabEntries] = useState([]) // [{ terme, definition }]
  const [showVocabImport, setShowVocabImport] = useState(false)
  const [vocabImportText, setVocabImportText] = useState('')
  const [configNommage, setConfigNommage] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  // V3 — Résolution alerte enrichie
  const [showResolModal, setShowResolModal] = useState(null)
  const [resolType, setResolType] = useState('manuelle')
  const [resolJustif, setResolJustif] = useState('')

  // Sous-programmes
  const [showSousProgrammes, setShowSousProgrammes] = useState(false)
  const dragSpIdx = useRef(null)
  const dragBatIdx = useRef(null)
  const [nouveauSp, setNouveauSp] = useState('')
  const [spEnCours, setSpEnCours] = useState(false)
  const [spRenomId, setSpRenomId] = useState(null)
  const [spRenomNom, setSpRenomNom] = useState('')

  useEffect(() => {
    Promise.all([
      api.get(`/projets/${id}`),
      api.get(`/alertes/${id}`),
      api.get('/typologies')
    ]).then(([pRes, aRes, tRes]) => {
      setProjet(pRes.data)
      setAlertes(aRes.data)
      setTypologiesCustom(tRes.data)
      // Détecter format D1 et restaurer le tableau granulométrie
      if (pRes.data.batimentsComposition) {
        try {
          const bats = JSON.parse(pRes.data.batimentsComposition)
          if (bats?.length && ('LLI' in bats[0] || 'acces_std' in bats[0])) {
            setGranulometreD1({ batiments: bats, total_logements: bats.reduce((s, b) => s + (b.nb_logements || 0), 0), donnees_manquantes: [], source: '' })
          }
        } catch {}
      }
      setLoading(false)
    })
  }, [id])

  // Polling après upload
  useEffect(() => {
    const newDocId = location.state?.newDocId
    if (!newDocId) return
    const storageKey = `polling_done_${newDocId}`
    if (sessionStorage.getItem(storageKey)) return
    sessionStorage.setItem(storageKey, '1')
    setAnalyseBg(true)
    setAnalyseTimer(0)
    puceDetecteeRef.current = false
    stableCyclesRef.current = 0
    lastAlertCountRef.current = -1
    const start = Date.now()
    const TIMEOUT = 600000 // 10 min max

    timerRef.current = setInterval(() => {
      setAnalyseTimer(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    pollingRef.current = setInterval(async () => {
      if (Date.now() - start > TIMEOUT) {
        clearInterval(pollingRef.current)
        clearInterval(timerRef.current)
        setAnalyseBg(false)
        return
      }
      try {
        const [pRes, aRes] = await Promise.all([
          api.get(`/projets/${id}`),
          api.get(`/alertes/${id}`)
        ])
        const doc = pRes.data.documents?.find(d => d.id === newDocId)
        setProjet(pRes.data)
        setAlertes(aRes.data)

        if (doc?.puce || !doc) {
          clearInterval(pollingRef.current)
          clearInterval(timerRef.current)
          setAnalyseBg(false)
        }
      } catch {
        clearInterval(pollingRef.current)
        clearInterval(timerRef.current)
        setAnalyseBg(false)
      }
    }, 3000)

    return () => {
      clearInterval(pollingRef.current)
      clearInterval(timerRef.current)
    }
  }, [location.state?.newDocId, id])

  async function chargerConfig() {
    try {
      const res = await api.get(`/projets/${id}/config`)
      if (res.data) {
        setConfigPrompt(res.data.promptSystemeGlobal || '')
        setConfigSeuils(res.data.seuilsTolerance ? JSON.stringify(res.data.seuilsTolerance, null, 2) : '')
        setConfigVocabEntries(res.data.vocabulaireMetier ? Object.entries(res.data.vocabulaireMetier).map(([terme, definition]) => ({ terme, definition: Array.isArray(definition) ? definition.join(', ') : String(definition) })) : [])
        setConfigNommage(res.data.conventionNommage || '')
      }
      setShowConfig(true)
    } catch {
      setShowConfig(true)
    }
  }

  async function sauvegarderConfig(e) {
    e.preventDefault()
    setConfigSaving(true)
    setConfigMsg('')
    try {
      const body = {
        promptSystemeGlobal: configPrompt || null,
        conventionNommage: configNommage || null,
        seuilsTolerance: configSeuils ? JSON.parse(configSeuils) : null,
        vocabulaireMetier: configVocabEntries.filter(e => e.terme.trim()).length > 0
          ? Object.fromEntries(configVocabEntries.filter(e => e.terme.trim()).map(e => [e.terme.trim(), e.definition.trim()]))
          : null
      }
      await api.post(`/projets/${id}/config`, body)
      setConfigMsg('Configuration sauvegardée')
    } catch (err) {
      setConfigMsg(err.response?.data?.error || 'Erreur JSON ou serveur')
    } finally {
      setConfigSaving(false)
    }
  }

  function getBatiments() {
    try { return projet?.batimentsComposition ? JSON.parse(projet.batimentsComposition) : [] }
    catch { return [] }
  }

  async function saveBatiments(newBats) {
    const res = await api.patch(`/projets/${id}`, {
      batimentsComposition: newBats.length ? JSON.stringify(newBats) : null
    })
    setProjet(prev => ({ ...prev, batimentsComposition: res.data.batimentsComposition }))
  }

  async function ajouterBatimentLocal() {
    if (!newBatimentNom.trim()) return
    const updated = [...getBatiments(), { nom: newBatimentNom.trim(), typologies: newBatimentTypos }]
    await saveBatiments(updated)
    setNewBatimentNom(''); setNewBatimentTypos([]); setShowAddBatiment(false)
  }

  async function importerGranuloFichier(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportGranuloError(null)
    setImportGranuloLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      const b64 = btoa(binary)
      setImportGranuloFichierB64(b64)
      setImportGranuloNomFichier(file.name)
      const res = await api.post(`/projets/${id}/granulometrie/proposer`, { fichier: b64, nom_fichier: file.name })
      if (res.data.etape === 'selection_feuille') {
        setFeuillesDisponibles(res.data)
        setImportGranuloStep(1)
      } else if (res.data.etape === 'validation') {
        setFeuillesDisponibles(null)
        setRegroupementEdite(res.data.batiments)
        setImportGranuloStep(1)
      }
    } catch (err) {
      setImportGranuloError(err.response?.data?.error || err.message)
    } finally {
      setImportGranuloLoading(false)
    }
  }

  async function choisirFeuille(nomFeuille) {
    setImportGranuloLoading(true)
    setImportGranuloError(null)
    try {
      const res = await api.post(`/projets/${id}/granulometrie/proposer`, {
        fichier: importGranuloFichierB64,
        nom_fichier: importGranuloNomFichier,
        nom_feuille: nomFeuille
      })
      setFeuillesDisponibles(null)
      setRegroupementEdite(res.data.batiments)
    } catch (err) {
      setImportGranuloError(err.response?.data?.error || err.message)
    } finally {
      setImportGranuloLoading(false)
    }
  }

  async function confirmerGranulo() {
    if (!regroupementEdite) return
    setImportGranuloLoading(true)
    setImportGranuloError(null)
    try {
      if (!importGranuloFichierB64) {
        // Mode édition directe — sauvegarde chaque bâtiment en BDD sans repasser par le parser
        await Promise.all(regroupementEdite.map(b => b._batimentId
          ? api.patch(`/projets/${id}/batiments/${b._batimentId}`, {
              montees: b.montees, nbLogements: b.nb_logements,
              lli: b.LLI, lls: b.LLS, brs: b.BRS,
              acceStd: b.acces_std, accesPremium: b.acces_premium, villas: b.villas
            })
          : Promise.resolve()
        ))
      } else {
        const res = await api.post(`/projets/${id}/granulometrie/import`, {
          fichier: importGranuloFichierB64,
          nom_fichier: importGranuloNomFichier,
          regroupement: regroupementEdite
        })
        setGranulometreD1(res.data)
      }
      const pRes = await api.get(`/projets/${id}`)
      setProjet(pRes.data)
      setImportGranuloStep(0)
    } catch (err) {
      setImportGranuloError(err.response?.data?.error || err.message)
    } finally {
      setImportGranuloLoading(false)
    }
  }

  async function sauvegarderMontee(batId, valeur) {
    const montees = valeur ? valeur.split(',').map(s => s.trim()).filter(Boolean) : []
    try {
      await api.patch(`/projets/${id}/batiments/${batId}`, { montees })
      setProjet(prev => ({
        ...prev,
        batiments: prev.batiments.map(b => b.id === batId ? { ...b, montees: JSON.stringify(montees) } : b)
      }))
    } catch (e) {
      console.error('[montee] erreur sauvegarde', e)
    }
  }

  async function sauvegarderBatimentEdit(idx) {
    if (!batimentEditNom.trim()) return
    const updated = getBatiments().map((b, i) => i === idx ? { nom: batimentEditNom.trim(), typologies: batimentEditTypos } : b)
    await saveBatiments(updated)
    setBatimentEditIdx(null)
  }

  async function supprimerBatimentLocal(idx) {
    if (!confirm('Supprimer ce bâtiment ?')) return
    await saveBatiments(getBatiments().filter((_, i) => i !== idx))
  }

  function ouvrirEditProjet() {
    setEditNom(projet.nom)
    setEditClient(projet.client)
    setEditMeta(getMeta())
    setShowEditProjet(true)
  }

  async function sauvegarderProjet(e) {
    e.preventDefault()
    setEditEnCours(true)
    try {
      const res = await api.patch(`/projets/${id}`, { nom: editNom, client: editClient, metadonnees: editMeta })
      setProjet(prev => ({ ...prev, ...res.data }))
      setShowEditProjet(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la modification')
    } finally {
      setEditEnCours(false)
    }
  }

  async function modifierDocument(doc, fichier) {
    setModifierEnCours(doc.id)
    try {
      const formData = new FormData()
      formData.append('fichier', fichier)
      await api.put(`/documents/${doc.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const [pRes, aRes] = await Promise.all([api.get(`/projets/${id}`), api.get(`/alertes/${id}`)])
      setProjet(pRes.data)
      setAlertes(aRes.data)
    } catch (err) {
      console.error('Erreur mise à jour document:', err)
    } finally {
      setModifierEnCours(null)
    }
  }

  async function ouvrirTexteDoc(doc) {
    setShowTexteModal({ id: doc.id, nom: doc.nom, contenuTexte: null, loading: true })
    try {
      const res = await api.get(`/documents/${doc.id}/texte`)
      setShowTexteModal({ id: doc.id, nom: doc.nom, contenuTexte: res.data.contenuTexte, loading: false })
    } catch {
      setShowTexteModal({ id: doc.id, nom: doc.nom, contenuTexte: null, loading: false, error: true })
    }
  }

  async function lancerComparaison() {
    if (!showComparerModal) return
    setComparerEnCours(true)
    try {
      await api.post(`/documents/${showComparerModal.id}/comparer`, { modeleIA: comparerModele, idsRef: comparerIdsRef, modeVerification: comparerMode })
      setShowComparerModal(null)
      // Démarrer le polling pour récupérer les alertes
      setAnalyseBg(true)
      setAnalyseTimer(0)
      stableCyclesRef.current = 0
      lastAlertCountRef.current = -1
      const start = Date.now()
      clearInterval(pollingRef.current)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setAnalyseTimer(Math.floor((Date.now() - start) / 1000)), 1000)
      pollingRef.current = setInterval(async () => {
        if (Date.now() - start > 600000) {
          clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false); return
        }
        try {
          const [pRes, aRes] = await Promise.all([api.get(`/projets/${id}`), api.get(`/alertes/${id}`)])
          setProjet(pRes.data)
          setAlertes(aRes.data)
          const countActif = aRes.data.filter(a => a.statut === 'active').length
          if (countActif !== lastAlertCountRef.current) {
            stableCyclesRef.current = 0
            lastAlertCountRef.current = countActif
          } else if (countActif > 0 || Date.now() - start > 180000) {
            stableCyclesRef.current++
            if (stableCyclesRef.current >= 20) {
              clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false)
            }
          }
        } catch { clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false) }
      }, 3000)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors du lancement')
    } finally {
      setComparerEnCours(false)
    }
  }

  async function supprimerDocument() {
    const { id: docId } = showDeleteDoc
    try {
      await api.delete(`/documents/${docId}?resoudreAlertes=${deleteResoudreAlertes}`)
      setProjet(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }))
      if (deleteResoudreAlertes) {
        setAlertes(prev => prev.map(a =>
          a.documents?.some(d => d.documentId === docId) ? { ...a, statut: 'resolue' } : a
        ))
      }
      setShowDeleteDoc(null)
      setDeleteResoudreAlertes(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  async function verifierAlertesIA() {
    setVerifEnCours(true)
    setVerifMsg(null)
    try {
      const res = await api.post(`/ia/verifier-alertes/${id}`)
      const { verifiees, faux_positifs } = res.data
      const [pRes, aRes] = await Promise.all([api.get(`/projets/${id}`), api.get(`/alertes/${id}`)])
      setProjet(pRes.data)
      setAlertes(aRes.data)
      setVerifMsg(`${verifiees} alertes vérifiées — ${faux_positifs} faux positif${faux_positifs > 1 ? 's' : ''} écartés`)
    } catch {
      setVerifMsg('Erreur lors de la vérification')
    } finally {
      setVerifEnCours(false)
    }
  }

  async function toutResoudre() {
    if (!confirm(`Résoudre les ${alertesActives.length} alertes actives ?`)) return
    await Promise.all(alertesActives.map(a =>
      api.patch(`/alertes/${a.id}/resoudre`, { resoluePar: 'manuelle', justificationDerogation: null })
    ))
    setAlertes(prev => prev.map(a => ({ ...a, statut: 'resolue' })))
  }

  async function toutSupprimer() {
    if (!confirm(`Supprimer définitivement les ${alertesActives.length} alertes actives ? Cette action est irréversible.`)) return
    await api.delete(`/alertes/projet/${id}/toutes`)
    setAlertes(prev => prev.filter(a => a.statut !== 'active'))
  }

  async function resoudreAlerte(alerteId) {
    await api.patch(`/alertes/${alerteId}/resoudre`, {
      resoluePar: resolType,
      justificationDerogation: resolJustif || null
    })
    setAlertes(prev => prev.map(a => a.id === alerteId ? { ...a, statut: 'resolue' } : a))
    setShowResolModal(null)
    setResolType('manuelle')
    setResolJustif('')
  }

  async function creerArbitrage(alerteId) {
    try {
      await api.post(`/alertes/${alerteId}/arbitrage`, {
        type: 'arbitrage_moa',
        justification: resolJustif || 'Arbitrage MOA'
      })
      await resoudreAlerte(alerteId)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de l\'arbitrage')
    }
  }

  async function ajouterSousProgramme(e) {
    e.preventDefault()
    if (!nouveauSp.trim()) return
    setSpEnCours(true)
    try {
      const res = await api.post(`/projets/${id}/sous-programmes`, { nom: nouveauSp.trim() })
      setProjet(prev => ({ ...prev, sousProgrammes: [...(prev.sousProgrammes || []), res.data] }))
      setNouveauSp('')
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur')
    } finally {
      setSpEnCours(false)
    }
  }

  async function renommerSousProgramme(spId) {
    if (!spRenomNom.trim()) return
    try {
      const res = await api.patch(`/projets/${id}/sous-programmes/${spId}`, { nom: spRenomNom.trim() })
      setProjet(prev => ({ ...prev, sousProgrammes: prev.sousProgrammes.map(sp => sp.id === spId ? res.data : sp) }))
      setSpRenomId(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur')
    }
  }

  async function supprimerSousProgramme(spId) {
    if (!confirm('Supprimer ce sous-programme ? Les documents associés ne seront pas supprimés.')) return
    try {
      await api.delete(`/projets/${id}/sous-programmes/${spId}`)
      setProjet(prev => ({ ...prev, sousProgrammes: prev.sousProgrammes.filter(sp => sp.id !== spId) }))
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur')
    }
  }

  async function inviterMembre(e) {
    e.preventDefault()
    setInviteError('')
    try {
      const res = await api.post(`/projets/${id}/membres`, { email: emailInvite, role: roleInvite })
      setProjet(prev => ({ ...prev, membres: [...prev.membres, res.data] }))
      setEmailInvite('')
      setShowInvite(false)
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Erreur lors de l\'invitation')
    }
  }

  async function changerPhase(nouvellePhase) {
    setPhaseEnCours(true)
    setPhaseMsg(null)
    try {
      const res = await api.patch(`/projets/${id}/phase`, { phase: nouvellePhase })
      setProjet(prev => ({ ...prev, phase: res.data.phase, bloqueExe: res.data.bloqueExe, raisonBlocage: res.data.raisonBlocage }))
      setShowPhase(false)
    } catch (err) {
      setPhaseMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors du changement de phase' })
      if (err.response?.data?.bloqueExe) {
        setProjet(prev => ({ ...prev, bloqueExe: true, raisonBlocage: err.response.data.error }))
      }
    } finally {
      setPhaseEnCours(false)
    }
  }

  async function genererCertificat() {
    setCertEnCours(true)
    try {
      const res = await api.post(`/projets/${id}/certificat`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `certificat-projet-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erreur lors de la génération du certificat.')
    } finally {
      setCertEnCours(false)
    }
  }

  async function envoyerRapport() {
    setRapportEnCours(true)
    setRapportMsg(null)
    try {
      const res = await api.post(`/projets/${id}/rapport-jalon`, { jalon: jalonChoisi })
      setRapportMsg({ type: 'ok', text: res.data.message })
      setShowJalon(false)
    } catch (err) {
      setRapportMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors de l\'envoi.' })
    } finally {
      setRapportEnCours(false)
    }
  }

  if (loading) return <div className="page"><p className="text-muted container">Chargement...</p></div>

  const alertesActives = alertes.filter(a => a.statut === 'active')
  const isAdmin = user?.role === 'admin'
  const isBureauControle = user?.role === 'bureau_controle'

  // Grouper les alertes par sous-programme extrait du label [TYPE — SousProgramme]
  function extraireGroupeAlerte(message) {
    const m = message.match(/\[.*?—\s*(.+?)\]/)
    if (m) return m[1].trim()
    return 'Général'
  }
  const groupesDisponibles = [...new Set(alertesActives.map(a => extraireGroupeAlerte(a.message)))].sort()
  const alertesFiltrees = alertesActives.filter(a => {
    if (filtresCriticite.size > 0 && !filtresCriticite.has(a.criticite || '')) return false
    if (filtreGroupe && extraireGroupeAlerte(a.message) !== filtreGroupe) return false
    return true
  })
  const alertesParGroupe = alertesFiltrees.reduce((acc, a) => {
    const g = extraireGroupeAlerte(a.message)
    if (!acc[g]) acc[g] = []
    acc[g].push(a)
    return acc
  }, {})
  const toggleGroupeAlerte = (g) => setAlertesGroupesOuverts(prev => {
    const next = new Set(prev)
    next.has(g) ? next.delete(g) : next.add(g)
    return next
  })
  const toggleProgramme = (key) => setProgrammesOuverts(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  return (
    <div className="page">
      <header className="topbar">
        <img src={logo} alt="synthek" className="topbar-logo" style={{ height: 60, cursor: 'pointer' }} onClick={() => navigate('/')} />
        <div className="topbar-right">
          <button onClick={toggleTheme} className="btn-ghost" title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} style={{ fontSize: 18, padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {/* Bouton lexique */}
          <button
            className="btn-lexique"
            onClick={() => setShowLexique(true)}
            title="Lexique des phases"
          >
            ?
          </button>
          {/* Badge phase */}
          <button
            className="phase-badge"
            style={{ background: PHASE_COLORS[projet.phase] || '#64748b' }}
            onClick={() => !isBureauControle && setShowPhase(!showPhase)}
            title={isBureauControle ? '' : 'Changer de phase'}
          >
            {projet.phase}
          </button>
          {showPhase && (
            <div className="phase-dropdown">
              {PHASES.map(p => {
                const isEXE = p === 'EXE'
                return (
                  <button
                    key={p}
                    className={`phase-option ${p === projet.phase ? 'phase-option-active' : ''}`}
                    onClick={() => !isEXE && changerPhase(p)}
                    disabled={phaseEnCours || p === projet.phase || isEXE}
                    title={isEXE ? 'Phase EXE disponible en V2' : undefined}
                    style={{
                      borderLeft: `3px solid ${PHASE_COLORS[p]}`,
                      opacity: isEXE ? 0.45 : 1,
                      cursor: isEXE ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {p}{isEXE ? ' (V2)' : ''}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      <main className="container">

        {/* En-tête projet */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', marginBottom: 4 }}>
              Projet : {projet.nom}
            </h2>
            <span className="text-muted" style={{ fontSize: 13 }}>{projet.client}</span>
          </div>
          {isAdmin && (
            <button className="btn-ghost" onClick={ouvrirEditProjet} title="Modifier le projet" style={{ fontSize: 15, padding: '6px 12px' }}>
              ✏️ Modifier
            </button>
          )}
        </div>

        {/* Banner analyse en arrière-plan */}
        {analyseBg && (() => {
          const sectionsAnalysees = alertesActives.reduce((acc, a) => {
            const match = a.message.match(/^\[([^\]]+)\]/)
            if (!match) return acc
            const parts = match[1].split(' — ')
            const section = parts[parts.length - 1]
            if (!acc[section]) acc[section] = 0
            acc[section]++
            return acc
          }, {})
          const entries = Object.entries(sectionsAnalysees)
          return (
            <div className="card info-card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, animation: 'spin 1s linear infinite', display: 'inline-block', flexShrink: 0 }}>⏳</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>Analyse en cours...</p>
                  <p className="text-muted text-sm" style={{ margin: 0 }}>
                    {entries.length === 0
                      ? 'Comparaison en cours — les alertes apparaissent section par section.'
                      : `${alertesActives.length} alerte${alertesActives.length > 1 ? 's' : ''} détectée${alertesActives.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {analyseTimer}s
                </span>
                <button onClick={() => { clearInterval(pollingRef.current); clearInterval(timerRef.current); setAnalyseBg(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: '0 4px', flexShrink: 0 }} title="Fermer">×</button>
              </div>
              {entries.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entries.map(([section, count]) => (
                    <span key={section} style={{ fontSize: 12, background: 'var(--bg-muted, #f1f5f9)', borderRadius: 4, padding: '2px 8px', color: 'var(--text)' }}>
                      ✓ {section} — {count} alerte{count > 1 ? 's' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* Banner BLOQUÉ EXE */}
        {projet.bloqueExe && (
          <div className="banner-bloque">
            <span className="banner-bloque-icon">⛔</span>
            <div>
              <strong>Passage en phase EXE bloqué</strong>
              <p className="text-sm">{projet.raisonBlocage}</p>
            </div>
          </div>
        )}

        {phaseMsg && (
          <div className={`analyse-msg ${phaseMsg.type === 'error' ? 'analyse-alert' : 'analyse-ok'}`}>
            {phaseMsg.text}
          </div>
        )}

        {rapportMsg && (
          <div className={`analyse-msg ${rapportMsg.type === 'error' ? 'analyse-alert' : 'analyse-ok'}`}>
            {rapportMsg.text}
          </div>
        )}

        {/* Alertes actives */}
        {alertesActives.length > 0 && (
          <section className="section section--alertes">
            <div
              className="section-title-row"
              style={{ cursor: 'pointer', marginBottom: showAlertes ? 12 : 0 }}
              onClick={() => setShowAlertes(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <h2 className="section-title alert-title" style={{ marginBottom: 0 }}>
                  ⚠ {alertesActives.length} alerte{alertesActives.length > 1 ? 's' : ''} active{alertesActives.length > 1 ? 's' : ''}
                </h2>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showAlertes ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
              </div>
              <div className="section-title-btns">
                {showAlertes && (
                  <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/historique`) }} className="alerte-action-btn" style={{ background: '#0f766e' }}>Historique</button>
                )}
                {isAdmin && alertesActives.length > 1 && showAlertes && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); verifierAlertesIA() }}
                      disabled={verifEnCours}
                      className="alerte-action-btn"
                      style={{ background: '#7c3aed', opacity: verifEnCours ? 0.6 : 1 }}
                    >
                      {verifEnCours ? '⏳ Vérification...' : '🤖 Vérifier avec IA'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); toutResoudre() }}
                      className="alerte-action-btn"
                      style={{ background: '#2563eb' }}
                    >
                      Tout résoudre
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); toutSupprimer() }}
                      className="alerte-action-btn"
                      style={{ background: '#ef4444' }}
                    >
                      Tout supprimer
                    </button>
                  </>
                )}
              </div>
            </div>
            {showAlertes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {verifMsg && (
                <p style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, margin: 0, padding: '6px 10px', background: '#ede9fe', borderRadius: 6 }}>
                  🤖 {verifMsg}
                </p>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                <strong>Résoudre</strong> archive l'alerte dans l'historique · <strong>Supprimer</strong> l'efface définitivement
              </p>
              {/* Filtres */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {[{ label: 'CRITIQUE', bg: '#dc2626' }, { label: 'MAJEUR', bg: '#ea580c' }, { label: 'MINEUR', bg: '#ca8a04' }].map(({ label, bg }) => {
                  const actif = filtresCriticite.has(label)
                  return (
                    <button
                      key={label}
                      onClick={() => setFiltresCriticite(prev => {
                        const next = new Set(prev)
                        actif ? next.delete(label) : next.add(label)
                        return next
                      })}
                      style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: `2px solid ${bg}`, background: actif ? bg : 'transparent', color: actif ? 'white' : bg, cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                      {label}
                    </button>
                  )
                })}
                {groupesDisponibles.length > 1 && (
                  <select
                    value={filtreGroupe}
                    onChange={e => setFiltreGroupe(e.target.value)}
                    style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: filtreGroupe ? 'var(--primary)' : 'var(--bg-muted)', color: filtreGroupe ? 'white' : 'var(--text)', cursor: 'pointer' }}
                  >
                    <option value=''>Tous les bâtiments</option>
                    {groupesDisponibles.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                {(filtresCriticite.size > 0 || filtreGroupe) && (
                  <button
                    onClick={() => { setFiltresCriticite(new Set()); setFiltreGroupe('') }}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    ✕ Réinitialiser
                  </button>
                )}
                {(filtresCriticite.size > 0 || filtreGroupe) && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                    {alertesFiltrees.length} / {alertesActives.length} alertes
                  </span>
                )}
              </div>
                {Object.entries(alertesParGroupe).sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([groupe, alertesGroupe]) => (
                  <div key={groupe} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleGroupeAlerte(groupe)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-muted)', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {groupe}
                        <span style={{ marginLeft: 8, background: '#ef4444', color: 'white', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                          {alertesGroupe.length}
                        </span>
                      </span>
                      <span style={{ fontSize: 14, color: 'var(--text-muted)', transform: alertesGroupesOuverts.has(groupe) ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                    </div>
                    {alertesGroupesOuverts.has(groupe) && (
                      <div className="alertes-list" style={{ padding: '8px 0', margin: 0 }}>
                        {alertesGroupe.map(alerte => (
                          <div key={alerte.id} className="card alerte-card" style={{ margin: '0 8px 8px', borderRadius: 6 }}>
                            {(() => {
                              const CRITICITE_STYLE = {
                                CRITIQUE: { background: '#dc2626', color: 'white' },
                                MAJEUR:   { background: '#ea580c', color: 'white' },
                                MINEUR:   { background: '#ca8a04', color: 'white' },
                              }
                              const criticiteStyle = alerte.criticite ? CRITICITE_STYLE[alerte.criticite] : null
                              const m = alerte.message.match(/^\[([^\]]+)\]\s*(.*)$/s)
                              if (m) return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>#{alerte.id}</span>
                                    {criticiteStyle && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', ...criticiteStyle }}>{alerte.criticite}</span>}
                                  </div>
                                  <div>
                                    <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 4, padding: '2px 7px' }}>{m[1]}</span>
                                  </div>
                                  <p style={{ margin: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                    {m[2].split(/(INCOHÉRENCE MAJEURE|INCOHÉRENCE)/g).map((part, i) =>
                                      (part === 'INCOHÉRENCE' || part === 'INCOHÉRENCE MAJEURE')
                                        ? <strong key={i}>{part}</strong>
                                        : part
                                    )}
                                  </p>
                                </div>
                              )
                              return (
                                <p style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginRight: 6 }}>#{alerte.id}</span>
                                  {criticiteStyle && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', marginRight: 6, ...criticiteStyle }}>{alerte.criticite}</span>}
                                  {alerte.message}
                                </p>
                              )
                            })()}
                            {(alerte.contexteSource || alerte.dpgfSource) && (
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {alerte.contexteSource && (
                                  <div>
                                    <button
                                      onClick={() => setAlerteSourceOuverte(alerteSourceOuverte === alerte.id ? null : alerte.id)}
                                      style={{ fontSize: 11, padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      {alerteSourceOuverte === alerte.id ? '▲ Masquer CCTP' : '▼ Voir CCTP'}
                                    </button>
                                    {alerteSourceOuverte === alerte.id && (
                                      <pre style={{ marginTop: 4, padding: '8px 10px', background: '#eff6ff', borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto', color: 'var(--text-muted)' }}>
                                        {alerte.contexteSource}
                                      </pre>
                                    )}
                                  </div>
                                )}
                                {alerte.dpgfSource && (
                                  <div>
                                    <button
                                      onClick={() => setAlerteDpgfOuverte(alerteDpgfOuverte === alerte.id ? null : alerte.id)}
                                      style={{ fontSize: 11, padding: '2px 8px', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      {alerteDpgfOuverte === alerte.id ? '▲ Masquer DPGF' : '▼ Voir DPGF'}
                                    </button>
                                    {alerteDpgfOuverte === alerte.id && (
                                      <pre style={{ marginTop: 4, padding: '8px 10px', background: '#f0fdf4', borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto', color: 'var(--text-muted)' }}>
                                        {alerte.dpgfSource}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="alerte-footer">
                              <span className="text-muted text-sm">
                                Documents : {alerte.documents.map(d => d.document.nom).join(', ')}
                              </span>
                              {!isBureauControle && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => { setShowResolModal(alerte.id); setResolType('manuelle'); setResolJustif('') }} className="btn-success">
                                    Résoudre
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm('Supprimer définitivement cette alerte ?')) return
                                      await api.delete(`/alertes/${alerte.id}`)
                                      setAlertes(prev => prev.filter(a => a.id !== alerte.id))
                                    }}
                                    style={{ fontSize: 12, padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                  >Supprimer</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Projet */}
        {(() => {
          const m = getMeta()
          const rt = RT_OPTIONS.find(r => r.value === m.reglementation)
          const RT_COURT = {
            RT2012: 'RT2012', RE2020_2022: 'RE2020 S.2022', RE2020_2025: 'RE2020 S.2025',
            RE2020_2028: 'RE2020 S.2028', RT_existant_elements: 'RT Exist. éléments', RT_existant_global: 'RT Exist. global'
          }
          const TYPE_COURT = {
            'Logements collectifs neufs': 'LC Neuf',
            'Logements individuels groupés neufs': 'LIG Neuf',
            'Logements collectifs neufs et individuels neufs': 'Mixte Neuf',
            'Réhabilitation logements collectifs': 'Réhab.',
          }
          const champStyle = { flex: '1 1 0', minWidth: 0, borderRight: '1px solid var(--border)', padding: '10px 16px', lastChild: { borderRight: 'none' } }
          const labelStyle = { fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }
          const valStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
          const valVideStyle = { fontSize: 13, color: 'var(--text-muted)', margin: 0 }

          const champs = [
            { label: "Nom de l'opération", val: projet.nom },
            { label: "Type d'opération", val: TYPE_COURT[m.typeOperation] || m.typeOperation },
            { label: "Adresse chantier", val: m.adresse || m.commune },
            { label: "MOA / Client", val: projet.client },
            { label: "Réglementation", val: RT_COURT[m.reglementation] },
            { label: "Label / Certification", val: m.labels?.filter(l => l !== 'Aucune').join(', ') || (m.labels?.includes('Aucune') ? 'Aucune' : null) },
          ]

          return (
            <section className="section" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <h2 className="section-title" style={{ marginBottom: 0, fontSize: 14 }}>⚙ Projet</h2>
                {isAdmin && (
                  <button onClick={ouvrirEditProjet} className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)', padding: '3px 10px' }}>✎ Modifier</button>
                )}
              </div>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {champs.map((c, i) => (
                  <div key={i} style={{ ...champStyle, borderRight: i < champs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={labelStyle}>{c.label}</span>
                    {c.val ? <p style={valStyle} title={c.val}>{c.val}</p> : <p style={valVideStyle}>—</p>}
                  </div>
                ))}
              </div>
            </section>
          )
        })()}

        {/* Intervenants */}
        <section className="section">
          <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showIntervenants ? 12 : 0 }} onClick={() => setShowIntervenants(v => !v)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>👥 Intervenants</h2>
              <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showIntervenants ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
            </div>
            {isAdmin && showIntervenants && (
              <div className="section-title-btns">
                {editIntervenants ? (
                  <>
                    <button onClick={async e => {
                      e.stopPropagation()
                      await api.patch(`/projets/${id}/intervenants`, { intervenants: intervenantsEdit })
                      setProjet(prev => ({ ...prev, intervenants: JSON.stringify(intervenantsEdit) }))
                      setEditIntervenants(false)
                    }} className="btn-primary" style={{ fontSize: 13 }}>✓ Enregistrer</button>
                    <button onClick={e => { e.stopPropagation(); setEditIntervenants(false) }} className="btn-ghost" style={{ fontSize: 13 }}>Annuler</button>
                  </>
                ) : (
                  <button onClick={e => {
                    e.stopPropagation()
                    const base = INTERVENANTS_BASE.map(b => ({ ...b, ...getIntervenant(b.role), label: b.label }))
                    setIntervenantsEdit(base)
                    setEditIntervenants(true)
                  }} className="btn-ghost" style={{ fontSize: 13, border: '1px solid var(--border)' }}>✎ Modifier</button>
                )}
              </div>
            )}
          </div>

          {showIntervenants && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {INTERVENANTS_BASE.map((base, idx) => {
                const iv = getIntervenant(base.role)
                const editIv = intervenantsEdit[idx] || {}
                const vide = !iv.societe && !iv.contact && !iv.email && !iv.tel
                return (
                  <div key={base.role} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 8 }}>{base.label}</p>
                    {editIntervenants ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Société / Organisme</label>
                          <input value={editIv.societe || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, societe: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Contact</label>
                          <input value={editIv.contact || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, contact: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Email</label>
                          <input type="email" value={editIv.email || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Tél</label>
                          <input value={editIv.tel || ''} onChange={e => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, tel: e.target.value } : x))} style={{ fontSize: 13 }} />
                        </div>
                        {base.role === 'BCT' && (
                          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 11 }}>Missions</label>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              {BCT_MISSIONS.map(m => (
                                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                                  <input type="checkbox" style={{ width: 'auto' }}
                                    checked={(editIv.missions || []).includes(m)}
                                    onChange={() => setIntervenantsEdit(prev => prev.map((x, i) => i === idx ? { ...x, missions: (x.missions || []).includes(m) ? x.missions.filter(v => v !== m) : [...(x.missions || []), m] } : x))}
                                  /> {m}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : vide ? (
                      <p className="text-muted text-sm" style={{ margin: 0 }}>— Non renseigné</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px', fontSize: 13 }}>
                        {iv.societe && <span><strong>Société :</strong> {iv.societe}</span>}
                        {iv.contact && <span><strong>Contact :</strong> {iv.contact}</span>}
                        {iv.email && <span><strong>Email :</strong> <a href={`mailto:${iv.email}`} style={{ color: 'var(--primary)' }}>{iv.email}</a></span>}
                        {iv.tel && <span><strong>Tél :</strong> {iv.tel}</span>}
                        {base.role === 'BCT' && iv.missions?.length > 0 && (
                          <span style={{ gridColumn: '1 / -1' }}><strong>Missions :</strong> {iv.missions.join(', ')}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Bâtiments */}
        {isAdmin && (
          <section className="section section--batiments">
            <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showBatiments ? 12 : 0 }} onClick={() => setShowBatiments(v => !v)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <h2 className="section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🏢</span> Bâtiments — Granulométrie
                </h2>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showBatiments ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
              </div>
              <div className="section-title-btns">
                {showBatiments && (<>
                  <button onClick={e => { e.stopPropagation(); setNewBatD1({ nom: '', montees: '', nbLogements: '', lli: '', lls: '', brs: '', acceStd: '', accesPremium: '', villas: '' }) }} className="btn-secondary" style={{ fontSize: 13 }}>+ Ajouter</button>
                  {projet?.batiments?.length > 0 && isAdmin && (
                    <button onClick={async e => {
                      e.stopPropagation()
                      if (!window.confirm('Supprimer tous les bâtiments ?')) return
                      await api.delete(`/projets/${id}/batiments`)
                      const res = await api.get(`/projets/${id}`)
                      setProjet(res.data)
                    }} className="btn-ghost" style={{ fontSize: 13, color: '#ef4444', border: '1px solid #fca5a5' }}>🗑 Tout supprimer</button>
                  )}
                  {isAdmin && (<>
                    <label style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                      <input type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onClick={e => e.target.value = ''} onChange={e => { setImportGranuloStep(0); setGranulometreD1(null); setFeuillesDisponibles(null); setRegroupementEdite(null); importerGranuloFichier(e) }} />
                      <span className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                        {importGranuloLoading ? '⏳ Analyse IA...' : '📥 Importer Excel'}
                      </span>
                    </label>
                    <label style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                      <input type="file" accept=".pdf" style={{ display: 'none' }} onClick={e => e.target.value = ''} onChange={e => { setImportGranuloStep(0); setGranulometreD1(null); setFeuillesDisponibles(null); setRegroupementEdite(null); importerGranuloFichier(e) }} />
                      <span className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                        {importGranuloLoading ? '⏳ Analyse IA...' : '📄 Importer PDF'}
                      </span>
                    </label>
                  </>)}
                  <button onClick={e => { e.stopPropagation(); setNouvelleTypologie(v => v === null ? '' : null) }} className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)' }}>⚙️ Typologies</button>
                </>)}
              </div>
            </div>

            {showBatiments && (<>

            {/* Import granulométrie — Étape 1 : sélection feuille OU validation tableau D1 */}
            {importGranuloStep === 1 && (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 14, marginBottom: 12 }}>

                {/* Sélection de feuille (fichier multi-onglets) */}
                {feuillesDisponibles && (
                  <>
                    <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#0369a1' }}>📋 Plusieurs feuilles disponibles — choisir la feuille de référence</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {feuillesDisponibles.feuilles_disponibles.map(f => (
                        <button
                          key={f}
                          onClick={() => choisirFeuille(f)}
                          disabled={importGranuloLoading}
                          className={f === feuillesDisponibles.feuille_suggeree ? 'btn-primary' : 'btn-ghost'}
                          style={{ fontSize: 12, border: '1px solid #bae6fd' }}
                        >
                          {f === feuillesDisponibles.feuille_suggeree ? '★ ' : ''}{f}
                        </button>
                      ))}
                    </div>
                    {importGranuloLoading && <p style={{ fontSize: 12, color: '#0369a1' }}>⏳ Analyse en cours...</p>}
                  </>
                )}

                {/* Tableau D1 de validation (résultat Sonnet, éditable) */}
                {!feuillesDisponibles && regroupementEdite && (
                  <>
                    <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#0369a1' }}>🤖 Résultat Sonnet — vérifier et corriger si besoin</p>
                    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#e0f2fe', textAlign: 'left' }}>
                            {['Bâtiment', 'Montées', 'Logements', 'LLI', 'LLS', 'BRS', 'Acc.std', 'Acc.premium', 'Villas', 'Fiabilité'].map(h => (
                              <th key={h} style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {regroupementEdite.map((b, i) => (
                            <tr key={i} style={{ borderTop: '1px solid #bae6fd' }}>
                              <td style={{ padding: '4px 8px', fontWeight: 700 }}>{b.nom}</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input
                                  type="text"
                                  value={monteesEdit[`step1_${i}`] !== undefined ? monteesEdit[`step1_${i}`] : (b.montees?.join(', ') || '')}
                                  placeholder="ex: BAT A"
                                  onChange={e => setMonteesEdit(prev => ({ ...prev, [`step1_${i}`]: e.target.value }))}
                                  onBlur={e => {
                                    const val = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                    setRegroupementEdite(prev => prev.map((x, j) => j === i ? { ...x, montees: val } : x))
                                  }}
                                  style={{ width: 90, fontSize: 11, padding: '2px 4px', border: '1px solid #bae6fd', borderRadius: 4 }}
                                />
                              </td>
                              {['nb_logements', 'LLI', 'LLS', 'BRS', 'acces_std', 'acces_premium', 'villas'].map(field => (
                                <td key={field} style={{ padding: '2px 4px' }}>
                                  <input
                                    type="number"
                                    value={b[field] ?? ''}
                                    placeholder="—"
                                    onChange={e => {
                                      const val = e.target.value === '' ? null : parseInt(e.target.value) || 0
                                      setRegroupementEdite(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x))
                                    }}
                                    style={{ width: 52, fontSize: 12, padding: '2px 4px', border: '1px solid #bae6fd', borderRadius: 4, textAlign: 'center' }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: '4px 8px', fontSize: 11, color: b.fiabilite === 'haute' ? '#15803d' : '#f59e0b' }}>{b.fiabilite}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {importGranuloError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{importGranuloError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  {!feuillesDisponibles && regroupementEdite && (
                    <button onClick={confirmerGranulo} className="btn-primary" style={{ fontSize: 12 }} disabled={importGranuloLoading}>
                      {importGranuloLoading ? '⏳ Import...' : '✓ Confirmer et importer'}
                    </button>
                  )}
                  <button onClick={() => { setImportGranuloStep(0); setImportGranuloError(null); setFeuillesDisponibles(null) }} className="btn-ghost" style={{ fontSize: 12 }}>Annuler</button>
                </div>
              </div>
            )}

            {/* Import granulométrie — Étape 2 : tableau D1 */}
            {importGranuloStep === 2 && granulometreD1 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#15803d' }}>✅ {granulometreD1.total_logements} logements importés depuis {granulometreD1.source}</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#dcfce7', textAlign: 'left' }}>
                        {['Bâtiment', 'Logements', 'LLI', 'LLS', 'BRS', 'Acc.std', 'Acc.premium', 'Villas', 'Fiabilité'].map(h => (
                          <th key={h} style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {granulometreD1.batiments.map((b, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #bbf7d0' }}>
                          <td style={{ padding: '4px 8px', fontWeight: 700 }}>{b.nom}</td>
                          <td style={{ padding: '4px 8px', fontWeight: 700 }}>{b.nb_logements ?? '?'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.LLI !== null && b.LLI !== undefined ? b.LLI : '?'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.LLS !== null && b.LLS !== undefined ? b.LLS : '?'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.BRS !== null && b.BRS !== undefined ? b.BRS : '?'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.acces_std !== null && b.acces_std !== undefined ? b.acces_std : '?'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.acces_premium !== null && b.acces_premium !== undefined ? b.acces_premium : '?'}</td>
                          <td style={{ padding: '4px 8px' }}>{b.villas !== null && b.villas !== undefined ? b.villas : '?'}</td>
                          <td style={{ padding: '4px 8px', color: b.fiabilite === 'haute' ? '#15803d' : '#f59e0b' }}>{b.fiabilite}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #86efac', background: '#dcfce7' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>TOTAL</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{granulometreD1.batiments.reduce((s, b) => s + (b.nb_logements || 0), 0)}</td>
                        {['LLI','LLS','BRS','acces_std','acces_premium','villas'].slice(0,5).map(f => {
                          const anyNull = granulometreD1.batiments.some(b => b[f] === null || b[f] === undefined)
                          const total = granulometreD1.batiments.reduce((s, b) => s + (b[f] || 0), 0)
                          return <td key={f} style={{ padding: '5px 8px', fontWeight: 700 }}>{anyNull ? '?' : total || '0'}</td>
                        })}
                        {(() => { const f='villas'; const anyNull=granulometreD1.batiments.some(b=>b[f]===null||b[f]===undefined); const total=granulometreD1.batiments.reduce((s,b)=>s+(b[f]||0),0); return <td style={{padding:'5px 8px',fontWeight:700}}>{anyNull?'?':total||'0'}</td> })()}
                        <td style={{ padding: '5px 8px' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {granulometreD1.donnees_manquantes?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {granulometreD1.donnees_manquantes.map((w, i) => (
                      <p key={i} style={{ fontSize: 11, color: '#f59e0b', margin: 0 }}>⚠ {w}</p>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => { setRegroupementEdite([...granulometreD1.batiments]); setImportGranuloStep(1) }} className="btn-ghost" style={{ fontSize: 12 }}>🔄 Re-importer</button>
                  <button onClick={() => setImportGranuloStep(0)} className="btn-primary" style={{ fontSize: 12 }}>✓ Terminer</button>
                </div>
              </div>
            )}

            {importGranuloError && importGranuloStep === 0 && (
              <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>⚠ {importGranuloError}</p>
            )}
            {importGranuloLoading && importGranuloStep === 0 && (
              <p style={{ fontSize: 12, color: '#0369a1', marginBottom: 8 }}>⏳ Analyse du fichier via IA (peut prendre 15-20 secondes)…</p>
            )}

            {nouvelleTypologie !== null && (
              <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Typologies disponibles</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {typologiesCustom.map(t => (
                    <span key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#ede9fe', color: '#7c3aed', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {t.nom}
                      <button onClick={async () => { await api.delete(`/typologies/${t.id}`); setTypologiesCustom(prev => prev.filter(x => x.id !== t.id)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={nouvelleTypologie}
                    onChange={e => setNouvelleTypologie(e.target.value)}
                    placeholder="Ex : Niveau Attiques, Duplex, T4..."
                    style={{ flex: 1, fontSize: 13 }}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && nouvelleTypologie.trim()) {
                        const res = await api.post('/typologies', { nom: nouvelleTypologie.trim() })
                        setTypologiesCustom(prev => [...prev, res.data])
                        setNouvelleTypologie('')
                      }
                    }}
                  />
                  <button onClick={async () => {
                    if (!nouvelleTypologie.trim()) return
                    const res = await api.post('/typologies', { nom: nouvelleTypologie.trim() })
                    setTypologiesCustom(prev => [...prev, res.data])
                    setNouvelleTypologie('')
                  }} className="btn-primary" style={{ fontSize: 13 }}>Ajouter</button>
                </div>
              </div>
            )}

            {/* Table D1 permanente si bâtiments importés en DB */}
            {importGranuloStep === 0 && projet?.batiments?.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#dcfce7', textAlign: 'left' }}>
                      {['Bâtiment', 'Montées', 'Logements', 'LLI', 'LLS', 'BRS', 'Acc.std', 'Acc.premium', 'Villas', 'Fiabilité', ''].map(h => (
                        <th key={h} style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projet.batiments.map(b => (
                      <tr key={b.id} style={{ borderTop: '1px solid #bbf7d0' }}>
                        <td style={{ padding: '4px 8px', fontWeight: 700 }}>{b.nom}</td>
                        <td style={{ padding: '4px 8px', color: '#64748b', fontSize: 11 }}>{(() => { try { return JSON.parse(b.montees || '[]').join(', ') } catch { return b.montees || '—' } })()}</td>
                        <td style={{ padding: '4px 8px', fontWeight: 700 }}>{b.nbLogements ?? '?'}</td>
                        <td style={{ padding: '4px 8px' }}>{b.lli !== null && b.lli !== undefined ? b.lli : '?'}</td>
                        <td style={{ padding: '4px 8px' }}>{b.lls !== null && b.lls !== undefined ? b.lls : '?'}</td>
                        <td style={{ padding: '4px 8px' }}>{b.brs !== null && b.brs !== undefined ? b.brs : '?'}</td>
                        <td style={{ padding: '4px 8px' }}>{b.acceStd !== null && b.acceStd !== undefined ? b.acceStd : '?'}</td>
                        <td style={{ padding: '4px 8px' }}>{b.accesPremium !== null && b.accesPremium !== undefined ? b.accesPremium : '?'}</td>
                        <td style={{ padding: '4px 8px' }}>{b.villas !== null && b.villas !== undefined ? b.villas : '?'}</td>
                        <td style={{ padding: '4px 8px', color: b.fiabilite === 'haute' ? '#15803d' : '#f59e0b' }}>{b.fiabilite}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <button onClick={async () => {
                            if (!window.confirm(`Supprimer « ${b.nom} » ?`)) return
                            await api.delete(`/projets/${id}/batiments/${b.id}`)
                            const res = await api.get(`/projets/${id}`)
                            setProjet(res.data)
                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '0 4px' }} title="Supprimer">🗑</button>
                        </td>
                      </tr>
                    ))}
                    {newBatD1 && (
                      <tr style={{ borderTop: '2px dashed #86efac', background: '#f0fdf4' }}>
                        <td style={{ padding: '4px 4px' }}>
                          <input autoFocus value={newBatD1.nom} onChange={e => setNewBatD1(p => ({ ...p, nom: e.target.value }))} placeholder="Bâtiment" style={{ width: 80, fontSize: 12, padding: '2px 4px', border: '1px solid #86efac', borderRadius: 4 }} />
                        </td>
                        <td style={{ padding: '4px 4px' }}>
                          <input value={newBatD1.montees} onChange={e => setNewBatD1(p => ({ ...p, montees: e.target.value }))} placeholder="A1, A2…" style={{ width: 70, fontSize: 12, padding: '2px 4px', border: '1px solid #86efac', borderRadius: 4 }} />
                        </td>
                        {['nbLogements','lli','lls','brs','acceStd','accesPremium','villas'].map(f => (
                          <td key={f} style={{ padding: '4px 4px' }}>
                            <input type="number" min="0" value={newBatD1[f]} onChange={e => setNewBatD1(p => ({ ...p, [f]: e.target.value }))} style={{ width: 48, fontSize: 12, padding: '2px 4px', border: '1px solid #86efac', borderRadius: 4 }} />
                          </td>
                        ))}
                        <td style={{ padding: '4px 4px' }}>
                          <button onClick={async () => {
                            if (!newBatD1.nom.trim()) return
                            const payload = { nom: newBatD1.nom.trim() }
                            if (newBatD1.montees.trim()) payload.montees = newBatD1.montees.split(',').map(s => s.trim()).filter(Boolean)
                            ;['nbLogements','lli','lls','brs','acceStd','accesPremium','villas'].forEach(f => {
                              if (newBatD1[f] !== '') payload[f] = parseInt(newBatD1[f])
                            })
                            await api.post(`/projets/${id}/batiments`, payload)
                            setNewBatD1(null)
                            const res = await api.get(`/projets/${id}`)
                            setProjet(res.data)
                          }} className="btn-primary" style={{ fontSize: 11, padding: '2px 8px' }}>✓</button>
                          <button onClick={() => setNewBatD1(null)} className="btn-ghost" style={{ fontSize: 11, padding: '2px 6px', marginLeft: 4 }}>✕</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #86efac', background: '#dcfce7' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 700 }}>TOTAL</td>
                      <td></td>
                      <td style={{ padding: '5px 8px', fontWeight: 700 }}>{projet.batiments.reduce((s, b) => s + (b.nbLogements || 0), 0)}</td>
                      {['lli','lls','brs','acceStd','accesPremium','villas'].map(f => {
                        const anyNull = projet.batiments.some(b => b[f] === null || b[f] === undefined)
                        const total = projet.batiments.reduce((s, b) => s + (b[f] || 0), 0)
                        return <td key={f} style={{ padding: '5px 8px', fontWeight: 700 }}>{anyNull ? '?' : total || '0'}</td>
                      })}
                      <td></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => {
                    setRegroupementEdite(projet.batiments.map(b => ({
                      nom: b.nom,
                      montees: (() => { try { return JSON.parse(b.montees || '[]') } catch { return [] } })(),
                      nb_logements: b.nbLogements,
                      LLI: b.lli, LLS: b.lls, BRS: b.brs,
                      acces_std: b.acceStd, acces_premium: b.accesPremium, villas: b.villas,
                      fiabilite: b.fiabilite, _batimentId: b.id
                    })))
                    setImportGranuloStep(1)
                  }} className="btn-ghost" style={{ fontSize: 12, border: '1px solid var(--border)' }}>✏️ Modifier</button>
                </div>
              </div>
            )}

            {importGranuloStep === 0 && projet?.batiments?.length === 0 && (
              <p className="text-muted text-sm">Aucun bâtiment défini. Utilisez "+ Ajouter" ou importez un fichier Excel/PDF.</p>
            )}
            </>)}
          </section>
        )}

        {/* Programme - Notices */}
        {(() => {
          const programmes = projet.documents.filter(d => d.categorieDoc === 'programme')
          const sousProgrammes = projet.sousProgrammes || []
          const hasSousProgrammes = sousProgrammes.length > 0
          return (
            <section className="section section--programmes">
              <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showProgrammes ? 12 : 0 }} onClick={() => setShowProgrammes(v => !v)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <h2 className="section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📌</span> Programme - Notices
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>({programmes.length})</span>
                  </h2>
                  <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showProgrammes ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                </div>
                <div className="section-title-btns">
                  {showProgrammes && (<>
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); setShowSousProgrammes(v => !v) }} className="btn-ghost" style={{ fontSize: 13, backgroundColor: '#f0f0ff', border: '1px solid #c5c5f0', color: '#5a5aaa' }}>
                        ✏️ Sous-programmes
                      </button>
                    )}
                    {!isBureauControle && (
                      <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/upload`) }} className="btn-primary" style={{ fontSize: 13 }}>
                        + Déposer
                      </button>
                    )}
                  </>)}
                </div>
              </div>

              {showProgrammes && (<>
              {/* Gestion sous-programmes (admin) */}
              {isAdmin && showSousProgrammes && (
                <div className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
                  <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                    Sous-programmes de ce projet
                  </p>
                  {sousProgrammes.length === 0 ? (
                    <p className="text-muted text-sm" style={{ marginBottom: 10 }}>
                      Aucun sous-programme — le projet est unique. Ajoutez des sous-programmes si l'opération comporte plusieurs typologies (accession, social, villas...).
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {sousProgrammes.map((sp, idx) => (
                        <span
                          key={sp.id}
                          draggable
                          onDragStart={() => { dragSpIdx.current = idx }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => {
                            const from = dragSpIdx.current
                            if (from === null || from === idx) return
                            const next = [...sousProgrammes]
                            const [moved] = next.splice(from, 1)
                            next.splice(idx, 0, moved)
                            setProjet(prev => ({ ...prev, sousProgrammes: next }))
                            api.patch(`/projets/${id}/sous-programmes/ordre`, { ordre: next.map(s => s.id) })
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-muted)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'grab', userSelect: 'none' }}
                        >
                          <span style={{ color: 'var(--text-muted)', fontSize: 14, cursor: 'grab' }}>⠿</span>
                          {spRenomId === sp.id ? (
                            <>
                              <input
                                value={spRenomNom}
                                onChange={e => setSpRenomNom(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') renommerSousProgramme(sp.id); if (e.key === 'Escape') setSpRenomId(null) }}
                                autoFocus
                                style={{ fontSize: 13, width: 120, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}
                              />
                              <button onClick={() => renommerSousProgramme(sp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', fontSize: 14, lineHeight: 1, padding: 0 }} title="Valider">✓</button>
                              <button onClick={() => setSpRenomId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: 0 }} title="Annuler">✕</button>
                            </>
                          ) : (
                            <>
                              <span style={{ flex: 1 }}>{sp.nom}</span>
                              <button onClick={e => { e.stopPropagation(); setSpRenomId(sp.id); setSpRenomNom(sp.nom) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, lineHeight: 1, padding: 0 }} title="Renommer">✎</button>
                              <button onClick={e => { e.stopPropagation(); supprimerSousProgramme(sp.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, lineHeight: 1, padding: 0 }} title="Supprimer">×</button>
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <form onSubmit={ajouterSousProgramme} style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={nouveauSp}
                      onChange={e => setNouveauSp(e.target.value)}
                      placeholder="Ex : Accession, Social, Villas..."
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button type="submit" disabled={spEnCours || !nouveauSp.trim()} className="btn-primary" style={{ fontSize: 13 }}>
                      Ajouter
                    </button>
                  </form>
                </div>
              )}

              {programmes.length === 0 ? (
                <div className="card" style={{ borderLeft: '3px solid #7c3aed', padding: '16px 20px' }}>
                  <p style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>
                    Aucun programme déposé
                  </p>
                  <p className="text-muted text-sm" style={{ margin: 0 }}>
                    Commencez par déposer le ou les programmes du projet. Ils serviront de référence pour la vérification automatique des CCTP et DPGF.
                  </p>
                </div>
              ) : hasSousProgrammes ? (
                // Affichage groupé par sous-programme — accordéons
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...sousProgrammes, { id: '__sans__', nom: 'Sans périmètre' }].map((sp, idx) => {
                    const docs = sp.id === '__sans__'
                      ? programmes.filter(d => !d.sousProgramme)
                      : programmes.filter(d => d.sousProgramme?.id === sp.id)
                    if (sp.id === '__sans__' && docs.length === 0) return null
                    const key = String(sp.id)
                    const ouvert = programmesOuverts.has(key)
                    const couleur = sp.id === '__sans__' ? '#94a3b8' : '#7c3aed'
                    const isDraggable = sp.id !== '__sans__' && isAdmin
                    return (
                      <div
                        key={key}
                        style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}
                        draggable={isDraggable}
                        onDragStart={isDraggable ? () => { dragSpIdx.current = idx } : undefined}
                        onDragOver={isDraggable ? e => e.preventDefault() : undefined}
                        onDrop={isDraggable ? () => {
                          const from = dragSpIdx.current
                          if (from === null || from === idx) return
                          const next = [...sousProgrammes]
                          const [moved] = next.splice(from, 1)
                          next.splice(idx, 0, moved)
                          setProjet(prev => ({ ...prev, sousProgrammes: next }))
                          api.patch(`/projets/${id}/sous-programmes/ordre`, { ordre: next.map(s => s.id) })
                        } : undefined}
                      >
                        <div
                          onClick={() => toggleProgramme(key)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-muted)', cursor: isDraggable ? 'grab' : 'pointer', userSelect: 'none' }}
                        >
                          <span style={{ fontWeight: 700, fontSize: 13, color: couleur, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {sp.nom}
                            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
                              {docs.length} document{docs.length > 1 ? 's' : ''}
                            </span>
                          </span>
                          <span style={{ fontSize: 14, color: 'var(--text-muted)', transform: ouvert ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                        </div>
                        {ouvert && (
                          <div style={{ padding: '10px 10px 4px' }}>
                            {docs.length === 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 8px' }}>
                                <p className="text-muted text-sm" style={{ margin: 0 }}>Aucun programme pour ce périmètre.</p>
                                {!isBureauControle && (
                                  <button onClick={() => navigate(`/projets/${id}/upload?sousProgrammeId=${sp.id}`)} className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>+ Déposer</button>
                                )}
                                {isAdmin && sp.id !== '__sans__' && (
                                  <button onClick={() => supprimerSousProgramme(sp.id)} style={{ fontSize: 12, padding: '4px 10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Supprimer</button>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {docs.map(doc => <ProgrammeCard key={doc.id} doc={doc} isAdmin={isAdmin} onDelete={() => { setShowDeleteDoc({ id: doc.id, nom: doc.nom }); setDeleteResoudreAlertes(false) }} />)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {programmes.map(doc => <ProgrammeCard key={doc.id} doc={doc} isAdmin={isAdmin} onDelete={() => { setShowDeleteDoc({ id: doc.id, nom: doc.nom }); setDeleteResoudreAlertes(false) }} />)}
                </div>
              )}
            </>)}
            </section>
          )
        })()}

        {/* Documents */}
        <section className="section section--documents">
          <div className="section-title-row" style={{ cursor: 'pointer', marginBottom: showDocuments ? 12 : 0 }} onClick={() => setShowDocuments(v => !v)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 16 }}>📄</span> Documents
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>({projet.documents.filter(d => d.categorieDoc !== 'programme').length})</span>
              </h2>
              <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showDocuments ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
            </div>
            <div className="section-title-btns">
              {showDocuments && (<>
                {!isBureauControle && (
                  <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/upload`) }} className="btn-primary" style={{ fontSize: 13 }}>+ Déposer</button>
                )}
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/chat`) }} className="btn-secondary" style={{ fontSize: 13 }}>Assistant IA</button>
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/visas`) }} className="btn-secondary" style={{ fontSize: 13 }}>Visas</button>
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/syntheses`) }} className="btn-secondary" style={{ fontSize: 13 }}>Synthèses</button>
                <button onClick={e => { e.stopPropagation(); navigate(`/projets/${id}/historique`) }} className="btn-ghost" style={{ fontSize: 13 }}>Historique</button>
              </>)}
            </div>
          </div>


          {showDocuments && (<>
          {/* Actions jalons */}
          <div className="jalon-actions">
            <button onClick={genererCertificat} disabled={certEnCours} className="btn-ghost btn-sm">
              {certEnCours ? '...' : '⬇ Certificat PDF'}
            </button>
            <button onClick={() => setShowJalon(!showJalon)} className="btn-ghost btn-sm">
              📤 Rapport jalon
            </button>
          </div>

          {showJalon && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <select value={jalonChoisi} onChange={e => setJalonChoisi(e.target.value)} style={{ width: 'auto' }}>
                <option value="DCE">DCE</option>
                <option value="EXE">EXE</option>
              </select>
              <button onClick={envoyerRapport} disabled={rapportEnCours} className="btn-primary">
                {rapportEnCours ? 'Envoi...' : 'Envoyer au bureau de contrôle'}
              </button>
              <button onClick={() => setShowJalon(false)} className="btn-ghost">Annuler</button>
            </div>
          )}

          {(() => {
            const autresDoc = projet.documents.filter(d => d.categorieDoc !== 'programme')
            const categorieLabels = {
              cctp: 'CCTP', dpgf: 'DPGF', plans: 'Plans', pieces_ecrites: 'Pièces écrites',
              etudes_th: 'Études TH', bureau_controle: 'Bureau de contrôle',
              notes_calcul: 'Notes de calcul', comptes_rendus: 'Comptes-rendus', autre: 'Autre'
            }
            const categorieColors = { cctp: '#2563eb', dpgf: '#059669' }
            const lotLabels = {
              cvc: 'CVC', menuiseries: 'Menuiseries', facades: 'Façades',
              etancheite: 'Étanchéité', grosOeuvre: 'Gros œuvre', plomberie: 'Plomberie',
              generalites: 'Généralités'
            }
            const lotColors = {
              cvc: '#f97316', menuiseries: '#8b5cf6', facades: '#0ea5e9',
              etancheite: '#14b8a6', grosOeuvre: '#78716c', plomberie: '#3b82f6',
              generalites: '#94a3b8'
            }

            const toggleTri = (col) => setTriDoc(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }))
            const fleche = (col) => triDoc.col === col ? (triDoc.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
            const docsTries = [...autresDoc].sort((a, b) => {
              let va, vb
              if (triDoc.col === 'nom') { va = a.nom.toLowerCase(); vb = b.nom.toLowerCase() }
              else if (triDoc.col === 'categorieDoc') { va = a.categorieDoc || ''; vb = b.categorieDoc || '' }
              else if (triDoc.col === 'lotType') { va = a.lotType || ''; vb = b.lotType || '' }
              else { va = new Date(a.dateDepot); vb = new Date(b.dateDepot) }
              if (va < vb) return triDoc.dir === 'asc' ? -1 : 1
              if (va > vb) return triDoc.dir === 'asc' ? 1 : -1
              return 0
            })
            const thStyle = { cursor: 'pointer', userSelect: 'none' }

            if (autresDoc.length === 0) {
              return <p className="text-muted">Aucun document déposé.</p>
            }
            return (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={thStyle} onClick={() => toggleTri('nom')}>Nom{fleche('nom')}</th>
                      <th style={thStyle} onClick={() => toggleTri('categorieDoc')}>Catégorie{fleche('categorieDoc')}</th>
                      <th style={thStyle} onClick={() => toggleTri('lotType')}>Lot{fleche('lotType')}</th>
                      <th>Périmètre</th>
                      <th>Puce IA</th>
                      <th style={thStyle} onClick={() => toggleTri('dateDepot')}>Date{fleche('dateDepot')}</th>
                      {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {docsTries.map(doc => (
                      <tr key={doc.id}>
                        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.nom}>
                          {doc.nom}
                          {doc.indiceRevision && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{doc.indiceRevision}</span>}
                        </td>
                        <td>
                          {doc.categorieDoc
                            ? <span className="badge" style={{ background: categorieColors[doc.categorieDoc] || 'var(--bg-muted)', color: categorieColors[doc.categorieDoc] ? 'white' : 'var(--text)', fontSize: 11 }}>{categorieLabels[doc.categorieDoc] || doc.categorieDoc}</span>
                            : <span className="text-muted text-sm">—</span>
                          }
                        </td>
                        <td>
                          {doc.lotType
                            ? <span className="badge" style={{ background: lotColors[doc.lotType] || '#94a3b8', color: 'white', fontSize: 11, whiteSpace: 'nowrap' }}>{lotLabels[doc.lotType] || doc.lotType}</span>
                            : <span className="text-muted text-sm">—</span>
                          }
                        </td>
                        <td>
                          {doc.sousProgramme
                            ? <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 700 }}>{doc.sousProgramme.nom}</span>
                            : <span className="text-muted text-sm">—</span>
                          }
                        </td>
                        <td><PuceCard puce={doc.puce} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(doc.dateDepot).toLocaleDateString('fr-FR')}</td>
                        {isAdmin && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => ouvrirTexteDoc(doc)}
                                style={{ fontSize: 12, padding: '4px 8px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                title="Voir le texte extrait"
                              >👁</button>
                              {doc.categorieDoc === 'dpgf' && (
                                <button
                                  onClick={async () => {
                                    const ids = projet.documents.filter(d => d.categorieDoc === 'cctp').map(d => d.id)
                                    setPreAnalyseFeedback({})
                                    setShowPreAnalyse({ loading: true, data: null, error: null })
                                    try {
                                      const res = await api.post(`/documents/${doc.id}/pre-analyse`, { idsRef: ids })
                                      setShowPreAnalyse({ loading: false, data: res.data, error: null })
                                    } catch (e) {
                                      setShowPreAnalyse({ loading: false, data: null, error: e.response?.data?.error || e.message })
                                    }
                                  }}
                                  style={{ fontSize: 12, padding: '4px 8px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                  title="Pré-analyse Python (sans IA)"
                                >🔍 Python</button>
                              )}
                              {(doc.categorieDoc === 'cctp' || doc.categorieDoc === 'dpgf') && (
                                <button
                                  onClick={() => {
  setShowComparerModal({ id: doc.id, nom: doc.nom, categorie: doc.categorieDoc })
  const cats = doc.categorieDoc === 'dpgf' ? ['programme', 'cctp'] : ['programme']
  const ids = projet.documents
    .filter(d => d.id !== doc.id && cats.includes(d.categorieDoc))
    .map(d => d.id)
  setComparerIdsRef(ids)
}}
                                  style={{ fontSize: 12, padding: '4px 10px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                >⟳ Comparer</button>
                              )}
                              <label style={{ fontSize: 12, padding: '4px 10px', background: '#6366f1', color: 'white', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }} title="Mettre à jour">
                                {modifierEnCours === doc.id ? '…' : '↑'}
                                <input type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) modifierDocument(doc, e.target.files[0]); e.target.value = '' }} />
                              </label>
                              <button
                                onClick={() => { setShowDeleteDoc({ id: doc.id, nom: doc.nom }); setDeleteResoudreAlertes(false) }}
                                style={{ fontSize: 14, padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                                title="Supprimer"
                              >✕</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
          </>)}
        </section>

        {/* V3 — Configuration IA (admin uniquement) */}
        {isAdmin && (
          <section className="section section--config">
            <div className="section-title-row" style={{ cursor: 'pointer' }} onClick={() => showConfig ? setShowConfig(false) : chargerConfig()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>Configuration IA</h2>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', display: 'inline-block', transform: showConfig ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
              </div>
            </div>
            {showConfig && (
              <form onSubmit={sauvegarderConfig} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label>Prompt système global</label>
                  <textarea
                    value={configPrompt}
                    onChange={e => setConfigPrompt(e.target.value)}
                    placeholder={`Exemple : Les attiques BRS (D201, E1-201, E1-202) sont équipées de PAC air/eau et plancher chauffant. C'est volontaire et conforme au programme.`}
                    rows={4}
                    style={{ fontFamily: 'inherit' }}
                  />
                </div>
                <div className="form-group">
                  <label>Vocabulaire métier</label>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Termes ou abréviations spécifiques à ce projet — injectés dans chaque comparaison IA.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {configVocabEntries.map((entry, i) => (
                      <div key={i} className="vocab-entry-row">
                        <input
                          value={entry.terme}
                          onChange={e => { const n = [...configVocabEntries]; n[i] = { ...n[i], terme: e.target.value }; setConfigVocabEntries(n) }}
                          placeholder="Terme / abréviation"
                          style={{ minWidth: 100, flex: '0 1 160px' }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>→</span>
                        <input
                          value={entry.definition}
                          onChange={e => { const n = [...configVocabEntries]; n[i] = { ...n[i], definition: e.target.value }; setConfigVocabEntries(n) }}
                          placeholder="Définition / équivalent"
                          style={{ flex: 1, minWidth: 100 }}
                        />
                        <button type="button" onClick={() => setConfigVocabEntries(configVocabEntries.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setConfigVocabEntries([...configVocabEntries, { terme: '', definition: '' }])} className="btn-ghost" style={{ fontSize: 13 }}>
                        + Ajouter un terme
                      </button>
                      <button type="button" onClick={() => setShowVocabImport(!showVocabImport)} className="btn-ghost" style={{ fontSize: 13 }}>
                        ↓ Importer en masse
                      </button>
                    </div>
                    {showVocabImport && (
                      <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-muted)', borderRadius: 8 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Une ligne par terme, format : <code>TERME → définition</code>
                        </p>
                        <textarea
                          value={vocabImportText}
                          onChange={e => setVocabImportText(e.target.value)}
                          placeholder={'BATIMENTS AB → Bâtiment A + Bâtiment B\nGO → Gros Œuvre\nBRS → Bail Réel Solidaire'}
                          rows={6}
                          style={{ fontFamily: 'monospace', fontSize: 12, width: '100%', marginBottom: 8 }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: 13 }}
                          onClick={() => {
                            const nouvelles = vocabImportText.split('\n')
                              .map(l => l.split('→'))
                              .filter(p => p.length >= 2 && p[0].trim())
                              .map(p => ({ terme: p[0].trim(), definition: p.slice(1).join('→').trim() }))
                            setConfigVocabEntries([...configVocabEntries, ...nouvelles])
                            setVocabImportText('')
                            setShowVocabImport(false)
                          }}
                        >
                          Importer ({vocabImportText.split('\n').filter(l => l.includes('→')).length} termes)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Convention de nommage</label>
                  <input
                    value={configNommage}
                    onChange={e => setConfigNommage(e.target.value)}
                    placeholder="TYPE_INTERVENANT_vX_STATUT.ext"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" disabled={configSaving} className="btn-primary">
                    {configSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                  <button type="button" onClick={() => setShowConfig(false)} className="btn-ghost">Fermer</button>
                  {configMsg && <span className={configMsg.includes('Erreur') ? 'error-msg' : 'text-muted'} style={{ fontSize: 13 }}>{configMsg}</span>}
                </div>
              </form>
            )}
          </section>
        )}

        {/* Membres */}
        <section className="section section--membres">
          <div className="section-header">
            <h2>Membres du projet</h2>
            {isAdmin && (
              <button onClick={() => setShowInvite(!showInvite)} className="btn-secondary">
                + Inviter
              </button>
            )}
          </div>

          {showInvite && (
            <form onSubmit={inviterMembre} className="card form-inline" style={{ marginBottom: 16 }}>
              <input
                type="email"
                value={emailInvite}
                onChange={e => setEmailInvite(e.target.value)}
                placeholder="email@expert.fr"
                required
              />
              <select value={roleInvite} onChange={e => setRoleInvite(e.target.value)} style={{ width: 'auto' }}>
                <option value="moa">MOA</option>
                <option value="architecte">Architecte</option>
                <option value="bet_fluides">BET Fluides</option>
                <option value="bet_thermique">BET Thermique</option>
                <option value="bet_structure">BET Structure</option>
                <option value="bet_electricite">BET Électricité</option>
                <option value="bet_vrd">BET VRD</option>
                <option value="bet_geotechnique">BET Géotechnique</option>
                <option value="economiste">Économiste</option>
                <option value="assistant_moa">Assistant MOA</option>
                <option value="bet_hqe">BET HQE</option>
                <option value="acousticien">Acousticien</option>
                <option value="bureau_controle">Bureau de contrôle</option>
              </select>
              <button type="submit" className="btn-primary">Inviter</button>
              <button type="button" onClick={() => { setShowInvite(false); setInviteError('') }} className="btn-ghost">Annuler</button>
              {inviteError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="error-msg">{inviteError}</span>
                  {inviteError.toLowerCase().includes('compte') && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => navigate('/users')}
                    >
                      Créer le compte
                    </button>
                  )}
                </div>
              )}
            </form>
          )}

          <div className="membres-list">
            {projet.membres.map(m => (
              <div key={m.id} className={`membre-chip ${m.user.role === 'bureau_controle' ? 'membre-chip-bc' : ''}`}>
                <strong>{m.user.nom}</strong>
                <span className="text-muted">{m.user.role?.replace(/_/g, ' ')}</span>
                {m.user.role === 'bureau_controle' && <span className="badge-readonly">lecture seule</span>}
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* V3 — Modale résolution alerte */}
      {showResolModal && (
        <div className="modal-overlay" onClick={() => setShowResolModal(null)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Résoudre l'alerte</h3>
              <button className="btn-ghost" onClick={() => setShowResolModal(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <div className="form-group">
              <label>Type de résolution</label>
              <select value={resolType} onChange={e => setResolType(e.target.value)}>
                <option value="manuelle">Manuelle</option>
                <option value="automatique">Automatique</option>
              </select>
            </div>
            <div className="form-group">
              <label>Justification / dérogation (optionnel)</label>
              <textarea
                value={resolJustif}
                onChange={e => setResolJustif(e.target.value)}
                placeholder="Expliquez la raison de la résolution ou dérogation..."
                rows={3}
              />
            </div>
            <div className="form-actions" style={{ gap: 8 }}>
              <button onClick={() => resoudreAlerte(showResolModal)} className="btn-success">
                Confirmer
              </button>
              <button onClick={() => creerArbitrage(showResolModal)} className="btn-secondary">
                Arbitrage MOA
              </button>
              <button onClick={() => setShowResolModal(null)} className="btn-ghost">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showLexique && <LexiqueModal onClose={() => setShowLexique(false)} />}

      {showTexteModal && (
        <div className="modal-overlay" onClick={() => setShowTexteModal(null)}>
          <div className="modal-card" style={{ maxWidth: 780, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 15 }}>Texte extrait — {showTexteModal.nom}</h3>
              <button className="btn-ghost" onClick={() => setShowTexteModal(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
              {showTexteModal.loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}
              {showTexteModal.error && <p style={{ color: '#ef4444', fontSize: 13 }}>Erreur lors du chargement.</p>}
              {!showTexteModal.loading && !showTexteModal.error && (
                showTexteModal.contenuTexte
                  ? <pre style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', color: 'var(--text)', margin: 0 }}>{showTexteModal.contenuTexte}</pre>
                  : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun texte extrait pour ce document.</p>
              )}
            </div>
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {showTexteModal.contenuTexte ? `${showTexteModal.contenuTexte.length.toLocaleString('fr-FR')} caractères` : ''}
              </span>
              <button onClick={() => setShowTexteModal(null)} className="btn-ghost">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {showComparerModal && (
        <div className="modal-overlay" onClick={() => setShowComparerModal(null)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Relancer la comparaison</h3>
              <button className="btn-ghost" onClick={() => setShowComparerModal(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Comparer <strong style={{ color: 'var(--text)' }}>{showComparerModal.nom}</strong> avec :
            </p>
            {(() => {
              const cats = showComparerModal.categorie === 'dpgf'
                ? [{ key: 'programme', label: 'Notices' }, { key: 'cctp', label: 'CCTPs' }]
                : [{ key: 'programme', label: 'Notices' }]
              const docsDispos = projet.documents.filter(d =>
                d.id !== showComparerModal.id &&
                cats.map(c => c.key).includes(d.categorieDoc)
              )
              if (docsDispos.length === 0) return (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Aucun document de référence disponible dans ce projet.</p>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                  {cats.map(cat => {
                    const docs = docsDispos.filter(d => d.categorieDoc === cat.key)
                    if (docs.length === 0) return null
                    const allSelected = docs.every(d => comparerIdsRef.includes(d.id))
                    return (
                      <div key={cat.key}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat.label}</span>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => {
                              const ids = docs.map(d => d.id)
                              if (allSelected) setComparerIdsRef(prev => prev.filter(id => !ids.includes(id)))
                              else setComparerIdsRef(prev => [...new Set([...prev, ...ids])])
                            }}
                          >{allSelected ? 'Tout décocher' : 'Tout cocher'}</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {docs.map(doc => {
                            const checked = comparerIdsRef.includes(doc.id)
                            return (
                              <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary-light)' : 'transparent' }}>
                                <input type="checkbox" checked={checked} onChange={() => {
                                  setComparerIdsRef(prev => checked ? prev.filter(id => id !== doc.id) : [...prev, doc.id])
                                }} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nom}</span>
                                {!doc.puce && <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 'auto', flexShrink: 0 }}>non traité</span>}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            {showComparerModal.categorie === 'dpgf' && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Que vérifier ?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { value: 'technique', label: 'Cohérence technique', desc: 'Désignations, équipements, matériaux vs CCTP' },
                    { value: 'chiffrage', label: 'Cohérence des quantités', desc: 'Postes manquants, quantités à 0, incohérences entre bâtiments' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${comparerMode === opt.value ? 'var(--primary)' : 'var(--border)'}`, background: comparerMode === opt.value ? 'var(--primary-light)' : 'transparent' }}>
                      <input type="radio" name="comparerMode" value={opt.value} checked={comparerMode === opt.value} onChange={() => setComparerMode(opt.value)} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Modèle IA</p>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { value: 'haiku', label: 'Haiku', desc: 'rapide' },
                  { value: 'sonnet', label: 'Sonnet', desc: 'précis' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                    <input type="radio" name="modeleIA" value={opt.value} checked={comparerModele === opt.value} onChange={() => setComparerModele(opt.value)} />
                    <span>{opt.label} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({opt.desc})</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 8 }}>
              <button onClick={lancerComparaison} disabled={comparerEnCours || comparerIdsRef.length === 0} className="btn-primary">
                {comparerEnCours ? 'Lancement...' : `Lancer${comparerIdsRef.length > 0 ? ` (${comparerIdsRef.length} fichier${comparerIdsRef.length > 1 ? 's' : ''})` : ''}`}
              </button>
              <button onClick={() => setShowComparerModal(null)} className="btn-ghost">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDoc && (
        <div className="modal-overlay" onClick={() => setShowDeleteDoc(null)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Supprimer le document</h3>
              <button className="btn-ghost" onClick={() => setShowDeleteDoc(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <p style={{ fontSize: 14, marginBottom: 16 }}>
              Supprimer <strong>{showDeleteDoc.nom}</strong> ?
            </p>
            <div className="form-group">
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={deleteResoudreAlertes}
                  onChange={e => setDeleteResoudreAlertes(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Résoudre les alertes liées à ce document
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: 8 }}>
              <button onClick={supprimerDocument} className="btn-ghost" style={{ color: '#ef4444' }}>Supprimer</button>
              <button onClick={() => setShowDeleteDoc(null)} className="btn-ghost">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showEditProjet && (
        <div className="modal-overlay" onClick={() => setShowEditProjet(false)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifier le projet</h3>
              <button className="btn-ghost" onClick={() => setShowEditProjet(false)} style={{ padding: '4px 8px' }}>✕</button>
            </div>
            <form onSubmit={sauvegarderProjet}>
              <div style={{ overflowY: 'auto', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 4 }}>

                {/* 1. Identification */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>1. Identification du projet</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Nom de l'opération *</label>
                      <input value={editNom} onChange={e => setEditNom(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>MOA / Client *</label>
                      <input value={editClient} onChange={e => setEditClient(e.target.value)} required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Adresse complète</label>
                        <input value={editMeta.adresse || ''} onChange={e => setEditMeta(p => ({ ...p, adresse: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Commune + Code postal</label>
                        <input value={editMeta.commune || ''} onChange={e => setEditMeta(p => ({ ...p, commune: e.target.value }))} placeholder="Ex : Lumbin 38660" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Références cadastrales</label>
                        <input value={editMeta.refCadastrales || ''} onChange={e => setEditMeta(p => ({ ...p, refCadastrales: e.target.value }))} placeholder="Section + numéro de parcelle" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Zone climatique RE2020</label>
                        <select value={editMeta.zoneClimatique || ''} onChange={e => setEditMeta(p => ({ ...p, zoneClimatique: e.target.value }))}>
                          <option value="">— Non défini —</option>
                          {ZONES_CLIM.map(z => <option key={z} value={z}>{z}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Nature et programme */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>2. Nature et programme</p>
                  <div className="form-group" style={{ margin: '0 0 10px' }}>
                    <label>Type d'opération</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      {TYPES_OPERATION.map(t => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" name="typeOperation" style={{ width: 'auto' }} checked={editMeta.typeOperation === t} onChange={() => setEditMeta(p => ({ ...p, typeOperation: t }))} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0, maxWidth: 160 }}>
                    <label>Nombre de bâtiments</label>
                    <input type="number" min="1" value={editMeta.nombreBatiments || ''} onChange={e => setEditMeta(p => ({ ...p, nombreBatiments: e.target.value }))} />
                  </div>
                </div>

                {/* 3. Réglementation thermique */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>3. Réglementation thermique applicable</p>
                  <div className="form-group" style={{ margin: '0 0 12px' }}>
                    <label>Réglementation</label>
                    <select value={editMeta.reglementation || ''} onChange={e => setEditMeta(p => ({ ...p, reglementation: e.target.value }))}>
                      <option value="">— Sélectionner —</option>
                      {RT_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}{r.detail ? ` — ${r.detail}` : ''}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Date dépôt PC</label>
                      <input type="date" value={editMeta.datePCDepot || ''} disabled={editMeta.pcNonDepose} onChange={e => setEditMeta(p => ({ ...p, datePCDepot: e.target.value }))} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4, cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!editMeta.pcNonDepose} onChange={e => setEditMeta(p => ({ ...p, pcNonDepose: e.target.checked, datePCDepot: e.target.checked ? '' : p.datePCDepot }))} />
                        PC non déposé
                      </label>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Date obtention PC</label>
                      <input type="date" value={editMeta.datePCObtention || ''} disabled={editMeta.pcEnCours} onChange={e => setEditMeta(p => ({ ...p, datePCObtention: e.target.value }))} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4, cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!editMeta.pcEnCours} onChange={e => setEditMeta(p => ({ ...p, pcEnCours: e.target.checked, datePCObtention: e.target.checked ? '' : p.datePCObtention }))} />
                        En cours / Non obtenu
                      </label>
                    </div>
                  </div>
                </div>

                {/* 4. Labels / PLUi */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>4. Labels, certifications et exigences PLUi</p>
                  <div className="form-group" style={{ margin: '0 0 10px' }}>
                    <label>Label / Certification visée</label>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                      {LABELS_OPTIONS.map(l => (
                        <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" style={{ width: 'auto' }}
                            checked={(editMeta.labels || []).includes(l)}
                            onChange={() => setEditMeta(p => {
                              const cur = p.labels || []
                              return { ...p, labels: cur.includes(l) ? cur.filter(v => v !== l) : [...cur, l] }
                            })}
                          /> {l}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Taux EnR PLUi (%)</label>
                      <input type="number" min="0" max="100" value={editMeta.tauxEnR || ''} onChange={e => setEditMeta(p => ({ ...p, tauxEnR: e.target.value }))} placeholder="Ex : 30" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Autres exigences PLUi</label>
                      <input value={editMeta.autresExigences || ''} onChange={e => setEditMeta(p => ({ ...p, autresExigences: e.target.value }))} placeholder="Ex : gaz interdit, toiture végétalisée..." />
                    </div>
                  </div>
                </div>

              </div>
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button type="submit" disabled={editEnCours} className="btn-primary">
                  {editEnCours ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button type="button" onClick={() => setShowEditProjet(false)} className="btn-ghost">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal pré-analyse Python */}
      {showPreAnalyse && (
        <div className="modal-overlay" onClick={() => setShowPreAnalyse(null)}>
          <div className="modal-card" style={{ maxWidth: 820, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔍 Pré-analyse Python</h3>
              <button className="btn-ghost" onClick={() => setShowPreAnalyse(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>

            {showPreAnalyse.loading && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Analyse en cours… (peut prendre 10-30s)</p>
            )}
            {showPreAnalyse.error && (
              <p style={{ color: '#ef4444', fontSize: 13, padding: '20px 0' }}>{showPreAnalyse.error}</p>
            )}
            {showPreAnalyse.data && (() => {
              const d = showPreAnalyse.data
              const alertes = d.alertes || []
              const nbOk = Object.values(preAnalyseFeedback).filter(v => v === 'ok').length
              const nbFp = Object.values(preAnalyseFeedback).filter(v => v === 'fp').length
              const CRITICITE_COLOR = { CRITIQUE: '#ef4444', MAJEUR: '#f59e0b', MINEUR: '#6b7280', INCERTAIN: '#8b5cf6' }
              const CODE_LABEL = { C01: 'CCTP→absent DPGF', C02: 'DPGF orphelin', C03: 'Type différent', C04: 'Marque différente', C05: 'Puissance différente', INCERTAIN: 'Désignation incertaine' }

              // Filtrer : exclure les batiments "SECTION_X" (faux positifs mapping vide)
              const alertesFiltrees = alertes.filter(a => a.batiment && !a.batiment.match(/^SECTION_/))

              return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 0 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text)' }}>{d.dpgf_nom}</strong> vs <strong style={{ color: 'var(--text)' }}>{d.cctp_nom}</strong>
                    <span style={{ marginLeft: 16 }}>{alertesFiltrees.length} écarts détectés</span>
                    {(nbOk + nbFp) > 0 && <span style={{ marginLeft: 12, color: '#22c55e' }}>✓ {nbOk} judicieux</span>}
                    {nbFp > 0 && <span style={{ marginLeft: 8, color: '#6b7280' }}>✗ {nbFp} faux positifs</span>}
                    <span style={{ marginLeft: 12, fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10 }}>Résultats non sauvegardés — calibrage uniquement</span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
                    {alertesFiltrees.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>Aucun écart détecté (mapping bâtiment non configuré — résultats partiels).</p>
                    )}
                    {alertesFiltrees.map((a, idx) => {
                      const fb = preAnalyseFeedback[idx]
                      return (
                        <div key={idx} style={{
                          padding: '10px 12px', marginBottom: 6, borderRadius: 8,
                          background: fb === 'ok' ? '#f0fdf4' : fb === 'fp' ? '#f9fafb' : 'var(--bg-card)',
                          border: `1px solid ${fb === 'ok' ? '#86efac' : fb === 'fp' ? '#e5e7eb' : 'var(--border)'}`,
                          opacity: fb === 'fp' ? 0.5 : 1
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, background: CRITICITE_COLOR[a.criticite] || '#6b7280', color: 'white', padding: '2px 7px', borderRadius: 10 }}>{a.criticite}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 7px', borderRadius: 10, border: '1px solid var(--border)' }}>{CODE_LABEL[a.code] || a.code}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.batiment}</span>
                              </div>
                              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, marginBottom: a.cctp_texte || a.dpgf_texte ? 4 : 0 }}>{a.motif}</p>
                              {a.cctp_texte && <p style={{ fontSize: 11, color: '#0ea5e9', margin: 0 }}>CCTP{a.cctp_section ? ` §${a.cctp_section}` : ''} : « {a.cctp_texte.substring(0, 120)} »</p>}
                              {a.dpgf_texte && <p style={{ fontSize: 11, color: '#22c55e', margin: 0 }}>DPGF : « {a.dpgf_texte.substring(0, 120)} »</p>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => setPreAnalyseFeedback(prev => ({ ...prev, [idx]: prev[idx] === 'ok' ? undefined : 'ok' }))}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600, background: fb === 'ok' ? '#22c55e' : 'white', color: fb === 'ok' ? 'white' : '#22c55e', borderColor: '#22c55e' }}
                              >✓ Judicieux</button>
                              <button
                                onClick={() => setPreAnalyseFeedback(prev => ({ ...prev, [idx]: prev[idx] === 'fp' ? undefined : 'fp' }))}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600, background: fb === 'fp' ? '#6b7280' : 'white', color: fb === 'fp' ? 'white' : '#6b7280', borderColor: '#6b7280' }}
                              >✗ Faux positif</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
```

