import React, { useEffect, useState } from 'react';
import { ConfigPrompt } from './ConfigPrompt';
import { MainMenu } from './MainMenu';

declare const require: any;

const { ipcRenderer } = require('electron');

export type EmulatorConfig = {
  name: string;
  path: string;
  theme: string;
  gamesDir: string;
};

export type Config = {
  emulators: EmulatorConfig[];
};

export type GameEntry = {
  fileName: string;
  gameId: string;
  displayName: string;
  thumbnailUrls: string[];
};

export const App: React.FC = () => {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await ipcRenderer.invoke('load-config');
        if (
          loaded &&
          Array.isArray(loaded.emulators) &&
          loaded.emulators.length > 0 &&
          loaded.emulators.every((emu: any) => typeof emu.gamesDir === 'string' && emu.gamesDir.length > 0)
        ) {
          setConfig(loaded);
        } else {
          const legacyConfig = localStorage.getItem('geui-config');
          if (legacyConfig) {
            try {
              const parsed = JSON.parse(legacyConfig);
              if (
                parsed &&
                Array.isArray(parsed.emulators) &&
                parsed.emulators.length > 0 &&
                parsed.emulators.every((emu: any) => typeof emu.gamesDir === 'string' && emu.gamesDir.length > 0)
              ) {
                await ipcRenderer.invoke('save-config', parsed);
                localStorage.removeItem('geui-config');
                setConfig(parsed);
              }
            } catch (error) {
              localStorage.removeItem('geui-config');
            }
          }
        }
      } catch (error) {
        // No config file yet.
      }
      setLoading(false);
    };

    load();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0d111d', color: '#fff' }}>
        Loading configuration...
      </div>
    );
  }

  if (!config) return <ConfigPrompt onSave={setConfig} />;
  return <MainMenu config={config} />;
};
