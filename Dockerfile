# Build stage: Use Node Alpine for the smallest base image
FROM node:22-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Runtime stage: Use a smaller image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Create a non-root user and switch to it for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy dependencies from build stage
COPY --from=build /app/node_modules ./node_modules

# Copy application code
COPY . .

# Change ownership of all files to the non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7000

# Expose the port the app runs on
EXPOSE 7000

# Command to run the application
CMD ["node", "src/server.js"]