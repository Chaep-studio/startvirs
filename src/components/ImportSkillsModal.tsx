import { useState, useRef, useCallback } from 'react';
import type { Skill } from '../types';
import { parseSkillsFromZip } from '../agent/importSkills';

interface Props {
  onImport: (skills: Omit<Skill, 'id'>[]) => void;
  onClose: () => void;
}

export default function ImportSkillsModal({ onImport, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Omit<Skill, 'id'>[] | null>(null);
  const [error, setError] = useState('');

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError('仅支持 .zip 格式的技能包');
      return;
    }
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const skills = await parseSkillsFromZip(buffer);
      setPreview(skills);
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center anim-fade">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 anim-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-stone-900">导入技能包</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100 transition">
            <iconify-icon icon="ph:x" style={{ fontSize: '20px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>

        {/* 上传区域 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
            dragOver ? 'border-stone-900 bg-stone-50' : 'border-stone-200 hover:border-stone-400'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            className="hidden"
          />
          <iconify-icon
            icon="ph:upload-simple"
            style={{ fontSize: '24px', color: dragOver ? '#1c1917' : '#d6d3d1', marginBottom: 8 }}
          ></iconify-icon>
          <p className="text-sm text-stone-600 font-medium">
            {dragOver ? '松开上传' : '点击或拖拽 ZIP 文件到此处'}
          </p>
          <p className="text-[11px] text-stone-400 mt-2 leading-relaxed">
            支持含 <code className="bg-stone-100 px-1 rounded text-[10px]">SKILL.md</code> + <code className="bg-stone-100 px-1 rounded text-[10px]">references/</code> + <code className="bg-stone-100 px-1 rounded text-[10px]">assets/</code> 的复杂技能包
          </p>
        </div>

        {error && (
          <div className="mt-4 bg-rose-50 border border-rose-100 rounded-xl p-3 text-[12px] text-rose-700 leading-relaxed whitespace-pre-wrap">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 py-4">
            <iconify-icon icon="ph:spinner" className="animate-spin" style={{ fontSize: '18px', color: '#a8a29e' }}></iconify-icon>
            <span className="text-sm text-stone-500">正在解析技能包...</span>
          </div>
        )}

        {/* 预览 */}
        {preview && preview.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-stone-500 mb-3">
              发现 {preview.length} 个技能，确认导入后将添加到你的技能列表中
            </p>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {preview.map((s, i) => (
                <div key={i} className="flex items-start gap-3 bg-stone-50 rounded-xl p-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: s.color + '15' }}>
                    <iconify-icon icon={s.icon} style={{ fontSize: '14px', color: s.color }}></iconify-icon>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-stone-800">{s.name}</span>
                      <span className="text-[10px] font-mono text-stone-400 bg-white px-1.5 py-0.5 rounded">{s.command}</span>
                    </div>
                    <p className="text-[12px] text-stone-500 truncate mt-0.5">{s.description}</p>
                    {/* 显示技能包文件信息 */}
                    {s.files && Object.keys(s.files).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(s.files).map(([fpath]) => {
                          const icon = fpath.startsWith('references')
                            ? 'ph:book-open-text'
                            : fpath.startsWith('assets')
                            ? 'ph:file-code'
                            : fpath.startsWith('agents')
                            ? 'ph:terminal'
                            : 'ph:file';
                          return (
                            <span key={fpath} className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded text-[10px] text-stone-400 font-mono">
                              <iconify-icon icon={icon} style={{ fontSize: '10px' }}></iconify-icon>
                              {fpath}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onImport(preview)}
                className="flex-1 py-3 rounded-xl bg-stone-900 text-white text-sm font-semibold active:bg-stone-800 transition"
              >
                导入 {preview.length} 个技能
              </button>
              <button onClick={onClose} className="px-5 py-3 rounded-xl bg-stone-100 text-stone-600 text-sm font-semibold hover:bg-stone-200 transition">
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
