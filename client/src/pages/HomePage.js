/**
 * 首页组件
 * 包含创建房间和加入房间功能
 */

import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

/**
 * HomePage组件
 * 提供创建房间、加入房间和修改用户名功能
 */
function HomePage({ user, onJoinRoom, onUpdateUsername }) {
  const [roomName, setRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * 创建新房间
   */
  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('请输入房间名称');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          userId: user.id,
          username: user.username,
        }),
      });

      if (!response.ok) {
        throw new Error('创建房间失败');
      }

      const room = await response.json();
      onJoinRoom(room);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 通过邀请码加入房间
   */
  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) {
      setError('请输入邀请码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/rooms/${inviteCode}`);

      if (!response.ok) {
        throw new Error('房间不存在');
      }

      const room = await response.json();
      onJoinRoom(room);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 保存用户名
   */
  const handleSaveUsername = () => {
    if (!newUsername.trim()) {
      setError('用户名不能为空');
      return;
    }
    onUpdateUsername(newUsername.trim());
    setEditingName(false);
  };

  /**
   * 复制邀请链接
   */
  const copyInviteLink = () => {
    const link = `${window.location.origin}/?room=${inviteCode}`;
    navigator.clipboard.writeText(link).then(() => {
      alert('邀请链接已复制到剪贴板');
    });
  };

  return (
    <div className="home-container">
      <div className="home-content">
        <header className="home-header">
          <h1>🎨 实时协作白板</h1>
          <p className="subtitle">支持多人实时绘制、图层管理和历史回放</p>
        </header>

        <div className="user-section">
          <div className="user-info">
            <div
              className="user-avatar"
              style={{ backgroundColor: user?.color || '#2196F3' }}
            >
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            {editingName ? (
              <div className="username-edit">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveUsername()}
                  autoFocus
                />
                <button onClick={handleSaveUsername}>保存</button>
                <button onClick={() => setEditingName(false)}>取消</button>
              </div>
            ) : (
              <div className="username-display">
                <span>{user?.username}</span>
                <button
                  className="edit-btn"
                  onClick={() => {
                    setNewUsername(user?.username);
                    setEditingName(true);
                  }}
                >
                  ✏️
                </button>
              </div>
            )}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="actions-container">
          <div className="action-card">
            <h2>创建新白板</h2>
            <p>创建一个新的协作白板房间</p>
            <div className="input-group">
              <input
                type="text"
                placeholder="输入房间名称"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
              />
            </div>
            <button
              className="primary-btn"
              onClick={handleCreateRoom}
              disabled={isLoading}
            >
              {isLoading ? '创建中...' : '🚀 创建房间'}
            </button>
          </div>

          <div className="divider">或</div>

          <div className="action-card">
            <h2>加入白板</h2>
            <p>通过邀请码加入已有的白板房间</p>
            <div className="input-group">
              <input
                type="text"
                placeholder="输入邀请码"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
            </div>
            <button
              className="secondary-btn"
              onClick={handleJoinByCode}
              disabled={isLoading}
            >
              {isLoading ? '加入中...' : '🎯 加入房间'}
            </button>
          </div>
        </div>

        <div className="features-section">
          <h3>✨ 功能特性</h3>
          <ul className="features-list">
            <li>🎨 支持自由绘制、图形和文字</li>
            <li>👥 多人实时协作</li>
            <li>📚 图层管理（置顶、隐藏、删除）</li>
            <li>↩️ 撤销与重做</li>
            <li>📸 快照保存与历史回放</li>
            <li>🎨 自定义颜色和粗细</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
