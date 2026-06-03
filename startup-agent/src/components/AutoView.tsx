export default function AutoView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
        <iconify-icon icon="ph:robot" style={{ fontSize: '24px', color: '#a8a29e' }}></iconify-icon>
      </div>
      <p className="text-sm text-stone-500">自动化功能即将上线</p>
      <p className="text-[11px] text-stone-400 mt-1">敬请期待...</p>
    </div>
  );
}
