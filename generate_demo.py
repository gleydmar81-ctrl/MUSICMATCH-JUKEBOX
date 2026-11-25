import wave
import math
import struct

def generate_demo_wav(filename="demo_tune.wav", duration=12, sample_rate=44100):
    # A catchy retro synth melody (chords + bass + arpeggio)
    num_samples = int(duration * sample_rate)
    
    # Notes in Hz
    # C major / A minor progression: Am, F, C, G
    chords = [
        [220.00, 261.63, 329.63], # Am (A3, C4, E4)
        [174.61, 220.00, 261.63], # F  (F3, A3, C4)
        [261.63, 329.63, 392.00], # C  (C4, E4, G4)
        [196.00, 246.94, 293.66], # G  (G3, B3, D4)
    ]
    
    chord_duration = 3.0 # seconds per chord
    
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(2) # Stereo
        wav.setsampwidth(2) # 16-bit
        wav.setframerate(sample_rate)
        
        frames = bytearray()
        
        for i in range(num_samples):
            t = i / sample_rate
            chord_idx = int((t % (len(chords) * chord_duration)) // chord_duration)
            chord = chords[chord_idx]
            
            # Bass note (octave below)
            bass_freq = chord[0] / 2
            bass = 0.3 * math.sin(2 * math.pi * bass_freq * t)
            
            # Arpeggiator (16th notes: 8 notes per second)
            arp_note = chord[int(t * 8) % len(chord)]
            lead = 0.25 * (math.sin(2 * math.pi * arp_note * t) + 0.3 * math.sin(4 * math.pi * arp_note * t))
            
            # Pad / chords
            pad = 0.15 * sum(math.sin(2 * math.pi * f * t) for f in chord)
            
            # Percussive beat (kick on 1 and 3, snare on 2 and 4)
            beat_t = (t * 2) % 1.0 # 120 bpm
            kick = 0.3 * math.sin(2 * math.pi * 60 * (1 - beat_t) * beat_t) * math.exp(-beat_t * 12) if beat_t < 0.25 else 0
            
            # Stereo mix
            left = (bass + lead * 0.8 + pad * 0.5 + kick) * 0.7
            right = (bass + lead * 0.4 + pad * 0.7 + kick) * 0.7
            
            # Clamp to 16-bit
            val_l = int(max(-32767, min(32767, left * 32767)))
            val_r = int(max(-32767, min(32767, right * 32767)))
            
            frames.extend(struct.pack('<hh', val_l, val_r))
            
        wav.writeframes(frames)
    print(f"Generated demo audio: {filename}")

if __name__ == "__main__":
    generate_demo_wav()
