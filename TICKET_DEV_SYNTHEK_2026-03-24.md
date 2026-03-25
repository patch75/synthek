# TICKET DEV — Synthek
# Date : 2026-03-24
# Auteur : BET Fluides senior
# Lire aussi : CLAUDE.md / MULTI_AGENT_SYNTHEK_2026-03-24.md / PLAN_SYNTHESE_C.md

---

## VISION PRODUIT — LIRE EN PREMIER

Synthek évolue vers une architecture **multi-agents SYNTHEK-LABS**.
Ce n'est PAS le chantier de cette session — mais toute décision d'architecture
doit être compatible avec ce modèle futur.

```
ROADMAP GLOBALE
──────────────────────────────────────────────────────────────
PHASE ACTUELLE  → Infrastructures
                  ✅ Granulométrie (import Excel → Sonnet → table D1)
                  ✅ Mapping bâtiments CCTP↔DPGF
                  ✅ Fast path 1 appel Claude (conditionné mapping validé)
                  🔲 Synthèse des prestations (ce ticket)

PHASE 2         → Méthodes de comparaison définies + validées
                  🔲 Tester fast path sur projet réel (mapping validé requis)
                  🔲 Notice / CCTP         (Synthèse A — nouvelle)
                  🔲 Notice / DPGF         (Synthèse B — nouvelle)
                  🔲 CCTP / DPGF enrichie  (Synthèse C — via PrestationsFinancement)

PHASE 3         → Architecture multi-agents SYNTHEK-LABS
                  🔲 Agent FLUIDES + THERMICIEN + MOE EXE
                  🔲 Orchestrateur routing lotType → agent
                  🔲 Structure JSON commune inter-agents + agentSource BDD
                  🔲 Agents V2-P2 : ÉCONOMISTE / VRD / SÉCURITÉ INCENDIE /
                     RÉGLEMENTATION / ACOUSTIQUE / ACV / URBANISME

PHASE 4         → Lecture graphique DWG/PDF (V3 — hors périmètre)
──────────────────────────────────────────────────────────────
```

**Compatibilité Phase 3 — à garder en tête dès maintenant :**
- Table `Alerte` → prévoir `agentSource` TEXT (ex: `'FLUIDES'`, `'GENERIQUE'`, `'PYTHON'`)
- Table `Alerte` → vérifier redondance `ancreDocA`/`ancreDocB` vs `contexteSource`/`dpgfSource`
- Service `comparerDocuments.js` → sera refactoré en orchestrateur → agents
- Table `PrestationsFinancement` (ci-dessous) → sera la **source de vérité niveau 4 (Notice)**
  utilisée par les agents pour qualifier les écarts BLOQUANT vs MAJEUR
- Modèle LLM : **Sonnet 4.6 sur toute la chaîne — ne pas changer**

---

## CE QUI EST EN PLACE — MÉMOIRE

```
✅ Auth JWT + rôles (admin, bet_fluides, moa, architecte…)
✅ Page Projet :
     ⚙  Métadonnées (adresse, zone climatique, RE2020, labels)
     👥 Intervenants (9 fixes, édition inline admin)
     🏢 Granulométrie (import Excel → Sonnet → table D1)
     📁 Sous-programmes + périmètres documentaires
     📄 Documents (puce IA Haiku, catégorie, lotType)
✅ Mapping bâtiments : section CCTP ↔ feuilles DPGF, validé/invalidé
✅ Fast path : 1 appel Claude si mapping validé (25s vs 152s)
     — conditionné à mappingEstValide = true
     — fallback section par section si mapping absent
✅ Moteur Python : comparaison_cctp_dpgf.py + equivalences_fluides.py V2.0 (C01–C05)
✅ Pré-analyse 🔍 : modal écarts Python, feedback ✓/✗ local React (non persisté)
✅ SYSTEM_PROMPT_BET_FLUIDES V2.1 : règles T1–T8, R1–R6, exemples calibration
✅ Alertes BDD : criticité CRITIQUE/MAJEUR/MINEUR, traçabilité extraits, résolution
✅ Historique alertes résolues + messages IA
✅ Hiérarchie documentaire SYNTHEK-LABS encodée (7 niveaux)
```

---

## CHANTIER A — SYNTHÈSE DES PRESTATIONS (nouveau)

### Contexte métier

Chaque programme immobilier comporte plusieurs types de logements (financements),
chacun avec sa propre notice descriptive définissant ses prestations techniques.
Les prestations sont **identiques pour un même financement sur tout le programme**.
→ Une seule ligne par financement par projet.

**Équivalence à ajouter dans `equivalences_fluides.py` :**
```python
# LLI et LLS sont techniquement équivalents — même niveau de prestation
'LLI' → 'social'
'LLS' → 'social'
```

