/* Teleprompter — HTML + CSS + JS puro. Tudo fica no aparelho (localStorage). */
(function () {
  'use strict';

  var CHAVE_ROTEIROS = 'teleprompter.roteiros.v1';
  var CHAVE_AJUSTES = 'teleprompter.ajustes.v1';
  var PADRAO = { velocidade: 40, fonte: 44, entrelinha: 1.4, margem: 6, espelho: false, tema: 'claro' };

  var $ = function (id) { return document.getElementById(id); };

  // ---------- armazenamento ----------

  function ler(chave, reserva) {
    try {
      var bruto = localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : reserva;
    } catch (e) {
      return reserva;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      avisar('Não foi possível salvar neste aparelho.');
      return false;
    }
  }

  var roteiros = ler(CHAVE_ROTEIROS, []);
  if (!Array.isArray(roteiros)) roteiros = [];

  var ajustes = Object.assign({}, PADRAO, ler(CHAVE_AJUSTES, {}));

  function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- aviso e diálogo ----------

  var avisoTimer = null;
  function avisar(msg) {
    var el = $('aviso');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visivel');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { el.classList.remove('visivel'); }, 2600);
  }

  // Abre o diálogo. Com `valor` mostra um campo de texto e devolve o texto;
  // sem `valor` é só confirmação e devolve true. Cancelar devolve null.
  function perguntar(titulo, opcoes) {
    opcoes = opcoes || {};
    return new Promise(function (resolver) {
      var comCampo = typeof opcoes.valor === 'string';
      $('modal-titulo').textContent = titulo;
      $('modal-campo').hidden = !comCampo;
      $('modal-campo').value = comCampo ? opcoes.valor : '';
      $('modal-sim').textContent = opcoes.botao || 'OK';
      $('modal-sim').classList.toggle('perigo', !!opcoes.perigo);
      $('modal').hidden = false;
      if (comCampo) { $('modal-campo').focus(); $('modal-campo').select(); }

      function fechar(resultado) {
        $('modal').hidden = true;
        $('modal-sim').onclick = $('modal-nao').onclick = $('modal-campo').onkeydown = null;
        resolver(resultado);
      }
      $('modal-sim').onclick = function () { fechar(comCampo ? $('modal-campo').value : true); };
      $('modal-nao').onclick = function () { fechar(null); };
      $('modal-campo').onkeydown = function (ev) { if (ev.key === 'Enter') $('modal-sim').onclick(); };
    });
  }

  // ---------- tema ----------

  function aplicarTema() {
    document.documentElement.setAttribute('data-theme', ajustes.tema);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', ajustes.tema === 'escuro' ? '#000000' : '#f6f2fb');
  }
  aplicarTema();

  Array.prototype.forEach.call(document.querySelectorAll('.btn-tema'), function (b) {
    b.addEventListener('click', function () {
      ajustes.tema = ajustes.tema === 'escuro' ? 'claro' : 'escuro';
      aplicarTema();
      gravar(CHAVE_AJUSTES, ajustes);
    });
  });

  // ---------- navegação entre telas ----------

  function mostrar(tela) {
    ['tela-lista', 'tela-editor', 'tela-prompter'].forEach(function (id) {
      $(id).hidden = id !== tela;
    });
  }

  // ---------- lista de roteiros ----------

  function botao(rotulo, classe, acao) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'botao ' + (classe || '');
    b.textContent = rotulo;
    b.addEventListener('click', acao);
    return b;
  }

  function desenharLista() {
    var ul = $('lista');
    ul.textContent = '';
    roteiros
      .slice()
      .sort(function (a, b) { return (b.atualizado || 0) - (a.atualizado || 0); })
      .forEach(function (r) {
        var li = document.createElement('li');
        li.className = 'item';
        var h = document.createElement('h2');
        h.textContent = r.titulo || 'Sem título';
        var p = document.createElement('p');
        p.textContent = r.texto ? r.texto.slice(0, 160) : 'Roteiro vazio';
        var acoes = document.createElement('div');
        acoes.className = 'acoes';
        acoes.appendChild(botao('Ler', 'primario', function () { abrirPrompter(r.id); }));
        acoes.appendChild(botao('Editar', '', function () { abrirEditor(r.id); }));
        acoes.appendChild(botao('Renomear', '', function () { renomear(r.id); }));
        acoes.appendChild(botao('Apagar', 'perigo', function () { apagar(r.id); }));
        li.appendChild(h); li.appendChild(p); li.appendChild(acoes);
        ul.appendChild(li);
      });
    $('vazio').hidden = roteiros.length > 0;
  }

  function achar(id) {
    for (var i = 0; i < roteiros.length; i++) if (roteiros[i].id === id) return roteiros[i];
    return null;
  }

  function renomear(id) {
    var r = achar(id);
    if (!r) return;
    perguntar('Renomear roteiro', { valor: r.titulo || '', botao: 'Salvar' }).then(function (nome) {
      if (nome === null) return;
      r.titulo = nome.trim() || 'Sem título';
      r.atualizado = Date.now();
      gravar(CHAVE_ROTEIROS, roteiros);
      desenharLista();
    });
  }

  function apagar(id) {
    var r = achar(id);
    if (!r) return;
    perguntar('Apagar “' + (r.titulo || 'Sem título') + '”? Não dá para desfazer.', { botao: 'Apagar', perigo: true })
      .then(function (ok) {
        if (!ok) return;
        roteiros = roteiros.filter(function (x) { return x.id !== id; });
        gravar(CHAVE_ROTEIROS, roteiros);
        desenharLista();
      });
  }

  // ---------- editor ----------

  var editando = null; // id do roteiro em edição, ou null para um novo

  function abrirEditor(id) {
    var r = id ? achar(id) : null;
    editando = r ? r.id : null;
    $('ed-titulo').value = r ? (r.titulo || '') : '';
    $('ed-texto').value = r ? (r.texto || '') : '';
    mostrar('tela-editor');
    window.scrollTo(0, 0);
  }

  function salvarEditor() {
    var titulo = $('ed-titulo').value.trim();
    var texto = $('ed-texto').value;
    if (!titulo && !texto.trim()) { avisar('Escreva ou cole um texto antes de salvar.'); return; }
    if (!titulo) titulo = texto.trim().split('\n')[0].slice(0, 40) || 'Sem título';

    var r = editando ? achar(editando) : null;
    if (r) {
      r.titulo = titulo; r.texto = texto; r.atualizado = Date.now();
    } else {
      roteiros.push({ id: novoId(), titulo: titulo, texto: texto, atualizado: Date.now() });
    }
    if (gravar(CHAVE_ROTEIROS, roteiros)) avisar('Roteiro salvo.');
    desenharLista();
    mostrar('tela-lista');
  }

  $('btn-novo').addEventListener('click', function () { abrirEditor(null); });
  $('btn-salvar').addEventListener('click', salvarEditor);
  $('btn-cancelar').addEventListener('click', function () { mostrar('tela-lista'); });

  // ---------- exportar / importar ----------

  function exportar() {
    if (!roteiros.length) { avisar('Não há roteiros para exportar.'); return; }
    var nome = 'teleprompter-roteiros-' + new Date().toISOString().slice(0, 10) + '.json';
    var json = JSON.stringify({ app: 'teleprompter', versao: 1, exportadoEm: new Date().toISOString(), roteiros: roteiros }, null, 2);

    // No iPhone, o download por link falha em alguns casos (app instalado na Tela de Início).
    // Onde der, usa a folha de compartilhamento do sistema ("Salvar em Arquivos").
    var toque = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    try {
      if (toque && navigator.canShare && typeof File === 'function') {
        var arquivo = new File([json], nome, { type: 'application/json' });
        if (navigator.canShare({ files: [arquivo] })) {
          navigator.share({ files: [arquivo] }).catch(function (e) {
            if (!e || e.name !== 'AbortError') baixar(json, nome);
          });
          return;
        }
      }
    } catch (e) { /* cai no download */ }
    baixar(json, nome);
  }

  function baixar(json, nome) {
    try {
      var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      avisar('Não foi possível exportar neste navegador.');
    }
  }

  function importar(textoJson) {
    var dados;
    try { dados = JSON.parse(textoJson); } catch (e) { avisar('Arquivo inválido: não é um JSON.'); return; }
    var lista = Array.isArray(dados) ? dados : (dados && Array.isArray(dados.roteiros) ? dados.roteiros : null);
    if (!lista) { avisar('Arquivo inválido: não encontrei roteiros.'); return; }

    var novos = 0, repetidos = 0;
    lista.forEach(function (item) {
      if (!item || typeof item.texto !== 'string') return;
      var titulo = typeof item.titulo === 'string' && item.titulo.trim() ? item.titulo.trim() : 'Sem título';
      var igual = roteiros.some(function (r) { return r.titulo === titulo && r.texto === item.texto; });
      if (igual) { repetidos++; return; }
      // Nunca sobrescreve: se o id já existe com conteúdo diferente, entra como cópia.
      var id = typeof item.id === 'string' && !achar(item.id) ? item.id : novoId();
      roteiros.push({ id: id, titulo: titulo, texto: item.texto, atualizado: Number(item.atualizado) || Date.now() });
      novos++;
    });
    if (novos) gravar(CHAVE_ROTEIROS, roteiros);
    desenharLista();
    avisar(novos + ' importado(s)' + (repetidos ? ', ' + repetidos + ' já existia(m)' : '') + '.');
  }

  $('btn-exportar').addEventListener('click', exportar);
  $('btn-importar').addEventListener('click', function () { $('arquivo').click(); });
  $('arquivo').addEventListener('change', function () {
    var arq = this.files && this.files[0];
    if (!arq) return;
    var leitor = new FileReader();
    leitor.onload = function () { importar(String(leitor.result)); };
    leitor.onerror = function () { avisar('Não foi possível ler o arquivo.'); };
    leitor.readAsText(arq);
    this.value = '';
  });

  // ---------- teleprompter ----------

  var prompter = $('tela-prompter');
  var elTexto = $('texto');
  var y = 0;            // deslocamento atual em px
  var yMax = 0;         // deslocamento em que a última linha chega à linha-guia
  var tocando = false;
  var quadro = null;    // id do requestAnimationFrame
  var ultimo = 0;       // timestamp do quadro anterior
  var contagemTimer = null;

  function aplicarAjustes() {
    var raiz = document.documentElement.style;
    raiz.setProperty('--fonte', ajustes.fonte + 'px');
    raiz.setProperty('--entrelinha', String(ajustes.entrelinha));
    raiz.setProperty('--margem', ajustes.margem + '%');
    $('espelho').classList.toggle('invertido', !!ajustes.espelho);
    $('btn-espelho').setAttribute('aria-pressed', ajustes.espelho ? 'true' : 'false');

    $('r-velocidade').value = ajustes.velocidade;
    $('r-fonte').value = ajustes.fonte;
    $('r-entrelinha').value = ajustes.entrelinha;
    $('r-margem').value = ajustes.margem;
    $('v-velocidade').textContent = ajustes.velocidade + ' px/s';
    $('v-fonte').textContent = ajustes.fonte + ' px';
    $('v-entrelinha').textContent = Number(ajustes.entrelinha).toFixed(2);
    $('v-margem').textContent = ajustes.margem + '%';
  }

  function posicionar() {
    elTexto.style.transform = 'translate3d(0,' + (-y) + 'px,0)';
  }

  // Recalcula o fim do texto. Mantém a posição relativa quando o layout muda
  // (fonte, entrelinha, margem ou rotação do aparelho).
  function medir(manterProporcao) {
    var proporcao = yMax > 0 ? y / yMax : 0;
    var linha = ajustes.fonte * ajustes.entrelinha;
    yMax = Math.max(0, elTexto.offsetHeight - linha);
    if (manterProporcao) y = proporcao * yMax;
    if (y > yMax) y = yMax;
    posicionar();
  }

  function passo(agora) {
    if (!tocando) return;
    var dt = Math.min((agora - ultimo) / 1000, 0.1); // limita saltos se o quadro atrasar
    ultimo = agora;
    y += ajustes.velocidade * dt;
    if (y >= yMax) {
      y = yMax;
      posicionar();
      pausar();
      avisar('Fim do roteiro.');
      return;
    }
    posicionar();
    quadro = requestAnimationFrame(passo);
  }

  function rolar() {
    tocando = true;
    prompter.classList.add('lendo');
    $('btn-play').textContent = 'Pausar';
    ultimo = performance.now();
    quadro = requestAnimationFrame(passo);
  }

  function cancelarContagem() {
    clearTimeout(contagemTimer);
    contagemTimer = null;
    $('contagem').hidden = true;
  }

  function contar(n) {
    if (n === 0) { cancelarContagem(); rolar(); return; }
    $('contagem').textContent = String(n);
    $('contagem').hidden = false;
    contagemTimer = setTimeout(function () { contar(n - 1); }, 1000);
  }

  function tocar() {
    if (tocando || contagemTimer) return;
    if (yMax <= 0) { avisar('Este roteiro cabe em uma linha: não há o que rolar.'); return; }
    if (y >= yMax) { avisar('Fim do roteiro. Toque em Início para recomeçar.'); return; }
    if (y === 0) {
      // Contagem 3-2-1 só ao começar do início; retomar de uma pausa é imediato.
      prompter.classList.add('lendo');
      contar(3);
    } else {
      rolar();
    }
  }

  function pausar() {
    cancelarContagem();
    tocando = false;
    if (quadro) cancelAnimationFrame(quadro);
    quadro = null;
    prompter.classList.remove('lendo');
    $('btn-play').textContent = 'Ler';
  }

  function alternar() {
    if (tocando || contagemTimer) pausar(); else tocar();
  }

  function abrirPrompter(id) {
    var r = achar(id);
    if (!r) return;
    if (!r.texto || !r.texto.trim()) { avisar('Este roteiro está vazio.'); return; }
    elTexto.textContent = r.texto;
    aplicarAjustes();
    mostrar('tela-prompter');
    y = 0; yMax = 0;
    medir(false);
    pausar();
    travarTela();
  }

  function sairPrompter() {
    if (gravando) { avisar('Pare a gravação antes de sair.'); return; }
    pausar();
    desligarCamera();
    soltarTela();
    mostrar('tela-lista');
  }

  // Toque em qualquer ponto fora dos controles alterna ler/pausar.
  prompter.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('.controles, #rec-flutuante, #resultado')) return;
    alternar();
  });

  $('btn-play').addEventListener('click', alternar);
  $('btn-sair').addEventListener('click', sairPrompter);
  $('btn-inicio').addEventListener('click', function () { pausar(); y = 0; posicionar(); });
  $('btn-espelho').addEventListener('click', function () {
    ajustes.espelho = !ajustes.espelho;
    aplicarAjustes();
    gravar(CHAVE_AJUSTES, ajustes);
  });

  function ligarSlider(id, campo, mudaLayout) {
    $(id).addEventListener('input', function () {
      ajustes[campo] = Number(this.value);
      aplicarAjustes();
      if (mudaLayout) medir(true);
    });
    $(id).addEventListener('change', function () { gravar(CHAVE_AJUSTES, ajustes); });
  }
  ligarSlider('r-velocidade', 'velocidade', false);
  ligarSlider('r-fonte', 'fonte', true);
  ligarSlider('r-entrelinha', 'entrelinha', true);
  ligarSlider('r-margem', 'margem', true);

  window.addEventListener('resize', function () {
    if (!prompter.hidden) medir(true);
  });

  // ---------- câmera e gravação ----------
  // A câmera frontal fica atrás do texto. O vídeo gravado leva imagem e áudio,
  // sem o texto do roteiro. Tudo acontece no aparelho; nada é enviado a servidor.

  var elCamera = $('camera');
  var fluxo = null;         // MediaStream
  var gravador = null;      // MediaRecorder
  var pedacos = [];
  var gravando = false;
  var inicioGravacao = 0;
  var tempoTimer = null;
  var resultado = null;     // { blob, url, nome, salvo }

  function temGravador() { return typeof window.MediaRecorder === 'function'; }

  function erroCamera(e) {
    var nome = e && e.name;
    if (nome === 'NotAllowedError' || nome === 'SecurityError') {
      avisar('Câmera ou microfone negados. Libere nos Ajustes do iPhone, em Safari.');
    } else if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
      avisar('Não encontrei a câmera ou o microfone.');
    } else if (e && e.message === 'sem-camera') {
      avisar('Este navegador não dá acesso à câmera.');
    } else {
      avisar('Não consegui abrir a câmera.');
    }
  }

  function ligarCamera() {
    if (fluxo) return Promise.resolve(fluxo);
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      return Promise.reject(new Error('sem-camera'));
    }
    var retrato = window.innerHeight > window.innerWidth;
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: retrato ? 1080 : 1920 },
        height: { ideal: retrato ? 1920 : 1080 }
      },
      audio: { echoCancellation: true, noiseSuppression: true }
    }).then(function (s) {
      fluxo = s;
      s.getTracks().forEach(function (t) {
        t.addEventListener('ended', function () { if (gravando) pararGravacao(); });
      });
      elCamera.srcObject = s;
      elCamera.hidden = false;
      var p = elCamera.play();
      if (p && p.catch) p.catch(function () { /* a prévia é só visual */ });
      prompter.classList.add('com-camera');
      $('btn-camera').setAttribute('aria-pressed', 'true');
      return s;
    });
  }

  function desligarCamera() {
    if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); });
    fluxo = null;
    elCamera.srcObject = null;
    elCamera.hidden = true;
    prompter.classList.remove('com-camera');
    $('btn-camera').setAttribute('aria-pressed', 'false');
  }

  function escolherTipo() {
    var tipos = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < tipos.length; i++) {
      try { if (MediaRecorder.isTypeSupported(tipos[i])) return tipos[i]; } catch (e) { /* tenta o próximo */ }
    }
    return '';
  }

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function atualizarTempo() {
    var s = Math.floor((Date.now() - inicioGravacao) / 1000);
    $('rec-tempo').textContent = doisDigitos(Math.floor(s / 60)) + ':' + doisDigitos(s % 60);
  }

  function marcarGravacao(ligada) {
    $('rec-flutuante').hidden = !ligada;
    $('btn-gravar').classList.toggle('ativo', ligada);
    $('btn-gravar').textContent = ligada ? '■ Parar' : '● Gravar';
  }

  function iniciarGravacao() {
    if (gravando) return;
    if (!temGravador()) {
      avisar('Gravar pelo navegador precisa do iOS 14.3 ou mais novo.');
      return;
    }
    ligarCamera().then(function (s) {
      var tipo = escolherTipo();
      var opcoes = { videoBitsPerSecond: 8000000 };
      if (tipo) opcoes.mimeType = tipo;
      try {
        gravador = new MediaRecorder(s, opcoes);
      } catch (e) {
        try { gravador = new MediaRecorder(s); } catch (e2) { gravador = null; }
      }
      if (!gravador) { avisar('Não consegui iniciar a gravação.'); return; }

      pedacos = [];
      gravador.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
      gravador.onerror = function () { avisar('A gravação foi interrompida.'); };
      gravador.onstop = finalizarGravacao;
      gravador.start(1000);
      gravando = true;
      inicioGravacao = Date.now();
      atualizarTempo();
      clearInterval(tempoTimer);
      tempoTimer = setInterval(atualizarTempo, 500);
      marcarGravacao(true);
      tocar(); // contagem 3-2-1 e rolagem; a gravação já está rodando
    }).catch(erroCamera);
  }

  function pararGravacao() {
    if (!gravando) return;
    pausar();
    gravando = false;
    clearInterval(tempoTimer);
    marcarGravacao(false);
    try {
      if (gravador && gravador.state !== 'inactive') gravador.stop(); else finalizarGravacao();
    } catch (e) { finalizarGravacao(); }
  }

  function finalizarGravacao() {
    var tipo = (gravador && gravador.mimeType) || escolherTipo() || 'video/mp4';
    var base = tipo.split(';')[0];
    var blob = new Blob(pedacos, { type: base });
    pedacos = [];
    gravador = null;
    if (!blob.size) { avisar('A gravação saiu vazia. Tente de novo.'); return; }

    var d = new Date();
    var carimbo = d.getFullYear() + doisDigitos(d.getMonth() + 1) + doisDigitos(d.getDate()) + '-' +
      doisDigitos(d.getHours()) + doisDigitos(d.getMinutes()) + doisDigitos(d.getSeconds());
    var ext = base.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
    resultado = { blob: blob, url: URL.createObjectURL(blob), nome: 'teleprompter-' + carimbo + '.' + ext, salvo: false };

    $('res-video').src = resultado.url;
    var mb = (blob.size / 1048576).toFixed(1).replace('.', ',');
    $('res-info').textContent = mb + ' MB · ' + ext.toUpperCase() +
      (ext === 'webm' ? ' (este formato pode não abrir no app Fotos)' : '') +
      '. Toque em Salvar e escolha “Salvar vídeo” para ir ao Rolo da câmera.';
    $('resultado').hidden = false;
  }

  function salvarResultado() {
    if (!resultado) return;
    var r = resultado;
    var arquivo;
    try { arquivo = new File([r.blob], r.nome, { type: r.blob.type }); } catch (e) { arquivo = null; }
    if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      navigator.share({ files: [arquivo] }).then(function () { r.salvo = true; }).catch(function (e) {
        if (!e || e.name !== 'AbortError') baixarVideo(r);
      });
    } else {
      baixarVideo(r);
    }
  }

  function baixarVideo(r) {
    try {
      var a = document.createElement('a');
      a.href = r.url; a.download = r.nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      r.salvo = true;
    } catch (e) {
      avisar('Não foi possível salvar o vídeo neste navegador.');
    }
  }

  function descartarResultado() {
    if (resultado) URL.revokeObjectURL(resultado.url);
    resultado = null;
    $('res-video').removeAttribute('src');
    $('res-video').load();
    $('resultado').hidden = true;
  }

  function fecharResultado() {
    if (resultado && !resultado.salvo) {
      perguntar('Fechar sem salvar? A gravação será perdida.', { botao: 'Fechar sem salvar', perigo: true })
        .then(function (ok) { if (ok) descartarResultado(); });
    } else {
      descartarResultado();
    }
  }

  $('btn-camera').addEventListener('click', function () {
    if (gravando) { avisar('Pare a gravação antes de desligar a câmera.'); return; }
    if (fluxo) desligarCamera(); else ligarCamera().catch(erroCamera);
  });
  $('btn-gravar').addEventListener('click', function () {
    if (gravando) pararGravacao(); else iniciarGravacao();
  });
  $('rec-flutuante').addEventListener('click', pararGravacao);
  $('res-salvar').addEventListener('click', salvarResultado);
  $('res-fechar').addEventListener('click', fecharResultado);

  // ---------- manter a tela ligada (Screen Wake Lock) ----------
  // Se a API não existir ou o sistema negar, segue sem travar e sem erro.

  var trava = null;

  function travarTela() {
    try {
      if (!('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(function (t) {
        trava = t;
        t.addEventListener('release', function () { if (trava === t) trava = null; });
        if (prompter.hidden) soltarTela();
      }).catch(function () { trava = null; });
    } catch (e) { trava = null; }
  }

  function soltarTela() {
    try { if (trava) trava.release(); } catch (e) { /* silencioso */ }
    trava = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (gravando) pararGravacao();
      if (tocando || contagemTimer) pausar();
    } else if (!prompter.hidden && !trava) {
      travarTela(); // o sistema solta a trava quando o app vai para o fundo
    }
  });

  // ---------- início ----------

  aplicarAjustes();
  desenharLista();
  mostrar('tela-lista');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sem offline, o resto funciona */ });
    });
  }
})();
