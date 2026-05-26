/**
 * Socket.IO 事件处理器
 * 处理实时协作相关的WebSocket通信
 */

const { v4: uuidv4 } = require('uuid');
const roomManager = require('./roomManager');

/**
 * 注册Socket.IO事件处理
 * @param {Server} io - Socket.IO服务器实例
 */
const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`新用户连接: ${socket.id}`);

    // ============================================================
    // 事件: join_room - 加入白板房间
    // 数据: { roomId, userId, username }
    // ============================================================
    socket.on('join_room', async (data) => {
      try {
        const { roomId, userId, username } = data;

        // 获取或创建房间状态
        const roomState = roomManager.getRoomState(roomId);

        // 将用户加入房间
        socket.join(roomId);

        // 记录用户信息
        roomState.users.set(socket.id, {
          id: socket.id,
          userId,
          username,
          color: getRandomColor(),
          joinedAt: new Date(),
        });

        // 从数据库获取房间元素
        const elements = await roomManager.getRoomElements(roomId);
        roomState.elements = elements;

        // 发送当前房间状态给新加入的用户
        socket.emit('room_state', {
          elements: roomState.elements,
          users: Array.from(roomState.users.values()),
        });

        // 通知房间内其他用户有新用户加入
        socket.to(roomId).emit('user_joined', {
          user: roomState.users.get(socket.id),
        });

        console.log(`用户 ${username} 加入房间 ${roomId}`);
      } catch (err) {
        console.error('加入房间失败:', err);
        socket.emit('error', { message: '加入房间失败' });
      }
    });

    // ============================================================
    // 事件: draw_start - 开始绘制
    // 数据: { roomId, elementType, color, strokeWidth }
    // ============================================================
    socket.on('draw_start', (data) => {
      const { roomId, elementType, color, strokeWidth } = data;
      const roomState = roomManager.getRoomState(roomId);
      const user = roomState.users.get(socket.id);

      if (!user) return;

      // 通知其他用户有人开始绘制
      socket.to(roomId).emit('draw_start', {
        userId: socket.id,
        elementType,
        color,
        strokeWidth,
        userColor: user.color,
      });
    });

    // ============================================================
    // 事件: draw - 绘制过程
    // 数据: { roomId, elementId, points, color, strokeWidth }
    // ============================================================
    socket.on('draw', (data) => {
      const { roomId } = data;

      // 实时转发绘制数据给房间内其他用户
      socket.to(roomId).emit('draw', {
        ...data,
        userId: socket.id,
      });
    });

    // ============================================================
    // 事件: draw_end - 结束绘制（保存元素）
    // 数据: { roomId, element, userId }
    // ============================================================
    socket.on('draw_end', async (data) => {
      try {
        const { roomId, element, userId } = data;
        const roomState = roomManager.getRoomState(roomId);

        // 保存元素到数据库
        const savedElement = await roomManager.saveElement({
          ...element,
          roomId,
          userId,
        });

        const elementWithId = { ...element, id: savedElement.id };
        roomState.elements.push(elementWithId);

        // 保存历史记录
        roomState.history.push({
          type: 'create',
          element: elementWithId,
          timestamp: new Date(),
        });

        // 清空重做栈
        roomState.redoStack = [];

        // 通知房间内所有用户
        io.to(roomId).emit('element_created', {
          element: elementWithId,
          userId: socket.id,
        });

        console.log(`元素已保存: ${savedElement.id}`);
      } catch (err) {
        console.error('保存元素失败:', err);
        socket.emit('error', { message: '保存元素失败' });
      }
    });

    // ============================================================
    // 事件: update_element - 更新元素
    // 数据: { roomId, elementId, updates }
    // ============================================================
    socket.on('update_element', async (data) => {
      try {
        const { roomId, elementId, updates } = data;

        // 更新数据库
        await roomManager.updateElement(elementId, updates);

        // 更新内存中的元素
        const roomState = roomManager.getRoomState(roomId);
        const elementIndex = roomState.elements.findIndex((e) => e.id === elementId);

        if (elementIndex !== -1) {
          // 使用深拷贝避免浅拷贝导致的 oldData 与新数据共享引用（如 freehand 的 points_data）
          const oldElement = deepCloneElement(roomState.elements[elementIndex]);
          const newElement = { ...oldElement, ...updates };
          // 对 updates 中可能包含的数组/对象字段也进行深拷贝
          if (updates.points_data && Array.isArray(updates.points_data)) {
            newElement.points_data = updates.points_data.map((p) => ({ ...p }));
          }
          roomState.elements[elementIndex] = newElement;

          // 保存历史记录
          roomState.history.push({
            type: 'update',
            elementId,
            oldData: oldElement,
            newData: deepCloneElement(newElement),
            timestamp: new Date(),
          });

          roomState.redoStack = [];
        }

        // 通知房间内所有用户
        io.to(roomId).emit('element_updated', {
          elementId,
          updates,
          userId: socket.id,
        });
      } catch (err) {
        console.error('更新元素失败:', err);
        socket.emit('error', { message: '更新元素失败' });
      }
    });

    // ============================================================
    // 事件: delete_element - 删除元素
    // 数据: { roomId, elementId }
    // ============================================================
    socket.on('delete_element', async (data) => {
      try {
        const { roomId, elementId } = data;

        // 从数据库软删除
        await roomManager.deleteElement(elementId);

        // 从内存中移除
        const roomState = roomManager.getRoomState(roomId);
        const elementIndex = roomState.elements.findIndex((e) => e.id === elementId);

        if (elementIndex !== -1) {
          const deletedElement = roomState.elements.splice(elementIndex, 1)[0];

          // 保存历史记录
          roomState.history.push({
            type: 'delete',
            element: deletedElement,
            timestamp: new Date(),
          });

          roomState.redoStack = [];
        }

        // 通知房间内所有用户
        io.to(roomId).emit('element_deleted', {
          elementId,
          userId: socket.id,
        });
      } catch (err) {
        console.error('删除元素失败:', err);
        socket.emit('error', { message: '删除元素失败' });
      }
    });

    // ============================================================
    // 事件: resize_start - 尺寸调整开始
    // 数据: { roomId, elementId, handle, bounds }
    // ============================================================
    socket.on('resize_start', (data) => {
      const { roomId, elementId, handle, bounds } = data;
      socket.to(roomId).emit('resize_start', {
        elementId,
        handle,
        bounds,
        userId: socket.id,
      });
    });

    // ============================================================
    // 事件: resize - 尺寸调整进行中（广播预览）
    // 数据: { roomId, elementId, handle, bounds, updates }
    // ============================================================
    socket.on('resize', (data) => {
      const { roomId, elementId, handle, bounds, updates } = data;
      socket.to(roomId).emit('resize', {
        elementId,
        handle,
        bounds,
        updates,
        userId: socket.id,
      });
    });

    // ============================================================
    // 事件: resize_end - 尺寸调整结束（持久化最终尺寸）
    // 数据: { roomId, elementId, updates }
    // ============================================================
    socket.on('resize_end', async (data) => {
      try {
        const { roomId, elementId, updates } = data;

        // 若没有实际更新（拖拽但未调整尺寸），只广播结束预览，不写入数据库/历史
        if (!updates || Object.keys(updates).length === 0) {
          socket.to(roomId).emit('resize_end', {
            elementId,
            userId: socket.id,
          });
          return;
        }

        // 更新数据库
        await roomManager.updateElement(elementId, updates);

        // 更新内存中的元素并记录历史
        const roomState = roomManager.getRoomState(roomId);
        const elementIndex = roomState.elements.findIndex((e) => e.id === elementId);

        if (elementIndex !== -1) {
          const oldElement = deepCloneElement(roomState.elements[elementIndex]);
          const newElement = { ...oldElement, ...updates };
          if (updates.points_data && Array.isArray(updates.points_data)) {
            newElement.points_data = updates.points_data.map((p) => ({ ...p }));
          }
          roomState.elements[elementIndex] = newElement;

          // 保存历史记录（支持撤销重做）
          roomState.history.push({
            type: 'update',
            elementId,
            oldData: oldElement,
            newData: deepCloneElement(newElement),
            timestamp: new Date(),
          });

          roomState.redoStack = [];
        }

        // 通知房间内所有用户最终尺寸
        io.to(roomId).emit('element_updated', {
          elementId,
          updates,
          userId: socket.id,
        });

        // 通知远端结束预览
        socket.to(roomId).emit('resize_end', {
          elementId,
          userId: socket.id,
        });
      } catch (err) {
        console.error('尺寸调整失败:', err);
        // 无论如何广播结束预览，避免协作端残留预览图形
        if (data && data.roomId && data.elementId) {
          socket.to(data.roomId).emit('resize_end', {
            elementId: data.elementId,
            userId: socket.id,
          });
        }
        socket.emit('error', { message: '尺寸调整失败' });
      }
    });

    // ============================================================
    // 事件: move_start - 元素拖拽开始
    // 数据: { roomId, elementId, bounds }
    // ============================================================
    socket.on('move_start', (data) => {
      const { roomId, elementId, bounds } = data;
      socket.to(roomId).emit('move_start', {
        elementId,
        bounds,
        userId: socket.id,
      });
    });

    // ============================================================
    // 事件: move - 元素拖拽进行中（广播预览）
    // 数据: { roomId, elementId, delta, updates }
    // ============================================================
    socket.on('move', (data) => {
      const { roomId, elementId, delta, updates } = data;
      socket.to(roomId).emit('move', {
        elementId,
        delta,
        updates,
        userId: socket.id,
      });
    });

    // ============================================================
    // 事件: move_end - 元素拖拽结束（持久化最终位置）
    // 数据: { roomId, elementId, updates }
    // ============================================================
    socket.on('move_end', async (data) => {
      try {
        const { roomId, elementId, updates } = data;

        // 若没有实际更新（拖拽但未移动），只广播结束预览，不写入数据库/历史
        if (!updates || Object.keys(updates).length === 0) {
          socket.to(roomId).emit('move_end', {
            elementId,
            userId: socket.id,
          });
          return;
        }

        // 更新数据库
        await roomManager.updateElement(elementId, updates);

        // 更新内存中的元素并记录历史
        const roomState = roomManager.getRoomState(roomId);
        const elementIndex = roomState.elements.findIndex((e) => e.id === elementId);

        if (elementIndex !== -1) {
          const oldElement = deepCloneElement(roomState.elements[elementIndex]);
          const newElement = { ...oldElement, ...updates };
          if (updates.points_data && Array.isArray(updates.points_data)) {
            newElement.points_data = updates.points_data.map((p) => ({ ...p }));
          }
          roomState.elements[elementIndex] = newElement;

          // 保存历史记录（支持撤销重做）
          roomState.history.push({
            type: 'update',
            elementId,
            oldData: oldElement,
            newData: deepCloneElement(newElement),
            timestamp: new Date(),
          });

          roomState.redoStack = [];
        }

        // 通知房间内所有用户最终位置
        io.to(roomId).emit('element_updated', {
          elementId,
          updates,
          userId: socket.id,
        });

        // 通知远端结束预览
        socket.to(roomId).emit('move_end', {
          elementId,
          userId: socket.id,
        });
      } catch (err) {
        console.error('元素移动失败:', err);
        // 无论如何广播结束预览，避免协作端残留预览图形
        if (data && data.roomId && data.elementId) {
          socket.to(data.roomId).emit('move_end', {
            elementId: data.elementId,
            userId: socket.id,
          });
        }
        socket.emit('error', { message: '元素移动失败' });
      }
    });

    // ============================================================
    // 事件: update_z_index - 更新图层顺序
    // 数据: { roomId, elementId, newZIndex }
    // ============================================================
    socket.on('update_z_index', async (data) => {
      try {
        const { roomId, elementId, newZIndex } = data;
        const updates = { zIndex: newZIndex };

        // 更新数据库
        await roomManager.updateElement(elementId, updates);

        // 更新内存中的元素并记录历史
        const roomState = roomManager.getRoomState(roomId);
        const elementIndex = roomState.elements.findIndex((e) => e.id === elementId);

        if (elementIndex !== -1) {
          const oldElement = deepCloneElement(roomState.elements[elementIndex]);
          const newElement = { ...oldElement, ...updates };
          roomState.elements[elementIndex] = newElement;

          // 保存历史记录（支持撤销重做）
          roomState.history.push({
            type: 'update',
            elementId,
            oldData: oldElement,
            newData: deepCloneElement(newElement),
            timestamp: new Date(),
          });

          roomState.redoStack = [];
        }

        // 通知房间内所有用户更新图层
        io.to(roomId).emit('z_index_updated', {
          elementId,
          newZIndex,
          userId: socket.id,
        });
      } catch (err) {
        console.error('更新图层顺序失败:', err);
        socket.emit('error', { message: '更新图层顺序失败' });
      }
    });

    // ============================================================
    // 事件: toggle_visibility - 切换元素可见性
    // 数据: { roomId, elementId, isVisible }
    // ============================================================
    socket.on('toggle_visibility', async (data) => {
      try {
        const { roomId, elementId, isVisible } = data;
        const updates = { isVisible };

        // 更新数据库
        await roomManager.updateElement(elementId, updates);

        // 更新内存中的元素并记录历史
        const roomState = roomManager.getRoomState(roomId);
        const elementIndex = roomState.elements.findIndex((e) => e.id === elementId);

        if (elementIndex !== -1) {
          const oldElement = deepCloneElement(roomState.elements[elementIndex]);
          const newElement = { ...oldElement, ...updates };
          roomState.elements[elementIndex] = newElement;

          // 保存历史记录（支持撤销重做）
          roomState.history.push({
            type: 'update',
            elementId,
            oldData: oldElement,
            newData: deepCloneElement(newElement),
            timestamp: new Date(),
          });

          roomState.redoStack = [];
        }

        // 通知房间内所有用户
        io.to(roomId).emit('visibility_changed', {
          elementId,
          isVisible,
          userId: socket.id,
        });
      } catch (err) {
        console.error('切换可见性失败:', err);
        socket.emit('error', { message: '切换可见性失败' });
      }
    });

    // ============================================================
    // 事件: undo - 撤销操作
    // 数据: { roomId }
    // ============================================================
    socket.on('undo', async (data) => {
      try {
        const { roomId } = data;
        const roomState = roomManager.getRoomState(roomId);

        if (roomState.history.length === 0) {
          socket.emit('undo_complete', { success: false, message: '没有可撤销的操作' });
          return;
        }

        const lastAction = roomState.history.pop();

        switch (lastAction.type) {
          case 'create':
            // 撤销创建: 从数据库物理删除元素
            await roomManager.hardDeleteElement(lastAction.element.id);
            roomState.elements = roomState.elements.filter(
              (e) => e.id !== lastAction.element.id
            );
            io.to(roomId).emit('undo_element_deleted', { elementId: lastAction.element.id });
            break;

          case 'delete':
            // 撤销删除: 恢复数据库中的元素
            await roomManager.restoreElement(lastAction.element.id);
            roomState.elements.push(lastAction.element);
            io.to(roomId).emit('undo_element_restored', { element: lastAction.element });
            break;

          case 'update':
            // 撤销更新: 恢复旧数据到数据库（仅白名单字段，避免 id/user/元数据回写错误）
            const oldDbData = pickElementFields(lastAction.oldData);
            if (oldDbData && Object.keys(oldDbData).length > 0) {
              await roomManager.updateElement(lastAction.elementId, oldDbData);
            }
            const idx = roomState.elements.findIndex(
              (e) => e.id === lastAction.elementId
            );
            if (idx !== -1) {
              roomState.elements[idx] = deepCloneElement(lastAction.oldData);
              io.to(roomId).emit('undo_element_updated', {
                elementId: lastAction.elementId,
                oldData: lastAction.oldData,
              });
            }
            break;
        }

        // 将撤销的操作放入重做栈
        roomState.redoStack.push(lastAction);

        socket.emit('undo_complete', { success: true });
      } catch (err) {
        console.error('撤销操作失败:', err);
        socket.emit('error', { message: '撤销操作失败' });
      }
    });

    // ============================================================
    // 事件: redo - 重做操作
    // 数据: { roomId }
    // ============================================================
    socket.on('redo', async (data) => {
      try {
        const { roomId } = data;
        const roomState = roomManager.getRoomState(roomId);

        if (roomState.redoStack.length === 0) {
          socket.emit('redo_complete', { success: false, message: '没有可重做的操作' });
          return;
        }

        const lastUndo = roomState.redoStack.pop();

        switch (lastUndo.type) {
          case 'create':
            // 重做创建: 重新插入元素到数据库
            await roomManager.reinsertElement(lastUndo.element);
            roomState.elements.push(lastUndo.element);
            io.to(roomId).emit('undo_element_restored', { element: lastUndo.element });
            break;

          case 'delete':
            // 重做删除: 软删除元素
            await roomManager.deleteElement(lastUndo.element.id);
            roomState.elements = roomState.elements.filter(
              (e) => e.id !== lastUndo.element.id
            );
            io.to(roomId).emit('undo_element_deleted', { elementId: lastUndo.element.id });
            break;

          case 'update':
            // 重做更新: 应用新数据到数据库（仅白名单字段）
            const newDbData = pickElementFields(lastUndo.newData);
            if (newDbData && Object.keys(newDbData).length > 0) {
              await roomManager.updateElement(lastUndo.elementId, newDbData);
            }
            const idx = roomState.elements.findIndex(
              (e) => e.id === lastUndo.elementId
            );
            if (idx !== -1) {
              roomState.elements[idx] = deepCloneElement(lastUndo.newData);
              io.to(roomId).emit('undo_element_updated', {
                elementId: lastUndo.elementId,
                oldData: lastUndo.newData,
              });
            }
            break;
        }

        // 将重做的操作放回历史栈
        roomState.history.push(lastUndo);

        socket.emit('redo_complete', { success: true });
      } catch (err) {
        console.error('重做操作失败:', err);
        socket.emit('error', { message: '重做操作失败' });
      }
    });

    // ============================================================
    // 事件: save_snapshot - 保存快照
    // 数据: { roomId, name, userId }
    // ============================================================
    socket.on('save_snapshot', async (data) => {
      try {
        const { roomId, name, userId } = data;
        const roomState = roomManager.getRoomState(roomId);

        const snapshot = await roomManager.createSnapshot(
          roomId,
          name,
          JSON.stringify(roomState.elements),
          userId
        );

        socket.emit('snapshot_saved', { snapshot });
        io.to(roomId).emit('snapshot_created', {
          snapshot,
          userId: socket.id,
        });
      } catch (err) {
        console.error('保存快照失败:', err);
        socket.emit('error', { message: '保存快照失败' });
      }
    });

    // ============================================================
    // 事件: get_snapshots - 获取快照列表
    // 数据: { roomId }
    // ============================================================
    socket.on('get_snapshots', async (data) => {
      try {
        const { roomId } = data;
        const snapshots = await roomManager.getSnapshots(roomId);
        socket.emit('snapshots_list', { snapshots });
      } catch (err) {
        console.error('获取快照失败:', err);
        socket.emit('error', { message: '获取快照失败' });
      }
    });

    // ============================================================
    // 事件: load_snapshot - 加载快照
    // 数据: { roomId, snapshotData }
    // ============================================================
    socket.on('load_snapshot', (data) => {
      try {
        const { roomId, snapshotData } = data;
        const roomState = roomManager.getRoomState(roomId);

        // 解析快照数据 - 可能是字符串或对象
        let parsedElements;
        if (typeof snapshotData === 'string') {
          try {
            parsedElements = JSON.parse(snapshotData);
          } catch (parseErr) {
            console.error('解析快照数据失败:', parseErr);
            parsedElements = [];
          }
        } else if (Array.isArray(snapshotData)) {
          parsedElements = snapshotData;
        } else if (snapshotData && typeof snapshotData === 'object') {
          // 可能是 { elements: [...] } 格式
          parsedElements = snapshotData.elements || [];
        } else {
          parsedElements = [];
        }

        // 确保是数组
        if (!Array.isArray(parsedElements)) {
          parsedElements = [];
        }

        // 更新房间元素状态
        roomState.elements = parsedElements;

        // 清空历史和重做栈
        roomState.history = [];
        roomState.redoStack = [];

        console.log(`快照已加载: ${parsedElements.length} 个元素`);

        // 通知房间内所有用户
        io.to(roomId).emit('snapshot_loaded', {
          elements: roomState.elements,
        });
      } catch (err) {
        console.error('加载快照失败:', err);
        socket.emit('error', { message: '加载快照失败' });
      }
    });

    // ============================================================
    // 事件: cursor_position - 光标位置同步
    // 数据: { roomId, x, y }
    // ============================================================
    socket.on('cursor_position', (data) => {
      const { roomId, x, y } = data;
      const roomState = roomManager.getRoomState(roomId);
      const user = roomState.users.get(socket.id);

      if (!user) return;

      // 广播光标位置给其他用户
      socket.to(roomId).emit('cursor_update', {
        userId: socket.id,
        username: user.username,
        color: user.color,
        x,
        y,
      });
    });

    // ============================================================
    // 事件: leave_room - 离开房间
    // 数据: { roomId }
    // ============================================================
    socket.on('leave_room', (data) => {
      const { roomId } = data;
      handleUserLeave(socket, roomId);
    });

    // ============================================================
    // 事件: disconnect - 用户断开连接
    // ============================================================
    socket.on('disconnect', () => {
      console.log(`用户断开连接: ${socket.id}`);

      // 从所有房间中移除用户
      // 使用 roomManager 内部的房间状态
      const allRooms = roomManager.getAllRooms ? roomManager.getAllRooms() : [];
      for (const roomId of allRooms) {
        const roomState = roomManager.getRoomState(roomId);
        if (roomState.users.has(socket.id)) {
          handleUserLeave(socket, roomId);
        }
      }
    });
  });
};

