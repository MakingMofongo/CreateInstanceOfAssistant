# Use the official Node.js image with a specific version (LTS recommended).
FROM node:18-alpine

# Set the working directory inside the container.
WORKDIR /app

# Copy package.json and package-lock.json to the working directory.
COPY package*.json ./

# Install the dependencies.
RUN npm install

# Copy application code
COPY Source /app/Source

# Copy public directory
COPY Source/public /app/Source/public

# Expose the port that your application will run on.
EXPOSE 3000

# Command to run the app.
CMD ["node", "receptionist.js"]
