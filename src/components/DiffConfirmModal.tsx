import { useMemo } from 'react';
import { getLineDiff, summarizeDiff, type DiffLine } from '../utils';

interface Props {
  open: boolean;
  pending: {
    toolName: 'write_file' | 'edit_file';
    path: string;
    newContent: string;
    oldStr?: string;
    oldContent?: string;
  } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diff 确认弹窗
 * - write_file：双栏 [原文] vs [新内容]（行级 diff 配色）
 * - edit_file：单焦点 [old_str → new_str]（不读完整文件）
 */
export default function DiffConfirmModal({ open, pending, onConfirm, onCancel }: Props) {
  // 算 diff
  const { diff, summary } = useMemo(() => {
    if (!pending) return { diff: [] as DiffLine[], summary: { added: 0, removed: 0, addedBytes: 0, removedBytes: 0 } };
    let oldText: string;
    if (pending.toolName === 'edit_file') {
      // edit_file：old_str → new_str
      oldText = pending.oldStr || '';
    } else {
      // write_file：oldContent（可能为空 = 新建）→ newContent
      oldText = pending.oldContent || '';
    }
    const d = getLineDiff(oldText, pending.newContent);
    return { diff: d, summary: summarizeDiff(d) };
  }, [pending]);

  if (!open || !pending) return null;

  const isEdit = pending.toolName === 'edit_file';

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 anim-fade flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* 顶部 */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <iconify-icon icon={isEdit ? 'ph:pencil-line' : 'ph:file-plus'} style={{ fontSize: '18px', color: '#f59e0b' }}></iconify-icon>
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-bold text-stone-900">
                确认{isEdit ? '编辑' : '写入'}文件
              </h2>
              <p className="text-[10px] text-stone-500 truncate font-mono">{pending.path}</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-stone-100">
            <iconify-icon icon="ph:x" style={{ fontSize: '16px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>

        {/* 摘要 */}
        <div className="flex-shrink-0 px-5 py-2 bg-stone-50 border-b border-stone-100 flex items-center gap-3 text-[11px]">
          <span className="text-emerald-600 font-semibold font-mono">+{summary.added} 行 / +{summary.addedBytes} 字节</span>
          <span className="text-rose-600 font-semibold font-mono">-{summary.removed} 行 / -{summary.removedBytes} 字节</span>
          <span className="text-stone-400">·</span>
          <span className="text-stone-500">{isEdit ? 'edit_file 替换片段' : 'write_file 完整内容'}</span>
          {!isEdit && !pending.oldContent && (
            <span className="text-blue-600 font-semibold">· 新建文件</span>
          )}
        </div>

        {/* diff 内容 */}
        <div className="flex-1 overflow-auto bg-stone-900 font-mono text-[11px] leading-relaxed">
          {isEdit ? (
            // edit_file：单列显示 old → new 替换
            <div className="px-4 py-3 space-y-2">
              <div>
                <div className="text-[10px] font-bold text-rose-400 mb-1">− old_str</div>
                <pre className="bg-rose-950/40 text-rose-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{
                  pending.oldStr || '（空）'
                }</pre>
              </div>
              <div className="flex justify-center">
                <iconify-icon icon="ph:arrow-down" style={{ fontSize: '16px', color: '#78716c' }}></iconify-icon>
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-400 mb-1">+ new_str</div>
                <pre className="bg-emerald-950/40 text-emerald-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{
                  pending.newContent
                }</pre>
              </div>
            </div>
          ) : (
            // write_file：双栏 diff 视图
            <table className="w-full">
              <tbody>
                {diff.map((line, i) => (
                  <tr key={i} className={
                    line.op === 'add' ? 'bg-emerald-950/30' :
                    line.op === 'remove' ? 'bg-rose-950/30' :
                    'hover:bg-stone-800/30'
                  }>
                    <td className="px-2 py-0.5 text-stone-500 text-right w-10 select-none border-r border-stone-800">
                      {line.oldLine || ''}
                    </td>
                    <td className="px-2 py-0.5 text-stone-500 text-right w-10 select-none border-r border-stone-800">
                      {line.newLine || ''}
                    </td>
                    <td className="px-2 py-0.5 w-6 select-none text-stone-400">
                      {line.op === 'add' ? '+' : line.op === 'remove' ? '−' : ' '}
                    </td>
                    <td className={`px-2 py-0.5 whitespace-pre-wrap break-all ${
                      line.op === 'add' ? 'text-emerald-200' :
                      line.op === 'remove' ? 'text-rose-200' :
                      'text-stone-300'
                    }`}>
                      {line.text || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-stone-100 bg-stone-50/50 flex items-center justify-between gap-2">
          <div className="text-[10px] text-stone-400 flex items-center gap-1">
            <iconify-icon icon="ph:info" style={{ fontSize: '12px' }}></iconify-icon>
            本轮第一次写文件才弹；后续静默
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 transition"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white bg-stone-900 hover:bg-stone-800 transition flex items-center gap-1"
            >
              <iconify-icon icon="ph:check" style={{ fontSize: '13px' }}></iconify-icon>
              确认写入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
