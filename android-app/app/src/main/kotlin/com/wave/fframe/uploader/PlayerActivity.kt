package com.wave.fframe.uploader

import android.net.Uri
import android.os.Bundle
import android.widget.MediaController
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity

/** Player nativo simples (assiste o vídeo grande, dentro do app). */
class PlayerActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)

        val url = intent.getStringExtra("url")
        val name = intent.getStringExtra("name") ?: ""
        findViewById<TextView>(R.id.playerName).text = name
        findViewById<TextView>(R.id.playerClose).setOnClickListener { finish() }

        val video = findViewById<VideoView>(R.id.video)
        if (url.isNullOrEmpty()) { Toast.makeText(this, "Vídeo inválido", Toast.LENGTH_SHORT).show(); finish(); return }

        val controller = MediaController(this)
        controller.setAnchorView(video)
        video.setMediaController(controller)
        video.setOnPreparedListener { it.start() }
        video.setOnErrorListener { _, _, _ ->
            Toast.makeText(this, "Não foi possível reproduzir", Toast.LENGTH_SHORT).show(); true
        }
        val headers = mapOf("X-Device-Key" to Prefs(this).deviceKey)
        video.setVideoURI(Uri.parse(url), headers)
    }
}
