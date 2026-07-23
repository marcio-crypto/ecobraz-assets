# Requisitos do Engenheiro — Sistema Ecobraz (CDF, Veículo, Laudos, MTR/SIGOR)

> Origem: documento enviado pelo engenheiro da Ecobraz (via Marcio) em **2026-07-23**
> (`Regras_Sistemas.docx`). Este arquivo é a **transcrição fiel** do que ele pediu,
> para servir de especificação dos módulos de CDF, Engenharia Ambiental e Operação.
> Anotações do time de sistema aparecem marcadas como **[nota sistema]**.

---

## 1. CDF — Certificado de Destinação Final (3 tipos)

### 1.1 CDF via MTR (Padrão Órgão Ambiental — SINIR / CETESB/SIGOR)
**Aplica-se a:** clientes **obrigados por lei** a emitir o MTR (Manifesto de Transporte
de Resíduos) antes da saída do caminhão.

**Lógica:** o sistema **não cria dados do zero** — ele **puxa as informações oficiais**
via **integração de API** OU **upload do XML/PDF** do MTR gerado pelo cliente no sistema
do governo (SINIR / SIGOR).

Campos do CDF:
- **Nº do MTR** da União / Estado (ID oficial do manifesto).
- **Gerador:** CNPJ, Razão Social, Endereço e Licença Ambiental (LO).
- **Transportador:** CNPJ, Placa do Veículo e Motorista.
- **Destinador (Ecobraz):** CNPJ, Endereço, LO de Operação e Cód. da Atividade de
  Destinação (Reciclagem, Coprocessamento, etc.).
- **Detalhamento do Resíduo (Tabela IBAMA):** Código IBAMA (ex.: 15 01 01 — Embalagens
  de papel/papelão), Descrição da Classe (I, II-A ou II-B), **Peso Recebido Efetivo
  (confirmado na balança da Ecobraz)**.
- **Chave de Validação / Assinatura Digital:** assinatura do Responsável Técnico
  (CRQ/CREA) da Ecobraz atestando que o MTR foi baixado/atendido.

> **[nota sistema]** Fato legal confirmado no CETESB: **o CDF oficial só é válido quando
> emitido através do MTR, dentro do SIGOR**, e cabe ao **destinador** aceitar a carga,
> **dar baixa/fechar o MTR** e **emitir o CDF**. Ou seja, para este tipo de cliente o CDF
> "que vale" é o do SIGOR — o nosso papel é integrar (puxar dados + dar baixa + registrar/
> anexar o CDF oficial), não substituir.

### 1.2 CDF Detalhado (Rastreabilidade por Item / Patrimônio / Nº de Série)
**Aplica-se a:** logística reversa de eletrônicos (e-lixo), descarte de TI,
descaracterização de ativos, auditorias ISO 14001 / compliance. Funciona **com ou sem MTR**.

**Lógica:** vincular a **quantidade total** ao **Anexo de Rastreabilidade Individual**
(seriais, plaquetas e modelos dos itens).

Campos:
- Identificação das partes: Gerador (Cliente) e Destinador (Ecobraz).
- **Nº da Ordem de Coleta / Chamado Interno** (liga o serviço ao cliente).
- Resumo do Lote de Ativos (ex.: "Lote de Descarte de TI / Equipamentos Obsoletos").
- **Tabela de Detalhamento Individual (Anexo I):** Tipo de Equipamento/Material; Marca e
  Modelo; **Nº de Série (Serial/MAC)**; Nº do Ativo/Plaqueta de Patrimônio (opcional);
  **Estado na Recepção** (Intacto, Sucateado, Descaracterizado).
- **Declaração de Descaracterização e Destruição de Dados** (discos destruídos,
  componentes segregados para reciclagem).
- **Responsável Técnico:** Nome, Registro (CRQ/CREA) e Assinatura.

> **[nota sistema]** Este é o nosso **diferencial** e não depende de API do governo.

### 1.3 CDF Comum / Interno Ecobraz (clientes isentos / sem MTR)
**Aplica-se a:** pequenos geradores, comércio, escritórios, resíduos não perigosos
(Classe II-A / II-B) em que o cliente é **isento** da emissão de MTR.

**Lógica:** o app gera um **certificado próprio da Ecobraz** a partir da OS ou do
**Tick de Balança** interno.

Campos:
- **Nº do Certificado Ecobraz** (sequencial, ex.: CDF-2026-00123).
- Gerador (simplificado): Nome/Razão Social, CPF/CNPJ, Endereço da Coleta.
- **Ecobraz (Destinador Homologado):** Razão Social, CNPJ, Endereço e **Nº da LO** da unidade.
- Data do Recebimento / Coleta.
- Detalhamento: Categoria/Descrição Comercial (Papelão Misto, Plástico Filme, Sucata
  Metálica/Madeira…), Unidade e Quantidade (ex.: 1.250 kg ou 5 Bags), Destino Aplicado
  (Triagem, Prensagem, Reciclagem Industrial).
- **Declaração de Destinação Correta** (PNRS — Lei 12.305/2010).
- Assinatura do Responsável (Meio Ambiente/Qualidade da Ecobraz).

> **[nota sistema]** É exatamente o que já começamos: certificado próprio + **QR de
> validação**. Já temos o QR no CDF; falta ligar os campos acima e a numeração sequencial.

---

## 2. Veículo — Checklist de Pré-Uso (ISO 45001 · Prevenção de Acidentes)
Formato **OK / NÃO OK / N/A**, agrupado para levar **2–3 minutos**:

