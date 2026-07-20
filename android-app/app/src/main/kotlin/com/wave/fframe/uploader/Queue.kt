package com.wave.fframe.uploader

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Fila de vídeos para processar (proxy) e enviar depois. Cada item guarda seu projeto. */
object Queue {

    data class Item(
        val uri: String,
        val name: String,
        val projectId: String,
        val projectName: String,
        val quality: String
    )

    private fun sp(ctx: Context) = ctx.getSharedPreferences("fframe_queue", Context.MODE_PRIVATE)

    fun all(ctx: Context): List<Item> {
        val raw = sp(ctx).getString("items", "[]")!!
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                Item(o.getString("uri"), o.getString("name"), o.optString("projectId", ""),
                    o.optString("projectName", ""), o.optString("quality", Prefs.PROXY_720))
            }
        } catch (e: Exception) { emptyList() }
    }

    fun count(ctx: Context) = all(ctx).size

    fun add(ctx: Context, item: Item) {
        val list = all(ctx).toMutableList()
        if (list.none { it.uri == item.uri }) list.add(item)
        save(ctx, list)
    }

    fun remove(ctx: Context, uri: String) = save(ctx, all(ctx).filter { it.uri != uri })

    fun clear(ctx: Context) = save(ctx, emptyList())

    private fun save(ctx: Context, list: List<Item>) {
        val arr = JSONArray()
        list.forEach {
            arr.put(JSONObject().put("uri", it.uri).put("name", it.name)
                .put("projectId", it.projectId).put("projectName", it.projectName).put("quality", it.quality))
        }
        sp(ctx).edit().putString("items", arr.toString()).apply()
    }
}
