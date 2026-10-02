# 🚀 CODXIS WEB — Metas e Resultados

Extensão própria e complementar para o **Codxis Web**, também exibido como **Demo Web Codxis**.

> ⚠️ **Aviso:** esta extensão não é um produto oficial do fornecedor do sistema.

O **CODXIS WEB — Metas e Resultados** adiciona um dashboard diretamente ao sistema para acompanhar metas e resultados de vendas, utilizando dados disponíveis na própria página ou nas respostas de API do sistema.

A extensão foi desenvolvida para funcionar de forma **local, sem servidor externo e sem envio de dados para terceiros**.

---

## ✨ Funcionalidades

* 📊 Dashboard de metas e resultados
* 🎯 Definição de meta mensal
* 📈 Cálculo automático do valor restante da meta
* 📅 Projeção diária e para os próximos dias
* 📉 Histórico diário das vendas
* 📊 Mini gráfico de evolução mensal
* 🔄 Atualização manual dos dados
* ⚡ Captura através de API, DOM ou dados estruturados
* 💾 Cache local da última captura válida
* 🔐 Proteção da alteração da meta por senha
* 🧪 Validações automatizadas
* 🖥️ Suporte a Chrome e Edge
* 📱 Interface responsiva
* 🐛 Sistema de diagnóstico e logs

---

## 🖼️ Dashboard

O dashboard é inserido no topo da grade da página inicial.

Caso o ponto de montagem principal não seja encontrado, a extensão utiliza um painel alternativo no **canto superior direito**, evitando interferência com elementos como WhatsApp e chatbot normalmente presentes no rodapé.

Ao clicar no ícone da extensão, é aberto um popup contendo:

* Meta atual
* Última leitura
* Atalhos para exibir o dashboard
* Opção para atualizar os dados

---

# 📦 Instalação

A extensão utiliza **Manifest V3** e pode ser carregada diretamente no Chrome ou Edge.

### Chrome

Acesse:

```text
chrome://extensions
```

### Edge

Acesse:

```text
edge://extensions
```

Depois:

1. Ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação**.
3. Selecione a pasta do projeto que contém o arquivo `manifest.json`.
4. Abra ou atualize o Codxis Web.
5. A extensão será inicializada automaticamente quando o sistema for identificado.

---

# ⚙️ Configuração

A página **Configurações** permite alterar:

* Meta mensal
* Estado inicial do dashboard
* Logs de diagnóstico

As configurações são armazenadas localmente utilizando:

```text
chrome.storage.local
```

As preferências visuais também são aplicadas às abas abertas.

---

## 🔐 Proteção da meta

A alteração da meta mensal é protegida por uma senha local.

Na primeira utilização:

1. O proprietário cadastra uma senha.
2. A senha deve possuir pelo menos **4 caracteres**.
3. A senha é armazenada como **hash SHA-256 com salt**.
4. Após **5 tentativas incorretas consecutivas**, novas tentativas ficam bloqueadas por **5 minutos**.

Nenhuma senha é enviada para servidores externos.

---

# 🎯 Sistema de metas

Na primeira utilização, clique em:

**Definir meta**

e informe a meta mensal.

A extensão calcula automaticamente:

* Quanto ainda precisa ser vendido no mês
* Média necessária por dia
* Necessidade para os próximos dias
* Quantidade de dias restantes
* Superávit ou déficit em relação à meta

Os cálculos consideram o **dia atual e o fim do mês**.

A meta permanece somente no navegador através de:

```text
chrome.storage.local
```

---

# 📊 Histórico de vendas

A extensão mantém um histórico local consolidado por dia.

O histórico:

* Considera somente o mês atual
* Não cria dados retroativos
* Utiliza apenas capturas DOM válidas
* É armazenado localmente
* Alimenta o mini gráfico do dashboard

O gráfico representa a evolução das vendas ao longo do mês.

---

# 🔄 Atualização dos dados

O botão **Atualizar** força uma nova leitura da página atual.

A extensão:

* Não inventa valores
* Não estima valores ausentes
* Não transforma falhas de leitura em `R$ 0,00`
* Mantém o último cache válido quando necessário

---

# 🔎 Captura de dados

A extensão suporta diferentes fontes de dados.

A prioridade utilizada é:

```text
API
 ↓
Dados estruturados
 ↓
DOM
 ↓
Cache
```

Uma fonte de menor prioridade não substitui uma captura recente proveniente de uma fonte de maior prioridade.

---

## 🌐 API / Fetch / XHR

A extensão observa respostas das requisições **Fetch/XHR realizadas pelo próprio sistema**.

Ela não cria novas requisições e não envia os dados para fora do navegador.

Exemplo:

```javascript
api: {
  urlIncludes: ["/relatorio/vendas/resumo"],
  salesPaths: ["data.totais.vendas"],
  profitPaths: ["data.totais.lucro"],
  datePaths: ["data.atualizadoEm"]
}
```

---

## 🧩 DOM

Quando os dados estão disponíveis diretamente na interface, a extensão pode capturá-los através dos elementos configurados.

Ela também observa alterações no DOM e realiza uma conferência periódica a cada **15 segundos**.

Exemplo:

```javascript
dom: {
  salesTotal: ["[data-testid='total-vendas']"],
  profitTotal: ["[data-testid='lucro-real']"],
  periodLabel: [".filtro-periodo .valor"]
}
```

É possível definir múltiplos seletores. O primeiro elemento encontrado será utilizado.

---

## 🏷️ Rótulos semânticos

Enquanto os seletores definitivos não forem conhecidos, a extensão pode procurar cards contendo textos como:

```text
Total de produtos vendidos no mês
```

Nesse caso, ela procura o valor monetário correspondente dentro do mesmo card.

---

## 🧱 Dados estruturados

A extensão também consegue inte
