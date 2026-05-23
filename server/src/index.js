/**
 * 实时协作白板 - 后端服务器主入口
 * 使用 Express + Socket.IO
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { setupSocketHandlers } = require('./socketHandler');
const roomManager = require('./roomManager');

/**
 * 服务器配置
 */
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

/**
 * 初始化 Express 应用
 */
const app = express();

/**
 * 中间件配置
 */
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json());

/**
 * API 路由
 */

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// 创建房间
app.post('/api/rooms', async (req, res) => {
  try {
    const { name, userId, username, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: '房间名称不能为空' });
    }

    const room = await roomManager.createRoom({
      name,
      userId,
      username,
      description,
    });

    res.status(201).json(room);
  } catch (err) {
    console.error('创建房间错误:', err);
    res.status(500).json({ error: '创建房间失败' });
  }
});

// 根据邀请码获取房间
app.get('/api/rooms/:inviteCode', async (req, res) => {
  try {
    const room = await roomManager.getRoomByInviteCode(req.params.inviteCode);

    if (!room) {
      return res.status(404).json({ error: '房间不存在' });
    }

    res.json(room);
  } catch (err) {
    console.error('获取房间错误:', err);
    res.status(500).json({ error: '获取房间失败' });
  }
});

// 获取房间元素
app.get('/api/rooms/:roomId/elements', async (req, res) => {
  try {
    const elements = await roomManager.getRoomElements(req.params.roomId);
    res.json(elements);
  } catch (err) {
    console.error('获取元素错误:', err);
    res.status(500).json({ error: '获取元素失败' });
  }
});

// 获取房间快照
app.get('/api/rooms/:roomId/snapshots', async (req, res) => {
  try {
    const snapshots = await roomManager.getSnapshots(req.params.roomId);
    res.json(snapshots);
  } catch (err) {
    console.error('获取快照错误:', err);
    res.status(500).json({ error: '获取快照失败' });
  }
});

/**
 * 创建 HTTP 服务器
 */
const server = http.createServer(app);

/**
 * 初始化 Socket.IO
 */
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

/**
 * 设置 Socket.IO 事件处理
 */
setupSocketHandlers(io);

/**
 * 启动服务器
 */
server.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 实时协作白板服务器已启动');
  console.log(`📡 HTTP 服务: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket 服务: ws://localhost:${PORT}`);
  console.log('========================================');
});

/**
 * 优雅关闭
 */
process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = { app, server, io };
