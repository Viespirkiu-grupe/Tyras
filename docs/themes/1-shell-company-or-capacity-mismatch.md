# 1. Shell company / capacity mismatch

## Description

A shell company is a legal entity that exists only on paper, with no real operations, employees, or assets. A capacity
mismatch occurs when a supplier wins contracts that exceed their apparent ability to deliver, based on headcount, wages,
and operational footprint.

- **Tools:** `get_juridinis`, `execute_query`, `search_sutartys`
- **Goal:** Detect capacity mismatch — supplier headcount/wages insufficient for contract scope.
- **Supervisory authorities:** STT, FNTT, VPT
- **OSINT sources:** company websites, LinkedIn profiles, media reports on supplier operations or controversies.

## To Detect

- Headcount vs. total contract value over rolling windows (e.g. annual Sodra vs. cumulative contract obligations).
- Sodra wages vs. revenue proxies (when revenue fields/tax data become available) and vs. sector medians.
- Registration date vs. first contract win date (sudden large wins soon after incorporation, especially in high-risk CPV
  areas).
- Shared registered address count (same address used by many suppliers or linked to buyers).
- Lack of visible operational footprint: no website, no employees on LinkedIn, no office in OSINT sources while handling
  large/complex contracts.

## SQL Examples

```sql
-- Shell company: high recent contract value vs. near-zero headcount (capacity mismatch)
SELECT j."jarKodas",
       j.pavadinimas,
       j."registravimoData",
       sod.draustieji,
       sod."vidutinisAtlyginimas",
       stats.totalVerte,
       stats.kiekis,
       ROUND(stats.totalVerte / NULLIF(sod.draustieji, 0)) AS verteVienamdarbVienam
FROM "jarCsv" j
         JOIN (SELECT "tiekejoKodas", SUM(verte) AS totalVerte, COUNT(*) AS kiekis
               FROM sutartys
               WHERE istrinta = false
                 AND "sudarymoData" >= CURRENT_DATE - INTERVAL '3 years'
               GROUP BY "tiekejoKodas"
               HAVING SUM(verte) > 300000) stats ON stats."tiekejoKodas" = j."jarKodas"::text
JOIN LATERAL (
    SELECT draustieji, "vidutinisAtlyginimas"
    FROM sodra WHERE "jarKodas" = j."jarKodas"::text ORDER BY data DESC LIMIT 1
) sod
ON true
WHERE sod.draustieji < 5
ORDER BY stats.totalVerte DESC
LIMIT 30;
```

```sql
-- New company winning large contracts shortly after incorporation
SELECT j."jarKodas",
       j.pavadinimas,
       j."registravimoData",
       MIN(s."sudarymoData")                          AS pirmasSutartisData,
       (MIN(s."sudarymoData") - j."registravimoData") AS dienosPoRegistracijos,
       SUM(s.verte)                                   AS totalVerte
FROM "jarCsv" j
         JOIN sutartys s ON s."tiekejoKodas" = j."jarKodas"::text AND s.istrinta = false
GROUP BY j."jarKodas", j.pavadinimas, j."registravimoData"
HAVING (MIN(s."sudarymoData") - j."registravimoData")
     < 365
   AND SUM(s.verte)
     > 200000
ORDER BY dienosPoRegistracijos ASC
LIMIT 30;
```

## Followup

- STT typically sees capacity mismatch as part of sham competition, favouritism, or misuse of shell companies;
- FNTT will be interested when capacity mismatch is combined with suspicious financial flows (e.g. significant advances,
  cash withdrawals, or cross-border payments). When escalating to FNTT, attach summary tables of headcount vs.
  obligations and any OSINT on real operations.
