# Instructions de démarrage — Synthek

> Ce fichier est destiné à Claude. Lis et exécute les étapes dans l'ordre.

## Contexte
Application web Node.js + React + PostgreSQL.
- Backend : Node.js / Express (port 3000)
- Frontend : React / Vite (port 5173)
- Base de données : PostgreSQL (local, pas Docker)
- OS : Windows 11

---

## Configuration locale validée (Fabien — 17/03/2026)

| Paramètre | Valeur |
|-----------|--------|
| PostgreSQL | v18, port **5432** |
| Utilisateur DB | `postgres` |
| Base de données | `synthek` |
| Compte app | `fabien@synthek.fr` / rôle `admin` |

**Commande de connexion psql :**
```bash
PGPASSWORD="<motdepasse>" "/c/Program Files/PostgreSQL/18/bin/psql" -U postgres -p 5432 -d synthek
```

---

## Corrections appliquées lors de l'installation

### 1. Tables créées manuellement (schéma Prisma en avance sur les migrations)
```sql
-- FaitDocument manquait
CREATE TABLE IF NOT EXISTS "FaitDocument" (
  id SERIAL PRIMARY KEY,
  "documentId" INTEGER NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
  "projetId" INTEGER NOT NULL REFERENCES "Projet"(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL,
  sujet TEXT NOT NULL,
  valeur TEXT NOT NULL,
  unite TEXT,
  contexte TEXT,
  "dateExtraction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- VocabulaireGlobal manquait
CREATE TABLE IF NOT EXISTS "VocabulaireGlobal" (
  id SERIAL PRIMARY KEY,
  terme TEXT NOT NULL UNIQUE,
  definition TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Colonnes manquantes ajoutées
```sql
-- Projet
ALTER TABLE "Projet" ADD COLUMN IF NOT EXISTS "batimentsComposition" TEXT;

-- SousProgramme
ALTER TABLE "SousProgramme" ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SousProgramme" ADD COLUMN IF NOT EXISTS typologies TEXT;
```

### 3. Synchronisation Prisma
Utiliser `prisma db push` plutôt que `prisma migrate dev` pour synchroniser le schéma :
```bash
cd backend
npx prisma db push
npx prisma generate
```

### 4. StrictMode React supprimé
`frontend/src/main.jsx` — StrictMode retiré car il causait un bug de polling (bandeau "Analyse en cours" bloqué).

---

## ÉTAPE 1 — Vérifier PostgreSQL

Vérifie si PostgreSQL est installé :
```bash
psql --version
```

Si la commande échoue, demander à l'utilisateur d'installer PostgreSQL 18 pour Windows depuis postgresql.org/download/windows. Redemander de relancer VS Code ensuite.

---

## ÉTAPE 2 — Demander les identifiants PostgreSQL

Demander :
1. **Mot de passe PostgreSQL** (celui choisi à l'installation)
2. **Port** (défaut : `5432`)
3. **Utilisateur** (défaut : `postgres`)

---

## ÉTAPE 3 — Créer la base de données

```bash
PGPASSWORD="<motdepasse>" "/c/Program Files/PostgreSQL/18/bin/psql" -U postgres -p 5432 -c "CREATE DATABASE synthek;"
```

Si la base existe déjà, passer à l'étape suivante.

---

## ÉTAPE 4 — Mettre à jour backend/.env

```
DATABASE_URL="postgresql://postgres:<motdepasse>@localhost:5432/synthek"
JWT_SECRET="change_this_secret_in_production"
ANTHROPIC_API_KEY=<clé_fournie_par_le_développeur>
PORT=3000
UPLOAD_DIR="./uploads"
```

---

## ÉTAPE 5 — Installer les dépendances

```bash
cd backend && npm install
cd ../frontend && npm install
```

---

## ÉTAPE 6 — Synchroniser la base de données

```bash
cd backend
npx prisma db push
npx prisma generate
```

---

## ÉTAPE 7 — Démarrer les serveurs

```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Application accessible sur http://localhost:5173

---

## ÉTAPE 8 — Créer le premier compte admin

Si la base est vide, créer un utilisateur admin via psql :
```bash
# Générer le hash du mot de passe dans Node.js
cd backend
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('MonMotDePasse', 10).then(h => console.log(h));"
```

Puis insérer en base :
```sql
INSERT INTO "User" (nom, email, password, role)
VALUES ('Nom', 'email@example.com', '<hash>', 'admin');
```

---

## ÉTAPE 9 — Vérification finale

Confirmer :
- ✅ PostgreSQL connecté
- ✅ Base `synthek` créée et synchronisée
- ✅ Backend sur http://localhost:3000/health → `{"status":"ok"}`
- ✅ Frontend sur http://localhost:5173
- ✅ Connexion avec le compte admin

Rappel : **avant de commencer à travailler chaque jour, faire `git pull`** pour récupérer les dernières modifications.