**4 types de financement :**

| Code BDD     | Affiché UI           | Couvre                    |
|--------------|----------------------|---------------------------|
| `social`     | Social (LLI/LLS)     | LLI, LLS, LLTS, PLS       |
| `brs`        | BRS                  | Bail Réel Solidaire        |
| `acces_std`  | Accession standard   | Accession libre standard   |
| `premium`    | Accession premium    | Attique, dernier niveau    |

---

### TÂCHE A1 — Migration BDD

**Nouveau fichier :**
`backend/prisma/migrations/20260324000001_prestations_financement/migration.sql`

```sql
CREATE TABLE "PrestationsFinancement" (
  "id"               SERIAL PRIMARY KEY,
  "projetId"         INTEGER NOT NULL REFERENCES "Projet"(id) ON DELETE CASCADE,
  "financement"      TEXT NOT NULL,
  "documentSourceId" INTEGER REFERENCES "Document"(id) ON DELETE SET NULL,
  "source"           TEXT NOT NULL DEFAULT 'manuel',
  "fiabilite"        TEXT NOT NULL DEFAULT 'a_confirmer',
  "dateExtraction"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- MODULE 1 — CHAUFFAGE
  "chauf_distribution"  TEXT,
  "chauf_production"    TEXT,
  "chauf_emetteurs"     TEXT,    -- JSON array string (valeurs multiples possibles)
  "chauf_regulation"    TEXT,    -- JSON array string

  -- MODULE 2 — ECS
  "ecs_production"      TEXT,
  "ecs_distribution"    TEXT,

  -- MODULE 3 — VMC
  "vmc_type"            TEXT,

  -- MODULE 4 — SANITAIRES
  "san_wc"              TEXT,
  "san_vasque"          TEXT,
  "san_douche"          TEXT,
  "san_baignoire"       TEXT,
  "san_robinetterie"    TEXT,

  -- MODULE 5 — ENR
  "enr_type"            TEXT,

  "noteComplementaire"  TEXT,

  CONSTRAINT "PrestationsFinancement_projetId_financement_key"
    UNIQUE ("projetId", "financement")
);
```

**Ajouter dans `schema.prisma` :**
```prisma
model PrestationsFinancement {
  id                 Int       @id @default(autoincrement())
  projetId           Int
  financement        String
  documentSourceId   Int?
  source             String    @default("manuel")
  fiabilite          String    @default("a_confirmer")
  dateExtraction     DateTime  @default(now())
  chauf_distribution String?
  chauf_production   String?
  chauf_emetteurs    String?
  chauf_regulation   String?
  ecs_production     String?
  ecs_distribution   String?
  vmc_type           String?
  san_wc             String?
  san_vasque         String?
  san_douche         String?
  san_baignoire      String?
  san_robinetterie   String?
  enr_type           String?
  noteComplementaire String?   @db.Text

  projet         Projet    @relation(fields: [projetId], references: [id], onDelete: Cascade)
  documentSource Document? @relation(fields: [documentSourceId], references: [id])

  @@unique([projetId, financement])
}
```

---

### TÂCHE A2 — Routes backend

**Fichier :** `backend/src/routes/projets.js`

```
GET    /projets/:id/prestations              → liste des lignes du projet
POST   /projets/:id/prestations              → upsert une ligne (règle : unique projetId+financement)
PATCH  /projets/:id/prestations/:financement → modifier une ligne
DELETE /projets/:id/prestations/:financement → supprimer une ligne
POST   /projets/:id/prestations/extraire     → déclencher extraction Sonnet depuis notice uploadée
```

**Règle POST :** si `[projetId, financement]` existe → update, sinon → create.

---

### TÂCHE A3 — Extraction Sonnet

**Nouveau fichier :** `parser-service/extraire_prestations.py`

**Pipeline :**
```
Upload notice (PDF/DOCX) → texte brut → appel Sonnet → JSON structuré
→ validation Python valeurs → retour frontend
```

**Règles critiques à encoder dans le prompt Sonnet :**
1. Lire en priorité les **parties privatives** — ignorer parties communes pour les prestations logement
   (piège notices promoteur : le générateur est souvent décrit vaguement p.8 parties communes,
   puis précisément p.12 parties privatives — prioriser p.12)
2. Distinguer **"fourni"** vs **"en attente"** → attente seulement = `null`, jamais extrapolé
3. Valeur conditionnelle ("selon plan", "selon configuration") → `fiabilite: "a_confirmer"`
4. Contradiction entre deux pages → prioriser la page la plus précise

**Valeurs contrôlées par champ — à valider en Python après extraction :**

