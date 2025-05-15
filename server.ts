import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from current directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Type definitions for room structure
interface Room {
    broadcasterId: string;
    watchers: string[];
    isPublic: boolean;
}

// Rooms dictionary to hold room data
const rooms: Record<string, Room> = {};

// Keep track of where each users are for faster removal
const userRoom: Record<string, string> = {};

// Socket.IO connection logic
io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Broadcaster starts a broadcast
    socket.on('broadcaster', (isPublic: boolean = true) => {
        // Create a new room with broadcaster's id and public/private flag
        const code = generateUniqueCode();
        rooms[code] = {
            broadcasterId: socket.id,
            watchers: [],
            isPublic: isPublic,
        };
        userRoom[socket.id] = code;
        socket.join(code);
        console.log(`Broadcaster started with code: ${code}`);

        // Send the room code to the broadcaster
        socket.emit('roomCreated', code);
    });

    // Watcher joins a stream
    socket.on('watcher', (code: string) => {
        const room = rooms[code];

        // Check if the room exists
        if (room) {
            socket.join(code);
            room.watchers.push(socket.id);
            userRoom[socket.id] = code;
            io.to(socket.id).emit("roomJoined", code);
            io.to(code).emit('newWatcher', socket.id, room.watchers.length); // Notify broadcaster
            console.log(`Watcher ${socket.id} joined the room with code: ${code}`);
        }
        else {
            console.log(`Watcher ${socket.id} failed to join. Room code: ${code} does not exist or is private.`);
            socket.emit('error', 'Invalid Code');
        }
    });

    socket.on('joinRandom', () => {
        const publicRooms = Object.entries(rooms).filter(([_, room]) => room.isPublic);

        if (publicRooms.length === 0) {
            console.log(`Watcher ${socket.id} failed to join. No public room exists.`);
            socket.emit('error', 'No public room available');
            return;
        }

        const [code, room] = publicRooms[Math.floor(Math.random() * publicRooms.length)];

        socket.join(code);
        room.watchers.push(socket.id);
        userRoom[socket.id] = code;

        io.to(socket.id).emit("roomJoined", code);
        io.to(code).emit('newWatcher', socket.id, room.watchers.length); 

        console.log(`Watcher ${socket.id} joined the public room with code: ${code}`);
    });

    // Relay ICE candidates and SDP between peers
    socket.on('offer', (id: string, message: RTCSessionDescriptionInit) => {
        io.to(id).emit('offer', socket.id, message);
    });

    socket.on('answer', (id: string, message: RTCSessionDescriptionInit) => {
        io.to(id).emit('answer', socket.id, message);
    });

    socket.on('candidate', (id: string, candidate: RTCIceCandidateInit) => {
        io.to(id).emit('candidate', socket.id, candidate);
    });

    // Disconnect logic
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);



        const code = userRoom[socket.id];
        // Return incase user in invalid room
        if (!code) return;

        const room = rooms[code];
        if (!room) return;

        // Remove the socket from the room it was in
        if (room.broadcasterId === socket.id) {
            // Broadcaster disconnected, clean up room
            delete rooms[code];
            console.log(`Room with code ${code} cleaned up due to broadcaster disconnect.`);
            io.to(code).emit('error', 'Sharing Stopped!');
        }
        else {
            // Remove watcher from room's watcher list
            room.watchers = room.watchers.filter(id => id !== socket.id);
            io.to(code).emit('disconnectWatcher', socket.id, room.watchers.length); // Let broadcaster know
            console.log(`Watcher ${socket.id} disconnected from room ${code}`);
        }

        delete userRoom[socket.id];
    });
});


// Generate a unique 6-character alphanumeric code
function generateUniqueCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    while (true) {
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (!rooms[code]) return code;
    }
}


// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});