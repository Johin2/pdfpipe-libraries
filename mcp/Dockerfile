# Dockerfile for the PDFPipe MCP server (stdio).
# Used by Glama to build, start, and introspect the server.
FROM node:20-alpine

WORKDIR /app

# Install dependencies against the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# Build the TypeScript stdio server.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# The server speaks MCP over stdio. PDFPIPE_API_KEY is provided at runtime;
# the server still starts and responds to introspection without it.
ENTRYPOINT ["node", "dist/index.js"]
