# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code to the container
COPY . .

# expose a port for the server
EXPOSE 3000

# Define the command to run the server
CMD ["node", "server.js"] 
