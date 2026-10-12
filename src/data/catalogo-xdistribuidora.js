/*
 * Catálogo da XDistribuidora, atualizado em 05/10/2026 (3 PDFs: produtos, Wearzone e acessórios).
 * Só entra o que o cadastro de produto pede:
 *   custoPadrao  = preço de atacado de 5 a 50 peças (não o VIP nem o de 100 peças)
 *   precoPadrao  = preço sugerido de revenda, quando o fornecedor informa; 0 quando não informa
 * Itens marcados "ESGOTADO" no catálogo ficaram de fora.
 */
export const CATALOGO_DATA = '05/10/2026';
const FORNECEDOR = 'XDistribuidora';

const item = (marca, nome, custoPadrao, {preco = 0, variante = '', obs = ''} = {}) =>
  ({nome, marca, variante, custoPadrao, precoPadrao: preco, minimo: 0, fornecedor: FORNECEDOR, obs});

const relogios = (marca, lista, obs = '') => lista.map(([nome, custo, o]) => item(marca, nome, custo, {obs: o || obs}));
const acessorios = (prefixo, variante, lista) => lista.map(([nome, custo, obs]) => item('', `${prefixo} ${nome}`, custo, {variante, obs}));

const microwear = relogios('Microwear', [
  ['S10', 49], ['S10 Pro', 49], ['S11', 65], ['S11 Pro', 84], ['S11 Mini', 85],
  ['W10', 69], ['W10 Pro', 80], ['W10 Pro Mini', 74], ['W10T Mini', 66], ['W11X', 89],
  ['W11 Pro', 114], ['W11 Pro Mini', 114], ['W11 Mini', 92], ['W11 AI', 199], ['W11G', 149],
  ['U4', 64], ['U4 Pro', 82], ['U4 Plus', 88], ['U4 Mini', 74], ['U4 Mini Pro', 109], ['Ultra 4 AI 4G', 219],
  ['U5', 66], ['U5X', 74], ['U5 Pro', 94], ['U5 Plus', 105], ['Ultra U3W', 49],
  ['MA27', 84], ['MA33', 73], ['MA34', 66], ['M9', 134],
  ['W29S', 54], ['W29 Pro', 64], ['W59 Mini', 64], ['SU01', 133], ['SU02', 129], ['SU04', 119],
]);

const gswear = relogios('GS Wear', [['GS10 Ultra Mini', 49], ['GS10 Mini', 49], ['GS11 Mini', 75]]);

// Sem marca informada no catálogo.
const kits = relogios('', [
  ['N11 Pro', 39.99], ['N11 Ultra', 39.99], ['WS10-5 Ultra', 70], ['WS-79 Ultra 2', 58], ['WS-X10', 54], ['WS-X11', 74],
], 'Kit com pulseiras');
const promo = [item('', 'XV9 Pro', 49, {obs: 'Promoção. Modelo original XWear'})];

/*
 * Preço de venda dos Wearzone: tabela PVS da "Nova Política Comercial Wearzone".
 * As páginas individuais do mesmo catálogo trazem valores diferentes (ex.: Pulse R$ 219,90, Brave R$ 499,90);
 * confirmar qual vale com a XDistribuidora.
 */
const wearzone = [
  item('Wearzone', 'Easy',          95,  {preco: 199, obs: 'Cores: Preto, Prata, Rosa'}),
  item('Wearzone', 'Pulse',         110, {preco: 249, obs: 'Cores: Preto, Azul, Dourado, Verde'}),
  item('Wearzone', 'Life',          140, {preco: 299, obs: 'Cores: Preto, Prata, Rosa'}),
  item('Wearzone', 'Kron',          170, {preco: 349, obs: 'Cores: Preto, Prata, Laranja, Verde'}),
  item('Wearzone', 'Action',        199, {preco: 369, obs: 'Cores: Preto, Prata, Roxo, Rosa'}),
  item('Wearzone', 'Horizon Lite+', 199, {preco: 339, obs: 'Celular de pulso 2/16 GB. Cores: Preto, Prata'}),
  item('Wearzone', 'Horizon Titan', 269, {preco: 409, obs: 'Celular de pulso 2/16 GB. Cor: Preto'}),
  item('Wearzone', 'Brave',         285, {preco: 439, obs: 'Cores: Preto, Prata'}),
  item('Wearzone', 'Flare',         285, {preco: 439, obs: 'Cores: Preto, Prata, Dourado'}),
  item('Wearzone', 'Dune',          319, {preco: 459, obs: 'Cores: Bege, Preto'}),
];

const fones = [
  item('Wearzone', 'Zone Buds 01', 70,  {preco: 149.9, obs: 'Fone de ouvido. Cores: Preto, Branco'}),
  item('Wearzone', 'WZ06',         90,  {preco: 189.9, obs: 'Fone de ouvido. Cores: Preto, Branco'}),
  item('Wearzone', 'WZ08',         150, {preco: 349.9, obs: 'Headset. Cores: Preto, Branco'}),
];

