/**
 * 工具栏组件
 * 提供绘图工具选择、颜色调整等功能
 */

import React from 'react';

/**
 * 工具类型
 */
const TOOLS = [
  { id: 'freehand', icon: '✏️', name: '自由绘制' },
  { id: 'rectangle', icon: '⬜', name: '矩形' },
  { id: 'ellipse', icon: '⭕', name: '椭圆' },
  { id: 'line', icon: '📏', name: '直线' },
  { id: 'text', icon: '📝', name: '文字' },
  { id: 'select', icon: '👆', name: '选择' },
];

/**
 * 预设颜色
 */
const COLORS = [
  '#000000', '#FFFFFF', '#FF5722', '#FF9800', '#FFC107',
  '#4CAF50', '#2196F3', '#9C27B0', '#795548', '#607D8B',
  '#F44336', '#E91E63', '#3F51B5', '#00BCD4', '#8BC34A',
];

/**
 * 预设线条粗细
 */
const STROKE_WIDTHS = [1, 2, 3, 5, 8, 12];

/**
 * 预设字号
 */
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

/**
 * Toolbar组件
 */
function Toolbar({
  currentTool,
  onToolChange,
  strokeColor,
  onColorChange,
  strokeWidth,
  onWidthChange,
  fontSize,
  onFontSizeChange,
  onUndo,
  onRedo,
  onSaveSnapshot,
  onDelete,
  hasSelection,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <div className="toolbar-label">工具</div>
        <div className="tool-buttons">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              className={`tool-btn ${currentTool === tool.id ? 'active' : ''}`}
              onClick={() => onToolChange(tool.id)}
              title={tool.name}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        <div className="toolbar-label">颜色</div>
        <div className="color-picker">
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="color-input"
          />
          <div className="color-presets">
            {COLORS.map((color) => (
              <button
                key={color}
                className={`color-swatch ${strokeColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => onColorChange(color)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        <div className="toolbar-label">粗细</div>
        <div className="stroke-width-picker">
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              className={`stroke-width-btn ${strokeWidth === width ? 'active' : ''}`}
              onClick={() => onWidthChange(width)}
            >
              <div
                className="stroke-preview"
                style={{ height: `${width}px` }}
              />
              <span>{width}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-divider" />

      {currentTool === 'text' && (
        <>
          <div className="toolbar-section">
            <div className="toolbar-label">字号</div>
            <select
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="font-size-select"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-divider" />
        </>
      )}

      <div className="toolbar-section">
        <div className="toolbar-label">操作</div>
        <div className="action-buttons">
          <button className="action-btn" onClick={onUndo} title="撤销 (Ctrl+Z)">
            ↩️ 撤销
          </button>
          <button className="action-btn" onClick={onRedo} title="重做 (Ctrl+Y)">
            ↪️ 重做
          </button>
          <button className="action-btn" onClick={onSaveSnapshot} title="保存快照">
            📸 快照
          </button>
          {hasSelection && (
            <button
              className="action-btn delete-btn"
              onClick={onDelete}
              title="删除选中元素"
            >
              🗑️ 删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Toolbar;
