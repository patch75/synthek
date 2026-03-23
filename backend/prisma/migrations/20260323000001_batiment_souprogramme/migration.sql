-- CreateTable SousProgramme
CREATE TABLE IF NOT EXISTS "SousProgramme" (
    "id" SERIAL NOT NULL,
    "projetId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "typologies" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SousProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable Batiment
CREATE TABLE IF NOT EXISTS "Batiment" (
    "id" SERIAL NOT NULL,
    "projetId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "montees" TEXT,
    "nosComptes" TEXT,
    "nbLogements" INTEGER,
    "lli" INTEGER,
    "lls" INTEGER,
    "brs" INTEGER,
    "acceStd" INTEGER,
    "accesPremium" INTEGER,
    "villas" INTEGER,
    "fiabilite" TEXT,
    "sectionCctp" TEXT,
    "feuillesDpgf" TEXT,
    CONSTRAINT "Batiment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey SousProgramme
ALTER TABLE "SousProgramme" ADD CONSTRAINT "SousProgramme_projetId_fkey"
    FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Batiment
ALTER TABLE "Batiment" ADD CONSTRAINT "Batiment_projetId_fkey"
    FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn Document.categorieDoc
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "categorieDoc" TEXT;

-- AddColumn Document.sousProgrammeId
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "sousProgrammeId" INTEGER
    REFERENCES "SousProgramme"("id") ON DELETE SET NULL;

-- AddColumn Document.lotType
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "lotType" TEXT;

-- AddColumn Projet metadata columns
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "typeBatiment" TEXT;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "nombreNiveaux" INTEGER;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "shon" DOUBLE PRECISION;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "energieRetenue" TEXT;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "zoneClimatique" TEXT;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "classementErp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "typeErp" TEXT;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "nombreLogements" INTEGER;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "adresse" TEXT;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "batimentsComposition" TEXT;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "metadonnees" TEXT;
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "intervenants" TEXT;

-- AddColumn Alerte columns
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "criticite" TEXT;
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "resoluePar" TEXT;
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "justificationDerogation" TEXT;
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "contexteSource" TEXT;
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "dpgfSource" TEXT;

-- AddColumn Document versioning
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "hashFichier" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "versionPrecedenteId" INTEGER;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "deltaModifications" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "statutDocument" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "indiceRevision" TEXT;
