'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import globalTracker from '../lib/metrics/performanceTracker';
import globalPrefetcher from '../lib/prefetch/hoverIntent';
import { 
  Zap, Activity, Sliders, X, Wifi, Download, 
  RefreshCw, Layers 
} from 'lucide-react';

export default function MetricsHUD() {
  const [metrics, setMetrics] = useState(globalTracker.getSummary());
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [dwell, setDwell] = useState(100);
  const [toastMessage, setToastMessage] = useState('');
  const popupRef = useRef(null);

  useEffect(() => {
    const unsub = globalTracker.subscribe((updated) => {
      setMetrics(updated);
    });
    setMetrics(globalTracker.getSummary());
    return unsub;
  }, []);

  // Handle clicking outside popup to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setIsPopupOpen(false);
      }
    }
    if (isPopupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopupOpen]);

  const handleToggleMode = (newMode) => {
    globalTracker.setMode(newMode);
    const label = newMode === 'OPTIMIZED' ? 'SWR_PREFETCH (Predictive)' : 'BASELINE (Normal)';
    setToastMessage(`MODE: ${label}`);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleDwellChange = (e) => {
    const val = Number(e.target.value);
    setDwell(val);
    globalPrefetcher.setDwellThreshold(val);
  };

  const handleNetworkChange = (e) => {
    globalTracker.setNetworkProfile(e.target.value);
    setToastMessage(`NETWORK: ${e.target.value}`);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const isSWR = metrics.mode === 'OPTIMIZED';

  return (
    <>
      {/* Toast Notification when switching modes */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#000000',
          color: '#FFFFFF',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '6px',
          padding: '0.65rem 1.25rem',
          fontSize: '0.82rem',
          fontWeight: 800,
          fontFamily: 'var(--font-heading)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          textTransform: 'uppercase'
        }}>
          {isSWR ? <Zap size={14} color="#F59E0B" /> : <Layers size={14} color="#FFFFFF" />}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Right-End Side Middle Position Dock (Seamlessly Blended with White/Black Design) */}
      <div 
        id="prefetch-engine-dock"
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {/* Slide-out Dwell Threshold & Network Simulator Popup (Blends cleanly with website) */}
        {isPopupOpen && (
          <div 
            ref={popupRef}
            style={{
              width: '310px',
              background: '#FFFFFF',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              boxShadow: '-10px 20px 45px rgba(0, 0, 0, 0.15)',
              padding: '1.35rem',
              marginRight: '0.85rem',
              fontFamily: 'var(--font-body)',
              color: '#0A0A0A'
            }}
          >
            {/* Popup Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.6rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 800, color: '#0A0A0A', textTransform: 'uppercase' }}>
                <Sliders size={14} />
                <span>FILTER SETTINGS (τ)</span>
              </div>
              <button 
                onClick={() => setIsPopupOpen(false)}
                style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Dwell Threshold (τ) Slider */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                <span style={{ color: '#4B5563' }}>Hover Dwell Threshold (τ):</span>
                <strong style={{ color: '#0A0A0A', fontWeight: 800 }}>{dwell} ms</strong>
              </div>
              <input
                type="range"
                min="40"
                max="300"
                step="10"
                value={dwell}
                onChange={handleDwellChange}
                style={{ width: '100%', accentColor: '#000000', cursor: 'pointer' }}
              />
              <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: '0.35rem', lineHeight: 1.4 }}>
                Cursor must dwell over product for &gt;{dwell}ms to trigger background prefetch.
              </div>
            </div>

            {/* Network Latency Simulator */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#4B5563', marginBottom: '0.4rem' }}>
                <Wifi size={13} color="#0A0A0A" />
                <span>Simulated Latency:</span>
              </div>
              <select
                value={metrics.networkProfile}
                onChange={handleNetworkChange}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  background: '#F9FAFB',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#0A0A0A',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="Broadband">Standard Broadband (15ms RTT)</option>
                <option value="Fast 4G">Fast 4G Mobile (85ms RTT)</option>
                <option value="Throttled 3G">Throttled 3G Cellular (380ms RTT)</option>
              </select>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => globalTracker.exportCSV()}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem',
                  background: '#000000',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textTransform: 'uppercase'
                }}
              >
                <Download size={13} />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => globalTracker.resetAll()}
                style={{
                  padding: '0.6rem 0.85rem',
                  background: '#F3F4F6',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#0A0A0A',
                  cursor: 'pointer'
                }}
                title="Reset session"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
        )}

        {/* The Vertical Dock Toolbar: Refined Frosted Charcoal/Obsidian Glass That Blends In Naturally */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderTopLeftRadius: '14px',
          borderBottomLeftRadius: '14px',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          borderRight: 'none',
          boxShadow: '-4px 8px 30px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
          padding: '0.85rem 0.55rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.6rem',
          width: '92px'
        }}>
          {/* Header Label: PREFETCH ENGINE */}
          <div style={{
            fontSize: '0.52rem',
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: '#6B7280',
            textAlign: 'center',
            textTransform: 'uppercase',
            paddingBottom: '0.15rem'
          }}>
            PREFETCH<br />ENGINE
          </div>

          {/* Model Switcher: SWR_PREFETCH vs BASELINE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
            {/* Mode 1: SWR_PREFETCH */}
            <button
              onClick={() => handleToggleMode('OPTIMIZED')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.45rem 0.3rem',
                borderRadius: '8px',
                background: isSWR ? '#000000' : 'transparent',
                border: isSWR ? '1px solid #000000' : '1px solid transparent',
                color: isSWR ? '#FFFFFF' : '#4B5563',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="SWR_PREFETCH (Predictive Instant)"
            >
              <Zap size={14} color={isSWR ? '#F59E0B' : '#6B7280'} />
              <span style={{ fontSize: '0.52rem', fontWeight: 800, marginTop: 2, textAlign: 'center', lineHeight: 1.1 }}>
                SWR_PREFETCH
              </span>
              {isSWR && (
                <span style={{
                  fontSize: '0.46rem',
                  background: '#F59E0B',
                  color: '#000000',
                  fontWeight: 900,
                  borderRadius: '2px',
                  padding: '1px 3px',
                  marginTop: '2px'
                }}>
                  ACTIVE
                </span>
              )}
            </button>

            {/* Mode 2: BASELINE */}
            <button
              onClick={() => handleToggleMode('BASELINE')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.45rem 0.3rem',
                borderRadius: '8px',
                background: !isSWR ? '#000000' : 'transparent',
                border: !isSWR ? '1px solid #000000' : '1px solid transparent',
                color: !isSWR ? '#FFFFFF' : '#4B5563',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="BASELINE (On-Demand Normal)"
            >
              <Layers size={14} color={!isSWR ? '#FFFFFF' : '#6B7280'} />
              <span style={{ fontSize: '0.52rem', fontWeight: 800, marginTop: 2, textAlign: 'center', lineHeight: 1.1 }}>
                BASELINE
              </span>
              {!isSWR && (
                <span style={{
                  fontSize: '0.46rem',
                  background: '#FFFFFF',
                  color: '#000000',
                  fontWeight: 900,
                  borderRadius: '2px',
                  padding: '1px 3px',
                  marginTop: '2px'
                }}>
                  ACTIVE
                </span>
              )}
            </button>
          </div>

          <div style={{ width: '80%', height: '1px', background: 'rgba(0,0,0,0.08)' }} />

          {/* Benchmark Cockpit Direct Link Button */}
          <Link
            href="/benchmark-dashboard"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.45rem 0.3rem',
              width: '100%',
              borderRadius: '8px',
              background: '#F3F4F6',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              color: '#0A0A0A',
              cursor: 'pointer',
              textDecoration: 'none',
              transition: 'all 0.15s ease'
            }}
            title="Open Benchmark Cockpit"
          >
            <Activity size={14} color="#0A0A0A" />
            <span style={{ fontSize: '0.54rem', fontWeight: 800, marginTop: 2, textAlign: 'center', lineHeight: 1.1, color: '#0A0A0A' }}>
              COCKPIT
            </span>
          </Link>

          <div style={{ width: '80%', height: '1px', background: 'rgba(0,0,0,0.08)' }} />

          {/* Speed Telemetry Readout */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            width: '100%'
          }}>
            <span style={{ fontSize: '0.5rem', color: '#6B7280', fontWeight: 700 }}>SPEED</span>
            <span style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              color: metrics.lastLatencyMs < 50 ? '#059669' : '#0A0A0A'
            }}>
              {metrics.lastLatencyMs}ms
            </span>
          </div>

          <div style={{ width: '80%', height: '1px', background: 'rgba(0,0,0,0.08)' }} />

          {/* Dwell Threshold Filter (τ) Popup Trigger Button */}
          <button
            onClick={() => setIsPopupOpen(!isPopupOpen)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.35rem',
              width: '100%',
              borderRadius: '6px',
              background: isPopupOpen ? '#000000' : 'transparent',
              color: isPopupOpen ? '#FFFFFF' : '#6B7280',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Filter Settings (τ)"
          >
            <Sliders size={13} />
            <span style={{ fontSize: '0.52rem', fontWeight: 700, marginTop: 2 }}>
              τ FILTER
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
