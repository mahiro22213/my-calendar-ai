const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
const AutoLaunch = require('auto-launch');

// 存储设置，增加窗口位置和状态
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
    windowState: {
      x: undefined,
      y: undefined,
      width: 400,
      height: 300,
      maximized: false
    }
  }
});

let mainWindow;
let fullCalendarWindow = null;
let settingsWindow = null;

// 开机自启动
const autoLauncher = new AutoLaunch({ name: 'MyCalendarAI' });
autoLauncher.enable();
autoLauncher.isEnabled()
  .then(isEnabled => console.log('开机自启动状态:', isEnabled))
  .catch(err => console.error('检查开机自启动失败:', err));

// 防抖函数，避免频繁写入
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 保存窗口状态
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const winState = store.get('windowState');
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  // 只保存正常状态下的位置和尺寸，最大化时不保存具体位置
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

  // 如果上次是最大化，则最大化窗口
  if (savedState.maximized) {
    mainWindow.maximize();
  }

  // 监听窗口移动/大小变化，防抖保存状态
  const debouncedSave = debounce(saveWindowState, 500);
  mainWindow.on('move', debouncedSave);
  mainWindow.on('resize', debouncedSave);
  mainWindow.on('maximize', debouncedSave);
  mainWindow.on('unmaximize', debouncedSave);

  // 窗口关闭前保存最终状态
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
    fullCalendarWindow.on('closed', () => {
      fullCalendarWindow = null;
    });
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
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    settingsWindow.loadFile('settings.html');
    settingsWindow.center();
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  });

  ipcMain.handle('save-settings', async (event, settings) => {
    store.set(settings);
    return true;
  });

  ipcMain.handle('load-settings', async () => {
    return store.store;
  });

  ipcMain.handle('update-main-bg', (event, settings) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-bg', settings);
    }
  });

  ipcMain.handle('update-calendar-bg', (event, settings) => {
    if (fullCalendarWindow && !fullCalendarWindow.isDestroyed()) {
      fullCalendarWindow.webContents.send('update-bg', settings);
    }
  });

  // ==================== 天气 API ====================
  const WEATHER_API_KEY = '4194f60be25c4c28b51838dd9c2ad728';
  const HOST = 'qe6hexyvnu.re.qweatherapi.com';
  const LOCATION = '101230101'; // 福州

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

  ipcMain.handle('weather-now', async () => {
    const data = await fetchWeatherData('/v7/weather/now');
    return data?.now || null;
  });

  ipcMain.handle('weather-24h', async () => {
    const data = await fetchWeatherData('/v7/weather/24h');
    return data?.hourly || null;
  });

  ipcMain.handle('weather-7d', async () => {
    const data = await fetchWeatherData('/v7/weather/7d');
    return data?.daily || null;
  });

  ipcMain.handle('air-now', async () => {
    const data = await fetchWeatherData('/v7/air/now');
    return data?.now || null;
  });

  ipcMain.handle('indices-uv', async () => {
    const url = `https://${HOST}/v7/indices/1d?location=${LOCATION}&key=${WEATHER_API_KEY}&type=5`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === '200') return data.daily?.[0] || null;
      return null;
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('sun-moon', async () => {
    const data = await fetchWeatherData('/v7/astronomy/sun');
    return data?.sun || null;
  });

  ipcMain.on('update-weather-for-main', (event, weatherData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-weather-update', weatherData);
    }
  });

  // ==================== AI 占卜 API（支持模型选择，带超时和重试）====================
  const DASHSCOPE_API_KEY = 'sk-67a3fa3de3614d4fb240fa076629b8ff';
  const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  ipcMain.handle('ask-ai', async (event, messages) => {
    const maxRetries = 2;        // 最多重试 2 次
    const timeout = 15000;       // 15 秒超时

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const settings = store.store;
        const model = settings.aiModel || 'qwen-turbo';

        const response = await fetch(DASHSCOPE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0,        // 保证回答一致性
            max_tokens: 1500
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
      } catch (error) {
        clearTimeout(timeoutId);
        if (attempt === maxRetries) {
          console.error('AI 调用最终失败:', error);
          throw error;
        }
        console.log(`AI 调用失败，正在重试 (${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });

  // 保留旧版颜色存储
  ipcMain.handle('save-bg-color', async (event, color) => {
    store.set('bgColor', color);
    return true;
  });
  ipcMain.handle('load-bg-color', async () => store.get('bgColor'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});