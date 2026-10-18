package com.nowomp.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for the workout foreground service.
 *
 * Failures are swallowed rather than thrown: the notification is a convenience,
 * and a workout must never fail to start because the service could not.
 */
class WorkoutNotificationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WorkoutNotificationModule"

    @ReactMethod
    fun startWorkoutNotification(startTimeMillis: Double) {
        try {
            WorkoutForegroundService.startService(
                reactApplicationContext,
                startTimeMillis.toLong()
            )
        } catch (e: Exception) {
            // Most likely a background-start restriction. Not fatal.
            android.util.Log.w("WorkoutNotification", "Could not start service", e)
        }
    }

    @ReactMethod
    fun stopWorkoutNotification() {
        try {
            WorkoutForegroundService.stopService(reactApplicationContext)
        } catch (e: Exception) {
            android.util.Log.w("WorkoutNotification", "Could not stop service", e)
        }
    }
}
