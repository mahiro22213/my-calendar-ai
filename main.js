const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
const AutoLaunch = require('auto-launch');
const notifier = require('node-notifier'); // 引入 node-notifier

// 设置 Windows 应用用户模型 ID，确保通知可识别
app.setAppUserModelId('MyCalendarAI');

const store = new Store({
  defaults: {
    main: {
      startColor: '#a8ede0',
      endColor: '#fed6e3',
      angle: 145,
      alpha: 0.5,
      textColor: '#ffffff',
      fontSize: 16
    },
    calendar: {
      startColor: '#a8ede0',
      endColor: '#fed6e3',
      angle: 145,
      alpha: 0.5,
      textColor: '#ffffff',
      fontSize: 16
    },
    aiModel: 'qwen-turbo',
    windowState: { x: undefined, y: undefined, width: 400, height: 300, maximized: false },
    customDateInfo: {},
    ideasByDate: {}, // 按日期存储待办事项
    globalIdeas: [], // 全局灵感列表
    trashItems: []   // 垃圾桶
  }
});

let mainWindow;
let fullCalendarWindow = null;
let settingsWindow = null;

const autoLauncher = new AutoLaunch({ name: 'MyCalendarAI' });
autoLauncher.enable();
autoLauncher.isEnabled()
  .then(isEnabled => console.log('开机自启动状态:', isEnabled))
  .catch(err => console.error('检查开机自启动失败:', err));

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const winState = store.get('windowState');
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  if (!isMaximized) {
    winState.x = bounds.x;
    winState.y = bounds.y;
    winState.width = bounds.width;
    winState.height = bounds.height;
  }
  winState.maximized = isMaximized;
  store.set('windowState', winState);
}

