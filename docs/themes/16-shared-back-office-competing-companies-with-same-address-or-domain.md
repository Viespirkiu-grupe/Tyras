# 16. Shared back-office — competing companies with the same address or domain

## Description

Shared back-office signals arise when companies that nominally compete against each other share the same registered
address, internet domain registrant, or other operational infrastructure, indicating coordination rather than genuine
rivalry.

- **Tools:** `search_juridiniai`, `get_juridinis`, `execute_query`
- **Goal:** Detect co-bidders sharing registered address or domain registrant.
- **Supervisory authorities:** STT, KT, FNTT
- **OSINT sources:** physical site checks, business registries

## To Detect

- Shared legal address in `jarCsv` among active bidders with wins.
- Shared domain in `domenai` among suppliers.
- Overlapping contract timelines and CPV categories.
- Cross-link with PINREG persons to strengthen suspicion.

## SQL Examples

```sql
-- Supplier pairs sharing the same registered address and appearing as co-bidders
SELECT j1.adresas,
       j1."jarKodas"                    AS kodas1,
       j1.pavadinimas                   AS pavadinimas1,
       j2."jarKodas"                    AS kodas2,
       j2.pavadinimas                   AS pavadinimas2,
       COUNT(DISTINCT d1."ataskaitaId") AS bendruPirkimuKiekis
FROM "jarCsv" j1
         JOIN "jarCsv" j2 ON j2.adresas = j1.adresas AND j2."jarKodas" > j1."jarKodas"
         JOIN "atn1dalyviai" d1 ON d1.kodas = j1."jarKodas"::text
JOIN "atn1dalyviai" d2
ON d2."ataskaitaId" = d1."ataskaitaId" AND d2.kodas = j2."jarKodas":: text
WHERE j1.adresas IS NOT NULL AND LENGTH(j1.adresas) > 10
GROUP BY j1.adresas, j1."jarKodas", j1.pavadinimas, j2."jarKodas", j2.pavadinimas
HAVING COUNT(DISTINCT d1."ataskaitaId") >= 2
ORDER BY bendruPirkimuKiekis DESC
LIMIT 30;
```

```sql
-- Competing suppliers sharing the same internet domain registrant (shared online infrastructure)
-- NOTE: this does NOT verify the companies co-bid; filter further to pairs that appeared as co-bidders.
SELECT d1."savininkoKodas"                AS registrantoKodas1,
       d1.savininkas,
       d1.domain                          AS domenas,
       j1."jarKodas"                      AS kodas1,
       j1.pavadinimas                     AS pavadinimas1,
       j2."jarKodas"                      AS kodas2,
       j2.pavadinimas                     AS pavadinimas2,
       COUNT(DISTINCT dal1."ataskaitaId") AS bendruPirkimuKiekis
FROM domenai d1
         JOIN domenai d2
              ON d2.domain = d1.domain AND d2."savininkoKodas" <> d1."savininkoKodas"
                  AND d2."savininkoKodas" > d1."savininkoKodas"
         JOIN "jarCsv" j1 ON j1."jarKodas"::text = d1."savininkoKodas"
JOIN "jarCsv" j2
ON j2."jarKodas":: text = d2."savininkoKodas"
-- Restrict to pairs that actually co-bid to eliminate noise
    JOIN "atn1dalyviai" dal1 ON dal1.kodas = j1."jarKodas":: text
    JOIN "atn1dalyviai" dal2
    ON dal2."ataskaitaId" = dal1."ataskaitaId" AND dal2.kodas = j2."jarKodas":: text
GROUP BY d1."savininkoKodas", d1.savininkas, d1.domain,
    j1."jarKodas", j1.pavadinimas, j2."jarKodas", j2.pavadinimas
HAVING COUNT(DISTINCT dal1."ataskaitaId") >= 2
ORDER BY bendruPirkimuKiekis DESC
LIMIT 50;
```
