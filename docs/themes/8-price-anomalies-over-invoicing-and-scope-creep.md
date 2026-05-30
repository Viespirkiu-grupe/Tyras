# 8. Price anomalies — over-invoicing and scope creep

## Description

Over-invoicing and scope creep occur when the actual contract execution value significantly exceeds the originally
signed value, suggesting fraudulent amendments, inflated invoices, or unauthorised expansion of contract scope after
award.

- **Tools:** `search_sutartys`, `get_sutartis`, `execute_query`
- **Goal:** Detect contracts where `faktineIvykdimoVerte` significantly exceeds signed `verte`, where the
  **SABIS-invoiced total** exceeds the contract value, or where unit prices appear inflated.
- **Supervisory authorities:** STT, FNTT, VK
- **OSINT sources:** market price benchmarks

## To Detect

- Average `faktineIvykdimoVerte/verte` ratio by supplier, buyer, CPV, and procedure type.
- Overruns >50% and clustering of high-overrun cases by supplier or buyer.
- Low-bid-then-inflate patterns where the same supplier frequently wins as the cheapest, then exhibits large amendments.
- **Actual money paid exceeds the contract:** total SABIS-invoiced value (net of credit notes) materially above `verte`
  — a payment-level corroboration of over-invoicing that does not depend on the ~12%-populated `faktineIvykdimoVerte`.
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

```sql
-- Payment-level over-invoicing: actual SABIS-invoiced total (net of credit notes) exceeds the contract value.
-- See "SABIS payment-flow analysis" in the index: bridge v_sutartys → sabisSutartys.vpId → sabisSaskaitos.
-- Caveat: bendraSfSuma has unit/decimal errors; the 1.3–10× band filters absurd outliers — treat hits as LEADS and
-- inspect the underlying invoices before reporting any ratio.
SELECT v."sutartiesUnikalusId",
       v."tiekejoPavadinimas"                                  AS tiekejas,
       ROUND(v.verte)                                          AS sutartiesVerte,
       ROUND(SUM(si."bendraSfSuma"))                           AS sabisInvoiced,
       COUNT(*)                                                AS saskaituKiekis,
       ROUND(SUM(si."bendraSfSuma") / NULLIF(v.verte, 0), 2)   AS apmoketaSantykis
FROM v_sutartys v
         JOIN "sabisSutartys" sc ON sc."vpId" = v."sutartiesUnikalusId"::text
         JOIN "sabisSaskaitos" si ON si."sutartiesUid" = sc."sutartiesUid"
WHERE v.verte > 50000
  AND si."bendraSfSuma" > 0
  AND si."sfTipas" IS DISTINCT FROM 'Kreditinė sąskaita'
  AND si."israsymoData" BETWEEN '2010-01-01' AND CURRENT_DATE
GROUP BY v."sutartiesUnikalusId", v."tiekejoPavadinimas", v.verte
HAVING SUM(si."bendraSfSuma") BETWEEN v.verte * 1.3 AND v.verte * 10
ORDER BY (SUM(si."bendraSfSuma") - v.verte) DESC
LIMIT 30;
```
