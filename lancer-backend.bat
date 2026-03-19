@echo off
title Synthek - Backend
SET PATH=%PATH%;C:\Program Files\nodejs
cd /d "C:\Users\Fabien\Desktop\SYNTHEK DEV\synthek\backend"
echo Demarrage du backend Synthek...
node node_modules\.bin\prisma generate
node server.js
pause
