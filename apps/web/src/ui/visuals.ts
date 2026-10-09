import {
  Binoculars,
  Bird,
  Dices,
  Droplets,
  Feather,
  Flower2,
  Footprints,
  MapPin,
  Mountain,
  Sandwich,
  Sunset,
  Trees,
  WavesHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { Mood, PlaceKind } from '@ramble/shared';

/** One gradient + icon per kind of place, used on cards and pins. */
export const KIND_STYLE: Record<PlaceKind, { icon: LucideIcon; label: string; from: string; to: string; pin: string }> = {
  park: { icon: Trees, label: 'Park', from: '#6fa064', to: '#2f5a33', pin: '#2f5a33' },
  garden: { icon: Flower2, label: 'Garden', from: '#f2a7b8', to: '#c2577a', pin: '#c2577a' },
  reserve: { icon: Bird, label: 'Nature reserve', from: '#8fc0a0', to: '#2e6b55', pin: '#2e6b55' },
  viewpoint: { icon: Binoculars, label: 'Lookout', from: '#9cc8e4', to: '#3c6f98', pin: '#3c6f98' },
  water: { icon: Droplets, label: 'Water', from: '#8fd3e0', to: '#2c7d95', pin: '#2c7d95' },
  beach: { icon: WavesHorizontal, label: 'Beach', from: '#f7d79a', to: '#d39a3a', pin: '#c98a2a' },
  peak: { icon: Mountain, label: 'Summit', from: '#b8b4c9', to: '#5a5675', pin: '#5a5675' },
  trail: { icon: Footprints, label: 'Trail', from: '#d6b98f', to: '#8a6438', pin: '#8a6438' },
  picnic: { icon: Sandwich, label: 'Picnic spot', from: '#f6c27a', to: '#d9782b', pin: '#d9782b' },
  other: { icon: MapPin, label: 'Spot', from: '#c5d0c8', to: '#5c6b61', pin: '#5c6b61' },
};

export const MOOD_STYLE: Record<Mood, { icon: LucideIcon; label: string; blurb: string; from: string; to: string }> = {
  nature: { icon: Trees, label: 'Nature', blurb: 'Green & leafy', from: '#7fb26f', to: '#24502f' },
  views: { icon: Mountain, label: 'Views', blurb: 'Big skies', from: '#8fc3e3', to: '#2f5f8a' },
  quiet: { icon: Feather, label: 'Quiet', blurb: 'Slow & calm', from: '#c3b2e3', to: '#6a559c' },
  'golden-hour': { icon: Sunset, label: 'Golden hour', blurb: 'Chase the light', from: '#f9c06a', to: '#d9622b' },
  surprise: { icon: Dices, label: 'Surprise me', blurb: 'Anything goes', from: '#f49ac1', to: '#8f4dc4' },
};

export const gradient = (from: string, to: string) => `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
