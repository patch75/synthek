# Plan d'intégration — Synthèse C dans Synthek

Basé sur le document client : `MOE_AI_Synthese_C_v3_Dossier_Complet.docx`

---

## État actuel (2026-03-19)

### Ce qui est en place ✅
- **Parser Python** (`parser-service/comparaison_cctp_dpgf.py` + `equivalences_fluides.py`) : diff binaire par famille de prestations, codes alertes C01–C05, sans vérification de quantités
- **Route `/compare/cctp-dpgf`** dans `parser-service/main.py` : accepte CCTP+DPGF en base64, retourne alertes structurées
- **Pré-analyse Python** dans `comparerDocuments.js` : appelle le parser avant Claude, injecte les écarts dans le prompt
- **Méthode légère** (bouton 🔍 Python) dans `Projet.jsx` :
  - Route `POST /documents/:id/pre-analyse` dans `documents.js`
  - Affiche les écarts Python avec criticité colorée, code C01–C05, bâtiment, extraits CCTP/DPGF
  - Feedback ✓ Judicieux / ✗ Faux positif (état local uniquement)
- **SYSTEM_PROMPT V2.1** (règles T1–T8, R1–R6, exemples de calibration)
- **Délai anti-rate-limit** : 8s entre chaque appel Claude (7 sections → ~3 min)

### Problèmes restants ⚠️
- **Faux C01 (batiment=SECTION_X)** : Python génère des alertes CCTP absent du DPGF avec `batiment="SECTION_X"` quand `mapping_batiments` est vide. Filtrés côté Claude mais visuellement présents dans la modale pré-analyse.
- **Claude fait encore de l'ingénierie** : reçoit le texte DPGF brut → peut déduire des quantités. Correction complète = Étape 4 ci-dessous.
- **3 min d'analyse** : 7 appels Claude × 8s de délai. Correction = Étape 5 (appel unique par document).

---

## Méthode complète à intégrer — après méthode légère

### Vue d'ensemble

```
DPGF + CCTP
    │
    ▼
[Python diff engine] ──→ alertes C01–C05 (JSON structuré)
    │                       │
    │                    [Feedback utilisateur : Judicieux / Faux positif]
    │                       │
    ▼                       ▼
[Mapping bâtiments]   [Alertes filtrées]
    │                       │
    └───────────┬───────────┘
                ▼
         [Claude — 1 appel]
         reçoit UNIQUEMENT les extraits des écarts confirmés
         (pas le texte brut du DPGF)
                │
                ▼
         [Alertes BDD avec criticité]
```

---

## Étape 1 — Interface de mapping bâtiment

**Problème :** Python ne sait pas que "Section 3" du CCTP correspond à "BAT B" du DPGF → génère de faux C01.

**Solution :** UI pour configurer le mapping avant analyse.

**Fichiers à créer/modifier :**

`backend/prisma/schema.prisma` — ajouter :
```prisma
model MappingBatiment {
  id         Int      @id @default(autoincrement())
  projetId   Int
  projet     Projet   @relation(fields: [projetId], references: [id], onDelete: Cascade)
  sectionCctp String  // ex: "Section 3 — Chauffage BAT B"
  feuilleDpgf String  // ex: "BAT B"
  createdAt  DateTime @default(now())
}
```

SQL direct :
```sql
CREATE TABLE IF NOT EXISTS "MappingBatiment" (
  id SERIAL PRIMARY KEY,
  "projetId" INTEGER NOT NULL REFERENCES "Projet"(id) ON DELETE CASCADE,
  "sectionCctp" TEXT NOT NULL,
  "feuilleDpgf" TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW()
);
```

`backend/src/routes/projets.js` — ajouter GET/POST/DELETE `/projets/:id/mapping-batiments`

`frontend/src/pages/Projet.jsx` — dans la modale de comparaison, afficher un tableau de correspondances :
| Section CCTP (détectée) | Feuille DPGF | Action |
| — | — | — |
| Section 3 — Chauffage BAT B | [select: BAT B ▼] | Supprimer |

Ce mapping est passé au parser Python via la route `/compare/cctp-dpgf` dans le champ `mapping_batiments`.

---

## Étape 2 — Base de données : champ `criticite` sur les alertes

**Fichier :** `backend/prisma/schema.prisma`
Ajouter : `criticite String? // "CRITIQUE" | "MAJEUR" | "MINEUR"`

SQL :
```sql
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "criticite" TEXT;
```

*(pas de migration Prisma nécessaire — faire en SQL direct)*

---

## Étape 3 — Enregistrer le feedback utilisateur (méthode légère)

Actuellement, ✓ Judicieux / ✗ Faux positif est uniquement en état local React.

**Ajouter :**

`backend/prisma/schema.prisma` :
```prisma
model FeedbackEcart {
  id          Int      @id @default(autoincrement())
  projetId    Int
  projet      Projet   @relation(fields: [projetId], references: [id], onDelete: Cascade)
  codeAlerte  String   // "C01", "C02", etc.
  batiment    String
  description String
  verdict     String   // "JUDICIEUX" | "FAUX_POSITIF"
  createdAt   DateTime @default(now())
}
```

