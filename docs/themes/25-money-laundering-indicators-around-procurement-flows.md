# 25. Money-laundering indicators around procurement flows

## Description

Money-laundering typologies in procurement include the use of contracts to layer or integrate illicit funds — for
example through over-invoicing, circular payment flows, or sudden diversification into unrelated sectors — with
procurement flows masking the true origin of funds.

- **Tools:** `execute_query` (incl. SABIS invoice/payment tables), `get_juridinis`
- **Goal:** Flag procurement cases where contract payment flows show money-laundering typologies (layering, use of
  high-risk sectors, circular flows, third-party payment diversion).
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
- **Third-party payment diversion:** the SABIS invoice payee (`sabisSaskaituSalys.tipas = 'Mokėjimo gavėjas'`) differs
  from the contracted supplier (`tipas = 'Tiekėjas'`) — payment routed to an entity other than the winner (assignment /
  factoring, but a classic layering vehicle). Computable and present (~5k invoices show this).
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

```sql
-- Third-party payment diversion: SABIS invoices where the payment recipient is a different legal entity than the
-- supplier. Attribute parties by validusJarKodas only (sabisSaskaituSalys.pavadinimas is a hash — resolve names via
-- jarCsv). See "SABIS payment-flow analysis" in the index. Legitimate factoring exists; treat as a layering LEAD and
-- check whether the payee is a shell (theme 1), shares people/address with the supplier (themes 4/16), or is offshore.
SELECT sup."validusJarKodas"                  AS tiekejoKodas,
       js.pavadinimas                          AS tiekejas,
       pay."validusJarKodas"                  AS gavejoKodas,
       jp.pavadinimas                          AS mokejimoGavejas,
       COUNT(DISTINCT si."sfId")              AS saskaituKiekis,
       ROUND(SUM(si."bendraSfSuma"))          AS bendraSuma
FROM "sabisSaskaituSalys" sup
         JOIN "sabisSaskaituSalys" pay ON pay."sfId" = sup."sfId"
         JOIN "sabisSaskaitos" si ON si."sfId" = sup."sfId"
         LEFT JOIN "jarCsv" js ON js."jarKodas"::text = sup."validusJarKodas"
         LEFT JOIN "jarCsv" jp ON jp."jarKodas"::text = pay."validusJarKodas"
WHERE sup."tipas" = 'Tiekėjas'
  AND pay."tipas" = 'Mokėjimo gavėjas'
  AND sup."validusJarKodas" IS NOT NULL
  AND pay."validusJarKodas" IS NOT NULL
  AND pay."validusJarKodas" <> sup."validusJarKodas"
  AND si."bendraSfSuma" > 0
GROUP BY sup."validusJarKodas", js.pavadinimas, pay."validusJarKodas", jp.pavadinimas
ORDER BY bendraSuma DESC
LIMIT 30;
```

## Gap

- No bank-account-level transaction data: SABIS shows invoice issuer/payee at the **invoice** level (see "SABIS
  payment-flow analysis" in the index), which enables third-party-payment and over-invoicing leads above, but not actual
  settlement timing, account numbers, or onward transfers.
- Full money-laundering confirmation still requires FNTT data and STR/SAR reports — the SABIS signals are layering
  **indicators** for referral, not proof of flows.
