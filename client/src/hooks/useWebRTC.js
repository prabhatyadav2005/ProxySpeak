// client/src/hooks/useWebRTC.js
import { useEffect, useRef } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function useWebRTC(socketRef, localPositionRef, peersRef) {
  const localStream = useRef(null);
  const peerConnections = useRef(new Map());
  
  // Web Audio API context for Member 4's spatial processing
  const audioCtx = useRef(null);
  const panners = useRef(new Map()); // Map<peerSocketId, { gainNode, pannerNode }>

  useEffect(() => {
    // Initialize Web Audio Context
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();

    async function initMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
        localStream.current = stream;
      } catch (err) {
        console.error('[WebRTC] Microphone access error:', err);
      }
    }

    initMicrophone();

    return () => {
      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => track.stop());
      }
      if (audioCtx.current) {
        audioCtx.current.close();
      }
    };
  }, []);

  // Update volume and left/right pan based on real-time distances
  const updateSpatialAudio = (peerSocketId) => {
    const pannerObj = panners.current.get(peerSocketId);
    const peer = peersRef.current.get(peerSocketId);
    const local = localPositionRef.current;

    if (!pannerObj || !peer || !local) return;

    const dx = peer.x - local.x;
    const dy = peer.y - local.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Member 4: Distance Attenuation (Earshot radius = 100px)
    const maxRadius = 100;
    const volume = Math.max(0, Math.min(1, 1 - distance / maxRadius));
    pannerObj.gainNode.gain.setValueAtTime(volume, audioCtx.current.currentTime);

    // Member 4: Stereo Panning (-1 = full left, +1 = full right)
    const panValue = Math.max(-1, Math.min(1, dx / maxRadius));
    if (pannerObj.pannerNode.pan) {
      pannerObj.pannerNode.pan.setValueAtTime(panValue, audioCtx.current.currentTime);
    }
  };

  const createPeerConnection = (peerSocketId) => {
    if (peerConnections.current.has(peerSocketId)) {
      return peerConnections.current.get(peerSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc-ice-candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    // When remote voice stream arrives, attach Member 4's spatial audio graph
    pc.ontrack = (event) => {
      if (!audioCtx.current) return;
      if (audioCtx.current.state === 'suspended') {
        audioCtx.current.resume();
      }

      const source = audioCtx.current.createMediaStreamSource(event.streams[0]);
      const gainNode = audioCtx.current.createGain();
      const pannerNode = audioCtx.current.createStereoPanner();

      // Route: Source -> Panner -> Gain -> Speakers
      source.connect(pannerNode);
      pannerNode.connect(gainNode);
      gainNode.connect(audioCtx.current.destination);

      panners.current.set(peerSocketId, { gainNode, pannerNode });
      updateSpatialAudio(peerSocketId);
    };

    peerConnections.current.set(peerSocketId, pc);
    return pc;
  };

  const closePeerConnection = (peerSocketId) => {
    const pc = peerConnections.current.get(peerSocketId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(peerSocketId);
    }
    panners.current.delete(peerSocketId);
  };

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('peer-entered-proximity', async ({ peerSocketId, isInitiator }) => {
      const pc = createPeerConnection(peerSocketId);
      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { targetSocketId: peerSocketId, offer });
      }
    });

    socket.on('peer-left-proximity', ({ peerSocketId }) => {
      closePeerConnection(peerSocketId);
    });

    socket.on('webrtc-offer', async ({ senderSocketId, offer }) => {
      const pc = createPeerConnection(senderSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { targetSocketId: senderSocketId, answer });
    });

    socket.on('webrtc-answer', async ({ senderSocketId, answer }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('webrtc-ice-candidate', async ({ senderSocketId, candidate }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.off('peer-entered-proximity');
      socket.off('peer-left-proximity');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
    };
  }, [socketRef]);

  const toggleMute = () => {
    if (localStream.current) {
      const track = localStream.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        return track.enabled;
      }
    }
    return false;
  };

  return { toggleMute, updateSpatialAudio };
}