"""
MOE.AI — Dictionnaire de normalisation terminologique
Lot CVC / Plomberie Sanitaire — Synthèse C : CCTP ↔ DPGF
Version 2.0 — mars 2026
Auteur : Fabien / Climat Ingénierie Conseil

Changelog V2 :
 - FIX B05 : suppression match partiel bidirectionnel dans forme_canonique()
 - AJOUT : 15 familles manquantes (ballon ECS, circulateur, bâti-support, calorifuge…)
 - AJOUT : 20 marques supplémentaires
 - AJOUT : extracteurs numériques (puissance kW, diamètre DN, épaisseur mm)
 - AJOUT : NON_EQUIVALENCES explicites (paires à toujours alerter)
 - AJOUT : fonction extraire_puissance(), extraire_diametre(), comparer_puissances()
 - AJOUT : fonction est_designation_incertaine() pour R5
 - FIX : normaliser() gère mieux les caractères unicode courants BTP
"""

import re
import unicodedata
from typing import Optional

# ============================================================
# 1. DICTIONNAIRE D'ÉQUIVALENCES TERMINOLOGIQUES
# ============================================================

EQUIVALENCES = {
    # --- APPAREILS SANITAIRES ---
    "wc suspendu": [
        "wc suspendu", "wc suspendue", "toilettes suspendues",
        "cuvette suspendue", "cuvette wc suspendue",
        "bloc wc suspendu", "pack wc suspendu",
    ],
    "wc au sol": [
        "wc au sol", "wc à poser", "wc poser",
        "cuvette au sol", "wc anglais", "wc à l'anglaise",
    ],
    "lavabo": [
        "lavabo", "lave-mains", "lave mains",
        "vasque", "vasque simple", "vasque à poser",
        "meuble vasque", "plan vasque",
    ],
    "douche": [
        "douche", "douche à l'italienne", "douche italienne",
        "receveur de douche", "bac à douche",
        "douche encastrée", "douche pmr",
    ],
    "baignoire": [
        "baignoire", "baignoire à poser", "baignoire encastrée",
        "baignoire îlot",
    ],
    "evier": [
        "évier", "evier", "meuble évier", "évier inox",
        "évier 1 cuve", "évier 2 cuves", "évier double bac",
    ],
    "bati support": [
        "bâti-support", "bâti support", "bati support",
        "châssis support", "châssis wc", "geberit duofix",
        "support wc suspendu", "bâti-support autoportant",
    ],
    "robinetterie lavabo": [
        "robinet lavabo", "mitigeur lavabo", "mitigeur monocommande lavabo",
        "robinetterie lavabo", "mitigeur vasque",
    ],
    "robinetterie douche": [
        "mitigeur douche", "mitigeur thermostatique douche",
        "colonne de douche", "ensemble douche", "douchette",
        "robinetterie douche",
    ],
    "robinetterie baignoire": [
        "mitigeur baignoire", "mitigeur thermostatique baignoire",
        "robinetterie baignoire", "ensemble bain douche",
    ],
    "paroi douche": [
        "paroi de douche", "paroi douche", "pare-douche",
        "paroi fixe douche", "paroi pivotante",
    ],

    # --- PRODUCTION DE CHALEUR ---
    "chaudiere condensation gaz": [
        "chaudière condensation gaz", "chaudière gaz condensation",
        "chaudière murale gaz condensation", "chaudière murale condensation",
        "chaudière à condensation", "chaudière gaz à condensation",
        "chaudière condensante", "chaudière haute performance",
    ],
    "chaudiere basse temperature": [
        "chaudière basse température", "chaudière bt",
        "chaudière murale basse température",
    ],
    "pac air eau": [
        "pac air/eau", "pac air eau", "pompe à chaleur air/eau",
        "pompe à chaleur air eau", "pompe de chaleur air/eau",
        "pac air/eau split", "pac split inverter", "pac air/eau split inverter",
        "unité extérieure pac", "pac atlantic", "pac alféa", "alfea extensa",
        "atlantic synea", "synea", "extensa duo",
        "pompe à chaleur aérothermique",
    ],
    "pac air air": [
        "pac air/air", "pac air air", "pompe à chaleur air/air",
        "climatisation réversible", "split mural",
    ],
    "chauffe eau thermodynamique": [
        "chauffe-eau thermodynamique", "cet", "ballon thermodynamique",
        "chauffe eau thermodynamique", "ecs thermodynamique",
    ],

    # --- ECS ---
    "ballon ecs": [
        "ballon ecs", "ballon eau chaude sanitaire", "préparateur ecs",
        "préparateur eau chaude", "ballon de stockage ecs",
        "chauffe-eau", "chauffe eau", "cumulus",
        "ballon tampon ecs", "accumulateur ecs",
    ],
    "groupe securite": [
        "groupe de sécurité", "groupe securite", "gs",
        "soupape + réducteur", "kit sécurité ballon",
    ],
    "mitigeur thermostatique collectif": [
        "mitigeur thermostatique collectif",
        "mitigeur thermostatique point de puisage",
        "mitigeur anti-brûlure", "limiteur thermostatique",
    ],

    # --- ÉMETTEURS ---
    "radiateur acier": [
        "radiateur acier", "radiateur en acier", "radiateur panneau acier",
        "radiateur à panneaux", "radiateur chauffage central",
        "reggane", "reggane 3010", "finimetal reggane",
    ],
    "seche serviette": [
        "sèche-serviette", "sèche serviette", "seche serviette",
        "radiateur sèche-serviette", "radiateur salle de bains",
        "tahiti", "finimetal tahiti",
    ],
    "plancher chauffant": [
        "plancher chauffant", "plancher chauffant basse température",
        "plancher chauffant bt", "pcbt", "plancher rayonnant",
        "chauffage par le sol", "tube plancher chauffant",
        "rautherm", "rehau rautherm", "pex bao",
    ],
    "ventilo convecteur": [
        "ventilo-convecteur", "ventilo convecteur", "ventiloconvecteur",
        "fan-coil", "fancoil",
    ],

    # --- VMC / VENTILATION ---
    "vmc hygro b": [
        "vmc hygroréglable type b", "vmc hygro b", "vmc hygrob",
        "vmc hygroréglable b", "ventilation hygroréglable type b",
        "hygrocosy", "atlantic hygrocosy", "bc flex",
    ],
    "vmc hygro a": [
        "vmc hygroréglable type a", "vmc hygro a", "vmc hygroa",
        "ventilation hygroréglable type a",
    ],
    "vmc double flux": [
        "vmc double flux", "ventilation double flux",
        "centrale double flux", "cdf",
    ],
    "vmc simple flux": [
        "vmc simple flux", "ventilation simple flux",
        "extraction simple flux",
    ],
    "bouche extraction hygro": [
        "bouche d'extraction hygroréglable", "bouche hygro",
        "bouche extraction hygroréglable", "bouche hygroréglable",
        "bouche vmc hygro",
    ],
    "entree air hygro": [
        "entrée d'air hygroréglable", "entrée air hygro",
        "ea hygroréglable", "ea hygro", "eah",
        "entrée d'air hygroréglable type eh",
    ],
    "caisson extraction": [
        "caisson d'extraction", "caisson extraction", "groupe d'extraction",
        "groupe extraction", "extracteur", "ventilateur d'extraction",
        "comete", "atlantic comete", "groupe vmc",
    ],
    "desenfumage naturel": [
        "désenfumage naturel", "exutoire de désenfumage",
        "ouvrant de désenfumage", "lanterneau désenfumage",
    ],
    "desenfumage mecanique": [
        "désenfumage mécanique", "ventilateur désenfumage",
        "extracteur désenfumage", "volet coupe-feu",
    ],

    # --- DISTRIBUTION / RÉSEAUX ---
    "tube multicouche": [
        "tube multicouche", "tuyau multicouche", "canalisation multicouche",
        "multicouche", "tube pex al pex", "pex-al-pex",
    ],
    "tube per": [
        "tube per", "tube pex", "tube polyéthylène réticulé",
        "per sous fourreau", "pex bao", "per bao",
        "tuyau per", "hydrocâblé per", "hydrocâblé",
    ],
    "tube pehd": [
        "tube pehd", "pehd", "polyéthylène haute densité",
        "pehd bande bleue", "tube pe",
    ],
    "tube pvc eu": [
        "tube pvc", "pvc nf m1", "tube pvc nf m1",
        "evacuation pvc", "canalisation pvc",
        "chute pvc", "collecteur pvc",
    ],
    "tube acier gaz": [
        "tube acier noir", "acier noir nfa 49-140", "tube acier nfa",
        "tube acier gaz", "acier noir soudé",
    ],
    "tube cuivre": [
        "tube cuivre", "tuyau cuivre", "cuivre recuit",
        "tube cuivre écroui", "cuivre écroui", "cuivre recuit sous fourreau",
    ],
    "gaine souple vmc": [
        "gaine souple", "conduit souple", "gaine flexible",
        "flexible vmc", "conduit souple pvc isolé",
    ],
    "conduit acier galvanise": [
        "conduit acier galvanisé", "gaine acier galvanisé",
        "conduit galvanisé", "acier galvanisé", "tôle galvanisée",
    ],

    # --- CALORIFUGEAGE ---
    "calorifuge laine de verre": [
        "calorifuge laine de verre", "coquille laine de verre",
        "isolation laine de verre", "calorifuge ldv",
        "coquille ldv", "isover",
    ],
    "calorifuge mousse": [
        "calorifuge mousse", "mousse élastomère", "armaflex",
        "k-flex", "calorifuge mousse pu", "isolant mousse",
    ],

    # --- ORGANES HYDRAULIQUES ---
    "circulateur": [
        "circulateur", "pompe de circulation", "accélérateur",
        "circulateur chauffage", "circulateur ecs",
        "wilo", "grundfos", "salmson",
        "wilo yonos", "grundfos alpha",
    ],
    "nourrice laiton": [
        "nourrice laiton", "nourrice de distribution laiton",
        "nourrice préfabriquée laiton", "collecteur laiton",
        "nourrice distribution préfabriquée",
    ],
    "vanne arret": [
        "vanne d'arrêt", "robinet d'arrêt", "vanne arrêt",
        "vanne 1/4 tour", "vanne quart de tour",
        "robinet de coupure", "vanne de sectionnement",
    ],
    "clapet antiretour": [
        "clapet anti-retour", "clapet antiretour", "clapet ea",
        "anti-retour", "clapet type ea",
    ],
    "disconnecteur": [
        "disconnecteur", "disconnecteur ba", "disconnecteur type ba",
        "protection anti-retour ba", "ensemble de protection ba",
    ],
    "detendeur": [
        "détendeur", "réducteur de pression", "détendeur nf",
        "détendeur 3 bars", "réducteur nf",
    ],
    "filtre tamis": [
        "filtre à tamis", "filtre tamis", "filtre anti-impuretés",
        "filtre débris", "filtre + robinet de purge",
    ],
    "anti belier": [
        "anti-coup de bélier", "anti bélier", "antibélier",
        "pot anti-bélier", "anti-bélier pneumatique",
    ],
    "soupape securite": [
        "soupape de sécurité", "groupe de sécurité",
        "soupape", "clapet de sécurité",
    ],
    "vase expansion": [
        "vase d'expansion", "vase expansion",
        "vase d'expansion fermé", "vase d'expansion chauffage",
    ],
    "pot de decantation": [
        "pot de décantation", "pot à boue", "séparateur de boues",
        "filtre magnétique", "désemboueur",
    ],
    "compteur eau": [
        "compteur d'eau", "compteur eau", "compteur divisionnaire",
        "sous-compteur", "compteur eau froide", "compteur eau chaude",
    ],
    "compteur energie": [
        "compteur d'énergie", "compteur énergie",
        "compteur de calories", "calorimètre",
    ],

    # --- RÉGULATION ---
    "robinet thermostatique": [
        "robinet thermostatique", "robinet thermostatisable",
        "tête thermostatique", "rt", "robinet thermosta",
        "comap sensity", "sensity",
    ],
    "thermostat ambiance": [
        "thermostat d'ambiance", "thermostat ambiance",
        "thermostat programmable", "thermostat modulant",
        "thermostat radio", "navilink", "atlantic navilink",
        "nea smart", "nea smart 2", "rehau nea smart",
    ],
    "vanne 3 voies": [
        "vanne 3 voies", "vanne trois voies", "v3v",
        "vanne mélangeuse", "vanne de régulation",
    ],

    # --- CONDUIT FUMÉES ---
    "conduit fumes collectif": [
        "conduit collectif", "conduit concentrique collectif",
        "3cep", "3cep multi+", "poujoulat 3cep",
        "conduit inox collectif", "conduit fumées collectif",
    ],
    "ventouse": [
        "ventouse", "ventouse horizontale", "ventouse coaxiale",
        "terminal ventouse", "prise air rejet gaz",
    ],

    # --- TRAITEMENT D'EAU ---
    "adoucisseur": [
        "adoucisseur", "adoucisseur d'eau", "adoucisseur à résine",
        "traitement anti-calcaire", "traitement eau",
    ],
    "traitement anticorrosion": [
        "traitement anticorrosion", "inhibiteur de corrosion",
        "sentinel x100", "fernox", "bwt",
        "pot à injection", "traitement eau chauffage",
    ],

    # --- GAZ ---
    "collecteur gaz": [
        "collecteur gaz", "rampe gaz", "nourrice gaz",
        "tube acier gaz", "réseau gaz",
    ],
    "robinet gaz": [
        "robinet gaz", "raa", "robinet avant appareil",
        "vanne gaz", "robinet de barrage gaz",
    ],

    # --- SURPRESSION ---
    "surpresseur": [
        "surpresseur", "groupe de surpression", "pompe surpression",
        "station de surpression", "groupe hydrophore",
    ],

    # --- DÉSINFECTION / MISE EN SERVICE ---
    "desinfection reseaux": [
        "désinfection réseau", "désinfection des réseaux",
        "rinçage + désinfection", "analyse d1",
        "désinfection ef ecs", "analyse eau",
    ],
    "mise en service": [
        "mise en service", "mise en service complète",
        "réglages mise en service", "contrôles mise en service",
        "pv aqc", "attestation aqc",
    ],
    "doe": [
        "doe", "dossier des ouvrages exécutés",
        "dossier de récolement", "doe conforme au cctp",
        "plans rectifiés", "plans de récolement",
    ],
    "trappe de visite": [
        "trappe de visite", "trappe d'accès",
        "regard de visite", "trappe sanitaire",
    ],
}


