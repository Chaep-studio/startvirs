/**
 * 数据库层 — SQLite
 * 使用 better-sqlite3 同步操作，简洁可靠
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'taskflow.db');

let db;

/**
 * 获取数据库实例（单例）
 */
function getDb() {
  if (!db) {
    // 确保 db 目录存在
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // 更好的并发性能
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

/**
 * 初始化表结构
 */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'done')),
      priority    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

/**
 * 关闭数据库连接
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };