"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server);
const PORT = process.env.PORT || 3000;
// Serve static files from current directory
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
// Rooms dictionary to hold room data
const rooms = {};
// Keep track of where each users are for faster removal
const userRoom = {};
// Socket.IO connection logic
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    // Broadcaster starts a broadcast
    socket.on('broadcaster', (isPublic = true) => {
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
    socket.on('watcher', (code) => {
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
    socket.on('offer', (id, message) => {
        io.to(id).emit('offer', socket.id, message);
    });
    socket.on('answer', (id, message) => {
        io.to(id).emit('answer', socket.id, message);
    });
    socket.on('candidate', (id, candidate) => {
        io.to(id).emit('candidate', socket.id, candidate);
    });
    // Disconnect logic
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        const code = userRoom[socket.id];
        // Return incase user in invalid room
        if (!code)
            return;
        const room = rooms[code];
        if (!room)
            return;
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
function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    while (true) {
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (!rooms[code])
            return code;
    }
}
// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
