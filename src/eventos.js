/**
 * eventos.js — quem reage a cada evento (PADRÃO OBSERVER).
 * Para uma reação nova: criar uma classe em src/eventos/ouvintes e registrar aqui.
 */
const Despachante = require('./eventos/Despachante');
const Evento = require('./eventos/Evento');
const ApagarComprovante = require('./eventos/ouvintes/ApagarComprovante');
const DesvincularNotasFiscais = require('./eventos/ouvintes/DesvincularNotasFiscais');
const VincularNotaFiscal = require('./eventos/ouvintes/VincularNotaFiscal');

Despachante.ouvir(Evento.LANCAMENTO_CRIADO, new VincularNotaFiscal());
Despachante.ouvir(Evento.LANCAMENTO_APAGADO, new DesvincularNotasFiscais());
Despachante.ouvir(Evento.LANCAMENTO_APAGADO, new ApagarComprovante());