SQL :
```sql
CREATE TABLE IF NOT EXISTS "FeedbackEcart" (
  id SERIAL PRIMARY KEY,
  "projetId" INTEGER NOT NULL REFERENCES "Projet"(id) ON DELETE CASCADE,
  "codeAlerte" TEXT NOT NULL,
  batiment TEXT NOT NULL,
  description TEXT NOT NULL,
  verdict TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW()
);
```

`backend/src/routes/documents.js` — ajouter `POST /:id/feedback-ecart` :
```js
router.post('/:id/feedback-ecart', async (req, res) => {
  const { codeAlerte, batiment, description, verdict } = req.body;
  const document = await prisma.document.findUnique({ where: { id: parseInt(req.params.id) } });
  await prisma.feedbackEcart.create({
    data: { projetId: document.projetId, codeAlerte, batiment, description, verdict }
  });
  res.json({ ok: true });
});
```

`frontend/src/pages/Projet.jsx` — appeler cette route au clic sur ✓/✗.

**Utilité :** les faux positifs accumulés alimenteront une liste d'exclusions automatiques pour les prochaines analyses.

---

## Étape 4 — Claude reçoit uniquement les extraits d'écarts (pas le texte brut)

**Problème actuel :** Claude reçoit le texte DPGF brut → peut déduire des quantités.

**Solution :** dans `comparerDocuments.js`, remplacer l'envoi du texte DPGF par un envoi des seuls extraits Python.

Dans `comparerAvecReference()`, construire le message utilisateur ainsi :
```
ÉCARTS DÉTECTÉS PAR L'ANALYSE STRUCTURELLE (Python) :
[liste des écarts C01–C05 avec extraits CCTP et DPGF]

Valide chacun de ces écarts. Ne cherche pas d'autres écarts.
```

Supprimer l'envoi du texte DPGF complet dans le prompt utilisateur.

---

## Étape 5 — Un seul appel Claude par document (au lieu de 7)

**Problème actuel :** 7 sections × 8s = ~3 min + risque rate limit.

**Condition préalable :** Étape 1 (mapping) + Étape 4 (écarts uniquement).

**Modification dans `comparerDocuments.js`** :
- Remplacer la boucle `for (const section of sections)` par un appel unique
- Regrouper tous les écarts Python en un seul bloc
- Un seul prompt → une seule réponse JSON `{ alertes: [...] }`
- Délai 8s supprimé

Gain : 3 min → ~15s.

---

## Étape 6 — Prompt : version finale

Après Étape 4, le SYSTEM_PROMPT peut être simplifié :
- Supprimer les règles "ne pas vérifier les quantités" (plus besoin si Claude ne voit pas les quantités)
- Garder uniquement : rôle BET Fluides, dictionnaire équivalences, règles de validation des écarts C01–C05

---

## Étape 7 — Frontend : badges criticité dans les alertes

**Fichier :** `frontend/src/pages/Projet.jsx`

Dans la section Alertes, ajouter un badge coloré :
- `CRITIQUE` → badge rouge (`#ef4444`)
- `MAJEUR` → badge orange (`#f97316`)
- `MINEUR` → badge jaune/gris (`#eab308`)

Filtre rapide par criticité en haut de la liste.

---

## Ordre d'exécution recommandé

| # | Étape | Durée est. | Priorité |
|---|-------|-----------|----------|
| 1 | Méthode légère (🔍 Python) | ✅ fait | — |
| 2 | Champ `criticite` BDD (SQL) | 5 min | Haute |
| 3 | Mapping bâtiments UI | 2–3h | Haute — débloquer les faux C01 |
| 4 | Feedback Judicieux/Faux positif en BDD | 30 min | Moyenne |
| 5 | Claude reçoit écarts uniquement (pas texte brut) | 1h | Haute — supprimer analyses quantités |
| 6 | Appel Claude unique par document | 30 min | Haute — performance 3min→15s |
| 7 | Prompt version finale simplifiée | 20 min | Basse |
| 8 | Badges criticité dans Projet.jsx | 15 min | Moyenne |

---

## Notes techniques

### Pourquoi Python génère des SECTION_X
Quand `mapping_batiments` est vide, Python détecte les feuilles Excel du DPGF mais ne sait pas les associer aux sections du CCTP. Il crée des alertes C01 avec `batiment="SECTION_1"`, `"SECTION_2"`, etc. — entités fantômes.
**Fix court terme :** filtrées dans le prompt Claude et dans la modale pré-analyse.
**Fix long terme :** Étape 1 (mapping UI).

### Rate limit Anthropic Haiku
- Limite : 10 000 tokens/min
- Chaque appel ~8 000–10 000 tokens → 1 appel/min max en théorie
- Délai actuel : 8s (empirique, pas toujours suffisant)
- Solution durable : Étape 5 (appel unique)

### Codes alertes Python
| Code | Signification |
|------|--------------|
| C01 | Prestation CCTP absente du DPGF |
| C02 | Prestation DPGF orpheline (pas dans CCTP) |
| C03 | Type/technologie différent(e) |
| C04 | Marque différente |
| C05 | Puissance/débit différent(e) |
