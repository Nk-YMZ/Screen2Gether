/**
 * WebRTC Manager - Handles all WebRTC connections for screen sharing
 * Supports 1080P@60fps with audio
 */

class WebRTCManager {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.localStream = null;
        this.peerConnections = new Map(); // viewerId -> RTCPeerConnection
        this.remoteStreams = new Map(); // viewerId -> MediaStream
        
        // Default ICE servers (国内可访问的 STUN 服务器)
        this.defaultIceServers = [
            { urls: 'stun:stun.miwifi.com:3478' },           // 小米
            { urls: 'stun:stun.chat.bilibili.com:3478' },   // B站
            { urls: 'stun:stun.hitv.com:3478' },            // 芒果TV
            { urls: 'stun:stun.syncthing.net:3478' },      // Syncthing
            { urls: 'stun:stun.l.google.com:19302' },       // Google (备用)
            { urls: 'stun:stun1.l.google.com:19302' }       // Google (备用)
        ];
        
        // Custom TURN/STUN servers (set by user)
        this.customIceServers = null;
        
        // Configuration for RTCPeerConnection
        this.rtcConfig = {
            iceServers: this.defaultIceServers,
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        // Video encoding settings
        this.videoSettings = {
            resolution: { width: 1920, height: 1080 },
            frameRate: 60,
            bitrate: 15000000, // 15 Mbps
            codec: 'vp9'
        };

        // Callbacks
        this.onRemoteStream = null;
        this.onConnectionStateChange = null;
        this.onStatsUpdate = null;
    }

    /**
     * Set custom TURN/STUN servers
     * @param {Object} config - { url, username, credential }
     */
    setCustomIceServers(config) {
        if (!config || !config.url) {
            // Reset to default
            this.customIceServers = null;
            this.rtcConfig.iceServers = this.defaultIceServers;
            console.log('Reset to default STUN servers');
            return;
        }
        
        const { url, username, credential } = config;
        
        // Parse URL to determine server type
        const iceServer = { urls: url };
        
        // Add credentials if provided (required for TURN)
        if (username) iceServer.username = username;
        if (credential) iceServer.credential = credential;
        
        // Set custom servers (include default STUN as fallback)
        this.customIceServers = [iceServer];
        
        // If it's a TURN server, also include STUN servers for efficiency
        if (url.toLowerCase().startsWith('turn:')) {
            this.rtcConfig.iceServers = [...this.defaultIceServers, iceServer];
            console.log('Configured TURN server with STUN fallback:', url);
        } else {
            // If it's a custom STUN, use it alone
            this.rtcConfig.iceServers = [iceServer];
            console.log('Configured custom STUN server:', url);
        }
    }
    
    /**
     * Get current ICE servers configuration
     */
    getIceServers() {
        return this.rtcConfig.iceServers;
    }

    /**
     * Update video settings
     */
    setVideoSettings(settings) {
        if (settings.resolution) {
            const [width, height] = settings.resolution.split('x').map(Number);
            this.videoSettings.resolution = { width, height };
        }
        if (settings.frameRate) {
            this.videoSettings.frameRate = parseInt(settings.frameRate);
        }
        if (settings.bitrate) {
            this.videoSettings.bitrate = parseInt(settings.bitrate) * 1000000;
        }
        if (settings.codec) {
            this.videoSettings.codec = settings.codec;
        }
    }

    /**
     * Capture screen with audio
     */
    async captureScreen(shareAudio = true) {
        try {
            const constraints = {
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor',
                    logicalSurface: true,
                    width: { ideal: this.videoSettings.resolution.width, max: 3840 },
                    height: { ideal: this.videoSettings.resolution.height, max: 2160 },
                    frameRate: { ideal: this.videoSettings.frameRate, max: 120 }
                },
                audio: shareAudio ? {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0
                } : false
            };

            this.localStream = await navigator.mediaDevices.getDisplayMedia(constraints);

            // Log actual settings
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                const settings = videoTrack.getSettings();
                console.log('Screen capture settings:', settings);
            }

            // Check if audio track was actually captured
            const audioTracks = this.localStream.getAudioTracks();
            console.log('Audio tracks captured:', audioTracks.length);
            