/**
 * 处理用户离开房间
 * @param {Socket} socket - Socket实例
 * @param {string} roomId - 房间ID
 */
const handleUserLeave = (socket, roomId) => {
  const roomState = roomManager.getRoomState(roomId);
  const user = roomState.users.get(socket.id);

  if (user) {
    // 从房间中移除用户
    roomState.users.delete(socket.id);
    socket.leave(roomId);

    // 通知其他用户有人离开
    socket.to(roomId).emit('user_left', {
      userId: socket.id,
      username: user.username,
    });

    console.log(`用户 ${user.username} 离开房间 ${roomId}`);
  }
};

/**
 * 生成随机颜色（用于用户标识）
 * @returns {string} 十六进制颜色值
 */
const getRandomColor = () => {
  const colors = [
    '#2196F3', '#FF5722', '#4CAF50', '#9C27B0', '#FF9800',
    '#00BCD4', '#E91E63', '#795548', '#607D8B', '#3F51B5',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * 深拷贝一个元素对象，避免 points_data 等数组/对象字段共享引用
 * @param {object} element
 * @returns {object}
 */
const deepCloneElement = (element) => {
  if (!element) return element;
  const cloned = { ...element };
  if (Array.isArray(cloned.points_data)) {
    cloned.points_data = cloned.points_data.map((p) => ({ ...p }));
  }
  return cloned;
};

/**
 * 从完整元素对象中提取可写入 whiteboard_elements 表的白名单字段
 * 避免把 id / room_id / user_id / 元数据字段写回 UPDATE 导致异常
 * @param {object} data
 * @returns {object}
 */
const ELEMENT_DB_FIELDS = [
  'element_type',
  'stroke_color', 'stroke_width', 'fill_color', 'opacity',
  'is_visible', 'z_index', 'is_locked',
  'points_data',
  'start_x', 'start_y', 'width', 'height',
  'end_x', 'end_y',
  'text_content', 'font_family', 'font_size',
];
const pickElementFields = (data) => {
  if (!data) return {};
  const out = {};
  for (const key of ELEMENT_DB_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
      out[key] = data[key];
    }
  }
  return out;
};

module.exports = { setupSocketHandlers };
