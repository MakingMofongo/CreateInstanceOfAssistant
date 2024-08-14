# Use the official Node.js image with a specific version (LTS recommended).
FROM node:18-alpine

# Set the working directory inside the container.
WORKDIR /app

# Copy package.json and package-lock.json to the working directory.
COPY package*.json ./

# Install the dependencies.
RUN npm install

# Copy the rest of the application code to the working directory.
COPY . .

# Expose the port that your application will run on.
EXPOSE 3000

# Command to run the app.
CMD ["node", "main.js"]
