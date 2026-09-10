# =============================================================================
# RegReport — image Docker unique (API .NET 8 servant la SPA depuis wwwroot).
#
#   docker build -t regreport:latest .
#   docker run -p 8080:8080 \
#     -e ConnectionStrings__Default="Server=sql;Database=RegReport;User Id=regreport;Password=***;TrustServerCertificate=True" \
#     regreport:latest
#
# Le conteneur est STATELESS : tout l'état vit dans SQL Server (y compris les
# documents de la Library) — pas de volume de données à gérer, et le migrateur
# de schéma intégré met la base à niveau au démarrage.
# La build a besoin d'internet (images de base + NuGet) : construire l'image
# sur un poste connecté, puis `docker save` / `docker load` pour un
# environnement fermé (voir docs/DOCKER.md).
# =============================================================================

# --- Étape 1 : build du frontend -------------------------------------------
FROM node:20-bookworm-slim AS front
WORKDIR /src
COPY package.json package-lock.json ./
COPY vendor/npm-cache ./vendor/npm-cache
# Cache npm vendoré (offline) d'abord, registre en secours.
RUN npm ci --offline --cache vendor/npm-cache || npm ci
COPY . .
# Servi par l'API sur la même origine → base API relative.
ENV VITE_API_BASE_URL=/api
RUN npm run build

# --- Étape 2 : publish de l'API --------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
COPY backend/RegReport.Api ./backend/RegReport.Api
COPY src/version.ts ./src/version.ts
# /p:Version : même numéro que le badge du front (source unique src/version.ts).
RUN VER=$(sed -n "s/.*APP_VERSION = '\([^']*\)'.*/\1/p" src/version.ts) && \
    dotnet publish backend/RegReport.Api/RegReport.Api.csproj \
      -c Release -o /out /p:Version=${VER:-0.0.0}

# --- Étape 3 : image finale --------------------------------------------------
# Base "chiseled" (Ubuntu minimale, ~10 paquets, PAS de shell, utilisateur
# NON-root par défaut) : réduit drastiquement la surface d'attaque et les
# findings des scanners (Trivy & co) par rapport à aspnet:8.0 Debian complet.
# Variante -extra = + ICU/tzdata (globalisation, dates). Conséquence assumée :
# pas de `docker exec bash` dans ce conteneur — diagnostic via `docker logs`
# et la page ☰ → Logs de l'application.
FROM mcr.microsoft.com/dotnet/aspnet:8.0-noble-chiseled-extra
WORKDIR /app
COPY --from=api /out .
COPY --from=front /src/dist ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080 \
    Security__Mode=None
EXPOSE 8080
ENTRYPOINT ["dotnet", "RegReport.Api.dll"]
