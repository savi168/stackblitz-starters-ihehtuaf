# Connecter un back-end — .NET 8 + Entity Framework Core + SQL Server

Ce guide explique, **pas à pas**, comment remplacer le stockage `localStorage`
par un vrai back-end **ASP.NET Core Web API + EF Core + SQL Server**, et comment
y brancher le front existant **sans réécrire les composants**.

Le front est déjà prêt : il passe par une couche d'abstraction
(`src/services/dataRepository.ts`) qui bascule automatiquement en mode API dès
que la variable `VITE_API_BASE_URL` est définie.

---

## 0. Architecture cible

```
┌─────────────────────┐      HTTPS / JSON      ┌──────────────────────────┐      ┌──────────────┐
│  Front React (Vite) │ ─────────────────────► │  ASP.NET Core Web API    │ ───► │  SQL Server  │
│  dataRepository.ts  │ ◄───────────────────── │  Controllers + EF Core   │ ◄─── │  (MSSQL)     │
└─────────────────────┘                        └──────────────────────────┘      └──────────────┘
        mode 'api'                                  /api/data, /api/kpis, ...
```

Deux stratégies de stockage, au choix :

- **Option A — "Document" (démarrage rapide)** : une seule table qui stocke le
  JSON `CentralData` complet. Le front fonctionne immédiatement avec son
  contrat actuel (`GET/PUT /api/data`). Idéal pour démarrer.
- **Option B — Relationnel (cible)** : un schéma SQL normalisé (une table par
  ressource) pour requêter, auditer et sécuriser finement. Recommandé à terme.

On peut **commencer par A puis migrer vers B** sans toucher au front (le front
parle toujours `/api/data`, c'est le contrôleur qui change d'implémentation).

---

## 1. Le contrat que le front attend déjà

`src/services/dataRepository.ts` (implémentation `ApiRepository`) appelle :

| Méthode | Endpoint | Corps | Réponse |
|---|---|---|---|
| `GET`  | `{VITE_API_BASE_URL}/data` | — | `CentralData` (JSON) |
| `PUT`  | `{VITE_API_BASE_URL}/data` | `CentralData` (JSON) | `204 No Content` |

> `CentralData` est défini dans `src/types.ts`. C'est l'objet complet
> (kpisHistory, deadlines, projects, etc.). **Implémenter ces deux endpoints
> suffit** pour que toute l'application fonctionne sur le back-end.

Les endpoints granulaires (§6) sont une **amélioration** ultérieure.

---

## 2. Créer le projet .NET

```bash
# .NET 8 SDK requis
dotnet new webapi -n RegReport.Api
cd RegReport.Api

dotnet add package Microsoft.EntityFrameworkCore.SqlServer
dotnet add package Microsoft.EntityFrameworkCore.Design
dotnet tool install --global dotnet-ef    # si pas déjà installé
```

`appsettings.json` — chaîne de connexion :

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost;Database=RegReport;Trusted_Connection=True;TrustServerCertificate=True;"
  },
  "Cors": { "AllowedOrigins": [ "http://localhost:5173" ] }
}
```

> En environnement bancaire Microsoft, privilégier l'**authentification intégrée**
> (`Trusted_Connection`) ou un **Managed Identity** Azure plutôt qu'un mot de
> passe en clair.

---

## 3. Option A — Stockage "document" (démarrage rapide)

### 3.1 Table SQL

```sql
CREATE TABLE dbo.CentralDataDocuments (
    Id           INT            NOT NULL IDENTITY PRIMARY KEY,
    Payload      NVARCHAR(MAX)  NOT NULL,          -- le JSON CentralData
    UpdatedAtUtc DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    NVARCHAR(256)  NULL
);
-- On ne garde qu'une ligne "courante" (Id = 1) pour l'app mono-tenant.
```

### 3.2 DbContext + entité

```csharp
public class CentralDataDocument
{
    public int Id { get; set; }
    public string Payload { get; set; } = "{}";
    public DateTime UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }
}

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) {}
    public DbSet<CentralDataDocument> CentralDataDocuments => Set<CentralDataDocument>();
}
```

### 3.3 Contrôleur `/api/data`

```csharp
[ApiController]
[Route("api/data")]
public class DataController : ControllerBase
{
    private readonly AppDbContext _db;
    public DataController(AppDbContext db) => _db = db;

