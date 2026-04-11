const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfigFile() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function writeConfigFile(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function getThumbnailPlatform(emulatorName, fileName, gameId) {
  const normalizedName = String(emulatorName || '').trim().toLowerCase();

  if (!gameId) {
    return '';
  }

  if (normalizedName === 'cemu') {
    return 'wiiu';
  }

  if (normalizedName === 'yuzu' || normalizedName === 'ryujinx') {
    return 'switch';
  }

  if (normalizedName === 'dolphin') {
    return gameId.startsWith('G') ? 'gc' : 'wii';
  }

  if (normalizedName === 'rpcs3') {
    return 'ps3';
  }

  if (normalizedName === 'xemu') {
    return 'xbox';
  }

  if (normalizedName === 'xenia') {
    return 'xbox360';
  }

  return '';
}

function buildThumbnailUrl(platform, gameId) {
  if (!platform || !gameId) {
    return '';
  }

  return `http://art.gametdb.com/${platform}/cover/US/${gameId}.jpg`;
}

function buildThumbnailUrlCandidates(platform, gameId) {
  if (!platform || !gameId) {
    return [];
  }

  const regions = ['US', 'EN', 'JA', 'FR', 'DE', 'ES', 'IT', 'NL'];
  const extensions = ['jpg', 'png', 'webp'];
  const candidates = [];

  for (const region of regions) {
    for (const extension of extensions) {
      candidates.push(`http://art.gametdb.com/${platform}/cover/${region}/${gameId}.${extension}`);
    }
  }

  return candidates;
}

function formatGameEntry(fileName, emulatorName) {
  const parsedFile = path.parse(fileName);
  const filenameMatch = parsedFile.name.match(/^\[([^\]]+)\]\s*(.+)$/);
  const gameId = filenameMatch ? filenameMatch[1].trim() : '';
  const gameName = filenameMatch ? filenameMatch[2].trim() : parsedFile.name;
  const thumbnailPlatform = getThumbnailPlatform(emulatorName, fileName, gameId);
  const thumbnailUrls = buildThumbnailUrlCandidates(thumbnailPlatform, gameId);
  const displayName = gameId ? gameName : parsedFile.name;

  return {
    fileName,
    gameId,
    displayName,
    thumbnailUrls,
  };
}

function getExtensionsForEmulator(emulatorName) {
  const normalizedName = String(emulatorName || '').trim().toLowerCase();

  const extensionMap = {
    cemu: ['.wua', '.wud', '.wux', '.rpx'],
    dolphin: ['.iso', '.ciso', '.gcz', '.wbfs', '.rvz', '.wia'],
    rpcs3: ['.iso', '.bin', '.cue', '.pkg', '.rar', '.zip', '.7z'],
    xemu: ['.iso', '.xbe'],
    xenia: ['.xex', '.iso'],
    yuzu: ['.nsp', '.xci', '.nca', '.zip', '.7z'],
    ryujinx: ['.nsp', '.xci', '.nca', '.zip', '.7z'],
  };

  return extensionMap[normalizedName] || ['.iso', '.bin', '.cue', '.zip', '.7z', '.exe'];
}

function getLaunchArgVariants(emulatorName, gamePath) {
  const normalizedName = String(emulatorName || '').trim().toLowerCase();

  if (normalizedName === 'cemu') {
    return [['-g', gamePath, '-f'], ['-f', '-g', gamePath], ['-g', gamePath], [gamePath]];
  }

  if (normalizedName === 'dolphin') {
    return [['-e', gamePath], [gamePath]];
  }

  if (normalizedName === 'rpcs3') {
    return [['--no-gui', gamePath], [gamePath]];
  }

  if (normalizedName === 'xemu') {
    return [['-dvd_path', gamePath], [gamePath]];
  }

  if (normalizedName === 'xenia') {
    return [[gamePath]];
  }

  if (normalizedName === 'yuzu' || normalizedName === 'ryujinx') {
    return [[gamePath]];
  }

  return [[gamePath]];
}

function launchProcess(emulatorPath, args) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const child = spawn(emulatorPath, args, {
      cwd: path.dirname(emulatorPath),
      detached: false,
      stdio: 'ignore',
      windowsHide: false,
    });

    const markSuccess = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({ pid: child.pid, args, child });
    };

    const markFailure = message => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(message));
    };

    child.once('error', error => {
      const message = error && error.message ? error.message : 'Process spawn error';
      markFailure(message);
    });

    child.once('exit', code => {
      if (!settled) {
        markFailure(`Process exited immediately (code ${code ?? 'unknown'}).`);
      }
    });

    // If process survives startup window, treat it as launched.
    setTimeout(() => {
      markSuccess();
    }, 700);
  });
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
    backgroundColor: '#111',
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.loadFile('index.html');
}

// IPC handler to list games in a directory
ipcMain.handle('list-games', async (event, emulatorName, gamesDir) => {
  try {
    const allowedExtensions = getExtensionsForEmulator(emulatorName);
    const files = fs.readdirSync(gamesDir).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return allowedExtensions.includes(ext);
    }).map(fileName => formatGameEntry(fileName, emulatorName));
    return files;
  } catch (e) {
    return [];
  }
});

ipcMain.handle('load-config', async () => readConfigFile());

ipcMain.handle('save-config', async (event, config) => {
  writeConfigFile(config);
  return true;
});

ipcMain.on('close-app', () => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.close();
  }
});

ipcMain.handle('launch-game', async (event, emulatorName, emulatorPath, gamePath) => {
  try {
    if (!emulatorPath || !gamePath) {
      return { ok: false, error: 'Missing emulator or game path.' };
    }

    if (!fs.existsSync(emulatorPath)) {
      return { ok: false, error: 'Emulator executable not found.' };
    }

    if (!fs.existsSync(gamePath)) {
      return { ok: false, error: 'Game file not found.' };
    }

    const variants = getLaunchArgVariants(emulatorName, gamePath);
    const failures = [];

    for (const args of variants) {
      try {
        const launched = await launchProcess(emulatorPath, args);
        event.sender.send('emu-launch-state', { state: 'started', pid: launched.pid });

        launched.child.once('exit', () => {
          try {
            event.sender.send('emu-launch-state', { state: 'closed', pid: launched.pid });
          } catch (sendError) {
            // Renderer may be gone.
          }
        });

        return { ok: true, pid: launched.pid, args: launched.args };
      } catch (error) {
        failures.push({ args, error: error && error.message ? error.message : 'Unknown error' });
      }
    }

    const firstFailure = failures[0];
    const firstMessage = firstFailure ? firstFailure.error : 'Unable to launch process.';
    const attempted = failures.map(failure => failure.args.join(' '));
    return { ok: false, error: firstMessage, attemptedArgs: attempted };
  } catch (error) {
    const message = error && error.message ? error.message : 'Failed to launch game.';
    return { ok: false, error: message };
  }
});

ipcMain.handle('delete-config', async () => {
  try {
    fs.unlinkSync(getConfigPath());
  } catch (error) {
    // Ignore missing file.
  }

  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('pick-path', async (event, field) => {
  const isMusic = field === 'music';
  const result = await dialog.showOpenDialog({
    title: isMusic
      ? 'Select menu music file'
      : field === 'path'
        ? 'Select emulator executable'
        : 'Select games directory',
    properties: field === 'path' || isMusic ? ['openFile'] : ['openDirectory', 'createDirectory'],
    filters: isMusic
      ? [
          { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a'] },
          { name: 'All Files', extensions: ['*'] },
        ]
      : undefined,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return '';
  }

  return result.filePaths[0];
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
