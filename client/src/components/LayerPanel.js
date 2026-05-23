/**
 * 图层面板组件
 * 显示和管理白板上的所有元素
 */

import React from 'react';

/**
 * 图层类型图标映射
 */
const ELEMENT_TYPE_ICONS = {
  freehand: '✏️',
  rectangle: '⬜',
  ellipse: '⭕',
  line: '📏',
  text: '📝',
};

/**
 * 图层面板组件
 */
function LayerPanel({
  elements,
  selectedElementId,
  onSelect,
  onBringToFront,
  onSendToBack,
  onToggleVisibility,
  onDelete,
}) {
  // 按图层顺序排序（从顶到底）
  const sortedElements = [...elements].sort((a, b) => {
    const zA = a.z_index || 0;
    const zB = b.z_index || 0;
    return zB - zA;
  });

  return (
    <div className="layer-panel">
      <div className="panel-header">
        <h3>📚 图层面板</h3>
        <span className="layer-count">{elements.length} 个元素</span>
      </div>

      <div className="layer-list">
        {sortedElements.length === 0 ? (
          <div className="empty-state">
            <p>暂无图层</p>
            <p className="empty-hint">开始绘制来添加元素</p>
          </div>
        ) : (
          sortedElements.map((element) => (
            <div
              key={element.id}
              className={`layer-item ${selectedElementId === element.id ? 'selected' : ''}`}
              onClick={() => onSelect(element.id)}
            >
              <div className="layer-info">
                <span className="layer-icon">
                  {ELEMENT_TYPE_ICONS[element.element_type] || '📦'}
                </span>
                <span className="layer-name">
                  {getElementName(element)}
                </span>
              </div>

              <div className="layer-actions">
                <button
                  className={`action-icon ${element.is_visible === false ? 'hidden' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(element.id);
                  }}
                  title={element.is_visible === false ? '显示' : '隐藏'}
                >
                  {element.is_visible === false ? '👁️‍🗨️' : '👁️'}
                </button>

                <button
                  className="action-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBringToFront(element.id);
                  }}
                  title="置顶"
                >
                  ⬆️
                </button>

                <button
                  className="action-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToBack(element.id);
                  }}
                  title="置底"
                >
                  ⬇️
                </button>

                <button
                  className="action-icon delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('确定要删除此元素吗？')) {
                      onDelete(element.id);
                    }
                  }}
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 获取元素显示名称
 */
function getElementName(element) {
  switch (element.element_type) {
    case 'text':
      return element.text_content
        ? element.text_content.substring(0, 15) +
            (element.text_content.length > 15 ? '...' : '')
        : '文字';
    case 'freehand':
      return '自由绘制';
    case 'rectangle':
      return '矩形';
    case 'ellipse':
      return '椭圆';
    case 'line':
      return '直线';
    default:
      return element.element_type;
  }
}

export default LayerPanel;
