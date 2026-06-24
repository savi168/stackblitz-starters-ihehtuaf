# Documentation de l'application — RegReport

> Tableau de bord de **regulatory reporting** multi-entités : suivi, analyse et
> comparaison des KPI réglementaires (CET1, LCR, NSFR, Leverage Ratio), des
> échéances, des reportings quotidiens et des projets.

Ce document décrit, pas à pas, **comment l'application est construite** et
**comment l'utiliser**. Pour brancher un back-end .NET + SQL Server, voir
[`BACKEND.md`](./BACKEND.md).

---

## 1. Vue d'ensemble

| | |
|---|---|
| **Type** | Single Page Application (SPA) React, 100 % front-end |
| **Stack** | React 18 + TypeScript, Vite, Tailwind CSS, React Router (hash), Recharts |
| **Données** | Aujourd'hui : `localStorage` du navigateur. Demain : API REST (voir `BACKEND.md`) |
| **Export** | PDF des rapports KPI (jsPDF + html2canvas, chargés à la demande) |

L'application est **modulaire** : chaque page correspond à un module métier
indépendant, accessible depuis la barre de navigation.

---

## 2. Démarrage rapide

**Prérequis :** Node.js 18+

```bash
npm install      # installe les dépendances
npm run dev      # serveur de dev (http://localhost:5173)
npm run build    # build de production (dossier dist/)
npm run preview  # prévisualise le build
npm run lint     # vérification TypeScript (tsc --noEmit)
```

---

## 3. Architecture des dossiers

```
src/
├── App.tsx                 # Routeur + layout global (header, footer). Pages en lazy-loading.
├── index.tsx               # Point d'entrée React (montage du DOM)
├── index.css               # Tailwind + styles de base (puces EFG, animations)
├── theme.ts                # Palette de couleurs centrale (source de vérité des charts)
├── types.ts                # Tous les types métier (le "modèle de données")
├── constants.ts            # Données initiales (seed) chargées au premier lancement
├── utils.ts                # Calculs KPI (ratios, waterfalls) et formatage
├── components.tsx          # Composants UI + charts partagés
├── context/
│   └── DataContext.tsx     # État global + persistance (via le repository)
├── services/
│   ├── dataRepository.ts   # Couche d'accès aux données (localStorage OU API)
│   └── diagnosisService.ts # Contrôles de cohérence sur les données KPI
└── pages/                  # Un composant par route (voir §6)
```

---

## 4. Le flux de données (important)

C'est le cœur de l'application. Tout passe par un **état central unique**.

```
constants.ts (seed)
      │
      ▼
dataRepository.load() ──► DataContext (state: CentralData) ──► useData() ──► Pages
      ▲                            │
      │                            ▼ (modification utilisateur via setData)
dataRepository.save() ◄──── persistance auto (debounce 400 ms)
```

1. **Au démarrage**, `DataProvider` (dans `context/DataContext.tsx`) appelle
   `dataRepository.load()`. Le repository choisit sa source selon la variable
   d'environnement `VITE_API_BASE_URL` :
   - vide → **mode local** : lecture depuis `localStorage` (ou le seed
     `constants.ts` au tout premier lancement) ;
   - renseignée → **mode API** : `GET {VITE_API_BASE_URL}/data`.
2. Les données sont stockées dans un seul objet `CentralData` exposé par le
   contexte via le hook **`useData()`**.
3. Chaque page lit `data` et le modifie via **`setData(...)`**.
4. À chaque modification, un effet **persiste automatiquement** (debounce de
   400 ms) via `dataRepository.save()` — donc `localStorage.setItem` en local,
   ou `PUT {VITE_API_BASE_URL}/data` en mode API.

> 👉 Aucun composant ne connaît la source des données. Pour passer au back-end,
> on ne change **que** `VITE_API_BASE_URL` (voir `BACKEND.md`).

### Le hook `useData()`

```ts
const {
  data,            // CentralData : toutes les données de l'app
  setData,         // pour modifier les données
  allEntities,     // string[] : entités présentes (dérivé)
  allDates,        // string[] : dates présentes (dérivé, triées desc.)
  getKpisForDate,  // (entity, date, currency?) => CalculatedKpis | null
  isLoading,       // chargement initial en cours
  loadError,       // erreur de chargement (mode API)
  mode,            // 'local' | 'api'
} = useData();
```

---

## 5. Le modèle de données (`types.ts`)

L'objet central est `CentralData` :

| Champ | Type | Description |
|---|---|---|
| `kpisHistory` | `KpiHistoryEntry[]` | Historique des données brutes par entité/date (capital, RWA, liquidité par devise) |
| `deadlines` | `Deadline[]` | Échéances réglementaires et internes (statut, historique, pièces jointes) |
| `bilan` | `Bilan` | Répartition du bilan par devise |
| `riskAppetite` | `RiskAppetite` | Seuils red/amber par KPI et par entité |
| `counterpartyRwa` | `CounterpartyRwa[]` | RWA par contrepartie/industrie |
| `largeExposures` | `LargeExposure[]` | Grands risques vs limites |
| `team` | `TeamMember[]` | Annuaire de l'équipe |
| `projects` / `projectTasks` | `Project[]` / `ProjectTask[]` | Projets et leurs tâches |
| `diagnosisResults` | `Record<string, DiagnosisResult[]>` | Résultats des contrôles de cohérence (clé `entity|date`) |

### KPI : données brutes vs données calculées

