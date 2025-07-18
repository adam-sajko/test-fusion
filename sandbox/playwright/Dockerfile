FROM mcr.microsoft.com/playwright:v1.55.0-noble as base

RUN corepack enable

WORKDIR /app

COPY package.json .yarnrc.yml yarn.lock ./
COPY .yarn .yarn
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/integrations/playwright-coverage/package.json packages/integrations/playwright-coverage/
COPY packages/integrations/playwright-snapshots/package.json packages/integrations/playwright-snapshots/
COPY packages/core/package.json packages/core/
COPY sandbox/ui/package.json sandbox/ui/
COPY sandbox/vite-app/package.json sandbox/vite-app/
COPY sandbox/webpack-app/package.json sandbox/webpack-app/
COPY sandbox/playwright/package.json sandbox/playwright/

RUN yarn install --immutable

COPY . .
