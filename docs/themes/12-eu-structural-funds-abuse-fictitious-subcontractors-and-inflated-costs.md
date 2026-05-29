# 12. EU Structural Funds abuse — fictitious subcontractors and inflated costs

## Description

EU Structural Funds abuse involves the use of fictitious or low-capacity subcontractors to channel programme funds to
connected parties, or the inflation of declared project costs beyond actual expenditure, exploiting weaker oversight in
complex multi-party funding chains.

- **Tools:** `execute_query`, `get_juridinis`, `get_pinreg_jar`
- **Goal:** Detect fictitious subcontractors and pass-through schemes in CPVA-funded contracts.
- **Supervisory authorities:** FNTT, VK, STT
- **OSINT sources:** EU project registers, agency reports

## To Detect

- Subcontractor Sodra headcount vs. project obligations.
- Main contractor pass-through signal (low margins, fees mostly passed to subcontractor, or vice versa).
- Recurring contractor+subcontractor pairs across projects with similar scope.
- Shared PINREG persons between contractor and subcontractor.
- Mismatches between declared procurement procedures and EU rules in audit reports.

## SQL Examples

```sql
-- CPVA-funded contracts with very low supplier headcount (fictitious capacity signal)
SELECT cs."projektoNr",
       cs."pirkimoNrCvpis",
       cs."tiekejoKodas",
       j.pavadinimas                               AS tiekejas,
       j."registravimoData",
       cs."pirkimoSutartiesSumaSusijusiSuProjektu" AS sutartisSuma,
       sod.draustieji,
       sod."vidutinisAtlyginimas"
FROM "cpvaProjektuSutartys" cs
         JOIN "jarCsv" j ON j."jarKodas"::text = cs."tiekejoKodas"
JOIN LATERAL (
    SELECT draustieji, "vidutinisAtlyginimas"
    FROM sodra WHERE "jarKodas" = cs."tiekejoKodas" ORDER BY data DESC LIMIT 1
) sod
ON true
WHERE sod.draustieji
    < 5
  AND cs."pirkimoSutartiesSumaSusijusiSuProjektu"
    > 100000
ORDER BY cs."pirkimoSutartiesSumaSusijusiSuProjektu" DESC
LIMIT 30;
```

```sql
-- Recurring contractor + subcontractor pairs across multiple EU-funded projects
SELECT cs1."tiekejoKodas"                                AS pagrindinisKodas,
       j1.pavadinimas                                    AS pagrindinisRangovas,
       cs2."tiekejoKodas"                                AS papildomasKodas,
       j2.pavadinimas                                    AS papildomasRangovas,
       COUNT(DISTINCT cs1."projektoNr")                  AS projektaiKartu,
       SUM(cs1."pirkimoSutartiesSumaSusijusiSuProjektu") AS bendraPagrindinoVerte
FROM "cpvaProjektuSutartys" cs1
         JOIN "cpvaProjektuSutartys" cs2
              ON cs2."projektoNr" = cs1."projektoNr" AND cs2."tiekejoKodas" <> cs1."tiekejoKodas"
         JOIN "jarCsv" j1 ON j1."jarKodas"::text = cs1."tiekejoKodas"
JOIN "jarCsv" j2
ON j2."jarKodas":: text = cs2."tiekejoKodas"
GROUP BY cs1."tiekejoKodas", j1.pavadinimas, cs2."tiekejoKodas", j2.pavadinimas
HAVING COUNT(DISTINCT cs1."projektoNr") >= 3
ORDER BY projektaiKartu DESC
LIMIT 30;
```
