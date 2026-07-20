package com.wave.fframe.uploader

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import kotlin.concurrent.thread

/** App aberto: abas "Vídeos" (galeria nativa) e "Processamento" (fila de proxy/envio). */
class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var setupHint: LinearLayout
    private lateinit var galleryView: LinearLayout
    private lateinit var queueView: LinearLayout
    private lateinit var tabVideos: TextView
    private lateinit var tabQueue: TextView
    private lateinit var videoList: LinearLayout
    private lateinit var projectBtn: Button
    private lateinit var queueList: LinearLayout
    private lateinit var queueStatus: TextView
    private lateinit var processBtn: Button

    private var projects: List<Api.Project> = emptyList()
    private var currentAssets: List<Api.Asset> = emptyList()
    private var currentProjectId: String? = null
    private var currentProjectName: String = "Todos os vídeos"
    private var onQueueTab = false
    private var processing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)

        setupHint = findViewById(R.id.setupHint)
        galleryView = findViewById(R.id.galleryView)
        queueView = findViewById(R.id.queueView)
        tabVideos = findViewById(R.id.tabVideos)
        tabQueue = findViewById(R.id.tabQueue)
        videoList = findViewById(R.id.videoList)
        projectBtn = findViewById(R.id.projectBtn)
        queueList = findViewById(R.id.queueList)
        queueStatus = findViewById(R.id.queueStatus)
        processBtn = findViewById(R.id.processBtn)

        findViewById<TextView>(R.id.configFab).setOnClickListener { openConfig() }
        findViewById<Button>(R.id.goConfig).setOnClickListener { openConfig() }
        findViewById<TextView>(R.id.newProjectBtn).setOnClickListener { newProjectDialog() }
        projectBtn.setOnClickListener { projectDialog() }
        projectBtn.setOnLongClickListener { deleteCurrentProject(); true }
        tabVideos.setOnClickListener { showTab(false) }
        tabQueue.setOnClickListener { showTab(true) }
        processBtn.setOnClickListener { processQueue() }
        findViewById<Button>(R.id.clearQueueBtn).setOnClickListener {
            if (!processing) { Queue.clear(this); renderQueue() }
        }
    }

    override fun onResume() {
        super.onResume()
        if (!prefs.isConfigured()) { setupHint.visibility = View.VISIBLE; return }
        setupHint.visibility = View.GONE
        showTab(onQueueTab)
    }

    private fun openConfig() = startActivity(Intent(this, ConfigActivity::class.java))

    // ---- Abas ---------------------------------------------------------------
    private fun showTab(queue: Boolean) {
        onQueueTab = queue
        galleryView.visibility = if (queue) View.GONE else View.VISIBLE
        queueView.visibility = if (queue) View.VISIBLE else View.GONE
        tabVideos.background = ContextCompat.getDrawable(this, if (queue) R.drawable.btn_ghost else R.drawable.btn_primary)
        tabVideos.setTextColor(getColor(if (queue) R.color.muted else R.color.ink))
        val qn = Queue.count(this)
        tabQueue.text = if (qn > 0) "Processamento ($qn)" else "Processamento"
        tabQueue.background = ContextCompat.getDrawable(this, if (queue) R.drawable.btn_primary else R.drawable.btn_ghost)
        tabQueue.setTextColor(getColor(if (queue) R.color.ink else R.color.muted))
        if (queue) renderQueue() else reload()
    }

    // ---- Galeria ------------------------------------------------------------
    private fun reload() {
        projectBtn.text = "$currentProjectName ▾"
        if (currentAssets.isEmpty()) { videoList.removeAllViews(); videoList.addView(hintRow("Carregando…")) }
        thread {
            val assets = Api.assetsOf(prefs, currentProjectId)
            runOnUiThread { renderVideos(assets) }
        }
        if (projects.isEmpty()) thread {
            val p = Api.projects(prefs); runOnUiThread { projects = p }
        }
    }

    private fun renderVideos(assets: List<Api.Asset>) {
        currentAssets = assets
        videoList.removeAllViews()
        if (assets.isEmpty()) { videoList.addView(hintRow("Nenhum vídeo aqui ainda")); return }
        val inflater = LayoutInflater.from(this)
        for (a in assets) {
            val row = inflater.inflate(R.layout.video_row, videoList, false)
            row.findViewById<TextView>(R.id.rowName).text = a.name
            row.findViewById<TextView>(R.id.rowDate).text = a.date
            row.findViewById<TextView>(R.id.rowPlay).setOnClickListener { play(a) }
            row.setOnClickListener { play(a) }
            row.findViewById<TextView>(R.id.rowDelete).setOnClickListener { deleteVideo(a) }
            videoList.addView(row)
        }
    }

    private fun hintRow(text: String): TextView {
        val tv = TextView(this)
        tv.text = text; tv.setTextColor(getColor(R.color.muted)); tv.textSize = 14f
        tv.setPadding(8, 40, 8, 8); tv.gravity = Gravity.CENTER
        return tv
    }

    private fun play(a: Api.Asset) {
        startActivity(Intent(this, PlayerActivity::class.java)
            .putExtra("url", Api.mediaUrl(prefs, a.id)).putExtra("name", a.name))
    }

    private fun deleteVideo(a: Api.Asset) {
        AlertDialog.Builder(this).setTitle("Excluir vídeo")
            .setMessage("Excluir \"${a.name}\"? Isso apaga o arquivo do servidor.")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Excluir") { _, _ ->
                thread {
                    val ok = Api.deleteAsset(prefs, a.id)
                    runOnUiThread {
                        if (ok) { currentAssets = currentAssets.filter { it.id != a.id }; renderVideos(currentAssets); toast("Vídeo excluído") }
                        else toast("Falha ao excluir")
                    }
                }
            }.show()
    }

    private fun projectDialog() {
        val labels = mutableListOf("Todos os vídeos")
        labels.addAll(projects.map { "${it.name} (${it.videoCount})" })
        labels.add("＋ Novo projeto")
        AlertDialog.Builder(this).setTitle("Projeto")
            .setItems(labels.toTypedArray()) { _, which ->
                when (which) {
                    0 -> { currentProjectId = null; currentProjectName = "Todos os vídeos"; currentAssets = emptyList(); reload() }
                    labels.size - 1 -> newProjectDialog()
                    else -> { val p = projects[which - 1]; currentProjectId = p.id; currentProjectName = p.name; currentAssets = emptyList(); reload() }
                }
            }.show()
    }

    private fun newProjectDialog() {
        val input = EditText(this); input.hint = "Nome do projeto"
        AlertDialog.Builder(this).setTitle("Novo projeto").setView(input)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Criar") { _, _ ->
                val name = input.text.toString().trim()
                if (name.isEmpty()) return@setPositiveButton
                thread {
                    val ok = Api.createProject(prefs, name)
                    runOnUiThread { toast(if (ok) "Projeto criado" else "Falha ao criar"); projects = emptyList(); reload() }
                }
            }.show()
    }

    private fun deleteCurrentProject() {
        val id = currentProjectId ?: run { toast("Selecione um projeto específico"); return }
        AlertDialog.Builder(this).setTitle("Excluir projeto")
            .setMessage("Excluir \"$currentProjectName\"? (os vídeos no disco NÃO são apagados)")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Excluir") { _, _ ->
                thread {
                    val ok = Api.deleteProject(prefs, id)
                    runOnUiThread {
                        toast(if (ok) "Projeto excluído" else "Não foi possível")
                        currentProjectId = null; currentProjectName = "Todos os vídeos"; projects = emptyList(); currentAssets = emptyList(); reload()
                    }
                }
            }.show()
    }

    // ---- Fila / Processamento ----------------------------------------------
    private fun renderQueue() {
        val items = Queue.all(this)
        queueList.removeAllViews()
        processBtn.isEnabled = items.isNotEmpty() && !processing
        if (items.isEmpty()) {
            queueList.addView(hintRow("Fila vazia.\nVídeos adicionados (botão \"Fila\") ou que falharam ao enviar aparecem aqui."))
            return
        }
        for (item in items) queueList.addView(queueRow(item))
    }

    private fun queueRow(item: Queue.Item): LinearLayout {
        val card = LinearLayout(this)
        card.orientation = LinearLayout.HORIZONTAL; card.gravity = Gravity.CENTER_VERTICAL
        card.background = ContextCompat.getDrawable(this, R.drawable.card_bg)
        card.setPadding(28, 28, 28, 28)
        card.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = 20 }
        val info = LinearLayout(this); info.orientation = LinearLayout.VERTICAL
        info.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        val n = TextView(this); n.text = item.name; n.setTextColor(getColor(R.color.ink)); n.textSize = 14f; n.maxLines = 1
        val p = TextView(this)
        p.text = (item.projectName.ifEmpty { "Projeto padrão" }) + " • " + Prefs.proxyLabel(item.quality)
        p.setTextColor(getColor(R.color.muted)); p.textSize = 12f
        info.addView(n); info.addView(p)
        val del = TextView(this); del.text = "✕"; del.setTextColor(getColor(R.color.muted)); del.textSize = 16f
        del.setPadding(24, 8, 8, 8)
        del.setOnClickListener { if (!processing) { Queue.remove(this, item.uri); renderQueue() } }
        card.addView(info); card.addView(del)
        return card
    }

    private fun processQueue() {
        if (processing) return
        val items = Queue.all(this)
        if (items.isEmpty()) { toast("Fila vazia"); return }
        if (!prefs.isConfigured()) { toast("Configure servidor e chave"); return }
        if (!Net.canUploadNow(this, prefs)) {
            toast("Sem conexão permitida (Wi-Fi ou dados móveis desativados)"); return
        }
        processing = true; processBtn.isEnabled = false
        processNext(items, 0, 0)
    }

    private fun processNext(items: List<Queue.Item>, i: Int, success: Int) {
        if (i >= items.size) {
            processing = false
            queueStatus.text = "Concluído: $success de ${items.size} enviado(s)."
            renderQueue()
            return
        }
        val item = items[i]
        queueStatus.text = "Processando ${i + 1}/${items.size}: ${item.name} (proxy)…"
        ProxyMaker.make(this, android.net.Uri.parse(item.uri), item.quality) { proxyFile ->
            if (proxyFile == null) { queueStatus.text = "Falha no proxy de ${item.name} — pulando."; processNext(items, i + 1, success); return@make }
            queueStatus.text = "Enviando ${item.name}…"
            thread {
                val res = Uploader.uploadFile(proxyFile, item.name, prefs, item.projectId)
                runCatching { proxyFile.delete() }
                runOnUiThread {
                    if (res.ok) { Queue.remove(this, item.uri); processNext(items, i + 1, success + 1) }
                    else processNext(items, i + 1, success)
                }
            }
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
