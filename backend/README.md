# RegReport.Api — backend (.NET 8 + EF Core + SQL Server)

REST API backing the RegReport dashboard. Implements the contract the frontend
expects (`GET/PUT /api/data`) plus granular CRUD endpoints. See
[`../docs/BACKEND.md`](../docs/BACKEND.md) for the full design rationale.

> **On Windows, starting from scratch?** Follow
> [`../docs/BACKEND_WINDOWS_QUICKSTART.md`](../docs/BACKEND_WINDOWS_QUICKSTART.md):
> it uses **SQL Server LocalDB** (no full SQL Server install) and shows how to
> later point at your company SQL Server by changing only the connection string.
> The dev connection string in `appsettings.Development.json` is already set to LocalDB.
>
> **Already have a full SQL Server + SSMS?** Follow
> [`../docs/BACKEND_FULL_SQLSERVER_SETUP.md`](../docs/BACKEND_FULL_SQLSERVER_SETUP.md)
> instead — connect SSMS, point the API at it via a gitignored
> `appsettings.Development.local.json` override (no edits to committed
> files), and verify the connection live from the in-app **Backend Cockpit**.

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- SQL Server — local instance, or run one with Docker:
  ```bash
  docker compose up -d        # starts SQL Server on localhost:1433
  ```

## Run

```bash
cd backend/RegReport.Api
dotnet restore
dotnet run
```

- API: `https://localhost:7042` (and `http://localhost:5042`)
- Swagger UI: `https://localhost:7042/swagger`

On first run in Development, the schema is created automatically
(`EnsureCreated`) and a small demo dataset is seeded. CORS allows the Vite dev
server (`http://localhost:5173`).

> Connection strings live in `appsettings.json` (Windows integrated auth) and
> `appsettings.Development.json` (the Docker SQL Server above). Adjust to taste.

## Connect the frontend

In the **frontend** project root, create `.env.local`:

```env
VITE_API_BASE_URL=https://localhost:7042/api
```

Then `npm run dev`. The app now reads/writes through the API. See
`../docs/BACKEND.md` §8.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET / PUT | `/api/data` | Full `CentralData` document (used by the frontend) |
| GET/POST/PUT/DELETE | `/api/deadlines[/{id}]` | Deadlines CRUD |
| GET | `/api/kpis?entity=` · `/api/kpis/{entity}/{date}` | KPI history |
| PUT/DELETE | `/api/kpis/{entity}/{date}` | Upsert / delete a KPI entry |
| GET/POST/PUT/DELETE | `/api/team[/{id}]` | Team CRUD |
| GET/POST/PUT/DELETE | `/api/projects[/{id}]` · `/api/projects/{id}/tasks` | Projects + tasks |
| GET/PUT/DELETE | `/api/capital-reports[/{entity}/{date}]` | Capital adequacy reports (KM1 + line items) |
| GET/DELETE · PUT bulk | `/api/lcr-reports[/{id}]` · `/api/lcr-reports/bulk/{entity}/{date}` | LCR reports per currency |

Counterparty RWA, large exposures and settings (bilan / risk appetite) follow
the same pattern and are persisted via `/api/data`.

## Production: use EF Core migrations

The `EnsureCreated()` quick-start is for development only. For production:

```bash
dotnet tool install --global dotnet-ef     # once
dotnet ef migrations add Init
dotnet ef database update
```

Then remove the `EnsureCreated()` / seeding block in `Program.cs` and call
`db.Database.Migrate()` at startup instead.

## Loading your real data

- Open the frontend in local mode, export your data (Admin module), and either
  `PUT` it to `/api/data`, or drop it as `RegReport.Api/seed.json` (a full
  `CentralData` JSON) before first run — it takes precedence over the demo seed.

## Project layout

```
RegReport.Api/
├── Program.cs                 # startup, DI, CORS, EnsureCreated + seed
├── appsettings*.json          # connection strings, CORS origins
├── Models/Entities.cs         # domain model (mirrors frontend src/types.ts)
├── Data/
│   ├── AppDbContext.cs        # DbContext + JSON column conversion
│   ├── CentralDataStore.cs    # compose / full-replace the aggregate
│   └── DbSeeder.cs            # demo seed (or seed.json)
└── Controllers/               # DataController + granular CRUD
```
