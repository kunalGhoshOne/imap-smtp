# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app
COPY . .

# Expose all relevant ports (can be overridden by host networking)
EXPOSE 25 465 587 24 1024 143 993 2525 3000 8080

# Default command
CMD ["npm", "start"] 