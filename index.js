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
    origin: ["https://vibe-quake3.vercel.app", "http://localhost:5173"],
    methods: ['GET', 'POST'],
    credentials: true
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

// Helper function to get a random spawn point
function getRandomSpawnPoint() {
  const randomIndex = Math.floor(Math.random() * SPAWN_POINTS.length);
  return SPAWN_POINTS[randomIndex];
}

// ... [copy the rest of your server code here] ...

// Determine port
const PORT = process.env.PORT || 3000;

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('\n==== NEW PLAYER CONNECTION ====');
  console.log('Player connected with ID:', socket.id);
  console.log('Current player count:', Object.keys(players).length);
  console.log('Current players:', Object.keys(players));
  
  // Generate random spawn position
  const spawnPoint = getRandomSpawnPoint();
  const randomRotation = Math.random() * Math.PI * 2;
  
  // Create a new player object
  players[socket.id] = {
    id: socket.id,
    position: spawnPoint,
    rotation: randomRotation,
    health: 100,
    armor: 0 // Initialize armor explicitly to 0
  };
  
  console.log('Player added to server with position:', spawnPoint);
  console.log('New player count:', Object.keys(players).length);
  
  // Send the current players to the new player
  console.log('Sending currentPlayers event to new player with', Object.keys(players).length, 'players');
  socket.emit('currentPlayers', players);
  
  // Broadcast the new player to all other players
  console.log('Broadcasting newPlayer event to other players');
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Initialize client with their own health and armor explicitly
  const initialHealthUpdate = {
    id: socket.id,
    health: players[socket.id].health,
    // Ensure armor is never undefined by defaulting to 0
    armor: players[socket.id].armor !== undefined ? players[socket.id].armor : 0
  };
  console.log(`SENDING INITIAL HEALTH UPDATE: ${JSON.stringify(initialHealthUpdate)}`);
  socket.emit('healthUpdate', initialHealthUpdate);
  
  // Add disconnect handler at the top level
  socket.on('disconnect', () => {
    console.log('\n==== PLAYER DISCONNECTION ====');
    console.log('Player disconnected:', socket.id);
    
    if (players[socket.id]) {
      // Delete the player from our players object
      delete players[socket.id];
      console.log('Player removed from server');
      console.log('Remaining player count:', Object.keys(players).length);
      console.log('Remaining players:', Object.keys(players));
      
      // Emit a message to all players to remove this player
      console.log('Broadcasting playerDisconnected event');
      io.emit('playerDisconnected', socket.id);
    } else {
      console.log('WARNING: Player not found in players object');
    }
  });
});
