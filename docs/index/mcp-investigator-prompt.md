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

- `v_company` [themes 1, 5–7, 9–12, 19, 22–23]: `jarCsv` + `sodra` (LATERAL) + compliance flags → `draustieji`,
  `vidutinisAtlyginimas`, `melagingiTiekejai`, `nepatikimiTiekejai`, `vdiPazeidimaiFlag`, `bylosKiekis`,
  `domenaiKiekis`, `neskelbiamosDerybosKiekis`.
- `v_sutartys` [themes 1–3, 5–8, 13, 15–16, 18–20, 22–24]: `sutartys` + `jarCsv` ×2 → `pirkejas`, `tiekejas`,
  `pirkejoKodas`, `tiekejoKodas` (names resolved).
- `v_pirkimas` [themes 5–7, 14, 20, 24]: `viesiejiPirkimai` + `viesiejiPirkimaiVykdytojai` → `vykdytojoPavadinimas`,
  `savivaldybe`, `shortCode`, `verteEur`.
- `v_person_links` [themes 4, 10–11, 13, 19, 21]: `pinregJuridiniaiRysiai` + `jarCsv` → `imonesVardas`,
  `registruotaLietuvoje`, `yraJuridinisAsmuo`.
- `v_dalyviai` [themes 2–3, 14, 17]: `atn1ataskaitos` + `atn1dalyviai` + `atn1pasiulymuEile` + `atn1atmestiPasiulymai` +
  `jarCsv` → `pasiulymoKaina` (numeric), `eileNumeris`, `atmetimoPriezastis`, `tiekejas`. **⚠ Coverage**: ATN1 contains
  ~443 reports from ~20 buyer organisations only (dominated by Kauno klinikos). Before querying `v_dalyviai` for a
  specific supplier or buyer, verify coverage:
  `SELECT COUNT(*) FROM atn1ataskaitos WHERE "perkanciosiosOrganizacijosKodas" = '<kodas>'`. If the result is 0,
  competition analysis via this view is **not possible** for that entity — state this explicitly rather than inferring
  absence of competition.
- `v_bylos` [themes 9, 23–24]: `bylosDalyviai` + `bylos` + `jarCsv` → `bylosRusis`, `teismas`, `bylojeKaip`,
  `pavadinimas`.

**Raw tables used directly** (no view wrapper exists or view would be counterproductive):

- `pinregJuridiniaiRysiai` — themes 11, 13, 19, 21 (revolving-door and municipal ownership date-range CTEs need raw
  access).
- `jarCsv` — themes 1, 10, 16, 22 (address self-join; `v_company` LATERAL Sodra join would be extremely expensive here).
- `domenai` — themes 10–11, 16 (domain pair self-join).
- `cpvaProjektuSutartys` — theme 12 (CPVA subcontractor data).
- `neskelbiamosDerybos` — theme 20 (audit findings, single-table lookup).
- other specialized tables (e.g. accounts, invoices) when added — see `get_schema`.

> For human investigator: when adding new raw tables (e.g. new JAR ownership exports, VRK donor data, municipal
> enterprise registries), extend this list and reference themes where the table is actually used. This keeps the LLM
> focused on relevant sources and avoids spurious joins.

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
