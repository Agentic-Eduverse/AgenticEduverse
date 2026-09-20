# syntax=docker/dockerfile:1

# ===== 多阶段构建：Stage 1 - Builder =====
FROM node:20-alpine AS builder

WORKDIR /app

# 启用 corepack 以支持 pnpm 9
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 复制 workspace 配置和锁文件
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml tsconfig.base.json ./

# 复制 packages 源码
COPY packages ./packages

# 复制 apps/server 源码
COPY apps/server ./apps/server

# 安装依赖（仅 server 及其依赖的 packages）
RUN pnpm install --frozen-lockfile --filter server...

# 生成 Prisma Client
RUN pnpm --filter @eduverse/db generate

# 构建 server
RUN pnpm build:server

# ===== 多阶段构建：Stage 2 - Production Runner =====
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 启用 corepack
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 复制 workspace 配置
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml tsconfig.base.json ./

# 复制 packages（需要 @eduverse/db 的 prisma client 生成产物）
COPY packages ./packages

# 复制 apps/server package.json
COPY apps/server/package.json ./apps/server/package.json

# 仅安装生产依赖
RUN pnpm install --frozen-lockfile --filter server... --prod

# 从 builder 复制构建产物
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/db ./packages/db

EXPOSE 4000

CMD ["node", "apps/server/dist/index.js"]
