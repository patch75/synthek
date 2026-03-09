#!/bin/bash
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

MSG=${1:-"update"}

echo -e "${YELLOW}→ Commit & push...${NC}"
git add . && git commit -m "$MSG" && git push || { echo -e "${RED}✗ Git échoué${NC}"; exit 1; }

echo -e "${YELLOW}→ Déploiement VPS...${NC}"
ssh patch73@187.77.174.188 "
  cd ~/synthek && git pull &&
  cd frontend && npm run build &&
  pm2 restart synthek-backend
" && echo -e "${GREEN}✓ Déployé avec succès${NC}" || echo -e "${RED}✗ Erreur lors du déploiement${NC}"
