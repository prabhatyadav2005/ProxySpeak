// client/src/hooks/useWebRTC.js
import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

const DEFAULT_EARSHOT_RADIUS = 130;
const SPEAKING_THRESHOLD = 0.04;

export function useWebRTC({
  socket,
  localPositionRef,
  peersRef,
  initialMuted = false,
  earshotRadius = DEFAULT_EARSHOT_RADIUS
}) {
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isDeafened, setIsDeafened] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [micError, setMicError] = useState(null);
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

  const localStreamRef = useRef(null);
  const peerConnections = useRef(new Map()); // Map<peerSocketId, RTCPeerConnection>
  const pendingIceCandidates = useRef(new Map()); // Map<peerSocketId, RTCIceCandidate[]>

  // Web Audio Context & Spatial Processing Nodes
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const peerSpatialNodes = useRef(new Map()); // Map<peerSocketId, { gainNode, pannerNode, analyserNode, sourceNode }>

  // Track speaking state debounce
  const speakingDebounceRef = useRef(null);

  // Initialize Web Audio Context safely
  const ensureAudioContext = useCallback(async () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
          const master = audioCtxRef.current.createGain();
          master.connect(audioCtxRef.current.destination);
          masterGainRef.current = master;
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
    } catch (e) {
      console.warn('[WebAudio] AudioContext resume failed:', e);
    }
  }, []);

  // Synthetic Proximity Audio Chime (indicates voice earshot entry)
  const playProximityChime = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state !== 'running') return;
    try {
      const now = audioCtxRef.current.currentTime;
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {}
  }, []);

  // Update spatial audio parameters (attenuation + stereo panning) for a specific peer
  const updateSpatialAudio = useCallback((peerSocketId) => {
    const nodes = peerSpatialNodes.current.get(peerSocketId);
    if (!nodes || !peersRef.current || !localPositionRef.current) return;

    const peer = peersRef.current.get(peerSocketId);
    const local = localPositionRef.current;
    if (!peer || !local) return;

    const dx = peer.x - local.x;
    const dy = peer.y - local.y;
    const distance = Math.hypot(dx, dy);

    const radius = earshotRadius || DEFAULT_EARSHOT_RADIUS;

    // Linear to smooth exponential distance attenuation
    let volume = 0;
    if (distance < radius) {
      const normalized = 1 - distance / radius;
      // Exponential ease-out for realistic acoustic drop-off
      volume = Math.max(0, Math.min(1, Math.pow(normalized, 1.4)));
    }

    // Stereo panning (-1 left, 0 center, 1 right)
    let pan = 0;
    if (radius > 0) {
      pan = Math.max(-1, Math.min(1, dx / radius));
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      const currentTime = audioCtxRef.current.currentTime;
      // Smooth parameter transition to eliminate pops or clicks
      if (nodes.gainNode) {
        nodes.gainNode.gain.setTargetAtTime(volume, currentTime, 0.05);
      }
      if (nodes.pannerNode && nodes.pannerNode.pan) {
        nodes.pannerNode.pan.setTargetAtTime(pan, currentTime, 0.05);
      }
    }
  }, [earshotRadius, localPositionRef, peersRef]);

  // Update all connected peers when local avatar moves
  const updateAllSpatialAudio = useCallback(() => {
    peerSpatialNodes.current.forEach((_, peerSocketId) => {
      updateSpatialAudio(peerSocketId);
    });
  }, [updateSpatialAudio]);

  // Flush queued ICE candidates after remote description is set
  const processQueuedCandidates = useCallback(async (peerSocketId, pc) => {
    const queue = pendingIceCandidates.current.get(peerSocketId);
    if (queue && queue.length > 0) {
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('[WebRTC] Error adding queued ICE candidate:', err);
        }
      }
      pendingIceCandidates.current.delete(peerSocketId);
    }
  }, []);

  // Create or retrieve an RTCPeerConnection for a given peer
  const createPeerConnection = useCallback((peerSocketId) => {
    if (peerConnections.current.has(peerSocketId)) {
      return peerConnections.current.get(peerSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Attach local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE Candidate Handler
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        socket.emit('webrtc-ice-candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    // Connection state monitoring & auto-recovery
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`[WebRTC] Peer ${peerSocketId} connection state: ${pc.connectionState}`);
      }
    };

    // Incoming Remote Audio Track Handler
    pc.ontrack = (event) => {
      ensureAudioContext().then(() => {
        if (!audioCtxRef.current || !masterGainRef.current) return;

        const remoteStream = event.streams[0];
        const sourceNode = audioCtxRef.current.createMediaStreamSource(remoteStream);
        const pannerNode = audioCtxRef.current.createStereoPanner();
        const gainNode = audioCtxRef.current.createGain();
        const analyserNode = audioCtxRef.current.createAnalyser();
        analyserNode.fftSize = 64;

        // Pipeline: Remote Stream -> Stereo Panner -> Proximity Gain -> Analyser -> Master Gain -> Speakers
        sourceNode.connect(pannerNode);
        pannerNode.connect(gainNode);
        gainNode.connect(analyserNode);
        analyserNode.connect(masterGainRef.current);

        peerSpatialNodes.current.set(peerSocketId, {
          sourceNode,
          pannerNode,
          gainNode,
          analyserNode,
          remoteStream
        });

        updateSpatialAudio(peerSocketId);
      });
    };

    peerConnections.current.set(peerSocketId, pc);
    return pc;
  }, [ensureAudioContext, socket, updateSpatialAudio]);

  // Clean up a specific peer's WebRTC connection & audio nodes
  const closePeerConnection = useCallback((peerSocketId) => {
    const pc = peerConnections.current.get(peerSocketId);
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch (err) {
        console.warn('[WebRTC] Error closing peer connection:', err);
      }
      peerConnections.current.delete(peerSocketId);
    }

    pendingIceCandidates.current.delete(peerSocketId);

    const nodes = peerSpatialNodes.current.get(peerSocketId);
    if (nodes) {
      try {
        nodes.sourceNode?.disconnect();
        nodes.pannerNode?.disconnect();
        nodes.gainNode?.disconnect();
        nodes.analyserNode?.disconnect();
      } catch (e) {}
      peerSpatialNodes.current.delete(peerSocketId);
    }
  }, []);

  // Request Microphone Access & Setup Local Audio Analyser
  useEffect(() => {
    let animationFrameId;
    let isMounted = true;

    async function initMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setHasMicPermission(true);
        setMicError(null);

        // Apply initial muted state
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !initialMuted;
        }

        // Setup local audio analyser for voice activity detection (VAD)
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContextClass();
            const master = audioCtxRef.current.createGain();
            master.connect(audioCtxRef.current.destination);
            masterGainRef.current = master;
          }

          const localSource = audioCtxRef.current.createMediaStreamSource(stream);
          const analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.5;
          localSource.connect(analyser);
          localAnalyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const checkLocalVoiceActivity = () => {
            if (!localAnalyserRef.current || !localStreamRef.current) return;
            const track = localStreamRef.current.getAudioTracks()[0];

            if (!track || !track.enabled) {
              setLocalAudioLevel(0);
              setIsLocalSpeaking(false);
              animationFrameId = requestAnimationFrame(checkLocalVoiceActivity);
              return;
            }

            localAnalyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length / 255;
            setLocalAudioLevel(Math.round(average * 100) / 100);

            const isSpeakingNow = average > SPEAKING_THRESHOLD;
            setIsLocalSpeaking(isSpeakingNow);

            if (socket && socket.connected) {
              // Debounce or throttle socket speaking indicator
              if (isSpeakingNow !== speakingDebounceRef.current) {
                speakingDebounceRef.current = isSpeakingNow;
                socket.emit('user-speaking', {
                  isSpeaking: isSpeakingNow,
                  audioLevel: Math.round(average * 100) / 100
                });
              }
            }

            animationFrameId = requestAnimationFrame(checkLocalVoiceActivity);
          };

          animationFrameId = requestAnimationFrame(checkLocalVoiceActivity);
        }
      } catch (err) {
        console.warn('[WebRTC] Microphone access error:', err.message);
        if (isMounted) {
          setHasMicPermission(false);
          setMicError(err.message || 'Microphone unavailable');
        }
      }
    }

    initMicrophone();

    return () => {
      isMounted = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [initialMuted, socket]);

  // Listen to Socket Signaling Events
  useEffect(() => {
    if (!socket) return;

    // 1. Peer entered proximity -> Establish WebRTC P2P
    const handlePeerEnteredProximity = async ({ peerSocketId, isInitiator }) => {
      await ensureAudioContext();
      playProximityChime();
      const pc = createPeerConnection(peerSocketId);

      if (isInitiator) {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true
          });
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { targetSocketId: peerSocketId, offer });
        } catch (err) {
          console.error('[WebRTC] Error creating offer:', err);
        }
      }
    };

    // 2. Peer left proximity -> Teardown P2P
    const handlePeerLeftProximity = ({ peerSocketId }) => {
      closePeerConnection(peerSocketId);
    };

    // 3. Incoming Offer -> Answer
    const handleWebRTCOffer = async ({ senderSocketId, offer }) => {
      await ensureAudioContext();
      const pc = createPeerConnection(senderSocketId);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await processQueuedCandidates(senderSocketId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { targetSocketId: senderSocketId, answer });
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    };

    // 4. Incoming Answer
    const handleWebRTCAnswer = async ({ senderSocketId, answer }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await processQueuedCandidates(senderSocketId, pc);
        } catch (err) {
          console.error('[WebRTC] Error setting remote description from answer:', err);
        }
      }
    };

    // 5. Incoming ICE Candidate
    const handleWebRTCIceCandidate = async ({ senderSocketId, candidate }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      } else {
        // Queue candidate until remote description is set
        if (!pendingIceCandidates.current.has(senderSocketId)) {
          pendingIceCandidates.current.set(senderSocketId, []);
        }
        pendingIceCandidates.current.get(senderSocketId).push(candidate);
      }
    };

    // 6. Distance updates from server
    const handlePeerDistanceUpdate = ({ peerSocketId }) => {
      updateSpatialAudio(peerSocketId);
    };

    socket.on('peer-entered-proximity', handlePeerEnteredProximity);
    socket.on('peer-left-proximity', handlePeerLeftProximity);
    socket.on('webrtc-offer', handleWebRTCOffer);
    socket.on('webrtc-answer', handleWebRTCAnswer);
    socket.on('webrtc-ice-candidate', handleWebRTCIceCandidate);
    socket.on('peer-distance-update', handlePeerDistanceUpdate);

    return () => {
      socket.off('peer-entered-proximity', handlePeerEnteredProximity);
      socket.off('peer-left-proximity', handlePeerLeftProximity);
      socket.off('webrtc-offer', handleWebRTCOffer);
      socket.off('webrtc-answer', handleWebRTCAnswer);
      socket.off('webrtc-ice-candidate', handleWebRTCIceCandidate);
      socket.off('peer-distance-update', handlePeerDistanceUpdate);

      // Clean up all peer connections
      peerConnections.current.forEach((_, peerId) => {
        closePeerConnection(peerId);
      });
    };
  }, [socket, ensureAudioContext, createPeerConnection, closePeerConnection, processQueuedCandidates, updateSpatialAudio]);

  // Toggle Microphone Mute
  const toggleMute = useCallback((forcedState) => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const nextState = typeof forcedState === 'boolean' ? forcedState : !isMuted;
        audioTrack.enabled = !nextState;
        setIsMuted(nextState);

        if (socket && socket.connected) {
          socket.emit('user-mute-status', { isMuted: nextState });
        }
        return nextState;
      }
    }
    const fallbackState = typeof forcedState === 'boolean' ? forcedState : !isMuted;
    setIsMuted(fallbackState);
    return fallbackState;
  }, [isMuted, socket]);

  // Toggle Deafen (Mute all incoming audio)
  const toggleDeafen = useCallback(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      const nextDeaf = !isDeafened;
      masterGainRef.current.gain.setTargetAtTime(
        nextDeaf ? 0 : 1,
        audioCtxRef.current.currentTime,
        0.05
      );
      setIsDeafened(nextDeaf);
      return nextDeaf;
    }
    return false;
  }, [isDeafened]);

  return {
    isMuted,
    isDeafened,
    hasMicPermission,
    micError,
    localAudioLevel,
    isLocalSpeaking,
    toggleMute,
    toggleDeafen,
    updateSpatialAudio,
    updateAllSpatialAudio,
    ensureAudioContext
  };
}

export default useWebRTC;
