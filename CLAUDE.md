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
