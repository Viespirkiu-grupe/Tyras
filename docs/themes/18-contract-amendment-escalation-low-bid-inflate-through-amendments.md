# 18. Contract amendment escalation — low bid, then value inflated through amendments

## Description

Amendment escalation occurs when a supplier wins a contract with an unusually low initial bid and then systematically
inflates the total value through post-award amendments, effectively bypassing the competitive pricing that justified the
original award.

- **Tools:** `search_failai`, `get_sutartis`, `get_failas_tekstas`, `execute_query`
- **Goal:** Detect suppliers who systematically under-bid then inflate via amendments.
- **Supervisory authorities:** STT, FNTT, VK
- **OSINT sources:** audit reports, media on overruns

## To Detect

- `faktineIvykdimoVerte/verte` ratio >1.5 by supplier and buyer.
- Buyers with highest tolerance for overruns (systemic behaviour).
- Consistent under-bid pattern by supplier (often cheapest winner) followed by high amendment ratios.
- **SABIS payment escalation:** suppliers whose SABIS-invoiced total systematically exceeds the contracted `verte`
  across many contracts, with payments spread over a long window (many invoices, late invoices) — the money-flow
  signature of inflate-through-amendments, independent of the sparsely-populated `faktineIvykdimoVerte`.

## SQL Examples

```sql
-- Suppliers systematically winning cheap then inflating via amendments (low-bid-then-inflate)
SELECT s."tiekejoKodas",
       j.pavadinimas                                                        AS tiekejas,
       COUNT(*)                                                             AS sutarciuKiekis,
       SUM(s.verte)                                                         AS totalVerte,
       ROUND(AVG(s."faktineIvykdimoVerte" / NULLIF(s.verte, 0)), 2)         AS vidutinisSantykis,
       COUNT(CASE WHEN s."faktineIvykdimoVerte" > s.verte * 1.5 THEN 1 END) AS stipriuVirsijimuKiekis
FROM sutartys s
         JOIN "jarCsv" j ON j."jarKodas"::text = s."tiekejoKodas"
WHERE s."faktineIvykdimoVerte" IS NOT NULL AND s.verte > 0 AND s.istrinta = false
GROUP BY s."tiekejoKodas", j.pavadinimas
HAVING COUNT(*) >= 5 AND AVG(s."faktineIvykdimoVerte" / NULLIF(s.verte, 0)) > 1.3
ORDER BY stipriuVirsijimuKiekis DESC
LIMIT 30;
```

```sql
-- Payment escalation per supplier: SABIS-invoiced total exceeds contracted value across multiple contracts.
-- Bridge v_sutartys → sabisSutartys.vpId → sabisSaskaitos (see "SABIS payment-flow analysis" in the index).
-- Per-contract ratio is capped at 10× to drop unit/decimal-error invoices; treat hits as leads, then drill into one
-- contract's invoice timeline (israsymoData) to confirm a genuine escalation rather than scheduled instalments.
WITH per_contract AS (SELECT v."tiekejoKodas",
                             v."tiekejoPavadinimas",
                             v."sutartiesUnikalusId",
                             v.verte,
                             SUM(si."bendraSfSuma") AS invoiced
                      FROM v_sutartys v
                               JOIN "sabisSutartys" sc ON sc."vpId" = v."sutartiesUnikalusId"::text
                               JOIN "sabisSaskaitos" si ON si."sutartiesUid" = sc."sutartiesUid"
                      WHERE v.verte > 10000
                        AND si."bendraSfSuma" > 0
                        AND si."sfTipas" IS DISTINCT FROM 'Kreditinė sąskaita'
                        AND si."israsymoData" BETWEEN '2010-01-01' AND CURRENT_DATE
                      GROUP BY v."tiekejoKodas", v."tiekejoPavadinimas", v."sutartiesUnikalusId", v.verte
                      HAVING SUM(si."bendraSfSuma") <= v.verte * 10)
SELECT "tiekejoKodas",
       "tiekejoPavadinimas"                                          AS tiekejas,
       COUNT(*)                                                      AS sutarciuKiekis,
       ROUND(AVG(invoiced / NULLIF(verte, 0)), 2)                    AS vidutinisApmoketaSantykis,
       COUNT(CASE WHEN invoiced > verte * 1.5 THEN 1 END)           AS stipriuVirsijimuKiekis
FROM per_contract
GROUP BY "tiekejoKodas", "tiekejoPavadinimas"
HAVING COUNT(*) >= 5 AND AVG(invoiced / NULLIF(verte, 0)) > 1.3
ORDER BY stipriuVirsijimuKiekis DESC
LIMIT 30;
```

## Followup

**Gap (data):**

- `dokumentai` JSONB unstructured; CVPIS amendment sequence not fully ingested — the SABIS query above shows the **net
  payment** escalation but not the individual amendment documents that authorised each increase.
