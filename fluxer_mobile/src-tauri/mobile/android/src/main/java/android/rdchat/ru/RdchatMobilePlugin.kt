package ru.rdchat.mobile

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.util.concurrent.atomic.AtomicInteger

private const val MESSAGE_CHANNEL_ID = "rdchat_messages"
private const val MESSAGE_CHANNEL_NAME = "RdChat Messages"
private const val MESSAGE_CHANNEL_DESCRIPTION = "Notifications for new messages and mentions"
private const val EXTRA_URL = "rdchat.notification.url"
private const val EXTRA_TARGET_USER_ID = "rdchat.notification.target_user_id"

data class PendingNotificationClick(
	val url: String,
	val targetUserId: String?
)

object NotificationClickStore {
	private val pending: MutableList<PendingNotificationClick> = mutableListOf()

	@Synchronized
	fun consumeIntent(intent: Intent?) {
		if (intent == null) {
			return
		}

		val url = intent.getStringExtra(EXTRA_URL)?.trim().orEmpty()
		if (url.isEmpty()) {
			return
		}

		val targetUserId = intent.getStringExtra(EXTRA_TARGET_USER_ID)
		pending.add(PendingNotificationClick(url = url, targetUserId = targetUserId))
		intent.removeExtra(EXTRA_URL)
		intent.removeExtra(EXTRA_TARGET_USER_ID)
	}

	@Synchronized
	fun takeAll(): List<PendingNotificationClick> {
		val items = pending.toList()
		pending.clear()
		return items
	}
}

@InvokeArg
class NotificationArgs {
	lateinit var id: String
	lateinit var title: String
	lateinit var body: String
	lateinit var url: String
	lateinit var targetUserId: String
}

@InvokeArg
class PermissionSettingsArgs {
	var kind: String? = null
}

@InvokeArg
class ListenerServiceArgs {
	var enabled: Boolean = false
}

@TauriPlugin(
	permissions = [
		Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone"),
		Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
		Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
		Permission(
			strings = [
				Manifest.permission.READ_MEDIA_IMAGES,
				Manifest.permission.READ_MEDIA_VIDEO,
				Manifest.permission.READ_MEDIA_AUDIO,
				Manifest.permission.READ_EXTERNAL_STORAGE
			],
			alias = "files"
		)
	]
)
class RdchatMobilePlugin(activity: Activity) : Plugin(activity) {
	override fun load(webView: android.webkit.WebView) {
		super.load(webView)
		ensureNotificationChannel()
		NotificationClickStore.consumeIntent(activity.intent)
	}

	override fun onResume() {
		super.onResume()
		NotificationClickStore.consumeIntent(activity.intent)
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		NotificationClickStore.consumeIntent(intent)
	}

	@Command
	fun openSettings(invoke: Invoke) {
		val args = invoke.parseArgs(PermissionSettingsArgs::class.java)

		val intent = when (args.kind?.lowercase()) {
			"notifications" -> {
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
					Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
						putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
					}
				} else {
					Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
						data = Uri.fromParts("package", activity.packageName, null)
					}
				}
			}
			else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
				data = Uri.fromParts("package", activity.packageName, null)
			}
		}

		intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		activity.startActivity(intent)
		invoke.resolve()
	}

	@Command
	fun takePendingNotificationClicks(invoke: Invoke) {
		invoke.resolveObject(NotificationClickStore.takeAll())
	}

	@Command
	fun showNotification(invoke: Invoke) {
		val args = invoke.parseArgs(NotificationArgs::class.java)
		ensureNotificationChannel()

		val launchIntent =
			activity.packageManager.getLaunchIntentForPackage(activity.packageName)
				?: Intent(activity, activity.javaClass)

		launchIntent.putExtra(EXTRA_URL, args.url)
		launchIntent.putExtra(EXTRA_TARGET_USER_ID, args.targetUserId)
		launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

		val requestCode = args.id.hashCode()
		val contentIntent =
			PendingIntent.getActivity(
				activity,
				requestCode,
				launchIntent,
				PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
			)

		val notificationId = nextNotificationId()
		val notification =
			NotificationCompat.Builder(activity, MESSAGE_CHANNEL_ID)
				.setSmallIcon(activity.applicationInfo.icon)
				.setContentTitle(args.title)
				.setContentText(args.body)
				.setStyle(NotificationCompat.BigTextStyle().bigText(args.body))
				.setContentIntent(contentIntent)
				.setPriority(NotificationCompat.PRIORITY_HIGH)
				.setCategory(NotificationCompat.CATEGORY_MESSAGE)
				.setAutoCancel(true)
				.build()

		NotificationManagerCompat.from(activity).notify(notificationId, notification)
		invoke.resolveObject(mapOf("id" to notificationId.toString()))
	}

	@Command
	fun setListenerServiceState(invoke: Invoke) {
		val args = invoke.parseArgs(ListenerServiceArgs::class.java)

		if (args.enabled) {
			val intent = Intent(activity, RdchatPushForegroundService::class.java).apply {
				action = RdchatPushForegroundService.ACTION_START
			}
			ContextCompat.startForegroundService(activity, intent)
		} else {
			activity.stopService(Intent(activity, RdchatPushForegroundService::class.java))
		}

		invoke.resolve()
	}

	private fun ensureNotificationChannel() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
			return
		}

		val manager = activity.getSystemService(NotificationManager::class.java) ?: return
		val existing = manager.getNotificationChannel(MESSAGE_CHANNEL_ID)
		if (existing != null) {
			return
		}

		val channel =
			NotificationChannel(
				MESSAGE_CHANNEL_ID,
				MESSAGE_CHANNEL_NAME,
				NotificationManager.IMPORTANCE_HIGH
			).apply {
				description = MESSAGE_CHANNEL_DESCRIPTION
			}

		manager.createNotificationChannel(channel)
	}

	private fun immutableFlag(): Int {
		return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			PendingIntent.FLAG_IMMUTABLE
		} else {
			0
		}
	}

	private fun nextNotificationId(): Int {
		return notificationCounter.incrementAndGet()
	}

	companion object {
		private val notificationCounter = AtomicInteger(4_000)
	}
}
