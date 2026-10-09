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

class MyModule : Module() {
  private var audioFocusChangeListener: AudioManager.OnAudioFocusChangeListener? = null
  private var audioFocusRequest: AudioFocusRequest? = null

  override fun definition() = ModuleDefinition {
    Name("TropaNative")

    Function("dialNumber") { phoneNumber: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(Intent.ACTION_CALL).apply {
        data = Uri.parse("tel:$phoneNumber")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(intent)
    }

    Function("sendSilentSms") { phoneNumber: String, message: String ->
      val smsManager = SmsManager.getDefault()
      smsManager.sendTextMessage(phoneNumber, null, message, null, null)
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
      val context = appContext.reactContext ?: return@Function
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
  }
}
