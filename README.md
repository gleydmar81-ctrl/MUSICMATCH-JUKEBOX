# 🎵 MusicMatch Jukebox Web & Tablet Edition

Uma recriação fiel, versátil e moderna do clássico **MusicMatch Jukebox** dos anos 90/2000 para rodar diretamente no navegador (PC e Tablets)!

![Capa](assets/default-cover.svg)

## ✨ Principais Funcionalidades

- **Biblioteca Persistente (Lembra a sua Pasta de Músicas):**
  - O aplicativo grava a pasta das suas músicas no `config.json` e recarrega tudo automaticamente toda vez que você abrir no PC ou no Tablet.
  - Varredura rápida com leitor de ID3 nativo em todas as subpastas (recursivo, sem limite artificial de faixas), incluindo caminhos longos do Windows, exibindo as músicas agrupadas por pasta.
  - Pastas recolhíveis com estado lembrado neste navegador.
  - Montagem, reordenação e salvamento de playlists personalizadas em `config.json`, compartilhadas entre PC e Tablet.
  - Suporte a pastas locais e **pastas de rede Windows (SMB/CIFS)**.

- **Edição Direta no Disco (Zero Duplicatas):**
  - O botão **"💾 Salvar no Arquivo"** sobrescreve o arquivo original no mesmo lugar onde ele está no computador ou na rede.
  - Gravação dupla de tags: **ID3v2.3 (UTF-16 com BOM)** e **ID3v1.1 (128 bytes)**.
  - Suporte completo a Capas de Álbum (*Cover Art*).

- **Player Completo estilo MusicMatch:**
  - Painel LCD com display digital retro, título deslizante (*marquee ticker*), medidor de bitrate e tempo (decorrido/restante).
  - Controles clássicos: Play, Pause, Stop, Anterior, Próxima, Shuffle e Repeat.
  - Controle de Balanço Estéreo (Esq / Dir) e Volume mestre.

- **Visualizador de Espectro em Tempo Real (Web Audio API):**
  - Barrinhas de LED com gradiente verde/amarelo/vermelho e picos flutuantes (*peak hold*).
  - 3 modos de visualização: **Bars** (espectro), **Wave** (osciloscópio) e **VU** (medidores analógicos estéreo).

- **Equalizador Gráfico de 10 Bandas & Preamp:**
  - Frequências de 31Hz a 16kHz (+12dB / -12dB).
  - Presets: Flat, Rock, Pop, Jazz, Bass Boost, Vocal e Techno.

---

## 📱 Como Acessar no Tablet

1. Certifique-se de que o tablet e o PC estejam na mesma rede Wi-Fi.
2. No navegador do Tablet, acesse:
   👉 **`http://IP_DO_PC:8081`** (substitua pelo IPv4 atual do PC)
3. Todas as músicas da biblioteca aparecerão automaticamente! Você pode tocar, gerenciar playlists e editar tags direto da tela de toque do tablet.

## 📲 Aplicativo Android (APK)

O APK abre o Jukebox em uma janela própria, sem a interface do navegador. Ele se conecta ao servidor Python que continua rodando no PC; as músicas não são copiadas para o tablet.
Como a interface é carregada do servidor, mudanças visuais aparecem ao recarregar o app, sem reinstalar o APK.

1. Inicie o servidor no PC com `iniciar.bat`.
2. No Windows, execute `ipconfig` e anote o endereço IPv4 do PC conectado à mesma rede Wi-Fi do tablet.
3. Instale `android-app/app/build/outputs/apk/debug/app-debug.apk` no tablet.
4. Na primeira abertura, informe `http://IP_DO_PC:8081` (por exemplo, `http://192.168.1.50:8081`). O endereço fica salvo no aplicativo e pode ser alterado pelo botão **Servidor**.
5. Se o Android não conectar, permita o acesso do Python na rede privada do Firewall do Windows.

Para gerar o APK de depuração, abra a pasta `android-app` no Android Studio com JDK 17 e SDK Android 35, ou execute `gradlew.bat assembleDebug` nessa pasta.

---

## 🖥️ Conectando Músicas de um PC com Windows na Rede

Para que o Jukebox acesse as músicas que estão em um computador Windows:

1. No Windows, compartilhe a pasta de músicas (botão direito na pasta -> *Propriedades* -> *Compartilhamento*).
2. No Linux, monte a pasta da rede:
   ```bash
   sudo mkdir -p /mnt/windows_musicas
   sudo mount -t cifs //IP_DO_WINDOWS/Musicas /mnt/windows_musicas -o username=SEU_USUARIO,uid=$(id -u),gid=$(id -g)
   ```
3. No Jukebox (no PC ou no Tablet), clique no botão **"⚙️ Alterar Pasta"** na barra da biblioteca e digite:
   `/mnt/windows_musicas`
4. Clique em **"💾 Salvar e Carregar Biblioteca"**. Pronto! O Jukebox gravará esse caminho e carregará sempre que abrir.

---

## 🪟 Rodando o Jukebox diretamente no Windows

Se você quiser levar o projeto para rodar no Windows:

1. Instale o Python ([python.org](https://www.python.org/)) marcando a opção **"Add Python to PATH"**.
2. Copie a pasta `musicmatch-jukebox` para o seu computador Windows.
3. Configure a pasta de músicas:
   - Abra o aplicativo e use **"⚙️ Alterar Pasta"** para escolher a pasta existente no computador onde o servidor está rodando.
   - Se preferir editar `config.json` diretamente, escape as barras invertidas (`C:\\Users\\SeuNome\\Music`) ou use barras normais (`C:/Users/SeuNome/Music`).
   - O `config.json` é criado automaticamente e não é versionado no Git, pois contém o caminho local da biblioteca e suas playlists.
4. Arquivos de inicialização inclusos:
   - **`iniciar.bat`**: Inicia o servidor em segundo plano (silencioso, sem janela preta) e abre a página no navegador com 2 cliques.
   - **`parar.bat`**: Encerra o servidor na porta 8081.
   - **`iniciar_com_janela.bat`**: Inicia mostrando a janela do terminal com logs detalhados de streaming e gravação.
5. Para iniciar automaticamente ao ligar o Windows:
   - Pressione `Win + R`, digite `shell:startup` e crie um atalho para o `iniciar.bat` lá dentro.

