import struct
import sys

def verify_mp3_id3(filepath):
    print(f"--- Verificando arquivo: {filepath} ---")
    with open(filepath, "rb") as f:
        data = f.read()

    print(f"Tamanho total do arquivo: {len(data)} bytes")
    
    # 1. Check ID3v2
    if len(data) >= 10 and data[:3] == b"ID3":
        ver_major, ver_rev = data[3], data[4]
        flags = data[5]
        synch_size = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f)
        total_v2 = 10 + synch_size
        print(f"[ID3v2] Versão: 2.{ver_major}.{ver_rev}")
        print(f"[ID3v2] Tamanho declarado: {synch_size} bytes (Total com header: {total_v2})")
        
        offset = 10
        frames_found = {}
        while offset + 10 <= total_v2 and offset + 10 <= len(data):
            fid = data[offset:offset+4].decode('latin1', errors='ignore')
            if ord(fid[0]) == 0:
                print(f"[ID3v2] Encontrado padding em offset {offset}")
                break
            
            if ver_major == 4:
                fsize = ((data[offset+4] & 0x7f) << 21) | ((data[offset+5] & 0x7f) << 14) | ((data[offset+6] & 0x7f) << 7) | (data[offset+7] & 0x7f)
            else:
                fsize = struct.unpack('>I', data[offset+4:offset+8])[0]
                
            fflags = data[offset+8:offset+10]
            fdata = data[offset+10:offset+10+fsize]
            
            # Decode text frame
            if fid.startswith('T'):
                enc = fdata[0] if len(fdata) > 0 else -1
                if enc == 0:
                    val = fdata[1:].decode('latin1', errors='replace').rstrip('\x00')
                elif enc == 1:
                    val = fdata[1:].decode('utf-16', errors='replace').rstrip('\x00')
                elif enc == 3:
                    val = fdata[1:].decode('utf-8', errors='replace').rstrip('\x00')
                else:
                    val = f"<enc {enc} desconhecido>"
                frames_found[fid] = val
                print(f"  Frame {fid} (tam {fsize}, enc {enc}): {val}")
            elif fid == 'APIC':
                enc = fdata[0]
                print(f"  Frame APIC (Capa): {fsize} bytes de dados de imagem")
            elif fid == 'COMM':
                print(f"  Frame COMM (Comentário): {fsize} bytes")
            else:
                print(f"  Frame {fid}: {fsize} bytes")
                
            offset += 10 + fsize
    else:
        print("[ID3v2] Não encontrado no início do arquivo")

    # 2. Check ID3v1
    if len(data) >= 128 and data[-128:-125] == b"TAG":
        print("[ID3v1] Tag encontrada nos últimos 128 bytes:")
        title = data[-125:-95].decode('latin1', errors='ignore').rstrip('\x00').strip()
        artist = data[-95:-65].decode('latin1', errors='ignore').rstrip('\x00').strip()
        album = data[-65:-35].decode('latin1', errors='ignore').rstrip('\x00').strip()
        year = data[-35:-31].decode('latin1', errors='ignore').rstrip('\x00').strip()
        track = data[-2] if data[-3] == 0 else "N/A"
        genre_idx = data[-1]
        print(f"  Título : {title}")
        print(f"  Artista: {artist}")
        print(f"  Álbum  : {album}")
        print(f"  Ano    : {year}")
        print(f"  Faixa  : {track}")
        print(f"  Gênero : índice {genre_idx}")
    else:
        print("[ID3v1] Não encontrado no final do arquivo")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        verify_mp3_id3(sys.argv[1])
    else:
        print("Uso: python3 test_id3_parser.py arquivo.mp3")
