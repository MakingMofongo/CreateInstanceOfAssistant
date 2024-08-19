FROM node:16

# Install the Google Cloud SDK
RUN apt-get update && apt-get install -y curl apt-transport-https ca-certificates gnupg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add - \
    && apt-get update && apt-get install -y google-cloud-sdk

# Copy the application code
COPY . /app
WORKDIR /app

# Install dependencies
RUN npm install

# Run the application
CMD ["node", "main.js"]