const oculos = [
  item('Microwear', 'W93 Pro', 220,   {obs: 'Óculos inteligente'}),
  item('Microwear', 'W94',     59.99, {obs: 'Óculos inteligente'}),
];

const P1 = '38/40/41 mm', P2 = '42/44/45/47/49 mm', PINO = '18/22 mm (pino)';

const pulseiras1 = acessorios('Pulseira', P1, [
  ['Silicone', 4], ['Oceana', 4.5], ['Alpina', 7], ['Nike', 4.5], ['Trail Loop', 7], ['Alpina Fecho Preto', 7.5],
  ['Milanesa', 8], ['Oceana Sport', 7], ['Couro Slim', 22], ['Couro Xadrez', 12], ['Couro Microfibra', 25],
  ['Couro Fit Slim', 25], ['Elo Magnético com fecho de laço', 19], ['Couro com Glitter', 22], ['Sport Wave Lisa', 10],
  ['Silicone Elo magnético ocean', 28], ['Milanesa com fecho Magnético', 30], ['Aço de Luxo', 45],
  ['Luxo Brilance', 47], ['Luxo Diamond', 47], ['Luxo Perola', 48],
]);

const pulseiras2 = acessorios('Pulseira', P2, [
  ['Silicone', 4], ['Oceana', 4.5], ['Silicone Social', 3.5], ['Sport Line', 6], ['Sport Microtexturizada', 6],
  ['Trail Loop', 7], ['Alpina', 7], ['Milanesa', 8], ['Oceana Sport', 7], ['Elo Magnético Fit', 13],
  ['Couro Liso', 12], ['Silicone e Nylon', 14], ['Couro Microfibra', 25], ['Elo Magnético com fecho de laço', 19],
  ['Aço 1 Elo', 20], ['Milanesa com fecho Magnético', 30], ['Couro', 27], ['Silicone Elo magnético ocean', 28],
  ['Strap Loop', 17], ['Robot Titanium', 30], ['Nylon Strap', 22], ['Aço com Cristais', 45],
  ['Aço 3 Elos', 23], ['Aço 3 Elos Premium', 28], ['Luxo Diamond', 47], ['Aço de Luxo', 45], ['Aço 2 Elos', 45],
  ['Luxo Perola', 48], ['Milanesa Loop', 24], ['Aço 5 Elos', 30], ['Aço 3.2 Elos', 23], ['Aço 7 Elos', 23],
  // O catálogo lista "Aço 5 Elos" duas vezes, a R$ 30 e a R$ 23. Importado como dois itens para conferir.
  ['Aço 5 Elos (2ª listagem)', 23, 'Aparece no catálogo também a R$ 30,00. Confirmar o preço.'],
]);

const pulseirasPino = acessorios('Pulseira', PINO, [
  ['Silicone Crocodile', 6], ['Silicone', 6], ['Sport', 6], ['Oceana Sport', 9], ['Oceana', 7], ['Sport Wave', 8],
  ['Couro Microfibra', 25], ['Milanesa', 10], ['Alpina', 9], ['Sport Vent', 9],
  ['Elo Magnético com fecho de Laço', 14], ['Silicone Elo Magnético Vent', 14],
  ['Sport Microtexturizada', 5], ['Sport Wave Lisa', 10], ['Aço Elos', 30],
]);

const pulseirasEspeciais = [
  item('', 'Pulseira Sport Vent', 10, {variante: 'Watch 7'}),
  item('', 'Pulseira Sport Wave Lisa', 11, {variante: 'Watch 8'}),
  item('', 'Pulseira Silicone Confete', 1, {variante: '38/41/42/49 mm', obs: 'Promoção Dia das Crianças'}),
];

const outros = [
  item('', 'Capinha de silicone com cobertura', 2),
  item('', 'Capinha de silicone sem cobertura', 2),
  item('', 'Película 3D', 2),
  item('', 'Película 3D reforçada', 2),
  item('', 'Cabo de carregamento', 5, {obs: 'Catálogo diz "a partir de R$ 5,00"'}),
  item('Wearzone', 'Suporte Expositor', 7),
  item('', 'Suporte Expositor de Metal', 20),
];

export const CATALOGO_XDISTRIBUIDORA = [
  ...microwear, ...gswear, ...kits, ...promo, ...wearzone, ...fones, ...oculos,
  ...pulseiras1, ...pulseiras2, ...pulseirasPino, ...pulseirasEspeciais, ...outros,
];

/** Condições de compra, como o catálogo informa (para o cadastro de fornecedores). */
export const FORNECEDOR_XDISTRIBUIDORA = {
  nome: 'XDistribuidora',
  site: 'xdistribuidora.meuspedidos.com.br (CE) · xdistribuidorasp.meuspedidos.com.br (SP)',
  pedidoMinimo: '5 peças de smartwatch (pode misturar modelos e cores); só acessórios: R$ 350,00',
  prazo: 'Envio em até 48 horas',
  pagamento: 'Pix (valor do pedido). Pedido pelo site e pagamento pelo WhatsApp com um consultor',
  obs: 'Atacado, com tabela de preços por quantidade. Garantia de 90 dias. Centros de distribuição em Fortaleza e no Brás.',
};
