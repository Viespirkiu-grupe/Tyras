# 15. Framework agreement abuse — single-supplier call-offs

## Description

Framework agreement abuse occurs when all call-off contracts under a multi-supplier framework are concentrated with a
single supplier, undermining the competitive purpose of the framework and effectively converting it into a direct-award
mechanism.

- **Tools:** `search_sutartys`, `get_sutartis`, `execute_query`
- **Goal:** Detect framework agreements where all call-offs (`tipas = 'PPS'`) go to one supplier.
- **Supervisory authorities:** STT, VPT
- **OSINT sources:** framework establishment documentation

## To Detect

> **Important caveat**: A single-supplier framework established through an open competitive procedure is legal under
> Lithuanian and EU procurement law. This query flags all single-supplier frameworks regardless of how they were
> established. Always verify the procurement procedure used to set up the framework (`pirkimoBudas`) before treating
> single-supplier call-offs as suspicious.

- Distinct supplier count per framework vs. expected.
- Total value and duration of framework vs. call-off distribution.
- Framework establishment procedure type and competition level.
- Cross-check with single-bidder signals and direct awards.

## SQL Examples

```sql
-- Framework call-offs (tipas = 'PPS') concentrated to a single supplier per framework
SELECT s."pirkimoNumeris",
       s."perkanciosiosOrganizacijosKodas"             AS pirkejoKodas,
       buyer.pavadinimas                               AS pirkejas,
       COUNT(DISTINCT s."tiekejoKodas")                AS tiekejuKiekis,
       COUNT(*)                                        AS ppsKiekis,
       SUM(s.verte)                                    AS ppsVerte,
       STRING_AGG(DISTINCT supplier.pavadinimas, '; ') AS tiekejaiPav
FROM sutartys s
         JOIN "jarCsv" buyer ON buyer."jarKodas"::text = s."perkanciosiosOrganizacijosKodas"
JOIN "jarCsv" supplier
ON supplier."jarKodas":: text = s."tiekejoKodas"
WHERE s.tipas = 'PPS' AND s.istrinta = false AND s."pirkimoNumeris" IS NOT NULL
GROUP BY s."pirkimoNumeris", s."perkanciosiosOrganizacijosKodas", buyer.pavadinimas
HAVING COUNT(DISTINCT s."tiekejoKodas") = 1 AND COUNT(*) >= 3
ORDER BY ppsVerte DESC
LIMIT 30;
```
