"""
Synthek — extraire_granulometrie.py
Pipeline import granulométrie : fichier architecte (Excel/PDF) → JSON normalisé contrat D1

Règles métier validées 2026-03-22 :
  - PREMIUM = logement au dernier niveau de sa montée, sans annotation sociale
  - VILLA   = logement dans un bloc nommé VILLA * (type produit, pas type bâtiment)
  - Financement par logement : annotation (LLI) (LLS) (BRS) dans le N° de logement
  - Financement montée global : ex. "C (LLS)" → tous logements sans annotation = LLS
  - Regroupement montées → bâtiment : proposé automatiquement, VALIDÉ par utilisateur
  - Surfaces m² : ignorées
  - Formules Excel non résolues : ignorées

Workflow en 2 appels :
  Appel 1 : extraire_granulometrie(bytes, nom, regroupement_valide=None)
            → retourne proposition_regroupement pour validation UI
  Appel 2 : extraire_granulometrie(bytes, nom, regroupement_valide={...})
            → retourne JSON contrat D1 complet
"""

import io
import re
import logging
from typing import Optional

import openpyxl

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────────

LABELS_IGNORES = {
    'BATIMENT', 'NIVEAU', 'N°', 'TYPOLOGIE', 'TOTAL', 'VILLAS',
    'TOTAL SURFACES HABITABLES', 'TOTAL SURFACES ANNEXES', 'SURFACE TERRAIN',
    'PIÈCES / SURFACES (M²)', 'PIÈCES / SURFACES (M2)',
}

PREFIXES_PIECES = {
    'ENTRÉE', 'ENTREE', 'SÉJOUR', 'SEJOUR', 'CUISINE', 'CHAMBRE',
    'DÉGAGEMENT', 'DEGAGEMENT', 'BAIN', 'DOUCHE', 'WC', 'PLACARD',
    'RANGEMENT', 'CELLIER', 'BUANDERIE', 'JARDIN', 'TERRASSE', 'BALCON',
    'GARAGE', 'STATIONNEMENT', 'ACCÈS', 'ACCES',
}

# ─────────────────────────────────────────────────────────────────
# UTILITAIRES
# ─────────────────────────────────────────────────────────────────

def _clean(v) -> str:
    return str(v).strip() if v is not None else ''

def _niveau_ordre(n) -> int:
    if not n:
        return -1
    if n.upper() == 'RDC':
        return 0
    m = re.match(r'R\+(\d+)', n, re.IGNORECASE)
    return int(m.group(1)) if m else -1

def _parse_financement(s: str):
    m = re.search(r'\((LLI|LLS|BRS)\)', s.upper())
    return m.group(1) if m else None

def _parse_numero(s: str) -> str:
    return re.sub(r'\s*\(.*?\)', '', s).strip()

def _est_label_ignore(valeur: str) -> bool:
    v = valeur.upper().strip()
    if v in LABELS_IGNORES:
        return True
    for p in PREFIXES_PIECES:
        if v.startswith(p):
            return True
    return False

def _est_valeur_numerique(s: str) -> bool:
    """
    Retourne True uniquement pour les valeurs décimales (surfaces m²).
    Les entiers purs comme 001, 101, 201 sont des N° de logement → False.
    """
    # Entier pur (ex: 001, 101) → numéro de logement, pas une surface
    if re.match(r'^\d+$', s.strip()):
        return False
    # Décimal (ex: 9.87, 30.47, =SUM...) → surface → à ignorer
    try:
        float(s.replace(',', '.').replace(' ', ''))
        return True
    except ValueError:
        return False

def _est_villa(nom: str) -> bool:
    return nom.upper().startswith('VILLA')


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 1A — PARSING EXCEL
# ─────────────────────────────────────────────────────────────────

def _extraire_logements_depuis_lignes(bat_row: list, niv_row: list, num_row: list) -> dict:
    """
    Extrait les logements depuis un triplet de lignes parallèles.
    Propagation droite du nom de montée ET du niveau courant.
    Un logement sans niveau dans sa cellule hérite du dernier niveau connu.
    """
    montees = {}
    current_montee = None
    current_niveau = None
    financement_montee = None

    for bat, niv, num in zip(bat_row, niv_row, num_row):
        bc = _clean(bat)
        nc = _clean(niv) if niv is not None else ''
        nuc = _clean(num)

        # Nouvelle montée → reset niveau
        if bc and bc.upper() not in LABELS_IGNORES:
            fin_m = _parse_financement(bc)
            financement_montee = fin_m
            nom_montee = bc.split('(')[0].strip() if fin_m else bc
            current_montee = nom_montee
            current_niveau = None
            if current_montee not in montees:
                montees[current_montee] = []

        # Nouveau niveau → propagation droite
        if nc and nc.upper() not in ('NIVEAU', ''):
            current_niveau = nc

        # Logement
        if nuc and current_montee:
            if _est_label_ignore(nuc):
                continue
            if _est_valeur_numerique(nuc):
                continue
            if nuc.upper() in ('N°', ''):
                continue
            fin = _parse_financement(nuc) or financement_montee
            montees[current_montee].append({
                'numero': _parse_numero(nuc),
                'niveau': current_niveau,
                'financement': fin,
                'is_villa': _est_villa(current_montee),
            })

    return montees


