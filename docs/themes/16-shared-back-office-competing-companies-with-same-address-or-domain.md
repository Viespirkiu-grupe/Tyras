# 16. Shared back-office — competing companies with the same address or domain

## Description

Shared back-office signals arise when companies that nominally compete against each other share the same registered
address, internet domain registrant, or other operational infrastructure, indicating coordination rather than genuine
rivalry.

- **Tools:** `search_juridiniai`, `get_juridinis`, `get_viesasis_pirkimas`, `get_failas_tekstas`, `execute_query`
- **Goal:** Detect competing suppliers that share a registered address or domain registrant, then confirm they bid in
  the same tenders.
- **Supervisory authorities:** STT, KT, FNTT
- **OSINT sources:** physical site checks, business registries

## To Detect

- Shared legal address in `jarCsv` among suppliers that win public contracts.
- Shared domain in `domenai` among suppliers.
- The same shared-infrastructure pair appearing as **co-bidders** in one tender (the corroborating step) — read from the
  tender's bidder list (`VI. DALYVIAI`) per procurement.
- Overlapping contract timelines and CPV categories.
- Cross-link with PINREG persons to strengthen suspicion.

## Method — find shared-infrastructure pairs in SQL, confirm co-bidding per procurement

Co-bidding is no longer queryable in aggregate. Find supplier pairs that share an address or domain **and** both supply
public contracts, then open the procurements they share to check whether they bid against each other.

```sql
-- Supplier pairs sharing the same registered address, where both actually supply public contracts.
-- (EXISTS / correlated subqueries are blocked by the query engine — join to the distinct supplier set instead.)
SELECT j1.adresas,
       j1."jarKodas"  AS kodas1,
       j1.pavadinimas AS pavadinimas1,
       j2."jarKodas"  AS kodas2,
       j2.pavadinimas AS pavadinimas2
FROM "jarCsv" j1
         JOIN "jarCsv" j2 ON j2.adresas = j1.adresas AND j2."jarKodas" > j1."jarKodas"
         JOIN (SELECT DISTINCT "tiekejoKodas" FROM v_sutartys WHERE istrinta IS NOT TRUE) t1
              ON t1."tiekejoKodas" = j1."jarKodas"::text
         JOIN (SELECT DISTINCT "tiekejoKodas" FROM v_sutartys WHERE istrinta IS NOT TRUE) t2
              ON t2."tiekejoKodas" = j2."jarKodas"::text
WHERE j1.adresas IS NOT NULL AND LENGTH(j1.adresas) > 10
ORDER BY j1.adresas
LIMIT 50;
```

```sql
-- Competing suppliers sharing the same internet domain registrant (shared online infrastructure).
SELECT d1."savininkoKodas" AS registrantoKodas1,
       d1.savininkas,
       d1.domain           AS domenas,
       j1."jarKodas"       AS kodas1,
       j1.pavadinimas      AS pavadinimas1,
       j2."jarKodas"       AS kodas2,
       j2.pavadinimas      AS pavadinimas2
FROM domenai d1
         JOIN domenai d2
              ON d2.domain = d1.domain AND d2."savininkoKodas" > d1."savininkoKodas"
         JOIN "jarCsv" j1 ON j1."jarKodas"::text = d1."savininkoKodas"
         JOIN "jarCsv" j2 ON j2."jarKodas"::text = d2."savininkoKodas"
ORDER BY d1.domain
LIMIT 50;
```

**Confirm co-bidding.** First query `v_dalyviai` for both codes:

```sql
-- Co-bidding confirmation from v_dalyviai (CVP IS procurements, ~400 available).
SELECT "pirkimoNumeris", "tiekejoKodas", tiekejas, "eileNumeris", "pasiulymoKaina"
FROM v_dalyviai
WHERE "tiekejoKodas" IN ('<kodas1>', '<kodas2>')
ORDER BY "pirkimoNumeris", "eileNumeris";
```

Procurements where both codes appear are confirmed co-bids. For procurements not in `v_dalyviai`, run
`get_viesasis_pirkimas` → `get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)` and check whether **both codes appear in
`VI. DALYVIAI`** of the same tender. Two ostensibly independent firms sharing an address/domain and bidding against each
other is the core red flag — record the procurement ID and both codes.
