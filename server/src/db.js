/**
 * 数据库连接配置
 * 使用pg库连接PostgreSQL数据库
 */

const { Pool } = require('pg');

/**
 * 数据库连接池配置
 * 从环境变量读取配置，提供默认值
 */
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'whiteboard_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * 测试数据库连接
 */
pool.connect((err, client, release) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    return;
  }
  console.log('✓ 数据库连接成功');
  release();
});

/**
 * 数据库查询封装
 * @param {string} text - SQL语句
 * @param {Array} params - 参数数组
 * @returns {Promise<object>} 查询结果
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`执行查询: ${text.substring(0, 50)}... - ${duration}ms - ${res.rowCount}行`);
    return res;
  } catch (err) {
    console.error('查询错误:', err.message);
    throw err;
  }
};

module.exports = {
  query,
  pool,
};
