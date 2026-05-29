# 5. Contract splitting to avoid thresholds

## Description

Contract splitting involves artificially dividing a single procurement need into smaller contracts specifically to fall
below regulatory thresholds that would otherwise trigger more competitive procedures or EU-level publication
requirements.

- **Tools:** `search_sutartys`, `execute_query`
- **Goal:** Detect contract splitting to avoid competition thresholds. There are two distinct splitting risks:
- **Supervisory authorities:** STT, VPT, VK
- **OSINT sources:** local press about repetitive small contracts

## To Detect

- Contract value clusters just below thresholds (e.g. repeated contracts at 29 900 EUR).
- Same CPV recurring in small awards over short time to same supplier or related suppliers.
- Short time gaps between consecutive awards to same supplier or same CPV by same buyer.
- Fragmentation of a clearly homogeneous need (e.g. IT system development) into many small contracts.

## SQL Examples

```sql
-- Repeated small contracts just below €30 000 MVT threshold (same buyer-supplier-CPV trio)
SELECT s."perkanciosiosOrganizacijosKodas" AS pirkejoKodas,
       buyer.pavadinimas                   AS pirkejas,
       s."tiekejoKodas",
       supplier.pavadinimas                AS tiekejas, LEFT (s."bvpzKodas", 3) AS cpvGrupe, COUNT(*) AS sutarciuKiekis, SUM(s.verte) AS totalVerte, MAX(s.verte) AS maxVerte
FROM sutartys s
    JOIN "jarCsv" buyer
ON buyer."jarKodas":: text = s."perkanciosiosOrganizacijosKodas"
    JOIN "jarCsv" supplier ON supplier."jarKodas":: text = s."tiekejoKodas"
WHERE s.verte BETWEEN 20000
  AND 29999
  AND s.istrinta = false
  AND s."sudarymoData" >= CURRENT_DATE - INTERVAL '3 years'
GROUP BY 1, 2, 3, 4, 5
HAVING COUNT(*) >= 3
ORDER BY sutarciuKiekis DESC, totalVerte DESC
LIMIT 50;
```

```sql
-- Repeated contracts just below EU sub-central threshold (€215 000) — below-EU-threshold splitting signal
SELECT s."perkanciosiosOrganizacijosKodas" AS pirkejoKodas,
       buyer.pavadinimas                   AS pirkejas,
       s."tiekejoKodas",
       supplier.pavadinimas                AS tiekejas, LEFT (s."bvpzKodas", 3) AS cpvGrupe, COUNT(*) AS sutarciuKiekis, SUM(s.verte) AS totalVerte, MAX(s.verte) AS maxVerte
FROM sutartys s
    JOIN "jarCsv" buyer
ON buyer."jarKodas":: text = s."perkanciosiosOrganizacijosKodas"
    JOIN "jarCsv" supplier ON supplier."jarKodas":: text = s."tiekejoKodas"
WHERE s.verte BETWEEN 150000
  AND 214999
  AND s.istrinta = false
  AND s."sudarymoData" >= CURRENT_DATE - INTERVAL '3 years'
GROUP BY 1, 2, 3, 4, 5
HAVING COUNT(*) >= 2
ORDER BY totalVerte DESC
LIMIT 50;
```

```sql
-- Consecutive awards to same supplier within 30 days (splitting gap signal)
SELECT s1."perkanciosiosOrganizacijosKodas" AS pirkejoKodas,
       j_b.pavadinimas                      AS pirkejas,
       s1."tiekejoKodas",
       j_s.pavadinimas                      AS tiekejas, LEFT (s1."bvpzKodas", 3) AS cpvGrupe, s1."sudarymoData" AS data1, s2."sudarymoData" AS data2, s1.verte AS verte1, s2.verte AS verte2, (s2."sudarymoData" - s1."sudarymoData") AS tarposDienos
FROM sutartys s1
    JOIN sutartys s2
ON s2."perkanciosiosOrganizacijosKodas" = s1."perkanciosiosOrganizacijosKodas"
    AND s2."tiekejoKodas" = s1."tiekejoKodas"
    AND LEFT (s2."bvpzKodas", 3) = LEFT (s1."bvpzKodas", 3)
    AND s2."sudarymoData" > s1."sudarymoData"
    AND (s2."sudarymoData" - s1."sudarymoData") <= INTERVAL '30 days'
    AND s2."sutartiesUnikalusId" <> s1."sutartiesUnikalusId"
    JOIN "jarCsv" j_b ON j_b."jarKodas":: text = s1."perkanciosiosOrganizacijosKodas"
    JOIN "jarCsv" j_s ON j_s."jarKodas":: text = s1."tiekejoKodas"
WHERE s1.istrinta = false
  AND s2.istrinta = false
  AND s1.verte
    < 30000
  AND s2.verte
    < 30000
ORDER BY tarposDienos ASC
LIMIT 50;
```
