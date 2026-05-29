# 19. Municipal company favoritism — buyer awards contracts to its own subsidiary

## Description

Municipal favoritism occurs when a public buyer awards contracts disproportionately to its own subsidiary or to
companies with shared governance links, using procurement to channel public funds within a controlled group while
maintaining the appearance of arm's-length transactions.

- **Tools:** `search_sutartys`, `get_pinreg_jar`, `execute_query`
- **Goal:** Detect municipality awarding contracts to its own subsidiary via shared-person or ownership proxies.
- **Supervisory authorities:** STT, VK, VPT
- **OSINT sources:** municipal decisions, press

## To Detect

- Value share to companies with shared PINREG persons with buyer.
- Procedure type distribution (direct vs. competitive) for such pairs.
- Structural patterns where one municipal company or group company receives majority of local contracts.

## SQL Examples

```sql
-- Buyer awarding disproportionate value to companies sharing PINREG persons with the buyer
SELECT pr_b."jarKodas"                                    AS pirkejoKodas,
       buyer.pavadinimas                                  AS pirkejas,
       pr_s."jarKodas"                                    AS "tiekejoKodas",
       supplier.pavadinimas                               AS tiekejas,
       COUNT(DISTINCT pr_b.vardas || ' ' || pr_b.pavarde) AS bendruAsmenuKiekis,
       COUNT(DISTINCT s."sutartiesUnikalusId")            AS sutarciuKiekis,
       SUM(s.verte)                                       AS totalVerte,
       STRING_AGG(DISTINCT s.tipas, ', ')                 AS procedurosTipai
FROM "pinregJuridiniaiRysiai" pr_b
         JOIN "pinregJuridiniaiRysiai" pr_s
              ON pr_s.vardas = pr_b.vardas AND pr_s.pavarde = pr_b.pavarde
                  AND pr_s."jarKodas" <> pr_b."jarKodas"
         JOIN sutartys s
              ON s."perkanciosiosOrganizacijosKodas" = pr_b."jarKodas"
                  AND s."tiekejoKodas" = pr_s."jarKodas" AND s.istrinta = false
         JOIN "jarCsv" buyer ON buyer."jarKodas"::text = pr_b."jarKodas"
JOIN "jarCsv" supplier
ON supplier."jarKodas":: text = pr_s."jarKodas"
GROUP BY pr_b."jarKodas", buyer.pavadinimas, pr_s."jarKodas", supplier.pavadinimas
HAVING SUM(s.verte) > 100000
ORDER BY totalVerte DESC
LIMIT 30;
```

## Followup

**Gap (data):** (e.g. JAR "SAVIVALDYBĖ" participation data) — proxy via shared persons and addresses.
