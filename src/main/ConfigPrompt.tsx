import React, { useState } from 'react';
import { Config, EmulatorConfig } from './App';

declare const require: any;

const { ipcRenderer } = require('electron');

type ConfigPromptProps = {
  onSave: (cfg: Config | null) => void;
};

const createEmptyEmulator = (): EmulatorConfig => ({
  name: 'CEMU',
  path: '',
  theme: 'wiiu',
  gamesDir: '',
});

const emulatorOptions = [
  { label: 'CEMU', disabled: false },
  { label: 'RPCS3', disabled: true },
  { label: 'Dolphin', disabled: true },
  { label: 'XEMU', disabled: true },
  { label: 'Xenia', disabled: true },
  { label: 'Yuzu', disabled: true },
  { label: 'Ryujinx', disabled: true },
];

const themeOptions = [
  { label: 'CEMU theme', value: 'wiiu', disabled: false },
  { label: 'XEMU theme', value: 'xbox', disabled: true },
  { label: 'RPCS3 theme', value: 'xmb', disabled: true },
];

export const ConfigPrompt: React.FC<ConfigPromptProps> = ({ onSave }) => {
  const [emulators, setEmulators] = useState<EmulatorConfig[]>([createEmptyEmulator()]);
  const [error, setError] = useState<string | null>(null);
  const browseButtonStyle = {
    border: '1px solid #000000',
    borderRadius: 4,
    padding: '10px 14px',
    background: '#000000',
    color: '#ffffff',
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: 138,
  } as const;

  const updateEmulator = (index: number, field: keyof EmulatorConfig, value: string) => {
    setEmulators(current =>
      current.map((emulator, currentIndex) =>
        currentIndex === index ? { ...emulator, [field]: value } : emulator,
      ),
    );
  };

  const selectPath = async (index: number, field: 'path' | 'gamesDir') => {
    try {
      const result = await ipcRenderer.invoke('pick-path', field);

      if (typeof result === 'string' && result.length > 0) {
        updateEmulator(index, field, result);
      }
    } catch {
      setError('Unable to open the file picker.');
    }
  };

  const addEmulator = () => {
    setEmulators(current => [...current, createEmptyEmulator()]);
  };

  const removeEmulator = (index: number) => {
    setEmulators(current => (current.length === 1 ? current : current.filter((_, currentIndex) => currentIndex !== index)));
  };

  const handleSave = () => {
    const filteredEmulators = emulators.filter(
      emulator => emulator.name.trim() && emulator.path.trim() && emulator.gamesDir.trim(),
    );

    if (filteredEmulators.length === 0) {
      setError('Please fill out at least one emulator with a name, executable, and games directory.');
      return;
    }

    const config: Config = { emulators: filteredEmulators };
    setError(null);
    ipcRenderer
      .invoke('save-config', config)
      .then(() => {
        localStorage.removeItem('geui-config');
        onSave(config);
      })
      .catch(() => setError('Unable to save config.'));
  };

  const handleReset = () => {
    ipcRenderer.invoke('delete-config').finally(() => {
      localStorage.removeItem('geui-config');
      setEmulators([createEmptyEmulator()]);
      setError(null);
      onSave(null);
    });
  };

  return (
    <div
      className="config-scroll-shell"
      style={{
        minHeight: '100vh',
        maxHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        color: '#000000',
        padding: 24,
        fontFamily: 'Segoe UI, Arial, sans-serif',
        overflowY: 'auto',
        scrollbarWidth: 'auto',
        scrollbarColor: '#000000 #ffffff',
      }}
    >
      <style>{`
        .config-scroll-shell::-webkit-scrollbar {
          width: 12px;
        }

        .config-scroll-shell::-webkit-scrollbar-track {
          background: #ffffff;
          border-left: 1px solid #000000;
        }

        .config-scroll-shell::-webkit-scrollbar-thumb {
          background: #000000;
          border-radius: 4px;
          border: 3px solid #ffffff;
        }

        .config-scroll-shell::-webkit-scrollbar-thumb:hover {
          background: #000000;
        }
      `}</style>
      <div
        style={{
          width: 'min(920px, 100%)',
          background: '#ffffff',
          border: '1px solid #000000',
          borderRadius: 0,
          boxShadow: 'none',
          backdropFilter: 'none',
          padding: 24,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: '#000000' }}>
            Setup
          </div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05, margin: '8px 0 8px', fontWeight: 700, color: '#000000' }}>Configure geUI</h1>
          <p style={{ margin: 0, color: '#000000', maxWidth: 680, fontSize: 15, lineHeight: 1.5 }}>
            Choose emulators and their game folders.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {emulators.map((emulator, index) => (
            <section
              key={index}
              style={{
                background: '#ffffff',
                border: '1px solid #000000',
                borderRadius: 0,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#000000' }}>Emulator {index + 1}</div>
                  <div style={{ fontSize: 13, color: '#000000' }}>One row per console or platform.</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeEmulator(index)}
                  disabled={emulators.length === 1}
                  style={{
                    border: '1px solid #000000',
                    borderRadius: 4,
                    padding: '8px 12px',
                    background: '#ffffff',
                    color: emulators.length === 1 ? '#000000' : '#000000',
                    cursor: emulators.length === 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Remove
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(280px, 1.5fr) minmax(180px, 0.8fr) auto',
                  gap: 12,
                  alignItems: 'end',
                  marginBottom: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: '#000000' }}>Emulator Name</span>
                  <select
                    value={emulator.name}
                    onChange={event => updateEmulator(index, 'name', event.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      borderRadius: 4,
                      border: '1px solid #000000',
                      background: '#ffffff',
                      color: '#000000',
                      padding: '10px 12px',
                      fontSize: 16,
                      outline: 'none',
                    }}
                  >
                    {emulatorOptions.map(option => (
                      <option key={option.label} value={option.label} disabled={option.disabled}>
                        {option.disabled ? `${option.label} (disabled)` : option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: '#000000' }}>Theme</span>
                  <select
                    value={emulator.theme}
                    onChange={event => updateEmulator(index, 'theme', event.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      borderRadius: 4,
                      border: '1px solid #000000',
                      background: '#ffffff',
                      color: '#000000',
                      padding: '10px 12px',
                      fontSize: 16,
                      outline: 'none',
                    }}
                  >
                    {themeOptions.map(option => (
                      <option key={option.value} value={option.value} disabled={option.disabled}>
                        {option.disabled ? `${option.label} (disabled)` : option.label}
                      </option>
                    ))}
                  </select>
                </label>

              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: '#000000' }}>Emulator Path</span>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                    <input
                      value={emulator.path}
                      readOnly
                      onClick={() => selectPath(index, 'path')}
                      placeholder="Choose the executable file"
                      style={{
                        flex: 1,
                        boxSizing: 'border-box',
                        borderRadius: 4,
                        border: '1px solid #000000',
                        background: '#ffffff',
                        color: '#000000',
                        padding: '10px 12px',
                        fontSize: 16,
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => selectPath(index, 'path')}
                      style={browseButtonStyle}
                    >
                      Browse Executable
                    </button>
                  </div>
                </label>

                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: '#000000' }}>Games Directory</span>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                    <input
                      value={emulator.gamesDir}
                      readOnly
                      onClick={() => selectPath(index, 'gamesDir')}
                      placeholder="Choose the folder that contains your games"
                      style={{
                        flex: 1,
                        boxSizing: 'border-box',
                        borderRadius: 4,
                        border: '1px solid #000000',
                        background: '#ffffff',
                        color: '#000000',
                        padding: '10px 12px',
                        fontSize: 16,
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => selectPath(index, 'gamesDir')}
                      style={browseButtonStyle}
                    >
                      Browse Folder
                    </button>
                  </div>
                </label>
              </div>
            </section>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
          <button
            type="button"
            onClick={addEmulator}
            style={{
              border: '1px solid #000000',
              background: '#ffffff',
              color: '#000000',
              borderRadius: 4,
              padding: '12px 18px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Add Emulator
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={browseButtonStyle}
          >
            Save and Continue
          </button>
        </div>

        {error && <div style={{ marginTop: 16, color: '#000000', fontWeight: 600 }}>{error}</div>}
      </div>
    </div>
  );
};
