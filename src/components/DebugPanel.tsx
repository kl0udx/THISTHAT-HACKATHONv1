import React, { useState, useEffect, useRef } from 'react';
import { Bug, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface DebugPanelProps {
  roomId: string;
  userId: string;
}

interface DebugLog {
  id: string;
  timestamp: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  details?: any;
}

export function DebugPanel({ roomId, userId }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isRecording, setIsRecording] = useState(true);
  const isLoggingRef = useRef(false);

  useEffect(() => {
    if (!isRecording) return;

    // Override console methods to capture logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const addLog = (type: DebugLog['type'], message: string, details?: any) => {
      // Prevent recursive calls that cause infinite loops
      if (isLoggingRef.current) {
        return;
      }

      try {
        isLoggingRef.current = true;
        
        const log: DebugLog = {
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          type,
          message,
          details
        };
        
        setLogs(prev => [...prev.slice(-19), log]); // Keep last 20 logs
      } finally {
        isLoggingRef.current = false;
      }
    };

    console.log = (...args) => {
      const message = args.join(' ');
      if (message.includes('ChatPanel:') || message.includes('TypingManager:') || 
          message.includes('subscription') || message.includes('Participant') ||
          message.includes('message') || message.includes('typing')) {
        addLog('info', message, args.length > 1 ? args.slice(1) : undefined);
      }
      originalLog.apply(console, args);
    };

    console.error = (...args) => {
      const message = args.join(' ');
      addLog('error', message, args.length > 1 ? args.slice(1) : undefined);
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      const message = args.join(' ');
      addLog('warning', message, args.length > 1 ? args.slice(1) : undefined);
      originalWarn.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, [isRecording]);

  const clearLogs = () => setLogs([]);

  const getIcon = (type: DebugLog['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-blue-500" />;
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 right-6 bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-full shadow-lg transition-colors z-50"
        title="Debug Console"
      >
        <Bug className="w-5 h-5" />
        {logs.filter(l => l.type === 'error').length > 0 && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div className="fixed top-6 right-6 w-96 max-h-[70vh] bg-white rounded-xl shadow-2xl border z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Debug Console</h3>
          <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`px-2 py-1 text-xs rounded ${
              isRecording ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {isRecording ? 'Recording' : 'Paused'}
          </button>
          <button
            onClick={clearLogs}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info Panel */}
      <div className="p-3 bg-blue-50 border-b text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="font-medium">Room:</span> {roomId.slice(0, 8)}...
          </div>
          <div>
            <span className="font-medium">User:</span> {userId.slice(0, 8)}...
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No debug logs yet</p>
            <p className="text-xs mt-1">Real-time events will appear here</p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`p-2 rounded-lg text-xs border-l-4 ${
                log.type === 'error' ? 'bg-red-50 border-red-500' :
                log.type === 'warning' ? 'bg-yellow-50 border-yellow-500' :
                log.type === 'success' ? 'bg-green-50 border-green-500' :
                'bg-blue-50 border-blue-500'
              }`}
            >
              <div className="flex items-start gap-2">
                {getIcon(log.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-gray-500">{log.timestamp}</span>
                  </div>
                  <p className="break-words">{log.message}</p>
                  {log.details && (
                    <pre className="mt-1 text-xs bg-white p-1 rounded overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-t bg-gray-50 rounded-b-xl">
        <div className="text-xs text-gray-600">
          <p className="font-medium mb-1">What to look for:</p>
          <ul className="space-y-1">
            <li>• "subscription status: SUBSCRIBED" = ✅ Connected</li>
            <li>• "New message received" = ✅ Real-time working</li>
            <li>• "Typing indicator change" = ✅ Typing sync</li>
            <li>• "Participant change detected" = ✅ User sync</li>
          </ul>
        </div>
      </div>
    </div>
  );
}