# Faux positifs connus — Moteur Python

Cas identifiés où le diff Python génère des alertes C02/C03 qui sont des faux positifs structurels, liés aux limites du diff binaire sans contexte de sous-périmètre.

---

## CAS 1 — Évier vs Attente évier (logements mixtes)

**Code alerte :** C02 (DPGF orphelin) ou C03 (type différent)
**Bâtiment concerné :** BAT A (ou tout bâtiment avec mix de typologies)

### Situation
Le projet comporte plusieurs types de logements dans le même bâtiment :
- **Logements accession / BRS** → CCTP prescrit `Attente évier` (préparation plomberie, pas d'appareil)
- **Logements social** → CCTP prescrit `Évier` (appareil fourni + posé + raccordé)

Le DPGF reprend les deux lignes correctement. Chaque ligne correspond à son type de logement.

### Ce que Python fait
Python compare les familles de prestations sans lire le contexte de sous-périmètre (type de logement). Il voit :
- `"Évier"` dans le DPGF
- `"Attente évier"` dans le DPGF
- Cherche une correspondance CCTP pour chacun → génère C02 si l'un semble manquer

### Pourquoi c'est un faux positif
`Attente évier` ≠ `Évier` — ce sont deux prestations distinctes à juste titre. Le DPGF est correct. Le CCTP est correct. Python ne sait pas que chaque ligne correspond à un sous-périmètre différent.

### Ce qu'il ne faut PAS faire
- Ne pas ajouter `attente évier ≡ évier` dans `equivalences_fluides.py` → masquerait un vrai écart si les types de logements sont inversés

### Traitement recommandé
**✗ Faux positif** dans la méthode légère (bouton 🔍 Python).
Claude peut détecter ce cas si on lui fournit les extraits des deux documents avec le contexte de sous-périmètre.

---

## CAS 2 — SECTION_X (mapping bâtiment absent)

**Code alerte :** C01 (prestation CCTP absente du DPGF)
**Bâtiment affiché :** `SECTION_1`, `SECTION_2`, etc.

### Situation
Quand `mapping_batiments` est vide, Python détecte les feuilles Excel du DPGF mais ne sait pas les associer aux sections du CCTP. Il crée des alertes C01 avec `batiment="SECTION_X"` — entités fantômes.

### Traitement recommandé
Filtré automatiquement dans l'UI (alertes SECTION_X non affichées).
Fix durable : configurer le mapping bâtiment (Étape 1 du PLAN_SYNTHESE_C.md).

---

## CAS 3 — Attentes plomberie génériques

**Code alerte :** C02 (DPGF orphelin)
**Exemple :** `Attente lave-linge`, `Attente lave-vaisselle`, `Point d'eau extérieur`

### Situation
Le CCTP décrit les attentes plomberie de façon globale (`"réseau EF/EC avec attentes pour appareils"`) sans lister chaque appareil. Le DPGF les détaille ligne par ligne.

### Ce que Python fait
Extrait le type depuis chaque ligne DPGF (`lave-linge`, `lave-vaisselle`...) → ne trouve pas ce type nommément dans le CCTP → C02.

### Traitement recommandé
**✗ Faux positif**. À terme : enrichir `est_ligne_exclue()` pour filtrer les lignes commençant par `"Attente"` si le CCTP couvre les attentes globalement.

---

## Tableau de référence rapide

| Libellé DPGF | Alerte Python | Verdict | Raison |
|---|---|---|---|
| `Attente évier` (logement accession) | C02/C03 | ✗ Faux positif | Mix typologies, DPGF correct |
| `Évier` (logement social) | C02/C03 | ✗ Faux positif | Mix typologies, DPGF correct |
| `SECTION_X` (batiment fantôme) | C01 | ✗ Faux positif | Mapping absent |
| `Attente lave-linge` | C02 | ✗ Faux positif | CCTP global, DPGF détaillé |
| `PAC air/eau` vs `Pompe à chaleur aérothermique` | C03 | ✗ Faux positif | Équivalence sémantique (gérée par equivalences_fluides.py) |
