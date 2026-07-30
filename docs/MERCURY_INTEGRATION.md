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

## 3. Squelette de TVF (à adapter au modèle réel)

> ⚠ Les noms de tables/colonnes MERCURY ci-dessous sont des **hypothèses** —
> à remplacer d'après la documentation du modèle.

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