# ============================================================
# 2. NON-ÉQUIVALENCES EXPLICITES — toujours alerter
# ============================================================

NON_EQUIVALENCES = [
    ("wc suspendu", "wc au sol"),
    ("chaudiere condensation gaz", "chaudiere basse temperature"),
    ("chaudiere condensation gaz", "pac air eau"),
    ("pac air eau", "chaudiere condensation gaz"),
    ("vmc double flux", "vmc simple flux"),
    ("vmc double flux", "vmc hygro b"),
    ("vmc double flux", "vmc hygro a"),
    ("plancher chauffant", "radiateur acier"),
    ("tube cuivre", "tube per"),
    ("tube cuivre", "tube multicouche"),
    ("calorifuge laine de verre", "calorifuge mousse"),
    ("desenfumage naturel", "desenfumage mecanique"),
    ("conduit acier galvanise", "gaine souple vmc"),
]


# ============================================================
# 3. SEUILS DE TOLÉRANCE NUMÉRIQUE
# ============================================================

SEUILS_TOLERANCE = {
    "puissance_kw":     {"type": "relatif", "seuil": 5, "unite": "kW", "critique": 15},
    "temperature_c":    {"type": "absolu",  "seuil": 2, "unite": "°C"},
    "diametre_dn":      {"type": "absolu",  "seuil": 0, "unite": "DN"},
    "debit_m3h":        {"type": "relatif", "seuil": 10, "unite": "m³/h"},
    "debit_l_s":        {"type": "relatif", "seuil": 10, "unite": "l/s"},
    "pression_bar":     {"type": "relatif", "seuil": 5, "unite": "bar"},
    "acoustique_db":    {"type": "absolu",  "seuil": 3, "unite": "dB(A)"},
    "epaisseur_mm":     {"type": "absolu",  "seuil": 0, "unite": "mm"},
    "cop":              {"type": "ignorer", "seuil": None},
    "scop":             {"type": "ignorer", "seuil": None},
    "rendement_pct":    {"type": "ignorer", "seuil": None},
}


