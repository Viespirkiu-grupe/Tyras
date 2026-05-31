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
-- Company pairs that share a declared person in PINREG (same vardas+pavarde) — candidate co-controlled bidders.
-- Co-bidding is then confirmed per procurement from the ATN-1 bidder list (see note below); it is not queryable.
SELECT pr1."jarKodas" AS kodas1,
       j1.pavadinimas AS pavadinimas1,
       pr2."jarKodas" AS kodas2,
       j2.pavadinimas AS pavadinimas2,
       pr1.vardas,
       pr1.pavarde
FROM "pinregJuridiniaiRysiai" pr1
         JOIN "pinregJuridiniaiRysiai" pr2
              ON pr2.vardas = pr1.vardas AND pr2.pavarde = pr1.pavarde AND pr2."jarKodas" > pr1."jarKodas"
         JOIN "jarCsv" j1 ON j1."jarKodas"::text = pr1."jarKodas"
         JOIN "jarCsv" j2 ON j2."jarKodas"::text = pr2."jarKodas"
ORDER BY pr1.pavarde, pr1.vardas
LIMIT 50;
```

> **Confirm co-bidding per procurement.** A shared person only flags _potential_ co-control. To show the two companies
> actually competed in the same tender, find procurements both supplied (`search_sutartys` / `v_sutartys`) and read the
> overlapping procurements' ATN-1 bidder lists — `get_viesasis_pirkimas` → `get_failas_tekstas(<fileId>, puslapis=4)` →
> both codes present in `VI. DALYVIAI`. Also filter homonyms: a shared common name is weak; corroborate with PINREG
> identifiers, shared address (`jarCsv`), or shared domain (`domenai`).

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
