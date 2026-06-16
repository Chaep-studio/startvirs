/**
 * File System Access API 类型补全
 *
 * TS 5.6 的 lib.dom 已经包含 FileSystemDirectoryHandle 等类型，
 * 但 Window 接口上还缺少 showDirectoryPicker 声明。
 * 这里只补 Window 上缺失的方法，避免整体升级 TS 带来的风险。
 */
declare global {
  interface Window {
    showDirectoryPicker: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: FileSystemHandle | string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};
