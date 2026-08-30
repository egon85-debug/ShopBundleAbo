package de.winterfeld.logistik.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Lokale Wahrheit einer Erfassung — überlebt jeden Verbindungsabbruch. */
@Entity(tableName = "captures")
data class CaptureEntity(
    @PrimaryKey val id: String,              // client_capture_id (UUID)
    val serverProductId: String? = null,
    val internalSku: String? = null,
    val status: String = "draft",            // draft | syncing | synced | confirmed | error
    val quickMode: Boolean = false,
    val transcript: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "capture_images",
    indices = [Index("captureId")],
)
data class CaptureImageEntity(
    @PrimaryKey val id: String,              // client_image_id (UUID)
    val captureId: String,
    val filePath: String,                    // App-privater Speicher
    val role: String,                        // front | back | packaging | barcode | …
    val uploaded: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
)

/** Upload-Queue: jede serverwirksame Aktion, strikt geordnet je Erfassung. */
@Entity(
    tableName = "pending_operations",
    indices = [Index("captureId"), Index("seq")],
)
data class PendingOperationEntity(
    @PrimaryKey(autoGenerate = true) val seq: Long = 0,
    val captureId: String,
    val type: String,                        // CREATE_CAPTURE | UPLOAD_IMAGE | SEND_VOICE | SEND_ANSWER | CONFIRM
    val payload: String = "{}",              // JSON (z. B. imageId, transcript, confirm-Parameter)
    val attempts: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)