    // GET /api/data  -> renvoie le JSON CentralData tel quel
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var doc = await _db.CentralDataDocuments.FindAsync(1);
        var json = doc?.Payload ?? "{}";
        return Content(json, "application/json");
    }

    // PUT /api/data  -> remplace le JSON CentralData courant
    [HttpPut]
    public async Task<IActionResult> Put()
    {
        using var reader = new StreamReader(Request.Body);
        var json = await reader.ReadToEndAsync();

        var doc = await _db.CentralDataDocuments.FindAsync(1);
        if (doc is null)
        {
            doc = new CentralDataDocument { Id = 1 };
            _db.CentralDataDocuments.Add(doc);
        }
        doc.Payload = json;
        doc.UpdatedAtUtc = DateTime.UtcNow;
        doc.UpdatedBy = User?.Identity?.Name;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
```

C'est suffisant pour que le front tourne entièrement sur le back-end.

---

## 4. Option B — Schéma relationnel (cible)

Schéma normalisé miroir de `types.ts`, **100 % relationnel** : les structures
imbriquées sont soit aplaties en colonnes (breakdown CET1, key metrics), soit
stockées dans des tables enfants (liquidité par devise, historique/pièces
jointes des deadlines). Aucune colonne JSON — la seule exception est le
paramètre `importMapping` (document de configuration du parseur Excel) dans la
table clé/valeur `Settings`.

```sql
-- KPI bruts (un enregistrement par entité + date)
CREATE TABLE dbo.KpiHistory (
    Id                  INT IDENTITY PRIMARY KEY,
    Entity              NVARCHAR(64)  NOT NULL,
    [Date]              DATE          NOT NULL,
    Cet1Capital         DECIMAL(18,2) NOT NULL,
    CreditRWA           DECIMAL(18,2) NOT NULL,
    MarketRWA           DECIMAL(18,2) NOT NULL,
    OpRWA               DECIMAL(18,2) NOT NULL,
    OtherRWA            DECIMAL(18,2) NOT NULL DEFAULT 0,
    Tier1               DECIMAL(18,2) NOT NULL,
    Exposure            DECIMAL(18,2) NOT NULL,
    -- Breakdown CET1 aplati en colonnes :
    BreakdownEquity              DECIMAL(18,2) NULL,
    BreakdownPnl                 DECIMAL(18,2) NULL,
    BreakdownShareBuyback        DECIMAL(18,2) NULL,
    BreakdownGoodwillIntangibles DECIMAL(18,2) NULL,
    BreakdownOtherDeductions     DECIMAL(18,2) NULL,
    BreakdownToBeDefined         DECIMAL(18,2) NULL,
    BreakdownDividend            DECIMAL(18,2) NULL,
    CONSTRAINT UQ_KpiHistory UNIQUE (Entity, [Date])
);

-- Liquidité : une ligne par devise (table enfant de KpiHistory)
CREATE TABLE dbo.KpiLiquidity (
    Id                INT IDENTITY PRIMARY KEY,
    KpiHistoryEntryId INT NOT NULL REFERENCES dbo.KpiHistory(Id) ON DELETE CASCADE,
    Currency          NVARCHAR(8)   NOT NULL,   -- TOT | CHF | EUR | USD …
    Hqla              DECIMAL(18,2) NULL,
    NetCashOutflows   DECIMAL(18,2) NULL,
    Asf               DECIMAL(18,2) NULL,
    Rsf               DECIMAL(18,2) NULL,
    -- Décomposition flux (5 colonnes Inflows*, 5 colonnes Outflows*)
    -- et composition HQLA (5 colonnes Hqla*), toutes NULLables.
    CONSTRAINT UQ_KpiLiquidity UNIQUE (KpiHistoryEntryId, Currency)
);

CREATE TABLE dbo.Deadlines (
    Id                  INT PRIMARY KEY,        -- l'id métier existant
    Name                NVARCHAR(256) NOT NULL,
    Status              NVARCHAR(32)  NOT NULL, -- completed | inprogress | upcoming
    [Type]              NVARCHAR(32)  NOT NULL, -- regulatory | internal
    Entity              NVARCHAR(64)  NULL,
    EndOfPeriod         DATE NULL,
    DueDate             DATE NULL,
    OwnerGroup          NVARCHAR(128) NULL,
    Validator1          NVARCHAR(128) NULL,
    Validator2          NVARCHAR(128) NULL,
    Comments            NVARCHAR(MAX) NULL
);

-- Historique de statut et pièces jointes : tables enfants
CREATE TABLE dbo.DeadlineHistory (
    Id INT IDENTITY PRIMARY KEY,
    DeadlineId INT NOT NULL REFERENCES dbo.Deadlines(Id) ON DELETE CASCADE,
    [Timestamp] NVARCHAR(64) NOT NULL,
    OldStatus NVARCHAR(32) NOT NULL,
    NewStatus NVARCHAR(32) NOT NULL
);
CREATE TABLE dbo.DeadlineAttachments (
    Id INT IDENTITY PRIMARY KEY,
    DeadlineId INT NOT NULL REFERENCES dbo.Deadlines(Id) ON DELETE CASCADE,
    Name NVARCHAR(256) NOT NULL,
    DataUrl NVARCHAR(MAX) NOT NULL,
    [Type] NVARCHAR(128) NOT NULL
);

CREATE TABLE dbo.CounterpartyRwa (
    Id INT IDENTITY PRIMARY KEY,
    Entity NVARCHAR(64) NOT NULL, [Date] DATE NOT NULL,
    CounterpartyName NVARCHAR(256) NOT NULL,
    Industry NVARCHAR(64) NOT NULL,
    Rwa DECIMAL(18,2) NOT NULL
);

CREATE TABLE dbo.LargeExposures (
    Id INT IDENTITY PRIMARY KEY,
    Entity NVARCHAR(64) NOT NULL, [Date] DATE NOT NULL,
    Counterparty NVARCHAR(256) NOT NULL,
    ExposureValue DECIMAL(18,2) NOT NULL,
    [Limit] DECIMAL(18,2) NOT NULL
);

CREATE TABLE dbo.TeamMembers (
    Id INT PRIMARY KEY,
    Name NVARCHAR(128) NOT NULL, Role NVARCHAR(128) NULL,
    Email NVARCHAR(256) NULL, Phone NVARCHAR(64) NULL
);

CREATE TABLE dbo.Projects (
    Id INT PRIMARY KEY,
    Name NVARCHAR(256) NOT NULL, Description NVARCHAR(MAX) NULL
);

CREATE TABLE dbo.ProjectTasks (
    Id INT PRIMARY KEY,
    ProjectId INT NOT NULL REFERENCES dbo.Projects(Id),
    Title NVARCHAR(256) NOT NULL,
    Assignee NVARCHAR(128) NULL,
    Status NVARCHAR(32) NOT NULL,             -- To Do | In Progress | Done
    ItTicket NVARCHAR(64) NULL
);

-- Seuils red/amber : une ligne par entité, colonnes plates
CREATE TABLE dbo.RiskAppetite (
    Entity NVARCHAR(64) PRIMARY KEY,
    Cet1Red DECIMAL(9,4) NULL,  Cet1Amber DECIMAL(9,4) NULL,
    LcrRed DECIMAL(9,4) NULL,   LcrAmber DECIMAL(9,4) NULL,
    NsfrRed DECIMAL(9,4) NULL,  NsfrAmber DECIMAL(9,4) NULL,
    LeverageRed DECIMAL(9,4) NULL, LeverageAmber DECIMAL(9,4) NULL,
    LocalCapitalRequirement DECIMAL(9,4) NULL  -- % des RWA (incl. pilier 2)
);

-- Bilan par devise : table à une seule ligne
CREATE TABLE dbo.Bilan (
    Id INT IDENTITY PRIMARY KEY,
    Chf DECIMAL(18,2) NOT NULL, Eur DECIMAL(18,2) NOT NULL,
    Usd DECIMAL(18,2) NOT NULL, Gbp DECIMAL(18,2) NOT NULL,
    Other DECIMAL(18,2) NOT NULL
);

-- Seule exception JSON : le mapping d'import Excel (config du parseur,
-- schéma libre qui suit les versions de templates FINMA/SNB)
CREATE TABLE dbo.Settings (
    [Key] NVARCHAR(64) PRIMARY KEY,           -- 'importMapping'
    Value NVARCHAR(MAX) NOT NULL
);
```

Mappez chaque table à une entité EF Core et exposez un `DbSet<>` par ressource.
Le contrôleur `/api/data` (Option A) devient alors un **agrégateur** qui
recompose l'objet `CentralData` à partir des tables (et inversement au `PUT`).

---

## 5. Brancher EF Core + CORS (`Program.cs`)

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();
// app.UseAuthentication(); app.UseAuthorization();   // voir §7
app.MapControllers();
app.Run();
```

