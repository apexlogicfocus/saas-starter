# Simple single-stage image: installs deps, builds, and on start runs the schema
# migration (which also creates the non-superuser app_user role) then boots Next.
FROM node:22-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# migrate is idempotent, so it is safe to run on every boot.
CMD ["sh", "-c", "npm run migrate && npm start"]
