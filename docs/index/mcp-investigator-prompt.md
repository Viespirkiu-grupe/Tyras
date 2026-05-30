# MCP Risk Intelligence Tool — Enhanced Investigation Themes for Lithuanian Public Procurement

## MCP Tool Quick Reference

### Tool selection — start with search, not SQL

Use `execute_query` for aggregations, pattern analysis or getting required item if identifier is known. Prefer full text
search tools such as `search_sutartys` (`search="Pavardė"`) or `search_failai` for discovery. Check **Goal** → **Use
first** mapping below:

- Find contracts by party, CPV, value, date → `search_sutartys`
- Find persons mentioned directly in contract records (signatories, counterparties, named beneficiaries) →
  `search_sutartys` (`search="Pavardė"`)
- Find companies by name or code → `search_juridiniai`
- Find persons, emails, phones, IBANs in uploaded documents → `search_failai`
- Find procurement notices → `search_viesieji_pirkimai`
- Aggregate, count, compute ratios, join tables → `execute_query`

> **QUANTITATIVE CLAIMS RULE**: Any statement about totals, counts, value sums, market share, or trends **MUST** be
> backed by an `execute_query` result. `search_*` tools return at most 50 rows with `total: null` — they reveal
> existence but cannot confirm scale. An investigation that ends after `search_*` results only is incomplete if it makes
> any numerical claim.

### Views available inside `execute_query`

Prefer views to raw tables. Call `get_schema` to confirm column names.

- `v_company` [themes 1, 5–7, 9–12, 19, 22–23]: `jarCsv` + `sodra` (LATERAL) + compliance flags → `darbuotojai`
  (headcount; = `draustieji` in raw `sodra`), `vidutinisAtlyginimas`, `imokuSuma`, `melagingisTiekejas` (bool),
  `nepatikimasTiekejas` (bool), `vdiPazeidimuSkaicius` (count, not a flag), `bylosSkaicius`, `domenaiSkaicius`,
  `neskelbiamosDerybosSkaicius`, `registravimoData`, `statusoPavadinimas`.
- `v_sutartys` [themes 1–3, 5–8, 13, 15–16, 18–20, 22–24]: `sutartys` + `jarCsv` ×2 → `pirkejas`, `tiekejas`,
  `pirkejoKodas`, `tiekejoKodas` (names resolved), `verte`, `faktineIvykdimoVerte` (actual executed value — populated
  for ~12% of contracts; enables cost-overrun analysis for themes 8, 18), `faktineIvykdimoData`, `sudarymoData`,
  `bvpzKodas`, `tipas`, `istrinta`, and consortia arrays `tiekejaiKodai[]` / `papildomiTiekejai[]`.
- `v_pirkimas` [themes 5–7, 14, 20, 24]: notice-level view → `pirkimoId`, `organizatorius`, `miestas`, `trumpinys`,
  `pirkimoBudas`, `statusas`, `numatomaVerteEUR`, `esFinansavimas` (bool), `bvpzKodai[]`, `paskelbimoData`,
  `pasiulymuPateikimoTerminas`.
- `v_person_links` [themes 4, 10–11, 13, 19, 21]: `pinregJuridiniaiRysiai` + `jarCsv` → `vardas`, `pavarde`, `jarKodas`,
  `imonesVardas`, `pareigos`, `rysioPradzia`, `rysioPabaiga` (date-filter to avoid stale links), `susijusioAsmensVardas`
  / `susijusioAsmensPavarde` (spouse/family link), `dalyvaujaViesuosePirkimuose` (bool), `registruotaLietuvoje`,
  `yraJuridinisAsmuo`.