- **`KpiHistoryEntry`** = ce qui est saisi/importé (capital CET1, RWA crédit /
  marché / opérationnel, exposition, liquidité HQLA/NCO par devise…).
- **`CalculatedKpis`** = ce qui est dérivé par `calculateKpis()` (`utils.ts`) :
  - `cet1 = cet1Capital / rwaTotal × 100`
  - `lcr = hqla / netCashOutflows × 100`
  - `nsfr = asf / rsf × 100`
  - `leverage = tier1 / exposure × 100`

C'est `getKpisForDate(entity, date, currency)` qui fait le pont entre les deux.

---

## 6. Les modules (pages), pas à pas

| Route | Fichier | Rôle |
|---|---|---|
| `/` | `HubPage.tsx` | Accueil : aperçu chiffré, accès aux modules, vue brute des données |
| `/details` | `KpiDetailsPage.tsx` | Analyse KPI : tendances, seuils, waterfalls, export PDF |
| `/daily-reports` | `DailyReportsPage.tsx` | Reportings quotidiens LCR & grands risques |
| `/deadlines` | `DeadlinesPage.tsx` | Calendrier et suivi des échéances |
| `/projects` + `/projects/:id` | `ProjectsPage.tsx`, `ProjectDetailPage.tsx` | Projets et tâches |
| `/team` | `TeamPage.tsx` | Annuaire de l'équipe |
| `/business-case` | `BusinessCasePage.tsx` | Argumentaire ROI |
| `/datamanagement` | `DataManagementPage.tsx` | Administration : import/export CSV & JSON, contrôles |

### 6.1 Accueil (`/`)
Cartes de statistiques (entités, échéances, projets, équipe), bannière d'alerte
si des échéances arrivent à 7 jours, grille des modules, et zone "base de
données centralisée" (copie du JSON).

### 6.2 KPI Analysis (`/details`)
Le module le plus riche :
- Sélection **entité / date / devise / période** et **date de comparaison**.
- Onglets **Overview / Capital / Liquidity**.
- Cartes KPI avec **seuils risk-appetite** (red/amber/green) et graphes
  d'évolution.
- **Waterfalls** : évolution du ratio CET1, du RWA, du LCR entre deux dates.
- Tables de composition (capital CET1, RWA), top contreparties.
- **Export PDF** du rapport affiché (bouton "Export"). jsPDF et html2canvas
  sont chargés dynamiquement uniquement à ce moment-là.

### 6.3 Daily Reports (`/daily-reports`)
Suivi quotidien/hebdomadaire du LCR et des grands risques pour les entités clés.

### 6.4 Deadlines (`/deadlines`)
Liste triable et calendrier visuel ; chaque échéance a un statut
(`completed` / `inprogress` / `upcoming`), un historique de changements et des
pièces jointes. Calcul de l'échéance réglementaire (+10 jours ouvrés).

### 6.5 Projects (`/projects`)
Liste des projets ; le détail (`/projects/:id`) affiche les tâches
(`To Do` / `In Progress` / `Done`) et leurs assignations.

### 6.6 Data Management (`/datamanagement`)
- **Import** CSV/JSON pour KPI, liquidité, contreparties, grands risques…
  (modes *replace* ou *append/merge*).
- **Export** des données.
- **Diagnostic** via `diagnosisService.ts` (variations anormales, densité RWA
  élevée, valeurs négatives suspectes…).
- Réinitialisation des données (`localStorage.removeItem`).

---

## 7. Le système de design (style "EFG")

La charte visuelle s'inspire d'une présentation corporate de banque privée :
sobre, aérée, titres en graisse légère, une seule couleur d'accent (rouge
profond) utilisée avec parcimonie.

- **Palette** : définie une seule fois dans **`src/theme.ts`** (`PALETTE`,
  `CHART_COLORS`, `STATUS_COLORS`) et reflétée par **nom** dans
  `tailwind.config.js` (`brand-primary`, `brand-secondary`, `efg-steel`…).
  → Pour changer toute l'identité visuelle, modifier ces deux fichiers.
- **Composants de mise en page** (`components.tsx`) :
  - `PageHeader` — titre de page (léger) + sous-titre + filet.
  - `SectionHeader` — titre de section avec filet, façon slide
    (`title` + suffixe muet type `(in CHF mn)`).
  - `BulletList` — liste à puces carrées rouges ("Key highlights").
  - `Card`, `Modal`, `InfoBox`, `Select`, `TabButton`, `SortableHeader`.
- **Charts** (Recharts) : toutes les couleurs viennent de `CHART_COLORS` /
  `PALETTE`. Grilles en filet clair, rouge réservé à l'emphase / aux totaux.

---

## 8. Persistance & réinitialisation

- **Mode local** : les données vivent dans `localStorage` sous la clé
  `regReportData`. Vider le cache du navigateur (ou "Reset" dans Admin) revient
  au seed de `constants.ts`.
- **Mode API** : voir [`BACKEND.md`](./BACKEND.md).

---

## 9. Conventions & bonnes pratiques

- **TypeScript strict** : `npm run lint` doit rester vert.
- **Lazy-loading** : chaque page est un chunk séparé (`React.lazy` dans
  `App.tsx`). Les libs lourdes (jsPDF, html2canvas) sont importées
  dynamiquement.
- **Couleurs** : ne jamais coder un hex en dur dans un composant — utiliser
  `theme.ts` (charts) ou les tokens Tailwind `brand-*` (classNames).
- **Données** : toujours passer par `useData()` / `setData()`, jamais lire
  `localStorage` directement depuis une page.
