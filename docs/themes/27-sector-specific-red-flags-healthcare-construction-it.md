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
-- Healthcare (CPV 33xxx): tenders with single bidder only — limited competition signal
SELECT vp."pirkimoId",
       vp.pavadinimas,
       a."pirkimoObjektoPavadinimas",
       vp."numatomaVerteEUR"   AS verteEur,
       COUNT(DISTINCT d.kodas) AS dalyviuKiekis
FROM "viesiejiPirkimai" vp
         JOIN "atn1ataskaitos" a ON a."pirkimoNumeris" = vp."pirkimoId"
         JOIN "atn1dalyviai" d ON d."ataskaitaId" = a.id
WHERE EXISTS (SELECT 1 FROM unnest(vp."bvpzKodai") c WHERE c LIKE '33%')
GROUP BY vp."pirkimoId", vp.pavadinimas, a."pirkimoObjektoPavadinimas", vp."numatomaVerteEUR"
HAVING COUNT(DISTINCT d.kodas) = 1
   AND vp."numatomaVerteEUR" > 30000
ORDER BY verteEur DESC
LIMIT 30;
```

```sql
-- IT sector (CPV 72xxx): same supplier winning repeatedly from same buyer across 5+ years (lock-in signal)
SELECT s."perkanciosiosOrganizacijosKodas"                                                 AS pirkejoKodas,
       jb.pavadinimas                                                                      AS pirkejas,
       s."tiekejoKodas",
       js.pavadinimas                                                                      AS tiekejas,
       COUNT(*)                                                                            AS sutarciuKiekis,
       SUM(s.verte)                                                                        AS totalVerte,
       MIN(EXTRACT(YEAR FROM s."sudarymoData"))                                            AS pirmiMetai,
       MAX(EXTRACT(YEAR FROM s."sudarymoData"))                                            AS paskutiMetai,
       MAX(EXTRACT(YEAR FROM s."sudarymoData")) - MIN(EXTRACT(YEAR FROM s."sudarymoData")) AS metaiAktyvus
FROM sutartys s
         JOIN "jarCsv" jb ON jb."jarKodas"::text = s."perkanciosiosOrganizacijosKodas"
JOIN "jarCsv" js
ON js."jarKodas":: text = s."tiekejoKodas"
    JOIN "viesiejiPirkimai" vp ON vp."pirkimoId" = s."pirkimoNumeris"
WHERE EXISTS (SELECT 1 FROM unnest(vp."bvpzKodai") c WHERE c LIKE '72%') AND s.istrinta = false
GROUP BY s."perkanciosiosOrganizacijosKodas", jb.pavadinimas, s."tiekejoKodas", js.pavadinimas
HAVING COUNT(*) >= 5 AND MAX(EXTRACT(YEAR FROM s."sudarymoData")) - MIN(EXTRACT(YEAR FROM s."sudarymoData")) >= 5
ORDER BY totalVerte DESC
LIMIT 30;
```