# ============================================================
# 4. RÈGLES DE TOLÉRANCE
# ============================================================

REGLES_TOLERANCE = {
    "T1": "Attributs de performance (COP, SCOP, rendement) non attendus dans DPGF — pas d'alerte.",
    "T2": "Prestations incluses (pose, raccordement, mise en service) non attendues dans DPGF — pas d'alerte.",
    "T2inv": "Si CCTP précise 'fourniture seule' et DPGF inclut pose → alerte C03.",
    "T3": "Marque dans un seul doc → pas d'alerte. Alerte C04 si présente dans les deux et différente.",
    "T4": "Accessoires solidaires d'un ensemble meuble (miroir, applique, vidage) — pas d'alerte.",
    "T5": "Type commande bouche extraction (cordelette/pile/interrupteur) — alerte C04 uniquement si contradiction.",
    "T6": "Comparaison obligatoirement dans le même périmètre bâtiment (JSON config projet).",
    "T7": "Désignation DPGF forfaitaire ('conforme au CCTP', 'sans objet') — exclure du contrôle.",
    "T8": "'Ou équivalent agréé MOE' → tolérance marque si type identique.",
}


# ============================================================
# 5. MARQUES CONNUES
# ============================================================

MARQUES_CONNUES = [
    # Production chaleur / ECS
    "atlantic", "saunier duval", "elm leblanc", "vaillant", "viessmann",
    "daikin", "mitsubishi", "frisquet", "de dietrich", "chaffoteaux",
    "thermor", "bosch",
    # Émetteurs / régulation
    "finimetal", "acova", "zehnder", "irsap", "rehau",
    "comap", "danfoss", "oventrop", "imi hydronic", "caleffi",
    "giacomini",
    # Sanitaire / robinetterie
    "grohe", "hansgrohe", "porcher", "jacob delafon", "allia",
    "geberit", "villeroy", "roca", "ideal standard", "delabie",
    # Pompes / hydraulique
    "wilo", "grundfos", "salmson", "ksb",
    # Traitement eau
    "bwt", "sentinel", "fernox", "permo", "cillit",
    # Conduits / fumisterie
    "poujoulat", "ten", "tubest",
    # Gaz
    "tracpipe", "banides debeaurain",
    # VMC / ventilation
    "aldes", "atlantic", "helios", "unelvent", "soler palau", "s&p",
    # Plomberie / réseaux
    "watts", "flamco", "acome", "uponor", "wavin",
]


