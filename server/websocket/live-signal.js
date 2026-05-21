import { WebSocketServer } from 'ws';

const rooms = new Map(); // roomToken -> { broadcaster: ws, viewers: Map<ws, {id, name}>, speakers: Map<ws, {id, name}> }
const connections = new Map(); // ws -> { roomToken, role, userId, userName }

export function setupLiveWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (ws, req) => {
    console.log('🔌 WebSocket 连接建立');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.log('WS error:', err.message);
    });
  });

  console.log('✓ WebSocket 信令服务器已启动 (/ws/live)');
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'join-room':
      handleJoinRoom(ws, msg);
      break;
    case 'offer':
      handleOffer(ws, msg);
      break;
    case 'answer':
      handleAnswer(ws, msg);
      break;
    case 'ice-candidate':
      handleIceCandidate(ws, msg);
      break;
    case 'chat':
      handleChat(ws, msg);
      break;
    case 'request-speaker':
      handleWsSpeakerRequest(ws, msg);
      break;
    case 'approve-speaker':
      handleApproveSpeaker(ws, msg);
      break;
    case 'deny-speaker':
      handleDenySpeaker(ws, msg);
      break;
    case 'speaker-offer':
      handleSpeakerOffer(ws, msg);
      break;
    case 'speaker-answer':
      handleSpeakerAnswer(ws, msg);
      break;
    case 'speaker-ice':
      handleSpeakerIce(ws, msg);
      break;
    case 'leave-room':
      handleDisconnect(ws);
      break;
  }
}

function handleJoinRoom(ws, msg) {
  const { roomToken, role, userId, userName } = msg;
  if (!roomToken) return;

  if (!rooms.has(roomToken)) {
    rooms.set(roomToken, { broadcaster: null, viewers: new Map(), speakers: new Map(), chatHistory: [] });
  }

  const room = rooms.get(roomToken);
  connections.set(ws, { roomToken, role, userId, userName });

  if (role === 'broadcaster') {
    room.broadcaster = ws;
    ws.send(JSON.stringify({ type: 'joined', role: 'broadcaster', viewerCount: room.viewers.size }));
    // Notify existing viewers that broadcaster is here
    room.viewers.forEach((info, viewerWs) => {
      if (viewerWs.readyState === 1) {
        viewerWs.send(JSON.stringify({ type: 'broadcaster-joined' }));
      }
    });
  } else if (role === 'speaker') {
    room.speakers.set(ws, { id: userId, name: userName });
    ws.send(JSON.stringify({ type: 'joined', role: 'speaker' }));
    // Notify broadcaster about new speaker
    if (room.broadcaster && room.broadcaster.readyState === 1) {
      room.broadcaster.send(JSON.stringify({ type: 'speaker-joined', userId, userName }));
    }
  } else {
    room.viewers.set(ws, { id: userId, name: userName });
    ws.send(JSON.stringify({ type: 'joined', role: 'viewer', viewerCount: room.viewers.size }));
    // Notify broadcaster about new viewer
    if (room.broadcaster && room.broadcaster.readyState === 1) {
      room.broadcaster.send(JSON.stringify({ type: 'viewer-joined', userId, userName, count: room.viewers.size }));
    }
  }

  // Send chat history
  if (room.chatHistory.length > 0) {
    ws.send(JSON.stringify({ type: 'chat-history', messages: room.chatHistory.slice(-50) }));
  }
}

function handleOffer(ws, msg) {
  const conn = connections.get(ws);
  if (!conn) return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  if (conn.role === 'broadcaster') {
    // Broadcaster offers to a specific viewer
    const targetWs = [...room.viewers.keys()].find(v => connections.get(v)?.userId === msg.targetUserId);
    if (targetWs && targetWs.readyState === 1) {
      targetWs.send(JSON.stringify({ type: 'offer', sdp: msg.sdp, fromUserId: conn.userId }));
    }
  } else {
    // Viewer offers to broadcaster
    if (room.broadcaster && room.broadcaster.readyState === 1) {
      room.broadcaster.send(JSON.stringify({ type: 'offer', sdp: msg.sdp, fromUserId: conn.userId, fromUserName: conn.userName }));
    }
  }
}

function handleAnswer(ws, msg) {
  const conn = connections.get(ws);
  if (!conn) return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  if (conn.role === 'broadcaster') {
    // Broadcaster answers a specific viewer or speaker
    const targetWs = [...room.viewers.keys()].find(v => connections.get(v)?.userId === msg.targetUserId)
                  || [...room.speakers.keys()].find(s => connections.get(s)?.userId === msg.targetUserId);
    if (targetWs && targetWs.readyState === 1) {
      targetWs.send(JSON.stringify({ type: 'answer', sdp: msg.sdp, fromUserId: conn.userId }));
    }
  } else {
    // Viewer/speaker answers broadcaster
    if (room.broadcaster && room.broadcaster.readyState === 1) {
      room.broadcaster.send(JSON.stringify({ type: 'answer', sdp: msg.sdp, fromUserId: conn.userId }));
    }
  }
}

