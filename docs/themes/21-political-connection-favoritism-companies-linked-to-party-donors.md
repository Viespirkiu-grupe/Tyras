# 21. Political connection favoritism — companies linked to party donors or politicians

## Description

Political connection favoritism occurs when companies with links to political party donors or elected officials receive
a disproportionate share of public contracts, suggesting that procurement decisions are influenced by political rather
than commercial criteria.

- **Tools:** (future) VRK donors dataset, `execute_query`, `get_pinreg_jar`
- **Goal:** Detect companies linked to party donors or elected officials receiving disproportionate contract value.
- **Supervisory authorities:** STT, FNTT
- **OSINT sources:** VRK donor lists, political office data

## To Detect

- Overlap between company beneficial owners or directors and political donors/party officials.
- Contract value share for politically connected companies vs. peers.

> **Note**: No VRK donor or political office data in current schema. Use OSINT and cross-reference names found via
> `get_pinreg_jar` against public VRK donor lists manually.

## SQL Examples

```sql
-- Companies with very high total contract value and persons linked to many organisations (proxy for political exposure)
SELECT pr.vardas,
       pr.pavarde,
       COUNT(DISTINCT pr."jarKodas") AS rysiuKiekis,
       SUM(stats.totalVerte)         AS visoSutarciuVerte
FROM "pinregJuridiniaiRysiai" pr
         JOIN (SELECT "tiekejoKodas", SUM(verte) AS totalVerte
               FROM sutartys
               WHERE istrinta = false
               GROUP BY "tiekejoKodas") stats ON stats."tiekejoKodas" = pr."jarKodas"
GROUP BY pr.vardas, pr.pavarde
HAVING COUNT(DISTINCT pr."jarKodas") >= 3
ORDER BY visoSutarciuVerte DESC
LIMIT 30;
```

## Followup

**Gap (data):**

- Needs VRK donor database and politician office/mandate register.

For human investigator: when considering escalation to STT on political favouritism, combine MCP signals with OSINT from
VRK, Seimas and savivaldybių tarybų registers, and media investigations. FNTT becomes relevant when donations correlate
with suspicious financial flows or EU funds cases.
