FROM node:22-alpine AS build

WORKDIR /app
COPY app/package*.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./

ARG NEXT_PUBLIC_CHAIN_ID=97
ARG NEXT_PUBLIC_AUCTION_HOUSE
ARG NEXT_PUBLIC_TEST_TOKEN
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_WC_PROJECT_ID=""
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_AUCTION_HOUSE=$NEXT_PUBLIC_AUCTION_HOUSE \
    NEXT_PUBLIC_TEST_TOKEN=$NEXT_PUBLIC_TEST_TOKEN \
    NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_WC_PROJECT_ID=$NEXT_PUBLIC_WC_PROJECT_ID
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]
