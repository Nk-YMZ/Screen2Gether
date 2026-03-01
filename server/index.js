const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Store rooms and their participants
const rooms = new Map();

// WebSocket signaling server
wss.on('connection', (ws) => {
    ws.id = uuidv4();
    console.log(`Client connected: ${ws.id}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${ws.id}`);
        handleDisconnect(ws);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${ws.id}:`, error);
    });
});

function handleMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
        case 'create-room':
            handleCreateRoom(ws);
            break;

        case 'join-room':
            handleJoinRoom(ws, payload.roomId);
            break;

        case 'offer':
            handleOffer(ws, payload);
            break;

        case 'answer':
            handleAnswer(ws, payload);
            break;

        case 'ice-candidate':
            handleIceCandidate(ws, payload);
            break;

        case 'leave-room':
            handleLeaveRoom(ws);
            break;

        default:
            console.log(`Unknown message type: ${type}`);
    }
}

function handleCreateRoom(ws) {
    const roomId = generateRoomId();
    ws.roomId = roomId;
    ws.role = 'host';
    
    rooms.set(roomId, {
        host: ws,
        viewers: new Set()
    });

    ws.send(JSON.stringify({
        type: 'room-created',
        payload: { roomId }
    }));

    console.log(`Room created: ${roomId}`);
}

function handleJoinRoom(ws, roomId) {
    const room = rooms.get(roomId);
    
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Room not found' }
        }));
        return;
    }

    if (ws.roomId === roomId) {
        // Already in this room
        return;
    }

    ws.roomId = roomId;
    ws.role = 'viewer';
    room.viewers.add(ws);

    ws.send(JSON.stringify({
        type: 'room-joined',
        payload: { roomId }
    }));

    // Notify host about new viewer
    room.host.send(JSON.stringify({
        type: 'viewer-joined',
        payload: { viewerId: ws.id }
    }));

    console.log(`Viewer ${ws.id} joined room ${roomId}`);
}

function handleOffer(ws, payload) {
    const { targetId, offer } = payload;
    const room = rooms.get(ws.roomId);
    
    if (!room) return;

    if (ws.role === 'host') {
        // Host sending offer to viewer
        const viewer = findViewer(room, targetId);
        if (viewer) {
            viewer.send(JSON.stringify({
                type: 'offer',
                payload: {
                    offer,
                    hostId: ws.id
                }
            }));
        }
    } else {
        // Viewer sending offer to host (shouldn't happen in our flow)
        room.host.send(JSON.stringify({
            type: 'offer',
            payload: {
                offer,
                viewerId: ws.id
            }
        }));
    }
}

function handleAnswer(ws, payload) {
    const { targetId, answer } = payload;
    const room = rooms.get(ws.roomId);
    
    if (!room) return;

    if (ws.role === 'viewer') {
        // Viewer sending answer to host
        room.host.send(JSON.stringify({
            type: 'answer',
            payload: {
                answer,
                viewerId: ws.id
            }
        }));
    } else {
        // Host sending answer to viewer
        const viewer = findViewer(room, targetId);
        if (viewer) {
            viewer.send(JSON.stringify({
                type: 'answer',
                payload: {
                    answer,
                    hostId: ws.id
                }
            }));
        }
    }
}

function handleIceCandidate(ws, payload) {
    const { targetId, candidate } = payload;
    const room = rooms.get(ws.roomId);
    
    if (!room) return;

    if (ws.role === 'host') {
        // Host sending ICE candidate to viewer
        const viewer = findViewer(room, targetId);
        if (viewer) {
            viewer.send(JSON.stringify({
                type: 'ice-candidate',
                payload: {
                    candidate,
                    hostId: ws.id
                }
            }));
        }
    } else {
        // Viewer sending ICE candidate to host
        room.host.send(JSON.stringify({
            type: 'ice-candidate',
            payload: {
                candidate,
                viewerId: ws.id
            }
        }));
    }
}

function handleLeaveRoom(ws) {
    handleDisconnect(ws);
}

function handleDisconnect(ws) {
    const room = rooms.get(ws.roomId);
    
    if (!room) return;

    if (ws.role === 'host') {
        // Notify all viewers that host disconnected
        room.viewers.forEach(viewer => {
            viewer.send(JSON.stringify({
                type: 'host-disconnected',
                payload: {}
            }));
        });
        rooms.delete(ws.roomId);
        console.log(`Room ${ws.roomId} deleted (host disconnected)`);
    } else {
        // Notify host that viewer disconnected
        room.viewers.delete(ws);
        room.host.send(JSON.stringify({
            type: 'viewer-disconnected',
            payload: { viewerId: ws.id }
        }));
        console.log(`Viewer ${ws.id} left room ${ws.roomId}`);
        
        // Delete room if no viewers left (optional)
        // if (room.viewers.size === 0) {
        //     rooms.delete(ws.roomId);
        // }
    }
}

function findViewer(room, viewerId) {
    for (const viewer of room.viewers) {
        if (viewer.id === viewerId) {
            return viewer;
        }
    }
    return null;
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Screen2Gether server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});