function createWindow() {
  const savedState = store.get('windowState');
  mainWindow = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setVisibleOnAllWorkspaces(true);
  if (savedState.maximized) mainWindow.maximize();

  const debouncedSave = debounce(saveWindowState, 500);
  mainWindow.on('move', debouncedSave);
  mainWindow.on('resize', debouncedSave);
  mainWindow.on('maximize', debouncedSave);
  mainWindow.on('unmaximize', debouncedSave);
  mainWindow.on('close', saveWindowState);

  // 右键关闭主窗口
  ipcMain.handle('show-context-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '关闭日历', click: () => mainWindow.close() },
      { label: '取消', role: 'close' }
    ]);
    menu.popup();
  });

  ipcMain.handle('open-full-calendar', () => {
    if (fullCalendarWindow && !fullCalendarWindow.isDestroyed()) {
      fullCalendarWindow.focus();
      return;
    }
    fullCalendarWindow = new BrowserWindow({
      width: 1150,
      height: 650,
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    fullCalendarWindow.loadFile('calendar-full.html');
    fullCalendarWindow.center();
    fullCalendarWindow.on('closed', () => { fullCalendarWindow = null; });
  });

  ipcMain.handle('open-settings-window', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus();
      return;
    }
    settingsWindow = new BrowserWindow({
      width: 450,
      height: 650,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    settingsWindow.loadFile('settings.html');
    settingsWindow.center();
    settingsWindow.on('closed', () => { settingsWindow = null; });
  });

  ipcMain.handle('save-settings', async (event, settings) => {
    store.set(settings);
    return true;
  });
  ipcMain.handle('load-settings', async () => store.store);

  ipcMain.handle('update-main-bg', (event, settings) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-bg', settings);
  });
  ipcMain.handle('update-calendar-bg', (event, settings) => {
    if (fullCalendarWindow && !fullCalendarWindow.isDestroyed()) fullCalendarWindow.webContents.send('update-bg', settings);
  });

  // ==================== 自定义日期信息存储 ====================
  ipcMain.handle('save-custom-info', async (event, dateStr, info) => {
    const custom = store.get('customDateInfo');
    custom[dateStr] = info;
    store.set('customDateInfo', custom);
    return true;
  });
  ipcMain.handle('load-custom-info', async () => store.get('customDateInfo'));

  // ==================== 待办事项存储 ====================
  ipcMain.handle('save-ideas-for-date', async (event, dateStr, ideas) => {
    const ideasByDate = store.get('ideasByDate');
    // 确保每个待办都有必要的字段（兼容旧数据）
    ideas = ideas.map(idea => ({
      ...idea,
      today_notified: idea.today_notified || false,
      reminder_notified: idea.reminder_notified || false
    }));
    ideasByDate[dateStr] = ideas;
    store.set('ideasByDate', ideasByDate);
    return true;
  });
  ipcMain.handle('load-ideas-for-date', async (event, dateStr) => {
    const ideasByDate = store.get('ideasByDate');
    return (ideasByDate[dateStr] || []).map(idea => ({
      ...idea,
      today_notified: idea.today_notified || false,
      reminder_notified: idea.reminder_notified || false
    }));
  });

  // ==================== 全局灵感存储 ====================
  ipcMain.handle('save-global-ideas', async (event, ideas) => {
    store.set('globalIdeas', ideas);
    return true;
  });
  ipcMain.handle('load-global-ideas', async () => store.get('globalIdeas'));

  // ==================== 垃圾桶存储 ====================
  ipcMain.handle('save-trash-items', async (event, items) => {
    store.set('trashItems', items);
    return true;
  });
  ipcMain.handle('load-trash-items', async () => store.get('trashItems'));

  // ==================== 获取今日待办（用于主窗口显示）====================
  ipcMain.handle('get-today-todos', async () => {
    const ideasByDate = store.get('ideasByDate');
    const todayStr = new Date().toISOString().split('T')[0];
    const todayIdeas = ideasByDate[todayStr] || [];
    // 过滤掉 TRASH 和 PROGRESSED（只显示未完成的）
    const activeTodos = todayIdeas.filter(i => i.status !== 'TRASH' && i.status !== 'PROGRESSED');
    return activeTodos;
  });

  // ==================== 获取所有待办（用于 all 界面）====================
  ipcMain.handle('get-all-todos', async () => {
    const ideasByDate = store.get('ideasByDate');
    const allTodos = [];
    Object.entries(ideasByDate).forEach(([date, ideas]) => {
      ideas.forEach(idea => {
        if (idea.status !== 'TRASH' && idea.status !== 'PROGRESSED') {
          allTodos.push({ ...idea, date });
        }
      });
    });
    allTodos.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    return allTodos;
  });

  // ==================== 天气 API ====================
  const WEATHER_API_KEY = '4194f60be25c4c28b51838dd9c2ad728';
  const HOST = 'qe6hexyvnu.re.qweatherapi.com';
  const LOCATION = '101230101';

  async function fetchWeatherData(endpoint) {
    const url = `https://${HOST}${endpoint}?location=${LOCATION}&key=${WEATHER_API_KEY}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === '200') return data;
      console.error('天气API错误:', data);
      return null;
    } catch (e) {
      console.error('网络请求失败:', e);
      return null;
    }
  }

  ipcMain.handle('weather-now', async () => (await fetchWeatherData('/v7/weather/now'))?.now || null);
  ipcMain.handle('weather-24h', async () => (await fetchWeatherData('/v7/weather/24h'))?.hourly || null);
  ipcMain.handle('weather-7d', async () => (await fetchWeatherData('/v7/weather/7d'))?.daily || null);
  ipcMain.handle('air-now', async () => (await fetchWeatherData('/v7/air/now'))?.now || null);
  ipcMain.handle('indices-uv', async () => {
    const url = `https://${HOST}/v7/indices/1d?location=${LOCATION}&key=${WEATHER_API_KEY}&type=5`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === '200') return data.daily?.[0] || null;
      return null;
    } catch { return null; }
  });
  ipcMain.handle('sun-moon', async () => (await fetchWeatherData('/v7/astronomy/sun'))?.sun || null);

  ipcMain.on('update-weather-for-main', (event, weatherData) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('main-weather-update', weatherData);
  });

  // ==================== AI 占卜 API ====================
  const DASHSCOPE_API_KEY = 'sk-67a3fa3de3614d4fb240fa076629b8ff';
  const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  ipcMain.handle('ask-ai', async (event, messages) => {
    const maxRetries = 2, timeout = 15000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const settings = store.store;
        const model = settings.aiModel || 'qwen-turbo';
        const response = await fetch(DASHSCOPE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DASHSCOPE_API_KEY}` },
          body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 1500 }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const data = await response.json();
        return data.choices[0].message.content;
      } catch (error) {
        clearTimeout(timeoutId);
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });

  ipcMain.handle('save-bg-color', async (event, color) => { store.set('bgColor', color); return true; });
  ipcMain.handle('load-bg-color', async () => store.get('bgColor'));
}

app.whenReady().then(() => {
  createWindow();
  // 启动时立即检查一次提醒
  checkReminders(true);
  // 每分钟检查一次
  setInterval(() => checkReminders(false), 60 * 1000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ==================== 提醒机制（使用 node-notifier） ====================
function checkReminders(isStartup = false) {
  const ideasByDate = store.get('ideasByDate');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let changed = false;

  Object.keys(ideasByDate).forEach(dateStr => {
    const ideas = ideasByDate[dateStr];
    let updated = false;
    ideas.forEach(idea => {
      if (idea.status !== 'FOLLOW_UP' || !idea.reminder_time) return;

      const reminderTime = new Date(idea.reminder_time);
      const reminderDateStr = reminderTime.toISOString().split('T')[0];

      if (isStartup) {
        // 启动检查：提醒日期是今天且未发送今日预告
        if (reminderDateStr === todayStr && !idea.today_notified) {
          notifier.notify({
            title: '今日待办提醒',
            message: `「${idea.idea_content}」今天需要跟进`,
            icon: path.join(__dirname, 'build/icon.ico'), // 如果有图标文件
            sound: true
          });
          idea.today_notified = true;
          updated = true;
        }
      } else {
        // 定时检查：提醒时间已到且未发送准时提醒
        if (reminderTime <= now && !idea.reminder_notified) {
          notifier.notify({
            title: '待办提醒',
            message: `「${idea.idea_content}」需要跟进啦！`,
            icon: path.join(__dirname, 'build/icon.ico'),
            sound: true
          });
          idea.reminder_notified = true;
          updated = true;
        }
      }
    });
    if (updated) {
      ideasByDate[dateStr] = ideas;
      changed = true;
    }
  });

  if (changed) {
    store.set('ideasByDate', ideasByDate);
  }
}