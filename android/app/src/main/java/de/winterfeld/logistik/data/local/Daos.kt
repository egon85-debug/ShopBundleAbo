package de.winterfeld.logistik.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface CaptureDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(capture: CaptureEntity)

    @Query("SELECT * FROM captures WHERE id = :id")
    suspend fun byId(id: String): CaptureEntity?

    @Query("SELECT * FROM captures ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<CaptureEntity>>

    @Query("UPDATE captures SET serverProductId = :serverId, internalSku = :sku, status = :status WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String, sku: String?, status: String)

    @Query("UPDATE captures SET status = :status WHERE id = :id")
    suspend fun setStatus(id: String, status: String)

    @Query("UPDATE captures SET transcript = :transcript WHERE id = :id")
    suspend fun setTranscript(id: String, transcript: String)

    @Query("DELETE FROM captures WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface CaptureImageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(image: CaptureImageEntity)

    @Query("SELECT * FROM capture_images WHERE captureId = :captureId ORDER BY createdAt")
    suspend fun forCapture(captureId: String): List<CaptureImageEntity>

    @Query("SELECT * FROM capture_images WHERE id = :id")
    suspend fun byId(id: String): CaptureImageEntity?

    @Query("UPDATE capture_images SET uploaded = 1 WHERE id = :id")
    suspend fun markUploaded(id: String)

    @Query("DELETE FROM capture_images WHERE captureId = :captureId")
    suspend fun deleteForCapture(captureId: String)
}

@Dao
interface PendingOperationDao {
    @Insert
    suspend fun enqueue(op: PendingOperationEntity): Long

    @Query("SELECT * FROM pending_operations ORDER BY seq LIMIT 1")
    suspend fun next(): PendingOperationEntity?

    @Query("SELECT COUNT(DISTINCT captureId) FROM pending_operations")
    fun observePendingCaptureCount(): Flow<Int>

    @Query("SELECT * FROM pending_operations ORDER BY seq")
    fun observeAll(): Flow<List<PendingOperationEntity>>

    @Update
    suspend fun update(op: PendingOperationEntity)

    @Query("DELETE FROM pending_operations WHERE seq = :seq")
    suspend fun delete(seq: Long)
}
