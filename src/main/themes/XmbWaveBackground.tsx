import React, { useEffect, useRef } from 'react';
import { ThemeVariant } from '../App';

type XmbWaveBackgroundProps = {
  themeVariant: ThemeVariant;
  canvasOpacityDark?: number;
  canvasOpacityLight?: number;
};

export const XmbWaveBackground: React.FC<XmbWaveBackgroundProps> = ({
  themeVariant,
  canvasOpacityDark = 0.76,
  canvasOpacityLight = 0.68,
}) => {
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDark = themeVariant === 'dark';

  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) {
      return;
    }

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });

    if (!gl) {
      return;
    }

    const vertexShaderSource = `
      attribute vec2 aVertexPosition;
      void main() {
        gl_Position = vec4(aVertexPosition, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision highp float;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform bool uLightMode;

      const float waveWidthFactor = 1.5;

      vec3 calcSine(
        vec2 uv,
        float speed,
        float frequency,
        float amplitude,
        float phaseShift,
        float verticalOffset,
        vec3 baseColor,
        float lineWidth,
        float sharpness,
        bool invertFalloff
      ) {
        float angle = uTime * speed * frequency * -1.0 + (phaseShift + uv.x) * 2.0;
        float waveY = sin(angle) * amplitude + verticalOffset;
        float deltaY = waveY - uv.y;
        float distanceVal = distance(waveY, uv.y);

        if (invertFalloff) {
          if (deltaY > 0.0) {
            distanceVal = distanceVal * 4.0;
          }
        } else {
          if (deltaY < 0.0) {
            distanceVal = distanceVal * 4.0;
          }
        }

        float smoothVal = smoothstep(lineWidth * waveWidthFactor, 0.0, distanceVal);
        float pixelSoftness = 3.0 / uResolution.y;
        smoothVal = smoothstep((lineWidth * waveWidthFactor) + pixelSoftness, pixelSoftness, distanceVal);
        float scaleVal = pow(smoothVal, sharpness);

        return min(baseColor * scaleVal, baseColor);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;
        vec2 waveUv = vec2(uv.x, (uv.y - 0.62) * 1.2 + 0.62);

        vec3 accumulatedColor = vec3(0.0);
        accumulatedColor += calcSine(waveUv, 0.2, 0.20, 0.15, 0.0, 0.57, vec3(0.31), 0.08, 10.0, false);
        accumulatedColor += calcSine(waveUv, 0.4, 0.40, 0.12, 0.0, 0.57, vec3(0.31), 0.08, 11.0, false);
        accumulatedColor += calcSine(waveUv, 0.3, 0.60, 0.11, 0.0, 0.57, vec3(0.31), 0.045, 14.0, false);
        accumulatedColor += calcSine(waveUv, 0.1, 0.26, 0.055, 0.0, 0.38, vec3(0.31), 0.08, 11.0, true);
        accumulatedColor += calcSine(waveUv, 0.3, 0.36, 0.055, 0.0, 0.38, vec3(0.31), 0.08, 11.0, true);
        accumulatedColor += calcSine(waveUv, 0.5, 0.46, 0.055, 0.0, 0.38, vec3(0.31), 0.045, 14.0, true);
        accumulatedColor += calcSine(waveUv, 0.2, 0.58, 0.04, 0.0, 0.38, vec3(0.31), 0.14, 10.0, true);

        float maxChannel = max(accumulatedColor.r, max(accumulatedColor.g, accumulatedColor.b));

        vec3 outputColor = accumulatedColor;
        if (uLightMode) {
          outputColor = vec3(1.0);
          outputColor -= clamp(accumulatedColor * vec3(0.12, 0.14, 0.18), 0.0, 0.28);
          outputColor = mix(outputColor, vec3(0.92, 0.97, 1.0), 0.2);
        } else {
          outputColor *= vec3(0.93, 0.83, 1.0);
        }

        float alpha = clamp(maxChannel * 1.45, 0.0, 1.0);
        gl_FragColor = vec4(outputColor, alpha * 0.86);
      }
    `;

    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) {
        return null;
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    };

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      return;
    }

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) {
      return;
    }

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      return;
    }

    gl.useProgram(shaderProgram);

    const posLoc = gl.getAttribLocation(shaderProgram, 'aVertexPosition');
    const timeLoc = gl.getUniformLocation(shaderProgram, 'uTime');
    const resolutionLoc = gl.getUniformLocation(shaderProgram, 'uResolution');
    const lightModeLoc = gl.getUniformLocation(shaderProgram, 'uLightMode');

    const buffer = gl.createBuffer();
    if (!buffer || posLoc === -1 || !timeLoc || !resolutionLoc || !lightModeLoc) {
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    let rafId = 0;

    const resizeCanvas = () => {
      const nativeDpr = window.devicePixelRatio || 1;
      const targetDpr = isDark ? 1.6 : 1.8;
      const dpr = Math.min(2, Math.max(nativeDpr, targetDpr));
      const displayWidth = Math.floor(window.innerWidth * dpr);
      const displayHeight = Math.floor(window.innerHeight * dpr);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const renderFrame = (timeMs: number) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(timeLoc, timeMs * 0.001);
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform1i(lightModeLoc, isDark ? 0 : 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafId = window.requestAnimationFrame(renderFrame);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(shaderProgram);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [isDark]);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: isDark
            ? 'radial-gradient(780px 360px at 85% -4%, rgba(160, 126, 242, 0.28) 0%, rgba(160, 126, 242, 0) 70%)'
            : 'radial-gradient(900px 420px at 85% -4%, rgba(235, 248, 255, 0.5) 0%, rgba(235, 248, 255, 0) 72%)',
        }}
      />

      <canvas
        ref={waveCanvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: isDark ? canvasOpacityDark : canvasOpacityLight,
        }}
      />
    </>
  );
};
