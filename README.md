CODXIS WEB — Metas e Resultados
Extensão própria e complementar para o Codxis Web (também exibido como “Demo Web Codxis”). Não é um produto oficial do fornecedor.

O dashboard é inserido no topo da grade da home. Quando o ponto de montagem não é reconhecido, usa um painel no canto superior direito, evitando os botões de WhatsApp e chatbot que normalmente ficam no rodapé.

Instalação (Chrome ou Edge)
Abra chrome://extensions no Chrome ou edge://extensions no Edge.
Ative Modo do desenvolvedor.
Clique em Carregar sem compactação.
Selecione esta pasta (a que contém manifest.json).
Abra ou atualize o Codxis Web.
Ao clicar no ícone da extensão, será aberto um popup com a meta, a última captura e atalhos para mostrar o dashboard ou solicitar uma atualização.

O botão Configurações abre a página de opções da extensão. Nela é possível alterar a meta mensal, iniciar o dashboard recolhido e ativar os logs de diagnóstico. As mudanças são salvas em chrome.storage.local e as preferências visuais são aplicadas às abas abertas.

A edição da meta é protegida por uma senha local. No primeiro acesso, o proprietário cadastra uma senha de pelo menos quatro caracteres. Ela é armazenada como hash SHA-256 com salt em chrome.storage.local; após cinco erros consecutivos, novas tentativas ficam bloqueadas por cinco minutos.

O dashboard mantém também um histórico local consolidado por dia do total vendido no mês. O mini gráfico usa somente capturas DOM válidas, conserva apenas o mês corrente e não cria dados retroativos.

Na primeira utilização, clique em Definir meta e informe a meta mensal. A extensão calcula automaticamente quanto ainda precisa ser vendido por dia e para a próxima janela de até sete dias, considerando o dia atual e o fim do mês. A meta fica apenas no navegador, em chrome.storage.local.

O botão Atualizar força uma nova leitura da tela atual. Ele não inventa valores e não transforma falha de leitura em zero.

Estado atual da captura
A extensão está pronta para capturar valores de duas maneiras:

API/fetch/XHR: observa respostas das rotas configuradas, sem fazer novas requisições e sem enviar dados para fora do navegador.
DOM: observa mudanças na página e lê os elementos configurados. Também faz uma conferência a cada 15 segundos.
Rótulos semânticos: enquanto o seletor definitivo não é conhecido, procura cards com textos como “Total de produtos vendidos no mês” e associa somente o valor monetário localizado no mesmo card.
Dados estruturados: pode ler blocos JSON já presentes no HTML.
Cache local: mantém a última captura válida quando nenhuma fonte ao vivo estiver disponível.
A prioridade é API → dados estruturados → DOM → cache. Uma fonte menos confiável não substitui uma captura recente de prioridade maior.

Até os seletores/caminhos reais serem preenchidos, o dashboard mostra “Aguardando dados” quando nenhum card reconhecível existir; ele não inventa nem estima venda ou lucro.

Os estados são tratados separadamente:

R$ 0,00 aparece apenas quando a fonte retornou zero de maneira válida;
“Sem vendas no período” identifica uma captura válida com total zero;
“Dados ainda não sincronizados” significa que nenhuma captura ocorreu;
“Dados não encontrados nesta tela” significa que a tela atual não contém os elementos configurados;
“Seletor inválido” aponta erro de sintaxe na configuração;
“Erro de captura” preserva o último cache válido e sinaliza a falha.
Como atualizar seletores
Todas as referências ao layout ficam em src/config.js.

Totais exibidos na tela
Abra “Fechamento de Caixa”, “Consultar Vendas NFC-e” ou “Realizar Venda”.
Pressione F12 e use o seletor de elementos.
Encontre o elemento que contém o total.
Prefira um atributo estável (id, data-*, nome de campo) e evite classes geradas ou posições como :nth-child.
Inclua o seletor nos arrays:
dom: {
  salesTotal: ["[data-testid='total-vendas']"],
  profitTotal: ["[data-testid='lucro-real']"],
  periodLabel: [".filtro-periodo .valor"]
}
É possível listar alternativas. A primeira encontrada é usada.

Linhas de uma tabela
Se a tela não apresentar um total, configure as linhas e as células:

transactionRows: ["table.vendas tbody tr"],
row: {
  amount: ["td[data-column='valor']"],
  profit: ["td[data-column='lucro']"],
  date: ["td[data-column='data']"]
}
O somatório só ocorre quando um total direto não foi encontrado. Não configure linhas de uma tabela paginada como se representassem o período inteiro.

Respostas da API
Na aba Network, filtre por Fetch/XHR, abra a requisição que traz os dados e confira Response. Em api.urlIncludes, use uma parte específica da URL; em salesPaths e profitPaths, informe o caminho até o número:

