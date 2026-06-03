interface Props {
  html: string;
  title?: string;
  onClose: () => void;
}

export default function HtmlPreview({ html: rawHtml, title, onClose }: Props) {
  const html = extractHtml(rawHtml);
  const download = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'preview'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col anim-fade bg-white">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-stone-100">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100 transition"
          >
            <iconify-icon icon="ph:x" style={{ fontSize: '20px', color: '#78716c' }}></iconify-icon>
          </button>
          <h2 className="text-sm font-bold text-stone-900 truncate">{title || 'HTML 预览'}</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.open('', '_blank')?.document.write(html); }}
            className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 text-xs font-semibold hover:bg-stone-200 transition flex items-center gap-1"
          >
            <iconify-icon icon="ph:arrow-square-out" style={{ fontSize: '12px' }}></iconify-icon>
            新窗口
          </a>
          <button
            onClick={download}
            className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition flex items-center gap-1"
          >
            <iconify-icon icon="ph:download" style={{ fontSize: '12px' }}></iconify-icon>
            下载
          </button>
        </div>
      </div>

      {/* 预览区域：移动端竖屏模拟 */}
      <div className="flex-1 bg-stone-900 overflow-hidden flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] h-full max-h-[820px] rounded-2xl overflow-hidden shadow-2xl bg-white">
          <iframe
            srcDoc={html}
            title={title || 'preview'}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
          />
        </div>
      </div>

      {/* 底部脚标 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-t border-stone-100 text-center">
        <span className="text-[10px] text-stone-400">竖屏 9:16 模拟预览 · 新窗口打开可查看完整效果</span>
      </div>
    </div>
  );
}

/** 判断文本是否为 HTML 内容 */
export function isHtmlContent(text: string): boolean {
  if (!text || text.length < 50) return false;
  const trimmed = text.trim();

  // 1. 以 HTML 文档结构开头
  if (/^<(?:!DOCTYPE\s+html|html)/i.test(trimmed)) return true;

  // 2. 查找 ```html ... ``` 代码块，检查内部是否为 HTML
  const htmlBlock = trimmed.match(/```html\s*\n?([\s\S]*?)```/i);
  if (htmlBlock) {
    const inner = htmlBlock[1].trim();
    if (/^<(?:!DOCTYPE\s+html|html)/i.test(inner)) return true;
  }

  // 3. 查找未标注语言的 ```...``` 代码块，检查内部是否有完整 HTML 结构
  const codeBlock = trimmed.match(/```\s*\n?([\s\S]*?)```/);
  if (codeBlock) {
    const inner = codeBlock[1].trim();
    if (inner.includes('<html') && inner.includes('</html>') && inner.includes('</body>')) return true;
  }

  // 4. 全文包含完整的 HTML 文档标记（非代码块中的误判概率极低）
  if (text.includes('<!DOCTYPE html>') || text.includes('<!doctype html>')) return true;
  if (text.includes('<html') && text.includes('</html>') && text.includes('</body>')) return true;

  return false;
}

/** 从文本中提取纯 HTML 内容（去掉 Markdown 代码块包裹和前面说明文字） */
export function extractHtml(text: string): string {
  const trimmed = text.trim();

  // 直接就是 HTML
  if (/^<(?:!DOCTYPE\s+html|html)/i.test(trimmed)) return trimmed;

  // 从 ```html ... ``` 代码块提取
  const htmlBlock = trimmed.match(/```html\s*\n?([\s\S]*?)```/i);
  if (htmlBlock) return htmlBlock[1].trim();

  // 从普通 ``` ... ``` 代码块提取
  const codeBlock = trimmed.match(/```\s*\n?([\s\S]*?)```/);
  if (codeBlock) {
    const inner = codeBlock[1].trim();
    if (/^<(?:!DOCTYPE\s+html|html)/i.test(inner)) return inner;
  }

  // 全文搜索第一个 <!DOCTYPE 或 <html 标签，截取到文档结束
  const htmlStart = trimmed.search(/<(?:!DOCTYPE\s+html|html)/i);
  if (htmlStart !== -1) {
    const endIdx = trimmed.lastIndexOf('</html>');
    if (endIdx !== -1) return trimmed.slice(htmlStart, endIdx + '</html>'.length);
    return trimmed.slice(htmlStart);
  }

  return trimmed;
}
