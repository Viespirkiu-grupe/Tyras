# 23. Vendor lock-in — incumbent supplier structural monopoly

## Description

Vendor lock-in occurs when an incumbent supplier becomes the de facto sole source for a buyer through system ownership,
proprietary standards, or contractual constraints, enabling them to capture all future related contracts without genuine
competition.

- **Tools:** `search_sutartys`, `get_juridinis`, `execute_query`
- **Goal:** Detect suppliers whose relationship with a single buyer is self-reinforcing — system builder becomes sole
  maintenance provider and captures future related contracts.
- **Supervisory authorities:** STT, KT, VK
- **OSINT sources:** system ownership, IP clauses

## To Detect

- Single-buyer concentration >70% of supplier's total contract value (min total and contract count thresholds).
- All or most contracts to that buyer via direct/negotiated procedures.
- Escalating contract count and value over years.
- No other supplier winning same CPV from same buyer.
- Litigation (`bylojeKaip = 'IEŠKOVAS'`) against buyers who attempt to switch suppliers.

## SQL Examples

```sql
-- Suppliers with >70% of total revenue from a single buyer (structural lock-in signal)
WITH supplier_totals AS (SELECT "tiekejoKodas", SUM(verte) AS totalVerte, COUNT(*) AS kiekis
                         FROM sutartys
                         WHERE istrinta = false
                           AND "sudarymoData" >= CURRENT_DATE - INTERVAL '5 years'
                         GROUP BY "tiekejoKodas"
                         HAVING SUM(verte) > 500000 AND COUNT(*) >= 5),
     buyer_share AS (SELECT "perkanciosiosOrganizacijosKodas", "tiekejoKodas", SUM(verte) AS verteUzPirkejo
                     FROM sutartys
                     WHERE istrinta = false
                       AND "sudarymoData" >= CURRENT_DATE - INTERVAL '5 years'
                     GROUP BY 1, 2)
SELECT bs."tiekejoKodas",
       j_s.pavadinimas                                     AS tiekejas,
       bs."perkanciosiosOrganizacijosKodas"                AS pirkejoKodas,
       j_b.pavadinimas                                     AS pirkejas,
       st.totalVerte                                       AS tiekejoVisoVerte,
       bs.verteUzPirkejo,
       ROUND(100.0 * bs.verteUzPirkejo / st.totalVerte, 1) AS koncentracijaProc
FROM buyer_share bs
         JOIN supplier_totals st ON st."tiekejoKodas" = bs."tiekejoKodas"
         JOIN "jarCsv" j_s ON j_s."jarKodas"::text = bs."tiekejoKodas"
JOIN "jarCsv" j_b
ON j_b."jarKodas":: text = bs."perkanciosiosOrganizacijosKodas"
WHERE bs.verteUzPirkejo / st.totalVerte > 0.70
ORDER BY bs.verteUzPirkejo DESC
LIMIT 30;
```

## Followup

**Gap (data):**

- No contract clause data or IP ownership information available in structured form; lock-in mechanism (e.g. proprietary
  code, restrictive SLA clauses) only visible in contract texts.
