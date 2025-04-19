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

// Determine port
const PORT = process.env.PORT || 3000;

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Initialize player data with default values
  players[socket.id] = {
    id: socket.id,
    position: getRandomSpawnPoint(),
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    armor: 0,
    frags: 0
  };
  
  // Send the current players to the new player
  socket.emit('currentPlayers', players);
  
  // Notify other players about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    // Update player position and rotation
    if (players[socket.id]) {
      players[socket.id].position = movementData.position;
      players[socket.id].rotation = movementData.rotation;
      
      // Broadcast updated position to all other players
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });
  
  // Handle player shots
  socket.on('shotFired', (shotData) => {
    // Add the player ID to the shot data
    shotData.id = socket.id;
    
    // Broadcast the shot to all other players
    socket.broadcast.emit('shotFired', shotData);
  });
  
  // Handle player hits
  socket.on('playerHit', (hitData) => {
    const targetId = hitData.targetId;
    const damage = hitData.damage;
    
    // Validate the target player exists
    if (!players[targetId]) return;
    
    // Calculate damage reduction from armor
    let armorDamage = 0;
    let healthDamage = damage;
    
    if (players[targetId].armor > 0) {
      // Armor absorbs 75% of damage up to its value
      armorDamage = Math.min(players[targetId].armor, damage * 0.75);
      healthDamage = damage - armorDamage;
      players[targetId].armor = Math.max(0, players[targetId].armor - armorDamage);
    }
    
    // Apply remaining damage to health
    players[targetId].health -= healthDamage;
    
    // Check if player died
    if (players[targetId].health <= 0) {
      // Award a frag to the shooter
      players[socket.id].frags++;
      
      // Send frag update to all players
      io.emit('fragUpdate', {
        id: socket.id,
        frags: players[socket.id].frags
      });
      
      // Reset the dead player's health and armor
      players[targetId].health = 100;
      players[targetId].armor = 0;
      
      // Assign new spawn position
      players[targetId].position = getRandomSpawnPoint();
      
      // Notify all players about the respawn
      io.emit('playerRespawned', {
        id: targetId,
        position: players[targetId].position
      });
    }
    
    // Send health update to all players
    io.emit('healthUpdate', {
      id: targetId,
      health: players[targetId].health,
      armor: players[targetId].armor
    });
  });
  
  // Handle armor pickup
  socket.on('armorPickup', (armorValue) => {
    if (players[socket.id]) {
      players[socket.id].armor = armorValue;
      
      // Broadcast updated armor to all players
      io.emit('healthUpdate', {
        id: socket.id,
        health: players[socket.id].health,
        armor: players[socket.id].armor
      });
    }
  });
  
  // Handle health update request
  socket.on('requestHealthUpdate', () => {
    if (players[socket.id]) {
      socket.emit('healthUpdate', {
        id: socket.id,
        health: players[socket.id].health,
        armor: players[socket.id].armor
      });
    }
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove the player
    delete players[socket.id];
    
    // Notify other players
    io.emit('playerDisconnected', socket.id);
  });
});
