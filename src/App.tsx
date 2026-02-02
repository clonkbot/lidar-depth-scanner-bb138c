import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

interface DepthPoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

type AppStatus = 'idle' | 'requesting' | 'streaming' | 'error' | 'unsupported';

function App() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [points, setPoints] = useState<DepthPoint[]>([]);
  const [scanAngle, setScanAngle] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Generate simulated depth points from video frame
  const generateDepthPoints = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    canvas.width = 64;
    canvas.height = 48;
    ctx.drawImage(video, 0, 0, 64, 48);

    const imageData = ctx.getImageData(0, 0, 64, 48);
    const data = imageData.data;
    const newPoints: DepthPoint[] = [];

    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const i = (y * 64 + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate luminance as depth approximation
        const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

        // Add some randomness for point cloud effect
        if (Math.random() > 0.3) {
          newPoints.push({
            x: (x / 64 - 0.5) * 2,
            y: (y / 48 - 0.5) * -2,
            z: luminance * 2 - 1,
            intensity: 0.3 + luminance * 0.7,
          });
        }
      }
    }

    return newPoints;
  }, []);

  // Main render loop
  useEffect(() => {
    if (status !== 'streaming') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let lastTime = 0;
    const fps = 15;
    const interval = 1000 / fps;

    const render = (time: number) => {
      if (time - lastTime >= interval) {
        lastTime = time;
        const newPoints = generateDepthPoints(video, canvas);
        setPoints(newPoints);
        setScanAngle((prev) => (prev + 3) % 360);
      }
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [status, generateDepthPoints]);

  const startCamera = async () => {
    setStatus('requesting');
    setErrorMessage('');

    try {
      // Check for camera support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('unsupported');
        setErrorMessage('Camera API not supported in this browser');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('streaming');
      }
    } catch (err) {
      setStatus('error');
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setErrorMessage('Camera access denied. Please grant permission.');
        } else if (err.name === 'NotFoundError') {
          setErrorMessage('No camera found on this device.');
        } else {
          setErrorMessage(err.message);
        }
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setStatus('idle');
    setPoints([]);
  };

  return (
    <div className="app">
      <div className="scan-overlay" />
      <div className="grid-overlay" />
      <div className="vignette" />

      {/* Hidden video element for camera feed */}
      <video ref={videoRef} playsInline muted className="hidden-video" />
      <canvas ref={canvasRef} className="hidden-canvas" />

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="status-indicator">
            <span className={`status-dot ${status === 'streaming' ? 'active' : ''}`} />
            <span className="status-text">
              {status === 'idle' && 'STANDBY'}
              {status === 'requesting' && 'INITIALIZING'}
              {status === 'streaming' && 'SCANNING'}
              {status === 'error' && 'ERROR'}
              {status === 'unsupported' && 'UNSUPPORTED'}
            </span>
          </div>
        </div>
        <div className="header-center">
          <h1 className="title">LIDAR DEPTH SCANNER</h1>
          <p className="subtitle">NIGHT VISION POINT CLOUD</p>
        </div>
        <div className="header-right">
          <div className="data-readout">
            <span className="label">PTS</span>
            <span className="value">{points.length.toString().padStart(4, '0')}</span>
          </div>
        </div>
      </header>

      {/* Main viewport */}
      <main className="viewport">
        {status === 'streaming' ? (
          <div className="point-cloud-container">
            <div
              className="scan-line"
              style={{ transform: `rotate(${scanAngle}deg)` }}
            />
            <svg className="point-cloud" viewBox="-1.2 -1.2 2.4 2.4" preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="0.01" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {points.map((point, i) => {
                const scale = 0.5 + point.z * 0.5;
                const size = 0.008 + point.z * 0.012;
                const hue = 140 + point.z * 40;
                return (
                  <circle
                    key={i}
                    cx={point.x * scale}
                    cy={point.y * scale}
                    r={size}
                    fill={`hsla(${hue}, 100%, ${50 + point.intensity * 30}%, ${point.intensity})`}
                    filter="url(#glow)"
                  />
                );
              })}
            </svg>
            <div className="crosshair">
              <div className="crosshair-h" />
              <div className="crosshair-v" />
              <div className="crosshair-center" />
            </div>
            <div className="depth-scale">
              <div className="depth-bar" />
              <div className="depth-labels">
                <span>NEAR</span>
                <span>FAR</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="idle-state">
            <div className="radar-sweep">
              <div className="radar-circle r1" />
              <div className="radar-circle r2" />
              <div className="radar-circle r3" />
              <div className="radar-line" />
            </div>
            <div className="idle-content">
              <div className="icon-container">
                <svg viewBox="0 0 24 24" className="scanner-icon">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 6v2M12 16v2M6 12h2M16 12h2" strokeWidth="2" stroke="currentColor" />
                </svg>
              </div>
              {status === 'error' || status === 'unsupported' ? (
                <div className="error-display">
                  <p className="error-code">ERR_CAMERA</p>
                  <p className="error-message">{errorMessage}</p>
                </div>
              ) : (
                <div className="instructions">
                  <p className="instruction-main">ACTIVATE SCANNER</p>
                  <p className="instruction-sub">
                    Point device camera to scan environment
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Controls */}
      <div className="controls">
        {status === 'streaming' ? (
          <button className="control-btn stop" onClick={stopCamera}>
            <span className="btn-icon">
              <svg viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </span>
            <span className="btn-text">TERMINATE</span>
          </button>
        ) : (
          <button
            className="control-btn start"
            onClick={startCamera}
            disabled={status === 'requesting'}
          >
            <span className="btn-icon">
              <svg viewBox="0 0 24 24">
                <polygon points="8,5 19,12 8,19" />
              </svg>
            </span>
            <span className="btn-text">
              {status === 'requesting' ? 'INITIALIZING...' : 'INITIATE SCAN'}
            </span>
          </button>
        )}
      </div>

      {/* Data Panel */}
      <div className="data-panel">
        <div className="data-item">
          <span className="data-label">MODE</span>
          <span className="data-value">DEPTH</span>
        </div>
        <div className="data-item">
          <span className="data-label">RES</span>
          <span className="data-value">64x48</span>
        </div>
        <div className="data-item">
          <span className="data-label">FPS</span>
          <span className="data-value">15</span>
        </div>
        <div className="data-item">
          <span className="data-label">RANGE</span>
          <span className="data-value">5M</span>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <span>Requested by @aiob_me · Built by @clonkbot</span>
      </footer>
    </div>
  );
}

export default App;
