FROM node:22-alpine AS app

WORKDIR /workspace

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
RUN apk add --no-cache ffmpeg

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services

RUN pnpm install --frozen-lockfile

ARG APP_FILTER
ENV APP_FILTER=${APP_FILTER}

ARG APP_RUN_SCRIPT=dev
ENV APP_RUN_SCRIPT=${APP_RUN_SCRIPT}

ARG NEXT_PUBLIC_API_GATEWAY_URL
ARG NEXT_PUBLIC_ADMIN_GATEWAY_URL
ARG NEXT_PUBLIC_AUTH_SERVICE_URL
ARG NEXT_PUBLIC_ADMIN_ORIGIN
ARG NEXT_PUBLIC_STOREFRONT_URL
ARG AUTH_SERVICE_URL
ARG MEDIA_SERVICE_URL

RUN if [ "$APP_RUN_SCRIPT" = "start" ]; then pnpm --filter "$APP_FILTER" run build; fi

CMD ["sh", "-c", "pnpm --filter \"$APP_FILTER\" run \"$APP_RUN_SCRIPT\""]
