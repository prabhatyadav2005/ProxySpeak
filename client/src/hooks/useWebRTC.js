// client/src/hooks/useWebRTC.js
import { useEffect, useRef, useState } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const MAX_EARSHOT_RADIUS = 100;
const TALKING_THRESHOLD = 25; // Decibel sensitivity threshold

export function useWebRTC(socketRef, localPositionRef, peersRef) {
  const localStream = useRef(null);
  const peerConnections = useRef(new Map());
  const audioNodes = useRef(new Map());
  const audioContext = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext.current = new AudioContextClass();
    }

    let analyser;
    let dataArray;
    let vadIntervalId;

    async function setupMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        localStream.current = stream;

        // VAD setup with AnalyserNode
        if (audioContext.current) {
          const micSource = audioContext.current.createMediaStreamSource(stream);
          analyser = audioContext.current.createAnalyser();
          analyser.fftSize = 256;
          micSource.connect(analyser);

          dataArray = new Uint8Array(analyser.frequencyBinCount);

          vadIntervalId = setInterval(() => {
            if (!localStream.current?.getAudioTracks()[0]?.enabled) {
              setIsSpeaking(false);
              return;
            }

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const speakingNow = average > TALKING_THRESHOLD;

            setIsSpeaking(speakingNow);

            if (socketRef.current?.connected) {
              socketRef.current.emit('voice-activity', { isSpeaking: speakingNow });
            }
          }, 120);
        }
      } catch (err) {
        console.warn('[WebRTC] Microphone access denied or not found:', err.message);
      }
    }

    setupMicrophone();

    return () => {
      if (vadIntervalId) clearInterval(vadIntervalId);
      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContext.current && audioContext.current.state !== 'closed') {
        audioContext.current.close();
      }
    };
  }, []);

  const updateSpatialAudio = (peerSocketId) => {
    const nodes = audioNodes.current.get(peerSocketId);
    const peer = peersRef.current?.get(peerSocketId);
    const local = localPositionRef.current;

    if (!nodes || !peer || !local || !audioContext.current) return 0;

    const dx = peer.x - local.x;
    const dy = peer.y - local.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Linear distance falloff: 100% at 0px down to 0% at 100px
    const volume = Math.max(0, Math.min(1, 1 - distance / MAX_EARSHOT_RADIUS));
    nodes.gainNode.gain.setValueAtTime(volume, audioContext.current.currentTime);

    // Directional stereo pan (-1 to 1)
    const panValue = Math.max(-1, Math.min(1, dx / MAX_EARSHOT_RADIUS));
    if (nodes.pannerNode && nodes.pannerNode.pan) {
      nodes.pannerNode.pan.setValueAtTime(panValue, audioContext.current.currentTime);
    }

    return Math.round(volume * 100);
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

    pc.ontrack = (event) => {
      if (!audioContext.current) return;
      if (audioContext.current.state === 'suspended') {
        audioContext.current.resume();
      }

      const remoteStream = event.streams[0];
      const audioSource = audioContext.current.createMediaStreamSource(remoteStream);
      const gainNode = audioContext.current.createGain();
      let pannerNode = null;

      if (audioContext.current.createStereoPanner) {
        pannerNode = audioContext.current.createStereoPanner();
        audioSource.connect(pannerNode);
        pannerNode.connect(gainNode);
      } else {
        audioSource.connect(gainNode);
      }

      gainNode.connect(audioContext.current.destination);
      audioNodes.current.set(peerSocketId, { gainNode, pannerNode });
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
    const nodes = audioNodes.current.get(peerSocketId);
    if (nodes) {
      if (nodes.gainNode) nodes.gainNode.disconnect();
      if (nodes.pannerNode) nodes.pannerNode.disconnect();
      audioNodes.current.delete(peerSocketId);
    }
  };

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleProximityEnter = async ({ peerSocketId, isInitiator }) => {
      const pc = createPeerConnection(peerSocketId);
      if (isInitiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { targetSocketId: peerSocketId, offer });
        } catch (err) {
          console.error('[WebRTC] Failed to create offer:', err);
        }
      }
    };

    const handleProximityLeave = ({ peerSocketId }) => {
      closePeerConnection(peerSocketId);
    };

    const handleOffer = async ({ senderSocketId, offer }) => {
      const pc = createPeerConnection(senderSocketId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { targetSocketId: senderSocketId, answer });
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer:', err);
      }
    };

    const handleAnswer = async ({ senderSocketId, answer }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('[WebRTC] Failed to set remote answer:', err);
        }
      }
    };

    const handleIceCandidate = async ({ senderSocketId, candidate }) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      }
    };

    socket.on('peer-entered-proximity', handleProximityEnter);
    socket.on('peer-left-proximity', handleProximityLeave);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIceCandidate);

    return () => {
      socket.off('peer-entered-proximity', handleProximityEnter);
      socket.off('peer-left-proximity', handleProximityLeave);
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-ice-candidate', handleIceCandidate);
    };
  }, [socketRef.current]);

  const toggleMute = () => {
    if (localStream.current) {
      const audioTracks = localStream.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        return audioTracks[0].enabled;
      }
    }
    return false;
  };

  return { toggleMute, updateSpatialAudio, isSpeaking };
}