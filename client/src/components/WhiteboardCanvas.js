/**
 * 白板画布组件
 * 负责渲染所有元素和处理绘制交互
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * 八个调整手柄类型
 */
const HANDLE_TYPES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * 手柄对应的鼠标光标样式
 */
const HANDLE_CURSORS = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

/**
 * 根据拖拽偏移量计算元素移动后的更新字段
 */
const computeMoveUpdates = (element, dx, dy) => {
  const updates = {};
  switch (element.element_type) {
    case 'freehand':
      if (Array.isArray(element.points_data)) {
        updates.points_data = element.points_data.map((p) => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
      }
      break;
    case 'rectangle':
    case 'ellipse':
    case 'text':
      updates.start_x = (element.start_x || 0) + dx;
      updates.start_y = (element.start_y || 0) + dy;
      break;
    case 'line':
      updates.start_x = (element.start_x || 0) + dx;
      updates.start_y = (element.start_y || 0) + dy;
      updates.end_x = (element.end_x || 0) + dx;
      updates.end_y = (element.end_y || 0) + dy;
      break;
    default:
      break;
  }
  return updates;
};

/**
 * 根据新边界计算元素更新字段
 */
const computeUpdatesFromBounds = (element, newBounds) => {
  const updates = {
    start_x: newBounds.x,
    start_y: newBounds.y,
    width: newBounds.width,
    height: newBounds.height,
  };
  if (element.element_type === 'line') {
    updates.end_x = newBounds.x + newBounds.width;
    updates.end_y = newBounds.y + newBounds.height;
  } else if (element.element_type === 'text') {
    const originalBounds = getBoundsOfElement(element);
    if (originalBounds && originalBounds.width > 0) {
      const scale = newBounds.width / originalBounds.width;
      updates.font_size = Math.max(6, Math.round((element.font_size || 16) * scale));
    }
  }
  return updates;
};

/**
 * 获取元素边界（与 getElementBounds 等价，供 computeUpdatesFromBounds 使用）
 */
const getBoundsOfElement = (element) => {
  switch (element.element_type) {
    case 'freehand':
      if (!element.points_data || element.points_data.length === 0) return null;
      const xs = element.points_data.map((p) => p.x);
      const ys = element.points_data.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    case 'rectangle':
    case 'ellipse':
      return {
        x: element.start_x || 0,
        y: element.start_y || 0,
        width: element.width || 0,
        height: element.height || 0,
      };
    case 'line':
      return {
        x: Math.min(element.start_x || 0, element.end_x || 0),
        y: Math.min(element.start_y || 0, element.end_y || 0),
        width: Math.abs((element.end_x || 0) - (element.start_x || 0)),
        height: Math.abs((element.end_y || 0) - (element.start_y || 0)),
      };
    case 'text': {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.font = `${element.font_size || 16}px ${element.font_family || 'Arial'}`;
      const metrics = tempCtx.measureText(element.text_content || '');
      return {
        x: element.start_x || 0,
        y: element.start_y || 0,
        width: metrics.width,
        height: element.font_size || 16,
      };
    }
    default:
      return null;
  }
};

/**
 * 画布组件 - 使用Canvas渲染
 */
const WhiteboardCanvas = forwardRef(function WhiteboardCanvas(
  {
    elements,
    currentElement,
    remoteElements = [],
    remoteResizingMap = {},
    remoteMovingMap = {},
    cursors,
    currentTool,
    selectedElementId,
    onSelectElement,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onResizeStart,
    onResizeUpdate,
    onResizeEnd,
    onMoveStart,
    onMoveUpdate,
    onMoveEnd,
  },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // 尺寸调整拖拽状态
  const resizeStateRef = useRef({
    active: false,
    started: false,
    handle: null,
    element: null,
    originalBounds: null,
    startMouse: null,
    lastUpdates: null,
  });

  // 移动拖拽状态
  const moveStateRef = useRef({
    active: false,
    started: false,
    element: null,
    startMouse: null,
    lastUpdates: null,
  });

  // 暴露画布引用给父组件
  useImperativeHandle(ref, () => ({
    getContext: () => canvasRef.current?.getContext('2d'),
    getCanvas: () => canvasRef.current,
  }));

  // 调整画布大小
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        render();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 当元素变化时重绘
  useEffect(() => {
    render();
  }, [elements, currentElement, remoteElements, remoteResizingMap, remoteMovingMap, cursors, selectedElementId]);

  /**
   * 渲染画布
   */
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制网格背景
    drawGrid(ctx, canvas.width, canvas.height);

    // 按图层顺序排序并绘制元素
    const sortedElements = [...elements].sort((a, b) => {
      const zA = a.z_index || 0;
      const zB = b.z_index || 0;
      return zA - zB;
    });

    // 绘制所有元素
    sortedElements.forEach((element) => {
      if (element.is_visible !== false) {
        let drawEl = element;
        let overrideAlpha = null;
        // 若正在被其他用户调整尺寸，使用预览数据
        if (remoteResizingMap[element.id]) {
          drawEl = { ...element, ...remoteResizingMap[element.id] };
          overrideAlpha = 0.6;
        }
        // 若正在被其他用户移动，使用移动预览数据
        if (remoteMovingMap[element.id]) {
          drawEl = { ...element, ...remoteMovingMap[element.id] };
          overrideAlpha = 0.6;
        }
        // 本地正在拖拽移动时的半透明预览
        if (moveStateRef.current.active && moveStateRef.current.element.id === element.id && moveStateRef.current.lastUpdates) {
          drawEl = { ...element, ...moveStateRef.current.lastUpdates };
          overrideAlpha = 0.6;
        }
        if (overrideAlpha !== null) {
          drawEl = { ...drawEl, opacity: overrideAlpha };
        }
        drawElement(ctx, drawEl, element.id === selectedElementId);
      }
    });

    // 绘制当前正在绘制的元素
    if (currentElement) {
      drawElement(ctx, currentElement, false);
    }

    // 绘制远程用户正在绘制的临时元素
    remoteElements.forEach((element) => {
      if (element && element.element_type) {
        drawElement(ctx, element, false);
      }
    });

    // 绘制远程用户光标
    drawCursors(ctx, cursors);
  };

  /**
   * 绘制网格背景
   */
  const drawGrid = (ctx, width, height) => {
    const gridSize = 20;
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  /**
   * 绘制单个元素
   */
  const drawElement = (ctx, element, isSelected) => {
    ctx.save();

    // 设置样式
    ctx.strokeStyle = element.stroke_color || '#000000';
    ctx.lineWidth = element.stroke_width || 2;
    ctx.fillStyle = element.fill_color || 'transparent';
    ctx.globalAlpha = element.opacity || 1;

    switch (element.element_type) {
      case 'freehand':
        drawFreehand(ctx, element);
        break;
      case 'rectangle':
        drawRectangle(ctx, element);
        break;
      case 'ellipse':
        drawEllipse(ctx, element);
        break;
      case 'line':
        drawLine(ctx, element);
        break;
      case 'text':
        drawText(ctx, element);
        break;
    }

    // 绘制选中边框与尺寸手柄
    if (isSelected) {
      drawSelectionBorder(ctx, element);
      if (canResize(element)) {
        drawResizeHandles(ctx, element);
      }
    }

    ctx.restore();
  };

  /**
   * 判断元素是否支持尺寸调整
   */
  const canResize = (element) => {
    if (!element) return false;
    return (
      element.element_type === 'rectangle' ||
      element.element_type === 'ellipse' ||
      element.element_type === 'line' ||
      element.element_type === 'text'
    );
  };

  /**
   * 绘制自由笔迹
   */
  const drawFreehand = (ctx, element) => {
    if (!element.points_data || element.points_data.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(element.points_data[0].x, element.points_data[0].y);

    for (let i = 1; i < element.points_data.length; i++) {
      ctx.lineTo(element.points_data[i].x, element.points_data[i].y);
    }

    ctx.stroke();
  };

  /**
   * 绘制矩形
   */
  const drawRectangle = (ctx, element) => {
    if ((element.width || 0) > 0 && (element.height || 0) > 0) {
      ctx.beginPath();
      ctx.rect(
        element.start_x || 0,
        element.start_y || 0,
        element.width || 0,
        element.height || 0
      );

      if (element.fill_color && element.fill_color !== 'transparent') {
        ctx.fill();
      }
      ctx.stroke();
    }
  };

  /**
   * 绘制椭圆
   */
  const drawEllipse = (ctx, element) => {
    if ((element.width || 0) > 0 && (element.height || 0) > 0) {
      const centerX = (element.start_x || 0) + (element.width || 0) / 2;
      const centerY = (element.start_y || 0) + (element.height || 0) / 2;
      const radiusX = (element.width || 0) / 2;
      const radiusY = (element.height || 0) / 2;

      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);

      if (element.fill_color && element.fill_color !== 'transparent') {
        ctx.fill();
      }
      ctx.stroke();
    }
  };

  /**
   * 绘制直线
   */
  const drawLine = (ctx, element) => {
    ctx.beginPath();
    ctx.moveTo(element.start_x || 0, element.start_y || 0);
    ctx.lineTo(element.end_x || 0, element.end_y || 0);
    ctx.stroke();
  };

  /**
   * 绘制文字
   */
  const drawText = (ctx, element) => {
    if (!element.text_content) return;

    ctx.font = `${element.font_size || 16}px ${element.font_family || 'Arial'}`;
    ctx.fillStyle = element.stroke_color || '#000000';
    ctx.textBaseline = 'top';
    ctx.fillText(
      element.text_content,
      element.start_x || 0,
      element.start_y || 0
    );
  };

  /**
   * 绘制选中边框
   */
  const drawSelectionBorder = (ctx, element) => {
    const bounds = getElementBounds(element);
    if (!bounds) return;

    ctx.save();
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(
      bounds.x - 5,
      bounds.y - 5,
      bounds.width + 10,
      bounds.height + 10
    );
    ctx.setLineDash([]);
    ctx.restore();
  };

  /**
   * 绘制八个尺寸调整手柄
   */
  const drawResizeHandles = (ctx, element) => {
    const bounds = getElementBounds(element);
    if (!bounds) return;

    const handles = getHandlePositions(bounds);
    const size = 8;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 1.5;

    HANDLE_TYPES.forEach((type) => {
      const pos = handles[type];
      ctx.beginPath();
      ctx.rect(pos.x - size / 2, pos.y - size / 2, size, size);
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  };

  /**
   * 获取8个手柄位置坐标
   */
  const getHandlePositions = (bounds) => {
    const { x, y, width, height } = bounds;
    return {
      nw: { x: x, y: y },
      n: { x: x + width / 2, y: y },
      ne: { x: x + width, y: y },
      e: { x: x + width, y: y + height / 2 },
      se: { x: x + width, y: y + height },
      s: { x: x + width / 2, y: y + height },
      sw: { x: x, y: y + height },
      w: { x: x, y: y + height / 2 },
    };
  };

  /**
   * 命中测试：获取命中的手柄类型
   */
  const hitTestHandle = (x, y, element) => {
    if (!canResize(element)) return null;
    const bounds = getElementBounds(element);
    if (!bounds) return null;

    const handles = getHandlePositions(bounds);
    const threshold = 8;

    for (const type of HANDLE_TYPES) {
      const pos = handles[type];
      if (
        x >= pos.x - threshold &&
        x <= pos.x + threshold &&
        y >= pos.y - threshold &&
        y <= pos.y + threshold
      ) {
        return type;
      }
    }
    return null;
  };

  /**
   * 获取元素边界框
   */
  const getElementBounds = (element) => getBoundsOfElement(element);

  /**
   * 绘制远程用户光标
   */
  const drawCursors = (ctx, cursors) => {
    Object.values(cursors).forEach((cursor) => {
      ctx.save();

      // 绘制光标
      ctx.fillStyle = cursor.color || '#FF5722';
      ctx.beginPath();
      ctx.moveTo(cursor.x, cursor.y);
      ctx.lineTo(cursor.x + 12, cursor.y + 4);
      ctx.lineTo(cursor.x + 8, cursor.y + 8);
      ctx.lineTo(cursor.x + 4, cursor.y + 12);
      ctx.closePath();
      ctx.fill();

      // 绘制用户名标签
      if (cursor.username) {
        ctx.font = '12px Arial';
        ctx.fillStyle = cursor.color || '#FF5722';
        ctx.fillText(cursor.username, cursor.x + 12, cursor.y + 20);
      }

      ctx.restore();
    });
  };

  /**
   * 获取鼠标在画布上的坐标
   */
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  /**
   * 检测点击是否在某个元素上
   */
  const hitTest = (x, y) => {
    const sortedElements = [...elements].sort((a, b) => {
      const zA = a.z_index || 0;
      const zB = b.z_index || 0;
      return zB - zA;
    });

    for (const element of sortedElements) {
      if (element.is_visible === false) continue;

      const bounds = getElementBounds(element);
      if (!bounds) continue;

      const padding = 5;
      if (
        x >= bounds.x - padding &&
        x <= bounds.x + bounds.width + padding &&
        y >= bounds.y - padding &&
        y <= bounds.y + bounds.height + padding
      ) {
        return element.id;
      }
    }

    return null;
  };

  /**
   * 根据当前鼠标位置计算新边界
   */
  const computeNewBounds = (handle, originalBounds, newPos) => {
    const MIN_SIZE = 5;
    const { x: ox, y: oy, width: ow, height: oh } = originalBounds;
    let x = ox;
    let y = oy;
    let width = ow;
    let height = oh;

    if (handle.includes('e')) {
      width = Math.max(MIN_SIZE, newPos.x - ox);
    }
    if (handle.includes('s')) {
      height = Math.max(MIN_SIZE, newPos.y - oy);
    }
    if (handle.includes('w')) {
      const right = ox + ow;
      x = Math.min(newPos.x, right - MIN_SIZE);
      width = Math.max(MIN_SIZE, right - x);
    }
    if (handle.includes('n')) {
      const bottom = oy + oh;
      y = Math.min(newPos.y, bottom - MIN_SIZE);
      height = Math.max(MIN_SIZE, bottom - y);
    }

    // 角手柄：等比例缩放
    if (handle.length === 2) {
      const aspect = ow / oh;
      let newWidth = width;
      let newHeight = height;
      // 根据鼠标位移选择较大的变化作为主方向，按比例计算另一个方向
      if ((newWidth - ow) / ow > (newHeight - oh) / oh) {
        // 以宽度为主
        newHeight = newWidth / aspect;
      } else {
        // 以高度为主
        newWidth = newHeight * aspect;
      }
      width = Math.max(MIN_SIZE, newWidth);
      height = Math.max(MIN_SIZE, newHeight);

      if (handle.includes('w')) {
        x = ox + ow - width;
      }
      if (handle.includes('n')) {
        y = oy + oh - height;
      }
    }

    return { x, y, width, height };
  };

  /**
   * 鼠标事件处理
   */
  const handleMouseDown = (e) => {
    const coords = getCanvasCoordinates(e);

    if (currentTool === 'select' && selectedElementId) {
      const selectedElement = elements.find((el) => el.id === selectedElementId);
      if (selectedElement) {
        const handle = hitTestHandle(coords.x, coords.y, selectedElement);
        if (handle) {
          const originalBounds = getElementBounds(selectedElement);
          resizeStateRef.current = {
            active: true,
            started: false,
            handle,
            element: selectedElement,
            originalBounds,
            startMouse: { ...coords },
            lastUpdates: null,
          };
          return;
        }
        // 未命中调整手柄但命中元素内部 -> 准备移动（实际发送 move_start 延后至首次拖拽）
        const bounds = getElementBounds(selectedElement);
        if (bounds) {
          const padding = 5;
          if (
            coords.x >= bounds.x - padding &&
            coords.x <= bounds.x + bounds.width + padding &&
            coords.y >= bounds.y - padding &&
            coords.y <= bounds.y + bounds.height + padding
          ) {
            moveStateRef.current = {
              active: true,
              started: false,
              element: selectedElement,
              startMouse: { ...coords },
              lastUpdates: null,
            };
            return;
          }
        }
      }
    }

    if (currentTool === 'select') {
      const elementId = hitTest(coords.x, coords.y);
      onSelectElement(elementId);
    } else {
      onMouseDown(coords);
    }
  };

  const handleMouseMove = (e) => {
    const coords = getCanvasCoordinates(e);

    // 更新光标样式
    const canvas = canvasRef.current;
    if (canvas) {
      let cursor = 'default';
      if (currentTool === 'select' && selectedElementId) {
        const selectedElement = elements.find((el) => el.id === selectedElementId);
        if (selectedElement) {
          const handle = hitTestHandle(coords.x, coords.y, selectedElement);
          if (handle) {
            cursor = HANDLE_CURSORS[handle];
          } else {
            const bounds = getElementBounds(selectedElement);
            if (bounds) {
              const padding = 5;
              if (
                coords.x >= bounds.x - padding &&
                coords.x <= bounds.x + bounds.width + padding &&
                coords.y >= bounds.y - padding &&
                coords.y <= bounds.y + bounds.height + padding
              ) {
                cursor = 'move';
              }
            }
          }
        }
      } else if (currentTool !== 'select') {
        cursor = 'crosshair';
      }
      if (resizeStateRef.current.active) {
        cursor = HANDLE_CURSORS[resizeStateRef.current.handle] || 'default';
      }
      if (moveStateRef.current.active) {
        cursor = 'move';
      }
      canvas.style.cursor = cursor;
    }

    // 尺寸调整拖拽中
    if (resizeStateRef.current.active) {
      const { handle, element, originalBounds } = resizeStateRef.current;
      const newBounds = computeNewBounds(handle, originalBounds, coords);
      const updates = computeUpdatesFromBounds(element, newBounds);
      resizeStateRef.current.lastUpdates = updates;
      // 首次产生实际变化时才发送 resize_start，避免点击后未拖拽导致协作端残留预览
      if (!resizeStateRef.current.started) {
        resizeStateRef.current.started = true;
        if (onResizeStart) {
          onResizeStart({
            elementId: element.id,
            handle,
            bounds: originalBounds,
          });
        }
      }
      if (onResizeUpdate) {
        onResizeUpdate({
          elementId: element.id,
          handle,
          bounds: newBounds,
          updates,
        });
      }
      return;
    }

    // 移动拖拽中
    if (moveStateRef.current.active) {
      const { element, startMouse } = moveStateRef.current;
      const dx = coords.x - startMouse.x;
      const dy = coords.y - startMouse.y;
      const updates = computeMoveUpdates(element, dx, dy);
      moveStateRef.current.lastUpdates = updates;
      // 首次产生实际变化时才发送 move_start，避免点击后未移动导致协作端残留预览
      if (!moveStateRef.current.started) {
        moveStateRef.current.started = true;
        const bounds = getElementBounds(element);
        if (onMoveStart) {
          onMoveStart({
            elementId: element.id,
            bounds,
          });
        }
      }
      if (onMoveUpdate) {
        onMoveUpdate({
          elementId: element.id,
          delta: { dx, dy },
          updates,
        });
      }
      // 触发重绘以显示本地半透明预览
      render();
      return;
    }

    onMouseMove(coords);
  };

  const handleMouseUp = () => {
    if (resizeStateRef.current.active) {
      const { element, lastUpdates, originalBounds, started } = resizeStateRef.current;
      resizeStateRef.current = {
        active: false,
        started: false,
        handle: null,
        element: null,
        originalBounds: null,
        startMouse: null,
        lastUpdates: null,
      };
      // 仅在实际产生过拖拽时才发送 resize_end
      if (started && onResizeEnd) {
        const updates = lastUpdates || computeUpdatesFromBounds(element, originalBounds);
        onResizeEnd({
          elementId: element.id,
          updates,
        });
      }
      return;
    }

    if (moveStateRef.current.active) {
      const { element, lastUpdates, started } = moveStateRef.current;
      moveStateRef.current = {
        active: false,
        started: false,
        element: null,
        startMouse: null,
        lastUpdates: null,
      };
      // 仅在实际产生过移动时才发送 move_end
      if (started && onMoveEnd) {
        const updates = lastUpdates || {};
        onMoveEnd({
          elementId: element.id,
          updates,
        });
      }
      return;
    }

    onMouseUp();
  };

  /**
   * 键盘事件处理
   */
  const handleKeyDown = (e) => {
    // 可以添加快捷键支持
    if (e.key === 'Delete' && selectedElementId) {
      // 删除选中元素
    }
  };

  return (
    <div className="canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      />
    </div>
  );
});

export default WhiteboardCanvas;
