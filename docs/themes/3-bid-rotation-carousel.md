# 3. Bid rotation / carousel

## Description

Bid rotation is a collusive scheme in which competing suppliers take turns winning contracts in the same CPV category,
dividing the market among themselves over time while avoiding simultaneous competition.

- **Tools:** `search_sutartys`, `execute_query`
- **Goal:** Detect companies alternating wins in same CPV — never competing simultaneously.
- **Supervisory authorities:** STT, KT
- **OSINT sources:** sector analysis, competitor structure

## To Detect

- Win value share by period per CPV for a small cluster of suppliers.
- Mutual bidding absence (A wins when B does not participate and vice versa).
- Cross-appearance as cover bidders for each other in other buyers' tenders.
- Rotation schemes aligned with calendar years, budget cycles, or EU funding phases.

## SQL Examples

```sql
-- Annual CPV group market share per supplier — detect alternating winner across years
WITH yearly AS (SELECT DATE_TRUNC('year', "sudarymoData")::date AS metai,
        LEFT("bvpzKodas", 3) AS cpvGrupe, "tiekejoKodas", SUM(verte) AS suma
                FROM sutartys
                WHERE istrinta = false AND "bvpzKodas" IS NOT NULL AND "sudarymoData" IS NOT NULL
                GROUP BY 1, 2, 3),
     grp AS (SELECT metai, cpvGrupe, SUM(suma) AS visoSuma
             FROM yearly
             GROUP BY 1, 2
             HAVING SUM(suma) > 500000)
SELECT y.metai,
       y.cpvGrupe,
       y."tiekejoKodas",
       j.pavadinimas                         AS tiekejas,
       y.suma,
       g.visoSuma,
       ROUND(100.0 * y.suma / g.visoSuma, 1) AS rinkosDalisProc
FROM yearly y
         JOIN grp g ON g.metai = y.metai AND g.cpvGrupe = y.cpvGrupe
         JOIN "jarCsv" j ON j."jarKodas"::text = y."tiekejoKodas"
ORDER BY y.cpvGrupe, y.metai, y.suma DESC
LIMIT 100;
```

## Followup

For human investigator: potential KT interest is high — bid rotation is classic cartel behaviour. STT may focus on cases
where rotation is driven by public officials' interference; KT focuses on competition law violations.
