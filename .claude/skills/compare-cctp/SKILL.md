---
name: compare-cctp
description: Expert en comparaison documentaire CCTP/DPGF vs Programme pour Synthek. Déclenche quand l'utilisateur parle de comparaison, d'alertes, d'écarts entre documents, de relancer une analyse, ou de debug comparerDocuments.js.
---

Tu es l'expert de la fonctionnalité de comparaison documentaire de Synthek. Voici tout ce que tu dois savoir.

## Ce que fait la comparaison

`comparerAvecReference()` dans `backend/src/services/comparerDocuments.js` :

1. **Analyse JS** — tokenise les textes, détecte les termes manquants et exigences non couvertes
2. **Si écarts détectés** → appel IA (Haiku ou Sonnet) avec le contexte projet
3. **Crée des alertes** en BDD (table `Alerte`) liées aux documents concernés

### Route API
```
POST /documents/:id/comparer
Body: { modeleIA: 'haiku'|'sonnet', modeVerification: 'technique'|'chiffrage', comparaisonAvec: 'programme'|'cctp'|'les_deux', idsRef: [id1, id2] }
```
La réponse est immédiate (`{ message: 'Comparaison lancée' }`) — la comparaison tourne en **background**.

## Paramètres clés

| Paramètre | Valeurs | Défaut | Notes |
|-----------|---------|--------|-------|
| `modeleIA` | `sonnet` |
| `modeVerification` | `technique` / `chiffrage` | `technique` | Chiffrage = vérification quantités uniquement |
| `comparaisonAvec` | `programme` / `cctp` / `les_deux` | `programme` | DPGF peut être comparé aussi vs CCTP |
| `idsRef` | tableau d'IDs | null | Sélection manuelle de docs de référence |
| `sousProgrammeId` | integer | null | Filtre par périmètre (Villas, Bâtiments AB…) |

## Traitement selon le type de document

- **CCTP court (< 20 000 chars)** → 1 seule section, 1 appel IA
- **CCTP long (> 20 000 chars)** → chunking 6 000 chars / overlap 500 → 1 appel IA par chunk
- **DPGF multi-feuilles** → `splitParFeuilles()` détecte les séparateurs `=== Feuille: NOM ===` → 1 appel IA par feuille Excel

## Labels d'alertes

Format : `[TYPE — Groupe]`
- CCTP : `[CCTP vs Programme — NomSousProgramme]`
- DPGF technique : `[DPGF vs Programme — NomFeuille]`
- DPGF chiffrage : `[DPGF vs Programme — Chiffrage — NomSousProgramme]`

Avant chaque comparaison, les anciennes alertes du même label sont **supprimées**.

## Statuts d'alertes disponibles

- `ÉCART_MATÉRIAU` — matériau différent de ce qui est prescrit
- `EXIGENCE_MANQUANTE` — exigence du programme non couverte
- `INCOHÉRENCE_TECHNIQUE` — contradiction entre deux documents
- `INCERTAIN_DESIGNATION` — désignation imprécise (seulement si critique sécurité)
- `SOUS_DIMENSIONNEMENT` — valeur inférieure au minimum prescrit

Criticité : `CRITIQUE` / `MAJEUR` / `MINEUR`

## Agents spécialisés par lot

`lotDetector.js` détecte le lot (CVC, plomberie, menuiseries…) depuis le nom de fichier.
`chargerAgent(lot)` injecte des règles métier spécifiques dans le prompt IA.

## Fichiers clés

- `backend/src/services/comparerDocuments.js` — logique principale
- `backend/src/services/lotDetector.js` — détection et agents par lot
- `backend/src/routes/documents.js` — route POST `/:id/comparer`
- `frontend/src/pages/Projet.jsx` — modal "Relancer comparaison" (switch Haiku/Sonnet, checkboxes sous-programmes)

## Débogage fréquent

**Aucune alerte créée**
→ Vérifier que l'analyse JS détecte des écarts (`termesManquants.length > 3` ou `exigencesNonCouvertes.length > 0`)
→ Vérifier que des documents de catégorie `programme` existent dans le projet avec `contenuTexte` non null

**Trop de faux positifs**
→ Passer en mode Sonnet
→ Vérifier les dictionnaires d'équivalences dans `SYSTEM_PROMPT_BET_FLUIDES`

**DPGF non traité par feuilles**
→ Vérifier que l'extracteur Python génère bien les séparateurs `=== Feuille: NOM ===`

**Rate limit Anthropic**
→ Pause de 2s entre sections déjà en place. Si insuffisant, augmenter le délai dans la boucle `for` de `comparerAvecReference()`

## Règles à respecter

- Maximum **8 alertes par section** — priorisées par gravité
- Les synonymes métier (ex: "PAC air/eau" = "pompe à chaleur aérothermique") ne doivent **jamais** créer d'alerte
- "Sans objet", "N/A" dans un DPGF → **jamais** d'alerte pour ce poste
- Les chapitres "Généralités" ou "Prescriptions générales" → **jamais** d'alerte
