// Servidor estático mínimo para desenvolvimento (sem dependências).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const porta = Number(process.env.PORT) || 8080;
const tipos = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon'};

createServer(async (req, res) => {
  try{
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if(rel.endsWith('/')) rel += 'index.html';
    const arquivo = join(raiz, normalize(rel));
    if(!arquivo.startsWith(raiz)){ res.writeHead(403).end('Proibido'); return; }
    const corpo = await readFile(arquivo);
    res.writeHead(200, {'content-type': tipos[extname(arquivo)] || 'application/octet-stream', 'cache-control': 'no-store'}).end(corpo);
  }catch(e){
    res.writeHead(404).end('Não encontrado');
  }
}).listen(porta, () => console.log(`Estoque rodando em http://localhost:${porta}  (Ctrl+C para parar)`));
