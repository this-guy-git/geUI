import React, { useMemo, useState } from 'react';
import { Config, EmulatorConfig, ThemeVariant } from './App';

declare const require: any;

const { ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const nodePath = require('path');

type ConfigPromptProps = {
  onSave: (cfg: Config | null) => void;
  initialConfig?: Config;
  onCancel?: () => void;
};

const createEmptyEmulator = (): EmulatorConfig => ({
  name: 'CEMU',
  path: '',
  theme: 'wiiu',
  gamesDir: '',
});

const emulatorOptions = [
  { label: 'CEMU', disabled: false },
  { label: 'RPCS3', disabled: false },
  { label: 'Dolphin', disabled: true },
  { label: 'XEMU', disabled: true },
  { label: 'Xenia', disabled: true },
  { label: 'Yuzu', disabled: true },
  { label: 'Ryujinx', disabled: true },
];

const themeOptions = [
  { label: 'CEMU theme', value: 'wiiu', disabled: false },
  { label: 'XEMU theme', value: 'xbox', disabled: true },
  { label: 'RPCS3 theme', value: 'xmb', disabled: false },
];

const resolveFileUrl = (relativeOrAbsolutePath: string) => {
  if (!relativeOrAbsolutePath) {
    return '';
  }

  const candidatePaths = nodePath.isAbsolute(relativeOrAbsolutePath)
    ? [relativeOrAbsolutePath]
    : [
        nodePath.join(((globalThis as any).process?.cwd?.() || ''), relativeOrAbsolutePath),
        nodePath.join((((globalThis as any).process?.resourcesPath as string) || ''), relativeOrAbsolutePath),
      ];

  const absolutePath = candidatePaths.find(candidatePath => candidatePath && fs.existsSync(candidatePath));

  if (!absolutePath) {
    return '';
  }

  try {
    return pathToFileURL(absolutePath).href;
  } catch {
    return '';
  }
};

export const ConfigPrompt: React.FC<ConfigPromptProps> = ({ onSave, initialConfig, onCancel }) => {
  const [emulators, setEmulators] = useState<EmulatorConfig[]>(() => {
    if (initialConfig?.emulators?.length) {
      return initialConfig.emulators;
    }

    return [createEmptyEmulator()];
  });
  const [themeVariant, setThemeVariant] = useState<ThemeVariant>(() => {
    return initialConfig?.themeVariant === 'dark' ? 'dark' : 'light';
  });
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!initialConfig;
  const isDark = themeVariant === 'dark';
  const sunIconUrl = useMemo(() => resolveFileUrl('assets/images/brightness-high-fill.svg'), []);
  const moonIconUrl = useMemo(() => resolveFileUrl('assets/images/moon-stars-fill.svg'), []);

  const palette = {
    shellBackground: isDark ? '#10141c' : '#ffffff',
    shellText: isDark ? '#eef5ff' : '#000000',
    shellBorder: isDark ? '#4f5d72' : '#000000',
    panelBackground: isDark ? '#121923' : '#ffffff',
    panelBorder: isDark ? '#5a6a80' : '#000000',
    cardBackground: isDark ? '#151f2b' : '#ffffff',
    cardBorder: isDark ? '#5a6a80' : '#000000',
    inputBackground: isDark ? '#1a2534' : '#ffffff',
    inputText: isDark ? '#eef5ff' : '#000000',
    actionBackground: isDark ? '#edf4ff' : '#000000',
    actionText: isDark ? '#0e1520' : '#ffffff',
    secondaryBackground: isDark ? '#1a2534' : '#ffffff',
    secondaryText: isDark ? '#eef5ff' : '#000000',
  };

  const browseButtonStyle = {
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: 4,
    padding: '10px 14px',
    background: palette.actionBackground,
    color: palette.actionText,
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

  const toggleThemeVariant = () => {
    const nextVariant: ThemeVariant = themeVariant === 'dark' ? 'light' : 'dark';
    setThemeVariant(nextVariant);
  };

  const handleSave = () => {
    const filteredEmulators = emulators.filter(
      emulator => emulator.name.trim() && emulator.path.trim() && emulator.gamesDir.trim(),
    );

    if (filteredEmulators.length === 0) {
      setError('Please fill out at least one emulator with a name, executable, and games directory.');
      return;
    }

    const persistedVolume = Number(initialConfig?.menuVolume);
    const persistedIndex = Number(initialConfig?.lastSelectedEmulatorIndex);
    const safeSelectedIndex = Number.isFinite(persistedIndex)
      ? Math.max(0, Math.min(filteredEmulators.length - 1, persistedIndex))
      : 0;

    const config: Config = {
      emulators: filteredEmulators,
      themeVariant,
      menuVolume: Number.isFinite(persistedVolume) ? Math.max(0, Math.min(100, persistedVolume)) : 26,
      lastSelectedEmulatorIndex: safeSelectedIndex,
    };
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
        background: palette.shellBackground,
        color: palette.shellText,
        padding: 24,
        fontFamily: 'Segoe UI, Arial, sans-serif',
        overflowY: 'auto',
        scrollbarWidth: 'auto',
        scrollbarColor: `${palette.panelBorder} ${palette.shellBackground}`,
      }}
    >
      <style>{`
        @keyframes themeButtonGloss {
          0% { opacity: 0.82; transform: translateY(-6%); }
          50% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0.82; transform: translateY(-6%); }
        }

        .config-scroll-shell::-webkit-scrollbar {
          width: 12px;
        }

        .config-scroll-shell::-webkit-scrollbar-track {
          background: ${palette.shellBackground};
          border-left: 1px solid ${palette.panelBorder};
        }

        .config-scroll-shell::-webkit-scrollbar-thumb {
          background: ${palette.panelBorder};
          border-radius: 4px;
          border: 3px solid ${palette.shellBackground};
        }

        .config-scroll-shell::-webkit-scrollbar-thumb:hover {
          background: ${palette.panelBorder};
        }
      `}</style>
      <div
        style={{
          width: 'min(920px, 100%)',
          background: palette.panelBackground,
          border: `1px solid ${palette.panelBorder}`,
          borderRadius: 0,
          boxShadow: 'none',
          backdropFilter: 'none',
          padding: 24,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: palette.shellText }}>
            Setup
          </div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05, margin: '8px 0 8px', fontWeight: 700, color: palette.shellText }}>Configure geUI</h1>
          <p style={{ margin: 0, color: palette.shellText, maxWidth: 680, fontSize: 15, lineHeight: 1.5 }}>
            Choose emulators and their game folders.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {emulators.map((emulator, index) => (
            <section
              key={index}
              style={{
                background: palette.cardBackground,
                border: `1px solid ${palette.cardBorder}`,
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
                  <div style={{ fontSize: 17, fontWeight: 700, color: palette.shellText }}>Emulator {index + 1}</div>
                  <div style={{ fontSize: 13, color: palette.shellText }}>One row per console or platform.</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeEmulator(index)}
                  disabled={emulators.length === 1}
                  style={{
                    border: `1px solid ${palette.panelBorder}`,
                    borderRadius: 4,
                    padding: '8px 12px',
                    background: palette.secondaryBackground,
                    color: palette.secondaryText,
                    cursor: emulators.length === 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    opacity: emulators.length === 1 ? 0.55 : 1,
                  }}
                >
                  Remove
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(280px, 1.5fr) minmax(180px, 0.8fr)',
                  gap: 12,
                  alignItems: 'end',
                  marginBottom: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: palette.shellText }}>Emulator Name</span>
                  <select
                    value={emulator.name}
                    onChange={event => updateEmulator(index, 'name', event.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      borderRadius: 4,
                      border: `1px solid ${palette.panelBorder}`,
                      background: palette.inputBackground,
                      color: palette.inputText,
                      padding: '10px 12px',
                      fontSize: 16,
                      outline: 'none',
                    }}
                  >
                    {emulatorOptions.map(option => (
                      <option key={option.label} value={option.label} disabled={option.disabled}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: palette.shellText }}>Theme</span>
                  <select
                    value={emulator.theme}
                    onChange={event => updateEmulator(index, 'theme', event.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      borderRadius: 4,
                      border: `1px solid ${palette.panelBorder}`,
                      background: palette.inputBackground,
                      color: palette.inputText,
                      padding: '10px 12px',
                      fontSize: 16,
                      outline: 'none',
                    }}
                  >
                    {themeOptions.map(option => (
                      <option key={option.value} value={option.value} disabled={option.disabled}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: palette.shellText }}>Emulator Path</span>
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
                        border: `1px solid ${palette.panelBorder}`,
                        background: palette.inputBackground,
                        color: palette.inputText,
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
                  <span style={{ fontWeight: 600, color: palette.shellText }}>Games Directory</span>
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
                        border: `1px solid ${palette.panelBorder}`,
                        background: palette.inputBackground,
                        color: palette.inputText,
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
              border: `1px solid ${palette.panelBorder}`,
              background: palette.secondaryBackground,
              color: palette.secondaryText,
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
            {isEditing ? 'Save Changes' : 'Save and Continue'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: `1px solid ${palette.panelBorder}`,
                background: palette.secondaryBackground,
                color: palette.secondaryText,
                borderRadius: 4,
                padding: '12px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
          {!isEditing && (
            <button
              type="button"
              onClick={handleReset}
              style={{
                border: `1px solid ${palette.panelBorder}`,
                background: palette.secondaryBackground,
                color: palette.secondaryText,
                borderRadius: 4,
                padding: '12px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          )}
        </div>

        {error && <div style={{ marginTop: 16, color: palette.shellText, fontWeight: 600 }}>{error}</div>}

        <button
          type="button"
          onClick={toggleThemeVariant}
          aria-pressed={isDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            position: 'fixed',
            left: 18,
            bottom: 16,
            zIndex: 210,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: isDark ? '1px solid rgba(84, 103, 121, 0.62)' : '1px solid rgba(186, 195, 204, 0.62)',
            background: isDark
              ? 'linear-gradient(180deg, rgba(21, 27, 37, 0.86) 0%, rgba(14, 18, 25, 0.9) 100%)'
              : 'rgba(245, 248, 252, 0.84)',
            boxShadow: isDark
              ? '0 10px 20px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255,255,255,0.08)'
              : '0 10px 20px rgba(23, 30, 39, 0.18), inset 0 1px 0 rgba(255,255,255,0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            padding: 0,
            overflow: 'hidden',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 1,
              right: 1,
              top: 1,
              bottom: 1,
              borderRadius: 'inherit',
              background: isDark
                ? 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0.02) 48%, rgba(255,255,255,0) 70%)'
                : 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.82) 22%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 72%)',
              boxShadow: isDark
                ? 'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(255,255,255,0.06)'
                : 'inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(160,170,182,0.22)',
              pointerEvents: 'none',
              animation: 'themeButtonGloss 2.4s ease-in-out infinite',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              background: isDark
                ? 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%)'
                : 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 45%)',
              pointerEvents: 'none',
            }}
          />

          {isDark ? (
            moonIconUrl ? (
              <img src={moonIconUrl} alt="" aria-hidden="true" style={{ width: 18, height: 18, filter: 'brightness(0) invert(1)' }} />
            ) : (
              <span style={{ color: '#ffffff', fontSize: 18 }}>☾</span>
            )
          ) : sunIconUrl ? (
            <img src={sunIconUrl} alt="" aria-hidden="true" style={{ width: 18, height: 18 }} />
          ) : (
            <span style={{ color: '#111111', fontSize: 18 }}>☀</span>
          )}
        </button>
      </div>
    </div>
  );
};