# ============================================================
# 6. FONCTIONS UTILITAIRES
# ============================================================

def normaliser(texte: str) -> str:
    """
    Normalise un texte pour comparaison :
    - minuscules
    - suppression accents
    - suppression ponctuation superflue
    - espaces normalisés
    """
    if not texte:
        return ""
    t = texte.lower().strip()
    t = unicodedata.normalize('NFD', t)
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    t = re.sub(r'[-–—/]', ' ', t)
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'[^\w\s]', '', t)
    return t.strip()


def _construire_index() -> dict:
    """Construit un index inversé : variante normalisée → forme canonique"""
    index = {}
    for forme_canonique_val, variantes in EQUIVALENCES.items():
        for variante in variantes:
            index[normaliser(variante)] = forme_canonique_val
    return index


_INDEX = _construire_index()


def forme_canonique(texte: str) -> Optional[str]:
    """
    Retourne la forme canonique d'un texte s'il est dans le dictionnaire.
    Retourne None si aucune correspondance exacte trouvée.

    V2 FIX B05 : plus de match partiel bidirectionnel.
    On ne cherche QUE des correspondances exactes sur le texte normalisé complet.
    """
    t_norm = normaliser(texte)
    if not t_norm:
        return None

    # Match exact
    if t_norm in _INDEX:
        return _INDEX[t_norm]

    return None


