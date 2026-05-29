# 24. EU funds irregularities and cross-border fraud patterns

## Description

EU funds irregularities include overpricing, fictitious suppliers, and self-dealing schemes in EU-funded procurements,
often spanning multiple member states and involving complex corporate structures designed to circumvent programme
controls and audit trails.

- **Tools:** `search_sutartys`, `get_juridinis`, `get_sutartis`, `execute_query`
- **Goal:** Detect patterns in EU-funded procurements and projects that resemble known EU funds fraud schemes
  (overpricing, fictitious suppliers, self-dealing across borders).
- **Supervisory authorities:** FNTT, VK, STT
- **OSINT sources:** EU OLAF/EPPO cases, cross-border company data

## To Detect

- Concentration of irregularities in specific operational programmes or measures (CPVA-based flags, when available).
- Clusters of projects where expenditure is later found ineligible in VK audits (once data integrated).
- Cross-border supplier networks where Lithuanian beneficiary works with the same small set of foreign suppliers.
- Early termination of contracts, repeated project modifications, or high rate of budget reallocations.

## SQL Examples

```sql
-- EU-funded contracts ("esFinansavimas"=true) with high cost overruns, joined to CPVA project data
SELECT s."sutartiesUnikalusId",
       s.pavadinimas,
       s."perkanciosiosOrganizacijosKodas"                     AS pirkejoKodas,
       jb.pavadinimas                                          AS pirkejas,
       s."tiekejoKodas",
       js.pavadinimas                                          AS tiekejas,
       s.verte,
       s."faktineIvykdimoVerte",
       ROUND(s."faktineIvykdimoVerte" / NULLIF(s.verte, 0), 2) AS santykis,
       cp."projektoNr",
       cp."pirkimoSutartiesSumaSusijusiSuProjektu"             AS cpvaVerte
FROM sutartys s
         JOIN "jarCsv" jb ON jb."jarKodas"::text = s."perkanciosiosOrganizacijosKodas"
JOIN "jarCsv" js
ON js."jarKodas":: text = s."tiekejoKodas"
    LEFT JOIN "cpvaProjektuSutartys" cp ON cp."pirkimoSutartiesNr" = s."sutartiesUnikalusId":: text
    JOIN "viesiejiPirkimai" vp ON vp."pirkimoId" = s."pirkimoNumeris"
WHERE vp."esFinansavimas" = true
  AND s."faktineIvykdimoVerte" IS NOT NULL
  AND s.verte
    > 0
  AND s."faktineIvykdimoVerte"
    > s.verte * 1.3
  AND s.istrinta = false
ORDER BY santykis DESC
LIMIT 30;
```

## Followup

For human investigator: EPPO and OLAF are key external partners on EU funds fraud; FNTT leads financial crime
investigation domestically, VK provides systemic audit findings. When OSINT or VK reports show high irregularity rates
in a specific programme, use this theme to prioritise procurement-level analysis.
