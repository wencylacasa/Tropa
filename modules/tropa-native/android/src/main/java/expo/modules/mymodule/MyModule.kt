package expo.modules.mymodule

import android.content.Intent
import android.net.Uri
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.Manifest
import android.content.pm.PackageManager
import android.media.ToneGenerator
import android.util.Base64
import android.view.KeyEvent

class MyModule : Module() {
  private var audioFocusChangeListener: AudioManager.OnAudioFocusChangeListener? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var mic: MicCapture? = null

  private fun stopMic() {
    mic?.stop()
    mic = null
  }

  private fun audioManager(): AudioManager? {
    val context = appContext.reactContext ?: return null
    return context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  }

  /** Simulates a headset/media button press so the active player reacts. */
  private fun dispatchMediaKey(keyCode: Int) {
    val audioManager = audioManager() ?: return
    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
  }

  override fun definition() = ModuleDefinition {
    Name("TropaNative")

    Events("onAudioData", "onMicError", "onStopRequested")

    OnCreate {
      TropaForegroundService.onStopRequested = {
        stopMic()
        sendEvent("onStopRequested", mapOf<String, Any?>())
      }
    }

    OnDestroy {
      TropaForegroundService.onStopRequested = null
      stopMic()
    }

    /** Starts 16 kHz mono capture; each chunk arrives as base64 PCM16 in "onAudioData". */
    Function("startMic") { chunkSamples: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw IllegalStateException("RECORD_AUDIO permission is not granted")
      }
      if (mic?.isRunning == true) return@Function
      val capture = MicCapture(
        chunkSamples,
        onChunk = { bytes, length ->
          sendEvent("onAudioData", mapOf("data" to Base64.encodeToString(bytes, 0, length, Base64.NO_WRAP)))
        },
        onError = { message -> sendEvent("onMicError", mapOf("message" to message)) },
      )
      capture.start()
      mic = capture
    }

    Function("stopMic") {
      stopMic()
    }

    /** Short soft beep after a possible trigger. Resolves when it has finished. */
    AsyncFunction("beep") { durationMs: Int ->
      val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 60)
      try {
        tone.startTone(ToneGenerator.TONE_PROP_BEEP, durationMs)
        Thread.sleep(durationMs.toLong() + 30)
      } finally {
        tone.release()
      }
    }

    Function("dialNumber") { phoneNumber: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(Intent.ACTION_CALL).apply {
        data = Uri.parse("tel:$phoneNumber")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(intent)
    }

    Function("sendSilentSms") { phoneNumber: String, message: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION")
        SmsManager.getDefault()
      }
      // Split so a long SOS text (location link) is not silently dropped.
      val parts = smsManager.divideMessage(message)
      if (parts.size > 1) {
        smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
      } else {
        smsManager.sendTextMessage(phoneNumber, null, message, null, null)
      }
    }

    Function("startForegroundService") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, TropaForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    Function("stopForegroundService") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, TropaForegroundService::class.java)
      context.stopService(intent)
    }

    Function("requestAudioFocus") {
      val context = appContext.reactContext ?: return@Function false
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      
      if (audioFocusChangeListener == null) {
        audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { }
      }
      
      val res = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val attr = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANT)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attr)
          .setAcceptsDelayedFocusGain(false)
          .setOnAudioFocusChangeListener(audioFocusChangeListener!!)
          .build()
        audioFocusRequest = req
        audioManager.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(
          audioFocusChangeListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
        )
      }
      res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    Function("abandonAudioFocus") {
      val context = appContext.reactContext ?: return@Function null
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        audioFocusRequest = null
      } else {
        @Suppress("DEPRECATION")
        audioFocusChangeListener?.let { audioManager.abandonAudioFocus(it) }
      }
    }

    Function("isBatteryOptimizationIgnored") {
      val context = appContext.reactContext ?: return@Function false
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("requestBatteryExemption") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(intent)
    }

    /** Headset-style play/pause toggle for whatever player is active. */
    Function("mediaPlayPause") {
      dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
    }

    Function("mediaNext") {
      dispatchMediaKey(KeyEvent.KEYCODE_MEDIA_NEXT)
    }

    /** One step up/down on the music stream, with the system volume panel shown. */
    Function("volumeUp") {
      audioManager()?.adjustStreamVolume(
        AudioManager.STREAM_MUSIC,
        AudioManager.ADJUST_RAISE,
        AudioManager.FLAG_SHOW_UI,
      )
    }

    Function("volumeDown") {
      audioManager()?.adjustStreamVolume(
        AudioManager.STREAM_MUSIC,
        AudioManager.ADJUST_LOWER,
        AudioManager.FLAG_SHOW_UI,
      )
    }
  }
}
