-- ============================================================
-- 实时协作白板 - PostgreSQL 数据库初始化脚本
-- 版本: 1.0.0
-- 描述: 创建白板会话、元素、快照等核心表结构
-- ============================================================

-- ============================================================
-- 创建数据库（如不存在）
-- ============================================================
-- 注意: 需要在超级用户权限下执行以下命令
-- CREATE DATABASE whiteboard_db WITH ENCODING 'UTF8';

-- ============================================================
-- 创建扩展
-- ============================================================
-- pgcrypto 提供 gen_random_uuid() 函数用于生成UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 表: users - 用户表
-- 描述: 存储使用白板的用户信息
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 用户唯一标识
    username        VARCHAR(50) NOT NULL UNIQUE,                 -- 用户名（显示用）
    email           VARCHAR(100),                                -- 邮箱（可选）
    avatar_color    VARCHAR(20) DEFAULT '#2196F3',               -- 用户头像颜色
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),      -- 创建时间
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),      -- 更新时间
    last_login_at   TIMESTAMP WITH TIME ZONE                     -- 最后登录时间
);

-- ============================================================
-- 表: whiteboard_rooms - 白板房间表
-- 描述: 存储每个白板会话的元数据
-- ============================================================
CREATE TABLE IF NOT EXISTS whiteboard_rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 房间唯一标识
    name            VARCHAR(100) NOT NULL,                       -- 房间名称
    description     TEXT,                                        -- 房间描述
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL, -- 房间所有者
    invite_code     VARCHAR(20) UNIQUE NOT NULL,                 -- 邀请码（生成唯一链接用）
    is_private      BOOLEAN DEFAULT FALSE,                        -- 是否为私密房间
    password_hash   VARCHAR(255),                                 -- 房间密码（如有）
    current_snapshot_id UUID,                                    -- 当前快照ID
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),      -- 创建时间
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),      -- 更新时间
    expires_at      TIMESTAMP WITH TIME ZONE,                    -- 过期时间（可选）
    is_active       BOOLEAN DEFAULT TRUE                          -- 房间是否活跃
);

-- 为邀请码创建索引（加速查询）
CREATE INDEX IF NOT EXISTS idx_whiteboard_rooms_invite_code ON whiteboard_rooms(invite_code);
CREATE INDEX IF NOT EXISTS idx_whiteboard_rooms_owner_id ON whiteboard_rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_rooms_created_at ON whiteboard_rooms(created_at);

-- ============================================================
-- 表: whiteboard_elements - 白板元素表
-- 描述: 存储白板上的所有绘制元素（图形、文字、笔迹等）
-- ============================================================
CREATE TABLE IF NOT EXISTS whiteboard_elements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 元素唯一标识
    room_id         UUID NOT NULL REFERENCES whiteboard_rooms(id) ON DELETE CASCADE, -- 所属房间ID
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,                    -- 绘制用户ID
    element_type    VARCHAR(30) NOT NULL,                      -- 元素类型: freehand/rectangle/ellipse/line/text
    -- 通用属性
    stroke_color    VARCHAR(20) DEFAULT '#000000',             -- 描边颜色
    stroke_width    INTEGER DEFAULT 2,                          -- 描边粗细
    fill_color      VARCHAR(20),                                -- 填充颜色（可选）
    opacity         DECIMAL(3,2) DEFAULT 1.00,                  -- 不透明度
    is_visible      BOOLEAN DEFAULT TRUE,                       -- 是否可见（用于隐藏元素）
    z_index         INTEGER DEFAULT 0,                          -- 图层顺序（用于置顶、置底）
    is_locked       BOOLEAN DEFAULT FALSE,                      -- 是否锁定
    -- 自由笔迹专用: 存储笔迹点数据 JSON 数组
    points_data     JSONB,                                      -- 笔迹点坐标 [{x, y}]
    -- 图形专用: 矩形/椭圆
    start_x         DECIMAL(10,2),                              -- 起始X坐标
    start_y         DECIMAL(10,2),                              -- 起始Y坐标
    width           DECIMAL(10,2),                              -- 宽度
    height          DECIMAL(10,2),                              -- 高度
    -- 线段专用
    end_x           DECIMAL(10,2),                              -- 结束X坐标
    end_y           DECIMAL(10,2),                              -- 结束Y坐标
    -- 文字专用
    text_content    TEXT,                                        -- 文字内容
    font_family     VARCHAR(50) DEFAULT 'Arial',                -- 字体
    font_size       INTEGER DEFAULT 16,                          -- 字号
    -- 时间戳
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),     -- 创建时间
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),     -- 更新时间
    -- 软删除
    is_deleted      BOOLEAN DEFAULT FALSE,                       -- 是否删除
    deleted_at      TIMESTAMP WITH TIME ZONE                    -- 删除时间
);

