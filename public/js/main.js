/**
 * Screen2Gether - Main Application
 * Handles UI interactions and signaling
 */

// Global state
let currentRole = null;
let roomId = null;
let signaling = null;
let webrtc = null;
let statsInterval = null;

// DOM Elements
const hostPage = document.getElementById('host-page');
const viewerPage = document.getElementById('viewer-page');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCodeInput = document.getElementById('room-code-input');
const localPreview = document.getElementById('local-preview');
const remoteVideo = document.getElementById('remote-video');
const videoContainer = document.getElementById('video-container');
const waitingMessage = document.getElementById('waiting-message');
const viewersList = document.getElementById('viewers-list');
const viewerCount = document.getElementById('viewer-count');
const hostRoomInfo = document.getElementById('host-room-info');
const hostStats = document.getElementById('host-stats');
const viewerStats = document.getElementById('viewer-stats');
const previewSection = document.getElementById('preview-section');
const startShareBtn = document.getElementById('start-share-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
const bitrateSlider = document.getElementById('bitrate');
const bitrateValue = document.getElementById('bitrate-value');

/**
 * Initialize based on URL path
 */
function initApp() {
    const isHostPage = window.location.pathname === '/host';
    
    if (isHostPage) {
        currentRole = 'host';
        hostPage.classList.add('active');
        viewerPage.classList.remove('active');
        initHost();
    } else {
        currentRole = 'viewer';
        viewerPage.classList.add('active');
        hostPage.classList.remove('active');
        initViewer();
    }
}

/**
 * Initialize Host
 */
function initHost() {
    signaling = new SignalingClient();
    
    signaling.onOpen = () => {
        signaling.send({ type: 'create-room' });
    };

    webrtc = new WebRTCManager(signaling);
    setupWebRTCCallbacks();

    signaling.onMessage = handleSignalingMessage;
    signaling.connect();
}

/**
 * Initialize Viewer
 */
function initViewer() {
    signaling = new SignalingClient();
    webrtc = new WebRTCManager(signaling);
    setupWebRTCCallbacks();
    signaling.onMessage = handleSignalingMessage;
    signaling.connect();
}

/**
 * Signaling Client
 */
class SignalingClient {
    constructor() {
        this.ws = null;
        this.onMessage = null;
        this.onOpen = null;
        this.onClose = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
                if (this.onOpen) this.onOpen();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Received:', data.type);
                    if (this.onMessage) this.onMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };

            this.ws.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                if (this.onClose) this.onClose();
                
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
                    setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Error creating WebSocket:', error);
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected');
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

/**
 * WebRTC Callbacks Setup
 */
function setupWebRTCCallbacks() {
    webrtc.onRemoteStream = (stream) => {
        console.log('Received remote stream');
        remoteVideo.srcObject = stream;
        videoContainer.style.display = 'block';
        waitingMessage.style.display = 'none';
        viewerStats.style.display = 'block';
        
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log('Remote audio track received:', audioTracks[0].label);
        }
        
        startStatsMonitoring('viewer');
    };

    webrtc.onConnectionStateChange = (state, peerId) => {
        console.log(`Connection state: ${state} for ${peerId}`);
        
        if (currentRole === 'host') {
            document.getElementById('connection-status').textContent = 
                state === 'connected' ? '已连接' : state;
        } else {
            document.getElementById('viewer-connection-status').textContent = 
                state === 'connected' ? '已连接' : state;
        }
    };

    // Handle audio capture failure (Linux/KDE issue)
    webrtc.onAudioCaptureFailed = async () => {
        showLinuxAudioModal();
    };
}

/**
 * Show Linux audio configuration modal
 */
function showLinuxAudioModal() {
    const modal = document.getElementById('linux-audio-modal');
    if (modal) {
        modal.classList.add('show');
    }
}

/**
 * Close Linux audio modal
 */
function closeLinuxAudioModal() {
    const modal = document.getElementById('linux-audio-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

/**
 * Use microphone as audio source
 */
async function useMicrophoneAudio() {
    closeLinuxAudioModal();
    
    if (webrtc && webrtc.addMicrophoneAudio) {
        const success = await webrtc.addMicrophoneAudio();
        if (success) {
            showTemporaryMessage('✅ 麦克风音频已添加');
        } else {
            showError('无法访问麦克风，请检查权限设置');
        }
    }
}

/**
 * Show temporary message
 */
function showTemporaryMessage(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #22c55e;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        font-weight: 500;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, duration);
}

/**
 * Handle Signaling Messages
 */
function handleSignalingMessage(data) {
    const { type, payload } = data;

    switch (type) {
        case 'room-created':
            roomId = payload.roomId;
            roomCodeDisplay.textContent = roomId;
            hostRoomInfo.style.display = 'flex';
            console.log('Room created:', roomId);
            break;

        case 'room-joined':
            roomId = payload.roomId;
            waitingMessage.style.display = 'block';
            console.log('Joined room:', roomId);
            break;

        case 'viewer-joined':
            console.log('Viewer joined:', payload.viewerId);
            if (webrtc.localStream) {
                webrtc.createOffer(payload.viewerId);
            }
            updateViewersList(payload.viewerId, 'add');
            break;

        case 'viewer-disconnected':
            console.log('Viewer disconnected:', payload.viewerId);
            webrtc.closeConnection(payload.viewerId);
            updateViewersList(payload.viewerId, 'remove');
            break;

        case 'host-disconnected':
            showError('主播已断开连接');
            window.location.href = '/';
            break;

        case 'offer':
            webrtc.handleOffer(payload.offer, payload.hostId);
            break;

        case 'answer':
            webrtc.handleAnswer(payload.answer, payload.viewerId);
            break;

        case 'ice-candidate':
            webrtc.handleIceCandidate(payload.candidate, payload.hostId || payload.viewerId);
            break;

        case 'error':
            showError(payload.message);
            break;

        default:
            console.log('Unknown message type:', type);
    }
}

/**
 * Host Functions
 */
async function startSharing() {
    const shareAudio = document.getElementById('share-audio').checked;
    const useSeparateAudio = document.getElementById('use-separate-audio')?.checked || false;
    const selectedAudioDevice = document.getElementById('audio-device-select')?.value || '';
    const resolution = document.getElementById('resolution').value;
    const frameRate = document.getElementById('framerate').value;
    const bitrate = document.getElementById('bitrate').value;
    const codec = document.getElementById('codec').value;

    // Apply TURN server config if specified
    const turnConfig = getTurnServerConfig();
    if (turnConfig) {
        webrtc.setCustomIceServers(turnConfig);
        console.log('Using custom TURN/STUN server:', turnConfig.url);
    }

    // Update WebRTC settings
    webrtc.setVideoSettings({
        resolution,
        frameRate,
        bitrate,
        codec
    });

    try {
        // Determine audio capture mode
        let audioStream = null;
        let screenStream = null;
        
        if (useSeparateAudio && selectedAudioDevice) {
            // Linux/PipeWire: Separate audio capture
            console.log('Using separate audio capture from device:', selectedAudioDevice);
            
            // Capture screen WITHOUT audio
            screenStream = await webrtc.captureScreen(false);
            
            // Separately capture audio from selected device
            try {
                const audioContext = new AudioContext();
                const source = audioContext.createMediaStreamDestination();
                
                // Try to get audio from the selected device
                const audioMediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: { exact: selectedAudioDevice }
                    }
                });
                
                // Add audio track to screen stream
                audioMediaStream.getAudioTracks().forEach(track => {
                    screenStream.addTrack(track);
                    console.log('Added separate audio track:', track.label);
                });
                
            } catch (audioError) {
                console.warn('Failed to capture separate audio:', audioError);
                showLinuxAudioModal();
            }
            
        } else {
            // Normal capture (Windows/Mac or Linux without separate audio)
            screenStream = await webrtc.captureScreen(shareAudio);
        }
        
        const stream = screenStream;
        
        // Show preview
        localPreview.srcObject = stream;
        previewSection.style.display = 'block';
        startShareBtn.style.display = 'none';
        stopShareBtn.style.display = 'block';
        hostStats.style.display = 'block';

        // Check audio status
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log('Audio sharing active:', audioTracks[0].label);
        } else if (shareAudio && !useSeparateAudio) {
            // Audio was requested but not captured - show Linux modal
            showLinuxAudioModal();
        }

        startStatsMonitoring('host');

    } catch (error) {
        console.error('Error starting share:', error);
        if (error.name === 'NotAllowedError') {
            showError('屏幕共享被拒绝，请允许访问屏幕');
        } else {
            showError('无法启动屏幕共享: ' + error.message);
        }
    }
}

