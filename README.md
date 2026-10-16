# Indústrias Stark: estoque e inventário de smartwatches

Sistema de estoque em HTML, CSS e JavaScript puros (módulos ES), sem build e sem dependências. Os dados ficam no Supabase (com login, para uso a dois) ou, se o Supabase não estiver configurado, no `localStorage` do navegador (chave `estoque-smartwatch-v1`).

## Como usar

```bash
npm start      # serve em http://localhost:8080 (só precisa do Node)
npm test       # roda os testes das regras de estoque (Node 20+)
```

Os módulos ES exigem servidor HTTP; abrir o `index.html` direto pelo arquivo não funciona.

## Configurar o Supabase (uma vez)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **Authentication > Providers > Email:** desligue "Allow new users to sign up" (depois de criar vocês dois).
3. **Authentication > Users > Add user:** crie o seu usuário e o da sua namorada (e-mail e senha, marcando "Auto Confirm").
4. **SQL Editor:** rode `supabase/schema.sql` inteiro. Em seguida rode o `insert into public.members ...` que está comentado no final, com os dois e-mails. Só quem está em `members` lê ou grava.
5. **Project Settings > API:** copie a *Project URL* e a chave *anon public* para `src/config.js`.
6. Para levar os dados do protótipo antigo: no navegador onde ele funcionava, aba **Dados**, copie o *Backup completo em JSON*; depois, já logado na versão nova, cole em **Importar backup**.

Cada produto, unidade, movimentação, cliente e fornecedor é uma linha com o JSON em `data`. O `schema.sql` pode ser rodado de novo sempre que o sistema ganhar uma tabela (as tabelas `customers`, `suppliers`, `bills` e `metas` vieram depois, e o espaço de fotos também); enquanto elas não existem, o app abre normalmente e avisa ao tentar gravar um cliente, fornecedor, conta ou meta. A cada operação o app relê os dados do servidor, aplica a regra e grava só as linhas que mudaram; alterações da outra pessoa aparecem em tempo real no Painel, Unidades e Histórico.

Limite conhecido: se vocês dois confirmarem uma venda no mesmo instante, a última gravação vence. Para esse uso a janela é de milissegundos; se virar problema, o passo seguinte é mover as operações para funções SQL transacionais.

## Modelo de dados

- `products`: modelo, marca, variante, custo padrão, preço padrão, estoque mínimo, fornecedor, observações.
- `units`: cada aparelho individual (`productId`, `serial`, `custo`, `status` = `disponivel` | `vendido` | `baixa`, `entradaId`, `saidaId`, `dataEntrada`, `dataSaida`, `ts`).
- `moves`: histórico (`entrada`, `venda`, `baixa`, `cancelamento`). Vendas têm `valor`, `custo`, `lucro`, `cliente`, `pagamento`, `cancelada`.

## Abas

Painel (dashboard), Balanço, Contas, Unidades, Produtos, Entradas, Vendas, Baixas, Clientes, Fornecedores, Histórico e Dados.

