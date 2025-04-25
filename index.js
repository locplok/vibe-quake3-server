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

// Replace with improved respawn point generation system
// Constants for map and respawn configuration
const MAP_SIZE = 180; // Total map size (-90 to +90 on both x and z axes)
const MIN_RESPAWN_DISTANCE_FROM_KILLER = 50; // Minimum distance from the killer
const RESPAWN_Y_POSITION = 1; // Standard Y position for respawns
const RESPAWN_ATTEMPT_LIMIT = 20; // Maximum attempts to find a valid spawn point
const MOUNTAIN_REGIONS = [
  // Define mountain regions to avoid [x1, z1, x2, z2, y]
  // Southeast (Orange mountain)
  [60, 60, 90, 90, 10],
  // Northeast (Brown mountain)
  [-90, 60, -60, 90, 10],
  // Northwest (Blue-grey mountain)
  [-90, -90, -60, -60, 10],
  // Southwest (Light green mountain)
  [60, -90, 90, -60, 10],
  // North (Purple mountain)
  [-20, -90, 20, -70, 10],
  // South (Indigo mountain)
  [-20, 70, 20, 90, 10]
];

// Helper function to calculate distance between two points
function distanceBetween(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Check if position is inside any mountain region
function isInsideMountain(position) {
  for (const region of MOUNTAIN_REGIONS) {
    const [x1, z1, x2, z2, y] = region;
    if (position.x >= x1 && position.x <= x2 && 
        position.z >= z1 && position.z <= z2) {
      return true;
    }
  }
  return false;
}

// Check if position is too close to any player
function isTooCloseToPlayers(position, playersToCheck, minDistance = 5) {
  for (const playerId in playersToCheck) {
    const player = playersToCheck[playerId];
    // Skip players who are waiting to respawn
    if (player.waitingToRespawn || player.isDead) continue;
    
    const distance = distanceBetween(position, player.position);
    if (distance < minDistance) {
      return true;
    }
  }
  return false;
}

// Get a valid random spawn point away from the killer
function getValidSpawnPoint(killerId = null) {
  // Start with random positions and validate
  for (let attempts = 0; attempts < RESPAWN_ATTEMPT_LIMIT; attempts++) {
    // Generate random coordinates within map bounds
    const position = {
      x: (Math.random() * MAP_SIZE) - (MAP_SIZE / 2), // -90 to 90
      y: RESPAWN_Y_POSITION,
      z: (Math.random() * MAP_SIZE) - (MAP_SIZE / 2)  // -90 to 90
    };
    
    // Check if this position is valid
    const isValid = !isInsideMountain(position) && 
                    !isTooCloseToPlayers(position, players, 10);
    
    // If killer ID is provided, ensure minimum distance from killer
    if (killerId && players[killerId] && !players[killerId].waitingToRespawn) {
      const distanceFromKiller = distanceBetween(position, players[killerId].position);
      if (distanceFromKiller < MIN_RESPAWN_DISTANCE_FROM_KILLER) {
        continue; // Too close to killer, try another position
      }
    }
    
    if (isValid) {
      return position;
    }
  }
  
  // Fallback position if we couldn't find a valid one after max attempts
  console.log("Warning: Couldn't find valid spawn point, using fallback position");
  return { x: 0, y: RESPAWN_Y_POSITION, z: 0 };
}

// Function to generate a random name if player doesn't provide one
function generateRandomName() {
  const adjectives = ['Swift', 'Brave', 'Mighty', 'Silent', 'Fierce', 'Golden', 'Shadow', 'Iron', 'Mystic'];
  const nouns = ['Wolf', 'Tiger', 'Eagle', 'Dragon', 'Knight', 'Ninja', 'Warrior', 'Hunter', 'Ranger'];
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${randomAdjective}${randomNoun}${Math.floor(Math.random() * 100)}`;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('\n==== NEW PLAYER CONNECTION ====');
  console.log('Player connected with ID:', socket.id);
  console.log('Current player count:', Object.keys(players).length);
  console.log('Current players:', Object.keys(players));
  
  // Generate random spawn position
  const spawnPoint = getValidSpawnPoint();
  const randomRotation = Math.random() * Math.PI * 2;
  
  // Create a new player object with a default temporary name
  players[socket.id] = {
    id: socket.id,
    name: generateRandomName(), // Default name until the client sends a proper one
    position: spawnPoint,
    rotation: randomRotation,
    health: 100,
    armor: 0, // Initialize armor explicitly to 0
    frags: 0,  // Initialize frag count
    lastSpawnTime: Date.now(), // Track when the player spawned
    longestSurvivalTime: 0, // Track the player's longest survival time
    waitingToRespawn: false, // Flag to track if player is waiting to respawn
    isDead: false // Flag to track if player is dead (for visibility)
  };
  
  console.log('Player added to server with position:', spawnPoint);
  console.log('New player count:', Object.keys(players).length);
  
  // Wait for player name before sending player data
  socket.on('playerName', (name) => {
    // Validate name: 3-15 characters, alphanumeric
    const sanitizedName = name.substring(0, 15).replace(/[^a-zA-Z0-9 ]/g, '');
    const finalName = sanitizedName || generateRandomName();
    
    console.log(`Player ${socket.id} set name to "${finalName}"`);
    
    // Update the player's name
    if (players[socket.id]) {
      players[socket.id].name = finalName;
      
      // Send the current players to the new player (now with name)
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
    }
  });
  
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
        name: players[socket.id].name, // Include name in movement updates
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
      // Log player name who disconnected
      console.log(`Player "${players[socket.id].name}" (${socket.id}) has disconnected`);
      
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
    console.log(`Shooter: ${socket.id} (${players[socket.id]?.name || 'unknown'})`);
    console.log(`Target: ${targetId} (${players[targetId]?.name || 'unknown'})`);
    console.log(`Damage: ${damage}`);
    console.log(`Target exists: ${!!players[targetId]}`);
    console.log(`All Players: ${Object.keys(players)}`);
    
    // Verify target exists and is not dead or waiting to respawn
    if (players[targetId] && !players[targetId].waitingToRespawn && !players[targetId].isDead) {
      // Initialize armor if it doesn't exist (shouldn't happen with explicit init)
      if (players[targetId].armor === undefined) {
        players[targetId].armor = 0;
        console.log(`WARNING: Player ${targetId} had undefined armor, initializing to 0`);
      }
      
      console.log(`\n=== SERVER DAMAGE CALCULATION ===`);
      console.log(`Player ${targetId} (${players[targetId].name}) taking ${damage} damage with ${players[targetId].armor} armor`);
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
        // Calculate survival time since last spawn
        const survivalTime = Date.now() - players[targetId].lastSpawnTime;
        
        // Update longest survival time if this was longer
        if (survivalTime > players[targetId].longestSurvivalTime) {
          const oldBest = players[targetId].longestSurvivalTime;
          players[targetId].longestSurvivalTime = survivalTime;
          console.log(`Player ${players[targetId].name} set a new personal best survival time: ${survivalTime}ms (previous: ${oldBest}ms)`);
          
          // Broadcast updated survival time to all players
          io.emit('survivalTimeUpdate', {
            id: targetId,
            survivalTime: survivalTime,
            longestSurvivalTime: players[targetId].longestSurvivalTime,
            isNewRecord: true
          });
        } else {
          // Just broadcast the current survival time
          io.emit('survivalTimeUpdate', {
            id: targetId,
            survivalTime: survivalTime,
            longestSurvivalTime: players[targetId].longestSurvivalTime,
            isNewRecord: false
          });
        }
        
        // Increment killer's frag count
        console.log(`Player ${players[socket.id].name} fragged player ${players[targetId].name}`);
        players[socket.id].frags += 1;
        
        // Broadcast updated frag count to all players
        io.emit('fragUpdate', {
          id: socket.id,
          frags: players[socket.id].frags
        });
        
        // Mark the player as waiting to respawn AND as dead (visible state)
        players[targetId].waitingToRespawn = true;
        players[targetId].isDead = true;
        players[targetId].health = 0; // Ensure health is zero
        
        // Notify all players that this player is dead and waiting to respawn
        io.emit('playerDied', {
          id: targetId,
          killerId: socket.id,
          survivalTime: survivalTime
        });
        
        console.log(`Player ${players[targetId].name} is now waiting to respawn`);
      }
    } else {
      // Player was already dead or doesn't exist
      if (players[targetId] && (players[targetId].waitingToRespawn || players[targetId].isDead)) {
        console.log(`Ignoring hit on dead player ${targetId}`);
      } else {
        console.log(`ERROR: Hit on non-existent player ${targetId}`);
      }
    }
  });

  // Add respawn request handler
  socket.on('playerRequestRespawn', () => {
    // Check if the player is actually waiting to respawn
    if (players[socket.id] && players[socket.id].waitingToRespawn) {
      console.log(`Player ${players[socket.id].name} requested to respawn`);
      
      // Get a valid spawn point away from the killer
      // Note: We store the killerId in a property on the player object
      const newSpawnPoint = getValidSpawnPoint(players[socket.id].lastKillerId);
      
      // Reset health and armor
      players[socket.id].health = 100;
      players[socket.id].armor = 0;
      
      // Reset waiting and dead flags
      players[socket.id].waitingToRespawn = false;
      players[socket.id].isDead = false;
      
      // Update spawn time for new survival time tracking
      players[socket.id].lastSpawnTime = Date.now();
      
      // Update position to the new spawn point
      players[socket.id].position = newSpawnPoint;
      
      // Notify all players of respawn
      io.emit('playerRespawned', {
        id: socket.id,
        position: newSpawnPoint
      });
      
      // Send explicit health update after respawn to update HUD
      io.emit('healthUpdate', {
        id: socket.id,
        health: players[socket.id].health,
        armor: players[socket.id].armor
      });
      
      console.log(`Player ${players[socket.id].name} respawned at position:`, newSpawnPoint);
    } else {
      console.log(`Player ${socket.id} requested to respawn but isn't waiting to respawn`);
    }
  });
});

// Debug middleware to handle armor value setting
app.post('/debug/set-armor', (req, res) => {
  const { playerId, armorValue } = req.body;
  
  if (players[playerId]) {
    players[playerId].armor = Math.max(0, parseInt(armorValue) || 0);
    console.log(`Set player ${playerId} armor to ${players[playerId].armor}`);
    
    // Send health/armor update to all players
    io.emit('healthUpdate', {
      id: playerId,
      health: players[playerId].health,
      armor: players[playerId].armor
    });
    
    res.json({ success: true, message: 'Armor updated' });
  } else {
    res.status(404).json({ success: false, message: 'Player not found' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