def forme_canonique_souple(texte: str) -> Optional[str]:
    """
    Recherche souple : cherche la variante la plus longue contenue dans le texte.
    Utilisé en fallback quand forme_canonique() retourne None.
    Tri par longueur décroissante pour éviter que "wc" matche avant "wc suspendu".
    """
    t_norm = normaliser(texte)
    if not t_norm:
        return None

    # Match exact d'abord
    if t_norm in _INDEX:
        return _INDEX[t_norm]

    # Recherche de la variante la plus longue contenue dans le texte
    candidats = []
    for variante_norm, canonique in _INDEX.items():
        if len(variante_norm) >= 4 and variante_norm in t_norm:
            candidats.append((len(variante_norm), canonique))

    if candidats:
        candidats.sort(key=lambda x: x[0], reverse=True)
        return candidats[0][1]

    return None


def sont_equivalents(texte_cctp: str, texte_dpgf: str) -> bool:
    """
    Retourne True si deux désignations sont techniquement équivalentes.

    V2 : utilise forme_canonique_souple() mais vérifie aussi
    les NON_EQUIVALENCES explicites.
    """
    c1 = forme_canonique_souple(texte_cctp)
    c2 = forme_canonique_souple(texte_dpgf)

    if c1 is None or c2 is None:
        return False

    # Vérifier non-équivalences explicites
    if (c1, c2) in NON_EQUIVALENCES or (c2, c1) in NON_EQUIVALENCES:
        return False

    return c1 == c2


