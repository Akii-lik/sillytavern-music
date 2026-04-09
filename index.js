const EXT_NAME = 'music-player';

const defaultSettings = {
    playlist: [],
    volume: 0.7,
    shuffle: false,
    currentIndex: 0,
};

let audio = new Audio();
let currentIndex = 0;
let playlist = [];
let isShuffled = false;
let shuffleOrder = [];

jQuery(document).ready(async () => {
    if (!window.extension_settings[EXT_NAME]) {
        window.extension_settings[EXT_NAME] = { ...defaultSettings };
    }

    loadSettings();
    injectUI();
    bindEvents();
    setupAudioEvents();
});

function loadSettings() {
    const s = window.extension_settings[EXT_NAME];
    playlist = s.playlist || [];
    isShuffled = s.shuffle || false;
    audio.volume = s.volume ?? 0.7;
    currentIndex = s.currentIndex || 0;
}

function saveSettings() {
    const s = window.extension_settings[EXT_NAME];
    s.playlist = playlist.map(t => t.type === 'url' ? t : { ...t, src: null });
    s.shuffle = isShuffled;
    s.volume = audio.volume;
    s.currentIndex = currentIndex;
    window.saveSettingsDebounced();
}

function injectUI() {
    const html = `
    <div id="music-player-panel">
      <div id="mp-header">
        <span>🎵 Music Player</span>
        <button id="mp-toggle">−</button>
      </div>
      <div id="mp-body">
        <div id="mp-now-playing">
          <span id="mp-track-name">未选择</span>
        </div>

        <div id="mp-controls">
          <button id="mp-prev" title="上一首">⏮</button>
          <button id="mp-play" title="播放/暂停">▶</button>
          <button id="mp-next" title="下一首">⏭</button>
          <button id="mp-shuffle" title="随机播放">🔀</button>
          <button id="mp-loop" title="循环播放">🔁</button>
        </div>

        <div id="mp-progress-wrap">
          <span id="mp-current-time">0:00</span>
          <input type="range" id="mp-progress" value="0" min="0" max="100" step="0.1">
          <span id="mp-duration">0:00</span>
        </div>

        <div id="mp-volume-wrap">
          🔊 <input type="range" id="mp-volume" min="0" max="1" step="0.01" value="0.7">
        </div>

        <div id="mp-add">
          <input type="file" id="mp-file-input" accept="audio/*" multiple style="display:none">
          <button id="mp-add-file">+ 本地文件</button>
          <div id="mp-url-wrap">
            <input type="text" id="mp-url-input" placeholder="输入音频 URL">
            <button id="mp-add-url">添加</button>
          </div>
        </div>

        <div id="mp-playlist">
          <div id="mp-playlist-header">歌单 <span id="mp-playlist-count">0</span></div>
          <ul id="mp-playlist-list"></ul>
        </div>
      </div>
    </div>`;

    $('body').append(html);
    $('#mp-volume').val(audio.volume);
    renderPlaylist();
}

function bindEvents() {
    $('#mp-toggle').on('click', () => {
        $('#mp-body').toggle();
        $('#mp-toggle').text($('#mp-body').is(':visible') ? '−' : '+');
    });

    $('#mp-play').on('click', togglePlay);
    $('#mp-prev').on('click', playPrev);
    $('#mp-next').on('click', playNext);

    $('#mp-shuffle').on('click', () => {
        isShuffled = !isShuffled;
        $('#mp-shuffle').toggleClass('active', isShuffled);
        if (isShuffled) buildShuffleOrder();
        saveSettings();
    });

    $('#mp-loop').on('click', () => {
        audio.loop = !audio.loop;
        $('#mp-loop').toggleClass('active', audio.loop);
    });

    $('#mp-volume').on('input', function () {
        audio.volume = parseFloat(this.value);
        saveSettings();
    });

    $('#mp-progress').on('input', function () {
        if (audio.duration) {
            audio.currentTime = (parseFloat(this.value) / 100) * audio.duration;
        }
    });

    $('#mp-add-file').on('click', () => $('#mp-file-input').click());

    $('#mp-file-input').on('change', function () {
        Array.from(this.files).forEach(file => {
            const src = URL.createObjectURL(file);
            addTrack({ name: file.name, src, type: 'file' });
        });
        this.value = '';
    });

    $('#mp-add-url').on('click', addFromUrl);
    $('#mp-url-input').on('keydown', e => { if (e.key === 'Enter') addFromUrl(); });
}

