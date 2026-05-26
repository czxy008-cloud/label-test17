/**
 * 房间管理器
 * 负责白板房间的创建、管理和生命周期
 */

const { v4: uuidv4 } = require('uuid');
const { query } = require('./db');

/**
 * 生成唯一的邀请码
 * @returns {string} 邀请码
 */
const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * 内存中的房间状态缓存
 * 存储当前活跃房间的实时状态
 */
const rooms = new Map();

/**
 * 创建新的白板房间
 * @param {object} options - 房间配置
 * @param {string} options.name - 房间名称
 * @param {string} options.userId - 创建者用户ID
 * @param {string} options.description - 房间描述（可选）
 * @returns {Promise<object>} 房间信息
 */
const createRoom = async ({ name, userId, username, description = '' }) => {
  const inviteCode = generateInviteCode();
  // 如果 userId 为空或 undefined，设为 null
  const ownerId = userId || null;

  try {
    // 先确保用户存在（如果提供了 userId）
    if (ownerId) {
      const userCheck = await query(
        `SELECT id FROM users WHERE id = $1`,
        [ownerId]
      );
      
      if (userCheck.rows.length === 0) {
        // 生成唯一用户名，避免 UNIQUE 约束冲突
        const uniqueUsername = username || `用户${Date.now()}${Math.floor(Math.random() * 10000)}`;
        await query(
          `INSERT INTO users (id, username) VALUES ($1, $2)`,
          [ownerId, uniqueUsername]
        );
      }
    }

    const result = await query(
      `INSERT INTO whiteboard_rooms (name, description, owner_id, invite_code)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, invite_code, created_at`,
      [name, description, ownerId, inviteCode]
    );

    const room = result.rows[0];

    // 将创建者添加为房间成员
    if (ownerId) {
      await query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [room.id, ownerId]
      );
    }

    // 初始化内存中的房间状态
    rooms.set(room.id, {
      id: room.id,
      name: room.name,
      inviteCode: room.invite_code,
      elements: [],
      users: new Map(),
      history: [],
      redoStack: [],
    });

    console.log(`✓ 创建房间: ${room.name} (${room.invite_code})`);
    return room;
  } catch (err) {
    console.error('创建房间失败:', err);
    throw err;
  }
};

/**
 * 根据邀请码获取房间
 * @param {string} inviteCode - 邀请码
 * @returns {Promise<object|null>} 房间信息
 */
