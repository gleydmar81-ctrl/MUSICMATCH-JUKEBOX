/**
 * MusicMatch Jukebox Web - Canvas Spectrum Analyzer & Visualizer
 * Faithful recreation of the classic late 90s/early 2000s LED ladder bars and falling peak indicators
 */

class Visualizer {
  constructor(canvas, audioEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.audioEngine = audioEngine;

    this.mode = "bars"; // "bars", "wave", "vu"
    this.animId = null;

    // 16 or 24 visualizer frequency bars
    this.numBars = 20;
    this.peaks = new Array(this.numBars).fill(0);
    this.peakDecay = 0.95;
    this.peakHoldTime = 15;
    this.peakTimers = new Array(this.numBars).fill(0);

    this.dataArray = new Uint8Array(128);

    this._setupResize();
  }

  _setupResize() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * (window.devicePixelRatio || 1);
      this.canvas.height = rect.height * (window.devicePixelRatio || 1);
      this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);
  }

  start() {
    if (this.animId) return;
    const render = () => {
      this.draw();
      this.animId = requestAnimationFrame(render);
    };
    this.animId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.clear();
  }

  clear() {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    this.ctx.fillStyle = "#0c150c";
    this.ctx.fillRect(0, 0, w, h);
  }

  setMode(mode) {
    this.mode = mode;
  }

  draw() {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    // Dark LCD background
    this.ctx.fillStyle = "#0a130e";
    this.ctx.fillRect(0, 0, w, h);

    // Subtle LCD grid overlay
    this.ctx.strokeStyle = "rgba(16, 36, 24, 0.4)";
    this.ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 4) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }

    if (this.mode === "bars") {
      this._drawBars(w, h);
    } else if (this.mode === "wave") {
      this._drawWave(w, h);
    } else if (this.mode === "vu") {
      this._drawVU(w, h);
    }
  }

  _drawBars(w, h) {
    this.audioEngine.getFrequencyData(this.dataArray);

    const barWidth = Math.floor((w - (this.numBars + 1) * 2) / this.numBars);
    const gap = 2;
    const numSegments = 16;
    const segHeight = Math.floor((h - 4) / numSegments);

    for (let i = 0; i < this.numBars; i++) {
      // Sample frequency data with logarithmic scale skewing towards lower/mid frequencies
      const freqIndex = Math.floor(Math.pow(i / this.numBars, 1.4) * (this.dataArray.length * 0.75));
      const val = this.dataArray[freqIndex] || 0;
      const normalized = val / 255;

      const activeSegments = Math.round(normalized * numSegments);

      // Handle peaks
      if (activeSegments >= this.peaks[i]) {
        this.peaks[i] = activeSegments;
        this.peakTimers[i] = this.peakHoldTime;
      } else {
        if (this.peakTimers[i] > 0) {
          this.peakTimers[i]--;
        } else {
          this.peaks[i] = Math.max(0, this.peaks[i] - 0.4);
        }
      }

      const x = gap + i * (barWidth + gap);

      // Draw LED segments from bottom to top
      for (let s = 0; s < numSegments; s++) {
        const y = h - 2 - (s + 1) * segHeight;
        const isActive = s < activeSegments;

        if (isActive) {
          // Color gradation: Green at bottom, Yellow at mid, Red at top
          if (s > numSegments * 0.8) {
            this.ctx.fillStyle = "#ff3333"; // Red
            this.ctx.shadowColor = "#ff2222";
            this.ctx.shadowBlur = 4;
          } else if (s > numSegments * 0.6) {
            this.ctx.fillStyle = "#ffcc00"; // Yellow
            this.ctx.shadowColor = "#eebb00";
            this.ctx.shadowBlur = 3;
          } else {
            this.ctx.fillStyle = "#00ff66"; // Neon Green
            this.ctx.shadowColor = "#00dd55";
            this.ctx.shadowBlur = 2;
          }
        } else {
          // Inactive LED segment (faint ghost)
          this.ctx.fillStyle = "rgba(0, 50, 20, 0.25)";
          this.ctx.shadowBlur = 0;
        }

        this.ctx.fillRect(x, y, barWidth, segHeight - 1);
      }

      // Draw Peak Indicator (Classic floating cap)
      if (this.peaks[i] > 0) {
        const peakSeg = Math.min(numSegments - 1, Math.floor(this.peaks[i]));
        const peakY = h - 2 - (peakSeg + 1) * segHeight;
        this.ctx.fillStyle = "#55ffff"; // Cyan glowing cap
        this.ctx.shadowColor = "#00ffff";
        this.ctx.shadowBlur = 4;
        this.ctx.fillRect(x, peakY, barWidth, 2);
      }
    }
    this.ctx.shadowBlur = 0;
  }

  _drawWave(w, h) {
    this.audioEngine.getTimeDomainData(this.dataArray);

    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "#00ff88";
    this.ctx.shadowColor = "#00ff88";
    this.ctx.shadowBlur = 6;

    this.ctx.beginPath();
    const sliceWidth = w / this.dataArray.length;
    let x = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const v = this.dataArray[i] / 128.0;
      const y = (v * h) / 2;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  _drawVU(w, h) {
    const levels = this.audioEngine.getVULevels(this.dataArray);

    const drawMeter = (val, y, label) => {
      this.ctx.fillStyle = "#77aa88";
      this.ctx.font = "10px monospace";
      this.ctx.fillText(label, 4, y + 10);

      const meterX = 22;
      const meterW = w - 28;
      const meterH = 10;

      // Background
      this.ctx.fillStyle = "#112218";
      this.ctx.fillRect(meterX, y, meterW, meterH);

      // Bar with gradient
      const fillW = Math.min(meterW, val * meterW * 1.5);
      const grad = this.ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
      grad.addColorStop(0, "#00ff66");
      grad.addColorStop(0.7, "#ffcc00");
      grad.addColorStop(1, "#ff3333");

      this.ctx.fillStyle = grad;
      this.ctx.fillRect(meterX, y, fillW, meterH);
    };

    drawMeter(levels.left, h * 0.25, "L");
    drawMeter(levels.right, h * 0.6, "R");
  }
}

window.Visualizer = Visualizer;
