-- AlterTable
ALTER TABLE "Alerte" ADD COLUMN     "justificationDerogation" TEXT,
ADD COLUMN     "resoluePar" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "indiceRevision" TEXT,
ADD COLUMN     "statutDocument" TEXT;

-- AlterTable
ALTER TABLE "Projet" ADD COLUMN     "adresse" TEXT,
ADD COLUMN     "classementErp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "energieRetenue" TEXT,
ADD COLUMN     "nombreLogements" INTEGER,
ADD COLUMN     "nombreNiveaux" INTEGER,
ADD COLUMN     "shon" DOUBLE PRECISION,
ADD COLUMN     "typeBatiment" TEXT,
ADD COLUMN     "typeErp" TEXT,
ADD COLUMN     "zoneClimatique" TEXT;

-- CreateTable
CREATE TABLE "ConfigProjet" (
    "id" SERIAL NOT NULL,
    "projetId" INTEGER NOT NULL,
    "promptSystemeGlobal" TEXT,
    "seuilsTolerance" JSONB,
    "vocabulaireMetier" JSONB,
    "valeursReference" JSONB,
    "conventionNommage" TEXT,

    CONSTRAINT "ConfigProjet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionArbitrage" (
    "id" SERIAL NOT NULL,
    "projetId" INTEGER NOT NULL,
    "alerteId" INTEGER,
    "type" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "decideParId" INTEGER NOT NULL,
    "dateDecision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionArbitrage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigProjet_projetId_key" ON "ConfigProjet"("projetId");

-- AddForeignKey
ALTER TABLE "ConfigProjet" ADD CONSTRAINT "ConfigProjet_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionArbitrage" ADD CONSTRAINT "DecisionArbitrage_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionArbitrage" ADD CONSTRAINT "DecisionArbitrage_alerteId_fkey" FOREIGN KEY ("alerteId") REFERENCES "Alerte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionArbitrage" ADD CONSTRAINT "DecisionArbitrage_decideParId_fkey" FOREIGN KEY ("decideParId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
