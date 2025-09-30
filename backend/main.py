from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import json
import asyncio
from typing import List, Dict
import pygame
import time
from pathlib import Path

# Inicializar pygame mixer
pygame.mixer.init()

app = FastAPI(title="Evo Player API", description="Modern Music Player Backend")

# Configurar CORS para desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directorios
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Estado global del reproductor
class PlayerState:
    def __init__(self):
        self.playlist: List[Dict] = []
        self.current_song_index: int = -1
        self.is_playing: bool = False
        self.is_paused: bool = False
        self.volume: float = 0.7
        self.progress: float = 0
        self.current_time: str = "00:00"
        self.total_time: str = "00:00"

player_state = PlayerState()

# Manager de conexiones WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        
        for connection in disconnected:
            self.disconnect(connection)

manager = ConnectionManager()

# Funciones de utilidad para música
def get_song_duration(file_path: str) -> float:
    """Obtiene la duración de un archivo de audio"""
    try:
        sound = pygame.mixer.Sound(file_path)
        return sound.get_length()
    except Exception as e:
        print(f"Error obteniendo duración: {e}")
        return 0

def format_time(seconds: float) -> str:
    """Formatea segundos a MM:SS"""
    if seconds < 0:
        seconds = 0
    minutes = int(seconds // 60)
    seconds = int(seconds % 60)
    return f"{minutes:02d}:{seconds:02d}"

def clean_song_name(filename: str) -> str:
    """Limpia el nombre del archivo para mostrar"""
    name = filename.replace('.mp3', '').replace('_', ' ').replace('-', ' ')
    return ' '.join(word.capitalize() for word in name.split())

# NUEVA FUNCIÓN: Manejar fin de canción
async def handle_song_end():
    """Maneja automáticamente el paso a la siguiente canción cuando termina la actual"""
    if not player_state.playlist:
        return
    
    print("🎵 Canción terminada, avanzando a la siguiente...")
    
    # Avanzar al siguiente índice
    player_state.current_song_index = (player_state.current_song_index + 1) % len(player_state.playlist)
    player_state.is_playing = False
    player_state.is_paused = False
    player_state.progress = 0
    player_state.current_time = "00:00"
    
    # Reproducir automáticamente la siguiente canción
    current_song = player_state.playlist[player_state.current_song_index]
    
    try:
        pygame.mixer.music.load(current_song["path"])
        pygame.mixer.music.play()
        player_state.is_playing = True
        player_state.is_paused = False
        
        print(f"▶️ Reproduciendo automáticamente: {current_song['name']}")
        
    except Exception as e:
        print(f"❌ Error reproduciendo siguiente canción: {e}")
        player_state.is_playing = False
    
    # Notificar a todos los clientes
    await manager.broadcast({
        "type": "player_state_changed", 
        "state": {
            "playlist": player_state.playlist,
            "current_song_index": player_state.current_song_index,
            "is_playing": player_state.is_playing,
            "is_paused": player_state.is_paused,
            "volume": player_state.volume,
            "progress": player_state.progress,
            "current_time": player_state.current_time,
            "total_time": player_state.total_time
        }
    })

# Tarea en segundo plano para actualizar progreso (CORREGIDA)
async def progress_updater():
    while True:
        if (player_state.is_playing and player_state.playlist and 
            player_state.current_song_index >= 0):
            
            try:
                # Obtener posición actual (en milisegundos)
                current_pos = pygame.mixer.music.get_pos()
                if current_pos > 0:
                    current_pos_seconds = current_pos / 1000.0
                    player_state.progress = current_pos_seconds
                    
                    current_song = player_state.playlist[player_state.current_song_index]
                    player_state.current_time = format_time(current_pos_seconds)
                    player_state.total_time = current_song['duration_formatted']
                    
                    # Broadcast del progreso
                    await manager.broadcast({
                        "type": "progress_update",
                        "progress": current_pos_seconds,
                        "current_time": player_state.current_time,
                        "total_time": player_state.total_time
                    })
                
                # Verificar si la canción terminó (CORREGIDO)
                elif current_pos == -1 and player_state.is_playing:
                    print("🔚 Detected song end, handling transition...")
                    await handle_song_end()
                    
            except Exception as e:
                print(f"Error en progress_updater: {e}")
        
        await asyncio.sleep(0.5)  # Actualizar cada 500ms

# Rutas de la API
@app.get("/")
async def root():
    FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    else:
        return {"message": "Evo Player Backend is running!", "status": "success"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Evo Player API"}

@app.get("/api/player-state")
async def get_player_state():
    """Obtiene el estado actual del reproductor"""
    return {
        "playlist": player_state.playlist,
        "current_song_index": player_state.current_song_index,
        "is_playing": player_state.is_playing,
        "is_paused": player_state.is_paused,
        "volume": player_state.volume,
        "progress": player_state.progress,
        "current_time": player_state.current_time,
        "total_time": player_state.total_time
    }

@app.post("/api/upload-song")
async def upload_song(file: UploadFile = File(...)):
    """Sube una canción y la agrega a la playlist"""
    if not file.filename.lower().endswith('.mp3'):
        raise HTTPException(400, "Solo se permiten archivos MP3")
    
    # Guardar archivo
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    # Calcular duración
    duration = get_song_duration(str(file_path))
    
    # Agregar a playlist
    song_data = {
        "id": len(player_state.playlist),
        "name": clean_song_name(file.filename),
        "filename": file.filename,
        "path": str(file_path),
        "duration": duration,
        "duration_formatted": format_time(duration)
    }
    
    player_state.playlist.append(song_data)
    
    # Si es la primera canción, seleccionarla
    if len(player_state.playlist) == 1:
        player_state.current_song_index = 0
    
    # Notificar a todos los clientes
    await manager.broadcast({
        "type": "playlist_updated", 
        "playlist": player_state.playlist
    })
    
    return {
        "message": "Canción subida exitosamente", 
        "song": song_data,
        "total_songs": len(player_state.playlist)
    }

@app.post("/api/play")
async def play_song():
    """Reproduce la canción actual"""
    if not player_state.playlist or player_state.current_song_index < 0:
        raise HTTPException(400, "No hay canciones en la playlist")
    
    current_song = player_state.playlist[player_state.current_song_index]
    
    try:
        if player_state.is_paused:
            pygame.mixer.music.unpause()
            player_state.is_playing = True
            player_state.is_paused = False
        else:
            pygame.mixer.music.load(current_song["path"])
            pygame.mixer.music.play()
            player_state.is_playing = True
            player_state.is_paused = False
            player_state.progress = 0
        
        await manager.broadcast({
            "type": "player_state_changed", 
            "state": await get_player_state()
        })
        
        return {"message": "Reproduciendo", "song": current_song["name"]}
    
    except Exception as e:
        raise HTTPException(500, f"Error reproduciendo canción: {str(e)}")

@app.post("/api/pause")
async def pause_song():
    """Pausa la reproducción actual"""
    if player_state.is_playing:
        pygame.mixer.music.pause()
        player_state.is_playing = False
        player_state.is_paused = True
        
        await manager.broadcast({
            "type": "player_state_changed", 
            "state": await get_player_state()
        })
        return {"message": "Reproducción pausada"}
    
    return {"message": "No hay reproducción activa"}

@app.post("/api/stop")
async def stop_song():
    """Detiene la reproducción completamente"""
    pygame.mixer.music.stop()
    player_state.is_playing = False
    player_state.is_paused = False
    player_state.progress = 0
    player_state.current_time = "00:00"
    
    await manager.broadcast({
        "type": "player_state_changed", 
        "state": await get_player_state()
    })
    return {"message": "Reproducción detenida"}

@app.post("/api/next")
async def next_song():
    """Salta a la siguiente canción"""
    if not player_state.playlist:
        raise HTTPException(400, "No hay canciones en la playlist")
    
    # Detener reproducción actual
    pygame.mixer.music.stop()
    # Avanzar al siguiente índice
    player_state.current_song_index = (player_state.current_song_index + 1) % len(player_state.playlist)
    player_state.is_playing = False
    player_state.is_paused = False
    player_state.progress = 0
    player_state.current_time = "00:00"
    # Reproducir automáticamente la nueva canción
    try:
        current_song = player_state.playlist[player_state.current_song_index]
        pygame.mixer.music.load(current_song["path"])
        pygame.mixer.music.play()
        player_state.is_playing = True
        player_state.is_paused = False
        print(f"🎵 Reproduciendo: {current_song['name']}")
    except Exception as e:
        print(f"❌ Error reproduciendo siguiente canción: {e}")
        player_state.is_playing = False
    # Notificar a todos los clientes
    await manager.broadcast({
        "type": "player_state_changed", 
        "state": await get_player_state()
    })
    return {
        "message": f"Reproduciendo: {player_state.playlist[player_state.current_song_index]['name']}",
        "song": player_state.playlist[player_state.current_song_index],
        "playing": player_state.is_playing
    }

@app.post("/api/previous")
async def previous_song():
    """Regresa a la canción anterior"""
    if not player_state.playlist:
        raise HTTPException(400, "No hay canciones en la playlist")
    
    # Detener reproducción actual
    pygame.mixer.music.stop()
    # Retroceder al índice anterior
    player_state.current_song_index = (player_state.current_song_index - 1) % len(player_state.playlist)
    player_state.is_playing = False
    player_state.is_paused = False
    player_state.progress = 0
    player_state.current_time = "00:00"
    # Reproducir automáticamente la nueva canción
    try:
        current_song = player_state.playlist[player_state.current_song_index]
        pygame.mixer.music.load(current_song["path"])
        pygame.mixer.music.play()
        player_state.is_playing = True
        player_state.is_paused = False
        print(f"🎵 Reproduciendo: {current_song['name']}")
    except Exception as e:
        print(f"❌ Error reproduciendo canción anterior: {e}")
        player_state.is_playing = False
    # Notificar a todos los clientes
    await manager.broadcast({
        "type": "player_state_changed", 
        "state": await get_player_state()
    })
    return {
        "message": f"Reproduciendo: {player_state.playlist[player_state.current_song_index]['name']}",
        "song": player_state.playlist[player_state.current_song_index],
        "playing": player_state.is_playing
    }

# NUEVO ENDPOINT MEJORADO: Seleccionar y reproducir canción
@app.post("/api/select-song/{song_index}")
async def select_song(song_index: int):
    """Selecciona una canción específica de la playlist y la reproduce automáticamente"""
    if song_index < 0 or song_index >= len(player_state.playlist):
        raise HTTPException(400, "Índice de canción inválido")
    
    # Detener reproducción actual si hay alguna
    if player_state.is_playing:
        pygame.mixer.music.stop()
    
    # Cambiar a la nueva canción
    player_state.current_song_index = song_index
    player_state.is_playing = False
    player_state.is_paused = False
    player_state.progress = 0
    player_state.current_time = "00:00"
    
    # Reproducir automáticamente la nueva canción
    try:
        current_song = player_state.playlist[song_index]
        pygame.mixer.music.load(current_song["path"])
        pygame.mixer.music.play()
        player_state.is_playing = True
        player_state.is_paused = False
        
        print(f"🎵 Reproduciendo: {current_song['name']}")
        
    except Exception as e:
        print(f"❌ Error reproduciendo canción seleccionada: {e}")
        player_state.is_playing = False
    
    # Notificar a todos los clientes
    await manager.broadcast({
        "type": "player_state_changed", 
        "state": await get_player_state()
    })
    
    return {
        "message": f"Reproduciendo: {player_state.playlist[song_index]['name']}",
        "song": player_state.playlist[song_index],
        "playing": player_state.is_playing
    }

@app.post("/api/set-volume")
async def set_volume(volume: float = Body(..., embed=True)):
    """Establece el volumen (0.0 a 1.0)"""
    if volume < 0 or volume > 1:
        raise HTTPException(400, "El volumen debe estar entre 0 y 1")
    
    pygame.mixer.music.set_volume(volume)
    player_state.volume = volume
    
    await manager.broadcast({
        "type": "volume_changed", 
        "volume": volume
    })
    
    return {"message": f"Volumen establecido a {volume:.0%}"}

@app.delete("/api/remove-song/{song_index}")
async def remove_song(song_index: int):
    """Elimina una canción de la playlist"""
    if song_index < 0 or song_index >= len(player_state.playlist):
        raise HTTPException(400, "Índice de canción inválido")
    
    removed_song = player_state.playlist.pop(song_index)
    
    # Actualizar índice actual si es necesario
    if player_state.current_song_index == song_index:
        player_state.current_song_index = -1
        player_state.is_playing = False
        player_state.is_paused = False
        player_state.progress = 0
        player_state.current_time = "00:00"
    elif player_state.current_song_index > song_index:
        player_state.current_song_index -= 1
    
    # Si hay canciones pero ninguna seleccionada, seleccionar la primera
    if player_state.playlist and player_state.current_song_index == -1:
        player_state.current_song_index = 0
    
    await manager.broadcast({
        "type": "playlist_updated", 
        "playlist": player_state.playlist
    })
    
    await manager.broadcast({
        "type": "player_state_changed", 
        "state": await get_player_state()
    })
    
    return {"message": f"Canción eliminada: {removed_song['name']}"}

# WebSocket para updates en tiempo real
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Enviar estado actual al conectar
        await websocket.send_json({
            "type": "initial_state", 
            "state": await get_player_state()
        })
        
        # Mantener conexión activa
        while True:
            await asyncio.sleep(30)  # Ping cada 30 segundos
            try:
                await websocket.send_json({"type": "ping"})
            except:
                break
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"Error en WebSocket: {e}")
        manager.disconnect(websocket)

# Servir archivos estáticos del frontend
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

# Montar el frontend como archivos estáticos
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    print(f"✅ Frontend montado desde: {FRONTEND_DIR}")
else:
    print(f"❌ No se encontró frontend en: {FRONTEND_DIR}")

@app.on_event("startup")
async def startup_event():
    # Iniciar el actualizador de progreso en segundo plano
    asyncio.create_task(progress_updater())
    print("🚀 Evo Player Backend iniciado correctamente")
    print("📍 Reproducción al hacer clic en canciones: ✅ ACTIVADA")
    print("📍 Avance automático entre canciones: ✅ ACTIVADO")

if __name__ == "__main__":
    import uvicorn
    print("🎵 Iniciando Evo Player Server...")
    print("📍 Frontend disponible en: http://localhost:8000")
    print("📍 API disponible en: http://localhost:8000/api")
    
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000,
        reload=True
    )