function handleIceCandidate(ws, msg) {
  const conn = connections.get(ws);
  if (!conn) return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  const payload = { type: 'ice-candidate', candidate: msg.candidate, fromUserId: conn.userId };

  if (conn.role === 'broadcaster') {
    const targetWs = [...room.viewers.keys()].find(v => connections.get(v)?.userId === msg.targetUserId)
                  || [...room.speakers.keys()].find(s => connections.get(s)?.userId === msg.targetUserId);
    if (targetWs && targetWs.readyState === 1) {
      targetWs.send(JSON.stringify(payload));
    }
  } else {
    if (room.broadcaster && room.broadcaster.readyState === 1) {
      room.broadcaster.send(JSON.stringify(payload));
    }
  }
}

function handleChat(ws, msg) {
  const conn = connections.get(ws);
  if (!conn) return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  const chatMsg = {
    type: 'chat',
    userId: conn.userId,
    userName: conn.userName,
    text: msg.text,
    timestamp: new Date().toISOString()
  };
  room.chatHistory.push(chatMsg);
  if (room.chatHistory.length > 200) room.chatHistory.shift();

  broadcastToRoom(room, chatMsg);
}

function handleWsSpeakerRequest(ws, msg) {
  const conn = connections.get(ws);
  if (!conn || conn.role !== 'viewer') return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  const reqMsg = {
    type: 'speaker-requested',
    userId: conn.userId,
    userName: conn.userName
  };
  if (room.broadcaster && room.broadcaster.readyState === 1) {
    room.broadcaster.send(JSON.stringify(reqMsg));
  }
}

function handleApproveSpeaker(ws, msg) {
  const conn = connections.get(ws);
  if (!conn || conn.role !== 'broadcaster') return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  const viewerWs = [...room.viewers.keys()].find(v => connections.get(v)?.userId === msg.userId);
  if (viewerWs) {
    room.viewers.delete(viewerWs);
    room.speakers.set(viewerWs, { id: msg.userId, name: msg.userName });
    connections.set(viewerWs, { ...connections.get(viewerWs), role: 'speaker' });
    if (viewerWs.readyState === 1) {
      viewerWs.send(JSON.stringify({ type: 'speaker-approved' }));
    }
  }

  broadcastToRoom(room, { type: 'speaker-approved-broadcast', userId: msg.userId, userName: msg.userName });
}

function handleDenySpeaker(ws, msg) {
  const conn = connections.get(ws);
  if (!conn || conn.role !== 'broadcaster') return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  const viewerWs = [...room.viewers.keys()].find(v => connections.get(v)?.userId === msg.userId);
  if (viewerWs && viewerWs.readyState === 1) {
    viewerWs.send(JSON.stringify({ type: 'speaker-denied' }));
  }
}

function handleSpeakerOffer(ws, msg) {
  const conn = connections.get(ws);
  if (!conn || conn.role !== 'speaker') return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  if (room.broadcaster && room.broadcaster.readyState === 1) {
    room.broadcaster.send(JSON.stringify({ type: 'speaker-offer', sdp: msg.sdp, fromUserId: conn.userId, fromUserName: conn.userName }));
  }
}

function handleSpeakerAnswer(ws, msg) {
  const conn = connections.get(ws);
  if (!conn || conn.role !== 'broadcaster') return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  const speakerWs = [...room.speakers.keys()].find(s => connections.get(s)?.userId === msg.targetUserId);
  if (speakerWs && speakerWs.readyState === 1) {
    speakerWs.send(JSON.stringify({ type: 'speaker-answer', sdp: msg.sdp }));
  }
}

function handleSpeakerIce(ws, msg) {
  const conn = connections.get(ws);
  if (!conn) return;
  const room = rooms.get(conn.roomToken);
  if (!room) return;

  if (conn.role === 'speaker') {
    if (room.broadcaster && room.broadcaster.readyState === 1) {
      room.broadcaster.send(JSON.stringify({ type: 'speaker-ice', candidate: msg.candidate, fromUserId: conn.userId }));
    }
  } else if (conn.role === 'broadcaster') {
    const speakerWs = [...room.speakers.keys()].find(s => connections.get(s)?.userId === msg.targetUserId);
    if (speakerWs && speakerWs.readyState === 1) {
      speakerWs.send(JSON.stringify({ type: 'speaker-ice', candidate: msg.candidate }));
    }
  }
}

function handleDisconnect(ws) {
  const conn = connections.get(ws);
  if (!conn) return;
  const room = rooms.get(conn.roomToken);
  if (room) {
    if (room.broadcaster === ws) {
      room.broadcaster = null;
      broadcastToRoom(room, { type: 'broadcaster-left' });
    } else {
      room.viewers.delete(ws);
      room.speakers.delete(ws);
      if (room.broadcaster && room.broadcaster.readyState === 1) {
        room.broadcaster.send(JSON.stringify({ type: 'viewer-left', count: room.viewers.size }));
      }
    }
    if (room.viewers.size === 0 && room.speakers.size === 0 && !room.broadcaster) {
      rooms.delete(conn.roomToken);
    }
  }
  connections.delete(ws);
}

function broadcastToRoom(room, msg) {
  const send = (ws) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  if (room.broadcaster) send(room.broadcaster);
  room.viewers.forEach((_, ws) => send(ws));
  room.speakers.forEach((_, ws) => send(ws));
}