            if (shareAudio && audioTracks.length === 0) {
                console.warn('Audio was requested but no audio track was captured');
                console.warn('This is a known issue on Linux with some desktop environments');
                console.warn('The system audio sharing dialog may not have appeared');
                
                // Notify via callback if available
                if (this.onAudioCaptureFailed) {
                    this.onAudioCaptureFailed();
                }
            } else if (audioTracks.length > 0) {
                audioTracks.forEach((track, index) => {
                    console.log(`Audio track ${index}:`, track.label, track.getSettings());
                });
            }

            // Handle stream end (user clicked stop sharing)
            this.localStream.getVideoTracks()[0].onended = () => {
                console.log('Screen sharing ended by user');
                this.stopAllConnections();
                if (this.onConnectionStateChange) {
                    this.onConnectionStateChange('disconnected', 'Screen sharing ended');
                }
            };

            return this.localStream;
        } catch (error) {
            console.error('Error capturing screen:', error);
            throw error;
        }
    }

    /**
     * Add microphone audio as fallback (when system audio is not available)
     */
    async addMicrophoneAudio() {
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            const audioTrack = audioStream.getAudioTracks()[0];
            
            if (this.localStream && audioTrack) {
                // Remove any existing audio tracks
                this.localStream.getAudioTracks().forEach(track => track.stop());
                
                // Add microphone track
                this.localStream.addTrack(audioTrack);
                console.log('Microphone audio added as fallback');
                
                // Update all peer connections with the new audio track
                this.peerConnections.forEach(async (pc, viewerId) => {
                    const senders = pc.getSenders();
                    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                    
                    if (audioSender) {
                        await audioSender.replaceTrack(audioTrack);
                    } else {
                        pc.addTrack(audioTrack, this.localStream);
                    }
                });
                
                return true;
            }
        } catch (error) {
            console.error('Error adding microphone audio:', error);
        }
        return false;
    }

    /**
     * Capture screen and audio separately, then merge them
     * This is useful for Linux where system audio capture via getDisplayMedia may not work
     * Use this with PipeWire virtual audio devices
     */
    async captureScreenWithSeparateAudio(audioDeviceId = null) {
        try {
            // First capture screen (without audio request to avoid dialog issues)
            const screenConstraints = {
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor',
                    logicalSurface: true,
                    width: { ideal: this.videoSettings.resolution.width, max: 3840 },
                    height: { ideal: this.videoSettings.resolution.height, max: 2160 },
                    frameRate: { ideal: this.videoSettings.frameRate, max: 120 }
                },
                audio: false  // Don't request audio with screen capture
            };

            this.localStream = await navigator.mediaDevices.getDisplayMedia(screenConstraints);
            console.log('Screen captured successfully');

            // Now capture audio from a specific device (or default)
            const audioConstraints = {
                video: false,
                audio: {
                    deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0
                }
            };

            const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            const audioTracks = audioStream.getAudioTracks();
            
            if (audioTracks.length > 0) {
                // Add audio tracks to the main stream
                audioTracks.forEach(track => {
                    this.localStream.addTrack(track);
                    console.log('Audio track added:', track.label, track.getSettings());
                });
            } else {
                console.warn('No audio tracks captured from the specified device');
            }

            // Handle stream end
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.onended = () => {
                    console.log('Screen sharing ended by user');
                    this.stopAllConnections();
                    if (this.onConnectionStateChange) {
                        this.onConnectionStateChange('disconnected', 'Screen sharing ended');
                    }
                };
            }

            return this.localStream;
        } catch (error) {
            console.error('Error in captureScreenWithSeparateAudio:', error);
            throw error;
        }
    }

    /**
     * Get list of available audio input devices
     */
    async getAudioInputDevices() {
        try {
            // Request permission first
            await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                .then(stream => stream.getTracks().forEach(t => t.stop()));
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'audioinput');
        } catch (error) {
            console.error('Error getting audio devices:', error);
            return [];
        }
    }

    /**
     * Check if audio is being captured
     */
    hasAudioTrack() {
        return this.localStream && this.localStream.getAudioTracks().length > 0;
    }

    /**
     * Stop screen capture
     */
    stopScreenCapture() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    /**
     * Create peer connection for a viewer
     */
    async createPeerConnection(viewerId) {
        const pc = new RTCPeerConnection(this.rtcConfig);

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.send({
                    type: 'ice-candidate',
                    payload: {
                        targetId: viewerId,
                        candidate: event.candidate.toJSON()
                    }
                });
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`Connection state for ${viewerId}: ${pc.connectionState}`);
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(pc.connectionState, viewerId);
            }
        };

        // Handle ICE connection state changes
        pc.oniceconnectionstatechange = () => {
            console.log(`ICE connection state for ${viewerId}: ${pc.iceConnectionState}`);
        };

        this.peerConnections.set(viewerId, pc);

        // Set video codec and parameters
        await this.configureVideoSender(pc);

        return pc;
    }

    /**
     * Configure video sender with codec and encoding parameters
     */
    async configureVideoSender(pc) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        
        if (videoSender) {
            // Set encoding parameters
            const parameters = videoSender.getParameters();
            if (!parameters.encodings) {
                parameters.encodings = [{}];
            }
            
            parameters.encodings[0] = {
                ...parameters.encodings[0],
                maxBitrate: this.videoSettings.bitrate,
                maxFramerate: this.videoSettings.frameRate,
                priority: 'high',
                networkPriority: 'high'
            };

            // Set codec preference
            const capabilities = RTCRtpSender.getCapabilities('video');
            if (capabilities) {
                let codecIndex = capabilities.codecs.findIndex(c => 
                    c.mimeType.toLowerCase() === `video/${this.videoSettings.codec}`
                );
                
                if (codecIndex !== -1) {
                    parameters.codecs = [capabilities.codecs[codecIndex]];
                }
            }

            try {
                await videoSender.setParameters(parameters);
                console.log('Video sender configured:', parameters);
            } catch (e) {
                console.warn('Could not set sender parameters:', e);
            }
        }
    }

    /**
     * Create and send offer to a viewer
     */
    async createOffer(viewerId) {
        const pc = this.peerConnections.get(viewerId);
        if (!pc) {
            await this.createPeerConnection(viewerId);
        }

        const peerConnection = this.peerConnections.get(viewerId);

        const offerOptions = {
            offerToReceiveVideo: false,
            offerToReceiveAudio: false
        };

        try {
            const offer = await peerConnection.createOffer(offerOptions);
            
            // Set preferred codec in SDP
            let sdp = offer.sdp;
            if (this.videoSettings.codec === 'vp9') {
                sdp = this.preferCodec(sdp, 'VP9');
            } else if (this.videoSettings.codec === 'h264') {
                sdp = this.preferCodec(sdp, 'H264');
            }
            offer.sdp = sdp;

            await peerConnection.setLocalDescription(offer);

            this.signaling.send({
                type: 'offer',
                payload: {
                    targetId: viewerId,
                    offer: offer
                }
            });

            console.log('Offer sent to:', viewerId);
        } catch (error) {
            console.error('Error creating offer:', error);
            throw error;
        }
    }

    /**
     * Handle incoming offer (for viewer)
     */
    async handleOffer(offer, hostId) {
        const pc = new RTCPeerConnection(this.rtcConfig);

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            const stream = event.streams[0];
            if (stream) {
                this.remoteStreams.set(hostId, stream);
                if (this.onRemoteStream) {
                    this.onRemoteStream(stream);
                }
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.send({
                    type: 'ice-candidate',
                    payload: {
                        targetId: hostId,
                        candidate: event.candidate.toJSON()
                    }
                });
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`Connection state: ${pc.connectionState}`);
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(pc.connectionState, 'host');
            }
        };

        this.peerConnections.set(hostId, pc);

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.signaling.send({
                type: 'answer',
                payload: {
                    targetId: hostId,
                    answer: answer
                }
            });

            console.log('Answer sent to host');
        } catch (error) {
            console.error('Error handling offer:', error);
            throw error;
        }
    }

    /**
     * Handle incoming answer (for host)
     */
    async handleAnswer(answer, viewerId) {
        const pc = this.peerConnections.get(viewerId);
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Answer set for viewer:', viewerId);
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    async handleIceCandidate(candidate, peerId) {
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }

    /**
     * Close connection with a specific peer
     */
    closeConnection(peerId) {
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(peerId);
        }
        this.remoteStreams.delete(peerId);
    }

    /**
     * Stop all connections
     */
    stopAllConnections() {
        this.peerConnections.forEach((pc, id) => {
            pc.close();
        });
        this.peerConnections.clear();
        this.remoteStreams.clear();
        this.stopScreenCapture();
    }

    /**
     * Get connection statistics
     */
    async getStats(peerId) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) return null;

        try {
            const stats = await pc.getStats();
            const result = {
                video: {},
                audio: {},
                connection: {}
            };

            let inboundVideoTrackId = null;

            stats.forEach(report => {
                // 出站视频 (主播端)
                if (report.type === 'outbound-rtp' && report.kind === 'video') {
                    result.video.bytesSent = report.bytesSent;
                    result.video.packetsSent = report.packetsSent;
                    result.video.framesEncoded = report.framesEncoded;
                    result.video.framesSent = report.framesSent;
                }
                // 入站视频 (观众端)
                else if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    result.video.bytesReceived = report.bytesReceived;
                    result.video.packetsReceived = report.packetsReceived;
                    result.video.packetsLost = report.packetsLost;
                    result.video.framesDecoded = report.framesDecoded;
                    result.video.framesReceived = report.framesReceived;
                    result.video.jitter = report.jitter;
                    // 获取关联的 track ID
                    if (report.trackId) {
                        inboundVideoTrackId = report.trackId;
                    }
                }
                // 候选对连接信息
                else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    result.connection.currentRoundTripTime = report.currentRoundTripTime;
                    result.connection.availableBitrate = report.availableBitrate;
                }
                // 本地视频轨道信息 (主播端分辨率/帧率)
                else if (report.type === 'media-source' && report.kind === 'video') {
                    result.video.frameWidth = report.width;
                    result.video.frameHeight = report.height;
                    result.video.framesPerSecond = report.framesPerSecond;
                }
            });

            // 观众端：通过 inbound-rtp 的 trackId 找到对应的 track report
            if (inboundVideoTrackId) {
                stats.forEach(report => {
                    if (report.type === 'track' && report.id === inboundVideoTrackId) {
                        result.video.frameWidth = report.frameWidth;
                        result.video.frameHeight = report.frameHeight;
                        // framesPerSecond 可能在不同浏览器中字段名不同
                        result.video.framesPerSecond = report.framesPerSecond 
                            || report.frameRate 
                            || (report.frameWidth ? 60 : undefined);
                    }
                });
            }

            // 备用：如果没有找到 track，尝试从 inbound-rtp 直接获取（某些浏览器支持）
            if (!result.video.frameWidth) {
                stats.forEach(report => {
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        // 某些浏览器在 inbound-rtp 中直接包含分辨率信息
                        if (report.frameWidth) {
                            result.video.frameWidth = report.frameWidth;
                            result.video.frameHeight = report.frameHeight;
                        }
                    }
                });
            }

            return result;
        } catch (error) {
            console.error('Error getting stats:', error);
            return null;
        }
    }

    /**
     * Prefer specific codec in SDP
     */
    preferCodec(sdp, codec) {
        const lines = sdp.split('\n');
        const mLineIndex = lines.findIndex(line => line.startsWith('m=video'));
        
        if (mLineIndex === -1) return sdp;

        const codecLines = lines.filter(line => 
            line.startsWith('a=rtpmap:') && line.toLowerCase().includes(codec.toLowerCase())
        );

        if (codecLines.length === 0) return sdp;

        const codecNum = codecLines[0].match(/a=rtpmap:(\d+)/)[1];
        const mLine = lines[mLineIndex].split(' ');

        // Move preferred codec to front
        const payloadTypes = mLine.slice(3);
        const preferredIndex = payloadTypes.indexOf(codecNum);
        if (preferredIndex > 0) {
            payloadTypes.splice(preferredIndex, 1);
            payloadTypes.unshift(codecNum);
            lines[mLineIndex] = mLine.slice(0, 3).concat(payloadTypes).join(' ');
        }

        return lines.join('\n');
    }
}

// Export for use
window.WebRTCManager = WebRTCManager;
