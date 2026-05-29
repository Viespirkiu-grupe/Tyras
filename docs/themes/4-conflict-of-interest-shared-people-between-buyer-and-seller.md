# 4. Conflict of interest — shared people between buyer and seller

## Description

A conflict of interest arises when a person involved in a buyer's procurement decisions has undisclosed ties to a
winning supplier, enabling improper influence over award outcomes. Shared directorships, board memberships, or family
links are the most common forms.

- **Tools:** `get_pinreg_jar`, `get_pinreg_asmuo`, `execute_query`
- **Goal:** Find persons declared in both buyer and winning supplier PINREG records **with an active or recent
  relationship** (filter by `rysioPabaiga` to avoid flagging persons who left either entity years ago).
- **Supervisory authorities:** STT, VPT
- **OSINT sources:** media, LinkedIn, board memberships

## To Detect

> **Important**: Always filter by relationship date. Without a date filter this query will match expired historical
> relationships and produce large numbers of false positives. Use `rysioPabaiga IS NULL` (currently active) or
> `rysioPabaiga >= CURRENT_DATE - INTERVAL '3 years'` (active within last 3 years).

- Shared persons buyer↔supplier (directors, board members, key staff).
- Spouse/family links (SUTUOKTINIO_DARBOVIETE and similar fields).
- Cross-declared interest declarations (same person declaring interests in both entities).
- Ownership chain overlap (person is owner/co-owner in supplier while participating in buyer decisions).
- Undeclared conflicts: persons visible in OSINT sources (boards, associations) but missing from PINREG.

## SQL Examples

```sql
-- Persons appearing in PINREG for both buyer and winning supplier (direct conflict of interest)
-- Filter to active/recent relationships to avoid false positives from stale historical links
SELECT pr_b.vardas,
       pr_b.pavarde,
       pr_b."jarKodas"                         AS pirkejoKodas,
       buyer.pavadinimas                       AS pirkejas,
       pr_s."jarKodas"                         AS "tiekejoKodas",
       supplier.pavadinimas                    AS tiekejas,
       COUNT(DISTINCT s."sutartiesUnikalusId") AS sutarciuKiekis,
       SUM(s.verte)                            AS totalVerte
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
WHERE (pr_b."rysioPabaiga" IS NULL
   OR pr_b."rysioPabaiga" >= CURRENT_DATE - INTERVAL '3 years')
  AND (pr_s."rysioPabaiga" IS NULL
   OR pr_s."rysioPabaiga" >= CURRENT_DATE - INTERVAL '3 years')
GROUP BY pr_b.vardas, pr_b.pavarde, pr_b."jarKodas", buyer.pavadinimas,
    pr_s."jarKodas", supplier.pavadinimas
HAVING SUM(s.verte) > 50000
ORDER BY totalVerte DESC
LIMIT 30;
```
