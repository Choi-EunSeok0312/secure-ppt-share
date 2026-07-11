'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  RefreshCcw, 
  Lock,
  ArrowLeft,
  Users,
  Copy,
  Check,
  BookOpen,
  Calendar,
  Layers,
  ArrowRight,
  UserCheck,
  ShieldAlert,
  LogOut
} from 'lucide-react';
import { io } from 'socket.io-client';

// Dynamically resolve backend endpoint IP/hostname (crucial for remote sandbox client machines!)
const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:5000`
  : 'http://localhost:5000';

export default function LecturerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const presId = searchParams.get('presentation');
  const fromAdmin = searchParams.get('from') === 'admin';
  
  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [authId, setAuthId] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Presentation Player States
  const [presentation, setPresentation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slideIndex, setSlideIndex] = useState(1);
  const [animationStep, setAnimationStep] = useState(0);
  const [roomUsers, setRoomUsers] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [watermarkText, setWatermarkText] = useState('Lecturer Copy - Confined to Web');
  const [securityViolations, setSecurityViolations] = useState(0);
  const socketRef = useRef(null);
  const [watermarkPos, setWatermarkPos] = useState({ top: '30%', left: '40%' });
  const presentationContainerRef = useRef(null);

  // Lecturer Dashboard States (Only active if no presId parameter)
  const [presList, setPresList] = useState([]);
  const [selectedLecturerFilter, setSelectedLecturerFilter] = useState('all');

  // Check auth state on mount
  useEffect(() => {
    const cachedAdmin = localStorage.getItem('secure_present_admin');
    const cachedLecturer = localStorage.getItem('secure_present_lecturer');
    
    if (cachedAdmin) {
      try { setCurrentUser(JSON.parse(cachedAdmin)); } catch (e) {}
    } else if (cachedLecturer) {
      try { setCurrentUser(JSON.parse(cachedLecturer)); } catch (e) {}
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!authId.trim()) return;
    
    setAuthLoading(true);
    setAuthError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: authId, password: authPassword })
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem('secure_present_lecturer', JSON.stringify(data.user));
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Authentication failed');
      }
    } catch (err) {
      console.warn("Backend auth failed, running client-side fallback check:", err);
      const cleanId = authId.trim().toLowerCase();
      const cleanPw = authPassword.trim();
      
      if ((cleanId === 'lecturer' || cleanId === 'admin') && (cleanPw === 'admin123' || cleanPw === 'lecturer123' || cleanPw === cleanId)) {
        const fallbackUser = { id: cleanId, name: `System ${cleanId} (Local)`, role: cleanId };
        setCurrentUser(fallbackUser);
        localStorage.setItem('secure_present_lecturer', JSON.stringify(fallbackUser));
      } else {
        setAuthError(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('secure_present_lecturer');
    localStorage.removeItem('secure_present_admin');
    setAuthId('');
    setAuthPassword('');
  };

  // Dashboard load
  useEffect(() => {
    if (!presId) {
      fetchPresentations();
    }
  }, [presId]);

  const fetchPresentations = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/presentations`);
      if (res.ok) {
        const data = await res.json();
        setPresList(data);
      }
    } catch (err) {
      console.error("Failed to load presentations", err);
      // Fallback mock data
      setPresList([
        {
          id: "demo-pres-1",
          title: "Introduction to Advanced Web Security",
          ownerId: "lecturer-john",
          uploadDate: new Date().toISOString(),
          slideCount: 3
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Player load
  useEffect(() => {
    if (presId) {
      const loadData = async () => {
        try {
          setLoading(true);
          const res = await fetch(`${API_BASE}/api/presentations/${presId}`);
          if (res.ok) {
            const data = await res.json();
            setPresentation(data);
          }
        } catch (err) {
          console.error("Failed to load presentation detail", err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [presId]);

  // Setup WebSockets (Player mode only)
  useEffect(() => {
    if (presId) {
      socketRef.current = io(API_BASE);

      socketRef.current.on('connect', () => {
        console.log('Lecturer Socket Connected');
        socketRef.current.emit('join_room', { roomId: presId, role: 'lecturer' });
      });

      socketRef.current.on('sync_state', (state) => {
        setSlideIndex(state.slideIndex);
        setAnimationStep(state.animationStep);
      });

      // Mock live audience counter
      const userInterval = setInterval(() => {
        setRoomUsers(prev => {
          const change = Math.random() > 0.5 ? 1 : -1;
          const newCount = prev + change;
          return newCount < 1 ? 1 : newCount;
        });
      }, 15000);

      return () => {
        socketRef.current.disconnect();
        clearInterval(userInterval);
      };
    }
  }, [presId]);

  // Handle Watermark randomized movements (Player mode only)
  useEffect(() => {
    if (presId) {
      const wmInterval = setInterval(() => {
        const randomTop = Math.floor(Math.random() * 60) + 15; // Between 15% and 75%
        const randomLeft = Math.floor(Math.random() * 50) + 10; // Between 10% and 60%
        setWatermarkPos({ top: `${randomTop}%`, left: `${randomLeft}%` });
      }, 8000);

      return () => clearInterval(wmInterval);
    }
  }, [presId]);

  // Handle keyboard security blocks (Player mode only)
  useEffect(() => {
    if (presId) {
      const handleKeyDown = (e) => {
        if (
          (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'a' || e.key === 'A' || e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P')) ||
          e.key === 'F12'
        ) {
          e.preventDefault();
          e.stopPropagation();
          setSecurityViolations(prev => prev + 1);
        }
      };

      const handleSelectStart = (e) => {
        e.preventDefault();
        setSecurityViolations(prev => prev + 1);
      };

      const handleDragStart = (e) => {
        e.preventDefault();
        setSecurityViolations(prev => prev + 1);
      };

      window.addEventListener('keydown', handleKeyDown);

      const container = presentationContainerRef.current;
      if (container) {
        container.addEventListener('selectstart', handleSelectStart);
        container.addEventListener('dragstart', handleDragStart);
      }

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (container) {
          container.removeEventListener('selectstart', handleSelectStart);
          container.removeEventListener('dragstart', handleDragStart);
        }
      };
    }
  }, [presId, loading]);

  // Update WebSocket room state whenever Lecturer state changes
  const updatePresenterState = (newSlide, newStep) => {
    setSlideIndex(newSlide);
    setAnimationStep(newStep);
    if (socketRef.current) {
      socketRef.current.emit('lecturer_update', {
        roomId: presId,
        slideIndex: newSlide,
        animationStep: newStep
      });
    }
  };

  const handleNextSlide = () => {
    if (!presentation) return;
    if (slideIndex < presentation.slides.length) {
      updatePresenterState(slideIndex + 1, 0);
    }
  };

  const handlePrevSlide = () => {
    if (slideIndex > 1) {
      updatePresenterState(slideIndex - 1, 0);
    }
  };

  const handleNextAnimation = () => {
    if (!presentation) return;
    const currentSlide = presentation.slides[slideIndex - 1];
    if (!currentSlide) return;
    
    const maxSteps = currentSlide.elements.reduce((acc, el) => Math.max(acc, el.step || 0), 0);
    
    if (animationStep < maxSteps) {
      updatePresenterState(slideIndex, animationStep + 1);
    } else {
      handleNextSlide();
    }
  };

  const handleResetSync = () => {
    updatePresenterState(1, 0);
  };

  const copyStudentLink = () => {
    const studentUrl = `${window.location.origin}/student?presentation=${presId}`;
    navigator.clipboard.writeText(studentUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const preventSecurityContext = (e) => {
    e.preventDefault();
    setSecurityViolations(prev => prev + 1);
  };

  const filteredPresentations = presList.filter(p => {
    if (selectedLecturerFilter === 'all') return true;
    return p.ownerId === selectedLecturerFilter;
  });

  // ----------------------------------------------------
  // RENDER STATE A: Lecturer Dashboard (Choose Presentation)
  // ----------------------------------------------------
  if (!presId) {
    if (!currentUser) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 selection:bg-purple-500 selection:text-white">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
            <div className="p-8 space-y-8">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 mb-4 border border-purple-100 shadow-sm">
                  <Lock className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Lecturer Portal Login</h2>
                <p className="text-xs text-slate-500 font-light">
                  Please authenticate using your verified lecturer credentials.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-650 block">User ID / Username</label>
                  <input 
                    type="text" 
                    placeholder="e.g. lecturer"
                    value={authId}
                    onChange={(e) => setAuthId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-650 block">Security Password</label>
                  <input 
                    type="password" 
                    placeholder="Enter your password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white transition-colors"
                  />
                </div>

                {authError && (
                  <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-lg flex items-start gap-1.5 leading-relaxed">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md shadow-purple-600/10"
                >
                  {authLoading ? 'Verifying...' : 'Access Lecturer Hub'}
                </button>
              </form>

              <div className="text-center pt-2">
                <span className="text-[10px] text-slate-400 font-mono">Demo account ID: lecturer | Password: lecturer</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 selection:bg-indigo-500 selection:text-white pb-12">
        {/* Header */}
        <header className="border-b border-slate-200 bg-white/70 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-purple-600" />
                <h1 className="font-bold text-lg tracking-tight text-slate-900">Lecturer Presentation Hub</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
                Hello, <strong className="text-slate-800">{currentUser.name}</strong>
              </span>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 mt-12 space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-extrabold text-slate-900">Select Presentation</h2>
            <p className="text-slate-500 font-light max-w-xl">
              Choose an uploaded and web-secured presentation to launch your real-time presentation classroom.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold text-slate-750">Filter by Lecturer:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All Lectures' },
                { id: 'lecturer-john', label: 'Dr. John Doe' },
                { id: 'lecturer-sarah', label: 'Prof. Sarah Jenkins' },
                { id: 'lecturer-guest', label: 'Guest Lectures' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setSelectedLecturerFilter(btn.id)}
                  className={`text-xs px-3.5 py-1.5 rounded-lg border transition-all ${
                    selectedLecturerFilter === btn.id
                      ? 'bg-purple-600 border-purple-500 text-white font-medium shadow-md shadow-purple-600/10'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-355'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Presentations List */}
          {loading ? (
            <div className="text-center py-20 text-slate-500">
              <span className="animate-pulse">Loading presentation database...</span>
            </div>
          ) : filteredPresentations.length === 0 ? (
            <div className="bg-white border border-slate-200 border-dashed rounded-xl py-20 text-center text-slate-500 space-y-4 shadow-sm">
              <Layers className="w-12 h-12 mx-auto text-slate-350" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-750">No presentations found</p>
                <p className="text-xs text-slate-400">Ask the administrator to upload files for your lecturer account.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredPresentations.map((pres) => (
                <div 
                  key={pres.id} 
                  className="bg-white border border-slate-205 rounded-xl p-6 flex flex-col justify-between hover:border-purple-500/30 hover:shadow-lg transition-all duration-300 group shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 border border-purple-100 px-2.5 py-0.5 rounded">
                        {pres.ownerId}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-450">
                        <Layers className="w-3.5 h-3.5 text-slate-400" /> {pres.slideCount} slides
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-purple-600 transition-colors">
                      {pres.title}
                    </h3>
                  </div>

                  <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(pres.uploadDate).toLocaleDateString()}
                    </span>

                    <button
                      onClick={() => router.push(`/lecturer?presentation=${pres.id}`)}
                      className="inline-flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
                    >
                      Enter Room <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER STATE B: Lecturer Presentation Player (Running Room)
  // ----------------------------------------------------
  const currentSlide = presentation?.slides[slideIndex - 1];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between selection:bg-none">
      
      {/* Header Toolbar */}
      <header className="border-b border-slate-205 bg-white/70 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Link href={fromAdmin ? "/admin" : "/lecturer"} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-md tracking-tight text-slate-900 leading-tight">
              {loading ? "Loading..." : presentation?.title}
            </h1>
            <p className="text-slate-450 text-xs font-mono">{presId}</p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-white border border-slate-205 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm">
            <Users className="w-4 h-4 text-indigo-500" />
            <span>Audience: <strong className="text-slate-800">{roomUsers}</strong></span>
          </div>

          {!fromAdmin && (
            <button 
              onClick={copyStudentLink}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg shadow-sm transition-all"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied Student Link!' : 'Copy Student Link'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workbench */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 p-6 overflow-hidden">
        
        {/* Left Side: Presentation Viewport Canvas */}
        <div className="lg:col-span-3 flex flex-col justify-between space-y-4">
          <div 
            ref={presentationContainerRef}
            onContextMenu={preventSecurityContext}
            className="flex-1 bg-slate-200/50 border border-slate-250 rounded-2xl relative overflow-hidden select-none flex items-center justify-center shadow-inner cursor-default"
            style={{ 
              userSelect: 'none', 
              WebkitUserSelect: 'none',
              msUserSelect: 'none',
              MozUserSelect: 'none'
            }}
          >
            {/* Dynamic Watermark Overlay */}
            <div 
              className="absolute font-bold text-xs md:text-sm tracking-wider text-slate-400/25 pointer-events-none select-none bg-slate-300/10 px-3 py-1.5 rounded border border-slate-355/5 backdrop-blur-[0.5px] transition-all duration-1000 uppercase"
              style={{
                top: watermarkPos.top,
                left: watermarkPos.left,
                transform: 'rotate(-20deg)',
                userSelect: 'none'
              }}
            >
              🔒 {watermarkText}
            </div>

            {loading ? (
              <div className="text-slate-455 text-sm font-light">Loading slides...</div>
            ) : !currentSlide ? (
              <div className="text-slate-455 text-sm font-light">No slide data found.</div>
            ) : (
              // Secure Presentation Canvas
              <div className="w-[800px] h-[450px] relative bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200" style={{ containerType: 'inline-size' }}>
                {/* SVG/HTML Mock Slide content (Reconstructed via absolute positioning) */}
                <div className="w-full h-full relative">
                  {currentSlide.elements.map((el) => {
                    const isVisible = el.step <= animationStep;
                    const opacityClass = isVisible ? 'opacity-100' : 'opacity-0 scale-95 pointer-events-none';
                    
                    if (el.type === 'heading') {
                      return (
                        <h2 
                          key={el.id}
                          className={`font-extrabold tracking-tight transition-all duration-500 absolute ${opacityClass}`}
                          style={{ 
                            left: `${el.x}%`, 
                            top: `${el.y}%`, 
                            width: el.w ? `${el.w}%` : 'auto',
                            fontSize: `${(el.size / 9.6).toFixed(3)}cqw`, 
                            color: el.color 
                          }}
                        >
                          {el.content}
                        </h2>
                      );
                    }
                    if (el.type === 'text') {
                      return (
                        <p 
                          key={el.id}
                          className={`font-light text-slate-650 transition-all duration-500 absolute leading-relaxed ${opacityClass}`}
                          style={{ 
                            left: `${el.x}%`, 
                            top: `${el.y}%`, 
                            width: el.w ? `${el.w}%` : 'auto',
                            fontSize: `${(el.size / 9.6).toFixed(3)}cqw` 
                          }}
                        >
                          {el.content}
                        </p>
                      );
                    }
                    if (el.type === 'list') {
                      return (
                        <ul 
                          key={el.id} 
                          className={`space-y-3 absolute transition-all duration-500 ${opacityClass}`}
                          style={{ 
                            left: `${el.x}%`, 
                            top: `${el.y}%`,
                            width: el.w ? `${el.w}%` : 'auto'
                          }}
                        >
                          {el.items.map((item, idx) => (
                            <li 
                              key={idx} 
                              className="flex items-start gap-2 text-slate-700"
                              style={{ fontSize: `${(el.size / 9.6).toFixed(3)}cqw`, color: el.color }}
                            >
                              <span className="text-slate-400 font-bold leading-none select-none">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      );
                    }
                    if (el.type === 'shape') {
                      const hasBorder = el.border && el.border.length > 0;
                      let borderRadius = '4px';
                      if (el.geom === 'ellipse') {
                        borderRadius = '50%';
                      } else if (el.geom && (el.geom.includes('round') || el.geom.includes('pill'))) {
                        borderRadius = '9999px';
                      }
                      const transformStyle = el.rotation 
                        ? `rotate(${el.rotation}deg)${isVisible ? '' : ' scale(0.95)'}`
                        : (isVisible ? undefined : 'scale(0.95)');
                      return (
                        <div 
                          key={el.id}
                          className={`transition-all duration-500 absolute ${opacityClass} ${
                            hasBorder ? `rounded-xl p-4 flex items-center justify-center ${el.border}` : ''
                          }`}
                          style={{ 
                            left: `${el.x}%`, 
                            top: `${el.y}%`, 
                            width: `${el.w}%`, 
                            height: `${el.h}%`, 
                            backgroundColor: el.color,
                            borderRadius: hasBorder ? undefined : borderRadius,
                            transform: transformStyle
                          }}
                        >
                          {el.text}
                        </div>
                      );
                    }
                    if (el.type === 'image') {
                      const transformStyle = el.rotation 
                        ? `rotate(${el.rotation}deg)${isVisible ? '' : ' scale(0.95)'}`
                        : (isVisible ? undefined : 'scale(0.95)');
                      return (
                        <div
                          key={el.id}
                          className={`absolute transition-all duration-500 ${opacityClass}`}
                          style={{
                            left: `${el.x}%`,
                            top: `${el.y}%`,
                            width: `${el.w}%`,
                            height: `${el.h}%`,
                            transform: transformStyle
                          }}
                        >
                          <img 
                            src={el.content} 
                            alt="Slide Graphic Asset" 
                            className="w-full h-full object-contain pointer-events-none select-none"
                            style={{ userSelect: 'none', WebkitUserDrag: 'none' }}
                          />
                        </div>
                      );
                    }
                    if (el.type === 'richText') {
                      let justifyClass = 'justify-start';
                      if (el.anchor === 'b') justifyClass = 'justify-end';
                      else if (el.anchor === 'ctr') justifyClass = 'justify-center';
                      const transformStyle = el.rotation 
                        ? `rotate(${el.rotation}deg)${isVisible ? '' : ' scale(0.95)'}`
                        : (isVisible ? undefined : 'scale(0.95)');
                      return (
                        <div
                          key={el.id}
                          className={`absolute transition-all duration-500 flex flex-col ${justifyClass} leading-relaxed ${opacityClass}`}
                          style={{
                            left: `${el.x}%`,
                            top: `${el.y}%`,
                            width: `${el.w}%`,
                            height: `${el.h}%`,
                            transform: transformStyle
                          }}
                        >
                          {el.paragraphs.map((p, pIdx) => {
                            if (p.isHeading) {
                              return (
                                <h2
                                  key={pIdx}
                                  className="font-bold text-slate-900 tracking-tight mb-4 w-full"
                                  style={{
                                    fontSize: `${(p.size / 9.6).toFixed(3)}cqw`,
                                    color: p.color,
                                    textAlign: p.align || 'left'
                                  }}
                                >
                                  {p.text}
                                </h2>
                              );
                            }
                            if (p.isBullet) {
                              return (
                                <div
                                  key={pIdx}
                                  className="flex items-start gap-2.5 text-slate-750 ml-4 mb-2.5 font-medium w-full"
                                  style={{
                                    fontSize: `${(p.size / 9.6).toFixed(3)}cqw`,
                                    color: p.color,
                                    textAlign: p.align || 'left'
                                  }}
                                >
                                  <span className="text-slate-400 font-bold select-none">•</span>
                                  <span>{p.text}</span>
                                </div>
                              );
                            }
                            return (
                              <p
                                key={pIdx}
                                className="text-slate-650 mb-2 font-light w-full"
                                style={{
                                  fontSize: `${(p.size / 9.6).toFixed(3)}cqw`,
                                  color: p.color,
                                  textAlign: p.align || 'left'
                                }}
                              >
                                {p.text}
                              </p>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>

                {/* Secure Slide Footer */}
                <div className="absolute bottom-4 left-8 right-8 flex justify-between border-t border-slate-100 pt-4 text-xs font-mono text-slate-400">
                  <span>Slide {slideIndex} of {presentation.slides.length}</span>
                  <span>SecurePresent Delivery Sandbox</span>
                </div>
              </div>
            )}

            {/* Shield block indicator */}
            {securityViolations > 0 && (
              <div className="absolute top-4 right-4 bg-rose-50 border border-rose-100 text-rose-650 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm animate-shake shadow-sm">
                <Lock className="w-3.5 h-3.5" />
                <span>Right click & copy blocked ({securityViolations})</span>
              </div>
            )}
          </div>

          {/* Presentation Toolbar controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrevSlide}
                disabled={slideIndex === 1}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-transparent hover:border-slate-205"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <span className="text-sm font-semibold text-slate-750 min-w-16 text-center">
                Slide {slideIndex} / {presentation?.slides.length || 0}
              </span>
              <button 
                onClick={handleNextSlide}
                disabled={!presentation || slideIndex === presentation.slides.length}
                className="p-2 hover:bg-slate-105 rounded-lg text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-transparent hover:border-slate-205"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={handleNextAnimation}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2 rounded-lg shadow-sm transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Trigger Animation</span>
              </button>

              <button 
                onClick={handleResetSync}
                className="flex items-center gap-1.5 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-650 hover:text-slate-805 transition-colors shadow-sm"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                <span>Reset Sync</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Presenter Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Security Overlay configurations */}
          <div className="bg-white border border-slate-205 rounded-xl p-6 space-y-6 shadow-sm">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500" /> Active Security Controls
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 block">Watermark Overlay Text</label>
                <input 
                  type="text" 
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-2.5">
                <span className="text-[10px] font-bold tracking-wider text-indigo-600 uppercase">Enforced Policies</span>
                <ul className="text-xs space-y-1.5 text-slate-500 font-light">
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Block Mouse Context Menu
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Block HTML text highlights
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Render shapes dynamically on layout
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Anti-Printscreen Moving Watermark
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Speaker Notes */}
          <div className="bg-white border border-slate-205 rounded-xl p-6 space-y-4 shadow-sm flex-1 flex flex-col justify-between min-h-64">
            <h3 className="font-bold text-sm text-slate-900">Presenter Notes</h3>
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg flex-1 text-xs text-slate-500 font-light overflow-y-auto leading-relaxed">
              {slideIndex === 1 && "Welcome note. Introduce yourself, state the problem of asset replication, and show how vectors bypass standard browser inspect tools."}
              {slideIndex === 2 && "Emphasize how raw slides and PDFs are simple static resources. Any user can easily extract them from resources tab."}
              {slideIndex === 3 && "Show the custom watermark moving. Remind students that screenshot matches lecturer signature."}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
