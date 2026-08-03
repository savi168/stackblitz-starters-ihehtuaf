# Intégration MERCURY — alimentation des contrôles de production

L'app alimente les tables de contrôle (`ProdCounterparties`, `ProdSecurities`)
directement depuis la base **MERCURY**, déclenchée depuis *Production →
Prerequisites → Feed from MERCURY* en choisissant le **loadid** et le **type de
produit**. Le contrat est volontairement simple :

```
Front (Production)  →  POST /api/production/mercury/load   →  SELECT * FROM <TVF>(@loadId, @productType)
                        { target, entity, date,                sur la connexion MERCURY
                          loadId, productType, dataset }    →  remplace le périmètre dans RegReport
```

**La TVF vit côté MERCURY et encapsule le modèle** (jointures
`core_positions × list_counterparty`, filtres par loadid/produit…). L'API ne
connaît que le nom de la TVF et le contrat de colonnes ci-dessous — quand le
modèle MERCURY évolue, on adapte la TVF, pas l'application.

## 1. Configuration (appsettings.Development.local.json)

```json
{
  "ConnectionStrings": {
    "Default": "…RegReport…",
    "Mercury": "Server=localhost;Database=MERCURY;Trusted_Connection=True;TrustServerCertificate=True"
  },
  "Production": {
    "Sources": {
      "counterparties": "dbo.fn_regreport_prod_counterparties",
      "securities": "dbo.fn_regreport_prod_securities"
    }
  }
}
```

`GET /api/production/mercury/status` indique si la connexion est configurée et
joignable.

## 2. Contrat de colonnes des TVF

Les noms de colonnes sont insensibles à la casse ; toute colonne absente est
importée vide/NULL. Les lignes sans clé (ClientNumber / Isin) sont ignorées.

### `fn_regreport_prod_counterparties(@loadId nvarchar, @productType nvarchar NULL)`

