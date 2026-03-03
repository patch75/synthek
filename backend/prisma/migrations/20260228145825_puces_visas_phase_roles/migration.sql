-- AlterTable
ALTER TABLE "Projet" ADD COLUMN     "bloqueExe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'APS',
ADD COLUMN     "raisonBlocage" TEXT;

-- CreateTable
CREATE TABLE "Puce" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "projetId" INTEGER NOT NULL,
    "intervenantId" INTEGER,
    "typeLivrable" TEXT,
    "valeurCle" TEXT,
    "version" TEXT,
    "resumeModification" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Puce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visa" (
    "id" SERIAL NOT NULL,
    "projetId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "commentaire" TEXT,
    "dateVisa" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hashDocument" TEXT,

    CONSTRAINT "Visa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Puce_documentId_key" ON "Puce"("documentId");

-- AddForeignKey
ALTER TABLE "Puce" ADD CONSTRAINT "Puce_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Puce" ADD CONSTRAINT "Puce_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visa" ADD CONSTRAINT "Visa_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visa" ADD CONSTRAINT "Visa_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visa" ADD CONSTRAINT "Visa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
