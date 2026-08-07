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

## Vérification

Après build : `grep -r "https://" dist/index.html dist/assets/*.js` ne doit
remonter aucune URL de CDN (googleapis, unpkg, jsdelivr, cdn.*). Test ultime :
servir `dist/` sur un poste en coupant le réseau externe — l'app doit se
charger et lire les fichiers Excel normalement.
