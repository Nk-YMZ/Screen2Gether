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
const landingPage = document.getElementById('landing-page');
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
                
                // Attempt reconnection
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
 * Page Navigation
 */
function selectRole(role) {
    currentRole = role;
    
    // Initialize signaling
    signaling = new SignalingClient();
    
    signaling.onOpen = () => {
        if (role === 'host') {
            signaling.send({ type: 'create-room' });
        }
    };

    // Initialize WebRTC
    webrtc = new WebRTCManager(signaling);
    setupWebRTCCallbacks();

    signaling.onMessage = handleSignalingMessage;
    signaling.connect();

    // Show appropriate page
    landingPage.classList.remove('active');
    if (role === 'host') {
        hostPage.classList.add('active');
    } else {
        viewerPage.classList.add('active');
    }
}

function goBack() {
    // Cleanup
    if (webrtc) {
        webrtc.stopAllConnections();
    }
    if (signaling) {
        signaling.disconnect();
    }
    if (statsInterval) {
        clearInterval(statsInterval);
    }

    // Reset state
    currentRole = null;
    roomId = null;
    signaling = null;
    webrtc = null;
    
    // Reset UI
    hostPage.classList.remove('active');
    viewerPage.classList.remove('active');
    landingPage.classList.add('active');
    
    // Reset host page
    hostRoomInfo.style.display = 'none';
    previewSection.style.display = 'none';
    startShareBtn.style.display = 'block';
    stopShareBtn.style.display = 'none';
    hostStats.style.display = 'none';
    viewersList.innerHTML = '';
    viewerCount.textContent = '0';
    
    // Reset viewer page
    videoContainer.style.display = 'none';
    waitingMessage.style.display = 'none';
    viewerStats.style.display = 'none';
    roomCodeInput.value = '';
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
        
        // Check if audio track exists
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log('Remote audio track received:', audioTracks[0].label);
            updateAudioStatus(true);
        } else {
            console.warn('No audio track in remote stream');
            updateAudioStatus(false);
        }
        
        // Start stats monitoring
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
        showAudioFallbackDialog();
    };
}

/**
 * Update audio status indicator
 */
function updateAudioStatus(hasAudio) {
    const audioIndicator = document.getElementById('audio-status-indicator');
    if (audioIndicator) {
        if (hasAudio) {
            audioIndicator.innerHTML = '🔊 有音频';
            audioIndicator.style.color = '#22c55e';
        } else {
            audioIndicator.innerHTML = '🔇 无音频';
            audioIndicator.style.color = '#ef4444';
        }
    }
}

/**
 * Show audio fallback dialog for Linux users
 */
function showAudioFallbackDialog() {
    const modal = document.getElementById('audio-fallback-modal');
    if (modal) {
        modal.classList.add('show');
    } else {
        // Create modal if not exists
        const newModal = document.createElement('div');
        newModal.id = 'audio-fallback-modal';
        newModal.className = 'modal show';
        newModal.innerHTML = `
            <div class="modal-content">
                <h3>⚠️ 系统音频捕获失败</h3>
                <p>您的系统可能不支持通过浏览器直接捕获系统音频。</p>
                <p><strong>这是 Linux 系统的常见问题。</strong></p>
                <hr>
                <p><strong>解决方案：</strong></p>
                <ol style="text-align: left; margin: 15px 0;">
                    <li>使用<strong>麦克风</strong>作为音频源（点击下方按钮）</li>
                    <li>安装 <code>xdg-desktop-portal-gtk</code> 并重启：
                        <pre style="background: #1e1e1e; padding: 10px; border-radius: 5px; margin-top: 5px;">sudo pacman -S xdg-desktop-portal-gtk
systemctl --user restart xdg-desktop-portal</pre>
                    </li>
                    <li>注销并重新登录 KDE</li>
                </ol>
                <div class="modal-buttons">
                    <button onclick="useMicrophoneAudio()" class="btn btn-primary">🎤 使用麦克风</button>
                    <button onclick="closeAudioFallbackModal()" class="btn btn-secondary">继续无音频</button>
                </div>
            </div>
        `;
        document.body.appendChild(newModal);
    }
}

/**
 * Use microphone as audio source
 */
