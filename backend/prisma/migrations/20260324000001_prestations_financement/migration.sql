-- ─────────────────────────────────────────────────────────────
-- MIGRATION 20260324000001 — Session 2026-03-24
-- Groupée : A1 PrestationsFinancement + B5 feedback alertes
--           + B7 agentSource + B4 migration ancien format + B6 champs bâtiment
-- ─────────────────────────────────────────────────────────────

-- ── A1 : Table PrestationsFinancement ───────────────────────
CREATE TABLE IF NOT EXISTS "PrestationsFinancement" (
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
  "chauf_emetteurs"     TEXT,
  "chauf_regulation"    TEXT,

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

-- ── B5 : Feedback alertes ────────────────────────────────────
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "feedbackUtilisateur" TEXT;
-- valeurs : 'judicieux' | 'faux_positif' | null
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "feedbackPar"  INTEGER REFERENCES "User"(id);
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "feedbackDate" TIMESTAMP(3);

-- ── B7 : agentSource ─────────────────────────────────────────
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "agentSource" TEXT;
-- Alimenter les alertes existantes
UPDATE "Alerte" SET "agentSource" = 'GENERIQUE' WHERE "agentSource" IS NULL;

-- ── B6 : Champs enrichis Bâtiment ────────────────────────────
ALTER TABLE "Batiment" ADD COLUMN IF NOT EXISTS "systemeChauffage" TEXT;
ALTER TABLE "Batiment" ADD COLUMN IF NOT EXISTS "systemeVmc"       TEXT;
ALTER TABLE "Batiment" ADD COLUMN IF NOT EXISTS "typesLogements"   TEXT; -- JSON string

-- ── B4 : Migration format ancien → D1 ────────────────────────
-- Insérer dans Batiment les projets ayant batimentsComposition au format D1
-- mais sans enregistrements dans la table Batiment
INSERT INTO "Batiment" (
  "projetId", "nom", "nbLogements", "lli", "lls", "brs",
  "acceStd", "accesPremium", "villas", "fiabilite", "montees"
)
SELECT
  p.id,
  bat->>'nom',
  NULLIF(bat->>'nb_logements', '')::int,
  COALESCE(NULLIF(bat->>'LLI', '')::int, 0),
  COALESCE(NULLIF(bat->>'LLS', '')::int, 0),
  COALESCE(NULLIF(bat->>'BRS', '')::int, 0),
  COALESCE(NULLIF(bat->>'acces_std', '')::int, 0),
  COALESCE(NULLIF(bat->>'acces_premium', '')::int, 0),
  COALESCE(NULLIF(bat->>'villas', '')::int, 0),
  bat->>'fiabilite',
  CASE
    WHEN bat->'montees' IS NOT NULL AND jsonb_typeof(bat->'montees') = 'array'
    THEN (bat->'montees')::text
    ELSE NULL
  END
FROM "Projet" p
CROSS JOIN LATERAL jsonb_array_elements(p."batimentsComposition"::jsonb) AS bat
WHERE p."batimentsComposition" IS NOT NULL
  AND p."batimentsComposition" ~ '^\s*\['
  AND (p."batimentsComposition"::jsonb)->0 ? 'LLI'
  AND NOT EXISTS (SELECT 1 FROM "Batiment" b WHERE b."projetId" = p.id)
ON CONFLICT DO NOTHING;
