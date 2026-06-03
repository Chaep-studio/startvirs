import type { Skill, Message, ApiConfig } from '../types';
import { load, save, generateId } from '../utils';
import { callApi } from './api';

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'office-hours',
    name: '办公室时间',
    icon: 'ph:coffee',
    color: '#f97316',
    description: '用强制性问题挑战你的产品想法，生成结构化设计文档',
    command: '/office-hours',
    paramsHint: '[项目名] [想法描述]',
    systemPrompt:
      '你是一个专业的创业辅助助手，基于YC的方法论帮助创始人思考和规划项目。保持直接、尖锐、不绕弯子的风格，就像真正的YC合伙人一样。用中文回复。',
    promptTemplate:
      '项目名称：{{input}}\n\n请直接生成一份完整的设计文档，包含：核心前提（3-5个）、实现方案（3个不同方案，含最小可行和理想架构，给出推荐）、下一步行动建议。用 Markdown 格式。',
  },
  {
    id: 'ceo-review',
    name: 'CEO 评审',
    icon: 'ph:crown',
    color: '#8b5cf6',
    description: '从战略高度重新思考问题，找到隐藏在需求中的10星产品',
    command: '/plan-ceo-review',
    paramsHint: '[项目名] [设计文档内容]',
    systemPrompt:
      '你是一个专业的CEO视角创业评审助手。保持直接、尖锐的风格。用中文回复。',
    promptTemplate:
      '对「{{input}}」进行CEO评审。\n\n请输出：核范围挑战、实现方案替代、模式特定分析、评审结论与下一步行动。',
  },
  {
    id: 'mvp-check',
    name: 'MVP 检查',
    icon: 'ph:rocket',
    color: '#10b981',
    description: '检查你的 MVP 是否足够小、足够验证核心价值',
    command: '/mvp-check',
    paramsHint: '[产品描述]',
    systemPrompt:
      '你是一个产品极简主义专家。你的任务是帮创始人把产品砍到最小可行版本。保持直接、尖锐的风格。用中文回复。',
    promptTemplate:
      '请对以下产品进行 MVP 检查：\n{{input}}\n\n请回答：\n1. 最核心的一个功能是什么？\n2. 哪些功能可以砍掉？\n3. 第一版最小到什么地步还能验证价值？\n4. 为什么用户会用这个简陋版？',
  },
  {
    id: 'pitch-polish',
    name: '路演打磨',
    icon: 'ph:microphone',
    color: '#ef4444',
    description: '打磨你的电梯演讲和投资路演话术',
    command: '/pitch',
    paramsHint: '[项目描述]',
    systemPrompt:
      '你是一个YC合伙人，专门帮创始人打磨路演 pitch。你知道投资人最关心什么，也知道什么 pitch 能打动人。用中文回复。',
    promptTemplate:
      '请帮我打磨以下项目的路演 pitch：\n{{input}}\n\n请输出：\n1. 一句话版本（30秒电梯演讲）\n2. 三句话版本（投资人会议开场）\n3. 一个让投资人无法拒绝的核心钩子\n4. 常见投资人反驳及应对话术',
  },
];

const STORAGE_KEY = 'startup_agent_skills';

export function loadSkills(): Skill[] {
  const saved = load<Skill[]>(STORAGE_KEY);
  if (saved && saved.length > 0) return saved;
  save(STORAGE_KEY, DEFAULT_SKILLS);
  return DEFAULT_SKILLS;
}

export function saveSkills(skills: Skill[]) {
  save(STORAGE_KEY, skills);
}

export function resetSkills(): Skill[] {
  save(STORAGE_KEY, DEFAULT_SKILLS);
  return [...DEFAULT_SKILLS];
}

export function addSkill(skills: Skill[], skill: Omit<Skill, 'id'>): Skill[] {
  const next = [...skills, { ...skill, id: generateId() }];
  saveSkills(next);
  return next;
}

export function updateSkill(skills: Skill[], updated: Skill): Skill[] {
  const next = skills.map((s) => (s.id === updated.id ? updated : s));
  saveSkills(next);
  return next;
}

export function deleteSkill(skills: Skill[], id: string): Skill[] {
  const next = skills.filter((s) => s.id !== id);
  saveSkills(next);
  return next;
}

export function matchSkill(skills: Skill[], text: string): { skill: Skill; input: string } | null {
  const trimmed = text.trim();
  for (const skill of skills) {
    if (trimmed.startsWith(skill.command)) {
      const input = trimmed.slice(skill.command.length).trim();
      return { skill, input };
    }
  }
  return null;
}

export function buildSkillSystemPrompt(skills: Skill[]): string {
  const skillList = skills.map((s) => `${s.command} — ${s.name}`).join('\n');
  return `你是YC创业助手。保持直接、尖锐的风格。

已加载技能：
${skillList}

如果用户需要特定帮助，建议他使用对应的命令。用中文回复。

【思考输出规范】
在回复之前，先用 <thinking>...</thinking> 标签输出你的思考过程（分析用户需求、推理步骤、考虑方案等），然后再输出最终回复。思考过程会展示给用户看。`;
}

/** 给技能的 systemPrompt 追加思考输出指令 */
export function appendThinkingInstruction(systemPrompt: string): string {
  return `${systemPrompt}

【思考输出规范】
在回复之前，先用 <thinking>...</thinking> 标签输出你的思考过程（分析需求、推理步骤、规划方案等），然后再输出最终结果。思考过程会展示给用户看。`;
}

export function createWelcomeMessages(skills: Skill[]): Message[] {
  const lines = skills.map((s, i) => `${i + 1}. **${s.command}** ${s.paramsHint} — ${s.name}`);
  return [
    {
      id: Date.now(),
      role: 'agent',
      type: 'text',
      text: `你好，我是你的 YC 创业助手。已加载 **${skills.length}** 个技能：\n\n${lines.join('\n')}\n\n直接输入命令，或描述你的想法开始。`,
      time: Date.now(),
    },
  ];
}

/** 从 AI 回复中分离"思考过程"和"最终输出"（仅识别 <thinking> 标签） */
export function extractThinking(text: string): { thinking?: string; content: string } {
  const tagMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (tagMatch) {
    return {
      thinking: tagMatch[1].trim(),
      content: text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim(),
    };
  }
  return { content: text };
}

export async function runSkill(
  skill: Skill,
  userInput: string,
  apiConfig: ApiConfig
): Promise<{ text?: string; task?: Message; thinking?: string }> {
  if (!userInput) {
    return {
      text: `用法：${skill.command} ${skill.paramsHint}\n\n${skill.description}`,
    };
  }

  const userPrompt = skill.promptTemplate.replace(/\{\{input\}\}/g, userInput);
  const text = await callApi(apiConfig, [
    { role: 'system', content: skill.systemPrompt },
    { role: 'user', content: userPrompt },
  ], 16384);

  // 提取思考和输出
  const { thinking, content } = extractThinking(text);

  return {
    thinking,
    task: {
      id: Date.now(),
      role: 'agent',
      type: 'task',
      title: `${skill.name} 已完成`,
      subtitle: userInput.slice(0, 30) + (userInput.length > 30 ? '...' : ''),
      status: 'done',
      icon: skill.icon,
      color: skill.color,
      expanded: true,
      content,
      time: Date.now(),
    },
  };
}