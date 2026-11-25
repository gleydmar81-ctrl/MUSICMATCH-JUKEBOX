/**
 * MusicMatch Jukebox Web - ID3v1 and ID3v2 Parser & Writer
 * High-compatibility ID3v2.3 (UTF-16 with BOM) + ID3v1.1 Dual Tagging
 */

const ID3 = {
  // Standard ID3v1 Genres
  GENRES: [
    "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop",
    "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae",
    "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks",
    "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion",
    "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip",
    "Gospel", "Noise", "AlternRock", "Bass", "Soul", "Punk", "Space", "Meditative",
    "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave",
    "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock",
    "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap", "Pop/Funk", "Jungle",
    "Native American", "Cabaret", "New Wave", "Psychadelic", "Rave", "Showtunes",
    "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro",
    "Musical", "Rock & Roll", "Hard Rock", "Folk", "Folk-Rock", "National Folk",
    "Swing", "Fast Fusion", "Bebob", "Latin", "Revival", "Celtic", "Bluegrass",
    "Avantgarde", "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock",
    "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour",
    "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony", "Booty Bass",
    "Primus", "Porn Groove", "Satire", "Slow Jam", "Club", "Tango", "Samba",
    "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul", "Freestyle", "Duet",
    "Punk Rock", "Drum Solo", "Acapella", "Euro-House", "Dance Hall", "Goa",
    "Drum & Bass", "Club-House", "Hardcore", "Terror", "Indie", "BritPop",
    "Negerpunk", "Polsk Punk", "Beat", "Christian Gangsta", "Heavy Metal",
    "Black Metal", "Crossover", "Contemporary Christian", "Christian Rock",
    "Merengue", "Salsa", "Thrash Metal", "Anime", "JPop", "Synthpop", "MPB", "Bossa Nova"
  ],

  /**
   * Parse ID3 tags from an ArrayBuffer of an MP3 file
   */
  parse(buffer) {
    const tags = {
      title: "",
      artist: "",
      album: "",
      year: "",
      genre: "",
      track: "",
      comment: "",
      cover: null, // { mime: 'image/jpeg', data: Uint8Array, blob: Blob, url: string }
      hasId3v2: false,
      id3v2Size: 0
    };

    if (!buffer || buffer.byteLength < 128) return tags;

    const dataView = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // 1. Check for ID3v2 at the beginning
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { // "ID3"
      const majorVersion = bytes[3];
      const flags = bytes[5];
      const synchsafeSize = ((bytes[6] & 0x7F) << 21) |
                            ((bytes[7] & 0x7F) << 14) |
                            ((bytes[8] & 0x7F) << 7)  |
                            (bytes[9] & 0x7F);
      const totalHeaderSize = 10 + synchsafeSize;
      tags.hasId3v2 = true;
      tags.id3v2Size = totalHeaderSize;

      let offset = 10;
      // Skip extended header if present
      if (flags & 0x40) {
        const extSize = majorVersion === 4
          ? ((bytes[offset] & 0x7F) << 21) | ((bytes[offset+1] & 0x7F) << 14) | ((bytes[offset+2] & 0x7F) << 7) | (bytes[offset+3] & 0x7F)
          : dataView.getUint32(offset);
        offset += extSize;
      }

      const limit = Math.min(totalHeaderSize, buffer.byteLength);

      while (offset + 10 <= limit) {
        // Frame ID (4 chars)
        let frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
        // If we hit padding (00 00 00 00), stop
        if (frameId.charCodeAt(0) === 0) break;

        let frameSize;
        if (majorVersion === 4) {
          frameSize = ((bytes[offset+4] & 0x7F) << 21) |
                      ((bytes[offset+5] & 0x7F) << 14) |
                      ((bytes[offset+6] & 0x7F) << 7)  |
                      (bytes[offset+7] & 0x7F);
        } else {
          frameSize = dataView.getUint32(offset + 4);
        }

        if (frameSize <= 0 || offset + 10 + frameSize > limit) break;

        const frameDataOffset = offset + 10;
        const frameBytes = bytes.subarray(frameDataOffset, frameDataOffset + frameSize);

        try {
          if (frameId === "TIT2") { // Title
            tags.title = this._decodeText(frameBytes);
          } else if (frameId === "TPE1") { // Artist
            tags.artist = this._decodeText(frameBytes);
          } else if (frameId === "TALB") { // Album
            tags.album = this._decodeText(frameBytes);
          } else if (frameId === "TYER" || frameId === "TDRC") { // Year
            tags.year = this._decodeText(frameBytes).substring(0, 4);
          } else if (frameId === "TCON") { // Genre
            let g = this._decodeText(frameBytes);
            const match = g.match(/^\((\d+)\)(.*)$/);
            if (match) {
              const idx = parseInt(match[1], 10);
              tags.genre = match[2].trim() || this.GENRES[idx] || g;
            } else {
              tags.genre = g;
            }
          } else if (frameId === "TRCK") { // Track Number
            tags.track = this._decodeText(frameBytes).split('/')[0].trim();
          } else if (frameId === "COMM") { // Comment
            tags.comment = this._decodeComment(frameBytes);
          } else if (frameId === "APIC") { // Attached Picture
            const pic = this._decodePicture(frameBytes);
            if (pic && !tags.cover) {
              tags.cover = pic;
            }
          }
        } catch (e) {
          console.warn("Error parsing frame", frameId, e);
        }

        offset += 10 + frameSize;
      }
    }

    // 2. Check for ID3v1 at the end (128 bytes)
    if (buffer.byteLength >= 128) {
      const v1Offset = buffer.byteLength - 128;
      if (bytes[v1Offset] === 0x54 && bytes[v1Offset+1] === 0x41 && bytes[v1Offset+2] === 0x47) { // "TAG"
        const readV1Str = (start, len) => {
          let s = "";
          for (let i = 0; i < len; i++) {
            const c = bytes[start + i];
            if (c === 0) break;
            s += String.fromCharCode(c);
          }
          return s.trim();
        };

        if (!tags.title) tags.title = readV1Str(v1Offset + 3, 30);
        if (!tags.artist) tags.artist = readV1Str(v1Offset + 33, 30);
        if (!tags.album) tags.album = readV1Str(v1Offset + 63, 30);
        if (!tags.year) tags.year = readV1Str(v1Offset + 93, 4);
        
        if (!tags.track && bytes[v1Offset + 125] === 0 && bytes[v1Offset + 126] !== 0) {
          tags.track = String(bytes[v1Offset + 126]);
        }
        if (!tags.comment) tags.comment = readV1Str(v1Offset + 97, 28);
        if (!tags.genre) {
          const gIdx = bytes[v1Offset + 127];
          if (this.GENRES[gIdx]) tags.genre = this.GENRES[gIdx];
        }
      }
    }

    return tags;
  },

  _decodeText(bytes) {
    if (bytes.length < 1) return "";
    const encoding = bytes[0];
    const textBytes = bytes.subarray(1);

    try {
      if (encoding === 0) { // ISO-8859-1
        return new TextDecoder("iso-8859-1").decode(textBytes).replace(/\0+$/, "").trim();
      } else if (encoding === 1) { // UTF-16 with BOM
        return new TextDecoder("utf-16").decode(textBytes).replace(/\0+$/, "").trim();
      } else if (encoding === 2) { // UTF-16BE
        return new TextDecoder("utf-16be").decode(textBytes).replace(/\0+$/, "").trim();
      } else if (encoding === 3) { // UTF-8
        return new TextDecoder("utf-8").decode(textBytes).replace(/\0+$/, "").trim();
      }
      return new TextDecoder("utf-8").decode(textBytes).replace(/\0+$/, "").trim();
    } catch (e) {
      return "";
    }
  },

  _decodeComment(bytes) {
    if (bytes.length < 5) return "";
    const encoding = bytes[0];
    let offset = 4; // Skip 1 byte encoding + 3 bytes language
    if (encoding === 0 || encoding === 3) {
      while (offset < bytes.length && bytes[offset] !== 0) offset++;
      offset++;
    } else {
      while (offset + 1 < bytes.length && !(bytes[offset] === 0 && bytes[offset+1] === 0)) offset += 2;
      offset += 2;
    }
    if (offset >= bytes.length) return "";
    return this._decodeText(new Uint8Array([encoding, ...bytes.subarray(offset)]));
  },

  _decodePicture(bytes) {
    if (bytes.length < 10) return null;
    const encoding = bytes[0];
    let offset = 1;

    let mime = "";
    while (offset < bytes.length && bytes[offset] !== 0) {
      mime += String.fromCharCode(bytes[offset]);
      offset++;
    }
    offset++;

    if (!mime) mime = "image/jpeg";
    if (mime.toLowerCase() === "image/jpg") mime = "image/jpeg";

    const pictureType = bytes[offset] || 3;
    offset++;

    if (encoding === 0 || encoding === 3) {
      while (offset < bytes.length && bytes[offset] !== 0) offset++;
      offset++;
    } else {
      while (offset + 1 < bytes.length && !(bytes[offset] === 0 && bytes[offset+1] === 0)) offset += 2;
      offset += 2;
    }

    if (offset >= bytes.length) return null;

    const imgData = bytes.slice(offset);
    const blob = new Blob([imgData], { type: mime });
    const url = URL.createObjectURL(blob);

    return {
      mime,
      type: pictureType,
      data: imgData,
      blob,
      url
    };
  },

  /**
   * Encodes a string into UTF-16LE with BOM (0xFF, 0xFE)
   * This is the standard, universal text encoding for ID3v2.3
   */
  _encodeUtf16WithBom(str) {
    if (!str) str = "";
    const buf = new Uint8Array(2 + str.length * 2);
    buf[0] = 0xFF; // BOM LE
    buf[1] = 0xFE;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      buf[2 + i * 2] = code & 0xFF;
      buf[3 + i * 2] = (code >> 8) & 0xFF;
    }
    return buf;
  },

  /**
   * Build ID3v2.3 tags buffer and prepend to raw MP3 audio data + append ID3v1.1
   * @param {ArrayBuffer} originalBuffer Full MP3 buffer
   * @param {Object} newTags { title, artist, album, year, genre, track, comment, coverData, coverMime }
   * @returns {Blob} Updated MP3 Blob ready for download or saving
   */
  updateMp3(originalBuffer, newTags) {
    const bytes = new Uint8Array(originalBuffer);
    let audioStart = 0;

    // 1. Strip existing ID3v2 at the beginning
    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const synchsafeSize = ((bytes[6] & 0x7F) << 21) |
                            ((bytes[7] & 0x7F) << 14) |
                            ((bytes[8] & 0x7F) << 7)  |
                            (bytes[9] & 0x7F);
      audioStart = 10 + synchsafeSize;
    }

    // 2. Strip existing ID3v1 at the end
    let audioEnd = bytes.length;
    if (audioEnd >= audioStart + 128) {
      if (bytes[audioEnd - 128] === 0x54 && bytes[audioEnd - 127] === 0x41 && bytes[audioEnd - 126] === 0x47) { // "TAG"
        audioEnd -= 128;
      }
    }

    const audioBytes = bytes.subarray(audioStart, audioEnd);

    // 3. Build ID3v2.3 Frames (UTF-16 with BOM for 100% compatibility with Windows/Android/VLC/etc.)
    const frames = [];

    const createTextFrame = (frameId, text) => {
      if (text === undefined || text === null || text === "") return;
      const utf16Bytes = this._encodeUtf16WithBom(text);
      // Byte 0: 0x01 (UTF-16 with BOM encoding indicator for ID3v2.3)
      const frameData = new Uint8Array(1 + utf16Bytes.length);
      frameData[0] = 0x01;
      frameData.set(utf16Bytes, 1);

      frames.push(this._createFrame(frameId, frameData));
    };

    createTextFrame("TIT2", newTags.title);
    createTextFrame("TPE1", newTags.artist);
    createTextFrame("TALB", newTags.album);
    createTextFrame("TYER", newTags.year);
    
    // Genre frame: if matches a known genre name or index
    let genreVal = newTags.genre || "";
    const gIdx = this.GENRES.indexOf(genreVal);
    if (gIdx !== -1) {
      genreVal = `(${gIdx})${genreVal}`;
    }
    createTextFrame("TCON", genreVal);

    createTextFrame("TRCK", newTags.track ? String(newTags.track) : "");

    // Comment Frame (COMM)
    if (newTags.comment) {
      const utf16Comment = this._encodeUtf16WithBom(newTags.comment);
      // Encoding (1 byte: 0x01) + Lang (3 bytes: 'eng') + Short description (4 bytes: FF FE 00 00) + Comment text
      const commData = new Uint8Array(1 + 3 + 4 + utf16Comment.length);
      commData[0] = 0x01; // UTF-16
      commData[1] = 0x65; commData[2] = 0x6E; commData[3] = 0x67; // 'eng'
      commData[4] = 0xFF; commData[5] = 0xFE; commData[6] = 0x00; commData[7] = 0x00; // Empty desc in UTF-16
      commData.set(utf16Comment, 8);
      frames.push(this._createFrame("COMM", commData));
    }

    // Cover Art (APIC)
    if (newTags.coverData && newTags.coverData.length > 0) {
      const mime = newTags.coverMime || "image/jpeg";
      const mimeBytes = new TextEncoder().encode(mime);
      // APIC: enc(1 byte: 0x00) + mime(N bytes) + 0x00 + type(1 byte: 0x03) + desc(0x00) + image data
      const apicData = new Uint8Array(1 + mimeBytes.length + 1 + 1 + 1 + newTags.coverData.length);
      let p = 0;
      apicData[p++] = 0x00; // ISO-8859-1
      apicData.set(mimeBytes, p);
      p += mimeBytes.length;
      apicData[p++] = 0x00; // Null terminator for MIME
      apicData[p++] = 0x03; // Picture Type: 0x03 Front Cover
      apicData[p++] = 0x00; // Empty Description (ISO-8859-1 null term)
      apicData.set(newTags.coverData, p);
      frames.push(this._createFrame("APIC", apicData));
    }

    // Total tag payload
    const framesSize = frames.reduce((acc, f) => acc + f.length, 0);
    const paddingSize = 1024;
    const totalTagPayload = framesSize + paddingSize;

    // ID3v2.3 Header (10 bytes)
    const header = new Uint8Array(10);
    header[0] = 0x49; header[1] = 0x44; header[2] = 0x33; // "ID3"
    header[3] = 0x03; // ID3v2.3
    header[4] = 0x00; // revision
    header[5] = 0x00; // flags

    // Synchsafe size (excluding the 10 header bytes)
    header[6] = (totalTagPayload >> 21) & 0x7F;
    header[7] = (totalTagPayload >> 14) & 0x7F;
    header[8] = (totalTagPayload >> 7)  & 0x7F;
    header[9] = totalTagPayload & 0x7F;

    // 4. Build ID3v1.1 Tag (128 bytes at the very end of file)
    const id3v1Bytes = this._createId3v1(newTags);

    // Assemble new MP3: [ID3v2 Header] + [Frames] + [Padding] + [Audio Bytes] + [ID3v1.1]
    const newFileParts = [header];
    for (const frame of frames) {
      newFileParts.push(frame);
    }
    newFileParts.push(new Uint8Array(paddingSize));
    newFileParts.push(audioBytes);
    newFileParts.push(id3v1Bytes);

    return new Blob(newFileParts, { type: "audio/mpeg" });
  },

  _createFrame(frameId, data) {
    const frame = new Uint8Array(10 + data.length);
    // Frame ID (4 ASCII bytes)
    for (let i = 0; i < 4; i++) {
      frame[i] = frameId.charCodeAt(i);
    }
    // Frame Size (32-bit big-endian integer in ID3v2.3)
    frame[4] = (data.length >> 24) & 0xFF;
    frame[5] = (data.length >> 16) & 0xFF;
    frame[6] = (data.length >> 8)  & 0xFF;
    frame[7] = data.length & 0xFF;
    // Flags (2 bytes: 0x00, 0x00)
    frame[8] = 0x00;
    frame[9] = 0x00;
    // Data
    frame.set(data, 10);
    return frame;
  },

  _createId3v1(tags) {
    const v1 = new Uint8Array(128);
    // "TAG" (0..2)
    v1[0] = 0x54; v1[1] = 0x41; v1[2] = 0x47;

    const writeStr = (str, offset, maxLen) => {
      if (!str) return;
      // Convert to latin1/ascii
      for (let i = 0; i < Math.min(str.length, maxLen); i++) {
        v1[offset + i] = str.charCodeAt(i) & 0xFF;
      }
    };

    writeStr(tags.title, 3, 30);
    writeStr(tags.artist, 33, 30);
    writeStr(tags.album, 63, 30);
    writeStr(tags.year ? String(tags.year) : "", 93, 4);
    writeStr(tags.comment, 97, 28);

    // ID3v1.1 Track number
    v1[125] = 0x00;
    const trkNum = parseInt(tags.track, 10);
    v1[126] = (!isNaN(trkNum) && trkNum > 0 && trkNum <= 255) ? trkNum : 0;

    // Genre
    let gIdx = 255;
    if (tags.genre) {
      const idx = this.GENRES.indexOf(tags.genre);
      if (idx !== -1) gIdx = idx;
    }
    v1[127] = gIdx;

    return v1;
  }
};

window.ID3 = ID3;
