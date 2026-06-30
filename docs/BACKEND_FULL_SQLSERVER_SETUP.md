# Brancher le back-end sur un vrai SQL Server (avec SSMS) — pas à pas

Pour quand tu as un PC capable d'installer **SQL Server complet** (Developer ou
Express, gratuits) + **SQL Server Management Studio (SSMS)**, et que tu veux
t'en servir au lieu de LocalDB — soit pour t'entraîner dans des conditions
proches de la prod, soit pour te connecter directement au serveur de ta boîte.

> Si tu pars de zéro et veux juste que ça tourne vite, le guide
> [`BACKEND_WINDOWS_QUICKSTART.md`](./BACKEND_WINDOWS_QUICKSTART.md) (LocalDB)
> reste le plus simple — zéro install de serveur. Ce guide-ci est l'étape
> d'après : un **vrai** moteur SQL Server, géré via **SSMS**, ce qui est aussi
> exactement ce que tu retrouveras chez EFG.

---

## 0. Ce que tu dois avoir avant de commencer

- **SQL Server** installé : Developer Edition ou Express (les deux sont
  gratuites). Si ce n'est pas encore fait :
  https://www.microsoft.com/sql-server/sql-server-downloads → **Developer**.
  Pendant l'install, choisis **« Basic »** ou **« Default »** (instance par
  défaut) — c'est le plus simple pour la suite.
- **SQL Server Management Studio (SSMS)** : https://aka.ms/ssmsfullsetup
  (install séparée de SQL Server lui-même).
- **.NET 8 SDK** : https://dotnet.microsoft.com/download/dotnet/8.0 → vérifier
  avec `dotnet --version` dans PowerShell (doit afficher `8.x.x`).

---

## 1. Ouvrir SSMS et identifier ton instance

1. Lance **SQL Server Management Studio**.
2. Dans la fenêtre de connexion :
   - **Server name** : essaie `localhost` (instance par défaut) ou
     `localhost\SQLEXPRESS` (si tu as installé Express avec son nom
     d'instance par défaut).
   - **Authentication** : **Windows Authentication** (le plus simple, c'est
     ton compte Windows qui sert d'identifiant — aucun mot de passe à gérer).
3. Clique **Connect**. Si ça se connecte, tu vois l'arborescence du serveur à
   gauche (Databases, Security, etc.) → ✅ note le **nom du serveur exact**
   affiché en haut de l'arborescence (ex. `DESKTOP-ABC123` ou
   `DESKTOP-ABC123\SQLEXPRESS`), c'est ta valeur de `Server=` pour la suite.

> Si la connexion échoue : le service SQL Server n'est peut-être pas démarré.
> Ouvre **Services** (Win+R → `services.msc`) → cherche `SQL Server
> (MSSQLSERVER)` ou `SQL Server (SQLEXPRESS)` → **Start**.

### Créer la base (optionnel — l'API peut le faire toute seule)

Tu n'as **rien à créer manuellement** : au premier `dotnet run` en
Development, l'API crée la base `RegReport` et ses tables automatiquement
(`EnsureCreated`). Mais si tu préfères la créer toi-même dans SSMS pour la
voir tout de suite :

- Clic droit sur **Databases** → **New Database** → nom `RegReport` → OK.

---

## 2. Donner à l'API la chaîne de connexion vers TON serveur (sans toucher au repo)

Le fichier `appsettings.Development.json` (committé dans Git) pointe par
défaut sur LocalDB — ne le modifie pas, ça casserait l'install de tout le
monde. À la place, crée un fichier **local et ignoré par Git** :

`backend/RegReport.Api/appsettings.Development.local.json`

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost;Database=RegReport;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true"
  }
}
```

- Remplace `Server=localhost` par le nom exact noté à l'étape 1 (ex.
  `Server=localhost\\SQLEXPRESS` — **double antislash** en JSON).
- `Trusted_Connection=True` = authentification Windows (recommandé, pas de
  mot de passe stocké). Si ton serveur impose un compte SQL :
  `User Id=...;Password=...;` à la place de `Trusted_Connection=True`.

Ce fichier est automatiquement chargé par l'API (déjà câblé dans
`Program.cs`) **et** déjà couvert par `.gitignore`
(`appsettings.*.local.json`) — il ne sera jamais commité, même par erreur.

---

## 3. Lancer l'API

```powershell
cd backend\RegReport.Api
dotnet restore
dotnet run
```

- API : `https://localhost:7042`
- Swagger : `https://localhost:7042/swagger`

Ouvre Swagger, essaie `GET /api/data` → tu dois recevoir le JSON de démo. Si
oui : l'API parle bien à ton SQL Server. ✅

