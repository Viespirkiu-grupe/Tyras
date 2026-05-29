# 17. Price cartel — suspiciously uniform bid prices across a CPV category

## Description

A price cartel is indicated when independent competing bidders in the same tender submit prices that are suspiciously
uniform, suggesting prior coordination on bid levels rather than independently determined competitive offers.

- **Tools:** `execute_query`
- **Goal:** Detect tenders with abnormally low price variation among independent bidders — a primary cartel signal. Also
  screen CPV categories nationally for uniformity as a secondary filter to identify categories warranting deeper
  per-tender analysis.
- **Supervisory authorities:** KT, STT
- **OSINT sources:** sector cost structures

## To Detect

> **Methodology note**: The correct unit of analysis for price cartel detection is the **individual tender** (comparing
> bids submitted by different suppliers within the same procurement). Computing CV across all tenders in a CPV group
> nationally conflates different buyers, specifications, years, and scales — the resulting CV tells you almost nothing
> about cartel behaviour. Use the per-tender query (first SQL below) as the primary detection method. The cross-tender
> national-average query (second SQL) is a coarse screening tool only; low national CV in commodity categories may be
> entirely normal.

- Coefficient of variation of bid prices **within individual tenders** (CV < 5% with ≥ 3 bidders is a strong signal).
- Repeat suppliers in tenders with suspiciously uniform prices.
- Clustering of low-variation tenders in certain buyers or regions.

## SQL Examples

```sql
-- PRIMARY: Per-tender CV of bid prices — low within-tender variation among ≥3 bidders is a cartel signal
SELECT e."ataskaitaId" AS pirkimasId,
       a."pirkimoNumeris", LEFT (vp."bvpzKodai"[1], 3) AS cpvGrupe, COUNT(e.id) AS pasiulymuKiekis, ROUND(AVG(e.kaina:: numeric), 0) AS vidutineKaina, ROUND(MIN(e.kaina:: numeric), 0) AS minKaina, ROUND(MAX(e.kaina:: numeric), 0) AS maxKaina, ROUND(STDDEV(e.kaina:: numeric) / NULLIF(AVG(e.kaina:: numeric), 0) * 100, 1) AS variacijosKoefProc
FROM "atn1pasiulymuEile" e
    JOIN "atn1ataskaitos" a
ON a.id = e."ataskaitaId"
    JOIN "viesiejiPirkimai" vp ON vp."pirkimoId" = a."pirkimoNumeris"
WHERE e.kaina ~ '^\d+(\.\d+)?$' AND vp."bvpzKodai" IS NOT NULL
GROUP BY e."ataskaitaId", a."pirkimoNumeris", LEFT (vp."bvpzKodai"[1], 3)
HAVING COUNT(e.id) >= 3
   AND STDDEV(e.kaina:: numeric) / NULLIF(AVG(e.kaina:: numeric)
     , 0) * 100
     < 5
ORDER BY variacijosKoefProc ASC
LIMIT 50;
```

```sql
-- SECONDARY SCREENING ONLY: Cross-tender CV by CPV group nationally (commodity-like categories
-- may show naturally low CV — always investigate individual tenders before drawing conclusions)
SELECT LEFT (vp."bvpzKodai"[1], 3) AS cpvGrupe, COUNT(DISTINCT e."ataskaitaId") AS pirkimuKiekis, COUNT(e.id) AS pasiulymuKiekis, ROUND(AVG(e.kaina:: numeric), 0) AS vidutineKaina, ROUND(STDDEV(e.kaina:: numeric) / NULLIF(AVG(e.kaina:: numeric), 0) * 100, 1) AS variacijosKoefProc
FROM "atn1pasiulymuEile" e
    JOIN "atn1ataskaitos" a
ON a.id = e."ataskaitaId"
    JOIN "viesiejiPirkimai" vp ON vp."pirkimoId" = a."pirkimoNumeris"
WHERE e.kaina ~ '^\d+(\.\d+)?$' AND vp."bvpzKodai" IS NOT NULL
GROUP BY LEFT (vp."bvpzKodai"[1], 3)
HAVING COUNT(DISTINCT e."ataskaitaId") >= 10 AND AVG(e.kaina:: numeric) > 0
ORDER BY variacijosKoefProc ASC
LIMIT 30;
```