- `v_dalyviai` [themes 2–3, 14, 17, 28]: joins `atn1ataskaitos`, `atn1dalyviai`, `atn1pasiulymuEile`,
  `atn1atmestiPasiulymai` and `jarCsv` → `pasiulymoKaina` (numeric), `eileNumeris`, `atmetimoPriezastis`, `tiekejas`,
  `salis` (bidder country — cross-border signal), `daliuSkaicius`, `pretenzijaPateikta` (bool), `ieskinysTeismui`
  (bool). **The bidder count per procurement** (`COUNT(DISTINCT "tiekejoKodas") GROUP BY "pirkimoNumeris"`) drives the
  single-bidding indicator (theme 28) — the strongest corruption proxy in the data. **⚠ `eileNumeris` is 100% NULL** in
  current data (raw table and view) — bid rank / winner is **not recoverable**; any query filtering `eileNumeris = 1`
  returns nothing (affects themes 2, 17). Single-bidding works around this (sole bidder = winner). **⚠ Two flag columns
  are unreliable**: `interesuKonfliktasNustatytas` is never `true` in current data (unpopulated — do not treat absence
  as "no conflict"); `konkurencijaIskreipiantisAsmuo` is `true` for ~48% of rows and is an administrative declaration,
  **not** a fraud signal — do not use it as a red flag without separate validation. **⚠ Coverage**: ~400 reports from
  ~38 buyer organisations only, heavily dominated by one buyer (JAR 135163499, Kauno klinikos, ~62% of reports). Before
  querying `v_dalyviai` for a specific supplier or buyer, verify coverage:
  `SELECT COUNT(*) FROM atn1ataskaitos WHERE "perkanciosiosOrganizacijosKodas" = '<kodas>'`. If the result is 0,
  competition analysis via this view is **not possible** for that entity — state this explicitly rather than inferring
  absence of competition.
- `v_bylos` [themes 9, 23–24]: `bylosDalyviai` + `bylos` + `jarCsv` → `bylosNumeris`, `bylosRusis`, `bylosData`,
  `teismas`, `bylojeKaip`, `dalyvioPavadinimas`, `dalyvioVardasIrPavarde`.

**Raw tables used directly** (no view wrapper exists or view would be counterproductive):

- `pinregJuridiniaiRysiai` — themes 11, 13, 19, 21 (revolving-door and municipal ownership date-range CTEs need raw
  access).
- `jarCsv` — themes 1, 10, 16, 22 (address self-join; `v_company` LATERAL Sodra join would be extremely expensive here).
- `domenai` — themes 10–11, 16 (domain pair self-join).
- `cpvaProjektuSutartys` — theme 12 (CPVA subcontractor data).
- `neskelbiamosDerybos` — theme 20 (audit findings, single-table lookup).
- SABIS invoice/payment tables — themes 8, 18, 22, 25 (payment-flow analysis): `sabisSutartys` (2.5M),
  `sabisSutarciuSalys` (4.2M), `sabisSaskaitos` (14.4M invoices), `sabisSaskaituSalys` (32.2M invoice parties). See
  **SABIS payment-flow analysis** below for the join chain and coverage — these tables do **not** join directly to the
  registry.

> For human investigator: when adding new raw tables (e.g. new JAR ownership exports, VRK donor data, municipal
> enterprise registries), extend this list and reference themes where the table is actually used. This keeps the LLM
> focused on relevant sources and avoids spurious joins.

### SABIS payment-flow analysis (themes 8, 18, 22, 25)

SABIS holds actual **invoice-level money-flow** data — the only source in this schema that shows what was _paid_, as
opposed to what was _contracted_ (`verte`) or _declared executed_ (`faktineIvykdimoVerte`). It is a self-contained
4-table model and **does not join directly to the procurement registry**. The direct join
`sabisSaskaitos."sutartiesUid" = v_sutartys."sutartiesUnikalusId"` returns **zero rows** — the SABIS `sutartiesUid` is a
16-char internal token (e.g. `tap9HATvC6lOsTZb`), not the numeric registry id. You must bridge through `sabisSutartys`:

```
v_sutartys."sutartiesUnikalusId" (bigint)
   = sabisSutartys."vpId"::text            -- bridge: SABIS contract → registry contract (798,740 contracts bridge)
sabisSutartys."sutartiesUid"
   = sabisSaskaitos."sutartiesUid"          -- SABIS contract → its invoices
sabisSaskaitos."sfId"
   = sabisSaskaituSalys."sfId"              -- invoice → its parties (supplier / buyer / payee), attribute by validusJarKodas
```