Retourne dans **SSMS**, fais un clic droit sur **Databases** → **Refresh** :
tu dois voir apparaître `RegReport` avec ses tables (`KpiHistory`,
`Deadlines`, `Projects`, …) — c'est le schéma créé par EF Core à partir du
modèle C# (`Models/Entities.cs`).

---

## 4. Brancher le front

Identique à LocalDB — à la **racine du projet front**, crée `.env.local` :

```env
VITE_API_BASE_URL=https://localhost:7042/api
```

```powershell
npm install
npm run dev
```

> Certificat HTTPS local bloqué la 1ʳᵉ fois ? `dotnet dev-certs https --trust`
> puis relance.

---

## 5. Vérifier la connexion depuis l'app (Backend Cockpit)

Une fois le front lancé en mode API, va dans le module **Backend** (menu du
haut, ou carte « Backend Cockpit » sur le Hub) :

- Le panneau **Connection** affiche `mode: api`, l'URL de l'API, un ping de
  santé (latence) et un bouton **Reboot / Reconnect** qui refait un
  `GET /api/data` à la demande — pratique pour confirmer que tout est bien
  branché sans ouvrir la console réseau.
- L'onglet **Data Explorer** te montre les lignes réellement stockées dans
  `RegReport` (les mêmes que dans SSMS), avec recherche, insertion et
  suppression.
- L'onglet **Schema & API Map** liste chaque table ↔ endpoint(s) ↔ colonnes,
  utile pour retrouver vite quelle route appeler pour quelle table.

Si le panneau Connection affiche une erreur, regarde la bannière rouge en
haut de l'app (`Could not reach the backend (...)`) — elle contient le
message d'erreur réseau brut.

---

## 6. Passer ensuite au serveur SQL de l'entreprise

Exactement le même principe qu'à l'étape 2 : tu n'édites jamais
`appsettings.Development.json`. Pour basculer vers le serveur de la boîte,
remplace juste le contenu de `appsettings.Development.local.json` (ou crée un
`appsettings.Production.local.json` si tu lances en mode Production) :

```json
{
  "ConnectionStrings": {
    "Default": "Server=NOM_DU_SERVEUR_BOITE;Database=RegReport;Trusted_Connection=True;TrustServerCertificate=True;"
  }
}
```

Si ton compte Windows n'a pas accès au serveur entreprise, utilise les
identifiants SQL fournis par l'IT (`User Id=...;Password=...;`).

### Passer aux migrations EF Core (recommandé dès qu'un vrai serveur existe)

`EnsureCreated()` (utilisé jusqu'ici) est pratique en dev mais ne sait pas
faire évoluer un schéma existant. Avec un vrai serveur, autant passer aux
migrations dès maintenant :

```powershell
dotnet tool install --global dotnet-ef     # une fois
cd backend\RegReport.Api
dotnet ef migrations add Init
dotnet ef database update                  # applique le schéma sur Default
```

Puis dans `Program.cs`, remplace le bloc `db.Database.EnsureCreated(); /
DbSeeder.Seed(db);` par `db.Database.Migrate();`. Si tu n'as pas les droits
de créer des tables sur le serveur de la boîte, donne le script à ton DBA :

```powershell
dotnet ef migrations script > schema.sql
```

### Autoriser le front en CORS

Si le front est un jour hébergé ailleurs que `localhost:5173`, ajoute son URL
dans `Cors:AllowedOrigins` (`appsettings.json` ou ton fichier `.local.json`).

---

## En cas de souci

| Symptôme | Cause probable / solution |
|---|---|
| SSMS ne se connecte pas | Service SQL Server arrêté → `services.msc` → démarrer `SQL Server (MSSQLSERVER)` ou `(SQLEXPRESS)` |
| `Cannot open database "RegReport"` au démarrage de l'API | Normal au tout premier lancement : `EnsureCreated()` la crée — vérifie juste que le `Server=` est correct |
| `Login failed for user` | Mauvaise valeur de `Server=`, ou le compte Windows n'a pas les droits → réessaie en SSMS avec le même `Server=` pour confirmer |
| Le fichier `.local.json` n'a pas l'air pris en compte | Vérifie le nom exact : `appsettings.Development.local.json` (sensible à la casse de `Development` selon `ASPNETCORE_ENVIRONMENT`), bien dans `backend/RegReport.Api/` |
| `ERR_CERT_AUTHORITY_INVALID` côté front | `dotnet dev-certs https --trust` puis relancer |
| Le Cockpit affiche `mode: local` | `.env.local` du **front** absent/mal placé, ou `npm run dev` pas relancé après l'avoir créé |

---

Pour le détail complet (sécurité Entra ID, déploiement Azure, schéma SQL),
voir [`BACKEND.md`](./BACKEND.md). Pour repartir de zéro sans rien
d'installé, voir [`BACKEND_WINDOWS_QUICKSTART.md`](./BACKEND_WINDOWS_QUICKSTART.md).
