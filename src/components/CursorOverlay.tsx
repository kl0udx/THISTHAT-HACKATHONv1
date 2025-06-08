import React, { useState, useEffect } from 'react';
import { CursorPosition } from '../services/cursorService';

interface CursorOverlayProps {
  cursors: CursorPosition[];
  currentUserId: string;
}

interface AnimatedCursor extends CursorPosition {
  isMoving: boolean;
  lastMoveTime: number;
}

export function CursorOverlay({ cursors, currentUserId }: CursorOverlayProps) {
  const [animatedCursors, setAnimatedCursors] = useState<AnimatedCursor[]>([]);

  useEffect(() => {
    const now = Date.now();
    
    setAnimatedCursors(prev => {
      const updated = cursors
        .filter(cursor => cursor.userId !== currentUserId && cursor.isOnline)
        .map(cursor => {
          const existing = prev.find(c => c.userId === cursor.userId);
          const isMoving = !existing || existing.x !== cursor.x || existing.y !== cursor.y;
          
          return {
            ...cursor,
            isMoving,
            lastMoveTime: isMoving ? now : (existing?.lastMoveTime || now)
          };
        });

      return updated;
    });
  }, [cursors, currentUserId]);

  // Auto-hide cursors that haven't moved in 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setAnimatedCursors(prev => 
        prev.filter(cursor => now - cursor.lastMoveTime < 10000)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {animatedCursors.map((cursor) => (
        <div
          key={cursor.userId}
          className="absolute transition-all duration-100 ease-out"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: 'translate(-2px, -2px)'
          }}
        >
          {/* Cursor pointer */}
          <div className="relative">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              className="drop-shadow-lg"
            >
              <path
                d="M2 2L18 8L8 12L2 18L2 2Z"
                fill={cursor.userColor}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            
            {/* User label */}
            <div
              className="absolute top-5 left-2 px-2 py-1 rounded-md text-xs font-medium text-white shadow-lg whitespace-nowrap animate-fade-in"
              style={{ backgroundColor: cursor.userColor }}
            >
              <div className="flex items-center gap-1">
                <span>{cursor.avatarEmoji}</span>
                <span>{cursor.displayName}</span>
                {cursor.platform && (
                  <span className="opacity-75 text-xs">
                    • {cursor.platform}
                  </span>
                )}
              </div>
            </div>

            {/* Movement indicator */}
            {cursor.isMoving && (
              <div
                className="absolute -top-1 -left-1 w-6 h-6 rounded-full animate-ping opacity-30"
                style={{ backgroundColor: cursor.userColor }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}