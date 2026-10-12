/**
 * Prepara a foto para envio: corrige a rotação do celular, reduz para no máximo `lado` px e
 * converte para JPEG (cerca de 100 KB). Fundo branco, para PNG com transparência.
 */
export async function redimensionar(arquivo, lado = 900, qualidade = 0.82){
  if(!/^image\//.test(arquivo.type)) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
  if(arquivo.size > 15 * 1024 * 1024) throw new Error('A imagem é muito grande (máximo 15 MB).');
  let img;
  try{ img = await createImageBitmap(arquivo, {imageOrientation: 'from-image'}); }
  catch(e){ throw new Error('Não foi possível ler esta imagem.'); }
  const f = Math.min(1, lado / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * f)), h = Math.max(1, Math.round(img.height * f));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', qualidade));
  if(!blob) throw new Error('Não foi possível preparar a imagem.');
  return blob;
}