function addFromUrl() {
    const url = $('#mp-url-input').val().trim();
    if (!url) return;
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]) || url;
    addTrack({ name, src: url, type: 'url' });
    $('#mp-url-input').val('');
}

function setupAudioEvents() {
    audio.addEventListener('ended', () => {
        if (!audio.loop) playNext();
    });

    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        $('#mp-progress').val(pct);
        $('#mp-current-time').text(formatTime(audio.currentTime));
    });

    audio.addEventListener('loadedmetadata', () => {
        $('#mp-duration').text(formatTime(audio.duration));
    });

    audio.addEventListener('play', () => $('#mp-play').text('⏸'));
    audio.addEventListener('pause', () => $('#mp-play').text('▶'));
}

function addTrack(track) {
    playlist.push(track);
    renderPlaylist();
    saveSettings();
}

function removeTrack(index) {
    if (playlist[index]?.type === 'file' && playlist[index].src) {
        URL.revokeObjectURL(playlist[index].src);
    }
    playlist.splice(index, 1);
    if (currentIndex >= playlist.length) currentIndex = Math.max(0, playlist.length - 1);
    renderPlaylist();
    saveSettings();
}

function renderPlaylist() {
    const $list = $('#mp-playlist-list').empty();
    playlist.forEach((track, i) => {
        const $item = $(`
          <li class="mp-track ${i === currentIndex ? 'active' : ''}" data-index="${i}">
            <span class="mp-track-name" title="${track.name}">${track.name}</span>
            <button class="mp-remove" data-index="${i}">✕</button>
          </li>`);
        $list.append($item);
    });

    $('#mp-playlist-count').text(playlist.length);

    $('.mp-track').on('click', function (e) {
        if ($(e.target).hasClass('mp-remove')) return;
        playAt(parseInt($(this).data('index')));
    });

    $('.mp-remove').on('click', function (e) {
        e.stopPropagation();
        removeTrack(parseInt($(this).data('index')));
    });
}

function playAt(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    audio.src = playlist[index].src;
    audio.play();
    $('#mp-track-name').text(playlist[index].name);
    renderPlaylist();
    saveSettings();
}

function togglePlay() {
    if (!playlist.length) return;
    if (audio.paused) {
        if (!audio.src && playlist[currentIndex]) {
            playAt(currentIndex);
        } else {
            audio.play();
        }
    } else {
        audio.pause();
    }
}

function playNext() {
    if (!playlist.length) return;
    let next;
    if (isShuffled) {
        const pos = shuffleOrder.indexOf(currentIndex);
        next = shuffleOrder[(pos + 1) % shuffleOrder.length];
    } else {
        next = (currentIndex + 1) % playlist.length;
    }
    playAt(next);
}

function playPrev() {
    if (!playlist.length) return;
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    let prev;
    if (isShuffled) {
        const pos = shuffleOrder.indexOf(currentIndex);
        prev = shuffleOrder[(pos - 1 + shuffleOrder.length) % shuffleOrder.length];
    } else {
        prev = (currentIndex - 1 + playlist.length) % playlist.length;
    }
    playAt(prev);
}

function buildShuffleOrder() {
    shuffleOrder = [...Array(playlist.length).keys()];
    for (let i = shuffleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
}

function formatTime(sec) {
    if (isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}
