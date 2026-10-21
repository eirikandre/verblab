# --- Bygg: minifiserer kilden til dist/ med esbuild ---
FROM node:22-alpine AS build
WORKDIR /app

# Avhengigheter først, så laget caches så lenge package*.json er uendret
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY css ./css
COPY js ./js
COPY public ./public
COPY tools ./tools
RUN npm run build

# --- Kjøring: statisk side servert av nginx ---
FROM nginx:1.27-alpine

# Egen serverkonfigurasjon (caching, gzip)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Den bygde appen
COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://localhost/ || exit 1
