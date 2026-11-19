/**
 * Build da Vercel: copia só a pasta assets/ (CSS, JS do navegador, imagens) para public/,
 * que a Vercel entrega direto pela CDN. O resto do projeto (src/, .env, docs…) nunca fica público.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const destino = path.join(raiz, 'public');
fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
fs.cpSync(path.join(raiz, 'assets'), path.join(destino, 'assets'), { recursive: true });
console.log('assets/ copiado para public/assets');
