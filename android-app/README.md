# Fframe Uploader

🌐 **[Português](README.md)** · [English](README.en.md)

App Android que envia os vídeos gravados por **qualquer app de câmera** para o **seu próprio
servidor**, criando uma versão **proxy** (mais leve) no aparelho antes do envio.

> 🌐 **Idioma:** a interface do app é **só em português**. O painel web do servidor é bilíngue
> (português e inglês, com menu suspenso).

Funciona junto com o [servidor Fframe](../server) (compatível com Frame.io C2C e com este app).

## Recursos

- 🫧 **Bolha flutuante** sobre qualquer app de câmera (arraste até o **X** para fechar)
- 📷 **Pareamento por QR code** — escaneia o QR do painel e já entra configurado, sem digitar nada
- 🎞️ **Proxy no aparelho**: 720 / 1080 LQ / 1080 HQ
- 🚦 Modos: **Automático**, **Perguntar** (Ignorar / Fila / Enviar) e **Desligado**
- 🗂️ **Galeria nativa**: projetos, criar/excluir projeto, assistir e excluir vídeos
- 📥 **Fila**: adia o processamento; cada vídeo guarda o projeto de destino
- 📊 Barra de carregamento flutuante durante o envio

## Configuração no app

Ao abrir, toque em **⚙** e escolha um dos dois:

- **Parear por QR code** (recomendado) — no painel do servidor, vá em *Dispositivos → Adicionar
  dispositivo*, aponte a câmera para o QR gerado e o app preenche servidor + chave sozinho.
- **Manual** — preencha **Endereço do servidor** e **Chave de acesso** (a device key mostrada no
  painel) à mão.

Conceda as permissões **Sobrepor apps** e **Acesso aos vídeos**, e ligue a bolha.

## Compilar

Precisa de JDK 17 + Android SDK (build-tools 34, platform 34).

```bash
# assinatura (opcional): copie e preencha
cp keystore.properties.example keystore.properties

./gradlew assembleRelease     # APK assinado (se houver keystore.properties)
./gradlew assembleDebug       # APK de debug
```

O APK sai em `app/build/outputs/apk/`.

## Segurança / privacidade

Nenhum endereço de servidor ou chave fica embutido no código — tudo é configurado pelo usuário
no app. A device key vai sempre no header `X-Device-Key` (nunca na query string, para não vazar
em logs de servidor/proxy). Backup automático do Android desligado (`allowBackup=false`), para a
configuração não sair do aparelho em backups do Google/adb. A chave de assinatura
(`keystore.properties`, `*.jks`) **não** é versionada.

## Licença

MIT