def sont_non_equivalents(texte_cctp: str, texte_dpgf: str) -> Optional[str]:
    """
    Retourne le motif de non-équivalence si les deux textes sont
    dans la liste des paires à toujours alerter.
    Retourne None sinon.
    """
    c1 = forme_canonique_souple(texte_cctp)
    c2 = forme_canonique_souple(texte_dpgf)

    if c1 is None or c2 is None:
        return None

    for a, b in NON_EQUIVALENCES:
        if (c1 == a and c2 == b) or (c1 == b and c2 == a):
            return f"Non-équivalence explicite : {a} ≠ {b}"

    return None


# ============================================================
# 7. EXTRACTION DE MARQUE
# ============================================================

def extraire_marque(texte: str) -> Optional[str]:
    """Extrait la marque commerciale d'une désignation si présente."""
    t = texte.lower()
    for marque in MARQUES_CONNUES:
        if marque in t:
            return marque
    return None


def comparer_marques(texte_cctp: str, texte_dpgf: str) -> dict:
    """
    Compare les marques dans les deux textes.
    Règle T3 + T8.
    """
    marque_cctp = extraire_marque(texte_cctp)
    marque_dpgf = extraire_marque(texte_dpgf)

    # T8 : "ou équivalent agréé MOE"
    ou_equiv = "ou equivalent" in normaliser(texte_cctp) or "ou equivalant" in normaliser(texte_cctp)

    if marque_cctp and marque_dpgf:
        if marque_cctp == marque_dpgf:
            return {"alerte": None, "detail": f"Marque identique : {marque_cctp}"}
        elif ou_equiv:
            return {"alerte": None, "detail": f"T8 — 'ou équivalent' : {marque_cctp} → {marque_dpgf} toléré"}
        else:
            return {
                "alerte": "C04",
                "detail": f"Marque CCTP : {marque_cctp} / Marque DPGF : {marque_dpgf}"
            }
    elif marque_cctp and not marque_dpgf:
        return {"alerte": None, "detail": f"Marque CCTP seule ({marque_cctp}) — tolérance T3"}
    elif not marque_cctp and marque_dpgf:
        return {"alerte": None, "detail": f"Marque DPGF seule ({marque_dpgf}) — tolérance T3"}
    else:
        return {"alerte": None, "detail": "Aucune marque identifiée"}


# ============================================================
# 8. EXTRACTEURS NUMÉRIQUES
# ============================================================

def extraire_puissance(texte: str) -> Optional[float]:
    """Extrait la puissance en kW d'un texte. Ex: '31 kW' → 31.0"""
    match = re.search(r'(\d+(?:[.,]\d+)?)\s*kw', texte.lower())
    if match:
        return float(match.group(1).replace(',', '.'))
    return None


def extraire_diametre(texte: str) -> Optional[int]:
    """Extrait le diamètre DN d'un texte. Ex: 'DN20' → 20"""
    match = re.search(r'dn\s*(\d+)', texte.lower())
    if match:
        return int(match.group(1))
    # Fallback : diamètre en mm
    match = re.search(r'(\d+)\s*mm', texte.lower())
    if match:
        val = int(match.group(1))
        if val in (12, 14, 16, 20, 25, 26, 32, 40, 50, 63, 75, 100, 125, 150, 200):
            return val
    return None


def extraire_epaisseur(texte: str) -> Optional[int]:
    """Extrait l'épaisseur d'isolant en mm. Ex: '50mm LdV' → 50"""
    match = re.search(r'(\d+)\s*mm', texte.lower())
    if match:
        val = int(match.group(1))
        if val in (9, 13, 19, 25, 30, 40, 50, 60, 80, 100):
            return val
    return None


