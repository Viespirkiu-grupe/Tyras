# 6. Geographic monopoly / local capture

## Description

Geographic capture occurs when a single supplier dominates procurement within a specific municipality or region,
effectively eliminating competition through repeated wins and the progressive exclusion of alternative bidders.

- **Tools:** `search_sutartys`, `get_juridinis`, `execute_query`
- **Goal:** Detect single-supplier dominance in one municipality or CPV category.
- **Supervisory authorities:** STT, VK, VPT
- **OSINT sources:** local media, municipal council decisions

## To Detect

- Value share by supplier per municipality and CPV over multi-year periods.
- Competitors who stopped bidding or winning over time after one supplier begins to dominate.
- Local registration bias (buyer awarding mostly to locally registered companies despite national markets).
- Officer→supplier PINREG connections for local officials.

## SQL Examples

```sql
-- Supplier capturing >70% of a single buyer's total contract value (local dominance signal)
WITH buyer_totals AS (SELECT "perkanciosiosOrganizacijosKodas", SUM(verte) AS totalVerte
                      FROM sutartys
                      WHERE istrinta = false
                        AND "sudarymoData" >= CURRENT_DATE - INTERVAL '5 years'
                      GROUP BY 1
                      HAVING SUM(verte) > 500000),
     supplier_share AS (SELECT "perkanciosiosOrganizacijosKodas",
                               "tiekejoKodas",
                               SUM(verte) AS supplierVerte,
                               COUNT(*)   AS kiekis
                        FROM sutartys
                        WHERE istrinta = false
                          AND "sudarymoData" >= CURRENT_DATE - INTERVAL '5 years'
                        GROUP BY 1, 2)
SELECT ss."perkanciosiosOrganizacijosKodas"               AS pirkejoKodas,
       buyer.pavadinimas                                  AS pirkejas,
       ss."tiekejoKodas",
       supplier.pavadinimas                               AS tiekejas,
       bt.totalVerte,
       ss.supplierVerte,
       ss.kiekis,
       ROUND(100.0 * ss.supplierVerte / bt.totalVerte, 1) AS rinkosDalisProc
FROM supplier_share ss
         JOIN buyer_totals bt ON bt."perkanciosiosOrganizacijosKodas" = ss."perkanciosiosOrganizacijosKodas"
         JOIN "jarCsv" buyer ON buyer."jarKodas"::text = ss."perkanciosiosOrganizacijosKodas"
JOIN "jarCsv" supplier
ON supplier."jarKodas":: text = ss."tiekejoKodas"
WHERE ss.supplierVerte / bt.totalVerte > 0.70
ORDER BY ss.supplierVerte DESC
LIMIT 30;
```
