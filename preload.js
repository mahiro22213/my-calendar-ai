const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveBgColor: (color) => ipcRenderer.invoke('save-bg-color', color),
  loadBgColor: () => ipcRenderer.invoke('load-bg-color'),
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),
  openFullCalendar: () => ipcRenderer.invoke('open-full-calendar'),
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  onUpdateBg: (callback) => ipcRenderer.on('update-bg', (event, ...args) => callback(event, ...args)),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  onMainWeatherUpdate: (callback) => ipcRenderer.on('main-weather-update', (event, data) => callback(data)),
  getAllTodos: () => ipcRenderer.invoke('get-all-todos'),
  // 自定义信息编辑
  saveCustomInfo: (dateStr, info) => ipcRenderer.invoke('save-custom-info', dateStr, info),
  loadCustomInfo: () => ipcRenderer.invoke('load-custom-info'),

  // 待办事项
  saveIdeasForDate: (dateStr, ideas) => ipcRenderer.invoke('save-ideas-for-date', dateStr, ideas),
  loadIdeasForDate: (dateStr) => ipcRenderer.invoke('load-ideas-for-date', dateStr),

  // 全局灵感
  saveGlobalIdeas: (ideas) => ipcRenderer.invoke('save-global-ideas', ideas),
  loadGlobalIdeas: () => ipcRenderer.invoke('load-global-ideas'),

  // 垃圾桶
  saveTrashItems: (items) => ipcRenderer.invoke('save-trash-items', items),
  loadTrashItems: () => ipcRenderer.invoke('load-trash-items'),

  // AI 对话
  askAI: (messages) => ipcRenderer.invoke('ask-ai', messages),

  // 获取今日待办（用于主窗口）
  getTodayTodos: () => ipcRenderer.invoke('get-today-todos')
});