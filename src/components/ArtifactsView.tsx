import { useState } from 'react';
import type { Message } from '../types';
import HtmlPreview, { isHtmlContent } from './HtmlPreview';
import FileExplorer from './FileExplorer';

interface Props {
  artifacts: Message[];
  serverUrl?: string;
}

type TabId = 'artifacts' | 'files';

export default function ArtifactsView({ artifacts, serverUrl }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('artifacts');
  const [previewMsg, setPreviewMsg] = useState<Message | null>(null);

  const tabs: { id: TabId; icon: string; label: string; badge?: number }[] = [
    { id: 'artifacts', icon: 'ph:scroll', label: '产物', badge: artifacts.length || undefined },
    { id: 'files', icon: 'ph:folder-open', label: '文件' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab 栏 */}
      <div className="flex border-b border-stone-100 bg-white flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition border-b-2 ${
              activeTab === tab.id
                ? 'text-blue-600 border-blue-500 bg-blue-50/30'
                : 'text-stone-400 border-transparent hover:text-stone-600 hover:bg-stone-50'
            }`}
          >
            <iconify-icon icon={tab.icon} style={{ fontSize: '14px' }}></iconify-icon>
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'artifacts' && (
          <ArtifactsTab artifacts={artifacts} previewMsg={previewMsg} setPreviewMsg={setPreviewMsg} />
        )}
        {activeTab === 'files' && (
          <FileExplorer serverUrl={serverUrl} />
        )}
      </div>
    </div>
  );
}

function ArtifactsTab({
  artifacts,
  previewMsg,
  setPreviewMsg,
}: {
  artifacts: Message[];
  previewMsg: Message | null;
  setPreviewMsg: (m: Message | null) => void;
}) {
  if (artifacts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <iconify-icon icon="ph:scroll" style={{ fontSize: '24px', color: '#d6d3d1', marginBottom: 8 }}></iconify-icon>
        <p className="text-sm text-stone-400">暂无产物</p>
        <p className="text-[11px] text-stone-300 mt-0.5">使用技能生成后会显示在这里</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-3">
          {artifacts.map((a) => {
            const hasHtml = !!a.content && isHtmlContent(a.content);
            return (
              <div key={a.id} className="bg-white rounded-2xl p-4 border border-stone-100 anim-up">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[13px] font-semibold text-stone-800">{a.title}</div>
                  {hasHtml && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setPreviewMsg(a)}
                        className="px-2.5 py-1 rounded-lg bg-stone-900 text-white text-[10px] font-semibold hover:bg-stone-800 transition flex items-center gap-1"
                      >
                        <iconify-icon icon="ph:eye" style={{ fontSize: '10px' }}></iconify-icon>
                        预览
                      </button>
                      <button
                        onClick={() => {
                          const blob = new Blob([a.content!], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          const el = document.createElement('a');
                          el.href = url;
                          el.download = `${a.title || 'output'}.html`;
                          el.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-500 text-[10px] font-semibold hover:bg-stone-200 transition flex items-center gap-1"
                      >
                        <iconify-icon icon="ph:download" style={{ fontSize: '10px' }}></iconify-icon>
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-stone-400 mb-2">{a.subtitle}</div>
                <div className="bg-stone-50 rounded-xl p-3 text-[12px] text-stone-600 leading-relaxed whitespace-pre-wrap font-mono">
                  {a.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {previewMsg && previewMsg.content && (
        <HtmlPreview
          html={previewMsg.content}
          title={previewMsg.title}
          onClose={() => setPreviewMsg(null)}
        />
      )}
    </>
  );
}
