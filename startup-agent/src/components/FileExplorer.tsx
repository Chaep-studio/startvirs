import { useState, useCallback } from 'react';

const TOOL_SERVER = 'http://localhost:3456';

interface FileEntry {
  name: string;
  type: 'dir' | 'file';
}

interface Props {
  serverUrl?: string;
}

export default function FileExplorer({ serverUrl = TOOL_SERVER }: Props) {
  const [currentPath, setCurrentPath] = useState('.');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${serverUrl}/api/tools/list_files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 排序：目录在前，文件在后，同类型按名称排序
      const sorted = (data.files as FileEntry[]).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
      setCurrentPath(dirPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法加载目录');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  const loadFile = useCallback(async (filePath: string) => {
    setPreviewLoading(true);
    setPreviewFile(null);
    try {
      const res = await fetch(`${serverUrl}/api/tools/read_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPreviewFile({ path: filePath, content: data.content || '' });
    } catch (e) {
      setPreviewFile({ path: filePath, content: `⚠️ 无法读取文件: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setPreviewLoading(false);
    }
  }, [serverUrl]);

  // 首次加载
  const handleEnter = () => {
    if (files.length === 0 && !loading && !error) {
      loadDir('.');
    }
  };

  const pathParts = currentPath === '.' ? [] : currentPath.split('/').filter(Boolean);

  const handleNav = (targetPath: string) => {
    loadDir(targetPath);
    setPreviewFile(null);
  };

  const handleFileClick = (file: FileEntry) => {
    const filePath = currentPath === '.' ? file.name : `${currentPath}/${file.name}`;
    if (file.type === 'dir') {
      handleNav(filePath);
    } else {
      loadFile(filePath);
    }
  };

  const handleGoUp = () => {
    if (currentPath === '.') return;
    const parts = currentPath.split('/');
    parts.pop();
    handleNav(parts.length === 0 ? '.' : parts.join('/'));
  };

  const handleBreadcrumb = (index: number) => {
    const parts = currentPath.split('/').filter(Boolean);
    const target = parts.slice(0, index + 1).join('/');
    handleNav(target || '.');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onFocus={handleEnter} onMouseEnter={handleEnter}>
      {/* 面包屑导航 */}
      <div className="px-4 py-2 border-b border-stone-100 bg-stone-50/50 flex items-center gap-1 text-[11px] flex-shrink-0">
        <button
          onClick={() => handleNav('.')}
          className="text-blue-500 hover:text-blue-600 font-medium"
        >
          📂 根目录
        </button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-stone-300">/</span>
            <button
              onClick={() => handleBreadcrumb(i)}
              className="text-blue-500 hover:text-blue-600 font-medium"
            >
              {part}
            </button>
          </span>
        ))}
        <button
          onClick={() => loadDir(currentPath)}
          className="ml-auto text-stone-400 hover:text-stone-600 transition"
          title="刷新"
        >
          <iconify-icon icon="ph:arrows-clockwise" style={{ fontSize: '13px' }}></iconify-icon>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 文件列表 */}
        <div className={`${previewFile ? 'w-1/3' : 'w-full'} overflow-y-auto border-r border-stone-100`}>
          {loading && (
            <div className="flex items-center justify-center py-12 text-stone-400 text-[12px]">
              <iconify-icon icon="ph:spinner" className="animate-spin" style={{ fontSize: '16px', marginRight: 6 }}></iconify-icon>
              加载中...
            </div>
          )}

          {error && (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-red-400 mb-2">{error}</p>
              <button
                onClick={() => loadDir(currentPath)}
                className="px-3 py-1 rounded-lg bg-stone-100 text-stone-600 text-[11px] hover:bg-stone-200 transition"
              >
                重试
              </button>
            </div>
          )}

          {!loading && !error && files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400">
              <iconify-icon icon="ph:folder-open" style={{ fontSize: '24px', marginBottom: 8, color: '#d6d3d1' }}></iconify-icon>
              <p className="text-[12px]">空目录</p>
            </div>
          )}

          {!loading && !error && files.length > 0 && (
            <div className="py-1">
              {currentPath !== '.' && (
                <button
                  onClick={handleGoUp}
                  className="w-full px-4 py-2 text-left text-[12px] text-stone-500 hover:bg-stone-50 flex items-center gap-2 transition"
                >
                  <iconify-icon icon="ph:arrow-left" style={{ fontSize: '14px' }}></iconify-icon>
                  上级目录
                </button>
              )}
              {files.map((file) => (
                <button
                  key={file.name}
                  onClick={() => handleFileClick(file)}
                  className={`w-full px-4 py-2 text-left text-[12px] hover:bg-stone-50 flex items-center gap-2 transition ${
                    previewFile && previewFile.path === (currentPath === '.' ? file.name : `${currentPath}/${file.name}`)
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-stone-700'
                  }`}
                >
                  <iconify-icon
                    icon={file.type === 'dir' ? 'ph:folder' : 'ph:file-text'}
                    style={{ fontSize: '14px', color: file.type === 'dir' ? '#f59e0b' : '#78716c' }}
                  ></iconify-icon>
                  <span className="truncate">{file.name}</span>
                  {file.type === 'dir' && (
                    <iconify-icon icon="ph:caret-right" style={{ fontSize: '10px', color: '#a8a29e', marginLeft: 'auto' }}></iconify-icon>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 文件预览 */}
        {previewFile && (
          <div className="w-2/3 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-stone-100 flex items-center gap-2 flex-shrink-0">
              <iconify-icon icon="ph:file-text" style={{ fontSize: '14px', color: '#78716c' }}></iconify-icon>
              <span className="text-[12px] font-medium text-stone-700 truncate">{previewFile.path}</span>
              <button
                onClick={() => setPreviewFile(null)}
                className="ml-auto text-stone-400 hover:text-stone-600 transition"
              >
                <iconify-icon icon="ph:x" style={{ fontSize: '14px' }}></iconify-icon>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12 text-stone-400 text-[12px]">
                  <iconify-icon icon="ph:spinner" className="animate-spin" style={{ fontSize: '16px', marginRight: 6 }}></iconify-icon>
                  加载中...
                </div>
              ) : (
                <pre className="text-[12px] text-stone-600 leading-relaxed whitespace-pre-wrap font-mono bg-stone-50 rounded-xl p-4 border border-stone-100">
                  {previewFile.content}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
