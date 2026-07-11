'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  Lock,
  ArrowLeft,
  Users
} from 'lucide-react';
import { io } from 'socket.io-client';

// Dynamically resolve backend endpoint IP/hostname (crucial for remote sandbox client machines!)
const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:5000`
  : 'http://localhost:5000';

export default function StudentPage() {
  const searchParams = useSearchParams();
  const presId = searchParams.get('presentation') || 'demo-pres-1';
  
  const [presentation, setPresentation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slideIndex, setSlideIndex] = useState(1);
  const [animationStep, setAnimationStep] = useState(0);
  const [syncStatus, setSyncStatus] = useState('connecting'); // connecting, synced, disconnected
  const [securityViolations, setSecurityViolations] = useState(0);
  const socketRef = useRef(null);

  // Floating Watermark position state (for anti-screenshot protection)
  const [watermarkPos, setWatermarkPos] = useState({ top: '40%', left: '30%' });
  const [watermarkText, setWatermarkText] = useState('Student Copy - Confined to Web');

  // Presentation screen container ref
  const presentationContainerRef = useRef(null);

  // Load Converted Slide Data
  useEffect(() => {
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
  }, [presId]);

  // Setup Socket.io client and sync state
  useEffect(() => {
    socketRef.current = io(API_BASE);

    socketRef.current.on('connect', () => {
      setSyncStatus('synced');
      console.log('Student Socket Connected successfully.');
      socketRef.current.emit('join_room', { roomId: presId, role: 'student' });
    });

    socketRef.current.on('sync_state', (state) => {
      console.log('Received sync state from Lecturer:', state);
      setSlideIndex(state.slideIndex);
      setAnimationStep(state.animationStep);
    });

    socketRef.current.on('disconnect', () => {
      setSyncStatus('disconnected');
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [presId]);

  // Handle Watermark moving animation to block screen records
  useEffect(() => {
    const wmInterval = setInterval(() => {
      const randomTop = Math.floor(Math.random() * 60) + 15;
      const randomLeft = Math.floor(Math.random() * 50) + 10;
      setWatermarkPos({ top: `${randomTop}%`, left: `${randomLeft}%` });
    }, 6000);

    return () => clearInterval(wmInterval);
  }, []);

  // Enforce Anti-Screenshot, print, inspect keys
  useEffect(() => {
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
  }, [loading]);

  const preventSecurityContext = (e) => {
    e.preventDefault();
    setSecurityViolations(prev => prev + 1);
  };

  const currentSlide = presentation?.slides[slideIndex - 1];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between selection:bg-none">
      
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-md tracking-tight text-slate-900 leading-tight">
              {loading ? "Loading Session..." : presentation?.title}
            </h1>
            <p className="text-slate-450 text-xs font-light">Interactive Student Sandbox View</p>
          </div>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-3">
          {syncStatus === 'synced' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg font-semibold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Live Sync Active
            </span>
          )}
          {syncStatus === 'connecting' && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-105 px-3 py-1.5 rounded-lg font-semibold shadow-sm">
              Connecting...
            </span>
          )}
          {syncStatus === 'disconnected' && (
            <span className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-lg font-semibold shadow-sm">
              Sync Offline
            </span>
          )}
        </div>
      </header>

      {/* Main Viewport Grid */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
        
        {/* Presentation Viewport */}
        <div className="w-full max-w-4xl flex flex-col space-y-4">
          
          <div 
            ref={presentationContainerRef}
            onContextMenu={preventSecurityContext}
            className="w-full aspect-[16/9] bg-slate-200/50 border border-slate-250 rounded-2xl relative overflow-hidden flex items-center justify-center shadow-inner cursor-default"
            style={{ 
              userSelect: 'none', 
              WebkitUserSelect: 'none',
              msUserSelect: 'none',
              MozUserSelect: 'none'
            }}
          >
            {/* Dynamic Anti-Screenshot Watermark */}
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
              <div className="text-slate-455 text-sm font-light">Waiting for presentation data...</div>
            ) : (
              // Secure Presentation Canvas (Scaled for student display)
              <div className="w-[800px] h-[450px] relative bg-white rounded-xl shadow-lg p-8 overflow-hidden border border-slate-200 scale-90 md:scale-100 transition-transform">
                
                {/* SVG/HTML Content Reconstructed absolutely */}
                <div className="relative w-full h-[360px]">
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
                            fontSize: `${el.size}px`, 
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
                            fontSize: `${el.size}px` 
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
                              style={{ fontSize: `${el.size}px`, color: el.color }}
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
                          className={`absolute transition-all duration-500 flex flex-col ${justifyClass} text-left leading-relaxed ${opacityClass}`}
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
                                  className="font-bold text-slate-900 tracking-tight mb-4"
                                  style={{
                                    fontSize: `${p.size}px`,
                                    color: p.color
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
                                  className="flex items-start gap-2.5 text-slate-750 ml-4 mb-2.5 font-medium"
                                  style={{
                                    fontSize: `${p.size}px`,
                                    color: p.color
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
                                className="text-slate-650 mb-2 font-light"
                                style={{
                                  fontSize: `${p.size}px`,
                                  color: p.color
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
                  <span>Confined Web Presentation Copy</span>
                </div>
              </div>
            )}

            {/* Warning indicator */}
            {securityViolations > 0 && (
              <div className="absolute top-4 right-4 bg-rose-50 border border-rose-100 text-rose-600 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm animate-pulse shadow-sm">
                <Lock className="w-3.5 h-3.5" />
                <span>Intellectual Property Protection Active ({securityViolations})</span>
              </div>
            )}
          </div>

          {/* Sync indicator footer text */}
          <div className="text-center text-xs text-slate-500 font-light flex items-center justify-center gap-2">
            <span>Slide changes and animations will progress automatically as the lecturer advances.</span>
          </div>

        </div>

      </main>
    </div>
  );
}
