# 8. Price anomalies — over-invoicing and scope creep

## Description

Over-invoicing and scope creep occur when the actual contract execution value significantly exceeds the originally
signed value, suggesting fraudulent amendments, inflated invoices, or unauthorised expansion of contract scope after
award.

- **Tools:** `search_sutartys`, `get_sutartis`, `execute_query`
- **Goal:** Detect contracts where `faktineIvykdimoVerte` significantly exceeds signed `verte` or where unit prices
  appear inflated.
- **Supervisory authorities:** STT, FNTT, VK
- **OSINT sources:** market price benchmarks

## To Detect

- Average `faktineIvykdimoVerte/verte` ratio by supplier, buyer, CPV, and procedure type.
- Overruns >50% and clustering of high-overrun cases by supplier or buyer.
- Low-bid-then-inflate patterns where the same supplier frequently wins as the cheapest, then exhibits large amendments.
- For homogeneous goods, systematic per-unit price differences vs. national average.

## SQL Examples

```sql
-- Contracts where actual execution value exceeds signed value by >50% (overrun outliers)
SELECT s."sutartiesUnikalusId",
       s.pavadinimas,
       s."bvpzKodas",
       s."sudarymoData",
       s."perkanciosiosOrganizacijosKodas"                     AS pirkejoKodas,
       buyer.pavadinimas                                       AS pirkejas,
       s."tiekejoKodas",
       supplier.pavadinimas                                    AS tiekejas,
       s.verte,
       s."faktineIvykdimoVerte",
       ROUND(s."faktineIvykdimoVerte" / NULLIF(s.verte, 0), 2) AS vertuSantykis
FROM sutartys s
         JOIN "jarCsv" buyer ON buyer."jarKodas"::text = s."perkanciosiosOrganizacijosKodas"
JOIN "jarCsv" supplier
ON supplier."jarKodas":: text = s."tiekejoKodas"
WHERE s."faktineIvykdimoVerte"
    > s.verte * 1.5
  AND s.verte
    > 50000
  AND s.istrinta = false
ORDER BY vertuSantykis DESC
LIMIT 50;
```
