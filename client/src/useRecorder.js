import { useState, useRef, useCallback, useEffect } from 'react';

// Custom hook for audio recording with MediaRecorder
export const useRecorder = (onAudioData) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioStreamRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const isRecordingRef = useRef(false);

  // Initialize audio context and get microphone access
  const initializeAudio = useCallback(async () => {
    try {
      // Get microphone stream with optimal settings for AssemblyAI
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      audioStreamRef.current = stream;
      
      // Create audio context with 16kHz sample rate
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      setIsInitialized(true);
      setError(null);
      return true;
    } catch (error) {
      setError('Microphone access denied. Please allow microphone access.');
      setIsInitialized(false);
      return false;
    }
  }, []);

  // Convert Float32Array to 16kHz mono PCM base64
  const convertToBase64 = useCallback((float32Array) => {
    // Convert to Int16Array for 16-bit PCM
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Convert from [-1, 1] to [-32768, 32767]
      int16Array[i] = Math.max(-32768, Math.min(32767, float32Array[i] * 32768));
    }
    
    // Convert to base64
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) {
      return false;
    }

    try {
      setError(null);

      // Initialize audio if not already done
      if (!isInitialized || !audioContextRef.current || !audioStreamRef.current) {
        const initialized = await initializeAudio();
        if (!initialized) {
          return false;
        }
      }

      // Check if audio context is still valid
      if (audioContextRef.current.state === 'closed') {
        const initialized = await initializeAudio();
        if (!initialized) {
          return false;
        }
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Load the audio worklet processor
      await audioContextRef.current.audioWorklet.addModule('/audio-processor.js');

      // Create audio source and worklet processor
      const source = audioContextRef.current.createMediaStreamSource(audioStreamRef.current);
      const processor = new AudioWorkletNode(audioContextRef.current, 'audio-processor');

      // Handle audio data from the worklet
      processor.port.onmessage = (event) => {
        if (isRecordingRef.current && onAudioData) {
          const inputData = event.data; // Float32Array audio data
          
          // Convert to base64 and send (same conversion logic)
          const base64Audio = convertToBase64(inputData);
          onAudioData(base64Audio);
        }
      };

      // Connect audio nodes
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      // Store references
      sourceRef.current = source;
      processorRef.current = processor;
      mediaRecorderRef.current = processor;

      // Update both state and ref
      isRecordingRef.current = true;
      setIsRecording(true);
      return true;
    } catch (error) {
      setError('Failed to start recording. Please try again.');
      return false;
    }
  }, [isInitialized, initializeAudio, onAudioData, convertToBase64]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) {
      return;
    }

    try {
      // Update both ref and state FIRST
      isRecordingRef.current = false;
      setIsRecording(false);

      // Disconnect audio processor
      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch (e) {
          // Warning: Error disconnecting audio processor
        }
        processorRef.current = null;
      }

      // Disconnect audio source
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          // Warning: Error disconnecting audio source
        }
        sourceRef.current = null;
      }

      // CRITICAL: Stop all MediaStream tracks to stop microphone access
      if (audioStreamRef.current) {
        try {
          const tracks = audioStreamRef.current.getTracks();
          tracks.forEach(track => {
            track.stop();
          });
        } catch (e) {
          // Warning: Error stopping MediaStream tracks
        }
        audioStreamRef.current = null;
      }

      // Clear processor reference
      mediaRecorderRef.current = null;
      setError(null);
      
    } catch (error) {
      setError('Error stopping recording');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop recording if active
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        setIsRecording(false);
      }
      
      // Disconnect audio nodes
      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch (e) {
          // Warning: Error disconnecting processor during cleanup
        }
        processorRef.current = null;
      }
      
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          // Warning: Error disconnecting source during cleanup
        }
        sourceRef.current = null;
      }
      
      // Stop all audio tracks and close audio context only on unmount
      if (audioStreamRef.current) {
        const tracks = audioStreamRef.current.getTracks();
        tracks.forEach((track, index) => {
          try {
            if (track.readyState === 'live') {
              track.stop();
            }
          } catch (e) {
            // Warning: Error stopping track during cleanup
          }
        });
        audioStreamRef.current = null;
      }
      
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
          }
        } catch (e) {
          // Warning: Error closing audio context during cleanup
        }
        audioContextRef.current = null;
      }
      
      // Clear all references
      mediaRecorderRef.current = null;
      setIsInitialized(false);
    };
  }, []); // Empty dependency array - only run on unmount

  // Force stop recording (emergency stop)
  const forceStopRecording = useCallback(() => {
    // Update state immediately
    isRecordingRef.current = false;
    setIsRecording(false);
    
    // Stop all tracks immediately
    if (audioStreamRef.current) {
      const tracks = audioStreamRef.current.getTracks();
      tracks.forEach(track => {
        try {
          track.stop();
        } catch (e) {
          // Warning: Error force stopping track
        }
      });
      audioStreamRef.current = null;
    }
    
    // Disconnect everything
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {
        // Warning: Error force disconnecting processor
      }
      processorRef.current = null;
    }
    
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (e) {
        // Warning: Error force disconnecting source
      }
      sourceRef.current = null;
    }
    
    mediaRecorderRef.current = null;
  }, []);

  return {
    isRecording,
    isInitialized,
    error,
    startRecording,
    stopRecording,
    forceStopRecording,
    initializeAudio
  };
};
