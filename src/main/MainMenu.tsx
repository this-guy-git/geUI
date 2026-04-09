import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Config } from './App';
import { ThemeWiiU } from './themes/ThemeWiiU';
import { ThemeXbox } from './themes/ThemeXbox';
import { ThemeXMB } from './themes/ThemeXMB';

declare const require: any;

const { ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const nodePath = require('path');

type ThemeKey = 'wiiu' | 'xbox' | 'xmb';
type WiiUIntroPhase = 'off' | 'tgl' | 'geui' | 'fade';

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

const resolveFileUrl = (relativeOrAbsolutePath: string) => {
  if (!relativeOrAbsolutePath) {
    return '';
  }

  const candidatePaths = nodePath.isAbsolute(relativeOrAbsolutePath)
    ? [relativeOrAbsolutePath]
    : [
        nodePath.join(process.cwd(), relativeOrAbsolutePath),
        nodePath.join(((process as any).resourcesPath as string) || '', relativeOrAbsolutePath),
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

export const MainMenu: React.FC<{ config: Config }> = ({ config }) => {
  const [selectedEmu, setSelectedEmu] = useState(0);
  const [volumePercent, setVolumePercent] = useState(26);
  const [isMuted, setIsMuted] = useState(false);
  const [isEmulatorRunning, setIsEmulatorRunning] = useState(false);
  const [musicReplayKey, setMusicReplayKey] = useState(0);
  const [introPhase, setIntroPhase] = useState<WiiUIntroPhase>(() => {
    const initialTheme = (config.emulators[0]?.theme || 'wiiu') as ThemeKey;
    return initialTheme === 'wiiu' ? 'tgl' : 'off';
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const emu = config.emulators[selectedEmu];
  const activeTheme = (emu.theme || 'wiiu') as ThemeKey;
  const tglLogoUrl = useMemo(() => resolveFileUrl('assets/images/tglb.png'), []);
  const startupMusicUrl = useMemo(() => {
    return resolveFileUrl(PRELOADED_THEME_MUSIC[activeTheme]?.startup || '');
  }, [activeTheme]);

  const idleMusicUrl = useMemo(() => {
    return resolveFileUrl(PRELOADED_THEME_MUSIC[activeTheme]?.idle || '');
  }, [activeTheme]);

  const adjustVolumeBy = useCallback((delta: number) => {
    setVolumePercent(previous => {
      const next = Math.max(0, Math.min(100, previous + delta));
      return next;
    });
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(previous => !previous);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = Math.max(0, Math.min(1, volumePercent / 100));
    audio.muted = isMuted;
  }, [isMuted, volumePercent]);

  useEffect(() => {
    if (introPhase === 'off') {
      return;
    }

    const durations: Record<Exclude<WiiUIntroPhase, 'off'>, number> = {
      tgl: 3000,
      geui: 3000,
      fade: 900,
    };

    const timer = window.setTimeout(() => {
      if (introPhase === 'tgl') {
        setIntroPhase('geui');
        return;
      }

      if (introPhase === 'geui') {
        setIntroPhase('fade');
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
      <audio ref={audioRef} />
      {emu.theme === 'wiiu' ? (
        <ThemeWiiU
          config={config}
          selectedEmu={selectedEmu}
          setSelectedEmu={setSelectedEmu}
          onVolumeAdjust={adjustVolumeBy}
          onToggleMute={toggleMute}
        />
      ) : emu.theme === 'xbox' ? (
        <ThemeXbox config={config} selectedEmu={selectedEmu} setSelectedEmu={setSelectedEmu} />
      ) : (
        <ThemeXMB config={config} selectedEmu={selectedEmu} setSelectedEmu={setSelectedEmu} />
      )}

      <div
        style={{
          position: 'fixed',
          right: 18,
          bottom: 16,
          zIndex: 190,
          width: 244,
          borderRadius: 16,
          border: '1px solid rgba(186, 195, 204, 0.62)',
          background:
            'linear-gradient(180deg, rgba(244,248,252,0.82) 0%, rgba(210,218,227,0.84) 55%, rgba(190,200,210,0.82) 100%)',
          boxShadow:
            '0 10px 20px rgba(23, 30, 39, 0.22), inset 0 1px 0 rgba(255,255,255,0.78), inset 0 -1px 0 rgba(162,171,182,0.42)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
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
            top: 5,
            height: 18,
            borderRadius: 999,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.1) 100%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '34px 1fr 42px', gap: 10, alignItems: 'center', padding: '10px 12px' }}>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute music' : 'Mute music'}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: '1px solid rgba(153, 164, 176, 0.72)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(226,234,241,0.86) 100%)',
              color: '#5b6773',
              fontSize: 15,
              cursor: 'pointer',
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
            style={{ width: '100%', accentColor: '#909aa5', cursor: 'pointer' }}
          />

          <div style={{ textAlign: 'right', color: '#4f5a66', fontWeight: 700, fontSize: 12 }}>{volumePercent}%</div>
        </div>
      </div>

      {introPhase !== 'off' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            background: '#ffffff',
            display: 'grid',
            placeItems: 'center',
            opacity: introPhase === 'fade' ? 0 : 1,
            transition: 'opacity 900ms ease',
            pointerEvents: 'none',
          }}
        >
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
                opacity: introPhase === 'tgl' ? 1 : 0,
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
                <div style={{ fontSize: 42, color: '#0f1720', letterSpacing: 1, fontWeight: 700 }}>tgL</div>
              )}
            </div>

            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                opacity: introPhase === 'geui' ? 1 : 0,
                transition: 'opacity 380ms ease',
              }}
            >
              <div
                style={{
                  fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
                  fontSize: 'clamp(48px, 10vw, 112px)',
                  fontWeight: 700,
                  color: '#111822',
                  letterSpacing: '0.02em',
                }}
              >
                geUI
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
