/**
 * 任务数据模型
 * 封装对 tasks 表的所有 CRUD 操作
 */
const { getDb } = require('./database');

/**
 * 查询所有任务
 * @param {Object} filters - 过滤条件 { status?, keyword? }
 * @returns {Array}
 */
function findAll(filters = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.keyword) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }

  sql += ' ORDER BY priority DESC, created_at DESC';
  return db.prepare(sql).all(...params);
}

/**
 * 根据 ID 查询单个任务
 * @param {number} id
 * @returns {Object|undefined}
 */
function findById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

/**
 * 创建新任务
 * @param {Object} task - { title, description?, priority? }
 * @returns {Object} 创建后的完整任务
 */
function create(task) {
  const db = getDb();
  const { title, description = '', priority = 0, status = 'pending' } = task;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('任务标题不能为空');
  }

  const info = db.prepare(
    'INSERT INTO tasks (title, description, priority, status) VALUES (?, ?, ?, ?)'
  ).run(title.trim(), description.trim(), priority, status);

  return findById(info.lastInsertRowid);
}

/**
 * 更新任务
 * @param {number} id
 * @param {Object} fields - 要更新的字段
 * @returns {Object|undefined} 更新后的任务
 */
function update(id, fields) {
  const db = getDb();
  const allowed = ['title', 'description', 'status', 'priority'];
  const updates = [];
  const params = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }

  if (updates.length === 0) {
    return findById(id);
  }

  updates.push("updated_at = datetime('now', 'localtime')");
  params.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return findById(id);
}

/**
 * 删除任务
 * @param {number} id
 * @returns {boolean}
 */
function remove(id) {
  const db = getDb();
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return info.changes > 0;
}

module.exports = { findAll, findById, create, update, remove };