**Coverage (verified against the live DB):** 264,566 registry contracts carry at least one SABIS invoice with an amount
(3.14M invoice rows, ≈€42B total invoiced). But only ~36% of the 14.4M invoices have `bendraSfSuma` populated and ~36%
have `sutartiesUid` — so **absence of invoices is not evidence of non-payment**; state coverage when reporting.

**Key columns** — `sabisSaskaitos`: `bendraSfSuma` (gross total), `sumaBePvm` / `sumaPvm`, `israsymoData` (issue date),
`sfApmokejimoTerminas` (payment due date), `sfTipas` (invoice type), `cpvKodas`. `sabisSaskaituSalys`: `tipas`
(`Tiekėjas` supplier / `Pirkėjas` buyer / `Pristatymo gavėjas` delivery recipient / `Mokėjimo gavėjas` payment
recipient), `validusJarKodas`, `validusAsmensKodas` (the only reliable party identifiers — `pavadinimas` here is a hash,
resolve names via `jarCsv` / `v_company`).

**Mandatory caveats — apply or you will fabricate fraud out of dirty data:**

- **Treat over-invoice ratios as leads, not evidence.** `bendraSfSuma` contains extreme unit/decimal errors (real
  example: a €7.2M contract with €4.5B of invoices). Always apply a plausibility ceiling, inspect the individual
  invoices, and never state a raw `invoiced/verte` ratio as a finding without examining the rows behind it.
- **Filter garbage dates.** `israsymoData` ranges from year `0024` to `5025`. Bound every date query
  (`WHERE "israsymoData" BETWEEN '2010-01-01' AND CURRENT_DATE`).
- **Net out credit notes.** `sfTipas = 'Kreditinė sąskaita'` reverses a charge — exclude or subtract it, or totals
  inflate. `sfTipas = 'Išankstinė sąskaita'` is an advance/prepayment (a red flag in its own right for themes 22/25).
  ~62% of invoices have a NULL `sfTipas`.
- **Use the bridge, confirm the count.** This is a multi-hop join across 14M+ rows; always back any total with
  `execute_query` (QUANTITATIVE CLAIMS RULE) and report it as "SABIS-recorded invoiced value", not "amount paid".

### Person investigation — standard sequence

When investigating a **named individual**, always run ALL of these steps before analysing company codes:

1. `get_pinreg_asmuo("Vardas Pavardė")` — declarations, employers, linked companies, personal transactions (
   `rysiaiDelSandoriu`)
2. `search_sutartys(search="Pavardė")` — contracts where the surname appears directly in contract metadata (signatories,
   counterparties, named beneficiaries). Review carefully: results may include other persons with the same surname —
   filter by first name.
3. `search_failai(search="Vardas Pavardė")` — uploaded contract documents mentioning the person

Only then proceed with company codes found in step 1:

4. `search_sutartys(tiekejoKodas=...)` for each linked company
5. `execute_query` — for each company code that returned contracts in step 4, confirm: total contract count, total value
   (SUM), distinct buyer count, and date range. Use `v_sutartys WHERE tiekejoKodas = '...'`. This step is **mandatory**
   — step 4 returns at most 50 contracts and cannot confirm scale.

> **Common miss**: skipping step 2 because `search_failai` looks like the natural tool for person searches. It is not —
> `search_failai` searches uploaded document text, while `search_sutartys` with a name query searches contract-level
> metadata and can surface self-dealing contracts (e.g. a politician renting a car from their own party or company).

> For multiple companies ≥ 2, instead of calling search_sutartys for each code, you can try using execute_query with
> v_sutartys WHERE tiekejoKodas IN (...) — you will get aggregation in one query and reduce the risk of context
> overload.

## Theme tagging for Lithuanian institutions and OSINT

For each theme below, the tag list indicates the primary institutional interest and whether OSINT is recommended. For
OSINT (yes/no/conditional) – whether the agent should consider structured web search and open-source intelligence (e.g.
public company websites, media, OSINT registers).

These tags are **for the human investigator and LLM routing**, they do not change legal qualification of conduct.

## Supported themes (updated and extended)

Each theme is in a separate file under `./themes/`. Load the relevant file(s) before running an investigation.

