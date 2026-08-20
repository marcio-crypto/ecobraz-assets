# Documenting Avoided Emissions from Correct Waste Destination

### A declaration protocol with explicit baseline, traceable factors, and separation from the GHG inventory

**Author:** Marcio Villanova — ORCID [0009-0001-8072-6287](https://orcid.org/0009-0001-8072-6287)
**Affiliation:** Villanova ESG
**Version:** 1.0 · **Type:** Technical report (author-controlled; not peer reviewed)
**Licence:** CC BY 4.0
**Web reference:** https://villanovaesg.com

> **Status of this document.** This is a version 1.0 technical report. A Zenodo deposit and DOI make it identifiable and retrievable; they do **not** constitute peer review, regulatory approval or institutional endorsement. This report is **about the form of a declaration**, not about any quantity: it contains **no emission factor, no baseline value and no result**, by design. It does not replace legal, technical or assurance advice, and conformity to the protocol is not a verification. Standards and legal instruments are cited for orientation and **must be verified against current official sources**; several are under transition. Points where the underlying research base recorded uncertainty are marked ⚠️.

> **Declaration of interest.** The author is CEO of Ecobraz, a Brazilian company operating in post-use electronic asset collection and destination, and founder of Villanova ESG. The author has a commercial interest in services that produce such declarations. The protocol is vendor-neutral and names no product. **No figure produced by any organisation, including the author's, is presented, endorsed or validated here.**

---

## Abstract

Correct destination of post-use material avoids emissions that would have occurred under an alternative fate. That statement is defensible; almost everything commonly built on top of it is not. Avoided emissions are **counterfactual** — they are the difference between what happened and a scenario that did not — and this gives them three properties that are routinely ignored: they cannot be subtracted from the emitting organisation's inventory, they are not offsets, and they cannot support a neutrality claim. This report specifies a **declaration protocol**: nine mandatory elements that make an avoided-emissions statement reproducible and auditable, centred on an **explicit and justified baseline**, **traceable emission factors** carrying source, year, unit and geography, and a **documented assumptions register** that states the direction in which each assumption biases the result. It also gives a claim-language table separating what may be said from what may not, under the current anti-greenwashing constraints on both sides of the Atlantic. The governing rule, stated as policy rather than aspiration: **publish the method before the number, and report a gap rather than substitute a default.**

**Keywords:** avoided emissions; baseline; counterfactual; emission factors; GHG inventory; Scope 3; greenwashing; recycling; declaration protocol; assurance.

---

## 1. The distinction that everything rests on

Three quantities are routinely conflated. They are different objects with different rules, and auditors penalise the conflation more heavily than they penalise a conservative number.

| | **Inventory** | **Avoided emissions** | **Offset / compensation** |
|---|---|---|---|
| **What it measures** | Emissions attributable to an organisation's own activity and value chain (Scopes 1, 2, 3) | The difference between an actual outcome and a counterfactual alternative fate | A verified reduction or removal achieved elsewhere, transferred as a credit |
| **Basis** | Corporate greenhouse-gas accounting (GHG Protocol; ISO 14064-1) | Project-level / comparative quantification (ISO 14064-2; project-accounting guidance; life-cycle method where applicable) | Credit standards with independent verification and registry retirement |
| **Can be subtracted from the inventory?** | It *is* the inventory | **No** | Only per the applicable rules on residual compensation; never as a substitute for reduction |
| **Reported where** | The inventory | **Separately, always** | Separately, with credit identification |
| **Supports a "neutral" claim?** | — | **No** | Severely constrained, and prohibited at product level in the EU where based on offsetting (below) |

**The hard rule.** Avoided emissions are reported **separately** from Scopes 1, 2 and 3; they are **not** subtracted from them; they are **not** offsets; and they do **not** support a net-zero or carbon-neutral claim unless and until they have been converted into verified credits, which is a different undertaking with its own requirements. This is the consensus position across corporate greenhouse-gas accounting guidance and target-setting frameworks, which exclude avoided emissions from target accounting.

**What this leaves, and it is not small.** A supplier may state that correct destination of a stated mass **avoided** a quantified amount of emissions relative to a stated alternative fate, and a buyer may report that statement as what it is. That is a real, defensible, reportable fact. It is simply not a discount on the buyer's own account.

## 2. Why the baseline is the whole problem

An inventory figure describes something that happened. An avoided-emissions figure describes the distance between something that happened and **something that did not**. The counterfactual is therefore not a detail of the calculation; it *is* the claim. Two operators with identical operations and identical factors will publish different numbers if they assume different alternative fates, and neither is lying.

A defensible baseline meets five conditions:

1. **Explicit.** The alternative fate is stated in words before it is stated in numbers — what would have happened to this material, where, under what practice.
2. **Realistic, not worst-case.** The baseline is the **plausible alternative**, not the most damaging imaginable one. Selecting the worst conceivable fate inflates the result and is the most common way an otherwise sound calculation becomes indefensible.
3. **Sourced.** The basis for believing that alternative is what would have occurred — regional practice, sector data, the client's prior arrangement — is documented and referenced.
4. **Stable and versioned.** The baseline is not re-selected per period to favour the result. When it changes, the change is dated, explained, and prior periods are marked as computed on the previous basis.
5. **Tested.** The effect on the result of a reasonable alternative baseline is stated. If a different plausible counterfactual changes the answer by an order of magnitude, that fact belongs in the declaration.

**Conservatism rule.** Where a choice between defensible baselines exists, the one producing the **lower** avoided figure is selected, and the choice is recorded. A number chosen to be defensible survives scrutiny; a number chosen to be impressive does not.

## 3. The declaration protocol

Nine mandatory elements. A declaration missing any of them is not reproducible, and a figure that cannot be reproduced cannot be audited.

**E1 — Subject and boundary.** Whose material, over what period, and which operations are inside the boundary. What is excluded is stated explicitly, not left to inference.

**E2 — Functional unit and period.** The unit the result is expressed in and the period covered. Results for different periods are not merged without restating both.

**E3 — Mass by flow, tied to source documents.** Mass per material stream, each traceable to the destination documents that evidence it — in the Brazilian case, to the manifests and destination certificates by identifier. **A mass that cannot be tied to a destination document does not enter the calculation.** (On how those documents are structured and joined, see DOI 10.5281/zenodo.XXXXXXX and the crosswalk record.)

**E4 — Baseline scenario.** Per §2: explicit, realistic, sourced, versioned, tested.

**E5 — Emission factors, traceable.** Each factor carries **source, publication year, version, unit, and geographic scope**, and is reproducible by a third party from that reference alone. A factor taken from a secondary compilation is cited to the compilation *and* to its original source. **Where no defensible factor exists for a stream, the stream is reported as not quantified — it is not filled with a proxy from another geography or another material.**

**E6 — Method and formula.** The calculation is stated so that a third party with E3, E4 and E5 arrives at the same result. A method described only as "internationally recognised methodology" is not a method.

**E7 — Assumptions register.** Every assumption, its justification, and **the direction in which it biases the result** (increases it, decreases it, unclear). This element does more for credibility than any other, because it is the one a reviewer checks to decide whether the author was trying to be right or trying to be impressive.

**E8 — Uncertainty and sensitivity.** A stated range or, at minimum, the effect on the result of varying the most influential assumptions. A single figure presented without any indication of its sensitivity implies a precision that the method does not have.

**E9 — The non-fungibility statement, verbatim and prominent.** That the figure represents **avoided emissions**; that it must **not** be subtracted from Scopes 1, 2 or 3; that it is **not** an offset or compensation; and that it does **not** support a carbon-neutral or net-zero claim. This is not fine print — its absence is what allows a good-faith recipient to misuse a correct number.

## 4. Claim language

Not stylistic advice. In Brazil, an unsubstantiated environmental claim may be treated as misleading advertising under consumer protection law; in the European Union, from **27 September 2026**, labelling a **product** as climate or carbon neutral **on the basis of offsetting** is a prohibited practice **regardless of the quality of the credits**, with substantial penalties. ⚠️ Verify both regimes, and the transposition in the relevant member state, before publishing any claim.

| ✅ Defensible | ❌ Not defensible |
|---|---|
| "Correct destination of [mass] avoided an estimated [quantity] relative to [stated baseline], per the method in this declaration" | "Reduced your carbon footprint by [quantity]" |
| "Reported separately from the inventory; not deducted from Scopes 1/2/3" | "Offsets [quantity] of your emissions" |
| "We support [project], which removed [quantity], verified by [body]" | "Carbon-neutral product" / "climate neutral" / "reduced climate impact" — where based on offsetting |
| "Not quantified for [stream]: no defensible factor available" | Filling the gap with a proxy factor and not saying so |
| "Avoided emissions are not counted toward science-based targets" | "Counts toward your net-zero target" |

**The asymmetry worth internalising.** The defensible column is *longer and more specific* than the marketing column, and reads as more credible to a professional audience for exactly that reason. The constraint is not a cost; a supplier who states limits precisely is the one a due-diligence team trusts with the rest.

## 5. Levels of assurance

Declarations are not equal, and the level should be stated on the face of the document rather than implied.

| Level | What it is | Weight with a buyer |
|---|---|---|
| **Self-declared** | Prepared and issued by the interested party | Lowest; adequate only where the method is fully disclosed and reproducible |
| **Internally reviewed** | Reviewed by a competent function independent of the commercial line | Moderate; the reviewer and their independence are named |
| **Independently verified** | Third-party verification against a recognised standard, at a stated level of assurance | Highest; state the verifier, the standard, and whether limited or reasonable |

⚠️ The assurance standards in this area are in transition: the specific greenhouse-gas assurance standard is being superseded by a general sustainability assurance standard, effective for periods beginning on or after **15 December 2026**, with early application permitted. Verify which standard applies to the engagement being commissioned.

**A self-declared figure with a fully disclosed method is worth more than a verified figure whose method is opaque** — because the first can be checked and the second must be trusted. This ordering surprises people, and it is the reason the protocol prioritises E4–E7 over the assurance level.

## 6. Where the figure lands in the buyer's reporting

The purpose of getting this right is that the buyer can use it.

- **Waste and circularity reporting** (ESRS E5; GRI 306 for voluntary reporters) consumes **mass by destination method** — which comes from the destination documents, **not** from this declaration. This is the strongest and most direct use of a Brazilian supplier's evidence, and it requires no carbon figure at all.
- **Climate reporting** (ESRS E1; IFRS S2 as adopted in the buyer's jurisdiction) consumes **inventory** figures on a corporate greenhouse-gas accounting basis. An avoided-emissions figure **does not enter** these disclosures as an inventory item; where it appears, it appears separately and labelled.
- ⚠️ The scope and timetable of the European reporting regime have been under revision; verify what applies to the specific buyer before designing a deliverable around it.

**The practical implication for a supplier deciding where to invest:** the destination evidence pays off in the buyer's reporting immediately and without a carbon calculation. Building the carbon declaration first, on top of weak destination evidence, inverts the order of value.

## 7. Limitations

This is a version 1.0 protocol, not peer reviewed, not empirically validated, and not a standard. **It deliberately contains no emission factors, no baseline values, no results, and no assessment of any organisation's figures, including the author's.** It concerns the form and disclosure of a declaration, not the accuracy of any calculation performed under it: a declaration can satisfy all nine elements and still be wrong, and conformity to the protocol is not verification. The legal constraints summarised in §4 are cited for orientation, are subject to transposition and amendment, and are **not legal advice**. Standards referenced are in transition and ⚠️ must be verified. Nothing here converts avoided emissions into offsets or supports any neutrality claim.

## 8. How to cite

> Villanova, M. (2026). *Documenting Avoided Emissions from Correct Waste Destination: A declaration protocol with explicit baseline, traceable factors, and separation from the GHG inventory* (Version 1.0) [Technical report]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

*(DOI to be inserted after deposit.)*

## References

Standards and instruments are cited for orientation; verify current editions, status and applicability at the official source.

1. GHG Protocol — Corporate Accounting and Reporting Standard; Scope 2 Guidance; Corporate Value Chain (Scope 3) Standard; Project Accounting Protocol.
2. ISO 14064-1 (organisational inventories), ISO 14064-2 (project-level quantification), ISO 14064-3 (validation and verification). ⚠️ Verify current editions.
3. ISO 14040 / ISO 14044 (life-cycle assessment); ISO 14067 (product carbon footprint). ⚠️ Verify current editions and amendments.
4. WBCSD guidance on avoided emissions; Science Based Targets initiative treatment of avoided emissions. ⚠️ Verify current versions.
5. Assurance standards for greenhouse-gas and sustainability information, including the general sustainability assurance standard effective for periods beginning on or after 15 December 2026. ⚠️ Verify which applies.
6. Directive (EU) 2024/825 — empowering consumers for the green transition; applicable from 27 September 2026. ⚠️ Verify transposition.
7. Brazil. Law 8.078/1990 (Consumer Protection Code) — misleading advertising. ⚠️ Verify.
8. Brazil. Law 15.042/2024 — Brazilian Emissions Trading System, applicable above stated thresholds and phased in. ⚠️ Verify regulation and timetable; no general obligation to compensate arises from it for companies below those thresholds.
9. ESRS E1 and E5; GRI 306: Waste (2020); IFRS S1/S2. ⚠️ Verify scope and timetable, under revision.
10. Villanova, M. (2026). *Evidence Architecture for Post-Use Electronic Assets.* Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX ⚠️ Insert DOI after deposit.
11. Villanova, M. (2026). *From MTR/SINIR to the European Buyer: A crosswalk.* Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX ⚠️ Insert DOI after deposit.
12. Villanova, M. (2026). *The Supplier Evidence Maturity Model (SEMM).* Zenodo. https://doi.org/10.5281/zenodo.21445455
