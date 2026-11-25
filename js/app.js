/**
 * MusicMatch Jukebox Web - Main Application
 * Connects AudioEngine, Visualizer, PlaylistManager, TagEditor, and Server Library
 */

document.addEventListener("DOMContentLoaded", () => {
  const audio = new AudioEngine();
  const playlist = new PlaylistManager();
  
  const canvas = document.getElementById("visualizer-canvas");
  const visualizer = new Visualizer(canvas, audio);
  visualizer.start();

  const tagEditor = new TagEditor(playlist);

  // Equalizer presets
  const EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    rock: [4.5, 3.0, 1.5, 0, -1.0, 0, 2.5, 3.5, 4.0, 4.5],
    pop: [-1.5, 1.0, 3.0, 3.5, 2.0, -0.5, -1.0, 1.5, 2.5, 3.0],
    jazz: [3.0, 2.0, 1.0, 1.5, -1.0, -1.0, 0, 1.5, 2.5, 3.5],
    bass: [6.0, 5.0, 4.0, 2.0, 0, 0, 0, 0, 0, 0],
    vocal: [-2.0, -1.5, 0, 2.5, 4.0, 4.0, 2.5, 0.5, -1.0, -2.0],
    techno: [5.0, 4.0, 2.0, 0, -2.0, 0, 2.0, 4.0, 4.5, 5.0]
  };

  // UI Elements
  const elBtnPlay = document.getElementById("btn-play");
  const elBtnPause = document.getElementById("btn-pause");
  const elBtnStop = document.getElementById("btn-stop");
  const elBtnPrev = document.getElementById("btn-prev");
  const elBtnNext = document.getElementById("btn-next");
  const elBtnShuffle = document.getElementById("btn-shuffle");
  const elBtnRepeat = document.getElementById("btn-repeat");
  const elBtnEqToggle = document.getElementById("btn-eq-toggle");
  const elBtnTag = document.getElementById("btn-tag");

  const elSeekSlider = document.getElementById("seek-slider");
  const elVolumeSlider = document.getElementById("volume-slider");
  const elBalanceSlider = document.getElementById("balance-slider");
  const elLcdTitle = document.getElementById("lcd-title");
  const elLcdTime = document.getElementById("lcd-time");
  const elLcdBitrate = document.getElementById("lcd-bitrate");
  const elLcdStatus = document.getElementById("lcd-status");
  const elAlbumArt = document.getElementById("main-album-art");

  const elFileInput = document.getElementById("file-input");
  const elFolderInput = document.getElementById("folder-input");
  const elBtnAddFiles = document.getElementById("btn-add-files");
  const elBtnAddFolder = document.getElementById("btn-add-folder");
  const elBtnOpenPlaylists = document.getElementById("btn-open-playlists");
  const elBtnClearPlaylist = document.getElementById("btn-clear-playlist");
  const elBtnExportM3u = document.getElementById("btn-export-m3u");
  const elSearchInput = document.getElementById("search-input");
  const elPlaylistBody = document.getElementById("playlist-body");
  const elBtnToggleFolders = document.getElementById("btn-toggle-folders");
  const elDropzone = document.getElementById("app-dropzone");
  const elEqPresetSelect = document.getElementById("eq-preset-select");
  const elEqSliders = document.querySelectorAll(".eq-slider");
  const elPreampSlider = document.getElementById("preamp-slider");
  const elVizModeBtn = document.getElementById("btn-viz-mode");

  const elLibraryStatus = document.getElementById("lbl-library-status");
  const elBtnScanStorage = document.getElementById("btn-scan-storage");

  const elPlaylistModal = document.getElementById("playlist-modal");
  const elPlaylistBtnClose = document.getElementById("playlist-btn-close");
  const elPlaylistBtnCancel = document.getElementById("playlist-btn-cancel");
  const elPlaylistSavedSelect = document.getElementById("playlist-saved-select");
  const elPlaylistBtnLoad = document.getElementById("playlist-btn-load");
  const elPlaylistBtnDelete = document.getElementById("playlist-btn-delete");
  const elPlaylistNameInput = document.getElementById("playlist-name-input");
  const elPlaylistTrackSearch = document.getElementById("playlist-track-search");
  const elPlaylistLibraryList = document.getElementById("playlist-library-list");
  const elPlaylistDraftList = document.getElementById("playlist-draft-list");
  const elPlaylistDraftCount = document.getElementById("playlist-draft-count");
  const elPlaylistStatusMsg = document.getElementById("playlist-status-msg");
  const elPlaylistBtnSave = document.getElementById("playlist-btn-save");
  const elPlaylistBtnPlay = document.getElementById("playlist-btn-play");

  let isTimeRemainingMode = false;
  let isSeeking = false;
  let isLoadingLibrary = false;
  let libraryTracks = [];
  let savedCustomPlaylists = [];
  let draftPlaylist = [];
  let selectedCustomPlaylistId = "";
  const collapsedFolderStorageKey = "musicmatch-collapsed-folders";
  const collapsedLibraryFolders = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(collapsedFolderStorageKey) || "[]");
      return new Set(Array.isArray(saved) ? saved.filter(folder => typeof folder === "string") : []);
    } catch (err) {
      console.warn("Could not restore collapsed folder states:", err);
      return new Set();
    }
  })();

  function saveCollapsedFolderStates() {
    try {
      localStorage.setItem(collapsedFolderStorageKey, JSON.stringify(Array.from(collapsedLibraryFolders)));
    } catch (err) {
      console.warn("Could not save collapsed folder states:", err);
    }
  }

  function folderStateKey(folder) {
    if (folder === null) {
      return playlist.folderGrouping ? "added-files:" : "custom-playlist:";
    }
    return `folder:${folder}`;
  }

  function getPlaylistFolderStateKeys() {
    const keys = new Set();
    playlist.tracks.forEach(track => {
      const folder = playlist.folderGrouping ? (track.folder || null) : null;
      keys.add(folderStateKey(folder));
    });
    return Array.from(keys);
  }

  function updateToggleFoldersButton() {
    if (!elBtnToggleFolders) return;
    const keys = getPlaylistFolderStateKeys();
    const allCollapsed = keys.length > 0
      && keys.every(key => collapsedLibraryFolders.has(key));
    elBtnToggleFolders.disabled = keys.length === 0;
    elBtnToggleFolders.textContent = allCollapsed ? "📂 Expandir pastas" : "📁 Recolher pastas";
    elBtnToggleFolders.title = allCollapsed
      ? "Expandir todas as pastas"
      : "Recolher todas as pastas sem limpar a playlist";
  }

  function getFolderDisplayName(folder) {
    const segments = folder.split(/[\\/]+/).filter(Boolean);
    return segments.length ? segments[segments.length - 1] : folder;
  }

  // -------------------------------------------------------------
  // Track & Playback Handling
  // -------------------------------------------------------------
  const formatTime = (seconds) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const updatePlayerDisplay = (track) => {
    if (!track) {
      elLcdTitle.textContent = "MUSICMATCH JUKEBOX - PRONTO";
      elLcdTime.textContent = "00:00";
      elLcdBitrate.textContent = "128 kbps";
      elLcdStatus.textContent = "PARADO";
      elAlbumArt.src = "assets/default-cover.svg";
      elSeekSlider.value = 0;
      elSeekSlider.max = 100;
      return;
    }

    const artist = track.artist || "Desconhecido";
    const title = track.title || track.filename;
    const album = track.album || "";
    elLcdTitle.textContent = `${artist} - ${title}${album ? ' [' + album + ']' : ''}`;
    elAlbumArt.src = track.coverUrl || "assets/default-cover.svg";
    elLcdStatus.textContent = audio.isPlaying ? "TOCANDO" : "PAUSADO";
  };

  playlist.onTrackChange = (track) => {
    updatePlayerDisplay(track);
    if (track) {
      if (isLoadingLibrary) audio.loadTrack(track);
      else audio.loadAndPlay(track);
    } else {
      audio.stop();
    }
    highlightCurrentPlaylistItem();
  };

  audio.onStateChange = (isPlaying) => {
    elLcdStatus.textContent = isPlaying ? "TOCANDO" : "PAUSADO";
    if (isPlaying) {
      elBtnPlay.classList.add("active");
      elBtnPause.classList.remove("active");
    } else {
      elBtnPlay.classList.remove("active");
    }
  };

  audio.onError = (error) => {
    elLcdStatus.textContent = "ERRO DE ÁUDIO";
    console.error("Não foi possível reproduzir a faixa:", error);
  };

  audio.onTimeUpdate = (currentTime, duration) => {
    if (playlist.getCurrentTrack() && !playlist.getCurrentTrack().duration && duration > 0) {
      playlist.getCurrentTrack().duration = duration;
      renderPlaylistTable();
    }

    if (!isSeeking) {
      elSeekSlider.max = duration || 100;
      elSeekSlider.value = currentTime || 0;
    }

    if (isTimeRemainingMode && duration > 0) {
      const remaining = Math.max(0, duration - currentTime);
      elLcdTime.textContent = "-" + formatTime(remaining);
    } else {
      elLcdTime.textContent = formatTime(currentTime);
    }
  };

  audio.onEnded = () => {
    playlist.next();
  };

  elLcdTime.addEventListener("click", () => {
    isTimeRemainingMode = !isTimeRemainingMode;
  });

  // Controls Events
  elBtnPlay.addEventListener("click", () => {
    if (playlist.tracks.length === 0) {
      elFileInput.click();
      return;
    }
    if (playlist.currentIndex === -1) {
      playlist.setCurrentIndex(0);
    } else {
      const playRequest = audio.play();
      if (playRequest && typeof playRequest.catch === "function") {
        playRequest.catch((error) => {
          elLcdStatus.textContent = "ERRO DE ÁUDIO";
          console.error("Não foi possível reproduzir a faixa:", error);
        });
      }
    }
  });

  elBtnPause.addEventListener("click", () => {
    audio.pause();
    elBtnPause.classList.toggle("active");
  });

  elBtnStop.addEventListener("click", () => {
    audio.stop();
    elBtnPlay.classList.remove("active");
    elBtnPause.classList.remove("active");
    elLcdStatus.textContent = "PARADO";
    elSeekSlider.value = 0;
    elLcdTime.textContent = "00:00";
  });

  elBtnNext.addEventListener("click", () => playlist.next());
  elBtnPrev.addEventListener("click", () => playlist.prev());

  elBtnShuffle.addEventListener("click", () => {
    const isShuffle = playlist.toggleShuffle();
    elBtnShuffle.classList.toggle("active", isShuffle);
  });

  elBtnRepeat.addEventListener("click", () => {
    const mode = playlist.cycleRepeat();
    elBtnRepeat.classList.toggle("active", mode !== "off");
    elBtnRepeat.title = `Repetir: ${mode === 'all' ? 'Todas' : mode === 'one' ? 'Faixa Atual' : 'Desativado'}`;
  });

  elBtnTag.addEventListener("click", () => {
    const track = playlist.getCurrentTrack();
    if (track) {
      tagEditor.open(track);
    } else {
      alert("Selecione ou adicione uma música primeiro para editar metadados.");
    }
  });

  // Seek bar
  elSeekSlider.addEventListener("input", () => {
    isSeeking = true;
  });
  elSeekSlider.addEventListener("change", () => {
    isSeeking = false;
    audio.seek(parseFloat(elSeekSlider.value));
  });

  // Volume & Balance
  elVolumeSlider.addEventListener("input", (e) => {
    audio.setVolume(parseFloat(e.target.value));
  });

  if (elBalanceSlider) {
    elBalanceSlider.addEventListener("input", (e) => {
      audio.setBalance(parseFloat(e.target.value));
    });
  }

  // Visualizer Mode Switcher
  const vizModes = ["bars", "wave", "vu"];
  let curVizModeIdx = 0;
  elVizModeBtn.addEventListener("click", () => {
    curVizModeIdx = (curVizModeIdx + 1) % vizModes.length;
    visualizer.setMode(vizModes[curVizModeIdx]);
    elVizModeBtn.textContent = `MODO: ${vizModes[curVizModeIdx].toUpperCase()}`;
    if (vizModes[curVizModeIdx] === "vu" && window.AndroidBridge) {
      window.AndroidBridge.requestVisualizerPermission();
    }
  });

  // Equalizer Setup
  elEqSliders.forEach((slider, idx) => {
    slider.addEventListener("input", (e) => {
      audio.setEqBand(idx, parseFloat(e.target.value));
    });
  });

  if (elPreampSlider) {
    elPreampSlider.addEventListener("input", (e) => {
      audio.setPreamp(parseFloat(e.target.value));
    });
  }

  if (elEqPresetSelect) {
    elEqPresetSelect.addEventListener("change", (e) => {
      const preset = EQ_PRESETS[e.target.value];
      if (preset) {
        preset.forEach((val, i) => {
          if (elEqSliders[i]) {
            elEqSliders[i].value = val;
            audio.setEqBand(i, val);
          }
        });
      }
    });
  }

  if (elBtnEqToggle) {
    elBtnEqToggle.addEventListener("click", () => {
      const active = elBtnEqToggle.classList.toggle("active");
      audio.toggleEq(active);
    });
  }

  // -------------------------------------------------------------
  // Playlist Table Rendering & Interactions
  // -------------------------------------------------------------
  function highlightCurrentPlaylistItem() {
    const rows = elPlaylistBody.querySelectorAll("tr");
    rows.forEach((row) => {
      row.classList.toggle("playing", Number(row.dataset.trackIndex) === playlist.currentIndex);
    });
  }

  function renderPlaylistTable() {
    const tracks = playlist.getVisibleTracks();
    const trackIndices = new Map(playlist.tracks.map((track, index) => [track, index]));
    const folderGroups = new Map();
    elPlaylistBody.innerHTML = "";
    updateToggleFoldersButton();

    if (tracks.length === 0) {
      elPlaylistBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-playlist">
            <p>Nenhuma música na lista.</p>
            <p style="margin-top: 8px;">Nenhuma música encontrada nos armazenamentos locais. Você também pode carregar arquivos manualmente:</p>
            <button id="btn-load-demo" class="btn-transport active" style="margin-top: 10px; display: inline-block; font-size: 11px;">
              🎵 Testar com Música Demo
            </button>
          </td>
        </tr>
      `;
      const btnDemo = document.getElementById("btn-load-demo");
      if (btnDemo) {
        btnDemo.addEventListener("click", loadDemoTrack);
      }
      return;
    }

    tracks.forEach((track) => {
      const folder = playlist.folderGrouping ? (track.folder || null) : null;
      if (!folderGroups.has(folder)) folderGroups.set(folder, []);
      folderGroups.get(folder).push({ track, index: trackIndices.get(track) });
    });

    const sortedFolderGroups = [];
    folderGroups.forEach((folderTracks, folder) => {
      sortedFolderGroups.push([folder, folderTracks]);
    });
    sortedFolderGroups.sort((left, right) => {
      const leftFolder = left[0] || "";
      const rightFolder = right[0] || "";
      return leftFolder.localeCompare(rightFolder);
    });
    sortedFolderGroups.forEach(([folder, folderTracks]) => {
      const folderRow = document.createElement("tr");
      folderRow.className = "folder-header";
      const folderCell = document.createElement("td");
      folderCell.colSpan = 6;
      const folderName = folder === null
        ? (playlist.folderGrouping ? "Arquivos adicionados" : "Playlist personalizada")
        : folder === "."
          ? "Pasta principal"
          : getFolderDisplayName(folder);
      const trackLabel = folderTracks.length === 1 ? "faixa" : "faixas";
      const stateKey = folderStateKey(folder);
      const isCollapsed = collapsedLibraryFolders.has(stateKey);
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "folder-toggle";
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
      toggleButton.title = isCollapsed ? "Expandir pasta" : "Recolher pasta";
      const arrow = document.createElement("span");
      arrow.className = "folder-toggle-arrow";
      arrow.textContent = isCollapsed ? "▶" : "▼";
      const label = document.createElement("span");
      label.textContent = `📁 ${folderName} · ${folderTracks.length} ${trackLabel}`;
      toggleButton.appendChild(arrow);
      toggleButton.appendChild(label);
      folderCell.appendChild(toggleButton);
      folderRow.appendChild(folderCell);
      elPlaylistBody.appendChild(folderRow);

      const folderRows = [];
      folderTracks.forEach(({ track, index }) => {
        const tr = document.createElement("tr");
        tr.dataset.trackIndex = index;
        tr.hidden = isCollapsed;
        if (index === playlist.currentIndex) tr.classList.add("playing");

        const trackNumber = document.createElement("td");
        trackNumber.className = "col-num";
        trackNumber.textContent = track.track || String(index + 1);
        const titleCell = document.createElement("td");
        titleCell.className = "col-title";
        titleCell.title = track.title;
        titleCell.textContent = track.title;
        const artistCell = document.createElement("td");
        artistCell.className = "col-artist";
        artistCell.title = track.artist;
        artistCell.textContent = track.artist;
        const albumCell = document.createElement("td");
        albumCell.className = "col-album";
        albumCell.title = track.album;
        albumCell.textContent = track.album;
        const durationCell = document.createElement("td");
        durationCell.className = "col-dur";
        durationCell.textContent = track.duration ? formatTime(track.duration) : "--:--";
        const actionsCell = document.createElement("td");
        actionsCell.className = "col-actions";
        const tagButton = document.createElement("button");
        tagButton.className = "btn-mini btn-row-tag";
        tagButton.title = "Editar Metadados ID3";
        tagButton.textContent = "🏷️";
        const deleteButton = document.createElement("button");
        deleteButton.className = "btn-mini btn-row-del";
        deleteButton.title = "Remover da Lista";
        deleteButton.textContent = "✖";
        actionsCell.appendChild(tagButton);
        actionsCell.appendChild(deleteButton);
        tr.appendChild(trackNumber);
        tr.appendChild(titleCell);
        tr.appendChild(artistCell);
        tr.appendChild(albumCell);
        tr.appendChild(durationCell);
        tr.appendChild(actionsCell);

        tr.addEventListener("dblclick", () => {
          playlist.setCurrentIndex(index);
        });

        tr.addEventListener("click", (e) => {
          if (e.target.closest(".btn-row-tag") || e.target.closest(".btn-row-del")) return;
          playlist.setCurrentIndex(index);
        });

        tr.querySelector(".btn-row-tag").addEventListener("click", (e) => {
          e.stopPropagation();
          tagEditor.open(track);
        });

        tr.querySelector(".btn-row-del").addEventListener("click", (e) => {
          e.stopPropagation();
          playlist.removeTrack(index);
        });

        elPlaylistBody.appendChild(tr);
        folderRows.push(tr);
      });

      toggleButton.addEventListener("click", () => {
        const shouldCollapse = !collapsedLibraryFolders.has(stateKey);
        if (shouldCollapse) collapsedLibraryFolders.add(stateKey);
        else collapsedLibraryFolders.delete(stateKey);
        const expanded = !shouldCollapse;
        toggleButton.setAttribute("aria-expanded", String(expanded));
        toggleButton.title = expanded ? "Recolher pasta" : "Expandir pasta";
        arrow.textContent = expanded ? "▼" : "▶";
        folderRows.forEach(row => {
          row.hidden = shouldCollapse;
        });
        saveCollapsedFolderStates();
        updateToggleFoldersButton();
      });
    });
  }

  playlist.onPlaylistUpdated = () => {
    renderPlaylistTable();
  };

  if (elBtnToggleFolders) {
    elBtnToggleFolders.addEventListener("click", () => {
      const keys = getPlaylistFolderStateKeys();
      const shouldCollapse = keys.some(key => !collapsedLibraryFolders.has(key));
      keys.forEach(key => {
        if (shouldCollapse) collapsedLibraryFolders.add(key);
        else collapsedLibraryFolders.delete(key);
      });
      saveCollapsedFolderStates();
      renderPlaylistTable();
    });
  }

  // Add Files & Folders manually
  elBtnAddFiles.addEventListener("click", () => elFileInput.click());
  elBtnAddFolder.addEventListener("click", () => elFolderInput.click());

  elFileInput.addEventListener("change", async (e) => {
    if (e.target.files.length > 0) {
      await playlist.addFiles(Array.from(e.target.files));
      elFileInput.value = "";
    }
  });

  elFolderInput.addEventListener("change", async (e) => {
    if (e.target.files.length > 0) {
      await playlist.addFiles(Array.from(e.target.files));
      elFolderInput.value = "";
    }
  });

  elBtnClearPlaylist.addEventListener("click", () => {
    if (confirm("Deseja limpar toda a playlist?")) {
      playlist.clear();
    }
  });

  elBtnExportM3u.addEventListener("click", () => {
    playlist.exportM3U();
  });

  elSearchInput.addEventListener("input", (e) => {
    playlist.setFilter(e.target.value);
  });

  // Sort buttons
  document.querySelectorAll("[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      const field = btn.getAttribute("data-sort");
      playlist.sortBy(field);
    });
  });

  // -------------------------------------------------------------
  // Automatic local storage music scan
  // -------------------------------------------------------------
  async function scanLocalStorage() {
    elLibraryStatus.textContent = "Buscando músicas nos armazenamentos locais...";
    elBtnScanStorage.disabled = true;
    try {
      let data;
      if (window.AndroidBridge) {
        data = JSON.parse(window.AndroidBridge.scanMusic());
      } else {
        const response = await fetch("/api/library");
        if (!response.ok) {
          throw new Error(`Falha na busca (${response.status}).`);
        }
        data = await response.json();
      }
      if (!data.success) {
        throw new Error(data.error || "Não foi possível buscar músicas.");
      }

      isLoadingLibrary = true;
      try {
        libraryTracks = playlist.loadLibraryTracks(data);
      } finally {
        isLoadingLibrary = false;
      }
      const storageLabel = data.storageCount === 1 ? "armazenamento" : "armazenamentos";
      const trackLabel = data.count === 1 ? "música encontrada" : "músicas encontradas";
      const scanWarning = data.scanErrorCount
        ? ` · ${data.scanErrorCount} pasta(s) sem acesso`
        : "";
      elLibraryStatus.textContent =
        `${data.count} ${trackLabel} em ${data.storageCount} ${storageLabel}${scanWarning}`;
    } catch (error) {
      console.error("Não foi possível buscar músicas nos armazenamentos locais:", error);
      elLibraryStatus.textContent = `Erro na busca: ${error.message}`;
    } finally {
      elBtnScanStorage.disabled = false;
    }
  }

  elBtnScanStorage.addEventListener("click", scanLocalStorage);
  window.addEventListener("musicmatch:scan-library", scanLocalStorage);
  scanLocalStorage();

  function setCustomPlaylistStatus(message, state = "") {
    elPlaylistStatusMsg.textContent = message;
    elPlaylistStatusMsg.className = `tag-status${state ? ` ${state}` : ""}`;
  }

  function renderSavedPlaylistOptions(selectedId = "") {
    elPlaylistSavedSelect.innerHTML = "";
    const newOption = document.createElement("option");
    newOption.value = "";
    newOption.textContent = "Nova playlist";
    elPlaylistSavedSelect.appendChild(newOption);

    savedCustomPlaylists.forEach(savedPlaylist => {
      const option = document.createElement("option");
      option.value = savedPlaylist.id;
      option.textContent = savedPlaylist.name;
      elPlaylistSavedSelect.appendChild(option);
    });

    elPlaylistSavedSelect.value = selectedId;
    selectedCustomPlaylistId = selectedId;
    elPlaylistBtnDelete.disabled = !selectedId;
  }

  function renderCustomPlaylistBuilder() {
    const search = elPlaylistTrackSearch.value.trim().toLocaleLowerCase();
    const draftPaths = new Set(draftPlaylist.map(track => track.fullPath));
    const availableTracks = libraryTracks.filter(track => {
      const fields = [track.title, track.artist, track.album, track.folder];
      return fields.some(field => field && field.toLocaleLowerCase().includes(search));
    });

    elPlaylistLibraryList.innerHTML = "";
    if (availableTracks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "playlist-picker-empty";
      empty.textContent = libraryTracks.length ? "Nenhuma música encontrada." : "A biblioteca ainda não carregou músicas.";
      elPlaylistLibraryList.appendChild(empty);
    }

    availableTracks.forEach(track => {
      const row = document.createElement("div");
      row.className = "playlist-picker-row";
      const info = document.createElement("div");
      info.className = "playlist-picker-info";
      const title = document.createElement("div");
      title.className = "playlist-picker-title";
      title.textContent = track.title || track.filename;
      const detail = document.createElement("div");
      detail.className = "playlist-picker-detail";
      const folder = track.folder === "."
        ? "Pasta principal"
        : track.folder
          ? getFolderDisplayName(track.folder)
          : "Arquivos adicionados";
      detail.textContent = `${track.artist || "Desconhecido"} · ${folder}`;
      info.appendChild(title);
      info.appendChild(detail);

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "playlist-picker-action";
      addButton.textContent = draftPaths.has(track.fullPath) ? "Adicionada" : "＋ Adicionar";
      addButton.disabled = draftPaths.has(track.fullPath);
      addButton.addEventListener("click", () => {
        draftPlaylist.push(track);
        renderCustomPlaylistBuilder();
      });

      row.appendChild(info);
      row.appendChild(addButton);
      elPlaylistLibraryList.appendChild(row);
    });

    elPlaylistDraftCount.textContent = `(${draftPlaylist.length})`;
    elPlaylistDraftList.innerHTML = "";
    if (draftPlaylist.length === 0) {
      const empty = document.createElement("div");
      empty.className = "playlist-picker-empty";
      empty.textContent = "Adicione músicas da biblioteca para montar a playlist.";
      elPlaylistDraftList.appendChild(empty);
    }

    draftPlaylist.forEach((track, index) => {
      const row = document.createElement("div");
      row.className = "playlist-picker-row";
      const info = document.createElement("div");
      info.className = "playlist-picker-info";
      const title = document.createElement("div");
      title.className = "playlist-picker-title";
      title.textContent = track.title || track.filename;
      const detail = document.createElement("div");
      detail.className = "playlist-picker-detail";
      detail.textContent = track.artist || "Desconhecido";
      info.appendChild(title);
      info.appendChild(detail);

      const moveUpButton = document.createElement("button");
      moveUpButton.type = "button";
      moveUpButton.className = "playlist-picker-action";
      moveUpButton.textContent = "↑";
      moveUpButton.title = "Mover para cima";
      moveUpButton.disabled = index === 0;
      moveUpButton.addEventListener("click", () => {
        [draftPlaylist[index - 1], draftPlaylist[index]] = [draftPlaylist[index], draftPlaylist[index - 1]];
        renderCustomPlaylistBuilder();
      });

      const moveDownButton = document.createElement("button");
      moveDownButton.type = "button";
      moveDownButton.className = "playlist-picker-action";
      moveDownButton.textContent = "↓";
      moveDownButton.title = "Mover para baixo";
      moveDownButton.disabled = index === draftPlaylist.length - 1;
      moveDownButton.addEventListener("click", () => {
        [draftPlaylist[index], draftPlaylist[index + 1]] = [draftPlaylist[index + 1], draftPlaylist[index]];
        renderCustomPlaylistBuilder();
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "playlist-picker-action";
      removeButton.textContent = "✕";
      removeButton.title = "Remover da playlist";
      removeButton.addEventListener("click", () => {
        draftPlaylist.splice(index, 1);
        renderCustomPlaylistBuilder();
      });

      row.appendChild(info);
      row.appendChild(moveUpButton);
      row.appendChild(moveDownButton);
      row.appendChild(removeButton);
      elPlaylistDraftList.appendChild(row);
    });
  }

  async function fetchSavedCustomPlaylists() {
    if (window.AndroidBridge) {
      const data = JSON.parse(window.AndroidBridge.getPlaylists());
      if (!data.success || !Array.isArray(data.playlists)) {
        throw new Error(data.error || "Não foi possível carregar as playlists salvas.");
      }
      savedCustomPlaylists = data.playlists;
      return;
    }

    const response = await fetch("/api/get_playlists");
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.playlists)) {
      throw new Error(data.error || "Não foi possível carregar as playlists salvas.");
    }
    savedCustomPlaylists = data.playlists;
  }

  async function saveCustomPlaylists(playlists) {
    if (window.AndroidBridge) {
      const data = JSON.parse(window.AndroidBridge.savePlaylists(JSON.stringify(playlists)));
      if (!data.success) {
        throw new Error(data.error || "Não foi possível salvar as playlists.");
      }
      savedCustomPlaylists = data.playlists;
      return;
    }

    const response = await fetch("/api/save_playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlists })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Não foi possível salvar as playlists.");
    }
    savedCustomPlaylists = data.playlists;
  }

  async function openCustomPlaylistBuilder() {
    draftPlaylist = [];
    selectedCustomPlaylistId = "";
    elPlaylistNameInput.value = "";
    elPlaylistTrackSearch.value = "";
    setCustomPlaylistStatus("");
    renderSavedPlaylistOptions();
    renderCustomPlaylistBuilder();
    elPlaylistModal.classList.remove("hidden");

    try {
      await fetchSavedCustomPlaylists();
      renderSavedPlaylistOptions();
    } catch (err) {
      setCustomPlaylistStatus(err.message, "error");
    }
  }

  if (elBtnOpenPlaylists) elBtnOpenPlaylists.addEventListener("click", openCustomPlaylistBuilder);
  if (elPlaylistBtnClose) elPlaylistBtnClose.addEventListener("click", () => elPlaylistModal.classList.add("hidden"));
  if (elPlaylistBtnCancel) elPlaylistBtnCancel.addEventListener("click", () => elPlaylistModal.classList.add("hidden"));
  if (elPlaylistModal) {
    elPlaylistModal.addEventListener("click", (e) => {
      if (e.target === elPlaylistModal) elPlaylistModal.classList.add("hidden");
    });
  }

  elPlaylistTrackSearch.addEventListener("input", renderCustomPlaylistBuilder);

  elPlaylistSavedSelect.addEventListener("change", () => {
    selectedCustomPlaylistId = elPlaylistSavedSelect.value;
    const selected = savedCustomPlaylists.find(item => item.id === selectedCustomPlaylistId);
    elPlaylistNameInput.value = selected ? selected.name : "";
    elPlaylistBtnDelete.disabled = !selectedCustomPlaylistId;
  });

  elPlaylistBtnLoad.addEventListener("click", () => {
    const selected = savedCustomPlaylists.find(item => item.id === elPlaylistSavedSelect.value);
    if (!selected) {
      setCustomPlaylistStatus("Selecione uma playlist salva para abrir.", "error");
      return;
    }

    const tracksByPath = new Map(libraryTracks.map(track => [track.fullPath, track]));
    draftPlaylist = selected.trackPaths.map(path => tracksByPath.get(path)).filter(Boolean);
    elPlaylistNameInput.value = selected.name;
    selectedCustomPlaylistId = selected.id;
    renderCustomPlaylistBuilder();
    const missing = selected.trackPaths.length - draftPlaylist.length;
    setCustomPlaylistStatus(
      missing ? `${missing} faixa(s) não estão na biblioteca atual.` : "Playlist carregada.",
      missing ? "info" : "success"
    );
  });

  elPlaylistBtnDelete.addEventListener("click", async () => {
    const selected = savedCustomPlaylists.find(item => item.id === selectedCustomPlaylistId);
    if (!selected || !confirm(`Excluir a playlist "${selected.name}"?`)) return;

    try {
      const updated = savedCustomPlaylists.filter(item => item.id !== selected.id);
      await saveCustomPlaylists(updated);
      renderSavedPlaylistOptions();
      elPlaylistNameInput.value = "";
      setCustomPlaylistStatus("Playlist excluída.", "success");
    } catch (err) {
      setCustomPlaylistStatus(err.message, "error");
    }
  });

  elPlaylistBtnSave.addEventListener("click", async () => {
    const name = elPlaylistNameInput.value.trim();
    if (!name) {
      setCustomPlaylistStatus("Digite um nome para a playlist.", "error");
      return;
    }
    if (draftPlaylist.length === 0) {
      setCustomPlaylistStatus("Adicione pelo menos uma música.", "error");
      return;
    }

    const id = selectedCustomPlaylistId || `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const savedPlaylist = {
      id,
      name,
      trackPaths: draftPlaylist.map(track => track.fullPath)
    };
    const updated = savedCustomPlaylists.filter(item => item.id !== id);
    updated.push(savedPlaylist);

    try {
      await saveCustomPlaylists(updated);
      renderSavedPlaylistOptions(id);
      setCustomPlaylistStatus("Playlist salva em config.json.", "success");
    } catch (err) {
      setCustomPlaylistStatus(err.message, "error");
    }
  });

  elPlaylistBtnPlay.addEventListener("click", () => {
    if (draftPlaylist.length === 0) {
      setCustomPlaylistStatus("Adicione pelo menos uma música para tocar.", "error");
      return;
    }
    playlist.replaceTracks(draftPlaylist);
    elPlaylistModal.classList.add("hidden");
  });

  // -------------------------------------------------------------
  // Drag and Drop (Files or Folder)
  // -------------------------------------------------------------
  ["dragenter", "dragover"].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elDropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elDropzone.classList.remove("dragover");
    });
  });

  window.addEventListener("drop", async (e) => {
    const files = [];
    if (e.dataTransfer.items) {
      for (const item of e.dataTransfer.items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    } else {
      files.push(...Array.from(e.dataTransfer.files));
    }

    if (files.length > 0) {
      await playlist.addFiles(files);
    }
  });

  // -------------------------------------------------------------
  // Keyboard Shortcuts
  // -------------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
      return;
    }

    switch (e.code) {
      case "Space":
        e.preventDefault();
        if (audio.isPlaying) audio.pause();
        else audio.play();
        break;
      case "ArrowRight":
        if (e.shiftKey) {
          playlist.next();
        } else {
          audio.seek(audio.audio.currentTime + 5);
        }
        break;
      case "ArrowLeft":
        if (e.shiftKey) {
          playlist.prev();
        } else {
          audio.seek(audio.audio.currentTime - 5);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        elVolumeSlider.value = Math.min(1, parseFloat(elVolumeSlider.value) + 0.05);
        audio.setVolume(parseFloat(elVolumeSlider.value));
        break;
      case "ArrowDown":
        e.preventDefault();
        elVolumeSlider.value = Math.max(0, parseFloat(elVolumeSlider.value) - 0.05);
        audio.setVolume(parseFloat(elVolumeSlider.value));
        break;
    }
  });

  async function loadDemoTrack() {
    try {
      const resp = await fetch("demo_tune.wav");
      const blob = await resp.blob();
      const file = new File([blob], "MusicMatch_Demo_Theme.wav", { type: "audio/wav" });
      const tracks = await playlist.addFiles([file]);
      if (tracks.length > 0) {
        tracks[0].title = "Cyber Jukebox Theme";
        tracks[0].artist = "MusicMatch Nostalgia";
        tracks[0].album = "Retro Sounds 2000";
        tracks[0].year = "2000";
        tracks[0].genre = "Synthpop";
        tracks[0].track = "01";
        playlist.onPlaylistUpdated();
        playlist.setCurrentIndex(0);
      }
    } catch (e) {
      console.warn("Could not load demo track:", e);
    }
  }

});
