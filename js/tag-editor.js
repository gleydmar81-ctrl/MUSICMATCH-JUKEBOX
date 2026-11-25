/**
 * MusicMatch Jukebox Web - Tag Editor Modal Controller
 * Direct In-Place File Overwrite via Local Server API or File System Access API
 * Works for both locally dragged files and server-scanned library files.
 */

class TagEditor {
  constructor(playlistManager) {
    this.playlistManager = playlistManager;
    this.currentTrack = null;
    this.modalEl = document.getElementById("tag-modal");
    this.newCoverData = null;
    this.newCoverMime = null;
    this.removeCoverRequested = false;

    this._initElements();
    this._bindEvents();
    this._populateGenres();
  }

  _initElements() {
    this.titleInput = document.getElementById("tag-title");
    this.artistInput = document.getElementById("tag-artist");
    this.albumInput = document.getElementById("tag-album");
    this.trackInput = document.getElementById("tag-track");
    this.yearInput = document.getElementById("tag-year");
    this.genreSelect = document.getElementById("tag-genre");
    this.commentInput = document.getElementById("tag-comment");
    this.filenameDisplay = document.getElementById("tag-filename");
    this.coverPreview = document.getElementById("tag-cover-preview");
    this.coverFileInput = document.getElementById("tag-cover-file");

    this.btnSaveApp = document.getElementById("tag-btn-save-app");
    this.btnSaveFile = document.getElementById("tag-btn-save-file");
    this.btnDownloadMp3 = document.getElementById("tag-btn-download-mp3");
    this.btnClose = document.getElementById("tag-btn-close");
    this.btnRemoveCover = document.getElementById("tag-btn-remove-cover");
    this.statusMsg = document.getElementById("tag-status-msg");
  }

