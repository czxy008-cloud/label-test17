/**
 * 应用主组件
 * 包含路由和状态管理
 */

import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import HomePage from './pages/HomePage';
import WhiteboardPage from './pages/WhiteboardPage';
import './styles/App.css';

/**
 * App组件
 * 管理用户状态和页面切换
 */
function App() {
  // 用户状态
  const [user, setUser] = useState(null);
  // 当前房间状态
  const [currentRoom, setCurrentRoom] = useState(null);
  // 加载状态
  const [isLoading, setIsLoading] = useState(false);

  // 初始化用户（如果没有则创建匿名用户）
  useEffect(() => {
    const savedUser = localStorage.getItem('whiteboard_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      const newUser = {
        id: uuidv4(),
        username: `用户${Math.floor(Math.random() * 10000)}`,
        color: getRandomColor(),
      };
      localStorage.setItem('whiteboard_user', JSON.stringify(newUser));
      setUser(newUser);
    }
  }, []);

  // 检查URL参数，自动加入房间
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    if (roomCode && user && !currentRoom) {
      joinRoomByCode(roomCode);
    }
  }, [user, currentRoom]);

  /**
   * 通过邀请码加入房间
   * @param {string} inviteCode - 邀请码
   */
  const joinRoomByCode = async (inviteCode) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/rooms/${inviteCode}`);
      if (!response.ok) {
        throw new Error('房间不存在');
      }
      const room = await response.json();
      setCurrentRoom(room);
      // 清除URL中的room参数，避免刷新重复加入
      window.history.replaceState({}, document.title, '/');
    } catch (err) {
      console.error('加入房间失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 处理加入房间
   * @param {object} room - 房间信息
   */
  const handleJoinRoom = (room) => {
    setCurrentRoom(room);
  };

  /**
   * 处理离开房间
   */
  const handleLeaveRoom = () => {
    setCurrentRoom(null);
  };

  /**
   * 处理用户名称更新
   * @param {string} newName - 新用户名
   */
  const handleUpdateUsername = (newName) => {
    const updatedUser = { ...user, username: newName };
    localStorage.setItem('whiteboard_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  // 根据状态渲染不同页面
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">⏳</div>
        <p>正在加载...</p>
      </div>
    );
  }

  if (currentRoom) {
    return (
      <WhiteboardPage
        room={currentRoom}
        user={user}
        onLeave={handleLeaveRoom}
      />
    );
  }

  return (
    <HomePage
      user={user}
      onJoinRoom={handleJoinRoom}
      onUpdateUsername={handleUpdateUsername}
    />
  );
}

/**
 * 生成随机颜色
 * @returns {string} 十六进制颜色值
 */
function getRandomColor() {
  const colors = [
    '#2196F3', '#FF5722', '#4CAF50', '#9C27B0', '#FF9800',
    '#00BCD4', '#E91E63', '#795548', '#607D8B', '#3F51B5',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export default App;
