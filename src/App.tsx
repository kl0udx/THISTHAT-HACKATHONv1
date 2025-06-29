import React, { useState, useEffect } from 'react';
import { Users, Plus, LogIn } from 'lucide-react';
import { CreateRoomForm } from './components/CreateRoomForm';
import { JoinRoomForm } from './components/JoinRoomForm';
import { RoomView } from './components/RoomView';

type ViewMode = 'home' | 'create' | 'join' | 'room';

interface UserSession {
  userId: string;
  displayName: string;
  userColor: string;
  roomCode?: string;
  roomId?: string;
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [userSession, setUserSession] = useState<UserSession | null>(null);

  // Load session from localStorage on app start
  useEffect(() => {
    const savedSession = localStorage.getItem('roomSession');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        setUserSession(session);
        if (session.roomCode) {
          setViewMode('room');
        }
      } catch (err) {
        localStorage.removeItem('roomSession');
      }
    }
  }, []);

  const handleRoomCreated = (roomData: any) => {
    const session: UserSession = {
      userId: roomData.userId,
      displayName: roomData.displayName,
      userColor: roomData.userColor,
      roomCode: roomData.roomCode,
      roomId: roomData.roomId
    };
    
    setUserSession(session);
    localStorage.setItem('roomSession', JSON.stringify(session));
    setViewMode('room');
  };

  const handleRoomJoined = (roomData: any) => {
    const session: UserSession = {
      userId: roomData.userId,
      displayName: roomData.displayName,
      userColor: roomData.userColor,
      roomCode: roomData.roomCode,
      roomId: roomData.roomId
    };
    
    setUserSession(session);
    localStorage.setItem('roomSession', JSON.stringify(session));
    setViewMode('room');
  };

  const handleLeaveRoom = () => {
    setUserSession(null);
    localStorage.removeItem('roomSession');
    setViewMode('home');
  };

  if (viewMode === 'room' && userSession?.roomCode) {
    return (
      <RoomView
        roomCode={userSession.roomCode}
        userId={userSession.userId}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50">
      <div className="container mx-auto px-4 py-8">
        {viewMode === 'home' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="bg-gradient-to-br from-purple-500 to-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Users className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">ThisThat</h1>
              <p className="text-lg text-gray-600 max-w-2xl">
                Create or join collaborative rooms with anonymous users. Perfect for quick team sessions, 
                workshops, or any group activity that needs real-time participation tracking.
              </p>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
              <button
                onClick={() => setViewMode('create')}
                className="group bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="bg-gradient-to-br from-purple-500 to-blue-600 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Create Room</h3>
                <p className="text-gray-600">
                  Start a new collaboration session and get a shareable room code
                </p>
              </button>

              <button
                onClick={() => setViewMode('join')}
                className="group bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="bg-gradient-to-br from-blue-500 to-teal-600 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <LogIn className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Join Room</h3>
                <p className="text-gray-600">
                  Enter a room code to join an existing collaboration session
                </p>
              </button>
            </div>

            {/* Features */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
              <div className="text-center">
                <div className="bg-white w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md">
                  <Users className="w-6 h-6 text-purple-500" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Anonymous Users</h4>
                <p className="text-sm text-gray-600">Join with fun generated names or customize your own</p>
              </div>
              
              <div className="text-center">
                <div className="bg-white w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Real-time Updates</h4>
                <p className="text-sm text-gray-600">See participants join and leave in real-time</p>
              </div>
              
              <div className="text-center">
                <div className="bg-white w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md">
                  <div className="text-blue-500 font-bold">24h</div>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Auto Expiry</h4>
                <p className="text-sm text-gray-600">Rooms automatically expire after 24 hours</p>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'create' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <button
              onClick={() => setViewMode('home')}
              className="self-start mb-8 text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Home
            </button>
            <CreateRoomForm onRoomCreated={handleRoomCreated} />
          </div>
        )}

        {viewMode === 'join' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <button
              onClick={() => setViewMode('home')}
              className="self-start mb-8 text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Home
            </button>
            <JoinRoomForm onRoomJoined={handleRoomJoined} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;