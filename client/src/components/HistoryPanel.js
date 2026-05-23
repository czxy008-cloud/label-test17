/**
 * 历史面板组件
 * 显示和管理白板快照
 */

import React from 'react';

/**
 * 历史面板组件
 */
function HistoryPanel({ snapshots, onLoadSnapshot, onRefresh }) {
  /**
   * 格式化时间
   */
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="history-panel">
      <div className="panel-header">
        <h3>📜 历史快照</h3>
        <button className="refresh-btn" onClick={onRefresh} title="刷新">
          🔄
        </button>
      </div>

      <div className="snapshot-list">
        {snapshots.length === 0 ? (
          <div className="empty-state">
            <p>暂无快照</p>
            <p className="empty-hint">点击工具栏的"快照"按钮保存</p>
          </div>
        ) : (
          snapshots.map((snapshot) => (
            <div key={snapshot.id} className="snapshot-item">
              <div className="snapshot-info">
                <div className="snapshot-name">{snapshot.name}</div>
                <div className="snapshot-meta">
                  <span className="snapshot-time">
                    🕐 {formatTime(snapshot.created_at)}
                  </span>
                  {snapshot.created_by_name && (
                    <span className="snapshot-author">
                      👤 {snapshot.created_by_name}
                    </span>
                  )}
                </div>
              </div>

              <button
                className="load-btn"
                onClick={() => onLoadSnapshot(snapshot)}
                title="加载此快照"
              >
                加载
              </button>
            </div>
          ))
        )}
      </div>

      <div className="history-tips">
        <h4>💡 提示</h4>
        <ul>
          <li>快照保存当前白板的完整状态</li>
          <li>可以随时加载之前的快照</li>
          <li>加载快照会替换当前内容</li>
        </ul>
      </div>
    </div>
  );
}

export default HistoryPanel;
