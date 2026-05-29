# 13. Revolving door — procurement officer joins winning supplier

## Description

The revolving door pattern occurs when a former procurement officer moves to a supplier that subsequently wins contracts
from their former employer, creating a risk of improper advance influence, insider information transfer, or pre-arranged
advantage.

- **Tools:** `execute_query`, `get_pinreg_asmuo`, `get_pinreg_jar`
- **Goal:** Find buyer-side staff who moved to suppliers that won contracts from their former employer.
- **Supervisory authorities:** STT
- **OSINT sources:** LinkedIn, public CVs

## To Detect

- Person left buyer organisation and joined supplier within a defined time window (e.g. 2 years).
- Contracts awarded to that supplier after move date by same buyer.
- Changes in procedure type and competition intensity before and after move.

## SQL Examples

```sql
-- Person left buyer PINREG and joined a supplier within 2 years; supplier then won contracts
SELECT pr_b.vardas,
       pr_b.pavarde,
       pr_b."jarKodas"                             AS pirkejoKodas,
       buyer.pavadinimas                           AS pirkejas,
       pr_b."rysioPabaiga"                         AS isejimoData,
       pr_s."jarKodas"                             AS "tiekejoKodas",
       supplier.pavadinimas                        AS tiekejas,
       pr_s."rysioPradzia"                         AS prisijungimoData,
       (pr_s."rysioPradzia" - pr_b."rysioPabaiga") AS perejimoDienos,
       COUNT(s."sutartiesUnikalusId")              AS sutarciuPoPerejimo,
       COALESCE(SUM(s.verte), 0)                   AS vertePoPerejimo
FROM "pinregJuridiniaiRysiai" pr_b
         JOIN "pinregJuridiniaiRysiai" pr_s
              ON pr_s.vardas = pr_b.vardas AND pr_s.pavarde = pr_b.pavarde
                  AND pr_s."jarKodas" <> pr_b."jarKodas"
                  AND pr_b."rysioPabaiga" IS NOT NULL AND pr_s."rysioPradzia" IS NOT NULL
                  AND pr_s."rysioPradzia" > pr_b."rysioPabaiga"
                  -- 730 days is an investigation parameter, not a legal cooling-off period — adjust for seniority.
                  AND (pr_s."rysioPradzia" - pr_b."rysioPabaiga") < 730
         LEFT JOIN sutartys s
                   ON s."perkanciosiosOrganizacijosKodas" = pr_b."jarKodas"
                       AND s."tiekejoKodas" = pr_s."jarKodas"
                       AND s."sudarymoData" >= pr_s."rysioPradzia" AND s.istrinta = false
         JOIN "jarCsv" buyer ON buyer."jarKodas"::text = pr_b."jarKodas"
JOIN "jarCsv" supplier
ON supplier."jarKodas":: text = pr_s."jarKodas"
GROUP BY pr_b.vardas, pr_b.pavarde, pr_b."jarKodas", buyer.pavadinimas, pr_b."rysioPabaiga",
    pr_s."jarKodas", supplier.pavadinimas, pr_s."rysioPradzia"
-- HAVING removes cases with zero post-move contracts; remove this filter to also surface
-- pre-positioned relationships (supplier had prior contracts before the person moved).
HAVING COALESCE(SUM(s.verte), 0) > 0
ORDER BY vertePoPerejimo DESC
LIMIT 30;
```
