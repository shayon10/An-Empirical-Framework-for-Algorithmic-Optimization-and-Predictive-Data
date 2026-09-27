'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Flame, Clock, ShoppingCart } from 'lucide-react';

export default function FlashDropCountdown({ onAddToCart }) {
  // Live ticking countdown timer
  const [timeLeft, setTimeLeft] = useState({ hours: 4, minutes: 28, seconds: 15 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return { hours: 4, minutes: 0, seconds: 0 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const flashItems = [
    {
      id: 3,
      name: "Off-White x Nike Blazer Mid 'All Hallows Eve'",
      price: 620.00,
      originalPrice: 780.00,
      discount: "20% OFF",
      image: "/images/products/shoe-3.jpg",
      stockLeft: 4,
      claimedPercent: 85
    },
    {
      id: 6,
      name: "Air Jordan 1 Retro High OG 'Chicago Lost & Found'",
      price: 340.00,
      originalPrice: 420.00,
      discount: "19% OFF",
      image: "/images/products/shoe-6.jpg",
      stockLeft: 2,
      claimedPercent: 92
    },
    {
      id: 5,
      name: "Nike Air Max Flyknit Dynamic 'Deep Navy Volt'",
      price: 175.00,
      originalPrice: 220.00,
      discount: "20% OFF",
      image: "/images/products/shoe-5.jpg",
      stockLeft: 7,
      claimedPercent: 78
    },
    {
      id: 7,
      name: "Cyber-Chunky Runner 'Tokyo Nightfall Edition'",
      price: 210.00,
      originalPrice: 280.00,
      discount: "25% OFF",
      image: "/images/products/shoe-7.jpg",
      stockLeft: 5,
      claimedPercent: 82
    }
  ];

  return (
    <section className="flash-drops-section scroll-reveal">
      <div className="flash-header">
        <div className="flash-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#D97706' }}>
            <Flame size={24} color="#D97706" />
            <h2 className="flash-title">FLASH DROPS</h2>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Limited allocation reserved for verified members
          </span>
        </div>

        {/* Live Countdown Display: Black Box with Yellow Digits */}
        <div className="countdown-box" suppressHydrationWarning>
          <span style={{ color: '#9CA3AF', fontSize: '0.75rem', marginRight: 4 }}>ENDS IN:</span>
          <span className="countdown-digit" suppressHydrationWarning>{String(timeLeft.hours).padStart(2, '0')}h</span>
          <span style={{ color: 'var(--accent-yellow)', fontWeight: 800 }}>:</span>
          <span className="countdown-digit" suppressHydrationWarning>{String(timeLeft.minutes).padStart(2, '0')}m</span>
          <span style={{ color: 'var(--accent-yellow)', fontWeight: 800 }}>:</span>
          <span className="countdown-digit" suppressHydrationWarning>{String(timeLeft.seconds).padStart(2, '0')}s</span>
        </div>
      </div>

      {/* 4 Flash Cards Grid (60% White / 30% Black / 5% Green / 5% Yellow) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {flashItems.map((item) => (
          <div key={item.id} className="sneaker-card" style={{ padding: '0.85rem' }}>
            <div style={{ position: 'relative', height: '170px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '0.85rem', background: '#F3F4F6' }}>
              <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.5rem' }} />
              <span className="card-discount-badge">{item.discount}</span>
            </div>

            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem', height: '38px', overflow: 'hidden', color: '#0A0A0A' }}>
              {item.name}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.65rem' }}>
              <span style={{ fontFamily: 'var(--font-sport)', fontStyle: 'italic', fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#0A0A0A' }}>
                ${item.price.toFixed(2)}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                ${item.originalPrice.toFixed(2)}
              </span>
            </div>

            {/* Inventory progress bar: 5% Green */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                <span>Claimed: {item.claimedPercent}%</span>
                <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{item.stockLeft} left in vault</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${item.claimedPercent}%`, height: '100%', background: 'var(--accent-green)' }} />
              </div>
            </div>

            <button
              className="btn-add-cart"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => onAddToCart && onAddToCart(item)}
            >
              <ShoppingCart size={14} />
              <span>Claim Pair</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