Créez la base et appliquez la migration :

```bash
dotnet ef migrations add Init
dotnet ef database update
dotnet run        # API sur https://localhost:7042 par ex.
```

---

## 6. (Amélioration) Endpoints REST granulaires

Pour des chargements partiels, de la pagination et des droits fins, exposez en
plus des routes par ressource. Mapping recommandé :

| Ressource | Endpoints |
|---|---|
| KPI | `GET/POST /api/kpis`, `GET /api/kpis/{entity}/{date}`, `PUT/DELETE /api/kpis/{id}` |
| Deadlines | `GET/POST /api/deadlines`, `PUT/DELETE /api/deadlines/{id}` |
| Contreparties | `GET/POST /api/counterparty-rwa`, … |
| Grands risques | `GET/POST /api/large-exposures`, … |
| Projets | `GET/POST /api/projects`, `GET /api/projects/{id}/tasks`, … |
| Équipe | `GET/POST/PUT/DELETE /api/team` |
| Risk appetite / Bilan | `GET/PUT /api/settings/{key}` |

Côté front, ajoutez les méthodes correspondantes dans `ApiRepository`
(`dataRepository.ts`) et, si besoin, des hooks dédiés — le `DataContext` peut
alors charger les ressources séparément plutôt qu'en un seul blob.

