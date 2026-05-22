// 直播信令服务器 — WebSocket + WebRTC
// 管理直播房间、视频信令、聊天、发言申请/审批
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

// 房间状态存储（内存，服务器重启后清空）
const rooms = new Map(); // roomId → { presenterWs, viewers: Map<ws, {userId,userName,role}>, speakers: Set<ws>, speakRequests: Map<ws,reason>, chatLog: [], viewerCount, createdAt }

let wss = null;

/**
 * 将信令服务器挂载到 HTTP 服务器上
 */
export function initLiveSignaling(server) {
  wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws._id = randomUUID();
    ws.roomId = null;
    ws.userInfo = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleMessage(ws, msg);
      } catch (e) {
        wsSend(ws, { type: 'error', message: '消息格式错误' });
      }
    });

    ws.on('close', () => {
      leaveRoom(ws);
    });
  });

  // 心保检测：每30秒清理断开的连接
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        leaveRoom(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log('  ✓ 直播信令服务已启动 (ws:/live)');
}

/**
 * 获取房间信息（供API使用）
 */
export function getRoomInfo(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    roomId,
    viewerCount: room.viewers.size + (room.presenterWs ? 1 : 0),
    speakerCount: room.speakers.size,
    speakRequestCount: room.speakRequests.size,
    chatLog: room.chatLog.slice(-50),
    createdAt: room.createdAt
  };
}

export function getAllLiveRooms() {
  const result = [];
  for (const [roomId, room] of rooms) {
    result.push({
      roomId,
      viewerCount: room.viewers.size + (room.presenterWs ? 1 : 0),
      speakerCount: room.speakers.size,
      createdAt: room.createdAt
    });
  }
  return result;
}

// ===== 消息处理 =====

function handleMessage(ws, msg) {
  const { type } = msg;

  switch (type) {
    case 'join':       return handleJoin(ws, msg);
    case 'offer':      return handleOffer(ws, msg);
    case 'answer':     return handleAnswer(ws, msg);
    case 'ice':        return handleIce(ws, msg);
    case 'chat':       return handleChat(ws, msg);
    case 'speak-request':   return handleSpeakRequest(ws, msg);
    case 'speak-approve':   return handleSpeakApprove(ws, msg);
    case 'speak-reject':    return handleSpeakReject(ws, msg);
    case 'speak-end':       return handleSpeakEnd(ws, msg);
    case 'mute-user':       return handleMuteUser(ws, msg);
    case 'end-stream':      return handleEndStream(ws);
    default:
      wsSend(ws, { type: 'error', message: `未知消息类型: ${type}` });
  }
}

// 加入房间
function handleJoin(ws, msg) {
  const { roomId, userId, userName, role } = msg;
  if (!roomId || !userId) {
    return wsSend(ws, { type: 'error', message: '缺少 roomId 或 userId' });
  }

  // 创建房间（如果不存在）
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      presenterWs: null,
      viewers: new Map(),
      speakers: new Set(),
      speakRequests: new Map(),
      chatLog: [],
      viewerCount: 0,
      createdAt: new Date().toISOString()
    });
  }

  const room = rooms.get(roomId);
  ws.roomId = roomId;
  ws.userInfo = { userId, userName: userName || '匿名', role: role || 'viewer' };

  if (role === 'presenter' || role === 'admin') {
    // 主播/管理员
    if (role === 'presenter' && room.presenterWs && room.presenterWs !== ws) {
      // 踢掉旧主播
      try { room.presenterWs.close(); } catch {}
    }
    if (role === 'presenter') room.presenterWs = ws;
    room.viewers.set(ws, { userId, userName, role });
  } else {
    // 观众
    room.viewers.set(ws, { userId, userName, role });
  }

  // 发送房间状态
  wsSend(ws, {
    type: 'joined',
    roomId,
    viewerCount: room.viewers.size,
    chatLog: room.chatLog.slice(-30),
    presenterWsId: room.presenterWs ? getWsId(room.presenterWs) : null,
    speakRequests: Array.from(room.speakRequests.entries()).map(([w, reason]) => ({
      userId: w.userInfo?.userId,
      userName: w.userInfo?.userName,
      reason
    }))
  });

  // 通知房间内其他人有新观众加入
  broadcastToRoom(roomId, {
    type: 'viewer-joined',
    userId,
    userName,
    viewerCount: room.viewers.size
  }, ws);

  // 如果房间有主播，通知主播有新观众加入（让主播创建PeerConnection）
  if (room.presenterWs && room.presenterWs !== ws && room.presenterWs.readyState === 1) {
    wsSend(room.presenterWs, {
      type: 'new-viewer',
      userId,
      userName,
      viewerWsId: getWsId(ws)
    });
  }

  // 如果新加入的是主播/管理员，通知TA房间中所有现有观众（断线重连恢复）
  if ((role === 'presenter' || role === 'admin') && room.presenterWs === ws) {
    for (const [viewerWs, viewerInfo] of room.viewers) {
      if (viewerWs !== ws && viewerWs.readyState === 1) {
        wsSend(ws, {
          type: 'new-viewer',
          userId: viewerInfo.userId,
          userName: viewerInfo.userName,
          viewerWsId: getWsId(viewerWs)
        });
      }
    }
  }
}

// WebRTC 信令：offer（主播→观众）
function handleOffer(ws, msg) {
  const { targetWsId, sdp } = msg;
  if (!targetWsId || !sdp) return;
  const target = findWsById(ws.roomId, targetWsId);
  if (target) {
    wsSend(target, {
      type: 'offer',
      fromWsId: getWsId(ws),
      fromUser: ws.userInfo,
      sdp
    });
  }
}

