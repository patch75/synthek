#!/bin/bash
# À lancer après chaque git pull pour mettre à jour la base de données locale

set -e

echo "→ Installation des dépendances backend..."
cd backend
npm install

echo "→ Synchronisation de la base de données..."
npx prisma generate
npx prisma db push

echo "✓ Base de données à jour !"
cd ..
