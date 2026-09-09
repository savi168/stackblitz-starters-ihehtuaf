# RegReport — Procédure de release & mise à jour

Cette procédure couvre les deux modes de déploiement (zip Windows et Docker).
Dans les deux cas, la règle d'or est la même : **les données ne sont jamais
perdues** — le schéma de base est mis à niveau automatiquement au démarrage
de l'API (migrations additives et idempotentes, tracées dans la table
`__SchemaMigrations` — voir docs/UPGRADES.md du dépôt).

---

## 0. Avant toute release (2 minutes, non négociable)

1. **Sauvegarde de la base** — couvre tout, y compris les documents de la
   Library (stockés en base) :

    BACKUP DATABASE RegReport TO DISK = 'C:\Backups\RegReport_avant_vX.Y.Z.bak'

2. Noter la version actuellement en production (badge en haut à gauche de
   l'écran, ou Admin → System).

---

## 1. Préparer la release (côté développement)

1. Mettre à jour le numéro de version — **un seul endroit** :
   `src/version.ts` → `APP_VERSION = 'X.Y.Z'`.
2. Committer, puis construire le livrable :
   - **Mode zip** : `.\scripts\release.ps1` (la version est lue toute seule
     dans version.ts) → `releases\RegReport-vX.Y.Z.zip` ;
   - **Mode Docker** : `docker build -t regreport:X.Y.Z .` puis, si un
     registry est utilisé, `docker push <registry>/regreport:X.Y.Z`.
3. Le numéro se retrouve partout automatiquement : badge du header,
   VERSION.txt du zip, assembly de l'API, `GET /api/meta`.

---

## 2A. Mettre à jour — déploiement zip Windows

1. Copier le zip sur la machine cible.
2. **Arrêter l'API** : `Ctrl+C` dans sa fenêtre, ou
   `Stop-Process -Name RegReport.Api -Force`.
3. Renommer le dossier actuel (ex. `RegReport_old`) — c'est le rollback
   instantané — puis dézipper la nouvelle version au même endroit.
4. **Recopier `appsettings.Production.local.json`** depuis l'ancien dossier
   vers le nouveau (il contient les connexions et la sécurité de CETTE
   machine ; il n'est jamais dans le zip).
5. Relancer `RegReport.Api.exe`.
6. Dans la console, vérifier les éventuelles lignes
   `Schema migration applied: ...` — c'est la base qui se met à niveau.

## 2B. Mettre à jour — déploiement Docker

1. Sur la machine/plateforme : récupérer la nouvelle image
   (`docker pull <registry>/regreport:X.Y.Z`, ou `--build` en local).
2. Mettre à jour le tag d'image dans `docker-compose.yml` (ou la définition
   du déploiement), puis :

    docker compose up -d

   Le conteneur est stateless : il est remplacé, les données restent dans
   SQL Server. Coupure de service : quelques secondes.
3. `docker compose logs regreport` → vérifier les
   `Schema migration applied: ...`.

---

## 3. Vérifications après mise à jour (1 minute)

- [ ] Le **badge du header** affiche la nouvelle version et le bon
      environnement (PROD/TEST) ;
- [ ] **Admin → System** : version API identique, migrations appliquées
      listées avec la date du jour pour les nouvelles, MERCURY connecté ;
- [ ] **Admin → Data inventory** : les compteurs sont cohérents avec
      l'avant-release (aucun dataset tombé à zéro) ;
- [ ] Ouvrir le **Management Report** sur une entité connue : les chiffres
      sont là ;
- [ ] `Ctrl+F5` chez les utilisateurs si l'interface semble « d'avant »
      (cache navigateur).

---

## 4. Revenir en arrière (rollback)

Le schéma étant **additif** (les migrations ajoutent, ne suppriment jamais),
l'ancienne version de l'application fonctionne sur le nouveau schéma :

- **Zip** : arrêter l'API, remettre le dossier `RegReport_old`, relancer ;
- **Docker** : `docker compose up -d` avec l'ancien tag d'image.

La restauration de la sauvegarde (`RESTORE DATABASE`) n'est nécessaire que
si des **données** ont été abîmées — pas pour un simple retour de version.

---

## 5. Cas particuliers

- **Release majeure avec transformation de données** : le migrateur ne
  l'exécute qu'une seule fois (table `__SchemaMigrations`) — la note de
  release le signalera explicitement ; la sauvegarde de l'étape 0 est alors
  d'autant plus importante.
- **Échec d'une migration au démarrage** : l'API refuse volontairement de
  démarrer et le log nomme l'étape en cause ; le script SQL équivalent est
  dans `docs/` (dépôt) pour une correction manuelle via SSMS, puis relancer.
- **Plusieurs environnements** : toujours dérouler la release sur **TEST**
  d'abord (conteneur ou second dossier), vérifier la checklist, puis PROD.
