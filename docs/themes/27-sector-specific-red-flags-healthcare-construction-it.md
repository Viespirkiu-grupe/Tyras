# 27. Sector-specific red flags (healthcare, construction, IT)

## Description

Sector-specific red flags reflect the distinct fraud typologies prevalent in healthcare, construction, and IT
procurement, where market structure, technical complexity, and contract characteristics create unique opportunities for
manipulation that generic cross-sector queries may miss.

- **Tools:** `search_sutartys`, `search_viesieji_pirkimai`, `get_sutartis`, `execute_query`
- **Goal:** Tailor risk detection to sectors known in Lithuania to be high-risk for corruption and procurement
  violations (e.g. healthcare, construction, IT).
- **Supervisory authorities:** STT, FNTT, VK
- **OSINT sources:** sector regulators, professional bodies

## To Detect

- In healthcare: repeated purchases of branded medicines/devices with limited competition; unusual technical
  specifications in medical equipment tenders.
- In construction: repeated cost overruns, change orders, and low initial bids followed by many amendments.
- In IT: vendor lock-in patterns, proprietary standards, and recurrent single-supplier maintenance contracts.

## SQL Examples

```sql
-- Healthcare (CPV 33xxx): high-value contracts concentrated in one supplier per buyer — limited-competition candidates.
-- Bidder counts are not queryable; confirm single-bidding per procurement from the ATN-1 file (see note below).
SELECT s."pirkejoKodas",
       MAX(s.pirkejas)     AS pirkejas,
       s."tiekejoKodas",
       MAX(s.tiekejas)     AS tiekejas,
       COUNT(*)            AS sutarciuKiekis,
       ROUND(SUM(s.verte)) AS bendraVerte
FROM v_sutartys s
WHERE s.istrinta IS NOT TRUE
  AND LEFT(s."bvpzKodas", 2) = '33'
GROUP BY s."pirkejoKodas", s."tiekejoKodas"
HAVING COUNT(*) >= 3 AND SUM(s.verte) > 30000
ORDER BY bendraVerte DESC
LIMIT 30;
```

```sql
-- IT sector (CPV 72xxx): same supplier winning repeatedly from the same buyer across 5+ years (lock-in signal).
SELECT s."pirkejoKodas",
       MAX(s.pirkejas)                                                                     AS pirkejas,
       s."tiekejoKodas",
       MAX(s.tiekejas)                                                                     AS tiekejas,
       COUNT(*)                                                                            AS sutarciuKiekis,
       ROUND(SUM(s.verte))                                                                 AS totalVerte,
       MIN(EXTRACT(YEAR FROM s."sudarymoData"))                                            AS pirmiMetai,
       MAX(EXTRACT(YEAR FROM s."sudarymoData"))                                            AS paskutiMetai,
       MAX(EXTRACT(YEAR FROM s."sudarymoData")) - MIN(EXTRACT(YEAR FROM s."sudarymoData")) AS metaiAktyvus
FROM v_sutartys s
WHERE s.istrinta IS NOT TRUE AND LEFT(s."bvpzKodas", 2) = '72'
GROUP BY s."pirkejoKodas", s."tiekejoKodas"
HAVING COUNT(*) >= 5 AND MAX(EXTRACT(YEAR FROM s."sudarymoData")) - MIN(EXTRACT(YEAR FROM s."sudarymoData")) >= 5
ORDER BY totalVerte DESC
LIMIT 30;
```

> **Confirm limited competition per procurement.** For the top healthcare rows, `get_viesasis_pirkimas` →
> `get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)` and count `VI. DALYVIAI` — one bidder confirms a single-bidder
> tender (theme 28). The `bvpzKodas` prefix is a coarse CPV filter; refine sector boundaries with the `bvpzKodai`
> reference table where precision matters.
