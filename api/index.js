/**
 * Entrada da Vercel: cada requisição que não é arquivo estático cai aqui.
 * É o mesmo app do server.js, só que exportado (a Vercel cuida da porta).
 */
module.exports = require('../server').app;