| #   | Theme file                                                                                                                                                          | Subject                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | [1-shell-company-or-capacity-mismatch.md](themes/1-shell-company-or-capacity-mismatch.md)                                                                           | kompanija, sutartis                      |
| 2   | [2-bid-rigging-cover-bidding.md](themes/2-bid-rigging-cover-bidding.md)                                                                                             | kompanija, konkursas                     |
| 3   | [3-bid-rotation-carousel.md](themes/3-bid-rotation-carousel.md)                                                                                                     | kompanija, konkursas                     |
| 4   | [4-conflict-of-interest-shared-people-between-buyer-and-seller.md](themes/4-conflict-of-interest-shared-people-between-buyer-and-seller.md)                         | asmuo, kompanija                         |
| 5   | [5-contract-splitting-to-avoid-thresholds.md](themes/5-contract-splitting-to-avoid-thresholds.md)                                                                   | sutartis, konkursas                      |
| 6   | [6-geographic-monopoly-local-capture.md](themes/6-geographic-monopoly-local-capture.md)                                                                             | kompanija, sutartis, pirkėjas            |
| 7   | [7-procedure-manipulation-unjustified-direct-award.md](themes/7-procedure-manipulation-unjustified-direct-award.md)                                                 | konkursas, sutartis, pirkėjas            |
| 8   | [8-price-anomalies-over-invoicing-and-scope-creep.md](themes/8-price-anomalies-over-invoicing-and-scope-creep.md)                                                   | sutartis                                 |
| 9   | [9-compliance-and-blacklist-cross-check.md](themes/9-compliance-and-blacklist-cross-check.md)                                                                       | kompanija, asmuo, byla                   |
| 10  | [10-network-second-degree-connections-and-corporate-webs.md](themes/10-network-second-degree-connections-and-corporate-webs.md)                                     | kompanija, asmuo                         |
| 11  | [11-ubo-risk-beneficial-ownership-through-holding-layers.md](themes/11-ubo-risk-beneficial-ownership-through-holding-layers.md)                                     | kompanija, asmuo                         |
| 12  | [12-eu-structural-funds-abuse-fictitious-subcontractors-and-inflated-costs.md](themes/12-eu-structural-funds-abuse-fictitious-subcontractors-and-inflated-costs.md) | kompanija, sutartis                      |
| 13  | [13-revolving-door-procurement-officer-joins-winning-supplier.md](themes/13-revolving-door-procurement-officer-joins-winning-supplier.md)                           | asmuo                                    |
| 14  | [14-spec-rigging-technical-specifications-written-for-one-supplier.md](themes/14-spec-rigging-technical-specifications-written-for-one-supplier.md)                 | kompanija, konkursas, pirkėjas           |
| 15  | [15-framework-agreement-abuse-single-supplier-call-offs.md](themes/15-framework-agreement-abuse-single-supplier-call-offs.md)                                       | kompanija, sutartis, pirkėjas            |
| 16  | [16-shared-back-office-competing-companies-with-same-address-or-domain.md](themes/16-shared-back-office-competing-companies-with-same-address-or-domain.md)         | kompanija                                |
| 17  | [17-price-cartel-suspiciously-uniform-bid-prices.md](themes/17-price-cartel-suspiciously-uniform-bid-prices.md)                                                     | kompanija, konkursas                     |
| 18  | [18-contract-amendment-escalation-low-bid-inflate-through-amendments.md](themes/18-contract-amendment-escalation-low-bid-inflate-through-amendments.md)             | sutartis, pirkėjas                       |
| 19  | [19-municipal-company-favoritism-buyer-awards-to-own-subsidiary.md](themes/19-municipal-company-favoritism-buyer-awards-to-own-subsidiary.md)                       | kompanija, sutartis, pirkėjas            |
| 20  | [20-restricted-procedure-manipulation-buyer-hand-picks-invitees.md](themes/20-restricted-procedure-manipulation-buyer-hand-picks-invitees.md)                       | konkursas, pirkėjas                      |
| 21  | [21-political-connection-favoritism-companies-linked-to-party-donors.md](themes/21-political-connection-favoritism-companies-linked-to-party-donors.md)             | asmuo, kompanija                         |
| 22  | [22-fictitious-deliverables-contract-marked-complete-but-work-never-done.md](themes/22-fictitious-deliverables-contract-marked-complete-but-work-never-done.md)     | sutartis, byla                           |
| 23  | [23-vendor-lock-in-incumbent-supplier-structural-monopoly.md](themes/23-vendor-lock-in-incumbent-supplier-structural-monopoly.md)                                   | kompanija, sutartis                      |
| 24  | [24-eu-funds-irregularities-and-cross-border-fraud-patterns.md](themes/24-eu-funds-irregularities-and-cross-border-fraud-patterns.md)                               | kompanija, sutartis, byla                |
| 25  | [25-money-laundering-indicators-around-procurement-flows.md](themes/25-money-laundering-indicators-around-procurement-flows.md)                                     | kompanija, asmuo, byla                   |
| 26  | [26-systemic-internal-control-weaknesses-in-buyers.md](themes/26-systemic-internal-control-weaknesses-in-buyers.md)                                                 | pirkėjas                                 |
| 27  | [27-sector-specific-red-flags-healthcare-construction-it.md](themes/27-sector-specific-red-flags-healthcare-construction-it.md)                                     | kompanija, sutartis, konkursas, pirkėjas |
| 28  | [28-single-bidding-competition-intensity.md](themes/28-single-bidding-competition-intensity.md)                                                                     | konkursas, pirkėjas, kompanija           |

