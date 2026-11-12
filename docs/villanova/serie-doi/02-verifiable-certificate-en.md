# A Minimum Specification for Verifiable Environmental-Destination Certificates

### Persistent identifiers, resolution, revocation — and the limits of what verification proves

**Author:** Marcio Villanova — ORCID [0009-0001-8072-6287](https://orcid.org/0009-0001-8072-6287)
**Affiliation:** Villanova ESG
**Version:** 1.0 · **Type:** Technical report (author-controlled; not peer reviewed)
**Licence:** CC BY 4.0
**Web reference:** https://villanovaesg.com

> **Status of this document.** This is a version 1.0 technical report. A Zenodo deposit and DOI make it identifiable and retrievable; they do **not** constitute peer review, regulatory approval or institutional endorsement. This report supports methodology and reference — it does **not** replace legal, technical or assurance advice for a specific case. The specification below is an **author-proposed** minimum, not a standard issued by a standards body, and conformity to it is not a compliance certification. Legal and data-protection instruments are cited for orientation and **must be verified** against current official sources before any operational decision.

> **Declaration of interest.** The author is CEO of Ecobraz, a Brazilian company that issues destination documentation for post-use electronic assets, and founder of Villanova ESG. The author therefore has a commercial interest in systems of the kind specified here. The specification is deliberately vendor-neutral and implementable by any issuer, including competitors; no product is named or endorsed, and no claim is made that any particular implementation conforms to it.

---

## Abstract

Certificates of environmental destination are widely issued and weakly verifiable. A recipient typically holds a PDF whose authenticity rests on its appearance: a logo, a signature image, a number in a format nobody outside the issuer can check. Adding a QR code to such a document does not by itself change this, because the property that matters is not the presence of a code but what resolving it returns, who controls the resolution, and whether the answer remains available and truthful over the document's useful life. This report specifies a **minimum set of ten requirements** for a verifiable destination certificate — persistent identifier, resolution behaviour, issuer identity, integrity binding, revocation and supersession, temporal validity, data minimisation, offline and failure behaviour, printed-artifact equivalence, and disclosure of scope — together with a **conformance checklist** and an explicit statement of the **limits of verification**. The central claim is that verification can establish that a certificate is authentic, unaltered and current; it cannot establish that the physical destination occurred as described. Conflating those two is the principal failure mode the specification is designed to prevent.

**Keywords:** verifiable certificate; certificate of destination; persistent identifier; QR verification; document integrity; revocation; chain of custody; audit-grade documentation; anti-fraud; e-waste.

---

## 1. The problem

A corporate client receives a certificate stating that a quantity of post-use electronic material reached a licensed destination. The client files it. Two years later an auditor, a buyer's due-diligence team or a regulator asks whether the document is genuine.

At that moment the client discovers what the document can and cannot do. Typically it can be photocopied, retyped, altered in a PDF editor without visible trace, or produced *de novo* by anyone with the layout. Its number means nothing outside the issuer's own records, and asking the issuer is not verification — it is a second assurance from the same interested party, delivered by e-mail, with no better standing than the first.

The direction of travel in European supply-chain practice, as set out in prior records in this series, is that buyers act on documentation they can **read, trust and defend to their own auditors**. A document that only its issuer can vouch for does not meet that condition. This report specifies the minimum that changes it.

It is important to state at the outset what this does *not* replace. In Brazil, waste manifests and destination certificates are governed by public systems — the MTR/SINIR framework under the National Solid Waste Policy, and state systems such as SIGOR/CETESB — and the legally operative record is the one held there, issued by a licensed destination operator with the responsible technical officer's signature. ⚠️ **Verify** the current instruments, the competent system and the applicable state rules. Anything specified below is a **supplementary verifiability layer** over documentation that must, independently, reflect the real chain and the correct official system.

## 2. Scope and method

The requirements were derived by working backwards from a threat model (Section 3) to the minimum properties that defeat each threat, and by applying the general design of verifiable-credential and persistent-identifier systems — where an identifier resolves, through a controlled service, to an authoritative statement about a referent — to the specific case of environmental destination.

This is a **design specification**, not an empirical study. It presents no statistics and evaluates no existing product. Requirement levels use the conventional reading: **MUST** for requirements without which the certificate is not verifiable in the sense used here; **SHOULD** for requirements a conforming issuer is expected to meet unless there is a stated reason not to.

## 3. Threat model

The specification addresses six threats. A verification mechanism that does not name its threat model cannot be assessed.

| # | Threat | What the attacker does |
|---|---|---|
| **T1** | **Fabrication** | Produces a certificate that was never issued, copying the layout |
| **T2** | **Alteration** | Takes a genuine certificate and changes weights, dates, destination or client |
| **T3** | **Replay** | Attaches a valid identifier or code from a genuine certificate to a different document |
| **T4** | **Silent revision** | The issuer alters an already-delivered certificate, and the holder's copy and the authoritative record diverge without notice |
| **T5** | **Link rot** | The verification service moves or disappears; the certificate becomes unverifiable precisely when it is finally examined |
| **T6** | **Over-reading** | The verification result is genuine, and the recipient reads into it a claim it never made — typically that the physical destination is confirmed |

T6 is not a technical attack and is the most consequential, because it is committed in good faith by the party relying on the document. Requirement R10 exists for it.

## 4. The specification

**R1 — Persistent identifier (MUST).**
Each certificate carries an identifier that is unique, opaque (it must not encode client identity, sequence position or volume), permanent, and never reused — including after cancellation. The identifier, not the file, is the certificate's identity.

**R2 — Resolution (MUST).**
The identifier resolves, over a public interface controlled by the issuer, to a statement about that certificate. Resolution must be possible without an account, without contacting the issuer's staff, and without software beyond a standard browser. A QR code, where present, is one encoding of the identifier and is not itself the verification mechanism.

**R3 — Defined response content (MUST).**
Resolution returns, at minimum: current status (valid / revoked / superseded / unknown); issue date; issuer identity; and an integrity value for the document (R4). It returns the substantive fields — masses, dates, destination, client — **only** under the disclosure rule in R7.

**R4 — Integrity binding (MUST).**
The response allows the holder to determine whether the file in hand is the file that was issued, by publishing a cryptographic digest of the issued document, or by the resolution service rendering the authoritative version for comparison. Without R4, T2 and T3 survive R1–R3: an unaltered identifier on an altered document still resolves to "valid".

**R5 — Issuer identity (MUST).**
The response identifies the issuing legal entity, and states the licence or authorisation under which the destination it attests was performed, with a reference the recipient can check against the competent public system. An issuer that cannot point outside itself has produced self-assurance with extra steps.

**R6 — Revocation and supersession (MUST).**
Certificates can be revoked or superseded, and the resolution response states which, with the date and a non-identifying reason category, and links to the superseding certificate where one exists. Prior versions remain resolvable and are marked as superseded. Nothing is deleted; correction is a new record that references the old one — the same non-overwrite rule the evidence architecture applies to capture events (DOI 10.5281/zenodo.XXXXXXX, §3).

**R7 — Data minimisation in public responses (MUST).**
An identifier is, by construction, guessable-adjacent and shareable. A public response that discloses client identity, site addresses, volumes or commercial terms creates an exposure the client did not agree to. Public responses therefore disclose status and integrity; substantive content is disclosed either only to a holder who already possesses the document (for example, by requiring a value taken from the document itself), or through an access-controlled channel. ⚠️ The applicable data-protection rules (LGPD in Brazil; GDPR where EU personal data is involved) **must be verified** for the specific deployment.

**R8 — Offline and failure behaviour (SHOULD).**
The certificate remains a readable document without the service, and the specification states what an unreachable service means: *unverified*, never *invalid*. A recipient must not be led to treat an outage as a negative result. Long-term availability is an issuer commitment, and the retention period should be stated on the certificate itself.

**R9 — Printed equivalence (SHOULD).**
The printed artifact carries the identifier in human-readable form as well as any machine-readable encoding, so verification survives a photocopy, a fax, and a scanner that renders a QR code unreadable.

**R10 — Statement of scope (MUST).**
The certificate and the verification response both state, in plain language, what verification establishes and what it does not (Section 5). This is the requirement that addresses T6, and it is the one an issuer is most tempted to omit, because it constrains the strength of the claim being sold.

## 5. What verification proves — and what it does not

**Verification, when R1–R7 hold, establishes that:**

- a certificate bearing this identifier was issued by this issuer;
- the document in hand matches the document that was issued;
- the certificate is currently valid, revoked or superseded, as at the moment of checking.

**Verification does not establish that:**

- the material physically reached the stated destination, or was processed as described — that rests on the underlying operational evidence and on the official manifest system, not on the certificate's verifiability;
- the issuer's underlying records are accurate, or that its licences are in force at the time of reading;
- any environmental or carbon outcome occurred;
- the certificate satisfies any specific legal obligation of the recipient.

These four negatives are the substance of the specification, not a disclaimer appended to it. A verifiable certificate raises the cost of forgery from near zero to substantial, and it makes silent alteration detectable. **It does not turn a document into an audit, and it does not transfer the recipient's own compliance duty to the issuer.**

## 6. Conformance checklist

The citable artifact of this report. An issuer, or a client assessing one, marks each requirement met / partially met / not met. **Conformance is claimed as a whole: an implementation meeting R1–R3 but not R4 is not conformant**, because it produces a verification result that is confidently wrong under T2 and T3.

| Req. | Requirement | Level | Met? |
|---|---|---|---|
| R1 | Unique, opaque, permanent, never-reused identifier | MUST | ☐ |
| R2 | Public resolution, no account, standard browser | MUST | ☐ |
| R3 | Defined minimum response content | MUST | ☐ |
| R4 | Integrity binding between identifier and document | MUST | ☐ |
| R5 | Issuer identity and externally checkable licence reference | MUST | ☐ |
| R6 | Revocation and supersession; prior versions retained | MUST | ☐ |
| R7 | Data minimisation in public responses | MUST | ☐ |
| R8 | Offline readability; outage means *unverified*, not *invalid* | SHOULD | ☐ |
| R9 | Human-readable identifier on the printed artifact | SHOULD | ☐ |
| R10 | Explicit statement of what verification does and does not prove | MUST | ☐ |

**Two questions that settle most assessments quickly.** *(1)* If someone edits the weight in the PDF, does verification still return "valid"? If yes, R4 is absent. *(2)* If the issuer ceases to operate, what does the recipient hold? If the answer is "an unverifiable document", R8 has not been addressed.

## 7. Relation to the maturity model

In SEMM terms (DOI 10.5281/zenodo.21445455), a conformant certificate is a Level 3 artifact in the *environmental destination* category: proactively maintained, buyer-readable, and defensible without access to the issuer's internal systems. It does **not**, by itself, raise a supply relationship to Level 3 overall, since the model's level is set by the lowest applicable category. A verifiable certificate over an unreconciled operation is a well-sealed envelope around an unknown quantity.

## 8. Limitations

This is a version 1.0 author-proposed specification, not a standard, not peer reviewed, and not empirically validated against implementations. It is not a security proof; the threat model is enumerated rather than formal, and key management, service availability and issuer governance — all of which determine whether R1–R10 hold in practice — are outside its scope. It addresses the verifiability of a document and says nothing about the truth of the operation the document describes. Legal and data-protection references are orientation only and ⚠️ must be verified. Nothing here constitutes legal, technical or assurance advice.

## 9. How to cite

> Villanova, M. (2026). *A Minimum Specification for Verifiable Environmental-Destination Certificates: Persistent identifiers, resolution, revocation — and the limits of what verification proves* (Version 1.0) [Technical report]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

*(DOI to be inserted after deposit.)*

## References

1. Villanova, M. (2026). *Evidence Architecture for Post-Use Electronic Assets: A capture-event model linking operational steps to buyer-readable documentation.* Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX ⚠️ Insert DOI after the companion record is deposited.
2. Villanova, M. (2026). *Evidência de Destinação Ambiental: Alcance e Limites de Documentos, Registros e Certificados Isolados.* Zenodo. https://doi.org/10.5281/zenodo.21398814
3. Villanova, M. (2026). *Cadeia de Custódia de Resíduos Eletroeletrônicos.* Zenodo. https://doi.org/10.5281/zenodo.21398390
4. Villanova, M. (2026). *The Supplier Evidence Maturity Model (SEMM).* Zenodo. https://doi.org/10.5281/zenodo.21445455
5. Brazil. Law 12.305/2010 — National Solid Waste Policy; MTR/SINIR manifest system; state systems (e.g. SIGOR/CETESB). ⚠️ Verify current text and state-specific rules.
6. Brazil. Law 13.709/2018 (LGPD); Regulation (EU) 2016/679 (GDPR), where EU personal data is involved. ⚠️ Verify applicability to the specific deployment.
