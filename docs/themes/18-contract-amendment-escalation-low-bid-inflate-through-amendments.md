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

## Followup

**Gap (data):**

- `dokumentai` JSONB unstructured; CVPIS amendment sequence not fully ingested.
