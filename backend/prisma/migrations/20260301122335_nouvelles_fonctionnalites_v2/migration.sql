-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deltaModifications" TEXT,
ADD COLUMN     "hashFichier" TEXT,
ADD COLUMN     "versionPrecedenteId" INTEGER;

-- AlterTable
ALTER TABLE "ProjetUser" ALTER COLUMN "role" SET DEFAULT 'moa';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'moa';

-- CreateTable
CREATE TABLE "Synthese" (
    "id" SERIAL NOT NULL,
    "projetId" INTEGER NOT NULL,
    "codeSynthese" TEXT NOT NULL,
    "documentIdSource" INTEGER NOT NULL,
    "documentsCroisesIds" TEXT NOT NULL,
    "resultatVisa" TEXT,
    "rapportTexte" TEXT,
    "dateAnalyse" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Synthese_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglementationRef" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "cheminFichier" TEXT NOT NULL,
    "contenuTexte" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "dateUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReglementationRef_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_versionPrecedenteId_fkey" FOREIGN KEY ("versionPrecedenteId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Synthese" ADD CONSTRAINT "Synthese_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Synthese" ADD CONSTRAINT "Synthese_documentIdSource_fkey" FOREIGN KEY ("documentIdSource") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglementationRef" ADD CONSTRAINT "ReglementationRef_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