function stopSharing() {
    webrtc.stopAllConnections();
    
    previewSection.style.display = 'none';
    startShareBtn.style.display = 'block';
    stopShareBtn.style.display = 'none';
    hostStats.style.display = 'none';
    
    if (statsInterval) {
        clearInterval(statsInterval);
    }
    
    localPreview.srcObject = null;
}

function updateViewersList(viewerId, action) {
    if (action === 'add') {
        const li = document.createElement('li');
        li.id = `viewer-${viewerId}`;
        li.innerHTML = `
            <span>观看者 ${viewerId.substring(0, 8)}</span>
            <span class="status-dot" style="color: #22c55e;">● 已连接</span>
        `;
        viewersList.appendChild(li);
    } else if (action === 'remove') {
        const li = document.getElementById(`viewer-${viewerId}`);
        if (li) li.remove();
    }
    
    viewerCount.textContent = viewersList.children.length;
}

/**
 * Viewer Functions
 */
function joinRoom() {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) {
        showError('请输入房间号');
        return;
    }

    // Apply TURN server config if specified
    const turnConfig = getViewerTurnServerConfig();
    if (turnConfig) {
        webrtc.setCustomIceServers(turnConfig);
        console.log('Using custom TURN/STUN server:', turnConfig.url);
    }

    signaling.send({
        type: 'join-room',
        payload: { roomId: code }
    });
}

