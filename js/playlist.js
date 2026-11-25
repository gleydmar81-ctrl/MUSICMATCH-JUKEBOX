/**
 * MusicMatch Jukebox Web - Playlist Manager
 * Manages tracks list, drag-and-drop, server library, sorting, M3U import/export, and search filtering
 */

class PlaylistManager {
  constructor() {
    this.tracks = []; // Array of Track objects
    this.currentIndex = -1;
    this.isShuffle = false;
    this.repeatMode = "all"; // 'off', 'all', 'one'
    this.shuffledIndices = [];
    this.filterQuery = "";
    this.libraryFolder = "";
    this.folderGrouping = true;

    // Callbacks
    this.onTrackChange = null;
    this.onPlaylistUpdated = null;
  }

  loadLibraryTracks(libraryData) {
    this.libraryFolder = libraryData.folder || "";
    this.folderGrouping = true;
    const newTracks = libraryData.tracks.map(t => ({
      id: t.id || "track_" + Math.random().toString(36).substr(2, 9),
      file: null,
      filename: t.filename,
      fullPath: t.fullPath,
      contentUri: t.contentUri || null,
      folder: t.folder || null,
      url: t.streamUrl,
      streamUrl: t.streamUrl,
      title: t.title || t.filename.replace(/\.[^/.]+$/, ""),
      artist: t.artist || "Desconhecido",
      album: t.album || "Álbum Desconhecido",
      year: t.year || "",
      genre: t.genre || "",
      track: t.track || "",
      comment: "",
      duration: 0,
      coverUrl: t.coverUrl || null,
      coverBlob: null
    }));

    this.tracks = newTracks;
    this._rebuildShuffle();

    if (this.onPlaylistUpdated) this.onPlaylistUpdated(this.getVisibleTracks());

    if (this.tracks.length > 0 && this.currentIndex === -1) {
      this.currentIndex = 0;
      if (this.onTrackChange) this.onTrackChange(this.getCurrentTrack());
    }

    return newTracks;
  }

  replaceTracks(tracks) {
    this.tracks = tracks.slice();
    this.folderGrouping = false;
    this.currentIndex = this.tracks.length > 0 ? 0 : -1;
    this._rebuildShuffle();
    if (this.onPlaylistUpdated) this.onPlaylistUpdated(this.getVisibleTracks());
    if (this.onTrackChange) this.onTrackChange(this.getCurrentTrack());
  }

  async addFiles(fileList) {
    const newTracks = [];
    for (const file of fileList) {
      if (!file.name.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i) && file.type.indexOf("audio") === -1) {
        continue;
      }

      const track = {
        id: "track_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        file: file,
        filename: file.name,
        fullPath: file.path || file.name,
        url: URL.createObjectURL(file),
        streamUrl: null,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Desconhecido",
        album: "Álbum Desconhecido",
        year: "",
        genre: "",
        track: "",
        comment: "",
        duration: 0,
        coverUrl: null,
        coverBlob: null
      };

      try {
        const slice = await file.slice(0, 1024 * 512).arrayBuffer();
        const tags = ID3.parse(slice);
        if (tags.title) track.title = tags.title;
        if (tags.artist) track.artist = tags.artist;
        if (tags.album) track.album = tags.album;
        if (tags.year) track.year = tags.year;
        if (tags.genre) track.genre = tags.genre;
        if (tags.track) track.track = tags.track;
        if (tags.comment) track.comment = tags.comment;
        if (tags.cover) {
          track.coverUrl = tags.cover.url;
          track.coverBlob = tags.cover.blob;
        }
      } catch (err) {
        console.warn("Could not read ID3 tags for", file.name, err);
      }

      newTracks.push(track);
    }

    this.tracks.push(...newTracks);
    this._rebuildShuffle();

    if (this.onPlaylistUpdated) this.onPlaylistUpdated(this.getVisibleTracks());

    if (this.currentIndex === -1 && this.tracks.length > 0) {
      this.currentIndex = 0;
      if (this.onTrackChange) this.onTrackChange(this.getCurrentTrack());
    }

