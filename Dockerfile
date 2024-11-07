# Use the Google Cloud SDK image which includes Node.js
FROM gcr.io/google.com/cloudsdktool/cloud-sdk:slim

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN apt-get update && apt-get install -y npm && npm install

# Copy only the necessary files and folders
COPY main.js .
COPY cloner.js .
COPY deployment.js .
COPY .env .
COPY google_creds.json .
COPY Twilio_Number_Routing ./Twilio_Number_Routing
COPY public ./public
COPY Source ./Source
COPY models ./models
COPY middleware ./middleware
COPY routes ./routes

# Create the hotel_data directory
RUN mkdir -p hotel_data && chmod 777 hotel_data

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]