async function useMicrophoneAudio() {
    closeAudioFallbackModal();
    
    if (webrtc && webrtc.addMicrophoneAudio) {
        const success = await webrtc.addMicrophoneAudio();
        if (success) {
            showTemporaryMessage('✅ 麦克风音频已添加');
            updateAudioStatus(true);
        } else {
            showError('无法访问麦克风，请检查权限设置');
        }
    }
}

function closeAudioFallbackModal() {
    const modal = document.getElementById('audio-fallback-modal');
    if (modal) {
        modal.classList.remove('show');
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
            // Host creates offer when viewer joins (if already sharing)
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
            goBack();
            break;

        case 'offer':
            // Viewer receives offer from host
            webrtc.handleOffer(payload.offer, payload.hostId);
            break;

        case 'answer':
            // Host receives answer from viewer
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
    const resolution = document.getElementById('resolution').value;
    const frameRate = document.getElementById('framerate').value;
    const bitrate = document.getElementById('bitrate').value;
    const codec = document.getElementById('codec').value;
    const useSeparateAudio = document.getElementById('use-separate-audio')?.checked;
    const audioDeviceId = document.getElementById('audio-device-select')?.value;

    // Update WebRTC settings
    webrtc.setVideoSettings({
        resolution,
        frameRate,
        bitrate,
        codec
    });

    try {
        let stream;
        
        if (useSeparateAudio && shareAudio) {
            // Use separate audio capture (for PipeWire virtual device)
            stream = await webrtc.captureScreenWithSeparateAudio(audioDeviceId || null);
        } else {
            // Normal capture
            stream = await webrtc.captureScreen(shareAudio);
        }
        
        // Show preview
        localPreview.srcObject = stream;
        previewSection.style.display = 'block';
        startShareBtn.style.display = 'none';
        stopShareBtn.style.display = 'block';
        hostStats.style.display = 'block';

        // Check audio status and update UI
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log('Audio sharing active:', audioTracks[0].label);
            updateHostAudioStatus(true, audioTracks[0].label);
        } else if (shareAudio) {
            updateHostAudioStatus(false, '音频捕获失败');
        }

        // Create offers for existing viewers
        webrtc.peerConnections.forEach((pc, viewerId) => {
            // Already connected viewers
        });

        // Start stats monitoring
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

/**
 * Update host audio status display
 */
function updateHostAudioStatus(hasAudio, label = '') {
    const indicator = document.getElementById('host-audio-status');
    if (indicator) {
        if (hasAudio) {
            indicator.innerHTML = `🔊 音频: ${label || '已连接'}`;
            indicator.style.color = '#22c55e';
        } else {
            indicator.innerHTML = `🔇 音频: ${label || '无'}`;
            indicator.style.color = '#ef4444';
        }
    }
}

/**
 * Load audio input devices for selection
 */
async function loadAudioDevices() {
    const select = document.getElementById('audio-device-select');
    if (!select) return;

    const devices = await webrtc.getAudioInputDevices();
    
    select.innerHTML = '<option value="">-- 选择音频设备 --</option>';
    
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Audio ${device.deviceId.substring(0, 8)}`;
        select.appendChild(option);
    });
    
    console.log('Loaded audio devices:', devices.length);
}

// Toggle separate audio option visibility
function toggleSeparateAudioOption() {
    const checkbox = document.getElementById('use-separate-audio');
    const deviceSelect = document.getElementById('audio-device-select');
    
    if (checkbox && deviceSelect) {
        deviceSelect.disabled = !checkbox.checked;
        if (checkbox.checked) {
            loadAudioDevices();
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
    
    // Calculate latency
    if (stats.connection.currentRoundTripTime) {
        const latency = (stats.connection.currentRoundTripTime * 1000).toFixed(0);
        document.getElementById('viewer-latency').textContent = `${latency} ms`;
    }
    
    // Calculate bitrate
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
 * Utility Functions
 */
function copyRoomCode() {
    navigator.clipboard.writeText(roomId).then(() => {
        // Show feedback
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

// Handle Enter key for room code input
roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

// Log browser support
console.log('WebRTC Support:', {
    getUserMedia: !!navigator.mediaDevices,
    getDisplayMedia: !!navigator.mediaDevices.getDisplayMedia,
    RTCPeerConnection: !!window.RTCPeerConnection,
    WebSocket: !!window.WebSocket
});
