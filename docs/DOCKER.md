# Déployer RegReport avec Docker

## Pourquoi ça se prête bien à Docker

- Le conteneur est **stateless** : tout l'état — données, documents de la
  Library, mappings, audit — vit dans **SQL Server**, à l'extérieur. Rien à
  monter en volume, un conteneur se remplace sans rien perdre.
- L'API **sert la SPA** (wwwroot) : une seule image, un seul port.
- Le **migrateur de schéma intégré** tourne au démarrage : déployer une
  nouvelle image met la base à niveau tout seul (additive, idempotente,
  tracée dans `__SchemaMigrations`) — les données saisies sont conservées,
  comme pour la release zip.
- .NET 8 est multi-plateforme : l'image tourne sur n'importe quel hôte Linux
  (ou Docker Desktop sous Windows).

## Démarrage rapide

```bash
# App + SQL Server 2022 de test (volume persistant) :
docker compose --profile with-sql up -d --build
# → http://localhost:8080  (badge TEST, Security:Mode=None)

# App seule, contre votre SQL Server existant :
docker compose up -d --build
```

Ou à la main :

```bash
docker build -t regreport:3.2.0 .
docker run -d -p 8080:8080 \
  -e ConnectionStrings__Default="Server=monsql;Database=RegReport;User Id=regreport;Password=***;TrustServerCertificate=True" \
  -e App__EnvironmentLabel=TEST \
  regreport:3.2.0
```

Toute la configuration passe par des **variables d'environnement** (syntaxe
.NET : `Section__Sous_cle`) — `ConnectionStrings__Default`,
`ConnectionStrings__Mercury`, `Security__Mode`, `App__EnvironmentLabel`,
`Production__FxRatesQuery`… Alternative : monter un
`appsettings.Production.local.json` en volume sur `/app`.

## Les deux points d'attention (honnêtement)

### 1. Windows Authentication

C'est **LE** sujet. Le mode `Security:Mode=Windows` (Negotiate/Kerberos)
suppose que le processus tourne sur une machine du domaine. Dans un conteneur
**Linux**, trois options :

| Option | Effort | Verdict |
|---|---|---|
| `Security__Mode=None` dans le conteneur | zéro | OK pour un **TEST/DEV** interne ; pas pour la PROD (pas de rôles, tout le monde admin) |
| **Reverse proxy authentifiant** devant le conteneur (IIS/ARR, nginx+SPNEGO, ou un gateway d'entreprise) qui passe l'identité en header, + petit middleware pour lire ce header | moyen | Le pattern d'entreprise propre ; demande un ajustement côté API (middleware header → ClaimsPrincipal) qu'on fera le jour venu |
| Conteneur Linux **joint au domaine** via keytab Kerberos (`KRB5_KTNAME`) — Negotiate fonctionne alors nativement | élevé (ticket IT, SPN, rotation du keytab) | Possible mais lourd à opérer |

Recommandation pragmatique : **PROD sur la machine Windows** (release zip,
Windows Auth natif) tant que l'IT n'offre pas de proxy authentifiant, et
**Docker pour TEST/DEV** — c'est d'ailleurs exactement l'environnement TEST
dont tu parlais : `docker compose --profile with-sql up -d` te donne une
instance jetable complète, badge TEST dans le header, sans toucher à ta PROD.

### 2. La connexion SQL

Dans un conteneur Linux, pas d'`Integrated Security` : utiliser un **login
SQL** dédié (`User Id=regreport;Password=…`) pour RegReport et pour MERCURY.
Droits nécessaires : `db_owner` (ou au minimum lecture/écriture +
`db_ddladmin` pour le migrateur) sur RegReport ; lecture seule suffit sur
MERCURY.

## Environnement fermé (pas d'internet)

La **build** de l'image a besoin d'internet (images de base Docker + paquets
NuGet ; le front, lui, utilise le cache npm vendoré). Le pattern classique :

```bash
# Sur un poste connecté :
docker build -t regreport:3.2.0 .
docker save regreport:3.2.0 -o regreport-3.2.0.tar

# Sur le serveur fermé :
docker load -i regreport-3.2.0.tar
docker run -d -p 8080:8080 -e ConnectionStrings__Default="..." regreport:3.2.0
```

À l'exécution, le conteneur ne fait **aucun** appel internet (police
auto-hébergée, aucune dépendance CDN).

## Versions

L'image estampille l'assembly avec `APP_VERSION` lue dans `src/version.ts`
(même numéro que le badge du header et `GET /api/meta`). Taguer l'image
pareil : `regreport:3.2.0`.

## Scan de sécurité (Trivy)

Les plateformes d'entreprise scannent les images avant déploiement (souvent
avec **Trivy**) et bloquent sur les vulnérabilités HIGH/CRITICAL. L'image est
construite pour bien passer :

- **Base runtime "chiseled"** (`aspnet:8.0-noble-chiseled-extra`) : Ubuntu
  minimale (~10 paquets au lieu d'une centaine), **pas de shell**, utilisateur
  **non-root** — la quasi-totalité des CVE OS des images Debian classiques
  disparaissent du scan.
- **Multi-stage** : node et le SDK .NET ne sont PAS dans l'image finale — seuls
  le runtime, les DLL publiées et les fichiers statiques du front sont livrés.
  Les paquets npm ne sont jamais expédiés (uniquement le bundle compilé).
- **NuGet en versions flottantes** (`8.0.*`) : chaque build en ligne prend les
  derniers correctifs de sécurité .NET/EF Core automatiquement.
- **Aucun secret dans l'image** : les connexions arrivent par variables
  d'environnement à l'exécution.

Vérifier soi-même AVANT l'IT (sur le poste avec Docker Desktop) :

```powershell
docker build -t regreport:X.Y.Z .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock `
  aquasec/trivy image --severity HIGH,CRITICAL --ignore-unfixed regreport:X.Y.Z
```

`--ignore-unfixed` masque les CVE sans correctif disponible (aucune action
possible) — la plupart des politiques d'entreprise les tolèrent ; retirer le
flag pour voir la liste complète.

Deux réflexes d'exploitation :

1. **Reconstruire l'image à chaque release** (et au moins mensuellement s'il
   n'y a pas de release) : les correctifs OS et .NET arrivent par les images
   de base — une image jamais reconstruite accumule les findings.
2. Le conteneur chiseled n'a pas de shell : le diagnostic passe par
   `docker logs regreport` et la page **☰ → Logs** de l'application (c'est
   voulu — un attaquant n'a pas de shell non plus).

Note : le `docker-compose.yml` du dépôt embarque un mot de passe `sa` PAR
DÉFAUT pour le TEST local — le surcharger (`SQL_SA_PASSWORD`) et ne jamais
utiliser ce compose SQL en production (en entreprise, la base est celle de
l'IT).
