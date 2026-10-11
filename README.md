# Indústrias Stark: estoque e inventário de smartwatches

Sistema de estoque em HTML, CSS e JavaScript puros (módulos ES), sem build e sem dependências. Os dados ficam no `localStorage` do navegador, na chave `estoque-smartwatch-v1`.

## Como usar

```bash
npm start      # serve em http://localhost:8080 (precisa de python3)
npm test       # roda os testes das regras de estoque (Node 20+)
```

Os módulos ES exigem servidor HTTP; abrir o `index.html` direto pelo arquivo não funciona.

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
  storage/
    local.js       load/save no localStorage (único ponto a trocar por um banco)
  ui/
    app.js         eventos e render
    state.js, format.js, shared.js
    views/         uma view por aba
tests/
  domain.test.js
```

As funções de `domain/` recebem o `db` como primeiro argumento e lançam `DomainError` com a mensagem pronta para o usuário.

## Próximos passos

1. Trocar o `localStorage` por um banco real (SQLite local ou Supabase) para usar em vários aparelhos. Só `storage/` precisa mudar.
2. Autenticação, se mais de uma pessoa for usar.
3. Exportação `.xlsx`/`.csv` com download.
4. Fotos por produto e por unidade.
5. Relatórios por período e por canal de venda.
6. Integração com o catálogo HTML para publicar no Netlify, com preços vindos do estoque.
