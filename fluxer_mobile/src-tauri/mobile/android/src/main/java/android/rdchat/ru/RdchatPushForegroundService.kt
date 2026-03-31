package ru.rdchat.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class RdchatPushForegroundService : Service() {
	override fun onBind(intent: Intent?): IBinder? = null

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
		if (intent?.action == ACTION_STOP) {
			stopForeground(STOP_FOREGROUND_REMOVE)
			stopSelf()
			return START_NOT_STICKY
		}

		ensureServiceChannel()

		val notification = buildNotification()
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
			startForeground(
				SERVICE_NOTIFICATION_ID,
				notification,
				ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
			)
		} else {
			startForeground(SERVICE_NOTIFICATION_ID, notification)
		}

		return START_STICKY
	}

	private fun ensureServiceChannel() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
			return
		}

		val manager = getSystemService(NotificationManager::class.java) ?: return
		val existing = manager.getNotificationChannel(SERVICE_CHANNEL_ID)
		if (existing != null) {
			return
		}

		val channel =
			NotificationChannel(
				SERVICE_CHANNEL_ID,
				"RdChat Background Sync",
				NotificationManager.IMPORTANCE_LOW
			).apply {
				description = "Keeps RdChat connected for native mobile notifications"
			}

		manager.createNotificationChannel(channel)
	}

	private fun buildNotification(): Notification {
		val launchIntent =
			packageManager.getLaunchIntentForPackage(packageName)
				?: Intent(Intent.ACTION_MAIN).apply {
					setPackage(packageName)
					addCategory(Intent.CATEGORY_LAUNCHER)
				}

		launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

		val contentIntent =
			PendingIntent.getActivity(
				this,
				9_001,
				launchIntent,
				PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
			)

		return NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
			.setSmallIcon(applicationInfo.icon)
			.setContentTitle("RdChat notifications active")
			.setContentText("Listening for new messages while the app runs in the background")
			.setPriority(NotificationCompat.PRIORITY_LOW)
			.setCategory(NotificationCompat.CATEGORY_SERVICE)
			.setOngoing(true)
			.setSilent(true)
			.setContentIntent(contentIntent)
			.build()
	}

	private fun immutableFlag(): Int {
		return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			PendingIntent.FLAG_IMMUTABLE
		} else {
			0
		}
	}

	companion object {
		const val ACTION_START = "ru.rdchat.mobile.action.START"
		const val ACTION_STOP = "ru.rdchat.mobile.action.STOP"
		private const val SERVICE_CHANNEL_ID = "rdchat_background_sync"
		private const val SERVICE_NOTIFICATION_ID = 9_000
	}
}