api: {
  urlIncludes: ["/relatorio/vendas/resumo"],
  salesPaths: ["data.totais.vendas"],
  profitPaths: ["data.totais.lucro"],
  datePaths: ["data.atualizadoEm"]
}
Depois de qualquer alteração, volte à página de extensões, clique em Recarregar na extensão e atualize o Codxis.

Dados estruturados no HTML
Se o sistema incluir um <script type="application/json">, estado serializado ou outro elemento contendo JSON, configure:

structured: {
  jsonContainers: ["script#dados-resumo"],
  salesPaths: ["data.totalVendas"],
  profitPaths: ["data.lucroReal"],
  datePaths: ["data.atualizadoEm"]
}
Esse método tem prioridade sobre texto visual do DOM.

Restringir ao domínio da empresa
Por não termos ainda a URL do sistema, o manifesto permite páginas HTTP/HTTPS, mas o código só inicia quando detecta “Codxis”/“Avante Web”. Assim que souber o domínio, recomenda-se:

Preencher app.allowedHosts em src/config.js.
Trocar os três padrões http://*/* / https://*/* do manifest.json pelo domínio exato, por exemplo https://web.exemplo.com.br/*.
Isso reduz a permissão exibida pelo navegador.

Navegação e atualização automática
A extensão funciona em páginas tradicionais e SPAs. Ela reage a:

fetch e XHR realizados pelo próprio sistema;
alterações relevantes no DOM;
history.pushState, history.replaceState, popstate e hashchange;
retorno à aba ou à home;
intervalo de segurança configurado em app.refreshMs;
clique no botão Atualizar.
O interceptador de rede só é ativado depois que a página é confirmada como Codxis/Avante Web.

Diagnóstico de problemas
Abra F12 → Console e confirme se existem erros iniciados por [CODXIS WEB].
Para logs detalhados, altere app.diagnostics para true em src/config.js, recarregue a extensão e atualize a página.
Se o painel não aparecer, revise app.allowedHosts, mount.homeHints e mount.homeContainers.
Se aparecer “Seletor inválido”, teste cada seletor no Console com document.querySelector("SELETOR").
Se aparecer “Dados não encontrados nesta tela”, confirme se a tela e o período corretos estão abertos e se o elemento não está dentro de um iframe.
Se a API mudou, confira novamente Network → Fetch/XHR, a URL da requisição, o JSON da resposta e os caminhos em api.*Paths.
Se o HTML mudou, prefira id, name, data-* ou aria-* estáveis. Evite classes geradas e seletores baseados em posição.
Em tabelas paginadas, não some apenas a página visível; use o total da API ou do relatório completo.
Se o conteúdo estiver em iframe de outro domínio, será necessário adicionar o domínio desse iframe ao manifest.json e, conforme o caso, habilitar all_frames no content script.

Como adaptar quando o sistema mudar
Mudou somente uma classe/atributo: ajuste dom ou mount.
Mudou a estrutura do JSON: ajuste os caminhos pontilhados de api ou structured.
Mudou a URL do endpoint: ajuste api.urlIncludes.
Surgiu uma API confiável: mantenha o DOM como fallback e coloque o endpoint e os caminhos da API na configuração.
A API passou a retornar lista paginada: procure o endpoint de resumo/total; não trate uma página da lista como o período inteiro.
Venda e lucro vêm de endpoints diferentes: configure os caminhos de ambos; o cache preserva o campo válido que não estiver presente na captura seguinte.
Arquivos
manifest.json: Manifest V3 e ordem de carregamento.
src/config.js: domínios, montagem, seletores e caminhos da API.
src/storage.js: acesso centralizado ao chrome.storage.local.
src/service-worker.js: ciclo de instalação e base para ações da extensão.
src/page-bridge.js: observa fetch/XHR feitos pelo próprio sistema.
src/data-collector.js: normaliza moeda e captura API/DOM.
src/goal-calculator.js: calcula restante, dias, médias e superávit mensal.
src/password-protection.js: hash, validação, tentativas e bloqueio da senha.
src/sales-history.js: consolidação diária e retenção do mês atual.
src/mini-chart.js: geometria e renderização do gráfico SVG.
src/dashboard.js: interface, metas e persistência local.
src/content.js: detecção do sistema, home e inicialização em SPA.
src/dashboard.css: visual isolado e responsivo.
options/: página Manifest V3 para configurar a meta e preferências.
tests/goal-calculator.test.js: validações automatizadas dos cálculos.
tests/password-protection.test.js: validações da autenticação local.
tests/sales-history.test.js: validações de consolidação e troca de mês.
tests/mini-chart.test.js: validações da geometria do gráfico.
icons/: ícones PNG para Chrome e Edge nos tamanhos exigidos.
Privacidade
Não há servidor externo, analytics ou dependências de terceiros. Nenhuma informação é enviada pela extensão. Meta e último retrato capturado permanecem no armazenamento local do navegador.

extensao-codxis
