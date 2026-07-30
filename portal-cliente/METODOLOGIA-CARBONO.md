# Metodologia de Carbono — Ecobraz (base v1, para validação)

> **Status:** rascunho **v1** — fundação metodológica com fontes citadas, para **revisão e
> validação por especialista (Villanova ESG)** antes de virar produto comercial.
> **O que este documento é:** o alicerce que um auditor (ex.: KPMG) lê primeiro — normas,
> fronteiras, fatores e rastreabilidade. **O que ele NÃO é:** ainda não é a metodologia
> assinada/verificada; os **valores exatos dos fatores** precisam ser extraídos das fontes
> citadas e homologados. Última atualização: 2026-07-22.

## 0. Princípios (inegociáveis)

1. **Sem greenwashing.** Só alegamos o que tem lastro verificável. Exigência comercial **e legal** (UE/Brasil).
2. **Três números que NUNCA se misturam:**
   - **(A) Emissões evitadas / benefício** — o CO₂e que a destinação correta (reciclagem/reuso) evita
     frente a um cenário-base (aterro/queima/produção com matéria virgem). É um número **comparativo**,
     reportado **à parte** — **não** entra no inventário do cliente e **não** é "neutralização".
   - **(B) Inventário do cliente (Escopo 3, Categoria 5 – resíduos)** — as emissões do **tratamento**
     do resíduo que o cliente gera. É o que **entra** no inventário de GEE dele.
   - **(C) Neutralização / compensação (offset)** — Pacote 4, **outro produto**, só com lastro real.
     **Não** se soma a (A) nem a (B). Misturar (A) com (C) é o erro clássico que derruba o relatório.
3. **Conservadorismo.** Na dúvida, o número vai para o lado **menor** (menos benefício). Auditor confia em
   quem não infla.
4. **Rastreabilidade total.** Todo resultado desce até uma **coleta real** (peso, material, foto, GPS,
   MTR, NF, CDF). Sem dado real, não há número.

## 1. Normas e guias de referência

| Ref. | Uso na Ecobraz |
|------|----------------|
| **GHG Protocol — Corporate Standard** e **Corporate Value Chain (Scope 3), Categoria 5 (resíduos)** | Base do inventário (número **B**). |
| **WRI (2019) — *Estimating and Reporting the Comparative Emissions Impacts of Products*** | Regras para reportar **emissões evitadas** (número **A**) de forma honesta. |
| **WBCSD — *Guidance on Avoided Emissions v2.0* (jul/2025)** | Metodologia mais atual de emissões evitadas. |
| **ISO 14064‑1 / 14064‑3** | Inventário de GEE da organização e **verificação** por terceira parte. |
| **ISO 14040 / 14044 (ACV)** e **ISO 14067 (pegada de produto)** | Base de ciclo de vida dos fatores. |
| **US EPA — WARM v16 (Eletrônicos, dez/2023)** | Fatores de ciclo de vida por rota (reciclagem/reuso/aterro/queima) para eletrônicos. |
| **WEEE Forum — ferramenta CO₂‑eq (validada pela PRé)** | Metodologia de referência p/ o **benefício** da gestão de REEE. |
| **MCTI / SIRENE — Fator de emissão do SIN (inventários corporativos)** | Fator oficial da **eletricidade no Brasil** (para o processamento na planta). |

> Nota honesta: **não existe um padrão único e universal** para "emissões evitadas" — por isso seguimos
> WRI/WBCSD, reportamos **separado** do inventário e deixamos as premissas **transparentes**.

## 2. Fronteira do sistema (a cadeia de custódia = o lastro)

Cada "porca e parafuso" é rastreado da retirada ao destino final. A fronteira do cálculo acompanha a cadeia:

```
[Cliente] → COLETA (foto no ato + GPS do agente) → TRANSPORTE → [Planta Ecobraz]
         → PESAGEM → TRIAGEM/TRATAMENTO → DESTINO:
              • Reciclagem  → material recuperado (metais, plásticos, etc.) + MTR + NF
              • Reuso/reintrodução no mercado (estende vida útil) + NF
```

- **Unidade funcional:** 1 tonelada de REEE **coletada e destinada corretamente** pela Ecobraz, por tipo de
  material e por rota (reciclagem vs. reuso).
- **Corte (cut-off):** declarado explicitamente (ex.: bens de capital da planta ficam fora; transporte e
  energia do processamento entram). Auditor exige a fronteira escrita — está aqui.

## 3. Como cada número é calculado

### (A) Emissões evitadas / benefício  — *reportado à parte*
`Evitado = Σ_material [ peso_material × (FE_cenário_base − FE_rota_Ecobraz) ] − Emissões_operação_Ecobraz`