---

## 7. Sécurité (recommandé en banque)

- **Authentification** : Microsoft Entra ID (Azure AD) via OpenID Connect.
  Côté API : `AddAuthentication().AddJwtBearer(...)` + `[Authorize]` sur les
  contrôleurs. Côté front : récupérez un access token (MSAL.js) et injectez-le
  dans `ApiRepository.headers()` (l'emplacement est déjà préparé en commentaire).
- **HTTPS** obligatoire (`app.UseHttpsRedirection()`).
- **Audit** : la colonne `UpdatedBy` / `UpdatedAtUtc` trace les écritures.
- **Validation** : valider le payload `CentralData` côté serveur (DataAnnotations
  / FluentValidation) avant persistance.

---

## 8. Pointer le front sur l'API — pas à pas

1. Lancer l'API .NET (`dotnet run`) et noter son URL (ex. `https://localhost:7042`).
2. À la racine du projet front, créer **`.env.local`** (copie de `.env.example`) :
   ```env
   VITE_API_BASE_URL=https://localhost:7042/api
   ```
3. Redémarrer le serveur de dev : `npm run dev`.
4. Le front passe automatiquement en **mode `api`** :
   - au démarrage il fait `GET /api/data` ;
   - chaque modification déclenche `PUT /api/data` (debounce 400 ms).
5. Vérifier dans l'onglet **Network** du navigateur que les appels partent bien
   vers l'API. En cas d'échec, un bandeau rouge s'affiche et l'app retombe sur
   le seed local.

> Pour revenir en mode 100 % local : vider `VITE_API_BASE_URL` (ou supprimer
> `.env.local`) et redémarrer.

---

## 9. Déploiement (pistes)

- **API** : Azure App Service / Azure Container Apps + **Azure SQL Database**
  (avec Managed Identity pour la connexion, sans mot de passe).
- **Front** : build statique (`npm run build` → `dist/`) servi par Azure Static
  Web Apps, un CDN, ou le même App Service. Définir `VITE_API_BASE_URL` au
  moment du build (variable d'environnement CI/CD).
- **CORS** : ajouter l'URL de production du front dans `Cors:AllowedOrigins`.

---

## 10. Checklist de migration

- [ ] Projet `RegReport.Api` créé, packages EF Core ajoutés
- [ ] Chaîne de connexion SQL Server configurée
- [ ] Option A : table `CentralDataDocuments` + contrôleur `/api/data`
- [ ] `dotnet ef database update` exécuté
- [ ] CORS autorise `http://localhost:5173`
- [ ] `GET /api/data` renvoie un JSON valide (au moins `{}`)
- [ ] `.env.local` du front pointe sur l'API
- [ ] Les écritures du front se retrouvent en base
- [ ] (Cible) Schéma relationnel + endpoints granulaires
- [ ] (Banque) Auth Entra ID + HTTPS + audit
