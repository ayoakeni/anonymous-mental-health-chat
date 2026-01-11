import { useEffect, useRef, useState, useCallback } from 'react';
import Notification from '../assets/sounds/notification.mp3';

const useNotificationSound = () => {
  const [audio, setAudio] = useState(null);
  const unlockedRef = useRef(false);

  // Pre-load audio and wait for readiness
  useEffect(() => {
    const sound = new Audio(Notification);
    sound.volume = 0.5; // Adjustable volume (0-1)
    sound.preload = 'auto';

    const onCanPlay = () => setAudio(sound);
    sound.addEventListener('canplaythrough', onCanPlay);

    return () => {
      sound.removeEventListener('canplaythrough', onCanPlay);
      sound.pause();
      sound.src = ''; // Free up resources
    };
  }, []);

  // Unlock audio on first user gesture (bypasses autoplay restrictions)
  useEffect(() => {
    const unlock = () => {
      const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='); // Silent base64
      silent.play().then(() => {
        unlockedRef.current = true;
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
      }).catch(() => {
        // Suppress errors for silent audio (e.g., user hasn't interacted yet)
      });
    };

    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock); // For mobile

    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Memoized function to play sound if unlocked and audio is ready
  const playNotification = useCallback(() => {
    if (audio && unlockedRef.current) {
      audio.currentTime = 0; // Rewind to start
      audio.play().catch((err) => console.warn('Failed to play notification sound:', err));
    }
  }, [audio]);

  return playNotification;
};

export default useNotificationSound;