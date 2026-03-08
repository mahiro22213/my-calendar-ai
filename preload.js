const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 背景颜色存储（旧版）
  saveBgColor: (color) => ipcRenderer.invoke('save-bg-color', color),
  loadBgColor: () => ipcRenderer.invoke('load-bg-color'),

  // 右键关闭菜单
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),

  // 打开完整日历
  openFullCalendar: () => ipcRenderer.invoke('open-full-calendar'),

  // 打开设置窗口
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),

  // 监听背景更新事件
  onUpdateBg: (callback) => ipcRenderer.on('update-bg', (event, ...args) => callback(event, ...args)),

  // 加载所有设置
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // 监听主窗口天气更新
  onMainWeatherUpdate: (callback) => ipcRenderer.on('main-weather-update', (event, data) => callback(data)),

  // AI 对话方法（新增）
  askAI: (prompt) => ipcRenderer.invoke('ask-ai', prompt)
});