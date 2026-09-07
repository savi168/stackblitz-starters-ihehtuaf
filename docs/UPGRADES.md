# Releases & migrations de schéma — comment tes données survivent

## Le principe

Depuis cette version, l'API embarque un **migrateur de schéma**
(`backend/RegReport.Api/Data/SchemaMigrator.cs`) exécuté à **chaque
démarrage**, dans tous les environnements :

1. `EnsureCreated()` construit le schéma complet **uniquement si la base est
   vide** (première installation) ;
2. le migrateur applique ensuite, une par une, les **étapes d'évolution**
   (nouvelles tables, nouvelles colonnes) sur une base existante ;
3. chaque étape appliquée est enregistrée dans la table
   **`__SchemaMigrations`** (nom + horodatage) — audit et non-réexécution.

Règles que respecte chaque étape :

- **additive et idempotente** : `IF COL_LENGTH(...) IS NULL ALTER TABLE …`,
  `IF OBJECT_ID(...) IS NULL CREATE TABLE …` — re-exécutable sans risque ;
- **jamais de DROP**, jamais de réécriture de données existantes ;
- une colonne ajoutée est **NULLable** (ou a un DEFAULT), donc les lignes
  déjà présentes restent valides.

## Concrètement, lors d'une release

```
1. Sauvegarde de la base (BACKUP DATABASE RegReport …)   ← réflexe, pas une obligation
2. Déployer le nouveau zip / recompiler
3. Lancer RegReport.Api → le log affiche
   "Schema migration applied: 006_documents_new_field"
4. C'est tout — les données déjà saisies sont intactes
```

Ton exemple : dans 6 mois on ajoute un champ à la table `Documents`. La
release contiendra une étape `006_documents_xxx` avec
`IF COL_LENGTH('Documents','Xxx') IS NULL ALTER TABLE [Documents] ADD [Xxx] … NULL;`
— au premier démarrage la colonne apparaît, tous tes documents stockés
restent tels quels, et la nouvelle colonne se remplit au fil de l'usage.

## Et si une migration doit transformer des données ?

Pour les cas « complexes parce que structurels » (déplacer une colonne vers
une autre table, découper un champ…), l'étape de migration fera les deux dans
le même batch SQL, toujours gardé :

```sql
IF COL_LENGTH('NouvelleTable','X') IS NULL
BEGIN
    ALTER TABLE ... ADD ...;
    -- copie des données existantes, une seule fois :
    UPDATE n SET n.X = a.AncienChamp FROM ...;
END
```

La table `__SchemaMigrations` garantit qu'une transformation de données ne
tourne qu'une seule fois, même si tu redémarres l'API dix fois.

## Les scripts docs/SQL_*.sql

Ils restent dans le dépôt comme **équivalent manuel** (utile pour lire ce que
fait chaque étape, ou pour un DBA qui veut appliquer lui-même). Les étapes
`001…005` du migrateur couvrent exactement :

| Étape | Script équivalent |
|---|---|
| 001_production_tables | SQL_PRODUCTION_TABLES.sql |
| 002_documents | SQL_DOCUMENTS.sql |
| 003_bridge_adjustments | SQL_BRIDGE_ADJUSTMENTS.sql |
| 004_large_exposures_kler | SQL_LARGE_EXPOSURES.sql |
| 005_projects_module | SQL_PROJECTS.sql |

Si tu les as déjà exécutés à la main dans SSMS : aucun problème, les étapes
sont idempotentes — le migrateur les rejouera à vide, les marquera comme
appliquées, et n'y touchera plus.

## Prérequis / points d'attention

- Le compte Windows qui lance l'API doit avoir les droits **db_ddladmin**
  (ou db_owner) sur la base RegReport — c'est le cas chez toi.
- Si une étape échoue (droits manquants, base incohérente), l'API **refuse de
  démarrer** avec l'erreur dans le log — volontaire : mieux vaut un arrêt
  net qu'une application qui tourne sur un demi-schéma. Le script manuel
  correspondant dans `docs/` permet alors de corriger via SSMS.
- La **sauvegarde** reste ta ceinture de sécurité : `BACKUP DATABASE` avant
  une release majeure prend quelques secondes et couvre tout (y compris les
  documents de la Library, stockés en base).