| Champ                | Valeurs acceptées |
|----------------------|-------------------|
| `chauf_distribution` | `individuel` / `collectif` / `mixte` |
| `chauf_production`   | `pac_air_eau` / `pac_eau_eau` / `chaudiere_gaz_individuelle` / `chaudiere_gaz_collective` / `chaudiere_biomasse` / `rcu` / `effet_joule` |
| `chauf_emetteurs`    | `plt` / `radiateurs_eau` / `ventiloconvecteurs` / `plafond_rayonnant` / `convecteurs_electriques` / `seche_serviettes_elec` |
| `chauf_regulation`   | `robinets_thermostatiques` / `gtb_gtc` / `thermostat_ambiance` / `programmation_logement` |
| `ecs_production`     | `pac_thermo_individ` / `pac_thermo_collectif` / `chauffe_eau_elec` / `cesi` / `scsc` / `chaudiere_gaz_individuelle` / `rcu` / `ballon_elec_collectif` |
| `ecs_distribution`   | `individuelle_sans_boucle` / `boucle_collective` / `bouclage_anti_legionellose` |
| `vmc_type`           | `sf_a` / `sf_hygro_a` / `sf_hygro_b` / `df_collectif` / `df_individuel` |
| `san_wc`             | `sol` / `suspendu` |
| `san_vasque`         | `meuble` / `poser` / `suspendu` / `attente_seulement` |
| `san_douche`         | `receveur_extra_plat_paroi` / `receveur_standard` / `italienne` |
| `san_baignoire`      | `encastree_pare_baignoire` / `selon_plan` / `aucune` |
| `san_robinetterie`   | `mecanique` / `thermostatique` / `electronique` |
| `enr_type`           | `solaire_th` / `pv` / `geothermie` / `aucune` |

Note : `chauf_emetteurs` et `chauf_regulation` = JSON array string (plusieurs valeurs possibles).

**Nouvelle route Flask dans `parser-service/main.py` :**
```
POST /prestations/extraire  { fichier: base64, nom_fichier, financement }
  → { financement, chauf_distribution, chauf_production, ..., fiabilite, source: "notice" }
```

---

### TÂCHE A4 — UI section Prestations

**Fichier :** `frontend/src/pages/Projet.jsx`

Nouvelle section **"📋 Prestations"** après la section Bâtiments.

- Tableau : une ligne par financement (`social` / `brs` / `acces_std` / `premium`)
- Colonnes : Financement / Chauffage / ECS / VMC / Sanitaires / ENR / Source / Fiabilité / Actions
- Badge fiabilité : vert `haute` / orange `moyenne` / rouge `a_confirmer`
- Bouton **📥 Extraire depuis notice** (admin) :
  → modal sélection document Notice dans la liste documents du projet
  → appel `/prestations/extraire`
  → affiche proposition
  → utilisateur valide ou modifie champ par champ
  → sauvegarde via POST `/prestations`
- Bouton **✏️ Saisie manuelle** (admin) → formulaire inline par financement
- Pattern UX identique à la granulométrie : proposer → valider → persister

---

## CHANTIER B — CORRECTIONS ET DETTES TECHNIQUES (existant)

---

### TÂCHE B1 — Nettoyage debug prints *(quick win — 10 min)*

**À faire avant tout autre commit :**

`parser-service/extraire_granulometrie.py` :
- Retirer `print(json.dumps(sonnet_brut))` après `_appeler_sonnet`

`parser-service/main.py` :
- Retirer `print(f"BODY /import : {body}")` dans la route `/granulometrie/import`

À la racine :
- Supprimer `sonnet_output_debug.json`

---

### TÂCHE B2 — Switch Haiku/Sonnet UI *(décision + quick win — 15 min)*

**Situation :** switch affiché dans le modal "Relancer comparaison" mais backend forcé Sonnet depuis session 2026-03-20. Switch inactif.

**Décision à prendre :** supprimer le switch UI ou restaurer le ternaire backend.

**Recommandation :** supprimer le switch UI — Sonnet forcé est la bonne décision
(moins de faux positifs, décision actée SESSION_2026-03-20).

---

### TÂCHE B3 — `section_cctp` / `feuilles_dpgf` null après import granulométrie

**Problème :** ces champs restent `null` après import Excel → fast path Python désactivé
sur tout nouveau projet → l'analyse diff reste en mode fallback (section par section, 152s).

**Contournement actuel :** import JSON complet avec ces champs pré-renseignés.

**Fix :** exposer dans le modal édition granulométrie les champs `section_cctp` et
`feuilles_dpgf` par bâtiment — saisie manuelle ou dérivation automatique à la validation.

⚠️ **Prérequis direct pour activer le fast path sur tout projet autre que L'Allégorie.**