- **FE_cenário_base:** o que aconteceria sem a Ecobraz (aterro/queima e/ou produção com matéria virgem).
- **FE_rota_Ecobraz:** reciclagem (material recupera metais/plásticos que **substituem** matéria virgem) ou
  **reuso** (benefício maior — literatura indica reuso > reciclagem).
- **Emissões_operação_Ecobraz:** transporte da coleta + energia da planta (fator MCTI/SIRENE) + insumos.
  **Descontadas do benefício** (conservadorismo).
- **Fontes dos FE:** EPA WARM v16 (eletrônicos) e WEEE Forum/PRé, por material; ajuste ao contexto BR.

### (B) Inventário do cliente (Escopo 3, Cat. 5)
As emissões do **tratamento** dos resíduos do cliente, conforme GHG Protocol Scope 3 — o número que ele
**inclui** no inventário dele. Entregue pronto, com memória de cálculo.

### Referências de magnitude (literatura — NÃO são os fatores finais)
Só para calibrar expectativa (a serem substituídos pelos fatores por material, extraídos e validados):
- ~**0,85 t CO₂e evitada por tonelada** de REEE **reciclada**; ~**1,14 t/t** no **reuso** (mais benéfico).
- Alguns estudos citam **~2 t CO₂e/t** dependendo do mix de materiais e do cenário-base.
  → Exatamente por isso o cálculo é **por material** (cobre, alumínio, aço, plásticos, metais preciosos…),
  não um número único genérico.

## 4. Fatores de emissão — tabela-mãe (a preencher/validar)

| Material / processo | Fator (kg CO₂e/kg) | Fonte | Status |
|---|---|---|---|
| Aço/ferro recuperado | *(extrair)* | EPA WARM v16 / WEEE Forum | ⏳ validar |
| Alumínio recuperado | *(extrair)* | EPA WARM v16 | ⏳ validar |
| Cobre recuperado | *(extrair)* | EPA WARM v16 / ACV | ⏳ validar |
| Plásticos (HDPE/PET) | *(extrair)* | EPA WARM v16 | ⏳ validar |
| Metais preciosos | *(extrair)* | ACV específica | ⏳ validar |
| Reuso (por tipo de equipamento) | *(extrair)* | ACV / WEEE Forum | ⏳ validar |
| Eletricidade da planta (BR) | **fator MCTI/SIRENE do ano** | MCTI/SIRENE | ✅ fonte oficial |
| Transporte da coleta (km × modal) | *(extrair)* | GHG Protocol / Defra | ⏳ validar |

> **Regra:** todo fator na tabela tem **fonte, ano e versão**. Nada de número "do nada". Valores marcados
> "⏳ validar" só entram em produção após homologação da Villanova ESG.

## 5. Rastreabilidade (por que o auditor confia)

Cada resultado tem **memória de cálculo** que desce até a evidência real:
`tCO₂e → material × fator(fonte) → pesagem na planta → OS/coleta (foto + GPS) → MTR/NF/CDF → QR de validação`.

- A **página pública de validação** (`/validar`) e o **QR no CDF** já entregam a verificação de autenticidade
  documento a documento — parte da mesma história de rastreabilidade.

## 6. Atribuição e dupla contagem (cuidado sério)

- O **benefício (A)** pode ser reivindicado pela Ecobraz (valor do serviço) e/ou informado ao cliente para o
  **relatório de sustentabilidade** dele — **mas com regra clara de quem reivindica o quê**, para não haver
  **dupla contagem**. A regra fica escrita no relatório (transparência exigida por WRI/WBCSD).
- O número **(B)** é do inventário do cliente; **(A)** é comparativo e vai **fora** do inventário.

## 7. Incerteza, verificação e governança

- **Incerteza:** resultados com **faixa** quando a fonte tiver variação; sem falsa precisão.
- **Verificação:** meta de **verificação por terceira parte (ISO 14064‑3)** — é o selo que impressiona a KPMG.
  Antes disso, **validação da Villanova ESG**.
- **Governança:** este documento é **versionado**; toda mudança de fator/premissa gera nova versão e recálculo
  rastreável.

## 8. Fontes

- GHG Protocol — Corporate & Scope 3 Standards: https://ghgprotocol.org/standards
- WRI (2019), Comparative Emissions Impacts of Products: https://www.wri.org/research/estimating-and-reporting-comparative-emissions-impacts-products
- WBCSD, Guidance on Avoided Emissions v2.0 (2025): https://www.wbcsd.org/
- US EPA WARM — Eletrônicos v16 (2023): https://www.epa.gov/system/files/documents/2023-12/warm_electronics_v16_dec.pdf
- WEEE Forum — cálculo de CO₂‑eq (validado PRé): https://weee-forum.org/co2eqcalculation/
- MCTI/SIRENE — Fator de emissão (inventários corporativos): https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/cgcl/paginas/fator-medio-inventarios-corporativos
- ISO 14064 / 14067 / 14040‑44: https://www.iso.org/
