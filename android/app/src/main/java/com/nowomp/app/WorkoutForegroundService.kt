package com.nowomp.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps a persistent notification visible for the duration of a workout.
 *
 * A plain notification is dismissible and Android may kill the app during a long
 * session. A foreground service is the supported way to say "this work is
 * ongoing and user-visible", which both pins the notification and protects the
 * process. The timer uses the platform Chronometer, so it counts up on its own
 * without the app waking to redraw it.
 */
class WorkoutForegroundService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "workout_progress_channel"
        private const val CHANNEL_NAME = "Workout Progress"
        const val EXTRA_START_TIME = "START_TIME"

        fun startService(context: Context, startTimeMillis: Long) {
            val intent = Intent(context, WorkoutForegroundService::class.java)
            intent.putExtra(EXTRA_START_TIME, startTimeMillis)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            context.stopService(Intent(context, WorkoutForegroundService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val startTimeMillis =
            intent?.getLongExtra(EXTRA_START_TIME, System.currentTimeMillis())
                ?: System.currentTimeMillis()

        val notification = createNotification(startTimeMillis)

        // startForeground can throw for reasons outside our control — a missing
        // companion permission, a background-start restriction, or an OEM
        // policy. It runs on the main thread of the app process, so an uncaught
        // throw here takes the whole app down. The notification is a
        // convenience; failing to show it must never end a workout.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            android.util.Log.i(
                "WorkoutService",
                "Foreground notification started, counting from $startTimeMillis"
            )
        } catch (e: Exception) {
            android.util.Log.w("WorkoutService", "Could not start foreground notification", e)
            stopSelf()
            return START_NOT_STICKY
        }

        // Restart if the system kills us mid-workout, but without redelivering
        // the original intent — onStartCommand defaults the start time.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                // LOW keeps it silent and out of the way: it is a status
                // indicator, not an alert.
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows a live timer while a workout is running"
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(startTimeMillis: Long): Notification {
        // Tapping the notification reopens the app so the workout can be ended.
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Workout in progress")
            .setContentText("Tap to open NoWomp and finish")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            // Ongoing + no auto-cancel is what makes it unswipeable.
            .setOngoing(true)
            .setAutoCancel(false)
            .setColor(Color.parseColor("#A8FF3E"))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        // setWhen takes wall-clock millis, and the Chronometer counts up from
        // it. Passing an elapsedRealtime value here (as is easy to do) shows a
        // wildly wrong duration, since the two clocks share no epoch.
        builder.setShowWhen(true)
        builder.setWhen(startTimeMillis)
        builder.setUsesChronometer(true)

        return builder.build()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        super.onDestroy()
    }
}
