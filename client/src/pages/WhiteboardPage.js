/**
 * 白板页面组件
 * 包含画布、工具栏和图层管理
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  getSocket,
  joinRoom,
  leaveRoom,
  onSocketEvent,
  offSocketEvent,
  sendDrawStart,
  sendDraw,
  sendDrawEnd,
  sendUpdateElement,
  sendDeleteElement,
  sendUpdateZIndex,
  sendToggleVisibility,
  sendUndo,
  sendRedo,
  sendSaveSnapshot,
  sendGetSnapshots,
  sendLoadSnapshot,
  sendCursorPosition,
} from '../services/socket';

import Toolbar from '../components/Toolbar';
import WhiteboardCanvas from '../components/WhiteboardCanvas';
import LayerPanel from '../components/LayerPanel';
import UserList from '../components/UserList';
import HistoryPanel from '../components/HistoryPanel';

/**
 * 工具类型枚举
 */
const TOOLS = {
  FREEHAND: 'freehand',
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  LINE: 'line',
  TEXT: 'text',
  SELECT: 'select',
};

/**
 * WhiteboardPage组件
 * 管理白板状态和交互
 */
function WhiteboardPage({ room, user, onLeave }) {
  // 工具状态
  const [currentTool, setCurrentTool] = useState(TOOLS.FREEHAND);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fillColor, setFillColor] = useState('transparent');
  const [fontSize, setFontSize] = useState(16);

  // 画布状态
  const [elements, setElements] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [remoteElements, setRemoteElements] = useState({}); // 存储远程用户正在绘制的临时元素

  // 房间状态
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState({});
  const [snapshots, setSnapshots] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [showUsers, setShowUsers] = useState(true);

  // 邀请链接
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  // 引用
  const canvasRef = useRef(null);
  const hasJoinedRef = useRef(false);

  // 初始化邀请链接
  useEffect(() => {
    const link = `${window.location.origin}/?room=${room.invite_code}`;
    setInviteLink(link);
  }, [room.invite_code]);

  // 加入房间并设置Socket事件监听
  useEffect(() => {
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    const initRoom = async () => {
      try {
        const roomState = await joinRoom(room.id, user);

        if (roomState) {
          setElements(roomState.elements || []);
          setUsers(roomState.users || []);
        }
      } catch (err) {
        console.error('加入房间失败:', err);
      }
    };

    initRoom();

    // 注册Socket事件监听器
    setupSocketListeners();

    // 获取快照列表
    sendGetSnapshots(room.id);

    return () => {
      cleanupSocketListeners();
      leaveRoom(room.id);
    };
  }, [room.id, user]);

  /**
   * 设置Socket事件监听器
   */
  const setupSocketListeners = () => {
    // 元素相关事件
    onSocketEvent('element_created', handleElementCreated);
    onSocketEvent('element_updated', handleElementUpdated);
    onSocketEvent('element_deleted', handleElementDeleted);
    onSocketEvent('z_index_updated', handleZIndexUpdated);
    onSocketEvent('visibility_changed', handleVisibilityChanged);

    // 实时绘制事件
    onSocketEvent('draw_start', handleRemoteDrawStart);
    onSocketEvent('draw', handleRemoteDraw);

    // 撤销重做事件
    onSocketEvent('undo_element_deleted', handleUndoDelete);
    onSocketEvent('undo_element_restored', handleUndoRestore);
    onSocketEvent('undo_element_updated', handleUndoUpdate);

    // 快照事件
    onSocketEvent('snapshots_list', handleSnapshotsList);
    onSocketEvent('snapshot_loaded', handleSnapshotLoaded);

    // 用户相关事件
    onSocketEvent('user_joined', handleUserJoined);
    onSocketEvent('user_left', handleUserLeft);
    onSocketEvent('cursor_update', handleCursorUpdate);
  };

  /**
   * 清理Socket事件监听器
   */
  const cleanupSocketListeners = () => {
    offSocketEvent('element_created', handleElementCreated);
    offSocketEvent('element_updated', handleElementUpdated);
    offSocketEvent('element_deleted', handleElementDeleted);
    offSocketEvent('z_index_updated', handleZIndexUpdated);
    offSocketEvent('visibility_changed', handleVisibilityChanged);
    offSocketEvent('draw_start', handleRemoteDrawStart);
    offSocketEvent('draw', handleRemoteDraw);
    offSocketEvent('undo_element_deleted', handleUndoDelete);
    offSocketEvent('undo_element_restored', handleUndoRestore);
    offSocketEvent('undo_element_updated', handleUndoUpdate);
    offSocketEvent('snapshots_list', handleSnapshotsList);
    offSocketEvent('snapshot_loaded', handleSnapshotLoaded);
    offSocketEvent('user_joined', handleUserJoined);
    offSocketEvent('user_left', handleUserLeft);
    offSocketEvent('cursor_update', handleCursorUpdate);
  };

  // ============================================================
  // Socket事件处理函数
  // ============================================================

  const handleElementCreated = (data) => {
    setElements((prev) => [...prev, data.element]);
    // 清除对应的远程临时元素
    setRemoteElements((prev) => {
      const newRemote = { ...prev };
      delete newRemote[data.userId];
      return newRemote;
    });
  };

  const handleElementUpdated = (data) => {
    setElements((prev) =>
      prev.map((el) =>
        el.id === data.elementId ? { ...el, ...data.updates } : el
      )
    );
  };

  const handleElementDeleted = (data) => {
    setElements((prev) => prev.filter((el) => el.id !== data.elementId));
  };

  const handleZIndexUpdated = (data) => {
    setElements((prev) =>
      prev.map((el) =>
        el.id === data.elementId ? { ...el, z_index: data.newZIndex } : el
      )
    );
  };

  const handleVisibilityChanged = (data) => {
    setElements((prev) =>
      prev.map((el) =>
        el.id === data.elementId ? { ...el, is_visible: data.isVisible } : el
      )
    );
  };

  const handleRemoteDrawStart = (data) => {
    // 创建远程绘制的临时元素
    const remoteElement = {
      id: data.elementId || `remote_${data.userId}_${Date.now()}`,
      element_type: data.elementType,
      stroke_color: data.color || '#000000',
      stroke_width: data.strokeWidth || 2,
      fill_color: 'transparent',
      opacity: 0.5,
      is_visible: true,
      z_index: 9999,
      points_data: [],
      start_x: 0,
      start_y: 0,
      width: 0,
      height: 0,
      end_x: 0,
      end_y: 0,
    };
    setRemoteElements((prev) => ({
      ...prev,
      [data.userId]: remoteElement,
    }));
  };

  const handleRemoteDraw = (data) => {
    // 更新远程绘制的临时元素
    setRemoteElements((prev) => {
      const existing = prev[data.userId];
      if (!existing) return prev;

      let updated;
      if (data.element_type === 'freehand' && data.points) {
        updated = {
          ...existing,
          points_data: data.points,
        };
      } else {
        updated = {
          ...existing,
          ...data,
        };
      }

      return {
        ...prev,
        [data.userId]: updated,
      };
    });
  };

  const handleUndoDelete = (data) => {
    setElements((prev) => prev.filter((el) => el.id !== data.elementId));
  };

  const handleUndoRestore = (data) => {
    setElements((prev) => {
      if (prev.find((el) => el.id === data.element.id)) {
        return prev;
      }
      return [...prev, data.element];
    });
  };

  const handleUndoUpdate = (data) => {
    setElements((prev) =>
      prev.map((el) =>
        el.id === data.elementId ? { ...el, ...data.oldData } : el
      )
    );
  };

  const handleSnapshotsList = (data) => {
    setSnapshots(data.snapshots || []);
  };

  const handleSnapshotLoaded = (data) => {
    setElements(data.elements || []);
  };

  const handleUserJoined = (data) => {
    setUsers((prev) => {
      if (prev.find((u) => u.id === data.user.id)) {
        return prev;
      }
      return [...prev, data.user];
    });
  };

  const handleUserLeft = (data) => {
    setUsers((prev) => prev.filter((u) => u.id !== data.userId));
    setCursors((prev) => {
      const newCursors = { ...prev };
      delete newCursors[data.userId];
      return newCursors;
    });
  };

  const handleCursorUpdate = (data) => {
    setCursors((prev) => ({
      ...prev,
      [data.userId]: data,
    }));
  };

  // ============================================================
  // 绘制处理函数
  // ============================================================

  /**
   * 处理鼠标按下（开始绘制）
   */
  const handleMouseDown = (position) => {
    if (currentTool === TOOLS.SELECT) {
      return;
    }

    setIsDrawing(true);

    const newElement = {
      id: uuidv4(),
      element_type: currentTool,
      stroke_color: strokeColor,
      stroke_width: strokeWidth,
      fill_color: fillColor,
      opacity: 1,
      is_visible: true,
      z_index: elements.length,
      is_locked: false,
      start_x: position.x,
      start_y: position.y,
      ...(currentTool === TOOLS.FREEHAND
        ? { points_data: [position] }
        : {
            width: 0,
            height: 0,
            end_x: position.x,
            end_y: position.y,
          }),
      ...(currentTool === TOOLS.TEXT
        ? {
            text_content: '',
            font_family: 'Arial',
            font_size: fontSize,
          }
        : {}),
      user_id: user.id,
    };

    setCurrentElement(newElement);

    // 通知其他用户开始绘制
    sendDrawStart({
      roomId: room.id,
      elementType: currentTool,
      color: strokeColor,
      strokeWidth,
    });
  };

  /**
   * 处理鼠标移动（绘制过程）
   */
  const handleMouseMove = (position) => {
    // 发送光标位置
    sendCursorPosition({
      roomId: room.id,
      x: position.x,
      y: position.y,
    });

    if (!isDrawing || !currentElement) return;

    let updatedElement;

    switch (currentTool) {
      case TOOLS.FREEHAND:
        updatedElement = {
          ...currentElement,
          points_data: [...currentElement.points_data, position],
        };
        break;

      case TOOLS.RECTANGLE:
      case TOOLS.ELLIPSE:
        updatedElement = {
          ...currentElement,
          width: Math.abs(position.x - currentElement.start_x),
          height: Math.abs(position.y - currentElement.start_y),
          start_x: Math.min(position.x, currentElement.start_x),
          start_y: Math.min(position.y, currentElement.start_y),
        };
        break;

      case TOOLS.LINE:
        updatedElement = {
          ...currentElement,
          end_x: position.x,
          end_y: position.y,
        };
        break;

      default:
        updatedElement = currentElement;
    }

    setCurrentElement(updatedElement);

    // 实时发送绘制数据
    sendDraw({
      roomId: room.id,
      elementId: updatedElement.id,
      points: currentTool === TOOLS.FREEHAND ? updatedElement.points_data : null,
      ...updatedElement,
    });
  };

  /**
   * 处理鼠标松开（结束绘制）
   */
  const handleMouseUp = () => {
    if (!isDrawing || !currentElement) return;

    setIsDrawing(false);

    // 文字工具需要弹出输入框
    if (currentTool === TOOLS.TEXT) {
      const text = prompt('请输入文字内容:');
      if (text) {
        const textElement = { ...currentElement, text_content: text };
        setCurrentElement(textElement);
        sendDrawEnd({
          roomId: room.id,
          element: textElement,
          userId: user.id,
        });
      } else {
        setCurrentElement(null);
        return;
      }
    } else {
      // 保存元素并通知其他用户
      sendDrawEnd({
        roomId: room.id,
        element: currentElement,
        userId: user.id,
      });
    }

    setCurrentElement(null);
  };

  /**
   * 处理选择元素
   */
  const handleSelectElement = (elementId) => {
    setSelectedElementId(elementId);
  };

  /**
   * 处理删除选中元素
   */
  const handleDeleteSelected = () => {
    if (selectedElementId) {
      sendDeleteElement({
        roomId: room.id,
        elementId: selectedElementId,
      });
      setSelectedElementId(null);
    }
  };

  /**
   * 处理元素置顶
   */
  const handleBringToFront = (elementId) => {
    const maxZIndex = Math.max(...elements.map((e) => e.z_index || 0), 0);
    sendUpdateZIndex({
      roomId: room.id,
      elementId,
      newZIndex: maxZIndex + 1,
    });
  };

  /**
   * 处理元素置底
   */
  const handleSendToBack = (elementId) => {
    const minZIndex = Math.min(...elements.map((e) => e.z_index || 0), 0);
    sendUpdateZIndex({
      roomId: room.id,
      elementId,
      newZIndex: minZIndex - 1,
    });
  };

  /**
   * 处理切换元素可见性
   */
  const handleToggleVisibility = (elementId) => {
    const element = elements.find((e) => e.id === elementId);
    if (element) {
      sendToggleVisibility({
        roomId: room.id,
        elementId,
        isVisible: !element.is_visible,
      });
    }
  };

  /**
   * 处理撤销
   */
  const handleUndo = () => {
    sendUndo(room.id);
  };

  /**
   * 处理重做
   */
  const handleRedo = () => {
    sendRedo(room.id);
  };

  /**
   * 处理保存快照
   */
  const handleSaveSnapshot = () => {
    const name = prompt('请输入快照名称:', `快照 ${new Date().toLocaleString()}`);
    if (name) {
      sendSaveSnapshot({
        roomId: room.id,
        name,
        userId: user.id,
      });
      // 刷新快照列表
      setTimeout(() => sendGetSnapshots(room.id), 500);
    }
  };

  /**
   * 处理加载快照
   */
  const handleLoadSnapshot = (snapshot) => {
    if (confirm(`确定要加载快照 "${snapshot.name}" 吗？当前内容将被替换。`)) {
      // 确保 snapshot_data 是正确的格式
      let snapshotData = snapshot.snapshot_data;
      
      // 如果是字符串，尝试解析
      if (typeof snapshotData === 'string') {
        try {
          snapshotData = JSON.parse(snapshotData);
        } catch (e) {
          console.error('解析快照数据失败:', e);
          alert('快照数据格式错误');
          return;
        }
      }
      
      // 如果不是数组，尝试获取 elements 属性
      if (!Array.isArray(snapshotData)) {
        if (snapshotData && Array.isArray(snapshotData.elements)) {
          snapshotData = snapshotData.elements;
        } else {
          console.error('快照数据格式无效:', snapshotData);
          alert('快照数据格式无效');
          return;
        }
      }

      sendLoadSnapshot({
        roomId: room.id,
        snapshotData: snapshotData,
      });
    }
  };

  /**
   * 复制邀请链接
   */
  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  /**
   * 处理离开房间
   */
  const handleLeave = () => {
    if (confirm('确定要离开房间吗？')) {
      onLeave();
    }
  };

  return (
    <div className="whiteboard-container">
      <header className="whiteboard-header">
        <div className="header-left">
          <button className="back-btn" onClick={handleLeave}>
            ← 返回
          </button>
          <h2 className="room-name">{room.name}</h2>
        </div>

        <div className="header-center">
          <div className="invite-section">
            <span className="invite-label">邀请码:</span>
            <code className="invite-code">{room.invite_code}</code>
            <button
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyInviteLink}
            >
              {copied ? '✓ 已复制' : '📋 复制链接'}
            </button>
          </div>
        </div>

        <div className="header-right">
          <button
            className={`panel-toggle ${showUsers ? 'active' : ''}`}
            onClick={() => setShowUsers(!showUsers)}
          >
            👥 用户
          </button>
          <button
            className={`panel-toggle ${showLayers ? 'active' : ''}`}
            onClick={() => setShowLayers(!showLayers)}
          >
            📚 图层
          </button>
          <button
            className={`panel-toggle ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory(!showHistory)}
          >
            📜 历史
          </button>
        </div>
      </header>

      <Toolbar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        strokeColor={strokeColor}
        onColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onWidthChange={setStrokeWidth}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveSnapshot={handleSaveSnapshot}
        onDelete={handleDeleteSelected}
        hasSelection={!!selectedElementId}
      />

      <div className="whiteboard-main">
        <WhiteboardCanvas
          ref={canvasRef}
          elements={elements}
          currentElement={currentElement}
          remoteElements={Object.values(remoteElements)}
          cursors={cursors}
          currentTool={currentTool}
          selectedElementId={selectedElementId}
          onSelectElement={handleSelectElement}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />

        {showUsers && (
          <UserList users={users} currentUserId={getSocket().id} />
        )}

        {showLayers && (
          <LayerPanel
            elements={elements}
            selectedElementId={selectedElementId}
            onSelect={handleSelectElement}
            onBringToFront={handleBringToFront}
            onSendToBack={handleSendToBack}
            onToggleVisibility={handleToggleVisibility}
            onDelete={(id) =>
              sendDeleteElement({ roomId: room.id, elementId: id })
            }
          />
        )}

        {showHistory && (
          <HistoryPanel
            snapshots={snapshots}
            onLoadSnapshot={handleLoadSnapshot}
            onRefresh={() => sendGetSnapshots(room.id)}
          />
        )}
      </div>
    </div>
  );
}

export { TOOLS };
export default WhiteboardPage;
