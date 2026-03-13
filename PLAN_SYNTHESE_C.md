# Plan d'intégration — Synthèse C dans Synthek

Basé sur le document client : `MOE_AI_Synthese_C_v3_Dossier_Complet.docx`

---

## Étape 1 — Base de données : ajouter le champ `criticite` sur les alertes

**Fichier :** `backend/prisma/schema.prisma`
Ajouter le champ `criticite String? // "CRITIQUE" | "MAJEUR" | "MINEUR"` dans le model `Alerte`.

**SQL à exécuter sur le VPS :**
```sql
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "criticite" TEXT;
```
*(pas de migration Prisma nécessaire — faire en SQL direct comme d'habitude)*

---

## Étape 2 — Microservice Python pour le parsing

**Pourquoi en priorité :** les DPGF Excel ont des lignes parent/enfant que les parsers Node ne reconstituent pas.
Exemple — aujourd'hui Claude reçoit `DN 40 : 1 u` au lieu de `Vanne d'arrêt générale repérée DN 40 : 1 u`.
Le meilleur prompt ne compensera pas des données mal structurées.

**Architecture :**
```
Upload → Node → Python parser (HTTP local, port 5001) → texte structuré → Node → Claude
```

**Fichiers à créer :**
- `parser-service/main.py` — API Flask/FastAPI exposant :
  - `POST /parse/xlsx` — lit chaque onglet, reconstruit la hiérarchie parent/enfant, retourne texte structuré par bâtiment
  - `POST /parse/docx` — extraction par styles Heading 1/2/3 pour chunking par chapitre
  - `POST /parse/pdf` — extraction tabulaire améliorée (`pdfplumber`)
- `parser-service/requirements.txt` — `flask`, `openpyxl`, `python-docx`, `pdfplumber`

**Modifier :**
- `backend/src/services/extractText.js` — appeler le microservice Python en priorité, fallback sur mammoth/exceljs/pdf-parse si le service est indisponible

**Sur le VPS :**
```bash
cd ~/synthek/parser-service
pip3 install -r requirements.txt
pm2 start main.py --interpreter python3 --name synthek-parser
```

---

## Étape 3 — Backend : refonte du prompt dans `comparerDocuments.js`

**Fichier :** `backend/src/services/comparerDocuments.js`

**3a — Remplacer `agent.systemPrompt` par un nouveau prompt enrichi** qui intègre :
- Le rôle d'ingénieur BET Fluides senior (Bloc 1 du doc client)
- Les pratiques rédactionnelles CCTP/DPGF (chapitres Généralités = pas d'assertions techniques)
- Les architectures techniques connues (PAC, VMC, MTA, chaudière granulés…)
- Le dictionnaire d'équivalences sémantiques (`PAC air/eau` = `pompe à chaleur aérothermique`, etc.)
- Les règles absolues : `'sans objet'` → ne pas créer d'alerte, `'conforme au CCTP'` → INCERTAIN_DESIGNATION

**3b — Modifier le format de réponse JSON demandé** : passer de :
```json
{ "alertes": [{ "message": "..." }] }
```
à :
```json
{
  "alertes": [
    {
      "message": "Description précise...",
      "statut": "ÉCART_MATÉRIAU",
      "criticite": "CRITIQUE"
    }
  ]
}
```

**3c — Lors de la création de l'alerte en BDD**, enregistrer le champ `criticite` depuis la réponse IA.

---

## Étape 4 — Frontend : afficher la criticité dans l'UI

**Fichier :** `frontend/src/pages/Projet.jsx`

Dans la section **Alertes**, ajouter un badge coloré devant chaque alerte :
- `CRITIQUE` → badge rouge vif
- `MAJEUR` → badge orange
- `MINEUR` → badge jaune/gris

Optionnel : ajouter un filtre par criticité en haut de la section alertes.

**Fichier :** `backend/src/routes/alertes.js` (ou équivalent)
S'assurer que le champ `criticite` est inclus dans le `select` Prisma des alertes.

---

## Ordre d'exécution

1. SQL sur le VPS — champ `criticite` *(5 min)*
2. Microservice Python — parsing + reconstruction parent/enfant *(1-2 jours)*
3. Refonte du prompt dans `comparerDocuments.js` *(30 min)*
4. Retour JSON structuré + `criticite` en BDD *(10 min)*
5. Badges criticité dans `Projet.jsx` *(15 min)*
6. `./deploy.sh "feat: criticité alertes + prompt BET Fluides enrichi + parser Python"` *(5 min)*
7. Tests sur documents réels (DPGF L'Allégorie + CCTP correspondant)