// WebRTC 信令：answer（观众→主播）
function handleAnswer(ws, msg) {
  const { targetWsId, sdp } = msg;
  if (!targetWsId || !sdp) return;
  const target = findWsById(ws.roomId, targetWsId);
  if (target) {
    wsSend(target, {
      type: 'answer',
      fromWsId: getWsId(ws),
      fromUser: ws.userInfo,
      sdp
    });
  }
}

// ICE candidate
function handleIce(ws, msg) {
  const { targetWsId, candidate } = msg;
  if (!targetWsId || !candidate) return;
  const target = findWsById(ws.roomId, targetWsId);
  if (target) {
    wsSend(target, {
      type: 'ice',
      fromWsId: getWsId(ws),
      candidate
    });
  }
}

// 聊天消息
function handleChat(ws, msg) {
  const { text } = msg;
  if (!text || !ws.roomId || !ws.userInfo) return;

  const chatMsg = {
    userId: ws.userInfo.userId,
    userName: ws.userInfo.userName,
    text: text.substring(0, 500),
    time: new Date().toISOString()
  };

  const room = rooms.get(ws.roomId);
  if (room) {
    room.chatLog.push(chatMsg);
    if (room.chatLog.length > 200) room.chatLog = room.chatLog.slice(-100);
  }

  broadcastToRoom(ws.roomId, { type: 'chat', ...chatMsg });
}

// 观众申请发言
function handleSpeakRequest(ws, msg) {
  if (!ws.roomId) return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  const reason = (msg.reason || '').substring(0, 200);
  room.speakRequests.set(ws, reason);

  // 通知管理员/主播
  broadcastToAdmins(ws.roomId, {
    type: 'speak-request',
    userId: ws.userInfo?.userId,
    userName: ws.userInfo?.userName,
    reason
  });
}

// 管理员批准发言
function handleSpeakApprove(ws, msg) {
  if (!ws.roomId || ws.userInfo?.role === 'viewer') return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  const { userId } = msg;
  // 找到申请者
  const requester = findWsByUserId(ws.roomId, userId);
  if (!requester) return;

  room.speakRequests.delete(requester);
  room.speakers.add(requester);

  // 通知申请者已批准
  wsSend(requester, { type: 'speak-approved' });

  // 通知主播，建立与发言者的WebRTC连接
  if (room.presenterWs && room.presenterWs.readyState === 1) {
    wsSend(room.presenterWs, {
      type: 'new-speaker',
      userId: requester.userInfo?.userId,
      userName: requester.userInfo?.userName,
      speakerWsId: getWsId(requester)
    });
  }

  // 通知所有人
  broadcastToRoom(ws.roomId, {
    type: 'speaker-added',
    userId: requester.userInfo?.userId,
    userName: requester.userInfo?.userName
  });
}

// 管理员拒绝发言
function handleSpeakReject(ws, msg) {
  if (!ws.roomId || ws.userInfo?.role === 'viewer') return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  const { userId } = msg;
  const requester = findWsByUserId(ws.roomId, userId);
  if (!requester) return;

  room.speakRequests.delete(requester);
  wsSend(requester, { type: 'speak-rejected' });
}

// 管理员结束某人的发言
function handleSpeakEnd(ws, msg) {
  if (!ws.roomId || ws.userInfo?.role === 'viewer') return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  const { userId } = msg;
  const speaker = findWsByUserId(ws.roomId, userId);
  if (!speaker) return;

  room.speakers.delete(speaker);
  wsSend(speaker, { type: 'speak-ended' });
  broadcastToRoom(ws.roomId, {
    type: 'speaker-removed',
    userId: speaker.userInfo?.userId,
    userName: speaker.userInfo?.userName
  });
}

// 管理员禁言某人
function handleMuteUser(ws, msg) {
  if (!ws.roomId || ws.userInfo?.role === 'viewer') return;
  const { userId } = msg;
  const target = findWsByUserId(ws.roomId, userId);
  if (target) {
    wsSend(target, { type: 'muted' });
  }
}

// 主播结束直播
function handleEndStream(ws) {
  if (!ws.roomId) return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  // 只有主播或管理员可以结束
  if (ws.userInfo?.role !== 'presenter' && ws.userInfo?.role !== 'admin') return;

  broadcastToRoom(ws.roomId, { type: 'stream-ended' });

  // 关闭所有连接
  for (const [viewerWs] of room.viewers) {
    try { viewerWs.close(); } catch {}
  }
  rooms.delete(ws.roomId);
}

// 离开房间
function leaveRoom(ws) {
  if (!ws.roomId) return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  room.viewers.delete(ws);
  room.speakers.delete(ws);
  room.speakRequests.delete(ws);

  if (room.presenterWs === ws) {
    room.presenterWs = null;
  }

  // 通知房间内其他人
  broadcastToRoom(ws.roomId, {
    type: 'viewer-left',
    userId: ws.userInfo?.userId,
    userName: ws.userInfo?.userName,
    viewerCount: room.viewers.size
  });

  // 如果房间空了，清理
  if (room.viewers.size === 0 && !room.presenterWs) {
    rooms.delete(ws.roomId);
  }
}

// ===== 工具函数 =====

function wsSend(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToRoom(roomId, data, excludeWs) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [ws] of room.viewers) {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }
}

function broadcastToAdmins(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [ws, info] of room.viewers) {
    if ((info.role === 'admin' || info.role === 'presenter') && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }
}

function getWsId(ws) {
  return ws._id;
}

function findWsById(roomId, wsId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  for (const [ws] of room.viewers) {
    if (getWsId(ws) === wsId) return ws;
  }
  return null;
}

function findWsByUserId(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  for (const [ws, info] of room.viewers) {
    if (info.userId === userId) return ws;
  }
  return null;
}