-- 为房间ID创建索引（加速按房间查询元素）
CREATE INDEX IF NOT EXISTS idx_whiteboard_elements_room_id ON whiteboard_elements(room_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_elements_user_id ON whiteboard_elements(user_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_elements_z_index ON whiteboard_elements(room_id, z_index);
CREATE INDEX IF NOT EXISTS idx_whiteboard_elements_created_at ON whiteboard_elements(created_at);

-- ============================================================
-- 表: whiteboard_snapshots - 白板快照表
-- 描述: 存储白板的状态快照，用于历史回放
-- ============================================================
CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 快照唯一标识
    room_id         UUID NOT NULL REFERENCES whiteboard_rooms(id) ON DELETE CASCADE, -- 所属房间ID
    name            VARCHAR(100),                               -- 快照名称
    description     TEXT,                                        -- 快照描述
    snapshot_data   JSONB NOT NULL,                              -- 快照数据（所有元素的完整状态）
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL, -- 创建者ID
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()      -- 创建时间
);

-- 为房间ID创建索引
CREATE INDEX IF NOT EXISTS idx_whiteboard_snapshots_room_id ON whiteboard_snapshots(room_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_snapshots_created_at ON whiteboard_snapshots(created_at);

-- ============================================================
-- 表: whiteboard_history - 操作历史表
-- 描述: 记录每个操作，用于撤销/重做功能
-- ============================================================
CREATE TABLE IF NOT EXISTS whiteboard_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 历史记录唯一标识
    room_id         UUID NOT NULL REFERENCES whiteboard_rooms(id) ON DELETE CASCADE, -- 所属房间ID
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,                    -- 操作用户ID
    action_type     VARCHAR(30) NOT NULL,                      -- 操作类型: create/update/delete/move
    element_id      UUID,                                       -- 关联的元素ID
    old_data        JSONB,                                      -- 操作前的数据
    new_data        JSONB,                                      -- 操作后的数据
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()      -- 操作时间
);

-- 为房间ID创建索引（加速按房间查询历史）
CREATE INDEX IF NOT EXISTS idx_whiteboard_history_room_id ON whiteboard_history(room_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_history_created_at ON whiteboard_history(created_at);

-- ============================================================
-- 表: room_members - 房间成员表
-- 描述: 记录房间与成员的关联关系
-- ============================================================
CREATE TABLE IF NOT EXISTS room_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 记录唯一标识
    room_id         UUID NOT NULL REFERENCES whiteboard_rooms(id) ON DELETE CASCADE, -- 房间ID
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,            -- 用户ID
    role            VARCHAR(20) DEFAULT 'viewer',              -- 角色: owner/editor/viewer
    joined_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),    -- 加入时间
    last_active_at  TIMESTAMP WITH TIME ZONE,                   -- 最后活跃时间
    -- 复合唯一约束: 同一用户不能重复加入同一房间
    UNIQUE(room_id, user_id)
);

-- 为房间ID和用户ID创建索引
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);

-- ============================================================
-- 函数: update_updated_at_column()
-- 描述: 自动更新 updated_at 字段的触发器函数
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================
-- 触发器: 自动更新 updated_at 字段
-- ============================================================
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whiteboard_rooms_updated_at
    BEFORE UPDATE ON whiteboard_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whiteboard_elements_updated_at
    BEFORE UPDATE ON whiteboard_elements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 视图: v_active_rooms
-- 描述: 获取所有活跃房间的视图
-- ============================================================
CREATE OR REPLACE VIEW v_active_rooms AS
SELECT
    r.id,
    r.name,
    r.description,
    r.owner_id,
    r.invite_code,
    r.is_private,
    r.is_active,
    r.created_at,
    r.updated_at,
    u.username AS owner_name,
    (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS member_count
FROM whiteboard_rooms r
LEFT JOIN users u ON r.owner_id = u.id
WHERE r.is_active = TRUE;

-- ============================================================
-- 视图: v_room_elements
-- 描述: 获取房间所有可见元素的视图
-- ============================================================
CREATE OR REPLACE VIEW v_room_elements AS
SELECT
    e.id,
    e.room_id,
    e.user_id,
    e.element_type,
    e.stroke_color,
    e.stroke_width,
    e.fill_color,
    e.opacity,
    e.is_visible,
    e.z_index,
    e.is_locked,
    e.points_data,
    e.start_x,
    e.start_y,
    e.width,
    e.height,
    e.end_x,
    e.end_y,
    e.text_content,
    e.font_family,
    e.font_size,
    e.created_at,
    e.updated_at,
    u.username AS created_by,
    u.avatar_color AS user_color
FROM whiteboard_elements e
LEFT JOIN users u ON e.user_id = u.id
WHERE e.is_deleted = FALSE
ORDER BY e.z_index ASC, e.created_at ASC;

-- ============================================================
-- 示例数据（可选，用于测试）
-- ============================================================

-- 插入测试用户
-- INSERT INTO users (username, email, avatar_color) VALUES
--     ('demo_user', 'demo@example.com', '#2196F3'),
--     ('test_user', 'test@example.com', '#FF5722');

-- 插入测试房间
-- INSERT INTO whiteboard_rooms (name, description, owner_id, invite_code) VALUES
--     ('演示白板', '这是一个演示用的白板房间', 
--      (SELECT id FROM users WHERE username = 'demo_user'), 'DEMO123');

-- 插入测试成员
-- INSERT INTO room_members (room_id, user_id, role) VALUES
--     ((SELECT id FROM whiteboard_rooms WHERE invite_code = 'DEMO123'),
--      (SELECT id FROM users WHERE username = 'demo_user'), 'owner');

-- ============================================================
-- 查询示例
-- ============================================================

-- 1. 根据邀请码获取房间信息
-- SELECT * FROM v_active_rooms WHERE invite_code = 'DEMO123';

-- 2. 获取房间所有元素
-- SELECT * FROM v_room_elements WHERE room_id = '房间UUID';

-- 3. 获取房间操作历史
-- SELECT * FROM whiteboard_history WHERE room_id = '房间UUID' ORDER BY created_at DESC LIMIT 100;

-- 4. 获取房间所有快照
-- SELECT * FROM whiteboard_snapshots WHERE room_id = '房间UUID' ORDER BY created_at DESC;

-- 5. 获取用户加入的所有房间
-- SELECT r.* FROM whiteboard_rooms r
-- INNER JOIN room_members rm ON r.id = rm.room_id
-- WHERE rm.user_id = '用户UUID' AND r.is_active = TRUE;
