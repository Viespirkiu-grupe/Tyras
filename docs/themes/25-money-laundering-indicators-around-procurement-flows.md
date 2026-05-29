# 25. Money-laundering indicators around procurement flows

## Description

Money-laundering typologies in procurement include the use of contracts to layer or integrate illicit funds — for
example through over-invoicing, circular payment flows, or sudden diversification into unrelated sectors — with
procurement flows masking the true origin of funds.

- **Tools:** `execute_query`, future accounting/payment tables, `get_juridinis`
- **Goal:** Flag procurement cases where contract payment flows show money-laundering typologies (layering, use of
  high-risk sectors, circular flows).
- **Supervisory authorities:** FNTT, STT
- **OSINT sources:** beneficiary/SAR mentions in FNTT releases

> **Important caveat**: CPV diversification alone (working across 5+ CPV divisions) is a very weak and
> high-false-positive indicator. Large companies, construction firms, and technology integrators naturally span many CPV
> divisions. Do not treat this query as a standalone money-laundering signal. Use it only as a filtering step to
> identify companies with an unusually broad scope **combined with** other risk indicators (shell company signals,
> conflict of interest, offshore UBO structures).

## To Detect

- Payments quickly transferred to other jurisdictions or high-risk entities.
- Use of multiple small contracts to channel funds through the same intermediaries.
- Mismatches between contract scope and supplier's usual business or risk profile (e.g. sudden expansion into unrelated
  sectors).

## SQL Examples

```sql
-- Suppliers diversifying into many unrelated CPV divisions (>=5 divisions) with high total value (layering signal)
SELECT s."tiekejoKodas",
       j.pavadinimas                               AS tiekejas,
       COUNT(DISTINCT LEFT (vp."bvpzKodai"[1], 2)) AS skirtinguCpvDivizijuKiekis,
       COUNT(DISTINCT s."sutartiesUnikalusId")     AS sutarciuKiekis,
       SUM(s.verte)                                AS totalVerte
FROM sutartys s
         JOIN "jarCsv" j ON j."jarKodas"::text = s."tiekejoKodas"
JOIN "viesiejiPirkimai" vp
ON vp."pirkimoId" = s."pirkimoNumeris"
WHERE s.istrinta = false AND vp."bvpzKodai" IS NOT NULL
GROUP BY s."tiekejoKodas", j.pavadinimas
HAVING COUNT(DISTINCT LEFT (vp."bvpzKodai"[1], 2)) >= 5 AND SUM(s.verte) > 200000
ORDER BY skirtinguCpvDivizijuKiekis DESC
LIMIT 30;
```

## Gap

- Current schema focuses on procurement and registries, not bank transaction data.
- Money-laundering analysis largely requires FNTT data and STR reports.
