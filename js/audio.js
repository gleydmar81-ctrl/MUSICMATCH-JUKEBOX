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
    this.androidPlayback = !!window.AndroidBridge;
    this.visualizerPhase = 0;
    this.nativeVULevel = null;

    // Callbacks
    this.onTimeUpdate = null;
    this.onEnded = null;
    this.onError = null;
    this.onStateChange = null;

    this._setupAudioEvents();
    if (this.androidPlayback) this._setupAndroidPlaybackBridge();
  }

  _setupAndroidPlaybackBridge() {
    window.MusicMatchNativeAudio = (state, message) => {
      if (state === "playing") {
        this.isPlaying = true;
        this.nativeVULevel = 0;
        if (this.onStateChange) this.onStateChange(true);
      } else if (state === "paused" || state === "stopped" || state === "ended") {
        this.isPlaying = false;
        if (this.onStateChange) this.onStateChange(false);
        if (state === "ended" && this.onEnded) this.onEnded();
      } else if (state === "error") {
        this.isPlaying = false;
        if (this.onStateChange) this.onStateChange(false);
        const error = new Error(message || "Não foi possível reproduzir a faixa.");
        console.error(error.message);
        if (this.onError) this.onError(error);
      }
    };

    window.MusicMatchNativeProgress = (currentTime, duration) => {
      if (this.onTimeUpdate) this.onTimeUpdate(currentTime, duration);
    };

    window.MusicMatchNativeVU = (level) => {
      if (typeof level === "number" && isFinite(level)) {
        this.nativeVULevel = Math.max(0, Math.min(1, level));
      }
    };
  }

  _initContext() {
    if (this.isInitialized) return;
    if (window.AndroidBridge) {
      this.isInitialized = true;
      return;
    }
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

    this.audio.addEventListener("playing", () => {
      console.info("Áudio local começou a tocar.");
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
    });

    this.audio.addEventListener("error", (e) => {
      const error = this.audio.error;
      console.error("Erro de áudio: " + (error
        ? error.code + " " + error.message
        : "desconhecido"));
      if (this.onError) this.onError(e);
    });
  }

  async loadAndPlay(track) {
    if (this.androidPlayback && track.contentUri) {
      this.currentTrack = track;
      window.AndroidBridge.playTrack(track.contentUri, this.audio.volume);
      return;
    }

    this._initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.currentTrack = track;
    this._setTrackSource(track);
    try {
      await this.audio.play();
      this.isPlaying = true;
    } catch (err) {
      console.warn("Autoplay was prevented or error occurred:", err);
    }
  }

  loadTrack(track) {
    this.currentTrack = track;
    if (this.androidPlayback && track.contentUri) return;
    this._setTrackSource(track);
  }

  _setTrackSource(track) {
    if (track.contentUri && track.url === track.contentUri) {
      this.audio.removeAttribute("crossorigin");
    } else {
      this.audio.crossOrigin = "anonymous";
    }
    this.audio.src = track.url;
  }

  play() {
    if (this.androidPlayback && this.currentTrack && this.currentTrack.contentUri) {
      window.AndroidBridge.playTrack(this.currentTrack.contentUri, this.audio.volume);
      return;
    }

    this._initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    if (this.audio.src) {
      return this.audio.play();
    }
  }

  pause() {
    if (this.androidPlayback && this.currentTrack && this.currentTrack.contentUri) {
      window.AndroidBridge.pauseTrack();
      return;
    }
    this.audio.pause();
  }

  stop() {
    if (this.androidPlayback && this.currentTrack && this.currentTrack.contentUri) {
      window.AndroidBridge.stopTrack();
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
      return;
    }

    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange(false);
  }

  seek(seconds) {
    if (!isNaN(seconds) && isFinite(seconds)) {
      if (this.androidPlayback && this.currentTrack && this.currentTrack.contentUri) {
        window.AndroidBridge.seekTrack(seconds);
        return;
      }
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    }
  }

  setVolume(val) {
    // val: 0.0 to 1.0
    const clamped = Math.max(0, Math.min(val, 1));
    this.audio.volume = clamped;
    if (this.androidPlayback) window.AndroidBridge.setTrackVolume(clamped);
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
      return;
    }

    if (!this.androidPlayback || !this.isPlaying) {
      for (let i = 0; i < array.length; i++) array[i] = 0;
      return;
    }

    // Native playback does not expose PCM to Web Audio, so animate the display without recording audio.
    this.visualizerPhase += 0.12;
    for (let i = 0; i < array.length; i++) {
      const band = i / array.length;
      const pulse = (Math.sin(this.visualizerPhase * (0.6 + band * 1.8) + i * 0.21) + 1) / 2;
      const flutter = (Math.sin(this.visualizerPhase * 2.7 + i * 0.73) + 1) / 2;
      const target = 12 + pulse * (125 * (1 - band * 0.38)) + flutter * 45;
      array[i] = Math.round(array[i] * 0.72 + target * 0.28);
    }
  }

  getVULevels(array) {
    if (this.nativeVULevel !== null) {
      const level = this.isPlaying ? this.nativeVULevel : 0;
      return { left: level, right: level };
    }

    this.getFrequencyData(array);
    const half = Math.floor(array.length / 2);
    let sumLeft = 0;
    let sumRight = 0;
    for (let i = 0; i < half; i++) {
      sumLeft += array[i];
      sumRight += array[i + half];
    }
    return {
      left: sumLeft / (half * 255),
      right: sumRight / (half * 255)
    };
  }

  getTimeDomainData(array) {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(array);
      return;
    }

    if (!this.androidPlayback || !this.isPlaying) {
      for (let i = 0; i < array.length; i++) array[i] = 128;
      return;
    }

    this.visualizerPhase += 0.12;
    for (let i = 0; i < array.length; i++) {
      const wave = Math.sin(i * 0.18 + this.visualizerPhase) * 40;
      const detail = Math.sin(i * 0.047 - this.visualizerPhase * 0.8) * 18;
      array[i] = Math.max(0, Math.min(255, Math.round(128 + wave + detail)));
    }
  }
}

window.AudioEngine = AudioEngine;
