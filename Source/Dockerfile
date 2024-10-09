# Use the official Node.js image with a specific version (LTS recommended).
FROM node:18-alpine

# Set the working directory inside the container.
WORKDIR /app

# Set the environment variable for the host
ENV HOST 0.0.0.0

# Copy package.json and package-lock.json to the working directory.
COPY package*.json ./

# Install the dependencies.
RUN npm install

# Copy the rest of the application code to the working directory.
COPY . .

# Expose the port that your application will run on.
EXPOSE 8080

# Command to run the app and keep the container running
CMD npm start || tail -f /dev/null