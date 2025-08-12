const socket = io();

// room can be changed by user if you want – default "main"
const ROOM_ID = 'main';

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const startCamBtn = document.getElementById('startCam');
const callBtn = document.getElementById('callBtn');
const hangupBtn = document.getElementById('hangupBtn');

const chatForm = document.getElementById('chat-form');
const messagesDiv = document.getElementById('messages');
const peersList = document.getElementById('peers');
const nameInput = document.getElementById('name');

let localStream = null;
let pc = null;
let remoteSocketId = null; // for 1-to-1 demo

// STUN servers (public). For production add TURN.
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

socket.on('connect', () => {
  console.log('socket connected', socket.id);
  socket.emit('join-room', ROOM_ID);
});

socket.on('user-joined', id => {
  addPeerToList(id);
  console.log('user-joined', id);
});

socket.on('chat-message', data => {
  appendMessage(`${data.name || data.id}: ${data.message}`);
});

socket.on('webrtc-offer', async ({ from, offer }) => {
  // save the caller id
  remoteSocketId = from;
  await ensurePeerConnection();

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit('webrtc-answer', { to: from, answer: pc.localDescription });
});

socket.on('webrtc-answer', async ({ from, answer }) => {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
  if (candidate && pc) {
    try { await pc.addIceCandidate(candidate); } catch (e) { console.warn(e); }
  }
});

socket.on('user-disconnected', id => {
  removePeerFromList(id);
  if (id === remoteSocketId) {
    // remote left
    hangup();
  }
});

function appendMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg';
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// chat send
chatForm.addEventListener('submit', e => {
  e.preventDefault();
  const messageInput = document.getElementById('message');
  const message = messageInput.value.trim();
  if (!message) return;
  socket.emit('chat-message', { roomId: ROOM_ID, name: nameInput.value || 'Anon', message });
  appendMessage(`Me: ${message}`);
  messageInput.value = '';
});

// start camera
startCamBtn.addEventListener('click', async () => {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localVideo.srcObject = localStream;
    } catch (err) {
      alert('Camera/mic access denied or not available: ' + err.message);
      return;
    }
  }
});

// call button
callBtn.addEventListener('click', async () => {
  await ensurePeerConnection();

  // create offer and send
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // send to room (server will broadcast to others)
  socket.emit('webrtc-offer', { roomId: ROOM_ID, offer: pc.localDescription });
  callBtn.disabled = true;
  hangupBtn.disabled = false;
});

// hangup
hangupBtn.addEventListener('click', () => hangup());

function hangup() {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (remoteVideo) remoteVideo.srcObject = null;
  remoteSocketId = null;
  callBtn.disabled = false;
  hangupBtn.disabled = true;
}

async function ensurePeerConnection() {
  if (pc) return;

  pc = new RTCPeerConnection(rtcConfig);

  // add local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // when remote stream arrives
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc.addEventListener('track', event => {
    event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
  });

  // ICE candidates -> send to others via signaling
  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('webrtc-ice-candidate', { to: remoteSocketId, candidate: event.candidate, roomId: ROOM_ID });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('pc state', pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      hangup();
    }
  };
}

// peers list UI helpers
function addPeerToList(id) {
  const li = document.createElement('li');
  li.id = 'peer-' + id;
  li.textContent = id + (id === socket.id ? ' (you)' : '');
  peersList.appendChild(li);
}
function removePeerFromList(id) {
  const el = document.getElementById('peer-' + id);
  if (el) el.remove();
}

// 
addPeerToList(socket.id);
