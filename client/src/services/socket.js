/**
 * Socket.IO 客户端配置
 * 封装与服务器的WebSocket通信
 */

import { io } from 'socket.io-client';

/**
 * Socket连接单例
 */
let socket = null;

/**
 * 获取或创建Socket连接
 * @returns {Socket} Socket.IO客户端实例
 */
export const getSocket = () => {
  if (!socket) {
    socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // 连接事件监听
    socket.on('connect', () => {
      console.log('✓ WebSocket连接成功');
    });

    socket.on('disconnect', () => {
      console.log('⚠ WebSocket连接断开');
    });

    socket.on('error', (error) => {
      console.error('WebSocket错误:', error);
    });
  }

  return socket;
};

/**
 * 断开Socket连接
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * 加入房间
 * @param {string} roomId - 房间ID
 * @param {object} user - 用户信息
 * @returns {Promise} 房间状态数据
 */
export const joinRoom = (roomId, user) => {
  return new Promise((resolve, reject) => {
    const sock = getSocket();

    // 监听房间状态响应
    const handleRoomState = (data) => {
      // 清理监听器
      sock.off('room_state', handleRoomState);
      sock.off('error', handleError);
      resolve(data);
    };

    const handleError = (error) => {
      sock.off('room_state', handleRoomState);
      sock.off('error', handleError);
      reject(error);
    };

    sock.on('room_state', handleRoomState);
    sock.on('error', handleError);

    // 发送加入房间请求
    sock.emit('join_room', {
      roomId,
      userId: user.id,
      username: user.username,
    });
  });
};

/**
 * 离开房间
 * @param {string} roomId - 房间ID
 */
export const leaveRoom = (roomId) => {
  const sock = getSocket();
  sock.emit('leave_room', { roomId });
};

/**
 * 发送绘制事件
 * @param {object} data - 绘制数据
 */
export const sendDrawStart = (data) => {
  getSocket().emit('draw_start', data);
};

export const sendDraw = (data) => {
  getSocket().emit('draw', data);
};

export const sendDrawEnd = (data) => {
  getSocket().emit('draw_end', data);
};

/**
 * 发送元素更新事件
 * @param {object} data - 更新数据
 */
export const sendUpdateElement = (data) => {
  getSocket().emit('update_element', data);
};

/**
 * 发送元素删除事件
 * @param {object} data - 删除数据
 */
export const sendDeleteElement = (data) => {
  getSocket().emit('delete_element', data);
};

/**
 * 发送图层更新事件
 * @param {object} data - 图层数据
 */
export const sendUpdateZIndex = (data) => {
  getSocket().emit('update_z_index', data);
};

/**
 * 发送可见性切换事件
 * @param {object} data - 可见性数据
 */
export const sendToggleVisibility = (data) => {
  getSocket().emit('toggle_visibility', data);
};

/**
 * 发送撤销请求
 * @param {string} roomId - 房间ID
 */
export const sendUndo = (roomId) => {
  getSocket().emit('undo', { roomId });
};

/**
 * 发送重做请求
 * @param {string} roomId - 房间ID
 */
export const sendRedo = (roomId) => {
  getSocket().emit('redo', { roomId });
};

/**
 * 发送保存快照请求
 * @param {object} data - 快照数据
 */
export const sendSaveSnapshot = (data) => {
  getSocket().emit('save_snapshot', data);
};

/**
 * 发送获取快照列表请求
 * @param {string} roomId - 房间ID
 */
export const sendGetSnapshots = (roomId) => {
  getSocket().emit('get_snapshots', { roomId });
};

/**
 * 发送加载快照请求
 * @param {object} data - 加载数据
 */
export const sendLoadSnapshot = (data) => {
  getSocket().emit('load_snapshot', data);
};

/**
 * 发送光标位置
 * @param {object} data - 光标数据
 */
export const sendCursorPosition = (data) => {
  getSocket().emit('cursor_position', data);
};

/**
 * 注册事件监听器
 * @param {string} event - 事件名称
 * @param {Function} callback - 回调函数
 */
export const onSocketEvent = (event, callback) => {
  getSocket().on(event, callback);
};

/**
 * 移除事件监听器
 * @param {string} event - 事件名称
 * @param {Function} callback - 回调函数
 */
export const offSocketEvent = (event, callback) => {
  getSocket().off(event, callback);
};