def comparer_puissances(texte_cctp: str, texte_dpgf: str) -> Optional[dict]:
    """
    Compare les puissances extraites des deux textes.
    Retourne un dict avec le résultat ou None si pas de puissance trouvée.

    Règle R4 :
    - δ ≤ 5% → CONFORME
    - 5% < δ ≤ 15% → ÉCART (MAJEUR)
    - δ > 15% → CRITIQUE
    """
    p_cctp = extraire_puissance(texte_cctp)
    p_dpgf = extraire_puissance(texte_dpgf)

    if p_cctp is None or p_dpgf is None:
        return None

    if p_cctp == 0:
        return None

    delta_pct = abs(p_dpgf - p_cctp) / p_cctp * 100

    if delta_pct <= 5:
        return {"alerte": None, "detail": f"Puissance conforme : {p_cctp} kW vs {p_dpgf} kW (δ {delta_pct:.1f}%)"}
    elif delta_pct <= 15:
        return {
            "alerte": "C03",
            "criticite": "MAJEUR",
            "detail": f"Écart puissance : CCTP {p_cctp} kW / DPGF {p_dpgf} kW (δ {delta_pct:.1f}%)"
        }
    else:
        return {
            "alerte": "C03",
            "criticite": "CRITIQUE",
            "detail": f"Écart puissance CRITIQUE : CCTP {p_cctp} kW / DPGF {p_dpgf} kW (δ {delta_pct:.1f}%)"
        }


def comparer_diametres(texte_cctp: str, texte_dpgf: str) -> Optional[dict]:
    """Compare les diamètres DN extraits des deux textes."""
    d_cctp = extraire_diametre(texte_cctp)
    d_dpgf = extraire_diametre(texte_dpgf)

    if d_cctp is None or d_dpgf is None:
        return None

    if d_cctp == d_dpgf:
        return {"alerte": None, "detail": f"Diamètre conforme : DN{d_cctp}"}
    else:
        return {
            "alerte": "C03",
            "criticite": "MAJEUR",
            "detail": f"Écart diamètre : CCTP DN{d_cctp} / DPGF DN{d_dpgf}"
        }


# ============================================================
# 9. DÉTECTION DÉSIGNATION INCERTAINE (R5)
# ============================================================

POSTES_CRITIQUES = [
    "pac", "pompe a chaleur", "chaudiere", "chaudière",
    "vmc", "ventilation", "plancher chauffant",
    "ballon", "preparateur", "chauffe-eau",
]

DESIGNATIONS_INCERTAINES = [
    "conforme au cctp", "conforme cctp", "selon cctp",
    "suivant cctp", "identique cctp",
]


def est_designation_incertaine(texte_dpgf: str) -> Optional[str]:
    """
    Détecte si une désignation DPGF est de type 'conforme au CCTP'
    sur un poste critique. Règle R5.
    Retourne le motif si incertain, None sinon.
    """
    t = normaliser(texte_dpgf)

    for di in DESIGNATIONS_INCERTAINES:
        if normaliser(di) in t:
            # Vérifier si c'est un poste critique
            for pc in POSTES_CRITIQUES:
                if normaliser(pc) in t:
                    return f"R5 — '{texte_dpgf}' sur poste critique ({pc}) → INCERTAIN"
            return None  # Pas un poste critique → tolérance T7
    return None


# ============================================================
# 10. EXCLUSIONS DPGF — Lignes génériques à ignorer
# ============================================================

EXCLUSIONS_DPGF = [
    "installation de chantier", "repli de chantier", "base vie",
    "cloture de chantier", "signaletique chantier",
    "fournitures diverses", "materiaux divers", "petites fournitures",
    "quincaillerie diverse", "consommables",
    "nettoyage", "nettoyage en fin de chantier", "evacuation dechets", "tri selectif",
    "documents a fournir", "doe", "diuo", "plans de recolement",
    "notice de fonctionnement", "dossier technique",
    "prestation conforme au cctp", "doe conforme au cctp",
    "essais et receptions", "mise en service", "reglages", "equilibrage",
    "formation utilisateurs", "assistance a la reception",
    "mise en service complete installations csv",
    "mise en service complete installations csv pv aqc fourni",
    "provision", "travaux imprevus", "aleas", "reserve", "options",
    "sous-total", "sous total", "total",
    "sans objet",
]


