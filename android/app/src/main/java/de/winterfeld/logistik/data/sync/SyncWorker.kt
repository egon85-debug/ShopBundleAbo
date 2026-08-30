package de.winterfeld.logistik.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.gson.Gson
import com.google.gson.JsonObject
import de.winterfeld.logistik.WinterfeldApp
import de.winterfeld.logistik.data.local.PendingOperationEntity
import de.winterfeld.logistik.data.remote.dto.AnswerDto
import de.winterfeld.logistik.data.remote.dto.CaptureCreateRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Arbeitet die Upload-Queue strikt in Reihenfolge ab (Anforderung 21).
 * Läuft nur mit Netzverbindung; WorkManager übernimmt Exponential-Backoff.
 * Alle Operationen sind serverseitig idempotent (client_capture_id/client_image_id).
 */
class SyncWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    private val gson = Gson()

    override suspend fun doWork(): Result {
        val app = applicationContext as WinterfeldApp
        val container = app.container
        val db = container.database
        val api = container.apiClient

        while (true) {
            val op = db.pendingOperationDao().next() ?: return Result.success()
            val capture = db.captureDao().byId(op.captureId)
            if (capture == null) {
                db.pendingOperationDao().delete(op.seq)
                continue
            }
            try {
                when (op.type) {
                    "CREATE_CAPTURE" -> {
                        val product = api.service().createCapture(
                            CaptureCreateRequest(capture.id, capture.quickMode))
                        db.captureDao().markSynced(
                            capture.id, product.id, product.internalSku, "synced")
                    }
                    "UPLOAD_IMAGE" -> {
                        val serverId = requireServerId(op)
                        val imageId = payload(op).get("imageId").asString
                        val image = db.captureImageDao().byId(imageId)
                        if (image != null && !image.uploaded) {
                            val file = File(image.filePath)
                            if (file.exists()) {
                                val part = MultipartBody.Part.createFormData(
                                    "file", file.name,
                                    file.asRequestBody("image/jpeg".toMediaType()))
                                api.service().uploadImage(
                                    serverId, part,
                                    image.role.toRequestBody("text/plain".toMediaType()),
                                    image.id.toRequestBody("text/plain".toMediaType()))
                                db.captureImageDao().markUploaded(image.id)
                                // Lokale Kopie erst nach Serverbestätigung löschen.
                                file.delete()
                            }
                        }
                    }
                    "SEND_VOICE" -> {
                        val serverId = requireServerId(op)
                        val transcript = payload(op).get("transcript").asString
                        api.service().sendTranscript(
                            serverId, transcript.toRequestBody("text/plain".toMediaType()))
                    }
                    "SEND_ANSWER" -> {
                        val serverId = requireServerId(op)
                        val answer = gson.fromJson(op.payload, AnswerDto::class.java)
                        api.service().sendAnswers(serverId,
                            de.winterfeld.logistik.data.remote.dto.AnswersRequest(listOf(answer)))
                    }
                    "CONFIRM" -> {
                        val serverId = requireServerId(op)
                        val json = payload(op)
                        val action = json.get("duplicateAction")
                            ?.takeIf { !it.isJsonNull }?.asString
                        val dupId = json.get("duplicateId")
                            ?.takeIf { !it.isJsonNull }?.asString
                        val result = api.service().confirm(serverId, action, dupId)
                        if (result.status == "duplicate_found") {
                            // Benutzerentscheidung nötig → Status setzen, Operation entfernen.
                            db.captureDao().setStatus(capture.id, "duplicate_found")
                        } else {
                            db.captureDao().setStatus(capture.id, "confirmed")
                        }
                    }
                }
                db.pendingOperationDao().delete(op.seq)
            } catch (e: Exception) {
                db.pendingOperationDao().update(op.copy(
                    attempts = op.attempts + 1,
                    lastError = "${e.javaClass.simpleName}: ${e.message}"))
                return Result.retry() // WorkManager-Backoff; Daten bleiben erhalten
            }
        }
    }

    private fun payload(op: PendingOperationEntity): JsonObject =
        gson.fromJson(op.payload, JsonObject::class.java)

    private suspend fun requireServerId(op: PendingOperationEntity): String {
        val app = applicationContext as WinterfeldApp
        val capture = app.container.database.captureDao().byId(op.captureId)
        return capture?.serverProductId
            ?: throw IllegalStateException("Capture noch nicht am Server angelegt")
    }

    companion object {
        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "winterfeld-sync", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}
