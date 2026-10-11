# Indústrias Stark: estoque e inventário de smartwatches

Sistema de estoque em HTML, CSS e JavaScript puros (módulos ES), sem build e sem dependências. Os dados ficam no Supabase (com login, para uso a dois) ou, se o Supabase não estiver configurado, no `localStorage` do navegador (chave `estoque-smartwatch-v1`).

## Como usar

```bash
npm start      # serve em http://localhost:8080 (precisa de python3)
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

Cada produto, unidade e movimentação é uma linha com o JSON em `data`. A cada operação o app relê os dados do servidor, aplica a regra e grava só as linhas que mudaram; alterações da outra pessoa aparecem em tempo real no Painel, Unidades e Histórico.

Limite conhecido: se vocês dois confirmarem uma venda no mesmo instante, a última gravação vence. Para esse uso a janela é de milissegundos; se virar problema, o passo seguinte é mover as operações para funções SQL transacionais.

## Modelo de dados

- `products`: modelo, marca, variante, custo padrão, preço padrão, estoque mínimo, fornecedor, observações.
- `units`: cada aparelho individual (`productId`, `serial`, `custo`, `status` = `disponivel` | `vendido` | `baixa`, `entradaId`, `saidaId`, `dataEntrada`, `dataSaida`, `ts`).
- `moves`: histórico (`entrada`, `venda`, `baixa`, `cancelamento`). Vendas têm `valor`, `custo`, `lucro`, `cliente`, `pagamento`, `cancelada`.

## Regras

- Estoque = unidades com `status = disponivel`.
- Venda e baixa sem séries consomem as unidades mais antigas (FIFO: data de entrada, depois ordem de cadastro). Com séries, consomem as informadas.
- Custo de cada venda = soma do custo das unidades que saíram. Lucro = valor − custo.
- Cancelar venda devolve as unidades ao estoque e cria um registro de `cancelamento`.
- Toda operação inválida falha sem alterar nada.

## Estrutura

```
index.html
src/
  styles.css
  domain/        regras puras, sem DOM nem storage
    operations.js  produtos, entrada, venda, cancelamento, baixa, backup
    queries.js     estoque, custo médio, situação
    reports.js     resumo do painel, exportação CSV/JSON
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
    state.js, format.js, shared.js
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