    return newTracks;
  }

  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      return this.tracks[this.currentIndex];
    }
    return null;
  }

  setCurrentIndex(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.currentIndex = index;
      if (this.onTrackChange) this.onTrackChange(this.getCurrentTrack());
    }
  }

  next() {
    if (this.tracks.length === 0) return null;

    if (this.repeatMode === "one") {
      return this.getCurrentTrack();
    }

    if (this.isShuffle) {
      let shufflePos = this.shuffledIndices.indexOf(this.currentIndex);
      if (shufflePos === -1 || shufflePos >= this.shuffledIndices.length - 1) {
        if (this.repeatMode === "all") {
          this._rebuildShuffle();
          this.currentIndex = this.shuffledIndices[0];
        } else {
          return null;
        }
      } else {
        this.currentIndex = this.shuffledIndices[shufflePos + 1];
      }
    } else {
      if (this.currentIndex >= this.tracks.length - 1) {
        if (this.repeatMode === "all") {
          this.currentIndex = 0;
        } else {
          return null;
        }
      } else {
        this.currentIndex++;
      }
    }

    const track = this.getCurrentTrack();
    if (this.onTrackChange) this.onTrackChange(track);
    return track;
  }

  prev() {
    if (this.tracks.length === 0) return null;

    if (this.isShuffle) {
      let shufflePos = this.shuffledIndices.indexOf(this.currentIndex);
      if (shufflePos > 0) {
        this.currentIndex = this.shuffledIndices[shufflePos - 1];
      } else {
        this.currentIndex = this.shuffledIndices[this.shuffledIndices.length - 1];
      }
    } else {
      if (this.currentIndex <= 0) {
        this.currentIndex = this.tracks.length - 1;
      } else {
        this.currentIndex--;
      }
    }

    const track = this.getCurrentTrack();
    if (this.onTrackChange) this.onTrackChange(track);
    return track;
  }

  removeTrack(index) {
    if (index >= 0 && index < this.tracks.length) {
      const removed = this.tracks.splice(index, 1)[0];
      if (removed && removed.url && removed.file) {
        URL.revokeObjectURL(removed.url);
      }
      if (this.currentIndex >= this.tracks.length) {
        this.currentIndex = this.tracks.length - 1;
      }
      this._rebuildShuffle();
      if (this.onPlaylistUpdated) this.onPlaylistUpdated(this.getVisibleTracks());
      if (this.tracks.length === 0) {
        this.currentIndex = -1;
        if (this.onTrackChange) this.onTrackChange(null);
      }
    }
  }

  clear() {
    this.tracks.forEach(t => {
      if (t.file && t.url) URL.revokeObjectURL(t.url);
      if (t.coverBlob && t.coverUrl) URL.revokeObjectURL(t.coverUrl);
    });
    this.tracks = [];
    this.currentIndex = -1;
    this.shuffledIndices = [];
    if (this.onPlaylistUpdated) this.onPlaylistUpdated([]);
    if (this.onTrackChange) this.onTrackChange(null);
  }

  sortBy(prop) {
    this.tracks.sort((a, b) => {
      const valA = (a[prop] || "").toString().toLowerCase();
      const valB = (b[prop] || "").toString().toLowerCase();
      return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
    });
    this._rebuildShuffle();
    if (this.onPlaylistUpdated) this.onPlaylistUpdated(this.getVisibleTracks());
  }

  setFilter(query) {
    this.filterQuery = query.toLowerCase().trim();
    if (this.onPlaylistUpdated) this.onPlaylistUpdated(this.getVisibleTracks());
  }

  getVisibleTracks() {
    if (!this.filterQuery) return this.tracks;
    return this.tracks.filter(t =>
      (t.title && t.title.toLowerCase().includes(this.filterQuery)) ||
      (t.artist && t.artist.toLowerCase().includes(this.filterQuery)) ||
      (t.album && t.album.toLowerCase().includes(this.filterQuery)) ||
      (t.folder && t.folder.toLowerCase().includes(this.filterQuery)) ||
      (t.fullPath && t.fullPath.toLowerCase().includes(this.filterQuery))
    );
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) this._rebuildShuffle();
    return this.isShuffle;
  }

  cycleRepeat() {
    if (this.repeatMode === "all") this.repeatMode = "one";
    else if (this.repeatMode === "one") this.repeatMode = "off";
    else this.repeatMode = "all";
    return this.repeatMode;
  }

  _rebuildShuffle() {
    this.shuffledIndices = this.tracks.map((_, i) => i);
    for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledIndices[i], this.shuffledIndices[j]] = [this.shuffledIndices[j], this.shuffledIndices[i]];
    }
  }

  exportM3U() {
    let content = "#EXTM3U\n";
    this.tracks.forEach(track => {
      const dur = Math.round(track.duration || -1);
      content += `#EXTINF:${dur},${track.artist} - ${track.title}\n`;
      content += `${track.fullPath || track.filename}\n`;
    });

    const blob = new Blob([content], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "playlist_musicmatch.m3u";
    a.click();
    URL.revokeObjectURL(url);
  }
}

window.PlaylistManager = PlaylistManager;
