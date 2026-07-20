package com.wave.fframe.uploader

import android.content.Context
import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import java.io.File

/**
 * Cria a versao PROXY do video no proprio aparelho (redimensiona + recomprime).
 * Qualidades: 720 / 1080 LQ / 1080 HQ.
 * IMPORTANTE: make() deve ser chamado na THREAD PRINCIPAL (o Transformer exige Looper).
 */
object ProxyMaker {

    fun make(context: Context, input: Uri, quality: String, onDone: (File?) -> Unit) {
        val (height, bitrate) = Prefs.proxySpec(quality)
        val out = File(context.cacheDir, "proxy_${System.currentTimeMillis()}.mp4")

        val encoderFactory = DefaultEncoderFactory.Builder(context)
            .setRequestedVideoEncoderSettings(
                VideoEncoderSettings.Builder().setBitrate(bitrate).build()
            ).build()

        val transformer = Transformer.Builder(context)
            .setEncoderFactory(encoderFactory)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, result: ExportResult) {
                    onDone(out)
                }
                override fun onError(composition: Composition, result: ExportResult, e: ExportException) {
                    android.util.Log.e("FframeProxy", "erro code=${e.errorCode} (${errorName(e.errorCode)}) msg=${e.message}", e)
                    runCatching { out.delete() }
                    onDone(null)
                }
            })
            .build()

        val effects = Effects(emptyList(), listOf<Effect>(Presentation.createForHeight(height)))
        val item = EditedMediaItem.Builder(MediaItem.fromUri(input)).setEffects(effects).build()

        try {
            transformer.start(item, out.absolutePath)
        } catch (e: Exception) {
            android.util.Log.e("FframeProxy", "start falhou: ${e.message}", e)
            onDone(null)
        }
    }

    private fun errorName(code: Int): String = try {
        ExportException::class.java.getMethod("getErrorCodeName", Int::class.javaPrimitiveType)
            .invoke(null, code) as? String ?: code.toString()
    } catch (e: Exception) { code.toString() }
}
