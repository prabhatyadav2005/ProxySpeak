import { useCallback, useEffect, useRef } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function segmentIntersectsRect(a, b, rect) {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  let t0 = 0;
  let t1 = 1;

  const p = [-dx, dx, -dy, dy];
  const q = [
    a.x - left,
    right - a.x,
    a.y - top,
    bottom - a.y
  ];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];

      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }

  return true;
}

export function useWebRTC(socketRef, localPositionRef, peersRef) {
  const localStream = useRef(null);
  const peerConnections = useRef(new Map());
  const audioNodes = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const audioCtx = useRef(null);
  const attachedSocket = useRef(null);
  const mounted = useRef(true);

  const getAudioContext = useCallback(() => {
    if (!audioCtx.current) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported.');
      }

      audioCtx.current = new AudioContextClass();
    }

    return audioCtx.current;
  }, []);

  const updateSpatialAudio = useCallback((peerSocketId, furniture = []) => {
    const nodes = audioNodes.current.get(peerSocketId);
    const peer = peersRef.current?.get(peerSocketId);
    const local = localPositionRef.current;

    if (!nodes || !peer || !local || !audioCtx.current) return;

    const dx = peer.x - local.x;
    const dy = peer.y - local.y;
    const distance = Math.hypot(dx, dy);

    const maxRadius = 100;

    let volume = Math.max(
      0,
      Math.min(1, 1 - distance / maxRadius)
    );

    // Furniture and partition based audio dampening.
    for (const item of furniture) {
      const factor = Number(item.audioDampeningFactor) || 0;

      if (
        factor <= 0 ||
        !item.width ||
        !item.height
      ) continue;

      if (segmentIntersectsRect(local, peer, item)) {
        volume *= 1 - Math.min(1, Math.max(0, factor));
      }
    }

    const pan = Math.max(
      -1,
      Math.min(1, dx / maxRadius)
    );

    const now = audioCtx.current.currentTime;

    nodes.gain.gain.setTargetAtTime(volume, now, 0.05);
    nodes.panner.pan.setTargetAtTime(pan, now, 0.05);

  }, [localPositionRef, peersRef]);

  const closePeerConnection = useCallback((peerSocketId) => {
    const pc = peerConnections.current.get(peerSocketId);

    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();

      peerConnections.current.delete(peerSocketId);
    }

    const nodes = audioNodes.current.get(peerSocketId);

    if (nodes) {
      try {
        nodes.source.disconnect();
        nodes.panner.disconnect();
        nodes.gain.disconnect();
      } catch {
        // Already disconnected.
      }

      audioNodes.current.delete(peerSocketId);
    }

    pendingCandidates.current.delete(peerSocketId);

  }, []);

  const createPeerConnection = useCallback((peerSocketId) => {
    const existing = peerConnections.current.get(peerSocketId);

    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_SERVERS);

    peerConnections.current.set(peerSocketId, pc);
    pendingCandidates.current.set(peerSocketId, []);

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });
    }

    pc.onicecandidate = event => {
      const socket = socketRef.current;

      if (event.candidate && socket?.connected) {
        socket.emit('webrtc-ice-candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = event => {
      try {
        const context = getAudioContext();
        const stream = event.streams?.[0];

        if (!stream || audioNodes.current.has(peerSocketId)) return;

        if (context.state === 'suspended') {
          context.resume().catch(console.error);
        }

        const source = context.createMediaStreamSource(stream);
        const panner = context.createStereoPanner();
        const gain = context.createGain();

        source.connect(panner);
        panner.connect(gain);
        gain.connect(context.destination);

        audioNodes.current.set(peerSocketId, {
          source,
          panner,
          gain
        });

        updateSpatialAudio(peerSocketId);

      } catch (error) {
        console.error('[WebRTC] Remote audio setup failed:', error);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(
        `[WebRTC] Peer ${peerSocketId}:`,
        pc.connectionState
      );
    };

    return pc;

  }, [getAudioContext, socketRef, updateSpatialAudio]);

  const flushCandidates = useCallback(async (peerSocketId, pc) => {
    const queued =
      pendingCandidates.current.get(peerSocketId) || [];

    pendingCandidates.current.set(peerSocketId, []);

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error('[WebRTC] ICE queue error:', error);
      }
    }

  }, []);

  const attachSocket = useCallback((socket) => {
    if (!socket || attachedSocket.current === socket) return;

    if (attachedSocket.current) {
      const oldSocket = attachedSocket.current;

      oldSocket.off('peer-entered-proximity');
      oldSocket.off('peer-left-proximity');
      oldSocket.off('webrtc-offer');
      oldSocket.off('webrtc-answer');
      oldSocket.off('webrtc-ice-candidate');
    }

    attachedSocket.current = socket;

    socket.on('peer-entered-proximity', async ({
      peerSocketId,
      isInitiator
    }) => {
      try {
        const pc = createPeerConnection(peerSocketId);

        if (isInitiator && pc.signalingState === 'stable') {
          const offer = await pc.createOffer();

          await pc.setLocalDescription(offer);

          socket.emit('webrtc-offer', {
            targetSocketId: peerSocketId,
            offer: pc.localDescription
          });
        }

      } catch (error) {
        console.error('[WebRTC] Offer creation failed:', error);
      }
    });

    socket.on('peer-left-proximity', ({ peerSocketId }) => {
      closePeerConnection(peerSocketId);
    });

    socket.on('webrtc-offer', async ({
      senderSocketId,
      offer
    }) => {
      try {
        const pc = createPeerConnection(senderSocketId);

        await pc.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        await flushCandidates(senderSocketId, pc);

        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
          targetSocketId: senderSocketId,
          answer: pc.localDescription
        });

      } catch (error) {
        console.error('[WebRTC] Offer handling failed:', error);
      }
    });

    socket.on('webrtc-answer', async ({
      senderSocketId,
      answer
    }) => {
      try {
        const pc = peerConnections.current.get(senderSocketId);

        if (!pc) return;

        await pc.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        await flushCandidates(senderSocketId, pc);

      } catch (error) {
        console.error('[WebRTC] Answer handling failed:', error);
      }
    });

    socket.on('webrtc-ice-candidate', async ({
      senderSocketId,
      candidate
    }) => {
      const pc = peerConnections.current.get(senderSocketId);

      if (!pc || !candidate) return;

      if (!pc.remoteDescription) {
        const queue =
          pendingCandidates.current.get(senderSocketId) || [];

        queue.push(candidate);

        pendingCandidates.current.set(senderSocketId, queue);
        return;
      }

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error('[WebRTC] ICE candidate error:', error);
      }
    });

  }, [closePeerConnection, createPeerConnection, flushCandidates]);

  const startAudio = useCallback(async () => {
    try {
      const context = getAudioContext();

      if (context.state === 'suspended') {
        await context.resume();
      }

      if (!localStream.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });

        if (!mounted.current) {
          stream.getTracks().forEach(track => track.stop());
          return false;
        }

        localStream.current = stream;

        // Add microphone tracks to existing peer connections.
        peerConnections.current.forEach(pc => {
          stream.getTracks().forEach(track => {
            const alreadyAdded = pc.getSenders().some(
              sender => sender.track?.id === track.id
            );

            if (!alreadyAdded) {
              pc.addTrack(track, stream);
            }
          });
        });
      }

      const track = localStream.current.getAudioTracks()[0];

      if (track) track.enabled = true;

      return Boolean(track);

    } catch (error) {
      console.error('[WebRTC] Microphone access error:', error);
      return false;
    }

  }, [getAudioContext]);

  const toggleMute = useCallback(async () => {
    if (!localStream.current) {
      return startAudio();
    }

    const track = localStream.current.getAudioTracks()[0];

    if (!track) return false;

    track.enabled = !track.enabled;

    return track.enabled;

  }, [startAudio]);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;

      if (attachedSocket.current) {
        const socket = attachedSocket.current;

        socket.off('peer-entered-proximity');
        socket.off('peer-left-proximity');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');

        attachedSocket.current = null;
      }

      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();

      audioNodes.current.forEach(nodes => {
        try {
          nodes.source.disconnect();
          nodes.panner.disconnect();
          nodes.gain.disconnect();
        } catch {
          // Already disconnected.
        }
      });

      audioNodes.current.clear();
      pendingCandidates.current.clear();

      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
      }

      if (audioCtx.current) {
        audioCtx.current.close().catch(() => {});
        audioCtx.current = null;
      }
    };

  }, []);

  return {
    attachSocket,
    startAudio,
    toggleMute,
    updateSpatialAudio
  };
}

export default useWebRTC;