/**
 * Stats Monitoring
 */
function startStatsMonitoring(role) {
    if (statsInterval) {
        clearInterval(statsInterval);
    }

    let lastBytesReceived = 0;
    let lastTimestamp = Date.now();

    statsInterval = setInterval(async () => {
        if (!webrtc) return;

        const peerId = role === 'host' 
            ? Array.from(webrtc.peerConnections.keys())[0]
            : 'host';

        const stats = await webrtc.getStats(peerId);
        if (!stats) return;

        if (role === 'host') {
            updateHostStats(stats);
        } else {
            updateViewerStats(stats, lastBytesReceived, lastTimestamp);
            lastBytesReceived = stats.video.bytesReceived || 0;
            lastTimestamp = Date.now();
        }
    }, 1000);
}

function updateHostStats(stats) {
    if (stats.video.frameWidth) {
        document.getElementById('actual-resolution').textContent = 
            `${stats.video.frameWidth}x${stats.video.frameHeight}`;
    }
    if (stats.video.framesPerSecond) {
        document.getElementById('actual-framerate').textContent = 
            `${stats.video.framesPerSecond} FPS`;
    }
    if (stats.video.bytesSent) {
        const bitrate = (stats.video.bytesSent * 8 / 1000000).toFixed(2);
        document.getElementById('actual-bitrate').textContent = `${bitrate} Mbps`;
    }
}

function updateViewerStats(stats, lastBytes, lastTime) {
    if (stats.video.frameWidth) {
        document.getElementById('viewer-resolution').textContent = 
            `${stats.video.frameWidth}x${stats.video.frameHeight}`;
    }
    if (stats.video.framesPerSecond) {
        document.getElementById('viewer-framerate').textContent = 
            `${stats.video.framesPerSecond} FPS`;
    }
    
    if (stats.connection.currentRoundTripTime) {
        const latency = (stats.connection.currentRoundTripTime * 1000).toFixed(0);
        document.getElementById('viewer-latency').textContent = `${latency} ms`;
    }
    
    const now = Date.now();
    const timeDiff = (now - lastTime) / 1000;
    if (timeDiff > 0 && lastBytes > 0) {
        const bytesDiff = (stats.video.bytesReceived || 0) - lastBytes;
        const bitrate = ((bytesDiff * 8) / timeDiff / 1000000).toFixed(2);
        document.getElementById('viewer-bitrate').textContent = `${bitrate} Mbps`;
    }
}

/**
 * Video Controls
 */
function toggleFullscreen() {
    const container = document.getElementById('video-container');
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            console.error('Error attempting fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

async function togglePiP() {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            await remoteVideo.requestPictureInPicture();
        }
    } catch (error) {
        console.error('PiP error:', error);
        showError('画中画模式不可用');
    }
}

/**
 * TURN Server Config Functions
 */
function toggleTurnServerConfig() {
    const checkbox = document.getElementById('use-turn-server');
    const config = document.getElementById('turn-server-config');
    
    if (checkbox && config) {
        config.style.display = checkbox.checked ? 'block' : 'none';
        
        if (!checkbox.checked && webrtc) {
            webrtc.setCustomIceServers(null);
        }
    }
}

function toggleViewerTurnServerConfig() {
    const checkbox = document.getElementById('viewer-use-turn-server');
    const config = document.getElementById('viewer-turn-server-config');
    
    if (checkbox && config) {
        config.style.display = checkbox.checked ? 'block' : 'none';
        
        if (!checkbox.checked && webrtc) {
            webrtc.setCustomIceServers(null);
        }
    }
}

