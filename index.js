const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Set up Socket.IO with CORS that accepts connections from your frontend
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Store connected players
const players = {};

// Define spawn points around the map
const SPAWN_POINTS = [
  { x: 0, y: 1, z: 0 },
  { x: 5, y: 1, z: 5 },
  { x: -5, y: 1, z: 5 },
  { x: 5, y: 1, z: -5 },
  { x: -5, y: 1, z: -5 },
  { x: 8, y: 1, z: 0 },
  { x: -8, y: 1, z: 0 },
  { x: 0, y: 1, z: 8 },
  { x: 0, y: 1, z: -8 }
];

// ... [copy the rest of your server code here] ...

// Determine port
const PORT = process.env.PORT || 3000;

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
