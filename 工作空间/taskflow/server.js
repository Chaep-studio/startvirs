/**
 * TaskFlow 后端入口
 * Express.js + SQLite 全栈任务管理器
 */
const express = require('express');
const path = require('path');
const taskModel = require('./db/taskModel');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- 中间件 ----
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- API 路由 ----

// GET /api/tasks — 获取任务列表（支持过滤）
app.get('/api/tasks', (req, res) => {
  try {
    const { status, keyword } = req.query;
    const tasks = taskModel.findAll({ status, keyword });
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks/:id — 获取单个任务
app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = taskModel.findById(Number(req.params.id));
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks — 创建任务
app.post('/api/tasks', (req, res) => {
  try {
    const task = taskModel.create(req.body);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/tasks/:id — 更新任务
app.put('/api/tasks/:id', (req, res) => {
  try {
    const task = taskModel.update(Number(req.params.id), req.body);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id — 删除任务
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const ok = taskModel.remove(Number(req.params.id));
    if (!ok) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- SPA 降级路由 ----
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- 启动服务器 ----
app.listen(PORT, () => {
  console.log(`✅ TaskFlow 已启动 → http://localhost:${PORT}`);
});