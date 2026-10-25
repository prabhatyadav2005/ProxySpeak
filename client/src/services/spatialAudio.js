// client/src/services/spatialAudio.js

import {
    calculateDistance,
    calculateVolume,
    isSoundBlocked,
} from "../utils/distanceMath.js";

// Create the spatial audio system
export function createSpatialAudio() {
    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported by this browser.");
    }

    const audioContext = new AudioContextClass();
    const peers = new Map();

    // Connect one person's incoming audio stream
    async function connectPeer(peerId, mediaStream) {
        if (audioContext.state === "closed") {
            throw new Error("AudioContext is closed.");
        }

        // Avoid connecting the same peer twice
        if (peers.has(peerId)) {
            return;
        }

        const source = audioContext.createMediaStreamSource(mediaStream);
        const gain = audioContext.createGain();
        const panner = audioContext.createStereoPanner();
        const filter = audioContext.createBiquadFilter();

        // Low-pass filter makes blocked audio sound muffled
        filter.type = "lowpass";
        filter.frequency.value = 22000;

        // Initial settings
        gain.gain.value = 0;
        panner.pan.value = 0;

        // Audio pipeline:
        // Incoming voice -> Volume -> Left/Right -> Wall filter -> Speakers
        source.connect(gain);
        gain.connect(panner);
        panner.connect(filter);
        filter.connect(audioContext.destination);

        peers.set(peerId, {
            source,
            gain,
            panner,
            filter,
        });

        // AudioContext may need to be resumed after a user gesture
        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }
    }

    // Update volume and direction as people move
    function updatePeerSpatial(
        peerId,
        listener,
        speaker,
        obstacles = []
    ) {
        const peer = peers.get(peerId);

        if (!peer) {
            return;
        }

        // 1. Calculate distance
        const distance = calculateDistance(listener, speaker);

        // 2. Reduce volume with distance
        const volume = calculateVolume(distance, 100);

        const now = audioContext.currentTime;
        const rampDuration = 0.05;

        peer.gain.gain.cancelScheduledValues(now);
        peer.gain.gain.setValueAtTime(
            peer.gain.gain.value,
            now
        );

        peer.gain.gain.linearRampToValueAtTime(
            volume,
            now + rampDuration
        );

        // 3. Position sound on the left or right
        const horizontalOffset = speaker.x - listener.x;

        const pan = Math.max(
            -1,
            Math.min(1, horizontalOffset / 100)
        );

        peer.panner.pan.setTargetAtTime(
            pan,
            now,
            0.05
        );

        // 4. Check whether a wall blocks the sound
        const blocked = isSoundBlocked(
            listener,
            speaker,
            obstacles
        );

        // Blocked voice is muffled; clear voice sounds normal
        const targetFrequency = blocked ? 700 : 22000;

        peer.filter.frequency.setTargetAtTime(
            targetFrequency,
            now,
            0.05
        );
    }

    // Disconnect one person's audio
    function disconnectPeer(peerId) {
        const peer = peers.get(peerId);

        if (!peer) {
            return;
        }

        peer.source.disconnect();
        peer.gain.disconnect();
        peer.panner.disconnect();
        peer.filter.disconnect();

        peers.delete(peerId);
    }

    // Resume audio after a user interaction
    async function resume() {
        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }
    }

    // Clean up the entire audio system
    async function close() {
        for (const peerId of peers.keys()) {
            disconnectPeer(peerId);
        }

        if (audioContext.state !== "closed") {
            await audioContext.close();
        }
    }

    return {
        connectPeer,
        updatePeerSpatial,
        disconnectPeer,
        resume,
        close,
    };
}