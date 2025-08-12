const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve static files from /public
app.use(express.static('public'));

io.on('connection', socket => {
  console.log('user connected', socket.id);

  // join room (simple room by query or default "main")
  socket.on('join-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', socket.id);
  });

  // chat message
  socket.on('chat-message', ({ roomId, name, message }) => {
    io.to(roomId).emit('chat-message', { id: socket.id, name, message, time: Date.now() });
  });

  // signaling: offer, answer, ice candidates
  socket.on('webrtc-offer', ({ roomId, offer, to }) => {
    // if 'to' specified, send only to that socket, else broadcast to room
    if (to) {
      socket.to(to).emit('webrtc-offer', { from: socket.id, offer });
    } else {
      socket.to(roomId).emit('webrtc-offer', { from: socket.id, offer });
    }
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    socket.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate, roomId }) => {
    if (to) socket.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
    else socket.to(roomId).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    io.emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
