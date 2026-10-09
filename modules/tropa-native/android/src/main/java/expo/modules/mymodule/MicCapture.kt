package expo.modules.mymodule

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

/**
 * The single always-on microphone: 16 kHz mono PCM16, delivered in fixed
 * chunks on a background thread. JS decodes the bytes (see src/core/audio/pcm.ts).
 */
class MicCapture(
  private val chunkSamples: Int,
  private val onChunk: (ByteArray, Int) -> Unit,
  private val onError: (String) -> Unit,
) {
  companion object {
    const val SAMPLE_RATE = 16000
  }

  @Volatile private var running = false
  private var thread: Thread? = null
  private var record: AudioRecord? = null

  val isRunning: Boolean get() = running

  /** Caller must have checked RECORD_AUDIO. Throws if the mic cannot be opened. */
  @SuppressLint("MissingPermission")
  fun start() {
    if (running) return

    val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    if (minBuffer <= 0) throw IllegalStateException("16 kHz mono PCM16 is not supported on this device")
    val chunkBytes = chunkSamples * 2

    val rec = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minBuffer, chunkBytes * 4),
    )
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw IllegalStateException("Microphone could not be opened (in use by another app?)")
    }

    rec.startRecording()
    record = rec
    running = true

    thread = Thread({
      val buffer = ByteArray(chunkBytes)
      while (running) {
        // Fill a whole chunk so every frame has the same duration.
        var filled = 0
        while (running && filled < chunkBytes) {
          val n = rec.read(buffer, filled, chunkBytes - filled)
          if (n < 0) {
            running = false
            onError("Microphone read failed ($n)")
            break
          }
          filled += n
        }
        if (filled == chunkBytes) onChunk(buffer, filled)
      }
    }, "TropaMic").apply { start() }
  }

  fun stop() {
    running = false
    thread?.join(500)
    thread = null
    record?.let {
      try {
        it.stop()
      } catch (_: IllegalStateException) {
        // already stopped
      }
      it.release()
    }
    record = null
  }
}