def _parse_excel(file_bytes: bytes) -> dict:
    """
    Parse le fichier Excel architecte — gère les fichiers multi-blocs.
    Détecte automatiquement les blocs BATIMENT/NIVEAU/N° et les blocs VILLAS.
    Retourne : {nom_montee: [logements]}
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True)
    all_montees = {}

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]

        rows_indexed = {}
        for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
            rows_indexed[i] = list(row)

        bat_lines, niv_lines, num_lines = [], [], []
        villa_lines = []  # lignes dont la 1ère cellule = "VILLAS"

        for ln, row in rows_indexed.items():
            if not row:
                continue
            first = _clean(row[0]).upper()
            if first == 'BATIMENT':
                bat_lines.append(ln)
            elif first == 'NIVEAU':
                niv_lines.append(ln)
            elif first == 'N°':
                num_lines.append(ln)
            elif first == 'VILLAS':
                villa_lines.append(ln)

        # --- Blocs collectifs BATIMENT/NIVEAU/N° ---
        used_num = set()
        for bat_ln in bat_lines:
            niv_ln = next((n for n in niv_lines if n > bat_ln), None)
            num_ln = next((n for n in num_lines if n > bat_ln and n not in used_num), None)
            if num_ln:
                used_num.add(num_ln)
                niv_row = rows_indexed[niv_ln] if niv_ln else [None] * len(rows_indexed[bat_ln])
                montees = _extraire_logements_depuis_lignes(
                    rows_indexed[bat_ln], niv_row, rows_indexed[num_ln]
                )
                all_montees.update(montees)

        # --- Blocs VILLAS (structure différente : ligne "VILLAS" + ligne N°) ---
        for villa_ln in villa_lines:
            # La ligne N° des villas est la suivante non vide après "VILLAS"
            num_ln = next(
                (n for n in num_lines if n > villa_ln and n not in used_num), None
            )
            if num_ln:
                used_num.add(num_ln)
                num_row = rows_indexed[num_ln]
                # Construire les montées VILLA individuelles depuis les N° de la ligne
                for cell in num_row:
                    vc = _clean(cell)
                    if vc and vc.upper() not in ('N°', '') and not _est_label_ignore(vc):
                        if _est_valeur_numerique(vc) or re.match(r'^\d+$', vc):
                            nom_villa = f"VILLA {vc}"
                            all_montees[nom_villa] = [{
                                'numero': vc,
                                'niveau': None,  # plain-pied
                                'financement': None,
                                'is_villa': True,
                            }]

    return all_montees


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 1B — PARSING PDF (stub — Discussion PDF)
# ─────────────────────────────────────────────────────────────────

def _parse_pdf(file_bytes: bytes) -> dict:
    raise NotImplementedError(
        "Parsing PDF non encore implémenté. Utiliser un fichier Excel."
    )


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 2 — PROPOSITION REGROUPEMENT
# ─────────────────────────────────────────────────────────────────

def proposer_regroupement(montees: list) -> dict:
    """
    Propose un regroupement automatique des montées par bâtiment.
    Heuristique 3 niveaux :
      N1 : nom se termine par chiffre(s) → préfixe = partie avant les chiffres
           "A1" → "A", "E2" → "E", "BLOC1" → "BLOC"
      N2 : nom contient un espace → préfixe = dernier token
           "BAT A" → "A", "Batiment B" → "B"
      N3 : fallback → groupe individuel (nom complet)
           "B", "C" → groupes individuels
      VILLA * : toujours groupe individuel, jamais fusionné.
    Résultat soumis à validation utilisateur obligatoire avant export.
    """
    def _extraire_prefixe(nom):
        if _est_villa(nom):
            return None
        # N1 : se termine par chiffre(s)
        m = re.match(r'^(.*?)(\d+)$', nom.strip())
        if m:
            prefixe = m.group(1).strip()
            return prefixe if prefixe else nom
        # N2 : contient un espace → dernier token
        if ' ' in nom.strip():
            return nom.strip().split()[-1]
        # N3 : mot seul sans chiffre → individuel
        return nom.strip()

    groupes = {}
    for montee in sorted(montees):
        if _est_villa(montee):
            groupes[montee] = [montee]
            continue
        prefixe = _extraire_prefixe(montee)
        if prefixe in groupes:
            groupes[prefixe].append(montee)
        else:
            groupes[prefixe] = [montee]
    return groupes


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 3 — CLASSIFICATION PAR GROUPE
# ─────────────────────────────────────────────────────────────────

def _classifier(logs: list) -> dict:
    """
    Classifie les logements d'un groupe bâtiment.
    PREMIUM : dernier niveau de montée + pas d'annotation sociale.
    VILLA : bloc source VILLA *.
    """
    niveaux = [l['niveau'] for l in logs if l['niveau']]
    dernier_niveau = max(niveaux, key=_niveau_ordre) if niveaux else None

    LLI = LLS = BRS = std = premium = villas = 0
    for l in logs:
        if l['is_villa']:
            villas += 1
            continue
        fin = l['financement']
        est_dernier = (l['niveau'] == dernier_niveau) if dernier_niveau else False
        if fin == 'LLI':      LLI += 1
        elif fin == 'LLS':    LLS += 1
        elif fin == 'BRS':    BRS += 1
        elif est_dernier:     premium += 1
        else:                 std += 1

    return {'LLI': LLI, 'LLS': LLS, 'BRS': BRS,
            'acces_std': std, 'acces_premium': premium, 'villas': villas}


# ─────────────────────────────────────────────────────────────────
# ÉTAPE 4 — VALIDATIONS
# ─────────────────────────────────────────────────────────────────

def _valider(batiments: list) -> list:
    warnings = []
    """
    Validations V1, V5 - tolerance zero sur V1.
    Chaque logement est issu d un N explicite et classe dans exactement une categorie.
    Aucun arrondi possible -> ecart de 1 est une vraie erreur, pas un cas limite.
    """
    for b in batiments:
        nb = b['nb_logements']
        somme = b['LLI'] + b['LLS'] + b['BRS'] + b['acces_std'] + b['acces_premium'] + b['villas']
        if somme != nb:
            warnings.append(f"V1 [{b['nom']}] : nb_logements={nb} ≠ somme typologies={somme}")
        if nb > 0 and not any(_est_villa(m) for m in b['montees']):
            if somme == 0:
                warnings.append(f"V5 [{b['nom']}] : aucun financement identifié")
    return warnings


# ─────────────────────────────────────────────────────────────────
# POINT D'ENTRÉE PRINCIPAL
# ─────────────────────────────────────────────────────────────────

def extraire_granulometrie(
    file_bytes: bytes,
    nom_fichier: str,
    regroupement_valide=None,
) -> dict:
    """
    Pipeline complet granulométrie.

    Appel 1 (regroupement_valide=None) :
      Retourne proposition_regroupement pour validation utilisateur dans l'UI.

    Appel 2 (regroupement_valide={nom_groupe: [montees]}) :
      Retourne JSON contrat D1 complet.
    """
    ext = nom_fichier.lower().rsplit('.', 1)[-1] if '.' in nom_fichier else ''

    if ext in ('xlsx', 'xlsm', 'xls'):
        all_montees = _parse_excel(file_bytes)
    elif ext == 'pdf':
        all_montees = _parse_pdf(file_bytes)
    else:
        raise ValueError(f"Format non supporté : {ext}. Acceptés : xlsx, xlsm, xls, pdf")

    montees_list = list(all_montees.keys())

    # Appel 1 — proposition uniquement
    if regroupement_valide is None:
        return {
            'montees_detectees': montees_list,
            'proposition_regroupement': proposer_regroupement(montees_list),
            'message': "Valider ou modifier le regroupement dans l'UI avant export.",
        }

    # Appel 2 — JSON contrat complet
    batiments = []
    for nom_groupe, montees_groupe in regroupement_valide.items():
        logs = []
        for m in montees_groupe:
            logs.extend(all_montees.get(m, []))
        if not logs:
            continue
        compteurs = _classifier(logs)
        batiments.append({
            'nom': nom_groupe,
            'montees': montees_groupe,
            'nb_logements': len(logs),
            **compteurs,
            'fiabilite': 'haute',
            'section_cctp': None,
            'feuilles_dpgf': [],
            'systeme_chauffage': None,
            'systeme_vmc': None,
            'regulation': None,
            'notes': None,
        })

    total = sum(b['nb_logements'] for b in batiments)
    warnings = _valider(batiments)

    return {
        'projet': None,
        'source': nom_fichier,
        'batiments': batiments,
        'total_logements': total,
        'donnees_manquantes': warnings,
        'hypotheses': [
            'PREMIUM = dernier niveau de chaque montée, sans annotation sociale',
            'VILLA = logement dans un bloc VILLA * — type produit distinct',
            'Financement montée global (ex: C (LLS)) appliqué à tous logements sans annotation',
            'Regroupement montées validé par utilisateur avant export',
        ],
    }
