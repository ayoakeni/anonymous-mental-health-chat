// src/hooks/useNotificationSound.js
import { useEffect, useRef, useState } from 'react';
import Notification from '../sounds/notification.mp3';

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
      sound.src = '';
    };
  }, []);

  // Unlock audio on first user gesture (bypasses autoplay blocks)
  useEffect(() => {
    const unlock = () => {
      const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='); // Silent base64
      silent.play().then(() => {
        unlockedRef.current = true;
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
      }).catch(() => {});
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock); // For mobile

    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Play sound if unlocked and audio ready
  const playIfNew = () => {
    if (audio && unlockedRef.current) {
      audio.currentTime = 0; // Rewind
      audio.play().catch((err) => console.warn('Sound play failed (possibly muted tab):', err));
    }
  };

  return playIfNew;
};

export default useNotificationSound;