| Colonne | Type | Rôle |
|---|---|---|
| `Dataset` | nvarchar | `liquidityAssets` \| `dueFromBanks` \| `dueToBanks` \| `dueFromCustomers` \| `dueToCustomers` \| `mortgages` (sinon le dataset choisi dans l'app est appliqué) |
| `ClientNumber` (ou `CounterpartyId`) | nvarchar | **clé** |
| `ClientType` | nvarchar | type client du data model |
| `GroupLexId` | nvarchar | ultimate parent |
| `CounterpartyType` | nvarchar | retail bank, financial… |
| `IssuerRating` (ou `Rating`) | nvarchar | |
| `Amount` | float | mCHF |
| `Currency` | nvarchar | |

### `fn_regreport_prod_securities(@loadId nvarchar, @productType nvarchar NULL)`

| Colonne | Type |
|---|---|
| `Isin` | **clé** |
| `SecurityMaster`, `SecurityType`, `Rating` | nvarchar |
| `DailyReval` | bit / 0-1 / 'true' |
| `IssuerLexId`, `GuarantorLexId`, `GuarantorName`, `HqlaLevel` | nvarchar |
| `Amount` | float |

## 3. TVF sur le modèle Quadrum Data Lake

Les TVF **écrites sur le modèle réel** (doc `docs/mercury-model/`) sont dans
**`docs/SQL_MERCURY_TVFS.sql`** — jointures `core_positions ×
list_counterparties` (Id + PointInTime) et `core_positions × list_securities ×
list_counterparties` (issuer + guarantor), GroupLEXId comme ultimate parent,
HQLACategory comme niveau HQLA calculé par les règles QDL. Points à ajuster
dans le CASE des datasets : préfixes `LegalAccountNumber` et SubType hypothèque.

L'exemple générique ci-dessous illustre seulement le principe :

```sql
CREATE FUNCTION dbo.fn_regreport_prod_counterparties
    (@loadId nvarchar(64), @productType nvarchar(64) = NULL)
RETURNS TABLE
AS RETURN
SELECT
    CASE p.product_family                       -- à mapper sur les 6 datasets
        WHEN 'LIQ'  THEN 'liquidityAssets'
        WHEN 'DFB'  THEN 'dueFromBanks'
        WHEN 'DTB'  THEN 'dueToBanks'
        WHEN 'LOAN' THEN 'dueFromCustomers'
        WHEN 'DEP'  THEN 'dueToCustomers'
        WHEN 'MORT' THEN 'mortgages'
    END                        AS Dataset,
    p.counterpartyid           AS ClientNumber,
    c.client_type              AS ClientType,
    c.grouplexid               AS GroupLexId,   -- ultimate parent (list_counterparty)
    c.counterparty_type        AS CounterpartyType,
    c.issuer_rating            AS IssuerRating,
    p.amount_chf / 1000000.0   AS Amount,
    p.currency                 AS Currency
FROM core_positions p
JOIN list_counterparty c ON c.counterpartyid = p.counterpartyid
WHERE p.loadid = @loadId
  AND (@productType IS NULL OR p.product_type = @productType);
```

Même principe pour `fn_regreport_prod_securities` (security master, rating,
reval, garant, HQLA level).

## 4. Boucle de production

1. Chaque période : *Production → Feed from MERCURY* → loadid + product type →
   les tables de contrôle sont remplacées pour la période.
2. Onglet *Controls* : C1 (dérive par client vs période précédente),
   C2 (un traitement par grouplexid), C3 (dérive par ISIN), C4 (physique vs
   référentiel garantie/HQLA) — automatiques dès que les données sont là.
3. Le CSV manuel reste disponible en secours (mêmes tables, mêmes contrôles).

## 5. Module Adjustments — règles convenues (onglet *Production → Adjustments*)

Sources : `docs/mercury-model/adjustments-sample.xlsx` (lignes compta : LIGNE,
REFERENCE, MONTANT, NOMINAL, CCY, CATEG, IND, CLIENT, DEBIT/CREDIT…) et
`docs/mercury-model/Mapping.xlsb` (Mapping_GL_BALANCESHEET, CCY, Maping
RT01→QDL, INDUSTRY).

**Rapprochement d'une ligne d'ajustement avec core_positions (du load choisi)** :

1. Candidats par clé composite LIKE :
   `(InternalReference1 LIKE '%<REFERENCE>%' OR ContractId LIKE '%<REFERENCE>%')`
   `AND CounterpartyId LIKE '%<CLIENT>%'`
2. Plusieurs candidats sont fréquents → désambiguïsation par
   `LegalAccountNumber = Mapping_GL_BALANCESHEET[LIGNE].LegalAccountNumber`
   (c'est le mapping qui dit quelle ligne on veut construire/ajuster depuis
   l'instruction de base).
3. Un candidat → INSERT core_positions d'ajustement (attributs copiés,
   BookAmount = MONTANT signé DEBIT/CREDIT, conversion via la feuille CCY,
   Id suffixé -ADJ, DataSource = 'ADJUSTMENT').
   Plusieurs après désambiguïsation → choix utilisateur dans l'UI.
   Aucun → construction complète : LIGNE→Mapping_GL_BALANCESHEET (compte,
   cp_TypeOf, cp_SubType…), IND→INDUSTRY (TypeOf + EconomicActivityType),
   CATEG→Maping (RT01→QDL), contrepartie = CLIENT.
4. Tout passe par des scripts SQL préparés (SELECT de contrôle + INSERT) et le
   journal de décisions, comme les contrôles C1–C5.

**Implémentation** : onglet *Production → Adjustments* — upload du classeur de
mapping + du fichier d'ajustements, choix du loadid (core_loads), bouton
*Run matching* → `POST /api/production/mercury/adjustments/match` (clé LIKE
composite, TOP 25 candidats par ligne, flag `accountMatch` quand le
LegalAccountNumber du candidat = celui du mapping GL de la LIGNE). Candidat
unique ou seul ✓GL → présélectionné ; plusieurs → choix dans l'UI ; aucun →
INSERT de construction complète. Le bouton *Copy + log decision* journalise
la décision (contrôle `ADJ`) dans l'historique de l'onglet Controls.
Le mock (`SQL_MERCURY_MOCK.sql`) contient trois positions de test
(POS-ADJ-A/B/C, load 1002) alignées sur le fichier d'exemple
`adjustments-sample.xlsx` (références 5950216318 / 5900175308).

**Génération one-shot** : dès que le matching est résolu, deux exports —
un **.sql unique** (tous les INSERT, une seule exécution SSMS) et un
**Excel** (feuille Summary + feuille core_positions avec les lignes à insérer,
toutes colonnes, pour revue de masse / bulk import). Les lignes encore
ambiguës (candidat non choisi) sont exclues et signalées.

**Ligne manuelle** : panneau « Manual line » — choisir une LIGNE du mapping GL
(liste déroulante avec compte + description), montant signé, CCY, nominal,
référence/client/libellé optionnels → INSERT complet avec les défauts du
mapping, ou « Add to the lines » pour l'inclure dans le matching et le
one-shot.