  _populateGenres() {
    if (!this.genreSelect) return;
    this.genreSelect.innerHTML = '<option value="">(Nenhum / Outro)</option>';
    ID3.GENRES.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      this.genreSelect.appendChild(opt);
    });
  }

  _bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener("click", () => this.close());
    }

    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }

    if (this.coverFileInput) {
      this.coverFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        this.newCoverMime = file.type || "image/jpeg";
        const buffer = await file.arrayBuffer();
        this.newCoverData = new Uint8Array(buffer);
        this.removeCoverRequested = false;

        const url = URL.createObjectURL(file);
        this.coverPreview.src = url;
      });
    }

    if (this.btnRemoveCover) {
      this.btnRemoveCover.addEventListener("click", () => {
        this.newCoverData = null;
        this.newCoverMime = null;
        this.removeCoverRequested = true;
        this.coverPreview.src = "assets/default-cover.svg";
      });
    }

    // Apply only in playlist (memory)
    if (this.btnSaveApp) {
      this.btnSaveApp.addEventListener("click", () => {
        this.saveToApp();
        this._showStatus("Metadados atualizados na playlist desta sessão!", "success");
      });
    }

    // Direct in-place save on disk (zero duplicates)
    if (this.btnSaveFile) {
      this.btnSaveFile.addEventListener("click", async () => {
        await this.saveDirectlyToFile();
      });
    }

    // Download copy
    if (this.btnDownloadMp3) {
      this.btnDownloadMp3.addEventListener("click", async () => {
        await this.downloadUpdatedMp3();
      });
    }
  }

  open(track) {
    if (!track) return;
    this.currentTrack = track;
    this.newCoverData = null;
    this.newCoverMime = null;
    this.removeCoverRequested = false;
    this._showStatus("", "");

    this.filenameDisplay.textContent = track.fullPath || track.filename || "Arquivo de Áudio";
    this.titleInput.value = track.title || "";
    this.artistInput.value = track.artist || "";
    this.albumInput.value = track.album || "";
    this.trackInput.value = track.track || "";
    this.yearInput.value = track.year || "";
    this.genreSelect.value = track.genre || "";
    this.commentInput.value = track.comment || "";

    if (track.coverUrl) {
      this.coverPreview.src = track.coverUrl;
    } else {
      this.coverPreview.src = "assets/default-cover.svg";
    }

    if (this.btnSaveFile) {
      this.btnSaveFile.style.display = "inline-flex";
    }

    this.modalEl.classList.remove("hidden");
  }

  close() {
    this.modalEl.classList.add("hidden");
    this.currentTrack = null;
  }

  saveToApp() {
    if (!this.currentTrack) return;
    this.currentTrack.title = this.titleInput.value.trim() || this.currentTrack.filename;
    this.currentTrack.artist = this.artistInput.value.trim() || "Desconhecido";
    this.currentTrack.album = this.albumInput.value.trim() || "Álbum Desconhecido";
    this.currentTrack.track = this.trackInput.value.trim();
    this.currentTrack.year = this.yearInput.value.trim();
    this.currentTrack.genre = this.genreSelect.value;
    this.currentTrack.comment = this.commentInput.value.trim();

    if (this.removeCoverRequested) {
      this.currentTrack.coverUrl = null;
      this.currentTrack.coverBlob = null;
    } else if (this.newCoverData) {
      const blob = new Blob([this.newCoverData], { type: this.newCoverMime || "image/jpeg" });
      this.currentTrack.coverBlob = blob;
      this.currentTrack.coverUrl = URL.createObjectURL(blob);
    }

    if (this.playlistManager.onPlaylistUpdated) {
      this.playlistManager.onPlaylistUpdated(this.playlistManager.getVisibleTracks());
    }

    if (this.playlistManager.getCurrentTrack() === this.currentTrack) {
      if (this.playlistManager.onTrackChange) {
        this.playlistManager.onTrackChange(this.currentTrack);
      }
    }
  }

  async _generateUpdatedBlob() {
    if (!this.currentTrack) {
      throw new Error("Nenhuma faixa selecionada.");
    }

    this.saveToApp();

    let originalBuffer = null;
    if (this.currentTrack.file) {
      originalBuffer = await this.currentTrack.file.arrayBuffer();
    } else if (this.currentTrack.url || this.currentTrack.streamUrl) {
      this._showStatus("Carregando áudio do servidor para atualizar tags...", "info");
      const resp = await fetch(this.currentTrack.url || this.currentTrack.streamUrl);
      originalBuffer = await resp.arrayBuffer();
    } else {
      throw new Error("Não foi possível carregar os dados do arquivo de áudio.");
    }

    let coverData = this.newCoverData;
    let coverMime = this.newCoverMime;

    if (!coverData && !this.removeCoverRequested && this.currentTrack.coverBlob) {
      const coverBuf = await this.currentTrack.coverBlob.arrayBuffer();
      coverData = new Uint8Array(coverBuf);
      coverMime = this.currentTrack.coverBlob.type;
    }

    const tags = {
      title: this.currentTrack.title,
      artist: this.currentTrack.artist,
      album: this.currentTrack.album,
      track: this.currentTrack.track,
      year: this.currentTrack.year,
      genre: this.currentTrack.genre,
      comment: this.currentTrack.comment,
      coverData: this.removeCoverRequested ? null : coverData,
      coverMime: coverMime || "image/jpeg"
    };

    const newBlob = ID3.updateMp3(originalBuffer, tags);

    // Update in-memory reference
    this.currentTrack.file = new File([newBlob], this.currentTrack.filename || "track.mp3", { type: "audio/mpeg" });
    if (this.currentTrack.url && this.currentTrack.url.startsWith("blob:")) {
      URL.revokeObjectURL(this.currentTrack.url);
    }
    this.currentTrack.url = URL.createObjectURL(newBlob);

    return newBlob;
  }

  async saveDirectlyToFile() {
    this._showStatus("Gravando diretamente no arquivo original no seu computador...", "info");
    try {
      const newBlob = await this._generateUpdatedBlob();

      // Step 1: Use Python server API to overwrite in-place on disk
      try {
        const resp = await fetch("/api/save_direct", {
          method: "POST",
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Filename": encodeURIComponent(this.currentTrack.filename || ""),
            "X-Filepath": encodeURIComponent(this.currentTrack.fullPath || "")
          },
          body: newBlob
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data.success) {
            this.currentTrack.fullPath = data.path;
            this._showStatus(`✅ Arquivo original atualizado no disco! (${data.path})`, "success");
            return;
          }
        }
      } catch (netErr) {
        console.warn("Backend save_direct failed, trying browser File System API...", netErr);
      }

      // Step 2: Fallback to Chromium showSaveFilePicker
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: this.currentTrack.filename || `${this.currentTrack.artist} - ${this.currentTrack.title}.mp3`,
          types: [{
            description: "Arquivo de Áudio MP3",
            accept: { "audio/mpeg": [".mp3"] }
          }]
        });

        const writable = await handle.createWritable();
        await writable.write(newBlob);
        await writable.close();

        this._showStatus("✅ Arquivo salvo diretamente com sucesso!", "success");
        return;
      }

      // Step 3: Fallback to download
      await this.downloadUpdatedMp3();

    } catch (err) {
      if (err.name === "AbortError") {
        this._showStatus("Operação cancelada.", "info");
      } else {
        console.error("Erro ao salvar:", err);
        this._showStatus("Erro ao salvar: " + err.message, "error");
      }
    }
  }

  async downloadUpdatedMp3() {
    this._showStatus("Gerando MP3 com tags ID3v2.3 e ID3v1...", "info");

    try {
      const newBlob = await this._generateUpdatedBlob();

      const downloadName = this.currentTrack.filename.endsWith(".mp3") 
        ? this.currentTrack.filename 
        : `${this.currentTrack.artist || 'Artista'} - ${this.currentTrack.title || 'Faixa'}.mp3`
          .replace(/[\\/:*?"<>|]/g, "_");

      const downloadUrl = URL.createObjectURL(newBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      this._showStatus("✅ Cópia do MP3 baixada com as tags ID3 gravadas!", "success");
    } catch (err) {
      console.error("Erro ao exportar MP3:", err);
      this._showStatus("Erro ao exportar MP3: " + err.message, "error");
    }
  }

  _showStatus(msg, type) {
    if (!this.statusMsg) return;
    this.statusMsg.textContent = msg;
    this.statusMsg.className = "tag-status " + (type || "");
  }
}

window.TagEditor = TagEditor;
