package de.winterfeld.logistik.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [CaptureEntity::class, CaptureImageEntity::class, PendingOperationEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun captureDao(): CaptureDao
    abstract fun captureImageDao(): CaptureImageDao
    abstract fun pendingOperationDao(): PendingOperationDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext, AppDatabase::class.java, "winterfeld.db",
                ).build().also { instance = it }
            }
    }
}
