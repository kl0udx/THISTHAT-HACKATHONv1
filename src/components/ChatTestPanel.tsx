import React, { useState } from 'react';
import { Users, MessageCircle, Send, AlertCircle, Keyboard } from 'lucide-react';
import { ChatService } from '../services/chatService';

interface ChatTestPanelProps {
  roomId: string;
  currentUserId: string;
}

export function ChatTestPanel({ roomId, currentUserId }: ChatTestPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState<string>('');
  const [lastSuccess, setLastSuccess] = useState<string>('');

  // Simulate different test users with valid UUIDs
  const testUsers = [
    { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Alice Bot', color: '#FF6B6B' },
    { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Bob Bot', color: '#4ECDC4' },
    { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Charlie Bot', color: '#45B7D1' },
  ];

  const clearMessages = () => {
    setLastError('');
    setLastSuccess('');
  };

  const addTestParticipant = async (userId: string, userName: string, userColor: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-test-participant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          roomId,
          userId,
          displayName: userName,
          userColor
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add test participant');
      }

      return await response.json();
    } catch (error) {
      console.error('Add participant error:', error);
      throw error;
    }
  };

  const sendTestMessage = async (userId: string, userName: string, message: string) => {
    try {
      setIsSending(true);
      clearMessages();
      
      // First, add the test user as a participant if they don't exist
      await addTestParticipant(userId, userName, testUsers.find(u => u.id === userId)?.color || '#666666');
      
      // Send the message
      await ChatService.sendMessage({
        roomId,
        userId,
        content: message,
      });

      setLastSuccess(`Message sent as ${userName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(`Failed to send message: ${errorMessage}`);
      console.error('Failed to send test message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const sendQuickTestMessages = async () => {
    const messages = [
      { user: testUsers[0], message: "Hey everyone! 👋" },
      { user: testUsers[1], message: "Hello! How's everyone doing?" },
      { user: testUsers[2], message: "Great to be here! This chat is working nicely." },
      { user: testUsers[0], message: "The real-time updates are so smooth!" },
    ];

    try {
      setIsSending(true);
      clearMessages();

      for (let i = 0; i < messages.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
        await sendTestMessage(messages[i].user.id, messages[i].user.name, messages[i].message);
      }

      setLastSuccess('Test conversation completed!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(`Failed to send test conversation: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  const testTypingIndicators = async () => {
    const testUser = testUsers[0];
    
    try {
      setIsSending(true);
      clearMessages();

      // First ensure the test user exists
      await addTestParticipant(testUser.id, testUser.name, testUser.color);
      
      setLastSuccess('Starting typing indicator test...');
      
      // Simulate typing for 5 seconds
      await ChatService.updatePresence(testUser.id, { isTyping: true });
      setLastSuccess('✅ Typing indicator started! Check the chat panel.');
      
      // Stop typing after 5 seconds and send message
      setTimeout(async () => {
        try {
          await ChatService.updatePresence(testUser.id, { isTyping: false });
          await sendTestMessage(testUser.id, testUser.name, "I was just typing! Did you see the indicator? ⌨️");
          setLastSuccess('✅ Typing test completed! The indicator should have appeared and disappeared.');
        } catch (error) {
          setLastError('Failed to complete typing test');
        } finally {
          setIsSending(false);
        }
      }, 5000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(`Failed to test typing: ${errorMessage}`);
      setIsSending(false);
    }
  };

  const testMultipleTyping = async () => {
    try {
      setIsSending(true);
      clearMessages();

      // Add all test users
      for (const user of testUsers) {
        await addTestParticipant(user.id, user.name, user.color);
      }

      setLastSuccess('Starting multiple typing indicators...');

      // Start typing for all users
      for (const user of testUsers) {
        await ChatService.updatePresence(user.id, { isTyping: true });
        await new Promise(resolve => setTimeout(resolve, 500)); // Stagger the typing
      }

      setLastSuccess('✅ Multiple users typing! Check the enhanced typing indicator.');

      // Stop typing one by one and send messages
      setTimeout(async () => {
        for (let i = 0; i < testUsers.length; i++) {
          const user = testUsers[i];
          await ChatService.updatePresence(user.id, { isTyping: false });
          await sendTestMessage(user.id, user.name, `Message from ${user.name}! 🎉`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        setLastSuccess('✅ Multiple typing test completed!');
        setIsSending(false);
      }, 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(`Failed to test multiple typing: ${errorMessage}`);
      setIsSending(false);
    }
  };

  const testChatHistory = async () => {
    try {
      setIsSending(true);
      clearMessages();
      
      const history = await ChatService.getChatHistory(roomId);
      setLastSuccess(`Loaded ${history.length} messages from chat history`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(`Failed to load chat history: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-24 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-colors z-50"
        title="Chat Testing Tools"
      >
        <Users className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-24 w-80 bg-white rounded-xl shadow-2xl border z-50 max-h-[60vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-green-50 rounded-t-xl sticky top-0">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-green-500" />
          <h3 className="font-semibold text-gray-900">Chat Testing</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Status Messages */}
        {lastError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-red-700 text-sm">{lastError}</p>
            </div>
          </div>
        )}

        {lastSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-green-700 text-sm">✓ {lastSuccess}</p>
          </div>
        )}

        <div>
          <h4 className="font-medium text-gray-900 mb-2">Quick Tests</h4>
          <div className="space-y-2">
            <button
              onClick={sendQuickTestMessages}
              disabled={isSending}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              {isSending ? 'Sending...' : 'Send Test Conversation'}
            </button>
            
            <button
              onClick={testTypingIndicators}
              disabled={isSending}
              className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Keyboard className="w-4 h-4" />
              Test Single Typing Indicator
            </button>

            <button
              onClick={testMultipleTyping}
              disabled={isSending}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Keyboard className="w-4 h-4" />
              Test Multiple Typing Indicators
            </button>

            <button
              onClick={testChatHistory}
              disabled={isSending}
              className="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              Test Chat History
            </button>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-900 mb-2">Custom Test Message</h4>
          <div className="space-y-2">
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Enter a test message..."
              className="w-full p-2 border border-gray-300 rounded-lg resize-none"
              rows={2}
            />
            
            <div className="grid grid-cols-1 gap-1">
              {testUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => sendTestMessage(user.id, user.name, testMessage || `Hello from ${user.name}!`)}
                  disabled={isSending}
                  className="flex items-center gap-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className="text-sm">Send as {user.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
          <p className="font-medium mb-1">🎯 Enhanced Typing Indicator Features:</p>
          <ul className="space-y-1">
            <li>• Beautiful blue background with animated dots</li>
            <li>• Shows user avatars for multiple typers</li>
            <li>• Appears in chat panel and as badge on chat button</li>
            <li>• Auto-cleanup after 12 seconds</li>
            <li>• Real-time sync across all browser tabs</li>
          </ul>
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
          <p className="font-medium mb-1">Debug Info:</p>
          <ul className="space-y-1">
            <li>• Room ID: {roomId.slice(0, 8)}...</li>
            <li>• Current User: {currentUserId.slice(0, 8)}...</li>
            <li>• Test users have valid UUIDs</li>
            <li>• Check debug panel (🐛) for detailed logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
}