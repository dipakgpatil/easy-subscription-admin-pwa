FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=https://easy-subscription-python-api-production.up.railway.app/api/v1
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_ALLOW_MOCK_GOOGLE=false
ARG VITE_APP_VERSION=unknown
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_ALLOW_MOCK_GOOGLE=${VITE_ALLOW_MOCK_GOOGLE}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

RUN npm run build

FROM caddy:2.10-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 8080
