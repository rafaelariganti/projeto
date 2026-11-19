# DRE System — imagem de produção (Node.js 22 + Express)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Dependências primeiro (camada em cache enquanto o package.json não muda)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .
RUN rm -rf .git .github infra tests docker scripts docs *.md .env \
 && mkdir -p storage/imports storage/notas storage/comprovantes \
            uploads/documentos uploads/fornecedores uploads/parceiros uploads/perfil \
 && chown -R node:node storage uploads

ARG APP_REVISION=dev
LABEL org.opencontainers.image.source="https://github.com/nicollylemos/DRE" \
      org.opencontainers.image.revision=$APP_REVISION

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health >/dev/null || exit 1
CMD ["node", "server.js"]
