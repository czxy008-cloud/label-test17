/**
 * 白板画布组件
 * 负责渲染所有元素和处理绘制交互
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * 画布组件 - 使用Canvas渲染
 */
const WhiteboardCanvas = forwardRef(function WhiteboardCanvas(
  {
    elements,
    currentElement,
    remoteElements = [],
    cursors,
    currentTool,
    selectedElementId,
    onSelectElement,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

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
  }, [elements, currentElement, remoteElements, cursors, selectedElementId]);

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
        drawElement(ctx, element, element.id === selectedElementId);
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

    // 绘制选中边框
    if (isSelected) {
      drawSelectionBorder(ctx, element);
    }

    ctx.restore();
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
    if (element.width > 0 && element.height > 0) {
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
    if (element.width > 0 && element.height > 0) {
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
   * 获取元素边界框
   */
  const getElementBounds = (element) => {
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

      case 'text':
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

      default:
        return null;
    }
  };

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
   * 鼠标事件处理
   */
  const handleMouseDown = (e) => {
    const coords = getCanvasCoordinates(e);

    if (currentTool === 'select') {
      const elementId = hitTest(coords.x, coords.y);
      onSelectElement(elementId);
    } else {
      onMouseDown(coords);
    }
  };

  const handleMouseMove = (e) => {
    const coords = getCanvasCoordinates(e);
    onMouseMove(coords);
  };

  const handleMouseUp = () => {
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
