# Démarrer le back-end sur Windows — pas à pas (LocalDB → SQL Server entreprise)

Guide concret pour brancher le front sur le back-end **Option B (relationnel)**
quand on part de **zéro sur Windows** et qu'on ne peut pas installer un SQL
Server complet. On utilise **SQL Server LocalDB** en développement (même moteur
que SQL Server, mais léger et sans serveur à administrer), puis on bascule vers
le **SQL Server de l'entreprise** en ne changeant **qu'une chaîne de connexion**.

> Le back-end Option B est **déjà codé** dans `backend/RegReport.Api/` : une
> table par ressource (KPI, deadlines, contreparties, grands risques, équipe,
> projets…), EF Core, et les endpoints REST. Il n'y a rien à recoder pour
> démarrer.

---

## 0. Comment marche la connexion front ↔ back (en 30 secondes)

```
Front React (Vite)            API .NET (ASP.NET Core)           Base
dataRepository.ts  ──HTTP──►  Controllers + EF Core  ──SQL──►  SQL Server / LocalDB
   mode "api"                 GET/PUT /api/data, /api/kpis...
```

- Le front ne connaît **pas** la base. Il parle à une couche
  `src/services/dataRepository.ts` qui :
  - si la variable `VITE_API_BASE_URL` est **vide** → mode **local**
    (`localStorage`, ce que tu utilises aujourd'hui) ;
  - si elle est **renseignée** → mode **api** : il fait `GET {URL}/data` au
    démarrage et `PUT {URL}/data` à chaque modification.
- Donc « brancher le back-end » = lancer l'API + définir **une seule variable**
  côté front. Aucun composant à modifier.

---

## 1. Installer les 2 prérequis (une seule fois)

1. **.NET 8 SDK** (pour compiler/lancer l'API)
   - https://dotnet.microsoft.com/download/dotnet/8.0 → « SDK x64 » pour Windows
   - Vérifier dans un terminal (PowerShell) :
     ```powershell
     dotnet --version      # doit afficher 8.x.x
     ```

2. **SQL Server Express LocalDB** (le moteur de base, léger)
   - Page : https://learn.microsoft.com/sql/database-engine/configure-windows/sql-server-express-localdb
   - Le plus simple : télécharger **« SQL Server Express »**, lancer
     l'installeur, choisir l'option **« Download Media » → LocalDB**, ou cocher
     LocalDB dans l'installeur personnalisé.
   - (Alternative : LocalDB est inclus si tu installes **Visual Studio 2022**
     avec la charge de travail « ASP.NET and web development ».)
   - Vérifier :
     ```powershell
     sqllocaldb info                # liste les instances
     sqllocaldb create MSSQLLocalDB # crée l'instance par défaut si absente
     sqllocaldb start MSSQLLocalDB
     ```

> Rien d'autre à installer : pas de Docker, pas de serveur SQL à administrer.

---

## 2. La base de dev est déjà configurée

`backend/RegReport.Api/appsettings.Development.json` pointe déjà sur LocalDB :

```json
"Default": "Server=(localdb)\\MSSQLLocalDB;Database=RegReport;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true"
```

Au premier lancement en mode Development, l'API **crée le schéma
automatiquement** (`EnsureCreated`) et insère un jeu de données de démo. Rien à
faire manuellement.

---

## 3. Lancer l'API

Dans PowerShell, à la racine du repo :

```powershell
cd backend\RegReport.Api
dotnet restore
dotnet run
```

Au démarrage tu verras une URL, typiquement :

- API : `https://localhost:7042`
- **Swagger** (pour tester les endpoints à la main) : `https://localhost:7042/swagger`

Ouvre Swagger dans le navigateur et essaie `GET /api/data` → tu dois recevoir un
JSON (les données de démo). Si ça marche, le back-end et la base tournent. ✅

> Astuce : laisse cette fenêtre PowerShell ouverte (l'API tourne tant qu'elle
> est ouverte). Ouvre un **second** terminal pour le front.

---

## 4. Brancher le front sur l'API

À la **racine du projet front** (pas dans `backend/`), crée un fichier
`.env.local` :

```env
VITE_API_BASE_URL=https://localhost:7042/api
```

Puis :

```powershell
npm install      # si pas déjà fait
npm run dev
```

Le front passe automatiquement en **mode api** : il lit/écrit dans LocalDB via
l'API. Vérifie dans l'onglet **Network** du navigateur que les appels partent
vers `https://localhost:7042/api/data`.

> ⚠️ Certificat HTTPS local : la 1ʳᵉ fois, le navigateur peut bloquer
> `https://localhost:7042`. Ouvre l'URL Swagger directement et accepte le
> certificat auto-signé, **ou** exécute une fois :
> ```powershell
> dotnet dev-certs https --trust
> ```

Pour **revenir en mode local** (sans back-end) : supprime `.env.local` (ou vide
la variable) et relance `npm run dev`.

---

## 5. Passer au SQL Server de l'entreprise (plus tard)

C'est là que LocalDB paie : **même moteur, même code**. Il suffit de :

1. **Changer la chaîne de connexion** pour pointer sur le serveur de la boîte.
   Ne mets pas de secret dans Git : crée `appsettings.Production.json` (ou une
   variable d'environnement) :
   ```json
   {
     "ConnectionStrings": {
       "Default": "Server=NOM_DU_SERVEUR;Database=RegReport;Trusted_Connection=True;TrustServerCertificate=True;"
     }
   }
   ```
   - `Trusted_Connection=True` = authentification Windows intégrée (idéal en
     banque, pas de mot de passe en clair). Si la boîte impose un compte SQL :
     `User Id=...;Password=...` à la place.
   - En variable d'environnement (alternative, recommandé pour les secrets) :
     ```powershell
     setx ConnectionStrings__Default "Server=...;Database=RegReport;..."
     ```

2. **Créer le schéma proprement via migrations** (au lieu de `EnsureCreated`,
   qui est réservé au dev). Une seule fois :
   ```powershell
   dotnet tool install --global dotnet-ef
   cd backend\RegReport.Api
   dotnet ef migrations add Init
   dotnet ef database update      # applique le schéma sur le serveur cible
   ```
   Puis, dans `Program.cs`, remplacer le bloc `EnsureCreated()/DbSeeder` par
   `db.Database.Migrate();` (déjà indiqué en commentaire dans le fichier).

   > Si tu n'as pas les droits de créer des tables sur le serveur entreprise,
   > donne le script SQL à ton DBA : `dotnet ef migrations script > schema.sql`.

3. **Autoriser l'origine du front** en prod dans `appsettings.json` →
   `Cors:AllowedOrigins` (ajouter l'URL où le front sera hébergé).

Aucun composant React, aucun contrôleur, aucune entité à modifier : seules la
**connexion** et la **stratégie de création du schéma** changent.

---

## 6. En cas de souci

| Symptôme | Cause probable / solution |
|---|---|
| `dotnet : command not found` | .NET 8 SDK non installé ou terminal à rouvrir |
| `A network-related... error ... LocalDB` | `sqllocaldb start MSSQLLocalDB`, ou instance absente → `sqllocaldb create MSSQLLocalDB` |
| Le front reste en mode local | `.env.local` mal placé (doit être à la racine du **front**), ou serveur Vite pas relancé |
| Erreur CORS dans la console | l'URL du front n'est pas dans `Cors:AllowedOrigins` (dev = `http://localhost:5173`) |
| `ERR_CERT_AUTHORITY_INVALID` | `dotnet dev-certs https --trust` puis relancer |
| `GET /api/data` renvoie `{}` | base vide — normal si le seed n'a pas tourné ; en dev il tourne au 1ᵉʳ `dotnet run` |

---

## Récap express

```powershell
# 1. (une fois) installer .NET 8 SDK + LocalDB
# 2. lancer l'API
cd backend\RegReport.Api
dotnet run                      # crée la base LocalDB + seed, expose https://localhost:7042

# 3. (autre terminal) brancher le front
#    créer .env.local à la racine du front : VITE_API_BASE_URL=https://localhost:7042/api
npm run dev
```

Pour le détail complet (sécurité Entra ID, déploiement Azure, schéma SQL), voir
[`BACKEND.md`](./BACKEND.md).
