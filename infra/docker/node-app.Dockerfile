FROM node:22-alpine AS app

WORKDIR /workspace

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services

RUN pnpm install --frozen-lockfile

ARG APP_FILTER
ENV APP_FILTER=${APP_FILTER}

CMD ["sh", "-c", "pnpm --filter \"$APP_FILTER\" run dev"]
