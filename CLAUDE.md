# Synthek — Contexte projet pour Claude

## Description
Application web de vérification documentaire pour BET thermique (bureaux d'études thermiques).
Analyse et compare automatiquement des documents techniques (Programmes, CCTP, DPGF) via l'API Anthropic.

## Stack technique
- **Frontend** : React + Vite, servi par Nginx
- **Backend** : Node.js + Express, géré par PM2 (port 3000)
- **Base de données** : PostgreSQL (Docker) + Prisma ORM
- **IA** : API Anthropic — Haiku (rapide/cheap) et Sonnet (précis)

## Structure du projet
```
synthek/
├── frontend/        # React + Vite
│   └── src/
│       ├── pages/   # Dashboard.jsx, Projet.jsx, Upload.jsx, Chat.jsx
│       └── services/api.js  # baseURL = /api en prod
├── backend/
│   ├── routes/      # API Express
│   ├── services/    # comparerDocuments.js, extractFaits.js, ia.js
│   └── prisma/      # schema.prisma + migrations
└── deploy.sh        # Script déploiement tout-en-un
```

## Architecture IA

### Déclenchement automatique à l'upload
- Haiku génère une **puce** (`genererPuce`) + extrait des **faits** (`extraireFaits`) en background
- Upload CCTP/DPGF → comparaison automatique vs programmes de référence

### Hiérarchie documentaire (HIERARCHIE_VERITE dans ia.js)
1. **Programme** — référence absolue (exigences MOA)
2. **CCTP** — décline le programme lot par lot
3. **DPGF** — chiffrage des prestations du CCTP
4. Plans architecte
5. Notes de calcul
6. Comptes-rendus

### Catégories documentaires (`categorieDoc`)
Valeurs : `programme`, `cctp`, `dpgf`, `plans`, `pieces_ecrites`, `etudes_th`, `bureau_controle`, `notes_calcul`, `comptes_rendus`, `autre`

### Sous-programmes (multi-typologies)
- Table `SousProgramme` (id, projetId, nom) — ex: "Villas", "Bâtiments AB", "Social"
- `Document.sousProgrammeId` FK nullable → permet comparaisons ciblées par périmètre
- Routes : GET/POST/DELETE `/projets/:id/sous-programmes`

## Base de données — IMPORTANT
- `prisma migrate dev` ne crée pas toujours les tables → toujours vérifier + créer en SQL manuellement si besoin
- Colonnes ajoutées hors migrations Prisma :
```sql
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "categorieDoc" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "sousProgrammeId" INTEGER REFERENCES "SousProgramme"(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS "SousProgramme" (
  id SERIAL PRIMARY KEY,
  "projetId" INTEGER NOT NULL REFERENCES "Projet"(id) ON DELETE CASCADE,
  nom TEXT NOT NULL
);
```

## UI Projet.jsx — structure
- **Alertes** : accordéons par sous-programme, boutons Résoudre + Supprimer
- **Programmes de référence** : accordéons par sous-programme, fermés par défaut
- **Documents** : tableau (Nom, Catégorie, Périmètre, Puce IA, Date, Actions), bouton "⟳ Comparer" + Supprimer
- Bouton "Analyser" : supprimé
- Modal "Relancer comparaison" : checkboxes sous-programmes + switch Haiku/Sonnet

## Comparaison CCTP/DPGF
- Switch Haiku (rapide) / Sonnet (précis) — défaut : Haiku
- Sonnet recommandé pour moins de faux positifs (~0.06€/comparaison)
- Avant chaque comparaison : suppression des anciennes alertes du même label `[TYPE — SousProgramme]`
- Label alertes : `[CCTP vs Programme — NomSousProgramme]`

## Formats de fichiers supportés
- PDF texte → optimal
- DOCX → bon (mammoth)
- XLSX → bon pour DPGF (exceljs)
- PDF scanné → fallback Vision IA
- DOC → **non supporté** (demander .docx)

## Rôles utilisateurs
- `admin`, `bet_thermique`, `moa`
- Les projets sont filtrés par membres — l'admin doit être invité explicitement

## Dépendances notables
- `pdf-parse` : fixé à v1.1.1 (v2 incompatible)
- `xlsx` (SheetJS v0.18.5) : pour .xls uniquement
- `exceljs` : pour .xlsx
- Rate limit Anthropic : 10 000 tokens/min → TEXTE_MAX=12000 chars dans extractFaits.js

## Déploiement
```bash
# Depuis la racine du projet local :
./deploy.sh "fix: description du changement"
```

## Communication
- Répondre en **français**
- Garder les solutions simples et directes
- Éviter l'over-engineering
