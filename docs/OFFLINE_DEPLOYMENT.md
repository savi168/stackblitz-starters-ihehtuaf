# Déploiement 100 % local (environnement d'entreprise, sans internet)

Le tool est conçu pour tourner **sans aucun accès internet au runtime**.

## Ce qui est déjà local

| Composant | Où il vit | Réseau au runtime ? |
|---|---|---|
| Lecture Excel/xlsb (SheetJS `xlsx`) | bundlé dans `dist/assets/xlsx-*.js` | non |
| Graphiques (recharts), PDF (jsPDF + html2canvas), icônes (lucide) | bundlés dans `dist/assets/` | non |
| Tailwind CSS | compilé au build (PostCSS), pas de CDN | non |
| Police Inter | auto-hébergée : `public/fonts/*.woff2` + `@font-face` dans `src/index.css` | non |
| Backend .NET | binaires publiés + SQL Server local | non |
| MERCURY / RegReport | connexions SQL internes | non (réseau interne) |

Le seul lien externe restant dans le code est un lien intranet (`inside.efgz.efg.corp`)
dans la page Deadlines — il pointe vers votre SharePoint interne, pas vers internet.

## Internet n'est nécessaire qu'au BUILD, jamais au RUN

- **Front** : `npm install` (une fois, télécharge node_modules) puis `npm run build`
  → le dossier `dist/` est autoportant : servable par IIS/nginx/fichier statique,
  **aucune** requête sortante. On peut builder sur un poste avec internet et
  copier `dist/` dans l'environnement fermé.
- **Backend** : `dotnet publish -c Release` (restaure les NuGet au build) →
  le dossier publié tourne sans internet. Pour éviter même l'installation du
  runtime .NET : `dotnet publish -c Release -r win-x64 --self-contained true`.
- Si le poste de build est lui aussi fermé : monter un miroir interne
  (Artifactory/Nexus, offline cache npm + NuGet) — pratique standard en banque.

## Releases : un zip par version (`scripts/release.ps1`)

```powershell
.\scripts\release.ps1 -Version 1.0.0
# → releases\RegReport-v1.0.0.zip
```

Le script : build le front avec `VITE_API_BASE_URL=/api`, publie l'API en
**self-contained** (aucune installation .NET requise sur la cible), copie le
front dans `wwwroot/` (**l'API sert le front elle-même** — une seule origine,
plus de CORS), joint les scripts SQL gardés (`sql/`) et un `VERSION.txt`
(version + commit + date). Les `appsettings.*.local.json` ne sont jamais
embarqués.

**Déployer une release** sur la machine cible (aucun internet requis) :
1. Dézipper, p.ex. dans `C:\Apps\RegReport\v1.0.0\`.
2. Poser à côté de l'exe le fichier de la machine
   `appsettings.Production.local.json` (connection strings RegReport +
   Mercury, `Security:Mode`, `AdminUsers`…) — il survit aux mises à jour
   puisqu'il n'est pas dans le zip : le copier depuis la version précédente.
3. Exécuter les scripts `sql/` si la version en ajoute (ils sont gardés par
   des `IF OBJECT_ID(...) IS NULL` — sans risque de les rejouer).
4. Lancer `RegReport.Api.exe` — l'app complète est sur
   `http://localhost:5000` (ou l'URL configurée dans `Kestrel`/`Urls`).

**En service Windows** (démarrage automatique) :
```powershell
sc.exe create RegReport binPath= "C:\Apps\RegReport\v1.0.0\RegReport.Api.exe" start= auto
sc.exe start RegReport
```
Mise à jour = dézipper la nouvelle version dans un dossier `v1.0.1`, copier le
`appsettings.Production.local.json`, arrêter le service, repointer le
`binPath` (ou utiliser un dossier `current` recopié), redémarrer. Retour
arrière = repointer l'ancien dossier. IIS (module ASP.NET Core) fonctionne
aussi si c'est le standard maison — même dossier publié.

**Versionner** : `git tag v1.0.0 && git push origin v1.0.0` après chaque
release — `VERSION.txt` relie le zip au commit exact.

## Vérification

Après build : `grep -r "https://" dist/index.html dist/assets/*.js` ne doit
remonter aucune URL de CDN (googleapis, unpkg, jsdelivr, cdn.*). Test ultime :
servir `dist/` sur un poste en coupant le réseau externe — l'app doit se
charger et lire les fichiers Excel normalement.
