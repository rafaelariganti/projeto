/**
 * LGPD — Termo de uso/consentimento e Política de privacidade.
 * Mudou o texto de forma relevante? Suba a VERSAO: todo mundo aceita de novo no próximo acesso.
 * Quem é o controlador e o contato do encarregado (DPO) vêm do .env (LGPD_CONTROLADOR, LGPD_CNPJ, LGPD_EMAIL).
 */
const { env } = require('../helpers');

const VERSAO = '1.0';
const VIGENCIA = '28/10/2026';

function controlador() { return String(env('LGPD_CONTROLADOR', 'OAF Consultoria Empresarial')); }
function cnpj() { return String(env('LGPD_CNPJ', '')); }
function email() { return String(env('LGPD_EMAIL', '')); }

/** Usuário precisa (re)aceitar? */
function pendente(u) { return u !== null && u !== undefined && String(u.termos_versao ?? '') !== VERSAO; }

module.exports = { VERSAO, VIGENCIA, controlador, cnpj, email, pendente };
