# 11. UBO risk — beneficial ownership through holding layers

## Description

Beneficial ownership risk arises when the true controllers of competing bidders or buyer–supplier pairs are concealed
behind holding company layers or offshore structures, potentially enabling coordinated bidding or self-dealing invisible
at first glance.

- **Tools:** `get_pinreg_jar`, `get_juridinis`, `execute_query`
- **Goal:** Detect shared control of competing bidders or buyer–supplier pairs through holding companies and back-office
  signals.
- **Supervisory authorities:** STT, FNTT
- **OSINT sources:** foreign company registers, OpenCorporates

## To Detect

> **False-positive risk**: `yraJuridinisAsmuo = true` alone matches all companies that have any corporate shareholder,
> including entirely normal Lithuanian holding structures. Filter specifically for **foreign-registered** legal entities
> (`registruotaLietuvoje = false AND yraJuridinisAsmuo = true`) to focus on high-risk offshore chains. Domestic parent
> companies are not inherently suspicious.

- Shared declared persons across bidder set (including spouse links via `SUTUOKTINIO_DARBOVIETE`).
- Shared domain registrant, address, or court history across co-bidders.

## SQL Examples

```sql
-- Persons declared in PINREG for two companies that bid in the same tender (UBO co-control)
SELECT d1."ataskaitaId" AS pirkimasId,
       a."pirkimoNumeris",
       d1.kodas         AS kodas1,
       j1.pavadinimas   AS pavadinimas1,
       d2.kodas         AS kodas2,
       j2.pavadinimas   AS pavadinimas2,
       pr.vardas,
       pr.pavarde
FROM "atn1dalyviai" d1
         JOIN "atn1dalyviai" d2
              ON d2."ataskaitaId" = d1."ataskaitaId" AND d2.kodas > d1.kodas
         JOIN "atn1ataskaitos" a ON a.id = d1."ataskaitaId"
         JOIN "pinregJuridiniaiRysiai" pr ON pr."jarKodas" = d1.kodas
         JOIN "pinregJuridiniaiRysiai" pr2
              ON pr2."jarKodas" = d2.kodas AND pr2.vardas = pr.vardas AND pr2.pavarde = pr.pavarde
         JOIN "jarCsv" j1 ON j1."jarKodas"::text = d1.kodas
JOIN "jarCsv" j2
ON j2."jarKodas":: text = d2.kodas
ORDER BY a."pirkimoNumeris"
LIMIT 50;
```

```sql
-- PINREG links to foreign-registered or legal-entity holders (high UBO risk indicators)
SELECT pr.vardas,
       pr.pavarde,
       pr.pareigos,
       pr."jarKodas",
       j.pavadinimas AS imone,
       pr."registruotaLietuvoje",
       pr."yraJuridinisAsmuo",
       pr."rysioPradzia",
       pr."rysioPabaiga"
FROM "pinregJuridiniaiRysiai" pr
         JOIN "jarCsv" j ON j."jarKodas"::text = pr."jarKodas"
WHERE pr."registruotaLietuvoje" = false
   OR (pr."yraJuridinisAsmuo" = true
  AND pr."registruotaLietuvoje" = false)
ORDER BY j.pavadinimas
LIMIT 100;
```

## Followup

**Gap (data):**

- Only one-hop person→company links; no explicit company→company ownership table.
- Foreign ownership chains often opaque.

**Mitigation:**

- Flag `registruotaLietuvoje = false` or `yraJuridinisAsmuo = true` in `v_person_links` as high-risk chain elements.
- Use OSINT to identify foreign holdings and beneficial owners.
