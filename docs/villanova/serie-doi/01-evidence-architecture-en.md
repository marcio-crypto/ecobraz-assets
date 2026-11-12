# Evidence Architecture for Post-Use Electronic Assets

### A capture-event model linking operational steps to buyer-readable documentation

**Author:** Marcio Villanova — ORCID [0009-0001-8072-6287](https://orcid.org/0009-0001-8072-6287)
**Affiliation:** Villanova ESG
**Version:** 1.0 · **Type:** Technical report (author-controlled; not peer reviewed)
**Licence:** CC BY 4.0
**Web reference:** https://villanovaesg.com

> **Status of this document.** This is a version 1.0 technical report. A Zenodo deposit and DOI make it identifiable and retrievable; they do **not** constitute peer review, regulatory approval or institutional endorsement. This report supports methodology and reference — it does **not** replace legal, customs, technical or assurance advice for a specific case. "Audit-grade" describes an evidence concept, not an audit opinion. Regulatory instruments named here are cited for orientation only and **must be verified against current official sources** (Planalto, EUR-Lex and the competent authorities) before any operational decision.

> **Declaration of interest.** The author is CEO of Ecobraz, a Brazilian company that operates post-use electronic asset collection and destination, and founder of Villanova ESG. The author therefore has a commercial interest in systems of the kind described. The model presented here is deliberately vendor-neutral and implementable by any operator, including competitors; no product is named, specified or endorsed, and no claim is made that any particular implementation conforms to it.

---

## Abstract

A recurring failure in post-use electronic asset management is not the absence of good operational practice, but the absence of a **record structure** that carries that practice forward into documentation a buyer or auditor can read. Operations capture data — photographs, weights, manifests, invoices, certificates — yet the resulting file frequently cannot answer the buyer's actual question: *which delivered lot is this, where did it go, and what connects the two?* This report specifies an **evidence architecture**: a model of discrete **capture events** along the chain from collection request to final destination, each defined by its minimum fields, the actor who produces it, the claim it can support, and — explicitly — the claim it cannot support. The citable artifact is the **capture-event table** together with three **linkage rules** that identify where evidence chains break in practice (lot identity across hand-off, document-to-event join, and mass reconciliation). The architecture is instrument-agnostic and is mapped to the evidence categories and maturity levels of the Supplier Evidence Maturity Model (SEMM). It is a design specification for what a system must record, not an audit method and not an assessment of any operator.

**Keywords:** evidence architecture; chain of custody; e-waste traceability; WEEE; capture event; audit-grade documentation; mass balance; supplier evidence; certificate of destination; Brazil.

---

## 1. Introduction and delta over prior records

Two earlier records in this series established the conceptual ground. *Cadeia de Custódia de Resíduos Eletroeletrônicos* (DOI 10.5281/zenodo.21398390) argued that custody evidence must be continuous to be meaningful, and *Da Coleta à Destinação: O que Cada Etapa Pode Sustentar — e o que Não Sustenta* (DOI 10.5281/zenodo.21398750) set out, step by step, which claims each operational stage can and cannot bear. *Evidência de Destinação Ambiental* (DOI 10.5281/zenodo.21398814) showed the limits of isolated documents and certificates.

Those records answer **what** must hold. This one answers **how a system must record it**. The contribution is narrower and more mechanical: a **capture-event model** — the structure of the record itself, the fields it must contain to remain joinable, and the joins that fail in practice. The distinction matters because most evidence loss observed operationally is not a missing step; it is a step that happened and was recorded in a form that cannot be joined to the steps on either side of it.

The model is written for two readers: the operator designing or buying a system, and the corporate client or European buyer trying to state, in a request for information, what it actually needs to receive.

## 2. Scope and method

The model was developed by structured synthesis of (a) the operational stages common to post-use electronic asset flows in Brazil; (b) the documentation categories that European supply-chain requests recur to, as organised in the SEMM (DOI 10.5281/zenodo.21445455); and (c) the failure modes that arise when a record exists but cannot be joined, dated or attributed.

It is a **conceptual and design** contribution. It presents no primary statistics, reports no sample of operators, and makes no claim about how frequently any failure mode occurs. Where a Brazilian instrument is named — the National Solid Waste Policy (Law 12.305/2010), the MTR/SINIR manifest system, state systems such as SIGOR/CETESB, operating licences and CADRI — it is named as **orientation for where an obligation may sit**, and ⚠️ **must be verified** against the current official text and against the rules of the specific state involved, which differ.

## 3. The unit of the model: the capture event

An **evidence record** is not a document. It is a set of **capture events**, each of which is an assertion made by an identified actor, at an identified moment, about an identified subject.

A capture event is well-formed when it carries seven attributes:

| Attribute | What it fixes | Why it is required |
|---|---|---|
| **Event type** | What happened (collection, weighing, hand-off, treatment, destination) | Without a type, records cannot be ordered or compared |
| **Subject identity** | Which lot, load or asset the assertion is about | The join key for everything downstream |
| **Actor** | Who asserts it (person, role, organisation) | Attribution; an unattributed record is not defensible |
| **Timestamp** | When the assertion was made | Ordering, and detection of retrospective creation |
| **Location** | Where it occurred | Distinguishes site-level claims from generic ones |
| **Measured attributes** | The values captured (weight, count, material class, condition) | The substance of the claim |
| **Linked artifacts** | Documents, images or records attached at that moment | What converts an assertion into evidence |

Two design rules follow directly:

- **Capture at the moment, not afterwards.** A weight typed in the next day is a *statement about* a weighing; a weight recorded at the weighbridge is the weighing. Both may be true; only one is evidence of itself.
- **Never overwrite a capture event.** Corrections are new events that reference the corrected one. An evidence base that permits silent edits cannot support attribution, which is the property everything else rests on. (This is the same requirement that Section 7 of the SEMM calls *governance and accountability*.)

## 4. The capture-event table

The eight events below are the ordered spine of a post-use electronic asset flow. For each: the minimum fields, the claim it supports, and — the column most often missing from vendor descriptions — the claim it **does not** support.

| # | Event | Minimum fields | Supports the claim | Does **not** support |
|---|---|---|---|---|
| **1** | **Collection request** | Client identity, site, requested scope, date, requester | That the client initiated a controlled disposal, on a date | Anything about what was actually collected |
| **2** | **On-site capture** | Lot id, photographs, item classes, counts, indicative weight, operator, timestamp, geolocation | That specific material left a specific site, documented at the moment | Final weights; material composition after sorting |
| **3** | **Transport hand-off** | Lot id, transporter identity, vehicle, departure time, receiving signature, manifest reference | Custody transferred to an identified party | That the load arrived unchanged |
| **4** | **Gate-in weighing** | Lot id, gross/tare/net weight, scale identity, timestamp, operator | An authenticated arrival mass at the receiving facility | The composition of that mass |
| **5** | **Receiving & segregation** | Lot id, material classes with weights, non-conformities found, operator | What the load actually consisted of, by class | That each class was subsequently treated as recorded |
| **6** | **Treatment / processing** | Lot id or batch id, process applied, outputs by class and weight, data-sanitisation records where applicable | That a defined process was applied to defined material | Environmental outcome; carbon effect |
| **7** | **Outbound to destination** | Batch id, receiving destination identity **and its licence reference**, weight, manifest reference, date | That material of a stated mass left for an identified, licensed destination | That the destination processed it as intended |
| **8** | **Destination confirmation & certificate** | Manifest closure reference, destination confirmation, certificate identifier, issuer, technical officer | Documented, closed destination for the stated mass | Any claim about carbon, and any claim about material not covered by the closed manifest |

Two observations that follow from the fourth column:

- **No single event supports a full-chain claim.** The full-chain claim is an emergent property of the joins, not of any one record. This is why a certificate presented alone is weak evidence, as argued in DOI 10.5281/zenodo.21398814 — not because it is false, but because it summarises a chain that it does not itself contain.
- **Carbon is absent from every row.** No operational capture event evidences avoided emissions; that claim requires a stated method and factors applied to the recorded masses, and is a separate documentary object with separate rules. It is deliberately out of scope here.

## 5. The three linkage rules

Well-formed events are necessary and not sufficient. Evidence is lost at the joins. Three rules address the three joins that fail.

**Rule 1 — Identity survives hand-off.** The lot identifier assigned at on-site capture (event 2) must persist, unchanged, through hand-off, weighing and receiving (events 3–5), and must be traceable into the batch identifier used downstream (events 6–8). Where a facility consolidates several lots into one processing batch, the many-to-one relation must be recorded explicitly, with the contributing masses.
*Failure mode:* a lot is renumbered at the gate under the receiving facility's own scheme, and the on-site photographs and the gate weight become two unrelated records of the same material.

**Rule 2 — Every document is attached to an event, never to a period.** Invoices, manifests, licences, donation letters and certificates must each reference the event or events they evidence. A document filed against a client and a month, rather than against a lot and an event, cannot answer a lot-level question.
*Failure mode:* the file contains all the correct documents and still cannot demonstrate that *this* delivery went to *that* destination.

**Rule 3 — Mass is reconciled, and the residual is stated.** Inbound mass (event 4) must be reconciled against the sum of outbound masses by destination (event 7), plus recorded internal stock and recorded losses. A reconciliation that does not close is not a reason to suppress the number; the **residual, its size and its explanation are themselves evidence** of a controlled operation.
*Failure mode:* percentages of "recycled material" are reported with no mass balance behind them — the condition described in DOI 10.5281/zenodo.21399040 as indicators without evidence.

Rule 3 carries a corollary worth stating plainly: **an operation that cannot close its mass balance cannot substantiate a destination percentage**, whatever its certificates say.

## 6. Buyer-readability: the output layer

The events and joins are internal. What the buyer receives is a **derived view**, and the architecture must be able to produce it without a special project. Three views cover most requests:

1. **Lot dossier** — one delivery, all eight events in order, with attached documents and the reconciliation for its batch.
2. **Period file** — all lots for a client over a period, with an aggregate reconciliation and a statement of what is *not* covered (lots disposed of elsewhere; open manifests at the cut-off date).
3. **Exception report** — the non-conformities recorded at event 5, the unclosed manifests, and the unreconciled residual. Publishing exceptions is counter-intuitive commercially and is the single strongest indicator of a controlled evidence base, because it demonstrates that the system detects its own gaps.

The completeness statement in views 2 and 3 is not a caveat; it is a required element. A period file that implies full coverage while covering only the lots the operator handled misrepresents the client's position — a risk that transfers to the buyer that relies on it.

## 7. Mapping to the SEMM

The architecture is the operational layer under three of the seven SEMM evidence categories (DOI 10.5281/zenodo.21445455, §5): *identity and traceability*, *chain of custody*, and *environmental destination*. Its relation to the maturity levels is direct:

| SEMM level | Corresponding state of the architecture |
|---|---|
| **0 Opaque** | Events occur; few are captured. Claims rest on assurance |
| **1 Documented** | Events captured, but as free-form documents; identity does not survive hand-off (Rule 1 fails) |
| **2 Structured** | All eight events captured with minimum fields; documents attached to events (Rule 2 holds); reconciliation not yet routine |
| **3 Buyer-ready** | Rules 1–3 hold; the three derived views can be produced on request without reprocessing |
| **4 Continuously assured** | Exception reporting is routine and internal; the residual is monitored over time; corrections are versioned, never overwritten |

The practical implication for an operator at Level 1 is that the cheapest available level jump is usually **Rule 2** — attaching existing documents to existing events. It requires no new data capture, only a change in how what already exists is filed.

## 8. Limitations

This is a version 1.0 conceptual and design contribution, not peer reviewed and not empirically validated against a sample of operators. It presents no primary statistics. The eight events are a common spine, not a universal one: flows involving refurbishment and resale, cross-border movement, or hazardous fractions requiring specific licensing carry events not modelled here. The model addresses the **provability** of operational steps, not their environmental merit, and produces no statement about carbon. Brazilian legal and manifest-system references are orientation only, vary by state, and ⚠️ must be verified against current official sources. Nothing here constitutes legal, technical or assurance advice, and conformity to this architecture is not, and cannot be, a compliance certification.

## 9. How to cite

> Villanova, M. (2026). *Evidence Architecture for Post-Use Electronic Assets: A capture-event model linking operational steps to buyer-readable documentation* (Version 1.0) [Technical report]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

*(DOI to be inserted after deposit.)*

## References

Regulatory instruments are cited for orientation; verify exact titles, numbers and dates at the official source.

1. Villanova, M. (2026). *Cadeia de Custódia de Resíduos Eletroeletrônicos: Integridade, Continuidade e Rastreabilidade da Evidência.* Zenodo. https://doi.org/10.5281/zenodo.21398390
2. Villanova, M. (2026). *Da Coleta à Destinação: O que Cada Etapa Pode Sustentar — e o que Não Sustenta.* Zenodo. https://doi.org/10.5281/zenodo.21398750
3. Villanova, M. (2026). *Evidência de Destinação Ambiental: Alcance e Limites de Documentos, Registros e Certificados Isolados.* Zenodo. https://doi.org/10.5281/zenodo.21398814
4. Villanova, M. (2026). *Indicadores sem Evidência: Limites de Peso, Volume e Percentuais de Reciclagem na Prestação de Contas Corporativa.* Zenodo. https://doi.org/10.5281/zenodo.21399040
5. Villanova, M. (2026). *The Supplier Evidence Maturity Model (SEMM).* Zenodo. https://doi.org/10.5281/zenodo.21445455
6. Brazil. Law 12.305/2010 — National Solid Waste Policy; the MTR/SINIR manifest system and state systems (e.g. SIGOR/CETESB). ⚠️ Verify current text, competent system and state-specific rules.
