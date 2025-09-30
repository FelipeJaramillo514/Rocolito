// Evo Player - Frontend JavaScript
class EvoPlayer {
    constructor() {
        this.ws = null;
        this.currentState = {
            playlist: [],
            currentSongIndex: -1,
            isPlaying: false,
            isPaused: false,
            volume: 0.7,
            progress: 0,
            current_time: "00:00",
            total_time: "00:00"
        };
        
        this.shuffleMode = false;
        this.repeatMode = false;
        this.baseURL = 'http://localhost:8000';
        this.init();
    }

    async init() {
        this.connectWebSocket();
        this.setupEventListeners();
        await this.loadInitialState();
        console.log('🎵 Evo Player inicializado');
    }

    connectWebSocket() {
        try {
            this.ws = new WebSocket(`ws://localhost:8000/ws`);
            
            this.ws.onopen = () => {
                console.log('🔌 Conectado al servidor WebSocket');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('🔌 Conexión WebSocket cerrada - Reconectando...');
                setTimeout(() => this.connectWebSocket(), 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Error conectando WebSocket:', error);
        }
    }

    handleWebSocketMessage(data) {
        console.log('📨 Mensaje WebSocket:', data.type);
        
        switch (data.type) {
            case 'initial_state':
                this.updatePlayerState(data.state);
                break;
            case 'player_state_changed':
                this.updatePlayerState(data.state);
                break;
            case 'playlist_updated':
                this.currentState.playlist = data.playlist;
                this.renderPlaylist();
                this.updateStats();
                break;
            case 'volume_changed':
                this.currentState.volume = data.volume;
                this.updateVolumeDisplay();
                break;
            case 'progress_update':
                this.currentState.progress = data.progress;
                this.currentState.current_time = data.current_time;
                this.currentState.total_time = data.total_time;
                this.updateProgress();
                break;
            case 'ping':
                break;
        }
    }

    async loadInitialState() {
        try {
            console.log('🔄 Cargando estado inicial...');
            const response = await fetch(`${this.baseURL}/api/player-state`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const state = await response.json();
            console.log('✅ Estado cargado:', state);
            this.updatePlayerState(state);
        } catch (error) {
            console.error('❌ Error cargando estado inicial:', error);
        }
    }

    updatePlayerState(newState) {
        console.log('🔄 Actualizando estado del reproductor:', newState);
        this.currentState = { ...this.currentState, ...newState };
        this.updateUI();
    }

    updateUI() {
        this.updatePlayerDisplay();
        this.updatePlayButton();
        this.renderPlaylist();
        this.updateStats();
        this.updateProgress();
        this.updatePlayerVisibility();
        this.updateVolumeDisplay();
    }

    updatePlayerVisibility() {
        const playerContainer = document.getElementById('player-container');
        const progressContainer = document.getElementById('progress-container');
        const volumeContainer = document.getElementById('volume-container');
        
        const hasSongs = this.currentState.playlist && this.currentState.playlist.length > 0;
        const hasCurrentSong = this.currentState.currentSongIndex >= 0;

        console.log('👀 Actualizando visibilidad - Canciones:', hasSongs, 'Canción actual:', hasCurrentSong);

        if (hasSongs && hasCurrentSong) {
            playerContainer.classList.remove('hidden');
            progressContainer.classList.remove('hidden');
            volumeContainer.classList.remove('hidden');
            console.log('✅ Mostrando todos los controles');
        } else {
            playerContainer.classList.add('hidden');
            progressContainer.classList.add('hidden');
            volumeContainer.classList.add('hidden');
            console.log('❌ Ocultando todos los controles');
        }
    }

    updateVolumeDisplay() {
        const volumeControl = document.getElementById('volume-control');
        if (volumeControl) {
            const volumePercentage = this.currentState.volume * 100;
            volumeControl.value = volumePercentage;
            volumeControl.style.setProperty('--volume', `${volumePercentage}%`);
            console.log('🔊 Volumen actualizado:', volumePercentage + '%');
        }
    }

    updatePlayerDisplay() {
        const currentSong = this.currentState.playlist[this.currentState.currentSongIndex];
        const currentSongName = document.getElementById('current-song-name');
        const previewTitle = document.getElementById('preview-title');
        const currentPreview = document.getElementById('current-preview');

        console.log('🎵 Actualizando display - Canción actual:', currentSong);

        if (currentSong) {
            if (currentSongName) {
                currentSongName.textContent = currentSong.name;
                console.log('✅ Nombre actualizado en reproductor:', currentSong.name);
            }
            
            if (previewTitle) {
                previewTitle.textContent = currentSong.name;
                console.log('✅ Nombre actualizado en sidebar:', currentSong.name);
            }
            
            if (currentPreview) currentPreview.classList.remove('hidden');
            
            const previewTime = document.getElementById('preview-time');
            if (previewTime) {
                previewTime.textContent = `${this.currentState.current_time} / ${currentSong.duration_formatted}`;
            }
        } else {
            if (currentSongName) currentSongName.textContent = 'Selecciona una canción';
            if (previewTitle) previewTitle.textContent = 'Ninguna canción';
            if (currentPreview) currentPreview.classList.add('hidden');
        }
    }

    updatePlayButton() {
        const playBtn = document.getElementById('play-btn');
        if (!playBtn) return;
        
        const playIcon = playBtn.querySelector('i');
        if (!playIcon) return;

        console.log('🔄 Actualizando botón play - Estado:', this.currentState.isPlaying);

        if (this.currentState.isPlaying) {
            playIcon.className = 'fas fa-pause text-white text-xl';
            playBtn.title = 'Pausar';
        } else {
            playIcon.className = 'fas fa-play text-white text-xl';
            playBtn.title = 'Reproducir';
        }
    }

    updateProgress() {
        const progressBar = document.getElementById('progress-bar');
        const currentTime = document.getElementById('current-time');
        const totalTime = document.getElementById('total-time');

        if (progressBar && this.currentState.playlist.length > 0 && this.currentState.currentSongIndex >= 0) {
            const currentSong = this.currentState.playlist[this.currentState.currentSongIndex];
            const progressPercentage = currentSong.duration > 0 ? 
                (this.currentState.progress / currentSong.duration) * 100 : 0;
            
            progressBar.value = progressPercentage;
            progressBar.style.setProperty('--progress', `${progressPercentage}%`);
        }
        
        if (currentTime) {
            currentTime.textContent = this.currentState.current_time || '00:00';
        }
        if (totalTime) {
            const currentSong = this.currentState.playlist[this.currentState.currentSongIndex];
            totalTime.textContent = currentSong?.duration_formatted || '00:00';
        }
    }

    updateStats() {
        const totalSongs = this.currentState.playlist.length;
        const totalDuration = this.currentState.playlist.reduce((sum, song) => sum + (song.duration || 0), 0);
        
        document.getElementById('stats-songs').textContent = totalSongs;
        document.getElementById('stats-duration').textContent = this.formatTime(totalDuration);
    }

    renderPlaylist() {
        const songsContainer = document.getElementById('songs-container');
        const emptyState = document.getElementById('empty-state');
        const songsList = document.getElementById('songs-list');

        if (!this.currentState.playlist || this.currentState.playlist.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            if (songsList) songsList.classList.add('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        if (songsList) songsList.classList.remove('hidden');

        if (songsContainer) {
            songsContainer.innerHTML = '';

            this.currentState.playlist.forEach((song, index) => {
                const isCurrent = index === this.currentState.currentSongIndex;
                const isPlaying = isCurrent && this.currentState.isPlaying;

                const songElement = document.createElement('div');
                songElement.className = `grid grid-cols-12 gap-4 px-6 py-4 rounded-xl song-item cursor-pointer transition-all ${
                    isCurrent ? 'bg-blue-500 bg-opacity-20 border border-blue-500' : 'bg-gray-800 hover:bg-gray-700'
                }`;
                songElement.onclick = () => this.selectAndPlaySong(index);

                songElement.innerHTML = `
                    <div class="col-span-1 flex items-center justify-center">
                        ${isPlaying ? 
                            '<i class="fas fa-play text-green-500 animate-pulse"></i>' : 
                            `<span class="text-gray-400 ${isCurrent ? 'font-semibold text-blue-500' : ''}">${index + 1}</span>`
                        }
                    </div>
                    <div class="col-span-8 flex items-center">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                                <i class="fas fa-music text-white text-sm"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="${isCurrent ? 'text-blue-500 font-semibold' : 'text-white'} truncate">
                                    ${song.name}
                                </div>
                                <div class="text-gray-400 text-sm">
                                    ${song.duration_formatted || this.formatTime(song.duration)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-span-2 flex items-center justify-center text-gray-400">
                        ${song.duration_formatted || this.formatTime(song.duration)}
                    </div>
                    <div class="col-span-1 flex items-center justify-center">
                        <button onclick="event.stopPropagation(); player.removeSong(${index})" 
                                class="w-8 h-8 bg-red-500 bg-opacity-20 hover:bg-opacity-30 rounded-lg flex items-center justify-center transition-all group">
                            <i class="fas fa-trash text-red-500 text-xs group-hover:scale-110"></i>
                        </button>
                    </div>
                `;

                songsContainer.appendChild(songElement);
            });
        }
    }

    formatTime(seconds) {
        if (!seconds || seconds < 0) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    setupEventListeners() {
        const playBtn = document.getElementById('play-btn');
        if (playBtn) playBtn.onclick = () => this.togglePlay();

        const prevBtn = document.getElementById('prev-btn');
        if (prevBtn) prevBtn.onclick = () => this.previousSong();
        
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) nextBtn.onclick = () => this.nextSong();
        
        const volumeControl = document.getElementById('volume-control');
        if (volumeControl) {
            volumeControl.addEventListener('input', (e) => {
                const volume = e.target.value / 100;
                volumeControl.style.setProperty('--volume', `${e.target.value}%`);
                this.setVolume(volume);
            });
        }
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.handleSearch(e.target.value);
            };
        }

        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.onchange = (e) => {
                this.handleFileUpload(e.target.files);
            };
        }

        // Eliminado soporte para subir carpetas

        const shuffleBtn = document.getElementById('shuffle-btn');
        if (shuffleBtn) shuffleBtn.onclick = () => this.toggleShuffle();
        
        const repeatBtn = document.getElementById('repeat-btn');
        if (repeatBtn) repeatBtn.onclick = () => this.toggleRepeat();
    }

    toggleShuffle() {
        this.shuffleMode = !this.shuffleMode;
        const shuffleBtn = document.getElementById('shuffle-btn');
        const shuffleIcon = shuffleBtn?.querySelector('i');
        
        if (shuffleIcon) {
            if (this.shuffleMode) {
                shuffleIcon.className = 'fas fa-random text-green-500';
                this.showNotification('Modo shuffle activado', 'success');
            } else {
                shuffleIcon.className = 'fas fa-random text-gray-400';
                this.showNotification('Modo shuffle desactivado', 'info');
            }
        }
    }

    toggleRepeat() {
        const repeatBtn = document.getElementById('repeat-btn');
        const repeatIcon = repeatBtn?.querySelector('i');
        
        if (repeatIcon) {
            if (this.repeatMode === false) {
                this.repeatMode = true;
                repeatIcon.className = 'fas fa-redo text-green-500';
                this.showNotification('Repetir toda la lista', 'success');
            } else if (this.repeatMode === true) {
                this.repeatMode = 'one';
                repeatIcon.className = 'fas fa-redo-alt text-yellow-500';
                this.showNotification('Repetir canción actual', 'success');
            } else {
                this.repeatMode = false;
                repeatIcon.className = 'fas fa-redo text-gray-400';
                this.showNotification('Repetición desactivada', 'info');
            }
        }
    }

    // MÉTODO CORREGIDO: Seleccionar y reproducir canción automáticamente
    async selectAndPlaySong(index) {
        try {
            console.log(`🎵 Seleccionando y reproduciendo canción ${index}...`);
            
            // USAR EL ENDPOINT QUE SELECCIONA Y REPRODUCE AUTOMÁTICAMENTE
            const selectResponse = await fetch(`${this.baseURL}/api/select-song/${index}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!selectResponse.ok) {
                const errorText = await selectResponse.text();
                throw new Error(`Select failed: ${selectResponse.status} - ${errorText}`);
            }
            
            const selectResult = await selectResponse.json();
            console.log('✅ Canción seleccionada y reproduciendo:', selectResult);
            
            this.showNotification(`Reproduciendo: ${selectResult.song.name}`, 'success');
            
            // ACTUALIZACIÓN INMEDIATA de la interfaz
            this.currentState.currentSongIndex = index;
            this.currentState.isPlaying = true;
            this.updateUI();
            
            // Forzar actualización completa del estado
            await this.forceUpdateState();
            
        } catch (error) {
            console.error('❌ Error seleccionando canción:', error);
            this.showNotification('Error seleccionando canción', 'error');
        }
    }

    async togglePlay() {
        if (this.currentState.currentSongIndex < 0) {
            this.showNotification('Selecciona una canción primero', 'info');
            return;
        }
        
        console.log('🔄 Toggle play/pause - Estado actual:', this.currentState.isPlaying);
        
        this.currentState.isPlaying = !this.currentState.isPlaying;
        this.updatePlayButton();

        if (this.currentState.isPlaying) {
            await this.play();
        } else {
            await this.pause();
        }
    }

    async play() {
        try {
            console.log('▶️ Enviando solicitud de reproducción...');
            const response = await fetch(`${this.baseURL}/api/play`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Play failed: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('✅ Respuesta de play:', result);
            this.showNotification(`Reproduciendo: ${result.song}`, 'success');
            
            this.currentState.isPlaying = true;
            this.updatePlayButton();
            
        } catch (error) {
            console.error('❌ Error al reproducir:', error);
            this.showNotification('Error al reproducir', 'error');
            this.currentState.isPlaying = false;
            this.updatePlayButton();
        }
    }

    async pause() {
        try {
            console.log('⏸️ Enviando solicitud de pausa...');
            const response = await fetch(`${this.baseURL}/api/pause`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Pause failed: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('✅ Respuesta de pause:', result);
            this.showNotification('Reproducción pausada', 'info');
            
            this.currentState.isPlaying = false;
            this.updatePlayButton();
            
        } catch (error) {
            console.error('❌ Error al pausar:', error);
            this.showNotification('Error al pausar', 'error');
            this.currentState.isPlaying = true;
            this.updatePlayButton();
        }
    }

    // MÉTODO MEJORADO: Siguiente canción
    async nextSong() {
        try {
            if (this.repeatMode === 'one') {
                await this.play();
                return;
            }
            
            console.log('⏭️ Solicitando siguiente canción...');
            const response = await fetch(`${this.baseURL}/api/next`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Next failed: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('✅ Siguiente canción:', result);
            // Actualizar estado interno inmediatamente
            if (result.song && result.song.name) {
                const index = this.currentState.playlist.findIndex(s => s.name === result.song.name);
                if (index !== -1) {
                    this.currentState.currentSongIndex = index;
                }
            }
            this.showNotification(`Siguiente: ${result.song?.name || result.song || 'Canción'}`, 'info');
            // Actualizar nombre de la canción inmediatamente
            if (result.song && result.song.name) {
                const currentSongName = document.getElementById('current-song-name');
                const previewTitle = document.getElementById('preview-title');
                if (currentSongName) currentSongName.textContent = result.song.name;
                if (previewTitle) previewTitle.textContent = result.song.name;
            }
            // Esperar mensaje WebSocket y actualizar UI, pero también forzar actualización por si hay retraso
            setTimeout(() => this.updatePlayerDisplay(), 200);
            await this.forceUpdateState();
            
        } catch (error) {
            console.error('❌ Error siguiente canción:', error);
            this.showNotification('Error cambiando canción', 'error');
        }
    }

    // MÉTODO MEJORADO: Canción anterior
    async previousSong() {
        try {
            console.log('⏮️ Solicitando canción anterior...');
            const response = await fetch(`${this.baseURL}/api/previous`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Previous failed: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('✅ Canción anterior:', result);
            // Actualizar estado interno inmediatamente
            if (result.song && result.song.name) {
                const index = this.currentState.playlist.findIndex(s => s.name === result.song.name);
                if (index !== -1) {
                    this.currentState.currentSongIndex = index;
                }
            }
            this.showNotification(`Anterior: ${result.song?.name || result.song || 'Canción'}`, 'info');
            // Actualizar nombre de la canción inmediatamente
            if (result.song && result.song.name) {
                const currentSongName = document.getElementById('current-song-name');
                const previewTitle = document.getElementById('preview-title');
                if (currentSongName) currentSongName.textContent = result.song.name;
                if (previewTitle) previewTitle.textContent = result.song.name;
            }
            // Esperar mensaje WebSocket y actualizar UI, pero también forzar actualización por si hay retraso
            setTimeout(() => this.updatePlayerDisplay(), 200);
            await this.forceUpdateState();
            
        } catch (error) {
            console.error('❌ Error canción anterior:', error);
            this.showNotification('Error cambiando canción', 'error');
        }
    }

    // MÉTODO MEJORADO: Actualización forzada del estado
    async forceUpdateState() {
        try {
            console.log('🔄 Forzando actualización del estado...');
            
            await new Promise(resolve => setTimeout(resolve, 300));
            
            await this.loadInitialState();
            
            console.log('✅ Estado actualizado forzadamente');
        } catch (error) {
            console.error('❌ Error forzando actualización:', error);
        }
    }

    async setVolume(volume) {
        try {
            console.log('🔊 Estableciendo volumen:', volume);
            
            const response = await fetch(`${this.baseURL}/api/set-volume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volume: volume })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Volume set failed: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('✅ Volumen establecido:', result);
            
        } catch (error) {
            console.error('❌ Error estableciendo volumen:', error);
            this.showNotification('Error ajustando volumen', 'error');
        }
    }

    async removeSong(index) {
        const songName = this.currentState.playlist[index]?.name || 'esta canción';
        if (!confirm(`¿Estás seguro de que quieres eliminar "${songName}"?`)) {
            return;
        }

        try {
            console.log(`🗑️ Eliminando canción ${index}...`);
            const response = await fetch(`${this.baseURL}/api/remove-song/${index}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Remove failed: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log('✅ Canción eliminada:', result);
            this.showNotification('Canción eliminada', 'success');
            
            await this.loadInitialState();
            
        } catch (error) {
            console.error('❌ Error eliminando canción:', error);
            this.showNotification('Error eliminando canción', 'error');
        }
    }

    async handleFileUpload(files) {
        const validFiles = Array.from(files).filter(file => file.name && file.name.toLowerCase().endsWith('.mp3'));
        if (validFiles.length === 0) {
            this.showNotification('No se encontraron archivos MP3 válidos en la carpeta.', 'error');
            document.getElementById('file-input').value = '';
            document.getElementById('folder-input').value = '';
            return;
        }
        console.log('📁 Subiendo archivos MP3:', validFiles.length);
        for (let file of validFiles) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                console.log(`⬆️ Subiendo: ${file.name}`);
                const response = await fetch(`${this.baseURL}/api/upload-song`, {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
                }
                const result = await response.json();
                console.log('✅ Canción subida:', result);
                this.showNotification(`"${result.song.name}" agregada`, 'success');
                await this.loadInitialState();
            } catch (error) {
                console.error('❌ Error subiendo canción:', error);
                this.showNotification(`Error subiendo: ${file.name}`, 'error');
            }
        }
        document.getElementById('file-input').value = '';
        document.getElementById('folder-input').value = '';
    }

    handleSearch(query) {
        const searchTerm = query.toLowerCase();
        const songElements = document.querySelectorAll('.song-item');
        
        songElements.forEach(element => {
            const songText = element.textContent.toLowerCase();
            if (songText.includes(searchTerm)) {
                element.style.display = 'grid';
            } else {
                element.style.display = 'none';
            }
        });
    }

    showNotification(message, type = 'info') {
        document.querySelectorAll('[id^="toast-"]').forEach(toast => toast.remove());
        
        const toastId = 'toast-' + Date.now();
        const bgColor = type === 'error' ? 'bg-red-500' : 
                       type === 'success' ? 'bg-green-500' : 'bg-blue-500';
        
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `fixed top-4 right-4 p-4 rounded-xl text-white font-semibold ${bgColor} shadow-lg z-50 transform translate-x-32 transition-all duration-300`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.remove('translate-x-32'), 100);
        
        setTimeout(() => {
            toast.classList.add('translate-x-32');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

function uploadSong() {
    document.getElementById('file-input').click();
}


let player;
document.addEventListener('DOMContentLoaded', () => {
    player = new EvoPlayer();
});

window.addEventListener('error', (event) => {
    console.error('Error global:', event.error);
});