**A. Segurança & Mecânica Básica**
- Pneus e Estepes: calibragem, desgaste/careca, porcas firmes.
- Freios: serviço (pé) e estacionamento (mão).
- Iluminação: faróis (alto/baixo), lanternas, luz de freio, setas, pisca-alerta.
- Visibilidade: limpadores, água do reservatório, retrovisores, para-brisa sem trincas.
- Fluidos: óleo do motor e água do radiador.
- Equipamentos Obrigatórios: cinto, triângulo, macaco, chave de roda, extintor (verde).
- EPIs do Motorista: bota com biqueira, colete refletivo, óculos, luvas, protetor auricular.

> **[nota sistema]** Encaixa no **app do agente** (feito antes de sair para a rota).

---

## 3. Laudos — Registro Fotográfico Obrigatório (3 fases)
O app deve **exigir um mínimo de fotos por etapa**, capturando **automaticamente**
**Data, Hora, Coordenadas de GPS** e **marca d'água de identificação da OS** sobre a imagem
(validade jurídica; evitar contestação de cliente/fiscalização).

- **Fase 1 — INÍCIO (Recepção e Integridade):** Vista Geral (lote no palete/balança);
  Detalhe de Identificação (etiqueta do lote, rótulo, nº do lote/validade p/ hospitalar,
  plaqueta/marca); Lacre de Transporte (antes do rompimento, se houver).
- **Fase 2 — MEIO (Destruição / Descaracterização):** Material na Máquina (triturador,
  prensa, moinho, guilhotina em operação); Inutilização Parcial (quebra/corte/fragmentação).
- **Fase 3 — FIM (Inutilização Concluída & Acondicionamento):** Resíduo Final Inutilizado
  (massa disforme, fardos, raspas); Acondicionamento Final (material na caçamba/caminhão
  de destino final, ex.: a caminho da incineração).

> **[nota sistema]** Estende a foto que o app do agente já tira. Precisamos: **marca d'água
> com OS + data/hora + GPS gravada na imagem** e **mínimo de fotos por fase**.

---

## 4. Baixa na ANVISA / Vigilância Sanitária (Material Hospitalar — RSS)
Quando o checkbox **[x] Material Hospitalar** estiver ativo, o app formata o relatório final
no padrão **RDC ANVISA** e Vigilância Sanitária local:
- **Assinatura conjunta e obrigatória:** RT da Ecobraz (Eng. Ambiental/Químico com CREA/CRQ)
  **+** Testemunha/Fiscal do Cliente (se presente) ou auditor de qualidade.
- **Declaração de Inutilização Irreversível:** texto de responsabilidade sanitária (o lote X
  perde totalmente a função e não oferece risco de reutilização/comercialização clandestina).
- **Vincular o Destinador Final Adequado:** tecnologia aplicada (ex.: Incineração a alta
  temperatura com tratamento de gases; ou Autoclavagem + aterro) **e anexar o MTR de RSS**.

---

## 5. Integração com o SIGOR (pergunta do engenheiro: "dá pra linkar?")

**Sim, é o caminho certo e é possível** — o SIGOR foi feito para isso. Fatos confirmados
na CETESB (fontes no fim):
- Existe **web service oficial** do SIGOR-MTR (manual de integração v1.15, 21/08/2024).
- Ambientes: **homologação** `https://mtrr-hom.cetesb.sp.gov.br/apiws/rest` e
  **produção** `https://mtrr.cetesb.sp.gov.br/apiws/rest`.
- Autenticação por **GetToken** (controle de acesso da CETESB, login/senha → token).
- O **destinador** (Ecobraz) **aceita a carga, fecha o MTR e emite o CDF** pelo sistema.

**A confirmar antes de cravar prazo (honesto — ainda não verificado):**
1. Se o web service **exige certificado digital ICP-Brasil (e-CNPJ)** — está no manual
   completo (CETESB bloqueou o download automático; pegar o PDF manualmente/ com o engenheiro).
2. **Credenciais/cadastro de integrador** da unidade Ecobraz no SIGOR (quem tem o login).
3. **Escopo exato dos endpoints** para "receber/dar baixa" e "emitir CDF" via API
   (a lista pública destaca gerar-manifesto-em-lote + listas de referência).
4. **Abrangência:** SIGOR é **SP**. Cliente de outro estado emite no sistema do estado
   (INEA-RJ, MTR-MG…) ou no **SINIR nacional** — cada um é uma integração.

**Plano faseado proposto:**
- **Fase A (sem depender de credencial):** aceitar **upload do XML do MTR** → o sistema lê
  tudo (nº, gerador, transportador, resíduos IBAMA, classes) e monta o CDF Detalhado (1.2)
  amarrado ao MTR. Dá pra começar já.
- **Fase B (integração viva):** com credenciais + manual, conectar no web service em
  **homologação** primeiro (puxar/baixar/emitir), depois produção.

**Segurança:** qualquer credencial/certificado do SIGOR vai em **Cloudflare Secrets** —
nunca no repositório, em logs ou no chat.

### Fontes (CETESB / oficiais)
- Web Service SIGOR-MTR: https://cetesb.sp.gov.br/sigor-mtr/web-service/
- Manual de Integração Web Service v1.15: https://cetesb.sp.gov.br/sigor-mtr/wp-content/uploads/sites/38/2021/03/SIGOR-MTR-Manual-de-Integracao-Web-Service.pdf
- Papel do Destinador (aceitar carga, fechar MTR, emitir CDF): https://cetesb.sp.gov.br/sigor-mtr/destinador/
