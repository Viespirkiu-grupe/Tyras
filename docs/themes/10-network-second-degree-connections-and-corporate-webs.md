# 10. Network — second-degree connections and corporate webs

## Description

Corporate networks involve suppliers and buyers linked through shared directors, shareholders, or group structures,
enabling informal coordination and conflict-of-interest risks that are not visible from direct one-hop ownership data
alone.

- **Tools:** `get_pinreg_jar`, `get_pinreg_asmuo`, `execute_query`, `search_juridiniai`, `get_juridinis`
- **Goal:** Map corporate control network beyond direct ownership.
- **Supervisory authorities:** STT, FNTT
- **OSINT sources:** JAR extracts, foreign registers, company websites

## To Detect

- Directors/shareholders → second-degree companies → public contracts.
- Shared address/domain clusters; offices shared among multiple bidders.
- Ownership changes around contract award dates (transfers before large tenders).
- Foreign beneficial ownership indicators (non-Lithuanian entities with unclear activity).

## SQL Examples

```sql
-- Persons linking 4+ companies via PINREG (network hub — second-degree connection risk)
SELECT pr.vardas,
       pr.pavarde,
       COUNT(DISTINCT pr."jarKodas")            AS susijusiuImoniu,
       BOOL_OR(NOT pr."registruotaLietuvoje")   AS yraUzsienioRysiu,
       STRING_AGG(DISTINCT j.pavadinimas, '; ') AS imones
FROM "pinregJuridiniaiRysiai" pr
         JOIN "jarCsv" j ON j."jarKodas"::text = pr."jarKodas"
GROUP BY pr.vardas, pr.pavarde
HAVING COUNT(DISTINCT pr."jarKodas") >= 4
ORDER BY susijusiuImoniu DESC
LIMIT 30;
```

```sql
-- Companies sharing the same registered address (shared back-office cluster)
SELECT j.adresas,
       COUNT(DISTINCT j."jarKodas")                           AS imoniu,
       STRING_AGG(j.pavadinimas, '; ' ORDER BY j.pavadinimas) AS imones
FROM "jarCsv" j
WHERE j.adresas IS NOT NULL
  AND LENGTH(j.adresas) > 10
GROUP BY j.adresas
HAVING COUNT(DISTINCT j."jarKodas") >= 5
ORDER BY imoniu DESC
LIMIT 30;
```

## Followup

For human investigator: networks that cross into high-risk sectors (construction, IT, healthcare, EU-funded projects)
are particularly relevant for STT; when capital flows, cross-border payments, or complex chains with offshore entities
are visible, FNTT interest increases.
