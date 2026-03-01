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
        
        // Configuration for RTCPeerConnection
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
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

            stats.forEach(report => {
                if (report.type === 'outbound-rtp' && report.kind === 'video') {
                    result.video = {
                        bytesSent: report.bytesSent,
                        packetsSent: report.packetsSent,
                        framesEncoded: report.framesEncoded,
                        framesSent: report.framesSent,
                        frameWidth: report.frameWidth,
                        frameHeight: report.frameHeight,
                        framesPerSecond: report.framesPerSecond,
                        bitrate: report.bitrate || 0
                    };
                } else if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    result.video = {
                        bytesReceived: report.bytesReceived,
                        packetsReceived: report.packetsReceived,
                        packetsLost: report.packetsLost,
                        framesDecoded: report.framesDecoded,
                        framesReceived: report.framesReceived,
                        frameWidth: report.frameWidth,
                        frameHeight: report.frameHeight,
                        framesPerSecond: report.framesPerSecond,
                        jitter: report.jitter,
                        bitrate: report.bitrate || 0
                    };
                } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    result.connection = {
                        currentRoundTripTime: report.currentRoundTripTime,
                        availableBitrate: report.availableBitrate
                    };
                }
            });

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