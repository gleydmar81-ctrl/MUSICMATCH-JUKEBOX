/**
 * MusicMatch Jukebox Web - Audio Engine
 * Handles Web Audio API, Analyser, Equalizer, Preamp, and Playback Controls
 */

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "auto";

    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.gainNode = null;
    this.pannerNode = null;

    // Equalizer frequencies (MusicMatch 10-Band Graphic EQ style)
    this.eqFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.eqFilters = [];
    this.isEqEnabled = true;

    // Preamp
    this.preampNode = null;

    this.isInitialized = false;
    this.isPlaying = false;
    this.currentTrack = null;

    // Callbacks
    this.onTimeUpdate = null;
    this.onEnded = null;
    this.onError = null;
    this.onStateChange = null;

    this._setupAudioEvents();
  }

  _initContext() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Source from audio element
      this.source = this.ctx.createMediaElementSource(this.audio);

      // Preamp Gain
      this.preampNode = this.ctx.createGain();
      this.preampNode.gain.value = 1.0;

      // 10-Band Equalizer Filters
      let prevNode = this.preampNode;
      this.eqFilters = this.eqFrequencies.map((freq, i) => {
        const filter = this.ctx.createBiquadFilter();
        if (i === 0) {
          filter.type = "lowshelf";
        } else if (i === this.eqFrequencies.length - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = 0; // 0 dB default

        prevNode.connect(filter);
        prevNode = filter;
        return filter;
      });

      // Analyser Node for Spectrum Analyzer Visualizer
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Master Gain Node
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.audio.volume;

      // Stereo Panner (Balance)
      if (this.ctx.createStereoPanner) {
        this.pannerNode = this.ctx.createStereoPanner();
        this.pannerNode.pan.value = 0;
      }

      // Connect Graph:
      // source -> preamp -> eqFilters -> analyser -> panner -> masterGain -> destination
      this.source.connect(this.preampNode);
      if (this.pannerNode) {
        prevNode.connect(this.analyser);
        this.analyser.connect(this.pannerNode);
        this.pannerNode.connect(this.gainNode);
      } else {
        prevNode.connect(this.analyser);
        this.analyser.connect(this.gainNode);
      }
      this.gainNode.connect(this.ctx.destination);

      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio API initialization failed:", e);
    }
  }

  _setupAudioEvents() {
    this.audio.addEventListener("timeupdate", () => {
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener("ended", () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
      if (this.onEnded) this.onEnded();
    });

    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      if (this.onStateChange) this.onStateChange(true);
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
    });

    this.audio.addEventListener("error", (e) => {
      console.error("Audio playback error:", e);
      if (this.onError) this.onError(e);
    });
  }

  async loadAndPlay(track) {
    this._initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.currentTrack = track;
    this.audio.src = track.url;
    try {
      await this.audio.play();
      this.isPlaying = true;
    } catch (err) {
      console.warn("Autoplay was prevented or error occurred:", err);
    }
  }

  play() {
    this._initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    if (this.audio.src) {
      return this.audio.play();
    }
  }

  pause() {
    this.audio.pause();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange(false);
  }

  seek(seconds) {
    if (!isNaN(seconds) && isFinite(seconds)) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    }
  }

  setVolume(val) {
    // val: 0.0 to 1.0
    const clamped = Math.max(0, Math.min(val, 1));
    this.audio.volume = clamped;
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
  }

  setBalance(val) {
    // val: -1.0 (Left) to +1.0 (Right)
    if (this.pannerNode) {
      this.pannerNode.pan.value = Math.max(-1, Math.min(val, 1));
    }
  }

  setEqBand(index, gainDb) {
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = this.isEqEnabled ? gainDb : 0;
    }
  }

  setPreamp(gainDb) {
    if (this.preampNode) {
      // Convert dB to linear gain: 10^(dB/20)
      const linear = Math.pow(10, gainDb / 20);
      this.preampNode.gain.value = linear;
    }
  }

  toggleEq(enable) {
    this.isEqEnabled = enable;
    this.eqFilters.forEach((filter, idx) => {
      // If disabled, bypass gain
      filter.gain.value = enable ? (this.lastGains ? this.lastGains[idx] : 0) : 0;
    });
  }

  getFrequencyData(array) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(array);
    }
  }

  getTimeDomainData(array) {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(array);
    }
  }
}

window.AudioEngine = AudioEngine;
