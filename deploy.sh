#!/bin/bash
MSG=${1:-"update"}
git add . && git commit -m "$MSG" && git push
ssh patch73@187.77.174.188 "cd ~/synthek && git pull && cd frontend && npm run build && pm2 restart synthek-backend"
