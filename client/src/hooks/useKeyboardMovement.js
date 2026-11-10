import { useEffect, useRef } from 'react';

export function useKeyboardMovement() {
  const keys = useRef({});

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't capture keys if typing in an input or textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const key = e.key.toLowerCase();
      // Prevent page scrolling on arrow keys or space
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        e.preventDefault();
      }
      keys.current[key] = true;
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      keys.current[key] = false;
    };

    const handleBlur = () => {
      // Clear all keys when window loses focus to prevent sticking movement
      keys.current = {};
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return keys;
}

export default useKeyboardMovement;