---

### TÂCHE B4 — Migration format ancien → D1 *(décision requise)*

**Situation :** projets avec bâtiments en format ancien (nom + typologies string)
affichent la liste manuelle. Pas de migration automatique.

**Décision à prendre :**
- Option A : migration SQL one-shot — convertir `batimentsComposition` ancien format → D1
- Option B : cohabitation — conserver les deux formats, UI détecte et affiche selon format

**Recommandation :** Option A si peu de projets en production, Option B sinon.

---

### TÂCHE B5 — Feedback ✓/✗ persisté BDD *(pending depuis session 2026-03-19)*

**Situation :** ✓ Judicieux / ✗ Faux positif = état local React uniquement, perdu au rechargement.

**Migration :**
```sql
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "feedbackUtilisateur" TEXT;
-- valeurs : 'judicieux' | 'faux_positif' | null
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "feedbackPar"   INTEGER REFERENCES "User"(id);
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "feedbackDate"  TIMESTAMP(3);
```

**Route :** `PATCH /alertes/:id/feedback` → `{ feedback: 'judicieux' | 'faux_positif' }`

**UI :** boutons ✓/✗ dans modal pré-analyse ET dans les accordéons alertes → persisté immédiatement.

---

### TÂCHE B6 — UI granulométrie : types logements + chauffage + VMC *(pending session 2026-03-20)*

**Situation :** champs `types_logements`, `systeme_chauffage`, `systeme_vmc` existent
en BDD et dans le format JSON mais ne sont pas exposés dans le formulaire modal.
Contournement actuel = importer le JSON complet avec ces champs pré-renseignés.

**Fix :** ajouter ces champs dans le modal d'édition granulométrie.
Ces données enrichissent le contexte injecté dans le prompt Claude (règle T6 — périmètre bâtiment).

---

### TÂCHE B7 — Préparation Phase 3 : champs BDD alertes

**Migration :**
```sql
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "agentSource" TEXT;
-- valeurs actuelles : 'PYTHON' | 'GENERIQUE'
-- valeurs Phase 3   : 'FLUIDES' | 'THERMICIEN' | 'ECONOMISTE' | 'MOE_EXE'
```

Avant d'ajouter `ancreDocA`/`ancreDocB` : **vérifier redondance avec `contexteSource`/`dpgfSource`**
qui existent déjà. Si couverts → renommer. Si non → ajouter.

**Alimentation :**
- Alertes Python (bouton 🔍) → `agentSource = 'PYTHON'`
- Alertes Claude actuelles → `agentSource = 'GENERIQUE'`
- Alertes existantes en BDD → `UPDATE "Alerte" SET "agentSource" = 'GENERIQUE' WHERE "agentSource" IS NULL`

---

## ORDRE DES TÂCHES — DÉPENDANCES

```
Tâche 1  →  B1  Nettoyage debug prints
               ⚠️ Faire en premier — commit propre avant tout développement

Tâche 2  →  B2  Décision + fix switch Haiku/Sonnet UI (15 min)

Tâche 3  →  A1  Migration BDD PrestationsFinancement
              +  B5  Migration feedback (feedbackUtilisateur / feedbackPar / feedbackDate)
              +  B7  Migration agentSource (+ vérif ancreDocA/B)
               → Grouper toutes les migrations dans la même session SQL

Tâche 4  →  B3  section_cctp / feuilles_dpgf dans UI modal granulométrie
               ⚠️ Débloque le fast path sur tout nouveau projet

Tâche 5  →  B4  Décision + migration format ancien → D1

Tâche 6  →  A2  Routes backend prestations
              +  B5  Route PATCH /alertes/:id/feedback

Tâche 7  →  A3  extraire_prestations.py + route Flask /prestations/extraire

Tâche 8  →  A4  UI section Prestations dans Projet.jsx
              +  B5  UI boutons ✓/✗ persistés dans modal + accordéons
              +  B6  UI types logements / chauffage / VMC dans modal granulométrie
```

---

## RAPPELS STACK

```bash
# Appliquer les migrations
cd backend && npx prisma migrate deploy && npx prisma generate

# Lancer les services
cd parser-service && PYTHONIOENCODING=utf-8 PYTHONUNBUFFERED=1 python main.py  # port 5001
cd backend && node server.js                                                     # port 3000
cd frontend && npm run dev                                                       # port 5173
```

- Toujours `prisma migrate deploy` — jamais `prisma db push` en prod
- Toujours créer le fichier SQL dans `prisma/migrations/` avant de lancer la migration
- Table `Batiment` : créée via migration `20260323000001_batiment_souprogramme` — ne pas recréer
- Modèle LLM : `claude-sonnet-4-6` — ne pas changer
