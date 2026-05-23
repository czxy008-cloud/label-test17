/**
 * 用户列表组件
 * 显示当前房间的所有在线用户
 */

import React from 'react';

/**
 * 用户列表组件
 */
function UserList({ users, currentUserId }) {
  return (
    <div className="user-list-panel">
      <div className="panel-header">
        <h3>👥 在线用户</h3>
        <span className="user-count">{users.length} 人</span>
      </div>

      <div className="user-list">
        {users.length === 0 ? (
          <div className="empty-state">
            <p>暂无用户</p>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className={`user-item ${user.id === currentUserId ? 'current' : ''}`}
            >
              <div
                className="user-avatar"
                style={{ backgroundColor: user.color || '#2196F3' }}
              >
                {user.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="user-info">
                <span className="user-name">
                  {user.username}
                  {user.id === currentUserId && (
                    <span className="you-label"> (你)</span>
                  )}
                </span>
              </div>
              <div className="user-status">
                <span className="status-dot online" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default UserList;
