FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY tsconfig.json ./
COPY agent.ts ./

CMD ["pnpm", "exec", "tsx", "agent.ts"]