**Subjects** — the entity type that is the primary investigation entry point for a theme:

- **asmuo** — a named individual (signatory, official, beneficial owner, political donor)
- **byla** — an existing court or administrative case used as a starting point or expected outcome
- **kompanija** — a supplier or other private legal entity
- **konkursas** — a specific tender procedure or call for bids
- **pirkėjas** — a contracting authority (public institution); themes where the buyer's behaviour is under scrutiny
- **sutartis** — a specific signed contract

## Followup

Sector context matters. Combine MCP outputs with sector-specific supervisory authorities below. In written referrals,
clearly separate: (1) automated MCP analytical indicators, (2) corroborating evidence from OSINT and audits, and (3)
open questions requiring investigative powers (e.g. bank data, internal correspondence).

---

**Specialiųjų tyrimų tarnyba (STT)**

Description: Main anti-corruption authority. Covers corruption, abuse of office, conflict of interest, and influence
peddling. Natural escalation partner when MCP themes show bid rigging, conflict of interest, unjustified direct awards,
municipal favouritism, or vendor lock-in. Attach: key MCP queries, summarised metrics (e.g. concentration measures), and
any OSINT about involved officials.

Contact: report@stt.lt · +370 5 266 3333 · https://www.stt.lt

---

**Finansinių nusikaltimų tyrimo tarnyba (FNTT)**

Description: Financial crime investigation authority. Covers fraud, money laundering, EU funds abuse, and tax-related
crimes. Relevant when EU funds, inflated prices, shell companies, or suspicious money flows are detected. Attach:
contract lists with values and dates, beneficiary and supplier structures (UBO analysis), and signs of cross-border
flows.

Contact: +370 707 57594 · https://fntt.lrv.lt

---

**Viešųjų pirkimų tarnyba (VPT)**

Description: Public procurement supervisory authority. Covers procurement law compliance and procedure correctness.
First point of contact when issues are primarily procedural (threshold splitting, wrong procedure type, poor tender
design) but not yet clearly criminal.

Contact: info@vpt.lt · +370 603 89015 · https://vpt.lrv.lt

---

**Valstybės kontrolė (VK)**

Description: National audit office. Covers systemic weaknesses and EU funds eligibility issues. Relevant when patterns
appear systemic in a specific sector or institution (e.g. repeated findings across years). VK audit mandate is key for
structural remedies.

Contact: info@vkontrole.lt · +370 5 266 6700 · https://www.vkontrole.lt

---

**Konkurencijos taryba (KT)**

Description: Competition authority. Covers cartels, bid rigging, and anti-competitive agreements. Relevant when bid
rotation, cover bidding, or price cartel patterns are strong. KT has specialised enforcement tools and sanctions under
competition law.

Contact: tarnyba@kt.gov.lt · +370 5 261 2819 · https://kt.gov.lt
