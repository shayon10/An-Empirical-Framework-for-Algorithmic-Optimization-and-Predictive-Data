'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ShoppingBag, X } from 'lucide-react';

const CATEGORY_ITEMS = [
  { label: '🔥 All Sneakers', value: 'All' },
  { label: 'Air Jordan Retro', value: 'Air Jordan Retro' },
  { label: 'Off-White Collabs', value: 'Off-White Collaborations' },
  { label: 'High-Top Basketball', value: 'High-Top Basketball' },
  { label: 'Performance & Running', value: 'Performance & Running' },
  { label: 'Streetwear Low-Tops', value: 'Streetwear Low-Tops' },
  { label: '⚡ Flash Drops', value: 'Limited Grails & Drops' }
];

export default function Navbar({ 
  cartCount = 0, 
  onOpenCart, 
  selectedCategory = 'All', 
  onCategorySelect,
  searchQuery = '',
  onSearchChange
}) {
  const router = useRouter();
  const [searchVal, setSearchVal] = useState(searchQuery);

  useEffect(() => {
    setSearchVal(searchQuery);
  }, [searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearchChange) {
      onSearchChange(searchVal.trim());
    } else {
      router.push(`/?search=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  const handleClearSearch = () => {
    setSearchVal('');
    if (onSearchChange) {
      onSearchChange('');
    }
  };

  const handleCategoryClick = (catVal) => {
    if (onCategorySelect) {
      onCategorySelect(catVal);
    } else {
      router.push(`/?category=${encodeURIComponent(catVal)}`);
    }
  };

  return (
    <>
      {/* Main E-Commerce Header (30% Black Luxury Bar) */}
      <header className="store-header">
        <div className="container store-header-inner">
          {/* Brand Logo */}
          <Link href="/" className="store-brand">
            <span>SNEAKER</span>
            <span style={{ color: 'var(--accent-yellow)' }}>PULSE</span>
            <span className="brand-badge">VAULT</span>
          </Link>

          {/* Omnipresent Working Search Bar */}
          <form className="header-search" onSubmit={handleSearchSubmit}>
            <select 
              className="search-category-select"
              value={selectedCategory}
              onChange={(e) => handleCategoryClick(e.target.value)}
            >
              <option value="All">All Categories</option>
              <option value="Air Jordan Retro">Air Jordan Retro</option>
              <option value="Off-White Collaborations">Off-White Collabs</option>
              <option value="High-Top Basketball">High-Top Basketball</option>
              <option value="Performance & Running">Performance & Running</option>
              <option value="Streetwear Low-Tops">Streetwear Low-Tops</option>
              <option value="Limited Grails & Drops">Flash Drops</option>
            </select>
            
            <input
              type="text"
              className="search-input-field"
              placeholder="Search 5,000+ verified sneakers (e.g. Jordan, Dunk, Off-White, Air Max)..."
              value={searchVal}
              onChange={(e) => {
                setSearchVal(e.target.value);
                if (onSearchChange) {
                  onSearchChange(e.target.value);
                }
              }}
            />

            {searchVal && (
              <button 
                type="button" 
                onClick={handleClearSearch}
                style={{ color: '#9CA3AF', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}

            <button type="submit" className="search-btn" aria-label="Search">
              <Search size={16} />
            </button>
          </form>

          {/* Action Icons */}
          <div className="header-actions">
            <button className="header-action-btn" onClick={onOpenCart} title="View Shopping Bag">
              <ShoppingBag size={18} />
              <span className="cart-count-badge">{cartCount}</span>
              <span style={{ marginLeft: 4 }}>Bag</span>
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Horizontal Category Bar (Instant In-Page Filter) */}
      <nav className="category-subnav">
        <div className="container">
          <div className="category-subnav-list">
            {CATEGORY_ITEMS.map((item) => {
              const isSelected = selectedCategory === item.value;
              return (
                <button
                  key={item.value}
                  className={`category-subnav-item ${isSelected ? 'highlight' : ''}`}
                  onClick={() => handleCategoryClick(item.value)}
                  style={{
                    color: isSelected ? '#FFFFFF' : item.value === 'Limited Grails & Drops' ? '#D97706' : undefined
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
