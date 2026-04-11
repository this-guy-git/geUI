import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Config, ThemeVariant } from './App';
import { ThemeWiiU } from './themes/ThemeWiiU';
import { ThemeXbox } from './themes/ThemeXbox';
import { ThemeXMB } from './themes/ThemeXMB';
import { XmbWaveBackground } from './themes/XmbWaveBackground';

declare const require: any;

const { ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const nodePath = require('path');

type ThemeKey = 'wiiu' | 'xbox' | 'xmb';
type IntroPhase = 'off' | 'wiiu-tgl' | 'wiiu-geui' | 'wiiu-fade' | 'xmb-boot' | 'xmb-fade';

const PRELOADED_THEME_MUSIC: Record<ThemeKey, { startup: string; idle: string }> = {
  wiiu: {
    startup: 'assets/music/wiiu-startup.mp3',
    idle: 'assets/music/wiiu-idle.mp3',
  },
  xbox: {
    startup: 'assets/music/xbox-startup.mp3',
    idle: 'assets/music/xbox-idle.mp3',
  },
  xmb: {
    startup: 'assets/music/xmb-startup.mp3',
    idle: 'assets/music/xmb-idle.mp3',
  },
};

const getInitialSelectedEmulatorIndex = (config: Config) => {
  const configuredIndex = Number(config.lastSelectedEmulatorIndex);
  if (Number.isFinite(configuredIndex) && configuredIndex >= 0 && configuredIndex < config.emulators.length) {
    return configuredIndex;
  }

  return 0;
};

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

export const MainMenu: React.FC<{ config: Config; onOpenSettings?: () => void }> = ({ config, onOpenSettings }) => {
  const [selectedEmu, setSelectedEmu] = useState(() => {
    return getInitialSelectedEmulatorIndex(config);
  });
  const [volumePercent, setVolumePercent] = useState(() => {
    const configured = Number(config.menuVolume);
    if (Number.isFinite(configured)) {
      return Math.max(0, Math.min(100, configured));
    }

    return 26;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [themeFadeId, setThemeFadeId] = useState(0);
  const [themeVariant, setThemeVariant] = useState<ThemeVariant>(() => {
    if (config.themeVariant === 'dark') {
      return 'dark';
    }

    if (typeof window !== 'undefined' && window.localStorage.getItem('geui-theme-variant') === 'dark') {
      return 'dark';
    }

    return 'light';
  });
  const [isEmulatorRunning, setIsEmulatorRunning] = useState(false);
  const [musicReplayKey, setMusicReplayKey] = useState(0);
  const l3HoldRef = useRef(false);
  const lbHoldRef = useRef(false);
  const rbHoldRef = useRef(false);
  const themeVariantRef = useRef<ThemeVariant>(themeVariant);
  const persistedConfigRef = useRef<Config>(config);
  const [introPhase, setIntroPhase] = useState<IntroPhase>(() => {
    const initialTheme = (config.emulators[getInitialSelectedEmulatorIndex(config)]?.theme || 'wiiu') as ThemeKey;
    if (initialTheme === 'wiiu') {
      return 'wiiu-tgl';
    }

    if (initialTheme === 'xmb') {
      return 'xmb-boot';
    }

    return 'off';
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const emu = config.emulators[selectedEmu];
  const activeTheme = (emu.theme || 'wiiu') as ThemeKey;
  const isIntroActive = introPhase !== 'off';
  const isXmbTheme = activeTheme === 'xmb';
  const xmbLeftShoulderLabel = isXmbTheme ? 'L1' : 'LB';
  const xmbRightShoulderLabel = isXmbTheme ? 'R1' : 'RB';
  const uiControlText = themeVariant === 'dark' ? '#f4f9ff' : '#334155';
  const xmbControlText = themeVariant === 'dark' ? '#ffffff' : '#d9eaf9';
  const xmbControlShadow = themeVariant === 'dark'
    ? '0 0 10px rgba(255,255,255,0.92), 0 0 22px rgba(182, 210, 255, 0.34)'
    : '0 0 8px rgba(255,255,255,0.82), 0 0 18px rgba(200, 232, 255, 0.28)';
  const xmbControlAccent = themeVariant === 'dark' ? 'rgba(168, 207, 255, 0.24)' : 'rgba(230, 243, 255, 0.18)';
  const tglLogoUrl = useMemo(() => resolveFileUrl(themeVariant === 'dark' ? 'assets/images/tglw.png' : 'assets/images/tglb.png'), [themeVariant]);
  const sunIconUrl = useMemo(() => resolveFileUrl('assets/images/brightness-high-fill.svg'), []);
  const moonIconUrl = useMemo(() => resolveFileUrl('assets/images/moon-stars-fill.svg'), []);
  const startupMusicUrl = useMemo(() => resolveFileUrl(PRELOADED_THEME_MUSIC[activeTheme]?.startup || ''), [activeTheme]);
  const idleMusicUrl = useMemo(() => resolveFileUrl(PRELOADED_THEME_MUSIC[activeTheme]?.idle || ''), [activeTheme]);

  const adjustVolumeBy = useCallback((delta: number) => {
    setVolumePercent(previous => Math.max(0, Math.min(100, previous + delta)));
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(previous => !previous);
  }, []);

  const toggleThemeVariant = useCallback((nextVariant: ThemeVariant) => {
    setThemeFadeId(current => current + 1);
    setThemeVariant(nextVariant);

    const mergedConfig: Config = { ...persistedConfigRef.current, themeVariant: nextVariant };
    persistedConfigRef.current = mergedConfig;

    ipcRenderer.invoke('save-config', mergedConfig).catch(() => {
      // Keep the UI responsive even if persisting fails.
    });
  }, []);

  const switchEmulator = useCallback((delta: number) => {
    const emuCount = config.emulators.length;
    if (emuCount < 2) {
      return;
    }

    setSelectedEmu(previous => {
      const rawNext = previous + delta;

      if (rawNext < 0) {
        return emuCount - 1;
      }

      if (rawNext >= emuCount) {
        return 0;
      }

      return rawNext;
    });
  }, [config.emulators.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = Math.max(0, Math.min(1, volumePercent / 100));
    audio.muted = isMuted;
  }, [isMuted, volumePercent]);

  useEffect(() => {
    themeVariantRef.current = themeVariant;
  }, [themeVariant]);

  useEffect(() => {
    persistedConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    if (selectedEmu < config.emulators.length) {
      return;
    }

    setSelectedEmu(0);
  }, [config.emulators.length, selectedEmu]);

  useEffect(() => {
    window.localStorage.setItem('geui-theme-variant', themeVariant);
    document.documentElement.dataset.themeVariant = themeVariant;
    document.documentElement.style.colorScheme = themeVariant;
  }, [themeVariant]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const mergedConfig: Config = { ...persistedConfigRef.current, menuVolume: volumePercent };
      persistedConfigRef.current = mergedConfig;

      ipcRenderer.invoke('save-config', mergedConfig).catch(() => {
        // Keep the UI responsive even if persisting fails.
      });
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [volumePercent]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const mergedConfig: Config = { ...persistedConfigRef.current, lastSelectedEmulatorIndex: selectedEmu };
      persistedConfigRef.current = mergedConfig;

      ipcRenderer.invoke('save-config', mergedConfig).catch(() => {
        // Keep the UI responsive even if persisting fails.
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedEmu]);

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(gamepads).find(candidate => candidate && candidate.connected && candidate.mapping === 'standard');
      const pressL3 = !!pad?.buttons?.[10]?.pressed;
      const pressLB = !!pad?.buttons?.[4]?.pressed;
      const pressRB = !!pad?.buttons?.[5]?.pressed;

      if (isIntroActive) {
        l3HoldRef.current = pressL3;
        lbHoldRef.current = pressLB;
        rbHoldRef.current = pressRB;
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      if (pressL3 && !l3HoldRef.current) {
        const nextVariant: ThemeVariant = themeVariantRef.current === 'dark' ? 'light' : 'dark';
        toggleThemeVariant(nextVariant);
      }

      if (pressLB && !lbHoldRef.current) {
        switchEmulator(-1);
      }

      if (pressRB && !rbHoldRef.current) {
        switchEmulator(1);
      }

      l3HoldRef.current = pressL3;
      lbHoldRef.current = pressLB;
      rbHoldRef.current = pressRB;
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      l3HoldRef.current = false;
      lbHoldRef.current = false;
      rbHoldRef.current = false;
    };
  }, [isIntroActive, switchEmulator, toggleThemeVariant]);

  useEffect(() => {
    if (introPhase === 'off') {
      return;
    }

    const durations: Record<Exclude<IntroPhase, 'off'>, number> = {
      'wiiu-tgl': 3000,
      'wiiu-geui': 3000,
      'wiiu-fade': 900,
      'xmb-boot': 2400,
      'xmb-fade': 900,
    };

    const timer = window.setTimeout(() => {
      if (introPhase === 'wiiu-tgl') {
        setIntroPhase('wiiu-geui');
        return;
      }

      if (introPhase === 'wiiu-geui') {
        setIntroPhase('wiiu-fade');
        return;
      }

      if (introPhase === 'xmb-boot') {
        setIntroPhase('xmb-fade');
        return;
      }

      setIntroPhase('off');
    }, durations[introPhase]);

    return () => {
      window.clearTimeout(timer);
    };
  }, [introPhase]);

  useEffect(() => {
    const handleLaunchState = (_event: any, payload: { state?: string }) => {
      if (!payload || !payload.state) {
        return;
      }

      if (payload.state === 'started') {
        setIsEmulatorRunning(true);
        return;
      }

      if (payload.state === 'closed') {
        setIsEmulatorRunning(false);
        setMusicReplayKey(current => current + 1);
      }
    };

    ipcRenderer.on('emu-launch-state', handleLaunchState);

    return () => {
      ipcRenderer.removeListener('emu-launch-state', handleLaunchState);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        ipcRenderer.send('close-app');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    let cancelled = false;

    const stopAudio = () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };

    if (isEmulatorRunning) {
      audio.pause();
      return;
    }

    const playIdle = () => {
      if (!idleMusicUrl || cancelled) {
        return;
      }

      audio.loop = true;
      audio.src = idleMusicUrl;
      audio.load();
      audio.play().catch(() => {
        // Ignore autoplay restrictions.
      });
    };

    if (startupMusicUrl) {
      const handleStartupEnd = () => {
        playIdle();
      };

      const handleStartupError = () => {
        playIdle();
      };

      audio.loop = false;
      audio.src = startupMusicUrl;
      audio.load();
      audio.addEventListener('ended', handleStartupEnd);
      audio.addEventListener('error', handleStartupError);
      audio.play().catch(() => {
        playIdle();
      });

      return () => {
        cancelled = true;
        audio.removeEventListener('ended', handleStartupEnd);
        audio.removeEventListener('error', handleStartupError);
        audio.pause();
      };
    }

    if (idleMusicUrl) {
      playIdle();
      return () => {
        cancelled = true;
        audio.pause();
      };
    }

    stopAudio();

    return () => {
      cancelled = true;
      audio.pause();
    };
  }, [idleMusicUrl, isEmulatorRunning, musicReplayKey, startupMusicUrl]);

  return (
    <>
      <style>{`
        @keyframes themeGlobalFade {
          0% { opacity: 0.68; }
          100% { opacity: 1; }
        }

        @keyframes xmbIntroRibbon {
          0% { transform: translateX(-6%) translateY(0px) scaleX(1); opacity: 0.22; }
          50% { transform: translateX(3%) translateY(-6px) scaleX(1.02); opacity: 0.48; }
          100% { transform: translateX(-6%) translateY(0px) scaleX(1); opacity: 0.22; }
        }

        @keyframes xmbIntroGlow {
          0% { opacity: 0.38; }
          50% { opacity: 0.82; }
          100% { opacity: 0.38; }
        }

        @keyframes themeButtonGloss {
          0% { opacity: 0.82; transform: translateY(-6%); }
          50% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0.82; transform: translateY(-6%); }
        }
      `}</style>

      <audio ref={audioRef} />

      <div
        key={`${themeVariant}-${themeFadeId}`}
        style={{
          minHeight: '100vh',
          position: 'relative',
          overflow: 'hidden',
          background: themeVariant === 'dark'
            ? 'radial-gradient(1300px 680px at 50% -28%, rgba(32, 43, 61, 1) 0%, rgba(17, 23, 33, 1) 52%, rgba(8, 11, 17, 1) 100%)'
            : 'radial-gradient(1300px 680px at 50% -28%, rgba(255,255,255,1) 0%, rgba(241,245,247,1) 50%, rgba(224,231,236,1) 100%)',
          animation: 'themeGlobalFade 0.4s ease-out both',
        }}
      >
        {config.emulators.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => switchEmulator(-1)}
              disabled={isIntroActive}
              aria-label="Switch to previous emulator (LB)"
              style={{
                position: 'fixed',
                left: 18,
                top: 14,
                zIndex: 190,
                minWidth: isXmbTheme ? 50 : 54,
                height: isXmbTheme ? 24 : 28,
                borderRadius: 999,
                border: isXmbTheme ? '1px solid rgba(205, 228, 255, 0.36)' : 'none',
                background: isXmbTheme
                  ? 'linear-gradient(180deg, rgba(18, 36, 66, 0.9) 0%, rgba(8, 17, 32, 0.96) 100%)'
                  : (themeVariant === 'dark'
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(255,255,255,0.16)'),
                color: isXmbTheme ? xmbControlText : uiControlText,
                boxShadow: isXmbTheme
                  ? '0 8px 16px rgba(3, 10, 22, 0.18), inset 0 1px 0 rgba(255,255,255,0.16)'
                  : 'none',
                backdropFilter: isXmbTheme ? 'blur(10px)' : 'blur(8px)',
                WebkitBackdropFilter: isXmbTheme ? 'blur(10px)' : 'blur(8px)',
                display: 'grid',
                placeItems: 'center',
                padding: '0 12px',
                cursor: 'pointer',
                opacity: isIntroActive ? 0.45 : 1,
                fontWeight: isXmbTheme ? 800 : 700,
                letterSpacing: isXmbTheme ? 1.8 : 0.8,
                fontSize: isXmbTheme ? 10 : 12,
                overflow: 'hidden',
                textShadow: isXmbTheme ? xmbControlShadow : 'none',
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
                  background: isXmbTheme
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.08) 34%, rgba(255,255,255,0) 76%)'
                    : (themeVariant === 'dark'
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0.02) 48%, rgba(255,255,255,0) 72%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.82) 22%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 72%)'),
                  boxShadow: isXmbTheme
                    ? 'inset 0 1px 0 rgba(255,255,255,0.16)'
                    : (themeVariant === 'dark'
                      ? 'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(255,255,255,0.06)'
                      : 'inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(160,170,182,0.22)'),
                  pointerEvents: 'none',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  background: isXmbTheme
                    ? 'linear-gradient(180deg, rgba(126, 183, 255, 0.24) 0%, rgba(126, 183, 255, 0) 100%)'
                    : (themeVariant === 'dark'
                      ? 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%)'
                      : 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 45%)'),
                  pointerEvents: 'none',
                }}
              />
              {xmbLeftShoulderLabel}
            </button>

            <button
              type="button"
              onClick={() => switchEmulator(1)}
              disabled={isIntroActive}
              aria-label="Switch to next emulator (RB)"
              style={{
                position: 'fixed',
                right: 18,
                top: 14,
                zIndex: 190,
                minWidth: isXmbTheme ? 50 : 54,
                height: isXmbTheme ? 24 : 28,
                borderRadius: 999,
                border: isXmbTheme ? '1px solid rgba(205, 228, 255, 0.36)' : 'none',
                background: isXmbTheme
                  ? 'linear-gradient(180deg, rgba(18, 36, 66, 0.9) 0%, rgba(8, 17, 32, 0.96) 100%)'
                  : (themeVariant === 'dark'
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(255,255,255,0.16)'),
                color: isXmbTheme ? xmbControlText : uiControlText,
                boxShadow: isXmbTheme
                  ? '0 8px 16px rgba(3, 10, 22, 0.18), inset 0 1px 0 rgba(255,255,255,0.16)'
                  : 'none',
                backdropFilter: isXmbTheme ? 'blur(10px)' : 'blur(8px)',
                WebkitBackdropFilter: isXmbTheme ? 'blur(10px)' : 'blur(8px)',
                display: 'grid',
                placeItems: 'center',
                padding: '0 12px',
                cursor: 'pointer',
                opacity: isIntroActive ? 0.45 : 1,
                fontWeight: isXmbTheme ? 800 : 700,
                letterSpacing: isXmbTheme ? 1.8 : 0.8,
                fontSize: isXmbTheme ? 10 : 12,
                overflow: 'hidden',
                textShadow: isXmbTheme ? xmbControlShadow : 'none',
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
                  background: isXmbTheme
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.08) 34%, rgba(255,255,255,0) 76%)'
                    : (themeVariant === 'dark'
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0.02) 48%, rgba(255,255,255,0) 72%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.82) 22%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 72%)'),
                  boxShadow: isXmbTheme
                    ? 'inset 0 1px 0 rgba(255,255,255,0.16)'
                    : (themeVariant === 'dark'
                      ? 'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(255,255,255,0.06)'
                      : 'inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(160,170,182,0.22)'),
                  pointerEvents: 'none',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  background: isXmbTheme
                    ? 'linear-gradient(180deg, rgba(126, 183, 255, 0.24) 0%, rgba(126, 183, 255, 0) 100%)'
                    : (themeVariant === 'dark'
                      ? 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%)'
                      : 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 45%)'),
                  pointerEvents: 'none',
                }}
              />
              {xmbRightShoulderLabel}
            </button>
          </>
        )}

        {emu.theme === 'wiiu' ? (
          <ThemeWiiU
            config={config}
            selectedEmu={selectedEmu}
            setSelectedEmu={setSelectedEmu}
            themeVariant={themeVariant}
            inputLocked={isIntroActive}
            onVolumeAdjust={adjustVolumeBy}
            onToggleMute={toggleMute}
          />
        ) : emu.theme === 'xbox' ? (
          <ThemeXbox config={config} selectedEmu={selectedEmu} setSelectedEmu={setSelectedEmu} themeVariant={themeVariant} />
        ) : (
          <ThemeXMB config={config} selectedEmu={selectedEmu} setSelectedEmu={setSelectedEmu} themeVariant={themeVariant} inputLocked={isIntroActive} />
        )}

        <button
          type="button"
          onClick={() => toggleThemeVariant(themeVariant === 'dark' ? 'light' : 'dark')}
          aria-pressed={themeVariant === 'dark'}
          aria-label={themeVariant === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            position: 'fixed',
            left: 18,
            bottom: 16,
            zIndex: 190,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: themeVariant === 'dark' ? '1px solid rgba(84, 103, 121, 0.62)' : '1px solid rgba(186, 195, 204, 0.62)',
            background: themeVariant === 'dark'
              ? 'linear-gradient(180deg, rgba(21, 27, 37, 0.86) 0%, rgba(14, 18, 25, 0.9) 100%)'
              : 'rgba(245, 248, 252, 0.84)',
            boxShadow: themeVariant === 'dark'
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
              background: themeVariant === 'dark'
                ? 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0.02) 48%, rgba(255,255,255,0) 70%)'
                : 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.82) 22%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 72%)',
              boxShadow: themeVariant === 'dark'
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
              background: themeVariant === 'dark'
                ? 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%)'
                : 'radial-gradient(circle at 28% 24%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 45%)',
              pointerEvents: 'none',
            }}
          />
          {themeVariant === 'dark' ? (
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

        <div
          style={{
            position: 'fixed',
            right: 18,
            bottom: 16,
            zIndex: 190,
            width: isXmbTheme ? 274 : 282,
            borderRadius: isXmbTheme ? 12 : 16,
            border: isXmbTheme
              ? '1px solid rgba(205, 228, 255, 0.28)'
              : (themeVariant === 'dark' ? '1px solid rgba(84, 103, 121, 0.62)' : '1px solid rgba(186, 195, 204, 0.62)'),
            background: isXmbTheme
              ? 'linear-gradient(180deg, rgba(14, 30, 56, 0.9) 0%, rgba(7, 17, 34, 0.96) 100%)'
              : (themeVariant === 'dark'
                ? 'linear-gradient(180deg, rgba(21, 27, 37, 0.86) 0%, rgba(14, 18, 25, 0.9) 55%, rgba(11, 14, 20, 0.9) 100%)'
                : 'linear-gradient(180deg, rgba(244,248,252,0.82) 0%, rgba(210,218,227,0.84) 55%, rgba(190,200,210,0.82) 100%)'),
            boxShadow: isXmbTheme
              ? '0 8px 18px rgba(3, 10, 22, 0.18), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(255,255,255,0.04)'
              : (themeVariant === 'dark'
                ? '0 10px 20px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.04)'
                : '0 10px 20px rgba(23, 30, 39, 0.22), inset 0 1px 0 rgba(255,255,255,0.78), inset 0 -1px 0 rgba(162,171,182,0.42)'),
            backdropFilter: isXmbTheme ? 'blur(10px)' : 'blur(10px)',
            WebkitBackdropFilter: isXmbTheme ? 'blur(10px)' : 'blur(10px)',
            overflow: 'hidden',
            opacity: introPhase === 'off' ? 1 : 0,
            transition: 'opacity 260ms ease',
            pointerEvents: introPhase === 'off' ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              top: 6,
              height: 14,
              borderRadius: 999,
              background: isXmbTheme
                ? 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)'
                : (themeVariant === 'dark'
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.08) 100%)'),
              pointerEvents: 'none',
            }}
          />

          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '28px 1fr 36px 30px', gap: 8, alignItems: 'center', padding: '8px 12px' }}>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute music' : 'Mute music'}
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                border: 'none',
                background: isXmbTheme ? xmbControlAccent : 'transparent',
                color: isXmbTheme ? xmbControlText : uiControlText,
                fontSize: 14,
                cursor: 'pointer',
                textShadow: isXmbTheme ? xmbControlShadow : 'none',
              }}
            >
              {isMuted || volumePercent === 0 ? '🔇' : '🔊'}
            </button>

            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={event => setVolumePercent(Number(event.target.value))}
              aria-label="Menu music volume"
              style={{ width: '100%', accentColor: isXmbTheme ? '#bfe0ff' : '#f4f9ff', cursor: 'pointer', height: 4 }}
            />

            <div style={{ textAlign: 'right', color: isXmbTheme ? xmbControlText : uiControlText, fontWeight: isXmbTheme ? 700 : 600, fontSize: isXmbTheme ? 10 : 11, letterSpacing: 0.8, textShadow: isXmbTheme ? xmbControlShadow : 'none' }}>{volumePercent}%</div>

            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              aria-label="Open settings"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: 'none',
                background: isXmbTheme ? xmbControlAccent : 'transparent',
                color: isXmbTheme ? xmbControlText : uiControlText,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                lineHeight: 1,
                textShadow: isXmbTheme ? xmbControlShadow : 'none',
              }}
            >
              ⚙
            </button>
          </div>
        </div>

        {introPhase !== 'off' && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              background: introPhase.startsWith('xmb')
                ? (themeVariant === 'dark'
                  ? 'linear-gradient(180deg, #1f1237 0%, #1a1030 35%, #120a24 68%, #0b0718 100%)'
                  : 'linear-gradient(180deg, #3da6e6 0%, #2a8fce 34%, #1c73b5 66%, #12548d 100%)')
                : (themeVariant === 'dark' ? '#090b10' : '#ffffff'),
              display: 'grid',
              placeItems: 'center',
              opacity: introPhase.endsWith('fade') ? 0 : 1,
              transition: 'opacity 3000ms ease',
              pointerEvents: isIntroActive ? 'auto' : 'none',
            }}
          >
            {introPhase.startsWith('wiiu') ? (
              <div
                style={{
                  position: 'relative',
                  width: 'min(70vw, 560px)',
                  height: 'min(30vh, 220px)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    opacity: introPhase === 'wiiu-tgl' ? 1 : 0,
                    transition: 'opacity 380ms ease',
                  }}
                >
                  {tglLogoUrl ? (
                    <img
                      src={tglLogoUrl}
                      alt="tgL"
                      style={{ maxWidth: 'min(56vw, 420px)', maxHeight: 'min(20vh, 150px)', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ fontSize: 42, color: themeVariant === 'dark' ? '#eef7ff' : '#0f1720', letterSpacing: 1, fontWeight: 700 }}>tgL</div>
                  )}
                </div>

                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    opacity: introPhase === 'wiiu-geui' ? 1 : 0,
                    transition: 'opacity 380ms ease',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
                      fontSize: 'clamp(48px, 10vw, 112px)',
                      fontWeight: 700,
                      color: themeVariant === 'dark' ? '#eef7ff' : '#111822',
                      letterSpacing: '0.02em',
                    }}
                  >
                    geUI
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  position: 'relative',
                  width: '100vw',
                  height: '100vh',
                  overflow: 'hidden',
                }}
              >
                <XmbWaveBackground themeVariant={themeVariant} canvasOpacityDark={0.76} canvasOpacityLight={0.68} />

                <div
                  style={{
                    position: 'absolute',
                    left: '-16%',
                    right: '-16%',
                    top: '58%',
                    height: 54,
                    borderRadius: 999,
                    background: themeVariant === 'dark'
                      ? 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(232, 220, 255, 0.64) 28%, rgba(244, 236, 255, 0.8) 50%, rgba(232, 220, 255, 0.64) 72%, rgba(255,255,255,0) 100%)'
                      : 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(222, 241, 255, 0.7) 28%, rgba(244, 252, 255, 0.82) 50%, rgba(222, 241, 255, 0.7) 72%, rgba(255,255,255,0) 100%)',
                    filter: 'blur(0.5px)',
                    animation: 'xmbIntroRibbon 3.1s ease-in-out infinite',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: '-20%',
                    right: '-20%',
                    top: '61%',
                    height: 30,
                    borderRadius: 999,
                    background: themeVariant === 'dark'
                      ? 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(186, 152, 245, 0.34) 30%, rgba(216, 194, 255, 0.42) 50%, rgba(186, 152, 245, 0.34) 70%, rgba(255,255,255,0) 100%)'
                      : 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(178, 223, 255, 0.34) 30%, rgba(204, 234, 255, 0.42) 50%, rgba(178, 223, 255, 0.34) 70%, rgba(255,255,255,0) 100%)',
                    animation: 'xmbIntroRibbon 4.6s ease-in-out infinite',
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    right: '10%',
                    top: '42%',
                    fontFamily: "'Segoe UI', 'Trebuchet MS', sans-serif",
                    fontWeight: 300,
                    letterSpacing: '0.08em',
                    fontSize: 'clamp(54px, 9.2vw, 112px)',
                    color: 'rgba(244, 249, 255, 0.96)',
                    textShadow: '0 0 22px rgba(216, 236, 255, 0.55), 0 0 48px rgba(182, 210, 255, 0.25)',
                    animation: 'xmbIntroGlow 1.8s ease-in-out infinite',
                    lineHeight: 1,
                  }}
                >
                  geUI
                </div>

                <div
                  style={{
                    position: 'absolute',
                    right: '10.3%',
                    top: '56.5%',
                    fontFamily: "'Segoe UI', 'Trebuchet MS', sans-serif",
                    fontWeight: 500,
                    letterSpacing: '0.09em',
                    fontSize: 'clamp(14px, 1.45vw, 20px)',
                    color: 'rgba(226, 241, 255, 0.84)',
                    textShadow: '0 0 10px rgba(214, 235, 255, 0.38)',
                  }}
                >
                  this guy Labs
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