def est_ligne_exclue(designation: str) -> bool:
    """
    Retourne True si la ligne DPGF doit être exclue du contrôle de couverture.
    V2 : ajout "sans objet" (T7).
    """
    t = normaliser(designation)
    for excl in EXCLUSIONS_DPGF:
        if normaliser(excl) in t or t in normaliser(excl):
            return True
    if designation.strip().startswith(('▸', '►', 'TOTAL', 'SOUS-TOTAL')):
        return True
    return False


# ============================================================
# 11. TESTS RAPIDES
# ============================================================

if __name__ == "__main__":
    print("=== Tests normalisation V2 ===")

    # Tests équivalences basiques
    assert sont_equivalents("WC suspendu", "wc suspendu"), "FAIL: casse"
    assert sont_equivalents("chaudière condensation gaz", "chaudière gaz à condensation"), "FAIL: chaudière"
    assert sont_equivalents("VMC hygroréglable type B", "vmc hygro b"), "FAIL: VMC hygro"

    # Tests non-équivalences
    assert not sont_equivalents("WC suspendu", "WC au sol"), "FAIL: WC types"
    assert not sont_equivalents("chaudière gaz condensation", "pac air/eau"), "FAIL: chaudière vs pac"
    assert not sont_equivalents("VMC double flux", "VMC simple flux"), "FAIL: VMC DF vs SF"
    assert not sont_equivalents("plancher chauffant", "radiateur acier"), "FAIL: émetteurs"

    # FIX B05 : forme_canonique stricte
    assert forme_canonique("wc suspendu") == "wc suspendu"
    assert forme_canonique("wc au sol") == "wc au sol"
    assert forme_canonique("wc") is None, "FAIL B05: 'wc' seul ne doit pas matcher"

    # Tests forme_canonique_souple
    assert forme_canonique_souple("WC suspendu pack avec plaque") == "wc suspendu"
    assert forme_canonique_souple("WC au sol avec abattant") == "wc au sol"

    print("=== Tests marques V2 ===")
    r = comparer_marques(
        "Chaudière SAUNIER DUVAL ThemaPlus 31 kW",
        "PaC (2 SdB)"
    )
    assert r["alerte"] is None, "FAIL: marque CCTP seule"

    r = comparer_marques(
        "Radiateur FINIMETAL REGGANE 3010",
        "Radiateur ATLANTIC REGGANE 3010"
    )
    assert r["alerte"] == "C04", "FAIL: marques différentes"

    # T8 : ou équivalent
    r = comparer_marques(
        "PAC ATLANTIC Alféa ou équivalent agréé MOE",
        "PAC DAIKIN Altherma"
    )
    assert r["alerte"] is None, "FAIL: T8 ou équivalent"

    print("=== Tests numériques V2 ===")
    assert extraire_puissance("Chaudière 31 kW") == 31.0
    assert extraire_puissance("PAC 12,5 kW") == 12.5
    assert extraire_puissance("WC suspendu") is None

    assert extraire_diametre("Tube DN20") == 20
    assert extraire_diametre("tuyau 32 mm") == 32

    r = comparer_puissances("Chaudière 26 kW", "Chaudière 31 kW")
    assert r["alerte"] == "C03", "FAIL: écart puissance"

    r = comparer_puissances("Chaudière 26 kW", "Chaudière 27 kW")
    assert r["alerte"] is None, "FAIL: puissance dans tolérance"

    print("=== Tests R5 V2 ===")
    r = est_designation_incertaine("PAC conforme au CCTP")
    assert r is not None, "FAIL: R5 poste critique"

    r = est_designation_incertaine("Nourrice conforme au CCTP")
    assert r is None, "FAIL: R5 pas critique"

    print("=== Tests exclusions V2 ===")
    assert est_ligne_exclue("Prestation conforme au CCTP")
    assert est_ligne_exclue("▸ SOUS-TOTAL 3.1. – PLOMBERIE SANITAIRE")
    assert est_ligne_exclue("Sans objet"), "FAIL: T7 sans objet"
    assert not est_ligne_exclue("WC suspendu")

    print("\n✅ Tous les tests V2 passent")