- **Painel:** receita, lucro líquido, despesas e perdas, ticket médio; receita ou lucro por dia (ou por mês em períodos longos); produtos que mais deram lucro; vendas por forma de pagamento; estoque parado há mais tempo; situação por produto.
- **Balanço:** três visões separadas. *Lucro* = vendas − custo dos aparelhos vendidos − despesas − perdas. *Caixa* = o que entrou (vendas) − o que saiu (compras de produto + despesas). *Dinheiro parado em estoque* = custo dos aparelhos ainda não vendidos. Tem o formulário de despesas.
- **Formas de pagamento:** Pix, Dinheiro e Maquininha.
- **Despesas:** Frete, Embalagem, Anúncios, Taxa de cartão, Taxa de Pix e Outros. A compra de produto não é despesa: já é lançada em Entradas e aparece no Balanço como "Produto (compras)".
- **Clientes:** nome, telefone/WhatsApp (vira link) e observações; mostra quantas compras, total gasto, ticket médio e última compra, e abre o histórico de cada um. O campo Cliente da venda sugere os cadastrados, mas aceita um nome novo (que fica só como texto). Vendas antigas são ligadas ao cadastro pelo nome.
- **Fornecedores:** nome, contato, site, pedido mínimo, prazo e forma de pagamento; mostra quantas compras e o total comprado. O campo Fornecedor da entrada sugere os cadastrados. Um botão cadastra a XDistribuidora com as condições do catálogo.
- **Contas a receber e a pagar:** na venda, "A receber" (fiado ou parcelado em até 12x, exige o cliente) cria as parcelas com vencimento; na entrada, "A pagar (a prazo)" faz o mesmo para o fornecedor. A aba Contas lista por vencimento (vencida, vence hoje, a vencer), recebe, paga e desfaz. Conta avulsa a pagar (anúncios, frete) vira despesa na data em que é paga. Cancelar a venda cancela as contas dela. O Painel avisa de contas vencidas.
- **Lucro e caixa:** o lucro segue o regime da venda (conta quando a venda acontece). O caixa só conta o que foi recebido ou pago de fato: venda a receber entra quando a parcela é recebida, compra a prazo sai quando é paga.
- **Garantias:** dois prazos. *Garantia ao cliente*: cada venda guarda até quando o aparelho está coberto (90 dias por padrão, editável; 0 = sem garantia). Em Vendas, "Consultar garantia" acha pelo número de série, nome ou telefone do cliente e diz se ainda vale. *Garantia do fornecedor*: cada entrada guarda o prazo que o fornecedor dá (90 dias por padrão, como a XDistribuidora) em cada aparelho. A baixa por defeito avisa se ainda dá para pedir a troca, e o Painel avisa quando a garantia do fornecedor de aparelhos em estoque está acabando (15 dias). Aparelhos e vendas anteriores ao recurso não têm o prazo gravado: o do fornecedor é estimado em 90 dias da entrada (marcado "estimada"), e a venda aparece como "Não registrada". Não precisa de mudança no Supabase.
- **Fotos dos produtos:** até 3 por produto, no Supabase Storage (espaço `produtos`, leitura pública pelo link, escrita só para quem está em `members`). A foto é reduzida no navegador (900 px, JPEG) antes de enviar. Só funciona com o Supabase configurado.
- Períodos: todo o período, hoje, últimos 7 dias, este mês e mês anterior.

## Regras

- Estoque = unidades com `status = disponivel`.
- Venda e baixa sem séries consomem as unidades mais antigas (FIFO: data de entrada, depois ordem de cadastro). Com séries, consomem as informadas.
- Custo de cada venda = soma do custo das unidades que saíram. Lucro = valor − custo.
- Cancelar venda devolve as unidades ao estoque e cria um registro de `cancelamento`.
- Toda operação inválida falha sem alterar nada.
- Venda cancelada não entra em nenhum total. Despesas e vendas são movimentações (`moves`), então não exigem mudança no banco do Supabase.

## Estrutura

```
index.html
src/
  styles.css
  domain/        regras puras, sem DOM nem storage
    operations.js  produtos, entrada, venda, cancelamento, baixa, backup
    queries.js     estoque, custo médio, situação
    reports.js     períodos, balanço, estatísticas, exportação CSV/JSON
    util.js, constants.js, errors.js
  config.js        URL e chave anon do Supabase
  storage/
    remote.js      Supabase (load, save por diff, realtime, login)
    local.js       fallback no localStorage
    index.js       escolhe um dos dois conforme o config.js
    diff.js        quais linhas mudaram
supabase/
  schema.sql       tabelas, políticas de acesso e realtime
  ui/
    app.js         eventos e render
    state.js, format.js, shared.js, charts.js (colunas e barras)
    views/         uma view por aba
tests/
  domain.test.js   regras de estoque
  storage.test.js  sincronização com um Supabase falso
```

As funções de `domain/` recebem o `db` como primeiro argumento e lançam `DomainError` com a mensagem pronta para o usuário.

## Próximos passos

1. Exportação `.xlsx`/`.csv` com download.
2. Fotos por produto e por unidade (Supabase Storage).
3. Relatórios por período e por canal de venda.
4. Integração com o catálogo HTML para publicar no Netlify, com preços vindos do estoque.

## Metas do mês

No Painel, o cartão "Metas" mostra dois anéis: **vendas** (receita do mês) e **lucro líquido** (o mesmo número do Balanço). Defina os valores em "Definir metas". Sem meta própria no mês, vale a do último mês que teve uma, com um aviso. Deixar os dois campos vazios remove a meta. As metas ficam na tabela `metas` (rode o `schema.sql` de novo para criá-la).

## Pagamento parcial

Em Contas, o botão **Parcial** registra só uma parte do valor (e a data em que entrou ou saiu o dinheiro). A conta fecha por esse valor, mostrando "de R$ …", e o restante vira uma nova conta pendente, com o vencimento que você escolher. Em conta avulsa a pagar, a despesa é lançada só pelo valor pago. **Desfazer** devolve a conta ao valor original e apaga o restante; se o restante já foi pago, desfaça primeiro o pagamento dele.
