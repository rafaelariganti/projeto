# DRE System — OAF Controle Financeiro (Node.js MVC + MySQL)

Sistema de controle financeiro com DRE, fluxo de caixa, calendário de contas, notas fiscais, cadastros, importação de planilhas e controle de acesso por usuário.

**Versão 4.0.0 (nov/2026)** — aparece na tela de login (`APP_VERSION` em `src/bootstrap.js`).

Node.js + Express + MySQL, organizado em MVC (Models, Views em EJS, Controllers). É a mesma aplicação da versão 3.3 em PHP, portada para Node: mesmas telas, mesma API, mesmo banco, mesmos padrões de projeto (Strategy, Factory, Observer). Dá pra apontar a versão Node para o banco que a versão PHP já usava — as tabelas são as mesmas e as senhas continuam valendo.

---

## Sumário

1. [Requisitos](#-requisitos)
2. [Como rodar no seu PC](#-como-rodar-no-seu-pc)
3. [Como rodar com Docker](#-como-rodar-com-docker)
4. [Como publicar (VPS / hospedagem com Node)](#-como-publicar)
   - [Na Vercel](#-na-vercel)
5. [Primeiro acesso](#-primeiro-acesso)
6. [Vindo da versão PHP (3.x)](#-vindo-da-versão-php-3x)
7. [Telas](#️-telas)
8. [Usuários e níveis de acesso](#-usuários-e-níveis-de-acesso)
9. [Importação de planilhas](#-importação-de-planilhas)
10. [Estrutura MVC](#-estrutura-mvc)
11. [Problemas comuns](#-problemas-comuns)
12. [☁️ AWS — implantação em produção](#️-aws--implantação-em-produção)

---

## ⚙️ Requisitos

- **Node.js 18 ou mais novo** (testado no 22) — https://nodejs.org (versão LTS)
- **MySQL 5.7+ / 8.x** ou **MariaDB 10.3+** (o do XAMPP serve: é só ligar o MySQL no painel)

---

## 💻 Como rodar no seu PC

1. Instale o **Node.js** (LTS) e deixe um **MySQL** ligado (XAMPP → Start no MySQL, ou MySQL Installer).
2. Abra um terminal na pasta do projeto e instale as dependências:
   ```bash
   npm install
   ```
3. **Copie o `.env.example` para `.env`** e ajuste o banco. Com o MySQL do XAMPP o padrão é:
   ```ini
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASS=
   DB_NAME=dre_oaf
   APP_ENV=development
   PORT=3000
   ```
   > O banco `dre_oaf` é **criado sozinho** na primeira vez, junto com todas as tabelas. Não precisa importar nada.
4. Suba o servidor:
   ```bash
   npm start          # ou: npm run dev  (reinicia sozinho quando você salva um arquivo)
   ```
5. Abra **http://localhost:3000** → vai aparecer **"Primeiro acesso"** — crie seu usuário. Ele vira o **Administrador**.

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run migrate` | cria/atualiza as tabelas sem abrir o site |
| `npm run schema` | gera o `database.sql` a partir do código |
| `npm run dados` | gera os dados fictícios de teste (ver abaixo) |
| `npm test` | testes unitários |
| `npm run smoke` | smoke test HTTP contra `BASE_URL` (padrão http://localhost:3000) |

> Dica (Windows): se o Explorer não deixar criar um arquivo chamado `.env`, abra o Bloco de Notas, cole o conteúdo e em "Salvar como" escolha **Todos os arquivos** e digite `".env"` com aspas.

---

## 🐳 Como rodar com Docker

```bash
docker compose up --build      # app + MySQL → http://localhost:8080
```

`uploads/` e `storage/` ficam montados na sua pasta, então os arquivos não somem ao recriar o container.

---

## 🌐 Como publicar

O sistema precisa de um lugar que rode **Node.js** (hospedagem compartilhada só de PHP não serve): VPS (Hostinger VPS, DigitalOcean, Contabo…), Render/Railway, ou a AWS (seção no fim).

Numa VPS:
1. Instale Node.js 22 e MySQL (ou use um banco gerenciado). Crie o banco e um usuário com acesso a ele.
2. Envie a pasta do projeto (sem `node_modules`) e rode `npm ci --omit=dev`.
3. Crie o `.env` com os dados do banco, **`APP_ENV=production`** (esconde mensagens técnicas de erro) e um `SESSION_SECRET` longo e aleatório.
4. Deixe o processo sempre ligado com **pm2** (`npm i -g pm2 && pm2 start server.js --name dre && pm2 save && pm2 startup`) ou um serviço do systemd.
5. Coloque um **nginx** na frente com HTTPS (Let's Encrypt) — exemplo pronto em `docs/nginx.conf.exemplo` — e `TRUST_PROXY=1` no `.env`.
6. Garanta permissão de escrita nas pastas **`uploads/`** e **`storage/`**.

> Rodando numa subpasta (ex.: `https://site.com/dre/`)? Use `BASE_PATH=/dre/` no `.env`.

### 👀 Modo demonstração (sem banco)

Pra mostrar as telas sem configurar banco nenhum (apresentação, portfólio, Vercel grátis): coloque a variável **`DEMO=1`**.

- O login já vem preenchido e entra sem senha, como administrador.
- Todas as telas mostram a clínica fictícia (dashboard, DRE, calendário, notas com PDF/XML, exportações…), a partir de `demo/dados.json.gz`.
- Criar, editar, apagar, importar e enviar arquivo mostram o aviso "Modo demonstração: nada é salvo".

Local: `npm run demo`. Na Vercel: **Settings → Environment Variables → `DEMO` = `1`** e redeploy (não precisa de nenhuma variável `DB_*`).

Pra atualizar os dados da demonstração depois de mudar o sistema: gere os dados fictícios num banco de teste, suba o sistema normal e rode `npm run gerar-demo`.

### ▲ Na Vercel

A Vercel não tem MySQL nem disco permanente, então o projeto se adapta sozinho quando roda lá:

- o servidor vira uma função (`api/index.js` exporta o mesmo app do `server.js`);
- uploads, notas fiscais, comprovantes e importações em andamento ficam na tabela **`arquivos`** do banco (`ARMAZENAMENTO=banco`);
- a versão do schema e as sessões de login também ficam no banco;
- `assets/` é publicado pela CDN da Vercel (o build copia pra `public/`); o resto do código nunca fica público.

**Passo a passo:**

1. **Crie um MySQL na nuvem.** Sugestão grátis: [Aiven](https://aiven.io) → *Create service* → MySQL → plano *Free*. Na tela do serviço anote host, porta, usuário, senha e baixe o **CA certificate**.
2. Na Vercel, **Add New → Project** → importe o repositório do GitHub. *Framework Preset*: **Other** (o resto vem do `vercel.json`).
3. Em **Settings → Environment Variables**, cadastre:

   | Variável | Valor |
   |---|---|
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` | os do banco (Aiven: porta costuma ser 2xxxx) |
   | `DB_NAME` | `defaultdb` (Aiven) ou o nome do banco que você criou |
   | `DB_SSL` | `1` |
   | `DB_SSL_CA` | conteúdo do `ca.pem` (cole tudo, com as linhas `-----BEGIN…`) |
   | `SESSION_SECRET` | um texto longo e aleatório (ex.: gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `APP_ENV` | `production` |
   | `LGPD_CONTROLADOR`, `LGPD_EMAIL` | dados da LGPD (opcional) |

   (Ou, no lugar das `DB_*`, uma `DATABASE_URL=mysql://usuario:senha@host:porta/banco?ssl-mode=REQUIRED`.)
4. **Deploy.** No primeiro acesso as tabelas são criadas (leva alguns segundos) e aparece o "Primeiro acesso".
5. Dados de teste no banco da nuvem (opcional, do seu PC): coloque no `.env` os mesmos dados do banco + `ARMAZENAMENTO=banco` e rode `npm run dados`.

**Limites da Vercel (plano grátis):**
- cada requisição pode ter no máximo **4,5 MB** — arquivos maiores que ~4 MB não sobem (o sistema já avisa);
- cada requisição pode levar até **60 s** — importação de planilhas muito grandes (milhares de linhas) com o banco longe pode passar disso; divida o arquivo;
- o banco grátis tem pouco espaço (Aiven free: 1 GB), e os PDFs/XML ficam nele.

Se o sistema for usado de verdade (muitos arquivos, planilhas grandes), uma VPS, o Railway/Render ou a AWS (seção abaixo) servem melhor — lá ele roda como servidor normal, com os arquivos em disco.

**Deu "500 FUNCTION_INVOCATION_FAILED"?** Abra *Deployments → (o deploy) → Logs*. Quase sempre é variável do banco faltando/errada ou SSL: confira `DB_SSL=1` e o `DB_SSL_CA`. Pra testar sem o certificado, `DB_SSL_INSEGURO=1` (criptografa, mas não confere o certificado).

---

## 🧩 Padrões de projeto

Strategy (regime e agrupamento do DRE), Factory (leitura do XML das notas) e Observer (eventos dos lançamentos), além de MVC, Front Controller e Singleton. Explicação e diagrama de classes em Mermaid em `docs/padroes/`.

## 🧪 Dados fictícios para testar

Gera uma clínica fictícia de jan/2025 a dez/2026: ~2.000 lançamentos (consultas, procedimentos, convênios, aluguel, folha, impostos, materiais…), transferências, 4 contas, clientes e fornecedores com CPF/CNPJ válidos e ~45 notas fiscais com XML e PDF. Tem contas atrasadas de propósito, meses futuros em aberto, um mês com prejuízo e crescimento de 2026 sobre 2025.

```bash
npm run dados                 # gera (só se o banco não tiver lançamentos)
npm run dados -- --limpar     # apaga lançamentos, notas, clientes e fornecedores e gera de novo
```

Usuários de teste: **financeiro / Demo1234** e **consulta / Demo1234** (este vê o aceite LGPD). Se o banco não tinha ninguém, cria também **admin / Admin1234**.

O gerador usa o mesmo sorteio (`mt_rand` com semente fixa) da versão PHP, então os números saem **exatamente iguais** aos de antes — a auditoria do DRE continua valendo.

> Use um banco separado pra testar (troque `DB_NAME` no `.env`, ex.: `dre_teste`) — o `--limpar` apaga os dados de movimento.

A auditoria do cálculo (12.684 conferências, 0 divergências na versão Node) está em `docs/testes/AUDITORIA-DRE.md`, com o script pra rodar de novo (`node docs/testes/auditoria/sistema.js` + `auditor.py`).

---

## 🔑 Primeiro acesso

- Com o banco vazio, a tela de login mostra **"Primeiro acesso"**: crie o administrador (senha com **8+ caracteres, letras e números**).
- Depois disso o cadastro público some. Novos usuários são criados em **Usuários e acessos**.
- Esqueceu a senha? Um administrador redefine em **Usuários e acessos → ⋮ → Redefinir senha** (gera uma senha provisória, trocada no próximo login). Cada pessoa troca a própria senha em **Meu perfil → Trocar senha**.
- No primeiro acesso de cada pessoa aparece o **Termo de uso e a Política de privacidade (LGPD)** para aceitar. Preencha `LGPD_CONTROLADOR`, `LGPD_CNPJ` e `LGPD_EMAIL` no `.env`.
- Se perder o único admin: rode no banco `UPDATE users SET tentativas_falhas=0, bloqueado_ate=NULL WHERE username='seu_usuario';` (desbloqueio) ou apague todos os usuários (`DELETE FROM users;`) para voltar ao "Primeiro acesso".

---

## 🔁 Vindo da versão PHP (3.x)

1. **Faça backup** do banco e das pastas `uploads/` e `storage/` da versão PHP.
2. Copie para a pasta do projeto Node: o seu `.env` (acrescente `PORT`, `SESSION_SECRET` e `BASE_PATH` do `.env.example`), a pasta `uploads/` e as pastas `storage/notas` e `storage/comprovantes`.
3. `npm install` e `npm start`. Na primeira vez o sistema cria a tabela `sessions` (o login agora fica no banco, não em arquivo). **Nada é apagado.**
4. As senhas continuam as mesmas (o bcrypt do PHP é aceito). Todo mundo só precisa entrar de novo, porque as sessões antigas do PHP não valem no Node.

O que mudou por dentro: `index.php` → `server.js` (Express), `app/` → `src/`, views PHP → EJS, PDO → mysql2, sessões em arquivo → tabela `sessions`. A API, as telas e o JavaScript do navegador são os mesmos. Na migração, a versão PHP e a Node rodaram lado a lado e as respostas foram comparadas: 143 consultas da API, 66 telas e 172 operações de escrita idênticas.

---

## 🖥️ Telas

| Tela | O que faz |
|---|---|
| **Dashboard** | KPIs do exercício, gráfico receitas × despesas por mês, comparação com o mesmo período do ano anterior, próximos vencimentos (7 dias), saldo por conta e despesas por categoria |
| **DRE** | Demonstrativo mês a mês: receita bruta → deduções (MDR) → receita líquida → despesas → resultado, com **AV%**, **ano anterior** e **AH%**. Agrupa por categoria, grupo/conta ou centro de custo; regime de **competência** ou **caixa**. Exporta Excel e PDF |
| **Calendário** | Contas a pagar e a receber por vencimento. Filtros (a receber / a pagar / vencidos / quitados), totais do mês, **dar baixa** com 1 clique, **nova conta** no dia (duplo clique no dia) |
| **Lançamentos** | Receitas e despesas com filtros, KPIs, baixa/reabrir. Etiqueta **NF** quando tem nota fiscal vinculada |
| **Notas fiscais** | Anexa, visualiza, substitui e remove **PDF e XML**; vincula a lançamento ou conta a pagar/receber; lê o XML (NF-e, NFC-e e NFS-e ABRASF/Nacional) e **preenche o lançamento sozinho** (valor, fornecedor, vencimento das duplicatas, forma de pagamento); importa várias notas de uma vez (até 20 arquivos) |
| **Fluxo de Caixa** | Dia a dia, realizado × previsto, por caixa |
| **Importar / Exportar** | Assistente de importação + Excel, CSV, XML e PDF + histórico com "desfazer" |
| **Clientes, Fornecedores, Parceiros** | Cadastros com CPF/CNPJ validado, busca na Receita (BrasilAPI), contratos e aditivos |
| **Categorias, Caixas/Banco, Formas de pagamento** | Cadastros de apoio (cor da categoria, saldo atual das contas, taxas MDR). Formas de pagamento podem ser **inativadas/reativadas** |
| **Usuários e acessos** | Usuários + níveis de acesso (só administrador) |
| **Logs** | Tudo que foi criado, alterado, apagado, importado, logins (inclusive falhos). Nas exclusões guarda **cópia do que foi apagado** ("Ver apagado") |
| **/termos e /privacidade** | Termo de uso e Política de privacidade (LGPD), abrem sem login |

O menu lateral pode ser **recolhido** (botão `‹` no topo) — o sistema lembra a escolha.

---

## 👥 Usuários e níveis de acesso

**Níveis de acesso** (aba "Níveis de acesso"): para cada tela você escolhe **Sem acesso**, **Ver** (só consulta) ou **Editar** (criar, alterar, apagar). O bloqueio vale no menu **e no servidor** (a API recusa mesmo se alguém tentar chamar direto).

Níveis que já vêm prontos:

| Nível | Para quem |
|---|---|
| **Administrador** | Acesso total + Usuários e acessos. Não pode ser apagado; o sistema nunca fica sem um admin ativo |
| **Usuário** | Dia a dia: lançamentos e cadastros de clientes/fornecedores/parceiros |
| **Financeiro** | Todas as telas financeiras e cadastros, sem gerenciar usuários |
| **Consulta** | Só visualiza, não altera nada |

Dá pra criar quantos níveis quiser (ex.: "Recepção", "Contador"), **duplicar** um existente e ajustar. Ao apagar um nível em uso, o sistema pede para qual nível os usuários vão.

**Usuários:**
- Ao criar, escolha **Gerar senha provisória** (aparece uma vez, pra você passar pra pessoa) ou **Definir agora**. Com senha provisória, no primeiro acesso a pessoa **é obrigada a criar a própria senha**.
- **Desativar** tira o acesso na hora sem apagar o histórico. **Redefinir senha** e **desativar** derrubam a sessão da pessoa imediatamente.
- A lista mostra último acesso (data e IP), quem está bloqueado e quem ainda não fez o primeiro acesso.

**Segurança do login:**
- 5 senhas erradas seguidas **bloqueiam o usuário por 15 min** (admin pode desbloquear antes). 15 erros do mesmo computador em 10 min bloqueiam o IP.
- "Manter conectado" guarda a sessão por 30 dias; sem marcar, a sessão cai ao fechar o navegador ou após 8h parada.
- Token CSRF em todas as ações, cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` em HTTPS), senha com bcrypt.
- Mostrar/ocultar senha, aviso de Caps Lock e medidor de força da senha.

---

## 📥 Importação de planilhas

Em **Importar / Exportar**:

1. **Arquivo** — escolha o que vai importar (**Lançamentos**, **Clientes** ou **Fornecedores**) e envie um `.xlsx` ou `.csv` (até 10 MB / 5.000 linhas). Tem **planilha modelo** pra baixar.
2. **Colunas** — o sistema sugere qual coluna vai em cada campo pelo nome do cabeçalho (Data, Valor, Descrição, Categoria, Situação, Vencimento…). Ajuste se precisar.
3. **Conferir** — prévia linha a linha: **prontas**, **com aviso**, **duplicadas** e **com erro** (erros e duplicadas são puladas).
4. **Pronto** — importa tudo numa transação só. No **histórico** dá pra **desfazer** (apaga só o que aquela importação criou).

O que ele entende sozinho:
- Valores `R$ 1.234,56`, `1234.56`, `-230,45`, `(230,45)`
- Datas `05/04/2026`, `05/04/26`, `2026-04-05` e datas do Excel
- Tipo: Receita/Entrada/Crédito ou Despesa/Saída/Débito. Sem coluna de tipo: **valor negativo = despesa** (ou escolha "tudo despesa" / "tudo receita")
- Situação: Pago/Quitado/Recebido/Sim ou Em aberto/Pendente/Não. Sem coluna: o padrão que você escolher
- Categoria pelo nome; se não existir, cria (se marcar a opção) ou deixa sem categoria
- CSV com `;` ou `,`, em UTF-8 ou ANSI (o padrão do Excel no Brasil)
- Duplicados: mesma data + tipo + valor + descrição (no sistema ou repetido na planilha)

> Arquivo `.xls` antigo (Excel 97-2003) não é lido: no Excel use **Salvar como → Pasta de Trabalho do Excel (.xlsx)**.

---

## 🧱 Estrutura MVC

```
DRE-node/
├── server.js                 ← front controller: Express serve os estáticos e manda o resto pro App
├── api/index.js              ← entrada da Vercel (exporta o mesmo app)
├── vercel.json               ← configuração da Vercel (rotas, build, limites da função)
├── package.json              ← dependências e comandos (npm start, npm test…)
├── .env.example              ← modelo da configuração (copie para .env)
├── database.sql              ← schema completo (opcional, as tabelas são criadas sozinhas)
├── src/
│   ├── bootstrap.js          ← carrega .env, constantes, fuso horário
│   ├── helpers.js            ← funções pequenas (e(), url(), validação de CPF/CNPJ…)
│   ├── routes.js             ← TODAS as rotas (páginas e /api/*)
│   ├── eventos.js            ← quem reage a cada evento (Observer)
│   ├── core/                 ← o "framework": App, Router, Request, Response, View, Context,
│   │                            Database, Model, Controller, Auth, Session, Csrf, Permissions, Logger
│   ├── controllers/
│   │   ├── PageController.js         ← entrega as telas (HTML)
│   │   ├── HealthController.js       ← GET /health
│   │   └── api/*Controller.js        ← JSON: Auth, Dre, Transacao, NotaFiscal, Cliente, Fornecedor, Parceiro,
│   │                                   Documento, Categoria, Caixa, FormaPagamento, Cadastro,
│   │                                   Usuario, Perfil, Log, Export, Importacao
│   ├── models/               ← um por tabela, com o SQL e as validações
│   ├── services/             ← regras maiores: DreService + Dre/ (Strategy), NotaFiscal/ (Factory),
│   │                            Armazenamento (arquivos no disco ou no banco),
│   │   └── Spreadsheet/         ImportService, Upload, PlanilhaReader (xlsx/csv), XlsxWriter, PdfWriter
│   ├── eventos/              ← Despachante, Evento, Ouvinte e ouvintes/ (Observer)
│   ├── database/             ← Migrator (cria/atualiza tabelas), DadosFicticios, MtRand
│   └── views/                ← templates EJS
│       ├── layouts/          ← app.ejs (menu + modais) e auth.ejs (login)
│       ├── pages/            ← uma view por tela
│       ├── partials/         ← menu lateral, modais compartilhados
│       ├── publico/          ← termo de uso e política de privacidade
│       ├── auth/login.ejs
│       └── errors/erro.ejs
├── assets/                   ← CSS, JS do navegador (core.js, pages/*.js) e imagens
├── uploads/                  ← arquivos enviados (bloqueado executar script)
├── storage/                  ← notas, comprovantes, importações temporárias (bloqueado pra web)
└── tests/                    ← unit/run.js, smoke.sh, load/k6.js
```

**Como uma requisição anda:** `server.js` (Express: estático, sessão, corpo/upload) → `App.run()` → `Router` acha a rota em `routes.js` → **Controller** confere permissão e chama o **Model** (SQL) / **Service** (cálculo) → devolve JSON (API) ou renderiza a **View** (tela). Cada tela carrega seu JS, que busca os dados na API.

O `Context` (AsyncLocalStorage) guarda a requisição atual — por isso Models, Auth e Logger conseguem saber "quem está logado" e "qual o IP" sem receber `req` por parâmetro, como as superglobais do PHP faziam.

**Pra criar uma tela nova:**
1. Adicione a tela em `src/core/Permissions.js` (chave, nome, grupo do menu, rota) — ela já aparece no menu e na tela de níveis de acesso.
2. Adicione em `PAGINAS` do `src/controllers/PageController.js` (título e script) e crie `src/views/pages/<rota>.ejs` e `assets/js/pages/<rota>.js`.
3. Crie o Model/Controller da API e registre as rotas em `src/routes.js`. No controller use `await this.autorizar('tela')` pra ler e `await this.autorizarEdicao('tela')` pra alterar.

### Rotas da API (resumo)

| Método | Rota | |
|---|---|---|
| POST | `api/auth/login` · `auth/logout` · `auth/register` · `auth/trocar-senha` · `auth/profile` | login e conta |
| GET | `api/dre` · `dre/demonstrativo` · `dre/resumo` · `dre/detalhado` · `dre/fluxo-caixa` · `agenda` | relatórios |
| GET/POST/PUT/PATCH/DELETE | `api/transactions[/:id]` · `api/transfers[/:id]` | lançamentos |
| CRUD | `api/notas-fiscais` (+ `ler-xml`, `lote`, `/:id/vinculo`, `/:id/arquivo/:qual`) | notas fiscais |
| CRUD | `api/clientes` · `fornecedores` · `parceiros` · `categorias` · `caixas` · `formas_pagamento` · `documentos` | cadastros |
| CRUD | `api/users` (+ `/:id/senha`, `/:id/situacao`, `/:id/desbloquear`) · `api/perfis` | usuários e níveis |
| GET | `api/export/excel` · `csv` · `xml` · `pdf` · `dre-excel` | exportação |
| POST/GET/DELETE | `api/importacao/analisar` · `validar` · `confirmar` · `modelo` · `api/importacao/:id` | importação |

---

## 🩺 Problemas comuns

| Sintoma | Solução |
|---|---|
| "Não foi possível conectar ao banco de dados" | MySQL ligado? `DB_USER`/`DB_PASS`/`DB_NAME` certos no `.env`? No XAMPP a senha do root é vazia (`DB_PASS=`) |
| `Error: Cannot find module ...` ao rodar `npm start` | Faltou o `npm install` na pasta do projeto |
| `EADDRINUSE` (porta em uso) | Já tem algo na porta 3000 — feche o outro processo ou troque `PORT` no `.env` |
| "Sessão desatualizada. Recarregue a página" | A sessão expirou com a página aberta — recarregue (F5) |
| Upload falha com arquivo grande | O limite é 22 MB (`UPLOAD_MAX_MB` no `.env`); atrás de nginx, confira `client_max_body_size` |
| Mudou algo no banco na mão e o sistema não percebeu | Apague `storage/schema_version` e reinicie — as migrações rodam de novo (não apagam dados) |
| Usuário bloqueado | Admin: Usuários e acessos → ⋮ → Desbloquear (ou espere 15 min) |

---

# ☁️ AWS — implantação em produção

> Projeto Integrador de Computação em Nuvem — FATEC Sorocaba (ADS) · implantado no **AWS Academy Learner Lab**.
> Integrantes do grupo: passo a passo para hospedar na sua AWS em [`docs/aws/GUIA-GRUPO.md`](docs/aws/GUIA-GRUPO.md).
>
> Documento do trabalho (formato FATEC): [`docs/aws/IMPLANTACAO_AWS_DRE.pdf`](docs/aws/IMPLANTACAO_AWS_DRE.pdf) · detalhes extras em [`docs/aws/`](docs/aws/).

## Projeto

**O que é:** sistema web de controle financeiro (DRE, fluxo de caixa, calendário de contas, cadastros, importação de planilhas e notas fiscais) da OAF Consultoria Empresarial.

**Objetivo na nuvem:** tirar o sistema do PC/hospedagem compartilhada e rodá-lo na AWS com HTTPS, banco gerenciado, logs centralizados, alarmes, backup testado, deploy automático e rollback — preparado para operar de verdade, não só "estar no ar".

**Integrantes:** Nicolly Lemos da Silva · Rafaela Mansano Fernandes · Karina de Moraes Garcia · Rafaela Silva Riganti

**URL:** https://3udlpk22p9.execute-api.us-east-1.amazonaws.com · health: https://3udlpk22p9.execute-api.us-east-1.amazonaws.com/health

> O AWS Academy desliga a EC2 e o RDS quando a sessão do lab termina; fora do horário do lab a URL fica fora do ar.

## Arquitetura

```mermaid
flowchart TB
    U([Usuário / navegador]) -->|HTTPS 443| CF[API Gateway HTTP API<br/>dre-dev-api<br/>certificado da AWS · throttling]
    GH[GitHub Actions<br/>CI + CD] -->|SSH deploy.sh| EC2
    subgraph VPC["VPC padrão — us-east-1"]
        CF -->|HTTP 80 + cabeçalho secreto<br/>X-Origin-Verify| EC2[EC2 t3.small · Amazon Linux 2023<br/>Docker: Node.js 22 (Express)<br/>dre-dev-app + Elastic IP]
        EC2 -->|3306 — SG só da EC2| RDS[(RDS MySQL 8.0<br/>dre-dev-mysql<br/>privado · criptografado<br/>backup automático 7 dias)]
        EC2 -.->|lê senha do banco<br/>e segredo de origem| SM[Secrets Manager<br/>dre-dev-db · dre-dev-origin]
        EC2 -->|dump diário + uploads| S3[(S3 dre-dev-backups<br/>versionado · criptografado)]
        EC2 -->|stdout/stderr do container| CWL[CloudWatch Logs<br/>/dre/dev/app]
    end
    CWL --> MF[Metric filters<br/>ErrorCount · LoginFailed]
    MF --> AL[CloudWatch Alarms + Dashboard]
    RDS --> AL
    EC2 --> AL
    CF --> AL
    AL --> SNS[SNS dre-dev-alertas<br/>e-mail da equipe]
```

A infraestrutura inteira está em código: [`infra/cloudformation.yaml`](infra/cloudformation.yaml) (Infrastructure as Code — apaga e recria igual).

### Por que cada serviço

| Serviço | Justificativa técnica |
|---|---|
| **EC2 + Docker** | A aplicação é um servidor Node.js (Express) com uploads em disco. Uma VM roda isso sem reescrever o sistema. O Docker deixa a imagem idêntica no CI e na EC2 e permite guardar versões anteriores para rollback instantâneo. Lambda exigiria reescrever o app para serverless e tirar o estado do disco. |
| **RDS MySQL** | O sistema é relacional (lançamentos ↔ categorias ↔ caixas ↔ parceiros, DRE com JOIN/GROUP BY), então NoSQL não serve. O RDS tira da equipe patch, backup automático, point-in-time restore, criptografia e storage autoscaling. |
| **API Gateway (HTTP API)** | Dá um endpoint HTTPS da própria AWS sem precisar de domínio, com throttling (protege a EC2 de rajadas) e métricas de requisições, erros e latência. Funciona como proxy reverso para a EC2. O CloudFront seria a primeira escolha, mas o Learner Lab bloqueia `cloudfront:CreateDistribution`; o ALB daria HTTPS só com domínio próprio no ACM. |
| **Secrets Manager** | A senha do banco é gerada pela própria AWS e nunca passa por Git, template ou tela. A EC2 lê na hora do deploy usando a role da instância (sem Access Key). |
| **S3** | Destino barato e durável (11 noves) dos backups: dumps do MySQL e cópia dos uploads/comprovantes/notas. Versionamento protege contra apagar ou sobrescrever por engano. |
| **CloudWatch** | Logs centralizados (o Docker envia direto), métricas de EC2/RDS/API Gateway, métricas extraídas dos logs (erros, logins errados), alarmes e dashboard. |
| **SNS** | Entrega os alarmes por e-mail para a equipe. |
| **Elastic IP** | O Learner Lab desliga a EC2 ao fim da sessão; o IP fixo mantém o destino do API Gateway e o secret `EC2_HOST` do GitHub válidos. |

### Organização dos recursos

Tudo segue `<projeto>-<ambiente>-<recurso>` (`dre-dev-app`, `dre-dev-mysql`, `dre-dev-backups-<conta>`, `/dre/dev/app`) e recebe as tags `Project=DRE`, `Environment=dev|hml|prod`, `Team=OAF-Grupo`.

## Deploy

### 1ª vez (cria tudo)

1. No Learner Lab, **Start Lab** e abrir o console (região **us-east-1**).
2. **CloudFormation → Create stack → Upload** `infra/cloudformation.yaml`. Nome: `dre-dev`. Parâmetros: `Environment=dev`, `KeyName=vockey`, `AlertEmail=<e-mail da equipe>` (o resto já vem certo).
3. Esperar `CREATE_COMPLETE` (~15 min: o RDS é o mais lento). A EC2 instala Docker, clona o repositório e roda `scripts/deploy.sh` sozinha; o `cfn-signal` só confirma quando o `/health` fica UP.
4. Confirmar a inscrição do SNS no e-mail recebido.
5. Abrir a saída **AppUrl** → tela "Primeiro acesso" → criar o administrador.
6. No GitHub (**Settings → Secrets and variables → Actions**):
   - Secrets: `EC2_HOST` = saída `Ec2PublicIp` · `EC2_SSH_KEY` = conteúdo do `labsuser.pem` (AWS Details → Download PEM)
   - Variables: `APP_URL` = saída `AppUrl` · `ENVIRONMENT` = `dev`

> Repositório precisa ser público para a EC2 clonar. Se for privado, cadastrar uma *deploy key* só leitura.

### Atualizações

Merge na `main` → CI passa → CD faz o deploy sozinho (próxima seção). Manual, se precisar:
```bash
ssh -i labsuser.pem ec2-user@<Ec2PublicIp>
sudo bash /opt/dre/app/scripts/deploy.sh main      # ou uma tag: v3.3.0
```

### Rodar local igual à produção
```bash
docker compose up --build      # app + MySQL → http://localhost:8080
```

## CI/CD

| Workflow | Quando | O que faz |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | todo push e PR | `node --check` em todos os arquivos · testes unitários (`npm test`) · ShellCheck dos scripts · `cfn-lint` do template · **gitleaks** (barra commit com senha/chave) · integração com **MySQL 8** real (migração + smoke test HTTP) · `docker build` e teste do container |
| [`cd.yml`](.github/workflows/cd.yml) | CI verde na `main` (ou manual) | SSH na EC2 → `deploy.sh <commit>` → smoke test pela URL HTTPS → cria a tag `deploy-dev-AAAAMMDD-HHMMSS` |
| [`rollback.yml`](.github/workflows/rollback.yml) | manual | volta para a imagem anterior ou para uma tag escolhida |
| [`carga.yml`](.github/workflows/carga.yml) | manual | teste de carga com k6 |

```
push/PR ─► CI: lint ─► unit ─► integração (MySQL) ─► docker build ─► gitleaks
                                    │ (main e tudo verde)
                                    ▼
CD: ssh EC2 ─► git checkout <sha> ─► .env do Secrets Manager ─► docker build
    ─► troca o container ─► /health UP? ── não ─► volta sozinho pra versão anterior
                                 └─ sim ─► smoke HTTPS ─► tag deploy-*
```

O PR só deve ser aceito com o CI verde (Settings → Branches → *require status checks*).

## Segurança

**Secrets.** Nenhuma credencial no repositório: o `.env` está no `.gitignore` e o gitleaks roda em todo push. Na AWS a senha do RDS é gerada pelo Secrets Manager (`GenerateSecretString`), o CloudFormation passa para o RDS via `{{resolve:secretsmanager:...}}` e o `deploy.sh` monta o `.env` na EC2 com permissão `600`. No GitHub só ficam o IP e a chave SSH, como *encrypted secrets*. As senhas que aparecem em `docker-compose.yml` e no `ci.yml` são de bancos descartáveis locais/do runner.

**Rede.** O usuário só entra pelo API Gateway (HTTPS). Como o API Gateway não tem lista de IPs fixa para liberar no Security Group, ele envia em toda requisição o cabeçalho `X-Origin-Verify` com um segredo gerado no Secrets Manager; a aplicação compara (`crypto.timingSafeEqual`) e quem acessar o IP da EC2 direto recebe **403** (só o `/health` responde, sem dado sensível). O IP real do usuário chega no `X-Client-Ip` e o HTTPS no `X-Origin-Proto`, ambos **sobrescritos** pelo API Gateway — o usuário não consegue forjar, por isso `TRUST_PROXY=1` é seguro e o rate limit de login continua valendo por IP. RDS sem IP público, só aceita a EC2. Discos EBS e RDS criptografados, IMDSv2 obrigatório.

**Aplicação.** O que já existia continua: bcrypt, CSRF, rate limit e bloqueio por tentativas, cookie `httpOnly + SameSite=Strict + Secure` (agora reconhecendo o HTTPS do API Gateway), XSS escapado, servidor bloqueando `src/`, `storage/`, `node_modules/`, `.env`, `.sql` e as pastas de operação (`infra/`, `scripts/`, `tests/`, `docker/`).

**IAM.** No lab a EC2 usa o `LabInstanceProfile` (LabRole). Em produção ela teria uma role própria só com o necessário — a policy pronta está em [`docs/aws/iam-producao.json`](docs/aws/iam-producao.json):

| Precisa | Ação | Recurso |
|---|---|---|
| Ler a senha do banco | `secretsmanager:GetSecretValue` | só o secret `dre-prod-db` |
| Mandar logs | `logs:CreateLogStream`, `logs:PutLogEvents` | só o log group `/dre/prod/app` |
| Backup | `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` | só o bucket `dre-prod-backups-*` |

Nada de `*`, nada de IAM, EC2 ou RDS administrativo — é o **least privilege**.

## Monitoramento

**Logs.** A aplicação grava uma linha JSON por evento ([`src/core/Logger.js`](src/core/Logger.js)) com `level` = `INFO` (operações: login, criar/editar/apagar lançamento…), `WARN` (login errado, acesso negado, bloqueio) e `ERROR` (falha de banco, exceção). O Docker envia para o CloudWatch Logs (`/dre/dev/app`, retenção 30 dias). Senha, token, cookie e CSRF são mascarados no Logger e o snapshot dos registros nunca vai pro log.

```json
{"ts":"2026-11-05T13:41:02-03:00","level":"WARN","env":"production","version":"4.0.0","msg":"Operação: login_failed","method":"POST","path":"/api/auth/login","ip":"177.x.x.x","acao":"login_failed","entidade":"auth","usuario":"ana"}
```

Consulta rápida no **Logs Insights**:
```
fields @timestamp, level, msg, path | filter level = "ERROR" | sort @timestamp desc | limit 20
```

**Health check.** `GET /health` testa o banco e responde `{"status":"UP","version":"4.0.0","environment":"production","checks":{"database":"UP"},"latency_ms":2}` (HTTP 503 com `DOWN` se o banco cair). Usado pelo Docker (`HEALTHCHECK`), pelo deploy, pelo CD e pelo teste de carga.

**Métricas e alarmes** (dashboard `dre-dev` no CloudWatch, tudo criado pelo template, avisos por e-mail via SNS):

| Alarme | Dispara quando |
|---|---|
| `dre-dev-app-erros` | 5+ logs `ERROR` em 5 min (metric filter) |
| `dre-dev-login-falhas` | 20+ logins errados em 5 min — possível força bruta |
| `dre-dev-ec2-cpu` / `dre-dev-rds-cpu` | CPU > 80% por 10 min |
| `dre-dev-ec2-status` | status check da instância falhando |
| `dre-dev-rds-disco` | menos de 2 GB livres no banco |
| `dre-dev-api-5xx` | 10+ respostas 5xx no API Gateway em 5 min |
| `dre-dev-api-latencia` | latência p95 acima de 2 s por 10 min |

O dashboard mostra requisições, erros 4xx/5xx e latência p95 (API Gateway), CPU EC2 × RDS, conexões do banco e os últimos WARN/ERROR.

## Backup

| O quê | Como | Retenção |
|---|---|---|
| Banco (completo) | **Backup automático do RDS** + point-in-time restore (até o segundo) | 7 dias |
| Banco (lógico) | `scripts/backup.sh` — `mysqldump` diário às 03:30 → `s3://dre-dev-backups-*/mysql/AAAA/MM/DD/` | 30 dias |
| Arquivos (uploads, comprovantes, notas, contratos) | `scripts/backup.sh` — `aws s3 sync` diário → `s3://…/files/` (bucket versionado) | versões antigas 30 dias |
| Ao apagar a stack | `DeletionPolicy: Snapshot` no RDS e `Retain` no bucket | até apagar manualmente |

### Se os dados forem perdidos, como recuperamos?

- **Apagaram registros / dado errado** → `sudo bash scripts/restore.sh db` (último dump) ou `restore.sh db mysql/2026/11/05/<arquivo>.sql.gz`.
- **Banco corrompido ou perdido** → *RDS → Automated backups → Restore to point in time* (ou CLI abaixo), troca o host no secret e roda o `deploy.sh`:
  ```bash
  aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier dre-dev-mysql \
    --target-db-instance-identifier dre-dev-mysql-restore --restore-time 2026-11-05T15:00:00Z
  ```
- **Perderam arquivos da EC2 / EC2 inteira** → recriar a stack (ou só a instância) e `sudo bash scripts/restore.sh files`.

### Restore testado

Roteiro executado pela equipe em 05/11/2026 (prints 10 a 15 em [`docs/aws/prints/`](docs/aws/prints/)):
```
1. Cadastrar o cliente "TESTE RESTORE" e anexar um comprovante
2. sudo bash scripts/backup.sh                      → dump + arquivos no S3
3. Falha simulada: apagar o cliente pela tela e remover /opt/dre/data/storage/comprovantes/*
4. sudo FORCE=1 bash scripts/restore.sh db  &&  sudo bash scripts/restore.sh files
5. Conferir: cliente e comprovante de volta, /health UP
```

## Ambientes

O código não tem nada fixo: tudo vem de variáveis de ambiente (`DB_*`, `APP_ENV`, `ENVIRONMENT`, `TRUST_PROXY`, `APP_TZ`, `PORT`). O mesmo template sobe qualquer ambiente só trocando o parâmetro `Environment`:

| | DEV (lab) | HML | PROD |
|---|---|---|---|
| Stack | `dre-dev` | `dre-hml` | `dre-prod` |
| Banco | `dre-dev-mysql` / `dredev` | `dre-hml-mysql` / `drehml` | `dre-prod-mysql` / `dreprod` (Multi-AZ, deletion protection — automático no template) |
| Logs | `/dre/dev/app` | `/dre/hml/app` | `/dre/prod/app` |
| Deploy | merge na `main` (implementado) | tag `v*` + aprovação no environment (planejado) | tag `v*` + aprovação manual (planejado) |
| Local | `docker compose up` (`dre_dev`) | — | — |

No GitHub cada um é um *Environment* com seus próprios `EC2_HOST`, `EC2_SSH_KEY` e `APP_URL`.

## Rollback

| Situação | Estratégia | Tempo |
|---|---|---|
| Versão nova não sobe | **automático**: o `deploy.sh` só troca se o `/health` ficar UP; senão volta para a imagem anterior | segundos |
| Subiu, mas com bug | Actions → **Rollback** (sem ref) ou `sudo bash scripts/rollback.sh` → reativa a imagem anterior (as 5 últimas ficam guardadas, sem rebuild) | ~10 s |
| Voltar para uma versão específica | Actions → **Rollback** com a tag (`deploy-dev-…` ou `v3.2.0`) → rebuild daquela versão | ~1-2 min |
| Mudança de infraestrutura quebrou | CloudFormation faz **rollback automático** da stack se a atualização falhar | automático |
| Migração de banco quebrou dados | restore do dump anterior ao deploy ou point-in-time do RDS | minutos |

Histórico de deploys em `/opt/dre/state/history.log` e nas tags `deploy-*` do GitHub.

## Escalabilidade

| Usuários | Comportamento | O que muda |
|---|---|---|
| **100** | Folgado. Teste de carga feito com 100 usuários (ver `docs/testes/`). | nada |
| **1.000** | EC2 t3.small e RDS micro ainda dão conta (uso típico de sistema financeiro interno: poucas requisições por usuário). O throttling do API Gateway segura rajadas. | subir para t3.medium / db.t3.small se o alarme de CPU tocar (troca de parâmetro na stack) |
| **10.000** | **Gargalo: uma EC2 só** (ponto único de falha) e uploads no disco local impedem ter várias (as sessões já ficam no MySQL desde a versão Node). | uploads/comprovantes → S3 · **ALB + Auto Scaling Group** (2+ EC2 em AZs diferentes) · RDS Multi-AZ |
| **100.000** | Banco vira o gargalo (relatórios DRE pesados). | ECS Fargate com auto scaling · **Aurora MySQL** com réplicas de leitura para relatórios · cache dos relatórios (Redis) · CloudFront + AWS WAF na frente |

**Escala sozinho hoje:** API Gateway, S3, CloudWatch, Secrets Manager e o *storage* do RDS (autoscaling até 100 GB). **Não escala sozinho:** EC2 (vertical, manual) e CPU/memória do RDS.

### Teste de carga (k6)

> Os números abaixo são da versão PHP (3.3, Apache), medidos antes da migração para Node. Vale rodar o workflow de novo depois do primeiro deploy da versão 4.0.

Rodado pelo workflow **Teste de carga** contra a URL pública (API Gateway → EC2 t3.small → RDS db.t3.micro), em 05/11/2026. Script em [`tests/load/k6.js`](tests/load/k6.js); cada usuário virtual abre `/health` (consulta o banco), `/login` e o CSS, e espera 1 s.

| Cenário | Usuários | Requisições | Vazão | Erros | Mediana | p90 | p95 | Metas (erro < 1%, p95 < 800 ms) |
|---|---|---|---|---|---|---|---|---|
| **Carga** (uso normal) | até 30 | 4.896 | 32,6 req/s | **0%** | 78 ms | 312 ms | 715 ms | ✅ atingidas |
| **Estresse** (achar o limite) | até 100 | 6.789 | 37,5 req/s | **0%** | 76 ms | 3,8 s | 4,6 s | só observação |

**Leitura.** No uso normal o sistema responde em ~80 ms na maioria das requisições e não teve nenhum erro. No estresse ele também não derrubou nenhuma requisição (zero 429 e zero 5xx), mas a vazão travou em ~37 req/s: a partir daí as requisições entram em fila e o p95 sobe para ~4,6 s. **O dashboard do CloudWatch mostra que não foi falta de CPU** — a EC2 ficou abaixo de ~5% e o RDS quase sem conexões durante os testes — enquanto a *IntegrationLatency* do API Gateway (tempo esperando a EC2 responder) subiu junto com a latência total. Ou seja, o limite está no **caminho da requisição até a única instância** (processos do Apache atendendo conexões em fila e o trajeto API Gateway → EC2), não no processador nem no banco. Próximos passos: ajustar o Apache (`MaxRequestWorkers`/trocar prefork por PHP-FPM + event MPM) e medir de novo; para crescer de verdade, **ALB + Auto Scaling Group** com 2+ instâncias (o que exige tirar sessões e uploads do disco local).

**Deploy durante o teste.** Uma rodada extra do cenário carga coincidiu com um deploy automático (tag `deploy-dev-20261105-200929`, no meio do teste): 223 requisições (4,9%) voltaram 5xx — inclusive o CSS estático — o que corresponde a ~7 s de indisponibilidade enquanto o container era trocado. Com uma EC2 só, **todo deploy causa alguns segundos fora do ar**. Em produção: deploy **blue/green** (ou rolling) com 2+ instâncias atrás de um ALB, onde o tráfego só muda depois que a versão nova passa no health check.

Rodar de novo: Actions → **Teste de carga** → `cenario` = `carga` ou `estresse`, ou `k6 run -e BASE_URL=<AppUrl> -e CENARIO=carga tests/load/k6.js`.

## Custos

Estimativa **fora do AWS Academy**, us-east-1, sob demanda, sem free tier — conferir/atualizar no [AWS Pricing Calculator](https://calculator.aws/) (detalhes em [`docs/aws/custos.md`](docs/aws/custos.md)).

Cenário: 10.000 usuários/mês · 100.000 chamadas de API · 500.000 operações no banco · 10 GB de armazenamento.

| Serviço | Configuração | US$/mês (aprox.) |
|---|---|---|
| EC2 | t3.small 24×7 + 20 GB gp3 + monitoramento detalhado | ~19 |
| RDS MySQL | db.t3.micro Single-AZ + 20 GB gp3 (backup de até 20 GB incluso) | ~15 |
| IPv4 público (Elastic IP) | 1 IP 24×7 | ~3,60 |
| CloudWatch | ~2 GB de logs, 8 alarmes, 2 métricas custom | ~3 |
| API Gateway (HTTP API) | ~1 M requisições (US$ 1/milhão) + ~10 GB de saída | ~2 |
| S3 | ~10 GB de backups + requisições | ~0,30 |
| Secrets Manager | 1 segredo | 0,40 |
| SNS | e-mails de alarme | ~0 |
| **Total** | | **≈ US$ 43/mês** |

**Conferido no [AWS Pricing Calculator](https://calculator.aws/#/estimate?id=f574f4eff1fce70d47bed9cb6b2144a2a2c7e7c9):** **US$ 50,28/mês** com o RDS em Multi-AZ (configuração de produção) — detalhes em [`docs/aws/custos.md`](docs/aws/custos.md).

**Maior custo:** EC2 seguido de perto pelo RDS (computação 24×7). Em produção real, com RDS Multi-AZ, o RDS dobra e vira o maior (~US$ 30). Para economizar: Savings Plans / instâncias reservadas (−30 a −40%), Graviton (t4g), e o free tier no primeiro ano.

## 🎓 AWS Academy × Produção

| Tema | No AWS Academy | Limitação | Em produção |
|---|---|---|---|
| **IAM** | EC2 usa `LabInstanceProfile` (LabRole) | não dá pra criar Roles/Policies | role própria com least privilege ([`docs/aws/iam-producao.json`](docs/aws/iam-producao.json)) |
| **CD** | GitHub Actions entra na EC2 por **SSH** com o `labsuser.pem` | as credenciais AWS do lab expiram a cada sessão (~4 h) e não podemos criar usuário IAM nem OIDC | GitHub Actions com **OIDC** (sem chave guardada) assumindo uma role de deploy → **SSM Run Command** ou **CodeDeploy**; imagem no **ECR** |
| **Acesso ao servidor** | porta 22 aberta (só chave) porque os IPs do GitHub mudam | sem SSM Session Manager configurável | sem porta 22: **SSM Session Manager** |
| **Disponibilidade** | lab desliga EC2/RDS ao fim da sessão; ao reiniciar o Docker sobe o app sozinho e o Elastic IP mantém o endereço | sessão limitada | 24×7, ALB + 2 AZs, RDS Multi-AZ |
| **Ambientes** | só `dev` | orçamento/limites do lab | stacks independentes `dev`, `hml`, `prod` (idealmente em contas separadas via AWS Organizations) |
| **CDN / HTTPS** | API Gateway com certificado da AWS (`*.execute-api.amazonaws.com`) | **o lab nega `cloudfront:CreateDistribution`** (erro 403 ao criar a stack) e não há Route 53/domínio | **CloudFront** na frente (cache dos estáticos, SG liberando só o prefix list do CloudFront em vez do segredo de origem) + domínio no Route 53 + certificado ACM + AWS WAF |
| **Uploads** | arquivos de até **10 MB** pela internet | limite fixo de payload do API Gateway HTTP API | CloudFront aceita os 20 MB que o sistema permite (ou upload direto para o S3 com URL pré-assinada) |
| **Secrets** | Secrets Manager sem rotação | rotação usa Lambda com role própria | rotação automática a cada 30 dias |
| **Backup** | backup automático do RDS + script de dump/sync no S3 | AWS Backup e réplica entre regiões limitados | **AWS Backup** com plano centralizado e cópia para outra região (DR) |
| **Logs do RDS** | não exportados | exportar exige role de serviço | `error` e `slowquery` exportados para o CloudWatch, Performance Insights |
| **Custos** | crédito do lab | sem Budgets/Cost Explorer completos | **AWS Budgets** com alerta + tags de custo por `Project`/`Environment` |

### Disaster Recovery

RPO (quanto dado pode perder): **≤ 5 min** pelo point-in-time do RDS, **24 h** para arquivos. RTO (quanto tempo fora): **~30 min** — recriar a stack pelo template + restore. Em produção: snapshots copiados para outra região e template pronto para subir lá.

## 📸 Evidências

Prints em [`docs/aws/prints/`](docs/aws/prints/) (dados pessoais do cliente de teste borrados).

| # | O que mostra | Requisito |
|---|---|---|
| 01 · 02 | [Stack `dre-dev` CREATE_COMPLETE](docs/aws/prints/01-cloudformation-stack-create-complete.png) e [eventos](docs/aws/prints/02-cloudformation-eventos.png) | Aplicação na AWS · IaC |
| 03 | [Site aberto em HTTPS pelo API Gateway](docs/aws/prints/03-site-https-primeiro-acesso.png) | HTTPS |
| 04 · 05 | [CI e CD no GitHub Actions](docs/aws/prints/04-github-actions-ci-cd.png) · [deploy na EC2 com sucesso](docs/aws/prints/05-cd-deploy-ec2-sucesso.png) | CI/CD |
| 06 | [Rollback pelo GitHub Actions](docs/aws/prints/06-rollback-sucesso.png) | Rollback |
| 07 | [Dashboard `dre-dev` no CloudWatch](docs/aws/prints/07-cloudwatch-dashboard-dre-dev.png) | Monitoramento |
| 08 | [Alarme `dre-dev-api-5xx` disparado sozinho](docs/aws/prints/08-cloudwatch-alarme-api-5xx-disparado.png) pelos erros do deploy durante o teste de carga | Alarmes |
| 18 | [Logs no CloudWatch Logs Insights](docs/aws/prints/18-cloudwatch-logs-insights.png): INFO (logout), WARN (logins errados) e o bloqueio de acesso direto à EC2 sem o segredo de origem | Logs · Segurança |
| 09 | [Teste de estresse com k6](docs/aws/prints/09-teste-estresse-k6.png) | Teste de carga |
| 10 → 15 | Restore: [dado criado](docs/aws/prints/10-restore-1-cliente-cadastrado.png) → [backup no S3](docs/aws/prints/11-restore-2-backup-s3.png) → [falha simulada](docs/aws/prints/12-restore-3-falha-simulada.png) → [dado apagado](docs/aws/prints/13-restore-4-cliente-apagado.png) → [restore](docs/aws/prints/14-restore-5-restore-banco.png) → [dado recuperado](docs/aws/prints/15-restore-6-cliente-recuperado.png) | Backup · Restore testado |
| 16 · 17 | [Secrets](docs/aws/prints/16-github-secrets.png) e [variables](docs/aws/prints/17-github-variables.png) do GitHub (só nomes, valores criptografados) | Secrets fora do código |

## ✅ Checklist de entrega

- [x] Aplicação na AWS (EC2 + RDS, nada depende de PC de integrante)
- [x] HTTPS (API Gateway)
- [x] Código no GitHub, sem credenciais (gitleaks no CI)
- [x] CI (lint, testes, integração com MySQL, build Docker)
- [x] CD automático via GitHub Actions (+ limitação documentada)
- [x] Logs no CloudWatch (INFO/WARN/ERROR estruturados)
- [x] Monitoramento: métricas, dashboard e alarmes
- [x] Health check `/health`
- [x] Backup (RDS automático + dump/arquivos no S3) e restore com roteiro de teste
- [x] Diagrama e justificativa dos serviços
- [x] Configuração por ambiente (dev/hml/prod)
- [x] Infrastructure as Code (CloudFormation)
- [x] Rollback (automático no deploy + manual + CloudFormation)
- [x] Escalabilidade analisada e teste de carga (k6)
- [x] Custo estimado
- [x] Limitações do Academy e diferenças para produção