function getTurnServerConfig() {
    const useTurn = document.getElementById('use-turn-server');
    if (!useTurn || !useTurn.checked) return null;
    
    const url = document.getElementById('turn-server-url')?.value.trim();
    const username = document.getElementById('turn-username')?.value.trim();
    const credential = document.getElementById('turn-password')?.value;
    
    if (!url) return null;
    
    return { url, username, credential };
}

function getViewerTurnServerConfig() {
    const useTurn = document.getElementById('viewer-use-turn-server');
    if (!useTurn || !useTurn.checked) return null;
    
    const url = document.getElementById('viewer-turn-server-url')?.value.trim();
    const username = document.getElementById('viewer-turn-username')?.value.trim();
    const credential = document.getElementById('viewer-turn-password')?.value;
    
    if (!url) return null;
    
    return { url, username, credential };
}

/**
 * Utility Functions
 */
function copyRoomCode() {
    navigator.clipboard.writeText(roomId).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function showError(message) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-modal').classList.add('show');
}

function closeErrorModal() {
    document.getElementById('error-modal').classList.remove('show');
}

// Event Listeners
bitrateSlider.addEventListener('input', (e) => {
    bitrateValue.textContent = `${e.target.value} Mbps`;
});

document.getElementById('volume-slider').addEventListener('input', (e) => {
    remoteVideo.volume = e.target.value / 100;
});

roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

/**
 * Linux Separate Audio Capture Functions
 */
async function enumerateAudioDevices() {
    try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            stream.getTracks().forEach(track => track.stop());
        });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioSelect = document.getElementById('audio-device-select');
        
        if (!audioSelect) return;
        
        // Clear existing options
        audioSelect.innerHTML = '';
        
        // Filter audio output devices (speakers/monitors)
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        
        // Add monitor/virtual devices first (for Linux PipeWire)
        const monitorDevices = audioOutputs.filter(d => 
            d.label.toLowerCase().includes('monitor') || 
            d.label.toLowerCase().includes('screen2gether') ||
            d.label.toLowerCase().includes('virtual')
        );
        
        if (monitorDevices.length > 0) {
            const group = document.createElement('optgroup');
            group.label = '📊 虚拟/监视器设备';
            monitorDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Monitor ${device.deviceId.slice(0, 8)}`;
                group.appendChild(option);
            });
            audioSelect.appendChild(group);
        }
        
        // Add other audio outputs
        const otherOutputs = audioOutputs.filter(d => 
            !d.label.toLowerCase().includes('monitor') && 
            !d.label.toLowerCase().includes('screen2gether') &&
            !d.label.toLowerCase().includes('virtual')
        );
        if (otherOutputs.length > 0) {
            const group = document.createElement('optgroup');
            group.label = '🔊 音频输出';
            otherOutputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${device.deviceId.slice(0, 8)}`;
                group.appendChild(option);
            });
            audioSelect.appendChild(group);
        }
        
        // Add audio inputs (microphones)
        if (audioInputs.length > 0) {
            const group = document.createElement('optgroup');
            group.label = '🎤 麦克风';
            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Mic ${device.deviceId.slice(0, 8)}`;
                group.appendChild(option);
            });
            audioSelect.appendChild(group);
        }
        
        if (audioSelect.options.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '-- 未检测到音频设备 --';
            audioSelect.appendChild(option);
        }
        
        console.log(`Enumerated ${audioOutputs.length} audio outputs, ${audioInputs.length} audio inputs`);
        
    } catch (error) {
        console.error('Error enumerating audio devices:', error);
        const audioSelect = document.getElementById('audio-device-select');
        if (audioSelect) {
            audioSelect.innerHTML = '<option value="">-- 无法获取设备列表 --</option>';
        }
    }
}

function toggleSeparateAudioOption() {
    const checkbox = document.getElementById('use-separate-audio');
    const audioSelect = document.getElementById('audio-device-select');
    
    if (checkbox && audioSelect) {
        audioSelect.disabled = !checkbox.checked;
        
        if (checkbox.checked) {
            // Enumerate devices when enabled
            enumerateAudioDevices();
        }
    }
}

// Initialize app on load
initApp();

// Log browser support
console.log('WebRTC Support:', {
    getUserMedia: !!navigator.mediaDevices,
    getDisplayMedia: !!navigator.mediaDevices.getDisplayMedia,
    RTCPeerConnection: !!window.RTCPeerConnection,
    WebSocket: !!window.WebSocket
});
