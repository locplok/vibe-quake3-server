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
    armor: 0, // Initialize armor explicitly to 0
    frags: 0  // Initialize frag count
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
  
  // Handle player movement - THIS IS THE MISSING HANDLER!
  socket.on('playerMovement', (movementData) => {
    // Validate data first
    if (!movementData || !movementData.position || 
        typeof movementData.position.x !== 'number' || 
        typeof movementData.position.y !== 'number' || 
        typeof movementData.position.z !== 'number') {
      console.error(`Invalid movement data received from player ${socket.id}:`, movementData);
      return;
    }
    
    // Debug counter for position updates per player
    if (!socket._posUpdateCount) socket._posUpdateCount = 0;
    socket._posUpdateCount++;
    
    // Log movement periodically
    if (socket._posUpdateCount % 500 === 0) {
      console.log(`SERVER: Player ${socket.id} has sent ${socket._posUpdateCount} position updates`);
      console.log(`Current position: (${movementData.position.x.toFixed(2)}, ${movementData.position.y.toFixed(2)}, ${movementData.position.z.toFixed(2)})`);
      console.log(`Current player count: ${Object.keys(players).length}`);
    }
    
    // Update the player's data
    if (players[socket.id]) {
      // Update position and rotation
      players[socket.id].position = movementData.position;
      players[socket.id].rotation = movementData.rotation;
      
      // Create the data to broadcast
      const playerData = {
        id: socket.id,
        position: players[socket.id].position,
        rotation: players[socket.id].rotation
      };
      
      // Broadcast the update to all other players
      socket.broadcast.emit('playerMoved', playerData);
    } else {
      console.error(`Received movement data for non-existent player: ${socket.id}`);
    }
  });
  
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

  // Handle player hits
  socket.on('playerHit', (hitData) => {
    const targetId = hitData.id;
    const damage = Math.round(hitData.damage); // Round damage to integer
    
    console.log(`\n=== RECEIVED PLAYER HIT EVENT ===`);
    console.log(`Shooter: ${socket.id}`);
    console.log(`Target: ${targetId}`);
    console.log(`Damage: ${damage}`);
    console.log(`Target exists: ${!!players[targetId]}`);
    console.log(`All Players: ${Object.keys(players)}`);
    
    // Verify target exists
    if (players[targetId]) {
      // Initialize armor if it doesn't exist (shouldn't happen with explicit init)
      if (players[targetId].armor === undefined) {
        players[targetId].armor = 0;
        console.log(`WARNING: Player ${targetId} had undefined armor, initializing to 0`);
      }
      
      console.log(`\n=== SERVER DAMAGE CALCULATION ===`);
      console.log(`Player ${targetId} taking ${damage} damage with ${players[targetId].armor} armor`);
      console.log(`Before - Health: ${players[targetId].health}, Armor: ${players[targetId].armor}`);
      
      // SIMPLIFIED DAMAGE CALCULATION FOR DEBUGGING
      // Apply direct damage to health for testing
      const oldHealth = players[targetId].health;
      players[targetId].health = Math.max(0, players[targetId].health - damage);
      console.log(`After - Health: ${players[targetId].health}, Armor: ${players[targetId].armor}`);
      
      // Send health update to all players
      const healthUpdateObj = {
        id: targetId,
        health: players[targetId].health,
        armor: players[targetId].armor
      };
      
      console.log(`BROADCASTING HEALTH UPDATE TO ALL PLAYERS: ${JSON.stringify(healthUpdateObj)}`);
      io.emit('healthUpdate', healthUpdateObj);
      
      // Check if player died
      if (players[targetId].health <= 0) {
        // Increment killer's frag count
        console.log(`Player ${socket.id} fragged player ${targetId}`);
        players[socket.id].frags += 1;
        
        // Broadcast updated frag count to all players
        io.emit('fragUpdate', {
          id: socket.id,
          frags: players[socket.id].frags
        });
        
        // Reset health and respawn
        players[targetId].health = 100;
        players[targetId].armor = 0; // Reset armor on death
        
        // Get new random spawn position
        const newSpawnPoint = getRandomSpawnPoint();
        players[targetId].position = newSpawnPoint;
        
        // Notify all players of respawn
        io.emit('playerRespawned', {
          id: targetId,
          position: newSpawnPoint
        });
        
        // CRITICAL FIX: Send explicit health update after respawn to update HUD
        io.emit('healthUpdate', {
          id: targetId,
          health: players[targetId].health,
          armor: players[targetId].armor
        });
        
        console.log(`Player ${targetId} respawned with health=${players[targetId].health}`);
      }
    } else {
      console.log(`ERROR: Hit on non-existent player ${targetId}`);
    }
  });
});
