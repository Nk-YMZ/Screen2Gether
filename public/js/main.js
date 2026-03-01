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

    // Update WebRTC settings
    webrtc.setVideoSettings({
        resolution,
        frameRate,
        bitrate,
        codec
    });

    try {
        const stream = await webrtc.captureScreen(shareAudio);
        
        // Show preview
        localPreview.srcObject = stream;
        previewSection.style.display = 'block';
        startShareBtn.style.display = 'none';
        stopShareBtn.style.display = 'block';
        hostStats.style.display = 'block';

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