FROM oven/bun:latest

WORKDIR /app

# Copy configuration files and database schema
COPY package.json bun.lock tsconfig.json schema.graphql prisma.config.ts ./
COPY prisma ./prisma/

# Copy codebase
COPY src ./src/
COPY index.ts ./

# Install dependencies and generate Prisma client
RUN bun install --frozen-lockfile
RUN bunx prisma generate

# Expose port used by GraphQL Yoga
EXPOSE 4000

# Start server
CMD ["bun", "run", "dev"]