const getRoomByInviteCode = async (inviteCode) => {
  try {
    const result = await query(
      `SELECT * FROM v_active_rooms WHERE invite_code = $1`,
      [inviteCode]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('获取房间失败:', err);
    throw err;
  }
};

/**
 * 获取房间的所有元素
 * @param {string} roomId - 房间ID
 * @returns {Promise<Array>} 元素列表
 */
const getRoomElements = async (roomId) => {
  try {
    const result = await query(
      `SELECT * FROM v_room_elements WHERE room_id = $1`,
      [roomId]
    );
    return result.rows;
  } catch (err) {
    console.error('获取房间元素失败:', err);
    throw err;
  }
};

/**
 * 保存元素到数据库
 * @param {object} element - 元素数据
 * @returns {Promise<object>} 保存的元素
 */
const saveElement = async (element) => {
  // 字段名转换: camelCase -> snake_case
  const dbElement = {
    room_id: element.roomId || element.room_id,
    user_id: element.userId || element.user_id,
    element_type: element.elementType || element.element_type,
    stroke_color: element.strokeColor || element.stroke_color || '#000000',
    stroke_width: element.strokeWidth || element.stroke_width || 2,
    fill_color: element.fillColor || element.fill_color,
    opacity: element.opacity || 1,
    points_data: element.pointsData || element.points_data,
    start_x: element.startX !== undefined ? element.startX : element.start_x,
    start_y: element.startY !== undefined ? element.startY : element.start_y,
    width: element.width,
    height: element.height,
    end_x: element.endX !== undefined ? element.endX : element.end_x,
    end_y: element.endY !== undefined ? element.endY : element.end_y,
    text_content: element.textContent || element.text_content,
    font_family: element.fontFamily || element.font_family,
    font_size: element.fontSize || element.font_size,
  };

  try {
    const result = await query(
      `INSERT INTO whiteboard_elements 
       (room_id, user_id, element_type, stroke_color, stroke_width, fill_color, opacity,
        points_data, start_x, start_y, width, height, end_x, end_y, text_content, font_family, font_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, z_index`,
      [
        dbElement.room_id, dbElement.user_id, dbElement.element_type,
        dbElement.stroke_color, dbElement.stroke_width, dbElement.fill_color, dbElement.opacity,
        dbElement.points_data, dbElement.start_x, dbElement.start_y,
        dbElement.width, dbElement.height, dbElement.end_x, dbElement.end_y,
        dbElement.text_content, dbElement.font_family, dbElement.font_size,
      ]
    );
    return result.rows[0];
  } catch (err) {
    console.error('保存元素失败:', err);
    throw err;
  }
};

/**
 * 更新元素
 * @param {string} elementId - 元素ID
 * @param {object} updates - 更新数据
 * @returns {Promise<void>}
 */
const updateElement = async (elementId, updates) => {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    const dbColumn = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    fields.push(`${dbColumn} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  values.push(elementId);

  try {
    await query(
      `UPDATE whiteboard_elements SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  } catch (err) {
    console.error('更新元素失败:', err);
    throw err;
  }
};

/**
 * 删除元素（软删除）
 * @param {string} elementId - 元素ID
 * @returns {Promise<void>}
 */
const deleteElement = async (elementId) => {
  try {
    await query(
      `UPDATE whiteboard_elements SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1`,
      [elementId]
    );
  } catch (err) {
    console.error('删除元素失败:', err);
    throw err;
  }
};

/**
 * 恢复被软删除的元素
 * @param {string} elementId - 元素ID
 * @returns {Promise<void>}
 */
const restoreElement = async (elementId) => {
  try {
    await query(
      `UPDATE whiteboard_elements SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1`,
      [elementId]
    );
  } catch (err) {
    console.error('恢复元素失败:', err);
    throw err;
  }
};

/**
 * 物理删除元素（用于撤销创建操作）
 * @param {string} elementId - 元素ID
 * @returns {Promise<void>}
 */
const hardDeleteElement = async (elementId) => {
  try {
    await query(
      `DELETE FROM whiteboard_elements WHERE id = $1`,
      [elementId]
    );
  } catch (err) {
    console.error('物理删除元素失败:', err);
    throw err;
  }
};

/**
 * 重新插入元素（用于重做创建操作，保持原ID）
 * @param {object} element - 元素数据
 * @returns {Promise<void>}
 */
const reinsertElement = async (element) => {
  const dbElement = {
    id: element.id,
    room_id: element.roomId || element.room_id,
    user_id: element.userId || element.user_id,
    element_type: element.elementType || element.element_type,
    stroke_color: element.strokeColor || element.stroke_color || '#000000',
    stroke_width: element.strokeWidth || element.stroke_width || 2,
    fill_color: element.fillColor || element.fill_color,
    opacity: element.opacity || 1,
    points_data: element.pointsData || element.points_data,
    start_x: element.startX !== undefined ? element.startX : element.start_x,
    start_y: element.startY !== undefined ? element.startY : element.start_y,
    width: element.width,
    height: element.height,
    end_x: element.endX !== undefined ? element.endX : element.end_x,
    end_y: element.endY !== undefined ? element.endY : element.end_y,
    text_content: element.textContent || element.text_content,
    font_family: element.fontFamily || element.font_family,
    z_index: element.zIndex || element.z_index,
  };

  try {
    await query(
      `INSERT INTO whiteboard_elements 
       (id, room_id, user_id, element_type, stroke_color, stroke_width, fill_color, opacity,
        points_data, start_x, start_y, width, height, end_x, end_y, text_content, font_family, font_size, z_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        dbElement.id, dbElement.room_id, dbElement.user_id, dbElement.element_type,
        dbElement.stroke_color, dbElement.stroke_width, dbElement.fill_color, dbElement.opacity,
        dbElement.points_data, dbElement.start_x, dbElement.start_y,
        dbElement.width, dbElement.height, dbElement.end_x, dbElement.end_y,
        dbElement.text_content, dbElement.font_family, dbElement.font_size, dbElement.z_index,
      ]
    );
  } catch (err) {
    console.error('重新插入元素失败:', err);
    throw err;
  }
};

/**
 * 保存操作历史
 * @param {object} historyData - 历史数据
 * @returns {Promise<void>}
 */
const saveHistory = async (historyData) => {
  const { roomId, userId, actionType, elementId, oldData, newData } = historyData;

  try {
    await query(
      `INSERT INTO whiteboard_history 
       (room_id, user_id, action_type, element_id, old_data, new_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [roomId, userId, actionType, elementId, oldData, newData]
    );
  } catch (err) {
    console.error('保存历史失败:', err);
    throw err;
  }
};

/**
 * 创建快照
 * @param {string} roomId - 房间ID
 * @param {string} name - 快照名称
 * @param {object} snapshotData - 快照数据
 * @param {string} userId - 用户ID
 * @returns {Promise<object>} 快照信息
 */
const createSnapshot = async (roomId, name, snapshotData, userId) => {
  try {
    const result = await query(
      `INSERT INTO whiteboard_snapshots (room_id, name, snapshot_data, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, created_at`,
      [roomId, name, snapshotData, userId]
    );
    return result.rows[0];
  } catch (err) {
    console.error('创建快照失败:', err);
    throw err;
  }
};

/**
 * 获取房间所有快照
 * @param {string} roomId - 房间ID
 * @returns {Promise<Array>} 快照列表
 */
const getSnapshots = async (roomId) => {
  try {
    const result = await query(
      `SELECT id, name, description, snapshot_data, created_at, 
        (SELECT username FROM users WHERE id = created_by) as created_by_name
       FROM whiteboard_snapshots 
       WHERE room_id = $1 
       ORDER BY created_at DESC`,
      [roomId]
    );
    return result.rows;
  } catch (err) {
    console.error('获取快照失败:', err);
    throw err;
  }
};

/**
 * 获取或初始化内存中的房间状态
 * @param {string} roomId - 房间ID
 * @returns {object} 房间状态
 */
const getRoomState = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      elements: [],
      users: new Map(),
      history: [],
      redoStack: [],
    });
  }
  return rooms.get(roomId);
};

/**
 * 获取所有房间ID
 * @returns {Array<string>} 房间ID数组
 */
const getAllRooms = () => {
  return Array.from(rooms.keys());
};

/**
 * 从内存中移除房间
 * @param {string} roomId - 房间ID
 */
const removeRoomState = (roomId) => {
  rooms.delete(roomId);
};

module.exports = {
  createRoom,
  getRoomByInviteCode,
  getRoomElements,
  saveElement,
  updateElement,
  deleteElement,
  restoreElement,
  hardDeleteElement,
  reinsertElement,
  saveHistory,
  createSnapshot,
  getSnapshots,
  getRoomState,
  getAllRooms,
  removeRoomState,
  generateInviteCode,
};
